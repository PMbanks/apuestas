-- Vigesimosegunda parte (30-10). Tres cosas nuevas, todas con el dinero dentro de la base:
--   1) CUOTA MEJORADA SEMANAL. PM: "mas que diaria, semanal, en algun partido importante, finales o algo asi".
--      Cada semana (lunes a lunes, hora de Madrid) el servidor elige un partido gordo (final, semifinal, Champions entre
--      grandes, evento principal de UFC, fase final internacional de Valorant o CS2) y sube un 25 a 50 % la cuota de una
--      eleccion o de las tres. place_bet usa esa cuota y la apuesta guarda la cuota mejorada (bets.odds) y el porcentaje (bets.boost).
--      Como la subida en las tres elecciones deja ganar siempre apostando a todo, hay un tope por jugador (boost_tope, 1000).
--   2) PREDICCION RAPIDA EN DIRECTO (futbol: gol en 10 minutos; Valorant: quien gana la siguiente ronda). Apuesta pequena
--      (pred_max, 50) a cuota fija. La resuelve el sincronizador con ESPN y vlr.gg; la base solo cree lo que le manda con la clave.
--   3) VITRINA (3 skins del inventario) y SALA DE TROFEOS (campeon de cada mes, bote, premios de la semana, records).
-- Se puede ejecutar varias veces. Orden: despues de 001 a 019 (necesita 007 y 009 y 015 para lo suyo).
-- OJO: redefine place_bet (la de 001). Si otra parte nueva tambien la redefine, tiene que cargarse antes que esta.

insert into settings(key, value) values
  ('boost_tope', '1000'),        -- lo maximo que un jugador puede apostar con cuota mejorada en un partido
  ('pred_max', '50'),            -- apuesta maxima de una prediccion rapida
  ('pred_gol_si', '3.00'),       -- cuota de "habra gol en 10 minutos"
  ('pred_gol_no', '1.25'),       -- cuota de "no habra gol"
  ('pred_ronda', '1.90')         -- cuota de cada equipo en "quien gana la siguiente ronda"
on conflict (key) do nothing;

-- =====================================================================================================================
-- 1) CUOTA MEJORADA SEMANAL
-- =====================================================================================================================
alter table bets add column if not exists boost int;                      -- % de mejora que llevaba la cuota al apostar (null: ninguna)

create table if not exists ex_boosts (
  week date primary key,                                                  -- el lunes de la semana (hora de Madrid)
  match_id text not null references matches on delete cascade,
  pick text check (pick in ('1','X','2')),                                -- null: las tres elecciones
  pct int not null check (pct between 25 and 50),
  created_at timestamptz not null default now()
);
create index if not exists ex_boosts_match on ex_boosts(match_id);
alter table ex_boosts enable row level security;
drop policy if exists ex_boosts_read on ex_boosts;
create policy ex_boosts_read on ex_boosts for select to authenticated using (is_player());

