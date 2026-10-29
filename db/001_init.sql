-- Apuestas entre colegas: tablas, reglas y funciones.
-- Se puede ejecutar varias veces (todo es "if not exists" o "or replace").
-- El dinero solo se mueve dentro de las funciones de aqui abajo: nadie escribe en bets ni en ledger directamente.

-- ---------- tablas ----------
create table if not exists players (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null,
  name text not null,
  ini text not null,
  color text not null default 'c1',          -- clase de color en la app: pm, c1, c2
  apodo text not null default '',
  frase text not null default '',
  photo_url text,
  favs jsonb not null default '[]',
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists settings (key text primary key, value jsonb not null);
insert into settings(key, value) values
  ('weekly_amount', '1000'),
  ('vis', '"open"'),                          -- open: las elecciones se ven siempre; kick: al empezar el partido
  ('season_start', '"2026-10-26"')
on conflict (key) do nothing;

create table if not exists matches (
  id text primary key,
  sport text not null check (sport in ('f','v','u')),
  league text not null,
  league_name text not null,
  league_logo text,
  stage text,
  tag text,
  venue text,
  home text not null,
  away text not null,
  home_logo text,
  away_logo text,
  starts_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','live','final','canceled')),
  score text,
  winner text check (winner in ('1','X','2')),
  odds_1 numeric(6,2),
  odds_x numeric(6,2),
  odds_2 numeric(6,2),
  odds_src text,
  bo int,
  details jsonb not null default '{}',
  revealed boolean not null default false,
  settled boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists matches_starts on matches(starts_at);

create table if not exists bets (
  id bigint generated always as identity primary key,
  player uuid not null references players on delete cascade,
  match_id text not null references matches on delete cascade,
  pick text not null check (pick in ('1','X','2')),
  stake int not null check (stake > 0),
  odds numeric(6,2) not null check (odds > 1),
  status text not null default 'open' check (status in ('open','won','lost','void')),
  payout int not null default 0,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index if not exists bets_match on bets(match_id);
create index if not exists bets_player on bets(player);

create table if not exists ledger (
  id bigint generated always as identity primary key,
  player uuid not null references players on delete cascade,
  amount int not null,
  kind text not null check (kind in ('paga','apuesta','premio','devolucion','ajuste')),
  note text not null default '',
  bet_id bigint references bets on delete set null,
  week date,                                 -- solo en 'paga': el lunes de esa semana (hora de Madrid)
  created_at timestamptz not null default now()
);
create unique index if not exists ledger_one_pay_per_week on ledger(player, week) where kind = 'paga';
create index if not exists ledger_player on ledger(player, created_at);

create table if not exists chat (
  id bigint generated always as identity primary key,
  player uuid references players on delete set null,   -- null = aviso de la app
  body text not null default '' check (char_length(body) <= 500),
  image_url text check (image_url is null or char_length(image_url) <= 600),
  created_at timestamptz not null default now()
);
create index if not exists chat_created on chat(created_at);

-- una fila que cambia cada vez que se mueve algo: la app escucha aqui y recarga
create table if not exists pulse (id int primary key default 1 check (id = 1), at timestamptz not null default now());
insert into pulse(id) values (1) on conflict do nothing;

-- ---------- permisos de lectura (escribir solo por funciones) ----------
alter table players  enable row level security;
alter table settings enable row level security;
alter table matches  enable row level security;
alter table bets     enable row level security;
alter table ledger   enable row level security;
alter table chat     enable row level security;
alter table pulse    enable row level security;

drop policy if exists players_read on players;   create policy players_read  on players  for select to authenticated using (true);
drop policy if exists settings_read on settings; create policy settings_read on settings for select to authenticated using (true);
drop policy if exists matches_read on matches;   create policy matches_read  on matches  for select to authenticated using (true);
drop policy if exists pulse_read on pulse;       create policy pulse_read    on pulse    for select to authenticated using (true);
drop policy if exists chat_read on chat;         create policy chat_read     on chat     for select to authenticated using (true);
drop policy if exists chat_write on chat;
create policy chat_write on chat for insert to authenticated
  with check (player = auth.uid() and (char_length(body) > 0 or image_url is not null));
drop policy if exists bets_read_own on bets;     create policy bets_read_own   on bets   for select to authenticated using (player = auth.uid());
drop policy if exists ledger_read_own on ledger; create policy ledger_read_own on ledger for select to authenticated using (player = auth.uid());

-- ---------- utilidades ----------
create or replace function madrid_week(t timestamptz default now()) returns date
language sql stable as $$ select date_trunc('week', t at time zone 'Europe/Madrid')::date $$;

create or replace function bump() returns void
language sql security definer set search_path = public as $$ update pulse set at = now() where id = 1 $$;

create or replace function fmt_odds(o numeric) returns text
language sql immutable as $$ select replace(to_char(o, 'FM990.00'), '.', ',') $$;

create or replace function pick_name(m matches, p text) returns text
language sql immutable as $$ select case p when '1' then m.home when '2' then m.away else 'Empate' end $$;

create or replace function fmt_int(n int) returns text
language sql immutable as $$ select replace(to_char(n, 'FM999G999G999'), ',', '.') $$;

-- ---------- la paga del lunes ----------
-- Idempotente: cada jugador cobra una vez por semana (hora de Madrid). La llaman la app y el sincronizador.
create or replace function pay_week() returns int
language plpgsql security definer set search_path = public as $$
declare
  amt int := (select (value #>> '{}')::int from settings where key = 'weekly_amount');
  wk date := madrid_week();
  n int;
begin
  if wk < (select (value #>> '{}')::date from settings where key = 'season_start') then return 0; end if;
  insert into ledger(player, amount, kind, note, week)
    select id, amt, 'paga', 'Paga del lunes', wk from players
  on conflict (player, week) where kind = 'paga' do nothing;
  get diagnostics n = row_count;
  if n > 0 then
    if not exists (select 1 from chat where player is null and body like 'Paga del lunes%' and created_at >= (wk::timestamp at time zone 'Europe/Madrid')) then
      insert into chat(body) values ('Paga del lunes: +' || fmt_int(amt) || ' para cada uno');
    end if;
    perform bump();
  end if;
  return n;
end $$;

-- ---------- apostar ----------
create or replace function place_bet(p_match text, p_pick text, p_stake int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  m matches;
  o numeric;
  bal int;
  bid bigint;
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
  select coalesce(sum(amount), 0) into bal from ledger where player = me;
  if p_stake > bal then raise exception 'No tienes saldo suficiente: te quedan %', fmt_int(bal); end if;
  insert into bets(player, match_id, pick, stake, odds) values (me, p_match, p_pick, p_stake, o) returning id into bid;
  insert into ledger(player, amount, kind, note, bet_id)
    values (me, -p_stake, 'apuesta', pick_name(m, p_pick) || ' ' || fmt_odds(o), bid);
  perform bump();
  return jsonb_build_object('bet', bid, 'saldo', bal - p_stake, 'odds', o);
end $$;

-- ---------- empezar y cerrar partidos (solo el sincronizador) ----------
create or replace function reveal_match(p_match text) returns void
language plpgsql security definer set search_path = public as $$
declare m matches; txt text;
begin
  select * into m from matches where id = p_match for update;
  if not found or m.revealed then return; end if;
  select string_agg(p.name || ' · ' || pick_name(m, b.pick) || ' ' || fmt_int(b.stake), ' · ' order by b.created_at)
    into txt from bets b join players p on p.id = b.player where b.match_id = p_match;
  if txt is not null then
    insert into chat(body) values ('Empieza ' || m.home || ' vs ' || m.away || '. Apuestas: ' || txt);
  end if;
  update matches set revealed = true where id = p_match;
  perform bump();
end $$;

create or replace function settle_match(p_match text) returns int
language plpgsql security definer set search_path = public as $$
declare m matches; b record; n int := 0; res text;
begin
  select * into m from matches where id = p_match for update;
  if not found or m.settled or m.status not in ('final','canceled') then return 0; end if;
  res := m.home || ' ' || coalesce(m.score, '') || ' ' || m.away;
  for b in select bets.*, p.name from bets join players p on p.id = bets.player
           where match_id = p_match and status = 'open' for update of bets loop
    if m.status = 'canceled' or m.winner is null then
      update bets set status = 'void', payout = b.stake, settled_at = now() where id = b.id;
      insert into ledger(player, amount, kind, note, bet_id) values (b.player, b.stake, 'devolucion', 'Anulado: ' || m.home || ' vs ' || m.away, b.id);
      insert into chat(body) values (b.name || ' recupera ' || fmt_int(b.stake) || ': ' || m.home || ' vs ' || m.away || ' no se ha jugado');
    elsif b.pick = m.winner then
      update bets set status = 'won', payout = round(b.stake * b.odds), settled_at = now() where id = b.id;
      insert into ledger(player, amount, kind, note, bet_id)
        values (b.player, round(b.stake * b.odds)::int, 'premio', pick_name(m, b.pick) || ' ' || fmt_odds(b.odds), b.id);
      insert into chat(body) values (b.name || ' ganó ' || fmt_int(round(b.stake * b.odds)::int) || ' con ' || pick_name(m, b.pick) || ' · ' || res);
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

-- ---------- lo que ve la app ----------
-- Todas las apuestas de todos, con la eleccion tapada si la regla es "al empezar" y el partido no ha empezado.
create or replace function get_state() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  vis text := (select value #>> '{}' from settings where key = 'vis');
  ss date := (select (value #>> '{}')::date from settings where key = 'season_start');
  out jsonb;
begin
  if me is null or not exists (select 1 from players where id = me) then raise exception 'Tienes que entrar primero'; end if;
  perform pay_week();
  select jsonb_build_object(
    'me', me,
    'now', now(),
    'vis', vis,
    'weekly', (select (value #>> '{}')::int from settings where key = 'weekly_amount'),
    'season_start', ss,
    'players', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'username', case when p.id = me then p.username end, 'name', p.name, 'ini', p.ini, 'color', p.color,
        'apodo', p.apodo, 'frase', p.frase, 'photo', p.photo_url, 'favs', p.favs, 'admin', p.is_admin,
        'created', p.created_at,
        'saldo', (select coalesce(sum(amount), 0) from ledger l where l.player = p.id),
        'recibido', (select coalesce(sum(amount), 0) from ledger l where l.player = p.id and l.kind in ('paga','ajuste')),
        -- saldo al cerrar cada semana de la temporada (la ultima es ahora)
        'weeks', (select coalesce(jsonb_agg((select coalesce(sum(amount), 0) from ledger l
                    where l.player = p.id and l.created_at < least(now(), ((w + interval '7 day') at time zone 'Europe/Madrid'))) order by w), '[]')
                  from generate_series(ss::timestamp, madrid_week()::timestamp, interval '7 day') g(w))
      ) order by p.created_at), '[]') from players p),
    'bets', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', b.id, 'player', b.player, 'match', b.match_id,
        'pick', case when vis = 'open' or b.player = me or m.starts_at <= now() or m.status <> 'scheduled' then b.pick end,
        'stake', b.stake, 'odds', b.odds, 'status', b.status, 'payout', b.payout,
        'created', b.created_at, 'settled', b.settled_at
      ) order by b.created_at desc), '[]') from bets b join matches m on m.id = b.match_id),
    'ledger', (select coalesce(jsonb_agg(jsonb_build_object('at', l.created_at, 'kind', l.kind, 'note', l.note, 'amount', l.amount) order by l.created_at desc, l.id desc), '[]')
               from (select * from ledger where player = me order by created_at desc, id desc limit 60) l)
  ) into out;
  return out;
end $$;

-- ---------- perfil ----------
create or replace function update_profile(p_apodo text default null, p_frase text default null, p_photo text default null, p_favs jsonb default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Tienes que entrar primero'; end if;
  if p_photo is not null and p_photo <> '' and p_photo !~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/fotos/' then
    raise exception 'Esa foto no es válida';
  end if;
  update players set
    apodo = coalesce(left(trim(p_apodo), 24), apodo),
    frase = coalesce(left(trim(p_frase), 80), frase),
    photo_url = case when p_photo is null then photo_url when p_photo = '' then null else p_photo end,
    favs = coalesce(p_favs, favs)
  where id = auth.uid();
  perform bump();
end $$;

-- ---------- ajustes que solo cambia el administrador (PM) ----------
create or replace function admin_set(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from players where id = auth.uid() and is_admin) then raise exception 'Solo PM puede cambiar las reglas'; end if;
  if p_key not in ('vis','weekly_amount') then raise exception 'Ese ajuste no existe'; end if;
  if p_key = 'vis' and p_value #>> '{}' not in ('open','kick') then raise exception 'Valor no válido'; end if;
  update settings set value = p_value where key = p_key;
  perform bump();
end $$;

-- quien puede llamar a que
revoke all on function reveal_match(text), settle_match(text), bump(), pay_week(),
  place_bet(text, text, int), get_state(), update_profile(text, text, text, jsonb), admin_set(text, jsonb) from public, anon;
revoke all on function reveal_match(text), settle_match(text), bump() from authenticated;
grant execute on function pay_week(), place_bet(text, text, int), get_state(), update_profile(text, text, text, jsonb), admin_set(text, jsonb) to authenticated;
grant execute on function reveal_match(text), settle_match(text), pay_week() to service_role;

-- ---------- fotos (perfil y chat) ----------
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists fotos_write on storage.objects;
create policy fotos_write on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists fotos_delete on storage.objects;
create policy fotos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- tiempo real: la app escucha el chat, los partidos y el pulso ----------
do $$
declare t text;
begin
  foreach t in array array['chat','matches','pulse'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
