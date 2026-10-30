-- Septima parte (30-10): Cajas de CS2. Abrir cajas reales con V-Bucks, el inventario de skins de cada uno,
-- vender skins y batallas de cajas 1v1 y 2v2.
-- El azar y el dinero solo se mueven aqui dentro: el navegador pide "abre esta caja" y recibe lo que ha salido.
-- Orden: este fichero, despues 007b_cajas_datos.sql (cajas, skins y precios) y, si se quiere, 007_prueba.sql.
-- Se puede ejecutar varias veces.

-- ---------- movimientos nuevos del monedero ----------
-- caja: lo que cuesta abrir; venta: lo que te dan por una skin; batalla: entrar en una batalla (o lo devuelto si se cancela).
-- El check de ledger.kind NO se toca aqui: lo deja abierto db/009_tanda_ideas.sql (kind ~ '^[a-z_]{3,20}$'), que se carga antes que este.

-- ---------- tablas ----------
create table if not exists cs_items (
  id text primary key,                    -- id de ByMykel/CSGO-API ('skin-8d6879f0a2bc')
  name text not null,                     -- 'AK-47 | Redline', '★ Karambit | Doppler'
  phase text,                             -- fase de un Doppler ('Ruby', 'Phase 2'...)
  rarity text not null check (rarity in ('mil','res','cla','cov','esp')),   -- grado militar, restringido, clasificado, encubierto, especial (cuchillo o guantes)
  image text not null,                    -- ruta de la imagen en la CDN de Steam, sin el principio
  minf numeric, maxf numeric,             -- rango de float; null: sin desgaste (cuchillo sin pintura)
  st boolean not null default true,       -- puede salir StatTrak
  weight int not null default 100 check (weight > 0),   -- peso dentro de su rareza (las fases de un Doppler suman 100 entre todas)
  price int[] not null check (cardinality(price) = 10)  -- V-Bucks: RF CN AD BD D y lo mismo en StatTrak
);

create table if not exists cs_cases (
  id text primary key,                    -- 'crate-4904'
  name text not null,
  image text not null,
  price int not null check (price > 0),   -- V-Bucks por caja
  ev numeric(10,2),                       -- valor medio de lo que sale, en V-Bucks (informativo)
  sort int not null default 0,
  released date,
  active boolean not null default true
);

create table if not exists cs_case_items (
  case_id text not null references cs_cases on delete cascade,
  item_id text not null references cs_items on delete cascade,
  primary key (case_id, item_id)
);

create table if not exists cs_battles (
  id bigint generated always as identity primary key,
  mode text not null check (mode in ('1v1','2v2')),
  cases text[] not null check (cardinality(cases) between 1 and 10),   -- una caja por ronda, en orden
  cost int not null check (cost > 0),     -- lo que paga cada jugador
  status text not null default 'open' check (status in ('open','done','canceled')),
  created_by uuid not null references players on delete cascade,
  winner smallint check (winner in (0, 1)),                -- equipo ganador
  totals int[],                           -- valor sacado por cada equipo
  created_at timestamptz not null default now(),
  done_at timestamptz
);

create table if not exists cs_battle_seats (
  battle_id bigint not null references cs_battles on delete cascade,
  seat smallint not null check (seat between 0 and 3),     -- 1v1: 0 contra 1; 2v2: 0 y 1 contra 2 y 3
  player uuid not null references players on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (battle_id, seat),
  unique (battle_id, player)
);

create table if not exists cs_inv (
  id bigint generated always as identity primary key,
  player uuid not null references players on delete cascade,        -- de quien es ahora
  item_id text not null references cs_items,
  wear smallint check (wear between 0 and 4),                       -- 0 RF, 1 CN, 2 AD, 3 BD, 4 D; null sin desgaste
  fl numeric(8,6),                                                   -- float
  st boolean not null default false,                                 -- StatTrak
  value int not null check (value >= 1),                             -- lo que vale (y lo que te dan al venderla), en V-Bucks
  case_id text references cs_cases,
  battle_id bigint references cs_battles on delete set null,
  opened_by uuid references players on delete set null,              -- quien la abrio (en una batalla puede ser el rival)
  status text not null default 'own' check (status in ('own','sold')),
  created_at timestamptz not null default now(),
  sold_at timestamptz
);
create index if not exists cs_inv_player on cs_inv(player, status);
create index if not exists cs_inv_created on cs_inv(created_at desc);
create index if not exists cs_inv_battle on cs_inv(battle_id);