-- cuanto "pesa" un partido: finales, semifinales, Champions entre grandes, evento principal de UFC, fase final internacional
create or replace function ex_boost_score(m matches) returns int
language sql stable set search_path = public as $$
  select case
    when m.sport in ('v','c') and coalesce(m.tag, '') <> 'Internacional' then 0
    when m.sport = 'u' and coalesce(m.tag, '') <> 'Combate estelar' then 0
    else
      (case
        when lower(coalesce(m.stage, '')) ~ 'grand[ -]?final|gran final' then 100
        when lower(coalesce(m.stage, '')) ~ 'semi' then 80
        when lower(coalesce(m.stage, '')) ~ 'quarter|cuartos' then 55
        when lower(coalesce(m.stage, '')) ~ '(^|[^a-z])final([^a-z]|$)' then 95
        when m.sport in ('v','c') and lower(coalesce(m.stage, '')) ~ 'playoff|elimination|knockout|bracket|lower|upper' then 40
        else 0 end)
      + (case when m.sport = 'f' and m.league = 'uefa.champions' then 30
              when m.sport = 'f' and m.league in ('esp.1','eng.1','ger.1','ita.1','fra.1','uefa.europa','esp.copa_del_rey') then 10
              else 0 end)
      + (case when m.sport = 'f'
               and lower(m.home) ~ '(real madrid|barcelona|atl(e|é)tico|man(chester)? (city|united|utd)|liverpool|arsenal|chelsea|tottenham|bayern|dortmund|leverkusen|psg|paris|juventus|inter|milan|napoli|benfica|porto|sporting|ajax|psv)'
               and lower(m.away) ~ '(real madrid|barcelona|atl(e|é)tico|man(chester)? (city|united|utd)|liverpool|arsenal|chelsea|tottenham|bayern|dortmund|leverkusen|psg|paris|juventus|inter|milan|napoli|benfica|porto|sporting|ajax|psv)'
              then 25 else 0 end)
      + (case when m.sport = 'f' and m.league in ('uefa.champions','esp.1','eng.1','ger.1','ita.1','fra.1')
               and m.odds_1 is not null and m.odds_2 is not null and abs(m.odds_1 - m.odds_2) <= 0.8 then 10 else 0 end)
      + (case when m.sport = 'u' then 60 + (case when lower(coalesce(m.stage, '')) ~ 'title|champion' then 25 else 0 end) else 0 end)
      + (case when m.sport in ('v','c') then 35 else 0 end)
      + (case when coalesce(m.bo, 0) >= 5 then 10 else 0 end)
  end
$$;

-- el % de mejora que tiene una eleccion de un partido (null: ninguno)
create or replace function ex_boost_pct(p_match text, p_pick text) returns int
language sql stable security definer set search_path = public as $$
  select pct from ex_boosts where match_id = p_match and (pick is null or pick = p_pick) limit 1
$$;

-- elige el partido de esta semana (una sola vez). Lo llaman la app (al abrir) y el sincronizador. Devuelve el partido o null
create or replace function ex_pick_boost() returns text
language plpgsql security definer set search_path = public as $$
declare wk date := madrid_week(); mid text; m matches; sc int; picks text[]; pk text; pc int; txt text;
begin
  select match_id into mid from ex_boosts where week = wk;
  if mid is not null then return mid; end if;
  perform pg_advisory_xact_lock(hashtext('ex_boost'));
  select match_id into mid from ex_boosts where week = wk;
  if mid is not null then return mid; end if;
  select * into m from matches
   where status = 'scheduled' and starts_at > now() + interval '30 minutes'
     and starts_at < ((wk + 7)::timestamp at time zone 'Europe/Madrid')
     and odds_1 is not null and odds_2 is not null
   order by ex_boost_score(matches) desc, abs(odds_1 - odds_2), starts_at limit 1;
  if not found then return null; end if;
  sc := ex_boost_score(m);
  if sc < 40 then return null; end if;                                    -- si no hay nada gordo esta semana, no se mejora nada
  picks := array['1','2'] || case when m.odds_x is not null then array['X'] else array[]::text[] end;
  pc := 25 + floor(random() * 26)::int;                                   -- de 25 a 50
  pk := case when random() < 0.25 then null else picks[1 + floor(random() * cardinality(picks))::int] end;
  insert into ex_boosts(week, match_id, pick, pct) values (wk, m.id, pk, pc) on conflict (week) do nothing;
  if not found then return (select match_id from ex_boosts where week = wk); end if;
  txt := 'Cuota mejorada de la semana: ' || m.home || ' vs ' || m.away || ', '
      || case when pk is null then 'las tres cuotas suben' else 'sube la cuota de ' || pick_name(m, pk) end || ' un ' || pc || ' %';
  insert into chat(body) values (txt);
  perform bump();
  return m.id;
end $$;

