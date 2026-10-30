-- Decima parte (30-10): Juegos. Cara o cruz 1 contra 1, Crash, Ruleta, Blackjack y Plinko, con V-Bucks.
-- El azar, las cartas, el punto de explosion y el dinero SOLO viven aqui dentro: el navegador pide "apuesto esto" o
-- "retiro ya" y la base decide. Nadie puede elegir el resultado, cobrar dos veces ni apostar mas de lo que tiene.
--
-- Antes de cargar esto: ledger.kind tiene que aceptar los tipos nuevos (check ~ '^[a-z_]{3,20}$', db/009). Aqui se usan
-- 'moneda', 'crash', 'ruleta', 'blackjack' y 'plinko' (y 'devolucion' para lo que se devuelve).
-- Se puede ejecutar varias veces. Prueba: db/010_prueba.sql (se deshace sola).
--
-- Rondas compartidas SIN servidor propio: avanzan "a demanda". Cada llamada de cualquier jugador a una funcion de estado
-- cierra primero lo que ya haya pasado segun el reloj de la base (jg_tick). Hasta que alguien mira, nada corre.
--   Crash : m(t) = e^(0,06 t), t en segundos desde que arranca. El punto de explosion va en jg_crash_secreto (sin permiso
--           de lectura para nadie) y solo se copia a la ronda cuando ya ha explotado. La retirada se valida con el reloj.
--   Ruleta: la ronda se abre con la primera apuesta y dura 20 s; el numero va en jg_ruleta_secreto hasta que se cierra.
--           Se cobra 7 s despues de cerrar (lo que dura el giro en pantalla).
--   Blackjack: el mazo y la carta tapada de la banca van en jg_bj_mazo (sin permiso de lectura).

-- ---------- tablas ----------
-- cara o cruz: uno reta (a un colega o a cualquiera) y pone su cantidad; el otro acepta poniendo lo mismo
create table if not exists jg_moneda (
  id bigint generated always as identity primary key,
  creador uuid not null references players on delete cascade,
  para uuid references players on delete cascade,                  -- null: lo puede aceptar cualquiera
  stake int not null check (stake between 1 and 100000),
  lado text not null check (lado in ('cara','cruz')),               -- el lado que elige quien reta
  estado text not null default 'abierto' check (estado in ('abierto','hecho','cancelado','caducado')),
  rival uuid references players on delete cascade,
  ganador uuid references players on delete cascade,
  salio text check (salio in ('cara','cruz')),
  creado timestamptz not null default clock_timestamp(),
  cerrado timestamptz
);
create index if not exists jg_moneda_estado on jg_moneda(estado, id);

-- crash
create table if not exists jg_crash (
  id bigint generated always as identity primary key,
  creada timestamptz not null default clock_timestamp(),
  arranca timestamptz not null,                                     -- antes: se apuesta; despues: sube el multiplicador
  estado text not null default 'abierta' check (estado in ('abierta','fin')),
  punto numeric(8,2),                                               -- null hasta que ha explotado
  fin_at timestamptz
);
create unique index if not exists jg_crash_una_abierta on jg_crash ((1)) where estado = 'abierta';
create table if not exists jg_crash_secreto (                       -- SIN politica de lectura: nadie lo ve
  ronda bigint primary key references jg_crash on delete cascade,
  punto numeric(8,2) not null
);
create table if not exists jg_crash_apuestas (
  ronda bigint not null references jg_crash on delete cascade,
  player uuid not null references players on delete cascade,
  stake int not null check (stake between 1 and 100000),
  auto numeric(8,2) check (auto is null or auto between 1.01 and 1000),   -- retirada automatica
  estado text not null default 'viva' check (estado in ('viva','cobrada','perdida')),
  retiro numeric(8,2),
  pago int not null default 0,
  creada timestamptz not null default clock_timestamp(),
  primary key (ronda, player)
);

-- ruleta de 15 casillas: 0 verde, 1 a 7 rojo, 8 a 14 negro
create table if not exists jg_ruleta (
  id bigint generated always as identity primary key,
  creada timestamptz not null default clock_timestamp(),
  cierra timestamptz not null,
  estado text not null default 'apuestas' check (estado in ('apuestas','giro','pagada')),
  n smallint check (n between 0 and 14),                            -- null hasta que se cierra
  color text check (color in ('rojo','negro','verde'))
);
create unique index if not exists jg_ruleta_una_viva on jg_ruleta ((1)) where estado in ('apuestas','giro');
create table if not exists jg_ruleta_secreto (                      -- SIN politica de lectura
  ronda bigint primary key references jg_ruleta on delete cascade,
  n smallint not null check (n between 0 and 14)
);
create table if not exists jg_ruleta_apuestas (
  id bigint generated always as identity primary key,
  ronda bigint not null references jg_ruleta on delete cascade,
  player uuid not null references players on delete cascade,
  color text not null check (color in ('rojo','negro','verde')),
  stake int not null check (stake between 1 and 100000),
  pago int not null default 0,
  unique (ronda, player, color)
);

