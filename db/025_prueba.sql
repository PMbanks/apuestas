-- Prueba de db/025_equipos_extra.sql, para el editor SQL de Supabase. Va DESPUES de 025_equipos_extra.sql (y de 001 a 024).
-- Prueba: que sin la clave del sincronizador no se lee ni se escribe nada; que guarda la ficha ampliada de un equipo que ya tenia ficha
-- de resultados sin tocarla, y de uno nuevo (futbol, UFC); que apunta los fallos y que un fallo no borra la ficha buena; que rechaza lo
-- que no es un objeto o pesa demasiado; que la lista de apuestas abiertas cuenta bien; que la limpieza de 30 dias respeta las fichas
-- ampliadas recientes y borra las muertas; y que un jugador normal ve la ficha pero no puede escribir ni llamar sin la clave.
-- Hace falta al menos un jugador. Al final lanza un error A PROPOSITO para que se deshaga todo: no queda nada guardado.
-- Si todo va bien, el error dice "PRUEBA SUPERADA" con el resumen. Si algo falla, dice "FALLO" y que.
do $$
declare
  jug uuid[] := array(select id from players order by created_at, id);
  sec text := 'secreto-de-prueba'; resumen text := ''; n int; fallo boolean; r jsonb; e record; ex jsonb; grande text;
