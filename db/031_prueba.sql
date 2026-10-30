-- Prueba de db/031_directo.sql, para el editor SQL de Supabase. Va DESPUES de 031.
-- Un partido de futbol de mentira en directo: cuotas, apostar, la revision (se confirma si el marcador sigue igual, se anula
-- y devuelve si cambia o si el partido acaba antes), el minuto 80, el tope y la cuota que baja. Al final lanza un error
-- A PROPOSITO para que se deshaga todo. Si todo va bien, el error dice "PRUEBA SUPERADA" con el resumen.
do $$
declare
  jug uuid[] := array(select id from players order by created_at, id);
  r jsonb; q jsonb; s0 int; s1 int; b1 bigint; b2 bigint; b3 bigint; fallo boolean; resumen text := '';
begin
  insert into ledger(player, amount, kind, note) select id, 100000, 'ajuste', 'saldo de prueba' from players;
  insert into matches(id, sport, league, league_name, home, away, starts_at, status, odds_1, odds_x, odds_2) values
    ('zz:l1', 'f', 'zz', 'Prueba', 'A1', 'B1', now() - interval '30 minutes', 'live', 2.00, 3.20, 3.80),
    ('zz:l2', 'u', 'zz', 'Prueba', 'Pelea A', 'Pelea B', now() - interval '5 minutes', 'live', 1.50, null, 2.60);
  insert into ex_live(match_id, data, at) values ('zz:l1', '{"k":"f","min":30,"hs":0,"as":0,"per":1}', now() - interval '10 seconds');
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);

  q := live_quote('zz:l1');
  if not (q->>'ok')::boolean then raise exception 'FALLO: sin cuotas en directo: %', q->>'why'; end if;
  if (q->'odds'->>'1')::numeric <= 1 or (q->'odds'->>'X')::numeric <= 1 or (q->'odds'->>'2')::numeric <= 1 then raise exception 'FALLO: cuotas raras %', q->'odds'; end if;
  if (q->'odds'->>'1')::numeric >= (q->'odds'->>'2')::numeric then raise exception 'FALLO: el favorito (A1) deberia pagar menos que B1: %', q->'odds'; end if;
  resumen := resumen || format('Cuotas al 0-0 del 30: %s. ', q->'odds');
  q := live_quote('zz:l2');
  if (q->>'ok')::boolean then raise exception 'FALLO: la UFC no deberia tener directo'; end if;

  execute 'select coalesce(sum(amount), 0)::int from ledger where player = $1' into s0 using jug[1];
  r := place_live_bet('zz:l1', '1', 100, null); b1 := (r->>'bet')::bigint;
  if (select live_snap from bets where id = b1) is null then raise exception 'FALLO: la apuesta no queda en revision'; end if;
  -- la siguiente lectura, mismo marcador: confirmada
  update ex_live set data = '{"k":"f","min":33,"hs":0,"as":0,"per":1}', at = now() where match_id = 'zz:l1';
  if (select live_snap from bets where id = b1) is not null or (select status from bets where id = b1) <> 'open' then raise exception 'FALLO: con el mismo marcador deberia quedar confirmada'; end if;
  -- otra apuesta y gol en la siguiente lectura: anulada y devuelta
  r := place_live_bet('zz:l1', '2', 200, null); b2 := (r->>'bet')::bigint;
  update ex_live set data = '{"k":"f","min":36,"hs":1,"as":0,"per":1}', at = now() + interval '1 second' where match_id = 'zz:l1';
  if (select status from bets where id = b2) <> 'void' then raise exception 'FALLO: con gol justo despues deberia anularse'; end if;
  execute 'select coalesce(sum(amount), 0)::int from ledger where player = $1' into s1 using jug[1];
  if s1 <> s0 - 100 then raise exception 'FALLO: el saldo deberia ser el de antes menos 100 (la confirmada) y va %', s1 - s0; end if;
  resumen := resumen || 'Revision: se confirma si sigue igual, se anula y devuelve con gol. ';

  -- la cuota que baja no entra
  fallo := false; begin perform place_live_bet('zz:l1', '1', 50, 50.0); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: entra aunque la cuota es menor que la vista'; end if;
  -- tope por partido
  fallo := false; begin perform place_live_bet('zz:l1', '1', 950, null); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja pasar del tope de 1.000 en directo'; end if;
  -- en revision cuando acaba el partido: anulada
  r := place_live_bet('zz:l1', '1', 100, null); b3 := (r->>'bet')::bigint;
  update matches set status = 'final', winner = '1', score = '1:0' where id = 'zz:l1';
  if (select status from bets where id = b3) <> 'void' then raise exception 'FALLO: si acaba en revision deberia anularse'; end if;
  perform settle_match('zz:l1');
  if (select status from bets where id = b1) <> 'won' or (select payout from bets where id = b1) <> round(100 * (select odds from bets where id = b1)) then
    raise exception 'FALLO: la confirmada deberia cobrar como una normal'; end if;
  resumen := resumen || 'Cuota que baja y tope rechazados; al acabar en revision se anula; la confirmada cobra normal. ';

  -- minuto 80: cerrado
  insert into matches(id, sport, league, league_name, home, away, starts_at, status, odds_1, odds_x, odds_2) values ('zz:l3', 'f', 'zz', 'Prueba', 'A3', 'B3', now() - interval '85 minutes', 'live', 2.0, 3.2, 3.8);
  insert into ex_live(match_id, data, at) values ('zz:l3', '{"k":"f","min":81,"hs":0,"as":0,"per":2}', now());
  fallo := false; begin perform place_live_bet('zz:l3', '1', 50, null); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja apostar en el minuto 81'; end if;
  resumen := resumen || 'Cerrado desde el 80.';

  raise exception 'PRUEBA SUPERADA (se deshace todo): %', resumen;
end $$;
