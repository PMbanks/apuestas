-- 073 (03-11). PM: Juegos nuevos. Cuatro cosas:
--   1) Plinko FUERA: sus funciones se borran (nadie puede jugarlo). La tabla jg_plinko y sus filas del ledger se quedan (historial).
--   2) Ruleta compartida: la misma ruleta de 15 casillas (0 verde x14, 1 a 7 rojo x2, 8 a 14 negro x2), ahora con su ronda para
--      todos: la abre la primera apuesta, 25 s para apostar (cualquiera entra), un solo giro de 8 s para todos a la hora del
--      servidor y se paga al acabar. El numero va cerrado con un hash (sha256 de "semilla:numero") que se ve desde que se abre la
--      ronda; la semilla sale al girar, asi cualquiera puede comprobar que no se cambio.
--   3) Minas: 5x5, de 1 a 24 minas. Las minas se deciden al empezar y quedan cerradas con su hash (sha256 de "semilla:casillas");
--      cada casilla se abre con una llamada a la base, asi que el navegador nunca sabe donde estan hasta que acaba la partida.
--      Multiplicador tras k casillas buenas = 0,97 x C(25,k) / C(25-minas,k) (3 % para la casa), tope x1000. Retirar cuando
--      quieras (con al menos una abierta); una mina pierde lo apostado. Si abres todas las buenas, cobra sola.
--   4) Carrera de caballos: 6 caballos por carrera con cuotas distintas. Ronda compartida: los caballos y sus cuotas se ven
--      antes de apostar; la primera apuesta abre 30 s para apostar y luego sale la carrera (16 s en pantalla, igual para todos).
--      El orden de llegada se decide al abrir la ronda (hash de "semilla:orden") y la probabilidad de ganar de cada caballo es la
--      que dice su cuota: cuota = 0,95 / p (5 % para la casa). Paga quien acierta el ganador: lo apostado x la cuota.
-- Rondas compartidas sin servidor propio, como el crash: avanzan cuando alguien mira (ruleta_estado, carrera_estado, jg_tick).
-- jg_pulso va por Supabase Realtime para que los demas se enteren al momento de cada apuesta y de cada salida.
-- Se puede ejecutar varias veces. Prueba: db/073_prueba.sql (se deshace sola, acaba en "PRUEBA SUPERADA").

-- ---------- pulso en directo de los juegos compartidos ----------
create table if not exists jg_pulso (
  juego text primary key,
  v bigint not null default 0,
  at timestamptz not null default now()
);
insert into jg_pulso(juego) values ('ruleta'), ('carrera') on conflict (juego) do nothing;
alter table jg_pulso enable row level security;
revoke all on jg_pulso from public, anon, authenticated;
grant select on jg_pulso to authenticated;
drop policy if exists jg_pulso_read on jg_pulso; create policy jg_pulso_read on jg_pulso for select to authenticated using (is_player());
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'jg_pulso') then
    alter publication supabase_realtime add table jg_pulso;
  end if;
end $$;
create or replace function jg_late(p text) returns void
language sql security definer set search_path = public as $$ update jg_pulso set v = v + 1, at = now() where juego = p $$;

-- hash de compromiso: sha256 en hexadecimal
create or replace function jg_hash(t text) returns text
language sql immutable as $$ select encode(sha256(convert_to(t, 'UTF8')), 'hex') $$;
create or replace function jg_semilla() returns text
language sql volatile as $$ select md5(gen_random_uuid()::text || clock_timestamp()::text) $$;

-- =====================================================================
-- 1) PLINKO FUERA
-- =====================================================================
drop function if exists plinko_soltar(int, text);
drop function if exists plinko_estado();
drop function if exists plinko_mults(text);

-- =====================================================================
-- 2) RULETA COMPARTIDA
-- =====================================================================
alter table jg_ruleta add column if not exists hash text;
alter table jg_ruleta add column if not exists semilla text;
alter table jg_ruleta add column if not exists gira_s int not null default 7;      -- las rondas viejas pagaban a los 7 s
alter table jg_ruleta_secreto add column if not exists semilla text;
alter table jg_ruleta_apuestas add column if not exists creada timestamptz not null default clock_timestamp();

create or replace function ruleta_t_apuestas() returns interval language sql immutable as $$ select interval '25 seconds' $$;

