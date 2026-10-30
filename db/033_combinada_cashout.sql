-- 033 (31-10). Cancelar una combinada en directo. PM: "ok todas" a "cancelar una combinada en directo, igual que las sueltas".
-- Antes de que empiece el primero de sus partidos sigue cancel_combo (devuelve todo). Desde que empieza alguno, se puede
-- cancelar cobrando lo que vale ahora: lo que pagaria si acierta lo que queda, por la probabilidad de acertarlo todo, menos un
-- 10 % de la casa (como el cash out de una suelta, 024). Cada partido por jugar cuenta con su probabilidad: en directo la del
-- modelo de 024 (marcador y minuto, mapas y rondas) y si no ha empezado, la de su cuota de ahora. Nunca mas de lo que pagaria.
-- Si algun partido ya en juego no tiene datos frescos del directo, ahora no se puede. Se puede ejecutar varias veces. Va despues de 029.

alter table combos drop constraint if exists combos_status_check;
alter table combos add constraint combos_status_check check (status in ('open', 'won', 'lost', 'void', 'cashout'));

create or replace function combo_cash_value(c combos) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare l record; b bets; q jsonb; p numeric := 1; paga numeric := c.stake; empezado boolean := false; cur numeric; v numeric;
begin
  if c.status <> 'open' then return jsonb_build_object('ok', false, 'why', 'La combinada ya está cerrada'); end if;
  for l in select cl.*, m.status mst, m.starts_at, m.odds_1, m.odds_x, m.odds_2, m.sport, m.id mid from combo_legs cl join matches m on m.id = cl.match_id where cl.combo_id = c.id loop
    if l.result = 'lost' then return jsonb_build_object('ok', false, 'why', 'Ya ha fallado un partido'); end if;
    if l.result = 'won' then paga := paga * l.odds; empezado := true; continue; end if;
    if l.result = 'void' then empezado := true; continue; end if;
    paga := paga * l.odds;
    if l.mst = 'scheduled' and l.starts_at > now() then
      cur := case l.pick when '1' then l.odds_1 when 'X' then l.odds_x else l.odds_2 end;
      if cur is null or cur <= 1 then return jsonb_build_object('ok', false, 'why', 'Ahora no hay cuota para uno de sus partidos'); end if;
      p := p * least(0.97, 1 / (cur * 1.05));
    else
      empezado := true;
      b.status := 'open'; b.boost := null; b.pick := l.pick; b.stake := 100; b.odds := l.odds;
      q := ex_cash_value(b, (select m from matches m where m.id = l.mid));
      if not coalesce((q->>'ok')::boolean, false) or q->>'p' is null then
        return jsonb_build_object('ok', false, 'why', coalesce(q->>'why', 'Sin datos frescos del directo'));
      end if;
      p := p * (q->>'p')::numeric;
    end if;
  end loop;
  if not empezado then return jsonb_build_object('ok', false, 'mode', 'pre', 'why', 'Aún no ha empezado ninguno: cancélala y te devuelve todo'); end if;
  paga := least(paga, c.stake * 1000);
  v := paga * least(0.99, greatest(0.001, p)) * 0.90;
  return jsonb_build_object('ok', true, 'mode', 'live', 'win', round(paga)::int, 'value', least(round(paga), greatest(1, round(v)))::int);
end $$;

create or replace function combo_cash_quotes() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('combo', c.id, 'stake', c.stake) || combo_cash_value(c) order by c.created_at desc), '[]'::jsonb)
            from combos c where c.player = me and c.status = 'open');
end $$;

create or replace function combo_cash_out(p_id bigint, p_min int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c combos; q jsonb; v int; n int;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  perform pg_advisory_xact_lock(hashtext(me::text));
  select * into c from combos where id = p_id for update;
  if not found or c.player <> me then raise exception 'Esa combinada no es tuya'; end if;
  q := combo_cash_value(c);
  if not coalesce((q->>'ok')::boolean, false) then raise exception '%', coalesce(q->>'why', 'Ahora no se puede cancelar'); end if;
  v := (q->>'value')::int;
  if p_min is not null and v < p_min then raise exception 'El valor ha cambiado: ahora son % (te enseñaban %)', fmt_int(v), fmt_int(p_min); end if;
  update combos set status = 'cashout', payout = v, settled_at = now() where id = p_id;
  select count(*) into n from combo_legs where combo_id = p_id;
  insert into ledger(player, amount, kind, note) values (me, v, 'cashout', 'Combinada de ' || n || ' cancelada en directo');
  insert into chat(body) values (pname(me) || ' cancela una combinada de ' || n || ' en directo y cobra ' || fmt_int(v) || ' de ' || fmt_int(c.stake));
  perform bump();
  return jsonb_build_object('value', v, 'stake', c.stake, 'beneficio', v - c.stake);
end $$;

revoke all on function combo_cash_quotes(), combo_cash_out(bigint, int) from public, anon;
grant execute on function combo_cash_quotes(), combo_cash_out(bigint, int) to authenticated;
revoke all on function combo_cash_value(combos) from public, anon, authenticated;
