// Ocultar ligas y juegos (PM, 01-11: "que pueda ocultar ligas o juegos que uno no quiera ver o apostar nunca").
// En Ajustes (seccion "Qué ves") y con pulsacion larga (o clic derecho) en el escudo de una liga de Partidos se oculta una liga
// o un deporte entero (Fútbol, Valorant, CS2, UFC). Lo oculto no sale en Partidos, Inicio ni Directo y se vuelve a mostrar desde
// Ajustes. Las apuestas y retos que ya tienes en una liga oculta siguen en Mis apuestas (app.js build(): esos partidos se quedan
// en MI y en L, fuera de M).
// Donde se guarda: players.ocultas (db/041, set_ocultas) y, mientras 041 no este cargado o falle la red, localStorage
// ('gm-ocultas:<jugador>'). Mismo patron que moneda.js: al entrar manda la base; si la base esta vacia y aqui hay algo, se sube.
// Formato: { d: ['v'], l: { 'esp.1': 'LaLiga' } }  (d = deportes ocultos; l = ligas ocultas con su nombre para poder mostrarlas)
'use strict';
(function () {
  const g = (f, d) => { try { return f() } catch { return d } };
  const en = () => !!(window.GM_LANG && GM_LANG.get() === 'en');
  const tr = (el) => { if (window.GM_LANG) GM_LANG.traduce(el) };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DEPS = ['f', 'v', 'c', 'u'];

  let ST = { d: [], l: {} }, KEY = '';
  const LG = new Map();           // todas las ligas vistas en los partidos cargados: id -> { n, s, logo }
  const ABIERTO = new Set();      // deportes desplegados en Ajustes
  let sinColumna = false, mirando = false, subiendo = null;

  const clave = () => 'gm-ocultas:' + (g(() => ME, '') || '');
  const limpia = (x) => {
    const d = Array.isArray(x && x.d) ? [...new Set(x.d.filter((s) => DEPS.includes(s)))] : [];
    const l = {}; if (x && x.l && typeof x.l === 'object' && !Array.isArray(x.l)) for (const [k, v] of Object.entries(x.l)) if (k && String(k).length <= 60 && Object.keys(l).length < 120) l[k] = String(v || k).slice(0, 80);
    return { d, l };
  };
  const igual = (a, b) => JSON.stringify([[...a.d].sort(), Object.keys(a.l).sort()]) === JSON.stringify([[...b.d].sort(), Object.keys(b.l).sort()]);
  const vacio = (x) => !x.d.length && !Object.keys(x.l).length;
  function carga() {
    const k = clave(); if (k === KEY) return; KEY = k;
    try { ST = limpia(JSON.parse(localStorage.getItem(k) || 'null')) } catch { ST = { d: [], l: {} } }
  }
  const guarda = () => { try { localStorage.setItem(KEY, JSON.stringify(ST)) } catch {} };

  const oculta = (s, l) => { carga(); return ST.d.includes(s) || Object.prototype.hasOwnProperty.call(ST.l, l) };

  /* ---------- lo que usa build() de app.js ---------- */
  function parte(rows, ctx) {
    carga();
    for (const r of rows) if (!LG.has(r.league)) LG.set(r.league, { n: r.league_name || r.league, s: r.sport, logo: r.league_logo || '' });
    if (vacio(ST)) return { vis: rows, ocu: [] };
    const mios = new Set(), me = ctx && ctx.me;
    for (const b of (ctx && ctx.bets) || []) if (b.player === me) mios.add(b.match);
    for (const c of (ctx && ctx.ch) || []) if (c.from === me || c.to === me) mios.add(c.match);
    const vis = [], ocu = [];
    for (const r of rows) { if (oculta(r.sport, r.league)) { if (mios.has(r.id)) ocu.push(r) } else vis.push(r) }
    return { vis, ocu };
  }

  /* ---------- guardar en la base (db/041) ---------- */
  const DB = () => (typeof db !== 'undefined' && db && db.auth ? db : null);
  function sube() {
    const b = DB(); if (!b || sinColumna) return;
    clearTimeout(subiendo);
    subiendo = setTimeout(() => {
      b.rpc('set_ocultas', { p_ocultas: ST }).then(({ error }) => { if (error && /set_ocultas|function|schema cache/i.test(error.message || '')) sinColumna = true }, () => {});
    }, 400);
  }
  async function mira() {
    const b = DB(); if (!b || sinColumna || mirando) return;
    mirando = true;
    try {
      const { data: { session } } = await b.auth.getSession(); if (!session) return;
      // select('*') y no select('ocultas'): sin la columna no da error 400, solo no viene
      const { data, error } = await b.from('players').select('*').eq('id', session.user.id).maybeSingle();
      if (error || !data) return;
      if (!('ocultas' in data)) { sinColumna = true; return }
      carga();
      if (data.ocultas == null) { if (!vacio(ST)) sube(); return }
      const de = limpia(data.ocultas);
      if (!igual(de, ST)) { ST = de; guarda(); reconstruye() }
    } catch {} finally { mirando = false }
  }
  if (DB()) {
    DB().auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_IN' || ev === 'INITIAL_SESSION') setTimeout(mira, 0) });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') mira() });
  }

  /* ---------- cambiar ---------- */
  function reconstruye() {
    try {
      if (window.BUILD_ARGS) build(...window.BUILD_ARGS);
      // si lo que estabas mirando se ha ocultado, vuelve a lo general
      if (S.f !== 'all' && ST.d.includes(S.f)) S.f = 'all';
      if (S.lg && !['top', 'all', 'fav'].includes(S.lg) && !M.some((m) => m.lg === S.lg)) S.lg = 'top';
      if (S.foc && !MI.has(S.foc)) { S.foc = null; S.sheet = false }
      render();
    } catch (e) { console.warn('ocultas.js', e) }
  }
  function cambia(fn) { carga(); fn(); ST = limpia(ST); guarda(); sube(); reconstruye() }
  const ocultaDep = (s) => cambia(() => { if (!ST.d.includes(s)) ST.d.push(s) });
  const muestraDep = (s) => cambia(() => { ST.d = ST.d.filter((x) => x !== s) });
  const ocultaLiga = (id) => cambia(() => { ST.l[id] = (LG.get(id) || {}).n || id });
  const muestraLiga = (id) => cambia(() => { delete ST.l[id] });

  /* ---------- Ajustes ---------- */
  const NOM = (s) => g(() => SP[s][0], s);
  const IMG = (s) => g(() => SP[s][1], '');
  function seccion() {
    carga();
    const porDep = {}; for (const s of DEPS) porDep[s] = [];
    const ids = new Set([...LG.keys(), ...Object.keys(ST.l)]);
    for (const id of ids) { const x = LG.get(id) || { n: ST.l[id], s: null, logo: '' }; const s = x.s || DEPS.find((d) => (g(() => L[id][2], '')) === d) || 'f'; if (porDep[s]) porDep[s].push([id, x.n, x.logo]) }
    for (const s of DEPS) porDep[s].sort((a, b) => a[1].localeCompare(b[1]));
    const sw = (on, attr, t, sub) => `<button type="button" class="aj-f anim-t oc-f ${on ? 'on' : ''}" ${attr} aria-pressed="${on}"><span class="aj-tx"><b>${t}</b><small>${sub}</small></span><i></i></button>`;
    const filas = DEPS.map((s) => {
      const ocu = ST.d.includes(s), ls = porDep[s], nOc = ls.filter(([id]) => Object.prototype.hasOwnProperty.call(ST.l, id)).length, ab = ABIERTO.has(s);
      const sub = ocu ? 'Oculto' : nOc ? `${nOc} ${nOc === 1 ? 'liga oculta' : 'ligas ocultas'}` : 'Se ve';
      return `<div class="oc-dep ${ocu ? 'off' : ''}">
        <div class="oc-hd"><img src="${esc(IMG(s))}" alt="">${sw(!ocu, `data-oc="d|${s}"`, NOM(s), sub)}</div>
        ${ls.length ? `<button type="button" class="oc-ver" data-oc="v|${s}" aria-expanded="${ab}"><span>${ab ? 'Ocultar la lista de ligas' : 'Elegir ligas'}</span><i>${ls.length}</i></button>` : ''}
        ${ab ? `<div class="oc-lgs">${ls.map(([id, n, logo]) => { const o = Object.prototype.hasOwnProperty.call(ST.l, id);
          return `<button type="button" class="oc-lg ${o || ocu ? 'off' : ''}" data-oc="l|${esc(id)}" aria-pressed="${!o}" ${ocu ? 'disabled' : ''}>${logo ? `<img src="${esc(logo)}" alt="" loading="lazy">` : '<span class="oc-nl"></span>'}<span data-notr>${esc(n)}</span><em>${o || ocu ? 'Oculta' : 'Se ve'}</em></button>` }).join('')}</div>` : ''}
      </div>`;
    }).join('');
    return `<section class="aj-s oc-s"><h3 class="lab">Qué ves</h3>
      <p class="aj-n">Lo que ocultes no sale en Partidos, Inicio ni Directo. Tus apuestas de ahí siguen en Mis apuestas. También puedes mantener pulsado el escudo de una liga en Partidos.</p>
      ${filas}</section>`;
  }

  /* ---------- clics de Ajustes ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-oc]'); if (!t) return;
    e.stopPropagation(); e.preventDefault();
    const [k, id] = t.dataset.oc.split('|');
    if (k === 'd') return ST.d.includes(id) ? muestraDep(id) : ocultaDep(id);
    if (k === 'v') { if (ABIERTO.has(id)) ABIERTO.delete(id); else ABIERTO.add(id); return g(() => render()) }
    if (k === 'l') return Object.prototype.hasOwnProperty.call(ST.l, id) ? muestraLiga(id) : ocultaLiga(id);
  }, true);

  /* ---------- pulsacion larga en el escudo de una liga de Partidos ---------- */
  let timer = 0, tragaClic = false;
  const cierraMenu = () => { const m = document.getElementById('oc-m'); if (m) m.remove(); document.removeEventListener('pointerdown', fuera, true) };
  function fuera(e) { if (!e.target.closest('#oc-m')) cierraMenu() }
  function menu(btn) {
    const id = btn.dataset.lg; if (!id || ['top', 'all', 'fav'].includes(id)) return;
    const info = LG.get(id) || {}, s = info.s || g(() => L[id][2], 'f'), nombre = info.n || g(() => L[id][0], id);
    cierraMenu();
    const m = document.createElement('div'); m.id = 'oc-m'; m.setAttribute('role', 'menu');
    m.innerHTML = `<div class="oc-mf" data-ocm="x"></div><div class="oc-mc"><span class="lab">Liga</span><b data-notr>${esc(nombre)}</b>
      <button type="button" role="menuitem" data-ocm="l|${esc(id)}">Ocultar esta liga</button>
      <button type="button" role="menuitem" data-ocm="d|${esc(s)}">Ocultar todo ${esc(NOM(s))}</button>
      <button type="button" class="q" role="menuitem" data-ocm="x">Cancelar</button>
      <p>Se vuelve a mostrar desde Ajustes.</p></div>`;
    document.body.appendChild(m); tr(m);
    const r = btn.getBoundingClientRect(), c = m.querySelector('.oc-mc');
    if (innerWidth > 860) { c.style.left = Math.max(12, Math.min(innerWidth - 292, r.left)) + 'px'; c.style.top = Math.min(innerHeight - 250, r.bottom + 8) + 'px' }
    m.classList.add('on');
  }
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.lgs2 [data-lg]'); if (!b || e.button > 0) return;
    clearTimeout(timer);
    timer = setTimeout(() => { tragaClic = true; menu(b); setTimeout(() => { tragaClic = false }, 700) }, 520);
  }, true);
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave', 'scroll']) document.addEventListener(ev, () => clearTimeout(timer), true);
  document.addEventListener('contextmenu', (e) => { const b = e.target.closest('.lgs2 [data-lg]'); if (!b) return; e.preventDefault(); clearTimeout(timer); menu(b) }, true);
  document.addEventListener('click', (e) => {
    if (tragaClic && e.target.closest('.lgs2 [data-lg]')) { e.stopPropagation(); e.preventDefault(); tragaClic = false; return }
    const t = e.target.closest('[data-ocm]'); if (!t) return;
    e.stopPropagation(); e.preventDefault();
    const [k, id] = t.dataset.ocm.split('|'); cierraMenu();
    if (k === 'l') ocultaLiga(id); else if (k === 'd') ocultaDep(id);
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cierraMenu() });

  window.GM_OCULTAS = { oculta, depOculto: (s) => { carga(); return ST.d.includes(s) }, parte, seccion, ocultas: () => JSON.parse(JSON.stringify(ST)), ocultaDep, muestraDep, ocultaLiga, muestraLiga, mira };
})();
