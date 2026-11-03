-- 071 (03-11). Mejorar (upgrader). PM: "pick one or more skins from your inventory (or V-Bucks), pick a target skin of higher value, the win chance
-- follows value ratio with a small house edge (~5 %), optional risk slider choosing the multiplier; on win you get the target in inventory,
-- on loss the stake skins are gone. Server-side RNG in an RPC."
--
-- Como funciona: pones skins tuyas (hasta 20) y/o V-Bucks; eso es lo que apuestas (su valor). Eliges un objeto que valga entre 1,25 y 100 veces
-- lo que pones. La probabilidad de ganar es 0,95 x lo que pones / lo que vale el objetivo (margen de la casa del 5 %: de media vuelve el 95 %).
-- El servidor tira un numero entre 0 y 1 (cs_rand, el azar fuerte de 007): si sale por debajo de la probabilidad, ganas y el objetivo entra en tu
-- inventario; si no, lo que pusiste se pierde. Las skins puestas pasan a status 'upg' (gastadas en una mejora) en los dos casos, y los V-Bucks se
-- cobran como movimiento 'mejora'. La pantalla pinta el arco verde con la probabilidad exacta del servidor y la aguja para donde dice la tirada.
-- Objetivos: cualquier variante (objeto, desgaste, StatTrak) de un objeto que este en una caja ACTIVA de CS2 o de lujo (no cosmeticos).
-- Va despues de 007, 012, 020 y 055. Se puede ejecutar varias veces. Prueba: 071_prueba.sql (se deshace sola).

-- ---------- el estado nuevo de una pieza: 'upg' (gastada en una mejora) ----------
do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'cs_inv'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%status%' loop
    execute format('alter table cs_inv drop constraint %I', c.conname);
  end loop;
end $$;
alter table cs_inv add constraint cs_inv_status_check check (status in ('own', 'sold', 'mkt', 'trd', 'jkp', 'con', 'upg'));

-- ---------- cada mejora que se hace ----------
create table if not exists cs_upgrades (
  id bigint generated always as identity primary key,
  player uuid not null references players on delete cascade,
  stake_ids bigint[] not null default '{}',               -- las skins que puso (quedan en 'upg')
  stake_value int not null check (stake_value >= 1),     -- lo que puso en total: valor de las skins + V-Bucks
  vbucks int not null default 0 check (vbucks >= 0),     -- de eso, cuantos V-Bucks
  item_id text not null references cs_items,             -- el objetivo
  wear smallint check (wear between 0 and 4),
  st boolean not null default false,
  target_value int not null check (target_value >= 1),
  chance numeric(12, 10) not null check (chance > 0 and chance < 1),
  roll double precision not null check (roll >= 0 and roll < 1),
  won boolean not null,
  inv_id bigint references cs_inv on delete set null,    -- lo que entro en el inventario si gano
  created_at timestamptz not null default now()
);
create index if not exists cs_upgrades_player on cs_upgrades(player, created_at desc);
create index if not exists cs_upgrades_created on cs_upgrades(created_at desc);
alter table cs_upgrades enable row level security;
drop policy if exists cs_upgrades_read on cs_upgrades;
create policy cs_upgrades_read on cs_upgrades for select to authenticated using (is_player());
revoke insert, update, delete on cs_upgrades from anon, authenticated;

-- ---------- utilidades ----------
-- se puede sacar ese desgaste con ese rango de float? Cortes 0, .07, .15, .38, .45, 1. Tiene que caber al menos un float de 6 decimales
-- dentro del tramo y del rango (minf incluido, el final del tramo no). Una skin de float fijo (minf = maxf) solo tiene el desgaste de ese float.
create or replace function cs_upg_cabe(p_minf numeric, p_maxf numeric, p_w int) returns boolean
language sql immutable as $$
  select case
    when p_minf is null or p_w is null or p_w < 0 or p_w > 4 then false
    when p_minf = p_maxf then p_minf >= (array[0, 0.07, 0.15, 0.38, 0.45, 1])[p_w + 1]
                              and (p_minf < (array[0, 0.07, 0.15, 0.38, 0.45, 1])[p_w + 2] or (p_w = 4 and p_minf <= 1))
    else ceil(greatest(p_minf, (array[0, 0.07, 0.15, 0.38, 0.45, 1])[p_w + 1]) * 1000000)
         <= ceil(least(p_maxf, (array[0, 0.07, 0.15, 0.38, 0.45, 1])[p_w + 2]) * 1000000) - 1
  end
