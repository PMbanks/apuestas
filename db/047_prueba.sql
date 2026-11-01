-- Prueba de db/047_ruleta_global.sql. Todo dentro de un bloque que acaba en error A PROPOSITO, asi que no queda nada.
-- 1) el bote cobra 100 a TODOS (tambien a quien tiene 40, 0 o ya esta en negativo) y los deja en negativo; una sola vez por
--    semana aunque se llame otra vez (bote_semanal y sync_close).
-- 2) la ruleta global da 1.000 a UN jugador valido, una sola vez por semana aunque se llame varias veces, con un solo mensaje
--    al chat; antes de ruleta_global_desde no sortea; en 160 sorteos le toca alguna vez a cada uno (el azar no esta trucado).
-- 3) con saldo negativo no se puede apostar ni jugar (y con saldo si: el partido de prueba vale).
-- 4) ruleta_global() da el ganador, los que entraron con su color y la semilla; sin entrar, error; el sorteo no se puede llamar
--    desde la app.
-- 5) tiempo en la app: el tramo de 3 h da 300 (los demas como estaban), una vez al dia y solo con 180 minutos.
-- 6) tu ruleta cada 3 dias: periodos fijos, una tirada por periodo (otro periodo deja girar), y en 4.000 tiradas las
--    probabilidades y los premios nuevos (25, 50, 100, 200, 75, 400 y cajas; media de unos 58 por tirada).
create or replace function pg_temp.sal(p uuid) returns int language sql as $$ select coalesce(sum(amount), 0)::int from ledger where player = p $$;
create or replace function pg_temp.falla(q text) returns boolean language plpgsql as $$
begin execute q; return false; exception when others then return true; end $$;

do $$
declare
  jug uuid[] := array(select id from players order by created_at, id); n int; wk date := madrid_week();
  pobre uuid; cero uuid; neg uuid; rico uuid; antes jsonb; s int; c int; c2 int; gana uuid; rg ruleta_global; x jsonb;
  vistos uuid[] := '{}'; i int; chat0 bigint;
  per date; d date; cnt int[] := array[0,0,0,0,0,0,0,0]; suma bigint := 0; pr numeric[] := array[.34, .065, .25, .12, .02, .05, .145, .01];
  premio int[] := array[25, 0, 50, 100, 0, 200, 75, 400];
