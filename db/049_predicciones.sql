-- 049 (01-11). PM: "lo de quick predictions cambialo o no se, algo diferente, lo digo porque esta demasiado OP apostar en eso y facil de ganar".
-- Hoy "Gol en 10 min: No" pagaba ~1,2 y acertaba ~3 de cada 4 veces (casi precio justo, con margen del 6 %) y se podia repetir sin parar.
-- Ahora la prediccion rapida es mas justa para la casa y menos repetible:
--   1) CUOTAS CON MARGEN DEL 11 % (setting pred_margen, 0,11) sobre las dos opciones, segun el momento del partido.
--        Futbol: goles esperados por partido (pred_goles, 2,7 -> 0,03 por minuto) x momento (algo mas al final, menos al empezar)
--                x ritmo del partido (los goles que lleva comparados con los esperados) x partido abierto (empatado desde el 55,
--                o el favorito perdiendo por 1). Probabilidad de gol en los 10 minutos de la ventana entre 0,20 y 0,60.
--                Resultado tipico: "No" paga 1,12 a 1,40 y "Si" 2,5 a 4,5 (0-0 a mitad de partido: si 4,00 / no 1,16).
--        Valorant: el mismo modelo de ronda de 022b (precio de antes del partido + marcador del mapa + rondas), con el mismo margen.
--        Las cuotas se redondean HACIA ABAJO a 2 decimales y van de 1,10 a 4,50: con la probabilidad entre 0,20 y 0,60 (futbol) o 0,20 y 0,80
--        (Valorant) el tope y el suelo nunca dejan a nadie por encima de la cuota justa, asi que la casa siempre se queda su margen.
--   2) MENOS REPETICION: una sola prediccion abierta por jugador y partido (de gol o de ronda) y 5 minutos de espera (pred_espera, 300)
--        desde la anterior en el mismo partido. La apuesta maxima sigue en pred_max (50).
--   3) NADA AL FINAL DE CADA PARTE: futbol sin predicciones del minuto 40 al 45 (y descanso) de la primera parte y del 85 en adelante de la
--        segunda, ni con el partido parado si el directo lo dice (ex_live.pau, lo escribe el sincronizador). Prorroga sigue sin predicciones.
--   4) LA CUOTA QUE VE EL JUGADOR ES LA QUE SE CONGELA: la app manda la cuota que ensena (p_odds); si la actual se aleja mas de 0,05 en cualquier
--        sentido, no se apuesta y se le avisa; si no, la apuesta guarda exactamente la que vio.
-- Las predicciones viejas abiertas se resuelven igual (sync_ex_pred_* no cambian, pagan stake x la cuota que guardaron).
-- Se puede ejecutar varias veces. Va despues de 022b_pred_retraso.sql. Redefine ex_pred_cuotas, ex_pred_gol, ex_pred_ronda y ex_pred_estado.
-- OJO: 022b_prueba.sql comprueba las cuotas de 022b (margen 6 %, 1,15 a 4,00): se pasa ANTES de cargar esta; despues pasa 049_prueba.sql.
insert into settings(key, value) values ('pred_margen', '0.11'), ('pred_goles', '2.7'), ('pred_espera', '300') on conflict (key) do nothing;

-- si el jugador puede abrir otra prediccion en el partido: {abierta: tiene una abierta, seg: segundos que faltan para la siguiente (0: ya)}
create or replace function ex_pred_espera(p_player uuid, p_match text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'abierta', exists (select 1 from ex_pred where player = p_player and match_id = p_match and status = 'open'),
    'seg', coalesce((select greatest(0, ceil(extract(epoch from (max(placed_at) + make_interval(secs => ex_set_int('pred_espera', 300)) - now()))))::int
                     from ex_pred where player = p_player and match_id = p_match), 0))
$$;

-- si no se puede abrir otra, lanza el error con el motivo
create or replace function ex_pred_puede(p_player uuid, p_match text) returns void
language plpgsql stable security definer set search_path = public as $$
declare e jsonb := ex_pred_espera(p_player, p_match); s int := (e->>'seg')::int;
begin
  if (e->>'abierta')::boolean then raise exception 'Ya tienes una predicción abierta en este partido: espera a que se resuelva'; end if;
  if s > 0 then raise exception 'La siguiente predicción en este partido, en %:%', s / 60, lpad((s % 60)::text, 2, '0'); end if;
end $$;

