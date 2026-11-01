-- Cuadragesimoquinta parte (01-11): fichas de equipos de esports en formato 2 (titulares y banquillo, roles de CS2, agentes de Valorant,
-- torneos ganados de siempre y cambios de plantilla). Va DESPUES de 025_equipos_extra.sql. Se puede ejecutar varias veces.
--
-- No hay tablas nuevas: el formato nuevo vive dentro de teams.extra (jsonb), que acepta lo que le pongan hasta 150 KB.
-- Lo unico que hace falta es que el sincronizador sepa en que version esta cada ficha ya guardada, para rehacer las viejas (formato 1)
-- aunque no hayan cumplido los 3 dias: sync_equipos_extra_get devuelve ahora tambien p = extra->>'ver' (1 si la ficha no lo trae).
-- Como las fichas viejas se rehacen de a dos equipos por pasada, tardan unas horas en estar todas al dia: es normal.
create or replace function sync_equipos_extra_get(p_secret text, p_ids text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_secret is null or p_secret <> (select value #>> '{}' from settings where key = 'sync_secret') then
    raise exception 'Clave de sincronización no válida';
  end if;
  return coalesce((select jsonb_object_agg(id, jsonb_build_object(
            't', extract(epoch from extra_at) * 1000, 'i', extract(epoch from extra_try) * 1000, 'f', extra_fails,
            'p', case when extra is not null and (extra->>'ver') ~ '^[0-9]{1,3}$' then (extra->>'ver')::int else 1 end))
          from teams where id = any(p_ids) and (extra_at is not null or extra_try is not null)), '{}');
end $$;

revoke all on function sync_equipos_extra_get(text, text[]) from public;
grant execute on function sync_equipos_extra_get(text, text[]) to anon, authenticated;
