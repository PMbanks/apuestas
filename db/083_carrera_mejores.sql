-- 083 (04-11). PM: "que se vea las mejores odds, o sea como los mejores winners de ratio" (caballos, db/073, 077, 080).
-- Una sola funcion NUEVA y de solo lectura: carrera_mejores(periodo) con lo que la app ensena debajo de los ganadores de la carrera:
--   * ratio: por jugador, lo cobrado entre lo apostado en carreras ya pagadas (2,00 = ha doblado lo que puso), con lo apostado, lo
--     cobrado, aciertos, apuestas, carreras y la cuota mas alta que ha acertado. Primero quien tiene 3 apuestas o mas (asi una sola
--     apuesta con suerte no tapa a todos) y dentro, de mayor a menor ratio.
--   * aciertos: las 8 apuestas ganadas con la cuota mas alta (quien, a que caballo, cuota, lo puesto y lo cobrado).
--   * sorpresas: las 5 carreras que gano el caballo con la cuota mas alta (apostara alguien o no).
-- periodo: 'siempre' o 'semana' (desde el lunes, hora de Madrid, como jg_ranking). No escribe nada ni toca dinero.
-- La app funciona sin esto (usa jg_ranking para la cuota mas alta acertada); con 083 cargado sale el ranking por ratio completo.
-- Se puede ejecutar varias veces. Va despues de 080. Prueba: db/083_prueba.sql (se deshace sola, acaba en "PRUEBA SUPERADA").

create or replace function carrera_mejores(p_periodo text default 'siempre') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := jg_yo();
  v_desde timestamptz;
  v_ratio jsonb; v_ac jsonb; v_sor jsonb;
begin
  if p_periodo is null or p_periodo not in ('siempre', 'semana') then raise exception 'Elige siempre o semana'; end if;
  v_desde := case when p_periodo = 'semana' then (madrid_week()::timestamp at time zone 'Europe/Madrid') else '-infinity'::timestamptz end;

  select coalesce(jsonb_agg(jsonb_build_object('player', t.player, 'apostado', t.apostado, 'cobrado', t.cobrado,
           'ratio', round(t.cobrado::numeric / t.apostado, 3), 'aciertos', t.aciertos, 'apuestas', t.n, 'carreras', t.carreras, 'mejor_cuota', t.mejor)
           order by (t.n >= 3) desc, t.cobrado::numeric / t.apostado desc, t.cobrado desc, t.apostado desc), '[]'::jsonb) into v_ratio
    from (select a.player, sum(a.stake)::bigint as apostado, sum(a.pago)::bigint as cobrado, (count(*) filter (where a.pago > 0))::int as aciertos,
                 count(*)::int as n, count(distinct a.ronda)::int as carreras, max(a.cuota) filter (where a.pago > 0) as mejor
            from jg_carrera_apuestas a join jg_carrera r on r.id = a.ronda join players p on p.id = a.player
           where r.estado = 'pagada' and r.creada >= v_desde and a.stake > 0
           group by a.player) t;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.cuota desc, q.pago desc, q.ronda desc), '[]'::jsonb) into v_ac
    from (select a.player, a.caballo as n, r.caballos->(a.caballo - 1)->>'nombre' as caballo, r.caballos->(a.caballo - 1)->>'color' as color,
                 r.caballos->(a.caballo - 1)->>'color2' as color2, a.cuota, a.stake, a.pago, r.id as ronda, r.creada + make_interval(secs => r.corre_s) as t
            from jg_carrera_apuestas a join jg_carrera r on r.id = a.ronda
           where r.estado = 'pagada' and a.pago > 0 and r.creada >= v_desde
           order by a.cuota desc, a.pago desc, a.id desc limit 8) q;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.cuota desc, q.ronda desc), '[]'::jsonb) into v_sor
    from (select r.id as ronda, r.orden[1] as n, r.caballos->(r.orden[1] - 1)->>'nombre' as caballo, r.caballos->(r.orden[1] - 1)->>'color' as color,
                 r.caballos->(r.orden[1] - 1)->>'color2' as color2, (r.caballos->(r.orden[1] - 1)->>'cuota')::numeric as cuota,
                 r.creada + make_interval(secs => r.corre_s) as t
            from jg_carrera r
           where r.estado = 'pagada' and r.orden is not null and r.creada >= v_desde
           order by (r.caballos->(r.orden[1] - 1)->>'cuota')::numeric desc, r.id desc limit 5) q;

  return jsonb_build_object('now', jg_ahora(), 'periodo', p_periodo, 'ratio', v_ratio, 'aciertos', v_ac, 'sorpresas', v_sor);
end $$;

revoke all on function carrera_mejores(text) from public, anon;
grant execute on function carrera_mejores(text) to authenticated;
