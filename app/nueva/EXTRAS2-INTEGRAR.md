# Enganchar los extras 2 (cuota mejorada, predicción rápida, vitrina y trofeos)

Ficheros nuevos: `app/nueva/extras.js` (esta carpeta), `db/022_extras.sql`, `db/022_prueba.sql` y un cambio en `sync/sync.mjs`
(función `extras()` al final de `main()`). No tocan `app.js`, `app.css`, `i18n.js` ni `index.html`. `extras.js` lleva su CSS dentro
(como `vivo.js`) y no usa imágenes propias: al pasarlo a `app/` se copia tal cual.

## 1. Base (editor SQL de Supabase), en este orden

1. `db/022_extras.sql`. Necesita 001 a 019 cargados (usa `cs_inv` de 007 y los kinds del monedero de 009 y 015).
2. `db/022_prueba.sql`: tiene que acabar en un error que dice **PRUEBA SUPERADA** (no guarda nada).

**OJO:** 022 redefine `place_bet` (la de 001) para la cuota mejorada. Si otra parte nueva también la redefine, que se cargue antes.
Las cuentas `ledger.kind` nuevas son `pred_apuesta`, `pred_premio` y `pred_devol` (el check de 009 las admite).

Ajustes nuevos en `settings` (se pueden cambiar con un `update` desde el editor): `boost_tope` 1000, `pred_max` 50,
`pred_gol_si` 3.00, `pred_gol_no` 1.25, `pred_ronda` 1.90. PM puede cambiar la mejora de la semana a mano con
`select ex_admin_boost('id-del-partido', '1', 40);` (pick `'1'`, `'X'`, `'2'` o `null` para las tres; de 25 a 50).

## 2. `index.html`

Debajo de `<script src="vivo.js?...">` (tiene que ir después de `app.js`, usa su `db`):

```html
<script src="extras.js?v=202610301200"></script>
```

## 3. `app.js` (dos cambios pequeños, no hacen falta para que funcione, solo para que el monedero lo llame bien)

**a)** En `const KIND = { ... }`:

```js
pred_apuesta: 'Predicción rápida', pred_premio: 'Predicción acertada', pred_devol: 'Predicción devuelta',
```

**b)** En `movTipo`, que cuenten como apuestas:

```js
['apuesta', 'premio', 'devolucion', 'pred_apuesta', 'pred_premio', 'pred_devol'].includes(k)
```

## 4. Sincronizador

`sync/sync.mjs` ya llama a `extras(v)` tras guardar y cerrar partidos. Hace tres cosas: `sync_ex` (elige la cuota mejorada de la
semana y apunta trofeos), apunta cuántas rondas lleva cada mapa de Valorant en directo (`sync_ex_pred_put`) y resuelve las
predicciones abiertas con ESPN y vlr.gg (`sync_ex_pred_pending` y `sync_ex_pred_resolve`). Si 022 aún no está cargada, solo escribe
"falta cargar db/022_extras.sql" y sigue. Opcional: la variable de entorno `PRED_WATCH_S=540` en el workflow de Actions hace que,
en cada pasada, repita lo de las rondas cada 25 s durante 9 minutos (cierra casi del todo el hueco que explica el final de este fichero).

## 5. Diccionario de inglés (`i18n.js`)

En `const D = { ... }` (frases exactas):

