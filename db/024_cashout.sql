-- Vigesimocuarta parte (30-10). CASH OUT, como en una casa de apuestas (PM: "que pueda salir de las bets perdiendo lo que
-- perderia como en una bet normal"): retirar una apuesta abierta antes de que acabe y cobrar ya su valor actual, con el margen
-- de la casa. TODO se calcula en el servidor; el navegador solo pregunta y pide.
--   Antes de empezar:  valor = importe * cuota con la que aposto / cuota actual del mismo resultado * 0,95
--   En directo:        valor = importe * cuota * probabilidad de que gane ahora * 0,90
--       futbol: marcador y minuto de ESPN con un modelo de Poisson para lo que queda (goles esperados 2,7 por partido,
--               repartidos segun las cuotas de antes del partido);
--       Valorant y CS2: mapas ganados, rondas del mapa en juego si las hay (vlr.gg) y formato BO1/3/5. La probabilidad por mapa
--               sale de las cuotas de antes del partido; la de cada ronda es una version diluida de esa;
--       UFC: sin cash out en directo.
--   Si el estado en vivo (ex_live) tiene mas de 3 minutos o no existe, no se ofrece en directo.
--   Nunca mas de lo que pagaria si gana, y minimo 1. Sin cash out en apuestas con cuota mejorada (022) ni en predicciones rapidas.
-- La apuesta se cierra como status 'cashout' (payout = lo cobrado) y el monedero lo apunta como kind 'cashout'. El bote, los premios
-- de la semana y los trofeos lo cuentan como apuesta resuelta con su beneficio o perdida (se redefinen aqui abajo).
-- Se puede ejecutar varias veces. Va despues de 001 a 023 (necesita 015 y 022).

alter table bets drop constraint if exists bets_status_check;
alter table bets add constraint bets_status_check check (status in ('open', 'won', 'lost', 'void', 'cashout'));

-- ---------- el estado en vivo que guarda el sincronizador ----------
-- futbol: {"k":"f","hs":1,"as":0,"min":63,"per":2}   series (Valorant y CS2): {"k":"s","a":1,"b":0,"bo":3,"ra":7,"rb":5}
-- (a y b: mapas del local y del visitante; ra y rb: rondas del mapa en juego, o null)
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

-- ---------- el modelo (funciones puras) ----------
-- futbol: probabilidad de que acabe 1, X o 2. dh: goles del local menos los del visitante ahora; rem: minutos que quedan;
-- sh: parte de los goles que mete el local (0 a 1)
create or replace function ex_fut_prob(p_pick text, dh int, rem numeric, sh numeric) returns numeric
language plpgsql immutable as $$
declare lam numeric := 2.7 * greatest(rem, 0.5) / 90.0; lh numeric := lam * sh; la numeric := lam * (1 - sh); p numeric := 0; i int; j int; ph numeric; pa numeric; fin int;
begin
  for i in 0..10 loop
    ph := exp(-lh) * power(lh, i) / factorial(i);
    for j in 0..10 loop
      pa := exp(-la) * power(la, j) / factorial(j);
      fin := dh + i - j;
      if (p_pick = '1' and fin > 0) or (p_pick = 'X' and fin = 0) or (p_pick = '2' and fin < 0) then p := p + ph * pa; end if;
    end loop;
  end loop;
  return p;
end $$;

-- series al mejor de n: probabilidad de que el local gane desde x mapas a y, con probabilidad pm de ganar cada mapa
create or replace function ex_w(x int, y int, need int, pm numeric) returns numeric
language plpgsql immutable as $$
begin
  if x >= need then return 1; elsif y >= need then return 0; end if;
  return pm * ex_w(x + 1, y, need, pm) + (1 - pm) * ex_w(x, y + 1, need, pm);
end $$;

-- la probabilidad por mapa que da p0 de ganar la serie (biseccion)
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

-- probabilidad de que el local gane el mapa en juego: ra y rb rondas, pr probabilidad de ganar una ronda, pm la del mapa (para la prorroga)
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

-- ---------- cuanto vale una apuesta ahora ----------
-- devuelve {ok, mode ('pre'|'live'), value, win (lo que pagaria si gana), why}
create or replace function ex_cash_value(b bets, m matches) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  win int := round(b.stake * b.odds)::int; cur numeric; v numeric; lv ex_live; p numeric; sh numeric; p0 numeric; pm numeric; pr numeric; q numeric;
  bo int; need int; a int; c int; mins numeric; rem numeric; pw numeric;
begin
  if b.status <> 'open' then return jsonb_build_object('ok', false, 'why', 'La apuesta ya está cerrada'); end if;
  if b.boost is not null then return jsonb_build_object('ok', false, 'why', 'Las apuestas con cuota mejorada no admiten cash out'); end if;
  if m.status = 'scheduled' and m.starts_at > now() then
    cur := case b.pick when '1' then m.odds_1 when 'X' then m.odds_x else m.odds_2 end;
    if cur is null or cur <= 1 then return jsonb_build_object('ok', false, 'why', 'Ahora no hay cuota para ese resultado'); end if;
    v := b.stake * b.odds / cur * 0.95;
    return jsonb_build_object('ok', true, 'mode', 'pre', 'win', win, 'value', least(win, greatest(1, round(v)))::int);
  end if;
  if m.status <> 'live' then return jsonb_build_object('ok', false, 'why', 'El partido no está en juego'); end if;
  if m.sport = 'u' then return jsonb_build_object('ok', false, 'why', 'La UFC no tiene cash out en directo'); end if;
  select * into lv from ex_live where match_id = m.id;
  if not found or lv.at < now() - interval '3 minutes' then return jsonb_build_object('ok', false, 'why', 'Sin datos frescos del directo'); end if;
  if m.sport = 'f' then
    if lv.data->>'k' <> 'f' or lv.data->>'min' is null or lv.data->>'hs' is null or lv.data->>'as' is null then return jsonb_build_object('ok', false, 'why', 'Sin datos frescos del directo'); end if;
    if coalesce((lv.data->>'per')::int, 1) > 2 then return jsonb_build_object('ok', false, 'why', 'Prórroga: sin cash out'); end if;
    mins := (lv.data->>'min')::numeric;
    rem := case when mins >= 90 then 2 else 92 - mins end;
    sh := case when m.odds_1 > 1 and m.odds_2 > 1 then least(0.75, greatest(0.25, (1 / m.odds_1) / ((1 / m.odds_1) + (1 / m.odds_2)))) else 0.5 end;
    p := ex_fut_prob(b.pick, (lv.data->>'hs')::int - (lv.data->>'as')::int, rem, sh);
  else
    if lv.data->>'k' <> 's' or lv.data->>'a' is null or lv.data->>'b' is null or b.pick = 'X' then return jsonb_build_object('ok', false, 'why', 'Sin datos frescos del directo'); end if;
    bo := coalesce(nullif((lv.data->>'bo')::int, 0), m.bo, 3); if bo not in (1, 3, 5, 7) then bo := 3; end if;
    need := (bo + 1) / 2; a := (lv.data->>'a')::int; c := (lv.data->>'b')::int;
    p0 := case when m.odds_1 > 1 and m.odds_2 > 1 then (1 / m.odds_1) / ((1 / m.odds_1) + (1 / m.odds_2)) else 0.5 end;
    pm := ex_map_p(least(0.97, greatest(0.03, p0)), bo);
    if a >= need or c >= need then return jsonb_build_object('ok', false, 'why', 'La serie está decidida: espera al pago'); end if;
    if lv.data->>'ra' is not null and lv.data->>'rb' is not null then
      pr := 0.5 + (pm - 0.5) * 0.35;
      q := ex_round_win((lv.data->>'ra')::int, (lv.data->>'rb')::int, pr, pm);
    else q := pm; end if;
    pw := q * ex_w(a + 1, c, need, pm) + (1 - q) * ex_w(a, c + 1, need, pm);
    p := case b.pick when '1' then pw else 1 - pw end;
  end if;
  v := b.stake * b.odds * least(0.99, greatest(0.01, p)) * 0.90;
  return jsonb_build_object('ok', true, 'mode', 'live', 'win', win, 'value', least(win, greatest(1, round(v)))::int, 'p', round(p, 3));
end $$;

create or replace function cash_out_quote(p_bet bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); b bets; m matches;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  select * into b from bets where id = p_bet;
  if not found or b.player <> me then raise exception 'Esa apuesta no es tuya'; end if;
  select * into m from matches where id = b.match_id;
  return jsonb_build_object('bet', b.id, 'stake', b.stake) || ex_cash_value(b, m);
end $$;

-- todas mis apuestas abiertas con su valor, para pintar los botones de una vez
create or replace function cash_out_quotes() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('bet', b.id, 'match', b.match_id, 'stake', b.stake) || ex_cash_value(b, m) order by b.created_at desc, b.id desc), '[]'::jsonb)
            from bets b join matches m on m.id = b.match_id where b.player = me and b.status = 'open');
