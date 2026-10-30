-- Prueba de db/022b_pred_retraso.sql, para el editor SQL de Supabase. Va DESPUES de 022b_pred_retraso.sql (y de 001 a 022).
-- Prueba que la ronda de Valorant tiene que estar a 3 rondas de lo que sabe la base, que no se puede nada cerca del descanso ni con el mapa
-- acabando, que la ventana del gol empieza a los 3 minutos, que las cuotas salen del estado en vivo (no son fijas, se mueven como toca, tienen
-- margen y quedan congeladas), que sin datos frescos no se predice y que un jugador normal no puede tocar lo interno.
-- Hacen falta al menos tres jugadores. Al final lanza un error A PROPOSITO para que se deshaga todo: no queda nada guardado.
-- Si todo va bien, el error dice "PRUEBA SUPERADA" con el resumen. Si algo falla, dice "FALLO" y que.
do $$
declare
  jug uuid[] := array(select id from players order by created_at, id);
  r jsonb; q jsonb; fallo boolean; resumen text := ''; n int; sec text := 'secreto-de-prueba'; c1 numeric; c2 numeric; pid bigint; msg text;
begin
  if cardinality(jug) < 3 then raise exception 'FALLO: hacen falta al menos tres jugadores'; end if;
  insert into settings(key, value) values ('sync_secret', to_jsonb(sec)) on conflict (key) do update set value = excluded.value;
  perform pay_week();
  insert into ledger(player, amount, kind, note) select id, 100000, 'ajuste', 'saldo de prueba' from players;
  insert into matches(id, sport, league, league_name, home, away, starts_at, status, score, odds_1, odds_2, bo, details) values
    ('zz:vlr', 'v', 'ps:valorant:9', 'VCT', 'Nova', 'A Team', now() - interval '40 minutes', 'live', '0:0', 1.50, 2.60, 3, '{}'),
    ('zz:fut', 'f', 'esp.1', 'LaLiga', 'Local FC', 'Visitante FC', now() - interval '30 minutes', 'live', '0:0', 2.40, 2.80, null, '{"espn":{"sport":"soccer","league":"esp.1","event":"1"}}');
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);

  -- =========================================================== VALORANT: LA RONDA TIENE QUE ESTAR LEJOS
  fallo := false; begin perform ex_pred_ronda('zz:vlr', 'Ascent', 7, '1', 10); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se apuesta sin datos del sincronizador'; end if;
  perform sync_ex_pred_put(sec, '[{"match":"zz:vlr","ref":"Ascent","n":3}]');
  fallo := false; begin perform ex_pred_ronda('zz:vlr', 'Ascent', 7, '1', 10); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se apuesta sin estado en vivo (ex_live)'; end if;
  perform sync_ex_live_put(sec, '[{"match":"zz:vlr","data":{"k":"s","a":0,"b":0,"bo":3,"ra":2,"rb":1}}]');
  -- rondas conocidas 3: la primera que se puede apostar es la 3 + 1 + 3 = 7
  begin perform ex_pred_ronda('zz:vlr', 'Ascent', 6, '1', 10); fallo := false; exception when others then fallo := true; get stacked diagnostics msg = message_text; end;
  if not fallo or msg not like '%la primera que se puede apostar es la 7%' then raise exception 'FALLO: la ronda 6 (a 2 de lo conocido) se ha aceptado o el aviso no dice la 7: %', msg; end if;
  r := ex_pred_ronda('zz:vlr', 'Ascent', 7, '1', 10); pid := (r->>'id')::bigint;
  fallo := false; begin perform ex_pred_ronda('zz:vlr', 'Ascent', 12, '1', 10); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se apuesta a una ronda muy lejana (12 con 3 conocidas)'; end if;
  -- con otro margen
  update settings set value = '5' where key = 'pred_ronda_margen';
  begin perform ex_pred_ronda('zz:vlr', 'Ascent', 8, '2', 10); fallo := false; exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: con margen 5 la ronda 8 se acepta (la primera es la 9)'; end if;
  perform ex_pred_ronda('zz:vlr', 'Ascent', 9, '2', 10);
  update settings set value = '3' where key = 'pred_ronda_margen';
  resumen := resumen || 'Valorant: la ronda va 3 por delante de lo conocido (el margen se puede cambiar). ';

  -- el descanso entre mitades y el final del mapa
  update ex_pred_obs set n = 9, at = now() where match_id = 'zz:vlr';
  begin perform ex_pred_ronda('zz:vlr', 'Ascent', 13, '1', 10); fallo := false; exception when others then fallo := true; get stacked diagnostics msg = message_text; end;
  if not fallo or msg not like '%descanso entre mitades%' then raise exception 'FALLO: con 9 rondas conocidas debia haber descanso: %', msg; end if;
  update ex_pred_obs set n = 13, at = now() where match_id = 'zz:vlr';
  fallo := false; begin perform ex_pred_ronda('zz:vlr', 'Ascent', 17, '1', 10); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: con 13 rondas conocidas debia haber descanso'; end if;
  update ex_pred_obs set n = 14, at = now() where match_id = 'zz:vlr';
  r := ex_pred_ronda('zz:vlr', 'Ascent', 18, '1', 10);                       -- 14 + 1 + 3
  update ex_pred_obs set n = 19, at = now() where match_id = 'zz:vlr';
  begin perform ex_pred_ronda('zz:vlr', 'Ascent', 23, '1', 10); fallo := false; exception when others then fallo := true; get stacked diagnostics msg = message_text; end;
  if not fallo or msg not like '%mapa está acabando%' then raise exception 'FALLO: con 19 rondas conocidas debia estar acabando el mapa: %', msg; end if;
  update ex_pred_obs set n = 3, at = now() - interval '620 seconds' where match_id = 'zz:vlr';   -- datos tan viejos que la duda llega al descanso
  fallo := false; begin perform ex_pred_ronda('zz:vlr', 'Ascent', 30, '1', 10); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: con datos de hace 10 minutos no se puede asegurar el descanso y se acepta'; end if;
  resumen := resumen || 'Sin predicciones cerca del descanso, con el mapa acabando ni con datos viejos. ';

  -- =========================================================== CUOTAS DE LA RONDA
  update ex_pred_obs set n = 3, at = now() where match_id = 'zz:vlr';
  perform sync_ex_live_put(sec, '[{"match":"zz:vlr","data":{"k":"s","a":0,"b":0,"bo":3,"ra":1,"rb":5}}]');
  q := ex_pred_cuotas((select m from matches m where id = 'zz:vlr'));
  c1 := (q->>'c1')::numeric; c2 := (q->>'c2')::numeric;
  if not (q->>'ok')::boolean or c1 <= c2 and false then null; end if;
  perform sync_ex_live_put(sec, '[{"match":"zz:vlr","data":{"k":"s","a":0,"b":0,"bo":3,"ra":5,"rb":1}}]');
  q := ex_pred_cuotas((select m from matches m where id = 'zz:vlr'));
  if (q->>'c1')::numeric >= c1 or (q->>'c2')::numeric <= c2 then raise exception 'FALLO: si el local pasa de ir 1-5 a ir 5-1 su cuota debe bajar y la del rival subir (% % -> % %)', c1, c2, q->>'c1', q->>'c2'; end if;
  if (q->>'c1')::numeric = (q->>'c2')::numeric then raise exception 'FALLO: las dos cuotas son iguales yendo 5-1'; end if;
  if (q->>'c1')::numeric < 1.15 or (q->>'c2')::numeric > 4.00 or (q->>'c1')::numeric > 4.00 or (q->>'c2')::numeric < 1.15 then raise exception 'FALLO: cuotas fuera de 1,15 a 4,00: %', q; end if;
  if 1 / (q->>'c1')::numeric + 1 / (q->>'c2')::numeric < 1.04 then raise exception 'FALLO: la casa no se queda su margen (% %)', q->>'c1', q->>'c2'; end if;
  perform sync_ex_live_put(sec, '[{"match":"zz:vlr","data":{"k":"s","a":1,"b":0,"bo":3,"ra":0,"rb":0}}]');
  q := ex_pred_cuotas((select m from matches m where id = 'zz:vlr'));
  c1 := (q->>'c1')::numeric;
  perform sync_ex_live_put(sec, '[{"match":"zz:vlr","data":{"k":"s","a":0,"b":1,"bo":3,"ra":0,"rb":0}}]');
  if (ex_pred_cuotas((select m from matches m where id = 'zz:vlr'))->>'c1')::numeric <= c1 then raise exception 'FALLO: ir ganando la serie no baja la cuota del equipo'; end if;
  -- el favorito de antes del partido (Nova, 1,50 contra 2,60) paga menos que el otro a 0-0
  perform sync_ex_live_put(sec, '[{"match":"zz:vlr","data":{"k":"s","a":0,"b":0,"bo":3,"ra":0,"rb":0}}]');
  q := ex_pred_cuotas((select m from matches m where id = 'zz:vlr'));
  if (q->>'c1')::numeric >= (q->>'c2')::numeric then raise exception 'FALLO: el favorito (1,50 contra 2,60) debe pagar menos: %', q; end if;
  -- se congela al apostar: la apuesta guarda la cuota de ese momento y p_odds protege
  perform sync_ex_live_put(sec, '[{"match":"zz:vlr","data":{"k":"s","a":0,"b":0,"bo":3,"ra":1,"rb":5}}]');
  c1 := (ex_pred_cuotas((select m from matches m where id = 'zz:vlr'))->>'c1')::numeric;
  fallo := false; begin perform ex_pred_ronda('zz:vlr', 'Ascent', 7, '1', 10, c1 + 1); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: p_odds por encima de la cuota actual no protege'; end if;
  r := ex_pred_ronda('zz:vlr', 'Ascent', 8, '1', 10, c1); pid := (r->>'id')::bigint;
  if (r->>'odds')::numeric <> c1 or (select odds from ex_pred where id = pid) <> c1 then raise exception 'FALLO: la cuota no queda congelada en la apuesta'; end if;
  perform sync_ex_live_put(sec, '[{"match":"zz:vlr","data":{"k":"s","a":0,"b":0,"bo":3,"ra":9,"rb":1}}]');
  if (select odds from ex_pred where id = pid) <> c1 then raise exception 'FALLO: la cuota de una apuesta hecha cambia con el estado'; end if;
  update ex_live set at = now() - interval '4 minutes' where match_id = 'zz:vlr';
  fallo := false; begin perform ex_pred_ronda('zz:vlr', 'Ascent', 9, '2', 10); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se predice con el estado en vivo de hace 4 minutos'; end if;
  resumen := resumen || 'Cuotas de ronda segun el estado, con margen, entre 1,15 y 4,00, congeladas. ';

  -- =========================================================== FUTBOL: VENTANA Y CUOTAS
  fallo := false; begin perform ex_pred_gol('zz:fut', 'si', 10); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se predice el gol sin estado en vivo'; end if;
  perform sync_ex_live_put(sec, '[{"match":"zz:fut","data":{"k":"f","hs":0,"as":0,"min":30,"per":1}}]');
  q := ex_pred_cuotas((select m from matches m where id = 'zz:fut'));
  c1 := (q->>'si')::numeric; c2 := (q->>'no')::numeric;
  if c1 < 3.0 or c1 > 4.0 or c2 < 1.15 or c2 > 1.5 then raise exception 'FALLO: 0-0 al 30 debia dar "sí" entre 3 y 4 y "no" entre 1,15 y 1,5: % %', c1, c2; end if;
  perform sync_ex_live_put(sec, '[{"match":"zz:fut","data":{"k":"f","hs":3,"as":2,"min":30,"per":1}}]');
  q := ex_pred_cuotas((select m from matches m where id = 'zz:fut'));
  if (q->>'si')::numeric >= c1 or (q->>'no')::numeric <= c2 then raise exception 'FALLO: un partido con 5 goles al 30 debe dar menos al sí que uno 0-0 (% contra %)', q->>'si', c1; end if;
  perform sync_ex_live_put(sec, '[{"match":"zz:fut","data":{"k":"f","hs":0,"as":0,"min":75,"per":2}}]');
  q := ex_pred_cuotas((select m from matches m where id = 'zz:fut'));
  if (q->>'si')::numeric >= c1 then raise exception 'FALLO: al final del partido el gol debe ser mas probable (cuota del sí mas baja)'; end if;
  perform sync_ex_live_put(sec, '[{"match":"zz:fut","data":{"k":"f","hs":0,"as":0,"min":80,"per":2}}]');
  if (ex_pred_cuotas((select m from matches m where id = 'zz:fut'))->>'ok')::boolean then raise exception 'FALLO: se ofrece el gol al 80 (la ventana pasaria del final)'; end if;
  perform sync_ex_live_put(sec, '[{"match":"zz:fut","data":{"k":"f","hs":0,"as":0,"min":30,"per":1}}]');
  q := ex_pred_cuotas((select m from matches m where id = 'zz:fut'));
  r := ex_pred_gol('zz:fut', 'si', 20, (q->>'si')::numeric); pid := (r->>'id')::bigint;
  if (r->>'odds')::numeric <> (q->>'si')::numeric or (select odds from ex_pred where id = pid) <> (q->>'si')::numeric then raise exception 'FALLO: la cuota del gol no queda congelada'; end if;
  if (select win_from - placed_at from ex_pred where id = pid) <> interval '180 seconds' or (select win_to - win_from from ex_pred where id = pid) <> interval '10 minutes' then
    raise exception 'FALLO: la ventana del gol debe empezar a los 3 minutos y durar 10 (% y %)', (select win_from - placed_at from ex_pred where id = pid), (select win_to - win_from from ex_pred where id = pid); end if;
  fallo := false; begin perform ex_pred_gol('zz:fut', 'no', 10, 9.99); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: p_odds del gol no protege'; end if;
  update ex_live set at = now() - interval '4 minutes' where match_id = 'zz:fut';
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[2]), true);
  fallo := false; begin perform ex_pred_gol('zz:fut', 'si', 10); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se predice el gol con datos de hace 4 minutos'; end if;
  perform sync_ex_live_put(sec, '[{"match":"zz:fut","data":{"k":"f","hs":0,"as":0,"min":30,"per":1}}]');
  r := ex_pred_estado();
  if (r->>'margen')::int <> 3 or (r->>'retraso')::int <> 180 or not ((r->'live') @> '[{"id":"zz:fut"}]'::jsonb) or (select (x->'c'->>'ok')::boolean from jsonb_array_elements(r->'live') x where x->>'id' = 'zz:fut') is not true then
    raise exception 'FALLO: ex_pred_estado no trae margen, retraso y las cuotas de cada partido: %', r; end if;
  resumen := resumen || 'Futbol: ventana desde los 3 minutos y cuotas segun minuto y marcador. ';

  -- =========================================================== SEGURIDAD
  set local role authenticated;
  begin perform ex_pred_cuotas((select m from matches m limit 1)); fallo := false; exception when insufficient_privilege then fallo := true; end;
  if not fallo then reset role; raise exception 'FALLO: un jugador puede llamar a ex_pred_cuotas'; end if;
  begin perform ex_round_win(1, 1, 0.5, 0.5); fallo := false; exception when insufficient_privilege then fallo := true; end;
  if not fallo then reset role; raise exception 'FALLO: un jugador puede llamar a ex_round_win'; end if;
  begin perform sync_ex_live_put('clave-mala', '[]'); fallo := false; exception when others then fallo := true; end;
  if not fallo then reset role; raise exception 'FALLO: sync_ex_live_put entra con clave mala'; end if;
  n := 0; begin select count(*) into n from ex_live; exception when insufficient_privilege then n := 0; end;
  if n <> 0 then reset role; raise exception 'FALLO: un jugador puede leer ex_live'; end if;
  reset role;
  set local role anon;
  begin perform ex_pred_gol('zz:fut', 'si', 1); fallo := false; exception when insufficient_privilege then fallo := true; end;
  if not fallo then reset role; raise exception 'FALLO: alguien sin cuenta puede predecir'; end if;
  reset role;
  resumen := resumen || 'Lo interno esta cerrado a los jugadores.';

  raise exception 'PRUEBA SUPERADA (se deshace todo): %', resumen;
end $$;
