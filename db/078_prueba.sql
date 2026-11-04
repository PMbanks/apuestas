-- Prueba de db/078_jg_ultimas_arreglo.sql, para el editor SQL de Supabase. Va DESPUES de 077 y 078.
-- Comprueba que jg_ultimas devuelve filas enteras (jugador, apuesta, pago...) y no solo el multiplicador, en blackjack, cara o cruz y minas.
-- Lanza un error A PROPOSITO para que se deshaga todo. Si todo va bien, dice "PRUEBA SUPERADA"; si no, "FALLO".

create or replace function pg_temp.yo(u uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  perform set_config('request.jwt.claims', json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
end $f$;

do $$
declare
  jug uuid[] := array(select id from players order by created_at, username);
  a uuid; b uuid; rid bigint; r jsonb; u jsonb;
begin
  if cardinality(jug) < 2 then raise exception 'FALLO: hacen falta al menos dos jugadores'; end if;
  a := jug[1]; b := jug[2];
  perform pg_temp.yo(a);
  insert into bjm_ronda(estado, cierra, fin_at) values ('fin', now(), now()) returning id into rid;
  insert into bjm_mano(ronda, asiento, player, stake, total, estado, resultado, pago, cerrada) values (rid, 1, b, 40, 40, 'plantada', 'gana', 80, now() + interval '2 hours');
  r := jg_ultimas('blackjack');
  u := r->'jugadas'->0;
  if jsonb_typeof(u) <> 'object' or (u->>'player')::uuid <> b or (u->>'stake')::int <> 40 or (u->>'pago')::int <> 80 or u->>'que' <> 'gana' then raise exception 'FALLO: blackjack devuelve %', u; end if;
  insert into jg_moneda(creador, stake, lado, estado, rival, ganador, salio, creado, cerrado) values (a, 30, 'cara', 'hecho', b, b, 'cruz', now(), now() + interval '2 hours');
  u := jg_ultimas('moneda')->'jugadas'->0;
  if jsonb_typeof(u) <> 'object' or (u->>'player')::uuid <> b or (u->>'rival')::uuid <> a or (u->>'stake')::int <> 30 or u->>'sale' <> 'cruz' then raise exception 'FALLO: cara o cruz devuelve %', u; end if;
  insert into jg_minas(player, stake, minas, hash, estado, pago, mult, cerrada) values (b, 25, 3, 'x', 'cobrada', 50, 2, now() + interval '2 hours');
  u := jg_ultimas('minas')->'jugadas'->0;
  if jsonb_typeof(u) <> 'object' or (u->>'player')::uuid <> b or (u->>'stake')::int <> 25 or (u->>'x')::numeric <> 2 then raise exception 'FALLO: minas devuelve %', u; end if;
  r := jg_ultimas('ruleta'); r := jg_ultimas('carrera');
  raise exception 'PRUEBA SUPERADA: jg_ultimas devuelve la fila entera en blackjack, cara o cruz y minas';
end $$;
