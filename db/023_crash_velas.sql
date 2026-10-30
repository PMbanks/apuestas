-- 023 (30-10): crash en velas con retrocesos falsos. Se carga DESPUES de 010, 017 y 017b (redefine lo del crash; no toca
-- jg_ranking ni los limites). Se puede ejecutar varias veces.
--
-- Como funciona ahora el multiplicador (en el servidor y, con la MISMA formula, en juegos.js):
--   p(t) = e^(0,06 t)               el progreso base de siempre: la ronda explota cuando p llega al punto secreto (por tiempo)
--   m(t) = p(t) * f(t)              lo que se ve y lo que paga. f(t) <= 1 solo dentro de las ventanas de retroceso
-- Cada ronda guarda su calendario de retrocesos (jg_crash.retro), que sale al azar al abrirse la ronda y NO depende del punto
-- de explosion: 0 a 2 ventanas; cada una empieza cuando p pasa un nivel entre x1,5 y x4 (la segunda entre x2,2 y x6, siempre
-- 0,8 s despues de acabar la primera), cae rapido (0,25 a 0,4 s) hasta el 65 a 85 % y se recupera en 1 a 2,5 s, asi que despues
-- del susto sube mas rapido que la curva hasta alcanzarla. Nunca baja de x1,08.
--   * Explotar: sigue decidido por el tiempo (p llega al punto), puede caer en mitad de un retroceso. El punto que se muestra
--     (jg_crash.punto) es m en el momento de la explosion.
--   * Retirar: paga m(t) a la hora del servidor, lo que se ve.
--   * Retirada automatica: salta la primera vez que m(t) llega al objetivo (si no llega antes de explotar, se pierde).
--   * Ninguna estrategia gana mas que antes: m <= p siempre, asi que la devolucion media no pasa del 97 %.
-- El cliente recibe el calendario en crash_estado (ronda.retro): son colegas y no da ninguna pista del punto de explosion.

alter table jg_crash add column if not exists retro jsonb not null default '[]'::jsonb;

-- ---------- la formula (inmutable; la misma en juegos.js) ----------
create or replace function crash_f(t double precision, retro jsonb) returns double precision
language plpgsql immutable as $$
declare e jsonb; u double precision; d double precision; td double precision; tr double precision; x double precision;
begin
  if retro is null or jsonb_array_length(retro) = 0 then return 1; end if;
  for e in select * from jsonb_array_elements(retro) loop
    u := t - (e->>'t0')::double precision; d := (e->>'d')::double precision; td := (e->>'td')::double precision; tr := (e->>'tr')::double precision;
    if u <= 0 or u >= td + tr then continue; end if;
    if u < td then x := u / td; return 1 - (1 - d) * (x * x * (3 - 2 * x)); end if;
    x := (u - td) / tr;
    return d + (1 - d) * (x * x * (3 - 2 * x));
  end loop;
  return 1;
end $$;

create or replace function crash_m(t double precision, retro jsonb) returns double precision
language sql immutable as $$ select exp(0.06 * greatest(t, 0)) * crash_f(t, retro) $$;

create or replace function crash_mult(t double precision, retro jsonb) returns numeric
language sql immutable as $$ select least(1000, floor(crash_m(t, retro) * 100) / 100)::numeric(8,2) $$;

-- primer instante en que m(t) llega a p_a (null si no llega en los 6 s siguientes a que p lo alcance)
create or replace function crash_t_alcanza(p_a numeric, p_retro jsonb) returns double precision
language plpgsql immutable as $$
declare a double precision := p_a::double precision; ts double precision := ln(p_a::double precision) / 0.06; t double precision; lo double precision; hi double precision; i int; j int;
begin
  if crash_m(ts, p_retro) >= a * (1 - 1e-12) then return ts; end if;       -- m <= p: antes de ts no puede llegar
  t := ts;
  for i in 1..300 loop
    lo := t; t := t + 0.02;
    if crash_m(t, p_retro) >= a then
      hi := t;
      for j in 1..40 loop
        t := (lo + hi) / 2;
        if crash_m(t, p_retro) >= a then hi := t; else lo := t; end if;
      end loop;
      return hi;
    end if;
  end loop;
  return null;
