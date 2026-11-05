// Menu A "Cinco botones y Más" (PM, 01-11, modelos/m1101/menu/a.html).
// - Monedero sale del menu: icono junto al engranaje de Ajustes (lo pinta app.js en la cabecera, .mo-btn).
// - 05-11: el chat general se quita (sin burbuja ni fila Chat). El Feed es una pantalla propia: fila en la hoja de Mas.
// - Movil: la barra de abajo lleva Inicio, Partidos, Apuestas, Todos y Más. Más abre una hoja con Liga, Cajas, Juegos y
//   Mercado y los avisos que antes eran pastillas arriba (Novedades, Recompensas, Resultados). "N en directo" va en una
//   tira bajo la cabecera y lleva a Directo.
// - PC: el menu lateral sigue (con Feed, sin Monedero) y las pastillas de arriba tambien.
// Va aparte, como inicio.js: usa lo global de app.js (S, M, SP, SCREENS, MERCADO_MANT, F,
// novSinVer, rwPend, IC_GIFT, IC_BELL, IC_NUEVO) y repinta lo suyo cada vez que app.js repinta la cabecera.
'use strict';
(function () {
  const g = (f, d) => { try { return f() } catch { return d } };
  const MAS = ['liga', 'cajas', 'juegos', 'mercado'];   // las de la hoja Más (en movil no caben en la barra)
  const ico = (p, cls) => `<svg viewBox="0 0 24 24"${cls ? ` class="${cls}"` : ''} aria-hidden="true">${p}</svg>`;
  const P_MAS = '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>';
  const P_IR = '<path d="M9.5 6l6 6-6 6"/>';
  const P_FEED = '<path d="M3.5 12h4l2.5-6.5 4 13 2.5-6.5h4"/>';
  const movil = () => matchMedia('(max-width:860px)').matches;
  const tr = (el) => { if (window.GM_LANG) GM_LANG.traduce(el) };
  const listo = () => { const a = document.getElementById('app'); return a && !a.hidden && g(() => typeof S === 'object' && Array.isArray(M) && F.length > 0, false) };
  let ABIERTA = false;

  // lo que espera en los avisos: novedades sin ver, recompensas por reclamar y resultados nuevos (la campanita de ganado.js)
  const avisos = () => {
    const nov = g(() => novSinVer(), 0);
    const rw = g(() => rwCuenta(), 0);   // lo mismo que el boton de arriba (con la paga del lunes, 04-11)
    const res = !!document.querySelector('#top .gnd-b.hay');
    return { nov, rw, res, hay: !!(nov || rw || res) };
  };

  /* ---------- boton Más de la barra de abajo (solo movil) ---------- */
  function masBoton(av) {
    const nav = document.getElementById('nav'); if (!nav) return;
    let b = nav.querySelector('.nv-mas');
    if (!b) { b = document.createElement('button'); b.type = 'button'; b.className = 'nv nv-mas'; b.dataset.mas = '1'; nav.appendChild(b) }
    const on = ABIERTA || MAS.includes(S.scr) || S.scr === 'novedades' || S.scr === 'feed', k = `${on}|${av.hay}|${g(() => GM_LANG.get(), '')}`;
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
    // Antes se montaba el HTML entero en cada repintado (con rwProximo(), ~2,5 ms) solo para descubrir que era igual. Ahora primero una
    // firma barata de lo que cambia la hoja; la cuenta atras de Recompensas solo se mira con la hoja abierta (al abrirla la firma cambia y se rehace).
    const c = h.querySelector('.mas-c'), px = ABIERTA && !av.rw ? g(() => rwProximo(), null) : null;
    const k0 = [S.scr, av.nov, av.rw, av.res, ABIERTA, g(() => MERCADO_MANT, false), px ? px.cuando + '/' + !!px.aprox : '', g(() => GM_LANG.get(), '')].join('|');
    if (c.dataset.k0 === k0 && c.firstElementChild) return;
    const tiles = MAS.map((k) => { const mant = k === 'mercado' && g(() => MERCADO_MANT, false);
      return `<button type="button" class="mas-t ${S.scr === k ? 'on' : ''} ${mant ? 'mas-mant' : ''}" data-scr="${k}">${ico(SCREENS[k][2])}<span>${SCREENS[k][0]}</span>${mant ? '<small title="mantenimiento"></small>' : ''}</button>` }).join('');
    const fila = (attr, ic, n, extra) => `<button type="button" class="mas-r" ${attr}><span class="mas-ri">${ic}</span><span class="mas-rn">${n}</span>${extra}${ico(P_IR, 'mas-ch')}</button>`;
    const html = `<h2 class="lab">Más secciones</h2><div class="mas-ts">${tiles}</div>
      <h2 class="lab">Avisos</h2><div class="mas-l">
        ${fila('data-scr="feed"', `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P_FEED}</svg>`, 'Feed', '')}
        ${fila('data-act="nvp"', IC_NUEVO, 'Novedades', av.nov ? `<b class="mas-bd az">${av.nov}</b>` : '')}
        ${fila('data-act="rw"', IC_GIFT, 'Recompensas', av.rw ? `<b class="mas-bd">${av.rw}</b>` : ((x) => (x ? `<i class="mas-cd" data-rwcd="${x.cuando}"${x.aprox ? '' : ' data-rwfin'}></i>` : ''))(px))}
        ${fila('data-mas-res', IC_BELL, 'Resultados', av.res ? '<b class="mas-bd ve">Nuevos</b>' : '')}
      </div>`;
    const k = html + g(() => GM_LANG.get(), '');
    c.dataset.k0 = k0;
    if (c.dataset.k !== k) { c.dataset.k = k; c.innerHTML = html; tr(h); g(() => rwTic()) }   // la cuenta atras de Recompensas se rellena sola cada segundo
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

  /* ---------- montaje ---------- */
  function pinta() {
    if (!listo()) return;
    if (ABIERTA && !movil()) { ABIERTA = false; document.body.classList.remove('mas-abierta') }
    const av = avisos();
    g(() => masBoton(av)); g(() => tira()); g(() => hoja(av));
  }
  let pend = false;
  const vigila = () => { if (pend) return; pend = true; queueMicrotask(() => { pend = false; try { pinta() } catch (e) { if (!vigila.av) { vigila.av = 1; console.warn('menu.js', e) } } }) };
  // app.js repinta la cabecera (y antes la barra) en cada render; la campanita de ganado.js cambia de clase sin render
  const top = document.getElementById('top');
  // la cuenta atras de la paga (<b data-cdpay>) cambia de texto cada segundo y no afecta al menu: esos cambios no cuentan
  const importa = (rs) => rs.some((r) => !(r.target.nodeType === 1 && r.target.closest('[data-cdpay]')));
  if (top) new MutationObserver((rs) => { if (importa(rs)) vigila() }).observe(top, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  const app = document.getElementById('app');
  if (app) new MutationObserver(vigila).observe(app, { attributes: true, attributeFilter: ['hidden'] });
  // la hoja va encima de la barra de abajo, que crece con el boleto y tus apuestas en vivo
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
  vigila();
  window.GM_MENU = { abre, pinta, pmVer };
})();
