-- 065 (02-11). Blackjack: al acabar cada ronda cada jugador vuelve a 1 asiento (el primero). Los asientos extra, para jugar varias manos, duran
-- una sola ronda. Solo redefine bjm_pagar() (la de db/040 con una linea mas). Se puede ejecutar varias veces. Va despues de 054.

create or replace function bjm_pagar(p_ronda bigint) returns void
language plpgsql security definer set search_path = public as $$
declare r bjm_ronda; s bjm_secreto; h bjm_mano; v_b smallint[]; v_sig int; v_pd int; v_pj int; v_dbj boolean; v_res text; v_pago int;
begin
  select * into r from bjm_ronda where id = p_ronda for update;
  if r.id is null or r.estado = 'fin' then return; end if;
  select * into s from bjm_secreto where ronda = p_ronda for update;
  v_b := array[r.banca[1], s.hueco];
  v_sig := s.sig;
  v_dbj := jg_bj_total(v_b) = 21;
  if not v_dbj and exists (select 1 from bjm_mano where ronda = p_ronda and estado = 'plantada') then
    loop
      v_pd := jg_bj_total(v_b);
      exit when v_pd >= 17 or v_sig > cardinality(s.mazo);
      v_b := v_b || s.mazo[v_sig];
      v_sig := v_sig + 1;
    end loop;
  end if;
  v_pd := jg_bj_total(v_b);
  update bjm_secreto set sig = v_sig where ronda = p_ronda;
  for h in select * from bjm_mano where ronda = p_ronda order by asiento for update loop
    v_pj := jg_bj_total(h.cartas);
    if h.estado = 'pasada' then v_res := 'pierde'; v_pago := 0;
    elsif v_dbj then
      if h.estado = 'blackjack' then v_res := 'empate'; v_pago := h.total; else v_res := 'pierde'; v_pago := 0; end if;
    elsif h.estado = 'blackjack' then v_res := 'blackjack'; v_pago := (h.stake * 5) / 2;          -- 3 a 2
    elsif v_pd > 21 or v_pj > v_pd then v_res := 'gana'; v_pago := h.total * 2;
    elsif v_pj = v_pd then v_res := 'empate'; v_pago := h.total;
    else v_res := 'pierde'; v_pago := 0;
    end if;
    update bjm_mano set resultado = v_res, pago = v_pago, cerrada = jg_ahora() where ronda = p_ronda and asiento = h.asiento;
    perform jg_abonar(h.player, v_pago, 'blackjack', case v_res when 'blackjack' then 'Blackjack ¡blackjack!' when 'gana' then 'Blackjack: ganas' else 'Blackjack: empate' end);
    perform jg_grande(h.player, 'Blackjack', h.total, v_pago);
  end loop;
  update bjm_ronda set estado = 'fin', banca = v_b, turno = null, plazo = null, fin_at = jg_ahora() where id = p_ronda;
  -- PM 02-11: "siempre tendras 1 seat en la mesa y podras meter mas seats, pero cada ronda te devolvera a 1 seat": al acabar la ronda
  -- cada jugador conserva solo su primer asiento (el de menor numero); los extras quedan libres para la siguiente mano
  delete from bjm_asiento s where s.asiento > (select min(a2.asiento) from bjm_asiento a2 where a2.player = s.player);
  perform bump();                                                     -- saldos nuevos: que la app de todos se ponga al dia
end $$;

revoke all on function bjm_pagar(bigint) from public, anon, authenticated;
