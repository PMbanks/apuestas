-- Prueba de db/077_caballos_fijos.sql (va despues de 073 y 077). Con los jugadores de verdad. Comprueba: la carrera en espera trae los
-- seis caballos fijos en su calle con los nombres de carrera_nombres(), cada uno con su cuota; la primera apuesta abre 12 s; a la hora
-- sale con el orden del hash y paga la cuota al que acierta. Al final lanza un error A PROPOSITO para que se deshaga todo: "PRUEBA SUPERADA".
do $$
declare
  jug uuid[] := array(select id from players order by created_at, id limit 2);
  r jsonb; ca jg_carrera; sc jg_carrera_secreto; v_gana int; v_cuota numeric; i int;
begin
  if cardinality(jug) < 2 then raise exception 'FALLO: hacen falta al menos dos jugadores'; end if;
  perform pay_week();
  insert into ledger(player, amount, kind, note) select p, 10000 - (select coalesce(sum(amount), 0) from ledger where player = p)::int, 'ajuste', 'prueba 077' from unnest(jug) p;
  update jg_carrera set estado = 'pagada' where estado <> 'pagada';
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  r := carrera_estado();
  if jsonb_array_length(r->'ronda'->'caballos') <> 6 then raise exception 'FALLO: no son seis caballos'; end if;
  for i in 1 .. 6 loop
    if r->'ronda'->'caballos'->(i - 1)->>'nombre' <> (carrera_nombres())[i] or (r->'ronda'->'caballos'->(i - 1)->>'n')::int <> i then
      raise exception 'FALLO: la calle % no lleva a % (%)', i, (carrera_nombres())[i], r->'ronda'->'caballos'->(i - 1); end if;
    if (r->'ronda'->'caballos'->(i - 1)->>'cuota')::numeric < 1.05 then raise exception 'FALLO: cuota rara'; end if;
  end loop;
  select * into ca from jg_carrera where id = (r->'ronda'->>'id')::bigint;
  select * into sc from jg_carrera_secreto where ronda = ca.id;
  v_gana := sc.orden[1];
  r := carrera_apostar(v_gana, 100);
  select * into ca from jg_carrera where id = ca.id;
  if ca.estado <> 'apuestas' or ca.cierra < jg_ahora() + interval '10 seconds' or ca.cierra > jg_ahora() + interval '13 seconds' then raise exception 'FALLO: la primera apuesta no abre 12 s (%)', ca.cierra - jg_ahora(); end if;
  update jg_carrera set cierra = jg_ahora() - interval '17 seconds' where id = ca.id;
  r := carrera_estado(); r := carrera_estado();
  select * into ca from jg_carrera where id = ca.id;
  v_cuota := (ca.caballos->(v_gana - 1)->>'cuota')::numeric;
  if ca.estado <> 'pagada' or jg_saldo(jug[1]) <> 10000 - 100 + floor(100 * v_cuota)::int then raise exception 'FALLO: pago de la carrera (%)', jg_saldo(jug[1]); end if;
  if jg_hash(ca.semilla || ':' || array_to_string(ca.orden, ',')) <> ca.hash then raise exception 'FALLO: hash'; end if;
  if not exists (select 1 from jg_feed where player = jug[1] and juego = 'carrera' and stake = 100 and creada > now() - interval '1 minute') then raise exception 'FALLO: la apuesta no salio en jg_feed'; end if;
  if jsonb_array_length(jg_ultimas('carrera')->'jugadas') < 1 or (jg_ultimas('carrera')->'jugadas'->0->>'player')::uuid <> jug[1] then raise exception 'FALLO: jg_ultimas de caballos'; end if;
  r := jg_ultimas('ruleta'); r := jg_ultimas('minas'); r := jg_ultimas('blackjack'); r := jg_ultimas('moneda');
  raise exception 'PRUEBA SUPERADA (se deshace todo): seis caballos fijos con sus nombres y su calle, la primera apuesta abre 12 s, sale con el orden del hash y paga la cuota; la apuesta sale en jg_feed y en jg_ultimas.';
end $$;