end $$;

-- calendario de retrocesos de una ronda nueva
create or replace function jg_crash_retro() returns jsonb
language plpgsql volatile as $$
declare
  v_u double precision := jg_rand(); v_n int := case when v_u < 0.25 then 0 when v_u < 0.70 then 1 else 2 end;
  v_out jsonb := '[]'::jsonb; v_fin double precision := 0; v_lv double precision; v_t0 numeric; v_d numeric; v_td numeric; v_tr numeric; i int;
begin
  for i in 1..v_n loop
    if i = 1 then v_lv := 1.5 * power(4.0 / 1.5, jg_rand()); else v_lv := 2.2 * power(6.0 / 2.2, jg_rand()); end if;
    v_t0 := round(greatest(ln(v_lv) / 0.06, case when i = 1 then 0 else v_fin + 0.8 end)::numeric, 3);
    v_d := round(greatest(0.65 + 0.20 * jg_rand(), 1.08 / exp(0.06 * v_t0::double precision))::numeric, 3);
    v_td := round((0.25 + 0.15 * jg_rand())::numeric, 3);
    v_tr := round((1.0 + 1.5 * jg_rand())::numeric, 3);
    v_out := v_out || jsonb_build_object('t0', v_t0, 'd', v_d, 'td', v_td, 'tr', v_tr);
    v_fin := v_t0::double precision + v_td::double precision + v_tr::double precision;
  end loop;
  return v_out;
end $$;

revoke all on function crash_f(double precision, jsonb), crash_m(double precision, jsonb), crash_mult(double precision, jsonb),
  crash_t_alcanza(numeric, jsonb), jg_crash_retro() from public, anon, authenticated;

