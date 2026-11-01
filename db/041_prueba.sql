-- Prueba de db/041_ocultas.sql, para el editor SQL de Supabase. Va DESPUES de 041.
-- Todo dentro de un bloque que acaba en error A PROPOSITO, asi que no queda nada.
-- 1) cada jugador cambia SOLO las suyas: set_ocultas como el primero no toca las del segundo.
-- 2) limpia lo que no vale (deporte 'x', id vacio, duplicados) y guarda el nombre de la liga.
-- 3) no deja algo que no sea un objeto, ni sin entrar, ni mas de 120 ligas; la columna tampoco acepta un array.
do $$
declare jug uuid[] := array(select id from players order by created_at, id limit 2); r jsonb; ok boolean; i int; gr jsonb;
begin
  if array_length(jug, 1) < 2 then raise exception 'FALLO: hacen falta dos jugadores para probar'; end if;
  update players set ocultas = null where id = any(jug);
  -- 1) entro como el primero
  perform set_config('request.jwt.claim.sub', jug[1]::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', jug[1]::text, 'role', 'authenticated')::text, true);
  r := set_ocultas('{"d":["v","u"],"l":{"esp.1":"LaLiga"}}'::jsonb);
  if r <> '{"d":["u","v"],"l":{"esp.1":"LaLiga"}}'::jsonb then raise exception 'FALLO: devuelve %', r; end if;
  if (select ocultas from players where id = jug[1]) is distinct from r then raise exception 'FALLO: no guarda lo que devuelve'; end if;
  if (select ocultas from players where id = jug[2]) is not null then raise exception 'FALLO: ha cambiado las del otro jugador'; end if;
  -- 2)
  r := set_ocultas('{"d":["v","x","v","c"],"l":{"":"vacia","esp.2":"Segunda","larga-larga-larga-larga-larga-larga-larga-larga-larga-larga-larga-larga":"x"}}'::jsonb);
  if r <> '{"d":["c","v"],"l":{"esp.2":"Segunda"}}'::jsonb then raise exception 'FALLO: no limpia: %', r; end if;
  r := set_ocultas('{"d":"v","l":[1,2]}'::jsonb);
  if r <> '{"d":[],"l":{}}'::jsonb then raise exception 'FALLO: con d y l mal formados deberia quedar vacio: %', r; end if;
  -- 3)
  ok := false;
  begin perform set_ocultas('[]'::jsonb); exception when others then ok := sqlerrm like '%lista de ocultas%'; end;
  if not ok then raise exception 'FALLO: deja guardar un array'; end if;
  ok := false;
  begin perform set_ocultas(null); exception when others then ok := sqlerrm like '%lista de ocultas%'; end;
  if not ok then raise exception 'FALLO: deja guardar null'; end if;
  gr := '{}'::jsonb; for i in 1..121 loop gr := gr || jsonb_build_object('liga' || i, 'L' || i); end loop;
  ok := false;
  begin perform set_ocultas(jsonb_build_object('d', '[]'::jsonb, 'l', gr)); exception when others then ok := sqlerrm like '%Demasiadas%'; end;
  if not ok then raise exception 'FALLO: deja guardar mas de 120 ligas'; end if;
  ok := false;
  begin update players set ocultas = '[1]'::jsonb where id = jug[2]; exception when check_violation then ok := true; end;
  if not ok then raise exception 'FALLO: la columna acepta un array'; end if;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  ok := false;
  begin perform set_ocultas('{"d":["v"],"l":{}}'::jsonb); exception when others then ok := sqlerrm like '%entrar%'; end;
  if not ok then raise exception 'FALLO: deja cambiarlas sin entrar'; end if;
  if (select ocultas from players where id = jug[2]) is not null then raise exception 'FALLO: el segundo ha cambiado'; end if;
  raise exception 'PRUEBA SUPERADA (se deshace todo): cada uno cambia solo las suyas, limpia lo que no vale, no deja arrays, null, mas de 120 ligas ni sin entrar.';
end $$;
