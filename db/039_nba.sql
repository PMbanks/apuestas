-- 039 (01-11). NBA. PM: "pon nba tambien pero solo nba, no las demas ligas, para poder apostar, y que sea como el futbol que se
-- pueda apostar, y tambien a jugadores y todo eso".
-- Va despues de 037 (mapas) y 038 (moneda). Parte de las funciones de 037 tal cual y les anade la NBA (matches.sport = 'b').
-- Los partidos los trae el sincronizador (sync/nba.mjs) de ESPN, gratis: cuotas de DraftKings via ESPN (ganador, handicap,
-- total y jugadores) y, si DraftKings no las da, un modelo (record de los dos; los jugadores, con sus ultimos partidos).
-- CODIGOS NUEVOS (bets.pick y combo_legs.pick), solo en la NBA:
--   1, 2                     gana el local o el visitante. No hay empate (X no tiene cuota). Cuenta la prorroga.
--   SP1-6.5  SP2+6.5         handicap del local (SP1) o del visitante (SP2) con esa linea, N o N,5 (hasta 99,5)
--   TO220.5  TU220.5         mas / menos de N puntos entre los dos (tres cifras, N o N,5)
--   J1:4251:PO17.5           jugador del local (J1) o del visitante (J2), su id de ESPN, estadistica y mas (O) / menos (U) de
--                            una linea N,5: P puntos, R rebotes, A asistencias, T triples, X puntos + rebotes + asistencias
-- COMO SE PAGA:
--   * Partido anulado, sin ganador, o marcador que no cuadra con el ganador: se devuelve todo (como siempre).
--   * 1 / 2: con matches.winner (el marcador final, prorroga incluida).
--   * Handicap y total: con matches.score ("112:98", local primero, prorroga incluida). Si cae justo en la linea (lineas
--     enteras), se devuelve.
--   * Jugadores: con la hoja final que guarda el sincronizador en matches.details.bx ({id: [puntos, rebotes, asistencias,
--     triples]}, prorroga incluida) y details.bxok = true (la hoja esta entera). Jugador que no esta en la hoja (no ha jugado)
--     o hoja que falta: SE DEVUELVE lo apostado.
-- Solo antes de empezar (place_bet y place_combo ya lo exigen). Sin apuestas en directo en la NBA (ex_live_odds: con un
-- tanteo que cambia cada pocos segundos, la revision de 031 anularia casi todas).
-- CASH OUT (ex_cash_value): antes de empezar, con la cuota de ahora del mismo mercado (como 036). En directo, con el marcador,
--   el cuarto y el reloj que guarda el sincronizador en ex_live ({k:'b', hs, as, per, clk, pj:{id:[p,r,a,t]}}): lo que queda
--   del partido como una normal (ventaja esperada sacada del handicap o de las cuotas de antes, puntos esperados del total);
--   jugadores, con lo que lleva y lo que le queda al ritmo de su linea. Jugador que aun no ha salido a pista: sin cash out.
-- Combinadas: como 036 (una pata por partido, la pata devuelta no cuenta).
-- Nombres (pick_name): "Celtics −6,5" (con el signo menos de verdad), "Más de 220,5 puntos",
--   "Jayson Tatum: más de 26,5 puntos" (nombre de matches.details.pj; si no esta, "Jugador").
-- Cambia: el check de matches.sport, mk_valido y las restricciones de bets y combo_legs, mk_encaja, mk_lado, pick_name,
--   mk_resultado, ex_cash_value, settle_match (el aviso del chat cuando se devuelve) y ex_live_odds (sin directo en la NBA).
-- Nuevas: mk_ncdf, mk_ninv, mk_nba_linea, mk_nba_stat, mk_nba_p.
-- Se puede ejecutar varias veces. Despues: 039_prueba.sql.

-- ---------- el deporte ----------
alter table matches drop constraint if exists matches_sport_check;
alter table matches add constraint matches_sport_check check (sport in ('f','v','u','c','b'));

-- ---------- los codigos ----------
create or replace function mk_valido(p text) returns boolean
language sql immutable as $$
  select coalesce(p ~ '^(1|X|2|[OU][0-9]\.5|GG|NG|S[0-4]-[0-4]|H[12]\+[0-9]\.5|M[OU][0-9]\.5|W[1-5]-[12]|SP[12][+-][0-9]{1,2}(\.5)?|T[OU][0-9]{3}(\.5)?|J[12]:[0-9]{1,10}:[PRATX][OU][0-9]{1,2}\.5)$', false)
