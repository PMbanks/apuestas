-- Prueba de db/035_bote_automatico.sql. Todo dentro de un bloque que acaba en error A PROPOSITO, asi que no queda nada.
-- 1) bote de esta semana: se cobra solo a quien tiene 100 o mas, una sola vez aunque se llame dos veces.
-- 2) bote_neto cuenta una combinada ganada.
-- 3) el premio de mejor ratio va a la cuota mas alta acertada (50 a 49,00) y no a la de mas dinero (560 a 1,23).
do $$
declare jug uuid[] := array(select id from players order by created_at, id); wk date := madrid_week(); prev date := madrid_week() - 7;
  t timestamptz; m text := (select id from matches order by starts_at desc limit 1); n1 int; n2 int; e int; pobre uuid; s int; antes int; despues int;
begin
  update settings set value = to_jsonb(wk::text) where key = 'bote_desde';
  update settings set value = to_jsonb((prev - 14)::text) where key = 'season_start';
  delete from ledger where kind = 'bote' and week = wk;
  delete from ledger where kind in ('premio_semana', 'bote_gana') and week = prev;
  -- uno sin dinero: lo dejo en 40
  pobre := jug[array_length(jug, 1)];
  select coalesce(sum(amount), 0) into s from ledger where player = pobre;
  insert into ledger(player, amount, kind, note) values (pobre, 40 - s, 'ajuste', 'prueba 035');
  -- 1)
  select count(*) into e from players p where (select coalesce(sum(amount), 0) from ledger l where l.player = p.id) >= 100;
  perform bote_semanal();
  select count(*) into n1 from ledger where kind = 'bote' and week = wk;
  if exists (select 1 from ledger where kind = 'bote' and week = wk and player = pobre) then raise exception 'FALLO: cobra el bote a quien tiene 40'; end if;
  if n1 <> e then
    raise exception 'FALLO: el bote cobra a % y tienen dinero %', n1, e;
  end if;
  if exists (select 1 from ledger where kind = 'bote' and week = wk and amount <> -100) then raise exception 'FALLO: no son 100'; end if;
  perform bote_semanal();
  select count(*) into n2 from ledger where kind = 'bote' and week = wk;
  if n2 <> n1 then raise exception 'FALLO: cobra dos veces (% y %)', n1, n2; end if;
  -- 2)
  antes := bote_neto(jug[1], wk);
  insert into combos(player, stake, odds, status, payout, created_at, settled_at) values (jug[1], 100, 3.00, 'won', 300, now() - interval '1 hour', now());
  despues := bote_neto(jug[1], wk);
  if despues - antes <> 200 then raise exception 'FALLO: bote_neto no cuenta la combinada (% y %)', antes, despues; end if;
  -- 3)
  t := (prev::timestamp at time zone 'Europe/Madrid') + interval '2 days';
  insert into bets(player, match_id, pick, stake, odds, status, payout, created_at, settled_at) values
    (jug[2], m, '1', 560, 1.23, 'won', 689, t - interval '1 day', t),
    (jug[3], m, '1', 50, 49.00, 'won', 2450, t - interval '1 day', t + interval '1 hour');
  perform bote_semanal();
  if not exists (select 1 from ledger where kind = 'premio_semana' and week = prev and note = 'Mejor ratio de la semana' and player = jug[3]) then
    raise exception 'FALLO: el premio no va a la cuota 49';
  end if;
  raise exception 'PRUEBA SUPERADA (se deshace todo): bote de % jugadores cobrado una vez, combinada en bote_neto, mejor apuesta a cuota 49.', n1;
end $$;
