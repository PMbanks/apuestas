// Cajas en directo: cuando alguien abre una caja, los demas que estan en la pantalla Cajas ven su ruleta girar y lo que le sale.
// Va por Supabase Realtime (broadcast, canal 'cajas-vivo'): no toca la base ni guarda nada.
// Dos cosas de cajas.js (las dos marcadas "// en directo"):
//   gm:cajas-montada  { db, me }  al montar la pantalla Cajas: de aqui sale el cliente de Supabase que ya usa la app.
//   gm:caja-abierta   { quien, nombre, caja, cajaNombre, items:[{n,r,i,l,v}], pool:[{r,i,l}] }  al abrir una caja (r rareza, i imagen, l lujo, v valor).
// La tira se pinta fuera de la pantalla Cajas (en el body), asi que aunque la app repinte no se pierde.
// Todo lo que llega por la red se trata como no fiable: texto escapado, imagenes solo de dos sitios, rarezas de una lista.
'use strict';
(function () {
  const CANAL = 'cajas-vivo', G = 46, TOTAL = 54, MAX_FILAS = 3, MAX_TARJETAS = 3;
  const RAR = { esp: ['Especial', '#e4ae39'], cov: ['Encubierto', '#eb4b4b'], cla: ['Clasificado', '#d32ce6'], res: ['Restringido', '#8847ff'], mil: ['Grado militar', '#4b69ff'] };
  const IMG_OK = /^https:\/\/(community\.akamai\.steamstatic\.com|pmbanks\.github\.io)\//;
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const N = (x) => String(Math.round(+x || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, document.documentElement.lang === 'en' ? ',' : '.');
  const quieto = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } };
  const corta = (t, n) => String(t ?? '').slice(0, n);

  /* ---------- el canal ---------- */
  let db = null, me = null, canal = null, listo = null;
  function conecta(d, yo) {
    me = yo || me;
    if (db === d && canal) return;
    if (canal && db) { try { db.removeChannel(canal) } catch {} }
    db = d; canal = null; listo = null;
    if (!db || typeof db.channel !== 'function') return;
    canal = db.channel(CANAL, { config: { broadcast: { self: false } } });
    canal.on('broadcast', { event: 'abre' }, (m) => recibe(m && m.payload));
    listo = new Promise((ok) => { canal.subscribe((st) => { if (st === 'SUBSCRIBED') ok(true); else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') ok(false) }); setTimeout(() => ok(false), 4000) });
  }
  window.addEventListener('gm:cajas-montada', (e) => { const d = e.detail || {}; if (d.db) conecta(d.db, d.me) });
  // lo que yo abro se manda a los demas (con el canal ya listo; si no lo esta tras 4 s, no se manda y no pasa nada)
  window.addEventListener('gm:caja-abierta', async (e) => {
    const p = e.detail; if (!p || !canal) return;
    try { if (!(await listo)) return; await canal.send({ type: 'broadcast', event: 'abre', payload: p }) } catch {}
  });

  /* ---------- lo que llega ---------- */
  const img = (u) => (typeof u === 'string' && IMG_OK.test(u) && u.length < 400 ? u : '');
  function limpia(p) {
    if (!p || typeof p !== 'object') return null;
    const it = (x) => ({ r: RAR[x && x.r] ? x.r : 'mil', i: img(x && x.i), l: x && x.l ? 1 : 0 });
    const items = (Array.isArray(p.items) ? p.items : []).slice(0, 10).map((x) => ({ ...it(x), n: corta(x && x.n, 80), v: Math.max(0, Math.min(1e9, +(x && x.v) || 0)) }));
    if (!items.length) return null;
    const pool = (Array.isArray(p.pool) ? p.pool : []).slice(0, 40).map(it);
    return { quien: corta(p.quien, 60), nombre: corta(p.nombre, 40) || 'Alguien', caja: corta(p.cajaNombre, 60), items, pool: pool.length ? pool : items.map(it) };
  }
  const enCajas = () => { const r = document.querySelector('.cj'); return !!(r && r.isConnected && !document.hidden) };
  function recibe(raw) {
    const p = limpia(raw);
    if (!p || (me && p.quien === me) || !enCajas()) return;
    tarjeta(p);
  }

  /* ---------- la tira ---------- */
  const carta = (x) => (x.r === 'esp' && !x.l ? '<div class="cv-k esp"><span>★</span></div>' : `<div class="cv-k" style="--c:${RAR[x.r][1]}">${x.i ? `<img src="${esc(x.i)}" alt="" decoding="async">` : ''}</div>`);
  const aleatoria = (pool) => pool[(Math.random() * pool.length) | 0];
  let contenedor = null;
  function sitio() {
    if (contenedor && contenedor.isConnected) return contenedor;
    contenedor = document.createElement('div'); contenedor.className = 'cv-dock'; contenedor.setAttribute('aria-live', 'polite');
    document.body.appendChild(contenedor);
    return contenedor;
  }
  function gira(fila, p, it, dur) {
    const cartas = [];
    for (let i = 0; i < TOTAL; i++) cartas.push(i === G ? it : aleatoria(p.pool));
    fila.innerHTML = `<div class="cv-strip"><div class="cv-track">${cartas.map(carta).join('')}</div><i class="cv-mark"></i></div>`;
    const tira = fila.firstElementChild, pista = tira.firstElementChild, k = pista.children[G], w = tira.clientWidth;
    if (!w || quieto()) { pista.style.transform = 'none'; k.classList.add('gana'); return Promise.resolve() }
    const dx = k.offsetLeft + k.offsetWidth / 2 - w / 2 + (Math.random() - 0.5) * k.offsetWidth * 0.5;
    return pista.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${-dx}px)` }], { duration: dur, easing: 'cubic-bezier(.08,.6,.12,1)', fill: 'forwards' }).finished.then(() => k.classList.add('gana'), () => k.classList.add('gana'));
  }
  function tarjeta(p) {
    const caja = sitio();
    while (caja.children.length >= MAX_TARJETAS) caja.firstElementChild.remove();
    const el = document.createElement('div');
    const filas = p.items.slice(0, MAX_FILAS);
    el.className = 'cv-card';
    el.innerHTML = `<p class="cv-h"><b>${esc(p.nombre)}</b> <span data-t>está abriendo</span> <em data-notr>${esc(p.caja)}</em><button type="button" class="cv-x" aria-label="Cerrar">×</button></p>
      ${filas.map(() => '<div class="cv-row"></div>').join('')}<p class="cv-res" hidden></p>`;
    caja.appendChild(el);
    if (window.GM_LANG) GM_LANG.traduce(el);
    el.querySelector('.cv-x').addEventListener('click', () => el.remove());
    const dur = 4200;
    Promise.all(filas.map((it, i) => gira(el.querySelectorAll('.cv-row')[i], p, it, dur + i * 260))).then(() => {
      if (!el.isConnected) return;
      const mejor = p.items.reduce((a, x) => (x.v > a.v ? x : a), p.items[0]), total = p.items.reduce((a, x) => a + x.v, 0), varias = p.items.length > 1;
      const res = el.querySelector('.cv-res');
      res.style.setProperty('--c', RAR[mejor.r][1]);
      res.innerHTML = `<span class="lab">${varias ? 'Se lleva' : esc(RAR[mejor.r][0])}</span> <b data-notr>${varias ? `${p.items.length} cosas` : esc(mejor.n)}</b> <span class="num">${N(varias ? total : mejor.v)}<span class="cn"></span></span>`;
      res.hidden = false;
      el.querySelector('[data-t]').textContent = 'ha abierto';
      if (window.GM_LANG) GM_LANG.traduce(el);
      window.dispatchEvent(new CustomEvent('gm:sonido', { detail: { tipo: 'caja-final', rareza: mejor.r, vol: 0.45 } }));
      setTimeout(() => { if (!el.isConnected) return; el.classList.add('sale'); setTimeout(() => el.remove(), 400) }, 6500);
    });
  }

  const css = document.createElement('style');
  css.textContent = `
.cv-dock{position:fixed;z-index:65;right:20px;bottom:20px;display:flex;flex-direction:column;gap:12px;width:min(500px,calc(100vw - 40px));pointer-events:none}
.cv-card{pointer-events:auto;padding:14px 16px 14px;border-radius:22px;background:var(--bg2);box-shadow:0 18px 50px rgba(0,0,0,.55);animation:cv-in .35s var(--ease);transition:opacity .35s,transform .35s}
.cv-card.sale{opacity:0;transform:translateY(10px)}
.cv-h{display:flex;align-items:baseline;gap:6px;margin-bottom:10px;font:500 13px var(--sans);color:var(--mute);white-space:nowrap}
.cv-h b{font:700 14px var(--sans);color:var(--ink)}
.cv-h em{font-style:normal;color:var(--soft);overflow:hidden;text-overflow:ellipsis}
.cv-x{margin-left:auto;flex:none;width:24px;height:24px;border-radius:50%;font:400 18px/1 var(--sans);text-align:center;color:var(--dim)}
.cv-x:hover{color:var(--ink);background:rgba(255,255,255,.06)}
.cv-row+.cv-row{margin-top:8px}
.cv-strip{position:relative;height:92px;overflow:hidden;border-radius:16px;background:var(--bg);
  -webkit-mask-image:linear-gradient(90deg,transparent,#000 9%,#000 91%,transparent);mask-image:linear-gradient(90deg,transparent,#000 9%,#000 91%,transparent)}
.cv-track{position:relative;display:flex;gap:8px;height:100%;padding:8px 0;will-change:transform}
.cv-k{position:relative;flex:none;display:grid;place-items:center;width:84px;height:100%;border-radius:11px;
  background:linear-gradient(180deg,rgba(255,255,255,.015) 30%,color-mix(in srgb,var(--c) 24%,transparent));box-shadow:inset 0 -3px 0 var(--c);transition:transform .35s var(--ease),box-shadow .35s}
.cv-k img{width:84%;height:74%;object-fit:contain;filter:drop-shadow(0 6px 8px rgba(0,0,0,.5))}
.cv-k.esp{--c:#e4ae39;background:radial-gradient(closest-side,rgba(228,174,57,.38),transparent)}
.cv-k.esp span{font:800 38px/1 var(--disp);color:#ffd77a;text-shadow:0 0 20px rgba(228,174,57,.75)}
.cv-k.gana{z-index:1;transform:scale(1.07);box-shadow:inset 0 -3px 0 var(--c),0 0 0 2px var(--c),0 0 24px color-mix(in srgb,var(--c) 55%,transparent)}
.cv-mark{position:absolute;left:50%;top:0;bottom:0;width:2px;margin-left:-1px;background:var(--acc);box-shadow:0 0 12px rgba(242,193,78,.9);pointer-events:none}
.cv-res{display:flex;align-items:baseline;gap:8px;margin-top:12px;font:500 13px var(--sans);color:var(--soft);animation:cv-in .3s var(--ease)}
.cv-res[hidden]{display:none}
.cv-res .lab{color:var(--c)}
.cv-res b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:700 15px var(--sans);color:var(--ink)}
.cv-res .num{margin-left:auto;flex:none;display:inline-flex;align-items:center;font:500 16px var(--mono);color:var(--acc)}
@keyframes cv-in{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@media (max-width:860px){.cv-dock{right:12px;left:12px;width:auto;bottom:calc(64px + env(safe-area-inset-bottom,0px) + 12px)}.cv-strip{height:76px}.cv-k{width:68px}}
html.sin-anim .cv-card,html.sin-anim .cv-res{animation:none}`;
  document.head.appendChild(css);

  window.GM_CAJAS_VIVO = { recibe, estado: () => ({ canal: !!canal }) };
})();
