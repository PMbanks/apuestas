-- Prueba de db/072_batallas_mas.sql, para el editor SQL de Supabase. Va DESPUES de 072 (y vale tambien con 073 cargada).
-- Con seis jugadores de verdad y un saldo de prueba enorme comprueba, en Normal y en Crazy, cada formato (1v1, 2v2, 3, 4 y 6 jugadores,
-- 2v2v2 y 3v3): crear cobra una vez y apunta "Batalla <formato> #id" (con Crazy si toca); unirse cobra lo mismo; un sitio fuera del
-- formato, uno ya cogido o meterse dos veces fallan; al llenarse se abren las cajas sola; hay un total por equipo que es la suma de
-- lo que saco cada uno; Normal la gana el equipo que mas saca y Crazy el que menos; todo lo de la batalla acaba en manos del equipo
-- ganador y vale lo mismo que la suma de los totales; nadie paga dos veces. Despues: formatos y reglas que no existen fallan, la llamada
-- vieja de dos argumentos (p_mode, p_cases) sigue funcionando y queda en Normal, salir devuelve lo puesto, cancelar devuelve a todos,
-- y con una caja de prueba de un solo objeto (todos empatan) el ganador sale a suertes entre los empatados.
-- Al final lanza un error A PROPOSITO para que se deshaga todo (no queda ni el saldo de prueba, ni batallas, ni objetos).
-- Si todo va bien, el error dice "PRUEBA SUPERADA" con el resumen; si no, "FALLO" y que ha fallado.

