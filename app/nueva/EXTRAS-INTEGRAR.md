# Integrar los extras: sonidos, stickers, cajas en directo y avisos de Discord

Ficheros nuevos en `app/nueva/`: `sonidos.js`, `stickers.js`, `cajas-vivo.js` (más `SONIDOS-EVENTOS.md`).
Cada uno pone su propio CSS al cargar (como `vivo.js`), así que **no hay hojas de estilo nuevas**.
Ninguno lleva rutas con `../`, así que a `app/` se copian tal cual.
Cambios pequeños en `cajas.js` (dos líneas con `// en directo`). No se ha tocado `app.js`, `app.css`, `i18n.js`, `index.html` ni `juegos.js`.

## 1. `index.html`

Detrás de `vivo.js`, al final del `body` (el número de `?v=` el de la tanda):

```html
<script src="sonidos.js?v=202610301200"></script>
<script src="stickers.js?v=202610301200"></script>
<script src="cajas-vivo.js?v=202610301200"></script>
```

Y como `cajas.js` ha cambiado, subir su `?v=` también.

Orden: da igual entre los tres, pero van **después** de `cajas.js` (cajas-vivo escucha lo que éste emite) y de `i18n.js`.

## 2. Diccionario de inglés (`i18n.js`)

En el objeto `D` (frases exactas), por ejemplo tras el bloque "chat y feed":

```js
    // extras 30-10: sonidos, stickers, cajas en directo
    'Silenciar sonidos': 'Mute sounds', 'Activar sonidos': 'Turn sounds on', 'Mandar un sticker': 'Send a sticker',
    'está abriendo': 'is opening', 'ha abierto': 'opened', 'Se lleva': 'Takes', 'Stickers': 'Stickers',
```

En la lista de reglas `R` (con número):

```js
    [/^(\d+) cosas$/, '$1 items'],
```

`Cerrar`, `Especial`, `Encubierto`, `Clasificado`, `Restringido` y `Grado militar` ya están. Los stickers son palabras
sueltas ("LOSER", "ALL IN"...) y no se traducen a propósito (`data-notr`).

## 3. Cómo se engancha cada cosa

- **Sonidos**: escucha `gm:sonido` y mira el DOM. Botón de silencio en la cabecera (`#top`), se vuelve a colgar solo.
  Eventos que deberían lanzar los otros módulos: `SONIDOS-EVENTOS.md`. Lo más útil: `perder` cuando una apuesta pasa a perdida.
- **Stickers**: botón junto a la caja del chat (`.ch-in`), manda un mensaje normal con cuerpo `[sticker:loser]` por el botón
  de enviar de la app (no hay nada nuevo en la base) y pinta así cualquier mensaje con ese formato. Los ids: `loser bot manco ez gg allin rip crack llora suerte`.
  Para añadir uno: una línea en `LISTA` de `stickers.js`.
  Ojo para quien toque el chat: `[data-msg]` lo usan también los juegos (un `<p>`); el chat es `.ch-in input[data-msg]`.
- **Cajas en directo**: `cajas.js` emite dos eventos (`gm:cajas-montada` con el cliente de Supabase de la app, y
  `gm:caja-abierta` al abrir) y `cajas-vivo.js` usa el canal Realtime `cajas-vivo` (broadcast, sin tocar la base). Solo
  pinta si estás en la pantalla Cajas; el que abre no ve su propia tarjeta.
  **Si no llega nada entre dos cuentas**, mirar en Supabase, Realtime, Settings, que "Allow public access" esté activado
  (los canales de broadcast públicos dependen de eso). Esta parte no se ha podido probar contra Supabase de verdad.

## 4. Discord

`DISCORD-WEBHOOK.md` (raíz del proyecto): lo que hace PM. Código en `sync/discord.mjs` y `sync/sync.mjs`; base en
`db/021_discord.sql` (cargarlo en el editor SQL antes de poner el secreto); secreto opcional en `.github/workflows/sync.yml`.
