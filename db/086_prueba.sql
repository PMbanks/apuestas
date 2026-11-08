-- Prueba de db/086_excluidos.sql, para el editor SQL de Supabase. Va DESPUES de 086.
-- Todo dentro de un bloque que acaba en error A PROPOSITO, asi que no queda nada. Comprueba con la base de verdad:
--  1) fuera estan exactamente sebas, petyyy, tony, isaac y counter, y sus cuentas de Supabase estan baneadas.
--  2) como PM: get_state, get_extras, get_retos, bets_page, rankings y ultimas jugadas, ruleta global y lo que la app lee directo
--     de las tablas (Feed, ruleta de premios, drops, batallas...) no traen ni un id de los cinco.
--  3) como Tony: is_player es falso, get_state y apostar dan error, gm_pre_request da "Esta cuenta no tiene acceso", no lee ninguna
--     tabla y no puede mover dinero.
--  4) las funciones de "visibles" tienen su search_path y las vistas estan todas.
--  5) la linea de deshacer los devuelve (dentro del bloque, asi que no se queda).
-- Si todo va bien, el error final dice "PRUEBA SUPERADA".
create or replace function pg_temp.yo(u uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  perform set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u::text, 'role', 'authenticated')::text end, true);
end $f$;
-- los ids de los de fuera se leen ANTES de cambiar de rol (como authenticated, players ya no los ensena)
create or replace function pg_temp.limpio(j jsonb, que text) returns void language plpgsql as $f$
declare i uuid;
begin
  foreach i in array string_to_array(current_setting('gm.fuera'), ',')::uuid[] loop
    if position(i::text in coalesce(j::text, '')) > 0 then raise exception 'FALLO: % trae a uno de fuera (%)', que, i; end if;
  end loop;
end $f$;

do $$
declare
  pm uuid := (select id from players where username = 'pm');
  tony uuid := (select id from players where username = 'tony');
  j jsonb; t text; n int; e text; tablas text[] := array['players', 'chat', 'wheel_spins', 'cs_inv', 'cs_battles', 'cs_battle_seats', 'combos',
    'combo_legs', 'jg_feed', 'jg_moneda', 'jg_ruleta_apuestas', 'challenges', 'challenge_players', 'ex_trofeos', 'ex_vitrina', 'polls',
    'reactions', 'ruleta_global', 'cs_upgrades', 'cs_owned', 'cos_equip', 'app_time'];
begin
  perform set_config('gm.fuera', (select string_agg(id::text, ',') from players where excluido), true);
  -- 1) quien esta fuera
  select string_agg(username, ',' order by username) into t from players where excluido;
  if t is distinct from 'counter,isaac,petyyy,sebas,tony' then raise exception 'FALLO: fuera estan %', t; end if;
  begin
    select count(*) into n from auth.users u join players p on p.id = u.id where p.excluido and u.banned_until > now();
    if n <> 5 then raise exception 'FALLO: cuentas baneadas en auth.users: % de 5', n; end if;
  exception when insufficient_privilege then raise notice 'auth.users no se deja leer: el baneo no se ha podido comprobar';
  end;

  -- 2) como PM
  perform pg_temp.yo(pm);
  if not is_player() then raise exception 'FALLO: PM no es jugador'; end if;
  perform pg_temp.limpio(get_state(), 'get_state');
  perform pg_temp.limpio(get_extras(), 'get_extras');
  perform pg_temp.limpio(get_retos(), 'get_retos');
  perform pg_temp.limpio(bets_page(null, null, null, 0, 50), 'bets_page');
  perform pg_temp.limpio(ruleta_global(), 'ruleta_global');
  perform pg_temp.limpio(ex_vitrinas(), 'ex_vitrinas');
  perform pg_temp.limpio(cs_state(null) - 'who', 'cs_state');
  for t in select unnest(array['crash', 'blackjack', 'moneda', 'ruleta', 'minas', 'carrera']) loop
    perform pg_temp.limpio(jg_ranking(t, 'siempre'), 'jg_ranking ' || t);
  end loop;
  for t in select unnest(array['ruleta', 'minas', 'carrera', 'blackjack', 'moneda']) loop
    perform pg_temp.limpio(jg_ultimas(t), 'jg_ultimas ' || t);
  end loop;
  if jsonb_array_length(get_state() -> 'players') <> (select count(*) from players where not excluido) then
    raise exception 'FALLO: get_state no da a todos los que quedan';
  end if;
  -- lo que la app lee directo, como la app (rol authenticated, con RLS)
  set local role authenticated;
  foreach t in array tablas loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]'') from (select * from %I limit 5000) x', t) into j;
    perform pg_temp.limpio(j, 'tabla ' || t);
  end loop;
  select coalesce(jsonb_agg(body), '[]') into j from chat where player is null and body ~ (select gm_patron_ocultos());
  if jsonb_array_length(j) > 0 then raise exception 'FALLO: el Feed nombra a uno de fuera: %', j; end if;
  reset role;

  -- 3) como Tony
  perform pg_temp.yo(tony);
  if is_player() then raise exception 'FALLO: Tony sigue siendo jugador'; end if;
  begin perform get_state(); raise exception 'FALLO: Tony ve get_state'; exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform place_bet((select id from matches where status = 'scheduled' and starts_at > now() order by starts_at limit 1), '1', 1);
        raise exception 'FALLO: Tony puede apostar'; exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin perform gm_pre_request(); raise exception 'FALLO: gm_pre_request deja pasar a Tony';
  exception when others then if sqlerrm <> 'Esta cuenta no tiene acceso' then raise exception 'FALLO: gm_pre_request: %', sqlerrm; end if; end;
  begin insert into ledger(player, amount, kind, note) values (tony, 1, 'ajuste', 'prueba'); raise exception 'FALLO: Tony mueve dinero';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  set local role authenticated;
  foreach t in array tablas || array['ledger', 'bets'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('select count(*) from (select 1 from %I limit 1) x', t) into n;
    if n > 0 then raise exception 'FALLO: Tony lee la tabla %', t; end if;
  end loop;
  reset role;
  perform pg_temp.yo(pm);
  perform gm_pre_request();                                   -- a PM le deja pasar
  perform pg_temp.yo(null);
  perform gm_pre_request();                                   -- y al sincronizador

  -- 4) vistas y search_path
  select count(*) into n from gm_visibles_tablas g where to_regclass('public.' || g.tabla) is not null and to_regclass('visibles.' || g.tabla) is null;
  if n > 0 then raise exception 'FALLO: faltan % vistas en visibles (select gm_visibles_rehacer())', n; end if;
  select string_agg(p.proname, ', ') into t from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname in (select nombre from gm_visibles_funcs)
     and not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=visibles%');
  if t is not null then raise exception 'FALLO: sin search_path visibles: % (select gm_visibles_rehacer())', t; end if;

  -- 5) deshacer
  update players set excluido = false where username in ('sebas', 'petyyy', 'tony', 'isaac', 'counter');
  perform pg_temp.yo(tony);
  if not is_player() then raise exception 'FALLO: al deshacer Tony no vuelve'; end if;
  perform get_state();
  perform pg_temp.yo(pm);
  if jsonb_array_length(get_state() -> 'players') <> (select count(*) from players) then raise exception 'FALLO: al deshacer no vuelven todos'; end if;
  perform pg_temp.yo(null);

  raise exception 'PRUEBA SUPERADA: fuera sebas, petyyy, tony, isaac y counter; nadie los ve, no entran ni mueven dinero, y se deshace con una linea';
end $$;
