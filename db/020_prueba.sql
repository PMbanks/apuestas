-- Prueba del Mercado, para el editor SQL de Supabase. Va despues de 020_mercado.sql y 020b_cosmeticos_datos.sql (y de 007, 012 y 012b de las cajas).
-- Comprueba: las cinco cajas de Cosmeticos (precio entre 20 y 150, devolucion media del 100 %, abrir una cobra y da piezas con su tipo), llevar un
-- marco y un fondo (y que una pieza vendida deja de llevarse); los intercambios (aceptar mueve piezas y V-Bucks de golpe, cancelar y rechazar lo
-- devuelven, y si algo falla no cambia nada de dueno); el mercado (comprar, retirar, no se compra dos veces, una pieza en venta no se puede vender
-- de otra manera); los contratos (10 de la misma rareza, sale la siguiente de las mismas cajas, y 400 contratos para ver que siempre cuadra);
-- y el jackpot (cobra al entrar, un solo jugador puede salir, el boleto lo reparte todo, y 3.000 rondas 1 contra 3 para ver el reparto).
-- Tambien que nadie de fuera puede llamar a las funciones de dentro ni escribir en las tablas.
-- Al final lanza un error A PROPOSITO para que se deshaga todo: no queda nada guardado (ni saldo, ni piezas, ni chat).
-- Si todo va bien, el error dice "PRUEBA SUPERADA" con el resumen. Si algo falla, dice "FALLO" y que.

