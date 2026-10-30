# Cajas, segunda tanda: 30 cajas de skins, cajas de Lujo y odds nuevas

Ficheros nuevos, ninguno toca lo que ya hay: `db/012_cajas_mas.sql`, `db/012b_cajas_datos.sql`, `db/012_prueba.sql`,
`sync/lujo-datos.mjs`, `sync/lujo-imagenes.mjs`, `app/img/lujo/` (47 fotos webp y `FUENTES.md`). Cambiado: `sync/cajas-datos.mjs`.
`cajas.js`, `cajas.css`, `app.js`, `app.css` e `i18n.js` no se han tocado.

## 1. Base (editor SQL de Supabase), en este orden

1. `db/009_tanda_ideas.sql` y `db/007_cajas.sql`, si no estaban ya.
2. `db/012_cajas_mas.sql`: columna `cat` en `cs_cases`, `cs_roll` con las odds nuevas, `cs_cases()` y `cs_case()` con `cat`, `cs_sell` sin la palabra "skins".
3. `db/012b_cajas_datos.sql`: 30 cajas de CS2, 5 de Lujo (1 euro = 1 V-Buck) y 1.158 objetos. Sustituye a `007b_cajas_datos.sql`: si 007b ya estaba cargado se pone al dia
   encima (mismos ids). **No cargues 007b despues de 012b**: te devolveria los precios con margen y apagaria las cajas nuevas.
4. `db/012_prueba.sql`: tiene que acabar en un error que dice **PRUEBA SUPERADA** (no guarda nada).

Las fotos de Lujo se guardan en la base como URL absoluta `https://pmbanks.github.io/apuestas/img/lujo/xxx.webp`. Funcionan desde `app/` y desde `app/nueva/`
(`src()` de cajas.js deja pasar lo que empieza por `http`), pero **solo cuando `app/img/lujo/` este publicado**: en local, sin publicar, saldran rotas
(el `onerror` de `pic()` las oculta).

## 2. Lo que ya hace tu `cajas.js` y lo que falta

Ya sirve sin tocar: la categoria (`catDe()` lee `cat`; `cs_cases()` la devuelve como `'skins'` o `'lujo'`), las dos pestañas Skins y Lujo en Abrir y en
la batalla nueva, y los objetos sin desgaste (`esLujo()` por el id, que empieza por `lujo-`; ademas llegan con `wear: null`, `float: null` y `st: false`).

Falta, en `cajas.js`:

1. **Linea 15, `PESO`**: ponlo en `{ mil: 7570, res: 1800, cla: 450, cov: 130, esp: 50 }`. Si no, la pantalla sigue diciendo 79,92 %, 15,98 %, 3,2 %, 0,64 %
   y 0,26 %, que ya no son las de `cs_roll`. Salen 75,7 %, 18 %, 4,5 %, 1,3 % y 0,5 % (con las cinco rarezas; si una caja no tiene alguna, se reparte entre las que tiene).
2. **Linea 18, `RELLENO`** (solo para la ruleta, lo que sale lo decide el servidor): si quieres que la ruleta se parezca a la verdad, `{ mil: 76, res: 18, cla: 4.5, cov: 1.3, esp: 0.5 }`.
3. **Linea 63, `msgErr`**: el texto dice "falta cargar db/007_cajas.sql y 007b_cajas_datos.sql". Mejor "007_cajas.sql, 012_cajas_mas.sql y 012b_cajas_datos.sql".
4. Comprobar los numeros grandes. Los objetos de Lujo valen de 15 (un Casio F-91W) a 250.000 (un Lamborghini) y las cajas van de 218 a 20.905;
   abrir 5 de Coches son 104.525. Mira que `N()` con puntos de miles cabe en el boton Abrir, en el precio de la caja, en el valor de cada objeto, en el saldo y en el total de una batalla.
