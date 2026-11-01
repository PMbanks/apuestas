-- 059 (01-11). AJUSTAR LA FOTO DE CADA JUGADOR DENTRO DEL CIRCULO. PM: "la foto de counter no se centra, no se por que, haz que
-- se pueda centrar bien como la tiene puesta".
-- La foto que sube cada jugador se guarda recortada en cuadrado (256 px) y se pinta tal cual en su circulo, asi que si el
-- motivo no esta en el centro (un peluche, una cara en una esquina) el circulo se lo corta. En Ajustes > Tu foto cada jugador
-- puede moverla y hacerle zoom dentro del circulo, y lo ven todos, en todas partes donde sale su circulo.
--   players.foto_ajuste   null = como siempre (centrada, sin zoom); 'x,y,z' = el ajuste, tres numeros sin espacios:
--                         x e y = desplazamiento en % del ancho del circulo (de -50 a 50; x positivo mueve la foto a la
--                         derecha, y positivo hacia abajo), z = zoom en % (de 40 a 300; 100 = como hasta hoy).
--                         Ejemplo: '0,0,100' o '-4.5,6,120'.
--   set_foto_ajuste(t)    cambia SOLO el ajuste del jugador conectado (auth.uid()). null o vacio lo quita. Devuelve el que queda.
-- Leerlo: select foto_ajuste from players (la politica players_read ya deja leer players a los jugadores).
-- No toca update_profile ni la foto subida (players.photo_url). Se puede ejecutar varias veces.

alter table players add column if not exists foto_ajuste text;
alter table players drop constraint if exists players_foto_ajuste_ok;
alter table players add constraint players_foto_ajuste_ok check (
  foto_ajuste is null or case
    when foto_ajuste ~ '^-?[0-9]{1,3}(\.[0-9]{1,2})?,-?[0-9]{1,3}(\.[0-9]{1,2})?,[0-9]{1,3}(\.[0-9]{1,2})?$'
    then split_part(foto_ajuste, ',', 1)::numeric between -50 and 50
     and split_part(foto_ajuste, ',', 2)::numeric between -50 and 50
     and split_part(foto_ajuste, ',', 3)::numeric between 40 and 300
    else false end);

create or replace function set_foto_ajuste(p_ajuste text) returns text
language plpgsql security definer set search_path = public as $$
declare v text := nullif(regexp_replace(coalesce(p_ajuste, ''), '\s', '', 'g'), '');
begin
  if auth.uid() is null then raise exception 'Tienes que entrar primero'; end if;
  if v is not null and not (
    case when v ~ '^-?[0-9]{1,3}(\.[0-9]{1,2})?,-?[0-9]{1,3}(\.[0-9]{1,2})?,[0-9]{1,3}(\.[0-9]{1,2})?$'
      then split_part(v, ',', 1)::numeric between -50 and 50
       and split_part(v, ',', 2)::numeric between -50 and 50
       and split_part(v, ',', 3)::numeric between 40 and 300
      else false end
  ) then raise exception 'Ese ajuste no vale'; end if;
  update players set foto_ajuste = v where id = auth.uid();
  if not found then raise exception 'No eres jugador'; end if;
  return v;
end $$;

-- ---------- quien puede llamar a que ----------
revoke all on function set_foto_ajuste(text) from public, anon;
grant execute on function set_foto_ajuste(text) to authenticated;
