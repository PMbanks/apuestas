-- Vigesimosexta parte (30-10). PM: "que se vean en All bets todas las bets, pero con paginas y tal".
-- Una pagina de las apuestas de todos (de todos los tiempos), mas recientes primero, con filtros por jugador, estado y deporte.
-- Las elecciones se esconden igual que en get_state (con "ocultas hasta empezar", la de los demas no se ve hasta que empieza).
-- Solo lectura. La app la usa si existe; si no, pagina en el navegador lo que ya trae get_state.
create or replace function bets_page(p_player uuid default null, p_status text default null, p_sport text default null,
                                     p_offset int default 0, p_limit int default 12) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  vis text := (select value #>> '{}' from settings where key = 'vis');
  lim int := least(greatest(coalesce(p_limit, 12), 1), 50);
  off int := greatest(coalesce(p_offset, 0), 0);
  st text := nullif(p_status, '');
  sp text := nullif(p_sport, '');
  total int; filas jsonb;
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  if st is not null and st not in ('open', 'live', 'won', 'lost', 'void', 'cashout') then raise exception 'Ese estado no existe'; end if;
  select count(*) into total from bets b join matches m on m.id = b.match_id
   where (p_player is null or b.player = p_player) and (sp is null or m.sport = sp)
     and (st is null or (st = 'live' and b.status = 'open' and m.status = 'live') or (st = 'open' and b.status = 'open' and m.status <> 'live') or (st not in ('open', 'live') and b.status = st));
  select coalesce(jsonb_agg(x.j order by x.created_at desc, x.id desc), '[]') into filas from (
    select b.id, b.created_at, jsonb_build_object(
      'id', b.id, 'player', b.player, 'match', b.match_id,
      'pick', case when vis = 'open' or b.player = me or m.starts_at <= now() or m.status <> 'scheduled' then b.pick end,
      'stake', b.stake, 'odds', b.odds, 'status', b.status, 'payout', b.payout, 'created', b.created_at, 'settled', b.settled_at) j
    from bets b join matches m on m.id = b.match_id
    where (p_player is null or b.player = p_player) and (sp is null or m.sport = sp)
      and (st is null or (st = 'live' and b.status = 'open' and m.status = 'live') or (st = 'open' and b.status = 'open' and m.status <> 'live') or (st not in ('open', 'live') and b.status = st))
    order by b.created_at desc, b.id desc offset off limit lim) x;
  return jsonb_build_object('total', total, 'rows', filas);
end $$;
revoke all on function bets_page(uuid, text, text, int, int) from public, anon;
grant execute on function bets_page(uuid, text, text, int, int) to authenticated;
