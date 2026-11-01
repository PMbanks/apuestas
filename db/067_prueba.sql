-- Prueba de db/067_parlay_mismo_partido.sql, para el editor SQL de Supabase. Va DESPUES de 067.
-- Partidos de mentira y los jugadores de verdad (5 o mas): la tabla de compatibilidad entera (cada familia contra cada otra, en
-- futbol, series, NBA, F1 y UFC), la cuota con el recorte exacta (redondeo incluido), el tope de 3 por partido, la cuota que no pasa
-- de 1, una combinada de tres partidos con dos apuestas en uno (gana, pierde, anulada), el recorte que se quita cuando una del mismo
-- partido se anula, nunca menos de lo apostado por acertar, el cash out (sin el con dos del mismo partido por resolver, con el cuando
-- ese partido acaba) y que sin partidos repetidos todo es igual que antes. Al final lanza un error A PROPOSITO para que se deshaga
-- todo. Si todo va bien, el error dice "PRUEBA SUPERADA" con el resumen.
do $$
declare
  jug uuid[] := array(select id from players order by created_at, id);
  sec text := (select value #>> '{}' from settings where key = 'sync_secret');
  saldo constant text := 'select coalesce(sum(amount), 0)::int from ledger where player = $1';
  r jsonb; q jsonb; s0 int; s1 int; ok boolean; err text; resumen text := ''; n int := 0; nok int := 0; nko int := 0;
  c1 bigint; c2 bigint; c3 bigint; c4 bigint; c5 bigint; c6 bigint; c7 bigint; o numeric; o1 numeric; o2 numeric; v numeric;
  casos jsonb := '[
    {"m":"zz:pf","p":"1","q":"X","ok":false,"y":"mismo mercado"},   {"m":"zz:pf","p":"1","q":"2","ok":false,"y":"mismo mercado"},
    {"m":"zz:pf","p":"X","q":"2","ok":false,"y":"mismo mercado"},   {"m":"zz:pf","p":"1","q":"1","ok":false,"y":"misma apuesta"},
    {"m":"zz:pf","p":"O1.5","q":"O2.5","ok":false,"y":"mismo mercado"}, {"m":"zz:pf","p":"O2.5","q":"U3.5","ok":false,"y":"mismo mercado"},
    {"m":"zz:pf","p":"O2.5","q":"U2.5","ok":false,"y":"mismo mercado"}, {"m":"zz:pf","p":"GG","q":"NG","ok":false,"y":"mismo mercado"},
    {"m":"zz:pf","p":"1","q":"GG","ok":true},   {"m":"zz:pf","p":"2","q":"GG","ok":true},   {"m":"zz:pf","p":"X","q":"NG","ok":true},
    {"m":"zz:pf","p":"GG","q":"1","ok":true},   {"m":"zz:pf","p":"NG","q":"X","ok":true},
    {"m":"zz:pf","p":"1","q":"NG","ok":false,"y":"unidas"},  {"m":"zz:pf","p":"2","q":"NG","ok":false,"y":"unidas"},  {"m":"zz:pf","p":"X","q":"GG","ok":false,"y":"unidas"},
    {"m":"zz:pf","p":"X","q":"O1.5","ok":true}, {"m":"zz:pf","p":"X","q":"O2.5","ok":true}, {"m":"zz:pf","p":"O3.5","q":"X","ok":true},
    {"m":"zz:pf","p":"X","q":"U1.5","ok":false,"y":"unidas"}, {"m":"zz:pf","p":"X","q":"U2.5","ok":false,"y":"unidas"}, {"m":"zz:pf","p":"X","q":"U3.5","ok":false,"y":"unidas"},
    {"m":"zz:pf","p":"1","q":"O2.5","ok":false,"y":"unidas"}, {"m":"zz:pf","p":"1","q":"U2.5","ok":false,"y":"unidas"}, {"m":"zz:pf","p":"2","q":"O1.5","ok":false,"y":"unidas"},
    {"m":"zz:pf","p":"U3.5","q":"2","ok":false,"y":"unidas"}, {"m":"zz:pf","p":"1","q":"O3.5","ok":false,"y":"unidas"},
    {"m":"zz:pf","p":"GG","q":"O2.5","ok":false,"y":"unidas"}, {"m":"zz:pf","p":"GG","q":"U1.5","ok":false,"y":"unidas"}, {"m":"zz:pf","p":"O1.5","q":"GG","ok":false,"y":"unidas"},
    {"m":"zz:pf","p":"NG","q":"U2.5","ok":false,"y":"unidas"}, {"m":"zz:pf","p":"NG","q":"O3.5","ok":false,"y":"unidas"},
    {"m":"zz:ps","p":"1","q":"2","ok":false,"y":"mismo mercado"},        {"m":"zz:ps","p":"1","q":"S2-0","ok":false,"y":"mismo mercado"},
    {"m":"zz:ps","p":"1","q":"H1+1.5","ok":false,"y":"mismo mercado"},   {"m":"zz:ps","p":"2","q":"H1+1.5","ok":false,"y":"mismo mercado"},
    {"m":"zz:ps","p":"1","q":"MO2.5","ok":false,"y":"mismo mercado"},    {"m":"zz:ps","p":"MU2.5","q":"2","ok":false,"y":"mismo mercado"},
    {"m":"zz:ps","p":"S2-1","q":"MO2.5","ok":false,"y":"mismo mercado"}, {"m":"zz:ps","p":"H1+1.5","q":"MU2.5","ok":false,"y":"mismo mercado"},
    {"m":"zz:ps","p":"S2-0","q":"S2-1","ok":false,"y":"mismo mercado"},  {"m":"zz:ps","p":"H1+1.5","q":"H2+1.5","ok":false,"y":"mismo mercado"},
    {"m":"zz:ps","p":"S1-2","q":"H2+1.5","ok":false,"y":"mismo mercado"},
    {"m":"zz:ps","p":"1","q":"W1-1","ok":false,"y":"unidas"},  {"m":"zz:ps","p":"W2-1","q":"2","ok":false,"y":"unidas"},  {"m":"zz:ps","p":"S2-0","q":"W1-1","ok":false,"y":"unidas"},
    {"m":"zz:ps","p":"H2+1.5","q":"W3-2","ok":false,"y":"unidas"}, {"m":"zz:ps","p":"MO2.5","q":"W3-1","ok":false,"y":"unidas"}, {"m":"zz:ps","p":"W2-2","q":"MU2.5","ok":false,"y":"unidas"},
    {"m":"zz:ps","p":"W1-1","q":"W1-2","ok":false,"y":"mismo mercado"},
    {"m":"zz:ps","p":"W1-1","q":"W2-1","ok":true}, {"m":"zz:ps","p":"W1-2","q":"W3-1","ok":true}, {"m":"zz:ps","p":"W3-2","q":"W2-2","ok":true},
    {"m":"zz:pn","p":"1","q":"2","ok":false,"y":"mismo mercado"},  {"m":"zz:pn","p":"1","q":"SP1-5.5","ok":false,"y":"unidas"}, {"m":"zz:pn","p":"SP2+5.5","q":"2","ok":false,"y":"unidas"},
    {"m":"zz:pn","p":"1","q":"TO220.5","ok":true}, {"m":"zz:pn","p":"TU220.5","q":"2","ok":true}, {"m":"zz:pn","p":"SP1-5.5","q":"TU220.5","ok":true},
    {"m":"zz:pn","p":"SP1-5.5","q":"SP2+5.5","ok":false,"y":"mismo mercado"}, {"m":"zz:pn","p":"TO220.5","q":"TU220.5","ok":false,"y":"mismo mercado"},
    {"m":"zz:pn","p":"J1:100:PO25.5","q":"J1:100:RO7.5","ok":false,"y":"mismo jugador"}, {"m":"zz:pn","p":"J1:100:PO25.5","q":"J2:200:PO22.5","ok":true},
    {"m":"zz:pn","p":"J1:100:PO25.5","q":"1","ok":false,"y":"unidas"}, {"m":"zz:pn","p":"J2:200:PO22.5","q":"SP2+5.5","ok":false,"y":"unidas"},
    {"m":"zz:pn","p":"TO220.5","q":"J1:300:AO6.5","ok":false,"y":"unidas"},
    {"m":"zz:pr","p":"FW:lando_norris","q":"FP:max_verstappen","ok":false,"y":"Gran Premio"},
    {"m":"zz:pu","p":"1","q":"2","ok":false,"y":"mismo mercado"}
  ]';
  cs jsonb;
