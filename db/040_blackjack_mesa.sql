-- 040 (01-11). PM: "en blackjack habra 1 mesa pero se podra jugar varias personas en la misma mesa y no habra max lose".
-- El blackjack deja de ser una mano de cada uno contra la banca: hay UNA mesa con 7 asientos y todos los sentados juegan la
-- misma ronda contra la misma banca. Las reglas son las de siempre (blackjack paga 3 a 2, la banca se planta en todos los 17,
-- doblar con las dos primeras cartas, 21 te planta solo) y ya NO hay limite de perdida al dia (fuera bj_limite, db/016 y 027).
--
-- Una ronda:
--   1. Apuestas. La mesa espera sin hacer nada hasta que alguien sentado apuesta. Con la primera apuesta empiezan 12 s para
--      que se sumen los demas (si alguien apuesta en los 3 ultimos, la cuenta se alarga a 3). Apuesta minima 1; maxima, lo
--      que tengas (con el tope de 100.000 de todos los juegos, jg_cobrar). Se puede quitar la apuesta mientras dure la cuenta.
--   2. Reparto: una carta a cada asiento (de izquierda a derecha), una a la banca, otra a cada asiento y la tapada de la banca.
--      Si la banca tiene blackjack se ve al momento y se acaba (quien tenga blackjack empata, los demas pierden).
--   3. Turnos por orden de asiento: 15 s por decision (pedir, plantarse o doblar). Si no juega a tiempo, se planta solo.
--      Quien se levanta o se va de la mesa con la mano a medias se planta solo al llegar su turno.
--   4. La banca da la vuelta a su carta, pide hasta 17 (si queda alguien sin pasarse) y se paga a todos a la vez.
--
-- El tiempo, sin servidor propio (igual que el crash y la ruleta de db/010): la ronda avanza "a demanda". Cada llamada a
-- bjm_estado (la hace cada navegador que mira la mesa: al llegar el aviso en tiempo real, al vencer un plazo y cada pocos
-- segundos) pasa primero por bjm_tick, que cierra lo que ya ha vencido segun el reloj de la base: reparte si acabo la cuenta
-- de apuestas, planta al que se le acabo el turno, juega la banca y paga. Basta con que UNO mire para que la mesa avance; si
-- no mira nadie no corre nada (y al volver alguien, lo vencido se resuelve de golpe y el siguiente turno tiene sus 15 s).
-- Cada cambio de la mesa toca bjm_pulso, que va por Supabase Realtime: los demas navegadores se enteran al momento.
-- (Si algun dia se quiere que avance aunque no mire nadie: con pg_cron, select cron.schedule('bj-mesa', '5 seconds', 'select bjm_tick()').
-- No hace falta y no se activa aqui.)
--
-- El dinero y las cartas los decide SOLO la base: el mazo (6 barajas, barajadas en cada ronda) y la carta tapada viven en
-- bjm_secreto, que nadie puede leer; las manos y la mesa solo salen por bjm_estado, que tapa la carta de la banca. Cobrar va por
-- jg_cobrar (cerrojo pg_advisory_xact_lock(hashtext(player)) como place_bet) y todo lo de la mesa, ademas, en fila con el cerrojo
-- de la mesa (bjm_cerrojo), asi dos llamadas a la vez no reparten dos veces ni juegan el mismo turno. Todo al ledger con kind
-- 'blackjack', como antes: Monedero, Liga y ranking lo siguen contando igual.
--
-- Las manos individuales viejas (jg_bj): las que esten a medias al cargar esto se cierran DEVOLVIENDO lo puesto (empate, sin
-- ganar ni perder) y siguen en el historial y en el ranking (jg_ranking suma las viejas y las de la mesa).
-- Se puede ejecutar varias veces. Prueba: db/040_prueba.sql (se deshace sola).

