-- Prueba de db/048_blackjack_manos.sql (varias manos por jugador en la mesa de blackjack), para el editor SQL de Supabase.
-- Va despues de 040 y 048. Con los jugadores de verdad (hacen falta al menos cinco). Mazos fijos para probar cada regla y el
-- tiempo adelantado tocando la ronda (corre como administrador). Prueba:
--   1) un jugador con tres manos en la misma ronda (y otro con una): como mucho 3, quitar una mano antes de repartir (se devuelve
--      y libera su asiento), cada mano juega en su turno y se paga por separado: blackjack 3 a 2, doblar, 21, perder; ledger exacto;
--   2) nadie juega la mano de otro (ni la suya fuera de su turno) y nadie llama a las funciones internas;
--   3) sin saldo para la segunda mano: no se cobra ni se sienta;
--   4) irse de UNA de tus manos a mitad de ronda, turnos que caducan seguidos (cada mano con sus 15 s), ausencia por jugador
--      (todos sus asientos) y 5 rondas sin apostar por asiento;
--   5) 300 rondas al azar con 0 a 3 manos por jugador y jugadas al azar: cada pago recalculado aparte, saldo de cada jugador =
--      suma de sus manos, ninguna carta repetida, nadie con mas de 3 asientos.
-- Al final lanza un error A PROPOSITO para que se deshaga todo. Si todo va bien, el error dice "PRUEBA SUPERADA".
do $$
declare
  jug uuid[] := array(select id from players order by created_at, id limit 5);
  r jsonb; fallo boolean; err text; resumen text := ''; i int; k int; j int; n int; rd bjm_ronda; mano bjm_mano; sec bjm_secreto;
  s0 int[]; s1 int[]; dlt int[]; v int; vb int; esperado int; nat boolean; dbj boolean; vivas boolean; b smallint[]; todas smallint[];
  uno uuid; accion int; rondas int := 0; manos int := 0; multi int := 0;
  relleno smallint[] := array(select 1::smallint from generate_series(1, 40));
