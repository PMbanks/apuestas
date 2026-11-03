-- 080 (04-11). PM: el sexto caballo se llama "Stop Loss" (antes "Rayo"). Solo cambia la lista de nombres de db/077 (carrera_nombres);
-- colores, calles y cuotas igual. La carrera que espera sin apuestas se rehace para que salga ya con el nombre nuevo.
-- Se puede ejecutar varias veces. Va despues de 077. Prueba: db/080_prueba.sql.
create or replace function carrera_nombres() returns text[]
language sql immutable as $$ select array['Nasdaq', 'Counter Blox', 'Trans', 'Travis', 'Bad Bunny', 'Stop Loss'] $$;
revoke all on function carrera_nombres() from public, anon, authenticated;
do $$
declare v_id bigint;
begin
  select id into v_id from jg_carrera where estado = 'espera' and not exists (select 1 from jg_carrera_apuestas a where a.ronda = jg_carrera.id) limit 1;
  if v_id is not null then delete from jg_carrera where id = v_id; end if;
end $$;