5. **La foto de la caja de Lujo es la de su objeto mas caro** (el Patek en Relojes, el Lamborghini en Coches...), no una caja dibujada. Si quieres que parezca
   una caja, enmarcala con CSS (fondo del color de la rareza, borde, `object-fit: contain`). La clase `foto` que ya tienes (esquinas redondeadas) sirve para los objetos.

## 3. Como pintar los objetos sin desgaste

Cada objeto de Lujo llega igual que una skin: `{ id, name, phase: null, rarity, image, st: false, minf: null, maxf: null, weight: 100, price: [x,x,x,x,x,x,x,x,x,x] }`
(las 10 casillas de precio son iguales). En el inventario y en lo que sale de una caja: `wear: null`, `float: null`, `st: false`, `value` = el precio.

1. Nada de "Recien fabricado", "Sin desgaste" ni StatTrak: ni linea de desgaste ni float. Ya lo haces en `metaDe`.
2. `name` es solo el nombre ("Rolex Submariner"), sin ` | `: `partes()` devuelve un solo trozo, asi que no hay "arma" arriba y "skin" abajo.
   Nombre completo en grande y, si quieres una linea pequeña, la categoria ("Relojes").
3. Fotos reales rectangulares, de 512 px como mucho y de formas distintas (de 0,75 a 2 de ancho por alto), algunas con fondo blanco y otras con paisaje:
   `object-fit: contain` sobre un fondo claro o del color de la rareza, no `cover` (cortaria el coche o el reloj).
4. Los colores de rareza son los mismos (Grado militar azul ... Especial dorado). Las cajas de Lujo tienen las cinco, asi que la ruleta, la rejilla y la lista "lo que puede salir" funcionan igual.
   Ojo: `kCard` y `carta` pintan una estrella ★ en vez de la imagen para cualquier `rarity === 'esp'` (el misterio del cuchillo). Los `esp` de Lujo
   (Patek, Richard Mille, Lamborghini...) si traen foto: enseñala cuando `esLujo(it.id)`, o el mejor premio de la caja saldra como una estrella.
5. `tipico(it)` y `probW()` ya sirven: con `minf` nulo dan `[1,0,0,0,0]` y el precio de la casilla 0.
6. Texto: las cajas se llaman Zapatillas, Tecnología, Moda y joyas, Relojes y Coches (no llevan "Case"); y la venta ya no dice "skins" en el monedero ("3 objetos").

## 4. Que hay en cada caja

Probabilidades: 75,7 % grado militar, 18 % restringido, 4,5 % clasificado, 1,3 % encubierto, 0,5 % especial. Precio de la caja = valor medio de lo que sale (sin margen).
En Skins 1 euro = 20 V-Bucks; en Lujo 1 euro = 1 V-Buck (para que se puedan abrir con la paga de 1.000 por semana): el valor de cada objeto es su precio real aproximado (2026) en euros. Detalle de objetos y precios en `sync/lujo-datos.mjs`; autores y licencias de las fotos en `app/img/lujo/FUENTES.md`.

Cajas de Lujo: Zapatillas 218, Tecnología 513, Moda y joyas 1.863, Relojes 2.616, Coches 20.905.

Cajas de CS2: 30 (las 15 de antes mas Operation Broken Fang, CS20, Shattered Web, Prisma, Danger Zone, Horizon, Spectrum 2, Spectrum, Gamma 2, Gamma, Chroma 3,
Shadow, Chroma, Huntsman y Operation Bravo), de 24 V-Bucks (Kilowatt) a 783 (CS:GO Weapon Case). Mismo generador y mismos precios de Skinport.

## 5. Volver a generar

```
node sync/lujo-imagenes.mjs     # fotos nuevas (necesita ffmpeg; salta las que ya estan)
node sync/cajas-datos.mjs       # reescribe db/012b_cajas_datos.sql (precios al dia, cajas, lujo)
```

Si se cambian las odds, hay que cambiarlas en los DOS sitios: `pesos` en `cs_roll` (`012_cajas_mas.sql`) y `TIER_P` en `sync/cajas-datos.mjs`, y volver a generar 012b.
Si no, el precio de las cajas deja de ser su valor medio.
