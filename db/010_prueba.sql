-- Prueba de los Juegos, para el editor SQL de Supabase. Va despues de 010_juegos.sql (y de db/009, el check de ledger.kind).
-- Prueba cada juego con los jugadores de verdad (hacen falta al menos tres): cara o cruz, crash, ruleta, blackjack y plinko.
-- El tiempo de las rondas se adelanta tocando las tablas (esto corre como administrador), y los mazos del blackjack se fijan
-- para probar cada regla. Tambien mira que un jugador normal NO pueda leer los secretos ni llamar a las funciones internas.
-- Al final lanza un error A PROPOSITO para que se deshaga todo: no queda nada guardado (ni saldo, ni rondas, ni chat).
-- Si todo va bien, el error dice "PRUEBA SUPERADA" con el resumen. Si algo falla, dice "FALLO" y que.
do $$
declare
  jug uuid[] := array(select id from players order by created_at);
  r jsonb; h jsonb; s0 int; s1 int; s2 int; s3 int; fallo boolean; resumen text := ''; i int; n int; n2 int; x numeric;
  mid bigint; rid bigint; hid bigint; hh jg_bj; cnt int; mazo smallint[]; v_ok boolean;
  filler smallint[] := array(select g::smallint from generate_series(13, 51) g);
begin
  if cardinality(jug) < 3 then raise exception 'FALLO: hacen falta al menos tres jugadores'; end if;
  begin
    insert into ledger(player, amount, kind, note) values (jug[1], 0, 'plinko', 'prueba de tipo');
    delete from ledger where note = 'prueba de tipo';
  exception when check_violation then
    raise exception 'FALLO: ledger.kind no acepta los tipos nuevos (moneda, crash, ruleta, blackjack, plinko). Carga antes db/009.';
  end;
  delete from jg_crash; delete from jg_ruleta; delete from jg_bj; delete from jg_moneda; delete from jg_plinko;
  perform pay_week();                                                -- la paga de esta semana, para que no entre a mitad de la prueba
  insert into ledger(player, amount, kind, note) select id, 100000, 'ajuste', 'saldo de prueba' from players;

  -- =========================================================== CARA O CRUZ
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  s0 := jg_saldo(jug[1]);
  r := moneda_crear(500, null, 'cara'); mid := (r->>'id')::bigint;
  if jg_saldo(jug[1]) <> s0 - 500 then raise exception 'FALLO: crear un reto de cara o cruz no ha cobrado la apuesta'; end if;
  r := moneda_cancelar(mid);
  if jg_saldo(jug[1]) <> s0 then raise exception 'FALLO: retirar el reto no ha devuelto la apuesta'; end if;
  fallo := false; begin perform moneda_cancelar(mid); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se ha podido retirar dos veces el mismo reto (cobra dos veces)'; end if;
  fallo := false; begin perform moneda_crear(0, null, 'cara'); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se ha podido retar con 0'; end if;
  fallo := false; begin perform moneda_crear(s0 + 1, null, 'cara'); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se ha podido retar con mas de lo que se tiene'; end if;
  fallo := false; begin perform moneda_crear(10, jug[1], 'cara'); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se ha podido retarse a uno mismo'; end if;

  -- un reto para uno solo: otro no lo puede aceptar, ni el mismo que lo crea
  s1 := jg_saldo(jug[1]); s2 := jg_saldo(jug[2]);
  r := moneda_crear(300, jug[2], 'cruz'); mid := (r->>'id')::bigint;
  fallo := false; begin perform moneda_aceptar(mid); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: el que reta ha podido aceptar su propio reto'; end if;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[3]), true);
  fallo := false; begin perform moneda_aceptar(mid); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: un tercero ha aceptado un reto que era para otro'; end if;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[2]), true);
  r := moneda_aceptar(mid);
  if jg_saldo(jug[1]) + jg_saldo(jug[2]) <> s1 + s2 then raise exception 'FALLO: cara o cruz ha creado o perdido dinero'; end if;
  if (r->>'gane')::boolean then
    if jg_saldo(jug[2]) <> s2 + 300 or jg_saldo(jug[1]) <> s1 - 300 then raise exception 'FALLO: el ganador (rival) no cobra bien'; end if;
  else
    if jg_saldo(jug[2]) <> s2 - 300 or jg_saldo(jug[1]) <> s1 + 300 then raise exception 'FALLO: el perdedor (rival) no paga bien'; end if;
  end if;
  v_ok := (select ganador from jg_moneda where id = mid) = (case when r->>'salio' = 'cruz' then jug[1] else jug[2] end);
  if not v_ok then
    raise exception 'FALLO: el ganador no sale de lo que ha caido (el que reta iba a cruz)'; end if;
  fallo := false; begin perform moneda_aceptar(mid); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se ha podido aceptar dos veces el mismo reto'; end if;
  resumen := resumen || 'Cara o cruz: crear, retirar, dirigido, aceptar y no aceptar dos veces. ';

  -- 300 lanzamientos: de cada lado salen mas o menos la mitad
  n := 0; s1 := jg_saldo(jug[1]) + jg_saldo(jug[2]);
  for i in 1..300 loop
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
    r := moneda_crear(100, null, 'cara'); mid := (r->>'id')::bigint;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[2]), true);
    r := moneda_aceptar(mid);
    if r->>'salio' = 'cara' then n := n + 1; end if;
  end loop;
  if jg_saldo(jug[1]) + jg_saldo(jug[2]) <> s1 then raise exception 'FALLO: 300 lanzamientos han creado o perdido dinero'; end if;
  if n < 105 or n > 195 then raise exception 'FALLO: de 300 lanzamientos ha salido cara % veces (esperado cerca de 150)', n; end if;
  resumen := resumen || format('300 lanzamientos: %s caras. ', n);

  -- 5 retos abiertos como mucho, y los que nadie acepta en 24 h se devuelven
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[3]), true);
  s0 := jg_saldo(jug[3]);
  for i in 1..5 loop perform moneda_crear(10, null, 'cara'); end loop;
  fallo := false; begin perform moneda_crear(10, null, 'cara'); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se han podido abrir mas de 5 retos'; end if;
  update jg_moneda set creado = jg_ahora() - interval '25 hours' where creador = jug[3] and estado = 'abierto';
  r := moneda_estado();
  if jg_saldo(jug[3]) <> s0 then raise exception 'FALLO: los retos sin contestar no se han devuelto a las 24 h'; end if;
  if (select count(*) from jg_moneda where creador = jug[3] and estado = 'caducado') <> 5 then raise exception 'FALLO: los retos caducados no se han marcado'; end if;

  -- =========================================================== CRASH
  -- el punto de explosion: P(punto >= 2) = 0,485 y sale 1,00 el 4 % de las veces
  select count(*) filter (where p >= 2), count(*) filter (where p = 1), count(*) filter (where p >= 10), max(p)
    into n, n2, cnt, x from (select jg_crash_punto() p from generate_series(1, 20000)) q;
  if n < 9400 or n > 10000 then raise exception 'FALLO: crash: el % de las rondas pasa de x2 (esperado 48,5 %%)', round(n / 200.0, 1); end if;
  if n2 < 600 or n2 > 1000 then raise exception 'FALLO: crash: explotan en 1,00 el % de las rondas (esperado 4 %%)', round(n2 / 200.0, 1); end if;
  if cnt < 1700 or cnt > 2200 then raise exception 'FALLO: crash: el % pasa de x10 (esperado 9,7 %%)', round(cnt / 200.0, 1); end if;
  resumen := resumen || format('Crash 20.000 puntos: %s %% pasan de x2, %s %% explotan en 1,00, maximo x%s. ', round(n / 200.0, 1), round(n2 / 200.0, 1), x);

  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  s0 := jg_saldo(jug[1]);
  r := crash_apostar(1000, null); rid := (r->>'ronda')::bigint;
  if jg_saldo(jug[1]) <> s0 - 1000 then raise exception 'FALLO: apostar en el crash no cobra'; end if;
  fallo := false; begin perform crash_apostar(10, null); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se ha podido apostar dos veces en la misma ronda'; end if;
  fallo := false; begin perform crash_retirar(); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se ha podido retirar antes de que arranque la ronda'; end if;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[2]), true);
  s2 := jg_saldo(jug[2]);
  perform crash_apostar(500, 1.5);
  fallo := false; begin perform crash_apostar(100001, null); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se ha podido apostar mas de lo que se tiene'; end if;
  fallo := false; begin perform crash_apostar(100, 1.0); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: retirada automatica x1,00 aceptada'; end if;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[3]), true);
  s3 := jg_saldo(jug[3]);
  perform crash_apostar(200, null);
  update jg_crash_secreto set punto = 5 where ronda = rid;
  r := crash_estado();
  if r->'ronda'->>'punto' is not null or jsonb_array_length(r->'apuestas') <> 3 then raise exception 'FALLO: crash_estado enseña el punto antes de tiempo o no lista las apuestas'; end if;
  if (select count(*) from jsonb_array_elements(r->'apuestas') a where a->>'auto' is not null) <> 0 then raise exception 'FALLO: crash_estado enseña la retirada automatica de otro'; end if;

  -- 5 s despues de arrancar: p1 retira
  update jg_crash set arranca = jg_ahora() - interval '5 seconds' where id = rid;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[4]), true);
  fallo := false; begin perform crash_apostar(100, null); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se ha podido apostar con la ronda en marcha'; end if;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  r := crash_retirar();
  if not (r->>'ok')::boolean or (r->>'retiro')::numeric < 1.34 or (r->>'retiro')::numeric > 1.36 then raise exception 'FALLO: retirar a los 5 s tenia que dar x1,34 y ha dado %', r->>'retiro'; end if;
  if (r->>'pago')::int <> floor(1000 * (r->>'retiro')::numeric) or jg_saldo(jug[1]) <> s0 - 1000 + (r->>'pago')::int then raise exception 'FALLO: el cobro de la retirada no cuadra'; end if;
  s1 := jg_saldo(jug[1]);
  r := crash_retirar();
  if jg_saldo(jug[1]) <> s1 then raise exception 'FALLO: retirar dos veces cobra dos veces'; end if;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[2]), true);
  r := crash_estado();
  if (select a->>'estado' from jsonb_array_elements(r->'apuestas') a where a->>'player' = jug[2]::text) <> 'viva' then raise exception 'FALLO: la retirada automatica x1,5 ha saltado antes de tiempo'; end if;
  -- 8 s: la automatica de p2 (x1,5 llega a los 6,8 s)
  update jg_crash set arranca = jg_ahora() - interval '8 seconds' where id = rid;
  r := crash_estado();
  if jg_saldo(jug[2]) <> s2 - 500 + 750 then raise exception 'FALLO: la retirada automatica x1,5 de 500 tenia que pagar 750 (saldo % en vez de %)', jg_saldo(jug[2]), s2 + 250; end if;
  -- 60 s: ya ha explotado en x5
  update jg_crash set arranca = jg_ahora() - interval '60 seconds' where id = rid;
  r := crash_estado();
  if r->'ronda'->>'estado' <> 'fin' or (r->'ronda'->>'punto')::numeric <> 5 then raise exception 'FALLO: la ronda tenia que haber explotado en x5: %', r->'ronda'; end if;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[3]), true);
  if jg_saldo(jug[3]) <> s3 - 200 then raise exception 'FALLO: el que no retira tenia que perder su apuesta'; end if;
  r := crash_retirar();
  if (r->>'ok')::boolean or not (r->>'tarde')::boolean then raise exception 'FALLO: retirar despues de explotar tenia que decir "tarde"'; end if;
  if jg_saldo(jug[3]) <> s3 - 200 then raise exception 'FALLO: retirar tarde ha pagado'; end if;
  resumen := resumen || 'Crash: apostar, retirar a x1,34, retirada automatica, explotar en x5, retirar tarde. ';

  -- explota en 1,00 nada mas arrancar: todos pierden. Y una automatica por encima del punto pierde; por debajo cobra.
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  s0 := jg_saldo(jug[1]);
  r := crash_apostar(400, null); rid := (r->>'ronda')::bigint;
  update jg_crash_secreto set punto = 1.00 where ronda = rid;
  update jg_crash set arranca = jg_ahora() - interval '1 second' where id = rid;
  r := crash_retirar();
  if (r->>'ok')::boolean then raise exception 'FALLO: en una ronda que explota en 1,00 se ha podido retirar'; end if;
  if jg_saldo(jug[1]) <> s0 - 400 then raise exception 'FALLO: explosion en 1,00: el saldo no cuadra'; end if;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[2]), true);
  s2 := jg_saldo(jug[2]);
  r := crash_apostar(100, 3.00); rid := (r->>'ronda')::bigint;
  update jg_crash_secreto set punto = 2.50 where ronda = rid;
  update jg_crash set arranca = jg_ahora() - interval '90 seconds' where id = rid;
  perform crash_estado();
  if jg_saldo(jug[2]) <> s2 - 100 then raise exception 'FALLO: una retirada automatica por encima del punto no tenia que cobrar'; end if;
  r := crash_apostar(100, 2.00); rid := (r->>'ronda')::bigint;
  update jg_crash_secreto set punto = 2.00 where ronda = rid;
  update jg_crash set arranca = jg_ahora() - interval '90 seconds' where id = rid;
  perform crash_estado();
  if jg_saldo(jug[2]) <> s2 - 200 + 200 then raise exception 'FALLO: una retirada automatica x2,00 con punto 2,00 tenia que pagar 200'; end if;
  resumen := resumen || 'Crash: explosion en 1,00 y automaticas. ';

  -- =========================================================== RULETA
  select count(*) filter (where p between 1 and 7), count(*) filter (where p between 8 and 14), count(*) filter (where p = 0), count(distinct p)
    into n, n2, cnt, i from (select floor(jg_rand() * 15)::int p from generate_series(1, 15000)) q;
  if n < 6400 or n > 7600 or n2 < 6400 or n2 > 7600 or cnt < 820 or cnt > 1180 or i <> 15 then
    raise exception 'FALLO: ruleta: 15.000 giros dieron % rojos, % negros, % verdes y % casillas distintas', n, n2, cnt, i; end if;
  resumen := resumen || format('Ruleta 15.000 giros: %s rojos, %s negros, %s verdes. ', n, n2, cnt);

  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  s1 := jg_saldo(jug[1]);
  fallo := false; begin perform ruleta_apostar('azul', 100); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: ruleta acepta un color que no existe'; end if;
  r := ruleta_apostar('rojo', 1000); rid := (r->>'ronda')::bigint;
  perform ruleta_apostar('negro', 50);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[2]), true);
  s2 := jg_saldo(jug[2]);
  perform ruleta_apostar('negro', 500);
  fallo := false; begin perform ruleta_apostar('rojo', 100000000); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: ruleta deja apostar mas de lo que se tiene'; end if;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[3]), true);
  s3 := jg_saldo(jug[3]);
  perform ruleta_apostar('verde', 100);
  r := ruleta_estado();
  if r->'ronda'->>'n' is not null or r->'ronda'->>'estado' <> 'apuestas' then raise exception 'FALLO: la ruleta enseña el numero antes de cerrar: %', r->'ronda'; end if;
  update jg_ruleta_secreto set n = 3 where ronda = rid;                           -- 3: rojo
  update jg_ruleta set cierra = jg_ahora() - interval '1 second' where id = rid;   -- se cierra
  r := ruleta_estado();
  if r->'ronda'->>'estado' <> 'giro' or (r->'ronda'->>'n')::int <> 3 or r->'ronda'->>'color' <> 'rojo' then raise exception 'FALLO: la ruleta tenia que estar girando con el 3 rojo: %', r->'ronda'; end if;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[4]), true);
  fallo := false; begin perform ruleta_apostar('rojo', 100); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: ruleta deja apostar con la bola girando'; end if;
  if jg_saldo(jug[1]) <> s1 - 1050 then raise exception 'FALLO: la ruleta ha pagado antes de acabar el giro'; end if;
  update jg_ruleta set cierra = jg_ahora() - interval '10 seconds' where id = rid;
  r := ruleta_estado();
  if r->'ronda'->>'estado' <> 'pagada' then raise exception 'FALLO: la ruleta tenia que haber pagado'; end if;
  if jg_saldo(jug[1]) <> s1 - 1050 + 2000 then raise exception 'FALLO: rojo con 1000 pagaba 2000 (saldo %)', jg_saldo(jug[1]); end if;
  if jg_saldo(jug[2]) <> s2 - 500 or jg_saldo(jug[3]) <> s3 - 100 then raise exception 'FALLO: los que no han acertado tenian que perder su apuesta'; end if;
  r := ruleta_estado(); perform ruleta_estado();
  if jg_saldo(jug[1]) <> s1 - 1050 + 2000 then raise exception 'FALLO: la ruleta paga mas de una vez'; end if;
  -- verde x14
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[3]), true);
  r := ruleta_apostar('verde', 100); rid := (r->>'ronda')::bigint;
  update jg_ruleta_secreto set n = 0 where ronda = rid;
  update jg_ruleta set cierra = jg_ahora() - interval '10 seconds' where id = rid;
  perform ruleta_estado();
  if jg_saldo(jug[3]) <> s3 - 100 - 100 + 1400 then raise exception 'FALLO: verde con 100 pagaba 1400 (saldo %)', jg_saldo(jug[3]); end if;
  resumen := resumen || 'Ruleta: rojo x2, negro y verde pierden, verde x14, sin apostar girando, no paga dos veces. ';

  -- =========================================================== BLACKJACK
  -- mazos fijos: orden de reparto jugador, banca (visible), jugador, banca (tapada), y luego las que se piden.
  -- cartas: 0 = as, 1 a 8 = 2 a 9, 9 a 12 = 10, J, Q, K.
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  -- 1. blackjack del jugador paga 3 a 2
  s0 := jg_saldo(jug[1]);
  hh := jg_bj_nueva(jug[1], 1000, array[0, 5, 12, 4]::smallint[] || filler);
  if hh.resultado <> 'blackjack' or hh.pago <> 2500 or jg_saldo(jug[1]) <> s0 + 1500 then raise exception 'FALLO: blackjack tenia que pagar 3 a 2 (2500 por 1000)'; end if;
  -- apuesta impar: 3 a 2 hacia abajo
  s0 := jg_saldo(jug[1]);
  hh := jg_bj_nueva(jug[1], 15, array[0, 5, 12, 4]::smallint[] || filler);
  if hh.pago <> 37 then raise exception 'FALLO: blackjack con 15 tenia que pagar 37 (ha pagado %)', hh.pago; end if;
  -- 2. blackjack de la banca: pierdes al momento y se ve su carta
  s0 := jg_saldo(jug[1]);
  hh := jg_bj_nueva(jug[1], 1000, array[9, 0, 8, 12]::smallint[] || filler);
  if hh.resultado <> 'pierde' or hh.estado <> 'fin' or cardinality(hh.banca) <> 2 or jg_saldo(jug[1]) <> s0 - 1000 then raise exception 'FALLO: blackjack de la banca'; end if;
  -- 3. los dos blackjack: empate, vuelve la apuesta
  s0 := jg_saldo(jug[1]);
  hh := jg_bj_nueva(jug[1], 1000, array[0, 12, 12, 0]::smallint[] || filler);
  if hh.resultado <> 'empate' or jg_saldo(jug[1]) <> s0 then raise exception 'FALLO: dos blackjack tenian que ser empate'; end if;
  -- 4. pedir hasta pasarse: pierdes. Se ve la carta tapada al acabar.
  s0 := jg_saldo(jug[1]);
  hh := jg_bj_nueva(jug[1], 1000, array[9, 5, 5, 6, 12]::smallint[] || filler);   -- 10+6 = 16 contra 6+7, sale un K
  hid := hh.id;
  r := bj_estado();
  if cardinality(hh.banca) <> 1 or jsonb_array_length(r->'mano'->'banca') <> 1 then raise exception 'FALLO: la banca enseña su carta tapada mientras se juega'; end if;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[2]), true);
  fallo := false; begin perform bj_pedir(hid); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: otro jugador ha podido pedir carta en mi mano'; end if;
  fallo := false; begin perform bj_plantarse(hid); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: otro jugador ha podido plantar mi mano'; end if;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  fallo := false; begin perform bj_repartir(100); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se puede repartir con una mano en juego'; end if;
  r := bj_pedir(hid);
  if r->'mano'->>'resultado' <> 'pierde' or (r->'mano'->>'valor')::int <> 26 or jg_saldo(jug[1]) <> s0 - 1000 then raise exception 'FALLO: pasarse de 21 tenia que perder: %', r->'mano'; end if;
  fallo := false; begin perform bj_pedir(hid); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se ha podido pedir carta en una mano terminada'; end if;
  -- 5. plantarse: la banca pide hasta 17 y se pasa (16 + K): ganas el doble
  s0 := jg_saldo(jug[1]);
  hh := jg_bj_nueva(jug[1], 1000, array[9, 9, 8, 5, 12]::smallint[] || filler);   -- 19 contra 10+6
  r := bj_plantarse(hh.id);
  if r->'mano'->>'resultado' <> 'gana' or (r->'mano'->>'valor_banca')::int <> 26 or jg_saldo(jug[1]) <> s0 + 1000 then raise exception 'FALLO: la banca se pasa y el jugador gana: %', r->'mano'; end if;
  -- 6. la banca se planta en un 17 blando (as + 6); el jugador con 18 gana
  s0 := jg_saldo(jug[1]);
  hh := jg_bj_nueva(jug[1], 1000, array[9, 0, 7, 5]::smallint[] || filler);
  r := bj_plantarse(hh.id);
  if r->'mano'->>'resultado' <> 'gana' or jsonb_array_length(r->'mano'->'banca') <> 2 then raise exception 'FALLO: la banca se planta en todos los 17: %', r->'mano'; end if;
  -- 7. empate con 19 contra 19: vuelve la apuesta
  s0 := jg_saldo(jug[1]);
  hh := jg_bj_nueva(jug[1], 1000, array[9, 9, 8, 8]::smallint[] || filler);
  r := bj_plantarse(hh.id);
  if r->'mano'->>'resultado' <> 'empate' or jg_saldo(jug[1]) <> s0 then raise exception 'FALLO: 19 contra 19 tenia que ser empate: %', r->'mano'; end if;
  -- 8. doblar: 5+6 = 11, pones otra vez 1000, te sale un 10 (21) y la banca se queda en 18
  s0 := jg_saldo(jug[1]);
  hh := jg_bj_nueva(jug[1], 1000, array[4, 9, 5, 7, 9]::smallint[] || filler);
  r := bj_doblar(hh.id);
  if r->'mano'->>'resultado' <> 'gana' or (r->'mano'->>'apostado')::int <> 2000 or jg_saldo(jug[1]) <> s0 + 2000 then raise exception 'FALLO: doblar y ganar tenia que pagar 4000 por 2000 puestos: %', r->'mano'; end if;
  -- doblar y pasarse: pierdes los dos mil
  s0 := jg_saldo(jug[1]);
  hh := jg_bj_nueva(jug[1], 1000, array[9, 9, 5, 7, 12]::smallint[] || filler);   -- 10+6 doblas y sale K
  r := bj_doblar(hh.id);
  if r->'mano'->>'resultado' <> 'pierde' or jg_saldo(jug[1]) <> s0 - 2000 then raise exception 'FALLO: doblar y pasarse tenia que perder 2000: %', r->'mano'; end if;
  -- no se dobla con tres cartas, ni sin saldo
  hh := jg_bj_nueva(jug[1], 1000, array[1, 9, 1, 8, 1]::smallint[] || filler);      -- 2+2, la banca 10+9
  r := bj_pedir(hh.id);                                                              -- 2+2+2 = 6
  fallo := false; begin perform bj_doblar(hh.id); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se ha doblado con tres cartas'; end if;
  perform bj_plantarse(hh.id);
  s0 := jg_saldo(jug[1]);
  insert into ledger(player, amount, kind, note) values (jug[1], 5000 - s0, 'ajuste', 'me quedan 5000');   -- la apuesta maxima es 100.000: para jugarselo todo hay que tener menos
  s0 := 5000;
  hh := jg_bj_nueva(jug[1], s0, array[9, 9, 5, 7, 4]::smallint[] || filler);
  fallo := false; begin perform bj_doblar(hh.id); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se ha doblado sin saldo para la segunda apuesta'; end if;
  perform bj_plantarse(hh.id);
  insert into ledger(player, amount, kind, note) values (jug[1], 100000, 'ajuste', 'saldo de prueba');
  -- 9. llegar a 21 pidiendo: te plantas solo
  s0 := jg_saldo(jug[1]);
  hh := jg_bj_nueva(jug[1], 1000, array[4, 9, 5, 7, 9]::smallint[] || filler);      -- 11, pides un 10: 21
  r := bj_pedir(hh.id);
  if r->'mano'->>'estado' <> 'fin' or r->'mano'->>'resultado' <> 'gana' then raise exception 'FALLO: 21 pidiendo tenia que plantarse solo y ganar a 18: %', r->'mano'; end if;
  -- 10. 300 manos al azar plantandose siempre: la banca siempre acaba con 17 o mas y no hay cartas repetidas
  n := 0;
  for i in 1..300 loop
    r := bj_repartir(100);
    if r->'mano'->>'estado' = 'curso' then r := bj_plantarse((r->'mano'->>'id')::bigint); end if;
    select * into hh from jg_bj where id = (r->'mano'->>'id')::bigint;
    if hh.resultado in ('gana','empate','pierde') and jg_bj_total(hh.banca) < 17 then raise exception 'FALLO: la banca se ha plantado con % (tiene que pedir hasta 17)', jg_bj_total(hh.banca); end if;
    if (select count(distinct c) from unnest(hh.jugador || hh.banca) c) <> cardinality(hh.jugador || hh.banca) then raise exception 'FALLO: una carta repetida en una mano'; end if;
    if hh.resultado = 'blackjack' then n := n + 1; end if;
  end loop;
  resumen := resumen || format('Blackjack: 3 a 2, blackjack de la banca, empates, pedir, plantarse, 17 blando, doblar, 300 manos al azar (%s blackjack). ', n);

  -- =========================================================== PLINKO
  for i in 1..3 loop
    select sum(c * m) / 4096.0 into x
      from unnest(array[1,12,66,220,495,792,924,792,495,220,66,12,1]) with ordinality a(c, p),
           unnest(plinko_mults((array['bajo','medio','alto'])[i])) with ordinality b(m, q) where p = q;
    if x < 0.95 or x > 0.99 then raise exception 'FALLO: plinko %: la devolucion media es % (esperado cerca de 0,97)', (array['bajo','medio','alto'])[i], round(x, 4); end if;
    resumen := resumen || format('Plinko %s devuelve de media %s. ', (array['bajo','medio','alto'])[i], round(x, 3));
  end loop;
  s0 := jg_saldo(jug[1]);
  r := plinko_soltar(1000, 'alto');
  if jsonb_array_length(r->'camino') <> 12 or (r->>'k')::int <> (select sum(c::int) from jsonb_array_elements_text(r->'camino') c) then raise exception 'FALLO: el camino de plinko no cuadra con la casilla'; end if;
  if (r->>'mult')::numeric <> (plinko_mults('alto'))[(r->>'k')::int + 1] or (r->>'pago')::int <> floor(1000 * (r->>'mult')::numeric) then raise exception 'FALLO: el multiplicador o el pago de plinko no cuadra'; end if;
  if jg_saldo(jug[1]) <> s0 - 1000 + (r->>'pago')::int then raise exception 'FALLO: el saldo tras plinko no cuadra'; end if;
  fallo := false; begin perform plinko_soltar(100, 'extremo'); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: plinko acepta un riesgo que no existe'; end if;
  fallo := false; begin perform plinko_soltar(-5, 'bajo'); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: plinko acepta una apuesta negativa'; end if;
  fallo := false; begin perform plinko_soltar(jg_saldo(jug[1]) + 1, 'bajo'); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: plinko deja apostar mas de lo que se tiene'; end if;
  n := 0;
  for i in 1..600 loop n := n + (plinko_soltar(10, 'medio')->>'k')::int; end loop;
  if n < 3420 or n > 3780 then raise exception 'FALLO: plinko: la casilla media de 600 bolas es % (esperado 6)', round(n / 600.0, 2); end if;
  resumen := resumen || format('Plinko: 600 bolas con casilla media %s. ', round(n / 600.0, 2));

  -- =========================================================== SECRETOS Y PERMISOS
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  set local role authenticated;
  v_ok := true;
  begin perform 1 from jg_crash_secreto limit 1; v_ok := false; exception when insufficient_privilege then null; end;
  if not v_ok then reset role; raise exception 'FALLO: un jugador puede leer jg_crash_secreto (el punto de explosion)'; end if;
  begin perform 1 from jg_ruleta_secreto limit 1; v_ok := false; exception when insufficient_privilege then null; end;
  if not v_ok then reset role; raise exception 'FALLO: un jugador puede leer jg_ruleta_secreto'; end if;
  begin perform 1 from jg_bj_mazo limit 1; v_ok := false; exception when insufficient_privilege then null; end;
  if not v_ok then reset role; raise exception 'FALLO: un jugador puede leer jg_bj_mazo (el mazo)'; end if;
  begin perform 1 from jg_bj limit 1; v_ok := false; exception when insufficient_privilege then null; end;
  if not v_ok then reset role; raise exception 'FALLO: un jugador puede leer jg_bj directamente'; end if;
  begin perform 1 from jg_crash_apuestas limit 1; v_ok := false; exception when insufficient_privilege then null; end;
  if not v_ok then reset role; raise exception 'FALLO: un jugador puede leer jg_crash_apuestas (la retirada automatica de los demas)'; end if;
  begin insert into ledger(player, amount, kind, note) values (jug[1], 99999, 'plinko', 'trampa'); v_ok := false; exception when insufficient_privilege then null; end;
  if not v_ok then reset role; raise exception 'FALLO: un jugador puede escribir en ledger'; end if;
  begin update jg_crash set punto = 1 where true; v_ok := false; exception when insufficient_privilege then null; end;
  if not v_ok then reset role; raise exception 'FALLO: un jugador puede cambiar una ronda de crash'; end if;
  begin perform jg_cobrar(jug[2], 10, 'crash', 'trampa'); v_ok := false; exception when insufficient_privilege then null; end;
  if not v_ok then reset role; raise exception 'FALLO: un jugador puede llamar a jg_cobrar'; end if;
  begin perform jg_abonar(jug[1], 10, 'crash', 'trampa'); v_ok := false; exception when insufficient_privilege then null; end;
  if not v_ok then reset role; raise exception 'FALLO: un jugador puede llamar a jg_abonar (darse dinero)'; end if;
  begin perform jg_bj_nueva(jug[1], 10, array[0,1,2,3]::smallint[]); v_ok := false; exception when insufficient_privilege then null; end;
  if not v_ok then reset role; raise exception 'FALLO: un jugador puede repartir con un mazo elegido por el'; end if;
  begin perform crash_cerrar(1); v_ok := false; exception when insufficient_privilege then null; end;
  if not v_ok then reset role; raise exception 'FALLO: un jugador puede llamar a crash_cerrar'; end if;
  perform crash_estado();                                              -- lo permitido sigue funcionando
  reset role;
  set local role anon;
  begin perform crash_estado(); v_ok := false; exception when insufficient_privilege then null; end;
  if not v_ok then reset role; raise exception 'FALLO: alguien sin cuenta puede llamar a crash_estado'; end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  fallo := false; begin perform plinko_soltar(10, 'bajo'); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se puede jugar sin haber entrado'; end if;
  resumen := resumen || 'Los secretos y las funciones internas estan cerrados a los jugadores.';

  raise exception 'PRUEBA SUPERADA (se deshace todo): %', resumen;
end $$;
