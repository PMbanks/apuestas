-- Segunda parte: solo los jugadores ven algo, el sincronizador entra con su clave propia
-- (no con la llave del proyecto) y las cuentas las crea PM desde el editor SQL.

-- ---------- solo jugadores ----------
create or replace function is_player() returns boolean
language sql stable security definer set search_path = public as $$ select exists (select 1 from players where id = auth.uid()) $$;
grant execute on function is_player() to authenticated;

drop policy if exists players_read on players;   create policy players_read  on players  for select to authenticated using (is_player());
drop policy if exists settings_read on settings; create policy settings_read on settings for select to authenticated using (is_player() and key <> 'sync_secret');
drop policy if exists matches_read on matches;   create policy matches_read  on matches  for select to authenticated using (is_player());
drop policy if exists pulse_read on pulse;       create policy pulse_read    on pulse    for select to authenticated using (is_player());
drop policy if exists chat_read on chat;         create policy chat_read     on chat     for select to authenticated using (is_player());
drop policy if exists chat_write on chat;
create policy chat_write on chat for insert to authenticated
  with check (player = auth.uid() and is_player() and (char_length(body) > 0 or image_url is not null));
drop policy if exists fotos_write on storage.objects;
create policy fotos_write on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text and public.is_player());

-- ---------- sincronizador ----------
-- Guarda un lote de partidos. Las cuotas solo cambian antes de empezar; un partido ya pagado no se toca.
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
                        starts_at, status, score, winner, bo, details, odds_1, odds_x, odds_2, odds_src, updated_at)
    values (r->>'id', r->>'sport', r->>'league', r->>'league_name', r->>'league_logo', r->>'stage', r->>'tag', r->>'venue',
            r->>'home', r->>'away', r->>'home_logo', r->>'away_logo', (r->>'starts_at')::timestamptz, r->>'status', r->>'score',
            r->>'winner', (r->>'bo')::int, coalesce(r->'details', '{}'), (r->>'odds_1')::numeric, (r->>'odds_x')::numeric,
            (r->>'odds_2')::numeric, r->>'odds_src', now())
    on conflict (id) do update set
      sport = excluded.sport, league = excluded.league, league_name = excluded.league_name, league_logo = excluded.league_logo,
      stage = excluded.stage, tag = excluded.tag, venue = excluded.venue, home = excluded.home, away = excluded.away,
      home_logo = excluded.home_logo, away_logo = excluded.away_logo, starts_at = excluded.starts_at, status = excluded.status,
      score = excluded.score, winner = excluded.winner, bo = excluded.bo, details = excluded.details,
      odds_1 = case when excluded.status = 'scheduled' and excluded.odds_1 is not null then excluded.odds_1 else matches.odds_1 end,
      odds_x = case when excluded.status = 'scheduled' and excluded.odds_1 is not null then excluded.odds_x else matches.odds_x end,
      odds_2 = case when excluded.status = 'scheduled' and excluded.odds_2 is not null then excluded.odds_2 else matches.odds_2 end,
      odds_src = case when excluded.status = 'scheduled' and excluded.odds_src is not null then excluded.odds_src else matches.odds_src end,
      updated_at = now();
    n := n + 1;
  end loop;
  return n;
end $$;

-- Despues de guardar: paga del lunes, revelar apuestas al empezar y pagar lo acabado (por tandas).
create or replace function sync_close(p_secret text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare mid text; rv int := 0; st int := 0; paid int;
begin
  if p_secret is null or p_secret <> (select value #>> '{}' from settings where key = 'sync_secret') then
    raise exception 'Clave de sincronización no válida';
  end if;
  paid := pay_week();
  for mid in select m.id from matches m where not m.revealed and m.status in ('live','final')
             and exists (select 1 from bets b where b.match_id = m.id) loop
    perform reveal_match(mid); rv := rv + 1;
  end loop;
  -- sin apuestas no hay nada que pagar: se marcan de golpe
  update matches m set settled = true where not m.settled and m.status in ('final','canceled')
    and not exists (select 1 from bets b where b.match_id = m.id and b.status = 'open');
  for mid in select id from matches where not settled and status in ('final','canceled') limit 60 loop
    st := st + settle_match(mid);
  end loop;
  return jsonb_build_object('revelados', rv, 'pagadas', st, 'pagas', paid);
end $$;
revoke all on function sync_push(text, jsonb), sync_close(text) from public;
grant execute on function sync_push(text, jsonb), sync_close(text) to anon, authenticated;

-- ---------- cuentas (solo desde el editor SQL del panel, como postgres) ----------
create or replace function admin_create_player(p_user text, p_name text, p_ini text, p_color text, p_pass text, p_admin boolean default false)
returns uuid language plpgsql security definer set search_path = public, auth, extensions as $$
declare uid uuid; em text := lower(p_user) || '@apuestas.app';
begin
  select id into uid from auth.users where email = em;
  if uid is null then
    uid := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data,
      raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', em,
      extensions.crypt(p_pass, extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(),
      '', '', '', '', '', '', '', '');
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), uid::text, uid, jsonb_build_object('sub', uid::text, 'email', em, 'email_verified', true), 'email', now(), now(), now());
  else
    update auth.users set encrypted_password = extensions.crypt(p_pass, extensions.gen_salt('bf')), updated_at = now() where id = uid;
  end if;
  insert into players(id, username, name, ini, color, is_admin) values (uid, lower(p_user), p_name, upper(p_ini), p_color, p_admin)
  on conflict (id) do update set name = excluded.name, ini = excluded.ini, color = excluded.color, is_admin = excluded.is_admin;
  perform pay_week();
  return uid;
end $$;
revoke all on function admin_create_player(text, text, text, text, text, boolean) from public, anon, authenticated;