-- ---------- tablas ----------
create table if not exists bjm_asiento (
  asiento smallint primary key check (asiento between 1 and 7),
  player uuid not null unique references players on delete cascade,
  desde timestamptz not null default clock_timestamp(),
  visto timestamptz not null default clock_timestamp(),            -- la ultima vez que su navegador miro la mesa
  sin_jugar smallint not null default 0                            -- rondas seguidas sentado sin apostar
);
create table if not exists bjm_ronda (
  id bigint generated always as identity primary key,
  estado text not null default 'apuestas' check (estado in ('apuestas','turnos','fin')),
  creada timestamptz not null default clock_timestamp(),
  cierra timestamptz not null,                                      -- fin de la cuenta de apuestas
  repartida timestamptz,
  turno smallint,                                                   -- asiento que juega ahora
  plazo timestamptz,                                                -- hasta cuando puede decidir ese asiento
  banca smallint[] not null default '{}',                           -- solo las cartas de la banca que se ven
  fin_at timestamptz
);
create unique index if not exists bjm_una_viva on bjm_ronda ((1)) where estado <> 'fin';
create index if not exists bjm_ronda_id on bjm_ronda (id desc);
create table if not exists bjm_secreto (                            -- SIN politica de lectura: nadie lo ve
  ronda bigint primary key references bjm_ronda on delete cascade,
  mazo smallint[] not null,
  sig int not null,                                                 -- siguiente carta del mazo
  hueco smallint not null                                           -- la carta tapada de la banca
);
-- cartas 0 a 51 como en jg_bj (valor mod 13: 0 as, 1 a 8 son 2 a 9, 9 a 12 son 10, J, Q, K; palo = carta div 13)
create table if not exists bjm_mano (
  ronda bigint not null references bjm_ronda on delete cascade,
  asiento smallint not null check (asiento between 1 and 7),
  player uuid not null references players on delete cascade,
  stake int not null check (stake between 1 and 100000),           -- la apuesta
  total int not null,                                               -- lo puesto en total (el doble si dobla)
  cartas smallint[] not null default '{}',
  estado text not null default 'apuesta' check (estado in ('apuesta','juega','plantada','pasada','blackjack')),
  doblada boolean not null default false,
  auto boolean not null default false,                              -- se planto sola: se le acabo el tiempo o se fue
  resultado text check (resultado in ('blackjack','gana','pierde','empate')),
  pago int not null default 0,
  creada timestamptz not null default clock_timestamp(),
  cerrada timestamptz,
  primary key (ronda, asiento),
  unique (ronda, player)
);
create index if not exists bjm_mano_jugador on bjm_mano (player, cerrada);
-- un latido para el tiempo real: cada cambio de la mesa lo toca y la app escucha sus UPDATE
create table if not exists bjm_pulso (
  id int primary key default 1 check (id = 1),
  at timestamptz not null default now(),
  v bigint not null default 0
);
insert into bjm_pulso(id) values (1) on conflict (id) do nothing;

alter table bjm_asiento enable row level security;
alter table bjm_ronda   enable row level security;
alter table bjm_secreto enable row level security;
alter table bjm_mano    enable row level security;
alter table bjm_pulso   enable row level security;
revoke all on bjm_asiento, bjm_ronda, bjm_secreto, bjm_mano, bjm_pulso from public, anon, authenticated;
grant select on bjm_pulso to authenticated;
drop policy if exists bjm_pulso_read on bjm_pulso; create policy bjm_pulso_read on bjm_pulso for select to authenticated using (is_player());
-- Sin ninguna politica: bjm_secreto (mazo y tapada), bjm_mano y bjm_ronda (solo por bjm_estado) y bjm_asiento.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'bjm_pulso') then
    alter publication supabase_realtime add table bjm_pulso;
  end if;
end $$;

