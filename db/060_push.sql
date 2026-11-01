-- 060 (02-11). AVISOS AL MOVIL CON LA APP CERRADA (web push). PM: "podemos hacer que lleguen notificaciones, por ejemplo: alguien te ha
-- challengeado a X?". Esto es la parte de la base; el envio lo hace el sincronizador (sync/push.mjs con la libreria web-push y las claves
-- VAPID) y el aparato del jugador se apunta desde Ajustes > Avisos en tu movil (app/nueva/avisos.js y sw.js).
--
-- COMO FUNCIONA. Nada de lo que ya existe cambia: ni place_bet, ni settle_match, ni los retos, ni la paga. Solo se cuelgan TRIGGERS que,
-- cuando algo pasa, apuntan una fila en la tabla avisos. Cada trigger va envuelto en un bloque de excepcion que traga cualquier error, asi
-- que un aviso mal escrito NUNCA rompe una apuesta ni un pago. Si el jugador no tiene ningun aparato apuntado (o ha apagado ese tipo en
-- todos), no se apunta nada. El sincronizador lee los pendientes cada 20 segundos, los manda y los marca; los avisos de mas de 7 dias se borran.
--
-- TIPOS (cada jugador apaga los que no quiera, en Ajustes):
--   retos     te retan; alguien entra en tu reto o te lo acepta (o lo rechaza); un reto tuyo se resuelve (ganas, pierdes, se devuelve)
--   apuestas  una apuesta tuya o una combinada se resuelve (ganas, pierdes, te devuelven)
--   ranking   te quitan el puesto 1 del ranking de ratio
--   paga      llega la paga del lunes, ganas el bote, un premio de la semana o la ruleta global (de noche esperan hasta las 9:00 de Madrid)
--   chat      te mencionan en el chat con @tunombre
--   prueba    el boton Probar aviso de Ajustes (siempre llega)
--
-- TABLAS (nadie las lee desde la app, todo pasa por las funciones de abajo):
--   push_subs  una fila por aparato: endpoint + claves del navegador + idioma + tipos encendidos ({"retos":true,...}).
--   avisos     la cola: texto en español y en ingles (cada aparato recibe el de su idioma), pantalla a la que lleva al tocarlo, y enviado.
-- FUNCIONES DEL JUGADOR: push_alta(endpoint, p256dh, auth, ua, lang), push_baja(endpoint), push_tipos(tipos), push_estado(endpoint), push_prueba().
-- FUNCIONES DEL SINCRONIZADOR (llevan la clave sync_secret como sync_close): sync_avisos_pendientes(secreto, limite), sync_avisos_marca(secreto,
--   ids, endpoints_ok), sync_push_baja(secreto, endpoint) (suscripcion muerta: el navegador contesto 404 o 410).
-- Se puede ejecutar varias veces. Todo UPDATE y DELETE lleva su WHERE (pg-safeupdate). Va despues de 001 a 059 (053 es opcional: sin ella los
-- retos con mas gente simplemente no avisan a los de fuera de los dos primeros).

-- ---------- tablas ----------
create table if not exists push_subs (
  id bigint generated always as identity primary key,
  player uuid not null references players on delete cascade,
  endpoint text not null unique check (char_length(endpoint) between 20 and 1200 and endpoint like 'https://%'),
  p256dh text not null check (char_length(p256dh) between 20 and 200),
  auth text not null check (char_length(auth) between 8 and 100),
  ua text not null default '' check (char_length(ua) <= 300),
  lang text not null default 'es' check (lang in ('es', 'en')),
  tipos jsonb not null default '{"retos":true,"apuestas":true,"ranking":true,"paga":true,"chat":true}'::jsonb,
  creado timestamptz not null default now(),
  ultimo_ok timestamptz
);
create index if not exists push_subs_player on push_subs(player);
alter table push_subs enable row level security;
revoke all on push_subs from anon, authenticated;

create table if not exists avisos (
  id bigint generated always as identity primary key,
  player uuid not null references players on delete cascade,
  tipo text not null check (tipo ~ '^[a-z]{3,12}$'),
  titulo text not null,
  cuerpo text not null default '',
  titulo_en text,
  cuerpo_en text,
  url text not null default 'inicio',
  creado timestamptz not null default now(),
  enviar_desde timestamptz not null default now(),
  enviado timestamptz
);
create index if not exists avisos_pend on avisos(id) where enviado is null;
create index if not exists avisos_creado on avisos(creado);
alter table avisos enable row level security;
revoke all on avisos from anon, authenticated;

