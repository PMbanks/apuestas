-- 077 (04-11). PM: la carrera de caballos (db/073) con SEIS caballos fijos que corren todas las carreras, y 12 s para apostar.
-- Cada caballo tiene su calle (la 1 es siempre el primero de la lista) y sus colores; las cuotas siguen saliendo como antes en cada
-- carrera (una plantilla de favorito a tapado con ruido, cuota = 0,95 / p) y el orden de llegada igual (Plackett-Luce, con hash).
-- Se puede ejecutar varias veces. Va despues de 073. Prueba: db/077_prueba.sql.

-- >>> LOS NOMBRES: cambiar aqui y volver a ejecutar este fichero (el sexto, "Rayo", espera el nombre que diga PM) <<<
create or replace function carrera_nombres() returns text[]
language sql immutable as $$ select array['Nasdaq', 'Counter Blox', 'Trans', 'Travis', 'Bad Bunny', 'Rayo'] $$;

-- los colores de cada calle (chaquetilla y gorra), en el mismo orden que los nombres
create or replace function carrera_cuadra() returns jsonb
language sql immutable as $$
  select jsonb_agg(jsonb_build_object('nombre', (carrera_nombres())[i], 'color', c[i][1], 'color2', c[i][2]) order by i)
    from (select array[['#f2c14e','#1d2129'], ['#4d88e6','#f4f2ec'], ['#e0574f','#1d2129'], ['#2bd47d','#0f3d26'], ['#9a7ce8','#f2c14e'], ['#ff8fb1','#4d88e6']] as c) x,
         generate_series(1, 6) i
$$;

create or replace function carrera_t_apuestas() returns interval language sql immutable as $$ select interval '12 seconds' $$;

-- una carrera nueva: los seis de la cuadra, cada uno en su calle, con su probabilidad de esta carrera y su cuota
create or replace function carrera_nueva() returns jg_carrera
language plpgsql security definer set search_path = public as $$
declare v_c jsonb := carrera_cuadra(); v_p numeric[] := '{}'; v_base numeric[] := array[0.30, 0.22, 0.17, 0.13, 0.10, 0.08];
        v_tot numeric := 0; i int; j int; v_cab jsonb := '[]'::jsonb; v_orden smallint[] := '{}'; v_rest numeric[]; v_x numeric; v_acc numeric;
        v_sem text; r jg_carrera; v_perm int[];
begin
  select array_agg(g order by jg_rand()) into v_perm from generate_series(1, 6) g;           -- que plantilla le toca a cada caballo esta vez
  for i in 1 .. 6 loop v_p := v_p || (v_base[v_perm[i]] * (0.8 + 0.45 * jg_rand()::numeric)); v_tot := v_tot + v_p[i]; end loop;
  for i in 1 .. 6 loop v_p[i] := v_p[i] / v_tot; end loop;
  for i in 1 .. 6 loop
    v_cab := v_cab || jsonb_build_object('n', i, 'nombre', v_c->(i - 1)->>'nombre', 'color', v_c->(i - 1)->>'color', 'color2', v_c->(i - 1)->>'color2',
                                         'cuota', greatest(1.05, floor(0.95 / v_p[i] * 100) / 100));
  end loop;
  v_rest := v_p;
  for j in 1 .. 6 loop
    v_tot := 0; for i in 1 .. 6 loop v_tot := v_tot + v_rest[i]; end loop;
    v_x := jg_rand()::numeric * v_tot; v_acc := 0;
    for i in 1 .. 6 loop
      if v_rest[i] > 0 then
        v_acc := v_acc + v_rest[i];
        if v_x < v_acc or (v_acc >= v_tot) then v_orden := v_orden || i::smallint; v_rest[i] := 0; exit; end if;
      end if;
    end loop;
  end loop;
  v_sem := jg_semilla();
  insert into jg_carrera(caballos, hash) values (v_cab, jg_hash(v_sem || ':' || array_to_string(v_orden, ','))) returning * into r;
  insert into jg_carrera_secreto(ronda, orden, semilla) values (r.id, v_orden, v_sem);
  return r;
end $$;

-- la carrera que esperaba con los caballos viejos (sin apuestas) se cambia por una con los nuevos
do $$
declare v_id bigint;
begin
  select id into v_id from jg_carrera where estado = 'espera' and not exists (select 1 from jg_carrera_apuestas a where a.ronda = jg_carrera.id) limit 1;
  if v_id is not null then delete from jg_carrera where id = v_id; end if;
end $$;

revoke all on function carrera_nombres(), carrera_cuadra(), carrera_t_apuestas(), carrera_nueva() from public, anon, authenticated;

