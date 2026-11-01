// Actividad en directo (PM, 02-11: "cuando hay alguien jugando en games o abriendo cajas que se vea y que notifique").
// QUE HACE: quien esta jugando ahora en Juegos (cara o cruz, crash, blackjack) o abriendo cajas / en una batalla se ve EN VIVO, y a los
// demas les sale un aviso dentro de la app cuando alguien EMPIEZA. No hay tablas ni SQL ni se escribe nada en la base: va por Supabase
// Realtime PRESENCE en el canal 'gm-actividad' (el mismo cliente `db` que ya usan app.js y cajas-vivo.js). Gratis y sin rastro.
//
// COMO SE ANUNCIA: cada cliente hace channel.track({ k: MEK, q: <actividad>, desde: Date.now() }) SOLO cuando hace algo de verdad
// (abre una caja, tira la moneda, apuesta en el crash, se sienta o apuesta en el blackjack, crea o se une a una batalla), no por
// mirar la pantalla. Se detecta oyendo los clics de los botones que ya existen (juegos.js / bjmesa.js / cajas.js no se tocan) y
// el evento gm:caja-abierta de cajas.js (para el giro automatico). Se quita (vuelve a reposo: presence con q vacia, que todos ignoran) al salir
// de la pagina, a los 30 s con la pestana oculta o a los 2 minutos sin ninguna accion. Un solo setTimeout que se rearma por accion: sin accion no hay temporizador.
//
// COMO SE VE: (1) la tira "Ahora mismo" en Inicio, columna de Amigos, bajo la cabecera y antes de Retos activos (alto cero si no hay
// nadie); (2) un punto en el menu de Juegos / Cajas (y en Mas, en movil) y en la pestana del juego, puesto con CSS desde el atributo
// data-gente de <html>, asi que sobrevive a los repintados de app.js; (3) un aviso con boton Ir cuando alguien empieza, como mucho
// uno por persona y actividad cada 5 minutos, y ninguno si ya estas en esa pantalla. En Ajustes, "Avisos de actividad" (activado por
// defecto) con Juegos y Cajas, en localStorage 'gm-actividad-avisos:<jugador>'.
//
// GANCHO PUSH: cuando existan los avisos push (rama push-avisos de James), el sitio es `avisaPush()` mas abajo: recibe quien empieza y que
// hace, y se llama justo donde sale el aviso dentro de la app, ya filtrado por las preferencias y el limite de 5 minutos.
//
// Si el navegador no tiene presence o el canal falla, no pasa nada: la tira queda vacia y nada lanza errores.
// Usa lo global de app.js: db, F, fr, av, S, ME, MEK, loaded, avisa. Para pruebas: GM_ACTIVIDAD._sim(estado) (ver al final).
'use strict';
(function () {
  const g = (f, d) => { try { return f() } catch { return d } };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tr = (el) => { if (window.GM_LANG && el) GM_LANG.traduce(el) };

  const CANAL = 'gm-actividad';
  const INACTIVO = 120000;      // sin ninguna accion: se quita
  const OCULTA = 30000;         // pestana oculta: se quita
  const ENFRIA = 300000;        // como mucho un aviso por persona y actividad cada 5 min
  const RECIEN = 180000;        // solo se avisa de quien empezo hace menos de esto (y no de lo que ya estaba al entrar)
  const CADUCA = 900000;        // nunca se enseña algo de hace mas de 15 min
  const MAX_FILAS = 4, MAX_AVISOS = 3, VIDA_AVISO = 9000;

  // q -> pantalla, pestana a la que lleva, grupo del interruptor y las dos frases (tira y aviso comparten texto)
  const KS = {
    cajas: { scr: 'cajas', tab: 'abrir', grp: 'cajas', t: 'abriendo cajas', e: 'opening boxes' },
    batalla: { scr: 'cajas', tab: 'batallas', grp: 'cajas', t: 'en una batalla de cajas', e: 'in a box battle' },
    moneda: { scr: 'juegos', tab: 'moneda', grp: 'juegos', t: 'jugando a cara o cruz', e: 'playing heads or tails' },
    crash: { scr: 'juegos', tab: 'crash', grp: 'juegos', t: 'jugando al crash', e: 'playing crash' },
    blackjack: { scr: 'juegos', tab: 'blackjack', grp: 'juegos', t: 'en el blackjack', e: 'in blackjack' },
    ruleta: { scr: 'juegos', tab: 'ruleta', grp: 'juegos', t: 'en la ruleta', e: 'on the roulette' },
    plinko: { scr: 'juegos', tab: 'plinko', grp: 'juegos', t: 'en el plinko', e: 'on plinko' },
  };
  // botones que cuentan como "jugar" (ninguno es ver ni cambiar la cantidad)
  const JG = { retar: 'moneda', aceptar: 'moneda', crGo: 'crash', ruGo: 'ruleta', soltar: 'plinko' };
  const BJ = { sit: 1, apostar: 1, otra: 1, pedir: 1, plantar: 1, doblar: 1 };
  const CJ = { abrir: 'cajas', abrirMia: 'cajas', auto: 'cajas', crear: 'batalla', unir: 'batalla' };

  let ch = null, ckey = '', suscrito = false, baseT = 0, tReint = 0;
  let OTROS = new Map();        // k -> { q, desde, visto }
  let yo = null, ultimaQ = '', ultimaT = 0, tIdle = 0, tOculta = 0, iv = 0;
  const AVISADO = new Map();    // 'k|q' -> cuando se avisó
  let SIG = '';

  const app = () => document.getElementById('app');
  const listo = () => { const a = app(); return !!a && !a.hidden && g(() => !!(loaded && ME && db && typeof db.channel === 'function'), false) };
  const yoK = () => g(() => MEK, '');
  const nombre = (k) => g(() => fr(k).n, '');
  const conoce = (k) => typeof k === 'string' && g(() => F.some((f) => f.id === k), false);

  /* ---------- preferencias de avisos (localStorage, puede estar bloqueado) ---------- */
  const claveP = () => 'gm-actividad-avisos:' + yoK();
  function prefs() {
    const d = { on: true, juegos: true, cajas: true };
    try { const x = JSON.parse(localStorage.getItem(claveP()) || 'null'); if (x && typeof x === 'object') for (const k of Object.keys(d)) if (typeof x[k] === 'boolean') d[k] = x[k] } catch {}
    return d;
  }
  function guardaP(p) { try { localStorage.setItem(claveP(), JSON.stringify(p)) } catch {} }

  /* ---------- el canal ---------- */
  function conecta() {
    if (ch || !listo()) return;
    try {
      const key = yoK();
      const c = db.channel(CANAL, { config: { presence: { key: String(key) } } });
      c.on('presence', { event: 'sync' }, () => g(() => procesa(Object.values(c.presenceState()).flat(), true)));
      ch = c; ckey = key; suscrito = false;
      c.subscribe((st) => {
        if (c !== ch) return;
        if (st === 'SUBSCRIBED') { suscrito = true; baseT = Date.now() + 4000; anuncia() }   // los 4 s de la primera foto son lo que ya estaba: no se avisa
        else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') suscrito = false;
      });
    } catch { ch = null }
  }
  function desconecta() {
    clearTimeout(tIdle); clearTimeout(tOculta); clearTimeout(tReint);
    if (ch) { try { db.removeChannel(ch) } catch {} }
    ch = null; suscrito = false; yo = null; ckey = '';
    procesa([], false);
  }
  // arranca cuando la app esta a la vista y cargada; si aun no lo esta, reintenta unos segundos y para
  function arranca(n) {
    clearTimeout(tReint);
    if (ch && ckey !== yoK() && listo()) desconecta();
    if (!listo()) { if (ch && app() && app().hidden) desconecta(); else if ((n || 0) < 60 && app() && !app().hidden) tReint = setTimeout(() => arranca((n || 0) + 1), 1000); return }
    conecta();
  }
  // Presence solo entrega lo de los demas a quien tambien esta en el canal con un track: por eso sin actividad se queda con q vacia
  // (idle), que todos ignoran, y "quitarse" es volver a ese estado en vez de untrack.
  const anuncia = () => { try { Promise.resolve(ch && suscrito && ch.track({ k: yoK(), q: yo ? yo.q : '', desde: yo ? yo.desde : 0 })).catch(() => {}) } catch {} };

  /* ---------- lo mio: anunciar y quitar ---------- */
  function haceAlgo(q) {
    if (!KS[q]) return;
    const ahora = Date.now(); ultimaQ = q; ultimaT = ahora;
    if (!ch) arranca();
    if (!yo || yo.q !== q) { yo = { q, desde: ahora }; anuncia() }
    clearTimeout(tIdle); tIdle = setTimeout(quita, INACTIVO);
  }
  function quita() {
    clearTimeout(tIdle); clearTimeout(tOculta);
    if (!yo) return;
    yo = null; anuncia();
  }

  /* ---------- lo de los demas ---------- */
  function procesa(lista, real) {
    const ahora = Date.now(), nuevo = new Map();
    for (const x of Array.isArray(lista) ? lista : []) {
      if (!x || typeof x !== 'object' || !KS[x.q] || x.k === yoK() || !conoce(x.k)) continue;
      const d = Number.isFinite(x.desde) && x.desde <= ahora + 60000 && ahora - x.desde < 6 * 3600000 ? x.desde : 0;
      const p = OTROS.get(x.k), vio = p ? p.visto : ahora, t = d || vio;
      if (ahora - t > CADUCA) continue;
      const a = nuevo.get(x.k);
      if (!a || t > a.desde) nuevo.set(x.k, { q: x.q, desde: t, visto: vio });
    }
    const avisar = [];
    if (!(real && ahora < baseT)) for (const [k, v] of nuevo) { const p = OTROS.get(k); if ((!p || p.q !== v.q) && ahora - v.desde < RECIEN) avisar.push([k, v]) }
    OTROS = nuevo;
    marca(); pinta(); reloj();
    for (const [k, v] of avisar) g(() => aviso(k, v.q));
  }
  const grupos = () => { const s = new Set(); for (const v of OTROS.values()) { s.add('g-' + KS[v.q].grp); s.add(v.q) } return [...s] };
  function marca() {
    const gs = grupos().join(' '), h = document.documentElement;
    if (gs) { if (h.dataset.gente !== gs) h.dataset.gente = gs } else if ('gente' in h.dataset) delete h.dataset.gente;
  }
  // "hace X min" se refresca cada minuto solo mientras hay alguien y la pantalla se ve
  function reloj() {
    const quiero = OTROS.size > 0 && !document.hidden;
    if (quiero && !iv) iv = setInterval(() => { for (const [k, v] of OTROS) if (Date.now() - v.desde > CADUCA) OTROS.delete(k); marca(); pinta(); if (!OTROS.size) reloj() }, 60000);
    else if (!quiero && iv) { clearInterval(iv); iv = 0 }
  }

  /* ---------- la tira "Ahora mismo" ---------- */
  const hace = (t) => { const s = Math.max(0, (Date.now() - t) / 1e3); return s < 90 ? 'ahora' : s < 3600 ? `hace ${Math.round(s / 60)} min` : `hace ${Math.floor(s / 3600)} h` };
  const CHEV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6l6 6-6 6"/></svg>';
  const orden = () => [...OTROS.entries()].sort((a, b) => b[1].desde - a[1].desde);
  const frase = (q) => `<span>${KS[q].t}</span>`;
  function fila([k, v]) {
    const kd = KS[v.q];
    return `<button type="button" class="avt-r" data-scr="${kd.scr}" data-avt-ir="${v.q}">${g(() => av(k, 'sm'), '')}<span class="avt-t"><b data-notr>${esc(nombre(k))}</b> ${frase(v.q)}</span><em>${hace(v.desde)}</em>${CHEV}</button>`;
  }
  function contenido() {
    const xs = orden(); if (!xs.length) return '';
    const mas = xs.length - MAX_FILAS;
    return `<section class="avt" aria-label="Ahora mismo"><div class="ini-sub"><h3><span class="avt-dot"></span><span>Ahora mismo</span> <i>${xs.length}</i></h3></div><div class="avt-l">${xs.slice(0, MAX_FILAS).map(fila).join('')}</div>${mas > 0 ? `<p class="avt-mas">y ${mas} más</p>` : ''}</section>`;
  }
  // se llama desde inicio.js (colAmigos); el hueco siempre esta, pero sin gente no ocupa nada
  const html = () => `<div class="avt-w ${OTROS.size ? 'hay' : ''}" data-avt-w><div class="avt-i">${contenido()}</div></div>`;
  function pinta() {
    const sig = orden().map(([k, v]) => k + v.q + hace(v.desde)).join('|') + g(() => GM_LANG.get(), '');
    if (sig === SIG) return; SIG = sig;
    document.querySelectorAll('[data-avt-w]').forEach((w) => {
      const i = w.firstElementChild; if (!i) return;
      i.innerHTML = contenido(); tr(i);
      w.classList.toggle('hay', OTROS.size > 0);
    });
  }

  /* ---------- el aviso cuando alguien empieza ---------- */
  function aviso(k, q) {
    const kd = KS[q], p = prefs();
    if (!kd || !p.on || !p[kd.grp] || k === yoK()) return;
    if (g(() => S.scr, '') === kd.scr) return;                    // ya estas en esa pantalla
    const id = k + '|' + q, ahora = Date.now();
    if (ahora - (AVISADO.get(id) || 0) < ENFRIA) return;
    AVISADO.set(id, ahora);
    enApp(k, q);
    // el aviso del sistema (solo sale con la app de fondo y con permiso): lo decide avisa() de app.js
    g(() => { const en = window.GM_LANG && GM_LANG.get() === 'en'; avisa(nombre(k) + (en ? ' is ' + kd.e : ' está ' + kd.t), en ? 'Tap to join in' : 'Entra a verlo') });
    avisaPush(k, q);
  }
  // >>> GANCHO PUSH <<< Cuando existan los avisos push (rama push-avisos), aqui se manda a los demas jugadores:
  //     k = quien empieza (id de jugador), q = que hace (clave de KS). Ya viene filtrado por el limite de 5 min.
  //     Hoy no hace nada a proposito: esta pensado para el aviso de los que NO tienen la app abierta.
  function avisaPush(k, q) { void k; void q }

  function enApp(k, q) {
    const kd = KS[q];
    let box = document.getElementById('avt-av');
    if (!box) { box = document.createElement('div'); box.id = 'avt-av'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box) }
    const el = document.createElement('div'); el.className = 'avt-a';
    el.innerHTML = `${g(() => av(k, 'sm'), '')}<div class="avt-tx"><b data-notr>${esc(nombre(k))}</b> <span>está ${KS[q].t}</span></div>
      <button type="button" class="avt-ir" data-scr="${kd.scr}" data-avt-ir="${q}">Ir</button><button type="button" class="avt-x" data-avt-x aria-label="Cerrar"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
    box.appendChild(el); tr(el);
    while (box.children.length > MAX_AVISOS) box.firstElementChild.remove();
    setTimeout(() => cierra(el), VIDA_AVISO);
  }
  function cierra(el) {
    if (!el || !el.isConnected) return;
    const box = el.parentNode; el.remove();
    if (box && !box.children.length) box.remove();
  }

  /* ---------- ir a la pantalla (y a la pestana) ---------- */
  function iraTab(q) {
    const kd = KS[q]; if (!kd || !kd.tab) return;
    const sel = kd.scr === 'juegos' ? `.jg-tab[data-v="${kd.tab}"]` : `.cj-tab[data-v="${kd.tab}"]`;
    let n = 0;
    (function t() {
      const b = document.querySelector(sel);
      if (b) { if (!b.classList.contains('on')) b.click(); return }
      if (++n < 25) setTimeout(t, 100);
    })();
  }

  /* ---------- Ajustes ---------- */
  function seccion() {
    const p = prefs();
    const sw = (k, on, t, s, sub, off) => `<button type="button" class="aj-f anim-t avs-f ${on ? 'on' : ''} ${sub ? 'avs-sub' : ''} ${off ? 'avs-off' : ''}" data-avs="${k}" aria-pressed="${on}"><span class="aj-tx"><b>${t}</b><small>${s}</small></span><i></i></button>`;
    return `<section class="aj-s avs-s"><h3 class="lab">Avisos de actividad</h3>
      ${sw('on', p.on, 'Avisos de actividad', 'Te avisa cuando alguien empieza a jugar o a abrir cajas', false, false)}
      ${sw('juegos', p.juegos, 'Juegos', 'Cara o cruz, crash y blackjack', true, !p.on)}
      ${sw('cajas', p.cajas, 'Cajas', 'Abrir cajas y batallas', true, !p.on)}</section>`;
  }
  function cambiaPref(k, btn) {
    const p = prefs(); if (!(k in p)) return;
    p[k] = !p[k]; guardaP(p);
    const sec = btn.closest('.avs-s'); if (!sec) return;
    sec.querySelectorAll('[data-avs]').forEach((b) => { const kk = b.dataset.avs, on = !!p[kk]; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); if (kk !== 'on') b.classList.toggle('avs-off', !p.on) });
  }

  /* ---------- clics y vida de la pestana ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target; if (!t || !t.closest) return;
    const x = t.closest('[data-avs]');
    if (x) { e.stopPropagation(); e.preventDefault(); return cambiaPref(x.dataset.avs, x) }
    if (t.closest('[data-avt-x]')) { e.stopPropagation(); return cierra(t.closest('.avt-a')) }
    const ir = t.closest('[data-avt-ir]');
    if (ir) { const q = ir.dataset.avtIr, a = ir.closest('.avt-a'); setTimeout(() => iraTab(q), 0); if (a) cierra(a); return }   // la navegacion la hace app.js con el data-scr
    // lo que cuenta como jugar o abrir cajas
    const b = t.closest('[data-jg],[data-bjm],[data-cj]'); if (!b || b.disabled) return;
    let q = '';
    if (b.dataset.jg) q = JG[b.dataset.jg] || '';
    else if (b.dataset.bjm) q = BJ[b.dataset.bjm] ? 'blackjack' : '';
    else if (b.dataset.cj) q = CJ[b.dataset.cj] || '';
    if (q) haceAlgo(q);
  }, true);
  // una caja abierta de verdad (tambien las del giro automatico, que no pasan por un clic cada vez)
  addEventListener('gm:caja-abierta', (e) => { if (e && e.detail && e.detail.quien === yoK()) haceAlgo('cajas') });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearTimeout(tOculta); if (yo) tOculta = setTimeout(quita, OCULTA);
      if (iv) { clearInterval(iv); iv = 0 }
    } else {
      clearTimeout(tOculta);
      // volvio antes de los 2 minutos de la ultima accion y ya se habia quitado: se vuelve a anunciar
      if (!yo && ultimaQ && Date.now() - ultimaT < INACTIVO) { yo = { q: ultimaQ, desde: ultimaT }; anuncia(); clearTimeout(tIdle); tIdle = setTimeout(quita, INACTIVO - (Date.now() - ultimaT)) }
      pinta(); reloj();
    }
  });
  addEventListener('pagehide', () => { try { if (ch && suscrito) ch.untrack() } catch {} });
  const a0 = app();
  if (a0) new MutationObserver(() => arranca()).observe(a0, { attributes: true, attributeFilter: ['hidden'] });
  arranca();

  window.GM_ACTIVIDAD = {
    html, seccion, ahora: () => orden().map(([k, v]) => ({ k, q: v.q, desde: v.desde })),
    // SOLO PRUEBAS: finge lo que diria presence. estado = [{ k, q, desde? }, ...] (los demas jugadores); [] lo vacia.
    // Pasa por el mismo camino que lo real (validacion, avisos, tira, puntos), salvo que no es la primera foto.
    _sim(estado) { procesa((estado || []).map((x) => ({ k: x.k, q: x.q, desde: x.desde == null ? Date.now() : x.desde })), false); return this.ahora() },
    _yo: () => (yo ? { ...yo } : null),
    _haceAlgo: haceAlgo, _quita: quita,
  };
})();