-- Pone al dia la ronda: al llegar la hora revela numero y semilla (empieza el giro para todos) y al acabar el giro paga.
create or replace function ruleta_cerrar(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare r jg_ruleta; s jg_ruleta_secreto; v_ahora timestamptz; b record; v_pago int;
begin
  select * into r from jg_ruleta where id = p_id;
  if r.id is null or r.estado = 'pagada' or jg_ahora() < r.cierra then return; end if;
  select * into r from jg_ruleta where id = p_id for update;
  v_ahora := jg_ahora();
  if r.estado = 'apuestas' and v_ahora >= r.cierra then
    select * into s from jg_ruleta_secreto where ronda = p_id;
    update jg_ruleta set estado = 'giro', n = s.n, color = jg_ruleta_color(s.n), semilla = s.semilla where id = p_id returning * into r;
    perform jg_late('ruleta');
  end if;
  if r.estado = 'giro' and v_ahora >= r.cierra + make_interval(secs => r.gira_s) then
    for b in select * from jg_ruleta_apuestas where ronda = p_id and color = r.color loop
      v_pago := (b.stake::bigint * case when r.color = 'verde' then 14 else 2 end)::int;
      update jg_ruleta_apuestas set pago = v_pago where id = b.id;
      perform jg_abonar(b.player, v_pago, 'ruleta', 'Ruleta: salió ' || r.n || ' ' || r.color);
      perform jg_grande(b.player, 'la ruleta', b.stake, v_pago);
    end loop;
    update jg_ruleta set estado = 'pagada' where id = p_id;
    perform jg_late('ruleta');
    perform bump();
  end if;
end $$;

create or replace function ruleta_apostar(p_color text, p_stake int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); r jg_ruleta; v_bal int; v_prev int; v_n int; v_sem text;
begin
  if p_color is null or p_color not in ('rojo','negro','verde') then raise exception 'Elige rojo, negro o verde'; end if;
  perform pay_week();
  perform pg_advisory_xact_lock(hashtext('jg_ruleta'));
  select * into r from jg_ruleta order by id desc limit 1;
  if r.id is not null and r.estado <> 'pagada' then
    perform ruleta_cerrar(r.id);
    select * into r from jg_ruleta where id = r.id for update;
  end if;
  if r.id is null or r.estado = 'pagada' then
    v_n := floor(jg_rand() * 15)::int; v_sem := jg_semilla();
    insert into jg_ruleta(cierra, gira_s, hash) values (jg_ahora() + ruleta_t_apuestas(), 8, jg_hash(v_sem || ':' || v_n)) returning * into r;
    insert into jg_ruleta_secreto(ronda, n, semilla) values (r.id, v_n, v_sem);
  elsif r.estado = 'giro' then
    raise exception 'La ruleta está girando: espera a que acabe';
  elsif jg_ahora() >= r.cierra then
    raise exception 'Apuestas cerradas';
  end if;
  select coalesce(sum(stake), 0) into v_prev from jg_ruleta_apuestas where ronda = r.id and player = me;
  if p_stake is not null and v_prev + p_stake > 100000 then raise exception 'Máximo 100.000 por ronda'; end if;
  v_bal := jg_cobrar(me, p_stake, 'ruleta', 'Ruleta: ' || p_color);
  insert into jg_ruleta_apuestas(ronda, player, color, stake) values (r.id, me, p_color, p_stake)
    on conflict (ronda, player, color) do update set stake = jg_ruleta_apuestas.stake + excluded.stake;
  perform jg_late('ruleta');
  return jsonb_build_object('ronda', r.id, 'cierra', r.cierra, 'saldo', v_bal);
end $$;

create or replace function ruleta_ronda_j(r jg_ruleta) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when r.id is null then null else jsonb_build_object('id', r.id, 'cierra', r.cierra, 'estado', r.estado, 'n', r.n, 'color', r.color,
    'hash', r.hash, 'semilla', r.semilla, 'gira_s', r.gira_s,
    'apuestas', (select coalesce(jsonb_agg(jsonb_build_object('player', a.player, 'color', a.color, 'stake', a.stake, 'pago', a.pago) order by a.id), '[]'::jsonb)
                 from jg_ruleta_apuestas a where a.ronda = r.id)) end
$$;

create or replace function ruleta_estado() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); r jg_ruleta; u jg_ruleta;
begin
  select * into r from jg_ruleta order by id desc limit 1;
  if r.id is not null and r.estado <> 'pagada' then
    perform ruleta_cerrar(r.id);
    select * into r from jg_ruleta where id = r.id;
  end if;
  select * into u from jg_ruleta where estado = 'pagada' and id < coalesce(r.id, 0) + case when r.estado = 'pagada' then 1 else 0 end order by id desc limit 1;
  return jsonb_build_object(
    'now', jg_ahora(), 'ventana', extract(epoch from ruleta_t_apuestas())::int,
    'ronda', ruleta_ronda_j(r),
    'ultima', case when u.id is null or u.id = r.id then null else ruleta_ronda_j(u) end,
    'apuestas', (select coalesce(jsonb_agg(jsonb_build_object('player', a.player, 'color', a.color, 'stake', a.stake, 'pago', a.pago) order by a.id), '[]'::jsonb)
                 from jg_ruleta_apuestas a where a.ronda = r.id),
    'historial', (select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'n', h.n) order by h.id desc), '[]'::jsonb)
                  from (select id, n from jg_ruleta where estado in ('giro','pagada') order by id desc limit 24) h),
    'cuenta', (select jsonb_build_object('rojo', count(*) filter (where color = 'rojo'), 'negro', count(*) filter (where color = 'negro'), 'verde', count(*) filter (where color = 'verde'))
               from (select color from jg_ruleta where estado in ('giro','pagada') order by id desc limit 100) c),
    'saldo', jg_saldo(me));
