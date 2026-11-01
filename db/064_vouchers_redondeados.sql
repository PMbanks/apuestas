-- 064 (02-11). PM: "los vouchers cambialos: si es 0,01 cambialos a 1 euro, si son de 1,25 cambialos a 1 euro, redondealos".
-- Los vouchers de las cajas de EmpireDrop (db/055b) tienen valores como 0,01 · 0,10 · 0,75 · 1 · 1,25 · 2,50 · 5 · 10 · 25 euros.
-- Cada voucher se redondea al euro entero mas cercano (la mitad hacia arriba) con un minimo de 1: 0,01 / 0,10 / 0,75 / 1 / 1,25 pasan a "1€ Voucher"
-- (2,50 pasa a "3€ Voucher"; 5, 10 y 25 se quedan). Los que acaban siendo iguales dentro de una misma caja se juntan en uno solo y SUMAN sus
-- tickets, asi la caja sigue sumando 10.000.000 y cada caja devuelve lo mismo que antes. Los vouchers que ya estan en inventarios pasan al nuevo
-- sin perder su valor. Los objetos viejos se quedan sin usar en cs_items (no se borra nada). Se puede ejecutar varias veces. Va despues de 055b.
do $$
begin
  create temp table _vc on commit drop as
    select id, replace((regexp_match(name, '^([0-9]+(?:[.,][0-9]+)?)\s*€\s*voucher$', 'i'))[1], ',', '.')::numeric as v
    from cs_items where name ~* '^[0-9]+([.,][0-9]+)?\s*€\s*voucher$';
  alter table _vc add column nv int;
  update _vc set nv = greatest(1, floor(v + 0.5))::int where true;
  -- el objeto que se queda por cada valor nuevo: el que ya valia justo eso (su foto lo dice) y, si no hay, el de menor id
  create temp table _canon on commit drop as
    select nv, (array_agg(id order by (v = nv) desc, id))[1] as canon from _vc group by nv;

  -- 1) el contenido de las cajas: un solo voucher por valor, con la suma de los tickets de los que se juntan
  create temp table _suma on commit drop as
    select ci.case_id, c.canon as item_id, sum(ci.tickets) as t
    from cs_case_items ci join _vc on _vc.id = ci.item_id join _canon c on c.nv = _vc.nv
    group by ci.case_id, c.canon;
  update cs_case_items ci set tickets = s.t from _suma s where ci.case_id = s.case_id and ci.item_id = s.item_id;
  insert into cs_case_items(case_id, item_id, tickets) select case_id, item_id, t from _suma on conflict (case_id, item_id) do nothing;
  delete from cs_case_items ci using _vc v, _canon c where ci.item_id = v.id and c.nv = v.nv and ci.item_id <> c.canon;

  -- 2) los que ya estan en inventarios
  update cs_inv i set item_id = c.canon from _vc v, _canon c where i.item_id = v.id and c.nv = v.nv and v.id <> c.canon;

  -- 3) el nombre y el precio del que se queda
  update cs_items i set name = c.nv || '€ Voucher', price = array_fill(c.nv, array[10]) from _canon c where i.id = c.canon;   -- el precio es una lista de 10 (uno por desgaste), aqui todos iguales
end $$;
