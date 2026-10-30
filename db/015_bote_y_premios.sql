-- Decimoquinta parte (30-10). PM: "lo del bote me mola: déjalo, 100 cada semana entre los que quieran meterle"
-- y "el que mejores apuestas hace por ratio esa semana se gana 100 o 200, o el que más dinero gana".
-- 1) El bote ya no se cobra solo: entra quien quiera (100, de lunes a miércoles). Se lo lleva el que más gane
--    con sus apuestas esa semana de entre los que entraron.
-- 2) Premios de la semana, sin poner nada: más dinero ganado con apuestas (+200) y mejor ratio (+100, con 3 apuestas
--    resueltas como mínimo). Lo que cuenta: apuestas resueltas esa semana (de lunes a lunes, hora de Madrid).

insert into settings(key, value) values ('premio_dinero', '200'), ('premio_ratio', '100') on conflict (key) do nothing;
create unique index if not exists ledger_one_premio_semana on ledger(player, week, note) where kind = 'premio_semana';

-- lo ganado con apuestas resueltas en una semana
create or replace function bote_neto(p uuid, wk date) returns int language sql stable set search_path = public as $$
  select coalesce(sum(case when status = 'won' then payout - stake when status = 'lost' then -stake else 0 end), 0)::int from bets
   where player = p and settled_at >= (wk::timestamp at time zone 'Europe/Madrid') and settled_at < ((wk + 7)::timestamp at time zone 'Europe/Madrid')
$$;

create or replace function join_bote() returns int
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); wk date := madrid_week(); amt int := coalesce((select (value #>> '{}')::int from settings where key = 'bote_amount'), 100);
  desde date := (select (value #>> '{}')::date from settings where key = 'bote_desde');
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  if desde is not null and wk < desde then raise exception 'El bote empieza el lunes %', to_char(desde, 'DD/MM'); end if;
  if madrid_day() > wk + 2 then raise exception 'El bote se cierra el miércoles: entra el lunes que viene'; end if;
  perform pg_advisory_xact_lock(hashtext(me::text));
  if (select coalesce(sum(amount), 0) from ledger where player = me) < amt then raise exception 'No tienes % para entrar', fmt_int(amt); end if;
  insert into ledger(player, amount, kind, note, week) values (me, -amt, 'bote', 'Bote de la semana', wk)
  on conflict (player, week) where kind = 'bote' do nothing;
  if not found then raise exception 'Ya estás dentro del bote de esta semana'; end if;
  perform bump();
  return amt;
end $$;

create or replace function bote_semanal() returns int
language plpgsql security definer set search_path = public as $$
declare
  wk date := madrid_week(); prev date := madrid_week() - 7;
  pot int; best int; ganadores uuid[]; parte int; nombres text; n int := 0; r record; txt text := '';
  pd int := coalesce((select (value #>> '{}')::int from settings where key = 'premio_dinero'), 200);
  pr int := coalesce((select (value #>> '{}')::int from settings where key = 'premio_ratio'), 100);
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
    select b.player id, sum(case when status = 'won' then payout - stake else -stake end)::numeric / nullif(sum(stake), 0) v into r
      from bets b where status in ('won', 'lost')
       and settled_at >= (prev::timestamp at time zone 'Europe/Madrid') and settled_at < (wk::timestamp at time zone 'Europe/Madrid')
     group by b.player having count(*) >= 3 order by 2 desc limit 1;
    if found and r.v > 0 then
      insert into ledger(player, amount, kind, note, week) values (r.id, pr, 'premio_semana', 'Mejor ratio de la semana', prev) on conflict do nothing;
      txt := txt || case when txt = '' then '' else ' · ' end || 'mejor ratio: ' || pname(r.id) || ' +' || fmt_int(pr);
      n := n + 1;
    end if;
  end if;
  if txt <> '' then insert into chat(body) values ('Premios de la semana: ' || txt); perform bump(); end if;
  return n;
end $$;

revoke all on function join_bote(), bote_semanal(), bote_neto(uuid, date) from public, anon;
grant execute on function join_bote() to authenticated;