-- PM puede cambiar la de esta semana a mano (partido sin empezar, de 25 a 50 %, pick null = las tres)
create or replace function ex_admin_boost(p_match text, p_pick text default null, p_pct int default 40) returns void
language plpgsql security definer set search_path = public as $$
declare m matches;
begin
  if not exists (select 1 from players where id = auth.uid() and is_admin) then raise exception 'Solo PM puede cambiar la cuota mejorada'; end if;
  select * into m from matches where id = p_match;
  if not found or m.status <> 'scheduled' or m.starts_at <= now() then raise exception 'Ese partido no se puede mejorar'; end if;
  if p_pick is not null and p_pick not in ('1','X','2') then raise exception 'Elige 1, X o 2'; end if;
  if p_pct is null or p_pct < 25 or p_pct > 50 then raise exception 'La mejora va de 25 a 50'; end if;
  insert into ex_boosts(week, match_id, pick, pct) values (madrid_week(), p_match, p_pick, p_pct)
  on conflict (week) do update set match_id = excluded.match_id, pick = excluded.pick, pct = excluded.pct, created_at = now();
  perform bump();
end $$;

-- lo que ve la app: las cuotas mejoradas vigentes (partido sin empezar)
create or replace function ex_estado() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  perform ex_pick_boost();
  return jsonb_build_object(
    'tope', coalesce((select (value #>> '{}')::int from settings where key = 'boost_tope'), 1000),
    'boosts', (select coalesce(jsonb_agg(jsonb_build_object(
        'week', b.week, 'match', b.match_id, 'pick', b.pick, 'pct', b.pct, 'sport', m.sport, 'league', m.league_name,
        'home', m.home, 'away', m.away, 'home_logo', m.home_logo, 'away_logo', m.away_logo, 'at', m.starts_at,
        'usado', (select coalesce(sum(x.stake), 0) from bets x where x.player = me and x.match_id = b.match_id and x.boost is not null and x.status <> 'void')
      ) order by m.starts_at), '[]'::jsonb)
      from ex_boosts b join matches m on m.id = b.match_id where m.status = 'scheduled' and m.starts_at > now())
  );
end $$;

-- apostar: igual que en 001, con la cuota mejorada para quien apuesta a esa eleccion
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
  if p_pick not in ('1','X','2') then raise exception 'Elige 1, X o 2'; end if;
  o := case p_pick when '1' then m.odds_1 when 'X' then m.odds_x else m.odds_2 end;
  if o is null or o <= 1 then raise exception 'Esa opción no se puede apostar'; end if;
  if p_stake is null or p_stake < 1 then raise exception 'La apuesta mínima es 1'; end if;
  perform pg_advisory_xact_lock(hashtext(me::text));      -- dos apuestas a la vez del mismo jugador no se pisan
  pct := ex_boost_pct(p_match, p_pick);
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

-- =====================================================================================================================
-- 2) PREDICCION RAPIDA EN DIRECTO
-- =====================================================================================================================
-- Futbol: "habra gol en los proximos 10 minutos". La ventana se mide con el reloj del servidor y se comprueba con la hora
--   real (wallclock) de cada gol en ESPN: cuentan los goles desde 1 minuto despues de apostar (ESPN tarda en apuntarlos y asi
--   un gol ya visto en la tele no cuenta) hasta 11 minutos despues. Si hay descanso en medio, la ventana se alarga lo que dure.
--   Si el partido acaba antes de que termine la ventana y no hubo gol, se devuelve.
-- Valorant: "quien gana la ronda N del mapa X". La resuelve el sincronizador con el historial ronda a ronda de vlr.gg.
--   vlr no da la hora de cada ronda: para que nadie apueste a una ronda ya jugada, la base solo acepta rondas posteriores a
--   lo ultimo que vio el sincronizador (ex_pred_obs) mas las que han tenido tiempo de acabar desde entonces (155 s por ronda).
create table if not exists ex_pred_obs (                                  -- lo ultimo que vio el sincronizador de cada mapa en directo
  match_id text not null references matches on delete cascade,
  ref text not null,                                                      -- nombre del mapa en minusculas
  n int not null check (n >= 0),                                          -- rondas ya jugadas
  at timestamptz not null default now(),
  primary key (match_id, ref)
);
alter table ex_pred_obs enable row level security;                        -- sin politica: solo las funciones lo ven

create table if not exists ex_pred (
  id bigint generated always as identity primary key,
  player uuid not null references players on delete cascade,
  match_id text not null references matches on delete cascade,
  kind text not null check (kind in ('gol', 'ronda')),
  pick text not null,                                                     -- gol: si / no; ronda: 1 (local) / 2 (visitante)
  ref text,                                                               -- ronda: mapa
  n int,                                                                  -- ronda: numero de ronda
  stake int not null check (stake > 0),
  odds numeric(6,2) not null check (odds > 1),
  status text not null default 'open' check (status in ('open','won','lost','void')),
  payout int not null default 0,
  placed_at timestamptz not null default now(),
  win_from timestamptz,                                                   -- gol: la ventana
  win_to timestamptz,
  evidence text,                                                          -- lo que vio el sincronizador al resolver
  settled_at timestamptz,
  check ((kind = 'gol' and pick in ('si','no')) or (kind = 'ronda' and pick in ('1','2') and ref is not null and n is not null and n >= 1))
);
create unique index if not exists ex_pred_un_gol on ex_pred(player, match_id) where kind = 'gol' and status = 'open';
create unique index if not exists ex_pred_un_ronda on ex_pred(player, match_id, ref, n) where kind = 'ronda';
create index if not exists ex_pred_open on ex_pred(status, placed_at);
alter table ex_pred enable row level security;
drop policy if exists ex_pred_own on ex_pred;
create policy ex_pred_own on ex_pred for select to authenticated using (player = auth.uid());

create or replace function ex_set_int(k text, d int) returns int
language sql stable set search_path = public as $$ select coalesce((select (value #>> '{}')::int from settings where key = k), d) $$;
create or replace function ex_set_num(k text, d numeric) returns numeric
language sql stable set search_path = public as $$ select coalesce((select (value #>> '{}')::numeric from settings where key = k), d) $$;

create or replace function ex_pred_nota(r ex_pred, m matches) returns text
language sql stable set search_path = public as $$
  select case when r.kind = 'gol'
    then 'Gol en 10 min: ' || case r.pick when 'si' then 'sí' else 'no' end || ' ' || fmt_odds(r.odds) || ' · ' || m.home || ' vs ' || m.away
    else 'Ronda ' || r.n || ' de ' || initcap(r.ref) || ': ' || pick_name(m, r.pick) || ' ' || fmt_odds(r.odds) end
$$;

-- devuelve lo apostado si pasan 8 horas sin que el sincronizador pueda comprobarlo
create or replace function ex_pred_caducar() returns int
language plpgsql security definer set search_path = public as $$
declare r ex_pred; n int := 0;
begin
  for r in select * from ex_pred where status = 'open' and placed_at < now() - interval '8 hours' for update loop
    update ex_pred set status = 'void', payout = r.stake, settled_at = now(), evidence = 'Sin datos para comprobarlo: se devuelve' where id = r.id;
    insert into ledger(player, amount, kind, note) values (r.player, r.stake, 'pred_devol', 'Predicción sin resultado, devuelta');
    n := n + 1;
  end loop;
  if n > 0 then perform bump(); end if;
  return n;
end $$;

create or replace function ex_pred_gol(p_match text, p_pick text, p_stake int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); m matches; o numeric; bal int; pid bigint; mx int := ex_set_int('pred_max', 50); d1 timestamptz := now() + interval '60 seconds'; d2 timestamptz := now() + interval '11 minutes';
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  perform pay_week();
  select * into m from matches where id = p_match;
  if not found then raise exception 'Ese partido no existe'; end if;
  if m.sport <> 'f' or m.details->'espn' is null then raise exception 'Este partido no admite predicciones rápidas'; end if;
  if m.status <> 'live' or m.starts_at > now() or m.starts_at < now() - interval '4 hours' then raise exception 'El partido no está en juego ahora mismo'; end if;
  if p_pick not in ('si', 'no') then raise exception 'Elige sí o no'; end if;
  if p_stake is null or p_stake < 1 or p_stake > mx then raise exception 'La predicción rápida va de 1 a %', mx; end if;
  o := case p_pick when 'si' then ex_set_num('pred_gol_si', 3.00) else ex_set_num('pred_gol_no', 1.25) end;
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

create or replace function ex_pred_ronda(p_match text, p_ref text, p_round int, p_pick text, p_stake int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); m matches; o numeric; bal int; pid bigint; mx int := ex_set_int('pred_max', 50); ob ex_pred_obs; e numeric; lo int; hi int; rf text := lower(trim(coalesce(p_ref, '')));
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
  lo := ob.n + 1 + floor(e / 155)::int;                                   -- estas rondas casi seguro ya han acabado
  hi := ob.n + 2 + ceil(e / 40)::int;
  if p_round is null or p_round < lo then raise exception 'Esa ronda ya se ha jugado o está a punto de acabar'; end if;
  if p_round > hi then raise exception 'Esa ronda está demasiado lejos'; end if;
  o := ex_set_num('pred_ronda', 1.90);
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

-- lo que ve la app en Directo: las reglas, los partidos donde se puede y tus ultimas predicciones
create or replace function ex_pred_estado() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  perform ex_pred_caducar();
  return jsonb_build_object(
    'max', ex_set_int('pred_max', 50), 'gol_si', ex_set_num('pred_gol_si', 3.00), 'gol_no', ex_set_num('pred_gol_no', 1.25), 'ronda', ex_set_num('pred_ronda', 1.90),
    'live', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'sport', m.sport, 'home', m.home, 'away', m.away) order by m.starts_at), '[]'::jsonb)
             from matches m where m.status = 'live' and m.starts_at <= now() and m.starts_at > now() - interval '12 hours'
              and ((m.sport = 'f' and m.details->'espn' is not null) or m.sport = 'v')),
    'mine', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'match', p.match_id, 'kind', p.kind, 'pick', p.pick, 'ref', p.ref, 'n', p.n,
               'stake', p.stake, 'odds', p.odds, 'status', p.status, 'payout', p.payout, 'at', p.placed_at, 'from', p.win_from, 'to', p.win_to, 'ev', p.evidence) order by p.id desc), '[]'::jsonb)
             from (select * from ex_pred where player = me order by id desc limit 40) p)
  );
