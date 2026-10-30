-- Prueba del crash en velas con retrocesos falsos (db/023_crash_velas.sql). Para el editor SQL de Supabase; hacen falta 3 jugadores.
-- Comprueba: la formula de m(t) en una tabla de tiempos (juegos.js tiene que dar lo mismo), el generador de retrocesos, retirar en
-- mitad de una caida (paga lo que se ve), explotar a mitad de una caida (el punto mostrado es m en ese momento), la retirada
-- automatica (salta la primera vez que m llega al objetivo y se pierde si no llega antes de explotar) y que ninguna estrategia
-- supera el 97 % de devolucion. Al final lanza un error A PROPOSITO para que se deshaga todo: dice "PRUEBA SUPERADA" o "FALLO".
do $$
declare
  jug uuid[] := array(select id from players order by created_at);
  retro jsonb := '[{"t0":10,"d":0.7,"td":0.3,"tr":2},{"t0":20,"d":0.8,"td":0.25,"tr":1.5}]';
  r jsonb; rid bigint; resumen text := ''; i int; n int; x double precision; y double precision; v record; s1 int; s2 int; s3 int; fallo boolean;
  c0 int; c1 int; c2 int; mal int; tabla text := ''; tc double precision;
begin
  if cardinality(jug) < 3 then raise exception 'FALLO: hacen falta al menos tres jugadores'; end if;
  perform pay_week();
  delete from jg_crash;
  insert into ledger(player, amount, kind, note) select id, 100000, 'ajuste', 'saldo de prueba' from players;

  -- 1. la formula, en una tabla de tiempos
  foreach x in array array[0, 1, 5, 9.9, 10, 10.1, 10.15, 10.3, 10.8, 11.3, 11.5, 12.2, 12.3, 12.4, 19.9, 20, 20.125, 20.25, 21, 21.75, 22, 30] loop
    tabla := tabla || format('%s=%s ', x, round(crash_m(x, retro)::numeric, 9));
  end loop;
  if abs(crash_f(9, retro) - 1) > 1e-12 or abs(crash_f(10.15, retro) - 0.85) > 1e-9 or abs(crash_f(10.3, retro) - 0.7) > 1e-9
     or abs(crash_f(11.3, retro) - 0.85) > 1e-9 or abs(crash_f(12.3, retro) - 1) > 1e-12 or abs(crash_f(20.125, retro) - 0.9) > 1e-9 then
    raise exception 'FALLO: crash_f no da lo esperado en la tabla (%)', tabla;
  end if;
  if abs(crash_m(10.3, retro) - exp(0.06 * 10.3) * 0.7) > 1e-9 or crash_m(5, '[]') <> exp(0.3) then raise exception 'FALLO: crash_m = p(t) * f(t)'; end if;
  if crash_mult(10.3, retro) <> floor(exp(0.06 * 10.3) * 0.7 * 100) / 100 then raise exception 'FALLO: crash_mult no redondea hacia abajo a dos decimales'; end if;
  resumen := resumen || 'Tabla de tiempos de m(t) verificada. ';

  -- 2. el generador: 0 a 2 retrocesos, niveles, profundidades y duraciones en rango, sin pisarse, y nunca por debajo de x1,07
  c0 := 0; c1 := 0; c2 := 0; mal := 0;
  for i in 1..3000 loop
    r := jg_crash_retro(); n := jsonb_array_length(r);
    if n = 0 then c0 := c0 + 1; elsif n = 1 then c1 := c1 + 1; else c2 := c2 + 1; end if;
    for v in select (e->>'t0')::double precision t0, (e->>'d')::double precision d, (e->>'td')::double precision td, (e->>'tr')::double precision tr, ord
             from jsonb_array_elements(r) with ordinality as q(e, ord) loop
      if v.d < 0.65 or v.d > 0.851 or v.td < 0.25 or v.td > 0.401 or v.tr < 1 or v.tr > 2.501 or v.t0 < ln(1.5) / 0.06 - 0.01 then mal := mal + 1; end if;
      if v.ord = 1 and v.t0 > ln(4.0) / 0.06 + 0.01 then mal := mal + 1; end if;
      if v.ord = 2 and v.t0 < (r->0->>'t0')::double precision + (r->0->>'td')::double precision + (r->0->>'tr')::double precision + 0.79 then mal := mal + 1; end if;
      -- en el fondo de la caida m sigue por encima de 1,07
      if crash_m(v.t0 + v.td, r) < 1.07 then mal := mal + 1; end if;
    end loop;
  end loop;
  if mal > 0 then raise exception 'FALLO: % retrocesos generados fuera de rango', mal; end if;
  if c0 < 600 or c0 > 900 or c1 < 1150 or c1 > 1550 or c2 < 700 or c2 > 1100 then raise exception 'FALLO: reparto de retrocesos por ronda: 0=% 1=% 2=% (esperado 25, 45 y 30 por ciento)', c0, c1, c2; end if;
  resumen := resumen || format('Generador: 0=%s, 1=%s, 2=%s retrocesos de 3000 rondas, todos en rango. ', c0, c1, c2);

  -- 3. retirar en mitad de una caida paga lo que se ve (no la curva)
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  s1 := jg_saldo(jug[1]);
  r := crash_apostar(1000, null); rid := (r->>'ronda')::bigint;
  update jg_crash set retro = '[{"t0":10,"d":0.7,"td":0.3,"tr":2}]' where id = rid;
  update jg_crash_secreto set punto = 50 where ronda = rid;
  update jg_crash set arranca = jg_ahora() - interval '10.35 seconds' where id = rid;
  r := crash_retirar();
  if not (r->>'ok')::boolean or (r->>'retiro')::numeric < 1.25 or (r->>'retiro')::numeric > 1.38 then raise exception 'FALLO: retirar en la caida tenia que dar cerca de x1,30 (la curva iria por x1,86) y ha dado %', r->>'retiro'; end if;
  if (r->>'pago')::int <> floor(1000 * (r->>'retiro')::numeric) or jg_saldo(jug[1]) <> s1 - 1000 + (r->>'pago')::int then raise exception 'FALLO: el pago de retirar en la caida no cuadra'; end if;
  resumen := resumen || format('Retirar en la caida: x%s en vez de x1,86. ', r->>'retiro');
  update jg_crash_secreto set punto = 1.00 where ronda = rid;
  update jg_crash set arranca = jg_ahora() - interval '1 hour' where id = rid;
  perform crash_estado();

  -- 4. explotar en mitad de una caida: el punto mostrado es m en ese momento
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[2]), true);
  s2 := jg_saldo(jug[2]);
  r := crash_apostar(500, null); rid := (r->>'ronda')::bigint;
  update jg_crash set retro = '[{"t0":11.4,"d":0.6,"td":0.3,"tr":2}]' where id = rid;
  update jg_crash_secreto set punto = 2.00 where ronda = rid;                       -- explota a los 11,55 s: dentro de la caida
  update jg_crash set arranca = jg_ahora() - interval '60 seconds' where id = rid;
  r := crash_estado();
  if r->'ronda'->>'estado' <> 'fin' then raise exception 'FALLO: la ronda tenia que haber explotado'; end if;
  x := crash_m(ln(2.0) / 0.06, '[{"t0":11.4,"d":0.6,"td":0.3,"tr":2}]');
  if abs((r->'ronda'->>'punto')::numeric - round(x::numeric, 2)) > 0.001 or (r->'ronda'->>'punto')::numeric > 1.7 or (r->'ronda'->>'punto')::numeric < 1.5 then
    raise exception 'FALLO: explotar en la caida tenia que mostrar x%, y muestra %', round(x::numeric, 2), r->'ronda'->>'punto'; end if;
  if jg_saldo(jug[2]) <> s2 - 500 then raise exception 'FALLO: el que no se retira pierde su apuesta'; end if;
  if jsonb_array_length(r->'ronda'->'retro') <> 1 then raise exception 'FALLO: crash_estado no entrega el calendario de retrocesos'; end if;
  resumen := resumen || format('Explotar en la caida: se muestra x%s, no x2,00. ', r->'ronda'->>'punto');

  -- 5. retirada automatica: salta la primera vez que m llega al objetivo
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  s1 := jg_saldo(jug[1]);
  r := crash_apostar(1000, 1.8); rid := (r->>'ronda')::bigint;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[2]), true);
  s2 := jg_saldo(jug[2]);
  perform crash_apostar(100, 3.5);
  update jg_crash set retro = '[{"t0":9,"d":0.7,"td":0.3,"tr":2}]' where id = rid;
  update jg_crash_secreto set punto = 3.00 where ronda = rid;                       -- explota a los 18,3 s
  x := crash_t_alcanza(1.8, '[{"t0":9,"d":0.7,"td":0.3,"tr":2}]');
  if x <= ln(1.8) / 0.06 + 0.5 or x >= 11.3 or abs(crash_m(x, '[{"t0":9,"d":0.7,"td":0.3,"tr":2}]') - 1.8) > 1e-6 then
    raise exception 'FALLO: el objetivo x1,8 con una caida en medio tenia que saltar cuando m lo alcanza (a los % s, la curva lo alcanzaria a los 9,8)', round(x::numeric, 2); end if;
  update jg_crash set arranca = jg_ahora() - interval '9.9 seconds' where id = rid;   -- la curva ya paso x1,8, pero m no
  perform crash_estado();
  if (select estado from jg_crash_apuestas where ronda = rid and player = jug[1]) <> 'viva' then raise exception 'FALLO: la automatica x1,8 ha saltado con m todavia por debajo'; end if;
  update jg_crash set arranca = jg_ahora() - interval '14 seconds' where id = rid;
  perform crash_estado();
  if (select estado from jg_crash_apuestas where ronda = rid and player = jug[1]) <> 'cobrada' or jg_saldo(jug[1]) <> s1 - 1000 + 1800 then raise exception 'FALLO: la automatica x1,8 tenia que cobrar 1800'; end if;
  if (select estado from jg_crash_apuestas where ronda = rid and player = jug[2]) <> 'viva' then raise exception 'FALLO: la automatica x3,5 no puede saltar a los 14 s'; end if;
  update jg_crash set arranca = jg_ahora() - interval '60 seconds' where id = rid;
  perform crash_estado();
  if (select estado from jg_crash_apuestas where ronda = rid and player = jug[2]) <> 'perdida' or jg_saldo(jug[2]) <> s2 - 100 then raise exception 'FALLO: la automatica x3,5 con explosion en x3 se pierde'; end if;
  resumen := resumen || format('Automatica x1,8: salta a los %s s (la curva sola, a los 9,8). ', round(x::numeric, 2));

  -- 6. el objetivo lo pasa la curva pero m no llega antes de explotar: se pierde
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  s1 := jg_saldo(jug[1]);
  r := crash_apostar(400, 1.95); rid := (r->>'ronda')::bigint;
  update jg_crash set retro = '[{"t0":10,"d":0.65,"td":0.3,"tr":2}]' where id = rid;
  update jg_crash_secreto set punto = 2.00 where ronda = rid;                       -- explota a los 11,55 s, la curva paso x1,95 a los 11,13 s
  update jg_crash set arranca = jg_ahora() - interval '60 seconds' where id = rid;
  perform crash_estado();
  if (select estado from jg_crash_apuestas where ronda = rid and player = jug[1]) <> 'perdida' or jg_saldo(jug[1]) <> s1 - 400 then raise exception 'FALLO: la curva pasa x1,95 pero m no: tenia que perderse'; end if;
  resumen := resumen || 'Automatica que la curva pasa pero m no: se pierde. ';

  -- 7. ninguna estrategia pasa del 97 %: automaticas x1,2, x2 y x5 y "retirarse a los 10 s", con rondas al azar
  for y in select unnest(array[1.2, 2.0, 5.0]) loop
    s3 := 0; n := 2500;
    for i in 1..n loop
      r := jg_crash_retro(); x := ln(jg_crash_punto()::double precision) / 0.06;
      tc := crash_t_alcanza(y::numeric, r);
      if tc is not null and tc <= x then s3 := s3 + floor(1000 * y)::int; end if;
    end loop;
    if s3 / (n * 1000.0) > 1.06 or s3 / (n * 1000.0) < 0.82 then raise exception 'FALLO: la automatica x% devuelve de media % (esperado 0,97 o menos)', y, round((s3 / (n * 1000.0))::numeric, 3); end if;
    resumen := resumen || format('Automatica x%s: devuelve %s. ', y, round((s3 / (n * 1000.0))::numeric, 3));
  end loop;
  s3 := 0; n := 4000;
  for i in 1..n loop
    r := jg_crash_retro(); x := ln(jg_crash_punto()::double precision) / 0.06;
    if 10 < x then s3 := s3 + floor(1000 * crash_mult(10, r))::int; end if;
  end loop;
  if s3 / (n * 1000.0) > 1.0 or s3 / (n * 1000.0) < 0.8 then raise exception 'FALLO: retirarse siempre a los 10 s devuelve de media %', round((s3 / (n * 1000.0))::numeric, 3); end if;
  resumen := resumen || format('Retirarse a los 10 s: devuelve %s. ', round((s3 / (n * 1000.0))::numeric, 3));

  -- 7b. ranking: neto, mayor jugada y su multiplicador (se prueba con jugadas escritas a mano)
  delete from jg_crash; delete from jg_bj; delete from jg_moneda;
  insert into jg_crash(arranca, estado, punto, fin_at) values (now(), 'fin', 3, now()) returning id into rid;
  insert into jg_crash_apuestas(ronda, player, stake, estado, retiro, pago, creada) values
    (rid, jug[1], 100, 'cobrada', 5.5, 550, now()), (rid, jug[2], 100, 'cobrada', 1.5, 150, now()), (rid, jug[3], 100, 'perdida', null, 0, now());
  insert into jg_crash(arranca, estado, punto, fin_at) values (now(), 'fin', 2, now()) returning id into rid;
  insert into jg_crash_apuestas(ronda, player, stake, estado, retiro, pago, creada) values (rid, jug[1], 200, 'perdida', null, 0, now()), (rid, jug[2], 50, 'cobrada', 4, 200, now());
  r := jg_ranking('crash', 'siempre');
  if r->0->>'player' <> jug[1]::text or (r->0->>'neto')::int <> 250 or (r->0->>'mayor')::int <> 450 or (r->0->>'mayor_x')::numeric <> 5.5 or (r->0->>'mejor')::numeric <> 5.5 then raise exception 'FALLO: ranking de crash, primero: %', r->0; end if;
  if (r->1->>'neto')::int <> 200 or (r->1->>'mayor')::int <> 150 or (r->1->>'mayor_x')::numeric <> 4 or (r->1->>'mejor')::numeric <> 4 then raise exception 'FALLO: ranking de crash, segundo: %', r->1; end if;
  if (r->2->>'neto')::int <> -100 or (r->2->>'mayor')::int <> 0 or r->2->>'mayor_x' is not null or r->2->>'mejor' is not null then raise exception 'FALLO: ranking de crash, quien nunca gana: %', r->2; end if;
  insert into jg_bj(player, stake, total, estado, resultado, pago, cerrada) values (jug[1], 10, 10, 'fin', 'blackjack', 25, now()), (jug[1], 10, 20, 'fin', 'gana', 40, now()), (jug[2], 10, 10, 'fin', 'pierde', 0, now());
  r := jg_ranking('blackjack', 'siempre');
  if r->0->>'player' <> jug[1]::text or (r->0->>'neto')::int <> 35 or (r->0->>'jugadas')::int <> 2 then raise exception 'FALLO: ranking de blackjack: %', r->0; end if;
  if (r->0->>'mayor')::int <> 20 or (r->0->>'mayor_x')::numeric <> 2.00 then raise exception 'FALLO: la mayor jugada de blackjack tenia que ser +20 a x2: %', r->0; end if;
  if (r->1->>'neto')::int <> -10 or (r->1->>'mayor')::int <> 0 then raise exception 'FALLO: ranking de blackjack, perdedor: %', r->1; end if;
  insert into jg_moneda(creador, stake, lado, estado, rival, ganador, salio, creado, cerrado) values (jug[1], 300, 'cara', 'hecho', jug[2], jug[1], 'cara', now(), now()), (jug[2], 50, 'cara', 'hecho', jug[1], jug[1], 'cruz', now(), now());
  r := jg_ranking('moneda', 'siempre');
  if r->0->>'player' <> jug[1]::text or (r->0->>'neto')::int <> 350 or (r->0->>'mayor')::int <> 300 or (r->0->>'mayor_x')::numeric <> 2 then raise exception 'FALLO: ranking de cara o cruz: %', r->0; end if;
  r := jg_ranking('moneda', 'semana');
  if jsonb_array_length(r) <> 2 then raise exception 'FALLO: ranking de la semana de cara o cruz: %', r; end if;
  resumen := resumen || 'Ranking: neto, mayor jugada y su multiplicador en los tres juegos. ';

  -- 8. las funciones de la formula son internas
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  set local role authenticated;
  fallo := true;
  begin perform crash_m(1, '[]'); fallo := false; exception when insufficient_privilege then null; end;
  if not fallo then reset role; raise exception 'FALLO: un jugador puede llamar a crash_m'; end if;
  begin perform jg_crash_retro(); fallo := false; exception when insufficient_privilege then null; end;
  if not fallo then reset role; raise exception 'FALLO: un jugador puede llamar a jg_crash_retro'; end if;
  perform crash_estado();
  reset role;

  raise exception 'PRUEBA SUPERADA (se deshace todo): %', resumen || ' Tabla de m(t) con el calendario de la prueba: ' || tabla;
end $$;
