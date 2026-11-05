-- Prueba de 085 (va despues de cargar 085). Lanza un error A PROPOSITO para que se deshaga todo: "PRUEBA SUPERADA" con el resumen.
-- Solo llama a funciones; no toca el ledger ni el dinero de nadie (lo unico que escribe, cs_giro_cache, se deshace con el error).
do $$
declare c record; a record; n int := 0; nk int := 0; resumen text := ''; cat_txt text;
  caja text; precio int; g record; i int; nt int := 4000; suma numeric := 0; suma2 numeric := 0; media numeric; sd numeric;
  n_oro int := 0; n_dia int := 0; n_oro_bueno int := 0; n_mal_lado int := 0; esperado record;
begin
  -- 1) cada caja activa: probabilidades en su sitio y devuelve lo mismo que el tope de 081 (base + 0,75 puntos)
  for c in select id, price from cs_cases where active order by id loop
    select * into a from cs_giro_ajuste(c.id);
    continue when a.nuevo is null;
    n := n + 1;
    if a.baja < 0 or a.baja > 1 then raise exception 'FALLO: baja de % fuera de 0..1: %', c.id, a.baja; end if;
    if a.p_oro < 0 or a.p_oro > cs_ajuste_n('giro_dorado_pct', 6) / 100 + 1e-9 then raise exception 'FALLO: dorado de % raro: %', c.id, a.p_oro; end if;
    if a.p_dia < 0 or a.p_dia > cs_ajuste_n('giro_diamante_max', 1) / 100 + 1e-9 then raise exception 'FALLO: diamante de % raro: %', c.id, a.p_dia; end if;
    if a.sube <> 0.5 then raise exception 'FALLO: el dorado de % no es mitad y mitad: %', c.id, a.sube; end if;
    if a.nuevo > a.objetivo + 0.01 then raise exception 'FALLO: % devuelve % y el tope es %', c.id, round(a.nuevo, 2), round(a.objetivo, 2); end if;
    if a.baja > 0 and a.baja < 1 and abs(a.nuevo - a.objetivo) > 0.01 then raise exception 'FALLO: % no cuadra: % y deberia %', c.id, a.nuevo, a.objetivo; end if;
    if a.p_oro < cs_ajuste_n('giro_dorado_pct', 6) / 100 - 1e-9 then nk := nk + 1; end if;
  end loop;
  select string_agg(format('%s: devuelve %s %% (antes %s %% sin tickets), lo normal sale de lo malo el %s %% de las veces', x.cat, x.dev, x.sin, x.baja), '; ')
    into cat_txt from (
      select cc.cat, round(avg(100 * aa.nuevo / cc.price), 1) as dev, round(avg(100 * aa.base / cc.price), 1) as sin, round(avg(100 * aa.baja), 1) as baja
      from cs_cases cc cross join lateral cs_giro_ajuste(cc.id) aa where cc.active and aa.nuevo is not null group by cc.cat order by cc.cat) x;
  resumen := format('%s cajas cuadran; en %s los tickets salen menos (ni con todo lo normal desde lo malo llegaba). %s. ', n, nk, cat_txt);

  -- 2) muchas aperturas de verdad (cs_tirada) en la caja de CS2 mas barata: lo que sale de media y los tickets
  select id, price into caja, precio from cs_cases where active and cat = 'skins' order by price, id limit 1;
  select * into esperado from cs_giro_ajuste(caja);
  for i in 1 .. nt loop
    select * into g from cs_tirada(caja);
    suma := suma + g.o_value; suma2 := suma2 + g.o_value::numeric * g.o_value;
    if g.o_bonus is not null then
      if g.o_bonus->>'tipo' = 'oro' then
        n_oro := n_oro + 1;
        if g.o_bonus->>'lado' = 'bueno' then n_oro_bueno := n_oro_bueno + 1; elsif g.o_bonus->>'lado' <> 'malo' then n_mal_lado := n_mal_lado + 1; end if;
      elsif g.o_bonus->>'tipo' = 'diamante' then
        n_dia := n_dia + 1;
        if g.o_bonus->>'lado' <> 'bueno' then n_mal_lado := n_mal_lado + 1; end if;
      end if;
    end if;
  end loop;
  media := suma / nt; sd := sqrt(greatest(0, suma2 / nt - media * media));
  if n_mal_lado > 0 then raise exception 'FALLO: % tickets con un lado que no toca', n_mal_lado; end if;
  if abs(n_oro - nt * esperado.p_oro) > 4 * sqrt(nt * esperado.p_oro * (1 - esperado.p_oro)) + 1 then
    raise exception 'FALLO: % dorados en % aperturas, se esperaban %', n_oro, nt, round(nt * esperado.p_oro); end if;
  if n_oro > 20 and abs(n_oro_bueno - n_oro * 0.5) > 4 * sqrt(n_oro * 0.25) + 1 then
    raise exception 'FALLO: de % dorados % fueron buenos (deberia ser la mitad)', n_oro, n_oro_bueno; end if;
  if abs(media - esperado.nuevo) > 4 * sd / sqrt(nt) + 1 then
    raise exception 'FALLO: en % sale de media % y deberia %', caja, round(media, 2), round(esperado.nuevo, 2); end if;
  resumen := resumen || format('En %s (%s), %s aperturas: de media %s (esperado %s, el %s %% de la caja), %s dorados (%s buenos), %s diamantes.',
    caja, precio, nt, round(media, 1), round(esperado.nuevo, 1), round(100 * esperado.nuevo / precio, 1), n_oro, n_oro_bueno, n_dia);
  raise exception 'PRUEBA SUPERADA (no se ha guardado nada). %', resumen;
end $$;
