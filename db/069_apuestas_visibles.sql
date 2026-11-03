-- 069 (03-11). APUESTAS SIEMPRE A LA VISTA. PM: "no puedo ver contra quien ha apostado Johan, sale como lockeado y no me deja ver su
-- apuesta real, solo el partido; eso no quiero que sea asi, quiero saber a quien ha apostado cada uno".
-- Lo escondia el ajuste settings.vis = 'kick' (get_state y bets_page devuelven pick null en las apuestas de los demas hasta que empieza
-- el partido). Desde aqui vis vale siempre 'open' y admin_set ya no deja volver a 'kick': la eleccion, el importe y la cuota de cada
-- apuesta se ven siempre, antes y despues de empezar. Las combinadas ya se veian (combos y combo_legs se leen enteras).
-- Se puede ejecutar varias veces.

insert into settings(key, value) values ('vis', '"open"') on conflict (key) do update set value = '"open"';

-- igual que la de 004, pero 'vis' solo admite 'open'
create or replace function admin_set(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from players where id = auth.uid() and is_admin) then raise exception 'Solo PM puede cambiar las reglas'; end if;
  if p_key not in ('vis','weekly_amount','daily_on') then raise exception 'Ese ajuste no existe'; end if;
  if p_key = 'vis' and p_value #>> '{}' <> 'open' then raise exception 'Las apuestas se ven siempre: ya no se pueden ocultar'; end if;
  if p_key = 'daily_on' and jsonb_typeof(p_value) <> 'boolean' then raise exception 'Valor no válido'; end if;
  update settings set value = p_value where key = p_key;
  perform bump();
end $$;
revoke all on function admin_set(text, jsonb) from public, anon;
grant execute on function admin_set(text, jsonb) to authenticated;

select bump();
