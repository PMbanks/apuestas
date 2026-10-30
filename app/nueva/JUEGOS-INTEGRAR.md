# Juegos: como engancharlos a la app

Ficheros nuevos: `app/nueva/juegos.js`, `app/nueva/juegos.css`, `db/010_juegos.sql`, `db/010_prueba.sql`.
No tocan nada del resto. Orden en Supabase: el cambio del check de `ledger.kind` (regex `^[a-z_]{3,20}$`), luego `010_juegos.sql`, luego `010_prueba.sql` (se deshace sola y dice "PRUEBA SUPERADA").

## 1. index.html

```html
<link rel="stylesheet" href="juegos.css?v=202610301200">          <!-- justo despues de app.css (y de cajas.css) -->
<script src="juegos.js?v=202610301200"></script>                   <!-- antes de app.js, junto a cajas.js -->
```

## 2. app.js

**a) Entrada en `SCREENS`** (detras de `monedero`; la barra de abajo del movil pasara a 7 botones, `.ns` usa el nombre corto):

```js
  juegos: ['Juegos', 'Cara o cruz, crash, ruleta, blackjack y plinko', '<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="9" cy="9" r=".6"/><circle cx="15" cy="9" r=".6"/><circle cx="12" cy="12" r=".6"/><circle cx="9" cy="15" r=".6"/><circle cx="15" cy="15" r=".6"/>'],
```

**b) El contexto y la pantalla** (junto a `const R = {...}`):

```js
const jgCtx = () => ({ db, me: ME, meKey: MEK, jugadores: F.map((f) => ({ id: f.id, uuid: f.uid, n: f.n, color: f.id })), saldo: me().s, av, toast, refresh });
const juegos = () => GM_JUEGOS.html(jgCtx());
const R = { partidos, apuestas, colegas, liga, chat, monedero, juegos, perfil };
```

**c) En `render()`**, justo despues de `vw.innerHTML = R[S.scr](); vw.dataset.vista = S.scr;` y del bloque `if (cambia) {...}`:

```js
  if (S.scr === 'juegos') GM_JUEGOS.montar(vw, jgCtx(), cambia);
```

(`cambia` es el que ya existe: true al entrar en la pantalla.) El nodo de los juegos es siempre el mismo: cada repintado de la app lo vuelve a colgar sin perder animaciones ni la ronda en marcha.

**d) Pulso de Realtime** (en `live()`). Un pulso ya hace `refresh()` -> `load()` -> `render()` -> `montar()`, y `montar()` pide solo su estado a la base: no hace falta suscribirse a nada mas (las fases de crash y ruleta las cronometra el propio modulo con el reloj de la base). Una sola linea para que el saldo de la cabecera no se mueva antes de que acabe una animacion (la bola del plinko, la moneda, la rueda, las cartas): el modulo llama a `refresh()` el solo cuando termina.

```js
  let to; const soon = () => { if (window.GM_JUEGOS && GM_JUEGOS.ocupado()) return; clearTimeout(to); to = setTimeout(refresh, 700) };
```

**e) Nombres de los movimientos en el Monedero** (`const KIND = {...}`), si no se quiere ver el tipo en crudo:

```js
  moneda: 'Cara o cruz', crash: 'Crash', ruleta: 'Ruleta', blackjack: 'Blackjack', plinko: 'Plinko',
```

## 3. Lo que hay que saber

- `ctx` que usa el modulo: `db`, `me` (uuid), `jugadores [{id, uuid, n, color}]`, `saldo`, `av(key, cls)`, `toast(html)`, `refresh()`. `meKey` va por si acaso.
- Sin bucles de fondo: el modulo solo usa `requestAnimationFrame` o temporizadores mientras hay una ronda de crash o ruleta viva con la pantalla a la vista, o una animacion en marcha. En reposo: 0 fotogramas, 0 temporizadores, 0 llamadas (medido). Si la pantalla se oculta o se sale de Juegos, todo se para.
- `GM_JUEGOS.ocupado()` es true mientras una animacion esconde un resultado.
- El saldo del Monedero y de las semanas de la Liga (`weeks`, `recibido`) salen de `ledger`, asi que ganar o perder en los juegos ya cuenta ahi. `get_state` solo trae los ultimos 60 movimientos: con el plinko se llenaran rapido.
- Apuesta maxima por jugada: 100.000 (para que ningun saldo se acerque al limite de `int`).
- **Ingles**: el modulo pinta en espanol y pasa lo pintado por `GM_LANG.traduce` (nodo de texto a nodo de texto), asi que solo hace falta meter estas lineas en `i18n.js`. Pestanas visibles: Cara o cruz, Crash y Blackjack (ruleta y plinko ya no tienen pestana). Las de `D` son frases exactas; las de `R` van al final de la lista de reglas, en este orden.

