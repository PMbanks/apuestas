-- 047 (01-11). Dos cosas de PM:
-- 1) BOTE PARA TODOS. PM: "lo del pot of the week, si no tiene dinero alguien estara como en negativo". Hasta 035 el bote del
--    lunes solo cobraba 100 a quien tenia 100 o mas; desde aqui cobra a TODOS los jugadores cada semana, aunque se queden en
--    negativo (el saldo puede bajar de 0 solo por esto). Igual que en 035: una vez por jugador y semana (indice ledger_one_bote),
--    desde bote_desde, con el mismo candado que place_bet (pg_advisory_xact_lock del jugador) y con su mensaje al chat.
--    Apostar, jugar o abrir cajas con saldo negativo sigue sin dejar: todas comprueban "lo que gastas > saldo" con 1 como minimo.
-- 2) RULETA GLOBAL. PM: "habra una ruleta semanal global y mas grande que saldra las fotos de todos y le tocara a alguien random
--    1000 monedas cada semana; se hace aparte de la que ya tenemos ahora, pero esta solo dara 1000 a 1 persona".
--    Cada lunes (desde ruleta_global_desde), en lo que ya corre en sync_close (despues de la paga y del bote: va dentro de
--    bote_semanal, justo detras de cobrar el bote), la base sortea UNA vez por semana a un jugador entre todos y le da 1.000
--    (settings ruleta_global_amount) en el ledger con kind 'ruleta_global', y lo dice en el chat. Una sola vez aunque se llame
--    muchas veces o a la vez: candado global, clave primaria por semana en ruleta_global y un indice unico por semana en el ledger.
--    El azar es de la base (cs_rand), nunca del navegador. La app lee con ruleta_global(): el ganador, los que entraron con sus
--    colores (en el orden de los gajos) y la semilla para dibujar el giro igual en todos los moviles.
-- 3) TIEMPO EN LA APP. PM: "por tiempo vamos a poner que 3h 300, asi la gente se queda mas". Tramo nuevo: 180 min = 300
--    (los de 30, 60 y 120 min siguen igual). La app los pinta sola desde time_status().
-- 4) TU RULETA CADA 3 DIAS. PM: "la ruleta de weekly que tenemos ahora individual de cada uno sera cada 3 dias, asi que metele
--    las opciones buenas mas pequenas para que toquen menos y menos dinero". spin_wheel (017) pasa a una tirada por periodo fijo
--    de 3 dias en hora de Madrid (ruleta_periodo: desde el lunes 02/11/2026, de 3 en 3 dias; no "3 dias desde tu ultima tirada").
--    wheel_spins.week y ledger.week guardan el primer dia del periodo; unique(player, week) de wheel_spins sigue siendo el candado
--    de una vez por periodo (y tampoco deja girar si ya giraste dentro del periodo con la regla vieja de la semana).
--    Premios y probabilidades, en el orden de los gajos (el navegador los dibuja con su tamano real):
--      antes (por semana, 1 tirada):  50 24 % · caja barata 16 % · 100 20 % · 250 13 % · caja buena 5 % · 500 6 % · 150 14 % · 1.000 2 %
--      ahora (cada 3 dias):           25 34 % · caja barata 6,5 % · 50 25 % · 100 12 % · caja buena 2 % · 200 5 % · 75 14,5 % · 400 1 %
--    Valor esperado en V-Bucks: antes 135,5 por tirada = 135,5 por semana. Ahora 57,875 por tirada y 7/3 = 2,33 tiradas por
--    semana = 135,04 por semana (un poco menos). Cajas por semana: baratas 0,16 antes y 0,152 ahora; buenas 0,05 antes y 0,047 ahora.
-- Redefine bote_semanal de 035 y spin_wheel de 017 sin tocar lo demas. Se puede ejecutar varias veces. Va despues de 001 a 046.

insert into settings(key, value) values ('ruleta_global_amount', '1000'), ('ruleta_global_desde', '"2026-11-02"') on conflict (key) do nothing;

