-- Prueba de 055 (EmpireDrop), para el editor SQL de Supabase. Va despues de 055_empiredrop.sql y 055b_empiredrop_datos.sql (y de todo lo anterior).
-- Comprueba: las 59 cajas de EmpireDrop estan activas y de lujo (24 sustituyen a las viejas con el mismo id, 35 nuevas lujo-ed-*); cada una suma 100 % de probabilidad (tickets), todos sus
-- objetos llevan nombre sin guiones, imagen de img/lujo/ed y un precio unico mayor que 0, nada de desgaste ni StatTrak; el valor medio de cada caja respecto a su precio esta entre el 80 % y el 97 %
-- (EmpireDrop devuelve un 90 %); Patinetes y Gafas siguen como estaban (sin tickets, tiran por rareza); abrir cada caja cobra su precio y da un objeto de esa caja con su valor; abrir 5 cobra 5 veces;
-- vender una vez si y dos no; y 20.000 tiradas de Imperio Gamer y de Pokemon Stash dan cada objeto con la probabilidad que dice su caja.
-- Al final lanza un error A PROPOSITO para que se deshaga todo: no queda nada guardado (ni saldo ni objetos). Si todo va bien dice "PRUEBA SUPERADA" con el resumen; si no, "FALLO".
do $$
declare
  viejas text[] := array['lujo-gaming','lujo-tecnologia-basica','lujo-tecnologia','lujo-tecnologia-2026','lujo-camaras','lujo-relojes-calle','lujo-relojes-2026','lujo-relojes','lujo-joyas','lujo-moda-joyas',
    'lujo-zapatillas-basicas','lujo-zapatillas','lujo-zapatillas-2026','lujo-moda-calle','lujo-streetwear','lujo-bolsos','lujo-perfumes','lujo-motos','lujo-coches','lujo-motor','lujo-viajes',
    'lujo-oro','lujo-cripto','lujo-cartas'];
  jug uuid[] := array(select id from players order by created_at);
  c cs_cases; r jsonb; x jsonb; d record; cnt jsonb;
  ids text[]; n_ed int; n_obj int; tot bigint; s0 int; id1 bigint; v1 int; fallo boolean; resumen text := ''; k int; ruedas int;
  ev_c numeric; dev numeric; min_dev numeric := 1000; max_dev numeric := 0; n_items int := 0; esperada numeric; sd numeric; vistas int; it record; ntir int := 20000;
