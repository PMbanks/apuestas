-- 053 (01-11). RETOS CON MAS GENTE (2v1, 2v2, 3v1...). PM: "en los challenges se podra meter gente: si hay algun challenge iniciado y hay
-- tiempo, la gente podra unirse al challenge y se pondra el bote mas grande ... salgan para unirse al que creen que gana o empata".
--
-- MODELO. Un reto sigue siendo una fila de challenges (from_player + from_pick, y to_player + to_pick cuando alguien acepta o entra). Los
-- demas participantes van en una tabla nueva challenge_players(challenge_id, player, pick), UNA fila por persona que entra despues de
-- los dos primeros. Todos ponen la MISMA cantidad (challenges.stake). Asi lo que ya existe (retos 1v1, el id 2 Liverpool Arsenal de PM
-- contra Darkam, ya resuelto como won_from) no se toca y sigue valiendo: sus dos participantes son from y to.
--   challenge_entries(id)  las entradas del reto en un orden fijo: quien reta, quien acepta, y los demas por orden de llegada.
--   challenge_join(id, pick)  YA NO es solo para el primer rival: entra cualquiera que no este dentro, mientras el partido no haya empezado,
--                          en un reto abierto sin rival (en cualquier lado) o ya aceptado (en cualquier lado, tambien el empate si hay).
--                          Si el reto estaba sin rival y entras en el lado contrario al de quien reta, pasas a ser su rival (to_player) y
--                          el reto queda aceptado. Si entras en el MISMO lado que quien reta, sumas a su equipo y el reto sigue buscando rival.
--   settle_challenges()    sin rival al empezar (o partido anulado) se devuelve la entrada a CADA uno. Aceptado y acabado: el bote entero
--                          (stake x entradas) se reparte a partes iguales entre los del lado que acierta; lo que no divide exacto (1 o 2
--                          monedas) se da de una en una a los primeros del lado ganador, asi el bote ni crece ni se pierde nunca. Anulado, sin
--                          resultado o sin nadie en el lado que acierta (empate sin lado de empate): se devuelve la entrada a cada uno.
--   get_retos()            para la app: las entradas de cada reto (jugador, lado) y el lado que ha ganado, de los 80 retos mas nuevos.
-- challenges.win_pick = el lado que ha ganado; status 'won_from' si es el de quien reta, 'won_to' si es el de quien acepta y 'won_other'
-- si ha ganado un tercer lado (por ejemplo el empate en un reto de 1 contra 2).
-- challenge_create, challenge_answer y challenge_cancel no cambian. La app prueba get_retos: con 053 sin cargar todo sigue como antes.
-- Se puede ejecutar varias veces. Todo UPDATE lleva su WHERE (pg-safeupdate).

-- ---------- tablas ----------
create table if not exists challenge_players (
  id bigint generated always as identity primary key,
  challenge_id bigint not null references challenges on delete cascade,
  player uuid not null references players on delete cascade,
  pick text not null check (pick in ('1','X','2')),
  created_at timestamptz not null default now(),
  unique (challenge_id, player)
);
create index if not exists challenge_players_ch on challenge_players(challenge_id);
alter table challenge_players enable row level security;
drop policy if exists challenge_players_read on challenge_players;
create policy challenge_players_read on challenge_players for select to authenticated using (is_player());

alter table challenges add column if not exists win_pick text check (win_pick in ('1','X','2'));
do $$
declare r record;
begin
  for r in select conname from pg_constraint where conrelid = 'challenges'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%won_from%' loop
    execute format('alter table challenges drop constraint %I', r.conname);
  end loop;
  alter table challenges add constraint challenges_status_check
    check (status in ('pending','accepted','declined','expired','canceled','won_from','won_to','won_other','void'));
end $$;
-- los retos que ya estaban resueltos: su lado ganador (para que la app los lea igual que los nuevos)
update challenges set win_pick = case status when 'won_from' then from_pick else to_pick end where status in ('won_from','won_to') and win_pick is null;

-- ---------- las entradas de un reto, en orden fijo (la app y la base reparten igual) ----------
create or replace function challenge_entries(p_id bigint) returns table(ord int, player uuid, pick text)
language sql stable security definer set search_path = public as $$
  select (row_number() over (order by x.o, x.i))::int, x.p, x.k from (
    select 0 as o, 0::bigint as i, c.from_player as p, c.from_pick as k from challenges c where c.id = p_id
    union all
    select 1, 0::bigint, c.to_player, c.to_pick from challenges c where c.id = p_id and c.to_player is not null and c.to_pick is not null
    union all
    select 2, cp.id, cp.player, cp.pick from challenge_players cp where cp.challenge_id = p_id
  ) x
  order by 1
$$;

-- ---------- entrar en un reto ----------
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
    -- primer rival: pasa a ser el otro lado del reto
    update challenges set status = 'accepted', to_player = me, to_pick = p_pick where id = c.id;
  else
    insert into challenge_players(challenge_id, player, pick) values (c.id, me, p_pick);
  end if;
  select count(*) into n from challenge_entries(c.id);
  insert into ledger(player, amount, kind, note) values (me, -c.stake, 'apuesta', 'Reto de ' || pname(c.from_player) || ': ' || pick_name(m, p_pick));
  insert into chat(body) values (pname(me) || ' entra en el reto de ' || pname(c.from_player) || ': ' || pick_name(m, p_pick) || ', ' || fmt_int(c.stake * n) || ' en juego');
  perform bump();
end $$;

-- ---------- cerrar los retos ----------
create or replace function settle_challenges() returns int
language plpgsql security definer set search_path = public as $$
declare c record; e record; n int := 0; res text; tot int; nw int; pool int; share int; rem int; k int; pagar int;
  nombres text; perdedores text; nl int; primero text; st text;
begin
  -- sin rival al empezar el partido (o partido ya cerrado): se devuelve la entrada a cada uno
  for c in select ch.*, m.status as mst, m.starts_at as mstart from challenges ch join matches m on m.id = ch.match_id
           where ch.status = 'pending' and (m.starts_at <= now() or m.status <> 'scheduled') for update of ch loop
    update challenges set status = 'expired', settled_at = now() where id = c.id;
    for e in select * from challenge_entries(c.id) loop
      insert into ledger(player, amount, kind, note) values (e.player, c.stake, 'devolucion', 'Reto sin contestar');
    end loop;
    n := n + 1;
  end loop;
  -- aceptados y con el partido acabado (o anulado)
  for c in select ch.*, m.status as mst, m.winner as mwin, m.home, m.away, m.score from challenges ch join matches m on m.id = ch.match_id
           where ch.status = 'accepted' and m.status in ('final','canceled') for update of ch loop
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
  if n > 0 then perform bump(); end if;
  return n;
end $$;

-- ---------- lo que lee la app ----------
create or replace function get_retos() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not is_player() then raise exception 'Tienes que entrar primero'; end if;
  perform settle_challenges();
  return coalesce((select jsonb_object_agg(c.id::text, jsonb_build_object(
      'e', (select coalesce(jsonb_agg(jsonb_build_array(x.player, x.pick) order by x.ord), '[]'::jsonb) from challenge_entries(c.id) x),
      'w', c.win_pick))
    from (select id, win_pick from challenges order by created_at desc limit 80) c), '{}'::jsonb);
end $$;

-- ---------- quien puede llamar a que ----------
revoke all on function challenge_entries(bigint), settle_challenges(), get_retos() from public, anon;
revoke all on function challenge_join(bigint, text) from public, anon;
grant execute on function challenge_join(bigint, text), get_retos() to authenticated;
