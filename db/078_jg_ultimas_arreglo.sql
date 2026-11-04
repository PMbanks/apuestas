-- 078 (04-11). Arreglo de db/077: jg_ultimas devolvia [2, 2, 2...] (o [null, null, 2...]) en vez de las jugadas. En "from (...) x" la columna
-- "x" (el multiplicador) tapaba al alias x, asi que jsonb_agg(x) agregaba el multiplicador y no la fila entera. Ahora la fila se llama q y va
-- con to_jsonb(q). Mismas columnas y mismo resultado de siempre en las cinco ramas (ruleta, minas, carrera, blackjack, moneda).
-- Se puede ejecutar varias veces. Prueba: db/078_prueba.sql (se deshace sola, acaba en "PRUEBA SUPERADA").

create or replace function jg_ultimas(p_juego text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); v jsonb;
begin
  if p_juego = 'ruleta' then
    select coalesce(jsonb_agg(to_jsonb(q) order by q.t desc), '[]') into v from (
      select a.player, a.stake, a.pago, a.color as que, r.n as sale, r.color as sale_c, case when a.pago > 0 then round(a.pago::numeric / a.stake, 2) end as x, r.creada as t
        from jg_ruleta_apuestas a join jg_ruleta r on r.id = a.ronda where r.estado = 'pagada' order by r.id desc, a.id desc limit 5) q;
  elsif p_juego = 'minas' then
    select coalesce(jsonb_agg(to_jsonb(q) order by q.t desc), '[]') into v from (
      select g.player, g.stake, g.pago, g.minas, cardinality(g.abiertas) as n, case when g.pago > 0 then g.mult end as x, g.cerrada as t
        from jg_minas g where g.estado <> 'curso' order by g.id desc limit 5) q;
  elsif p_juego = 'carrera' then
    select coalesce(jsonb_agg(to_jsonb(q) order by q.t desc), '[]') into v from (
      select a.player, a.stake, a.pago, r.caballos->(a.caballo - 1)->>'nombre' as que, r.caballos->(r.orden[1] - 1)->>'nombre' as sale,
             case when a.pago > 0 then a.cuota end as x, a.cuota, r.creada + make_interval(secs => r.corre_s) as t
        from jg_carrera_apuestas a join jg_carrera r on r.id = a.ronda where r.estado = 'pagada' order by r.id desc, a.id desc limit 5) q;
  elsif p_juego = 'blackjack' then
    select coalesce(jsonb_agg(to_jsonb(q) order by q.t desc), '[]') into v from (
      select m.player, m.total as stake, m.pago, m.resultado as que, case when m.pago > 0 then round(m.pago::numeric / m.total, 2) end as x, m.cerrada as t
        from bjm_mano m where m.resultado is not null order by m.cerrada desc limit 5) q;
  elsif p_juego = 'moneda' then
    select coalesce(jsonb_agg(to_jsonb(q) order by q.t desc), '[]') into v from (
      select m.ganador as player, m.stake, m.stake * 2 as pago, case when m.ganador = m.creador then m.rival else m.creador end as rival, m.salio as sale, 2 as x, m.cerrado as t
        from jg_moneda m where m.estado = 'hecho' order by m.cerrado desc limit 5) q;
  else raise exception 'Ese juego no tiene ultimas jugadas';
  end if;
  return jsonb_build_object('now', jg_ahora(), 'juego', p_juego, 'jugadas', v);
end $$;
revoke all on function jg_ultimas(text) from public, anon;
grant execute on function jg_ultimas(text) to authenticated;
