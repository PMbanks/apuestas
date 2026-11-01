-- Prueba de db/037_mapas.sql, para el editor SQL de Supabase. Va DESPUES de 037.
-- Series de mentira (Valorant y CS2) con cuotas de cada mapa: nombres, lo que no se puede, apostar a cada mapa con la cuota
-- congelada, cash out antes y en directo, el pago exacto (BO3 2:0 con el mapa 3 sin jugar = devuelto, 2:1, BO5 3:2 y 0:3),
-- gana todos los mapas, lo que se devuelve (forfeit, formato, datos que no cuadran), combinadas, el sincronizador, los
-- permisos y que lo de 036 sigue igual. Al final lanza un error A PROPOSITO para que se deshaga todo.
-- Si todo va bien, el error dice "PRUEBA SUPERADA" con el resumen.
do $$
declare
  jug uuid[] := array(select id from players order by created_at, id);
  r jsonb; q jsonb; s0 int; s1 int; fallo boolean; resumen text := ''; v numeric; pm numeric; c1 bigint; c2 bigint;
  b11 bigint; b12 bigint; b21 bigint; b22 bigint; b31 bigint; b32 bigint; bs20 bigint; b1 bigint; bx bigint; by_ bigint; bz bigint;
  saldo constant text := 'select coalesce(sum(amount), 0)::int from ledger where player = $1';
  mm matches;
  sec text := (select value #>> '{}' from settings where key = 'sync_secret');
  st text;
begin
  insert into ledger(player, amount, kind, note) select id, 100000, 'ajuste', 'saldo de prueba' from players;
  insert into matches(id, sport, league, league_name, home, away, starts_at, status, odds_1, odds_x, odds_2, bo, details, odds_mk) values
    ('zz:m1', 'v', 'zz', 'Prueba', 'FaZe', 'FURIA', now() + interval '3 hours', 'scheduled', 1.60, null, 2.40, 3, '{"mt":"best_of","ids":{"a":101,"b":202}}',
     '{"S2-0":2.80,"S2-1":3.70,"S1-2":4.60,"S0-2":5.60,"W1-1":1.70,"W1-2":2.10,"W2-1":1.72,"W2-2":2.08,"W3-1":1.75,"W3-2":2.05,"W4-1":2.00}'),
    ('zz:m2', 'v', 'zz', 'Prueba', 'Sen', 'Prx', now() + interval '3 hours', 'scheduled', 1.80, null, 2.00, 3, '{"mt":"best_of","ids":{"a":11,"b":22}}',
     '{"S2-0":3.40,"S2-1":3.50,"W1-1":1.80,"W2-1":1.85,"W2-2":2.00,"W3-1":1.90,"W3-2":1.95}'),
    ('zz:m5', 'c', 'zz', 'Prueba', 'NAVI', 'Vitality', now() + interval '3 hours', 'scheduled', 2.10, null, 1.75, 5, '{"mt":"best_of","ids":{"a":31,"b":32}}',
     '{"S3-2":5.00,"S3-0":6.00,"W1-2":2.00,"W4-1":1.80,"W5-1":1.85,"W5-2":1.95}'),
    ('zz:m6', 'c', 'zz', 'Prueba', 'Spirit', 'MOUZ', now() + interval '3 hours', 'scheduled', 2.40, null, 1.60, 5, '{"mt":"best_of","ids":{"a":41,"b":42}}',
     '{"S3-0":7.00,"S0-3":4.00,"W1-2":1.60,"W4-2":1.65,"W5-1":2.30}'),
    ('zz:m7', 'c', 'zz', 'Prueba', 'Ff A', 'Ff B', now() + interval '3 hours', 'scheduled', 1.90, null, 1.90, 3, '{"mt":"best_of","ids":{"a":51,"b":52}}', '{"W1-1":1.90}'),
    ('zz:m8', 'c', 'zz', 'Prueba', 'Mt A', 'Mt B', now() + interval '3 hours', 'scheduled', 1.90, null, 1.90, 3, '{"mt":"best_of","ids":{"a":61,"b":62}}', '{"W1-1":1.90}'),
    ('zz:m9', 'c', 'zz', 'Prueba', 'Raro A', 'Raro B', now() + interval '3 hours', 'scheduled', 1.90, null, 1.90, 3, '{"mt":"best_of","ids":{"a":71,"b":72}}', '{"W2-1":1.90}'),
    ('zz:ma', 'c', 'zz', 'Prueba', 'Sin A', 'Sin B', now() + interval '3 hours', 'scheduled', 1.90, null, 1.90, 3, '{"mt":"best_of","ids":{"a":81,"b":82}}', '{"W1-1":1.90}'),
    ('zz:mb', 'c', 'zz', 'Prueba', 'Otro A', 'Otro B', now() + interval '3 hours', 'scheduled', 1.90, null, 1.90, 3, '{"mt":"best_of","ids":{"a":91,"b":92}}', '{"W1-1":1.90}'),
    ('zz:b1', 'c', 'zz', 'Prueba', 'Bo1 A', 'Bo1 B', now() + interval '3 hours', 'scheduled', 1.90, null, 1.90, 1, '{"mt":"best_of","ids":{"a":1,"b":2}}', '{"W1-1":1.90}'),
    ('zz:f1', 'f', 'zz', 'Prueba', 'Local', 'Visita', now() + interval '2 hours', 'scheduled', 2.00, 3.40, 3.60, null, '{}', '{"O2.5":1.90,"W1-1":1.90}');
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', jug[1]), true);
  execute saldo into s0 using jug[1];

  -- ---------- los nombres y de que equipo es ----------
  select * into mm from matches where id = 'zz:m1';
  if pick_name(mm, 'W1-1') <> 'Mapa 1: FaZe' or pick_name(mm, 'W3-2') <> 'Mapa 3: FURIA' then
    raise exception 'FALLO: nombres de mapas: % / %', pick_name(mm, 'W1-1'), pick_name(mm, 'W3-2'); end if;
  if mk_lado('W2-1') is distinct from '1' or mk_lado('W5-2') is distinct from '2' then raise exception 'FALLO: el equipo de un mapa'; end if;
  -- lo de 036 sigue igual
  if pick_name(mm, 'S2-0') <> 'FaZe 2:0' or pick_name(mm, 'S0-2') <> 'FURIA 2:0' or pick_name(mm, 'H2+1.5') <> 'FURIA +1,5 mapas'
     or pick_name(mm, 'MO2.5') <> 'Más de 2,5 mapas' or pick_name(mm, 'O2.5') <> 'Más de 2,5 goles' or pick_name(mm, 'GG') <> 'Ambos marcan: sí' then
    raise exception 'FALLO: los nombres de 036 han cambiado'; end if;
  if not mk_valido('S2-1') or not mk_valido('H1+1.5') or not mk_valido('MU4.5') or not mk_valido('U3.5') or mk_valido('W6-1') or mk_valido('W1-3') or mk_valido('W0-1') then
    raise exception 'FALLO: los codigos validos'; end if;
  resumen := resumen || 'Nombres (Mapa 1: FaZe) y codigos bien, los de 036 igual. ';

  -- ---------- lo que no se puede ----------
  fallo := false; begin perform place_bet('zz:m1', 'W4-1', 100); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja el mapa 4 en una serie al mejor de 3'; end if;
  fallo := false; begin perform place_bet('zz:f1', 'W1-1', 100); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja apostar a un mapa en futbol'; end if;
  fallo := false; begin perform place_bet('zz:b1', 'W1-1', 100); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja apostar a un mapa en una serie al mejor de 1'; end if;
  fallo := false; begin perform place_bet('zz:m2', 'W1-2', 100); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja un mapa sin cuota'; end if;
  fallo := false; begin perform place_bet('zz:m1', 'W6-1', 100); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja el mapa 6'; end if;
  fallo := false; begin insert into bets(player, match_id, pick, stake, odds) values (jug[1], 'zz:m1', 'W1-3', 10, 2); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: la tabla admite W1-3'; end if;
  if mk_cuota((select m from matches m where m.id = 'zz:m1'), 'W4-1') is not null then raise exception 'FALLO: el mapa 4 de un BO3 tiene cuota'; end if;
  execute saldo into s1 using jug[1];
  if s1 <> s0 then raise exception 'FALLO: lo rechazado ha movido dinero (%)', s1 - s0; end if;
  resumen := resumen || 'Rechaza mapas de mas, futbol, BO1, sin cuota y codigos raros. ';

  -- ---------- apostar a cada mapa: cobra y congela la cuota de ese mapa ----------
  r := place_bet('zz:m1', 'W1-1', 100); b11 := (r->>'bet')::bigint;
  if (r->>'odds')::numeric <> 1.70 then raise exception 'FALLO: la cuota del mapa 1 deberia ser 1,70 y es %', r->>'odds'; end if;
  r := place_bet('zz:m1', 'W1-2', 100); b12 := (r->>'bet')::bigint;
  r := place_bet('zz:m1', 'W2-1', 100); b21 := (r->>'bet')::bigint;
  if (r->>'odds')::numeric <> 1.72 then raise exception 'FALLO: la cuota del mapa 2 deberia ser 1,72 y es %', r->>'odds'; end if;
  r := place_bet('zz:m1', 'W2-2', 100); b22 := (r->>'bet')::bigint;
  r := place_bet('zz:m1', 'W3-1', 150); b31 := (r->>'bet')::bigint;
  r := place_bet('zz:m1', 'W3-2', 50); b32 := (r->>'bet')::bigint;
  r := place_bet('zz:m1', 'S2-0', 100); bs20 := (r->>'bet')::bigint;     -- gana todos los mapas
  r := place_bet('zz:m1', '1', 100); b1 := (r->>'bet')::bigint;
  execute saldo into s1 using jug[1];
  if s1 <> s0 - 800 then raise exception 'FALLO: deberia haber cobrado 800 y ha cobrado %', s0 - s1; end if;
  if (select note from ledger where bet_id = b11 and kind = 'apuesta') <> 'Mapa 1: FaZe 1,70' then
    raise exception 'FALLO: nota del monedero: %', (select note from ledger where bet_id = b11 and kind = 'apuesta'); end if;
  update matches set odds_mk = odds_mk || '{"W1-1":1.40,"W2-1":2.50}' where id = 'zz:m1';
  if (select odds from bets where id = b11) <> 1.70 or (select odds from bets where id = b21) <> 1.72 then raise exception 'FALLO: la cuota del mapa no se ha congelado'; end if;
  resumen := resumen || 'Cobra y congela la cuota de cada mapa. ';

  -- cash out antes de empezar: con la cuota de ahora del mismo mapa
  q := cash_out_quote(b11);
  if not (q->>'ok')::boolean or (q->>'value')::int <> round(100 * 1.70 / 1.40 * 0.95) then raise exception 'FALLO: cash out del mapa antes de empezar: %', q; end if;
  q := cash_out_quote(b21);
  if (q->>'value')::int <> round(100 * 1.72 / 2.50 * 0.95) then raise exception 'FALLO: cash out del mapa 2 antes de empezar: %', q; end if;
  update matches set odds_mk = odds_mk - 'W1-1' where id = 'zz:m1';
  if (cash_out_quote(b11)->>'ok')::boolean then raise exception 'FALLO: cash out de un mapa que ya no tiene cuota'; end if;
  update matches set odds_mk = odds_mk || '{"W1-1":1.40}' where id = 'zz:m1';
  resumen := resumen || 'Cash out antes de empezar con la cuota de ahora del mapa. ';

  -- ---------- en directo: FaZe gana el mapa 1, se juega el 2 ----------
  update matches set status = 'live', starts_at = now() - interval '50 minutes',
    details = '{"mt":"best_of","ids":{"a":101,"b":202},"games":[{"n":1,"st":"finished","w":101},{"n":2,"st":"running","w":null},{"n":3,"st":"not_started","w":null}]}'
    where id = 'zz:m1';
  insert into ex_live(match_id, data, at) values ('zz:m1', '{"k":"s","a":1,"b":0,"bo":3}', now());
  pm := ex_map_p(least(0.97, greatest(0.03, (1 / 1.60) / ((1 / 1.60) + (1 / 2.40)))), 3);
  q := cash_out_quote(b11); if not (q->>'ok')::boolean or (q->>'p')::numeric <> 1 then raise exception 'FALLO: el mapa 1 ya ganado deberia valer p 1: %', q; end if;
  q := cash_out_quote(b12); if not (q->>'ok')::boolean or (q->>'p')::numeric <> 0 then raise exception 'FALLO: el mapa 1 ya perdido deberia valer p 0: %', q; end if;
  q := cash_out_quote(b21);
  if abs((q->>'p')::numeric - pm) > 0.0006 then raise exception 'FALLO: el mapa 2 (el que se juega) deberia ir por la probabilidad por mapa % y va %', round(pm, 3), q->>'p'; end if;
  if abs((q->>'p')::numeric + (cash_out_quote(b22)->>'p')::numeric - 1) > 0.002 then raise exception 'FALLO: el mapa 2 de los dos deberia sumar 1'; end if;
  if abs((q->>'value')::int - least(round(100 * 1.72), greatest(1, round(100 * 1.72 * (q->>'p')::numeric * 0.90)))) > 1 then raise exception 'FALLO: valor en directo del mapa 2: %', q; end if;
  -- mapa 3: solo se juega si FURIA gana el 2 (si no, se devuelve: cuenta 1 / cuota)
  v := (cash_out_quote(b31)->>'p')::numeric;
  if abs(v - (pm / 1.75 + (1 - pm) * pm)) > 0.0006 then raise exception 'FALLO: el mapa 3 desde 1:0 deberia valer p % y vale %', round(pm / 1.75 + (1 - pm) * pm, 3), v; end if;
  v := (cash_out_quote(b32)->>'p')::numeric;
  if abs(v - (pm / 2.05 + (1 - pm) * (1 - pm))) > 0.0006 then raise exception 'FALLO: el mapa 3 de FURIA desde 1:0 deberia valer p % y vale %', round(pm / 2.05 + (1 - pm) * (1 - pm), 3), v; end if;
  -- con las rondas del mapa 2 (FaZe 10 a 3) el mapa 2 vale mas, y los dos siguen sumando 1
  update ex_live set data = '{"k":"s","a":1,"b":0,"bo":3,"ra":10,"rb":3}', at = now() where match_id = 'zz:m1';
  v := (cash_out_quote(b21)->>'p')::numeric;
  if v <= pm + 0.05 then raise exception 'FALLO: ganando 10 a 3 el mapa 2 deberia valer mas que % y vale %', round(pm, 3), v; end if;
  if abs(v + (cash_out_quote(b22)->>'p')::numeric - 1) > 0.002 then raise exception 'FALLO: con rondas el mapa 2 de los dos deberia sumar 1'; end if;
  -- si el mapa 1 aun no sale como acabado en los datos de la serie, ese mapa no tiene cash out (un momento)
  update matches set details = '{"mt":"best_of","ids":{"a":101,"b":202},"games":[]}' where id = 'zz:m1';
  if (cash_out_quote(b11)->>'ok')::boolean then raise exception 'FALLO: cash out de un mapa jugado sin saber quien lo gano'; end if;
  if not (cash_out_quote(b21)->>'ok')::boolean then raise exception 'FALLO: el mapa que se juega deberia tener cash out'; end if;
  update ex_live set data = '{"k":"s","a":2,"b":0,"bo":3}', at = now() where match_id = 'zz:m1';
  if (cash_out_quote(b31)->>'ok')::boolean then raise exception 'FALLO: con la serie decidida no hay cash out'; end if;
  resumen := resumen || 'Cash out en directo: mapa jugado ganado o perdido, el que se juega por su probabilidad (con rondas), uno de despues con lo que se devolveria. ';

  -- ---------- pagar BO3 2:0: mapas 1 y 2 de FaZe, el 3 no se juega (se devuelve) ----------
  execute saldo into s0 using jug[1];
  update matches set status = 'final', score = '2:0', winner = '1',
    details = '{"mt":"best_of","ids":{"a":101,"b":202},"games":[{"n":1,"st":"finished","w":101},{"n":2,"st":"finished","w":101},{"n":3,"st":"not_played","w":null}]}'
    where id = 'zz:m1';
  perform settle_match('zz:m1');
  select string_agg(status || coalesce(':' || payout, ''), ' ' order by id) into st from bets where id in (b11, b12, b21, b22, b31, b32, bs20, b1);
  if (select status from bets where id = b11) <> 'won' or (select payout from bets where id = b11) <> 170
     or (select status from bets where id = b12) <> 'lost' or (select status from bets where id = b22) <> 'lost'
     or (select status from bets where id = b21) <> 'won' or (select payout from bets where id = b21) <> 172
     or (select status from bets where id = b31) <> 'void' or (select payout from bets where id = b31) <> 150
     or (select status from bets where id = b32) <> 'void' or (select payout from bets where id = b32) <> 50
     or (select status from bets where id = bs20) <> 'won' or (select payout from bets where id = bs20) <> 280
     or (select status from bets where id = b1) <> 'won' or (select payout from bets where id = b1) <> 160 then
    raise exception 'FALLO: BO3 2:0 (mapa1 FaZe, mapa1 FURIA, mapa2 FaZe, mapa2 FURIA, mapa3 FaZe, mapa3 FURIA, todos, 1): %', st; end if;
  execute saldo into s1 using jug[1];
  if s1 - s0 <> 170 + 172 + 150 + 50 + 280 + 160 then raise exception 'FALLO: el saldo deberia subir % y sube %', 170 + 172 + 150 + 50 + 280 + 160, s1 - s0; end if;
  if not exists (select 1 from ledger where bet_id = b31 and kind = 'devolucion' and note = 'Anulado: Mapa 3: FaZe · FaZe vs FURIA') then raise exception 'FALLO: falta la devolucion del mapa 3 en el monedero'; end if;
  if not exists (select 1 from chat where body like '% recupera 150: Mapa 3: FaZe en FaZe vs FURIA no se ha jugado') then raise exception 'FALLO: falta el aviso del mapa 3 en el chat'; end if;
  if not exists (select 1 from ledger where bet_id = b11 and kind = 'premio' and note = 'Mapa 1: FaZe 1,70') then raise exception 'FALLO: premio del mapa 1 en el monedero'; end if;
  resumen := resumen || 'BO3 2:0: mapas 1 y 2 pagados exactos, el 3 devuelto, gana todos los mapas cobra. ';

  -- ---------- BO3 2:1: Sen, Prx, Sen ----------
  r := place_bet('zz:m2', 'W1-1', 100); b11 := (r->>'bet')::bigint;
  r := place_bet('zz:m2', 'W2-1', 100); b21 := (r->>'bet')::bigint;
  r := place_bet('zz:m2', 'W2-2', 100); b22 := (r->>'bet')::bigint;
  r := place_bet('zz:m2', 'W3-1', 100); b31 := (r->>'bet')::bigint;
  r := place_bet('zz:m2', 'W3-2', 100); b32 := (r->>'bet')::bigint;
  r := place_bet('zz:m2', 'S2-0', 100); bs20 := (r->>'bet')::bigint;
  r := place_bet('zz:m2', 'S2-1', 100); b1 := (r->>'bet')::bigint;
  execute saldo into s0 using jug[1];
  update matches set status = 'final', score = '2:1', winner = '1',
    details = '{"mt":"best_of","ids":{"a":11,"b":22},"games":[{"n":2,"st":"finished","w":22},{"n":1,"st":"finished","w":11},{"n":3,"st":"finished","w":11}]}'
    where id = 'zz:m2';
  perform settle_match('zz:m2');
  select string_agg(status || coalesce(':' || payout, ''), ' ' order by id) into st from bets where id in (b11, b21, b22, b31, b32, bs20, b1);
  if (select status from bets where id = b11) <> 'won' or (select payout from bets where id = b11) <> 180
     or (select status from bets where id = b21) <> 'lost'
     or (select status from bets where id = b22) <> 'won' or (select payout from bets where id = b22) <> 200
     or (select status from bets where id = b31) <> 'won' or (select payout from bets where id = b31) <> 190
     or (select status from bets where id = b32) <> 'lost' or (select status from bets where id = bs20) <> 'lost'
     or (select status from bets where id = b1) <> 'won' or (select payout from bets where id = b1) <> 350 then
    raise exception 'FALLO: BO3 2:1 (mapa1 Sen, mapa2 Sen, mapa2 Prx, mapa3 Sen, mapa3 Prx, 2:0, 2:1): %', st; end if;
  execute saldo into s1 using jug[1];
  if s1 - s0 <> 180 + 200 + 190 + 350 then raise exception 'FALLO: BO3 2:1 el saldo deberia subir % y sube %', 180 + 200 + 190 + 350, s1 - s0; end if;
  resumen := resumen || 'BO3 2:1 bien. ';

  -- ---------- BO5 3:2: Vitality, NAVI, Vitality, NAVI, NAVI ----------
  r := place_bet('zz:m5', 'W1-2', 100); b12 := (r->>'bet')::bigint;
  r := place_bet('zz:m5', 'W4-1', 100); b11 := (r->>'bet')::bigint;
  r := place_bet('zz:m5', 'W5-1', 100); b21 := (r->>'bet')::bigint;
  r := place_bet('zz:m5', 'W5-2', 100); b22 := (r->>'bet')::bigint;
  r := place_bet('zz:m5', 'S3-2', 100); b1 := (r->>'bet')::bigint;
  r := place_bet('zz:m5', 'S3-0', 100); bs20 := (r->>'bet')::bigint;
  execute saldo into s0 using jug[1];
  update matches set status = 'final', score = '3:2', winner = '1',
    details = '{"mt":"best_of","ids":{"a":31,"b":32},"games":[{"n":1,"st":"finished","w":32},{"n":2,"st":"finished","w":31},{"n":3,"st":"finished","w":32},{"n":4,"st":"finished","w":31},{"n":5,"st":"finished","w":31}]}'
    where id = 'zz:m5';
  perform settle_match('zz:m5');
  select string_agg(status || coalesce(':' || payout, ''), ' ' order by id) into st from bets where id in (b12, b11, b21, b22, b1, bs20);
  if (select status from bets where id = b12) <> 'won' or (select payout from bets where id = b12) <> 200
     or (select status from bets where id = b11) <> 'won' or (select payout from bets where id = b11) <> 180
     or (select status from bets where id = b21) <> 'won' or (select payout from bets where id = b21) <> 185
     or (select status from bets where id = b22) <> 'lost' or (select status from bets where id = bs20) <> 'lost'
     or (select status from bets where id = b1) <> 'won' or (select payout from bets where id = b1) <> 500 then
    raise exception 'FALLO: BO5 3:2 (mapa1 Vitality, mapa4 NAVI, mapa5 NAVI, mapa5 Vitality, 3:2, 3:0): %', st; end if;
  execute saldo into s1 using jug[1];
  if s1 - s0 <> 200 + 180 + 185 + 500 then raise exception 'FALLO: BO5 3:2 el saldo deberia subir % y sube %', 200 + 180 + 185 + 500, s1 - s0; end if;
  -- BO5 0:3 de MOUZ: los mapas 4 y 5 no se juegan (se devuelven); MOUZ gana todos los mapas (S0-3)
  r := place_bet('zz:m6', 'W1-2', 100); b12 := (r->>'bet')::bigint;
  r := place_bet('zz:m6', 'W4-2', 70); b22 := (r->>'bet')::bigint;
  r := place_bet('zz:m6', 'W5-1', 30); b21 := (r->>'bet')::bigint;
  r := place_bet('zz:m6', 'S0-3', 100); bs20 := (r->>'bet')::bigint;
  r := place_bet('zz:m6', 'S3-0', 100); b1 := (r->>'bet')::bigint;
  if pick_name((select m from matches m where m.id = 'zz:m6'), 'S0-3') <> 'MOUZ 3:0' then raise exception 'FALLO: nombre de MOUZ 3:0'; end if;
  execute saldo into s0 using jug[1];
  update matches set status = 'final', score = '0:3', winner = '2',
    details = '{"mt":"best_of","ids":{"a":41,"b":42},"games":[{"n":1,"st":"finished","w":42},{"n":2,"st":"finished","w":42},{"n":3,"st":"finished","w":42},{"n":4,"st":"not_played","w":null},{"n":5,"st":"not_played","w":null}]}'
    where id = 'zz:m6';
  perform settle_match('zz:m6');
  select string_agg(status || coalesce(':' || payout, ''), ' ' order by id) into st from bets where id in (b12, b22, b21, bs20, b1);
  if (select status from bets where id = b12) <> 'won' or (select payout from bets where id = b12) <> 160
     or (select status from bets where id = b22) <> 'void' or (select payout from bets where id = b22) <> 70
     or (select status from bets where id = b21) <> 'void' or (select payout from bets where id = b21) <> 30
     or (select status from bets where id = bs20) <> 'won' or (select payout from bets where id = bs20) <> 400
     or (select status from bets where id = b1) <> 'lost' then
    raise exception 'FALLO: BO5 0:3 (mapa1 MOUZ, mapa4 MOUZ, mapa5 Spirit, MOUZ todos, Spirit todos): %', st; end if;
  execute saldo into s1 using jug[1];
  if s1 - s0 <> 160 + 70 + 30 + 400 then raise exception 'FALLO: BO5 0:3 el saldo deberia subir % y sube %', 160 + 70 + 30 + 400, s1 - s0; end if;
  resumen := resumen || 'BO5 3:2 y 0:3 bien (mapas sin jugar devueltos, gana todos los mapas del visitante). ';

  -- ---------- lo que se devuelve ----------
  -- forfeit (aunque los mapas parezcan bien): el mapa se devuelve, el ganador se paga
  r := place_bet('zz:m7', 'W1-1', 100); bx := (r->>'bet')::bigint;
  r := place_bet('zz:m7', '1', 100); b1 := (r->>'bet')::bigint;
  update matches set status = 'final', score = '2:0', winner = '1',
    details = '{"mt":"best_of","ff":true,"ids":{"a":51,"b":52},"games":[{"n":1,"st":"finished","w":51},{"n":2,"st":"finished","w":51}]}' where id = 'zz:m7';
  perform settle_match('zz:m7');
  if (select status from bets where id = bx) <> 'void' or (select payout from bets where id = bx) <> 100 then raise exception 'FALLO: con forfeit el mapa deberia devolverse'; end if;
  if (select status from bets where id = b1) <> 'won' then raise exception 'FALLO: con forfeit el ganador se paga'; end if;
  -- formato que no es al mejor de
  r := place_bet('zz:m8', 'W1-1', 100); bx := (r->>'bet')::bigint;
  update matches set status = 'final', score = '2:0', winner = '1',
    details = '{"mt":"first_to","ids":{"a":61,"b":62},"games":[{"n":1,"st":"finished","w":61},{"n":2,"st":"finished","w":61}]}' where id = 'zz:m8';
  perform settle_match('zz:m8');
  if (select status from bets where id = bx) <> 'void' then raise exception 'FALLO: un formato que no es al mejor de deberia devolverse'; end if;
  -- los mapas no cuadran con el marcador (2:0 pero el mapa 1 lo gana el otro): se devuelve aunque el mapa 2 parezca bien
  r := place_bet('zz:m9', 'W2-1', 100); bx := (r->>'bet')::bigint;
  update matches set status = 'final', score = '2:0', winner = '1',
    details = '{"mt":"best_of","ids":{"a":71,"b":72},"games":[{"n":1,"st":"finished","w":72},{"n":2,"st":"finished","w":71}]}' where id = 'zz:m9';
  perform settle_match('zz:m9');
  if (select status from bets where id = bx) <> 'void' then raise exception 'FALLO: mapas que no cuadran con el marcador deberian devolverse'; end if;
  -- sin los mapas en los datos
  r := place_bet('zz:ma', 'W1-1', 100); bx := (r->>'bet')::bigint;
  update matches set status = 'final', score = '2:1', winner = '1', details = '{"mt":"best_of","ids":{"a":81,"b":82}}' where id = 'zz:ma';
  perform settle_match('zz:ma');
  if (select status from bets where id = bx) <> 'void' then raise exception 'FALLO: sin los mapas en los datos deberia devolverse'; end if;
  -- un ganador que no es ninguno de los dos
  r := place_bet('zz:mb', 'W1-1', 100); by_ := (r->>'bet')::bigint;
  update matches set status = 'final', score = '2:0', winner = '1',
    details = '{"mt":"best_of","ids":{"a":91,"b":92},"games":[{"n":1,"st":"finished","w":999},{"n":2,"st":"finished","w":91}]}' where id = 'zz:mb';
  perform settle_match('zz:mb');
  if (select status from bets where id = by_) <> 'void' then raise exception 'FALLO: un ganador desconocido deberia devolverse'; end if;
  -- mapa repetido o sin acabar
  select * into mm from matches where id = 'zz:mb';
  mm.details := '{"ids":{"a":91,"b":92},"games":[{"n":1,"st":"finished","w":91},{"n":1,"st":"finished","w":92}]}';
  if mk_mapa_w(mm, 1) is not null then raise exception 'FALLO: un mapa repetido deberia no saberse'; end if;
  mm.details := '{"ids":{"a":91,"b":92},"games":[{"n":1,"st":"running","w":91}]}';
  if mk_mapa_w(mm, 1) is not null then raise exception 'FALLO: un mapa sin acabar deberia no saberse'; end if;
  mm.details := '{"ids":{"a":91,"b":92},"games":[{"n":1,"st":"finished","w":92}]}';
  if mk_mapa_w(mm, 1) is distinct from '2' then raise exception 'FALLO: mapa del visitante'; end if;
  mm.details := '{"ids":{"a":91,"b":92},"games":[{"n":1,"st":"finished","w":999}]}';
  if mk_mapa_w(mm, 1) is not null then raise exception 'FALLO: un ganador que no es ninguno de los dos deberia no saberse'; end if;
  resumen := resumen || 'Forfeit, formato raro, mapas que no cuadran, sin datos y ganador desconocido: se devuelve. ';

  -- ---------- combinadas ----------
  insert into matches(id, sport, league, league_name, home, away, starts_at, status, odds_1, odds_x, odds_2, bo, details, odds_mk) values
    ('zz:k1', 'f', 'zz', 'Prueba', 'K1 A', 'K1 B', now() + interval '2 hours', 'scheduled', 2.00, 3.40, 3.60, null, '{}', '{"O2.5":2.00,"U2.5":1.80}'),
    ('zz:k2', 'v', 'zz', 'Prueba', 'K2 A', 'K2 B', now() + interval '3 hours', 'scheduled', 1.60, null, 2.40, 3, '{"mt":"best_of","ids":{"a":5,"b":6}}',
     '{"W1-1":1.80,"W2-1":1.75,"W3-1":1.90}');
  fallo := false; begin perform place_combo('[{"match":"zz:k2","pick":"W1-1"},{"match":"zz:k2","pick":"W2-1"}]', 100); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: deja dos mapas del mismo partido en una combinada'; end if;
  r := place_combo('[{"match":"zz:k1","pick":"O2.5"},{"match":"zz:k2","pick":"W2-1"}]', 100); c1 := (r->>'combo')::bigint;
  if (r->>'odds')::numeric <> 3.50 then raise exception 'FALLO: 2,00 por 1,75 deberia ser 3,50 y es %', r->>'odds'; end if;
  r := place_combo('[{"match":"zz:k1","pick":"O2.5"},{"match":"zz:k2","pick":"W3-1"}]', 100); c2 := (r->>'combo')::bigint;
  fallo := false; begin insert into combo_legs(combo_id, match_id, pick, odds) values (c2, 'zz:m7', 'W0-1', 2); exception when others then fallo := true; end;
  if not fallo then raise exception 'FALLO: las patas admiten W0-1'; end if;
  -- cash out de combinada con un mapa en directo (K2 A gano el mapa 1)
  update matches set status = 'live', starts_at = now() - interval '30 minutes',
    details = '{"mt":"best_of","ids":{"a":5,"b":6},"games":[{"n":1,"st":"finished","w":5}]}' where id = 'zz:k2';
  insert into ex_live(match_id, data, at) values ('zz:k2', '{"k":"s","a":1,"b":0,"bo":3}', now());
  q := (select x from jsonb_array_elements(combo_cash_quotes()) x where (x->>'combo')::bigint = c1);
  if not (q->>'ok')::boolean then raise exception 'FALLO: cash out de combinada con un mapa: %', q; end if;
  execute saldo into s0 using jug[1];
  update matches set status = 'final', score = '2:1', winner = '1', details = '{"r90":"2:1"}' where id = 'zz:k1';
  perform settle_match('zz:k1');
  update matches set status = 'final', score = '2:0', winner = '1',
    details = '{"mt":"best_of","ids":{"a":5,"b":6},"games":[{"n":1,"st":"finished","w":5},{"n":2,"st":"finished","w":5},{"n":3,"st":"not_played"}]}' where id = 'zz:k2';
  perform settle_match('zz:k2');
  if (select result from combo_legs where combo_id = c1 and match_id = 'zz:k2') <> 'won' then raise exception 'FALLO: pata del mapa 2 deberia ganar'; end if;
  if (select result from combo_legs where combo_id = c2 and match_id = 'zz:k2') <> 'void' then raise exception 'FALLO: pata del mapa 3 sin jugar deberia anularse'; end if;
  if (select status from combos where id = c1) <> 'won' or (select payout from combos where id = c1) <> 350 then raise exception 'FALLO: la combinada con el mapa 2 deberia cobrar 350'; end if;
  if (select status from combos where id = c2) <> 'won' or (select payout from combos where id = c2) <> 200 then raise exception 'FALLO: la combinada con el mapa 3 anulado deberia cobrar 200 (solo la otra pata)'; end if;
  execute saldo into s1 using jug[1];
  if s1 - s0 <> 550 then raise exception 'FALLO: las combinadas deberian subir 550 y suben %', s1 - s0; end if;
  resumen := resumen || 'Combinadas con mapas: una pata por partido, cash out, pago exacto y pata de mapa sin jugar anulada. ';

  -- ---------- el sincronizador ----------
  perform sync_push(sec, jsonb_build_array(jsonb_build_object('id', 'zz:s1', 'sport', 'v', 'league', 'zz', 'league_name', 'Prueba', 'home', 'S A', 'away', 'S B',
    'starts_at', now() + interval '1 day', 'status', 'scheduled', 'odds_1', 1.8, 'odds_2', 2.0, 'bo', 3, 'details', '{"mt":"best_of"}'::jsonb,
    'odds_mk', '{"W1-1":1.834,"W3-2":2,"W6-1":2,"W1-3":2,"W0-1":2,"S2-0":3.1}'::jsonb)));
  if (select odds_mk from matches where id = 'zz:s1') <> '{"W1-1":1.83,"W3-2":2.00,"S2-0":3.10}'::jsonb then
    raise exception 'FALLO: el sincronizador guarda %', (select odds_mk from matches where id = 'zz:s1'); end if;
  resumen := resumen || 'Sincronizador: guarda los mapas y tira los codigos raros. ';

  -- ---------- lo interno, cerrado ----------
  if has_function_privilege('authenticated', 'mk_mapa_w(matches, int)', 'execute') or has_function_privilege('anon', 'mk_mapa_p(text, int, int, int, numeric, numeric)', 'execute')
     or has_function_privilege('authenticated', 'mk_resultado(matches, text)', 'execute') then
    raise exception 'FALLO: las funciones internas se pueden llamar desde fuera'; end if;
  if not has_function_privilege('authenticated', 'place_bet(text, text, int)', 'execute') or not has_function_privilege('authenticated', 'cash_out_quote(bigint)', 'execute') then
    raise exception 'FALLO: los jugadores han perdido un permiso'; end if;

  raise exception 'PRUEBA SUPERADA (se deshace todo): %', resumen;
end $$;
