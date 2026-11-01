-- 056 (02-11). Nueva moneda que se ve: 'gambling' (la ficha GA del logo). PM: "V-Bucks dejalo como antes, es la moneda de Fortnite, pero la nueva
-- moneda llamala Gambling y ponla como otra moneda". Solo amplia la lista que acepta players.moneda y set_moneda (db/038). Idempotente. Va despues de 038.
alter table players drop constraint if exists players_moneda_ok;
alter table players add constraint players_moneda_ok check (moneda is null or moneda in ('vbucks', 'usd', 'sol', 'robux', 'gambling'));

create or replace function set_moneda(p_moneda text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Tienes que entrar primero'; end if;
  if p_moneda is null or p_moneda not in ('vbucks', 'usd', 'sol', 'robux', 'gambling') then raise exception 'Esa moneda no existe'; end if;
  update players set moneda = p_moneda where id = auth.uid();
  if not found then raise exception 'No eres jugador'; end if;
  return p_moneda;
end $$;
revoke all on function set_moneda(text) from public, anon;
grant execute on function set_moneda(text) to authenticated;
