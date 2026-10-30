-- Decimonovena parte (30-10). PM: "rewards por tiempo: si llevas en la app 1 h te dan X, si llevas X tiempo...".
-- La app manda un latido por minuto mientras esta a la vista; el servidor suma como mucho 1 minuto por latido
-- (y nunca dos latidos en menos de 50 s), hasta 10 h al dia. Los tramos se reclaman en Recompensas.
create table if not exists app_time (
  player uuid not null references players on delete cascade,
  day date not null,
  minutes int not null default 0,
  last_ping timestamptz,
  primary key (player, day)
);
alter table app_time enable row level security;
drop policy if exists app_time_read on app_time;
create policy app_time_read on app_time for select to authenticated using (is_player());

insert into settings(key, value) values ('time_rewards', '[{"min":30,"amt":25},{"min":60,"amt":50},{"min":120,"amt":100}]')
on conflict (key) do nothing;
create unique index if not exists ledger_one_tiempo on ledger(player, week, note) where kind = 'tiempo';

create or replace function heartbeat() returns int
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); d date := madrid_day(); r app_time;
begin
  if me is null or not is_player() then return 0; end if;
  insert into app_time(player, day, minutes, last_ping) values (me, d, 0, null) on conflict (player, day) do nothing;
  select * into r from app_time where player = me and day = d for update;
  if r.last_ping is null or now() - r.last_ping >= interval '50 seconds' then
    update app_time set minutes = least(600, minutes + case when r.last_ping is null or now() - r.last_ping > interval '3 minutes' then 0 else 1 end),
                        last_ping = now() where player = me and day = d returning minutes into r.minutes;
  end if;
  return r.minutes;
end $$;

create or replace function time_status() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); d date := madrid_day(); mins int;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  mins := coalesce((select minutes from app_time where player = me and day = d), 0);
  return jsonb_build_object('minutes', mins, 'tiers', (select coalesce(jsonb_agg(jsonb_build_object('min', (t->>'min')::int, 'amt', (t->>'amt')::int,
      'claimed', exists (select 1 from ledger where player = me and kind = 'tiempo' and week = d and note = 'Tiempo en la app: ' || (t->>'min') || ' min'))), '[]')
    from jsonb_array_elements((select value from settings where key = 'time_rewards')) t));
end $$;

create or replace function claim_time_reward(p_min int) returns int
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); d date := madrid_day(); amt int; mins int;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  select (t->>'amt')::int into amt from jsonb_array_elements((select value from settings where key = 'time_rewards')) t where (t->>'min')::int = p_min;
  if amt is null then raise exception 'Ese premio no existe'; end if;
  mins := coalesce((select minutes from app_time where player = me and day = d), 0);
  if mins < p_min then raise exception 'Te faltan % minutos', p_min - mins; end if;
  insert into ledger(player, amount, kind, note, week) values (me, amt, 'tiempo', 'Tiempo en la app: ' || p_min || ' min', d)
  on conflict (player, week, note) where kind = 'tiempo' do nothing;
  if not found then raise exception 'Ya lo has reclamado hoy'; end if;
  perform bump();
  return amt;
end $$;

revoke all on function heartbeat(), time_status(), claim_time_reward(int) from public, anon;
grant execute on function heartbeat(), time_status(), claim_time_reward(int) to authenticated;