create table if not exists cs_battle_drops (
  battle_id bigint not null references cs_battles on delete cascade,
  ronda smallint not null,
  seat smallint not null,
  inv_id bigint not null references cs_inv on delete cascade,
  primary key (battle_id, ronda, seat)
);

-- ---------- lectura: solo jugadores; escribir, solo por las funciones ----------
alter table cs_items        enable row level security;
alter table cs_cases        enable row level security;
alter table cs_case_items   enable row level security;
alter table cs_battles      enable row level security;
alter table cs_battle_seats enable row level security;
alter table cs_inv          enable row level security;
alter table cs_battle_drops enable row level security;
drop policy if exists cs_items_read on cs_items;               create policy cs_items_read        on cs_items        for select to authenticated using (is_player());
drop policy if exists cs_cases_read on cs_cases;               create policy cs_cases_read        on cs_cases        for select to authenticated using (is_player());
drop policy if exists cs_case_items_read on cs_case_items;     create policy cs_case_items_read   on cs_case_items   for select to authenticated using (is_player());
drop policy if exists cs_battles_read on cs_battles;           create policy cs_battles_read      on cs_battles      for select to authenticated using (is_player());
drop policy if exists cs_battle_seats_read on cs_battle_seats; create policy cs_battle_seats_read on cs_battle_seats for select to authenticated using (is_player());
drop policy if exists cs_inv_read on cs_inv;                   create policy cs_inv_read          on cs_inv          for select to authenticated using (is_player());
drop policy if exists cs_battle_drops_read on cs_battle_drops; create policy cs_battle_drops_read on cs_battle_drops for select to authenticated using (is_player());

-- ---------- utilidades ----------
-- azar de verdad: 48 bits de un uuid aleatorio (gen_random_uuid usa el generador fuerte del sistema)
create or replace function cs_rand() returns double precision
language sql volatile as $$ select (('x' || substr(md5(gen_random_uuid()::text), 1, 12))::bit(48)::bigint / 281474976710656.0)::double precision $$;

create or replace function cs_wear_name(w int) returns text
language sql immutable as $$ select (array['Recién fabricado','Casi nuevo','Algo desgastado','Bastante desgastado','Deplorable'])[w + 1] $$;

create or replace function cs_inv_j(i cs_inv) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', i.id, 'player', i.player, 'item', i.item_id, 'wear', i.wear, 'float', i.fl, 'st', i.st,
    'value', i.value, 'status', i.status, 'case', i.case_id, 'battle', i.battle_id, 'by', i.opened_by, 'at', i.created_at)
$$;

create or replace function cs_battle_j(b cs_battles) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', b.id, 'mode', b.mode, 'cases', to_jsonb(b.cases), 'cost', b.cost, 'status', b.status,
    'by', b.created_by, 'winner', b.winner, 'totals', to_jsonb(b.totals), 'at', b.created_at, 'done_at', b.done_at,
    'seats', (select coalesce(jsonb_agg(jsonb_build_object('seat', s.seat, 'player', s.player) order by s.seat), '[]'::jsonb)
              from cs_battle_seats s where s.battle_id = b.id))
$$;

-- ---------- el azar: lo que sale de una caja ----------
-- 1. la rareza, con las probabilidades reales (de cada 10.000: 7.992, 1.598, 320, 64 y 26 el objeto especial);
--    si a una caja le falta alguna rareza, se reparte entre las que tiene
-- 2. una skin de esa rareza, todas igual de probables (las fases de un Doppler cuentan como una sola)
-- 3. el desgaste como en el juego: un tramo (3 % RF, 24 % CN, 33 % AD, 24 % BD, 16 % D) encajado en el rango de esa skin
-- 4. StatTrak el 10 % de las veces, si la skin lo admite
create or replace function cs_roll(p_case text, out o_item text, out o_wear smallint, out o_fl numeric, out o_st boolean, out o_value int)
language plpgsql volatile security definer set search_path = public as $$
declare
  pesos int[] := array[7992, 1598, 320, 64, 26];
  rar text[] := array['mil','res','cla','cov','esp'];
  hay text[];
  suma int := 0;
  tiro int;
  k int;
  grado text;
  x double precision;
  tramo int;
  it record;
