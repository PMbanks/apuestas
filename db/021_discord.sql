-- Vigesimoprimera parte (30-10): avisos en Discord.
-- El sincronizador (sync/sync.mjs, GitHub Actions) pregunta aqui que hay de nuevo que merezca un aviso y, cuando Discord
-- lo ha recibido, lo anota para no repetirlo. Sin el secreto DISCORD_WEBHOOK no llama a nada de esto.
--   1. sync_discord_get(secreto): los avisos pendientes (no cambia nada).
--   2. sync_discord_hecho(secreto, claves): anota los que ya se han mandado.
-- Cuatro tipos de aviso:
--   partidos con apuestas que empiezan en los proximos 15 minutos,
--   apuestas grandes ya resueltas (stake de 300 o mas, ganadas o perdidas; settings.discord_min_apuesta lo cambia),
--   skins especiales (cuchillos y guantes, y lujo de 1.500 o mas; settings.discord_min_lujo lo cambia) sacadas en las ultimas 3 horas,
--   el resumen de la semana, el lunes.
-- Se puede ejecutar varias veces.

create table if not exists discord_avisos (
  clave text primary key,                 -- 'ini:<partido>', 'apuesta:<id>', 'skin:<id>', 'resumen:<lunes>'
  at timestamptz not null default now()
);
alter table discord_avisos enable row level security;       -- sin politicas: solo las funciones de abajo lo tocan
revoke all on discord_avisos from anon, authenticated;

create or replace function sync_discord_get(p_secret text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  partidos jsonb; apuestas jsonb; skins jsonb; resumen jsonb := null;
  min_ap int := coalesce((select (value #>> '{}')::int from settings where key = 'discord_min_apuesta'), 300);
  min_lu int := coalesce((select (value #>> '{}')::int from settings where key = 'discord_min_lujo'), 1500);
  wk date := madrid_week();
  ini timestamptz := ((wk - 7)::timestamp at time zone 'Europe/Madrid');
  fin timestamptz := (wk::timestamp at time zone 'Europe/Madrid');
begin
  if p_secret is null or p_secret <> (select value #>> '{}' from settings where key = 'sync_secret') then
    raise exception 'Clave de sincronización no válida';
  end if;

  -- partidos que empiezan en los proximos 15 minutos y tienen apuestas abiertas (quien ha apostado, no que ha elegido)
  select coalesce(jsonb_agg(q.x order by q.x->>'empieza'), '[]') into partidos from (
    select jsonb_build_object('clave', 'ini:' || m.id, 'id', m.id, 'sport', m.sport, 'liga', m.league_name, 'home', m.home, 'away', m.away,
             'logo', m.home_logo, 'empieza', m.starts_at, 'n', count(*), 'total', sum(b.stake),
             'jugadores', (select jsonb_agg(distinct p.name) from bets b2 join players p on p.id = b2.player where b2.match_id = m.id and b2.status = 'open')) as x
      from matches m join bets b on b.match_id = m.id and b.status = 'open'
     where m.status = 'scheduled' and m.starts_at > now() and m.starts_at <= now() + interval '15 minutes'
       and not exists (select 1 from discord_avisos d where d.clave = 'ini:' || m.id)
     group by m.id) q;

  -- apuestas grandes resueltas en las ultimas 3 horas
  select coalesce(jsonb_agg(jsonb_build_object('clave', 'apuesta:' || b.id, 'jugador', p.name, 'estado', b.status, 'stake', b.stake, 'payout', b.payout,
           'odds', b.odds, 'pick', pick_name(m, b.pick), 'home', m.home, 'away', m.away, 'liga', m.league_name,
           'logo', case b.pick when '2' then m.away_logo else m.home_logo end) order by b.settled_at), '[]') into apuestas
    from bets b join players p on p.id = b.player join matches m on m.id = b.match_id
   where b.status in ('won', 'lost') and b.stake >= min_ap and b.settled_at > now() - interval '3 hours'
     and not exists (select 1 from discord_avisos d where d.clave = 'apuesta:' || b.id);

  -- skins especiales de las ultimas 3 horas
  select coalesce(jsonb_agg(jsonb_build_object('clave', 'skin:' || i.id, 'jugador', p.name, 'nombre', it.name, 'fase', it.phase, 'rareza', it.rarity,
           'valor', i.value, 'imagen', it.image, 'caja', c.name, 'lujo', it.id like 'lujo%', 'stattrak', i.st, 'batalla', i.battle_id is not null) order by i.created_at), '[]') into skins
    from cs_inv i join cs_items it on it.id = i.item_id join players p on p.id = coalesce(i.opened_by, i.player) left join cs_cases c on c.id = i.case_id
   where i.created_at > now() - interval '3 hours'
     and ((it.id not like 'lujo%' and it.rarity = 'esp') or (it.id like 'lujo%' and i.value >= min_lu))
     and not exists (select 1 from discord_avisos d where d.clave = 'skin:' || i.id);

  -- resumen de la semana que acaba, desde que llega la paga del lunes y hasta 3 dias despues
  if exists (select 1 from ledger where kind = 'paga' and week = wk) and now() < fin + interval '3 days'
     and not exists (select 1 from discord_avisos d where d.clave = 'resumen:' || wk::text) then
    select jsonb_build_object('clave', 'resumen:' || wk::text, 'desde', wk - 7, 'hasta', wk - 1,
             'filas', coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'neto', t.neto, 'saldo', t.saldo, 'aciertos', t.aciertos, 'apuestas', t.apuestas) order by t.neto desc, t.name), '[]')) into resumen
      from (select p.name,
              coalesce((select sum(amount) from ledger l where l.player = p.id and l.kind in ('apuesta', 'premio', 'devolucion') and l.created_at >= ini and l.created_at < fin), 0)::int as neto,
              coalesce((select sum(amount) from ledger l where l.player = p.id), 0)::int as saldo,
              (select count(*) from bets b where b.player = p.id and b.status = 'won' and b.settled_at >= ini and b.settled_at < fin)::int as aciertos,
              (select count(*) from bets b where b.player = p.id and b.status in ('won', 'lost') and b.settled_at >= ini and b.settled_at < fin)::int as apuestas
              from players p) t;
  end if;

  return jsonb_build_object('partidos', partidos, 'apuestas', apuestas, 'skins', skins, 'resumen', resumen);
end $$;

create or replace function sync_discord_hecho(p_secret text, p_claves text[]) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_secret is null or p_secret <> (select value #>> '{}' from settings where key = 'sync_secret') then
    raise exception 'Clave de sincronización no válida';
  end if;
  insert into discord_avisos(clave) select distinct unnest(p_claves) on conflict (clave) do nothing;
  get diagnostics n = row_count;
  delete from discord_avisos where at < now() - interval '45 days';
  return n;
end $$;

revoke all on function sync_discord_get(text), sync_discord_hecho(text, text[]) from public;
grant execute on function sync_discord_get(text), sync_discord_hecho(text, text[]) to anon, authenticated;
