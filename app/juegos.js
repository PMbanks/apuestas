// Juegos de Gambling Master: cara o cruz, crash, ruleta, blackjack y plinko, con V-Bucks.
// El azar, las cartas, el punto de explosion y el dinero los pone la base (db/010_juegos.sql): aqui solo se pide
// ("apuesto esto", "retiro ya", "pido carta") y se pinta lo que devuelve. Nada de esto se decide en el navegador.
// La app lo monta asi (ver JUEGOS-INTEGRAR.md): R.juegos = () => GM_JUEGOS.html(ctx) y, justo despues de pintar,
// GM_JUEGOS.montar(vista, ctx). El nodo de la pantalla es siempre el mismo, asi que aunque la app repinte (cada minuto
// o cuando alguien mueve dinero) las animaciones siguen. Sin bucles de fondo: los temporizadores y requestAnimationFrame
// solo corren mientras hay una ronda o una animacion y la pantalla esta a la vista.
'use strict';
(function () {
  const JUEGOS = [['blackjack', 'Blackjack']];   // PM, 30-10: solo blackjack, 100 de perdida maxima al dia
  const FN = { moneda: 'moneda_estado', crash: 'crash_estado', ruleta: 'ruleta_estado', blackjack: 'bj_estado', plinko: 'plinko_estado' };
  const SUIT = ['♠', '♥', '♦', '♣'], RANK = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const ORDEN = [0, 8, 1, 9, 2, 10, 3, 11, 4, 12, 5, 13, 6, 14, 7];       // casillas de la ruleta, en el sentido del reloj desde arriba
  const SPIN = 6;                                                          // segundos de giro (la base paga a los 7)
  const DX = 26, DY = 24, TOP = 26, FILAS = 12;                            // geometria del plinko

  /* ---------- estado ---------- */
  let ctx = null, root = null;
  const S = {
    juego: 'blackjack', stake: Math.max(1, parseInt(lee('jg-stake'), 10) || 100), saldo: 0,
    lado: 'cara', para: null, riesgo: 'medio', color: 'rojo', auto: '', busy: 0, err: null, ocupa: false,
    mo: { vistos: parseInt(lee('jg-mo-visto'), 10) || null, lado: 'cara', msg: '' },
    cr: { ultima: null },
    ru: { ang: 0, spin: null, hecho: null, msg: '' },
    bj: { init: false, id: null, nj: 0, nb: 0 },
    pl: { msg: '', ball: null },
  };
  const D = { moneda: null, crash: null, ruleta: null, blackjack: null, plinko: null, res: null };
  const T = { off: 0 };
  let ultima = 0, cargaId = 0, pend = false, refs = {}, sigs = {};
  let crRaf = 0, crPoll = 0, ruRaf = 0, ruPoll = 0, ruTimer = 0;

  /* ---------- utilidades ---------- */
  function lee(k) { try { return localStorage.getItem(k) } catch { return null } }
  function guarda(k, v) { try { localStorage.setItem(k, String(v)) } catch {} }
  const N = (x) => String(Math.round(x || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const X = (m) => Number(m).toFixed(2).replace('.', ',');
  const M1 = (m) => String(m).replace('.', ',');
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const coin = () => '<span class="cn"></span>';
  const quieto = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } };
  const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const ahora = () => Date.now() + T.off;
  const ms = (t) => Date.parse(t);
  const visible = () => !!(root && root.isConnected && !document.hidden);
  const toast = (h) => { if (ctx && ctx.toast) ctx.toast(h) };
  const jug = (u) => (ctx && ctx.jugadores.find((j) => j.uuid === u || j.id === u)) || { id: 'pm', color: 'pm', n: '·', uuid: u };
  const av = (u, cls = 'sm') => (ctx && ctx.av ? ctx.av(jug(u).id, cls) : `<span class="av ${esc(jug(u).color)} ${cls}">${esc(String(jug(u).n || '·')[0])}</span>`);
  const nom = (u) => (u === (ctx && ctx.me) ? 'Tú' : jug(u).n);
  const cssVar = (n, d) => { try { return getComputedStyle(root).getPropertyValue(n).trim() || d } catch { return d } };
  const msgErr = (e) => {
    const m = (e && (e.message || e.error_description)) || 'Algo ha fallado';
    return /Could not find the function|PGRST202|schema cache/i.test(m + ((e && e.code) || '')) ? 'Los juegos aún no están en la base: falta cargar db/010_juegos.sql' : m;
  };
  const falla = (e) => toast(esc(msgErr(e)));
  const tr = (el) => { if (window.GM_LANG && el) GM_LANG.traduce(el) };
  // escribe un texto solo si ha cambiado y lo pasa por el diccionario (asi no se pisa la traduccion en cada fotograma)
  const setT = (el, t) => { if (el && el._t !== t) { el._t = t; el.textContent = t; tr(el) } };

  async function rpc(fn, args) {
    const t0 = Date.now();
    const { data, error } = await ctx.db.rpc(fn, args || {});
    if (error) throw error;
    if (data && data.now) { const s = ms(data.now); if (s) T.off = s - (t0 + Date.now()) / 2 }
    if (data && typeof data.saldo === 'number') { if (S.busy) S.saldoPend = data.saldo; else S.saldo = data.saldo }
    return data;
  }

  /* ---------- cargar ---------- */
  // Pide el estado del juego que se ve (y el resumen para los avisos del selector). Una sola vez por pulso: la app llama a montar() tras cada repintado.
  async function cargar() {
    if (!ctx || !root || document.hidden) return;
    const j = S.juego, n = ++cargaId;
    ultima = Date.now();
    try {
      const [d, res] = await Promise.all([rpc(FN[j]), rpc('jg_resumen')]);
      if (n !== cargaId) return;
      D[j] = d; D.res = res; S.err = null;
      aplica(j);
    } catch (e) { if (n !== cargaId) return; S.err = msgErr(e) }
    pintaSi();
  }
  // solo repinta si lo que se ve ha cambiado
  function pintaSi(fuerza) {
    const s = firma();
    if (!fuerza && s === sigs.v) { post(); return }
    sigs.v = s; pinta();
  }
  function firma() {
    const d = D[S.juego] || {}, r = D.res || {};
    const base = [S.juego, S.err, r.crash && r.crash.id, r.ruleta && r.ruleta.estado, r.moneda, r.bj, S.lado, S.para, S.riesgo, S.color, S.mo.lado, S.mo.msg, S.ru.msg, S.pl.msg];
    return JSON.stringify([base, d, S.juego === 'crash' ? crFase() : S.juego === 'ruleta' ? ruFase() : 0], (k, v) => (k === 'now' ? undefined : v));
  }
  // lo propio de cada juego al llegar datos nuevos
  function aplica(j) {
    if (j === 'moneda') {
      const rec = D.moneda.recientes || [], max = rec.reduce((a, x) => Math.max(a, x.id), 0);
      if (S.mo.vistos == null) { S.mo.vistos = max; guarda('jg-mo-visto', max); return }
      const nuevo = rec.filter((x) => x.id > S.mo.vistos && (x.creador === ctx.me || x.rival === ctx.me)).sort((a, b) => a.id - b.id).pop();
      if (max > S.mo.vistos) { S.mo.vistos = max; guarda('jg-mo-visto', max) }
      if (nuevo && nuevo.creador === ctx.me && ahora() - ms(nuevo.cerrado) < 60000) moLanza(nuevo.salio, nuevo.ganador === ctx.me ? `Salió ${nuevo.salio}. ${nom(nuevo.rival)} aceptó y ganas ${N(nuevo.stake * 2)}` : `Salió ${nuevo.salio}. ${nom(nuevo.rival)} aceptó y pierdes ${N(nuevo.stake)}`, nuevo.ganador === ctx.me, false);
    } else if (j === 'ruleta') ruAplica();
    else if (j === 'blackjack') {
      const m = D.blackjack.mano;
      if (!S.bj.init) S.bj = { init: true, id: m && m.id, nj: m ? m.jugador.length : 0, nb: m ? bjNb(m) : 0 };
    }
  }

  /* ---------- armazon ---------- */
  function crea() {
    root = document.createElement('div');
    root.className = 'jg';
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('focusout', (e) => {
      if (e.target.matches && e.target.matches('[data-in]')) e.target.value = N(S.stake || 0);
      if (pend) setTimeout(() => { if (pend && !S.busy) pinta() }, 60);
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && root && root.isConnected) { cargar(); reanuda() } else { paraLoops() } });
  }
  function pinta() {
    if (!root || !ctx) return;
    const f = document.activeElement;
    if ((S.busy && root.dataset.j === S.juego) || (f && root.contains(f) && f.matches('input'))) { pend = true; return }
    pend = false;
    root.dataset.j = S.juego;
    root.innerHTML = `<nav class="jg-tabs">${tabs()}</nav>${S.err ? `<p class="jg-err">${esc(S.err)}</p>` : vista()}`;
    if (window.GM_LANG) GM_LANG.traduce(root);
    refs = {};
    const nav = root.querySelector('.jg-tabs'), on = nav && nav.querySelector('.on');
    if (on && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = Math.max(0, on.offsetLeft - 24);
    post();
  }
  function libera() {
    if (S.busy > 0) S.busy--;
    if (S.busy) return;
    if (S.saldoPend != null) { S.saldo = S.saldoPend; S.saldoPend = null }
    if (pend) pinta();
    root && root.querySelectorAll('[data-saldo]').forEach((e) => (e.textContent = N(S.saldo)));
    if (ctx.refresh) ctx.refresh();
  }
  function tabs() {
    const r = D.res || {};
    const pt = { crash: !!r.crash, ruleta: !!r.ruleta, blackjack: !!r.bj };
    return JUEGOS.map(([k, n]) => `<button class="jg-tab ${S.juego === k ? 'on' : ''}" data-jg="tab" data-v="${k}">${n}${pt[k] ? '<i></i>' : ''}${k === 'moneda' && r.moneda > 0 ? `<b>${r.moneda}</b>` : ''}</button>`).join('');
  }
  function vista() {
    return { moneda: vMoneda, crash: vCrash, ruleta: vRuleta, blackjack: vBj, plinko: vPlinko }[S.juego]();
  }
  function post() {
    if (!root) return;
    refs = {
      mult: root.querySelector('[data-mult]'), sub: root.querySelector('[data-sub]'), cv: root.querySelector('[data-cv]'), go: root.querySelector('[data-go]'),
      coin: root.querySelector('[data-coin]'), rot: root.querySelector('[data-rot]'), hub: root.querySelector('[data-hub]'), ball: root.querySelector('[data-ball]'),
    };
    root.querySelectorAll('[data-saldo]').forEach((e) => (e.textContent = N(S.saldo)));
    if (S.juego === 'moneda' && refs.coin) refs.coin.style.transform = `rotateY(${S.mo.lado === 'cara' ? 0 : 180}deg)`;
    if (S.juego === 'crash') { crFrame(true); crLoop() }
    if (S.juego === 'ruleta') { ruPos(); ruLoop() }
    if (S.juego === 'blackjack') bjPost();
  }
  function paraLoops() { cancelAnimationFrame(crRaf); clearTimeout(crPoll); cancelAnimationFrame(ruRaf); clearTimeout(ruPoll); clearTimeout(ruTimer); crRaf = crPoll = ruRaf = ruPoll = ruTimer = 0 }
  function reanuda() { if (S.juego === 'crash') crLoop(); if (S.juego === 'ruleta') ruLoop() }

  /* ---------- eventos ---------- */
  const A = {};
  async function onClick(e) {
    const b = e.target.closest('[data-jg]');
    if (!b || !root.contains(b) || b.disabled) return;
    const a = A[b.dataset.jg];
    if (!a) return;
    if (S.ocupa && !a.libre) return;
    if (!a.libre) S.ocupa = true;
    try { await a(b.dataset, b) } catch (err) { falla(err) } finally { S.ocupa = false }
  }
  function onInput(e) {
    const t = e.target;
    if (t.matches('[data-in]')) {
      S.stake = Math.min(100000, parseInt(t.value.replace(/\D/g, ''), 10) || 0);
      guarda('jg-stake', S.stake); botones();
    } else if (t.matches('[data-auto]')) { S.auto = t.value; crBoton() }
  }
  A.tab = ({ v }) => {
    if (S.juego === v) return;
    S.juego = v; guarda('jg-juego', v); paraLoops(); sigs.v = null;
    pinta(); cargar();
  };
  A.q = ({ v }) => {
    const sal = Math.max(0, S.saldo || ctx.saldo || 0);
    S.stake = v === 'mitad' ? Math.max(1, Math.floor(S.stake / 2)) : v === 'doble' ? Math.min(100000, S.stake * 2) : v === 'todo' ? Math.max(1, Math.min(100000, sal)) : +v;
    guarda('jg-stake', S.stake);
    const i = root.querySelector('[data-in]'); if (i) i.value = N(S.stake);
    botones();
  };
  A.q.libre = true;
  // pone al dia lo que lleva la cantidad escrita sin repintar (para no perder el foco)
  function botones() {
    root.querySelectorAll('[data-go-n]').forEach((e) => (e.textContent = N(S.stake)));
    root.querySelectorAll('[data-q-todo]').forEach((e) => e.classList.toggle('on', S.stake >= S.saldo && S.saldo > 0));
    if (S.juego === 'crash') crBoton();
  }
  const queda = () => (S.saldo != null ? S.saldo : ctx.saldo);
  function stakeOk() {
    if (!(S.stake >= 1)) { toast('Pon una cantidad'); return false }
    if (S.stake > queda()) { toast(`No tienes tanto: te quedan <b>${N(queda())}</b>`); return false }
    return true;
  }
  function apuesta() {
    return `<div class="jg-stake"><div class="jg-lab"><span class="lab">Apuesta</span><span class="jg-sal"><span class="num" data-saldo>${N(S.saldo)}</span>${coin()}</span></div>
      <label class="jg-amt"><input data-in inputmode="numeric" autocomplete="off" value="${N(S.stake)}" aria-label="Apuesta">${coin()}</label>
      <div class="jg-q"><button data-jg="q" data-v="100">100</button><button data-jg="q" data-v="500">500</button><button data-jg="q" data-v="1000">1.000</button><button data-jg="q" data-v="mitad">1/2</button><button data-jg="q" data-v="doble">×2</button><button data-jg="q" data-v="todo" data-q-todo>Todo</button></div></div>`;
  }
  const fila = (cuando, a, b, c, d) => `<div class="jg-r ${cuando || ''}">${a}<span class="jg-r-n">${b}</span>${c || ''}${d || ''}</div>`;

  /* =====================================================================
     CARA O CRUZ
     ===================================================================== */
  function carasHtml() {
    return `<div class="jg-face cara"><img src="img/moneda-corona.webp" alt="Cara" draggable="false"></div><div class="jg-face cruz"><svg viewBox="0 0 100 100" aria-label="Cruz"><circle cx="50" cy="50" r="47" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="1.2 2.2"/><circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".5"/><path d="M50 22v56M22 50h56" stroke="currentColor" stroke-width="9" stroke-linecap="round"/></svg></div>`;
  }
  function vMoneda() {
    const d = D.moneda || { abiertos: [], recientes: [] };
    const otros = ctx.jugadores.filter((j) => j.uuid !== ctx.me);
    const mios = d.abiertos.filter((a) => a.creador === ctx.me), ajenos = d.abiertos.filter((a) => a.creador !== ctx.me);
    const quien = `<button class="jg-who ${S.para == null ? 'on' : ''}" data-jg="para" data-v=""><span class="jg-any">?</span><em>Cualquiera</em></button>` +
      otros.map((j) => `<button class="jg-who ${S.para === j.uuid ? 'on' : ''}" data-jg="para" data-v="${esc(j.uuid)}">${av(j.uuid, 'xl')}<em>${esc(j.n)}</em></button>`).join('');
    return `<section class="jg-g">
      <div class="jg-stage jg-mo">
        <div class="jg-coin-w"><div class="jg-coin" data-coin>${carasHtml()}</div></div>
        <p class="jg-msg ${S.mo.cls || ''}" data-msg>${esc(S.mo.msg)}</p>
      </div>
      <div class="jg-side">
        <span class="lab">Contra</span><div class="jg-whos">${quien}</div>
        <span class="lab jg-gap">Tu lado</span>
        <div class="chips"><button class="chip ${S.lado === 'cara' ? 'on' : ''}" data-jg="lado" data-v="cara">Cara</button><button class="chip ${S.lado === 'cruz' ? 'on' : ''}" data-jg="lado" data-v="cruz">Cruz</button></div>
        <div class="jg-gap">${apuesta()}</div>
        <button class="go" data-jg="retar" data-go>Retar por <span data-go-n>${N(S.stake)}</span></button>
        ${ajenos.length ? `<span class="lab jg-sec">Abiertos</span>${ajenos.map((a) => fila('', av(a.creador), `${esc(nom(a.creador))}<em>${a.para ? 'te reta, ' : ''}va a ${esc(a.lado)}</em>`, `<b class="num">${N(a.stake)}</b>`, `<button class="jg-b" data-jg="aceptar" data-id="${a.id}">Aceptar</button>`)).join('')}` : ''}
        ${mios.length ? `<span class="lab jg-sec">Tus retos</span>${mios.map((a) => fila('', av(a.creador), `${a.para ? esc(nom(a.para)) : 'Cualquiera'}<em>${esc(a.lado)}</em>`, `<b class="num">${N(a.stake)}</b>`, `<button class="jg-b" data-jg="retirarReto" data-id="${a.id}">Retirar</button>`)).join('')}` : ''}
        ${d.recientes.length ? `<span class="lab jg-sec">Últimos</span>${d.recientes.slice(0, 6).map((a) => { const perd = a.ganador === a.creador ? a.rival : a.creador; return fila('', av(a.ganador), `${esc(nom(a.ganador))}<em>le gana${a.ganador === ctx.me ? 's' : ''} a ${esc(perd === ctx.me ? 'ti' : nom(perd))} · ${esc(a.salio)}</em>`, `<b class="num win">+${N(a.stake)}</b>`) }).join('')}` : ''}
      </div></section>`;
  }
  // yaBusy: quien llama ya ha sumado un "ocupado" antes de pedir el resultado (asi el saldo no se mueve antes de tiempo)
  async function moLanza(salio, msg, gane, yaBusy) {
    S.mo.msg = '';
    if (S.juego !== 'moneda' || !refs.coin || quieto()) { S.mo.lado = salio; S.mo.msg = msg; S.mo.cls = gane ? 'win' : 'lose'; if (yaBusy) libera(); return }
    if (!yaBusy) S.busy++;
    const c = refs.coin, fin = salio === 'cara' ? 0 : 180, st = S.mo.lado === 'cara' ? 0 : 180, giros = 1800, fe = st + giros + (st === fin ? 0 : 180);
    const msgEl = root.querySelector('[data-msg]'); if (msgEl) { setT(msgEl, ''); msgEl.className = 'jg-msg' }
    let a;
    try { a = c.animate([{ transform: `translateY(0) rotateY(${st}deg)` }, { transform: `translateY(-70px) rotateY(${(st + fe) / 2}deg)`, offset: 0.45 }, { transform: `translateY(0) rotateY(${fe}deg)` }], { duration: 1700, easing: 'cubic-bezier(.3,.55,.3,1)', fill: 'forwards' }); await a.finished } catch {}
    S.mo.lado = salio; S.mo.msg = msg; S.mo.cls = gane ? 'win' : 'lose';
    c.style.transform = `rotateY(${fin}deg)`; try { a && a.cancel() } catch {}
    const m2 = root && root.querySelector('[data-msg]'); if (m2) { setT(m2, msg); m2.className = 'jg-msg ' + (gane ? 'win' : 'lose') }
    libera();
  }
  A.para = ({ v }) => { S.para = v || null; pintaSi(true) };
  A.para.libre = true;
  A.lado = ({ v }) => { S.lado = v; pintaSi(true) };
  A.lado.libre = true;
  A.retar = async () => {
    if (!stakeOk()) return;
    const r = await rpc('moneda_crear', { p_stake: S.stake, p_para: S.para, p_lado: S.lado });
    S.mo.msg = ''; toast(`Reto lanzado por <b>${N(S.stake)}</b>`);
    await cargar(); if (ctx.refresh) ctx.refresh();
  };
  A.aceptar = async ({ id }) => {
    const a = (D.moneda.abiertos || []).find((x) => x.id === +id);
    if (a && a.stake > queda()) return toast(`No tienes tanto: te quedan <b>${N(queda())}</b>`);
    S.busy++;
    let r; try { r = await rpc('moneda_aceptar', { p_id: +id }) } catch (e) { S.busy--; throw e }
    S.mo.vistos = Math.max(S.mo.vistos || 0, +id); guarda('jg-mo-visto', S.mo.vistos);
    S.busy--; sigs.v = null; pinta(); S.busy++;
    await moLanza(r.salio, r.gane ? `Salió ${r.salio}. Ganas ${N(r.premio)}` : `Salió ${r.salio}. Pierdes ${N(r.premio / 2)}`, r.gane, true);
    cargar();
  };
  A.retirarReto = async ({ id }) => {
    const r = await rpc('moneda_cancelar', { p_id: +id });
    toast(`Reto retirado: te devuelvo <b>${N(r.devuelto)}</b>`);
    await cargar(); if (ctx.refresh) ctx.refresh();
  };

  /* =====================================================================
     CRASH
     ===================================================================== */
  const K = () => (D.crash && D.crash.k) || 0.06;
  const crMult = (t) => Math.min(1000, Math.floor(Math.exp(K() * Math.max(0, t)) * 100) / 100);
  function crFase() {
    const r = D.crash && D.crash.ronda;
    if (!r) return 'idle';
    if (r.estado === 'fin') return 'fin';
    return ahora() < ms(r.arranca) ? 'apuestas' : 'curso';
  }
  const crT = () => Math.max(0, (ahora() - ms(D.crash.ronda.arranca)) / 1000);
  const crMia = () => (D.crash && D.crash.apuestas || []).find((a) => a.player === ctx.me);
  function vCrash() {
    const d = D.crash || { ronda: null, apuestas: [], historial: [] };
    const f = crFase();
    return `<section class="jg-g">
      <div class="jg-stage jg-cr">
        <div class="jg-big num" data-mult>×1,00</div>
        <p class="jg-sub" data-sub></p>
        <canvas class="jg-cv" data-cv></canvas>
        <div class="jg-hist">${d.historial.map((p) => `<span class="${p >= 10 ? 'xx' : p >= 2 ? 'hi' : 'lo'}">×${X(p)}</span>`).join('')}</div>
      </div>
      <div class="jg-side">
        ${apuesta()}
        <div class="jg-gap"><span class="lab">Retirar solo en</span><label class="jg-auto"><span>×</span><input data-auto inputmode="decimal" autocomplete="off" placeholder="sin límite" value="${esc(S.auto)}" aria-label="Retirada automática"></label></div>
        <button class="go" data-jg="crGo" data-go>Apostar</button>
        ${d.apuestas.length ? `<span class="lab jg-sec">En la ronda</span>${d.apuestas.map((a) => crFila(a, f)).join('')}` : ''}
      </div></section>`;
  }
  function crFila(a, f) {
    let est = '<em>dentro</em>';
    if (a.estado === 'cobrada') est = `<b class="num win">×${X(a.retiro)}</b><em class="win">+${N(a.pago)}</em>`;
    else if (a.estado === 'perdida') est = `<em class="lose">▼ ${N(a.stake)}</em>`;
    return fila('', av(a.player), `${esc(nom(a.player))}${a.auto ? `<em>sale en ×${X(a.auto)}</em>` : ''}`, `<b class="num ${a.estado === 'viva' ? '' : 'dim'}">${N(a.stake)}</b>`, `<span class="jg-st">${est}</span>`);
  }
  // el boton principal segun la fase: apostar / dentro / retirar con lo que cobrarias
  function crBoton() {
    const b = refs.go || (root && root.querySelector('[data-go]')); if (!b || S.juego !== 'crash' || !D.crash) return;
    const f = crFase(), mia = crMia();
    let txt = `Apostar <span data-go-n>${N(S.stake)}</span>`, dis = false, cls = 'go';
    if (f === 'apuestas' && mia) { txt = 'Dentro'; dis = true }
    else if (f === 'curso') {
      if (mia && mia.estado === 'viva') { const m = crMult(crT()); txt = `Retirar ×${X(m)} <span class="jg-pay">${N(Math.floor(mia.stake * m))}</span>`; cls = 'go jg-out' }
      else if (mia) { txt = mia.estado === 'cobrada' ? 'Retirado' : 'Perdida'; dis = true }
      else { txt = 'En marcha'; dis = true }
    }
    if (b.className !== cls) b.className = cls;
    if (b.dataset.t !== txt) { b.innerHTML = txt; b.dataset.t = txt; tr(b) }
    b.disabled = dis;
  }
  function crFrame(solo) {
    crRaf = 0;
    if (!visible() || S.juego !== 'crash' || !D.crash) return;
    const f = crFase(), r = D.crash.ronda, mia = crMia();
    let m = 1, t = 0, txt = '', cls = 'dim';
    if (f === 'apuestas') { const s = Math.max(0, Math.ceil((ms(r.arranca) - ahora()) / 1000)); txt = `Arranca en ${s} s · ${D.crash.apuestas.length} dentro` }
    else if (f === 'curso') { t = crT(); m = crMult(t); cls = m >= 10 ? 'xx' : m >= 2 ? 'hi' : 'on'; txt = mia && mia.estado === 'viva' ? 'Retira antes de que explote' : mia && mia.estado === 'cobrada' ? `Has cobrado ${N(mia.pago)}` : D.crash.apuestas.length ? 'En marcha' : '' }
    else if (f === 'fin') {
      m = Number(r.punto); t = Math.log(Math.max(1.0001, m)) / K(); cls = 'boom';
      txt = `Explotó en ×${X(m)}` + (mia ? (mia.estado === 'cobrada' ? ` · cobraste ${N(mia.pago)}` : ` · perdiste ${N(mia.stake)}`) : '');
    } else txt = 'Apuesta para abrir una ronda';
    if (refs.mult) { const v = `×${X(m)}`; if (refs.mult.textContent !== v) refs.mult.textContent = v; const c = 'jg-big num ' + cls; if (refs.mult.className !== c) refs.mult.className = c }
    setT(refs.sub, txt);
    crBoton();
    crDibuja(f, t, m);
    if (!solo && (f === 'apuestas' || f === 'curso')) crRaf = requestAnimationFrame(() => crFrame());
  }
  function crDibuja(f, t, m) {
    const cv = refs.cv; if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr) }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const padL = 6, padR = 14, padT = 14, padB = 22, k = K();
    const tmax = Math.max(10, t * 1.1), ymax = Math.max(2, m * 1.2);
    const px = (tt) => padL + (tt / tmax) * (w - padL - padR), py = (mm) => h - padB - ((mm - 1) / (ymax - 1)) * (h - padT - padB);
    const hair = 'rgba(255,255,255,.07)', mute = cssVar('--dim', '#6c737e');
    g.font = '11px JB, monospace'; g.textBaseline = 'bottom'; g.fillStyle = mute; g.strokeStyle = hair; g.lineWidth = 1;
    for (const v of [1, 2, 3, 5, 10, 20, 50, 100]) { if (v > ymax) break; const y = Math.round(py(v)) + .5; g.beginPath(); g.moveTo(padL, y); g.lineTo(w - padR, y); g.stroke(); if (v > 1) g.fillText(`×${v}`, padL, y - 3) }
    if (f === 'idle' || f === 'apuestas') return;
    const col = f === 'fin' ? cssVar('--jg-lose', '#e0646f') : cssVar('--acc', '#f2c14e');
    const n = 64; g.beginPath();
    for (let i = 0; i <= n; i++) { const tt = (t * i) / n, x = px(tt), y = py(Math.exp(k * tt)); i ? g.lineTo(x, y) : g.moveTo(x, y) }
    g.strokeStyle = col; g.lineWidth = 3; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke();
    g.lineTo(px(t), h - padB); g.lineTo(px(0), h - padB); g.closePath();
    const gr = g.createLinearGradient(0, padT, 0, h - padB); gr.addColorStop(0, col + '33'); gr.addColorStop(1, col + '00'); g.fillStyle = gr; g.fill();
    g.beginPath(); g.arc(px(t), py(Math.exp(k * t)), 5, 0, 7); g.fillStyle = col; g.fill();
  }
  // bucle de la ronda: solo mientras hay una ronda viva con la pantalla a la vista
  function crLoop() {
    cancelAnimationFrame(crRaf); clearTimeout(crPoll); crRaf = crPoll = 0;
    if (!visible() || S.juego !== 'crash' || !D.crash) return;
    const f = crFase();
    if (f === 'apuestas' || f === 'curso') crRaf = requestAnimationFrame(() => crFrame());
    if (f === 'curso') crPoll = setTimeout(crSondeo, 700);
    else if (f === 'apuestas') crPoll = setTimeout(crSondeo, Math.max(250, ms(D.crash.ronda.arranca) - ahora() + 400));
  }
  async function crSondeo() {
    crPoll = 0;
    if (!visible() || S.juego !== 'crash') return;
    try { D.crash = await rpc('crash_estado'); S.err = null } catch (e) { S.err = msgErr(e) }
    const fase = crFase();
    if (fase === 'fin' && S.cr.ultima !== D.crash.ronda.id) { S.cr.ultima = D.crash.ronda.id; if (crMia() && ctx.refresh) ctx.refresh() }
    pintaSi(); crLoop();
  }
  A.crGo = async () => {
    const f = crFase(), mia = crMia();
    if (f === 'curso' && mia && mia.estado === 'viva') {
      const r = await rpc('crash_retirar');
      if (r.ok) toast(`Retirado a <b>×${X(r.retiro)}</b> · +${N(r.pago)}`);
      else toast(`Tarde: explotó en <b>×${X(r.punto)}</b>`);
      D.crash = await rpc('crash_estado'); pintaSi(true); crLoop(); if (ctx.refresh) ctx.refresh();
      return;
    }
    if (!stakeOk()) return;
    const auto = parseFloat(String(S.auto).replace(',', '.'));
    if (S.auto && !(auto >= 1.01 && auto <= 1000)) return toast('La retirada automática va de ×1,01 a ×1000');
    await rpc('crash_apostar', { p_stake: S.stake, p_auto: auto >= 1.01 ? auto : null });
    D.crash = await rpc('crash_estado'); pintaSi(true); crLoop(); if (ctx.refresh) ctx.refresh();
  };
  A.crGo.libre = false;

  /* =====================================================================
     RULETA
     ===================================================================== */
  const colorDe = (n) => (n === 0 ? 'verde' : n <= 7 ? 'rojo' : 'negro');
  const MULT = { rojo: 2, negro: 2, verde: 14 };
  function ruFase() {
    const r = D.ruleta && D.ruleta.ronda;
    if (!r) return 'idle';
    if (r.estado === 'pagada') return 'pagada';
    if (r.estado === 'giro') return 'giro';
    return ahora() < ms(r.cierra) ? 'apuestas' : 'cerrando';
  }
  const ruRest = (n) => -ORDEN.indexOf(n) * 24;
  function ruedaSvg() {
    const R = 150, r0 = 96, c = 160, pt = (a, rad) => [(c + rad * Math.sin((a * Math.PI) / 180)).toFixed(2), (c - rad * Math.cos((a * Math.PI) / 180)).toFixed(2)];
    let g = '';
    ORDEN.forEach((n, i) => {
      const [x0, y0] = pt(i * 24 - 12, R), [x1, y1] = pt(i * 24 + 12, R), [x2, y2] = pt(i * 24 + 12, r0), [x3, y3] = pt(i * 24 - 12, r0), [tx, ty] = pt(i * 24, (R + r0) / 2 + 3);
      g += `<path class="jg-w ${colorDe(n)}" d="M${x0} ${y0}A${R} ${R} 0 0 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 0 0 ${x3} ${y3}Z"/><text class="jg-wn ${colorDe(n)}" x="${tx}" y="${ty}" transform="rotate(${i * 24} ${tx} ${ty})" text-anchor="middle" dominant-baseline="central">${n}</text>`;
    });
    return `<svg class="jg-wheel" viewBox="0 0 320 324" role="img" aria-label="Ruleta"><g data-rot>${g}</g><circle class="jg-core" cx="160" cy="160" r="88"/><polygon class="jg-ptr" points="150,0 170,0 160,20"/><text class="jg-hub" data-hub x="160" y="172" text-anchor="middle" dominant-baseline="central"></text></svg>`;
  }
  function vRuleta() {
    const d = D.ruleta || { ronda: null, apuestas: [], historial: [] };
    const f = ruFase(), r = d.ronda;
    const pool = (c) => d.apuestas.filter((a) => a.color === c);
    const fin = f === 'giro' || f === 'pagada';
    const hist = d.historial.filter((h) => !(r && h.id === r.id && S.ru.spin)).slice(0, 15);
    const sub = S.ru.msg || (f === 'idle' || f === 'pagada' ? 'Apuesta para abrir una ronda' : '');
    return `<section class="jg-g">
      <div class="jg-stage jg-ru">
        ${ruedaSvg()}
        <p class="jg-sub" data-sub>${esc(sub)}</p>
        <div class="jg-hist ru">${hist.map((h) => `<span class="${colorDe(h.n)}">${h.n}</span>`).join('')}</div>
      </div>
      <div class="jg-side">
        <span class="lab">Color</span>
        <div class="jg-cols">${['rojo', 'negro', 'verde'].map((c) => {
          const ps = pool(c), tot = ps.reduce((a, x) => a + x.stake, 0), mi = ps.some((x) => x.player === ctx.me);
          return `<button class="jg-col ${c} ${S.color === c ? 'on' : ''}" data-jg="color" data-v="${c}"><i></i><span class="jg-col-n">${c[0].toUpperCase() + c.slice(1)}<em>×${MULT[c]}</em></span><span class="jg-col-p">${[...new Set(ps.map((x) => x.player))].map((u) => av(u)).join('')}</span><span class="jg-col-t num ${mi ? 'mi' : ''}">${tot ? N(tot) : ''}</span></button>`;
        }).join('')}</div>
        <div class="jg-gap">${apuesta()}</div>
        <button class="go" data-jg="ruGo" data-go ${f === 'giro' || f === 'cerrando' ? 'disabled' : ''}>${f === 'giro' || f === 'cerrando' ? 'Girando' : `Apostar <span data-go-n>${N(S.stake)}</span> a ${S.color}`}</button>
      </div></section>`;
  }
  function ruPos() {
    if (!refs.rot) return;
    const sp = S.ru.spin;
    if (!sp) {
      const r = D.ruleta && D.ruleta.ronda;
      if (r && r.n != null && (r.estado === 'pagada' || S.ru.hecho === r.id)) S.ru.ang = ruRest(r.n);
      refs.rot.setAttribute('transform', `rotate(${S.ru.ang} 160 160)`);
    }
    ruHub();
  }
  // el centro de la rueda: la cuenta atras mientras se apuesta y el numero que ha salido
  function ruHub() {
    if (!refs.hub) return;
    const f = ruFase(), r = D.ruleta && D.ruleta.ronda;
    let t = '', c = '';
    if (f === 'apuestas') { t = String(Math.max(0, Math.ceil((ms(r.cierra) - ahora()) / 1000))); c = 'cd' }
    else if ((f === 'giro' && !S.ru.spin) || f === 'pagada') { t = String(r.n); c = colorDe(r.n) }
    else if (f === 'giro') t = '';
    if (refs.hub.textContent !== t) refs.hub.textContent = t;
    const cl = 'jg-hub ' + c; if (refs.hub.getAttribute('class') !== cl) refs.hub.setAttribute('class', cl);
  }
  function ruAplica() {
    const r = D.ruleta.ronda, f = ruFase();
    if (!r) return;
    if (f === 'giro' && S.ru.hecho !== r.id && !S.ru.spin) ruGira(r);
    else if (f === 'pagada' && S.ru.hecho !== r.id && !S.ru.spin) { S.ru.hecho = r.id; S.ru.msg = ruResultado(r) }
    if (f === 'apuestas') S.ru.msg = '';
  }
  function ruResultado(r) {
    const mias = D.ruleta.apuestas.filter((a) => a.player === ctx.me);
    const base = `Salió el ${r.n}, ${r.color}`;
    if (!mias.length) return base;
    const puso = mias.reduce((a, x) => a + x.stake, 0), cobra = mias.filter((a) => a.color === r.color).reduce((a, x) => a + x.stake * MULT[x.color], 0);
    return cobra ? `${base} · cobras ${N(cobra)}` : `${base} · pierdes ${N(puso)}`;
  }
  function ruGira(r) {
    const el = Math.max(0, (ahora() - ms(r.cierra)) / 1000);
    if (quieto() || el >= SPIN) { S.ru.hecho = r.id; S.ru.ang = ruRest(r.n); S.ru.msg = ruResultado(r); return }
    const from = S.ru.ang, rest = ruRest(r.n), extra = (((rest - from) % 360) + 360) % 360;
    S.ru.spin = { id: r.id, t0: Date.now() - el * 1000, from, to: from + 5 * 360 + extra };
    S.busy++; S.ru.msg = '';
    ruRaf = requestAnimationFrame(ruFrame);
  }
  function ruFrame() {
    ruRaf = 0;
    const sp = S.ru.spin; if (!sp) return;
    const conectado = root && root.isConnected;
    const s = Math.min(1, (Date.now() - sp.t0) / (SPIN * 1000)), e = 1 - Math.pow(1 - s, 4), ang = sp.from + (sp.to - sp.from) * e;
    if (!conectado && s < 1) { setTimeout(ruFrame, 400); return }                        // fuera de pantalla: sin animar, solo espera a que acabe el giro
    if (!refs.rot || !refs.rot.isConnected) { refs.rot = root.querySelector('[data-rot]'); refs.hub = root.querySelector('[data-hub]'); ruHub() }
    if (refs.rot) refs.rot.setAttribute('transform', `rotate(${ang.toFixed(2)} 160 160)`);
    if (s < 1) { ruRaf = requestAnimationFrame(ruFrame); return }
    S.ru.ang = sp.to % 360; S.ru.hecho = sp.id; S.ru.spin = null;
    const r = D.ruleta.ronda; S.ru.msg = ruResultado(r);
    setT(root.querySelector('[data-sub]'), S.ru.msg);
    refs.hub = root.querySelector('[data-hub]'); ruHub();
    sigs.v = null; libera();
  }
  function ruLoop() {
    clearTimeout(ruPoll); clearTimeout(ruTimer); ruPoll = ruTimer = 0;
    if (!visible() || S.juego !== 'ruleta' || !D.ruleta) return;
    const f = ruFase(), r = D.ruleta.ronda;
    if (f === 'apuestas') {
      const tick = () => { ruTimer = 0; if (!visible() || S.juego !== 'ruleta' || ruFase() !== 'apuestas') return; ruHub(); ruTimer = setTimeout(tick, 250) };
      ruTimer = setTimeout(tick, 250);
      ruPoll = setTimeout(ruSondeo, Math.max(250, ms(r.cierra) - ahora() + 350));
    } else if (f === 'cerrando') ruPoll = setTimeout(ruSondeo, 400);
    else if (f === 'giro') ruPoll = setTimeout(ruSondeo, Math.max(300, ms(r.cierra) + 7300 - ahora()));       // el pago llega a los 7 s
  }
  async function ruSondeo() {
    ruPoll = 0;
    if (!visible() || S.juego !== 'ruleta') return;
    try { D.ruleta = await rpc('ruleta_estado'); S.err = null; ruAplica() } catch (e) { S.err = msgErr(e) }
    pintaSi(); ruLoop();
    if (ruFase() === 'pagada' && ctx.refresh && !S.busy) ctx.refresh();
  }
  A.color = ({ v }) => { S.color = v; pintaSi(true) };
  A.color.libre = true;
  A.ruGo = async () => {
    if (!stakeOk()) return;
    await rpc('ruleta_apostar', { p_color: S.color, p_stake: S.stake });
    S.ru.msg = '';
    D.ruleta = await rpc('ruleta_estado'); ruAplica(); pintaSi(true); ruLoop(); if (ctx.refresh) ctx.refresh();
  };

  /* =====================================================================
     BLACKJACK
     ===================================================================== */
  const carta = (c, cls = '') => { const s = Math.floor(c / 13), r = RANK[c % 13]; return `<span class="jg-card ${s === 1 || s === 2 ? 'rd' : ''} ${cls}"><b>${r}</b><i>${SUIT[s]}</i><u>${SUIT[s]}</u></span>` };
  const dorso = () => '<span class="jg-card back"></span>';
  const bjNb = (m) => m.banca.length + (m.estado === 'curso' ? 1 : 0);
  function vBj() {
    const m = D.blackjack && D.blackjack.mano, curso = m && m.estado === 'curso';
    const gan = m && m.estado === 'fin' ? m.pago - m.apostado : 0;
    let res = '';
    if (m && m.estado === 'fin') {
      res = m.resultado === 'blackjack' ? `Blackjack · ▲ ${N(gan)}` : m.resultado === 'gana' ? `Ganas ▲ ${N(gan)}` : m.resultado === 'empate' ? 'Empate · te devuelvo la apuesta' : m.valor > 21 ? `Te pasas · ▼ ${N(m.apostado)}` : `Pierdes ▼ ${N(m.apostado)}`;
    }
    const cls = m && m.estado === 'fin' ? (m.resultado === 'gana' || m.resultado === 'blackjack' ? 'win' : m.resultado === 'empate' ? '' : 'lose') : '';
    return `<section class="jg-g">
      <div class="jg-stage jg-bj">
        <div class="jg-hl"><span class="lab">Banca</span><b class="num" data-bv>${m ? (m.valor_banca || '') : ''}</b></div>
        <div class="jg-hand" data-bj-b>${m ? m.banca.map((c) => carta(c)).join('') + (curso ? dorso() : '') : ''}</div>
        <div class="jg-hand" data-bj-j>${m ? m.jugador.map((c) => carta(c)).join('') : ''}</div>
        <div class="jg-hl"><span class="lab">Tú</span><b class="num">${m ? m.valor : ''}</b>${m && m.doblada ? '<em>doblada</em>' : ''}</div>
        <p class="jg-res ${cls}" data-bj-res>${esc(res)}</p>
      </div>
      <div class="jg-side">
        ${curso ? `<span class="lab">En juego</span><div class="jg-pot num">${N(m.apostado)}${coin()}</div>
          <button class="go" data-jg="pedir" data-id="${m.id}">Pedir</button>
          <div class="jg-two"><button class="go ghost" data-jg="plantar" data-id="${m.id}">Plantarse</button>${m.puede_doblar ? `<button class="go ghost" data-jg="doblar" data-id="${m.id}" ${S.saldo < m.stake ? 'disabled' : ''}>Doblar</button>` : ''}</div>`
        : `${apuesta()}<button class="go" data-jg="repartir" data-go>${m ? 'Otra mano' : 'Repartir'} por <span data-go-n>${N(S.stake)}</span></button>`}
        <p class="jg-rule">Blackjack paga 3 a 2. La banca se planta en 17.</p>
      </div></section>`;
  }
  // anima solo las cartas nuevas respecto a lo ya pintado de esta mano
  function bjPost() {
    const m = D.blackjack && D.blackjack.mano; if (!m) return;
    const prev = S.bj.id === m.id ? S.bj : { id: m.id, nj: 0, nb: 0, back: false };
    const js = [...root.querySelectorAll('[data-bj-j] .jg-card')], bs = [...root.querySelectorAll('[data-bj-b] .jg-card')];
    const nuevo = { init: true, id: m.id, nj: js.length, nb: bs.length, back: m.estado === 'curso' };
    const resEl = root.querySelector('[data-bj-res]'), hayAnim = (js.length > prev.nj || bs.length > prev.nb || (prev.back && m.estado === 'fin')) && !quieto();
    if (!hayAnim) { S.bj = nuevo; return }
    let d = 0;
    const entra = (el, delay) => el.animate([{ opacity: 0, transform: 'translate(70px,-80px) rotate(10deg) scale(.92)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' });
    const volteo = (el, delay) => el.animate([{ transform: 'rotateY(90deg)', opacity: .2 }, { transform: 'rotateY(0deg)', opacity: 1 }], { duration: 300, delay, easing: 'ease-out', fill: 'backwards' });
    const dealer = m.estado === 'fin' && prev.back && prev.id === m.id;           // la banca juega: da la vuelta a su carta y pide
    if (prev.nj === 0 && prev.nb === 0) {                                          // reparto: tu carta, la suya, la tuya, la suya
      for (let i = 0; i < Math.max(js.length, bs.length); i++) { if (js[i]) { entra(js[i], d); d += 260 } if (bs[i]) { entra(bs[i], d); d += 260 } }
    } else {
      for (let i = prev.nj; i < js.length; i++) { entra(js[i], d); d += 280 }
      if (dealer) {
        if (bs.length > 1) { volteo(bs[1], d); d += 420 }
        for (let i = 2; i < bs.length; i++) { entra(bs[i], d); d += 460 }
      }
    }
    if (resEl && m.estado === 'fin') resEl.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay: d + 80, fill: 'backwards' });
    // hasta que la banca acaba, el saldo de la cabecera no se mueve
    const vb = root.querySelector('[data-bv]'); if (vb && dealer) { const real = m.valor_banca; vb.textContent = ''; setTimeout(() => { const v2 = root && root.querySelector('[data-bv]'); if (v2) v2.textContent = real }, Math.max(0, d - 100)) }
    S.bj = nuevo;
    S.busy++; setTimeout(libera, d + 450);
  }
  async function bjAccion(fn, args) {
    const r = await rpc(fn, args);
    D.blackjack = { mano: r.mano, saldo: r.saldo };
    S.saldoPend = r.saldo;                                                       // el saldo se ve cuando acaban las cartas
    sigs.v = null; pinta();
    if (!S.busy) { S.saldo = S.saldoPend; S.saldoPend = null; if (ctx.refresh) ctx.refresh() }
  }
  A.repartir = async () => {
    if (!stakeOk()) return;
    S.bj = { init: true, id: null, nj: 0, nb: 0 };
    await bjAccion('bj_repartir', { p_stake: S.stake });
  };
  A.pedir = ({ id }) => bjAccion('bj_pedir', { p_id: +id });
  A.plantar = ({ id }) => bjAccion('bj_plantarse', { p_id: +id });
  A.doblar = ({ id }) => bjAccion('bj_doblar', { p_id: +id });

  /* =====================================================================
     PLINKO
     ===================================================================== */
  const peg = (r, j) => [((2 * j - r) * DX) / 2, TOP + r * DY];
  const clasM = (m) => (m < 1 ? 'lo' : m < 2 ? 'md' : m < 10 ? 'hi' : 'xx');
  function tablaPl() { return (D.plinko && D.plinko.tablas && D.plinko.tablas[S.riesgo]) || []; }
  function tableroSvg() {
    const W = 13 * DX + 24, cx = W / 2, by = TOP + FILAS * DY + 4, tb = tablaPl();
    let g = '';
    for (let r = 0; r < FILAS; r++) for (let j = 0; j <= r; j++) { const [x, y] = peg(r, j); g += `<circle class="jg-peg" cx="${(cx + x).toFixed(1)}" cy="${y}" r="2.1"/>` }
    tb.forEach((m, k) => { const x = cx + (k - 6) * DX; g += `<g class="jg-pb ${clasM(m)}" data-b="${k}"><rect x="${(x - DX / 2 + 1.5).toFixed(1)}" y="${by}" width="${DX - 3}" height="26" rx="5"/><text x="${x.toFixed(1)}" y="${by + 14}" text-anchor="middle" dominant-baseline="central">${M1(m)}</text></g>` });
    return `<svg class="jg-board" viewBox="0 0 ${W} ${by + 34}" role="img" aria-label="Plinko" data-cx="${cx}">${g}<circle class="jg-ball" data-ball r="5.5" cx="${cx}" cy="-20" visibility="hidden"/></svg>`;
  }
  function vPlinko() {
    const d = D.plinko || { recientes: [], tablas: {} };
    const tb = tablaPl(), max = tb.length ? Math.max(...tb) : 0;
    return `<section class="jg-g">
      <div class="jg-stage jg-pl">
        ${tableroSvg()}
        <p class="jg-msg ${S.pl.cls || ''}" data-msg>${esc(S.pl.msg)}</p>
      </div>
      <div class="jg-side">
        <span class="lab">Riesgo</span>
        <div class="chips">${['bajo', 'medio', 'alto'].map((k) => `<button class="chip ${S.riesgo === k ? 'on' : ''}" data-jg="riesgo" data-v="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
        <p class="jg-mx">Máximo ×${M1(max)}</p>
        <div class="jg-gap">${apuesta()}</div>
        <button class="go" data-jg="soltar" data-go>Soltar bola por <span data-go-n>${N(S.stake)}</span></button>
        ${d.recientes.length ? `<span class="lab jg-sec">Últimas bolas</span>${d.recientes.slice(0, 6).map((x) => fila('', av(x.player), `${esc(nom(x.player))}<em>${esc(x.riesgo)}</em>`, `<b class="num">×${M1(x.mult)}</b>`, `<b class="num ${x.pago >= x.stake ? 'win' : 'dim'}">${x.pago >= x.stake ? '+' + N(x.pago - x.stake) : N(x.pago)}</b>`)).join('')}` : ''}
      </div></section>`;
  }
  A.riesgo = ({ v }) => { S.riesgo = v; pintaSi(true) };
  A.riesgo.libre = true;
  A.soltar = async () => {
    if (S.busy) return;
    if (!stakeOk()) return;
    S.busy++;
    let r; try { r = await rpc('plinko_soltar', { p_stake: S.stake, p_riesgo: S.riesgo }) } catch (e) { S.busy--; throw e }
    S.pl.msg = ''; S.pl.cls = '';
    const msg = (r.pago > S.stake ? `×${M1(r.mult)} · ▲ ${N(r.pago - S.stake)}` : r.pago === S.stake ? `×${M1(r.mult)} · te devuelve lo apostado` : `×${M1(r.mult)} · ▼ ${N(S.stake - r.pago)}`);
    await plCae(r, msg, r.pago >= S.stake);
    D.plinko = await rpc('plinko_estado'); sigs.v = null; pinta();
    libera();
  };
  async function plCae(r, msg, gana) {
    const svg = root.querySelector('.jg-board'), ball = svg && svg.querySelector('[data-ball]');
    const fin = () => { S.pl.msg = msg; S.pl.cls = gana ? 'win' : 'lose'; const m2 = root && root.querySelector('[data-msg]'); if (m2) { setT(m2, msg); m2.className = 'jg-msg ' + S.pl.cls } };
    if (!ball || quieto()) { fin(); return }
    const cx = +svg.dataset.cx, cam = r.camino, pts = [[cx, TOP - 3 * DY]];
    let rights = 0;
    for (let i = 0; i < FILAS; i++) { pts.push([cx + ((2 * rights - i) * DX) / 2, TOP + i * DY - 7]); rights += cam[i] }
    pts.push([cx + (rights - 6) * DX, TOP + FILAS * DY + 17]);
    const SEG = 150, T0 = 230, total = T0 + (pts.length - 2) * SEG, t0 = performance.now();
    ball.setAttribute('visibility', 'visible');
    await new Promise((ok) => {
      const paso = (now) => {
        const t = now - t0;
        if (!svg.isConnected) { ok(); return }
        let x, y;
        if (t < T0) { const s = t / T0; x = pts[0][0] + (pts[1][0] - pts[0][0]) * s; y = pts[0][1] + (pts[1][1] - pts[0][1]) * s * s }
        else {
          const i = Math.min(pts.length - 2, Math.floor((t - T0) / SEG)) + 1, s = Math.min(1, (t - T0 - (i - 1) * SEG) / SEG), [xa, ya] = pts[i], [xb, yb] = pts[Math.min(pts.length - 1, i + 1)];
          x = xa + (xb - xa) * s; y = ya + (yb - ya) * s - 6 * 4 * s * (1 - s);
        }
        ball.setAttribute('cx', x.toFixed(1)); ball.setAttribute('cy', y.toFixed(1));
        if (t < total) requestAnimationFrame(paso); else ok();
      };
      requestAnimationFrame(paso);
    });
    const bk = svg.querySelector(`[data-b="${r.k}"]`);
    if (bk) { bk.classList.add("pega"); setTimeout(() => bk.classList.remove("pega"), 1400) }
    ball.setAttribute('visibility', 'hidden');
    fin();
  }

  /* ---------- la app llama a esto ---------- */
  window.GM_JUEGOS = {
    html: () => '<div data-juegos></div>',
    // el: la vista de la app (o el hueco [data-juegos]); c: { db, me, meKey, jugadores, saldo, av, toast, refresh }; nueva: se acaba de entrar en la pantalla
    montar(el, c, nueva) {
      ctx = c;
      if (!root) crea();
      const hueco = el && (el.matches && el.matches('[data-juegos]') ? el : el.querySelector('[data-juegos]'));
      if (hueco) hueco.replaceWith(root); else if (el && !root.isConnected) el.appendChild(root);
      if (!S.busy) S.saldo = c.saldo;
      root.querySelectorAll('[data-saldo]').forEach((e) => (e.textContent = N(S.saldo)));
      if (nueva) { root.classList.remove('jg-in'); void root.offsetWidth; root.classList.add('jg-in'); setTimeout(() => root.classList.remove('jg-in'), 600) }
      if (!root.firstChild) pinta();
      if (nueva || !D[S.juego] || Date.now() - ultima > 1200) cargar(); else { post(); reanuda() }
    },
    // true mientras una animacion esconde un resultado: la app no debe repintar el saldo todavia (llamara a refresh() sola al acabar)
    ocupado: () => S.busy > 0,
    estado: () => ({ juego: S.juego, ocupado: S.busy > 0 }),
  };
})();