-- blackjack: cartas 0 a 51 (valor mod 13: 0 as, 1 a 8 son 2 a 9, 9 a 12 son 10, J, Q, K)
create table if not exists jg_bj (
  id bigint generated always as identity primary key,
  player uuid not null references players on delete cascade,
  stake int not null check (stake between 1 and 100000),           -- la apuesta inicial
  total int not null,                                               -- lo puesto en total (el doble si se dobla)
  jugador smallint[] not null default '{}',
  banca smallint[] not null default '{}',                           -- mientras se juega, solo la carta que se ve
  estado text not null default 'curso' check (estado in ('curso','fin')),
  resultado text check (resultado in ('blackjack','gana','pierde','empate')),
  pago int not null default 0,
  doblada boolean not null default false,
  creada timestamptz not null default clock_timestamp(),
  cerrada timestamptz
);
create unique index if not exists jg_bj_una_en_curso on jg_bj(player) where estado = 'curso';
create index if not exists jg_bj_jugador on jg_bj(player, id);
create table if not exists jg_bj_mazo (                              -- SIN politica de lectura
  mano bigint primary key references jg_bj on delete cascade,
  mazo smallint[] not null,
  sig int not null,                                                 -- siguiente carta del mazo
  hueco smallint not null                                           -- la carta tapada de la banca
);

-- plinko
create table if not exists jg_plinko (
  id bigint generated always as identity primary key,
  player uuid not null references players on delete cascade,
  stake int not null check (stake between 1 and 100000),
  riesgo text not null check (riesgo in ('bajo','medio','alto')),
  camino text not null,                                             -- 12 pasos: 0 izquierda, 1 derecha
  k smallint not null,
  mult numeric(8,2) not null,
  pago int not null,
  creada timestamptz not null default clock_timestamp()
);
create index if not exists jg_plinko_id on jg_plinko(id desc);

-- ---------- permisos: leer solo lo que no es secreto; escribir, solo por las funciones ----------
alter table jg_moneda           enable row level security;
alter table jg_crash            enable row level security;
alter table jg_crash_secreto    enable row level security;
alter table jg_crash_apuestas   enable row level security;
alter table jg_ruleta           enable row level security;
alter table jg_ruleta_secreto   enable row level security;
alter table jg_ruleta_apuestas  enable row level security;
alter table jg_bj               enable row level security;
alter table jg_bj_mazo          enable row level security;
alter table jg_plinko           enable row level security;
revoke all on jg_moneda, jg_crash, jg_crash_secreto, jg_crash_apuestas, jg_ruleta, jg_ruleta_secreto, jg_ruleta_apuestas,
  jg_bj, jg_bj_mazo, jg_plinko from public, anon, authenticated;
grant select on jg_moneda, jg_crash, jg_ruleta, jg_ruleta_apuestas, jg_plinko to authenticated;
drop policy if exists jg_moneda_read on jg_moneda;                   create policy jg_moneda_read on jg_moneda for select to authenticated using (is_player());
drop policy if exists jg_crash_read on jg_crash;                     create policy jg_crash_read on jg_crash for select to authenticated using (is_player());
drop policy if exists jg_ruleta_read on jg_ruleta;                   create policy jg_ruleta_read on jg_ruleta for select to authenticated using (is_player());
drop policy if exists jg_ruleta_apuestas_read on jg_ruleta_apuestas; create policy jg_ruleta_apuestas_read on jg_ruleta_apuestas for select to authenticated using (is_player());
drop policy if exists jg_plinko_read on jg_plinko;                   create policy jg_plinko_read on jg_plinko for select to authenticated using (is_player());
-- Sin ninguna politica (nadie los lee directamente, solo las funciones): los dos secretos, jg_bj y jg_bj_mazo (la mano y el mazo)
-- y jg_crash_apuestas (lleva la retirada automatica de cada uno; crash_estado tapa la de los demas).

-- ---------- utilidades (internas: nadie de fuera las llama) ----------
create or replace function jg_ahora() returns timestamptz
language sql volatile as $$ select clock_timestamp() $$;

-- azar de verdad: 48 bits de un uuid aleatorio (gen_random_uuid usa el generador fuerte del sistema), entre 0 y 1
create or replace function jg_rand() returns double precision
language sql volatile as $$ select ('x' || substr(md5(gen_random_uuid()::text), 1, 12))::bit(48)::bigint / 281474976710656.0 $$;

create or replace function jg_yo() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or not exists (select 1 from players where id = me) then raise exception 'Tienes que entrar primero'; end if;
  return me;
end $$;

create or replace function jg_saldo(p uuid) returns int
language sql stable security definer set search_path = public as $$ select coalesce(sum(amount), 0)::int from ledger where player = p $$;

create or replace function jg_nombre(p uuid) returns text
language sql stable security definer set search_path = public as $$ select name from players where id = p $$;

-- multiplicador con coma: 3,20
create or replace function jg_x(m numeric) returns text
language sql immutable as $$ select replace(to_char(m, 'FM9999990.00'), '.', ',') $$;

-- cobra una apuesta: mismo cerrojo por jugador que place_bet, asi dos a la vez no se pisan ni se pasan del saldo
create or replace function jg_cobrar(p uuid, p_amt int, p_kind text, p_note text) returns int
language plpgsql security definer set search_path = public as $$
declare v_bal int;
begin
  if p_amt is null or p_amt < 1 then raise exception 'La apuesta mínima es 1'; end if;
  if p_amt > 100000 then raise exception 'La apuesta máxima es 100.000'; end if;
  perform pg_advisory_xact_lock(hashtext(p::text));
  select coalesce(sum(amount), 0) into v_bal from ledger where player = p;
  if p_amt > v_bal then raise exception 'No tienes saldo suficiente: te quedan %', fmt_int(v_bal); end if;
  insert into ledger(player, amount, kind, note) values (p, -p_amt, p_kind, p_note);
  return v_bal - p_amt;