-- ---------- tiempos ----------
create or replace function bjm_t_apuestas() returns interval language sql immutable as $$ select interval '12 seconds' $$;
create or replace function bjm_t_turno() returns interval language sql immutable as $$ select interval '15 seconds' $$;
create or replace function bjm_t_carta() returns interval language sql immutable as $$ select interval '800 milliseconds' $$;      -- lo que tarda en verse una carta
create or replace function bjm_t_ausente() returns interval language sql immutable as $$ select interval '60 seconds' $$;     -- sin mirar la mesa: se le levanta
-- lo que dura el reparto en pantalla: 1 s y 320 ms por carta (los turnos empiezan a contar despues)
create or replace function bjm_t_reparto(n int) returns interval language sql immutable as $$ select interval '1 second' + (2 * n + 2) * interval '320 milliseconds' $$;

-- ---------- utilidades internas ----------
-- todo lo que cambia la mesa va en fila (se suelta al acabar la transaccion; se puede pedir dos veces en la misma)
create or replace function bjm_cerrojo() returns void
language sql security definer set search_path = public as $$ select pg_advisory_xact_lock(hashtext('bj_mesa')) $$;

create or replace function bjm_avisa() returns void
language sql security definer set search_path = public as $$ update bjm_pulso set at = now(), v = v + 1 where id = 1 $$;

-- 6 barajas, en otro orden en cada ronda (jg_rand: azar fuerte de gen_random_uuid)
create or replace function bjm_baraja() returns smallint[]
language sql volatile security definer set search_path = public as $$
  select array_agg((g % 52)::smallint order by jg_rand()) from generate_series(0, 311) g
$$;

-- te sienta en ese asiento (o en el primero libre); si ya estabas sentado, te cambia
create or replace function bjm_sienta(me uuid, p_asiento int) returns smallint
language plpgsql security definer set search_path = public as $$
declare v smallint;
begin
  if p_asiento is not null then
    if p_asiento not between 1 and 7 then raise exception 'Ese asiento no existe'; end if;
    if exists (select 1 from bjm_asiento where asiento = p_asiento and player <> me) then raise exception 'Ese asiento ya está ocupado'; end if;
    v := p_asiento;
  else
    select g into v from generate_series(1, 7) g where not exists (select 1 from bjm_asiento s where s.asiento = g) order by g limit 1;
    if v is null then raise exception 'La mesa está llena: espera a que se levante alguien'; end if;
  end if;
  if exists (select 1 from bjm_asiento where player = me and asiento <> v)
     and exists (select 1 from bjm_mano m join bjm_ronda r on r.id = m.ronda where r.estado <> 'fin' and m.player = me) then
    raise exception 'Espera a que acabe la mano para cambiar de asiento';
  end if;
  delete from bjm_asiento where player = me and asiento <> v;
  insert into bjm_asiento(asiento, player) values (v, me) on conflict (asiento) do update set visto = clock_timestamp();
  return v;
end $$;

-- se paga a todos: la banca da la vuelta a su carta, pide hasta 17 si queda alguien sin pasarse, y se cierra la ronda
create or replace function bjm_pagar(p_ronda bigint) returns void
language plpgsql security definer set search_path = public as $$
declare r bjm_ronda; s bjm_secreto; h bjm_mano; v_b smallint[]; v_sig int; v_pd int; v_pj int; v_dbj boolean; v_res text; v_pago int;
begin
  select * into r from bjm_ronda where id = p_ronda for update;
  if r.id is null or r.estado = 'fin' then return; end if;
  select * into s from bjm_secreto where ronda = p_ronda for update;
  v_b := array[r.banca[1], s.hueco];
  v_sig := s.sig;
  v_dbj := jg_bj_total(v_b) = 21;
  if not v_dbj and exists (select 1 from bjm_mano where ronda = p_ronda and estado = 'plantada') then
    loop
      v_pd := jg_bj_total(v_b);
      exit when v_pd >= 17 or v_sig > cardinality(s.mazo);
      v_b := v_b || s.mazo[v_sig];
      v_sig := v_sig + 1;
    end loop;
  end if;
  v_pd := jg_bj_total(v_b);
  update bjm_secreto set sig = v_sig where ronda = p_ronda;
  for h in select * from bjm_mano where ronda = p_ronda order by asiento for update loop
    v_pj := jg_bj_total(h.cartas);
    if h.estado = 'pasada' then v_res := 'pierde'; v_pago := 0;
    elsif v_dbj then
      if h.estado = 'blackjack' then v_res := 'empate'; v_pago := h.total; else v_res := 'pierde'; v_pago := 0; end if;
    elsif h.estado = 'blackjack' then v_res := 'blackjack'; v_pago := (h.stake * 5) / 2;          -- 3 a 2
    elsif v_pd > 21 or v_pj > v_pd then v_res := 'gana'; v_pago := h.total * 2;
    elsif v_pj = v_pd then v_res := 'empate'; v_pago := h.total;
    else v_res := 'pierde'; v_pago := 0;
    end if;
    update bjm_mano set resultado = v_res, pago = v_pago, cerrada = jg_ahora() where ronda = p_ronda and asiento = h.asiento;
    perform jg_abonar(h.player, v_pago, 'blackjack', case v_res when 'blackjack' then 'Blackjack ¡blackjack!' when 'gana' then 'Blackjack: ganas' else 'Blackjack: empate' end);
    perform jg_grande(h.player, 'Blackjack', h.total, v_pago);
  end loop;
  update bjm_ronda set estado = 'fin', banca = v_b, turno = null, plazo = null, fin_at = jg_ahora() where id = p_ronda;
  perform bump();                                                     -- saldos nuevos: que la app de todos se ponga al dia
