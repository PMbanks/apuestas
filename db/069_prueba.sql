-- Prueba de db/069_apuestas_visibles.sql, para el editor SQL de Supabase. Va DESPUES de 069.
-- Crea un partido de prueba que empieza manana, el jugador 1 le apuesta y el jugador 2 mira: get_state y bets_page tienen que darle al 2
-- la eleccion del 1 (antes, con vis = 'kick', salia null hasta empezar). Comprueba tambien que vis = 'open' y que nadie (ni el admin)
-- puede volver a ponerlo en 'kick'. Al final lanza un error A PROPOSITO para que se deshaga todo. Si todo va bien: "PRUEBA SUPERADA".
create or replace function pg_temp.yo(u uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  perform set_config('request.jwt.claims', json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
end $f$;

do $$
declare
  jug uuid[] := array(select id from players order by created_at, username);
  adm uuid := (select id from players where is_admin order by created_at limit 1);
  a uuid; b uuid; bid bigint; r jsonb; x jsonb; err text; resumen text := '';
begin
  if cardinality(jug) < 2 then raise exception 'FALLO: hacen falta dos jugadores'; end if;
  a := jug[1]; b := jug[2];
  if (select value #>> '{}' from settings where key = 'vis') <> 'open' then raise exception 'FALLO: settings.vis no es open'; end if;

  insert into matches(id, sport, league, league_name, home, away, starts_at, odds_1, odds_x, odds_2)
    values ('prueba-069', 'f', 'prueba', 'Liga de prueba', 'Local Prueba', 'Visitante Prueba', now() + interval '1 day', 2.10, 3.30, 3.40);
  insert into bets(player, match_id, pick, stake, odds) values (a, 'prueba-069', '2', 37, 3.40) returning id into bid;

  -- el 2 mira con get_state: ve el '2' del 1, el importe y la cuota
  perform pg_temp.yo(b);
  r := get_state();
  select e into x from jsonb_array_elements(r->'bets') e where (e->>'id')::bigint = bid;
  if x is null then raise exception 'FALLO: get_state no trae la apuesta de prueba'; end if;
  if x->>'pick' is distinct from '2' or (x->>'stake')::int <> 37 or (x->>'odds')::numeric <> 3.40 then
    raise exception 'FALLO: get_state le esconde al 2 la apuesta del 1 antes de empezar: %', x;
  end if;
  resumen := resumen || 'get_state: el 2 ve la eleccion del 1 antes de empezar. ';

  -- y con bets_page (Todas las apuestas)
  r := bets_page(a, null, null, 0, 50);
  select e into x from jsonb_array_elements(r->'rows') e where (e->>'id')::bigint = bid;
  if x is null or x->>'pick' is distinct from '2' then raise exception 'FALLO: bets_page esconde la eleccion: %', x; end if;
  resumen := resumen || 'bets_page tambien. ';

  -- nadie puede volver a esconderlas
  if adm is not null then
    perform pg_temp.yo(adm);
    begin
      perform admin_set('vis', '"kick"');
      raise exception 'FALLO: el admin ha podido volver a ocultar las apuestas';
    exception when others then get stacked diagnostics err = message_text;
      if err like 'FALLO%' then raise exception '%', err; end if;
    end;
    if (select value #>> '{}' from settings where key = 'vis') <> 'open' then raise exception 'FALLO: vis ha cambiado'; end if;
    resumen := resumen || 'admin_set(vis, kick) rechazado: "' || err || '". ';
  end if;

  raise exception 'PRUEBA SUPERADA: %', resumen;
end $$;
