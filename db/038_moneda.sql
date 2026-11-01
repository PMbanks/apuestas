-- 038 (01-11). LA MONEDA DE CADA JUGADOR, EN LA BASE. PM: "en ambicious sale v bucks aun ... que se cambie dependiendo de lo
-- que tenga puesto que es solana, que se cambie siempre que lo cambie".
-- Hasta hoy la moneda que se ve (Ajustes: V-Bucks, dolares, Solana o Robux) vivia solo en el localStorage de cada aparato
-- (moneda.js, 'gm-moneda'). Desde aqui se guarda tambien en players.moneda, para que la vean el resto de aparatos y la
-- tarjeta del Dashboard de AMbicious (resumen.js). Solo cambia lo que se ve: el dinero sigue siendo el mismo numero.
--   players.moneda   null = nunca elegida (se ve en V-Bucks); 'vbucks' | 'usd' | 'sol' | 'robux' = elegida.
--                    'vbucks' se guarda tal cual (no como null) para que un aparato viejo no vuelva a subir la suya encima.
--   set_moneda(p)    cambia SOLO la del jugador conectado (auth.uid()). Devuelve la que queda.
-- Leerla: select moneda from players where id = auth.uid() (la politica players_read ya deja leer players a los jugadores).
-- Se puede ejecutar varias veces.

alter table players add column if not exists moneda text;
alter table players drop constraint if exists players_moneda_ok;
alter table players add constraint players_moneda_ok check (moneda is null or moneda in ('vbucks', 'usd', 'sol', 'robux'));

create or replace function set_moneda(p_moneda text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Tienes que entrar primero'; end if;
  if p_moneda is null or p_moneda not in ('vbucks', 'usd', 'sol', 'robux') then raise exception 'Esa moneda no existe'; end if;
  update players set moneda = p_moneda where id = auth.uid();
  if not found then raise exception 'No eres jugador'; end if;
  return p_moneda;
end $$;

-- ---------- quien puede llamar a que ----------
revoke all on function set_moneda(text) from public, anon;
grant execute on function set_moneda(text) to authenticated;
