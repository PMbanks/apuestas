-- 067 (02-11). COMBINADA CON VARIAS APUESTAS DEL MISMO PARTIDO (same game parlay). PM: "los parlays en teoria en algunas casas de
-- apuestas se puede poner de un mismo partido mas de uno, lo digo para que lo pongas".
-- Va despues de 052 (F1, la ultima definicion de place_combo) y de 036 (combo_resuelve y combo_cash_value). No toca los retos.
--
-- QUE CAMBIA
--   * Una combinada puede llevar hasta 3 apuestas del mismo partido, si son compatibles (tabla de abajo). Sigue siendo de 2 a 8
--     apuestas en total. La F1 se queda como estaba: una sola apuesta por Gran Premio (sus sesiones y duelos van muy unidos).
--   * Cuota: el producto de las cuotas de siempre, multiplicado por 0,85 por cada apuesta de mas del mismo partido, redondeado a 2
--     decimales y con tope 1.000 (cmb_total). Sin apuestas repetidas de partido el factor es 1 y la cuota es EXACTAMENTE la de antes.
--   * Pago (combo_resuelve): igual que siempre (gana si aciertan todas, la anulada cuenta como 1), y el 0,85 se recalcula con las que
--     quedan: si de un partido queda una sola apuesta valida (las demas anuladas), ese partido ya no lleva recorte. Si con el recorte
--     lo acertado no llega a 1,00, se cobra lo apostado (nunca menos de lo apostado por acertar).
--   * Cash out (combo_cash_value): mientras haya dos o mas apuestas del mismo partido sin resolver, NO hay cash out en directo
--     (el modelo de 024 / 036 da la probabilidad de cada apuesta por separado; multiplicarlas fingiria que no tienen nada que ver y
--     podria regalar dinero). Antes de que empiece ningun partido se puede cancelar como siempre (devuelve todo). Cuando ese partido
--     acaba y sus apuestas salen, el cash out vuelve con lo que quede, con el recorte ya aplicado a lo que pagaria.
--   * combo_legs: la clave pasa de (combinada, partido) a (combinada, partido, eleccion).
--
-- POR QUE 0,85
--   Las cuotas de la app casi no llevan margen (el sincronizador quita un 6 % y luego sube un 5 %: cada cuota paga un 99 % de lo
--   justo). Asi que el recorte tiene que tapar el solo lo que dos apuestas del mismo partido van de la mano. Se ha medido con el mismo
--   modelo que usa el sincronizador para poner las cuotas (Poisson en futbol, mapas independientes en las series), en partidos de 1,6
--   a 4,2 goles esperados y de favorito claro a igualado: la pareja permitida mas unida (gana el que no es favorito + ambos marcan)
--   sale como mucho 1,195 veces mas probable de lo que dice multiplicar. 0,85 x 1,195 x 0,99 x 0,99 = 0,995: ni en el peor caso
--   medido gana el jugador a la larga. En las parejas normales (por ejemplo empate + mas de 2,5 goles, 0,76; mapa 1 + mapa 2, 1,00)
--   la casa se queda un 15 % o mas. 0,9 no llegaba (1,195 x 0,9 = 1,07: regalaba dinero en ese caso).
--   Ejemplos: Barcelona 1,80 x ambos marcan si 1,90 = 3,42 -> x 0,85 = 2,907 -> 2,91. Con otro partido a 2,00: 1,80 x 1,90 x 2,00 =
--   6,84 -> x 0,85 = 5,814 -> 5,81. Tres mapas de una serie (2,00 x 2,00 x 2,00 = 8) -> x 0,85 x 0,85 = 5,78.
--
-- TABLA DE COMPATIBILIDAD (dos apuestas del mismo partido; lo que no esta permitido aqui se rechaza)
--   Siempre NO: la misma apuesta dos veces, dos del mismo mercado (dos resultados 1X2, dos lineas de goles, dos de ambos marcan,
--   dos resultados de la serie, el mismo mapa a los dos equipos, dos handicaps, dos totales, dos del mismo jugador).
--   FUTBOL  (familias: resultado 1X2, goles O/U, ambos marcan GG/NG)
--     resultado + ambos marcan:  SI  1 o 2 con ambos marcan si (1,195 en el peor caso, 1,01 en partidos normales)
--                                SI  empate con ambos marcan no (es el 0 a 0; 0,89)
--                                NO  1 o 2 con ambos marcan no (1,21: van de la mano, el que gana no encaja gol)
--                                NO  empate con ambos marcan si (1,5: 1 a 1, 2 a 2...)
--     resultado + goles:         SI  empate con mas de 1,5 / 2,5 / 3,5 goles (1,00 / 0,76 / 0,99)
--                                NO  empate con menos de N goles (hasta 1,84: el empate es casi siempre de pocos goles)
--                                NO  1 o 2 con cualquier linea de goles (hasta 1,5: depende de quien sea el favorito)
--     goles + ambos marcan:      NO  (ambos marcan si ya son 2 goles: incluye a mas de 1,5 y choca con menos de 1,5; hasta 3,6)
--     Asi, de un partido de futbol caben como mucho 2 apuestas.
--   VALORANT Y CS2  (familias: la serie = ganador, resultado exacto, +1,5 mapas, mapas jugados; y el ganador de cada mapa)
--     la serie + la serie:       NO  (en una serie al mejor de 3 o 5 dos cosas de la serie dejan el resultado casi decidido: el ganador
--                                    con mas de 2,5 mapas es el 2 a 1; hasta 9 veces mas probable)
--     la serie + un mapa:        NO  (el que gana el mapa 1 gana la serie mucho mas: hasta 4,6. Por eso NO entra "ganador del partido +
--                                    ganador de un mapa", el ejemplo de PM: pagaria muchisimo de mas)
--     mapa + otro mapa:          SI  (cada mapa se juega aparte: 1,00 con el modelo de las cuotas). El mapa que no se juega se anula
--                                    como siempre y sale del calculo.
--   NBA  (familias: ganador, handicap de puntos, total de puntos, cada jugador)
--     ganador + total:           SI  (quien gana y cuantos puntos se meten entre los dos casi no tienen que ver)
--     handicap + total:          SI  (lo mismo)
--     ganador + handicap:        NO  (el handicap es ganar por tanto: van atados)
--     jugador + otro jugador:    SI  (dos jugadores distintos, de cualquier equipo; hasta 3)
--     jugador + ganador / handicap / total: NO (los puntos de una estrella van con los de su equipo y con el total)
--   F1: una sola apuesta por Gran Premio (como en 052).   UFC: solo hay ganador, asi que nada.
--   Y como mucho 3 apuestas de un mismo partido.
--
-- Se puede ejecutar varias veces. Despues: 067_prueba.sql.


-- ---------- combo_legs: varias patas del mismo partido ----------
do $$
declare k text;
begin
  select conname into k from pg_constraint where conrelid = 'combo_legs'::regclass and contype = 'p';
  if k is not null and (select count(*) from pg_constraint c, unnest(c.conkey) a where c.conrelid = 'combo_legs'::regclass and c.conname = k) = 2 then
    execute format('alter table combo_legs drop constraint %I', k);
    k := null;
  end if;
  if k is null then alter table combo_legs add constraint combo_legs_pkey primary key (combo_id, match_id, pick); end if;
end $$;


-- ---------- la familia de mercado de una eleccion en su partido ----------
create or replace function cmb_fam(m matches, p text) returns text
language sql immutable as $$
  select case
    when p ~ '^F[WPTLXQSCK]:' then 'F'
    when m.sport = 'f' then case when p in ('1', 'X', '2') then 'R' when p ~ '^[OU][0-9]\.5$' then 'G' when p in ('GG', 'NG') then 'A' else 'Z:' || p end
    when m.sport in ('v', 'c') then case when p ~ '^W[1-5]-[12]$' then 'W' || substr(p, 2, 1) else 'SER' end
    when m.sport = 'b' then case when p in ('1', '2') then 'R' when p ~ '^SP[12]' then 'SP' when p ~ '^T[OU]' then 'TP'
                                 when p ~ '^J[12]:' then 'J:' || split_part(p, ':', 2) else 'Z:' || p end
    else 'R' end
$$;

-- ---------- si dos elecciones del mismo partido se pueden combinar: null si si, y si no, el porque ----------
-- La tabla de arriba. Lo que no esta permitido de forma expresa, se rechaza.
create or replace function cmb_choque(m matches, p1 text, p2 text) returns text
language plpgsql immutable as $$
declare a text := cmb_fam(m, p1); b text := cmb_fam(m, p2); p text := p1; q text := p2; x text;
begin
  if p1 = p2 then return 'es la misma apuesta dos veces'; end if;
  if a = b then return case when a like 'J:%' then 'son del mismo jugador' else 'son del mismo mercado' end; end if;
  if a > b then x := a; a := b; b := x; x := p; p := q; q := x; end if;     -- a < b por orden alfabetico (A < G < R, R < TP, SP < TP)
  if m.sport = 'f' then
    if a = 'A' and b = 'R' and ((q in ('1', '2') and p = 'GG') or (q = 'X' and p = 'NG')) then return null; end if;
    if a = 'G' and b = 'R' and q = 'X' and p in ('O1.5', 'O2.5', 'O3.5') then return null; end if;
  elsif m.sport in ('v', 'c') then
    if a like 'W_' and b like 'W_' then return null; end if;
  elsif m.sport = 'b' then
    if (a = 'R' and b = 'TP') or (a = 'SP' and b = 'TP') or (a like 'J:%' and b like 'J:%') then return null; end if;
  end if;
  return 'van demasiado unidas';
end $$;

-- ---------- el recorte por ir del mismo partido: 0,85 por cada apuesta de mas de un partido ----------
-- ids: el partido de cada apuesta que cuenta (las anuladas no se pasan). Exacto (multiplicaciones de numeric, sin potencias).
create or replace function cmb_factor(ids text[]) returns numeric
language plpgsql immutable as $$
declare e int := coalesce(cardinality(ids), 0) - (select count(distinct x) from unnest(ids) x); f numeric := 1; i int;
begin
  for i in 1 .. e loop f := f * 0.85; end loop;
  return f;
end $$;

-- la cuota de una combinada: producto x recorte, a 2 decimales, tope 1.000. Sin partidos repetidos es la formula de siempre.
-- La app (boleto.js) hace la misma cuenta con enteros (BigInt) y el mismo redondeo (la mitad hacia arriba).
create or replace function cmb_total(odds numeric[], ids text[]) returns numeric
language plpgsql immutable as $$
declare prod numeric := 1; i int;
begin
  for i in 1 .. coalesce(cardinality(odds), 0) loop prod := prod * odds[i]; end loop;
  return least(round(prod * cmb_factor(ids), 2), 1000);
end $$;

-- "3 partidos", "2 apuestas del mismo partido" o "3 apuestas en 2 partidos" (chat)
create or replace function cmb_que(n int, nm int) returns text
language sql immutable as $$
  select case when nm >= n then n || ' partidos' when nm = 1 then n || ' apuestas del mismo partido' else n || ' apuestas en ' || nm || ' partidos' end
$$;


-- ---------- apostar (la de 052 tal cual, con varias del mismo partido y el recorte) ----------
create or replace function place_combo(p_legs jsonb, p_stake int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); l jsonb; m matches; o numeric; tot numeric; n int; bal int; cid bigint; gps text[] := '{}';
  ids text[] := '{}'; picks text[] := '{}'; odds numeric[] := '{}'; i int; por int; why text; nm int;
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
    -- F1 (052): dos patas del mismo Gran Premio (o dos de campeonato) estan relacionadas: una sola por fin de semana
    if m.sport = 'r' then
      if (m.details ->> 'gp') = any(gps) then raise exception 'Una combinada no puede llevar dos apuestas del mismo Gran Premio'; end if;
      gps := gps || (m.details ->> 'gp');
    end if;
    if m.status <> 'scheduled' or m.starts_at <= now() then raise exception '% vs % ya ha empezado: quítalo de la combinada', m.home, m.away; end if;
    if not mk_valido(l->>'pick') then raise exception 'Esa elección no es válida'; end if;
    o := mk_cuota(m, l->>'pick');
    if o is null or o <= 1 then raise exception 'Esa opción de % vs % no se puede apostar', m.home, m.away; end if;
    -- 067: del mismo partido, solo lo compatible y como mucho 3
    por := 0;
    for i in 1 .. cardinality(ids) loop
      if ids[i] = m.id then
        por := por + 1;
        why := cmb_choque(m, picks[i], l->>'pick');
        if why is not null then
          raise exception 'No se pueden combinar % y % (% vs %): %', pick_name(m, picks[i]), pick_name(m, l->>'pick'), m.home, m.away, why;
        end if;
      end if;
    end loop;
    if por >= 3 then raise exception 'Como mucho 3 apuestas del mismo partido (% vs %)', m.home, m.away; end if;
    ids := ids || m.id; picks := picks || (l->>'pick'); odds := odds || o;
  end loop;
  tot := cmb_total(odds, ids);
  if tot <= 1 then raise exception 'Con el ajuste por ir del mismo partido la cuota no pasa de 1,00'; end if;
  nm := (select count(distinct x) from unnest(ids) x);
  select coalesce(sum(amount), 0) into bal from ledger where player = me;
  if p_stake > bal then raise exception 'No tienes saldo suficiente: te quedan %', fmt_int(bal); end if;
  insert into combos(player, stake, odds) values (me, p_stake, tot) returning id into cid;
  insert into combo_legs(combo_id, match_id, pick, odds)
    select cid, x->>'match', x->>'pick', mk_cuota(mm, x->>'pick')
    from jsonb_array_elements(p_legs) x join matches mm on mm.id = x->>'match';
  insert into ledger(player, amount, kind, note) values (me, -p_stake, 'apuesta', 'Combinada de ' || n || ' · cuota ' || fmt_odds(tot));
  insert into chat(body) select p.name || ' hace una combinada de ' || cmb_que(n, nm) || ' por ' || fmt_int(p_stake) || ' a cuota ' || fmt_odds(tot) from players p where p.id = me;
  perform bump();
  return jsonb_build_object('combo', cid, 'odds', tot, 'saldo', bal - p_stake, 'ajuste', cmb_factor(ids));
end $$;


-- ---------- pagar (la de 036, con el recorte recalculado con las que quedan) ----------
create or replace function combo_resuelve(p_match text) returns int
language plpgsql security definer set search_path = public as $$
declare m matches; c combos; n int := 0; pend int; perd int; gan int; prod numeric; pay int; nm text; npart int;
begin
  select * into m from matches where id = p_match;
  if not found or m.status not in ('final', 'canceled') then return 0; end if;
  update combo_legs l set result = mk_resultado(m, l.pick)
    where l.match_id = p_match and l.result is null;
  for c in select * from combos where status = 'open' and id in (select combo_id from combo_legs where match_id = p_match) for update loop
    select count(*) filter (where result is null), count(*) filter (where result = 'lost'), count(*) filter (where result = 'won'), count(distinct match_id)
      into pend, perd, gan, npart from combo_legs where combo_id = c.id;
    nm := (select name from players where id = c.player);
    if perd > 0 then
      update combos set status = 'lost', settled_at = now() where id = c.id;
      insert into chat(body) values (nm || ' perdió una combinada de ' || fmt_int(c.stake));
    elsif pend = 0 and gan = 0 then
      update combos set status = 'void', payout = c.stake, settled_at = now() where id = c.id;
      insert into ledger(player, amount, kind, note) values (c.player, c.stake, 'devolucion', 'Combinada anulada');
    elsif pend = 0 then
      -- las acertadas (las anuladas no cuentan, ni para la cuota ni para el recorte); nunca menos de lo apostado
      select cmb_total(array_agg(odds order by match_id, pick), array_agg(match_id order by match_id, pick)) into prod
        from combo_legs where combo_id = c.id and result = 'won';
      prod := greatest(prod, 1);
      pay := round(c.stake * prod)::int;
      update combos set status = 'won', payout = pay, settled_at = now() where id = c.id;
      insert into ledger(player, amount, kind, note) values (c.player, pay, 'premio', 'Combinada · cuota ' || fmt_odds(prod));
      insert into chat(body) values (nm || ' ganó ' || fmt_int(pay) || ' con una combinada de ' || cmb_que(pend + gan + perd, npart));
    end if;
    n := n + 1;
  end loop;
  if n > 0 then perform bump(); end if;
  return n;
end $$;


-- ---------- cash out en directo (la de 036; sin cash out con dos o mas del mismo partido por resolver) ----------
create or replace function combo_cash_value(c combos) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare l combo_legs; m matches; b bets; q jsonb; p numeric := 1; paga numeric := c.stake; empezado boolean := false; cur numeric; v numeric;
  ids text[] := '{}'; juntas text[];
begin
  if c.status <> 'open' then return jsonb_build_object('ok', false, 'why', 'La combinada ya está cerrada'); end if;
  -- partidos con dos o mas apuestas aun sin resolver
  juntas := array(select match_id from combo_legs where combo_id = c.id and result is null group by match_id having count(*) > 1);
  for l in select * from combo_legs where combo_id = c.id order by match_id, pick loop
    if l.result = 'lost' then return jsonb_build_object('ok', false, 'why', 'Ya ha fallado un partido'); end if;
    if l.result = 'void' then empezado := true; continue; end if;
    paga := paga * l.odds; ids := ids || l.match_id;
    if l.result = 'won' then empezado := true; continue; end if;
    select * into m from matches where id = l.match_id;
    if not (m.status = 'scheduled' and m.starts_at > now()) then empezado := true; end if;
    if l.match_id = any(juntas) then continue; end if;
    if m.status = 'scheduled' and m.starts_at > now() then
      cur := mk_cuota(m, l.pick);
      if cur is null or cur <= 1 then return jsonb_build_object('ok', false, 'why', 'Ahora no hay cuota para uno de sus partidos'); end if;
      p := p * least(0.97, 1 / (cur * 1.05));
    else
      b.status := 'open'; b.boost := null; b.pick := l.pick; b.stake := 100; b.odds := l.odds;
      q := ex_cash_value(b, m);
      if not coalesce((q->>'ok')::boolean, false) or q->>'p' is null then
        return jsonb_build_object('ok', false, 'why', coalesce(q->>'why', 'Sin datos frescos del directo'));
      end if;
      p := p * (q->>'p')::numeric;
    end if;
  end loop;
  if not empezado then return jsonb_build_object('ok', false, 'mode', 'pre', 'why', 'Aún no ha empezado ninguno: cancélala y te devuelve todo'); end if;
  if cardinality(juntas) > 0 then
    return jsonb_build_object('ok', false, 'why', 'Lleva varias apuestas del mismo partido: sin cash out hasta que acabe ese partido');
  end if;
  paga := least(paga * cmb_factor(ids), c.stake * 1000);
  v := paga * least(0.99, greatest(0.001, p)) * 0.90;
  return jsonb_build_object('ok', true, 'mode', 'live', 'win', round(paga)::int, 'value', least(round(paga), greatest(1, round(v)))::int);
end $$;


-- ---------- quien puede llamar a que ----------
-- (place_combo, combo_resuelve y combo_cash_value conservan sus permisos: create or replace no los toca)
revoke all on function cmb_fam(matches, text), cmb_choque(matches, text, text), cmb_factor(text[]), cmb_total(numeric[], text[]), cmb_que(int, int)
  from public, anon, authenticated;
