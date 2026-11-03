-- Prueba de db/075_giro_bonus.sql (Giro Dorado), para el editor SQL de Supabase. Va DESPUES de 072 y 075.
-- Comprueba, con el giro al 100 % (settings giro_dorado_pct, solo dentro de la prueba): abrir cajas de lujo y de CS2 (1 y 5 a la vez),
-- una caja tuya sin pagar y una batalla. En cada giro: ARRIBA vale mas que lo que salio y ABAJO menos (o es quedarse con lo mismo),
-- los dos son de la misma caja, lo que queda en el inventario es el lado que ha tocado (objeto, valor, desgaste y StatTrak), el
-- dinero se cobra una sola vez, en la batalla los totales cuentan lo que se queda y cs_inv_j/cs_battle mandan el giro. La moneda
-- sale 50/50 (dentro de 3 sigmas) y, con el 4 % de verdad, 20.000 tiradas dan un giro en torno al 4 %.
-- Al final mide cuanto devuelve de media cada caja sin el giro y con el, para tres cajas.
-- Lanza un error A PROPOSITO para que se deshaga todo. Si todo va bien, dice "PRUEBA SUPERADA" con el resumen; si no, "FALLO".

create or replace function pg_temp.yo(u uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  perform set_config('request.jwt.claims', json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
end $f$;

-- un giro bien hecho: devuelve 1 si ha ganado, 0 si ha perdido, null si no hubo giro
create or replace function pg_temp.mira(x jsonb) returns int language plpgsql as $f$
declare bo jsonb := x->'bonus'; o jsonb; u jsonb; d jsonb; fin jsonb; caja text := x->>'case'; it cs_items;
begin
  if bo is null or jsonb_typeof(bo) = 'null' then return null; end if;
  o := bo->'orig'; u := bo->'up'; d := bo->'down';
  if (u->>'value')::int <= (o->>'value')::int then raise exception 'FALLO: ARRIBA (%) no vale mas que lo que salio (%)', u->>'value', o->>'value'; end if;
  if coalesce((d->>'keep')::boolean, false) then
    if d->>'item' <> o->>'item' or (d->>'value')::int <> (o->>'value')::int then raise exception 'FALLO: ABAJO "quedarse" no es lo que salio'; end if;
    -- solo puede quedarse si no hay nada mas barato en la caja
  else
    if (d->>'value')::int >= (o->>'value')::int then raise exception 'FALLO: ABAJO (%) no vale menos que lo que salio (%)', d->>'value', o->>'value'; end if;
  end if;
  if not exists (select 1 from cs_case_items where case_id = caja and item_id = u->>'item') or not exists (select 1 from cs_case_items where case_id = caja and item_id = d->>'item') then
    raise exception 'FALLO: un lado del giro no es de la caja %', caja;
  end if;
  fin := case when (bo->>'won')::boolean then u else d end;
  if x->>'item' <> fin->>'item' or (x->>'value')::int <> (fin->>'value')::int or coalesce(x->>'wear', '-') <> coalesce(fin->>'wear', '-') or (x->>'st')::boolean <> (fin->>'st')::boolean then
    raise exception 'FALLO: lo guardado (% %) no es el lado que ha tocado (% %)', x->>'item', x->>'value', fin->>'item', fin->>'value';
  end if;
  -- el valor guardado es el precio de ese objeto con ese desgaste y StatTrak, y el float cae en ese desgaste
  select * into it from cs_items where id = x->>'item';
  if (x->>'value')::int <> greatest(1, coalesce(it.price[1 + case when (x->>'st')::boolean then 5 else 0 end + coalesce((x->>'wear')::int, 0)], 1)) then raise exception 'FALLO: % guardado con un valor que no es su precio', it.name; end if;
  if (x->>'st')::boolean and not it.st then raise exception 'FALLO: % sale StatTrak y no lo admite', it.name; end if;
  if (x->>'wear') is not null and ((x->>'float')::numeric < coalesce(it.minf, 0) or (x->>'float')::numeric > coalesce(it.maxf, 1)
     or (x->>'wear')::int <> case when (x->>'float')::numeric < 0.07 then 0 when (x->>'float')::numeric < 0.15 then 1 when (x->>'float')::numeric < 0.38 then 2 when (x->>'float')::numeric < 0.45 then 3 else 4 end) then
    raise exception 'FALLO: % con un float (%) que no cuadra con su desgaste o su rango', it.name, x->>'float';
  end if;
  return case when (bo->>'won')::boolean then 1 else 0 end;
end $f$;

do $$
declare
  jug uuid[] := array(select id from players order by created_at, username);
  pct0 jsonb := (select value from settings where key = 'giro_dorado_pct');
  cajas text[]; c text; cs2 text; r jsonb; x jsonb; s0 int; k int; w int; giros int := 0; ganados int := 0; sin int := 0; abiertas int := 0;
  oid bigint; bid bigint; b cs_battles; d record; g record; n int; resumen text := ''; trig int; ntir int := 5000; ptop numeric; esperado numeric; sd numeric;
  base numeric; extra numeric; nmed int := 3000; precio int; caja_n text; pago text := ''; te int; suma int; t int;
begin
  if cardinality(jug) < 2 then raise exception 'FALLO: hacen falta al menos dos jugadores'; end if;
  if pct0 is null then raise exception 'FALLO: no esta el ajuste giro_dorado_pct (carga 075)'; end if;
  insert into ledger(player, amount, kind, note) select id, 500000000, 'ajuste', 'saldo de prueba 075' from players;
  select id into cs2 from cs_cases where active and cat = 'skins' order by price, id limit 1;
  cajas := array(select id from cs_cases where active and cat = 'lujo' and id in ('lujo-gaming', 'lujo-cartas', 'lujo-relojes') order by id);
  if cs2 is not null then cajas := cajas || cs2; end if;
  if cardinality(cajas) < 2 then cajas := array(select id from cs_cases where active order by sort limit 3); end if;

  -- 1. con el giro al 100 %: abrir de 5 en 5 cobra una vez y cada giro esta bien
  update settings set value = '100' where key = 'giro_dorado_pct';
  perform pg_temp.yo(jug[1]);
  foreach c in array cajas loop
    for k in 1..12 loop
      s0 := (select coalesce(sum(amount), 0) from ledger where player = jug[1]);
      r := cs_open(c, 5);
      if (select coalesce(sum(amount), 0) from ledger where player = jug[1]) <> s0 - 5 * (select price from cs_cases where id = c) then raise exception 'FALLO: abrir 5 de % con el giro no ha cobrado una sola vez su precio', c; end if;
      for x in select * from jsonb_array_elements(r->'items') loop
        abiertas := abiertas + 1;
        w := pg_temp.mira(x);
        if w is null then sin := sin + 1; else giros := giros + 1; ganados := ganados + w; end if;
        -- lo que manda cs_open es lo que hay en la tabla
        if (select value from cs_inv where id = (x->>'id')::bigint) <> (x->>'value')::int or (select item_id from cs_inv where id = (x->>'id')::bigint) <> x->>'item' then raise exception 'FALLO: cs_open manda algo distinto de lo guardado'; end if;
        if (x ? 'bonus') <> ((select bonus from cs_inv where id = (x->>'id')::bigint) is not null) then raise exception 'FALLO: cs_inv_j no manda bonus cuando lo hay (o lo manda sin haberlo)'; end if;
      end loop;
    end loop;
  end loop;
  -- sin giro solo si ha salido lo mejor de la caja
  if sin > abiertas / 10 then raise exception 'FALLO: con el giro al 100 %% hay % aperturas de % sin giro', sin, abiertas; end if;
  resumen := resumen || format('Al 100 %%: %s aperturas de %s cajas (de 5 en 5, cobran una vez), %s con giro bien hecho y %s sin giro (ya era lo mejor). ', abiertas, cardinality(cajas), giros, sin);

  -- una caja tuya (sin pagar)
  insert into cs_owned(player, case_id, source) values (jug[1], cajas[1], 'prueba') returning id into oid;
  s0 := (select coalesce(sum(amount), 0) from ledger where player = jug[1]);
  r := cs_open_owned(oid);
  if (select coalesce(sum(amount), 0) from ledger where player = jug[1]) <> s0 then raise exception 'FALLO: abrir una caja tuya con el giro ha movido dinero'; end if;
  w := pg_temp.mira(r->'items'->0);
  if w is not null then giros := giros + 1; ganados := ganados + w; end if;
  resumen := resumen || 'Caja tuya: sin cobrar, giro bien. ';

  -- una batalla 1v1 de 3 rondas: los totales cuentan lo que se queda despues del giro
  perform pg_temp.yo(jug[1]); r := cs_battle_create('1v1', array[cajas[1], cajas[1], cajas[1]], 'normal'); bid := (r->>'id')::bigint;
  perform pg_temp.yo(jug[2]); perform cs_battle_join(bid, null);
  select * into b from cs_battles where id = bid;
  if b.status <> 'done' then raise exception 'FALLO: la batalla de prueba no ha terminado'; end if;
  te := cs_tam_equipo(b.mode);
  for t in 0..cs_equipos(b.mode) - 1 loop
    select coalesce(sum(i.value), 0) into suma from cs_battle_drops d2 join cs_inv i on i.id = d2.inv_id where d2.battle_id = bid and d2.seat / te = t;
    if suma <> b.totals[t + 1] then raise exception 'FALLO: en la batalla el total % no es la suma de lo que se queda', t; end if;
  end loop;
  r := cs_battle(bid);
  n := 0;
  for x in select e->'inv' from jsonb_array_elements(r->'drops') e loop
    w := pg_temp.mira(x);
    if w is not null then n := n + 1; giros := giros + 1; ganados := ganados + w; end if;
  end loop;
  if n = 0 then raise exception 'FALLO: con el giro al 100 %% ninguna ronda de la batalla lo ha tenido'; end if;
  resumen := resumen || format('Batalla: %s de 6 con giro, totales con lo que se queda (%s). ', n, array_to_string(b.totals, '/'));

  -- 2. cuanto devuelve cada caja sin y con el giro (medido): sin = valor medio de lo que sale; con = sin + 4 %% de lo que cambia
  --    de media un giro (media de arriba y abajo, que salen al 50 %%). Mismas tiradas para las dos cosas.
  foreach c in array cajas loop
    base := 0; extra := 0;
    for k in 1..nmed loop
      select * into d from cs_roll(c);
      select * into g from cs_giro(c, d.o_item, d.o_wear, d.o_fl, d.o_st, d.o_value);
      base := base + d.o_value;
      if g.o_bonus is not null then
        giros := giros + 1; ganados := ganados + case when (g.o_bonus->>'won')::boolean then 1 else 0 end;
        extra := extra + ((g.o_bonus->'up'->>'value')::numeric + (g.o_bonus->'down'->>'value')::numeric) / 2 - d.o_value;
      end if;
    end loop;
    select price, name into precio, caja_n from cs_cases where id = c;
    pago := pago || format('%s: %s %% sin giro, %s %% con giro (%s puntos); ', caja_n, round(100 * base / nmed / precio, 1), round(100 * (base + 0.04 * extra) / nmed / precio, 1), round(100 * 0.04 * extra / nmed / precio, 2));
  end loop;
  -- la moneda: 50/50 dentro de 3 sigmas
  if abs(ganados - giros / 2.0) > 3 * sqrt(giros) / 2 then raise exception 'FALLO: la moneda no va al 50 %%: % de % arriba', ganados, giros; end if;
  resumen := resumen || format('Moneda: %s arriba de %s giros (50/50 dentro de 3 sigmas). ', ganados, giros);

  -- 3. con el 4 %% de verdad: 5.000 tiradas (20.000 en PGlite) de la primera caja dan un giro en torno al 4 %%
  update settings set value = '4' where key = 'giro_dorado_pct';
  c := cajas[1]; trig := 0;
  for k in 1..ntir loop
    select * into d from cs_roll(c);
    select * into g from cs_giro(c, d.o_item, d.o_wear, d.o_fl, d.o_st, d.o_value);
    if g.o_bonus is not null then trig := trig + 1; end if;
  end loop;
  -- sin giro si ya salio lo mejor: se descuenta la probabilidad del objeto mas caro (si la caja lleva tickets)
  select coalesce(max(ci.tickets::numeric / nullif((select sum(tickets) from cs_case_items where case_id = c), 0)), 0) into ptop
    from cs_case_items ci join cs_items t2 on t2.id = ci.item_id where ci.case_id = c and t2.price[1] = (select max(t3.price[1]) from cs_case_items c3 join cs_items t3 on t3.id = c3.item_id where c3.case_id = c);
  esperado := ntir * 0.04 * (1 - ptop); sd := sqrt(ntir * 0.04 * 0.96);
  if abs(trig - esperado) > 3 * sd + 2 then raise exception 'FALLO: al 4 %% salen % giros de % (se esperaban % +- %)', trig, ntir, round(esperado), round(3 * sd); end if;
  resumen := resumen || format('Al 4 %%: %s giros en %s tiradas de %s (%s %%). ', trig, ntir, (select name from cs_cases where id = c), round(100.0 * trig / ntir, 2));
  update settings set value = pct0 where key = 'giro_dorado_pct';

  raise exception 'PRUEBA SUPERADA (no se ha guardado nada). %Lo que devuelve cada caja: %', resumen, pago;
end $$;
