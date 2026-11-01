-- 051 (01-11). PM: "lo de cada 3 dias no me gusta demasiado, podriamos meterle un poquito mas de dinero; 25 no es absolutamente nada".
-- La ruleta individual (una tirada cada 3 dias, db/047) sube sus premios y deja las MISMAS probabilidades:
--   antes 25 · 50 · 75 · 100 · 200 · 400  ->  ahora 50 · 75 · 100 · 150 · 300 · 600 (y las dos cajas igual).
--   Valor medio por tirada: antes 38,3 -> ahora 88,3 (2,3 tiradas a la semana: de unos 135 a unos 205 V-Bucks).
-- Solo redefine spin_wheel(). Se puede ejecutar varias veces. Va despues de 047.

create or replace function spin_wheel() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); per date := ruleta_periodo(madrid_day()); x double precision := cs_rand(); idx int; amt int := 0; caja text; oid bigint; lab text;
  ini timestamptz := (ruleta_periodo(madrid_day())::timestamp at time zone 'Europe/Madrid'); sig date := ruleta_periodo(madrid_day()) + 3;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  perform pg_advisory_xact_lock(hashtext(me::text));
  if exists (select 1 from wheel_spins where player = me and (week = per or created_at >= ini)) then
    raise exception 'Ya has girado. La siguiente tirada, %', case when sig = madrid_day() + 1 then 'mañana' else 'el ' || to_char(sig, 'DD/MM') end;
  end if;
  -- 50 (34 %) · caja barata (6,5 %) · 75 (25 %) · 150 (12 %) · caja buena (2 %) · 300 (5 %) · 100 (14,5 %) · 600 (1 %)
  idx := case when x < .34 then 0 when x < .405 then 1 when x < .655 then 2 when x < .775 then 3 when x < .795 then 4 when x < .845 then 5 when x < .99 then 6 else 7 end;
  amt := (array[50, 0, 75, 150, 0, 300, 100, 600])[idx + 1];
  if idx in (1, 4) then
    if idx = 1 then select id into caja from (select id from cs_cases where active and coalesce(cat, 'skins') = 'skins' order by price asc limit 5) c order by cs_rand() limit 1;
    else select id into caja from (select id from cs_cases where active and coalesce(cat, 'skins') = 'skins' order by price desc limit 3) c order by cs_rand() limit 1; end if;
    insert into cs_owned(player, case_id, source) values (me, caja, 'ruleta') returning id into oid;
    lab := 'Caja gratis: ' || (select name from cs_cases where id = caja);
  else
    insert into ledger(player, amount, kind, note, week) values (me, amt, 'ruleta_semana', 'Ruleta de premios', per);
    lab := '+' || fmt_int(amt) || ' V-Bucks';
  end if;
  insert into wheel_spins(player, week, prize, label, amount) values (me, per, idx, lab, amt);
  perform bump();
  return jsonb_build_object('prize', idx, 'label', lab, 'amount', amt, 'periodo', per, 'siguiente', sig,
    'box', case when oid is null then null else jsonb_build_object('id', oid, 'case', caja) end);
end $$;
revoke all on function spin_wheel() from public, anon;
grant execute on function spin_wheel() to authenticated;