-- cuotas con margen. gol: {ok, kind, p, si, no}; ronda: {ok, kind, p, c1, c2}; si no se puede: {ok: false, why}
create or replace function ex_pred_cuotas(m matches) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare lv ex_live; mins numeric; per int; eff numeric; p numeric; goals int; d int; fav int; pace numeric; tf numeric; sf numeric; cf numeric; rate numeric;
        g numeric := ex_set_num('pred_goles', 2.7); mg numeric := 1 + ex_set_num('pred_margen', 0.11);
        p0 numeric; pm numeric; q numeric; bo int; a int; c int; pr numeric; pr0 numeric;
begin
  select * into lv from ex_live where match_id = m.id;
  if not found or lv.at < now() - interval '3 minutes' then return jsonb_build_object('ok', false, 'why', 'Sin datos frescos del directo'); end if;
  if m.sport = 'f' then
    if lv.data->>'k' <> 'f' or lv.data->>'min' is null or lv.data->>'hs' is null or lv.data->>'as' is null then return jsonb_build_object('ok', false, 'why', 'Sin datos frescos del directo'); end if;
    per := coalesce((lv.data->>'per')::int, 1);
    if per > 2 then return jsonb_build_object('ok', false, 'why', 'Prórroga: sin predicciones'); end if;
    if coalesce(lv.data->>'pau', '0') in ('1', 'true') then return jsonb_build_object('ok', false, 'why', 'Partido parado: sin predicciones hasta que se reanude'); end if;
    mins := (lv.data->>'min')::numeric + extract(epoch from now() - lv.at) / 60;
    if per = 1 and mins >= 40 then return jsonb_build_object('ok', false, 'why', 'Final de la primera parte: sin predicciones hasta la segunda'); end if;
    if per = 2 and mins >= 85 then return jsonb_build_object('ok', false, 'why', 'Final del partido: sin predicciones'); end if;
    -- minutos de juego dentro de la ventana (de 3 a 13 desde ahora; el descanso alarga la ventana, no la acorta; el partido acaba hacia el 94)
    eff := case when per = 1 then 10 else greatest(0, least(mins + 13, 94) - (mins + 3)) end;
    goals := (lv.data->>'hs')::int + (lv.data->>'as')::int;
    d := (lv.data->>'hs')::int - (lv.data->>'as')::int;
    pace := goals / greatest(g / 90 * greatest(mins, 15), 0.6);                                          -- 1: va como se esperaba
    sf := 0.85 + 0.15 * least(2, pace);
    tf := case when per = 1 then case when mins < 15 then 0.90 else 1.00 end
               else case when mins >= 75 then 1.25 when mins >= 60 then 1.10 else 1.00 end end;
    fav := case when m.odds_1 is not null and m.odds_2 is not null and m.odds_1 < m.odds_2 then 1 when m.odds_1 is not null and m.odds_2 is not null and m.odds_2 < m.odds_1 then 2 else 0 end;
    cf := case when fav = 1 and d = -1 or fav = 2 and d = 1 then 1.15            -- el favorito pierde por 1: aprieta
               when d = 0 and mins >= 55 then 1.10                               -- empatado y ya avanzado: los dos quieren ganar
               else 1.00 end;
    rate := g / 90 * tf * sf * cf;
    p := least(0.60, greatest(0.20, 1 - exp(-rate * eff)));
    return jsonb_build_object('ok', true, 'kind', 'gol', 'p', round(p, 3),
      'si', least(4.50, greatest(1.10, floor(100 / (p * mg)) / 100)), 'no', least(4.50, greatest(1.10, floor(100 / ((1 - p) * mg)) / 100)));
  end if;
  if m.sport <> 'v' then return jsonb_build_object('ok', false, 'why', 'Este partido no admite predicciones rápidas'); end if;
  if lv.data->>'k' <> 's' or lv.data->>'a' is null or lv.data->>'b' is null then return jsonb_build_object('ok', false, 'why', 'Sin datos frescos del directo'); end if;
  bo := coalesce(nullif((lv.data->>'bo')::int, 0), m.bo, 3); if bo not in (1, 3, 5, 7) then bo := 3; end if;
  a := (lv.data->>'a')::int; c := (lv.data->>'b')::int;
  p0 := case when m.odds_1 > 1 and m.odds_2 > 1 then (1 / m.odds_1) / ((1 / m.odds_1) + (1 / m.odds_2)) else 0.5 end;
  pm := ex_map_p(least(0.97, greatest(0.03, p0)), bo);
  pr0 := 0.5 + (pm - 0.5) * 0.35;
  q := 0.5;
  if lv.data->>'ra' is not null and lv.data->>'rb' is not null then q := ex_round_win((lv.data->>'ra')::int, (lv.data->>'rb')::int, pr0, pm); end if;
  pr := least(0.8, greatest(0.2, pr0 + (q - 0.5) * 0.2 + (a - c) * 0.01));
  return jsonb_build_object('ok', true, 'kind', 'ronda', 'p', round(pr, 3),
    'c1', least(4.50, greatest(1.10, floor(100 / (pr * mg)) / 100)), 'c2', least(4.50, greatest(1.10, floor(100 / ((1 - pr) * mg)) / 100)));