$$;

alter table bets drop constraint if exists bets_pick_check;
alter table bets add constraint bets_pick_check
  check (pick ~ '^(1|X|2|[OU][0-9]\.5|GG|NG|S[0-4]-[0-4]|H[12]\+[0-9]\.5|M[OU][0-9]\.5|W[1-5]-[12]|SP[12][+-][0-9]{1,2}(\.5)?|T[OU][0-9]{3}(\.5)?|J[12]:[0-9]{1,10}:[PRATX][OU][0-9]{1,2}\.5)$');
alter table combo_legs drop constraint if exists combo_legs_pick_check;
alter table combo_legs add constraint combo_legs_pick_check
  check (pick ~ '^(1|X|2|[OU][0-9]\.5|GG|NG|S[0-4]-[0-4]|H[12]\+[0-9]\.5|M[OU][0-9]\.5|W[1-5]-[12]|SP[12][+-][0-9]{1,2}(\.5)?|T[OU][0-9]{3}(\.5)?|J[12]:[0-9]{1,10}:[PRATX][OU][0-9]{1,2}\.5)$');

-- los de la NBA solo en la NBA (y en la NBA nada de goles ni mapas: lo de 037 ya lo exige)
create or replace function mk_encaja(m matches, p text) returns boolean
language plpgsql immutable as $$
declare need int; x int; y int;
begin
  if p in ('1', 'X', '2') then return true; end if;
  if not mk_valido(p) then return false; end if;
  if p ~ '^(SP|T[OU]|J)' then return m.sport = 'b'; end if;
  if p ~ '^([OU][0-9]\.5|GG|NG)$' then return m.sport = 'f'; end if;
  if m.sport not in ('v', 'c') or coalesce(m.bo, 0) not in (3, 5) then return false; end if;
  need := (m.bo + 1) / 2;
  if left(p, 1) = 'S' then
    x := substr(p, 2, 1)::int; y := substr(p, 4, 1)::int;
    return greatest(x, y) = need and least(x, y) < need;
  end if;
  if left(p, 1) = 'W' then return substr(p, 2, 1)::int <= m.bo; end if;
  return true;
end $$;

create or replace function mk_lado(p text) returns text
language sql immutable as $$
  select case
    when p in ('1', '2') then p
    when p ~ '^H[12]\+' then substr(p, 2, 1)
    when p ~ '^W[1-5]-[12]$' then substr(p, 4, 1)
    when p ~ '^S[0-9]-[0-9]$' and substr(p, 2, 1) > substr(p, 4, 1) then '1'
    when p ~ '^S[0-9]-[0-9]$' and substr(p, 2, 1) < substr(p, 4, 1) then '2'
    when p ~ '^SP[12]' then substr(p, 3, 1)
    when p ~ '^J[12]:' then substr(p, 2, 1)
    else null end
