// Moneda que se ve, en Ajustes. PM, 30-10: "V-Bucks se podran cambiar por dolares, Solana y Robux en settings" y "el logo de
// V-Bucks cambia si has seleccionado dolares u otra cosa". Elegido por PM: mismo numero, otro logo (4.000 V-Bucks se ven 4.000 $).
// Solo cambia lo que se ve, en este aparato: la base sigue en V-Bucks y nadie mas lo nota.
//   - El logo: html[data-moneda] cambia el fondo de .cn (app.css) y aqui, las <img> y <image> que usan vbucks.webp.
//   - El nombre: "V-Bucks" en el texto y en title/aria-label/placeholder. Va en el siguiente frame (requestAnimationFrame),
//     despues de que i18n.js traduzca, para que sus frases con "V-Bucks" sigan casando. Lo que escribe la gente
//     (.msg p, inputs) y lo marcado con data-nomon (las opciones de Ajustes) no se toca.
'use strict';
(function () {
  const BASE = (document.querySelector('link[rel="icon"]')?.getAttribute('href') || 'img/icon-192.png').replace(/icon-192\.png$/, '');
  // clave: [nombre en una frase (es, en), nombre en la lista (es, en), logo]
  const M = {
    vbucks: [['V-Bucks', 'V-Bucks'], ['V-Bucks', 'V-Bucks'], BASE + 'vbucks.webp'],
    usd: [['dólares', 'dollars'], ['Dólares', 'Dollars'], BASE + 'monedas/usd.svg'],
    sol: [['Solana', 'Solana'], ['Solana', 'Solana'], BASE + 'monedas/sol.svg'],
    robux: [['Robux', 'Robux'], ['Robux', 'Robux'], BASE + 'monedas/robux.svg'],
  };
  let cur = 'vbucks';
  try { const v = localStorage.getItem('gm-moneda'); if (M[v]) cur = v; } catch (e) {}
  document.documentElement.dataset.moneda = cur;
  const en = () => (window.GM_LANG && GM_LANG.get() === 'en' ? 1 : 0);
  const nombre = () => M[cur][0][en()];

  const ORIG = new WeakMap();          // nodo de texto -> [texto con "V-Bucks", texto que le pusimos]
  const NO = '.msg p, textarea, input, [data-nomon]';
  function texto(n) {
    if (n.parentElement && n.parentElement.closest(NO)) return;
    const v = n.nodeValue, o = ORIG.get(n);
    if (o && v === o[1]) return;                                  // ya cambiado
    if (!v.includes('V-Bucks')) return;
    const x = v.replace(/V-Bucks/g, nombre());
    ORIG.set(n, [v, x]); n.nodeValue = x;
  }
  function logos(root) {
    for (const e of root.querySelectorAll('img, image')) {
      if (e.closest('[data-nomon]')) continue;
      const a = e.tagName.toLowerCase() === 'img' ? 'src' : 'href', v = e.getAttribute(a) || '';
      if (/vbucks\.webp$/.test(v)) e.dataset.vb = '1';
      if (e.dataset.vb && v !== M[cur][2]) e.setAttribute(a, M[cur][2]);
    }
  }
  function repasa(root) {
    if (!root) return;
    if (root.nodeType === 3) { if (cur !== 'vbucks') texto(root); return }
    if (root.nodeType !== 1) return;
    logos(root);
    if (cur !== 'vbucks') {
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) texto(w.currentNode);
      for (const e of root.querySelectorAll('[title],[aria-label],[placeholder]')) {
        if (e.closest('[data-nomon]')) continue;
        for (const a of ['title', 'aria-label', 'placeholder']) { const v = e.getAttribute(a); if (v && v.includes('V-Bucks')) e.setAttribute(a, v.replace(/V-Bucks/g, nombre())); }
      }
    }
  }

  // lo que se anade o cambia se repasa en el siguiente frame, todo junto
  let cola = new Set(), pedido = false;
  function pide(n) { cola.add(n); if (!pedido) { pedido = true; requestAnimationFrame(() => { pedido = false; const c = cola; cola = new Set(); for (const x of c) if (x.isConnected) repasa(x) }) } }
  new MutationObserver((rs) => {
    for (const r of rs) {
      if (r.type === 'characterData') { if (cur !== 'vbucks') pide(r.target); continue }
      for (const n of r.addedNodes) pide(n);
    }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  function set(k) {
    if (!M[k] || k === cur) return;
    cur = k; document.documentElement.dataset.moneda = k;
    try { localStorage.setItem('gm-moneda', k); } catch (e) {}
    // lo que ya estaba cambiado vuelve a su "V-Bucks" y se cambia otra vez con el nombre nuevo
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) { const n = w.currentNode, o = ORIG.get(n); if (o && n.nodeValue === o[1]) { n.nodeValue = o[0]; ORIG.delete(n); } }
    repasa(document.body);
  }
  window.GM_MONEDA = { get: () => cur, set, nombre, lista: () => Object.entries(M).map(([k, v]) => [k, v[1][en()], v[2]]) };
  if (document.body) repasa(document.body);
})();
