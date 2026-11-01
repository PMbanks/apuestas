-- Prueba de db/039_nba.sql, para el editor SQL de Supabase. Va DESPUES de 039.
-- Partidos de la NBA de mentira: nombres, codigos, lo que no se puede, apostar con la cuota congelada, cash out antes y en
-- directo (marcador, cuarto, reloj y lo que lleva cada jugador), el pago exacto (ganador, handicap, total, jugadores, lineas
-- enteras que caen justo, jugador que no juega, hoja que falta, marcador que no cuadra), combinadas, sin apuestas en directo,
-- el sincronizador, los permisos y que lo de 036 y 037 sigue igual. Al final lanza un error A PROPOSITO para que se deshaga todo.
-- Si todo va bien, el error dice "PRUEBA SUPERADA" con el resumen.
do $$
declare
  jug uuid[] := array(select id from players order by created_at, id);
  r jsonb; q jsonb; s0 int; s1 int; fallo boolean; resumen text := ''; v numeric; c1 bigint; c2 bigint;
  b1 bigint; b2 bigint; bsp1 bigint; bsp2 bigint; bto bigint; btu bigint; bpo bigint; bpu bigint; bro bigint; bru bigint; bao bigint; bxo bigint; bt3 bigint;
  bpush bigint; btpush bigint; bjnh bigint; bn3 bigint;
  l1 bigint; l2 bigint; lsp1 bigint; lsp2 bigint; lto bigint; ltu bigint; lpo bigint; lpu bigint; l2po bigint; l3 bigint;
  saldo constant text := 'select coalesce(sum(amount), 0)::int from ledger where player = $1';
  mm matches; nn matches;
  sec text := (select value #>> '{}' from settings where key = 'sync_secret');
  st text;
  pj constant jsonb := '{"pj":{"100":"LeBron James","200":"Jayson Tatum","300":"Jrue Holiday"},"espn":{"sport":"basketball","league":"nba","event":"1"}}';
begin
  insert into ledger(player, amount, kind, note) select id, 100000, 'ajuste', 'saldo de prueba' from players;
  insert into matches(id, sport, league, league_name, home, away, starts_at, status, odds_1, odds_x, odds_2, bo, details, odds_mk) values
    ('zz:n1', 'b', 'nba', 'NBA', 'Lakers', 'Celtics', now() + interval '3 hours', 'scheduled', 1.70, null, 2.20, null, pj,
     '{"SP1-6.5":1.95,"SP2+6.5":1.90,"TO216.5":1.91,"TU216.5":1.93,"J1:100:PO20.5":1.85,"J1:100:PU20.5":1.97,"J2:200:RO8.5":2.10,"J2:200:RU8.5":1.75,"J2:300:AO4.5":1.90,"J1:100:XO35.5":1.88,"J1:100:TO2.5":2.20,"O2.5":1.90,"W1-1":1.90,"GG":1.90}'),
    ('zz:n2', 'b', 'nba', 'NBA', 'Knicks', 'Heat', now() + interval '3 hours', 'scheduled', 1.60, null, 2.40, null, pj,
     '{"SP1-7":1.95,"TO217":1.90,"TU217":1.90,"J1:100:PO20.5":1.90}'),
    ('zz:n3', 'b', 'nba', 'NBA', 'Raro A', 'Raro B', now() + interval '3 hours', 'scheduled', 1.90, null, 1.90, null, pj, '{"SP1-1.5":1.90,"TO200.5":1.90}'),
    ('zz:n4', 'b', 'nba', 'NBA', 'Nuggets', 'Suns', now() + interval '3 hours', 'scheduled', 1.50, null, 2.70, null, pj,
     '{"SP1-4.5":1.92,"SP2+4.5":1.92,"TO220.5":1.91,"TU220.5":1.91,"J1:100:PO20.5":1.90,"J1:100:PU20.5":1.90,"J2:200:PO25.5":1.95,"J2:300:AO4.5":1.90}'),
    ('zz:n5', 'b', 'nba', 'NBA', 'Bucks', 'Bulls', now() + interval '3 hours', 'scheduled', 1.40, null, 3.00, null, pj,
     '{"SP1-3.5":1.90,"J1:100:PO20.5":1.80,"TO230.5":1.90}'),
    ('zz:f1', 'f', 'zz', 'Prueba', 'Local', 'Visita', now() + interval '2 hours', 'scheduled', 2.00, 3.40, 3.60, null, '{}', '{"O2.5":2.00,"U2.5":1.80,"TO216.5":1.90}'),
    ('zz:v1', 'v', 'zz', 'Prueba', 'FaZe', 'FURIA', now() + interval '3 hours', 'scheduled', 1.60, null, 2.40, 3, '{"mt":"best_of","ids":{"a":1,"b":2}}', '{"W1-1":1.70,"S2-0":2.80,"SP1-1.5":1.9}');
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  execute saldo into s0 using jug[1];

  -- ---------- el deporte, los nombres, los codigos y de que equipo es ----------
  fallo := false; begin insert into matches(id, sport, league, league_name, home, away, starts_at, status) values ('zz:x', 'z', 'zz', 'Prueba', 'a', 'b', now(), 'scheduled'); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: la tabla admite un deporte z'; end if;
  select * into mm from matches where id = 'zz:n1';
  if pick_name(mm, 'SP1-6.5') <> 'Lakers −6,5' or pick_name(mm, 'SP2+6.5') <> 'Celtics +6,5' or pick_name(mm, 'TO216.5') <> 'Más de 216,5 puntos'
     or pick_name(mm, 'TU216.5') <> 'Menos de 216,5 puntos' or pick_name(mm, 'J1:100:PO20.5') <> 'LeBron James: más de 20,5 puntos'
     or pick_name(mm, 'J2:200:RU8.5') <> 'Jayson Tatum: menos de 8,5 rebotes' or pick_name(mm, 'J1:100:XO35.5') <> 'LeBron James: más de 35,5 pts + reb + asist'
     or pick_name(mm, 'J1:100:TO2.5') <> 'LeBron James: más de 2,5 triples' or pick_name(mm, 'J2:999:AU4.5') <> 'Jugador: menos de 4,5 asistencias'
     or pick_name(mm, 'SP2-7') <> 'Celtics −7' or pick_name(mm, 'TO217') <> 'Más de 217 puntos' or pick_name(mm, '1') <> 'Lakers' then
    raise exception 'FALLO: nombres de la NBA: % / % / % / % / %', pick_name(mm, 'SP1-6.5'), pick_name(mm, 'TO216.5'), pick_name(mm, 'J1:100:PO20.5'), pick_name(mm, 'J1:100:XO35.5'), pick_name(mm, 'J2:999:AU4.5'); end if;
  if mk_lado('SP1-6.5') is distinct from '1' or mk_lado('SP2+6.5') is distinct from '2' or mk_lado('J2:200:RO8.5') is distinct from '2'
     or mk_lado('J1:100:PO20.5') is distinct from '1' or mk_lado('TO216.5') is not null then raise exception 'FALLO: el equipo de una apuesta de la NBA'; end if;
  if not mk_valido('SP1-6.5') or not mk_valido('SP2+12') or not mk_valido('TU216.5') or not mk_valido('TO217') or not mk_valido('J2:4065648:XO42.5')
     or mk_valido('SP3-6.5') or mk_valido('SP1-6.25') or mk_valido('SP1-100') or mk_valido('TO99.5') or mk_valido('T216.5') or mk_valido('J3:1:PO1.5')
     or mk_valido('J1:1:PO20') or mk_valido('J1:1:QO1.5') or mk_valido('J1::PO1.5') or mk_valido('J1:1:PO1.5x') then
    raise exception 'FALLO: los codigos validos de la NBA'; end if;
  -- lo de 036 y 037 sigue igual
  select * into nn from matches where id = 'zz:v1';
  if pick_name(nn, 'W1-1') <> 'Mapa 1: FaZe' or pick_name(nn, 'S2-0') <> 'FaZe 2:0' or pick_name(nn, 'H2+1.5') <> 'FURIA +1,5 mapas' or pick_name(nn, 'O2.5') <> 'Más de 2,5 goles'
     or not mk_valido('W5-2') or not mk_valido('GG') or not mk_valido('MU4.5') or mk_lado('W2-1') is distinct from '1' then
    raise exception 'FALLO: lo de 036 y 037 ha cambiado'; end if;
  resumen := resumen || 'Deporte b, nombres (Lakers −6,5, LeBron James: más de 20,5 puntos), codigos y lado bien; 036 y 037 igual. ';

  -- ---------- lo que no se puede ----------
  fallo := false; begin perform place_bet('zz:f1', 'TO216.5', 100); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja un total de la NBA en futbol'; end if;
  fallo := false; begin perform place_bet('zz:v1', 'SP1-1.5', 100); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja un handicap de la NBA en Valorant'; end if;
  fallo := false; begin perform place_bet('zz:n1', 'O2.5', 100); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja goles en la NBA'; end if;
  fallo := false; begin perform place_bet('zz:n1', 'W1-1', 100); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja mapas en la NBA'; end if;
  fallo := false; begin perform place_bet('zz:n1', 'GG', 100); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja ambos marcan en la NBA'; end if;
  fallo := false; begin perform place_bet('zz:n1', 'X', 100); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja empate en la NBA'; end if;
  fallo := false; begin perform place_bet('zz:n1', 'SP1-5.5', 100); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja una linea sin cuota'; end if;
  fallo := false; begin perform place_bet('zz:n1', 'J1:999:PO20.5', 100); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja un jugador sin cuota'; end if;
  fallo := false; begin insert into bets(player, match_id, pick, stake, odds) values (jug[1], 'zz:n1', 'J3:1:PO1.5', 10, 2); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: la tabla admite J3'; end if;
  fallo := false; begin insert into bets(player, match_id, pick, stake, odds) values (jug[1], 'zz:n1', 'SP1-6.25', 10, 2); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: la tabla admite SP1-6.25'; end if;
  if mk_cuota((select m from matches m where m.id = 'zz:f1'), 'TO216.5') is not null then raise exception 'FALLO: un total de la NBA tiene cuota en futbol'; end if;
  execute saldo into s1 using jug[1];
  if s1 <> s0 then raise exception 'FALLO: lo rechazado ha movido dinero (%)', s1 - s0; end if;
  resumen := resumen || 'Rechaza la NBA en otros deportes, goles, mapas y empate en la NBA, lineas y jugadores sin cuota, codigos raros. ';

  -- ---------- apostar: cobra y congela la cuota ----------
  b1 := (place_bet('zz:n1', '1', 100)->>'bet')::bigint;
  b2 := (place_bet('zz:n1', '2', 100)->>'bet')::bigint;
  r := place_bet('zz:n1', 'SP1-6.5', 100); bsp1 := (r->>'bet')::bigint;
  if (r->>'odds')::numeric <> 1.95 then raise exception 'FALLO: la cuota del handicap deberia ser 1,95 y es %', r->>'odds'; end if;
  bsp2 := (place_bet('zz:n1', 'SP2+6.5', 100)->>'bet')::bigint;
  bto := (place_bet('zz:n1', 'TO216.5', 100)->>'bet')::bigint;
  btu := (place_bet('zz:n1', 'TU216.5', 100)->>'bet')::bigint;
  r := place_bet('zz:n1', 'J1:100:PO20.5', 100); bpo := (r->>'bet')::bigint;
  if (r->>'odds')::numeric <> 1.85 then raise exception 'FALLO: la cuota del jugador deberia ser 1,85 y es %', r->>'odds'; end if;
  bpu := (place_bet('zz:n1', 'J1:100:PU20.5', 100)->>'bet')::bigint;
  bro := (place_bet('zz:n1', 'J2:200:RO8.5', 100)->>'bet')::bigint;
  bru := (place_bet('zz:n1', 'J2:200:RU8.5', 100)->>'bet')::bigint;
  bao := (place_bet('zz:n1', 'J2:300:AO4.5', 100)->>'bet')::bigint;
  bxo := (place_bet('zz:n1', 'J1:100:XO35.5', 100)->>'bet')::bigint;
  bt3 := (place_bet('zz:n1', 'J1:100:TO2.5', 100)->>'bet')::bigint;
  execute saldo into s1 using jug[1];
  if s1 <> s0 - 1300 then raise exception 'FALLO: deberia haber cobrado 1.300 y ha cobrado %', s0 - s1; end if;
  if (select note from ledger where bet_id = bpo and kind = 'apuesta') <> 'LeBron James: más de 20,5 puntos 1,85'
     or (select note from ledger where bet_id = bsp1 and kind = 'apuesta') <> 'Lakers −6,5 1,95' then
    raise exception 'FALLO: notas del monedero: % / %', (select note from ledger where bet_id = bpo and kind = 'apuesta'), (select note from ledger where bet_id = bsp1 and kind = 'apuesta'); end if;
  update matches set odds_mk = odds_mk || '{"SP1-6.5":1.70,"J1:100:PO20.5":2.40}' where id = 'zz:n1';
  if (select odds from bets where id = bsp1) <> 1.95 or (select odds from bets where id = bpo) <> 1.85 then raise exception 'FALLO: la cuota no se ha congelado'; end if;
  resumen := resumen || 'Cobra y congela la cuota (ganador, handicap, total, jugadores). ';

  -- cash out antes de empezar: con la cuota de ahora del mismo mercado; si la linea ya no esta, no hay
  q := cash_out_quote(bsp1);
  if not (q->>'ok')::boolean or (q->>'value')::int <> round(100 * 1.95 / 1.70 * 0.95) then raise exception 'FALLO: cash out del handicap antes de empezar: %', q; end if;
  q := cash_out_quote(bpo);
  if (q->>'value')::int <> round(100 * 1.85 / 2.40 * 0.95) then raise exception 'FALLO: cash out del jugador antes de empezar: %', q; end if;
  update matches set odds_mk = odds_mk - 'SP1-6.5' || '{"SP1-7.5":1.95}' where id = 'zz:n1';
  if (cash_out_quote(bsp1)->>'ok')::boolean then raise exception 'FALLO: cash out de una linea que ya no esta'; end if;
  update matches set odds_mk = odds_mk - 'SP1-7.5' || '{"SP1-6.5":1.70}' where id = 'zz:n1';
  resumen := resumen || 'Cash out antes de empezar con la cuota de ahora (y sin el si la linea se ha movido). ';

  -- ---------- en directo: Nuggets 80 Suns 70, tercer cuarto con 5:00 por jugar ----------
  l1 := (place_bet('zz:n4', '1', 100)->>'bet')::bigint;
  l2 := (place_bet('zz:n4', '2', 100)->>'bet')::bigint;
  lsp1 := (place_bet('zz:n4', 'SP1-4.5', 100)->>'bet')::bigint;
  lsp2 := (place_bet('zz:n4', 'SP2+4.5', 100)->>'bet')::bigint;
  lto := (place_bet('zz:n4', 'TO220.5', 100)->>'bet')::bigint;
  ltu := (place_bet('zz:n4', 'TU220.5', 100)->>'bet')::bigint;
  lpo := (place_bet('zz:n4', 'J1:100:PO20.5', 100)->>'bet')::bigint;
  lpu := (place_bet('zz:n4', 'J1:100:PU20.5', 100)->>'bet')::bigint;
  l2po := (place_bet('zz:n4', 'J2:200:PO25.5', 100)->>'bet')::bigint;
  l3 := (place_bet('zz:n4', 'J2:300:AO4.5', 100)->>'bet')::bigint;
  update matches set status = 'live', starts_at = now() - interval '90 minutes' where id = 'zz:n4';
  insert into ex_live(match_id, data, at) values ('zz:n4', '{"k":"b","hs":80,"as":70,"per":3,"clk":300,"pj":{"100":[22,5,5,2],"200":[12,4,2,1]}}', now());
  q := cash_out_quote(l1);
  if not (q->>'ok')::boolean or abs((q->>'p')::numeric - 0.940) > 0.002 then raise exception 'FALLO: ganando de 10 con 17 minutos por jugar el 1 deberia valer p 0,940: %', q; end if;
  if abs((q->>'p')::numeric + (cash_out_quote(l2)->>'p')::numeric - 1) > 0.002 then raise exception 'FALLO: 1 y 2 en directo deberian sumar 1'; end if;
  if abs((q->>'value')::int - round(100 * 1.50 * (q->>'p')::numeric * 0.90)) > 1 then raise exception 'FALLO: valor en directo del 1: %', q; end if;
  v := (cash_out_quote(lsp1)->>'p')::numeric;
  if abs(v - 0.830) > 0.002 then raise exception 'FALLO: el handicap -4,5 en directo deberia valer p 0,830 y vale %', v; end if;
  if abs(v + (cash_out_quote(lsp2)->>'p')::numeric - 1) > 0.002 then raise exception 'FALLO: los dos handicaps deberian sumar 1'; end if;
  v := (cash_out_quote(lto)->>'p')::numeric;
  if abs(v - 0.761) > 0.002 then raise exception 'FALLO: mas de 220,5 con 150 y 17 minutos deberia valer p 0,761 y vale %', v; end if;
  if abs(v + (cash_out_quote(ltu)->>'p')::numeric - 1) > 0.002 then raise exception 'FALLO: mas y menos del total deberian sumar 1'; end if;
  q := cash_out_quote(lpo); if not (q->>'ok')::boolean or (q->>'p')::numeric <> 1 then raise exception 'FALLO: el jugador que ya paso la linea deberia valer p 1: %', q; end if;
  if (q->>'value')::int <> round(100 * 1.90 * 0.99 * 0.90) then raise exception 'FALLO: valor de una ya ganada: %', q; end if;
  q := cash_out_quote(lpu); if not (q->>'ok')::boolean or (q->>'p')::numeric <> 0 then raise exception 'FALLO: menos de la linea ya pasada deberia valer p 0: %', q; end if;
  v := (cash_out_quote(l2po)->>'p')::numeric;
  if abs(v - 0.158) > 0.002 then raise exception 'FALLO: 12 puntos con 25,5 de linea y 17 minutos deberia valer p 0,158 y vale %', v; end if;
  q := cash_out_quote(l3); if (q->>'ok')::boolean then raise exception 'FALLO: cash out de un jugador que no esta en la hoja: %', q; end if;
  -- en el descanso de la prorroga, igualados: el 1 cerca de la mitad
  update ex_live set data = '{"k":"b","hs":110,"as":110,"per":5,"clk":300,"pj":{}}', at = now() where match_id = 'zz:n4';
  v := (cash_out_quote(l1)->>'p')::numeric;
  if v < 0.5 or v > 0.65 then raise exception 'FALLO: igualados en la prorroga el 1 deberia valer algo mas de la mitad y vale %', v; end if;
  if mk_nba_p((select m from matches m where m.id = 'zz:n4'), '1', '{"k":"s","hs":80,"as":70,"per":3,"clk":300}') is not null then raise exception 'FALLO: el modelo de la NBA acepta datos de otro deporte'; end if;
  update ex_live set data = '{"k":"s","a":1,"b":0}', at = now() where match_id = 'zz:n4';
  if (cash_out_quote(l1)->>'ok')::boolean then raise exception 'FALLO: cash out de la NBA con datos que no son de la NBA'; end if;
  update ex_live set data = '{"k":"b","hs":80,"as":70,"per":3,"clk":300,"pj":{}}', at = now() - interval '10 minutes' where match_id = 'zz:n4';
  if (cash_out_quote(l1)->>'ok')::boolean then raise exception 'FALLO: cash out con datos viejos'; end if;
  -- sin apuestas en directo en la NBA
  update ex_live set at = now() where match_id = 'zz:n4';
  if ex_live_odds((select m from matches m where m.id = 'zz:n4'), '1') is not null then raise exception 'FALLO: la NBA tiene cuota en directo'; end if;
  if (live_quote('zz:n4')->>'ok')::boolean then raise exception 'FALLO: live_quote da cuotas de la NBA'; end if;
  fallo := false; begin perform place_live_bet('zz:n4', '1', 100, null); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja apostar en directo en la NBA'; end if;
  resumen := resumen || 'Cash out en directo: ganador, handicap y total con lo que queda (sumando 1), jugador ya pasado o aun lejos, sin el si no ha salido, con datos viejos o de otro deporte. Sin apuestas en directo. ';

  -- ---------- pagar 112:105 (Lakers por 7) con la hoja ----------
  execute saldo into s0 using jug[1];
  update matches set status = 'final', score = '112:105', winner = '1',
    details = pj || '{"bxok":true,"bx":{"100":[25,7,9,3],"200":[30,9,4,5]}}' where id = 'zz:n1';
  perform settle_match('zz:n1');
  select string_agg(status || coalesce(':' || payout, ''), ' ' order by id) into st from bets where match_id = 'zz:n1';
  if (select status from bets where id = b1) <> 'won' or (select payout from bets where id = b1) <> 170
     or (select status from bets where id = b2) <> 'lost'
     or (select status from bets where id = bsp1) <> 'won' or (select payout from bets where id = bsp1) <> 195
     or (select status from bets where id = bsp2) <> 'lost'
     or (select status from bets where id = bto) <> 'won' or (select payout from bets where id = bto) <> 191
     or (select status from bets where id = btu) <> 'lost'
     or (select status from bets where id = bpo) <> 'won' or (select payout from bets where id = bpo) <> 185
     or (select status from bets where id = bpu) <> 'lost'
     or (select status from bets where id = bro) <> 'won' or (select payout from bets where id = bro) <> 210
     or (select status from bets where id = bru) <> 'lost'
     or (select status from bets where id = bao) <> 'void' or (select payout from bets where id = bao) <> 100
     or (select status from bets where id = bxo) <> 'won' or (select payout from bets where id = bxo) <> 188
     or (select status from bets where id = bt3) <> 'won' or (select payout from bets where id = bt3) <> 220 then
    raise exception 'FALLO: 112:105 (1, 2, -6,5, +6,5, mas, menos, LeBron mas/menos 20,5, Tatum mas/menos 8,5 reb, Holiday no juega, LeBron PRA, triples): %', st; end if;
  execute saldo into s1 using jug[1];
  if s1 - s0 <> 170 + 195 + 191 + 185 + 210 + 100 + 188 + 220 then raise exception 'FALLO: el saldo deberia subir % y sube %', 170 + 195 + 191 + 185 + 210 + 100 + 188 + 220, s1 - s0; end if;
  if not exists (select 1 from ledger where bet_id = bao and kind = 'devolucion' and note = 'Anulado: Jrue Holiday: más de 4,5 asistencias · Lakers vs Celtics') then raise exception 'FALLO: falta la devolucion del jugador que no juega'; end if;
  if not exists (select 1 from chat where body like '% recupera 100: Jrue Holiday: más de 4,5 asistencias en Lakers vs Celtics no ha jugado o no tiene estadística') then raise exception 'FALLO: falta el aviso del chat del jugador que no juega'; end if;
  if not exists (select 1 from chat where body like '% ganó 185 con LeBron James: más de 20,5 puntos · Lakers 112:105 Celtics') then raise exception 'FALLO: falta el aviso del premio del jugador'; end if;
  if not exists (select 1 from ledger where bet_id = bsp1 and kind = 'premio' and note = 'Lakers −6,5 1,95') then raise exception 'FALLO: premio del handicap en el monedero'; end if;
  resumen := resumen || '112:105: ganador, handicap, total y jugadores pagados exactos (prorroga incluida en la hoja), jugador que no juega devuelto. ';

  -- ---------- lineas enteras que caen justo, y sin la hoja entera ----------
  bpush := (place_bet('zz:n2', 'SP1-7', 100)->>'bet')::bigint;
  btpush := (place_bet('zz:n2', 'TO217', 100)->>'bet')::bigint;
  bjnh := (place_bet('zz:n2', 'J1:100:PO20.5', 100)->>'bet')::bigint;
  b1 := (place_bet('zz:n2', '1', 100)->>'bet')::bigint;
  update matches set status = 'final', score = '112:105', winner = '1', details = pj || '{"bxok":false,"bx":{"100":[25,7,9,3]}}' where id = 'zz:n2';
  perform settle_match('zz:n2');
  if (select status from bets where id = bpush) <> 'void' or (select payout from bets where id = bpush) <> 100
     or (select status from bets where id = btpush) <> 'void' or (select status from bets where id = bjnh) <> 'void'
     or (select status from bets where id = b1) <> 'won' then
    raise exception 'FALLO: lineas enteras justas y hoja sin acabar deberian devolverse (y el 1 pagarse): %', (select string_agg(status, ' ' order by id) from bets where match_id = 'zz:n2'); end if;
  if not exists (select 1 from chat where body like '% recupera 100: Knicks −7 en Knicks vs Heat ha caído justo en la línea') then raise exception 'FALLO: falta el aviso de la linea justa'; end if;
  -- marcador que no cuadra con el ganador: se devuelve
  bn3 := (place_bet('zz:n3', 'SP1-1.5', 100)->>'bet')::bigint;
  b2 := (place_bet('zz:n3', 'TO200.5', 100)->>'bet')::bigint;
  update matches set status = 'final', score = '100:90', winner = '2', details = pj || '{"bxok":true,"bx":{}}' where id = 'zz:n3';
  perform settle_match('zz:n3');
  if (select status from bets where id = bn3) <> 'void' or (select status from bets where id = b2) <> 'void' then raise exception 'FALLO: un marcador que no cuadra deberia devolverse'; end if;
  select * into mm from matches where id = 'zz:n3';
  mm.score := '100:100'; mm.winner := '1';
  if mk_resultado(mm, 'TO200.5') <> 'void' then raise exception 'FALLO: un empate en la NBA deberia devolverse'; end if;
  mm.score := '1000:90';
  if mk_resultado(mm, 'TO200.5') <> 'void' then raise exception 'FALLO: un marcador raro deberia devolverse'; end if;
  mm.score := '100:90'; mm.details := '{"bxok":true,"bx":{"100":[25,"x",9,3]}}';
  if mk_resultado(mm, 'J1:100:PO20.5') <> 'void' then raise exception 'FALLO: una hoja con datos raros deberia devolverse'; end if;
  mm.details := '{"bxok":true,"bx":{"100":[25,7,9]}}';
  if mk_resultado(mm, 'J1:100:PO20.5') <> 'void' then raise exception 'FALLO: una hoja corta deberia devolverse'; end if;
  mm.details := '{"bx":{"100":[25,7,9,3]}}';
  if mk_resultado(mm, 'J1:100:PO20.5') <> 'void' then raise exception 'FALLO: sin bxok deberia devolverse'; end if;
  mm.details := '{"bxok":true,"bx":{"100":[20,7,9,3]}}';
  if mk_resultado(mm, 'J1:100:PO20.5') <> 'lost' or mk_resultado(mm, 'J1:100:PU20.5') <> 'won' then raise exception 'FALLO: 20 puntos con linea 20,5'; end if;
  mm.details := '{"bxok":true,"bx":{"100":[21,7,9,3]}}';
  if mk_resultado(mm, 'J1:100:PO20.5') <> 'won' or mk_resultado(mm, 'J1:100:AU9.5') <> 'won' or mk_resultado(mm, 'J1:100:RO6.5') <> 'won' then raise exception 'FALLO: 21 puntos con linea 20,5'; end if;
  resumen := resumen || 'Lineas enteras justas, hoja sin acabar, marcador que no cuadra y datos raros: se devuelve. ';

  -- ---------- combinadas ----------
  insert into matches(id, sport, league, league_name, home, away, starts_at, status, odds_1, odds_x, odds_2, bo, details, odds_mk) values
    ('zz:k1', 'f', 'zz', 'Prueba', 'K1 A', 'K1 B', now() + interval '2 hours', 'scheduled', 2.00, 3.40, 3.60, null, '{}', '{"O2.5":2.00,"U2.5":1.80}');
  fallo := false; begin perform place_combo('[{"match":"zz:n5","pick":"SP1-3.5"},{"match":"zz:n5","pick":"J1:100:PO20.5"}]', 100); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja dos patas del mismo partido de la NBA'; end if;
  r := place_combo('[{"match":"zz:k1","pick":"O2.5"},{"match":"zz:n5","pick":"J1:100:PO20.5"}]', 100); c1 := (r->>'combo')::bigint;
  if (r->>'odds')::numeric <> 3.60 then raise exception 'FALLO: 2,00 por 1,80 deberia ser 3,60 y es %', r->>'odds'; end if;
  r := place_combo('[{"match":"zz:k1","pick":"O2.5"},{"match":"zz:n5","pick":"SP1-3.5"}]', 100); c2 := (r->>'combo')::bigint;
  -- cash out de combinada con la NBA en directo
  update matches set status = 'live', starts_at = now() - interval '30 minutes' where id = 'zz:n5';
  insert into ex_live(match_id, data, at) values ('zz:n5', '{"k":"b","hs":30,"as":20,"per":2,"clk":600,"pj":{"100":[10,2,3,1]}}', now());
  q := (select x from jsonb_array_elements(combo_cash_quotes()) x where (x->>'combo')::bigint = c2);
  if not (q->>'ok')::boolean then raise exception 'FALLO: cash out de combinada con la NBA: %', q; end if;
  execute saldo into s0 using jug[1];
  update matches set status = 'final', score = '2:1', winner = '1', details = '{"r90":"2:1"}' where id = 'zz:k1';
  perform settle_match('zz:k1');
  update matches set status = 'final', score = '110:100', winner = '1', details = pj || '{"bxok":true,"bx":{"200":[30,8,4,5]}}' where id = 'zz:n5';
  perform settle_match('zz:n5');
  if (select result from combo_legs where combo_id = c1 and match_id = 'zz:n5') <> 'void' then raise exception 'FALLO: pata de un jugador que no juega deberia anularse'; end if;
  if (select result from combo_legs where combo_id = c2 and match_id = 'zz:n5') <> 'won' then raise exception 'FALLO: pata del handicap deberia ganar'; end if;
  if (select status from combos where id = c1) <> 'won' or (select payout from combos where id = c1) <> 200 then raise exception 'FALLO: la combinada con el jugador anulado deberia cobrar 200'; end if;
  if (select status from combos where id = c2) <> 'won' or (select payout from combos where id = c2) <> 380 then raise exception 'FALLO: la combinada con el handicap deberia cobrar 380'; end if;
  execute saldo into s1 using jug[1];
  if s1 - s0 <> 580 then raise exception 'FALLO: las combinadas deberian subir 580 y suben %', s1 - s0; end if;
  resumen := resumen || 'Combinadas con la NBA: una pata por partido, cash out en directo, pago exacto y pata de jugador que no juega anulada. ';

  -- ---------- el sincronizador ----------
  perform sync_push(sec, jsonb_build_array(jsonb_build_object('id', 'zz:s1', 'sport', 'b', 'league', 'nba', 'league_name', 'NBA', 'home', 'S A', 'away', 'S B',
    'starts_at', now() + interval '1 day', 'status', 'scheduled', 'odds_1', 1.8, 'odds_2', 2.0, 'details', '{"pj":{"100":"LeBron James"}}'::jsonb,
    'odds_mk', '{"SP1-6.5":1.954,"TO216.5":1.9,"J1:100:PO20.5":1.85,"J3:1:PO1.5":2,"SP1-6.25":2,"T216.5":2,"J1:100:PO20":2,"TO99.5":2}'::jsonb)));
  if (select odds_mk from matches where id = 'zz:s1') <> '{"SP1-6.5":1.95,"TO216.5":1.90,"J1:100:PO20.5":1.85}'::jsonb then
    raise exception 'FALLO: el sincronizador guarda %', (select odds_mk from matches where id = 'zz:s1'); end if;
  if (select details #>> '{pj,100}' from matches where id = 'zz:s1') <> 'LeBron James' or (select sport from matches where id = 'zz:s1') <> 'b' then raise exception 'FALLO: el sincronizador no guarda la NBA'; end if;
  resumen := resumen || 'Sincronizador: guarda la NBA y tira los codigos raros. ';

  -- ---------- lo interno, cerrado ----------
  if has_function_privilege('authenticated', 'mk_nba_p(matches, text, jsonb)', 'execute') or has_function_privilege('anon', 'mk_nba_stat(jsonb, text)', 'execute')
     or has_function_privilege('authenticated', 'mk_ncdf(numeric)', 'execute') or has_function_privilege('authenticated', 'mk_nba_linea(text)', 'execute')
     or has_function_privilege('authenticated', 'mk_resultado(matches, text)', 'execute') then
    raise exception 'FALLO: las funciones internas se pueden llamar desde fuera'; end if;
  if not has_function_privilege('authenticated', 'place_bet(text, text, int)', 'execute') or not has_function_privilege('authenticated', 'cash_out_quote(bigint)', 'execute') then
    raise exception 'FALLO: los jugadores han perdido un permiso'; end if;

  raise exception 'PRUEBA SUPERADA (se deshace todo): %', resumen;
end $$;
