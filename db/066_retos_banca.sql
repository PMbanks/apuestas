-- 066 (02-11). RETOS CONTRA LA BANCA Y CONTRA LOS RIVALES. PM:
--   "lo del challenge es que si gana ese equipo ganamos lo que ha apostado el otro rival y el ratio que ganariamos a la banca si
--    apostaramos que gana ese equipo"; "si nadie acepta el challenge se deja tu bet igual, es decir cuenta tu bet con el ratio que
--    salia cuando le diste"; "que se pueda elegir manualmente el dinero que quieres ponerle".
--
-- MODELO (retos NUEVOS, challenges.v2 = true). Entrar en un reto (crearlo, aceptarlo o unirse) es hacer una APUESTA NORMAL a la banca
-- (una fila de bets con la cuota de tu lado en ese momento, congelada como en place_bet, y bets.challenge_id = el reto). La paga
-- settle_match como cualquier otra apuesta: si aciertas cobras stake x cuota (que ya incluye tu stake), si fallas la pierdes, si el
-- partido se anula se te devuelve. El reto solo AÑADE el bote de los rivales: cuando acaba, lo que pusieron los que fallan se reparte
-- entre los que aciertan en proporcion a lo que puso cada uno (todos ponen lo mismo, asi que a partes iguales; lo que no divide exacto,
-- de una en una a los primeros del lado ganador). Ese extra queda en bets.reto_extra y en el monedero como 'premio'.
--   Ejemplo: 100 contra 100, tu cuota 1,65 y ganas: cobras 165 (la banca) + 100 (el rival) = 265. El rival pierde sus 100.
--   Nadie acepta antes de empezar (o el amigo dice que no): el reto se cierra (expired / declined) y tu apuesta sigue como una
--     apuesta normal con la cuota de cuando retaste. Ya no se devuelve nada.
--   Gana un lado en el que no hay nadie (por ejemplo el empate en un 1 contra 2): todos fallan su apuesta a la banca, no hay bote
--     que repartir (estado won_other con win_pick = el lado que gano).
--   Partido anulado o sin resultado: settle_match devuelve cada apuesta; el reto queda void.
--   Retirar: challenge_cancel deja a quien reta retirar su reto mientras NADIE mas haya entrado y no haya empezado el partido (devuelve
--     todo, el reto queda 'canceled' y su apuesta anulada). Con alguien dentro ya no. La apuesta de un reto no se cancela por cancel_bet
--     (solo por challenge_cancel) y no se vende (cash out) mientras el reto tenga rivales: el bote
--     depende de que todos sigan dentro. Si se queda sin rival es una apuesta normal y se puede vender como cualquier otra.
--   Sin cuota mejorada en los retos (la cuota es la del partido, con el +5 % que ya pone el sync).
--   Importe: de 1 a 100.000, y no mas de tu saldo. Quien entra pone lo mismo que quien reta (como hasta ahora).
-- RETOS VIEJOS (v2 = false: todos los creados antes de cargar esto): se siguen pagando EXACTAMENTE como en 053 (sin apuesta a la banca,
-- el bote se reparte a partes iguales, sin rival o sin ganador se devuelve). challenge_join y challenge_answer miran v2 para saber
-- que hacer. Lo ya liquidado no se toca.
-- get_retos: las entradas de un reto v2 llevan ademas [cuota, id de la apuesta, extra cobrado, estado de la apuesta, pago] y 'v': true.
-- Los avisos al movil (060) se reescriben solo si 060 esta cargada; si se carga 060 DESPUES de esto, volver a pasar este fichero.
-- Se puede ejecutar varias veces. Todo UPDATE lleva su WHERE (pg-safeupdate).

-- ---------- columnas ----------
alter table challenges add column if not exists v2 boolean not null default false;
alter table bets add column if not exists challenge_id bigint references challenges(id) on delete set null;
alter table bets add column if not exists reto_extra int;
create index if not exists bets_challenge on bets(challenge_id) where challenge_id is not null;

