# Mercado: cómo engancharlo

Ficheros nuevos, ninguno toca lo que ya hay: `app/nueva/mercado.js`, `app/nueva/mercado.css` (y su copia en `app/`, idéntica: no llevan rutas `../img/`),
`db/020_mercado.sql`, `db/020b_cosmeticos_datos.sql`, `db/020_prueba.sql`, `sync/cosmeticos-catalogo.mjs`, `sync/cosmeticos-datos.mjs`, `sync/cosmeticos-imagenes.mjs`
y `app/img/cosmeticos/` (16 fotos recortadas de objetos reales con `FUENTES.md`, y 30 SVG de marcos, fondos y cajas dibujados con código).
No se han tocado `app.js`, `app.css`, `i18n.js`, `index.html`, `cajas.js` ni `juegos.js`.

## 1. Base (editor SQL de Supabase), en este orden

1. Lo de las cajas ya cargado: `009`, `007_cajas.sql`, `012_cajas_mas.sql`, `012b_cajas_datos.sql`. (`017_cajas_regalo.sql` no hace falta para esto.)
2. `db/020_mercado.sql`: tablas, permisos y funciones. Cambia el check de `cs_inv.status` (nuevos estados `mkt`, `trd`, `jkp`, `con`) y el de `cs_cases.cat` (admite `cosmeticos`).
3. `db/020b_cosmeticos_datos.sql`: 41 piezas y 5 cajas de Cosméticos (de 29 a 149 V-Bucks).
4. Si se quiere, `db/020_prueba.sql`: tiene que acabar en un error que dice **PRUEBA SUPERADA** (no guarda nada, tarda ~1 min por las 3.000 rondas de jackpot).
   Ojo: `012_prueba.sql` se queja de las cajas de Cosméticos (solo admite `skins` y `lujo`); si se quiere pasar, hay que pasarla antes de cargar 020b.

## 2. `index.html`

Debajo de `<link rel="stylesheet" href="juegos.css?...">`:

```html
<link rel="stylesheet" href="mercado.css?v=202610301200">
```

Junto a `cajas.js` y `juegos.js` (antes de `app.js`):

```html
<script src="mercado.js?v=202610301200"></script>
```

## 3. `app.js` (cinco cambios)

**a)** En `const KIND = { ... }` añade:

```js
trato: 'Trato entre colegas', mercado: 'Mercado', jackpot: 'Jackpot',
```

**b)** En `const SCREENS = { ... }`, una entrada nueva (detrás de `juegos`):

```js
  mercado: ['Mercado', 'Intercambios, ventas, contratos, jackpot y tus cosméticos', '<path d="M4 9.5 5.6 5h12.8L20 9.5"/><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M5.5 12.5V19h13v-6.5"/><path d="M10 19v-4h4v4"/>'],
```

**c)** Junto a `const jgCtx = ...` y `const R = {...}`: el contexto y la pantalla (mismo contexto que Juegos):

```js
const mkCtx = () => ({ db, me: ME, meKey: MEK, jugadores: F.map((f) => ({ id: f.id, uuid: f.uid, n: f.n, color: f.id })), saldo: me().s, av, toast, refresh });
const mercado = () => (window.GM_MERCADO ? GM_MERCADO.html(mkCtx()) : '');
```

y en la línea de `R` añade `mercado`: `const R = { novedades, juegos, mercado, directo, ... };`

**d)** En `render()`, justo debajo de `if (S.scr === 'juegos' && window.GM_JUEGOS) GM_JUEGOS.montar(vw, jgCtx(), cambia);`:

```js
  if (S.scr === 'mercado' && window.GM_MERCADO) GM_MERCADO.montar(vw, mkCtx(), cambia);
```

**e)** En `render()`, justo debajo de `photoCss();` (los marcos y el fondo de todos; se llama en cada repintado, pero solo pide datos nuevos cada 10 s, y los que ya tiene los pinta al momento):

```js
  if (window.GM_MERCADO) GM_MERCADO.aplicaCosmeticos(mkCtx());
```

Con eso un marco puesto se ve en todos los `<span class="av pm|c1|c2|c3">` de la app (menú, cabecera, chat, perfil, ligas) sin tocar nada más.
Es una sola hoja `<style id="mk-cos">` con una regla por jugador (`.av.pm::after{...}`), y el fondo del que mira va detrás de toda la app (`html[data-mkf]`).

