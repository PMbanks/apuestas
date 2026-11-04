-- Prueba de db/079_mejora_zona.sql, para el editor SQL de Supabase. Va DESPUES de 079.
-- Con V-Bucks de prueba (sin tocar skins de nadie) comprueba: una zona que empieza fuera de [0, 1) se rechaza sin cobrar; la llamada vieja
-- sin p_start funciona y gana solo si la tirada < probabilidad (zona en 0); 1.500 mejoras con la zona en sitios al azar ganan EXACTAMENTE
-- cuando (tirada - inicio) mod 1 < probabilidad, cs_upgrades guarda el inicio, y la tasa de acierto queda dentro de 3,5 sigmas de la
-- probabilidad (la zona se pone donde se ponga, la probabilidad es la misma). Al final lanza un error A PROPOSITO para que se deshaga todo.
create or replace function pg_temp.yo(u uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  perform set_config('request.jwt.claims', json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
end $f$;

do $$
declare
  a uuid := (select id from players order by created_at, username limit 1);
  t record; vb int; r jsonb; err text; s0 int; k int; n int := 1500; wins int := 0; ini double precision; ch numeric; sd numeric;
  dentro boolean; malos int := 0; resumen text := '';
begin
  insert into ledger(player, amount, kind, note) values (a, 100000000, 'ajuste', 'saldo de prueba 079');
  perform pg_temp.yo(a);
  select * into t from cs_upgrade_targets(300, 2000, null, 200) x order by x.value limit 1;
  if t.id is null then raise exception 'FALLO: no hay ningun objetivo entre 300 y 2.000'; end if;
  vb := t.value / 2;          -- x2 (o un poco mas): probabilidad ~47,5 %

  -- 1. inicio fuera de [0, 1): rechazado y sin cobrar
  s0 := (select coalesce(sum(amount), 0) from ledger where player = a);
  foreach ini in array array[-0.1, 1, 1.5]::double precision[] loop
    begin
      perform cs_upgrade('{}'::bigint[], vb, t.id, t.wear, t.st, ini);
      raise exception 'FALLO: se ha aceptado la zona en %', ini;
    exception when others then get stacked diagnostics err = message_text;
      if err like 'FALLO%' then raise exception '%', err; end if;
    end;
  end loop;
  if (select coalesce(sum(amount), 0) from ledger where player = a) <> s0 then raise exception 'FALLO: un intento rechazado ha cobrado'; end if;
  resumen := resumen || format('Zona fuera de 0..1 rechazada sin cobrar ("%s"). ', err);

  -- 2. la llamada vieja (sin p_start): zona en 0
  for k in 1..20 loop
    r := cs_upgrade('{}'::bigint[], vb, t.id, t.wear, t.st);
    if (r->>'start')::double precision <> 0 then raise exception 'FALLO: sin p_start la zona no empieza en 0'; end if;
    if (r->>'won')::boolean <> ((r->>'roll')::double precision < (r->>'chance')::numeric) then raise exception 'FALLO: llamada vieja: % ', r; end if;
  end loop;
  resumen := resumen || '20 llamadas viejas sin p_start: zona en 0, gana si tirada < probabilidad. ';

  -- 3. zona en sitios al azar: se gana exactamente si la tirada cae dentro (contando la vuelta)
  for k in 1..n loop
    ini := floor(random() * 1000000) / 1000000;
    r := cs_upgrade('{}'::bigint[], vb, t.id, t.wear, t.st, ini);
    ch := (r->>'chance')::numeric;
    dentro := (((r->>'roll')::double precision - ini) - floor((r->>'roll')::double precision - ini)) < ch;
    if (r->>'won')::boolean <> dentro or abs((r->>'start')::double precision - ini) > 1e-12 then malos := malos + 1; end if;
    if (select inicio from cs_upgrades where id = (r->>'id')::bigint) <> ini then raise exception 'FALLO: cs_upgrades no guarda el inicio'; end if;
    if (r->>'won')::boolean then wins := wins + 1; end if;
  end loop;
  if malos > 0 then raise exception 'FALLO: % mejoras no cuadran con su zona', malos; end if;
  sd := sqrt(n * ch * (1 - ch));
  if abs(wins - n * ch) > 3.5 * sd then raise exception 'FALLO: % ganadas de % y se esperaban % (+-%)', wins, n, round(n * ch, 1), round(3.5 * sd, 1); end if;
  resumen := resumen || format('%s mejoras con la zona al azar: todas cuadran; %s ganadas, se esperaban %s (+-%s, probabilidad %s %%). ',
    n, wins, round(n * ch, 1), round(3.5 * sd, 1), round(100 * ch, 3));

  raise exception 'PRUEBA SUPERADA (no se ha guardado nada). %', resumen;
end $$;
