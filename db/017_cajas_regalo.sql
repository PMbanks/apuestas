-- Decimoseptima parte (30-10). PM: "si me toca en el weekly spin una caja, que sea la caja para abrirla en el inventario,
-- no la skin ya, porque si no no tiene gracia; resetea lo de la weekly".
create table if not exists cs_owned (
  id bigint generated always as identity primary key,
  player uuid not null references players on delete cascade,
  case_id text not null references cs_cases,
  source text not null default 'ruleta',
  status text not null default 'own' check (status in ('own', 'used')),
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create index if not exists cs_owned_player on cs_owned(player, status);
alter table cs_owned enable row level security;
drop policy if exists cs_owned_read on cs_owned;
create policy cs_owned_read on cs_owned for select to authenticated using (is_player());

-- abrir una caja que ya es tuya (sin pagar)
create or replace function cs_open_owned(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); o cs_owned; d record; iid bigint;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  select * into o from cs_owned where id = p_id and player = me for update;
  if o.id is null then raise exception 'Esa caja no es tuya'; end if;
  if o.status <> 'own' then raise exception 'Esa caja ya está abierta'; end if;
  update cs_owned set status = 'used', used_at = now() where id = p_id;
  select * into d from cs_roll(o.case_id);
  insert into cs_inv(player, item_id, wear, fl, st, value, case_id, opened_by)
    values (me, d.o_item, d.o_wear, d.o_fl, d.o_st, d.o_value, o.case_id, me) returning id into iid;
  perform bump();
  return jsonb_build_object('items', jsonb_build_array((select cs_inv_j(i) from cs_inv i where i.id = iid)), 'caja', o.case_id);
end $$;
revoke all on function cs_open_owned(bigint) from public, anon;
grant execute on function cs_open_owned(bigint) to authenticated;

-- la ruleta: la caja va entera al inventario
create or replace function spin_wheel() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); wk date := madrid_week(); x double precision := cs_rand(); idx int; amt int := 0; caja text; oid bigint; lab text;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  perform pg_advisory_xact_lock(hashtext(me::text));
  if exists (select 1 from wheel_spins where player = me and week = wk) then raise exception 'Ya has girado esta semana. Vuelve el lunes'; end if;
  idx := case when x < .24 then 0 when x < .40 then 1 when x < .60 then 2 when x < .73 then 3 when x < .78 then 4 when x < .84 then 5 when x < .98 then 6 else 7 end;
  amt := (array[50, 0, 100, 250, 0, 500, 150, 1000])[idx + 1];
  if idx in (1, 4) then
    if idx = 1 then select id into caja from (select id from cs_cases where active and coalesce(cat, 'skins') = 'skins' order by price asc limit 5) c order by cs_rand() limit 1;
    else select id into caja from (select id from cs_cases where active and coalesce(cat, 'skins') = 'skins' order by price desc limit 3) c order by cs_rand() limit 1; end if;
    insert into cs_owned(player, case_id, source) values (me, caja, 'ruleta') returning id into oid;
    lab := 'Caja gratis: ' || (select name from cs_cases where id = caja);
  else
    insert into ledger(player, amount, kind, note, week) values (me, amt, 'ruleta_semana', 'Ruleta de la semana', wk);
    lab := '+' || fmt_int(amt) || ' V-Bucks';
  end if;
  insert into wheel_spins(player, week, prize, label, amount) values (me, wk, idx, lab, amt);
  perform bump();
  return jsonb_build_object('prize', idx, 'label', lab, 'amount', amt, 'box', case when oid is null then null else jsonb_build_object('id', oid, 'case', caja) end);
end $$;

-- reset de la tirada de PM de esta semana (la caja se le abrio sola: se quita esa skin y vuelve a girar)
delete from cs_inv where id = (select inv_id from wheel_spins where week = madrid_week() and player = (select id from players where username = 'pm')) and status = 'own';
delete from wheel_spins where week = madrid_week() and player = (select id from players where username = 'pm');
