-- 032 (31-10). Premio a la combinada de la semana. PM: "ok todas" a "el que acierte la combinada con la cuota mas alta se lleva
-- un extra el lunes, con su trofeo". 300 (settings premio_combinada) a la combinada ganada con la cuota mas alta de la semana
-- pasada. Va con los demas premios de la semana (bote_semanal, el mismo lunes) y como es un premio_semana, ex_trofeos_apunta
-- lo convierte solo en trofeo. Redefine bote_semanal de 024 sin tocar lo demas. Se puede ejecutar varias veces. Va despues de 029.
insert into settings(key, value) values ('premio_combinada', '300') on conflict (key) do nothing;

create or replace function bote_semanal() returns int
language plpgsql security definer set search_path = public as $$
declare
  wk date := madrid_week(); prev date := madrid_week() - 7;
  pot int; best int; ganadores uuid[]; parte int; nombres text; n int := 0; r record; txt text := '';
  pd int := coalesce((select (value #>> '{}')::int from settings where key = 'premio_dinero'), 200);
  pr int := coalesce((select (value #>> '{}')::int from settings where key = 'premio_ratio'), 100);
  pc int := coalesce((select (value #>> '{}')::int from settings where key = 'premio_combinada'), 300);
begin
  if prev < (select (value #>> '{}')::date from settings where key = 'season_start') then return 0; end if;
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
    -- mas dinero
    select p.id, bote_neto(p.id, prev) v into r from players p order by 2 desc, p.name limit 1;
    if r.v > 0 then
      insert into ledger(player, amount, kind, note, week) values (r.id, pd, 'premio_semana', 'Más dinero de la semana', prev) on conflict do nothing;
      txt := txt || case when txt = '' then '' else ' · ' end || 'más dinero: ' || pname(r.id) || ' +' || fmt_int(pd);
      n := n + 1;
    end if;
    -- mejor ratio (beneficio entre lo apostado), con 3 apuestas resueltas o mas
    select b.player id, sum(case when status in ('won', 'cashout') then payout - stake else -stake end)::numeric / nullif(sum(stake), 0) v into r
      from bets b where status in ('won', 'lost', 'cashout')
       and settled_at >= (prev::timestamp at time zone 'Europe/Madrid') and settled_at < (wk::timestamp at time zone 'Europe/Madrid')
     group by b.player having count(*) >= 3 order by 2 desc limit 1;
    if found and r.v > 0 then
      insert into ledger(player, amount, kind, note, week) values (r.id, pr, 'premio_semana', 'Mejor ratio de la semana', prev) on conflict do nothing;
      txt := txt || case when txt = '' then '' else ' · ' end || 'mejor ratio: ' || pname(r.id) || ' +' || fmt_int(pr);
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
  return n;
end $$;
