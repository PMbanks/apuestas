-- Prueba de db/022_extras.sql, para el editor SQL de Supabase. Va DESPUES de 022_extras.sql (y de 001 a 019).
-- Prueba la cuota mejorada (eleccion del partido, cuota en la apuesta, redondeo, tope, pago), las predicciones rapidas
-- (gol y ronda: reglas, cobro, resolucion, devoluciones, doble pago) y la vitrina y los trofeos (permanencia, sin duplicados),
-- y que un jugador normal NO pueda llamar a las funciones internas ni escribir en las tablas nuevas.
-- Hacen falta al menos tres jugadores. Al final lanza un error A PROPOSITO para que se deshaga todo: no queda nada guardado.
-- Si todo va bien, el error dice "PRUEBA SUPERADA" con el resumen. Si algo falla, dice "FALLO" y que.
do $$
declare
  jug uuid[] := array(select id from players order by created_at, id);
  adm uuid := (select id from players where is_admin order by created_at limit 1);
  r jsonb; v jsonb; s0 int; s1 int; s2 int; t0 int; fallo boolean; resumen text := ''; n int; n2 int; o numeric; bid bigint; pid bigint; pid2 bigint;
  wk date := madrid_week(); fin timestamptz; res text; inv1 bigint; inv2 bigint; inv3 bigint; inv4 bigint; invx bigint; pr bigint;
  sec text := 'secreto-de-prueba';
