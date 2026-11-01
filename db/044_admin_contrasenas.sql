-- 044 (01-11). CONTRASENAS DE LOS AMIGOS. PM: "si alguien cambia su contrasena que me salga a mi tambien; en mis settings que
-- pueda ver las contrasenas de todos y sus cambios, mas que nada porque mis colegas son capaces de perder todo eso" y "ya saben
-- que podre ver sus contrasenas, solo pondran una mas corta; lo saben ellos, los conozco en persona".
-- La app avisa a cada uno en Cambiar contrasena: "PM puede ver esta contrasena: no uses la de tu correo".
--   pass_visible          la contrasena actual de cada jugador tal cual (solo la que se pone desde aqui en adelante: las de antes
--                         estan cifradas y no se pueden sacar). Sin lectura directa: solo el admin por admin_pass_ver.
--   pass_log              quien cambio su contrasena y cuando.
--   log_pass_cambio(p)    la app la llama despues de que alguien cambie la suya en Ajustes; solo se guarda si es de verdad la suya.
--   admin_reset_pass(p)   solo admin: le pone una nueva (palabra-palabra-numero), la guarda y la devuelve para pasarsela.
--   admin_alta(n)         (de 043) ahora tambien guarda la contrasena del amigo nuevo.
--   admin_pass_ver()      solo admin: cada amigo con su contrasena (si se sabe) y cuando cambio.
--   admin_pass_log()      solo admin: los ultimos 50 cambios.
-- Se puede ejecutar varias veces.

create table if not exists pass_log (
  id bigserial primary key,
  player uuid not null references players(id) on delete cascade,
  at timestamptz not null default now(),
  quien text not null check (quien in ('jugador', 'admin'))
);
alter table pass_log enable row level security;

create table if not exists pass_visible (
  player uuid primary key references players(id) on delete cascade,
  pass text not null,
  at timestamptz not null default now()
);
alter table pass_visible enable row level security;

drop function if exists log_pass_cambio();
create or replace function log_pass_cambio(p_pass text default null) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null or not exists (select 1 from players where id = auth.uid()) then return; end if;
  -- solo si es de verdad su contrasena de ahora (nadie puede dejar apuntada una falsa)
  if p_pass is not null and length(p_pass) between 1 and 72
     and exists (select 1 from auth.users where id = auth.uid() and encrypted_password = extensions.crypt(p_pass, encrypted_password)) then
    insert into pass_visible(player, pass, at) values (auth.uid(), p_pass, now())
    on conflict (player) do update set pass = excluded.pass, at = excluded.at;
  end if;
  -- como mucho un apunte por minuto y jugador
  if not exists (select 1 from pass_log where player = auth.uid() and at > now() - interval '1 minute') then
    insert into pass_log(player, quien) values (auth.uid(), 'jugador');
  end if;
end $$;

create or replace function admin_reset_pass(p_player uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare pw text; u text; n text;
begin
  if auth.uid() is null or not exists (select 1 from players where id = auth.uid() and is_admin) then
    raise exception 'Solo el admin puede cambiar contraseñas';
  end if;
  select username, name into u, n from players where id = p_player;
  if u is null then raise exception 'Ese jugador no existe'; end if;
  pw := (array['racha','jugada','penalti','remate','chilena','regate','golazo','parada','derbi','tribuna'])[1 + floor(random() * 10)::int]
     || '-' || (array['corona','nocaut','bote','cuota','combo','trofeo','tiro','pase','copa','liga'])[1 + floor(random() * 10)::int]
     || '-' || (100 + floor(random() * 900)::int)::text;
  update auth.users set encrypted_password = extensions.crypt(pw, extensions.gen_salt('bf')), updated_at = now() where id = p_player;
  if not found then raise exception 'Ese jugador no tiene cuenta'; end if;
  insert into pass_visible(player, pass, at) values (p_player, pw, now()) on conflict (player) do update set pass = excluded.pass, at = excluded.at;
  insert into pass_log(player, quien) values (p_player, 'admin');
  return jsonb_build_object('usuario', u, 'nombre', n, 'contrasena', pw);
end $$;

-- 043 con una linea mas: guarda la contrasena del amigo nuevo
create or replace function admin_alta(p_nombre text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  n text := btrim(coalesce(p_nombre, ''));
  u text; pw text; col text; ini text; uid uuid;
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
  uid := admin_create_player(u, n, ini, col, pw);
  insert into pass_visible(player, pass, at) values (uid, pw, now()) on conflict (player) do update set pass = excluded.pass, at = excluded.at;
  return jsonb_build_object('usuario', u, 'contrasena', pw, 'nombre', n, 'color', col);
end $$;

create or replace function admin_pass_ver() returns table(player uuid, nombre text, usuario text, pass text, cuando timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (select 1 from players where id = auth.uid() and is_admin) then raise exception 'Solo el admin'; end if;
  return query select p.id, p.name, p.username, v.pass, v.at from players p left join pass_visible v on v.player = p.id
    where p.id <> auth.uid() order by p.created_at;
end $$;

create or replace function admin_pass_log() returns table(nombre text, cuando timestamptz, quien text)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (select 1 from players where id = auth.uid() and is_admin) then raise exception 'Solo el admin'; end if;
  return query select p.name, l.at, l.quien from pass_log l join players p on p.id = l.player order by l.at desc limit 50;
end $$;

revoke all on function log_pass_cambio(text), admin_reset_pass(uuid), admin_alta(text), admin_pass_ver(), admin_pass_log() from public, anon;
grant execute on function log_pass_cambio(text), admin_reset_pass(uuid), admin_alta(text), admin_pass_ver(), admin_pass_log() to authenticated;
