-- Prueba de db/081_giro_tipos.sql (Ticket Dorado y Ticket de Diamante), para el editor SQL de Supabase. Va DESPUES de 081.
-- Comprueba:
--   1. cs_ev: en lo de lujo es su precio; en tres skins de CS2 coincide con la media de 3.000 tiradas de cs_roll_pieza (dentro de 4 sigmas).
--   2. En TODAS las cajas activas: los montones no estan vacios, malo vale menos que la caja, medio entre 1 y 3 veces, bueno al menos 1,5
--      (salvo el objeto de reserva), "sube" entre 0 y 50 %, el diamante entre 0 y 1 % y, lo mas importante, lo que devuelve la caja con
--      los tickets no pasa de lo que devuelve sin ellos + giro_extra_pts (0,75 puntos).
--   3. Con el Dorado al 100 % (solo dentro de la prueba): abrir de 1 y de 5 en 5 cobra una vez, cada pieza lleva su ticket "oro", sale de
--      su monton y de su caja, con su precio, desgaste, float y StatTrak bien; lo que manda cs_open es lo guardado. El lado sale con la
--      "sube" de la caja (dentro de 4 sigmas).
--   4. Con el Diamante al 100 %: todo sale del monton bueno.
--   5. Una caja tuya (sin cobrar) y una batalla 1v1 de 3 rondas con tickets: los totales son la suma de lo que se queda y cs_battle
--      manda el ticket de cada pieza.
--   6. Con los ajustes de verdad: 12.000 tiradas de una caja dan Dorado en torno al 4 % y Diamante en torno a su probabilidad.
--   7. cs_giro_info contesta a un jugador.
-- Lanza un error A PROPOSITO para que se deshaga todo. Si todo va bien dice "PRUEBA SUPERADA" con el resumen; si no, "FALLO".