```js
    // extras 2 (30-10): cuota mejorada, predicción rápida, vitrina y trofeos
    'CUOTA MEJORADA': 'BOOSTED ODDS', 'Predicción rápida': 'Quick prediction', 'Predicción acertada': 'Prediction won', 'Predicción devuelta': 'Prediction refunded',
    'Predicción rápida: apostado': 'Quick prediction: bet placed',
    '¿Habrá gol en los próximos 10 minutos?': 'Will there be a goal in the next 10 minutes?', 'Sí, habrá gol': 'Yes, there will be a goal', 'No, sin goles': 'No, no goals',
    '¿Quién gana la siguiente ronda?': 'Who wins the next round?', 'Tus predicciones aquí': 'Your predictions here',
    'Cuenta desde 1 minuto después de apostar, durante 10 minutos. Lo comprueba el servidor con la hora real de cada gol en ESPN.': 'Counts from 1 minute after you bet, for 10 minutes. The server checks it against the real time of each goal on ESPN.',
    'La apuesta vale para esa ronda. El servidor la comprueba después con el historial ronda a ronda de vlr.gg.': 'The bet is for that round. The server checks it afterwards with the round by round history from vlr.gg.',
    'Descanso: vuelve cuando ruede el balón.': 'Half time: come back when the ball rolls.', 'El partido no está en juego.': 'The match is not being played.',
    'Las predicciones rápidas de este partido todavía no están disponibles.': 'Quick predictions are not available for this match yet.',
    'No consigo los datos del partido ahora mismo.': 'I cannot get the match data right now.', 'No consigo los datos de vlr.gg ahora mismo.': 'I cannot get the vlr.gg data right now.',
    'Queda muy poco partido para una ventana de 10 minutos.': 'Too little of the match is left for a 10 minute window.', 'Entre mapas: vuelve cuando empiece el siguiente.': 'Between maps: come back when the next one starts.',
    'esperando': 'waiting', 'perdida': 'lost', 'devuelta': 'refunded',
    'Vitrina': 'Showcase', 'Elegir skins': 'Choose skins', 'Vacío': 'Empty', 'Las 3 skins de tu inventario que enseñas a los demás.': 'The 3 skins from your inventory that you show to everyone.',
    'Guardar vitrina': 'Save showcase', 'Vitrina guardada': 'Showcase saved', 'Cargando tu inventario…': 'Loading your inventory…', 'La vitrina tiene sitio para 3 skins': 'The showcase has room for 3 skins',
    'No tienes skins todavía. Abre cajas en Cajas.': 'You have no skins yet. Open boxes in Boxes.',
    'Sala de trofeos': 'Trophy room', 'Permanente: lo que se gana aquí no se borra.': 'Permanent: what you win here is never erased.', 'Mayor premio': 'Biggest win',
    'Cuota más alta acertada': 'Highest odds hit', 'Todavía nadie': 'Nobody yet', 'Campeón de cada mes': 'Champion of each month', 'Bote y premios de la semana': 'Pot and prizes of the week',
    'Aún no ha acabado ningún mes con ganador.': 'No month has ended with a winner yet.', 'Aún no se ha repartido ninguno.': 'None handed out yet.', 'Ver menos': 'Show less',
    'Bote de la semana': 'Pot of the week', 'Más dinero de la semana': 'Most money of the week', 'Mejor ratio de la semana': 'Best ratio of the week',
```

En `const R = [ ... ]` (frases con números o nombres; las de `Apostar N` y `Ver los N` ya existen):

```js
    // extras 2 (30-10)
    [/^Sube un (\d+) % la cuota de (.+)$/, 'The odds for $2 go up $1 %'], [/^Sube un (\d+) % las tres cuotas$/, 'All three odds go up $1 %'],
    [/^Hasta ([\d.]+) por jugador(.*)$/, 'Up to $1 per player$2'], [/^Te quedan ([\d.]+)$/, '$1 left'], [/ · te quedan ([\d.]+)$/, ' · $1 left'],
    [/^Cuota mejorada, antes (.+)$/, 'Boosted odds, were $1'],
    [/cuota fija · máximo ([\d.]+)$/, 'fixed odds · max $1'], [/^¿Quién gana la ronda (\d+) de (.+)\?$/, 'Who wins round $1 on $2?'],
    [/^Has apostado (\d+) a la ronda (\d+)$/, 'You bet $1 on round $2'], [/^Has apostado (\d+) · cuenta hasta las (.+)$/, 'You bet $1 · counts until $2'],
    [/^ganada \+([\d.]+)$/, 'won +$1'], [/^Gol en 10 min · (Sí|No)$/, (m, a) => `Goal in 10 min · ${a === 'Sí' ? 'Yes' : 'No'}`],
    [/^Ronda (\d+) de (.+) · (local|visitante)$/, (m, n, mp, l) => `Round ${n} on ${mp} · ${l === 'local' ? 'home' : 'away'}`],
    [/^Las 3 skins que (.+) enseña a los demás\.$/, 'The 3 skins $1 shows to everyone.'], [/^Elige hasta 3 · el orden es el de los números · (\d) de 3$/, 'Pick up to 3 · the order is the numbers · $1 of 3'],
    [/^(\d+) mes$/, '$1 month'], [/^(\d+) meses$/, '$1 months'], [/^(\d+) bote$/, '$1 pot'], [/^(\d+) botes$/, '$1 pots'], [/^(\d+) premio$/, '$1 prize'], [/^(\d+) premios$/, '$1 prizes'],
    [/, de momento: $/, ', so far: '], [/^Semana del (.+)$/, 'Week of $1'],
```

