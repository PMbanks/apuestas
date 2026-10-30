-- Prueba de db/032_premio_combinada.sql. Pone la temporada antes, mete dos combinadas ganadas la semana pasada (cuotas 6 y 12)
-- y mira que bote_semanal da 300 a la de 12 con su trofeo. Al final lanza un error A PROPOSITO para que se deshaga todo.
do $$
declare jug uuid[] := array(select id from players order by created_at, id); prev date := madrid_week() - 7; t timestamptz;
begin
  update settings set value = to_jsonb((prev - 14)::text) where key = 'season_start';
  delete from ledger where kind in ('premio_semana', 'bote_gana') and week = prev;
  t := (prev::timestamp at time zone 'Europe/Madrid') + interval '2 days';
  insert into combos(player, stake, odds, status, payout, created_at, settled_at) values
    (jug[1], 100, 6.00, 'won', 600, t - interval '1 day', t), (jug[2], 50, 12.00, 'won', 600, t - interval '1 day', t + interval '1 hour');
  perform bote_semanal();
  if not exists (select 1 from ledger where kind = 'premio_semana' and week = prev and note = 'Combinada de la semana' and player = jug[2] and amount = 300) then
    raise exception 'FALLO: el premio no ha ido a la combinada de cuota 12';
  end if;
  if exists (select 1 from ledger where kind = 'premio_semana' and week = prev and note = 'Combinada de la semana' and player = jug[1]) then raise exception 'FALLO: premio a la de cuota 6'; end if;
  perform ex_trofeos_apunta();
  if not exists (select 1 from ex_trofeos where tipo = 'premio' and periodo = prev and player = jug[2] and nota = 'Combinada de la semana') then raise exception 'FALLO: sin trofeo'; end if;
  raise exception 'PRUEBA SUPERADA (se deshace todo): 300 a la combinada de cuota 12, con trofeo.';
end $$;
