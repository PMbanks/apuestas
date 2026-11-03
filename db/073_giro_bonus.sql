-- 073 (03-11). Giro Dorado: un giro extra de premio dentro de las cajas. Va DESPUES de 072_batallas_mas.sql.
-- Como funciona (todo aqui dentro, en la misma transaccion que abre la caja: el navegador solo ensena lo que ya esta guardado):
--   1. Sale lo de siempre de la caja (cs_roll).
--   2. Con una probabilidad del 4 % (settings 'giro_dorado_pct', se puede cambiar sin tocar esto) salta el Giro Dorado.
--   3. Se eligen dos objetos de verdad de la MISMA caja:
--      ARRIBA: uno al azar que valga entre 1,5 y 6 veces lo que ha salido; si no hay ninguno, el mas barato que valga mas.
--              Si lo que ha salido ya es lo mejor de la caja, no hay giro.
--      ABAJO:  uno al azar que valga entre 0,25 y 0,75 veces lo que ha salido; si no hay ninguno, el mas caro que valga menos.
--              Si no hay nada mas barato, ABAJO es quedarse con lo que ha salido (no se pierde nada).
--   4. Cara o cruz al 50 % (cs_rand() < 0,5): arriba o abajo. Lo que queda en el inventario (y en una batalla, en su ronda y en el
--      total del equipo) es el objeto final. El dinero se cobra una vez, como siempre: el giro no cobra ni paga nada aparte.
-- Las skins de CS2 se valoran con el mismo desgaste y StatTrak que lo que ha salido (si ese desgaste no le cabe en su rango de float,
-- el mas cercano que si; StatTrak solo si la skin lo admite y tiene precio). Los objetos de lujo tienen un solo precio.
-- cs_inv.bonus (null casi siempre) guarda el giro: {orig, up, down, won}; cs_inv_j lo manda solo cuando existe.
-- Se puede ejecutar varias veces.

insert into settings(key, value) values ('giro_dorado_pct', '4') on conflict (key) do nothing;
alter table cs_inv add column if not exists bonus jsonb;

-- ---------- lo que vale cada objeto de la caja si saliera igual que lo que ha salido ----------
-- devuelve cada objeto de la caja (menos el mismo) con su desgaste, float, StatTrak y valor; los que no tienen precio, fuera
create or replace function cs_giro_cands(p_case text, p_item text, p_wear smallint, p_st boolean)
  returns table (item text, wear smallint, fl numeric, st boolean, value int)
language plpgsql volatile security definer set search_path = public as $$
declare
  t record; w int; lo numeric; hi numeric; f numeric; con_st boolean; v int;
  cortes numeric[] := array[0, 0.07, 0.15, 0.38, 0.45, 1];
  con_tickets boolean := exists (select 1 from cs_case_items where case_id = p_case and tickets is not null);
begin
  for t in select it.id, it.minf, it.maxf, it.st, it.price from cs_items it join cs_case_items ci on ci.item_id = it.id
           where ci.case_id = p_case and it.id <> p_item and (not con_tickets or ci.tickets is not null) loop
    if t.minf is null then
      w := null; f := null;
    else
      if p_wear is null then
        -- lo que ha salido no tiene desgaste (cuchillo liso): el desgaste mas tipico de esta skin
        f := t.minf + (t.maxf - t.minf) * 0.31;
        w := case when f < 0.07 then 0 when f < 0.15 then 1 when f < 0.38 then 2 when f < 0.45 then 3 else 4 end;
      else
        -- el mismo desgaste si le cabe en su rango de float; si no, el mas cercano que si
        w := greatest(case when t.minf < 0.07 then 0 when t.minf < 0.15 then 1 when t.minf < 0.38 then 2 when t.minf < 0.45 then 3 else 4 end,
             least(case when t.maxf - 0.000001 < 0.07 then 0 when t.maxf - 0.000001 < 0.15 then 1 when t.maxf - 0.000001 < 0.38 then 2 when t.maxf - 0.000001 < 0.45 then 3 else 4 end,
                   p_wear));
      end if;
      lo := greatest(t.minf, cortes[w + 1]); hi := least(t.maxf, cortes[w + 2]);
      if hi < lo then hi := lo; end if;
      f := round((lo + (hi - lo) * (0.05 + 0.9 * cs_rand()))::numeric, 6);
    end if;
    con_st := coalesce(p_st, false) and t.st;
    v := t.price[1 + (case when con_st then 5 else 0 end) + coalesce(w, 0)];
    if con_st and coalesce(v, 0) < 1 then con_st := false; v := t.price[1 + coalesce(w, 0)]; end if;
    if coalesce(v, 0) >= 1 then
      item := t.id; wear := w; fl := f; st := con_st; value := v;
      return next;
    end if;
  end loop;
end $$;

