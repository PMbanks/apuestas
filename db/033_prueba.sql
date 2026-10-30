-- Prueba de db/033_combinada_cashout.sql. Va DESPUES de 033. Al final lanza un error A PROPOSITO para que se deshaga todo.
do $$
declare jug uuid[] := array(select id from players order by created_at, id); r jsonb; q jsonb; c1 bigint; s0 int; s1 int; fallo boolean;
begin
  insert into ledger(player, amount, kind, note) select id, 100000, 'ajuste', 'saldo de prueba' from players;
  insert into matches(id, sport, league, league_name, home, away, starts_at, status, odds_1, odds_x, odds_2) values
    ('zz:k1', 'f', 'zz', 'Prueba', 'A1', 'B1', now() + interval '1 hour', 'scheduled', 2.00, 3.20, 3.80),
    ('zz:k2', 'f', 'zz', 'Prueba', 'A2', 'B2', now() + interval '2 hours', 'scheduled', 1.80, 3.40, 4.20);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  r := place_combo('[{"match":"zz:k1","pick":"1"},{"match":"zz:k2","pick":"1"}]', 100); c1 := (r->>'combo')::bigint;
  q := combo_cash_quotes();
  if (q->0->>'ok')::boolean then raise exception 'FALLO: sin empezar no deberia dar cash out (es cancelar)'; end if;
  -- empieza el primero y va ganando A1 1-0 en el minuto 60
  update matches set status = 'live', starts_at = now() - interval '60 minutes' where id = 'zz:k1';
  insert into ex_live(match_id, data, at) values ('zz:k1', '{"k":"f","min":60,"hs":1,"as":0,"per":2}', now());
  q := combo_cash_quotes();
  if not (q->0->>'ok')::boolean then raise exception 'FALLO: con uno en juego deberia dar valor: %', q->0->>'why'; end if;
  if (q->0->>'value')::int <= 100 or (q->0->>'value')::int >= (q->0->>'win')::int then raise exception 'FALLO: ganando 1-0 el valor deberia estar entre lo apostado y lo que paga: %', q->0; end if;
  fallo := false; begin perform cancel_combo(c1); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: con uno empezado no deberia cancelarse entera'; end if;
  execute 'select coalesce(sum(amount), 0)::int from ledger where player = $1' into s0 using jug[1];
  fallo := false; begin perform combo_cash_out(c1, (q->0->>'value')::int + 1000); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: entra aunque el valor sea menor que el que vio'; end if;
  r := combo_cash_out(c1, (q->0->>'value')::int);
  execute 'select coalesce(sum(amount), 0)::int from ledger where player = $1' into s1 using jug[1];
  if s1 - s0 <> (r->>'value')::int or (select status from combos where id = c1) <> 'cashout' then raise exception 'FALLO: no cobra lo que dice'; end if;
  -- acabado el partido, la combinada retirada no se vuelve a pagar
  update matches set status = 'final', winner = '1', score = '2:0' where id = 'zz:k1'; perform settle_match('zz:k1');
  update matches set status = 'final', winner = '1', score = '1:0' where id = 'zz:k2'; perform settle_match('zz:k2');
  if (select status from combos where id = c1) <> 'cashout' then raise exception 'FALLO: la retirada ha cambiado de estado al acabar'; end if;
  execute 'select coalesce(sum(amount), 0)::int from ledger where player = $1' into s0 using jug[1];
  if s0 <> s1 then raise exception 'FALLO: se ha pagado otra vez al acabar'; end if;
  raise exception 'PRUEBA SUPERADA (se deshace todo): sin empezar no hay cash out; ganando 1-0 vale % de 100 (pagaria %); cobra eso y no se vuelve a pagar.', q->0->>'value', q->0->>'win';
end $$;
