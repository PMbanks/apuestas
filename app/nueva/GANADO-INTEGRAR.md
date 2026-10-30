# Integrar ganado.js (resultados: tarjeta al ganar, línea al perder, campanita y panel)

Fichero nuevo: `app/nueva/ganado.js` (CSS dentro, sin rutas `../`; ya copiado igual a `app/ganado.js`).
No toca `app.js`, `app.css`, `i18n.js` ni la base. Lee `ALL`, `LEDGER`, `CH`, `MI`, `S`, `db` de app.js y, aparte, solo
`ex_pred` (tus predicciones, solo lectura). Engancha con un MutationObserver sobre `#top` (sin bucles ni intervalos).

## 1. `index.html` (nueva y publicada)

Detrás de `sonidos.js`, con el `?v=` de la tanda:

```html
<script src="ganado.js?v=20261030XXXXXX"></script>
```

## 2. Diccionario de inglés (`i18n.js`)

En `D` (por ejemplo tras el bloque de chat y feed):

```js
    // resultados (ganado.js, 30-10)
    'Resultados': 'Results', 'Resultados nuevos': 'New results', 'Apuesta ganada': 'Bet won', 'Reto ganado': 'Challenge won', 'Cash out': 'Cash out',
    'Has ganado': 'You won', 'Has retirado': 'You cashed out', 'Tu elección': 'Your pick', 'Apostaste': 'You staked', 'limpias': 'profit',
    'Toca para cerrar': 'Tap to close', 'Desde la última vez': 'Since you were away', 'más en Resultados': 'more in Results', 'También': 'Also',
    'ganadas': 'won', 'perdidas': 'lost', 'devuelta': 'refunded', 'devueltas': 'refunded',
    'Perdiste': 'You lost', 'con': 'with', 'Cash out con': 'Cash out with', 'Perdiste el reto con': 'You lost the challenge to', 'Reto devuelto': 'Challenge refunded',
    'Te devolvemos': 'Refunded', 'Reto a': 'Challenge vs', 'Tuyos': 'Yours', 'De todos': 'Everyone', 'Últimos 7 días': 'Last 7 days',
    'Todavía no hay resultados.': 'No results yet.', 'Ver el Feed': 'See the Feed', 'ganó': 'won', 'perdió': 'lost', 'retiró': 'cashed out', 'recupera': 'gets back',
```

En `R`, **detrás** de la regla `^Ronda (\d+) de (.+) · (local|visitante)$` (vale justo antes de la de los decimales con punto):

```js
    [/^(\d+) perdidas?$/, '$1 lost'], [/^(\d+) devueltas?$/, '$1 refunded'], [/^(\d+) premios nuevos$/, '$1 new wins'], [/^Ronda (\d+) de (.+?) · (.+)$/, 'Round $1 on $2 · $3'],
```

Probado en inglés metiendo esto al vuelo: todo sale traducido (tarjeta, panel, líneas, notificación "You won +479").

## 3. Opcional en app.js (recomendado, una línea)

`avisos()` ya celebra una apuesta ganada en la sesión (`confeti()`, toast "¡Ganada!" y `avisa`). Con ganado.js eso se dobla
(el toast queda debajo de la tarjeta, ganado.js no repite confeti si ya hay uno, y la notificación usa la misma `tag`
para sustituirse). Para dejarlo limpio: en `avisos()` quitar `confeti();` y el `toast(...)` de la rama `b.st === 'won'`.

## 4. Qué hace

- Gana (apuesta, predicción, cash out con beneficio, reto, bote, premio de la semana): tarjeta en el centro con escudos,
  tu elección, cuota, "Has ganado +479", confeti y sonido propio (Web Audio, respeta el silencio de sonidos.js). Varias a la
  vez: resumen con lista y total ("Desde la última vez" si pasó con la app cerrada o de fondo). Se cierra con un toque, Escape
  o sola a los 8 s; al cerrar las monedas vuelan al saldo.
- De fondo (pestaña oculta o ventana sin foco): suena y notificación del sistema "Has ganado +479" con el partido (si hay
  permiso de "Activar avisos"); la tarjeta espera a que vuelvas.
- Pierde o devuelta: línea discreta abajo, sonido muy bajito. Las canceladas por uno mismo no cuentan.
- Campanita "Resultados" junto a Recompensas, con punto verde si hay resultados sin mirar; panel con Tuyos (7 días, ganadas
  verde, perdidas rojo, devueltas gris) y De todos ("PM ganó 479 con Nova Esports"), enlaces a Mis apuestas y al Feed.
- Recuerda lo enseñado en `localStorage` `gm-ganado:<jugador>`; la primera vez enseña lo de las últimas 12 h.
- Interruptor Animaciones (`html.sin-anim`): sin confeti, sin animaciones, número sin contar.

## 5. Lo que falta o queda por mirar

- La prueba "de fondo" (pestaña oculta simulada) pasó una vez (sonido, notificación con título y tag correctos) pero en
  las siguientes la recarga con la pestaña oculta no llegó a tiempo en el arnés; no se ha cerrado si es del arnés o real.
  Probar a mano: ganar con la pestaña de fondo.
- Con la app CERRADA del todo no hay aviso: haría falta web push (service worker, claves VAPID, guardar la suscripción de
  cada jugador en la base y que el sincronizador mande el push al resolver con una Edge Function). En el móvil (Android/iOS)
  la notificación del sistema también necesita service worker, aunque la app esté abierta.
- Capturas: `modelos/capturas/ganado-*.png` (1440 es: resumen, una, perdida, campana, panel, panel-todos; 390 en: resumen,
  campana, panel, panel-todos). Faltan 390 en español y 1440 en inglés.