end $$;

create or replace function ex_pred_gol(p_match text, p_pick text, p_stake int, p_odds numeric default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); m matches; o numeric; bal int; pid bigint; mx int := ex_set_int('pred_max', 50); d1 timestamptz := now() + make_interval(secs => ex_set_int('pred_gol_retraso', 180)); d2 timestamptz := d1 + interval '10 minutes'; cu jsonb;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  perform pay_week();
  select * into m from matches where id = p_match;
  if not found then raise exception 'Ese partido no existe'; end if;
  if m.sport <> 'f' or m.details->'espn' is null then raise exception 'Este partido no admite predicciones rápidas'; end if;
  if m.status <> 'live' or m.starts_at > now() or m.starts_at < now() - interval '4 hours' then raise exception 'El partido no está en juego ahora mismo'; end if;
  if p_pick not in ('si', 'no') then raise exception 'Elige sí o no'; end if;
  if p_stake is null or p_stake < 1 or p_stake > mx then raise exception 'La predicción rápida va de 1 a %', mx; end if;
  cu := ex_pred_cuotas(m);
  if not (cu->>'ok')::boolean then raise exception '%', cu->>'why'; end if;
  o := (cu->>p_pick)::numeric;
  if p_odds is not null then
    if abs(o - p_odds) > 0.05 then raise exception 'La cuota ha cambiado: ahora es % (te enseñaban %)', replace(o::text, '.', ','), replace(p_odds::text, '.', ','); end if;
    o := p_odds;                                                          -- se congela la que vio el jugador
  end if;
  perform pg_advisory_xact_lock(hashtext(me::text));
  perform ex_pred_puede(me, p_match);
  select coalesce(sum(amount), 0) into bal from ledger where player = me;
  if p_stake > bal then raise exception 'No tienes saldo suficiente: te quedan %', fmt_int(bal); end if;
  insert into ex_pred(player, match_id, kind, pick, stake, odds, win_from, win_to)
    values (me, p_match, 'gol', p_pick, p_stake, o, d1, d2) returning id into pid;
  insert into ledger(player, amount, kind, note)
    values (me, -p_stake, 'pred_apuesta', 'Gol en 10 min: ' || case p_pick when 'si' then 'sí' else 'no' end || ' ' || fmt_odds(o) || ' · ' || m.home || ' vs ' || m.away);
  perform bump();
  return jsonb_build_object('id', pid, 'saldo', bal - p_stake, 'odds', o, 'desde', d1, 'hasta', d2);
end $$;

