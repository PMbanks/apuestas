-- 027 (30-10 noche). Tres encargos de PM:
-- 1) Cajas: "haz que las cajas tengan un poco peores odds porque le toco buenisimas cosas a tony" y "no que no tengan menos cuchillos,
--    sino que las odds sean mas complicadas de que te toquen, mola que tengan cuchillos". Las cajas traen lo mismo; cambia lo dificil
--    que es que salga cada rareza: vuelven las odds de CS2 de verdad (las de 007). Cuchillo o guantes 0,26 % (antes 0,5 %),
--    encubierto 0,64 % (antes 1,3 %), clasificado 3,2 % (antes 4,5 %). De media una caja devuelve un 67 % de lo que cuesta (antes 100 %).
--    cajas.js muestra estas mismas odds (PESO_012).
-- 2) Blackjack: "blackjack max lose sera de 500 ahora por dia" (antes 100, db/016_solo_blackjack.sql).
-- 3) Tony: "quitale a tony todo lo que ha conseguido en cajas y dale 4k de monedas, quitale las que tiene ahora" y luego "dejemos a tony con 3k no 4k mejor".
--    Fuera sus objetos de cajas (todos vendidos ya) y sus aperturas y ventas del monedero; luego un ajuste para que le queden 3.000.
--    Lo borrado se guarda en respaldo_tony_cajas_inv y respaldo_tony_cajas_ledger (sin politica: los jugadores no los ven).
-- Se puede ejecutar varias veces: la segunda vez Tony ya no tiene nada de cajas y el ajuste sale 0 (no se apunta).

-- ---------- 1) odds de las cajas ----------
create or replace function cs_roll(p_case text, out o_item text, out o_wear smallint, out o_fl numeric, out o_st boolean, out o_value int)
language plpgsql volatile security definer set search_path = public as $$
declare
  pesos int[] := array[7992, 1598, 320, 64, 26];
  rar text[] := array['mil','res','cla','cov','esp'];
  hay text[];
  suma int := 0;
  tiro int;
  k int;
  grado text;
  x double precision;
  tramo int;
  it record;
begin
  select array_agg(distinct ci_it.rarity) into hay
    from cs_case_items ci join cs_items ci_it on ci_it.id = ci.item_id where ci.case_id = p_case;
  if hay is null then raise exception 'Esa caja está vacía'; end if;
  for k in 1..5 loop if rar[k] = any(hay) then suma := suma + pesos[k]; end if; end loop;
  tiro := floor(cs_rand() * suma)::int;
  for k in 1..5 loop
    if rar[k] = any(hay) then
      if tiro < pesos[k] then grado := rar[k]; exit; end if;
      tiro := tiro - pesos[k];
    end if;
  end loop;

  x := cs_rand();
  select q.* into it from (
    select t.id, t.minf, t.maxf, t.st, t.price,
           sum(t.weight) over (order by t.id) as acum, sum(t.weight) over () as total
    from cs_items t join cs_case_items ci on ci.item_id = t.id
    where ci.case_id = p_case and t.rarity = grado
  ) q where q.acum > x * q.total order by q.acum limit 1;

  if it.minf is null then
    o_wear := null; o_fl := null;      -- sin desgaste: cuchillos lisos y todo el lujo
  else
    tramo := floor(cs_rand() * 100)::int;
    x := case when tramo < 3 then 0.07 * cs_rand()
              when tramo < 27 then 0.07 + 0.08 * cs_rand()
              when tramo < 60 then 0.15 + 0.23 * cs_rand()
              when tramo < 84 then 0.38 + 0.07 * cs_rand()
              else 0.45 + 0.55 * cs_rand() end;
    o_fl := round((it.minf + (it.maxf - it.minf) * x)::numeric, 6);
    o_wear := case when o_fl < 0.07 then 0 when o_fl < 0.15 then 1 when o_fl < 0.38 then 2 when o_fl < 0.45 then 3 else 4 end;
  end if;
  o_st := it.st and cs_rand() < 0.1;
  o_value := greatest(1, coalesce(it.price[1 + (case when o_st then 5 else 0 end) + coalesce(o_wear, 0)], 1));
  o_item := it.id;
end $$;
revoke all on function cs_roll(text) from public, anon, authenticated;

-- ---------- 2) blackjack: 500 perdido al dia como mucho ----------
create or replace function bj_limite(me uuid, p_stake int) returns void
language plpgsql security definer set search_path = public as $$
declare neto int := (select coalesce(sum(amount), 0) from ledger where player = me and kind = 'blackjack'
                       and created_at >= (madrid_day()::timestamp at time zone 'Europe/Madrid'));
begin
  if 500 + neto <= 0 then raise exception 'Hoy ya has perdido 500 en el blackjack. Vuelve mañana'; end if;
  if p_stake > 500 + neto then raise exception 'Hoy solo puedes arriesgar % más en el blackjack', fmt_int(500 + neto); end if;
end $$;
revoke all on function bj_limite(uuid, int) from public, anon, authenticated;

-- ---------- 3) Tony: sin nada de cajas y con 3.000 ----------
create table if not exists respaldo_tony_cajas_inv as select * from cs_inv where false;
create table if not exists respaldo_tony_cajas_ledger as select * from ledger where false;
alter table respaldo_tony_cajas_inv enable row level security;
alter table respaldo_tony_cajas_ledger enable row level security;

do $$
declare t uuid := (select id from players where username = 'tony'); objetos int; filas int; saldo int;
begin
  if t is null then raise exception 'No encuentro a Tony'; end if;
  insert into respaldo_tony_cajas_inv select * from cs_inv where player = t
    and id not in (select inv_id from mk_ventas) and id not in (select salida from mk_contratos);
  delete from cs_inv where id in (select id from respaldo_tony_cajas_inv) and player = t;
  get diagnostics objetos = row_count;
  insert into respaldo_tony_cajas_ledger select * from ledger where player = t and kind in ('caja', 'venta');
  delete from ledger where player = t and kind in ('caja', 'venta');
  get diagnostics filas = row_count;
  saldo := (select coalesce(sum(amount), 0) from ledger where player = t);
  if saldo <> 3000 then
    insert into ledger(player, amount, kind, note) values (t, 3000 - saldo, 'ajuste', 'PM: saldo a 3.000');
  end if;
  perform bump();
  raise notice 'Tony: % objetos y % movimientos de cajas fuera; tenia %, ahora 3.000', objetos, filas, saldo;
end $$;

select p.name, (select sum(amount) from ledger l where l.player = p.id) as saldo,
       (select count(*) from cs_inv i where i.player = p.id) as objetos_de_cajas
from players p where p.username = 'tony';
