# Cajas, segunda tanda: 30 cajas de skins, 10 de Lujo y odds nuevas

Ficheros nuevos, ninguno toca lo que ya hay: `db/012_cajas_mas.sql`, `db/012b_cajas_datos.sql`, `db/012_prueba.sql`, `sync/lujo-datos.mjs`,
`sync/lujo-imagenes.mjs`, `sync/lujo-recorte.py`, `sync/lujo-cajas.py` y `app/img/lujo/` (66 fotos recortadas, 10 cajas en `cajas/` y `FUENTES.md`).
Cambiado: `sync/cajas-datos.mjs`. `cajas.js`, `cajas.css`, `app.js`, `app.css` e `i18n.js` no se han tocado.

## 1. Base (editor SQL de Supabase), en este orden

1. `db/009_tanda_ideas.sql` y `db/007_cajas.sql`, si no estaban ya.
2. `db/012_cajas_mas.sql`: columna `cat` en `cs_cases`, `cs_roll` con las odds nuevas, `cs_cases()` y `cs_case()` con `cat`, `cs_sell` sin la palabra "skins".
3. `db/012b_cajas_datos.sql`: 30 cajas de CS2, 10 de Lujo (1 euro = 1 V-Buck) y sus objetos. Sustituye a `007b_cajas_datos.sql`; si ya estaba cargado, se pone al dia encima
   (mismos ids). **No cargues 007b despues de 012b**: te devolveria los precios con margen y apagaria las cajas nuevas. Si el 012b anterior (5 cajas de Lujo) ya esta
   cargado, este lo actualiza: las cajas viejas conservan su id (`lujo-zapatillas`, `lujo-tecnologia`, `lujo-moda-joyas`, `lujo-relojes`, `lujo-coches`) y se les cambia nombre, imagen y precio;
   `lujo-rtx-4090` (ahora `lujo-rtx-3090`) y `lujo-apple-watch` (ahora `lujo-airpods-max`) salen de las cajas pero sus filas siguen en la base por si alguien las tiene en el inventario.
4. `db/012_prueba.sql`: tiene que acabar en un error que dice **PRUEBA SUPERADA** (no guarda nada).

Las imagenes se guardan en la base como URL absoluta `https://pmbanks.github.io/apuestas/img/lujo/...` (objetos) y `.../img/lujo/cajas/...` (cajas). Funcionan desde `app/` y desde
`app/nueva/` (`src()` deja pasar lo que empieza por `http`), pero **solo cuando `app/img/lujo/` este publicado**.

## 2. Lo que ya hace tu `cajas.js` y lo que falta

Ya sirve sin tocar: la categoria (`catDe()` lee `cat`), las pestañas Skins y Lujo, y los objetos sin desgaste (`esLujo()` por el id, que empieza por `lujo`; llegan con `wear: null`, `float: null`, `st: false`).

Falta, en `cajas.js`:

1. **Linea 15, `PESO`**: `{ mil: 7570, res: 1800, cla: 450, cov: 130, esp: 50 }`. Si no, la pantalla sigue diciendo 79,92 %, 15,98 %, 3,2 %, 0,64 % y 0,26 %, que ya no son las de `cs_roll`.
   Salen 75,7 %, 18 %, 4,5 %, 1,3 % y 0,5 %. Todas las cajas de Lujo llevan las cinco rarezas.
2. **Linea 18, `RELLENO`** (solo la ruleta): `{ mil: 76, res: 18, cla: 4.5, cov: 1.3, esp: 0.5 }` si quieres que se parezca a la verdad.
3. **Linea 63, `msgErr`**: el texto dice "007_cajas.sql y 007b_cajas_datos.sql"; ahora "007_cajas.sql, 012_cajas_mas.sql y 012b_cajas_datos.sql".
4. `kCard` y `carta` pintan una estrella ★ en vez de la imagen para cualquier `rarity === 'esp'`. Los `esp` de Lujo (Patek, Richard Mille, Lamborghini, Red October...) tienen foto recortada:
   enseñala cuando `esLujo(it.id)`, o el mejor premio de la caja saldra como una estrella.
5. Un mismo objeto de Lujo puede tener otra rareza en otra caja (el G-Shock es "restringido" en Relojes de calle y "grado militar" en Relojes de lujo). Como la rareza es del objeto, esos casos
   se guardan como un objeto aparte con el mismo nombre y foto: id `lujo-yeezy-350-cla`, `lujo-steam-deck-esp`... Para pintar, `esLujo()` y la foto funcionan igual; si quieres
   agrupar en el inventario por objeto, quita el sufijo `-mil|-res|-cla|-cov|-esp` del id.

