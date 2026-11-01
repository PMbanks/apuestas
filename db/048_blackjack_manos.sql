-- 048 (01-11). PM: "en blackjack uno puede poner varias mesas, es decir la misma mesa pero varias manos, a eso me refiero".
-- Sobre la mesa de db/040: ahora un jugador puede jugar VARIAS MANOS en la misma ronda, como en un casino: ocupa varios
-- asientos libres (hasta 3) y cada uno lleva su apuesta. Cada mano se juega en su turno por orden de asiento con sus 15 s, se
-- cobra con jg_cobrar (mismo candado que place_bet) y se paga por separado, todo al ledger con kind 'blackjack' como siempre.
--
-- Lo que cambia:
--   * bjm_asiento ya no exige un asiento por jugador (hasta bjm_max_manos() = 3); bjm_mano ya no exige una mano por jugador.
--   * bjm_apostar(stake, asiento): apuesta en ESE asiento (tuyo o libre) o, sin asiento, en el primero tuyo sin apuesta
--     (si no tienes ninguno, te sienta en el primero libre).
--   * bjm_otra_mano(stake, asiento): "anadir otra mano": te sienta en otro asiento libre (ese o el primero) y apuesta alli.
--   * bjm_quitar(asiento): quita la apuesta de esa mano antes de repartir (sin asiento: todas las tuyas); se devuelve entera y,
--     si no era tu unico asiento, el asiento se libera.
--   * bjm_levantarse(asiento): deja ese asiento (sin asiento: todos). Lo apostado sin repartir se devuelve; una mano a medias
--     se planta sola.
--   * bjm_sentarse(asiento) ya no cambia de sitio: te sienta en otro asiento mas (hasta 3).
--   * bjm_pedir, bjm_plantarse y bjm_doblar juegan la mano a la que le toca, si es tuya.
--   * bjm_estado devuelve ademas 'mios' (tus asientos, por orden) y cfg.manos (3).
-- Nadie bloquea la mesa: las reglas de ausencia valen por jugador (quien no mira la mesa en un minuto pierde todos sus asientos
-- sin mano viva) y cada asiento libera solo si lleva 5 rondas sin apostar.
-- Se puede ejecutar varias veces. Prueba: db/048_prueba.sql (se deshace sola). Ojo: 040_prueba.sql es de antes de esto (cuenta
-- con un asiento por jugador) y ya no vale despues de cargar 048.

alter table bjm_asiento drop constraint if exists bjm_asiento_player_key;
alter table bjm_mano drop constraint if exists bjm_mano_ronda_player_key;
create index if not exists bjm_asiento_jugador on bjm_asiento (player);
create index if not exists bjm_mano_ronda_jugador on bjm_mano (ronda, player);

create or replace function bjm_max_manos() returns int language sql immutable as $$ select 3 $$;

-- te sienta en ese asiento libre (o en el primero libre). Sin cambiar de sitio: es un asiento mas, hasta bjm_max_manos()
create or replace function bjm_sienta(me uuid, p_asiento int) returns smallint
language plpgsql security definer set search_path = public as $$
declare v smallint;
begin
  if p_asiento is not null then
    if p_asiento not between 1 and 7 then raise exception 'Ese asiento no existe'; end if;
    if exists (select 1 from bjm_asiento where asiento = p_asiento and player = me) then return p_asiento; end if;
    if exists (select 1 from bjm_asiento where asiento = p_asiento) then raise exception 'Ese asiento ya está ocupado'; end if;
    v := p_asiento;
  else
    select g into v from generate_series(1, 7) g where not exists (select 1 from bjm_asiento s where s.asiento = g) order by g limit 1;
    if v is null then raise exception 'La mesa está llena: espera a que se levante alguien'; end if;
  end if;
  if (select count(*) from bjm_asiento where player = me) >= bjm_max_manos() then
    raise exception 'Como mucho % manos por jugador', bjm_max_manos();
  end if;
  insert into bjm_asiento(asiento, player, visto) values (v, me, clock_timestamp());
  update bjm_asiento set visto = clock_timestamp() where player = me;
  return v;
end $$;

