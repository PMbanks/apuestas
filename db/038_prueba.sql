-- Prueba de db/038_moneda.sql, para el editor SQL de Supabase. Va DESPUES de 038.
-- Todo dentro de un bloque que acaba en error A PROPOSITO, asi que no queda nada.
-- 1) cada jugador cambia SOLO la suya: set_moneda('sol') como el primero no toca la del segundo.
-- 2) 'vbucks' se guarda como 'vbucks' (no null), y otra moneda la cambia.
-- 3) no deja una moneda que no existe, ni sin entrar.
do $$
declare jug uuid[] := array(select id from players order by created_at, id limit 2); otra text; r text; ok boolean;
begin
  if array_length(jug, 1) < 2 then raise exception 'FALLO: hacen falta dos jugadores para probar'; end if;
  update players set moneda = null where id = any(jug);
  -- 1) entro como el primero
  perform set_config('request.jwt.claim.sub', jug[1]::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', jug[1]::text, 'role', 'authenticated')::text, true);
  r := set_moneda('sol');
  if r <> 'sol' or (select moneda from players where id = jug[1]) is distinct from 'sol' then raise exception 'FALLO: no guarda sol'; end if;
  select moneda into otra from players where id = jug[2];
  if otra is not null then raise exception 'FALLO: ha cambiado la del otro jugador (%)', otra; end if;
  -- 2)
  perform set_moneda('vbucks');
  if (select moneda from players where id = jug[1]) is distinct from 'vbucks' then raise exception 'FALLO: vbucks no se guarda como vbucks'; end if;
  perform set_moneda('robux');
  if (select moneda from players where id = jug[1]) is distinct from 'robux' then raise exception 'FALLO: no cambia a robux'; end if;
  -- 3)
  ok := false;
  begin perform set_moneda('euros'); exception when others then ok := sqlerrm like '%no existe%'; end;
  if not ok then raise exception 'FALLO: deja poner euros'; end if;
  ok := false;
  begin perform set_moneda(null); exception when others then ok := sqlerrm like '%no existe%'; end;
  if not ok then raise exception 'FALLO: deja poner null'; end if;
  ok := false;
  begin update players set moneda = 'euros' where id = jug[2]; exception when check_violation then ok := true; end;
  if not ok then raise exception 'FALLO: la columna acepta euros'; end if;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  ok := false;
  begin perform set_moneda('usd'); exception when others then ok := sqlerrm like '%entrar%'; end;
  if not ok then raise exception 'FALLO: deja cambiarla sin entrar'; end if;
  if (select moneda from players where id = jug[2]) is not null then raise exception 'FALLO: el segundo ha cambiado'; end if;
  raise exception 'PRUEBA SUPERADA (se deshace todo): cada uno cambia solo la suya, vbucks se guarda, no deja euros ni sin entrar.';
end $$;