-- ---------- utilidades ----------
create or replace function fmt_en(n int) returns text language sql immutable as $$ select to_char(n, 'FM999,999,999,999') $$;
create or replace function fmt_odds_en(o numeric) returns text language sql immutable as $$ select replace(fmt_odds(o), ',', '.') $$;

-- apunta un aviso para un jugador (si tiene algun aparato con ese tipo encendido). Nunca falla.
create or replace function aviso_nuevo(p_player uuid, p_tipo text, p_titulo text, p_cuerpo text, p_titulo_en text, p_cuerpo_en text, p_url text default 'inicio')
returns void language plpgsql security definer set search_path = public as $$
declare v_desde timestamptz := now();
begin
  if p_player is null then return; end if;
  if not exists (select 1 from push_subs s where s.player = p_player and coalesce(s.tipos ->> p_tipo, 'true') <> 'false') then return; end if;
  -- la paga y los premios caen a las 00:00 del lunes: que el movil no suene de madrugada
  if p_tipo = 'paga' and extract(hour from now() at time zone 'Europe/Madrid') < 9 then
    v_desde := (date_trunc('day', now() at time zone 'Europe/Madrid') + interval '9 hours') at time zone 'Europe/Madrid';
  end if;
  insert into avisos(player, tipo, titulo, cuerpo, titulo_en, cuerpo_en, url, enviar_desde)
  values (p_player, p_tipo, left(p_titulo, 120), left(coalesce(p_cuerpo, ''), 240), left(p_titulo_en, 120), left(p_cuerpo_en, 240), coalesce(p_url, 'inicio'), v_desde);
exception when others then
  null;
end $$;

-- ---------- apuestas sueltas ----------
create or replace function trg_aviso_apuesta() returns trigger
language plpgsql security definer set search_path = public as $$
declare m matches; pk text; part text;
begin
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
    -- anulada por el partido (la que cancelas tu mismo no avisa)
    perform aviso_nuevo(new.player, 'apuestas', 'Apuesta devuelta', 'Te devuelven ' || fmt_int(new.payout) || ': ' || part,
      'Bet refunded', 'You get ' || fmt_en(new.payout) || ' back: ' || part, 'apuestas');
  end if;
  if new.status in ('won', 'lost') then perform aviso_ranking_revisa(); end if;
  return null;
exception when others then
  return null;
end $$;

drop trigger if exists aviso_apuesta on bets;
create trigger aviso_apuesta after update of status on bets
  for each row when (old.status = 'open' and new.status in ('won', 'lost', 'void'))
  execute function trg_aviso_apuesta();

-- ---------- combinadas ----------
create or replace function trg_aviso_combinada() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*)::int into n from combo_legs where combo_id = new.id;
  if new.status = 'won' then
    perform aviso_nuevo(new.player, 'apuestas', 'Combinada ganada: ' || fmt_int(coalesce(new.payout, 0)), 'Tu combinada de ' || n || ' partidos ha salido · cuota ' || fmt_odds(new.odds),
      'Parlay won: ' || fmt_en(coalesce(new.payout, 0)), 'Your ' || n || ' game parlay came in · odds ' || fmt_odds_en(new.odds), 'apuestas');
  elsif new.status = 'lost' then
    perform aviso_nuevo(new.player, 'apuestas', 'Has perdido ' || fmt_int(new.stake) || ' con tu combinada', 'Combinada de ' || n || ' partidos',
      'You lost ' || fmt_en(new.stake) || ' on your parlay', n || ' game parlay', 'apuestas');
  elsif new.status = 'void' and auth.uid() is distinct from new.player then
    perform aviso_nuevo(new.player, 'apuestas', 'Combinada devuelta', 'Te devuelven ' || fmt_int(coalesce(new.payout, new.stake)),
      'Parlay refunded', 'You get ' || fmt_en(coalesce(new.payout, new.stake)) || ' back', 'apuestas');
  end if;
  if new.status in ('won', 'lost') then perform aviso_ranking_revisa(); end if;
  return null;
exception when others then
  return null;
end $$;

drop trigger if exists aviso_combinada on combos;
create trigger aviso_combinada after update of status on combos
  for each row when (old.status = 'open' and new.status in ('won', 'lost', 'void'))
  execute function trg_aviso_combinada();

