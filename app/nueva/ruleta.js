// Ruleta compartida (PM 03-11, db/073). La misma ruleta de 15 casillas (0 verde x14, 1 a 7 rojo x2, 8 a 14 negro x2), ahora con una
// ronda para todos: la primera apuesta abre 25 s, cualquiera entra, y a la hora del servidor gira para todos a la vez. El giro es una
// funcion del tiempo del servidor (empieza en la posicion donde paro la ronda anterior y acaba en el numero que dio la base), asi que
// todos ven la misma rueda en el mismo sitio aunque entren a mitad. El numero va cerrado con un hash desde que se abre la ronda.
// juegos.js deja un hueco [data-jx-hueco] en la pestana Ruleta y llama a GM_RULETA.montar(hueco, ctx, { rank }).
// PM 04-11 ("hay como un cuadrado alrededor, no me gusta; que los sonidos esten mejores y se vea mejor"): fuera el brillo cuadrado del giro
// (fx-giro sobre un div cuadrado); la rueda es un cuenco quieto con su pista y una cabeza que gira, y una BOLA que se lanza contra el giro,
// rueda por la pista, baja, rebota en los trastes y se mete en la casilla que dijo la base. La bola tambien es una funcion del tiempo del
// servidor (sale de la casilla de la ronda anterior), asi que todos la ven igual. Sonido de bola rodando (fx.rueda), trastes, la caida en
// la casilla y fichas al apostar (fx.js).
'use strict';
(function () {
  const { N, esc, coin, quieto, ms, suena, dic, msgErr, clics, cantidad, engancha, stake, txt, html, fx } = GM_JX;
  const J = GM_JX.juego('ruleta');
  const t = dic({
    'Apuesta': 'Bet', 'Todo': 'All', 'Rojo': 'Red', 'Negro': 'Black', 'Verde': 'Green', 'rojo': 'red', 'negro': 'black', 'verde': 'green',
    'Apuestas abiertas': 'Bets open', 'Apuesta para abrir una ronda': 'Bet to open a round', 'Todos juegan la misma ronda: la primera apuesta abre 25 segundos': 'Everyone plays the same round: the first bet opens 25 seconds',
    'Cerrando apuestas': 'Closing bets', 'Girando': 'Spinning', 'Nadie todavía': 'Nobody yet', 'En la ronda': 'In the round', 'Última ronda': 'Last round',
    'Últimos 100': 'Last 100', 'Ronda': 'Round', 'semilla': 'seed', 'comprobado': 'verified', 'El número va cerrado con este hash antes de apostar. Al girar sale la semilla: sha256(semilla:número) tiene que dar el hash.': 'The number is locked with this hash before anyone bets. When it spins the seed is revealed: sha256(seed:number) must give the hash.',
    'Pon una cantidad': 'Enter an amount', 'Últimos resultados': 'Latest results', 'segundos': 'seconds', 'Preparando la ruleta…': 'Getting the wheel ready…',
  });
  const en = GM_JX.en;
  const ORDEN = [0, 8, 1, 9, 2, 10, 3, 11, 4, 12, 5, 13, 6, 14, 7];        // casillas en el sentido del reloj desde arriba
  const colorDe = (n) => (n === 0 ? 'verde' : n <= 7 ? 'rojo' : 'negro');
  const MULT = { rojo: 2, negro: 2, verde: 14 };
  const COLS = ['rojo', 'verde', 'negro'];
  const TA = 1.0, W0 = 720, TB = 6.4, TGIRO = TA + TB;                       // arranque, frenada y lo que dura en pantalla (la base paga a los 8 s)
  const TL = TGIRO - 1.4, RT = 140, RP = 106;                                 // la bola cae en la casilla 1,4 s antes de que pare la rueda; radio de la pista y de las casillas (sobre 320)
  const C = 2 * Math.PI * 70;

  let el = null, hooks = {}, D = null, err = null;
  const S = { on: false, tPoll: 0, tPlazo: 0, tic: 0, raf: 0, cargando: false, otra: false, ocupa: false, saldo: null, ultima: 0, sonado: 0, fx: 0, verif: {},
    k: 0, traste: null, cayo: 0, rueda: null, sGira: 0 };

  const saldo = () => (S.saldo != null ? S.saldo : J.ctx ? J.ctx.saldo : 0);
  const visible = () => !!(el && el.isConnected && !document.hidden);
  // la desviacion dentro de la casilla sale del numero de ronda (la misma en todos)
  const jit = (id) => ((((id || 0) * 2654435761) >>> 0) % 1700) / 100 - 8.5;
  const rest = (n, id) => -ORDEN.indexOf(n) * 24 + jit(id);
  const mod = (a, m) => ((a % m) + m) % m;

  function fase(d) {
    const r = d && d.ronda; if (!r) return 'idle';
    const el2 = (J.ahora() - ms(r.cierra)) / 1000;
    if (r.estado === 'apuestas') return el2 < 0 ? 'apuestas' : 'cerrando';
    if (r.n == null) return 'cerrando';
    if (el2 < TGIRO) return 'giro';
    if (el2 < TGIRO + 9 || r.estado === 'giro') return 'fin';
    return 'idle';
  }
  // de donde sale la rueda: donde paro la ronda anterior
  function inicio(d) {
    const r = d.ronda, h = (d.historial || []).filter((x) => x.id < r.id).sort((a, b) => b.id - a.id)[0];
    return h ? rest(h.n, h.id) : 0;
  }
  // angulo de la rueda a los e segundos de cerrar: arranca (TA) y frena con una curva que llega justo al numero (misma en todos)
  function angulo(d, e) {
    const r = d.ronda, s0 = inicio(d);
    if (e <= 0) return s0;
    if (e < TA) return s0 + 0.5 * W0 * e * e / TA;
    const p0 = s0 + 0.5 * W0 * TA;
    if (r.n == null) return p0 + W0 * (e - TA);
    const base = W0 * TB / 2.9, dd = base + mod(rest(r.n, r.id) - (p0 + base), 360);
    const u = Math.min(1, (e - TA) / TB), u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * W0 * TB + (-2 * u3 + 3 * u2) * (p0 + dd);
  }
  function anguloAhora(d) {
    const f = fase(d), r = d && d.ronda;
    if (!r) { const h = d && d.historial && d.historial[0]; return h ? rest(h.n, h.id) : 0 }
    if (f === 'apuestas') return inicio(d);
    if (f === 'cerrando') return angulo(d, Math.min(TA + 0.6, (J.ahora() - ms(r.cierra)) / 1000));
    if (f === 'giro') return angulo(d, (J.ahora() - ms(r.cierra)) / 1000);
    return rest(r.n, r.id);
  }

  /* ---------- la rueda ---------- */
  const pt = (a, rad) => [(160 + rad * Math.sin((a * Math.PI) / 180)).toFixed(2), (160 - rad * Math.cos((a * Math.PI) / 180)).toFixed(2)];
  // el cuenco (no gira): aro oscuro con filete dorado y la pista inclinada por donde rueda la bola
  function cuencoSvg() {
    return `<svg viewBox="0 0 320 320" aria-hidden="true"><defs>
      <radialGradient id="rlg-pista" cx="50%" cy="50%" r="50%"><stop offset="80%" stop-color="#0c0e12"/><stop offset="87%" stop-color="#1f242d"/><stop offset="93%" stop-color="#2d333e"/><stop offset="100%" stop-color="#13161b"/></radialGradient>
      <linearGradient id="rlg-oro" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe3a0"/><stop offset=".45" stop-color="#b88a2e"/><stop offset=".7" stop-color="#f2c14e"/><stop offset="1" stop-color="#8a6420"/></linearGradient>
      <linearGradient id="rlg-luz" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".09"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
      <circle cx="160" cy="160" r="160" fill="#101217"/><circle cx="160" cy="160" r="153" fill="url(#rlg-pista)"/>
      <circle cx="160" cy="160" r="153" fill="none" stroke="url(#rlg-oro)" stroke-width="2.4"/><circle cx="160" cy="160" r="133.5" fill="none" stroke="rgba(242,193,78,.28)" stroke-width="1"/>
      <path d="M160 7a153 153 0 0 1 132 76A153 153 0 0 0 28 83A153 153 0 0 1 160 7Z" fill="url(#rlg-luz)"/></svg>`;
  }
  // la cabeza que gira: casillas con su numero, trastes dorados entre ellas y el cono del centro
  function discoSvg() {
    const R = 132, r0 = 97;
    let g = '', tr = '', nums = '';
    ORDEN.forEach((n, i) => {
      const [x0, y0] = pt(i * 24 - 12, R), [x1, y1] = pt(i * 24 + 12, R), [x2, y2] = pt(i * 24 + 12, r0), [x3, y3] = pt(i * 24 - 12, r0), [tx, ty] = pt(i * 24, 121.5);
      g += `<path class="rl-w ${colorDe(n)}" d="M${x0} ${y0}A${R} ${R} 0 0 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 0 0 ${x3} ${y3}Z"/>`;
      nums += `<text class="rl-wn" x="${tx}" y="${ty}" transform="rotate(${i * 24} ${tx} ${ty})" text-anchor="middle" dominant-baseline="central">${n}</text>`;
      const [lx0, ly0] = pt(i * 24 - 12, R + 1), [lx1, ly1] = pt(i * 24 - 12, r0 - 1);
      tr += `<line x1="${lx0}" y1="${ly0}" x2="${lx1}" y2="${ly1}"/>`;
      const [dx, dy] = pt(i * 24, 86);
      if (i % 3 === 0) tr += `<circle cx="${dx}" cy="${dy}" r="2.2" class="rl-rombo"/>`;
    });
    return `<svg viewBox="0 0 320 320" aria-hidden="true"><defs><radialGradient id="rlg-cono" cx="50%" cy="45%" r="55%"><stop offset="0" stop-color="#262b35"/><stop offset=".75" stop-color="#14171d"/><stop offset="1" stop-color="#0b0d11"/></radialGradient></defs>
      <circle cx="160" cy="160" r="${R + 0.5}" class="rl-fondo"/>${g}<g class="rl-sep">${tr}</g>${nums}
      <circle cx="160" cy="160" r="${r0 - 1}" fill="url(#rlg-cono)" stroke="url(#rlg-oro)" stroke-width="2.6"/><circle cx="160" cy="160" r="${R + 0.5}" fill="none" stroke="rgba(242,193,78,.55)" stroke-width="1.2"/></svg>`;
  }

  function crea() {
    el = document.createElement('div');
    el.className = 'rl'; el.setAttribute('data-notr', '');
    // PM 04-11: la rueda centrada y algo mas grande, y debajo los botones de color y la cantidad
    el.innerHTML = `
      <div class="rl-top">
        <div class="rl-ronda" data-ronda></div>
        <div class="rl-wh">
          <div class="rl-halo" aria-hidden="true"></div>
          <div class="rl-bowl">${cuencoSvg()}</div>
          <div class="rl-disc" data-rot>${discoSvg()}</div>
          <svg class="rl-hubsvg" viewBox="0 0 320 320" aria-hidden="true"><circle class="rl-rt" cx="160" cy="160" r="70"/><circle class="rl-rp" data-ring cx="160" cy="160" r="70" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${C.toFixed(1)}"/></svg>
          <div class="rl-hub"><b class="num" data-hub></b><small data-hubs></small></div>
          <div class="rl-glow" data-glow></div>
          <div class="rl-bola" data-bola><i></i></div>
        </div>
        <div class="rl-info">
          <p class="rl-t" data-t></p>
          <p class="rl-s" data-s></p>
        </div>
      </div>
      <div class="rl-bet">
        <div class="rl-btns">${COLS.map((c) => `<button type="button" class="rl-b ${c}" data-rl="${c}"><span class="rl-bn">${t(c[0].toUpperCase() + c.slice(1))}</span><em>×${MULT[c]}</em><small>${c === 'verde' ? '0' : c === 'rojo' ? (en() ? '1 to 7' : '1 a 7') : (en() ? '8 to 14' : '8 a 14')}</small><b class="num" data-bt="${c}"></b></button>`).join('')}</div>
        <p class="jg-aviso" data-aviso></p>
        <div class="rl-amt" data-amt></div>
      </div>
      <div class="rl-low">
        <div class="rl-cols" data-cols></div>
        <div class="rl-der"><span class="lab">${t('Últimos resultados')}</span><div class="rl-hist" data-hist></div><p class="rl-cnt" data-cnt></p><div data-ult></div></div>
      </div>
      <p class="rl-fair" data-fair></p>`;
    S.ult = GM_JX.ultimas('ruleta', J); el.querySelector('[data-ult]').replaceWith(S.ult.el);
    el.querySelector('[data-amt]').innerHTML = cantidad(t, saldo());
    engancha(el, saldo, () => pintaBtns());
    clics(el, 'data-rl', (b) => apostar(b.dataset.rl));
    document.addEventListener('visibilitychange', () => { if (!document.hidden && S.on && visible()) carga(); else { programa(); paraRueda() } });
    window.addEventListener('resize', () => { S.k = 0; if (D && visible()) pintaBola() });
  }

  /* ---------- datos ---------- */
  async function carga() {
    if (!J.ctx) return;
    if (!visible()) { if (S.on && el && !document.hidden && (S.reint = (S.reint || 0) + 1) <= 15) { clearTimeout(S.tR); S.tR = setTimeout(carga, 200) } return }
    S.reint = 0;
    if (S.cargando) { S.otra = true; return }
    S.cargando = true; S.ultima = Date.now();
    try { const d = await J.rpc('ruleta_estado'); err = null; D = d; S.saldo = d.saldo; pinta() }
    catch (e) { err = msgErr(e, 'db/073'); pinta() }
    finally { S.cargando = false; programa(); if (S.otra) { S.otra = false; carga() } }
  }
  function programa() {
    clearTimeout(S.tPoll); clearTimeout(S.tPlazo); clearTimeout(S.tPlazo2); clearInterval(S.tic); S.tic = 0;
    if (!S.on || !visible()) { if (S.on && el && !el.isConnected) para(); return }
    const f = fase(D), r = D && D.ronda;
    S.tPoll = setTimeout(carga, f === 'apuestas' ? 3000 : f === 'cerrando' ? 300 : f === 'giro' || f === 'fin' ? 2500 : 8000);
    if (f === 'apuestas') {
      S.tPlazo = setTimeout(carga, Math.max(60, ms(r.cierra) - J.ahora() + 120));
      S.tic = setInterval(() => { if (fase(D) === 'apuestas') cuenta(); else { clearInterval(S.tic); S.tic = 0; pinta() } }, 200);
    } else if (r && r.estado === 'giro') S.tPlazo = setTimeout(carga, Math.max(200, ms(r.cierra) + (r.gira_s || 8) * 1000 - J.ahora() + 300));
    if ((f === 'giro' || f === 'cerrando') && !S.raf) S.raf = requestAnimationFrame(frame);
    if (f === 'fin' || f === 'idle') S.tPlazo2 = setTimeout(() => { if (fase(D) !== f) pinta() }, 1000);
  }

  /* ---------- pintar ---------- */
  function pinta() {
    if (!el) return;
    el.classList.toggle('err', !!err);
    if (err) { txt(el.querySelector('[data-t]'), err); txt(el.querySelector('[data-s]'), ''); return }
    if (!D) { txt(el.querySelector('[data-t]'), t('Preparando la ruleta…')); return }
    const f = fase(D), r = D.ronda;
    el.dataset.fase = f;
    el.querySelectorAll('[data-jx-saldo]').forEach((x) => (x.textContent = N(saldo())));
    cuenta(); estado(f, r); hist(f, r); cols(f, r); pintaBtns(); justo(r);
    if (f !== 'giro' && f !== 'cerrando') { const a = anguloAhora(D); gira(a); pintaBola(); el.querySelector('.rl-wh').classList.remove('gira') }
    glow(f, r);
    if (f === 'fin' && r && S.sonado !== r.id && J.ahora() - ms(r.cierra) < (TGIRO + 3) * 1000) resultadoSuena(r);
    if ((f === 'giro' || f === 'cerrando') && !S.raf) S.raf = requestAnimationFrame(frame);
  }
  function estado(f, r) {
    const T = el.querySelector('[data-t]'), Sx = el.querySelector('[data-s]');
    if (f === 'idle') { const v = D.ventana || 12; txt(T, t('Apuesta para abrir una ronda')); txt(Sx, en() ? `Everyone plays the same round: the first bet opens ${v} seconds` : `Todos juegan la misma ronda: la primera apuesta abre ${v} segundos`); Sx.className = 'rl-s'; return }
    if (f === 'apuestas') { txt(T, t('Apuestas abiertas')); const n = jugadores(r); txt(Sx, n ? (en() ? `${n} ${n === 1 ? 'player' : 'players'} in` : `${n} ${n === 1 ? 'jugador dentro' : 'jugadores dentro'}`) : t('Nadie todavía')); Sx.className = 'rl-s'; return }
    if (f === 'cerrando') { txt(T, t('Cerrando apuestas')); txt(Sx, ''); return }
    if (f === 'giro') { txt(T, t('Girando')); txt(Sx, ''); Sx.className = 'rl-s'; return }
    const c = t(r.color[0].toUpperCase() + r.color.slice(1));
    txt(T, en() ? `${r.n} · ${c}` : `Salió el ${r.n} · ${c}`);
    const mias = (r.apuestas || []).filter((a) => a.player === J.ctx.me);
    if (!mias.length) { txt(Sx, ''); return }
    const puso = mias.reduce((a, x) => a + x.stake, 0), cobra = mias.filter((a) => a.color === r.color).reduce((a, x) => a + x.stake * MULT[x.color], 0);
    txt(Sx, cobra ? (en() ? `You collect ${N(cobra)}` : `Cobras ${N(cobra)}`) : (en() ? `You lose ${N(puso)}` : `Pierdes ${N(puso)}`));
    Sx.className = 'rl-s ' + (cobra ? 'win' : 'lose');
  }
  const jugadores = (r) => new Set((r && r.apuestas || []).map((a) => a.player)).size;
  // la pastilla de la ronda, encima de la rueda: cuenta atras grande, barra que se acaba y cuantos hay dentro
  function pastilla(f, r, left) {
    const p = el.querySelector('[data-ronda]'); if (!p) return;
    const n = jugadores(r), gente = en() ? `${n} ${n === 1 ? 'player' : 'players'} in` : `${n} ${n === 1 ? 'jugador dentro' : 'jugadores dentro'}`;
    let h = '';
    if (f === 'apuestas') h = `<span class="rl-rd-l">${en() ? 'Bets close in' : 'Se cierra en'}</span><b class="num">${Math.ceil(left)}</b><span class="rl-rd-s">s</span><i></i><span class="rl-rd-g">${gente}</span><u style="transform:scaleX(${Math.max(0, left / (D.ventana || 12)).toFixed(3)})"></u>`;
    else if (f === 'cerrando' || f === 'giro') h = `<span class="rl-rd-l">${t('Girando')}</span><i></i><span class="rl-rd-g">${gente}</span>`;
    if (p._h !== h) { p._h = h; p.innerHTML = h }
    p.classList.toggle('pocos', f === 'apuestas' && left <= 5);
  }
  function cuenta() {
    const f = fase(D), r = D && D.ronda, hub = el.querySelector('[data-hub]'), hs = el.querySelector('[data-hubs]'), ring = el.querySelector('[data-ring]');
    let left = 0;
    if (f === 'apuestas') {
      left = Math.max(0, (ms(r.cierra) - J.ahora()) / 1000);
      txt(hub, String(Math.ceil(left))); txt(hs, t('segundos')); hub.className = 'num cd';
      ring.style.strokeDashoffset = (C * (1 - left / (D.ventana || 12))).toFixed(1);
      ring.classList.toggle('pocos', left <= 5);
    } else {
      ring.style.strokeDashoffset = C.toFixed(1);
      if (f === 'fin' || (f === 'idle' && r && r.n != null)) { txt(hub, String(r.n)); hub.className = 'num ' + colorDe(r.n); txt(hs, t(r.color)) }
      else if (f === 'idle' && D.historial && D.historial[0]) { const h = D.historial[0]; txt(hub, String(h.n)); hub.className = 'num dim ' + colorDe(h.n); txt(hs, '') }
      else { txt(hub, ''); txt(hs, '') }
    }
    pastilla(f, r, left);
  }
  function hist(f, r) {
    const oculta = (f === 'giro' || f === 'cerrando') && r ? r.id : null;
    const h = (D.historial || []).filter((x) => x.id !== oculta).slice(0, 18);
    html(el.querySelector('[data-hist]'), h.map((x, i) => `<span class="${colorDe(x.n)} ${i === 0 ? 'nuevo' : ''}" style="--i:${i}">${x.n}</span>`).join(''));
    const c = D.cuenta || {}, tot = (c.rojo || 0) + (c.negro || 0) + (c.verde || 0);
    const pc = (k) => Math.round(((c[k] || 0) / (tot || 1)) * 100);
    html(el.querySelector('[data-cnt]'), tot ? `<span class="lab">${t('Últimos 100')}</span><span class="rl-bar">${['rojo', 'negro', 'verde'].map((k) => `<i class="${k}" style="flex:${c[k] || 0}"></i>`).join('')}</span>`
      + `<span class="rl-leg">${['rojo', 'negro', 'verde'].map((k) => `<span class="${k}"><b class="num">${c[k] || 0}</b> ${t(k)} <small class="num">${pc(k)} %</small></span>`).join('')}</span>` : '');
  }
  // las tres columnas: quien ha puesto que en esta ronda (en la de antes, con lo que cobro)
  function cols(f, r) {
    const vale = r && f !== 'idle';
    const ap = vale ? r.apuestas || [] : [];
    const fin = f === 'fin';
    const h = COLS.map((c) => {
      const ps = ap.filter((a) => a.color === c), tot = ps.reduce((a, x) => a + x.stake, 0);
      const gana = fin && r.color === c, pierde = fin && r.color !== c;
      const filas = ps.sort((a, b) => b.stake - a.stake).map((a) => `<div class="rl-p ${a.player === J.ctx.me ? 'me' : ''}">${J.av(a.player)}<span>${esc(J.nom(a.player))}</span><b class="num">${gana ? '+' + N(a.stake * MULT[c]) : N(a.stake)}</b></div>`).join('');
      return `<div class="rl-col ${c} ${gana ? 'gana' : ''} ${pierde ? 'pierde' : ''}"><div class="rl-ch"><i></i><span>${t(c[0].toUpperCase() + c.slice(1))}</span><b class="num">${tot ? N(tot) + coin() : ''}</b></div>${filas || `<p class="rl-v">${t('Nadie todavía')}</p>`}</div>`;
    }).join('');
    html(el.querySelector('[data-cols]'), `<span class="lab rl-colt">${fin ? t('Última ronda') : t('En la ronda')}</span><div class="rl-cg">${h}</div>`);
  }
  function pintaBtns() {
    if (!el || !D) return;
    const f = fase(D), r = D.ronda, cerrado = f === 'cerrando' || f === 'giro' || (f === 'fin' && r && r.estado === 'giro');
    el.querySelectorAll('[data-rl]').forEach((b) => {
      const c = b.dataset.rl, mio = r && (f === 'apuestas') ? (r.apuestas || []).filter((a) => a.color === c && a.player === J.ctx.me).reduce((a, x) => a + x.stake, 0) : 0;
      b.disabled = cerrado || S.ocupa;
      txt(b.querySelector('[data-bt]'), cerrado ? t('Girando') : mio ? (en() ? `yours ${N(mio)}` : `tuyo ${N(mio)}`) : (en() ? `+${N(stake.v)}` : `+${N(stake.v)}`));
    });
  }
  function glow(f, r) {
    const g = el.querySelector('[data-glow]');
    const on = (f === 'fin' || (f === 'idle' && r && r.n != null)) && r;
    g.className = 'rl-glow ' + (on ? 'on ' + colorDe(r.n) : '');
  }
  // compromiso: el hash antes y, al girar, la semilla (y se comprueba aqui mismo con sha256)
  function justo(r) {
    const p = el.querySelector('[data-fair]');
    if (!r || !r.hash) { html(p, ''); return }
    let h = `<span title="${esc(t('El número va cerrado con este hash antes de apostar. Al girar sale la semilla: sha256(semilla:número) tiene que dar el hash.'))}">${t('Ronda')} ${r.id} · sha256 <code>${esc(r.hash.slice(0, 10))}…${esc(r.hash.slice(-6))}</code></span>`;
    if (r.semilla) {
      h += ` · ${t('semilla')} <code>${esc(r.semilla.slice(0, 8))}…</code>`;
      const v = S.verif[r.id];
      if (v === true) h += ` <b class="ok">✓ ${t('comprobado')}</b>`;
      else if (v === undefined && window.crypto && crypto.subtle) {
        S.verif[r.id] = null;
        crypto.subtle.digest('SHA-256', new TextEncoder().encode(r.semilla + ':' + r.n)).then((b) => {
          S.verif[r.id] = [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('') === r.hash; justo(r);
        }).catch(() => {});
      }
    }
    html(p, h);
  }

  /* ---------- el giro ---------- */
  function gira(a) {
    const d = el && el.querySelector('[data-rot]'); if (!d) return;
    d.style.transform = `rotate(${a.toFixed(2)}deg)`;
  }

  /* ---------- la bola ---------- */
  const suave = (x) => x * x * (3 - 2 * x);
  // la ronda anterior (de su casilla sale la bola)
  function previa(d) {
    const r = d.ronda;
    return (d.historial || []).filter((x) => !r || x.id < r.id).sort((a, b) => b.id - a.id)[0] || null;
  }
  // donde esta la bola a los e segundos de cerrar: angulo en pantalla (grados, desde arriba) y radio (sobre 320). Se lanza contra el giro desde
  // la casilla de la ronda anterior, da vueltas por la pista, baja rebotando en los trastes y a los TL s se queda en la casilla del numero
  function bolaT(d, e) {
    const r = d.ronda, A = angulo(d, e), h = previa(d), iP = h ? ORDEN.indexOf(h.n) : 0;
    if (e <= 0) return { a: A + iP * 24, r: RP, w: 0, dl: 0 };
    const conoce = r.n != null, i = conoce ? ORDEN.indexOf(r.n) : iP, base = 360 * 9;
    const D0 = conoce ? base + mod((iP - i) * 24 - base, 360) : base;
    const u = Math.min(1, e / TL);
    if (u >= 1) { const e2 = e - TL; return { a: A + i * 24 + 3.2 * Math.sin(e2 * 15) * Math.exp(-e2 * 4.5), r: RP + 1.5 * Math.exp(-e2 * 6) * Math.abs(Math.sin(e2 * 22)), w: 1, dl: 0 } }
    let dl = D0 * (1 - u) * (1 - u), rr = RT, w = 0;
    if (u < 0.07) rr = RP + (RT - RP) * suave(u / 0.07);
    if (u > 0.6) {
      w = (u - 0.6) / 0.4;
      dl += 40 * Math.sin(5 * Math.PI * w) * w * (1 - w);                                // los golpes contra los trastes
      rr = RT - (RT - RP) * suave(Math.min(1, w / 0.7)) + (w > 0.5 ? 7 * Math.abs(Math.sin((4 * Math.PI * (w - 0.5)) / 0.5)) * ((1 - w) / 0.5) : 0);
    }
    return { a: A + i * 24 + dl, r: rr, w, dl };
  }
  function bolaAhora(d) {
    const r = d && d.ronda, f = fase(d);
    if (r && (f === 'giro' || f === 'cerrando')) return bolaT(d, (J.ahora() - ms(r.cierra)) / 1000);
    if (r && r.n != null && (f === 'fin' || f === 'idle')) return { a: rest(r.n, r.id) + ORDEN.indexOf(r.n) * 24, r: RP };
    const h = d ? previa(d) : null;
    return h ? { a: rest(h.n, h.id) + ORDEN.indexOf(h.n) * 24, r: RP } : { a: 0, r: RP };
  }
  function pintaBola(b) {
    const n = el && el.querySelector('[data-bola]'); if (!n || !D) return;
    b = b || bolaAhora(D);
    if (!S.k) { const w = el.querySelector('.rl-wh').clientWidth; S.k = w ? w / 320 : 0; if (!S.k) return }
    n.style.transform = `rotate(${b.a.toFixed(2)}deg) translate3d(0,${(-b.r * S.k).toFixed(1)}px,0)`;
    n.firstElementChild.style.transform = `rotate(${(-b.a).toFixed(1)}deg)`;               // la luz de la bola no gira con ella
  }
  function paraRueda() { if (S.rueda) { try { S.rueda.para() } catch {} S.rueda = null } }
  // sonido y halo mientras gira: la bola rueda (mas fuerte cuanto mas corre), golpea los trastes al bajar y cae en la casilla
  function efectos(d, b) {
    const r = d && d.ronda; if (!r) return;
    const e = (J.ahora() - ms(r.cierra)) / 1000;
    if (e >= 0 && S.sGira !== r.id) {
      S.sGira = r.id; el.querySelector('.rl-wh').classList.add('gira');
      if (e < TL - 0.5) { if (e < 1.5) fx('sonido', 'lanza'); paraRueda(); S.rueda = fx('rueda') || null }      // quien entra a mitad oye rodar la bola, sin el lanzamiento
    }
    if (e < TL) {
      const b0 = bolaT(d, e - 0.04), v = Math.min(1, Math.abs(b.a - b0.a) / 0.04 / 1000);
      if (S.rueda) S.rueda.vel(v * (1 - 0.85 * (b.w || 0)));
      if (b.w > 0) { const k = Math.floor(b.dl / 24); if (S.traste != null && k !== S.traste) fx('sonido', 'traste'); S.traste = k } else S.traste = null;
    } else if (S.cayo !== r.id && r.n != null) {
      S.cayo = r.id; paraRueda(); S.traste = null;
      if (e < TL + 1) fx('sonido', 'bolaCae');
      el.querySelector('.rl-wh').classList.remove('gira');
    }
  }
  function frame() {
    S.raf = 0;
    if (!el || !D) return;
    const f = fase(D);
    if (!el.isConnected) { if (S.on && (f === 'giro' || f === 'cerrando')) S.raf = requestAnimationFrame(frame); else paraRueda(); return }
    gira(anguloAhora(D));
    const b = bolaAhora(D); pintaBola(b);
    if (f === 'giro' || f === 'cerrando') { efectos(D, b); S.raf = requestAnimationFrame(frame); return }
    paraRueda(); el.querySelector('.rl-wh').classList.remove('gira');
    pinta();
  }
  // si jugaste, el momento de ganar o perder: estallido con la cifra o temblor rojo (la bola ya cayo y sono)
  function resultadoSuena(r) {
    S.sonado = r.id;
    const mias = (r.apuestas || []).filter((a) => a.player === J.ctx.me);
    setTimeout(() => { if (S.ult) S.ult.refresca() }, 1800);
    if (!mias.length) return;
    const puso = mias.reduce((a, x) => a + x.stake, 0), cobra = mias.filter((a) => a.color === r.color).reduce((a, x) => a + x.stake * MULT[x.color], 0);
    const neto = cobra - puso;
    const wh = el.querySelector('.rl-wh');
    setTimeout(() => { if (neto > 0) fx('gana', neto, { el: wh }); else if (neto < 0) fx('pierde', -neto, { el: wh }) }, 350);
    if (cobra && J.ctx.refresh) setTimeout(() => J.ctx.refresh(), 1500);
  }

  /* ---------- apostar ---------- */
  async function apostar(c) {
    if (S.ocupa || !D) return;
    const av = el.querySelector('[data-aviso]');
    if (!(stake.v >= 1)) { txt(av, t('Pon una cantidad')); return }
    if (stake.v > saldo()) { txt(av, en() ? `You do not have that much: ${N(saldo())} left` : `No tienes tanto: te quedan ${N(saldo())}`); return }
    S.ocupa = true; txt(av, ''); pintaBtns();
    try {
      const r = await J.rpc('ruleta_apostar', { p_color: c, p_stake: stake.v });
      S.saldo = r.saldo; fx('sonido', 'ficha');
      if (J.ctx.refresh) J.ctx.refresh();
    } catch (e) { const m = msgErr(e, 'db/073'); txt(av, m); J.toast(esc(m)) }
    finally { S.ocupa = false; await carga(); if (hooks.rank) hooks.rank() }
  }

  function para() {
    S.on = false;
    clearTimeout(S.tPoll); clearTimeout(S.tPlazo); clearTimeout(S.tPlazo2); clearInterval(S.tic); cancelAnimationFrame(S.raf); S.raf = 0; S.tic = 0;
    paraRueda();
    J.calla();
  }

  window.GM_RULETA = {
    montar(hueco, c, h) {
      J.ctx = c; hooks = h || {};
      if (!el) crea();
      if (hueco && hueco !== el) hueco.replaceWith(el);
      if (!S.ocupa && c.saldo != null && S.saldo == null) S.saldo = c.saldo;
      if (S.ult) S.ult.arranca();
      if (!S.on) { S.on = true; J.escucha(carga); pinta(); carga(); return }
      if (Date.now() - S.ultima > 1500) carga(); else { pinta(); programa() }
    },
    para() { para(); if (S.ult) S.ult.para() },
    ocupado: () => false,
  };
})();
