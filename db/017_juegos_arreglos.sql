-- Decimoseptima parte (30-10): arreglos de Juegos. Se carga DESPUES de 016.
-- 1) PM quiere Cara o cruz, Crash y Blackjack (016 cerraba los dos primeros): se vuelven a abrir.
--    Ruleta y plinko siguen cerrados (016 los revoco y aqui no se tocan).
grant execute on function moneda_crear(int, uuid, text), moneda_aceptar(bigint), crash_apostar(int, numeric), crash_retirar() to authenticated;

-- 2) crash_estado ahora devuelve las ultimas 20 rondas con lo que hizo cada uno ('rondas'); 'historial' pasa a 20 puntos.
create or replace function crash_estado() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := jg_yo(); r jg_crash;
begin
  select * into r from jg_crash order by id desc limit 1;
  if r.id is not null and r.estado = 'abierta' then
    perform crash_cerrar(r.id);
    select * into r from jg_crash where id = r.id;
  end if;
  return jsonb_build_object(
    'now', jg_ahora(), 'k', 0.06,
    'ronda', case when r.id is null then null else jsonb_build_object('id', r.id, 'arranca', r.arranca, 'estado', r.estado, 'punto', r.punto, 'fin_at', r.fin_at) end,
    'apuestas', (select coalesce(jsonb_agg(jsonb_build_object('player', a.player, 'stake', a.stake, 'estado', a.estado, 'retiro', a.retiro, 'pago', a.pago,
                   'auto', case when a.player = me then a.auto end) order by a.creada), '[]'::jsonb)
                 from jg_crash_apuestas a where a.ronda = r.id),
    'historial', (select coalesce(jsonb_agg(h.punto order by h.id desc), '[]'::jsonb)
                  from (select id, punto from jg_crash where estado = 'fin' order by id desc limit 20) h),
    'rondas', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'punto', c.punto,
                   'gente', (select coalesce(jsonb_agg(jsonb_build_object('player', a.player, 'stake', a.stake, 'estado', a.estado, 'retiro', a.retiro, 'pago', a.pago) order by a.creada), '[]'::jsonb)
                             from jg_crash_apuestas a where a.ronda = c.id)) order by c.id desc), '[]'::jsonb)
               from (select id, punto from jg_crash where estado = 'fin' order by id desc limit 20) c),
    'saldo', jg_saldo(me));
end $$;
revoke all on function crash_estado() from public, anon;
grant execute on function crash_estado() to authenticated;
