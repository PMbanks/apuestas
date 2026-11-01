-- Prueba de db/057_avatar.sql, para el editor SQL de Supabase. Va DESPUES de 057.
-- Todo dentro de un bloque que acaba en error A PROPOSITO, asi que no queda nada.
-- 1) cada jugador cambia SOLO lo suyo: set_ring / set_avatar como el primero no tocan al segundo.
-- 2) el color se guarda en minusculas; null (o vacio) lo quita; la foto igual.
-- 3) no deja basura: colores mal escritos, claves raras, ni sin entrar, ni la columna directa.
-- 4) los permisos: anon no puede llamar, un jugador si.
do $$
declare jug uuid[] := array(select id from players order by created_at, id limit 2); r text; ok boolean;
begin
  if array_length(jug, 1) < 2 then raise exception 'FALLO: hacen falta dos jugadores para probar'; end if;
  update players set ring = null, avatar = null where id = any(jug);
  -- 1) entro como el primero
  perform set_config('request.jwt.claim.sub', jug[1]::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', jug[1]::text, 'role', 'authenticated')::text, true);
  r := set_ring('#FF7AB8');
  if r <> '#ff7ab8' or (select ring from players where id = jug[1]) is distinct from '#ff7ab8' then raise exception 'FALLO: no guarda el aro en minusculas (%)', r; end if;
  r := set_avatar('a03-cheems');
  if r <> 'a03-cheems' or (select avatar from players where id = jug[1]) is distinct from 'a03-cheems' then raise exception 'FALLO: no guarda la foto'; end if;
  if (select ring from players where id = jug[2]) is not null or (select avatar from players where id = jug[2]) is not null then raise exception 'FALLO: ha cambiado lo del otro jugador'; end if;
  -- 2) cambiar y quitar
  perform set_ring('#4fd6e8');
  if (select ring from players where id = jug[1]) is distinct from '#4fd6e8' then raise exception 'FALLO: no cambia el aro'; end if;
  r := set_ring(null);
  if r is not null or (select ring from players where id = jug[1]) is not null then raise exception 'FALLO: set_ring(null) no quita el aro'; end if;
  perform set_ring('#123abc'); perform set_ring('');
  if (select ring from players where id = jug[1]) is not null then raise exception 'FALLO: set_ring vacio no quita el aro'; end if;
  perform set_avatar('a40-rana-meltdown');
  r := set_avatar(null);
  if r is not null or (select avatar from players where id = jug[1]) is not null then raise exception 'FALLO: set_avatar(null) no vuelve a la de siempre'; end if;
  -- 3) basura fuera
  foreach r in array array['red', '#fff', '#ggg000', '#12345', '#1234567', 'ff7ab8', '#ff7ab8; drop table players', 'url(x)'] loop
    ok := false; begin perform set_ring(r); exception when others then ok := sqlerrm like '%no vale%'; end;
    if not ok then raise exception 'FALLO: deja poner el color "%"', r; end if;
  end loop;
  foreach r in array array['a1-x', 'b01-x', 'a01-', 'a01-Mayus', 'a01-con espacio', 'a01-x"); }body{display:none', '../app', 'a01-' || repeat('x', 40), 'http://x.com/a.png'] loop
    ok := false; begin perform set_avatar(r); exception when others then ok := sqlerrm like '%no existe%'; end;
    if not ok then raise exception 'FALLO: deja poner la foto "%"', r; end if;
  end loop;
  ok := false; begin update players set ring = 'rojo' where id = jug[2]; exception when check_violation then ok := true; end;
  if not ok then raise exception 'FALLO: la columna ring acepta rojo'; end if;
  ok := false; begin update players set avatar = '../x' where id = jug[2]; exception when check_violation then ok := true; end;
  if not ok then raise exception 'FALLO: la columna avatar acepta ../x'; end if;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  ok := false; begin perform set_ring('#ffffff'); exception when others then ok := sqlerrm like '%entrar%'; end;
  if not ok then raise exception 'FALLO: deja cambiar el aro sin entrar'; end if;
  ok := false; begin perform set_avatar('a01-stonks'); exception when others then ok := sqlerrm like '%entrar%'; end;
  if not ok then raise exception 'FALLO: deja cambiar la foto sin entrar'; end if;
  if (select ring from players where id = jug[2]) is not null or (select avatar from players where id = jug[2]) is not null then raise exception 'FALLO: el segundo ha cambiado'; end if;
  -- 4) permisos
  if has_function_privilege('anon', 'set_ring(text)', 'execute') or has_function_privilege('anon', 'set_avatar(text)', 'execute') then raise exception 'FALLO: anon puede llamar a set_ring o set_avatar'; end if;
  if not has_function_privilege('authenticated', 'set_ring(text)', 'execute') or not has_function_privilege('authenticated', 'set_avatar(text)', 'execute') then
    raise exception 'FALLO: los jugadores no pueden llamar a set_ring o set_avatar'; end if;
  raise exception 'PRUEBA SUPERADA (se deshace todo): cada uno cambia solo lo suyo, el color va en minusculas, null lo quita, no deja basura ni sin entrar, y solo los jugadores llaman.';
end $$;
