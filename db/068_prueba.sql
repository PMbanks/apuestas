-- Prueba de db/068_tratos_publicos.sql, para el editor SQL de Supabase. Va DESPUES de 068.
-- Con tres jugadores de verdad (1 propone a 2, 3 mira desde fuera) comprueba: que el 3 LEE el trato de los otros dos en la tabla y en
-- mk_estado (con las V-Bucks, la nota y el estado), que el 3 NO puede aceptarlo, rechazarlo ni cancelarlo (y el trato sigue abierto y
-- el dinero sin moverse), que no puede escribir en mk_tratos a mano, que el que propone no puede aceptar su propio trato, y que despues
-- de cancelarlo su dueno el 3 lo sigue viendo, ya como cancelado. Al final lanza un error A PROPOSITO para que se deshaga todo (no
-- queda ni el trato ni el saldo de prueba). Si todo va bien, el error dice "PRUEBA SUPERADA" con el resumen.

create or replace function pg_temp.yo(u uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  perform set_config('request.jwt.claims', json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
end $f$;

do $$
declare
  jug uuid[] := array(select id from players order by created_at, username);
  a uuid; b uuid; c uuid; r jsonb; tid bigint; n int; st text; err text; s1 int; s2 int; resumen text := '';
  saldo constant text := 'select coalesce(sum(amount), 0)::int from ledger where player = $1';
begin
  if cardinality(jug) < 3 then raise exception 'FALLO: hacen falta al menos tres jugadores'; end if;
  a := jug[1]; b := jug[2]; c := jug[3];
  insert into ledger(player, amount, kind, note) select id, 100000, 'ajuste', 'saldo de prueba' from players;

  -- 1. el jugador 1 propone un trato al 2: da 37 V-Bucks y pide 11, con nota
  perform pg_temp.yo(a);
  r := mk_trato_crear(b, '{}', 37, '{}', 11, 'prueba 068');
  tid := (r->>'id')::bigint;
  if tid is null then raise exception 'FALLO: no se ha creado el trato de prueba'; end if;
  execute saldo into s1 using a; execute saldo into s2 using b;

  -- 2. el 3 lo lee en la tabla (con la politica de lectura, como jugador)
  perform pg_temp.yo(c);
  set local role authenticated;
  select count(*) into n from mk_tratos where id = tid and de = a and para = b and da_vb = 37 and pide_vb = 11 and nota = 'prueba 068' and status = 'abierto';
  reset role;
  if n <> 1 then raise exception 'FALLO: un tercero no ve el trato de otros dos en mk_tratos (ve %)', n; end if;
  resumen := resumen || 'El 3 lee en la tabla el trato de 1 a 2. ';

  -- 3. y en mk_estado, que es lo que pide la pantalla
  set local role authenticated;
  r := mk_estado();
  reset role;
  select count(*) into n from jsonb_array_elements(r->'tratos') x
    where (x->>'id')::bigint = tid and x->>'de' = a::text and x->>'para' = b::text and (x->>'da_vb')::int = 37 and (x->>'pide_vb')::int = 11
      and x->>'nota' = 'prueba 068' and x->>'status' = 'abierto';
  if n <> 1 then raise exception 'FALLO: mk_estado no le da al 3 el trato de 1 a 2'; end if;
  resumen := resumen || format('mk_estado le da %s tratos de todos. ', jsonb_array_length(r->'tratos'));

  -- 4. el 3 no puede aceptarlo, ni rechazarlo, ni cancelarlo
  begin
    set local role authenticated; perform mk_trato_aceptar(tid); reset role;
    raise exception 'FALLO: el 3 ha podido aceptar un trato que no es para el';
  exception when others then reset role; get stacked diagnostics err = message_text;
    if err like 'FALLO%' then raise exception '%', err; end if;
    if err <> 'Ese trato no es para ti' then raise exception 'FALLO: aceptar del 3 falla por otra cosa: %', err; end if;
  end;
  begin
    set local role authenticated; perform mk_trato_rechazar(tid); reset role;
    raise exception 'FALLO: el 3 ha podido rechazar un trato que no es para el';
  exception when others then reset role; get stacked diagnostics err = message_text;
    if err like 'FALLO%' then raise exception '%', err; end if;
    if err <> 'Ese trato no es para ti' then raise exception 'FALLO: rechazar del 3 falla por otra cosa: %', err; end if;
  end;
  begin
    set local role authenticated; perform mk_trato_cancelar(tid); reset role;
    raise exception 'FALLO: el 3 ha podido cancelar un trato que no es suyo';
  exception when others then reset role; get stacked diagnostics err = message_text;
    if err like 'FALLO%' then raise exception '%', err; end if;
    if err <> 'Ese trato no es tuyo' then raise exception 'FALLO: cancelar del 3 falla por otra cosa: %', err; end if;
  end;
  -- ni tocarlo a mano
  begin
    set local role authenticated;
    update mk_tratos set status = 'aceptado' where id = tid;
    get diagnostics n = row_count;
    reset role;
    if n > 0 then raise exception 'FALLO: el 3 ha podido cambiar el trato a mano'; end if;
  exception when insufficient_privilege then reset role; end;
  select status into st from mk_tratos where id = tid;
  if st <> 'abierto' then raise exception 'FALLO: el trato ya no esta abierto tras los intentos del 3 (%)', st; end if;
  execute saldo into n using a; if n <> s1 then raise exception 'FALLO: el saldo del 1 se ha movido'; end if;
  execute saldo into n using b; if n <> s2 then raise exception 'FALLO: el saldo del 2 se ha movido'; end if;
  resumen := resumen || 'El 3 no puede aceptar, rechazar, cancelar ni tocarlo a mano, y nada se mueve. ';

  -- 5. el que propone no puede aceptar su propio trato
  perform pg_temp.yo(a);
  begin
    set local role authenticated; perform mk_trato_aceptar(tid); reset role;
    raise exception 'FALLO: el 1 ha podido aceptar su propio trato';
  exception when others then reset role; get stacked diagnostics err = message_text;
    if err like 'FALLO%' then raise exception '%', err; end if;
  end;

  -- 6. su dueno lo cancela (eso si puede) y el 3 lo sigue viendo, ya cancelado
  set local role authenticated; perform mk_trato_cancelar(tid); reset role;
  execute saldo into n using a; if n <> s1 + 37 then raise exception 'FALLO: cancelar no devuelve los 37 al 1 (% frente a %)', n, s1 + 37; end if;
  perform pg_temp.yo(c);
  set local role authenticated;
  r := mk_estado();
  select count(*) into n from mk_tratos where id = tid and status = 'cancelado';
  reset role;
  if n <> 1 then raise exception 'FALLO: el 3 no ve el trato cancelado en la tabla'; end if;
  if not exists (select 1 from jsonb_array_elements(r->'tratos') x where (x->>'id')::bigint = tid and x->>'status' = 'cancelado') then
    raise exception 'FALLO: mk_estado no le da al 3 el trato cancelado';
  end if;
  resumen := resumen || 'Cancelado por su dueno (devuelve los 37) y el 3 lo sigue viendo como cancelado.';

  raise exception 'PRUEBA SUPERADA (no se ha guardado nada). %', resumen;
end $$;
