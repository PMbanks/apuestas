-- 068 (03-11). TRATOS PUBLICOS. PM: "importante que en gambling addicts no hay trades privados, que se puedan ver todos".
-- Va despues de 020_mercado.sql (la unica definicion de mk_tratos y de mk_estado). Se puede ejecutar varias veces.
--
-- QUE CAMBIA
--   * Todos los jugadores pueden LEER todos los tratos (mk_tratos): quien propone, a quien, que piezas y V-Bucks da y pide, la nota
--     y como acabo (abierto, aceptado, rechazado o cancelado). Antes solo los veian los dos del trato.
--   * mk_estado (lo que pide la pantalla del Mercado) devuelve todos los tratos abiertos de todos y los 40 ultimos cerrados de todos,
--     no solo los tuyos. Tus tratos abiertos siguen saliendo siempre (son parte de "todos los abiertos").
--
-- QUE NO CAMBIA
--   * Solo los dos del trato pueden ACTUAR: mk_trato_aceptar y mk_trato_rechazar comprueban en la base que el trato es para ti
--     (t.para = auth.uid()), mk_trato_cancelar que es tuyo (t.de = auth.uid()). mk_trato_cierra no la puede llamar nadie de fuera.
--     Nadie puede escribir en mk_tratos directamente (solo hay politica de lectura). La prueba 068_prueba.sql lo comprueba.

-- ---------- leer: todos los jugadores ven todos los tratos ----------
drop policy if exists mk_tratos_read on mk_tratos;
create policy mk_tratos_read on mk_tratos for select to authenticated using (is_player());

-- ---------- lo que lee la pantalla: igual que en 020, salvo 'tratos' (ahora los de todos) ----------
create or replace function mk_estado() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or not is_player() then raise exception 'Tienes que entrar primero'; end if;
  perform mk_jackpot_limpia();
  return jsonb_build_object(
    'now', now(), 'me', me, 'saldo', mk_saldo(me),
    'tratos', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'de', t.de, 'para', t.para, 'da', mk_invs_j(t.da_inv), 'da_vb', t.da_vb,
                 'pide', mk_invs_j(t.pide_inv), 'pide_vb', t.pide_vb, 'nota', t.nota, 'status', t.status, 'at', t.created_at, 'done_at', t.done_at)
                 order by (t.status = 'abierto') desc, coalesce(t.done_at, t.created_at) desc), '[]'::jsonb)
               from mk_tratos t
               where t.status = 'abierto'
                  or t.id in (select z.id from mk_tratos z where z.status <> 'abierto' order by coalesce(z.done_at, z.created_at) desc limit 40)),
    'ventas', (select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'vendedor', v.vendedor, 'precio', v.precio, 'at', v.created_at, 'inv', (select mk_inv_j(i) from cs_inv i where i.id = v.inv_id))
                 order by v.created_at desc), '[]'::jsonb) from mk_ventas v where v.status = 'abierta'),
    'vendidas', (select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'vendedor', v.vendedor, 'comprador', v.comprador, 'precio', v.precio, 'at', v.closed_at,
                 'inv', (select mk_inv_j(i) from cs_inv i where i.id = v.inv_id)) order by v.closed_at desc), '[]'::jsonb)
                 from mk_ventas v where v.id in (select z.id from mk_ventas z where z.status = 'vendida' order by z.closed_at desc limit 8)),
    'contratos', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'player', c.player, 'rareza', c.rareza, 'at', c.created_at,
                 'salida', (select mk_inv_j(i) from cs_inv i where i.id = c.salida)) order by c.created_at desc), '[]'::jsonb)
                 from mk_contratos c where c.id in (select z.id from mk_contratos z order by z.created_at desc limit 8)),
    'jackpot', (select mk_jackpot_j(j) from mk_jackpot j where j.status = 'abierto' order by j.id desc limit 1),
    'ultimo', (select mk_jackpot_j(j) from mk_jackpot j where j.status = 'hecho' order by j.id desc limit 1),
    'equipados', cos_equipados()
  );
end $$;

revoke all on function mk_estado() from public, anon;
grant execute on function mk_estado() to authenticated;
