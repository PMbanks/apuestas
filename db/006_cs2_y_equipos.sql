-- Sexta parte (30-10): CS2 entra como deporte ('c') y una tabla con la ficha de cada equipo de Valorant y CS2
-- (ultimos 10 resultados, pais, siglas, jugadores). La escribe el sincronizador; la leen los jugadores.
alter table matches drop constraint if exists matches_sport_check;
alter table matches add constraint matches_sport_check check (sport in ('f','v','u','c'));

create table if not exists teams (
  id text primary key,                 -- 'valorant:123' o 'csgo:456' (id de PandaScore)
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table teams enable row level security;
drop policy if exists teams_read on teams;
create policy teams_read on teams for select using (is_player());

-- el sincronizador pregunta que fichas tiene y de cuando, con lo justo para calcular cuotas
create or replace function sync_teams_get(p_secret text, p_ids text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_secret is null or p_secret <> (select value #>> '{}' from settings where key = 'sync_secret') then
    raise exception 'Clave de sincronización no válida';
  end if;
  return coalesce((select jsonb_object_agg(id, jsonb_build_object('t', extract(epoch from updated_at) * 1000, 'w', data->'w', 'g', data->'g', 'f', data->'f'))
                   from teams where id = any(p_ids)), '{}');
end $$;

create or replace function sync_teams_put(p_secret text, p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare r jsonb; n int := 0;
begin
  if p_secret is null or p_secret <> (select value #>> '{}' from settings where key = 'sync_secret') then
    raise exception 'Clave de sincronización no válida';
  end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]')) loop
    insert into teams(id, data, updated_at) values (r->>'id', r->'data', now())
    on conflict (id) do update set data = excluded.data, updated_at = now();
    n := n + 1;
  end loop;
  delete from teams where updated_at < now() - interval '30 days';
  return n;
end $$;
revoke all on function sync_teams_get(text, text[]) from public;
revoke all on function sync_teams_put(text, jsonb) from public;
grant execute on function sync_teams_get(text, text[]) to anon, authenticated;
grant execute on function sync_teams_put(text, jsonb) to anon, authenticated;
