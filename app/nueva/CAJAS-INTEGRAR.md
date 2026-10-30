# Enganchar la pantalla Cajas

Ficheros nuevos: `cajas.js` y `cajas.css` (esta carpeta), `db/007_cajas.sql`, `db/007b_cajas_datos.sql`,
`db/007_prueba.sql` y `sync/cajas-datos.mjs`. No tocan nada de lo que ya hay.

## 1. Base (editor SQL de Supabase), en este orden

1. `db/009_tanda_ideas.sql` (abre el check de `ledger.kind`): **antes que 007**, o los movimientos `caja`, `venta`
   y `batalla` no entran en el monedero.
2. `db/007_cajas.sql`: tablas, permisos y funciones.
3. `db/007b_cajas_datos.sql`: 15 cajas, 667 skins y sus precios.
4. Si se quiere, `db/007_prueba.sql`: tiene que acabar en un error que dice **PRUEBA SUPERADA** (no guarda nada).

## 2. `index.html`

Debajo de `<link rel="stylesheet" href="app.css?...">`:

```html
<link rel="stylesheet" href="cajas.css?v=202610301200">
```

Encima de `<script src="app.js?...">`:

```html
<script src="cajas.js?v=202610301200"></script>
```

## 3. `app.js` (cinco cambios)

**a)** En `const KIND = { ... }` añade:

```js
caja: 'Caja de CS2', venta: 'Venta de skin', batalla: 'Batalla de cajas',
```

**b)** En `const SCREENS = { ... }`, una entrada nueva (donde quieras que salga en el menú; en las pruebas iba detrás de `liga`):

```js
  cajas: ['Cajas', 'Abre cajas de CS2, guarda skins y juega batallas', '<path d="M3.8 8.2 12 4.2l8.2 4v7.6L12 19.8l-8.2-4z"/><path d="M3.8 8.2 12 12.2l8.2-4M12 12.2v7.6M7.9 6.2l8.2 4"/>'],
```

**c)** La línea de `R`:

```js
const R = { partidos, apuestas, colegas, liga, chat, monedero, perfil, cajas: () => (window.GM_CAJAS ? GM_CAJAS.html() : '') };
```

**d)** Justo debajo de esa línea:

```js
const cajasCtx = () => ({ db, me: ME, jugadores: F.map((f) => ({ id: f.uid, n: f.n, color: f.id, ini: f.ini, photo: !!f.photo })), saldo: me().s, toast, refresh });
```

**e)** En `render()`, justo **debajo** de `vw.innerHTML = R[S.scr](); vw.dataset.vista = S.scr;` (y antes del `if (cambia)`):

```js
  if (S.scr === 'cajas' && window.GM_CAJAS) GM_CAJAS.montar(vw, cajasCtx(), cambia);
```

Tiene que ir ahí: la pantalla es siempre el mismo nodo y `montar` lo vuelve a colocar en cuanto la app repinta,
así la ruleta no se corta cuando llega el pulso o el repintado de cada minuto. `#cajas` en la dirección también funciona.

En el móvil caben las 7 entradas abajo (probado a 390 px).

## 4. Inglés (para `i18n.js`, si quieres)

En el diccionario `D`:

```js
'Abrir': 'Open', 'Inventario': 'Inventory', 'Batallas': 'Battles', 'Todas las cajas': 'All cases', 'Cargando lo que trae…': 'Loading contents…',
'Especial': 'Special', 'Encubierto': 'Covert', 'Clasificado': 'Classified', 'Restringido': 'Restricted', 'Grado militar': 'Mil-Spec',
'Cuántas': 'How many', 'Rápido': 'Fast', 'Sin saldo': 'No balance', 'Abrir por': 'Open for', 'Otra por': 'Again for', 'Vender todo por': 'Sell all for',
'Recién fabricado': 'Factory New', 'Casi nuevo': 'Minimal Wear', 'Algo desgastado': 'Field-Tested', 'Bastante desgastado': 'Well-Worn', 'Deplorable': 'Battle-Scarred', 'Sin desgaste': 'No wear',
'Vender': 'Sell', 'Vendida': 'Sold', 'Volver a la caja': 'Back to the case', 'Lo que trae': 'Contents', '★ Objeto especial': '★ Rare special item', 'Lo último que ha salido': 'Latest drops',
'Tu inventario': 'Your inventory', 'Su inventario': 'Inventory', '1 skin': '1 skin', 'Toca una skin para elegirla': 'Tap a skin to select it', 'Quitar': 'Clear', 'Vender por': 'Sell for',
'Aún no tienes skins. Abre una caja o gana una batalla.': 'No skins yet. Open a case or win a battle.', 'Todavía no tiene skins.': 'No skins yet.',
'Cada uno abre las mismas cajas. El lado que saque más valor se lleva todas las skins.': 'Everyone opens the same cases. The side with the most value takes every skin.',
'Crear batalla': 'Create battle', 'Abiertas': 'Open', 'Terminadas': 'Finished', 'Ninguna abierta ahora mismo.': 'None open right now.', 'Unirme': 'Join', 'Unirme aquí': 'Join here',
'Salir': 'Leave', 'Ver': 'Watch', 'Ver el resultado': 'See the result', 'Ver otra vez': 'Watch again', 'Saltar': 'Skip', 'valor sacado': 'value unboxed', 'por cabeza': 'each', 'a': 'to',
'Nueva batalla': 'New battle', 'Toca una caja para añadir una ronda': 'Tap a case to add a round', 'Aún sin cajas. Hasta 10 rondas.': 'No cases yet. Up to 10 rounds.',
'Crear por': 'Create for', 'Cada jugador paga lo mismo al unirse.': 'Each player pays the same to join.', 'Libre': 'Free', 'Cargando batalla…': 'Loading battle…',
'Estás dentro': 'You are in', 'Batalla llena: se abren las cajas': 'Battle full: opening the cases', 'Batalla creada: falta que se unan': 'Battle created: waiting for players',
'No tienes saldo suficiente': 'Not enough balance', 'Caja de CS2': 'CS2 case', 'Venta de skin': 'Skin sale', 'Batalla de cajas': 'Case battle',
```

En las reglas `R`:

```js
[/^Otras (\d) por$/, 'Again ×$1 for'], [/^(\d+) skins$/, '$1 skins'], [/^Elegir las de menos de (\d+)$/, 'Select the ones under $1'],
[/^Tienes ([\d.]+)\. La paga del lunes llega sola\.$/, 'You have $1. The Monday payday arrives by itself.'],
[/^Batalla (1v1|2v2)$/, 'Battle $1'], [/^Ganan (.+) y (.+)$/, '$1 and $2 win'], [/^Gana (.+)$/, '$1 wins'],
[/^contra ([\d.]+) · se llevan? las (\d+) skins$/, 'against $1 · takes all $2 skins'],
[/^Esperando a 1 jugador\. Se abre sola al llenarse\.$/, 'Waiting for 1 player. It opens by itself when full.'],
[/^Esperando a (\d) jugadores\. Se abre sola al llenarse\.$/, 'Waiting for $1 players. It opens by itself when full.'],
[/^Vendidas? (\d* ?)por/, 'Sold $1for'], [/^Te devuelvo/, 'Refunded'],
[/ abre una batalla (1v1|2v2) de (\d+) cajas? por ([\d.]+)\. Únete en Cajas$/, ' opens a $1 battle of $2 cases for $3. Join in Cases'],
[/^Batalla (1v1|2v2) lista: (.+) contra (.+)\. Mírala en Cajas$/, '$1 battle ready: $2 vs $3. Watch it in Cases'],
```