begin
  n := cardinality(jug);
  update settings set value = to_jsonb(wk::text) where key = 'bote_desde';
  if not found then insert into settings(key, value) values ('bote_desde', to_jsonb(wk::text)); end if;
  update settings set value = to_jsonb(wk::text) where key = 'ruleta_global_desde';
  delete from ledger where kind in ('bote', 'ruleta_global') and week = wk;
  delete from ruleta_global where week = wk;
  chat0 := coalesce((select max(id) from chat), 0);
  -- tres sin dinero: uno con 40, otro con 0 y otro ya en negativo (-30); el primero, rico
  pobre := jug[n]; cero := jug[n - 1]; neg := jug[n - 2]; rico := jug[1];
  insert into ledger(player, amount, kind, note) values (pobre, 40 - pg_temp.sal(pobre), 'ajuste', 'prueba 047'),
    (cero, 0 - pg_temp.sal(cero), 'ajuste', 'prueba 047'), (neg, -30 - pg_temp.sal(neg), 'ajuste', 'prueba 047'),
    (rico, 5000, 'ajuste', 'prueba 047');
  select jsonb_object_agg(id, pg_temp.sal(id)) into antes from players;

  -- 1) el bote
  perform bote_semanal();
  select count(*) into c from ledger where kind = 'bote' and week = wk;
  if c <> n then raise exception 'FALLO: el bote cobra a % de % jugadores', c, n; end if;
  if exists (select 1 from ledger where kind = 'bote' and week = wk and amount <> -100) then raise exception 'FALLO: el bote no son 100'; end if;
  -- (bote_semanal tambien sortea la ruleta global: al que le toque se le quitan sus 1.000 para mirar el bote)
  select player into gana from ledger where kind = 'ruleta_global' and week = wk;
  if pg_temp.sal(pobre) - (case when pobre = gana then 1000 else 0 end) <> -60 or pg_temp.sal(cero) - (case when cero = gana then 1000 else 0 end) <> -100
     or pg_temp.sal(neg) - (case when neg = gana then 1000 else 0 end) <> -130 then
    raise exception 'FALLO: el bote no deja en negativo (40 -> %, 0 -> %, -30 -> %)', pg_temp.sal(pobre), pg_temp.sal(cero), pg_temp.sal(neg);
  end if;
  perform bote_semanal();
  perform sync_close((select value #>> '{}' from settings where key = 'sync_secret'));
  select count(*) into c2 from ledger where kind = 'bote' and week = wk;
  if c2 <> c then raise exception 'FALLO: el bote cobra dos veces (% y %)', c, c2; end if;
  if (select count(*) from chat where id > chat0 and body like 'Bote de la semana:%') <> 1 then raise exception 'FALLO: el bote no lo dice una vez en el chat'; end if;

  -- 2) la ruleta global, ya sorteada por bote_semanal (y otra vez por sync_close: no cuenta)
  if (select count(*) from ruleta_global where week = wk) <> 1 then raise exception 'FALLO: no hay una ruleta global esta semana'; end if;
  select * into rg from ruleta_global where week = wk;
  if (select count(*) from ledger where kind = 'ruleta_global' and week = wk) <> 1 then raise exception 'FALLO: la ruleta global no paga una sola vez'; end if;
  select player into gana from ledger where kind = 'ruleta_global' and week = wk;
  if gana is distinct from rg.player or not (gana = any(jug)) then raise exception 'FALLO: la ruleta paga a quien no ha ganado'; end if;
  if (select amount from ledger where kind = 'ruleta_global' and week = wk) <> 1000 then raise exception 'FALLO: la ruleta global no da 1.000'; end if;
  -- cada uno: lo de antes, menos el bote, mas 1.000 solo el ganador
  if exists (select 1 from players p where pg_temp.sal(p.id) <> (antes ->> p.id::text)::int - 100 + case when p.id = gana then 1000 else 0 end) then
    raise exception 'FALLO: los saldos no cuadran despues del bote y la ruleta';
  end if;
  if cardinality(rg.jugadores) <> n or rg.jugadores[rg.idx + 1] <> rg.player then raise exception 'FALLO: la rueda no tiene a todos o el gajo no es el del ganador'; end if;
  if (select count(*) from chat where id > chat0 and body like 'Ruleta global de la semana:%') <> 1 then raise exception 'FALLO: la ruleta global no sale una vez en el chat'; end if;
  perform ruleta_global_sortea(); perform ruleta_global_sortea();
  if (select count(*) from ledger where kind = 'ruleta_global' and week = wk) <> 1 then raise exception 'FALLO: la ruleta global paga dos veces'; end if;

  -- la app lee la ruleta
  perform set_config('request.jwt.claims', jsonb_build_object('sub', jug[2], 'role', 'authenticated')::text, true);
  x := ruleta_global();
  if (x -> 'ultima' ->> 'player')::uuid <> gana or (x -> 'ultima' ->> 'idx')::int <> rg.idx or (x -> 'ultima' ->> 'seed')::int <> rg.seed
     or jsonb_array_length(x -> 'ultima' -> 'jugadores') <> n or (x -> 'ultima' ->> 'amount')::int <> 1000 then
    raise exception 'FALLO: ruleta_global() no da el ganador, el gajo, la semilla o a todos: %', x;
  end if;
  if exists (select 1 from jsonb_array_elements(x -> 'ultima' -> 'jugadores') e where coalesce(e ->> 'color', '') = '' or coalesce(e ->> 'name', '') = '')
     or (x -> 'ultima' -> 'jugadores' -> rg.idx ->> 'id')::uuid <> gana then
    raise exception 'FALLO: ruleta_global() da jugadores sin color o en otro orden';
  end if;
  perform set_config('request.jwt.claims', '', true);
  if not pg_temp.falla('select ruleta_global()') then raise exception 'FALLO: ruleta_global() se lee sin entrar'; end if;
  if has_function_privilege('authenticated', 'ruleta_global_sortea()', 'execute') or has_function_privilege('authenticated', 'bote_semanal()', 'execute') then
    raise exception 'FALLO: la app puede llamar al sorteo o al bote';
  end if;
  if not has_function_privilege('authenticated', 'ruleta_global()', 'execute') then raise exception 'FALLO: la app no puede leer la ruleta'; end if;

  -- antes de la fecha de inicio no sortea
  delete from ledger where kind = 'ruleta_global' and week = wk; delete from ruleta_global where week = wk;
  update settings set value = to_jsonb((wk + 7)::text) where key = 'ruleta_global_desde';
  perform sync_close((select value #>> '{}' from settings where key = 'sync_secret'));
  if exists (select 1 from ruleta_global where week = wk) then raise exception 'FALLO: la ruleta global sortea antes de empezar'; end if;
  update settings set value = to_jsonb(wk::text) where key = 'ruleta_global_desde';

  -- el azar: 160 sorteos, a cada uno le toca alguna vez y siempre a un jugador de verdad con su gajo
  for i in 1 .. 160 loop
    delete from ledger where kind = 'ruleta_global' and week = wk; delete from ruleta_global where week = wk;
    if ruleta_global_sortea() <> 1 then raise exception 'FALLO: el sorteo no sortea'; end if;
    select * into rg from ruleta_global where week = wk;
    if not (rg.player = any(jug)) or rg.jugadores[rg.idx + 1] <> rg.player or rg.seed < 0 or rg.seed >= 1000000 then raise exception 'FALLO: sorteo raro %', rg; end if;
    if (select player from ledger where kind = 'ruleta_global' and week = wk) is distinct from rg.player then raise exception 'FALLO: la ruleta paga a quien no ha ganado'; end if;
    if not (rg.player = any(vistos)) then vistos := vistos || rg.player; end if;
  end loop;
  if cardinality(vistos) <> n then raise exception 'FALLO: en 160 sorteos solo les ha tocado a % de %', cardinality(vistos), n; end if;

  -- 3) con saldo negativo no se apuesta ni se juega
  insert into matches(id, sport, league, league_name, home, away, starts_at, odds_1, odds_x, odds_2)
    values ('prueba-047', 'f', 'p', 'Prueba', 'Local', 'Visitante', now() + interval '2 days', 2.00, 3.00, 3.50);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', neg, 'role', 'authenticated')::text, true);
  if pg_temp.sal(neg) >= 0 then neg := pobre; end if;          -- si a -130 le toco la ruleta, el de 40 (ahora -60)
  if pg_temp.sal(neg) >= 0 then neg := cero; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', neg, 'role', 'authenticated')::text, true);
  if pg_temp.sal(neg) >= 0 then raise exception 'FALLO: la prueba necesita a alguien en negativo'; end if;
  s := pg_temp.sal(neg);
  if not pg_temp.falla($q$select place_bet('prueba-047', '1', 1)$q$) then raise exception 'FALLO: se apuesta con saldo negativo'; end if;
  if not pg_temp.falla(format('select jg_cobrar(%L::uuid, 1, %L, %L)', neg, 'crash', 'prueba')) then raise exception 'FALLO: se juega con saldo negativo'; end if;
  if pg_temp.sal(neg) <> s then raise exception 'FALLO: con saldo negativo se ha movido dinero'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', rico, 'role', 'authenticated')::text, true);
  if pg_temp.falla($q$select place_bet('prueba-047', '1', 1)$q$) then raise exception 'FALLO: el partido de prueba no vale ni con saldo'; end if;

  -- 5) tiempo en la app
  perform set_config('request.jwt.claims', jsonb_build_object('sub', rico, 'role', 'authenticated')::text, true);
  x := time_status();
  if (select jsonb_agg((t ->> 'min')::int order by (t ->> 'min')::int) from jsonb_array_elements(x -> 'tiers') t) <> '[30,60,120,180]'::jsonb
     or (select (t ->> 'amt')::int from jsonb_array_elements(x -> 'tiers') t where (t ->> 'min')::int = 180) <> 300 then   -- los tramos de antes se quedan como esten en la base
    raise exception 'FALLO: los tramos de tiempo no son 30, 60 (igual que antes), 120 y 180 = 300: %', x -> 'tiers';
  end if;
  delete from ledger where player = rico and kind = 'tiempo' and week = madrid_day();
  insert into app_time(player, day, minutes) values (rico, madrid_day(), 179) on conflict (player, day) do update set minutes = 179;
  if not pg_temp.falla('select claim_time_reward(180)') then raise exception 'FALLO: el tramo de 3 h se cobra con 179 minutos'; end if;
  update app_time set minutes = 180 where player = rico and day = madrid_day();
  s := pg_temp.sal(rico);
  if claim_time_reward(180) <> 300 or pg_temp.sal(rico) <> s + 300 then raise exception 'FALLO: el tramo de 3 h no da 300'; end if;
  if not pg_temp.falla('select claim_time_reward(180)') then raise exception 'FALLO: el tramo de 3 h se cobra dos veces'; end if;

  -- 6) tu ruleta cada 3 dias. Los periodos: fijos de 3 en 3 desde el 02/11/2026
  if ruleta_periodo('2026-11-02') <> '2026-11-02' or ruleta_periodo('2026-11-04') <> '2026-11-02' or ruleta_periodo('2026-11-05') <> '2026-11-05'
     or ruleta_periodo('2026-11-01') <> '2026-10-30' or ruleta_periodo('2027-03-29') <> '2027-03-29' or ruleta_periodo('2027-03-28') <> '2027-03-26' then raise exception 'FALLO: los periodos de 3 dias no cuadran'; end if;
  for i in 0 .. 500 loop
    d := date '2026-09-01' + i;
    if d - ruleta_periodo(d) not between 0 and 2 or (ruleta_periodo(d) - date '2026-11-02') % 3 <> 0 then raise exception 'FALLO: periodo raro para %', d; end if;
  end loop;
  per := ruleta_periodo(madrid_day());
  delete from wheel_spins where player = rico;
  x := spin_wheel();
  if not exists (select 1 from wheel_spins where player = rico and week = per) then raise exception 'FALLO: la tirada no se guarda con el periodo'; end if;
  if (x ->> 'amount')::int > 0 and not exists (select 1 from ledger where player = rico and kind = 'ruleta_semana' and week = per and amount = (x ->> 'amount')::int) then
    raise exception 'FALLO: el premio no va al ledger con el periodo';
  end if;
  if not pg_temp.falla('select spin_wheel()') then raise exception 'FALLO: se gira dos veces en el mismo periodo'; end if;
  -- una tirada de la regla vieja (semana) hecha dentro de este periodo tambien cuenta
  update wheel_spins set week = madrid_week() - 7 where player = rico and week = per;
  if not pg_temp.falla('select spin_wheel()') then raise exception 'FALLO: se gira otra vez tras una tirada de la semana dentro del periodo'; end if;
  -- el periodo de antes no cuenta: se puede girar otra vez
  update wheel_spins set week = per - 3, created_at = (per::timestamp at time zone 'Europe/Madrid') - interval '1 hour' where player = rico;
  if pg_temp.falla('select spin_wheel()') then raise exception 'FALLO: en un periodo nuevo no deja girar'; end if;
  -- 4.000 tiradas
  for i in 1 .. 4000 loop
    delete from wheel_spins where player = rico and week = per;
    x := spin_wheel();
    cnt[(x ->> 'prize')::int + 1] := cnt[(x ->> 'prize')::int + 1] + 1;
    if (x ->> 'amount')::int <> premio[(x ->> 'prize')::int + 1] then raise exception 'FALLO: el gajo % da %', x ->> 'prize', x ->> 'amount'; end if;
    if ((x ->> 'prize')::int in (1, 4)) <> (x -> 'box' is not null and x -> 'box' <> 'null'::jsonb) then raise exception 'FALLO: caja donde no toca: %', x; end if;
    suma := suma + (x ->> 'amount')::int;
  end loop;
  for i in 1 .. 8 loop
    if abs(cnt[i] / 4000.0 - pr[i]) > greatest(.025, pr[i] * .6) then raise exception 'FALLO: el gajo % sale % de 4.000 y deberia ser %', i - 1, cnt[i], pr[i] * 4000; end if;
  end loop;
  if abs(suma / 4000.0 - 57.875) > 5 then raise exception 'FALLO: la media por tirada es % y deberia ser unos 58', round(suma / 4000.0, 1); end if;

  raise exception 'PRUEBA SUPERADA (se deshace todo): bote a los % (40 -> -60, 0 -> -100, -30 -> -130) una vez, ruleta global de 1.000 una vez y a uno de verdad (en 160 sorteos les toca a los %), sin apostar en negativo, 3 h = 300, tu ruleta una vez cada 3 dias con media %.', n, cardinality(vistos), round(suma / 4000.0, 1);
end $$;
