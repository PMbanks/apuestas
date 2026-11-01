-- 036 (01-11). MAS TIPOS DE APUESTA. PM: "mas/menos goles y ambos marcan en futbol, y mapas en CS2 y Valorant".
-- Hasta hoy solo habia 1 / X / 2. Desde aqui bets.pick (y combo_legs.pick) admite tambien estos codigos:
--   Futbol    O1.5 U1.5 O2.5 U2.5 O3.5 U3.5   mas / menos de N,5 goles
--             GG NG                           ambos marcan: si / no
--   Series    S2-0 S2-1 S1-2 S0-2 (BO3)       resultado exacto de la serie, mapas del local primero
--   (Valorant S3-0 S3-1 S3-2 S2-3 S1-3 S0-3 (BO5)
--    y CS2)   H1+1.5 H2+1.5                   handicap de mapas: el local (1) o el visitante (2) con +1,5 mapas
--             MO2.5 MU2.5 (BO3), MO4.5 MU4.5  mas / menos de N,5 mapas jugados
-- Las cuotas viven en matches.odds_mk ({"O2.5": 1.92, "GG": 1.80, ...}). Las rellena el sincronizador (sync.mjs) solo
-- mientras el partido no ha empezado, igual que odds_1/x/2: de DraftKings via ESPN la linea de goles que traiga, y lo demas
-- con un modelo coherente con el 1X2 del partido (Poisson en futbol, mapas independientes en las series). Si un partido no
-- tiene cuota de un mercado, ese mercado no se puede apostar.
-- COMO SE PAGA (exacto, sin empates: todas las lineas son N,5):
--   * 1 / X / 2: igual que siempre (matches.winner).
--   * Goles y ambos marcan: con el resultado de los 90 minutos (mas el descuento), SIN prorroga ni penaltis, que guarda el
--     sincronizador en matches.details.r90 ("2:1"). Si no se sabe (prorroga sin el minuto de los goles), se devuelve.
--   * Series: con los mapas de matches.score. Solo si la serie se jugo entera al mejor de matches.bo (3 o 5): quien gana
--     tiene (bo+1)/2 mapas, el otro menos, y cuadra con matches.winner. Si no (abandono, "forfeit" de PandaScore en
--     details.ff, formato que no es al mejor de en details.mt, marcador raro), se devuelve. Un resultado exacto de otro
--     formato (S2-1 cuando la serie acabo siendo BO5) tambien se devuelve.
--   * Partido anulado (canceled) o sin ganador: se devuelve todo, como antes.
-- Lo que cambia:
--   place_bet: acepta los codigos nuevos con las mismas comprobaciones (partido sin empezar, saldo, candado, cuota congelada
--     al apostar). La cuota mejorada de la semana (022) solo vale para 1 / X / 2.
--   settle_match: paga cada apuesta con mk_resultado. combo_resuelve: lo mismo para las patas de las combinadas.
--   place_combo: las patas pueden ser de los mercados nuevos (un solo pronostico por partido, como antes: nada de dos patas
--     del mismo partido, que estarian relacionadas).
--   ex_cash_value (cash out, 024) y combo_cash_value (033): antes de empezar, con la cuota de ahora del mismo mercado; en
--     directo, futbol con Poisson desde el marcador y el minuto (goles esperados sacados de la linea de goles de antes del
--     partido), series con la probabilidad por mapa (como el 1X2).
--   pick_name: nombra las apuestas nuevas ("Más de 2,5 goles", "Ambos marcan: sí", "FaZe 2:0", "FURIA +1,5 mapas").
--   sync_push: guarda odds_mk. sync_discord_get (030): el escudo de la apuesta segun el equipo del mercado.
-- Sin cambios: apostar en directo (031) sigue siendo solo 1 / X / 2; retos (004) solo 1 / X / 2.
-- Se puede ejecutar varias veces. Va despues de 001 a 035. Despues: 036_prueba.sql.

alter table matches add column if not exists odds_mk jsonb;

-- ---------- los codigos ----------
create or replace function mk_valido(p text) returns boolean
language sql immutable as $$
  select coalesce(p ~ '^(1|X|2|[OU][0-9]\.5|GG|NG|S[0-4]-[0-4]|H[12]\+[0-9]\.5|M[OU][0-9]\.5)$', false)
$$;

alter table bets drop constraint if exists bets_pick_check;
alter table bets add constraint bets_pick_check
  check (pick ~ '^(1|X|2|[OU][0-9]\.5|GG|NG|S[0-4]-[0-4]|H[12]\+[0-9]\.5|M[OU][0-9]\.5)$');
alter table combo_legs drop constraint if exists combo_legs_pick_check;
alter table combo_legs add constraint combo_legs_pick_check
  check (pick ~ '^(1|X|2|[OU][0-9]\.5|GG|NG|S[0-4]-[0-4]|H[12]\+[0-9]\.5|M[OU][0-9]\.5)$');