end $$;

-- =====================================================================
-- 3) MINAS
-- =====================================================================
create table if not exists jg_minas (
  id bigint generated always as identity primary key,
  player uuid not null references players on delete cascade,
  stake int not null check (stake between 1 and 100000),
  minas smallint not null check (minas between 1 and 24),
  abiertas smallint[] not null default '{}',                        -- casillas buenas abiertas, en orden
  estado text not null default 'curso' check (estado in ('curso','cobrada','perdida')),
  mult numeric(10,2) not null default 1,
  pago int not null default 0,
  boom smallint,                                                    -- la mina que se piso
  hash text not null,
  semilla text,                                                     -- null hasta que acaba
  mapa smallint[],                                                  -- null hasta que acaba
  creada timestamptz not null default clock_timestamp(),
  cerrada timestamptz
);
create unique index if not exists jg_minas_una on jg_minas(player) where estado = 'curso';
create index if not exists jg_minas_id on jg_minas(id desc);
create table if not exists jg_minas_secreto (                      -- SIN politica de lectura: nadie lo ve
  partida bigint primary key references jg_minas on delete cascade,
  mapa smallint[] not null,
  semilla text not null
);
alter table jg_minas enable row level security;
alter table jg_minas_secreto enable row level security;
revoke all on jg_minas, jg_minas_secreto from public, anon, authenticated;

-- multiplicador tras k casillas buenas con m minas: 0,97 x C(25,k) / C(25-m,k), en centimos hacia abajo, tope x1000
create or replace function minas_mult(p_minas int, p_k int) returns numeric
language plpgsql immutable as $$
declare v numeric := 1; i int;
begin
  if p_k is null or p_k <= 0 then return 1; end if;
  for i in 0 .. p_k - 1 loop v := v * (25 - i)::numeric / (25 - p_minas - i); end loop;
  return least(1000, floor(0.97 * v * 100) / 100)::numeric(10,2);
end $$;

create or replace function minas_vista(g jg_minas) returns jsonb
language sql stable as $$
  select case when g.id is null then null else jsonb_build_object('id', g.id, 'stake', g.stake, 'minas', g.minas, 'abiertas', to_jsonb(g.abiertas),
    'estado', g.estado, 'mult', g.mult, 'pago', g.pago, 'boom', g.boom, 'hash', g.hash, 'semilla', g.semilla, 'mapa', to_jsonb(g.mapa),
    'siguiente', case when g.estado = 'curso' and cardinality(g.abiertas) < 25 - g.minas then minas_mult(g.minas, cardinality(g.abiertas) + 1) end,
    'creada', g.creada, 'cerrada', g.cerrada) end
$$;