create table if not exists ruleta_global (
  week date primary key,
  player uuid not null references players on delete cascade,
  jugadores uuid[] not null,              -- los que entraron, en el orden de los gajos de la rueda
  idx int not null,                       -- el gajo del ganador (0 = el primero de jugadores)
  seed int not null,                      -- para dibujar el giro: vueltas y punto del gajo donde para la aguja
  amount int not null,
  created_at timestamptz not null default now(),
  check (idx >= 0 and idx < cardinality(jugadores) and jugadores[idx + 1] = player)
);
alter table ruleta_global enable row level security;
drop policy if exists ruleta_global_read on ruleta_global;
create policy ruleta_global_read on ruleta_global for select to authenticated using (is_player());
create unique index if not exists ledger_one_ruleta_global on ledger(week) where kind = 'ruleta_global';

-- el sorteo de la semana. Devuelve 1 si ha sorteado ahora y 0 si ya estaba hecho o aun no toca
create or replace function ruleta_global_sortea() returns int
language plpgsql security definer set search_path = public as $$
declare
  wk date := madrid_week();
  desde date := (select (value #>> '{}')::date from settings where key = 'ruleta_global_desde');
  amt int := coalesce((select (value #>> '{}')::int from settings where key = 'ruleta_global_amount'), 1000);
  js uuid[]; n int; i int; gana uuid;
begin
  if desde is not null and wk < desde then return 0; end if;
  perform pg_advisory_xact_lock(hashtext('ruleta_global'));      -- dos pasadas del sincronizador a la vez: la segunda espera
  if exists (select 1 from ruleta_global where week = wk) then return 0; end if;
  js := array(select id from players order by created_at, id);
  n := coalesce(cardinality(js), 0);
  if n = 0 then return 0; end if;
  i := least(n - 1, floor(cs_rand() * n)::int);
  gana := js[i + 1];
  insert into ruleta_global(week, player, jugadores, idx, seed, amount)
    values (wk, gana, js, i, floor(cs_rand() * 1000000)::int, amt)
  on conflict (week) do nothing;
  if not found then return 0; end if;
  insert into ledger(player, amount, kind, note, week) values (gana, amt, 'ruleta_global', 'Ruleta global de la semana', wk)
  on conflict (week) where kind = 'ruleta_global' do nothing;
  insert into chat(body) values ('Ruleta global de la semana: le tocan ' || fmt_int(amt) || ' a ' || pname(gana));
  perform bump();
  return 1;
end $$;

-- lo que lee la app: la ruleta de esta semana (o la ultima que hubo) y las de antes
create or replace function ruleta_global() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r ruleta_global; wk date := madrid_week();
begin
  if not is_player() then raise exception 'Tienes que entrar primero'; end if;
  select * into r from ruleta_global order by week desc limit 1;
  return jsonb_build_object(
    'week', wk,
    'desde', (select value #>> '{}' from settings where key = 'ruleta_global_desde'),
    'amount', coalesce((select (value #>> '{}')::int from settings where key = 'ruleta_global_amount'), 1000),
    'ultima', case when r.week is null then null else jsonb_build_object(
      'week', r.week, 'player', r.player, 'idx', r.idx, 'seed', r.seed, 'amount', r.amount, 'at', r.created_at,
      'jugadores', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'ini', p.ini, 'color', p.color) order by x.o), '[]')
                      from unnest(r.jugadores) with ordinality x(id, o) join players p on p.id = x.id)) end,
    'antes', (select coalesce(jsonb_agg(jsonb_build_object('week', g.week, 'player', g.player, 'amount', g.amount) order by g.week desc), '[]')
                from (select week, player, amount from ruleta_global where week < coalesce(r.week, wk) order by week desc limit 8) g));
end $$;

-- el bote del lunes cobra a todos (aunque se queden en negativo) y detras se sortea la ruleta global
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
  -- 0) el bote de ESTA semana se llena solo: 100 de cada uno, lo tenga o no (047). Una vez por jugador y semana: ledger_one_bote
  if desde is null or wk >= desde then
    for r in select p.id from players p order by p.created_at, p.id loop
      perform pg_advisory_xact_lock(hashtext(r.id::text));          -- el mismo candado que place_bet: no se cruza con una apuesta
      if not exists (select 1 from ledger where player = r.id and kind = 'bote' and week = wk) then
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
  -- 0b) la ruleta global de esta semana (047): despues de la paga y del bote, una vez por semana
  perform ruleta_global_sortea();

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
    -- 035: mejor apuesta = la suelta acertada con la cuota mas alta
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

-- 3) tiempo en la app: el tramo de 3 h
update settings set value = '[{"min":30,"amt":25},{"min":60,"amt":50},{"min":120,"amt":100},{"min":180,"amt":300}]'::jsonb where key = 'time_rewards';
insert into settings(key, value) values ('time_rewards', '[{"min":30,"amt":25},{"min":60,"amt":50},{"min":120,"amt":100},{"min":180,"amt":300}]') on conflict (key) do nothing;

-- 4) tu ruleta, cada 3 dias
-- el primer dia del periodo de 3 dias en el que cae d (hora de Madrid). Periodos fijos desde el lunes 02/11/2026
create or replace function ruleta_periodo(d date) returns date language sql immutable as $$
  select date '2026-11-02' + 3 * floor((d - date '2026-11-02') / 3.0)::int
$$;
create or replace function spin_wheel() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); per date := ruleta_periodo(madrid_day()); x double precision := cs_rand(); idx int; amt int := 0; caja text; oid bigint; lab text;
  ini timestamptz := (ruleta_periodo(madrid_day())::timestamp at time zone 'Europe/Madrid'); sig date := ruleta_periodo(madrid_day()) + 3;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  perform pg_advisory_xact_lock(hashtext(me::text));
  if exists (select 1 from wheel_spins where player = me and (week = per or created_at >= ini)) then
    raise exception 'Ya has girado. La siguiente tirada, %', case when sig = madrid_day() + 1 then 'mañana' else 'el ' || to_char(sig, 'DD/MM') end;
  end if;
  -- 25 (34 %) · caja barata (6,5 %) · 50 (25 %) · 100 (12 %) · caja buena (2 %) · 200 (5 %) · 75 (14,5 %) · 400 (1 %)
  idx := case when x < .34 then 0 when x < .405 then 1 when x < .655 then 2 when x < .775 then 3 when x < .795 then 4 when x < .845 then 5 when x < .99 then 6 else 7 end;
  amt := (array[25, 0, 50, 100, 0, 200, 75, 400])[idx + 1];
  if idx in (1, 4) then
    if idx = 1 then select id into caja from (select id from cs_cases where active and coalesce(cat, 'skins') = 'skins' order by price asc limit 5) c order by cs_rand() limit 1;
    else select id into caja from (select id from cs_cases where active and coalesce(cat, 'skins') = 'skins' order by price desc limit 3) c order by cs_rand() limit 1; end if;
    insert into cs_owned(player, case_id, source) values (me, caja, 'ruleta') returning id into oid;
    lab := 'Caja gratis: ' || (select name from cs_cases where id = caja);
  else
    insert into ledger(player, amount, kind, note, week) values (me, amt, 'ruleta_semana', 'Ruleta de premios', per);
    lab := '+' || fmt_int(amt) || ' V-Bucks';
  end if;
  insert into wheel_spins(player, week, prize, label, amount) values (me, per, idx, lab, amt);
  perform bump();
  return jsonb_build_object('prize', idx, 'label', lab, 'amount', amt, 'periodo', per, 'siguiente', sig,
    'box', case when oid is null then null else jsonb_build_object('id', oid, 'case', caja) end);
end $$;
revoke all on function spin_wheel() from public, anon;
grant execute on function spin_wheel(), ruleta_periodo(date) to authenticated;

revoke all on function bote_semanal(), ruleta_global_sortea() from public, anon, authenticated;
revoke all on function ruleta_global() from public, anon;
grant execute on function ruleta_global() to authenticated;