-- si un codigo tiene sentido en ese partido: goles solo en futbol; mapas solo en Valorant y CS2 al mejor de 3 o 5, y el
-- resultado exacto con el numero de mapas de ese formato
create or replace function mk_encaja(m matches, p text) returns boolean
language plpgsql immutable as $$
declare need int; x int; y int;
begin
  if p in ('1', 'X', '2') then return true; end if;
  if not mk_valido(p) then return false; end if;
  if p ~ '^([OU][0-9]\.5|GG|NG)$' then return m.sport = 'f'; end if;
  if m.sport not in ('v', 'c') or coalesce(m.bo, 0) not in (3, 5) then return false; end if;
  need := (m.bo + 1) / 2;
  if left(p, 1) = 'S' then
    x := substr(p, 2, 1)::int; y := substr(p, 4, 1)::int;
    return greatest(x, y) = need and least(x, y) < need;
  end if;
  return true;
end $$;

-- la cuota de ahora de una eleccion (null: no se puede apostar)
create or replace function mk_cuota(m matches, p text) returns numeric
language plpgsql immutable as $$
declare o numeric;
begin
  if p = '1' then return m.odds_1; elsif p = 'X' then return m.odds_x; elsif p = '2' then return m.odds_2; end if;
  if not mk_encaja(m, p) or m.odds_mk is null or jsonb_typeof(m.odds_mk -> p) is distinct from 'number' then return null; end if;
  o := round((m.odds_mk ->> p)::numeric, 2);
  if o <= 1 or o > 500 then return null; end if;
  return o;
end $$;

-- de que equipo es una eleccion ('1', '2' o null si es de los dos, como los goles)
create or replace function mk_lado(p text) returns text
language sql immutable as $$
  select case
    when p in ('1', '2') then p
    when p ~ '^H[12]\+' then substr(p, 2, 1)
    when p ~ '^S[0-9]-[0-9]$' and substr(p, 2, 1) > substr(p, 4, 1) then '1'
    when p ~ '^S[0-9]-[0-9]$' and substr(p, 2, 1) < substr(p, 4, 1) then '2'
    else null end
$$;

-- el nombre que se lee en el chat, el monedero y Discord
create or replace function pick_name(m matches, p text) returns text
language sql immutable as $$
  select case
    when p = '1' then m.home
    when p = '2' then m.away
    when p = 'X' then 'Empate'
    when p ~ '^[OU][0-9]\.5$' then case left(p, 1) when 'O' then 'Más de ' else 'Menos de ' end || replace(substr(p, 2), '.', ',') || ' goles'
    when p = 'GG' then 'Ambos marcan: sí'
    when p = 'NG' then 'Ambos marcan: no'
    when p ~ '^S[0-9]-[0-9]$' then
      case when substr(p, 2, 1) > substr(p, 4, 1) then m.home || ' ' || substr(p, 2, 1) || ':' || substr(p, 4, 1)
           else m.away || ' ' || substr(p, 4, 1) || ':' || substr(p, 2, 1) end
    when p ~ '^H[12]\+[0-9]\.5$' then case substr(p, 2, 1) when '1' then m.home else m.away end || ' +' || replace(substr(p, 4), '.', ',') || ' mapas'
    when p ~ '^M[OU][0-9]\.5$' then case substr(p, 2, 1) when 'O' then 'Más de ' else 'Menos de ' end || replace(substr(p, 3), '.', ',') || ' mapas'
    else p end
$$;

-- ---------- series: si una eleccion sale con una serie que acaba x a y (mapas del local, del visitante) ----------
create or replace function mk_serie_ok(p text, x int, y int) returns boolean
language plpgsql immutable as $$
declare l numeric;
begin
  if left(p, 1) = 'S' then return x = substr(p, 2, 1)::int and y = substr(p, 4, 1)::int; end if;
  if left(p, 1) = 'H' then
    l := substr(p, 4)::numeric;
    return (case substr(p, 2, 1) when '1' then x - y else y - x end) + l > 0;
  end if;
  if left(p, 1) = 'M' then
    l := substr(p, 3)::numeric;
    return case substr(p, 2, 1) when 'O' then x + y > l else x + y < l end;
  end if;
  return false;
end $$;

-- ---------- el resultado de una eleccion en un partido acabado: 'won', 'lost' o 'void' (se devuelve) ----------
create or replace function mk_resultado(m matches, p text) returns text
language plpgsql immutable as $$
declare a int; b int; need int; l numeric; r90 text;
begin
  if m.status = 'canceled' or m.winner is null then return 'void'; end if;
  if p in ('1', 'X', '2') then return case when p = m.winner then 'won' else 'lost' end; end if;
  if not mk_valido(p) or not mk_encaja(m, p) then return 'void'; end if;
  -- futbol: el resultado de los 90 minutos
  if p ~ '^([OU][0-9]\.5|GG|NG)$' then
    r90 := m.details ->> 'r90';
    if r90 is null or r90 !~ '^[0-9]{1,2}:[0-9]{1,2}$' then return 'void'; end if;
    a := split_part(r90, ':', 1)::int; b := split_part(r90, ':', 2)::int;
    if p = 'GG' then return case when a > 0 and b > 0 then 'won' else 'lost' end; end if;
    if p = 'NG' then return case when a > 0 and b > 0 then 'lost' else 'won' end; end if;
    l := substr(p, 2)::numeric;
    return case when (left(p, 1) = 'O') = (a + b > l) then 'won' else 'lost' end;
  end if;
  -- series: jugada entera al mejor de bo
  if coalesce(m.details ->> 'ff', 'false') = 'true' or coalesce(m.details ->> 'mt', '') <> 'best_of' then return 'void'; end if;
  if m.score is null or m.score !~ '^[0-9]{1,2}:[0-9]{1,2}$' then return 'void'; end if;
  a := split_part(m.score, ':', 1)::int; b := split_part(m.score, ':', 2)::int; need := (m.bo + 1) / 2;
  if greatest(a, b) <> need or least(a, b) >= need or (a > b) <> (m.winner = '1') then return 'void'; end if;
  return case when mk_serie_ok(p, a, b) then 'won' else 'lost' end;
