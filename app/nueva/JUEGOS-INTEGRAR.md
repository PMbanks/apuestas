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
- Textos para el diccionario del ingles: el modulo pasa lo que pinta por `GM_LANG.traduce`. Frases fijas: Cara o cruz, Crash, Ruleta, Blackjack, Plinko, Contra, Cualquiera, Tu lado, Cara, Cruz, Apuesta, Todo, Aceptar, Retirar, Abiertos, Tus retos, Últimos, Retirar solo en, sin límite, Apostar, Dentro, En marcha, Retirado, Perdida, dentro, En la ronda, Color, Rojo, Negro, Verde, Girando, Banca, Tú, En juego, Pedir, Plantarse, Doblar, doblada, Riesgo, Bajo, Medio, Alto, Últimas bolas, "Apuesta para abrir una ronda", "Retira antes de que explote", "Empate · te devuelvo la apuesta", "Blackjack paga 3 a 2. La banca se planta en 17.". Con numeros (para las reglas): `Retar por N`, `Apostar N`, `Apostar N a rojo`, `Repartir por N`, `Otra mano por N`, `Soltar bola por N`, `Retirar ×X N`, `Arranca en N s · M dentro`, `Explotó en ×X · cobraste N` o `· perdiste N`, `Has cobrado N`, `Salió el N, rojo · cobras N` o `· pierdes N`, `Salió cara. Ganas N`, `Salió cruz. Pierdes N`, `Salió cara. Ana aceptó y ganas N` o `pierdes N`, `Ganas ▲ N`, `Blackjack · ▲ N`, `Te pasas · ▼ N`, `Pierdes ▼ N`, `×M · ▲ N`, `×M · ▼ N`, `×M · te devuelve lo apostado`, `Máximo ×N`, `va a cara`, `te reta, va a cruz`, `le gana a ti · cruz`, `sale en ×X`, y los avisos: `Reto lanzado por N`, `Reto retirado: te devuelvo N`, `Retirado a ×X · +N`, `Tarde: explotó en ×X`, `No tienes tanto: te quedan N`, `Pon una cantidad`. Los errores de la base ya vienen en español (`No tienes saldo suficiente: te quedan N`, `Ya estás dentro de esta ronda`, `La ronda ya ha arrancado: espera a la siguiente`, `La ruleta está girando: espera a que acabe`, `Apuestas cerradas`, `Ya tienes una mano en juego`, etc.).
