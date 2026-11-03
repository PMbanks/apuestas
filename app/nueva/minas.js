// Minas (PM 03-11, db/073). Tablero de 5x5: eliges cuantas minas (1 a 24) y cuanto pones; cada casilla buena sube el multiplicador
// y te puedes retirar cuando quieras; una mina se lleva lo apostado. Las minas las decide la base al empezar y quedan cerradas con un
// hash; cada casilla se abre con una llamada (minas_abrir), asi que el navegador no sabe donde estan hasta que acaba la partida.
// Multiplicador tras k buenas con m minas = 0,97 x C(25,k) / C(25-m,k) (la misma formula que minas_mult en la base), tope x1000.
// juegos.js deja un hueco [data-jx-hueco] en la pestana Minas y llama a GM_MINAS.montar(hueco, ctx, { rank }).
'use strict';
(function () {
  const { N, X, esc, coin, quieto, suena, dic, msgErr, clics, cantidad, engancha, stake, txt, html, lee, guarda } = GM_JX;
  const J = GM_JX.juego('minas');
  const en = GM_JX.en;
  const t = dic({
    'Apuesta': 'Bet', 'Todo': 'All', 'Minas': 'Mines', 'Multiplicador': 'Multiplier', 'Si te retiras': 'If you cash out', 'Siguiente casilla': 'Next tile',
    'Empezar': 'Start', 'Retirar': 'Cash out', 'Casilla al azar': 'Random tile', 'Últimas partidas': 'Latest games', 'Partida': 'Game', 'semilla': 'seed', 'comprobado': 'verified',
    'Elige cuántas minas y cuánto pones. Cada casilla buena sube el multiplicador; retírate antes de pisar una mina.': 'Pick how many mines and how much you bet. Every safe tile raises the multiplier; cash out before you hit a mine.',
    'Abre una casilla': 'Open a tile', 'Pon una cantidad': 'Enter an amount', 'Preparando el tablero…': 'Getting the board ready…', 'Todavía no ha jugado nadie': 'Nobody has played yet',
    'Las minas se deciden al empezar y quedan cerradas con este hash. Al acabar sale la semilla: sha256(semilla:casillas) tiene que dar el hash.': 'The mines are decided when you start and locked with this hash. When the game ends the seed is revealed: sha256(seed:tiles) must give the hash.',
    'Tabla de multiplicadores': 'Multiplier table',
  });

  let el = null, hooks = {}, D = null, err = null;
  const S = { on: false, ocupa: false, saldo: null, ultima: 0, m: Math.min(24, Math.max(1, parseInt(lee('mn-minas'), 10) || 3)), visto: null, abiertasV: new Set(), finVisto: null, verif: {}, tR: 0 };
  const saldo = () => (S.saldo != null ? S.saldo : J.ctx ? J.ctx.saldo : 0);
  const visible = () => !!(el && el.isConnected && !document.hidden);
  const mult = (m, k) => { if (k <= 0) return 1; let v = 1; for (let i = 0; i < k; i++) v = v * (25 - i) / (25 - m - i); return Math.min(1000, Math.floor(0.97 * v * 100 + 1e-9) / 100) };

  /* ---------- dibujos propios: gema tallada y bomba con mecha ---------- */
  const GEMA = `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="mn-g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b6ffe0"/><stop offset=".55" stop-color="#2bd47d"/><stop offset="1" stop-color="#0d7a48"/></linearGradient><linearGradient id="mn-g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7dffc4"/><stop offset="1" stop-color="#169a5b"/></linearGradient></defs>
    <path d="M18 14h28l12 14-26 26L6 28z" fill="url(#mn-g1)"/><path d="M18 14l6 14h16l6-14z" fill="url(#mn-g2)"/><path d="M6 28h52L32 54z" fill="#1fae67" opacity=".85"/><path d="M24 28l8 26 8-26z" fill="#5ff0ab" opacity=".9"/><path d="M6 28l12-14 6 14zM58 28L46 14l-6 14z" fill="#9dffd2" opacity=".55"/><path d="M21 17l3 7" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".85"/></svg>`;
  const BOMBA = `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><radialGradient id="mn-b1" cx=".35" cy=".35" r=".75"><stop offset="0" stop-color="#5a6070"/><stop offset=".45" stop-color="#262a33"/><stop offset="1" stop-color="#0c0e12"/></radialGradient></defs>
    <circle cx="29" cy="37" r="19" fill="url(#mn-b1)"/><rect x="34" y="14" width="10" height="9" rx="2" transform="rotate(38 39 18)" fill="#3a3f4b"/><path d="M44 13c3-5 8-6 11-3" fill="none" stroke="#c9a46a" stroke-width="2.6" stroke-linecap="round"/>
    <g class="mn-chispa"><path d="M56 9l2-5 1 5 5 1-5 2-1 5-2-5-5-1z" fill="#ffd166"/><circle cx="57" cy="10" r="2.2" fill="#fff6d6"/></g><ellipse cx="22" cy="29" rx="6" ry="4" fill="#fff" opacity=".18" transform="rotate(-30 22 29)"/></svg>`;

  function crea() {
    el = document.createElement('div');
    el.className = 'mn'; el.setAttribute('data-notr', '');
    let celdas = '';
    for (let i = 0; i < 25; i++) celdas += `<button type="button" class="mn-c" data-mn="abrir" data-v="${i}" aria-label="${i + 1}"><span class="mn-ci"><span class="mn-f"></span><span class="mn-b"></span></span></button>`;
    el.innerHTML = `
      <div class="mn-side">
        <p class="mn-how">${t('Elige cuántas minas y cuánto pones. Cada casilla buena sube el multiplicador; retírate antes de pisar una mina.')}</p>
        <div data-amt>${cantidad(t, saldo())}</div>
        <div class="mn-mines"><div class="jg-lab"><span class="lab">${t('Minas')}</span><b class="num" data-mv>${S.m}</b></div>
          <input type="range" min="1" max="24" step="1" value="${S.m}" data-mn-m aria-label="${t('Minas')}">
          <div class="jg-q">${[1, 3, 5, 10, 24].map((m) => `<button type="button" data-mn="m" data-v="${m}">${m}</button>`).join('')}</div></div>
        <button type="button" class="go" data-mn="go"><span data-gol>${t('Empezar')}</span><span class="jg-pay" data-gop></span></button>
        <button type="button" class="go ghost" data-mn="azar" hidden>${t('Casilla al azar')}</button>
        <p class="jg-aviso" data-aviso></p>
        <p class="mn-fair" data-fair></p>
      </div>
      <div class="mn-main">
        <div class="mn-head">
          <div><span class="lab">${t('Multiplicador')}</span><b class="num mn-x" data-x>×1,00</b></div>
          <div><span class="lab">${t('Si te retiras')}</span><b class="num" data-pay>0</b></div>
          <div><span class="lab">${t('Siguiente casilla')}</span><b class="num" data-nx></b></div>
        </div>
        <div class="mn-board" data-board>${celdas}<div class="mn-flash" data-flash></div></div>
        <p class="mn-msg" data-msg></p>
        <span class="lab mn-lt">${t('Tabla de multiplicadores')}</span>
        <div class="mn-lad" data-lad></div>
        <div class="mn-rec" data-ult></div>
      </div>`;
    engancha(el, saldo, () => boton());
    el.addEventListener('input', (e) => { if (e.target.matches('[data-mn-m]')) ponMinas(+e.target.value) });
    clics(el, 'data-mn', (b) => accion(b.dataset.mn, b.dataset.v));
    document.addEventListener('visibilitychange', () => { if (!document.hidden && S.on && visible()) carga() });
  }
  function ponMinas(m) {
    if (enJuego()) return;
    S.m = Math.min(24, Math.max(1, m | 0)); guarda('mn-minas', S.m);
    const r = el.querySelector('[data-mn-m]'); if (r && +r.value !== S.m) r.value = S.m;
    r && r.style.setProperty('--p', ((S.m - 1) / 23 * 100).toFixed(1) + '%');
    txt(el.querySelector('[data-mv]'), String(S.m));
    if (!enJuego() && S.finVisto == null) tablero();
    cabeza(); escalera(); boton();
  }

  /* ---------- datos ---------- */
  const partida = () => D && D.partida;
  const enJuego = () => !!(partida() && partida().estado === 'curso');
  async function carga() {
    if (!J.ctx) return;
    if (!visible()) { if (S.on && el && !document.hidden && (S.reint = (S.reint || 0) + 1) <= 15) { clearTimeout(S.tR); S.tR = setTimeout(carga, 200) } return }
    S.reint = 0; S.ultima = Date.now();
    try { const d = await J.rpc('minas_estado'); err = null; recibe(d) } catch (e) { err = msgErr(e, 'db/073'); pinta() }
  }
  function recibe(d) {
    const antes = partida();
    D = d; S.saldo = d.saldo;
    const p = d.partida;
    // una partida ya acabada solo se ensena destapada si se acabo aqui (en esta visita); si no, tablero limpio
    if (p && p.estado === 'curso') { S.finVisto = null; if (S.visto !== p.id) { S.visto = p.id; S.abiertasV = new Set(p.abiertas) } }
    else if (!(antes && p && antes.id === p.id) && S.finVisto !== (p && p.id)) S.finVisto = null;
    pinta();
  }

  /* ---------- pintar ---------- */
  function pinta() {
    if (!el) return;
    const msg = el.querySelector('[data-msg]');
    if (err) { txt(msg, err); msg.className = 'mn-msg lose'; return }
    if (!D) { txt(msg, t('Preparando el tablero…')); return }
    el.querySelectorAll('[data-jx-saldo]').forEach((x) => (x.textContent = N(saldo())));
    const p = partida();
    if (p && p.estado === 'curso' && p.minas !== S.m) { S.m = p.minas; const r = el.querySelector('[data-mn-m]'); if (r) r.value = S.m; txt(el.querySelector('[data-mv]'), String(S.m)) }
    el.querySelector('[data-mn-m]').disabled = enJuego();
    el.querySelector('[data-mn-m]').style.setProperty('--p', ((S.m - 1) / 23 * 100).toFixed(1) + '%');
    el.querySelectorAll('[data-mn="m"]').forEach((b) => { b.disabled = enJuego(); b.classList.toggle('on', +b.dataset.v === S.m) });
    tablero(); cabeza(); escalera(); boton(); recientes(); justo();
    if (!S.ocupa && !(S.finVisto && p && p.id === S.finVisto)) { txt(msg, enJuego() ? t('Abre una casilla') : ''); msg.className = 'mn-msg' }
  }
  // el tablero: clases por casilla (sin rehacer los nodos, para que las animaciones no se corten)
  function tablero(nueva) {
    const p = partida(), cur = enJuego(), fin = p && !cur && S.finVisto === p.id;
    const ab = new Set(cur || fin ? p.abiertas : []), mapa = new Set(fin && p.mapa ? p.mapa : []);
    el.querySelector('[data-board]').classList.toggle('vivo', cur);
    el.querySelectorAll('.mn-c').forEach((c) => {
      const i = +c.dataset.v, b = c.querySelector('.mn-b');
      let k = 'mn-c';
      if (ab.has(i)) { k += ' abierta gema'; if (nueva === i) k += ' anim'; if (b._k !== 'g') { b._k = 'g'; b.innerHTML = GEMA } }
      else if (fin && p.boom === i) { k += ' abierta bomba boom'; if (b._k !== 'b') { b._k = 'b'; b.innerHTML = BOMBA } }
      else if (fin) { const m = mapa.has(i); k += ' vista ' + (m ? 'bomba' : 'gema'); const kk = m ? 'b' : 'g'; if (b._k !== kk) { b._k = kk; b.innerHTML = m ? BOMBA : GEMA } }
      if (S.pend === i) k += ' espera';
      if (c.className !== k) c.className = k;
      c.disabled = !cur || ab.has(i) || S.ocupa;
    });
  }
  function cabeza() {
    const p = partida(), cur = enJuego(), fin = p && !cur && S.finVisto === p.id;
    const k = cur || fin ? p.abiertas.length : 0, m = cur || fin ? p.minas : S.m, st = cur || fin ? p.stake : stake.v;
    const x = cur || fin ? Number(p.mult) : 1;
    const xe = el.querySelector('[data-x]');
    txt(xe, '×' + X(x)); xe.className = 'num mn-x' + (k ? ' sube' : '');
    const pay = fin ? p.pago : Math.floor(st * x);
    html(el.querySelector('[data-pay]'), (k || fin ? N(pay) : '·') + (k || fin ? coin() : ''));
    const nx = k < 25 - m ? mult(m, k + 1) : null;
    txt(el.querySelector('[data-nx]'), nx && !fin ? '×' + X(nx) : '·');
  }
  function escalera() {
    const p = partida(), cur = enJuego(), m = cur ? p.minas : S.m, k = cur ? p.abiertas.length : 0, max = Math.min(25 - m, 24);
    let h = '';
    for (let i = 1; i <= max; i++) h += `<span class="${i <= k ? 'ok' : i === k + 1 && cur ? 'sig' : ''}"><small>${i}</small><b class="num">×${X(mult(m, i))}</b></span>`;
    const L = el.querySelector('[data-lad]');
    if (html(L, h)) { const s = L.querySelector('.sig') || L.querySelector('.ok:last-of-type'); if (s) L.scrollLeft = Math.max(0, s.offsetLeft - L.clientWidth / 2) }
  }
  function boton() {
    const b = el.querySelector('[data-mn="go"]'), az = el.querySelector('[data-mn="azar"]'), p = partida();
    if (enJuego()) {
      const k = p.abiertas.length;
      txt(b.querySelector('[data-gol]'), t('Retirar')); txt(b.querySelector('[data-gop]'), k ? N(Math.floor(p.stake * p.mult)) : '');
      b.className = 'go jg-out'; b.disabled = !k || S.ocupa; az.hidden = false; az.disabled = S.ocupa;
    } else {
      txt(b.querySelector('[data-gol]'), (en() ? 'Start for ' : 'Empezar por ') + N(stake.v)); txt(b.querySelector('[data-gop]'), '');
      b.className = 'go'; b.disabled = S.ocupa; az.hidden = true;
    }
  }
  // las 5 ultimas jugadas de todos: el bloque comun (jx.js ultimas, db/077)
  function recientes() { if (S.ult) S.ult.refresca() }
  function justo() {
    const p = partida(), f = el.querySelector('[data-fair]');
    if (!p || (!enJuego() && S.finVisto !== p.id)) { html(f, ''); return }
    let h = `<span title="${esc(t('Las minas se deciden al empezar y quedan cerradas con este hash. Al acabar sale la semilla: sha256(semilla:casillas) tiene que dar el hash.'))}">${t('Partida')} ${p.id} · sha256 <code>${esc(p.hash.slice(0, 10))}…${esc(p.hash.slice(-6))}</code></span>`;
    if (p.semilla && p.mapa) {
      h += ` · ${t('semilla')} <code>${esc(p.semilla.slice(0, 8))}…</code>`;
      const v = S.verif[p.id];
      if (v === true) h += ` <b class="ok">✓ ${t('comprobado')}</b>`;
      else if (v === undefined && window.crypto && crypto.subtle) {
        S.verif[p.id] = null;
        crypto.subtle.digest('SHA-256', new TextEncoder().encode(p.semilla + ':' + p.mapa.join(','))).then((b) => {
          S.verif[p.id] = [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('') === p.hash; justo();
        }).catch(() => {});
      }
    }
    html(f, h);
  }

  /* ---------- jugar ---------- */
  function aviso(m) { txt(el.querySelector('[data-aviso]'), m || '') }
  async function accion(a, v) {
    if (a === 'm') return ponMinas(+v);
    if (S.ocupa) return;
    aviso('');
    if (a === 'go') return enJuego() ? cobrar() : empezar();
    if (a === 'abrir') return abrir(+v);
    if (a === 'azar') { const p = partida(); if (!p) return; const libres = []; for (let i = 0; i < 25; i++) if (!p.abiertas.includes(i)) libres.push(i); if (libres.length) abrir(libres[Math.floor(Math.random() * libres.length)]) }
  }
  async function empezar() {
    if (!(stake.v >= 1)) return aviso(t('Pon una cantidad'));
    if (stake.v > saldo()) return aviso(en() ? `You do not have that much: ${N(saldo())} left` : `No tienes tanto: te quedan ${N(saldo())}`);
    S.ocupa = true; boton();
    try {
      const r = await J.rpc('minas_empezar', { p_stake: stake.v, p_minas: S.m });
      S.saldo = r.saldo; S.finVisto = null; S.visto = r.partida.id;
      D = { ...D, partida: r.partida }; suena('ficha');
      const bd = el.querySelector('[data-board]'); bd.classList.remove('nueva'); void bd.offsetWidth; bd.classList.add('nueva');
      if (J.ctx.refresh) J.ctx.refresh();
    } catch (e) { const m = msgErr(e, 'db/073'); aviso(m); J.toast(esc(m)) }
    finally { S.ocupa = false; pinta() }
  }
  async function abrir(i) {
    if (!enJuego()) return;
    S.ocupa = true; S.pend = i; tablero(); boton();
    let r = null;
    try { r = await J.rpc('minas_abrir', { p_casilla: i }) } catch (e) { const m = msgErr(e, 'db/073'); aviso(m); J.toast(esc(m)) }
    S.pend = null; S.ocupa = false;
    if (!r) { pinta(); return }
    D = { ...D, partida: r.partida }; S.saldo = r.saldo;
    const msg = el.querySelector('[data-msg]');
    if (r.mina) {
      S.finVisto = r.partida.id; suena('perder');
      pinta();
      const bd = el.querySelector('[data-board]'); bd.classList.remove('pum'); void bd.offsetWidth; bd.classList.add('pum');
      txt(msg, en() ? `Mine! You lose ${N(r.partida.stake)}` : `¡Mina! Pierdes ${N(r.partida.stake)}`); msg.className = 'mn-msg lose';
      fin();
    } else if (r.partida.estado === 'cobrada') {
      S.finVisto = r.partida.id; pinta();
      gana(r.partida);
      txt(msg, en() ? `All safe tiles! ×${X(r.partida.mult)} · +${N(r.partida.pago)}` : `¡Todas las buenas! ×${X(r.partida.mult)} · +${N(r.partida.pago)}`); msg.className = 'mn-msg win';
      fin();
    } else { suena('ficha'); tablero(i); cabeza(); escalera(); boton(); justo(); txt(msg, ''); }
  }
  async function cobrar() {
    const p = partida(); if (!p || !p.abiertas.length) return;
    S.ocupa = true; boton();
    try {
      const r = await J.rpc('minas_cobrar');
      D = { ...D, partida: r.partida }; S.saldo = r.saldo; S.finVisto = r.partida.id;
      S.ocupa = false; pinta(); gana(r.partida);
      const msg = el.querySelector('[data-msg]');
      txt(msg, en() ? `Cashed out at ×${X(r.partida.mult)} · +${N(r.partida.pago)}` : `Te retiras en ×${X(r.partida.mult)} · +${N(r.partida.pago)}`); msg.className = 'mn-msg win';
      fin();
    } catch (e) { const m = msgErr(e, 'db/073'); aviso(m); J.toast(esc(m)) }
    finally { S.ocupa = false; boton() }
  }
  // el momento de ganar: jingle y estallido de monedas con lo que te llevas limpio
  function gana(p) { void p; suena('cobrar') }
  function fin() {
    if (J.ctx.refresh) setTimeout(() => J.ctx.refresh(), 400);
    if (hooks.rank) setTimeout(hooks.rank, 600);
    setTimeout(() => { J.rpc('minas_estado').then((d) => { const keep = S.finVisto; D = d; S.saldo = d.saldo; S.finVisto = keep; recientes() }).catch(() => {}) }, 700);
  }

  window.GM_MINAS = {
    montar(hueco, c, h) {
      J.ctx = c; hooks = h || {};
      if (!el) crea();
      if (hueco && hueco !== el) hueco.replaceWith(el);
      if (S.saldo == null && c.saldo != null) S.saldo = c.saldo;
      if (!S.ult) { S.ult = GM_JX.ultimas('minas', J); el.querySelector('[data-ult]').replaceWith(S.ult.el); S.ult.el.classList.add('mn-rec') }
      S.ult.arranca();
      if (!S.on) { S.on = true; pinta(); carga(); return }
      if (Date.now() - S.ultima > 15000 && !S.ocupa) carga(); else el.querySelectorAll('[data-jx-saldo]').forEach((x) => (x.textContent = N(saldo())));
    },
    para() { S.on = false; if (S.ult) S.ult.para() },
    ocupado: () => S.ocupa,
  };
})();
