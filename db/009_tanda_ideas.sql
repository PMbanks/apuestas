-- Novena parte (30-10): primera tanda de las ideas que eligio PM.
-- Premio diario (50 V-Bucks, hay que reclamarlo), rescate si te quedas a cero, bote semanal,
-- reacciones, encuestas y compartir una apuesta en el chat.

-- los kinds del ledger dejan de ser una lista fija: ahora entran juegos y cajas
alter table ledger drop constraint if exists ledger_kind_check;
alter table ledger add constraint ledger_kind_check check (kind ~ '^[a-z_]{3,20}$');

insert into settings(key, value) values ('daily_claim', '50'), ('rescue_amount', '100'), ('bote_amount', '100'), ('bote_desde', '"2026-11-02"')
on conflict (key) do nothing;

create or replace function madrid_day() returns date language sql stable as $$
  select (now() at time zone 'Europe/Madrid')::date
$$;

-- ---------- premio diario: 50 al dia, reclamandolo (PM, 30-10) ----------
create unique index if not exists ledger_one_diario on ledger(player, week) where kind = 'diario';
create or replace function claim_daily() returns int
language plpgsql security definer set search_path = public as $$
declare amt int := coalesce((select (value #>> '{}')::int from settings where key = 'daily_claim'), 50);
begin
  if not is_player() then raise exception 'Tienes que entrar primero'; end if;
  insert into ledger(player, amount, kind, note, week) values (auth.uid(), amt, 'diario', 'Premio diario', madrid_day())
  on conflict (player, week) where kind = 'diario' do nothing;
  if not found then raise exception 'Ya lo has reclamado hoy. Vuelve mañana'; end if;
  perform bump();
  return amt;
end $$;

-- ---------- rescate: si te quedas a cero, 100 una vez por semana ----------
create unique index if not exists ledger_one_rescate on ledger(player, week) where kind = 'rescate';
create or replace function claim_rescue() returns int
language plpgsql security definer set search_path = public as $$
declare amt int := coalesce((select (value #>> '{}')::int from settings where key = 'rescue_amount'), 100);
begin
  if not is_player() then raise exception 'Tienes que entrar primero'; end if;
  if (select coalesce(sum(amount), 0) from ledger where player = auth.uid()) >= 10 then raise exception 'El rescate es solo si te quedas a cero'; end if;
  if exists (select 1 from bets where player = auth.uid() and status = 'open') then raise exception 'Tienes apuestas en juego: espera a que acaben'; end if;
  insert into ledger(player, amount, kind, note, week) values (auth.uid(), amt, 'rescate', 'Rescate', madrid_week())
  on conflict (player, week) where kind = 'rescate' do nothing;
  if not found then raise exception 'Ya has pedido el rescate esta semana'; end if;
  perform bump();
  return amt;
end $$;

-- ---------- bote semanal: cada lunes todos ponen 100; el que mas gane esa semana se lo lleva ----------
create unique index if not exists ledger_one_bote on ledger(player, week) where kind = 'bote';
create unique index if not exists ledger_one_bote_gana on ledger(player, week) where kind = 'bote_gana';
-- lo que cuenta para el bote: todo menos pagas, regalos y el propio bote
create or replace function bote_neto(p uuid, wk date) returns int language sql stable set search_path = public as $$
  select coalesce(sum(amount), 0)::int from ledger
   where player = p and kind not in ('paga', 'bote', 'bote_gana', 'diario', 'rescate', 'ajuste')
     and created_at >= (wk::timestamp at time zone 'Europe/Madrid') and created_at < ((wk + 7)::timestamp at time zone 'Europe/Madrid')
$$;
create or replace function bote_semanal() returns int
language plpgsql security definer set search_path = public as $$
declare
  wk date := madrid_week(); prev date := madrid_week() - 7;
  amt int := coalesce((select (value #>> '{}')::int from settings where key = 'bote_amount'), 100);
  desde date := (select (value #>> '{}')::date from settings where key = 'bote_desde');
  pot int; best int; ganadores uuid[]; parte int; nombres text; n int := 0;
begin
  if desde is null or wk < desde then return 0; end if;
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
      insert into chat(body) values ('Bote de la semana: ' || nombres || ' se lleva ' || fmt_int(pot));
      n := n + 1;
    end if;
  end if;
  -- 2) entrar al de esta semana (despues de la paga del lunes; solo quien tenga para ponerlo)
  insert into ledger(player, amount, kind, note, week)
    select p.id, -amt, 'bote', 'Bote de la semana', wk from players p
     where (select coalesce(sum(amount), 0) from ledger l where l.player = p.id) >= amt
  on conflict (player, week) where kind = 'bote' do nothing;
  get diagnostics pot = row_count;
  if pot > 0 then n := n + pot; perform bump(); end if;
  return n;
end $$;

-- el cierre de cada pasada del sincronizador: igual que en 004 y ademas el bote
create or replace function sync_close(p_secret text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare mid text; rv int := 0; st int := 0; paid int; rt int; bt int;
begin
  if p_secret is null or p_secret <> (select value #>> '{}' from settings where key = 'sync_secret') then
    raise exception 'Clave de sincronización no válida';
  end if;
  paid := pay_week();
  bt := bote_semanal();
  perform pick_daily();
  for mid in select m.id from matches m where not m.revealed and m.status in ('live','final')
             and exists (select 1 from bets b where b.match_id = m.id) loop
    perform reveal_match(mid); rv := rv + 1;
  end loop;
  rt := settle_challenges();
  update matches m set settled = true where not m.settled and m.status in ('final','canceled')
    and not exists (select 1 from bets b where b.match_id = m.id and b.status = 'open');
  for mid in select id from matches where not settled and status in ('final','canceled') limit 60 loop
    st := st + settle_match(mid);
  end loop;
  return jsonb_build_object('revelados', rv, 'pagadas', st, 'pagas', paid, 'retos', rt, 'bote', bt);
end $$;

-- ---------- reacciones a mensajes del chat (c:id) y a apuestas (b:id) ----------
create table if not exists reactions (
  target text not null check (target ~ '^(c|b):[0-9]+$'),
  player uuid not null references players on delete cascade,
  emoji text not null check (emoji in ('👍','😂','🔥','💀','🤡','😭')),
  created_at timestamptz not null default now(),
  primary key (target, player, emoji)
);
alter table reactions enable row level security;
drop policy if exists reactions_read on reactions;
create policy reactions_read on reactions for select to authenticated using (is_player());
create or replace function react(p_target text, p_emoji text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not is_player() then raise exception 'Tienes que entrar primero'; end if;
  if exists (select 1 from reactions where target = p_target and player = auth.uid() and emoji = p_emoji) then
    delete from reactions where target = p_target and player = auth.uid() and emoji = p_emoji;
    perform bump(); return false;
  end if;
  insert into reactions(target, player, emoji) values (p_target, auth.uid(), p_emoji);
  perform bump(); return true;
end $$;

-- ---------- encuestas en el chat ----------
create table if not exists polls (
  id bigint generated always as identity primary key,
  player uuid not null references players on delete cascade,
  question text not null check (char_length(question) between 1 and 140),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 4),
  created_at timestamptz not null default now()
);
create table if not exists poll_votes (
  poll_id bigint not null references polls on delete cascade,
  player uuid not null references players on delete cascade,
  opt int not null,
  primary key (poll_id, player)
);
alter table polls enable row level security;
alter table poll_votes enable row level security;
drop policy if exists polls_read on polls;           create policy polls_read on polls for select to authenticated using (is_player());
drop policy if exists poll_votes_read on poll_votes; create policy poll_votes_read on poll_votes for select to authenticated using (is_player());

alter table chat add column if not exists poll_id bigint references polls on delete set null;
alter table chat add column if not exists bet_id bigint references bets on delete set null;

create or replace function create_poll(p_question text, p_options text[]) returns bigint
language plpgsql security definer set search_path = public as $$
declare pid bigint; o text; opts text[] := array(select btrim(x) from unnest(p_options) x where btrim(x) <> '');
begin
  if not is_player() then raise exception 'Tienes que entrar primero'; end if;
  if char_length(btrim(coalesce(p_question, ''))) not between 1 and 140 then raise exception 'Escribe la pregunta (140 letras como mucho)'; end if;
  if coalesce(array_length(opts, 1), 0) not between 2 and 4 then raise exception 'Pon entre 2 y 4 opciones'; end if;
  foreach o in array opts loop if char_length(o) > 40 then raise exception 'Cada opción, 40 letras como mucho'; end if; end loop;
  insert into polls(player, question, options) values (auth.uid(), btrim(p_question), to_jsonb(opts)) returning id into pid;
  insert into chat(player, body, poll_id) values (auth.uid(), '', pid);
  perform bump();
  return pid;
end $$;

create or replace function vote_poll(p_poll bigint, p_opt int) returns void
language plpgsql security definer set search_path = public as $$
declare n int := (select jsonb_array_length(options) from polls where id = p_poll);
begin
  if not is_player() then raise exception 'Tienes que entrar primero'; end if;
  if n is null then raise exception 'Esa encuesta no existe'; end if;
  if p_opt < 0 or p_opt >= n then raise exception 'Esa opción no existe'; end if;
  insert into poll_votes(poll_id, player, opt) values (p_poll, auth.uid(), p_opt)
  on conflict (poll_id, player) do update set opt = excluded.opt;
  perform bump();
end $$;

-- compartir una apuesta propia en el chat (o encuesta: solo por create_poll)
drop policy if exists chat_write on chat;
create policy chat_write on chat for insert to authenticated
  with check (player = auth.uid() and is_player() and poll_id is null
    and (char_length(body) > 0 or image_url is not null or audio_url is not null or bet_id is not null)
    and (audio_url is null or audio_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/fotos/')
    and (bet_id is null or exists (select 1 from bets b where b.id = bet_id and b.player = auth.uid())));

-- ---------- lo nuevo que lee la app ----------
create or replace function get_extras() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); wk date := madrid_week();
begin
  if not is_player() then raise exception 'Tienes que entrar primero'; end if;
  perform settle_challenges();
  return jsonb_build_object(
    'daily_on', (select (value #>> '{}')::boolean from settings where key = 'daily_on'),
    'daily_bonus', (select (value #>> '{}')::numeric from settings where key = 'daily_bonus'),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'match', match_id) order by day desc), '[]') from (select * from daily order by day desc limit 14) d),
    'challenges', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'match', match_id, 'from', from_player, 'to', to_player, 'from_pick', from_pick,
                     'to_pick', to_pick, 'stake', stake, 'status', status, 'created', created_at, 'settled', settled_at) order by created_at desc), '[]')
                   from (select * from challenges order by created_at desc limit 80) c),
    'claim', jsonb_build_object(
      'amount', (select (value #>> '{}')::int from settings where key = 'daily_claim'),
      'today', exists (select 1 from ledger where player = me and kind = 'diario' and week = madrid_day()),
      'rescue', (select (value #>> '{}')::int from settings where key = 'rescue_amount'),
      'rescue_used', exists (select 1 from ledger where player = me and kind = 'rescate' and week = wk)),
    'regalos', (select coalesce(jsonb_object_agg(player, s), '{}') from (select player, sum(amount)::int s from ledger where kind in ('diario', 'rescate') group by player) r),
    'bote', jsonb_build_object(
      'week', wk, 'desde', (select value #>> '{}' from settings where key = 'bote_desde'),
      'amount', (select (value #>> '{}')::int from settings where key = 'bote_amount'),
      'pot', -(select coalesce(sum(amount), 0) from ledger where kind = 'bote' and week = wk),
      'players', (select coalesce(jsonb_object_agg(player, bote_neto(player, wk)), '{}') from ledger where kind = 'bote' and week = wk),
      'last', (select coalesce(jsonb_agg(jsonb_build_object('player', player, 'amount', amount)), '[]') from ledger where kind = 'bote_gana' and week = wk - 7)),
    'reactions', (select coalesce(jsonb_agg(jsonb_build_object('t', target, 'p', player, 'e', emoji)), '[]')
                  from (select * from reactions where created_at > now() - interval '45 days' order by created_at limit 3000) r),
    'polls', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'q', p.question, 'o', p.options,
                'v', (select coalesce(jsonb_object_agg(v.player, v.opt), '{}') from poll_votes v where v.poll_id = p.id)) order by p.id desc), '[]')
              from (select * from polls order by id desc limit 60) p)
  );
end $$;

revoke all on function claim_daily(), claim_rescue(), bote_semanal(), react(text, text), create_poll(text, text[]), vote_poll(bigint, int), get_extras(), madrid_day(), bote_neto(uuid, date) from public, anon;
grant execute on function claim_daily(), claim_rescue(), react(text, text), create_poll(text, text[]), vote_poll(bigint, int), get_extras() to authenticated;
