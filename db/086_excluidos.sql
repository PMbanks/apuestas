-- 086 (PM 08-11). FUERA DE LA APP: Sebas, Petyyy, Tony, Isaac y Counter.
-- PM: "sacalos de la pagina a sebas, petty, tony, isaac y counter, que no puedan entrar dentro, que solo sea para el resto de
--      personas... asi que no quiero ver rastro de ellos".
-- Va DESPUES de 085. Se puede ejecutar varias veces. Prueba: 086_prueba.sql (se deshace sola, acaba en "PRUEBA SUPERADA").
--
-- NO SE BORRA NADA. Cada jugador lleva una marca (players.excluido) y todo lo demas sale de esa marca:
--   1) NO ENTRAN. Con la marca puesta, un disparador banea su cuenta en auth.users (banned_until): Supabase no les deja entrar ni
--      renovar la sesion. Ademas, en la base: is_player() da falso para ellos (todas las politicas de lectura lo usan), cada peticion
--      a la API pasa por gm_pre_request() y les devuelve 403 "Esta cuenta no tiene acceso" (una sesion abierta deja de valer al
--      momento, aunque su token aun no haya caducado), y ningun movimiento de dinero que pidan ellos entra en el ledger.
--   2) NADIE LOS VE. Esquema "visibles": una vista por tabla con jugadores que deja fuera sus filas (apuestas, combinadas, retos en
--      los que esten, chat que los nombre, cajas, batallas, juegos, trofeos, ruleta global, mercado...). Las funciones que ensenan
--      cosas (get_state, get_extras, get_retos, bets_page, rankings, juegos, Liga...) y las que reparten (paga, bote, premios,
--      ruleta global, Discord, avisos al movil) leen con search_path = visibles, public, asi que para ellas no existen. Las que
--      pagan y cierran (settle_match, settle_challenges, sync_close...) siguen viendolo todo: las cuentas no se descuadran.
--      Para lo que la app lee directo de las tablas (Feed, drops, batallas, ruleta de premios...) hay una politica RESTRICTIVA
--      gm_excluidos con la misma condicion, que tambien vale para lo que llega por Realtime (jg_feed, chat).
--   3) SU DINERO SE QUEDA COMO ESTA. No se devuelve ni se paga nada al marcarlos. Hoy (08-11) no tienen ninguna apuesta, combinada,
--      reto, batalla ni cara o cruz abiertos. Si les quedara algo abierto, se cerraria por las reglas de siempre sin que nadie lo vea.
--      Mientras esten fuera no cobran paga, no ponen al bote, no entran en la ruleta global ni en los premios de la semana.
--
-- DESHACER (vuelven a entrar y a verse tal cual estaban; el disparador les quita el baneo):
--   update players set excluido = false where username in ('sebas', 'petyyy', 'tony', 'isaac', 'counter');
--
-- OJO PARA LO QUE VENGA DESPUES:
--   * Las vistas de "visibles" copian las columnas de cada tabla al crearse. Un SQL que anada columnas a una tabla con jugadores, o
--     que vuelva a crear (create or replace) una de las funciones de gm_visibles_funcs, tiene que acabar con:
--         select gm_visibles_rehacer();
--     (rehace las vistas y las politicas y vuelve a poner el search_path; si no, la funcion veria a los excluidos o fallaria).
--   * Las pruebas *_prueba.sql que cogen jugadores reales tienen que coger jugadores con excluido = false.

alter table players add column if not exists excluido boolean not null default false;

create schema if not exists visibles;
revoke all on schema visibles from public;
do $$ begin
  execute 'revoke all on schema visibles from anon, authenticated';
exception when others then null;
end $$;

-- ---------- quien esta fuera ----------
create or replace function gm_ocultos() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(id), '{}') from players where excluido
$$;

