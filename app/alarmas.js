// Alarmas (PM, 02-11: "que se pueda poner alarmas en nuestro bets").
// Una campana en la ficha de cada partido y en cada boleto de Mis apuestas: Avisarme 5, 15, 30 o 60 minutos antes de que empiece,
// o cuando empiece (el partido de mi apuesta). Las alarmas viven en este aparato (localStorage 'gm-alarmas:<jugador>'), se ven y se
// borran en Ajustes > Mis alarmas, y suenan MIENTRAS LA APP ESTE ABIERTA: Notification del navegador (el permiso se pide solo al
// poner la primera alarma) o, si no hay permiso, un aviso dentro de la app. Con la app cerrada no avisa (eso sera web push, aparte).
// Sin temporizadores permanentes: un setTimeout exacto para la proxima alarma y, solo si hay alguna y la pantalla se ve, una
// comprobacion cada 30 s por si el equipo durmio o el reloj se movio. Sin alarmas no hay ni uno ni otro.
// Va aparte, como ocultas.js: se engancha al DOM con un MutationObserver y usa lo global de app.js (ME, byId, isOpen, S, render, WD DD MO HM).
'use strict';
(function () {
  const g = (f, d) => { try { return f() } catch { return d } };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tr = (el) => { if (window.GM_LANG) GM_LANG.traduce(el) };
  const OPC = [5, 15, 30, 60, 0];            // minutos antes; 0 = cuando empiece
  const MAXA = 40, TICK = 30000, MAXT = 2147000000, TARDE = 120000;
  const BELL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.6 2.2H4.4zM10 20.5a2.2 2.2 0 0 0 4 0"/></svg>';

  let LST = [], KEY = '', tNext = 0, iv = 0, pendiente = false, P = null;   // P = { id, ap } mientras el menu esta abierto

  /* ---------- guardado (localStorage, con try/catch: puede estar bloqueado) ---------- */
  const clave = () => 'gm-alarmas:' + (g(() => ME, '') || '');
  const id = (a) => a.m + '|' + a.min;
  const fire = (a) => a.at - a.min * 60000;
  function limpia(x) {
    const out = [], vistos = new Set();
    for (const a of Array.isArray(x) ? x : []) {
      if (!a || typeof a !== 'object' || typeof a.m !== 'string' || !a.m || a.m.length > 80 || !OPC.includes(a.min) || !Number.isFinite(a.at)) continue;
      const b = { m: a.m, min: a.min, at: a.at, n: String(a.n || '').slice(0, 120), ap: !!a.ap };
      if (vistos.has(id(b)) || out.length >= MAXA) continue;
      vistos.add(id(b)); out.push(b);
    }
    return out;
  }
  function carga() {
    const k = clave(); if (k === KEY) return false; KEY = k;
    try { LST = limpia(JSON.parse(localStorage.getItem(k) || 'null')) } catch { LST = [] }
    return true;
  }
  const guarda = () => { try { localStorage.setItem(KEY, JSON.stringify(LST)) } catch {} };

  /* ---------- el partido ---------- */
  const partido = (m) => g(() => byId(m), null);
  const inicio = (m) => { const t = Date.parse(m && m.at); return Number.isFinite(t) ? t : 0 };
  const nombre = (m) => `${m.a} vs ${m.b}`;
  const abierto = (m) => !!m && inicio(m) > Date.now() && !m.live && m.status !== 'final' && g(() => isOpen(m), true) !== false;
  const doc = (t) => g(() => `${WD(t)} ${DD(t)} ${MO(t)} · ${HM(t)}`, new Date(t).toLocaleString());
  const etiqueta = (min, ap) => (min === 0 ? (ap ? 'Cuando empiece mi apuesta' : 'Cuando empiece') : min === 60 ? '1 hora antes' : min + ' min antes');
  const delPartido = (m) => LST.filter((a) => a.m === m);

  // si el partido cambia de hora o de nombre, la alarma lo sigue
  function reubica() {
    let cambio = false;
    for (const a of LST) {
      const m = partido(a.m); if (!m) continue;
      const t = inicio(m), n = nombre(m);
      if (t && Math.abs(t - a.at) > 30000) { a.at = t; cambio = true }
      if (n !== a.n) { a.n = n; cambio = true }
    }
    if (cambio) { guarda(); programa() }
  }

  /* ---------- poner y quitar ---------- */
  function pon(mid, min, ap) {
    carga();
    const m = partido(mid); if (!m || !abierto(m)) return false;
    const a = { m: mid, min, at: inicio(m), n: nombre(m), ap: !!ap };
    if (fire(a) <= Date.now() && min !== 0) return false;
    if (LST.some((x) => id(x) === id(a))) return true;
    if (LST.length >= MAXA) { g(() => toast('Ya tienes ' + MAXA + ' alarmas. Borra alguna en Ajustes.')); return false }
    // el permiso se pide una sola vez, al poner la primera alarma (es un clic suyo)
    if (!LST.length && window.Notification && Notification.permission === 'default') {
      try { const p = Notification.requestPermission(); if (p && p.then) p.then(() => pintaMenu()).catch(() => {}) } catch {}
    }
    LST.push(a); guarda(); programa(); return true;
  }
  function quita(i) { carga(); const n = LST.length; LST = LST.filter((a) => id(a) !== i); if (LST.length !== n) { guarda(); programa() } }

  /* ---------- reloj: un setTimeout exacto, y 30 s solo con alarmas y la pantalla a la vista ---------- */
  function programa() {
    clearTimeout(tNext); tNext = 0;
    if (!LST.length) { paraTick(); return }
    const prox = Math.min(...LST.map(fire));
    tNext = setTimeout(revisa, Math.min(MAXT, Math.max(0, prox - Date.now())) + 30);
    arrancaTick();
  }
  function arrancaTick() { if (!iv && !document.hidden && LST.length) iv = setInterval(revisa, TICK) }
  function paraTick() { clearInterval(iv); iv = 0 }
  function revisa() {
    carga(); reubica();
    const ahora = Date.now(), deben = LST.filter((a) => fire(a) <= ahora);
    if (deben.length) {
      LST = LST.filter((a) => !deben.includes(a)); guarda();
      for (const a of deben) if (ahora <= a.at + TARDE) suena(a, ahora);   // la app estaba cerrada y ya empezo hace rato: no se avisa tarde
    }
    programa();
    if (deben.length) repinta();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) paraTick();
    else { carga(); if (LST.length) { revisa(); arrancaTick() } }
  });

  /* ---------- el aviso ---------- */
  const traduce = (s) => { if (!window.GM_LANG || GM_LANG.get() !== 'en') return s; const e = document.createElement('span'); e.textContent = s; GM_LANG.traduce(e); return e.textContent };
  function cuando(a, ahora) {
    const resta = a.at - ahora;
    if (resta > 45000) { const mi = Math.max(1, Math.round(resta / 60000)); return a.ap ? `Tu apuesta empieza en ${mi} min` : `Empieza en ${mi} min` }
    return a.ap ? 'Empieza el partido de tu apuesta' : 'Empieza ahora';
  }
  function abrePartido(mid) {
    if (!partido(mid)) return;
    g(() => { S.scr = 'partidos'; S.foc = mid; S.sheet = true; S.side = null; S.brk = false; location.hash = 'partidos'; render() });
  }
  function suena(a, ahora) {
    const texto = cuando(a, ahora);
    g(() => window.GM_SONIDOS && GM_SONIDOS.suena('mensaje'));
    if (g(() => window.Notification && Notification.permission === 'granted', false)) {
      const o = { body: traduce(texto), icon: g(() => document.querySelector('link[rel=icon]').href, undefined), tag: 'gm-al-' + id(a) };
      try {
        const n = new Notification(a.n, o);
        n.onclick = () => { g(() => window.focus()); abrePartido(a.m); n.close() };
        return;
      } catch {}
      // Android no deja crear una Notification suelta: por el service worker si lo hay
      try {
        if (navigator.serviceWorker) { navigator.serviceWorker.getRegistration().then((r) => { if (r) r.showNotification(a.n, o); else enApp(a, texto) }, () => enApp(a, texto)); return }
      } catch {}
    }
    enApp(a, texto);
  }
  function enApp(a, texto) {
    let box = document.getElementById('al-av');
    if (!box) { box = document.createElement('div'); box.id = 'al-av'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box) }
    const el = document.createElement('div'); el.className = 'al-a';
    el.innerHTML = `<span class="al-ic">${BELL}</span><div class="al-tx"><b data-notr>${esc(a.n)}</b><span>${esc(texto)}</span></div>
      <button type="button" class="al-ver" data-alav="ver|${esc(a.m)}">Ver partido</button><button type="button" class="al-ok" data-alav="x" aria-label="Cerrar">${'<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>'}</button>`;
    box.appendChild(el); tr(el);
    while (box.children.length > 4) box.firstElementChild.remove();
  }

  /* ---------- la campana en la ficha del partido y en cada boleto ---------- */
  function campanaFicha(cd, eb) {
    const mid = eb.dataset.m, m = partido(mid), prev = cd.nextElementSibling && cd.nextElementSibling.classList.contains('al-w') ? cd.nextElementSibling : null;
    if (!m || !abierto(m)) { if (prev) prev.remove(); return }
    const n = delPartido(mid).length, sig = mid + '|' + n;
    if (prev && prev.dataset.sig === sig) return;
    const w = document.createElement('div'); w.className = 'al-w'; w.dataset.sig = sig;
    w.innerHTML = `<button type="button" class="al-b ${n ? 'on' : ''}" data-alo="${esc(mid)}" aria-haspopup="dialog" title="Avisarme antes de que empiece">${BELL}<span>${n ? (n === 1 ? 'Alarma puesta' : 'Alarmas puestas') : 'Avisarme'}</span>${n > 1 ? `<i>${n}</i>` : ''}</button>`;
    if (prev) prev.replaceWith(w); else cd.after(w);
    tr(w);
  }
  function campanaBoleto(bol) {
    const mid = bol.dataset.goto, m = partido(mid), prev = bol.querySelector('.al-t');
    if (!m || !abierto(m)) { if (prev) prev.remove(); return }
    const hd = bol.querySelector('.mt-meta') || bol.querySelector('.mt-band, header'); if (!hd) return;
    const n = delPartido(mid).length, sig = mid + '|' + n;
    if (prev && prev.dataset.sig === sig) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'al-t' + (n ? ' on' : ''); b.dataset.sig = sig; b.dataset.alo = mid; b.dataset.alap = '1';
    b.setAttribute('aria-haspopup', 'dialog'); b.title = n ? 'Alarma puesta' : 'Avisarme antes de que empiece'; b.innerHTML = BELL;
    if (prev) prev.replaceWith(b); else hd.appendChild(b);
    tr(b);
  }
  function repasa() {
    pendiente = false;
    if (carga()) programa();
    reubica();
    const cd = document.querySelector('section.det .d-cd'), eb = document.querySelector('section.det #espn-box[data-m]');
    if (cd && eb) campanaFicha(cd, eb);
    for (const bol of document.querySelectorAll('.mt[data-goto], .bol[data-goto]')) campanaBoleto(bol);
  }
  const repinta = () => { repasa(); pintaMenu(); if (document.querySelector('.al-s')) g(() => render()) };
  const vw = document.getElementById('view');
  if (vw) new MutationObserver(() => { if (pendiente) return; pendiente = true; queueMicrotask(() => { try { repasa() } catch (e) { console.warn('alarmas.js', e) } }) }).observe(vw, { childList: true, subtree: true });

  /* ---------- el menu: elegir cuando avisar ---------- */
  const cierraMenu = () => { const m = document.getElementById('al-m'); if (m) m.remove(); P = null };
  function notaPermiso() {
    const p = g(() => (window.Notification ? Notification.permission : 'unsupported'), 'unsupported');
    return p === 'granted' ? 'Te avisa con una notificación mientras la app esté abierta.'
      : p === 'default' ? 'Al poner la primera alarma el navegador te pedirá permiso para avisar.'
      : 'El navegador no deja avisar con notificaciones: verás el aviso dentro de la app.';
  }
  function menuHtml() {
    const m = partido(P.id); if (!m) return '';
    const ahora = Date.now(), mis = delPartido(P.id), t = inicio(m);
    return `<div class="al-mf" data-alm="x"></div><div class="al-mc"><span class="lab">Avisarme</span><b data-notr>${esc(nombre(m))}</b><small>${esc(doc(t))}</small>
      <div class="al-ops">${OPC.map((min) => {
        const on = mis.some((a) => a.min === min), tarde = !on && (min === 0 ? t <= ahora : t - min * 60000 <= ahora);
        return `<button type="button" class="al-op ${on ? 'on' : ''}" data-alm="t|${min}" aria-pressed="${on}" ${tarde ? 'disabled' : ''}><span>${etiqueta(min, P.ap)}</span><em>${on ? 'Puesta' : tarde ? 'Ya pasó' : ''}</em></button>`;
      }).join('')}</div>
      <p>${notaPermiso()}</p>
      <button type="button" class="q" data-alm="x">Cerrar</button></div>`;
  }
  function pintaMenu() {
    const el = document.getElementById('al-m'); if (!el || !P) return;
    if (!abierto(partido(P.id))) return cierraMenu();
    const c = el.querySelector('.al-mc'), st = c && c.style.cssText;
    el.innerHTML = menuHtml(); const c2 = el.querySelector('.al-mc'); if (c2 && st) c2.style.cssText = st;
    tr(el);
  }
  function abre(mid, ap, btn) {
    carga(); const m = partido(mid); if (!m || !abierto(m)) return;
    cierraMenu(); P = { id: mid, ap: !!ap };
    const el = document.createElement('div'); el.id = 'al-m'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Avisarme');
    el.innerHTML = menuHtml(); document.body.appendChild(el); tr(el);
    const c = el.querySelector('.al-mc');
    if (c && btn && innerWidth > 860) { const r = btn.getBoundingClientRect(); c.style.left = Math.max(12, Math.min(innerWidth - 332, r.left)) + 'px'; c.style.top = Math.max(12, Math.min(innerHeight - 420, r.bottom + 8)) + 'px' }
    requestAnimationFrame(() => el.classList.add('on'));
  }

  /* ---------- Ajustes > Mis alarmas ---------- */
  function seccion() {
    carga();
    const lista = [...LST].sort((a, b) => fire(a) - fire(b));
    const filas = lista.map((a) => `<div class="al-r"><span class="al-n"><b data-notr>${esc(a.n)}</b><small>${esc(doc(fire(a)))}</small></span><em>${etiqueta(a.min, a.ap)}</em><button type="button" class="aj-a q" data-al="x|${esc(id(a))}">Borrar</button></div>`).join('');
    return `<section class="aj-s al-s"><h3 class="lab">Mis alarmas</h3>
      <p class="aj-n">Suenan mientras la app esté abierta. Se ponen con la campana de la ficha de un partido o de tu apuesta.</p>
      ${filas || '<p class="aj-n">No tienes alarmas puestas.</p>'}
      <p class="aj-n al-np">${notaPermiso()}</p></section>`;
  }

  /* ---------- clics ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-alo],[data-alm],[data-al],[data-alav]'); if (!t) return;
    e.stopPropagation(); e.preventDefault();
    if (t.dataset.alo) return abre(t.dataset.alo, !!t.dataset.alap, t);
    if (t.dataset.alm) {
      const [k, v] = t.dataset.alm.split('|');
      if (k === 'x') return cierraMenu();
      if (k === 't' && P) { const min = +v; if (delPartido(P.id).some((a) => a.min === min)) quita(P.id + '|' + min); else pon(P.id, min, P.ap); pintaMenu(); repasa() }
      return;
    }
    if (t.dataset.al) { quita(t.dataset.al.slice(2)); return repinta() }
    if (t.dataset.alav) {
      const [k, v] = t.dataset.alav.split('|'), a = t.closest('.al-a');
      if (k === 'ver') abrePartido(v);
      if (a) a.remove();
      const box = document.getElementById('al-av'); if (box && !box.children.length) box.remove();
    }
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cierraMenu() });

  carga(); programa();
  window.GM_ALARMAS = { seccion, lista: () => LST.map((a) => ({ ...a })), pon, quita, revisa, abre, cuenta: () => LST.length };
})();
