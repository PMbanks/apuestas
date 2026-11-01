-- 043 (01-11). ANADIR AMIGO DESDE LA APP. PM: "vamos a meter a mi amigo Sebastian, se llamara Sebas en la app".
-- Claude no puede crear cuentas (ni pulsar Run para crearlas), asi que PM las crea el mismo desde Ajustes, tambien desde el movil.
-- admin_alta(nombre): solo un jugador admin. Inventa el usuario (el nombre en minusculas, sin acentos ni espacios), las
-- iniciales, el primer color libre (c1..c12, cada uno con su --f-cN y .av.cN en app.css) y la contrasena (palabra-palabra-numero,
-- como las de los demas), crea la cuenta con admin_create_player (002) y devuelve usuario y contrasena para que PM se los pase.
-- No guarda la contrasena en ningun sitio: solo la ve PM en ese momento. Si ya hay un jugador con ese usuario, error.
-- Se puede ejecutar varias veces.

create or replace function admin_alta(p_nombre text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  n text := btrim(coalesce(p_nombre, ''));
  u text; pw text; col text; ini text;
begin
  if auth.uid() is null or not exists (select 1 from players where id = auth.uid() and is_admin) then
    raise exception 'Solo el admin puede añadir amigos';
  end if;
  if length(n) < 2 or length(n) > 20 then raise exception 'El nombre tiene que tener de 2 a 20 letras'; end if;
  u := lower(regexp_replace(translate(n, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'), '[^A-Za-z0-9]', '', 'g'));
  if length(u) < 2 then raise exception 'Ese nombre no sirve como usuario'; end if;
  if exists (select 1 from players where username = u) or exists (select 1 from auth.users where email = u || '@apuestas.app') then
    raise exception 'Ya hay un jugador que se llama así';
  end if;
  ini := upper(left(u, 2));
  select 'c' || g into col from generate_series(1, 12) g where not exists (select 1 from players where color = 'c' || g) order by g limit 1;
  if col is null then raise exception 'No quedan colores libres'; end if;
  pw := (array['racha','jugada','penalti','remate','chilena','regate','golazo','parada','derbi','tribuna'])[1 + floor(random() * 10)::int]
     || '-' || (array['corona','nocaut','bote','cuota','combo','trofeo','tiro','pase','copa','liga'])[1 + floor(random() * 10)::int]
     || '-' || (100 + floor(random() * 900)::int)::text;
  perform admin_create_player(u, n, ini, col, pw);
  return jsonb_build_object('usuario', u, 'contrasena', pw, 'nombre', n, 'color', col);
end $$;

revoke all on function admin_alta(text) from public, anon;
grant execute on function admin_alta(text) to authenticated;