end $$;

create or replace function jg_abonar(p uuid, p_amt int, p_kind text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_amt > 0 then insert into ledger(player, amount, kind, note) values (p, p_amt, p_kind, p_note); end if;
end $$;

-- avisa en el chat solo de premios gordos (diez veces lo apostado y al menos 2.000 limpios)
create or replace function jg_grande(p uuid, p_juego text, p_stake int, p_pago int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_stake > 0 and p_pago >= p_stake::bigint * 10 and p_pago - p_stake >= 2000 then
    insert into chat(body) values (jg_nombre(p) || ' ganó ' || fmt_int(p_pago) || ' en ' || p_juego || ' (×' || jg_x(p_pago::numeric / p_stake) || ')');
  end if;
end $$;

-- ---------- cara o cruz ----------
create or replace function moneda_crear(p_stake int, p_para uuid default null, p_lado text default 'cara') returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); v_id bigint; v_bal int;
begin
  if p_lado is null or p_lado not in ('cara','cruz') then raise exception 'Elige cara o cruz'; end if;
  if p_para is not null and (p_para = me or not exists (select 1 from players where id = p_para)) then raise exception 'Elige a un colega'; end if;
  if (select count(*) from jg_moneda where creador = me and estado = 'abierto') >= 5 then raise exception 'Ya tienes 5 retos abiertos: retira alguno'; end if;
  perform pay_week();
  v_bal := jg_cobrar(me, p_stake, 'moneda', 'Cara o cruz: ' || case when p_para is null then 'reto abierto' else 'reto a ' || jg_nombre(p_para) end);
  insert into jg_moneda(creador, para, stake, lado) values (me, p_para, p_stake, p_lado) returning id into v_id;
  insert into chat(body) values (jg_nombre(me) || ' reta ' || case when p_para is null then 'a quien quiera' else 'a ' || jg_nombre(p_para) end
    || ' a cara o cruz por ' || fmt_int(p_stake) || ' (él va a ' || p_lado || ')');
  perform bump();
  return jsonb_build_object('id', v_id, 'saldo', v_bal);
end $$;

create or replace function moneda_aceptar(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); m jg_moneda; v_sale text; v_gana uuid; v_bal int; v_premio int;
begin
  select * into m from jg_moneda where id = p_id for update;
  if m.id is null then raise exception 'Ese reto no existe'; end if;
  if m.estado <> 'abierto' then raise exception 'Ese reto ya no está abierto'; end if;
  if m.creador = me then raise exception 'No puedes aceptar tu propio reto'; end if;
  if m.para is not null and m.para <> me then raise exception 'Ese reto es para otro'; end if;
  perform pay_week();
  v_bal := jg_cobrar(me, m.stake, 'moneda', 'Cara o cruz contra ' || jg_nombre(m.creador));
  v_sale := case when jg_rand() < 0.5 then 'cara' else 'cruz' end;           -- la moneda
  v_gana := case when v_sale = m.lado then m.creador else me end;
  v_premio := m.stake * 2;
  perform jg_abonar(v_gana, v_premio, 'moneda', 'Cara o cruz: ganas contra ' || jg_nombre(case when v_gana = me then m.creador else me end));
  update jg_moneda set estado = 'hecho', rival = me, ganador = v_gana, salio = v_sale, cerrado = jg_ahora() where id = m.id;
  insert into chat(body) values ('Cara o cruz: salió ' || v_sale || ' y ' || jg_nombre(v_gana) || ' gana ' || fmt_int(v_premio)
    || ' a ' || jg_nombre(case when v_gana = me then m.creador else me end));
  perform bump();
  return jsonb_build_object('id', m.id, 'salio', v_sale, 'gane', v_gana = me, 'premio', v_premio, 'rival', m.creador,
                            'saldo', v_bal + case when v_gana = me then v_premio else 0 end);
end $$;

create or replace function moneda_cancelar(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); m jg_moneda;
begin
  select * into m from jg_moneda where id = p_id for update;
  if m.id is null or m.creador <> me then raise exception 'Ese reto no es tuyo'; end if;
  if m.estado <> 'abierto' then raise exception 'Ese reto ya no se puede retirar'; end if;
  update jg_moneda set estado = 'cancelado', cerrado = jg_ahora() where id = m.id;
  perform jg_abonar(me, m.stake, 'devolucion', 'Cara o cruz: reto retirado');
  perform bump();
  return jsonb_build_object('devuelto', m.stake, 'saldo', jg_saldo(me));
end $$;

-- ---------- crash ----------
-- punto de explosion: P(punto >= x) = 0,97 / x (el 3 % de ventaja de la casa), tope x1000. Sale 1,00 el 4 % de las veces.
create or replace function jg_crash_punto() returns numeric
language sql volatile as $$ select least(1000, greatest(1, floor(97 / (1 - jg_rand())) / 100))::numeric(8,2) $$;

-- multiplicador a los t segundos del arranque
create or replace function crash_mult(t double precision) returns numeric
language sql immutable as $$ select least(1000, floor(exp(0.06 * greatest(t, 0)) * 100) / 100)::numeric(8,2) $$;

-- Pone al dia una ronda: paga las retiradas automaticas que ya tocaban y, si ya ha explotado, la cierra.
create or replace function crash_cerrar(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare r jg_crash; v_sec numeric; v_ahora timestamptz; t double precision; v_tfin double precision; b record; v_pago int; v_cambio boolean := false;
begin
  select * into r from jg_crash where id = p_id;
  if r.id is null or r.estado <> 'abierta' or jg_ahora() < r.arranca then return; end if;
  select * into r from jg_crash where id = p_id for update;
  if r.estado <> 'abierta' then return; end if;
  v_ahora := jg_ahora();
  select punto into v_sec from jg_crash_secreto where ronda = p_id;
  t := extract(epoch from v_ahora - r.arranca);
  v_tfin := ln(v_sec::double precision) / 0.06;
  for b in select * from jg_crash_apuestas
           where ronda = p_id and estado = 'viva' and auto is not null and auto <= v_sec and ln(auto::double precision) / 0.06 <= t
           for update loop
    v_pago := floor(b.stake * b.auto)::int;
    update jg_crash_apuestas set estado = 'cobrada', retiro = b.auto, pago = v_pago where ronda = p_id and player = b.player;
    perform jg_abonar(b.player, v_pago, 'crash', 'Crash ×' || jg_x(b.auto) || ' (retirada automática)');
    perform jg_grande(b.player, 'Crash', b.stake, v_pago);
    v_cambio := true;
  end loop;
  if t >= v_tfin then
    update jg_crash set estado = 'fin', punto = v_sec, fin_at = r.arranca + (v_tfin * interval '1 second') where id = p_id;
    update jg_crash_apuestas set estado = 'perdida' where ronda = p_id and estado = 'viva';
    v_cambio := true;
  end if;
  if v_cambio then perform bump(); end if;
end $$;

-- Apostar: se apuesta antes de que arranque. La primera apuesta abre una ronda nueva (arranca 10 s despues).
create or replace function crash_apostar(p_stake int, p_auto numeric default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); r jg_crash; v_bal int;
begin
  if p_auto is not null and (p_auto < 1.01 or p_auto > 1000) then raise exception 'La retirada automática va de ×1,01 a ×1000'; end if;
  perform pay_week();
  perform pg_advisory_xact_lock(hashtext('jg_crash'));                -- una sola ronda abierta a la vez
  select * into r from jg_crash order by id desc limit 1;
  if r.id is not null and r.estado = 'abierta' then
    perform crash_cerrar(r.id);
    select * into r from jg_crash where id = r.id for update;         -- mientras apuesto nadie la puede cerrar
  end if;
  if r.id is null or r.estado <> 'abierta' then
    insert into jg_crash(arranca) values (jg_ahora() + interval '10 seconds') returning * into r;
    insert into jg_crash_secreto(ronda, punto) values (r.id, jg_crash_punto());
  elsif jg_ahora() >= r.arranca then
    raise exception 'La ronda ya ha arrancado: espera a la siguiente';
  end if;
  if exists (select 1 from jg_crash_apuestas where ronda = r.id and player = me) then raise exception 'Ya estás dentro de esta ronda'; end if;
  v_bal := jg_cobrar(me, p_stake, 'crash', 'Crash: apuesta');
  insert into jg_crash_apuestas(ronda, player, stake, auto) values (r.id, me, p_stake, p_auto);
  perform bump();
  return jsonb_build_object('ronda', r.id, 'arranca', r.arranca, 'saldo', v_bal);
end $$;

-- Retirar: cobras apuesta x multiplicador del momento, si la ronda no ha explotado todavia.
create or replace function crash_retirar() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); r jg_crash; b jg_crash_apuestas; v_m numeric; v_pago int; v_ahora timestamptz; v_sec numeric;
begin
  select * into r from jg_crash order by id desc limit 1;
  if r.id is null then raise exception 'No hay ninguna ronda'; end if;
  if r.estado = 'abierta' then
    perform crash_cerrar(r.id);
    select * into r from jg_crash where id = r.id for update;
  end if;
  select * into b from jg_crash_apuestas where ronda = r.id and player = me for update;
  if b.player is null then raise exception 'No estás en esta ronda'; end if;
  if b.estado = 'cobrada' then
    return jsonb_build_object('ok', true, 'retiro', b.retiro, 'pago', b.pago, 'saldo', jg_saldo(me));
  end if;
  if b.estado = 'perdida' then
    return jsonb_build_object('ok', false, 'tarde', true, 'punto', r.punto, 'saldo', jg_saldo(me));
  end if;
  v_ahora := jg_ahora();
  if v_ahora < r.arranca then raise exception 'La ronda aún no ha arrancado'; end if;
  select punto into v_sec from jg_crash_secreto where ronda = r.id;
  if extract(epoch from v_ahora - r.arranca) >= ln(v_sec::double precision) / 0.06 then
    perform crash_cerrar(r.id);                                       -- ya habia explotado: se cierra y llegas tarde
    select * into r from jg_crash where id = r.id;
    return jsonb_build_object('ok', false, 'tarde', true, 'punto', r.punto, 'saldo', jg_saldo(me));
  end if;
  v_m := crash_mult(extract(epoch from v_ahora - r.arranca));
  v_pago := floor(b.stake * v_m)::int;
  update jg_crash_apuestas set estado = 'cobrada', retiro = v_m, pago = v_pago where ronda = r.id and player = me;
  perform jg_abonar(me, v_pago, 'crash', 'Crash ×' || jg_x(v_m));
  perform jg_grande(me, 'Crash', b.stake, v_pago);
  perform bump();
  return jsonb_build_object('ok', true, 'retiro', v_m, 'pago', v_pago, 'saldo', jg_saldo(me));
end $$;

create or replace function crash_estado() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); r jg_crash;
begin
  select * into r from jg_crash order by id desc limit 1;
  if r.id is not null and r.estado = 'abierta' then
    perform crash_cerrar(r.id);
    select * into r from jg_crash where id = r.id;
  end if;
  return jsonb_build_object(
    'now', jg_ahora(), 'k', 0.06,
    'ronda', case when r.id is null then null else jsonb_build_object('id', r.id, 'arranca', r.arranca, 'estado', r.estado, 'punto', r.punto, 'fin_at', r.fin_at) end,
    'apuestas', (select coalesce(jsonb_agg(jsonb_build_object('player', a.player, 'stake', a.stake, 'estado', a.estado, 'retiro', a.retiro, 'pago', a.pago,
                   'auto', case when a.player = me then a.auto end) order by a.creada), '[]'::jsonb)
                 from jg_crash_apuestas a where a.ronda = r.id),
    'historial', (select coalesce(jsonb_agg(h.punto order by h.id desc), '[]'::jsonb)
                  from (select id, punto from jg_crash where estado = 'fin' order by id desc limit 14) h),
    'saldo', jg_saldo(me));
