-- 052 (01-11). FORMULA 1. PM: "pondria F1 para apostar en Bets y que haga todo bien: que se pueda apostar bien, registro de otros
-- años de corredores, etc., todo bien hecho".
-- Va despues de 039 (NBA) y de 051. Parte de las funciones de 036, 037 y 039 tal cual y les anade la F1 (matches.sport = 'r').
-- Los Grandes Premios los trae el sincronizador (sync/f1.mjs) de Jolpica (la continuacion de Ergast, gratis y sin clave).
-- No hay fuente gratuita y sin clave de cuotas reales de F1 (ESPN/DraftKings no las da en F1 y The Odds API pide clave): las cuotas
-- salen de un modelo sencillo del sincronizador (ver el comentario de arriba de sync/f1.mjs) con el margen de siempre.
--
-- COMO SE GUARDA (cada sesion es un "partido", asi apostar, combinar, retar y pagar usan el motor de siempre):
--   f1-2026-20-R    carrera      home = "Gran Premio de Brasil"   away = "Carrera"        starts_at = la salida
--   f1-2026-20-Q    clasificacion                                  away = "Clasificación"
--   f1-2026-20-S    sprint (solo en fines de semana con sprint)    away = "Sprint"
--   f1-2026-20-D-a-b  duelo entre companeros (piloto a contra piloto b): partido normal 1 / 2, con odds_1 y odds_2. El reto
--                   (004 / 042) funciona con el tal cual: gana el que termina por delante (winner 1 o 2)
--   f1-2026-WDC / f1-2026-WCC   campeonato de pilotos / de constructores: se cierra cuando empieza la ultima carrera
-- matches.details: kind (race, quali, sprint, duel, wdc, wcc), gp ('2026-20', 'C2026' en los campeonatos: sirve para no mezclar
--   dos apuestas del mismo Gran Premio en una combinada), dr {piloto: nombre}, eq {escuderia: nombre}, y, cuando acaba, res.
-- CODIGOS NUEVOS (bets.pick y combo_legs.pick), el id de Jolpica del piloto o de la escuderia detras de los dos puntos:
--   FW:max_verstappen   gana la carrera                 (solo en la carrera)
--   FP:max_verstappen   sube al podio, top 3            (carrera)
--   FT:max_verstappen   entre los 10 primeros           (carrera)
--   FL:max_verstappen   vuelta rapida                   (carrera)
--   FX:max_verstappen   abandona la carrera             (carrera)
--   FQ:max_verstappen   pole position                   (clasificacion)
--   FS:max_verstappen   gana el sprint                  (sprint)
--   FC:max_verstappen   campeon de pilotos              (WDC)
--   FK:red_bull         campeon de constructores        (WCC)
-- COMO SE PAGA (todo con matches.details.res, que escribe el sincronizador con la clasificacion oficial de Jolpica):
--   res.o   ids por orden de llegada (carrera y sprint), de salida (clasificacion) o de la tabla final (campeonatos)
--   res.st  {id: F acaba, L acaba con vueltas de menos, R abandona, D descalificado, S no toma la salida}
--   res.fl  el de la vuelta rapida (rank 1)
--   * Ganador, pole, sprint, campeon: el primero de res.o. Podio: los 3 primeros. Top 10: los 10 primeros. Vuelta rapida: res.fl.
--   * Abandona: gana si su estado es R (descalificado o clasificado no cuenta).
--   * Descalificado (D): pierde en ganador, podio y top 10.
--   * Piloto que no aparece, o que no toma la salida (S), o vuelta rapida que falta: SE DEVUELVE lo apostado.
--   * Carrera, clasificacion o sprint cancelados (status canceled), o sin ganador: se devuelve todo (como siempre).
--   * Duelo: gana el que termina por delante; si uno no sale, se devuelve (el sincronizador manda el duelo como cancelado).
-- Solo antes de empezar la sesion (place_bet y place_combo ya lo exigen). Sin apuestas en directo ni cash out en directo.
-- Cash out antes de empezar: con la cuota de ahora del mismo mercado, como en 036.
-- Combinadas: una sola pata por Gran Premio (la clasificacion, el sprint, la carrera y los duelos de un mismo fin de semana estan
-- relacionados) y una sola de campeonato.
-- Cambia: el check de matches.sport, mk_valido y las restricciones de bets y combo_legs, mk_encaja, pick_name, mk_resultado,
-- ex_cash_value (sin cash out en directo), settle_match y reveal_match (el texto del chat), ex_live_odds y place_combo.
-- Nuevas: sync_f1_pendientes (el sincronizador pregunta que Grandes Premios siguen abiertos) y sync_f1_anula (anula los que Jolpica
-- ya no trae en el calendario: se devuelve todo).
-- Se puede ejecutar varias veces. Despues: 052_prueba.sql.


