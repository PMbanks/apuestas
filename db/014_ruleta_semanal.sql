-- Decimocuarta parte (30-10): ruleta de la semana. Una tirada por jugador y semana (de lunes a lunes, hora de Madrid):
-- V-Bucks o una caja de CS2 gratis que se abre sola y va al inventario. El azar, en el servidor.
create table if not exists wheel_spins (
  id bigint generated always as identity primary key,
  player uuid not null references players on delete cascade,
  week date not null,
  prize int not null,
  label text not null,
  amount int not null default 0,
  inv_id bigint references cs_inv on delete set null,
  created_at timestamptz not null default now(),
  unique (player, week)
);
alter table wheel_spins enable row level security;
drop policy if exists wheel_read on wheel_spins;
create policy wheel_read on wheel_spins for select to authenticated using (is_player());

-- los 8 premios, en el orden de la rueda del navegador:
-- 0: 50 (24 %) · 1: caja barata (16 %) · 2: 100 (20 %) · 3: 250 (13 %) · 4: caja buena (5 %) · 5: 500 (6 %) · 6: 150 (14 %) · 7: 1.000 (2 %)
create or replace function spin_wheel() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); wk date := madrid_week(); x double precision := cs_rand(); idx int; amt int := 0; caja text; d record; iid bigint; lab text;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  perform pg_advisory_xact_lock(hashtext(me::text));
  if exists (select 1 from wheel_spins where player = me and week = wk) then raise exception 'Ya has girado esta semana. Vuelve el lunes'; end if;
  idx := case when x < .24 then 0 when x < .40 then 1 when x < .60 then 2 when x < .73 then 3 when x < .78 then 4 when x < .84 then 5 when x < .98 then 6 else 7 end;
  amt := (array[50, 0, 100, 250, 0, 500, 150, 1000])[idx + 1];
  if idx in (1, 4) then
    if idx = 1 then select id into caja from (select id from cs_cases where active order by price asc limit 5) c order by cs_rand() limit 1;
    else select id into caja from (select id from cs_cases where active order by price desc limit 3) c order by cs_rand() limit 1; end if;
    select * into d from cs_roll(caja);
    insert into cs_inv(player, item_id, wear, fl, st, value, case_id, opened_by)
      values (me, d.o_item, d.o_wear, d.o_fl, d.o_st, d.o_value, caja, me) returning id into iid;
    lab := 'Caja gratis: ' || (select name from cs_cases where id = caja);
  else
    insert into ledger(player, amount, kind, note, week) values (me, amt, 'ruleta_semana', 'Ruleta de la semana', wk);
    lab := '+' || fmt_int(amt) || ' V-Bucks';
  end if;
  insert into wheel_spins(player, week, prize, label, amount, inv_id) values (me, wk, idx, lab, amt, iid);
  perform bump();
  return jsonb_build_object('prize', idx, 'label', lab, 'amount', amt,
    'item', case when iid is null then null else (select cs_inv_j(i) from cs_inv i where i.id = iid) end);
end $$;
revoke all on function spin_wheel() from public, anon;
grant execute on function spin_wheel() to authenticated;