-- pasa el turno al siguiente asiento que siga jugando; una mano cuyo asiento ya no es de su jugador se planta sola
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
    if not exists (select 1 from bjm_asiento s where s.asiento = h.asiento and s.player = h.player) then
      update bjm_mano set estado = 'plantada', auto = true where ronda = p_ronda and asiento = h.asiento;
      v_desde := h.asiento;
      continue;
    end if;
    update bjm_ronda set turno = h.asiento, plazo = coalesce(p_desde, jg_ahora()) + bjm_t_turno() where id = p_ronda;
    return;
  end loop;
end $$;

-- reparte (igual que en 040; las rondas sin apostar se cuentan por asiento)
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
  update bjm_asiento s set sin_jugar = case when exists (select 1 from bjm_mano m where m.ronda = p_ronda and m.asiento = s.asiento and m.player = s.player) then 0 else s.sin_jugar + 1 end;
  update bjm_mano set estado = case when jg_bj_total(cartas) = 21 then 'blackjack' else 'juega' end where ronda = p_ronda;
  update bjm_ronda set estado = 'turnos', repartida = t, banca = array[v_up], turno = null where id = p_ronda;
  if jg_bj_total(array[v_up, v_hole]) = 21 then perform bjm_pagar(p_ronda); return; end if;
  perform bjm_siguiente(p_ronda, t + bjm_t_reparto(n));
end $$;

-- pone al dia la mesa; quien no mira en un minuto pierde todos sus asientos sin mano viva, y un asiento con 5 rondas sin apostar
create or replace function bjm_tick() returns void
language plpgsql security definer set search_path = public as $$
declare r bjm_ronda; v_n int := 0;
begin
  if not exists (select 1 from bjm_ronda where estado <> 'fin' and ((estado = 'apuestas' and cierra <= jg_ahora()) or (estado = 'turnos' and plazo <= jg_ahora())))
     and not exists (select 1 from bjm_asiento where visto < jg_ahora() - bjm_t_ausente() or sin_jugar >= 5) then
    return;
  end if;
  perform bjm_cerrojo();
  delete from bjm_asiento s where (s.sin_jugar >= 5 or s.player in (select a.player from bjm_asiento a group by a.player having max(a.visto) < jg_ahora() - bjm_t_ausente()))
     and not exists (select 1 from bjm_mano m join bjm_ronda r2 on r2.id = m.ronda where r2.estado <> 'fin' and m.asiento = s.asiento and m.player = s.player);
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

