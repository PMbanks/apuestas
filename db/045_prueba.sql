-- Prueba de db/045_equipos.sql, para el editor SQL de Supabase. Va DESPUES de 045_equipos.sql (y de 001 a 044).
-- Prueba: que sin la clave del sincronizador no se lee nada; que get devuelve la version de cada ficha (p = 1 si la ficha es vieja, no trae
-- version o la version es basura, 2 si es del formato nuevo); que sigue devolviendo t, i y f como antes; que una ficha de formato 2
-- con titulos, roles, agentes y cambios se guarda y se lee entera; que sigue rechazando lo que pesa mas de 150 KB; y que un jugador no puede
-- llamar a get sin la clave. Al final lanza un error A PROPOSITO para que se deshaga todo: no queda nada guardado.
-- Si todo va bien, el error dice "PRUEBA SUPERADA" con el resumen. Si algo falla, dice "FALLO" y que.
do $$
declare
  jug uuid[] := array(select id from players order by created_at, id);
  sec text := 'secreto-de-prueba'; resumen text := ''; n int; fallo boolean; r jsonb; e record; ficha jsonb;
begin
  if cardinality(jug) < 1 then raise exception 'FALLO: hace falta al menos un jugador'; end if;
  insert into settings(key, value) values ('sync_secret', to_jsonb(sec)) on conflict (key) do update set value = excluded.value;
  delete from teams where id in ('csgo:900101', 'valorant:900102', 'csgo:900103', 'csgo:900104', 'csgo:900105');

  -- ---------------------------------------------------------- 1. sin clave no se lee
  fallo := false; begin perform sync_equipos_extra_get('mala', array['csgo:900101']); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: get acepta una clave mala'; end if;
  fallo := false; begin perform sync_equipos_extra_get(null, array['csgo:900101']); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: get acepta clave nula'; end if;
  resumen := resumen || 'claves malas rechazadas · ';

  -- ---------------------------------------------------------- 2. version de cada ficha
  perform sync_equipos_extra_put(sec, '[{"id":"csgo:900101","extra":{"v":1}},
                                        {"id":"valorant:900102","extra":{"v":1,"ver":2}},
                                        {"id":"csgo:900103","extra":{"v":1,"ver":"abc"}},
                                        {"id":"csgo:900104","extra":{"v":1,"ver":-5}}]');
  perform sync_equipos_extra_put(sec, '[{"id":"csgo:900105","fallo":true}]');
  r := sync_equipos_extra_get(sec, array['csgo:900101', 'valorant:900102', 'csgo:900103', 'csgo:900104', 'csgo:900105', 'no:existe']);
  if (r->'csgo:900101'->>'p')::int is distinct from 1 then raise exception 'FALLO: una ficha sin version debe dar p = 1: %', r->'csgo:900101'; end if;
  if (r->'valorant:900102'->>'p')::int is distinct from 2 then raise exception 'FALLO: una ficha de version 2 debe dar p = 2: %', r->'valorant:900102'; end if;
  if (r->'csgo:900103'->>'p')::int is distinct from 1 then raise exception 'FALLO: una version que no es numero debe dar p = 1: %', r->'csgo:900103'; end if;
  if (r->'csgo:900104'->>'p')::int is distinct from 1 then raise exception 'FALLO: una version negativa debe dar p = 1: %', r->'csgo:900104'; end if;
  if (r->'csgo:900105'->>'p')::int is distinct from 1 or (r->'csgo:900105'->>'f')::int is distinct from 1 or (r->'csgo:900105'->>'t') is not null then
    raise exception 'FALLO: un equipo que solo tiene un fallo debe dar p = 1, f = 1 y sin t: %', r->'csgo:900105'; end if;
  if r ? 'no:existe' then raise exception 'FALLO: get devuelve filas que no existen'; end if;
  resumen := resumen || 'version de cada ficha · ';

  -- ---------------------------------------------------------- 3. t, i y f siguen como antes
  if abs((r->'valorant:900102'->>'t')::numeric - extract(epoch from now()) * 1000) > 3600000 then raise exception 'FALLO: t mal: %', r->'valorant:900102'; end if;
  if abs((r->'valorant:900102'->>'i')::numeric - extract(epoch from now()) * 1000) > 3600000 then raise exception 'FALLO: i mal: %', r->'valorant:900102'; end if;
  if (r->'valorant:900102'->>'f')::int is distinct from 0 then raise exception 'FALLO: f debe ser 0 tras un guardado bueno: %', r->'valorant:900102'; end if;
  resumen := resumen || 't, i y f igual que antes · ';

  -- ---------------------------------------------------------- 4. una ficha de formato 2 entera
  ficha := jsonb_build_object('v', 1, 'ver', 2, 'tipo', 'c', 'nombre', 'Equipo Prueba',
    'jugadores', jsonb_build_array(
      jsonb_build_object('nombre', 'a1', 'pais', 'UA', 'estado', null, 'capitan', true, 'roles', jsonb_build_array('igl')),
      jsonb_build_object('nombre', 'a2', 'pais', 'GB-ENG', 'estado', 'Substitute'),
      jsonb_build_object('nombre', 'a3', 'pais', 'XK', 'estado', 'Inactive', 'inactivo_desde', '2026-10-04'),
      jsonb_build_object('nombre', 'a4', 'pais', 'BR', 'agentes', jsonb_build_array(jsonb_build_object('a', 'sova', 'pj', 10, 'pct', 53)))),
    'staff', jsonb_build_array(jsonb_build_object('nombre', 'c1', 'rol', 'Coach', 'pais', 'UA')),
    'exstaff', jsonb_build_array(jsonb_build_object('nombre', 'c0', 'rol', 'Analyst', 'hasta', '2025-01-01')),
    'exjugadores', jsonb_build_array(jsonb_build_object('nombre', 'x1', 'desde', '2023-06-30', 'hasta', '2026-07-01', 'nuevo_equipo', 'Otro')),
    'titulos', jsonb_build_object('total', 62, 'otros', 16, 'por_tier', jsonb_build_object('S', 40, 'A', 15),
      'lista', jsonb_build_array(jsonb_build_object('f', '2026-05-17', 't', 'IEM Atlanta 2026', 'k', 'S', 'p', 285000))));
  n := sync_equipos_extra_put(sec, jsonb_build_array(jsonb_build_object('id', 'csgo:900101', 'extra', ficha)));
  if n <> 1 then raise exception 'FALLO: put devolvio % y debia ser 1', n; end if;
  select * into e from teams where id = 'csgo:900101';
  if e.extra <> ficha then raise exception 'FALLO: la ficha de formato 2 no se guarda igual que se envia'; end if;
  if (e.extra #>> '{titulos,lista,0,t}') <> 'IEM Atlanta 2026' or (e.extra #>> '{jugadores,3,agentes,0,a}') <> 'sova' then raise exception 'FALLO: dentro de la ficha falta algo'; end if;
  r := sync_equipos_extra_get(sec, array['csgo:900101']);
  if (r->'csgo:900101'->>'p')::int is distinct from 2 then raise exception 'FALLO: tras guardar una ficha de formato 2 get debe dar p = 2: %', r; end if;
  resumen := resumen || 'ficha de formato 2 entera · ';

  -- ---------------------------------------------------------- 5. el limite de 150 KB sigue
  fallo := false; begin perform sync_equipos_extra_put(sec, jsonb_build_array(jsonb_build_object('id', 'csgo:900103', 'extra', jsonb_build_object('ver', 2, 't', repeat('x', 160000))))); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: acepta una ficha de mas de 150 KB'; end if;
  if (sync_equipos_extra_get(sec, array['csgo:900103'])->'csgo:900103'->>'p')::int <> 1 then raise exception 'FALLO: una ficha rechazada cambio la guardada'; end if;
  resumen := resumen || 'limite de 150 KB · ';

  -- ---------------------------------------------------------- 6. un jugador no llama a get sin la clave
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  set local role authenticated;
  fallo := false; begin perform sync_equipos_extra_get('x', array['csgo:900101']); exception when others then fallo := true; end;
  if not fallo then reset role; raise exception 'FALLO: un jugador lee las versiones sin la clave'; end if;
  reset role;
  resumen := resumen || 'jugador sin clave no lee';

  raise exception 'PRUEBA SUPERADA: %', resumen;
end $$;