-- ---------- el deporte y los codigos (de 039 + F1) ----------
alter table matches drop constraint if exists matches_sport_check;
alter table matches add constraint matches_sport_check check (sport in ('f','v','u','c','b','r'));

-- ---------- los codigos ----------
create or replace function mk_valido(p text) returns boolean
language sql immutable as $$
  select coalesce(p ~ '^(1|X|2|[OU][0-9]\.5|GG|NG|S[0-4]-[0-4]|H[12]\+[0-9]\.5|M[OU][0-9]\.5|W[1-5]-[12]|SP[12][+-][0-9]{1,2}(\.5)?|T[OU][0-9]{3}(\.5)?|J[12]:[0-9]{1,10}:[PRATX][OU][0-9]{1,2}\.5|F[WPTLXQSCK]:[a-z0-9_]{2,40})$', false)
$$;

alter table bets drop constraint if exists bets_pick_check;
alter table bets add constraint bets_pick_check
  check (pick ~ '^(1|X|2|[OU][0-9]\.5|GG|NG|S[0-4]-[0-4]|H[12]\+[0-9]\.5|M[OU][0-9]\.5|W[1-5]-[12]|SP[12][+-][0-9]{1,2}(\.5)?|T[OU][0-9]{3}(\.5)?|J[12]:[0-9]{1,10}:[PRATX][OU][0-9]{1,2}\.5|F[WPTLXQSCK]:[a-z0-9_]{2,40})$');
alter table combo_legs drop constraint if exists combo_legs_pick_check;
alter table combo_legs add constraint combo_legs_pick_check
  check (pick ~ '^(1|X|2|[OU][0-9]\.5|GG|NG|S[0-4]-[0-4]|H[12]\+[0-9]\.5|M[OU][0-9]\.5|W[1-5]-[12]|SP[12][+-][0-9]{1,2}(\.5)?|T[OU][0-9]{3}(\.5)?|J[12]:[0-9]{1,10}:[PRATX][OU][0-9]{1,2}\.5|F[WPTLXQSCK]:[a-z0-9_]{2,40})$');