end $$;

-- ---------- modelos para el cash out en directo ----------
-- probabilidad de que una eleccion de goles acabe bien: ahora hs a as_, quedan goles Poisson lh (local) y la (visitante)
create or replace function mk_fut_p(p text, hs int, as_ int, lh numeric, la numeric) returns numeric
language plpgsql immutable as $$
declare pr numeric := 0; i int; j int; ph numeric; pa numeric; h int; a int; l numeric; ok boolean;
begin
  if p ~ '^[OU][0-9]\.5$' then l := substr(p, 2)::numeric; end if;
  for i in 0..10 loop
    ph := exp(-lh) * power(lh, i) / factorial(i);
    for j in 0..10 loop
      pa := exp(-la) * power(la, j) / factorial(j);
      h := hs + i; a := as_ + j;
      ok := case when p = 'GG' then h > 0 and a > 0 when p = 'NG' then not (h > 0 and a > 0)
                 when left(p, 1) = 'O' then h + a > l when left(p, 1) = 'U' then h + a < l else false end;
      if ok then pr := pr + ph * pa; end if;
    end loop;
  end loop;
  return pr;
end $$;

-- los goles esperados del partido entero que dice la linea de goles de antes de empezar (si no hay, 2,7 como en 024)
create or replace function mk_lambda(m matches) returns numeric
language plpgsql immutable as $$
declare lin text; o numeric; u numeric; po numeric; lo numeric := 0.3; hi numeric := 7; mid numeric; t numeric; k int; i int; l numeric;
begin
  foreach lin in array array['2.5', '1.5', '3.5'] loop
    o := mk_cuota(m, 'O' || lin); u := mk_cuota(m, 'U' || lin);
    if o is not null and u is not null then
      po := (1 / o) / ((1 / o) + (1 / u)); l := lin::numeric;
      for i in 1..30 loop
        mid := (lo + hi) / 2; t := 0;
        for k in 0..floor(l)::int loop t := t + exp(-mid) * power(mid, k) / factorial(k); end loop;
        if 1 - t < po then lo := mid; else hi := mid; end if;
      end loop;
      return (lo + hi) / 2;
    end if;
  end loop;
  return 2.7;
end $$;

-- series: probabilidad de que una eleccion salga desde x mapas a y, con pm de ganar cada mapa el local
create or replace function mk_serie_p(p text, x int, y int, need int, pm numeric) returns numeric
language plpgsql immutable as $$
begin
  if x >= need or y >= need then return case when mk_serie_ok(p, x, y) then 1 else 0 end; end if;
  return pm * mk_serie_p(p, x + 1, y, need, pm) + (1 - pm) * mk_serie_p(p, x, y + 1, need, pm);
end $$;

-- ---------- cuanto vale una apuesta ahora (cash out, 024) ----------
-- Igual que en 024 para 1 / X / 2. Para los mercados nuevos: antes de empezar, con la cuota de ahora del mismo mercado;
-- en directo, con el modelo de arriba. Devuelve {ok, mode, value, win, why, p}
create or replace function ex_cash_value(b bets, m matches) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  win int := round(b.stake * b.odds)::int; cur numeric; v numeric; lv ex_live; p numeric; sh numeric; p0 numeric; pm numeric; pr numeric; q numeric;
  bo int; need int; a int; c int; mins numeric; rem numeric; pw numeric; lam numeric; nuevo boolean := b.pick not in ('1', 'X', '2');
