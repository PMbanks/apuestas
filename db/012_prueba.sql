-- Prueba de las Cajas, segunda tanda, para el editor SQL de Supabase. Va despues de 007_cajas.sql, 012_cajas_mas.sql y 012b_cajas_datos.sql.
-- Comprueba que hay 30 cajas de skins y 5 de lujo con su categoria, que cada caja cuesta lo que vale de media (devolucion del 100 %),
-- abre una caja de skins y una de cada de lujo, vende un reloj (y vender dos veces falla), juega una batalla 1v1 mezclando skins y lujo
-- y tira 10.000 veces una caja de skins y 10.000 una de lujo para ver las probabilidades nuevas.
-- Al final lanza un error A PROPOSITO para que se deshaga todo: no queda nada guardado (ni saldo, ni objetos, ni chat).
-- Si todo va bien, el error dice "PRUEBA SUPERADA" con el resumen. Si algo falla, dice "FALLO" y que.
do $$
declare
  jug uuid[] := array(select id from players order by created_at);
  sk cs_cases; lu cs_cases; c cs_cases; b cs_battles;
  r jsonb; x jsonb;
  s0 int; s1 int; bid bigint; id1 bigint; v1 int; n1 int; fallo boolean; resumen text := '';
  d record; rr text; cnt jsonb; st int; ruedas int; suma_v numeric; ev_lujo numeric; tiers text[] := array['mil','res','cla','cov','esp'];
  esperado int[] := array[7570, 1800, 450, 130, 50];
  tol int[] := array[250, 200, 110, 60, 40];            -- unos 5 sigmas de 10.000 tiradas: no falla por casualidad
  k int; ok boolean;
