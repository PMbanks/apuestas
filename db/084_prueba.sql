-- 084 (05-11). Tickets en las batallas: prueba, para el editor SQL de Supabase. Va DESPUES de 081 (y de 083).
-- PM 05-11: "los tickets dorado y de diamante tienen que estar tambien en battles".
-- 084 NO trae migracion: db/081 ya cambio cs_battle_resolve para que cada sitio de cada ronda abra su caja con cs_tirada (la misma que
-- cs_open: mismo Ticket Dorado, mismo Ticket de Diamante, mismas probabilidades y el mismo tope de giro_extra_pts), en la misma transaccion
-- que la batalla, y cs_battle ya manda el ticket de cada pieza en inv.bonus. En la base de verdad, cuando se miro (05-11), las batallas
-- jugadas desde que se cargo 081 eran 16 aperturas y ninguna saco ticket (con el Dorado al 6 % pasa una de cada tres veces).
-- Crazy no cambia: gana el lado que menos valor saca, contado DESPUES del ticket (un Diamante en Crazy es mala suerte para quien lo saca;
-- lo que devuelve la batalla a todos juntos es lo mismo que en Normal).
-- Esta prueba lee los ajustes que haya (con el Dorado al 6 % de hoy vale; 081_prueba.sql, en cambio, exige el 4 % y ya no pasa tal cual).
-- Esta prueba lo comprueba en la base:
--   0. cs_battle_resolve es la de 081 (usa cs_tirada) y estan los 7 ajustes giro_*.
--   1. Con el Dorado al 100 % (solo dentro de la prueba): batallas de los 7 formatos, Normal y Crazy, con cajas de lujo y de CS2:
--      cada pieza lleva su ticket "oro", sale de su monton y de su caja con su precio; el total de cada lado es la suma de lo que vale
--      cada pieza despues del ticket; gana el lado con mas (Normal) o con menos (Crazy); todo acaba en el lado ganador; cada uno paga una
--      vez; cs_battle manda lo guardado (con el ticket) y las claves de siempre (la app publicada no se rompe).
--   2. Con el Diamante al 100 %: todo sale del monton bueno, tambien en Crazy.
--   3. Con los ajustes de verdad: muchas batallas 3v3 de 10 rondas (miles de aperturas): el Dorado sale a su ritmo y el Diamante a su
--      probabilidad (dentro de 4 sigmas), el lado del Dorado con la "sube" de cada caja, cada ticket de su monton, y lo que sale de media
--      en las batallas es lo que devuelve cada caja con tickets (dentro de 4 sigmas), que nunca pasa de lo que devuelve sin ellos +
--      giro_extra_pts (0,75 puntos) en ninguna caja activa.
-- Lanza un error A PROPOSITO para que se deshaga todo. Si todo va bien dice "PRUEBA SUPERADA" con el resumen; si no, "FALLO".

