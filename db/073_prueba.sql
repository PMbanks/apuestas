-- Prueba de db/073_juegos_nuevos.sql, para el editor SQL de Supabase (va despues de 073). Con los jugadores de verdad (hacen falta dos).
-- Comprueba: (1) plinko ya no existe; (2) ruleta: dos jugadores en la misma ronda, el hash cuadra con la semilla y el numero, al
-- acabar el giro se paga x2 / x14 solo a quien acerto y no se cobra dos veces; (3) minas: el hash cuadra con las minas, abrir una
-- casilla buena sube el multiplicador con la formula, retirar paga stake x mult, pisar una mina pierde y no se puede retirar sin
-- abrir ninguna; las minas no se ven mientras se juega; (4) carrera: seis caballos con cuotas, la primera apuesta abre 30 s, a la
-- hora sale con el orden del hash, paga stake x cuota al que acerto el ganador, y aparece una carrera nueva en espera.
-- Al final lanza un error A PROPOSITO para que se deshaga todo: "PRUEBA SUPERADA".
do $$
declare
  jug uuid[] := array(select id from players order by created_at, id limit 2);
  r jsonb; ru jg_ruleta; sr jg_ruleta_secreto; g jg_minas; sm jg_minas_secreto; c int; k int; v_m numeric; ca jg_carrera; sc jg_carrera_secreto;
  b1 int; b2 int; v_gana int; v_otro int; v_cuota numeric; v_pago int;