(La regla que ya existe `^(\d+) premios$` → `$1 wins` va antes que la de arriba: da igual cuál gane, las dos valen.)

## Cómo se comprueba todo, y dónde está el hueco

- **Cuota mejorada.** La elige el servidor (`ex_pick_boost`) la primera vez que alguien abre la app o pasa el sincronizador cada semana:
  el partido que más puntúa (final, semifinal, Champions entre grandes, evento principal de UFC, fase final internacional de
  Valorant o CS2; mínimo 40 puntos; si no hay nada gordo esa semana no se mejora nada). La subida es de 25 a 50 % y vale para una elección
  (75 %) o para las tres (25 %). `place_bet` aplica `round(cuota * (100 + pct) / 100, 2)` y guarda la cuota nueva en `bets.odds` y el % en
  `bets.boost`; `settle_match` paga con `bets.odds`, así que no cambió. Subir las tres elecciones deja ganar siempre apostando a todo, por
  eso hay un tope por jugador y partido (`boost_tope`, 1000) que solo cuenta apuestas con mejora.
- **Gol en 10 minutos (fútbol): reloj del servidor + hora real de ESPN, resolución exacta.** La ventana empieza 1 minuto después de apostar
  y dura 10; ESPN da la hora real (`wallclock`) de cada gol. Un gol ya visto en la tele no cuenta porque ESPN tarda en apuntarlo. Si hay
  descanso en medio, la ventana se alarga lo que dure; si el partido acaba antes y no hubo gol, se devuelve.
- **Quién gana la siguiente ronda (Valorant): resolución exacta, cierre acotado.** El resultado de la ronda N sale del historial de vlr.gg
  (no hay duda). Pero vlr.gg no da la hora de cada ronda y la base no ve el directo, así que no puede saber con certeza que la apuesta
  llegó antes de que empezara la ronda. Lo que hace: guarda lo último que vio el sincronizador de cada mapa (`ex_pred_obs`) y solo acepta
  rondas posteriores a eso más las que han tenido tiempo de acabar desde entonces (155 s por ronda). Con el sincronizador cada 10 minutos
  quedan unas 3 a 5 rondas "dudosas" por mapa en las que alguien que mirase vlr.gg podría apostar a una ronda ya acabada (máximo 50 por
  apuesta, una por ronda y jugador). Con `PRED_WATCH_S=540` el hueco baja a menos de una ronda.

## 022b: predicciones con retraso y cuotas según el estado (30-10, urgente)

Cargar `db/022b_pred_retraso.sql` DESPUÉS de 022 (y probar con `db/022b_prueba.sql`, que acaba en PRUEBA SUPERADA; esa prueba sustituye a la
de 022 para las reglas de predicción, que ya no son las mismas). Vuelve a dar el grant de `ex_pred_gol` y `ex_pred_ronda` solo a authenticated.
Cambia: la ronda de Valorant tiene que estar 3 rondas por delante de lo que sabe la base (`pred_ronda_margen`), nada cerca del descanso ni con el
mapa acabando, la ventana del gol empieza a los 3 minutos (`pred_gol_retraso`), y las cuotas salen del estado en vivo (`ex_live`, que escribe el
sincronizador) con margen del 6 %, entre 1,15 y 4,00, congeladas al apostar. La app manda la cuota que enseña (`p_odds`): si la real ha bajado más
de 0,05, avisa en vez de cobrar. Si la llamada falla por permisos, muestra "Predicciones cerradas un momento".

Diccionario de inglés, en `D`:

