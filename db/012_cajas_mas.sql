-- Duodecima parte (30-10): Cajas, segunda tanda. Va despues de 007_cajas.sql y antes de 012b_cajas_datos.sql. No toca 007: redefine lo que cambia.
--   1. Odds un poco mejores: de cada 10.000 cajas, 7.570 grado militar, 1.800 restringido, 450 clasificado, 130 encubierto y 50 especial
--      (antes 7.992 / 1.598 / 320 / 64 / 26, que son las del juego de verdad).
--   2. Sin margen de la casa: cada caja vale lo mismo que su valor medio (lo calcula sync/cajas-datos.mjs al generar 012b), asi que a la larga
--      lo que sacas vendiendolo todo es lo que pagaste (devolucion media del 100 %). Eso no se hace aqui, sino en los precios de 012b.
--   3. Una categoria por caja: 'skins' (CS2) o 'lujo' (relojes, zapatillas, coches...). Los objetos de lujo no llevan desgaste ni StatTrak:
--      se guardan como un cs_items con minf = null y st = false, y cs_roll ya los trata asi (wear y float nulos, un solo precio).
-- Se puede ejecutar varias veces.

-- ---------- la categoria ----------
alter table cs_cases add column if not exists cat text not null default 'skins';
alter table cs_cases drop constraint if exists cs_cases_cat_check;
alter table cs_cases add constraint cs_cases_cat_check check (cat in ('skins', 'lujo'));

-- ---------- el azar ----------
-- Igual que en 007 salvo los pesos de la rareza. Si se cambian, hay que cambiar tambien TIER_P en sync/cajas-datos.mjs (y volver a generar 012b),
-- o los precios de las cajas dejan de ser el valor medio.
create or replace function cs_roll(p_case text, out o_item text, out o_wear smallint, out o_fl numeric, out o_st boolean, out o_value int)
language plpgsql volatile security definer set search_path = public as $$
declare
  pesos int[] := array[7570, 1800, 450, 130, 50];
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

-- ---------- vender: ahora tambien se venden relojes y coches, asi que el aviso ya no dice "skins" ----------
create or replace function cs_sell(p_ids bigint[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); total int; cuantas int; una text;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'Elige qué vender'; end if;
  perform pg_advisory_xact_lock(hashtext(me::text));
  with v as (
    update cs_inv set status = 'sold', sold_at = now()
    where id = any(p_ids) and player = me and status = 'own'
    returning item_id, value, wear, st
  )
  select coalesce(sum(v.value), 0)::int, count(*)::int,
         min(case when v.st then 'StatTrak™ ' else '' end || it.name || coalesce(' ' || it.phase, '') || coalesce(' (' || cs_wear_name(v.wear) || ')', ''))
    into total, cuantas, una
    from v join cs_items it on it.id = v.item_id;
  if cuantas = 0 then raise exception 'Eso ya no está en tu inventario'; end if;
  insert into ledger(player, amount, kind, note) values (me, total, 'venta', case when cuantas = 1 then una else cuantas || ' objetos' end);
  perform bump();
  return jsonb_build_object('vendidas', cuantas, 'total', total, 'saldo', (select coalesce(sum(amount), 0) from ledger where player = me));
end $$;

-- ---------- lo que lee la pantalla: ahora con la categoria ----------
-- Primero las de skins y luego las de lujo, cada grupo por su orden.
create or replace function cs_cases() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_player() then raise exception 'Tienes que entrar primero'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'image', c.image, 'price', c.price, 'ev', c.ev, 'cat', c.cat,
            'n', (select count(*) from cs_case_items ci where ci.case_id = c.id)) order by (c.cat = 'lujo'), c.sort, c.name), '[]'::jsonb)
          from cs_cases c where c.active);
end $$;

create or replace function cs_case(p_case text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare caja cs_cases;
begin
  if not is_player() then raise exception 'Tienes que entrar primero'; end if;
  select * into caja from cs_cases where id = p_case;
  if not found then raise exception 'Esa caja no existe'; end if;
  return jsonb_build_object('id', caja.id, 'name', caja.name, 'image', caja.image, 'price', caja.price, 'ev', caja.ev, 'active', caja.active, 'cat', caja.cat,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'phase', t.phase, 'rarity', t.rarity, 'image', t.image,
                'st', t.st, 'minf', t.minf, 'maxf', t.maxf, 'weight', t.weight, 'price', to_jsonb(t.price)) order by t.id), '[]'::jsonb)
              from cs_items t join cs_case_items ci on ci.item_id = t.id where ci.case_id = p_case));
end $$;

-- ---------- quien puede llamar a que (create or replace conserva los permisos, pero se deja dicho) ----------
revoke all on function cs_roll(text) from public, anon, authenticated;
revoke all on function cs_sell(bigint[]), cs_cases(), cs_case(text) from public, anon;
grant execute on function cs_sell(bigint[]), cs_cases(), cs_case(text) to authenticated;