end $$;

-- cobrar: recalcula en el servidor (nada del cliente cuenta salvo p_min, que solo protege al jugador: si el valor ha bajado de lo que
-- le enseñaron, no se cobra y se le dice cuanto vale ahora)
create or replace function cash_out(p_bet bigint, p_min int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); b bets; m matches; q jsonb; v int; bal int;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  perform pg_advisory_xact_lock(hashtext(me::text));
  select * into b from bets where id = p_bet for update;
  if not found or b.player <> me then raise exception 'Esa apuesta no es tuya'; end if;
  if b.status <> 'open' then raise exception 'Esa apuesta ya está cerrada'; end if;
  select * into m from matches where id = b.match_id;
  q := ex_cash_value(b, m);
  if not (q->>'ok')::boolean then raise exception '%', coalesce(q->>'why', 'Ahora no se puede retirar'); end if;
  v := (q->>'value')::int;
  if p_min is not null and v < p_min then raise exception 'El valor ha cambiado: ahora son % (te enseñaban %)', fmt_int(v), fmt_int(p_min); end if;
  update bets set status = 'cashout', payout = v, settled_at = now() where id = b.id;
  insert into ledger(player, amount, kind, note, bet_id)
    values (me, v, 'cashout', 'Cash out: ' || pick_name(m, b.pick) || ' ' || fmt_odds(b.odds) || ' · ' || m.home || ' vs ' || m.away, b.id);
  insert into chat(body) values (pname(me) || ' retira ' || pick_name(m, b.pick) || ' (' || m.home || ' vs ' || m.away || ') y cobra ' || fmt_int(v) || ' de ' || fmt_int(b.stake));
  select coalesce(sum(amount), 0) into bal from ledger where player = me;
  perform bump();
  return jsonb_build_object('value', v, 'stake', b.stake, 'beneficio', v - b.stake, 'saldo', bal, 'mode', q->>'mode');
