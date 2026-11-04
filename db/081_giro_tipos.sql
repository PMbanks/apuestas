-- 081 (04-11 noche). Dos tipos de Giro Dorado: Ticket Dorado y Ticket de Diamante. Va DESPUES de 075 (y de 080).
-- PM 04-11: "la tira para en el TICKET DORADO en vez de en un objeto (para que veas que viene un giro dorado); luego vuelve a girar SOLO esa
-- linea: si abres 5 cajas y solo toca en 1, solo esa gira otra vez y las otras 4 se quedan con lo suyo; y el giro nuevo solo lleva lo que
-- puede salir de esa caja". Y luego: "hay 2 tipos de animaciones y cosas que te pueden tocar: la golden ticket que es un objeto malo y uno
-- medianamente bueno, y luego otro que es solo buenos".
--
-- Como funciona (todo aqui dentro, en la misma transaccion que abre la caja; el navegador solo ensena lo que ya esta guardado):
--   Cada apertura (cs_open, cs_open_owned y cada sitio de cada ronda de una batalla) tira un numero t al azar de 0 a 100 (cs_rand, el
--   azar fuerte de siempre, igual que cs_roll: las cajas nunca han llevado semilla):
--   * t < giro_dorado_pct (4)                      -> TICKET DORADO. La linea para en el ticket y vuelve a girar entre lo MALO de la caja
--                                                     (vale menos que la caja) y lo MEDIANAMENTE BUENO (vale entre 1 y giro_medio_tope = 3 veces
--                                                     la caja). Sale lo medianamente bueno con la probabilidad "sube" de esa caja (como mucho
--                                                     giro_dorado_sube_max = 50 %), si no lo malo.
--   * despues, con la probabilidad p_dia de la caja -> TICKET DE DIAMANTE. Vuelve a girar SOLO entre lo BUENO de la caja (vale al menos
--                                                     giro_bueno_desde = 1,5 veces la caja), de lo mas barato a lo mejor.
--   * si no                                         -> lo de siempre (cs_roll), sin ticket.
--   Dentro de cada monton cada objeto sale con las mismas probabilidades relativas que en la caja (tickets de EmpireDrop o rareza y peso
--   de CS2), y su desgaste, float y StatTrak se tiran como en cs_roll. Si un monton queda vacio: malo = lo mas barato de la caja,
--   medianamente bueno = lo mas barato que valga al menos la caja (o lo mas caro), bueno = lo mas caro.
--   "Lo que vale" un objeto para los montones es su valor medio (cs_ev: el desgaste como en el juego y StatTrak el 10 %).
-- Lo que devuelve cada caja (la ventaja de la casa), exacto y por caja (cs_giro_ajuste):
--   los dos tickets juntos suben lo que devuelve cada caja COMO MUCHO giro_extra_pts puntos (0,75) sobre lo que devuelve sin tickets.
--   Con 075 el Giro Dorado subia entre 0,82 y 12,9 puntos segun la caja (mediana 2,4): con 0,75 ninguna caja devuelve mas que hoy.
--   De ese presupuesto, giro_diamante_parte (40 %) es para el Diamante; el Dorado usa el resto (si no le llega, baja su "sube") y lo que
--   el Dorado no gasta pasa al Diamante. p_dia = lo que quepa, con tope giro_diamante_max (1 %).
-- cs_inv.bonus (de 075) guarda el ticket: {"tipo": "oro"|"diamante", "lado": "malo"|"medio"|"bueno", "desde": V, "hasta": V|null}
--   desde/hasta: entre que valores medios va lo que pasa por la tira al volver a girar (solo para pintarla; lo que sale ya esta guardado).
--   Los giros viejos de 075 ({orig, up, down, won}) se quedan como estan y la app los sigue ensenando.
-- cs_giro_info(caja): las probabilidades de los dos tickets en esa caja, para la app (prueba gratis y "lo que trae").
-- cs_giro y cs_giro_cands de 075 se quedan en la base sin usar. 075_prueba.sql ya no vale despues de esta (prueba el giro viejo).
-- Se puede ejecutar varias veces.

insert into settings(key, value) values
  ('giro_dorado_pct', '4'), ('giro_diamante_max', '1'), ('giro_extra_pts', '0.75'), ('giro_diamante_parte', '40'),
  ('giro_dorado_sube_max', '50'), ('giro_medio_tope', '3'), ('giro_bueno_desde', '1.5')
on conflict (key) do nothing;
alter table cs_inv add column if not exists bonus jsonb;

