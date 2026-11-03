-- 072 (03-11). Mas batallas de cajas. PM: "3, 4 y 6 jugadores todos contra todos, y por equipos 2v2v2 y 3v3; y un modo nuevo,
-- Crazy (gana el que menos valor saque), ademas del normal".
-- El formato sigue siendo el texto de siempre en cs_battles.mode: '1v1', '2v2' (como hasta ahora) y los nuevos '1v1v1', '1v1v1v1',
-- '1v1v1v1v1v1' (todos contra todos), '2v2v2' y '3v3'. Cada trozo separado por 'v' es un equipo y el numero es cuantos van en el:
-- 2v2v2 son 3 equipos de 2. Los sitios van de 0 a 5 y el equipo de un sitio es sitio / tamano del equipo (en 3v3: 0 1 2 contra 3 4 5).
-- Columna nueva cs_battles.regla: 'normal' (gana el equipo que mas valor saca, como siempre) o 'crazy' (gana el que MENOS saca).
-- winner es el numero del equipo ganador (0 a 5) y totals lleva un total por equipo. Empate: a suertes entre los empatados (cs_rand).
-- El equipo ganador se lo lleva todo, igual que antes: cada ganador guarda lo suyo y lo de los perdedores va, de lo mas caro a lo
-- mas barato, al ganador que menos valor lleve en ese momento.
-- cs_battle_create pasa a tener un tercer argumento opcional (p_regla, por defecto 'normal'). Se borra la de dos argumentos: con las
-- dos a la vez la llamada vieja de un navegador sin recargar (p_mode, p_cases) seria ambigua para PostgREST; asi sigue funcionando.
-- Nota del monedero: 'Batalla <formato> #id' y, en Crazy, 'Batalla <formato> Crazy #id'.
-- Las batallas viejas (1v1 y 2v2, sin regla) quedan como 'normal' y se ven igual.
-- Va despues de 007, 013 y 017 (y de 075 no: 075 va DESPUES de esta y repite el resolve con el Giro Dorado). Se puede ejecutar varias veces.

-- ---------- columnas y checks ----------
alter table cs_battles add column if not exists regla text not null default 'normal';

-- los checks viejos de mode, winner y seat se buscan por lo que dicen (sus nombres pueden ser otros) y se cambian por los nuevos
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'cs_battles'::regclass and contype = 'c'
             and (pg_get_constraintdef(oid) ~ '\mmode\M' or pg_get_constraintdef(oid) ~ '\mwinner\M' or pg_get_constraintdef(oid) ~ '\mregla\M') loop
    execute format('alter table cs_battles drop constraint %I', c.conname);
  end loop;
  for c in select conname from pg_constraint
           where conrelid = 'cs_battle_seats'::regclass and contype = 'c' and pg_get_constraintdef(oid) ~ '\mseat\M' loop
    execute format('alter table cs_battle_seats drop constraint %I', c.conname);
  end loop;
end $$;
alter table cs_battles add constraint cs_battles_mode_check check (mode in ('1v1','2v2','1v1v1','1v1v1v1','1v1v1v1v1v1','2v2v2','3v3'));
alter table cs_battles add constraint cs_battles_winner_check check (winner between 0 and 5);
alter table cs_battles add constraint cs_battles_regla_check check (regla in ('normal','crazy'));
alter table cs_battle_seats add constraint cs_battle_seats_seat_check check (seat between 0 and 5);

-- ---------- el formato ----------
-- cuantos equipos y cuantos en cada uno: '2v2v2' -> 3 equipos de 2; '1v1v1v1' -> 4 de 1
create or replace function cs_equipos(p_mode text) returns int
language sql immutable as $$ select cardinality(string_to_array(p_mode, 'v')) $$;
create or replace function cs_tam_equipo(p_mode text) returns int
language sql immutable as $$ select split_part(p_mode, 'v', 1)::int $$;
create or replace function cs_plazas(p_mode text) returns int
language sql immutable as $$ select cs_equipos(p_mode) * cs_tam_equipo(p_mode) $$;
create or replace function cs_modo_ok(p_mode text) returns boolean
language sql immutable as $$ select coalesce(p_mode in ('1v1','2v2','1v1v1','1v1v1v1','1v1v1v1v1v1','2v2v2','3v3'), false) $$;
-- lo que pone el monedero
create or replace function cs_battle_nota(b cs_battles) returns text
language sql immutable as $$ select 'Batalla ' || b.mode || case when b.regla = 'crazy' then ' Crazy' else '' end || ' #' || b.id $$;

