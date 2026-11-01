-- 058 (02-11). Seis monedas mas que se ven (PM: "gemas de clash of clans, bitcoin, euros, yenes, esmeraldas de minecraft, valorant points").
-- Solo amplia la lista que acepta players.moneda y set_moneda (db/038 y db/056). Idempotente. Va despues de 056.
alter table players drop constraint if exists players_moneda_ok;
alter table players add constraint players_moneda_ok check (moneda is null or moneda in ('vbucks', 'usd', 'sol', 'robux', 'gambling', 'gemas', 'btc', 'eur', 'jpy', 'esmeraldas', 'vp'));

create or replace function set_moneda(p_moneda text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Tienes que entrar primero'; end if;
  if p_moneda is null or p_moneda not in ('vbucks', 'usd', 'sol', 'robux', 'gambling', 'gemas', 'btc', 'eur', 'jpy', 'esmeraldas', 'vp') then raise exception 'Esa moneda no existe'; end if;
  update players set moneda = p_moneda where id = auth.uid();
  if not found then raise exception 'No eres jugador'; end if;
  return p_moneda;
end $$;
revoke all on function set_moneda(text) from public, anon;
grant execute on function set_moneda(text) to authenticated;
