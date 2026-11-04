-- Prueba de db/083_carrera_mejores.sql. Mete carreras y apuestas de mentira, mira lo que devuelve carrera_mejores y al final lanza un
-- error A PROPOSITO para que se deshaga todo: "PRUEBA SUPERADA". No toca el ledger ni el dinero de nadie.
do $$
declare
  j1 uuid; j2 uuid; j3 uuid; r1 bigint; r2 bigint; r3 bigint; r4 bigint; v jsonb; x jsonb; n0 int; antes int;
  cab jsonb := '[{"n":1,"nombre":"Nasdaq","color":"#f2c14e","color2":"#1d2129","cuota":2.50},{"n":2,"nombre":"Counter Blox","color":"#4d88e6","color2":"#f4f2ec","cuota":4.00},
                 {"n":3,"nombre":"Trans","color":"#e0574f","color2":"#1d2129","cuota":9.50},{"n":4,"nombre":"Travis","color":"#2bd47d","color2":"#0f3d26","cuota":3.00},
                 {"n":5,"nombre":"Bad Bunny","color":"#9a7ce8","color2":"#f2c14e","cuota":12.00},{"n":6,"nombre":"Stop Loss","color":"#ff8fb1","color2":"#4d88e6","cuota":7.00}]';
begin
  select id into j1 from players order by created_at, id limit 1;
  select id into j2 from players order by created_at, id offset 1 limit 1;
  select id into j3 from players order by created_at, id offset 2 limit 1;
  if j3 is null then raise exception 'FALLO: hacen falta 3 jugadores'; end if;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', j1), true);
  select coalesce(sum(amount), 0) into antes from ledger;
  -- quitar las carreras que haya para medir solo las de la prueba (se deshace al final)
  delete from jg_carrera;

  -- cuatro carreras pagadas: ganan Trans (9,50), Nasdaq (2,50), Bad Bunny (12,00) y una de hace un mes que gano Counter Blox (4,00)
  insert into jg_carrera(estado, caballos, hash, orden, semilla, cierra) values ('pagada', cab, 'h1', '{3,1,2,4,5,6}', 's1', now() - interval '1 hour') returning id into r1;
  insert into jg_carrera(estado, caballos, hash, orden, semilla, cierra) values ('pagada', cab, 'h2', '{1,2,3,4,5,6}', 's2', now() - interval '50 minutes') returning id into r2;
  insert into jg_carrera(estado, caballos, hash, orden, semilla, cierra) values ('pagada', cab, 'h3', '{5,1,2,3,4,6}', 's3', now() - interval '40 minutes') returning id into r3;
  insert into jg_carrera(estado, caballos, hash, orden, semilla, cierra, creada) values ('pagada', cab, 'h4', '{2,1,3,4,5,6}', 's4', now() - interval '30 days', now() - interval '30 days') returning id into r4;
  -- una carrera aun abierta: no cuenta
  insert into jg_carrera(estado, caballos, hash) values ('apuestas', cab, 'h5');

  -- j1: 3 apuestas, 100 a Trans (gana 950), 100 a Travis (pierde), 100 a Nasdaq (gana 250) -> 1200 / 300 = 4,000
  insert into jg_carrera_apuestas(ronda, player, caballo, stake, cuota, pago) values (r1, j1, 3, 100, 9.50, 950), (r1, j1, 4, 100, 3.00, 0), (r2, j1, 1, 100, 2.50, 250);
  -- j2: 1 apuesta de 10 a Bad Bunny (gana 120) -> ratio 12 pero con menos de 3 apuestas va detras
  insert into jg_carrera_apuestas(ronda, player, caballo, stake, cuota, pago) values (r3, j2, 5, 10, 12.00, 120);
  -- j3: 4 apuestas, solo acierta Nasdaq: 400 a Nasdaq (1000) y 3 x 200 perdidas -> 1000 / 1000 = 1,000; y una de hace un mes a Counter Blox (gana 2000)
  insert into jg_carrera_apuestas(ronda, player, caballo, stake, cuota, pago) values (r2, j3, 1, 400, 2.50, 1000), (r2, j3, 2, 200, 4.00, 0), (r1, j3, 1, 200, 2.50, 0), (r3, j3, 6, 200, 7.00, 0);
  insert into jg_carrera_apuestas(ronda, player, caballo, stake, cuota, pago) values (r4, j3, 2, 500, 4.00, 2000);

  -- siempre
  v := carrera_mejores('siempre');
  if jsonb_array_length(v->'ratio') <> 3 then raise exception 'FALLO: ratio deberia tener 3 jugadores (%)', v->'ratio'; end if;
  x := v->'ratio'->0;
  if (x->>'player')::uuid <> j1 or (x->>'ratio')::numeric <> 4.000 or (x->>'apostado')::int <> 300 or (x->>'cobrado')::int <> 1200 or (x->>'aciertos')::int <> 2 or (x->>'apuestas')::int <> 3 or (x->>'mejor_cuota')::numeric <> 9.50 then
    raise exception 'FALLO: el primero deberia ser j1 con ratio 4 (%)', x; end if;
  x := v->'ratio'->1;   -- j3 siempre: 3000 / 1500 = 2,000 (5 apuestas)
  if (x->>'player')::uuid <> j3 or (x->>'ratio')::numeric <> 2.000 or (x->>'carreras')::int <> 4 then raise exception 'FALLO: el segundo deberia ser j3 con ratio 2 (%)', x; end if;
  x := v->'ratio'->2;   -- j2: ratio 12 pero solo 1 apuesta: el ultimo
  if (x->>'player')::uuid <> j2 or (x->>'ratio')::numeric <> 12.000 then raise exception 'FALLO: j2 (ratio 12, 1 apuesta) deberia ir el ultimo (%)', x; end if;
  x := v->'aciertos'->0;
  if (x->>'caballo') <> 'Bad Bunny' or (x->>'cuota')::numeric <> 12.00 or (x->>'player')::uuid <> j2 or (x->>'pago')::int <> 120 then raise exception 'FALLO: el mejor acierto deberia ser Bad Bunny x12 de j2 (%)', x; end if;
  if jsonb_array_length(v->'aciertos') <> 5 then raise exception 'FALLO: deberia haber 5 aciertos (%)', v->'aciertos'; end if;
  if (v->'aciertos'->1->>'caballo') <> 'Trans' then raise exception 'FALLO: el segundo acierto deberia ser Trans x9,50 (%)', v->'aciertos'->1; end if;
  if (v->'sorpresas'->0->>'caballo') <> 'Bad Bunny' or (v->'sorpresas'->0->>'cuota')::numeric <> 12.00 or jsonb_array_length(v->'sorpresas') <> 4 then
    raise exception 'FALLO: sorpresas (%)', v->'sorpresas'; end if;

  -- semana: la carrera de hace un mes no cuenta (si hoy es lunes de madrugada puede que tampoco las de hace una hora: se mira solo lo de hace un mes)
  v := carrera_mejores('semana');
  if exists (select 1 from jsonb_array_elements(v->'aciertos') a where (a->>'ronda')::bigint = r4) then raise exception 'FALLO: la carrera de hace un mes sale en la semana'; end if;
  if exists (select 1 from jsonb_array_elements(v->'ratio') a where (a->>'player')::uuid = j3 and (a->>'cobrado')::int >= 3000) then raise exception 'FALLO: la semana cuenta lo de hace un mes'; end if;

  -- periodo raro
  begin perform carrera_mejores('mes'); raise exception 'FALLO: acepto el periodo mes';
  exception when others then if sqlerrm not like 'Elige siempre o semana%' then raise; end if; end;

  -- sin entrar: no se puede
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin perform carrera_mejores('siempre'); raise exception 'FALLO: sin jugador tambien funciona';
  exception when others then if sqlerrm like 'FALLO%' then raise; end if; end;

  -- no ha movido dinero
  select coalesce(sum(amount), 0) into n0 from ledger;
  if n0 <> antes then raise exception 'FALLO: el ledger ha cambiado'; end if;

  raise exception 'PRUEBA SUPERADA (se deshace todo): ratio por jugador (j1 4,00 con 3 apuestas, j3 2,00, j2 12,00 con 1 apuesta al final), mejores aciertos por cuota, sorpresas, semana y siempre.';
end $$;