begin
  if cardinality(jug) < 5 then raise exception 'FALLO: hacen falta 5 jugadores de verdad y hay %', cardinality(jug); end if;
  if sec is null then raise exception 'FALLO: no esta el secreto del sincronizador en settings'; end if;
  insert into ledger(player, amount, kind, note) select id, 100000, 'ajuste', 'saldo de prueba' from players;
  insert into matches(id, sport, league, league_name, home, away, starts_at, status, odds_1, odds_x, odds_2, bo, details, odds_mk) values
    ('zz:pf', 'f', 'zz', 'Prueba', 'Local', 'Visita', now() + interval '3 hours', 'scheduled', 2.00, 3.40, 3.60, null, '{}',
     '{"O1.5":1.30,"U1.5":3.40,"O2.5":1.90,"U2.5":1.95,"O3.5":3.10,"U3.5":1.38,"GG":1.80,"NG":2.00}'),
    ('zz:ps', 'v', 'zz', 'Prueba', 'FaZe', 'FURIA', now() + interval '3 hours', 'scheduled', 1.60, null, 2.40, 3, '{"mt":"best_of","ids":{"a":101,"b":202}}',
     '{"S2-0":2.80,"S2-1":4.50,"S1-2":5.50,"S0-2":6.00,"H1+1.5":1.25,"H2+1.5":1.70,"MO2.5":2.10,"MU2.5":1.75,"W1-1":1.70,"W1-2":2.15,"W2-1":1.70,"W2-2":2.15,"W3-1":1.70,"W3-2":2.15}'),
    ('zz:p5', 'c', 'zz', 'Prueba', 'NAVI', 'Vitality', now() + interval '3 hours', 'scheduled', 2.10, null, 1.75, 5, '{"mt":"best_of","ids":{"a":31,"b":32}}',
     '{"W1-1":2.00,"W2-1":2.00,"W3-2":2.00,"W4-1":2.00,"W5-1":2.00}'),
    ('zz:pn', 'b', 'nba', 'NBA', 'Celtics', 'Knicks', now() + interval '3 hours', 'scheduled', 1.50, null, 2.60, null, '{"pj":{"100":"Jayson Tatum","200":"Jalen Brunson","300":"Derrick White"}}',
     '{"SP1-5.5":1.90,"SP2+5.5":1.90,"TO220.5":1.90,"TU220.5":1.90,"J1:100:PO25.5":1.85,"J1:100:RO7.5":1.90,"J2:200:PO22.5":1.90,"J1:300:AO6.5":1.80}'),
    ('zz:pr', 'r', 'f1', 'Fórmula 1', 'Gran Premio de Prueba', 'Carrera', now() + interval '3 hours', 'scheduled', null, null, null, null,
     '{"kind":"race","gp":"2099-1","dr":{"lando_norris":"Lando Norris","max_verstappen":"Max Verstappen"}}', '{"FW:lando_norris":3.00,"FP:max_verstappen":1.80}'),
    ('zz:pu', 'u', 'ufc', 'UFC', 'Peleador A', 'Peleador B', now() + interval '3 hours', 'scheduled', 1.70, null, 2.20, null, '{}', null),
    -- para pagar: tres de futbol, una serie y otro de futbol para el resto de la combinada
    ('zz:fa', 'f', 'zz', 'Prueba', 'A Local', 'A Visita', now() + interval '3 hours', 'scheduled', 1.80, 3.50, 4.20, null, '{}', '{"GG":1.90,"NG":1.95,"O2.5":2.00,"U2.5":1.85}'),
    ('zz:fb', 'f', 'zz', 'Prueba', 'B Local', 'B Visita', now() + interval '3 hours', 'scheduled', 1.80, 3.50, 4.20, null, '{}', '{"GG":1.90,"NG":1.95}'),
    ('zz:fc', 'f', 'zz', 'Prueba', 'C Local', 'C Visita', now() + interval '3 hours', 'scheduled', 1.80, 3.50, 4.20, null, '{}', '{"GG":1.90,"NG":1.95}'),
    ('zz:fd', 'f', 'zz', 'Prueba', 'D Local', 'D Visita', now() + interval '3 hours', 'scheduled', 2.00, 3.30, 3.40, null, '{}', null),
    ('zz:fe', 'f', 'zz', 'Prueba', 'E Local', 'E Visita', now() + interval '3 hours', 'scheduled', 3.00, 3.30, 2.30, null, '{}', null),
    ('zz:fg', 'f', 'zz', 'Prueba', 'G Local', 'G Visita', now() + interval '3 hours', 'scheduled', 1.85, 3.30, 4.00, null, '{}', null),
    ('zz:fh', 'f', 'zz', 'Prueba', 'H Local', 'H Visita', now() + interval '3 hours', 'scheduled', 2.10, 3.30, 3.40, null, '{}', null),
    ('zz:fi', 'f', 'zz', 'Prueba', 'I Local', 'I Visita', now() + interval '3 hours', 'scheduled', 1.33, 4.50, 8.00, null, '{}', null),
    ('zz:sm', 'v', 'zz', 'Prueba', 'Sen', 'Prx', now() + interval '3 hours', 'scheduled', 1.20, null, 4.00, 3, '{"mt":"best_of","ids":{"a":11,"b":22}}',
     '{"W1-1":1.05,"W2-1":1.06,"W3-1":1.40,"W1-2":6.00}'),
    ('zz:sx', 'v', 'zz', 'Prueba', 'X A', 'X B', now() + interval '3 hours', 'scheduled', 1.40, null, 2.80, 3, '{"mt":"best_of","ids":{"a":61,"b":62}}',
     '{"W1-1":1.40,"W2-1":1.50,"W3-1":1.60}');
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  perform pay_week();                                        -- la paga de la semana, si toca, antes de contar el saldo

  -- ---------- la tabla de compatibilidad, entera ----------
  execute saldo into s0 using jug[1];
  for cs in select * from jsonb_array_elements(casos) loop
    n := n + 1; ok := true; err := '';
    begin
      r := place_combo(jsonb_build_array(jsonb_build_object('match', cs->>'m', 'pick', cs->>'p'), jsonb_build_object('match', cs->>'m', 'pick', cs->>'q')), 10);
    exception when others then ok := false; err := sqlerrm;
    end;
    if ok <> (cs->>'ok')::boolean then
      raise exception 'FALLO: % + % en % deberia % y %', cs->>'p', cs->>'q', cs->>'m', case when (cs->>'ok')::boolean then 'entrar' else 'rechazarse' end,
        case when ok then 'ha entrado' else 'dice: ' || err end;
    end if;
    if ok then
      nok := nok + 1;
      select mk_cuota(m, cs->>'p'), mk_cuota(m, cs->>'q') into o1, o2 from matches m where m.id = cs->>'m';
      o := round(o1 * o2 * 0.85, 2);
      if (r->>'odds')::numeric <> o or (select odds from combos where id = (r->>'combo')::bigint) <> o then
        raise exception 'FALLO: % + % deberia ir a % (% x % x 0,85) y va a %', cs->>'p', cs->>'q', o, o1, o2, r->>'odds'; end if;
      if (select count(*) from combo_legs where combo_id = (r->>'combo')::bigint and match_id = cs->>'m') <> 2 then raise exception 'FALLO: no se guardan las dos patas del mismo partido'; end if;
      perform cancel_combo((r->>'combo')::bigint);
    else
      nko := nko + 1;
      if err not like '%' || (cs->>'y') || '%' or (cs->>'y' <> 'Gran Premio' and err not like 'No se pueden combinar %') then
        raise exception 'FALLO: % + % se rechaza con un mensaje que no toca: %', cs->>'p', cs->>'q', err; end if;
    end if;
  end loop;
  execute saldo into s1 using jug[1];
  if s1 <> s0 then raise exception 'FALLO: la tabla ha movido dinero (%): las rechazadas no cobran y las canceladas se devuelven', s1 - s0; end if;
  -- el mensaje dice cuales y por que
  begin perform place_combo('[{"match":"zz:pf","pick":"1"},{"match":"zz:pf","pick":"NG"}]', 10); exception when others then err := sqlerrm; end;
  if err <> 'No se pueden combinar Local y Ambos marcan: no (Local vs Visita): van demasiado unidas' then raise exception 'FALLO: el mensaje de no se puede: %', err; end if;
  begin perform place_combo('[{"match":"zz:pn","pick":"J1:100:PO25.5"},{"match":"zz:pn","pick":"J1:100:RO7.5"}]', 10); exception when others then err := sqlerrm; end;
  if err not like 'No se pueden combinar Jayson Tatum: más de 25,5 puntos y Jayson Tatum: más de 7,5 rebotes (Celtics vs Knicks): son del mismo jugador' then raise exception 'FALLO: el mensaje del mismo jugador: %', err; end if;
  resumen := resumen || n || ' parejas del mismo partido (' || nok || ' entran con cuota x 0,85 exacta, ' || nko || ' rechazadas con su porque: mismo mercado, mismo jugador, demasiado unidas, Gran Premio). ';

  -- ---------- tope de 3 por partido, combinada de un solo partido, cuota que no pasa de 1, el redondeo ----------
  r := place_combo('[{"match":"zz:p5","pick":"W1-1"},{"match":"zz:p5","pick":"W2-1"},{"match":"zz:p5","pick":"W3-2"}]', 10);
  if (r->>'odds')::numeric <> 5.78 then raise exception 'FALLO: tres mapas a 2,00 deberian ir a 5,78 (8 x 0,85 x 0,85) y van a %', r->>'odds'; end if;
  perform cancel_combo((r->>'combo')::bigint);
  ok := true; begin perform place_combo('[{"match":"zz:p5","pick":"W1-1"},{"match":"zz:p5","pick":"W2-1"},{"match":"zz:p5","pick":"W3-2"},{"match":"zz:p5","pick":"W4-1"}]', 10); exception when others then ok := false; err := sqlerrm; end;
  if ok or err not like 'Como mucho 3 apuestas del mismo partido%' then raise exception 'FALLO: deja 4 apuestas del mismo partido (%)', err; end if;
  r := place_combo('[{"match":"zz:pn","pick":"J1:100:PO25.5"},{"match":"zz:pn","pick":"J2:200:PO22.5"},{"match":"zz:pn","pick":"J1:300:AO6.5"}]', 10);
  if (r->>'odds')::numeric <> round(1.85 * 1.90 * 1.80 * 0.85 * 0.85, 2) then raise exception 'FALLO: tres jugadores: %', r->>'odds'; end if;
  perform cancel_combo((r->>'combo')::bigint);
  ok := true; begin perform place_combo('[{"match":"zz:sm","pick":"W1-1"},{"match":"zz:sm","pick":"W2-1"}]', 10); exception when others then ok := false; err := sqlerrm; end;
  if ok or err not like '%no pasa de 1,00%' then raise exception 'FALLO: 1,05 x 1,06 x 0,85 = 0,95 no deberia entrar (%)', err; end if;
  -- 1,40 x 1,50 = 2,10 y x 0,85 = 1,785: la mitad va hacia arriba, 1,79 (la app hace la misma cuenta con enteros)
  r := place_combo('[{"match":"zz:sx","pick":"W1-1"},{"match":"zz:sx","pick":"W2-1"}]', 10);
  if (r->>'odds')::numeric <> 1.79 then raise exception 'FALLO: 1,785 deberia redondear a 1,79 y da %', r->>'odds'; end if;
  perform cancel_combo((r->>'combo')::bigint);
  if cmb_total(array[1.80, 1.90, 2.00]::numeric[], array['a', 'a', 'b']) <> 5.81 or cmb_total(array[1.80, 1.90]::numeric[], array['a', 'a']) <> 2.91
     or cmb_total(array[40.00, 40.00]::numeric[], array['a', 'b']) <> 1000 or cmb_factor(array['a', 'b', 'a', 'a', 'c']) <> 0.7225 then
    raise exception 'FALLO: cmb_total / cmb_factor'; end if;
  resumen := resumen || 'Tope de 3 por partido; tres mapas 5,78; tres jugadores; 0,95 no entra; 1,785 da 1,79. ';

  -- ---------- sin partidos repetidos: todo como antes ----------
  r := place_combo('[{"match":"zz:fg","pick":"1"},{"match":"zz:fh","pick":"1"},{"match":"zz:fi","pick":"1"}]', 100); c1 := (r->>'combo')::bigint;
  if (r->>'odds')::numeric <> least(round(1.85 * 2.10 * 1.33, 2), 1000) or (r->>'ajuste')::numeric <> 1 then raise exception 'FALLO: sin repetidos la cuota cambia: %', r; end if;
  if not exists (select 1 from chat where body like '% hace una combinada de 3 partidos por 100 a cuota 5,17') then raise exception 'FALLO: chat de una combinada normal: %', (select body from chat order by id desc limit 1); end if;
  resumen := resumen || 'Sin repetidos: cuota 5,17 como antes (1,85 x 2,10 x 1,33), sin ajuste. ';

  -- ---------- tres partidos con dos apuestas en uno: gana ----------
  -- A Local 1,80 + ambos marcan si 1,90 + D Local 2,00 = 6,84 x 0,85 = 5,814 -> 5,81
  execute saldo into s0 using jug[1];
  r := place_combo('[{"match":"zz:fa","pick":"1"},{"match":"zz:fa","pick":"GG"},{"match":"zz:fd","pick":"1"}]', 100); c2 := (r->>'combo')::bigint;
  if (r->>'odds')::numeric <> 5.81 then raise exception 'FALLO: 1,80 x 1,90 x 2,00 x 0,85 deberia ser 5,81 y es %', r->>'odds'; end if;
  if (r->>'ajuste')::numeric <> 0.85 then raise exception 'FALLO: el ajuste deberia ser 0,85'; end if;
  if not exists (select 1 from chat where body like '% hace una combinada de 3 apuestas en 2 partidos por 100 a cuota 5,81') then raise exception 'FALLO: chat de la combinada del mismo partido: %', (select body from chat order by id desc limit 1); end if;
  if (select note from ledger where player = jug[1] order by id desc limit 1) <> 'Combinada de 3 · cuota 5,81' then raise exception 'FALLO: nota del monedero'; end if;
  -- la misma con B (para perder) y con C (para anular ambos marcan)
  c3 := (place_combo('[{"match":"zz:fb","pick":"1"},{"match":"zz:fb","pick":"GG"},{"match":"zz:fd","pick":"1"}]', 100)->>'combo')::bigint;
  c4 := (place_combo('[{"match":"zz:fc","pick":"1"},{"match":"zz:fc","pick":"GG"},{"match":"zz:fd","pick":"1"}]', 100)->>'combo')::bigint;
  -- nunca menos de lo apostado: Sen mapa 1 (1,05) + mapa 2 (1,06) + E Local 3,00 = 2,84; si E se anula quedan 1,05 x 1,06 x 0,85 = 0,946
  r := place_combo('[{"match":"zz:sm","pick":"W1-1"},{"match":"zz:sm","pick":"W2-1"},{"match":"zz:fe","pick":"1"}]', 100); c5 := (r->>'combo')::bigint;
  if (r->>'odds')::numeric <> round(1.05 * 1.06 * 3.00 * 0.85, 2) then raise exception 'FALLO: cuota de la combinada con E: %', r->>'odds'; end if;
  execute saldo into s1 using jug[1];
  if s0 - s1 <> 400 then raise exception 'FALLO: cuatro combinadas de 100 deberian cobrar 400 y cobran %', s0 - s1; end if;

  -- ---------- cash out ----------
  -- antes de que empiece ninguno: cancelar (devuelve todo)
  q := combo_cash_value((select c from combos c where c.id = c2));
  if q->>'mode' <> 'pre' then raise exception 'FALLO: antes de empezar deberia ser cancelar: %', q; end if;
  -- empieza A (con sus dos apuestas sin resolver): sin cash out, con el porque
  update matches set status = 'live', starts_at = now() - interval '30 minutes' where id = 'zz:fa';
  perform sync_ex_live_put(sec, '[{"match":"zz:fa","data":{"k":"f","min":30,"hs":1,"as":0,"per":1}}]');
  q := combo_cash_value((select c from combos c where c.id = c2));
  if coalesce((q->>'ok')::boolean, true) or q->>'why' not like 'Lleva varias apuestas del mismo partido%' then raise exception 'FALLO: con dos del mismo partido en juego hay cash out: %', q; end if;
  if (select x->>'ok' from jsonb_array_elements(combo_cash_quotes()) x where (x->>'combo')::bigint = c2) <> 'false' then raise exception 'FALLO: combo_cash_quotes ofrece cash out de la combinada del mismo partido'; end if;
  ok := true; begin perform combo_cash_out(c2, null); exception when others then ok := false; err := sqlerrm; end;
  if ok or err not like 'Lleva varias apuestas del mismo partido%' then raise exception 'FALLO: deja hacer cash out con dos del mismo partido en juego (%)', err; end if;
  -- la combinada normal (sin repetidos) sigue con su cash out de siempre
  update matches set status = 'live', starts_at = now() - interval '30 minutes' where id = 'zz:fg';
  perform sync_ex_live_put(sec, '[{"match":"zz:fg","data":{"k":"f","min":30,"hs":1,"as":0,"per":1}}]');
  q := combo_cash_value((select c from combos c where c.id = c1));
  declare bb bets; qq jsonb; cur numeric;
  begin
    bb.status := 'open'; bb.boost := null; bb.pick := '1'; bb.stake := 100; bb.odds := 1.85;
    qq := ex_cash_value(bb, (select m from matches m where m.id = 'zz:fg'));
    v := (qq->>'p')::numeric;
    cur := least(0.97, 1 / (2.10 * 1.05)) * least(0.97, 1 / (1.33 * 1.05));
    if not (q->>'ok')::boolean or (q->>'win')::int <> round(100 * 1.85 * 2.10 * 1.33)::int
       or (q->>'value')::int <> least(round(100 * 1.85 * 2.10 * 1.33), greatest(1, round(100 * 1.85 * 2.10 * 1.33 * least(0.99, greatest(0.001, v * cur)) * 0.90)))::int then
      raise exception 'FALLO: el cash out de la combinada normal ha cambiado: % (p %)', q, v; end if;
  end;
  -- A acaba 2:1 en los 90: sus dos apuestas salen; D empieza: ahora si hay cash out, con el 0,85 en lo que pagaria
  update matches set status = 'final', score = '2:1', winner = '1', details = '{"r90":"2:1"}' where id = 'zz:fa';
  perform settle_match('zz:fa');
  if (select string_agg(pick || '=' || result, ',' order by pick) from combo_legs where combo_id = c2 and match_id = 'zz:fa') <> '1=won,GG=won' then
    raise exception 'FALLO: las dos patas de A deberian salir: %', (select string_agg(pick || '=' || coalesce(result, '?'), ',') from combo_legs where combo_id = c2); end if;
  if (select status from combos where id = c2) <> 'open' then raise exception 'FALLO: con D por jugar la combinada ya se ha cerrado'; end if;
  update matches set status = 'live', starts_at = now() - interval '20 minutes' where id = 'zz:fd';
  perform sync_ex_live_put(sec, '[{"match":"zz:fd","data":{"k":"f","min":20,"hs":0,"as":0,"per":1}}]');
  q := combo_cash_value((select c from combos c where c.id = c2));
  declare bb bets; qq jsonb;
  begin
    bb.status := 'open'; bb.boost := null; bb.pick := '1'; bb.stake := 100; bb.odds := 2.00;
    qq := ex_cash_value(bb, (select m from matches m where m.id = 'zz:fd'));
    v := (qq->>'p')::numeric;
    if not coalesce((q->>'ok')::boolean, false) or (q->>'win')::int <> 581
       or (q->>'value')::int <> least(581, greatest(1, round(100 * 1.80 * 1.90 * 2.00 * 0.85 * least(0.99, greatest(0.001, v)) * 0.90)))::int then
      raise exception 'FALLO: cash out con A ya acertada: % (p de D %)', q, v; end if;
    if (q->>'value')::int >= 581 or (q->>'value')::int <= 0 then raise exception 'FALLO: valor de cash out fuera de lo normal: %', q; end if;
  end;
  resumen := resumen || 'Cash out: antes de empezar cancelar; con dos del mismo partido en juego no (ni quotes ni cash_out); normal igual que antes; acabado ese partido vuelve con x 0,85 (' || (q->>'value') || ' de 581). ';

  -- ---------- pagar: gana ----------
  execute saldo into s0 using jug[1];
  update matches set status = 'final', score = '1:0', winner = '1', details = '{"r90":"1:0"}' where id = 'zz:fd';
  perform settle_match('zz:fd');
  if (select status from combos where id = c2) <> 'won' or (select payout from combos where id = c2) <> 581 then
    raise exception 'FALLO: la combinada de tres con dos del mismo partido deberia cobrar 581 y queda % con %', (select status from combos where id = c2), (select payout from combos where id = c2); end if;
  if not exists (select 1 from ledger where player = jug[1] and kind = 'premio' and amount = 581 and note = 'Combinada · cuota 5,81') then raise exception 'FALLO: premio en el monedero'; end if;
  if not exists (select 1 from chat where body like '% ganó 581 con una combinada de 3 apuestas en 2 partidos') then raise exception 'FALLO: chat del premio'; end if;
  -- B y C siguen abiertas (les faltan B y C)
  if (select status from combos where id = c3) <> 'open' or (select status from combos where id = c4) <> 'open' then raise exception 'FALLO: B o C se han cerrado antes de tiempo'; end if;

  -- ---------- pierde: B acaba 1:0 (gana el local pero no marcan los dos) ----------
  update matches set status = 'final', score = '1:0', winner = '1', details = '{"r90":"1:0"}', starts_at = now() - interval '2 hours' where id = 'zz:fb';
  perform settle_match('zz:fb');
  if (select status from combos where id = c3) <> 'lost' then raise exception 'FALLO: con ambos marcan fallado la combinada deberia perder'; end if;

  -- ---------- anulada: C acaba 2:1 tras prorroga sin el resultado de los 90 -> ambos marcan se devuelve, el 1 gana ----------
  -- queda una sola apuesta de C: sin recorte. 1,80 x 2,00 = 3,60 -> 360
  update matches set status = 'final', score = '2:1', winner = '1', details = '{}', starts_at = now() - interval '2 hours' where id = 'zz:fc';
  perform settle_match('zz:fc');
  if (select string_agg(pick || '=' || result, ',' order by pick) from combo_legs where combo_id = c4 and match_id = 'zz:fc') <> '1=won,GG=void' then
    raise exception 'FALLO: en C el 1 gana y ambos marcan se anula: %', (select string_agg(pick || '=' || coalesce(result, '?'), ',') from combo_legs where combo_id = c4); end if;
  if (select status from combos where id = c4) <> 'won' or (select payout from combos where id = c4) <> 360 then
    raise exception 'FALLO: con ambos marcan anulado se quita el recorte: deberia cobrar 360 (1,80 x 2,00) y queda % con %', (select status from combos where id = c4), (select payout from combos where id = c4); end if;

  -- ---------- nunca menos de lo apostado: E se anula, quedan los dos mapas de Sen (0,946 -> se cobra lo apostado, 100) ----------
  update matches set status = 'canceled', starts_at = now() - interval '2 hours' where id = 'zz:fe';
  perform settle_match('zz:fe');
  if (select status from combos where id = c5) <> 'open' then raise exception 'FALLO: con Sen por jugar la combinada se ha cerrado'; end if;
  update matches set status = 'final', score = '2:0', winner = '1', starts_at = now() - interval '2 hours',
    details = '{"mt":"best_of","ids":{"a":11,"b":22},"games":[{"n":1,"st":"finished","w":11},{"n":2,"st":"finished","w":11},{"n":3,"st":"not_played","w":null}]}' where id = 'zz:sm';
  perform settle_match('zz:sm');
  if (select status from combos where id = c5) <> 'won' or (select payout from combos where id = c5) <> 100 then
    raise exception 'FALLO: acertada con cuota ajustada por debajo de 1 deberia devolver 100 y queda % con %', (select status from combos where id = c5), (select payout from combos where id = c5); end if;
  execute saldo into s1 using jug[1];
  if s1 - s0 <> 581 + 360 + 100 then raise exception 'FALLO: el saldo deberia subir % y sube %', 581 + 360 + 100, s1 - s0; end if;
  resumen := resumen || 'Paga 581 (5,81); pierde con una del mismo partido fallada; con una anulada se quita el recorte (360); acertada por debajo de 1 devuelve lo apostado (100). ';

  -- ---------- la combinada normal paga como siempre ----------
  update matches set status = 'final', score = '2:0', winner = '1', details = '{"r90":"2:0"}' where id in ('zz:fg', 'zz:fh', 'zz:fi');
  perform settle_match('zz:fg'); perform settle_match('zz:fh'); perform settle_match('zz:fi');
  if (select status from combos where id = c1) <> 'won' or (select payout from combos where id = c1) <> round(100 * least(round(1.85 * 2.10 * 1.33, 2), 1000))::int then
    raise exception 'FALLO: la combinada normal deberia cobrar % y cobra %', round(100 * least(round(1.85 * 2.10 * 1.33, 2), 1000)), (select payout from combos where id = c1); end if;
  resumen := resumen || 'La normal cobra 517 como antes. ';

  -- ---------- el mapa que no se juega se anula y sale del calculo ----------
  r := place_combo('[{"match":"zz:ps","pick":"W1-1"},{"match":"zz:ps","pick":"W3-1"},{"match":"zz:pf","pick":"1"}]', 100); c6 := (r->>'combo')::bigint;
  if (r->>'odds')::numeric <> round(1.70 * 1.70 * 2.00 * 0.85, 2) then raise exception 'FALLO: cuota con dos mapas: %', r->>'odds'; end if;
  update matches set status = 'final', score = '2:0', winner = '1', starts_at = now() - interval '2 hours',
    details = '{"mt":"best_of","ids":{"a":101,"b":202},"games":[{"n":1,"st":"finished","w":101},{"n":2,"st":"finished","w":101},{"n":3,"st":"not_played","w":null}]}' where id = 'zz:ps';
  perform settle_match('zz:ps');
  update matches set status = 'final', score = '1:0', winner = '1', details = '{"r90":"1:0"}', starts_at = now() - interval '2 hours' where id = 'zz:pf';
  perform settle_match('zz:pf');
  if (select status from combos where id = c6) <> 'won' or (select payout from combos where id = c6) <> 340 then
    raise exception 'FALLO: mapa 3 sin jugar: deberia cobrar 340 (1,70 x 2,00, sin recorte) y queda % con %', (select status from combos where id = c6), (select payout from combos where id = c6); end if;
  resumen := resumen || 'Mapa 3 sin jugar se anula y se quita el recorte (340). ';

  -- ---------- la clave de combo_legs ----------
  if (select count(*) from pg_constraint c, unnest(c.conkey) a where c.conrelid = 'combo_legs'::regclass and c.contype = 'p') <> 3 then
    raise exception 'FALLO: la clave de combo_legs deberia ser (combinada, partido, eleccion)'; end if;

  raise exception 'PRUEBA SUPERADA (% jugadores): %', cardinality(jug), resumen;
end $$;
