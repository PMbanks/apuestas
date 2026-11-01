-- 041 (01-11). OCULTAR LIGAS Y JUEGOS, POR JUGADOR. PM: "que pueda ocultar ligas o juegos que uno no quiera ver o apostar nunca".
-- En Ajustes (y con una pulsacion larga en el escudo de una liga de Partidos) cada jugador oculta ligas concretas o deportes
-- enteros (Futbol, Valorant, CS2, UFC). Lo oculto no sale en Partidos, Inicio ni Directo; sus apuestas y retos de ahi siguen en
-- Mis apuestas. Antes (y mientras 041 no este cargado) vive solo en el localStorage de cada aparato (ocultas.js, gm-ocultas:<jugador>);
-- desde aqui se guarda tambien en players.ocultas para que lo vean todos sus aparatos. Mismo patron que 038 (moneda).
--   players.ocultas   null = nunca tocado. Si no: { "d": ["v","u"], "l": { "esp.1": "LaLiga" } }
--                     d = deportes ocultos (f futbol, v valorant, c cs2, u ufc); l = ligas ocultas, id de la liga -> su nombre
--                     (el nombre se guarda para poder mostrarla desde Ajustes aunque ahora no tenga partidos).
--   set_ocultas(p)    cambia SOLO las del jugador conectado (auth.uid()). Limpia lo que no vale (deportes que no existen,
--                     ids vacios o de mas de 60 caracteres, mas de 120 ligas) y devuelve lo que ha guardado.
-- Leerlas: select ocultas from players where id = auth.uid() (la politica players_read ya deja leer players a los jugadores).
-- Se puede ejecutar varias veces.

alter table players add column if not exists ocultas jsonb;
alter table players drop constraint if exists players_ocultas_ok;
alter table players add constraint players_ocultas_ok check (ocultas is null or jsonb_typeof(ocultas) = 'object');

create or replace function set_ocultas(p_ocultas jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d jsonb; l jsonb := '{}'::jsonb; k text; v jsonb; n int := 0; r jsonb;
begin
  if auth.uid() is null then raise exception 'Tienes que entrar primero'; end if;
  if p_ocultas is null or jsonb_typeof(p_ocultas) <> 'object' then raise exception 'Eso no es una lista de ocultas'; end if;
  select coalesce(jsonb_agg(x order by x), '[]'::jsonb) into d
    from (select distinct x from jsonb_array_elements_text(case when jsonb_typeof(p_ocultas->'d') = 'array' then p_ocultas->'d' else '[]'::jsonb end) x
          where x in ('f', 'v', 'c', 'u')) s;
  if jsonb_typeof(p_ocultas->'l') = 'object' then
    for k, v in select key, value from jsonb_each(p_ocultas->'l') loop
      if length(k) between 1 and 60 then
        n := n + 1;
        if n > 120 then raise exception 'Demasiadas ligas ocultas'; end if;
        l := l || jsonb_build_object(k, left(coalesce(v #>> '{}', k), 80));
      end if;
    end loop;
  end if;
  r := jsonb_build_object('d', d, 'l', l);
  update players set ocultas = r where id = auth.uid();
  if not found then raise exception 'No eres jugador'; end if;
  return r;
end $$;

-- ---------- quien puede llamar a que ----------
revoke all on function set_ocultas(jsonb) from public, anon;
grant execute on function set_ocultas(jsonb) to authenticated;
