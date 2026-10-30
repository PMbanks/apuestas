-- Undecima parte (30-10): brackets de los torneos de Valorant y CS2 (PandaScore). Los escribe el sincronizador,
-- los leen los jugadores.
create table if not exists brackets (
  id text primary key,                 -- 'valorant:22225' o 'csgo:123' (id del torneo en PandaScore)
  data jsonb not null default '[]',
  updated_at timestamptz not null default now()
);
alter table brackets enable row level security;
drop policy if exists brackets_read on brackets;
create policy brackets_read on brackets for select to authenticated using (is_player());

create or replace function sync_brackets_get(p_secret text, p_ids text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_secret is null or p_secret <> (select value #>> '{}' from settings where key = 'sync_secret') then
    raise exception 'Clave de sincronización no válida';
  end if;
  return coalesce((select jsonb_object_agg(id, extract(epoch from updated_at) * 1000) from brackets where id = any(p_ids)), '{}');
end $$;

create or replace function sync_brackets_put(p_secret text, p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare r jsonb; n int := 0;
begin
  if p_secret is null or p_secret <> (select value #>> '{}' from settings where key = 'sync_secret') then
    raise exception 'Clave de sincronización no válida';
  end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]')) loop
    insert into brackets(id, data, updated_at) values (r->>'id', r->'data', now())
    on conflict (id) do update set data = excluded.data, updated_at = now();
    n := n + 1;
  end loop;
  delete from brackets where updated_at < now() - interval '45 days';
  return n;
end $$;
revoke all on function sync_brackets_get(text, text[]), sync_brackets_put(text, jsonb) from public;
grant execute on function sync_brackets_get(text, text[]), sync_brackets_put(text, jsonb) to anon, authenticated;