create or replace function minas_empezar(p_stake int, p_minas int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); v_bal int; v_mapa smallint[]; v_sem text; g jg_minas;
begin
  if p_minas is null or p_minas < 1 or p_minas > 24 then raise exception 'Elige de 1 a 24 minas'; end if;
  perform pg_advisory_xact_lock(hashtext('jg_minas' || me::text));
  if exists (select 1 from jg_minas where player = me and estado = 'curso') then raise exception 'Ya tienes una partida de minas en juego'; end if;
  perform pay_week();
  v_bal := jg_cobrar(me, p_stake, 'minas', 'Minas: ' || p_minas || case when p_minas = 1 then ' mina' else ' minas' end);
  select array_agg(c order by c) into v_mapa from (select g2::smallint as c from generate_series(0, 24) g2 order by jg_rand() limit p_minas) x;
  v_sem := jg_semilla();
  insert into jg_minas(player, stake, minas, hash) values (me, p_stake, p_minas, jg_hash(v_sem || ':' || array_to_string(v_mapa, ','))) returning * into g;
  insert into jg_minas_secreto(partida, mapa, semilla) values (g.id, v_mapa, v_sem);
  return jsonb_build_object('partida', minas_vista(g), 'saldo', v_bal);
end $$;

-- cierra la partida (cobrada o perdida) y ensena las minas y la semilla
create or replace function minas_fin(p_id bigint, p_estado text, p_boom smallint) returns jg_minas
language plpgsql security definer set search_path = public as $$
declare g jg_minas; s jg_minas_secreto; v_pago int := 0;
begin
  select * into g from jg_minas where id = p_id for update;
  select * into s from jg_minas_secreto where partida = p_id;
  if p_estado = 'cobrada' then
    v_pago := floor(g.stake * g.mult)::int;
    perform jg_abonar(g.player, v_pago, 'minas', 'Minas ×' || jg_x(g.mult) || ' (' || cardinality(g.abiertas) || ' de ' || (25 - g.minas) || ')');
    perform jg_grande(g.player, 'Minas', g.stake, v_pago);
  end if;
  update jg_minas set estado = p_estado, pago = v_pago, boom = p_boom, mapa = s.mapa, semilla = s.semilla, cerrada = jg_ahora()
   where id = p_id returning * into g;
  perform bump();
  return g;
end $$;

create or replace function minas_abrir(p_casilla int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); g jg_minas; s jg_minas_secreto; v_mina boolean;
begin
  if p_casilla is null or p_casilla < 0 or p_casilla > 24 then raise exception 'Esa casilla no existe'; end if;
  select * into g from jg_minas where player = me and estado = 'curso' for update;
  if g.id is null then raise exception 'No tienes ninguna partida de minas en juego'; end if;
  if p_casilla = any(g.abiertas) then raise exception 'Esa casilla ya está abierta'; end if;
  select * into s from jg_minas_secreto where partida = g.id;
  v_mina := p_casilla = any(s.mapa);
  if v_mina then
    g := minas_fin(g.id, 'perdida', p_casilla::smallint);
  else
    update jg_minas set abiertas = abiertas || p_casilla::smallint, mult = minas_mult(minas, cardinality(abiertas) + 1)
     where id = g.id returning * into g;
    if cardinality(g.abiertas) >= 25 - g.minas then g := minas_fin(g.id, 'cobrada', null); end if;   -- todas las buenas: cobra sola
  end if;
  return jsonb_build_object('mina', v_mina, 'partida', minas_vista(g), 'saldo', jg_saldo(me));
end $$;

create or replace function minas_cobrar() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); g jg_minas;
begin
  select * into g from jg_minas where player = me and estado = 'curso' for update;
  if g.id is null then raise exception 'No tienes ninguna partida de minas en juego'; end if;
  if cardinality(g.abiertas) < 1 then raise exception 'Abre al menos una casilla antes de retirarte'; end if;
  g := minas_fin(g.id, 'cobrada', null);
  return jsonb_build_object('partida', minas_vista(g), 'saldo', jg_saldo(me));
end $$;

create or replace function minas_estado() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); g jg_minas;
begin
  select * into g from jg_minas where player = me order by (estado = 'curso') desc, id desc limit 1;
  return jsonb_build_object(
    'now', jg_ahora(), 'casa', 0.97, 'tope', 1000,
    'partida', minas_vista(g),
    'recientes', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'player', x.player, 'stake', x.stake, 'minas', x.minas, 'n', cardinality(x.abiertas),
                     'estado', x.estado, 'mult', x.mult, 'pago', x.pago, 'cerrada', x.cerrada) order by x.id desc), '[]'::jsonb)
                  from (select * from jg_minas where estado <> 'curso' order by id desc limit 12) x),
    'saldo', jg_saldo(me));
end $$;