begin
  if b.status <> 'open' then return jsonb_build_object('ok', false, 'why', 'La apuesta ya está cerrada'); end if;
  if b.boost is not null then return jsonb_build_object('ok', false, 'why', 'Las apuestas con cuota mejorada no admiten cash out'); end if;
  if m.status = 'scheduled' and m.starts_at > now() then
    cur := mk_cuota(m, b.pick);
    if cur is null or cur <= 1 then return jsonb_build_object('ok', false, 'why', 'Ahora no hay cuota para ese resultado'); end if;
    v := b.stake * b.odds / cur * 0.95;
    return jsonb_build_object('ok', true, 'mode', 'pre', 'win', win, 'value', least(win, greatest(1, round(v)))::int);
  end if;
  if m.status <> 'live' then return jsonb_build_object('ok', false, 'why', 'El partido no está en juego'); end if;
  if m.sport = 'u' then return jsonb_build_object('ok', false, 'why', 'La UFC no tiene cash out en directo'); end if;
  if nuevo and not mk_encaja(m, b.pick) then return jsonb_build_object('ok', false, 'why', 'Ahora no se puede retirar'); end if;
  select * into lv from ex_live where match_id = m.id;
  if not found or lv.at < now() - interval '3 minutes' then return jsonb_build_object('ok', false, 'why', 'Sin datos frescos del directo'); end if;
  if m.sport = 'f' then
    if lv.data->>'k' <> 'f' or lv.data->>'min' is null or lv.data->>'hs' is null or lv.data->>'as' is null then return jsonb_build_object('ok', false, 'why', 'Sin datos frescos del directo'); end if;
    if coalesce((lv.data->>'per')::int, 1) > 2 then return jsonb_build_object('ok', false, 'why', 'Prórroga: sin cash out'); end if;
    mins := (lv.data->>'min')::numeric;
    rem := case when mins >= 90 then 2 else 92 - mins end;
    sh := case when m.odds_1 > 1 and m.odds_2 > 1 then least(0.75, greatest(0.25, (1 / m.odds_1) / ((1 / m.odds_1) + (1 / m.odds_2)))) else 0.5 end;
    if nuevo then
      lam := mk_lambda(m) * greatest(rem, 0.5) / 90.0;
      p := mk_fut_p(b.pick, (lv.data->>'hs')::int, (lv.data->>'as')::int, lam * sh, lam * (1 - sh));
    else
      p := ex_fut_prob(b.pick, (lv.data->>'hs')::int - (lv.data->>'as')::int, rem, sh);
    end if;
  else
    if lv.data->>'k' <> 's' or lv.data->>'a' is null or lv.data->>'b' is null or b.pick = 'X' then return jsonb_build_object('ok', false, 'why', 'Sin datos frescos del directo'); end if;
    bo := coalesce(nullif((lv.data->>'bo')::int, 0), m.bo, 3); if bo not in (1, 3, 5, 7) then bo := 3; end if;
    if nuevo and bo <> m.bo then return jsonb_build_object('ok', false, 'why', 'Ahora no se puede retirar'); end if;
    need := (bo + 1) / 2; a := (lv.data->>'a')::int; c := (lv.data->>'b')::int;
    p0 := case when m.odds_1 > 1 and m.odds_2 > 1 then (1 / m.odds_1) / ((1 / m.odds_1) + (1 / m.odds_2)) else 0.5 end;
    pm := ex_map_p(least(0.97, greatest(0.03, p0)), bo);
    if a >= need or c >= need then return jsonb_build_object('ok', false, 'why', 'La serie está decidida: espera al pago'); end if;
    if lv.data->>'ra' is not null and lv.data->>'rb' is not null then
      pr := 0.5 + (pm - 0.5) * 0.35;
      q := ex_round_win((lv.data->>'ra')::int, (lv.data->>'rb')::int, pr, pm);
    else q := pm; end if;
    if nuevo then
      p := q * mk_serie_p(b.pick, a + 1, c, need, pm) + (1 - q) * mk_serie_p(b.pick, a, c + 1, need, pm);
    else
      pw := q * ex_w(a + 1, c, need, pm) + (1 - q) * ex_w(a, c + 1, need, pm);
      p := case b.pick when '1' then pw else 1 - pw end;
    end if;
  end if;
  v := b.stake * b.odds * least(0.99, greatest(0.01, p)) * 0.90;
  return jsonb_build_object('ok', true, 'mode', 'live', 'win', win, 'value', least(win, greatest(1, round(v)))::int, 'p', round(p, 3));
end $$;

