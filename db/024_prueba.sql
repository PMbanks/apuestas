-- Prueba de db/024_cashout.sql, para el editor SQL de Supabase. Va DESPUES de 024_cashout.sql (y de 001 a 023).
-- Prueba el modelo (probabilidades que suman 1, que se mueven como toca), el valor antes del partido y en directo, la caducidad del
-- estado en vivo, el tope (nunca mas de lo que paga si gana) y el minimo de 1, el cobro (saldo, monedero, estado, doble cobro,
-- apuestas ajenas, proteccion de p_min), que la apuesta cobrada no se vuelva a pagar al acabar el partido, que el bote, los trofeos
-- y las demas cuentas la cuenten, y que un jugador normal no pueda llamar a lo interno.
-- Hacen falta al menos tres jugadores. Al final lanza un error A PROPOSITO para que se deshaga todo: no queda nada guardado.
-- Si todo va bien, el error dice "PRUEBA SUPERADA" con el resumen. Si algo falla, dice "FALLO" y que.
do $$
declare
  jug uuid[] := array(select id from players order by created_at, id);
  r jsonb; q jsonb; v int; s0 int; s1 int; fallo boolean; resumen text := ''; n int; p1 numeric; p2 numeric; p3 numeric; wk date := madrid_week();
  b1 bigint; b2 bigint; b3 bigint; b4 bigint; b5 bigint; fin timestamptz; sec text := 'secreto-de-prueba';
