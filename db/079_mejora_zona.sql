-- 079 (04-11). MEJORAR: LA ZONA VERDE SE MUEVE. PM: que se pueda arrastrar o girar la zona verde a cualquier sitio de la rueda.
-- El tamano (la probabilidad) no cambia; solo donde empieza. cs_upgrade recibe p_start (de 0 a 1 de la vuelta, por defecto 0: las llamadas
-- viejas sin el siguen igual) y se gana si la tirada r cae dentro de [p_start, p_start + probabilidad) contando la vuelta.
-- La aguja para en r como siempre. cs_upgrades guarda donde estaba la zona (inicio). Va despues de 071. Se puede ejecutar varias veces.
-- (078 se deja libre: lo puede usar otro agente.)

alter table cs_upgrades add column if not exists inicio double precision not null default 0 check (inicio >= 0 and inicio < 1);

-- la de 071 con 5 argumentos se quita: con dos versiones PostgREST no sabria cual llamar (una llamada sin p_start usa esta con 0)
drop function if exists cs_upgrade(bigint[], int, text, smallint, boolean);

create or replace function cs_upgrade(p_ids bigint[], p_vb int, p_item text, p_wear smallint, p_st boolean, p_start double precision default 0) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); ids bigint[]; vb int := coalesce(p_vb, 0); st boolean := coalesce(p_st, false);
  tgt cs_items; tv int; n int; sv int := 0; stake int; bal int; mult numeric; ch numeric; r double precision; gana boolean;
  ini double precision := coalesce(p_start, 0); lo numeric; hi numeric; klo bigint; khi bigint; fl numeric; iid bigint; uid bigint; nom text;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  ids := array(select distinct x from unnest(coalesce(p_ids, '{}'::bigint[])) x where x is not null order by x);
  if cardinality(ids) <> cardinality(array_remove(coalesce(p_ids, '{}'::bigint[]), null)) then raise exception 'Hay una skin repetida'; end if;
  if cardinality(ids) > 20 then raise exception 'Como mucho 20 skins a la vez'; end if;
  if ini is null or ini <> ini or ini < 0 or ini >= 1 then raise exception 'La zona verde tiene que empezar entre 0 y 1'; end if;
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
  -- la zona verde empieza donde la ha puesto el jugador (ini, de 0 a 1 de la vuelta) y mide ch: se gana si la aguja (r) cae dentro,
  -- contando la vuelta (de ini hasta 1 y de 0 en adelante si se pasa). La probabilidad es ch se ponga donde se ponga.
  gana := (r - ini - floor(r - ini)) < ch;

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
  insert into cs_upgrades(player, stake_ids, stake_value, vbucks, item_id, wear, st, target_value, chance, roll, won, inv_id, inicio)
    values (me, ids, stake, vb, p_item, p_wear, st, tv, ch, r, gana, iid, ini) returning id into uid;
  perform bump();
  return jsonb_build_object('id', uid, 'won', gana, 'roll', r, 'start', ini, 'chance', ch, 'mult', round(mult, 4),
    'stake_value', stake, 'skins_value', sv, 'vbucks', vb, 'target_value', tv,
    'item', case when gana then (select cs_inv_j(i) from cs_inv i where i.id = iid)
                 else jsonb_build_object('item', p_item, 'wear', p_wear, 'st', st, 'value', tv) end,
    'saldo', (select coalesce(sum(amount), 0) from ledger where player = me));
end $$;

revoke all on function cs_upgrade(bigint[], int, text, smallint, boolean, double precision) from public, anon;
grant execute on function cs_upgrade(bigint[], int, text, smallint, boolean, double precision) to authenticated;
