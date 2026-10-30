-- 017b (30-10): ranking de cada juego (crash, blackjack y cara o cruz). Se carga despues de 017.
-- Los movimientos de saldo de los demas no se pueden leer (ledger solo deja leer los propios), asi que el ranking sale de las
-- tablas de los juegos y se devuelve YA AGREGADO: por jugador, solo lo ganado en neto, las jugadas y (en el crash) su mejor
-- multiplicador cobrado. No sale ninguna mano, ni carta, ni apuesta suelta de nadie.
--   jg_ranking('crash' | 'blackjack' | 'moneda', 'siempre' | 'semana')   -- la semana empieza el lunes, hora de Madrid
-- Devuelve un array ordenado de mayor a menor ganancia neta: [{player, neto, jugadas, mejor}]
create or replace function jg_ranking(p_juego text, p_periodo text default 'siempre') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := jg_yo();
  v_desde timestamptz := case when p_periodo = 'semana' then (madrid_week()::timestamp at time zone 'Europe/Madrid') else '-infinity'::timestamptz end;
  v_out jsonb;
begin
  if p_juego is null or p_juego not in ('crash', 'blackjack', 'moneda') then raise exception 'Ese juego no tiene ranking'; end if;
  if p_periodo is null or p_periodo not in ('siempre', 'semana') then raise exception 'Elige siempre o semana'; end if;
  if p_juego = 'crash' then
    select coalesce(jsonb_agg(jsonb_build_object('player', t.player, 'neto', t.neto, 'jugadas', t.n, 'mejor', t.mejor) order by t.neto desc, t.n desc), '[]'::jsonb) into v_out
      from (select a.player, sum(a.pago - a.stake)::int as neto, count(*)::int as n, max(a.retiro) filter (where a.estado = 'cobrada') as mejor
              from jg_crash_apuestas a join players p on p.id = a.player
             where a.estado in ('cobrada', 'perdida') and a.creada >= v_desde group by a.player) t;
  elsif p_juego = 'blackjack' then
    select coalesce(jsonb_agg(jsonb_build_object('player', t.player, 'neto', t.neto, 'jugadas', t.n) order by t.neto desc, t.n desc), '[]'::jsonb) into v_out
      from (select h.player, sum(h.pago - h.total)::int as neto, count(*)::int as n
              from jg_bj h join players p on p.id = h.player
             where h.estado = 'fin' and h.cerrada >= v_desde group by h.player) t;
  else
    select coalesce(jsonb_agg(jsonb_build_object('player', t.player, 'neto', t.neto, 'jugadas', t.n) order by t.neto desc, t.n desc), '[]'::jsonb) into v_out
      from (select x.player, sum(x.d)::int as neto, count(*)::int as n
              from (select m.ganador as player, m.stake as d from jg_moneda m where m.estado = 'hecho' and m.cerrado >= v_desde
                    union all
                    select case when m.ganador = m.creador then m.rival else m.creador end, -m.stake from jg_moneda m where m.estado = 'hecho' and m.cerrado >= v_desde) x
              join players p on p.id = x.player group by x.player) t;
  end if;
  return v_out;
end $$;
revoke all on function jg_ranking(text, text) from public, anon;
grant execute on function jg_ranking(text, text) to authenticated;
