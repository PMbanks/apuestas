-- 054 (01-11). Blackjack: una ronda que nadie ha movido en mas de 5 minutos se ANULA y se devuelve lo apostado.
-- Caso real: Tony apuesta 800 a las 17:52, se le va la mesa (cierra la app o se le queda parada), nadie mira la mesa en 1 h 42 min
-- y, al abrirla otro a las 19:34, su mano se planta sola por el tiempo pasado y pierde sin haberla jugado. A partir de ahora, si el plazo
-- de una ronda (de apuestas o de turnos) venció hace mas de 5 minutos es que nadie la estaba jugando: se devuelve cada mano
-- (con lo doblado) y se borra la ronda. Una ronda normal nunca llega ahi: mientras haya alguien mirando, bjm_tick la mueve cada pocos segundos.
-- Solo redefine bjm_tick() (el resto igual que en 048). Se puede ejecutar varias veces. Va despues de 048.

create or replace function bjm_tick() returns void
language plpgsql security definer set search_path = public as $$
declare r bjm_ronda; v_n int := 0; h record; v_pasado interval := interval '5 minutes';
begin
  -- mesa abandonada: ni apostaron ni jugaron nadie a tiempo, asi que nada se juega "con retraso": se devuelve todo
  if exists (select 1 from bjm_ronda where estado <> 'fin'
              and ((estado = 'apuestas' and cierra < jg_ahora() - v_pasado) or (estado = 'turnos' and coalesce(plazo, repartida) < jg_ahora() - v_pasado))) then
    perform bjm_cerrojo();
    select * into r from bjm_ronda where estado <> 'fin'
       and ((estado = 'apuestas' and cierra < jg_ahora() - v_pasado) or (estado = 'turnos' and coalesce(plazo, repartida) < jg_ahora() - v_pasado))
       order by id desc limit 1 for update;
    if r.id is not null then
      for h in select player, sum(total)::int as total from bjm_mano where ronda = r.id group by player loop
        perform jg_abonar(h.player, h.total, 'blackjack', 'Blackjack: mano anulada, la mesa se quedo sin nadie. Te devolvemos la apuesta');
      end loop;
      delete from bjm_mano where ronda = r.id;
      delete from bjm_ronda where id = r.id;
      perform bjm_avisa();
    end if;
  end if;
  if not exists (select 1 from bjm_ronda where estado <> 'fin' and ((estado = 'apuestas' and cierra <= jg_ahora()) or (estado = 'turnos' and plazo <= jg_ahora())))
     and not exists (select 1 from bjm_asiento where visto < jg_ahora() - bjm_t_ausente() or sin_jugar >= 5) then
    return;
  end if;
  perform bjm_cerrojo();
  delete from bjm_asiento s where (s.sin_jugar >= 5 or s.player in (select a.player from bjm_asiento a group by a.player having max(a.visto) < jg_ahora() - bjm_t_ausente()))
     and not exists (select 1 from bjm_mano m join bjm_ronda r2 on r2.id = m.ronda where r2.estado <> 'fin' and m.asiento = s.asiento and m.player = s.player);
  loop
    v_n := v_n + 1;
    exit when v_n > 30;
    select * into r from bjm_ronda where estado <> 'fin' order by id desc limit 1;
    exit when r.id is null;
    if r.estado = 'apuestas' then
      exit when jg_ahora() < r.cierra;
      perform bjm_repartir(r.id, bjm_baraja());
    else
      exit when r.plazo is not null and jg_ahora() < r.plazo;
      update bjm_mano set estado = 'plantada', auto = true where ronda = r.id and asiento = r.turno and estado = 'juega';
      perform bjm_siguiente(r.id, null);
    end if;
    perform bjm_avisa();
  end loop;
end $$;
revoke all on function bjm_tick() from public, anon, authenticated;
