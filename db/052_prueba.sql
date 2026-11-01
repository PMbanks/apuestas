-- Prueba de db/052_f1.sql, para el editor SQL de Supabase. Va DESPUES de 052.
-- Grandes Premios de mentira: nombres, codigos, lo que no se puede, apostar con la cuota congelada, el pago exacto de cada mercado
-- (ganador, podio, top 10, vuelta rapida, abandona, pole, sprint, campeonatos, duelos), descalificado, piloto que no sale, vuelta
-- rapida que falta, carrera cancelada, combinadas (una pata por Gran Premio), cash out, el sincronizador, los permisos y que lo de
-- 036, 037 y 039 sigue igual. Al final lanza un error A PROPOSITO para que se deshaga todo.
-- Si todo va bien, el error dice "PRUEBA SUPERADA" con el resumen.
do $$
declare
  jug uuid[] := array(select id from players order by created_at, id);
  r jsonb; q jsonb; s0 int; s1 int; fallo boolean; resumen text := ''; c1 bigint; c2 bigint;
  b1 bigint; b2 bigint; b3 bigint; b4 bigint; b5 bigint; b6 bigint; b7 bigint; b8 bigint; b9 bigint; b10 bigint; b11 bigint; b12 bigint;
  saldo constant text := 'select coalesce(sum(amount), 0)::int from ledger where player = $1';
  mm matches;
  sec text := (select value #>> '{}' from settings where key = 'sync_secret');
  nombres constant jsonb := '{"max_verstappen":"Max Verstappen","lando_norris":"Lando Norris","oscar_piastri":"Oscar Piastri","charles_leclerc":"Charles Leclerc","lewis_hamilton":"Lewis Hamilton","george_russell":"George Russell","kimi_antonelli":"Kimi Antonelli","fernando_alonso":"Fernando Alonso"}';
  eqs constant jsonb := '{"mercedes":"Mercedes","red_bull":"Red Bull","mclaren":"McLaren","ferrari":"Ferrari"}';
begin
  insert into ledger(player, amount, kind, note) select id, 100000, 'ajuste', 'saldo de prueba' from players;
  insert into matches(id, sport, league, league_name, home, away, starts_at, status, odds_1, odds_x, odds_2, bo, details, odds_mk) values
    -- la carrera del Gran Premio de Prueba (ronda 1 de 2099)
    ('zz:f1r', 'r', 'f1', 'Fórmula 1', 'Gran Premio de Prueba', 'Carrera', now() + interval '3 hours', 'scheduled', null, null, null, null,
     jsonb_build_object('kind', 'race', 'gp', '2099-1', 'dr', nombres, 'eq', eqs),
     '{"FW:lando_norris":3.00,"FW:max_verstappen":4.00,"FP:max_verstappen":1.80,"FP:charles_leclerc":2.00,"FT:lewis_hamilton":1.50,"FT:george_russell":1.40,"FT:fernando_alonso":1.60,"FL:max_verstappen":5.00,"FL:lando_norris":4.00,"FX:kimi_antonelli":8.00,"FX:lando_norris":15.00,"FX:fernando_alonso":9.00,"FQ:lando_norris":2.00,"FS:lando_norris":2.00,"FC:lando_norris":2.00}'),
    ('zz:f1q', 'r', 'f1', 'Fórmula 1', 'Gran Premio de Prueba', 'Clasificación', now() + interval '2 hours', 'scheduled', null, null, null, null,
     jsonb_build_object('kind', 'quali', 'gp', '2099-1', 'dr', nombres, 'eq', eqs),
     '{"FQ:lando_norris":2.50,"FQ:max_verstappen":3.50,"FQ:oscar_piastri":6.00,"FW:lando_norris":3.00}'),
    ('zz:f1s', 'r', 'f1', 'Fórmula 1', 'Gran Premio de Prueba', 'Sprint', now() + interval '2 hours', 'scheduled', null, null, null, null,
     jsonb_build_object('kind', 'sprint', 'gp', '2099-1', 'dr', nombres, 'eq', eqs),
     '{"FS:lando_norris":2.20,"FS:max_verstappen":3.00,"FS:charles_leclerc":7.00}'),
    -- un duelo entre companeros: partido normal con 1 y 2
    ('zz:f1d', 'r', 'f1', 'Fórmula 1', 'Lando Norris', 'Oscar Piastri', now() + interval '3 hours', 'scheduled', 1.80, null, 2.10, null,
     jsonb_build_object('kind', 'duel', 'gp', '2099-1', 'dr', nombres), null),
    ('zz:f1w', 'r', 'f1', 'Fórmula 1', 'Campeonato de pilotos 2099', 'Fórmula 1', now() + interval '40 days', 'scheduled', null, null, null, null,
     jsonb_build_object('kind', 'wdc', 'gp', 'C2099', 'dr', nombres, 'eq', eqs), '{"FC:lando_norris":2.40,"FC:max_verstappen":3.10,"FC:oscar_piastri":5.00}'),
    ('zz:f1k', 'r', 'f1', 'Fórmula 1', 'Campeonato de constructores 2099', 'Fórmula 1', now() + interval '40 days', 'scheduled', null, null, null, null,
     jsonb_build_object('kind', 'wcc', 'gp', 'C2099', 'dr', nombres, 'eq', eqs), '{"FK:mclaren":1.60,"FK:red_bull":3.50,"FK:mercedes":6.00}'),
    -- otro Gran Premio (ronda 2) para combinar
    ('zz:f2q', 'r', 'f1', 'Fórmula 1', 'Segundo Gran Premio de Prueba', 'Clasificación', now() + interval '2 days', 'scheduled', null, null, null, null,
     jsonb_build_object('kind', 'quali', 'gp', '2099-2', 'dr', nombres, 'eq', eqs), '{"FQ:lando_norris":2.00,"FQ:max_verstappen":3.00}'),
    ('zz:f1x', 'r', 'f1', 'Fórmula 1', 'Gran Premio Cancelado', 'Carrera', now() + interval '3 hours', 'scheduled', null, null, null, null,
     jsonb_build_object('kind', 'race', 'gp', '2099-3', 'dr', nombres, 'eq', eqs), '{"FW:lando_norris":3.00,"FP:lando_norris":1.50}'),
    ('zz:f1n', 'r', 'f1', 'Fórmula 1', 'Gran Premio Sin Vuelta', 'Carrera', now() + interval '3 hours', 'scheduled', null, null, null, null,
     jsonb_build_object('kind', 'race', 'gp', '2099-4', 'dr', nombres, 'eq', eqs), '{"FL:max_verstappen":5.00,"FW:max_verstappen":2.00}'),
    ('zz:f1e', 'r', 'f1', 'Fórmula 1', 'Gran Premio Empezado', 'Carrera', now() - interval '10 minutes', 'live', null, null, null, null,
     jsonb_build_object('kind', 'race', 'gp', '2099-5', 'dr', nombres, 'eq', eqs), '{"FW:lando_norris":3.00}'),
    ('zz:f1f', 'f', 'zz', 'Prueba', 'Local', 'Visita', now() + interval '2 hours', 'scheduled', 2.00, 3.40, 3.60, null, '{}', '{"O2.5":2.00,"U2.5":1.80}');
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  execute saldo into s0 using jug[1];

  -- ---------- el deporte, los nombres, los codigos y de que equipo es ----------
  fallo := false; begin insert into matches(id, sport, league, league_name, home, away, starts_at, status) values ('zz:x', 'z', 'zz', 'Prueba', 'a', 'b', now(), 'scheduled'); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: la tabla admite un deporte z'; end if;
  select * into mm from matches where id = 'zz:f1r';
  if pick_name(mm, 'FW:lando_norris') <> 'Lando Norris: gana la carrera' or pick_name(mm, 'FP:max_verstappen') <> 'Max Verstappen: sube al podio'
     or pick_name(mm, 'FT:lewis_hamilton') <> 'Lewis Hamilton: entre los 10 primeros' or pick_name(mm, 'FL:max_verstappen') <> 'Max Verstappen: vuelta rápida'
     or pick_name(mm, 'FX:kimi_antonelli') <> 'Kimi Antonelli: abandona' or pick_name(mm, 'FW:desconocido_x') <> 'Piloto: gana la carrera' then
    raise exception 'FALLO: nombres de la F1 (carrera): % / % / % / %', pick_name(mm, 'FW:lando_norris'), pick_name(mm, 'FP:max_verstappen'), pick_name(mm, 'FT:lewis_hamilton'), pick_name(mm, 'FW:desconocido_x'); end if;
  if pick_name((select m from matches m where m.id = 'zz:f1q'), 'FQ:oscar_piastri') <> 'Oscar Piastri: pole position'
     or pick_name((select m from matches m where m.id = 'zz:f1s'), 'FS:charles_leclerc') <> 'Charles Leclerc: gana el sprint'
     or pick_name((select m from matches m where m.id = 'zz:f1w'), 'FC:max_verstappen') <> 'Max Verstappen: campeón de pilotos'
     or pick_name((select m from matches m where m.id = 'zz:f1k'), 'FK:red_bull') <> 'Red Bull: campeón de constructores'
     or pick_name((select m from matches m where m.id = 'zz:f1d'), '1') <> 'Lando Norris' or pick_name((select m from matches m where m.id = 'zz:f1d'), '2') <> 'Oscar Piastri' then
    raise exception 'FALLO: nombres de la F1 (pole, sprint, campeonatos, duelo)'; end if;
  if mk_lado('FW:lando_norris') is not null or mk_lado('FK:red_bull') is not null or mk_lado('1') is distinct from '1' then raise exception 'FALLO: el lado de una apuesta de F1'; end if;
  if not mk_valido('FW:max_verstappen') or not mk_valido('FK:red_bull') or not mk_valido('FX:kimi_antonelli') or not mk_valido('FQ:ab') or not mk_valido('FS:driver_33')
     or mk_valido('FZ:max_verstappen') or mk_valido('FW:') or mk_valido('FW:a') or mk_valido('FW:Max') or mk_valido('FW:max-verstappen') or mk_valido('fw:max_verstappen')
     or mk_valido('FW:max verstappen') or mk_valido('FW:' || repeat('a', 41)) then
    raise exception 'FALLO: los codigos validos de la F1'; end if;
  -- lo de 036, 037 y 039 sigue igual
  if pick_name((select m from matches m where m.id = 'zz:f1f'), 'O2.5') <> 'Más de 2,5 goles' or not mk_valido('W5-2') or not mk_valido('GG') or not mk_valido('SP1-6.5') or not mk_valido('J1:100:PO20.5')
     or pick_name((select m from matches m where m.id = 'zz:f1f'), '1') <> 'Local' then
    raise exception 'FALLO: lo de 036, 037 y 039 ha cambiado'; end if;
  resumen := resumen || 'Deporte r, nombres (Lando Norris: gana la carrera, pole, sprint, campeonatos, duelo), codigos y lado bien; 036, 037 y 039 igual. ';

  -- ---------- que codigo vale en que sesion ----------
  if not mk_encaja((select m from matches m where m.id = 'zz:f1r'), 'FW:lando_norris') or not mk_encaja((select m from matches m where m.id = 'zz:f1q'), 'FQ:max_verstappen')
     or not mk_encaja((select m from matches m where m.id = 'zz:f1s'), 'FS:max_verstappen') or not mk_encaja((select m from matches m where m.id = 'zz:f1w'), 'FC:lando_norris')
     or not mk_encaja((select m from matches m where m.id = 'zz:f1k'), 'FK:mclaren') or not mk_encaja((select m from matches m where m.id = 'zz:f1d'), '1') then
    raise exception 'FALLO: un codigo de F1 no encaja en su sesion'; end if;
  if mk_encaja((select m from matches m where m.id = 'zz:f1q'), 'FW:lando_norris') or mk_encaja((select m from matches m where m.id = 'zz:f1r'), 'FQ:lando_norris')
     or mk_encaja((select m from matches m where m.id = 'zz:f1r'), 'FS:lando_norris') or mk_encaja((select m from matches m where m.id = 'zz:f1r'), 'FC:lando_norris')
     or mk_encaja((select m from matches m where m.id = 'zz:f1w'), 'FK:mclaren') or mk_encaja((select m from matches m where m.id = 'zz:f1k'), 'FC:lando_norris')
     or mk_encaja((select m from matches m where m.id = 'zz:f1r'), 'FW:otro_piloto') or mk_encaja((select m from matches m where m.id = 'zz:f1k'), 'FK:lando_norris')
     or mk_encaja((select m from matches m where m.id = 'zz:f1d'), 'FW:lando_norris') or mk_encaja((select m from matches m where m.id = 'zz:f1f'), 'FW:lando_norris')
     or mk_encaja((select m from matches m where m.id = 'zz:f1r'), 'O2.5') or mk_encaja((select m from matches m where m.id = 'zz:f1r'), 'SP1-6.5') then
    raise exception 'FALLO: un codigo de F1 vale donde no debe'; end if;

  -- ---------- lo que no se puede ----------
  fallo := false; begin perform place_bet('zz:f1r', '1', 100); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja un 1 en una carrera (no hay lados)'; end if;
  fallo := false; begin perform place_bet('zz:f1r', 'FQ:lando_norris', 100); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja la pole en la carrera'; end if;
  fallo := false; begin perform place_bet('zz:f1q', 'FW:lando_norris', 100); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja el ganador de carrera en la clasificacion'; end if;
  fallo := false; begin perform place_bet('zz:f1r', 'FW:oscar_piastri', 100); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja un piloto sin cuota'; end if;
  fallo := false; begin perform place_bet('zz:f1e', 'FW:lando_norris', 100); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja apostar a una carrera empezada'; end if;
  fallo := false; begin perform place_bet('zz:f1f', 'FW:lando_norris', 100); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja un codigo de F1 en futbol'; end if;
  fallo := false; begin insert into bets(player, match_id, pick, stake, odds) values (jug[1], 'zz:f1r', 'FZ:lando_norris', 10, 2); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: la tabla admite FZ'; end if;
  fallo := false; begin insert into bets(player, match_id, pick, stake, odds) values (jug[1], 'zz:f1r', 'FW:Lando', 10, 2); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: la tabla admite un id con mayusculas'; end if;
  execute saldo into s1 using jug[1];
  if s1 <> s0 then raise exception 'FALLO: lo rechazado ha movido dinero (%)', s1 - s0; end if;
  resumen := resumen || 'Rechaza el 1 en una carrera, la pole en la carrera, el ganador en la clasificacion, pilotos sin cuota, carrera empezada, F1 en futbol, codigos raros. ';

  -- ---------- apostar: cobra y congela la cuota ----------
  r := place_bet('zz:f1r', 'FW:lando_norris', 100); b1 := (r->>'bet')::bigint;
  if (r->>'odds')::numeric <> 3.00 then raise exception 'FALLO: la cuota del ganador deberia ser 3,00 y es %', r->>'odds'; end if;
  b2 := (place_bet('zz:f1r', 'FW:max_verstappen', 100)->>'bet')::bigint;
  b3 := (place_bet('zz:f1r', 'FP:max_verstappen', 100)->>'bet')::bigint;
  b4 := (place_bet('zz:f1r', 'FP:charles_leclerc', 100)->>'bet')::bigint;
  b5 := (place_bet('zz:f1r', 'FT:lewis_hamilton', 100)->>'bet')::bigint;
  b6 := (place_bet('zz:f1r', 'FT:george_russell', 100)->>'bet')::bigint;
  b7 := (place_bet('zz:f1r', 'FT:fernando_alonso', 100)->>'bet')::bigint;
  b8 := (place_bet('zz:f1r', 'FL:max_verstappen', 100)->>'bet')::bigint;
  b9 := (place_bet('zz:f1r', 'FL:lando_norris', 100)->>'bet')::bigint;
  b10 := (place_bet('zz:f1r', 'FX:kimi_antonelli', 100)->>'bet')::bigint;
  b11 := (place_bet('zz:f1r', 'FX:lando_norris', 100)->>'bet')::bigint;
  b12 := (place_bet('zz:f1r', 'FX:fernando_alonso', 100)->>'bet')::bigint;
  execute saldo into s1 using jug[1];
  if s1 <> s0 - 1200 then raise exception 'FALLO: deberia haber cobrado 1.200 y ha cobrado %', s0 - s1; end if;
  if (select note from ledger where bet_id = b1 and kind = 'apuesta') <> 'Lando Norris: gana la carrera 3,00' then
    raise exception 'FALLO: nota del monedero: %', (select note from ledger where bet_id = b1 and kind = 'apuesta'); end if;
  update matches set odds_mk = odds_mk || '{"FW:lando_norris":1.50}' where id = 'zz:f1r';
  if (select odds from bets where id = b1) <> 3.00 then raise exception 'FALLO: la cuota no se ha congelado'; end if;
  resumen := resumen || 'Cobra y congela la cuota (ganador, podio, top 10, vuelta rapida, abandona). ';

  -- cash out antes de empezar: con la cuota de ahora del mismo mercado (3,00 / 1,50 * 0,95 = 190)
  q := ex_cash_value((select b from bets b where b.id = b1), (select m from matches m where m.id = 'zz:f1r'));
  if not coalesce((q->>'ok')::boolean, false) or q->>'mode' <> 'pre' or (q->>'value')::int <> 190 then raise exception 'FALLO: cash out antes de empezar: %', q; end if;
  update matches set odds_mk = odds_mk || '{"FW:lando_norris":3.00}' where id = 'zz:f1r';
  -- en directo, ninguno
  insert into bets(player, match_id, pick, stake, odds) values (jug[2], 'zz:f1e', 'FW:lando_norris', 100, 3);
  q := ex_cash_value((select b from bets b where b.match_id = 'zz:f1e' limit 1), (select m from matches m where m.id = 'zz:f1e'));
  if coalesce((q->>'ok')::boolean, true) then raise exception 'FALLO: hay cash out en directo en la F1: %', q; end if;
  if ex_live_odds((select m from matches m where m.id = 'zz:f1e'), 'FW:lando_norris') is not null then raise exception 'FALLO: hay cuota en directo en la F1'; end if;
  delete from bets where match_id = 'zz:f1e';
  resumen := resumen || 'Cash out antes de empezar con la cuota de ahora; en directo, ninguno. ';

  -- ---------- el pago exacto de la carrera ----------
  -- Norris gana, Piastri 2o, Verstappen 3o, Leclerc 4o, Hamilton 5o, Russell 6o descalificado, Antonelli abandona, Alonso no sale
  update matches set status = 'final', winner = '1', score = 'Norris',
    details = details || '{"res":{"o":["lando_norris","oscar_piastri","max_verstappen","charles_leclerc","lewis_hamilton","george_russell","kimi_antonelli","fernando_alonso"],
      "st":{"lando_norris":"F","oscar_piastri":"F","max_verstappen":"L","charles_leclerc":"F","lewis_hamilton":"F","george_russell":"D","kimi_antonelli":"R","fernando_alonso":"S"},"fl":"max_verstappen"}}'::jsonb
    where id = 'zz:f1r';
  if (select count(*) from matches where id = 'zz:f1r' and starts_at > now()) = 1 then update matches set starts_at = now() - interval '2 hours' where id = 'zz:f1r'; end if;
  perform settle_match('zz:f1r');
  if (select status from bets where id = b1) <> 'won' or (select payout from bets where id = b1) <> 300 then raise exception 'FALLO: el ganador deberia cobrar 300'; end if;
  if (select status from bets where id = b2) <> 'lost' then raise exception 'FALLO: Verstappen no ganaba'; end if;
  if (select status from bets where id = b3) <> 'won' or (select payout from bets where id = b3) <> 180 then raise exception 'FALLO: Verstappen 3o es podio y cobra 180'; end if;
  if (select status from bets where id = b4) <> 'lost' then raise exception 'FALLO: Leclerc 4o no es podio'; end if;
  if (select status from bets where id = b5) <> 'won' or (select payout from bets where id = b5) <> 150 then raise exception 'FALLO: Hamilton 5o esta en el top 10 y cobra 150'; end if;
  if (select status from bets where id = b6) <> 'lost' then raise exception 'FALLO: Russell descalificado pierde el top 10'; end if;
  if (select status from bets where id = b7) <> 'void' or (select payout from bets where id = b7) <> 100 then raise exception 'FALLO: Alonso no sale: se devuelve'; end if;
  if (select status from bets where id = b8) <> 'won' or (select payout from bets where id = b8) <> 500 then raise exception 'FALLO: vuelta rapida de Verstappen cobra 500'; end if;
  if (select status from bets where id = b9) <> 'lost' then raise exception 'FALLO: vuelta rapida de Norris no'; end if;
  if (select status from bets where id = b10) <> 'won' or (select payout from bets where id = b10) <> 800 then raise exception 'FALLO: Antonelli abandona: cobra 800'; end if;
  if (select status from bets where id = b11) <> 'lost' then raise exception 'FALLO: Norris acaba: pierde el abandono'; end if;
  if (select status from bets where id = b12) <> 'void' then raise exception 'FALLO: Alonso no sale: se devuelve el abandono'; end if;
  execute saldo into s1 using jug[1];
  if s1 - s0 <> 930 then raise exception 'FALLO: la carrera deberia dejar +930 y deja %', s1 - s0; end if;
  if not (select settled from matches where id = 'zz:f1r') then raise exception 'FALLO: la carrera no queda pagada'; end if;
  if not exists (select 1 from chat where body like '%Gran Premio de Prueba · Carrera · Norris%') then raise exception 'FALLO: el chat no nombra la carrera'; end if;
  if exists (select 1 from chat where body like '%Prueba · Carrera vs%' or body like '%Gran Premio de Prueba vs Carrera%') then raise exception 'FALLO: el chat dice vs en una carrera'; end if;
  resumen := resumen || 'Paga la carrera exacta: ganador, podio, top 10, vuelta rapida, abandono; descalificado pierde; piloto que no sale se devuelve (+930). ';

  -- ---------- vuelta rapida que falta, carrera cancelada ----------
  b1 := (place_bet('zz:f1n', 'FL:max_verstappen', 100)->>'bet')::bigint;
  b2 := (place_bet('zz:f1n', 'FW:max_verstappen', 100)->>'bet')::bigint;
  update matches set status = 'final', winner = '1', score = 'Verstappen', starts_at = now() - interval '2 hours',
    details = details || '{"res":{"o":["max_verstappen","lando_norris"],"st":{"max_verstappen":"F","lando_norris":"F"},"fl":null}}'::jsonb where id = 'zz:f1n';
  perform settle_match('zz:f1n');
  if (select status from bets where id = b1) <> 'void' then raise exception 'FALLO: sin vuelta rapida oficial se devuelve'; end if;
  if (select status from bets where id = b2) <> 'won' then raise exception 'FALLO: el ganador con la vuelta rapida sin dato cobra'; end if;
  b1 := (place_bet('zz:f1x', 'FW:lando_norris', 100)->>'bet')::bigint;
  b2 := (place_bet('zz:f1x', 'FP:lando_norris', 100)->>'bet')::bigint;
  execute saldo into s0 using jug[1];
  update matches set status = 'canceled', starts_at = now() - interval '2 hours' where id = 'zz:f1x';
  perform settle_match('zz:f1x');
  execute saldo into s1 using jug[1];
  if (select status from bets where id = b1) <> 'void' or (select status from bets where id = b2) <> 'void' or s1 - s0 <> 200 then raise exception 'FALLO: una carrera cancelada devuelve todo (%)', s1 - s0; end if;
  resumen := resumen || 'Sin vuelta rapida oficial se devuelve; carrera cancelada devuelve todo. ';

  -- ---------- clasificacion, sprint, campeonatos ----------
  b1 := (place_bet('zz:f1q', 'FQ:lando_norris', 100)->>'bet')::bigint;
  b2 := (place_bet('zz:f1q', 'FQ:max_verstappen', 100)->>'bet')::bigint;
  b3 := (place_bet('zz:f1s', 'FS:lando_norris', 100)->>'bet')::bigint;
  b4 := (place_bet('zz:f1s', 'FS:max_verstappen', 100)->>'bet')::bigint;
  update matches set status = 'final', winner = '1', score = 'Verstappen', starts_at = now() - interval '2 hours',
    details = details || '{"res":{"o":["max_verstappen","lando_norris","oscar_piastri"]}}'::jsonb where id = 'zz:f1q';
  update matches set status = 'final', winner = '1', score = 'Norris', starts_at = now() - interval '2 hours',
    details = details || '{"res":{"o":["lando_norris","max_verstappen"],"st":{"lando_norris":"F","max_verstappen":"F"}}}'::jsonb where id = 'zz:f1s';
  perform settle_match('zz:f1q'); perform settle_match('zz:f1s');
  if (select status from bets where id = b1) <> 'lost' or (select status from bets where id = b2) <> 'won' or (select payout from bets where id = b2) <> 350 then raise exception 'FALLO: la pole'; end if;
  if (select status from bets where id = b3) <> 'won' or (select payout from bets where id = b3) <> 220 or (select status from bets where id = b4) <> 'lost' then raise exception 'FALLO: el sprint'; end if;
  b1 := (place_bet('zz:f1w', 'FC:lando_norris', 100)->>'bet')::bigint;
  b2 := (place_bet('zz:f1w', 'FC:max_verstappen', 100)->>'bet')::bigint;
  b3 := (place_bet('zz:f1k', 'FK:mclaren', 100)->>'bet')::bigint;
  b4 := (place_bet('zz:f1k', 'FK:red_bull', 100)->>'bet')::bigint;
  update matches set status = 'final', winner = '1', score = 'Norris', starts_at = now() - interval '2 hours',
    details = details || '{"res":{"o":["lando_norris","max_verstappen","oscar_piastri"]}}'::jsonb where id = 'zz:f1w';
  update matches set status = 'final', winner = '1', score = 'McLaren', starts_at = now() - interval '2 hours',
    details = details || '{"res":{"o":["mclaren","red_bull","ferrari"]}}'::jsonb where id = 'zz:f1k';
  perform settle_match('zz:f1w'); perform settle_match('zz:f1k');
  if (select status from bets where id = b1) <> 'won' or (select payout from bets where id = b1) <> 240 or (select status from bets where id = b2) <> 'lost' then raise exception 'FALLO: el campeon de pilotos'; end if;
  if (select status from bets where id = b3) <> 'won' or (select payout from bets where id = b3) <> 160 or (select status from bets where id = b4) <> 'lost' then raise exception 'FALLO: el campeon de constructores'; end if;
  resumen := resumen || 'Paga la pole, el sprint y los dos campeonatos. ';

  -- ---------- el duelo y el reto: partido normal 1 / 2 ----------
  b1 := (place_bet('zz:f1d', '1', 100)->>'bet')::bigint;
  b2 := (place_bet('zz:f1d', '2', 100)->>'bet')::bigint;
  if (select odds from bets where id = b1) <> 1.80 or (select odds from bets where id = b2) <> 2.10 then raise exception 'FALLO: cuotas del duelo'; end if;
  update matches set status = 'final', winner = '2', score = '3:2', starts_at = now() - interval '2 hours' where id = 'zz:f1d';
  perform settle_match('zz:f1d');
  if (select status from bets where id = b1) <> 'lost' or (select status from bets where id = b2) <> 'won' or (select payout from bets where id = b2) <> 210 then raise exception 'FALLO: el pago del duelo'; end if;
  resumen := resumen || 'Duelo entre companeros como partido normal 1 / 2 (cuotas congeladas y pago por el que termina delante). ';

  -- ---------- combinadas: una pata por Gran Premio ----------
  update matches set status = 'scheduled', starts_at = now() + interval '3 hours', settled = false, winner = null, score = null, details = details - 'res' where id in ('zz:f1x');
  update matches set status = 'scheduled', starts_at = now() + interval '40 days', settled = false, winner = null, score = null, details = details - 'res' where id in ('zz:f1w', 'zz:f1k');
  update matches set status = 'scheduled', starts_at = now() + interval '2 hours', settled = false, winner = null, score = null, details = details - 'res' where id in ('zz:f1q', 'zz:f1s');
  update matches set status = 'scheduled', starts_at = now() + interval '3 hours', settled = false, winner = null, score = null, details = details - 'res' where id in ('zz:f1d', 'zz:f1r');
  update matches set odds_mk = odds_mk || '{"FW:lando_norris":3.00}' where id = 'zz:f1r';
  fallo := false; begin perform place_combo('[{"match":"zz:f1r","pick":"FW:lando_norris"},{"match":"zz:f1q","pick":"FQ:lando_norris"}]'::jsonb, 100); exception when others then fallo := sqlerrm like '%mismo Gran Premio%'; end;
  if not fallo then raise exception 'FALLO: deja la carrera y la clasificacion del mismo Gran Premio en una combinada'; end if;
  fallo := false; begin perform place_combo('[{"match":"zz:f1r","pick":"FW:lando_norris"},{"match":"zz:f1d","pick":"1"}]'::jsonb, 100); exception when others then fallo := sqlerrm like '%mismo Gran Premio%'; end;
  if not fallo then raise exception 'FALLO: deja la carrera y un duelo del mismo Gran Premio en una combinada'; end if;
  fallo := false; begin perform place_combo('[{"match":"zz:f1w","pick":"FC:lando_norris"},{"match":"zz:f1k","pick":"FK:mclaren"}]'::jsonb, 100); exception when others then fallo := sqlerrm like '%mismo Gran Premio%'; end;
  if not fallo then raise exception 'FALLO: deja los dos campeonatos en una combinada'; end if;
  fallo := false; begin perform place_combo('[{"match":"zz:f1r","pick":"FQ:lando_norris"},{"match":"zz:f2q","pick":"FQ:lando_norris"}]'::jsonb, 100); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja una pole en la carrera dentro de una combinada'; end if;
  execute saldo into s0 using jug[1];
  r := place_combo('[{"match":"zz:f1r","pick":"FW:lando_norris"},{"match":"zz:f2q","pick":"FQ:lando_norris"},{"match":"zz:f1f","pick":"1"}]'::jsonb, 100);
  c1 := (r->>'combo')::bigint;
  if (r->>'odds')::numeric <> 12.00 then raise exception 'FALLO: la cuota de la combinada deberia ser 3 x 2 x 2 = 12 y es %', r->>'odds'; end if;
  r := place_combo('[{"match":"zz:f1q","pick":"FQ:lando_norris"},{"match":"zz:f2q","pick":"FQ:max_verstappen"}]'::jsonb, 100);   -- dos Grandes Premios distintos: vale
  c2 := (r->>'combo')::bigint;
  -- gana la primera: Norris gana la carrera, pole de Norris en el GP 2, el local en futbol
  update matches set status = 'final', winner = '1', score = 'Norris', starts_at = now() - interval '2 hours',
    details = details || '{"res":{"o":["lando_norris","max_verstappen"],"st":{"lando_norris":"F","max_verstappen":"F"},"fl":"lando_norris"}}'::jsonb where id = 'zz:f1r';
  update matches set status = 'final', winner = '1', score = 'Norris', starts_at = now() - interval '2 hours',
    details = details || '{"res":{"o":["lando_norris","max_verstappen"]}}'::jsonb where id = 'zz:f2q';
  update matches set status = 'final', winner = '1', score = '2:0', starts_at = now() - interval '2 hours' where id = 'zz:f1f';
  update matches set status = 'final', winner = '1', score = 'Verstappen', starts_at = now() - interval '2 hours',
    details = details || '{"res":{"o":["max_verstappen","lando_norris"]}}'::jsonb where id = 'zz:f1q';
  perform settle_match('zz:f1r'); perform settle_match('zz:f2q'); perform settle_match('zz:f1f'); perform settle_match('zz:f1q');
  if (select status from combos where id = c1) <> 'won' or (select payout from combos where id = c1) <> 1200 then raise exception 'FALLO: la combinada de F1 deberia cobrar 1.200 y es % %', (select status from combos where id = c1), (select payout from combos where id = c1); end if;
  if (select status from combos where id = c2) <> 'lost' then raise exception 'FALLO: la combinada con la pole perdida deberia perder (%)', (select status from combos where id = c2); end if;
  resumen := resumen || 'Combinadas: una pata por Gran Premio y una de campeonato; pago exacto. ';

  -- ---------- el sincronizador ----------
  perform sync_push(sec, jsonb_build_array(jsonb_build_object('id', 'zz:s1', 'sport', 'r', 'league', 'f1', 'league_name', 'Fórmula 1', 'home', 'GP S', 'away', 'Carrera',
    'starts_at', now() + interval '1 day', 'status', 'scheduled', 'details', '{"kind":"race","gp":"2099-9","dr":{"max_verstappen":"Max Verstappen"}}'::jsonb,
    'odds_mk', '{"FW:max_verstappen":4.254,"FZ:max_verstappen":2,"FW:Max":2,"FW:max_verstappen_":2,"FW:a":2,"FQ:max_verstappen":1.00}'::jsonb)));
  if (select odds_mk from matches where id = 'zz:s1') <> '{"FW:max_verstappen":4.25,"FW:max_verstappen_":2.00}'::jsonb then
    raise exception 'FALLO: el sincronizador guarda %', (select odds_mk from matches where id = 'zz:s1'); end if;
  if (select details #>> '{dr,max_verstappen}' from matches where id = 'zz:s1') <> 'Max Verstappen' or (select sport from matches where id = 'zz:s1') <> 'r' then raise exception 'FALLO: el sincronizador no guarda la F1'; end if;
  r := sync_f1_pendientes(sec);
  if jsonb_typeof(r) <> 'array' or not exists (select 1 from jsonb_array_elements(r) x where x->>'id' = 'zz:s1') or exists (select 1 from jsonb_array_elements(r) x where x->>'id' = 'zz:f1r') then
    raise exception 'FALLO: sync_f1_pendientes: %', r; end if;
  fallo := false; begin perform sync_f1_pendientes('mala'); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: sync_f1_pendientes acepta una clave mala'; end if;
  resumen := resumen || 'Sincronizador: guarda la F1, tira los codigos raros y pregunta lo pendiente. ';

  -- ---------- lo interno, cerrado ----------
  if has_function_privilege('authenticated', 'mk_resultado(matches, text)', 'execute') or has_function_privilege('anon', 'mk_encaja(matches, text)', 'execute') then
    raise exception 'FALLO: las funciones internas se pueden llamar desde fuera'; end if;
  if not has_function_privilege('authenticated', 'place_bet(text, text, int)', 'execute') or not has_function_privilege('authenticated', 'place_combo(jsonb, int)', 'execute') then
    raise exception 'FALLO: los jugadores han perdido un permiso'; end if;

  raise exception 'PRUEBA SUPERADA (se deshace todo): %', resumen;
end $$;
