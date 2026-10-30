-- Vigesima parte (30-10): Mercado. Intercambios entre colegas, cosmeticos (marcos, fondos y objetos de coleccion), mercado pequeno,
-- contratos (trade up de CS2) y jackpot. Todo el azar y todo el dinero se mueven aqui dentro: el navegador pide y recibe.
-- Orden: despues de 007_cajas.sql, 012_cajas_mas.sql y 017_cajas_regalo.sql (y 009, que abre el check de ledger.kind).
-- Despues, 020b_cosmeticos_datos.sql (los objetos y las cajas de Cosmeticos) y, si se quiere, 020_prueba.sql (se deshace sola).
-- Se puede ejecutar varias veces.
--
-- Como se guarda lo que esta "en el aire": una pieza que esta puesta a la venta, en un trato o en el jackpot no se borra ni se mueve:
-- cambia su status de 'own' a 'mkt', 'trd' o 'jkp' (en deposito). Asi no sale en el inventario ni se puede vender con cs_sell, ni meter en otra cosa.
-- Si el trato se cancela o la venta se retira, vuelve a 'own'. Un contrato gasta las 10 piezas ('con'). Los V-Bucks de un trato o del jackpot
-- se cobran al ponerlos y se devuelven si no sale. Los movimientos del monedero son 'trato', 'mercado' y 'jackpot'.

-- ---------- permitir los estados nuevos de una pieza y la categoria nueva de caja ----------
do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'cs_inv'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%status%' loop
    execute format('alter table cs_inv drop constraint %I', c.conname);
  end loop;
end $$;
alter table cs_inv add constraint cs_inv_status_check check (status in ('own', 'sold', 'mkt', 'trd', 'jkp', 'con'));

alter table cs_cases drop constraint if exists cs_cases_cat_check;
alter table cs_cases add constraint cs_cases_cat_check check (cat in ('skins', 'lujo', 'cosmeticos'));

-- ---------- cosmeticos ----------
-- Cada objeto cosmetico es tambien una fila de cs_items (asi sale de las cajas, se ve en el inventario y se vende como todo lo demas).
-- Esta tabla dice de que tipo es: 'marco' (aro de la foto de perfil), 'fondo' (fondo de la app) u 'objeto' (de coleccion, solo se tiene).
-- clave: el nombre del estilo; la app sabe pintar cada clave (mercado.js).
create table if not exists cos_def (
  item_id text primary key references cs_items on delete cascade,
  tipo text not null check (tipo in ('marco', 'fondo', 'objeto')),
  clave text not null
);
-- lo que lleva puesto cada jugador: un marco y un fondo (la pieza concreta de su inventario)
create table if not exists cos_equip (
  player uuid primary key references players on delete cascade,
  marco_inv bigint references cs_inv on delete set null,
  fondo_inv bigint references cs_inv on delete set null,
  updated_at timestamptz not null default now()
);

-- ---------- intercambios, mercado, contratos y jackpot ----------
create table if not exists mk_tratos (
  id bigint generated always as identity primary key,
  de uuid not null references players on delete cascade,             -- quien propone
  para uuid not null references players on delete cascade,           -- a quien se lo propone
  da_inv bigint[] not null default '{}',                              -- piezas que ofrece (en deposito mientras el trato esta abierto)
  da_vb int not null default 0 check (da_vb >= 0),                    -- V-Bucks que ofrece (en deposito)
  pide_inv bigint[] not null default '{}',                            -- piezas que pide del otro
  pide_vb int not null default 0 check (pide_vb >= 0),               -- V-Bucks que pide
  nota text not null default '' check (char_length(nota) <= 140),
  status text not null default 'abierto' check (status in ('abierto', 'aceptado', 'rechazado', 'cancelado')),
  created_at timestamptz not null default now(),
  done_at timestamptz,
  check (de <> para),
  check (cardinality(da_inv) + cardinality(pide_inv) + da_vb + pide_vb > 0)
);
create index if not exists mk_tratos_de on mk_tratos(de, status);
create index if not exists mk_tratos_para on mk_tratos(para, status);