create or replace function gm_oculto(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p is not null and exists (select 1 from players where id = p and excluido)
$$;

-- avisos de la app (chat sin jugador) que nombran a alguno: "Tony gano 500...", "Resumen de la semana: Sebas ...".
-- "Counter Blox" (un caballo) y "Counter-Strike" no cuentan como Counter.
create or replace function gm_patron_ocultos() returns text
language sql stable security definer set search_path = public as $$
  select '\m(' || string_agg(regexp_replace(name, '([^[:alnum:]])', '\\\1', 'g'), '|') || ')\M(?![-[:space:]]*(Blox|Strike))'
    from players where excluido and length(name) >= 3
$$;

create or replace function gm_reto_oculto(p_id bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select cardinality(gm_ocultos()) > 0 and (
    exists (select 1 from challenges c where c.id = p_id and (c.from_player = any(gm_ocultos()) or c.to_player = any(gm_ocultos())))
    or exists (select 1 from challenge_players cp where cp.challenge_id = p_id and cp.player = any(gm_ocultos())))
$$;

create or replace function gm_batalla_oculta(p_id bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select cardinality(gm_ocultos()) > 0 and (
    exists (select 1 from cs_battles b where b.id = p_id and b.created_by = any(gm_ocultos()))
    or exists (select 1 from cs_battle_seats s where s.battle_id = p_id and s.player = any(gm_ocultos())))
$$;

create or replace function gm_combo_oculto(p_id bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select cardinality(gm_ocultos()) > 0 and exists (select 1 from combos c where c.id = p_id and c.player = any(gm_ocultos()))
$$;

create or replace function gm_jackpot_oculto(p_id bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select cardinality(gm_ocultos()) > 0 and (
    exists (select 1 from mk_jackpot j where j.id = p_id and j.winner = any(gm_ocultos()))
    or exists (select 1 from mk_jackpot_ent e where e.jackpot_id = p_id and e.player = any(gm_ocultos())))
$$;

grant execute on function gm_ocultos(), gm_oculto(uuid), gm_patron_ocultos(), gm_reto_oculto(bigint), gm_batalla_oculta(bigint),
  gm_combo_oculto(bigint), gm_jackpot_oculto(bigint) to authenticated;

-- ---------- que tablas se filtran y como (la misma condicion para la vista y para la politica) ----------
-- cond: la condicion de la vista (lo que ven las funciones); cond_rls: si hace falta otra para leer la tabla directa (null = la misma)
create table if not exists gm_visibles_tablas (tabla text primary key, cond text not null, cond_rls text);
alter table gm_visibles_tablas add column if not exists cond_rls text;
create table if not exists gm_visibles_funcs (nombre text primary key);
alter table gm_visibles_tablas enable row level security;
alter table gm_visibles_funcs enable row level security;

insert into gm_visibles_tablas(tabla, cond)
select t, 'coalesce(player <> all ((select public.gm_ocultos())::uuid[]), true)'
  from unnest(array['app_time', 'avisos', 'bets', 'bjm_asiento', 'bjm_mano', 'combos', 'cos_equip', 'cs_owned', 'cs_upgrades', 'ex_pred',
                    'ex_trofeos', 'ex_vitrina', 'jg_bj', 'jg_carrera_apuestas', 'jg_crash_apuestas', 'jg_feed', 'jg_minas', 'jg_plinko',
                    'jg_ruleta_apuestas', 'ledger', 'mk_contratos', 'mk_jackpot_ent', 'pass_log', 'pass_visible', 'poll_votes', 'polls',
                    'push_subs', 'reactions', 'ruleta_global', 'wheel_spins']) t
on conflict (tabla) do update set cond = excluded.cond;
insert into gm_visibles_tablas(tabla, cond) values
  ('players', 'not excluido'),
  ('chat', 'coalesce(player <> all ((select public.gm_ocultos())::uuid[]), true) and not coalesce(body ~ (select public.gm_patron_ocultos()), false)'),
  ('challenges', 'not public.gm_reto_oculto(id)'),
  ('challenge_players', 'not public.gm_reto_oculto(challenge_id)'),
  ('combo_legs', 'not public.gm_combo_oculto(combo_id)'),
  ('cs_inv', 'coalesce(player <> all ((select public.gm_ocultos())::uuid[]), true) and coalesce(opened_by <> all ((select public.gm_ocultos())::uuid[]), true)'),
  ('cs_battles', 'not public.gm_batalla_oculta(id)'),
  ('cs_battle_seats', 'not public.gm_batalla_oculta(battle_id)'),
  ('cs_battle_drops', 'not public.gm_batalla_oculta(battle_id)'),
  ('jg_moneda', 'coalesce(creador <> all ((select public.gm_ocultos())::uuid[]), true) and coalesce(para <> all ((select public.gm_ocultos())::uuid[]), true)'
             || ' and coalesce(rival <> all ((select public.gm_ocultos())::uuid[]), true) and coalesce(ganador <> all ((select public.gm_ocultos())::uuid[]), true)'),
  ('mk_tratos', 'coalesce(de <> all ((select public.gm_ocultos())::uuid[]), true) and coalesce(para <> all ((select public.gm_ocultos())::uuid[]), true)'),
  ('mk_ventas', 'coalesce(vendedor <> all ((select public.gm_ocultos())::uuid[]), true) and coalesce(comprador <> all ((select public.gm_ocultos())::uuid[]), true)'),
  ('mk_jackpot', 'not public.gm_jackpot_oculto(id)')
on conflict (tabla) do update set cond = excluded.cond;
-- la ruleta global guarda en "jugadores" a todos los que estaban en la rueda: ruleta_global() los quita de la lista, pero quien leyera
-- la tabla directa los veria, asi que esas semanas no se leen directas (la app no la lee directa)
update gm_visibles_tablas set cond_rls = cond || ' and not coalesce(jugadores && (select public.gm_ocultos())::uuid[], false)'
 where tabla = 'ruleta_global';

-- funciones que leen sin ellos. NO van aqui las que pagan o cierran (settle_*, sync_close, *_tick, *_cerrar...): esas lo ven todo.
insert into gm_visibles_funcs(nombre)
select unnest(array[
  -- lo que ensena la app
  'get_state', 'get_extras', 'get_retos', 'bets_page', 'time_status', 'paga_estado', 'jg_ranking', 'jg_ultimas', 'jg_resumen',
  'carrera_estado', 'carrera_mejores', 'carrera_ronda_j', 'ruleta_estado', 'ruleta_ronda_j', 'ruleta_global', 'crash_estado',
  'moneda_estado', 'minas_estado', 'bjm_estado', 'bjm_vista', 'bj_estado', 'cs_state', 'cs_battle', 'cs_case', 'cs_cases',
  'cs_giro_info', 'cs_items_info', 'cs_upgrade_targets', 'mk_estado', 'mk_inv', 'mk_jackpot_j', 'mk_invs_j', 'cos_equipados',
  'cos_estado', 'ex_estado', 'ex_mis_skins', 'ex_pred_estado', 'ex_vitrinas', 'push_estado', 'admin_pass_ver', 'admin_pass_log',
  'live_quote', 'combo_cash_quotes', 'cash_out_quotes', 'cash_out_quote', 'jg_yo',
  -- lo que se hace CONTRA otro jugador: con ellos fuera, "ese jugador no existe"
  'challenge_create', 'moneda_crear', 'mk_trato_crear', 'admin_pass_set', 'admin_reset_pass',
  -- lo que reparte o avisa: sin paga, bote, ruleta global, premios, Discord ni avisos al movil para ellos o sobre ellos
  'pay_week', 'bote_semanal', 'ruleta_global_sortea', 'ex_trofeos_apunta', 'aviso_ranking_revisa', 'sync_discord_get',
  'sync_avisos_pendientes'])
on conflict (nombre) do nothing;

-- rehace las vistas, las politicas restrictivas y el search_path de las funciones. Se puede llamar cuantas veces haga falta.
-- Cada vista lleva un cast implicito a su tabla: las funciones que reciben una fila (cs_inv_j(cs_inv), minas_vista(jg_minas),
-- ex_cash_value(bets, matches)...) aceptan asi la fila de la vista sin tocarlas.
create or replace function gm_visibles_rehacer() returns int
language plpgsql security definer set search_path = public as $$
declare t record; f record; n int := 0;
begin
  for t in select * from gm_visibles_tablas order by tabla loop
    if to_regclass('public.' || t.tabla) is null then continue; end if;
    execute format('drop view if exists visibles.%I cascade', t.tabla);
    execute format('create view visibles.%I as select * from public.%I where %s', t.tabla, t.tabla, t.cond);
    execute format('create cast (visibles.%I as public.%I) with inout as implicit', t.tabla, t.tabla);
    execute format('drop policy if exists gm_excluidos on public.%I', t.tabla);
    -- solo en las tablas que la app puede leer (con alguna politica de lectura); las cerradas (blackjack, avisos...) siguen sin ninguna
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t.tabla and permissive = 'PERMISSIVE') then
      execute format('create policy gm_excluidos on public.%I as restrictive for select to authenticated using (%s)', t.tabla, coalesce(t.cond_rls, t.cond));
    end if;
    n := n + 1;
  end loop;
  for f in select p.oid::regprocedure as sig,
                  coalesce((select substr(c, 13) from unnest(p.proconfig) c where c like 'search_path=%'), 'public') as sp
             from pg_proc p join pg_namespace s on s.oid = p.pronamespace
            where s.nspname = 'public' and p.proname in (select nombre from gm_visibles_funcs) loop
    if f.sp !~ '(^|[ ,])visibles([ ,]|$)' then
      execute format('alter function %s set search_path = visibles, %s', f.sig, f.sp);
    end if;
  end loop;
  return n;
end $$;
revoke all on function gm_visibles_rehacer() from public;
do $$ begin
  execute 'revoke all on function gm_visibles_rehacer() from anon, authenticated';
exception when others then null;
end $$;

-- ---------- no entran ----------
create or replace function is_player() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from players where id = auth.uid() and not excluido)
$$;
grant execute on function is_player() to authenticated;

-- cada peticion a la API (PostgREST) pasa por aqui antes de nada: con la cuenta fuera, 403 y ese texto (la app lo ensena al entrar)
create or replace function gm_pre_request() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is not null and exists (select 1 from players where id = auth.uid() and excluido) then
    raise sqlstate 'PT403' using message = 'Esta cuenta no tiene acceso';
  end if;
end $$;
grant execute on function gm_pre_request() to public;
do $$ begin
  execute 'alter role authenticator set pgrst.db_pre_request = ''public.gm_pre_request''';
  perform pg_notify('pgrst', 'reload config');
exception when others then
  raise notice 'No se pudo poner gm_pre_request en la API (%). Lo demas sigue valiendo: baneo, is_player, ledger.', sqlerrm;
end $$;

-- ni con una sesion vieja se mueve dinero: nada que pida una cuenta excluida entra en el ledger
create or replace function gm_trg_ledger_excluido() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and exists (select 1 from players where id = auth.uid() and excluido) then
    raise exception 'Esta cuenta no tiene acceso';
  end if;
  return new;
end $$;
drop trigger if exists gm_ledger_excluido on ledger;
create trigger gm_ledger_excluido before insert on ledger for each row execute function gm_trg_ledger_excluido();

-- la marca banea o desbanea la cuenta de Supabase (no puede entrar ni renovar la sesion). Si auth no se deja tocar, avisa y sigue.
create or replace function gm_trg_excluido_auth() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    update auth.users set banned_until = case when new.excluido then '2999-12-31 00:00:00+00'::timestamptz end where id = new.id;
  exception when others then
    raise notice 'No se pudo banear la cuenta en auth.users (%). Lo demas sigue valiendo.', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists gm_excluido_auth on players;
create trigger gm_excluido_auth after insert or update of excluido on players
  for each row when (new.excluido) execute function gm_trg_excluido_auth();
drop trigger if exists gm_readmitido_auth on players;
create trigger gm_readmitido_auth after update of excluido on players
  for each row when (old.excluido and not new.excluido) execute function gm_trg_excluido_auth();

-- ---------- la ruleta global: sin ellos en la rueda y con el gajo del ganador bien puesto ----------
-- (como 047, pero los jugadores salen de la vista y idx se cuenta sobre los que quedan; si gano uno de ellos, la fila ni se ve)
create or replace function ruleta_global() returns jsonb
language plpgsql security definer set search_path = visibles, public as $$
declare r ruleta_global; wk date := madrid_week(); js jsonb; i int;
begin
  if not is_player() then raise exception 'Tienes que entrar primero'; end if;
  select * into r from ruleta_global order by week desc limit 1;
  if r.week is not null then
    select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'ini', p.ini, 'color', p.color) order by x.o), '[]')
      into js
      from unnest(r.jugadores) with ordinality x(id, o) join players p on p.id = x.id;
    select n - 1 into i from (select x.id, row_number() over (order by x.o) n
                                from unnest(r.jugadores) with ordinality x(id, o) join players p on p.id = x.id) q where q.id = r.player;
  end if;
  return jsonb_build_object(
    'week', wk,
    'desde', (select value #>> '{}' from settings where key = 'ruleta_global_desde'),
    'amount', coalesce((select (value #>> '{}')::int from settings where key = 'ruleta_global_amount'), 1000),
    'ultima', case when r.week is null then null else jsonb_build_object(
      'week', r.week, 'player', r.player, 'idx', coalesce(i, r.idx), 'seed', r.seed, 'amount', r.amount, 'at', r.created_at,
      'jugadores', js) end,
    'antes', (select coalesce(jsonb_agg(jsonb_build_object('week', g.week, 'player', g.player, 'amount', g.amount) order by g.week desc), '[]')
                from (select week, player, amount from ruleta_global where week < coalesce(r.week, wk) order by week desc limit 8) g));
end $$;
revoke all on function ruleta_global() from public;
do $$ begin
  execute 'revoke all on function ruleta_global() from anon';
exception when others then null;
end $$;
grant execute on function ruleta_global() to authenticated;

-- ---------- el monedero de cada uno: sus apuntes viejos no los nombran ("Reto de Tony: FaZe" sale "Reto de un amigo: FaZe") ----------
-- (el apunte y el dinero no cambian: solo el texto que llega a la app)
create or replace function gm_tapa(t text) returns text
language plpgsql stable security definer set search_path = public as $$
declare pat text := gm_patron_ocultos();
begin
  if t is null or pat is null then return t; end if;
  return regexp_replace(t, pat, 'un amigo', 'g');
end $$;
grant execute on function gm_tapa(text) to authenticated;

-- get_state como en 001, con el texto de los apuntes pasado por gm_tapa y leyendo por "visibles"
create or replace function get_state() returns jsonb
language plpgsql security definer set search_path = visibles, public as $$
declare
  me uuid := auth.uid();
  vis text := (select value #>> '{}' from settings where key = 'vis');
  ss date := (select (value #>> '{}')::date from settings where key = 'season_start');
  out jsonb;
begin
  if me is null or not exists (select 1 from players where id = me) then raise exception 'Tienes que entrar primero'; end if;
  perform pay_week();
  select jsonb_build_object(
    'me', me,
    'now', now(),
    'vis', vis,
    'weekly', (select (value #>> '{}')::int from settings where key = 'weekly_amount'),
    'season_start', ss,
    'players', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'username', case when p.id = me then p.username end, 'name', p.name, 'ini', p.ini, 'color', p.color,
        'apodo', p.apodo, 'frase', p.frase, 'photo', p.photo_url, 'favs', p.favs, 'admin', p.is_admin,
        'created', p.created_at,
        'saldo', (select coalesce(sum(amount), 0) from ledger l where l.player = p.id),
        'recibido', (select coalesce(sum(amount), 0) from ledger l where l.player = p.id and l.kind in ('paga','ajuste')),
        -- saldo al cerrar cada semana de la temporada (la ultima es ahora)
        'weeks', (select coalesce(jsonb_agg((select coalesce(sum(amount), 0) from ledger l
                    where l.player = p.id and l.created_at < least(now(), ((w + interval '7 day') at time zone 'Europe/Madrid'))) order by w), '[]')
                  from generate_series(ss::timestamp, madrid_week()::timestamp, interval '7 day') g(w))
      ) order by p.created_at), '[]') from players p),
    'bets', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', b.id, 'player', b.player, 'match', b.match_id,
        'pick', case when vis = 'open' or b.player = me or m.starts_at <= now() or m.status <> 'scheduled' then b.pick end,
        'stake', b.stake, 'odds', b.odds, 'status', b.status, 'payout', b.payout,
        'created', b.created_at, 'settled', b.settled_at
      ) order by b.created_at desc), '[]') from bets b join matches m on m.id = b.match_id),
    'ledger', (select coalesce(jsonb_agg(jsonb_build_object('at', l.created_at, 'kind', l.kind, 'note', gm_tapa(l.note), 'amount', l.amount) order by l.created_at desc, l.id desc), '[]')
               from (select * from ledger where player = me order by created_at desc, id desc limit 60) l)
  ) into out;
  return out;
end $$;
revoke all on function get_state() from public;
do $$ begin
  execute 'revoke all on function get_state() from anon';
exception when others then null;
end $$;
grant execute on function get_state() to authenticated;

-- ---------- fuera: Sebas, Petyyy, Tony, Isaac y Counter ----------
do $$
declare n int;
begin
  update players set excluido = true where username in ('sebas', 'petyyy', 'tony', 'isaac', 'counter') and not excluido;
  select count(*) into n from players where username in ('sebas', 'petyyy', 'tony', 'isaac', 'counter') and excluido;
  if n <> 5 then raise exception 'Esperaba 5 jugadores fuera (sebas, petyyy, tony, isaac, counter) y hay %', n; end if;
end $$;

select gm_visibles_rehacer();
select bump();
