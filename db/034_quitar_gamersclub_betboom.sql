-- 034 (01-11). PM: "quita en CS2 la Gamers Club y en Valorant la BetBoom".
-- sync.mjs ya no las trae (FUERA_ES) y la app las esconde (LIGAS_FUERA_NOMBRE). Aqui se borran los partidos que ya tenia la
-- base, solo los que no tienen nada colgado (al escribirla: 19 partidos, ninguno con apuestas). Se puede ejecutar varias veces.
delete from matches m
where m.league_name ~* 'gamers ?club|betboom'
  and not exists (select 1 from bets b where b.match_id = m.id)
  and not exists (select 1 from challenges c where c.match_id = m.id)
  and not exists (select 1 from daily d where d.match_id = m.id)
  and not exists (select 1 from ex_boosts x where x.match_id = m.id)
  and not exists (select 1 from ex_pred p where p.match_id = m.id);
select bump();
select coalesce(string_agg(league_name || ' ' || status || ' ' || n, ', '), 'nada') as quedan
from (select league_name, status, count(*) as n from matches where league_name ~* 'gamers ?club|betboom' group by 1, 2) q;
