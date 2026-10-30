-- Prueba de db/027_odds_blackjack_tony.sql, para el editor SQL de Supabase. Va DESPUES de 027.
-- Tira 10.000 veces una caja de skins que tenga las cinco rarezas y mira que cuchillo/guantes mas encubierto salgan cerca del 0,9 %
-- (con las odds de antes salia el 1,8 %), prueba el tope de 500 del blackjack y que Tony tenga 3.000 y nada de cajas.
-- Al final lanza un error A PROPOSITO para que se deshaga todo. Si todo va bien, el error dice "PRUEBA SUPERADA" con el resumen.
do $$
declare
  caja text; d record; n int := 10000; top int := 0; esp int := 0; i int; me uuid; fallo boolean; resumen text := ''; t uuid;
begin
  select c.id into caja from cs_cases c where c.cat = 'skins'
    and (select count(distinct it.rarity) from cs_case_items ci join cs_items it on it.id = ci.item_id where ci.case_id = c.id) = 5
    order by c.sort limit 1;
  if caja is null then raise exception 'FALLO: no hay ninguna caja de skins con las cinco rarezas'; end if;
  for i in 1..n loop
    select * into d from cs_roll(caja);
    if (select rarity from cs_items where id = d.o_item) in ('esp', 'cov') then top := top + 1; end if;
    if (select rarity from cs_items where id = d.o_item) = 'esp' then esp := esp + 1; end if;
  end loop;
  if top > 130 then raise exception 'FALLO: cuchillo o encubierto en % de % tiradas (con las odds nuevas deberian ser unas 90)', top, n; end if;
  if top < 50 then raise exception 'FALLO: solo % cuchillos o encubiertos de % (deberian ser unos 90)', top, n; end if;
  resumen := resumen || format('Caja %s: %s cuchillos y %s encubiertos de %s tiradas. ', caja, esp, top - esp, n);

  -- blackjack: con 500 perdidos hoy no deja jugar; con 300 perdidos deja 200 y no 201
  me := (select id from players order by created_at, id limit 1);
  insert into ledger(player, amount, kind, note) values (me, -300, 'blackjack', 'prueba');
  delete from ledger where player = me and kind = 'blackjack' and note <> 'prueba'
    and created_at >= (madrid_day()::timestamp at time zone 'Europe/Madrid');
  perform bj_limite(me, 200);
  fallo := false; begin perform bj_limite(me, 201); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: con 300 perdidos hoy deja arriesgar 201'; end if;
  insert into ledger(player, amount, kind, note) values (me, -200, 'blackjack', 'prueba');
  fallo := false; begin perform bj_limite(me, 1); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: con 500 perdidos hoy todavia deja jugar'; end if;
  resumen := resumen || 'Blackjack: tope de 500 al dia. ';

  t := (select id from players where username = 'tony');
  if (select coalesce(sum(amount), 0) from ledger where player = t) <> 3000 then raise exception 'FALLO: Tony no tiene 3.000'; end if;
  if exists (select 1 from cs_inv where player = t) then raise exception 'FALLO: a Tony le quedan objetos de cajas'; end if;
  if exists (select 1 from ledger where player = t and kind in ('caja', 'venta')) then raise exception 'FALLO: a Tony le quedan aperturas o ventas'; end if;
  resumen := resumen || format('Tony: 3.000 y nada de cajas (respaldo: %s objetos, %s movimientos).',
    (select count(*) from respaldo_tony_cajas_inv), (select count(*) from respaldo_tony_cajas_ledger));

  raise exception 'PRUEBA SUPERADA (se deshace todo): %', resumen;
end $$;