-- ---------- crear ----------
drop function if exists cs_battle_create(text, text[]);
create or replace function cs_battle_create(p_mode text, p_cases text[], p_regla text default 'normal') returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); precio int; validas int; bal int; bid bigint; rondas int := coalesce(cardinality(p_cases), 0); b cs_battles;
  regla text := coalesce(nullif(lower(trim(p_regla)), ''), 'normal');
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  if not cs_modo_ok(p_mode) then raise exception 'Elige 1v1, 2v2, 3, 4 o 6 jugadores, 2v2v2 o 3v3'; end if;
  if regla not in ('normal', 'crazy') then raise exception 'Elige Normal o Crazy'; end if;
  if rondas < 1 or rondas > 10 then raise exception 'Elige de 1 a 10 cajas'; end if;
  select coalesce(sum(c.price), 0)::int, count(c.id)::int into precio, validas
    from unnest(p_cases) u(cid) left join cs_cases c on c.id = u.cid and c.active;
  if validas <> rondas then raise exception 'Alguna de esas cajas no existe'; end if;
  perform pay_week();
  perform pg_advisory_xact_lock(hashtext(me::text));
  select coalesce(sum(amount), 0) into bal from ledger where player = me;
  if precio > bal then raise exception 'No tienes saldo suficiente: te quedan %', fmt_int(bal); end if;
  insert into cs_battles(mode, cases, cost, created_by, regla) values (p_mode, p_cases, precio, me, regla) returning * into b;
  bid := b.id;
  insert into cs_battle_seats(battle_id, seat, player) values (bid, 0, me);
  insert into ledger(player, amount, kind, note) values (me, -precio, 'batalla', cs_battle_nota(b));
  perform bump();
  return jsonb_build_object('id', bid, 'saldo', bal - precio);
end $$;