end $$;

-- ---------- ruleta ----------
create or replace function jg_ruleta_color(n int) returns text
language sql immutable as $$ select case when n = 0 then 'verde' when n between 1 and 7 then 'rojo' else 'negro' end $$;

-- Pone al dia la ronda: al llegar la hora revela el numero (el giro empieza) y 7 s despues paga.
create or replace function ruleta_cerrar(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare r jg_ruleta; v_n int; v_ahora timestamptz; b record; v_pago int;
begin
  select * into r from jg_ruleta where id = p_id;
  if r.id is null or r.estado = 'pagada' or jg_ahora() < r.cierra then return; end if;
  select * into r from jg_ruleta where id = p_id for update;
  v_ahora := jg_ahora();
  if r.estado = 'apuestas' and v_ahora >= r.cierra then
    select n into v_n from jg_ruleta_secreto where ronda = p_id;
    update jg_ruleta set estado = 'giro', n = v_n, color = jg_ruleta_color(v_n) where id = p_id returning * into r;
    perform bump();
  end if;
  if r.estado = 'giro' and v_ahora >= r.cierra + interval '7 seconds' then
    for b in select * from jg_ruleta_apuestas where ronda = p_id and color = r.color loop
      v_pago := (b.stake::bigint * case when r.color = 'verde' then 14 else 2 end)::int;
      update jg_ruleta_apuestas set pago = v_pago where id = b.id;
      perform jg_abonar(b.player, v_pago, 'ruleta', 'Ruleta: salió ' || r.n || ' ' || r.color);
      perform jg_grande(b.player, 'la ruleta', b.stake, v_pago);
    end loop;
    update jg_ruleta set estado = 'pagada' where id = p_id;
    perform bump();
  end if;
end $$;

create or replace function ruleta_apostar(p_color text, p_stake int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); r jg_ruleta; v_bal int; v_prev int;
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
    insert into jg_ruleta(cierra) values (jg_ahora() + interval '20 seconds') returning * into r;
    insert into jg_ruleta_secreto(ronda, n) values (r.id, floor(jg_rand() * 15)::int);
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
  perform bump();
  return jsonb_build_object('ronda', r.id, 'cierra', r.cierra, 'saldo', v_bal);
end $$;

create or replace function ruleta_estado() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); r jg_ruleta;
begin
  select * into r from jg_ruleta order by id desc limit 1;
  if r.id is not null and r.estado <> 'pagada' then
    perform ruleta_cerrar(r.id);
    select * into r from jg_ruleta where id = r.id;
  end if;
  return jsonb_build_object(
    'now', jg_ahora(),
    'ronda', case when r.id is null then null else jsonb_build_object('id', r.id, 'cierra', r.cierra, 'estado', r.estado, 'n', r.n, 'color', r.color) end,
    'apuestas', (select coalesce(jsonb_agg(jsonb_build_object('player', a.player, 'color', a.color, 'stake', a.stake, 'pago', a.pago) order by a.id), '[]'::jsonb)
                 from jg_ruleta_apuestas a where a.ronda = r.id),
    'historial', (select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'n', h.n) order by h.id desc), '[]'::jsonb)
                  from (select id, n from jg_ruleta where estado in ('giro','pagada') order by id desc limit 15) h),
    'saldo', jg_saldo(me));