begin
  if cardinality(jug) < 2 then raise exception 'FALLO: hacen falta al menos dos jugadores'; end if;
  perform pay_week();
  insert into ledger(player, amount, kind, note) select p, 10000 - (select coalesce(sum(amount), 0) from ledger where player = p)::int, 'ajuste', 'prueba 073' from unnest(jug) p;

  -- 1) plinko fuera
  if exists (select 1 from pg_proc where proname in ('plinko_soltar', 'plinko_estado')) then raise exception 'FALLO: plinko sigue en la base'; end if;

  -- 2) ruleta compartida
  update jg_ruleta set estado = 'pagada' where estado <> 'pagada';                   -- por si quedaba una vieja a medias
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  r := ruleta_apostar('rojo', 100);
  r := ruleta_apostar('verde', 10);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[2]), true);
  r := ruleta_apostar('negro', 200);
  select * into ru from jg_ruleta order by id desc limit 1;
  if (select count(*) from jg_ruleta_apuestas where ronda = ru.id) <> 3 then raise exception 'FALLO: las tres apuestas tenian que ir a la misma ronda'; end if;
  r := ruleta_estado();
  if r->'ronda'->>'n' is not null or r->'ronda'->>'semilla' is not null then raise exception 'FALLO: el numero se ve antes de girar'; end if;
  if r->'ronda'->>'hash' is null then raise exception 'FALLO: la ronda no lleva hash'; end if;
  if jg_saldo(jug[1]) <> 9890 or jg_saldo(jug[2]) <> 9800 then raise exception 'FALLO: no se cobro lo apostado (% %)', jg_saldo(jug[1]), jg_saldo(jug[2]); end if;
  update jg_ruleta set cierra = jg_ahora() - interval '1 second' where id = ru.id;
  r := ruleta_estado();
  if r->'ronda'->>'estado' <> 'giro' then raise exception 'FALLO: la ruleta no gira a la hora (%)', r->'ronda'->>'estado'; end if;
  select * into sr from jg_ruleta_secreto where ronda = ru.id;
  if jg_hash((r->'ronda'->>'semilla') || ':' || (r->'ronda'->>'n')) <> r->'ronda'->>'hash' then raise exception 'FALLO: el hash de la ruleta no cuadra'; end if;
  begin r := ruleta_apostar('rojo', 5); raise exception 'FALLO: se pudo apostar con la ruleta girando'; exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  update jg_ruleta set cierra = jg_ahora() - interval '9 seconds' where id = ru.id;
  r := ruleta_estado(); r := ruleta_estado();                                          -- dos veces: no paga dos veces
  select * into ru from jg_ruleta where id = ru.id;
  if ru.estado <> 'pagada' then raise exception 'FALLO: la ruleta no paga al acabar el giro'; end if;
  b1 := 9890 + case ru.color when 'rojo' then 200 when 'verde' then 140 else 0 end;
  b2 := 9800 + case ru.color when 'negro' then 400 else 0 end;
  if jg_saldo(jug[1]) <> b1 or jg_saldo(jug[2]) <> b2 then raise exception 'FALLO: pagos de la ruleta (salio % %): % % en vez de % %', ru.n, ru.color, jg_saldo(jug[1]), jg_saldo(jug[2]), b1, b2; end if;
  insert into ledger(player, amount, kind, note) select p, 10000 - jg_saldo(p), 'ajuste', 'prueba 073' from unnest(jug) p;

  -- 3) minas
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  delete from jg_minas where player = jug[1] and estado = 'curso';
  r := minas_empezar(100, 3);
  if r->'partida'->'mapa' <> 'null'::jsonb or r->'partida'->>'semilla' is not null then raise exception 'FALLO: las minas se ven al empezar'; end if;
  begin r := minas_cobrar(); raise exception 'FALLO: se pudo retirar sin abrir nada'; exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  begin r := minas_empezar(100, 3); raise exception 'FALLO: dos partidas de minas a la vez'; exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  select * into g from jg_minas where player = jug[1] and estado = 'curso';
  select * into sm from jg_minas_secreto where partida = g.id;
  if jg_hash(sm.semilla || ':' || array_to_string(sm.mapa, ',')) <> g.hash or cardinality(sm.mapa) <> 3 then raise exception 'FALLO: hash o minas de la partida'; end if;
  -- abre dos casillas buenas
  k := 0;
  for c in 0 .. 24 loop
    exit when k = 2;
    if not c = any(sm.mapa) then r := minas_abrir(c); k := k + 1; if (r->>'mina')::boolean then raise exception 'FALLO: una casilla buena dio mina'; end if; end if;
  end loop;
  v_m := floor(0.97 * (25.0 / 22) * (24.0 / 21) * 100) / 100;
  if (r->'partida'->>'mult')::numeric <> v_m or minas_mult(3, 2) <> v_m then raise exception 'FALLO: multiplicador de minas % en vez de %', r->'partida'->>'mult', v_m; end if;
  r := minas_cobrar();
  if jg_saldo(jug[1]) <> 10000 - 100 + floor(100 * v_m)::int then raise exception 'FALLO: retirar en minas paga mal (%)', jg_saldo(jug[1]); end if;
  if r->'partida'->'mapa' = 'null'::jsonb then raise exception 'FALLO: al acabar no se ven las minas'; end if;
  -- otra partida: pisa una mina
  r := minas_empezar(50, 24);
  select * into sm from jg_minas_secreto where partida = (r->'partida'->>'id')::bigint;
  r := minas_abrir(sm.mapa[1]);
  if not (r->>'mina')::boolean or r->'partida'->>'estado' <> 'perdida' then raise exception 'FALLO: pisar una mina no pierde'; end if;
  if jg_saldo(jug[1]) <> 10000 - 100 + floor(100 * v_m)::int - 50 then raise exception 'FALLO: la mina devolvio algo'; end if;
  if minas_mult(24, 1) <> 24.25 or minas_mult(1, 1) <> 1.01 or minas_mult(5, 20) <> 1000 then raise exception 'FALLO: tabla de minas % % %', minas_mult(24, 1), minas_mult(1, 1), minas_mult(5, 20); end if;
  insert into ledger(player, amount, kind, note) select p, 10000 - jg_saldo(p), 'ajuste', 'prueba 073' from unnest(jug) p;

  -- 4) carrera
  update jg_carrera set estado = 'pagada' where estado <> 'pagada';
  r := carrera_estado();
  if r->'ronda'->>'estado' <> 'espera' or jsonb_array_length(r->'ronda'->'caballos') <> 6 then raise exception 'FALLO: no hay carrera en espera con seis caballos'; end if;
  if r->'ronda'->'orden' <> 'null'::jsonb then raise exception 'FALLO: el orden se ve antes de salir'; end if;
  select * into ca from jg_carrera where id = (r->'ronda'->>'id')::bigint;
  select * into sc from jg_carrera_secreto where ronda = ca.id;
  v_gana := sc.orden[1]; v_otro := sc.orden[2];
  if (select count(distinct x) from unnest(sc.orden) x) <> 6 then raise exception 'FALLO: el orden de llegada no tiene seis caballos distintos'; end if;
  r := carrera_apostar(v_gana, 100);                                                -- el primero acierta
  select * into ca from jg_carrera where id = ca.id;
  if ca.estado <> 'apuestas' or ca.cierra < jg_ahora() + carrera_t_apuestas() - interval '5 seconds' then raise exception 'FALLO: la primera apuesta no abre su plazo'; end if;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[2]), true);
  r := carrera_apostar(v_otro, 300);                                                -- el segundo no
  update jg_carrera set cierra = jg_ahora() - interval '1 second' where id = ca.id;
  r := carrera_estado();
  if r->'ronda'->>'estado' <> 'corre' then raise exception 'FALLO: la carrera no sale a la hora (%)', r->'ronda'->>'estado'; end if;
  if jg_hash((r->'ronda'->>'semilla') || ':' || array_to_string(array(select jsonb_array_elements_text(r->'ronda'->'orden')), ',')) <> r->'ronda'->>'hash' then raise exception 'FALLO: el hash de la carrera no cuadra'; end if;
  begin r := carrera_apostar(1, 5); raise exception 'FALLO: se pudo apostar con la carrera en marcha'; exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;
  update jg_carrera set cierra = jg_ahora() - interval '17 seconds' where id = ca.id;
  r := carrera_estado(); r := carrera_estado();
  select * into ca from jg_carrera where id = ca.id;
  if ca.estado <> 'pagada' then raise exception 'FALLO: la carrera no paga al acabar'; end if;
  v_cuota := (ca.caballos->(v_gana - 1)->>'cuota')::numeric; v_pago := floor(100 * v_cuota)::int;
  if jg_saldo(jug[1]) <> 10000 - 100 + v_pago or jg_saldo(jug[2]) <> 10000 - 300 then raise exception 'FALLO: pagos de la carrera: % % (cuota %)', jg_saldo(jug[1]), jg_saldo(jug[2]), v_cuota; end if;
  if r->'ronda'->>'estado' <> 'espera' or (r->'ronda'->>'id')::bigint = ca.id or (r->'ultima'->>'id')::bigint <> ca.id then raise exception 'FALLO: tras la carrera no hay otra en espera'; end if;
  -- las cuotas devuelven un 95 %: suma de 0,95/cuota cerca de 1
  if (select sum(0.95 / (x->>'cuota')::numeric) from jsonb_array_elements(ca.caballos) x) not between 0.98 and 1.03 then raise exception 'FALLO: las cuotas no suman bien'; end if;

  -- 5) ranking y resumen con los juegos nuevos
  r := jg_ranking('minas', 'siempre'); r := jg_ranking('carrera', 'semana'); r := jg_ranking('ruleta', 'siempre');
  r := jg_resumen();
  if not (r ? 'carrera' and r ? 'minas') then raise exception 'FALLO: jg_resumen sin los juegos nuevos'; end if;

  raise exception 'PRUEBA SUPERADA (se deshace todo): plinko fuera; ruleta con dos jugadores en la misma ronda, hash comprobado, paga x2/x14 una vez; minas con hash, multiplicador 0,97 x C(25,k)/C(25-m,k), retirar y pisar mina bien; carrera de seis caballos, abre 30 s, sale con el orden del hash, paga la cuota al que acierta y deja otra en espera.';
end $$;