begin
  select array_agg(distinct ci_it.rarity) into hay
    from cs_case_items ci join cs_items ci_it on ci_it.id = ci.item_id where ci.case_id = p_case;
  if hay is null then raise exception 'Esa caja está vacía'; end if;
  for k in 1..5 loop if rar[k] = any(hay) then suma := suma + pesos[k]; end if; end loop;
  tiro := floor(cs_rand() * suma)::int;
  for k in 1..5 loop
    if rar[k] = any(hay) then
      if tiro < pesos[k] then grado := rar[k]; exit; end if;
      tiro := tiro - pesos[k];
    end if;
  end loop;

  x := cs_rand();
  select q.* into it from (
    select t.id, t.minf, t.maxf, t.st, t.price,
           sum(t.weight) over (order by t.id) as acum, sum(t.weight) over () as total
    from cs_items t join cs_case_items ci on ci.item_id = t.id
    where ci.case_id = p_case and t.rarity = grado
  ) q where q.acum > x * q.total order by q.acum limit 1;

  if it.minf is null then
    o_wear := null; o_fl := null;
  else
    tramo := floor(cs_rand() * 100)::int;
    x := case when tramo < 3 then 0.07 * cs_rand()
              when tramo < 27 then 0.07 + 0.08 * cs_rand()
              when tramo < 60 then 0.15 + 0.23 * cs_rand()
              when tramo < 84 then 0.38 + 0.07 * cs_rand()
              else 0.45 + 0.55 * cs_rand() end;
    o_fl := round((it.minf + (it.maxf - it.minf) * x)::numeric, 6);
    o_wear := case when o_fl < 0.07 then 0 when o_fl < 0.15 then 1 when o_fl < 0.38 then 2 when o_fl < 0.45 then 3 else 4 end;
  end if;
  o_st := it.st and cs_rand() < 0.1;
  o_value := greatest(1, coalesce(it.price[1 + (case when o_st then 5 else 0 end) + coalesce(o_wear, 0)], 1));
  o_item := it.id;
end $$;

-- ---------- abrir cajas ----------
create or replace function cs_open(p_case text, p_n int default 1) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); caja cs_cases; bal int; precio int; d record; iid bigint; res jsonb := '[]'::jsonb;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  if p_n is null or p_n < 1 or p_n > 5 then raise exception 'Se abren de 1 a 5 cajas a la vez'; end if;
  select * into caja from cs_cases where id = p_case and active;
  if not found then raise exception 'Esa caja no existe'; end if;
  perform pay_week();
  perform pg_advisory_xact_lock(hashtext(me::text));      -- lo mismo que al apostar: dos gastos a la vez no se pisan
  select coalesce(sum(amount), 0) into bal from ledger where player = me;
  precio := caja.price * p_n;
  if precio > bal then raise exception 'No tienes saldo suficiente: te quedan %', fmt_int(bal); end if;
  insert into ledger(player, amount, kind, note)
    values (me, -precio, 'caja', caja.name || case when p_n > 1 then ' × ' || p_n else '' end);
  for k in 1..p_n loop
    select * into d from cs_roll(p_case);
    insert into cs_inv(player, item_id, wear, fl, st, value, case_id, opened_by)
      values (me, d.o_item, d.o_wear, d.o_fl, d.o_st, d.o_value, p_case, me) returning id into iid;
    res := res || jsonb_build_array((select cs_inv_j(i) from cs_inv i where i.id = iid));
  end loop;
  perform bump();
  return jsonb_build_object('items', res, 'saldo', bal - precio);
end $$;