end $$;

-- ---------- blackjack ----------
create or replace function jg_bj_total(h smallint[]) returns int
language plpgsql immutable as $$
declare v_s int := 0; v_ases int := 0; c smallint; v_r int;
begin
  if h is null then return 0; end if;
  foreach c in array h loop
    v_r := c % 13;
    if v_r = 0 then v_ases := v_ases + 1; v_s := v_s + 11;
    elsif v_r >= 9 then v_s := v_s + 10;
    else v_s := v_s + v_r + 1; end if;
  end loop;
  while v_s > 21 and v_ases > 0 loop v_s := v_s - 10; v_ases := v_ases - 1; end loop;
  return v_s;
end $$;

create or replace function jg_bj_j(h jg_bj) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', h.id, 'estado', h.estado, 'stake', h.stake, 'apostado', h.total,
    'jugador', to_jsonb(h.jugador), 'banca', to_jsonb(h.banca),
    'valor', jg_bj_total(h.jugador), 'valor_banca', jg_bj_total(h.banca),
    'resultado', h.resultado, 'pago', h.pago, 'doblada', h.doblada,
    'puede_doblar', h.estado = 'curso' and cardinality(h.jugador) = 2 and not h.doblada,
    'at', h.cerrada)
$$;

-- cierra la mano (la banca ya tiene todas sus cartas a la vista) y paga
create or replace function jg_bj_cerrar(h jg_bj, p_res text, p_pago int) returns jg_bj
language plpgsql security definer set search_path = public as $$
begin
  update jg_bj set jugador = h.jugador, banca = h.banca, total = h.total, doblada = h.doblada,
         estado = 'fin', resultado = p_res, pago = p_pago, cerrada = jg_ahora()
   where id = h.id returning * into h;
  perform jg_abonar(h.player, p_pago, 'blackjack', case p_res when 'blackjack' then 'Blackjack ¡blackjack!' when 'gana' then 'Blackjack: ganas' else 'Blackjack: empate' end);
  perform jg_grande(h.player, 'Blackjack', h.total, p_pago);
  perform bump();
  return h;
