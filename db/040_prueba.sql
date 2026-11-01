-- Prueba de db/040_blackjack_mesa.sql (la mesa de blackjack compartida), para el editor SQL de Supabase. Va despues de 040.
-- Con los jugadores de verdad (hacen falta al menos cinco). Los mazos se fijan para probar cada regla y el tiempo se adelanta
-- tocando la ronda (esto corre como administrador). Prueba:
--   1) cuatro amigos en la misma ronda: blackjack 3 a 2, pedir hasta 21, doblar, plantarse, empate, turno que caduca (se planta
--      solo), la banca pide hasta 17, y los pagos exactos al ledger con kind 'blackjack';
--   2) nadie juega el turno de otro, nadie lee el mazo ni la carta tapada, nadie llama a las funciones internas;
--   3) sin saldo no se apuesta; apostar te sienta; quitar la apuesta la devuelve; no se apuesta dos veces;
--   4) te pasas y pierdes aunque la banca se pase; la banca se pasa y paga;
--   5) la banca con blackjack: se acaba al repartir (blackjack contra blackjack empata);
--   6) irse a mitad de mano y turnos que caducan seguidos: la mesa no se queda parada;
--   7) la cuenta de apuestas acaba sola y reparte con un mazo barajado;
--   8) 300 rondas al azar con jugadas al azar: cada pago se recalcula aparte y cuadra con el ledger, ninguna carta sale dos veces;
--   9) sin limite de perdida al dia;
--  10) el ranking cuenta la mesa.
-- Al final lanza un error A PROPOSITO para que se deshaga todo: no queda nada guardado. Si todo va bien, el error dice
-- "PRUEBA SUPERADA" con el resumen. Si algo falla, dice "FALLO" y que.
do $$
declare
  jug uuid[] := array(select id from players order by created_at, id limit 5);
  r jsonb; m jsonb; fallo boolean; resumen text := ''; i int; k int; n int; rid bigint; rd bjm_ronda; mano bjm_mano;
  s0 int[]; s1 int[]; v int; vb int; esperado int; nat boolean; dbj boolean; vivas boolean; b smallint[]; todas smallint[];
  mazo smallint[]; sec bjm_secreto; uno uuid; accion int; rondas int := 0; manos int := 0; pagado bigint := 0; puesto bigint := 0;
  rk0 jsonb; rk1 jsonb; n0 int; n1 int; err text;
  relleno smallint[] := array(select 1::smallint from generate_series(1, 40));            -- doses de relleno
