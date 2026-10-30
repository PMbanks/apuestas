-- Quinta parte (30-10): las caras oficiales de la UFC se buscan una vez por hora; entre medias el sincronizador manda
-- la foto de ESPN. Si ya hay una de ufc.com, se queda.
create or replace function keep_logo(old text, nueva text) returns text
language sql immutable as $$
  select case when old like 'https://ufc.com/%' and coalesce(nueva, '') not like 'https://ufc.com/%' then old else nueva end
$$;

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
      home_logo = keep_logo(matches.home_logo, excluded.home_logo), away_logo = keep_logo(matches.away_logo, excluded.away_logo),
      starts_at = excluded.starts_at, status = excluded.status,
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
revoke all on function sync_push(text, jsonb) from public;
grant execute on function sync_push(text, jsonb) to anon, authenticated;