-- =====================================================================
-- 4) CARRERA DE CABALLOS
-- =====================================================================
create table if not exists jg_carrera (
  id bigint generated always as identity primary key,
  creada timestamptz not null default clock_timestamp(),
  cierra timestamptz,                                               -- null hasta la primera apuesta; despues, la salida
  estado text not null default 'espera' check (estado in ('espera','apuestas','corre','pagada')),
  caballos jsonb not null,                                          -- [{n (calle 1..6), nombre, color, color2, cuota}]
  hash text not null,
  orden smallint[],                                                 -- orden de llegada (calles), se ve al salir
  semilla text,                                                     -- se ve al salir (la animacion sale de aqui)
  corre_s int not null default 16
);
create unique index if not exists jg_carrera_una_viva on jg_carrera ((1)) where estado in ('espera','apuestas','corre');
create table if not exists jg_carrera_secreto (                     -- SIN politica de lectura
  ronda bigint primary key references jg_carrera on delete cascade,
  orden smallint[] not null,
  semilla text not null
);
create table if not exists jg_carrera_apuestas (
  id bigint generated always as identity primary key,
  ronda bigint not null references jg_carrera on delete cascade,
  player uuid not null references players on delete cascade,
  caballo smallint not null check (caballo between 1 and 8),
  stake int not null check (stake between 1 and 100000),
  cuota numeric(8,2) not null,
  pago int not null default 0,
  creada timestamptz not null default clock_timestamp(),
  unique (ronda, player, caballo)
);
alter table jg_carrera enable row level security;
alter table jg_carrera_secreto enable row level security;
alter table jg_carrera_apuestas enable row level security;
revoke all on jg_carrera, jg_carrera_secreto, jg_carrera_apuestas from public, anon, authenticated;

create or replace function carrera_t_apuestas() returns interval language sql immutable as $$ select interval '30 seconds' $$;

-- la cuadra: doce caballos con sus colores (chaquetilla y gorra); cada carrera salen seis
create or replace function carrera_cuadra() returns jsonb
language sql immutable as $$ select '[
  {"nombre":"Relámpago","color":"#f2c14e","color2":"#1d2129"},
  {"nombre":"Tormenta","color":"#4d88e6","color2":"#f4f2ec"},
  {"nombre":"Canela","color":"#e8853d","color2":"#5a2d12"},
  {"nombre":"Pólvora","color":"#e0574f","color2":"#1d2129"},
  {"nombre":"Trueno","color":"#9a7ce8","color2":"#f2c14e"},
  {"nombre":"Duquesa","color":"#cc6496","color2":"#f4f2ec"},
  {"nombre":"Cohete","color":"#2bd47d","color2":"#0f3d26"},
  {"nombre":"Bribón","color":"#a3c93a","color2":"#1d2129"},
  {"nombre":"Lucero","color":"#f4f2ec","color2":"#c4414c"},
  {"nombre":"Centella","color":"#3ec7d6","color2":"#123a40"},
  {"nombre":"Bandido","color":"#262a33","color2":"#f2c14e"},
  {"nombre":"Chispa","color":"#ff8fb1","color2":"#4d88e6"}
]'::jsonb $$;

-- una carrera nueva: seis caballos al azar, cada uno con su probabilidad (una plantilla de favorito a tapado, con ruido) y su
-- cuota = 0,95 / p; el orden de llegada sale ya (Plackett-Luce con esas probabilidades) y se cierra con su hash
create or replace function carrera_nueva() returns jg_carrera
language plpgsql security definer set search_path = public as $$
declare v_c jsonb := carrera_cuadra(); v_idx int[]; v_p numeric[] := '{}'; v_base numeric[] := array[0.30, 0.22, 0.17, 0.13, 0.10, 0.08];
        v_tot numeric := 0; i int; j int; v_cab jsonb := '[]'::jsonb; v_orden smallint[] := '{}'; v_rest numeric[]; v_x numeric; v_acc numeric;
        v_sem text; r jg_carrera; v_perm int[];