end $$;

-- la banca juega: da la vuelta a su carta y pide hasta llegar a 17 (se planta en todos los 17); despues se compara
create or replace function jg_bj_banca(h jg_bj) returns jg_bj
language plpgsql security definer set search_path = public as $$
declare m record; v_pj int; v_pd int; v_sig int;
begin
  select * into m from jg_bj_mazo where mano = h.id for update;
  v_sig := m.sig;
  h.banca := array[h.banca[1], m.hueco];
  v_pj := jg_bj_total(h.jugador);
  loop
    v_pd := jg_bj_total(h.banca);
    exit when v_pd >= 17 or v_sig > cardinality(m.mazo);
    h.banca := h.banca || m.mazo[v_sig];
    v_sig := v_sig + 1;
  end loop;
  update jg_bj_mazo set sig = v_sig where mano = h.id;
  if v_pd > 21 or v_pj > v_pd then return jg_bj_cerrar(h, 'gana', h.total * 2);
  elsif v_pj = v_pd then return jg_bj_cerrar(h, 'empate', h.total);
  else return jg_bj_cerrar(h, 'pierde', 0);
  end if;
end $$;

-- reparte (con el mazo que le pasan: bj_repartir lo baraja; la prueba le pasa uno fijo)
create or replace function jg_bj_nueva(me uuid, p_stake int, p_mazo smallint[]) returns jg_bj
language plpgsql security definer set search_path = public as $$
declare h jg_bj; v_pj int; v_pd int;
begin
  perform jg_cobrar(me, p_stake, 'blackjack', 'Blackjack: apuesta');
  insert into jg_bj(player, stake, total, jugador, banca)
    values (me, p_stake, p_stake, array[p_mazo[1], p_mazo[3]], array[p_mazo[2]]) returning * into h;
  insert into jg_bj_mazo(mano, mazo, sig, hueco) values (h.id, p_mazo, 5, p_mazo[4]);
  v_pj := jg_bj_total(h.jugador);
  v_pd := jg_bj_total(array[p_mazo[2], p_mazo[4]]);
  if v_pj = 21 or v_pd = 21 then                                      -- la banca mira si tiene blackjack: se acaba al momento
    h.banca := array[p_mazo[2], p_mazo[4]];
    if v_pj = 21 and v_pd = 21 then h := jg_bj_cerrar(h, 'empate', p_stake);
    elsif v_pj = 21 then h := jg_bj_cerrar(h, 'blackjack', (p_stake * 5) / 2);      -- 3 a 2
    else h := jg_bj_cerrar(h, 'pierde', 0);
    end if;
  end if;
  return h;
end $$;

create or replace function bj_repartir(p_stake int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); h jg_bj; v_mazo smallint[];
begin
  if exists (select 1 from jg_bj where player = me and estado = 'curso') then raise exception 'Ya tienes una mano en juego'; end if;
  perform pay_week();
  select array_agg(g::smallint order by jg_rand()) into v_mazo from generate_series(0, 51) g;
  h := jg_bj_nueva(me, p_stake, v_mazo);
  perform bump();
  return jsonb_build_object('mano', jg_bj_j(h), 'saldo', jg_saldo(me));
end $$;

