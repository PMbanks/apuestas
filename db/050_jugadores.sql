-- Quincuagesima parte (01-11): fichas de jugadores de esports (ganancias por torneo, equipos pasados, foto) dentro de la fila de su equipo.
-- Va DESPUES de 025_equipos_extra.sql y de 045_equipos.sql. Se puede ejecutar varias veces.
--
-- El detalle de cada jugador pesa (ganancias torneo a torneo) y se rehace a otro ritmo que la ficha del equipo, asi que NO va dentro de
-- teams.extra (cada guardado de la ficha del equipo la reemplaza entera): tiene su propia columna, teams.pj, con un objeto por jugador:
--   pj = { "<nick en minusculas>": { t: ms de cuando se hizo, g: {total, aprox, n, lista:[[fecha, torneo, puesto, premio, equipo]]},
--                                   eq: [[equipo, desde, hasta, nota]], foto, vlr, nombre, pais, edad, ... } }
-- La escribe el sincronizador (sync/equipos-extra.mjs) con sync_jugadores_put; la leen los jugadores de la app desde teams, que ya tiene
-- la politica de lectura. El formato esta en app/nueva/EQUIPOS-DATOS.md.
alter table teams add column if not exists pj jsonb;
alter table teams add column if not exists pj_at timestamptz;

-- por equipo: t = cuando se hizo cada jugador (ms desde 1970; 0 si no consta) y p = sus jugadores de la ficha del equipo [[nombre, estado]] (hasta 8),
-- para que el sincronizador sepa a quien le toca. {"valorant:128540": {"t": {"coconut": 1793551127492}, "p": [["coconut", null]]}}.
-- Solo equipos con detalle de jugadores o con ficha de jugadores.
create or replace function sync_jugadores_get(p_secret text, p_ids text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_secret is null or p_secret <> (select value #>> '{}' from settings where key = 'sync_secret') then
    raise exception 'Clave de sincronización no válida';
  end if;
  return coalesce((select jsonb_object_agg(t.id, jsonb_build_object(
            't', coalesce((select jsonb_object_agg(e.key, case when (e.value->>'t') ~ '^[0-9]{1,15}$' then (e.value->>'t')::bigint else 0 end)
                           from jsonb_each(case when jsonb_typeof(t.pj) = 'object' then t.pj else '{}'::jsonb end) e), '{}'),
            'p', coalesce((select jsonb_agg(jsonb_build_array(x.j->>'nombre', x.j->>'estado'))
                           from (select j from jsonb_array_elements(case when jsonb_typeof(t.extra->'jugadores') = 'array' then t.extra->'jugadores' else '[]'::jsonb end) j limit 8) x
                           where coalesce(x.j->>'nombre', '') <> ''), '[]')))
          from teams t where t.id = any(p_ids) and (jsonb_typeof(t.pj) = 'object' or jsonb_typeof(t.extra->'jugadores') = 'array')), '{}');
end $$;

-- mezcla jugadores en la fila de un equipo que ya existe: [{id: 'valorant:128540', jug: {"coconut": {...}}}].
-- Un jugador nuevo se anade y uno que ya estaba se reemplaza entero; los demas no se tocan. La fila de equipo debe existir (no se crea).
create or replace function sync_jugadores_put(p_secret text, p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare r jsonb; k text; n int := 0; nuevo jsonb; viejo text;
begin
  if p_secret is null or p_secret <> (select value #>> '{}' from settings where key = 'sync_secret') then
    raise exception 'Clave de sincronización no válida';
  end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]')) loop
    if coalesce(r->>'id', '') = '' or length(r->>'id') > 60 or jsonb_typeof(r->'jug') is distinct from 'object' then continue; end if;
    if not exists (select 1 from teams where id = r->>'id') then continue; end if;
    for k in select jsonb_object_keys(r->'jug') loop
      if length(k) > 60 or jsonb_typeof(r->'jug'->k) is distinct from 'object' then raise exception 'jugador no válido: %', left(k, 40); end if;
    end loop;
    update teams set pj = coalesce(case when jsonb_typeof(pj) = 'object' then pj end, '{}') || (r->'jug'), pj_at = now() where id = r->>'id' returning pj into nuevo;
    -- como mucho 24 jugadores por equipo: si se pasa, se van los mas viejos
    while (select count(*) from jsonb_object_keys(nuevo)) > 24 loop
      select e.key into viejo from jsonb_each(nuevo) e order by case when (e.value->>'t') ~ '^[0-9]{1,15}$' then (e.value->>'t')::bigint else 0 end limit 1;
      nuevo := nuevo - viejo;
    end loop;
    if octet_length(nuevo::text) > 150000 then raise exception 'El detalle de jugadores de % pesa demasiado', r->>'id'; end if;
    update teams set pj = nuevo where id = r->>'id';
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function sync_jugadores_get(text, text[]) from public;
revoke all on function sync_jugadores_put(text, jsonb) from public;
grant execute on function sync_jugadores_get(text, text[]) to anon, authenticated;
grant execute on function sync_jugadores_put(text, jsonb) to anon, authenticated;