begin
  if cardinality(jug) < 5 then raise exception 'FALLO: hacen falta al menos cinco jugadores'; end if;
  delete from bjm_asiento; delete from bjm_ronda;                                          -- la mesa vacia (se deshace al final)
  perform pay_week();                                                                      -- la paga de esta semana, para que no entre a mitad
  -- cada uno con 1.000 justos
  insert into ledger(player, amount, kind, note) select p, 1000 - (select coalesce(sum(amount), 0) from ledger where player = p)::int, 'ajuste', 'prueba 040'
    from unnest(jug) p;
  for i in 1..5 loop if jg_saldo(jug[i]) <> 1000 then raise exception 'FALLO: no consigo dejar a todos con 1.000'; end if; end loop;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  rk0 := jg_ranking('blackjack', 'siempre');

  -- ===================================================== 2) permisos (antes de nada)
  if has_table_privilege('authenticated', 'bjm_secreto', 'select') or has_table_privilege('authenticated', 'bjm_mano', 'select')
     or has_table_privilege('authenticated', 'bjm_ronda', 'select') or has_table_privilege('authenticated', 'bjm_asiento', 'select')
     or has_table_privilege('authenticated', 'bjm_mano', 'update') or has_table_privilege('authenticated', 'bjm_ronda', 'insert') then
    raise exception 'FALLO: un jugador puede leer o tocar las tablas de la mesa'; end if;
  if has_table_privilege('anon', 'bjm_secreto', 'select') then raise exception 'FALLO: sin entrar se lee el mazo'; end if;
  if not has_table_privilege('authenticated', 'bjm_pulso', 'select') then raise exception 'FALLO: el pulso de la mesa no se puede escuchar'; end if;
  if (select count(*) from pg_policies where tablename in ('bjm_secreto', 'bjm_mano', 'bjm_ronda', 'bjm_asiento')) > 0 then raise exception 'FALLO: hay politicas de lectura en la mesa'; end if;
  if has_function_privilege('authenticated', 'bjm_repartir(bigint, smallint[])', 'execute') or has_function_privilege('authenticated', 'bjm_tick()', 'execute')
     or has_function_privilege('authenticated', 'bjm_pagar(bigint)', 'execute') or has_function_privilege('authenticated', 'bjm_siguiente(bigint, timestamptz)', 'execute')
     or has_function_privilege('authenticated', 'bjm_vista(uuid)', 'execute') or has_function_privilege('authenticated', 'bjm_sienta(uuid, int)', 'execute')
     or has_function_privilege('authenticated', 'bjm_baraja()', 'execute') or has_function_privilege('authenticated', 'bjm_mi_turno(uuid)', 'execute') then
    raise exception 'FALLO: un jugador puede llamar a una funcion interna de la mesa'; end if;
  if has_function_privilege('anon', 'bjm_estado()', 'execute') or has_function_privilege('anon', 'bjm_apostar(int, int)', 'execute') then raise exception 'FALLO: sin entrar se juega'; end if;
  if not has_function_privilege('authenticated', 'bjm_apostar(int, int)', 'execute') or not has_function_privilege('authenticated', 'bjm_pedir()', 'execute') then
    raise exception 'FALLO: un jugador no puede jugar en la mesa'; end if;
  if has_function_privilege('authenticated', 'bj_repartir(int)', 'execute') or has_function_privilege('authenticated', 'bj_pedir(bigint)', 'execute') then
    raise exception 'FALLO: se siguen pudiendo jugar manos sueltas'; end if;
  resumen := resumen || 'permisos ok. ';

  -- ===================================================== 1) cuatro amigos en la misma ronda
  -- la mesa espera: sin apuestas no hay ronda
  r := bjm_estado();
  if r->'ronda' <> 'null'::jsonb then raise exception 'FALLO: hay ronda sin que nadie apueste'; end if;
  for i in 1..4 loop
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[i]), true);
    r := bjm_sentarse(i);
  end loop;
  if jsonb_array_length(r->'asientos') <> 4 or (r->>'yo')::int <> 4 then raise exception 'FALLO: no se sientan los cuatro: %', r->'asientos'; end if;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[2]), true);
  fallo := false; begin perform bjm_sentarse(1); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: me siento en un asiento ocupado'; end if;
  -- apuestas: 100, 50, 40 y 20
  for i in 1..4 loop
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[i]), true);
    r := bjm_apostar((array[100, 50, 40, 20])[i]);
  end loop;
  select * into rd from bjm_ronda where estado <> 'fin';
  if rd.estado <> 'apuestas' or rd.cierra < jg_ahora() + interval '8 seconds' then raise exception 'FALLO: la cuenta de apuestas no va: %', rd; end if;
  if (select count(*) from bjm_mano where ronda = rd.id) <> 4 then raise exception 'FALLO: no estan las cuatro apuestas'; end if;
  if jg_saldo(jug[1]) <> 900 or jg_saldo(jug[4]) <> 980 then raise exception 'FALLO: la apuesta no se cobra al momento'; end if;
  if not (jg_resumen()->>'bj')::boolean then raise exception 'FALLO: el resumen de Juegos no ve la ronda'; end if;
  fallo := false; begin perform bjm_apostar(10); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se apuesta dos veces en la misma mano'; end if;
  -- mazo: 1-4 primera carta de cada asiento, 5 banca vista, 6-9 segunda carta, 10 la tapada, 11 en adelante lo que se pida
  --   asiento 1: A + K = blackjack | 2: 10 + 6 = 16, pide un 5: 21 | 3: 5 + 6 = 11, dobla con un 9: 20 | 4: 10 + 7 = 17, no juega
  --   banca: K vista + 6 tapada = 16, pide un 4: 20
  mazo := array[0, 9, 4, 22, 12, 25, 5, 18, 6, 31, 4, 8, 3]::smallint[] || relleno;
  perform bjm_repartir(rd.id, mazo);
  select * into rd from bjm_ronda where id = rd.id;
  if rd.estado <> 'turnos' or rd.turno <> 2 then raise exception 'FALLO: tras repartir deberia jugar el asiento 2 (el 1 tiene blackjack): %', rd; end if;
  if rd.plazo < rd.repartida + bjm_t_reparto(4) + bjm_t_turno() - interval '1 second' then raise exception 'FALLO: el primer turno no espera al reparto'; end if;
  if (select estado from bjm_mano where ronda = rd.id and asiento = 1) <> 'blackjack' then raise exception 'FALLO: A + K no es blackjack'; end if;
  -- lo que ve el asiento 4: la banca con una sola carta, tapada, sin mazo ni hueco
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[4]), true);
  r := bjm_estado();
  if jsonb_array_length(r->'ronda'->'banca') <> 1 or not (r->'ronda'->>'tapada')::boolean or (r->'ronda'->>'valor_banca')::int <> 10 then
    raise exception 'FALLO: se ve la carta tapada de la banca: %', r->'ronda'; end if;
  if r::text ~ '"(mazo|hueco|sig)"' then raise exception 'FALLO: el estado ensena el mazo'; end if;
  if jsonb_array_length(r->'manos') <> 4 or (r->'manos'->1->>'valor')::int <> 16 then raise exception 'FALLO: no se ven las manos de todos: %', r->'manos'; end if;
  -- 2) nadie juega el turno de otro
  for i in 1..4 loop
    continue when i = 2;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[i]), true);
    fallo := false; begin perform bjm_pedir(); exception when others then fallo := true; err := sqlerrm; end;
    if not fallo then raise exception 'FALLO: el asiento % pide carta en el turno del 2', i; end if;
    fallo := false; begin perform bjm_plantarse(); exception when others then fallo := true; end;
    if not fallo then raise exception 'FALLO: el asiento % se planta en el turno del 2', i; end if;
    fallo := false; begin perform bjm_doblar(); exception when others then fallo := true; end;
    if not fallo then raise exception 'FALLO: el asiento % dobla en el turno del 2', i; end if;
  end loop;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[5]), true);
  fallo := false; begin perform bjm_pedir(); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: alguien que no juega pide carta'; end if;
  if jg_saldo(jug[3]) <> 960 then raise exception 'FALLO: doblar fuera de turno cobra'; end if;
  -- el 2 pide: 21, se planta solo y pasa al 3
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[2]), true);
  r := bjm_pedir();
  select * into rd from bjm_ronda where id = rd.id;
  if rd.turno <> 3 or (select estado from bjm_mano where ronda = rd.id and asiento = 2) <> 'plantada' then raise exception 'FALLO: con 21 no se planta solo: %', rd; end if;
  fallo := false; begin perform bjm_pedir(); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: el 2 sigue pidiendo despues de plantarse'; end if;
  -- el 3 dobla: paga otros 40, recibe un 9 (20) y pasa al 4
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[3]), true);
  r := bjm_doblar();
  select * into mano from bjm_mano where ronda = rd.id and asiento = 3;
  if not mano.doblada or mano.total <> 80 or jg_bj_total(mano.cartas) <> 20 or cardinality(mano.cartas) <> 3 or mano.estado <> 'plantada' then raise exception 'FALLO: doblar: %', mano; end if;
  if jg_saldo(jug[3]) <> 920 then raise exception 'FALLO: doblar no cobra lo mismo otra vez'; end if;
  fallo := false; begin perform bjm_doblar(); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se dobla dos veces'; end if;
  select * into rd from bjm_ronda where id = rd.id;
  if rd.turno <> 4 then raise exception 'FALLO: tras doblar no pasa al 4'; end if;
  -- al 4 se le acaba el tiempo: el siguiente que mire la mesa (cualquiera) lo planta, juega la banca y se paga
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[5]), true);
  r := bjm_estado();
  if r->'ronda'->>'estado' <> 'turnos' then raise exception 'FALLO: la ronda avanza antes de que acabe el tiempo'; end if;
  update bjm_ronda set plazo = jg_ahora() - interval '1 second' where id = rd.id;
  r := bjm_estado();
  select * into rd from bjm_ronda where id = rd.id;
  if rd.estado <> 'fin' then raise exception 'FALLO: con el tiempo acabado la mesa no sigue: %', rd; end if;
  if rd.banca <> array[12, 31, 3]::smallint[] then raise exception 'FALLO: la banca no pide hasta 17: %', rd.banca; end if;
  select * into mano from bjm_mano where ronda = rd.id and asiento = 4;
  if not mano.auto or mano.estado <> 'plantada' then raise exception 'FALLO: el 4 no se planta solo al acabarse su tiempo: %', mano; end if;
  -- pagos: 1 blackjack 100 -> 250 | 2 21 contra 20 -> 100 | 3 20 contra 20 -> empate, 80 | 4 17 contra 20 -> pierde
  if (select string_agg(resultado || ':' || pago, ' ' order by asiento) from bjm_mano where ronda = rd.id) <> 'blackjack:250 gana:100 empate:80 pierde:0' then
    raise exception 'FALLO: pagos: %', (select string_agg(resultado || ':' || pago, ' ' order by asiento) from bjm_mano where ronda = rd.id); end if;
  if jg_saldo(jug[1]) <> 1150 or jg_saldo(jug[2]) <> 1050 or jg_saldo(jug[3]) <> 1000 or jg_saldo(jug[4]) <> 980 then
    raise exception 'FALLO: saldos tras la ronda: % % % %', jg_saldo(jug[1]), jg_saldo(jug[2]), jg_saldo(jug[3]), jg_saldo(jug[4]); end if;
  if exists (select 1 from ledger where note like 'Blackjack%' and kind <> 'blackjack') then raise exception 'FALLO: la mesa apunta movimientos que no son blackjack'; end if;
  if (select sum(amount) from ledger where player = jug[1] and kind = 'blackjack' and created_at >= now()) <> 150 then raise exception 'FALLO: el ledger del 1 no suma +150'; end if;
  r := bjm_estado();
  if r->'ronda'->>'estado' <> 'fin' or jsonb_array_length(r->'ronda'->'banca') <> 3 or (r->'ronda'->>'valor_banca')::int <> 20 then raise exception 'FALLO: al acabar no se ve la banca'; end if;
  resumen := resumen || 'ronda de cuatro ok. ';

  -- ===================================================== 3) sin saldo, apostar te sienta, quitar, la mesa espera
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[5]), true);
  insert into ledger(player, amount, kind, note) values (jug[5], -990, 'ajuste', 'prueba 040');
  fallo := false; begin perform bjm_apostar(11); exception when others then fallo := true; err := sqlerrm; end;
  if not fallo or err !~ 'saldo' then raise exception 'FALLO: se apuesta mas de lo que se tiene (%)', err; end if;
  if exists (select 1 from bjm_ronda where estado <> 'fin') then raise exception 'FALLO: una apuesta sin saldo abre ronda'; end if;
  if exists (select 1 from bjm_asiento where player = jug[5]) then raise exception 'FALLO: una apuesta fallida sienta'; end if;
  fallo := false; begin perform bjm_apostar(0); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se apuesta 0'; end if;
  r := bjm_apostar(10, 6);                                                   -- todo lo que tiene; se sienta solo en el 6
  if (r->>'yo')::int <> 6 or jg_saldo(jug[5]) <> 0 then raise exception 'FALLO: apostar no sienta o no cobra: %', r->'yo'; end if;
  r := bjm_quitar();
  if jg_saldo(jug[5]) <> 10 or exists (select 1 from bjm_ronda where estado <> 'fin') then raise exception 'FALLO: quitar la apuesta no la devuelve o la ronda vacia sigue'; end if;
  r := bjm_levantarse();
  if exists (select 1 from bjm_asiento where player = jug[5]) then raise exception 'FALLO: no se levanta'; end if;
  insert into ledger(player, amount, kind, note) values (jug[5], 990, 'ajuste', 'prueba 040');
  resumen := resumen || 'saldo y asientos ok. ';

  -- ===================================================== 4) te pasas y pierdes aunque la banca se pase; la banca se pasa y paga
  for i in 1..2 loop
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[i]), true);
    r := bjm_apostar(100 * (3 - i));                                         -- 200 y 100
  end loop;
  select * into rd from bjm_ronda where estado <> 'fin';
  -- 1: 10 + 6 = 16, pide K: se pasa | 2: 9 + 7 = 16, se planta | banca 6 + 10 = 16, pide 10: se pasa
  perform bjm_repartir(rd.id, array[9, 8, 5, 18, 6, 22, 12, 35]::smallint[] || relleno);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  r := bjm_pedir();
  if (select estado from bjm_mano where ronda = rd.id and asiento = 1) <> 'pasada' then raise exception 'FALLO: con 26 no se pasa'; end if;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[2]), true);
  r := bjm_plantarse();
  select * into rd from bjm_ronda where id = rd.id;
  if rd.estado <> 'fin' or jg_bj_total(rd.banca) <> 26 then raise exception 'FALLO: la banca no se pasa: %', rd; end if;
  if (select string_agg(resultado || ':' || pago, ' ' order by asiento) from bjm_mano where ronda = rd.id) <> 'pierde:0 gana:200' then raise exception 'FALLO: pasarse o banca pasada mal pagado'; end if;
  if jg_saldo(jug[1]) <> 950 or jg_saldo(jug[2]) <> 1150 then raise exception 'FALLO: saldos tras pasarse: % %', jg_saldo(jug[1]), jg_saldo(jug[2]); end if;
  resumen := resumen || 'pasarse ok. ';

  -- ===================================================== 5) la banca con blackjack se acaba al repartir
  for i in 1..3 loop
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[i]), true);
    r := bjm_apostar(10);
  end loop;
  select * into rd from bjm_ronda where estado <> 'fin';
  -- 1: A + Q blackjack | 2: 10 + 9 | 3: 5 + 5 | banca: A vista + K tapada
  perform bjm_repartir(rd.id, array[13, 9, 4, 0, 24, 8, 17, 12]::smallint[] || relleno);
  select * into rd from bjm_ronda where id = rd.id;
  if rd.estado <> 'fin' or rd.banca <> array[0, 12]::smallint[] then raise exception 'FALLO: la banca con blackjack no acaba la ronda: %', rd; end if;
  if (select string_agg(resultado || ':' || pago, ' ' order by asiento) from bjm_mano where ronda = rd.id) <> 'empate:10 pierde:0 pierde:0' then
    raise exception 'FALLO: blackjack de la banca mal pagado: %', (select string_agg(resultado || ':' || pago, ' ' order by asiento) from bjm_mano where ronda = rd.id); end if;
  resumen := resumen || 'blackjack de la banca ok. ';

  -- ===================================================== 6) irse a mitad de mano y turnos que caducan seguidos
  for i in 1..3 loop
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[i]), true);
    r := bjm_apostar(10);
  end loop;
  select * into rd from bjm_ronda where estado <> 'fin';
  -- 1: 10 + 2 | 2: 10 + 3 | 3: 10 + 4 | banca 10 + 7 = 17
  perform bjm_repartir(rd.id, array[9, 22, 35, 48, 1, 2, 3, 6]::smallint[] || relleno);
  select * into rd from bjm_ronda where id = rd.id;
  if rd.turno <> 1 then raise exception 'FALLO: empieza el que no es'; end if;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  r := bjm_levantarse();                                                     -- se va en su turno: se planta solo y sigue el 2
  select * into rd from bjm_ronda where id = rd.id;
  if rd.turno <> 2 or not (select auto from bjm_mano where ronda = rd.id and asiento = 1) then raise exception 'FALLO: irse en tu turno bloquea la mesa: %', rd; end if;
  -- el 2 y el 3 no hacen nada: cada vez que vence un plazo, el siguiente que mira lo resuelve
  update bjm_ronda set plazo = jg_ahora() - interval '1 second' where id = rd.id;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[5]), true);
  r := bjm_estado();
  select * into rd from bjm_ronda where id = rd.id;
  if rd.turno <> 3 or rd.plazo < jg_ahora() + bjm_t_turno() - interval '2 seconds' then raise exception 'FALLO: el 3 no recibe su tiempo entero: %', rd; end if;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[3]), true);
  fallo := false; begin perform bjm_sentarse(7); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: cambia de asiento con la mano a medias'; end if;
  update bjm_ronda set plazo = jg_ahora() - interval '1 second' where id = rd.id;
  fallo := false; begin perform bjm_pedir(); exception when others then fallo := true; end;      -- tarde: ya no es su turno
  if not fallo then raise exception 'FALLO: se juega con el tiempo acabado'; end if;
  r := bjm_estado();
  select * into rd from bjm_ronda where id = rd.id;
  if rd.estado <> 'fin' then raise exception 'FALLO: con todos quietos la mesa se queda parada'; end if;
  if (select count(*) from bjm_mano where ronda = rd.id and auto) <> 3 or (select count(*) from bjm_mano where ronda = rd.id and resultado = 'pierde') <> 3 then
    raise exception 'FALLO: los quietos no se plantan solos o mal pagados'; end if;
  -- el que se fue y no mira: al minuto pierde el asiento (los demas lo conservan mientras miran)
  if exists (select 1 from bjm_asiento where player = jug[1]) then raise exception 'FALLO: levantarse no deja el asiento'; end if;
  update bjm_asiento set visto = jg_ahora() - interval '2 minutes' where player = jug[2];
  r := bjm_estado();
  if exists (select 1 from bjm_asiento where player = jug[2]) or not exists (select 1 from bjm_asiento where player = jug[3]) then raise exception 'FALLO: los asientos de quien no mira no se liberan'; end if;
  resumen := resumen || 'nadie bloquea la mesa. ';

  -- ===================================================== 7) la cuenta acaba sola y reparte con un mazo barajado
  for i in 1..3 loop
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[i]), true);
    r := bjm_apostar(5);
  end loop;
  select * into rd from bjm_ronda where estado <> 'fin';
  update bjm_ronda set cierra = jg_ahora() - interval '1 second' where id = rd.id;
  r := bjm_estado();
  select * into rd from bjm_ronda where id = rd.id;
  select * into sec from bjm_secreto where ronda = rd.id;
  if rd.estado = 'apuestas' or cardinality(sec.mazo) <> 312 or exists (select 1 from bjm_mano where ronda = rd.id and cardinality(cartas) < 2) then raise exception 'FALLO: la cuenta acaba y no se reparte'; end if;
  if (select count(distinct x) from unnest(sec.mazo) x) <> 52 or exists (select 1 from (select x, count(*) c from unnest(sec.mazo) x group by x) y where c <> 6) then raise exception 'FALLO: el mazo no son 6 barajas'; end if;
  -- se acaba (todos quietos)
  for k in 1..5 loop
    exit when rd.estado = 'fin';
    update bjm_ronda set plazo = jg_ahora() - interval '1 second' where id = rd.id;
    r := bjm_estado();
    select * into rd from bjm_ronda where id = rd.id;
  end loop;
  if rd.estado <> 'fin' then raise exception 'FALLO: la ronda barajada no acaba'; end if;
  resumen := resumen || 'reparto solo ok. ';

  -- ===================================================== 8) 300 rondas al azar
  update bjm_asiento set visto = jg_ahora();
  for i in 1..5 loop insert into ledger(player, amount, kind, note) values (jug[i], 50000, 'ajuste', 'prueba 040'); end loop;
  for k in 1..300 loop
    s0 := array(select jg_saldo(p) from unnest(jug) p);
    n := 0;
    for i in 1..5 loop
      continue when random() < 0.3;
      perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[i]), true);
      r := bjm_apostar(1 + floor(random() * 300)::int);
      n := n + 1;
    end loop;
    continue when n = 0;
    select * into rd from bjm_ronda where estado <> 'fin';
    update bjm_ronda set cierra = jg_ahora() - interval '1 second' where id = rd.id;
    r := bjm_estado();
    for i in 1..60 loop
      select * into rd from bjm_ronda where id = rd.id;
      exit when rd.estado = 'fin';
      select player into uno from bjm_mano where ronda = rd.id and asiento = rd.turno;
      perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', uno), true);
      accion := floor(random() * 4)::int;
      if accion = 0 then r := bjm_pedir();
      elsif accion = 1 then r := bjm_plantarse();
      elsif accion = 2 then begin r := bjm_doblar(); exception when others then r := bjm_pedir(); end;
      else update bjm_ronda set plazo = jg_ahora() - interval '1 second' where id = rd.id; r := bjm_estado();
      end if;
    end loop;
    select * into rd from bjm_ronda where id = rd.id;
    if rd.estado <> 'fin' then raise exception 'FALLO: ronda al azar sin acabar: %', rd; end if;
    rondas := rondas + 1;
    s1 := array(select jg_saldo(p) from unnest(jug) p);
    -- la banca, aparte: con blackjack, dos cartas; si queda alguien plantado, pide hasta 17; si no, solo da la vuelta
    b := rd.banca; vb := jg_bj_total(b);
    dbj := cardinality(b) = 2 and vb = 21;
    vivas := exists (select 1 from bjm_mano where ronda = rd.id and estado = 'plantada');
    if not dbj and vivas and (vb < 17 or (cardinality(b) > 2 and jg_bj_total(b[1:cardinality(b) - 1]) >= 17)) then raise exception 'FALLO: la banca no para en 17: %', b; end if;
    if (dbj or not vivas) and cardinality(b) <> 2 then raise exception 'FALLO: la banca pide sin nadie vivo: %', b; end if;
    -- ninguna carta repetida: lo repartido es justo el principio del mazo
    select * into sec from bjm_secreto where ronda = rd.id;
    todas := b || coalesce((select array_agg(c order by c) from bjm_mano mm, unnest(mm.cartas) c where mm.ronda = rd.id), '{}');
    if (select array_agg(c order by c) from unnest(todas) c) is distinct from (select array_agg(c order by c) from unnest(sec.mazo[1:sec.sig - 1]) c) then
      raise exception 'FALLO: las cartas repartidas no son las del mazo (ronda %)', rd.id; end if;
    for mano in select * from bjm_mano where ronda = rd.id order by asiento loop
      manos := manos + 1;
      v := jg_bj_total(mano.cartas);
      nat := cardinality(mano.cartas) = 2 and v = 21 and not mano.doblada;
      if nat <> (mano.estado = 'blackjack') then raise exception 'FALLO: blackjack mal visto: %', mano; end if;
      if mano.total <> mano.stake * (case when mano.doblada then 2 else 1 end) then raise exception 'FALLO: lo puesto no cuadra: %', mano; end if;
      if (v > 21) <> (mano.estado = 'pasada') then raise exception 'FALLO: pasada mal vista: %', mano; end if;
      esperado := case when v > 21 then 0
                       when dbj then case when nat then mano.total else 0 end
                       when nat then (mano.stake * 5) / 2
                       when vb > 21 or v > vb then mano.total * 2
                       when v = vb then mano.total
                       else 0 end;
      if mano.pago <> esperado then raise exception 'FALLO: pago % y deberia ser % (mano %, banca %)', mano.pago, esperado, mano, b; end if;
      i := array_position(jug, mano.player);
      if s1[i] - s0[i] <> mano.pago - mano.total then raise exception 'FALLO: el saldo no cuadra con el pago (% -> %, %)', s0[i], s1[i], mano; end if;
      pagado := pagado + mano.pago; puesto := puesto + mano.total;
    end loop;
    for i in 1..5 loop
      if s1[i] <> s0[i] and not exists (select 1 from bjm_mano where ronda = rd.id and player = jug[i]) then raise exception 'FALLO: cambia el saldo de quien no juega'; end if;
    end loop;
  end loop;
  if rondas < 250 then raise exception 'FALLO: pocas rondas al azar (%)', rondas; end if;
  resumen := resumen || rondas || ' rondas al azar y ' || manos || ' manos cuadradas (devuelve ' || round(100.0 * pagado / greatest(puesto, 1), 1) || ' %). ';

  -- ===================================================== 9) sin limite de perdida
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  insert into ledger(player, amount, kind, note) values (jug[1], -5000, 'blackjack', 'prueba 040'), (jug[1], 5000, 'ajuste', 'prueba 040');
  perform bj_limite(jug[1], 99999);
  r := bjm_apostar(4000);
  if not exists (select 1 from bjm_mano m join bjm_ronda rr on rr.id = m.ronda where rr.estado = 'apuestas' and m.player = jug[1] and m.stake = 4000) then
    raise exception 'FALLO: hay limite de perdida al dia'; end if;
  r := bjm_quitar();
  if exists (select 1 from pg_proc where prosrc ~ 'Hoy (ya has perdido|solo puedes arriesgar)') then raise exception 'FALLO: sigue el texto del limite diario'; end if;
  resumen := resumen || 'sin limite ok. ';

  -- ===================================================== 10) el ranking cuenta la mesa
  rk1 := jg_ranking('blackjack', 'siempre');
  n0 := coalesce((select (x->>'jugadas')::int from jsonb_array_elements(rk0) x where x->>'player' = jug[3]::text), 0);
  n1 := coalesce((select (x->>'jugadas')::int from jsonb_array_elements(rk1) x where x->>'player' = jug[3]::text), 0);
  if n1 - n0 <> (select count(*) from bjm_mano where player = jug[3] and resultado is not null) then raise exception 'FALLO: el ranking no cuenta la mesa (% -> %)', n0, n1; end if;
  r := bjm_estado();
  if jsonb_array_length(r->'mias') = 0 then raise exception 'FALLO: no salen tus ultimas manos'; end if;
  resumen := resumen || 'ranking ok.';

  raise exception 'PRUEBA SUPERADA (se deshace todo): %', resumen;
end $$;
