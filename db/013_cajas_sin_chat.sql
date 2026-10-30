-- Decimotercera parte (30-10): PM: "que lo de las cajas no se vea en el chat, que salga en otro lugar".
-- Las mismas funciones de 007 sin los avisos al chat; las batallas se ven en Cajas.

create or replace function cs_battle_create(p_mode text, p_cases text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); precio int; validas int; bal int; bid bigint; rondas int := coalesce(cardinality(p_cases), 0);
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  if p_mode is null or p_mode not in ('1v1','2v2') then raise exception 'Elige 1v1 o 2v2'; end if;
  if rondas < 1 or rondas > 10 then raise exception 'Elige de 1 a 10 cajas'; end if;
  select coalesce(sum(c.price), 0)::int, count(c.id)::int into precio, validas
    from unnest(p_cases) u(cid) left join cs_cases c on c.id = u.cid and c.active;
  if validas <> rondas then raise exception 'Alguna de esas cajas no existe'; end if;
  perform pay_week();
  perform pg_advisory_xact_lock(hashtext(me::text));
  select coalesce(sum(amount), 0) into bal from ledger where player = me;
  if precio > bal then raise exception 'No tienes saldo suficiente: te quedan %', fmt_int(bal); end if;
  insert into cs_battles(mode, cases, cost, created_by) values (p_mode, p_cases, precio, me) returning id into bid;
  insert into cs_battle_seats(battle_id, seat, player) values (bid, 0, me);
  insert into ledger(player, amount, kind, note) values (me, -precio, 'batalla', 'Batalla ' || p_mode || ' #' || bid);
  perform bump();
  return jsonb_build_object('id', bid, 'saldo', bal - precio);
end $$;

create or replace function cs_battle_resolve(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare b cs_battles; tam int; mitad int; s record; d record; iid bigint; tot int[] := array[0, 0]; gana int; x record; quien uuid;
begin
  select * into b from cs_battles where id = p_id for update;
  if not found or b.status <> 'open' then return; end if;
  tam := case b.mode when '1v1' then 2 else 4 end;
  mitad := tam / 2;
  if (select count(*) from cs_battle_seats where battle_id = p_id) < tam then return; end if;
  -- cada ronda, cada sitio abre su caja; de momento se la queda quien la abre
  for r in 1..cardinality(b.cases) loop
    for s in select bs.seat, bs.player from cs_battle_seats bs where bs.battle_id = p_id order by bs.seat loop
      select * into d from cs_roll(b.cases[r]);
      insert into cs_inv(player, item_id, wear, fl, st, value, case_id, battle_id, opened_by)
        values (s.player, d.o_item, d.o_wear, d.o_fl, d.o_st, d.o_value, b.cases[r], p_id, s.player) returning id into iid;
      insert into cs_battle_drops(battle_id, ronda, seat, inv_id) values (p_id, r, s.seat, iid);
      tot[1 + s.seat / mitad] := tot[1 + s.seat / mitad] + d.o_value;
    end loop;
  end loop;
  -- gana el lado con mas valor; si empatan, a cara o cruz
  gana := case when tot[1] > tot[2] then 0 when tot[2] > tot[1] then 1 else floor(cs_rand() * 2)::int end;
  -- el lado ganador se lo lleva todo: cada ganador guarda lo que ha abierto y lo de los perdedores va,
  -- de la mas cara a la mas barata, al ganador que menos valor lleve (en 1v1, todo al que gana)
  for x in select d2.inv_id from cs_battle_drops d2 join cs_inv i on i.id = d2.inv_id
           where d2.battle_id = p_id and d2.seat / mitad <> gana order by i.value desc, i.id loop
    select bs.player into quien from cs_battle_seats bs
      where bs.battle_id = p_id and bs.seat / mitad = gana
      order by (select coalesce(sum(i2.value), 0) from cs_inv i2 where i2.battle_id = p_id and i2.player = bs.player), bs.seat
      limit 1;
    update cs_inv set player = quien where id = x.inv_id;
  end loop;
  update cs_battles set status = 'done', winner = gana, totals = tot, done_at = now() where id = p_id;
end $$;
