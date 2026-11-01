-- Prueba de db/066_retos_banca.sql, para el editor SQL de Supabase. Va DESPUES de 066.
-- Todo dentro de un bloque que acaba en error A PROPOSITO, asi que no queda nada (ni los partidos, ni los retos, ni el dinero de prueba).
-- Con cinco jugadores reales (A a E) y partidos de prueba con cuotas 1,65 / 3,40 / 2,20 que empiezan dentro de 2 horas:
--  1) 1v1 gana el que reta: cobra 165 de la banca + 100 del rival = 265. La cuota queda congelada al retar aunque cambie despues.
--  2) 1v1 gana el rival: 220 + 100 = 320.
--  3) 2v1 (el segundo del lado 1 entra con la cuota ya en 1,80), 3v1 con bote que no divide exacto (34, 33, 33) y 2v1 que gana el solo.
--  4) empate: el de la X cobra 340 + 200. Gana la X sin nadie en la X: todos pierden, sin bote. Sin empate en el partido no se elige X.
--  5) reto que nadie acepta: al empezar se cierra SIN devolver y la apuesta sigue; luego se paga como normal (gana 165 con el cierre
--     del sync, leyendo su clave de settings) o se pierde. Reto a un amigo que dice que no: la apuesta sigue en pie (y ya se puede cancelar como una normal).
--     No se cancela por cancel_bet ni se vende con rivales; sin rival si se puede vender.
--  6) partido anulado: se devuelve todo a cada uno.
--  7) retos viejos (v2 = false) se pagan como antes: bote a partes iguales, sin rival se devuelve, aceptado por un amigo el doble.
--  8) limites del importe: minimo 1, maximo 100.000 y el saldo.
--  9) get_retos da cuota y apuesta de cada entrada en los nuevos.
-- 10) retirar un reto: solo quien reta, solo sin nadie mas dentro y antes de empezar; devuelve todo y anula su apuesta.
-- En cada caso el dinero total de los cinco cambia SOLO en la parte que paga la banca (cuota menos stake de los que aciertan).
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
-- esto tiene que poder hacerse (y se deshace en el momento)
create or replace function pg_temp.pasa(q text) returns void language plpgsql as $f$
begin
  begin execute q; raise exception 'deshaz-066'; exception when others then if sqlerrm <> 'deshaz-066' then raise exception 'FALLO: "%" deberia poder hacerse: %', q, sqlerrm; end if; end;
end $f$;
create or replace function pg_temp.parte(mid text, st text, w text) returns void language plpgsql as $f$
begin update matches set status = st, winner = w, score = '1:0' where id = mid; end $f$;
create or replace function pg_temp.apuesta(cid bigint, u uuid) returns bets language sql as $f$ select * from bets where challenge_id = cid and player = u $f$;
-- un reto como los de antes de 066 (sin apuesta a la banca, v2 = false)
create or replace function pg_temp.viejo(mid text, de uuid, para uuid, pk text, st int) returns bigint language plpgsql as $f$
declare cid bigint;
begin
  insert into challenges(match_id, from_player, to_player, from_pick, stake) values (mid, de, para, pk, st) returning id into cid;
  insert into ledger(player, amount, kind, note) values (de, -st, 'apuesta', 'prueba 066: reto viejo');
  return cid;
