-- 035 (01-11). PM: "lo de los 100 de los 8 se hara automaticamente: quitara 100 automaticamente y se pondra en un bote con
-- animacion"; "solo contara apostar en partidos, no abrir cajas, crash, cara o cruz ni ninguna otra cosa"; y el ratio son las
-- mejores apuestas: "si yo voy a una de x7, aunque haya apostado 50 he ganado un monton mas, asi que sera mejor que 560 en
-- apuestas de 1,23".
-- 1) Cada lunes (desde bote_desde) el sincronizador mete en el bote de esa semana 100 de cada jugador que tenga 100 o mas
--    (despues de la paga del lunes, que va antes en sync_close). join_bote sigue existiendo pero ya no hace falta.
-- 2) bote_neto cuenta apuestas sueltas Y combinadas (ganadas, perdidas y retiradas). Nada de juegos, cajas ni mercado.
-- 3) El premio de "mejor ratio" pasa a ser la apuesta suelta acertada con la cuota mas alta de la semana (si empatan, la que
--    mas gano; luego la primera que se cobro). Mismo premio (premio_ratio, 100) y misma nota, para no romper trofeos ni la app.
-- Redefine bote_neto y bote_semanal de 032 sin tocar lo demas. Se puede ejecutar varias veces. Va despues de 001 a 034.

create or replace function bote_neto(p uuid, wk date) returns int language sql stable set search_path = public as $$
  select (
    coalesce((select sum(case when status in ('won', 'cashout') then payout - stake when status = 'lost' then -stake else 0 end) from bets
               where player = p and settled_at >= (wk::timestamp at time zone 'Europe/Madrid') and settled_at < ((wk + 7)::timestamp at time zone 'Europe/Madrid')), 0)
  + coalesce((select sum(case when status in ('won', 'cashout') then payout - stake when status = 'lost' then -stake else 0 end) from combos
               where player = p and settled_at >= (wk::timestamp at time zone 'Europe/Madrid') and settled_at < ((wk + 7)::timestamp at time zone 'Europe/Madrid')), 0)
  )::int
$$;