-- ---------- la apuesta a la banca de una entrada de reto ----------
create or replace function reto_apuesta(p_ch bigint, p_player uuid, m matches, p_pick text, p_stake int, p_nota text) returns bigint
language plpgsql security definer set search_path = public as $$
declare o numeric; bid bigint;
begin
  o := mk_cuota(m, p_pick);
  if o is null or o <= 1 then raise exception 'Ese lado no tiene cuota ahora mismo: no se puede retar'; end if;
  insert into bets(player, match_id, pick, stake, odds, challenge_id) values (p_player, m.id, p_pick, p_stake, o, p_ch) returning id into bid;
  insert into ledger(player, amount, kind, note, bet_id) values (p_player, -p_stake, 'apuesta', p_nota || pick_name(m, p_pick) || ' ' || fmt_odds(o), bid);
  return bid;
end $$;

-- ---------- crear un reto (de 042; ahora siempre v2, con su apuesta y con tope de 100.000) ----------
create or replace function challenge_create(p_match text, p_to uuid, p_pick text, p_stake int) returns bigint
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); m matches; bal int; cid bigint;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  if p_to is not null and (p_to = me or not exists (select 1 from players where id = p_to)) then raise exception 'Elige a un amigo'; end if;
  select * into m from matches where id = p_match;
  if not found or m.status <> 'scheduled' or m.starts_at <= now() then raise exception 'Ese partido ya ha empezado'; end if;
  if p_pick is null or p_pick not in ('1','X','2') or (p_pick = 'X' and m.odds_x is null) then raise exception 'Elige 1, X o 2'; end if;
  if p_stake is null or p_stake < 1 then raise exception 'El reto mínimo es 1'; end if;
  if p_stake > 100000 then raise exception 'El reto máximo es 100.000'; end if;
  perform pay_week();
  perform pg_advisory_xact_lock(hashtext(me::text));
  select coalesce(sum(amount), 0) into bal from ledger where player = me;
  if p_stake > bal then raise exception 'No tienes saldo suficiente: te quedan %', fmt_int(bal); end if;
  insert into challenges(match_id, from_player, to_player, from_pick, stake, v2) values (p_match, me, p_to, p_pick, p_stake, true) returning id into cid;
  perform reto_apuesta(cid, me, m, p_pick, p_stake, case when p_to is null then 'Reto abierto: ' else 'Reto a ' || pname(p_to) || ': ' end);
  insert into chat(body)
    values (pname(me) || case when p_to is null then ' abre un reto para cualquiera: ' else ' reta a ' || pname(p_to) || ': ' end
            || m.home || ' vs ' || m.away || ', ' || fmt_int(p_stake) || ' a ' || pick_name(m, p_pick) || ' ' || fmt_odds(mk_cuota(m, p_pick)));
  perform bump();
  return cid;
end $$;