end $$;

-- pasa el turno al siguiente asiento que siga jugando (o a la banca si no queda nadie). p_desde: desde cuando cuenta su tiempo
create or replace function bjm_siguiente(p_ronda bigint, p_desde timestamptz default null) returns void
language plpgsql security definer set search_path = public as $$
declare r bjm_ronda; h bjm_mano; v_desde smallint;
begin
  select * into r from bjm_ronda where id = p_ronda for update;
  if r.id is null or r.estado <> 'turnos' then return; end if;
  v_desde := coalesce(r.turno, 0);
  loop
    select * into h from bjm_mano m where m.ronda = p_ronda and m.estado = 'juega' and m.asiento > v_desde order by m.asiento limit 1;
    if h.ronda is null then perform bjm_pagar(p_ronda); return; end if;
    if not exists (select 1 from bjm_asiento s where s.player = h.player) then         -- se fue de la mesa: se planta solo
      update bjm_mano set estado = 'plantada', auto = true where ronda = p_ronda and asiento = h.asiento;
      v_desde := h.asiento;
      continue;
    end if;
    update bjm_ronda set turno = h.asiento, plazo = coalesce(p_desde, jg_ahora()) + bjm_t_turno() where id = p_ronda;
    return;
  end loop;
end $$;

-- reparte la ronda con el mazo que le pasan (bjm_tick lo baraja; la prueba le pasa uno fijo)
create or replace function bjm_repartir(p_ronda bigint, p_mazo smallint[]) returns void
language plpgsql security definer set search_path = public as $$
declare r bjm_ronda; n int; k int := 0; h record; v_up smallint; v_hole smallint; t timestamptz := jg_ahora();
begin
  select * into r from bjm_ronda where id = p_ronda for update;
  if r.id is null or r.estado <> 'apuestas' then return; end if;
  select count(*) into n from bjm_mano where ronda = p_ronda;
  if n = 0 then delete from bjm_ronda where id = p_ronda; return; end if;
  if cardinality(p_mazo) < 2 * n + 12 then raise exception 'Mazo corto'; end if;
  for h in select asiento from bjm_mano where ronda = p_ronda order by asiento loop
    k := k + 1;
    update bjm_mano set cartas = array[p_mazo[k], p_mazo[n + 1 + k]] where ronda = p_ronda and asiento = h.asiento;
  end loop;
  v_up := p_mazo[n + 1];
  v_hole := p_mazo[2 * n + 2];
  insert into bjm_secreto(ronda, mazo, sig, hueco) values (p_ronda, p_mazo, 2 * n + 3, v_hole)
    on conflict (ronda) do update set mazo = excluded.mazo, sig = excluded.sig, hueco = excluded.hueco;
  update bjm_asiento s set sin_jugar = case when exists (select 1 from bjm_mano m where m.ronda = p_ronda and m.player = s.player) then 0 else s.sin_jugar + 1 end;
  update bjm_mano set estado = case when jg_bj_total(cartas) = 21 then 'blackjack' else 'juega' end where ronda = p_ronda;
  update bjm_ronda set estado = 'turnos', repartida = t, banca = array[v_up], turno = null where id = p_ronda;
  if jg_bj_total(array[v_up, v_hole]) = 21 then perform bjm_pagar(p_ronda); return; end if;     -- la banca mira: blackjack, se acaba ya
  perform bjm_siguiente(p_ronda, t + bjm_t_reparto(n));