-- ---------- vender ----------
-- Solo skins tuyas que sigan en el inventario: una vendida ya no esta, asi que no se puede vender dos veces.
create or replace function cs_sell(p_ids bigint[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); total int; cuantas int; una text;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'Elige qué skins vender'; end if;
  perform pg_advisory_xact_lock(hashtext(me::text));
  with v as (
    update cs_inv set status = 'sold', sold_at = now()
    where id = any(p_ids) and player = me and status = 'own'
    returning item_id, value, wear, st
  )
  select coalesce(sum(v.value), 0)::int, count(*)::int,
         min(case when v.st then 'StatTrak™ ' else '' end || it.name || coalesce(' ' || it.phase, '') || coalesce(' (' || cs_wear_name(v.wear) || ')', ''))
    into total, cuantas, una
    from v join cs_items it on it.id = v.item_id;
  if cuantas = 0 then raise exception 'Esas skins ya no están en tu inventario'; end if;
  insert into ledger(player, amount, kind, note) values (me, total, 'venta', case when cuantas = 1 then una else cuantas || ' skins' end);
  perform bump();
  return jsonb_build_object('vendidas', cuantas, 'total', total, 'saldo', (select coalesce(sum(amount), 0) from ledger where player = me));
end $$;

-- ---------- batallas ----------
-- Uno la crea eligiendo las cajas (una por ronda) y paga lo que cuestan; los demas se unen pagando lo mismo.
-- Cuando esta llena, el servidor abre todas las cajas: el lado que saque mas valor se lleva todas las skins.
create or replace function cs_battle_create(p_mode text, p_cases text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); precio int; validas int; bal int; bid bigint; rondas int := coalesce(cardinality(p_cases), 0);
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  if p_mode is null or p_mode not in ('1v1','2v2') then raise exception 'Elige 1v1 o 2v2'; end if;
  if rondas < 1 or rondas > 10 then raise exception 'Elige de 1 a 10 cajas'; end if;
  select coalesce(sum(c.price), 0)::int, count(c.id)::int into precio, validas
    from unnest(p_cases) u(cid) left join cs_cases c on c.id = u.cid and c.active;
  if validas <> rondas then raise exception 'Alguna de esas cajas no existe'; end if;
  perform pay_week();
  perform pg_advisory_xact_lock(hashtext(me::text));
  select coalesce(sum(amount), 0) into bal from ledger where player = me;
  if precio > bal then raise exception 'No tienes saldo suficiente: te quedan %', fmt_int(bal); end if;
  insert into cs_battles(mode, cases, cost, created_by) values (p_mode, p_cases, precio, me) returning id into bid;
  insert into cs_battle_seats(battle_id, seat, player) values (bid, 0, me);
  insert into ledger(player, amount, kind, note) values (me, -precio, 'batalla', 'Batalla ' || p_mode || ' #' || bid);
  insert into chat(body) values (pname(me) || ' abre una batalla ' || p_mode || ' de ' || rondas ||
    case when rondas = 1 then ' caja' else ' cajas' end || ' por ' || fmt_int(precio) || '. Únete en Cajas');
  perform bump();
  return jsonb_build_object('id', bid, 'saldo', bal - precio);
end $$;

-- abre todas las cajas de una batalla llena y le da las skins al lado ganador (solo la llaman las funciones de aqui)
create or replace function cs_battle_resolve(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare b cs_battles; tam int; mitad int; s record; d record; iid bigint; tot int[] := array[0, 0]; gana int; x record; quien uuid;
begin
  select * into b from cs_battles where id = p_id for update;
  if not found or b.status <> 'open' then return; end if;
  tam := case b.mode when '1v1' then 2 else 4 end;
  mitad := tam / 2;
  if (select count(*) from cs_battle_seats where battle_id = p_id) < tam then return; end if;
  -- cada ronda, cada sitio abre su caja; de momento se la queda quien la abre
  for r in 1..cardinality(b.cases) loop
    for s in select bs.seat, bs.player from cs_battle_seats bs where bs.battle_id = p_id order by bs.seat loop
      select * into d from cs_roll(b.cases[r]);
      insert into cs_inv(player, item_id, wear, fl, st, value, case_id, battle_id, opened_by)
        values (s.player, d.o_item, d.o_wear, d.o_fl, d.o_st, d.o_value, b.cases[r], p_id, s.player) returning id into iid;
      insert into cs_battle_drops(battle_id, ronda, seat, inv_id) values (p_id, r, s.seat, iid);
      tot[1 + s.seat / mitad] := tot[1 + s.seat / mitad] + d.o_value;
    end loop;
  end loop;
  -- gana el lado con mas valor; si empatan, a cara o cruz
  gana := case when tot[1] > tot[2] then 0 when tot[2] > tot[1] then 1 else floor(cs_rand() * 2)::int end;
  -- el lado ganador se lo lleva todo: cada ganador guarda lo que ha abierto y lo de los perdedores va,
  -- de la mas cara a la mas barata, al ganador que menos valor lleve (en 1v1, todo al que gana)
  for x in select d2.inv_id from cs_battle_drops d2 join cs_inv i on i.id = d2.inv_id
           where d2.battle_id = p_id and d2.seat / mitad <> gana order by i.value desc, i.id loop
    select bs.player into quien from cs_battle_seats bs
      where bs.battle_id = p_id and bs.seat / mitad = gana
      order by (select coalesce(sum(i2.value), 0) from cs_inv i2 where i2.battle_id = p_id and i2.player = bs.player), bs.seat
      limit 1;
    update cs_inv set player = quien where id = x.inv_id;
  end loop;
  update cs_battles set status = 'done', winner = gana, totals = tot, done_at = now() where id = p_id;
  insert into chat(body) values ('Batalla ' || b.mode || ' lista: ' ||
    (select string_agg(p.name, ' y ' order by bs.seat) from cs_battle_seats bs join players p on p.id = bs.player where bs.battle_id = p_id and bs.seat / mitad = 0) ||
    ' contra ' ||
    (select string_agg(p.name, ' y ' order by bs.seat) from cs_battle_seats bs join players p on p.id = bs.player where bs.battle_id = p_id and bs.seat / mitad = 1) ||
    '. Mírala en Cajas');
end $$;

create or replace function cs_battle_join(p_id bigint, p_seat int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); b cs_battles; tam int; sitio int; bal int; lleno boolean;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  select * into b from cs_battles where id = p_id for update;      -- dos que se unen a la vez van de uno en uno
  if not found or b.status <> 'open' then raise exception 'Esa batalla ya no está abierta'; end if;
  if exists (select 1 from cs_battle_seats where battle_id = p_id and player = me) then raise exception 'Ya estás en esta batalla'; end if;
  tam := case b.mode when '1v1' then 2 else 4 end;
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
  insert into ledger(player, amount, kind, note) values (me, -b.cost, 'batalla', 'Batalla ' || b.mode || ' #' || p_id);
  lleno := (select count(*) from cs_battle_seats where battle_id = p_id) >= tam;
  if lleno then perform cs_battle_resolve(p_id); end if;
  perform bump();
  return jsonb_build_object('id', p_id, 'done', lleno, 'saldo', bal - b.cost);
end $$;

-- cancela una batalla sin llenar y devuelve a cada uno lo que puso
create or replace function cs_battle_cancel(p_id bigint, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare b cs_battles;
begin
  select * into b from cs_battles where id = p_id for update;
  if not found or b.status <> 'open' then return; end if;
  insert into ledger(player, amount, kind, note)
    select bs.player, b.cost, 'batalla', p_note from cs_battle_seats bs where bs.battle_id = p_id;
  update cs_battles set status = 'canceled', done_at = now() where id = p_id;
end $$;

-- salir de una batalla que aun no ha empezado; si sale quien la creo, se cancela para todos
create or replace function cs_battle_leave(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); b cs_battles;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  select * into b from cs_battles where id = p_id for update;
  if not found or b.status <> 'open' then raise exception 'Esa batalla ya no está abierta'; end if;
  if not exists (select 1 from cs_battle_seats where battle_id = p_id and player = me) then raise exception 'No estás en esa batalla'; end if;
  if b.created_by = me then
    perform cs_battle_cancel(p_id, 'Batalla #' || p_id || ' cancelada');
  else
    delete from cs_battle_seats where battle_id = p_id and player = me;
    insert into ledger(player, amount, kind, note) values (me, b.cost, 'batalla', 'Sales de la batalla #' || p_id);
  end if;
  perform bump();
  return jsonb_build_object('devuelto', b.cost, 'saldo', (select coalesce(sum(amount), 0) from ledger where player = me));
end $$;

-- ---------- lo que lee la pantalla ----------
create or replace function cs_cases() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_player() then raise exception 'Tienes que entrar primero'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'image', c.image, 'price', c.price, 'ev', c.ev,
            'n', (select count(*) from cs_case_items ci where ci.case_id = c.id)) order by c.sort, c.name), '[]'::jsonb)
          from cs_cases c where c.active);