$$;

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
    when p ~ '^W[1-5]-[12]$' then 'Mapa ' || substr(p, 2, 1) || ': ' || case substr(p, 4, 1) when '1' then m.home else m.away end
    -- NBA (039)
    when p ~ '^SP[12][+-]' then case substr(p, 3, 1) when '1' then m.home else m.away end || ' '
      || case substr(p, 4, 1) when '+' then '+' else '−' end || replace(substr(p, 5), '.', ',')
    when p ~ '^T[OU][0-9]' then case substr(p, 2, 1) when 'O' then 'Más de ' else 'Menos de ' end || replace(substr(p, 3), '.', ',') || ' puntos'
    when p ~ '^J[12]:' then coalesce(nullif(m.details #>> array['pj', split_part(p, ':', 2)], ''), 'Jugador') || ': '
      || case substr(split_part(p, ':', 3), 2, 1) when 'O' then 'más de ' else 'menos de ' end
      || replace(substr(split_part(p, ':', 3), 3), '.', ',') || ' '
      || case left(split_part(p, ':', 3), 1) when 'P' then 'puntos' when 'R' then 'rebotes' when 'A' then 'asistencias'
                                              when 'T' then 'triples' else 'pts + reb + asist' end
    else p end
$$;

-- ---------- NBA: la linea de un codigo (SP1-6.5 -> -6.5, TO220.5 -> 220.5, J..:PO17.5 -> 17.5) ----------
create or replace function mk_nba_linea(p text) returns numeric
language sql immutable as $$
  select case
    when p ~ '^SP[12][+-]' then (substr(p, 4, 1) || substr(p, 5))::numeric
    when p ~ '^T[OU][0-9]' then substr(p, 3)::numeric
    when p ~ '^J[12]:' then substr(split_part(p, ':', 3), 3)::numeric
  end
$$;
-- lo que hizo (o lleva) un jugador de una estadistica, de un {id: [p, r, a, t]}; null si no esta o el dato no vale
create or replace function mk_nba_stat(bx jsonb, p text) returns numeric
language plpgsql immutable as $$
declare v jsonb := bx -> split_part(p, ':', 2); s text := left(split_part(p, ':', 3), 1); i int;
begin
  if v is null or jsonb_typeof(v) <> 'array' or jsonb_array_length(v) < 4 then return null; end if;
  for i in 0..3 loop if jsonb_typeof(v -> i) <> 'number' or (v ->> i)::numeric < 0 then return null; end if; end loop;
  return case s when 'P' then (v ->> 0)::numeric when 'R' then (v ->> 1)::numeric when 'A' then (v ->> 2)::numeric
                when 'T' then (v ->> 3)::numeric else (v ->> 0)::numeric + (v ->> 1)::numeric + (v ->> 2)::numeric end;
end $$;

-- ---------- el resultado de una eleccion en un partido acabado: 'won', 'lost' o 'void' ----------
create or replace function mk_resultado(m matches, p text) returns text
language plpgsql immutable as $$
declare a int; b int; need int; l numeric; r90 text; k int; i int; ga int := 0; gb int := 0; w text; d numeric;
begin
  if m.status = 'canceled' or m.winner is null then return 'void'; end if;
  if p in ('1', 'X', '2') then return case when p = m.winner then 'won' else 'lost' end; end if;
  if not mk_valido(p) or not mk_encaja(m, p) then return 'void'; end if;
  -- NBA (039): con el marcador final (prorroga incluida) y la hoja de los jugadores
  if m.sport = 'b' then
    if m.score is null or m.score !~ '^[0-9]{1,3}:[0-9]{1,3}$' then return 'void'; end if;
    a := split_part(m.score, ':', 1)::int; b := split_part(m.score, ':', 2)::int;
    if a = b or (a > b) <> (m.winner = '1') then return 'void'; end if;
    l := mk_nba_linea(p);
    if p ~ '^SP' then
      d := case substr(p, 3, 1) when '1' then a - b else b - a end + l;
      return case when d > 0 then 'won' when d < 0 then 'lost' else 'void' end;
    end if;
    if p ~ '^T' then
      if a + b = l then return 'void'; end if;
      return case when (substr(p, 2, 1) = 'O') = (a + b > l) then 'won' else 'lost' end;
    end if;
    if coalesce(m.details ->> 'bxok', 'false') <> 'true' or jsonb_typeof(m.details -> 'bx') is distinct from 'object' then return 'void'; end if;
    d := mk_nba_stat(m.details -> 'bx', p);
    if d is null then return 'void'; end if;
    return case when (substr(split_part(p, ':', 3), 2, 1) = 'O') = (d > l) then 'won' else 'lost' end;
  end if;
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
  -- mapa suelto (037): el mapa k no jugado se devuelve; los jugados tienen que cuadrar con el marcador
  if left(p, 1) = 'W' then
    k := substr(p, 2, 1)::int;
    if k > a + b then return 'void'; end if;
    for i in 1 .. a + b loop
      w := mk_mapa_w(m, i);
      if w is null then return 'void'; end if;
      if w = '1' then ga := ga + 1; else gb := gb + 1; end if;
    end loop;
    if ga <> a or gb <> b then return 'void'; end if;
    return case when mk_mapa_w(m, k) = substr(p, 4, 1) then 'won' else 'lost' end;
  end if;
  return case when mk_serie_ok(p, a, b) then 'won' else 'lost' end;
end $$;

-- ---------- NBA en directo: normal (Abramowitz y Stegun 7.1.26) y la probabilidad de cada eleccion ----------
create or replace function mk_ncdf(x numeric) returns numeric
language plpgsql immutable as $$
declare z float8 := abs(x::float8) / sqrt(2::float8); t float8; e float8;
begin
  t := 1 / (1 + 0.3275911 * z);
  e := 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-z * z);
  return (case when x >= 0 then 0.5 * (1 + e) else 0.5 * (1 - e) end)::numeric;
end $$;
create or replace function mk_ninv(p numeric) returns numeric
language plpgsql immutable as $$
declare lo numeric := -8; hi numeric := 8; mid numeric; i int;
begin
  for i in 1..50 loop mid := (lo + hi) / 2; if mk_ncdf(mid) < p then lo := mid; else hi := mid; end if; end loop;
  return (lo + hi) / 2;
end $$;
-- probabilidad de que una eleccion de la NBA acabe bien desde lo que dice ex_live. Null si falta algo (sin cash out).
-- Lo que queda (rem minutos): ventaja del local ~ normal(ventaja esperada antes del partido * rem / 48, 12,5 * raiz(rem / 48)),
-- puntos ~ normal(total esperado * rem / 48, 18 * raiz(rem / 48)); jugador ~ normal(linea * rem / 48, raiz(eso * 2,2) en
-- puntos y en pts + reb + asist, raiz(eso * 1,3) en lo demas)
create or replace function mk_nba_p(m matches, p text, d jsonb) returns numeric
language plpgsql immutable as $$
declare hs numeric; as_ numeric; per int; clk numeric; rem numeric; f numeric; mu0 numeric; tot0 numeric; l numeric; s numeric; sd numeric; x numeric; k text; po numeric;
begin
  if d ->> 'k' is distinct from 'b' or d ->> 'hs' is null or d ->> 'as' is null or d ->> 'per' is null then return null; end if;
  hs := (d ->> 'hs')::numeric; as_ := (d ->> 'as')::numeric; per := (d ->> 'per')::int; clk := greatest(0, coalesce((d ->> 'clk')::numeric, 0));
  rem := case when per <= 4 then (4 - per) * 12 + least(clk, 720) / 60.0 else least(clk, 300) / 60.0 end;
  f := greatest(rem, 0.25) / 48.0;
  if p in ('1', '2') or p ~ '^SP' then
    -- ventaja esperada del local antes del partido: la del handicap (SP1-6.5 dice +6,5) o, sin el, la de las cuotas 1 / 2
    select key into k from jsonb_each(coalesce(m.odds_mk, '{}')) where key ~ '^SP1' limit 1;
    if k is not null then mu0 := -mk_nba_linea(k);
    elsif m.odds_1 > 1 and m.odds_2 > 1 then mu0 := 12.5 * mk_ninv(least(0.97, greatest(0.03, (1 / m.odds_1) / ((1 / m.odds_1) + (1 / m.odds_2)))));
    else mu0 := 0; end if;
    x := hs - as_ + mu0 * f; sd := 12.5 * sqrt(f);
    if p = '1' then return mk_ncdf(x / sd); end if;
    if p = '2' then return 1 - mk_ncdf(x / sd); end if;
    l := mk_nba_linea(p);
    return case substr(p, 3, 1) when '1' then mk_ncdf((x + l) / sd) else mk_ncdf((l - x) / sd) end;
  end if;
  if p ~ '^T' then
    select key into k from jsonb_each(coalesce(m.odds_mk, '{}')) where key ~ '^TO' limit 1;
    l := mk_nba_linea(p); tot0 := coalesce(mk_nba_linea(k), l);
    po := mk_ncdf((hs + as_ + tot0 * f - l) / (18 * sqrt(f)));
    return case substr(p, 2, 1) when 'O' then po else 1 - po end;
  end if;
  if p ~ '^J' then
    if jsonb_typeof(d -> 'pj') is distinct from 'object' then return null; end if;
    s := mk_nba_stat(d -> 'pj', p); if s is null then return null; end if;
    l := mk_nba_linea(p);
    if s > l then po := 1;
    else
      x := l * f; sd := sqrt(greatest(x, 0.05) * case when left(split_part(p, ':', 3), 1) in ('P', 'X') then 2.2 else 1.3 end);
      po := mk_ncdf((s + x - l) / sd);
    end if;
    return case substr(split_part(p, ':', 3), 2, 1) when 'O' then po else 1 - po end;
  end if;
  return null;
end $$;

-- ---------- cuanto vale una apuesta ahora (cash out): 037 + la NBA ----------
create or replace function ex_cash_value(b bets, m matches) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  win int := round(b.stake * b.odds)::int; cur numeric; v numeric; lv ex_live; p numeric; sh numeric; p0 numeric; pm numeric; pr numeric; q numeric;
  bo int; need int; a int; c int; mins numeric; rem numeric; pw numeric; lam numeric; nuevo boolean := b.pick not in ('1', 'X', '2'); k int; w text;
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
  if m.sport = 'b' then
    -- NBA (039): marcador, cuarto y reloj; los jugadores con lo que llevan
    if b.pick = 'X' then return jsonb_build_object('ok', false, 'why', 'Ahora no se puede retirar'); end if;
    if lv.data->>'k' is distinct from 'b' then return jsonb_build_object('ok', false, 'why', 'Sin datos frescos del directo'); end if;
    p := mk_nba_p(m, b.pick, lv.data);
    if p is null then return jsonb_build_object('ok', false, 'why', case when b.pick ~ '^J' then 'Ese jugador aún no ha salido a pista' else 'Sin datos frescos del directo' end); end if;
  elsif m.sport = 'f' then
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
    if nuevo and left(b.pick, 1) = 'W' then
      -- mapa suelto (037): ya jugado, ganado o perdido; el que se juega, por q; uno de despues, por pm (y lo que se devolveria)
      k := substr(b.pick, 2, 1)::int;
      if k <= a + c then
        w := mk_mapa_w(m, k);
        if w is null then return jsonb_build_object('ok', false, 'why', 'Ahora no se puede retirar'); end if;
        p := case when w = substr(b.pick, 4, 1) then 1 else 0 end;
      elsif k = a + c + 1 then
        p := case substr(b.pick, 4, 1) when '1' then q else 1 - q end;
      else
        p := q * mk_mapa_p(b.pick, a + 1, c, need, pm, b.odds) + (1 - q) * mk_mapa_p(b.pick, a, c + 1, need, pm, b.odds);
      end if;
    elsif nuevo then
      p := q * mk_serie_p(b.pick, a + 1, c, need, pm) + (1 - q) * mk_serie_p(b.pick, a, c + 1, need, pm);
    else
      pw := q * ex_w(a + 1, c, need, pm) + (1 - q) * ex_w(a, c + 1, need, pm);
      p := case b.pick when '1' then pw else 1 - pw end;
    end if;
  end if;
  v := b.stake * b.odds * least(0.99, greatest(0.01, p)) * 0.90;
  return jsonb_build_object('ok', true, 'mode', 'live', 'win', win, 'value', least(win, greatest(1, round(v)))::int, 'p', round(p, 3));
end $$;

-- ---------- pagar: 037 + el aviso del chat de la NBA cuando se devuelve ----------
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
        || case when m.sport = 'b' and b.pick ~ '^J' then ' no ha jugado o no tiene estadística'
                when m.sport = 'b' then ' ha caído justo en la línea'
                when m.sport = 'f' then ' no tiene resultado de los 90 minutos' when b.pick ~ '^W' then ' no se ha jugado' else ' no tiene una serie completa' end);
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

