-- Cuarta parte (30-10 noche): retos 1 contra 1 y la apuesta del dia.
-- Lo nuevo solo actua cuando alguien lo usa desde la version nueva; la paga extra de la apuesta del dia
-- esta APAGADA (settings daily_on = false) hasta que PM la encienda.

insert into settings(key, value) values ('daily_on', 'false'), ('daily_bonus', '1.25') on conflict (key) do nothing;

-- ---------- retos ----------
create table if not exists challenges (
  id bigint generated always as identity primary key,
  match_id text not null references matches on delete cascade,
  from_player uuid not null references players on delete cascade,
  to_player uuid not null references players on delete cascade,
  from_pick text not null check (from_pick in ('1','X','2')),
  to_pick text check (to_pick in ('1','X','2')),
  stake int not null check (stake > 0),
  status text not null default 'pending' check (status in ('pending','accepted','declined','expired','canceled','won_from','won_to','void')),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index if not exists challenges_match on challenges(match_id);
alter table challenges enable row level security;
drop policy if exists challenges_read on challenges;
create policy challenges_read on challenges for select to authenticated using (is_player());

create or replace function pname(p uuid) returns text language sql stable as $$ select name from players where id = p $$;

create or replace function challenge_create(p_match text, p_to uuid, p_pick text, p_stake int) returns bigint
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); m matches; bal int; cid bigint;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  if p_to = me or not exists (select 1 from players where id = p_to) then raise exception 'Elige a un colega'; end if;
  select * into m from matches where id = p_match;
  if not found or m.status <> 'scheduled' or m.starts_at <= now() then raise exception 'Ese partido ya ha empezado'; end if;
  if p_pick not in ('1','X','2') or (p_pick = 'X' and m.odds_x is null) then raise exception 'Elige 1, X o 2'; end if;
  if p_stake is null or p_stake < 1 then raise exception 'El reto mínimo es 1'; end if;
  perform pay_week();
  perform pg_advisory_xact_lock(hashtext(me::text));
  select coalesce(sum(amount), 0) into bal from ledger where player = me;
  if p_stake > bal then raise exception 'No tienes saldo suficiente: te quedan %', fmt_int(bal); end if;
  insert into challenges(match_id, from_player, to_player, from_pick, stake) values (p_match, me, p_to, p_pick, p_stake) returning id into cid;
  insert into ledger(player, amount, kind, note) values (me, -p_stake, 'apuesta', 'Reto a ' || pname(p_to) || ': ' || pick_name(m, p_pick));
  insert into chat(body) values (pname(me) || ' reta a ' || pname(p_to) || ': ' || m.home || ' vs ' || m.away || ', ' || fmt_int(p_stake) || ' a ' || pick_name(m, p_pick));
  perform bump();
  return cid;
end $$;

create or replace function challenge_answer(p_id bigint, p_accept boolean, p_pick text default null) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c challenges; m matches; bal int;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  select * into c from challenges where id = p_id for update;
  if not found or c.to_player <> me then raise exception 'Ese reto no es para ti'; end if;
  if c.status <> 'pending' then raise exception 'Ese reto ya está cerrado'; end if;
  select * into m from matches where id = c.match_id;
  if not p_accept then
    update challenges set status = 'declined', settled_at = now() where id = c.id;
    insert into ledger(player, amount, kind, note) values (c.from_player, c.stake, 'devolucion', 'Reto rechazado por ' || pname(me));
    insert into chat(body) values (pname(me) || ' no acepta el reto de ' || pname(c.from_player) || ' (' || m.home || ' vs ' || m.away || ')');
    perform bump(); return;
  end if;
  if m.status <> 'scheduled' or m.starts_at <= now() then raise exception 'Ese partido ya ha empezado'; end if;
  if p_pick is null or p_pick = c.from_pick or p_pick not in ('1','X','2') or (p_pick = 'X' and m.odds_x is null) then raise exception 'Elige un resultado distinto al suyo'; end if;
  perform pay_week();
  perform pg_advisory_xact_lock(hashtext(me::text));
  select coalesce(sum(amount), 0) into bal from ledger where player = me;
  if c.stake > bal then raise exception 'No tienes saldo suficiente: te quedan %', fmt_int(bal); end if;
  update challenges set status = 'accepted', to_pick = p_pick where id = c.id;
  insert into ledger(player, amount, kind, note) values (me, -c.stake, 'apuesta', 'Reto de ' || pname(c.from_player) || ': ' || pick_name(m, p_pick));
  insert into chat(body) values (pname(me) || ' acepta el reto de ' || pname(c.from_player) || ': ' || pick_name(m, c.from_pick) || ' contra ' || pick_name(m, p_pick) || ', ' || fmt_int(c.stake * 2) || ' en juego');
  perform bump();