**f)** (Opcional) El fondo de cada colega queda como clase `.mk-bg-pm`, `.mk-bg-c1`... (solo existe si lo lleva puesto). Para verlo en su perfil, ponle esa clase a la cabecera del perfil:
`class="... mk-bg-${S.prof}"` (en la pieza que pinta el perfil de `fr(S.prof)`).

Si hay un pulso de Realtime, ya hace `refresh()` -> `render()` -> `montar()`, y `montar()` pide solo lo suyo: no hace falta suscribirse a nada.

## 4. `cajas.js` (para que las cajas de Cosméticos salgan en su pestaña y sus piezas se vean)

Sin esto las cajas con `cat = 'cosmeticos'` salen mezcladas en la pestaña **Skins de CS2** y los cosméticos de rareza especial se pintan como la estrella de un cuchillo.
Cuatro líneas (todas existen ya):

```js
const CATS = [['skins', 'Skins de CS2'], ['lujo', 'Lujo'], ['cosmeticos', 'Cosméticos']];
```

en `const S = {...}`: `cat: lee('cj-cat') === 'lujo' ? 'lujo' : 'skins'` pasa a

```js
cat: ['lujo', 'cosmeticos'].includes(lee('cj-cat')) ? lee('cj-cat') : 'skins'
```

```js
const esLujo = (id) => /^(lujo|cos)-/.test(String(id || ''));
const catDe = (c) => { const k = c && (c.cat || c.category || c.categoria); return k ? (/lujo/i.test(k) ? 'lujo' : /cosm/i.test(k) ? 'cosmeticos' : 'skins') : /^cos-/.test(String((c && c.id) || '')) ? 'cosmeticos' : esLujo(c && c.id) ? 'lujo' : 'skins' };
```

y en `case 'cat':` (el `switch` de los clics): `S.cat = v === 'lujo' ? 'lujo' : 'skins'` pasa a

```js
case 'cat': S.cat = ['lujo', 'cosmeticos'].includes(v) ? v : 'skins'; guarda('cj-cat', S.cat); return pinta();
```

`esLujo` es lo que decide que un objeto no lleva desgaste, que se cuenta como "objeto" y que (en rareza especial) se pinta con su imagen y no como una estrella.
La ruleta de la semana (`spin_wheel`) solo regala cajas de `skins`: las de Cosméticos no entran.

## 5. Lo que hay que saber

- `ctx` que usa el módulo: `db`, `me` (uuid), `meKey`, `jugadores [{id (pm/c1/c2/c3), uuid, n, color}]`, `saldo`, `av(key, cls)`, `toast(html)`, `refresh()`.
- Sin bucles de fondo: en reposo 0 temporizadores y 0 llamadas. Solo hay un temporizador de 1 s mientras se ve la cuenta atrás del jackpot, y una consulta cada 5 s mientras
  hay una ronda viva con esa pestaña a la vista; la rueda gira una sola vez con una transición de CSS. `GM_MERCADO.ocupado()` es true mientras gira.
- Nada cierra un jackpot solo (no hay cron): la ronda se cierra y se reparte la primera vez que alguien la mira después de la hora (`mk_estado`, `mk_jackpot_cerrar` o `mk_jackpot_entrar`).
  Con uno viéndolo, el navegador lo pide al llegar el 0:00. Una ronda con un solo jugador que lleva un día se cancela y se devuelve.
- Todo lo que está "en el aire" (en un trato, en venta o en el jackpot) deja de salir en el inventario de Cajas y no se puede vender con `cs_sell`: tiene otro `status` en `cs_inv`.
  Si algo se queda atrapado (un trato que nadie contesta), el que lo propuso lo cancela y vuelve todo; el jackpot, un día.