create table if not exists mk_ventas (
  id bigint generated always as identity primary key,
  vendedor uuid not null references players on delete cascade,
  inv_id bigint not null references cs_inv,
  precio int not null check (precio between 1 and 10000000),
  status text not null default 'abierta' check (status in ('abierta', 'vendida', 'retirada')),
  comprador uuid references players on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create unique index if not exists mk_ventas_una_abierta on mk_ventas(inv_id) where status = 'abierta';
create index if not exists mk_ventas_estado on mk_ventas(status, created_at desc);

create table if not exists mk_contratos (
  id bigint generated always as identity primary key,
  player uuid not null references players on delete cascade,
  entrada bigint[] not null,
  salida bigint not null references cs_inv,
  rareza text not null,                                               -- la rareza de lo que entro
  created_at timestamptz not null default now()
);

create table if not exists mk_jackpot (
  id bigint generated always as identity primary key,
  status text not null default 'abierto' check (status in ('abierto', 'hecho', 'cancelado')),
  created_at timestamptz not null default now(),
  closes_at timestamptz,                                              -- se pone cuando entra la segunda persona: 60 s desde ese momento
  total int not null default 0,
  winner uuid references players on delete set null,
  pos numeric(12, 10),                                                -- donde cayo el boleto, de 0 a 1 (la rueda se para ahi)
  done_at timestamptz
);
create table if not exists mk_jackpot_ent (
  id bigint generated always as identity primary key,
  jackpot_id bigint not null references mk_jackpot on delete cascade,
  player uuid not null references players on delete cascade,
  vb int not null default 0 check (vb >= 0),
  inv_ids bigint[] not null default '{}',
  valor int not null check (valor > 0),                               -- V-Bucks + valor de las piezas: lo que pesa en el sorteo
  created_at timestamptz not null default now()
);
create index if not exists mk_jackpot_ent_j on mk_jackpot_ent(jackpot_id);

-- ---------- lectura: solo jugadores; escribir, solo por las funciones ----------
alter table cos_def         enable row level security;
alter table cos_equip       enable row level security;
alter table mk_tratos       enable row level security;
alter table mk_ventas       enable row level security;
alter table mk_contratos    enable row level security;
alter table mk_jackpot      enable row level security;
alter table mk_jackpot_ent  enable row level security;
drop policy if exists cos_def_read on cos_def;               create policy cos_def_read        on cos_def        for select to authenticated using (is_player());
drop policy if exists cos_equip_read on cos_equip;           create policy cos_equip_read      on cos_equip      for select to authenticated using (is_player());
drop policy if exists mk_tratos_read on mk_tratos;           create policy mk_tratos_read      on mk_tratos      for select to authenticated using (is_player() and (de = auth.uid() or para = auth.uid()));
drop policy if exists mk_ventas_read on mk_ventas;           create policy mk_ventas_read      on mk_ventas      for select to authenticated using (is_player());
drop policy if exists mk_contratos_read on mk_contratos;     create policy mk_contratos_read   on mk_contratos   for select to authenticated using (is_player());
drop policy if exists mk_jackpot_read on mk_jackpot;         create policy mk_jackpot_read     on mk_jackpot     for select to authenticated using (is_player());
drop policy if exists mk_jackpot_ent_read on mk_jackpot_ent; create policy mk_jackpot_ent_read on mk_jackpot_ent for select to authenticated using (is_player());

-- ---------- utilidades ----------
-- una pieza con todo lo que hace falta para pintarla (nombre, rareza, imagen y, si es cosmetico, de que tipo)
create or replace function mk_inv_j(i cs_inv) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', i.id, 'player', i.player, 'item', i.item_id, 'name', t.name, 'phase', t.phase, 'rarity', t.rarity, 'image', t.image,
    'wear', i.wear, 'float', i.fl, 'st', i.st, 'value', i.value, 'status', i.status, 'case', i.case_id,
    'tipo', d.tipo, 'clave', d.clave)
  from cs_items t left join cos_def d on d.item_id = t.id where t.id = i.item_id
$$;

