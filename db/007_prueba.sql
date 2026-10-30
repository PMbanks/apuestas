-- Prueba de las Cajas, para el editor SQL de Supabase. Va despues de 007_cajas.sql y 007b_cajas_datos.sql.
-- Abre 3 cajas, vende una, intenta venderla otra vez, juega una batalla 1v1 (y una 2v2 si hay cuatro jugadores),
-- cancela otra y tira 10.000 veces la caja mas barata para ver que salen las probabilidades.
-- Al final lanza un error A PROPOSITO para que se deshaga todo: no queda nada guardado (ni saldo, ni skins, ni chat).
-- Si todo va bien, el error dice "PRUEBA SUPERADA" con el resumen. Si algo falla, dice "FALLO" y que.
do $$
declare
  jug uuid[] := array(select id from players order by created_at);
  caja cs_cases;
  b cs_battles;
  r jsonb;
  s0 int; s1 int; id1 bigint; v1 int; bid bigint; ganador uuid; fallo boolean; resumen text := '';
  d record; rr text; cnt jsonb := '{}'::jsonb; st int := 0; wear int[] := array[0,0,0,0,0,0];
begin
  if cardinality(jug) < 2 then raise exception 'FALLO: hacen falta al menos dos jugadores'; end if;
  select * into caja from cs_cases where active order by price, id limit 1;
  if not found then raise exception 'FALLO: no hay cajas. Carga antes 007b_cajas_datos.sql'; end if;
  insert into ledger(player, amount, kind, note) select id, 100000, 'ajuste', 'saldo de prueba' from players;

  -- 1. el primer jugador abre 3 cajas
  perform set_config('request.jwt.claims', jsonb_build_object('sub', jug[1], 'role', 'authenticated')::text, true);
  s0 := (select coalesce(sum(amount), 0) from ledger where player = jug[1]);
  r := cs_open(caja.id, 3);
  if jsonb_array_length(r->'items') <> 3 then raise exception 'FALLO: abrir 3 cajas no ha dado 3 skins'; end if;
  s1 := (select coalesce(sum(amount), 0) from ledger where player = jug[1]);
  if s1 <> s0 - 3 * caja.price then raise exception 'FALLO: abrir 3 cajas tenia que cobrar % y ha cobrado %', 3 * caja.price, s0 - s1; end if;
  if (r->>'saldo')::int <> s1 then raise exception 'FALLO: el saldo que devuelve cs_open no cuadra'; end if;
  if (select count(*) from cs_inv where player = jug[1] and status = 'own'
      and id in (select (x->>'id')::bigint from jsonb_array_elements(r->'items') x)) <> 3 then
    raise exception 'FALLO: las skins abiertas no estan en el inventario';
  end if;
  resumen := resumen || format('Abiertas 3 %s a %s: %s. ', caja.name, caja.price,
    (select string_agg(t.name || ' ' || (x->>'value'), ', ') from jsonb_array_elements(r->'items') x join cs_items t on t.id = x->>'item'));

  -- 2. vende la primera; venderla otra vez tiene que fallar
  id1 := (r->'items'->0->>'id')::bigint;
  v1 := (r->'items'->0->>'value')::int;
  r := cs_sell(array[id1]);
  if (r->>'vendidas')::int <> 1 or (r->>'total')::int <> v1 then raise exception 'FALLO: la venta no ha pagado lo que vale la skin'; end if;
  if (select coalesce(sum(amount), 0) from ledger where player = jug[1]) <> s1 + v1 then raise exception 'FALLO: la venta no ha sumado al saldo'; end if;
  fallo := false;
  begin perform cs_sell(array[id1]); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se ha podido vender dos veces la misma skin'; end if;
  resumen := resumen || format('Vendida por %s; venderla otra vez falla. ', v1);

  -- 3. otro jugador no puede vender una skin que no es suya
  perform set_config('request.jwt.claims', jsonb_build_object('sub', jug[2], 'role', 'authenticated')::text, true);
  fallo := false;
  begin perform cs_sell(array[(select id from cs_inv where player = jug[1] and status = 'own' order by id desc limit 1)]); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se ha podido vender una skin de otro'; end if;

  -- 4. batalla 1v1 de 2 cajas: la crea el primero, se une el segundo y se resuelve sola
  perform set_config('request.jwt.claims', jsonb_build_object('sub', jug[1], 'role', 'authenticated')::text, true);
  s0 := (select coalesce(sum(amount), 0) from ledger where player = jug[1]);
  r := cs_battle_create('1v1', array[caja.id, caja.id]);
  bid := (r->>'id')::bigint;
  if (select coalesce(sum(amount), 0) from ledger where player = jug[1]) <> s0 - 2 * caja.price then raise exception 'FALLO: crear la batalla no ha cobrado bien'; end if;
  fallo := false;
  begin perform cs_battle_join(bid); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: el que crea la batalla se ha podido unir otra vez'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', jug[2], 'role', 'authenticated')::text, true);
  s1 := (select coalesce(sum(amount), 0) from ledger where player = jug[2]);
  r := cs_battle_join(bid);
  if not (r->>'done')::boolean then raise exception 'FALLO: la batalla no se ha resuelto al llenarse'; end if;
  select * into b from cs_battles where id = bid;
  if b.status <> 'done' or b.winner is null then raise exception 'FALLO: la batalla no ha quedado terminada'; end if;
  if (select count(*) from cs_battle_drops where battle_id = bid) <> 4 then raise exception 'FALLO: una 1v1 de 2 cajas tiene que sacar 4 skins'; end if;
  if (select sum(i.value) from cs_battle_drops d2 join cs_inv i on i.id = d2.inv_id where d2.battle_id = bid) <> b.totals[1] + b.totals[2] then
    raise exception 'FALLO: los totales de la batalla no cuadran con las skins';
  end if;
  if b.totals[b.winner + 1] < b.totals[2 - b.winner] then raise exception 'FALLO: ha ganado el lado que menos ha sacado'; end if;
  ganador := (select player from cs_battle_seats where battle_id = bid and seat = b.winner);
  if exists (select 1 from cs_battle_drops d2 join cs_inv i on i.id = d2.inv_id where d2.battle_id = bid and i.player <> ganador) then
    raise exception 'FALLO: alguna skin de la batalla no es del ganador';
  end if;
  if (select coalesce(sum(amount), 0) from ledger where player = jug[2]) <> s1 - b.cost then raise exception 'FALLO: unirse no ha cobrado bien'; end if;
  fallo := false;
  begin perform cs_battle_join(bid); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: alguien se ha unido a una batalla ya terminada'; end if;
  resumen := resumen || format('Batalla 1v1: %s a %s, se lo lleva %s. ', b.totals[1], b.totals[2], pname(ganador));

  -- 5. batalla 2v2 si hay cuatro jugadores
  if cardinality(jug) >= 4 then
    perform set_config('request.jwt.claims', jsonb_build_object('sub', jug[1], 'role', 'authenticated')::text, true);
    bid := (cs_battle_create('2v2', array[caja.id])->>'id')::bigint;
    perform set_config('request.jwt.claims', jsonb_build_object('sub', jug[2], 'role', 'authenticated')::text, true);
    perform cs_battle_join(bid, 2);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', jug[3], 'role', 'authenticated')::text, true);
    perform cs_battle_join(bid);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', jug[4], 'role', 'authenticated')::text, true);
    r := cs_battle_join(bid);
    select * into b from cs_battles where id = bid;
    if not (r->>'done')::boolean or b.status <> 'done' then raise exception 'FALLO: la 2v2 no se ha resuelto al llenarse'; end if;
    if (select count(*) from cs_battle_drops where battle_id = bid) <> 4 then raise exception 'FALLO: una 2v2 de 1 caja tiene que sacar 4 skins'; end if;
    if exists (select 1 from cs_battle_drops d2 join cs_inv i on i.id = d2.inv_id where d2.battle_id = bid
               and i.player not in (select player from cs_battle_seats where battle_id = bid and seat / 2 = b.winner)) then
      raise exception 'FALLO: alguna skin de la 2v2 no es del lado ganador';
    end if;
    resumen := resumen || format('Batalla 2v2: %s a %s, gana %s. ', b.totals[1], b.totals[2],
      (select string_agg(pname(player), ' y ' order by seat) from cs_battle_seats where battle_id = bid and seat / 2 = b.winner));
  end if;

  -- 6. el que crea una batalla la cancela y recupera lo puesto
  perform set_config('request.jwt.claims', jsonb_build_object('sub', jug[1], 'role', 'authenticated')::text, true);
  s0 := (select coalesce(sum(amount), 0) from ledger where player = jug[1]);
  bid := (cs_battle_create('1v1', array[caja.id])->>'id')::bigint;
  perform cs_battle_leave(bid);
  if (select status from cs_battles where id = bid) <> 'canceled' then raise exception 'FALLO: la batalla no se ha cancelado'; end if;
  if (select coalesce(sum(amount), 0) from ledger where player = jug[1]) <> s0 then raise exception 'FALLO: cancelar no ha devuelto lo puesto'; end if;
  resumen := resumen || 'Cancelar devuelve lo puesto. ';

  -- 7. 10.000 tiradas de la caja mas barata (sin guardar nada): de cada 10.000 tienen que salir unas
  --    7.992 grado militar, 1.598 restringido, 320 clasificado, 64 encubierto, 26 especial; StatTrak unas 1.000
  for k in 1..10000 loop
    select * into d from cs_roll(caja.id);
    rr := (select rarity from cs_items where id = d.o_item);
    cnt := jsonb_set(cnt, array[rr], to_jsonb(coalesce((cnt->>rr)::int, 0) + 1));
    if d.o_st then st := st + 1; end if;
    wear[coalesce(d.o_wear, 5) + 1] := wear[coalesce(d.o_wear, 5) + 1] + 1;
  end loop;
  resumen := resumen || format('10.000 tiradas: grado militar %s, restringido %s, clasificado %s, encubierto %s, especial %s; StatTrak %s; desgaste RF %s CN %s AD %s BD %s D %s.',
    coalesce(cnt->>'mil', '0'), coalesce(cnt->>'res', '0'), coalesce(cnt->>'cla', '0'), coalesce(cnt->>'cov', '0'), coalesce(cnt->>'esp', '0'),
    st, wear[1], wear[2], wear[3], wear[4], wear[5]);

  raise exception 'PRUEBA SUPERADA (no se ha guardado nada). %', resumen;
end $$;
