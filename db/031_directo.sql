-- 031 (31-10). Apostar con el partido ya empezado. PM: "ok todas" a "apostar con el partido ya empezado, con cuotas en vivo
-- que se mueven con el marcador".
-- La cuota sale del mismo modelo que el cash out (ex_cash_value de 024: futbol con marcador y minuto, Valorant y CS2 con mapas
-- y rondas), con un margen del 8 %, entre 1,05 y 15. Solo con datos del directo de menos de 3 minutos.
-- El stream va por delante de nuestros datos (lo mismo que paso con las predicciones, 022b), asi que una apuesta en directo
-- queda EN REVISION hasta la siguiente lectura del directo: si en esa lectura el marcador ha cambiado (gol, o mapa en
-- Valorant y CS2), se anula y se devuelve todo; si sigue igual, queda confirmada. Si el partido acaba con la apuesta aun en
-- revision, tambien se anula. Asi nadie apuesta a algo que ya ha visto en el stream.
-- Cerrado: UFC, futbol desde el minuto 80 y en la prorroga, series ya decididas. Tope de 1.000 por jugador y partido en directo.
-- Se puede ejecutar varias veces. Va despues de 001 a 030.

alter table bets add column if not exists live boolean not null default false;
alter table bets add column if not exists live_snap jsonb;          -- marcador al apostar mientras esta en revision; null: confirmada
insert into settings(key, value) values ('live_margen', '1.08'), ('live_tope', '1000') on conflict (key) do nothing;

-- lo que hay que mirar del marcador: goles en futbol, mapas en Valorant y CS2
create or replace function ex_live_snap(p_sport text, d jsonb) returns jsonb
language sql immutable as $$
  select case when p_sport = 'f' then jsonb_build_object('h', d->>'hs', 'a', d->>'as') else jsonb_build_object('a', d->>'a', 'b', d->>'b') end
$$;