-- las piezas de una lista de ids, de la mas cara a la mas barata
create or replace function mk_invs_j(p_ids bigint[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(mk_inv_j(i) order by i.value desc, i.id), '[]'::jsonb) from cs_inv i where i.id = any(coalesce(p_ids, '{}'))
$$;

-- coge piezas de un jugador: pasan de 'own' a otro estado (deposito) y devuelve cuantas ha cogido. Si no son todas, el que llama aborta.
create or replace function mk_coge(p_ids bigint[], p_player uuid, p_estado text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update cs_inv set status = p_estado where id = any(p_ids) and player = p_player and status = 'own';
  get diagnostics n = row_count;
  return n;
end $$;

-- suelta piezas que estaban en deposito: pasan a 'own' de quien se diga
create or replace function mk_suelta(p_ids bigint[], p_a uuid, p_desde text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update cs_inv set player = p_a, status = 'own' where id = any(p_ids) and status = p_desde;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function mk_saldo(p uuid) returns int
language sql stable security definer set search_path = public as $$ select coalesce(sum(amount), 0)::int from ledger where player = p $$;

-- ids sin repetir, sin nulos, y como mucho p_max
create or replace function mk_ids(p_ids bigint[], p_max int) returns bigint[]
language plpgsql immutable as $$
declare r bigint[];
begin
  select coalesce(array_agg(distinct x order by x), '{}') into r from unnest(coalesce(p_ids, '{}')) x where x is not null;
  if cardinality(r) <> cardinality(coalesce(p_ids, '{}')) then raise exception 'Hay una pieza repetida'; end if;
  if cardinality(r) > p_max then raise exception 'Como mucho % piezas', p_max; end if;
  return r;
end $$;

-- "2 piezas y 500", "1 pieza", "500", "nada"
create or replace function mk_resumen(n int, vb int) returns text
language sql immutable as $$
  select coalesce(nullif(concat_ws(' y ', case when n = 1 then '1 pieza' when n > 1 then n || ' piezas' end, case when vb > 0 then fmt_int(vb) end), ''), 'nada')
$$;

-- dos jugadores a la vez, siempre en el mismo orden (asi dos tratos cruzados no se bloquean entre ellos)
create or replace function mk_bloquea2(a uuid, b uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if a::text < b::text then
    perform pg_advisory_xact_lock(hashtext(a::text)); perform pg_advisory_xact_lock(hashtext(b::text));
  else
    perform pg_advisory_xact_lock(hashtext(b::text)); perform pg_advisory_xact_lock(hashtext(a::text));
  end if;
end $$;

-- ---------- cosmeticos: ponerse un marco o un fondo ----------
-- p_inv null quita lo que llevabas de ese tipo. Solo se puede llevar una pieza tuya, que sigas teniendo (no en venta, ni en un trato).
create or replace function cos_equipar(p_tipo text, p_inv bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t text;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  if p_tipo is null or p_tipo not in ('marco', 'fondo') then raise exception 'Se lleva un marco o un fondo'; end if;
  perform pg_advisory_xact_lock(hashtext(me::text));
  if p_inv is not null then
    select d.tipo into t from cs_inv i join cos_def d on d.item_id = i.item_id where i.id = p_inv and i.player = me and i.status = 'own';
    if t is null then raise exception 'Eso no es tuyo, o no se puede llevar'; end if;
    if t <> p_tipo then raise exception 'Eso no es un %', p_tipo; end if;
  end if;
  insert into cos_equip(player) values (me) on conflict (player) do nothing;
  if p_tipo = 'marco' then update cos_equip set marco_inv = p_inv, updated_at = now() where player = me;
  else update cos_equip set fondo_inv = p_inv, updated_at = now() where player = me; end if;
  perform bump();
  return cos_equipados();
end $$;

-- lo que lleva puesto cada jugador (todos): la app lo usa para pintar los marcos y el fondo. Una pieza vendida, regalada o en un trato ya no cuenta.
create or replace function cos_equipados() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_player() then raise exception 'Tienes que entrar primero'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('player', p.id, 'marco', dm.clave, 'fondo', df.clave, 'marco_inv', im.id, 'fondo_inv', iff.id,
              'marco_item', im.item_id, 'fondo_item', iff.item_id) order by p.created_at), '[]'::jsonb)
          from players p
          left join cos_equip e on e.player = p.id
          left join cs_inv im on im.id = e.marco_inv and im.player = p.id and im.status = 'own'
          left join cos_def dm on dm.item_id = im.item_id and dm.tipo = 'marco'
          left join cs_inv iff on iff.id = e.fondo_inv and iff.player = p.id and iff.status = 'own'
          left join cos_def df on df.item_id = iff.item_id and df.tipo = 'fondo');
end $$;

-- mis cosmeticos (los que tengo) y lo que llevo puesto
create or replace function cos_estado() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  return jsonb_build_object('me', me, 'equipados', cos_equipados(),
    'mios', (select coalesce(jsonb_agg(mk_inv_j(i) order by i.value desc, i.id desc), '[]'::jsonb)
             from cs_inv i join cos_def d on d.item_id = i.item_id where i.player = me and i.status = 'own'));
end $$;

-- las piezas que tiene un jugador (por defecto yo), para elegir en un trato
create or replace function mk_inv(p_player uuid default null, p_lim int default 400) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare quien uuid := coalesce(p_player, auth.uid());
begin
  if auth.uid() is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  return (select coalesce(jsonb_agg(mk_inv_j(q) order by q.value desc, q.id desc), '[]'::jsonb)
          from (select * from cs_inv i where i.player = quien and i.status = 'own' order by i.value desc, i.id desc limit greatest(1, least(coalesce(p_lim, 400), 1000))) q);
end $$;

-- ---------- intercambios ----------
-- El que propone pone en deposito lo que ofrece (piezas y V-Bucks). El otro acepta o rechaza; si acepta, todo cambia de manos de golpe.
create or replace function mk_trato_crear(p_para uuid, p_da bigint[], p_da_vb int, p_pide bigint[], p_pide_vb int, p_nota text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); da bigint[]; pide bigint[]; bal int; tid bigint; avb int := coalesce(p_da_vb, 0); pvb int := coalesce(p_pide_vb, 0); n int;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  if p_para is null or p_para = me or not exists (select 1 from players where id = p_para) then raise exception 'Elige a un colega'; end if;
  if avb < 0 or pvb < 0 or avb > 10000000 or pvb > 10000000 then raise exception 'Esa cantidad de V-Bucks no vale'; end if;
  da := mk_ids(p_da, 10); pide := mk_ids(p_pide, 10);
  if cardinality(da) + cardinality(pide) + avb + pvb = 0 then raise exception 'Un trato vacío no sirve'; end if;
  perform pay_week();
  perform pg_advisory_xact_lock(hashtext(me::text));
  if (select count(*) from mk_tratos where de = me and status = 'abierto') >= 6 then raise exception 'Ya tienes 6 tratos abiertos: cancela alguno'; end if;
  if cardinality(pide) > 0 and (select count(*) from cs_inv where id = any(pide) and player = p_para and status = 'own') <> cardinality(pide) then
    raise exception 'Lo que pides ya no lo tiene';
  end if;
  bal := mk_saldo(me);
  if avb > bal then raise exception 'No tienes saldo suficiente: te quedan %', fmt_int(bal); end if;
  if mk_coge(da, me, 'trd') <> cardinality(da) then raise exception 'Alguna de tus piezas ya no está libre'; end if;
  insert into mk_tratos(de, para, da_inv, da_vb, pide_inv, pide_vb, nota) values (me, p_para, da, avb, pide, pvb, left(coalesce(p_nota, ''), 140)) returning id into tid;
  if avb > 0 then insert into ledger(player, amount, kind, note) values (me, -avb, 'trato', 'Trato #' || tid || ' (en depósito)'); end if;
  perform bump();
  return jsonb_build_object('id', tid, 'saldo', bal - avb);
end $$;

-- cierra un trato abierto sin que se cumpla: devuelve a quien propuso sus piezas y sus V-Bucks (solo la llaman las funciones de aqui)
create or replace function mk_trato_cierra(p_id bigint, p_nuevo text) returns void
language plpgsql security definer set search_path = public as $$
declare t mk_tratos;
begin
  select * into t from mk_tratos where id = p_id for update;
  if not found or t.status <> 'abierto' then return; end if;
  perform mk_suelta(t.da_inv, t.de, 'trd');
  if t.da_vb > 0 then insert into ledger(player, amount, kind, note) values (t.de, t.da_vb, 'trato', 'Trato #' || p_id || ' ' || p_nuevo || ': se devuelve'); end if;
  update mk_tratos set status = p_nuevo, done_at = now() where id = p_id;
end $$;

create or replace function mk_trato_cancelar(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t mk_tratos;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  select * into t from mk_tratos where id = p_id for update;
  if not found or t.de <> me then raise exception 'Ese trato no es tuyo'; end if;
  if t.status <> 'abierto' then raise exception 'Ese trato ya está cerrado'; end if;
  perform pg_advisory_xact_lock(hashtext(me::text));
  perform mk_trato_cierra(p_id, 'cancelado');
  perform bump();
  return jsonb_build_object('id', p_id, 'saldo', mk_saldo(me));
end $$;

create or replace function mk_trato_rechazar(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t mk_tratos;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  select * into t from mk_tratos where id = p_id for update;
  if not found or t.para <> me then raise exception 'Ese trato no es para ti'; end if;
  if t.status <> 'abierto' then raise exception 'Ese trato ya está cerrado'; end if;
  perform mk_bloquea2(t.de, me);
  perform mk_trato_cierra(p_id, 'rechazado');
  perform bump();
  return jsonb_build_object('id', p_id, 'saldo', mk_saldo(me));
end $$;

-- aceptar: comprueba que el otro sigue teniendo lo que ofrecio (esta en deposito) y que tu sigues teniendo lo que te piden y los V-Bucks;
-- si falla cualquier cosa se deshace todo y no cambia nada de dueno
create or replace function mk_trato_aceptar(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t mk_tratos; bal int;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  select * into t from mk_tratos where id = p_id for update;
  if not found or t.para <> me then raise exception 'Ese trato no es para ti'; end if;
  if t.status <> 'abierto' then raise exception 'Ese trato ya está cerrado'; end if;
  perform mk_bloquea2(t.de, me);
  if (select count(*) from cs_inv where id = any(t.da_inv) and player = t.de and status = 'trd') <> cardinality(t.da_inv) then
    raise exception 'Lo que ofrecía ya no está disponible';
  end if;
  bal := mk_saldo(me);
  if t.pide_vb > bal then raise exception 'No tienes saldo suficiente: te quedan %', fmt_int(bal); end if;
  if mk_coge(t.pide_inv, me, 'trd') <> cardinality(t.pide_inv) then raise exception 'Ya no tienes lo que te piden'; end if;
  -- cambio de manos
  if mk_suelta(t.da_inv, me, 'trd') <> cardinality(t.da_inv) then raise exception 'No se ha podido entregar lo ofrecido'; end if;
  if mk_suelta(t.pide_inv, t.de, 'trd') <> cardinality(t.pide_inv) then raise exception 'No se ha podido entregar lo pedido'; end if;
  if t.da_vb > 0 then insert into ledger(player, amount, kind, note) values (me, t.da_vb, 'trato', 'Trato #' || p_id || ' con ' || pname(t.de)); end if;
  if t.pide_vb > 0 then
    insert into ledger(player, amount, kind, note) values (me, -t.pide_vb, 'trato', 'Trato #' || p_id || ' con ' || pname(t.de));
    insert into ledger(player, amount, kind, note) values (t.de, t.pide_vb, 'trato', 'Trato #' || p_id || ' con ' || pname(me));
  end if;
  update mk_tratos set status = 'aceptado', done_at = now() where id = p_id;
  insert into chat(body) values (pname(t.de) || ' y ' || pname(me) || ' cierran un trato: ' || mk_resumen(cardinality(t.da_inv), t.da_vb) || ' por ' || mk_resumen(cardinality(t.pide_inv), t.pide_vb));
  perform bump();
  return jsonb_build_object('id', p_id, 'saldo', mk_saldo(me));
end $$;

-- ---------- mercado pequeno ----------
create or replace function mk_vender(p_inv bigint, p_precio int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); vid bigint;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  if p_inv is null then raise exception 'Elige qué poner a la venta'; end if;
  if p_precio is null or p_precio < 1 or p_precio > 10000000 then raise exception 'Pon un precio de 1 a 10.000.000'; end if;
  perform pg_advisory_xact_lock(hashtext(me::text));
  if (select count(*) from mk_ventas where vendedor = me and status = 'abierta') >= 12 then raise exception 'Ya tienes 12 cosas a la venta'; end if;
  if mk_coge(array[p_inv], me, 'mkt') <> 1 then raise exception 'Eso no es tuyo o ya no está libre'; end if;
  insert into mk_ventas(vendedor, inv_id, precio) values (me, p_inv, p_precio) returning id into vid;
  perform bump();
  return jsonb_build_object('id', vid);
end $$;

create or replace function mk_retirar(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v mk_ventas;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  select * into v from mk_ventas where id = p_id for update;
  if not found or v.vendedor <> me then raise exception 'Eso no es tuyo'; end if;
  if v.status <> 'abierta' then raise exception 'Eso ya no está a la venta'; end if;
  perform pg_advisory_xact_lock(hashtext(me::text));
  perform mk_suelta(array[v.inv_id], me, 'mkt');
  update mk_ventas set status = 'retirada', closed_at = now() where id = p_id;
  perform bump();
  return jsonb_build_object('id', p_id);
end $$;

-- comprar: la venta se bloquea mientras tanto, asi que dos que compran a la vez van de uno en uno y el segundo ya la ve vendida
create or replace function mk_comprar(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v mk_ventas; bal int; nom text;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  select * into v from mk_ventas where id = p_id for update;
  if not found then raise exception 'Eso no existe'; end if;
  if v.status <> 'abierta' then raise exception 'Eso ya se ha vendido o se ha retirado'; end if;
  if v.vendedor = me then raise exception 'Eso es tuyo: puedes retirarlo'; end if;
  perform mk_bloquea2(v.vendedor, me);
  perform pay_week();
  bal := mk_saldo(me);
  if v.precio > bal then raise exception 'No tienes saldo suficiente: te quedan %', fmt_int(bal); end if;
  if mk_suelta(array[v.inv_id], me, 'mkt') <> 1 then raise exception 'Esa pieza ya no está disponible'; end if;
  select t.name into nom from cs_inv i join cs_items t on t.id = i.item_id where i.id = v.inv_id;
  insert into ledger(player, amount, kind, note) values (me, -v.precio, 'mercado', 'Compra: ' || nom);
  insert into ledger(player, amount, kind, note) values (v.vendedor, v.precio, 'mercado', 'Venta: ' || nom || ' a ' || pname(me));
  update mk_ventas set status = 'vendida', comprador = me, closed_at = now() where id = p_id;
  insert into chat(body) values (pname(me) || ' compra ' || nom || ' a ' || pname(v.vendedor) || ' por ' || fmt_int(v.precio));
  perform bump();
  return jsonb_build_object('id', p_id, 'inv', v.inv_id, 'saldo', bal - v.precio);
end $$;

-- ---------- contratos: 10 piezas de la misma rareza -> 1 de la rareza siguiente ----------
-- Como en CS2: la pieza nueva sale de las mismas cajas que las que metes (cuantas mas metes de una caja, mas probable es esa caja),
-- el desgaste sale de la media del que tenian (en lo que lleva desgaste) y es StatTrak si las 10 lo eran. No se mezclan skins con lujo ni con cosmeticos.
create or replace function mk_contrato(p_ids bigint[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); ids bigint[]; rar text[] := array['mil', 'res', 'cla', 'cov', 'esp'];
  n int; nras int; nfam int; ras text; fam text; sig text; cid text; x double precision;
  it cs_items; a numeric; fl_n numeric; wear_n smallint; con_st boolean; val int; iid bigint; cnt int;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  ids := mk_ids(p_ids, 10);
  if cardinality(ids) <> 10 then raise exception 'Un contrato son exactamente 10 piezas'; end if;
  perform pg_advisory_xact_lock(hashtext(me::text));
  -- las 10 se gastan ya; si alguna no es tuya o no esta libre, no salen las 10 y se aborta
  update cs_inv set status = 'con', sold_at = now() where id = any(ids) and player = me and status = 'own';
  get diagnostics cnt = row_count;
  if cnt <> 10 then raise exception 'Alguna de esas piezas no es tuya o ya no está libre'; end if;
  select count(distinct t.rarity), min(t.rarity), count(distinct split_part(t.id, '-', 1)), min(split_part(t.id, '-', 1))
    into nras, ras, nfam, fam from cs_inv i join cs_items t on t.id = i.item_id where i.id = any(ids);
  if nras <> 1 then raise exception 'Tienen que ser las 10 de la misma rareza'; end if;
  if ras = 'esp' then raise exception 'Con lo especial no hay nada mejor'; end if;
  if nfam <> 1 then raise exception 'No se mezclan skins, lujo y cosméticos'; end if;
  sig := rar[array_position(rar, ras) + 1];

  -- la caja de la que sale: entre las de las piezas que metes, ponderada por cuantas eran de cada una
  x := cs_rand();
  select q.case_id into cid from (
    select w.case_id, sum(w.n) over (order by w.case_id) as acum, sum(w.n) over () as tot from (
      select ci.case_id, count(distinct i.id) as n
      from cs_inv i join cs_case_items ci on ci.item_id = i.item_id join cs_cases cc on cc.id = ci.case_id and cc.active
      where i.id = any(ids)
        and exists (select 1 from cs_case_items c2 join cs_items t2 on t2.id = c2.item_id where c2.case_id = ci.case_id and t2.rarity = sig and split_part(t2.id, '-', 1) = fam)
      group by ci.case_id) w
  ) q where q.acum > x * q.tot order by q.acum limit 1;
  if cid is null then
    select ci.case_id into cid from cs_case_items ci join cs_items t on t.id = ci.item_id join cs_cases cc on cc.id = ci.case_id and cc.active
      where t.rarity = sig and split_part(t.id, '-', 1) = fam order by cs_rand() limit 1;
  end if;
  if cid is null then raise exception 'No hay nada de la rareza siguiente para esas piezas'; end if;

  x := cs_rand();
  select q.* into it from (
    select t.*, sum(t.weight) over (order by t.id) as acum, sum(t.weight) over () as tot
    from cs_items t join cs_case_items ci on ci.item_id = t.id
    where ci.case_id = cid and t.rarity = sig and split_part(t.id, '-', 1) = fam
  ) q where q.acum > x * q.tot order by q.acum limit 1;

  if it.minf is null then
    fl_n := null; wear_n := null;
  else
    select avg((i.fl - t.minf) / nullif(t.maxf - t.minf, 0)) into a from cs_inv i join cs_items t on t.id = i.item_id where i.id = any(ids) and i.fl is not null and t.minf is not null;
    a := least(1, greatest(0, coalesce(a, cs_rand())));
    fl_n := round((it.minf + (it.maxf - it.minf) * a)::numeric, 6);
    wear_n := case when fl_n < 0.07 then 0 when fl_n < 0.15 then 1 when fl_n < 0.38 then 2 when fl_n < 0.45 then 3 else 4 end;
  end if;
  con_st := it.st and not exists (select 1 from cs_inv where id = any(ids) and not st);
  val := greatest(1, coalesce(it.price[1 + (case when con_st then 5 else 0 end) + coalesce(wear_n, 0)], 1));
  insert into cs_inv(player, item_id, wear, fl, st, value, case_id, opened_by)
    values (me, it.id, wear_n, fl_n, con_st, val, cid, me) returning id into iid;
  insert into mk_contratos(player, entrada, salida, rareza) values (me, ids, iid, ras);
  if sig in ('cov', 'esp') then
    insert into chat(body) values (pname(me) || ' firma un contrato y saca ' || it.name || ' (' || fmt_int(val) || ')');
  end if;
  perform bump();
  return jsonb_build_object('salida', (select mk_inv_j(i) from cs_inv i where i.id = iid), 'entrada', mk_invs_j(ids), 'rareza', ras, 'siguiente', sig);
end $$;

-- ---------- jackpot ----------
-- Una ronda abierta cada vez. Cada uno mete V-Bucks y/o piezas (su valor es lo que pesa). Cuando entra la segunda persona empiezan 60 s;
-- al acabar, el servidor saca un boleto al azar entre todo lo metido y el dueno de ese tramo se lo lleva todo.
-- Nadie lo cierra solo: se cierra la primera vez que alguien lo mira o lo toca despues de la hora (mk_estado, mk_jackpot_cerrar, mk_jackpot_entrar).
create or replace function mk_jackpot_j(j mk_jackpot) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', j.id, 'status', j.status, 'created_at', j.created_at, 'closes_at', j.closes_at, 'total', j.total,
    'winner', j.winner, 'pos', j.pos, 'done_at', j.done_at,
    'players', (select coalesce(jsonb_agg(jsonb_build_object('player', g.player, 'valor', g.valor, 'vb', g.vb, 'items', mk_invs_j(g.inv)) order by g.primero), '[]'::jsonb)
                from (select e.player, sum(e.valor)::int as valor, sum(e.vb)::int as vb, min(e.id) as primero,
                             (select coalesce(array_agg(x), '{}') from mk_jackpot_ent e2, unnest(e2.inv_ids) x where e2.jackpot_id = j.id and e2.player = e.player) as inv
                      from mk_jackpot_ent e where e.jackpot_id = j.id group by e.player) g))
$$;

-- repartir una ronda cuya hora ha pasado (solo la llaman las funciones de aqui; no hace nada si ya esta hecha o no ha llegado la hora)
create or replace function mk_jackpot_cierra(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare j mk_jackpot; tot int; tiro numeric; acum numeric := 0; gana uuid; g record; pozo int; items bigint[]; nom text;
begin
  perform pg_advisory_xact_lock(hashtext('mk_jackpot'));
  select * into j from mk_jackpot where id = p_id for update;
  if not found or j.status <> 'abierto' or j.closes_at is null or j.closes_at > now() then return; end if;
  select coalesce(sum(valor), 0)::int, coalesce(sum(vb), 0)::int into tot, pozo from mk_jackpot_ent where jackpot_id = p_id;
  if tot <= 0 or (select count(distinct player) from mk_jackpot_ent where jackpot_id = p_id) < 2 then
    perform mk_jackpot_devuelve(p_id);
    return;
  end if;
  tiro := cs_rand() * tot;
  for g in select e.player, sum(e.valor) as v from mk_jackpot_ent e where e.jackpot_id = p_id group by e.player order by min(e.id) loop
    acum := acum + g.v;
    if tiro < acum then gana := g.player; exit; end if;
  end loop;
  if gana is null then gana := (select player from mk_jackpot_ent where jackpot_id = p_id order by id desc limit 1); end if;
  select coalesce(array_agg(x), '{}') into items from mk_jackpot_ent e, unnest(e.inv_ids) x where e.jackpot_id = p_id;
  perform mk_suelta(items, gana, 'jkp');
  if pozo > 0 then insert into ledger(player, amount, kind, note) values (gana, pozo, 'jackpot', 'Jackpot #' || p_id || ': te lo llevas todo'); end if;
  update mk_jackpot set status = 'hecho', total = tot, winner = gana, pos = round((tiro / tot)::numeric, 10), done_at = now() where id = p_id;
  insert into chat(body) values ('Jackpot: ' || pname(gana) || ' se lleva ' || fmt_int(tot) || ' (' ||
    (select string_agg(pname(z.player) || ' ' || z.v, ', ' order by z.p) from (select e.player, sum(e.valor) v, min(e.id) p from mk_jackpot_ent e where e.jackpot_id = p_id group by e.player) z) || ')');
  perform bump();
end $$;

-- devuelve todo lo metido (sin hacer sorteo) y cancela la ronda
create or replace function mk_jackpot_devuelve(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare e record;
begin
  for e in select * from mk_jackpot_ent where jackpot_id = p_id order by id loop
    perform mk_suelta(e.inv_ids, e.player, 'jkp');
    if e.vb > 0 then insert into ledger(player, amount, kind, note) values (e.player, e.vb, 'jackpot', 'Jackpot #' || p_id || ' cancelado: se devuelve'); end if;
  end loop;
  update mk_jackpot set status = 'cancelado', done_at = now() where id = p_id;
end $$;

-- cierra lo que haya que cerrar: la ronda con la hora pasada, y una que lleva un dia con una sola persona se cancela y se devuelve
create or replace function mk_jackpot_limpia() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from mk_jackpot where status = 'abierto' and closes_at is not null and closes_at <= now() order by id loop
    perform mk_jackpot_cierra(r.id);
  end loop;
  for r in select id from mk_jackpot where status = 'abierto' and closes_at is null and created_at < now() - interval '24 hours' order by id loop
    perform pg_advisory_xact_lock(hashtext('mk_jackpot'));
    perform mk_jackpot_devuelve(r.id);
  end loop;
end $$;

create or replace function mk_jackpot_cerrar() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  perform mk_jackpot_limpia();
  return jsonb_build_object('jackpot', (select mk_jackpot_j(j) from mk_jackpot j where j.status = 'abierto' order by j.id desc limit 1),
                            'ultimo', (select mk_jackpot_j(j) from mk_jackpot j where j.status = 'hecho' order by j.id desc limit 1), 'now', now());
end $$;

-- meter V-Bucks y/o piezas. Devuelve 'cerrada' si la ronda acababa de cerrarse (no se cobra nada: se vuelve a intentar en la ronda nueva)
create or replace function mk_jackpot_entrar(p_vb int, p_inv bigint[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); vb int := coalesce(p_vb, 0); ids bigint[]; bal int; j mk_jackpot; vp int; valor int; jid bigint; quedan int;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  if vb < 0 or vb > 10000000 then raise exception 'Esa cantidad de V-Bucks no vale'; end if;
  ids := mk_ids(p_inv, 20);
  perform pay_week();
  perform pg_advisory_xact_lock(hashtext(me::text));
  perform pg_advisory_xact_lock(hashtext('mk_jackpot'));
  select * into j from mk_jackpot where status = 'abierto' order by id desc limit 1 for update;
  if found and j.closes_at is not null and j.closes_at <= now() then
    perform mk_jackpot_cierra(j.id);
    return jsonb_build_object('cerrada', true, 'saldo', mk_saldo(me));
  end if;
  perform mk_jackpot_limpia();
  select * into j from mk_jackpot where status = 'abierto' order by id desc limit 1 for update;
  if not found then insert into mk_jackpot default values returning * into j; end if;
  select coalesce(sum(value), 0)::int into vp from cs_inv where id = any(ids) and player = me and status = 'own';
  valor := vb + vp;
  if valor < 10 then raise exception 'Mete al menos 10 de valor'; end if;
  bal := mk_saldo(me);
  if vb > bal then raise exception 'No tienes saldo suficiente: te quedan %', fmt_int(bal); end if;
  if mk_coge(ids, me, 'jkp') <> cardinality(ids) then raise exception 'Alguna de esas piezas ya no está libre'; end if;
  insert into mk_jackpot_ent(jackpot_id, player, vb, inv_ids, valor) values (j.id, me, vb, ids, valor);
  if vb > 0 then insert into ledger(player, amount, kind, note) values (me, -vb, 'jackpot', 'Jackpot #' || j.id); end if;
  update mk_jackpot set total = total + valor where id = j.id;
  if j.closes_at is null and (select count(distinct player) from mk_jackpot_ent where jackpot_id = j.id) >= 2 then
    update mk_jackpot set closes_at = now() + interval '60 seconds' where id = j.id;
  end if;
  perform bump();
  return jsonb_build_object('id', j.id, 'valor', valor, 'saldo', bal - vb, 'jackpot', (select mk_jackpot_j(x) from mk_jackpot x where x.id = j.id));
end $$;

-- salir mientras eres el unico dentro (si ya hay alguien mas, no hay marcha atras)
create or replace function mk_jackpot_salir() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); j mk_jackpot;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  perform pg_advisory_xact_lock(hashtext(me::text));
  perform pg_advisory_xact_lock(hashtext('mk_jackpot'));
  select * into j from mk_jackpot where status = 'abierto' order by id desc limit 1 for update;
  if not found or not exists (select 1 from mk_jackpot_ent where jackpot_id = j.id and player = me) then raise exception 'No estás dentro'; end if;
  if exists (select 1 from mk_jackpot_ent where jackpot_id = j.id and player <> me) then raise exception 'Ya hay más gente: no se puede salir'; end if;
  perform mk_jackpot_devuelve(j.id);
  perform bump();
  return jsonb_build_object('saldo', mk_saldo(me));
end $$;

-- ---------- lo que lee la pantalla ----------
create or replace function mk_estado() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  perform mk_jackpot_limpia();
  return jsonb_build_object(
    'now', now(), 'me', me, 'saldo', mk_saldo(me),
    'tratos', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'de', t.de, 'para', t.para, 'da', mk_invs_j(t.da_inv), 'da_vb', t.da_vb,
                 'pide', mk_invs_j(t.pide_inv), 'pide_vb', t.pide_vb, 'nota', t.nota, 'status', t.status, 'at', t.created_at, 'done_at', t.done_at)
                 order by (t.status = 'abierto') desc, coalesce(t.done_at, t.created_at) desc), '[]'::jsonb)
               from mk_tratos t where t.id in (select z.id from mk_tratos z where (z.de = me or z.para = me)
                                               order by (z.status = 'abierto') desc, coalesce(z.done_at, z.created_at) desc limit 24)),
    'ventas', (select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'vendedor', v.vendedor, 'precio', v.precio, 'at', v.created_at, 'inv', (select mk_inv_j(i) from cs_inv i where i.id = v.inv_id))
                 order by v.created_at desc), '[]'::jsonb) from mk_ventas v where v.status = 'abierta'),
    'vendidas', (select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'vendedor', v.vendedor, 'comprador', v.comprador, 'precio', v.precio, 'at', v.closed_at,
                 'inv', (select mk_inv_j(i) from cs_inv i where i.id = v.inv_id)) order by v.closed_at desc), '[]'::jsonb)
                 from mk_ventas v where v.id in (select z.id from mk_ventas z where z.status = 'vendida' order by z.closed_at desc limit 8)),
    'contratos', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'player', c.player, 'rareza', c.rareza, 'at', c.created_at,
                 'salida', (select mk_inv_j(i) from cs_inv i where i.id = c.salida)) order by c.created_at desc), '[]'::jsonb)
                 from mk_contratos c where c.id in (select z.id from mk_contratos z order by z.created_at desc limit 8)),
    'jackpot', (select mk_jackpot_j(j) from mk_jackpot j where j.status = 'abierto' order by j.id desc limit 1),
    'ultimo', (select mk_jackpot_j(j) from mk_jackpot j where j.status = 'hecho' order by j.id desc limit 1),
    'equipados', cos_equipados()
  );
