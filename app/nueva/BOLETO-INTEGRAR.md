# Boleto múltiple (boleto.js, 30-10)

Tocar una cuota en la lista de Partidos o en la ficha la mete en el boleto (dorado) sin abrir la ficha; otra vez la quita;
otra del mismo partido la cambia. Boleto flotante: escritorio abajo a la derecha (plegado, se despliega; un clic fuera lo
pliega); móvil barra encima de la barra de abajo que abre una hoja. Importe por elección, "mismo importe para todas"
(10, 50, 100, 1/2, Todo: 1/2 y Todo reparten el saldo), totales, avisos (falta saldo, tope de cuota mejorada, partido
empezado: sale solo). "Apostar" con dos toques llama a place_bet en serie, enseña cuáles entraron y el motivo de las que no,
y quita las que entraron (moneda que vuela de app.js + clic de sonidos.js por la clase .go). localStorage gm-boleto.
API: window.GM_BOLETO (mete, quita, vacia, lista, abre). No toca app.js ni la base.

## 1. index.html (app/nueva y app/), después de sonidos.js

```html
<script src="boleto.js?v=VERSION"></script>
```

app/boleto.js ya es copia de app/nueva/boleto.js (no usa rutas de imágenes: la moneda es .cn de app.css).

## 2. i18n.js: al principio de `const D = {`

```js
    // boleto multiple (boleto.js, 30-10)
    'Boleto': 'Bet slip', 'Vaciar': 'Clear', 'Mismo importe para todas': 'Same stake for all', 'Abrir el boleto': 'Open the bet slip', 'Ir al partido': 'Go to the match',
    'La mitad de tu saldo, repartida': 'Half your balance, split', 'Todo tu saldo, repartido': 'Your whole balance, split',
    'Total apostado': 'Total stake', 'Cobrarías si aciertas todas': 'Payout if all win', 'Cobrarías si aciertas': 'Payout if it wins',
    'para apostarlo todo': 'to place it all', 'Pon un importe en cada una': 'Put a stake on each pick',
    'Quita las que ya no tienen cuota': 'Remove the picks with no odds', 'Esa opción ya no tiene cuota': 'No odds for this pick any more',
    'Con cuota mejorada te quedan': 'With boosted odds you have', 'en este partido': 'left on this match',
    'ya ha empezado y sale del boleto': 'has started and leaves the slip', 'Ha entrado': 'Placed', 'No ha entrado': 'Not placed', 'No ha entrado ninguna': 'None placed',
    'Las que no han entrado siguen abajo con el motivo': 'The ones that did not go in stay below with the reason', 'Sin conexión: no ha entrado': 'No connection: not placed',
    'Toca una cuota para añadirla al boleto.': 'Tap any odds to add them to your slip.',
    'Este partido ya ha empezado: apuestas cerradas': 'This match has already started: betting closed', 'Esa opción no se puede apostar': 'That pick cannot be bet on',
    'Ese partido no existe': 'That match does not exist', 'Elige 1, X o 2': 'Pick 1, X or 2',
```

## 3. i18n.js: al principio de `const R = [`

```js
    // boleto multiple (boleto.js, 30-10)
    [/^Apostar las (\d+)$/, 'Bet all $1'], [/^Apostando (\d+) de (\d+)…$/, 'Placing $1 of $2…'], [/^Han entrado las (\d+)$/, 'All $1 placed'], [/^Han entrado (\d+) de (\d+)$/, '$1 of $2 placed'],
    [/^La cuota mejorada admite hasta ([\d.]+) por jugador en este partido y te quedan ([\d.]+)$/, 'Boosted odds allow up to $1 per player on this match and you have $2 left'],
```

## Probado

Playwright con la app real (pm), place_bet SIEMPRE interceptado (nunca se apostó), respuestas simuladas éxito, saldo
insuficiente y partido empezado: 1440x900 y 390x844 en español, 32 de 32 comprobaciones cada uno, sin errores de consola
(una llamada a la vez, cada llamada con partido, elección e importe del boleto, recarga conserva, caduca lo empezado,
cuota mejorada simulada con tope). Capturas: modelos/capturas/boleto-1440-es-*.png y boleto-390-es-*.png.

## Falta

- Pasada en inglés con capturas (el diccionario de arriba está escrito pero no se ha visto en pantalla).
- "Me sumo" (data-sumo) sigue con el deslizador de la ficha de antes; si se quiere, que use GM_BOLETO.mete.