end $f$;
do $$
declare jug uuid[] := array(select id from players order by created_at, id limit 5); a uuid; b uuid; c uuid; d uuid; e uuid;
  sa int; sb int; sc int; sd int; se int; t0 int; cid bigint; cid2 bigint; r challenges; ba bets; j jsonb; n int;
  clave text := (select value #>> '{}' from settings where key = 'sync_secret');
begin
  if array_length(jug, 1) < 5 then raise exception 'FALLO: hacen falta cinco jugadores para probar'; end if;
  if clave is null then raise exception 'FALLO: no encuentro sync_secret en settings'; end if;
  a := jug[1]; b := jug[2]; c := jug[3]; d := jug[4]; e := jug[5];
  insert into ledger(player, amount, kind, note) select x, 2000, 'ajuste', 'prueba 066' from unnest(jug) x;
  insert into matches(id, sport, league, league_name, home, away, starts_at, status, odds_1, odds_x, odds_2)
    select 'p66' || l, 'f', 'prueba', 'Prueba', 'Local', 'Visitante', now() + interval '2 hours', 'scheduled', 1.65, 3.40, 2.20
    from unnest(array['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q']) l;
  insert into matches(id, sport, league, league_name, home, away, starts_at, status, odds_1, odds_2) values
    ('p66s', 'f', 'prueba', 'Prueba', 'Sin', 'Empate', now() + interval '2 hours', 'scheduled', 1.65, 2.20);
  perform pay_week(); perform bote_semanal();   -- la paga y el bote de la semana, si tocaban, ya hechos: no se mezclan con las cuentas

  -- ---------- 1) 1v1, gana el que reta ----------
  t0 := pg_temp.total(jug); sa := pg_temp.saldo(a); sb := pg_temp.saldo(b);
  perform pg_temp.yo(a); cid := challenge_create('p66a', null, '1', 100);
  select * into r from challenges where id = cid;
  if not r.v2 or r.status <> 'pending' then raise exception 'FALLO: el reto nuevo no es v2 pendiente'; end if;
  ba := pg_temp.apuesta(cid, a);
  if ba.id is null or ba.odds <> 1.65 or ba.stake <> 100 or ba.status <> 'open' or ba.pick <> '1' then raise exception 'FALLO: la apuesta de quien reta no esta bien (% % %)', ba.odds, ba.stake, ba.status; end if;
  if (select count(*) from ledger where bet_id = ba.id and amount = -100 and kind = 'apuesta') <> 1 then raise exception 'FALLO: el monedero no lleva la apuesta del reto'; end if;
  if pg_temp.saldo(a) <> sa - 100 then raise exception 'FALLO: retar no quita los 100'; end if;
  update matches set odds_1 = 1.90 where id = 'p66a';
  perform pg_temp.yo(b); perform challenge_join(cid, '2');
  if (pg_temp.apuesta(cid, b)).odds <> 2.20 then raise exception 'FALLO: la apuesta del rival no lleva su cuota'; end if;
  if (pg_temp.apuesta(cid, a)).odds <> 1.65 then raise exception 'FALLO: la cuota de quien reta no se queda congelada'; end if;
  perform pg_temp.falla(format('update bets set status = %L where id = %s', 'cashout', ba.id), 'no se puede vender');
  perform pg_temp.yo(a); perform pg_temp.falla(format('select cancel_bet(%s)', ba.id), 'no se puede cancelar');
  perform pg_temp.falla(format('select challenge_cancel(%s)', cid), 'Ya ha entrado alguien');
  perform settle_challenges();
  if (select status from challenges where id = cid) <> 'accepted' then raise exception 'FALLO: settle toca un reto sin acabar'; end if;
  perform pg_temp.parte('p66a', 'final', '1');
  perform settle_challenges();
  select * into r from challenges where id = cid;
  if r.status <> 'won_from' or r.win_pick <> '1' then raise exception 'FALLO: 1v1 mal marcado (% %)', r.status, r.win_pick; end if;
  ba := pg_temp.apuesta(cid, a);
  if ba.status <> 'won' or ba.payout <> 165 or ba.reto_extra <> 100 then raise exception 'FALLO: la apuesta ganadora (% % %)', ba.status, ba.payout, ba.reto_extra; end if;
  if (pg_temp.apuesta(cid, b)).status <> 'lost' then raise exception 'FALLO: la del rival no queda perdida'; end if;
  if pg_temp.saldo(a) <> sa + 165 or pg_temp.saldo(b) <> sb - 100 then
    raise exception 'FALLO: 1v1 gana quien reta: A %, B % (esperado +165 y -100)', pg_temp.saldo(a) - sa, pg_temp.saldo(b) - sb; end if;
  if pg_temp.total(jug) <> t0 + 65 then raise exception 'FALLO: 1v1 crea o pierde dinero (% en vez de +65)', pg_temp.total(jug) - t0; end if;
  perform settle_challenges(); perform settle_match('p66a');
  if pg_temp.total(jug) <> t0 + 65 then raise exception 'FALLO: settle paga dos veces'; end if;

  -- ---------- 2) 1v1, gana el rival ----------
  t0 := pg_temp.total(jug); sa := pg_temp.saldo(a); sb := pg_temp.saldo(b);
  perform pg_temp.yo(a); cid := challenge_create('p66b', null, '1', 100);
  perform pg_temp.yo(b); perform challenge_join(cid, '2');
  perform pg_temp.parte('p66b', 'final', '2');
  perform settle_challenges();
  if (select status from challenges where id = cid) <> 'won_to' then raise exception 'FALLO: gana el rival mal marcado'; end if;
  if pg_temp.saldo(b) <> sb + 220 or pg_temp.saldo(a) <> sa - 100 then raise exception 'FALLO: gana el rival: A %, B % (esperado -100 y +220, es decir cobra 220 + 100)', pg_temp.saldo(a) - sa, pg_temp.saldo(b) - sb; end if;
  if pg_temp.total(jug) <> t0 + 120 then raise exception 'FALLO: gana el rival: % en vez de +120', pg_temp.total(jug) - t0; end if;

  -- ---------- 3) 2v1, 3v1 con resto, 2v1 que gana el solo ----------
  t0 := pg_temp.total(jug); sa := pg_temp.saldo(a); sb := pg_temp.saldo(b); sc := pg_temp.saldo(c);
  perform pg_temp.yo(a); cid := challenge_create('p66c', null, '1', 100);
  perform pg_temp.yo(b); perform challenge_join(cid, '2');
  update matches set odds_1 = 1.80 where id = 'p66c';
  perform pg_temp.yo(c); perform challenge_join(cid, '1');
  if (pg_temp.apuesta(cid, c)).odds <> 1.80 then raise exception 'FALLO: quien entra despues no lleva la cuota de ahora'; end if;
  perform pg_temp.parte('p66c', 'final', '1');
  perform settle_challenges();
  if pg_temp.saldo(a) <> sa + 115 or pg_temp.saldo(c) <> sc + 130 or pg_temp.saldo(b) <> sb - 100 then
    raise exception 'FALLO: 2v1: A %, B %, C % (esperado +115, -100, +130)', pg_temp.saldo(a) - sa, pg_temp.saldo(b) - sb, pg_temp.saldo(c) - sc; end if;
  if pg_temp.total(jug) <> t0 + 145 then raise exception 'FALLO: 2v1: % en vez de +145', pg_temp.total(jug) - t0; end if;

  t0 := pg_temp.total(jug); sa := pg_temp.saldo(a); sb := pg_temp.saldo(b); sc := pg_temp.saldo(c); sd := pg_temp.saldo(d);
  perform pg_temp.yo(a); cid := challenge_create('p66d', null, '1', 100);
  perform pg_temp.yo(b); perform challenge_join(cid, '2');
  perform pg_temp.yo(c); perform challenge_join(cid, '1');
  perform pg_temp.yo(d); perform challenge_join(cid, '1');
  perform pg_temp.parte('p66d', 'final', '1');
  perform settle_challenges();
  if pg_temp.saldo(a) - sa <> 99 or pg_temp.saldo(c) - sc <> 98 or pg_temp.saldo(d) - sd <> 98 or pg_temp.saldo(b) - sb <> -100 then
    raise exception 'FALLO: 3v1 con resto: A %, C %, D % (esperado +99, +98, +98)', pg_temp.saldo(a) - sa, pg_temp.saldo(c) - sc, pg_temp.saldo(d) - sd; end if;
  if (select sum(reto_extra) from bets where challenge_id = cid) <> 100 then raise exception 'FALLO: el bote del 3v1 no suma 100'; end if;
  if pg_temp.total(jug) <> t0 + 195 then raise exception 'FALLO: 3v1: % en vez de +195', pg_temp.total(jug) - t0; end if;

  t0 := pg_temp.total(jug); sb := pg_temp.saldo(b);
  perform pg_temp.yo(a); cid := challenge_create('p66e', null, '1', 100);
  perform pg_temp.yo(b); perform challenge_join(cid, '2');
  perform pg_temp.yo(c); perform challenge_join(cid, '1');
  perform pg_temp.parte('p66e', 'final', '2');
  perform settle_challenges();
  if pg_temp.saldo(b) - sb <> 320 or (pg_temp.apuesta(cid, b)).reto_extra <> 200 then raise exception 'FALLO: el solo gana 220 + 200 (gana %)', pg_temp.saldo(b) - sb + 100; end if;
  if pg_temp.total(jug) <> t0 + 120 then raise exception 'FALLO: 2v1 del solo: % en vez de +120', pg_temp.total(jug) - t0; end if;

  -- ---------- 4) empate ----------
  t0 := pg_temp.total(jug); sc := pg_temp.saldo(c);
  perform pg_temp.yo(a); cid := challenge_create('p66f', null, '1', 100);
  perform pg_temp.yo(b); perform challenge_join(cid, '2');
  perform pg_temp.yo(c); perform challenge_join(cid, 'X');
  perform pg_temp.parte('p66f', 'final', 'X');
  perform settle_challenges();
  select * into r from challenges where id = cid;
  if r.status <> 'won_other' or r.win_pick <> 'X' then raise exception 'FALLO: empate mal marcado (% %)', r.status, r.win_pick; end if;
  if pg_temp.saldo(c) - sc <> 440 then raise exception 'FALLO: el del empate cobra 340 + 200 (gana %)', pg_temp.saldo(c) - sc + 100; end if;
  if pg_temp.total(jug) <> t0 + 240 then raise exception 'FALLO: empate: % en vez de +240', pg_temp.total(jug) - t0; end if;
  -- gana la X y nadie va con la X: los dos pierden su apuesta, sin bote
  t0 := pg_temp.total(jug);
  perform pg_temp.yo(a); cid := challenge_create('p66g', null, '1', 100);
  perform pg_temp.yo(b); perform challenge_join(cid, '2');
  perform pg_temp.parte('p66g', 'final', 'X');
  perform settle_challenges();
  select * into r from challenges where id = cid;
  if r.status <> 'won_other' or r.win_pick <> 'X' then raise exception 'FALLO: X sin nadie mal marcado (% %)', r.status, r.win_pick; end if;
  if pg_temp.total(jug) <> t0 - 200 or exists (select 1 from bets where challenge_id = cid and (status <> 'lost' or reto_extra is not null)) then raise exception 'FALLO: X sin nadie: los dos pierden y no hay bote'; end if;
  perform pg_temp.yo(a);
  perform pg_temp.falla('select challenge_create(''p66s'', null, ''X'', 50)', 'Elige 1, X o 2');

  -- ---------- 5) nadie acepta: queda como apuesta normal ----------
  sa := pg_temp.saldo(a); sd := pg_temp.saldo(d);
  perform pg_temp.yo(a); cid := challenge_create('p66h', null, '1', 100);
  perform pg_temp.yo(d); perform challenge_join(cid, '1');   -- se suma al mismo lado: sigue sin rival
  if (select status from challenges where id = cid) <> 'pending' then raise exception 'FALLO: sumarse al mismo lado da rival'; end if;
  perform pg_temp.yo(a); perform pg_temp.falla(format('select challenge_cancel(%s)', cid), 'Ya ha entrado alguien');
  update matches set starts_at = now() - interval '1 minute', status = 'live' where id = 'p66h';
  perform pg_temp.yo(c); perform pg_temp.falla(format('select challenge_join(%s, %L)', cid, '2'), 'ya ha empezado');
  perform settle_challenges();
  if (select status from challenges where id = cid) <> 'expired' then raise exception 'FALLO: sin rival no se cierra al empezar'; end if;
  if pg_temp.saldo(a) <> sa - 100 or pg_temp.saldo(d) <> sd - 100 then raise exception 'FALLO: sin rival no deberia devolver nada (A %, D %)', pg_temp.saldo(a) - sa, pg_temp.saldo(d) - sd; end if;
  if (pg_temp.apuesta(cid, a)).status <> 'open' then raise exception 'FALLO: la apuesta sin rival no sigue abierta'; end if;
  perform pg_temp.pasa(format('update bets set status = %L, payout = 50 where id = %s', 'cashout', (pg_temp.apuesta(cid, a)).id));
  perform pg_temp.parte('p66h', 'final', '1');
  perform pg_temp.yo(null);
  perform sync_close(clave);
  if (pg_temp.apuesta(cid, a)).status <> 'won' or (pg_temp.apuesta(cid, a)).payout <> 165 or (pg_temp.apuesta(cid, a)).reto_extra is not null then raise exception 'FALLO: sin rival no se paga como apuesta normal'; end if;
  if pg_temp.saldo(a) <> sa + 65 or pg_temp.saldo(d) <> sd + 65 then raise exception 'FALLO: sin rival y acierta: A %, D % (esperado +65)', pg_temp.saldo(a) - sa, pg_temp.saldo(d) - sd; end if;
  if (select status from challenges where id = cid) <> 'expired' then raise exception 'FALLO: el reto sin rival cambia al pagarse'; end if;
  -- y si falla, la pierde (no se devuelve)
  sa := pg_temp.saldo(a);
  perform pg_temp.yo(a); cid := challenge_create('p66i', null, '2', 100);
  update matches set starts_at = now() - interval '1 minute', status = 'live' where id = 'p66i';
  perform settle_challenges();
  perform pg_temp.parte('p66i', 'final', '1');
  perform settle_match('p66i');
  if (pg_temp.apuesta(cid, a)).status <> 'lost' or pg_temp.saldo(a) <> sa - 100 then raise exception 'FALLO: sin rival y falla: A % (esperado -100)', pg_temp.saldo(a) - sa; end if;
  -- reto a un amigo que dice que no: la apuesta sigue en pie
  sa := pg_temp.saldo(a);
  perform pg_temp.yo(a); cid := challenge_create('p66j', b, '1', 100);
  perform pg_temp.yo(c); perform pg_temp.falla(format('select challenge_join(%s, %L)', cid, '2'), 'otro amigo');
  perform pg_temp.yo(b); perform challenge_answer(cid, false);
  if (select status from challenges where id = cid) <> 'declined' or pg_temp.saldo(a) <> sa - 100 or (pg_temp.apuesta(cid, a)).status <> 'open' then raise exception 'FALLO: rechazado deberia dejar la apuesta en pie'; end if;
  perform pg_temp.yo(a); perform pg_temp.pasa(format('select cancel_bet(%s)', (pg_temp.apuesta(cid, a)).id));   -- ya es normal: se puede cancelar
  perform pg_temp.parte('p66j', 'final', '1');
  perform settle_match('p66j');
  if pg_temp.saldo(a) <> sa + 65 then raise exception 'FALLO: rechazado y acierta: A % (esperado +65)', pg_temp.saldo(a) - sa; end if;

  -- ---------- 6) partido anulado ----------
  t0 := pg_temp.total(jug);
  perform pg_temp.yo(a); cid := challenge_create('p66k', null, '1', 100);
  perform pg_temp.yo(b); perform challenge_join(cid, '2');
  perform pg_temp.yo(c); perform challenge_join(cid, '1');
  perform pg_temp.parte('p66k', 'canceled', null);
  perform settle_challenges();
  if (select status from challenges where id = cid) <> 'void' then raise exception 'FALLO: anulado no queda void'; end if;
  if exists (select 1 from bets where challenge_id = cid and (status <> 'void' or payout <> 100)) then raise exception 'FALLO: anulado no devuelve cada apuesta'; end if;
  if pg_temp.total(jug) <> t0 then raise exception 'FALLO: anulado: % en vez de 0', pg_temp.total(jug) - t0; end if;

  -- ---------- 7) retos viejos (v2 = false) como antes ----------
  t0 := pg_temp.total(jug); sa := pg_temp.saldo(a); sb := pg_temp.saldo(b); sc := pg_temp.saldo(c);
  cid := pg_temp.viejo('p66l', a, null, '1', 100);
  perform pg_temp.yo(b); perform challenge_join(cid, '2');
  perform pg_temp.yo(c); perform challenge_join(cid, '1');
  if exists (select 1 from bets where match_id = 'p66l') then raise exception 'FALLO: un reto viejo ha creado apuestas a la banca'; end if;
  perform pg_temp.parte('p66l', 'final', '1');
  perform settle_challenges();
  if (select status from challenges where id = cid) <> 'won_from' then raise exception 'FALLO: reto viejo mal marcado'; end if;
  if pg_temp.saldo(a) - sa <> 50 or pg_temp.saldo(c) - sc <> 50 or pg_temp.saldo(b) - sb <> -100 then
    raise exception 'FALLO: reto viejo 2v1: A %, B %, C % (esperado +50, -100, +50)', pg_temp.saldo(a) - sa, pg_temp.saldo(b) - sb, pg_temp.saldo(c) - sc; end if;
  if pg_temp.total(jug) <> t0 then raise exception 'FALLO: reto viejo crea o pierde dinero'; end if;
  -- viejo sin rival: se devuelve al empezar
  sa := pg_temp.saldo(a);
  cid := pg_temp.viejo('p66m', a, null, '1', 100);
  update matches set starts_at = now() - interval '1 minute' where id = 'p66m';
  perform settle_challenges();
  if (select status from challenges where id = cid) <> 'expired' or pg_temp.saldo(a) <> sa then raise exception 'FALLO: reto viejo sin rival no se devuelve'; end if;
  -- viejo a un amigo que acepta: el doble al que acierta
  sb := pg_temp.saldo(b); t0 := pg_temp.total(jug);
  cid := pg_temp.viejo('p66n', a, b, '1', 70);
  perform pg_temp.yo(b); perform challenge_answer(cid, true, '2');
  perform pg_temp.parte('p66n', 'final', '2');
  perform settle_challenges();
  if (select status from challenges where id = cid) <> 'won_to' or pg_temp.saldo(b) - sb <> 70 or pg_temp.total(jug) <> t0 then
    raise exception 'FALLO: reto viejo 1v1: B % (esperado +70)', pg_temp.saldo(b) - sb; end if;
  -- viejo a un amigo que dice que no: se devuelve como antes
  sa := pg_temp.saldo(a);
  cid := pg_temp.viejo('p66n', a, c, '1', 40);
  perform pg_temp.yo(c); perform challenge_answer(cid, false);
  if pg_temp.saldo(a) <> sa then raise exception 'FALLO: reto viejo rechazado no se devuelve'; end if;

  -- ---------- 8) limites del importe ----------
  perform pg_temp.yo(a);
  perform pg_temp.falla('select challenge_create(''p66o'', null, ''1'', 0)', 'mínimo');
  perform pg_temp.falla('select challenge_create(''p66o'', null, ''1'', 100001)', 'máximo');
  perform pg_temp.falla('select challenge_create(''p66o'', null, ''1'', null)', 'mínimo');
  perform pg_temp.yo(e); se := pg_temp.saldo(e);
  perform pg_temp.falla(format('select challenge_create(%L, null, %L, %s)', 'p66o', '1', se + 1), 'saldo');
  insert into ledger(player, amount, kind, note) values (a, 100000, 'ajuste', 'prueba 066: tope');
  perform pg_temp.yo(a); sa := pg_temp.saldo(a);
  cid := challenge_create('p66o', null, '1', 100000);
  cid2 := challenge_create('p66o', null, '2', 1);
  if pg_temp.saldo(a) <> sa - 100001 or (pg_temp.apuesta(cid, a)).stake <> 100000 or (pg_temp.apuesta(cid2, a)).stake <> 1 then raise exception 'FALLO: 100.000 y 1 deberian valer'; end if;
  -- quien entra pone lo mismo que quien reta (y necesita saldo)
  perform pg_temp.yo(e); perform pg_temp.falla(format('select challenge_join(%s, %L)', cid, '2'), 'saldo');

  -- ---------- 9) get_retos ----------
  perform pg_temp.yo(b); perform challenge_join(cid2, '1');
  perform pg_temp.yo(e); j := get_retos();
  if (j -> cid2::text ->> 'v')::boolean is distinct from true or (j -> cid2::text -> 'e' -> 0 ->> 2)::numeric <> 2.20 or (j -> cid2::text -> 'e' -> 1 ->> 2)::numeric <> 1.65
     or (j -> cid2::text -> 'e' -> 0 ->> 3)::bigint <> (pg_temp.apuesta(cid2, a)).id then raise exception 'FALLO: get_retos de un reto nuevo: %', j -> cid2::text; end if;
  cid := (select id from challenges where match_id = 'p66l');
  if (j -> cid::text ->> 'v')::boolean is distinct from false or jsonb_array_length(j -> cid::text -> 'e' -> 0) <> 2 then raise exception 'FALLO: get_retos de un reto viejo: %', j -> cid::text; end if;

  -- ---------- 10) retirar un reto ----------
  t0 := pg_temp.total(jug); sa := pg_temp.saldo(a);
  perform pg_temp.yo(a); cid := challenge_create('p66p', null, '1', 300);
  perform pg_temp.yo(b); perform pg_temp.falla(format('select challenge_cancel(%s)', cid), 'no es tuyo');
  perform pg_temp.yo(a); perform pg_temp.falla(format('select cancel_bet(%s)', (pg_temp.apuesta(cid, a)).id), 'no se puede cancelar');
  perform challenge_cancel(cid);
  ba := pg_temp.apuesta(cid, a);
  if (select status from challenges where id = cid) <> 'canceled' or ba.status <> 'void' or ba.payout <> 300 then raise exception 'FALLO: retirar no cancela reto y apuesta'; end if;
  if pg_temp.saldo(a) <> sa or pg_temp.total(jug) <> t0 then raise exception 'FALLO: retirar no devuelve todo (A %)', pg_temp.saldo(a) - sa; end if;
  perform pg_temp.falla(format('select challenge_cancel(%s)', cid), 'cerrado');
  perform pg_temp.yo(b); perform pg_temp.falla(format('select challenge_join(%s, %L)', cid, '2'), 'cerrado');
  -- a un amigo que aun no contesta: tambien se retira
  perform pg_temp.yo(a); sa := pg_temp.saldo(a); cid := challenge_create('p66p', c, '2', 50);
  perform challenge_cancel(cid);
  if pg_temp.saldo(a) <> sa then raise exception 'FALLO: retirar un reto a un amigo no devuelve'; end if;
  perform pg_temp.yo(c); perform pg_temp.falla(format('select challenge_answer(%s, true, %L)', cid, '1'), 'cerrado');
  -- con el partido empezado ya no
  perform pg_temp.yo(a); cid := challenge_create('p66q', null, '1', 50);
  update matches set starts_at = now() - interval '1 minute' where id = 'p66q';
  perform pg_temp.falla(format('select challenge_cancel(%s)', cid), 'ya ha empezado');
  -- uno viejo sin nadie: se devuelve como en 004
  update matches set starts_at = now() + interval '2 hours' where id = 'p66p';
  sa := pg_temp.saldo(a); cid := pg_temp.viejo('p66p', a, null, '1', 80);
  perform pg_temp.yo(a); perform challenge_cancel(cid);
  if pg_temp.saldo(a) <> sa then raise exception 'FALLO: retirar un reto viejo no devuelve'; end if;

  raise exception 'PRUEBA SUPERADA (se deshace todo): el reto es una apuesta a la banca con la cuota congelada mas lo que ponen los rivales (165 + 100, 220 + 100, 2v1 y 3v1 en proporcion con el resto al primero, empate 340 + 200), gana un lado sin nadie y pierden todos, sin rival queda como apuesta normal (gana o pierde, no se devuelve), anulado devuelve todo, los viejos se pagan como antes, importe de 1 a 100.000 con saldo, no se cancela ni se vende con rivales, retirar sin nadie dentro devuelve todo, y el dinero solo cambia en la parte de la banca.';
end $$;
