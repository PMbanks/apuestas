-- Prueba de db/029_combinadas.sql, para el editor SQL de Supabase. Va DESPUES de 029.
-- Partidos de mentira; apuesta, cancela, gana, pierde y anula combinadas y mira el ledger. Al final lanza un error A PROPOSITO
-- para que se deshaga todo. Si todo va bien, el error dice "PRUEBA SUPERADA" con el resumen.
do $$
declare
  jug uuid[] := array(select id from players order by created_at, id);
  r jsonb; s0 int; s1 int; c1 bigint; c2 bigint; c3 bigint; fallo boolean; resumen text := '';
  saldo constant text := 'select coalesce(sum(amount), 0)::int from ledger where player = $1';
begin
  insert into ledger(player, amount, kind, note) select id, 100000, 'ajuste', 'saldo de prueba' from players;
  insert into matches(id, sport, league, league_name, home, away, starts_at, status, odds_1, odds_x, odds_2) values
    ('zz:c1', 'f', 'zz', 'Prueba', 'A1', 'B1', now() + interval '2 hours', 'scheduled', 2.00, 3.00, 4.00),
    ('zz:c2', 'f', 'zz', 'Prueba', 'A2', 'B2', now() + interval '3 hours', 'scheduled', 1.50, 3.50, 5.00),
    ('zz:c3', 'v', 'zz', 'Prueba', 'A3', 'B3', now() + interval '4 hours', 'scheduled', 1.80, null, 2.00),
    ('zz:c4', 'f', 'zz', 'Prueba', 'A4', 'B4', now() - interval '10 minutes', 'live', 2.00, 3.00, 4.00);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  execute saldo into s0 using jug[1];

  -- lo que no se puede
  fallo := false; begin perform place_combo('[{"match":"zz:c1","pick":"1"}]', 100); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja una combinada de 1 partido'; end if;
  fallo := false; begin perform place_combo('[{"match":"zz:c1","pick":"1"},{"match":"zz:c1","pick":"2"}]', 100); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja el mismo partido dos veces'; end if;
  fallo := false; begin perform place_combo('[{"match":"zz:c1","pick":"1"},{"match":"zz:c4","pick":"1"}]', 100); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja meter un partido ya empezado'; end if;
  fallo := false; begin perform place_combo('[{"match":"zz:c1","pick":"1"},{"match":"zz:c3","pick":"X"}]', 100); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja un empate sin cuota'; end if;
  resumen := resumen || 'Rechaza 1 partido, repetidos, empezados y opciones sin cuota. ';

  -- apostar y cancelar
  r := place_combo('[{"match":"zz:c1","pick":"1"},{"match":"zz:c2","pick":"1"}]', 100); c1 := (r->>'combo')::bigint;
  if (r->>'odds')::numeric <> 3.00 then raise exception 'FALLO: 2,00 por 1,50 deberia ser 3,00 y es %', r->>'odds'; end if;
  execute saldo into s1 using jug[1]; if s1 <> s0 - 100 then raise exception 'FALLO: no se ha cobrado lo apostado'; end if;
  r := cancel_combo(c1);
  execute saldo into s1 using jug[1]; if s1 <> s0 then raise exception 'FALLO: cancelar no devuelve todo'; end if;
  fallo := false; begin perform cancel_combo(c1); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se puede cancelar dos veces'; end if;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[2]), true);
  r := place_combo('[{"match":"zz:c1","pick":"1"},{"match":"zz:c2","pick":"1"}]', 50); c3 := (r->>'combo')::bigint;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  fallo := false; begin perform cancel_combo(c3); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: se puede cancelar la combinada de otro'; end if;
  resumen := resumen || 'Cobra al apostar, cancelar devuelve todo una vez y solo la tuya. ';

  -- c1: gana la primera y pierde la segunda -> perdida, sin premio
  r := place_combo('[{"match":"zz:c1","pick":"1"},{"match":"zz:c2","pick":"1"}]', 100); c1 := (r->>'combo')::bigint;
  -- c2: gana la primera y la segunda se anula -> cobra 100 x 2,00
  r := place_combo('[{"match":"zz:c1","pick":"1"},{"match":"zz:c3","pick":"2"}]', 100); c2 := (r->>'combo')::bigint;
  execute saldo into s0 using jug[1];
  update matches set status = 'final', winner = '1', score = '1:0' where id = 'zz:c1';
  perform settle_match('zz:c1');
  if (select status from combos where id = c1) <> 'open' then raise exception 'FALLO: con un partido por jugar la combinada ya se ha cerrado'; end if;
  update matches set status = 'final', winner = '2', score = '0:1' where id = 'zz:c2';
  perform settle_match('zz:c2');
  if (select status from combos where id = c1) <> 'lost' then raise exception 'FALLO: fallando un partido no se pierde (%)', (select status from combos where id = c1); end if;
  if (select status from combos where id = c3) <> 'lost' then raise exception 'FALLO: la combinada del otro jugador no se ha resuelto'; end if;
  update matches set status = 'canceled' where id = 'zz:c3';
  perform settle_match('zz:c3');
  if (select status from combos where id = c2) <> 'won' or (select payout from combos where id = c2) <> 200 then
    raise exception 'FALLO: con un partido anulado deberia cobrar 200 y queda % con %', (select status from combos where id = c2), (select payout from combos where id = c2); end if;
  execute saldo into s1 using jug[1];
  if s1 <> s0 + 200 then raise exception 'FALLO: el saldo deberia subir 200 y sube %', s1 - s0; end if;
  if (select count(*) from combo_legs where combo_id in (c1, c2) and result is null) > 0 then raise exception 'FALLO: quedan patas sin resolver'; end if;
  resumen := resumen || 'Pierde si falla una, espera a la ultima, el anulado cuenta como 1 y paga lo justo.';

  raise exception 'PRUEBA SUPERADA (se deshace todo): %', resumen;
end $$;