end $$;

create or replace function challenge_cancel(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c challenges;
begin
  select * into c from challenges where id = p_id for update;
  if not found or c.from_player <> me then raise exception 'Ese reto no es tuyo'; end if;
  if c.status <> 'pending' then raise exception 'Ya lo ha contestado'; end if;
  update challenges set status = 'canceled', settled_at = now() where id = c.id;
  insert into ledger(player, amount, kind, note) values (me, c.stake, 'devolucion', 'Reto retirado');
  perform bump();
end $$;

-- cierra los retos: los no contestados al empezar se devuelven; los aceptados se pagan al acabar
create or replace function settle_challenges() returns int
language plpgsql security definer set search_path = public as $$
declare c record; n int := 0; res text;
begin
  for c in select ch.*, m.status as mst, m.winner, m.starts_at, m.home, m.away, m.score from challenges ch join matches m on m.id = ch.match_id
           where ch.status = 'pending' and (m.starts_at <= now() or m.status <> 'scheduled') for update of ch loop
    update challenges set status = 'expired', settled_at = now() where id = c.id;
    insert into ledger(player, amount, kind, note) values (c.from_player, c.stake, 'devolucion', 'Reto sin contestar');
    n := n + 1;
  end loop;
  for c in select ch.*, m.status as mst, m.winner, m.home, m.away, m.score from challenges ch join matches m on m.id = ch.match_id
           where ch.status = 'accepted' and m.status in ('final','canceled') for update of ch loop
    res := c.home || ' ' || coalesce(c.score, '') || ' ' || c.away;
    if c.mst = 'canceled' or c.winner is null or (c.winner <> c.from_pick and c.winner <> c.to_pick) then
      update challenges set status = 'void', settled_at = now() where id = c.id;
      insert into ledger(player, amount, kind, note) values (c.from_player, c.stake, 'devolucion', 'Reto sin ganador'), (c.to_player, c.stake, 'devolucion', 'Reto sin ganador');
      insert into chat(body) values ('Reto sin ganador entre ' || pname(c.from_player) || ' y ' || pname(c.to_player) || ' · ' || res || ' · se devuelve todo');
    else
      update challenges set status = case when c.winner = c.from_pick then 'won_from' else 'won_to' end, settled_at = now() where id = c.id;
      insert into ledger(player, amount, kind, note)
        values (case when c.winner = c.from_pick then c.from_player else c.to_player end, c.stake * 2, 'premio',
                'Reto ganado a ' || pname(case when c.winner = c.from_pick then c.to_player else c.from_player end));
      insert into chat(body) values (pname(case when c.winner = c.from_pick then c.from_player else c.to_player end) || ' ganó ' || fmt_int(c.stake * 2) ||
        ' en el reto contra ' || pname(case when c.winner = c.from_pick then c.to_player else c.from_player end) || ' · ' || res);
    end if;
    n := n + 1;
  end loop;
  if n > 0 then perform bump(); end if;
  return n;
end $$;

-- ---------- la apuesta del dia ----------
create table if not exists daily (day date primary key, match_id text not null references matches on delete cascade);
alter table daily enable row level security;
drop policy if exists daily_read on daily;
create policy daily_read on daily for select to authenticated using (is_player());

-- un partido por dia (hora de Madrid): de las grandes ligas, el mas igualado de hoy; si no hay, el mas igualado de las proximas 24 h
create or replace function pick_daily() returns text
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Europe/Madrid')::date; mid text;
begin
  select match_id into mid from daily where day = d;
  if mid is not null then return mid; end if;
  select id into mid from matches
   where status = 'scheduled' and starts_at > now() + interval '30 minutes' and odds_1 is not null and odds_2 is not null
     and (starts_at at time zone 'Europe/Madrid')::date = d
     and league in ('esp.1','eng.1','ger.1','ita.1','fra.1','uefa.champions','uefa.europa','esp.copa_del_rey')
   order by abs(odds_1 - odds_2), starts_at limit 1;
  if mid is null then
    select id into mid from matches
     where status = 'scheduled' and starts_at between now() + interval '30 minutes' and now() + interval '24 hours'
       and odds_1 is not null and odds_2 is not null
     order by (sport = 'f') desc, abs(odds_1 - odds_2), starts_at limit 1;
  end if;
  if mid is not null then insert into daily(day, match_id) values (d, mid) on conflict do nothing; end if;
  return mid;
end $$;

-- pagar: igual que antes, con el extra de la apuesta del dia cuando esta encendido
create or replace function settle_match(p_match text) returns int
language plpgsql security definer set search_path = public as $$
declare m matches; b record; n int := 0; res text; extra numeric := 1; pay int;
begin
  select * into m from matches where id = p_match for update;
  if not found or m.settled or m.status not in ('final','canceled') then return 0; end if;
  if (select (value #>> '{}')::boolean from settings where key = 'daily_on') and exists (select 1 from daily where match_id = p_match) then
    extra := (select (value #>> '{}')::numeric from settings where key = 'daily_bonus');
  end if;
  res := m.home || ' ' || coalesce(m.score, '') || ' ' || m.away;
  for b in select bets.*, p.name from bets join players p on p.id = bets.player
           where match_id = p_match and status = 'open' for update of bets loop
    if m.status = 'canceled' or m.winner is null then
      update bets set status = 'void', payout = b.stake, settled_at = now() where id = b.id;
      insert into ledger(player, amount, kind, note, bet_id) values (b.player, b.stake, 'devolucion', 'Anulado: ' || m.home || ' vs ' || m.away, b.id);
      insert into chat(body) values (b.name || ' recupera ' || fmt_int(b.stake) || ': ' || m.home || ' vs ' || m.away || ' no se ha jugado');
    elsif b.pick = m.winner then
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

-- el cierre del sincronizador: ahora tambien retos y apuesta del dia
create or replace function sync_close(p_secret text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare mid text; rv int := 0; st int := 0; paid int; rt int;
begin
  if p_secret is null or p_secret <> (select value #>> '{}' from settings where key = 'sync_secret') then
    raise exception 'Clave de sincronización no válida';
  end if;
  paid := pay_week();
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
  return jsonb_build_object('revelados', rv, 'pagadas', st, 'pagas', paid, 'retos', rt);
end $$;

-- lo nuevo que lee la version nueva de la app
create or replace function get_extras() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not is_player() then raise exception 'Tienes que entrar primero'; end if;
  perform settle_challenges();
  return jsonb_build_object(
    'daily_on', (select (value #>> '{}')::boolean from settings where key = 'daily_on'),
    'daily_bonus', (select (value #>> '{}')::numeric from settings where key = 'daily_bonus'),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'match', match_id) order by day desc), '[]') from (select * from daily order by day desc limit 14) d),
    'challenges', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'match', match_id, 'from', from_player, 'to', to_player, 'from_pick', from_pick,
                     'to_pick', to_pick, 'stake', stake, 'status', status, 'created', created_at, 'settled', settled_at) order by created_at desc), '[]')
                   from (select * from challenges order by created_at desc limit 80) c)
  );
end $$;

-- ajustes de PM: tambien encender la apuesta del dia
create or replace function admin_set(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from players where id = auth.uid() and is_admin) then raise exception 'Solo PM puede cambiar las reglas'; end if;
  if p_key not in ('vis','weekly_amount','daily_on') then raise exception 'Ese ajuste no existe'; end if;
  if p_key = 'vis' and p_value #>> '{}' not in ('open','kick') then raise exception 'Valor no válido'; end if;
  if p_key = 'daily_on' and jsonb_typeof(p_value) <> 'boolean' then raise exception 'Valor no válido'; end if;
  update settings set value = p_value where key = p_key;
  perform bump();
end $$;

revoke all on function challenge_create(text, uuid, text, int), challenge_answer(bigint, boolean, text), challenge_cancel(bigint),
  settle_challenges(), pick_daily(), get_extras(), pname(uuid) from public, anon;
grant execute on function challenge_create(text, uuid, text, int), challenge_answer(bigint, boolean, text), challenge_cancel(bigint), get_extras() to authenticated;
