-- 042 (01-11). RETOS ABIERTOS A CUALQUIERA. PM: "que se pueda challengear a todo el mundo, es decir que no elijas a alguien,
-- simplemente dejas tu bet y que alguien pueda entrar al challenge, y que notifique si alguien entra. Los challenges no se pueden
-- cancelar".
-- Un reto abierto es un reto con to_player = null: lo ve todo el mundo (la politica challenges_read ya deja leer todos y get_extras
-- ya los manda con "to": null) y entra el PRIMERO que llama a challenge_join. Entonces to_player = el que entra y el reto se paga como
-- siempre (settle_challenges no cambia). Si nadie entra antes de empezar el partido, settle_challenges lo expira y devuelve lo
-- puesto, igual que un reto a un amigo sin contestar.
--   challenge_create(p_match, p_to, p_pick, p_stake)  p_to = null -> reto abierto (antes "Elige a un colega").
--   challenge_join(p_id, p_pick)                       entra en un reto abierto con un resultado distinto al del que reto.
--                                                      Dos que entran a la vez: el reto se bloquea con for update, el segundo
--                                                      ve que ya esta aceptado y recibe "Ya ha entrado otro".
--   challenge_answer(...)                              ya no deja que conteste cualquiera a un reto abierto (to_player null).
--   challenge_cancel(p_id)                             los retos no se cancelan: ahora siempre da error.
-- La app (retos.js) prueba si challenge_join existe para ensenar o no "Cualquiera"; con 042 sin cargar todo sigue como antes.
-- Se puede ejecutar varias veces.

alter table challenges alter column to_player drop not null;

create or replace function challenge_create(p_match text, p_to uuid, p_pick text, p_stake int) returns bigint
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); m matches; bal int; cid bigint;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  if p_to is not null and (p_to = me or not exists (select 1 from players where id = p_to)) then raise exception 'Elige a un amigo'; end if;
  select * into m from matches where id = p_match;
  if not found or m.status <> 'scheduled' or m.starts_at <= now() then raise exception 'Ese partido ya ha empezado'; end if;
  if p_pick not in ('1','X','2') or (p_pick = 'X' and m.odds_x is null) then raise exception 'Elige 1, X o 2'; end if;
  if p_stake is null or p_stake < 1 then raise exception 'El reto mínimo es 1'; end if;
  perform pay_week();
  perform pg_advisory_xact_lock(hashtext(me::text));
  select coalesce(sum(amount), 0) into bal from ledger where player = me;
  if p_stake > bal then raise exception 'No tienes saldo suficiente: te quedan %', fmt_int(bal); end if;
  insert into challenges(match_id, from_player, to_player, from_pick, stake) values (p_match, me, p_to, p_pick, p_stake) returning id into cid;
  insert into ledger(player, amount, kind, note)
    values (me, -p_stake, 'apuesta', case when p_to is null then 'Reto abierto: ' else 'Reto a ' || pname(p_to) || ': ' end || pick_name(m, p_pick));
  insert into chat(body)
    values (pname(me) || case when p_to is null then ' abre un reto para cualquiera: ' else ' reta a ' || pname(p_to) || ': ' end
            || m.home || ' vs ' || m.away || ', ' || fmt_int(p_stake) || ' a ' || pick_name(m, p_pick));
  perform bump();
  return cid;
end $$;

create or replace function challenge_join(p_id bigint, p_pick text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c challenges; m matches; bal int;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  select * into c from challenges where id = p_id for update;
  if not found then raise exception 'Ese reto no existe'; end if;
  if c.status <> 'pending' then raise exception 'Ya ha entrado otro o el reto está cerrado'; end if;
  if c.to_player is not null then raise exception 'Ese reto no es abierto'; end if;
  if c.from_player = me then raise exception 'No puedes entrar en tu propio reto'; end if;
  select * into m from matches where id = c.match_id;
  if m.status <> 'scheduled' or m.starts_at <= now() then raise exception 'Ese partido ya ha empezado'; end if;
  if p_pick is null or p_pick = c.from_pick or p_pick not in ('1','X','2') or (p_pick = 'X' and m.odds_x is null) then raise exception 'Elige un resultado distinto al suyo'; end if;
  perform pay_week();
  perform pg_advisory_xact_lock(hashtext(me::text));
  select coalesce(sum(amount), 0) into bal from ledger where player = me;
  if c.stake > bal then raise exception 'No tienes saldo suficiente: te quedan %', fmt_int(bal); end if;
  update challenges set status = 'accepted', to_player = me, to_pick = p_pick where id = c.id;
  insert into ledger(player, amount, kind, note) values (me, -c.stake, 'apuesta', 'Reto de ' || pname(c.from_player) || ': ' || pick_name(m, p_pick));
  insert into chat(body) values (pname(me) || ' entra en el reto de ' || pname(c.from_player) || ': ' || pick_name(m, c.from_pick) || ' contra ' || pick_name(m, p_pick) || ', ' || fmt_int(c.stake * 2) || ' en juego');
  perform bump();
end $$;

-- igual que en 004, pero un reto abierto (to_player null) ya no lo puede contestar cualquiera por aqui: se entra con challenge_join
create or replace function challenge_answer(p_id bigint, p_accept boolean, p_pick text default null) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c challenges; m matches; bal int;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  select * into c from challenges where id = p_id for update;
  if not found or c.to_player is distinct from me then raise exception 'Ese reto no es para ti'; end if;
  if c.status <> 'pending' then raise exception 'Ese reto ya está cerrado'; end if;
  select * into m from matches where id = c.match_id;
  if not p_accept then
    update challenges set status = 'declined', settled_at = now() where id = c.id;
    insert into ledger(player, amount, kind, note) values (c.from_player, c.stake, 'devolucion', 'Reto rechazado por ' || pname(me));
    insert into chat(body) values (pname(me) || ' no acepta el reto de ' || pname(c.from_player) || ' (' || m.home || ' vs ' || m.away || ')');
    perform bump(); return;
  end if;
  if m.status <> 'scheduled' or m.starts_at <= now() then raise exception 'Ese partido ya ha empezado'; end if;
  if p_pick is null or p_pick = c.from_pick or p_pick not in ('1','X','2') or (p_pick = 'X' and m.odds_x is null) then raise exception 'Elige un resultado distinto al suyo'; end if;
  perform pay_week();
  perform pg_advisory_xact_lock(hashtext(me::text));
  select coalesce(sum(amount), 0) into bal from ledger where player = me;
  if c.stake > bal then raise exception 'No tienes saldo suficiente: te quedan %', fmt_int(bal); end if;
  update challenges set status = 'accepted', to_pick = p_pick where id = c.id;
  insert into ledger(player, amount, kind, note) values (me, -c.stake, 'apuesta', 'Reto de ' || pname(c.from_player) || ': ' || pick_name(m, p_pick));
  insert into chat(body) values (pname(me) || ' acepta el reto de ' || pname(c.from_player) || ': ' || pick_name(m, c.from_pick) || ' contra ' || pick_name(m, p_pick) || ', ' || fmt_int(c.stake * 2) || ' en juego');
  perform bump();
end $$;

-- los retos no se cancelan: lo puesto solo vuelve si nadie entra (o el amigo rechaza) antes de que empiece el partido
create or replace function challenge_cancel(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Un reto no se puede cancelar';
end $$;

-- ---------- quien puede llamar a que ----------
revoke all on function challenge_join(bigint, text) from public, anon;
grant execute on function challenge_join(bigint, text) to authenticated;
