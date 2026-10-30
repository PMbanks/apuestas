# Cajas: frases nuevas para i18n.js (rediseño del 30-10)

Todas salen del cajas.js nuevo. En inglés las cajas son "boxes", no "cases".
Las horas de las batallas ("hace 2 h", "ayer", "28 oct") no pasan por el diccionario: las pinta `Intl` en el idioma elegido.

## En el diccionario `D`

```js
'Skins de CS2': 'CS2 skins', 'Lujo': 'Luxury', 'Más valiosas': 'Most valuable', 'Más nuevas': 'Newest', 'Por rareza': 'By rarity',
'por caja': 'per box', 'Has sacado': 'You got', 'Quitar filtros': 'Clear filters', 'Abrir una caja': 'Open a box', 'desde': 'from',
'Todavía no ha terminado ninguna.': 'None finished yet.', '1 ronda': '1 round', 'Rondas': 'Rounds', 'Cada jugador paga': 'Each player pays',
'El lado que saque más valor se lleva todas las skins.': 'The side with the most value takes every skin.',
'Páginas': 'Pages', 'Anterior': 'Previous', 'Siguiente': 'Next', 'Ganador': 'Winner',
'Toca una para elegirla': 'Tap one to select it', '1 objeto': '1 item', 'Cargando…': 'Loading…',
'Tus cajas': 'Your boxes', 'Cajas sin abrir': 'Unopened boxes', 'Tuyas sin abrir': 'Yours, unopened',
'Abrir la tuya': 'Open yours', 'Abrir una tuya': 'Open one of yours', 'Abrir otra tuya': 'Open another of yours',
// tanda de la tarde (30-10): abrir y cancelar
'Abriendo…': 'Opening…', '¿Cancelar la batalla?': 'Cancel the battle?', '¿Salir de la batalla?': 'Leave the battle?',
'Sí, cancelar': 'Yes, cancel', 'Sí, salir': 'Yes, leave',
```

## En las reglas `R`

```js
[/^(\d+) objetos$/, '$1 items'], [/^(\d+) rondas$/, '$1 rounds'], [/^(\d+) de 10$/, '$1 of 10'], [/^bote de ([\d.]+)$/, 'pot of $1'],
[/^Inventario de (.+)$/, "$1's inventory"], [/^Elegir las (\d+)$/, 'Select all $1'], [/^Ver los (\d+)$/, 'See all $1'], [/^Ver (\d+) más$/, 'Show $1 more'],
```

## Las que ya estaban y dicen "case" (cambiar a "box")

```js
'Todas las cajas': 'All boxes', 'Volver a la caja': 'Back to the box', 'Caja de CS2': 'CS2 box', 'Batalla de cajas': 'Box battle',
'Toca una caja para añadir una ronda': 'Tap a box to add a round', 'Aún sin cajas. Hasta 10 rondas.': 'No boxes yet. Up to 10 rounds.',
'Batalla llena: se abren las cajas': 'Battle full: opening the boxes',
'Aún no tienes skins. Abre una caja o gana una batalla.': 'No skins yet. Open a box or win a battle.',
'Cada uno abre las mismas cajas. El lado que saque más valor se lleva todas las skins.': 'Everyone opens the same boxes. The side with the most value takes every skin.',
```

Y en la regla de la batalla abierta: `' opens a $1 battle of $2 boxes for $3. Join in Boxes'`.
