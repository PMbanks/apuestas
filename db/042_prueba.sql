-- Prueba de db/042_retos_abiertos.sql, para el editor SQL de Supabase. Va DESPUES de 042.
-- Todo dentro de un bloque que acaba en error A PROPOSITO, asi que no queda nada (ni el partido ni el dinero de prueba).
-- Con tres jugadores (A, B, C) y un partido de prueba que empieza dentro de 2 horas:
-- 1) A abre un reto a cualquiera: queda sin destinatario y le quita lo puesto.
-- 2) A no puede entrar en el suyo; B no puede elegir el mismo resultado que A; C sin saldo no puede entrar.
-- 3) B entra: el reto pasa a aceptado con B de rival y B paga. C, que llega despues, recibe "Ya ha entrado otro".
-- 4) challenge_answer no deja contestar un reto abierto; challenge_cancel ya no cancela nada.
-- 5) un reto abierto que nadie coge se devuelve al empezar el partido (y ya no se puede entrar en el).
-- 6) un reto a un amigo sigue como siempre: C no puede entrar ni contestar; el amigo si.
-- 7) al acabar el partido se paga al que acierta (el doble).
create or replace function pg_temp.yo(u uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  perform set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u::text, 'role', 'authenticated')::text end, true);
end $f$;
create or replace function pg_temp.saldo(u uuid) returns int language sql as $f$ select coalesce(sum(amount), 0)::int from ledger where player = u $f$;
create or replace function pg_temp.falla(q text, que text) returns void language plpgsql as $f$
declare ok boolean := false;
begin
  begin execute q; exception when others then ok := sqlerrm like '%' || que || '%'; if not ok then raise exception 'FALLO: "%" dio otro error: %', q, sqlerrm; end if; end;
  if not ok then raise exception 'FALLO: esto deberia dar "%": %', que, q; end if;
end $f$;
do $$
declare jug uuid[] := array(select id from players order by created_at, id limit 3); a uuid; b uuid; c uuid;
  sa int; sb int; sc int; cid bigint; cid2 bigint; cid3 bigint; r challenges;
