-- 029 (30-10 noche). Combinadas. PM: "has hecho lo de las apuestas combinadas? no es facil de ver" y "hazlo".
-- Una combinada es UNA apuesta con 2 a 8 partidos distintos: la cuota es el producto de sus cuotas (tope 1.000) y solo cobra
-- si aciertas todos. Un partido anulado cuenta como cuota 1 y el resto sigue; si se anulan todos, se devuelve lo apostado.
-- Se puede cancelar (devuelve todo) hasta que empiece el primero de sus partidos. Sin cash out por ahora.
-- El dinero va al ledger con los mismos tipos que una apuesta suelta (apuesta, premio, devolucion) y sin bet_id: la Liga,
-- el bote, los premios de la semana y el monedero la cuentan sin tocar nada mas.
-- Se paga sola: cuando un partido queda cerrado (matches.settled pasa a true, lo hacen settle_match y el sincronizador),
-- un trigger resuelve las patas de ese partido. Se puede ejecutar varias veces. Va despues de 001 a 028.

create table if not exists combos (
  id bigint generated always as identity primary key,
  player uuid not null references players on delete cascade,
  stake int not null check (stake >= 1),
  odds numeric(10,2) not null check (odds > 1),
  status text not null default 'open' check (status in ('open', 'won', 'lost', 'void')),
  payout int,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index if not exists combos_player on combos(player, created_at desc);
create table if not exists combo_legs (
  combo_id bigint not null references combos on delete cascade,
  match_id text not null references matches,                       -- sin cascade: un partido con combinadas no se borra
  pick text not null check (pick in ('1', 'X', '2')),
  odds numeric(6,2) not null check (odds > 1),
  result text check (result in ('won', 'lost', 'void')),
  primary key (combo_id, match_id)
);
create index if not exists combo_legs_match on combo_legs(match_id);
alter table combos enable row level security;
alter table combo_legs enable row level security;
drop policy if exists combos_read on combos;         create policy combos_read on combos for select to authenticated using (is_player());
drop policy if exists combo_legs_read on combo_legs; create policy combo_legs_read on combo_legs for select to authenticated using (is_player());

-- ---------- apostar ----------
create or replace function place_combo(p_legs jsonb, p_stake int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); l jsonb; m matches; o numeric; tot numeric := 1; n int; bal int; cid bigint; vistos text[] := '{}';
begin
  if me is null or not exists (select 1 from players where id = me) then raise exception 'Tienes que entrar primero'; end if;
  perform pay_week();
  if p_legs is null or jsonb_typeof(p_legs) <> 'array' then raise exception 'Elige los partidos de la combinada'; end if;
  n := jsonb_array_length(p_legs);
  if n < 2 then raise exception 'Una combinada lleva 2 partidos como mínimo'; end if;
  if n > 8 then raise exception 'Una combinada lleva 8 partidos como máximo'; end if;
  if p_stake is null or p_stake < 1 then raise exception 'La apuesta mínima es 1'; end if;
  perform pg_advisory_xact_lock(hashtext(me::text));
  for l in select * from jsonb_array_elements(p_legs) loop
    select * into m from matches where id = l->>'match';
    if not found then raise exception 'Ese partido no existe'; end if;
    if m.id = any(vistos) then raise exception 'Una combinada no puede llevar dos veces el mismo partido'; end if;
    vistos := vistos || m.id;
    if m.status <> 'scheduled' or m.starts_at <= now() then raise exception '% vs % ya ha empezado: quítalo de la combinada', m.home, m.away; end if;
    if coalesce(l->>'pick', '') not in ('1', 'X', '2') then raise exception 'Elige 1, X o 2'; end if;
    o := case l->>'pick' when '1' then m.odds_1 when 'X' then m.odds_x else m.odds_2 end;
    if o is null or o <= 1 then raise exception 'Esa opción de % vs % no se puede apostar', m.home, m.away; end if;
    tot := tot * o;
  end loop;
  tot := least(round(tot, 2), 1000);
  select coalesce(sum(amount), 0) into bal from ledger where player = me;
  if p_stake > bal then raise exception 'No tienes saldo suficiente: te quedan %', fmt_int(bal); end if;
  insert into combos(player, stake, odds) values (me, p_stake, tot) returning id into cid;
  insert into combo_legs(combo_id, match_id, pick, odds)
    select cid, x->>'match', x->>'pick', case x->>'pick' when '1' then mm.odds_1 when 'X' then mm.odds_x else mm.odds_2 end
    from jsonb_array_elements(p_legs) x join matches mm on mm.id = x->>'match';
  insert into ledger(player, amount, kind, note) values (me, -p_stake, 'apuesta', 'Combinada de ' || n || ' · cuota ' || fmt_odds(tot));
  insert into chat(body) select p.name || ' hace una combinada de ' || n || ' partidos por ' || fmt_int(p_stake) || ' a cuota ' || fmt_odds(tot) from players p where p.id = me;
  perform bump();
  return jsonb_build_object('combo', cid, 'odds', tot, 'saldo', bal - p_stake);
end $$;

-- ---------- cancelar (hasta que empiece el primero de sus partidos) ----------
create or replace function cancel_combo(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c combos;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  select * into c from combos where id = p_id for update;
  if not found or c.player <> me then raise exception 'Esa combinada no es tuya'; end if;
  if c.status <> 'open' then raise exception 'Esa combinada ya está cerrada'; end if;
  if exists (select 1 from combo_legs l join matches m on m.id = l.match_id
             where l.combo_id = p_id and (m.status <> 'scheduled' or m.starts_at <= now())) then
    raise exception 'Ya ha empezado uno de sus partidos: no se puede cancelar';
  end if;
  update combos set status = 'void', payout = c.stake, settled_at = now() where id = p_id;
  insert into ledger(player, amount, kind, note) values (me, c.stake, 'devolucion', 'Combinada cancelada');
  perform bump();
  return jsonb_build_object('devuelto', c.stake, 'saldo', (select coalesce(sum(amount), 0) from ledger where player = me));
end $$;

-- ---------- pagar: las patas de un partido cerrado y las combinadas que ya se saben ----------
create or replace function combo_resuelve(p_match text) returns int
language plpgsql security definer set search_path = public as $$
declare m matches; c combos; n int := 0; pend int; perd int; gan int; prod numeric; pay int; nm text;
begin
  select * into m from matches where id = p_match;
  if not found or m.status not in ('final', 'canceled') then return 0; end if;
  update combo_legs l set result = case when m.status = 'canceled' or m.winner is null then 'void' when l.pick = m.winner then 'won' else 'lost' end
    where l.match_id = p_match and l.result is null;
  for c in select * from combos where status = 'open' and id in (select combo_id from combo_legs where match_id = p_match) for update loop
    select count(*) filter (where result is null), count(*) filter (where result = 'lost'), count(*) filter (where result = 'won'),
           coalesce(exp(sum(ln(odds)) filter (where result = 'won')), 1)
      into pend, perd, gan, prod from combo_legs where combo_id = c.id;
    nm := (select name from players where id = c.player);
    if perd > 0 then
      update combos set status = 'lost', settled_at = now() where id = c.id;
      insert into chat(body) values (nm || ' perdió una combinada de ' || fmt_int(c.stake));
    elsif pend = 0 and gan = 0 then
      update combos set status = 'void', payout = c.stake, settled_at = now() where id = c.id;
      insert into ledger(player, amount, kind, note) values (c.player, c.stake, 'devolucion', 'Combinada anulada');
    elsif pend = 0 then
      prod := least(round(prod, 2), 1000);
      pay := round(c.stake * prod)::int;
      update combos set status = 'won', payout = pay, settled_at = now() where id = c.id;
      insert into ledger(player, amount, kind, note) values (c.player, pay, 'premio', 'Combinada · cuota ' || fmt_odds(prod));
      insert into chat(body) values (nm || ' ganó ' || fmt_int(pay) || ' con una combinada de ' || (pend + gan + perd) || ' partidos');
    end if;
    n := n + 1;
  end loop;
  if n > 0 then perform bump(); end if;
  return n;
end $$;

create or replace function combo_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.settled and not coalesce(old.settled, false) then perform combo_resuelve(new.id); end if;
  return null;
end $$;
drop trigger if exists combo_settle on matches;
create trigger combo_settle after update of settled on matches for each row execute function combo_trg();

revoke all on function place_combo(jsonb, int), cancel_combo(bigint) from public, anon;
grant execute on function place_combo(jsonb, int), cancel_combo(bigint) to authenticated;
revoke all on function combo_resuelve(text), combo_trg() from public, anon, authenticated;