-- cuota en directo de una eleccion, o null si ahora no se puede
create or replace function ex_live_odds(m matches, p_pick text) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare b bets; q jsonb; p numeric; mg numeric := coalesce((select (value #>> '{}')::numeric from settings where key = 'live_margen'), 1.08); lv ex_live;
begin
  if m.status <> 'live' or m.sport = 'u' then return null; end if;
  if m.sport = 'f' then
    select * into lv from ex_live where match_id = m.id;
    if not found or coalesce((lv.data->>'min')::numeric, 0) >= 80 or coalesce((lv.data->>'per')::int, 1) > 2 then return null; end if;
  elsif p_pick = 'X' then return null; end if;
  b.status := 'open'; b.boost := null; b.pick := p_pick; b.stake := 100; b.odds := 2;
  q := ex_cash_value(b, m);
  if not coalesce((q->>'ok')::boolean, false) or q->>'mode' <> 'live' or q->>'p' is null then return null; end if;
  p := (q->>'p')::numeric;
  if p <= 0.02 or p >= 0.97 then return null; end if;
  return least(15, greatest(1.05, round(1 / (p * mg), 2)));
end $$;

-- las tres cuotas en directo de un partido, para la app
create or replace function live_quote(p_match text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m matches; lv ex_live; o1 numeric; ox numeric; o2 numeric;
begin
  if auth.uid() is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  select * into m from matches where id = p_match;
  if not found or m.status <> 'live' then return jsonb_build_object('ok', false, 'why', 'El partido no está en juego'); end if;
  if m.sport = 'u' then return jsonb_build_object('ok', false, 'why', 'La UFC no tiene apuestas en directo'); end if;
  select * into lv from ex_live where match_id = m.id;
  if not found or lv.at < now() - interval '3 minutes' then return jsonb_build_object('ok', false, 'why', 'Esperando datos del directo'); end if;
  o1 := ex_live_odds(m, '1'); ox := ex_live_odds(m, 'X'); o2 := ex_live_odds(m, '2');
  if o1 is null and ox is null and o2 is null then
    return jsonb_build_object('ok', false, 'why', case when m.sport = 'f' and coalesce((lv.data->>'min')::numeric, 0) >= 80 then 'Cerrado desde el minuto 80' else 'Ahora no hay cuotas en directo' end);
  end if;
  return jsonb_build_object('ok', true, 'odds', jsonb_build_object('1', o1, 'X', ox, '2', o2), 'at', lv.at,
    'tope', coalesce((select (value #>> '{}')::int from settings where key = 'live_tope'), 1000),
    'usado', (select coalesce(sum(stake), 0) from bets where player = auth.uid() and match_id = p_match and live and status <> 'void'));
end $$;

-- apostar en directo. p_min: la cuota que viste; si ha bajado, no entra (asi no te cambia la cuota sin que lo sepas)
create or replace function place_live_bet(p_match text, p_pick text, p_stake int, p_min numeric default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); m matches; lv ex_live; o numeric; bal int; bid bigint; tope int; usado int;
begin
  if me is null or not exists (select 1 from players where id = me) then raise exception 'Tienes que entrar primero'; end if;
  perform pay_week();
  select * into m from matches where id = p_match;
  if not found then raise exception 'Ese partido no existe'; end if;
  if m.status <> 'live' then raise exception 'El partido no está en juego'; end if;
  if p_pick not in ('1', 'X', '2') then raise exception 'Elige 1, X o 2'; end if;
  if p_stake is null or p_stake < 1 then raise exception 'La apuesta mínima es 1'; end if;
  select * into lv from ex_live where match_id = m.id;
  if not found or lv.at < now() - interval '3 minutes' then raise exception 'Esperando datos del directo: prueba en un momento'; end if;
  o := ex_live_odds(m, p_pick);
  if o is null then raise exception 'Ahora no hay cuota en directo para eso'; end if;
  if p_min is not null and o < p_min - 0.001 then raise exception 'La cuota ha bajado a %: mírala otra vez', fmt_odds(o); end if;
  perform pg_advisory_xact_lock(hashtext(me::text));
  tope := coalesce((select (value #>> '{}')::int from settings where key = 'live_tope'), 1000);
  select coalesce(sum(stake), 0) into usado from bets where player = me and match_id = p_match and live and status <> 'void';
  if usado + p_stake > tope then raise exception 'En directo puedes apostar hasta % por partido y te quedan %', fmt_int(tope), fmt_int(greatest(0, tope - usado)); end if;
  select coalesce(sum(amount), 0) into bal from ledger where player = me;
  if p_stake > bal then raise exception 'No tienes saldo suficiente: te quedan %', fmt_int(bal); end if;
  insert into bets(player, match_id, pick, stake, odds, live, live_snap) values (me, p_match, p_pick, p_stake, o, true, ex_live_snap(m.sport, lv.data) || jsonb_build_object('at', lv.at))
    returning id into bid;
  insert into ledger(player, amount, kind, note, bet_id) values (me, -p_stake, 'apuesta', pick_name(m, p_pick) || ' ' || fmt_odds(o) || ' · en directo', bid);
  perform bump();
  return jsonb_build_object('bet', bid, 'saldo', bal - p_stake, 'odds', o);
end $$;

-- la revision: cada lectura nueva del directo confirma o anula las apuestas que esperan
create or replace function ex_live_revisa(p_match text) returns int
language plpgsql security definer set search_path = public as $$
declare m matches; lv ex_live; b record; n int := 0; ahora jsonb;
begin
  select * into m from matches where id = p_match; if not found then return 0; end if;
  select * into lv from ex_live where match_id = p_match; if not found then return 0; end if;
  ahora := ex_live_snap(m.sport, lv.data);
  for b in select bets.*, p.name from bets join players p on p.id = bets.player
           where match_id = p_match and status = 'open' and live and live_snap is not null for update of bets loop
    if lv.at <= (b.live_snap->>'at')::timestamptz then continue; end if;          -- todavia es la misma lectura
    if (b.live_snap - 'at') = ahora then
      update bets set live_snap = null where id = b.id;
    else
      update bets set status = 'void', payout = b.stake, settled_at = now(), live_snap = null where id = b.id;
      insert into ledger(player, amount, kind, note, bet_id) values (b.player, b.stake, 'devolucion', 'Anulada en directo: cambió el marcador justo al apostar', b.id);
      insert into chat(body) values (b.name || ' recupera ' || fmt_int(b.stake) || ': su apuesta en directo en ' || m.home || ' vs ' || m.away || ' se anula porque cambió el marcador justo al apostar');
    end if;
    n := n + 1;
  end loop;
  if n > 0 then perform bump(); end if;
  return n;
end $$;
create or replace function ex_live_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform ex_live_revisa(new.match_id); return null; end $$;
drop trigger if exists ex_live_revision on ex_live;
create trigger ex_live_revision after insert or update on ex_live for each row execute function ex_live_trg();

-- si el partido acaba con apuestas en directo aun en revision, se anulan antes de pagar (nadie apuesta al gol que ya vio)
create or replace function ex_live_fin_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare b record;
begin
  if new.status in ('final', 'canceled') and old.status is distinct from new.status then
    for b in select * from bets where match_id = new.id and status = 'open' and live and live_snap is not null loop
      update bets set status = 'void', payout = b.stake, settled_at = now(), live_snap = null where id = b.id;
      insert into ledger(player, amount, kind, note, bet_id) values (b.player, b.stake, 'devolucion', 'Anulada en directo: el partido acabó antes de confirmarla', b.id);
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists ex_live_fin on matches;
create trigger ex_live_fin before update of status on matches for each row execute function ex_live_fin_trg();

revoke all on function live_quote(text), place_live_bet(text, text, int, numeric) from public, anon;
grant execute on function live_quote(text), place_live_bet(text, text, int, numeric) to authenticated;
revoke all on function ex_live_odds(matches, text), ex_live_revisa(text), ex_live_trg(), ex_live_fin_trg() from public, anon, authenticated;
