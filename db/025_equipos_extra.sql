-- Vigesimoquinta parte (30-10): ficha ampliada de cada equipo o luchador (palmares, ganancias, plantilla con fechas y paises).
-- La escribe el sincronizador (sync/equipos-extra.mjs); la leen los jugadores desde la tabla teams, que ya tiene la politica de lectura.
-- Va DESPUES de 006_cs2_y_equipos.sql (y de 002 para is_player). Se puede ejecutar varias veces.
--
-- Ids de la tabla teams:
--   'valorant:133287' y 'csgo:3216'  (id de PandaScore, igual que hasta ahora; la fila ya existe por la ficha de 006)
--   'f:306'                          (futbol: id del equipo en ESPN, vale para todas las ligas)
--   'u:4426000'                      (UFC: id del luchador en ESPN)
-- El formato de extra esta en app/nueva/EQUIPOS-DATOS.md.

alter table teams add column if not exists extra jsonb;                          -- la ficha ampliada (null si aun no hay)
alter table teams add column if not exists extra_at timestamptz;                 -- cuando se guardo bien por ultima vez
alter table teams add column if not exists extra_try timestamptz;                -- ultimo intento, bueno o malo (para no machacar una fuente caida)
alter table teams add column if not exists extra_fails int not null default 0;   -- intentos malos seguidos

-- el sincronizador pregunta de cuando es cada ficha ampliada: t = ultimo guardado bueno, i = ultimo intento, f = fallos seguidos (ms desde 1970)
create or replace function sync_equipos_extra_get(p_secret text, p_ids text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_secret is null or p_secret <> (select value #>> '{}' from settings where key = 'sync_secret') then
    raise exception 'Clave de sincronización no válida';
  end if;
  return coalesce((select jsonb_object_agg(id, jsonb_build_object(
            't', extract(epoch from extra_at) * 1000, 'i', extract(epoch from extra_try) * 1000, 'f', extra_fails))
          from teams where id = any(p_ids) and (extra_at is not null or extra_try is not null)), '{}');
end $$;

-- cuantas apuestas abiertas tiene cada partido que no ha acabado: sirve para refrescar antes las fichas de los equipos con dinero en juego
create or replace function sync_equipos_extra_apuestas(p_secret text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_secret is null or p_secret <> (select value #>> '{}' from settings where key = 'sync_secret') then
    raise exception 'Clave de sincronización no válida';
  end if;
  return coalesce((select jsonb_object_agg(match_id, n) from (
            select b.match_id, count(*) as n from bets b join matches m on m.id = b.match_id
            where b.status = 'open' and m.status in ('scheduled', 'live') group by b.match_id) x), '{}');
end $$;

-- guarda fichas ampliadas. Cada fila: {id, extra:{...}} (bien) o {id, fallo:true} (la fuente fallo: solo apunta el intento).
-- Si la fila del equipo no existe la crea con data vacio y la marca como vieja para que la ficha de 006 la rellene en la proxima pasada.
create or replace function sync_equipos_extra_put(p_secret text, p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare r jsonb; n int := 0;
begin
  if p_secret is null or p_secret <> (select value #>> '{}' from settings where key = 'sync_secret') then
    raise exception 'Clave de sincronización no válida';
  end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]')) loop
    if coalesce(r->>'id', '') = '' or length(r->>'id') > 60 then continue; end if;
    if coalesce((r->>'fallo')::boolean, false) then
      insert into teams(id, data, updated_at, extra_try, extra_fails) values (r->>'id', '{}', now() - interval '1 day', now(), 1)
      on conflict (id) do update set extra_try = now(), extra_fails = least(teams.extra_fails + 1, 1000);
    else
      if jsonb_typeof(r->'extra') is distinct from 'object' then raise exception 'extra debe ser un objeto'; end if;
      if octet_length((r->'extra')::text) > 150000 then raise exception 'La ficha ampliada de % pesa demasiado', r->>'id'; end if;
      insert into teams(id, data, updated_at, extra, extra_at, extra_try, extra_fails)
        values (r->>'id', '{}', now() - interval '1 day', r->'extra', now(), now(), 0)
      on conflict (id) do update set extra = excluded.extra, extra_at = now(), extra_try = now(), extra_fails = 0;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- la limpieza de 006 borraba toda fila sin ficha de resultados en 30 dias; ahora tambien respeta las que tienen ficha ampliada reciente
-- (futbol y UFC solo tienen extra). Lo demas queda igual que en 006.
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
  delete from teams where updated_at < now() - interval '30 days' and coalesce(extra_at, extra_try, updated_at) < now() - interval '30 days';
  return n;
end $$;

revoke all on function sync_equipos_extra_get(text, text[]) from public;
revoke all on function sync_equipos_extra_apuestas(text) from public;
revoke all on function sync_equipos_extra_put(text, jsonb) from public;
revoke all on function sync_teams_put(text, jsonb) from public;
grant execute on function sync_equipos_extra_get(text, text[]) to anon, authenticated;
grant execute on function sync_equipos_extra_apuestas(text) to anon, authenticated;
grant execute on function sync_equipos_extra_put(text, jsonb) to anon, authenticated;
grant execute on function sync_teams_put(text, jsonb) to anon, authenticated;