create or replace function bj_pedir(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); h jg_bj; m record; v_pj int;
begin
  select * into h from jg_bj where id = p_id and player = me for update;
  if h.id is null then raise exception 'Esa mano no es tuya'; end if;
  if h.estado <> 'curso' then raise exception 'Esa mano ya ha terminado'; end if;
  select * into m from jg_bj_mazo where mano = h.id for update;
  h.jugador := h.jugador || m.mazo[m.sig];
  update jg_bj_mazo set sig = sig + 1 where mano = h.id;
  v_pj := jg_bj_total(h.jugador);
  if v_pj > 21 then
    h.banca := array[h.banca[1], m.hueco];
    h := jg_bj_cerrar(h, 'pierde', 0);
  elsif v_pj = 21 then
    h := jg_bj_banca(h);                                              -- 21: te plantas solo
  else
    update jg_bj set jugador = h.jugador where id = h.id returning * into h;
  end if;
  return jsonb_build_object('mano', jg_bj_j(h), 'saldo', jg_saldo(me));
end $$;

create or replace function bj_plantarse(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); h jg_bj;
begin
  select * into h from jg_bj where id = p_id and player = me for update;
  if h.id is null then raise exception 'Esa mano no es tuya'; end if;
  if h.estado <> 'curso' then raise exception 'Esa mano ya ha terminado'; end if;
  h := jg_bj_banca(h);
  return jsonb_build_object('mano', jg_bj_j(h), 'saldo', jg_saldo(me));
end $$;

-- doblar: solo con las dos primeras cartas; pones otra vez lo mismo, recibes UNA carta y se planta
create or replace function bj_doblar(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); h jg_bj; m record;
begin
  select * into h from jg_bj where id = p_id and player = me for update;
  if h.id is null then raise exception 'Esa mano no es tuya'; end if;
  if h.estado <> 'curso' then raise exception 'Esa mano ya ha terminado'; end if;
  if cardinality(h.jugador) <> 2 or h.doblada then raise exception 'Solo puedes doblar con las dos primeras cartas'; end if;
  perform jg_cobrar(me, h.stake, 'blackjack', 'Blackjack: doblar');
  h.total := h.stake * 2;
  h.doblada := true;
  select * into m from jg_bj_mazo where mano = h.id for update;
  h.jugador := h.jugador || m.mazo[m.sig];
  update jg_bj_mazo set sig = sig + 1 where mano = h.id;
  if jg_bj_total(h.jugador) > 21 then
    h.banca := array[h.banca[1], m.hueco];
    h := jg_bj_cerrar(h, 'pierde', 0);
  else
    h := jg_bj_banca(h);
  end if;
  return jsonb_build_object('mano', jg_bj_j(h), 'saldo', jg_saldo(me));
end $$;

create or replace function bj_estado() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); h jg_bj;
begin
  select * into h from jg_bj where player = me order by (estado = 'curso') desc, id desc limit 1;
  return jsonb_build_object('mano', case when h.id is null then null else jg_bj_j(h) end, 'saldo', jg_saldo(me));
end $$;

-- ---------- plinko ----------
-- 12 filas: la bola cae en una de 13 casillas (binomial). Pagan, con el 97 % de devolucion media:
-- bajo 0,976, medio 0,969, alto 0,977.
create or replace function plinko_mults(p_riesgo text) returns numeric[]
language sql immutable as $$
  select case p_riesgo
    when 'bajo'  then array[10, 3, 1.5, 1.3, 1.1, 1, 0.5, 1, 1.1, 1.3, 1.5, 3, 10]::numeric[]
    when 'medio' then array[31, 10, 3.9, 1.9, 1.1, 0.6, 0.3, 0.6, 1.1, 1.9, 3.9, 10, 31]::numeric[]
    when 'alto'  then array[130, 30, 8, 2.2, 0.5, 0.2, 0.2, 0.2, 0.5, 2.2, 8, 30, 130]::numeric[]
  end
$$;

create or replace function plinko_soltar(p_stake int, p_riesgo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); v_bal int; v_k int := 0; v_cam int[] := '{}'; i int; v_mult numeric; v_pago int; v_id bigint;
begin
  if p_riesgo is null or p_riesgo not in ('bajo','medio','alto') then raise exception 'Elige el riesgo: bajo, medio o alto'; end if;
  perform pay_week();
  v_bal := jg_cobrar(me, p_stake, 'plinko', 'Plinko: riesgo ' || p_riesgo);
  for i in 1..12 loop
    if jg_rand() < 0.5 then v_cam := v_cam || 1; v_k := v_k + 1; else v_cam := v_cam || 0; end if;
  end loop;
  v_mult := (plinko_mults(p_riesgo))[v_k + 1];
  v_pago := floor(p_stake * v_mult)::int;
  insert into jg_plinko(player, stake, riesgo, camino, k, mult, pago)
    values (me, p_stake, p_riesgo, array_to_string(v_cam, ''), v_k, v_mult, v_pago) returning id into v_id;
  perform jg_abonar(me, v_pago, 'plinko', 'Plinko ×' || jg_x(v_mult));
  perform jg_grande(me, 'Plinko', p_stake, v_pago);
  perform bump();
  return jsonb_build_object('id', v_id, 'camino', to_jsonb(v_cam), 'k', v_k, 'mult', v_mult, 'pago', v_pago, 'saldo', v_bal + v_pago);
