-- Prueba de db/070_paga_reclamar.sql, para el editor SQL de Supabase. Va DESPUES de 070.
-- Hace como si la semana empezara ahora (borra, solo dentro de la prueba, la paga y el aviso de esta semana) y comprueba:
-- pay_week() ya no paga a nadie y deja UN solo aviso en el chat aunque se llame varias veces; paga_estado dice que no esta reclamada;
-- claim_week() da la paga una vez (ledger +N, kind paga, semana de hoy) y la segunda vez falla; paga_estado pasa a reclamada;
-- otro jugador la reclama aparte; nadie recibe el aviso viejo "Ya tienes la paga del lunes"; y un jugador que ya la tenia (como esta
-- semana, que entro sola) no la puede cobrar otra vez. Al final lanza un error A PROPOSITO para que se deshaga todo.
create or replace function pg_temp.yo(u uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  perform set_config('request.jwt.claims', json_build_object('sub', u::text, 'role', 'authenticated')::text, true);
end $f$;

do $$
declare
  jug uuid[] := array(select id from players order by created_at, username);
  a uuid; b uuid; wk date := madrid_week(); amt int := (select (value #>> '{}')::int from settings where key = 'weekly_amount');
  fin timestamptz := (madrid_week()::timestamp at time zone 'Europe/Madrid');
  s0 int; s1 int; r jsonb; n int; err text; resumen text := ''; habia int;
begin
  if cardinality(jug) < 2 then raise exception 'FALLO: hacen falta dos jugadores'; end if;
  a := jug[1]; b := jug[2];
  habia := (select count(*) from ledger where kind = 'paga' and week = wk);
  resumen := resumen || format('Esta semana ya tenian la paga %s de %s jugadores (entro sola antes de 070). ', habia, cardinality(jug));

  -- 0. quien ya la tiene esta semana no la cobra otra vez
  if exists (select 1 from ledger where player = a and kind = 'paga' and week = wk) then
    perform pg_temp.yo(a);
    begin perform claim_week(); raise exception 'FALLO: ha cobrado dos veces la paga de esta semana';
    exception when others then get stacked diagnostics err = message_text; if err like 'FALLO%' then raise exception '%', err; end if; end;
    resumen := resumen || 'Quien ya la tenia no la cobra otra vez. ';
  end if;

  -- 1. semana nueva de mentira: sin pagas ni aviso de esta semana
  delete from ledger where kind = 'paga' and week = wk;
  delete from chat where player is null and created_at >= fin and (body like 'Paga del lunes%' or body like 'Resumen de la semana%');
  perform pay_week(); perform pay_week(); perform pay_week();
  if exists (select 1 from ledger where kind = 'paga' and week = wk) then raise exception 'FALLO: pay_week sigue pagando sola'; end if;
  select count(*) into n from chat where player is null and created_at >= fin and body like 'Paga del lunes%';
  if n <> 1 then raise exception 'FALLO: el aviso de la paga sale % veces (tiene que ser 1)', n; end if;
  if (select body from chat where player is null and created_at >= fin and body like 'Paga del lunes%') not like '%Reclámala en Recompensas' then
    raise exception 'FALLO: el aviso del chat no dice que se reclama';
  end if;
  resumen := resumen || 'pay_week no paga y avisa una sola vez. ';

  -- 2. el jugador 1 la reclama
  perform pg_temp.yo(a);
  r := paga_estado();
  if (r->>'claimed')::boolean or (r->>'amount')::int <> amt or (r->>'week')::date <> wk then raise exception 'FALLO: paga_estado antes de reclamar: %', r; end if;
  s0 := (select coalesce(sum(amount), 0) from ledger where player = a);
  if claim_week() <> amt then raise exception 'FALLO: claim_week no devuelve la paga'; end if;
  s1 := (select coalesce(sum(amount), 0) from ledger where player = a);
  if s1 - s0 <> amt then raise exception 'FALLO: el saldo ha subido % y la paga es %', s1 - s0, amt; end if;
  if (select count(*) from ledger where player = a and kind = 'paga' and week = wk) <> 1 then raise exception 'FALLO: no hay un unico apunte de paga'; end if;
  begin perform claim_week(); raise exception 'FALLO: se ha podido reclamar dos veces';
  exception when others then get stacked diagnostics err = message_text; if err like 'FALLO%' then raise exception '%', err; end if; end;
  if (select coalesce(sum(amount), 0) from ledger where player = a) <> s1 then raise exception 'FALLO: el segundo intento ha movido dinero'; end if;
  if not (paga_estado()->>'claimed')::boolean then raise exception 'FALLO: paga_estado no la marca como reclamada'; end if;
  resumen := resumen || format('El 1 reclama +%s una vez; el segundo intento: "%s". ', amt, err);

  -- 3. el 2 no la tiene hasta que la pide
  perform pg_temp.yo(b);
  if exists (select 1 from ledger where player = b and kind = 'paga' and week = wk) then raise exception 'FALLO: el 2 tiene paga sin pedirla'; end if;
  perform claim_week();
  if (select count(*) from ledger where kind = 'paga' and week = wk) <> 2 then raise exception 'FALLO: tiene que haber justo 2 pagas esta semana'; end if;
  resumen := resumen || 'El 2 la reclama aparte; los demas siguen sin ella. ';

  -- 4. sin el aviso viejo "Ya tienes la paga del lunes"
  if to_regclass('public.avisos') is not null then
    if exists (select 1 from avisos where titulo = 'Ya tienes la paga del lunes' and creado >= now() - interval '1 minute') then
      raise exception 'FALLO: sigue saliendo el aviso viejo de la paga';
    end if;
  end if;

  raise exception 'PRUEBA SUPERADA: %', resumen;
end $$;
