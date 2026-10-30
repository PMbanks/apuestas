-- Decimosexta parte (30-10). PM: "quita plinko, ruleta y crash, deja solo blackjack, con un maximo de 100 perdido al dia:
-- una vez lo pierdas ya no podras hasta manana". Cara o cruz tambien fuera ("deja solo blackjack").
-- 1) Blackjack: lo perdido hoy (hora de Madrid) mas lo que vas a poner no puede pasar de 100.
create or replace function bj_limite(me uuid, p_stake int) returns void
language plpgsql security definer set search_path = public as $$
declare neto int := (select coalesce(sum(amount), 0) from ledger where player = me and kind = 'blackjack'
                       and created_at >= (madrid_day()::timestamp at time zone 'Europe/Madrid'));
begin
  if 100 + neto <= 0 then raise exception 'Hoy ya has perdido 100 en el blackjack. Vuelve mañana'; end if;
  if p_stake > 100 + neto then raise exception 'Hoy solo puedes arriesgar % más en el blackjack', fmt_int(100 + neto); end if;
end $$;
revoke all on function bj_limite(uuid, int) from public, anon, authenticated;

create or replace function bj_repartir(p_stake int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); h jg_bj; v_mazo smallint[];
begin
  if exists (select 1 from jg_bj where player = me and estado = 'curso') then raise exception 'Ya tienes una mano en juego'; end if;
  perform bj_limite(me, p_stake);
  perform pay_week();
  select array_agg(g::smallint order by jg_rand()) into v_mazo from generate_series(0, 51) g;
  h := jg_bj_nueva(me, p_stake, v_mazo);
  perform bump();
  return jsonb_build_object('mano', jg_bj_j(h), 'saldo', jg_saldo(me));
end $$;

create or replace function bj_doblar(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); h jg_bj; m record;
begin
  select * into h from jg_bj where id = p_id and player = me for update;
  if h.id is null then raise exception 'Esa mano no es tuya'; end if;
  if h.estado <> 'curso' then raise exception 'Esa mano ya ha terminado'; end if;
  if cardinality(h.jugador) <> 2 or h.doblada then raise exception 'Solo puedes doblar con las dos primeras cartas'; end if;
  perform bj_limite(me, h.stake);
  perform jg_cobrar(me, h.stake, 'blackjack', 'Blackjack: doblar');
  h.total := h.stake * 2;
  h.doblada := true;
  select * into m from jg_bj_mazo where mano = h.id for update;
  h.jugador := h.jugador || m.mazo[m.sig];
  update jg_bj_mazo set sig = sig + 1 where mano = h.id;
  if jg_bj_total(h.jugador) > 21 then
    h.banca := array[h.banca[1], m.hueco];
    h := jg_bj_cerrar(h, 'pierde', 0);
  else
    h := jg_bj_banca(h);
  end if;
  return jsonb_build_object('mano', jg_bj_j(h), 'saldo', jg_saldo(me));
end $$;

-- 2) Los demas juegos, cerrados (las funciones siguen, pero ya no se pueden llamar desde la app)
revoke execute on function moneda_crear(int, uuid, text), moneda_aceptar(bigint), crash_apostar(int, numeric), crash_retirar(),
  ruleta_apostar(text, int), plinko_soltar(int, text) from authenticated;