create or replace function pg_temp.yo(u uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  perform set_config('request.jwt.claims', json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
end $f$;

-- una pieza con ticket bien hecha (como en 081_prueba); devuelve el lado (o null si no lleva ticket)
create or replace function pg_temp.mira(x jsonb, p_tipo text) returns text language plpgsql as $f$
declare bo jsonb := x->'bonus'; caja text := x->>'case'; it cs_items; lado text;
begin
  if bo is null or jsonb_typeof(bo) = 'null' then return null; end if;
  if bo ? 'orig' then raise exception 'FALLO: sale un giro viejo de 075 (%)', bo; end if;
  if p_tipo is not null and bo->>'tipo' is distinct from p_tipo then raise exception 'FALLO: ticket % y se esperaba %', bo->>'tipo', p_tipo; end if;
  lado := bo->>'lado';
  if not ((bo->>'tipo' = 'oro' and lado in ('malo', 'medio')) or (bo->>'tipo' = 'diamante' and lado = 'bueno')) then raise exception 'FALLO: ticket % con lado %', bo->>'tipo', lado; end if;
  if not exists (select 1 from cs_giro_montones(caja) m where m.monton = lado and m.item = x->>'item') then
    raise exception 'FALLO: % no es del monton % de la caja %', x->>'item', lado, caja;
  end if;
  if not exists (select 1 from cs_case_items where case_id = caja and item_id = x->>'item') then raise exception 'FALLO: lo que sale no es de la caja %', caja; end if;
  select * into it from cs_items where id = x->>'item';
  if (x->>'value')::int <> greatest(1, coalesce(it.price[1 + case when (x->>'st')::boolean then 5 else 0 end + coalesce((x->>'wear')::int, 0)], 1)) then raise exception 'FALLO: % con un valor que no es su precio', it.name; end if;
  if (x->>'st')::boolean and not it.st then raise exception 'FALLO: % sale StatTrak y no lo admite', it.name; end if;
  return lado;
end $f$;

-- una batalla entera: la crea jug[1] y se unen los demas por orden; devuelve su id (ya resuelta)
create or replace function pg_temp.batalla(jug uuid[], p_mode text, p_cases text[], p_regla text) returns bigint language plpgsql as $f$
declare r jsonb; bid bigint;
begin
  perform pg_temp.yo(jug[1]); r := cs_battle_create(p_mode, p_cases, p_regla); bid := (r->>'id')::bigint;
  for k in 2..cs_plazas(p_mode) loop perform pg_temp.yo(jug[k]); perform cs_battle_join(bid, null); end loop;
  return bid;
end $f$;

-- todo lo que tiene que cumplir una batalla terminada; tipo: el ticket que tiene que llevar CADA pieza (null = no se mira)
create or replace function pg_temp.revisa(bid bigint, p_tipo text) returns int language plpgsql as $f$
declare b cs_battles; te int; ne int; s0 int; j jsonb; x jsonb; e jsonb; n int := 0; mejor int; nd int;
begin
  select * into b from cs_battles where id = bid;
  if b.status <> 'done' then raise exception 'FALLO: la batalla % (%) no ha terminado', bid, b.mode; end if;
  te := cs_tam_equipo(b.mode); ne := cs_equipos(b.mode);
  nd := (select count(*) from cs_battle_drops where battle_id = bid);
  if nd <> cardinality(b.cases) * te * ne then raise exception 'FALLO: la batalla % tiene % piezas y deberia tener %', bid, nd, cardinality(b.cases) * te * ne; end if;
  -- el total de cada lado: lo que vale cada pieza (despues del ticket)
  for t in 0..ne - 1 loop
    select coalesce(sum(i.value), 0) into s0 from cs_battle_drops d2 join cs_inv i on i.id = d2.inv_id where d2.battle_id = bid and d2.seat / te = t;
    if s0 <> b.totals[t + 1] then raise exception 'FALLO: en la batalla % el total del lado % es % y lo que vale lo suyo %', bid, t, b.totals[t + 1], s0; end if;
  end loop;
  mejor := case when b.regla = 'crazy' then (select min(v) from unnest(b.totals) v) else (select max(v) from unnest(b.totals) v) end;
  if b.totals[b.winner + 1] <> mejor then raise exception 'FALLO: en la batalla % (%) gana el lado % con % y el que toca tiene %', bid, b.regla, b.winner, b.totals[b.winner + 1], mejor; end if;
  if exists (select 1 from cs_inv i where i.battle_id = bid and not exists (select 1 from cs_battle_seats bs where bs.battle_id = bid and bs.player = i.player and bs.seat / te = b.winner)) then
    raise exception 'FALLO: en la batalla % hay piezas que no son del lado ganador', bid;
  end if;
  if exists (select 1 from cs_battle_seats bs where bs.battle_id = bid
             and (select coalesce(sum(l.amount), 0) from ledger l where l.player = bs.player and l.kind = 'batalla' and l.note = cs_battle_nota(b)) <> -b.cost) then
    raise exception 'FALLO: en la batalla % alguien no ha pagado una vez lo que cuesta', bid;
  end if;
  -- lo que lee la app: las claves de siempre y lo guardado, con su ticket
  perform pg_temp.yo((select player from cs_battle_seats where battle_id = bid and seat = 0));
  j := cs_battle(bid);
  if not (j ?& array['id', 'mode', 'cases', 'cost', 'status', 'winner', 'totals', 'seats', 'drops']) then raise exception 'FALLO: cs_battle ya no manda las claves de siempre: %', (select array_agg(k) from jsonb_object_keys(j) k); end if;
  if jsonb_array_length(j->'drops') <> nd then raise exception 'FALLO: cs_battle manda % piezas de %', jsonb_array_length(j->'drops'), nd; end if;
  for e in select * from jsonb_array_elements(j->'drops') loop
    x := e->'inv';
    if not (e ?& array['round', 'seat', 'inv']) or not (x ?& array['id', 'item', 'value', 'case']) then raise exception 'FALLO: una pieza de cs_battle sin sus claves: %', e; end if;
    if (select value from cs_inv where id = (x->>'id')::bigint) <> (x->>'value')::int or (select bonus from cs_inv where id = (x->>'id')::bigint) is distinct from x->'bonus' then
      raise exception 'FALLO: cs_battle manda algo distinto de lo guardado en la batalla %', bid;
    end if;
    if p_tipo is not null and pg_temp.mira(x, p_tipo) is null then raise exception 'FALLO: con el % al 100 %% una pieza de la batalla % (%) sale sin ticket', p_tipo, bid, b.mode; end if;
    if pg_temp.mira(x, null) is not null then n := n + 1; end if;
  end loop;
  return n;
end $f$;

do $$
declare
  jug uuid[] := array(select id from players order by created_at, username);
  guarda jsonb := (select jsonb_object_agg(key, value) from settings where key like 'giro\_%');
  cajas text[]; lujo text[]; cs2 text; m record; bid bigint; n int; con int; nb int; resumen text := ''; k int;
  modos text[][] := array[['1v1', 'normal'], ['1v1', 'crazy'], ['2v2', 'crazy'], ['1v1v1', 'normal'], ['1v1v1v1', 'crazy'],
    ['1v1v1v1v1v1', 'normal'], ['2v2v2', 'crazy'], ['3v3', 'normal'], ['3v3', 'crazy']];
  c text; pr int; a record; ntot int := 0; peor numeric := -1e9; peor_c text; ids bigint[] := '{}';
  st record; ronda text[]; nbat int := 70;
begin
  -- 0. lo que tiene que estar
  if cardinality(jug) < 6 then raise exception 'FALLO: hacen falta al menos seis jugadores (para 3v3)'; end if;
  if (select count(*) from settings where key in ('giro_dorado_pct', 'giro_diamante_max', 'giro_extra_pts', 'giro_diamante_parte', 'giro_dorado_sube_max', 'giro_medio_tope', 'giro_bueno_desde')) <> 7 then
    raise exception 'FALLO: faltan ajustes del giro (carga 081)';
  end if;
  if not exists (select 1 from pg_proc where proname = 'cs_battle_resolve' and prosrc like '%cs_tirada(%') then
    raise exception 'FALLO: las batallas no tiran tickets (cs_battle_resolve no es la de 081: carga 081)';
  end if;
  resumen := format('Ajustes de verdad: dorado %s %%, diamante como mucho %s %%, tope %s puntos. ', guarda->>'giro_dorado_pct', guarda->>'giro_diamante_max', guarda->>'giro_extra_pts');
  insert into ledger(player, amount, kind, note) select id, 500000000, 'ajuste', 'saldo de prueba 084' from players;

  -- las cajas: las dos de lujo (con tickets de EmpireDrop) mas baratas y la de CS2 mas barata
  lujo := array(select id from cs_cases cc where active and cat = 'lujo' and exists (select 1 from cs_case_items ci where ci.case_id = cc.id and ci.tickets is not null) order by price, id limit 2);
  select id into cs2 from cs_cases where active and cat = 'skins' order by price, id limit 1;
  cajas := lujo || case when cs2 is null then '{}'::text[] else array[cs2] end;
  if cardinality(cajas) < 2 then cajas := array(select id from cs_cases where active order by price, id limit 3); end if;
  if cardinality(cajas) < 2 then raise exception 'FALLO: hacen falta al menos dos cajas activas'; end if;

  -- 1. el Dorado al 100 %, todos los formatos, Normal y Crazy
  update settings set value = '100' where key = 'giro_dorado_pct';
  update settings set value = '0' where key = 'giro_diamante_max';
  con := 0; nb := 0;
  for k in 1..array_length(modos, 1) loop
    bid := pg_temp.batalla(jug, modos[k][1], array[cajas[1], cajas[cardinality(cajas)], cajas[2]], modos[k][2]);
    n := pg_temp.revisa(bid, 'oro');
    con := con + n; nb := nb + 1;
  end loop;
  resumen := resumen || format('Dorado al 100 %%: %s batallas (los 7 formatos, Normal y Crazy), %s piezas, todas con su ticket, de su monton, totales y ganador con lo de despues del ticket. ', nb, con);

  -- 2. el Diamante al 100 % (el presupuesto muy alto para que su probabilidad llegue al 100 %)
  update settings set value = '0' where key = 'giro_dorado_pct';
  update settings set value = '100' where key = 'giro_diamante_max';
  update settings set value = '100000' where key = 'giro_extra_pts';
  update settings set value = '100' where key = 'giro_diamante_parte';
  con := 0;
  bid := pg_temp.batalla(jug, '1v1', array[cajas[1], cajas[2]], 'crazy'); con := con + pg_temp.revisa(bid, 'diamante');
  bid := pg_temp.batalla(jug, '2v2', array[cajas[cardinality(cajas)], cajas[1]], 'normal'); con := con + pg_temp.revisa(bid, 'diamante');
  resumen := resumen || format('Diamante al 100 %%: %s piezas en Crazy y en Normal, todas del monton bueno. ', con);

  -- 3. con los ajustes de verdad
  update settings s set value = guarda->s.key where s.key like 'giro\_%';
  -- ninguna caja activa devuelve mas de giro_extra_pts puntos sobre lo de sin tickets (las batallas pueden llevar cualquiera)
  for c, pr in select id, price from cs_cases where active order by id loop
    select * into a from cs_giro_ajuste(c);
    if a.nuevo > a.base + pr * (guarda->>'giro_extra_pts')::numeric / 100 + 1e-6 then
      raise exception 'FALLO: la caja % devuelve % con tickets y % sin ellos: pasa de % puntos', c, round(100 * a.nuevo / pr, 3), round(100 * a.base / pr, 3), guarda->>'giro_extra_pts';
    end if;
    if a.nuevo - a.base > peor then peor := a.nuevo - a.base; peor_c := c; end if;
    ntot := ntot + 1;
  end loop;
  -- muchas batallas 3v3 de 10 rondas, la mitad Crazy, con las cajas mezcladas
  for k in 1..nbat loop
    ronda := array(select cajas[1 + ((k + g) % cardinality(cajas))] from generate_series(1, 10) g);
    bid := pg_temp.batalla(jug, '3v3', ronda, case when k % 2 = 0 then 'crazy' else 'normal' end);
    perform pg_temp.revisa(bid, null);
    ids := ids || bid;
  end loop;
  -- lo que ha salido contra lo que tenia que salir, caja a caja (cs_giro_ajuste: p_oro, sube, p_dia y lo que vale de media con tickets)
  with aj as materialized (select x.c, g.* from unnest(cajas) x(c), lateral cs_giro_ajuste(x.c) g),
       p as (select i.value, i.bonus, aj.* from cs_battle_drops d2 join cs_inv i on i.id = d2.inv_id join aj on aj.c = i.case_id where d2.battle_id = any(ids))
  select count(*)::int as n,
         count(*) filter (where bonus->>'tipo' = 'oro')::int as oros,
         count(*) filter (where bonus->>'tipo' = 'diamante')::int as dias,
         sum(p_oro) as e_oro, sum(p_oro * (1 - p_oro)) as v_oro,
         sum(p_dia) as e_dia, sum(p_dia * (1 - p_dia)) as v_dia,
         count(*) filter (where bonus->>'tipo' = 'oro' and bonus->>'lado' = 'medio')::int as medios,
         sum(sube) filter (where bonus->>'tipo' = 'oro') as e_medio, sum(sube * (1 - sube)) filter (where bonus->>'tipo' = 'oro') as v_medio,
         sum(value)::numeric as sale, sum(nuevo) as debe, sum(base) as sin_tk, sum(precio)::numeric as pagado, sum((value - nuevo) ^ 2) as v_val
    into st from p;
  if st.n <> nbat * 60 then raise exception 'FALLO: % batallas 3v3 de 10 rondas dan % piezas', nbat, st.n; end if;
  if abs(st.oros - st.e_oro) > 4 * sqrt(st.v_oro) + 2 then raise exception 'FALLO: en las batallas sale el Dorado % veces de % y se esperaban %', st.oros, st.n, round(st.e_oro, 1); end if;
  if abs(st.dias - st.e_dia) > 4 * sqrt(st.v_dia) + 2 then raise exception 'FALLO: en las batallas sale el Diamante % veces de % y se esperaban %', st.dias, st.n, round(st.e_dia, 2); end if;
  if st.oros > 0 and abs(st.medios - st.e_medio) > 4 * sqrt(coalesce(st.v_medio, 0)) + 2 then raise exception 'FALLO: de % Dorados % salen medianamente buenos y se esperaban %', st.oros, st.medios, round(st.e_medio, 1); end if;
  if abs(st.sale - st.debe) > 4 * sqrt(st.v_val) + 1 then
    raise exception 'FALLO: en las batallas sale de media % por apertura y con tickets tocaba % (sin ellos %)', round(st.sale / st.n, 1), round(st.debe / st.n, 1), round(st.sin_tk / st.n, 1);
  end if;
  -- cada pieza con ticket, de su monton
  perform pg_temp.mira(cs_inv_j(i), null) from cs_battle_drops d2 join cs_inv i on i.id = d2.inv_id where d2.battle_id = any(ids) and i.bonus is not null;
  resumen := resumen || format('Con los ajustes de verdad, %s batallas 3v3 de 10 rondas (%s aperturas): %s Dorados (se esperaban %s), %s de ellos medianamente buenos (se esperaban %s), %s Diamantes (se esperaban %s), todos de su monton. ',
    nbat, st.n, st.oros, round(st.e_oro, 1), st.medios, round(coalesce(st.e_medio, 0), 1), st.dias, round(st.e_dia, 2));
  resumen := resumen || format('Lo que devuelven esas batallas: %s %% (con tickets tocaba %s %%, sin ellos %s %%). %s cajas activas: ninguna sube mas de %s puntos con los tickets (la que mas, %s: %s). ',
    round(100 * st.sale / st.pagado, 1), round(100 * st.debe / st.pagado, 2), round(100 * st.sin_tk / st.pagado, 2), ntot, guarda->>'giro_extra_pts',
    (select name from cs_cases where id = peor_c), round(100 * peor / (select price from cs_cases where id = peor_c), 3));

  raise exception 'PRUEBA SUPERADA (no se ha guardado nada). %', resumen;
end $$;
