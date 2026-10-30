-- Tercera parte (30-10 noche): cancelar una apuesta antes de que empiece el partido, y el resumen de la semana en el chat.

-- ---------- cancelar ----------
-- Solo la apuesta propia, abierta, y con el partido sin empezar. Devuelve lo apostado entero.
create or replace function cancel_bet(p_bet bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); b bets; m matches;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  select * into b from bets where id = p_bet for update;
  if not found or b.player <> me then raise exception 'Esa apuesta no es tuya'; end if;
  if b.status <> 'open' then raise exception 'Esa apuesta ya está cerrada'; end if;
  select * into m from matches where id = b.match_id;
  if m.status <> 'scheduled' or m.starts_at <= now() then raise exception 'El partido ya ha empezado: no se puede cancelar'; end if;
  update bets set status = 'void', payout = b.stake, settled_at = now() where id = b.id;
  insert into ledger(player, amount, kind, note, bet_id)
    values (me, b.stake, 'devolucion', 'Cancelada: ' || pick_name(m, b.pick) || ' ' || fmt_odds(b.odds), b.id);
  perform bump();
  return jsonb_build_object('devuelto', b.stake, 'saldo', (select coalesce(sum(amount), 0) from ledger where player = me));
end $$;
revoke all on function cancel_bet(bigint) from public, anon;
grant execute on function cancel_bet(bigint) to authenticated;

-- ---------- la paga del lunes, con el resumen de la semana que acaba ----------
create or replace function pay_week() returns int
language plpgsql security definer set search_path = public as $$
declare
  amt int := (select (value #>> '{}')::int from settings where key = 'weekly_amount');
  wk date := madrid_week();
  ini timestamptz := ((wk - 7)::timestamp at time zone 'Europe/Madrid');
  fin timestamptz := (wk::timestamp at time zone 'Europe/Madrid');
  n int;
  res text;
begin
  if wk < (select (value #>> '{}')::date from settings where key = 'season_start') then return 0; end if;
  insert into ledger(player, amount, kind, note, week)
    select id, amt, 'paga', 'Paga del lunes', wk from players
  on conflict (player, week) where kind = 'paga' do nothing;
  get diagnostics n = row_count;
  if n > 0 then
    if not exists (select 1 from chat where player is null and body like 'Paga del lunes%' and created_at >= fin) then
      -- lo ganado o perdido la semana pasada por cada uno, sin contar la paga
      select string_agg(p.name || ' ' || case when t.neto >= 0 then '▲' else '▼' end || fmt_int(abs(t.neto)), ' · ' order by t.neto desc)
        into res
        from players p
        join (select player, sum(amount)::int as neto from ledger
              where kind in ('apuesta','premio','devolucion') and created_at >= ini and created_at < fin group by player) t on t.player = p.id;
      if res is not null then
        insert into chat(body) values ('Resumen de la semana: ' || res);
      end if;
      insert into chat(body) values ('Paga del lunes: +' || fmt_int(amt) || ' para cada uno');
    end if;
    perform bump();
  end if;
  return n;
end $$;