end $$;

-- pone al dia la mesa segun el reloj: levanta a los que se fueron, reparte, planta al que se le acabo el tiempo, paga
create or replace function bjm_tick() returns void
language plpgsql security definer set search_path = public as $$
declare r bjm_ronda; v_n int := 0;
begin
  if not exists (select 1 from bjm_ronda where estado <> 'fin' and ((estado = 'apuestas' and cierra <= jg_ahora()) or (estado = 'turnos' and plazo <= jg_ahora())))
     and not exists (select 1 from bjm_asiento where visto < jg_ahora() - bjm_t_ausente() or sin_jugar >= 5) then
    return;                                                           -- nada vencido: ni cerrojo
  end if;
  perform bjm_cerrojo();
  -- quien no mira la mesa desde hace un minuto, o lleva 5 rondas sentado sin apostar, deja el asiento (si no tiene mano viva)
  delete from bjm_asiento s where (s.visto < jg_ahora() - bjm_t_ausente() or s.sin_jugar >= 5)
     and not exists (select 1 from bjm_mano m join bjm_ronda r2 on r2.id = m.ronda where r2.estado <> 'fin' and m.player = s.player);
  loop
    v_n := v_n + 1;
    exit when v_n > 30;
    select * into r from bjm_ronda where estado <> 'fin' order by id desc limit 1;
    exit when r.id is null;
    if r.estado = 'apuestas' then
      exit when jg_ahora() < r.cierra;
      perform bjm_repartir(r.id, bjm_baraja());
    else
      exit when r.plazo is not null and jg_ahora() < r.plazo;
      update bjm_mano set estado = 'plantada', auto = true where ronda = r.id and asiento = r.turno and estado = 'juega';
      perform bjm_siguiente(r.id, null);
    end if;
    perform bjm_avisa();
  end loop;
end $$;

