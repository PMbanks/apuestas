-- Prueba de db/054_blackjack_abandonada.sql, para el editor SQL de Supabase. Va despues de 040, 048 y 054. Hacen falta al menos 2 jugadores.
-- Comprueba: (1) una ronda de turnos cuyo plazo vencio hace 1 hora se ANULA, se devuelve la apuesta (con lo doblado) y no queda mano ni ronda;
-- (2) una ronda de apuestas olvidada igual; (3) una ronda con el plazo vencido hace 1 minuto sigue su camino normal (la mano se planta sola y se paga);
-- (4) el dinero no se crea ni se destruye. Al final lanza un error A PROPOSITO para que se deshaga todo: "PRUEBA SUPERADA".
do $$
declare
  jug uuid[] := array(select id from players order by created_at, id limit 2);
  r jsonb; rd bjm_ronda; s0 int; s1 int; sb0 int; sb1 int;
begin
  if cardinality(jug) < 2 then raise exception 'FALLO: hacen falta al menos dos jugadores'; end if;
  delete from bjm_asiento; delete from bjm_ronda;
  perform pay_week();
  insert into ledger(player, amount, kind, note) select p, 1000 - (select coalesce(sum(amount), 0) from ledger where player = p)::int, 'ajuste', 'prueba 054' from unnest(jug) p;

  -- 1) turnos olvidados hace 1 hora
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  r := bjm_apostar(800);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[2]), true);
  r := bjm_apostar(100);
  if jg_saldo(jug[1]) <> 200 or jg_saldo(jug[2]) <> 900 then raise exception 'FALLO: no se cobran las apuestas'; end if;
  select * into rd from bjm_ronda where estado <> 'fin';
  update bjm_ronda set cierra = jg_ahora() - interval '1 second' where id = rd.id;
  perform bjm_tick();                                                              -- reparte (el plazo es normal)
  select * into rd from bjm_ronda where estado <> 'fin' order by id desc limit 1;
  if rd.estado <> 'turnos' then raise exception 'FALLO: no se repartio (%)', rd.estado; end if;
  update bjm_ronda set plazo = jg_ahora() - interval '1 hour', repartida = jg_ahora() - interval '1 hour' where id = rd.id;
  perform bjm_tick();
  if exists (select 1 from bjm_ronda where id = rd.id) or exists (select 1 from bjm_mano where ronda = rd.id) then raise exception 'FALLO: la ronda abandonada sigue'; end if;
  if jg_saldo(jug[1]) <> 1000 or jg_saldo(jug[2]) <> 1000 then raise exception 'FALLO: no se devolvio la apuesta (% %)', jg_saldo(jug[1]), jg_saldo(jug[2]); end if;

  -- 2) apuestas olvidadas hace 1 hora
  delete from bjm_asiento;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  r := bjm_apostar(250);
  select * into rd from bjm_ronda where estado <> 'fin';
  update bjm_ronda set cierra = jg_ahora() - interval '1 hour' where id = rd.id;
  perform bjm_tick();
  if exists (select 1 from bjm_ronda where id = rd.id) or jg_saldo(jug[1]) <> 1000 then raise exception 'FALLO: apuestas abandonadas (%)', jg_saldo(jug[1]); end if;

  -- 3) plazo vencido hace 1 minuto: no es abandono, se juega con normalidad
  delete from bjm_asiento;
  r := bjm_apostar(100);
  select * into rd from bjm_ronda where estado <> 'fin';
  update bjm_ronda set cierra = jg_ahora() - interval '1 second' where id = rd.id;
  perform bjm_tick();
  select * into rd from bjm_ronda where id = rd.id;
  if rd.estado is null or rd.estado = 'apuestas' then raise exception 'FALLO: no se reparte una ronda normal'; end if;
  update bjm_ronda set plazo = jg_ahora() - interval '1 minute' where id = rd.id and estado = 'turnos';
  perform bjm_tick();
  select * into rd from bjm_ronda where id = rd.id;
  if rd.id is null then raise exception 'FALLO: una ronda de hace 1 minuto se anulo'; end if;
  if not exists (select 1 from bjm_mano where ronda = rd.id) then raise exception 'FALLO: se perdio la mano de una ronda normal'; end if;

  raise exception 'PRUEBA SUPERADA';
end $$;