begin
  select array_agg(g order by jg_rand()) into v_idx from generate_series(0, 11) g;
  v_idx := v_idx[1:6];
  select array_agg(g order by jg_rand()) into v_perm from generate_series(1, 6) g;           -- que plantilla le toca a cada calle
  for i in 1 .. 6 loop v_p := v_p || (v_base[v_perm[i]] * (0.8 + 0.45 * jg_rand()::numeric)); v_tot := v_tot + v_p[i]; end loop;
  for i in 1 .. 6 loop v_p[i] := v_p[i] / v_tot; end loop;
  for i in 1 .. 6 loop
    v_cab := v_cab || jsonb_build_object('n', i, 'nombre', v_c->v_idx[i]->>'nombre', 'color', v_c->v_idx[i]->>'color', 'color2', v_c->v_idx[i]->>'color2',
                                         'cuota', greatest(1.05, floor(0.95 / v_p[i] * 100) / 100));
  end loop;
  -- llegada: se saca el primero con sus probabilidades, luego el segundo entre los que quedan, etc.
  v_rest := v_p;
  for j in 1 .. 6 loop
    v_tot := 0; for i in 1 .. 6 loop v_tot := v_tot + v_rest[i]; end loop;
    v_x := jg_rand()::numeric * v_tot; v_acc := 0;
    for i in 1 .. 6 loop
      if v_rest[i] > 0 then
        v_acc := v_acc + v_rest[i];
        if v_x < v_acc or (v_acc >= v_tot) then v_orden := v_orden || i::smallint; v_rest[i] := 0; exit; end if;
      end if;
    end loop;
  end loop;
  v_sem := jg_semilla();
  insert into jg_carrera(caballos, hash) values (v_cab, jg_hash(v_sem || ':' || array_to_string(v_orden, ','))) returning * into r;
  insert into jg_carrera_secreto(ronda, orden, semilla) values (r.id, v_orden, v_sem);
  return r;
end $$;

-- pone al dia la carrera viva: a la hora sale (se ve el orden y la semilla) y al acabar paga
create or replace function carrera_cerrar(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare r jg_carrera; s jg_carrera_secreto; v_ahora timestamptz; b record; v_pago int;
begin
  select * into r from jg_carrera where id = p_id;
  if r.id is null or r.estado in ('espera','pagada') or jg_ahora() < r.cierra then return; end if;
  select * into r from jg_carrera where id = p_id for update;
  v_ahora := jg_ahora();
  if r.estado = 'apuestas' and v_ahora >= r.cierra then
    select * into s from jg_carrera_secreto where ronda = p_id;
    update jg_carrera set estado = 'corre', orden = s.orden, semilla = s.semilla where id = p_id returning * into r;
    perform jg_late('carrera');
  end if;
  if r.estado = 'corre' and v_ahora >= r.cierra + make_interval(secs => r.corre_s) then
    for b in select * from jg_carrera_apuestas where ronda = p_id and caballo = r.orden[1] loop
      v_pago := floor(b.stake * b.cuota)::int;
      update jg_carrera_apuestas set pago = v_pago where id = b.id;
      perform jg_abonar(b.player, v_pago, 'carrera', 'Carrera: ganó ' || (r.caballos->(b.caballo - 1)->>'nombre') || ' ×' || jg_x(b.cuota));
      perform jg_grande(b.player, 'la carrera', b.stake, v_pago);
    end loop;
    update jg_carrera set estado = 'pagada' where id = p_id;
    perform jg_late('carrera');
    perform bump();
  end if;
end $$;

create or replace function carrera_tick() returns void
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  select id into v_id from jg_carrera where estado in ('apuestas','corre') order by id desc limit 1;
  if v_id is not null then perform carrera_cerrar(v_id); end if;
end $$;

create or replace function carrera_ronda_j(r jg_carrera) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when r.id is null then null else jsonb_build_object('id', r.id, 'estado', r.estado, 'cierra', r.cierra, 'caballos', r.caballos,
    'hash', r.hash, 'orden', to_jsonb(r.orden), 'semilla', r.semilla, 'corre_s', r.corre_s,
    'apuestas', (select coalesce(jsonb_agg(jsonb_build_object('player', a.player, 'caballo', a.caballo, 'stake', a.stake, 'cuota', a.cuota, 'pago', a.pago) order by a.id), '[]'::jsonb)
                 from jg_carrera_apuestas a where a.ronda = r.id)) end
$$;

create or replace function carrera_estado() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); r jg_carrera; u jg_carrera;
begin
  perform carrera_tick();
  select * into r from jg_carrera where estado in ('espera','apuestas','corre') order by id desc limit 1;
  if r.id is null then
    perform pg_advisory_xact_lock(hashtext('jg_carrera'));
    select * into r from jg_carrera where estado in ('espera','apuestas','corre') order by id desc limit 1;
    if r.id is null then r := carrera_nueva(); end if;
  end if;
  select * into u from jg_carrera where estado = 'pagada' order by id desc limit 1;
  return jsonb_build_object(
    'now', jg_ahora(), 'ventana', extract(epoch from carrera_t_apuestas())::int,
    'ronda', carrera_ronda_j(r),
    'ultima', carrera_ronda_j(u),
    'historial', (select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'caballo', h.caballos->(h.orden[1] - 1)) order by h.id desc), '[]'::jsonb)
                  from (select id, caballos, orden from jg_carrera where estado = 'pagada' order by id desc limit 12) h),
    'saldo', jg_saldo(me));