begin
  if cardinality(jug) < 2 then raise exception 'FALLO: hacen falta al menos dos jugadores'; end if;
  insert into ledger(player, amount, kind, note) select id, 50000000, 'ajuste', 'saldo de prueba' from players;
  perform pay_week();                                   -- que la paga del lunes ya este cobrada y no mueva los saldos a mitad de la prueba

  -- 1. hay cajas de las dos categorias y la lista las devuelve con su categoria
  if (select count(*) from cs_cases where active and cat = 'skins') < 30 then
    raise exception 'FALLO: tiene que haber al menos 30 cajas de skins (hay %). Carga 012b_cajas_datos.sql', (select count(*) from cs_cases where active and cat = 'skins');
  end if;
  if (select count(*) from cs_cases where active and cat = 'lujo') < 9 then raise exception 'FALLO: tiene que haber al menos 9 cajas de lujo (hay %). Carga 012b_cajas_datos.sql', (select count(*) from cs_cases where active and cat = 'lujo'); end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', jug[1], 'role', 'authenticated')::text, true);
  r := cs_cases();
  if exists (select 1 from jsonb_array_elements(r) e where e->>'cat' is null or e->>'cat' not in ('skins', 'lujo')) then raise exception 'FALLO: cs_cases() no devuelve la categoria'; end if;
  if (select count(*) from jsonb_array_elements(r) e where e->>'cat' = 'lujo') <> (select count(*) from cs_cases where active and cat = 'lujo') then raise exception 'FALLO: cs_cases() no lista todas las de lujo'; end if;
  if (r->0->>'cat') <> 'skins' or (r->-1->>'cat') <> 'lujo' then raise exception 'FALLO: cs_cases() tiene que dar primero las de skins y al final las de lujo'; end if;
  resumen := resumen || format('%s cajas de skins y %s de lujo. ', (select count(*) from cs_cases where active and cat = 'skins'), (select count(*) from cs_cases where active and cat = 'lujo'));

  -- 2. las de lujo: ni desgaste ni StatTrak, un solo precio por objeto, y cada caja cuesta su valor medio exacto
  for c in select * from cs_cases where active and cat = 'lujo' order by sort loop
    if c.image !~ '^https://pmbanks.github.io/apuestas/img/lujo/cajas/[a-z0-9-]+[.]webp$' then raise exception 'FALLO: %: la imagen de la caja de lujo no es una caja (%)', c.name, c.image; end if;
    if (select count(distinct t.rarity) from cs_case_items ci join cs_items t on t.id = ci.item_id where ci.case_id = c.id) <> 5 then raise exception 'FALLO: %: le falta alguna de las cinco rarezas', c.name; end if;
    if exists (select 1 from cs_case_items ci join cs_items t on t.id = ci.item_id where ci.case_id = c.id and (t.minf is not null or t.st or t.image !~ '^https://')) then
      raise exception 'FALLO: %: un objeto de lujo lleva desgaste, StatTrak o una imagen que no es absoluta', c.name;
    end if;
    if exists (select 1 from cs_case_items ci join cs_items t on t.id = ci.item_id where ci.case_id = c.id and (select count(distinct p) from unnest(t.price) p) <> 1) then
      raise exception 'FALLO: %: un objeto de lujo tiene precios distintos segun el desgaste', c.name;
    end if;
    -- valor medio: cada rareza pesa lo que dice cs_roll (7570, 1800, 450, 130, 50), repartido entre las que tenga la caja
    select sum(w * m) / sum(w) into ev_lujo from (
      select (array[7570, 1800, 450, 130, 50])[array_position(tiers, t.rarity)] as w, avg(t.price[1]) as m
        from cs_case_items ci join cs_items t on t.id = ci.item_id where ci.case_id = c.id group by t.rarity) z;
    if abs(ev_lujo - c.price) > 1 then raise exception 'FALLO: % cuesta % pero su valor medio es %', c.name, c.price, round(ev_lujo, 2); end if;
    resumen := resumen || format('%s %s (%s objetos, valor medio %s). ', c.name, c.price, (select count(*) from cs_case_items where case_id = c.id), round(ev_lujo, 1));
  end loop;
  -- las de skins: el precio es el valor medio que guardo el generador (redondeado)
  if exists (select 1 from cs_cases where active and cat = 'skins' and abs(price - ev) > 1) then raise exception 'FALLO: alguna caja de skins no cuesta su valor medio'; end if;

  -- 3. abre 3 de la caja de skins mas barata y 1 de cada caja de lujo
  select * into sk from cs_cases where active and cat = 'skins' order by price, id limit 1;
  s0 := (select coalesce(sum(amount), 0) from ledger where player = jug[1]);
  r := cs_open(sk.id, 3);
  if jsonb_array_length(r->'items') <> 3 then raise exception 'FALLO: abrir 3 cajas de skins no ha dado 3 objetos'; end if;
  s1 := (select coalesce(sum(amount), 0) from ledger where player = jug[1]);
  if s1 <> s0 - 3 * sk.price then raise exception 'FALLO: abrir 3 de % tenia que cobrar % y ha cobrado %', sk.name, 3 * sk.price, s0 - s1; end if;
  resumen := resumen || format('Abiertas 3 %s: %s. ', sk.name, (select string_agg(t.name || ' ' || (e->>'value'), ', ') from jsonb_array_elements(r->'items') e join cs_items t on t.id = e->>'item'));
  for c in select * from cs_cases where active and cat = 'lujo' order by sort loop
    s0 := (select coalesce(sum(amount), 0) from ledger where player = jug[1]);
    r := cs_open(c.id, 1);
    x := r->'items'->0;
    if (x->>'wear') is not null or (x->>'float') is not null or (x->>'st')::boolean then raise exception 'FALLO: %: el objeto de lujo ha salido con desgaste o StatTrak', c.name; end if;
    if (x->>'value')::int <> (select t.price[1] from cs_items t where t.id = x->>'item') then raise exception 'FALLO: %: el valor guardado no es el precio del objeto', c.name; end if;
    if (select coalesce(sum(amount), 0) from ledger where player = jug[1]) <> s0 - c.price then raise exception 'FALLO: abrir % no ha cobrado %', c.name, c.price; end if;
    if (select count(*) from cs_case_items ci join cs_items t on t.id = ci.item_id where ci.case_id = c.id and t.id = x->>'item') <> 1 then raise exception 'FALLO: %: ha salido un objeto que no es de esa caja', c.name; end if;
    resumen := resumen || format('%s dio %s (%s). ', c.name, (select name from cs_items where id = x->>'item'), (x->>'value'));
  end loop;
  select * into lu from cs_cases where active and cat = 'lujo' order by price, id limit 1;

  -- 4. vende un objeto de lujo; venderlo otra vez falla; otro jugador no puede venderlo
  id1 := (select id from cs_inv where player = jug[1] and status = 'own' and case_id = lu.id order by id desc limit 1);
  if id1 is null then r := cs_open(lu.id, 1); id1 := (r->'items'->0->>'id')::bigint; end if;
  v1 := (select value from cs_inv where id = id1);
  s0 := (select coalesce(sum(amount), 0) from ledger where player = jug[1]);
  r := cs_sell(array[id1]);
  if (r->>'vendidas')::int <> 1 or (r->>'total')::int <> v1 then raise exception 'FALLO: la venta no ha pagado lo que vale el objeto'; end if;
  if (select coalesce(sum(amount), 0) from ledger where player = jug[1]) <> s0 + v1 then raise exception 'FALLO: la venta no ha sumado al saldo'; end if;
  fallo := false;
  begin perform cs_sell(array[id1]); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se ha podido vender dos veces el mismo objeto'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', jug[2], 'role', 'authenticated')::text, true);
  fallo := false;
  begin perform cs_sell(array[(select id from cs_inv where player = jug[1] and status = 'own' order by id desc limit 1)]); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se ha podido vender un objeto de otro'; end if;
  resumen := resumen || format('Vendido un objeto de %s por %s; venderlo otra vez falla. ', lu.name, v1);

  -- 5. batalla 1v1 con una caja de skins y una de lujo
  perform set_config('request.jwt.claims', jsonb_build_object('sub', jug[1], 'role', 'authenticated')::text, true);
  s0 := (select coalesce(sum(amount), 0) from ledger where player = jug[1]);
  bid := (cs_battle_create('1v1', array[sk.id, lu.id])->>'id')::bigint;
  if (select coalesce(sum(amount), 0) from ledger where player = jug[1]) <> s0 - sk.price - lu.price then raise exception 'FALLO: crear la batalla no ha cobrado bien'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', jug[2], 'role', 'authenticated')::text, true);
  r := cs_battle_join(bid);
  select * into b from cs_battles where id = bid;
  if not (r->>'done')::boolean or b.status <> 'done' or b.winner is null then raise exception 'FALLO: la batalla no se ha resuelto al llenarse'; end if;
  if (select count(*) from cs_battle_drops where battle_id = bid) <> 4 then raise exception 'FALLO: una 1v1 de 2 cajas tiene que sacar 4 objetos'; end if;
  if (select sum(i.value) from cs_battle_drops d2 join cs_inv i on i.id = d2.inv_id where d2.battle_id = bid) <> b.totals[1] + b.totals[2] then raise exception 'FALLO: los totales de la batalla no cuadran'; end if;
  resumen := resumen || format('Batalla skins + lujo: %s a %s. ', b.totals[1], b.totals[2]);

  -- 6. 10.000 tiradas de la caja de skins mas barata y 10.000 de la de lujo mas barata (sin guardar nada)
  for ruedas in 1..2 loop
    c := case when ruedas = 1 then sk else lu end;
    cnt := '{}'::jsonb; st := 0; suma_v := 0;
    for k in 1..10000 loop
      select * into d from cs_roll(c.id);
      rr := (select rarity from cs_items where id = d.o_item);
      cnt := jsonb_set(cnt, array[rr], to_jsonb(coalesce((cnt->>rr)::int, 0) + 1));
      if d.o_st then st := st + 1; end if;
      if ruedas = 2 and (d.o_wear is not null or d.o_fl is not null or d.o_st) then raise exception 'FALLO: una tirada de lujo ha salido con desgaste o StatTrak'; end if;
      suma_v := suma_v + d.o_value;
    end loop;
    ok := true;
    for k in 1..5 loop
      if abs(coalesce((cnt->>tiers[k])::int, 0) - esperado[k]) > tol[k] then
        raise exception 'FALLO: 10.000 tiradas de %: % salieron % y se esperaban % (+-%)', c.name, tiers[k], coalesce(cnt->>tiers[k], '0'), esperado[k], tol[k];
      end if;
    end loop;
    resumen := resumen || format('10.000 tiradas de %s (%s): grado militar %s, restringido %s, clasificado %s, encubierto %s, especial %s (se esperan 7570, 1800, 450, 130, 50); StatTrak %s; devolucion media %s %% (cuesta %s, de media sale %s). ',
      c.name, case when ruedas = 1 then 'skins' else 'lujo' end,
      coalesce(cnt->>'mil', '0'), coalesce(cnt->>'res', '0'), coalesce(cnt->>'cla', '0'), coalesce(cnt->>'cov', '0'), coalesce(cnt->>'esp', '0'),
      st, round(100 * suma_v / 10000 / c.price, 1), c.price, round(suma_v / 10000, 1));
  end loop;

  raise exception 'PRUEBA SUPERADA (no se ha guardado nada). %', resumen;
end $$;