-- lo que ve un jugador: la mesa, los asientos, todas las manos (la tapada de la banca, tapada), su saldo y sus ultimas manos
create or replace function bjm_vista(me uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r bjm_ronda; v_yo smallint;
begin
  select * into r from bjm_ronda order by id desc limit 1;
  select asiento into v_yo from bjm_asiento where player = me;
  return jsonb_build_object(
    'now', jg_ahora(),
    'cfg', jsonb_build_object('asientos', 7, 'apuestas', extract(epoch from bjm_t_apuestas()), 'turno', extract(epoch from bjm_t_turno()), 'max', 100000),
    'ronda', case when r.id is null then null else jsonb_build_object(
        'id', r.id, 'estado', r.estado, 'cierra', r.cierra, 'repartida', r.repartida, 'turno', r.turno, 'plazo', r.plazo, 'fin_at', r.fin_at,
        'banca', to_jsonb(r.banca), 'tapada', r.estado = 'turnos', 'valor_banca', jg_bj_total(r.banca)) end,
    'manos', (select coalesce(jsonb_agg(jsonb_build_object('asiento', m.asiento, 'player', m.player, 'stake', m.stake, 'total', m.total,
                 'cartas', to_jsonb(m.cartas), 'valor', jg_bj_total(m.cartas), 'estado', m.estado, 'doblada', m.doblada, 'auto', m.auto,
                 'resultado', m.resultado, 'pago', m.pago) order by m.asiento), '[]'::jsonb)
              from bjm_mano m where m.ronda = r.id),
    'asientos', (select coalesce(jsonb_agg(jsonb_build_object('asiento', s.asiento, 'player', s.player) order by s.asiento), '[]'::jsonb) from bjm_asiento s),
    'yo', v_yo,
    'mias', (select coalesce(jsonb_agg(jsonb_build_object('at', x.at, 'total', x.total, 'pago', x.pago, 'resultado', x.resultado) order by x.at desc), '[]'::jsonb)
             from (select * from (select m.cerrada as at, m.total, m.pago, m.resultado from bjm_mano m where m.player = me and m.resultado is not null
                                  union all
                                  select h.cerrada, h.total, h.pago, h.resultado from jg_bj h where h.player = me and h.estado = 'fin') y
                   order by y.at desc limit 8) x),
    'saldo', jg_saldo(me));
end $$;

-- ---------- lo que llama la app ----------
create or replace function bjm_estado() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo();
begin
  update bjm_asiento set visto = jg_ahora() where player = me and visto < jg_ahora() - interval '3 seconds';
  perform bjm_tick();
  return bjm_vista(me);
end $$;

create or replace function bjm_sentarse(p_asiento int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo();
begin
  perform bjm_cerrojo();
  perform bjm_tick();
  perform bjm_sienta(me, p_asiento);
  perform bjm_avisa();
  return bjm_vista(me);
end $$;

-- levantarse: si habia apostado y aun no se ha repartido, se le devuelve; con la mano a medias, se planta sola
create or replace function bjm_levantarse() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); r bjm_ronda; h bjm_mano;
begin
  perform bjm_cerrojo();
  perform bjm_tick();
  select * into r from bjm_ronda where estado <> 'fin' order by id desc limit 1 for update;
  if r.id is not null then
    select * into h from bjm_mano where ronda = r.id and player = me for update;
    if h.ronda is not null and r.estado = 'apuestas' then
      delete from bjm_mano where ronda = r.id and player = me;
      perform jg_abonar(me, h.total, 'blackjack', 'Blackjack: apuesta retirada');
      if not exists (select 1 from bjm_mano where ronda = r.id) then delete from bjm_ronda where id = r.id; end if;
    end if;
  end if;
  delete from bjm_asiento where player = me;
  if h.ronda is not null and r.estado = 'turnos' and h.estado = 'juega' then
    update bjm_mano set estado = 'plantada', auto = true where ronda = r.id and player = me;
    if r.turno = h.asiento then perform bjm_siguiente(r.id, null); end if;
  end if;
  perform bjm_avisa();
  return bjm_vista(me);
end $$;

-- apostar (si no estabas sentado, te sienta en p_asiento o en el primero libre). Abre la ronda si no habia ninguna.
create or replace function bjm_apostar(p_stake int, p_asiento int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); r bjm_ronda; v_as smallint;
begin
  if p_stake is null or p_stake < 1 then raise exception 'La apuesta mínima es 1'; end if;
  perform bjm_cerrojo();
  perform bjm_tick();
  select * into r from bjm_ronda where estado <> 'fin' order by id desc limit 1 for update;
  if r.id is not null and r.estado <> 'apuestas' then raise exception 'Espera a la siguiente mano'; end if;
  if r.id is not null and exists (select 1 from bjm_mano where ronda = r.id and player = me) then raise exception 'Ya has apostado en esta mano'; end if;
  select asiento into v_as from bjm_asiento where player = me;
  if v_as is null then v_as := bjm_sienta(me, p_asiento); end if;
  perform pay_week();
  perform jg_cobrar(me, p_stake, 'blackjack', 'Blackjack: apuesta');
  if r.id is null then
    insert into bjm_ronda(cierra) values (jg_ahora() + bjm_t_apuestas()) returning * into r;
  else
    update bjm_ronda set cierra = greatest(cierra, jg_ahora() + interval '3 seconds') where id = r.id;
  end if;
  insert into bjm_mano(ronda, asiento, player, stake, total) values (r.id, v_as, me, p_stake, p_stake);
  update bjm_asiento set sin_jugar = 0, visto = jg_ahora() where player = me;
  perform bjm_avisa();
  return bjm_vista(me);
end $$;

-- quitar la apuesta mientras dura la cuenta (se devuelve entera)
create or replace function bjm_quitar() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); r bjm_ronda; h bjm_mano;
begin
  perform bjm_cerrojo();
  perform bjm_tick();
  select * into r from bjm_ronda where estado = 'apuestas' order by id desc limit 1 for update;
  if r.id is null then raise exception 'Ya se ha repartido: la apuesta sigue en juego'; end if;
  select * into h from bjm_mano where ronda = r.id and player = me for update;
  if h.ronda is null then raise exception 'No tienes apuesta en esta mano'; end if;
  delete from bjm_mano where ronda = r.id and player = me;
  perform jg_abonar(me, h.total, 'blackjack', 'Blackjack: apuesta retirada');
  if not exists (select 1 from bjm_mano where ronda = r.id) then delete from bjm_ronda where id = r.id; end if;
  perform bjm_avisa();
  return bjm_vista(me);