-- =====================================================================
-- Avisos en directo dentro de la app (PM 04-11): cada vez que alguien EMPIEZA una jugada en un juego (apuesta en crash, ruleta,
-- caballos, blackjack, empieza unas minas, reta o acepta en cara o cruz) entra una fila en jg_feed; los navegadores abiertos la oyen
-- por Realtime y sacan un aviso (actividad.js). Sale del ledger (la fila negativa de cada juego), asi que es lo que paso de verdad y
-- con su cantidad. Nada de push: solo quien tiene la app abierta. Las filas de mas de 2 dias se borran solas.
-- =====================================================================
create table if not exists jg_feed (
  id bigint generated always as identity primary key,
  player uuid not null references players on delete cascade,
  juego text not null,
  stake int not null,
  creada timestamptz not null default now()
);
create index if not exists jg_feed_creada on jg_feed(creada);
alter table jg_feed enable row level security;
revoke all on jg_feed from public, anon, authenticated;
grant select on jg_feed to authenticated;
drop policy if exists jg_feed_read on jg_feed; create policy jg_feed_read on jg_feed for select to authenticated using (is_player());
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'jg_feed') then
    alter publication supabase_realtime add table jg_feed;
  end if;
end $$;
create or replace function trg_jg_feed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into jg_feed(player, juego, stake) values (new.player, new.kind, -new.amount);
  delete from jg_feed where creada < now() - interval '2 days';
  return null;
end $$;
revoke all on function trg_jg_feed() from public, anon, authenticated;
drop trigger if exists jg_feed_ledger on ledger;
create trigger jg_feed_ledger after insert on ledger for each row
  when (new.amount < 0 and new.kind in ('moneda', 'crash', 'ruleta', 'blackjack', 'minas', 'carrera'))
  execute function trg_jg_feed();

-- =====================================================================
-- Las 5 ultimas jugadas de todos en un juego (como "Ultimas rondas" del crash): quien, cuanto, que jugo, el multiplicador y lo que gano
-- =====================================================================
create or replace function jg_ultimas(p_juego text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); v jsonb;
begin
  if p_juego = 'ruleta' then
    select coalesce(jsonb_agg(x order by x.t desc), '[]') into v from (
      select a.player, a.stake, a.pago, a.color as que, r.n as sale, r.color as sale_c, case when a.pago > 0 then round(a.pago::numeric / a.stake, 2) end as x, r.creada as t
        from jg_ruleta_apuestas a join jg_ruleta r on r.id = a.ronda where r.estado = 'pagada' order by r.id desc, a.id desc limit 5) x;
  elsif p_juego = 'minas' then
    select coalesce(jsonb_agg(x order by x.t desc), '[]') into v from (
      select g.player, g.stake, g.pago, g.minas, cardinality(g.abiertas) as n, case when g.pago > 0 then g.mult end as x, g.cerrada as t
        from jg_minas g where g.estado <> 'curso' order by g.id desc limit 5) x;
  elsif p_juego = 'carrera' then
    select coalesce(jsonb_agg(x order by x.t desc), '[]') into v from (
      select a.player, a.stake, a.pago, r.caballos->(a.caballo - 1)->>'nombre' as que, r.caballos->(r.orden[1] - 1)->>'nombre' as sale,
             case when a.pago > 0 then a.cuota end as x, a.cuota, r.creada + make_interval(secs => r.corre_s) as t
        from jg_carrera_apuestas a join jg_carrera r on r.id = a.ronda where r.estado = 'pagada' order by r.id desc, a.id desc limit 5) x;
  elsif p_juego = 'blackjack' then
    select coalesce(jsonb_agg(x order by x.t desc), '[]') into v from (
      select m.player, m.total as stake, m.pago, m.resultado as que, case when m.pago > 0 then round(m.pago::numeric / m.total, 2) end as x, m.cerrada as t
        from bjm_mano m where m.resultado is not null order by m.cerrada desc limit 5) x;
  elsif p_juego = 'moneda' then
    select coalesce(jsonb_agg(x order by x.t desc), '[]') into v from (
      select m.ganador as player, m.stake, m.stake * 2 as pago, case when m.ganador = m.creador then m.rival else m.creador end as rival, m.salio as sale, 2 as x, m.cerrado as t
        from jg_moneda m where m.estado = 'hecho' order by m.cerrado desc limit 5) x;
  else raise exception 'Ese juego no tiene ultimas jugadas';
  end if;
  return jsonb_build_object('now', jg_ahora(), 'juego', p_juego, 'jugadas', v);
end $$;
revoke all on function jg_ultimas(text) from public, anon;
grant execute on function jg_ultimas(text) to authenticated;

-- PM 04-11: la ruleta tambien con 12 s para apostar (la primera apuesta los abre)
create or replace function ruleta_t_apuestas() returns interval language sql immutable as $$ select interval '12 seconds' $$;
revoke all on function ruleta_t_apuestas() from public, anon, authenticated;
