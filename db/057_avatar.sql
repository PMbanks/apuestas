-- 057 (01-11). EL ARO Y LA FOTO DE CADA JUGADOR, EN LA BASE. PM: "que cada uno se pueda cambiar el color de su contorno del
-- circulo a lo que quiera en settings, y que pueda elegir fotos".
-- En Ajustes > Tu foto cada jugador elige el color del aro de su circulo y una foto de la galeria de fotos graciosas
-- (app/img/avatares/aNN-nombre.webp). Lo que elige uno lo ven todos, en todas partes donde sale su circulo.
--   players.ring     null = el de siempre (sin aro de color); '#rrggbb' en minusculas = el aro de ese color.
--   players.avatar   null = la foto de siempre (la que subio, o las iniciales); 'aNN-nombre' = esa foto de la galeria.
--                    La clave se comprueba por FORMATO (a + 2 cifras + guion + letras minusculas, cifras o guiones), asi
--                    se pueden anadir fotos nuevas a la galeria sin cargar SQL; la app ignora una clave que no conozca.
--   set_ring(t)      cambia SOLO el aro del jugador conectado (auth.uid()). null lo quita. Devuelve el que queda.
--   set_avatar(t)    cambia SOLO la foto del jugador conectado. null vuelve a la de siempre. Devuelve la que queda.
-- Leerlas: select ring, avatar from players (la politica players_read ya deja leer players a los jugadores).
-- No toca update_profile ni la foto subida (players.photo_url): "Quitar mi foto elegida" solo pone avatar a null.
-- Se puede ejecutar varias veces.

alter table players add column if not exists ring text;
alter table players add column if not exists avatar text;
alter table players drop constraint if exists players_ring_ok;
alter table players add constraint players_ring_ok check (ring is null or ring ~ '^#[0-9a-f]{6}$');
alter table players drop constraint if exists players_avatar_ok;
alter table players add constraint players_avatar_ok check (avatar is null or avatar ~ '^a[0-9]{2}-[a-z0-9-]{1,30}$');

create or replace function set_ring(p_ring text) returns text
language plpgsql security definer set search_path = public as $$
declare v text := lower(nullif(btrim(p_ring), ''));
begin
  if auth.uid() is null then raise exception 'Tienes que entrar primero'; end if;
  if v is not null and v !~ '^#[0-9a-f]{6}$' then raise exception 'Ese color no vale'; end if;
  update players set ring = v where id = auth.uid();
  if not found then raise exception 'No eres jugador'; end if;
  return v;
end $$;

create or replace function set_avatar(p_avatar text) returns text
language plpgsql security definer set search_path = public as $$
declare v text := nullif(btrim(p_avatar), '');
begin
  if auth.uid() is null then raise exception 'Tienes que entrar primero'; end if;
  if v is not null and v !~ '^a[0-9]{2}-[a-z0-9-]{1,30}$' then raise exception 'Esa foto no existe'; end if;
  update players set avatar = v where id = auth.uid();
  if not found then raise exception 'No eres jugador'; end if;
  return v;
end $$;

-- ---------- quien puede llamar a que ----------
revoke all on function set_ring(text), set_avatar(text) from public, anon;
grant execute on function set_ring(text), set_avatar(text) to authenticated;