create or replace function bote_semanal() returns int
language plpgsql security definer set search_path = public as $$
declare
  wk date := madrid_week(); prev date := madrid_week() - 7;
  pot int; best int; ganadores uuid[]; parte int; nombres text; n int := 0; r record; txt text := ''; k int := 0;
  amt int := coalesce((select (value #>> '{}')::int from settings where key = 'bote_amount'), 100);
  desde date := (select (value #>> '{}')::date from settings where key = 'bote_desde');
  pd int := coalesce((select (value #>> '{}')::int from settings where key = 'premio_dinero'), 200);
  pr int := coalesce((select (value #>> '{}')::int from settings where key = 'premio_ratio'), 100);
  pc int := coalesce((select (value #>> '{}')::int from settings where key = 'premio_combinada'), 300);
begin
  -- 0) el bote de ESTA semana se llena solo: 100 de cada uno que los tenga (una vez por jugador y semana: indice ledger_one_bote)
  if desde is null or wk >= desde then
    for r in select p.id from players p order by p.created_at, p.id loop
      perform pg_advisory_xact_lock(hashtext(r.id::text));          -- el mismo candado que place_bet: no se cruza con una apuesta
      if not exists (select 1 from ledger where player = r.id and kind = 'bote' and week = wk)
         and (select coalesce(sum(amount), 0) from ledger where player = r.id) >= amt then
        insert into ledger(player, amount, kind, note, week) values (r.id, -amt, 'bote', 'Bote de la semana', wk)
        on conflict (player, week) where kind = 'bote' do nothing;
        if found then k := k + 1; end if;
      end if;
    end loop;
    if k > 0 then
      pot := -(select coalesce(sum(amount), 0) from ledger where kind = 'bote' and week = wk);
      insert into chat(body) values ('Bote de la semana: ' || k || case when k = 1 then ' pone ' else ' ponen ' end || fmt_int(amt)
        || ' y ya hay ' || fmt_int(pot) || '. Se lo lleva el que más gane apostando en partidos hasta el domingo');
      perform bump();
    end if;
  end if;

  if prev < (select (value #>> '{}')::date from settings where key = 'season_start') then return k; end if;
  -- 1) el bote de la semana pasada, una sola vez
  if not exists (select 1 from ledger where kind = 'bote_gana' and week = prev) then
    pot := -(select coalesce(sum(amount), 0) from ledger where kind = 'bote' and week = prev);
    if pot > 0 then
      select max(bote_neto(player, prev)) into best from ledger where kind = 'bote' and week = prev;
      select array_agg(player) into ganadores from ledger where kind = 'bote' and week = prev and bote_neto(player, prev) = best;
      parte := pot / array_length(ganadores, 1);
      insert into ledger(player, amount, kind, note, week) select g, parte, 'bote_gana', 'Bote de la semana', prev from unnest(ganadores) g
      on conflict (player, week) where kind = 'bote_gana' do nothing;
      select string_agg(name, ' y ') into nombres from players where id = any(ganadores);
      txt := 'Bote: ' || nombres || ' se lleva ' || fmt_int(pot);
      n := n + 1;
    end if;
  end if;
  -- 2) premios de la semana pasada, una sola vez
  if not exists (select 1 from ledger where kind = 'premio_semana' and week = prev) then
    -- mas dinero (solo apuestas en partidos: bote_neto)
    select p.id, bote_neto(p.id, prev) v into r from players p order by 2 desc, p.name limit 1;
    if r.v > 0 then
      insert into ledger(player, amount, kind, note, week) values (r.id, pd, 'premio_semana', 'Más dinero de la semana', prev) on conflict do nothing;
      txt := txt || case when txt = '' then '' else ' · ' end || 'más dinero: ' || pname(r.id) || ' +' || fmt_int(pd);
      n := n + 1;
    end if;
    -- 035: mejor apuesta = la suelta acertada con la cuota mas alta (antes era beneficio entre lo apostado)
    select b.player id, b.odds v, b.stake s into r from bets b
     where b.status = 'won' and b.settled_at >= (prev::timestamp at time zone 'Europe/Madrid') and b.settled_at < (wk::timestamp at time zone 'Europe/Madrid')
     order by b.odds desc, (b.payout - b.stake) desc, b.settled_at limit 1;
    if found then
      insert into ledger(player, amount, kind, note, week) values (r.id, pr, 'premio_semana', 'Mejor ratio de la semana', prev) on conflict do nothing;
      txt := txt || case when txt = '' then '' else ' · ' end || 'mejor apuesta: ' || pname(r.id) || ' a cuota ' || fmt_odds(r.v) || ' +' || fmt_int(pr);
      n := n + 1;
    end if;
    -- 032: la combinada acertada con la cuota mas alta de la semana (si empatan, la primera que se cobro)
    select c.player id, c.odds v into r from combos c
     where c.status = 'won' and c.settled_at >= (prev::timestamp at time zone 'Europe/Madrid') and c.settled_at < (wk::timestamp at time zone 'Europe/Madrid')
     order by c.odds desc, c.settled_at limit 1;
    if found then
      insert into ledger(player, amount, kind, note, week) values (r.id, pc, 'premio_semana', 'Combinada de la semana', prev) on conflict do nothing;
      txt := txt || case when txt = '' then '' else ' · ' end || 'combinada de la semana: ' || pname(r.id) || ' a cuota ' || fmt_odds(r.v) || ' +' || fmt_int(pc);
      n := n + 1;
    end if;
  end if;
  if txt <> '' then insert into chat(body) values ('Premios de la semana: ' || txt); perform bump(); end if;
  return n + k;
end $$;

revoke all on function bote_semanal(), bote_neto(uuid, date) from public, anon;