- Los V-Bucks que ofreces en un trato o metes en el jackpot se cobran al ponerlos y se devuelven si no sale.
- `bote_neto` (el bote semanal) cuenta solo apuestas resueltas, así que los tratos y el mercado no lo tocan.
- `GM_MERCADO.estilos` expone `{ MARCOS, FONDOS }` y `GM_MERCADO.marcoCss(clave)` / `fondoCss(clave)` por si otra pantalla quiere pintar un marco o un fondo.
- Para cambiar el catálogo (más marcos, fondos u objetos): `sync/cosmeticos-catalogo.mjs` (datos) y el bloque `/*ESTILOS*/` de `mercado.js` (aspecto de cada marco y fondo);
  luego `node sync/cosmeticos-datos.mjs` regenera `db/020b_cosmeticos_datos.sql` y las miniaturas SVG, y `node sync/cosmeticos-imagenes.mjs` baja las fotos de objetos nuevos.

## 6. Inglés (`i18n.js`)

Las frases de `mercado.js` y los avisos de `db/020_mercado.sql` pasan por `GM_LANG.traduce`. Ya existen en el diccionario: Grado militar, Restringido, Clasificado, Encubierto,
Especial, los cinco desgastes, Cargando…, Todas, Todo, Quitar, Entrar, Cerrar, Tú, Aceptar, Ver N más.

**En `D`** (el diccionario de frases exactas):

