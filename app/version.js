// Version nueva publicada: la app se recarga sola (PM, 30-10: "no veo casi nada de lo que me has dicho").
// Cada 90 s mira version.json sin cache; si cambia, recarga en cuanto no estas escribiendo ni hay una animacion de
// juego o caja en marcha, o al volver a la pestana. Mientras espera, un boton "Recargar".
'use strict';
(function () {
  const mia = document.querySelector('meta[name="gm-ver"]')?.content;
  if (!mia) return;
  let nueva = null;
  const ocupado = () => document.activeElement?.matches('input,textarea') || (window.GM_JUEGOS && GM_JUEGOS.ocupado && GM_JUEGOS.ocupado()) || (window.GM_CAJAS && GM_CAJAS.estado && GM_CAJAS.estado().girando);
  function intenta() { if (!nueva) return; if (document.hidden || !ocupado()) location.reload(); else setTimeout(intenta, 5000) }
  function boton() {
    if (document.getElementById('gm-nueva')) return;
    const b = document.createElement('button');
    b.id = 'gm-nueva'; b.type = 'button'; b.textContent = document.documentElement.lang === 'en' ? 'New version · Reload' : 'Versión nueva · Recargar';
    b.style.cssText = 'position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 86px);transform:translateX(-50%);z-index:9999;padding:11px 20px;border:0;border-radius:999px;background:#f2c14e;color:#141008;font:700 13px system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.45);cursor:pointer';
    b.onclick = () => location.reload();
    document.body.appendChild(b);
  }
  async function mira() {
    try {
      const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
      const v = (await r.json()).v;
      if (v && v !== mia) { nueva = v; boton(); setTimeout(intenta, 4000) }
    } catch {}
  }
  setTimeout(mira, 8000);
  setInterval(mira, 90000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) mira() });
})();
