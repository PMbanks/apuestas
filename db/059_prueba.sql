-- Prueba de db/059_foto_ajuste.sql, para el editor SQL de Supabase. Va DESPUES de 059.
-- Todo dentro de un bloque que acaba en error A PROPOSITO, asi que no queda nada.
-- 1) cada jugador cambia SOLO lo suyo: set_foto_ajuste como el primero no toca al segundo.
-- 2) se guarda sin espacios; null (o vacio) lo quita; los limites que valen, valen.
-- 3) no deja basura: fuera de rango, mal escrito, sin entrar, ni la columna directa.
-- 4) los permisos: anon no puede llamar, un jugador si.
do $$
declare jug uuid[] := array(select id from players order by created_at, id limit 2); r text; ok boolean; v text;
begin
  if array_length(jug, 1) < 2 then raise exception 'FALLO: hacen falta dos jugadores para probar'; end if;
  update players set foto_ajuste = null where id = any(jug);
  -- 1) entro como el primero
  perform set_config('request.jwt.claim.sub', jug[1]::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', jug[1]::text, 'role', 'authenticated')::text, true);
  r := set_foto_ajuste(' -4.5, 6 ,120 ');
  select foto_ajuste into v from players where id = jug[1];
  if r <> '-4.5,6,120' or v is distinct from '-4.5,6,120' then raise exception 'FALLO: no guarda el ajuste limpio (% / %)', r, v; end if;
  select foto_ajuste into v from players where id = jug[2];
  if v is not null then raise exception 'FALLO: ha cambiado lo del otro jugador'; end if;
  -- 2) cambiar, limites que si valen y quitar
  perform set_foto_ajuste('0,0,100');
  select foto_ajuste into v from players where id = jug[1];
  if v is distinct from '0,0,100' then raise exception 'FALLO: no cambia el ajuste'; end if;
  foreach r in array array['-50,50,40', '50,-50,300', '12.25,-7.5,99.5'] loop
    perform set_foto_ajuste(r);
    select foto_ajuste into v from players where id = jug[1];
    if v is distinct from r then raise exception 'FALLO: no deja el ajuste valido "%"', r; end if;
  end loop;
  r := set_foto_ajuste(null);
  select foto_ajuste into v from players where id = jug[1];
  if r is not null or v is not null then raise exception 'FALLO: set_foto_ajuste(null) no quita el ajuste'; end if;
  perform set_foto_ajuste('3,3,150'); perform set_foto_ajuste('');
  select foto_ajuste into v from players where id = jug[1];
  if v is not null then raise exception 'FALLO: set_foto_ajuste vacio no quita el ajuste'; end if;
  -- 3) basura fuera
  foreach r in array array['0,0', '0,0,100,5', 'a,b,c', '51,0,100', '-51,0,100', '0,51,100', '0,-50.5,100', '0,0,39', '0,0,301', '0,0,-100', '1e1,0,100', '0,0,100; drop table players', 'url(x)', ',,', '0,0,', '0.123,0,100', '0,0,1000'] loop
    ok := false; begin perform set_foto_ajuste(r); exception when others then ok := sqlerrm like '%no vale%'; end;
    if not ok then raise exception 'FALLO: deja poner el ajuste "%"', r; end if;
  end loop;
  ok := false; begin update players set foto_ajuste = '0,0,500' where id = jug[2]; exception when check_violation then ok := true; end;
  if not ok then raise exception 'FALLO: la columna acepta zoom 500'; end if;
  ok := false; begin update players set foto_ajuste = 'rojo' where id = jug[2]; exception when check_violation then ok := true; end;
  if not ok then raise exception 'FALLO: la columna acepta rojo'; end if;
  ok := false; begin update players set foto_ajuste = '80,0,100' where id = jug[2]; exception when check_violation then ok := true; end;
  if not ok then raise exception 'FALLO: la columna acepta x 80'; end if;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  ok := false; begin perform set_foto_ajuste('0,0,100'); exception when others then ok := sqlerrm like '%entrar%'; end;
  if not ok then raise exception 'FALLO: deja cambiar el ajuste sin entrar'; end if;
  select foto_ajuste into v from players where id = jug[2];
  if v is not null then raise exception 'FALLO: el segundo ha cambiado'; end if;
  -- 4) permisos
  if has_function_privilege('anon', 'set_foto_ajuste(text)', 'execute') then raise exception 'FALLO: anon puede llamar a set_foto_ajuste'; end if;
  if not has_function_privilege('authenticated', 'set_foto_ajuste(text)', 'execute') then raise exception 'FALLO: los jugadores no pueden llamar a set_foto_ajuste'; end if;
  raise exception 'PRUEBA SUPERADA (se deshace todo): cada uno cambia solo lo suyo, se guarda limpio, null lo quita, no deja basura ni sin entrar, y solo los jugadores llaman.';
end $$;