end $$;

-- ---------- quien puede llamar a que ----------
revoke all on function mk_inv_j(cs_inv), mk_invs_j(bigint[]), mk_coge(bigint[], uuid, text), mk_suelta(bigint[], uuid, text), mk_saldo(uuid), mk_ids(bigint[], int),
  mk_bloquea2(uuid, uuid), mk_resumen(int, int), mk_trato_cierra(bigint, text), mk_jackpot_j(mk_jackpot), mk_jackpot_cierra(bigint), mk_jackpot_devuelve(bigint), mk_jackpot_limpia()
  from public, anon, authenticated;
revoke all on function cos_equipar(text, bigint), cos_equipados(), cos_estado(), mk_inv(uuid, int), mk_trato_crear(uuid, bigint[], int, bigint[], int, text),
  mk_trato_cancelar(bigint), mk_trato_rechazar(bigint), mk_trato_aceptar(bigint), mk_vender(bigint, int), mk_retirar(bigint), mk_comprar(bigint),
  mk_contrato(bigint[]), mk_jackpot_cerrar(), mk_jackpot_entrar(int, bigint[]), mk_jackpot_salir(), mk_estado() from public, anon;
grant execute on function cos_equipar(text, bigint), cos_equipados(), cos_estado(), mk_inv(uuid, int), mk_trato_crear(uuid, bigint[], int, bigint[], int, text),
  mk_trato_cancelar(bigint), mk_trato_rechazar(bigint), mk_trato_aceptar(bigint), mk_vender(bigint, int), mk_retirar(bigint), mk_comprar(bigint),
  mk_contrato(bigint[]), mk_jackpot_cerrar(), mk_jackpot_entrar(int, bigint[]), mk_jackpot_salir(), mk_estado() to authenticated;