begin
  if cardinality(jug) < 3 then raise exception 'FALLO: hacen falta al menos tres jugadores'; end if;
  if adm is null then adm := jug[1]; end if;
  insert into settings(key, value) values ('sync_secret', to_jsonb(sec)) on conflict (key) do update set value = excluded.value;
  perform pay_week();
  insert into ledger(player, amount, kind, note) select id, 100000, 'ajuste', 'saldo de prueba' from players;
  -- un mundo limpio: ningun otro partido compite por la cuota mejorada y no hay mejora puesta
  update matches set status = 'canceled' where status = 'scheduled';
  delete from ex_boosts;
  fin := least(now() + interval '3 hours', ((wk + 7)::timestamp at time zone 'Europe/Madrid') - interval '1 minute');

  -- =========================================================== 1. CUOTA MEJORADA
  insert into matches(id, sport, league, league_name, stage, tag, home, away, starts_at, status, odds_1, odds_x, odds_2, bo) values
    ('zz:ucl', 'f', 'uefa.champions', 'Champions', 'League Phase', null, 'Real Madrid', 'Man City', fin, 'scheduled', 2.40, 3.40, 2.90, null),
    ('zz:fin', 'f', 'esp.copa_del_rey', 'Copa', 'Final', null, 'Barcelona', 'Real Madrid', fin, 'scheduled', 2.20, 3.30, 3.10, null),
    ('zz:ufc', 'u', 'ufc', 'UFC', 'Title Fight · UFC 999', 'Combate estelar', 'A Luchador', 'B Luchador', fin, 'scheduled', 1.70, null, 2.20, null),
    ('zz:val', 'v', 'ps:valorant:1', 'VCT Champions', 'VCT Champions · Grand Final', 'Internacional', 'Equipo Uno', 'Equipo Dos', fin, 'scheduled', 2.10, null, 1.80, 5),
    ('zz:peq', 'f', 'por.1', 'Liga Portugal', 'Jornada 9', null, 'Gil Vicente', 'Famalicao', fin, 'scheduled', 2.50, 3.10, 2.80, null),
    ('zz:vlocal', 'v', 'ps:valorant:2', 'Torneo local', 'Ronda 1', null, 'Local Uno', 'Local Dos', fin, 'scheduled', 1.50, null, 2.50, 3);
  if ex_boost_score((select m from matches m where id = 'zz:val')) <> 145 then raise exception 'FALLO: la final internacional de Valorant debe puntuar 145 y puntua %', ex_boost_score((select m from matches m where id = 'zz:val')); end if;
  if ex_boost_score((select m from matches m where id = 'zz:fin')) <> 130 then raise exception 'FALLO: la final de Copa entre Barcelona y Real Madrid debe puntuar 130 y puntua %', ex_boost_score((select m from matches m where id = 'zz:fin')); end if;
  if ex_boost_score((select m from matches m where id = 'zz:ufc')) <> 85 then raise exception 'FALLO: el combate por el titulo debe puntuar 85 y puntua %', ex_boost_score((select m from matches m where id = 'zz:ufc')); end if;
  if ex_boost_score((select m from matches m where id = 'zz:ucl')) <> 65 then raise exception 'FALLO: Champions entre grandes e igualado debe puntuar 65 y puntua %', ex_boost_score((select m from matches m where id = 'zz:ucl')); end if;
  if ex_boost_score((select m from matches m where id = 'zz:peq')) <> 0 or ex_boost_score((select m from matches m where id = 'zz:vlocal')) <> 0 then raise exception 'FALLO: un partido menor puntua'; end if;

  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  r := ex_estado();                                                          -- al abrir la app se elige el partido
  if (select count(*) from ex_boosts where week = wk) <> 1 then raise exception 'FALLO: ex_estado no ha elegido el partido de la semana'; end if;
  if (select match_id from ex_boosts where week = wk) <> 'zz:val' then raise exception 'FALLO: no ha elegido el partido mas gordo (%)', (select match_id from ex_boosts where week = wk); end if;
  if (select pct from ex_boosts where week = wk) not between 25 and 50 then raise exception 'FALLO: la mejora no esta entre 25 y 50'; end if;
  if jsonb_array_length(r->'boosts') <> 1 or r->'boosts'->0->>'match' <> 'zz:val' then raise exception 'FALLO: ex_estado no cuenta la mejora vigente: %', r; end if;
  if not exists (select 1 from chat where body like 'Cuota mejorada de la semana: Equipo Uno vs Equipo Dos%') then raise exception 'FALLO: no hay aviso en el chat'; end if;
  perform ex_pick_boost(); perform ex_pick_boost();
  if (select count(*) from ex_boosts) <> 1 then raise exception 'FALLO: se ha elegido mas de un partido en la misma semana'; end if;
  resumen := resumen || 'Cuota mejorada: elige el partido mas gordo una vez por semana. ';

  -- cuota: pick 1 con +25 % sobre 2,10 = 2,625 -> 2,63 (redondeo hacia arriba como numeric)
  update ex_boosts set pick = '1', pct = 25 where week = wk;
  s0 := (select coalesce(sum(amount), 0) from ledger where player = jug[1]);
  r := place_bet('zz:val', '1', 100); bid := (r->>'bet')::bigint;
  if (r->>'odds')::numeric <> 2.63 then raise exception 'FALLO: 2,10 con +25 %% debe dar 2,63 y da %', r->>'odds'; end if;
  if (select odds from bets where id = bid) <> 2.63 or (select boost from bets where id = bid) <> 25 then raise exception 'FALLO: la apuesta no guarda la cuota mejorada y el %%'; end if;
  if (select coalesce(sum(amount), 0) from ledger where player = jug[1]) <> s0 - 100 then raise exception 'FALLO: la apuesta mejorada no cobra 100'; end if;
  if (select note from ledger where bet_id = bid) not like '%2,63%cuota mejorada%' then raise exception 'FALLO: el monedero no dice la cuota mejorada: %', (select note from ledger where bet_id = bid); end if;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[2]), true);
  r := place_bet('zz:val', '2', 100);                                        -- la otra eleccion NO se mejora
  if (r->>'odds')::numeric <> 1.80 or (select boost from bets where id = (r->>'bet')::bigint) is not null then raise exception 'FALLO: una eleccion sin mejora cambia de cuota'; end if;
  r := place_bet('zz:val', '1', 40);                                         -- otro jugador, la eleccion mejorada
  if (r->>'odds')::numeric <> 2.63 then raise exception 'FALLO: la mejora no vale para todos los jugadores'; end if;
  -- el partido de al lado no se toca
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  r := place_bet('zz:ufc', '1', 10);
  if (r->>'odds')::numeric <> 1.70 then raise exception 'FALLO: un partido sin mejora cambia de cuota'; end if;

  -- tope: ya lleva 100; con tope 150 caben 50 mas y no 60
  update settings set value = '150' where key = 'boost_tope';
  fallo := false; begin perform place_bet('zz:val', '1', 60); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se ha pasado del tope de la cuota mejorada'; end if;
  r := place_bet('zz:val', '1', 50); bid := (r->>'bet')::bigint;
  fallo := false; begin perform place_bet('zz:val', '1', 1); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se ha podido apostar por encima del tope'; end if;
  r := place_bet('zz:val', '2', 500);                                        -- la eleccion sin mejora no cuenta para el tope
  if (r->>'odds')::numeric <> 1.80 then raise exception 'FALLO: la eleccion sin mejora afecta al tope'; end if;
  update settings set value = '1000' where key = 'boost_tope';
  -- una apuesta cancelada libera el tope
  perform cancel_bet(bid);
  perform place_bet('zz:val', '1', 50);
  -- las tres elecciones mejoradas (pick null)
  update ex_boosts set pick = null, pct = 30 where week = wk;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[3]), true);
  r := place_bet('zz:val', '2', 100);
  if (r->>'odds')::numeric <> 2.34 then raise exception 'FALLO: 1,80 con +30 %% debe dar 2,34 y da %', r->>'odds'; end if;
  r := ex_estado();
  if (r->'boosts'->0->>'usado')::int <> 100 or (r->>'tope')::int <> 1000 then raise exception 'FALLO: ex_estado cuenta mal lo usado del tope: %', r; end if;
  -- se paga con la cuota mejorada
  update matches set status = 'final', winner = '1', score = '2:1' where id = 'zz:val';
  s1 := (select coalesce(sum(amount), 0) from ledger where player = jug[1]);
  s2 := (select coalesce(sum(amount), 0) from ledger where player = jug[2]);
  n := settle_match('zz:val');
  if n <> 6 then raise exception 'FALLO: settle_match deberia cerrar 6 apuestas y cierra %', n; end if;
  if (select coalesce(sum(amount), 0) from ledger where player = jug[1]) <> s1 + 263 + 132 then raise exception 'FALLO: el premio de la apuesta mejorada no es 263 + 132 (100 y 50 a 2,63)'; end if;
  if (select coalesce(sum(amount), 0) from ledger where player = jug[2]) <> s2 + round(40 * 2.63)::int then raise exception 'FALLO: el premio del segundo jugador no usa la cuota mejorada'; end if;
  resumen := resumen || 'La apuesta guarda la cuota mejorada, el tope funciona y se paga con ella. ';

  -- PM puede cambiarla a mano; los demas no
  update matches set status = 'scheduled', winner = null, starts_at = fin, settled = false where id in ('zz:ucl');
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[2]), true);
  fallo := false; begin perform ex_admin_boost('zz:ucl', '1', 40); exception when others then fallo := true; end;
  if adm = jug[2] then fallo := true; end if;
  if not fallo then raise exception 'FALLO: un jugador sin permiso ha cambiado la cuota mejorada'; end if;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', adm), true);
  fallo := false; begin perform ex_admin_boost('zz:ucl', '1', 60); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: PM ha puesto una mejora fuera de 25 a 50'; end if;
  perform ex_admin_boost('zz:ucl', 'X', 50);
  if (select match_id || pick || pct from ex_boosts where week = wk) <> 'zz:uclX50' then raise exception 'FALLO: PM no ha podido cambiar la cuota mejorada'; end if;
  r := place_bet('zz:ucl', 'X', 10);
  if (r->>'odds')::numeric <> 5.10 then raise exception 'FALLO: 3,40 con +50 %% debe dar 5,10 y da %', r->>'odds'; end if;

  -- =========================================================== 2. PREDICCIONES RAPIDAS
  insert into matches(id, sport, league, league_name, home, away, starts_at, status, score, details) values
    ('zz:fut', 'f', 'esp.1', 'LaLiga', 'Local FC', 'Visitante FC', now() - interval '50 minutes', 'live', '0:0', '{"espn":{"sport":"soccer","league":"esp.1","event":"1"}}'),
    ('zz:fut2', 'f', 'esp.1', 'LaLiga', 'Otro FC', 'Rival FC', now() - interval '50 minutes', 'live', '0:0', '{}'),
    ('zz:fut3', 'f', 'esp.1', 'LaLiga', 'Futuro FC', 'Mañana FC', now() + interval '5 hours', 'scheduled', null, '{"espn":{"sport":"soccer","league":"esp.1","event":"3"}}'),
    ('zz:fut4', 'f', 'esp.1', 'LaLiga', 'Cuarto FC', 'Quinto FC', now() - interval '50 minutes', 'live', '0:0', '{"espn":{"sport":"soccer","league":"esp.1","event":"4"}}'),
    ('zz:vlr', 'v', 'ps:valorant:9', 'VCT', 'Nova', 'A Team', now() - interval '40 minutes', 'live', '0:0', '{}');
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  -- gol en 10 minutos
  s0 := (select coalesce(sum(amount), 0) from ledger where player = jug[1]);
  r := ex_pred_gol('zz:fut', 'si', 20); pid := (r->>'id')::bigint;
  if (r->>'odds')::numeric <> 3.00 then raise exception 'FALLO: la cuota de "habra gol" no es 3,00'; end if;
  if (select coalesce(sum(amount), 0) from ledger where player = jug[1]) <> s0 - 20 then raise exception 'FALLO: la prediccion de gol no cobra 20'; end if;
  if (select win_from - placed_at from ex_pred where id = pid) <> interval '60 seconds' or (select win_to - placed_at from ex_pred where id = pid) <> interval '11 minutes' then
    raise exception 'FALLO: la ventana del gol no es de 1 a 11 minutos tras apostar'; end if;
  fallo := false; begin perform ex_pred_gol('zz:fut', 'no', 10); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: dos predicciones de gol abiertas a la vez en el mismo partido'; end if;
  fallo := false; begin perform ex_pred_gol('zz:fut', 'talvez', 10); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: acepta una eleccion que no existe'; end if;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[2]), true);
  fallo := false; begin perform ex_pred_gol('zz:fut', 'si', 51); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: la prediccion pasa del maximo de 50'; end if;
  fallo := false; begin perform ex_pred_gol('zz:fut', 'si', 0); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: la prediccion acepta 0'; end if;
  fallo := false; begin perform ex_pred_gol('zz:fut2', 'si', 10); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: acepta un partido sin datos de ESPN'; end if;
  fallo := false; begin perform ex_pred_gol('zz:fut3', 'si', 10); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: acepta un partido que no ha empezado'; end if;
  fallo := false; begin perform ex_pred_gol('zz:ufc', 'si', 10); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: acepta un partido de otro deporte'; end if;
  r := ex_pred_gol('zz:fut', 'no', 30); pid2 := (r->>'id')::bigint;
  if (r->>'odds')::numeric <> 1.25 then raise exception 'FALLO: la cuota de "no habra gol" no es 1,25'; end if;
  perform ex_pred_gol('zz:fut4', 'si', 15);                                  -- esta es la que caducara
  -- sin saldo
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[3]), true);
  insert into ledger(player, amount, kind, note) values (jug[3], -((select coalesce(sum(amount), 0) from ledger where player = jug[3]) - 5)::int, 'ajuste', 'dejar a 5');
  fallo := false; begin perform ex_pred_gol('zz:fut', 'si', 10); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se predice sin saldo'; end if;
  insert into ledger(player, amount, kind, note) values (jug[3], 100000, 'ajuste', 'saldo de prueba');
  -- Valorant: ronda
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  fallo := false; begin perform ex_pred_ronda('zz:vlr', 'Ascent', 11, '1', 10); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: apuesta a una ronda sin que el sincronizador haya visto el mapa'; end if;
  fallo := false; begin perform sync_ex_pred_put('clave-mala', '[{"match":"zz:vlr","ref":"Ascent","n":10}]'); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: sync_ex_pred_put acepta una clave mala'; end if;
  if sync_ex_pred_put(sec, '[{"match":"zz:vlr","ref":"Ascent","n":10},{"match":"no-existe","ref":"X","n":1}]') <> 1 then raise exception 'FALLO: sync_ex_pred_put no guarda una sola observacion'; end if;
  fallo := false; begin perform ex_pred_ronda('zz:vlr', 'Ascent', 10, '1', 10); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: apuesta a una ronda que ya se habia visto jugada'; end if;
  r := ex_pred_ronda('zz:vlr', 'ASCENT', 11, '1', 25); pid := (r->>'id')::bigint;
  if (r->>'odds')::numeric <> 1.90 then raise exception 'FALLO: la cuota de ronda no es 1,90'; end if;
  fallo := false; begin perform ex_pred_ronda('zz:vlr', 'Ascent', 11, '2', 10); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: dos apuestas a la misma ronda'; end if;
  fallo := false; begin perform ex_pred_ronda('zz:vlr', 'Ascent', 60, '2', 10); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: apuesta a una ronda muy lejana'; end if;
  fallo := false; begin perform ex_pred_ronda('zz:vlr', 'Ascent', 12, '3', 10); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: acepta un equipo que no existe'; end if;
  -- si el sincronizador lleva 620 s sin ver el mapa, las rondas que ya han tenido tiempo de acabar se cierran
  update ex_pred_obs set at = now() - interval '620 seconds' where match_id = 'zz:vlr';
  fallo := false; begin perform ex_pred_ronda('zz:vlr', 'Ascent', 14, '2', 10); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: acepta una ronda que con el tiempo pasado ya habria acabado'; end if;
  r := ex_pred_ronda('zz:vlr', 'Ascent', 15, '2', 10); pid2 := (r->>'id')::bigint;
  update ex_pred_obs set at = now() - interval '21 minutes' where match_id = 'zz:vlr';
  fallo := false; begin perform ex_pred_ronda('zz:vlr', 'Ascent', 30, '2', 10); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: acepta con datos de hace mas de 20 minutos'; end if;
  resumen := resumen || 'Predicciones: reglas de gol y de ronda. ';

  -- resolucion por el sincronizador
  fallo := false; begin perform sync_ex_pred_pending('clave-mala'); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: sync_ex_pred_pending acepta una clave mala'; end if;
  v := sync_ex_pred_pending(sec);
  if jsonb_array_length(v) <> (select count(*) from ex_pred where status = 'open') or jsonb_array_length(v) < 5 then raise exception 'FALLO: sync_ex_pred_pending no lista las abiertas: %', v; end if;
  if not (v @> '[{"kind":"gol","home":"Local FC"}]'::jsonb) or not (v @> '[{"kind":"ronda","ref":"ascent","n":11}]'::jsonb) then raise exception 'FALLO: sync_ex_pred_pending no trae lo necesario para comprobar: %', v; end if;
  -- gol: jug[1] 'si' 20 gana (60), jug[2] 'no' 30 pierde; ronda 11 de jug[1] 25 gana (47,5 -> 48); ronda 15 de jug[1] 10 se devuelve
  select id into pid from ex_pred where player = jug[1] and kind = 'gol' and pick = 'si';
  select id into pid2 from ex_pred where player = jug[2] and kind = 'gol' and pick = 'no';
  s0 := (select coalesce(sum(amount), 0) from ledger where player = jug[1]);
  n := sync_ex_pred_resolve(sec, jsonb_build_array(
    jsonb_build_object('id', pid, 'res', 'won', 'ev', 'Gol de Fulano, 71 minutos'),
    jsonb_build_object('id', pid2, 'res', 'lost', 'ev', 'Sin goles'),
    jsonb_build_object('id', (select id from ex_pred where kind = 'ronda' and ex_pred.n = 11), 'res', 'won', 'ev', 'Ronda 11: Nova'),
    jsonb_build_object('id', (select id from ex_pred where kind = 'ronda' and ex_pred.n = 15), 'res', 'void', 'ev', 'el mapa acabo antes'),
    jsonb_build_object('id', (select id from ex_pred where kind = 'ronda' and ex_pred.n = 15), 'res', 'won', 'ev', 'repetida: no debe pagar otra vez'),
    jsonb_build_object('id', 999999, 'res', 'won', 'ev', 'no existe'),
    jsonb_build_object('id', pid, 'res', 'raro', 'ev', 'resultado raro')));
  if n <> 4 then raise exception 'FALLO: sync_ex_pred_resolve deberia cerrar 4 y cierra %', n; end if;
  if (select coalesce(sum(amount), 0) from ledger where player = jug[1]) <> s0 + 60 + 48 + 10 then
    raise exception 'FALLO: los cobros de las predicciones no suman 60 + 48 (+ 10 devueltos): %', (select coalesce(sum(amount), 0) from ledger where player = jug[1]) - s0; end if;
  if (select status || payout from ex_pred where id = pid) <> 'won60' or (select evidence from ex_pred where id = pid) <> 'Gol de Fulano, 71 minutos' then raise exception 'FALLO: la prediccion ganada no guarda el pago y la prueba'; end if;
  if (select status from ex_pred where id = pid2) <> 'lost' then raise exception 'FALLO: la perdida no queda perdida'; end if;
  if (select status from ex_pred where kind = 'ronda' and ex_pred.n = 15) <> 'void' then raise exception 'FALLO: la devuelta no queda anulada'; end if;
  n := sync_ex_pred_resolve(sec, jsonb_build_array(jsonb_build_object('id', pid, 'res', 'won', 'ev', 'otra vez')));
  if n <> 0 or (select coalesce(sum(amount), 0) from ledger where player = jug[1]) <> s0 + 60 + 48 + 10 then raise exception 'FALLO: una prediccion ya cerrada se vuelve a pagar'; end if;
  if not exists (select 1 from chat where body like '% acertó la predicción rápida de Local FC vs Visitante FC y cobra 60') then raise exception 'FALLO: falta el aviso del chat al acertar'; end if;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  r := ex_pred_estado();
  if (r->>'max')::int <> 50 or jsonb_array_length(r->'mine') <> 3 or not (r->'live' @> '[{"id":"zz:fut"}]'::jsonb) or (r->'live' @> '[{"id":"zz:fut2"}]'::jsonb) then raise exception 'FALLO: ex_pred_estado: %', r; end if;
  -- caducan a las 8 horas y se devuelven
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[2]), true);
  s2 := (select coalesce(sum(amount), 0) from ledger where player = jug[2]);
  update ex_pred set placed_at = now() - interval '9 hours' where player = jug[2] and status = 'open';
  n2 := (select count(*) from ex_pred where player = jug[2] and status = 'open');
  r := ex_pred_estado();
  if (select count(*) from ex_pred where player = jug[2] and status = 'open') <> 0 then raise exception 'FALLO: las predicciones de hace 9 horas siguen abiertas'; end if;
  if (select coalesce(sum(amount), 0) from ledger where player = jug[2]) <> s2 + (select coalesce(sum(stake), 0) from ex_pred where player = jug[2] and status = 'void') or n2 < 1 then raise exception 'FALLO: lo caducado no se devuelve'; end if;
  resumen := resumen || 'Resolucion: paga una sola vez, devuelve y caduca. ';

  -- =========================================================== 3. VITRINA Y TROFEOS
  insert into cs_items(id, name, phase, rarity, image, price) values
    ('zz-i1', 'AK-47 | Redline', null, 'cla', 'img1', array[50,40,30,20,10,50,40,30,20,10]),
    ('zz-i2', '★ Karambit | Doppler', 'Ruby', 'esp', 'img2', array[500,400,300,200,100,500,400,300,200,100]),
    ('zz-i3', 'AWP | Asiimov', null, 'cov', 'img3', array[80,70,60,50,40,80,70,60,50,40]),
    ('zz-i4', 'Glock-18 | Fade', null, 'res', 'img4', array[30,25,20,15,10,30,25,20,15,10]);
  insert into cs_inv(player, item_id, wear, fl, st, value) values
    (jug[1], 'zz-i1', 1, 0.101, false, 40), (jug[1], 'zz-i2', 0, 0.01, true, 500), (jug[1], 'zz-i3', 2, 0.2, false, 60), (jug[1], 'zz-i4', 0, 0.05, false, 30), (jug[2], 'zz-i1', 3, 0.4, false, 20);
  select id into inv1 from cs_inv where player = jug[1] and item_id = 'zz-i1';
  select id into inv2 from cs_inv where player = jug[1] and item_id = 'zz-i2';
  select id into inv3 from cs_inv where player = jug[1] and item_id = 'zz-i3';
  select id into inv4 from cs_inv where player = jug[1] and item_id = 'zz-i4';
  select id into invx from cs_inv where player = jug[2];
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  r := ex_mis_skins();
  if jsonb_array_length(r) <> 4 or r->0->>'item' <> 'zz-i2' then raise exception 'FALLO: ex_mis_skins no devuelve mis 4 skins por valor: %', r; end if;
  fallo := false; begin perform ex_set_vitrina(array[inv1, inv2, inv3, inv4]); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: la vitrina acepta 4 skins'; end if;
  fallo := false; begin perform ex_set_vitrina(array[inv1, inv1]); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: la vitrina acepta una skin repetida'; end if;
  fallo := false; begin perform ex_set_vitrina(array[inv1, invx]); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: la vitrina acepta la skin de otro'; end if;
  fallo := false; begin perform ex_set_vitrina(array[inv1, 99999999]); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: la vitrina acepta una skin que no existe'; end if;
  perform ex_set_vitrina(array[inv3, inv2, inv1]);
  v := ex_vitrinas();
  if jsonb_array_length((select x->'vit' from jsonb_array_elements(v->'jug') x where x->>'id' = jug[1]::text)) <> 3
     or (select x->'vit'->0->>'item' from jsonb_array_elements(v->'jug') x where x->>'id' = jug[1]::text) <> 'zz-i3' then raise exception 'FALLO: la vitrina no sale en el orden elegido: %', v->'jug'; end if;
  if jsonb_array_length((select x->'vit' from jsonb_array_elements(v->'jug') x where x->>'id' = jug[2]::text)) <> 0 then raise exception 'FALLO: la vitrina de otro no esta vacia'; end if;
  perform ex_set_vitrina(array[inv4]);                                       -- cambiar: sustituye lo anterior
  if (select count(*) from ex_vitrina where player = jug[1]) <> 1 then raise exception 'FALLO: elegir de nuevo no sustituye la vitrina'; end if;
  perform ex_set_vitrina(array[inv4, inv2]);
  update cs_inv set status = 'sold', sold_at = now() where id = inv2;       -- una skin vendida desaparece de la vitrina
  v := ex_vitrinas();
  if jsonb_array_length((select x->'vit' from jsonb_array_elements(v->'jug') x where x->>'id' = jug[1]::text)) <> 1 then raise exception 'FALLO: una skin vendida sigue en la vitrina'; end if;
  fallo := false; begin perform ex_set_vitrina(array[inv2]); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se puede exponer una skin vendida'; end if;
  perform ex_set_vitrina(array[]::bigint[]);
  if (select count(*) from ex_vitrina where player = jug[1]) <> 0 then raise exception 'FALLO: no se puede vaciar la vitrina'; end if;
  resumen := resumen || 'Vitrina: 3 skins propias, en orden, sin repetidas ni ajenas ni vendidas. ';

  -- trofeos: meses cerrados, bote y premios; permanentes y sin duplicar
  update settings set value = '"2026-01-15"' where key = 'season_start';
  delete from ex_trofeos;
  insert into bets(player, match_id, pick, stake, odds, status, payout, settled_at) values
    (jug[1], 'zz:peq', '1', 100, 5.00, 'won', 500, '2026-02-10 12:00+01'),
    (jug[2], 'zz:peq', '1', 50, 2.00, 'lost', 0, '2026-02-11 12:00+01'),
    (jug[2], 'zz:peq', '1', 100, 4.00, 'won', 400, '2026-03-05 12:00+01'),
    (jug[3], 'zz:peq', '1', 100, 4.00, 'won', 400, '2026-03-06 12:00+01'),
    (jug[1], 'zz:peq', '1', 100, 2.00, 'lost', 0, '2026-03-07 12:00+01'),
    (jug[3], 'zz:peq', '1', 100, 2.00, 'lost', 0, '2026-04-07 12:00+01');
  insert into ledger(player, amount, kind, note, week) values
    (jug[2], 400, 'bote_gana', 'Bote de la semana', '2026-03-02'),
    (jug[3], 200, 'premio_semana', 'Más dinero de la semana', '2026-03-02'),
    (jug[2], 100, 'premio_semana', 'Mejor ratio de la semana', '2026-03-02');
  n := ex_trofeos_apunta();
  -- febrero: jug[1] (+400, jug[2] -50); marzo: jug[2] +300 y jug[3] +300 (empate: los dos); abril: solo perdidas, nadie
  if (select count(*) from ex_trofeos where tipo = 'mes') <> 3 then raise exception 'FALLO: campeones del mes mal apuntados (%)', (select count(*) from ex_trofeos where tipo = 'mes'); end if;
  if not exists (select 1 from ex_trofeos where tipo = 'mes' and periodo = '2026-02-01' and player = jug[1] and valor = 400) then raise exception 'FALLO: el campeon de febrero no es jug1 con 400'; end if;
  if (select count(*) from ex_trofeos where tipo = 'mes' and periodo = '2026-03-01' and valor = 300) <> 2 then raise exception 'FALLO: en marzo deberian ganar los dos empatados'; end if;
  if exists (select 1 from ex_trofeos where tipo = 'mes' and periodo >= '2026-04-01' and periodo < '2026-05-01') then raise exception 'FALLO: hay campeon en un mes solo con perdidas'; end if;
  if (select count(*) from ex_trofeos where tipo = 'bote') <> 1 or (select count(*) from ex_trofeos where tipo = 'premio') <> 2 then raise exception 'FALLO: bote y premios mal apuntados'; end if;
  if ex_trofeos_apunta() <> 0 then raise exception 'FALLO: apuntar otra vez duplica trofeos'; end if;
  n := (select count(*) from ex_trofeos);
  delete from ledger where kind in ('bote_gana', 'premio_semana');           -- aunque se limpie el monedero, los trofeos se quedan
  delete from bets where match_id = 'zz:peq';
  perform ex_trofeos_apunta();
  if (select count(*) from ex_trofeos) <> n then raise exception 'FALLO: los trofeos no son permanentes'; end if;
  v := ex_vitrinas();
  if jsonb_array_length(v->'trofeos') <> n or jsonb_typeof(v->'mes'->'lider') <> 'array' then raise exception 'FALLO: ex_vitrinas no trae los trofeos: %', v->'mes'; end if;
  -- records: mayor premio y mayor cuota acertada
  insert into bets(player, match_id, pick, stake, odds, status, payout, settled_at) values
    (jug[2], 'zz:peq', '1', 10, 9.50, 'won', 95, now()), (jug[3], 'zz:peq', '1', 900, 1.50, 'won', 1350, now());
  v := ex_vitrinas();
  if (v->'records'->'cuota'->>'v')::numeric <> 9.50 or (v->'records'->'cuota'->>'pl') <> jug[2]::text then raise exception 'FALLO: record de cuota: %', v->'records'; end if;
  if (v->'records'->'premio'->>'v')::int < 1350 then raise exception 'FALLO: record de premio: %', v->'records'; end if;
  resumen := resumen || 'Trofeos: campeon del mes (con empates), bote y premios, permanentes y sin duplicar, y records. ';

  -- =========================================================== SEGURIDAD
  update settings set value = '"2026-10-26"' where key = 'season_start';
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  set local role authenticated;
  v := null::jsonb;
  begin perform ex_pick_boost(); fallo := false; exception when insufficient_privilege then fallo := true; end;
  if not fallo then reset role; raise exception 'FALLO: un jugador puede llamar a ex_pick_boost'; end if;
  begin perform ex_trofeos_apunta(); fallo := false; exception when insufficient_privilege then fallo := true; end;
  if not fallo then reset role; raise exception 'FALLO: un jugador puede llamar a ex_trofeos_apunta'; end if;
  begin perform ex_pred_caducar(); fallo := false; exception when insufficient_privilege then fallo := true; end;
  if not fallo then reset role; raise exception 'FALLO: un jugador puede llamar a ex_pred_caducar'; end if;
  begin perform ex_set_int('pred_max', 1); fallo := false; exception when insufficient_privilege then fallo := true; end;
  if not fallo then reset role; raise exception 'FALLO: un jugador puede llamar a ex_set_int'; end if;
  begin insert into ex_pred(player, match_id, kind, pick, stake, odds) values (jug[1], 'zz:fut', 'gol', 'si', 1, 3); fallo := false; exception when insufficient_privilege then fallo := true; end;
  if not fallo then reset role; raise exception 'FALLO: un jugador puede escribir en ex_pred'; end if;
  begin insert into ex_boosts(week, match_id, pct) values (wk + 7, 'zz:fut', 50); fallo := false; exception when insufficient_privilege then fallo := true; end;
  if not fallo then reset role; raise exception 'FALLO: un jugador puede escribir en ex_boosts'; end if;
  begin insert into ex_trofeos(tipo, periodo, player, valor) values ('mes', '2030-01-01', jug[1], 1); fallo := false; exception when insufficient_privilege then fallo := true; end;
  if not fallo then reset role; raise exception 'FALLO: un jugador puede escribir en ex_trofeos'; end if;
  begin insert into ex_vitrina(player, slot, inv_id) values (jug[1], 1, inv1); fallo := false; exception when insufficient_privilege then fallo := true; end;
  if not fallo then reset role; raise exception 'FALLO: un jugador puede escribir en ex_vitrina'; end if;
  n := 0; begin update bets set boost = 50 where id = (select min(id) from bets); get diagnostics n = row_count; exception when insufficient_privilege then n := 0; end;
  if n <> 0 then reset role; raise exception 'FALLO: un jugador puede cambiar la mejora de una apuesta'; end if;
  n := 0; begin select count(*) into n from ex_pred_obs; exception when insufficient_privilege then n := 0; end;
  if n <> 0 then reset role; raise exception 'FALLO: un jugador puede leer lo que ha visto el sincronizador'; end if;
  n := 0; begin select count(*) into n from ex_pred where player <> jug[1]; exception when insufficient_privilege then n := 0; end;
  if n <> 0 then reset role; raise exception 'FALLO: un jugador puede leer las predicciones de otro'; end if;
  perform ex_estado(); perform ex_pred_estado(); perform ex_vitrinas();      -- lo permitido sigue funcionando
  reset role;
  set local role anon;
  begin perform ex_estado(); fallo := false; exception when insufficient_privilege then fallo := true; end;
  if not fallo then reset role; raise exception 'FALLO: alguien sin cuenta puede llamar a ex_estado'; end if;
  begin perform ex_pred_gol('zz:fut', 'si', 1); fallo := false; exception when insufficient_privilege then fallo := true; end;
  if not fallo then reset role; raise exception 'FALLO: alguien sin cuenta puede predecir'; end if;
  begin perform place_bet('zz:peq', '1', 1); fallo := false; exception when insufficient_privilege then fallo := true; end;
  if not fallo then reset role; raise exception 'FALLO: alguien sin cuenta puede apostar'; end if;
  begin perform sync_ex_pred_resolve('clave-mala', '[]'); fallo := false; exception when insufficient_privilege then fallo := true; when others then fallo := true; end;
  if not fallo then reset role; raise exception 'FALLO: el sincronizador entra con clave mala'; end if;
  begin perform sync_ex('clave-mala'); fallo := false; exception when others then fallo := true; end;
  if not fallo then reset role; raise exception 'FALLO: sync_ex entra con clave mala'; end if;
  perform sync_ex(sec);                                                      -- con la clave buena si
  reset role;
  perform set_config('request.jwt.claims', '', true);
  fallo := false; begin perform ex_pred_gol('zz:fut', 'si', 1); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se predice sin haber entrado'; end if;
  resumen := resumen || 'Las funciones internas y las tablas nuevas estan cerradas a los jugadores.';

  raise exception 'PRUEBA SUPERADA (se deshace todo): %', resumen;
end $$;