$$;

-- lo que vale una variante (objeto, desgaste, StatTrak): price[1 + st*5 + desgaste], como en cs_roll. 0 si no existe asi:
-- desgaste que su rango de float no alcanza, desgaste en algo que no lo tiene (o al reves), StatTrak en algo que no lo admite, o sin precio.
create or replace function cs_val(p_item text, p_wear smallint, p_st boolean) returns int
language sql stable as $$
  select coalesce((
    select case
      when (t.minf is null) <> (p_wear is null) then 0
      when coalesce(p_st, false) and not t.st then 0
      when p_wear is not null and not cs_upg_cabe(t.minf, t.maxf, p_wear) then 0
      else greatest(0, coalesce(t.price[1 + (case when coalesce(p_st, false) then 5 else 0 end) + coalesce(p_wear, 0)], 0))
    end
    from cs_items t where t.id = p_item), 0)
$$;

-- el objeto se puede pedir como objetivo: esta en alguna caja activa de CS2 o de lujo
create or replace function cs_upg_valido(p_item text) returns boolean
language sql stable as $$
  select exists (select 1 from cs_case_items ci join cs_cases c on c.id = ci.case_id
                 where ci.item_id = p_item and c.active and c.cat in ('skins', 'lujo'))
$$;

-- ---------- lo que se puede pedir: variantes con valor entre p_min y p_max, de la mas barata a la mas cara ----------
create or replace function cs_upgrade_targets(p_min int, p_max int, p_q text default null, p_lim int default 60)
returns table (id text, name text, phase text, rarity text, image text, wear smallint, st boolean, value int)
language plpgsql stable security definer set search_path = public as $$
declare q text := nullif(btrim(coalesce(p_q, '')), '');
begin
  if not is_player() then raise exception 'Tienes que entrar primero'; end if;
  return query
    with it as (
      select t.* from cs_items t
      where exists (select 1 from cs_case_items ci join cs_cases c on c.id = ci.case_id
                    where ci.item_id = t.id and c.active and c.cat in ('skins', 'lujo'))
        and (q is null or (t.name || coalesce(' ' || t.phase, '')) ilike '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%')
    ), v as (
      select it.id, it.name, it.phase, it.rarity, it.image, w.w::smallint as wear, s.s as st,
             coalesce(it.price[1 + (case when s.s then 5 else 0 end) + coalesce(w.w, 0)], 0) as value
      from it
      cross join lateral (select null::int as w where it.minf is null
                          union all select g from generate_series(0, 4) g where it.minf is not null and cs_upg_cabe(it.minf, it.maxf, g)) w
      cross join lateral (select false as s union all select true where it.st) s
    )
    select v.id, v.name, v.phase, v.rarity, v.image, v.wear, v.st, v.value::int from v
    where v.value > 0 and v.value >= greatest(1, coalesce(p_min, 1)) and v.value <= coalesce(p_max, 2147483647)
    order by v.value, v.name, v.wear nulls first, v.st
    limit greatest(1, least(coalesce(p_lim, 60), 200));
end $$;