end $$;

create or replace function carrera_apostar(p_caballo int, p_stake int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); r jg_carrera; v_bal int; v_prev int; v_cuota numeric;
begin
  perform pay_week();
  perform pg_advisory_xact_lock(hashtext('jg_carrera'));
  perform carrera_tick();
  select * into r from jg_carrera where estado in ('espera','apuestas','corre') order by id desc limit 1 for update;
  if r.id is null then r := carrera_nueva(); end if;
  if r.estado = 'corre' then raise exception 'La carrera ya ha salido: espera a la siguiente'; end if;
  if r.estado = 'apuestas' and jg_ahora() >= r.cierra then raise exception 'Apuestas cerradas'; end if;
  if p_caballo is null or p_caballo < 1 or p_caballo > jsonb_array_length(r.caballos) then raise exception 'Elige un caballo'; end if;
  select coalesce(sum(stake), 0) into v_prev from jg_carrera_apuestas where ronda = r.id and player = me;
  if p_stake is not null and v_prev + p_stake > 100000 then raise exception 'Máximo 100.000 por carrera'; end if;
  v_cuota := (r.caballos->(p_caballo - 1)->>'cuota')::numeric;
  v_bal := jg_cobrar(me, p_stake, 'carrera', 'Carrera: a ' || (r.caballos->(p_caballo - 1)->>'nombre') || ' ×' || jg_x(v_cuota));
  if r.estado = 'espera' then
    update jg_carrera set estado = 'apuestas', cierra = jg_ahora() + carrera_t_apuestas() where id = r.id returning * into r;
  end if;
  insert into jg_carrera_apuestas(ronda, player, caballo, stake, cuota) values (r.id, me, p_caballo, p_stake, v_cuota)
    on conflict (ronda, player, caballo) do update set stake = jg_carrera_apuestas.stake + excluded.stake;
  perform jg_late('carrera');
  return jsonb_build_object('ronda', r.id, 'cierra', r.cierra, 'saldo', v_bal);
end $$;

-- =====================================================================
-- LO COMUN: tick, resumen del selector y ranking con los juegos nuevos
-- =====================================================================
create or replace function jg_tick() returns void
language plpgsql security definer set search_path = public as $$
declare v_id bigint; m record;
begin
  select id into v_id from jg_crash where estado = 'abierta' order by id desc limit 1;
  if v_id is not null then perform crash_cerrar(v_id); end if;
  select id into v_id from jg_ruleta where estado in ('apuestas','giro') order by id desc limit 1;
  if v_id is not null then perform ruleta_cerrar(v_id); end if;
  perform carrera_tick();
  for m in select * from jg_moneda where estado = 'abierto' and creado < jg_ahora() - interval '24 hours' for update loop
    update jg_moneda set estado = 'caducado', cerrado = jg_ahora() where id = m.id;
    perform jg_abonar(m.creador, m.stake, 'devolucion', 'Cara o cruz: nadie aceptó');
    perform bump();
  end loop;
end $$;

create or replace function jg_resumen() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); c jg_crash; ru jg_ruleta; ca jg_carrera;
begin
  perform jg_tick();
  select * into c from jg_crash order by id desc limit 1;
  select * into ru from jg_ruleta order by id desc limit 1;
  select * into ca from jg_carrera where estado in ('apuestas','corre') order by id desc limit 1;
  return jsonb_build_object(
    'now', jg_ahora(),
    'crash', case when c.id is null or c.estado = 'fin' then null else jsonb_build_object('id', c.id, 'arranca', c.arranca) end,
    'ruleta', case when ru.id is null or ru.estado = 'pagada' then null else jsonb_build_object('id', ru.id, 'estado', ru.estado, 'cierra', ru.cierra) end,
    'carrera', case when ca.id is null then null else jsonb_build_object('id', ca.id, 'estado', ca.estado, 'cierra', ca.cierra) end,
    'minas', exists (select 1 from jg_minas where player = me and estado = 'curso'),
    'moneda', (select count(*) from jg_moneda m where m.estado = 'abierto' and m.creador <> me and (m.para is null or m.para = me)),
    'bj', exists (select 1 from bjm_ronda where estado <> 'fin'),
    'saldo', jg_saldo(me));
