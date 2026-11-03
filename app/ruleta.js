// Ruleta compartida (PM 03-11, db/073). La misma ruleta de 15 casillas (0 verde x14, 1 a 7 rojo x2, 8 a 14 negro x2), ahora con una
// ronda para todos: la primera apuesta abre 25 s, cualquiera entra, y a la hora del servidor gira para todos a la vez. El giro es una
// funcion del tiempo del servidor (empieza en la posicion donde paro la ronda anterior y acaba en el numero que dio la base), asi que
// todos ven la misma rueda en el mismo sitio aunque entren a mitad. El numero va cerrado con un hash desde que se abre la ronda.
// juegos.js deja un hueco [data-jx-hueco] en la pestana Ruleta y llama a GM_RULETA.montar(hueco, ctx, { rank }).
'use strict';
(function () {
  const { N, esc, coin, quieto, ms, suena, dic, msgErr, clics, cantidad, engancha, stake, txt, html } = GM_JX;
  const J = GM_JX.juego('ruleta');
  const t = dic({
    'Apuesta': 'Bet', 'Todo': 'All', 'Rojo': 'Red', 'Negro': 'Black', 'Verde': 'Green', 'rojo': 'red', 'negro': 'black', 'verde': 'green',
    'Apuestas abiertas': 'Bets open', 'Apuesta para abrir una ronda': 'Bet to open a round', 'Todos juegan la misma ronda: la primera apuesta abre 25 segundos': 'Everyone plays the same round: the first bet opens 25 seconds',
    'Cerrando apuestas': 'Closing bets', 'Girando': 'Spinning', 'Nadie todavía': 'Nobody yet', 'En la ronda': 'In the round', 'Última ronda': 'Last round',
    'Últimos 100': 'Last 100', 'Ronda': 'Round', 'semilla': 'seed', 'comprobado': 'verified', 'El número va cerrado con este hash antes de apostar. Al girar sale la semilla: sha256(semilla:número) tiene que dar el hash.': 'The number is locked with this hash before anyone bets. When it spins the seed is revealed: sha256(seed:number) must give the hash.',
    'Pon una cantidad': 'Enter an amount', 'segundos': 'seconds', 'Preparando la ruleta…': 'Getting the wheel ready…',
  });
  const en = GM_JX.en;
  const ORDEN = [0, 8, 1, 9, 2, 10, 3, 11, 4, 12, 5, 13, 6, 14, 7];        // casillas en el sentido del reloj desde arriba
  const colorDe = (n) => (n === 0 ? 'verde' : n <= 7 ? 'rojo' : 'negro');
  const MULT = { rojo: 2, negro: 2, verde: 14 };
  const COLS = ['rojo', 'verde', 'negro'];
  const TA = 1.0, W0 = 720, TB = 6.4, TGIRO = TA + TB;                       // arranque, frenada y lo que dura en pantalla (la base paga a los 8 s)
  const C = 2 * Math.PI * 70;

  let el = null, hooks = {}, D = null, err = null;
  const S = { on: false, tPoll: 0, tPlazo: 0, tic: 0, raf: 0, cargando: false, otra: false, ocupa: false, saldo: null, ultima: 0, kick: 0, slot: -1, tTick: 0, sonado: 0, fx: 0, verif: {} };

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
  function discoSvg() {
    const R = 150, r0 = 104, c = 160, pt = (a, rad) => [(c + rad * Math.sin((a * Math.PI) / 180)).toFixed(2), (c - rad * Math.cos((a * Math.PI) / 180)).toFixed(2)];
    let g = '';
    ORDEN.forEach((n, i) => {
      const [x0, y0] = pt(i * 24 - 12, R), [x1, y1] = pt(i * 24 + 12, R), [x2, y2] = pt(i * 24 + 12, r0), [x3, y3] = pt(i * 24 - 12, r0), [tx, ty] = pt(i * 24, (R + r0) / 2 + 2);
      g += `<path class="rl-w ${colorDe(n)}" d="M${x0} ${y0}A${R} ${R} 0 0 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 0 0 ${x3} ${y3}Z"/><text class="rl-wn" x="${tx}" y="${ty}" transform="rotate(${i * 24} ${tx} ${ty})" text-anchor="middle" dominant-baseline="central">${n}</text>`;
      const [lx0, ly0] = pt(i * 24 - 12, R), [lx1, ly1] = pt(i * 24 - 12, r0);
      g += `<line class="rl-sep" x1="${lx0}" y1="${ly0}" x2="${lx1}" y2="${ly1}"/>`;
    });
    return `<svg viewBox="0 0 320 320" aria-hidden="true"><circle class="rl-rim" cx="160" cy="160" r="157"/>${g}<circle class="rl-in" cx="160" cy="160" r="${r0}"/></svg>`;
  }

  function crea() {
    el = document.createElement('div');
    el.className = 'rl'; el.setAttribute('data-notr', '');
    el.innerHTML = `
      <div class="rl-top">
        <div class="rl-wh">
          <div class="rl-disc" data-rot>${discoSvg()}</div>
          <svg class="rl-hubsvg" viewBox="0 0 320 320" aria-hidden="true"><circle class="rl-rt" cx="160" cy="160" r="70"/><circle class="rl-rp" data-ring cx="160" cy="160" r="70" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${C.toFixed(1)}"/></svg>
          <div class="rl-hub"><b class="num" data-hub></b><small data-hubs></small></div>
          <div class="rl-ptr" data-ptr><i></i></div>
          <div class="rl-glow" data-glow></div>
        </div>
        <div class="rl-info">
          <p class="rl-t" data-t></p>
          <p class="rl-s" data-s></p>
          <div class="rl-hist" data-hist></div>
          <p class="rl-cnt" data-cnt></p>
        </div>
      </div>
      <div class="rl-bet">
        <div class="rl-amt" data-amt></div>
        <div class="rl-btns">${COLS.map((c) => `<button type="button" class="rl-b ${c}" data-rl="${c}"><span class="rl-bn">${t(c[0].toUpperCase() + c.slice(1))}</span><em>×${MULT[c]}</em><small>${c === 'verde' ? '0' : c === 'rojo' ? (en() ? '1 to 7' : '1 a 7') : (en() ? '8 to 14' : '8 a 14')}</small><b class="num" data-bt="${c}"></b></button>`).join('')}</div>
        <p class="jg-aviso" data-aviso></p>
      </div>
      <div class="rl-cols" data-cols></div>
      <p class="rl-fair" data-fair></p>`;
    el.querySelector('[data-amt]').innerHTML = cantidad(t, saldo());
    engancha(el, saldo, () => pintaBtns());
    clics(el, 'data-rl', (b) => apostar(b.dataset.rl));
    document.addEventListener('visibilitychange', () => { if (!document.hidden && S.on && visible()) carga(); else programa() });
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
    el.dataset.f = f;
    el.querySelectorAll('[data-jx-saldo]').forEach((x) => (x.textContent = N(saldo())));
    cuenta(); estado(f, r); hist(f, r); cols(f, r); pintaBtns(); justo(r);
    if (f !== 'giro' && f !== 'cerrando') { const a = anguloAhora(D); gira(a) }
    glow(f, r);
    if (f === 'fin' && r && S.sonado !== r.id && J.ahora() - ms(r.cierra) < (TGIRO + 3) * 1000) resultadoSuena(r);
    if ((f === 'giro' || f === 'cerrando') && !S.raf) S.raf = requestAnimationFrame(frame);
  }
  function estado(f, r) {
    const T = el.querySelector('[data-t]'), Sx = el.querySelector('[data-s]');
    if (f === 'idle') { txt(T, t('Apuesta para abrir una ronda')); txt(Sx, t('Todos juegan la misma ronda: la primera apuesta abre 25 segundos')); Sx.className = 'rl-s'; return }
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
  function cuenta() {
    const f = fase(D), r = D && D.ronda, hub = el.querySelector('[data-hub]'), hs = el.querySelector('[data-hubs]'), ring = el.querySelector('[data-ring]');
    let left = 0;
    if (f === 'apuestas') {
      left = Math.max(0, (ms(r.cierra) - J.ahora()) / 1000);
      txt(hub, String(Math.ceil(left))); txt(hs, t('segundos')); hub.className = 'num cd';
      ring.style.strokeDashoffset = (C * (1 - left / (D.ventana || 25))).toFixed(1);
      ring.classList.toggle('pocos', left <= 5);
    } else {
      ring.style.strokeDashoffset = C.toFixed(1);
      if (f === 'fin' || (f === 'idle' && r && r.n != null)) { txt(hub, String(r.n)); hub.className = 'num ' + colorDe(r.n); txt(hs, t(r.color)) }
      else if (f === 'idle' && D.historial && D.historial[0]) { const h = D.historial[0]; txt(hub, String(h.n)); hub.className = 'num dim ' + colorDe(h.n); txt(hs, '') }
      else { txt(hub, ''); txt(hs, '') }
    }
  }
  function hist(f, r) {
    const oculta = (f === 'giro' || f === 'cerrando') && r ? r.id : null;
    const h = (D.historial || []).filter((x) => x.id !== oculta).slice(0, 20);
    html(el.querySelector('[data-hist]'), h.map((x, i) => `<span class="${colorDe(x.n)} ${i === 0 ? 'nuevo' : ''}">${x.n}</span>`).join(''));
    const c = D.cuenta || {}, tot = (c.rojo || 0) + (c.negro || 0) + (c.verde || 0);
    html(el.querySelector('[data-cnt]'), tot ? `<span class="lab">${t('Últimos 100')}</span> <i class="rojo"></i>${c.rojo} <i class="negro"></i>${c.negro} <i class="verde"></i>${c.verde}` : '');
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
      txt(b.querySelector('[data-bt]'), mio ? (en() ? `yours ${N(mio)}` : `tuyo ${N(mio)}`) : (en() ? `+${N(stake.v)}` : `+${N(stake.v)}`));
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
    const s = mod(Math.round(-a / 24), 15);
    if (s !== S.slot) { if (S.slot >= 0) { S.kick = 1; const n = performance.now(); if (S.raf && n - S.tTick > 75) { S.tTick = n; suena('clic') } } S.slot = s }
  }
  function frame() {
    S.raf = 0;
    if (!el || !D) return;
    const f = fase(D);
    if (!el.isConnected) { if (S.on && (f === 'giro' || f === 'cerrando')) S.raf = requestAnimationFrame(frame); return }
    gira(anguloAhora(D));
    const p = el.querySelector('[data-ptr]');
    if (p) { p.style.transform = `rotate(${(-22 * S.kick).toFixed(1)}deg)`; S.kick *= 0.82 }
    if (f === 'giro' || f === 'cerrando') { S.raf = requestAnimationFrame(frame); return }
    if (p) p.style.transform = '';
    pinta();
  }
  function resultadoSuena(r) {
    S.sonado = r.id;
    const mias = (r.apuestas || []).filter((a) => a.player === J.ctx.me);
    if (!mias.length) return;
    const gana = mias.some((a) => a.color === r.color);
    suena(gana ? 'cobrar' : 'perder');
    if (gana && J.ctx.refresh) setTimeout(() => J.ctx.refresh(), 1500);
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
      S.saldo = r.saldo; suena('ficha');
      if (J.ctx.refresh) J.ctx.refresh();
    } catch (e) { const m = msgErr(e, 'db/073'); txt(av, m); J.toast(esc(m)) }
    finally { S.ocupa = false; await carga(); if (hooks.rank) hooks.rank() }
  }

  function para() {
    S.on = false;
    clearTimeout(S.tPoll); clearTimeout(S.tPlazo); clearTimeout(S.tPlazo2); clearInterval(S.tic); cancelAnimationFrame(S.raf); S.raf = 0; S.tic = 0;
    J.calla();
  }

  window.GM_RULETA = {
    montar(hueco, c, h) {
      J.ctx = c; hooks = h || {};
      if (!el) crea();
      if (hueco && hueco !== el) hueco.replaceWith(el);
      if (!S.ocupa && c.saldo != null && S.saldo == null) S.saldo = c.saldo;
      if (!S.on) { S.on = true; J.escucha(carga); pinta(); carga(); return }
      if (Date.now() - S.ultima > 1500) carga(); else { pinta(); programa() }
    },
    para,
    ocupado: () => !!(D && fase(D) === 'giro'),
  };
})();
