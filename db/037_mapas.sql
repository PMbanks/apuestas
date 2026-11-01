-- 037 (01-11). MAPAS SUELTOS. PM: "en valorant y csgo que se pueda botar mapas o todos los mapas etc...".
-- Va despues de 036 (que ya esta cargado). Anade a las series de Valorant y CS2 al mejor de 3 o 5:
--   W1-1 W1-2 ... W5-1 W5-2   GANADOR DE CADA MAPA: Wk-1 = el local gana el mapa k, Wk-2 = lo gana el visitante.
--                             Mapas 1 a 3 en una serie al mejor de 3, 1 a 5 al mejor de 5.
--   GANA TODOS LOS MAPAS no es un codigo nuevo: es el resultado exacto de 036 sin perder mapa (S2-0 / S0-2 al mejor de 3,
--   S3-0 / S0-3 al mejor de 5). Es exactamente la misma apuesta, con la misma cuota y el mismo pago, asi que se reutiliza
--   (un codigo nuevo seria la misma apuesta repetida con dos cuotas que podrian no cuadrar). La app la ensena aparte, en su
--   propia fila "Gana todos los mapas" del grupo Mapas.
-- La cuota de cada mapa la pone el sincronizador en matches.odds_mk con la probabilidad por mapa de la serie (mapas
-- independientes, la misma que usan los demas mercados de mapas), con el mismo margen y redondeo.
-- COMO SE PAGA Wk-l:
--   * Con lo de 036 para series: anulado, forfeit (details.ff), formato que no es al mejor de (details.mt) o marcador que no
--     cuadra con matches.bo y matches.winner: SE DEVUELVE.
--   * Si el mapa k no se ha jugado (la serie acabo antes: k > mapas jugados): SE DEVUELVE.
--   * Si no, con details.games ({n: mapa, st: estado, w: id del ganador}) y details.ids ({a: local, b: visitante}): cada mapa
--     jugado tiene que estar 'finished' con ganador uno de los dos, y los mapas ganados por cada uno tienen que cuadrar con
--     matches.score. Si algo no cuadra, SE DEVUELVE. Si cuadra: gana si el ganador del mapa k es tu lado, pierde si no.
-- CASH OUT (ex_cash_value): antes de empezar, con la cuota de ahora del mismo mapa (como 036). En directo: mapa ya jugado vale
--   ganado o perdido (segun details.games; si aun no esta, no hay cash out un momento); el mapa que se esta jugando, con la
--   probabilidad de ganarlo (con las rondas, como 036); un mapa de despues, con la probabilidad por mapa, y si puede no jugarse
--   cuenta lo que se devolveria (probabilidad equivalente = P(se juega y gana) + P(no se juega) / cuota).
-- Combinadas: como 036 (una pata por partido). Solo se apuesta antes de empezar. Lo demas de 036 no cambia.
-- Cambia: mk_valido y las restricciones de bets y combo_legs (el codigo nuevo), mk_encaja, mk_lado, pick_name ("Mapa 2: FaZe"),
--   mk_resultado, ex_cash_value y settle_match (el aviso del chat cuando se devuelve un mapa). Nuevas: mk_mapa_w y mk_mapa_p.
-- Se puede ejecutar varias veces. Despues: 037_prueba.sql.

-- ---------- el codigo nuevo ----------
create or replace function mk_valido(p text) returns boolean
language sql immutable as $$
  select coalesce(p ~ '^(1|X|2|[OU][0-9]\.5|GG|NG|S[0-4]-[0-4]|H[12]\+[0-9]\.5|M[OU][0-9]\.5|W[1-5]-[12])$', false)
$$;

alter table bets drop constraint if exists bets_pick_check;
alter table bets add constraint bets_pick_check
  check (pick ~ '^(1|X|2|[OU][0-9]\.5|GG|NG|S[0-4]-[0-4]|H[12]\+[0-9]\.5|M[OU][0-9]\.5|W[1-5]-[12])$');
alter table combo_legs drop constraint if exists combo_legs_pick_check;
alter table combo_legs add constraint combo_legs_pick_check
  check (pick ~ '^(1|X|2|[OU][0-9]\.5|GG|NG|S[0-4]-[0-4]|H[12]\+[0-9]\.5|M[OU][0-9]\.5|W[1-5]-[12])$');

-- mapas sueltos: solo hasta el ultimo mapa posible del formato (3 al mejor de 3, 5 al mejor de 5)
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
    else p end
$$;

-- ---------- quien gano el mapa k: '1' (el local), '2' (el visitante) o null si no esta acabado o el dato no cuadra ----------
create or replace function mk_mapa_w(m matches, k int) returns text
language plpgsql immutable as $$
declare ia text := m.details #>> '{ids,a}'; ib text := m.details #>> '{ids,b}'; n int; w text;
begin
  if ia is null or ib is null or ia = ib or jsonb_typeof(m.details -> 'games') is distinct from 'array' then return null; end if;
  select count(*), max(x ->> 'w') filter (where x ->> 'st' = 'finished') into n, w
    from jsonb_array_elements(m.details -> 'games') x where x ->> 'n' = k::text;
  if n <> 1 or w is null then return null; end if;
  return case w when ia then '1' when ib then '2' end;
end $$;

create or replace function mk_resultado(m matches, p text) returns text
language plpgsql immutable as $$
declare a int; b int; need int; l numeric; r90 text; k int; i int; ga int := 0; gb int := 0; w text;
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

-- ---------- cash out de un mapa de despues: desde x a y mapas (el siguiente es el x + y + 1, con pm de ganarlo el local) ----------
-- Devuelve la probabilidad equivalente: P(se juega el mapa k y lo gana tu lado) + P(no se juega) / o (lo que se devolveria,
-- puesto en la misma escala que el premio importe x cuota)
create or replace function mk_mapa_p(p text, x int, y int, need int, pm numeric, o numeric) returns numeric
language plpgsql immutable as $$
declare k int := substr(p, 2, 1)::int;
begin
  if x >= need or y >= need then return 1 / o; end if;
  if x + y + 1 >= k then return case substr(p, 4, 1) when '1' then pm else 1 - pm end; end if;
  return pm * mk_mapa_p(p, x + 1, y, need, pm, o) + (1 - pm) * mk_mapa_p(p, x, y + 1, need, pm, o);
end $$;

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
        || case when m.sport = 'f' then ' no tiene resultado de los 90 minutos' when b.pick ~ '^W' then ' no se ha jugado' else ' no tiene una serie completa' end);
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

-- ---------- quien puede llamar a que ----------
-- (las de 036 conservan sus permisos: create or replace no los toca). Las nuevas, cerradas a los jugadores.
revoke all on function mk_mapa_w(matches, int), mk_mapa_p(text, int, int, int, numeric, numeric) from public, anon, authenticated;
