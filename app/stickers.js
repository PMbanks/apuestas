// Stickers en el chat. Un boton junto a la caja de escribir abre una bandeja; al tocar uno se manda un mensaje normal
// con el cuerpo "[sticker:loser]" (nada nuevo en la base: sale por el mismo camino que cualquier mensaje) y todos los
// mensajes con ese formato se pintan como un sticker grande en vez de texto.
// Va aparte de app.js: se cuelga de la caja del chat (.ch-in) y vuelve a colgarse solo cuando la app repinta, igual que vivo.js.
// Ojo: [data-msg] tambien lo usan los juegos (un <p>), por eso aqui se busca siempre ".ch-in input[data-msg]".
// Para sumar un sticker nuevo basta con una linea en LISTA y otra en el CSS de abajo (colores y giro).
'use strict';
(function () {
  // id, texto, color, color del borde inferior, giro
  const LISTA = [
    ['loser', 'LOSER', '#ff5a6a', '#a3202f', -6], ['bot', 'BOT', '#6a9cf0', '#1d4a99', 4], ['manco', 'MANCO', '#b58cff', '#5a37a8', -3],
    ['ez', 'EZ', '#2bd47d', '#0f7a45', 5], ['gg', 'GG', '#f2c14e', '#a8761b', -4], ['allin', 'ALL IN', '#ffb020', '#b0560a', 3],
    ['rip', 'RIP', '#c2c9d3', '#626b77', -5], ['crack', 'CRACK', '#4de0ff', '#1380a0', 6], ['llora', 'LLORA', '#7cc0ff', '#2a64a8', -4],
    ['suerte', 'SUERTE', '#b6dc4a', '#55701a', 4],
  ];
  const POR_ID = new Map(LISTA.map((s) => [s[0], s]));
  const FORMATO = /^\[sticker:([a-z0-9]{1,12})\]$/;
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sticker = (s) => `<span class="st" style="--c:${s[2]};--c2:${s[3]};--r:${s[4]}deg" data-notr>${esc(s[1])}</span>`;

  /* ---------- los mensajes con formato de sticker se pintan grandes ---------- */
  function pintaMensajes() {
    for (const p of document.querySelectorAll('.msg p')) {
      const m = FORMATO.exec(p.textContent.trim()), s = m && POR_ID.get(m[1]);
      if (!s) continue;
      const w = document.createElement('div');
      w.className = 'stk-m'; w.setAttribute('data-notr', ''); w.dataset.sticker = s[0]; w.setAttribute('role', 'img'); w.setAttribute('aria-label', 'Sticker ' + s[1]);
      w.innerHTML = sticker(s);
      p.replaceWith(w);
    }
  }

  /* ---------- el boton y la bandeja ---------- */
  const ICONO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v6.5L13.5 20H7a3 3 0 0 1-3-3z"/><path d="M20 13.5h-4.5a2 2 0 0 0-2 2V20"/><path d="M9 10h.01M15 10h.01M9.2 14.2a3.2 3.2 0 0 0 3 1.3"/></svg>';
  let bandeja = null, abierto = false;
  function cuelga() {
    for (const caja of document.querySelectorAll('.ch-in')) {
      if (caja.querySelector('.stk-b')) continue;
      const entrada = caja.querySelector('input[data-msg]'); if (!entrada) continue;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'ic stk-b'; b.setAttribute('aria-label', 'Mandar un sticker'); b.title = 'Mandar un sticker'; b.innerHTML = ICONO;
      if (abierto) b.classList.add('on');
      entrada.before(b);
      if (window.GM_LANG) GM_LANG.traduce(b);
    }
  }
  function cierra() { if (bandeja) { bandeja.remove(); bandeja = null } abierto = false; document.querySelector('.stk-b')?.classList.remove('on') }
  function abre(boton) {
    cierra(); abierto = true; boton.classList.add('on');
    bandeja = document.createElement('div');
    bandeja.className = 'stk-p'; bandeja.setAttribute('role', 'dialog'); bandeja.setAttribute('aria-label', 'Stickers');
    bandeja.innerHTML = `<span class="lab">Stickers</span><div class="stk-g">${LISTA.map((s) => `<button type="button" class="stk-i" data-stk="${s[0]}" aria-label="${esc(s[1])}">${sticker(s)}</button>`).join('')}</div>`;
    document.body.appendChild(bandeja);
    if (window.GM_LANG) GM_LANG.traduce(bandeja);
    const r = boton.getBoundingClientRect(), w = bandeja.offsetWidth;
    bandeja.style.left = Math.max(12, Math.min(r.left - 8, innerWidth - w - 12)) + 'px';
    bandeja.style.bottom = Math.max(12, innerHeight - r.top + 10) + 'px';
  }

  /* ---------- mandar ---------- */
  // el borrador de la caja se guarda, se manda el sticker por el boton normal de enviar (mismo camino que un mensaje) y se devuelve
  function manda(id) {
    const entrada = document.querySelector('.ch-in input[data-msg]'), enviar = document.querySelector('.ch-in [data-act="send"]');
    if (!entrada || !enviar || !POR_ID.has(id)) return;
    const borrador = entrada.value, texto = `[sticker:${id}]`;
    entrada.value = texto;
    enviar.click();
    window.dispatchEvent(new CustomEvent('gm:sonido', { detail: 'sticker' }));
    if (!borrador) return;
    let n = 0;
    const t = setInterval(() => {
      const i = document.querySelector('.ch-in input[data-msg]'); n++;
      if (i && (i.value === '' || (n > 26 && i.value === texto))) { i.value = borrador; clearInterval(t) }      // enviado, o fallado y a los 4 s
      else if (n > 40) clearInterval(t);
    }, 150);
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('.stk-b'), i = e.target.closest('.stk-i');
    if (i) { const id = i.dataset.stk; cierra(); manda(id); return }
    if (b) { abierto && bandeja ? cierra() : abre(b); return }
    if (bandeja && !e.target.closest('.stk-p')) cierra();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && bandeja) cierra() });
  window.addEventListener('resize', () => { if (bandeja) cierra() });

  /* ---------- se vuelve a colgar cuando la app repinta ---------- */
  let programado = false;
  function revisa() { programado = false; cuelga(); pintaMensajes(); if (bandeja && !document.querySelector('.ch-in')) cierra() }
  new MutationObserver((rs) => {
    if (programado) return;
    for (const r of rs) for (const n of r.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.classList.contains('stk-b') || n.classList.contains('stk-m') || n.classList.contains('stk-p')) continue;       // lo nuestro no vuelve a despertar el observador
      if (n.matches('.ch-in, .msg, .ch-list, .chat, .c-wrap') || n.querySelector('.ch-in, .msg')) { programado = true; requestAnimationFrame(revisa); return }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  const css = document.createElement('style');
  css.textContent = `
.st{display:inline-block;font:900 var(--fs,48px)/1 var(--disp);letter-spacing:.015em;white-space:nowrap;color:var(--c);transform:rotate(var(--r,0deg));user-select:none;-webkit-user-select:none;
  text-shadow:4px 0 #fff,-4px 0 #fff,0 4px #fff,0 -4px #fff,3px 3px #fff,-3px 3px #fff,3px -3px #fff,-3px -3px #fff,4px 2px #fff,-4px 2px #fff,4px -2px #fff,-4px -2px #fff,2px 4px #fff,-2px 4px #fff,2px -4px #fff,-2px -4px #fff,0 7px 0 var(--c2),3px 7px 0 var(--c2),-3px 7px 0 var(--c2);
  filter:drop-shadow(0 6px 9px rgba(0,0,0,.4));transition:transform .2s var(--ease)}
.stk-m{padding:10px 8px 16px}
.stk-m .st{--fs:clamp(38px,7vw,58px)}
.stk-m:hover .st{transform:rotate(calc(var(--r) * -.6)) scale(1.05)}
.stk-b.on{color:var(--acc)}
.stk-p{position:fixed;z-index:70;width:min(540px,calc(100vw - 24px));padding:14px 14px 10px;border-radius:20px;background:var(--bg2);box-shadow:0 18px 50px rgba(0,0,0,.55);animation:stk-in .18s var(--ease)}
.stk-p .lab{display:block;margin:2px 4px 6px}
.stk-g{display:grid;grid-template-columns:repeat(auto-fill,minmax(98px,1fr));gap:2px 6px}
.stk-i{display:grid;place-items:center;min-height:68px;padding:6px 2px;border-radius:14px;transition:background .15s}
.stk-i:hover,.stk-i:focus-visible{background:rgba(255,255,255,.06)}
.stk-i .st{--fs:21px;text-shadow:3px 0 #fff,-3px 0 #fff,0 3px #fff,0 -3px #fff,2px 2px #fff,-2px 2px #fff,2px -2px #fff,-2px -2px #fff,0 5px 0 var(--c2)}
.stk-i:hover .st{transform:rotate(calc(var(--r) * -.6)) scale(1.1)}
@keyframes stk-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
html.sin-anim .stk-p{animation:none}html.sin-anim .st{transition:none}`;
  document.head.appendChild(css);

  window.GM_STICKERS = { lista: LISTA.map((s) => s[0]), manda };
  cuelga(); pintaMensajes();
})();