end $$;

-- ---------- lo que hace el sincronizador (entra con la clave propia, como sync_push) ----------
create or replace function sync_ex_pred_pending(p_secret text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_secret is null or p_secret <> (select value #>> '{}' from settings where key = 'sync_secret') then raise exception 'Clave de sincronización no válida'; end if;
  perform ex_pred_caducar();
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'kind', p.kind, 'pick', p.pick, 'ref', p.ref, 'n', p.n, 'placed', p.placed_at,
            'from', p.win_from, 'to', p.win_to, 'match', p.match_id, 'sport', m.sport, 'status', m.status, 'home', m.home, 'away', m.away, 'espn', m.details->'espn') order by p.id)
          from ex_pred p join matches m on m.id = p.match_id where p.status = 'open'), '[]'::jsonb);
end $$;

-- lo ultimo que se ve de cada mapa de Valorant en directo: [{match, ref, n}]
create or replace function sync_ex_pred_put(p_secret text, p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare r jsonb; k int := 0;
begin
  if p_secret is null or p_secret <> (select value #>> '{}' from settings where key = 'sync_secret') then raise exception 'Clave de sincronización no válida'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    if not exists (select 1 from matches where id = r->>'match') then continue; end if;
    insert into ex_pred_obs(match_id, ref, n, at) values (r->>'match', lower(trim(r->>'ref')), greatest(0, (r->>'n')::int), now())
    on conflict (match_id, ref) do update set n = greatest(ex_pred_obs.n, excluded.n), at = now();
    k := k + 1;
  end loop;
  delete from ex_pred_obs where at < now() - interval '3 days';
  return k;
end $$;

-- el veredicto de cada prediccion: [{id, res: won|lost|void, ev}]
create or replace function sync_ex_pred_resolve(p_secret text, p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare x jsonb; r ex_pred; m matches; n int := 0; pay int; res text;
begin
  if p_secret is null or p_secret <> (select value #>> '{}' from settings where key = 'sync_secret') then raise exception 'Clave de sincronización no válida'; end if;
  for x in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    res := x->>'res';
    if res is null or res not in ('won', 'lost', 'void') then continue; end if;
    select * into r from ex_pred where id = (x->>'id')::bigint for update;
    if not found or r.status <> 'open' then continue; end if;
    select * into m from matches where id = r.match_id;
    if res = 'won' then
      pay := round(r.stake * r.odds)::int;
      update ex_pred set status = 'won', payout = pay, settled_at = now(), evidence = left(x->>'ev', 300) where id = r.id;
      insert into ledger(player, amount, kind, note) values (r.player, pay, 'pred_premio', ex_pred_nota(r, m));
      insert into chat(body) values (pname(r.player) || ' acertó la predicción rápida de ' || m.home || ' vs ' || m.away || ' y cobra ' || fmt_int(pay));
    elsif res = 'lost' then
      update ex_pred set status = 'lost', settled_at = now(), evidence = left(x->>'ev', 300) where id = r.id;
    else
      update ex_pred set status = 'void', payout = r.stake, settled_at = now(), evidence = left(x->>'ev', 300) where id = r.id;
      insert into ledger(player, amount, kind, note) values (r.player, r.stake, 'pred_devol', 'Predicción devuelta: ' || coalesce(left(x->>'ev', 80), 'sin resultado'));
    end if;
    n := n + 1;
  end loop;
  if n > 0 then perform bump(); end if;
  return n;
end $$;

-- =====================================================================================================================
-- 3) VITRINA Y SALA DE TROFEOS
-- =====================================================================================================================
create table if not exists ex_vitrina (
  player uuid not null references players on delete cascade,
  slot smallint not null check (slot between 1 and 3),
  inv_id bigint not null references cs_inv on delete cascade,
  primary key (player, slot),
  unique (inv_id)
);
alter table ex_vitrina enable row level security;
drop policy if exists ex_vitrina_read on ex_vitrina;
create policy ex_vitrina_read on ex_vitrina for select to authenticated using (is_player());

-- los trofeos se guardan para siempre (aunque luego se limpie el monedero) y se apuntan sin duplicar
create table if not exists ex_trofeos (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('mes', 'bote', 'premio')),
  periodo date not null,                                                  -- mes: su dia 1; bote y premio: el lunes de esa semana
  player uuid not null references players on delete cascade,
  nota text not null default '',                                          -- premio: cual ('Más dinero de la semana'...)
  valor int not null default 0,                                           -- mes: lo ganado con apuestas; bote y premio: lo cobrado
  created_at timestamptz not null default now()
);
create unique index if not exists ex_trofeos_un on ex_trofeos(tipo, periodo, player, nota);
alter table ex_trofeos enable row level security;
drop policy if exists ex_trofeos_read on ex_trofeos;
create policy ex_trofeos_read on ex_trofeos for select to authenticated using (is_player());

-- apunta los trofeos que falten: campeon de cada mes cerrado, bote de cada semana y premios de la semana (db/015)
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
        select player, sum(case when status = 'won' then payout - stake else -stake end)::int v from bets
         where status in ('won', 'lost')
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

-- elegir las skins de la vitrina: hasta 3 del inventario propio, en ese orden (lista vacia = vaciarla)
create or replace function ex_set_vitrina(p_ids bigint[]) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); i int; n int;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  p_ids := coalesce(p_ids, array[]::bigint[]);
  n := cardinality(p_ids);
  if n > 3 then raise exception 'La vitrina tiene sitio para 3 skins'; end if;
  if n <> (select count(distinct x) from unnest(p_ids) x) then raise exception 'Hay una skin repetida'; end if;
  perform pg_advisory_xact_lock(hashtext(me::text));
  if (select count(*) from cs_inv where id = any(p_ids) and player = me and status = 'own') <> n then raise exception 'Una de esas skins no es tuya'; end if;
  delete from ex_vitrina where player = me;
  for i in 1..n loop
    insert into ex_vitrina(player, slot, inv_id) values (me, i, p_ids[i]);
  end loop;
  perform bump();
end $$;

-- mi inventario, para elegir (lo mas valioso primero)
create or replace function ex_mis_skins() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  return (select coalesce(jsonb_agg(j order by v desc, id desc), '[]'::jsonb) from (
    select i.id, i.value v, jsonb_build_object('id', i.id, 'item', i.item_id, 'name', t.name, 'phase', t.phase, 'rarity', t.rarity, 'image', t.image,
             'wear', i.wear, 'float', i.fl, 'st', i.st, 'value', i.value) j
      from cs_inv i join cs_items t on t.id = i.item_id where i.player = auth.uid() and i.status = 'own' order by i.value desc, i.id desc limit 150) q);
end $$;

-- todo lo del perfil: vitrinas de todos, la sala de trofeos y los records
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
    select player, sum(case when status = 'won' then payout - stake else -stake end)::int v from bets
     where status in ('won', 'lost') and settled_at >= (mes0::timestamp at time zone 'Europe/Madrid') group by player)
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

