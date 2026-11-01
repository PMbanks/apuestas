-- 063 (02-11). PM: "en ajustes no se puede escoger para quitar de visible la NBA". set_ocultas (db/041) solo aceptaba los deportes f, v, c y u:
-- ahora acepta tambien b (NBA) y r (Formula 1). Solo redefine set_ocultas(). Se puede ejecutar varias veces. Va despues de 041.

create or replace function set_ocultas(p_ocultas jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d jsonb; l jsonb := '{}'::jsonb; k text; v jsonb; n int := 0; r jsonb;
begin
  if auth.uid() is null then raise exception 'Tienes que entrar primero'; end if;
  if p_ocultas is null or jsonb_typeof(p_ocultas) <> 'object' then raise exception 'Eso no es una lista de ocultas'; end if;
  select coalesce(jsonb_agg(x order by x), '[]'::jsonb) into d
    from (select distinct x from jsonb_array_elements_text(case when jsonb_typeof(p_ocultas->'d') = 'array' then p_ocultas->'d' else '[]'::jsonb end) x
          where x in ('f', 'v', 'c', 'u', 'b', 'r')) s;
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

revoke all on function set_ocultas(jsonb) from public, anon;
grant execute on function set_ocultas(jsonb) to authenticated;
