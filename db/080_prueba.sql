-- Prueba de db/080_caballo_stop_loss.sql. Al final lanza un error A PROPOSITO para que se deshaga todo: "PRUEBA SUPERADA".
do $$
declare jug uuid := (select id from players order by created_at, id limit 1); r jsonb;
begin
  update jg_carrera set estado = 'pagada' where estado <> 'pagada';
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug), true);
  r := carrera_estado();
  if r->'ronda'->'caballos'->5->>'nombre' <> 'Stop Loss' or (r->'ronda'->'caballos'->5->>'n')::int <> 6 then raise exception 'FALLO: la calle 6 no es Stop Loss (%)', r->'ronda'->'caballos'->5; end if;
  if exists (select 1 from jsonb_array_elements(r->'ronda'->'caballos') x where x->>'nombre' = 'Rayo') then raise exception 'FALLO: sigue saliendo Rayo'; end if;
  raise exception 'PRUEBA SUPERADA (se deshace todo): la calle 6 sale como Stop Loss y Rayo ya no corre.';
end $$;
