-- 028 (30-10 noche). PM: "de football quita la FA Cup, MLS, Conference, Eredivisie, Brasileirao, Liga MX y Liga Portugal".
-- sync.mjs ya no las trae. Aqui se borran los partidos que ya tenia la base de esas ligas, pero solo los que no tienen nada
-- colgado (apuestas, retos, apuesta del dia, cuota mejorada, predicciones): esos se quedarian para pagarse bien (al cargarla, ninguno).
-- Se puede ejecutar varias veces.
delete from matches m
where m.league in ('eng.fa', 'usa.1', 'uefa.europa.conf', 'ned.1', 'bra.1', 'mex.1', 'por.1')
  and not exists (select 1 from bets b where b.match_id = m.id)
  and not exists (select 1 from challenges c where c.match_id = m.id)
  and not exists (select 1 from daily d where d.match_id = m.id)
  and not exists (select 1 from ex_boosts x where x.match_id = m.id)
  and not exists (select 1 from ex_pred p where p.match_id = m.id);
select bump();
select coalesce(string_agg(league || ' ' || status || ' ' || n, ', '), 'nada') as quedan
from (select league, status, count(*) as n from matches
      where league in ('eng.fa', 'usa.1', 'uefa.europa.conf', 'ned.1', 'bra.1', 'mex.1', 'por.1') group by 1, 2) q;
