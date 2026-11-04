// Carrera de caballos (PM 03-11, db/073). Seis caballos con cuotas distintas; ronda compartida: los caballos y sus cuotas se ven antes
// de apostar, la primera apuesta abre 30 s para todos y luego sale la carrera. La base decide el orden de llegada al abrir la ronda
// (cerrado con un hash) y al salir manda el orden y la semilla. La carrera que se ve sale SOLO de esa semilla y de la hora del servidor:
// cada caballo tiene su curva de velocidad (arranque, acelerones, adelantamientos), el que gana es el que dijo la base y todos los
// navegadores ven exactamente lo mismo en el mismo momento, aunque entren a mitad. Si hay foto finish, camara lenta (tambien igual
// para todos). Todo se mueve con transform y requestAnimationFrame solo mientras corre la carrera.
// juegos.js deja un hueco [data-jx-hueco] en la pestana Caballos y llama a GM_CARRERA.montar(hueco, ctx, { rank }).
// PM 04-11 ("que se vea las mejores odds, o sea como los mejores winners de ratio"): el caballo con la cuota mas alta va marcado en la
// lista y en los ganadores, y debajo sale "Mejores ganadores": quien ha cobrado mas en relacion a lo que ha apostado (ratio = cobrado /
// apostado, de carrera_mejores, db/083) y las cuotas mas altas acertadas, de esta semana o de siempre. Sin 083 en la base, sale la cuota
// mas alta que ha acertado cada uno (jg_ranking, ya cargado).
'use strict';
(function () {
  const { N, X, esc, coin, quieto, ms, suena, dic, msgErr, clics, cantidad, engancha, stake, txt, html, azar, fx } = GM_JX;
  const J = GM_JX.juego('carrera');
  const en = GM_JX.en;
  const t = dic({
    'Apuesta': 'Bet', 'Todo': 'All', 'Apostar': 'Bet', 'Salen en': 'Off in', 'segundos': 'seconds', '¡Salen!': 'And they\'re off!', 'Foto finish': 'Photo finish',
    'Apuesta para que salga la carrera': 'Bet to start the race', 'La primera apuesta abre 30 segundos para todos': 'The first bet opens 30 seconds for everyone',
    'Próxima carrera': 'Next race', 'En la carrera': 'In the race', 'Tus apuestas': 'Your bets', 'Ganadores': 'Winners', 'Nadie ha apostado todavía': 'Nobody has bet yet',
    'Carrera': 'Race', 'semilla': 'seed', 'comprobado': 'verified', 'Preparando la pista…': 'Getting the track ready…', 'Pon una cantidad': 'Enter an amount', 'En carrera': 'Racing',
    'Elige un caballo y apuesta: si gana, cobras lo apostado por su cuota.': 'Pick a horse and bet: if it wins you get your stake times its odds.',
    'El orden de llegada se decide al abrir la carrera y queda cerrado con este hash. Al salir se ve la semilla: sha256(semilla:orden) tiene que dar el hash.': 'The finishing order is decided when the race opens and locked with this hash. At the start the seed is revealed: sha256(seed:order) must give the hash.',
    'META': 'FINISH', 'Apuestas abiertas': 'Bets open', 'por una nariz': 'by a nose', 'por media cabeza': 'by half a head', 'Cuota': 'Odds',
    'Mejores ganadores': 'Best winners', 'Cobrado entre apostado': 'Paid out over staked', 'Esta semana': 'This week', 'Siempre': 'All time',
    'Mejores cuotas acertadas': 'Longest odds landed', 'Nadie ha ganado todavía': 'Nobody has won yet', 'cuota más alta': 'longest odds', 'Cargando…': 'Loading…',
    'La cuota más alta que ha acertado cada uno': 'The longest odds each player has landed', 'Ganó con la cuota más alta': 'Won at the longest odds',
    'cobras': 'pays', 'Últimas 12 carreras': 'Last 12 races', 'Más': 'More', 'Última': 'Latest',
  });
  const DIST = 1200, TSLOW = 0.3;

  let el = null, hooks = {}, D = null, err = null;
  const S = { on: false, tPoll: 0, tPlazo: 0, tic: 0, raf: 0, cargando: false, otra: false, ocupa: false, saldo: null, ultima: 0, verif: {}, plan: null, escena: null, geo: null,
    ord: '', sono: {}, fase: '', tR: 0, ph: [], prevT: 0, flash: 0, rz: 0 };
  const saldo = () => (S.saldo != null ? S.saldo : J.ctx ? J.ctx.saldo : 0);
  const visible = () => !!(el && el.isConnected && !document.hidden);
  const cab = (r, n) => (r && r.caballos || []).find((c) => c.n === n) || { n, nombre: '?', color: '#888', color2: '#222', cuota: 1 };
  // los mejores ganadores (db/083): por periodo; sin 083 en la base, la cuota mas alta acertada de jg_ranking
  const M = { per: GM_JX.lee('cb-mej') === 'semana' ? 'semana' : 'siempre', d: {}, t: {}, sin083: false, cargando: false };

  /* ---------- el caballo (dibujo propio, de lado y mirando a la derecha). Patas, cola y cabeza se mueven sueltas ---------- */
  function caballoSvg(c) {
    const pata = (cls, x, y, col) => `<g class="cb-leg ${cls}" data-p="${x},${y}"><path d="M${x - 5} ${y - 4} q2 16 1 22 q-1 6 3 14 l6 0 q-3 -9 -1 -15 q2 -9 2 -21 z" fill="${col}"/><rect x="${x - 3}" y="${y + 31}" width="9" height="5" rx="1.6" fill="#1a1612"/></g>`;
    return `<svg viewBox="0 0 132 92" aria-hidden="true" class="cb-svg">
      <g class="cb-tail" data-tail><path d="M26 34 q-16 2 -22 18 q8 -4 12 -2 q-6 8 -4 18 q8 -14 18 -24 z" fill="#2b1d14"/></g>
      ${pata('b1', 34, 50, '#4a3020')}${pata('f1', 84, 50, '#4a3020')}
      <path d="M24 38 q4 -14 26 -14 l34 0 q12 0 16 10 q2 10 -4 18 q-8 6 -22 6 l-30 0 q-18 0 -20 -20 z" fill="#7a4b2c"/>
      <path d="M30 40 q10 8 30 6" stroke="#93603b" stroke-width="3" fill="none" opacity=".6"/>
      <g class="cb-head" data-head><path d="M88 30 q6 -14 16 -22 q8 -6 14 -2 l8 10 q3 4 -2 6 l-10 2 q-6 2 -8 8 q-2 8 -8 10 z" fill="#7a4b2c"/>
        <path d="M108 4 l3 -6 l3 7 z" fill="#5c3720"/><circle cx="115" cy="11" r="1.8" fill="#120c08"/><path d="M90 26 q6 -14 18 -22" stroke="#2b1d14" stroke-width="4" fill="none" stroke-linecap="round"/></g>
      ${pata('b2', 40, 50, '#6a4127')}${pata('f2', 90, 50, '#6a4127')}
      <rect x="50" y="22" width="26" height="16" rx="3" fill="${c.color}" stroke="${c.color2}" stroke-width="2"/>
      <text x="63" y="34" text-anchor="middle" class="cb-num" fill="${c.color2}">${c.n}</text>
      <g class="cb-jk"><path d="M54 22 q4 -14 18 -14 q8 0 10 6 l-6 4 q-6 -2 -10 2 q-4 4 -6 4 z" fill="${c.color}" stroke="${c.color2}" stroke-width="1.6"/>
        <path d="M70 12 l14 8" stroke="${c.color}" stroke-width="5" stroke-linecap="round"/><circle cx="84" cy="20" r="2.6" fill="#e9c9a8"/>
        <circle cx="76" cy="4" r="6.5" fill="${c.color2}"/><path d="M76 -2.5 a6.5 6.5 0 0 1 6.5 6.5 l3 0" stroke="${c.color}" stroke-width="2.2" fill="none"/></g>
    </svg>`;
  }
  const seda = (c, cls = '') => `<span class="cb-seda ${cls}" style="--c1:${c.color};--c2:${c.color2}"><b>${c.n}</b></span>`;

  /* ---------- montar ---------- */
  function crea() {
    el = document.createElement('div');
    el.className = 'cb'; el.setAttribute('data-notr', '');
    el.innerHTML = `
      <div class="cb-pista" data-pista>
        <div class="cb-gradas" data-gradas></div>
        <div class="cb-mundo" data-mundo></div>
        <div class="cb-hud"><div class="cb-hl"><p class="cb-t" data-t></p><p class="cb-s" data-s></p></div><div class="cb-ord" data-ord></div></div>
        <div class="cb-bar" data-bar><i></i></div>
        <div class="cb-flash" data-flash></div>
        <div class="cb-cdw" data-cdw></div>
        <div class="cb-podio" data-podio></div>
        <div class="cb-vig"></div>
      </div>
      <div class="cb-abajo">
        <div class="cb-side">
          <p class="cb-how">${t('Elige un caballo y apuesta: si gana, cobras lo apostado por su cuota.')}</p>
          <div data-amt>${cantidad(t, saldo())}</div>
          <p class="jg-aviso" data-aviso></p>
          <div class="cb-mias" data-mias></div>
        </div>
        <div class="cb-main">
          <div class="cb-lh"><h3 class="cb-h" data-lt></h3><span class="cb-lt2 num" data-lt2></span></div>
          <div class="cb-lista" data-lista></div>
          <div class="cb-lh cb-sec"><h3 class="cb-h">${t('Ganadores')}</h3><span class="cb-lt2">${t('Últimas 12 carreras')}</span></div>
          <div class="cb-hist" data-hist></div>
          <div class="cb-mejw"><div class="cb-lh cb-sec"><h3 class="cb-h">${t('Mejores ganadores')}</h3><span class="cb-lt2" data-mejs></span></div><div class="cb-mej" data-mej></div></div>
          <div data-ult></div>
          <p class="cb-fair" data-fair></p>
        </div>
      </div>`;
    engancha(el, saldo, () => lista());
    S.ult = GM_JX.ultimas('carrera', J); el.querySelector('[data-ult]').replaceWith(S.ult.el);
    clics(el, 'data-cb', (b) => apostar(+b.dataset.v));
    clics(el, 'data-cbm', (b) => { if (M.per === b.dataset.cbm) return; M.per = b.dataset.cbm; GM_JX.guarda('cb-mej', M.per); pintaMej(); mejores() });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && S.on && visible()) carga(); else programa() });
    window.addEventListener('resize', () => { clearTimeout(S.rz); S.rz = setTimeout(() => { if (visible() && S.escena) { S.geo = null; montaEscena(S.escena, true) } }, 150) });
  }

  /* ---------- datos ---------- */
  async function carga() {
    if (!J.ctx) return;
    if (!visible()) { if (S.on && el && !document.hidden && (S.reint = (S.reint || 0) + 1) <= 15) { clearTimeout(S.tR); S.tR = setTimeout(carga, 200) } return }
    S.reint = 0;
    if (S.cargando) { S.otra = true; return }
    S.cargando = true; S.ultima = Date.now();
    try { const d = await J.rpc('carrera_estado'); err = null; D = d; S.saldo = d.saldo; pinta() }
    catch (e) { err = msgErr(e, 'db/073'); pinta() }
    finally { S.cargando = false; programa(); if (S.otra) { S.otra = false; carga() } }
  }
  function programa() {
    clearTimeout(S.tPoll); clearTimeout(S.tPlazo); clearTimeout(S.tPlazo2); clearInterval(S.tic); S.tic = 0;
    if (!S.on || !visible()) { if (S.on && el && !el.isConnected) para(); return }
    const r = D && D.ronda;
    if (!r) { S.tPoll = setTimeout(carga, 5000); return }
    if (r.estado === 'apuestas') {
      const falta = ms(r.cierra) - J.ahora();
      S.tPoll = setTimeout(carga, 3000);
      S.tPlazo = setTimeout(carga, Math.max(60, falta + 120));
      S.tic = setInterval(() => { cuenta(); if (ms(r.cierra) - J.ahora() < -400) { clearInterval(S.tic); S.tic = 0 } }, 200);
    } else if (r.estado === 'corre') {
      if (!r.semilla) S.tPoll = setTimeout(carga, 300);
      else { S.tPoll = setTimeout(carga, 5000); S.tPlazo = setTimeout(carga, Math.max(200, ms(r.cierra) + r.corre_s * 1000 - J.ahora() + 400)) }
    } else S.tPoll = setTimeout(carga, 7000);
    // el resultado se queda un rato en la pista; al acabar ese rato vuelve la parrilla
    if (S.escena && D.ultima && S.escena.id === D.ultima.id) S.tPlazo2 = setTimeout(() => pinta(), Math.max(300, finEscena(D.ultima) - J.ahora() + 50));
    if (S.escena && S.escena.estado === 'corre' && !S.raf) S.raf = requestAnimationFrame(frame);
  }
  const finEscena = (r) => ms(r.cierra) + r.corre_s * 1000 + 8000;
  // que se ve en la pista: la carrera en marcha, el resultado de la ultima un rato, o la parrilla de la siguiente
  function escena() {
    const r = D.ronda, u = D.ultima;
    if (r && (r.estado === 'corre' || r.estado === 'apuestas')) return r;
    if (u && J.ahora() < finEscena(u)) return u;
    return r;
  }

  /* ---------- el plan de la carrera: sale de la semilla (igual en todos) ---------- */
  function plan(r) {
    if (!r || !r.semilla || !r.orden) return null;
    if (S.plan && S.plan.id === r.id) return S.plan;
    const R = azar(r.semilla + ':' + r.id), orden = r.orden, n = orden.length;
    const F = {}, A = {};
    let f = 10.8 + R() * 0.5; F[orden[0]] = f;
    const g2 = R() < 0.4 ? 0.02 + R() * 0.06 : 0.12 + R() * 0.3;
    for (let j = 1; j < n; j++) { f += j === 1 ? g2 : 0.05 + R() * 0.27; F[orden[j]] = f }
    orden.forEach((c, j) => {
      let a1 = (R() * 2 - 1) * 0.07;
      if (j === 0 && R() < 0.55) a1 = -(0.03 + R() * 0.04);                       // el ganador remonta
      if (j >= n - 2 && R() < 0.5) a1 = 0.035 + R() * 0.035;                    // los ultimos salen fuertes y se hunden
      A[c] = [a1, (R() * 2 - 1) * 0.035, (R() * 2 - 1) * 0.018];
    });
    const gap = F[orden[1]] - F[orden[0]];
    const slow = gap < 0.1 ? { a: F[orden[0]] - 0.45, b: F[orden[0]] + 0.25 } : null;
    // tabla de posiciones cada 1/120 s de carrera (tiempo de carrera tau), sin retroceder nunca
    const paso = 1 / 120, tMax = F[orden[n - 1]] + 2.2, filas = {};
    for (const c of orden) {
      const Fi = F[c], a = A[c], arr = new Float32Array(Math.ceil(tMax / paso) + 2);
      let mx = 0, vEnd = 0;
      const pos = (tau) => {
        const s = tau / Fi, aa = 0.1;
        const base = (s < aa ? s * s / (2 * aa) : s - aa / 2) / (1 - aa / 2);
        const e = Math.min(1, s / 0.3), env = e * e * (3 - 2 * e);
        return base + env * (a[0] * Math.sin(Math.PI * s) + a[1] * Math.sin(2 * Math.PI * s) + a[2] * Math.sin(3 * Math.PI * s));
      };
      vEnd = (pos(Fi) - pos(Fi - 0.05)) / 0.05;
      // pasada la meta frenan en 1,7 s y se quedan en el orden de llegada: el primero un poco mas alla que el segundo, etc.
      const TF = 1.7, m0 = Math.max(0, vEnd) * TF, j = orden.indexOf(c), DF = Math.max(0.095 - 0.006 * j, m0 / 2.95);
      for (let i = 0; i < arr.length; i++) {
        const tau = i * paso;
        let p;
        if (tau <= Fi) p = pos(tau);
        else { const u = Math.min(1, (tau - Fi) / TF), u2 = u * u, u3 = u2 * u; p = 1 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * DF }
        mx = Math.max(mx, p); arr[i] = mx;
      }
      arr[0] = 0; filas[c] = arr;
    }
    S.plan = { id: r.id, F, orden, slow, gap, paso, filas, tMax };
    return S.plan;
  }
  // tiempo de carrera (tau) a partir de los segundos reales desde la salida: igual salvo la camara lenta del foto finish
  function tau(P, e) {
    if (!P || !P.slow) return e;
    const { a, b } = P.slow, dur = (b - a) / TSLOW;
    if (e <= a) return e;
    if (e <= a + dur) return a + (e - a) * TSLOW;
    return b + (e - a - dur);
  }
  const realDe = (P, tt) => { if (!P || !P.slow || tt <= P.slow.a) return tt; const { a, b } = P.slow; return tt <= b ? a + (tt - a) / TSLOW : a + (b - a) / TSLOW + (tt - b) };
  function posDe(P, c, tt) {
    const arr = P.filas[c]; if (tt <= 0) return 0;
    const x = tt / P.paso, i = Math.floor(x); if (i >= arr.length - 1) return arr[arr.length - 1];
    return arr[i] + (arr[i + 1] - arr[i]) * (x - i);
  }

  /* ---------- la pista ---------- */
  function geo() {
    const p = el.querySelector('[data-pista]'), w = p.clientWidth || 360, h = p.clientHeight || 260;
    const G = Math.round(Math.max(64, h * 0.21)), lh = (h - G - 10) / 6.75, pad = lh * 0.75, L = Math.max(1900, Math.round(w * 3));
    return { w, h, G, lh, pad, L, x0: 70, x1: L - Math.max(170, w * 0.28), hh: Math.round(lh * 1.45), hw: Math.round(lh * 1.45 * 132 / 92) };
  }
  function montaEscena(r, fuerza) {
    if (!r) return;
    const g = S.geo && !fuerza ? S.geo : geo();
    const firma = r.id + '|' + g.w + 'x' + g.h;
    if (!fuerza && S.mFirma === firma) return;
    S.mFirma = firma; S.geo = g; S.escena = r; S.ph = [];
    const m = el.querySelector('[data-mundo]'), gr = el.querySelector('[data-gradas]');
    m.style.width = g.L + 'px';
    gr.style.width = Math.round(g.L * 0.5 + g.w) + 'px'; gr.style.height = g.G + 'px';
    let h = `<div class="cb-cesped" style="top:${g.G}px;height:${g.h - g.G}px;--lh:${g.lh.toFixed(2)}px;--pad:${g.pad.toFixed(2)}px"></div><div class="cb-rail a" style="top:${g.G - 2}px"></div><div class="cb-rail b" style="top:${g.h - 8}px"></div>`;
    for (let k = 1; k < 6; k++) { const x = g.x0 + (g.x1 - g.x0) * (k / 6); h += `<div class="cb-poste" style="left:${x}px;top:${g.G - 18}px"><b class="num">${DIST - k * DIST / 6}</b></div>` }
    h += `<div class="cb-meta" style="left:${g.x1}px;top:${g.G}px;height:${g.h - g.G - 6}px"></div><div class="cb-metab" style="left:${g.x1 - 30}px;top:${Math.max(0, g.G - 30)}px">${t('META')}</div>`;
    h += `<div class="cb-cajon" style="left:${g.x0 - 6}px;top:${g.G}px;height:${g.h - g.G - 8}px">${(r.caballos || []).map((c, i) => `<i data-gate style="top:${(g.pad + i * g.lh).toFixed(1)}px;height:${g.lh.toFixed(1)}px"></i>`).join('')}</div>`;
    (r.caballos || []).forEach((c, i) => {
      const y = g.G + g.pad + i * g.lh + g.lh - g.hh * 0.94;
      h += `<div class="cb-cab quieto" data-cab="${c.n}" style="width:${g.hw}px;height:${g.hh}px;--y:${y.toFixed(1)}px;z-index:${10 + i};transform:translate3d(${(g.x0 - g.hw * 0.9).toFixed(1)}px,${y.toFixed(1)}px,0)"><div class="cb-cab-in" style="animation-delay:-${(i * 0.37).toFixed(2)}s">${caballoSvg(c)}</div></div>`;
    });
    m.innerHTML = h;
    S.nodos = [...m.querySelectorAll('[data-cab]')].map((n) => ({ n: +n.dataset.cab, el: n, inn: n.firstElementChild, legs: [...n.querySelectorAll('.cb-leg')].map((l) => ({ el: l, p: l.dataset.p, k: l.classList[1] })), tail: n.querySelector('[data-tail]'), head: n.querySelector('[data-head]'), y: parseFloat(n.style.getPropertyValue('--y')) }));
    S.ord = ''; S.cam = 0;
    camara(0);
    dibuja();
  }
  function camara(x) {
    const g = S.geo; x = Math.max(0, Math.min(g.L - g.w, x));
    S.cam = x;
    el.querySelector('[data-mundo]').style.transform = `translate3d(${(-x).toFixed(1)}px,0,0)`;
    el.querySelector('[data-gradas]').style.transform = `translate3d(${(-x * 0.5).toFixed(1)}px,0,0)`;
  }
  // pinta la escena en el instante actual (la llama cada fotograma mientras corre y una vez si esta quieta)
  function dibuja() {
    const r = S.escena, g = S.geo; if (!r || !g || !S.nodos) return;
    const P = plan(r), e = (J.ahora() - ms(r.cierra)) / 1000;
    const corre = r.estado === 'corre' || r.estado === 'pagada';
    const tt = corre && P ? tau(P, Math.max(0, e)) : 0;
    const now = performance.now(), dt = S.prevT ? Math.min(0.05, (now - S.prevT) / 1000) : 0; S.prevT = now;
    const ps = [];
    for (const h of S.nodos) {
      const p = corre && P ? posDe(P, h.n, tt) : 0;
      const p2 = corre && P ? posDe(P, h.n, tt + 0.05) : 0;
      const v = (p2 - p) / 0.05;                                                  // pista por segundo de carrera
      ps.push({ n: h.n, p });
      const x = g.x0 + p * (g.x1 - g.x0) - g.hw * 0.9;
      h.el.style.transform = `translate3d(${x.toFixed(1)}px,${h.y.toFixed(1)}px,0)`;
      const mov = v > 0.004 && !quieto();
      if (mov !== !h.el.classList.contains('quieto')) h.el.classList.toggle('quieto', !mov);
      if (mov) {
        const speed = (P && P.slow && e > P.slow.a && e < realDe(P, P.slow.b)) ? TSLOW : 1;
        const ph0 = h.ph || 0;
        h.ph = ph0 + dt * Math.PI * 2 * (1.2 + v * 26) * speed;
        const f = h.ph, amp = Math.min(1, v * 14);
        for (const l of h.legs) {
          const off = { b1: 0, b2: 0.6, f1: 2.2, f2: 2.9 }[l.k], s = Math.sin(f + off);
          const ang = (l.k[0] === 'f' ? 34 * s : 30 * s) * amp;
          l.el.setAttribute('transform', `rotate(${ang.toFixed(1)} ${l.p.replace(',', ' ')})`);
        }
        h.inn.style.transform = `translate3d(0,${(-Math.abs(Math.sin(f)) * g.hh * 0.06 * amp).toFixed(1)}px,0) rotate(${(Math.sin(f + 1) * 2.2 * amp).toFixed(2)}deg)`;
        if (h.tail) h.tail.setAttribute('transform', `rotate(${(Math.sin(f * 0.5) * 9 * amp - 6 * amp).toFixed(1)} 26 34)`);
        if (h.head) h.head.setAttribute('transform', `rotate(${(Math.sin(f + 0.5) * 4 * amp).toFixed(1)} 92 34)`);
      } else if (h.inn.style.transform) { h.inn.style.transform = ''; for (const l of h.legs) l.el.removeAttribute('transform'); if (h.tail) h.tail.removeAttribute('transform'); if (h.head) h.head.removeAttribute('transform') }
    }
    // camara: sigue a los dos de delante (es una funcion de las posiciones, asi que va suave)
    ps.sort((a, b) => b.p - a.p);
    S.lider = ps.length ? ps[0].n : 0;
    if (corre && P) {
      const lead = (ps[0].p * 2 + (ps[1] ? ps[1].p : ps[0].p)) / 3;
      camara(g.x0 + lead * (g.x1 - g.x0) - g.w * 0.64);
    } else camara(0);
    // las puertas del cajon se abren al salir
    const ab = corre ? Math.min(1, Math.max(0, tt / 0.28)) : 0;
    el.querySelectorAll('[data-gate]').forEach((x) => { x.style.transform = `scaleY(${(1 - ab).toFixed(2)})`; x.style.opacity = (1 - ab * 0.8).toFixed(2) });
    // el orden en directo (como en la tele)
    if (corre && P) {
      const o = ps.map((x) => x.n).join(',');
      if (o !== S.ord) { S.ord = o; html(el.querySelector('[data-ord]'), ps.map((x, i) => `<span class="cb-o" style="--i:${i}">${seda(cab(r, x.n))}</span>`).join('')) }
      const lp = ps[0].p, mts = Math.max(0, Math.round(DIST * (1 - lp) / 10) * 10);
      el.querySelector('[data-bar] i').style.transform = `scaleX(${Math.min(1, lp).toFixed(3)})`;
      const fin1 = P.F[P.orden[0]];
      // texto de arriba durante la carrera
      if (tt < 1.1) estadoTxt(t('¡Salen!'), '');
      else if (tt < fin1) estadoTxt(P.slow && tt > P.slow.a ? t('Foto finish') : `${N(mts)} m`, '', P.slow && tt > P.slow.a ? 'foto' : '');
      else ganadorTxt(r, P);
      // destello al cruzar la meta el primero
      if (tt >= fin1 && S.flash !== r.id) { S.flash = r.id; const fl = el.querySelector('[data-flash]'); fl.classList.remove('on'); void fl.offsetWidth; fl.classList.add('on'); fx('sonido', 'campana'); fx('sonido', 'publico'); paraGalope() }
      if (S.sono[r.id] !== 1 && tt > 0.05 && tt < 1.5) { S.sono[r.id] = 1; fx('sonido', 'publico'); paraGalope(); S.galope = fx('sonido', 'galope') }
      const ultimo = P.F[P.orden[P.orden.length - 1]];
      if (tt > ultimo + 0.5) podio(r, P); else html(el.querySelector('[data-podio]'), '');
    } else { html(el.querySelector('[data-ord]'), ''); el.querySelector('[data-bar] i').style.transform = 'scaleX(0)'; html(el.querySelector('[data-podio]'), '') }
  }
  function estadoTxt(a, b, cls) {
    const T = el.querySelector('[data-t]'); txt(T, a); T.className = 'cb-t ' + (cls || '');
    txt(el.querySelector('[data-s]'), b);
  }
  function ganadorTxt(r, P) {
    const c = cab(r, P.orden[0]);
    const por = P.gap < 0.045 ? t('por una nariz') : P.gap < 0.1 ? t('por media cabeza') : (en() ? (Math.round(P.gap * 9) <= 1 ? 'by a length' : `by ${Math.round(P.gap * 9)} lengths`) : `por ${Math.max(1, Math.round(P.gap * 9))} ${Math.round(P.gap * 9) <= 1 ? 'cuerpo' : 'cuerpos'}`);
    estadoTxt(en() ? `${c.nombre} wins!` : `¡Gana ${c.nombre}!`, por, 'gana');
  }
  function paraGalope() { if (typeof S.galope === 'function') { try { S.galope() } catch {} } S.galope = null }
  function podio(r, P) {
    const mias = (r.apuestas || []).filter((a) => a.player === J.ctx.me);
    const cobra = mias.filter((a) => a.caballo === P.orden[0]).reduce((s, a) => s + Math.floor(a.stake * a.cuota), 0), puso = mias.reduce((s, a) => s + a.stake, 0);
    const mio = mias.length ? `<p class="cb-pm ${cobra ? 'win' : 'lose'}">${cobra ? (en() ? `You collect ${N(cobra)}` : `Cobras ${N(cobra)}`) : (en() ? `You lose ${N(puso)}` : `Pierdes ${N(puso)}`)}${coin()}</p>` : '';
    html(el.querySelector('[data-podio]'), `<div class="cb-pd">${P.orden.slice(0, 3).map((n, i) => { const c = cab(r, n); return `<div class="cb-pp p${i + 1}"><i class="cb-pl num">${en() ? ['1st', '2nd', '3rd'][i] : i + 1 + 'º'}</i>${seda(c, 'gr')}<b>${esc(c.nombre)}</b><small class="num">×${X(c.cuota)}</small></div>` }).join('')}</div>${mio}`);
    if (S.sono[r.id] !== 2 && S.ult) { setTimeout(() => S.ult.refresca(), 4000); setTimeout(() => mejores(true), 4200) }
    if (mias.length && S.sono[r.id] !== 2) {
      S.sono[r.id] = 2; const neto = cobra - puso;
      const pi = el.querySelector('[data-pista]'); if (neto > 0) fx('gana', neto, { el: pi }); else if (neto < 0) fx('pierde', -neto, { el: pi });
      if (J.ctx.refresh) setTimeout(() => J.ctx.refresh(), 2500); if (hooks.rank) setTimeout(hooks.rank, 2600)
    } else S.sono[r.id] = 2;
  }
  function frame() {
    S.raf = 0;
    if (!el || !S.escena) return;
    if (!el.isConnected) { if (S.on) S.raf = requestAnimationFrame(frame); return }
    dibuja();
    const r = S.escena, P = plan(r), e = (J.ahora() - ms(r.cierra)) / 1000;
    const sigue = r.estado === 'corre' || (r.estado === 'pagada' && P && tau(P, e) < P.tMax);
    if (sigue && S.on) S.raf = requestAnimationFrame(frame); else S.prevT = 0;
  }

  /* ---------- pintar lo de alrededor ---------- */
  function pinta() {
    if (!el) return;
    el.classList.toggle('err', !!err);
    if (err) { estadoTxt(err, ''); return }
    if (!D) { estadoTxt(t('Preparando la pista…'), ''); return }
    el.querySelectorAll('[data-jx-saldo]').forEach((x) => (x.textContent = N(saldo())));
    const sc = escena();
    if (sc) {
      // la misma ronda puede venir con estado nuevo (apuestas -> corre -> pagada): se guarda y se repinta
      const cambia = !S.escena || S.escena.id !== sc.id;
      if (cambia) { S.plan = null; montaEscena(sc) } else S.escena = sc;
      el.dataset.fase = sc.estado;
      if (sc.estado === 'corre' || sc.estado === 'pagada') { if (!S.raf) S.raf = requestAnimationFrame(frame) } else dibuja();
    }
    cuenta(); lista(); mias(); hist(); justo(sc);
  }
  function cuenta() {
    const sc = S.escena; if (!sc || !D) return;
    const bar = el.querySelector('[data-bar] i');
    const cdw = el.querySelector('[data-cdw]');
    if (sc.estado !== 'apuestas' && cdw._h) { cdw._h = ''; cdw.innerHTML = '' }
    if (sc.estado === 'espera') { const v = D.ventana || 12; estadoTxt(t('Apuesta para que salga la carrera'), en() ? `The first bet opens ${v} seconds for everyone` : `La primera apuesta abre ${v} segundos para todos`); bar.style.transform = 'scaleX(0)'; return }
    if (sc.estado === 'apuestas') {
      const left = Math.max(0, (ms(sc.cierra) - J.ahora()) / 1000);
      const n = new Set((sc.apuestas || []).map((a) => a.player)).size, gente = en() ? `${n} ${n === 1 ? 'player' : 'players'} in` : `${n} ${n === 1 ? 'jugador dentro' : 'jugadores dentro'}`;
      estadoTxt(t('Apuestas abiertas'), '');
      // PM 04-11: la cuenta atras grande y cuantos hay dentro, centrados sobre la pista
      const h = `<small>${t('Salen en')}</small><b class="num">${Math.ceil(left)}</b><span>${gente}</span><u style="transform:scaleX(${Math.max(0, left / (D.ventana || 12)).toFixed(3)})"></u>`;
      if (cdw._h !== h) { cdw._h = h; cdw.innerHTML = h }
      cdw.classList.toggle('pocos', left <= 5);
      bar.style.transform = `scaleX(${(1 - left / (D.ventana || 12)).toFixed(3)})`;
      return;
    }
  }
  // la lista de caballos de la ronda en la que se puede apostar (o la que corre)
  function lista() {
    if (!D || !D.ronda) return;
    const r = D.ronda, abierta = r.estado === 'espera' || (r.estado === 'apuestas' && J.ahora() < ms(r.cierra));
    txt(el.querySelector('[data-lt]'), r.estado === 'corre' ? t('En la carrera') : t('Próxima carrera'));
    txt(el.querySelector('[data-lt2]'), `${t('Carrera')} ${r.id}`);
    const tot = (r.apuestas || []).reduce((s, a) => s + a.stake, 0) || 1;
    const fav = Math.min(...(r.caballos || []).map((c) => c.cuota)), alta = Math.max(...(r.caballos || []).map((c) => c.cuota));
    // PM 05-11: cada caballo es una tarjeta con su color: nombre, cuota grande, quien va con el (el bote de cada caballo es la linea de
    // abajo, en su color) y el boton con lo que cobras si gana.
    html(el.querySelector('[data-lista]'), (r.caballos || []).map((c) => {
      const ap = (r.apuestas || []).filter((a) => a.caballo === c.n), suma = ap.reduce((s, a) => s + a.stake, 0);
      const quien = [...new Set(ap.map((a) => a.player))];
      const mio = ap.filter((a) => a.player === J.ctx.me).reduce((s, a) => s + a.stake, 0);
      const tag = c.cuota === fav ? `<em>${en() ? 'favourite' : 'favorito'}</em>` : c.cuota === alta ? `<em class="alta">${t('cuota más alta')}</em>` : '';
      const gente = quien.map((u) => { const st = ap.filter((a) => a.player === u).reduce((s2, a) => s2 + a.stake, 0); return `<span class="cb-qp ${u === J.ctx.me ? 'me' : ''}">${J.av(u)}<b>${esc(J.nom(u))}</b><i class="num">${N(st)}</i></span>` }).join('');
      return `<div class="cb-row ${mio ? 'mio' : ''} ${c.cuota === alta ? 'alta' : ''}" style="--c1:${c.color};--c2:${c.color2}">${seda(c, 'md')}<span class="cb-rn"><b>${esc(c.nombre)}</b>${tag}</span>
        <span class="cb-rq"><b class="num cb-cu">×${X(c.cuota)}</b>${suma ? `<small class="num">${N(suma)}${coin()}</small>` : ''}</span>
        <span class="cb-quien">${gente}</span>
        <button type="button" class="cb-go" data-cb data-v="${c.n}" ${abierta && !S.ocupa ? '' : 'disabled'}>${abierta ? `<span class="cb-gl">${mio ? t('Más') : t('Apostar')} <b class="num">${N(stake.v)}</b></span><span class="cb-gp">${t('cobras')} <b class="num">${N(Math.floor(stake.v * c.cuota))}</b></span>` : `<span class="cb-gl">${t('En carrera')}</span>`}</button>
        <i class="cb-pool"><u style="width:${(suma / tot * 100).toFixed(1)}%"></u></i></div>`;
    }).join(''));
  }
  function mias() {
    const r = D.ronda, ap = (r && r.apuestas || []).filter((a) => a.player === J.ctx.me);
    html(el.querySelector('[data-mias]'), ap.length ? `<span class="lab">${t('Tus apuestas')}</span>${ap.map((a) => { const c = cab(r, a.caballo); return `<div class="cb-mi" style="--c1:${c.color}">${seda(c)}<span>${esc(c.nombre)}<small class="num">×${X(a.cuota)}</small></span><b class="num">${N(a.stake)}</b><i class="num">→ ${N(Math.floor(a.stake * a.cuota))}</i></div>` }).join('')}` : '');
  }
  function hist() {
    const h = (D.historial || []).slice(0, 12), top = h.length ? Math.max(...h.map((x) => +x.caballo.cuota || 0)) : 0;
    html(el.querySelector('[data-hist]'), h.length ? h.map((x, i) => { const es = +x.caballo.cuota === top && top >= 5; return `<span class="cb-hw ${es ? 'cb-tope' : ''} ${i ? '' : 'ult'}" title="${esc(x.caballo.nombre)} ×${X(x.caballo.cuota)}${es ? ' · ' + esc(t('Ganó con la cuota más alta')) : ''}"><i>${i ? '' : t('Última')}</i>${seda(x.caballo, 'md')}<small class="num">×${X(x.caballo.cuota)}</small><em>${esc(x.caballo.nombre)}</em></span>` }).join('') : `<p class="cb-v">${t('Nadie ha apostado todavía')}</p>`);
  }
  function justo(r) {
    const p = el.querySelector('[data-fair]');
    if (!r || !r.hash) { html(p, ''); return }
    let h = `<span title="${esc(t('El orden de llegada se decide al abrir la carrera y queda cerrado con este hash. Al salir se ve la semilla: sha256(semilla:orden) tiene que dar el hash.'))}">${t('Carrera')} ${r.id} · sha256 <code>${esc(r.hash.slice(0, 10))}…${esc(r.hash.slice(-6))}</code></span>`;
    if (r.semilla && r.orden) {
      h += ` · ${t('semilla')} <code>${esc(r.semilla.slice(0, 8))}…</code>`;
      const v = S.verif[r.id];
      if (v === true) h += ` <b class="ok">✓ ${t('comprobado')}</b>`;
      else if (v === undefined && window.crypto && crypto.subtle) {
        S.verif[r.id] = null;
        crypto.subtle.digest('SHA-256', new TextEncoder().encode(r.semilla + ':' + r.orden.join(','))).then((b) => {
          S.verif[r.id] = [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('') === r.hash; justo(r);
        }).catch(() => {});
      }
    }
    html(p, h);
  }

  /* ---------- mejores ganadores ---------- */
  async function mejores(fuerza) {
    const per = M.per;
    if (!J.ctx || M.cargando) return;
    if (!fuerza && M.t[per] && Date.now() - M.t[per] < 60000) return pintaMej();
    M.cargando = true; M.t[per] = Date.now();
    try {
      if (M.sin083) throw { code: 'PGRST202' };
      const d = await J.rpc('carrera_mejores', { p_periodo: per });
      M.d[per] = { tipo: 'ratio', ratio: d.ratio || [], aciertos: d.aciertos || [] };
    } catch (e) {
      const c = String(((e && e.message) || '') + ((e && e.code) || ''));
      if (/PGRST202|Could not find the function|schema cache/i.test(c)) {
        M.sin083 = true;
        try {
          const l = await J.rpc('jg_ranking', { p_juego: 'carrera', p_periodo: per });
          M.d[per] = { tipo: 'cuota', ratio: (Array.isArray(l) ? l : []).filter((x) => x.mayor_x).sort((a, b) => b.mayor_x - a.mayor_x || b.mayor - a.mayor) };
        } catch { M.t[per] = 0 }
      } else M.t[per] = 0;
    } finally { M.cargando = false }
    if (M.per === per) pintaMej();
  }
  function pintaMej() {
    const box = el && el.querySelector('[data-mej]'); if (!box || !J.ctx) return;
    const d = M.d[M.per], me = J.ctx.me;
    txt(el.querySelector('[data-mejs]'), d && d.tipo === 'cuota' ? t('La cuota más alta que ha acertado cada uno') : t('Cobrado entre apostado'));
    let h = `<div class="cb-per">${['semana', 'siempre'].map((k) => `<button type="button" data-cbm="${k}" class="${M.per === k ? 'on' : ''}">${t(k === 'semana' ? 'Esta semana' : 'Siempre')}</button>`).join('')}</div>`;
    if (!d) h += `<p class="cb-v">${t('Cargando…')}</p>`;
    else if (d.tipo === 'ratio') {
      const l = d.ratio.slice(0, 8), top = Math.max(1, ...l.map((x) => +x.ratio || 0));
      h += l.length ? `<div class="cb-mrs">${l.map((x, i) => `<div class="cb-mr ${x.player === me ? 'me' : ''} ${x.apuestas < 3 ? 'poco' : ''}"><b class="num cb-mrk ${i < 3 ? 'm' + (i + 1) : ''}">${i + 1}</b>${J.av(x.player)}<span class="cb-mrn"><b>${esc(J.nom(x.player))}</b><em class="num">${en()
          ? `${N(x.cobrado)} back from ${N(x.apostado)} · ${x.aciertos} of ${x.apuestas} won${x.mejor_cuota ? ' · best ×' + X(x.mejor_cuota) : ''}`
          : `cobra ${N(x.cobrado)} de ${N(x.apostado)} · ${x.aciertos} de ${x.apuestas} acertadas${x.mejor_cuota ? ' · mejor ×' + X(x.mejor_cuota) : ''}`}</em><i class="cb-mbar ${x.ratio >= 1 ? 'win' : ''}"><u style="width:${Math.max(2, Math.min(100, (+x.ratio || 0) / top * 100)).toFixed(1)}%"></u></i></span><b class="num cb-rt ${x.ratio >= 1 ? 'win' : x.ratio > 0 ? '' : 'lose'}">×${X(x.ratio)}</b></div>`).join('')}</div>`
        : `<p class="cb-v">${t('Nadie ha ganado todavía')}</p>`;
      const ac = (d.aciertos || []).slice(0, 5);
      if (ac.length) h += `<h4 class="cb-h2">${t('Mejores cuotas acertadas')}</h4><div class="cb-mas">` + ac.map((a) => { const cc = { n: a.n, color: a.color || cab(D && D.ronda, a.n).color, color2: a.color2 || cab(D && D.ronda, a.n).color2 }; return `<div class="cb-ma ${a.player === me ? 'me' : ''}" style="--c1:${cc.color}">${seda(cc, 'md')}<span class="cb-mrn"><b>${esc(a.caballo)}</b><em>${J.av(a.player)}<span>${esc(J.nom(a.player))}</span></em><em class="num">${N(a.stake)} → ${N(a.pago)}</em></span><b class="num cb-rt">×${X(a.cuota)}</b></div>` }).join('') + '</div>';
    } else {
      const l = d.ratio.slice(0, 8);
      h += l.length ? `<div class="cb-mrs">${l.map((x, i) => `<div class="cb-mr ${x.player === me ? 'me' : ''}"><b class="num cb-mrk ${i < 3 ? 'm' + (i + 1) : ''}">${i + 1}</b>${J.av(x.player)}<span class="cb-mrn"><b>${esc(J.nom(x.player))}</b><em class="num">${en() ? `biggest win +${N(x.mayor)} · ${x.jugadas} bets` : `su mejor premio +${N(x.mayor)} · ${x.jugadas} apuestas`}</em></span><b class="num cb-rt win">×${X(x.mayor_x)}</b></div>`).join('')}</div>`
        : `<p class="cb-v">${t('Nadie ha ganado todavía')}</p>`;
    }
    html(box, h);
  }

  /* ---------- apostar ---------- */
  async function apostar(n) {
    if (S.ocupa || !D) return;
    const av = el.querySelector('[data-aviso]');
    if (!(stake.v >= 1)) { txt(av, t('Pon una cantidad')); return }
    if (stake.v > saldo()) { txt(av, en() ? `You do not have that much: ${N(saldo())} left` : `No tienes tanto: te quedan ${N(saldo())}`); return }
    S.ocupa = true; txt(av, ''); lista();
    try {
      const r = await J.rpc('carrera_apostar', { p_caballo: n, p_stake: stake.v });
      S.saldo = r.saldo; fx('sonido', 'ficha');
      if (J.ctx.refresh) J.ctx.refresh();
    } catch (e) { const m = msgErr(e, 'db/073'); txt(av, m); J.toast(esc(m)) }
    finally { S.ocupa = false; await carga() }
  }

  function para() {
    S.on = false; paraGalope();
    clearTimeout(S.tPoll); clearTimeout(S.tPlazo); clearTimeout(S.tPlazo2); clearInterval(S.tic); cancelAnimationFrame(S.raf); S.raf = 0; S.tic = 0;
    J.calla();
  }

  window.GM_CARRERA = {
    montar(hueco, c, h) {
      J.ctx = c; hooks = h || {};
      if (!el) crea();
      if (hueco && hueco !== el) hueco.replaceWith(el);
      if (S.saldo == null && c.saldo != null) S.saldo = c.saldo;
      if (S.escena && S.geo) { const g = geo(); if (g.w !== S.geo.w || g.h !== S.geo.h) montaEscena(S.escena, true) }
      S.ult.arranca();
      mejores();
      if (!S.on) { S.on = true; J.escucha(carga); pinta(); carga(); return }
      if (Date.now() - S.ultima > 1500) carga(); else programa();
    },
    para() { para(); if (S.ult) S.ult.para() },
    ocupado: () => false,
    // para pruebas: la escena a un tiempo dado
    _d: () => ({ D, S }),
  };
})();