-- ---------- ranking de ratio: te quitan el puesto 1 ----------
-- Misma cuenta que ratio.js: cada apuesta resuelta (suelta o combinada) vale su cuota si se acierta, 0 si se falla, cobrado entre apostado
-- si se retira con cash out; el ratio es la media y hacen falta 5 resueltas. Empate: mas apuestas, luego el nombre.
create or replace function aviso_ranking_revisa() returns void
language plpgsql security definer set search_path = public as $$
declare v_top uuid; v_viejo uuid; v_nom text;
begin
  select v.player into v_top from (
    select x.player, sum(x.val) as s, count(*) as n from (
      select b.player, case b.status when 'won' then b.odds::numeric when 'lost' then 0::numeric else b.payout::numeric / b.stake end as val
        from bets b where b.status in ('won', 'lost', 'cashout') and b.stake > 0
      union all
      select c.player, case c.status when 'won' then c.odds::numeric when 'lost' then 0::numeric else coalesce(c.payout, 0)::numeric / c.stake end
        from combos c where c.status in ('won', 'lost', 'cashout') and c.stake > 0
    ) x group by x.player having count(*) >= 5
  ) v join players p on p.id = v.player
  order by round(v.s / v.n, 6) desc, v.n desc, p.name limit 1;
  if v_top is null then return; end if;
  select (value #>> '{}')::uuid into v_viejo from settings where key = 'push_top_ratio';
  if not found then
    insert into settings(key, value) values ('push_top_ratio', to_jsonb(v_top::text)) on conflict (key) do nothing;
    return;
  end if;
  if v_viejo is not distinct from v_top then return; end if;
  update settings set value = to_jsonb(v_top::text) where key = 'push_top_ratio';
  v_nom := pname(v_top);
  if v_viejo is not null and not exists (select 1 from avisos where player = v_viejo and tipo = 'ranking' and creado > now() - interval '10 minutes' and cuerpo like v_nom || '%') then
    perform aviso_nuevo(v_viejo, 'ranking', 'Has perdido el puesto 1', v_nom || ' te ha superado en el ranking de ratio',
      'You lost the top spot', v_nom || ' has overtaken you in the ratio ranking', 'liga');
  end if;
exception when others then
  null;
end $$;

-- ---------- retos ----------
-- quien esta dentro de un reto, en orden (con 053 incluye a los que entran despues; sin ella, solo los dos primeros)
create or replace function reto_entradas(c challenges) returns table(ord int, player uuid, pick text)
language plpgsql security definer set search_path = public as $$
begin
  if to_regprocedure('public.challenge_entries(bigint)') is not null then
    return query execute 'select e.ord, e.player, e.pick from challenge_entries($1) e order by e.ord' using c.id;
  else
    return query select 1, c.from_player, c.from_pick union all select 2, c.to_player, c.to_pick where c.to_player is not null and c.to_pick is not null;
  end if;
end $$;

create or replace function trg_aviso_reto_nuevo() returns trigger
language plpgsql security definer set search_path = public as $$
declare m matches; part text;
begin
  if new.to_player is null then return null; end if;
  select * into m from matches where id = new.match_id;
  part := concat_ws(' vs ', m.home, m.away);
  perform aviso_nuevo(new.to_player, 'retos', 'Te han retado', pname(new.from_player) || ' te ha retado a ' || fmt_int(new.stake) || ' en ' || part,
    'You have been challenged', pname(new.from_player) || ' challenged you to ' || fmt_en(new.stake) || ' on ' || part, 'inicio');
  return null;
exception when others then
  return null;
end $$;

drop trigger if exists aviso_reto_nuevo on challenges;
create trigger aviso_reto_nuevo after insert on challenges
  for each row when (new.to_player is not null)
  execute function trg_aviso_reto_nuevo();

create or replace function trg_aviso_reto_estado() returns trigger
language plpgsql security definer set search_path = public as $$
declare m matches; part text; e record; n_tot int; n_w int; share int; rem int; k int := 0; win text; pago int; pg_w text; pg_l text; quien text;
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
    perform aviso_nuevo(new.from_player, 'retos', 'Reto rechazado', pname(new.to_player) || ' no ha aceptado tu reto de ' || fmt_int(new.stake) || ' en ' || part || '. Te lo devolvemos',
      'Challenge declined', pname(new.to_player) || ' did not accept your challenge of ' || fmt_en(new.stake) || ' on ' || part || '. You get it back', 'inicio');
  elsif old.status = 'pending' and new.status = 'expired' then
    for e in select * from reto_entradas(new) loop
      perform aviso_nuevo(e.player, 'retos', 'Reto sin rival', 'Nadie ha entrado en el reto de ' || part || '. Te devuelven ' || fmt_int(new.stake),
        'Challenge without an opponent', 'Nobody joined the challenge on ' || part || '. You get ' || fmt_en(new.stake) || ' back', 'inicio');
    end loop;
  elsif old.status = 'accepted' and new.status = 'void' then
    for e in select * from reto_entradas(new) loop
      perform aviso_nuevo(e.player, 'retos', 'Reto sin ganador', 'Te devuelven ' || fmt_int(new.stake) || ' del reto de ' || part,
        'Challenge without a winner', 'You get ' || fmt_en(new.stake) || ' back from the challenge on ' || part, 'inicio');
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
end $$;

drop trigger if exists aviso_reto_estado on challenges;
create trigger aviso_reto_estado after update of status on challenges
  for each row when (old.status is distinct from new.status)
  execute function trg_aviso_reto_estado();

-- alguien se suma a un reto que ya tiene a los dos primeros (retos con mas gente, 053)
create or replace function trg_aviso_reto_suma() returns trigger
language plpgsql security definer set search_path = public as $$
declare c challenges; m matches; part text; e record; quien text;
begin
  select * into c from challenges where id = new.challenge_id;
  if not found then return null; end if;
  select * into m from matches where id = c.match_id;
  part := concat_ws(' vs ', m.home, m.away); quien := pname(new.player);
  for e in select * from reto_entradas(c) x where x.player <> new.player loop
    if e.player = c.from_player then
      perform aviso_nuevo(e.player, 'retos', 'Alguien más en tu reto', quien || ' ha entrado en tu reto · ' || part, 'Someone else in your challenge', quien || ' joined your challenge · ' || part, 'inicio');
    else
      perform aviso_nuevo(e.player, 'retos', 'Alguien más en el reto', quien || ' ha entrado en el reto de ' || pname(c.from_player) || ' · ' || part,
        'Someone else in the challenge', quien || ' joined ' || pname(c.from_player) || '''s challenge · ' || part, 'inicio');
    end if;
  end loop;
  return null;
exception when others then
  return null;
end $$;

do $$
begin
  if to_regclass('public.challenge_players') is not null then
    drop trigger if exists aviso_reto_suma on challenge_players;
    create trigger aviso_reto_suma after insert on challenge_players for each row execute function trg_aviso_reto_suma();
  end if;
end $$;

-- ---------- paga, bote, premios y ruleta global ----------
create or replace function trg_aviso_dinero() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'paga' then
    perform aviso_nuevo(new.player, 'paga', 'Ya tienes la paga del lunes', 'Han entrado ' || fmt_int(new.amount) || ' en tu cuenta',
      'Your Monday allowance is here', fmt_en(new.amount) || ' added to your account', 'monedero');
  elsif new.kind = 'bote_gana' then
    perform aviso_nuevo(new.player, 'paga', 'Has ganado el bote', 'Te llevas ' || fmt_int(new.amount) || ' del bote de la semana',
      'You won the pot', 'You take ' || fmt_en(new.amount) || ' from the weekly pot', 'monedero');
  elsif new.kind = 'ruleta_global' then
    perform aviso_nuevo(new.player, 'paga', '¡Te ha tocado la ruleta global!', 'Ganas ' || fmt_int(new.amount),
      'You hit the global wheel!', 'You win ' || fmt_en(new.amount), 'monedero');
  elsif new.kind = 'premio_semana' then
    perform aviso_nuevo(new.player, 'paga', 'Premio de la semana: ' || fmt_int(new.amount), new.note,
      'Prize of the week: ' || fmt_en(new.amount),
      case new.note when 'Más dinero de la semana' then 'Most money of the week' when 'Mejor ratio de la semana' then 'Best ratio of the week'
        when 'Combinada de la semana' then 'Parlay of the week' else new.note end, 'monedero');
  end if;
  return null;
exception when others then
  return null;
end $$;

drop trigger if exists aviso_dinero on ledger;
create trigger aviso_dinero after insert on ledger
  for each row when (new.kind in ('paga', 'bote_gana', 'ruleta_global', 'premio_semana'))
  execute function trg_aviso_dinero();

-- ---------- chat: te mencionan con @nombre ----------
create or replace function trg_aviso_chat() returns trigger
language plpgsql security definer set search_path = public as $$
declare p record; t text := lower(new.body); quien text := pname(new.player); n text; i int; hit boolean;
begin
  if new.player is null or position('@' in new.body) = 0 then return null; end if;
  for p in select id, name, username from players where id <> new.player loop
    hit := false;
    foreach n in array array['@' || lower(p.name), '@' || lower(p.username)] loop
      i := position(n in t);
      if i > 0 and (i + length(n) > length(t) or substr(t, i + length(n), 1) !~ '[a-z0-9_]') then hit := true; end if;
    end loop;
    if hit then
      perform aviso_nuevo(p.id, 'chat', quien || ' te ha mencionado', left(new.body, 160), quien || ' mentioned you', left(new.body, 160), 'chat');
    end if;
  end loop;
  return null;
exception when others then
  return null;
end $$;

drop trigger if exists aviso_chat on chat;
create trigger aviso_chat after insert on chat
  for each row when (new.player is not null)
  execute function trg_aviso_chat();

-- ---------- el jugador: apuntar su aparato ----------
-- Devuelve los tipos que quedan encendidos. Si el jugador ya tenia otro aparato, este hereda sus tipos; si el aparato era de otro jugador
-- (el mismo movil con otra cuenta), pasa a este.
create or replace function push_alta(p_endpoint text, p_p256dh text, p_auth text, p_ua text default '', p_lang text default 'es') returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_tipos jsonb; v_def jsonb := '{"retos":true,"apuestas":true,"ranking":true,"paga":true,"chat":true}'::jsonb;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  if p_endpoint is null or p_endpoint not like 'https://%' or char_length(p_endpoint) > 1200 then raise exception 'Ese aparato no vale para los avisos'; end if;
  if coalesce(char_length(p_p256dh), 0) < 20 or coalesce(char_length(p_auth), 0) < 8 then raise exception 'Faltan las claves del aparato'; end if;
  select s.tipos into v_tipos from push_subs s where s.player = me and s.endpoint <> p_endpoint order by s.ultimo_ok desc nulls last, s.id desc limit 1;
  if v_tipos is null then select s.tipos into v_tipos from push_subs s where s.player = me and s.endpoint = p_endpoint; end if;
  v_tipos := v_def || coalesce(v_tipos, '{}'::jsonb);
  insert into push_subs(player, endpoint, p256dh, auth, ua, lang, tipos)
  values (me, p_endpoint, p_p256dh, p_auth, left(coalesce(p_ua, ''), 300), case when p_lang = 'en' then 'en' else 'es' end, v_tipos)
  on conflict (endpoint) do update set player = excluded.player, p256dh = excluded.p256dh, auth = excluded.auth, ua = excluded.ua, lang = excluded.lang, tipos = excluded.tipos;
  -- como mucho 8 aparatos por jugador: se borran los mas viejos
  delete from push_subs where player = me and id not in (select s.id from push_subs s where s.player = me order by s.id desc limit 8);
  return v_tipos;
end $$;

create or replace function push_baja(p_endpoint text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  delete from push_subs where endpoint = p_endpoint and player = auth.uid();
end $$;

-- enciende o apaga tipos en TODOS los aparatos del jugador. p_tipos = {"chat": false, "retos": true}. Devuelve el resultado.
create or replace function push_tipos(p_tipos jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); k text; v jsonb; r jsonb;
  ok text[] := array['retos', 'apuestas', 'ranking', 'paga', 'chat'];
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  if p_tipos is null or jsonb_typeof(p_tipos) <> 'object' then raise exception 'Faltan los avisos que quieres'; end if;
  for k, v in select * from jsonb_each(p_tipos) loop
    if not (k = any(ok)) then raise exception 'Ese tipo de aviso no existe'; end if;
    if jsonb_typeof(v) <> 'boolean' then raise exception 'Cada aviso va encendido o apagado'; end if;
  end loop;
  select s.tipos into r from push_subs s where s.player = me order by s.ultimo_ok desc nulls last, s.id desc limit 1;
  r := '{"retos":true,"apuestas":true,"ranking":true,"paga":true,"chat":true}'::jsonb || coalesce(r, '{}'::jsonb) || p_tipos;
  update push_subs set tipos = r where player = me;
  return r;
end $$;

-- lo que ve Ajustes: si este aparato esta apuntado, los tipos y cuantos aparatos tiene el jugador
create or replace function push_estado(p_endpoint text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); r jsonb;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  select s.tipos into r from push_subs s where s.player = me order by (s.endpoint = p_endpoint) desc, s.ultimo_ok desc nulls last, s.id desc limit 1;
  return jsonb_build_object(
    'aparato', exists (select 1 from push_subs s where s.player = me and s.endpoint = p_endpoint),
    'aparatos', (select count(*) from push_subs s where s.player = me),
    'tipos', '{"retos":true,"apuestas":true,"ranking":true,"paga":true,"chat":true}'::jsonb || coalesce(r, '{}'::jsonb));
end $$;

-- un aviso de prueba para ti mismo (como mucho uno por minuto)
create or replace function push_prueba() returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  if not exists (select 1 from push_subs where player = me) then raise exception 'Activa los avisos en este aparato primero'; end if;
  if exists (select 1 from avisos where player = me and tipo = 'prueba' and creado > now() - interval '1 minute') then raise exception 'Espera un minuto para otra prueba'; end if;
  insert into avisos(player, tipo, titulo, cuerpo, titulo_en, cuerpo_en, url)
  values (me, 'prueba', 'Los avisos funcionan', 'Así te llegará cuando te reten o se resuelva una apuesta', 'Alerts are working', 'This is how you will hear when someone challenges you or a bet is settled', 'ajustes');
end $$;

-- ---------- el sincronizador ----------
create or replace function sync_avisos_pendientes(p_secret text, p_limite int default 50) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if p_secret is null or p_secret <> (select value #>> '{}' from settings where key = 'sync_secret') then
    raise exception 'Clave de sincronización no válida';
  end if;
  delete from avisos where creado < now() - interval '7 days';
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'tipo', a.tipo, 'titulo', a.titulo, 'cuerpo', a.cuerpo, 'titulo_en', a.titulo_en, 'cuerpo_en', a.cuerpo_en, 'url', a.url,
      'edad_s', extract(epoch from now() - a.creado)::int,
      'subs', (select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth, 'lang', s.lang)), '[]'::jsonb)
                 from push_subs s where s.player = a.player and coalesce(s.tipos ->> a.tipo, 'true') <> 'false')
    ) order by a.id), '[]'::jsonb) into r
  from (select * from avisos where enviado is null and enviar_desde <= now() order by id limit greatest(1, least(coalesce(p_limite, 50), 200))) a;
  return r;
end $$;

create or replace function sync_avisos_marca(p_secret text, p_ids bigint[], p_endpoints text[] default '{}') returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0;
begin
  if p_secret is null or p_secret <> (select value #>> '{}' from settings where key = 'sync_secret') then
    raise exception 'Clave de sincronización no válida';
  end if;
  if coalesce(cardinality(p_ids), 0) > 0 then
    update avisos set enviado = now() where id = any(p_ids) and enviado is null;
    get diagnostics n = row_count;
  end if;
  if coalesce(cardinality(p_endpoints), 0) > 0 then
    update push_subs set ultimo_ok = now() where endpoint = any(p_endpoints);
  end if;
  return n;
end $$;

create or replace function sync_push_baja(p_secret text, p_endpoint text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_secret is null or p_secret <> (select value #>> '{}' from settings where key = 'sync_secret') then
    raise exception 'Clave de sincronización no válida';
  end if;
  delete from push_subs where endpoint = p_endpoint;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- quien puede llamar a que ----------
revoke all on function aviso_nuevo(uuid, text, text, text, text, text, text), aviso_ranking_revisa(), reto_entradas(challenges),
  trg_aviso_apuesta(), trg_aviso_combinada(), trg_aviso_reto_nuevo(), trg_aviso_reto_estado(), trg_aviso_reto_suma(), trg_aviso_dinero(), trg_aviso_chat()
  from public, anon, authenticated;
revoke all on function push_alta(text, text, text, text, text), push_baja(text), push_tipos(jsonb), push_estado(text), push_prueba() from public, anon;
grant execute on function push_alta(text, text, text, text, text), push_baja(text), push_tipos(jsonb), push_estado(text), push_prueba() to authenticated;
revoke all on function sync_avisos_pendientes(text, int), sync_avisos_marca(text, bigint[], text[]), sync_push_baja(text, text) from public;
grant execute on function sync_avisos_pendientes(text, int), sync_avisos_marca(text, bigint[], text[]), sync_push_baja(text, text) to anon, authenticated;