-- los de la NBA solo en la NBA (y en la NBA nada de goles ni mapas: lo de 037 ya lo exige)
create or replace function mk_encaja(m matches, p text) returns boolean
language plpgsql immutable as $$
declare need int; x int; y int;
begin
  if p in ('1', 'X', '2') then return true; end if;
  if not mk_valido(p) then return false; end if;
  if p ~ '^F[WPTLXQSCK]:' then
    -- F1 (052): cada codigo vale solo en su sesion, y el piloto (o la escuderia en FK) tiene que estar en el partido
    if m.sport <> 'r' then return false; end if;
    return case left(p, 2)
      when 'FW' then m.details ->> 'kind' = 'race' when 'FP' then m.details ->> 'kind' = 'race' when 'FT' then m.details ->> 'kind' = 'race'
      when 'FL' then m.details ->> 'kind' = 'race' when 'FX' then m.details ->> 'kind' = 'race'
      when 'FQ' then m.details ->> 'kind' = 'quali' when 'FS' then m.details ->> 'kind' = 'sprint'
      when 'FC' then m.details ->> 'kind' = 'wdc' else m.details ->> 'kind' = 'wcc' end
      and (case when left(p, 2) = 'FK' then m.details #> array['eq', substr(p, 4)] else m.details #> array['dr', substr(p, 4)] end) is not null;
  end if;
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
    -- F1 (052): "Lando Norris: gana la carrera", "Mercedes: campeón de constructores"
    when p ~ '^F[WPTLXQSCK]:' then
      case when left(p, 2) = 'FK' then coalesce(nullif(m.details #>> array['eq', substr(p, 4)], ''), 'Escudería')
           else coalesce(nullif(m.details #>> array['dr', substr(p, 4)], ''), 'Piloto') end
      || ': ' || case left(p, 2) when 'FW' then 'gana la carrera' when 'FP' then 'sube al podio' when 'FT' then 'entre los 10 primeros'
                    when 'FL' then 'vuelta rápida' when 'FX' then 'abandona' when 'FQ' then 'pole position' when 'FS' then 'gana el sprint'
                    when 'FC' then 'campeón de pilotos' else 'campeón de constructores' end
    else p end
$$;


-- ---------- el resultado (de 039 + F1) ----------
create or replace function mk_resultado(m matches, p text) returns text
language plpgsql immutable as $$
declare a int; b int; need int; l numeric; r90 text; k int; i int; ga int := 0; gb int := 0; w text; d numeric; fo jsonb; fd text; fpos int; fs text; ffl text;
begin
  if m.status = 'canceled' or m.winner is null then return 'void'; end if;
  if p in ('1', 'X', '2') then return case when p = m.winner then 'won' else 'lost' end; end if;
  if not mk_valido(p) or not mk_encaja(m, p) then return 'void'; end if;
  -- F1 (052): con la clasificacion oficial que guarda el sincronizador en details.res
  --   o   = ids por orden (carrera y sprint: el orden de llegada oficial, los que no acaban detras; clasificacion: el orden de salida;
  --         campeonatos: la tabla final de pilotos o de escuderias)
  --   st  = {id: 'F' acaba, 'L' acaba con vueltas de menos, 'R' abandona, 'D' descalificado, 'S' no toma la salida}
  --   fl  = el de la vuelta rapida (rank 1 de Jolpica), o null si no se sabe
  -- Piloto que no aparece, o que no sale ('S'), o vuelta rapida que falta: SE DEVUELVE lo apostado. Descalificado: pierde.
  if m.sport = 'r' then
    fo := m.details #> '{res,o}';
    if jsonb_typeof(fo) is distinct from 'array' or jsonb_array_length(fo) < 2 then return 'void'; end if;
    fd := substr(p, 4);
    select min(t.i)::int into fpos from jsonb_array_elements_text(fo) with ordinality as t(v, i) where t.v = fd;
    fs := m.details #>> array['res', 'st', fd];
    if fpos is null or fs = 'S' then return 'void'; end if;
    case left(p, 2)
      when 'FW', 'FQ', 'FS', 'FC', 'FK' then return case when fpos = 1 and coalesce(fs, 'F') <> 'D' then 'won' else 'lost' end;
      when 'FP' then return case when fpos <= 3 and coalesce(fs, 'F') <> 'D' then 'won' else 'lost' end;
      when 'FT' then return case when fpos <= 10 and coalesce(fs, 'F') <> 'D' then 'won' else 'lost' end;
      when 'FX' then return case when fs = 'R' then 'won' else 'lost' end;
      when 'FL' then
        ffl := m.details #>> '{res,fl}';
        if ffl is null then return 'void'; end if;
        return case when ffl = fd then 'won' else 'lost' end;
      else return 'void';
    end case;
  end if;
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


-- ---------- cuanto vale una apuesta ahora (cash out): 039 + sin cash out en directo en la F1 ----------
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
  if m.sport = 'r' then return jsonb_build_object('ok', false, 'why', 'La Fórmula 1 no tiene cash out en directo'); end if;
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


-- ---------- pagar (de 039 + F1) ----------
create or replace function settle_match(p_match text) returns int
language plpgsql security definer set search_path = public as $$
declare m matches; b record; n int := 0; res text; extra numeric := 1; pay int; r text; vs text;
begin
  select * into m from matches where id = p_match for update;
  if not found or m.settled or m.status not in ('final','canceled') then return 0; end if;
  if (select (value #>> '{}')::boolean from settings where key = 'daily_on') and exists (select 1 from daily where match_id = p_match) then
    extra := (select (value #>> '{}')::numeric from settings where key = 'daily_bonus');
  end if;
  res := m.home || ' ' || coalesce(m.score, '') || ' ' || m.away;
  -- F1 (052): un Gran Premio no es "A vs B" (el duelo entre pilotos si)
  vs := case when m.sport = 'r' and coalesce(m.details ->> 'kind', '') <> 'duel' then m.home || ' · ' || m.away else m.home || ' vs ' || m.away end;
  if m.sport = 'r' and coalesce(m.details ->> 'kind', '') <> 'duel' then res := vs || coalesce(' · ' || nullif(m.score, ''), ''); end if;
  for b in select bets.*, p.name from bets join players p on p.id = bets.player
           where match_id = p_match and status = 'open' for update of bets loop
    r := mk_resultado(m, b.pick);
    if m.status = 'canceled' or m.winner is null then
      update bets set status = 'void', payout = b.stake, settled_at = now() where id = b.id;
      insert into ledger(player, amount, kind, note, bet_id) values (b.player, b.stake, 'devolucion', 'Anulado: ' || vs, b.id);
      insert into chat(body) values (b.name || ' recupera ' || fmt_int(b.stake) || ': ' || vs || ' no se ha jugado');
    elsif r = 'void' then
      update bets set status = 'void', payout = b.stake, settled_at = now() where id = b.id;
      insert into ledger(player, amount, kind, note, bet_id)
        values (b.player, b.stake, 'devolucion', 'Anulado: ' || pick_name(m, b.pick) || ' · ' || vs, b.id);
      insert into chat(body) values (b.name || ' recupera ' || fmt_int(b.stake) || ': ' || pick_name(m, b.pick) || ' en ' || vs
        || case when m.sport = 'r' then ' no cuenta: el piloto no tomó la salida o falta el dato oficial'
                when m.sport = 'b' and b.pick ~ '^J' then ' no ha jugado o no tiene estadística'
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


-- ---------- sin apuestas en directo en la F1 (031) ----------
create or replace function ex_live_odds(m matches, p_pick text) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare b bets; q jsonb; p numeric; mg numeric := coalesce((select (value #>> '{}')::numeric from settings where key = 'live_margen'), 1.08); lv ex_live;
begin
  if m.status <> 'live' or m.sport in ('u', 'b', 'r') then return null; end if;
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


-- ---------- combinadas (de 036): una pata por Gran Premio ----------
create or replace function place_combo(p_legs jsonb, p_stake int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); l jsonb; m matches; o numeric; tot numeric := 1; n int; bal int; cid bigint; vistos text[] := '{}'; gps text[] := '{}';
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
    -- F1 (052): dos patas del mismo Gran Premio (o dos de campeonato) estan relacionadas: una sola por fin de semana
    if m.sport = 'r' then
      if (m.details ->> 'gp') = any(gps) then raise exception 'Una combinada no puede llevar dos apuestas del mismo Gran Premio'; end if;
      gps := gps || (m.details ->> 'gp');
    end if;
    if m.status <> 'scheduled' or m.starts_at <= now() then raise exception '% vs % ya ha empezado: quítalo de la combinada', m.home, m.away; end if;
    if not mk_valido(l->>'pick') then raise exception 'Esa elección no es válida'; end if;
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


-- ---------- el sincronizador pregunta que sigue abierto ----------
-- Devuelve los Grandes Premios con sesiones sin pagar (id, estado, hora). Con eso el sincronizador anula (y se devuelve todo) los
-- que Jolpica ya no trae en el calendario o siguen sin resultado cuatro dias despues.
create or replace function sync_f1_pendientes(p_secret text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_secret is null or p_secret <> (select value #>> '{}' from settings where key = 'sync_secret') then
    raise exception 'Clave de sincronización no válida';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'status', status, 'at', starts_at, 'settled', settled) order by starts_at)
                     from matches where sport = 'r' and not settled), '[]'::jsonb);
end $$;

-- ---------- el aviso del chat cuando empieza (001): un Gran Premio no es "A vs B", y con muchas apuestas no cabe en 500 letras ----------
create or replace function reveal_match(p_match text) returns void
language plpgsql security definer set search_path = public as $$
declare m matches; txt text; vs text;
begin
  select * into m from matches where id = p_match for update;
  if not found or m.revealed then return; end if;
  vs := case when m.sport = 'r' and coalesce(m.details ->> 'kind', '') <> 'duel' then m.home || ' · ' || m.away else m.home || ' vs ' || m.away end;
  select string_agg(p.name || ' · ' || pick_name(m, b.pick) || ' ' || fmt_int(b.stake), ' · ' order by b.created_at)
    into txt from bets b join players p on p.id = b.player where b.match_id = p_match;
  if txt is not null then
    -- el chat admite 500 letras: con muchas apuestas (la F1 tiene muchos mercados por carrera) se cuenta en vez de listarlas
    if char_length('Empieza ' || vs || '. Apuestas: ' || txt) > 480 then
      select 'Empieza ' || vs || '. ' || count(*)::text || ' apuestas de ' || count(distinct b.player)::text || case when count(distinct b.player) = 1 then ' amigo' else ' amigos' end
        into txt from bets b where b.match_id = p_match;
      insert into chat(body) values (left(txt, 500));
    else
      insert into chat(body) values (left('Empieza ' || vs || '. Apuestas: ' || txt, 500));
    end if;
  end if;
  update matches set revealed = true where id = p_match;
  perform bump();
end $$;

-- Anula (status canceled: settle_match devuelve todo lo apostado) los Grandes Premios que Jolpica ya no trae en el calendario.
-- Solo F1, solo lo que aun no se ha pagado ni acabado.
create or replace function sync_f1_anula(p_secret text, p_ids text[]) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_secret is null or p_secret <> (select value #>> '{}' from settings where key = 'sync_secret') then
    raise exception 'Clave de sincronización no válida';
  end if;
  update matches set status = 'canceled', updated_at = now()
   where sport = 'r' and id = any(coalesce(p_ids, '{}')) and not settled and status <> 'final';
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- quien puede llamar a que ----------
-- (place_combo, mk_valido, mk_encaja, pick_name, mk_resultado, ex_cash_value, settle_match y ex_live_odds conservan los permisos
--  de antes: create or replace no los toca)
revoke all on function sync_f1_pendientes(text), sync_f1_anula(text, text[]) from public;
grant execute on function sync_f1_pendientes(text), sync_f1_anula(text, text[]) to anon, authenticated;