create or replace function ex_pred_ronda(p_match text, p_ref text, p_round int, p_pick text, p_stake int, p_odds numeric default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); m matches; o numeric; bal int; pid bigint; mx int := ex_set_int('pred_max', 50); ob ex_pred_obs; e numeric; lo int; hi int; rf text := lower(trim(coalesce(p_ref, ''))); mg int := ex_set_int('pred_ronda_margen', 3); nlo int; nhi int; cu jsonb;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  perform pay_week();
  select * into m from matches where id = p_match;
  if not found then raise exception 'Ese partido no existe'; end if;
  if m.sport <> 'v' then raise exception 'Este partido no admite predicciones rápidas'; end if;
  if m.status <> 'live' or m.starts_at > now() or m.starts_at < now() - interval '12 hours' then raise exception 'El partido no está en juego ahora mismo'; end if;
  if rf = '' or length(rf) > 40 then raise exception 'Falta el mapa'; end if;
  if p_pick not in ('1', '2') then raise exception 'Elige un equipo'; end if;
  if p_stake is null or p_stake < 1 or p_stake > mx then raise exception 'La predicción rápida va de 1 a %', mx; end if;
  select * into ob from ex_pred_obs where match_id = p_match and ref = rf;
  if not found or ob.at < now() - interval '20 minutes' then
    raise exception 'Aún no tengo datos frescos de este mapa: espera al próximo ciclo del sincronizador';
  end if;
  e := extract(epoch from now() - ob.at);
  nlo := ob.n + floor(e / 155)::int;
  nhi := ob.n + 1 + ceil(e / 40)::int;
  if nlo <= 13 and nhi >= 9 then raise exception 'Estamos cerca del descanso entre mitades: sin predicciones hasta pasarlo'; end if;
  if nlo >= 19 then raise exception 'El mapa está acabando: sin predicciones hasta el siguiente'; end if;
  lo := nlo + 1 + mg;
  hi := nhi + 1 + mg;
  if p_round is null or p_round < lo then raise exception 'Esa ronda puede haber empezado ya en el directo: la primera que se puede apostar es la %', lo; end if;
  if p_round > hi then raise exception 'Esa ronda está demasiado lejos'; end if;
  cu := ex_pred_cuotas(m);
  if not (cu->>'ok')::boolean then raise exception '%', cu->>'why'; end if;
  o := (cu->>case p_pick when '1' then 'c1' else 'c2' end)::numeric;
  if p_odds is not null then
    if abs(o - p_odds) > 0.05 then raise exception 'La cuota ha cambiado: ahora es % (te enseñaban %)', replace(o::text, '.', ','), replace(p_odds::text, '.', ','); end if;
    o := p_odds;
  end if;
  perform pg_advisory_xact_lock(hashtext(me::text));
  perform ex_pred_puede(me, p_match);
  if exists (select 1 from ex_pred where player = me and match_id = p_match and kind = 'ronda' and ref = rf and n = p_round) then
    raise exception 'Ya has apostado a esa ronda';
  end if;
  select coalesce(sum(amount), 0) into bal from ledger where player = me;
  if p_stake > bal then raise exception 'No tienes saldo suficiente: te quedan %', fmt_int(bal); end if;
  insert into ex_pred(player, match_id, kind, pick, ref, n, stake, odds) values (me, p_match, 'ronda', p_pick, rf, p_round, p_stake, o) returning id into pid;
  insert into ledger(player, amount, kind, note)
    values (me, -p_stake, 'pred_apuesta', 'Ronda ' || p_round || ' de ' || initcap(rf) || ': ' || pick_name(m, p_pick) || ' ' || fmt_odds(o));
  perform bump();
  return jsonb_build_object('id', pid, 'saldo', bal - p_stake, 'odds', o);
end $$;

-- lo que ve la app en Directo: reglas, cuotas de cada partido, si tienes una abierta, la espera y tus ultimas predicciones
create or replace function ex_pred_estado() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  perform ex_pred_caducar();
  return jsonb_build_object(
    'max', ex_set_int('pred_max', 50), 'margen', ex_set_int('pred_ronda_margen', 3), 'retraso', ex_set_int('pred_gol_retraso', 180),
    'casa', ex_set_num('pred_margen', 0.11), 'espera', ex_set_int('pred_espera', 300),
    'live', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'sport', m.sport, 'home', m.home, 'away', m.away, 'c', ex_pred_cuotas(m),
                'abierta', (ex_pred_espera(me, m.id)->>'abierta')::boolean, 'seg', (ex_pred_espera(me, m.id)->>'seg')::int) order by m.starts_at), '[]'::jsonb)
             from matches m where m.status = 'live' and m.starts_at <= now() and m.starts_at > now() - interval '12 hours'
              and ((m.sport = 'f' and m.details->'espn' is not null) or m.sport = 'v')),
    'mine', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'match', p.match_id, 'kind', p.kind, 'pick', p.pick, 'ref', p.ref, 'n', p.n,
               'stake', p.stake, 'odds', p.odds, 'status', p.status, 'payout', p.payout, 'at', p.placed_at, 'from', p.win_from, 'to', p.win_to, 'ev', p.evidence) order by p.id desc), '[]'::jsonb)
             from (select * from ex_pred where player = me order by id desc limit 40) p)
  );
end $$;

revoke all on function ex_pred_espera(uuid, text), ex_pred_puede(uuid, text), ex_pred_cuotas(matches),
  ex_pred_gol(text, text, int, numeric), ex_pred_ronda(text, text, int, text, int, numeric), ex_pred_estado() from public, anon;
revoke all on function ex_pred_espera(uuid, text), ex_pred_puede(uuid, text), ex_pred_cuotas(matches) from authenticated;
grant execute on function ex_pred_gol(text, text, int, numeric), ex_pred_ronda(text, text, int, text, int, numeric), ex_pred_estado() to authenticated;
