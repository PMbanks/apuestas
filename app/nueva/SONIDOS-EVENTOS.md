# Sonidos: qué eventos deberían lanzar los otros módulos

`sonidos.js` ya reacciona solo a lo que se ve en pantalla (ruleta de cajas, crash, aviso de arriba, resultados de los
juegos, chat, botones principales). Para todo lo demás, o para hacerlo más fino, cualquier módulo lanza un evento:

```js
window.dispatchEvent(new CustomEvent('gm:sonido', { detail: 'cobrar' }));
// con datos: detail: { tipo: 'caja-final', rareza: 'esp', vol: 0.5 }
```

También se puede llamar directo: `GM_SONIDOS.suena('cobrar')`. `GM_SONIDOS.silencia(true|false)` y `GM_SONIDOS.silenciado()`
mandan sobre el botón de silencio (que se recuerda en `localStorage`, clave `gm-sonido`). No suena nada hasta la primera
pulsación o toque de la persona. El mismo sonido no se repite en menos de 25 ms.

## Sonidos que existen

| `detail` | Qué es | Quién debería lanzarlo |
|---|---|---|
| `clic` | Clic suave | Ya sale solo en `.go .go-s .send .cj-go .nv .chip [data-go]`. Lanzarlo a mano solo en botones principales con otra clase |
| `caja-tic` | Tic de la ruleta al pasar una carta | Ya sale solo mirando `.cj-spin`. En las batallas (`.bv-reel`) lo lanzaría `cajas.js` en su bucle |
| `caja-final` + `rareza` (`mil res cla cov esp`) | Golpe final de la ruleta, más largo y brillante cuanto más rara | Ya sale solo al acabar la ruleta propia. `cajas-vivo.js` lo lanza con `vol: 0.45` al acabar la del otro. Las batallas, al revelar cada ronda |
| `cobrar` | Monedas | Ya sale con los avisos "¡Ganada!", "Retirado a", premio diario, tiempo, rescate, "Vendida" y con `.jg-msg.win` / `.jg-res.win`. `app.js` debería lanzarlo al reclamar paga, bote o premio de ruleta si no pasa por el aviso |
| `perder` | Dos notas que bajan | Ya sale con "Tarde", `.jg-msg.lose`, `.jg-res.lose` y al explotar el crash dentro. **`app.js` debería lanzarlo cuando una apuesta pasa a `lost`** (ahora solo hay notificación del sistema, sin nada en el DOM) |
| `crash-sube` | Subida continua de tono mientras corre la ronda | Sale sola si hay una apuesta mía dentro (`[data-sub]` dice "Retira antes de que explote"). `juegos.js` podría lanzarlo al empezar la ronda |
| `crash-para` | Corta la subida | Al retirar o al acabar (ya lo hacen "Retirado a" y la explosión) |
| `crash-boom` + `vol` | Explosión | Ya sale sola al cambiar `[data-mult]` a `boom`. `vol: 0.35` si no estabas dentro |
| `chat` | Burbuja suave | Ya sale con un mensaje nuevo de otro en `[data-chat]`. `app.js` podría lanzarlo desde la suscripción en tiempo real, así suena también fuera del chat |
| `sticker` | Pop de sticker | Lo lanza `stickers.js` al mandar uno; suena solo al recibir uno de otro |

## Detalles de lo que se detecta solo

- Ruleta: se sigue el `transform` de `.cj-track` cuadro a cuadro **solo mientras gira** (sin bucle en reposo) y el golpe
  final sale cuando terminan las animaciones (también si se pulsa Saltar). La rareza se lee de la carta que gana (`.cj-k`,
  posición 46, igual que `cajas.js`).
- Crash: se mira la clase de `[data-mult]` (`on` corriendo, `boom` explotado, `dim` parado). Lo que se ve la primera vez
  no suena, solo los cambios.
- Aviso de arriba: se lee `#toast`; las frases que reconoce están en `revisaToast()`. Si se cambia una frase del aviso
  en `app.js`, hay que cambiarla también ahí o lanzar el evento a mano.
- Chat: suena el último mensaje nuevo si no es mío (se compara con `.rail-me b`).