```js
    'Predicciones cerradas un momento': 'Predictions closed for a moment', 'Prórroga: sin predicciones.': 'Extra time: no predictions.', 'Prórroga: sin predicciones': 'Extra time: no predictions',
    'Sin datos frescos del directo': 'No fresh live data', 'Predicción rápida resuelta': 'Quick prediction settled',
    'Estamos cerca del descanso entre mitades: sin predicciones hasta pasarlo.': 'Close to the half time break: no predictions until it is over.',
    'El mapa está acabando: sin predicciones hasta el siguiente.': 'The map is about to end: no predictions until the next one.',
    'Queda muy poco partido para una ventana de 10 minutos': 'Too little of the match is left for a 10 minute window',
    '¿Quién gana la ronda?': 'Who wins the round?',
    'Cuenta desde 3 minutos después de apostar, durante 10 minutos, porque ESPN va con retraso respecto al directo. La cuota depende del minuto y del marcador y se queda fija al apostar.': 'Counts from 3 minutes after you bet, for 10 minutes, because ESPN runs behind the live stream. The odds depend on the minute and the score and stay fixed once you bet.',
    'El stream va por delante de vlr.gg, por eso se apuesta a una ronda que todavía no ha empezado, 3 rondas más allá de lo que marca vlr.gg. La cuota depende de cómo va el mapa y se queda fija al apostar.': 'The stream runs ahead of vlr.gg, so you bet on a round that has not started yet, 3 rounds beyond what vlr.gg shows. The odds depend on how the map is going and stay fixed once you bet.',
```

En `R` (sustituyen a las de `cuota fija · máximo` y `Has apostado` de arriba):

```js
    [/cuota fija al apostar · máximo ([\d.]+)$/, 'odds fixed when you bet · max $1'],
    [/^Has apostado (\d+) a ([\d,]+) a la ronda (\d+)$/, 'You bet $1 at $2 on round $3'], [/^Has apostado (\d+) a ([\d,]+) · cuenta de (.+) a (.+)$/, 'You bet $1 at $2 · counts from $3 to $4'],
    [/ · vlr\.gg marca (\d+) rondas$/, ' · vlr.gg shows $1 rounds'],
    [/^La cuota ha cambiado: ahora es (.+) \(te enseñaban (.+)\)$/, 'The odds changed: now $1 (you were shown $2)'],
```

## Cash out (024): lo que está hecho y lo que falta (30-10)

**Hecho y probado en PGlite:** `db/024_cashout.sql` y `db/024_prueba.sql` (PRUEBA SUPERADA, también con 020 y 021 cargadas). Carga: después de 022 y 022b
(comparte con 022b `ex_live` y el modelo, con las mismas definiciones). Antes del partido vale importe × cuota apostada / cuota actual × 0,95; en directo
importe × cuota × probabilidad × 0,90 (fútbol Poisson con marcador y minuto; Valorant y CS2 con mapas, rondas y BO; UFC solo antes), con tope en lo que
paga si gana y mínimo 1, datos en vivo de menos de 3 minutos, sin cash out con cuota mejorada. `cash_out(p_bet, p_min)` recalcula en el servidor, cierra
como `status 'cashout'`, apunta ledger `cashout`, avisa en el chat y hace `bump()`. El bote, los premios de la semana y los trofeos lo cuentan.
`cash_out_quote(bet)` y `cash_out_quotes()` dan el valor. `sync/sync.mjs` ya escribe el estado en vivo (`sync_ex_live_put`: fútbol con ESPN, Valorant con
vlr.gg, CS2 con PandaScore) en cada vuelta. `app.js` ya trata la apuesta retirada como resuelta (`won` con beneficio, `lost` con pérdida, `cash = true`):
sello RETIRADA en Mis apuestas y en el historial, `perd()` para la pérdida real, KIND `cashout`.

**Falta (la app):** el botón "Cash out N" con confirmación de dos toques y refresco cada 20 s. Está escrito en `app/nueva/cashout-pendiente.js.txt` sin
probar. Para meterlo en `extras.js`: pegar su contenido antes de `/* ---------- clics ---------- */`, y además
1. en `rev()`: `if (document.querySelector('.bol, #vivoyo .vy')) { cargaCO(); parcheaCash() }`;
2. un listener de clic en fase de captura (para que el boleto no navegue): `document.addEventListener('click', (e) => { const c = e.target.closest('[data-xc]'); if (c) { e.stopPropagation(); e.preventDefault(); pideCO(+c.dataset.bet) } }, true)`;
3. el CSS: `.xc-btn` (píldora dorada, `.sure` verde, `.neg` gris cuando cobras menos de lo apostado), `.bol-n .xc-btn{margin-left:auto}` y `.xc-vy{margin-top:6px}`;
4. diccionario de inglés: `Cash out N`, `¿Cobrar? Toca otra vez N`, `Retirada` (RETIRADA).
Tampoco está mirado: Discord (021) cuenta solo 'won' y 'lost', así que no cuenta el cash out.