-- ---------- mejorar ----------
create or replace function cs_upgrade(p_ids bigint[], p_vb int, p_item text, p_wear smallint, p_st boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); ids bigint[]; vb int := coalesce(p_vb, 0); st boolean := coalesce(p_st, false);
  tgt cs_items; tv int; n int; sv int := 0; stake int; bal int; mult numeric; ch numeric; r double precision; gana boolean;
  lo numeric; hi numeric; klo bigint; khi bigint; fl numeric; iid bigint; uid bigint; nom text;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  ids := array(select distinct x from unnest(coalesce(p_ids, '{}'::bigint[])) x where x is not null order by x);
  if cardinality(ids) <> cardinality(array_remove(coalesce(p_ids, '{}'::bigint[]), null)) then raise exception 'Hay una skin repetida'; end if;
  if cardinality(ids) > 20 then raise exception 'Como mucho 20 skins a la vez'; end if;
  if vb < 0 then raise exception 'Los V-Bucks no pueden ser negativos'; end if;
  select * into tgt from cs_items where id = p_item;
  if not found or not cs_upg_valido(p_item) then raise exception 'Ese objeto no se puede conseguir con una mejora'; end if;
  tv := cs_val(p_item, p_wear, st);
  if tv <= 0 then raise exception 'Ese objeto no existe con ese desgaste'; end if;
  nom := case when st then 'StatTrak™ ' else '' end || tgt.name || coalesce(' ' || tgt.phase, '') || coalesce(' (' || cs_wear_name(p_wear) || ')', '');

  perform pay_week();
  perform pg_advisory_xact_lock(hashtext(me::text));      -- lo mismo que al apostar: dos gastos a la vez no se pisan

  -- las skins: tuyas y en el inventario (no vendidas, ni a la venta, ni en un trato...)
  if cardinality(ids) > 0 then
    select count(*)::int, coalesce(sum(q.value), 0)::int into n, sv
      from (select i.value from cs_inv i where i.id = any(ids) and i.player = me and i.status = 'own' for update) q;
    if n <> cardinality(ids) then raise exception 'Alguna de esas skins no es tuya o ya no está en tu inventario'; end if;
  end if;
  stake := sv + vb;
  if stake < 1 then raise exception 'Pon algo para mejorar: skins o V-Bucks'; end if;
  if vb > 0 then
    select coalesce(sum(amount), 0) into bal from ledger where player = me;
    if vb > bal then raise exception 'No tienes saldo suficiente: te quedan %', fmt_int(bal); end if;
  end if;
  mult := tv::numeric / stake;
  if mult < 1.25 then raise exception 'El objetivo tiene que valer al menos 1,25 veces lo que pones'; end if;
  if mult > 100 then raise exception 'El objetivo puede valer como mucho 100 veces lo que pones'; end if;

  -- la probabilidad (5 % para la casa) y la tirada
  ch := round(least(0.95 * stake / tv::numeric, 0.76), 10);
  r := cs_rand();
  gana := r < ch;

  update cs_inv set status = 'upg', sold_at = now() where id = any(ids) and player = me and status = 'own';
  -- la nota es el objetivo, como en 'venta': el monedero ya pone "Mejora" encima
  if vb > 0 then insert into ledger(player, amount, kind, note) values (me, -vb, 'mejora', nom); end if;

  if gana then
    if tgt.minf is null then
      fl := null;
    elsif tgt.minf = tgt.maxf then
      fl := round(tgt.minf, 6);
    else
      -- un float al azar dentro del tramo de ese desgaste y del rango de la skin (6 decimales)
      lo := greatest(tgt.minf, (array[0, 0.07, 0.15, 0.38, 0.45, 1])[p_wear + 1]);
      hi := least(tgt.maxf, (array[0, 0.07, 0.15, 0.38, 0.45, 1])[p_wear + 2]);
      klo := ceil(lo * 1000000)::bigint; khi := ceil(hi * 1000000)::bigint - 1;
      fl := (klo + floor(cs_rand() * (khi - klo + 1))::bigint)::numeric / 1000000;
    end if;
    insert into cs_inv(player, item_id, wear, fl, st, value, case_id, opened_by)
      values (me, p_item, p_wear, fl, st, tv, null, me) returning id into iid;
  end if;
  insert into cs_upgrades(player, stake_ids, stake_value, vbucks, item_id, wear, st, target_value, chance, roll, won, inv_id)
    values (me, ids, stake, vb, p_item, p_wear, st, tv, ch, r, gana, iid) returning id into uid;
  perform bump();
  return jsonb_build_object('id', uid, 'won', gana, 'roll', r, 'chance', ch, 'mult', round(mult, 4),
    'stake_value', stake, 'skins_value', sv, 'vbucks', vb, 'target_value', tv,
    'item', case when gana then (select cs_inv_j(i) from cs_inv i where i.id = iid)
                 else jsonb_build_object('item', p_item, 'wear', p_wear, 'st', st, 'value', tv) end,
    'saldo', (select coalesce(sum(amount), 0) from ledger where player = me));
end $$;

-- ---------- quien puede llamar a que ----------
revoke all on function cs_upg_cabe(numeric, numeric, int), cs_val(text, smallint, boolean), cs_upg_valido(text) from public, anon, authenticated;
revoke all on function cs_upgrade_targets(int, int, text, int), cs_upgrade(bigint[], int, text, smallint, boolean) from public, anon;
grant execute on function cs_upgrade_targets(int, int, text, int), cs_upgrade(bigint[], int, text, smallint, boolean) to authenticated;
