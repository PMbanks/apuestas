-- Prueba de db/053_retos_multi.sql, para el editor SQL de Supabase. Va DESPUES de 053.
-- Todo dentro de un bloque que acaba en error A PROPOSITO, asi que no queda nada (ni los partidos ni el dinero de prueba).
-- Con cinco jugadores (A a E) y partidos de prueba que empiezan dentro de 2 horas:
--  1) 2v1: A reta (1), B entra con el 2 y es su rival, C entra con el 1 y suma al equipo de A. Nadie entra dos veces, ni en su propio reto.
--     Gana el 1: A y C se reparten el bote (300) a partes iguales; B no cobra. Las entradas pasan a ser premios y no sobra ni falta nada.
--  2) 2v2: A y C con el 1, B y D con el 2. Gana el 2: B y D se llevan 200 cada uno.
--  3) 3v1 con bote que no se divide justo (400 entre 3): el primero del lado ganador se lleva la moneda que sobra. Y si gana el solo, cobra todo.
--  4) empate: el que va con la X cobra todo el bote (estado won_other); y X no se puede elegir en un partido sin empate.
--  5) partido anulado: se devuelve la entrada a todos.  6) gana un lado vacio (empate sin nadie con la X): se devuelve a todos.
--  7) plazo cerrado sin rival: A reta, B suma con el mismo lado, empieza el partido: se devuelve a los dos y ya no se puede entrar.
--  8) reto a un amigo: pendiente solo lo contesta el amigo; cuando acepta, ya puede entrar mas gente.
--  9) sin saldo no se entra y no se queda nada cobrado; sin sesion no se entra. get_retos da las entradas y el lado ganador.
-- 10) un reto de 1 contra 1 de toda la vida (dos jugadores) se paga igual que antes (el doble al que acierta).
-- Si todo va bien, el error final dice "PRUEBA SUPERADA".
create or replace function pg_temp.yo(u uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  perform set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u::text, 'role', 'authenticated')::text end, true);
end $f$;
create or replace function pg_temp.saldo(u uuid) returns int language sql as $f$ select coalesce(sum(amount), 0)::int from ledger where player = u $f$;
create or replace function pg_temp.total(us uuid[]) returns int language sql as $f$ select coalesce(sum(amount), 0)::int from ledger where player = any(us) $f$;
create or replace function pg_temp.falla(q text, que text) returns void language plpgsql as $f$
declare ok boolean := false;
begin
  begin execute q; exception when others then ok := sqlerrm like '%' || que || '%'; if not ok then raise exception 'FALLO: "%" dio otro error: %', q, sqlerrm; end if; end;
  if not ok then raise exception 'FALLO: esto deberia dar "%": %', que, q; end if;
end $f$;
create or replace function pg_temp.parte(mid text, st text, w text) returns void language plpgsql as $f$
begin update matches set status = st, winner = w, score = '1:0' where id = mid; end $f$;
do $$
declare jug uuid[] := array(select id from players order by created_at, id limit 5); a uuid; b uuid; c uuid; d uuid; e uuid;
  sa int; sb int; sc int; sd int; se int; t0 int; cid bigint; cid2 bigint; r challenges; j jsonb; n int;
