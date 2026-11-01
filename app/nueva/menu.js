// Menu A "Cinco botones y Más" (PM, 01-11, modelos/m1101/menu/a.html).
// - Monedero sale del menu: icono junto al engranaje de Ajustes (lo pinta app.js en la cabecera, .mo-btn).
// - Chat sale del menu: burbuja abajo a la derecha con los no leidos; en PC, con la vista previa del ultimo mensaje.
// - Movil: la barra de abajo lleva Inicio, Partidos, Apuestas, Todos y Más. Más abre una hoja con Liga, Cajas, Juegos y
//   Mercado y los avisos que antes eran pastillas arriba (Novedades, Recompensas, Resultados). "N en directo" va en una
//   tira bajo la cabecera y lleva a Directo.
// - PC: el menu lateral sigue (sin Monedero ni Chat) y las pastillas de arriba tambien.
// Va aparte, como inicio.js: usa lo global de app.js (S, M, SP, SCREENS, MERCADO_MANT, CHAT, lastSeen, MEK, av, fr, esc,
// unread, novSinVer, rwPend, IC_GIFT, IC_BELL, IC_NUEVO) y repinta lo suyo cada vez que app.js repinta la cabecera.
'use strict';
(function () {
  const g = (f, d) => { try { return f() } catch { return d } };
  const MAS = ['liga', 'cajas', 'juegos', 'mercado'];   // las de la hoja Más (en movil no caben en la barra)
  const ico = (p, cls) => `<svg viewBox="0 0 24 24"${cls ? ` class="${cls}"` : ''} aria-hidden="true">${p}</svg>`;
  const P_MAS = '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>';
  const P_IR = '<path d="M9.5 6l6 6-6 6"/>';
  const P_CHAT = '<path d="M5 5h14a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 17h-8l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 5 5z"/>';
  const movil = () => matchMedia('(max-width:860px)').matches;
  const tr = (el) => { if (window.GM_LANG) GM_LANG.traduce(el) };
  const listo = () => { const a = document.getElementById('app'); return a && !a.hidden && g(() => typeof S === 'object' && Array.isArray(M) && F.length > 0, false) };
  let ABIERTA = false;

  // lo que espera en los avisos: novedades sin ver, recompensas por reclamar y resultados nuevos (la campanita de ganado.js)
  const avisos = () => {
    const nov = g(() => novSinVer(), 0);
    const rw = g(() => { const p = rwPend(); return [p.diario, p.rueda, p.rescate, p.bote].filter(Boolean).length + (p.tiempo || 0) }, 0);
    const res = !!document.querySelector('#top .gnd-b.hay');
    return { nov, rw, res, hay: !!(nov || rw || res) };
  };

  /* ---------- boton Más de la barra de abajo (solo movil) ---------- */
  function masBoton(av) {
    const nav = document.getElementById('nav'); if (!nav) return;
    let b = nav.querySelector('.nv-mas');
    if (!b) { b = document.createElement('button'); b.type = 'button'; b.className = 'nv nv-mas'; b.dataset.mas = '1'; nav.appendChild(b) }
    const on = ABIERTA || MAS.includes(S.scr) || S.scr === 'novedades', k = `${on}|${av.hay}|${g(() => GM_LANG.get(), '')}`;
    if (b.dataset.k === k) return;
    b.dataset.k = k;
    b.classList.toggle('on', on);
    b.setAttribute('aria-expanded', String(ABIERTA));
    b.innerHTML = `${ico(P_MAS)}<span class="nl">Más</span><span class="ns">Más</span>${av.hay ? '<i class="nv-pt"></i>' : ''}`;
    tr(b);
  }

  /* ---------- la hoja de Más ---------- */
  function hoja(av) {
    let h = document.getElementById('mas-h');
    if (!h) {
      h = document.createElement('div'); h.id = 'mas-h';
      h.innerHTML = '<div class="mas-fondo" data-mas-x></div><section class="mas-s" role="dialog" aria-label="Más secciones"><div class="mas-grab"></div><div class="mas-c"></div></section>';
      document.body.appendChild(h);
    }
    h.classList.toggle('abre', ABIERTA);
    h.setAttribute('aria-hidden', String(!ABIERTA));
    const tiles = MAS.map((k) => { const mant = k === 'mercado' && g(() => MERCADO_MANT, false);
      return `<button type="button" class="mas-t ${S.scr === k ? 'on' : ''} ${mant ? 'mas-mant' : ''}" data-scr="${k}">${ico(SCREENS[k][2])}<span>${SCREENS[k][0]}</span>${mant ? '<small title="mantenimiento"></small>' : ''}</button>` }).join('');
    const fila = (attr, ic, n, extra) => `<button type="button" class="mas-r" ${attr}><span class="mas-ri">${ic}</span><span class="mas-rn">${n}</span>${extra}${ico(P_IR, 'mas-ch')}</button>`;
    const html = `<h2 class="lab">Más secciones</h2><div class="mas-ts">${tiles}</div>
      <h2 class="lab">Avisos</h2><div class="mas-l">
        ${fila('data-act="nvp"', IC_NUEVO, 'Novedades', av.nov ? `<b class="mas-bd az">${av.nov}</b>` : '')}
        ${fila('data-act="rw"', IC_GIFT, 'Recompensas', av.rw ? `<b class="mas-bd">${av.rw}</b>` : '')}
        ${fila('data-mas-res', IC_BELL, 'Resultados', av.res ? '<b class="mas-bd ve">Nuevos</b>' : '')}
      </div>`;
    const c = h.querySelector('.mas-c'), k = html + g(() => GM_LANG.get(), '');
    if (c.dataset.k !== k) { c.dataset.k = k; c.innerHTML = html; tr(h) }
  }
  function abre(v) {
    ABIERTA = !!v && movil();
    document.body.classList.toggle('mas-abierta', ABIERTA);
    pinta();
  }

  /* ---------- tira "N en directo" bajo la cabecera (solo movil) ---------- */
  function tira() {
    const top = document.getElementById('top'); if (!top) return;
    let el = document.getElementById('livebar');
    if (!el) { el = document.createElement('button'); el.type = 'button'; el.id = 'livebar'; el.dataset.scr = 'directo'; top.after(el) }
    const ls = M.filter((m) => m.live), sp = [...new Set(ls.map((m) => m.s))].map((s) => `<em>${esc(SP[s]?.[0] || '')}</em>`).join(' · ');
    const ver = ls.length > 0 && S.scr !== 'directo';
    el.hidden = !ver;
    if (!ver) return;
    const html = `<i></i><b>${ls.length} en directo</b><span>${sp}</span>${ico(P_IR)}`, k = html + g(() => GM_LANG.get(), '');
    if (el.dataset.k !== k) { el.dataset.k = k; el.innerHTML = html; tr(el) }
  }

  /* ---------- burbuja del chat ---------- */
  const resumen = (c) => (c.txt ? [c.txt, true] : c.img ? ['Foto', false] : c.aud ? ['Nota de voz', false] : c.bet ? ['Apuesta', false] : c.poll ? ['Encuesta', false] : ['', false]);
  function burbuja() {
    let el = document.getElementById('chatb');
    if (!el) { el = document.createElement('div'); el.id = 'chatb'; document.body.appendChild(el) }
    const ver = S.scr !== 'chat';
    document.body.classList.toggle('chb-on', ver);
    el.hidden = !ver;
    if (!ver) return;
    const un = g(() => unread(), 0);
    const ult = un ? CHAT.filter((c) => c.id > lastSeen && c.k && c.k !== MEK).sort((a, b) => b.id - a.id)[0] : null;
    let teaser = '';
    if (ult) {
      const [txt, suyo] = resumen(ult), a = av(ult.k).replace(/ data-prof="[^"]*"/, '').replace(/ title="[^"]*"/, '');
      teaser = `<button type="button" class="chb-t" data-scr="chat" tabindex="-1">${a}<span><b data-notr>${esc(fr(ult.k).n)}</b><small${suyo ? ' data-notr' : ''}>${esc(txt.length > 90 ? txt.slice(0, 88) + '…' : txt)}</small></span></button>`;
    }
    const html = `${teaser}<button type="button" class="chb-b" data-scr="chat" aria-label="Abrir el chat" title="Chat">${ico(P_CHAT)}${un ? `<b>${un > 99 ? '99+' : un}</b>` : ''}</button>`, k = html + g(() => GM_LANG.get(), '');
    if (el.dataset.k !== k) { el.dataset.k = k; el.innerHTML = html; tr(el) }
  }

  /* ---------- montaje ---------- */
  function pinta() {
    if (!listo()) { const c = document.getElementById('chatb'); if (c) c.hidden = true; document.body.classList.remove('chb-on'); return }
    if (ABIERTA && !movil()) { ABIERTA = false; document.body.classList.remove('mas-abierta') }
    const av = avisos();
    g(() => masBoton(av)); g(() => tira()); g(() => burbuja()); g(() => hoja(av));
  }
  let pend = false;
  const vigila = () => { if (pend) return; pend = true; queueMicrotask(() => { pend = false; try { pinta() } catch (e) { if (!vigila.av) { vigila.av = 1; console.warn('menu.js', e) } } }) };
  // app.js repinta la cabecera (y antes la barra) en cada render; la campanita de ganado.js cambia de clase sin render
  const top = document.getElementById('top');
  if (top) new MutationObserver(vigila).observe(top, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  const app = document.getElementById('app');
  if (app) new MutationObserver(vigila).observe(app, { attributes: true, attributeFilter: ['hidden'] });
  // la burbuja y la hoja van encima de la barra de abajo, que crece con el boleto y tus apuestas en vivo
  const rail = document.querySelector('#app .rail');
  const alto = () => { if (rail) document.documentElement.style.setProperty('--rail-h', (movil() ? rail.offsetHeight : 0) + 'px') };
  if (rail && window.ResizeObserver) new ResizeObserver(alto).observe(rail);
  addEventListener('resize', () => { alto(); vigila() });
  alto();

  // clics: el boton Más abre y cierra; cualquier otra cosa fuera de la hoja la cierra (y sigue haciendo lo suyo)
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-mas]')) { e.stopPropagation(); return abre(!ABIERTA) }
    if (t.closest('[data-mas-res]')) { e.stopPropagation(); abre(false); if (window.GM_GANADO) GM_GANADO.abre(); return }
    if (!ABIERTA) return;
    if (t.closest('[data-mas-x]')) { e.stopPropagation(); return abre(false) }
    if (!t.closest('.mas-s') || t.closest('[data-scr],[data-act]')) abre(false);
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (ABIERTA) abre(false);
    if (g(() => S.pmenu, false)) { S.pmenu = false; render() }   // el menu del titulo de Partidos (Ya jugados B)
  });
  // Ya jugados B: al abrir el menu del titulo de Partidos, que entre con su animacion y se vea entero (en movil el titulo
  // suele quedar abajo, debajo del directo y los destacados): se sube lo justo
  function pmVer() {
    const hd = document.querySelector('.pm-hd'), mn = hd && hd.querySelector('.pm-menu'); if (!mn) return;
    hd.classList.add('anima');
    const r = mn.getBoundingClientRect(), rail = document.querySelector('#app .rail');
    const fondo = movil() && rail ? rail.getBoundingClientRect().top : innerHeight, falta = r.bottom + 14 - fondo;
    if (falta <= 0) return;
    const pb = hd.closest('[data-keep=pb]'), sc = pb && pb.scrollHeight > pb.clientHeight + 1 ? pb : document.getElementById('view');
    sc.scrollBy({ top: Math.min(falta, hd.getBoundingClientRect().top - (sc.getBoundingClientRect().top + 8)), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  // Detalles (01-11): en movil la burbuja tapaba la columna de cuotas al bajar por Partidos. Al bajar se encoge a una lengueta
  // pegada al borde (con su numero de no leidos) y vuelve al subir, al llegar arriba o al cambiar de pantalla
  const ult = new WeakMap(); let bajado = 0, pantalla = '';
  const encoge = (v) => { const h = document.body.classList; if (h.contains('chb-min') !== v) h.toggle('chb-min', v) };
  document.addEventListener('scroll', (e) => {
    if (!movil()) return encoge(false);
    const el = e.target, t = el && el.scrollTop; if (typeof t !== 'number' || !(el.id === 'view' || (el.dataset && el.dataset.keep))) return;
    const a = ult.get(el) ?? t, d = t - a; ult.set(el, t);
    if (t < 24 || d < -10) { bajado = 0; return encoge(false) }
    if (d > 0) { bajado += d; if (bajado > 60) encoge(true) }
  }, true);
  const vigilaPantalla = () => { const s = g(() => S.scr, ''); if (s !== pantalla) { pantalla = s; bajado = 0; encoge(false) } };
  new MutationObserver(vigilaPantalla).observe(document.getElementById('view') || document.body, { childList: true });
  vigila();
  window.GM_MENU = { abre, pinta, pmVer };
})();