begin
  if cardinality(jug) < 1 then raise exception 'FALLO: hace falta al menos un jugador'; end if;
  insert into settings(key, value) values ('sync_secret', to_jsonb(sec)) on conflict (key) do update set value = excluded.value;
  delete from teams where id in ('valorant:900001', 'csgo:900002', 'f:900003', 'u:900004', 'f:900005', 'f:900006');

  -- ---------------------------------------------------------- 1. sin clave no entra nadie
  fallo := false; begin perform sync_equipos_extra_get('mala', array['f:1']); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: sync_equipos_extra_get acepta una clave mala'; end if;
  fallo := false; begin perform sync_equipos_extra_get(null, array['f:1']); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: sync_equipos_extra_get acepta clave nula'; end if;
  fallo := false; begin perform sync_equipos_extra_put('mala', '[{"id":"f:900003","extra":{}}]'); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: sync_equipos_extra_put acepta una clave mala'; end if;
  fallo := false; begin perform sync_equipos_extra_apuestas('mala'); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: sync_equipos_extra_apuestas acepta una clave mala'; end if;
  if exists (select 1 from teams where id = 'f:900003') then raise exception 'FALLO: una llamada con clave mala dejo una fila'; end if;
  resumen := resumen || 'claves malas rechazadas · ';

  -- ---------------------------------------------------------- 2. equipo con ficha de resultados ya hecha (006): no se toca su data
  perform sync_teams_put(sec, '[{"id":"valorant:900001","data":{"w":7,"g":10,"f":"GGPGG","name":"Equipo Uno","hist":[]}}]');
  n := sync_equipos_extra_put(sec, jsonb_build_array(jsonb_build_object('id', 'valorant:900001', 'extra', jsonb_build_object(
        'v', 1, 'fuente', jsonb_build_array('Liquipedia'), 'actualizado', now(),
        'palmares', jsonb_build_array(jsonb_build_object('torneo', 'VCT Champions', 'puesto', '1º', 'puesto_n', 1, 'fecha', '2025-09-14', 'premio', 1000000)),
        'ganancias', jsonb_build_object('total', 31932, 'moneda', 'USD'),
        'jugadores', jsonb_build_array(jsonb_build_object('nombre', 'heybay', 'pais', 'HK', 'desde', '2025-11-09'))))));
  if n <> 1 then raise exception 'FALLO: put devolvio % y debia ser 1', n; end if;
  select * into e from teams where id = 'valorant:900001';
  if e.data->>'g' <> '10' or e.data->>'f' <> 'GGPGG' then raise exception 'FALLO: guardar la ficha ampliada piso la ficha de resultados: %', e.data; end if;
  if e.extra->'ganancias'->>'total' <> '31932' or e.extra->'palmares'->0->>'torneo' <> 'VCT Champions' then raise exception 'FALLO: la ficha ampliada no se guardo bien: %', e.extra; end if;
  if e.extra_at is null or e.extra_try is null or e.extra_fails <> 0 then raise exception 'FALLO: fechas o fallos mal puestos'; end if;
  resumen := resumen || 'ficha ampliada guardada sin pisar la de resultados · ';

  -- ---------------------------------------------------------- 3. futbol y UFC: filas nuevas
  n := sync_equipos_extra_put(sec, '[{"id":"f:900003","extra":{"v":1,"palmares":[{"torneo":"Premier League","puesto":"Campeón","puesto_n":1,"veces":1,"anios":["2015–16"]}]}},
                                     {"id":"u:900004","extra":{"v":1,"ficha":{"peso":"Heavyweight"}}}]');
  if n <> 2 then raise exception 'FALLO: put de dos filas nuevas devolvio %', n; end if;
  select * into e from teams where id = 'f:900003';
  if e.extra->'palmares'->0->>'torneo' <> 'Premier League' then raise exception 'FALLO: fila nueva de futbol mal guardada'; end if;
  if e.data <> '{}'::jsonb then raise exception 'FALLO: la fila nueva debia tener data vacio'; end if;
  if e.updated_at > now() - interval '12 hours' then raise exception 'FALLO: la fila nueva debe nacer con la ficha de resultados vieja (para que 006 la refresque)'; end if;
  resumen := resumen || 'filas nuevas de futbol y UFC · ';

  -- ---------------------------------------------------------- 4. get: fechas y fallos
  r := sync_equipos_extra_get(sec, array['valorant:900001', 'f:900003', 'csgo:900002', 'no:existe']);
  if not (r ? 'valorant:900001') or not (r ? 'f:900003') then raise exception 'FALLO: get no devuelve las fichas guardadas: %', r; end if;
  if r ? 'csgo:900002' or r ? 'no:existe' then raise exception 'FALLO: get devuelve filas que no tienen ficha ampliada: %', r; end if;
  if abs((r->'f:900003'->>'t')::numeric - extract(epoch from now()) * 1000) > 3600000 then raise exception 'FALLO: la fecha t de get esta mal: %', r->'f:900003'; end if;
  resumen := resumen || 'get con fechas · ';

  -- ---------------------------------------------------------- 5. fallos: se apuntan y no borran la ficha buena
  perform sync_equipos_extra_put(sec, '[{"id":"valorant:900001","fallo":true},{"id":"csgo:900002","fallo":true}]');
  perform sync_equipos_extra_put(sec, '[{"id":"csgo:900002","fallo":true}]');
  select * into e from teams where id = 'valorant:900001';
  if e.extra is null or e.extra_fails <> 1 then raise exception 'FALLO: un fallo borro la ficha buena o no se apunto (fails=%)', e.extra_fails; end if;
  select * into e from teams where id = 'csgo:900002';
  if e.extra is not null or e.extra_at is not null or e.extra_fails <> 2 then raise exception 'FALLO: dos fallos seguidos de un equipo nuevo mal apuntados (fails=%)', e.extra_fails; end if;
  r := sync_equipos_extra_get(sec, array['csgo:900002']);
  if (r->'csgo:900002'->>'f')::int <> 2 or (r->'csgo:900002'->>'t') is not null then raise exception 'FALLO: get de un equipo con solo fallos: %', r; end if;
  perform sync_equipos_extra_put(sec, '[{"id":"valorant:900001","extra":{"v":1}}]');
  if (select extra_fails from teams where id = 'valorant:900001') <> 0 then raise exception 'FALLO: un guardado bueno no pone los fallos a cero'; end if;
  resumen := resumen || 'fallos apuntados · ';

  -- ---------------------------------------------------------- 6. lo que no vale
  fallo := false; begin perform sync_equipos_extra_put(sec, '[{"id":"f:900005","extra":[1,2]}]'); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: acepta un extra que no es objeto'; end if;
  fallo := false; begin perform sync_equipos_extra_put(sec, '[{"id":"f:900005","extra":"texto"}]'); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: acepta un extra de texto'; end if;
  fallo := false; begin perform sync_equipos_extra_put(sec, '[{"id":"f:900005"}]'); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: acepta una fila sin extra ni fallo'; end if;
  grande := repeat('x', 160000);
  fallo := false; begin perform sync_equipos_extra_put(sec, jsonb_build_array(jsonb_build_object('id', 'f:900005', 'extra', jsonb_build_object('t', grande)))); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: acepta una ficha de mas de 150 KB'; end if;
  n := sync_equipos_extra_put(sec, '[{"id":"","extra":{}},{"extra":{}}]');
  if n <> 0 or exists (select 1 from teams where id = '') then raise exception 'FALLO: filas sin id deben ignorarse (n=%)', n; end if;
  if exists (select 1 from teams where id = 'f:900005') then raise exception 'FALLO: una fila rechazada dejo rastro'; end if;
  resumen := resumen || 'basura rechazada · ';

  -- ---------------------------------------------------------- 7. apuestas abiertas por partido
  insert into matches(id, sport, league, league_name, home, away, starts_at, status) values
    ('zz:eq1', 'v', 'ps:valorant:1', 'Torneo', 'Equipo Uno', 'Equipo Dos', now() + interval '1 day', 'scheduled'),
    ('zz:eq2', 'f', 'eng.1', 'Premier', 'Hull', 'Leeds', now() + interval '2 days', 'scheduled'),
    ('zz:eq3', 'f', 'eng.1', 'Premier', 'Arsenal', 'Chelsea', now() - interval '2 days', 'final');
  insert into bets(player, match_id, pick, stake, odds, status) values
    (jug[1], 'zz:eq1', '1', 10, 2.0, 'open'), (jug[1], 'zz:eq1', '2', 10, 2.0, 'open'), (jug[1], 'zz:eq2', '1', 10, 2.0, 'open'),
    (jug[1], 'zz:eq3', '1', 10, 2.0, 'open'), (jug[1], 'zz:eq2', '2', 10, 2.0, 'lost');
  r := sync_equipos_extra_apuestas(sec);
  if (r->>'zz:eq1')::int <> 2 or (r->>'zz:eq2')::int <> 1 or r ? 'zz:eq3' then raise exception 'FALLO: conteo de apuestas abiertas mal: %', r; end if;
  resumen := resumen || 'apuestas abiertas contadas · ';

  -- ---------------------------------------------------------- 8. la limpieza de 30 dias
  insert into teams(id, data, updated_at, extra, extra_at) values
    ('f:900005', '{}', now() - interval '40 days', '{"v":1}', now() - interval '2 days'),    -- vieja pero con ficha ampliada reciente: se queda
    ('f:900006', '{}', now() - interval '40 days', '{"v":1}', now() - interval '40 days');   -- muerta: se va
  perform sync_teams_put(sec, '[{"id":"valorant:900001","data":{"w":1,"g":1}}]');
  if not exists (select 1 from teams where id = 'f:900005') then raise exception 'FALLO: la limpieza borro una ficha ampliada reciente'; end if;
  if exists (select 1 from teams where id = 'f:900006') then raise exception 'FALLO: la limpieza no borro una fila muerta de 40 dias'; end if;
  resumen := resumen || 'limpieza de 30 dias respeta las fichas recientes · ';

  -- ---------------------------------------------------------- 9. un jugador normal
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  set local role authenticated;
  select count(*) into n from teams where id = 'f:900003';
  if n <> 1 then reset role; raise exception 'FALLO: un jugador no ve la ficha ampliada'; end if;
  select extra into ex from teams where id = 'f:900003';
  if ex is null then reset role; raise exception 'FALLO: un jugador no lee la columna extra'; end if;
  fallo := false; begin update teams set extra = '{"v":99}' where id = 'f:900003'; get diagnostics n = row_count; if n > 0 then fallo := false; else fallo := true; end if; exception when others then fallo := true; end;
  if not fallo then reset role; raise exception 'FALLO: un jugador puede escribir directamente en teams'; end if;
  fallo := false; begin delete from teams where id = 'f:900003'; get diagnostics n = row_count; if n > 0 then fallo := false; else fallo := true; end if; exception when others then fallo := true; end;
  if not fallo then reset role; raise exception 'FALLO: un jugador puede borrar filas de teams'; end if;
  fallo := false; begin perform sync_equipos_extra_put('x', '[{"id":"f:900003","extra":{}}]'); exception when others then fallo := true; end;
  if not fallo then reset role; raise exception 'FALLO: un jugador escribe sin la clave'; end if;
  reset role;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  select count(*) into n from teams;
  if n <> 0 then reset role; raise exception 'FALLO: alguien sin cuenta ve las fichas (%)', n; end if;
  reset role;
  resumen := resumen || 'jugador ve pero no escribe, sin cuenta no ve nada';

  raise exception 'PRUEBA SUPERADA: %', resumen;
end $$;