end $$;

create or replace function cs_case(p_case text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare caja cs_cases;
begin
  if not is_player() then raise exception 'Tienes que entrar primero'; end if;
  select * into caja from cs_cases where id = p_case;
  if not found then raise exception 'Esa caja no existe'; end if;
  return jsonb_build_object('id', caja.id, 'name', caja.name, 'image', caja.image, 'price', caja.price, 'ev', caja.ev, 'active', caja.active,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'phase', t.phase, 'rarity', t.rarity, 'image', t.image,
                'st', t.st, 'minf', t.minf, 'maxf', t.maxf, 'weight', t.weight, 'price', to_jsonb(t.price)) order by t.id), '[]'::jsonb)
              from cs_items t join cs_case_items ci on ci.item_id = t.id where ci.case_id = p_case));
end $$;

create or replace function cs_items_info(p_ids text[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_player() then raise exception 'Tienes que entrar primero'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'phase', t.phase, 'rarity', t.rarity, 'image', t.image, 'st', t.st)), '[]'::jsonb)
          from cs_items t where t.id = any(p_ids));
end $$;

-- inventario de un jugador (por defecto el tuyo), cuanto lleva cada uno, lo ultimo bueno que ha salido de una caja y las batallas
create or replace function cs_state(p_player uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); quien uuid := coalesce(p_player, auth.uid()); bx record;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  -- una batalla que lleva un dia sin llenarse se cancela y se devuelve lo puesto
  for bx in select cb.id from cs_battles cb where cb.status = 'open' and cb.created_at < now() - interval '24 hours' loop
    perform cs_battle_cancel(bx.id, 'Batalla #' || bx.id || ' sin llenar: se devuelve');
  end loop;
  return jsonb_build_object(
    'me', me,
    'who', quien,
    'players', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'n', coalesce(a.cuantas, 0), 'value', coalesce(a.valor, 0)) order by p.created_at), '[]'::jsonb)
                from players p
                left join (select ci.player, count(*) as cuantas, sum(ci.value) as valor from cs_inv ci where ci.status = 'own' group by ci.player) a on a.player = p.id),
    'inv', (select coalesce(jsonb_agg(cs_inv_j(i) order by i.value desc, i.id desc), '[]'::jsonb)
            from cs_inv i where i.player = quien and i.status = 'own'),
    'feed', (select coalesce(jsonb_agg(cs_inv_j(i) order by i.created_at desc, i.id desc), '[]'::jsonb)
             from cs_inv i where i.id in (select f.id from cs_inv f join cs_items t on t.id = f.item_id
                                          where t.rarity in ('cla','cov','esp') and f.battle_id is null
                                          order by f.created_at desc, f.id desc limit 12)),
    'battles', (select coalesce(jsonb_agg(cs_battle_j(bt) order by (bt.status = 'open') desc, bt.created_at desc), '[]'::jsonb)
                from cs_battles bt where bt.id in (select cb.id from cs_battles cb
                                                   where cb.status = 'open' or (cb.status = 'done' and cb.done_at > now() - interval '14 days')
                                                   order by cb.created_at desc limit 30))
  );