create or replace function pg_temp.yo(u uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  perform set_config('request.jwt.claims', json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
end $f$;

-- crea una batalla con el jugador 1 y la llena con los siguientes (cada uno en el primer sitio libre); devuelve su id
create or replace function pg_temp.llena(jug uuid[], p_mode text, p_cases text[], p_regla text) returns bigint language plpgsql as $f$
declare r jsonb; bid bigint; tam int := cs_plazas(p_mode); k int; fallo boolean;
begin
  perform pg_temp.yo(jug[1]);
  r := cs_battle_create(p_mode, p_cases, p_regla);
  bid := (r->>'id')::bigint;
  for k in 2..tam loop
    perform pg_temp.yo(jug[k]);
    if k = tam then
      -- antes de la ultima: un sitio que no existe y uno cogido fallan, y sigue abierta
      fallo := false; begin perform cs_battle_join(bid, tam); exception when others then fallo := true; end;
      if not fallo then raise exception 'FALLO: % : se ha podido entrar en el sitio % (no existe)', p_mode, tam; end if;
      fallo := false; begin perform cs_battle_join(bid, 0); exception when others then fallo := true; end;
      if not fallo then raise exception 'FALLO: % : se ha podido entrar en un sitio ya cogido', p_mode; end if;
      if (select status from cs_battles where id = bid) <> 'open' then raise exception 'FALLO: % se ha abierto sin llenarse', p_mode; end if;
      -- quien ya esta dentro no puede meterse otra vez
      perform pg_temp.yo(jug[1]);
      fallo := false; begin perform cs_battle_join(bid, null); exception when others then fallo := true; end;
      if not fallo then raise exception 'FALLO: % : el creador se ha podido sentar dos veces', p_mode; end if;
      perform pg_temp.yo(jug[k]);
    end if;
    r := cs_battle_join(bid, null);
    if (r->>'done')::boolean <> (k = tam) then raise exception 'FALLO: % : done=% con % de % jugadores', p_mode, r->>'done', k, tam; end if;
  end loop;
  return bid;
end $f$;

-- todo lo que tiene que cumplir una batalla terminada
create or replace function pg_temp.comprueba(bid bigint) returns text language plpgsql as $f$
declare b cs_battles; te int; ne int; tam int; t int; suma int; rondas int; n int; cobro int; s record;
begin
  select * into b from cs_battles where id = bid;
  te := cs_tam_equipo(b.mode); ne := cs_equipos(b.mode); tam := te * ne; rondas := cardinality(b.cases);
  if b.status <> 'done' then raise exception 'FALLO: % #%: no ha terminado (%)', b.mode, bid, b.status; end if;
  if (select count(*) from cs_battle_seats where battle_id = bid) <> tam then raise exception 'FALLO: % #%: no tiene % sitios', b.mode, bid, tam; end if;
  if exists (select 1 from cs_battle_seats where battle_id = bid and (seat < 0 or seat >= tam)) then raise exception 'FALLO: % #%: un sitio fuera del formato', b.mode, bid; end if;
  if cardinality(b.totals) <> ne then raise exception 'FALLO: % #%: % totales y son % equipos', b.mode, bid, cardinality(b.totals), ne; end if;
  if b.winner is null or b.winner < 0 or b.winner >= ne then raise exception 'FALLO: % #%: ganador % fuera de 0..%', b.mode, bid, b.winner, ne - 1; end if;
  if (select count(*) from cs_battle_drops where battle_id = bid) <> rondas * tam then raise exception 'FALLO: % #%: no hay un objeto por ronda y sitio', b.mode, bid; end if;
  -- el total de cada equipo es la suma de lo que saco cada uno de los suyos
  for t in 0..ne - 1 loop
    select coalesce(sum(i.value), 0) into suma from cs_battle_drops d join cs_inv i on i.id = d.inv_id where d.battle_id = bid and d.seat / te = t;
    if suma <> b.totals[t + 1] then raise exception 'FALLO: % #%: el equipo % saco % y su total dice %', b.mode, bid, t, suma, b.totals[t + 1]; end if;
  end loop;
  -- Normal: gana el que mas; Crazy: el que menos
  if b.regla = 'crazy' and b.totals[b.winner + 1] <> (select min(v) from unnest(b.totals) v) then raise exception 'FALLO: % Crazy #%: no ha ganado el que menos (% en %)', b.mode, bid, b.winner, b.totals; end if;
  if b.regla = 'normal' and b.totals[b.winner + 1] <> (select max(v) from unnest(b.totals) v) then raise exception 'FALLO: % #%: no ha ganado el que mas (% en %)', b.mode, bid, b.winner, b.totals; end if;
  -- todo lo de la batalla es del equipo ganador y vale lo que suman los totales
  if exists (select 1 from cs_battle_drops d join cs_inv i on i.id = d.inv_id
             where d.battle_id = bid and i.player not in (select bs.player from cs_battle_seats bs where bs.battle_id = bid and bs.seat / te = b.winner)) then
    raise exception 'FALLO: % #%: un objeto se ha quedado fuera del equipo ganador', b.mode, bid;
  end if;
  select coalesce(sum(i.value), 0) into suma from cs_inv i where i.battle_id = bid;
  if suma <> (select sum(v) from unnest(b.totals) v) then raise exception 'FALLO: % #%: los objetos valen % y los totales suman %', b.mode, bid, suma, (select sum(v) from unnest(b.totals) v); end if;
  -- cada uno ha pagado una vez, lo mismo, con la nota de la batalla
  for s in select bs.player from cs_battle_seats bs where bs.battle_id = bid loop
    select count(*), coalesce(sum(amount), 0) into n, cobro from ledger where player = s.player and kind = 'batalla' and note = cs_battle_nota(b);
    if n <> 1 or cobro <> -b.cost then raise exception 'FALLO: % #%: un jugador tiene % cobros que suman % (tenia que ser uno de %)', b.mode, bid, n, cobro, -b.cost; end if;
  end loop;
  return format('%s%s ganan %s (%s)', b.mode, case when b.regla = 'crazy' then ' Crazy' else '' end, b.winner, array_to_string(b.totals, '/'));
end $f$;

do $$
declare
  jug uuid[] := array(select id from players order by created_at, username);
  formatos text[] := array['1v1','2v2','1v1v1','1v1v1v1','1v1v1v1v1v1','2v2v2','3v3'];
  caja text; caja2 text; cajas text[]; m text; rg text; bid bigint; r jsonb; fallo boolean; resumen text := ''; lin text := '';
  s0 int; s1 int; b cs_battles; k int; gan int[]; n int; res text;
begin
  if cardinality(jug) < 6 then raise exception 'FALLO: hacen falta al menos seis jugadores (hay %)', cardinality(jug); end if;
  insert into ledger(player, amount, kind, note) select id, 500000000, 'ajuste', 'saldo de prueba 072' from players;
  select id into caja from cs_cases where active order by price, id limit 1;
  select id into caja2 from cs_cases where active and id <> caja order by price, id limit 1;
  cajas := array[caja, caja2];

  -- 1. cada formato, en Normal y en Crazy
  foreach rg in array array['normal', 'crazy'] loop
    foreach m in array formatos loop
      bid := pg_temp.llena(jug, m, cajas, rg);
      if (select regla from cs_battles where id = bid) <> rg then raise exception 'FALLO: % no ha guardado la regla %', m, rg; end if;
      res := pg_temp.comprueba(bid);
      lin := lin || res || '; ';
      -- meterse otra vez en una terminada falla
      perform pg_temp.yo(jug[1]);
      fallo := false; begin perform cs_battle_join(bid, null); exception when others then fallo := true; end;
      if not fallo then raise exception 'FALLO: % : se ha podido entrar en una batalla terminada', m; end if;
    end loop;
  end loop;
  resumen := resumen || '14 batallas (7 formatos en Normal y en Crazy) bien: ' || lin;

  -- 2. lo que no existe
  perform pg_temp.yo(jug[1]);
  foreach m in array array['2v1', '1v1v1v1v1', '4v4', '', '1v2'] loop
    fallo := false; begin perform cs_battle_create(m, cajas, 'normal'); exception when others then fallo := true; end;
    if not fallo then raise exception 'FALLO: se ha podido crear una batalla %', m; end if;
  end loop;
  fallo := false; begin perform cs_battle_create('1v1', cajas, 'loca'); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se ha podido crear una batalla con la regla loca'; end if;
  -- la llamada vieja (dos argumentos con nombre) sigue valiendo y queda Normal
  r := cs_battle_create(p_mode => '2v2', p_cases => cajas);
  bid := (r->>'id')::bigint;
  if (select regla from cs_battles where id = bid) <> 'normal' then raise exception 'FALLO: la llamada vieja no queda en Normal'; end if;
  if (select note from ledger where player = jug[1] and kind = 'batalla' order by id desc limit 1) <> 'Batalla 2v2 #' || bid then raise exception 'FALLO: la nota de una 2v2 normal no es la de siempre'; end if;
  if (select cs_battle_j(x)->>'regla' from cs_battles x where x.id = bid) <> 'normal' then raise exception 'FALLO: cs_battle_j no manda la regla'; end if;
  resumen := resumen || 'Formatos y reglas que no existen fallan; la llamada vieja crea una 2v2 Normal con la nota de siempre. ';

  -- 3. salir y cancelar devuelven: una de 6 en Crazy, entran dos, sale uno y la cancela quien la creo
  perform pg_temp.yo(jug[1]); r := cs_battle_create('1v1v1v1v1v1', cajas, 'crazy'); bid := (r->>'id')::bigint;
  select * into b from cs_battles where id = bid;
  if (select note from ledger where player = jug[1] and kind = 'batalla' order by id desc limit 1) <> 'Batalla 1v1v1v1v1v1 Crazy #' || bid then raise exception 'FALLO: la nota de una Crazy no lleva Crazy'; end if;
  perform pg_temp.yo(jug[2]); perform cs_battle_join(bid, 5);
  perform pg_temp.yo(jug[3]); perform cs_battle_join(bid, null);
  if (select seat from cs_battle_seats where battle_id = bid and player = jug[3]) <> 1 then raise exception 'FALLO: unirse sin sitio no coge el primero libre'; end if;
  s0 := (select coalesce(sum(amount), 0) from ledger where player = jug[2]);
  perform pg_temp.yo(jug[2]); r := cs_battle_leave(bid);
  if (select coalesce(sum(amount), 0) from ledger where player = jug[2]) <> s0 + b.cost then raise exception 'FALLO: salir no devuelve lo puesto'; end if;
  if exists (select 1 from cs_battle_seats where battle_id = bid and player = jug[2]) then raise exception 'FALLO: quien sale sigue sentado'; end if;
  perform pg_temp.yo(jug[1]); r := cs_battle_leave(bid);
  if (select status from cs_battles where id = bid) <> 'canceled' then raise exception 'FALLO: si sale quien la creo no se cancela'; end if;
  for k in 1..3 loop
    select coalesce(sum(amount), 0) into s1 from ledger where player = jug[k] and kind = 'batalla'
      and (note = cs_battle_nota(b) or note = 'Batalla #' || bid || ' cancelada' or note = 'Sales de la batalla #' || bid);
    if s1 <> 0 then raise exception 'FALLO: tras salir y cancelar, el jugador % ha perdido % en esa batalla', k, -s1; end if;
  end loop;
  resumen := resumen || 'Salir y cancelar devuelven lo puesto a todos. ';

  -- 4. empate: una caja de prueba de un solo objeto (todos sacan lo mismo): gana uno a suertes entre los empatados
  insert into cs_items(id, name, rarity, image, minf, maxf, st, weight, price) values ('prueba-072-x', 'Objeto de prueba 072', 'mil', 'x', null, null, false, 100, array[7,7,7,7,7,7,7,7,7,7]);
  insert into cs_cases(id, name, image, price, ev, sort, active) values ('prueba-072', 'Caja de prueba 072', 'x', 7, 7, 9999, true);
  insert into cs_case_items(case_id, item_id) values ('prueba-072', 'prueba-072-x');
  gan := array[0, 0, 0];
  for k in 1..60 loop
    bid := pg_temp.llena(jug, '1v1v1', array['prueba-072'], case when k % 2 = 0 then 'crazy' else 'normal' end);
    select * into b from cs_battles where id = bid;
    if b.totals <> array[7, 7, 7] then raise exception 'FALLO: en la caja de un objeto los totales son % (tenian que empatar a 7)', b.totals; end if;
    perform pg_temp.comprueba(bid);
    gan[b.winner + 1] := gan[b.winner + 1] + 1;
  end loop;
  -- cada uno de los tres tiene que ganar alguna (se esperan 20 de 60; menos de 6 seria muy raro)
  if gan[1] < 6 or gan[2] < 6 or gan[3] < 6 then raise exception 'FALLO: el desempate no va a suertes: ganan % / % / % de 60', gan[1], gan[2], gan[3]; end if;
  resumen := resumen || format('60 empates a tres: ganan %s, %s y %s (a suertes). ', gan[1], gan[2], gan[3]);

  raise exception 'PRUEBA SUPERADA (no se ha guardado nada). %', resumen;
end $$;
