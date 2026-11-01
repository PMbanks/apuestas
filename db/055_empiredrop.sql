-- 055 (01-11). EmpireDrop: PM pidio "que las odds sean las de EmpireDrop; copiale las cajas y lo que hay en sus cajas" (la caja de Nvidia no traia Nvidia ni Xbox ni HyperX).
-- 59 cajas de lujo con sus objetos, precios y probabilidades copiados de empiredrop.com (datos crudos en D:/eddwi/claude/sandbox/empiredrop/raw). Las 24 que ya existian
-- (db/012b y db/046) conservan su id y SUSTITUYEN su contenido (los objetos viejos siguen en cs_items por los inventarios, solo salen de la caja); 35 cajas nuevas (lujo-ed-*).
-- Patinetes (lujo-patinetes) y Gafas (lujo-gafas) no tienen caja en EmpireDrop: no se tocan.
-- Probabilidad por objeto: nueva columna cs_case_items.tickets (los game_odds de EmpireDrop, 10.000.000 por caja). Si una caja lleva tickets, cs_roll tira con ellos; si no (CS2, Patinetes, Gafas),
-- tira por rareza como siempre (027). Generado por D:/eddwi/claude/sandbox/empiredrop/build.mjs: no se edita a mano.
-- Precios: 1 euro = 1 V-Buck. Cada caja devuelve de media un 90 % de lo que cuesta (como EmpireDrop).
-- Este fichero lleva la estructura y las dos funciones; los datos van en 055b_empiredrop_datos.sql (despues). Se puede ejecutar varias veces.

alter table cs_case_items add column if not exists tickets bigint check (tickets is null or tickets > 0);

-- cs_roll: igual que la de 027, con una rama nueva para las cajas con tickets
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
  con_tickets boolean;
begin
  select exists (select 1 from cs_case_items where case_id = p_case and tickets is not null) into con_tickets;
  if con_tickets then
    -- cajas de EmpireDrop: cada objeto sale con su propia probabilidad (tickets / suma de tickets)
    x := cs_rand();
    select q.* into it from (
      select t.id, t.minf, t.maxf, t.st, t.price,
             sum(ci.tickets) over (order by t.id) as acum, sum(ci.tickets) over () as total
      from cs_items t join cs_case_items ci on ci.item_id = t.id
      where ci.case_id = p_case and ci.tickets is not null
    ) q where q.acum > x * q.total order by q.acum limit 1;
    if it.id is null then raise exception 'Esa caja está vacía'; end if;
  else
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
  end if;

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

-- cs_case: igual que la de 012, con los tickets de cada objeto (null si la caja tira por rareza)
create or replace function cs_case(p_case text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare caja cs_cases;
begin
  if not is_player() then raise exception 'Tienes que entrar primero'; end if;
  select * into caja from cs_cases where id = p_case;
  if not found then raise exception 'Esa caja no existe'; end if;
  return jsonb_build_object('id', caja.id, 'name', caja.name, 'image', caja.image, 'price', caja.price, 'ev', caja.ev, 'active', caja.active, 'cat', caja.cat,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'phase', t.phase, 'rarity', t.rarity, 'image', t.image,
                'st', t.st, 'minf', t.minf, 'maxf', t.maxf, 'weight', t.weight, 'price', to_jsonb(t.price), 'tickets', ci.tickets) order by t.id), '[]'::jsonb)
              from cs_items t join cs_case_items ci on ci.item_id = t.id where ci.case_id = p_case));
end $$;
revoke all on function cs_case(text) from public, anon;
grant execute on function cs_case(text) to authenticated;