```js
    // mercado (30-10)
    'Intercambios': 'Trades', 'Mercado': 'Market', 'Contratos': 'Contracts', 'Mis cosméticos': 'My cosmetics',
    'Proponer un trato': 'Propose a trade', 'Skins, marcos, fondos y objetos, y también V-Bucks. Lo que ofreces queda en depósito hasta que el otro responde.': 'Skins, frames, backgrounds and items, and V-Bucks too. What you offer is held in escrow until the other answers.',
    'Tú das': 'You give', 'Pides a tu colega': 'You ask your friend for', 'Elegir piezas': 'Pick items', 'Cambiar piezas': 'Change items', 'Nada de momento': 'Nothing yet', 'Nada': 'Nothing',
    'Un mensaje, si quieres': 'A message, if you like', 'Proponer trato': 'Propose trade', 'Te proponen': 'Offered to you', 'Tus propuestas': 'Your offers', 'Últimos tratos': 'Latest trades',
    'Aún no hay tratos. Elige a un colega y propón el primero.': 'No trades yet. Pick a friend and make the first offer.',
    'Das': 'You give', 'Te da': 'Gives you', 'Pides': 'You ask for', 'Te pide': 'Asks you for', 'Cancelar trato': 'Cancel trade', 'Rechazar': 'Decline', 'Aceptado': 'Accepted', 'Rechazado': 'Declined', 'Cancelado': 'Cancelled',
    'Pon algo a la venta por el precio que quieras. El primero que lo compre se lo lleva y tú cobras al momento. Puedes retirarlo cuando quieras.': 'Put something up for sale at any price. The first to buy it takes it and you get paid at once. You can take it back any time.',
    'Poner algo a la venta': 'Put something up for sale', 'Retirar de la venta': 'Take off sale', 'A la venta': 'For sale', 'Lo tuyo a la venta': 'Your items for sale', 'Vendido hace poco': 'Sold recently',
    'Ahora mismo no hay nada a la venta.': 'Nothing is for sale right now.', 'Comprar': 'Buy', 'Qué pones a la venta': 'What are you selling', 'Poner a la venta': 'Put up for sale',
    'Mete 10 piezas de la misma rareza y sale 1 de la rareza siguiente, al azar y de las mismas cajas. No se mezclan skins, lujo y cosméticos. Casi siempre sale algo que vale menos que lo que metes: a veces sale algo que vale mucho más.': 'Put in 10 items of the same rarity and 1 of the next rarity comes out, at random and from the same boxes. Skins, luxury and cosmetics are not mixed. It usually comes out worth less than what you put in: sometimes it is worth a lot more.',
    'Elige 10 piezas de la misma rareza': 'Pick 10 items of the same rarity', 'Firmar contrato': 'Sign contract', 'Últimos contratos': 'Latest contracts', 'Tu contrato ha salido': 'Your contract came out', 'Valor': 'Value', 'Otro contrato': 'Another contract',
    'Cada uno mete V-Bucks o piezas por su valor. Cuando entra la segunda persona empiezan 60 segundos; al acabar el servidor saca un boleto: cuanto más has metido, más grande es tu trozo. Quien gana se lo lleva todo.': 'Everyone puts in V-Bucks or items at their value. When the second person joins, 60 seconds start; when they end the server draws a ticket: the more you put in, the bigger your slice. The winner takes everything.',
    'Falta alguien': 'Waiting for someone', 'Girando…': 'Spinning…', 'Sin ronda': 'No round', 'Tú metes': 'You put in', 'Y piezas, si quieres': 'And items, if you like', 'Retirar lo que metí': 'Take back what I put in', 'Nadie ha metido nada todavía.': 'Nobody has put anything in yet.',
    'Un marco para tu foto y un fondo para la app. Se ven en todo lo que pintan los demás. Consíguelos en Cajas, en Cosméticos, o cómpralos y cámbialos aquí.': 'A frame for your photo and a background for the app. Everyone sees them. Get them in Boxes, under Cosmetics, or buy and swap them here.',
    'Marco': 'Frame', 'Fondo': 'Background', 'Ninguno': 'None', 'Marcos': 'Frames', 'Fondos': 'Backgrounds', 'Objetos de colección': 'Collectibles', 'Ponerme': 'Wear it', 'Puesto · quitar': 'Worn · remove', 'Los colegas': 'The friends',
    'Aún no tienes ningún marco. Salen en la Caja Aros, la Caja Neón y la Caja Oro.': 'You have no frames yet. They come in the Aros, Neón and Oro boxes.',
    'Aún no tienes ningún fondo. Salen en la Caja Fondos y en la Caja Neón.': 'You have no backgrounds yet. They come in the Fondos and Neón boxes.',
    'Aún no tienes objetos. Salen en la Caja Calle y en la Caja Oro.': 'You have no items yet. They come in the Calle and Oro boxes.',
    'V-Bucks que das': 'V-Bucks you give', 'V-Bucks que pides': 'V-Bucks you ask for', 'Precio': 'Price', 'Lo que das': 'What you give', 'Piezas para el jackpot': 'Items for the jackpot', 'Listo': 'Done', 'No hay nada de esa rareza.': 'Nothing of that rarity.',
    'Trato hecho': 'Trade done', 'Trato rechazado': 'Trade declined', 'Trato cancelado: te devuelvo lo que ofrecías': 'Trade cancelled: what you offered is back', 'Retirado de la venta': 'Taken off sale',
    'Has retirado lo que metiste': 'You took back what you put in', 'La ronda acababa de cerrarse. Prueba otra vez': 'The round had just closed. Try again', 'Estás dentro del jackpot': 'You are in the jackpot',
    // avisos de la base (db/020_mercado.sql)
    'Un trato vacío no sirve': 'An empty trade is no use', 'Elige a un colega': 'Pick a friend', 'Esa cantidad de V-Bucks no vale': 'That V-Bucks amount is not valid', 'Ya tienes 6 tratos abiertos: cancela alguno': 'You already have 6 open trades: cancel one',
    'Lo que pides ya no lo tiene': 'They no longer have what you ask for', 'Alguna de tus piezas ya no está libre': 'One of your items is no longer free', 'Ese trato no es tuyo': 'That trade is not yours', 'Ese trato ya está cerrado': 'That trade is already closed',
    'Ese trato no es para ti': 'That trade is not for you', 'Lo que ofrecía ya no está disponible': 'What they offered is no longer available', 'Ya no tienes lo que te piden': 'You no longer have what they ask for',
    'No se ha podido entregar lo ofrecido': 'The offered items could not be handed over', 'No se ha podido entregar lo pedido': 'The requested items could not be handed over', 'Elige qué poner a la venta': 'Pick what to sell',
    'Pon un precio de 1 a 10.000.000': 'Set a price from 1 to 10,000,000', 'Ya tienes 12 cosas a la venta': 'You already have 12 things for sale', 'Eso no es tuyo o ya no está libre': 'That is not yours or no longer free', 'Eso no es tuyo': 'That is not yours',
    'Eso ya no está a la venta': 'That is no longer for sale', 'Eso no existe': 'That does not exist', 'Eso ya se ha vendido o se ha retirado': 'That was already sold or taken back', 'Eso es tuyo: puedes retirarlo': 'That is yours: you can take it back',
    'Esa pieza ya no está disponible': 'That item is no longer available', 'Un contrato son exactamente 10 piezas': 'A contract is exactly 10 items', 'Alguna de esas piezas no es tuya o ya no está libre': 'One of those items is not yours or no longer free',
    'Tienen que ser las 10 de la misma rareza': 'All 10 must be the same rarity', 'Con lo especial no hay nada mejor': 'There is nothing better than special', 'No se mezclan skins, lujo y cosméticos': 'Skins, luxury and cosmetics are not mixed',
    'No hay nada de la rareza siguiente para esas piezas': 'There is nothing of the next rarity for those items', 'Hay una pieza repetida': 'An item is repeated', 'Mete al menos 10 de valor': 'Put in at least 10 of value',
    'Alguna de esas piezas ya no está libre': 'One of those items is no longer free', 'No estás dentro': 'You are not in', 'Ya hay más gente: no se puede salir': 'Others have joined: you cannot leave', 'Eso no es tuyo, o no se puede llevar': 'That is not yours or cannot be worn',
    'Se lleva un marco o un fondo': 'You wear a frame or a background', 'Eso no es un marco': 'That is not a frame', 'Eso no es un fondo': 'That is not a background', 'Esa caja no existe': 'That box does not exist',
```