-- ---------- cerrar la ronda ----------
create or replace function crash_cerrar(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare r jg_crash; v_sec numeric; v_ahora timestamptz; t double precision; v_tfin double precision; b record; v_pago int; v_cambio boolean := false; v_tc double precision; v_mfin numeric;
begin
  select * into r from jg_crash where id = p_id;
  if r.id is null or r.estado <> 'abierta' or jg_ahora() < r.arranca then return; end if;
  select * into r from jg_crash where id = p_id for update;
  if r.estado <> 'abierta' then return; end if;
  v_ahora := jg_ahora();
  select punto into v_sec from jg_crash_secreto where ronda = p_id;
  t := extract(epoch from v_ahora - r.arranca);
  v_tfin := ln(v_sec::double precision) / 0.06;                        -- explota cuando p llega al punto, vaya m como vaya
  for b in select * from jg_crash_apuestas where ronda = p_id and estado = 'viva' and auto is not null for update loop
    v_tc := crash_t_alcanza(b.auto, r.retro);                           -- la primera vez que m llega al objetivo
    if v_tc is not null and v_tc <= least(t, v_tfin) then
      v_pago := floor(b.stake * b.auto)::int;
      update jg_crash_apuestas set estado = 'cobrada', retiro = b.auto, pago = v_pago where ronda = p_id and player = b.player;
      perform jg_abonar(b.player, v_pago, 'crash', 'Crash ×' || jg_x(b.auto) || ' (retirada automática)');
      perform jg_grande(b.player, 'Crash', b.stake, v_pago);
      v_cambio := true;
    end if;
  end loop;
  if t >= v_tfin then
    v_mfin := greatest(1, round(least(1000, crash_m(v_tfin, r.retro))::numeric, 2));
    update jg_crash set estado = 'fin', punto = v_mfin, fin_at = r.arranca + (v_tfin * interval '1 second') where id = p_id;
    update jg_crash_apuestas set estado = 'perdida' where ronda = p_id and estado = 'viva';
    v_cambio := true;
  end if;
  if v_cambio then perform bump(); end if;
end $$;

-- ---------- apostar: la ronda nueva trae su calendario de retrocesos ----------
create or replace function crash_apostar(p_stake int, p_auto numeric default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); r jg_crash; v_bal int;
begin
  if p_auto is not null and (p_auto < 1.01 or p_auto > 1000) then raise exception 'La retirada automática va de ×1,01 a ×1000'; end if;
  perform pay_week();
  perform pg_advisory_xact_lock(hashtext('jg_crash'));
  select * into r from jg_crash order by id desc limit 1;
  if r.id is not null and r.estado = 'abierta' then
    perform crash_cerrar(r.id);
    select * into r from jg_crash where id = r.id for update;
  end if;
  if r.id is null or r.estado <> 'abierta' then
    insert into jg_crash(arranca, retro) values (jg_ahora() + interval '10 seconds', jg_crash_retro()) returning * into r;
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

-- ---------- retirar: paga m(t) a la hora del servidor, lo que se ve ----------
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
    perform crash_cerrar(r.id);
    select * into r from jg_crash where id = r.id;
    return jsonb_build_object('ok', false, 'tarde', true, 'punto', r.punto, 'saldo', jg_saldo(me));
  end if;
  v_m := crash_mult(extract(epoch from v_ahora - r.arranca), r.retro);
  v_pago := floor(b.stake * v_m)::int;
  update jg_crash_apuestas set estado = 'cobrada', retiro = v_m, pago = v_pago where ronda = r.id and player = me;
  perform jg_abonar(me, v_pago, 'crash', 'Crash ×' || jg_x(v_m));
  perform jg_grande(me, 'Crash', b.stake, v_pago);
  perform bump();
  return jsonb_build_object('ok', true, 'retiro', v_m, 'pago', v_pago, 'saldo', jg_saldo(me));
end $$;

-- ---------- estado: igual que en 017 y ademas el calendario de retrocesos de la ronda ----------
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
    'ronda', case when r.id is null then null else jsonb_build_object('id', r.id, 'arranca', r.arranca, 'estado', r.estado, 'punto', r.punto, 'fin_at', r.fin_at, 'retro', r.retro) end,
    'apuestas', (select coalesce(jsonb_agg(jsonb_build_object('player', a.player, 'stake', a.stake, 'estado', a.estado, 'retiro', a.retiro, 'pago', a.pago,
                   'auto', case when a.player = me then a.auto end) order by a.creada), '[]'::jsonb)
                 from jg_crash_apuestas a where a.ronda = r.id),
    'historial', (select coalesce(jsonb_agg(h.punto order by h.id desc), '[]'::jsonb)
                  from (select id, punto from jg_crash where estado = 'fin' order by id desc limit 20) h),
    'rondas', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'punto', c.punto,
                   'gente', (select coalesce(jsonb_agg(jsonb_build_object('player', a.player, 'stake', a.stake, 'estado', a.estado, 'retiro', a.retiro, 'pago', a.pago) order by a.creada), '[]'::jsonb)
                             from jg_crash_apuestas a where a.ronda = c.id)) order by c.id desc), '[]'::jsonb)
               from (select id, punto from jg_crash where estado = 'fin' order by id desc limit 20) c),
    'saldo', jg_saldo(me));
end $$;
revoke all on function crash_cerrar(bigint), crash_apostar(int, numeric), crash_retirar(), crash_estado() from public, anon;
revoke all on function crash_cerrar(bigint) from authenticated;
grant execute on function crash_apostar(int, numeric), crash_retirar(), crash_estado() to authenticated;

-- ---------- ranking: ademas de la ganancia neta, la mayor ganancia de una sola jugada y su multiplicador ----------
-- Mismas claves de siempre (player, neto, jugadas, mejor) y dos nuevas: mayor (lo mas que se gano limpio en una jugada, 0 si nunca)
-- y mayor_x (el multiplicador de esa jugada: crash x de la retirada, blackjack pago / puesto, cara o cruz x2). Sigue sin salir
-- ninguna mano ni apuesta suelta, solo agregados.
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
          select m.ganador, m.stake, 2::numeric, false from jg_moneda m where p_juego = 'moneda' and m.estado = 'hecho' and m.cerrado >= v_desde
          union all
          select case when m.ganador = m.creador then m.rival else m.creador end, -m.stake, null, false
            from jg_moneda m where p_juego = 'moneda' and m.estado = 'hecho' and m.cerrado >= v_desde
        ) j join players p on p.id = j.player
       group by j.player
    ) t;
  return v_out;
end $$;
revoke all on function jg_ranking(text, text) from public, anon;
grant execute on function jg_ranking(text, text) to authenticated;