-- el sincronizador: elegir la cuota mejorada de la semana, apuntar trofeos y devolver lo caducado
create or replace function sync_ex(p_secret text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare mid text; tr int; cad int;
begin
  if p_secret is null or p_secret <> (select value #>> '{}' from settings where key = 'sync_secret') then raise exception 'Clave de sincronización no válida'; end if;
  mid := ex_pick_boost();
  tr := ex_trofeos_apunta();
  cad := ex_pred_caducar();
  return jsonb_build_object('boost', mid, 'trofeos', tr, 'caducadas', cad);
end $$;

-- ---------- quien puede llamar a que ----------
revoke all on function ex_boost_score(matches), ex_boost_pct(text, text), ex_pick_boost(), ex_admin_boost(text, text, int), ex_estado(),
  place_bet(text, text, int), ex_set_int(text, int), ex_set_num(text, numeric), ex_pred_nota(ex_pred, matches), ex_pred_caducar(),
  ex_pred_gol(text, text, int), ex_pred_ronda(text, text, int, text, int), ex_pred_estado(),
  sync_ex_pred_pending(text), sync_ex_pred_put(text, jsonb), sync_ex_pred_resolve(text, jsonb),
  ex_trofeos_apunta(), ex_set_vitrina(bigint[]), ex_mis_skins(), ex_vitrinas(), sync_ex(text) from public, anon;
revoke all on function ex_boost_score(matches), ex_boost_pct(text, text), ex_pick_boost(), ex_set_int(text, int), ex_set_num(text, numeric),
  ex_pred_nota(ex_pred, matches), ex_pred_caducar(), ex_trofeos_apunta() from authenticated;
grant execute on function place_bet(text, text, int), ex_estado(), ex_admin_boost(text, text, int), ex_pred_gol(text, text, int),
  ex_pred_ronda(text, text, int, text, int), ex_pred_estado(), ex_set_vitrina(bigint[]), ex_mis_skins(), ex_vitrinas() to authenticated;
grant execute on function sync_ex_pred_pending(text), sync_ex_pred_put(text, jsonb), sync_ex_pred_resolve(text, jsonb), sync_ex(text) to anon, authenticated;