-- ---------- abrir las cajas de una batalla llena ----------
-- (solo la llaman las funciones de aqui; 075 la vuelve a escribir igual con el Giro Dorado)
create or replace function cs_battle_resolve(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare b cs_battles; te int; ne int; s record; d record; iid bigint; tot int[]; mejor int; empatados int[]; gana int; x record; quien uuid;
begin
  select * into b from cs_battles where id = p_id for update;
  if not found or b.status <> 'open' then return; end if;
  te := cs_tam_equipo(b.mode); ne := cs_equipos(b.mode);
  if (select count(*) from cs_battle_seats where battle_id = p_id) < te * ne then return; end if;
  tot := array_fill(0, array[ne]);
  -- cada ronda, cada sitio abre su caja; de momento se la queda quien la abre
  for r in 1..cardinality(b.cases) loop
    for s in select bs.seat, bs.player from cs_battle_seats bs where bs.battle_id = p_id order by bs.seat loop
      select * into d from cs_roll(b.cases[r]);
      insert into cs_inv(player, item_id, wear, fl, st, value, case_id, battle_id, opened_by)
        values (s.player, d.o_item, d.o_wear, d.o_fl, d.o_st, d.o_value, b.cases[r], p_id, s.player) returning id into iid;
      insert into cs_battle_drops(battle_id, ronda, seat, inv_id) values (p_id, r, s.seat, iid);
      tot[1 + s.seat / te] := tot[1 + s.seat / te] + d.o_value;
    end loop;
  end loop;
  -- normal: gana el equipo con mas valor; crazy: el que menos. Si empatan, a suertes entre los empatados
  mejor := case when b.regla = 'crazy' then (select min(v) from unnest(tot) v) else (select max(v) from unnest(tot) v) end;
  empatados := array(select k - 1 from generate_subscripts(tot, 1) k where tot[k] = mejor order by k);
  gana := empatados[1 + least(cardinality(empatados) - 1, floor(cs_rand() * cardinality(empatados))::int)];
  -- el equipo ganador se lo lleva todo: cada ganador guarda lo que ha abierto y lo de los perdedores va,
  -- de la mas cara a la mas barata, al ganador que menos valor lleve (con un solo ganador, todo para el)
  for x in select d2.inv_id from cs_battle_drops d2 join cs_inv i on i.id = d2.inv_id
           where d2.battle_id = p_id and d2.seat / te <> gana order by i.value desc, i.id loop
    select bs.player into quien from cs_battle_seats bs
      where bs.battle_id = p_id and bs.seat / te = gana
      order by (select coalesce(sum(i2.value), 0) from cs_inv i2 where i2.battle_id = p_id and i2.player = bs.player), bs.seat
      limit 1;
    update cs_inv set player = quien where id = x.inv_id;
  end loop;
  update cs_battles set status = 'done', winner = gana, totals = tot, done_at = now() where id = p_id;
end $$;

-- ---------- unirse ----------
create or replace function cs_battle_join(p_id bigint, p_seat int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); b cs_battles; tam int; sitio int; bal int; lleno boolean;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  select * into b from cs_battles where id = p_id for update;      -- dos que se unen a la vez van de uno en uno
  if not found or b.status <> 'open' then raise exception 'Esa batalla ya no está abierta'; end if;
  if exists (select 1 from cs_battle_seats where battle_id = p_id and player = me) then raise exception 'Ya estás en esta batalla'; end if;
  tam := cs_plazas(b.mode);
  if p_seat is null then
    select min(g) into sitio from generate_series(0, tam - 1) g
      where not exists (select 1 from cs_battle_seats bs where bs.battle_id = p_id and bs.seat = g);
  else
    sitio := p_seat;
  end if;
  if sitio is null or sitio < 0 or sitio >= tam then raise exception 'Ese sitio no existe'; end if;
  if exists (select 1 from cs_battle_seats bs where bs.battle_id = p_id and bs.seat = sitio) then raise exception 'Ese sitio ya está cogido'; end if;
  perform pay_week();
  perform pg_advisory_xact_lock(hashtext(me::text));
  select coalesce(sum(amount), 0) into bal from ledger where player = me;
  if b.cost > bal then raise exception 'No tienes saldo suficiente: te quedan %', fmt_int(bal); end if;
  insert into cs_battle_seats(battle_id, seat, player) values (p_id, sitio, me);
  insert into ledger(player, amount, kind, note) values (me, -b.cost, 'batalla', cs_battle_nota(b));
  lleno := (select count(*) from cs_battle_seats where battle_id = p_id) >= tam;
  if lleno then perform cs_battle_resolve(p_id); end if;
  perform bump();
  return jsonb_build_object('id', p_id, 'done', lleno, 'saldo', bal - b.cost);
end $$;
-- salir y cancelar (cs_battle_leave y cs_battle_cancel de 007) no miran el tamano: valen tal cual para todos los formatos

-- ---------- lo que lee la pantalla: la regla ----------
create or replace function cs_battle_j(b cs_battles) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', b.id, 'mode', b.mode, 'regla', b.regla, 'cases', to_jsonb(b.cases), 'cost', b.cost, 'status', b.status,
    'by', b.created_by, 'winner', b.winner, 'totals', to_jsonb(b.totals), 'at', b.created_at, 'done_at', b.done_at,
    'seats', (select coalesce(jsonb_agg(jsonb_build_object('seat', s.seat, 'player', s.player) order by s.seat), '[]'::jsonb)
              from cs_battle_seats s where s.battle_id = b.id))
$$;

-- ---------- quien puede llamar a que ----------
revoke all on function cs_equipos(text), cs_tam_equipo(text), cs_plazas(text), cs_modo_ok(text), cs_battle_nota(cs_battles),
  cs_battle_resolve(bigint), cs_battle_j(cs_battles) from public, anon, authenticated;
revoke all on function cs_battle_create(text, text[], text), cs_battle_join(bigint, int) from public, anon;
grant execute on function cs_battle_create(text, text[], text), cs_battle_join(bigint, int) to authenticated;
