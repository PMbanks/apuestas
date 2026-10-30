-- 030 (31-10). Discord tambien avisa de las apuestas canceladas durante el partido (cash out, 024) y de las combinadas (029),
-- y el resumen de la semana las cuenta. Redefine sync_discord_get de 021; las listas nuevas (retiradas, combinadas) las pinta
-- sync/discord.mjs desde el 31-10. Se puede ejecutar varias veces. Va despues de 029.
create or replace function sync_discord_get(p_secret text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  partidos jsonb; apuestas jsonb; skins jsonb; resumen jsonb := null; retiradas jsonb; combinadas jsonb;
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

  -- 030: apuestas grandes canceladas durante el partido (cash out) en las ultimas 3 horas. Van aparte de 'apuestas' para que un
  -- sincronizador con el discord.mjs de antes (que no las conoce) no las cuente como perdidas
  select coalesce(jsonb_agg(jsonb_build_object('clave', 'retirada:' || b.id, 'jugador', p.name, 'stake', b.stake, 'payout', b.payout,
           'odds', b.odds, 'pick', pick_name(m, b.pick), 'home', m.home, 'away', m.away, 'liga', m.league_name,
           'logo', case b.pick when '2' then m.away_logo else m.home_logo end) order by b.settled_at), '[]') into retiradas
    from bets b join players p on p.id = b.player join matches m on m.id = b.match_id
   where b.status = 'cashout' and b.stake >= min_ap and b.settled_at > now() - interval '3 hours'
     and not exists (select 1 from discord_avisos d where d.clave = 'retirada:' || b.id);

  -- 030: combinadas resueltas en las ultimas 3 horas (ganadas de cualquier importe, perdidas desde el minimo)
  select coalesce(jsonb_agg(jsonb_build_object('clave', 'combo:' || c.id, 'jugador', p.name, 'estado', c.status, 'stake', c.stake, 'payout', c.payout,
           'odds', c.odds, 'patas', (select jsonb_agg(jsonb_build_object('pick', pick_name(m, l.pick), 'home', m.home, 'away', m.away, 'res', l.result) order by m.starts_at)
                                      from combo_legs l join matches m on m.id = l.match_id where l.combo_id = c.id)) order by c.settled_at), '[]') into combinadas
    from combos c join players p on p.id = c.player
   where c.status in ('won', 'lost') and (c.status = 'won' or c.stake >= min_ap) and c.settled_at > now() - interval '3 hours'
     and not exists (select 1 from discord_avisos d where d.clave = 'combo:' || c.id);

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
              ((select count(*) from bets b where b.player = p.id and b.status = 'won' and b.settled_at >= ini and b.settled_at < fin)
                + (select count(*) from combos c where c.player = p.id and c.status = 'won' and c.settled_at >= ini and c.settled_at < fin))::int as aciertos,
              ((select count(*) from bets b where b.player = p.id and b.status in ('won', 'lost', 'cashout') and b.settled_at >= ini and b.settled_at < fin)
                + (select count(*) from combos c where c.player = p.id and c.status in ('won', 'lost') and c.settled_at >= ini and c.settled_at < fin))::int as apuestas
              from players p) t;
  end if;

  return jsonb_build_object('partidos', partidos, 'apuestas', apuestas, 'skins', skins, 'resumen', resumen, 'retiradas', retiradas, 'combinadas', combinadas);
end $$;
