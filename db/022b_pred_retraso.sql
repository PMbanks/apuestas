-- 022b (30-10, urgente). PM: "sale antes en el stream que por la ronda" y "que no sean las mismas odds si van 1 a 5".
-- El stream va por delante de vlr.gg y de ESPN, asi que lo que la app ofrecia como "la siguiente ronda" o "los proximos 10 minutos"
-- ya habia pasado en el stream. Ahora:
--   Valorant: solo se puede apostar a una ronda que este a pred_ronda_margen (3) rondas de lo que sabe la base como minimo (mas las que han
--             tenido tiempo de acabar desde que el sincronizador miro). Nada cerca del descanso entre mitades (rondas conocidas de 9 a 13,
--             y si los datos estan tan viejos que la duda llega a esa zona) ni cuando el mapa esta acabando (19 o mas).
--   Futbol:   la ventana de gol empieza pred_gol_retraso (180) segundos despues de apostar y dura 10 minutos.
--   Cuotas:   ya no son fijas. Salen del estado en vivo (ex_live, lo escribe el sincronizador), con margen del 6 %, entre 1,15 y 4,00,
--             y se congelan al apostar. Para eso esta parte trae ex_live y el modelo (los mismos de 024_cashout.sql, que los redefine igual).
--             Sin estado en vivo de menos de 3 minutos no se puede predecir (tambien en futbol).
-- Se puede ejecutar varias veces. Va despues de 022_extras.sql. Redefine ex_pred_gol, ex_pred_ronda (con p_odds opcional) y ex_pred_estado.
-- OJO: 022_prueba.sql prueba las reglas de 022 (ventana de 1 a 11 minutos, cuotas fijas, rondas sin margen): despues de cargar esta, pasa 022b_prueba.sql.
insert into settings(key, value) values ('pred_ronda_margen', '3'), ('pred_gol_retraso', '180') on conflict (key) do nothing;

drop function if exists ex_pred_gol(text, text, int);
drop function if exists ex_pred_ronda(text, text, int, text, int);

create table if not exists ex_live (
  match_id text primary key references matches on delete cascade,
  data jsonb not null,
  at timestamptz not null default now()
);
alter table ex_live enable row level security;                                -- sin politica: solo las funciones lo ven

