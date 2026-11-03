-- Prueba de 074 (cajas de lujo con nombre y arte propios), para el editor SQL de Supabase. Va despues de 074_cajas_nombres_propios.sql (y de 055, 055b y todo lo anterior).
-- Comprueba, en las 59 cajas de lujo (24 con su id de siempre y 35 lujo-ed-*): estan activas, los nombres son distintos entre si y distintos de los de db/055b, ninguna imagen es de /cajas/ed-
-- (la copiada de otra web), las 24 viejas usan su arte de siempre y las 35 nuevas el suyo (propia-*), y NO ha cambiado nada mas: el precio es el de 055b, cada caja suma 10.000.000 de tickets
-- y su lista de objetos con sus tickets da la misma huella (md5) que la de 055b. Despues abre 1 de cada una para ver que siguen funcionando.
-- Al final lanza un error A PROPOSITO para que se deshaga todo: no queda nada guardado. Si todo va bien dice "PRUEBA SUPERADA" con el resumen; si no, "FALLO".
do $$
declare
  jug uuid[] := array(select id from players order by created_at);
  r record; c cs_cases; x jsonb; n_ed int := 0; n_old int := 0; tot bigint; n_obj int; huella text; s0 int; resumen text := '';
begin
  if cardinality(jug) < 1 then raise exception 'FALLO: hace falta al menos un jugador'; end if;
  insert into ledger(player, amount, kind, note) select id, 500000000, 'ajuste', 'saldo de prueba' from players;
  perform pay_week();
  perform set_config('request.jwt.claims', jsonb_build_object('sub', jug[1], 'role', 'authenticated')::text, true);

  -- (id, nombre que le puso 055b, precio, numero de objetos, huella md5 de "objeto:tickets" ordenado)
  for r in select * from (values
  ('lujo-gaming','Imperio Gamer',90,28,'ffea5a09e3f06d0a3def54abe92226ee'),
  ('lujo-tecnologia-basica','Ofertas Black',4,22,'c4a19e18112bee5b7fe280e44e57e799'),
  ('lujo-tecnologia','Tecnología exclusiva 5 %',321,20,'37b3320a5a263929fb204e64565cc061'),
  ('lujo-tecnologia-2026','Fanáticos de Apple',76,23,'48072c12aa05f0f8d706d1c8c88817d6'),
  ('lujo-camaras','Santuario del obturador',79,50,'5a7f47052342cf85a386c7538f592634'),
  ('lujo-relojes-calle','Reloj asequible',8,35,'0174814b6035eae5b8b67114f8f9725d'),
  ('lujo-relojes-2026','Relojes 5 %',17,27,'68b2c7a17db9504b5e7e6da5b3460f6a'),
  ('lujo-relojes','Rolex 10 %',1497,23,'2eec77bb6e2d5525e610d854dc8d2eb7'),
  ('lujo-joyas','Adicto a las gemas',162,21,'53842442e4b58d43037b801a1ef0c458'),
  ('lujo-moda-joyas','Joyería de lujo',165,24,'f933f971569c0081e5c713ae576f3d66'),
  ('lujo-zapatillas-basicas','Nike contra Adidas',102,27,'357bf5f19d230da024d97713da283ad1'),
  ('lujo-zapatillas','Zapatillas grial',272,42,'5b76119621e25f80849db3f0e25fd7ee'),
  ('lujo-zapatillas-2026','Estilo sneakers',129,28,'577afb7efe3bd74412e3b5ca5a5e6142'),
  ('lujo-moda-calle','Stone Island',76,22,'8515cf5c86aa57354c9210291c9a8e8f'),
  ('lujo-streetwear','Palm Angels',423,50,'ab1b9c48d574a3460d3183ebdec28b84'),
  ('lujo-bolsos','Amante de los bolsos',124,26,'a8ec8ddd2e90e5a997684220eb1a4416'),
  ('lujo-perfumes','Perfume privado',21,22,'70e2d664db9c72945c4776df76c8cca2'),
  ('lujo-motos','Botín del motero',129,16,'18672d26a1ba75ddcbcd20eb11e90c2b'),
  ('lujo-coches','Coches 10 %',2626,31,'2755a0570509c9059e3b2cb7a826386b'),
  ('lujo-motor','Autobahn',435,35,'9191b736717286c6434f1cb7ee4b8215'),
  ('lujo-viajes','Viajes 10 %',52,21,'2fbc70703d2a02a710f0422db9212edc'),
  ('lujo-oro','Dúo precioso',142,28,'5f19720bc427dbd60e0479241ab47e6a'),
  ('lujo-cripto','Pack blockchain',10,14,'315240f781c5302e26221e92c6c75d07'),
  ('lujo-cartas','Alijo Pokémon',198,36,'c3a096d8b6bdabeb9ba27afef8efc255'),
  ('lujo-ed-xbox-vs-playstation','Xbox contra PlayStation',4,29,'cd8dae10229658506ca799c2f7a5e550'),
  ('lujo-ed-5-console-legends','Consolas legendarias 5 %',11,30,'55a99d73496b84a1fce9e263e29abb38'),
  ('lujo-ed-10-gaming','Gaming 10 %',7,27,'b64a215fce11f572d75ce6f42955f552'),
  ('lujo-ed-full-send-gaming','Gaming a tope',35,29,'a12879ee06650b67840347154ac4ab19'),
  ('lujo-ed-pro-setup','Equipo pro',157,50,'775d1a1ceba94cddc81a15209d8a2760'),
  ('lujo-ed-streamer-setup','Equipo de streamer',10,19,'2e44e279ce43df751e8546529d5798a7'),
  ('lujo-ed-only-mac','Solo Mac',309,11,'a797b13e77307f14b372acf70a9b3ed0'),
  ('lujo-ed-cinematic-view','Vista de cine',104,18,'1d276f7a9a4f8d6d2a528be8d9193a93'),
  ('lujo-ed-1-patek','Patek 1 %',363,32,'9eeefad4a4903373f95e9b79e2e16dc2'),
  ('lujo-ed-master-of-time','Maestro del tiempo',121,28,'2dff19747cd93e4f2eb0c05e12270bd5'),
  ('lujo-ed-rado-vs-tudor','Rado contra Tudor',947,31,'9788440084c0062e4f68dbb14358b06b'),
  ('lujo-ed-cartier-treasure','Tesoro Cartier',624,19,'5ab104b126c44e4dfe8b2d4c4392af14'),
  ('lujo-ed-pandora','Pandora',97,21,'b8f368385e6e8e2520e8e65d9922144b'),
  ('lujo-ed-1-versace','Versace 1 %',8,21,'bab358b716dd78e3bb546896e7eacc04'),
  ('lujo-ed-1-louis-vuitton','Louis Vuitton 1 %',43,21,'1329dcb4e6ddbe2cae5fa02a9e5fb364'),
  ('lujo-ed-chanel-prestige','Prestigio Chanel',427,20,'491f997d8e2826e18ba88603e563d0b5'),
  ('lujo-ed-birkin-addict','Adicto a los Birkin',1597,18,'9ea2ff8f8dedd4a42144008535b16f88'),
  ('lujo-ed-100-bags','Bolsos 100 %',352,35,'771e8a6db98cd88917cdbcb10e221d9c'),
  ('lujo-ed-nike','Nike',49,50,'4ed5618e377e26b677e79ddd09acbfc9'),
  ('lujo-ed-jordan','Jordan',108,50,'f243e341632aeead5980c6d79e2af1e6'),
  ('lujo-ed-street-soles','Suelas de calle',390,49,'abb33c9e27c8b0f044af3dc81f23018f'),
  ('lujo-ed-1-cars','Coches 1 %',537,35,'65886b5208341de6092ea927ff479eda'),
  ('lujo-ed-1-mercedes','Mercedes 1 %',822,21,'bb25155727593eaf68197437935927a6'),
  ('lujo-ed-german-engine','Motor alemán',1324,50,'652c39a49281f7176a6bb60df643ca1c'),
  ('lujo-ed-heritage-motors','Motores de herencia',1824,19,'d71b8e8f777d7509cdf5fab386de79c4'),
  ('lujo-ed-tesla','Tesla',636,14,'74df4e217b715db1c7a17fc081c132d1'),
  ('lujo-ed-american-driver','Conductor americano',71,21,'4d853f544f3894a70a56f73bdcddb005'),
  ('lujo-ed-yacht-club','Club náutico',979,27,'4c508ca4ba7dc5d8c6c5e60d7fcc6dbf'),
  ('lujo-ed-luxury-garage','Garaje de lujo',7047,31,'88a8db46397b2ee13407c5d5ea933fb1'),
  ('lujo-ed-gold-digger','Buscador de oro',121,35,'768c7167289a762cb04c949e7fda5a42'),
  ('lujo-ed-fortune-box','Caja de la fortuna',77,43,'29ba7697d089d197761c79eed75dabe0'),
  ('lujo-ed-poke-starter','Inicial Pokémon',8,45,'f8364bfbdbed796eb22f9a9b0fb0b621'),
  ('lujo-ed-5-pokemon','Pokémon 5 %',22,49,'1e72313dc328dd08fd5c7d5631ec9cd7'),
  ('lujo-ed-legendary-pulls','Sobres legendarios',353,50,'65968268d38ab5be11d4b520d3c103ef'),
  ('lujo-ed-panini','Panini',73,21,'8d7a152c8935125533eb94c145196e4f')
  ) as t(id, viejo, precio, objetos, md5) loop
    select * into c from cs_cases where cs_cases.id = r.id;
    if c.id is null then raise exception 'FALLO: no existe la caja %', r.id; end if;
    if not c.active or c.cat <> 'lujo' then raise exception 'FALLO: % no esta activa o ya no es de lujo', r.id; end if;
    if c.name is null or btrim(c.name) = '' or c.name ~ '[-–—]' then raise exception 'FALLO: el nombre de % esta vacio o lleva un guion (%)', r.id, c.name; end if;
    if c.name = r.viejo then raise exception 'FALLO: % sigue llamandose como en 055b (%)', r.id, c.name; end if;
    if c.image like '%/cajas/ed-%' then raise exception 'FALLO: % sigue con la imagen copiada (%)', r.id, c.image; end if;
    if r.id like 'lujo-ed-%' then
      n_ed := n_ed + 1;
      if c.image <> 'https://pmbanks.github.io/apuestas/img/lujo/cajas/propia-' || substr(r.id, 9) || '.webp' then raise exception 'FALLO: % no usa su arte propia-* (%)', r.id, c.image; end if;
    else
      n_old := n_old + 1;
      if c.image <> 'https://pmbanks.github.io/apuestas/img/lujo/cajas/' || substr(r.id, 6) || '.webp' then raise exception 'FALLO: % no vuelve a su arte de siempre (%)', r.id, c.image; end if;
    end if;
    -- lo que NO tenia que cambiar: precio, objetos y tickets
    if c.price <> r.precio then raise exception 'FALLO: el precio de % ha cambiado (% y era %)', r.id, c.price, r.precio; end if;
    select count(*), sum(tickets), md5(string_agg(item_id || ':' || tickets, ',' order by item_id collate "C"))
      into n_obj, tot, huella from cs_case_items where case_id = r.id;
    if tot <> 10000000 then raise exception 'FALLO: los tickets de % suman % y tienen que ser 10.000.000', r.id, tot; end if;
    -- 064 junto vouchers iguales dentro de una caja (menos objetos, mismos tickets): la huella de 055b ya no vale y solo se mira que no haya MAS
    if n_obj > r.objetos or n_obj < 1 then raise exception 'FALLO: % tiene % objetos y tenia %', r.id, n_obj, r.objetos; end if;
    -- sigue abriendose, cobra su precio y da un objeto de su caja
    s0 := (select coalesce(sum(amount), 0) from ledger where player = jug[1]);
    x := cs_open(c.id, 1)->'items'->0;
    if (select coalesce(sum(amount), 0) from ledger where player = jug[1]) <> s0 - c.price then raise exception 'FALLO: abrir % no ha cobrado su precio', r.id; end if;
    if not exists (select 1 from cs_case_items where case_id = c.id and item_id = x->>'item') then raise exception 'FALLO: % ha dado un objeto que no es de su caja', r.id; end if;
  end loop;
  if n_ed <> 35 or n_old <> 24 then raise exception 'FALLO: tienen que ser 35 lujo-ed-* y 24 viejas (hay % y %)', n_ed, n_old; end if;
  if (select count(distinct name) from cs_cases where id in (select id from cs_cases where cat = 'lujo' and active)) <> (select count(*) from cs_cases where cat = 'lujo' and active) then
    raise exception 'FALLO: dos cajas de lujo se llaman igual';
  end if;
  resumen := format('59 cajas (24 viejas con su arte de siempre y 35 con arte propia), nombres distintos entre si y de los de 055b, ninguna imagen /cajas/ed-, precios, objetos y tickets (10.000.000 cada una) sin cambios y las 59 se abren. %s cajas de lujo activas en total.', (select count(*) from cs_cases where cat = 'lujo' and active));
  raise exception 'PRUEBA SUPERADA (no se ha guardado nada). %', resumen;
end $$;
