// Service worker MINIMO de Gambling Addicts: solo avisos (web push). No guarda nada en cache ni toca las peticiones (no hay evento fetch):
// la app se carga y se actualiza exactamente igual que sin el.
//   push              enseña la notificacion que manda el sincronizador (sync/push.mjs): { t: titulo, b: cuerpo, u: pantalla, i: id, k: tipo }
//   notificationclick abre o enfoca la app y la lleva a la pantalla del aviso (avisos.js escucha el mensaje; si la app estaba cerrada, abre ?aviso=pantalla)
// Debe servirse desde la raiz del scope publicado (/apuestas/sw.js) y, en la copia de trabajo, desde /apuestas/nueva/sw.js: se registra como 'sw.js'
// relativo a la pagina, asi que cada copia queda con su propio scope.
// En iPhone cada push TIENE que enseñar una notificacion (si no, Safari borra la suscripcion): por eso se enseña siempre, este la app abierta o no.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// la copia de trabajo (/nueva/) saca los iconos de ../img/, la publicada de img/
const ICONO = new URL((/\/nueva\/$/.test(self.registration.scope) ? '../img/' : 'img/') + 'icon-192.png', self.registration.scope).href;

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (er) { d = { t: e.data ? e.data.text() : '' }; }
  const titulo = String(d.t || 'Gambling Addicts').slice(0, 120);
  e.waitUntil(self.registration.showNotification(titulo, {
    body: String(d.b || '').slice(0, 240),
    icon: ICONO,
    badge: ICONO,
    tag: d.i ? 'gm-aviso-' + d.i : undefined,
    data: { gm: 1, u: String(d.u || 'inicio') },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const dato = e.notification.data || {};
  e.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const mia = ventanas.find((c) => c.url.startsWith(self.registration.scope));
    if (mia) {
      try { await mia.focus(); } catch (er) {}
      if (dato.gm) mia.postMessage({ gmAviso: dato.u });
      return;
    }
    await self.clients.openWindow(self.registration.scope + (dato.gm ? '?aviso=' + encodeURIComponent(dato.u) : ''));
  })());
});
