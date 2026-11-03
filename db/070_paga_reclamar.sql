-- 070 (03-11). LA PAGA DEL LUNES SE RECLAMA A MANO. PM: "el dinero que te dan weekly tengas que reclamarlo manualmente en Rewards,
-- no que te lo den regalado".
-- Antes: pay_week() (la llaman get_state, apostar, abrir cajas...) metia la paga de la semana a TODOS a la vez (ledger kind 'paga',
-- un apunte por jugador y semana: indice ledger_one_pay_per_week). Desde aqui:
--   pay_week()      ya no paga. Una vez por semana deja en el chat el resumen de la semana pasada y "Paga del lunes: +N para cada uno.
--                   Reclámala en Recompensas", y avisa al movil de cada uno (avisos de 060, tipo 'paga'). Devuelve 0.
--   claim_week()    la paga de ESTA semana para el que la pide: de lunes 00:00 a domingo 23:59 (hora de Madrid). Una por semana y jugador
--                   (el mismo indice unico de siempre: no se puede cobrar dos veces). La que no se reclama esa semana se pierde: no se acumula.
--   paga_estado()   lo que pinta Recompensas: cuanto es, de que semana, si ya la tienes y hasta cuando se puede reclamar.
-- Cambio sin pagar dos veces: esta semana (lunes 02-11) la paga ya entro sola a todos, asi que ya cuenta como reclamada (el apunte 'paga'
-- de esta semana existe) y claim_week dice "Ya has reclamado la paga de esta semana" hasta el lunes que viene.
-- El aviso al movil de "Ya tienes la paga" (trigger aviso_dinero de 060) ya no salta con la paga: la has pedido tu.
-- Se puede ejecutar varias veces.

create or replace function pay_week() returns int
language plpgsql security definer set search_path = public as $$
declare
  amt int := (select (value #>> '{}')::int from settings where key = 'weekly_amount');
  wk date := madrid_week();
  ini timestamptz := ((wk - 7)::timestamp at time zone 'Europe/Madrid');
  fin timestamptz := (wk::timestamp at time zone 'Europe/Madrid');
  res text;
  p record;
begin
  if wk < (select (value #>> '{}')::date from settings where key = 'season_start') then return 0; end if;
  if exists (select 1 from chat where player is null and body like 'Paga del lunes%' and created_at >= fin) then return 0; end if;
  perform pg_advisory_xact_lock(hashtext('pay_week'));      -- dos llamadas a la vez no escriben el aviso dos veces
  if exists (select 1 from chat where player is null and body like 'Paga del lunes%' and created_at >= fin) then return 0; end if;
  -- lo ganado o perdido la semana pasada por cada uno, sin contar la paga
  select string_agg(pl.name || ' ' || case when t.neto >= 0 then '▲' else '▼' end || fmt_int(abs(t.neto)), ' · ' order by t.neto desc)
    into res
    from players pl
    join (select player, sum(amount)::int as neto from ledger
          where kind in ('apuesta','premio','devolucion') and created_at >= ini and created_at < fin group by player) t on t.player = pl.id;
  if res is not null then
    insert into chat(body) values ('Resumen de la semana: ' || res);
  end if;
  insert into chat(body) values ('Paga del lunes: +' || fmt_int(amt) || ' para cada uno. Reclámala en Recompensas');
  if to_regproc('aviso_nuevo') is not null then
    for p in select id from players loop
      perform aviso_nuevo(p.id, 'paga', 'Ya puedes reclamar la paga del lunes', '+' || fmt_int(amt) || ' en Recompensas. Si no la reclamas esta semana, se pierde',
        'Your Monday pay is ready', '+' || fmt_en(amt) || ' in Rewards. If you do not claim it this week, it is gone', 'inicio');
    end loop;
  end if;
  perform bump();
  return 0;
end $$;

create or replace function claim_week() returns int
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  amt int := (select (value #>> '{}')::int from settings where key = 'weekly_amount');
  wk date := madrid_week();
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  if wk < (select (value #>> '{}')::date from settings where key = 'season_start') then raise exception 'La temporada aún no ha empezado'; end if;
  perform pay_week();
  insert into ledger(player, amount, kind, note, week) values (me, amt, 'paga', 'Paga del lunes', wk)
  on conflict (player, week) where kind = 'paga' do nothing;
  if not found then raise exception 'Ya has reclamado la paga de esta semana. La siguiente, el lunes'; end if;
  perform bump();
  return amt;
end $$;

create or replace function paga_estado() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); wk date := madrid_week();
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  return jsonb_build_object(
    'amount', (select (value #>> '{}')::int from settings where key = 'weekly_amount'),
    'week', wk,
    'claimed', exists (select 1 from ledger where player = me and kind = 'paga' and week = wk),
    'hasta', ((wk + 7)::timestamp at time zone 'Europe/Madrid'),
    'abierta', wk >= (select (value #>> '{}')::date from settings where key = 'season_start'));
end $$;

revoke all on function pay_week() from public, anon;
revoke all on function claim_week(), paga_estado() from public, anon;
grant execute on function claim_week(), paga_estado() to authenticated;

-- el aviso "Ya tienes la paga del lunes" ya no hace falta: la paga la pides tu (el bote, la ruleta global y los premios siguen avisando)
do $$
begin
  if to_regproc('trg_aviso_dinero') is not null then
    drop trigger if exists aviso_dinero on ledger;
    create trigger aviso_dinero after insert on ledger
      for each row when (new.kind in ('bote_gana', 'ruleta_global', 'premio_semana'))
      execute function trg_aviso_dinero();
  end if;
end $$;

select bump();
