-- Prueba de db/060_push.sql, para el editor SQL de Supabase. Va DESPUES de 060.
-- Todo dentro de un bloque que acaba en error A PROPOSITO, asi que no queda nada (ni los partidos, ni el dinero, ni los avisos de prueba).
-- Con cinco jugadores (A a E) y partidos de prueba:
--  1) Apuntar aparatos: sin sesion no; endpoint que no es https no; claves cortas no. Se puede repetir sin duplicar, un aparato nuevo hereda los
--     tipos que ya tenias, push_tipos solo acepta los 5 tipos con si o no, nadie borra el aparato de otro, y un aparato pasa al jugador que lo apunta.
--     Las tablas no se leen desde la app; los jugadores llaman a push_*, el sincronizador con su clave a sync_*, y con clave mala falla.
--  2) Apuestas: gana, pierde, devuelta (anulada por el partido; la que cancelas tu no avisa), y quien apaga "apuestas" no recibe nada.
--  3) Retos: te retan, te aceptan, te rechazan, entra alguien en un reto abierto (y otro mas), ganas, pierdes, sin rival, sin ganador.
--     El dinero del reto sigue cuadrando igual que sin avisos.
--  4) Combinadas: ganada, perdida y devuelta.  5) Ranking de ratio: el que pierde el puesto 1 recibe el aviso, una sola vez.
--  6) Paga, bote, premio de la semana y ruleta global (de madrugada esperan a las 9:00 de Madrid).  7) Chat: @nombre avisa; sin @, uno mismo o
--     un mensaje de la app no.  8) Sincronizador: pendientes con sus aparatos y respetando los tipos, limite, lo que aun no toca, marcar,
--     borrar aparatos muertos, limpieza de los de mas de 7 dias.  9) Probar aviso: uno por minuto y solo con aparato.
-- 10) Si la tabla de avisos se rompe, las apuestas se siguen pagando igual (ningun aviso puede romper un pago).
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
-- cuantos avisos nuevos (despues de v0) tiene un jugador, de un tipo (o de todos si t es null)
create or replace function pg_temp.av(v0 bigint, p uuid, t text) returns int language sql as $f$
  select count(*)::int from avisos where id > v0 and player = p and (t is null or tipo = t) $f$;
-- exige un aviso con ese titulo exacto y ese cuerpo (like); si no esta, cuenta lo que hay
create or replace function pg_temp.esp(v0 bigint, p uuid, t text, tit text, cue text) returns void language plpgsql as $f$
begin
  if not exists (select 1 from avisos where id > v0 and player = p and tipo = t and titulo = tit and cuerpo like cue) then
    raise exception 'FALLO: a % le deberia llegar [%] "%" / "%" y hay: %', pname(p), t, tit, cue,
      coalesce((select string_agg(tipo || ': ' || titulo || ' / ' || cuerpo, ' ;; ' order by id) from avisos where id > v0 and player = p), 'nada');
  end if;
end $f$;
do $$
declare jug uuid[] := array(select id from players order by created_at, id limit 5); a uuid; b uuid; c uuid; d uuid; e uuid;
  v0 bigint; sec text; r jsonb; n int; k1 constant text := 'BPkeyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'; k2 constant text := 'authAAAAAAAAAAAA';
  ea text := 'https://fcm.googleapis.com/fcm/send/zz060-a'; ea2 text := 'https://fcm.googleapis.com/fcm/send/zz060-a2'; eb text := 'https://updates.push.services.mozilla.com/wpush/v2/zz060-b';
  eb2 text := 'https://updates.push.services.mozilla.com/wpush/v2/zz060-b2'; ec text := 'https://web.push.apple.com/zz060-c'; ed text := 'https://fcm.googleapis.com/fcm/send/zz060-d';
  ba bigint; bb bigint; bc bigint; bd bigint; pa int; pd int; sa int; sb int; t0 int; cid bigint; cid2 bigint; cid3 bigint; cid4 bigint; cb bigint; i int; bid bigint; ids bigint[];
  madrid_h int; ed_ts timestamptz; rka int; rkb int;