end $$;

create or replace function jg_ranking(p_juego text, p_periodo text default 'siempre') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := jg_yo();
  v_desde timestamptz := case when p_periodo = 'semana' then (madrid_week()::timestamp at time zone 'Europe/Madrid') else '-infinity'::timestamptz end;
  v_out jsonb;
begin
  if p_juego is null or p_juego not in ('crash', 'blackjack', 'moneda', 'ruleta', 'minas', 'carrera') then raise exception 'Ese juego no tiene ranking'; end if;
  if p_periodo is null or p_periodo not in ('siempre', 'semana') then raise exception 'Elige siempre o semana'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('player', t.player, 'neto', t.neto, 'jugadas', t.n, 'mejor', t.mejor,
                                               'mayor', t.mayor, 'mayor_x', t.mayor_x) order by t.neto desc, t.n desc), '[]'::jsonb) into v_out
    from (
      select j.player, sum(j.g)::int as neto, count(*)::int as n,
             max(j.x) filter (where j.cobro) as mejor,
             greatest(max(j.g), 0)::int as mayor,
             case when max(j.g) > 0 then (array_agg(j.x order by j.g desc))[1] end as mayor_x
        from (
          select a.player, (a.pago - a.stake) as g, a.retiro as x, (a.estado = 'cobrada') as cobro
            from jg_crash_apuestas a where p_juego = 'crash' and a.estado in ('cobrada', 'perdida') and a.creada >= v_desde
          union all
          select h.player, (h.pago - h.total), case when h.pago > 0 then round(h.pago::numeric / h.total, 2) end, false
            from jg_bj h where p_juego = 'blackjack' and h.estado = 'fin' and h.cerrada >= v_desde
          union all
          select m.player, (m.pago - m.total), case when m.pago > 0 then round(m.pago::numeric / m.total, 2) end, false
            from bjm_mano m where p_juego = 'blackjack' and m.resultado is not null and m.cerrada >= v_desde
          union all
          select m.ganador, m.stake, 2::numeric, false from jg_moneda m where p_juego = 'moneda' and m.estado = 'hecho' and m.cerrado >= v_desde
          union all
          select case when m.ganador = m.creador then m.rival else m.creador end, -m.stake, null, false
            from jg_moneda m where p_juego = 'moneda' and m.estado = 'hecho' and m.cerrado >= v_desde
          union all
          select a.player, (a.pago - a.stake), case when a.pago > 0 then round(a.pago::numeric / a.stake, 2) end, false
            from jg_ruleta_apuestas a join jg_ruleta r on r.id = a.ronda where p_juego = 'ruleta' and r.estado = 'pagada' and r.creada >= v_desde
          union all
          select g.player, (g.pago - g.stake), case when g.pago > 0 then g.mult end, false
            from jg_minas g where p_juego = 'minas' and g.estado <> 'curso' and g.cerrada >= v_desde
          union all
          select a.player, (a.pago - a.stake), case when a.pago > 0 then a.cuota end, false
            from jg_carrera_apuestas a join jg_carrera r on r.id = a.ronda where p_juego = 'carrera' and r.estado = 'pagada' and r.creada >= v_desde
        ) j join players p on p.id = j.player
       group by j.player
    ) t;
  return v_out;
end $$;

-- ---------- quien puede llamar a que ----------
revoke all on function jg_late(text), jg_hash(text), jg_semilla(), ruleta_t_apuestas(), ruleta_cerrar(bigint), ruleta_ronda_j(jg_ruleta),
  minas_mult(int, int), minas_vista(jg_minas), minas_fin(bigint, text, smallint), carrera_t_apuestas(), carrera_cuadra(), carrera_nueva(),
  carrera_cerrar(bigint), carrera_tick(), carrera_ronda_j(jg_carrera), jg_tick() from public, anon, authenticated;
revoke all on function ruleta_apostar(text, int), ruleta_estado(), minas_empezar(int, int), minas_abrir(int), minas_cobrar(), minas_estado(),
  carrera_estado(), carrera_apostar(int, int), jg_resumen(), jg_ranking(text, text) from public, anon;
grant execute on function ruleta_apostar(text, int), ruleta_estado(), minas_empezar(int, int), minas_abrir(int), minas_cobrar(), minas_estado(),
  carrera_estado(), carrera_apostar(int, int), jg_resumen(), jg_ranking(text, text) to authenticated;
