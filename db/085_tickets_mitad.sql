-- 085 (PM 05-11). Los tickets cambian, y las cajas siguen devolviendo de media lo mismo que con 081.
-- PM: "el de oro tendria que ser 50% algo muy bueno 50% algo malo y el diamond ... como todo bueno y algo muy bueno";
--     "diamond ticket dejalo en 1 por ciento"; y para pagarlo, "opcion 1": lo normal de cada caja sale algo peor.
-- Va DESPUES de 081 (y de 083/084). Se puede ejecutar varias veces. Prueba: 085_prueba.sql (se deshace sola, "PRUEBA SUPERADA").
--
-- Cada apertura (cs_open, cs_open_owned y cada sitio de cada ronda de una batalla, todo por cs_tirada):
--   * con p_oro (giro_dorado_pct, hoy 6 %)  -> TICKET DORADO: vuelve a girar esa linea y sale, mitad y mitad (giro_dorado_sube_max = 50),
--                                             algo MUY BUENO (monton bueno: vale al menos giro_bueno_desde = 1,5 veces la caja) o algo MALO
--                                             (vale menos que la caja).
--   * con p_dia (giro_diamante_max, 1 %)    -> TICKET DE DIAMANTE: vuelve a girar solo con lo BUENO (al menos 1,5 veces la caja).
--   * si no, lo normal, pero con la probabilidad "baja" de esa caja sale del monton MALO (sin ticket, como una tirada normal).
--     "baja" se calcula caja a caja para que lo que devuelve la caja (nuevo) sea base + giro_extra_pts puntos (0,75), igual que el tope
--     de 081: nuevo = (1 - p_oro - p_dia) * ((1 - baja) * base + baja * e_malo) + p_oro * (e_bueno + e_malo) / 2 + p_dia * e_bueno.
--   * si ni con baja = 100 % llega (cajas de lujo donde lo bueno vale muchisimo), en esa caja los dos tickets salen menos (el mismo
--     factor para los dos, en cs_giro_info se ve lo que queda) y baja = 100 %.
-- Para no recalcular todo en cada apertura (cs_ev de cada objeto), cs_giro_ajuste_c guarda el calculo de cada caja 10 minutos
-- (cs_giro_cache) y lo rehace si cambian los ajustes. cs_inv.bonus igual que en 081: {"tipo","lado","desde","hasta"};
-- el Dorado ahora lleva lado "malo" o "bueno" con desde 0 y hasta null (la tira de la vuelta pasa por todo lo de la caja).

insert into settings(key, value) values ('giro_dorado_sube_max', '50') on conflict (key) do update set value = excluded.value;
insert into settings(key, value) values ('giro_diamante_max', '1') on conflict (key) do update set value = excluded.value;

create table if not exists cs_giro_cache (
  case_id text primary key,
  firma text not null,
  hecho timestamptz not null default clock_timestamp(),
  datos jsonb not null
);
alter table cs_giro_cache enable row level security;   -- sin politicas: solo lo tocan estas funciones (security definer)

-- ---------- las probabilidades de los tickets y de "baja" en una caja ----------
drop function if exists cs_giro_ajuste(text);
create or replace function cs_giro_ajuste(p_case text,
  out precio int, out base numeric, out e_malo numeric, out e_medio numeric, out e_bueno numeric,
  out p_oro numeric, out sube numeric, out p_dia numeric, out nuevo numeric, out desde_bueno int, out hasta_medio int,
  out baja numeric, out objetivo numeric)
language plpgsql stable security definer set search_path = public as $$
declare p0_oro numeric; p0_dia numeric; g numeric; tk numeric; pp numeric; k numeric;
begin
  select c.price into precio from cs_cases c where c.id = p_case;
  select sum(o.q * o.ev) / nullif(sum(o.q), 0) into base from cs_giro_objetos(p_case) o;
  select sum(m.q * m.ev) filter (where m.monton = 'malo') / nullif(sum(m.q) filter (where m.monton = 'malo'), 0),
         sum(m.q * m.ev) filter (where m.monton = 'medio') / nullif(sum(m.q) filter (where m.monton = 'medio'), 0),
         sum(m.q * m.ev) filter (where m.monton = 'bueno') / nullif(sum(m.q) filter (where m.monton = 'bueno'), 0)
    into e_malo, e_medio, e_bueno from cs_giro_montones(p_case) m;
  desde_bueno := ceil(precio * cs_ajuste_n('giro_bueno_desde', 1.5))::int;
  hasta_medio := floor(precio * cs_ajuste_n('giro_medio_tope', 3))::int;
  sube := greatest(0, least(100, cs_ajuste_n('giro_dorado_sube_max', 50))) / 100;
  p0_oro := greatest(0, least(100, cs_ajuste_n('giro_dorado_pct', 6))) / 100;
  p0_dia := greatest(0, least(100, cs_ajuste_n('giro_diamante_max', 1))) / 100;
  if p0_oro + p0_dia > 1 then p0_dia := greatest(0, 1 - p0_oro); end if;
  if base is null then p_oro := 0; p_dia := 0; baja := 0; nuevo := null; objetivo := null; return; end if;
  objetivo := base + greatest(0, precio * cs_ajuste_n('giro_extra_pts', 0.75) / 100);
  g := sube * e_bueno + (1 - sube) * e_malo;           -- lo que vale de media lo que da el Dorado
  p_oro := p0_oro; p_dia := p0_dia; pp := p_oro + p_dia;
  tk := p_oro * g + p_dia * e_bueno;                    -- lo que aportan los tickets
  if base > e_malo and pp < 1 then
    baja := ((1 - pp) * base + tk - objetivo) / ((1 - pp) * (base - e_malo));
  else
    baja := 0;
  end if;
  if baja <= 0 then
    baja := 0;
  elsif baja > 1 then
    -- ni con todo lo normal desde lo malo llega: los dos tickets salen menos en esta caja
    baja := 1;
    k := case when tk - pp * e_malo > 0 then (objetivo - e_malo) / (tk - pp * e_malo) else 0 end;
    k := greatest(0, least(1, k));
    p_oro := p_oro * k; p_dia := p_dia * k;
  end if;
  nuevo := (1 - p_oro - p_dia) * ((1 - baja) * base + baja * e_malo) + p_oro * g + p_dia * e_bueno;
