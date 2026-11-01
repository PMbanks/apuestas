-- Prueba de db/036_mercados.sql, para el editor SQL de Supabase. Va DESPUES de 036.
-- Partidos de mentira (futbol, Valorant y CS2) con cuotas de los mercados nuevos: apostar, lo que no se puede, la cuota
-- congelada, cancelar, cash out antes y en directo, el pago exacto de cada mercado (90 minutos en futbol; series completas en
-- mapas), lo que se devuelve, las combinadas y el sincronizador. Al final lanza un error A PROPOSITO para que se deshaga todo.
-- Si todo va bien, el error dice "PRUEBA SUPERADA" con el resumen.
do $$
declare
  jug uuid[] := array(select id from players order by created_at, id);
  r jsonb; q jsonb; s0 int; s1 int; fallo boolean; resumen text := ''; v numeric; c1 bigint; c2 bigint;
  b_o25 bigint; b_u25 bigint; b_gg bigint; b_ng bigint; b_o15 bigint; b_1 bigint; b_o35 bigint; b_can bigint;
  b_s21 bigint; b_s20 bigint; b_s12 bigint; b_h2 bigint; b_h1 bigint; b_mo bigint; b_mu bigint; b_v1 bigint;
  b_ff bigint; b_ff1 bigint; b_aet bigint; b_aet2 bigint; b_sin bigint; b_raro bigint; b_bo5 bigint;
  saldo constant text := 'select coalesce(sum(amount), 0)::int from ledger where player = $1';
  mf matches; mv matches;
  sec text := (select value #>> '{}' from settings where key = 'sync_secret');
begin
  insert into ledger(player, amount, kind, note) select id, 100000, 'ajuste', 'saldo de prueba' from players;
  insert into matches(id, sport, league, league_name, home, away, starts_at, status, odds_1, odds_x, odds_2, bo, details, odds_mk) values
    ('zz:f1', 'f', 'zz', 'Prueba', 'Local', 'Visita', now() + interval '2 hours', 'scheduled', 2.00, 3.40, 3.60, null, '{}',
     '{"O1.5":1.30,"U1.5":3.40,"O2.5":1.90,"U2.5":1.95,"O3.5":3.10,"U3.5":1.38,"GG":1.80,"NG":2.00}'),
    ('zz:f2', 'f', 'zz', 'Prueba', 'Copa A', 'Copa B', now() + interval '2 hours', 'scheduled', 2.10, 3.30, 3.50, null, '{}',
     '{"O2.5":2.00,"U2.5":1.85,"GG":1.75,"NG":2.05}'),
    ('zz:f3', 'f', 'zz', 'Prueba', 'Sin90 A', 'Sin90 B', now() + interval '2 hours', 'scheduled', 2.10, 3.30, 3.50, null, '{}',
     '{"O2.5":2.00,"U2.5":1.85}'),
    ('zz:f4', 'f', 'zz', 'Prueba', 'Pelado A', 'Pelado B', now() + interval '2 hours', 'scheduled', 2.10, 3.30, 3.50, null, '{}', null),
    ('zz:v1', 'v', 'zz', 'Prueba', 'FaZe', 'FURIA', now() + interval '3 hours', 'scheduled', 1.60, null, 2.40, 3, '{"mt":"best_of"}',
     '{"S2-0":2.80,"S2-1":3.70,"S1-2":4.60,"S0-2":5.60,"H1+1.5":1.22,"H2+1.5":1.75,"MO2.5":2.10,"MU2.5":1.72}'),
    ('zz:c1', 'c', 'zz', 'Prueba', 'NAVI', 'Vitality', now() + interval '3 hours', 'scheduled', 2.10, null, 1.75, 3, '{"mt":"best_of"}',
     '{"S2-0":3.90,"S2-1":4.40,"S1-2":3.80,"S0-2":3.10,"H1+1.5":1.55,"H2+1.5":1.35}'),
    ('zz:c2', 'c', 'zz', 'Prueba', 'Raro A', 'Raro B', now() + interval '3 hours', 'scheduled', 1.90, null, 1.90, 3, '{"mt":"best_of"}',
     '{"S2-0":3.50,"S0-2":3.50}'),
    ('zz:c5', 'c', 'zz', 'Prueba', 'BO5 A', 'BO5 B', now() + interval '3 hours', 'scheduled', 1.70, null, 2.20, 5, '{"mt":"best_of"}',
     '{"S3-0":4.0,"S3-1":4.2,"S3-2":5.0,"S2-3":6.0,"S1-3":7.5,"S0-3":9.0,"S2-1":3.0,"H1+1.5":1.30,"MO4.5":3.10}');
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  execute saldo into s0 using jug[1];

  -- ---------- los nombres ----------
  select * into mf from matches where id = 'zz:f1'; select * into mv from matches where id = 'zz:v1';
  if pick_name(mf, 'O2.5') <> 'Más de 2,5 goles' or pick_name(mf, 'U1.5') <> 'Menos de 1,5 goles' or pick_name(mf, 'GG') <> 'Ambos marcan: sí'
     or pick_name(mf, 'NG') <> 'Ambos marcan: no' or pick_name(mf, '1') <> 'Local' or pick_name(mf, 'X') <> 'Empate' then
    raise exception 'FALLO: nombres de futbol: % / % / % / %', pick_name(mf, 'O2.5'), pick_name(mf, 'U1.5'), pick_name(mf, 'GG'), pick_name(mf, 'NG'); end if;
  if pick_name(mv, 'S2-0') <> 'FaZe 2:0' or pick_name(mv, 'S1-2') <> 'FURIA 2:1' or pick_name(mv, 'H2+1.5') <> 'FURIA +1,5 mapas'
     or pick_name(mv, 'MU2.5') <> 'Menos de 2,5 mapas' then
    raise exception 'FALLO: nombres de mapas: % / % / % / %', pick_name(mv, 'S2-0'), pick_name(mv, 'S1-2'), pick_name(mv, 'H2+1.5'), pick_name(mv, 'MU2.5'); end if;
  resumen := resumen || 'Nombres bien. ';

  -- ---------- lo que no se puede ----------
  fallo := false; begin perform place_bet('zz:f1', 'S2-0', 100); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja apostar a un resultado de mapas en futbol'; end if;
  fallo := false; begin perform place_bet('zz:v1', 'GG', 100); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja apostar a ambos marcan en Valorant'; end if;
  fallo := false; begin perform place_bet('zz:v1', 'S3-1', 100); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja un 3:1 en una serie al mejor de 3'; end if;
  fallo := false; begin perform place_bet('zz:f4', 'O2.5', 100); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja apostar a goles en un partido sin esa cuota'; end if;
  fallo := false; begin perform place_bet('zz:f1', 'O2.4', 100); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja un codigo que no existe'; end if;
  fallo := false; begin perform place_bet('zz:f1', 'O4.5', 100); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja una linea sin cuota'; end if;
  fallo := false; begin perform place_bet('zz:f1', 'O2.5', 0); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja apostar 0'; end if;
  fallo := false; begin perform place_bet('zz:f1', 'O2.5', 999999999); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja apostar mas que el saldo'; end if;
  fallo := false; begin insert into bets(player, match_id, pick, stake, odds) values (jug[1], 'zz:f1', 'ZZ', 10, 2); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: la tabla admite un codigo raro'; end if;
  execute saldo into s1 using jug[1];
  if s1 <> s0 then raise exception 'FALLO: lo rechazado ha movido dinero (%)', s1 - s0; end if;
  resumen := resumen || 'Rechaza mercados de otro deporte, formatos que no cuadran, lineas sin cuota, codigos raros, 0 y sin saldo. ';

  -- ---------- apostar: cobra, congela la cuota y la cuota mejorada no vale ----------
  insert into ex_boosts(week, match_id, pick, pct) values (madrid_week(), 'zz:f1', null, 40)
  on conflict (week) do update set match_id = excluded.match_id, pick = excluded.pick, pct = excluded.pct;
  r := place_bet('zz:f1', 'O2.5', 100); b_o25 := (r->>'bet')::bigint;
  if (r->>'odds')::numeric <> 1.90 or r->>'boost' is not null then raise exception 'FALLO: la cuota de Más de 2,5 deberia ser 1,90 sin mejora y es % (%)', r->>'odds', r->>'boost'; end if;
  r := place_bet('zz:f1', '1', 100); b_1 := (r->>'bet')::bigint;
  if (r->>'odds')::numeric <> 2.80 then raise exception 'FALLO: el 1 con la mejora del 40 %% deberia ser 2,80 y es %', r->>'odds'; end if;
  delete from ex_boosts where match_id = 'zz:f1';
  r := place_bet('zz:f1', 'U2.5', 100); b_u25 := (r->>'bet')::bigint;
  r := place_bet('zz:f1', 'GG', 200); b_gg := (r->>'bet')::bigint;
  r := place_bet('zz:f1', 'NG', 100); b_ng := (r->>'bet')::bigint;
  r := place_bet('zz:f1', 'O1.5', 100); b_o15 := (r->>'bet')::bigint;
  r := place_bet('zz:f1', 'O3.5', 100); b_o35 := (r->>'bet')::bigint;
  r := place_bet('zz:f1', 'U3.5', 100); b_can := (r->>'bet')::bigint;
  execute saldo into s1 using jug[1];
  if s1 <> s0 - 900 then raise exception 'FALLO: deberia haber cobrado 900 al apostar y ha cobrado %', s0 - s1; end if;
  if (select note from ledger where bet_id = b_gg and kind = 'apuesta') <> 'Ambos marcan: sí 1,80' then
    raise exception 'FALLO: nota del monedero rara: %', (select note from ledger where bet_id = b_gg and kind = 'apuesta'); end if;
  update matches set odds_mk = odds_mk || '{"O2.5":1.50,"GG":2.40}' where id = 'zz:f1';
  if (select odds from bets where id = b_o25) <> 1.90 then raise exception 'FALLO: la cuota no se ha quedado congelada'; end if;
  resumen := resumen || 'Cobra al apostar, congela la cuota, la cuota mejorada solo vale para 1 X 2. ';

  -- cancelar (antes de empezar devuelve todo)
  r := cancel_bet(b_can);
  if (select status from bets where id = b_can) <> 'void' or (r->>'devuelto')::int <> 100 then raise exception 'FALLO: cancelar no devuelve'; end if;

  -- cash out antes de empezar: importe x cuota con la que aposto / cuota de ahora del mismo mercado x 0,95
  q := cash_out_quote(b_o25);
  if not (q->>'ok')::boolean or (q->>'value')::int <> round(100 * 1.90 / 1.50 * 0.95) then raise exception 'FALLO: cash out antes de empezar: %', q; end if;
  q := cash_out_quote(b_gg);
  if (q->>'value')::int <> round(200 * 1.80 / 2.40 * 0.95) then raise exception 'FALLO: cash out de ambos marcan: %', q; end if;
  update matches set odds_mk = odds_mk - 'GG' where id = 'zz:f1';
  q := cash_out_quote(b_gg);
  if (q->>'ok')::boolean then raise exception 'FALLO: cash out sin cuota de ese mercado: %', q; end if;
  update matches set odds_mk = odds_mk || '{"GG":2.40}' where id = 'zz:f1';
  resumen := resumen || 'Cancelar y cash out antes de empezar con la cuota de ahora del mismo mercado. ';

  -- ---------- futbol en directo: cash out con el marcador ----------
  update matches set status = 'live', starts_at = now() - interval '60 minutes' where id = 'zz:f1';
  insert into ex_live(match_id, data, at) values ('zz:f1', '{"k":"f","min":60,"hs":2,"as":1,"per":2}', now());
  q := cash_out_quote(b_o25); if (q->>'p')::numeric <> 1 then raise exception 'FALLO: con 2:1 Más de 2,5 ya esta ganada y da p %', q->>'p'; end if;
  q := cash_out_quote(b_gg); if (q->>'p')::numeric <> 1 then raise exception 'FALLO: con 2:1 ambos marcan ya esta ganada y da p %', q->>'p'; end if;
  q := cash_out_quote(b_u25); if (q->>'p')::numeric <> 0 then raise exception 'FALLO: con 2:1 Menos de 2,5 ya esta perdida y da p %', q->>'p'; end if;
  q := cash_out_quote(b_o35);
  v := (q->>'p')::numeric;
  if v <= 0.05 or v >= 0.95 then raise exception 'FALLO: con 2:1 en el 60 Más de 3,5 deberia estar entre medias y da %', v; end if;
  if abs((q->>'value')::int - least(round(100 * 3.10), greatest(1, round(100 * 3.10 * least(0.99, greatest(0.01, v)) * 0.90)))) > 1 then
    raise exception 'FALLO: valor en directo mal calculado: %', q; end if;
  update ex_live set data = '{"k":"f","min":60,"hs":0,"as":0,"per":2}', at = now() where match_id = 'zz:f1';
  q := cash_out_quote(b_o35); if (q->>'p')::numeric >= v then raise exception 'FALLO: con 0:0 Más de 3,5 deberia valer menos que con 2:1'; end if;
  update ex_live set data = '{"k":"f","min":89,"hs":0,"as":0,"per":2}', at = now() where match_id = 'zz:f1';
  q := cash_out_quote(b_ng); if (q->>'p')::numeric < 0.85 then raise exception 'FALLO: 0:0 en el 89 ambos marcan no deberia estar casi ganada y da %', q->>'p'; end if;
  update ex_live set data = '{"k":"f","min":100,"hs":1,"as":1,"per":3}', at = now() where match_id = 'zz:f1';
  q := cash_out_quote(b_o25); if (q->>'ok')::boolean then raise exception 'FALLO: cash out en la prorroga'; end if;
  resumen := resumen || 'Cash out en directo de goles con el marcador (ya ganada, ya perdida, entre medias, sin prorroga). ';

  -- ---------- pagar futbol: 90 minutos ----------
  -- zz:f1 acaba 2:1 en los 90: Más de 2,5 gana, Menos de 2,5 pierde, ambos marcan si gana, no pierde, Más de 1,5 gana, Más de 3,5 pierde
  execute saldo into s0 using jug[1];
  update matches set status = 'final', score = '2:1', winner = '1', details = '{"r90":"2:1"}' where id = 'zz:f1';
  perform settle_match('zz:f1');
  if (select status from bets where id = b_o25) <> 'won' or (select payout from bets where id = b_o25) <> 190 then raise exception 'FALLO: Más de 2,5 con 2:1 deberia cobrar 190'; end if;
  if (select status from bets where id = b_u25) <> 'lost' then raise exception 'FALLO: Menos de 2,5 con 2:1 deberia perder'; end if;
  if (select status from bets where id = b_gg) <> 'won' or (select payout from bets where id = b_gg) <> 360 then raise exception 'FALLO: ambos marcan si con 2:1 deberia cobrar 360 (cuota congelada 1,80)'; end if;
  if (select status from bets where id = b_ng) <> 'lost' then raise exception 'FALLO: ambos marcan no con 2:1 deberia perder'; end if;
  if (select status from bets where id = b_o15) <> 'won' or (select payout from bets where id = b_o15) <> 130 then raise exception 'FALLO: Más de 1,5 con 2:1 deberia cobrar 130'; end if;
  if (select status from bets where id = b_o35) <> 'lost' then raise exception 'FALLO: Más de 3,5 con 2:1 deberia perder'; end if;
  if (select status from bets where id = b_1) <> 'won' or (select payout from bets where id = b_1) <> 280 then raise exception 'FALLO: el 1 mejorado deberia cobrar 280'; end if;
  if (select status from bets where id = b_can) <> 'void' then raise exception 'FALLO: la cancelada ha cambiado'; end if;
  execute saldo into s1 using jug[1];
  if s1 - s0 <> 190 + 360 + 130 + 280 then raise exception 'FALLO: el saldo deberia subir % y sube %', 190 + 360 + 130 + 280, s1 - s0; end if;
  if (select count(*) from ledger where bet_id in (b_o25, b_gg, b_o15, b_1) and kind = 'premio') <> 4 then raise exception 'FALLO: premios en el monedero'; end if;
  resumen := resumen || 'Futbol 2:1: paga exacto cada mercado con la cuota congelada. ';

  -- zz:f2 acaba 2:1 tras prorroga, 1:1 en los 90: cuenta el 1:1 (Más de 2,5 pierde, Menos gana, ambos marcan si gana)
  r := place_bet('zz:f2', 'O2.5', 100); b_aet := (r->>'bet')::bigint;
  r := place_bet('zz:f2', 'U2.5', 100); b_aet2 := (r->>'bet')::bigint;
  r := place_bet('zz:f2', 'GG', 100); b_sin := (r->>'bet')::bigint;
  update matches set status = 'final', score = '2:1', winner = '1', details = '{"r90":"1:1"}' where id = 'zz:f2';
  perform settle_match('zz:f2');
  if (select status from bets where id = b_aet) <> 'lost' or (select status from bets where id = b_aet2) <> 'won' or (select status from bets where id = b_sin) <> 'won' then
    raise exception 'FALLO: con prorroga deberia contar el 1:1 de los 90 (% % %)', (select status from bets where id = b_aet), (select status from bets where id = b_aet2), (select status from bets where id = b_sin); end if;
  -- zz:f3 acaba sin el resultado de los 90 (no hay r90): se devuelve
  execute saldo into s0 using jug[1];
  r := place_bet('zz:f3', 'O2.5', 150); b_sin := (r->>'bet')::bigint;
  r := place_bet('zz:f3', '1', 50); b_v1 := (r->>'bet')::bigint;
  update matches set status = 'final', score = '3:3', winner = 'X', details = '{}' where id = 'zz:f3';
  perform settle_match('zz:f3');
  if (select status from bets where id = b_sin) <> 'void' or (select payout from bets where id = b_sin) <> 150 then raise exception 'FALLO: sin resultado de los 90 deberia devolverse'; end if;
  if (select status from bets where id = b_v1) <> 'lost' then raise exception 'FALLO: el 1X2 deberia pagarse normal (3:3 = X)'; end if;
  execute saldo into s1 using jug[1];
  if s1 <> s0 - 50 then raise exception 'FALLO: devolver deberia dejar el saldo en -50 (el 1 perdido) y va %', s1 - s0; end if;
  if not exists (select 1 from ledger where bet_id = b_sin and kind = 'devolucion' and note like 'Anulado: Más de 2,5 goles%') then raise exception 'FALLO: falta la devolucion en el monedero'; end if;
  resumen := resumen || 'Prorroga: cuenta el resultado de los 90; sin el, se devuelve. ';
  -- zz:f5 acaba 3:0: ambos marcan si pierde y no gana; Más de 2,5 gana; Menos de 3,5 gana
  insert into matches(id, sport, league, league_name, home, away, starts_at, status, odds_1, odds_x, odds_2, bo, details, odds_mk) values
    ('zz:f5', 'f', 'zz', 'Prueba', 'Cero A', 'Cero B', now() + interval '2 hours', 'scheduled', 1.50, 4.00, 6.00, null, '{}', '{"O2.5":1.70,"U3.5":1.40,"GG":2.20,"NG":1.65}');
  r := place_bet('zz:f5', 'GG', 100); b_aet := (r->>'bet')::bigint;
  r := place_bet('zz:f5', 'NG', 100); b_aet2 := (r->>'bet')::bigint;
  r := place_bet('zz:f5', 'O2.5', 100); b_sin := (r->>'bet')::bigint;
  r := place_bet('zz:f5', 'U3.5', 100); b_raro := (r->>'bet')::bigint;
  update matches set status = 'final', score = '3:0', winner = '1', details = '{"r90":"3:0"}' where id = 'zz:f5';
  perform settle_match('zz:f5');
  if (select status from bets where id = b_aet) <> 'lost' or (select status from bets where id = b_aet2) <> 'won' or (select payout from bets where id = b_aet2) <> 165
     or (select status from bets where id = b_sin) <> 'won' or (select status from bets where id = b_raro) <> 'won' then
    raise exception 'FALLO: con 3:0 (si % no % mas % menos de 3,5 %)', (select status from bets where id = b_aet), (select status from bets where id = b_aet2), (select status from bets where id = b_sin), (select status from bets where id = b_raro); end if;
  resumen := resumen || 'Con 3:0 ambos marcan no gana. ';

  -- ---------- series ----------
  r := place_bet('zz:v1', 'S2-1', 100); b_s21 := (r->>'bet')::bigint;
  r := place_bet('zz:v1', 'S2-0', 100); b_s20 := (r->>'bet')::bigint;
  r := place_bet('zz:v1', 'S1-2', 100); b_s12 := (r->>'bet')::bigint;
  r := place_bet('zz:v1', 'H2+1.5', 100); b_h2 := (r->>'bet')::bigint;
  r := place_bet('zz:v1', 'H1+1.5', 100); b_h1 := (r->>'bet')::bigint;
  r := place_bet('zz:v1', 'MO2.5', 100); b_mo := (r->>'bet')::bigint;
  r := place_bet('zz:v1', 'MU2.5', 100); b_mu := (r->>'bet')::bigint;
  r := place_bet('zz:v1', '1', 100); b_v1 := (r->>'bet')::bigint;
  if (r->>'odds')::numeric <> 1.60 then raise exception 'FALLO: el 1 de la serie'; end if;
  -- en directo: FaZe gana 1:0 en mapas; la suma de las probabilidades de los cuatro resultados exactos es 1
  update matches set status = 'live', starts_at = now() - interval '40 minutes' where id = 'zz:v1';
  insert into ex_live(match_id, data, at) values ('zz:v1', '{"k":"s","a":1,"b":0,"bo":3}', now());
  v := 0;
  for r in select cash_out_quote(id) x from bets where id in (b_s21, b_s20, b_s12) loop v := v + (r->>'p')::numeric; end loop;
  q := cash_out_quote(b_s20);
  if abs(v - 1) > 0.002 then raise exception 'FALLO: desde 1:0 los resultados 2:0, 2:1 y 1:2 deberian sumar 1 y suman %', v; end if;
  if (cash_out_quote(b_h1)->>'p')::numeric <> 1 then raise exception 'FALLO: FaZe +1,5 ya esta ganada desde 1:0'; end if;
  if abs((cash_out_quote(b_mo)->>'p')::numeric + (cash_out_quote(b_mu)->>'p')::numeric - 1) > 0.002 then raise exception 'FALLO: mas y menos mapas deberian sumar 1'; end if;
  if abs((cash_out_quote(b_mu)->>'p')::numeric - (q->>'p')::numeric) > 0.001 then raise exception 'FALLO: desde 1:0 menos de 2,5 mapas es lo mismo que 2:0'; end if;
  update ex_live set data = '{"k":"s","a":2,"b":0,"bo":3}', at = now() where match_id = 'zz:v1';
  if (cash_out_quote(b_s21)->>'ok')::boolean then raise exception 'FALLO: con la serie decidida no hay cash out'; end if;
  resumen := resumen || 'Cash out en directo de mapas coherente (los resultados suman 1). ';
  -- acaba FaZe 2:1
  execute saldo into s0 using jug[1];
  update matches set status = 'final', score = '2:1', winner = '1' where id = 'zz:v1';
  perform settle_match('zz:v1');
  if (select status from bets where id = b_s21) <> 'won' or (select payout from bets where id = b_s21) <> 370 then raise exception 'FALLO: FaZe 2:1 deberia cobrar 370'; end if;
  if (select status from bets where id = b_s20) <> 'lost' or (select status from bets where id = b_s12) <> 'lost' then raise exception 'FALLO: 2:0 y 1:2 deberian perder'; end if;
  if (select status from bets where id = b_h2) <> 'won' or (select payout from bets where id = b_h2) <> 175 then raise exception 'FALLO: FURIA +1,5 con 2:1 deberia cobrar 175'; end if;
  if (select status from bets where id = b_h1) <> 'won' or (select payout from bets where id = b_h1) <> 122 then raise exception 'FALLO: FaZe +1,5 con 2:1 deberia cobrar 122'; end if;
  if (select status from bets where id = b_mo) <> 'won' or (select status from bets where id = b_mu) <> 'lost' then raise exception 'FALLO: con 3 mapas mas de 2,5 gana y menos pierde'; end if;
  if (select status from bets where id = b_v1) <> 'won' or (select payout from bets where id = b_v1) <> 160 then raise exception 'FALLO: el 1 de la serie deberia cobrar 160'; end if;
  execute saldo into s1 using jug[1];
  if s1 - s0 <> 370 + 175 + 122 + 210 + 160 then raise exception 'FALLO: el saldo de la serie deberia subir % y sube %', 370 + 175 + 122 + 210 + 160, s1 - s0; end if;
  resumen := resumen || 'Serie 2:1: resultado exacto, handicap y mapas pagados exactos. ';
  -- una serie que acaba 0:2 (gana el visitante sin perder mapa): el local +1,5 pierde, el visitante +1,5 gana, menos de 2,5 gana
  insert into matches(id, sport, league, league_name, home, away, starts_at, status, odds_1, odds_x, odds_2, bo, details, odds_mk) values
    ('zz:v2', 'v', 'zz', 'Prueba', 'Sen', 'Prx', now() + interval '3 hours', 'scheduled', 1.80, null, 2.00, 3, '{"mt":"best_of"}',
     '{"S2-0":3.40,"S2-1":4.10,"S1-2":4.40,"S0-2":3.90,"H1+1.5":1.45,"H2+1.5":1.40,"MO2.5":2.30,"MU2.5":1.60}');
  r := place_bet('zz:v2', 'S0-2', 100); b_s20 := (r->>'bet')::bigint;
  r := place_bet('zz:v2', 'H1+1.5', 100); b_h1 := (r->>'bet')::bigint;
  r := place_bet('zz:v2', 'H2+1.5', 100); b_h2 := (r->>'bet')::bigint;
  r := place_bet('zz:v2', 'MU2.5', 100); b_mu := (r->>'bet')::bigint;
  r := place_bet('zz:v2', 'S2-0', 100); b_s21 := (r->>'bet')::bigint;
  if pick_name((select m from matches m where m.id = 'zz:v2'), 'S0-2') <> 'Prx 2:0' then raise exception 'FALLO: el nombre de 0:2 deberia ser Prx 2:0'; end if;
  update matches set status = 'final', score = '0:2', winner = '2' where id = 'zz:v2';
  perform settle_match('zz:v2');
  if (select status from bets where id = b_s20) <> 'won' or (select payout from bets where id = b_s20) <> 390 or (select status from bets where id = b_h1) <> 'lost'
     or (select status from bets where id = b_h2) <> 'won' or (select status from bets where id = b_mu) <> 'won' or (select status from bets where id = b_s21) <> 'lost' then
    raise exception 'FALLO: serie 0:2 (0:2 % · local +1,5 % · visitante +1,5 % · menos de 2,5 % · 2:0 %)', (select status from bets where id = b_s20), (select status from bets where id = b_h1),
      (select status from bets where id = b_h2), (select status from bets where id = b_mu), (select status from bets where id = b_s21); end if;
  resumen := resumen || 'Serie 0:2 bien. ';

  -- abandono: forfeit -> se devuelven los mercados de mapas, el ganador se paga
  r := place_bet('zz:c1', 'S2-0', 100); b_ff := (r->>'bet')::bigint;
  r := place_bet('zz:c1', '1', 100); b_ff1 := (r->>'bet')::bigint;
  update matches set status = 'final', score = '2:0', winner = '1', details = '{"mt":"best_of","ff":true}' where id = 'zz:c1';
  perform settle_match('zz:c1');
  if (select status from bets where id = b_ff) <> 'void' then raise exception 'FALLO: con forfeit los mapas deberian devolverse'; end if;
  if (select status from bets where id = b_ff1) <> 'won' then raise exception 'FALLO: con forfeit el ganador se paga'; end if;
  -- marcador que no cuadra (1:0 en un BO3) -> se devuelve
  r := place_bet('zz:c2', 'S2-0', 100); b_raro := (r->>'bet')::bigint;
  update matches set status = 'final', score = '1:0', winner = '1' where id = 'zz:c2';
  perform settle_match('zz:c2');
  if (select status from bets where id = b_raro) <> 'void' then raise exception 'FALLO: un 1:0 en un BO3 deberia devolverse'; end if;
  -- BO5: un 2:1 no encaja y no se puede apostar; 3:1 si
  fallo := false; begin perform place_bet('zz:c5', 'S2-1', 100); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja un 2:1 en una serie al mejor de 5'; end if;
  r := place_bet('zz:c5', 'S3-1', 100); b_bo5 := (r->>'bet')::bigint;
  r := place_bet('zz:c5', 'MO4.5', 100); b_raro := (r->>'bet')::bigint;
  update matches set status = 'final', score = '3:1', winner = '1' where id = 'zz:c5';
  perform settle_match('zz:c5');
  if (select status from bets where id = b_bo5) <> 'won' or (select payout from bets where id = b_bo5) <> 420 then raise exception 'FALLO: BO5 3:1 deberia cobrar 420'; end if;
  if (select status from bets where id = b_raro) <> 'lost' then raise exception 'FALLO: BO5 3:1 son 4 mapas: mas de 4,5 pierde'; end if;
  resumen := resumen || 'Forfeit y marcadores raros se devuelven; BO5 bien. ';

  -- ---------- combinadas ----------
  insert into matches(id, sport, league, league_name, home, away, starts_at, status, odds_1, odds_x, odds_2, bo, details, odds_mk) values
    ('zz:k1', 'f', 'zz', 'Prueba', 'K1 A', 'K1 B', now() + interval '2 hours', 'scheduled', 2.00, 3.40, 3.60, null, '{}', '{"O2.5":2.00,"U2.5":1.80,"GG":1.70,"NG":2.10}'),
    ('zz:k2', 'v', 'zz', 'Prueba', 'K2 A', 'K2 B', now() + interval '3 hours', 'scheduled', 1.60, null, 2.40, 3, '{"mt":"best_of"}', '{"S2-1":3.50,"H2+1.5":1.60}'),
    ('zz:k3', 'f', 'zz', 'Prueba', 'K3 A', 'K3 B', now() + interval '2 hours', 'scheduled', 2.00, 3.40, 3.60, null, '{}', '{"O2.5":2.00,"U2.5":1.80}');
  fallo := false; begin perform place_combo('[{"match":"zz:k1","pick":"1"},{"match":"zz:k1","pick":"O2.5"}]', 100); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja dos patas del mismo partido'; end if;
  fallo := false; begin perform place_combo('[{"match":"zz:k1","pick":"S2-1"},{"match":"zz:k2","pick":"S2-1"}]', 100); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja una pata de mapas en futbol'; end if;
  r := place_combo('[{"match":"zz:k1","pick":"O2.5"},{"match":"zz:k2","pick":"S2-1"}]', 100); c1 := (r->>'combo')::bigint;
  if (r->>'odds')::numeric <> 7.00 then raise exception 'FALLO: 2,00 por 3,50 deberia ser 7,00 y es %', r->>'odds'; end if;
  r := place_combo('[{"match":"zz:k1","pick":"GG"},{"match":"zz:k3","pick":"U2.5"}]', 100); c2 := (r->>'combo')::bigint;
  if (select string_agg(pick || '=' || odds, ',' order by match_id) from combo_legs where combo_id = c1) <> 'O2.5=2.00,S2-1=3.50' then
    raise exception 'FALLO: patas guardadas mal: %', (select string_agg(pick || '=' || odds, ',' order by match_id) from combo_legs where combo_id = c1); end if;
  -- cash out de combinada: uno empezado (k1 en directo 1:1 en el 70) y otro sin empezar con su cuota de ahora
  update matches set status = 'live', starts_at = now() - interval '70 minutes' where id = 'zz:k1';
  insert into ex_live(match_id, data, at) values ('zz:k1', '{"k":"f","min":70,"hs":1,"as":1,"per":2}', now());
  q := (select x from jsonb_array_elements(combo_cash_quotes()) x where (x->>'combo')::bigint = c1);
  if not (q->>'ok')::boolean then raise exception 'FALLO: cash out de combinada con mercados nuevos: %', q; end if;
  execute saldo into s0 using jug[1];
  update matches set status = 'final', score = '2:1', winner = '1', details = '{"r90":"2:1"}' where id = 'zz:k1';
  perform settle_match('zz:k1');
  if (select result from combo_legs where combo_id = c1 and match_id = 'zz:k1') <> 'won' then raise exception 'FALLO: pata Más de 2,5 con 2:1 deberia ganar'; end if;
  if (select result from combo_legs where combo_id = c2 and match_id = 'zz:k1') <> 'won' then raise exception 'FALLO: pata ambos marcan con 2:1 deberia ganar'; end if;
  if (select status from combos where id = c1) <> 'open' then raise exception 'FALLO: con una pata por jugar la combinada ya se ha cerrado'; end if;
  update matches set status = 'final', score = '2:1', winner = '1', details = '{"mt":"best_of"}' where id = 'zz:k2';
  perform settle_match('zz:k2');
  if (select status from combos where id = c1) <> 'won' or (select payout from combos where id = c1) <> 700 then raise exception 'FALLO: la combinada deberia cobrar 700 y queda % con %', (select status from combos where id = c1), (select payout from combos where id = c1); end if;
  update matches set status = 'final', score = '3:0', winner = '1', details = '{"r90":"3:0"}' where id = 'zz:k3';
  perform settle_match('zz:k3');
  if (select status from combos where id = c2) <> 'lost' then raise exception 'FALLO: Menos de 2,5 con 3:0 deberia hacer perder la combinada'; end if;
  execute saldo into s1 using jug[1];
  if s1 - s0 <> 700 then raise exception 'FALLO: el saldo de las combinadas deberia subir 700 y sube %', s1 - s0; end if;
  resumen := resumen || 'Combinadas con mercados nuevos: una pata por partido, cuota producto, cash out y pago exacto. ';

  -- ---------- el sincronizador ----------
  perform sync_push(sec, jsonb_build_array(jsonb_build_object('id', 'zz:s1', 'sport', 'f', 'league', 'zz', 'league_name', 'Prueba', 'home', 'S A', 'away', 'S B',
    'starts_at', now() + interval '1 day', 'status', 'scheduled', 'odds_1', 2.0, 'odds_x', 3.3, 'odds_2', 3.6, 'details', '{}'::jsonb,
    'odds_mk', '{"O2.5":1.917,"U2.5":2.1,"GG":1.8,"S2-0":9,"1":5,"ZZ":2,"NG":0.5,"O9.5":"x"}'::jsonb)));
  if (select odds_mk from matches where id = 'zz:s1') <> '{"O2.5":1.92,"U2.5":2.10,"GG":1.80,"S2-0":9.00}'::jsonb then
    raise exception 'FALLO: el sincronizador guarda %', (select odds_mk from matches where id = 'zz:s1'); end if;
  if mk_cuota((select m from matches m where m.id = 'zz:s1'), 'S2-0') is not null then raise exception 'FALLO: un 2:0 en futbol tiene cuota'; end if;
  -- un sincronizador de antes (sin odds_mk) no borra lo que hay; empezado, no se cambia
  perform sync_push(sec, jsonb_build_array(jsonb_build_object('id', 'zz:s1', 'sport', 'f', 'league', 'zz', 'league_name', 'Prueba', 'home', 'S A', 'away', 'S B',
    'starts_at', now() + interval '1 day', 'status', 'scheduled', 'odds_1', 2.0, 'odds_x', 3.3, 'odds_2', 3.6, 'details', '{}'::jsonb)));
  if (select odds_mk ->> 'O2.5' from matches where id = 'zz:s1') <> '1.92' then raise exception 'FALLO: sin odds_mk el sincronizador borra las cuotas'; end if;
  perform sync_push(sec, jsonb_build_array(jsonb_build_object('id', 'zz:s1', 'sport', 'f', 'league', 'zz', 'league_name', 'Prueba', 'home', 'S A', 'away', 'S B',
    'starts_at', now() - interval '5 minutes', 'status', 'live', 'odds_1', 2.0, 'odds_x', 3.3, 'odds_2', 3.6, 'details', '{}'::jsonb, 'odds_mk', '{"O2.5":3.0}'::jsonb)));
  if (select odds_mk ->> 'O2.5' from matches where id = 'zz:s1') <> '1.92' then raise exception 'FALLO: con el partido empezado cambia la cuota'; end if;
  perform sync_push(sec, jsonb_build_array(jsonb_build_object('id', 'zz:s2', 'sport', 'f', 'league', 'zz', 'league_name', 'Prueba', 'home', 'S A', 'away', 'S B',
    'starts_at', now() + interval '1 day', 'status', 'scheduled', 'odds_1', 2.0, 'odds_x', 3.3, 'odds_2', 3.6, 'details', '{}'::jsonb, 'odds_mk', '{"O2.5":1.9}'::jsonb)));
  perform sync_push(sec, jsonb_build_array(jsonb_build_object('id', 'zz:s2', 'sport', 'f', 'league', 'zz', 'league_name', 'Prueba', 'home', 'S A', 'away', 'S B',
    'starts_at', now() + interval '1 day', 'status', 'scheduled', 'odds_1', 2.0, 'odds_x', 3.3, 'odds_2', 3.6, 'details', '{}'::jsonb, 'odds_mk', '{}'::jsonb)));
  if (select odds_mk from matches where id = 'zz:s2') <> '{}'::jsonb then raise exception 'FALLO: un mercado retirado sigue con cuota'; end if;
  resumen := resumen || 'Sincronizador: limpia, guarda antes de empezar, no borra si no lo manda y retira lo que ya no tiene cuota. ';

  -- ---------- lo interno, cerrado ----------
  if has_function_privilege('authenticated', 'mk_resultado(matches, text)', 'execute') or has_function_privilege('anon', 'mk_limpia(jsonb)', 'execute') then
    raise exception 'FALLO: las funciones internas se pueden llamar desde fuera'; end if;
  if not has_function_privilege('authenticated', 'place_bet(text, text, int)', 'execute') then raise exception 'FALLO: place_bet ha perdido el permiso'; end if;

  raise exception 'PRUEBA SUPERADA (se deshace todo): %', resumen;
end $$;
