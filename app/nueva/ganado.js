// Resultados de Gambling Addicts (PM, 30-10: "si gano, que salga en algún lado"; y luego: "si ganamos una apuesta o algo,
// que avise y que suene una notificación"). Va aparte, como extras.js, y no toca app.js:
//  1) CELEBRACION: cuando una apuesta tuya pasa a ganada (o una predicción acertada, un cash out con beneficio, un reto, el bote
//     o un premio de la semana) sale una tarjeta grande en el centro con los escudos, tu elección, la cuota y lo cobrado, con
//     confeti y un sonido de aviso. Al momento si la app está abierta (la app recarga sola con el pulso de Realtime y cada
//     5 min) o al abrirla si pasó mientras no estabas; si son varias, una tarjeta resumen con la lista y el total.
//     Con la pestaña o la ventana en segundo plano: suena igual y sale la notificación del sistema (si hay permiso de avisos);
//     la tarjeta espera a que vuelvas.
//  2) PERDIDAS Y DEVUELTAS: una línea discreta abajo, sin sonido fuerte.
//  3) RESULTADOS: campanita junto a Novedades y Recompensas, con un punto si hay resultados que no has mirado, y un panel con
//     los tuyos (ganadas en verde, perdidas en rojo, devueltas en gris) y los de todos.
// Lo ya enseñado se recuerda en localStorage (gm-ganado:<jugador>). Todo se lee de lo que ya cargó la app (ALL, LEDGER, CH);
// lo único que se pide aparte son tus predicciones rápidas (tabla ex_pred, solo lectura y solo las tuyas).
'use strict';
(function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const N = (x) => String(Math.round(x || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, document.documentElement.lang === 'en' ? ',' : '.');
  const O = (x) => Number(x).toFixed(2).replace('.', document.documentElement.lang === 'en' ? '.' : ',');
  const traduce = (el) => { if (window.GM_LANG && el) { try { GM_LANG.traduce(el) } catch {} } };
  const texto = (html) => { const d = document.createElement('div'); d.innerHTML = html; traduce(d); return d.textContent.replace(/\s+/g, ' ').trim() };
  const sinAnim = () => document.documentElement.classList.contains('sin-anim');
  const lsGet = (k) => { try { return localStorage.getItem(k) } catch { return null } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v) } catch {} };
  const coin = '<span class="cn"></span>';
  const IC_BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>';
  const IC_X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const DIA = 864e5, MIRA_ATRAS = 12 * 36e5, OLVIDA = 7 * DIA, DURA = 8000;

  /* ---------- lo que ya tiene la app (app.js) ---------- */
  const g = (f, d) => { try { const v = f(); return v === undefined ? d : v } catch { return d } };
  const listo = () => g(() => loaded && Array.isArray(ALL) && !!MEK, false);
  const yo = () => g(() => MEK, null);
  const partido = (id) => g(() => MI.get(id), null);
  const nombre = (k) => g(() => fr(k).n, k);
  const avatar = (k) => g(() => av(k, 'sm'), '');
  const cliente = () => g(() => db, null);
  const mkp = (p) => !!(window.GM_MK && GM_MK.es(p));   // mercados nuevos (db/036): su equipo (o ninguno) y su nombre
  const lado = (p) => (p === '1' ? 'a' : p === '2' ? 'b' : p === 'X' ? 'x' : mkp(p) ? { 1: 'a', 2: 'b' }[GM_MK.lado(p)] || null : null);
  const eleccion = (m, p) => (!m ? '' : p === '1' ? m.a : p === '2' ? m.b : p === 'X' ? 'Empate' : mkp(p) ? GM_MK.nombre(m, p) : '');
  const marcador = (m) => String(m?.score || '').split(' ')[0];
  const ligaDe = (m) => (m ? g(() => L[m.lg]?.[0], '') || '' : '');
  const zona = { timeZone: 'Europe/Madrid' };
  const dk = (t) => new Intl.DateTimeFormat('es-ES', { ...zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
  const hm = (t) => new Intl.DateTimeFormat('es-ES', { ...zona, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t));
  const cuando = (t) => { const d = dk(t), hoy = Date.now(); if (d === dk(hoy)) return 'hoy ' + hm(t); if (d === dk(hoy - DIA)) return 'ayer ' + hm(t);
    return new Intl.DateTimeFormat('es-ES', { ...zona, weekday: 'short', day: 'numeric' }).format(new Date(t)).replace(/[.,]/g, '').toLowerCase() };
  const cap = (s) => String(s || '').replace(/^./, (c) => c.toUpperCase());
  // lo que de verdad se gana o se pierde (en un cash out con perdida solo la diferencia)
  const neto = (x) => (x.res === 'won' ? x.pay - (x.stake || 0) : x.res === 'lost' ? -((x.stake || 0) - (x.tipo === 'cash' ? x.pay : 0)) : 0);
  const perdido = (x) => -neto(x);

  /* ---------- los resultados ---------- */
  function apuestasDe(k) {
    const out = [];
    for (const b of g(() => ALL, [])) {
      if (!b || b.st === 'open' || !b.set || (k && b.k !== k)) continue;
      const m = partido(b.m), t = Date.parse(b.set);
      if (!isFinite(t)) continue;
      if (b.st === 'void' && m && t < Date.parse(m.at)) continue;   // la cancelo el jugador antes de empezar: no es un resultado
      out.push({ key: 'b' + b.id, k: b.k, t, tipo: b.cash ? 'cash' : 'apuesta', res: b.st === 'won' ? 'won' : b.st === 'lost' ? 'lost' : 'void', m, side: lado(b.p), pick: eleccion(m, b.p), o: b.cash ? null : b.o, stake: b.stake, pay: b.pay || 0 });
    }
    return out;
  }
  // predicciones rapidas: de la tabla ex_pred (las tuyas); si no se puede leer, del monedero (solo aciertos y devoluciones)
  let PRED = null, PRED_T = 0, PRED_OFF = false, PRED_VA = false;
  async function cargaPred() {
    const c = cliente(); if (!c || PRED_OFF || PRED_VA) return;
    PRED_VA = true;
    try {
      const { data, error } = await c.from('ex_pred').select('id,match_id,kind,pick,ref,n,stake,odds,status,payout,settled_at').order('id', { ascending: false }).limit(30);
      if (error) throw error;
      PRED = data || [];
    } catch { PRED_OFF = true; PRED = null }
    PRED_T = Date.now(); PRED_VA = false;
    revisa();
  }
  const predPide = () => {
    if (PRED_OFF || PRED_VA) return false;
    if (PRED == null) return true;
    if (Date.now() - PRED_T < 60e3) return false;
    return PRED.some((p) => p.status === 'open') || g(() => LEDGER, []).some((l) => /^pred_/.test(l.kind) && l.at > PRED_T - 5e3);
  };
  function predicciones() {
    if (PRED) return PRED.filter((p) => p.status !== 'open' && p.settled_at).map((p) => {
      const m = partido(p.match_id), eq = eleccion(m, p.pick) || (p.pick === '1' ? 'local' : 'visitante');
      return { key: 'p' + p.id, k: yo(), t: Date.parse(p.settled_at), tipo: 'pred', res: p.status === 'won' ? 'won' : p.status === 'lost' ? 'lost' : 'void', m, side: p.kind === 'ronda' ? lado(p.pick) : null,
        pick: p.kind === 'gol' ? `Gol en 10 min · ${p.pick === 'si' ? 'Sí' : 'No'}` : `Ronda ${p.n} de ${cap(p.ref)} · ${eq}`, o: Number(p.odds), stake: p.stake, pay: p.status === 'won' ? p.payout : p.status === 'void' ? p.stake : 0 };
    });
    if (!PRED_OFF) return [];
    return g(() => LEDGER, []).filter((l) => l.kind === 'pred_premio' || l.kind === 'pred_devol').map((l) => ({ key: 'lp' + l.at + ':' + l.a, k: yo(), t: l.at, tipo: 'pred', res: l.kind === 'pred_premio' ? 'won' : 'void', m: null, pick: String(l.d || 'Predicción rápida').replace(/ \d+,\d\d( ·.*)?$/, ''), o: null, stake: l.kind === 'pred_devol' ? l.a : null, pay: l.a }));
  }
  // el bote y los premios de la semana: del monedero
  const premios = () => g(() => LEDGER, []).filter((l) => l.kind === 'bote_gana' || l.kind === 'premio_semana').map((l) => ({ key: 'l' + l.kind + l.at, k: yo(), t: l.at, tipo: l.kind === 'bote_gana' ? 'bote' : 'semana', res: 'won', m: null, pick: l.kind === 'bote_gana' ? 'Bote de la semana' : l.d || 'Premio de la semana', o: null, stake: 0, pay: l.a }));
  // retos entre colegas
  // PM 01-11: los retos pueden ser de mas gente (2v1, 2v2...): la tarjeta sale a cada participante. rival = el primero del otro lado, mas = cuantos mas hay
  const retosDe = (k) => g(() => CH, []).filter((c) => g(() => GM_RETOS.dentro(c, k), c.from === k || c.to === k) && /^(won_|void)/.test(c.st) && c.set).map((c) => {
    const R = window.GM_RETOS, m = partido(c.m), e = R.pl(c).find((x) => x.k === k), ws = R.ganan(c), p = e ? e.p : c.fp;
    const otros = R.pl(c).filter((x) => x.p !== p).map((x) => x.k), rivales = otros.length ? otros : R.pl(c).filter((x) => x.k !== k).map((x) => x.k);
    return { key: 'r' + c.id, k, t: Date.parse(c.set), tipo: 'reto', res: c.st === 'void' ? 'void' : ws.includes(k) ? 'won' : 'lost', m, side: lado(p), pick: eleccion(m, p), rival: rivales[0], mas: Math.max(0, rivales.length - 1), nv: R.nvm(c), o: null, stake: c.stake, pay: R.pagoDe(c, k) };
  });
  const rv = (x) => nombre(x.rival) + (x.mas ? ` +${x.mas}` : '');
  // PM 02-11: "en results no salen los challenges": en De todos tambien salen los retos resueltos de los colegas (una fila por reto, la del primero que gana)
  const retosTodos = () => g(() => CH, []).filter((c) => /^won_/.test(c.st) && c.set).map((c) => {
    const R = window.GM_RETOS; if (!R) return null;
    const ws = R.ganan(c); if (!ws.length) return null;
    const k = ws[0], e = R.pl(c).find((x) => x.k === k), p = e ? e.p : c.fp, m = partido(c.m);
    const otros = R.pl(c).filter((x) => x.p !== p).map((x) => x.k);
    return { key: 'rt' + c.id, k, t: Date.parse(c.set), tipo: 'reto', res: 'won', m, side: lado(p), pick: eleccion(m, p), rival: otros[0], mas: Math.max(0, otros.length - 1), nv: R.nvm(c), o: null, stake: c.stake, pay: R.pagoDe(c, k) };
  }).filter((x) => x && isFinite(x.t));
  const mios = () => [...apuestasDe(yo()), ...predicciones(), ...premios(), ...retosDe(yo())].filter((x) => isFinite(x.t)).sort((a, b) => b.t - a.t);

  /* ---------- lo ya enseñado ---------- */
  let EST = null;
  function estado() {
    const k = 'gm-ganado:' + yo();
    if (EST && EST.k === k) return EST;
    let e = null; try { e = JSON.parse(lsGet(k) || 'null') } catch {}
    if (!e || typeof e.desde !== 'number') e = { desde: Date.now() - MIRA_ATRAS, vistos: {}, panel: 0 };   // la primera vez: lo de las ultimas 12 h
    if (!e.vistos || Array.isArray(e.vistos)) e.vistos = {};
    e.k = k; EST = e; guarda(); return e;
  }
  function guarda() {
    if (!EST) return;
    EST.desde = Math.max(EST.desde, Date.now() - OLVIDA);                 // lo de hace mas de una semana ya no se enseña
    for (const [k, t] of Object.entries(EST.vistos)) if (t < EST.desde) delete EST.vistos[k];
    lsSet(EST.k, JSON.stringify({ desde: EST.desde, vistos: EST.vistos, panel: EST.panel || 0 }));
  }
  const visto = (x) => !!EST?.vistos[x.key];
  const panelDesde = () => (EST ? Math.max(EST.panel || 0, EST.desde) : Date.now());

  /* ---------- sonido: un aviso propio, tambien con la pestaña de fondo ---------- */
  // sonidos.js apaga su audio al ocultarse la pestaña; este se despierta solo para sonar y se vuelve a dormir (sin gasto en reposo)
  let AC = null, MAS = null, dormir = 0;
  function audio() {
    if (AC) return AC;
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
    try { AC = new C(); MAS = AC.createGain(); MAS.gain.value = 0.9; const comp = AC.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 5; MAS.connect(comp); comp.connect(AC.destination) } catch { AC = null }
    return AC;
  }
  const duerme = () => { clearTimeout(dormir); dormir = setTimeout(() => { if (AC && AC.state === 'running') AC.suspend().catch(() => {}) }, 2600) };
  function despierta() {
    for (const e of ['pointerdown', 'keydown', 'touchend']) window.removeEventListener(e, despierta, true);
    const c = audio(); if (c && c.state !== 'running') c.resume().then(duerme, () => {}); else duerme();
  }
  for (const e of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(e, despierta, { capture: true, passive: true });
  function nota(f, en, dur, vol, tipo = 'sine') {
    const c = AC, t = c.currentTime + 0.03 + en, o = c.createOscillator(), v = c.createGain();
    o.type = tipo; o.frequency.setValueAtTime(f, t);
    v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(vol, t + 0.006); v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(v); v.connect(MAS); o.start(t); o.stop(t + dur + 0.05);
  }
  const SON = {
    // aviso de premio: dos campanadas (mi y si) con su brillo y una lluvia corta de monedas encima
    gana: () => { nota(1318.5, 0, 1.0, 0.17); nota(2637, 0, 0.4, 0.045); nota(1975.5, 0.13, 1.25, 0.17); nota(3951, 0.13, 0.45, 0.04); [2637, 3136, 3520, 4186, 5274].forEach((f, i) => nota(f, 0.27 + i * 0.05, 0.2, 0.028, 'triangle')) },
    // perdida o devuelta: dos notas graves muy bajitas
    pierde: () => { nota(392, 0, 0.22, 0.03); nota(311, 0.11, 0.3, 0.026) },
  };
  async function suena(tipo) {
    if (window.__gmSonidoLog) window.__gmSonidoLog.push('ganado:' + tipo);
    if (window.GM_SONIDOS && GM_SONIDOS.silenciado()) return;
    const c = AC; if (!c) return;                                          // sin un toque previo el navegador no deja sonar
    try { if (c.state !== 'running') await c.resume() } catch {}
    if (c.state !== 'running') return;
    try { SON[tipo]() } catch {}
    duerme();
  }

  /* ---------- notificacion del sistema (con el permiso que se pide en el perfil, "Activar avisos") ---------- */
  const AVISADO = new Set();
  async function avisaSistema(ganas) {
    const xs = ganas.filter((x) => !AVISADO.has(x.key)); xs.forEach((x) => AVISADO.add(x.key));
    if (!xs.length || !('Notification' in window) || Notification.permission !== 'granted') return;
    const tot = xs.reduce((a, x) => a + x.pay, 0), x = xs[0];
    const titulo = texto(`<span>${xs.length === 1 && x.tipo === 'cash' ? 'Has retirado' : 'Has ganado'}</span> +${N(tot)}`);
    let cuerpo, tag;
    if (xs.length === 1) {
      const m = x.m, pick = texto(`<span>${esc(x.pick)}</span>`) + (x.o ? ' ' + O(x.o) : '');
      cuerpo = m ? `${pick} · ${m.a} ${marcador(m)} ${m.b}`.replace(/\s+/g, ' ') : pick;
      // la misma etiqueta que el aviso de app.js para una apuesta ganada: si salen los dos, el segundo sustituye al primero
      tag = x.tipo === 'apuesta' && m ? `¡Has ganado ${N(x.pay)}!${x.pick} · ${m.a} ${m.score || ''} ${m.b}` : 'gnd-' + x.key;
    } else { cuerpo = texto(`<span>${xs.length} premios nuevos</span>`); tag = 'gnd-varios' }
    const icon = document.querySelector('link[rel=icon]')?.href, op = { body: cuerpo, icon, badge: icon, tag };
    try { const n = new Notification(titulo, op); n.onclick = () => { try { window.focus() } catch {} n.close() }; return } catch {}
    try { const r = await navigator.serviceWorker?.getRegistration(); if (r) r.showNotification(titulo, op) } catch {}   // en el movil solo hay notificaciones desde un service worker
  }

  /* ---------- deteccion ---------- */
  const CARGA = Date.now();
  let RES = [], FIRMA = [], COLA = [], SONADO = new Set(), ESPERA = false, prog = 0;
  function revisa() {
    if (!listo()) return;
    cuelgaBoton();
    const f = [g(() => ALL), g(() => LEDGER), g(() => CH), PRED, yo()];
    if (f.every((x, i) => x === FIRMA[i])) { if (COLA.length) programa(); return }
    FIRMA = f;
    if (predPide()) cargaPred();
    const e = estado();
    RES = mios();
    const nuevos = RES.filter((x) => x.t > e.desde && !visto(x) && !COLA.some((y) => y.key === x.key) && !TARJ?.xs.some((y) => y.key === x.key));
    if (nuevos.length) llegan(nuevos); else if (COLA.length) programa();
    pintaBoton();
    if (PANEL) pintaPanel();
  }
  function llegan(xs) {
    if (document.hidden) ESPERA = true;                                    // se enseñan como "desde la ultima vez"
    COLA.push(...xs);
    const ganas = xs.filter((x) => x.res === 'won');
    if (ganas.length && (document.hidden || !document.hasFocus())) { suena('gana'); ganas.forEach((x) => SONADO.add(x.key)); avisaSistema(ganas) }
    programa();
  }
  function programa() { if (document.hidden || prog) return; prog = setTimeout(() => { prog = 0; muestra() }, 700) }
  function muestra() {
    if (document.hidden || !COLA.length) return;
    if (PRED == null && !PRED_OFF && Date.now() - CARGA < 3000) { prog = setTimeout(() => { prog = 0; muestra() }, 400); return }
    if (!document.getElementById('login')?.hidden || document.getElementById('app')?.hidden) return;
    const xs = COLA.splice(0), lejos = ESPERA || xs.some((x) => x.t < CARGA); ESPERA = false;   // paso antes de abrir la app o con ella de fondo
    for (const x of xs) EST.vistos[x.key] = x.t;
    guarda();
    const ganas = xs.filter((x) => x.res === 'won'), malas = xs.filter((x) => x.res !== 'won');
    if (ganas.length || TARJ || malas.some((x) => x.res === 'lost')) tarjeta(ganas, malas, lejos);   // PM 01-11: tambien al perder, no solo al ganar
    else lineas(malas);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { revisa(); programa() } });
  window.addEventListener('focus', () => { if (TARJ && !TARJ.t) arrancaReloj() });

  /* ---------- la tarjeta ---------- */
  function escudo(m, side, cls = '') {
    if (!m) return '';
    const src = side === 'a' ? m.la : m.lb, nm = side === 'a' ? m.a : m.b;
    return src ? `<img class="gnd-e ${m.s === 'u' ? 'face' : ''} ${cls}" src="${esc(src)}" alt="${esc(nm)}" onerror="this.style.visibility='hidden'">`
      : `<span class="gnd-e gnd-ini ${cls}">${esc(String(nm || '?').replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase())}</span>`;
  }
  // el icono de una fila: el escudo de lo que elegiste, una X para el empate o la moneda para los premios
  const icono = (x) => (x.m && (x.side === 'a' || x.side === 'b') ? escudo(x.m, x.side) : x.m && x.side === 'x' ? '<span class="gnd-e gnd-ini">X</span>' : x.m ? `<span class="gnd-dos">${escudo(x.m, 'a')}${escudo(x.m, 'b')}</span>` : '<span class="cn gnd-cn"></span>');
  const ETIQ = { apuesta: 'Apuesta ganada', pred: 'Predicción acertada', cash: 'Cash out', reto: 'Reto ganado', bote: 'Bote de la semana', semana: 'Premio de la semana' };
  const partidoLinea = (m) => (m ? `<span>${esc(m.a)}</span> <span class="gnd-sc2">${esc(marcador(m) || 'vs')}</span> <span>${esc(m.b)}</span>` : '');
  function htmlUna(x) {
    const m = x.m, liga = ligaDe(m), sub = x.tipo === 'semana' ? `<p class="gnd-st"><span>${esc(x.pick)}</span></p>`
      : x.tipo === 'reto' ? `<p class="gnd-st"><span>Reto</span> <em>${x.nv}</em> <span>contra</span> <b>${esc(rv(x))}</b> · <span>Apostaste</span> <b>${N(x.stake)}</b></p>`
      : x.stake ? `<p class="gnd-st"><span>Apostaste</span> <b>${N(x.stake)}</b> · <b class="gnd-up">+${N(x.pay - x.stake)}</b> <span>limpias</span></p>` : '';
    return `<div class="gnd-c uno" role="dialog" aria-modal="true" aria-label="${esc(ETIQ[x.tipo])}">
      <span class="gnd-lab"><i></i><span>${ETIQ[x.tipo]}</span></span>
      ${liga ? `<span class="gnd-liga">${esc(liga)}</span>` : ''}
      ${m ? `<div class="gnd-vs ${x.side ? 'el-' + x.side : ''}"><span class="gnd-sd a">${escudo(m, 'a')}</span><span class="gnd-sc">${esc(marcador(m) || 'vs')}</span><span class="gnd-sd b">${escudo(m, 'b')}</span></div>
        <p class="gnd-eq"><span>${esc(m.a)}</span> <i>vs</i> <span>${esc(m.b)}</span></p>` : '<div class="gnd-vs premio"><span class="cn gnd-moneda"></span></div>'}
      <span class="gnd-has">${x.tipo === 'cash' ? 'Has retirado' : 'Has ganado'}</span>
      <b class="gnd-amt"><span data-gnd-n="${x.pay}">+${N(x.pay)}</span>${coin}</b>
      ${m && x.pick ? `<p class="gnd-pk"><span class="gnd-tu">Tu elección</span> <b>${esc(x.pick)}</b>${x.o ? ` <em>${O(x.o)}</em>` : ''}</p>` : ''}
      ${sub}${!m && x.pick && x.tipo === 'pred' ? `<p class="gnd-st"><span>${esc(x.pick)}</span></p>` : ''}
      ${pieTarjeta()}
    </div>`;
  }
  function htmlVarias(ganas, malas, lejos) {
    const tot = ganas.reduce((a, x) => a + x.pay, 0), max = 5, ver = ganas.slice(0, max), resto = ganas.length - ver.length;
    const pm = malas.filter((x) => x.res === 'lost'), dv = malas.filter((x) => x.res === 'void');
    return `<div class="gnd-c varias" role="dialog" aria-modal="true" aria-label="Resultados">
      <span class="gnd-lab"><i></i><span>${lejos ? 'Desde la última vez' : 'Resultados nuevos'}</span></span>
      <span class="gnd-has">Has ganado</span>
      <b class="gnd-amt"><span data-gnd-n="${tot}">+${N(tot)}</span>${coin}</b>
      ${ganas.length ? `<div class="gnd-l">${ver.map((x) => `<div class="gnd-r"><span class="gnd-ri">${icono(x)}</span><span class="gnd-rt"><b>${esc(x.tipo === 'bote' || x.tipo === 'semana' ? ETIQ[x.tipo] : x.pick)}</b>${x.o ? ` <em>${O(x.o)}</em>` : x.tipo === 'cash' ? ' <em>Cash out</em>' : ''}<small>${x.m ? partidoLinea(x.m) : x.tipo === 'semana' ? `<span>${esc(x.pick)}</span>` : ''}</small></span><b class="gnd-rv">+${N(x.pay)}${coin}</b></div>`).join('')}
        ${resto > 0 ? `<p class="gnd-mas"><b>+${resto}</b> <span>más en Resultados</span></p>` : ''}</div>` : ''}
      ${pm.length ? `<p class="gnd-pd"><span>También</span> <b>${pm.length}</b> <span>${pm.length === 1 ? 'perdida' : 'perdidas'}</span> <b class="gnd-ko">▼ ${N(pm.reduce((a, x) => a + perdido(x), 0))}</b>${coin}</p>` : ''}
      ${dv.length ? `<p class="gnd-pd"><b>${dv.length}</b> <span>${dv.length === 1 ? 'devuelta' : 'devueltas'}</span> <b>${N(dv.reduce((a, x) => a + x.pay, 0))}</b>${coin}</p>` : ''}
      ${pieTarjeta()}
    </div>`;
  }
  const pieTarjeta = () => `<span class="gnd-tap">Toca para cerrar</span><i class="gnd-bar"></i>`;

  let TARJ = null;
  function tarjeta(ganas, malas, lejos) {
    if (TARJ) { ganas = [...TARJ.ganas, ...ganas]; malas = [...TARJ.malas, ...malas]; lejos = lejos || TARJ.lejos; quitaTarjeta(true) }
    if (!ganas.length) { tarjetaPerdida(malas, lejos); return }
    const ov = document.createElement('div');
    ov.className = 'gnd-ov'; ov.id = 'gnd';
    ov.innerHTML = ganas.length === 1 && !malas.length ? htmlUna(ganas[0]) : ganas.length === 1 && !lejos ? htmlUna(ganas[0]) : htmlVarias(ganas, malas, lejos);
    traduce(ov);
    document.body.appendChild(ov);
    TARJ = { el: ov, ganas, malas, lejos, xs: [...ganas, ...malas], t: 0 };
    if (ganas.length === 1 && malas.length && !lejos) setTimeout(() => lineas(malas), 300);   // una ganada y alguna perdida a la vez: la perdida, en su linea
    // sonido: el aviso si no ha sonado ya con la pestaña de fondo; si ya sono, las monedas de sonidos.js al volver
    if (ganas.some((x) => !SONADO.has(x.key))) suena('gana');
    else try { window.dispatchEvent(new CustomEvent('gm:sonido', { detail: 'cobrar' })) } catch {}
    ganas.forEach((x) => SONADO.add(x.key));
    const n = ov.querySelector('[data-gnd-n]');
    if (n) cuenta(n, +n.dataset.gndN);
    requestAnimationFrame(() => {
      const r = (n || ov).getBoundingClientRect(), x0 = r.left + r.width / 2, y0 = r.top + r.height / 2;
      if (!document.querySelector('canvas.confeti')) g(() => confeti(x0, y0));   // si app.js ya ha tirado el suyo, no se dobla
      if (ganas.length > 1) setTimeout(() => g(() => confeti(x0, y0 - 40)), 380);
    });
    if (document.hasFocus()) arrancaReloj(); else ov.classList.add('quieta');
  }
  function arrancaReloj() {
    if (!TARJ || TARJ.t) return;
    TARJ.el.classList.remove('quieta');
    TARJ.t = setTimeout(cierraTarjeta, DURA);
  }
  function cuenta(el, to) {
    if (sinAnim()) { el.textContent = '+' + N(to); return }
    const t0 = performance.now(), d = 950;
    (function f(t) { const k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3); el.textContent = '+' + N(to * e); if (k < 1 && el.isConnected) requestAnimationFrame(f) })(t0);
  }
  function cierraTarjeta() {
    if (!TARJ) return;
    const n = TARJ.perdida ? null : TARJ.el.querySelector('.gnd-amt .cn');
    if (n && !sinAnim()) [0, 90, 180].forEach((d) => setTimeout(() => g(() => vuela(n)), d));   // las monedas vuelan al saldo
    quitaTarjeta(false);
  }
  function quitaTarjeta(ya) {
    const t = TARJ; if (!t) return; TARJ = null; clearTimeout(t.t);
    if (ya || sinAnim()) { t.el.remove(); return }
    t.el.classList.add('sale'); setTimeout(() => t.el.remove(), 320);
  }

  /* ---------- la tarjeta de perdida (PM 01-11: "cuando pierdas tambien que salga you lost como you won; me acaba de pasar con el
     challenge a Darkam y no le ha llegado nada en la pantalla"): sin confeti ni monedas, en rojo apagado y con un sonido grave ---------- */
  const ETIQP = { apuesta: 'Apuesta perdida', pred: 'Predicción fallada', cash: 'Cash out con pérdida', reto: 'Reto perdido' };
  function htmlPerdidaUna(x) {
    const m = x.m, liga = ligaDe(m), sub = x.tipo === 'reto' ? `<p class="gnd-st"><span>Reto</span> <em>${x.nv}</em> <span>contra</span> <b>${esc(rv(x))}</b> · <span>Apostaste</span> <b>${N(x.stake)}</b></p>`
      : x.stake ? `<p class="gnd-st"><span>Apostaste</span> <b>${N(x.stake)}</b></p>` : '';
    return `<div class="gnd-c uno perdida" role="dialog" aria-modal="true" aria-label="${esc(ETIQP[x.tipo] || 'Perdida')}">
      <span class="gnd-lab"><i></i><span>${ETIQP[x.tipo] || 'Perdida'}</span></span>
      ${liga ? `<span class="gnd-liga">${esc(liga)}</span>` : ''}
      ${m ? `<div class="gnd-vs ${x.side ? 'el-' + x.side : ''}"><span class="gnd-sd a">${escudo(m, 'a')}</span><span class="gnd-sc">${esc(marcador(m) || 'vs')}</span><span class="gnd-sd b">${escudo(m, 'b')}</span></div>
        <p class="gnd-eq"><span>${esc(m.a)}</span> <i>vs</i> <span>${esc(m.b)}</span></p>` : ''}
      <span class="gnd-has">Has perdido</span>
      <b class="gnd-amt"><span>−${N(perdido(x))}</span>${coin}</b>
      ${m && x.pick ? `<p class="gnd-pk"><span class="gnd-tu">Tu elección</span> <b>${esc(x.pick)}</b>${x.o ? ` <em>${O(x.o)}</em>` : ''}</p>` : ''}
      ${sub}
      ${pieTarjeta()}
    </div>`;
  }
  function htmlPerdidaVarias(pm, lejos) {
    const tot = pm.reduce((a, x) => a + perdido(x), 0), max = 5, ver = pm.slice(0, max), resto = pm.length - ver.length;
    return `<div class="gnd-c varias perdida" role="dialog" aria-modal="true" aria-label="Resultados">
      <span class="gnd-lab"><i></i><span>${lejos ? 'Desde la última vez' : 'Resultados nuevos'}</span></span>
      <span class="gnd-has">Has perdido</span>
      <b class="gnd-amt"><span>−${N(tot)}</span>${coin}</b>
      <div class="gnd-l">${ver.map((x) => `<div class="gnd-r"><span class="gnd-ri">${icono(x)}</span><span class="gnd-rt"><b>${esc(x.tipo === 'reto' ? 'Reto con ' + rv(x) : x.pick)}</b>${x.o ? ` <em>${O(x.o)}</em>` : ''}<small>${x.m ? partidoLinea(x.m) : ''}</small></span><b class="gnd-rv gnd-ko">−${N(perdido(x))}${coin}</b></div>`).join('')}
        ${resto > 0 ? `<p class="gnd-mas"><b>+${resto}</b> <span>más en Resultados</span></p>` : ''}</div>
      ${pieTarjeta()}
    </div>`;
  }
  function tarjetaPerdida(malas, lejos) {
    const pm = malas.filter((x) => x.res === 'lost'), dv = malas.filter((x) => x.res !== 'lost');
    if (!pm.length) { lineas(malas); return }
    const ov = document.createElement('div');
    ov.className = 'gnd-ov perd'; ov.id = 'gnd';
    ov.innerHTML = pm.length === 1 ? htmlPerdidaUna(pm[0]) : htmlPerdidaVarias(pm, lejos);
    traduce(ov);
    document.body.appendChild(ov);
    TARJ = { el: ov, ganas: [], malas, lejos, xs: [...malas], t: 0, perdida: true };
    if (dv.length) setTimeout(() => lineas(dv), 300);
    suena('pierde');
    if (document.hasFocus()) arrancaReloj(); else ov.classList.add('quieta');
  }

  /* ---------- perdidas y devueltas: una linea discreta ---------- */
  function lineaHtml(x) {
    const nm = x.pick || '';
    if (x.tipo === 'cash') return `<span>Cash out con</span> <em>${esc(nm)}</em> <b>▼ ${N(perdido(x))}</b>${coin}`;
    if (x.tipo === 'reto') return x.res === 'void' ? `<span>Reto devuelto</span> <b>${N(x.pay)}</b>${coin}` : `<span>Perdiste el reto con</span> <em>${esc(rv(x))}</em> <b>▼ ${N(x.stake)}</b>${coin}`;
    if (x.res === 'void') return `<span>Te devolvemos</span> <b>${N(x.pay)}</b>${coin}${x.m ? ` <small>${esc(x.m.a)} <i>vs</i> ${esc(x.m.b)}</small>` : ` <small>${esc(nm)}</small>`}`;
    return `<span>Perdiste</span> <b>${N(x.stake)}</b>${coin} <span>con</span> <em>${esc(nm)}</em>${x.m ? ` <small>${esc(x.m.a)} ${esc(marcador(x.m) || 'vs')} ${esc(x.m.b)}</small>` : ''}`;
  }
  function lineas(xs) {
    if (!xs.length) return;
    let box = document.getElementById('gnd-ts');
    if (!box) { box = document.createElement('div'); box.id = 'gnd-ts'; box.className = 'gnd-ts'; document.body.appendChild(box) }
    const pm = xs.filter((x) => x.res === 'lost'), dv = xs.length - pm.length;
    const html = xs.length > 3
      ? [`<i></i>${pm.length ? `<span>${pm.length} ${pm.length === 1 ? 'perdida' : 'perdidas'}</span> <b>▼ ${N(pm.reduce((a, x) => a + perdido(x), 0))}</b>${coin}` : ''}${dv ? ` <small>${dv} ${dv === 1 ? 'devuelta' : 'devueltas'}</small>` : ''}`]
      : xs.map((x) => `<i></i>${lineaHtml(x)}`);
    const cls = xs.length > 3 ? [pm.length ? 'lost' : 'void'] : xs.map((x) => (x.res === 'void' ? 'void' : 'lost'));
    html.forEach((h, i) => {
      const l = document.createElement('button');
      l.type = 'button'; l.className = 'gnd-tl ' + cls[i]; l.dataset.gnd = 'linea'; l.innerHTML = h; traduce(l);
      box.appendChild(l);
      while (box.children.length > 3) box.firstElementChild.remove();
      setTimeout(() => { if (sinAnim()) return l.remove(); l.classList.add('sale'); setTimeout(() => l.remove(), 300) }, 5200 + i * 400);
    });
    if (xs.some((x) => x.res === 'lost')) suena('pierde');
  }

  /* ---------- la campanita y el panel de resultados ---------- */
  let BOTON = null, PANEL = false, TAB = 'mios', ANTES = 0;
  function cuelgaBoton() {
    const top = document.getElementById('top'); if (!top || !top.childElementCount) return;
    if (!BOTON) { BOTON = document.createElement('button'); BOTON.type = 'button'; BOTON.className = 'gnd-b'; BOTON.dataset.gnd = 'panel'; pintaBoton() }
    const ref = top.querySelector('.claim');
    if (ref) { if (ref.nextElementSibling !== BOTON) ref.after(BOTON) }
    else if (BOTON.parentNode !== top) top.insertBefore(BOTON, top.querySelector('.onl, .bal'));
  }
  function pintaBoton() {
    if (!BOTON) return;
    const hay = EST ? RES.some((x) => x.t > panelDesde()) : false, clave = hay + '|' + PANEL + '|' + (window.GM_LANG ? GM_LANG.get() : '');
    if (BOTON.dataset.k === clave) return;
    BOTON.dataset.k = clave;
    BOTON.className = `gnd-b ${hay ? 'hay' : ''} ${PANEL ? 'on' : ''}`;
    BOTON.innerHTML = `<i class="gnd-ic">${IC_BELL}<span class="gnd-pt"></span></i><span class="gnd-bl">Resultados</span>`;
    BOTON.setAttribute('aria-label', hay ? 'Resultados nuevos' : 'Resultados'); BOTON.title = BOTON.getAttribute('aria-label');
    BOTON.setAttribute('aria-expanded', String(PANEL));
    traduce(BOTON);
  }
  function abrePanel() {
    if (!listo()) return;
    estado(); ANTES = panelDesde(); PANEL = true; EST.panel = Date.now(); guarda();
    try { if (S.rew || S.nvp) { S.rew = false; S.nvp = false; render() } } catch {}
    pintaPanel(true); pintaBoton();
  }
  function cierraPanel() { if (!PANEL) return; PANEL = false; document.getElementById('gnd-p')?.remove(); pintaBoton() }
  function filaMia(x, nuevo) {
    const cls = x.res + (nuevo ? ' nuevo' : '');
    const tit = x.tipo === 'bote' || x.tipo === 'semana' ? ETIQ[x.tipo] : x.pick || ETIQ[x.tipo];
    const que = x.tipo === 'pred' ? 'Predicción rápida' : x.tipo === 'cash' ? 'Cash out' : x.tipo === 'reto' ? null : x.tipo === 'semana' ? x.pick : null;
    const det = [que ? `<span>${esc(que)}</span>` : '', x.tipo === 'reto' ? `<span>Reto</span> <span>${x.nv}</span> <span>contra</span> <span>${esc(rv(x))}</span>` : '', x.m ? partidoLinea(x.m) : '', `<span>${esc(cuando(x.t))}</span>`].filter(Boolean).join(' · ');
    const val = x.res === 'won' ? `+${N(x.pay)}` : x.res === 'lost' ? `▼ ${N(perdido(x))}` : `${N(x.pay)}`;
    return `<div class="gnd-pr ${cls}"><span class="gnd-pi">${icono(x)}</span><span class="gnd-pt2"><span class="gnd-pn"><b>${esc(tit)}</b>${x.o ? ` <em>${O(x.o)}</em>` : ''}${nuevo ? ' <i class="gnd-nv">Nuevo</i>' : ''}</span><small>${det}</small></span><span class="gnd-pv"><b>${val}${coin}</b>${x.res === 'void' ? '<small>devuelta</small>' : ''}</span></div>`;
  }
  function filaTodos(x) {
    const verbo = x.res === 'won' ? (x.tipo === 'cash' ? 'retiró' : 'ganó') : x.res === 'lost' ? (x.tipo === 'cash' ? 'retiró' : 'perdió') : 'recupera';
    const cant = x.res === 'won' || x.tipo === 'cash' ? x.pay : x.stake;
    return `<div class="gnd-pr ${x.res}"><span class="gnd-pi">${avatar(x.k)}</span><span class="gnd-pt2"><span class="gnd-fr"><b>${esc(nombre(x.k))}</b> <span class="gnd-vb">${verbo}</span> <b class="gnd-q">${N(cant)}</b>${coin} <span>con</span> <em>${esc(x.pick)}</em>${x.o ? ` <i>${O(x.o)}</i>` : ''}</span><small>${x.tipo === 'reto' && x.rival ? `<span>Reto</span> <span>${x.nv}</span> <span>contra</span> <span data-notr>${esc(rv(x))}</span> · ` : ''}${x.m ? partidoLinea(x.m) + ' · ' : ''}<span>${esc(cuando(x.t))}</span></small></span><span class="gnd-pi gnd-pe">${x.m && (x.side === 'a' || x.side === 'b') ? escudo(x.m, x.side) : ''}</span></div>`;
  }
  function pintaPanel(nuevo) {
    let el = document.getElementById('gnd-p');
    if (!PANEL) { el?.remove(); return }
    if (!el) { el = document.createElement('div'); el.id = 'gnd-p'; document.body.appendChild(el); nuevo = true }
    const scroll = el.querySelector('.gnd-p')?.scrollTop || 0;
    let cuerpo;
    if (TAB === 'mios') {
      const xs = RES.slice(0, 40), sem = RES.filter((x) => x.t > Date.now() - 7 * DIA), v = sem.reduce((a, x) => a + neto(x), 0);
      const gn = sem.filter((x) => x.res === 'won').length, pr = sem.filter((x) => x.res === 'lost').length;
      cuerpo = `${sem.length ? `<div class="gnd-sum"><span class="lab">Últimos 7 días</span><b class="${v > 0 ? 'up' : v < 0 ? 'dn' : ''}">${v ? `<i>${v > 0 ? '▲' : '▼'}</i>` : ''}${N(Math.abs(v))}${coin}</b><small><b>${gn}</b> <span>${gn === 1 ? 'ganada' : 'ganadas'}</span> · <b>${pr}</b> <span>${pr === 1 ? 'perdida' : 'perdidas'}</span></small></div>` : ''}
        <div class="gnd-pl">${xs.map((x) => filaMia(x, x.t > ANTES)).join('') || '<p class="hint">Todavía no hay resultados.</p>'}</div>
        <button class="gnd-ir" data-scr="apuestas">Ver mis apuestas <span>›</span></button>`;
    } else {
      const xs = [...apuestasDe(null), ...retosTodos()].sort((a, b) => b.t - a.t).slice(0, 40);
      cuerpo = `<div class="gnd-pl todos">${xs.map(filaTodos).join('') || '<p class="hint">Todavía no hay resultados.</p>'}</div>
        <button class="gnd-ir" data-gnd="feed">Ver el Feed <span>›</span></button>`;
    }
    el.innerHTML = `<div class="rw-fondo gnd-fondo" data-gnd="cerrar-p"></div><aside class="rw2 gnd-p ${nuevo ? 'abre' : ''}" role="dialog" aria-label="Resultados">
      <header><span class="rw-gi gnd-gi">${IC_BELL}</span><h2>Resultados</h2><button class="rw-x" data-gnd="cerrar-p" aria-label="Cerrar">${IC_X}</button></header>
      <nav class="gnd-tabs"><button class="${TAB === 'mios' ? 'on' : ''}" data-gnd-tab="mios">Tuyos</button><button class="${TAB === 'todos' ? 'on' : ''}" data-gnd-tab="todos">De todos</button></nav>
      ${cuerpo}</aside>`;
    traduce(el);
    if (!nuevo) { const p = el.querySelector('.gnd-p'); if (p) p.scrollTop = scroll }
  }

  /* ---------- toques ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('#gnd')) { cierraTarjeta(); return }
    const tab = t.closest('[data-gnd-tab]'); if (tab) { TAB = tab.dataset.gndTab; pintaPanel(); return }
    const b = t.closest('[data-gnd]');
    if (b) {
      const a = b.dataset.gnd;
      if (a === 'panel') PANEL ? cierraPanel() : abrePanel();
      else if (a === 'cerrar-p') cierraPanel();
      else if (a === 'linea') { b.remove(); abrePanel() }
      else if (a === 'feed') { cierraPanel(); try { S.scr = 'chat'; S.ct = 'feed'; S.nvp = false; S.rew = false; document.getElementById('view').scrollTop = 0; render() } catch {} }
      return;
    }
    if (PANEL && (t.closest('#gnd-p [data-scr], #gnd-p [data-prof]') || t.closest('[data-act=rw], [data-act=nvp]'))) cierraPanel();
  });
  document.addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; if (TARJ) cierraTarjeta(); else if (PANEL) cierraPanel() });

  /* ---------- montaje: la app repinta la cabecera en cada render (y tras cada recarga de datos) ---------- */
  let pend = false;
  const vigila = () => { if (pend) return; pend = true; queueMicrotask(() => { pend = false; try { revisa() } catch (e) { if (!vigila.avisado) { vigila.avisado = 1; console.warn('ganado.js', e) } } }) };
  const top = document.getElementById('top');
  if (top) new MutationObserver(vigila).observe(top, { childList: true });
  vigila();
  window.GM_GANADO = { revisa, abre: abrePanel, cierra: cierraPanel };

  const css = document.createElement('style');
  css.textContent = `
.gnd-b{display:inline-flex;align-items:center;gap:8px;flex:none;margin-left:-6px;padding:7px 14px 7px 10px;border-radius:999px;background:rgba(255,255,255,.07);color:var(--soft);font:700 12px var(--sans);white-space:nowrap;transition:background .2s,color .2s,box-shadow .2s}
.gnd-b:hover{background:rgba(255,255,255,.12)}
.gnd-b.hay{background:rgba(43,212,125,.15);color:#93f1c0}
.gnd-b.hay:hover{background:rgba(43,212,125,.24)}
.gnd-b.on{box-shadow:0 0 0 2px var(--win)}
.gnd-ic{position:relative;display:grid;font-style:normal}
.gnd-ic svg{width:16px;height:16px}
.gnd-pt{display:none;position:absolute;top:-3px;right:-3px;width:8px;height:8px;border-radius:50%;background:var(--win);box-shadow:0 0 0 2px var(--bg)}
.gnd-b.hay .gnd-pt{display:block;animation:gndLate 2.2s ease-out infinite}
.gnd-b.hay .gnd-ic svg{animation:gndTilin 3.2s ease-in-out infinite;transform-origin:50% 12%}
@keyframes gndLate{0%{box-shadow:0 0 0 2px var(--bg),0 0 0 2px rgba(43,212,125,.55)}70%,100%{box-shadow:0 0 0 2px var(--bg),0 0 0 9px rgba(43,212,125,0)}}
@keyframes gndTilin{0%,80%,100%{transform:rotate(0)}84%{transform:rotate(14deg)}88%{transform:rotate(-12deg)}92%{transform:rotate(8deg)}96%{transform:rotate(-4deg)}}
@media (max-width:1300px){.gnd-b .gnd-bl{display:none}.gnd-b{padding:7px;margin-left:-10px}}
@media (max-width:860px){.gnd-b{margin-left:-6px}}
@media (max-width:430px){.top{gap:10px}.gnd-b{margin-left:-4px;padding:6px}}

.gnd-ov{position:fixed;inset:0;z-index:88;display:grid;place-items:center;padding:20px 16px calc(20px + env(safe-area-inset-bottom,0px));background:rgba(6,8,11,.66);-webkit-backdrop-filter:blur(7px);backdrop-filter:blur(7px);cursor:pointer;animation:gndFondo .3s var(--ease)}
.gnd-ov.sale{animation:gndFondoSale .3s var(--ease) forwards}
.gnd-c{position:relative;display:grid;justify-items:center;width:min(420px,100%);max-height:calc(100vh - 40px);max-height:calc(100dvh - 40px);overflow:hidden;padding:30px 30px 34px;border-radius:30px;text-align:center;isolation:isolate;
  background:radial-gradient(120% 52% at 50% 0%,rgba(242,193,78,.22),transparent 64%),radial-gradient(90% 34% at 50% 100%,rgba(43,212,125,.1),transparent 70%),#181b22;box-shadow:0 40px 120px rgba(0,0,0,.7);animation:gndEntra .6s cubic-bezier(.2,1.25,.3,1)}
.gnd-c::before{content:"";position:absolute;z-index:-1;left:50%;top:-58%;width:170%;aspect-ratio:1;margin-left:-85%;background:repeating-conic-gradient(rgba(242,193,78,.075) 0 7deg,transparent 7deg 18deg);-webkit-mask:radial-gradient(closest-side,#000 22%,transparent 72%);mask:radial-gradient(closest-side,#000 22%,transparent 72%);animation:gndGira 22s linear infinite;pointer-events:none}
.gnd-ov.sale .gnd-c{animation:gndSale .3s var(--ease) forwards}
@keyframes gndFondo{from{opacity:0}}
@keyframes gndFondoSale{to{opacity:0}}
@keyframes gndEntra{from{opacity:0;transform:translateY(26px) scale(.86)}}
@keyframes gndSale{to{opacity:0;transform:translateY(-14px) scale(.95)}}
@keyframes gndGira{to{transform:rotate(360deg)}}
.gnd-lab{display:inline-flex;align-items:center;gap:8px;font:600 11px var(--mono);letter-spacing:.18em;text-transform:uppercase;color:var(--win)}
.gnd-lab i{width:7px;height:7px;border-radius:50%;background:var(--win);box-shadow:0 0 12px var(--win)}
.gnd-liga{margin-top:6px;font:11px var(--mono);letter-spacing:.06em;color:var(--dim);max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gnd-vs{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:18px;width:100%;margin:22px 0 10px}
.gnd-vs.premio{display:flex;justify-content:center;margin:20px 0 6px}
.gnd-sd{display:grid;place-items:center;transition:opacity .3s,filter .3s}
.gnd-sd.a{justify-self:end}.gnd-sd.b{justify-self:start}
.gnd-vs.el-a .gnd-sd.b,.gnd-vs.el-b .gnd-sd.a{opacity:.32;filter:grayscale(.7)}
.gnd-vs.el-a .gnd-sd.a .gnd-e,.gnd-vs.el-b .gnd-sd.b .gnd-e{width:78px;height:78px;filter:drop-shadow(0 10px 26px rgba(242,193,78,.28))}
.gnd-e{display:grid;place-items:center;width:62px;height:62px;object-fit:contain}
.gnd-e.face{border-radius:50%;object-fit:cover;object-position:50% 12%;background:#121418}
.gnd-ini{border-radius:50%;background:rgba(255,255,255,.08);font:800 18px var(--disp);color:var(--soft)}
.gnd-sc{font:500 30px/1 var(--mono);letter-spacing:-.04em;color:var(--ink);white-space:nowrap}
.gnd-moneda{--s:96px;margin:0;filter:drop-shadow(0 14px 34px rgba(242,193,78,.35));animation:gndMoneda 2.8s ease-in-out infinite}
@keyframes gndMoneda{50%{transform:translateY(-6px) rotate(-6deg)}}
.gnd-eq{display:flex;justify-content:center;align-items:baseline;gap:8px;max-width:100%;font:600 13px var(--sans);color:var(--mute)}
.gnd-eq span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gnd-eq i{font:11px var(--mono);font-style:normal;color:var(--dim)}
.gnd-has{margin-top:22px;font:700 15px var(--sans);color:var(--soft)}
.gnd-c.varias .gnd-has{margin-top:16px}
.gnd-amt{display:flex;align-items:center;justify-content:center;margin-top:2px;font:800 76px/1 var(--disp);letter-spacing:-.05em;font-variant-numeric:tabular-nums;background:linear-gradient(180deg,#fff3c4,var(--acc2) 38%,var(--acc) 100%);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 6px 24px rgba(242,193,78,.25))}
.gnd-amt .cn{--s:.56em;margin-left:.12em;filter:drop-shadow(0 4px 10px rgba(0,0,0,.5))}
.gnd-pk{display:flex;flex-wrap:wrap;justify-content:center;align-items:baseline;gap:4px 8px;margin-top:20px;font:15px var(--sans)}
.gnd-tu{font:500 10px var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--dim)}
.gnd-pk b{font-weight:700;color:var(--ink)}
.gnd-pk em{font:500 15px var(--mono);font-style:normal;color:var(--acc)}
.gnd-st{margin-top:8px;font:12px var(--mono);color:var(--dim)}
.gnd-st b{font-weight:500;color:var(--soft)}
.gnd-up{color:var(--win)!important}
.gnd-c.perdida{background:radial-gradient(120% 52% at 50% 0%,rgba(224,100,111,.2),transparent 64%),radial-gradient(90% 34% at 50% 100%,rgba(224,100,111,.07),transparent 70%),#181b22}
.gnd-c.perdida::before{background:repeating-conic-gradient(rgba(224,100,111,.05) 0 7deg,transparent 7deg 18deg);animation-duration:60s}
.gnd-c.perdida .gnd-lab{color:#ff8f98}
.gnd-c.perdida .gnd-lab i{background:#ff8f98;box-shadow:0 0 12px #ff8f98}
.gnd-c.perdida .gnd-amt{background:linear-gradient(180deg,#ffd9dc,#ff8f98 45%,#e0646f 100%);-webkit-background-clip:text;background-clip:text;filter:drop-shadow(0 6px 24px rgba(224,100,111,.22))}
.gnd-c.perdida .gnd-bar::after{background:linear-gradient(90deg,#e0646f,#ff8f98)}
.gnd-c.perdida .gnd-vs.el-a .gnd-sd.a .gnd-e,.gnd-c.perdida .gnd-vs.el-b .gnd-sd.b .gnd-e{filter:grayscale(.55) drop-shadow(0 10px 26px rgba(224,100,111,.22))}
.gnd-ko{color:#ff8f98}
.gnd-tap{margin-top:24px;font:10px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}
.gnd-bar{position:absolute;left:30px;right:30px;bottom:16px;height:2px;border-radius:2px;background:rgba(255,255,255,.06);overflow:hidden}
.gnd-bar::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,var(--acc),var(--win));transform-origin:left;animation:gndBarra ${DURA}ms linear forwards}
.gnd-ov.quieta .gnd-bar::after{animation-play-state:paused}
@keyframes gndBarra{to{transform:scaleX(0)}}
.gnd-l{display:grid;width:100%;margin-top:20px;text-align:left}
.gnd-r{display:grid;grid-template-columns:34px minmax(0,1fr) auto;align-items:center;gap:12px;padding:10px 0;border-top:1px solid var(--hair)}
.gnd-r:last-of-type{border-bottom:1px solid var(--hair)}
.gnd-ri{display:grid;place-items:center}
.gnd-ri .gnd-e,.gnd-pi .gnd-e{width:30px;height:30px;font-size:11px}
.gnd-cn{--s:24px;margin:0}
.gnd-dos{display:flex}.gnd-dos .gnd-e{width:20px!important;height:20px!important}.gnd-dos .gnd-e+.gnd-e{margin-left:-4px}
.gnd-rt{display:grid;gap:2px;min-width:0;font:13px var(--sans)}
.gnd-rt b{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gnd-rt em{font:500 12px var(--mono);font-style:normal;color:var(--acc)}
.gnd-rt>b+em{margin-left:6px}
.gnd-rt{grid-template-columns:auto 1fr;align-items:baseline}
.gnd-rt small{grid-column:1/-1;font:11px var(--mono);color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gnd-sc2{color:var(--soft)}
.gnd-rv{font:600 15px var(--mono);color:var(--win);white-space:nowrap}
.gnd-mas{padding-top:10px;font:12px var(--mono);color:var(--dim);text-align:center}
.gnd-mas b{color:var(--soft);font-weight:500}
.gnd-pd{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:12px;font:12px var(--mono);color:var(--dim)}
.gnd-pd b{font-weight:500;color:var(--soft)}
.gnd-pd .gnd-ko{color:#e0646f}
.gnd-pd .cn{--s:11px}

.gnd-ts{position:fixed;left:50%;bottom:calc(26px + env(safe-area-inset-bottom,0px));z-index:82;display:grid;justify-items:center;gap:8px;width:max-content;max-width:calc(100vw - 32px);transform:translateX(-50%);pointer-events:none}
.gnd-tl{display:flex;align-items:center;gap:7px;max-width:100%;padding:10px 16px 10px 13px;border-radius:999px;background:rgba(20,22,27,.95);box-shadow:0 14px 40px rgba(0,0,0,.5);font:500 13px var(--sans);color:var(--soft);white-space:nowrap;pointer-events:auto;cursor:pointer;animation:gndTl .32s var(--ease)}
.gnd-tl.sale{animation:gndTlSale .3s var(--ease) forwards}
.gnd-tl>i{flex:none;width:7px;height:7px;margin-right:3px;border-radius:50%;background:#e0646f}
.gnd-tl.void>i{background:var(--mute)}
.gnd-tl b{font:500 13px var(--mono);color:#e0646f}
.gnd-tl.void b{color:var(--soft)}
.gnd-tl em{font-style:normal;font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis}
.gnd-tl small{margin-left:4px;font:11px var(--mono);color:var(--dim);overflow:hidden;text-overflow:ellipsis}
.gnd-tl small i{font-style:normal}
@keyframes gndTl{from{opacity:0;transform:translateY(12px)}}
@keyframes gndTlSale{to{opacity:0;transform:translateY(8px)}}
@media (max-width:860px){.gnd-ts{bottom:calc(84px + env(safe-area-inset-bottom,0px))}.gnd-tl small{display:none}}

.gnd-p{background:radial-gradient(120% 46% at 50% 0%,rgba(43,212,125,.11),transparent 60%),var(--bg2)}
.rw-gi.gnd-gi{background:rgba(43,212,125,.15);color:var(--win)}
.gnd-tabs{display:flex;gap:22px;margin-top:14px;border-bottom:1px solid var(--hair)}
.gnd-tabs button{position:relative;padding:8px 0 10px;font:600 13px var(--sans);color:var(--mute)}
.gnd-tabs button:hover,.gnd-tabs button.on{color:var(--ink)}
.gnd-tabs button.on::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;background:var(--win)}
.gnd-sum{display:grid;grid-template-columns:1fr auto;align-items:end;gap:4px 12px;padding:18px 0 14px}
.gnd-sum .lab{grid-column:1/-1}
.gnd-sum>b{font:800 34px/1 var(--disp);letter-spacing:-.04em;color:var(--soft)}
.gnd-sum>b.up{color:var(--win)}.gnd-sum>b.dn{color:#e0646f}
.gnd-sum>b .cn{--s:.6em}
.gnd-sum>b i{margin-right:6px;font:500 .5em/1 var(--mono);font-style:normal;vertical-align:.3em}
.gnd-sum small{font:12px var(--mono);color:var(--dim);text-align:right}
.gnd-sum small b{color:var(--soft);font-weight:500}
.gnd-pl{display:grid}
.gnd-pl .hint{padding:24px 0;color:var(--dim)}
.gnd-pr{position:relative;display:grid;grid-template-columns:34px minmax(0,1fr) auto;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--hair)}
.gnd-pr:last-child{border-bottom:0}
.gnd-pi{display:grid;place-items:center}
.gnd-pi .av{width:28px;height:28px;font-size:10px}
.gnd-pt2{display:grid;gap:3px;min-width:0}
.gnd-pn,.gnd-fr{min-width:0;font:14px/1.3 var(--sans);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gnd-pn b,.gnd-fr>b:first-child{font-weight:700}
.gnd-pn em,.gnd-fr>i{font:500 12px var(--mono);font-style:normal;color:var(--acc)}
.gnd-fr em{font-style:normal;font-weight:600}
.gnd-fr .cn{--s:11px}
.gnd-vb{color:var(--mute)}
.gnd-q{font:500 13px var(--mono)}
.gnd-pr.won .gnd-q,.gnd-pr.won .gnd-vb{color:var(--win)}
.gnd-pr.lost .gnd-q,.gnd-pr.lost .gnd-vb{color:#e0646f}
.gnd-pt2 small{font:11px var(--mono);color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gnd-pv{display:grid;justify-items:end;gap:1px;font:600 15px var(--mono);white-space:nowrap}
.gnd-pv b{font-weight:600}
.gnd-pv .cn{--s:12px}
.gnd-tl .cn{--s:12px;margin-left:2px}
.gnd-rv .cn{--s:13px}
.gnd-pv small{font:500 9px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}
.gnd-pr.won .gnd-pv b{color:var(--win)}
.gnd-pr.lost .gnd-pv b{color:#e0646f}
.gnd-pr.void .gnd-pv b{color:var(--mute)}
.gnd-pr.void .gnd-pn b{color:var(--soft)}
.gnd-pr.nuevo::before{content:"";position:absolute;left:-14px;top:50%;width:5px;height:5px;margin-top:-2.5px;border-radius:50%;background:var(--win)}
.gnd-nv{margin-left:6px;font:600 9px var(--mono);font-style:normal;letter-spacing:.14em;text-transform:uppercase;color:var(--win)}
.gnd-pe .gnd-e{width:24px;height:24px;opacity:.9}
.gnd-ir{display:flex;align-items:center;gap:6px;margin-top:16px;font:600 13px var(--sans);color:var(--win)}
.gnd-ir span{transition:transform .2s}
.gnd-ir:hover span{transform:translateX(3px)}
@media (max-width:560px){
  .gnd-c{padding:26px 22px 30px;border-radius:26px}
  .gnd-amt{font-size:64px}
  .gnd-e{width:54px;height:54px}
  .gnd-vs.el-a .gnd-sd.a .gnd-e,.gnd-vs.el-b .gnd-sd.b .gnd-e{width:68px;height:68px}
  .gnd-sc{font-size:26px}
  .gnd-bar{left:22px;right:22px}
  .gnd-pr.nuevo::before{left:-10px}
}
html.sin-anim .gnd-ov,html.sin-anim .gnd-c,html.sin-anim .gnd-c::before,html.sin-anim .gnd-moneda,html.sin-anim .gnd-tl,html.sin-anim .gnd-b.hay .gnd-pt,html.sin-anim .gnd-b.hay .gnd-ic svg{animation:none}
html.sin-anim .gnd-bar::after{animation-name:gndBarra}`;
  document.head.appendChild(css);
})();