-- lo que ve un jugador (como en 040, con 'mios': sus asientos por orden, y cfg.manos)
create or replace function bjm_vista(me uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r bjm_ronda; v_mios jsonb;
begin
  select * into r from bjm_ronda order by id desc limit 1;
  select coalesce(jsonb_agg(asiento order by asiento), '[]'::jsonb) into v_mios from bjm_asiento where player = me;
  return jsonb_build_object(
    'now', jg_ahora(),
    'cfg', jsonb_build_object('asientos', 7, 'apuestas', extract(epoch from bjm_t_apuestas()), 'turno', extract(epoch from bjm_t_turno()), 'max', 100000, 'manos', bjm_max_manos()),
    'ronda', case when r.id is null then null else jsonb_build_object(
        'id', r.id, 'estado', r.estado, 'cierra', r.cierra, 'repartida', r.repartida, 'turno', r.turno, 'plazo', r.plazo, 'fin_at', r.fin_at,
        'banca', to_jsonb(r.banca), 'tapada', r.estado = 'turnos', 'valor_banca', jg_bj_total(r.banca)) end,
    'manos', (select coalesce(jsonb_agg(jsonb_build_object('asiento', m.asiento, 'player', m.player, 'stake', m.stake, 'total', m.total,
                 'cartas', to_jsonb(m.cartas), 'valor', jg_bj_total(m.cartas), 'estado', m.estado, 'doblada', m.doblada, 'auto', m.auto,
                 'resultado', m.resultado, 'pago', m.pago) order by m.asiento), '[]'::jsonb)
              from bjm_mano m where m.ronda = r.id),
    'asientos', (select coalesce(jsonb_agg(jsonb_build_object('asiento', s.asiento, 'player', s.player) order by s.asiento), '[]'::jsonb) from bjm_asiento s),
    'yo', v_mios->0,
    'mios', v_mios,
    'mias', (select coalesce(jsonb_agg(jsonb_build_object('at', x.at, 'total', x.total, 'pago', x.pago, 'resultado', x.resultado) order by x.at desc), '[]'::jsonb)
             from (select * from (select m.cerrada as at, m.total, m.pago, m.resultado from bjm_mano m where m.player = me and m.resultado is not null
                                  union all
                                  select h.cerrada, h.total, h.pago, h.resultado from jg_bj h where h.player = me and h.estado = 'fin') y
                   order by y.at desc limit 8) x),
    'saldo', jg_saldo(me));
end $$;

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

-- deja un asiento (o todos): lo apostado sin repartir se devuelve; con la mano a medias, se planta sola
drop function if exists bjm_levantarse();
create or replace function bjm_levantarse(p_asiento int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); r bjm_ronda; h bjm_mano; s record; v_turno boolean := false;
begin
  perform bjm_cerrojo();
  perform bjm_tick();
  if p_asiento is not null and not exists (select 1 from bjm_asiento where asiento = p_asiento and player = me) then raise exception 'Ese asiento no es tuyo'; end if;
  select * into r from bjm_ronda where estado <> 'fin' order by id desc limit 1 for update;
  for s in select asiento from bjm_asiento where player = me and (p_asiento is null or asiento = p_asiento) order by asiento loop
    h := null;
    if r.id is not null then select * into h from bjm_mano where ronda = r.id and asiento = s.asiento and player = me for update; end if;
    if h.ronda is not null and r.estado = 'apuestas' then
      delete from bjm_mano where ronda = r.id and asiento = s.asiento;
      perform jg_abonar(me, h.total, 'blackjack', 'Blackjack: apuesta retirada');
    elsif h.ronda is not null and r.estado = 'turnos' and h.estado = 'juega' then
      update bjm_mano set estado = 'plantada', auto = true where ronda = r.id and asiento = s.asiento;
      if r.turno = s.asiento then v_turno := true; end if;
    end if;
    delete from bjm_asiento where asiento = s.asiento and player = me;
  end loop;
  if r.id is not null and r.estado = 'apuestas' and not exists (select 1 from bjm_mano where ronda = r.id) then delete from bjm_ronda where id = r.id; end if;
  if v_turno then perform bjm_siguiente(r.id, null); end if;
  perform bjm_avisa();
  return bjm_vista(me);
end $$;

-- la apuesta en un asiento ya decidido (interna): abre la ronda si no hay, cobra y pone la mano
create or replace function bjm_pon(me uuid, p_asiento smallint, p_stake int) returns void
language plpgsql security definer set search_path = public as $$
declare r bjm_ronda;
begin
  if p_stake is null or p_stake < 1 then raise exception 'La apuesta mínima es 1'; end if;
  select * into r from bjm_ronda where estado <> 'fin' order by id desc limit 1 for update;
  if r.id is not null and r.estado <> 'apuestas' then raise exception 'Espera a la siguiente mano'; end if;
  if r.id is not null and exists (select 1 from bjm_mano where ronda = r.id and asiento = p_asiento) then raise exception 'Esa mano ya tiene apuesta'; end if;
  perform pay_week();
  perform jg_cobrar(me, p_stake, 'blackjack', 'Blackjack: apuesta');
  if r.id is null then
    insert into bjm_ronda(cierra) values (jg_ahora() + bjm_t_apuestas()) returning * into r;
  else
    update bjm_ronda set cierra = greatest(cierra, jg_ahora() + interval '3 seconds') where id = r.id;
  end if;
  insert into bjm_mano(ronda, asiento, player, stake, total) values (r.id, p_asiento, me, p_stake, p_stake);
  update bjm_asiento set sin_jugar = 0 where asiento = p_asiento;
  update bjm_asiento set visto = jg_ahora() where player = me;
end $$;

-- apostar: en ese asiento (tuyo o libre) o en el primero tuyo sin apuesta (sin asientos, te sienta en el primero libre)
drop function if exists bjm_apostar(int, int);
create or replace function bjm_apostar(p_stake int, p_asiento int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); r bjm_ronda; v_as smallint;
begin
  if p_stake is null or p_stake < 1 then raise exception 'La apuesta mínima es 1'; end if;
  perform bjm_cerrojo();
  perform bjm_tick();
  select * into r from bjm_ronda where estado <> 'fin' order by id desc limit 1;
  if r.id is not null and r.estado <> 'apuestas' then raise exception 'Espera a la siguiente mano'; end if;
  if p_asiento is not null then
    v_as := bjm_sienta(me, p_asiento);
  else
    select s.asiento into v_as from bjm_asiento s where s.player = me
       and not exists (select 1 from bjm_mano m where m.ronda = r.id and m.asiento = s.asiento) order by s.asiento limit 1;
    if v_as is null then
      if exists (select 1 from bjm_asiento where player = me) then raise exception 'Ya has apostado en todas tus manos'; end if;
      v_as := bjm_sienta(me, null);
    end if;
  end if;
  perform bjm_pon(me, v_as, p_stake);
  perform bjm_avisa();
  return bjm_vista(me);
end $$;

-- anadir otra mano: otro asiento libre (ese o el primero) con su apuesta
create or replace function bjm_otra_mano(p_stake int, p_asiento int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); r bjm_ronda; v_as smallint;
begin
  if p_stake is null or p_stake < 1 then raise exception 'La apuesta mínima es 1'; end if;
  perform bjm_cerrojo();
  perform bjm_tick();
  select * into r from bjm_ronda where estado <> 'fin' order by id desc limit 1;
  if r.id is not null and r.estado <> 'apuestas' then raise exception 'Espera a la siguiente mano'; end if;
  if p_asiento is not null and exists (select 1 from bjm_asiento where asiento = p_asiento and player = me) then raise exception 'Ese asiento ya es tuyo'; end if;
  v_as := bjm_sienta(me, p_asiento);
  perform bjm_pon(me, v_as, p_stake);
  perform bjm_avisa();
  return bjm_vista(me);
end $$;

-- quitar la apuesta de una mano (o de todas) mientras dura la cuenta; la mano anadida deja su asiento
drop function if exists bjm_quitar();
create or replace function bjm_quitar(p_asiento int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); r bjm_ronda; h bjm_mano; n int := 0;
begin
  perform bjm_cerrojo();
  perform bjm_tick();
  select * into r from bjm_ronda where estado = 'apuestas' order by id desc limit 1 for update;
  if r.id is null then raise exception 'Ya se ha repartido: la apuesta sigue en juego'; end if;
  for h in select * from bjm_mano where ronda = r.id and player = me and (p_asiento is null or asiento = p_asiento) order by asiento desc for update loop
    delete from bjm_mano where ronda = r.id and asiento = h.asiento;
    perform jg_abonar(me, h.total, 'blackjack', 'Blackjack: apuesta retirada');
    if (select count(*) from bjm_asiento where player = me) > 1 then delete from bjm_asiento where asiento = h.asiento and player = me; end if;
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'No tienes apuesta en esta mano'; end if;
  if not exists (select 1 from bjm_mano where ronda = r.id) then delete from bjm_ronda where id = r.id; end if;
  perform bjm_avisa();
  return bjm_vista(me);
end $$;

-- la mano a la que le toca, si es tuya (despues de cerrar lo vencido)
create or replace function bjm_mi_turno(me uuid) returns bjm_mano
language plpgsql security definer set search_path = public as $$
declare r bjm_ronda; h bjm_mano;
begin
  perform bjm_cerrojo();
  perform bjm_tick();
  select * into r from bjm_ronda where estado = 'turnos' order by id desc limit 1 for update;
  if r.id is null then raise exception 'No hay ninguna mano en juego'; end if;
  if not exists (select 1 from bjm_mano where ronda = r.id and player = me) then raise exception 'No juegas en esta mano'; end if;
  select * into h from bjm_mano where ronda = r.id and asiento = r.turno for update;
  if h.ronda is null or h.player <> me or h.estado <> 'juega' then raise exception 'No es tu turno'; end if;
  return h;
end $$;

revoke all on function bjm_max_manos(), bjm_sienta(uuid, int), bjm_siguiente(bigint, timestamptz), bjm_repartir(bigint, smallint[]), bjm_tick(),
  bjm_vista(uuid), bjm_pon(uuid, smallint, int), bjm_mi_turno(uuid) from public, anon, authenticated;
revoke all on function bjm_estado(), bjm_sentarse(int), bjm_levantarse(int), bjm_apostar(int, int), bjm_otra_mano(int, int), bjm_quitar(int) from public, anon;
grant execute on function bjm_estado(), bjm_sentarse(int), bjm_levantarse(int), bjm_apostar(int, int), bjm_otra_mano(int, int), bjm_quitar(int) to authenticated;
