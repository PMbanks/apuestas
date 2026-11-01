-- Prueba de db/065_blackjack_un_asiento.sql, para el editor SQL de Supabase. Va despues de 040, 048, 054 y 065. Con los jugadores de verdad (hacen falta dos).
-- Comprueba: (1) un jugador con tres asientos y tres manos juega la ronda hasta el final y se le pagan las manos bien; (2) al acabar la ronda sus
-- asientos extra se liberan y solo le queda el primero (el de menor numero), y lo mismo con el otro jugador; (3) sus manos de esa ronda siguen
-- en la ronda ya acabada y el dinero cuadra (suma de apuestas y pagos en el ledger); (4) en la ronda siguiente puede volver a añadir asientos.
-- Al final lanza un error A PROPOSITO para que se deshaga todo: "PRUEBA SUPERADA". Sustituye a la parte de asientos persistentes de 048_prueba.sql.
do $$
declare
  jug uuid[] := array(select id from players order by created_at, id limit 2);
  r jsonb; rd bjm_ronda; n int := 0; t0 int; t1 int;
begin
  if cardinality(jug) < 2 then raise exception 'FALLO: hacen falta al menos dos jugadores'; end if;
  delete from bjm_asiento; delete from bjm_ronda;
  perform pay_week();
  insert into ledger(player, amount, kind, note) select p, 1000 - (select coalesce(sum(amount), 0) from ledger where player = p)::int, 'ajuste', 'prueba 065' from unnest(jug) p;

  -- 1) el primero juega con tres manos (asientos 1, 2 y 5) y el segundo con una
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  r := bjm_apostar(100, 1);
  r := bjm_otra_mano(50, 2);
  r := bjm_otra_mano(30, 5);
  if r->'mios' <> '[1, 2, 5]'::jsonb then raise exception 'FALLO: debia tener tres asientos: %', r->'mios'; end if;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[2]), true);
  r := bjm_apostar(40, 3);
  select * into rd from bjm_ronda where estado <> 'fin';
  update bjm_ronda set cierra = jg_ahora() - interval '1 second' where id = rd.id;
  perform bjm_tick();                                                              -- reparte
  select * into rd from bjm_ronda where id = rd.id;
  if rd.estado not in ('turnos', 'fin') then raise exception 'FALLO: no se reparte (%)', rd.estado; end if;

  -- cada mano se planta en su turno hasta que acaba la ronda
  while rd.estado = 'turnos' and n < 20 loop
    n := n + 1;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}',
      (select player from bjm_mano where ronda = rd.id and asiento = rd.turno)), true);
    perform bjm_plantarse();
    select * into rd from bjm_ronda where id = rd.id;
  end loop;
  if rd.estado <> 'fin' then raise exception 'FALLO: la ronda no acaba (%)', rd.estado; end if;

  -- 2) solo queda el primer asiento de cada uno
  if (select array_agg(asiento order by asiento) from bjm_asiento where player = jug[1]) is distinct from array[1]::smallint[] then
    raise exception 'FALLO: el primero debia quedarse solo con el asiento 1 (%)', (select array_agg(asiento order by asiento) from bjm_asiento where player = jug[1]); end if;
  if (select array_agg(asiento order by asiento) from bjm_asiento where player = jug[2]) is distinct from array[3]::smallint[] then
    raise exception 'FALLO: el segundo debia quedarse con su asiento 3 (%)', (select array_agg(asiento order by asiento) from bjm_asiento where player = jug[2]); end if;

  -- 3) sus manos siguen en la ronda acabada, todas cerradas, y el dinero cuadra
  if (select count(*) from bjm_mano where ronda = rd.id and resultado is not null) <> 4 then raise exception 'FALLO: faltan manos cerradas en la ronda'; end if;
  t0 := (select coalesce(sum(amount), 0) from ledger where player = jug[1] and kind = 'blackjack')::int + (select coalesce(sum(amount), 0) from ledger where player = jug[2] and kind = 'blackjack')::int;
  t1 := (select coalesce(sum(pago), 0) from bjm_mano where ronda = rd.id)::int - (select coalesce(sum(total), 0) from bjm_mano where ronda = rd.id)::int;
  if t0 <> t1 then raise exception 'FALLO: el ledger de blackjack (%) no coincide con pagos menos apuestas (%)', t0, t1; end if;

  -- 4) en la ronda siguiente puede volver a añadir asientos
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  r := bjm_apostar(10);
  r := bjm_otra_mano(10, 4);
  if r->'mios' <> '[1, 4]'::jsonb then raise exception 'FALLO: no puede volver a añadir un asiento: %', r->'mios'; end if;

  raise exception 'PRUEBA SUPERADA (se deshace todo): tres manos de uno y una de otro se juegan y se pagan, al acabar la ronda cada jugador vuelve a un asiento (el primero), sus manos siguen en la ronda, el dinero cuadra y en la siguiente ronda se pueden añadir asientos otra vez.';
end $$;