-- ayudantes que viven solo durante esta prueba
create or replace function pg_temp.yo(n int) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', jsonb_build_object('sub', (select id from players order by created_at, username offset n - 1 limit 1), 'role', 'authenticated')::text, true); end $$;
create or replace function pg_temp.uid(n int) returns uuid language sql as $$ select id from players order by created_at, username offset n - 1 limit 1 $$;
create or replace function pg_temp.sal(n int) returns int language sql as $$ select coalesce(sum(amount), 0)::int from ledger where player = pg_temp.uid(n) $$;
create or replace function pg_temp.falla(q text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return true; end $$;
create or replace function pg_temp.da(n int, item text) returns bigint language sql as $$
  insert into cs_inv(player, item_id, value, case_id, opened_by) select pg_temp.uid(n), t.id, t.price[1], null, pg_temp.uid(n) from cs_items t where t.id = item returning id $$;
create or replace function pg_temp.st(i bigint) returns text language sql as $$ select status from cs_inv where id = i $$;
create or replace function pg_temp.dueno(i bigint) returns uuid language sql as $$ select player from cs_inv where id = i $$;

do $$
declare
  jug uuid[] := array(select id from players order by created_at, username);
  c cs_cases; r jsonb; x jsonb; resumen text := '';
  s1 int; s2 int; s3 int; t0 int; t1 int; a1 bigint; a2 bigint; b1 bigint; b2 bigint; tid bigint; vid bigint; ids bigint[]; n int; k int; ev numeric;
  tiers text[] := array['mil','res','cla','cov','esp']; w int[] := array[7570, 1800, 450, 130, 50];
  gana1 int := 0; gana2 int := 0; j mk_jackpot; cnt int[]; it text;
  esp_ids bigint[];
begin
  if cardinality(jug) < 3 then raise exception 'FALLO: hacen falta al menos tres jugadores'; end if;
  insert into ledger(player, amount, kind, note) select id, 50000000, 'ajuste', 'saldo de prueba' from players;
  perform pay_week();

  -- 1. las cajas de Cosmeticos: cinco, entre 20 y 150, cada una cuesta su valor medio y tiene piezas con tipo
  if (select count(*) from cs_cases where active and cat = 'cosmeticos') <> 5 then raise exception 'FALLO: tiene que haber 5 cajas de Cosmeticos (hay %). Carga 020b_cosmeticos_datos.sql', (select count(*) from cs_cases where active and cat = 'cosmeticos'); end if;
  for c in select * from cs_cases where active and cat = 'cosmeticos' order by sort loop
    if c.price < 20 or c.price > 150 then raise exception 'FALLO: % cuesta %: tiene que estar entre 20 y 150', c.name, c.price; end if;
    if exists (select 1 from cs_case_items ci left join cos_def d on d.item_id = ci.item_id where ci.case_id = c.id and d.item_id is null) then raise exception 'FALLO: %: una pieza no tiene tipo en cos_def', c.name; end if;
    if exists (select 1 from cs_case_items ci join cs_items t on t.id = ci.item_id where ci.case_id = c.id and (t.minf is not null or t.st or t.image !~ '^https://.*[.](svg|webp)$' or (select count(distinct p) from unnest(t.price) p) <> 1)) then
      raise exception 'FALLO: %: una pieza lleva desgaste, StatTrak, imagen que no es absoluta o varios precios', c.name;
    end if;
    select sum(wt * m) / sum(wt) into ev from (select w[array_position(tiers, t.rarity)] as wt, avg(t.price[1]) as m
      from cs_case_items ci join cs_items t on t.id = ci.item_id where ci.case_id = c.id group by t.rarity) z;
    if abs(ev - c.price) > 1 then raise exception 'FALLO: % cuesta % pero su valor medio es %', c.name, c.price, round(ev, 2); end if;
    resumen := resumen || format('%s %s (%s piezas). ', c.name, c.price, (select count(*) from cs_case_items where case_id = c.id));
  end loop;
  if exists (select 1 from cos_def d where d.tipo = 'marco' and d.clave !~ '^[a-z-]+$') then raise exception 'FALLO: una clave de marco rara'; end if;

  -- 2. abrir una caja de Cosmeticos cobra y da piezas que salen en cos_estado
  perform pg_temp.yo(1);
  select * into c from cs_cases where id = 'cos-aros';
  s1 := pg_temp.sal(1);
  r := cs_open('cos-aros', 5);
  if jsonb_array_length(r->'items') <> 5 or pg_temp.sal(1) <> s1 - 5 * c.price then raise exception 'FALLO: abrir 5 cajas Aros no ha cobrado % o no ha dado 5 piezas', 5 * c.price; end if;
  x := cos_estado();
  if jsonb_array_length(x->'mios') <> 5 or exists (select 1 from jsonb_array_elements(x->'mios') e where e->>'tipo' <> 'marco' or e->>'clave' is null or e->>'name' is null) then raise exception 'FALLO: cos_estado no da los 5 marcos con su tipo y clave'; end if;

  -- 3. llevar un marco y un fondo
  a1 := pg_temp.da(1, 'cos-marco-oro'); a2 := pg_temp.da(1, 'cos-fondo-aurora'); b1 := pg_temp.da(2, 'cos-marco-neon-azul');
  r := cos_equipar('marco', a1);
  if (select e->>'marco' from jsonb_array_elements(r) e where (e->>'player')::uuid = jug[1]) is distinct from 'oro' then raise exception 'FALLO: el marco no se ha puesto'; end if;
  perform cos_equipar('fondo', a2);
  if (select e->>'fondo' from jsonb_array_elements(cos_equipados()) e where (e->>'player')::uuid = jug[1]) is distinct from 'aurora' then raise exception 'FALLO: el fondo no se ha puesto'; end if;
  if not pg_temp.falla(format('select cos_equipar(''fondo'', %s)', a1)) then raise exception 'FALLO: se ha podido poner un marco como fondo'; end if;
  if not pg_temp.falla(format('select cos_equipar(''marco'', %s)', b1)) then raise exception 'FALLO: se ha podido llevar un marco de otro'; end if;
  perform pg_temp.yo(2);
  perform cos_equipar('marco', b1);
  if (select count(*) from jsonb_array_elements(cos_equipados()) e where e->>'marco' is not null) <> 2 then raise exception 'FALLO: cos_equipados tiene que ver el marco de los dos'; end if;
  -- vender (o poner a la venta) lo que llevas puesto lo quita solo
  perform pg_temp.yo(1);
  perform cs_sell(array[a1]);
  if (select e->>'marco' from jsonb_array_elements(cos_equipados()) e where (e->>'player')::uuid = jug[1]) is not null then raise exception 'FALLO: un marco vendido sigue puesto'; end if;
  perform cos_equipar('marco', null);
  a1 := pg_temp.da(1, 'cos-marco-oro'); perform cos_equipar('marco', a1);
  perform mk_vender(a1, 500);
  if (select e->>'marco' from jsonb_array_elements(cos_equipados()) e where (e->>'player')::uuid = jug[1]) is not null then raise exception 'FALLO: un marco en venta sigue puesto'; end if;
  perform mk_retirar((select id from mk_ventas where inv_id = a1 and status = 'abierta'));
  if (select e->>'marco' from jsonb_array_elements(cos_equipados()) e where (e->>'player')::uuid = jug[1]) is distinct from 'oro' then raise exception 'FALLO: al retirarlo de la venta el marco tiene que volver a estar puesto'; end if;
  resumen := resumen || 'Marcos y fondos: se llevan, se ven de todos y no sobreviven a vender. ';

  -- 4. intercambios: aceptar mueve todo de golpe
  perform pg_temp.yo(1);
  a1 := pg_temp.da(1, 'cos-obj-monster-white'); a2 := pg_temp.da(1, 'cos-obj-red-bull'); b1 := pg_temp.da(2, 'cos-obj-game-boy'); b2 := pg_temp.da(2, 'cos-fondo-galaxia');
  s1 := pg_temp.sal(1); s2 := pg_temp.sal(2); t0 := (select coalesce(sum(amount), 0) from ledger);
  r := mk_trato_crear(jug[2], array[a1, a2], 100, array[b1], 50, 'cambio?');
  tid := (r->>'id')::bigint;
  if pg_temp.st(a1) <> 'trd' or pg_temp.st(a2) <> 'trd' or pg_temp.sal(1) <> s1 - 100 then raise exception 'FALLO: proponer un trato tiene que dejar mis piezas y mis V-Bucks en deposito'; end if;
  if not pg_temp.falla(format('select cs_sell(array[%s])', a1)) then raise exception 'FALLO: una pieza en un trato se ha podido vender'; end if;
  if not pg_temp.falla(format('select mk_vender(%s, 10)', a1)) then raise exception 'FALLO: una pieza en un trato se ha podido poner a la venta'; end if;
  if not pg_temp.falla(format('select mk_trato_aceptar(%s)', tid)) then raise exception 'FALLO: el que propone ha podido aceptar su propio trato'; end if;
  perform pg_temp.yo(3);
  if not pg_temp.falla(format('select mk_trato_aceptar(%s)', tid)) then raise exception 'FALLO: un tercero ha podido aceptar el trato'; end if;
  if not pg_temp.falla(format('select mk_trato_rechazar(%s)', tid)) then raise exception 'FALLO: un tercero ha podido rechazar el trato'; end if;
  if not pg_temp.falla(format('select mk_trato_cancelar(%s)', tid)) then raise exception 'FALLO: un tercero ha podido cancelar el trato'; end if;
  perform pg_temp.yo(2);
  r := mk_trato_aceptar(tid);
  if pg_temp.dueno(a1) <> jug[2] or pg_temp.dueno(a2) <> jug[2] or pg_temp.dueno(b1) <> jug[1] or pg_temp.st(a1) <> 'own' or pg_temp.st(b1) <> 'own' then raise exception 'FALLO: aceptar no ha cambiado las piezas de dueno'; end if;
  if pg_temp.dueno(b2) <> jug[2] then raise exception 'FALLO: una pieza que no estaba en el trato ha cambiado de dueno'; end if;
  if pg_temp.sal(1) <> s1 - 100 + 50 or pg_temp.sal(2) <> s2 + 100 - 50 then raise exception 'FALLO: los V-Bucks del trato no cuadran (% y %)', pg_temp.sal(1) - s1, pg_temp.sal(2) - s2; end if;
  if (select coalesce(sum(amount), 0) from ledger) <> t0 then raise exception 'FALLO: un trato ha creado o destruido V-Bucks'; end if;
  if not pg_temp.falla(format('select mk_trato_aceptar(%s)', tid)) then raise exception 'FALLO: un trato se ha podido aceptar dos veces'; end if;
  if pg_temp.sal(2) <> s2 + 50 then raise exception 'FALLO: aceptar dos veces ha movido dinero'; end if;
  resumen := resumen || 'Trato aceptado: piezas y V-Bucks cambian de manos y el total se conserva. ';

  -- cancelar y rechazar lo devuelven todo
  perform pg_temp.yo(1);
  s1 := pg_temp.sal(1);
  r := mk_trato_crear(jug[2], array[b1], 300, '{}', 0, '');
  tid := (r->>'id')::bigint;
  if pg_temp.sal(1) <> s1 - 300 or pg_temp.st(b1) <> 'trd' then raise exception 'FALLO: el depósito del trato no se ha hecho'; end if;
  perform mk_trato_cancelar(tid);
  if pg_temp.sal(1) <> s1 or pg_temp.st(b1) <> 'own' then raise exception 'FALLO: cancelar no ha devuelto lo ofrecido'; end if;
  if not pg_temp.falla(format('select mk_trato_cancelar(%s)', tid)) then raise exception 'FALLO: un trato cancelado se ha podido cancelar otra vez'; end if;
  tid := (mk_trato_crear(jug[2], array[b1], 300, '{}', 0, ''))->>'id';
  perform pg_temp.yo(2);
  perform mk_trato_rechazar(tid);
  if pg_temp.sal(1) <> s1 or pg_temp.st(b1) <> 'own' then raise exception 'FALLO: rechazar no ha devuelto lo ofrecido'; end if;
  if not pg_temp.falla(format('select mk_trato_aceptar(%s)', tid)) then raise exception 'FALLO: un trato rechazado se ha podido aceptar'; end if;

  -- si algo falla al aceptar no cambia nada: el otro ya no tiene lo que le piden / no le llega el saldo
  perform pg_temp.yo(1);
  tid := (mk_trato_crear(jug[2], array[b1], 40, array[a1], 0, ''))->>'id';
  perform pg_temp.yo(2);
  perform cs_sell(array[a1]);
  s1 := pg_temp.sal(1); s2 := pg_temp.sal(2);
  if not pg_temp.falla(format('select mk_trato_aceptar(%s)', tid)) then raise exception 'FALLO: se ha aceptado un trato cuya pieza pedida ya no esta'; end if;
  if pg_temp.st(b1) <> 'trd' or pg_temp.dueno(b1) <> jug[1] or pg_temp.sal(1) <> s1 or pg_temp.sal(2) <> s2 then raise exception 'FALLO: un trato fallido ha cambiado algo'; end if;
  perform pg_temp.yo(1); perform mk_trato_cancelar(tid);
  tid := (mk_trato_crear(jug[2], '{}', 0, '{}', 10000000, ''))->>'id';
  perform pg_temp.yo(2);
  insert into ledger(player, amount, kind, note) values (jug[2], -(pg_temp.sal(2) - 5), 'ajuste', 'dejar a 5');
  if not pg_temp.falla(format('select mk_trato_aceptar(%s)', tid)) then raise exception 'FALLO: se ha aceptado un trato sin saldo'; end if;
  if pg_temp.sal(2) <> 5 then raise exception 'FALLO: un trato sin saldo ha movido dinero'; end if;
  insert into ledger(player, amount, kind, note) values (jug[2], 50000000, 'ajuste', 'devolver');
  perform pg_temp.yo(1); perform mk_trato_cancelar(tid);
  -- un trato vacio, uno consigo mismo, con piezas ajenas o repetidas
  if not pg_temp.falla(format('select mk_trato_crear(%L, ''{}'', 0, ''{}'', 0, '''')', jug[2])) then raise exception 'FALLO: un trato vacio se ha podido crear'; end if;
  if not pg_temp.falla(format('select mk_trato_crear(%L, ''{}'', 10, ''{}'', 0, '''')', jug[1])) then raise exception 'FALLO: un trato con uno mismo se ha podido crear'; end if;
  if not pg_temp.falla(format('select mk_trato_crear(%L, array[%s], 0, ''{}'', 0, '''')', jug[2], b2)) then raise exception 'FALLO: ofrecer una pieza ajena'; end if;
  if not pg_temp.falla(format('select mk_trato_crear(%L, array[%s,%s], 0, ''{}'', 0, '''')', jug[2], b1, b1)) then raise exception 'FALLO: ofrecer la misma pieza dos veces'; end if;
  if not pg_temp.falla(format('select mk_trato_crear(%L, ''{}'', 0, array[%s], 0, '''')', jug[2], a2 + 99999)) then raise exception 'FALLO: pedir una pieza que no existe'; end if;
  if not pg_temp.falla(format('select mk_trato_crear(%L, ''{}'', 999999999, ''{}'', 0, '''')', jug[2])) then raise exception 'FALLO: ofrecer mas V-Bucks de los que se tienen'; end if;
  resumen := resumen || 'Trato cancelado, rechazado o roto: todo vuelve y nada cambia de dueno. ';

  -- 5. mercado pequeno
  perform pg_temp.yo(1);
  s1 := pg_temp.sal(1); s2 := pg_temp.sal(2);
  a1 := pg_temp.da(1, 'cos-obj-boombox');
  vid := (mk_vender(a1, 700)->>'id')::bigint;
  if pg_temp.st(a1) <> 'mkt' then raise exception 'FALLO: una pieza en venta tiene que quedar en deposito'; end if;
  if not pg_temp.falla(format('select cs_sell(array[%s])', a1)) then raise exception 'FALLO: una pieza en venta se ha podido vender a la banca'; end if;
  if not pg_temp.falla(format('select mk_vender(%s, 10)', a1)) then raise exception 'FALLO: una pieza en venta se ha podido poner a la venta otra vez'; end if;
  if not pg_temp.falla(format('select mk_comprar(%s)', vid)) then raise exception 'FALLO: he podido comprar mi propia venta'; end if;
  if not pg_temp.falla(format('select mk_vender(%s, 0)', pg_temp.da(1, 'cos-obj-red-bull'))) then raise exception 'FALLO: precio 0'; end if;
  perform pg_temp.yo(2);
  if not pg_temp.falla(format('select mk_retirar(%s)', vid)) then raise exception 'FALLO: otro ha podido retirar mi venta'; end if;
  if not pg_temp.falla(format('select mk_vender(%s, 10)', a1)) then raise exception 'FALLO: vender lo de otro'; end if;
  r := mk_comprar(vid);
  if pg_temp.dueno(a1) <> jug[2] or pg_temp.st(a1) <> 'own' or pg_temp.sal(2) <> s2 - 700 or pg_temp.sal(1) <> s1 + 700 then raise exception 'FALLO: comprar no ha movido la pieza y los 700 V-Bucks'; end if;
  if not pg_temp.falla(format('select mk_comprar(%s)', vid)) then raise exception 'FALLO: se ha podido comprar dos veces'; end if;
  perform pg_temp.yo(1);
  if not pg_temp.falla(format('select mk_retirar(%s)', vid)) then raise exception 'FALLO: se ha podido retirar una venta ya vendida'; end if;
  -- sin saldo no se compra
  perform pg_temp.yo(2);
  vid := (mk_vender(a1, 900000)->>'id')::bigint;
  perform pg_temp.yo(1);
  insert into ledger(player, amount, kind, note) values (jug[1], -(pg_temp.sal(1) - 100), 'ajuste', 'dejar a 100');
  if not pg_temp.falla(format('select mk_comprar(%s)', vid)) then raise exception 'FALLO: se ha comprado sin saldo'; end if;
  if pg_temp.st(a1) <> 'mkt' or pg_temp.sal(1) <> 100 then raise exception 'FALLO: una compra sin saldo ha movido algo'; end if;
  insert into ledger(player, amount, kind, note) values (jug[1], 50000000, 'ajuste', 'devolver');
  perform pg_temp.yo(2); perform mk_retirar(vid);
  if pg_temp.st(a1) <> 'own' then raise exception 'FALLO: retirar no ha devuelto la pieza'; end if;
  resumen := resumen || 'Mercado: comprar, retirar y no comprar dos veces. ';

  -- 6. contratos
  perform pg_temp.yo(1);
  ids := array(select pg_temp.da(1, 'cos-obj-gorra-beisbol') from generate_series(1, 10));
  s1 := pg_temp.sal(1);
  if not pg_temp.falla(format('select mk_contrato(%L)', (ids[1:9])::text)) then raise exception 'FALLO: un contrato de 9'; end if;
  if not pg_temp.falla(format('select mk_contrato(%L)', (ids[1:9] || pg_temp.da(1, 'cos-obj-dados-casino') || pg_temp.da(1, 'cos-fondo-aurora'))::text)) then raise exception 'FALLO: un contrato de 11 / mezclando rarezas'; end if;
  if not pg_temp.falla(format('select mk_contrato(%L)', (ids[1:9] || pg_temp.da(1, 'cos-obj-fichas-poker'))::text)) then raise exception 'FALLO: un contrato con una pieza de otra rareza'; end if;
  if not pg_temp.falla(format('select mk_contrato(%L)', (ids[1:9] || pg_temp.da(2, 'cos-obj-gorra-beisbol'))::text)) then raise exception 'FALLO: un contrato con una pieza que no es mia'; end if;
  if not pg_temp.falla(format('select mk_contrato(%L)', (ids[1:5] || pg_temp.da(1, (select id from cs_items where rarity = 'mil' and id like 'skin-%' limit 1)) || ids[7:10])::text)) then raise exception 'FALLO: un contrato mezclando skins y cosmeticos'; end if;
  if (select count(*) from cs_inv where id = any(ids) and status = 'own') <> 10 then raise exception 'FALLO: un contrato fallido ha gastado piezas'; end if;
  if not pg_temp.falla(format('select mk_contrato(%L)', (ids[1:9] || ids[1])::text)) then raise exception 'FALLO: un contrato con una pieza repetida'; end if;
  if (select count(*) from cs_inv where id = any(ids) and status = 'own') <> 10 then raise exception 'FALLO: un contrato con repetidas ha gastado piezas'; end if;
  r := mk_contrato(ids);
  if (r->'salida'->>'rarity') <> 'res' or (select count(*) from cs_inv where id = any(ids) and status = 'con') <> 10 or pg_temp.sal(1) <> s1 then raise exception 'FALLO: el contrato tiene que gastar las 10 y dar 1 restringido sin tocar el saldo'; end if;
  if (r->'salida'->>'item') !~ '^cos-' or pg_temp.dueno((r->'salida'->>'id')::bigint) <> jug[1] then raise exception 'FALLO: el contrato ha dado algo que no es un cosmetico o que no es mio'; end if;
  if not pg_temp.falla(format('select mk_contrato(%L)', ids::text)) then raise exception 'FALLO: se ha podido repetir el contrato con piezas ya gastadas'; end if;
  resumen := resumen || format('Contrato: 10 gorras dieron %s (%s). ', r->'salida'->>'name', r->'salida'->>'value');
  -- lo que viene de una caja de skins con desgaste: 10 clasificadas dan 1 encubierta de la misma caja y del mismo desgaste
  perform pg_temp.yo(2);
  select t.id into it from cs_items t join cs_case_items ci on ci.item_id = t.id where t.rarity = 'cla' and t.id like 'skin-%' and t.minf is not null order by t.id limit 1;
  ids := array(select pg_temp.da(2, it) from generate_series(1, 10));
  update cs_inv set wear = 4, fl = 0.9 where id = any(ids);
  r := mk_contrato(ids);
  if (r->'salida'->>'rarity') <> 'cov' then raise exception 'FALLO: 10 clasificadas dan %', r->'salida'->>'rarity'; end if;
  if not exists (select 1 from cs_case_items a join cs_case_items b on a.case_id = b.case_id where a.item_id = it and b.item_id = r->'salida'->>'item') then raise exception 'FALLO: el contrato ha dado una pieza que no sale de las cajas de las que entraron'; end if;
  resumen := resumen || format('Con skins: 10 %s dieron %s. ', (select name from cs_items where id = it), r->'salida'->>'name');
  -- lo especial no se puede meter
  esp_ids := array(select pg_temp.da(2, (select id from cs_items where rarity = 'esp' and id like 'skin-%' limit 1)) from generate_series(1, 10));
  if not pg_temp.falla(format('select mk_contrato(%L)', esp_ids::text)) then raise exception 'FALLO: un contrato con piezas especiales'; end if;
  -- 400 contratos: siempre sale una de la rareza siguiente, de las mismas cajas, y nada se gasta de mas
  cnt := array[0, 0, 0, 0];
  for k in 1..400 loop
    it := (array['cos-obj-gorra-beisbol', 'cos-marco-aro-blanco', 'cos-fondo-medianoche', 'cos-obj-cubo-rubik'])[1 + (k % 4)];
    perform pg_temp.yo(3);
    ids := array(select pg_temp.da(3, it) from generate_series(1, 10));
    r := mk_contrato(ids);
    x := r->'salida';
    if (x->>'rarity') <> 'res' or (x->>'item') !~ '^cos-' then raise exception 'FALLO: el contrato % ha dado %', k, x->>'name'; end if;
    if not exists (select 1 from cs_case_items a join cs_case_items b on a.case_id = b.case_id where a.item_id = it and b.item_id = x->>'item') then raise exception 'FALLO: el contrato % ha dado algo de otra caja (% de %)', k, x->>'name', it; end if;
    if (x->>'value')::int <> (select t.price[1] from cs_items t where t.id = x->>'item') then raise exception 'FALLO: el valor de la salida no es el precio'; end if;
    cnt[1 + (k % 4)] := cnt[1 + (k % 4)] + 1;
  end loop;
  resumen := resumen || '400 contratos: siempre la rareza siguiente y de las mismas cajas. ';

  -- 7. jackpot
  perform pg_temp.yo(1);
  s1 := pg_temp.sal(1);
  if not pg_temp.falla('select mk_jackpot_entrar(5, ''{}'')') then raise exception 'FALLO: se ha entrado con menos de 10 de valor'; end if;
  r := mk_jackpot_entrar(500, '{}');
  if pg_temp.sal(1) <> s1 - 500 or r->'jackpot'->'closes_at' <> 'null'::jsonb then raise exception 'FALLO: un jugador solo no abre la cuenta atras, y entrar cobra'; end if;
  perform mk_jackpot_salir();
  if pg_temp.sal(1) <> s1 or (select count(*) from mk_jackpot where status = 'abierto') <> 0 then raise exception 'FALLO: salir tiene que devolverlo todo y cancelar la ronda'; end if;
  a1 := pg_temp.da(1, 'cos-obj-monster-white');
  t0 := (select coalesce(sum(amount), 0) from ledger);
  r := mk_jackpot_entrar(500, array[a1]);
  if pg_temp.st(a1) <> 'jkp' or pg_temp.sal(1) <> s1 - 500 or (r->>'valor')::int <> 500 + 120 then raise exception 'FALLO: entrar con pieza (valor %)', r->>'valor'; end if;
  if not pg_temp.falla(format('select cs_sell(array[%s])', a1)) then raise exception 'FALLO: una pieza en el jackpot se ha podido vender'; end if;
  if not pg_temp.falla(format('select mk_jackpot_entrar(0, array[%s])', a1)) then raise exception 'FALLO: la misma pieza dos veces en el jackpot'; end if;
  perform pg_temp.yo(2);
  r := mk_jackpot_entrar(1000, '{}');
  s1 := pg_temp.sal(1); s2 := pg_temp.sal(2);
  j := (select m from mk_jackpot m where status = 'abierto');
  if j.closes_at is null or j.closes_at < now() + interval '55 seconds' or j.closes_at > now() + interval '65 seconds' or j.total <> 1620 then raise exception 'FALLO: con la segunda persona empiezan 60 s (cierra %, total %)', j.closes_at, j.total; end if;
  perform mk_jackpot_cerrar();
  if (select status from mk_jackpot where id = j.id) <> 'abierto' then raise exception 'FALLO: la ronda se ha cerrado antes de tiempo'; end if;
  if not pg_temp.falla(format('select mk_jackpot_salir()')) then raise exception 'FALLO: se ha podido salir con otra persona dentro'; end if;
  -- al pasar la hora: gana uno, todo lo metido va a el, y nada se crea ni se destruye
  update mk_jackpot set closes_at = now() - interval '1 second' where id = j.id;
  r := mk_jackpot_entrar(100, '{}');
  if not (r->>'cerrada')::boolean then raise exception 'FALLO: entrar con la ronda caducada tiene que decir que se ha cerrado'; end if;
  select * into j from mk_jackpot where id = j.id;
  if j.status <> 'hecho' or j.winner is null or j.pos is null or j.pos < 0 or j.pos >= 1 or j.total <> 1620 then raise exception 'FALLO: la ronda no se ha repartido bien (%, %, %)', j.status, j.winner, j.pos; end if;
  if pg_temp.dueno(a1) <> j.winner or pg_temp.st(a1) <> 'own' then raise exception 'FALLO: la pieza del jackpot no ha ido al ganador'; end if;
  if (select coalesce(sum(amount), 0) from ledger) <> t0 then raise exception 'FALLO: el jackpot ha creado o destruido V-Bucks'; end if;
  if pg_temp.sal(1) - s1 <> (case when j.winner = jug[1] then 1500 else 0 end) or pg_temp.sal(2) - s2 <> (case when j.winner = jug[2] then 1500 else 0 end) then
    raise exception 'FALLO: el ganador del jackpot no se ha llevado los 1.500 (o el otro ha cambiado de saldo)';
  end if;
  if (select count(*) from mk_jackpot where status = 'abierto') <> 0 then raise exception 'FALLO: no tiene que quedar ronda abierta (el intento tardio no cobra)'; end if;
  resumen := resumen || format('Jackpot: ganó %s con el boleto en %s. ', pname(j.winner), j.pos);
  -- una ronda de un solo jugador que lleva un dia se cancela y se devuelve
  perform pg_temp.yo(1);
  s1 := pg_temp.sal(1);
  perform mk_jackpot_entrar(300, '{}');
  update mk_jackpot set created_at = now() - interval '25 hours' where status = 'abierto';
  perform mk_estado();
  if pg_temp.sal(1) <> s1 or (select count(*) from mk_jackpot where status = 'abierto') <> 0 then raise exception 'FALLO: una ronda de un dia con un solo jugador se tiene que cancelar y devolver'; end if;
  -- 3.000 rondas, uno mete 100 y otro 300: el segundo tiene que ganar el 75 % de las veces
  for k in 1..3000 loop
    perform pg_temp.yo(1); perform mk_jackpot_entrar(100, '{}');
    perform pg_temp.yo(2); perform mk_jackpot_entrar(300, '{}');
    update mk_jackpot set closes_at = now() - interval '1 second' where status = 'abierto';
    perform mk_jackpot_cerrar();
    select * into j from mk_jackpot where status = 'hecho' order by id desc limit 1;
    if j.winner = jug[1] then gana1 := gana1 + 1; elsif j.winner = jug[2] then gana2 := gana2 + 1; else raise exception 'FALLO: ha ganado alguien que no estaba'; end if;
  end loop;
  if gana2 < 2250 - 120 or gana2 > 2250 + 120 then raise exception 'FALLO: 3.000 rondas 100 contra 300: el segundo ha ganado % (se esperan 2250 +-120)', gana2; end if;
  resumen := resumen || format('3.000 rondas 100 contra 300: %s contra %s (se esperan 750 y 2250). ', gana1, gana2);
  -- tres jugadores, todas las piezas y V-Bucks juntos: el que gana se lleva todo
  perform pg_temp.yo(1); a1 := pg_temp.da(1, 'cos-obj-boombox'); perform mk_jackpot_entrar(0, array[a1]);
  perform pg_temp.yo(2); b1 := pg_temp.da(2, 'cos-obj-auriculares-beats'); perform mk_jackpot_entrar(200, array[b1]);
  perform pg_temp.yo(3); perform mk_jackpot_entrar(1000, '{}');
  update mk_jackpot set closes_at = now() - interval '1 second' where status = 'abierto';
  r := mk_jackpot_cerrar();
  if r->'ultimo'->>'winner' is null or pg_temp.dueno(a1) <> (r->'ultimo'->>'winner')::uuid or pg_temp.dueno(b1) <> (r->'ultimo'->>'winner')::uuid then raise exception 'FALLO: el ganador de tres no se ha llevado las dos piezas'; end if;
  if jsonb_array_length(r->'ultimo'->'players') <> 3 then raise exception 'FALLO: el jackpot de tres tiene que contar tres jugadores'; end if;
  -- la rueda de la app se dibuja con los jugadores en el orden de mk_jackpot_j y el boleto cae en el trozo del ganador (pos de 0 a 1 desde arriba)
  declare
    ac numeric := 0; lo numeric; hi numeric; pj jsonb; tot numeric := (r->'ultimo'->>'total')::numeric; pos numeric := (r->'ultimo'->>'pos')::numeric;
  begin
    for pj in select * from jsonb_array_elements(r->'ultimo'->'players') loop
      lo := ac; hi := ac + (pj->>'valor')::numeric; ac := hi;
      if pos * tot >= lo - 0.001 and pos * tot < hi + 0.001 then
        if (pj->>'player') <> (r->'ultimo'->>'winner') then raise exception 'FALLO: el boleto (%) cae en el trozo de otro, no en el del ganador', pos; end if;
        exit;
      end if;
    end loop;
  end;

  -- 8. permisos: las funciones de dentro no las llama nadie de fuera y las tablas solo se leen
  begin
    set local role authenticated;
    perform mk_saldo(jug[1]);
    reset role;
    raise exception 'FALLO: un jugador ha podido llamar a mk_saldo';
  exception when insufficient_privilege then reset role; end;
  begin
    set local role authenticated;
    perform mk_suelta(array[1::bigint], jug[1], 'own');
    reset role;
    raise exception 'FALLO: un jugador ha podido llamar a mk_suelta';
  exception when insufficient_privilege then reset role; end;
  begin
    set local role anon;
    perform mk_estado();
    reset role;
    raise exception 'FALLO: un visitante ha podido llamar a mk_estado';
  exception when insufficient_privilege then reset role; end;
  begin
    set local role authenticated;
    insert into ledger(player, amount, kind, note) values (jug[1], 999999, 'ajuste', 'trampa');
    reset role;
    raise exception 'FALLO: un jugador ha podido escribir en ledger';
  exception when insufficient_privilege then reset role; end;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', jsonb_build_object('sub', jug[1], 'role', 'authenticated')::text, true);
    update cs_inv set status = 'own', player = jug[1] where id = b1;
    get diagnostics n = row_count;
    reset role;
    if n > 0 then raise exception 'FALLO: un jugador ha podido cambiar una pieza a mano'; end if;
  exception when insufficient_privilege then reset role; end;
  perform pg_temp.yo(3);
  set local role authenticated;
  select count(*) into n from mk_tratos;       -- los tratos de otros no se ven
  reset role;
  if n <> 0 then raise exception 'FALLO: un jugador ve % tratos que no son suyos', n; end if;
  resumen := resumen || 'Permisos: nada de fuera llama a lo de dentro ni escribe en las tablas. ';

  raise exception 'PRUEBA SUPERADA (no se ha guardado nada). %', resumen;
end $$;