end $$;

create or replace function plinko_estado() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo();
begin
  return jsonb_build_object(
    'filas', 12,
    'tablas', jsonb_build_object('bajo', to_jsonb(plinko_mults('bajo')), 'medio', to_jsonb(plinko_mults('medio')), 'alto', to_jsonb(plinko_mults('alto'))),
    'recientes', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'player', x.player, 'stake', x.stake, 'riesgo', x.riesgo, 'mult', x.mult, 'pago', x.pago) order by x.id desc), '[]'::jsonb)
                  from (select * from jg_plinko order by id desc limit 12) x),
    'saldo', jg_saldo(me));
end $$;

-- ---------- lo comun ----------
-- Pone al dia todo lo compartido: cierra rondas pasadas y devuelve los cara o cruz sin contestar (24 h)
create or replace function jg_tick() returns void
language plpgsql security definer set search_path = public as $$
declare v_id bigint; m record;
begin
  select id into v_id from jg_crash where estado = 'abierta' order by id desc limit 1;
  if v_id is not null then perform crash_cerrar(v_id); end if;
  select id into v_id from jg_ruleta where estado in ('apuestas','giro') order by id desc limit 1;
  if v_id is not null then perform ruleta_cerrar(v_id); end if;
  for m in select * from jg_moneda where estado = 'abierto' and creado < jg_ahora() - interval '24 hours' for update loop
    update jg_moneda set estado = 'caducado', cerrado = jg_ahora() where id = m.id;
    perform jg_abonar(m.creador, m.stake, 'devolucion', 'Cara o cruz: nadie aceptó');
    perform bump();
  end loop;
end $$;

create or replace function moneda_estado() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo();
begin
  perform jg_tick();
  return jsonb_build_object(
    'now', jg_ahora(),
    'abiertos', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'creador', m.creador, 'para', m.para, 'stake', m.stake, 'lado', m.lado, 'creado', m.creado) order by m.id desc), '[]'::jsonb)
                 from jg_moneda m where m.estado = 'abierto' and (m.para is null or m.para = me or m.creador = me)),
    'recientes', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'creador', x.creador, 'rival', x.rival, 'ganador', x.ganador, 'salio', x.salio, 'lado', x.lado, 'stake', x.stake, 'cerrado', x.cerrado) order by x.cerrado desc), '[]'::jsonb)
                  from (select * from jg_moneda where estado = 'hecho' order by cerrado desc limit 10) x),
    'saldo', jg_saldo(me));
end $$;

-- un vistazo para el selector de juegos (que ronda esta viva, cuantos retos hay)
create or replace function jg_resumen() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); c jg_crash; ru jg_ruleta;
begin
  perform jg_tick();
  select * into c from jg_crash order by id desc limit 1;
  select * into ru from jg_ruleta order by id desc limit 1;
  return jsonb_build_object(
    'now', jg_ahora(),
    'crash', case when c.id is null or c.estado = 'fin' then null else jsonb_build_object('id', c.id, 'arranca', c.arranca) end,
    'ruleta', case when ru.id is null or ru.estado = 'pagada' then null else jsonb_build_object('id', ru.id, 'estado', ru.estado, 'cierra', ru.cierra) end,
    'moneda', (select count(*) from jg_moneda m where m.estado = 'abierto' and m.creador <> me and (m.para is null or m.para = me)),
    'bj', exists (select 1 from jg_bj where player = me and estado = 'curso'),
    'saldo', jg_saldo(me));
end $$;

-- ---------- quien puede llamar a que ----------
revoke all on function jg_ahora(), jg_rand(), jg_yo(), jg_saldo(uuid), jg_nombre(uuid), jg_x(numeric), jg_cobrar(uuid, int, text, text),
  jg_abonar(uuid, int, text, text), jg_grande(uuid, text, int, int), jg_crash_punto(), crash_mult(double precision), crash_cerrar(bigint),
  jg_ruleta_color(int), ruleta_cerrar(bigint), jg_bj_total(smallint[]), jg_bj_j(jg_bj), jg_bj_cerrar(jg_bj, text, int), jg_bj_banca(jg_bj),
  jg_bj_nueva(uuid, int, smallint[]), plinko_mults(text), jg_tick() from public, anon, authenticated;
revoke all on function moneda_crear(int, uuid, text), moneda_aceptar(bigint), moneda_cancelar(bigint), moneda_estado(),
  crash_apostar(int, numeric), crash_retirar(), crash_estado(), ruleta_apostar(text, int), ruleta_estado(),
  bj_repartir(int), bj_pedir(bigint), bj_plantarse(bigint), bj_doblar(bigint), bj_estado(),
  plinko_soltar(int, text), plinko_estado(), jg_resumen() from public, anon;
grant execute on function moneda_crear(int, uuid, text), moneda_aceptar(bigint), moneda_cancelar(bigint), moneda_estado(),
  crash_apostar(int, numeric), crash_retirar(), crash_estado(), ruleta_apostar(text, int), ruleta_estado(),
  bj_repartir(int), bj_pedir(bigint), bj_plantarse(bigint), bj_doblar(bigint), bj_estado(),
  plinko_soltar(int, text), plinko_estado(), jg_resumen() to authenticated;
