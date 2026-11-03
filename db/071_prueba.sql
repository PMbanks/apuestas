-- Prueba de 071 (Mejorar), para el editor SQL de Supabase. Va despues de 071_mejora.sql (y de todo lo anterior: 007, 012, 020, 055 y sus datos).
-- Comprueba: lo que falla tiene que fallar con su mensaje (sin entrar; skin de otro; skin vendida; repetida; mas de 20; nada puesto; mas V-Bucks de los que
-- tienes; objetivo por debajo de 1,25 veces o por encima de 100 veces; objetivo que no esta en ninguna caja activa de CS2 o lujo, o cosmetico; desgaste que
-- esa skin no tiene); la lista de objetivos (dentro del rango, ordenada, valor = cs_val, solo cajas activas de CS2 y lujo, el buscador); una mejora que
-- gana y otra que pierde (las skins puestas quedan 'upg' en los dos casos, no se pueden vender ni volver a poner; los V-Bucks se cobran una sola vez; si gana
-- entra el objetivo con su valor y un float dentro de su desgaste); la probabilidad es exactamente 0,95 x puesto / objetivo y gana si la tirada sale por debajo;
-- y 2.000 mejoras a x2 (20.000 en la prueba local de PGlite; en el editor de Supabase 20.000 pasan del tiempo maximo) dan una tasa de acierto dentro de 3,5 sigmas de lo esperado y una devolucion media del 95 %.
-- Al final lanza un error A PROPOSITO para que se deshaga todo: no queda nada guardado (ni saldo, ni skins, ni mejoras).
-- Si todo va bien, el error dice "PRUEBA SUPERADA" con el resumen. Si algo falla, dice "FALLO" y que.

-- ayudantes que viven solo durante esta prueba
create or replace function pg_temp.uid(n int) returns uuid language sql as $$ select id from players order by created_at, id offset n - 1 limit 1 $$;
create or replace function pg_temp.yo(n int) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.uid(n), 'role', 'authenticated')::text, true); end $$;
create or replace function pg_temp.sal(n int) returns int language sql as $$ select coalesce(sum(amount), 0)::int from ledger where player = pg_temp.uid(n) $$;
-- una skin de prueba con el valor que se quiera
create or replace function pg_temp.da(n int, item text, val int) returns bigint language sql as $$
  insert into cs_inv(player, item_id, value, case_id, opened_by) values (pg_temp.uid(n), item, val, null, pg_temp.uid(n)) returning id $$;
-- el mensaje de error de una llamada (null si no falla)
create or replace function pg_temp.msg(q text) returns text language plpgsql as $$ begin execute q; return null; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.mejora(ids bigint[], vb int, item text, w smallint, st boolean) returns text language sql as $$
  select format('select cs_upgrade(%L::bigint[], %s, %L, %s::smallint, %L::boolean)', ids, coalesce(vb::text, 'null'), item, coalesce(w::text, 'null'), st) $$;

do $$
declare
  jug uuid[] := array(select id from players order by created_at, id);
  t record; tl record; tb record; r jsonb; m text; resumen text := '';
  a1 bigint; a2 bigint; ids bigint[]; s0 int; s1 int; n int; k int; sv int; tv int; vb int;
  gano boolean := false; perdio boolean := false; ch numeric; esperado numeric := 0; var numeric := 0; wins int := 0; pagado bigint := 0; puesto bigint := 0;
  ntir int := 2000; sd numeric; rtp numeric; rtp_sd numeric; fl numeric; cut numeric[] := array[0, 0.07, 0.15, 0.38, 0.45, 1];
  it cs_items; un0 int;
