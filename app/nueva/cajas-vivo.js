// Cajas en directo: cuando alguien abre una caja, los demas que estan en la pantalla Cajas ven su ruleta girar y lo que le sale.
// Va por Supabase Realtime (broadcast, canal 'cajas-vivo'): no toca la base ni guarda nada.
// Dos cosas de cajas.js (las dos marcadas "// en directo"):
//   gm:cajas-montada  { db, me }  al montar la pantalla Cajas: de aqui sale el cliente de Supabase que ya usa la app.
//   gm:caja-abierta   { quien, nombre, caja, cajaNombre, items:[{n,r,i,l,v,t?,tp?}], pool:[{r,i,l}] }  al abrir una caja (r rareza, i imagen, l lujo, v valor).
//   Con ticket (db/081): t = 'oro' o 'diamante' y tp = lo que pasa por la tira al volver a girar. Esa fila para en el ticket, espera y vuelve
//   a girar sola hasta lo que ha salido (como en la pantalla de quien abre); las demas filas no se tocan.
// La tira se pinta fuera de la pantalla Cajas (en el body), asi que aunque la app repinte no se pierde.
// Todo lo que llega por la red se trata como no fiable: texto escapado, imagenes solo de dos sitios, rarezas de una lista.
'use strict';
(function () {
  const CANAL = 'cajas-vivo', G = 46, TOTAL = 54, MAX_FILAS = 3, MAX_TARJETAS = 3;
  const TK = { oro: ['Ticket Dorado', '#f5c542'], diamante: ['Ticket de Diamante', '#7fe3ff'] };
  const RAR = { esp: ['Especial', '#e4ae39'], cov: ['Encubierto', '#eb4b4b'], cla: ['Clasificado', '#d32ce6'], res: ['Restringido', '#8847ff'], mil: ['Grado militar', '#4b69ff'] };
  const RAR_EN = { esp: 'Special', cov: 'Covert', cla: 'Classified', res: 'Restricted', mil: 'Mil-Spec' };
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
    const items = (Array.isArray(p.items) ? p.items : []).slice(0, 10).map((x) => ({ ...it(x), n: corta(x && x.n, 80), v: Math.max(0, Math.min(1e9, +(x && x.v) || 0)),
      t: x && TK[x.t] ? x.t : null, tp: (Array.isArray(x && x.tp) ? x.tp : []).slice(0, 20).map(it) }));
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
  // el ticket: el mismo billete que en cajas.js (estrella el Dorado, gema el de Diamante)
  const sello = (t) => (t === 'diamante' ? '<path class="tk-g" d="M61 31l7-9h14l7 9-14 22z"/><path class="tk-l" d="M61 31h28M68 22l4 9 3 22M82 22l-4 9-3 22"/>'
    : '<path class="tk-g" d="M75 20l4.1 11.3 12.1.4-9.5 7.4 3.3 11.6L75 44l-10 6.7 3.3-11.6-9.5-7.4 12.1-.4z"/>');
  const ticket = (t) => `<div class="cv-k tk tk-${t}" style="--c:${TK[t][1]};--tk:${TK[t][1]}" title="${TK[t][0]}"><svg class="tk-svg" viewBox="0 0 120 76" aria-hidden="true"><path class="tk-b" d="M8 6h104a4 4 0 0 1 4 4v16a12 12 0 0 0 0 24v16a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V50a12 12 0 0 0 0-24V10a4 4 0 0 1 4-4z"/><path class="tk-s" d="M10 12h100v14H10z"/><path class="tk-d" d="M34 12v52"/>${sello(t)}</svg></div>`;
  const carta = (x) => (x.tk ? ticket(x.tk) : x.r === 'esp' && !x.l ? '<div class="cv-k esp"><span>★</span></div>' : `<div class="cv-k" style="--c:${RAR[x.r][1]}">${x.i ? `<img src="${esc(x.i)}" alt="" decoding="async">` : ''}</div>`);
  const aleatoria = (pool) => pool[(Math.random() * pool.length) | 0];
  let contenedor = null;
  function sitio() {
    if (contenedor && contenedor.isConnected) return contenedor;
    contenedor = document.createElement('div'); contenedor.className = 'cv-dock'; contenedor.setAttribute('aria-live', 'polite');
    document.body.appendChild(contenedor);
    return contenedor;
  }
  // una vuelta de la tira: de la carta 'desde' (0: el principio) a la G, con desvio (sin desvio si para en un ticket)
  function vuelta(fila, cartas, dur, desde, desvio, q) {
    fila.innerHTML = `<div class="cv-strip ${fila.dataset.tk ? 'tk-on tk-' + fila.dataset.tk : ''}"><div class="cv-track">${cartas.map(carta).join('')}</div><i class="cv-mark"></i></div>`;
    const tira = fila.firstElementChild, pista = tira.firstElementChild, k = pista.children[G], k0 = pista.children[desde], w = tira.clientWidth;
    if (!w || q || quieto()) { pista.style.transform = `translateX(${-(k.offsetLeft + k.offsetWidth / 2 - w / 2)}px)`; k.classList.add('gana'); return Promise.resolve() }
    const x0 = desde ? k0.offsetLeft + k0.offsetWidth / 2 - w / 2 : 0, dx = k.offsetLeft + k.offsetWidth / 2 - w / 2 + (desvio ? (Math.random() - 0.5) * k.offsetWidth * 0.5 : 0);
    return pista.animate([{ transform: `translateX(${-x0}px)` }, { transform: `translateX(${-dx}px)` }], { duration: dur, easing: 'cubic-bezier(.08,.6,.12,1)', fill: 'forwards' }).finished.then(() => k.classList.add('gana'), () => k.classList.add('gana'));
  }
  // q: sin giro (quien llega tarde a mirar ve ya donde paro)
  async function gira(fila, p, it, dur, q) {
    if (!it.t) return vuelta(fila, Array.from({ length: TOTAL }, (_, i) => (i === G ? it : aleatoria(p.pool))), dur, 0, true, q);
    // con ticket: para en el ticket, espera y vuelve a girar solo esta fila con lo de su monton
    fila.dataset.tk = it.t;
    if (!q) {
      await vuelta(fila, Array.from({ length: TOTAL }, (_, i) => (i === G ? { tk: it.t } : aleatoria(p.pool))), dur, 0, false);
      if (!fila.isConnected) return;
      fila.firstElementChild.classList.add('tk-pop');
      await new Promise((ok) => setTimeout(ok, quieto() ? 0 : 900));
      if (!fila.isConnected) return;
    }
    const tp = it.tp && it.tp.length ? it.tp : p.pool;
    await vuelta(fila, Array.from({ length: TOTAL }, (_, i) => (i === G ? it : i === 3 ? { tk: it.t } : aleatoria(tp))), Math.round(dur * 0.7), 3, true, q);
  }
  // las tiras de una apertura dentro de 'host' (la tarjeta flotante o la pantalla de Ver de espectar.js): giran y al parar sale lo que se
  // lleva. Devuelve el mejor objeto (o nada si 'host' ya no esta). o = { filas, quieto, dur }
  function tiras(host, p, o) {
    const filas = p.items.slice(0, (o && o.filas) || MAX_FILAS), q = !!(o && o.quieto);
    host.innerHTML = `${filas.map(() => '<div class="cv-row"></div>').join('')}<p class="cv-res" hidden></p>`;
    const dur = (o && o.dur) || 4200;
    return Promise.all(filas.map((it, i) => gira(host.querySelectorAll('.cv-row')[i], p, it, dur + i * 260, q))).then(() => {
      if (!host.isConnected) return null;
      const mejor = p.items.reduce((a, x) => (x.v > a.v ? x : a), p.items[0]), total = p.items.reduce((a, x) => a + x.v, 0), varias = p.items.length > 1;
      const res = host.querySelector('.cv-res');
      res.style.setProperty('--c', RAR[mejor.r][1]);
      // ya en el idioma: dentro de la vista de Ver (espectar.js, data-notr) el traductor general no entra
      const ing = document.documentElement.lang === 'en';
      res.innerHTML = `<span class="lab">${varias ? (ing ? 'Takes' : 'Se lleva') : esc(ing ? RAR_EN[mejor.r] : RAR[mejor.r][0])}</span> <b data-notr>${varias ? (ing ? `${p.items.length} items` : `${p.items.length} cosas`) : esc(mejor.n)}</b> <span class="num">${N(varias ? total : mejor.v)}<span class="cn"></span></span>`;
      res.hidden = false;
      if (window.GM_LANG) GM_LANG.traduce(res);
      return mejor;
    });
  }
  // de quien es (id de jugador de app.js) para el boton Ver
  const clave = (uid) => { try { const f = F.find((x) => x.uid === uid); return f ? f.id : '' } catch { return '' } };
  function tarjeta(p) {
    const caja = sitio();
    while (caja.children.length >= MAX_TARJETAS) caja.firstElementChild.remove();
    const el = document.createElement('div');
    el.className = 'cv-card';
    // Ver (espectar.js, PM 05-11): abre la pantalla de mirar sus aperturas en directo; la tarjeta se va
    const k = window.GM_ESPECTAR ? clave(p.quien) : '';
    el.innerHTML = `<p class="cv-h"><b>${esc(p.nombre)}</b> <span data-t>está abriendo</span> <em data-notr>${esc(p.caja)}</em>${k ? `<button type="button" class="cv-ver" data-esp-ver="${esc(k)}">Ver</button>` : ''}<button type="button" class="cv-x" aria-label="Cerrar">×</button></p>
      <div class="cv-tiras"></div>`;
    caja.appendChild(el);
    if (window.GM_LANG) GM_LANG.traduce(el);
    el.querySelector('.cv-x').addEventListener('click', () => el.remove());
    tiras(el.querySelector('.cv-tiras'), p).then((mejor) => {
      if (!mejor || !el.isConnected) return;
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
.cv-ver{margin-left:auto;flex:none;height:26px;padding:0 12px;border-radius:999px;background:rgba(242,193,78,.14);font:700 12px/26px var(--sans);color:var(--acc)}
.cv-ver:hover{background:rgba(242,193,78,.24)}
.cv-ver+.cv-x{margin-left:4px}
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
.cv-k.tk{background:radial-gradient(closest-side,color-mix(in srgb,var(--tk) 30%,transparent),transparent);box-shadow:inset 0 -3px 0 var(--tk)}
.cv-k .tk-svg{width:82%;height:62%}
.cv-k .tk-b{fill:var(--tk)}.cv-k .tk-s{fill:rgba(255,255,255,.3)}.cv-k .tk-d{fill:none;stroke:rgba(0,0,0,.32);stroke-width:2;stroke-dasharray:4 4}
.cv-k.tk-oro .tk-g{fill:#7a4b00}.cv-k.tk-diamante .tk-g{fill:#0b3c66}.cv-k .tk-l{fill:none;stroke:rgba(255,255,255,.75);stroke-width:1.4}
.cv-strip.tk-on{box-shadow:inset 0 2px 0 color-mix(in srgb,var(--tk) 70%,transparent),inset 0 -2px 0 color-mix(in srgb,var(--tk) 70%,transparent)}
.cv-strip.tk-oro{--tk:#f5c542}.cv-strip.tk-diamante{--tk:#7fe3ff}
.cv-strip.tk-pop .cv-k.tk.gana{animation:cv-late .5s cubic-bezier(.2,.9,.3,1.4) both}
@keyframes cv-late{45%{transform:scale(1.16)}to{transform:scale(1.07)}}
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

  window.GM_CAJAS_VIVO = { recibe, estado: () => ({ canal: !!canal }), limpia, tiras, RAR };
})();