begin
  if array_length(jug, 1) < 3 then raise exception 'FALLO: hacen falta tres jugadores para probar'; end if;
  a := jug[1]; b := jug[2]; c := jug[3];
  insert into ledger(player, amount, kind, note) select x, 1000, 'ajuste', 'prueba 042' from unnest(jug) x;
  insert into matches(id, sport, league, league_name, home, away, starts_at, status, odds_1, odds_2)
    values ('prueba042', 'f', 'prueba', 'Prueba', 'Local', 'Visitante', now() + interval '2 hours', 'scheduled', 2, 2);
  -- 1) A abre un reto a cualquiera
  perform pg_temp.yo(a); sa := pg_temp.saldo(a);
  cid := challenge_create('prueba042', null, '1', 100);
  select * into r from challenges where id = cid;
  if r.to_player is not null or r.status <> 'pending' or r.from_player <> a then raise exception 'FALLO: el reto abierto no queda abierto y pendiente'; end if;
  if pg_temp.saldo(a) <> sa - 100 then raise exception 'FALLO: no ha quitado lo puesto a A'; end if;
  -- 2)
  perform pg_temp.falla(format('select challenge_join(%s, %L)', cid, '2'), 'tu propio reto');
  perform pg_temp.yo(b);
  perform pg_temp.falla(format('select challenge_join(%s, %L)', cid, '1'), 'distinto');
  perform pg_temp.yo(c); sc := pg_temp.saldo(c);
  insert into ledger(player, amount, kind, note) values (c, -(sc - 50), 'ajuste', 'prueba 042: C se queda con 50');
  perform pg_temp.falla(format('select challenge_join(%s, %L)', cid, '2'), 'saldo');
  insert into ledger(player, amount, kind, note) values (c, sc - 50, 'ajuste', 'prueba 042: C recupera'); sc := pg_temp.saldo(c);
  perform pg_temp.falla(format('select challenge_join(%s, %L)', 0, '2'), 'no existe');
  -- 3) B entra
  perform pg_temp.yo(b); sb := pg_temp.saldo(b);
  perform challenge_join(cid, '2');
  select * into r from challenges where id = cid;
  if r.status <> 'accepted' or r.to_player <> b or r.to_pick <> '2' then raise exception 'FALLO: B no queda como rival (% % %)', r.status, r.to_player, r.to_pick; end if;
  if pg_temp.saldo(b) <> sb - 100 then raise exception 'FALLO: B no ha pagado'; end if;
  perform pg_temp.yo(c);
  perform pg_temp.falla(format('select challenge_join(%s, %L)', cid, '2'), 'Ya ha entrado otro');
  if pg_temp.saldo(c) <> sc then raise exception 'FALLO: C ha pagado sin entrar'; end if;
  -- 4)
  perform pg_temp.falla(format('select challenge_answer(%s, true, %L)', cid, '2'), 'no es para ti');
  perform pg_temp.yo(a);
  perform pg_temp.falla(format('select challenge_cancel(%s)', cid), 'no se puede cancelar');
  -- 5) un segundo reto abierto que nadie coge
  sa := pg_temp.saldo(a);
  cid2 := challenge_create('prueba042', null, '2', 40);
  if pg_temp.saldo(a) <> sa - 40 then raise exception 'FALLO: el segundo reto no quita lo puesto'; end if;
  perform pg_temp.falla(format('select challenge_cancel(%s)', cid2), 'no se puede cancelar');
  -- 6) un reto a un amigo (B) sigue como siempre
  cid3 := challenge_create('prueba042', b, '1', 30);
  perform pg_temp.yo(c);
  perform pg_temp.falla(format('select challenge_join(%s, %L)', cid3, '2'), 'no es abierto');
  perform pg_temp.falla(format('select challenge_answer(%s, true, %L)', cid3, '2'), 'no es para ti');
  perform pg_temp.yo(a);
  perform pg_temp.falla(format('select challenge_create(%L, %L, %L, 10)', 'prueba042', a, '1'), 'Elige a un amigo');
  perform pg_temp.yo(b); sb := pg_temp.saldo(b);
  perform challenge_answer(cid3, true, '2');
  if (select status from challenges where id = cid3) <> 'accepted' or pg_temp.saldo(b) <> sb - 30 then raise exception 'FALLO: B no puede aceptar el reto de A'; end if;
  -- empieza el partido: el abierto sin rival se devuelve y ya no se puede entrar
  update matches set starts_at = now() - interval '1 minute' where id = 'prueba042';
  perform pg_temp.yo(c);
  perform pg_temp.falla(format('select challenge_join(%s, %L)', cid2, '1'), 'ya ha empezado');
  sa := pg_temp.saldo(a);
  perform settle_challenges();
  if (select status from challenges where id = cid2) <> 'expired' or pg_temp.saldo(a) <> sa + 40 then raise exception 'FALLO: el reto abierto sin rival no se devuelve'; end if;
  if (select status from challenges where id = cid) <> 'accepted' then raise exception 'FALLO: settle ha tocado un reto aceptado antes de acabar'; end if;
  -- 7) acaba con victoria del 1: gana A (en cid y en cid3 puso el 1)
  update matches set status = 'final', winner = '1', score = '2:0' where id = 'prueba042';
  sa := pg_temp.saldo(a); sb := pg_temp.saldo(b);
  perform settle_challenges();
  if (select status from challenges where id = cid) <> 'won_from' or (select status from challenges where id = cid3) <> 'won_from' then raise exception 'FALLO: no marca a A como ganador'; end if;
  if pg_temp.saldo(a) <> sa + 200 + 60 then raise exception 'FALLO: A no cobra el doble (cobra %)', pg_temp.saldo(a) - sa; end if;
  if pg_temp.saldo(b) <> sb then raise exception 'FALLO: B cobra sin ganar'; end if;
  -- sin entrar
  perform pg_temp.yo(null);
  perform pg_temp.falla(format('select challenge_join(%s, %L)', cid, '2'), 'entrar');
  perform pg_temp.falla('select challenge_create(' || quote_literal('prueba042') || ', null, ' || quote_literal('1') || ', 10)', 'entrar');
  raise exception 'PRUEBA SUPERADA (se deshace todo): reto abierto sin destinatario, entra solo el primero, no entras en el tuyo, sin saldo no entras, nadie cancela, sin rival se devuelve al empezar, el amigo sigue igual y el ganador cobra el doble.';
end $$;