-- ---------- sin apuestas en directo en la NBA (031) ----------
create or replace function ex_live_odds(m matches, p_pick text) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare b bets; q jsonb; p numeric; mg numeric := coalesce((select (value #>> '{}')::numeric from settings where key = 'live_margen'), 1.08); lv ex_live;
begin
  if m.status <> 'live' or m.sport in ('u', 'b') then return null; end if;
  if m.sport = 'f' then
    select * into lv from ex_live where match_id = m.id;
    if not found or coalesce((lv.data->>'min')::numeric, 0) >= 80 or coalesce((lv.data->>'per')::int, 1) > 2 then return null; end if;
  elsif p_pick = 'X' then return null; end if;
  b.status := 'open'; b.boost := null; b.pick := p_pick; b.stake := 100; b.odds := 2;
  q := ex_cash_value(b, m);
  if not coalesce((q->>'ok')::boolean, false) or q->>'mode' <> 'live' or q->>'p' is null then return null; end if;
  p := (q->>'p')::numeric;
  if p <= 0.02 or p >= 0.97 then return null; end if;
  return least(15, greatest(1.05, round(1 / (p * mg), 2)));
end $$;

-- ---------- quien puede llamar a que ----------
-- (las de antes conservan sus permisos: create or replace no los toca). Las nuevas, cerradas a los jugadores.
revoke all on function mk_ncdf(numeric), mk_ninv(numeric), mk_nba_linea(text), mk_nba_stat(jsonb, text), mk_nba_p(matches, text, jsonb)
  from public, anon, authenticated;