create or replace function sync_ex_live_put(p_secret text, p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare r jsonb; k int := 0;
begin
  if p_secret is null or p_secret <> (select value #>> '{}' from settings where key = 'sync_secret') then raise exception 'Clave de sincronización no válida'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    if not exists (select 1 from matches where id = r->>'match') or jsonb_typeof(r->'data') <> 'object' then continue; end if;
    insert into ex_live(match_id, data, at) values (r->>'match', r->'data', now())
    on conflict (match_id) do update set data = excluded.data, at = now();
    k := k + 1;
  end loop;
  delete from ex_live where at < now() - interval '2 days';
  return k;
end $$;

create or replace function ex_w(x int, y int, need int, pm numeric) returns numeric
language plpgsql immutable as $$
begin
  if x >= need then return 1; elsif y >= need then return 0; end if;
  return pm * ex_w(x + 1, y, need, pm) + (1 - pm) * ex_w(x, y + 1, need, pm);
end $$;

create or replace function ex_map_p(p0 numeric, bo int) returns numeric
language plpgsql immutable as $$
declare lo numeric := 0.01; hi numeric := 0.99; mid numeric; need int := (bo + 1) / 2; i int;
begin
  for i in 1..30 loop
    mid := (lo + hi) / 2;
    if ex_w(0, 0, need, mid) < p0 then lo := mid; else hi := mid; end if;
  end loop;
  return (lo + hi) / 2;
end $$;

create or replace function ex_round_win(ra int, rb int, pr numeric, pm numeric) returns numeric
language plpgsql immutable as $$
declare na int := 13 - ra; nb int := 13 - rb; p numeric := 0; k int;
begin
  if greatest(ra, rb) >= 13 and abs(ra - rb) >= 2 then return case when ra > rb then 0.99 else 0.01 end; end if;
  if ra >= 12 and rb >= 12 then return least(0.95, greatest(0.05, pm + (ra - rb) * 0.12)); end if;
  if na <= 0 then return 0.95; elsif nb <= 0 then return 0.05; end if;
  for k in 0..nb - 1 loop
    p := p + factorial(na + k - 1) / (factorial(k) * factorial(na - 1)) * power(pr, na) * power(1 - pr, k);
  end loop;
  return least(0.99, greatest(0.01, p));
end $$;

-- cuotas de las predicciones segun el estado en vivo (margen de la casa 6 %, entre 1,15 y 4,00). Se congelan al apostar.
--   gol: el ritmo de goles mezcla la media (0,034 por minuto) con lo que lleva el partido y sube al final; la ventana va de 3 a 13 minutos desde ahora.
--   ronda: probabilidad de ronda del local = 0,5 + 0,35 * (lo que se favorece en el mapa segun las cuotas de antes) + 0,2 * (probabilidad de ganar el
--          mapa ahora segun las rondas - 0,5) + 0,01 * (mapas del local - mapas del visitante); entre 0,2 y 0,8. Es el mismo modelo del cash out (024).
create or replace function ex_pred_cuotas(m matches) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare lv ex_live; mins numeric; eff numeric; rate numeric; p numeric; goals int; p0 numeric; pm numeric; q numeric; bo int; a int; c int; pr numeric; pr0 numeric;
begin
  select * into lv from ex_live where match_id = m.id;
  if not found or lv.at < now() - interval '3 minutes' then return jsonb_build_object('ok', false, 'why', 'Sin datos frescos del directo'); end if;
  if m.sport = 'f' then
    if lv.data->>'k' <> 'f' or lv.data->>'min' is null or lv.data->>'hs' is null or lv.data->>'as' is null then return jsonb_build_object('ok', false, 'why', 'Sin datos frescos del directo'); end if;
    if coalesce((lv.data->>'per')::int, 1) > 2 then return jsonb_build_object('ok', false, 'why', 'Prórroga: sin predicciones'); end if;
    mins := (lv.data->>'min')::numeric + extract(epoch from now() - lv.at) / 60;
    if mins > 78 then return jsonb_build_object('ok', false, 'why', 'Queda muy poco partido para una ventana de 10 minutos'); end if;
    eff := greatest(0, least(mins + 13, 93) - (mins + 3));
    goals := (lv.data->>'hs')::int + (lv.data->>'as')::int;
    rate := 0.034 * (0.7 + 0.3 * goals / greatest(0.034 * greatest(mins, 15), 0.5)) * case when mins >= 75 then 1.3 when mins >= 60 then 1.15 else 1 end;
    p := least(0.95, greatest(0.05, 1 - exp(-rate * eff)));
    return jsonb_build_object('ok', true, 'kind', 'gol', 'p', round(p, 3),
      'si', round(least(4.00, greatest(1.15, 1 / (p * 1.06))), 2), 'no', round(least(4.00, greatest(1.15, 1 / ((1 - p) * 1.06))), 2));
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
    'c1', round(least(4.00, greatest(1.15, 1 / (pr * 1.06))), 2), 'c2', round(least(4.00, greatest(1.15, 1 / ((1 - pr) * 1.06))), 2));
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
  if p_odds is not null and o < p_odds - 0.05 then raise exception 'La cuota ha cambiado: ahora es % (te enseñaban %)', replace(o::text, '.', ','), replace(p_odds::text, '.', ','); end if;
  perform pg_advisory_xact_lock(hashtext(me::text));
  if exists (select 1 from ex_pred where player = me and match_id = p_match and kind = 'gol' and status = 'open') then
    raise exception 'Ya tienes una predicción de gol abierta en este partido: espera a que se resuelva';
  end if;
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
  nlo := ob.n + floor(e / 155)::int;                                      -- rondas que casi seguro ya han acabado
  nhi := ob.n + 1 + ceil(e / 40)::int;                                    -- rondas que como mucho se han podido jugar
  -- el directo va por delante de vlr.gg: la ronda tiene que estar a mg rondas de lo que se sabe como minimo
  if nlo <= 13 and nhi >= 9 then raise exception 'Estamos cerca del descanso entre mitades: sin predicciones hasta pasarlo'; end if;
  if nlo >= 19 then raise exception 'El mapa está acabando: sin predicciones hasta el siguiente'; end if;
  lo := nlo + 1 + mg;
  hi := nhi + 1 + mg;
  if p_round is null or p_round < lo then raise exception 'Esa ronda puede haber empezado ya en el directo: la primera que se puede apostar es la %', lo; end if;
  if p_round > hi then raise exception 'Esa ronda está demasiado lejos'; end if;
  cu := ex_pred_cuotas(m);
  if not (cu->>'ok')::boolean then raise exception '%', cu->>'why'; end if;
  o := (cu->>case p_pick when '1' then 'c1' else 'c2' end)::numeric;
  if p_odds is not null and o < p_odds - 0.05 then raise exception 'La cuota ha cambiado: ahora es % (te enseñaban %)', replace(o::text, '.', ','), replace(p_odds::text, '.', ','); end if;
  perform pg_advisory_xact_lock(hashtext(me::text));
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

create or replace function ex_pred_estado() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  perform ex_pred_caducar();
  return jsonb_build_object(
    'max', ex_set_int('pred_max', 50), 'margen', ex_set_int('pred_ronda_margen', 3), 'retraso', ex_set_int('pred_gol_retraso', 180), 'gol_si', ex_set_num('pred_gol_si', 3.00), 'gol_no', ex_set_num('pred_gol_no', 1.25), 'ronda', ex_set_num('pred_ronda', 1.90),
    'live', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'sport', m.sport, 'home', m.home, 'away', m.away, 'c', ex_pred_cuotas(m)) order by m.starts_at), '[]'::jsonb)
             from matches m where m.status = 'live' and m.starts_at <= now() and m.starts_at > now() - interval '12 hours'
              and ((m.sport = 'f' and m.details->'espn' is not null) or m.sport = 'v')),
    'mine', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'match', p.match_id, 'kind', p.kind, 'pick', p.pick, 'ref', p.ref, 'n', p.n,
               'stake', p.stake, 'odds', p.odds, 'status', p.status, 'payout', p.payout, 'at', p.placed_at, 'from', p.win_from, 'to', p.win_to, 'ev', p.evidence) order by p.id desc), '[]'::jsonb)
             from (select * from ex_pred where player = me order by id desc limit 40) p)
  );
end $$;

revoke all on function sync_ex_live_put(text, jsonb), ex_w(int, int, int, numeric), ex_map_p(numeric, int), ex_round_win(int, int, numeric, numeric), ex_pred_cuotas(matches),
  ex_pred_gol(text, text, int, numeric), ex_pred_ronda(text, text, int, text, int, numeric), ex_pred_estado() from public, anon;
revoke all on function ex_w(int, int, int, numeric), ex_map_p(numeric, int), ex_round_win(int, int, numeric, numeric), ex_pred_cuotas(matches) from authenticated;
grant execute on function ex_pred_gol(text, text, int, numeric), ex_pred_ronda(text, text, int, text, int, numeric), ex_pred_estado() to authenticated;
grant execute on function sync_ex_live_put(text, jsonb) to anon, authenticated;