begin
  if cardinality(jug) < 2 then raise exception 'FALLO: hacen falta al menos dos jugadores'; end if;
  insert into ledger(player, amount, kind, note) select id, 500000000, 'ajuste', 'saldo de prueba' from players;
  perform pay_week();

  -- 1. estan las 59: las 24 que sustituyen a las viejas y 35 nuevas; Patinetes y Gafas siguen
  ids := array(select id from cs_cases where active and cat = 'lujo' and (id = any(viejas) or id like 'lujo-ed-%') order by id);
  if cardinality(ids) <> 59 then raise exception 'FALLO: tienen que ser 59 cajas de EmpireDrop activas y de lujo (hay %). Carga 055_empiredrop.sql y 055b_empiredrop_datos.sql', cardinality(ids); end if;
  select count(*) into n_ed from cs_cases where id like 'lujo-ed-%' and active;
  if n_ed <> 35 then raise exception 'FALLO: tienen que ser 35 cajas nuevas lujo-ed-* (hay %)', n_ed; end if;
  if (select count(*) from cs_cases where id = any(viejas) and active and cat = 'lujo') <> 24 then raise exception 'FALLO: las 24 cajas sustituidas tienen que seguir activas con su id'; end if;
  if (select count(*) from cs_cases where id in ('lujo-patinetes','lujo-gafas') and active) <> 2 then raise exception 'FALLO: Patinetes y Gafas tienen que seguir activas'; end if;
  if exists (select 1 from cs_case_items where case_id in ('lujo-patinetes','lujo-gafas') and tickets is not null) then raise exception 'FALLO: Patinetes y Gafas no llevan tickets (tiran por rareza)'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', jug[1], 'role', 'authenticated')::text, true);
  r := cs_cases();
  if (select count(*) from jsonb_array_elements(r) e where (e->>'id') = any(ids) and e->>'cat' = 'lujo') <> 59 then raise exception 'FALLO: cs_cases() no lista las 59 como lujo'; end if;
  if (select count(distinct name) from cs_cases where id = any(ids)) <> 59 then raise exception 'FALLO: dos cajas se llaman igual'; end if;
  resumen := resumen || format('%s cajas de lujo activas en total (59 de EmpireDrop + Patinetes y Gafas). ', (select count(*) from cs_cases where active and cat = 'lujo'));

  -- 2. cada caja: nombre sin guiones, imagen, probabilidades que suman 100, objetos completos, precio de caja y devolucion
  for c in select * from cs_cases where id = any(ids) order by sort loop
    if c.name ~ '\s[-–—]\s' or c.name = '' then raise exception 'FALLO: el nombre de % lleva un guion o esta vacio', c.id; end if;
    if c.image !~ '^https://pmbanks[.]github[.]io/apuestas/img/lujo/cajas/ed-[a-z0-9-]+[.]webp$' then raise exception 'FALLO: %: la imagen de la caja no es de EmpireDrop (%)', c.name, c.image; end if;
    select count(*), sum(ci.tickets) into n_obj, tot from cs_case_items ci where ci.case_id = c.id;
    if n_obj < 10 or n_obj > 50 then raise exception 'FALLO: %: tiene % objetos (tienen que ser de 10 a 50)', c.name, n_obj; end if;
    if exists (select 1 from cs_case_items ci where ci.case_id = c.id and (ci.tickets is null or ci.tickets <= 0)) then raise exception 'FALLO: %: un objeto no tiene tickets', c.name; end if;
    -- las probabilidades (tickets entre el total) suman 100 %: EmpireDrop reparte 10.000.000 de tickets por caja
    if tot <> 10000000 then raise exception 'FALLO: %: sus tickets suman % y tienen que ser 10.000.000 (100 %%)', c.name, tot; end if;
    if exists (select 1 from cs_case_items ci join cs_items t on t.id = ci.item_id where ci.case_id = c.id and (
         t.name !~ '[^[:space:]]' or t.name ~ '\s[-–—]\s' or t.minf is not null or t.maxf is not null or t.st or t.phase is not null
         or t.image !~ '^https://pmbanks[.]github[.]io/apuestas/img/lujo/ed/[0-9a-zA-Z_]+[.]webp$' or t.id !~ '^ed-')) then
      raise exception 'FALLO: %: un objeto sin nombre, con guion, con desgaste, StatTrak, fase o con una imagen que no es de img/lujo/ed', c.name;
    end if;
    if exists (select 1 from cs_case_items ci join cs_items t on t.id = ci.item_id where ci.case_id = c.id and (cardinality(t.price) <> 10 or t.price[1] < 1 or (select count(distinct p) from unnest(t.price) p) <> 1)) then
      raise exception 'FALLO: %: un objeto no tiene precio, o lo tiene distinto segun el desgaste', c.name;
    end if;
    if exists (select 1 from cs_case_items ci where ci.case_id = c.id group by ci.item_id having count(*) > 1) then raise exception 'FALLO: %: un objeto esta dos veces', c.name; end if;
    select sum(ci.tickets::numeric * t.price[1]) / sum(ci.tickets) into ev_c from cs_case_items ci join cs_items t on t.id = ci.item_id where ci.case_id = c.id;
    if abs(c.ev - ev_c) > 0.5 then raise exception 'FALLO: % guarda ev % y su valor medio es %', c.name, c.ev, round(ev_c, 2); end if;
    dev := 100 * ev_c / c.price; min_dev := least(min_dev, dev); max_dev := greatest(max_dev, dev); n_items := n_items + n_obj;
    if dev < 80 or dev > 97 then raise exception 'FALLO: % devuelve de media un % %% de lo que cuesta (tiene que estar entre 80 y 97)', c.name, round(dev, 1); end if;
  end loop;
  resumen := resumen || format('%s filas caja-objeto; cada caja suma 10.000.000 de tickets (100 %%) y devuelve de media entre el %s %% y el %s %% de su precio. ', n_items, round(min_dev, 1), round(max_dev, 1));

  -- 3. abrir: 1 de cada caja cobra su precio y da un objeto de esa caja con su valor
  for c in select * from cs_cases where id = any(ids) order by sort loop
    s0 := (select coalesce(sum(amount), 0) from ledger where player = jug[1]);
    r := cs_open(c.id, 1);
    x := r->'items'->0;
    if (x->>'wear') is not null or (x->>'float') is not null or (x->>'st')::boolean then raise exception 'FALLO: %: el objeto ha salido con desgaste o StatTrak', c.name; end if;
    if (x->>'value')::int <> (select t.price[1] from cs_items t where t.id = x->>'item') then raise exception 'FALLO: %: el valor guardado no es el precio del objeto', c.name; end if;
    if (select coalesce(sum(amount), 0) from ledger where player = jug[1]) <> s0 - c.price then raise exception 'FALLO: abrir % no ha cobrado %', c.name, c.price; end if;
    if (select count(*) from cs_case_items ci where ci.case_id = c.id and ci.item_id = x->>'item') <> 1 then raise exception 'FALLO: %: ha salido un objeto que no es de esa caja', c.name; end if;
  end loop;
  select * into c from cs_cases where id = 'lujo-gaming';
  s0 := (select coalesce(sum(amount), 0) from ledger where player = jug[1]);
  r := cs_open(c.id, 5);
  if jsonb_array_length(r->'items') <> 5 or (select coalesce(sum(amount), 0) from ledger where player = jug[1]) <> s0 - 5 * c.price then raise exception 'FALLO: abrir 5 de Imperio Gamer no ha cobrado 5 veces'; end if;
  resumen := resumen || 'Abierta 1 de cada una de las 59 (cobra su precio, objeto de su caja, valor = precio del objeto) y 5 de Imperio Gamer. ';
  -- cs_case devuelve los tickets de las de EmpireDrop y null en las que tiran por rareza
  r := cs_case('lujo-cartas');
  if jsonb_array_length(r->'items') <> (select count(*) from cs_case_items where case_id = 'lujo-cartas') or r->>'cat' <> 'lujo' or exists (select 1 from jsonb_array_elements(r->'items') e where (e->>'tickets') is null) then
    raise exception 'FALLO: cs_case(cartas) no devuelve su contenido con tickets';
  end if;
  r := cs_case('lujo-patinetes');
  if exists (select 1 from jsonb_array_elements(r->'items') e where (e->>'tickets') is not null) then raise exception 'FALLO: cs_case(patinetes) no deberia llevar tickets'; end if;
  -- una caja que tira por rareza (Patinetes) y una de CS2 siguen abriendose
  r := cs_open('lujo-patinetes', 1);
  if jsonb_array_length(r->'items') <> 1 then raise exception 'FALLO: Patinetes ya no se abre'; end if;
  select * into c from cs_cases where active and cat = 'skins' order by sort limit 1;
  r := cs_open(c.id, 1);
  if jsonb_array_length(r->'items') <> 1 then raise exception 'FALLO: una caja de CS2 ya no se abre'; end if;

  -- 4. vender un objeto: una vez si, dos no
  r := cs_open('lujo-oro', 1); id1 := (r->'items'->0->>'id')::bigint;
  v1 := (select value from cs_inv where id = id1);
  s0 := (select coalesce(sum(amount), 0) from ledger where player = jug[1]);
  r := cs_sell(array[id1]);
  if (r->>'vendidas')::int <> 1 or (r->>'total')::int <> v1 or (select coalesce(sum(amount), 0) from ledger where player = jug[1]) <> s0 + v1 then raise exception 'FALLO: la venta no ha pagado lo que vale el objeto'; end if;
  fallo := false; begin perform cs_sell(array[id1]); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se ha podido vender dos veces el mismo objeto'; end if;
  resumen := resumen || format('Vendido un objeto de Dúo precioso por %s; venderlo otra vez falla. ', v1);

  -- 5. 20.000 tiradas de Imperio Gamer y de Alijo Pokemon: cada objeto sale con su probabilidad (cinco sigmas)
  for ruedas in 1..2 loop
    select * into c from cs_cases where id = case when ruedas = 1 then 'lujo-gaming' else 'lujo-cartas' end;
    cnt := '{}'::jsonb;
    for k in 1..ntir loop
      select * into d from cs_roll(c.id);
      if d.o_wear is not null or d.o_fl is not null or d.o_st then raise exception 'FALLO: una tirada de % ha salido con desgaste o StatTrak', c.name; end if;
      if not exists (select 1 from cs_case_items where case_id = c.id and item_id = d.o_item) then raise exception 'FALLO: una tirada de % ha dado un objeto de otra caja', c.name; end if;
      cnt := jsonb_set(cnt, array[d.o_item], to_jsonb(coalesce((cnt->>d.o_item)::int, 0) + 1));
    end loop;
    vistas := 0;
    for it in select ci.item_id, ci.tickets::numeric / 10000000 as p from cs_case_items ci where ci.case_id = c.id loop
      esperada := ntir * it.p; sd := sqrt(ntir * it.p * (1 - it.p));
      if it.p >= 0.005 then
        vistas := vistas + 1;
        if abs(coalesce((cnt->>it.item_id)::int, 0) - esperada) > 5 * sd + 2 then
          raise exception 'FALLO: % tiradas de %: el objeto % salio % veces y se esperaban % (+-%)', ntir, c.name, it.item_id, coalesce(cnt->>it.item_id, '0'), round(esperada, 1), round(5 * sd + 2, 1);
        end if;
      end if;
    end loop;
    resumen := resumen || format('%s tiradas de %s: %s objetos con mas de un 0,5 %% dentro de lo esperado. ', ntir, c.name, vistas);
  end loop;

  raise exception 'PRUEBA SUPERADA (no se ha guardado nada). %', resumen;
end $$;