end $$;

-- ---------- lo mismo, guardado 10 minutos por caja (se rehace si cambia algun ajuste giro_*) ----------
create or replace function cs_giro_ajuste_c(p_case text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare f text; c cs_giro_cache; a record; j jsonb;
begin
  select coalesce(string_agg(s.key || '=' || (s.value #>> '{}'), ',' order by s.key), '') into f from settings s where s.key like 'giro\_%';
  select * into c from cs_giro_cache where case_id = p_case;
  if found and c.firma = f and c.hecho > clock_timestamp() - interval '10 minutes' then return c.datos; end if;
  select * into a from cs_giro_ajuste(p_case);
  j := jsonb_build_object('precio', a.precio, 'base', a.base, 'e_malo', a.e_malo, 'e_bueno', a.e_bueno, 'p_oro', a.p_oro, 'sube', a.sube,
    'p_dia', a.p_dia, 'baja', a.baja, 'nuevo', a.nuevo, 'objetivo', a.objetivo, 'desde_bueno', a.desde_bueno, 'hasta_medio', a.hasta_medio);
  insert into cs_giro_cache(case_id, firma, hecho, datos) values (p_case, f, clock_timestamp(), j)
    on conflict (case_id) do update set firma = excluded.firma, hecho = excluded.hecho, datos = excluded.datos;
  return j;
end $$;

-- ---------- un objeto de un monton, con las probabilidades relativas de la caja ----------
create or replace function cs_giro_saca(p_case text, p_lado text) returns text
language plpgsql volatile security definer set search_path = public as $$
declare x double precision := cs_rand(); r text;
begin
  select z.item into r from (
    select m.item, sum(m.q) over (order by m.item) as acum, sum(m.q) over () as tot from cs_giro_montones(p_case) m where m.monton = p_lado
  ) z where z.acum > x * z.tot order by z.acum limit 1;
  return r;
end $$;

-- ---------- una apertura: con ticket, normal desde lo malo, o lo de siempre ----------
create or replace function cs_tirada(p_case text,
  out o_item text, out o_wear smallint, out o_fl numeric, out o_st boolean, out o_value int, out o_bonus jsonb)
language plpgsql volatile security definer set search_path = public as $$
declare t numeric; a jsonb; tipo text; lado text; d record; p record;
begin
  o_bonus := null;
  a := cs_giro_ajuste_c(p_case);
  t := cs_rand();
  if a->>'nuevo' is not null and t < (a->>'p_oro')::numeric then
    tipo := 'oro'; lado := case when cs_rand() < (a->>'sube')::numeric then 'bueno' else 'malo' end;
  elsif a->>'nuevo' is not null and t < (a->>'p_oro')::numeric + (a->>'p_dia')::numeric then
    tipo := 'diamante'; lado := 'bueno';
  elsif a->>'nuevo' is not null and cs_rand() < (a->>'baja')::numeric then
    lado := 'malo';   -- tirada normal, pero de lo malo (asi se pagan los tickets): sin ticket
  end if;
  if lado is not null then o_item := cs_giro_saca(p_case, lado); end if;
  if o_item is null then   -- lo de siempre (o un monton vacio, que no deberia pasar)
    select * into d from cs_roll(p_case);
    o_item := d.o_item; o_wear := d.o_wear; o_fl := d.o_fl; o_st := d.o_st; o_value := d.o_value;
    return;
  end if;
  select * into p from cs_roll_pieza(o_item);
  o_wear := p.o_wear; o_fl := p.o_fl; o_st := p.o_st; o_value := p.o_value;
  if tipo is not null then
    o_bonus := jsonb_build_object('tipo', tipo, 'lado', lado,
      'desde', case when tipo = 'diamante' then (a->>'desde_bueno')::int else 0 end, 'hasta', null);
  end if;
end $$;

-- ---------- para la app: las probabilidades de los tickets en una caja ----------
create or replace function cs_giro_info(p_case text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare a jsonb;
begin
  if not is_player() then raise exception 'Tienes que entrar primero'; end if;
  if not exists (select 1 from cs_cases where id = p_case) then raise exception 'Esa caja no existe'; end if;
  a := cs_giro_ajuste_c(p_case);
  return jsonb_build_object('oro', round(coalesce((a->>'p_oro')::numeric, 0) * 100, 4), 'diamante', round(coalesce((a->>'p_dia')::numeric, 0) * 100, 4),
    'sube', round(coalesce((a->>'sube')::numeric, 0) * 100, 2), 'desde', (a->>'desde_bueno')::int, 'hasta', null,
    'baja', round(coalesce((a->>'baja')::numeric, 0) * 100, 2), 'mitad', true);
end $$;

revoke all on function cs_giro_ajuste(text), cs_giro_ajuste_c(text), cs_giro_saca(text, text), cs_tirada(text) from public, anon, authenticated;
revoke all on function cs_giro_info(text) from public, anon;
grant execute on function cs_giro_info(text) to authenticated;
