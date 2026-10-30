# Marcador en directo (vivo.js): frases para i18n.js y la Edge Function de CS2

## La Edge Function `vivo` (CS2)

bo3.gg no tiene CORS, así que el navegador no puede leerla. `supabase/functions/vivo/index.ts` (Deno, sin dependencias) la lee desde el servidor,
la deja compacta y la devuelve con CORS abierto y caché de 15 s en memoria.

**Desplegar (panel de Supabase):** Edge Functions, Deploy a new function, nombre `vivo`, pegar `index.ts`. Mejor con "Verify JWT" **apagado**
(así el navegador la lee con un GET simple, sin preflight). Si se deja encendido también funciona: `vivo.js` reintenta con la clave pública de la app.

**URL que usa la app:** `https://cfxajqycetwdivmldrob.supabase.co/functions/v1/vivo?cs2=1`
(también `?slug=genone-vs-baks-esports-30-10-2026` para un partido concreto de bo3.gg).

**Probarla:** abrir esa URL en el navegador. Tiene que salir `{"ok":true,"matches":[...]}` con los partidos de CS2 en directo, cada uno con
`a`, `b` (nombre, alias, escudo, mapas ganados) y `maps` (nombre, `st` = `fin` / `live` / `pend`, rondas de cada equipo y las rondas una a una).
Si está en `?cs2=1` y no hay CS2 en directo sale `"matches":[]`. Mientras no esté desplegada, `vivo.js` no enseña nada de CS2 (reintenta cada 3 minutos) y el resto sigue igual.

**Qué da bo3.gg y qué no:** mapas, marcador de la serie y de los mapas acabados siempre. Las rondas (una a una, con lado CT o T) solo salen en
partidos con cobertura completa; en los de torneos pequeños el mapa en juego sale sin marcador de rondas y la pantalla lo dice. Jugadores y picks y bans no los da.

## En el diccionario `D` de i18n.js

```js
'En directo': 'Live', 'Final': 'Final', 'mapas ganados': 'maps won', 'en juego': 'live', 'pendiente': 'upcoming', 'jugado': 'played',
'Empezando': 'Starting', 'En juego': 'In play', 'Todavía no ha empezado': 'Not started yet', 'Acabado': 'Finished',
'primera mitad': 'first half', 'segunda mitad': 'second half', 'prórroga': 'overtime', 'Descanso': 'Half time',
'Esta fuente aún no da las rondas de este mapa. Se pone aquí en cuanto las tenga.': 'This source does not give the rounds of this map yet. They show up here as soon as it does.',
'No hay marcador de rondas de este mapa.': 'There is no round score for this map.',
'Aún no ha pasado nada.': 'Nothing has happened yet.', 'Cuando ruede el balón, aquí irá todo lo que pase.': 'Once the ball rolls, everything that happens shows up here.',
'penalti fallado': 'penalty missed', 'en propia': 'own goal',
'Posesión': 'Possession', 'Tiros': 'Shots', 'A puerta': 'On target', 'Córners': 'Corners', 'Faltas': 'Fouls', 'Fueras de juego': 'Offsides',
'Paradas': 'Saves', 'Amarillas': 'Yellow cards', 'Rojas': 'Red cards', 'queda': 'left',
```

## En las reglas `R`

```js
[/^Mapa (\d+) de (\d+)$/, 'Map $1 of $2'], [/^Mapa (\d+)$/, 'Map $1'], [/^Ronda (\d+)$/, 'Round $1'],
[/^gana (.+)$/, '$1 wins'], [/^pick de (.+)$/, 'picked by $1'], [/^queda (.+)$/, 'left: $1'],
[/^por (.+)$/, 'for $1'], [/^asistencia de (.+)$/, 'assist by $1'], [/^(.+) \(en propia\)$/, '$1 (own goal)'],
[/^(.+) · se actualiza cada (\d+) s$/, '$1 · updates every $2 s'],
```

`ban`, `pick`, `CT`, `T`, `ACS`, `K/D/A` y `ADR` ya son iguales en inglés. Los nombres de equipos, mapas y jugadores no se traducen.

## Lo que escribe en la lista de partidos y el chat (`m.score`)

Serie y mapa en juego con sus rondas, por ejemplo `1:0 · Haven 7-5`. Sin rondas (CS2 de torneos pequeños) queda `1:0 · Cache`.
Lleva un unir-palabras invisible (U+2060) tras el guion para que `7-5` no se parta en dos líneas; no cambia nada de lo que se ve.
Se guarda por partido y se vuelve a poner cada vez que `load()` rehace `M` o se llama a `render()` (envuelve `build` y `render` desde vivo.js).

## Datos por equipo (`m.vivo`) y lo que pinta app.js con ellos

`m.vivo` lo pone vivo.js en cada partido en vivo (Valorant, CS2 y fútbol) y se repone solo cuando `load()` rehace `M`. **"a" es siempre el local de nuestro
partido (`m.a`) y "b" el visitante (`m.b`)**: vlr.gg y bo3.gg se orientan por nombre antes de rellenarlo, aunque traigan los equipos al revés.

```js
{ k:'e', a:{mapas:1, rondas:5}, b:{mapas:1, rondas:12}, mapa:'Split', n:3, total:3, lidera:'b' }   // Valorant y CS2 (rondas = null si la fuente no las da)
{ k:'f', a:{mapas:0 /* goles */}, b:{mapas:1}, minuto:"74'", lidera:'b' }                              // fútbol
```

`lidera` = quien gana la serie; si van empatados, quien gana el mapa en juego; si no, `''`. Para pintar: `GM_VIVO.n(m, 'a'|'b')` (número del equipo y, pequeño,
sus rondas) y `GM_VIVO.linea(m)` (la línea "Mapa 3 de 3 · Split", o "Minuto 74'" en fútbol); `GM_VIVO.lineaTxt(m)` da lo mismo como texto.

Frase nueva para las reglas `R`: `[/^Minuto (.+)$/, 'Minute $1']`.