```js
// ---- D: frases exactas (juegos.js) ----
'Cara o cruz': 'Heads or tails', 'Crash': 'Crash', 'Blackjack': 'Blackjack',
'Contra': 'Against', 'Cualquiera': 'Anyone', 'Tu lado': 'Your side', 'Cara': 'Heads', 'Cruz': 'Tails', 'cara': 'heads', 'cruz': 'tails',
'Apuesta': 'Bet', 'Todo': 'All', 'Máx': 'Max', 'Retar por': 'Challenge for', 'Abiertos': 'Open', 'Tus retos': 'Your challenges', 'Últimos': 'Latest',
'Aceptar': 'Accept', 'Retirar': 'Withdraw', 'Tú': 'You', 'ti': 'you',
'Retirar solo en': 'Cash out only at', 'sin límite': 'no limit', 'Retirada automática': 'Auto cash out',
'Dentro': 'In', 'dentro': 'in', 'En marcha': 'Running', 'Retirado': 'Cashed out', 'Perdida': 'Lost', 'En la ronda': 'In the round', 'Últimas rondas': 'Last rounds',
'Todavía nadie dentro': 'Nobody in yet', 'segundos': 'seconds', 'Apuesta para abrir una ronda': 'Bet to open a round', 'Retira antes de que explote': 'Cash out before it blows',
'Banca': 'Dealer', 'Haz tu apuesta': 'Place your bet', 'En juego': 'In play', 'Pedir': 'Hit', 'Plantarse': 'Stand', 'Doblar': 'Double', 'doblada': 'doubled',
'Repartir por': 'Deal for', 'Otra mano por': 'Another hand for', 'Hoy te quedan': 'Today you have', 'por arriesgar': 'left to risk',
'Hoy ya has perdido 100. Vuelve mañana': 'You have already lost 100 today. Come back tomorrow',
'Blackjack paga 3 a 2': 'Blackjack pays 3 to 2', 'Blackjack paga 3 a 2. La banca se planta en 17.': 'Blackjack pays 3 to 2. The dealer stands on 17.',
'Empate · te devuelvo la apuesta': 'Push · your bet is returned',
'Pon una cantidad': 'Enter an amount', 'Este juego está cerrado ahora mismo': 'This game is closed right now',
'La retirada automática va de ×1,01 a ×1000': 'Auto cash out goes from ×1.01 to ×1000',
// errores de la base (db/010 y db/016)
'Tienes que entrar primero': 'You need to log in first', 'La apuesta mínima es 1': 'The minimum bet is 1', 'La apuesta máxima es 100.000': 'The maximum bet is 100,000',
'Elige cara o cruz': 'Pick heads or tails', 'Elige a un colega': 'Pick a friend', 'Ya tienes 5 retos abiertos: retira alguno': 'You already have 5 open challenges: withdraw one',
'Ese reto no existe': 'That challenge does not exist', 'Ese reto ya no está abierto': 'That challenge is no longer open', 'No puedes aceptar tu propio reto': 'You cannot accept your own challenge',
'Ese reto es para otro': 'That challenge is for someone else', 'Ese reto no es tuyo': 'That challenge is not yours', 'Ese reto ya no se puede retirar': 'That challenge can no longer be withdrawn',
'La ronda ya ha arrancado: espera a la siguiente': 'The round has already started: wait for the next one', 'Ya estás dentro de esta ronda': 'You are already in this round',
'No hay ninguna ronda': 'There is no round', 'No estás en esta ronda': 'You are not in this round', 'La ronda aún no ha arrancado': 'The round has not started yet',
'Ya tienes una mano en juego': 'You already have a hand in play', 'Esa mano no es tuya': 'That hand is not yours', 'Esa mano ya ha terminado': 'That hand has already ended',
'Solo puedes doblar con las dos primeras cartas': 'You can only double on your first two cards',
'Los juegos aún no están en la base: falta cargar db/010_juegos.sql': 'The games are not in the database yet: db/010_juegos.sql is missing',

// ---- R: con numeros o nombres (añadir a la lista de reglas) ----
[/^Apostar ([\d.]+)$/, 'Bet $1'], [/^Retirar ×([\d,]+)$/, 'Cash out ×$1'],
[/^([\d.]+) dentro$/, '$1 in'], [/^sale en ×([\d,]+)$/, 'exits at ×$1'],
[/^Has cobrado ([\d.]+)$/, 'You cashed $1'], [/^Explotó en ×([\d,]+)/, 'Crashed at ×$1'], [/ · cobraste ([\d.]+)$/, ' · you cashed $1'], [/ · perdiste ([\d.]+)$/, ' · you lost $1'],
[/^Retirado a ×([\d,]+) · \+([\d.]+)$/, 'Cashed out at ×$1 · +$2'], [/^Tarde: explotó en ×([\d,]+)$/, 'Too late: it crashed at ×$1'],
[/^Reto lanzado por ([\d.]+)$/, 'Challenge sent for $1'], [/^Reto retirado: te devuelvo ([\d.]+)$/, 'Challenge withdrawn: your $1 is back'],
[/^No tienes tanto: te quedan ([\d.]+)$/, 'You do not have that much: you have $1 left'],
[/^No tienes saldo suficiente: te quedan ([\d.]+)$/, 'Not enough balance: you have $1 left'],
[/^Salió (cara|cruz)\. Ganas ([\d.]+)$/, 'It came up $1. You win $2'], [/^Salió (cara|cruz)\. Pierdes ([\d.]+)$/, 'It came up $1. You lose $2'],
[/^Salió (cara|cruz)\. (.+) aceptó y ganas ([\d.]+)$/, 'It came up $1. $2 accepted and you win $3'], [/^Salió (cara|cruz)\. (.+) aceptó y pierdes ([\d.]+)$/, 'It came up $1. $2 accepted and you lose $3'],
[/^It came up cara/, 'It came up heads'], [/^It came up cruz/, 'It came up tails'],
[/^te reta, va a cara$/, 'challenges you, goes for heads'], [/^te reta, va a cruz$/, 'challenges you, goes for tails'], [/^va a cara$/, 'goes for heads'], [/^va a cruz$/, 'goes for tails'],
[/^le gana a (.+) · (cara|cruz)$/, 'beats $1 · $2'], [/^le ganas a (.+) · (cara|cruz)$/, 'you beat $1 · $2'], [/^(beats|you beat) (.+) · cara$/, '$1 $2 · heads'], [/^(beats|you beat) (.+) · cruz$/, '$1 $2 · tails'], [/^beats ti · /, 'beats you · '],
[/^Ganas ▲ ([\d.]+)$/, 'You win ▲ $1'], [/^Te pasas · ▼ ([\d.]+)$/, 'Bust · ▼ $1'], [/^Pierdes ▼ ([\d.]+)$/, 'You lose ▼ $1'],
[/^Hoy solo puedes arriesgar ([\d.]+) más en el blackjack$/, 'Today you can only risk $1 more in blackjack'],
[/^Hoy ya has perdido 100 en el blackjack\. Vuelve mañana$/, 'You have already lost 100 today in blackjack. Come back tomorrow'],
[/×(\d+),(\d\d)/g, '×$1.$2'],   // decimales con punto: este va el ultimo de la lista
```

  Notas: `Blackjack · ▲ N` se queda igual en ingles. La cuenta atras del crash, las fichas y los puntos de explosion llevan numeros solos (no se traducen). El letrero de la mesa ("Blackjack paga 3 a 2") es un elemento normal, traducible con la frase de `D`. `Retar por`, `Repartir por` y `Otra mano por` llevan la cifra en un `<span>` aparte, por eso van en `D` sin cifra. Ruleta y plinko siguen en el codigo con sus frases (Rojo, Negro, Verde, Girando, Riesgo, Soltar bola...) pero ya no se ven.