-- ---------- apostar ----------
-- Igual que en 022 (cierre al empezar, saldo, candado por jugador, cuota congelada en bets.odds). Acepta los mercados
-- nuevos y la cuota mejorada solo vale para 1 / X / 2.
create or replace function place_bet(p_match text, p_pick text, p_stake int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  m matches;
  o numeric;
  bal int;
  bid bigint;
  pct int;
  tope int;
  usado int;
begin
  if me is null or not exists (select 1 from players where id = me) then raise exception 'Tienes que entrar primero'; end if;
  perform pay_week();
  select * into m from matches where id = p_match;
  if not found then raise exception 'Ese partido no existe'; end if;
  if m.status <> 'scheduled' or m.starts_at <= now() then raise exception 'Este partido ya ha empezado: apuestas cerradas'; end if;
  if not mk_valido(p_pick) then raise exception 'Elige 1, X o 2'; end if;
  o := mk_cuota(m, p_pick);
  if o is null or o <= 1 then raise exception 'Esa opción no se puede apostar'; end if;
  if p_stake is null or p_stake < 1 then raise exception 'La apuesta mínima es 1'; end if;
  perform pg_advisory_xact_lock(hashtext(me::text));      -- dos apuestas a la vez del mismo jugador no se pisan
  pct := case when p_pick in ('1', 'X', '2') then ex_boost_pct(p_match, p_pick) end;
  if pct is not null then
    o := round(o * (100 + pct) / 100.0, 2);
    tope := coalesce((select (value #>> '{}')::int from settings where key = 'boost_tope'), 1000);
    select coalesce(sum(stake), 0) into usado from bets where player = me and match_id = p_match and boost is not null and status <> 'void';
    if usado + p_stake > tope then
      raise exception 'La cuota mejorada admite hasta % por jugador en este partido y te quedan %', fmt_int(tope), fmt_int(greatest(0, tope - usado));
    end if;
  end if;
  select coalesce(sum(amount), 0) into bal from ledger where player = me;
  if p_stake > bal then raise exception 'No tienes saldo suficiente: te quedan %', fmt_int(bal); end if;
  insert into bets(player, match_id, pick, stake, odds, boost) values (me, p_match, p_pick, p_stake, o, pct) returning id into bid;
  insert into ledger(player, amount, kind, note, bet_id)
    values (me, -p_stake, 'apuesta', pick_name(m, p_pick) || ' ' || fmt_odds(o) || case when pct is not null then ' · cuota mejorada' else '' end, bid);
  perform bump();
  return jsonb_build_object('bet', bid, 'saldo', bal - p_stake, 'odds', o, 'boost', pct);
end $$;

-- ---------- pagar ----------
-- Igual que en 004 (con el extra de la apuesta del dia cuando esta encendido). Cada apuesta, con mk_resultado.
create or replace function settle_match(p_match text) returns int
language plpgsql security definer set search_path = public as $$
declare m matches; b record; n int := 0; res text; extra numeric := 1; pay int; r text;
begin
  select * into m from matches where id = p_match for update;
  if not found or m.settled or m.status not in ('final','canceled') then return 0; end if;
  if (select (value #>> '{}')::boolean from settings where key = 'daily_on') and exists (select 1 from daily where match_id = p_match) then
    extra := (select (value #>> '{}')::numeric from settings where key = 'daily_bonus');
  end if;
  res := m.home || ' ' || coalesce(m.score, '') || ' ' || m.away;
  for b in select bets.*, p.name from bets join players p on p.id = bets.player
           where match_id = p_match and status = 'open' for update of bets loop
    r := mk_resultado(m, b.pick);
    if m.status = 'canceled' or m.winner is null then
      update bets set status = 'void', payout = b.stake, settled_at = now() where id = b.id;
      insert into ledger(player, amount, kind, note, bet_id) values (b.player, b.stake, 'devolucion', 'Anulado: ' || m.home || ' vs ' || m.away, b.id);
      insert into chat(body) values (b.name || ' recupera ' || fmt_int(b.stake) || ': ' || m.home || ' vs ' || m.away || ' no se ha jugado');
    elsif r = 'void' then
      update bets set status = 'void', payout = b.stake, settled_at = now() where id = b.id;
      insert into ledger(player, amount, kind, note, bet_id)
        values (b.player, b.stake, 'devolucion', 'Anulado: ' || pick_name(m, b.pick) || ' · ' || m.home || ' vs ' || m.away, b.id);
      insert into chat(body) values (b.name || ' recupera ' || fmt_int(b.stake) || ': ' || pick_name(m, b.pick) || ' en ' || m.home || ' vs ' || m.away
        || case when m.sport = 'f' then ' no tiene resultado de los 90 minutos' else ' no tiene una serie completa' end);
    elsif r = 'won' then
      pay := round(b.stake * b.odds * extra)::int;
      update bets set status = 'won', payout = pay, settled_at = now() where id = b.id;
      insert into ledger(player, amount, kind, note, bet_id)
        values (b.player, pay, 'premio', pick_name(m, b.pick) || ' ' || fmt_odds(b.odds) || case when extra > 1 then ' · apuesta del día' else '' end, b.id);
      insert into chat(body) values (b.name || ' ganó ' || fmt_int(pay) || ' con ' || pick_name(m, b.pick) || ' · ' || res || case when extra > 1 then ' · apuesta del día' else '' end);
    else
      update bets set status = 'lost', settled_at = now() where id = b.id;
      insert into chat(body) values (b.name || ' perdió ' || fmt_int(b.stake) || ' con ' || pick_name(m, b.pick) || ' · ' || res);
    end if;
    n := n + 1;
  end loop;
  update matches set settled = true where id = p_match;
  perform bump();
  return n;
end $$;

-- ---------- combinadas (029 y 033) ----------
-- Igual que en 029: de 2 a 8 partidos distintos, cuota = producto (tope 1.000). Las patas pueden ser de los mercados nuevos.
create or replace function place_combo(p_legs jsonb, p_stake int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); l jsonb; m matches; o numeric; tot numeric := 1; n int; bal int; cid bigint; vistos text[] := '{}';
begin
  if me is null or not exists (select 1 from players where id = me) then raise exception 'Tienes que entrar primero'; end if;
  perform pay_week();
  if p_legs is null or jsonb_typeof(p_legs) <> 'array' then raise exception 'Elige los partidos de la combinada'; end if;
  n := jsonb_array_length(p_legs);
  if n < 2 then raise exception 'Una combinada lleva 2 partidos como mínimo'; end if;
  if n > 8 then raise exception 'Una combinada lleva 8 partidos como máximo'; end if;
  if p_stake is null or p_stake < 1 then raise exception 'La apuesta mínima es 1'; end if;
  perform pg_advisory_xact_lock(hashtext(me::text));
  for l in select * from jsonb_array_elements(p_legs) loop
    select * into m from matches where id = l->>'match';
    if not found then raise exception 'Ese partido no existe'; end if;
    if m.id = any(vistos) then raise exception 'Una combinada no puede llevar dos veces el mismo partido'; end if;
    vistos := vistos || m.id;
    if m.status <> 'scheduled' or m.starts_at <= now() then raise exception '% vs % ya ha empezado: quítalo de la combinada', m.home, m.away; end if;
    if not mk_valido(l->>'pick') then raise exception 'Elige 1, X o 2'; end if;
    o := mk_cuota(m, l->>'pick');
    if o is null or o <= 1 then raise exception 'Esa opción de % vs % no se puede apostar', m.home, m.away; end if;
    tot := tot * o;
  end loop;
  tot := least(round(tot, 2), 1000);
  select coalesce(sum(amount), 0) into bal from ledger where player = me;
  if p_stake > bal then raise exception 'No tienes saldo suficiente: te quedan %', fmt_int(bal); end if;
  insert into combos(player, stake, odds) values (me, p_stake, tot) returning id into cid;
  insert into combo_legs(combo_id, match_id, pick, odds)
    select cid, x->>'match', x->>'pick', mk_cuota(mm, x->>'pick')
    from jsonb_array_elements(p_legs) x join matches mm on mm.id = x->>'match';
  insert into ledger(player, amount, kind, note) values (me, -p_stake, 'apuesta', 'Combinada de ' || n || ' · cuota ' || fmt_odds(tot));
  insert into chat(body) select p.name || ' hace una combinada de ' || n || ' partidos por ' || fmt_int(p_stake) || ' a cuota ' || fmt_odds(tot) from players p where p.id = me;
  perform bump();
  return jsonb_build_object('combo', cid, 'odds', tot, 'saldo', bal - p_stake);
end $$;

-- Igual que en 029, con el resultado de cada pata segun su mercado
create or replace function combo_resuelve(p_match text) returns int
language plpgsql security definer set search_path = public as $$
declare m matches; c combos; n int := 0; pend int; perd int; gan int; prod numeric; pay int; nm text;
begin
  select * into m from matches where id = p_match;
  if not found or m.status not in ('final', 'canceled') then return 0; end if;
  update combo_legs l set result = mk_resultado(m, l.pick)
    where l.match_id = p_match and l.result is null;
  for c in select * from combos where status = 'open' and id in (select combo_id from combo_legs where match_id = p_match) for update loop
    select count(*) filter (where result is null), count(*) filter (where result = 'lost'), count(*) filter (where result = 'won'),
           coalesce(exp(sum(ln(odds)) filter (where result = 'won')), 1)
      into pend, perd, gan, prod from combo_legs where combo_id = c.id;
    nm := (select name from players where id = c.player);
    if perd > 0 then
      update combos set status = 'lost', settled_at = now() where id = c.id;
      insert into chat(body) values (nm || ' perdió una combinada de ' || fmt_int(c.stake));
    elsif pend = 0 and gan = 0 then
      update combos set status = 'void', payout = c.stake, settled_at = now() where id = c.id;
      insert into ledger(player, amount, kind, note) values (c.player, c.stake, 'devolucion', 'Combinada anulada');
    elsif pend = 0 then
      prod := least(round(prod, 2), 1000);
      pay := round(c.stake * prod)::int;
      update combos set status = 'won', payout = pay, settled_at = now() where id = c.id;
      insert into ledger(player, amount, kind, note) values (c.player, pay, 'premio', 'Combinada · cuota ' || fmt_odds(prod));
      insert into chat(body) values (nm || ' ganó ' || fmt_int(pay) || ' con una combinada de ' || (pend + gan + perd) || ' partidos');
    end if;
    n := n + 1;
  end loop;
  if n > 0 then perform bump(); end if;
  return n;
end $$;

-- Igual que en 033, con la cuota de ahora del mismo mercado para los partidos sin empezar
create or replace function combo_cash_value(c combos) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare l combo_legs; m matches; b bets; q jsonb; p numeric := 1; paga numeric := c.stake; empezado boolean := false; cur numeric; v numeric;
begin
  if c.status <> 'open' then return jsonb_build_object('ok', false, 'why', 'La combinada ya está cerrada'); end if;
  for l in select * from combo_legs where combo_id = c.id loop
    if l.result = 'lost' then return jsonb_build_object('ok', false, 'why', 'Ya ha fallado un partido'); end if;
    if l.result = 'won' then paga := paga * l.odds; empezado := true; continue; end if;
    if l.result = 'void' then empezado := true; continue; end if;
    paga := paga * l.odds;
    select * into m from matches where id = l.match_id;
    if m.status = 'scheduled' and m.starts_at > now() then
      cur := mk_cuota(m, l.pick);
      if cur is null or cur <= 1 then return jsonb_build_object('ok', false, 'why', 'Ahora no hay cuota para uno de sus partidos'); end if;
      p := p * least(0.97, 1 / (cur * 1.05));
    else
      empezado := true;
      b.status := 'open'; b.boost := null; b.pick := l.pick; b.stake := 100; b.odds := l.odds;
      q := ex_cash_value(b, m);
      if not coalesce((q->>'ok')::boolean, false) or q->>'p' is null then
        return jsonb_build_object('ok', false, 'why', coalesce(q->>'why', 'Sin datos frescos del directo'));
      end if;
      p := p * (q->>'p')::numeric;
    end if;
  end loop;
  if not empezado then return jsonb_build_object('ok', false, 'mode', 'pre', 'why', 'Aún no ha empezado ninguno: cancélala y te devuelve todo'); end if;
  paga := least(paga, c.stake * 1000);
  v := paga * least(0.99, greatest(0.001, p)) * 0.90;
  return jsonb_build_object('ok', true, 'mode', 'live', 'win', round(paga)::int, 'value', least(round(paga), greatest(1, round(v)))::int);
end $$;

-- ---------- el sincronizador guarda las cuotas nuevas ----------
-- solo codigos validos con cuota entre 1,01 y 500 (lo demas se tira)
create or replace function mk_limpia(j jsonb) returns jsonb
language sql immutable as $$
  select case when j is null or jsonb_typeof(j) <> 'object' then null else
    coalesce((select jsonb_object_agg(k, round(v::text::numeric, 2)) from jsonb_each(j) e(k, v)
              where mk_valido(k) and k not in ('1', 'X', '2') and jsonb_typeof(v) = 'number' and v::text::numeric > 1 and v::text::numeric <= 500), '{}'::jsonb) end
$$;

-- Igual que en 005, y ademas odds_mk: se cambia solo mientras el partido no ha empezado y si el sincronizador la manda
-- (un sincronizador de antes, que no la manda, no borra lo que hay)
create or replace function sync_push(p_secret text, p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare r jsonb; n int := 0;
begin
  if p_secret is null or p_secret <> (select value #>> '{}' from settings where key = 'sync_secret') then
    raise exception 'Clave de sincronización no válida';
  end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]')) loop
    if exists (select 1 from matches where id = r->>'id' and settled) then continue; end if;
    insert into matches(id, sport, league, league_name, league_logo, stage, tag, venue, home, away, home_logo, away_logo,
                        starts_at, status, score, winner, bo, details, odds_1, odds_x, odds_2, odds_src, odds_mk, updated_at)
    values (r->>'id', r->>'sport', r->>'league', r->>'league_name', r->>'league_logo', r->>'stage', r->>'tag', r->>'venue',
            r->>'home', r->>'away', r->>'home_logo', r->>'away_logo', (r->>'starts_at')::timestamptz, r->>'status', r->>'score',
            r->>'winner', (r->>'bo')::int, coalesce(r->'details', '{}'), (r->>'odds_1')::numeric, (r->>'odds_x')::numeric,
            (r->>'odds_2')::numeric, r->>'odds_src', mk_limpia(r->'odds_mk'), now())
    on conflict (id) do update set
      sport = excluded.sport, league = excluded.league, league_name = excluded.league_name, league_logo = excluded.league_logo,
      stage = excluded.stage, tag = excluded.tag, venue = excluded.venue, home = excluded.home, away = excluded.away,
      home_logo = keep_logo(matches.home_logo, excluded.home_logo), away_logo = keep_logo(matches.away_logo, excluded.away_logo),
      starts_at = excluded.starts_at, status = excluded.status,
      score = excluded.score, winner = excluded.winner, bo = excluded.bo, details = excluded.details,
      odds_1 = case when excluded.status = 'scheduled' and excluded.odds_1 is not null then excluded.odds_1 else matches.odds_1 end,
      odds_x = case when excluded.status = 'scheduled' and excluded.odds_1 is not null then excluded.odds_x else matches.odds_x end,
      odds_2 = case when excluded.status = 'scheduled' and excluded.odds_2 is not null then excluded.odds_2 else matches.odds_2 end,
      odds_src = case when excluded.status = 'scheduled' and excluded.odds_src is not null then excluded.odds_src else matches.odds_src end,
      odds_mk = case when excluded.status = 'scheduled' and excluded.odds_mk is not null then excluded.odds_mk else matches.odds_mk end,
      updated_at = now();
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- Discord (030): el escudo de la apuesta, del equipo del mercado (o del local si es de los dos) ----------
create or replace function sync_discord_get(p_secret text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  partidos jsonb; apuestas jsonb; skins jsonb; resumen jsonb := null; retiradas jsonb; combinadas jsonb;
  min_ap int := coalesce((select (value #>> '{}')::int from settings where key = 'discord_min_apuesta'), 300);
  min_lu int := coalesce((select (value #>> '{}')::int from settings where key = 'discord_min_lujo'), 1500);
  wk date := madrid_week();
  ini timestamptz := ((wk - 7)::timestamp at time zone 'Europe/Madrid');
  fin timestamptz := (wk::timestamp at time zone 'Europe/Madrid');
begin
  if p_secret is null or p_secret <> (select value #>> '{}' from settings where key = 'sync_secret') then
    raise exception 'Clave de sincronización no válida';
  end if;

  select coalesce(jsonb_agg(q.x order by q.x->>'empieza'), '[]') into partidos from (
    select jsonb_build_object('clave', 'ini:' || m.id, 'id', m.id, 'sport', m.sport, 'liga', m.league_name, 'home', m.home, 'away', m.away,
             'logo', m.home_logo, 'empieza', m.starts_at, 'n', count(*), 'total', sum(b.stake),
             'jugadores', (select jsonb_agg(distinct p.name) from bets b2 join players p on p.id = b2.player where b2.match_id = m.id and b2.status = 'open')) as x
      from matches m join bets b on b.match_id = m.id and b.status = 'open'
     where m.status = 'scheduled' and m.starts_at > now() and m.starts_at <= now() + interval '15 minutes'
       and not exists (select 1 from discord_avisos d where d.clave = 'ini:' || m.id)
     group by m.id) q;

  select coalesce(jsonb_agg(jsonb_build_object('clave', 'apuesta:' || b.id, 'jugador', p.name, 'estado', b.status, 'stake', b.stake, 'payout', b.payout,
           'odds', b.odds, 'pick', pick_name(m, b.pick), 'home', m.home, 'away', m.away, 'liga', m.league_name,
           'logo', case mk_lado(b.pick) when '2' then m.away_logo else m.home_logo end) order by b.settled_at), '[]') into apuestas
    from bets b join players p on p.id = b.player join matches m on m.id = b.match_id
   where b.status in ('won', 'lost') and b.stake >= min_ap and b.settled_at > now() - interval '3 hours'
     and not exists (select 1 from discord_avisos d where d.clave = 'apuesta:' || b.id);

  select coalesce(jsonb_agg(jsonb_build_object('clave', 'retirada:' || b.id, 'jugador', p.name, 'stake', b.stake, 'payout', b.payout,
           'odds', b.odds, 'pick', pick_name(m, b.pick), 'home', m.home, 'away', m.away, 'liga', m.league_name,
           'logo', case mk_lado(b.pick) when '2' then m.away_logo else m.home_logo end) order by b.settled_at), '[]') into retiradas
    from bets b join players p on p.id = b.player join matches m on m.id = b.match_id
   where b.status = 'cashout' and b.stake >= min_ap and b.settled_at > now() - interval '3 hours'
     and not exists (select 1 from discord_avisos d where d.clave = 'retirada:' || b.id);

  select coalesce(jsonb_agg(jsonb_build_object('clave', 'combo:' || c.id, 'jugador', p.name, 'estado', c.status, 'stake', c.stake, 'payout', c.payout,
           'odds', c.odds, 'patas', (select jsonb_agg(jsonb_build_object('pick', pick_name(m, l.pick), 'home', m.home, 'away', m.away, 'res', l.result) order by m.starts_at)
                                      from combo_legs l join matches m on m.id = l.match_id where l.combo_id = c.id)) order by c.settled_at), '[]') into combinadas
    from combos c join players p on p.id = c.player
   where c.status in ('won', 'lost') and (c.status = 'won' or c.stake >= min_ap) and c.settled_at > now() - interval '3 hours'
     and not exists (select 1 from discord_avisos d where d.clave = 'combo:' || c.id);

  select coalesce(jsonb_agg(jsonb_build_object('clave', 'skin:' || i.id, 'jugador', p.name, 'nombre', it.name, 'fase', it.phase, 'rareza', it.rarity,
           'valor', i.value, 'imagen', it.image, 'caja', c.name, 'lujo', it.id like 'lujo%', 'stattrak', i.st, 'batalla', i.battle_id is not null) order by i.created_at), '[]') into skins
    from cs_inv i join cs_items it on it.id = i.item_id join players p on p.id = coalesce(i.opened_by, i.player) left join cs_cases c on c.id = i.case_id
   where i.created_at > now() - interval '3 hours'
     and ((it.id not like 'lujo%' and it.rarity = 'esp') or (it.id like 'lujo%' and i.value >= min_lu))
     and not exists (select 1 from discord_avisos d where d.clave = 'skin:' || i.id);

  if exists (select 1 from ledger where kind = 'paga' and week = wk) and now() < fin + interval '3 days'
     and not exists (select 1 from discord_avisos d where d.clave = 'resumen:' || wk::text) then
    select jsonb_build_object('clave', 'resumen:' || wk::text, 'desde', wk - 7, 'hasta', wk - 1,
             'filas', coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'neto', t.neto, 'saldo', t.saldo, 'aciertos', t.aciertos, 'apuestas', t.apuestas) order by t.neto desc, t.name), '[]')) into resumen
      from (select p.name,
              coalesce((select sum(amount) from ledger l where l.player = p.id and l.kind in ('apuesta', 'premio', 'devolucion') and l.created_at >= ini and l.created_at < fin), 0)::int as neto,
              coalesce((select sum(amount) from ledger l where l.player = p.id), 0)::int as saldo,
              ((select count(*) from bets b where b.player = p.id and b.status = 'won' and b.settled_at >= ini and b.settled_at < fin)
                + (select count(*) from combos c where c.player = p.id and c.status = 'won' and c.settled_at >= ini and c.settled_at < fin))::int as aciertos,
              ((select count(*) from bets b where b.player = p.id and b.status in ('won', 'lost', 'cashout') and b.settled_at >= ini and b.settled_at < fin)
                + (select count(*) from combos c where c.player = p.id and c.status in ('won', 'lost') and c.settled_at >= ini and c.settled_at < fin))::int as apuestas
              from players p) t;
  end if;

  return jsonb_build_object('partidos', partidos, 'apuestas', apuestas, 'skins', skins, 'resumen', resumen, 'retiradas', retiradas, 'combinadas', combinadas);
end $$;

-- ---------- quien puede llamar a que ----------
-- (place_bet, place_combo, sync_push, sync_discord_get, settle_match, combo_resuelve, ex_cash_value y combo_cash_value
--  conservan sus permisos de antes: create or replace no los toca)
revoke all on function mk_valido(text), mk_encaja(matches, text), mk_cuota(matches, text), mk_lado(text), mk_serie_ok(text, int, int),
  mk_resultado(matches, text), mk_fut_p(text, int, int, numeric, numeric), mk_lambda(matches), mk_serie_p(text, int, int, int, numeric),
  mk_limpia(jsonb) from public, anon, authenticated;