end $$;

-- una batalla con todo lo que salio en cada ronda (para verla)
create or replace function cs_battle(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b cs_battles;
begin
  if not is_player() then raise exception 'Tienes que entrar primero'; end if;
  select * into b from cs_battles where id = p_id;
  if not found then raise exception 'Esa batalla no existe'; end if;
  return cs_battle_j(b) || jsonb_build_object('drops',
    (select coalesce(jsonb_agg(jsonb_build_object('round', d2.ronda, 'seat', d2.seat, 'inv', cs_inv_j(i)) order by d2.ronda, d2.seat), '[]'::jsonb)
     from cs_battle_drops d2 join cs_inv i on i.id = d2.inv_id where d2.battle_id = p_id));
end $$;

-- ---------- quien puede llamar a que ----------
revoke all on function cs_rand(), cs_wear_name(int), cs_inv_j(cs_inv), cs_battle_j(cs_battles), cs_roll(text),
  cs_battle_resolve(bigint), cs_battle_cancel(bigint, text) from public, anon, authenticated;
revoke all on function cs_open(text, int), cs_sell(bigint[]), cs_battle_create(text, text[]), cs_battle_join(bigint, int),
  cs_battle_leave(bigint), cs_cases(), cs_case(text), cs_items_info(text[]), cs_state(uuid), cs_battle(bigint) from public, anon;
grant execute on function cs_open(text, int), cs_sell(bigint[]), cs_battle_create(text, text[]), cs_battle_join(bigint, int),
  cs_battle_leave(bigint), cs_cases(), cs_case(text), cs_items_info(text[]), cs_state(uuid), cs_battle(bigint) to authenticated;
