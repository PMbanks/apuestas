// Ver en directo (PM 04-11: "que pueda espectear la partida de los demas de por ejemplo boxes mines").
// QUE HACE: mientras un amigo juega a Minas, abre cajas o usa Mejorar, los demas pueden mirar su partida tal cual pasa: el tablero de
// minas casilla a casilla (apuesta, multiplicador, retirada o mina), la tira de su caja girando hasta lo que le sale y la rueda de Mejorar.
// Los juegos compartidos (crash, ruleta, caballos, blackjack, cara o cruz) no lo necesitan: ya se ven en su pestana.
// COMO VA: Supabase Realtime PRESENCE en el canal 'gm-espectar' (como actividad.js, con el mismo cliente `db` de app.js). Cada cliente
// anuncia con track() una foto pequena de su partida de ahora { k, j, s, d } y la cambia en cada paso; quien abre la vista tarde recibe
// la foto entera al momento. No hay tablas, ni SQL, ni se guarda nada. Las minas sin abrir no van en la foto: el navegador de quien juega
// tampoco las sabe hasta que acaba (las decide la base).
// QUIEN MIRA NO JUEGA NI GASTA: este fichero no llama a la base ni a ninguna funcion de los juegos; solo pinta lo que llega por el canal.
// DE DONDE SALE LA FOTO: minas.js y mejora.js mandan el evento 'gm:espectar' en cada paso; cajas.js ya manda 'gm:caja-abierta'.
// ENTRADAS: la tira "En directo" bajo las pestanas de Juegos y de Cajas (html()), las filas de "Ahora mismo" en Inicio (actividad.js),
// la lista de En linea de la cabecera (app.js, marca()), el aviso "X esta jugando Minas" (avisos-juego.js) y la tarjeta
// "X esta abriendo" (cajas-vivo.js). Cualquier [data-esp-ver="<jugador>"] abre la vista.
// Todo lo que llega por la red se trata como no fiable: numeros acotados, textos escapados, imagenes solo de dos sitios, jugadores conocidos.
'use strict';
(function () {
  const g = (f, d) => { try { return f() } catch { return d } };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const en = () => g(() => GM_LANG.get() === 'en', false);
  const L = (es, eng) => (en() ? eng : es);
  const N = (x) => { const v = Math.round(+x || 0); return (v < 0 ? '−' : '') + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, en() ? ',' : '.') };
  const X = (m) => { const t = Number(m || 0).toFixed(2); return en() ? t : t.replace('.', ',') };
  const P = (p) => { const t = (p * 100).toFixed(p < 0.1 ? 2 : 1); return (en() ? t : t.replace('.', ',')) + ' %' };
  const coin = () => '<span class="cn"></span>';
  const quieto = () => g(() => matchMedia('(prefers-reduced-motion: reduce)').matches, false);
  const fx = (f, ...a) => g(() => { const x = window.GMFX; return x && x[f] ? x[f](...a) : undefined });
  const corta = (t, n) => String(t == null ? '' : t).slice(0, n);

  const CANAL = 'gm-espectar';
  const VIDA_CURSO = 600000;    // una partida de minas a medias se ve hasta 10 min despues del ultimo paso
  const VIDA_FIN = 150000;      // lo ya acabado (una caja abierta, una mejora, una partida cerrada) se ve 2 min y medio
  const RECIEN = 2600;          // una foto mas nueva que esto se anima; mas vieja, se pinta ya parada
  const JUEGO = { minas: ['Minas', 'Mines', 'juegos'], cajas: ['Cajas', 'Boxes', 'cajas'], mejora: ['Mejorar', 'Upgrader', 'cajas'] };
  const RAR = { esp: '#e4ae39', cov: '#eb4b4b', cla: '#d32ce6', res: '#8847ff', mil: '#4b69ff' };
  const IMG_OK = /^https:\/\/(community\.akamai\.steamstatic\.com|pmbanks\.github\.io)\//;
  const OJO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>';

  const app = () => document.getElementById('app');
  const listo = () => { const a = app(); return !!a && !a.hidden && g(() => !!(loaded && ME && db && typeof db.channel === 'function'), false) };
  const yoK = () => g(() => MEK, '');
  const conoce = (k) => typeof k === 'string' && g(() => F.some((f) => f.id === k), false);
  const nombre = (k) => g(() => fr(k).n, '') || '·';
  const cara = (k, cls) => g(() => String(av(k, cls || 'sm')).replace(/ data-prof="[^"]*"/, '').replace(/ title="[^"]*"/, ''), '');

  /* ---------- lo que llega: limpiar ---------- */
  const num = (x, a, b) => { const v = +x; return Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : a };
  const ent = (x, a, b) => Math.round(num(x, a, b));
  const img = (u) => (typeof u === 'string' && IMG_OK.test(u) && u.length < 400 ? u : '');
  const casillas = (xs, max) => { const s = new Set(); for (const c of Array.isArray(xs) ? xs.slice(0, 25) : []) { const i = ent(c, -1, 24); if (i >= 0 && Number.isInteger(+c)) s.add(i) } return [...s].slice(0, max) };
  function limpia(j, d) {
    if (!d || typeof d !== 'object') return null;
    if (j === 'minas') {
      const m = ent(d.m, 1, 24), e = ['curso', 'cobrada', 'perdida'].includes(d.e) ? d.e : 'curso';
      return { id: ent(d.id, 0, 1e12), e, m, st: ent(d.st, 0, 1e9), ab: casillas(d.ab, 25 - m), x: num(d.x, 1, 1000), pg: ent(d.pg, 0, 1e12),
        bm: d.bm == null ? -1 : ent(d.bm, -1, 24), mp: e === 'curso' ? [] : casillas(d.mp, 24) };
    }
    if (j === 'mejora') {
      const ob = d.ob && typeof d.ob === 'object' ? d.ob : {};
      return { f: d.f === 'fin' ? 'fin' : 'gira', ch: num(d.ch, 0, 1), r: num(d.r, 0, 1), w: d.w === true, z: num(d.z, 0, 1), sv: ent(d.sv, 0, 1e12), tv: ent(d.tv, 0, 1e12),
        ob: { n: corta(ob.n, 90), i: img(ob.i), r: RAR[ob.r] ? ob.r : 'mil' } };
    }
    if (j === 'cajas') {
      const cv = window.GM_CAJAS_VIVO;
      const p = cv && cv.limpia ? g(() => cv.limpia({ quien: '', nombre: '', cajaNombre: d.c, items: d.items, pool: d.pool }), null) : null;
      return p ? { c: p.caja, p } : null;
    }
    return null;
  }

  /* ---------- el canal ---------- */
  let ch = null, ckey = '', suscrito = false, tReint = 0, tIdle = 0, tCaduca = 0;
  const OTROS = new Map();      // k -> { j, s, d, rec (cuando llego aqui), prev }
  let yo = { j: '', s: 0, d: null }, yoSig = '';

  function conecta() {
    if (ch || !listo()) return;
    try {
      const key = yoK();
      const c = db.channel(CANAL, { config: { presence: { key: String(key) } } });
      c.on('presence', { event: 'sync' }, () => g(() => procesa(Object.values(c.presenceState()).flat())));
      ch = c; ckey = key; suscrito = false;
      c.subscribe((st) => {
        if (c !== ch) return;
        if (st === 'SUBSCRIBED') { suscrito = true; anuncia() }
        else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') suscrito = false;
      });
    } catch { ch = null }
  }
  function desconecta() {
    clearTimeout(tReint); clearTimeout(tIdle);
    if (ch) g(() => db.removeChannel(ch));
    ch = null; suscrito = false; ckey = ''; yo = { j: '', s: 0, d: null }; yoSig = '';
    procesa([]);
  }
  function arranca(n) {
    clearTimeout(tReint);
    if (ch && ckey !== yoK() && listo()) desconecta();
    if (!listo()) { if (ch && app() && app().hidden) desconecta(); else if ((n || 0) < 60 && app() && !app().hidden) tReint = setTimeout(() => arranca((n || 0) + 1), 1000); return }
    conecta();
  }
  // Presence solo entrega lo de los demas a quien esta en el canal con un track: sin partida se anuncia en reposo (j vacio), que todos ignoran
  const anuncia = () => { try { Promise.resolve(ch && suscrito && ch.track({ k: yoK(), j: yo.j, s: yo.s, d: yo.d })).catch(() => {}) } catch {} };

  /* ---------- lo mio: la foto de mi partida ---------- */
  function publica(j, d, curso) {
    if (!JUEGO[j] || !d) return;
    clearTimeout(tIdle); tIdle = setTimeout(reposo, curso ? VIDA_CURSO : VIDA_FIN);
    const sig = JSON.stringify([j, d]);
    if (sig === yoSig) return;
    yoSig = sig; yo = { j, s: Math.max(Date.now(), yo.s + 1), d };
    if (!ch) arranca();
    anuncia();
  }
  function reposo() {
    clearTimeout(tIdle);
    if (!yo.j) return;
    yoSig = ''; yo = { j: '', s: Math.max(Date.now(), yo.s + 1), d: null };
    anuncia();
  }
  // minas.js: { j:'minas', p: la partida tal cual la da la base (sin las minas mientras esta en curso) }
  // mejora.js: { j:'mejora', r: lo que devolvio cs_upgrade, t: el objetivo, img: su imagen, f: 'gira' | 'fin' }
  addEventListener('gm:espectar', (e) => {
    const x = e && e.detail; if (!x) return;
    if (x.j === 'minas' && x.p) {
      const p = x.p, fin = p.estado !== 'curso';
      publica('minas', { id: p.id, e: p.estado, m: p.minas, st: p.stake, ab: (p.abiertas || []).slice(0, 25), x: +p.mult || 1, pg: p.pago || 0,
        bm: p.boom == null ? null : p.boom, mp: fin && Array.isArray(p.mapa) ? p.mapa.slice(0, 24) : [] }, !fin);
    } else if (x.j === 'mejora' && x.r) {
      const r = x.r, t = x.t || {};
      publica('mejora', { f: x.f === 'fin' ? 'fin' : 'gira', ch: +r.chance || 0, r: +r.roll || 0, w: !!r.won, z: +r.start || 0, sv: r.stake_value || 0, tv: r.target_value || t.value || 0,
        ob: { n: corta(t.name || x.n || '', 90), i: x.img || '', r: t.rarity || 'mil' } }, false);
    }
  });
  // una caja abierta por mi (tambien las del giro automatico)
  addEventListener('gm:caja-abierta', (e) => {
    const p = e && e.detail; if (!p || p.quien !== g(() => ME, null)) return;
    const it = (x) => ({ r: x.r, i: x.i, l: x.l ? 1 : 0 });
    publica('cajas', { c: corta(p.cajaNombre, 60), items: (p.items || []).slice(0, 5).map((x) => ({ ...it(x), n: corta(x.n, 80), v: x.v, ...(x.t ? { t: x.t, tp: (x.tp || []).slice(0, 10).map(it) } : {}) })),
      pool: (p.pool || []).slice(0, 14).map(it) }, false);
  });

  /* ---------- lo de los demas ---------- */
  function procesa(lista) {
    const ahora = Date.now(), mejor = new Map();
    for (const x of Array.isArray(lista) ? lista : []) {
      if (!x || typeof x !== 'object' || x.k === yoK() || !conoce(x.k)) continue;
      const activo = !!JUEGO[x.j] && !!x.d && typeof x.d === 'object', s = ent(x.s, 0, 1e15), a = mejor.get(x.k);
      // con dos pestanas del mismo jugador manda la que tiene partida y, entre esas, la foto mas nueva
      if (!a || (activo && (!a.activo || s > a.s))) mejor.set(x.k, { j: activo ? x.j : '', s, d: x.d, activo });
    }
    let cambio = false;
    for (const [k, v] of mejor) {
      const p = OTROS.get(k);
      if (!v.activo) { if (p) { OTROS.delete(k); cambio = true } continue }
      if (p && p.s === v.s && p.j === v.j) continue;
      const d = limpia(v.j, v.d); if (!d) continue;
      OTROS.set(k, { j: v.j, s: v.s, d, rec: ahora, prev: p && p.j === v.j ? p.d : null });
      cambio = true;
    }
    for (const k of [...OTROS.keys()]) if (!mejor.has(k)) { OTROS.delete(k); cambio = true }
    if (cambio) { pinta(); actualiza(); caduca() }
  }
  const vida = (o) => (o.j === 'minas' && o.d.e === 'curso' ? VIDA_CURSO : VIDA_FIN);
  // por si quien juega cierra sin avisar: lo viejo se quita solo (un temporizador solo mientras hay alguien)
  function caduca() {
    clearTimeout(tCaduca);
    if (!OTROS.size) return;
    tCaduca = setTimeout(() => {
      const ahora = Date.now(); let q = false;
      for (const [k, o] of OTROS) if (ahora - o.rec > vida(o)) { OTROS.delete(k); q = true }
      if (q) { pinta(); actualiza() }
      caduca();
    }, 20000);
  }
  const orden = () => [...OTROS.entries()].sort((a, b) => b[1].rec - a[1].rec);
  // lo que hace, en corto (para la tira y la lista de En linea)
  function que(o, corto) {
    const d = o.d, jn = JUEGO[o.j][en() ? 1 : 0];
    if (o.j === 'minas') return d.e === 'curso' ? `${jn} · ×${X(d.x)}` : d.e === 'perdida' ? `${jn} · ${L('mina', 'mine')}` : `${jn} · +${N(d.pg)}`;
    if (o.j === 'cajas') return corto ? jn : esc(d.c) || jn;
    return d.f === 'gira' ? `${jn} · ${P(d.ch)}` : `${jn} · ${d.w ? L('ganó', 'won') : L('perdió', 'lost')}`;
  }

  /* ---------- la tira "En directo" (Juegos y Cajas) y las marcas de otros sitios ---------- */
  const chip = ([k, o]) => `<button type="button" class="esp-c" data-esp-ver="${esc(k)}">${cara(k, 'sm')}<span class="esp-ct"><b>${esc(nombre(k))}</b><em>${que(o)}</em></span><span class="esp-ojo">${OJO}<span>${L('Ver', 'Watch')}</span></span></button>`;
  function contenido(lugar) {
    const xs = orden().filter(([, o]) => !lugar || lugar === 'todo' || JUEGO[o.j][2] === lugar);
    if (!xs.length) return '';
    return `<div class="esp-l" data-notr><span class="esp-lt"><i class="esp-dot"></i>${L('En directo', 'Live now')}</span><div class="esp-cs">${xs.map(chip).join('')}</div></div>`;
  }
  const hay = (lugar) => orden().some(([, o]) => !lugar || lugar === 'todo' || JUEGO[o.j][2] === lugar);
  // el hueco siempre esta; sin nadie no ocupa nada
  const html = (lugar) => `<div class="esp-w ${hay(lugar) ? 'hay' : ''}" data-esp-w="${esc(lugar || 'todo')}"><div class="esp-i">${contenido(lugar)}</div></div>`;
  let SIG = '';
  const firma = () => orden().map(([k, o]) => k + o.j + o.s).join('|');
  function pinta() {
    const sig = firma() + g(() => GM_LANG.get(), '');
    if (sig === SIG) return; SIG = sig;
    document.querySelectorAll('[data-esp-w]').forEach((w) => {
      const l = w.dataset.espW, i = w.firstElementChild; if (!i) return;
      i.innerHTML = contenido(l); w.classList.toggle('hay', hay(l));
    });
    g(() => pintaOnline());                                             // app.js: la lista de En linea
    g(() => window.GM_ACTIVIDAD && GM_ACTIVIDAD.repinta && GM_ACTIVIDAD.repinta());   // Inicio: Ahora mismo
  }
  // una marca pequena "Ver" para la lista de En linea (va dentro de un boton: por eso es un span); lo que hace, al pasar el raton
  const marca = (k) => { const o = OTROS.get(k); return o ? `<span class="esp-m" data-esp-ver="${esc(k)}" role="button" tabindex="0" title="${esc(que(o, true))}" aria-label="${esc(L('Ver', 'Watch') + ' · ' + que(o, true))}" data-notr>${OJO}${L('Ver', 'Watch')}</span>` : '' };

  /* ---------- la vista: mirar a alguien ---------- */
  const V = { k: null, el: null, s: -1, j: '', mn: null, raf: 0, cj: 0, fue: false, ultFoco: null, hist: false, ign: 0, cjVa: false, cjCola: null };
  const X_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  // en el movil, la flecha de atras del sistema cierra la vista (como la ventana del partido, ventana.js)
  function abre(k) {
    if (!conoce(k) || k === yoK()) return;
    const hist = V.hist, foco = V.el ? V.ultFoco : document.activeElement;
    cierra(true, true);
    V.k = k; V.s = -1; V.j = ''; V.mn = null; V.fue = false; V.ultFoco = foco; V.hist = hist;
    if (!V.hist) { try { history.pushState({ gmesp: 1 }, ''); V.hist = true } catch { V.hist = false } }
    const el = document.createElement('div');
    el.className = 'esp'; el.setAttribute('data-notr', '');
    el.innerHTML = `<div class="esp-fondo" data-esp-x></div>
      <section class="esp-hoja" role="dialog" aria-modal="true" aria-labelledby="esp-tt" tabindex="-1">
        <header class="esp-bar">${cara(k, 'xl')}<div class="esp-q"><span class="esp-vivo" data-esp-vivo><i></i>${L('En directo', 'Live')}</span>
          <h2 id="esp-tt">${L('Viendo a', 'Watching')} <b>${esc(nombre(k))}</b></h2><em data-esp-jn></em></div>
          <button type="button" class="esp-x" data-esp-x aria-label="${L('Cerrar', 'Close')}">${X_SVG}</button></header>
        <div class="esp-cuerpo" data-esp-b></div>
        <p class="esp-pie">${OJO}<span>${L('Solo miras: desde aquí no se juega ni se gasta nada.', 'View only: nothing can be played or spent from here.')}</span></p>
        <nav class="esp-otros" data-esp-otros></nav>
      </section>`;
    document.body.appendChild(el); V.el = el;
    actualiza();
    g(() => el.querySelector('.esp-hoja').focus({ preventScroll: true }));
  }
  function cierra(rapido, cambia) {
    cancelAnimationFrame(V.raf); V.raf = 0; V.cj++; V.cjVa = false; V.cjCola = null;
    const el = V.el; V.el = null; V.k = null;
    if (!el) return;
    if (!cambia && V.hist) { V.hist = false; V.ign++; try { history.back() } catch { V.ign-- } }
    if (rapido || quieto()) { el.remove(); return }
    el.classList.add('sale'); setTimeout(() => el.remove(), 150);
    g(() => V.ultFoco && V.ultFoco.isConnected && V.ultFoco.focus({ preventScroll: true }));
  }
  function actualiza() {
    if (!V.el) return;
    const o = OTROS.get(V.k), cu = V.el.querySelector('[data-esp-b]');
    // los demas que se pueden mirar, para saltar de uno a otro
    const ot = orden().filter(([k]) => k !== V.k), nav = V.el.querySelector('[data-esp-otros]');
    const hn = ot.length ? `<span class="lab">${L('También en directo', 'Also live')}</span><div class="esp-cs">${ot.map(chip).join('')}</div>` : '';
    if (nav._h !== hn) { nav._h = hn; nav.innerHTML = hn }
    V.el.querySelector('[data-esp-vivo]').classList.toggle('off', !o);
    if (!o) {
      if (!V.j) { cu.innerHTML = `<p class="esp-nada">${esc(L(`${nombre(V.k)} no está jugando ahora a nada que se pueda ver. En cuanto abra una caja, empiece una partida de minas o use Mejorar, sale aquí.`, `${nombre(V.k)} is not playing anything you can watch right now. As soon as they open a box, start a game of Mines or use the Upgrader, it shows up here.`))}</p>` }
      else if (!V.fue) { V.fue = true; const b = document.createElement('p'); b.className = 'esp-fue'; b.textContent = L(`${nombre(V.k)} ha dejado de jugar. Esto es lo último que hizo.`, `${nombre(V.k)} stopped playing. This is the last thing they did.`); cu.prepend(b) }
      return;
    }
    if (V.fue) { V.fue = false; const b = cu.querySelector('.esp-fue'); if (b) b.remove() }
    if (o.s === V.s) return;
    const nuevo = o.j !== V.j;
    V.s = o.s;
    if (nuevo) { cancelAnimationFrame(V.raf); V.raf = 0; V.cj++; V.cjVa = false; V.cjCola = null; V.j = o.j; V.mn = null; cu.innerHTML = BASE[o.j](); V.el.querySelector('[data-esp-jn]').textContent = JUEGO[o.j][en() ? 1 : 0] }
    g(() => PINTA[o.j](o, cu, nuevo));
  }

  /* ----- Minas: el tablero casilla a casilla ----- */
  const GEMA0 = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 14h28l12 14-26 26L6 28z" fill="#2bd47d"/></svg>';
  const BOMBA0 = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="29" cy="37" r="19" fill="#262a33"/></svg>';
  const dib = (n) => g(() => GM_MINAS.svg[n], '') || (n === 'GEMA' ? GEMA0 : BOMBA0);
  const BASE = {
    minas: () => `<div class="esp-mn">
      <div class="mn-head"><div><span class="lab">${L('Multiplicador', 'Multiplier')}</span><b class="num mn-x" data-x>×1,00</b></div>
        <div><span class="lab">${L('Apuesta', 'Bet')}</span><b class="num" data-st>·</b></div>
        <div><span class="lab" data-payl>${L('Si se retira', 'If they cash out')}</span><b class="num" data-pay>·</b></div></div>
      <div class="mn-board" data-board>${Array.from({ length: 25 }, () => '<div class="mn-c"><span class="mn-ci"><span class="mn-f"></span><span class="mn-b"></span></span></div>').join('')}<div class="mn-flash"></div></div>
      <p class="mn-msg" data-msg></p><p class="esp-sub" data-sub></p></div>`,
    mejora: () => `<div class="esp-mj">
      <div class="esp-mj-w" data-w>
        <svg viewBox="0 0 200 200" aria-hidden="true"><defs><radialGradient id="esp-disco" cx="50%" cy="42%" r="62%"><stop offset="0" stop-color="#262b36"/><stop offset=".75" stop-color="#171a21"/><stop offset="1" stop-color="#121419"/></radialGradient>
          <linearGradient id="esp-verde" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5df2a3"/><stop offset="1" stop-color="#15b86a"/></linearGradient></defs>
          <circle cx="100" cy="100" r="97" fill="url(#esp-disco)" stroke="rgba(255,255,255,.06)"/><circle cx="100" cy="100" r="84" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="14"/>
          <g data-zona><circle cx="100" cy="100" r="84" fill="none" stroke="url(#esp-verde)" stroke-width="14" data-arc transform="rotate(-90 100 100)"/></g>
          <g class="esp-aguja" data-aguja><line x1="100" y1="29" x2="100" y2="7"/><path d="M100 20 L94.5 4 Q100 0 105.5 4 Z"/></g></svg>
        <div class="esp-mj-c" data-c></div></div>
      <div class="esp-mj-ob" data-ob></div>
      <p class="mn-msg" data-msg></p></div>`,
    cajas: () => `<div class="esp-cj"><p class="esp-cj-h" data-h></p><div class="esp-cj-t" data-t></div><p class="esp-sub" data-sub></p></div>`,
  };
  const C_MEJ = 2 * Math.PI * 84, VUELTAS = 5, DUR_MEJ = 5600;
  const PINTA = {
    minas(o, cu, nuevo) {
      const d = o.d, fin = d.e !== 'curso', recien = Date.now() - o.rec < RECIEN && !quieto();
      const antes = V.mn && V.mn.id === d.id ? V.mn : null;
      const abiertas = new Set(d.ab), minas = new Set(d.mp), nuevas = antes ? d.ab.filter((i) => !antes.ab.includes(i)) : [];
      const bd = cu.querySelector('[data-board]');
      if (!antes && !nuevo && recien) { bd.classList.remove('nueva'); void bd.offsetWidth; bd.classList.add('nueva') }
      bd.querySelectorAll('.mn-c').forEach((c, i) => {
        const b = c.querySelector('.mn-b'); let k = 'mn-c';
        if (abiertas.has(i)) { k += ' abierta gema'; if (recien && nuevas.includes(i)) k += ' anim'; if (b._k !== 'g') { b._k = 'g'; b.innerHTML = dib('GEMA') } }
        else if (fin && d.bm === i) { k += ' abierta bomba boom'; if (b._k !== 'b') { b._k = 'b'; b.innerHTML = dib('BOMBA') } }
        else if (fin && minas.size) { const m = minas.has(i), kk = m ? 'b' : 'g'; k += ' vista ' + (m ? 'bomba' : 'gema'); if (b._k !== kk) { b._k = kk; b.innerHTML = dib(m ? 'BOMBA' : 'GEMA') } }
        else if (b._k) { b._k = ''; b.innerHTML = '' }
        if (c.className !== k) c.className = k;
      });
      const xe = cu.querySelector('[data-x]');
      xe.textContent = '×' + X(fin ? d.x : d.ab.length ? d.x : 1);
      if (recien && nuevas.length) { xe.classList.remove('sube'); void xe.offsetWidth; xe.classList.add('sube') }
      cu.querySelector('[data-st]').innerHTML = N(d.st) + coin();
      cu.querySelector('[data-payl]').textContent = fin ? L('Se lleva', 'Takes') : L('Si se retira', 'If they cash out');
      cu.querySelector('[data-pay]').innerHTML = fin ? N(d.pg) + coin() : d.ab.length ? N(Math.floor(d.st * d.x)) + coin() : '·';
      const nm = nombre(V.k), msg = cu.querySelector('[data-msg]');
      if (d.e === 'perdida') { msg.textContent = L(`¡Mina! ${nm} pierde ${N(d.st)}`, `Mine! ${nm} loses ${N(d.st)}`); msg.className = 'mn-msg lose' }
      else if (d.e === 'cobrada') { msg.textContent = L(`${nm} se retira en ×${X(d.x)} · +${N(d.pg)}`, `${nm} cashed out at ×${X(d.x)} · +${N(d.pg)}`); msg.className = 'mn-msg win' }
      else { msg.textContent = d.ab.length ? L(`${d.ab.length} ${d.ab.length === 1 ? 'casilla buena' : 'casillas buenas'}. ¿Se retira o sigue?`, `${d.ab.length} safe ${d.ab.length === 1 ? 'tile' : 'tiles'}. Cash out or keep going?`) : L('Acaba de empezar', 'Just started'); msg.className = 'mn-msg' }
      cu.querySelector('[data-sub]').textContent = `${d.m} ${d.m === 1 ? L('mina', 'mine') : L('minas', 'mines')} · ${L('partida', 'game')} ${d.id}`;
      // los sonidos, solo si pasa ahora mismo (no al abrir la vista con la partida ya avanzada)
      if (recien && antes) {
        if (antes.e === 'curso' && d.e === 'perdida') { fx('sonido', 'explosion'); bd.classList.remove('pum'); void bd.offsetWidth; bd.classList.add('pum') }
        else if (antes.e === 'curso' && d.e === 'cobrada') fx('sonido', 'gema');
        else if (nuevas.length) fx('sonido', 'gema');
      }
      V.mn = { id: d.id, ab: d.ab.slice(), e: d.e };
    },
    mejora(o, cu) {
      const d = o.d, z = cu.querySelector('[data-zona]'), arc = cu.querySelector('[data-arc]'), ag = cu.querySelector('[data-aguja]'), c = cu.querySelector('[data-c]'), w = cu.querySelector('[data-w]');
      z.style.transform = `rotate(${(d.z * 360).toFixed(3)}deg)`;
      arc.setAttribute('stroke-dasharray', `${(C_MEJ * d.ch).toFixed(3)} ${C_MEJ.toFixed(3)}`);
      const x = d.sv ? d.tv / d.sv : 0;
      cu.querySelector('[data-ob]').innerHTML = `<span class="esp-mj-i" style="--c:${RAR[d.ob.r]}">${d.ob.i ? `<img src="${esc(d.ob.i)}" alt="" decoding="async" onerror="this.style.visibility='hidden'">` : ''}</span>
        <span class="esp-mj-t"><span class="lab">${L('Quiere', 'Going for')}</span><b>${esc(d.ob.n) || '·'}</b><em>${L('Pone', 'Puts in')} <span class="num">${N(d.sv)}</span>${coin()} · ${L('vale', 'worth')} <span class="num">${N(d.tv)}</span>${coin()}</em></span>`;
      const msg = cu.querySelector('[data-msg]'), nm = nombre(V.k);
      const final = () => {
        ag.style.transform = `rotate(${(d.r * 360).toFixed(3)}deg)`;
        w.classList.toggle('won', d.w); w.classList.toggle('lost', !d.w);
        c.innerHTML = `<b class="${d.w ? 'win' : 'lose'}">${d.w ? L('Gana', 'Wins') : L('Pierde', 'Loses')}</b><span>${P(d.ch)} · ×${X(x)}</span>`;
        msg.textContent = d.w ? L(`${nm} se lleva ${d.ob.n}`, `${nm} gets ${d.ob.n}`) : L(`${nm} pierde ${N(d.sv)}`, `${nm} loses ${N(d.sv)}`);
        msg.className = 'mn-msg ' + (d.w ? 'win' : 'lose');
      };
      const t0 = Date.now() - o.rec;
      // ya girando esta misma tirada (llega el 'fin' mientras la aguja va): que acabe sola
      if (V.raf && V.mjk === `${d.r}|${d.z}`) return;
      cancelAnimationFrame(V.raf); V.raf = 0;
      V.mjk = `${d.r}|${d.z}`;
      if (d.f === 'fin' || t0 > DUR_MEJ || quieto()) return final();
      w.classList.remove('won', 'lost');
      c.innerHTML = `<b>${P(d.ch)}</b><span>×${X(x)}</span>`;
      msg.textContent = L(`${nm} está girando la rueda…`, `${nm} is spinning the wheel…`); msg.className = 'mn-msg';
      const fin = VUELTAS * 360 + d.r * 360, ini = performance.now() - t0, e5 = (t) => 1 - Math.pow(1 - t, 5);
      let seg = 0;
      const paso = (now) => {
        if (!V.el || !ag.isConnected) { V.raf = 0; return }
        const k = Math.min(1, (now - ini) / DUR_MEJ), a = fin * e5(k);
        ag.style.transform = `rotate(${a.toFixed(3)}deg)`;
        const s = Math.floor(a / 15); if (s !== seg) { seg = s; if (k < 0.995) fx('sonido', 'tick') }
        if (k < 1) V.raf = requestAnimationFrame(paso);
        else { V.raf = 0; final(); if (d.w) fx('sonido', 'gema'); else fx('sonido', 'pierde') }
      };
      V.raf = requestAnimationFrame(paso);
    },
    cajas(o, cu, nuevo, seguida) {
      // con el giro automatico llegan aperturas mientras la tira aun gira: la ultima espera y sale despues, mas rapida
      if (V.cjVa && !nuevo) { V.cjCola = o; return }
      const d = o.d, n = (V.cjN = nuevo ? 1 : (V.cjN || 0) + 1), recien = seguida || Date.now() - o.rec < RECIEN;
      cu.querySelector('[data-h]').innerHTML = `${L('Abre', 'Opening')} <b>${esc(d.c) || L('una caja', 'a box')}</b>${d.p.items.length > 1 ? ` <span class="num">×${d.p.items.length}</span>` : ''}`;
      cu.querySelector('[data-sub]').textContent = nuevo ? '' : L(`${n} cajas mientras miras`, `${n} boxes while you watch`);
      const cv = window.GM_CAJAS_VIVO, host = cu.querySelector('[data-t]'), id = ++V.cj;
      if (!cv || !cv.tiras) { host.textContent = d.c; return }
      V.cjVa = true;
      cv.tiras(host, d.p, { filas: 5, quieto: !recien, dur: seguida ? 1600 : 4200 }).then((mejor) => {
        if (id !== V.cj || !V.el) return;
        if (mejor && recien) g(() => window.dispatchEvent(new CustomEvent('gm:sonido', { detail: { tipo: 'caja-final', rareza: mejor.r, vol: 0.5 } })));
        setTimeout(() => {
          if (id !== V.cj || !V.el) return;
          V.cjVa = false;
          const sig = V.cjCola; V.cjCola = null;
          if (sig && V.j === 'cajas') g(() => PINTA.cajas(sig, V.el.querySelector('[data-esp-b]'), false, true));
        }, recien ? 900 : 0);
      });
    },
  };

  /* ---------- clics y teclado ---------- */
  // en la captura de window: va antes que app.js (data-prof, data-scr) y que actividad.js, y no deja que ellos tambien actuen
  addEventListener('click', (e) => {
    const t = e.target; if (!t || !t.closest) return;
    const v = t.closest('[data-esp-ver]');
    if (v) {
      e.preventDefault(); e.stopPropagation();
      const card = v.closest('.cv-card'); if (card) card.remove();
      g(() => { if (typeof S === 'object' && S.onl) { S.onl = false; pintaOnline() } });
      return abre(v.dataset.espVer);
    }
    if (V.el && V.el.contains(t) && t.closest('[data-esp-x]')) { e.preventDefault(); cierra() }
  }, true);
  addEventListener('keydown', (e) => {
    if (V.el && e.key === 'Escape') { e.stopPropagation(); cierra(); return }
    const v = e.target && e.target.closest && e.target.closest('span[data-esp-ver]');
    if (v && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); abre(v.dataset.espVer) }
  }, true);
  addEventListener('popstate', () => { if (V.ign > 0) { V.ign--; return } if (V.el) { V.hist = false; cierra(true) } });
  addEventListener('pagehide', () => { try { if (ch && suscrito) ch.untrack() } catch {} });
  const a0 = app();
  if (a0) new MutationObserver(() => arranca()).observe(a0, { attributes: true, attributeFilter: ['hidden'] });
  arranca();

  window.GM_ESPECTAR = {
    html, marca, abre, cierra, firma,
    vivo: (k) => OTROS.has(k),
    ahora: () => orden().map(([k, o]) => ({ k, j: o.j, s: o.s })),
    // SOLO PRUEBAS: finge lo que diria presence. estado = [{ k, j, s?, d }, ...] (los demas). Pasa por el mismo camino que lo real.
    _sim(estado) { procesa((estado || []).map((x, i) => ({ k: x.k, j: x.j, s: x.s == null ? Date.now() + i : x.s, d: x.d }))); return this.ahora() },
    _yo: () => ({ ...yo }),
  };
})();