## 3. Como pintar lo de Lujo

**Imagen de cada caja** (`cs_cases.image`): 640x480 (4:3 como las de CS2) con transparencia: el objeto estrella, grande y recortado, en medio, otros dos objetos de la caja a los lados, algo girados,
y un brillo del color de la categoria detras (oro relojes, verde zapatillas, azul tecnologia, morado moda, rojo motos y coches). Sin caja dibujada. La tarjeta de `cajas.css` pone el resto: fondo con el mismo
color (`--g`, sale de `GLOW` en cajas.js por id de caja; las de skins, dorado), nombre y el precio en una pastilla con la moneda. Las fotos de los objetos ya no llevan la clase `foto` (marco claro redondeado): son
recortes transparentes como las skins.

**Objetos**: webp con transparencia (como las skins de CS2), recortados y encuadrados sin bordes, el lado largo a 512 px, asi que todos tienen un tamaño aparente parecido pero no la misma
forma (un reloj es alto, un coche ancho). Misma orientacion por categoria: coches y motos de lado mirando a la derecha (los que miraban a la izquierda estan volteados), zapatillas de lado con la
punta a la derecha, relojes de frente con la esfera recta, tech de frente. Nada de esquinas redondeadas ni `cover`: `object-fit: contain`, centrados sobre el color de la rareza.
Ni linea de desgaste, ni float, ni StatTrak. `name` es solo el nombre ("Rolex Submariner"), sin ` | `.
Ojo: la mayoria de los coches y motos son vistas de lado o tres cuartos (en Commons casi no hay perfiles puros libres), y varias zapatillas son un par. Todos miran al mismo lado.

Los numeros van de 15 V-Bucks (Casio F-91W) a 250.000 (Lamborghini); abrir 5 Coches a la vez son 104.525.

## 4. Las 10 cajas de Lujo

Probabilidades: 75,7 % grado militar, 18 % restringido, 4,5 % clasificado, 1,3 % encubierto, 0,5 % especial. Precio de la caja = valor medio de lo que sale (devolucion media del 100 %).

| Caja | V-Bucks | Objetos |
|---|---|---|
| Relojes de calle | 66 | 6: Casio F-91W y Swatch ... Tissot PRX |
| Zapatillas básicas | 113 | 7: Converse y Superstar ... Air Jordan 11 |
| Tech básica | 108 | 7: mando DualSense, Raspberry Pi, JBL ... Steam Deck |
| Moda de calle | 195 | 7: mochila Eastpak, Lacoste ... bolso Chanel |
| Zapatillas hype | 218 | 10: de Converse a las Yeezy Red October |
| Tecnología | 490 | 10: de AirPods a una Leica M11 |
| Motos y scooters | 1.716 | 7: patinete Xiaomi, Vespa ... Ducati Panigale V4 |
| Moda y joyas | 1.863 | 8: de unas Ray-Ban a un lingote de oro de 1 kg |
| Relojes de lujo | 2.616 | 10: de un Casio a Patek Nautilus y Richard Mille |
| Coches | 20.905 | 9: de un Fiat Panda a un Lamborghini |

Detalle en `sync/lujo-datos.mjs`; autores y licencias de las fotos en `app/img/lujo/FUENTES.md`. 1 euro = 20 V-Bucks en skins y 1 en Lujo.

## 5. Volver a generar

```
node sync/lujo-imagenes.mjs     # baja y recorta las fotos que falten (rembg) y redibuja las 10 cajas
node sync/cajas-datos.mjs       # reescribe db/012b_cajas_datos.sql (precios al dia, cajas, lujo)
```

`lujo-imagenes.mjs` necesita Python con `rembg` y `numpy` (`pip install "rembg[cpu]"`; el modelo se baja a `U2NET_HOME`) y ffmpeg no. Con `SOLO=lujo-id,...` rehace solo esos objetos;
con `FORZAR=1`, todos. Las fotos originales van a `ORIG` (por defecto `sync/.orig`, se puede borrar).

Si se cambian las odds, hay que cambiarlas en los DOS sitios: `pesos` en `cs_roll` (`012_cajas_mas.sql`) y `TIER_P` en `sync/cajas-datos.mjs`, y volver a generar 012b.