begin
  if array_length(jug, 1) < 5 then raise exception 'FALLO: hacen falta cinco jugadores para probar'; end if;
  a := jug[1]; b := jug[2]; c := jug[3]; d := jug[4]; e := jug[5];
  sec := (select value #>> '{}' from settings where key = 'sync_secret');
  if sec is null then raise exception 'FALLO: no encuentro sync_secret en settings'; end if;
  select coalesce(max(id), 0) into v0 from avisos;
  delete from push_subs where player = any(jug);
  insert into ledger(player, amount, kind, note) select x, 100000, 'ajuste', 'prueba 060' from unnest(jug) x;
  insert into matches(id, sport, league, league_name, home, away, starts_at, status, odds_1, odds_x, odds_2) values
    ('p60a', 'f', 'prueba', 'Prueba', 'Local', 'Visitante', now() + interval '2 hours', 'scheduled', 2, 3.2, 2.5),
    ('p60b', 'f', 'prueba', 'Prueba', 'Local', 'Visitante', now() + interval '2 hours', 'scheduled', 2, 3.2, 2.5),
    ('p60c', 'f', 'prueba', 'Prueba', 'Local', 'Visitante', now() + interval '2 hours', 'scheduled', 2, 3.2, 2.5),
    ('p60d', 'f', 'prueba', 'Prueba', 'Local', 'Visitante', now() + interval '2 hours', 'scheduled', 2, 3.2, 2.5),
    ('p60e', 'f', 'prueba', 'Prueba', 'Local', 'Visitante', now() + interval '2 hours', 'scheduled', 2, 3.2, 2.5),
    ('p60f', 'f', 'prueba', 'Prueba', 'Local', 'Visitante', now() + interval '2 hours', 'scheduled', 2, 3.2, 2.5),
    ('p60g', 'f', 'prueba', 'Prueba', 'Local', 'Visitante', now() + interval '2 hours', 'scheduled', 2, 3.2, 2.5),
    ('p60v', 'f', 'prueba', 'Prueba', 'Local', 'Visitante', now() + interval '2 hours', 'scheduled', 2, 3.2, 2.5),
    ('p60r', 'f', 'prueba', 'Prueba', 'Local', 'Visitante', now() + interval '2 hours', 'scheduled', 2, 3.2, 2.5);
  perform pay_week();

  -- ---------- 1) apuntar aparatos ----------
  perform pg_temp.yo(null);
  perform pg_temp.falla(format('select push_alta(%L, %L, %L)', ea, k1, k2), 'entrar');
  perform pg_temp.falla(format('select push_tipos(%L)', '{"chat":false}'), 'entrar');
  perform pg_temp.falla('select push_prueba()', 'entrar');
  perform pg_temp.yo(a);
  perform pg_temp.falla(format('select push_alta(%L, %L, %L)', 'http://servidor.example.com/aaaaaaaaaaaaaaaaaaaa', k1, k2), 'no vale');
  perform pg_temp.falla(format('select push_alta(%L, %L, %L)', ea, 'corta', k2), 'claves');
  perform pg_temp.falla(format('select push_alta(%L, %L, %L)', ea, k1, 'x'), 'claves');
  r := push_alta(ea, k1, k2, 'Chrome en Android', 'es');
  if r <> '{"retos":true,"apuestas":true,"ranking":true,"paga":true,"chat":true}'::jsonb then raise exception 'FALLO: un aparato nuevo no empieza con todo encendido: %', r; end if;
  perform push_alta(ea, k1, k2, 'Chrome en Android', 'es');
  if (select count(*) from push_subs where endpoint = ea) <> 1 then raise exception 'FALLO: apuntar el mismo aparato dos veces lo duplica'; end if;
  r := push_estado(ea);
  if not (r->>'aparato')::boolean or (r->>'aparatos')::int <> 1 then raise exception 'FALLO: push_estado de un aparato apuntado: %', r; end if;
  r := push_estado('https://otro.example.com/zzzzzzzzzzzzzzzzzzzz');
  if (r->>'aparato')::boolean or (r->>'aparatos')::int <> 1 then raise exception 'FALLO: push_estado de un aparato que no es: %', r; end if;
  perform pg_temp.yo(b);
  perform push_alta(eb, k1, k2, 'Firefox', 'en');
  if (select lang from push_subs where endpoint = eb) <> 'en' then raise exception 'FALLO: no guarda el idioma'; end if;
  r := push_tipos('{"chat": false}');
  if (r->>'chat')::boolean or not (r->>'retos')::boolean or not (r->>'paga')::boolean then raise exception 'FALLO: push_tipos chat=false: %', r; end if;
  if (select tipos->>'chat' from push_subs where endpoint = eb) <> 'false' then raise exception 'FALLO: push_tipos no guarda'; end if;
  if (select tipos->>'chat' from push_subs where endpoint = ea) <> 'true' then raise exception 'FALLO: push_tipos ha tocado el aparato de otro'; end if;
  perform pg_temp.falla(format('select push_tipos(%L)', '{"nada": true}'), 'no existe');
  perform pg_temp.falla(format('select push_tipos(%L)', '{"chat": "si"}'), 'encendido o apagado');
  perform pg_temp.falla('select push_tipos(null)', 'Faltan');
  perform push_alta(eb2, k1, k2, 'Firefox PC', 'es');
  if (select tipos->>'chat' from push_subs where endpoint = eb2) <> 'false' then raise exception 'FALLO: un aparato nuevo no hereda los tipos que ya tenias'; end if;
  perform pg_temp.yo(c);
  perform push_alta(ec, k1, k2, 'Safari iPhone', 'es');
  perform push_tipos('{"apuestas": false}');
  perform push_baja(eb2);
  if (select count(*) from push_subs where endpoint = eb2) <> 1 then raise exception 'FALLO: C ha borrado el aparato de B'; end if;
  perform pg_temp.yo(b); perform push_baja(eb2);
  if (select count(*) from push_subs where endpoint = eb2) <> 0 then raise exception 'FALLO: B no puede borrar su aparato'; end if;
  perform pg_temp.yo(d); perform push_alta(ed, k1, k2, 'Chrome', 'es');
  perform pg_temp.yo(a); perform push_alta(ea2, k1, k2, 'Segundo movil', 'es');
  perform pg_temp.yo(e); perform push_alta(ea2, k1, k2, 'El mismo movil, otra cuenta', 'es');
  if (select player from push_subs where endpoint = ea2) <> e then raise exception 'FALLO: el aparato no pasa al jugador que lo apunta'; end if;
  perform push_baja(ea2);
  if (select count(*) from push_subs where player = e) <> 0 then raise exception 'FALLO: E se queda con aparatos'; end if;
  -- permisos
  if has_function_privilege('anon', 'push_alta(text, text, text, text, text)', 'execute') or has_function_privilege('anon', 'push_tipos(jsonb)', 'execute')
     or has_function_privilege('anon', 'push_prueba()', 'execute') then raise exception 'FALLO: anon puede llamar a push_*'; end if;
  if not has_function_privilege('authenticated', 'push_alta(text, text, text, text, text)', 'execute') or not has_function_privilege('authenticated', 'push_baja(text)', 'execute')
     or not has_function_privilege('authenticated', 'push_tipos(jsonb)', 'execute') or not has_function_privilege('authenticated', 'push_estado(text)', 'execute')
     or not has_function_privilege('authenticated', 'push_prueba()', 'execute') then raise exception 'FALLO: los jugadores no pueden llamar a push_*'; end if;
  if has_table_privilege('authenticated', 'push_subs', 'select') or has_table_privilege('authenticated', 'avisos', 'select') or has_table_privilege('anon', 'avisos', 'select')
     or has_table_privilege('anon', 'push_subs', 'select') then raise exception 'FALLO: push_subs o avisos se pueden leer desde la app'; end if;
  if has_function_privilege('authenticated', 'aviso_nuevo(uuid, text, text, text, text, text, text)', 'execute') then raise exception 'FALLO: un jugador puede apuntar avisos a mano'; end if;
  if not has_function_privilege('anon', 'sync_avisos_pendientes(text, int)', 'execute') then raise exception 'FALLO: el sincronizador no puede llamar a sync_avisos_pendientes'; end if;
  perform pg_temp.falla('select sync_avisos_pendientes(''mala'', 10)', 'Clave');
  perform pg_temp.falla('select sync_avisos_pendientes(null, 10)', 'Clave');
  perform pg_temp.falla('select sync_avisos_marca(''mala'', array[1]::bigint[])', 'Clave');
  perform pg_temp.falla('select sync_push_baja(''mala'', ''x'')', 'Clave');

  -- ---------- 2) apuestas ----------
  perform pg_temp.yo(a); r := place_bet('p60a', '1', 100); ba := (r->>'bet')::bigint;
  perform pg_temp.yo(b); r := place_bet('p60a', '2', 50); bb := (r->>'bet')::bigint;
  perform pg_temp.yo(c); r := place_bet('p60a', '2', 40); bc := (r->>'bet')::bigint;
  perform pg_temp.yo(d); r := place_bet('p60a', '1', 10); bd := (r->>'bet')::bigint;
  perform pg_temp.yo(null);
  if pg_temp.av(v0, a, null) + pg_temp.av(v0, b, null) + pg_temp.av(v0, c, null) + pg_temp.av(v0, d, null) <> 0 then raise exception 'FALLO: apostar ya avisa'; end if;
  sa := pg_temp.saldo(a); sb := pg_temp.saldo(b);
  update matches set status = 'final', winner = '1', score = '2:0' where id = 'p60a';
  perform settle_match('p60a');
  pa := (select payout from bets where id = ba); pd := (select payout from bets where id = bd);
  if (select status from bets where id = ba) <> 'won' or (select status from bets where id = bb) <> 'lost' then raise exception 'FALLO: las apuestas no se han resuelto como debian'; end if;
  if pg_temp.saldo(a) <> sa + pa or pg_temp.saldo(b) <> sb then raise exception 'FALLO: el dinero de las apuestas no cuadra con los avisos puestos'; end if;
  perform pg_temp.esp(v0, a, 'apuestas', 'Has ganado ' || fmt_int(pa) || ' con Local', 'Local vs Visitante · cuota %');
  perform pg_temp.esp(v0, b, 'apuestas', 'Has perdido 50 con Visitante', 'Local vs Visitante');
  perform pg_temp.esp(v0, d, 'apuestas', 'Has ganado ' || fmt_int(pd) || ' con Local', 'Local vs Visitante%');
  if not exists (select 1 from avisos where id > v0 and player = a and titulo_en = 'You won ' || fmt_en(pa) || ' on Local' and cuerpo_en like 'Local vs Visitante · odds _.__') then raise exception 'FALLO: falta el aviso en ingles de la apuesta ganada'; end if;
  if pg_temp.av(v0, c, 'apuestas') <> 0 then raise exception 'FALLO: C apago apuestas y le llega el aviso'; end if;
  if pg_temp.av(v0, e, null) <> 0 then raise exception 'FALLO: E no tiene aparato y se le apunta un aviso'; end if;
  perform settle_match('p60a');
  if pg_temp.av(v0, a, 'apuestas') <> 1 then raise exception 'FALLO: al pagar otra vez se repite el aviso'; end if;
  -- anulada por el partido: avisa; la que cancelas tu: no
  perform pg_temp.yo(a); r := place_bet('p60v', '1', 30); bid := (r->>'bet')::bigint;
  r := place_bet('p60v', '2', 20);
  perform pg_temp.yo(null);
  update matches set status = 'canceled' where id = 'p60v';
  perform settle_match('p60v');
  perform pg_temp.esp(v0, a, 'apuestas', 'Apuesta devuelta', 'Te devuelven 30: Local vs Visitante');
  perform pg_temp.esp(v0, a, 'apuestas', 'Apuesta devuelta', 'Te devuelven 20: Local vs Visitante');
  n := pg_temp.av(v0, a, 'apuestas');
  perform pg_temp.yo(a);
  update bets set status = 'void', payout = stake, settled_at = now() where id = bid;
  update bets set status = 'open' where id = bid;
  update bets set status = 'void', payout = stake where id = bid;
  perform pg_temp.yo(null);
  if pg_temp.av(v0, a, 'apuestas') <> n then raise exception 'FALLO: cancelar tu propia apuesta avisa'; end if;

  -- ---------- 3) retos ----------
  t0 := pg_temp.total(jug);
  perform pg_temp.yo(a); cid := challenge_create('p60b', b, '1', 100);
  perform pg_temp.esp(v0, b, 'retos', 'Te han retado', pname(a) || ' te ha retado a 100 en Local vs Visitante');
  if not exists (select 1 from avisos where id > v0 and player = b and titulo_en = 'You have been challenged' and cuerpo_en = pname(a) || ' challenged you to 100 on Local vs Visitante') then raise exception 'FALLO: falta el aviso en ingles del reto'; end if;
  if pg_temp.av(v0, a, 'retos') <> 0 then raise exception 'FALLO: quien reta recibe su propio aviso'; end if;
  perform pg_temp.yo(b); perform challenge_answer(cid, true, '2');
  perform pg_temp.esp(v0, a, 'retos', 'Te han aceptado el reto', pname(b) || ' ha aceptado tu reto · Local vs Visitante, 200 en juego');
  perform pg_temp.yo(null);
  update matches set status = 'final', winner = '1', score = '1:0' where id = 'p60b';
  perform settle_challenges();
  perform pg_temp.esp(v0, a, 'retos', 'Has ganado el reto: 200', 'Contra ' || pname(b) || ' · Local vs Visitante');
  perform pg_temp.esp(v0, b, 'retos', 'Has perdido el reto: 100', 'Ha ganado ' || pname(a) || ' · Local vs Visitante');
  if pg_temp.total(jug) <> t0 then raise exception 'FALLO: el dinero del reto 1 contra 1 ya no cuadra (%)', pg_temp.total(jug) - t0; end if;
  -- rechazado
  perform pg_temp.yo(a); cid2 := challenge_create('p60c', c, '1', 50);
  perform pg_temp.esp(v0, c, 'retos', 'Te han retado', pname(a) || ' te ha retado a 50 en Local vs Visitante');
  perform pg_temp.yo(c); perform challenge_answer(cid2, false);
  perform pg_temp.esp(v0, a, 'retos', 'Reto rechazado', pname(c) || ' no ha aceptado tu reto de 50 en Local vs Visitante. Te lo devolvemos');
  -- abierto: crearlo no avisa a nadie; entrar si; entrar otro mas
  n := pg_temp.av(v0, a, null) + pg_temp.av(v0, b, null) + pg_temp.av(v0, c, null) + pg_temp.av(v0, d, null);
  t0 := pg_temp.total(jug);
  perform pg_temp.yo(a); cid3 := challenge_create('p60d', null, '1', 100);
  perform pg_temp.yo(null);
  if pg_temp.av(v0, a, null) + pg_temp.av(v0, b, null) + pg_temp.av(v0, c, null) + pg_temp.av(v0, d, null) <> n then raise exception 'FALLO: abrir un reto para cualquiera avisa a todo el mundo'; end if;
  perform pg_temp.yo(b); perform challenge_join(cid3, '2');
  perform pg_temp.esp(v0, a, 'retos', 'Tu reto tiene rival', pname(b) || ' ha entrado en tu reto · Local vs Visitante, 200 en juego');
  perform pg_temp.yo(c); perform challenge_join(cid3, '1');
  perform pg_temp.esp(v0, a, 'retos', 'Alguien más en tu reto', pname(c) || ' ha entrado en tu reto · Local vs Visitante');
  perform pg_temp.esp(v0, b, 'retos', 'Alguien más en el reto', pname(c) || ' ha entrado en el reto de ' || pname(a) || ' · Local vs Visitante');
  if pg_temp.av(v0, c, 'retos') <> 1 then raise exception 'FALLO: C recibe aviso de su propia entrada (% avisos de retos)', pg_temp.av(v0, c, 'retos'); end if;
  perform pg_temp.yo(null);
  update matches set status = 'final', winner = '2', score = '0:1' where id = 'p60d';
  perform settle_challenges();
  perform pg_temp.esp(v0, b, 'retos', 'Has ganado el reto: 300', 'Contra ' || pname(a) || ' · Local vs Visitante');
  perform pg_temp.esp(v0, a, 'retos', 'Has perdido el reto: 100', 'Ha ganado ' || pname(b) || ' · Local vs Visitante');
  perform pg_temp.esp(v0, c, 'retos', 'Has perdido el reto: 100', 'Ha ganado ' || pname(b) || ' · Local vs Visitante');
  if pg_temp.total(jug) <> t0 then raise exception 'FALLO: el dinero del reto 2 contra 1 ya no cuadra (%)', pg_temp.total(jug) - t0; end if;
  -- sin rival: caduca
  perform pg_temp.yo(a); cid4 := challenge_create('p60e', null, '1', 70); perform pg_temp.yo(null);
  update matches set starts_at = now() - interval '1 minute' where id = 'p60e';
  perform settle_challenges();
  perform pg_temp.esp(v0, a, 'retos', 'Reto sin rival', 'Nadie ha entrado en el reto de Local vs Visitante. Te devuelven 70');
  -- anulado: sin ganador
  perform pg_temp.yo(a); cid4 := challenge_create('p60f', d, '1', 60);
  perform pg_temp.yo(d); perform challenge_answer(cid4, true, '2'); perform pg_temp.yo(null);
  update matches set status = 'canceled' where id = 'p60f';
  perform settle_challenges();
  perform pg_temp.esp(v0, a, 'retos', 'Reto sin ganador', 'Te devuelven 60 del reto de Local vs Visitante');
  perform pg_temp.esp(v0, d, 'retos', 'Reto sin ganador', 'Te devuelven 60 del reto de Local vs Visitante');

  -- ---------- 4) combinadas ----------
  insert into combos(player, stake, odds) values (a, 50, 4.5) returning id into cb;
  insert into combo_legs(combo_id, match_id, pick, odds) values (cb, 'p60a', '1', 2), (cb, 'p60b', '1', 2.25);
  update combos set status = 'won', payout = 225, settled_at = now() where id = cb;
  perform pg_temp.esp(v0, a, 'apuestas', 'Combinada ganada: 225', 'Tu combinada de 2 partidos ha salido · cuota 4,50');
  insert into combos(player, stake, odds) values (b, 50, 4.5) returning id into cb;
  insert into combo_legs(combo_id, match_id, pick, odds) values (cb, 'p60a', '2', 2.5), (cb, 'p60b', '2', 1.8);
  update combos set status = 'lost', settled_at = now() where id = cb;
  perform pg_temp.esp(v0, b, 'apuestas', 'Has perdido 50 con tu combinada', 'Combinada de 2 partidos');
  insert into combos(player, stake, odds) values (c, 50, 4.5) returning id into cb;
  update combos set status = 'won', payout = 225, settled_at = now() where id = cb;
  if pg_temp.av(v0, c, 'apuestas') <> 0 then raise exception 'FALLO: C apago apuestas y le llega el aviso de la combinada'; end if;
  insert into combos(player, stake, odds) values (d, 80, 3) returning id into cb;
  update combos set status = 'void', payout = 80, settled_at = now() where id = cb;
  perform pg_temp.esp(v0, d, 'apuestas', 'Combinada devuelta', 'Te devuelven 80');

  -- ---------- 5) ranking de ratio ----------
  delete from settings where key = 'push_top_ratio';
  rka := pg_temp.av(v0, a, 'ranking'); rkb := pg_temp.av(v0, b, 'ranking');   -- los que ya hubiera por las apuestas de arriba
  for i in 1..30 loop
    insert into bets(player, match_id, pick, stake, odds) values (a, 'p60r', '1', 1, 5000) returning id into bid;
    update bets set status = 'won', payout = 5000, settled_at = now() where id = bid;
  end loop;
  if (select value #>> '{}' from settings where key = 'push_top_ratio') is distinct from a::text then raise exception 'FALLO: A, con ratio altisimo, no es el puesto 1 guardado'; end if;
  for i in 1..60 loop
    insert into bets(player, match_id, pick, stake, odds) values (b, 'p60r', '1', 1, 9999) returning id into bid;
    update bets set status = 'won', payout = 9999, settled_at = now() where id = bid;
  end loop;
  if (select value #>> '{}' from settings where key = 'push_top_ratio') is distinct from b::text then raise exception 'FALLO: B no ha pasado a ser el puesto 1'; end if;
  perform pg_temp.esp(v0, a, 'ranking', 'Has perdido el puesto 1', pname(b) || ' te ha superado en el ranking de ratio');
  if pg_temp.av(v0, a, 'ranking') <> rka + 1 then raise exception 'FALLO: el aviso de ranking sale % veces', pg_temp.av(v0, a, 'ranking') - rka; end if;
  if pg_temp.av(v0, b, 'ranking') <> rkb then raise exception 'FALLO: el nuevo puesto 1 recibe el aviso de perder'; end if;

  -- ---------- 6) paga, bote, premio y ruleta global ----------
  n := (select count(*) from avisos where id > v0 and tipo = 'paga');
  insert into ledger(player, amount, kind, note, week) values (a, 1000, 'paga', 'Paga del lunes', date '2000-01-03');
  insert into ledger(player, amount, kind, note, week) values (a, 500, 'bote_gana', 'Bote de la semana', date '2000-01-03');
  insert into ledger(player, amount, kind, note, week) values (a, 200, 'premio_semana', 'Más dinero de la semana', date '2000-01-03');
  insert into ledger(player, amount, kind, note, week) values (b, 1000, 'ruleta_global', 'Ruleta global de la semana', date '2000-01-03');
  insert into ledger(player, amount, kind, note) values (a, -100, 'bote', 'Bote de la semana');
  insert into ledger(player, amount, kind, note) values (a, 5, 'regalo', 'otra cosa');
  if (select count(*) from avisos where id > v0 and tipo = 'paga') <> n + 4 then raise exception 'FALLO: la paga y los premios deberian avisar 4 veces y avisan %', (select count(*) from avisos where id > v0 and tipo = 'paga') - n; end if;
  perform pg_temp.esp(v0, a, 'paga', 'Ya tienes la paga del lunes', 'Han entrado 1.000 en tu cuenta');
  perform pg_temp.esp(v0, a, 'paga', 'Has ganado el bote', 'Te llevas 500 del bote de la semana');
  perform pg_temp.esp(v0, a, 'paga', 'Premio de la semana: 200', 'Más dinero de la semana');
  perform pg_temp.esp(v0, b, 'paga', '¡Te ha tocado la ruleta global!', 'Ganas 1.000');
  if not exists (select 1 from avisos where id > v0 and player = a and tipo = 'paga' and cuerpo_en = 'Most money of the week') then raise exception 'FALLO: el premio de la semana no esta en ingles'; end if;
  -- de madrugada (antes de las 9 en Madrid) esperan a las 9:00; despues salen ya
  madrid_h := extract(hour from now() at time zone 'Europe/Madrid')::int;
  for ed_ts in select enviar_desde from avisos where id > v0 and tipo = 'paga' loop
    if madrid_h < 9 then
      if ed_ts <= now() or extract(hour from ed_ts at time zone 'Europe/Madrid') <> 9 or extract(minute from ed_ts) <> 0 then raise exception 'FALLO: un aviso de paga de madrugada no espera a las 9:00 (%)', ed_ts; end if;
    elsif ed_ts > now() then raise exception 'FALLO: un aviso de paga de dia espera sin motivo (%)', ed_ts; end if;
  end loop;

  -- ---------- 7) chat ----------
  insert into chat(player, body) values (a, 'hola @' || lower(pname(c)) || ' ¿vienes?');
  perform pg_temp.esp(v0, c, 'chat', pname(a) || ' te ha mencionado', 'hola @' || lower(pname(c)) || ' ¿vienes?');
  insert into chat(player, body) values (a, '@' || pname(c) || 'xyz no es el nombre');
  insert into chat(player, body) values (a, 'sin arroba ' || pname(c));
  insert into chat(player, body) values (a, '@' || pname(a) || ' yo mismo');
  insert into chat(player, body) values (null, '@' || pname(c) || ' aviso de la app');
  insert into chat(player, body) values (a, 'ey @' || pname(b));
  if pg_temp.av(v0, c, 'chat') <> 1 then raise exception 'FALLO: C deberia tener 1 aviso de chat y tiene %', pg_temp.av(v0, c, 'chat'); end if;
  if pg_temp.av(v0, a, 'chat') <> 0 then raise exception 'FALLO: te avisas a ti mismo'; end if;
  if pg_temp.av(v0, b, 'chat') <> 0 then raise exception 'FALLO: B apago el chat y le llega el aviso'; end if;
  insert into chat(player, body) values (b, 'mira @' || (select username from players where id = d) || '!');
  perform pg_temp.esp(v0, d, 'chat', pname(b) || ' te ha mencionado', 'mira @%');

  -- ---------- 8) el sincronizador ----------
  insert into avisos(player, tipo, titulo, cuerpo) values (b, 'chat', 'se apago despues', 'x');
  insert into avisos(player, tipo, titulo, cuerpo, enviar_desde) values (a, 'paga', 'aun no toca', 'x', now() + interval '1 day');
  insert into avisos(player, tipo, titulo, cuerpo, creado) values (a, 'paga', 'muy viejo', 'x', now() - interval '8 days');
  r := sync_avisos_pendientes(sec, 500);
  if jsonb_typeof(r) <> 'array' then raise exception 'FALLO: sync_avisos_pendientes no devuelve una lista'; end if;
  if exists (select 1 from avisos where titulo = 'muy viejo') then raise exception 'FALLO: no limpia los avisos de mas de 7 dias'; end if;
  if exists (select 1 from jsonb_array_elements(r) x where x->>'titulo' = 'aun no toca') then raise exception 'FALLO: manda un aviso que aun no toca'; end if;
  if not exists (select 1 from jsonb_array_elements(r) x where x->>'titulo' = 'se apago despues' and jsonb_array_length(x->'subs') = 0) then raise exception 'FALLO: no respeta que B apago el chat'; end if;
  if not exists (select 1 from jsonb_array_elements(r) x where x->>'titulo' = 'Has ganado ' || fmt_int(pa) || ' con Local' and jsonb_array_length(x->'subs') = 1
                 and x->'subs'->0->>'endpoint' = ea and x->'subs'->0->>'p256dh' = k1 and x->'subs'->0->>'auth' = k2 and x->'subs'->0->>'lang' = 'es' and x->>'url' = 'apuestas' and x->>'titulo_en' like 'You won%') then
    raise exception 'FALLO: el aviso de A no lleva su aparato con claves, idioma, pantalla y texto en ingles'; end if;
  if exists (select 1 from jsonb_array_elements(r) x where x->>'titulo' like 'Has perdido 50 con Visitante' and x->'subs'->0->>'lang' <> 'en') then raise exception 'FALLO: el idioma de B (ingles) no llega'; end if;
  r := sync_avisos_pendientes(sec, 2);
  if jsonb_array_length(r) <> 2 then raise exception 'FALLO: el limite de 2 devuelve %', jsonb_array_length(r); end if;
  -- marcar: solo los de la prueba
  ids := array(select id from avisos where id > v0 and enviado is null and enviar_desde <= now());
  n := sync_avisos_marca(sec, ids, array[ea]);
  if n <> coalesce(cardinality(ids), 0) or n = 0 then raise exception 'FALLO: marca % de %', n, coalesce(cardinality(ids), 0); end if;
  if sync_avisos_marca(sec, ids) <> 0 then raise exception 'FALLO: marcar dos veces vuelve a contar'; end if;
  if (select ultimo_ok from push_subs where endpoint = ea) is null then raise exception 'FALLO: no apunta cuando le llego un aviso a un aparato'; end if;
  r := sync_avisos_pendientes(sec, 500);
  if exists (select 1 from jsonb_array_elements(r) x where (x->>'id')::bigint = any(ids)) then raise exception 'FALLO: lo ya marcado vuelve a salir'; end if;
  n := sync_push_baja(sec, ed);          -- cada cosa en su instruccion: una funcion que cambia datos y una subconsulta en la MISMA expresion ven el valor viejo
  if n <> 1 then raise exception 'FALLO: sync_push_baja no borra el aparato muerto (borra %)', n; end if;
  if exists (select 1 from push_subs where endpoint = ed) then raise exception 'FALLO: el aparato muerto sigue apuntado'; end if;
  n := sync_push_baja(sec, ed);
  if n <> 0 then raise exception 'FALLO: sync_push_baja vuelve a borrar algo'; end if;

  -- ---------- 9) probar aviso ----------
  perform pg_temp.yo(a);
  perform push_prueba();
  perform pg_temp.esp(v0, a, 'prueba', 'Los avisos funcionan', 'Así te llegará%');
  perform pg_temp.falla('select push_prueba()', 'Espera un minuto');
  perform pg_temp.yo(e);
  perform pg_temp.falla('select push_prueba()', 'Activa los avisos');
  perform pg_temp.yo(null);
  r := sync_avisos_pendientes(sec, 500);
  if not exists (select 1 from jsonb_array_elements(r) x where x->>'tipo' = 'prueba' and x->>'url' = 'ajustes' and jsonb_array_length(x->'subs') = 1 and x->'subs'->0->>'endpoint' = ea) then
    raise exception 'FALLO: el aviso de prueba no llega a los aparatos de A'; end if;

  -- ---------- 10) un aviso nunca rompe un pago ----------
  alter table avisos rename to avisos_roto;
  perform pg_temp.yo(a); r := place_bet('p60g', '1', 10); bid := (r->>'bet')::bigint; perform pg_temp.yo(null);
  sa := pg_temp.saldo(a);
  update matches set status = 'final', winner = '1', score = '1:0' where id = 'p60g';
  perform settle_match('p60g');
  if (select status from bets where id = bid) <> 'won' or pg_temp.saldo(a) <> sa + (select payout from bets where id = bid) then raise exception 'FALLO: con la tabla de avisos rota la apuesta no se paga'; end if;
  insert into chat(player, body) values (a, 'con todo roto @' || lower(pname(c)));
  insert into ledger(player, amount, kind, note, week) values (c, 1000, 'paga', 'Paga del lunes', date '2000-01-10');
  alter table avisos_roto rename to avisos;

  raise exception 'PRUEBA SUPERADA (se deshace todo): aparatos, tipos y permisos; avisos de apuestas, retos (1 contra 1, abierto, 2 contra 1, sin rival, sin ganador), combinadas, ranking, paga y premios, chat; sincronizador con limite, marca y limpieza; probar aviso; y un fallo en los avisos no rompe un pago.';
end $$;