begin
  if cardinality(jug) < 5 then raise exception 'FALLO: hacen falta al menos cinco jugadores'; end if;
  delete from bjm_asiento; delete from bjm_ronda;
  perform pay_week();
  insert into ledger(player, amount, kind, note) select p, 1000 - (select coalesce(sum(amount), 0) from ledger where player = p)::int, 'ajuste', 'prueba 048'
    from unnest(jug) p;

  -- ===================================================== 2) permisos
  if has_function_privilege('authenticated', 'bjm_pon(uuid, smallint, int)', 'execute') or has_function_privilege('authenticated', 'bjm_sienta(uuid, int)', 'execute')
     or has_function_privilege('authenticated', 'bjm_mi_turno(uuid)', 'execute') or has_function_privilege('authenticated', 'bjm_repartir(bigint, smallint[])', 'execute')
     or has_function_privilege('authenticated', 'bjm_tick()', 'execute') then raise exception 'FALLO: un jugador puede llamar a una funcion interna'; end if;
  if not has_function_privilege('authenticated', 'bjm_otra_mano(int, int)', 'execute') or not has_function_privilege('authenticated', 'bjm_quitar(int)', 'execute')
     or not has_function_privilege('authenticated', 'bjm_levantarse(int)', 'execute') then raise exception 'FALLO: un jugador no puede anadir o quitar manos'; end if;
  if has_function_privilege('anon', 'bjm_otra_mano(int, int)', 'execute') then raise exception 'FALLO: sin entrar se anaden manos'; end if;
  if has_table_privilege('authenticated', 'bjm_secreto', 'select') or has_table_privilege('authenticated', 'bjm_mano', 'select') then raise exception 'FALLO: se leen las manos o el mazo'; end if;
  resumen := resumen || 'permisos ok. ';

  -- ===================================================== 1) tres manos de uno y una de otro
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  r := bjm_apostar(100, 1);
  r := bjm_otra_mano(50);                                                   -- el primero libre: el 2
  r := bjm_otra_mano(30, 5);
  if r->'mios' <> '[1, 2, 5]'::jsonb or (r->>'yo')::int <> 1 or (r->'cfg'->>'manos')::int <> 3 then raise exception 'FALLO: no tiene sus tres asientos: %', r->'mios'; end if;
  fallo := false; begin perform bjm_otra_mano(20); exception when others then fallo := true; err := sqlerrm; end;
  if not fallo or err !~ 'Como mucho' then raise exception 'FALLO: una cuarta mano (%)', err; end if;
  fallo := false; begin perform bjm_apostar(10); exception when others then fallo := true; err := sqlerrm; end;
  if not fallo or err !~ 'todas tus manos' then raise exception 'FALLO: apuesta dos veces en la misma mano (%)', err; end if;
  fallo := false; begin perform bjm_apostar(10, 2); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: dos apuestas en el mismo asiento'; end if;
  if jg_saldo(jug[1]) <> 820 then raise exception 'FALLO: no se cobra cada mano (%)', jg_saldo(jug[1]); end if;
  -- quita la del 5: se devuelve y el asiento queda libre; se sienta en el 6
  r := bjm_quitar(5);
  if jg_saldo(jug[1]) <> 850 or exists (select 1 from bjm_asiento where asiento = 5) or r->'mios' <> '[1, 2]'::jsonb then raise exception 'FALLO: quitar una mano: % %', jg_saldo(jug[1]), r->'mios'; end if;
  r := bjm_otra_mano(30, 6);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[2]), true);
  fallo := false; begin perform bjm_otra_mano(10, 6); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se sienta en el asiento de otro'; end if;
  fallo := false; begin perform bjm_sentarse(1); exception when others then fallo := true; end;
  if not fallo or (select player from bjm_asiento where asiento = 1) <> jug[1] then raise exception 'FALLO: quita el asiento a otro'; end if;
  r := bjm_apostar(40, 3);
  select * into rd from bjm_ronda where estado <> 'fin';
  if (select count(*) from bjm_mano where ronda = rd.id) <> 4 or (select count(*) from bjm_mano where ronda = rd.id and player = jug[1]) <> 3 then raise exception 'FALLO: no estan las cuatro manos'; end if;
  -- mazo: asientos 1, 2, 3, 6. 1: 10 + 7 | 2: A + K blackjack | 3: 9 + 2, dobla con 10: 21 | 6: 10 + 5, pide 6: 21 | banca 9 + 9 = 18
  perform bjm_repartir(rd.id, array[9, 0, 8, 22, 21, 6, 12, 1, 4, 34, 35, 5]::smallint[] || relleno);
  select * into rd from bjm_ronda where id = rd.id;
  if rd.turno <> 1 then raise exception 'FALLO: empieza el que no es: %', rd.turno; end if;
  -- nadie juega fuera de su turno: ni el otro, ni el mismo con otra de sus manos
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[2]), true);
  fallo := false; begin perform bjm_pedir(); exception when others then fallo := true; err := sqlerrm; end;
  if not fallo or err !~ 'turno' then raise exception 'FALLO: juega la mano de otro (%)', err; end if;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[5]), true);
  fallo := false; begin perform bjm_plantarse(); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: juega quien no tiene mano'; end if;
  -- la mano 1 se queda sin tiempo: la planta cualquiera que mire, y pasa al 3 (el 2 tiene blackjack)
  update bjm_ronda set plazo = jg_ahora() - interval '1 second' where id = rd.id;
  r := bjm_estado();
  select * into rd from bjm_ronda where id = rd.id;
  if rd.turno <> 3 or not (select auto from bjm_mano where ronda = rd.id and asiento = 1) then raise exception 'FALLO: la mano 1 no se planta sola: %', rd; end if;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  fallo := false; begin perform bjm_pedir(); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: juega en el turno del otro con otra mano suya'; end if;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[2]), true);
  r := bjm_doblar();
  select * into rd from bjm_ronda where id = rd.id;
  if rd.turno <> 6 or rd.plazo < jg_ahora() + bjm_t_turno() - interval '1 second' then raise exception 'FALLO: la mano 6 no tiene su tiempo: %', rd; end if;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  r := bjm_pedir();                                                         -- 21: se planta, juega la banca y se paga
  select * into rd from bjm_ronda where id = rd.id;
  if rd.estado <> 'fin' or jg_bj_total(rd.banca) <> 18 then raise exception 'FALLO: la ronda no acaba: %', rd; end if;
  if (select string_agg(asiento || ':' || resultado || ':' || pago, ' ' order by asiento) from bjm_mano where ronda = rd.id) <> '1:pierde:0 2:blackjack:125 3:gana:160 6:gana:60' then
    raise exception 'FALLO: pagos por mano: %', (select string_agg(asiento || ':' || resultado || ':' || pago, ' ' order by asiento) from bjm_mano where ronda = rd.id); end if;
  if jg_saldo(jug[1]) <> 1005 or jg_saldo(jug[2]) <> 1080 then raise exception 'FALLO: saldos: % %', jg_saldo(jug[1]), jg_saldo(jug[2]); end if;
  if (select count(*) from ledger where player = jug[1] and kind = 'blackjack' and amount > 0 and note <> 'Blackjack: apuesta retirada') <> 2 then raise exception 'FALLO: cada mano no se paga aparte'; end if;
  if exists (select 1 from ledger where note like 'Blackjack%' and kind <> 'blackjack') then raise exception 'FALLO: movimientos que no son blackjack'; end if;
  r := bjm_estado();
  if jsonb_array_length(r->'manos') <> 4 or r->'mios' <> '[1, 2, 6]'::jsonb then raise exception 'FALLO: el estado no ensena las manos: %', r->'mios'; end if;
  resumen := resumen || 'tres manos de uno ok. ';

  -- ===================================================== 3) sin saldo para la segunda mano
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[3]), true);
  insert into ledger(player, amount, kind, note) values (jug[3], -940, 'ajuste', 'prueba 048');
  r := bjm_apostar(50);
  fallo := false; begin perform bjm_otra_mano(20); exception when others then fallo := true; err := sqlerrm; end;
  if not fallo or err !~ 'saldo' then raise exception 'FALLO: segunda mano sin saldo (%)', err; end if;
  if (select count(*) from bjm_asiento where player = jug[3]) <> 1 or jg_saldo(jug[3]) <> 10 then raise exception 'FALLO: la mano sin saldo sienta o cobra'; end if;
  r := bjm_quitar();
  if jg_saldo(jug[3]) <> 60 or (select count(*) from bjm_asiento where player = jug[3]) <> 1 or exists (select 1 from bjm_ronda where estado <> 'fin') then raise exception 'FALLO: quitar la unica mano'; end if;
  r := bjm_levantarse();
  insert into ledger(player, amount, kind, note) values (jug[3], 940, 'ajuste', 'prueba 048');
  resumen := resumen || 'sin saldo ok. ';

  -- ===================================================== 4) irse de una de tus manos, turnos que caducan, ausencia
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  r := bjm_apostar(10); r := bjm_apostar(10); r := bjm_apostar(10);         -- sus tres asientos: 1, 2 y 6
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[2]), true);
  r := bjm_apostar(10);                                                     -- su asiento: 3
  r := bjm_sentarse(4);                                                     -- y otro sin apostar
  select * into rd from bjm_ronda where estado <> 'fin';
  if (select string_agg(asiento::text, ',' order by asiento) from bjm_mano where ronda = rd.id) <> '1,2,3,6' then raise exception 'FALLO: apostar sin asiento no usa los tuyos'; end if;
  -- 1: 10+2 | 2: 10+3 | 3: 10+4 | 6: 10+5 | banca 10 + 7
  perform bjm_repartir(rd.id, array[9, 22, 35, 48, 1, 2, 3, 4, 5, 6]::smallint[] || relleno);
  if (select sin_jugar from bjm_asiento where asiento = 4) <> 1 or (select sin_jugar from bjm_asiento where asiento = 3) <> 0 then raise exception 'FALLO: las rondas sin apostar no se cuentan por asiento'; end if;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  r := bjm_levantarse(1);                                                   -- deja la mano 1 en su turno: se planta y sigue SU mano 2
  select * into rd from bjm_ronda where id = rd.id;
  if rd.turno <> 2 or exists (select 1 from bjm_asiento where asiento = 1) or r->'mios' <> '[2, 6]'::jsonb then raise exception 'FALLO: irse de una mano: % %', rd.turno, r->'mios'; end if;
  for k in 1..3 loop
    update bjm_ronda set plazo = jg_ahora() - interval '1 second' where id = rd.id;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[5]), true);
    r := bjm_estado();
    select * into rd from bjm_ronda where id = rd.id;
    if k < 3 and (rd.estado <> 'turnos' or rd.plazo < jg_ahora() + bjm_t_turno() - interval '2 seconds') then raise exception 'FALLO: la siguiente mano no recibe su tiempo (%)', k; end if;
  end loop;
  if rd.estado <> 'fin' or (select count(*) from bjm_mano where ronda = rd.id and auto) <> 4 then raise exception 'FALLO: con todos quietos la mesa se para: %', rd; end if;
  -- ausencia por jugador: el 1 no mira la mesa y pierde sus dos asientos; el 2 sigue
  update bjm_asiento set visto = jg_ahora() - interval '2 minutes' where player = jug[1];
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[2]), true);
  update bjm_asiento set sin_jugar = 5 where asiento = 4;
  r := bjm_estado();
  if exists (select 1 from bjm_asiento where player = jug[1]) or exists (select 1 from bjm_asiento where asiento = 4) or not exists (select 1 from bjm_asiento where asiento = 3 and player = jug[2]) then
    raise exception 'FALLO: asientos de ausentes: %', (select string_agg(asiento || '', ',') from bjm_asiento); end if;
  resumen := resumen || 'nadie bloquea la mesa. ';

  -- ===================================================== 5) 300 rondas al azar con varias manos
  for i in 1..5 loop insert into ledger(player, amount, kind, note) values (jug[i], 50000, 'ajuste', 'prueba 048'); end loop;
  for k in 1..300 loop
    update bjm_asiento set visto = jg_ahora();
    s0 := array(select jg_saldo(p) from unnest(jug) p);
    n := 0;
    for i in 1..5 loop
      perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[i]), true);
      for j in 1..floor(random() * 4)::int loop
        begin
          begin r := bjm_apostar(1 + floor(random() * 300)::int); exception when others then r := bjm_otra_mano(1 + floor(random() * 300)::int); end;
          n := n + 1;
        exception when others then null;
        end;
      end loop;
      if random() < 0.1 then begin r := bjm_quitar((select asiento from bjm_mano m join bjm_ronda x on x.id = m.ronda where x.estado = 'apuestas' and m.player = jug[i] order by random() limit 1)); exception when others then null; end; end if;
    end loop;
    continue when not exists (select 1 from bjm_ronda where estado = 'apuestas');
    select * into rd from bjm_ronda where estado <> 'fin';
    update bjm_ronda set cierra = jg_ahora() - interval '1 second' where id = rd.id;
    r := bjm_estado();
    for i in 1..80 loop
      select * into rd from bjm_ronda where id = rd.id;
      exit when rd.estado = 'fin';
      select player into uno from bjm_mano where ronda = rd.id and asiento = rd.turno;
      perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', uno), true);
      accion := floor(random() * 5)::int;
      if accion = 0 then r := bjm_pedir();
      elsif accion = 1 then r := bjm_plantarse();
      elsif accion = 2 then begin r := bjm_doblar(); exception when others then r := bjm_pedir(); end;
      elsif accion = 3 then r := bjm_levantarse(rd.turno);
      else update bjm_ronda set plazo = jg_ahora() - interval '1 second' where id = rd.id; r := bjm_estado();
      end if;
    end loop;
    select * into rd from bjm_ronda where id = rd.id;
    if rd.estado <> 'fin' then raise exception 'FALLO: ronda al azar sin acabar: %', rd; end if;
    rondas := rondas + 1;
    if exists (select 1 from bjm_mano where ronda = rd.id group by player having count(*) > 3) or exists (select 1 from bjm_asiento group by player having count(*) > 3) then
      raise exception 'FALLO: mas de 3 manos o asientos por jugador'; end if;
    if exists (select 1 from bjm_mano where ronda = rd.id group by player having count(*) > 1) then multi := multi + 1; end if;
    s1 := array(select jg_saldo(p) from unnest(jug) p);
    dlt := array[0, 0, 0, 0, 0];
    b := rd.banca; vb := jg_bj_total(b);
    dbj := cardinality(b) = 2 and vb = 21;
    vivas := exists (select 1 from bjm_mano where ronda = rd.id and estado = 'plantada');
    if not dbj and vivas and (vb < 17 or (cardinality(b) > 2 and jg_bj_total(b[1:cardinality(b) - 1]) >= 17)) then raise exception 'FALLO: la banca no para en 17: %', b; end if;
    if (dbj or not vivas) and cardinality(b) <> 2 then raise exception 'FALLO: la banca pide sin nadie vivo: %', b; end if;
    select * into sec from bjm_secreto where ronda = rd.id;
    todas := b || coalesce((select array_agg(c order by c) from bjm_mano mm, unnest(mm.cartas) c where mm.ronda = rd.id), '{}');
    if (select array_agg(c order by c) from unnest(todas) c) is distinct from (select array_agg(c order by c) from unnest(sec.mazo[1:sec.sig - 1]) c) then
      raise exception 'FALLO: cartas repartidas que no son las del mazo (ronda %)', rd.id; end if;
    for mano in select * from bjm_mano where ronda = rd.id order by asiento loop
      manos := manos + 1;
      v := jg_bj_total(mano.cartas);
      nat := cardinality(mano.cartas) = 2 and v = 21 and not mano.doblada;
      if nat <> (mano.estado = 'blackjack') then raise exception 'FALLO: blackjack mal visto: %', mano; end if;
      if mano.total <> mano.stake * (case when mano.doblada then 2 else 1 end) then raise exception 'FALLO: lo puesto no cuadra: %', mano; end if;
      esperado := case when v > 21 then 0
                       when dbj then case when nat then mano.total else 0 end
                       when nat then (mano.stake * 5) / 2
                       when vb > 21 or v > vb then mano.total * 2
                       when v = vb then mano.total
                       else 0 end;
      if mano.pago <> esperado then raise exception 'FALLO: pago % y deberia ser % (mano %, banca %)', mano.pago, esperado, mano, b; end if;
      i := array_position(jug, mano.player);
      dlt[i] := dlt[i] + mano.pago - mano.total;
    end loop;
    -- lo que se quito antes de repartir vuelve entero: el saldo de cada uno = la suma de sus manos de esta ronda
    for i in 1..5 loop
      if s1[i] - s0[i] <> dlt[i] then raise exception 'FALLO: el saldo de % no cuadra con sus manos (% contra %)', i, s1[i] - s0[i], dlt[i]; end if;
    end loop;
  end loop;
  if rondas < 250 or multi < 100 then raise exception 'FALLO: pocas rondas o pocas con varias manos (% / %)', rondas, multi; end if;
  resumen := resumen || rondas || ' rondas al azar, ' || multi || ' con alguien a varias manos, ' || manos || ' manos cuadradas.';

  raise exception 'PRUEBA SUPERADA (se deshace todo): %', resumen;
end $$;