begin
  if cardinality(jug) < 2 then raise exception 'FALLO: hacen falta al menos dos jugadores'; end if;
  insert into ledger(player, amount, kind, note) select id, 500000000, 'ajuste', 'saldo de prueba' from players;
  perform pay_week();
  perform pg_temp.yo(1);

  -- 0. quien puede llamar a que
  if has_function_privilege('anon', 'cs_upgrade(bigint[], integer, text, smallint, boolean)', 'execute') then raise exception 'FALLO: anon puede llamar a cs_upgrade'; end if;
  if not has_function_privilege('authenticated', 'cs_upgrade(bigint[], integer, text, smallint, boolean)', 'execute') then raise exception 'FALLO: los jugadores no pueden llamar a cs_upgrade'; end if;
  if has_function_privilege('authenticated', 'cs_val(text, smallint, boolean)', 'execute') then raise exception 'FALLO: cs_val se puede llamar desde fuera'; end if;
  if has_table_privilege('authenticated', 'cs_upgrades', 'insert') or has_table_privilege('authenticated', 'cs_upgrades', 'update') then raise exception 'FALLO: se puede escribir en cs_upgrades desde fuera'; end if;

  -- 1. la lista de objetivos
  n := 0;
  for t in select * from cs_upgrade_targets(100, 5000, null, 200) loop
    n := n + 1;
    if t.value < 100 or t.value > 5000 then raise exception 'FALLO: cs_upgrade_targets da % fuera de 100..5000', t.value; end if;
    if t.value <> cs_val(t.id, t.wear, t.st) then raise exception 'FALLO: % vale % en la lista y % en cs_val', t.id, t.value, cs_val(t.id, t.wear, t.st); end if;
    if not cs_upg_valido(t.id) then raise exception 'FALLO: % sale en la lista y no esta en ninguna caja activa de CS2 o lujo', t.id; end if;
  end loop;
  if n = 0 then raise exception 'FALLO: no hay objetivos entre 100 y 5.000'; end if;
  if exists (select 1 from (select value, lag(value) over () as antes from cs_upgrade_targets(100, 5000, null, 200)) q where q.value < q.antes) then raise exception 'FALLO: la lista no va de la mas barata a la mas cara'; end if;
  if (select count(*) from cs_upgrade_targets(1, 1000000000, null, 500)) > 200 then raise exception 'FALLO: la lista pasa de 200'; end if;

  -- objetivos de la prueba: una skin de CS2 con float (valor de 200 a 50.000) y, si hay, un objeto de lujo
  select * into t from cs_upgrade_targets(200, 50000, null, 200) x where x.wear is not null order by x.value limit 1;
  if t.id is null then raise exception 'FALLO: no hay ninguna skin de CS2 con desgaste entre 200 y 50.000 para probar'; end if;
  select * into tl from cs_upgrade_targets(200, 50000, null, 200) x where x.wear is null and not exists (select 1 from cs_items i where i.id = x.id and i.st) limit 1;
  -- el buscador encuentra la skin elegida por su nombre
  if not exists (select 1 from cs_upgrade_targets(t.value, t.value, (select name from cs_items where id = t.id), 200) x where x.id = t.id) then raise exception 'FALLO: el buscador no encuentra %', t.name; end if;
  if exists (select 1 from cs_upgrade_targets(1, 1000000000, 'zzqq%_nada', 10)) then raise exception 'FALLO: el buscador encuentra algo con un texto que no existe'; end if;
  resumen := resumen || format('Lista de objetivos bien (%s entre 100 y 5.000). Objetivo: %s %s (%s). ', n, t.name, coalesce(cs_wear_name(t.wear), ''), t.value);

  -- 2. lo que tiene que fallar, con su mensaje
  a1 := pg_temp.da(1, t.id, 100);
  a2 := pg_temp.da(2, t.id, 100);
  perform set_config('request.jwt.claims', '', true);
  m := pg_temp.msg(pg_temp.mejora(array[a1], 0, t.id, t.wear, t.st));
  if m is distinct from 'Tienes que entrar primero' then raise exception 'FALLO: sin entrar: %', coalesce(m, 'no ha fallado'); end if;
  perform pg_temp.yo(1);
  m := pg_temp.msg(pg_temp.mejora(array[a2], 0, t.id, t.wear, t.st));
  if m is distinct from 'Alguna de esas skins no es tuya o ya no está en tu inventario' then raise exception 'FALLO: skin de otro: %', coalesce(m, 'no ha fallado'); end if;
  update cs_inv set status = 'sold', sold_at = now() where id = a1;
  m := pg_temp.msg(pg_temp.mejora(array[a1], 0, t.id, t.wear, t.st));
  if m is distinct from 'Alguna de esas skins no es tuya o ya no está en tu inventario' then raise exception 'FALLO: skin vendida: %', coalesce(m, 'no ha fallado'); end if;
  a1 := pg_temp.da(1, t.id, 100);
  m := pg_temp.msg(pg_temp.mejora(array[a1, a1], 0, t.id, t.wear, t.st));
  if m is distinct from 'Hay una skin repetida' then raise exception 'FALLO: skin repetida: %', coalesce(m, 'no ha fallado'); end if;
  ids := array(select pg_temp.da(1, t.id, 1) from generate_series(1, 21));
  m := pg_temp.msg(pg_temp.mejora(ids, 0, t.id, t.wear, t.st));
  if m is distinct from 'Como mucho 20 skins a la vez' then raise exception 'FALLO: 21 skins: %', coalesce(m, 'no ha fallado'); end if;
  m := pg_temp.msg(pg_temp.mejora(array[]::bigint[], 0, t.id, t.wear, t.st));
  if m is distinct from 'Pon algo para mejorar: skins o V-Bucks' then raise exception 'FALLO: nada puesto: %', coalesce(m, 'no ha fallado'); end if;
  m := pg_temp.msg(pg_temp.mejora(array[]::bigint[], -5, t.id, t.wear, t.st));
  if m is distinct from 'Los V-Bucks no pueden ser negativos' then raise exception 'FALLO: V-Bucks negativos: %', coalesce(m, 'no ha fallado'); end if;
  m := pg_temp.msg(pg_temp.mejora(array[]::bigint[], pg_temp.sal(1) + 1, t.id, t.wear, t.st));
  if m is null or m not like 'No tienes saldo suficiente%' then raise exception 'FALLO: mas V-Bucks de los que tiene: %', coalesce(m, 'no ha fallado'); end if;
  -- multiplicador: por debajo de 1,25 y por encima de 100
  update cs_inv set value = greatest(1, floor(t.value / 1.2)::int) where id = a1;
  m := pg_temp.msg(pg_temp.mejora(array[a1], 0, t.id, t.wear, t.st));
  if m is distinct from 'El objetivo tiene que valer al menos 1,25 veces lo que pones' then raise exception 'FALLO: x1,2: %', coalesce(m, 'no ha fallado'); end if;
  m := pg_temp.msg(pg_temp.mejora(array[]::bigint[], floor(t.value / 1.2)::int, t.id, t.wear, t.st));
  if m is distinct from 'El objetivo tiene que valer al menos 1,25 veces lo que pones' then raise exception 'FALLO: x1,2 con V-Bucks: %', coalesce(m, 'no ha fallado'); end if;
  if t.value >= 101 then
    update cs_inv set value = 1 where id = a1;
    m := pg_temp.msg(pg_temp.mejora(array[a1], 0, t.id, t.wear, t.st));
    if m is distinct from 'El objetivo puede valer como mucho 100 veces lo que pones' then raise exception 'FALLO: mas de x100: %', coalesce(m, 'no ha fallado'); end if;
  end if;
  update cs_inv set value = greatest(1, floor(t.value / 2.0)::int) where id = a1;
  -- un objetivo que no esta en ninguna caja activa de CS2 o lujo
  insert into cs_items(id, name, rarity, image, minf, maxf, st, price) values ('prueba-071-suelta', 'Prueba suelta', 'cov', 'x', 0, 1, false, array[500,500,500,500,500,0,0,0,0,0]);
  m := pg_temp.msg(pg_temp.mejora(array[a1], 0, 'prueba-071-suelta', 2::smallint, false));
  if m is distinct from 'Ese objeto no se puede conseguir con una mejora' then raise exception 'FALLO: objetivo sin caja: %', coalesce(m, 'no ha fallado'); end if;
  insert into cs_cases(id, name, image, price, active) values ('prueba-071-vieja', 'Caja vieja', 'x', 10, false);
  insert into cs_case_items(case_id, item_id) values ('prueba-071-vieja', 'prueba-071-suelta');
  m := pg_temp.msg(pg_temp.mejora(array[a1], 0, 'prueba-071-suelta', 2::smallint, false));
  if m is distinct from 'Ese objeto no se puede conseguir con una mejora' then raise exception 'FALLO: objetivo de una caja apagada: %', coalesce(m, 'no ha fallado'); end if;
  update cs_cases set active = true, cat = 'cosmeticos' where id = 'prueba-071-vieja';
  m := pg_temp.msg(pg_temp.mejora(array[a1], 0, 'prueba-071-suelta', 2::smallint, false));
  if m is distinct from 'Ese objeto no se puede conseguir con una mejora' then raise exception 'FALLO: objetivo cosmetico: %', coalesce(m, 'no ha fallado'); end if;
  if exists (select 1 from cs_upgrade_targets(1, 1000000000, 'Prueba suelta', 50)) then raise exception 'FALLO: un objeto de una caja de cosmeticos sale en la lista'; end if;
  m := pg_temp.msg(pg_temp.mejora(array[a1], 0, 'no-existe-071', null, false));
  if m is distinct from 'Ese objeto no se puede conseguir con una mejora' then raise exception 'FALLO: objetivo que no existe: %', coalesce(m, 'no ha fallado'); end if;
  -- un desgaste que esa skin no puede tener, StatTrak donde no hay, o desgaste en algo sin desgaste
  select * into it from cs_items where id = t.id;
  select min(g) into un0 from generate_series(0, 4) g where not cs_upg_cabe(it.minf, it.maxf, g);
  if un0 is not null then
    m := pg_temp.msg(pg_temp.mejora(array[a1], 0, t.id, un0::smallint, false));
    if m is distinct from 'Ese objeto no existe con ese desgaste' then raise exception 'FALLO: desgaste imposible: %', coalesce(m, 'no ha fallado'); end if;
  end if;
  m := pg_temp.msg(pg_temp.mejora(array[a1], 0, t.id, null, false));
  if m is distinct from 'Ese objeto no existe con ese desgaste' then raise exception 'FALLO: skin con float pedida sin desgaste: %', coalesce(m, 'no ha fallado'); end if;
  if tl.id is not null then
    m := pg_temp.msg(pg_temp.mejora(array[a1], 0, tl.id, 1::smallint, false));
    if m is distinct from 'Ese objeto no existe con ese desgaste' then raise exception 'FALLO: lujo con desgaste: %', coalesce(m, 'no ha fallado'); end if;
    m := pg_temp.msg(pg_temp.mejora(array[a1], 0, tl.id, null, true));
    if m is distinct from 'Ese objeto no existe con ese desgaste' then raise exception 'FALLO: lujo StatTrak: %', coalesce(m, 'no ha fallado'); end if;
  end if;
  -- nada de lo que ha fallado ha cobrado ni gastado nada
  if exists (select 1 from ledger where kind = 'mejora') or exists (select 1 from cs_inv where status = 'upg') or exists (select 1 from cs_upgrades) then
    raise exception 'FALLO: una mejora que fallo dejo algo cobrado, gastado o apuntado';
  end if;
  resumen := resumen || 'Todo lo que tiene que fallar falla con su mensaje y sin cobrar ni gastar nada. ';

  -- 3. una que gana y una que pierde (a x1,25: 76 %), con skins y V-Bucks a la vez
  k := 0;
  while (not gano or not perdio) and k < 300 loop
    k := k + 1;
    sv := greatest(1, floor(t.value / 2.5)::int);        -- la skin vale la mitad de lo que se pone
    vb := floor(t.value / 1.25)::int - sv;               -- y el resto en V-Bucks: en total, el objetivo / 1,25 (redondeado hacia abajo)
    a1 := pg_temp.da(1, t.id, sv);
    s0 := pg_temp.sal(1);
    n := (select count(*) from cs_inv where player = jug[1] and status = 'own');
    r := cs_upgrade(array[a1], vb, t.id, t.wear, t.st);
    ch := round(least(0.95 * (sv + vb) / t.value::numeric, 0.76), 10);
    if (r->>'chance')::numeric <> ch then raise exception 'FALLO: probabilidad % y tenia que ser %', r->>'chance', ch; end if;
    if (r->>'stake_value')::int <> sv + vb or (r->>'target_value')::int <> t.value or (r->>'vbucks')::int <> vb or (r->>'skins_value')::int <> sv then raise exception 'FALLO: lo puesto o el objetivo no cuadran: %', r; end if;
    if ((r->>'roll')::double precision < ch::double precision) <> (r->>'won')::boolean then raise exception 'FALLO: tirada % con probabilidad % y won = %', r->>'roll', ch, r->>'won'; end if;
    if (r->>'roll')::double precision < 0 or (r->>'roll')::double precision >= 1 then raise exception 'FALLO: tirada fuera de 0..1'; end if;
    if pg_temp.sal(1) <> s0 - vb or (r->>'saldo')::int <> s0 - vb then raise exception 'FALLO: los V-Bucks no se han cobrado una vez (antes %, despues %, puestos %)', s0, pg_temp.sal(1), vb; end if;
    if (select status from cs_inv where id = a1) <> 'upg' then raise exception 'FALLO: la skin puesta no ha quedado gastada'; end if;
    if (r->>'won')::boolean then
      gano := true;
      if (select count(*) from cs_inv where player = jug[1] and status = 'own') <> n then raise exception 'FALLO: al ganar no ha entrado justo una skin (y salido la puesta)'; end if;
      if (r->'item'->>'item') <> t.id or (r->'item'->>'value')::int <> t.value or (r->'item'->>'wear')::int <> t.wear or (r->'item'->>'st')::boolean <> t.st or r->'item'->>'status' <> 'own' then
        raise exception 'FALLO: lo que ha entrado no es el objetivo: %', r->'item';
      end if;
      fl := (r->'item'->>'float')::numeric;
      if (case when it.minf = it.maxf then fl <> round(it.minf, 6) else fl < greatest(it.minf, cut[t.wear + 1]) or fl >= least(it.maxf, cut[t.wear + 2]) end) then raise exception 'FALLO: float % fuera del desgaste % de esa skin', fl, t.wear; end if;
      if (select inv_id from cs_upgrades where id = (r->>'id')::bigint) <> (r->'item'->>'id')::bigint then raise exception 'FALLO: la mejora ganada no apunta a la skin que entro'; end if;
    else
      perdio := true;
      if (select count(*) from cs_inv where player = jug[1] and status = 'own') <> n - 1 then raise exception 'FALLO: al perder ha entrado algo o no se ha ido la skin puesta'; end if;
      if (select inv_id from cs_upgrades where id = (r->>'id')::bigint) is not null then raise exception 'FALLO: una mejora perdida apunta a una skin'; end if;
    end if;
    -- la skin gastada no se puede vender ni volver a poner
    m := pg_temp.msg(format('select cs_sell(%L::bigint[])', array[a1]));
    if m is null then raise exception 'FALLO: una skin gastada en una mejora se ha podido vender'; end if;
    m := pg_temp.msg(pg_temp.mejora(array[a1], 0, t.id, t.wear, t.st));
    if m is distinct from 'Alguna de esas skins no es tuya o ya no está en tu inventario' then raise exception 'FALLO: una skin gastada se ha podido volver a poner: %', coalesce(m, 'no ha fallado'); end if;
  end loop;
  if not gano or not perdio then raise exception 'FALLO: en % mejoras al 76 %% no ha salido una ganada y una perdida', k; end if;
  if (select count(*) from cs_upgrades where player = jug[1]) <> k then raise exception 'FALLO: hay % mejoras apuntadas y se han hecho %', (select count(*) from cs_upgrades where player = jug[1]), k; end if;
  if (select count(*) from ledger where player = jug[1] and kind = 'mejora') <> k then raise exception 'FALLO: los V-Bucks se han cobrado % veces en % mejoras', (select count(*) from ledger where player = jug[1] and kind = 'mejora'), k; end if;
  resumen := resumen || format('Ganada y perdida en %s mejoras a x1,25 (skin + V-Bucks): skins gastadas, cobro una vez, objetivo con su float. ', k);

  -- un objeto de lujo (sin desgaste ni float), a x1,25 hasta ganar uno
  if tl.id is not null then
    k := 0; gano := false;
    while not gano and k < 200 loop
      k := k + 1;
      r := cs_upgrade(array[]::bigint[], floor(tl.value / 1.25)::int, tl.id, null, false);
      if (r->>'won')::boolean then
        gano := true;
        if (r->'item'->>'wear') is not null or (r->'item'->>'float') is not null or (r->'item'->>'value')::int <> tl.value then raise exception 'FALLO: el lujo ganado trae desgaste o float o no vale lo que dice: %', r->'item'; end if;
      end if;
    end loop;
    if not gano then raise exception 'FALLO: 200 mejoras de lujo al 76 %% sin ganar ninguna'; end if;
    resumen := resumen || format('Lujo ganado (%s, %s) sin desgaste ni float. ', tl.name, tl.value);
  end if;

  -- 4. 2.000 mejoras a x2 con skins: tasa de acierto y devolucion media
  perform pg_temp.yo(2);
  tv := t.value; sv := greatest(1, floor(tv / 2.0)::int);
  ids := array(select pg_temp.da(2, t.id, sv) from generate_series(1, ntir));
  for k in 1..ntir loop
    r := cs_upgrade(array[ids[k]], 0, t.id, t.wear, t.st);
    ch := (r->>'chance')::numeric;
    esperado := esperado + ch; var := var + ch * (1 - ch); puesto := puesto + sv;
    if (r->>'won')::boolean then wins := wins + 1; pagado := pagado + tv; end if;
  end loop;
  sd := sqrt(var);
  if abs(wins - esperado) > 3.5 * sd then raise exception 'FALLO: % mejoras a x%: % ganadas y se esperaban % (+-%)', ntir, round(tv::numeric / sv, 3), wins, round(esperado, 1), round(3.5 * sd, 1); end if;
  rtp := pagado::numeric / puesto;
  rtp_sd := tv::numeric / sv * sqrt(var) / ntir;
  if abs(rtp - 0.95) > 3.5 * rtp_sd then raise exception 'FALLO: devolucion media % %% (tiene que ser 95 %% +- %)', round(100 * rtp, 2), round(350 * rtp_sd, 2); end if;
  if exists (select 1 from cs_upgrades where player = jug[2] and (won <> (roll < chance::double precision) or roll < 0 or roll >= 1)) then raise exception 'FALLO: una mejora apuntada no cuadra su tirada con su resultado'; end if;
  if exists (select 1 from cs_upgrades u join cs_inv i on i.id = u.inv_id where u.player = jug[2] and (
       (case when it.minf = it.maxf then i.fl <> round(it.minf, 6) else i.fl < greatest(it.minf, cut[t.wear + 1]) or i.fl >= least(it.maxf, cut[t.wear + 2]) end) or i.wear <> t.wear or i.value <> tv or i.item_id <> t.id)) then
    raise exception 'FALLO: alguna skin ganada no tiene el float, el desgaste o el valor de su objetivo';
  end if;
  if (select count(*) from cs_upgrades where player = jug[2] and won) <> wins or (select count(*) from cs_upgrades where player = jug[2] and won and inv_id is null) > 0 then raise exception 'FALLO: las ganadas apuntadas no cuadran'; end if;
  if (select count(*) from cs_inv where id = any(ids) and status <> 'upg') > 0 then raise exception 'FALLO: alguna skin de las simuladas no ha quedado gastada'; end if;
  resumen := resumen || format('%s mejoras a x%s (probabilidad %s %%): %s ganadas, se esperaban %s (+-%s a 3,5 sigmas); devolucion media %s %% (95 %% +- %s). ',
    ntir, round(tv::numeric / sv, 3), round(100 * esperado / ntir, 3), wins, round(esperado, 1), round(3.5 * sd, 1), round(100 * rtp, 2), round(350 * rtp_sd, 2));

  raise exception 'PRUEBA SUPERADA (no se ha guardado nada). %', resumen;
end $$;