end $$;

-- la mano del que llama, solo si es su turno (y despues de cerrar lo vencido: si se le acabo el tiempo, ya no lo es)
create or replace function bjm_mi_turno(me uuid) returns bjm_mano
language plpgsql security definer set search_path = public as $$
declare r bjm_ronda; h bjm_mano;
begin
  perform bjm_cerrojo();
  perform bjm_tick();
  select * into r from bjm_ronda where estado = 'turnos' order by id desc limit 1 for update;
  if r.id is null then raise exception 'No hay ninguna mano en juego'; end if;
  select * into h from bjm_mano where ronda = r.id and player = me for update;
  if h.ronda is null then raise exception 'No juegas en esta mano'; end if;
  if r.turno is distinct from h.asiento or h.estado <> 'juega' then raise exception 'No es tu turno'; end if;
  return h;
end $$;

create or replace function bjm_pedir() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); r bjm_ronda; h bjm_mano; s bjm_secreto; v int;
begin
  h := bjm_mi_turno(me);
  select * into r from bjm_ronda where id = h.ronda;
  select * into s from bjm_secreto where ronda = r.id for update;
  h.cartas := h.cartas || s.mazo[s.sig];
  update bjm_secreto set sig = sig + 1 where ronda = r.id;
  v := jg_bj_total(h.cartas);
  update bjm_mano set cartas = h.cartas, estado = case when v > 21 then 'pasada' when v = 21 then 'plantada' else 'juega' end
   where ronda = r.id and asiento = h.asiento;
  if v >= 21 then perform bjm_siguiente(r.id, jg_ahora() + bjm_t_carta());                   -- pasado o 21: se planta solo
  else update bjm_ronda set plazo = jg_ahora() + bjm_t_carta() + bjm_t_turno() where id = r.id; end if;
  perform bjm_avisa();
  return bjm_vista(me);
end $$;

create or replace function bjm_plantarse() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); r bjm_ronda; h bjm_mano;
begin
  h := bjm_mi_turno(me);
  select * into r from bjm_ronda where id = h.ronda;
  update bjm_mano set estado = 'plantada' where ronda = r.id and asiento = h.asiento;
  perform bjm_siguiente(r.id, null);
  perform bjm_avisa();
  return bjm_vista(me);
end $$;

