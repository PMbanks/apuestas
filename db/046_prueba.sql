-- Prueba de las 16 cajas de lujo nuevas, para el editor SQL de Supabase. Va despues de 046_cajas_nuevas.sql (y de todo lo anterior: 012b, 027...).
-- Comprueba que estan las 16 (con su imagen, de 8 a 14 objetos y las cinco rarezas), que ningun objeto lleva desgaste ni StatTrak, que cada caja cuesta su valor
-- medio como las de lujo de siempre (probabilidades de 012: 7570, 1800, 450, 130, 50) y cuanto devuelve de media con las odds de ahora (027), que las 10 cajas
-- viejas de lujo siguen igual, que abrir una caja nueva cobra lo justo y da un objeto de esa caja, que se puede vender una vez, y tira 10.000 veces dos cajas nuevas.
-- Al final lanza un error A PROPOSITO para que se deshaga todo: no queda nada guardado (ni saldo ni objetos). Si todo va bien dice "PRUEBA SUPERADA" con el resumen; si no, "FALLO".
do $$
declare
  nuevas text[] := array['lujo-gaming', 'lujo-zapatillas-2026', 'lujo-relojes-2026', 'lujo-tecnologia-2026', 'lujo-motor', 'lujo-joyas', 'lujo-perfumes', 'lujo-bolsos',
    'lujo-viajes', 'lujo-patinetes', 'lujo-camaras', 'lujo-streetwear', 'lujo-oro', 'lujo-cripto', 'lujo-gafas', 'lujo-cartas'];
  viejas text[] := array['lujo-relojes-calle', 'lujo-zapatillas-basicas', 'lujo-tecnologia-basica', 'lujo-moda-calle', 'lujo-zapatillas', 'lujo-tecnologia', 'lujo-motos',
    'lujo-moda-joyas', 'lujo-relojes', 'lujo-coches'];
  tiers text[] := array['mil', 'res', 'cla', 'cov', 'esp'];
  w_vieja int[] := array[7570, 1800, 450, 130, 50];       -- las de 012: con ellas se puso el precio de todas las cajas
  w_viva int[] := array[7992, 1598, 320, 64, 26];         -- las de 027: con las que tira el servidor ahora
  esperado int[] := array[7992, 1598, 320, 64, 26];
  tol int[] := array[200, 180, 90, 40, 26];               -- unos 5 sigmas de 10.000 tiradas: no falla por casualidad
  jug uuid[] := array(select id from players order by created_at);
  c cs_cases; r jsonb; x jsonb; d record; cnt jsonb; rr text;
  ev_v numeric; ev_n numeric; n_obj int; s0 int; id1 bigint; v1 int; fallo boolean; resumen text := ''; k int; ruedas int; suma_v numeric; st int;
  min_dev numeric := 1000; max_dev numeric := 0; dev numeric; n_viejas_ok int := 0; cid text;