-- ---------- el Giro Dorado ----------
-- entra lo que ha salido y sale lo que se queda (igual si no hay giro) y el giro (null si no hay)
create or replace function cs_giro(p_case text, p_item text, p_wear smallint, p_fl numeric, p_st boolean, p_value int,
  out o_item text, out o_wear smallint, out o_fl numeric, out o_st boolean, out o_value int, out o_bonus jsonb)
language plpgsql volatile security definer set search_path = public as $$
declare pct numeric; up record; dn record; queda boolean := false; gano boolean;
  j_up jsonb; j_dn jsonb; j_or jsonb;
begin
  o_item := p_item; o_wear := p_wear; o_fl := p_fl; o_st := p_st; o_value := p_value; o_bonus := null;
  select coalesce((select (s.value #>> '{}')::numeric from settings s where s.key = 'giro_dorado_pct'), 4) into pct;
  if pct is null or pct <= 0 or p_value is null or p_value < 1 then return; end if;
  if cs_rand() * 100 >= pct then return; end if;
  -- ARRIBA
  select * into up from cs_giro_cands(p_case, p_item, p_wear, p_st) c where c.value >= 1.5 * p_value and c.value <= 6 * p_value order by cs_rand() limit 1;
  if up.item is null then
    select * into up from cs_giro_cands(p_case, p_item, p_wear, p_st) c where c.value > p_value order by c.value, cs_rand() limit 1;
  end if;
  if up.item is null then return; end if;          -- ya ha salido lo mejor de la caja: no hay giro
  -- ABAJO
  select * into dn from cs_giro_cands(p_case, p_item, p_wear, p_st) c where c.value >= 0.25 * p_value and c.value <= 0.75 * p_value order by cs_rand() limit 1;
  if dn.item is null then
    select * into dn from cs_giro_cands(p_case, p_item, p_wear, p_st) c where c.value < p_value order by c.value desc, cs_rand() limit 1;
  end if;
  queda := dn.item is null;                        -- nada mas barato: abajo es quedarse con lo que ha salido
  gano := cs_rand() < 0.5;
  j_or := jsonb_build_object('item', p_item, 'value', p_value, 'wear', p_wear, 'st', coalesce(p_st, false));
  j_up := jsonb_build_object('item', up.item, 'value', up.value, 'wear', up.wear, 'st', up.st);
  j_dn := case when queda then j_or || jsonb_build_object('keep', true)
               else jsonb_build_object('item', dn.item, 'value', dn.value, 'wear', dn.wear, 'st', dn.st) end;
  o_bonus := jsonb_build_object('orig', j_or, 'up', j_up, 'down', j_dn, 'won', gano);
  if gano then
    o_item := up.item; o_wear := up.wear; o_fl := up.fl; o_st := up.st; o_value := up.value;
  elsif not queda then
    o_item := dn.item; o_wear := dn.wear; o_fl := dn.fl; o_st := dn.st; o_value := dn.value;
  end if;
end $$;

-- ---------- la ficha de una pieza: con el giro, si lo hubo ----------
create or replace function cs_inv_j(i cs_inv) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', i.id, 'player', i.player, 'item', i.item_id, 'wear', i.wear, 'float', i.fl, 'st', i.st,
    'value', i.value, 'status', i.status, 'case', i.case_id, 'battle', i.battle_id, 'by', i.opened_by, 'at', i.created_at)
    || case when i.bonus is null then '{}'::jsonb else jsonb_build_object('bonus', i.bonus) end
$$;

-- ---------- abrir cajas (007) con el giro ----------
create or replace function cs_open(p_case text, p_n int default 1) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); caja cs_cases; bal int; precio int; d record; g record; iid bigint; res jsonb := '[]'::jsonb;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  if p_n is null or p_n < 1 or p_n > 5 then raise exception 'Se abren de 1 a 5 cajas a la vez'; end if;
  select * into caja from cs_cases where id = p_case and active;
  if not found then raise exception 'Esa caja no existe'; end if;
  perform pay_week();
  perform pg_advisory_xact_lock(hashtext(me::text));      -- lo mismo que al apostar: dos gastos a la vez no se pisan
  select coalesce(sum(amount), 0) into bal from ledger where player = me;
  precio := caja.price * p_n;
  if precio > bal then raise exception 'No tienes saldo suficiente: te quedan %', fmt_int(bal); end if;
  insert into ledger(player, amount, kind, note)
    values (me, -precio, 'caja', caja.name || case when p_n > 1 then ' × ' || p_n else '' end);
  for k in 1..p_n loop
    select * into d from cs_roll(p_case);
    select * into g from cs_giro(p_case, d.o_item, d.o_wear, d.o_fl, d.o_st, d.o_value);
    insert into cs_inv(player, item_id, wear, fl, st, value, case_id, opened_by, bonus)
      values (me, g.o_item, g.o_wear, g.o_fl, g.o_st, g.o_value, p_case, me, g.o_bonus) returning id into iid;
    res := res || jsonb_build_array((select cs_inv_j(i) from cs_inv i where i.id = iid));
  end loop;
  perform bump();
  return jsonb_build_object('items', res, 'saldo', bal - precio);
end $$;

-- ---------- abrir una caja que ya es tuya (017) con el giro ----------
create or replace function cs_open_owned(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); o cs_owned; d record; g record; iid bigint;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  select * into o from cs_owned where id = p_id and player = me for update;
  if o.id is null then raise exception 'Esa caja no es tuya'; end if;
  if o.status <> 'own' then raise exception 'Esa caja ya está abierta'; end if;
  update cs_owned set status = 'used', used_at = now() where id = p_id;
  select * into d from cs_roll(o.case_id);
  select * into g from cs_giro(o.case_id, d.o_item, d.o_wear, d.o_fl, d.o_st, d.o_value);
  insert into cs_inv(player, item_id, wear, fl, st, value, case_id, opened_by, bonus)
    values (me, g.o_item, g.o_wear, g.o_fl, g.o_st, g.o_value, o.case_id, me, g.o_bonus) returning id into iid;
  perform bump();
  return jsonb_build_object('items', jsonb_build_array((select cs_inv_j(i) from cs_inv i where i.id = iid)), 'caja', o.case_id);
end $$;

-- ---------- batallas (072) con el giro: el total del equipo cuenta lo que se queda ----------
create or replace function cs_battle_resolve(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare b cs_battles; te int; ne int; s record; d record; g record; iid bigint; tot int[]; mejor int; empatados int[]; gana int; x record; quien uuid;
begin
  select * into b from cs_battles where id = p_id for update;
  if not found or b.status <> 'open' then return; end if;
  te := cs_tam_equipo(b.mode); ne := cs_equipos(b.mode);
  if (select count(*) from cs_battle_seats where battle_id = p_id) < te * ne then return; end if;
  tot := array_fill(0, array[ne]);
  -- cada ronda, cada sitio abre su caja (con su posible Giro Dorado); de momento se la queda quien la abre
  for r in 1..cardinality(b.cases) loop
    for s in select bs.seat, bs.player from cs_battle_seats bs where bs.battle_id = p_id order by bs.seat loop
      select * into d from cs_roll(b.cases[r]);
      select * into g from cs_giro(b.cases[r], d.o_item, d.o_wear, d.o_fl, d.o_st, d.o_value);
      insert into cs_inv(player, item_id, wear, fl, st, value, case_id, battle_id, opened_by, bonus)
        values (s.player, g.o_item, g.o_wear, g.o_fl, g.o_st, g.o_value, b.cases[r], p_id, s.player, g.o_bonus) returning id into iid;
      insert into cs_battle_drops(battle_id, ronda, seat, inv_id) values (p_id, r, s.seat, iid);
      tot[1 + s.seat / te] := tot[1 + s.seat / te] + g.o_value;
    end loop;
  end loop;
  -- normal: gana el equipo con mas valor; crazy: el que menos. Si empatan, a suertes entre los empatados
  mejor := case when b.regla = 'crazy' then (select min(v) from unnest(tot) v) else (select max(v) from unnest(tot) v) end;
  empatados := array(select k - 1 from generate_subscripts(tot, 1) k where tot[k] = mejor order by k);
  gana := empatados[1 + least(cardinality(empatados) - 1, floor(cs_rand() * cardinality(empatados))::int)];
  -- el equipo ganador se lo lleva todo (lo de los perdedores, de lo mas caro a lo mas barato, al ganador que menos lleve)
  for x in select d2.inv_id from cs_battle_drops d2 join cs_inv i on i.id = d2.inv_id
           where d2.battle_id = p_id and d2.seat / te <> gana order by i.value desc, i.id loop
    select bs.player into quien from cs_battle_seats bs
      where bs.battle_id = p_id and bs.seat / te = gana
      order by (select coalesce(sum(i2.value), 0) from cs_inv i2 where i2.battle_id = p_id and i2.player = bs.player), bs.seat
      limit 1;
    update cs_inv set player = quien where id = x.inv_id;
  end loop;
  update cs_battles set status = 'done', winner = gana, totals = tot, done_at = now() where id = p_id;
end $$;

-- ---------- quien puede llamar a que ----------
revoke all on function cs_giro_cands(text, text, smallint, boolean), cs_giro(text, text, smallint, numeric, boolean, int),
  cs_inv_j(cs_inv), cs_battle_resolve(bigint) from public, anon, authenticated;
revoke all on function cs_open(text, int), cs_open_owned(bigint) from public, anon;
grant execute on function cs_open(text, int), cs_open_owned(bigint) to authenticated;