**En `R`** (las reglas). Van **al principio** de la lista, antes de las genéricas (hay una que cambia ` con ` por ` with ` y otras que tocarían estas frases):

```js
    // mercado (30-10)
    [/^Pides a (.+)$/, 'You ask $1 for'], [/^Lo que pides a (.+)$/, 'What you ask $1 for'], [/^(.+) te propone$/, '$1 offers you a trade'], [/^Le propones a (.+)$/, 'You offer $1 a trade'], [/^Tú a (.+)$/, 'You to $1'], [/^(.+) a ti$/, '$1 to you'],
    [/^Trato propuesto a (.+)$/, 'Trade offered to $1'], [/^A la venta por ([\d.]+)$/, 'For sale at $1'], [/^Comprado por ([\d.]+)$/, 'Bought for $1'],
    [/^(.+) compró$/, '$1 bought'], [/^a (.+) por$/, 'from $1 for'],
    [/^Todas · (\d+)$/, 'All · $1'], [/^(\d+) de (\d+) elegidas ·$/, '$1 of $2 selected ·'], [/^(\d+) de 10 ·$/, '$1 of 10 ·'], [/^· metes$/, '· you put in'], [/^(\d+) de 10 · (.+) →$/, (m, n, r) => `${n} of 10 · ${D[r] || r} →`],
    [/^10 más baratas · (.+?)(?: \((.+)\))?$/, (m, r, f) => `10 cheapest · ${D[r] || r}${f ? ' (' + ({ 'skins de CS2': 'CS2 skins', 'objetos de lujo': 'luxury items', 'cosméticos': 'cosmetics' }[f] || f) + ')' : ''}`],
    [/^Tú metes \(ya llevas ([\d.]+)\)$/, 'You put in (you already have $1)'], [/^Entrar con ([\d.]+)$/, 'Join with $1'], [/^(.+) gana$/, '$1 wins'], [/^(.+) se lleva ([\d.]+)$/, '$1 takes $2'],
    [/^· te llevas ([\d.]+)$/, '· you take $1'], [/^Jackpot · (.+) se lleva ([\d.]+)$/, 'Jackpot · $1 takes $2'], [/^Como mucho (\d+) piezas$/, 'At most $1 items'], [/^frente a lo que metiste$/, 'compared with what you put in'], [/^Eso no es un (marco|fondo)$/, 'That is not a $1'],
```

Para que el aviso de la cuenta atrás se vea bien, no hace falta nada más: `0:59` no lleva letras.

## 7. Qué se ha probado (y qué no)

Ver el informe de la sesión: la prueba SQL pasa entera en PGlite (`PRUEBA SUPERADA`); la pantalla se ha recorrido con Playwright contra esa misma base (dos jugadores a la vez);
no se ha probado contra Supabase de verdad, ni con dos conexiones a la vez peleando por lo mismo (los cerrojos `pg_advisory_xact_lock` y `for update` no se pueden probar en PGlite, que tiene una sola conexión).