begin
  if cardinality(jug) < 2 then raise exception 'FALLO: hacen falta al menos dos jugadores'; end if;
  insert into ledger(player, amount, kind, note) select id, 50000000, 'ajuste', 'saldo de prueba' from players;
  perform pay_week();

  -- 1. estan las 16, activas y de lujo; las 10 viejas siguen ahi
  if (select count(*) from cs_cases where id = any(nuevas) and active and cat = 'lujo') <> 16 then
    raise exception 'FALLO: tienen que estar las 16 cajas nuevas activas y de lujo (hay %). Carga 046_cajas_nuevas.sql', (select count(*) from cs_cases where id = any(nuevas) and active and cat = 'lujo');
  end if;
  if (select count(*) from cs_cases where id = any(viejas) and active and cat = 'lujo') <> 10 then raise exception 'FALLO: las 10 cajas de lujo viejas tienen que seguir activas'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', jug[1], 'role', 'authenticated')::text, true);
  r := cs_cases();
  if (select count(*) from jsonb_array_elements(r) e where (e->>'id') = any(nuevas) and e->>'cat' = 'lujo') <> 16 then raise exception 'FALLO: cs_cases() no lista las 16 nuevas como lujo'; end if;
  if (select count(*) from jsonb_array_elements(r) e where e->>'cat' = 'lujo') <> (select count(*) from cs_cases where active and cat = 'lujo') then raise exception 'FALLO: cs_cases() no lista todas las de lujo'; end if;
  if (select count(distinct name) from cs_cases where id = any(nuevas)) <> 16 or exists (select 1 from cs_cases n join cs_cases v on v.name = n.name and v.id <> n.id where n.id = any(nuevas)) then
    raise exception 'FALLO: una caja nueva se llama igual que otra';
  end if;
  resumen := resumen || format('%s cajas de lujo en total (16 nuevas + %s viejas). ', (select count(*) from cs_cases where active and cat = 'lujo'), (select count(*) from cs_cases where id = any(viejas)));

  -- 2. cada caja nueva: imagen de caja, 8 a 14 objetos, cinco rarezas, nada de desgaste ni StatTrak, un precio por objeto, precio de caja = valor medio
  for c in select * from cs_cases where id = any(nuevas) order by sort loop
    if c.image <> 'https://pmbanks.github.io/apuestas/img/lujo/cajas/' || substr(c.id, 6) || '.webp' then raise exception 'FALLO: %: la imagen de la caja no es la que toca (%)', c.name, c.image; end if;
    select count(*) into n_obj from cs_case_items where case_id = c.id;
    if n_obj < 8 or n_obj > 14 then raise exception 'FALLO: %: tiene % objetos (tienen que ser de 8 a 14)', c.name, n_obj; end if;
    if (select count(distinct t.rarity) from cs_case_items ci join cs_items t on t.id = ci.item_id where ci.case_id = c.id) <> 5 then raise exception 'FALLO: %: le falta alguna de las cinco rarezas', c.name; end if;
    if exists (select 1 from cs_case_items ci join cs_items t on t.id = ci.item_id where ci.case_id = c.id and (t.minf is not null or t.maxf is not null or t.st or t.phase is not null or t.image !~ '^https://pmbanks[.]github[.]io/apuestas/img/lujo/[a-z0-9-]+(/[a-z0-9-]+)?[.]webp$')) then
      raise exception 'FALLO: %: un objeto lleva desgaste, StatTrak, fase o una imagen que no es de img/lujo', c.name;
    end if;
    if exists (select 1 from cs_case_items ci join cs_items t on t.id = ci.item_id where ci.case_id = c.id and ((select count(distinct p) from unnest(t.price) p) <> 1 or cardinality(t.price) <> 10 or t.price[1] < 1)) then
      raise exception 'FALLO: %: un objeto tiene precio distinto segun el desgaste o menor que 1', c.name;
    end if;
    if exists (select 1 from cs_case_items ci where ci.case_id = c.id group by ci.item_id having count(*) > 1) then raise exception 'FALLO: %: un objeto esta dos veces', c.name; end if;
    -- cada rareza trae al menos un objeto mas barato que el de la rareza de arriba (lo barato y frecuente, lo caro y raro)
    for k in 1..4 loop
      if (select avg(t.price[1]) from cs_case_items ci join cs_items t on t.id = ci.item_id where ci.case_id = c.id and t.rarity = tiers[k]) >=
         (select avg(t.price[1]) from cs_case_items ci join cs_items t on t.id = ci.item_id where ci.case_id = c.id and t.rarity = tiers[k + 1]) then
        raise exception 'FALLO: %: los objetos % valen de media mas que los %', c.name, tiers[k], tiers[k + 1];
      end if;
    end loop;
    -- valor medio con las probabilidades de 012 (cada rareza pesa lo suyo, repartido entre las que tenga la caja) = el precio; y con las de 027 = lo que devuelve
    select sum(w_vieja[array_position(tiers, rarity)] * m) / sum(w_vieja[array_position(tiers, rarity)]), sum(w_viva[array_position(tiers, rarity)] * m) / sum(w_viva[array_position(tiers, rarity)])
      into ev_v, ev_n from (select t.rarity, avg(t.price[1]) as m from cs_case_items ci join cs_items t on t.id = ci.item_id where ci.case_id = c.id group by t.rarity) z;
    if abs(ev_v - c.price) > 1 then raise exception 'FALLO: % cuesta % pero su valor medio es %', c.name, c.price, round(ev_v, 2); end if;
    if abs(c.ev - ev_v) > 0.5 then raise exception 'FALLO: % guarda ev % y su valor medio es %', c.name, c.ev, round(ev_v, 2); end if;
    dev := 100 * ev_n / c.price; min_dev := least(min_dev, dev); max_dev := greatest(max_dev, dev);
    if dev > 100 then raise exception 'FALLO: % devuelve de media mas de lo que cuesta (% %%)', c.name, round(dev, 1); end if;
    resumen := resumen || format('%s %s (%s objetos, devuelve %s %%). ', c.name, c.price, n_obj, round(dev));
  end loop;
  -- las viejas se miden igual: el margen de las nuevas tiene que ser del mismo estilo (ni mas generoso ni mucho peor)
  declare v_min numeric := 1000; v_max numeric := 0; begin
    for c in select * from cs_cases where id = any(viejas) loop
      select sum(w_viva[array_position(tiers, rarity)] * m) / sum(w_viva[array_position(tiers, rarity)]) into ev_n
        from (select t.rarity, avg(t.price[1]) as m from cs_case_items ci join cs_items t on t.id = ci.item_id where ci.case_id = c.id group by t.rarity) z;
      dev := 100 * ev_n / c.price; v_min := least(v_min, dev); v_max := greatest(v_max, dev); n_viejas_ok := n_viejas_ok + 1;
    end loop;
    resumen := resumen || format('Devolucion media con las odds de ahora: las 16 nuevas entre %s %% y %s %%, las %s viejas entre %s %% y %s %%. ', round(min_dev), round(max_dev), n_viejas_ok, round(v_min), round(v_max));
    if min_dev < 40 or max_dev > v_max + 15 then raise exception 'FALLO: el margen de las nuevas (% a % %%) se sale del de las viejas (% a % %%)', round(min_dev), round(max_dev), round(v_min), round(v_max); end if;
  end;

  -- 3. abrir: 1 de cada nueva cobra su precio y da un objeto de esa caja con su valor; abrir 5 de una cobra 5 veces
  for c in select * from cs_cases where id = any(nuevas) order by sort loop
    s0 := (select coalesce(sum(amount), 0) from ledger where player = jug[1]);
    r := cs_open(c.id, 1);
    x := r->'items'->0;
    if (x->>'wear') is not null or (x->>'float') is not null or (x->>'st')::boolean then raise exception 'FALLO: %: el objeto ha salido con desgaste o StatTrak', c.name; end if;
    if (x->>'value')::int <> (select t.price[1] from cs_items t where t.id = x->>'item') then raise exception 'FALLO: %: el valor guardado no es el precio del objeto', c.name; end if;
    if (select coalesce(sum(amount), 0) from ledger where player = jug[1]) <> s0 - c.price then raise exception 'FALLO: abrir % no ha cobrado %', c.name, c.price; end if;
    if (select count(*) from cs_case_items ci where ci.case_id = c.id and ci.item_id = x->>'item') <> 1 then raise exception 'FALLO: %: ha salido un objeto que no es de esa caja', c.name; end if;
    resumen := resumen || format('%s dio %s (%s). ', c.name, (select name from cs_items where id = x->>'item'), x->>'value');
  end loop;
  select * into c from cs_cases where id = 'lujo-gaming';
  s0 := (select coalesce(sum(amount), 0) from ledger where player = jug[1]);
  r := cs_open(c.id, 5);
  if jsonb_array_length(r->'items') <> 5 or (select coalesce(sum(amount), 0) from ledger where player = jug[1]) <> s0 - 5 * c.price then raise exception 'FALLO: abrir 5 de Gaming no ha cobrado 5 veces'; end if;
  -- y cs_case devuelve lo que trae para pintarlo
  r := cs_case('lujo-cartas');
  if jsonb_array_length(r->'items') <> (select count(*) from cs_case_items where case_id = 'lujo-cartas') or r->>'cat' <> 'lujo' then raise exception 'FALLO: cs_case(cartas) no devuelve su contenido'; end if;

  -- 4. vender un objeto de una caja nueva: una vez si, dos no; el de otro jugador no
  perform set_config('request.jwt.claims', jsonb_build_object('sub', jug[1], 'role', 'authenticated')::text, true);
  id1 := (select id from cs_inv where player = jug[1] and status = 'own' and case_id = 'lujo-oro' order by id desc limit 1);
  r := cs_open('lujo-oro', 1); id1 := (r->'items'->0->>'id')::bigint;
  v1 := (select value from cs_inv where id = id1);
  s0 := (select coalesce(sum(amount), 0) from ledger where player = jug[1]);
  r := cs_sell(array[id1]);
  if (r->>'vendidas')::int <> 1 or (r->>'total')::int <> v1 or (select coalesce(sum(amount), 0) from ledger where player = jug[1]) <> s0 + v1 then raise exception 'FALLO: la venta no ha pagado lo que vale el objeto'; end if;
  fallo := false; begin perform cs_sell(array[id1]); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se ha podido vender dos veces el mismo objeto'; end if;
  resumen := resumen || format('Vendido un objeto de Oro por %s; venderlo otra vez falla. ', v1);

  -- 5. 10.000 tiradas de Gaming y de Cartas (sin guardar nada): las odds de ahora
  for ruedas in 1..2 loop
    select * into c from cs_cases where id = case when ruedas = 1 then 'lujo-gaming' else 'lujo-cartas' end;
    cnt := '{}'::jsonb; st := 0; suma_v := 0;
    for k in 1..10000 loop
      select * into d from cs_roll(c.id);
      rr := (select rarity from cs_items where id = d.o_item);
      cnt := jsonb_set(cnt, array[rr], to_jsonb(coalesce((cnt->>rr)::int, 0) + 1));
      if d.o_wear is not null or d.o_fl is not null or d.o_st then raise exception 'FALLO: una tirada de % ha salido con desgaste o StatTrak', c.name; end if;
      suma_v := suma_v + d.o_value;
    end loop;
    for k in 1..5 loop
      if abs(coalesce((cnt->>tiers[k])::int, 0) - esperado[k]) > tol[k] then
        raise exception 'FALLO: 10.000 tiradas de %: % salieron % y se esperaban % (+-%)', c.name, tiers[k], coalesce(cnt->>tiers[k], '0'), esperado[k], tol[k];
      end if;
    end loop;
    resumen := resumen || format('10.000 tiradas de %s: grado militar %s, restringido %s, clasificado %s, encubierto %s, especial %s (se esperan 7992, 1598, 320, 64, 26); de media sale %s y cuesta %s. ',
      c.name, coalesce(cnt->>'mil', '0'), coalesce(cnt->>'res', '0'), coalesce(cnt->>'cla', '0'), coalesce(cnt->>'cov', '0'), coalesce(cnt->>'esp', '0'), round(suma_v / 10000, 1), c.price);
  end loop;

  raise exception 'PRUEBA SUPERADA (no se ha guardado nada). %', resumen;
end $$;