begin
  if array_length(jug, 1) < 5 then raise exception 'FALLO: hacen falta cinco jugadores para probar'; end if;
  a := jug[1]; b := jug[2]; c := jug[3]; d := jug[4]; e := jug[5];
  insert into ledger(player, amount, kind, note) select x, 1000, 'ajuste', 'prueba 053' from unnest(jug) x;
  insert into matches(id, sport, league, league_name, home, away, starts_at, status, odds_1, odds_x, odds_2) values
    ('p53a', 'f', 'prueba', 'Prueba', 'Local', 'Visitante', now() + interval '2 hours', 'scheduled', 2, 3.2, 2),
    ('p53b', 'f', 'prueba', 'Prueba', 'Local', 'Visitante', now() + interval '2 hours', 'scheduled', 2, 3.2, 2),
    ('p53c', 'f', 'prueba', 'Prueba', 'Local', 'Visitante', now() + interval '2 hours', 'scheduled', 2, 3.2, 2),
    ('p53d', 'f', 'prueba', 'Prueba', 'Local', 'Visitante', now() + interval '2 hours', 'scheduled', 2, 3.2, 2),
    ('p53e', 'f', 'prueba', 'Prueba', 'Local', 'Visitante', now() + interval '2 hours', 'scheduled', 2, 3.2, 2),
    ('p53f', 'f', 'prueba', 'Prueba', 'Local', 'Visitante', now() + interval '2 hours', 'scheduled', 2, 3.2, 2),
    ('p53g', 'f', 'prueba', 'Prueba', 'Local', 'Visitante', now() + interval '2 hours', 'scheduled', 2, 3.2, 2),
    ('p53h', 'f', 'prueba', 'Prueba', 'Local', 'Visitante', now() + interval '2 hours', 'scheduled', 2, 3.2, 2),
    ('p53i', 'f', 'prueba', 'Prueba', 'Local', 'Visitante', now() + interval '2 hours', 'scheduled', 2, 3.2, 2),
    ('p53s', 'f', 'prueba', 'Prueba', 'Sin', 'Empate', now() + interval '2 hours', 'scheduled', 2, null, 2);
  perform pay_week();   -- la paga del lunes, si tocaba, ya cobrada: no se mezcla con las cuentas de abajo
  t0 := pg_temp.total(jug);

  -- ---------- 1) 2v1 ----------
  perform pg_temp.yo(a); cid := challenge_create('p53a', null, '1', 100);
  perform pg_temp.falla(format('select challenge_join(%s, %L)', cid, '1'), 'tu propio reto');
  perform pg_temp.yo(b); perform challenge_join(cid, '2');
  select * into r from challenges where id = cid;
  if r.status <> 'accepted' or r.to_player <> b or r.to_pick <> '2' then raise exception 'FALLO: B no queda de rival (% % %)', r.status, r.to_player, r.to_pick; end if;
  perform pg_temp.falla(format('select challenge_join(%s, %L)', cid, '1'), 'Ya estás dentro');
  perform pg_temp.falla(format('select challenge_join(%s, %L)', cid, '2'), 'Ya estás dentro');
  perform pg_temp.yo(c); sc := pg_temp.saldo(c);
  perform challenge_join(cid, '1');
  if pg_temp.saldo(c) <> sc - 100 then raise exception 'FALLO: C no ha pagado su entrada'; end if;
  if (select count(*) from challenge_players where challenge_id = cid) <> 1 then raise exception 'FALLO: C no esta en challenge_players'; end if;
  select * into r from challenges where id = cid;
  if r.status <> 'accepted' or r.to_player <> b then raise exception 'FALLO: entrar con el lado de A ha cambiado el rival'; end if;
  perform pg_temp.falla(format('select challenge_join(%s, %L)', cid, '2'), 'Ya estás dentro');
  perform pg_temp.yo(e);
  perform pg_temp.falla(format('select challenge_join(%s, %L)', cid, 'Z'), 'resultado');
  perform pg_temp.yo(a);
  perform pg_temp.falla(format('select challenge_cancel(%s)', cid), 'no se puede cancelar');
  -- el bote: 3 entradas
  if (select count(*) from challenge_entries(cid)) <> 3 or (select string_agg(pick, '' order by ord) from challenge_entries(cid)) <> '121' then raise exception 'FALLO: las entradas no salen en orden A, B, C'; end if;
  -- antes de acabar, settle no toca nada
  perform settle_challenges();
  if (select status from challenges where id = cid) <> 'accepted' then raise exception 'FALLO: settle toca un reto sin acabar'; end if;
  sa := pg_temp.saldo(a); sb := pg_temp.saldo(b); sc := pg_temp.saldo(c);
  perform pg_temp.parte('p53a', 'final', '1');
  perform settle_challenges();
  select * into r from challenges where id = cid;
  if r.status <> 'won_from' or r.win_pick <> '1' then raise exception 'FALLO: 2v1 mal marcado (% %)', r.status, r.win_pick; end if;
  if pg_temp.saldo(a) <> sa + 150 or pg_temp.saldo(c) <> sc + 150 or pg_temp.saldo(b) <> sb then
    raise exception 'FALLO: reparto del 2v1: A +%, B +%, C +%', pg_temp.saldo(a) - sa, pg_temp.saldo(b) - sb, pg_temp.saldo(c) - sc; end if;
  if pg_temp.total(jug) <> t0 then raise exception 'FALLO: el 2v1 ha creado o destruido dinero (% de diferencia)', pg_temp.total(jug) - t0; end if;
  -- dos veces settle no paga dos veces
  perform settle_challenges();
  if pg_temp.total(jug) <> t0 or pg_temp.saldo(a) <> sa + 150 then raise exception 'FALLO: settle paga dos veces'; end if;

  -- ---------- 2) 2v2 ----------
  t0 := pg_temp.total(jug);
  perform pg_temp.yo(a); cid := challenge_create('p53b', null, '1', 100);
  perform pg_temp.yo(b); perform challenge_join(cid, '2');
  perform pg_temp.yo(c); perform challenge_join(cid, '1');
  perform pg_temp.yo(d); perform challenge_join(cid, '2');
  sa := pg_temp.saldo(a); sb := pg_temp.saldo(b); sc := pg_temp.saldo(c); sd := pg_temp.saldo(d);
  perform pg_temp.parte('p53b', 'final', '2');
  perform settle_challenges();
  select * into r from challenges where id = cid;
  if r.status <> 'won_to' or r.win_pick <> '2' then raise exception 'FALLO: 2v2 mal marcado (% %)', r.status, r.win_pick; end if;
  if pg_temp.saldo(b) <> sb + 200 or pg_temp.saldo(d) <> sd + 200 or pg_temp.saldo(a) <> sa or pg_temp.saldo(c) <> sc then raise exception 'FALLO: reparto del 2v2'; end if;
  if pg_temp.total(jug) <> t0 then raise exception 'FALLO: el 2v2 ha creado o destruido dinero'; end if;

  -- ---------- 3) 3v1: 400 entre 3 no es justo ----------
  t0 := pg_temp.total(jug);
  perform pg_temp.yo(a); cid := challenge_create('p53c', null, '1', 100);
  perform pg_temp.yo(b); perform challenge_join(cid, '2');
  perform pg_temp.yo(c); perform challenge_join(cid, '1');
  perform pg_temp.yo(d); perform challenge_join(cid, '1');
  sa := pg_temp.saldo(a); sb := pg_temp.saldo(b); sc := pg_temp.saldo(c); sd := pg_temp.saldo(d);
  perform pg_temp.parte('p53c', 'final', '1');
  perform settle_challenges();
  if pg_temp.saldo(a) - sa <> 134 or pg_temp.saldo(c) - sc <> 133 or pg_temp.saldo(d) - sd <> 133 or pg_temp.saldo(b) <> sb then
    raise exception 'FALLO: 400 entre 3: A +%, C +%, D +%', pg_temp.saldo(a) - sa, pg_temp.saldo(c) - sc, pg_temp.saldo(d) - sd; end if;
  if pg_temp.total(jug) <> t0 then raise exception 'FALLO: el 3v1 con resto ha creado o destruido dinero'; end if;
  -- y el mismo reto si gana el solo
  perform pg_temp.yo(a); cid2 := challenge_create('p53d', null, '1', 100);
  perform pg_temp.yo(b); perform challenge_join(cid2, '2');
  perform pg_temp.yo(c); perform challenge_join(cid2, '1');
  perform pg_temp.yo(d); perform challenge_join(cid2, '1');
  sb := pg_temp.saldo(b); sa := pg_temp.saldo(a);
  perform pg_temp.parte('p53d', 'final', '2');
  perform settle_challenges();
  if pg_temp.saldo(b) - sb <> 400 or pg_temp.saldo(a) <> sa then raise exception 'FALLO: el solo no cobra los 400 (cobra %)', pg_temp.saldo(b) - sb; end if;
  if (select status from challenges where id = cid2) <> 'won_to' then raise exception 'FALLO: 3v1 ganado por el solo mal marcado'; end if;

  -- ---------- 4) empate ----------
  t0 := pg_temp.total(jug);
  perform pg_temp.yo(a); cid := challenge_create('p53e', null, '1', 100);
  perform pg_temp.yo(b); perform challenge_join(cid, '2');
  perform pg_temp.yo(c); perform challenge_join(cid, 'X');
  sa := pg_temp.saldo(a); sb := pg_temp.saldo(b); sc := pg_temp.saldo(c);
  perform pg_temp.parte('p53e', 'final', 'X');
  perform settle_challenges();
  select * into r from challenges where id = cid;
  if r.status <> 'won_other' or r.win_pick <> 'X' then raise exception 'FALLO: empate mal marcado (% %)', r.status, r.win_pick; end if;
  if pg_temp.saldo(c) - sc <> 300 or pg_temp.saldo(a) <> sa or pg_temp.saldo(b) <> sb then raise exception 'FALLO: el del empate no cobra los 300'; end if;
  if pg_temp.total(jug) <> t0 then raise exception 'FALLO: el empate ha creado o destruido dinero'; end if;
  -- sin empate en el partido no se elige la X
  perform pg_temp.yo(a); cid := challenge_create('p53s', null, '1', 50);
  perform pg_temp.yo(b);
  perform pg_temp.falla(format('select challenge_join(%s, %L)', cid, 'X'), 'resultado');

  -- ---------- 5) partido anulado ----------
  perform pg_temp.yo(a); cid := challenge_create('p53f', null, '1', 100);
  perform pg_temp.yo(b); perform challenge_join(cid, '2');
  perform pg_temp.yo(c); perform challenge_join(cid, '1');
  sa := pg_temp.saldo(a); sb := pg_temp.saldo(b); sc := pg_temp.saldo(c);
  t0 := pg_temp.total(jug);
  perform pg_temp.parte('p53f', 'canceled', null);
  perform settle_challenges();
  if (select status from challenges where id = cid) <> 'void' then raise exception 'FALLO: reto de partido anulado no queda void'; end if;
  if pg_temp.saldo(a) <> sa + 100 or pg_temp.saldo(b) <> sb + 100 or pg_temp.saldo(c) <> sc + 100 then raise exception 'FALLO: anulado no devuelve a los tres'; end if;
  if pg_temp.total(jug) <> t0 + 300 then raise exception 'FALLO: anulado devuelve de mas o de menos'; end if;

  -- ---------- 6) gana un lado vacio ----------
  perform pg_temp.yo(a); cid := challenge_create('p53g', null, '1', 100);
  perform pg_temp.yo(b); perform challenge_join(cid, '2');
  perform pg_temp.yo(c); perform challenge_join(cid, '2');
  sa := pg_temp.saldo(a); sb := pg_temp.saldo(b); sc := pg_temp.saldo(c);
  perform pg_temp.parte('p53g', 'final', 'X');
  perform settle_challenges();
  if (select status from challenges where id = cid) <> 'void' then raise exception 'FALLO: empate sin lado de empate no queda void'; end if;
  if pg_temp.saldo(a) <> sa + 100 or pg_temp.saldo(b) <> sb + 100 or pg_temp.saldo(c) <> sc + 100 then raise exception 'FALLO: empate sin lado no devuelve a los tres'; end if;

  -- ---------- 7) plazo cerrado sin rival ----------
  perform pg_temp.yo(a); sa := pg_temp.saldo(a); cid := challenge_create('p53h', null, '1', 100);
  perform pg_temp.yo(b); sb := pg_temp.saldo(b); perform challenge_join(cid, '1');
  select * into r from challenges where id = cid;
  if r.status <> 'pending' or r.to_player is not null then raise exception 'FALLO: sumar al lado de A no deberia dar rival (% %)', r.status, r.to_player; end if;
  if (select count(*) from challenge_entries(cid)) <> 2 then raise exception 'FALLO: el reto sin rival no tiene a los dos dentro'; end if;
  if pg_temp.saldo(b) <> sb - 100 then raise exception 'FALLO: B no ha pagado al sumar al lado de A'; end if;
  perform settle_challenges();
  if (select status from challenges where id = cid) <> 'pending' then raise exception 'FALLO: settle cierra un reto sin rival antes de empezar'; end if;
  update matches set starts_at = now() - interval '1 minute' where id = 'p53h';
  perform pg_temp.yo(c);
  perform pg_temp.falla(format('select challenge_join(%s, %L)', cid, '2'), 'ya ha empezado');
  t0 := pg_temp.total(jug);
  perform settle_challenges();
  if (select status from challenges where id = cid) <> 'expired' then raise exception 'FALLO: reto sin rival no caduca al empezar'; end if;
  if pg_temp.saldo(a) <> sa or pg_temp.saldo(b) <> sb then raise exception 'FALLO: reto sin rival no devuelve a los dos (A %, B %)', pg_temp.saldo(a) - sa, pg_temp.saldo(b) - sb; end if;
  if pg_temp.total(jug) <> t0 + 200 then raise exception 'FALLO: devolucion sin rival de mas o de menos'; end if;
  perform pg_temp.yo(c);
  perform pg_temp.falla(format('select challenge_join(%s, %L)', cid, '2'), 'cerrado');

  -- ---------- 8) reto a un amigo ----------
  perform pg_temp.yo(a); cid := challenge_create('p53i', b, '1', 100);
  perform pg_temp.yo(c);
  perform pg_temp.falla(format('select challenge_join(%s, %L)', cid, '1'), 'otro amigo');
  perform pg_temp.falla(format('select challenge_answer(%s, true, %L)', cid, '2'), 'no es para ti');
  perform pg_temp.yo(b);
  perform pg_temp.falla(format('select challenge_join(%s, %L)', cid, '2'), 'acéptalo');
  perform challenge_answer(cid, true, '2');
  perform pg_temp.yo(c); perform challenge_join(cid, '2');
  perform pg_temp.yo(d); perform challenge_join(cid, '1');
  select * into r from challenges where id = cid;
  if r.status <> 'accepted' or r.to_player <> b or (select count(*) from challenge_entries(cid)) <> 4 then raise exception 'FALLO: reto a un amigo con mas gente'; end if;
  -- get_retos
  perform pg_temp.yo(e);
  j := get_retos();
  if jsonb_array_length(j -> cid::text -> 'e') <> 4 or j -> cid::text -> 'e' -> 2 ->> 0 <> c::text or j -> cid::text -> 'e' -> 2 ->> 1 <> '2' then raise exception 'FALLO: get_retos no da las entradas en orden: %', j -> cid::text; end if;
  perform pg_temp.yo(null);
  perform pg_temp.falla('select get_retos()', 'entrar');

  -- ---------- 9) saldo y sesion ----------
  perform pg_temp.yo(a); cid := challenge_create('p53s', null, '1', 500);
  perform pg_temp.yo(e); se := pg_temp.saldo(e);
  insert into ledger(player, amount, kind, note) values (e, -(se - 50), 'ajuste', 'prueba 053: E se queda con 50');
  perform pg_temp.falla(format('select challenge_join(%s, %L)', cid, '2'), 'saldo');
  insert into ledger(player, amount, kind, note) values (e, se - 50, 'ajuste', 'prueba 053: E recupera');
  if (select count(*) from challenge_entries(cid)) <> 1 then raise exception 'FALLO: E esta dentro sin pagar'; end if;
  perform pg_temp.yo(null);
  perform pg_temp.falla(format('select challenge_join(%s, %L)', cid, '2'), 'entrar');
  perform pg_temp.yo(e);
  perform pg_temp.falla(format('select challenge_join(%s, %L)', 0, '2'), 'no existe');

  -- ---------- 10) un reto de 1 contra 1 como los de siempre ----------
  insert into matches(id, sport, league, league_name, home, away, starts_at, status, odds_1, odds_2) values ('p53z', 'f', 'prueba', 'Prueba', 'Local', 'Visitante', now() + interval '2 hours', 'scheduled', 2, 2);
  perform pg_temp.yo(a); cid := challenge_create('p53z', b, '1', 70);
  perform pg_temp.yo(b); perform challenge_answer(cid, true, '2');
  sa := pg_temp.saldo(a); sb := pg_temp.saldo(b); t0 := pg_temp.total(jug);
  perform pg_temp.parte('p53z', 'final', '2');
  perform settle_challenges();
  if (select status from challenges where id = cid) <> 'won_to' or pg_temp.saldo(b) - sb <> 140 or pg_temp.saldo(a) <> sa or pg_temp.total(jug) <> t0 + 140 then raise exception 'FALLO: el 1v1 de siempre no se paga como antes'; end if;
  -- y lo ya resuelto antes de 053 conserva su estado y su lado
  if exists (select 1 from challenges where status in ('won_from', 'won_to') and win_pick is null) then raise exception 'FALLO: un reto ya resuelto se ha quedado sin lado ganador'; end if;
  raise exception 'PRUEBA SUPERADA (se deshace todo): 2v1, 2v2 y 3v1 se reparten a partes iguales (el resto, al primero), el empate cobra el que va con la X, anulado y lado vacio devuelven a todos, sin rival se devuelve al empezar, no se entra dos veces ni tras el inicio ni sin saldo, el reto a un amigo admite mas gente al aceptar, y el dinero ni se crea ni se pierde.';
end $$;