-- ---------- entrar en un reto (de 053; v2: con su apuesta a la cuota de ahora) ----------
create or replace function challenge_join(p_id bigint, p_pick text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c challenges; m matches; bal int; n int; ya int;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  select * into c from challenges where id = p_id for update;
  if not found then raise exception 'Ese reto no existe'; end if;
  if c.status not in ('pending', 'accepted') then raise exception 'Ese reto está cerrado'; end if;
  if c.status = 'pending' and c.to_player is not null then
    raise exception '%', case when c.to_player = me then 'Ese reto es para ti: acéptalo' else 'Ese reto es para otro amigo' end;
  end if;
  if c.from_player = me then raise exception 'No puedes entrar en tu propio reto'; end if;
  select count(*) into ya from challenge_entries(c.id) x where x.player = me;
  if ya > 0 or c.to_player = me then raise exception 'Ya estás dentro de este reto'; end if;
  select * into m from matches where id = c.match_id;
  if m.status <> 'scheduled' or m.starts_at <= now() then raise exception 'Ese partido ya ha empezado'; end if;
  if p_pick is null or p_pick not in ('1','X','2') or (p_pick = 'X' and m.odds_x is null) then raise exception 'Elige un resultado válido'; end if;
  perform pay_week();
  perform pg_advisory_xact_lock(hashtext(me::text));
  select coalesce(sum(amount), 0) into bal from ledger where player = me;
  if c.stake > bal then raise exception 'No tienes saldo suficiente: te quedan %', fmt_int(bal); end if;
  if c.status = 'pending' and p_pick <> c.from_pick then
    update challenges set status = 'accepted', to_player = me, to_pick = p_pick where id = c.id;
  else
    insert into challenge_players(challenge_id, player, pick) values (c.id, me, p_pick);
  end if;
  select count(*) into n from challenge_entries(c.id);
  if c.v2 then
    perform reto_apuesta(c.id, me, m, p_pick, c.stake, 'Reto de ' || pname(c.from_player) || ': ');
  else
    insert into ledger(player, amount, kind, note) values (me, -c.stake, 'apuesta', 'Reto de ' || pname(c.from_player) || ': ' || pick_name(m, p_pick));
  end if;
  insert into chat(body) values (pname(me) || ' entra en el reto de ' || pname(c.from_player) || ': ' || pick_name(m, p_pick) || ', ' || fmt_int(c.stake * n) || ' en juego');
  perform bump();
end $$;

-- ---------- contestar un reto a un amigo (de 042; v2: aceptar es apostar; decir que no deja la apuesta de quien reta en pie) ----------
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
    if c.v2 then
      insert into chat(body) values (pname(me) || ' no acepta el reto de ' || pname(c.from_player) || ' (' || m.home || ' vs ' || m.away || '): su apuesta sigue en pie');
    else
      insert into ledger(player, amount, kind, note) values (c.from_player, c.stake, 'devolucion', 'Reto rechazado por ' || pname(me));
      insert into chat(body) values (pname(me) || ' no acepta el reto de ' || pname(c.from_player) || ' (' || m.home || ' vs ' || m.away || ')');
    end if;
    perform bump(); return;
  end if;
  if m.status <> 'scheduled' or m.starts_at <= now() then raise exception 'Ese partido ya ha empezado'; end if;
  if p_pick is null or p_pick = c.from_pick or p_pick not in ('1','X','2') or (p_pick = 'X' and m.odds_x is null) then raise exception 'Elige un resultado distinto al suyo'; end if;
  perform pay_week();
  perform pg_advisory_xact_lock(hashtext(me::text));
  select coalesce(sum(amount), 0) into bal from ledger where player = me;
  if c.stake > bal then raise exception 'No tienes saldo suficiente: te quedan %', fmt_int(bal); end if;
  update challenges set status = 'accepted', to_pick = p_pick where id = c.id;
  if c.v2 then
    perform reto_apuesta(c.id, me, m, p_pick, c.stake, 'Reto de ' || pname(c.from_player) || ': ');
  else
    insert into ledger(player, amount, kind, note) values (me, -c.stake, 'apuesta', 'Reto de ' || pname(c.from_player) || ': ' || pick_name(m, p_pick));
  end if;
  insert into chat(body) values (pname(me) || ' acepta el reto de ' || pname(c.from_player) || ': ' || pick_name(m, c.from_pick) || ' contra ' || pick_name(m, p_pick) || ', ' || fmt_int(c.stake * 2) || ' en juego');
  perform bump();
end $$;

-- ---------- retirar un reto (PM 02-11: "que tu puedas cancelar una bet desde my bets") ----------
-- Solo quien reta, solo si NADIE mas ha entrado (ni rival ni compañero: el reto sigue pendiente con una sola entrada) y antes de que
-- empiece el partido. Se devuelve lo puesto entero y el reto queda 'canceled'. En un reto v2 su apuesta queda anulada (void, payout =
-- stake) con la devolucion ligada a ella, igual que cancel_bet, y la app no la ensena (ni en Resultados). En uno viejo, la devolucion
-- de 004. Cuando ya ha entrado alguien no se puede.
create or replace function challenge_cancel(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c challenges; m matches; b bets;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  select * into c from challenges where id = p_id for update;
  if not found or c.from_player <> me then raise exception 'Ese reto no es tuyo'; end if;
  if c.status not in ('pending', 'accepted') then raise exception 'Ese reto ya está cerrado'; end if;
  if c.status <> 'pending' or (select count(*) from challenge_entries(c.id)) > 1 then raise exception 'Ya ha entrado alguien: el reto ya no se puede cancelar'; end if;
  select * into m from matches where id = c.match_id;
  if m.status <> 'scheduled' or m.starts_at <= now() then raise exception 'El partido ya ha empezado: no se puede cancelar'; end if;
  perform pg_advisory_xact_lock(hashtext(me::text));
  update challenges set status = 'canceled', settled_at = now() where id = c.id;
  if c.v2 then
    select * into b from bets where challenge_id = c.id and player = me and status = 'open' for update;
    if found then
      update bets set status = 'void', payout = b.stake, settled_at = now() where id = b.id;
      insert into ledger(player, amount, kind, note, bet_id) values (me, b.stake, 'devolucion', 'Reto cancelado: ' || pick_name(m, b.pick) || ' ' || fmt_odds(b.odds), b.id);
    end if;
  else
    insert into ledger(player, amount, kind, note) values (me, c.stake, 'devolucion', 'Reto retirado');
  end if;
  insert into chat(body) values (pname(me) || ' retira su reto: ' || m.home || ' vs ' || m.away);
  perform bump();
end $$;

-- ---------- cerrar los retos ----------
create or replace function settle_challenges() returns int
language plpgsql security definer set search_path = public as $$
declare c record; e record; n int := 0; res text; tot int; nw int; pool int; share int; rem int; k int; pagar int;
  nombres text; perdedores text; nl int; primero text; st text; wsum int; bote int; dado int;
begin
  -- ===== retos VIEJOS (v2 = false): exactamente como en 053 =====
  for c in select ch.*, m.status as mst, m.starts_at as mstart from challenges ch join matches m on m.id = ch.match_id
           where not ch.v2 and ch.status = 'pending' and (m.starts_at <= now() or m.status <> 'scheduled') for update of ch loop
    update challenges set status = 'expired', settled_at = now() where id = c.id;
    for e in select * from challenge_entries(c.id) loop
      insert into ledger(player, amount, kind, note) values (e.player, c.stake, 'devolucion', 'Reto sin contestar');
    end loop;
    n := n + 1;
  end loop;
  for c in select ch.*, m.status as mst, m.winner as mwin, m.home, m.away, m.score from challenges ch join matches m on m.id = ch.match_id
           where not ch.v2 and ch.status = 'accepted' and m.status in ('final','canceled') for update of ch loop
    res := c.home || ' ' || coalesce(c.score, '') || ' ' || c.away;
    select count(*)::int, count(*) filter (where x.pick = c.mwin)::int into tot, nw from challenge_entries(c.id) x;
    if c.mst = 'canceled' or c.mwin is null or nw = 0 then
      update challenges set status = 'void', settled_at = now() where id = c.id;
      for e in select * from challenge_entries(c.id) loop
        insert into ledger(player, amount, kind, note) values (e.player, c.stake, 'devolucion', 'Reto sin ganador');
      end loop;
      select string_agg(pname(x.player), ', ' order by x.ord) into nombres from (select * from challenge_entries(c.id)) x;
      if tot > 1 then nombres := regexp_replace(nombres, ', ([^,]*)$', ' y \1'); end if;
      insert into chat(body) values ('Reto sin ganador entre ' || nombres || ' · ' || res || ' · se devuelve todo');
    else
      pool := c.stake * tot; share := pool / nw; rem := pool - share * nw;
      st := case when c.mwin = c.from_pick then 'won_from' when c.mwin = c.to_pick then 'won_to' else 'won_other' end;
      update challenges set status = st, win_pick = c.mwin, settled_at = now() where id = c.id;
      select string_agg(pname(x.player), ', ' order by x.ord), count(*)::int into perdedores, nl from challenge_entries(c.id) x where x.pick <> c.mwin;
      select pname(x.player) into primero from challenge_entries(c.id) x where x.pick <> c.mwin order by x.ord limit 1;
      k := 0;
      for e in select * from challenge_entries(c.id) x where x.pick = c.mwin order by x.ord loop
        k := k + 1;
        pagar := share + case when k <= rem then 1 else 0 end;
        insert into ledger(player, amount, kind, note)
          values (e.player, pagar, 'premio', 'Reto ganado a ' || coalesce(primero, '?') || case when nl > 1 then ' +' || (nl - 1) else '' end);
      end loop;
      select string_agg(pname(x.player), ', ' order by x.ord) into nombres from challenge_entries(c.id) x where x.pick = c.mwin;
      if nw > 1 then nombres := regexp_replace(nombres, ', ([^,]*)$', ' y \1'); end if;
      if nl > 1 then perdedores := regexp_replace(perdedores, ', ([^,]*)$', ' y \1'); end if;
      insert into chat(body) values (case when nw = 1 then nombres || ' ganó ' || fmt_int(share + case when rem >= 1 then 1 else 0 end)
                                          else nombres || ' ganaron ' || fmt_int(share) || ' cada uno' end
                                     || ' en el reto contra ' || perdedores || ' · ' || res);
    end if;
    n := n + 1;
  end loop;

  -- ===== retos NUEVOS (v2): apuesta a la banca + bote de los rivales =====
  -- sin rival al empezar: el reto se cierra y la apuesta de cada uno sigue como una apuesta normal (no se devuelve nada)
  for c in select ch.id from challenges ch join matches m on m.id = ch.match_id
           where ch.v2 and ch.status = 'pending' and (m.starts_at <= now() or m.status <> 'scheduled') for update of ch loop
    update challenges set status = 'expired', settled_at = now() where id = c.id;
    n := n + 1;
  end loop;
  -- con rival y el partido acabado o anulado: primero se pagan las apuestas (settle_match, que no paga dos veces) y luego el bote
  for c in select ch.*, m.status as mst, m.winner as mwin, m.home, m.away, m.score from challenges ch join matches m on m.id = ch.match_id
           where ch.v2 and ch.status = 'accepted' and m.status in ('final','canceled') for update of ch loop
    perform settle_match(c.match_id);
    if exists (select 1 from bets b where b.challenge_id = c.id and b.status = 'open') then continue; end if;
    perdedores := null; primero := null;
    res := c.home || ' ' || coalesce(c.score, '') || ' ' || c.away;
    select coalesce(sum(b.stake) filter (where b.status = 'won'), 0)::int, count(*) filter (where b.status = 'won')::int,
           coalesce(sum(b.stake) filter (where b.status = 'lost'), 0)::int, count(*) filter (where b.status = 'lost')::int
      into wsum, nw, bote, nl from bets b where b.challenge_id = c.id;
    select string_agg(pname(x.player), ', ' order by x.ord), count(*)::int into nombres, tot from challenge_entries(c.id) x;
    if tot > 1 then nombres := regexp_replace(nombres, ', ([^,]*)$', ' y \1'); end if;
    if c.mst = 'canceled' or c.mwin is null or (nw = 0 and nl = 0) then
      update challenges set status = 'void', settled_at = now() where id = c.id;
      insert into chat(body) values ('Reto sin resultado entre ' || nombres || ' · ' || res || ' · se devuelve todo');
    else
      st := case when c.mwin = c.from_pick then 'won_from' when c.mwin = c.to_pick then 'won_to' else 'won_other' end;
      if nw > 0 and bote > 0 then
        -- el bote de los que fallan, en proporcion a lo que puso cada uno de los que aciertan; lo que sobra, de uno en uno por orden
        dado := 0;
        for e in select b.id as bid, b.stake from bets b join challenge_entries(c.id) x on x.player = b.player
                 where b.challenge_id = c.id and b.status = 'won' order by x.ord loop
          pagar := ((bote::bigint * e.stake) / wsum)::int;
          update bets set reto_extra = pagar where id = e.bid;
          dado := dado + pagar;
        end loop;
        rem := bote - dado;
        for e in select b.id as bid from bets b join challenge_entries(c.id) x on x.player = b.player
                 where b.challenge_id = c.id and b.status = 'won' order by x.ord limit greatest(rem, 0) loop
          update bets set reto_extra = reto_extra + 1 where id = e.bid;
        end loop;
        select string_agg(pname(x.player), ', ' order by x.ord) into perdedores from bets b join challenge_entries(c.id) x on x.player = b.player
          where b.challenge_id = c.id and b.status = 'lost';
        select pname(x.player) into primero from bets b join challenge_entries(c.id) x on x.player = b.player
          where b.challenge_id = c.id and b.status = 'lost' order by x.ord limit 1;
        for e in select b.player, b.reto_extra from bets b join challenge_entries(c.id) x on x.player = b.player
                 where b.challenge_id = c.id and b.status = 'won' and b.reto_extra > 0 order by x.ord loop
          insert into ledger(player, amount, kind, note)
            values (e.player, e.reto_extra, 'premio', 'Reto ganado a ' || coalesce(primero, '?') || case when nl > 1 then ' +' || (nl - 1) else '' end || ': lo que puso el rival');
        end loop;
      end if;
      update challenges set status = st, win_pick = c.mwin, settled_at = now() where id = c.id;
      if nw = 0 then
        insert into chat(body) values ('Nadie acierta en el reto entre ' || nombres || ' · ' || res);
      else
        select string_agg(pname(x.player) || ' ' || fmt_int(coalesce(b.payout, 0) + coalesce(b.reto_extra, 0)), ', ' order by x.ord) into nombres
          from bets b join challenge_entries(c.id) x on x.player = b.player where b.challenge_id = c.id and b.status = 'won';
        if nl > 1 then perdedores := regexp_replace(perdedores, ', ([^,]*)$', ' y \1'); end if;
        insert into chat(body) values ('Reto ganado: ' || nombres || coalesce(' contra ' || perdedores, '') || ' · ' || res);
      end if;
    end if;
    n := n + 1;
  end loop;
  if n > 0 then perform bump(); end if;
  return n;
end $$;

-- ---------- lo que lee la app (de 053; los v2 llevan la cuota, la apuesta y lo cobrado de cada entrada) ----------
create or replace function get_retos() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not is_player() then raise exception 'Tienes que entrar primero'; end if;
  perform settle_challenges();
  return coalesce((select jsonb_object_agg(c.id::text, jsonb_build_object(
      'e', (select coalesce(jsonb_agg(case when c.v2 then jsonb_build_array(x.player, x.pick, b.odds, b.id, b.reto_extra, b.status, b.payout)
                                           else jsonb_build_array(x.player, x.pick) end order by x.ord), '[]'::jsonb)
            from challenge_entries(c.id) x left join bets b on c.v2 and b.challenge_id = c.id and b.player = x.player),
      'w', c.win_pick, 'v', c.v2))
    from (select id, win_pick, v2 from challenges order by created_at desc limit 80) c), '{}'::jsonb);
end $$;

-- ---------- una apuesta de reto no se cancela, y no se vende mientras el reto tenga rivales ----------
create or replace function reto_apuesta_fija() returns trigger
language plpgsql security definer set search_path = public as $$
declare c challenges; m matches;
begin
  if new.challenge_id is null or old.status <> 'open' or new.status not in ('void', 'cashout') then return new; end if;
  select * into c from challenges where id = new.challenge_id;
  if not found then return new; end if;
  select * into m from matches where id = new.match_id;
  -- antes de empezar solo se anula por challenge_cancel (reto ya 'canceled'); si el amigo dijo que no (declined) ya es una apuesta normal
  if new.status = 'void' and m.status = 'scheduled' and c.status in ('pending', 'accepted') then raise exception 'Es la apuesta de un reto: un reto no se puede cancelar'; end if;
  if new.status = 'cashout' and c.status = 'accepted' then raise exception 'Es la apuesta de un reto con rivales: no se puede vender'; end if;
  return new;
end $$;
drop trigger if exists reto_apuesta_fija on bets;
create trigger reto_apuesta_fija before update of status on bets for each row execute function reto_apuesta_fija();

-- ---------- avisos al movil (solo si 060 esta cargada) ----------
do $do$
begin
  if to_regprocedure('public.aviso_nuevo(uuid,text,text,text,text,text,text)') is null then return; end if;

  -- la apuesta de un reto con rivales no avisa sola: avisa el reto (con lo que cobras de verdad)
  execute $q$
  create or replace function trg_aviso_apuesta() returns trigger
  language plpgsql security definer set search_path = public as $f$
  declare m matches; pk text; part text;
  begin
    if new.challenge_id is not null and exists (select 1 from challenges ch where ch.id = new.challenge_id and ch.status not in ('pending', 'expired', 'declined')) then
      return null;
    end if;
    select * into m from matches where id = new.match_id;
    if not found then return null; end if;
    pk := pick_name(m, new.pick); part := concat_ws(' vs ', m.home, m.away);
    if new.status = 'won' then
      perform aviso_nuevo(new.player, 'apuestas', 'Has ganado ' || fmt_int(new.payout) || ' con ' || pk, part || ' · cuota ' || fmt_odds(new.odds),
        'You won ' || fmt_en(new.payout) || ' on ' || pk, part || ' · odds ' || fmt_odds_en(new.odds), 'apuestas');
    elsif new.status = 'lost' then
      perform aviso_nuevo(new.player, 'apuestas', 'Has perdido ' || fmt_int(new.stake) || ' con ' || pk, part,
        'You lost ' || fmt_en(new.stake) || ' on ' || pk, part, 'apuestas');
    elsif new.status = 'void' and auth.uid() is distinct from new.player then
      perform aviso_nuevo(new.player, 'apuestas', 'Apuesta devuelta', 'Te devuelven ' || fmt_int(new.payout) || ': ' || part,
        'Bet refunded', 'You get ' || fmt_en(new.payout) || ' back: ' || part, 'apuestas');
    end if;
    if new.status in ('won', 'lost') then perform aviso_ranking_revisa(); end if;
    return null;
  exception when others then
    return null;
  end $f$;
  $q$;

  execute $q$
  create or replace function trg_aviso_reto_estado() returns trigger
  language plpgsql security definer set search_path = public as $f$
  declare m matches; part text; e record; n_tot int; n_w int; share int; rem int; k int := 0; win text; pago int; pg_w text; pg_l text; quien text; b bets;
  begin
    select * into m from matches where id = new.match_id;
    part := concat_ws(' vs ', m.home, m.away);
    if old.status = 'pending' and new.status = 'accepted' then
      quien := pname(new.to_player);
      if old.to_player is null then
        perform aviso_nuevo(new.from_player, 'retos', 'Tu reto tiene rival', quien || ' ha entrado en tu reto · ' || part || ', ' || fmt_int(new.stake * 2) || ' en juego',
          'Your challenge has an opponent', quien || ' joined your challenge · ' || part || ', ' || fmt_en(new.stake * 2) || ' at stake', 'inicio');
      else
        perform aviso_nuevo(new.from_player, 'retos', 'Te han aceptado el reto', quien || ' ha aceptado tu reto · ' || part || ', ' || fmt_int(new.stake * 2) || ' en juego',
          'Challenge accepted', quien || ' accepted your challenge · ' || part || ', ' || fmt_en(new.stake * 2) || ' at stake', 'inicio');
      end if;
    elsif old.status = 'pending' and new.status = 'declined' then
      if new.v2 then
        perform aviso_nuevo(new.from_player, 'retos', 'Reto rechazado', pname(new.to_player) || ' no ha aceptado tu reto en ' || part || '. Tu apuesta sigue en pie con su cuota',
          'Challenge declined', pname(new.to_player) || ' did not accept your challenge on ' || part || '. Your bet stays on at its odds', 'inicio');
      else
        perform aviso_nuevo(new.from_player, 'retos', 'Reto rechazado', pname(new.to_player) || ' no ha aceptado tu reto de ' || fmt_int(new.stake) || ' en ' || part || '. Te lo devolvemos',
          'Challenge declined', pname(new.to_player) || ' did not accept your challenge of ' || fmt_en(new.stake) || ' on ' || part || '. You get it back', 'inicio');
      end if;
    elsif old.status = 'pending' and new.status = 'expired' then
      for e in select * from reto_entradas(new) loop
        if new.v2 then
          perform aviso_nuevo(e.player, 'retos', 'Reto sin rival', 'Nadie ha entrado en el reto de ' || part || '. Tu apuesta sigue en pie con su cuota',
            'Challenge without an opponent', 'Nobody joined the challenge on ' || part || '. Your bet stays on at its odds', 'inicio');
        else
          perform aviso_nuevo(e.player, 'retos', 'Reto sin rival', 'Nadie ha entrado en el reto de ' || part || '. Te devuelven ' || fmt_int(new.stake),
            'Challenge without an opponent', 'Nobody joined the challenge on ' || part || '. You get ' || fmt_en(new.stake) || ' back', 'inicio');
        end if;
      end loop;
    elsif old.status = 'accepted' and new.status = 'void' then
      for e in select * from reto_entradas(new) loop
        perform aviso_nuevo(e.player, 'retos', 'Reto sin ganador', 'Te devuelven ' || fmt_int(new.stake) || ' del reto de ' || part,
          'Challenge without a winner', 'You get ' || fmt_en(new.stake) || ' back from the challenge on ' || part, 'inicio');
      end loop;
    elsif old.status = 'accepted' and new.status in ('won_from', 'won_to', 'won_other') and new.v2 then
      select pname(x.player) into pg_w from reto_entradas(new) x join bets bb on bb.challenge_id = new.id and bb.player = x.player where bb.status = 'won' order by x.ord limit 1;
      select pname(x.player) into pg_l from reto_entradas(new) x join bets bb on bb.challenge_id = new.id and bb.player = x.player where bb.status = 'lost' order by x.ord limit 1;
      for e in select * from reto_entradas(new) x order by x.ord loop
        select * into b from bets where challenge_id = new.id and player = e.player;
        if not found then continue; end if;
        if b.status = 'won' then
          pago := coalesce(b.payout, 0) + coalesce(b.reto_extra, 0);
          perform aviso_nuevo(e.player, 'retos', 'Has ganado el reto: ' || fmt_int(pago), coalesce('Contra ' || pg_l || ' · ', '') || part,
            'You won the challenge: ' || fmt_en(pago), coalesce('Against ' || pg_l || ' · ', '') || part, 'inicio');
        elsif b.status = 'lost' then
          perform aviso_nuevo(e.player, 'retos', 'Has perdido el reto: ' || fmt_int(b.stake), coalesce('Ha ganado ' || pg_w || ' · ', 'Nadie acierta · ') || part,
            'You lost the challenge: ' || fmt_en(b.stake), coalesce(pg_w || ' won · ', 'Nobody got it right · ') || part, 'inicio');
        end if;
      end loop;
    elsif old.status = 'accepted' and new.status in ('won_from', 'won_to', 'won_other') then
      win := coalesce(to_jsonb(new) ->> 'win_pick', case new.status when 'won_from' then new.from_pick when 'won_to' then new.to_pick end);
      select count(*)::int, count(*) filter (where x.pick = win)::int into n_tot, n_w from reto_entradas(new) x;
      if n_w > 0 then
        share := (new.stake * n_tot) / n_w; rem := new.stake * n_tot - share * n_w;
        select pname(x.player) into pg_w from reto_entradas(new) x where x.pick = win order by x.ord limit 1;
        select pname(x.player) into pg_l from reto_entradas(new) x where x.pick <> win order by x.ord limit 1;
        for e in select * from reto_entradas(new) x order by x.ord loop
          if e.pick = win then
            k := k + 1; pago := share + case when k <= rem then 1 else 0 end;
            perform aviso_nuevo(e.player, 'retos', 'Has ganado el reto: ' || fmt_int(pago), 'Contra ' || coalesce(pg_l, '?') || ' · ' || part,
              'You won the challenge: ' || fmt_en(pago), 'Against ' || coalesce(pg_l, '?') || ' · ' || part, 'inicio');
          else
            perform aviso_nuevo(e.player, 'retos', 'Has perdido el reto: ' || fmt_int(new.stake), 'Ha ganado ' || coalesce(pg_w, '?') || ' · ' || part,
              'You lost the challenge: ' || fmt_en(new.stake), coalesce(pg_w, '?') || ' won · ' || part, 'inicio');
          end if;
        end loop;
      end if;
    end if;
    return null;
  exception when others then
    return null;
  end $f$;
  $q$;

  execute 'revoke all on function trg_aviso_apuesta(), trg_aviso_reto_estado() from public, anon, authenticated';
end $do$;

-- ---------- quien puede llamar a que ----------
revoke all on function reto_apuesta(bigint, uuid, matches, text, int, text), reto_apuesta_fija(), settle_challenges() from public, anon, authenticated;
revoke all on function challenge_create(text, uuid, text, int), challenge_join(bigint, text), challenge_answer(bigint, boolean, text), challenge_cancel(bigint), get_retos() from public, anon;
grant execute on function challenge_create(text, uuid, text, int), challenge_join(bigint, text), challenge_answer(bigint, boolean, text), challenge_cancel(bigint), get_retos() to authenticated;