create or replace function pg_temp.yo(u uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  perform set_config('request.jwt.claims', json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
end $f$;

-- una pieza con ticket bien hecha; devuelve el lado (o null si no lleva ticket)
create or replace function pg_temp.mira(x jsonb, p_tipo text) returns text language plpgsql as $f$
declare bo jsonb := x->'bonus'; caja text := x->>'case'; it cs_items; lado text;
begin
  if bo is null or jsonb_typeof(bo) = 'null' then return null; end if;
  if bo ? 'orig' then raise exception 'FALLO: sale un giro viejo de 075 (%)', bo; end if;
  if bo->>'tipo' is distinct from p_tipo then raise exception 'FALLO: ticket % y se esperaba %', bo->>'tipo', p_tipo; end if;
  lado := bo->>'lado';
  if (p_tipo = 'oro' and lado not in ('malo', 'medio')) or (p_tipo = 'diamante' and lado <> 'bueno') then raise exception 'FALLO: ticket % con lado %', p_tipo, lado; end if;
  if not exists (select 1 from cs_giro_montones(caja) m where m.monton = lado and m.item = x->>'item') then
    raise exception 'FALLO: % no es del monton % de la caja %', x->>'item', lado, caja;
  end if;
  if not exists (select 1 from cs_case_items where case_id = caja and item_id = x->>'item') then raise exception 'FALLO: lo que sale no es de la caja %', caja; end if;
  select * into it from cs_items where id = x->>'item';
  if (x->>'value')::int <> greatest(1, coalesce(it.price[1 + case when (x->>'st')::boolean then 5 else 0 end + coalesce((x->>'wear')::int, 0)], 1)) then raise exception 'FALLO: % con un valor que no es su precio', it.name; end if;
  if (x->>'st')::boolean and not it.st then raise exception 'FALLO: % sale StatTrak y no lo admite', it.name; end if;
  if it.minf is null and x->>'wear' is not null then raise exception 'FALLO: % sin desgaste sale con desgaste', it.name; end if;
  if (x->>'wear') is not null and ((x->>'float')::numeric < it.minf or (x->>'float')::numeric > it.maxf
     or (x->>'wear')::int <> case when (x->>'float')::numeric < 0.07 then 0 when (x->>'float')::numeric < 0.15 then 1 when (x->>'float')::numeric < 0.38 then 2 when (x->>'float')::numeric < 0.45 then 3 else 4 end) then
    raise exception 'FALLO: % con un float (%) que no cuadra', it.name, x->>'float';
  end if;
  return lado;
end $f$;

do $$
declare
  jug uuid[] := array(select id from players order by created_at, username);
  guarda jsonb := (select jsonb_object_agg(key, value) from settings where key like 'giro\_%');
  c text; r jsonb; x jsonb; s0 int; k int; n int; a record; m record; resumen text := ''; pago text := ''; lado text;
  cajas text[]; cs2 text; it record; suma numeric; suma2 numeric; media numeric; sd numeric; ev numeric; nsim int := 3000; p record;
  peor numeric := -1e9; peor_c text; ntot int := 0; medios int; tiradas int; oros int; dias int; esperado numeric; oid bigint; bid bigint; b cs_battles; te int; t int;
  g record; con int; precio int;
begin
  if cardinality(jug) < 2 then raise exception 'FALLO: hacen falta al menos dos jugadores'; end if;
  if (select count(*) from settings where key in ('giro_dorado_pct', 'giro_diamante_max', 'giro_extra_pts', 'giro_diamante_parte', 'giro_dorado_sube_max', 'giro_medio_tope', 'giro_bueno_desde')) <> 7 then
    raise exception 'FALLO: faltan ajustes del giro (carga 081)';
  end if;
  insert into ledger(player, amount, kind, note) select id, 500000000, 'ajuste', 'saldo de prueba 081' from players;

  -- 1. cs_ev
  for it in select t.id, t.name, t.price from cs_items t join cs_case_items ci on ci.item_id = t.id join cs_cases cc on cc.id = ci.case_id
            where cc.active and cc.cat = 'lujo' and not t.st limit 30 loop
    if abs(cs_ev(it.id) - greatest(1, coalesce(it.price[1], 1))) > 0.0001 then raise exception 'FALLO: cs_ev de % (%) no es su precio (%)', it.name, cs_ev(it.id), it.price[1]; end if;
  end loop;
  -- tres skins distintas: la de grado militar, la clasificada y el cuchillo de menor id de las cajas de CS2
  for it in select distinct on (t.rarity) t.id, t.name from cs_items t
            where t.rarity in ('mil', 'cla', 'esp') and t.minf is not null and t.st
              and exists (select 1 from cs_case_items ci join cs_cases cc on cc.id = ci.case_id where ci.item_id = t.id and cc.active and cc.cat = 'skins')
            order by t.rarity, t.id loop
    suma := 0; suma2 := 0;
    for k in 1..nsim loop select * into p from cs_roll_pieza(it.id); suma := suma + p.o_value; suma2 := suma2 + p.o_value::numeric * p.o_value; end loop;
    media := suma / nsim; sd := sqrt(greatest(0, suma2 / nsim - media * media) / nsim); ev := cs_ev(it.id);
    if abs(media - ev) > 4 * sd + 0.5 then raise exception 'FALLO: cs_ev de % es % y la media de % tiradas da % (+- %)', it.name, round(ev, 2), nsim, round(media, 2), round(sd, 2); end if;
    resumen := resumen || format('cs_ev %s: %s (tiradas %s). ', it.name, round(ev, 1), round(media, 1));
  end loop;

  -- 2. todas las cajas activas: montones, probabilidades y presupuesto
  for c, precio in select id, price from cs_cases where active order by id loop
    select * into a from cs_giro_ajuste(c);
    for lado in select unnest(array['malo', 'medio', 'bueno']) loop
      if not exists (select 1 from cs_giro_montones(c) mm where mm.monton = lado) then raise exception 'FALLO: la caja % no tiene monton %', c, lado; end if;
    end loop;
    select count(*) filter (where mm.monton = 'malo' and mm.ev >= precio) as malo_mal, count(*) filter (where mm.monton = 'malo') as malo_n,
           count(*) filter (where mm.monton = 'medio' and (mm.ev < precio or mm.ev > 3 * precio)) as medio_mal, count(*) filter (where mm.monton = 'medio') as medio_n,
           count(*) filter (where mm.monton = 'bueno' and mm.ev < 1.5 * precio) as bueno_mal, count(*) filter (where mm.monton = 'bueno') as bueno_n
      into m from cs_giro_montones(c) mm;
    -- solo el objeto de reserva (uno, y solo) puede estar fuera de su rango
    if (m.malo_mal > 0 and m.malo_n > 1) or (m.medio_mal > 0 and m.medio_n > 1) or (m.bueno_mal > 0 and m.bueno_n > 1) then raise exception 'FALLO: la caja % tiene un monton con objetos que no tocan', c; end if;
    if a.sube < 0 or a.sube > 0.5 + 1e-9 then raise exception 'FALLO: sube de % fuera de 0..50 %%: %', c, a.sube; end if;
    if a.p_dia < 0 or a.p_dia > 0.01 + 1e-12 then raise exception 'FALLO: diamante de % fuera de 0..1 %%: %', c, a.p_dia; end if;
    if a.p_oro <> 0.04 then raise exception 'FALLO: el dorado de % no es el 4 %%', c; end if;
    if a.nuevo > a.base + precio * 0.0075 + 1e-6 then raise exception 'FALLO: la caja % devuelve % con tickets y % sin ellos: pasa de 0,75 puntos', c, round(100 * a.nuevo / precio, 3), round(100 * a.base / precio, 3); end if;
    if a.nuevo - a.base > peor then peor := a.nuevo - a.base; peor_c := c; end if;
    ntot := ntot + 1;
    if c in ('lujo-cartas', 'lujo-relojes', 'lujo-gaming', 'crate-4904') or (c = (select id from cs_cases where active and cat = 'skins' order by price, id limit 1)) then
      pago := pago || format('%s: %s %% sin tickets, %s %% con ellos (dorado 4 %%, sube %s %%, diamante %s %%); ', (select name from cs_cases where id = c),
        round(100 * a.base / precio, 1), round(100 * a.nuevo / precio, 1), round(100 * a.sube, 1), round(100 * a.p_dia, 3));
    end if;
  end loop;
  resumen := resumen || format('%s cajas: montones bien y ninguna sube mas de 0,75 puntos con los tickets. ', ntot);

  select id into cs2 from cs_cases where active and cat = 'skins' order by price, id limit 1;
  cajas := array(select id from cs_cases where active and cat = 'lujo' and id in ('lujo-gaming', 'lujo-cartas', 'lujo-relojes') order by id);
  if cs2 is not null then cajas := cajas || cs2; end if;
  if cardinality(cajas) < 2 then cajas := array(select id from cs_cases where active order by sort limit 3); end if;

  -- 3. el Dorado al 100 %
  update settings set value = '100' where key = 'giro_dorado_pct';
  update settings set value = '0' where key = 'giro_diamante_max';
  perform pg_temp.yo(jug[1]);
  con := 0;
  foreach c in array cajas loop
    for k in 1..10 loop
      s0 := (select coalesce(sum(amount), 0) from ledger where player = jug[1]);
      r := cs_open(c, case when k = 1 then 1 else 5 end);
      if (select coalesce(sum(amount), 0) from ledger where player = jug[1]) <> s0 - (case when k = 1 then 1 else 5 end) * (select price from cs_cases where id = c) then raise exception 'FALLO: abrir % con tickets no ha cobrado una sola vez su precio', c; end if;
      for x in select * from jsonb_array_elements(r->'items') loop
        if pg_temp.mira(x, 'oro') is null then raise exception 'FALLO: con el dorado al 100 %% sale una pieza sin ticket'; end if;
        con := con + 1;
        if (select value from cs_inv where id = (x->>'id')::bigint) <> (x->>'value')::int or (select item_id from cs_inv where id = (x->>'id')::bigint) <> x->>'item'
           or (select bonus from cs_inv where id = (x->>'id')::bigint) is distinct from x->'bonus' then raise exception 'FALLO: cs_open manda algo distinto de lo guardado'; end if;
      end loop;
    end loop;
  end loop;
  resumen := resumen || format('Dorado al 100 %%: %s piezas de %s cajas (de 1 y de 5, cobran una vez), todas con su ticket bien. ', con, cardinality(cajas));
  -- el lado del dorado sale con la "sube" de la caja
  c := cajas[1]; select * into a from cs_giro_ajuste(c); medios := 0; tiradas := 2000;
  for k in 1..tiradas loop
    select * into g from cs_tirada(c);
    if g.o_bonus->>'lado' = 'medio' then medios := medios + 1; end if;
  end loop;
  sd := sqrt(tiradas * a.sube * (1 - a.sube));
  if abs(medios - tiradas * a.sube) > 4 * sd + 2 then raise exception 'FALLO: en % sale lo medio % de % veces y la sube es % %%', c, medios, tiradas, round(100 * a.sube, 1); end if;
  resumen := resumen || format('Lado del dorado en %s: %s de %s medio (sube %s %%). ', (select name from cs_cases where id = c), medios, tiradas, round(100 * a.sube, 1));

  -- 4. el Diamante al 100 % (el presupuesto muy alto para que su probabilidad llegue al 100 %)
  update settings set value = '0' where key = 'giro_dorado_pct';
  update settings set value = '100' where key = 'giro_diamante_max';
  update settings set value = '100000' where key = 'giro_extra_pts';
  update settings set value = '100' where key = 'giro_diamante_parte';
  con := 0;
  foreach c in array cajas loop
    r := cs_open(c, 5);
    for x in select * from jsonb_array_elements(r->'items') loop
      if pg_temp.mira(x, 'diamante') is null then raise exception 'FALLO: con el diamante al 100 %% sale una pieza sin ticket en %', c; end if;
      con := con + 1;
    end loop;
  end loop;
  resumen := resumen || format('Diamante al 100 %%: %s piezas, todas del monton bueno. ', con);

  -- 5. una caja tuya y una batalla, con el dorado al 100 %
  update settings set value = '100' where key = 'giro_dorado_pct';
  update settings set value = '0' where key = 'giro_diamante_max';
  update settings set value = guarda->'giro_extra_pts' where key = 'giro_extra_pts';
  update settings set value = guarda->'giro_diamante_parte' where key = 'giro_diamante_parte';
  insert into cs_owned(player, case_id, source) values (jug[1], cajas[1], 'prueba') returning id into oid;
  s0 := (select coalesce(sum(amount), 0) from ledger where player = jug[1]);
  r := cs_open_owned(oid);
  if (select coalesce(sum(amount), 0) from ledger where player = jug[1]) <> s0 then raise exception 'FALLO: abrir una caja tuya ha movido dinero'; end if;
  if pg_temp.mira(r->'items'->0, 'oro') is null then raise exception 'FALLO: la caja tuya no lleva ticket'; end if;
  perform pg_temp.yo(jug[1]); r := cs_battle_create('1v1', array[cajas[1], cajas[2], cajas[1]], 'normal'); bid := (r->>'id')::bigint;
  perform pg_temp.yo(jug[2]); perform cs_battle_join(bid, null);
  select * into b from cs_battles where id = bid;
  if b.status <> 'done' then raise exception 'FALLO: la batalla de prueba no ha terminado'; end if;
  te := cs_tam_equipo(b.mode);
  for t in 0..cs_equipos(b.mode) - 1 loop
    select coalesce(sum(i.value), 0) into s0 from cs_battle_drops d2 join cs_inv i on i.id = d2.inv_id where d2.battle_id = bid and d2.seat / te = t;
    if s0 <> b.totals[t + 1] then raise exception 'FALLO: en la batalla el total % no es la suma de lo que se queda', t; end if;
  end loop;
  r := cs_battle(bid); n := 0;
  for x in select e->'inv' from jsonb_array_elements(r->'drops') e loop
    if pg_temp.mira(x, 'oro') is not null then n := n + 1; end if;
  end loop;
  if n <> 6 then raise exception 'FALLO: con el dorado al 100 %% la batalla tiene % de 6 piezas con ticket', n; end if;
  resumen := resumen || format('Caja tuya sin cobrar y batalla 1v1 de 3 rondas: 6 de 6 con ticket, totales %s. ', array_to_string(b.totals, '/'));

  -- 6. con los ajustes de verdad
  update settings set value = guarda->'giro_dorado_pct' where key = 'giro_dorado_pct';
  update settings set value = guarda->'giro_diamante_max' where key = 'giro_diamante_max';
  -- la caja de lujo con mas diamante, para que se vea alguno
  select z.id, z.pd into c, esperado from (select cc.id, (cs_giro_ajuste(cc.id)).p_dia as pd from cs_cases cc where cc.active and cc.id = any(cajas)) z order by z.pd desc limit 1;
  oros := 0; dias := 0; tiradas := 12000;
  for k in 1..tiradas loop
    select * into g from cs_tirada(c);
    if g.o_bonus->>'tipo' = 'oro' then oros := oros + 1; elsif g.o_bonus->>'tipo' = 'diamante' then dias := dias + 1; end if;
  end loop;
  if abs(oros - tiradas * 0.04) > 4 * sqrt(tiradas * 0.04 * 0.96) then raise exception 'FALLO: dorado % de % (se esperaba el 4 %%)', oros, tiradas; end if;
  if abs(dias - tiradas * esperado) > 4 * sqrt(tiradas * esperado * (1 - esperado)) + 2 then raise exception 'FALLO: diamante % de % (se esperaba el % %%)', dias, tiradas, round(100 * esperado, 3); end if;
  resumen := resumen || format('Con los ajustes de verdad en %s: %s dorados (%s %%) y %s diamantes (%s %%, se esperaba %s %%) en %s tiradas. ',
    (select name from cs_cases where id = c), oros, round(100.0 * oros / tiradas, 2), dias, round(100.0 * dias / tiradas, 3), round(100 * esperado, 3), tiradas);

  -- 7. la app
  perform pg_temp.yo(jug[2]);
  r := cs_giro_info(cajas[1]);
  if (r->>'oro')::numeric <> 4 or (r->>'diamante')::numeric < 0 or (r->>'diamante')::numeric > 1 then raise exception 'FALLO: cs_giro_info dice %', r; end if;

  raise exception 'PRUEBA SUPERADA (no se ha guardado nada). %Lo que mas sube una caja: % puntos (%). Lo que devuelve cada caja: %', resumen,
    round(100 * peor / (select price from cs_cases where id = peor_c), 3), (select name from cs_cases where id = peor_c), pago;
end $$;