-- doblar: solo con las dos primeras cartas; pones otra vez lo mismo, recibes UNA carta y te plantas
create or replace function bjm_doblar() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); r bjm_ronda; h bjm_mano; s bjm_secreto; v int;
begin
  h := bjm_mi_turno(me);
  select * into r from bjm_ronda where id = h.ronda;
  if cardinality(h.cartas) <> 2 or h.doblada then raise exception 'Solo puedes doblar con las dos primeras cartas'; end if;
  perform jg_cobrar(me, h.stake, 'blackjack', 'Blackjack: doblar');
  select * into s from bjm_secreto where ronda = r.id for update;
  h.cartas := h.cartas || s.mazo[s.sig];
  update bjm_secreto set sig = sig + 1 where ronda = r.id;
  v := jg_bj_total(h.cartas);
  update bjm_mano set cartas = h.cartas, total = h.stake * 2, doblada = true, estado = case when v > 21 then 'pasada' else 'plantada' end
   where ronda = r.id and asiento = h.asiento;
  perform bjm_siguiente(r.id, jg_ahora() + bjm_t_carta());
  perform bjm_avisa();
  return bjm_vista(me);
end $$;

-- ---------- sin limite de perdida ----------
-- bj_limite (db/016 y 027) ya no limita nada. Se deja vacia porque las funciones viejas la nombran.
create or replace function bj_limite(me uuid, p_stake int) returns void
language plpgsql security definer set search_path = public as $$ begin return; end $$;
revoke all on function bj_limite(uuid, int) from public, anon, authenticated;

-- ---------- las manos individuales viejas ----------
-- las que esten a medias se cierran devolviendo lo puesto (empate): nadie gana ni pierde nada por el cambio
do $$
declare h record; n int := 0; v int := 0;
begin
  for h in select * from jg_bj where estado = 'curso' for update loop
    update jg_bj set estado = 'fin', resultado = 'empate', pago = h.total, cerrada = jg_ahora() where id = h.id;
    insert into ledger(player, amount, kind, note) values (h.player, h.total, 'blackjack', 'Blackjack: mano devuelta al abrir la mesa');
    n := n + 1; v := v + h.total;
  end loop;
  if n > 0 then perform bump(); end if;
  raise notice 'Manos viejas a medias devueltas: % (% en total)', n, v;
end $$;
-- y ya no se pueden empezar ni jugar manos sueltas (bj_estado sigue, solo lee)
revoke execute on function bj_repartir(int), bj_pedir(bigint), bj_plantarse(bigint), bj_doblar(bigint) from authenticated;

-- ---------- el resumen de Juegos y el ranking cuentan la mesa ----------
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
    'bj', exists (select 1 from bjm_ronda where estado <> 'fin'),                 -- hay una ronda en la mesa
    'saldo', jg_saldo(me));
end $$;

create or replace function jg_ranking(p_juego text, p_periodo text default 'siempre') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := jg_yo();
  v_desde timestamptz := case when p_periodo = 'semana' then (madrid_week()::timestamp at time zone 'Europe/Madrid') else '-infinity'::timestamptz end;
  v_out jsonb;
begin
  if p_juego is null or p_juego not in ('crash', 'blackjack', 'moneda') then raise exception 'Ese juego no tiene ranking'; end if;
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
        ) j join players p on p.id = j.player
       group by j.player
    ) t;
  return v_out;
end $$;

-- ---------- quien puede llamar a que ----------
revoke all on function bjm_t_apuestas(), bjm_t_turno(), bjm_t_carta(), bjm_t_ausente(), bjm_t_reparto(int), bjm_cerrojo(), bjm_avisa(), bjm_baraja(),
  bjm_sienta(uuid, int), bjm_pagar(bigint), bjm_siguiente(bigint, timestamptz), bjm_repartir(bigint, smallint[]), bjm_tick(), bjm_vista(uuid),
  bjm_mi_turno(uuid) from public, anon, authenticated;
revoke all on function bjm_estado(), bjm_sentarse(int), bjm_levantarse(), bjm_apostar(int, int), bjm_quitar(), bjm_pedir(), bjm_plantarse(), bjm_doblar(),
  jg_resumen(), jg_ranking(text, text) from public, anon;
grant execute on function bjm_estado(), bjm_sentarse(int), bjm_levantarse(), bjm_apostar(int, int), bjm_quitar(), bjm_pedir(), bjm_plantarse(), bjm_doblar(),
  jg_resumen(), jg_ranking(text, text) to authenticated;
