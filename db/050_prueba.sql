-- Prueba de db/050_jugadores.sql, para el editor SQL de Supabase. Va DESPUES de 050_jugadores.sql (y de 001 a 049).
-- La clave del sincronizador se LEE de settings (nunca se escribe): hace falta que exista.
-- Prueba: que sin la clave no se lee ni se escribe nada; que put mezcla jugadores sin tocar los demas ni la ficha del equipo (extra);
-- que un jugador que ya estaba se reemplaza entero; que get devuelve cuando se hizo cada uno; que un equipo que no existe no se crea;
-- que lo que no es un objeto se rechaza; que pasado de 24 jugadores se van los mas viejos; que pasado de 150 KB se rechaza y no deja rastro;
-- que guardar la ficha del equipo (sync_equipos_extra_put) no borra el detalle de jugadores; y que un jugador de la app ve el detalle pero
-- no puede escribir ni llamar sin la clave. Al final lanza un error A PROPOSITO para que se deshaga todo: no queda nada guardado.
-- Si todo va bien, el error dice "PRUEBA SUPERADA" con el resumen. Si algo falla, dice "FALLO" y que.
do $$
declare
  jug uuid[] := array(select id from players order by created_at, id);
  sec text := (select value #>> '{}' from settings where key = 'sync_secret');
  resumen text := ''; n int; fallo boolean; r jsonb; e record; i int; grande jsonb;
begin
  if cardinality(jug) < 1 then raise exception 'FALLO: hace falta al menos un jugador'; end if;
  if sec is null then raise exception 'FALLO: no hay clave del sincronizador en settings (sync_secret)'; end if;
  delete from teams where id in ('valorant:900201', 'csgo:900202', 'csgo:900203');
  insert into teams(id, data, updated_at) values ('valorant:900201', '{}', now()), ('csgo:900202', '{}', now()), ('csgo:900203', '{}', now());
  perform sync_equipos_extra_put(sec, '[{"id":"valorant:900201","extra":{"v":1,"ver":2,"nombre":"Equipo Uno","jugadores":[{"nombre":"coconut","estado":null},{"nombre":"Banquillo","estado":"Substitute"},{"estado":"x"}]}}]');

  -- ---------------------------------------------------------- 1. sin clave no entra nadie
  fallo := false; begin perform sync_jugadores_get('mala', array['valorant:900201']); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: get acepta una clave mala'; end if;
  fallo := false; begin perform sync_jugadores_get(null, array['valorant:900201']); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: get acepta clave nula'; end if;
  fallo := false; begin perform sync_jugadores_put('mala', '[{"id":"valorant:900201","jug":{"a":{"t":1}}}]'); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: put acepta una clave mala'; end if;
  fallo := false; begin perform sync_jugadores_put(null, '[{"id":"valorant:900201","jug":{"a":{"t":1}}}]'); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: put acepta clave nula'; end if;
  if (select pj from teams where id = 'valorant:900201') is not null then raise exception 'FALLO: una llamada con clave mala dejo rastro'; end if;
  resumen := resumen || 'claves malas rechazadas · ';

  -- ---------------------------------------------------------- 2. mezclar jugadores
  n := sync_jugadores_put(sec, '[{"id":"valorant:900201","jug":{"coconut":{"t":1000,"g":{"total":22912,"lista":[["2026","VCT China Threshold","5º a 8º",0,"FunPlus Phoenix"]]},"eq":[["JD Gaming","2026-01","2026-06",null]]},
                                                     "aaaay":{"t":2000,"g":{"total":10}}}}]');
  if n <> 1 then raise exception 'FALLO: put devolvio % y debia ser 1', n; end if;
  select * into e from teams where id = 'valorant:900201';
  if e.pj->'coconut'->'g'->>'total' <> '22912' or e.pj->'aaaay'->>'t' <> '2000' then raise exception 'FALLO: jugadores mal guardados: %', e.pj; end if;
  if e.pj_at is null then raise exception 'FALLO: pj_at sin poner'; end if;
  if e.extra->>'nombre' <> 'Equipo Uno' then raise exception 'FALLO: guardar jugadores piso la ficha del equipo'; end if;
  n := sync_jugadores_put(sec, '[{"id":"valorant:900201","jug":{"setrod":{"t":3000,"g":{"total":5}}}}]');
  select * into e from teams where id = 'valorant:900201';
  if not (e.pj ? 'coconut' and e.pj ? 'aaaay' and e.pj ? 'setrod') then raise exception 'FALLO: un put nuevo borro a los demas: %', e.pj; end if;
  resumen := resumen || 'jugadores mezclados sin pisar a los demas · ';

  -- ---------------------------------------------------------- 3. un jugador que ya estaba se reemplaza entero
  perform sync_jugadores_put(sec, '[{"id":"valorant:900201","jug":{"coconut":{"t":4000,"g":{"total":30000}}}}]');
  select pj into r from teams where id = 'valorant:900201';
  if r->'coconut'->'g'->>'total' <> '30000' or r->'coconut' ? 'eq' then raise exception 'FALLO: reemplazar un jugador debe dejarlo como se envia (sin lo viejo): %', r->'coconut'; end if;
  if r->'aaaay'->>'t' <> '2000' then raise exception 'FALLO: reemplazar un jugador toco a otro'; end if;
  resumen := resumen || 'jugador reemplazado entero · ';

  -- ---------------------------------------------------------- 4. get: cuando se hizo cada uno
  r := sync_jugadores_get(sec, array['valorant:900201', 'csgo:900202', 'no:existe']);
  if (r->'valorant:900201'->'t'->>'coconut')::bigint <> 4000 or (r->'valorant:900201'->'t'->>'setrod')::bigint <> 3000 then raise exception 'FALLO: get mal: %', r; end if;
  if r->'valorant:900201'->'p' <> '[["coconut", null], ["Banquillo", "Substitute"]]'::jsonb then raise exception 'FALLO: get debe dar los jugadores de la ficha (sin los que no tienen nombre): %', r->'valorant:900201'->'p'; end if;
  if r ? 'csgo:900202' or r ? 'no:existe' then raise exception 'FALLO: get devuelve equipos sin detalle ni jugadores o que no existen: %', r; end if;
  perform sync_jugadores_put(sec, '[{"id":"csgo:900202","jug":{"sin_t":{"g":{"total":1}}}}]');
  if (sync_jugadores_get(sec, array['csgo:900202'])->'csgo:900202'->'t'->>'sin_t')::bigint <> 0 then raise exception 'FALLO: un jugador sin t debe dar 0'; end if;
  resumen := resumen || 'get con fechas · ';

  -- ---------------------------------------------------------- 5. lo que no vale
  n := sync_jugadores_put(sec, '[{"id":"csgo:999999","jug":{"x":{"t":1}}}]');
  if n <> 0 or exists (select 1 from teams where id = 'csgo:999999') then raise exception 'FALLO: un equipo que no existe no se crea (n=%)', n; end if;
  fallo := false; begin perform sync_jugadores_put(sec, '[{"id":"csgo:900203","jug":{"malo":[1,2]}}]'); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: acepta un jugador que no es objeto'; end if;
  fallo := false; begin perform sync_jugadores_put(sec, '[{"id":"csgo:900203","jug":{"malo":"texto"}}]'); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: acepta un jugador de texto'; end if;
  n := sync_jugadores_put(sec, '[{"id":"csgo:900203","jug":[1]},{"id":"","jug":{"a":{}}},{"jug":{"a":{}}},{"id":"csgo:900203"}]');
  if n <> 0 then raise exception 'FALLO: filas sin jug objeto o sin id deben ignorarse (n=%)', n; end if;
  if (select pj from teams where id = 'csgo:900203') is not null then raise exception 'FALLO: una fila rechazada dejo rastro'; end if;
  resumen := resumen || 'basura rechazada · ';

  -- ---------------------------------------------------------- 6. como mucho 24 jugadores: se van los mas viejos
  grande := '{}';
  for i in 1..26 loop grande := grande || jsonb_build_object('j' || lpad(i::text, 2, '0'), jsonb_build_object('t', 10000 + i)); end loop;
  perform sync_jugadores_put(sec, jsonb_build_array(jsonb_build_object('id', 'csgo:900203', 'jug', grande)));
  select pj into r from teams where id = 'csgo:900203';
  if (select count(*) from jsonb_object_keys(r)) <> 24 then raise exception 'FALLO: debia quedar en 24 jugadores y quedan %', (select count(*) from jsonb_object_keys(r)); end if;
  if r ? 'j01' or r ? 'j02' or not (r ? 'j26' and r ? 'j03') then raise exception 'FALLO: debian irse j01 y j02 (los mas viejos) y quedarse el resto'; end if;
  resumen := resumen || 'maximo de 24 jugadores · ';

  -- ---------------------------------------------------------- 7. mas de 150 KB se rechaza y no deja rastro
  select pj into r from teams where id = 'csgo:900203';
  fallo := false; begin perform sync_jugadores_put(sec, jsonb_build_array(jsonb_build_object('id', 'csgo:900203', 'jug', jsonb_build_object('j26', jsonb_build_object('t', 99999, 'x', repeat('x', 160000)))))); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: acepta mas de 150 KB'; end if;
  if (select pj from teams where id = 'csgo:900203') is distinct from r then raise exception 'FALLO: un guardado rechazado cambio lo guardado'; end if;
  resumen := resumen || 'limite de 150 KB · ';

  -- ---------------------------------------------------------- 8. guardar la ficha del equipo no borra el detalle de jugadores
  perform sync_equipos_extra_put(sec, '[{"id":"valorant:900201","extra":{"v":1,"ver":2,"nombre":"Equipo Uno bis"}}]');
  select * into e from teams where id = 'valorant:900201';
  if e.extra->>'nombre' <> 'Equipo Uno bis' or not (e.pj ? 'coconut') then raise exception 'FALLO: la ficha del equipo y el detalle de jugadores se pisan: %', e.pj; end if;
  perform sync_teams_put(sec, '[{"id":"valorant:900201","data":{"w":1,"g":1}}]');
  if not (select pj ? 'coconut' from teams where id = 'valorant:900201') then raise exception 'FALLO: sync_teams_put borro el detalle de jugadores'; end if;
  resumen := resumen || 'ficha de equipo y jugadores no se pisan · ';

  -- ---------------------------------------------------------- 8b. get da como mucho 8 jugadores de la ficha
  perform sync_equipos_extra_put(sec, '[{"id":"csgo:900203","extra":{"v":1,"ver":2,"jugadores":[{"nombre":"a1"},{"nombre":"a2"},{"nombre":"a3"},{"nombre":"a4"},{"nombre":"a5"},{"nombre":"a6"},{"nombre":"a7"},{"nombre":"a8"},{"nombre":"a9"},{"nombre":"a10"}]}}]');
  if jsonb_array_length(sync_jugadores_get(sec, array['csgo:900203'])->'csgo:900203'->'p') <> 8 then raise exception 'FALLO: get debe dar como mucho 8 jugadores de la ficha'; end if;
  resumen := resumen || 'jugadores de la ficha, hasta 8 · ';

  -- ---------------------------------------------------------- 9. un jugador de la app
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  set local role authenticated;
  select pj into r from teams where id = 'valorant:900201';
  if r is null or not (r ? 'coconut') then reset role; raise exception 'FALLO: un jugador no ve el detalle de jugadores'; end if;
  fallo := false; begin update teams set pj = '{"x":{}}' where id = 'valorant:900201'; get diagnostics n = row_count; if n > 0 then fallo := false; else fallo := true; end if; exception when others then fallo := true; end;
  if not fallo then reset role; raise exception 'FALLO: un jugador puede escribir directamente en teams.pj'; end if;
  fallo := false; begin perform sync_jugadores_put('x', '[{"id":"valorant:900201","jug":{"a":{"t":1}}}]'); exception when others then fallo := true; end;
  if not fallo then reset role; raise exception 'FALLO: un jugador escribe sin la clave'; end if;
  fallo := false; begin perform sync_jugadores_get('x', array['valorant:900201']); exception when others then fallo := true; end;
  if not fallo then reset role; raise exception 'FALLO: un jugador lee las fechas sin la clave'; end if;
  reset role;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  select count(*) into n from teams;
  if n <> 0 then reset role; raise exception 'FALLO: alguien sin cuenta ve las fichas (%)', n; end if;
  reset role;
  resumen := resumen || 'jugador ve pero no escribe, sin cuenta no ve nada';

  raise exception 'PRUEBA SUPERADA: %', resumen;
end $$;
