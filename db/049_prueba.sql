-- Prueba de db/049_predicciones.sql, para el editor SQL de Supabase. Va DESPUES de 049_predicciones.sql (y de 001 a 022b).
-- Prueba: cuotas de gol y de ronda segun el momento con margen de la casa (la casa nunca paga por encima de la cuota justa menos el 10 %),
-- suelo 1,10 y tope 4,50; nada del minuto 40 en la primera parte ni del 85 en la segunda, ni con el partido parado ni en prorroga; una sola
-- prediccion abierta por jugador y partido; 5 minutos de espera (y que se puede cambiar); cuota congelada (la que vio el jugador, y aviso si cambia
-- mas de 0,05 en cualquier sentido); que ex_pred_estado trae lo que pinta la app; que las predicciones viejas abiertas se resuelven igual
-- (ganada, perdida, devuelta); y que lo interno esta cerrado a los jugadores.
-- Hacen falta al menos tres jugadores. Al final lanza un error A PROPOSITO para que se deshaga todo: no queda nada guardado.
-- Si todo va bien, el error dice "PRUEBA SUPERADA" con el resumen. Si algo falla, dice "FALLO" y que.
do $$
declare
  jug uuid[] := array(select id from players order by created_at, id);
  sec text := (select value #>> '{}' from settings where key = 'sync_secret');        -- la clave del sincronizador, leida de la base (nunca escrita a mano)
  r jsonb; q jsonb; q2 jsonb; fallo boolean; resumen text := ''; msg text; mm matches; pid bigint; pid2 bigint; s0 numeric; n0 int; bal0 int;
  mn numeric; pr int; hs int; aw int; ev numeric; evn numeric; si numeric; no numeric; p numeric; k int := 0; kmin numeric := 99; kmax numeric := 0; nmin numeric := 99; nmax numeric := 0;
  c1 numeric; c2 numeric; seg int;
begin
  if cardinality(jug) < 3 then raise exception 'FALLO: hacen falta al menos tres jugadores'; end if;
  if sec is null then raise exception 'FALLO: no hay clave del sincronizador en settings'; end if;
  perform pay_week();
  insert into ledger(player, amount, kind, note) select id, 100000, 'ajuste', 'saldo de prueba' from players;
  insert into matches(id, sport, league, league_name, home, away, starts_at, status, score, odds_1, odds_2, bo, details) values
    ('zz:vlr', 'v', 'ps:valorant:9', 'VCT', 'Nova', 'A Team', now() - interval '40 minutes', 'live', '0:0', 1.50, 2.60, 3, '{}'),
    ('zz:fut', 'f', 'esp.1', 'LaLiga', 'Local FC', 'Visitante FC', now() - interval '30 minutes', 'live', '0:0', 1.60, 4.50, null, '{"espn":{"sport":"soccer","league":"esp.1","event":"1"}}'),
    ('zz:fut2', 'f', 'esp.1', 'LaLiga', 'Otro FC', 'Rival FC', now() - interval '30 minutes', 'live', '0:0', 2.40, 2.80, null, '{"espn":{"sport":"soccer","league":"esp.1","event":"2"}}');
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);

  -- =========================================================== CUOTAS DE GOL: MARGEN, SUELO Y TOPE EN TODO EL PARTIDO
  select * into mm from matches where id = 'zz:fut';
  foreach pr in array array[1, 2] loop
    for mn in select generate_series(case when pr = 1 then 0 else 46 end, case when pr = 1 then 39 else 84 end, 1) loop
      for hs in 0..5 loop for aw in 0..5 loop
        perform sync_ex_live_put(sec, jsonb_build_array(jsonb_build_object('match', 'zz:fut', 'data', jsonb_build_object('k', 'f', 'hs', hs, 'as', aw, 'min', mn, 'per', pr))));
        q := ex_pred_cuotas(mm);
        if not (q->>'ok')::boolean then raise exception 'FALLO: no ofrece gol en la parte % minuto % (%-%): %', pr, mn, hs, aw, q; end if;
        si := (q->>'si')::numeric; no := (q->>'no')::numeric; p := (q->>'p')::numeric;
        if si < 1.10 or si > 4.50 or no < 1.10 or no > 4.50 then raise exception 'FALLO: cuota fuera de 1,10 a 4,50 en parte % min % (%-%): %', pr, mn, hs, aw, q; end if;
        if p < 0.20 or p > 0.60 then raise exception 'FALLO: probabilidad fuera de 0,20 a 0,60: %', q; end if;
        if p * si > 0.905 or (1 - p) * no > 0.905 then raise exception 'FALLO: la casa no se queda su margen (parte % min % %-%): p=% sí=% no=%', pr, mn, hs, aw, p, si, no; end if;
        if 1 / si + 1 / no < 1.10 then raise exception 'FALLO: margen total menor del 10 por ciento (sí % no %)', si, no; end if;
        k := k + 1; kmin := least(kmin, si); kmax := greatest(kmax, si); nmin := least(nmin, no); nmax := greatest(nmax, no);
      end loop; end loop;
    end loop;
  end loop;
  resumen := resumen || format('Gol: %s momentos probados, sí de %s a %s y no de %s a %s, la casa se queda su margen siempre. ', k, replace(round(kmin, 2)::text, '.', ','), replace(round(kmax, 2)::text, '.', ','), replace(round(nmin, 2)::text, '.', ','), replace(round(nmax, 2)::text, '.', ','));

  -- ejemplos: 0-0 a mitad de la primera parte (no ~1,16, sí ~4,00); el "no" ya no es casi precio justo
  perform sync_ex_live_put(sec, '[{"match":"zz:fut","data":{"k":"f","hs":0,"as":0,"min":30,"per":1}}]');
  q := ex_pred_cuotas(mm); s0 := (q->>'si')::numeric;
  if (q->>'no')::numeric < 1.12 or (q->>'no')::numeric > 1.22 or s0 < 3.6 or s0 > 4.5 then raise exception 'FALLO: 0-0 al 30 debia dar no entre 1,12 y 1,22 y sí entre 3,6 y 4,5: %', q; end if;
  if 0.775 * (q->>'no')::numeric > 0.905 then raise exception 'FALLO: el no al 30 sigue pagando casi precio justo'; end if;
  -- un partido con muchos goles paga menos al sí; el final paga menos al sí; el empate avanzado y el favorito perdiendo tambien
  perform sync_ex_live_put(sec, '[{"match":"zz:fut","data":{"k":"f","hs":3,"as":2,"min":30,"per":1}}]');
  if (ex_pred_cuotas(mm)->>'si')::numeric >= s0 then raise exception 'FALLO: con 5 goles al 30 el sí debe pagar menos que a 0-0'; end if;
  perform sync_ex_live_put(sec, '[{"match":"zz:fut","data":{"k":"f","hs":1,"as":1,"min":50,"per":2}}]');
  c1 := (ex_pred_cuotas(mm)->>'si')::numeric;
  perform sync_ex_live_put(sec, '[{"match":"zz:fut","data":{"k":"f","hs":1,"as":1,"min":70,"per":2}}]');
  c2 := (ex_pred_cuotas(mm)->>'si')::numeric;
  if c2 >= c1 then raise exception 'FALLO: más tarde en la segunda parte el sí debe pagar menos (50: %, 70: %)', c1, c2; end if;
  perform sync_ex_live_put(sec, '[{"match":"zz:fut","data":{"k":"f","hs":2,"as":0,"min":50,"per":2}}]');
  c1 := (ex_pred_cuotas(mm)->>'si')::numeric;
  perform sync_ex_live_put(sec, '[{"match":"zz:fut","data":{"k":"f","hs":2,"as":0,"min":70,"per":2}}]');
  c2 := (ex_pred_cuotas(mm)->>'si')::numeric;
  perform sync_ex_live_put(sec, '[{"match":"zz:fut","data":{"k":"f","hs":2,"as":0,"min":80,"per":2}}]');
  q := ex_pred_cuotas(mm);
  if not (c1 > c2 and c2 > (q->>'si')::numeric) then raise exception 'FALLO: con el mismo marcador (2-0) el sí debe pagar menos hacia el final (50: %, 70: %, 80: %)', c1, c2, q->>'si'; end if;
  perform sync_ex_live_put(sec, '[{"match":"zz:fut","data":{"k":"f","hs":0,"as":0,"min":10,"per":1}}]');
  c1 := (ex_pred_cuotas(mm)->>'si')::numeric;
  perform sync_ex_live_put(sec, '[{"match":"zz:fut","data":{"k":"f","hs":0,"as":0,"min":25,"per":1}}]');
  c2 := (ex_pred_cuotas(mm)->>'si')::numeric;
  if c2 > c1 then raise exception 'FALLO: al empezar (min 10) el sí debe pagar mas o igual que al 25 (% contra %)', c1, c2; end if;
  -- el favorito (Local FC, 1,60) perdiendo por 1 aprieta mas que cuando pierde el otro
  perform sync_ex_live_put(sec, '[{"match":"zz:fut","data":{"k":"f","hs":0,"as":1,"min":60,"per":2}}]');
  c1 := (ex_pred_cuotas(mm)->>'si')::numeric;                      -- pierde el favorito
  perform sync_ex_live_put(sec, '[{"match":"zz:fut","data":{"k":"f","hs":1,"as":0,"min":60,"per":2}}]');
  c2 := (ex_pred_cuotas(mm)->>'si')::numeric;                      -- gana el favorito
  if c1 >= c2 then raise exception 'FALLO: el favorito perdiendo por 1 debe dar mas gol (sí % contra %)', c1, c2; end if;
  -- empatado y avanzado (min 60) paga menos al sí que ir ganando por 2 con los mismos goles... (mismo ritmo, partido abierto)
  perform sync_ex_live_put(sec, '[{"match":"zz:fut","data":{"k":"f","hs":1,"as":1,"min":60,"per":2}}]');
  c1 := (ex_pred_cuotas(mm)->>'si')::numeric;
  perform sync_ex_live_put(sec, '[{"match":"zz:fut","data":{"k":"f","hs":2,"as":0,"min":60,"per":2}}]');
  c2 := (ex_pred_cuotas(mm)->>'si')::numeric;
  if c1 >= c2 then raise exception 'FALLO: el empate avanzado (min 60) debe dar mas gol que ir 2-0 (sí % contra %)', c1, c2; end if;
  -- el goles por partido es un ajuste
  update settings set value = '4.5' where key = 'pred_goles';
  perform sync_ex_live_put(sec, '[{"match":"zz:fut","data":{"k":"f","hs":0,"as":0,"min":30,"per":1}}]');
  if (ex_pred_cuotas(mm)->>'si')::numeric >= s0 then raise exception 'FALLO: subir pred_goles no baja el sí'; end if;
  update settings set value = '2.7' where key = 'pred_goles';
  update settings set value = '0.20' where key = 'pred_margen';
  q := ex_pred_cuotas(mm);
  update settings set value = '0.11' where key = 'pred_margen';
  if (q->>'no')::numeric >= (ex_pred_cuotas(mm)->>'no')::numeric or (q->>'si')::numeric >= (ex_pred_cuotas(mm)->>'si')::numeric then raise exception 'FALLO: subir pred_margen no baja las cuotas (%)', q; end if;
  -- topes: con muy pocos goles esperados la probabilidad no baja de 0,20 (sí topado en 4,50) y con un margen enorme el no no baja de 1,10
  update settings set value = '0.3' where key = 'pred_goles';
  perform sync_ex_live_put(sec, '[{"match":"zz:fut","data":{"k":"f","hs":0,"as":0,"min":20,"per":1}}]');
  q := ex_pred_cuotas(mm);
  if (q->>'p')::numeric <> 0.2 or (q->>'si')::numeric <> 4.50 or (q->>'no')::numeric < 1.10 or 0.8 * (q->>'no')::numeric > 0.905 then raise exception 'FALLO: con casi ningún gol esperado p debe quedarse en 0,20, sí en 4,50 y la casa con margen: %', q; end if;
  update settings set value = '30' where key = 'pred_goles';
  q := ex_pred_cuotas(mm);
  if (q->>'p')::numeric <> 0.6 or 0.6 * (q->>'si')::numeric > 0.905 or 0.4 * (q->>'no')::numeric > 0.905 then raise exception 'FALLO: con muchísimos goles esperados p debe quedarse en 0,60 y la casa con margen: %', q; end if;
  update settings set value = '2.7' where key = 'pred_goles';
  update settings set value = '0.5' where key = 'pred_margen';
  update settings set value = '0.3' where key = 'pred_goles';
  q := ex_pred_cuotas(mm);
  if (q->>'no')::numeric <> 1.10 then raise exception 'FALLO: el suelo de 1,10 no se aplica con un margen del 50 por ciento: %', q; end if;
  update settings set value = '0.0' where key = 'pred_margen';
  q := ex_pred_cuotas(mm);
  if (q->>'si')::numeric <> 4.50 then raise exception 'FALLO: el tope de 4,50 no se aplica sin margen: %', q; end if;
  update settings set value = '0.11' where key = 'pred_margen';
  update settings set value = '2.7' where key = 'pred_goles';
  resumen := resumen || '0-0 al 30: no 1,16 y sí 4,00; más goles o más tarde o favorito perdiendo, el sí paga menos; margen y goles por partido ajustables. ';

  -- =========================================================== NADA AL FINAL DE CADA PARTE NI PARADO
  foreach mn in array array[39, 40, 43, 45, 47] loop
    perform sync_ex_live_put(sec, jsonb_build_array(jsonb_build_object('match', 'zz:fut', 'data', jsonb_build_object('k', 'f', 'hs', 0, 'as', 0, 'min', mn, 'per', 1))));
    q := ex_pred_cuotas(mm);
    if (mn < 40) <> (q->>'ok')::boolean then raise exception 'FALLO: primera parte minuto %: ok=% (debia ser %)', mn, q->>'ok', (mn < 40); end if;
    if mn >= 40 and q->>'why' not like 'Final de la primera parte%' then raise exception 'FALLO: motivo del minuto % de la primera parte: %', mn, q; end if;
  end loop;
  foreach mn in array array[46, 84, 85, 88, 93] loop
    perform sync_ex_live_put(sec, jsonb_build_array(jsonb_build_object('match', 'zz:fut', 'data', jsonb_build_object('k', 'f', 'hs', 0, 'as', 0, 'min', mn, 'per', 2))));
    q := ex_pred_cuotas(mm);
    if (mn < 85) <> (q->>'ok')::boolean then raise exception 'FALLO: segunda parte minuto %: ok=% (debia ser %)', mn, q->>'ok', (mn < 85); end if;
    if mn >= 85 and q->>'why' not like 'Final del partido%' then raise exception 'FALLO: motivo del minuto % de la segunda parte: %', mn, q; end if;
  end loop;
  perform sync_ex_live_put(sec, '[{"match":"zz:fut","data":{"k":"f","hs":0,"as":0,"min":30,"per":1,"pau":1}}]');
  q := ex_pred_cuotas(mm);
  if (q->>'ok')::boolean or q->>'why' not like 'Partido parado%' then raise exception 'FALLO: con el partido parado se ofrece gol: %', q; end if;
  perform sync_ex_live_put(sec, '[{"match":"zz:fut","data":{"k":"f","hs":0,"as":0,"min":100,"per":3}}]');
  if (ex_pred_cuotas(mm)->>'ok')::boolean then raise exception 'FALLO: en la prórroga se ofrece gol'; end if;
  perform sync_ex_live_put(sec, '[{"match":"zz:fut","data":{"k":"f","hs":0,"as":0,"min":30,"per":1}}]');
  fallo := false; update ex_live set data = jsonb_set(data, '{min}', '41') where match_id = 'zz:fut';
  begin perform ex_pred_gol('zz:fut', 'si', 10); exception when others then fallo := true; get stacked diagnostics msg = message_text; end;
  if not fallo or msg not like 'Final de la primera parte%' then raise exception 'FALLO: ex_pred_gol acepta apostar al minuto 41 de la primera parte (%)', msg; end if;
  update ex_live set data = jsonb_set(data, '{min}', '30') where match_id = 'zz:fut';
  resumen := resumen || 'Sin gol del 40 al 45, del 85 en adelante, parado ni en prórroga (también al apostar). ';

  -- =========================================================== CUOTA CONGELADA
  q := ex_pred_cuotas(mm); si := (q->>'si')::numeric; no := (q->>'no')::numeric;
  fallo := false; begin perform ex_pred_gol('zz:fut', 'si', 51, si); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se predice más del máximo de 50'; end if;
  fallo := false; begin perform ex_pred_gol('zz:fut', 'si', 0, si); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se predice con 0'; end if;
  fallo := false; begin perform ex_pred_gol('zz:fut', 'si', 10, si + 0.06); exception when others then fallo := true; get stacked diagnostics msg = message_text; end;
  if not fallo or msg not like 'La cuota ha cambiado%' then raise exception 'FALLO: p_odds 0,06 por encima no protege (%)', msg; end if;
  fallo := false; begin perform ex_pred_gol('zz:fut', 'si', 10, si - 0.06); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: p_odds 0,06 por debajo no avisa de que ha cambiado'; end if;
  r := ex_pred_gol('zz:fut', 'si', 10, si - 0.04); pid := (r->>'id')::bigint;                 -- dentro del margen de 0,05: se queda con la que vio
  if (r->>'odds')::numeric <> si - 0.04 or (select odds from ex_pred where id = pid) <> si - 0.04 then raise exception 'FALLO: la cuota que vio el jugador no queda congelada (% contra %)', r->>'odds', si - 0.04; end if;
  perform sync_ex_live_put(sec, '[{"match":"zz:fut","data":{"k":"f","hs":3,"as":3,"min":35,"per":1}}]');
  if (select odds from ex_pred where id = pid) <> si - 0.04 then raise exception 'FALLO: la cuota de una predicción hecha cambia con el estado'; end if;
  if (select win_from - placed_at from ex_pred where id = pid) <> interval '180 seconds' or (select win_to - win_from from ex_pred where id = pid) <> interval '10 minutes' then
    raise exception 'FALLO: la ventana del gol debe empezar a los 3 minutos y durar 10'; end if;
  resumen := resumen || 'Cuota congelada: la que ve el jugador, y aviso si cambia más de 0,05. ';

  -- =========================================================== UNA ABIERTA A LA VEZ Y 5 MINUTOS DE ESPERA
  perform sync_ex_live_put(sec, '[{"match":"zz:fut","data":{"k":"f","hs":0,"as":0,"min":30,"per":1}}]');
  begin perform ex_pred_gol('zz:fut', 'no', 10); fallo := false; exception when others then fallo := true; get stacked diagnostics msg = message_text; end;
  if not fallo or msg not like 'Ya tienes una predicción abierta%' then raise exception 'FALLO: una segunda predicción abierta en el mismo partido se acepta (%)', msg; end if;
  -- en otro partido y otro jugador si se puede
  perform sync_ex_live_put(sec, '[{"match":"zz:fut2","data":{"k":"f","hs":0,"as":0,"min":30,"per":1}}]');
  perform ex_pred_gol('zz:fut2', 'no', 10);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[2]), true);
  perform ex_pred_gol('zz:fut', 'no', 10);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  -- la resuelve el sincronizador (perdida) y aun asi tiene que esperar 5 minutos desde que apostó
  perform sync_ex_pred_resolve(sec, jsonb_build_array(jsonb_build_object('id', pid, 'res', 'lost', 'ev', 'prueba')));
  if (select status from ex_pred where id = pid) <> 'lost' then raise exception 'FALLO: el sincronizador no resolvio la de prueba'; end if;
  begin perform ex_pred_gol('zz:fut', 'no', 10); fallo := false; exception when others then fallo := true; get stacked diagnostics msg = message_text; end;
  if not fallo or msg not like 'La siguiente predicción en este partido, en %:%' then raise exception 'FALLO: sin espera de 5 minutos tras resolver (%)', msg; end if;
  if msg !~ 'en [45]:[0-5][0-9]$' then raise exception 'FALLO: el aviso de espera no cuenta bien (acaba de apostar: faltan unos 5:00): %', msg; end if;
  r := ex_pred_estado();
  q := (select x from jsonb_array_elements(r->'live') x where x->>'id' = 'zz:fut');
  if (q->>'abierta')::boolean or (q->>'seg')::int < 280 or (q->>'seg')::int > 300 then raise exception 'FALLO: ex_pred_estado no cuenta la espera (abierta %, seg %)', q->>'abierta', q->>'seg'; end if;
  if (r->>'casa')::numeric is distinct from 0.11 or (r->>'espera')::int is distinct from 300 or (r->>'max')::int is distinct from 50 then raise exception 'FALLO: ex_pred_estado no trae casa, espera y max: %', r; end if;
  -- la de zz:fut2 sigue abierta y se ve
  if not (select (x->>'abierta')::boolean from jsonb_array_elements(r->'live') x where x->>'id' = 'zz:fut2') then raise exception 'FALLO: ex_pred_estado no marca la abierta de zz:fut2'; end if;
  -- pasados 5 minutos ya puede; con otra espera en settings, tambien
  update ex_pred set placed_at = now() - interval '4 minutes 20 seconds' where id = pid;
  begin perform ex_pred_gol('zz:fut', 'no', 10); fallo := false; exception when others then fallo := true; get stacked diagnostics msg = message_text; end;
  if not fallo or msg !~ 'en 0:[34][0-9]$' then raise exception 'FALLO: a los 4:20 debian faltar unos 40 segundos: %', msg; end if;
  update settings set value = '60' where key = 'pred_espera';
  r := ex_pred_gol('zz:fut', 'no', 10); pid2 := (r->>'id')::bigint;
  update settings set value = '300' where key = 'pred_espera';
  perform sync_ex_pred_resolve(sec, jsonb_build_array(jsonb_build_object('id', pid2, 'res', 'void', 'ev', 'prueba')));
  update ex_pred set placed_at = now() - interval '301 seconds' where match_id = 'zz:fut' and player = jug[1];
  r := ex_pred_gol('zz:fut', 'no', 10);
  if (r->>'id') is null then raise exception 'FALLO: pasados 5 minutos no deja predecir'; end if;
  resumen := resumen || 'Una abierta por jugador y partido; 5 minutos de espera ("La siguiente predicción en este partido, en 4:59"), ajustable; otros partidos y jugadores no se ven afectados. ';

  -- =========================================================== VALORANT: MARGEN, SUELO, TOPE, ABIERTA Y ESPERA
  select * into mm from matches where id = 'zz:vlr';
  perform sync_ex_pred_put(sec, '[{"match":"zz:vlr","ref":"Ascent","n":3}]');
  k := 0;
  for hs in 0..2 loop for aw in 0..2 loop for pr in 0..12 loop for n0 in 0..12 loop
    if hs = 2 or aw = 2 then continue; end if;
    perform sync_ex_live_put(sec, jsonb_build_array(jsonb_build_object('match', 'zz:vlr', 'data', jsonb_build_object('k', 's', 'a', hs, 'b', aw, 'bo', 3, 'ra', pr, 'rb', n0))));
    q := ex_pred_cuotas(mm);
    c1 := (q->>'c1')::numeric; c2 := (q->>'c2')::numeric; p := (q->>'p')::numeric;
    if c1 < 1.10 or c1 > 4.50 or c2 < 1.10 or c2 > 4.50 then raise exception 'FALLO: cuota de ronda fuera de 1,10 a 4,50 (%): %', format('%s-%s %s-%s', hs, aw, pr, n0), q; end if;
    if p * c1 > 0.905 or (1 - p) * c2 > 0.905 then raise exception 'FALLO: la casa no se queda su margen en la ronda (% %-% rondas %-%): p=% c1=% c2=%', 'mapas', hs, aw, pr, n0, p, c1, c2; end if;
    k := k + 1;
  end loop; end loop; end loop; end loop;
  perform sync_ex_live_put(sec, '[{"match":"zz:vlr","data":{"k":"s","a":0,"b":0,"bo":3,"ra":0,"rb":0}}]');
  q := ex_pred_cuotas(mm);
  if (q->>'c1')::numeric >= (q->>'c2')::numeric then raise exception 'FALLO: el favorito (1,50 contra 2,60) debe pagar menos: %', q; end if;
  if 1 / (q->>'c1')::numeric + 1 / (q->>'c2')::numeric < 1.10 then raise exception 'FALLO: la ronda no tiene margen de la casa del 10 por ciento: %', q; end if;
  perform sync_ex_live_put(sec, '[{"match":"zz:vlr","data":{"k":"s","a":0,"b":0,"bo":3,"ra":1,"rb":5}}]');
  c1 := (ex_pred_cuotas(mm)->>'c1')::numeric;
  r := ex_pred_ronda('zz:vlr', 'Ascent', 7, '1', 10, c1 - 0.03); pid := (r->>'id')::bigint;
  if (r->>'odds')::numeric <> c1 - 0.03 or (select odds from ex_pred where id = pid) <> c1 - 0.03 then raise exception 'FALLO: la cuota de la ronda no queda congelada'; end if;
  fallo := false; begin perform ex_pred_ronda('zz:vlr', 'Ascent', 8, '1', 10, c1); exception when others then fallo := true; get stacked diagnostics msg = message_text; end;
  if not fallo or msg not like 'Ya tienes una predicción abierta%' then raise exception 'FALLO: dos rondas abiertas a la vez en el mismo partido (%)', msg; end if;
  perform sync_ex_pred_resolve(sec, jsonb_build_array(jsonb_build_object('id', pid, 'res', 'won', 'ev', 'prueba')));
  fallo := false; begin perform ex_pred_ronda('zz:vlr', 'Ascent', 8, '1', 10, c1); exception when others then fallo := true; get stacked diagnostics msg = message_text; end;
  if not fallo or msg not like 'La siguiente predicción en este partido, en%' then raise exception 'FALLO: la ronda no espera 5 minutos tras la anterior (%)', msg; end if;
  update ex_pred set placed_at = now() - interval '6 minutes' where id = pid;
  perform ex_pred_ronda('zz:vlr', 'Ascent', 8, '1', 10, c1);
  fallo := false; begin perform ex_pred_ronda('zz:vlr', 'Ascent', 9, '2', 10, 4.50); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: la ronda acepta una cuota que no es la actual'; end if;
  resumen := resumen || format('Ronda de Valorant: %s marcadores con margen, entre 1,10 y 4,50, congelada, una abierta y espera. ', k);

  -- =========================================================== LAS VIEJAS ABIERTAS SE RESUELVEN IGUAL
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[3]), true);
  bal0 := (select coalesce(sum(amount), 0) from ledger where player = jug[3]);
  insert into ex_pred(player, match_id, kind, pick, stake, odds, placed_at, win_from, win_to)
    values (jug[3], 'zz:fut', 'gol', 'no', 100, 1.25, now() - interval '20 minutes', now() - interval '17 minutes', now() - interval '7 minutes') returning id into pid;
  insert into ex_pred(player, match_id, kind, pick, ref, n, stake, odds, placed_at)
    values (jug[3], 'zz:vlr', 'ronda', '2', 'bind', 5, 40, 1.90, now() - interval '30 minutes') returning id into pid2;
  insert into ex_pred(player, match_id, kind, pick, stake, odds, placed_at, win_from, win_to)
    values (jug[3], 'zz:fut2', 'gol', 'si', 30, 3.00, now() - interval '25 minutes', now() - interval '22 minutes', now() - interval '12 minutes');
  if jsonb_array_length(sync_ex_pred_pending(sec)) < 3 then raise exception 'FALLO: el sincronizador no ve las predicciones viejas abiertas'; end if;
  n0 := sync_ex_pred_resolve(sec, jsonb_build_array(
    jsonb_build_object('id', pid, 'res', 'won', 'ev', 'prueba vieja'),
    jsonb_build_object('id', pid2, 'res', 'lost', 'ev', 'prueba vieja'),
    jsonb_build_object('id', (select id from ex_pred where player = jug[3] and match_id = 'zz:fut2'), 'res', 'void', 'ev', 'prueba vieja')));
  if n0 <> 3 then raise exception 'FALLO: se resolvieron % de 3 viejas', n0; end if;
  if (select payout from ex_pred where id = pid) <> 125 or (select status from ex_pred where id = pid2) <> 'lost' then raise exception 'FALLO: la vieja ganada no paga 100 x 1,25 = 125'; end if;
  if (select coalesce(sum(amount), 0) from ledger where player = jug[3]) <> bal0 + 125 + 30 then raise exception 'FALLO: saldo tras resolver viejas (ganada 125 + devuelta 30): esperaba %, hay %', bal0 + 155, (select coalesce(sum(amount), 0) from ledger where player = jug[3]); end if;
  -- y con una vieja abierta el jugador no puede abrir otra (cuenta como abierta)
  insert into ex_pred(player, match_id, kind, pick, stake, odds, placed_at, win_from, win_to)
    values (jug[3], 'zz:fut', 'gol', 'si', 10, 3.00, now() - interval '10 minutes', now() - interval '7 minutes', now() + interval '3 minutes');
  begin perform ex_pred_gol('zz:fut', 'no', 10); fallo := false; exception when others then fallo := true; get stacked diagnostics msg = message_text; end;
  if not fallo or msg not like 'Ya tienes una predicción abierta%' then raise exception 'FALLO: una vieja abierta no cuenta como abierta (%)', msg; end if;
  resumen := resumen || 'Las viejas abiertas se resuelven igual (gana 125 de 100 a 1,25, pierde, devuelta). ';

  -- =========================================================== SEGURIDAD
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[2]), true);
  set local role authenticated;
  begin perform ex_pred_cuotas((select m from matches m limit 1)); fallo := false; exception when insufficient_privilege then fallo := true; end;
  if not fallo then reset role; raise exception 'FALLO: un jugador puede llamar a ex_pred_cuotas'; end if;
  begin perform ex_pred_espera(jug[1], 'zz:fut'); fallo := false; exception when insufficient_privilege then fallo := true; end;
  if not fallo then reset role; raise exception 'FALLO: un jugador puede mirar la espera de otro (ex_pred_espera)'; end if;
  begin perform ex_pred_puede(jug[1], 'zz:fut'); fallo := false; exception when insufficient_privilege then fallo := true; end;
  if not fallo then reset role; raise exception 'FALLO: un jugador puede llamar a ex_pred_puede'; end if;
  r := ex_pred_estado();
  if r->'mine' is null then reset role; raise exception 'FALLO: el jugador no puede ver su estado'; end if;
  reset role;
  set local role anon;
  begin perform ex_pred_gol('zz:fut', 'si', 1); fallo := false; exception when insufficient_privilege then fallo := true; end;
  if not fallo then reset role; raise exception 'FALLO: alguien sin cuenta puede predecir'; end if;
  begin perform ex_pred_estado(); fallo := false; exception when insufficient_privilege then fallo := true; end;
  if not fallo then reset role; raise exception 'FALLO: alguien sin cuenta ve el estado de las predicciones'; end if;
  reset role;
  begin perform sync_ex_pred_resolve('clave-mala', '[]'); fallo := false; exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: sync_ex_pred_resolve entra con clave mala'; end if;
  resumen := resumen || 'Lo interno esta cerrado a los jugadores.';

  raise exception 'PRUEBA SUPERADA (se deshace todo): %', resumen;
end $$;