begin
  if cardinality(jug) < 3 then raise exception 'FALLO: hacen falta al menos tres jugadores'; end if;
  insert into settings(key, value) values ('sync_secret', to_jsonb(sec)) on conflict (key) do update set value = excluded.value;
  perform pay_week();
  insert into ledger(player, amount, kind, note) select id, 100000, 'ajuste', 'saldo de prueba' from players;
  update matches set status = 'canceled' where status = 'scheduled';
  delete from ex_boosts;
  fin := least(now() + interval '3 hours', ((wk + 7)::timestamp at time zone 'Europe/Madrid') - interval '1 minute');

  -- =========================================================== EL MODELO
  p1 := ex_fut_prob('1', 0, 90, 0.5); p2 := ex_fut_prob('X', 0, 90, 0.5); p3 := ex_fut_prob('2', 0, 90, 0.5);
  if abs(p1 + p2 + p3 - 1) > 0.005 then raise exception 'FALLO: las probabilidades de futbol no suman 1 (%)', p1 + p2 + p3; end if;
  if abs(p1 - p3) > 0.0001 or p2 < 0.2 or p2 > 0.3 then raise exception 'FALLO: un 0-0 al empezar (1 %, X %, 2 %) no es simetrico o el empate no es del 20 al 30 %%', p1, p2, p3; end if;
  if ex_fut_prob('1', 1, 20, 0.5) < 0.75 or ex_fut_prob('1', 1, 20, 0.5) > 0.9 then raise exception 'FALLO: ganar 1-0 con 20 minutos por jugar debe valer entre 75 y 90 %%, vale %', ex_fut_prob('1', 1, 20, 0.5); end if;
  if ex_fut_prob('X', 0, 3, 0.5) < 0.9 then raise exception 'FALLO: un 0-0 a 3 minutos del final debe ser empate casi seguro'; end if;
  if not (ex_fut_prob('1', 1, 60, 0.5) < ex_fut_prob('1', 1, 20, 0.5)) then raise exception 'FALLO: ganar 1-0 vale mas cuanto menos queda'; end if;
  if not (ex_fut_prob('1', 0, 45, 0.7) > ex_fut_prob('1', 0, 45, 0.3)) then raise exception 'FALLO: el favorito no es mas probable'; end if;
  if abs(ex_w(0, 0, 2, 0.5) - 0.5) > 0.0001 or abs(ex_w(0, 0, 3, 0.5) - 0.5) > 0.0001 then raise exception 'FALLO: una serie igualada no es 50 %%'; end if;
  if abs(ex_w(0, 0, 2, ex_map_p(0.7, 3)) - 0.7) > 0.005 or abs(ex_w(0, 0, 3, ex_map_p(0.3, 5)) - 0.3) > 0.005 then raise exception 'FALLO: ex_map_p no devuelve la probabilidad por mapa de esa serie'; end if;
  if ex_map_p(0.7, 1) < 0.695 or ex_map_p(0.7, 1) > 0.705 then raise exception 'FALLO: en BO1 el mapa es la serie'; end if;
  if abs(ex_round_win(0, 0, 0.5, 0.5) - 0.5) > 0.0001 or ex_round_win(12, 2, 0.5, 0.5) < 0.99 or ex_round_win(2, 12, 0.5, 0.5) > 0.01 then raise exception 'FALLO: ex_round_win no es 50 %% al empezar y casi seguro 12-2 / 2-12'; end if;
  if not (ex_round_win(10, 5, 0.52, 0.55) > ex_round_win(7, 7, 0.52, 0.55) and ex_round_win(7, 7, 0.52, 0.55) > ex_round_win(5, 10, 0.52, 0.55)) then raise exception 'FALLO: ex_round_win no sube con las rondas'; end if;
  resumen := resumen || 'Modelo: probabilidades coherentes. ';

  -- =========================================================== ANTES DEL PARTIDO
  insert into matches(id, sport, league, league_name, home, away, starts_at, status, odds_1, odds_x, odds_2) values
    ('zz:pre', 'f', 'esp.1', 'LaLiga', 'Local FC', 'Visitante FC', fin, 'scheduled', 2.00, 3.30, 4.00);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  s0 := (select coalesce(sum(amount), 0) from ledger where player = jug[1]);
  r := place_bet('zz:pre', '1', 100); b1 := (r->>'bet')::bigint;
  q := cash_out_quote(b1);
  if not (q->>'ok')::boolean or q->>'mode' <> 'pre' or (q->>'value')::int <> 95 or (q->>'win')::int <> 200 then raise exception 'FALLO: con las cuotas sin mover debe valer 95 (el 95 %%): %', q; end if;
  update matches set odds_1 = 1.60 where id = 'zz:pre';
  q := cash_out_quote(b1);
  if (q->>'value')::int <> 119 then raise exception 'FALLO: con la cuota a 1,60 debe valer 100 * 2,00 / 1,60 * 0,95 = 119 y vale %', q->>'value'; end if;
  update matches set odds_1 = 3.00 where id = 'zz:pre';
  if (cash_out_quote(b1)->>'value')::int <> 63 then raise exception 'FALLO: con la cuota a 3,00 debe valer 63'; end if;
  update matches set odds_1 = null where id = 'zz:pre';
  if (cash_out_quote(b1)->>'ok')::boolean then raise exception 'FALLO: se ofrece cash out sin cuota actual'; end if;
  update matches set odds_1 = 5.00 where id = 'zz:pre';
  r := place_bet('zz:pre', '1', 1); b2 := (r->>'bet')::bigint;                  -- apuesta de 1 a 5,00; ahora 5,00: 0,95 -> minimo 1
  if (cash_out_quote(b2)->>'value')::int <> 1 then raise exception 'FALLO: el minimo de cash out es 1'; end if;
  update matches set odds_1 = 1.60 where id = 'zz:pre';
  -- la lista de todas las mias
  r := cash_out_quotes();
  if jsonb_array_length(r) < 2 or not (r @> format('[{"bet":%s,"mode":"pre"}]', b1)::jsonb) then raise exception 'FALLO: cash_out_quotes no lista mis apuestas abiertas: %', r; end if;
  -- no es mio
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[2]), true);
  fallo := false; begin perform cash_out(b1); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: un jugador ha retirado la apuesta de otro'; end if;
  fallo := false; begin perform cash_out_quote(b1); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: un jugador ve el valor de la apuesta de otro'; end if;
  -- cobrar
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  fallo := false; begin perform cash_out(b1, 500); exception when others then fallo := true; end;
  if not fallo or (select status from bets where id = b1) <> 'open' then raise exception 'FALLO: con p_min por encima del valor se ha cobrado igual'; end if;
  s1 := (select coalesce(sum(amount), 0) from ledger where player = jug[1]);
  r := cash_out(b1, 119);
  if (r->>'value')::int <> 119 or (r->>'beneficio')::int <> 19 or (r->>'saldo')::int <> s1 + 119 then raise exception 'FALLO: resultado del cash out: %', r; end if;
  if (select status || payout from bets where id = b1) <> 'cashout119' or (select settled_at from bets where id = b1) is null then raise exception 'FALLO: la apuesta no queda cobrada con su valor'; end if;
  if not exists (select 1 from ledger where bet_id = b1 and kind = 'cashout' and amount = 119) then raise exception 'FALLO: el monedero no apunta el cash out'; end if;
  if (select coalesce(sum(amount), 0) from ledger where player = jug[1]) <> s0 - 100 - 1 + 119 then raise exception 'FALLO: el saldo no cuadra: -100 de la apuesta, +119 del cash out'; end if;
  if not exists (select 1 from chat where body like '% retira Local FC (Local FC vs Visitante FC) y cobra 119 de 100') then raise exception 'FALLO: falta el aviso del chat'; end if;
  fallo := false; begin perform cash_out(b1); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se puede cobrar dos veces la misma apuesta'; end if;
  fallo := false; begin perform cancel_bet(b1); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se puede cancelar una apuesta ya cobrada'; end if;
  -- al acabar el partido no se vuelve a pagar
  update matches set status = 'final', winner = '1', score = '1:0' where id = 'zz:pre';
  s1 := (select coalesce(sum(amount), 0) from ledger where player = jug[1]);
  n := settle_match('zz:pre');
  if n <> 1 then raise exception 'FALLO: settle_match debia cerrar solo la apuesta que seguia abierta (la de 1) y cierra %', n; end if;
  if (select coalesce(sum(amount), 0) from ledger where player = jug[1]) <> s1 + 5 then raise exception 'FALLO: la apuesta ya cobrada se ha vuelto a pagar'; end if;
  fallo := false; begin perform cash_out(b2); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se puede cobrar una apuesta de un partido acabado'; end if;
  resumen := resumen || 'Antes del partido: valor, minimo, cobro unico y saldo cuadrado. ';

  -- cuota mejorada: sin cash out
  insert into matches(id, sport, league, league_name, stage, tag, home, away, starts_at, status, odds_1, odds_2, bo) values
    ('zz:boost', 'v', 'ps:valorant:1', 'VCT', 'Grand Final', 'Internacional', 'Equipo Uno', 'Equipo Dos', fin, 'scheduled', 2.10, 1.80, 3);
  insert into ex_boosts(week, match_id, pick, pct) values (wk, 'zz:boost', '1', 40);
  r := place_bet('zz:boost', '1', 50); b3 := (r->>'bet')::bigint;
  q := cash_out_quote(b3);
  if (q->>'ok')::boolean then raise exception 'FALLO: se ofrece cash out en una apuesta con cuota mejorada'; end if;
  fallo := false; begin perform cash_out(b3); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se ha cobrado una apuesta con cuota mejorada'; end if;
  resumen := resumen || 'Sin cash out con cuota mejorada. ';

  -- =========================================================== FUTBOL EN DIRECTO
  insert into matches(id, sport, league, league_name, home, away, starts_at, status, score, odds_1, odds_x, odds_2) values
    ('zz:fut', 'f', 'esp.1', 'LaLiga', 'Directo FC', 'Rival FC', now() - interval '70 minutes', 'live', '1:0', 2.40, 3.30, 3.00);
  insert into bets(player, match_id, pick, stake, odds) values (jug[1], 'zz:fut', '1', 100, 2.40), (jug[1], 'zz:fut', 'X', 100, 3.30), (jug[1], 'zz:fut', '2', 100, 3.00);
  insert into ledger(player, amount, kind, note) values (jug[1], -300, 'apuesta', 'apuestas de prueba en directo');
  select id into b1 from bets where match_id = 'zz:fut' and pick = '1';
  select id into b2 from bets where match_id = 'zz:fut' and pick = 'X';
  select id into b3 from bets where match_id = 'zz:fut' and pick = '2';
  q := cash_out_quote(b1);
  if (q->>'ok')::boolean then raise exception 'FALLO: se ofrece cash out en directo sin datos del directo'; end if;
  fallo := false; begin perform sync_ex_live_put('clave-mala', '[{"match":"zz:fut","data":{"k":"f"}}]'); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: sync_ex_live_put acepta una clave mala'; end if;
  if sync_ex_live_put(sec, '[{"match":"zz:fut","data":{"k":"f","hs":1,"as":0,"min":70,"per":2}},{"match":"no-existe","data":{"k":"f"}}]') <> 1 then raise exception 'FALLO: sync_ex_live_put no guarda una sola fila'; end if;
  q := cash_out_quote(b1);
  if not (q->>'ok')::boolean or q->>'mode' <> 'live' or (q->>'win')::int <> 240 then raise exception 'FALLO: cash out en directo: %', q; end if;
  if (q->>'value')::int > 240 or (q->>'value')::int < 150 then raise exception 'FALLO: ganando 1-0 al 70 el valor debia estar entre 150 y 240 y es %', q->>'value'; end if;
  p1 := (q->>'p')::numeric; p2 := (cash_out_quote(b2)->>'p')::numeric; p3 := (cash_out_quote(b3)->>'p')::numeric;
  if abs(p1 + p2 + p3 - 1) > 0.01 then raise exception 'FALLO: las tres probabilidades en directo no suman 1: % % %', p1, p2, p3; end if;
  if not (p1 > p2 and p2 > p3) then raise exception 'FALLO: con 1-0 debe ser 1 > X > 2'; end if;
  v := (q->>'value')::int;
  update ex_live set data = '{"k":"f","hs":1,"as":1,"min":70,"per":2}' where match_id = 'zz:fut';       -- empatan: el valor de la apuesta al 1 baja
  if (cash_out_quote(b1)->>'value')::int >= v then raise exception 'FALLO: tras el empate el valor de la apuesta al 1 no baja'; end if;
  update ex_live set data = '{"k":"f","hs":1,"as":0,"min":70,"per":2}' where match_id = 'zz:fut';
  update ex_live set at = now() - interval '4 minutes' where match_id = 'zz:fut';
  q := cash_out_quote(b1);
  if (q->>'ok')::boolean then raise exception 'FALLO: se ofrece cash out con datos de hace 4 minutos'; end if;
  fallo := false; begin perform cash_out(b1); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se cobra con datos de hace 4 minutos'; end if;
  update ex_live set at = now() - interval '2 minutes' where match_id = 'zz:fut';
  if not (cash_out_quote(b1)->>'ok')::boolean then raise exception 'FALLO: con datos de hace 2 minutos si debe ofrecerse'; end if;
  update ex_live set data = '{"k":"f","hs":1,"as":0,"min":100,"per":3}', at = now() where match_id = 'zz:fut';
  if (cash_out_quote(b1)->>'ok')::boolean then raise exception 'FALLO: se ofrece cash out en la prorroga'; end if;
  update ex_live set data = '{"k":"f","hs":1,"as":0,"min":70,"per":2}', at = now() where match_id = 'zz:fut';
  -- en directo: el valor nunca pasa de lo que paga si gana y sube tanto como el modelo (aqui, un 5-0 al 89)
  update ex_live set data = '{"k":"f","hs":5,"as":0,"min":89,"per":2}' where match_id = 'zz:fut';
  q := cash_out_quote(b1);
  if (q->>'value')::int > 240 or (q->>'value')::int < 200 then raise exception 'FALLO: con 5-0 al 89 el valor debe quedar justo por debajo de 240 (90 %%) y es %', q->>'value'; end if;
  update ex_live set data = '{"k":"f","hs":1,"as":0,"min":70,"per":2}' where match_id = 'zz:fut';
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  v := (cash_out_quote(b1)->>'value')::int;
  s0 := (select coalesce(sum(amount), 0) from ledger where player = jug[1]);
  r := cash_out(b1, v - 2);
  if (r->>'mode') <> 'live' or (r->>'value')::int <> v or (select coalesce(sum(amount), 0) from ledger where player = jug[1]) <> s0 + v then raise exception 'FALLO: cobro en directo: %', r; end if;
  r := cash_out(b3);                                                        -- la apuesta al 2 (perdiendo) tambien se puede retirar: cobra poco
  if (r->>'value')::int >= 100 or (r->>'value')::int < 1 then raise exception 'FALLO: retirar una apuesta que va perdiendo debe dar menos de lo apostado (%)', r->>'value'; end if;
  if (r->>'beneficio')::int >= 0 then raise exception 'FALLO: retirar perdiendo no da perdida'; end if;
  resumen := resumen || 'Futbol en directo: modelo, caducidad de 3 minutos, prorroga, tope y cobro. ';

  -- =========================================================== VALORANT Y CS2 EN DIRECTO, UFC
  insert into matches(id, sport, league, league_name, home, away, starts_at, status, odds_1, odds_2, bo) values
    ('zz:vlr', 'v', 'ps:valorant:9', 'VCT', 'Nova', 'A Team', now() - interval '60 minutes', 'live', 1.50, 2.60, 3),
    ('zz:cs', 'c', 'ps:csgo:9', 'CCT', 'GenOne', 'BakS', now() - interval '60 minutes', 'live', 1.80, 2.00, 5),
    ('zz:ufc', 'u', 'ufc', 'UFC', 'Luchador A', 'Luchador B', now() - interval '10 minutes', 'live', 1.70, null, 2.20);
  insert into bets(player, match_id, pick, stake, odds) values (jug[2], 'zz:vlr', '1', 100, 1.50), (jug[2], 'zz:vlr', '2', 100, 2.60), (jug[2], 'zz:cs', '1', 100, 1.80), (jug[2], 'zz:ufc', '1', 100, 1.70);
  insert into ledger(player, amount, kind, note) values (jug[2], -400, 'apuesta', 'apuestas de prueba en directo');
  select id into b1 from bets where match_id = 'zz:vlr' and pick = '1';
  select id into b2 from bets where match_id = 'zz:vlr' and pick = '2';
  select id into b3 from bets where match_id = 'zz:cs';
  select id into b4 from bets where match_id = 'zz:ufc';
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[2]), true);
  perform sync_ex_live_put(sec, '[{"match":"zz:vlr","data":{"k":"s","a":1,"b":0,"bo":3,"ra":10,"rb":3}},{"match":"zz:cs","data":{"k":"s","a":0,"b":0,"bo":5,"ra":null,"rb":null}},{"match":"zz:ufc","data":{"k":"s"}}]');
  q := cash_out_quote(b1); p1 := (q->>'p')::numeric;
  p2 := (cash_out_quote(b2)->>'p')::numeric;
  if not (q->>'ok')::boolean or abs(p1 + p2 - 1) > 0.01 then raise exception 'FALLO: en Valorant las dos probabilidades deben sumar 1 (% %)', p1, p2; end if;
  if p1 < 0.8 then raise exception 'FALLO: ir 1-0 en mapas y 10-3 en rondas debe valer mas del 80 %% y vale %', p1; end if;
  update ex_live set data = '{"k":"s","a":1,"b":0,"bo":3,"ra":3,"rb":10}' where match_id = 'zz:vlr';
  if (cash_out_quote(b1)->>'p')::numeric >= p1 then raise exception 'FALLO: perder 3-10 en rondas no baja la probabilidad'; end if;
  update ex_live set data = '{"k":"s","a":1,"b":0,"bo":3,"ra":null,"rb":null}' where match_id = 'zz:vlr';
  if not (cash_out_quote(b1)->>'ok')::boolean then raise exception 'FALLO: sin rondas del mapa en juego tambien debe ofrecerse'; end if;
  update ex_live set data = '{"k":"s","a":2,"b":0,"bo":3,"ra":null,"rb":null}' where match_id = 'zz:vlr';
  if (cash_out_quote(b1)->>'ok')::boolean then raise exception 'FALLO: se ofrece cash out con la serie decidida'; end if;
  q := cash_out_quote(b3);
  if not (q->>'ok')::boolean or (q->>'p')::numeric < 0.35 or (q->>'p')::numeric > 0.65 then raise exception 'FALLO: CS2 BO5 0-0 entre 1,80 y 2,00 debe ser parejo: %', q; end if;
  q := cash_out_quote(b4);
  if (q->>'ok')::boolean then raise exception 'FALLO: la UFC tiene cash out en directo'; end if;
  fallo := false; begin perform cash_out(b4); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se cobra una apuesta de UFC en directo'; end if;
  insert into matches(id, sport, league, league_name, home, away, starts_at, status, odds_1, odds_2) values ('zz:ufc2', 'u', 'ufc', 'UFC', 'Uno', 'Dos', fin, 'scheduled', 1.70, 2.20);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[2]), true);
  r := place_bet('zz:ufc2', '1', 40);
  if (cash_out_quote((r->>'bet')::bigint)->>'value')::int <> 38 then raise exception 'FALLO: UFC antes del combate debe valer 38 (95 %% de 40)'; end if;
  resumen := resumen || 'Valorant y CS2 por mapas y rondas, UFC solo antes. ';

  -- =========================================================== LAS CUENTAS LO CUENTAN
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  s0 := bote_neto(jug[1], wk);
  insert into bets(player, match_id, pick, stake, odds, status, payout, settled_at) values (jug[1], 'zz:pre', '1', 100, 2.00, 'cashout', 130, now());
  if bote_neto(jug[1], wk) <> s0 + 30 then raise exception 'FALLO: el bote no cuenta el beneficio del cash out (+30)'; end if;
  insert into bets(player, match_id, pick, stake, odds, status, payout, settled_at) values (jug[1], 'zz:pre', '1', 100, 2.00, 'cashout', 60, now());
  if bote_neto(jug[1], wk) <> s0 + 30 - 40 then raise exception 'FALLO: el bote no cuenta la perdida del cash out (-40)'; end if;
  update settings set value = '"2026-01-15"' where key = 'season_start';
  delete from ex_trofeos;
  insert into bets(player, match_id, pick, stake, odds, status, payout, settled_at) values
    (jug[3], 'zz:pre', '1', 100, 2.00, 'cashout', 190, '2026-02-10 12:00+01'),
    (jug[1], 'zz:pre', '1', 100, 2.00, 'won', 200, '2026-02-11 12:00+01'),
    (jug[1], 'zz:pre', '1', 100, 2.00, 'lost', 0, '2026-02-12 12:00+01');
  perform ex_trofeos_apunta();
  if not exists (select 1 from ex_trofeos where tipo = 'mes' and periodo = '2026-02-01' and player = jug[3] and valor = 90) then raise exception 'FALLO: el campeon de febrero debia ser quien mas gano contando el cash out (+90)'; end if;
  update settings set value = '"2026-10-26"' where key = 'season_start';
  resumen := resumen || 'El bote y los trofeos cuentan el cash out. ';

  -- =========================================================== SEGURIDAD
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[2]), true);
  set local role authenticated;
  begin perform ex_cash_value((select b from bets b limit 1), (select m from matches m limit 1)); fallo := false; exception when insufficient_privilege then fallo := true; end;
  if not fallo then reset role; raise exception 'FALLO: un jugador puede llamar a ex_cash_value'; end if;
  begin perform ex_fut_prob('1', 0, 90, 0.5); fallo := false; exception when insufficient_privilege then fallo := true; end;
  if not fallo then reset role; raise exception 'FALLO: un jugador puede llamar a ex_fut_prob'; end if;
  begin perform sync_ex_live_put('clave-mala', '[]'); fallo := false; exception when others then fallo := true; end;
  if not fallo then reset role; raise exception 'FALLO: sync_ex_live_put entra con clave mala'; end if;
  n := 0; begin select count(*) into n from ex_live; exception when insufficient_privilege then n := 0; end;
  if n <> 0 then reset role; raise exception 'FALLO: un jugador puede leer ex_live'; end if;
  begin insert into ex_live(match_id, data) values ('zz:fut', '{}'); fallo := false; exception when insufficient_privilege then fallo := true; end;
  if not fallo then reset role; raise exception 'FALLO: un jugador puede escribir en ex_live'; end if;
  n := 0; begin update bets set status = 'cashout', payout = 99999 where player = jug[2] and status = 'open'; get diagnostics n = row_count; exception when insufficient_privilege then n := 0; end;
  if n <> 0 then reset role; raise exception 'FALLO: un jugador puede cerrar sus apuestas como cashout a mano'; end if;
  perform cash_out_quotes();                                                -- lo permitido sigue funcionando
  reset role;
  set local role anon;
  begin perform cash_out(1); fallo := false; exception when insufficient_privilege then fallo := true; end;
  if not fallo then reset role; raise exception 'FALLO: alguien sin cuenta puede llamar a cash_out'; end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  fallo := false; begin perform cash_out(1); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se cobra sin haber entrado'; end if;
  resumen := resumen || 'Lo interno esta cerrado a los jugadores.';

  raise exception 'PRUEBA SUPERADA (se deshace todo): %', resumen;
end $$;