-- ---------- un ajuste numerico (o el de por defecto) ----------
create or replace function cs_ajuste_n(p_key text, p_def numeric) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select (s.value #>> '{}')::numeric from settings s where s.key = p_key), p_def)
$$;

-- ---------- lo que vale de media un objeto si sale: desgaste como en el juego (los tramos de cs_roll) y StatTrak el 10 % ----------
create or replace function cs_ev(p_item text) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare it cs_items; ta numeric[] := array[0, 0.07, 0.15, 0.38, 0.45]; tb numeric[] := array[0.07, 0.15, 0.38, 0.45, 1];
  tw numeric[] := array[0.03, 0.24, 0.33, 0.24, 0.16]; lo numeric[] := array[0, 0.07, 0.15, 0.38, 0.45]; hi numeric[] := array[0.07, 0.15, 0.38, 0.45, 1.000001];
  pw numeric[] := array[0, 0, 0, 0, 0]; fa numeric; fb numeric; k int; w int; ev numeric := 0; pst numeric;
begin
  select * into it from cs_items where id = p_item;
  if it.id is null then return 0; end if;
  if it.minf is null then pw[1] := 1;
  else
    for k in 1..5 loop
      fa := it.minf + (it.maxf - it.minf) * ta[k]; fb := it.minf + (it.maxf - it.minf) * tb[k];
      for w in 1..5 loop
        if fb - fa <= 0 then
          if fa >= lo[w] and fa < hi[w] then pw[w] := pw[w] + tw[k]; end if;
        elsif least(fb, hi[w]) > greatest(fa, lo[w]) then
          pw[w] := pw[w] + tw[k] * (least(fb, hi[w]) - greatest(fa, lo[w])) / (fb - fa);
        end if;
      end loop;
    end loop;
  end if;
  pst := case when it.st then 0.1 else 0 end;
  for w in 1..5 loop
    if pw[w] > 0 then
      ev := ev + pw[w] * ((1 - pst) * greatest(1, coalesce(it.price[w], 1)) + pst * greatest(1, coalesce(it.price[5 + w], 1)));
    end if;
  end loop;
  return ev;
end $$;

-- ---------- lo que puede salir de una caja: cada objeto con su peso (q, sin normalizar) y su valor medio ----------
create or replace function cs_giro_objetos(p_case text) returns table (item text, q numeric, ev numeric)
language plpgsql stable security definer set search_path = public as $$
declare tk boolean := exists (select 1 from cs_case_items where case_id = p_case and tickets is not null);
begin
  if tk then
    return query select ci.item_id, ci.tickets::numeric, cs_ev(ci.item_id) from cs_case_items ci where ci.case_id = p_case and ci.tickets is not null;
  else
    -- como cs_roll: la rareza con los pesos de CS2 (de cada 10.000) y, dentro, cada skin por su peso
    return query
      with o as (select t.id, t.rarity, t.weight from cs_case_items ci join cs_items t on t.id = ci.item_id where ci.case_id = p_case),
           r as (select o.rarity, sum(o.weight) as w from o group by o.rarity)
      select o.id, (case o.rarity when 'mil' then 7992 when 'res' then 1598 when 'cla' then 320 when 'cov' then 64 else 26 end)::numeric * o.weight / r.w, cs_ev(o.id)
      from o join r on r.rarity = o.rarity;
  end if;
end $$;

-- ---------- los tres montones de una caja (un objeto puede estar en medio y en bueno a la vez) ----------
create or replace function cs_giro_montones(p_case text) returns table (monton text, item text, q numeric, ev numeric)
language plpgsql stable security definer set search_path = public as $$
declare precio numeric; tope numeric; bueno numeric;
begin
  select c.price into precio from cs_cases c where c.id = p_case;
  tope := precio * cs_ajuste_n('giro_medio_tope', 3); bueno := precio * cs_ajuste_n('giro_bueno_desde', 1.5);
  return query
    with o as (select * from cs_giro_objetos(p_case)),
         m as (select 'malo'::text as mo, o.* from o where o.ev < precio
               union all select 'medio', o.* from o where o.ev >= precio and o.ev <= tope
               union all select 'bueno', o.* from o where o.ev >= bueno),
         -- si un monton queda vacio, su objeto de reserva
         f as (select 'malo'::text as mo, x.* from (select * from o order by o.ev, o.item limit 1) x where not exists (select 1 from m where m.mo = 'malo')
               union all select 'medio', x.* from (select * from o order by (o.ev >= precio) desc, case when o.ev >= precio then o.ev else -o.ev end, o.item limit 1) x
                 where not exists (select 1 from m where m.mo = 'medio')
               union all select 'bueno', x.* from (select * from o order by o.ev desc, o.item limit 1) x where not exists (select 1 from m where m.mo = 'bueno'))
    select m.mo, m.item, m.q, m.ev from m union all select f.mo, f.item, f.q, f.ev from f;
end $$;

-- ---------- las probabilidades de los tickets en una caja, con el presupuesto de giro_extra_pts ----------
-- base: lo que vale de media lo que sale sin ticket; e_malo, e_medio, e_bueno: lo que vale de media lo que sale de cada monton.
-- nuevo = base + p_oro * (sube * e_medio + (1 - sube) * e_malo - base) + p_dia * (e_bueno - base)  <=  base + precio * giro_extra_pts / 100
create or replace function cs_giro_ajuste(p_case text,
  out precio int, out base numeric, out e_malo numeric, out e_medio numeric, out e_bueno numeric,
  out p_oro numeric, out sube numeric, out p_dia numeric, out nuevo numeric, out desde_bueno int, out hasta_medio int)
language plpgsql stable security definer set search_path = public as $$
declare pres numeric; pres_oro numeric; g_oro numeric; smax numeric;
begin
  select c.price into precio from cs_cases c where c.id = p_case;
  select sum(o.q * o.ev) / nullif(sum(o.q), 0) into base from cs_giro_objetos(p_case) o;
  select sum(m.q * m.ev) filter (where m.monton = 'malo') / nullif(sum(m.q) filter (where m.monton = 'malo'), 0),
         sum(m.q * m.ev) filter (where m.monton = 'medio') / nullif(sum(m.q) filter (where m.monton = 'medio'), 0),
         sum(m.q * m.ev) filter (where m.monton = 'bueno') / nullif(sum(m.q) filter (where m.monton = 'bueno'), 0)
    into e_malo, e_medio, e_bueno from cs_giro_montones(p_case) m;
  p_oro := greatest(0, least(100, cs_ajuste_n('giro_dorado_pct', 4))) / 100;
  smax := greatest(0, least(100, cs_ajuste_n('giro_dorado_sube_max', 50))) / 100;
  pres := greatest(0, precio * cs_ajuste_n('giro_extra_pts', 0.75) / 100);
  pres_oro := pres * (1 - greatest(0, least(100, cs_ajuste_n('giro_diamante_parte', 40))) / 100);
  desde_bueno := ceil(precio * cs_ajuste_n('giro_bueno_desde', 1.5))::int;
  hasta_medio := floor(precio * cs_ajuste_n('giro_medio_tope', 3))::int;
  if base is null then p_oro := 0; sube := 0; p_dia := 0; nuevo := null; return; end if;
  sube := case when p_oro > 0 and e_medio > e_malo then greatest(0, least(smax, (pres_oro / p_oro + base - e_malo) / (e_medio - e_malo))) else smax end;
  g_oro := p_oro * (sube * e_medio + (1 - sube) * e_malo - base);
  p_dia := case when e_bueno > base then greatest(0, least(greatest(0, least(100, cs_ajuste_n('giro_diamante_max', 1))) / 100, (pres - g_oro) / (e_bueno - base))) else 0 end;
  -- nunca mas que 1 entre los dos
  p_dia := least(p_dia, 1 - p_oro);
  nuevo := base + g_oro + p_dia * (e_bueno - base);
end $$;

-- ---------- el desgaste, float, StatTrak y valor de un objeto concreto (igual que el final de cs_roll) ----------
create or replace function cs_roll_pieza(p_item text, out o_wear smallint, out o_fl numeric, out o_st boolean, out o_value int)
language plpgsql volatile security definer set search_path = public as $$
declare it cs_items; tramo int; x double precision;
begin
  select * into it from cs_items where id = p_item;
  if it.minf is null then
    o_wear := null; o_fl := null;
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
end $$;

-- ---------- una apertura: con ticket o sin el ----------
create or replace function cs_tirada(p_case text,
  out o_item text, out o_wear smallint, out o_fl numeric, out o_st boolean, out o_value int, out o_bonus jsonb)
language plpgsql volatile security definer set search_path = public as $$
declare t numeric; pct_oro numeric; dia_max numeric; a record; tipo text; lado text; x double precision; d record; p record;
begin
  o_bonus := null;
  t := cs_rand() * 100;
  pct_oro := greatest(0, least(100, cs_ajuste_n('giro_dorado_pct', 4)));
  dia_max := greatest(0, least(100, cs_ajuste_n('giro_diamante_max', 1)));
  if t < pct_oro + dia_max then
    select * into a from cs_giro_ajuste(p_case);
    if t < pct_oro then
      tipo := 'oro'; lado := case when cs_rand() < a.sube then 'medio' else 'malo' end;
    elsif t - pct_oro < a.p_dia * 100 then
      tipo := 'diamante'; lado := 'bueno';
    end if;
  end if;
  if tipo is null then
    select * into d from cs_roll(p_case);
    o_item := d.o_item; o_wear := d.o_wear; o_fl := d.o_fl; o_st := d.o_st; o_value := d.o_value;
    return;
  end if;
  -- un objeto del monton, con las probabilidades relativas de la caja
  x := cs_rand();
  select z.item into o_item from (
    select m.item, sum(m.q) over (order by m.item) as acum, sum(m.q) over () as tot from cs_giro_montones(p_case) m where m.monton = lado
  ) z where z.acum > x * z.tot order by z.acum limit 1;
  if o_item is null then   -- no deberia pasar (los montones nunca quedan vacios): lo de siempre
    select * into d from cs_roll(p_case);
    o_item := d.o_item; o_wear := d.o_wear; o_fl := d.o_fl; o_st := d.o_st; o_value := d.o_value;
    return;
  end if;
  select * into p from cs_roll_pieza(o_item);
  o_wear := p.o_wear; o_fl := p.o_fl; o_st := p.o_st; o_value := p.o_value;
  o_bonus := jsonb_build_object('tipo', tipo, 'lado', lado,
    'desde', case when tipo = 'diamante' then a.desde_bueno else 0 end,
    'hasta', case when tipo = 'diamante' then null else a.hasta_medio end);
end $$;

-- ---------- para la app: las probabilidades de los tickets en una caja ----------
create or replace function cs_giro_info(p_case text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a record;
begin
  if not is_player() then raise exception 'Tienes que entrar primero'; end if;
  if not exists (select 1 from cs_cases where id = p_case) then raise exception 'Esa caja no existe'; end if;
  select * into a from cs_giro_ajuste(p_case);
  return jsonb_build_object('oro', round(a.p_oro * 100, 4), 'diamante', round(a.p_dia * 100, 4), 'sube', round(a.sube * 100, 2),
    'desde', a.desde_bueno, 'hasta', a.hasta_medio);
end $$;

-- ---------- abrir cajas (075) con los tickets ----------
create or replace function cs_open(p_case text, p_n int default 1) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); caja cs_cases; bal int; precio int; g record; iid bigint; res jsonb := '[]'::jsonb;
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
    select * into g from cs_tirada(p_case);
    insert into cs_inv(player, item_id, wear, fl, st, value, case_id, opened_by, bonus)
      values (me, g.o_item, g.o_wear, g.o_fl, g.o_st, g.o_value, p_case, me, g.o_bonus) returning id into iid;
    res := res || jsonb_build_array((select cs_inv_j(i) from cs_inv i where i.id = iid));
  end loop;
  perform bump();
  return jsonb_build_object('items', res, 'saldo', bal - precio);
end $$;

-- ---------- abrir una caja que ya es tuya (075) con los tickets ----------
create or replace function cs_open_owned(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); o cs_owned; g record; iid bigint;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  select * into o from cs_owned where id = p_id and player = me for update;
  if o.id is null then raise exception 'Esa caja no es tuya'; end if;
  if o.status <> 'own' then raise exception 'Esa caja ya está abierta'; end if;
  update cs_owned set status = 'used', used_at = now() where id = p_id;
  select * into g from cs_tirada(o.case_id);
  insert into cs_inv(player, item_id, wear, fl, st, value, case_id, opened_by, bonus)
    values (me, g.o_item, g.o_wear, g.o_fl, g.o_st, g.o_value, o.case_id, me, g.o_bonus) returning id into iid;
  perform bump();
  return jsonb_build_object('items', jsonb_build_array((select cs_inv_j(i) from cs_inv i where i.id = iid)), 'caja', o.case_id);
end $$;

-- ---------- batallas (075) con los tickets: el total del equipo cuenta lo que sale despues del ticket ----------
create or replace function cs_battle_resolve(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare b cs_battles; te int; ne int; s record; g record; iid bigint; tot int[]; mejor int; empatados int[]; gana int; x record; quien uuid;
begin
  select * into b from cs_battles where id = p_id for update;
  if not found or b.status <> 'open' then return; end if;
  te := cs_tam_equipo(b.mode); ne := cs_equipos(b.mode);
  if (select count(*) from cs_battle_seats where battle_id = p_id) < te * ne then return; end if;
  tot := array_fill(0, array[ne]);
  -- cada ronda, cada sitio abre su caja (con su posible ticket); de momento se la queda quien la abre
  for r in 1..cardinality(b.cases) loop
    for s in select bs.seat, bs.player from cs_battle_seats bs where bs.battle_id = p_id order by bs.seat loop
      select * into g from cs_tirada(b.cases[r]);
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
revoke all on function cs_ajuste_n(text, numeric), cs_ev(text), cs_giro_objetos(text), cs_giro_montones(text), cs_giro_ajuste(text),
  cs_roll_pieza(text), cs_tirada(text), cs_battle_resolve(bigint) from public, anon, authenticated;
revoke all on function cs_open(text, int), cs_open_owned(bigint), cs_giro_info(text) from public, anon;
grant execute on function cs_open(text, int), cs_open_owned(bigint), cs_giro_info(text) to authenticated;