end $$;

-- ---------- el bote, los premios y los trofeos cuentan el cash out como apuesta resuelta ----------
create or replace function bote_neto(p uuid, wk date) returns int language sql stable set search_path = public as $$
  select coalesce(sum(case when status = 'won' then payout - stake when status = 'lost' then -stake when status = 'cashout' then payout - stake else 0 end), 0)::int from bets
   where player = p and settled_at >= (wk::timestamp at time zone 'Europe/Madrid') and settled_at < ((wk + 7)::timestamp at time zone 'Europe/Madrid')
$$;

create or replace function bote_semanal() returns int
language plpgsql security definer set search_path = public as $$
declare
  wk date := madrid_week(); prev date := madrid_week() - 7;
  pot int; best int; ganadores uuid[]; parte int; nombres text; n int := 0; r record; txt text := '';
  pd int := coalesce((select (value #>> '{}')::int from settings where key = 'premio_dinero'), 200);
  pr int := coalesce((select (value #>> '{}')::int from settings where key = 'premio_ratio'), 100);
begin
  if prev < (select (value #>> '{}')::date from settings where key = 'season_start') then return 0; end if;
  -- 1) el bote de la semana pasada, una sola vez
  if not exists (select 1 from ledger where kind = 'bote_gana' and week = prev) then
    pot := -(select coalesce(sum(amount), 0) from ledger where kind = 'bote' and week = prev);
    if pot > 0 then
      select max(bote_neto(player, prev)) into best from ledger where kind = 'bote' and week = prev;
      select array_agg(player) into ganadores from ledger where kind = 'bote' and week = prev and bote_neto(player, prev) = best;
      parte := pot / array_length(ganadores, 1);
      insert into ledger(player, amount, kind, note, week) select g, parte, 'bote_gana', 'Bote de la semana', prev from unnest(ganadores) g
      on conflict (player, week) where kind = 'bote_gana' do nothing;
      select string_agg(name, ' y ') into nombres from players where id = any(ganadores);
      txt := 'Bote: ' || nombres || ' se lleva ' || fmt_int(pot);
      n := n + 1;
    end if;
  end if;
  -- 2) premios de la semana pasada, una sola vez
  if not exists (select 1 from ledger where kind = 'premio_semana' and week = prev) then
    -- mas dinero
    select p.id, bote_neto(p.id, prev) v into r from players p order by 2 desc, p.name limit 1;
    if r.v > 0 then
      insert into ledger(player, amount, kind, note, week) values (r.id, pd, 'premio_semana', 'Más dinero de la semana', prev) on conflict do nothing;
      txt := txt || case when txt = '' then '' else ' · ' end || 'más dinero: ' || pname(r.id) || ' +' || fmt_int(pd);
      n := n + 1;
    end if;
    -- mejor ratio (beneficio entre lo apostado), con 3 apuestas resueltas o mas
    select b.player id, sum(case when status in ('won', 'cashout') then payout - stake else -stake end)::numeric / nullif(sum(stake), 0) v into r
      from bets b where status in ('won', 'lost', 'cashout')
       and settled_at >= (prev::timestamp at time zone 'Europe/Madrid') and settled_at < (wk::timestamp at time zone 'Europe/Madrid')
     group by b.player having count(*) >= 3 order by 2 desc limit 1;
    if found and r.v > 0 then
      insert into ledger(player, amount, kind, note, week) values (r.id, pr, 'premio_semana', 'Mejor ratio de la semana', prev) on conflict do nothing;
      txt := txt || case when txt = '' then '' else ' · ' end || 'mejor ratio: ' || pname(r.id) || ' +' || fmt_int(pr);
      n := n + 1;
    end if;
  end if;
  if txt <> '' then insert into chat(body) values ('Premios de la semana: ' || txt); perform bump(); end if;
  return n;
end $$;

create or replace function ex_trofeos_apunta() returns int
language plpgsql security definer set search_path = public as $$
declare
  ss date := (select (value #>> '{}')::date from settings where key = 'season_start');
  hoy date := date_trunc('month', now() at time zone 'Europe/Madrid')::date;
  s date := date_trunc('month', coalesce(ss, (now() at time zone 'Europe/Madrid')::date)::timestamp)::date;
  n int := 0; k int;
begin
  perform pg_advisory_xact_lock(hashtext('ex_trofeos'));
  while s < hoy loop
    if not exists (select 1 from ex_trofeos where tipo = 'mes' and periodo = s) then
      with t as (
        select player, sum(case when status in ('won', 'cashout') then payout - stake else -stake end)::int v from bets
         where status in ('won', 'lost', 'cashout')
           and settled_at >= (s::timestamp at time zone 'Europe/Madrid') and settled_at < ((s + interval '1 month')::timestamp at time zone 'Europe/Madrid')
         group by player)
      insert into ex_trofeos(tipo, periodo, player, nota, valor)
        select 'mes', s, player, '', v from t where v > 0 and v = (select max(v) from t)
      on conflict do nothing;
      get diagnostics k = row_count; n := n + k;
    end if;
    s := (s + interval '1 month')::date;
  end loop;
  insert into ex_trofeos(tipo, periodo, player, nota, valor)
    select 'bote', week, player, 'Bote de la semana', amount from ledger where kind = 'bote_gana' and week is not null
  on conflict do nothing;
  get diagnostics k = row_count; n := n + k;
  insert into ex_trofeos(tipo, periodo, player, nota, valor)
    select 'premio', week, player, note, amount from ledger where kind = 'premio_semana' and week is not null
  on conflict do nothing;
  get diagnostics k = row_count; n := n + k;
  return n;
end $$;

create or replace function ex_vitrinas() returns jsonb
language plpgsql security definer set search_path = public as $$
declare mes0 date := date_trunc('month', now() at time zone 'Europe/Madrid')::date; rp jsonb; rc jsonb; ma jsonb;
begin
  if auth.uid() is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  perform ex_trofeos_apunta();
  select jsonb_build_object('v', b.payout, 'pl', b.player, 'match', m.home || ' vs ' || m.away, 'pick', pick_name(m, b.pick), 'odds', b.odds, 'at', b.settled_at) into rp
    from bets b join matches m on m.id = b.match_id where b.status = 'won' order by b.payout desc, b.settled_at limit 1;
  select jsonb_build_object('v', b.odds, 'pl', b.player, 'match', m.home || ' vs ' || m.away, 'pick', pick_name(m, b.pick), 'stake', b.stake, 'at', b.settled_at) into rc
    from bets b join matches m on m.id = b.match_id where b.status = 'won' order by b.odds desc, b.payout desc, b.settled_at limit 1;
  with t as (
    select player, sum(case when status in ('won', 'cashout') then payout - stake else -stake end)::int v from bets
     where status in ('won', 'lost', 'cashout') and settled_at >= (mes0::timestamp at time zone 'Europe/Madrid') group by player)
  select coalesce(jsonb_agg(jsonb_build_object('pl', player, 'v', v)), '[]'::jsonb) into ma from t where v > 0 and v = (select max(v) from t);
  return jsonb_build_object(
    'me', auth.uid(),
    'jug', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'color', p.color, 'n', p.name, 'ini', p.ini,
              'vit', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'item', i.item_id, 'name', t.name, 'phase', t.phase, 'rarity', t.rarity, 'image', t.image,
                         'wear', i.wear, 'float', i.fl, 'st', i.st, 'value', i.value) order by v.slot), '[]'::jsonb)
                      from ex_vitrina v join cs_inv i on i.id = v.inv_id and i.player = v.player and i.status = 'own' join cs_items t on t.id = i.item_id
                     where v.player = p.id)) order by p.created_at), '[]'::jsonb) from players p),
    'trofeos', (select coalesce(jsonb_agg(jsonb_build_object('t', tipo, 'p', periodo, 'pl', player, 'n', nota, 'v', valor) order by periodo desc, id desc), '[]'::jsonb)
                from (select * from ex_trofeos order by periodo desc, id desc limit 300) t),
    'mes', jsonb_build_object('p', mes0, 'lider', ma),
    'records', jsonb_build_object('premio', rp, 'cuota', rc)
  );
end $$;

-- ---------- quien puede llamar a que ----------
revoke all on function sync_ex_live_put(text, jsonb), ex_fut_prob(text, int, numeric, numeric), ex_w(int, int, int, numeric), ex_map_p(numeric, int),
  ex_round_win(int, int, numeric, numeric), ex_cash_value(bets, matches), cash_out_quote(bigint), cash_out_quotes(), cash_out(bigint, int) from public, anon;
revoke all on function ex_fut_prob(text, int, numeric, numeric), ex_w(int, int, int, numeric), ex_map_p(numeric, int), ex_round_win(int, int, numeric, numeric), ex_cash_value(bets, matches) from authenticated;
grant execute on function cash_out_quote(bigint), cash_out_quotes(), cash_out(bigint, int) to authenticated;
grant execute on function sync_ex_live_put(text, jsonb) to anon, authenticated;
revoke all on function bote_neto(uuid, date), bote_semanal(), ex_trofeos_apunta() from public, anon, authenticated;
grant execute on function ex_vitrinas() to authenticated;
