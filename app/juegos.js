// Juegos de Gambling Master: cara o cruz, crash, ruleta, blackjack y plinko, con V-Bucks.
// El azar, las cartas, el punto de explosion y el dinero los pone la base (db/010_juegos.sql): aqui solo se pide
// ("apuesto esto", "retiro ya", "pido carta") y se pinta lo que devuelve. Nada de esto se decide en el navegador.
// La app lo monta asi (ver JUEGOS-INTEGRAR.md): R.juegos = () => GM_JUEGOS.html(ctx) y, justo despues de pintar,
// GM_JUEGOS.montar(vista, ctx). El nodo de la pantalla es siempre el mismo, asi que aunque la app repinte (cada minuto
// o cuando alguien mueve dinero) las animaciones siguen. Sin bucles de fondo: los temporizadores y requestAnimationFrame
// solo corren mientras hay una ronda o una animacion y la pantalla esta a la vista.
'use strict';
(function () {
  const JUEGOS = [['moneda', 'Cara o cruz'], ['crash', 'Crash'], ['blackjack', 'Blackjack']];   // PM, 30-10: ruleta y plinko fuera (su codigo sigue aqui, sin pestana)
  const CON_RANKING = ['moneda', 'crash', 'blackjack'];                                   // juegos con ranking (db/017b)
  const FN = { moneda: 'moneda_estado', crash: 'crash_estado', ruleta: 'ruleta_estado', blackjack: 'bj_estado', plinko: 'plinko_estado' };
  const SUIT = ['♠', '♥', '♦', '♣'], RANK = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const ORDEN = [0, 8, 1, 9, 2, 10, 3, 11, 4, 12, 5, 13, 6, 14, 7];       // casillas de la ruleta, en el sentido del reloj desde arriba
  const SPIN = 6;                                                          // segundos de giro (la base paga a los 7)
  const DX = 26, DY = 24, TOP = 26, FILAS = 12;                            // geometria del plinko

  /* ---------- estado ---------- */
  let ctx = null, root = null;
  const S = {
    juego: (() => { const j = lee('jg-juego'); return JUEGOS.some((x) => x[0] === j) ? j : 'crash' })(), stake: Math.max(1, parseInt(lee('jg-stake'), 10) || 100), saldo: 0,
    lado: 'cara', para: null, riesgo: 'medio', color: 'rojo', auto: '', busy: 0, err: null, ocupa: false, rk: { modo: lee('jg-rk-m') === 'mayor' ? 'mayor' : 'neto', periodo: lee('jg-rk-p') === 'semana' ? 'semana' : 'siempre', riv: null, sig: '', n: 0, recarga: false, d: {} }, aviso: '', pd: 0, bjRest: null,
    mo: { vistos: parseInt(lee('jg-mo-visto'), 10) || null, lado: 'cara', msg: '' },
    cr: { ultima: null },
    ru: { ang: 0, spin: null, hecho: null, msg: '' },
    bj: { init: false, id: null, nj: 0, nb: 0 },
    pl: { msg: '', ball: null },
  };
  const D = { moneda: null, crash: null, ruleta: null, blackjack: null, plinko: null, res: null };
  const T = { off: 0 };
  let ultima = 0, cargaId = 0, pend = false, refs = {}, sigs = {};
  let tCarga = 0, crRaf = 0, crPoll = 0, ruRaf = 0, ruPoll = 0, ruTimer = 0;

  /* ---------- utilidades ---------- */
  function lee(k) { try { return localStorage.getItem(k) } catch { return null } }
  function guarda(k, v) { try { localStorage.setItem(k, String(v)) } catch {} }
  const N = (x) => String(Math.round(x || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, document.documentElement.lang === 'en' ? ',' : '.');
  const X = (m) => { const t = Number(m).toFixed(2); return window.GM_LANG && GM_LANG.get && GM_LANG.get() === 'en' ? t : t.replace('.', ',') };   // en ingles, decimales con punto
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
  const av = (u, cls = 'sm') => (ctx && ctx.av ? String(ctx.av(jug(u).id, cls)).replace(/ data-prof="[^"]*"/, '') : `<span class="av ${esc(jug(u).color)} ${cls}">${esc(String(jug(u).n || '·')[0])}</span>`);
  const nom = (u) => (u === (ctx && ctx.me) ? 'Tú' : jug(u).n);
  const cssVar = (n, d) => { try { return getComputedStyle(root).getPropertyValue(n).trim() || d } catch { return d } };
  const msgErr = (e) => {
    const m = (e && (e.message || e.error_description)) || 'Algo ha fallado';
    const c = m + ((e && e.code) || '');
    if (/Could not find the function|PGRST202|schema cache/i.test(c)) return 'Los juegos aún no están en la base: falta cargar db/010_juegos.sql';
    if (/permission denied|42501/i.test(c)) return 'Este juego está cerrado ahora mismo';
    return m;
  };
  // el error se ve en el aviso y en un toast; el aviso se queda hasta la siguiente jugada
  const falla = (e) => { const m = msgErr(e); S.aviso = m; toast(esc(m)); setT(root && root.querySelector('[data-aviso]'), m) };
  const aviso = () => `<p class="jg-aviso" data-aviso>${esc(S.aviso)}</p>`;
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
      const [d, res, rest, rank] = await Promise.all([rpc(FN[j]), rpc('jg_resumen'), j === 'blackjack' ? bjLimite() : null, CON_RANKING.includes(j) ? rpc('jg_ranking', { p_juego: j, p_periodo: S.rk.periodo }).catch(() => null) : null]);
      if (n !== cargaId) return;
      D[j] = d; D.res = res; S.err = null;
      if (j === 'blackjack') { if (S.busy) S.bjRestPend = rest; else S.bjRest = rest }
      if (CON_RANKING.includes(j) && !S.busy) S.rk.d[j] = rank || S.rk.d[j] || null;                          // el ranking enseña resultados: no se toca mientras una animacion los esconde
      aplica(j);
    } catch (e) { if (n !== cargaId) return; S.err = msgErr(e) }
    pintaSi();
    if (!S.busy) pintaRank();
  }
  // solo repinta si lo que se ve ha cambiado
  function pintaSi(fuerza) {
    const s = firma();
    if (!fuerza && s === sigs.v) { post(); return }
    sigs.v = s; pinta();
  }
  function firma() {
    const d = D[S.juego] || {}, r = D.res || {};
    const base = [S.juego, S.err, r.crash && r.crash.id, r.ruleta && r.ruleta.estado, r.moneda, r.bj, S.bjRest, S.lado, S.para, S.riesgo, S.color, S.mo.lado, S.mo.msg, S.ru.msg, S.pl.msg];
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
      if (!S.bjClamp && S.bjRest != null) { S.bjClamp = true; if (S.bjRest > 0 && S.stake > S.bjRest) S.stake = S.bjRest }
    }
  }

  /* ---------- armazon ---------- */
  function crea() {
    root = document.createElement('div');
    root.className = 'jg';
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    // La app repinta la pantalla (cada minuto y con cada pulso) y al hacerlo descuelga y vuelve a colgar este nodo: si eso pasa entre
    // pulsar y soltar, el navegador pierde el "clic". Por eso los botones se activan con pulsar+soltar sobre el mismo boton (comparado por
    // su clave, no por el nodo) y el clic nativo, que solo queda para el teclado, se ignora justo despues. Retirar del crash actua al pulsar.
    root.addEventListener('pointerdown', (e) => {
      if ((e.button || 0) !== 0) return;
      const b = e.target.closest && e.target.closest('[data-jg]');
      if (!b || b.disabled) { S.dn = null; return }
      if (b.dataset.jg === 'crGo' && b.classList.contains('jg-out')) { S.dn = null; S.pd = Date.now(); onClick({ type: 'pointerdown', target: b }); return }
      S.dn = { k: llave(b), t: Date.now() };
    });
    root.addEventListener('pointerup', (e) => {
      const d = S.dn; S.dn = null;
      if (!d || Date.now() - d.t > 4000) return;
      const b = e.target.closest && e.target.closest('[data-jg]');
      if (!b || b.disabled || llave(b) !== d.k) return;
      S.pd = Date.now(); onClick({ type: 'pointerup', target: b });
    });
    root.addEventListener('pointercancel', () => { S.dn = null });
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
    if (S.bjRestPend !== undefined) { S.bjRest = S.bjRestPend; S.bjRestPend = undefined; pend = true }
    if (pend) pinta();
    if (S.rk.recarga) { S.rk.recarga = false; cargaRank() }
    root && root.querySelectorAll('[data-saldo]').forEach((e) => (e.textContent = N(S.saldo)));
    if (ctx.refresh) ctx.refresh();
  }
  function tabs() {
    const r = D.res || {};
    const pt = { crash: !!r.crash, ruleta: !!r.ruleta, blackjack: !!r.bj };
    return JUEGOS.map(([k, n]) => `<button class="jg-tab ${S.juego === k ? 'on' : ''}" data-jg="tab" data-v="${k}">${n}${k === 'moneda' ? `<b class="${r.moneda > 0 ? '' : 'off'}">${r.moneda || 0}</b>` : `<i class="${pt[k] ? '' : 'off'}"></i>`}</button>`).join('');
  }
  function vista() {
    const hs = stripHtml(), hd = duelHtml();
    S.rk.sig = hs + hd;
    return hs + { moneda: vMoneda, crash: vCrash, ruleta: vRuleta, blackjack: vBj, plinko: vPlinko }[S.juego]().replace(/<\/section>\s*$/, () => hd + '</section>');
  }
  function post() {
    if (!root) return;
    refs = {
      mult: root.querySelector('[data-mult]'), sub: root.querySelector('[data-sub]'), cv: root.querySelector('[data-cv]'), go: root.querySelector('[data-go]'), cd: root.querySelector('[data-cd]'),
      coin: root.querySelector('[data-coin]'), rot: root.querySelector('[data-rot]'), hub: root.querySelector('[data-hub]'), ball: root.querySelector('[data-ball]'),
    };
    root.querySelectorAll('[data-saldo]').forEach((e) => (e.textContent = N(S.saldo)));
    if (S.juego === 'moneda' && refs.coin) refs.coin.style.transform = moPose(S.mo.lado === 'cara' ? 0 : 180);
    if (S.juego === 'crash') { crFilasFx(); crFrame(true); crLoop() }
    if (S.juego === 'ruleta') { ruPos(); ruLoop() }
    if (S.juego === 'blackjack') bjPost();
  }
  function paraLoops() { cancelAnimationFrame(crRaf); clearTimeout(crPoll); cancelAnimationFrame(ruRaf); clearTimeout(ruPoll); clearTimeout(ruTimer); crRaf = crPoll = ruRaf = ruPoll = ruTimer = 0 }
  function reanuda() { if (S.juego === 'crash') crLoop(); if (S.juego === 'ruleta') ruLoop() }

  /* ---------- ranking (modelo F "Tira y duelo", PM 01-11): una tira de caras con su cifra ENCIMA del juego y, a la derecha (en movil debajo),
     "Tu posicion" y el duelo contra el rival que se elige tocando su cara. La base lo da ya agregado (db/017b). Se repinta SOLO esta parte
     (pintaRank), nunca el juego: asi la tira no parpadea, el juego no salta y una animacion en curso no se toca. ---------- */
  function rkFilas() {
    const j = S.juego, rk0 = S.rk.d[j];
    if (!Array.isArray(rk0)) return null;
    const crash = j === 'crash', mayor = S.rk.modo === 'mayor';
    const val = (x) => (mayor ? (crash ? x.mejor : x.mayor) : x.neto) || 0;
    // "Mas ganado": ganancia neta. "Mayor ×" (crash) o "Mayor premio": la mejor jugada suelta; quien no ha ganado nada no sale
    const l = rk0.map((x) => ({ ...x, v: val(x) })).filter((x) => !mayor || x.v > 0).sort((a, b) => b.v - a.v);
    l.forEach((x, i) => { x.rank = i + 1 });
    return l;
  }
  const rkRival = (l, me) => {
    if (!me || l.length < 2) return null;
    const pick = S.rk.riv && l.find((x) => x.player === S.rk.riv && x.player !== me.player);
    return pick || (me.rank > 1 ? l[me.rank - 2] : l[1]);
  };
  const ord = (n) => (document.documentElement.lang === 'en' ? n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] || 'th')) : n + 'º');
  const rkOn = () => CON_RANKING.includes(S.juego) && S.rk.d[S.juego] !== null;
  function rkVal(x, crash, mayor) {
    if (mayor) return crash ? `<b class="num jg-hi">×${X(x.v)}</b>` : `<b class="num win">▲ ${N(x.v)}${coin()}</b>`;
    return x.v >= 0 ? `<b class="num win">▲ ${N(x.v)}${coin()}</b>` : `<b class="num lose">▼ ${N(-x.v)}${coin()}</b>`;
  }
  function stripHtml() {
    if (!rkOn()) return '';
    const j = S.juego, crash = j === 'crash', mayor = S.rk.modo === 'mayor', l = rkFilas();
    const seg = (ev, act, o) => `<div class="jg-seg">${o.map(([v, t]) => `<button class="${act === v ? 'on' : ''}" data-jg="${ev}" data-v="${v}">${t}</button>`).join('')}</div>`;
    const nombreJ = (JUEGOS.find((x) => x[0] === j) || [0, ''])[1];
    const ctl = `<div class="jg-ctl"><span class="lab">Ranking · <span>${nombreJ}</span></span>${seg('rkM', S.rk.modo, [['neto', 'Más ganado'], ['mayor', crash ? 'Mayor ×' : 'Mayor premio']])}${seg('rkP', S.rk.periodo, [['siempre', 'De siempre'], ['semana', 'Esta semana']])}</div>`;
    let ppl = '';
    if (l) {
      const me = l.find((x) => x.player === ctx.me), rv = rkRival(l, me);
      ppl = l.length ? l.map((x) => `<button class="jg-pe ${x.player === ctx.me ? 'me' : ''} ${rv && rv.player === x.player ? 'sel' : ''}" data-jg="rkR" data-v="${esc(x.player)}"><span class="jg-avw">${av(x.player, 'xl')}<span class="jg-rkn num">${x.rank}</span></span><span class="jg-nm">${esc(nom(x.player))}</span><span class="jg-vl">${rkVal(x, crash, mayor)}</span></button>`).join('')
        : `<p class="jg-rk-v">${mayor ? 'Todavía no ha ganado nadie' : 'Todavía no ha jugado nadie'}</p>`;
    }
    return `<section class="jg-strip">${ctl}<div class="jg-ppl">${ppl}</div></section>`;
  }
  function duelHtml() {
    if (!rkOn()) return '';
    const j = S.juego, rk0 = S.rk.d[j], crash = j === 'crash', mayor = S.rk.modo === 'mayor', l = rkFilas();
    if (!l) return '<aside class="jg-rk"></aside>';
    const me = l.find((x) => x.player === ctx.me), rv = rkRival(l, me);
    const sinJugar = ctx.jugadores.filter((p) => p.uuid !== ctx.me && !rk0.some((x) => x.player === p.uuid)).map((p) => esc(p.n));
    const nota = sinJugar.length ? `<p class="jg-note">Sin jugar · ${sinJugar.join(' · ')}</p>` : '';
    if (!me) {
      const jugo = rk0.some((x) => x.player === ctx.me);
      return `<aside class="jg-rk"><div class="jg-pos"><span class="lab">Tu posición</span><p class="jg-pl0">${jugo ? 'Todavía no has ganado ningún premio' : 'Todavía no has jugado'}</p></div>${nota}</aside>`;
    }
    const dtxt = (v) => (mayor && crash ? '×' + X(v) : N(v) + coin());
    const nxt = l[me.rank - 2], prv = l[me.rank];
    const linea = (nxt ? `<span>Delante</span> <b>${esc(nom(nxt.player))}</b> <span class="num">a&nbsp;${dtxt(nxt.v - me.v)}</span>` : '')
      + (prv ? `${nxt ? ' <i>·</i> ' : ''}<span>${nxt ? 'detrás' : 'Detrás'}</span> <b>${esc(nom(prv.player))}</b> <span class="num">a&nbsp;${dtxt(me.v - prv.v)}</span>` : '');
    let duelo = '';
    if (rv) {
      const col = (x) => `var(--f-${jug(x.player).color})`;
      const stats = [['Más ganado', (x) => x.neto || 0, (v) => (v >= 0 ? '▲ ' : '▼ ') + N(Math.abs(v)), true]];
      if (crash) stats.push(['Mayor ×', (x) => x.mejor || 0, (v) => (v > 0 ? '×' + X(v) : '0'), false]);
      stats.push(['Mayor premio', (x) => x.mayor || 0, (v) => (v > 0 ? N(v) : '0'), false]);
      const filas = stats.map(([t, f, fm, neg]) => {
        const a = f(me), b = f(rv), mx = Math.max(Math.abs(a), Math.abs(b), 1), gana = a >= b;
        const cl = (v) => (neg ? (v >= 0 ? 'win' : 'lose') : '');
        return `<div class="jg-rd"><span class="lab">${t}</span>
          <div class="jg-bars"><div class="${gana ? 'w' : ''}"><i style="width:${Math.max(2, Math.abs(a) / mx * 100)}%;background:${col(me)}"></i></div><div class="${!gana ? 'w' : ''}"><i style="width:${Math.max(2, Math.abs(b) / mx * 100)}%;background:${col(rv)}"></i></div></div>
          <div class="jg-nu num"><b class="${cl(a)}">${fm(a)}</b><b class="${cl(b)}">${fm(b)}</b></div></div>`;
      }).join('');
      const d = Math.abs(rv.v - me.v), ahead = rv.rank < me.rank, rn = esc(nom(rv.player));
      const veredicto = d === 0 ? '<span>Vais igualados</span>' : ahead ? `<span>${rn} te saca</span> <b>${dtxt(d)}</b><span>. Te falta eso para pasarle.</span>` : `<span>Vas por delante de ${rn} por</span> <b>${dtxt(d)}.</b>`;
      duelo = `<div class="jg-vs"><div class="jg-sd me">${av(me.player, 'xl')}<b>${esc(nom(me.player))}</b></div><span class="jg-mid2">VS</span><div class="jg-sd">${av(rv.player, 'xl')}<b>${rn}</b></div></div>${filas}<p class="jg-vd">${veredicto}</p>`;
    }
    return `<aside class="jg-rk"><div class="jg-pos"><span class="lab">Tu posición</span><div class="jg-ps"><em>${ord(me.rank)}</em> <span>de ${l.length}</span></div><p class="jg-lin">${linea}</p></div>${duelo}${nota}</aside>`;
  }
  // repinta solo la tira y el duelo (no el juego), y solo si han cambiado; la tira conserva su desplazamiento lateral
  function pintaRank() {
    if (!root || !ctx) return;
    const s = root.querySelector('.jg-strip'), d = root.querySelector('.jg-rk');
    const hs = stripHtml(), hd = duelHtml(), sig = hs + hd;
    if (sig === S.rk.sig) return;
    S.rk.sig = sig;
    const mk = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstElementChild };
    if (s && hs) {
      const x = (s.querySelector('.jg-ppl') || {}).scrollLeft || 0, e = mk(hs);
      s.replaceWith(e); tr(e);
      const n = e.querySelector('.jg-ppl'); if (n && x) n.scrollLeft = x;
    }
    if (d && hd) { const e = mk(hd), y = d.scrollTop; d.replaceWith(e); tr(e); e.scrollTop = y }
  }
  async function cargaRank() {
    const j = S.juego; if (!CON_RANKING.includes(j)) return;
    if (S.busy) { S.rk.recarga = true; return }                                           // mientras una animacion esconde el resultado no se pide
    const n = ++S.rk.n;
    let r = null; try { r = await rpc('jg_ranking', { p_juego: j, p_periodo: S.rk.periodo }) } catch {}
    if (n !== S.rk.n || j !== S.juego) return;
    if (S.busy) { S.rk.recarga = true; return }
    S.rk.d[j] = r || S.rk.d[j] || null;
    pintaRank();
  }

  /* ---------- eventos ---------- */
  const A = {};
  const llave = (b) => `${b.dataset.jg}|${b.dataset.v || ''}|${b.dataset.id || ''}`;
  async function onClick(e) {
    const b = e.target.closest('[data-jg]');
    if (!b || !root.contains(b) || b.disabled) return;
    const a = A[b.dataset.jg];
    if (!a) return;
    if (e.type === 'click' && S.pd && Date.now() - S.pd < 900) { S.pd = 0; return }      // ya se hizo al pulsar y soltar
    if (S.ocupa && !a.libre) return;
    if (!a.libre) { S.ocupa = true; S.aviso = ''; setT(root.querySelector('[data-aviso]'), '') }
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
  A.rkP = ({ v }) => { S.rk.periodo = v === 'semana' ? 'semana' : 'siempre'; guarda('jg-rk-p', S.rk.periodo); pintaRank(); cargaRank() };
  A.rkP.libre = true;
  A.rkM = ({ v }) => { S.rk.modo = v === 'mayor' ? 'mayor' : 'neto'; guarda('jg-rk-m', S.rk.modo); pintaRank() };
  A.rkM.libre = true;
  A.rkR = ({ v }) => { if (!v || v === ctx.me) return; S.rk.riv = v; pintaRank() };
  A.rkR.libre = true;
  A.q = ({ v }) => {
    let sal = Math.max(0, S.saldo || ctx.saldo || 0);
    if (S.juego === 'blackjack' && S.bjRest != null) sal = Math.min(sal, Math.max(0, S.bjRest));
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
    if (!(S.stake >= 1)) { falla({ message: 'Pon una cantidad' }); return false }
    if (S.stake > queda()) { falla({ message: `No tienes tanto: te quedan ${N(queda())}` }); return false }
    if (S.juego === 'blackjack' && S.bjRest != null) {
      if (S.bjRest <= 0) { falla({ message: 'Hoy ya has perdido 500 en el blackjack. Vuelve mañana' }); return false }
      if (S.stake > S.bjRest) { falla({ message: `Hoy solo puedes arriesgar ${N(S.bjRest)} más en el blackjack` }); return false }
    }
    return true;
  }
  // lo que queda por arriesgar hoy en el blackjack (la base deja perder 500 al dia desde db/027, hora de Madrid): 500 mas lo neto de hoy
  function madridInicio() {
    const t = Date.now(), h = (z) => new Date(new Date(t).toLocaleString('en-US', { timeZone: z })), off = h('Europe/Madrid') - h('UTC'), m = new Date(t + off);
    return Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), m.getUTCDate()) - off;
  }
  async function bjLimite() {
    try {
      if (!ctx.db.from) return null;
      const { data, error } = await ctx.db.from('ledger').select('amount').eq('kind', 'blackjack').gte('created_at', new Date(madridInicio()).toISOString());
      return error || !data ? null : 100 + data.reduce((a, x) => a + x.amount, 0);
    } catch { return null }
  }
  function bjLim() {
    const r = S.bjRest;
    if (r == null) return '';
    return r <= 0 ? '<p class="jg-lim lose">Hoy ya has perdido 500. Vuelve mañana</p>' : `<p class="jg-lim">Hoy te quedan <b class="num">${N(r)}</b> por arriesgar</p>`;
  }
  function apuesta() {
    const bj = S.juego === 'blackjack', chips = bj ? [5, 10, 25, 50] : [100, 500, 1000];
    return `<div class="jg-stake"><div class="jg-lab"><span class="lab">Apuesta</span><span class="jg-sal"><span class="num" data-saldo>${N(S.saldo)}</span>${coin()}</span></div>
      <label class="jg-amt"><input data-in inputmode="numeric" autocomplete="off" value="${N(S.stake)}" aria-label="Apuesta">${coin()}</label>
      <div class="jg-q">${chips.map((c) => `<button data-jg="q" data-v="${c}">${N(c)}</button>`).join('')}<button data-jg="q" data-v="mitad">1/2</button><button data-jg="q" data-v="doble">×2</button><button data-jg="q" data-v="todo" data-q-todo>${bj ? 'Máx' : 'Todo'}</button></div>${bj ? bjLim() : ''}</div>`;
  }
  const fila = (cuando, a, b, c, d, attrs) => `<div class="jg-r ${cuando || ''}" ${attrs || ''}>${a}<span class="jg-r-n">${b}</span>${c || ''}${d || ''}</div>`;

  /* =====================================================================
     CARA O CRUZ
     ===================================================================== */
  // moneda con grosor: un canto de capas de oro entre la cara (corona) y la cruz (V-Buck)
  function carasHtml() {
    let canto = '';
    for (let i = 0; i < 15; i++) canto += `<i style="transform:translateZ(${(i - 7) * 1.6}px)"></i>`;
    return `${canto}<div class="jg-face cara"><img src="img/moneda-corona.webp" alt="Cara" draggable="false"></div><div class="jg-face cruz"><span class="jg-aro"></span><img src="img/vbucks.webp" alt="Cruz" draggable="false"></div>`;
  }
  // postura de la moneda en reposo (ligeramente de lado para que se vea el canto) y en cada instante del lanzamiento
  const moPose = (rx, o = {}) => `translateY(${o.y || 0}px) scale(${o.s || 1}) rotateZ(${o.z || 0}deg) rotateY(${o.ry == null ? -20 : o.ry}deg) rotateX(${rx}deg)`;
  function vMoneda() {
    const d = D.moneda || { abiertos: [], recientes: [] };
    const otros = ctx.jugadores.filter((j) => j.uuid !== ctx.me);
    const mios = d.abiertos.filter((a) => a.creador === ctx.me), ajenos = d.abiertos.filter((a) => a.creador !== ctx.me);
    const quien = `<button class="jg-who ${S.para == null ? 'on' : ''}" data-jg="para" data-v=""><span class="jg-any">?</span><em>Cualquiera</em></button>` +
      otros.map((j) => `<button class="jg-who ${S.para === j.uuid ? 'on' : ''}" data-jg="para" data-v="${esc(j.uuid)}">${av(j.uuid, 'xl')}<em>${esc(j.n)}</em></button>`).join('');
    return `<section class="jg-g">
      <div class="jg-stage jg-mo">
        <div class="jg-coin-w"><div class="jg-sh" data-sh></div><div class="jg-coin" data-coin>${carasHtml()}</div></div>
        <p class="jg-msg ${S.mo.cls || ''}" data-msg>${esc(S.mo.msg)}</p>
        <div class="jg-mo-l"><div class="jg-mo-a">${ajenos.length ? `<span class="lab jg-sec">Abiertos</span>${ajenos.slice(0, 3).map((a) => fila('', av(a.creador), `${esc(nom(a.creador))}<em>${a.para ? 'te reta, ' : ''}va a ${esc(a.lado)}</em>`, `<b class="num">${N(a.stake)}</b>`, `<button class="jg-b" data-jg="aceptar" data-id="${a.id}">Aceptar</button>`)).join('')}` : ''}${mios.length ? `<span class="lab jg-sec">Tus retos</span>${mios.slice(0, 3).map((a) => fila('', av(a.creador), `${a.para ? esc(nom(a.para)) : 'Cualquiera'}<em>${esc(a.lado)}</em>`, `<b class="num">${N(a.stake)}</b>`, `<button class="jg-b" data-jg="retirarReto" data-id="${a.id}">Retirar</button>`)).join('')}` : ''}</div><div class="jg-mo-b">${d.recientes.length ? `<span class="lab jg-sec">Últimos</span>${d.recientes.slice(0, 4).map((a) => { const perd = a.ganador === a.creador ? a.rival : a.creador; return fila('', av(a.ganador), `${esc(nom(a.ganador))}<em>le gana${a.ganador === ctx.me ? 's' : ''} a ${esc(perd === ctx.me ? 'ti' : nom(perd))} · ${esc(a.salio)}</em>`, `<b class="num win">+${N(a.stake)}</b>`) }).join('')}` : ''}</div></div>
      </div>
      <div class="jg-side">
        <span class="lab">Contra</span><div class="jg-whos">${quien}</div>
        <span class="lab jg-gap">Tu lado</span>
        <div class="chips"><button class="chip ${S.lado === 'cara' ? 'on' : ''}" data-jg="lado" data-v="cara">Cara</button><button class="chip ${S.lado === 'cruz' ? 'on' : ''}" data-jg="lado" data-v="cruz">Cruz</button></div>
        <div class="jg-gap">${apuesta()}</div>
        <button class="go" data-jg="retar" data-go>Retar por <span data-go-n>${N(S.stake)}</span></button>${aviso()}
      </div></section>`;
  }
  // yaBusy: quien llama ya ha sumado un "ocupado" antes de pedir el resultado (asi el saldo no se mueve antes de tiempo)
  async function moLanza(salio, msg, gane, yaBusy) {
    S.mo.msg = '';
    if (S.juego !== 'moneda' || !refs.coin || quieto()) { S.mo.lado = salio; S.mo.msg = msg; S.mo.cls = gane ? 'win' : 'lose'; if (yaBusy) libera(); return }
    if (!yaBusy) S.busy++;
    const c = refs.coin, fin = salio === 'cara' ? 0 : 180, st = S.mo.lado === 'cara' ? 0 : 180, fe = st + 360 * 6 + (st === fin ? 0 : 180), sh = root.querySelector('[data-sh]');
    const msgEl = root.querySelector('[data-msg]'); if (msgEl) { setT(msgEl, ''); msgEl.className = 'jg-msg' }
    let a, b;
    try {
      a = c.animate([
        { transform: moPose(st), easing: 'cubic-bezier(.15,.65,.35,1)' },
        { transform: moPose(st + (fe - st) * 0.55, { y: -160, s: 1.2, z: 12, ry: -6 }), offset: 0.46, easing: 'cubic-bezier(.55,0,.9,.55)' },
        { transform: moPose(fe - 10, { y: 0, s: 1, z: -2 }), offset: 0.8, easing: 'cubic-bezier(.2,.7,.3,1)' },
        { transform: moPose(fe + 4, { y: -22, s: 1.02, z: 1 }), offset: 0.89, easing: 'cubic-bezier(.5,0,.9,.6)' },
        { transform: moPose(fe) },
      ], { duration: 2300, fill: 'forwards' });
      if (sh) b = sh.animate([{ transform: 'scale(1)', opacity: 0.7 }, { transform: 'scale(.5)', opacity: 0.25, offset: 0.46 }, { transform: 'scale(1)', opacity: 0.7, offset: 0.8 }, { transform: 'scale(.9)', opacity: 0.6, offset: 0.89 }, { transform: 'scale(1)', opacity: 0.7 }], { duration: 2300 });
      await a.finished;
    } catch {}
    S.mo.lado = salio; S.mo.msg = msg; S.mo.cls = gane ? 'win' : 'lose';
    c.style.transform = moPose(fin); try { a && a.cancel(); b && b.cancel() } catch {}
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
  // m(t) = p(t) * f(t): la curva de siempre por el factor de los retrocesos falsos de la ronda. MISMA formula que crash_f / crash_m de db/023.
  const crRetro = () => (D.crash && D.crash.ronda && D.crash.ronda.retro) || [];
  function crF(t, retro) {
    for (const e of retro) {
      const u = t - e.t0;
      if (u <= 0 || u >= e.td + e.tr) continue;
      if (u < e.td) { const x = u / e.td; return 1 - (1 - e.d) * (x * x * (3 - 2 * x)) }
      const x = (u - e.td) / e.tr;
      return e.d + (1 - e.d) * (x * x * (3 - 2 * x));
    }
    return 1;
  }
  const crMr = (t) => Math.exp(0.06 * Math.max(t, 0)) * crF(t, crRetro());
  const crMult = (t) => Math.min(1000, Math.floor(crMr(t) * 100) / 100);
  const ROJO = [224, 100, 111];
  function crFase() {
    const r = D.crash && D.crash.ronda;
    if (!r) return 'idle';
    if (r.estado === 'fin') return 'fin';
    return ahora() < ms(r.arranca) ? 'apuestas' : 'curso';
  }
  const crT = () => Math.max(0, (ahora() - ms(D.crash.ronda.arranca)) / 1000);
  const clsP = (p) => (p >= 10 ? 'xx' : p >= 5 ? 'hi' : p >= 2 ? 'md' : 'lo');
  const crMia = () => (D.crash && D.crash.apuestas || []).find((a) => a.player === ctx.me);
  function vCrash() {
    const d = D.crash || { ronda: null, apuestas: [], historial: [] };
    const f = crFase();
    return `<section class="jg-g">
      <div class="jg-stage jg-cr" data-cr>
        <div class="jg-big num" data-mult>×1,00</div>
        <p class="jg-sub" data-sub></p>
        <div class="jg-cvw"><canvas class="jg-cv" data-cv></canvas><div class="jg-cd" data-cd hidden><svg viewBox="0 0 220 220" aria-hidden="true"><circle class="t" cx="110" cy="110" r="96"/><circle class="p" data-cdp cx="110" cy="110" r="96"/></svg><div class="jg-cdn"><b data-cdn>10</b><small>segundos</small></div></div></div>
        <div class="jg-hist">${(d.rondas ? d.rondas.map((x) => x.punto) : d.historial).map((p) => `<span class="${clsP(p)}">×${X(p)}</span>`).join('')}</div>
        ${d.apuestas.length ? `<div class="jg-ron"><div class="jg-ron-h"><span class="lab">En la ronda</span><i class="num">${d.apuestas.length}</i></div>${d.apuestas.map((a) => crFila(a, f, d.ronda)).join('')}</div>` : ''}
      </div>
      <div class="jg-side">
        ${apuesta()}
        <div class="jg-gap"><span class="lab">Retirar solo en</span><label class="jg-auto"><span>×</span><input data-auto inputmode="decimal" autocomplete="off" placeholder="sin límite" value="${esc(S.auto)}" aria-label="Retirada automática"></label></div>
        <button class="go" data-jg="crGo" data-go><span data-bl>Apostar</span><span class="jg-pay" data-bp></span></button>${aviso()}
        ${rondasHtml(d)}
      </div></section>`;
  }
  // las ultimas rondas, en pequeño: el punto de explosion y un avatar por jugador con un aro verde (cobro) o rojo (explotado)
  function rondasHtml(d) {
    const rs = (d.rondas || []).filter((x) => x.gente.length).slice(0, 5);
    if (!rs.length) return '';
    return `<span class="lab jg-sec">Últimas rondas</span>${rs.map((x) => `<div class="jg-rr ${clsP(x.punto)}"><b class="num">×${X(x.punto)}</b><span class="jg-rav">${x.gente.slice(0, 5).map((g) => `<span class="jg-ra ${g.estado === 'cobrada' ? (g.pago > g.stake ? 'w' : 'e') : 'l'}" title="${esc(nom(g.player))} ${g.estado === 'cobrada' ? '×' + X(g.retiro) + ' +' + N(g.pago) : '▼ ' + N(g.stake)}">${av(g.player)}</span>`).join('')}</span></div>`).join('')}`;
  }
  // una linea de "En la ronda": avatar, nombre, apuesta, ×, lo que gana (en vivo mientras sigue dentro) y el estado
  function crFila(a, f, ronda) {
    const viva = a.estado === 'viva', cob = a.estado === 'cobrada', per = a.estado === 'perdida', vivo = viva && f === 'curso';
    const x = cob ? `<b class="num win">×${X(a.retiro)}</b>` : vivo ? '<b class="num jg-livex" data-livex>×1,00</b>' : per ? `<b class="num lose">×${X(ronda && ronda.punto)}</b>` : '';
    const val = cob ? `<b class="num win">+${N(a.pago)}</b>` : vivo ? `<b class="num jg-live" data-live="${a.stake}">${N(a.stake)}</b>` : per ? `<b class="num lose">▼ ${N(a.stake)}</b>` : '';
    const chip = cob ? '<span class="jg-chp g">Retirado</span>' : per ? '<span class="jg-chp r">Explotado</span>' : '<span class="jg-chp y">En juego</span>';
    return `<div class="jg-ro ${cob ? 'ok' : per ? 'ko' : ''}" data-pl="${a.player}" data-est="${a.estado}">${av(a.player)}<span class="jg-ro-n">${esc(nom(a.player))}${a.auto ? `<em>sale en ×${X(a.auto)}</em>` : ''}</span><b class="num rap">${N(a.stake)}</b><span class="rcx">${x}</span><span class="rcv">${val}</span>${chip}</div>`;
  }
  // el boton principal segun la fase: apostar / dentro / retirar con lo que cobrarias
  function crBoton() {
    const b = refs.go || (root && root.querySelector('[data-go]')); if (!b || S.juego !== 'crash' || !D.crash) return;
    const f = crFase(), mia = crMia();
    let lab = `Apostar ${N(S.stake)}`, pay = '', dis = false, cls = 'go';
    if (f === 'apuestas' && mia) { lab = 'Dentro'; dis = true }
    else if (f === 'curso') {
      if (mia && mia.estado === 'viva') { const m = crMult(crT()); lab = `Retirar ×${X(m)}`; pay = N(Math.floor(mia.stake * m)); cls = 'go jg-out' }
      else if (mia) { lab = mia.estado === 'cobrada' ? 'Retirado' : 'Perdida'; dis = true }
      else { lab = 'En marcha'; dis = true }
    }
    // el boton es siempre el mismo nodo con los mismos hijos: solo cambia su texto, asi el clic (pulsar y soltar) nunca cae en un elemento que ya no existe
    if (b.className !== cls) b.className = cls;
    setT(b.querySelector('[data-bl]'), lab); setT(b.querySelector('[data-bp]'), pay);
    if (b.disabled !== dis) b.disabled = dis;
  }
  /* ---- efectos del crash: cohete con estela, chispas, explosion y cobro. Todo se dibuja en el canvas y solo mientras hay ronda o efecto vivo ---- */
  const CRX = { parts: [], boom: null, head: null, t: 0, est: null };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const PARADAS = [[1, [244, 242, 236]], [2, [242, 193, 78]], [5, [255, 140, 56]], [10, [43, 212, 125]], [30, [77, 224, 255]]];
  // el multiplicador cambia de color segun sube: blanco, oro, naranja, verde, cian
  function colorMult(m) {
    let i = 0; while (i < PARADAS.length - 2 && m >= PARADAS[i + 1][0]) i++;
    const [a, ca] = PARADAS[i], [b, cb] = PARADAS[i + 1], t = Math.min(1, Math.max(0, (m - a) / (b - a)));
    return ca.map((v, k) => Math.round(v + (cb[k] - v) * t));
  }
  function chispas(x, y, n, cols, vel, grav, vida) {
    for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), v = rnd(vel * 0.2, vel); CRX.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: grav, r: rnd(1.5, 4), t: 0, vida: rnd(vida * 0.5, vida), c: cols[(Math.random() * cols.length) | 0] }) }
    if (CRX.parts.length > 260) CRX.parts.splice(0, CRX.parts.length - 260);
  }
  function crBoom() {
    if (quieto()) return;
    CRX.boom = { t0: performance.now(), nacio: false };
    const st = root.querySelector('[data-cr]');
    if (st) st.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(-7px,3px)' }, { transform: 'translate(6px,-4px)' }, { transform: 'translate(-4px,-2px)' }, { transform: 'translate(3px,2px)' }, { transform: 'none' }], { duration: 420, easing: 'ease-out' });
    if (refs.mult) refs.mult.animate([{ transform: 'scale(1.14)' }, { transform: 'scale(1)' }], { duration: 400, easing: 'cubic-bezier(.2,.8,.3,1)' });
  }
  function crCobroFx(pago) {
    if (quieto()) return;
    const h = CRX.head, cv = refs.cv; if (!h || !cv) return;
    chispas(h.x, h.y, 34, ['#2bd47d', '#f2c14e', '#ffdc85', '#f4f2ec'], 240, 260, 0.9);
    const el = document.createElement('span');
    const r = cv.getBoundingClientRect();
    el.className = 'jg-fl'; el.textContent = '+' + N(pago); el.style.left = r.left + h.x + 'px'; el.style.top = r.top + h.y + 'px';
    document.body.appendChild(el);                                   // fuera de la pantalla de juegos: asi no lo borra un repintado
    el.animate([{ transform: 'translate(-50%,0) scale(.8)', opacity: 0 }, { transform: 'translate(-50%,-26px) scale(1.1)', opacity: 1, offset: 0.25 }, { transform: 'translate(-50%,-80px) scale(1)', opacity: 0 }], { duration: 1300, easing: 'ease-out' }).onfinish = () => el.remove();
    if (refs.mult) refs.mult.animate([{ transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 350 });
  }
  function crFilasFx() {
    const r = D.crash && D.crash.ronda; if (!r) return;
    if (S.cr.rid !== r.id) { S.cr.rid = r.id; S.cr.vistos = new Set(); S.cr.primera = true }
    root.querySelectorAll('[data-pl]').forEach((row) => {
      const est = row.dataset.est; if (est === 'viva') return;
      const k = row.dataset.pl + est; if (S.cr.vistos.has(k)) return;
      S.cr.vistos.add(k);
      if (S.cr.primera || quieto()) return;
      const verde = est === 'cobrada';
      row.animate([{ backgroundColor: verde ? 'rgba(43,212,125,.42)' : 'rgba(224,100,111,.38)', transform: verde ? 'translateX(-8px) scale(1.01)' : 'translateX(6px)' }, { backgroundColor: 'rgba(0,0,0,0)', transform: 'none' }], { duration: verde ? 900 : 700, easing: 'cubic-bezier(.2,.8,.25,1)' });
    });
    S.cr.primera = false;
  }
  // la ronda acaba de explotar delante de mis ojos
  function crTrans(f0, id0) { if (f0 === 'curso' && D.crash.ronda && D.crash.ronda.id === id0 && crFase() === 'fin') crBoom() }
  const crActivo = (f) => f === 'apuestas' || f === 'curso' || CRX.parts.length > 0 || !!CRX.boom;
  function crFrame(solo) {
    crRaf = 0;
    if (!visible() || S.juego !== 'crash' || !D.crash) return;
    const f = crFase(), r = D.crash.ronda, mia = crMia();
    let m = 1, t = 0, txt = '', cls = 'dim';
    if (f === 'apuestas') { const s = Math.max(0, Math.ceil((ms(r.arranca) - ahora()) / 1000)); txt = D.crash.apuestas.length ? `${D.crash.apuestas.length} dentro` : 'Todavía nadie dentro' }
    else if (f === 'curso') { t = crT(); m = crMult(t); cls = 'on'; txt = mia && mia.estado === 'viva' ? 'Retira antes de que explote' : mia && mia.estado === 'cobrada' ? `Has cobrado ${N(mia.pago)}` : D.crash.apuestas.length ? 'En marcha' : '' }
    else if (f === 'fin') {
      m = Number(r.punto); t = r.fin_at ? Math.max(0, (ms(r.fin_at) - ms(r.arranca)) / 1000) : Math.log(Math.max(1.0001, m)) / K(); cls = 'boom';
      txt = `Explotó en ×${X(m)}` + (mia ? (mia.estado === 'cobrada' ? ` · cobraste ${N(mia.pago)}` : ` · perdiste ${N(mia.stake)}`) : '');
    } else txt = 'Apuesta para abrir una ronda';
    if (refs.mult) {
      const v = `×${X(m)}`; if (refs.mult.textContent !== v) refs.mult.textContent = v;
      const c = 'jg-big num ' + cls; if (refs.mult.className !== c) refs.mult.className = c;
      const col = f === 'curso' ? (crF(t, crRetro()) < 0.985 ? [255, 107, 94] : colorMult(m)) : null, est = col ? `rgb(${col})|0 0 ${Math.round(Math.min(46, 8 + m * 2.2))}px rgba(${col},.38)` : '';
      if (refs.mult._e !== est) { refs.mult._e = est; const [a, b] = est ? est.split('|') : ['', '']; refs.mult.style.color = a; refs.mult.style.textShadow = b }
    }
    setT(refs.sub, txt);
    if (f === 'curso') {
      if (!refs.live) refs.live = [...root.querySelectorAll('[data-live]')];
      for (const el of refs.live) { const v = Math.floor(+el.dataset.live * m); if (el._v !== v) { el._v = v; el.textContent = N(v) } }
      if (!refs.livex) refs.livex = [...root.querySelectorAll('[data-livex]')];
      const tx = '×' + X(m); for (const el of refs.livex) if (el._v !== tx) { el._v = tx; el.textContent = tx }
    }
    crCuenta(f, r);
    crBoton();
    crDibuja(f, t, m);
    if (!solo && crActivo(f)) crRaf = requestAnimationFrame(() => crFrame());
  }
  // cuenta atras grande antes de arrancar: anillo que se vacia y numero que late en los ultimos 3 s (elementos fijos, solo cambian sus valores)
  function crCuenta(f, r) {
    const cd = refs.cd; if (!cd) return;
    const ver = f === 'apuestas';
    if (cd.hidden === ver) cd.hidden = !ver;
    if (!ver) return;
    const rem = Math.max(0, (ms(r.arranca) - ahora()) / 1000), n = Math.ceil(rem), hot = rem <= 3, nEl = cd.querySelector('[data-cdn]');
    if (nEl.textContent !== String(n)) nEl.textContent = n;
    cd.querySelector('[data-cdp]').style.strokeDashoffset = (603.2 * (1 - Math.min(1, rem / 10))).toFixed(1);
    if (cd.classList.contains('hot') !== hot) cd.classList.toggle('hot', hot);
    nEl.style.transform = hot && !quieto() ? `scale(${(1 + 0.26 * Math.pow(rem - Math.floor(rem), 3)).toFixed(3)})` : '';
  }
  /* ---- velas: cada vela es una ventana de 0,34 s de la curva real m(t) (con sus retrocesos); es una funcion del tiempo, asi que
         al entrar a mitad de ronda se dibuja entera. Solo se calcula lo visible. ---- */
  const DTC = 0.34, VIS = 30;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const ruido = (i, k) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x) };      // 0..1, estable
  function vela(i, tMax) {
    const t0 = i * DTC, t1 = Math.min(tMax, t0 + DTC), prog = clamp((t1 - t0) / DTC, 0, 1);
    const eo = (ruido(i - 1, 1) - 0.5) * 0.016, ec = (ruido(i, 1) - 0.5) * 0.016 * prog * prog;
    const o = i === 0 ? 1 : crMr(t0) * (1 + eo), c = crMr(t1) * (1 + ec);
    let hi = Math.max(o, c), lo = Math.min(o, c);
    for (let s = 1; s < 6; s++) { const v = crMr(t0 + ((t1 - t0) * s) / 6); if (v > hi) hi = v; if (v < lo) lo = v }
    return { o, c, h: hi * (1 + 0.007 * ruido(i, 2) * (0.4 + prog)), l: lo * (1 - 0.007 * ruido(i, 3) * (0.4 + prog)) };
  }
  const VERDE = '#2bd47d', ROJOV = '#e0646f';
  function crDibuja(f, t, m) {
    const cv = refs.cv; if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr) }
    const g = cv.getContext('2d'), now = performance.now(), dt = Math.min(0.05, Math.max(0, (now - (CRX.t || now)) / 1000));
    CRX.t = now;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const padL = 10, padR = 78, padT = 20, padB = 24;
    const corre = f === 'curso' || f === 'fin';
    // velas visibles: la de ahora y las VIS anteriores (tras explotar se añade la vela roja que cae al suelo)
    const tF = t / DTC, nUlt = corre ? Math.floor(tF) : -1, extra = f === 'fin' ? 1 : 0;
    const lista = [];
    for (let i = Math.max(0, nUlt - VIS + 1 + extra); i <= nUlt; i++) lista.push([i, vela(i, t)]);
    let pico = Math.max(m, 1.6), valle = 1;
    for (const [, v] of lista) { pico = Math.max(pico, v.h); valle = Math.min(valle, v.l) }
    const yt = Math.max(2, pico * 1.14), yb = Math.min(0.9, valle * 0.9);
    if (CRX.rid !== (D.crash.ronda && D.crash.ronda.id) || CRX.yt == null) { CRX.rid = D.crash.ronda && D.crash.ronda.id; CRX.yt = yt; CRX.yb = yb }
    const q = Math.min(1, dt * 6); CRX.yt += (yt - CRX.yt) * q; CRX.yb += (yb - CRX.yb) * q;
    const lt = Math.log(CRX.yt), lb = Math.log(CRX.yb), py = (v) => h - padB - ((Math.log(Math.max(v, CRX.yb * 0.5)) - lb) / (lt - lb)) * (h - padT - padB);
    const paso = (w - padL - padR) / VIS, base = Math.max(0, tF + 1 + extra - VIS), px = (i) => padL + (i - base) * paso + paso / 2;
    // fondo y rejilla suave
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#10131a'); bg.addColorStop(1, '#0b0d12'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.lineWidth = 1; g.font = '11px JB, ui-monospace, monospace'; g.textBaseline = 'middle';
    g.strokeStyle = 'rgba(255,255,255,.035)';
    for (let i = Math.ceil(base / 5) * 5; px(i) < w - padR; i += 5) { const x = Math.round(px(i)) + 0.5; g.beginPath(); g.moveTo(x, padT); g.lineTo(x, h - padB); g.stroke() }
    for (const v of [0.5, 1, 1.5, 2, 3, 5, 7, 10, 15, 20, 30, 50, 100, 200, 500]) {
      if (v < CRX.yb || v > CRX.yt) continue;
      const y = Math.round(py(v)) + 0.5; g.strokeStyle = v === 1 ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.05)'; g.beginPath(); g.moveTo(padL, y); g.lineTo(w - padR, y); g.stroke();
      g.fillStyle = '#6c737e'; g.fillText('×' + String(v).replace('.', ','), w - padR + 10, y);
    }
    const caida = corre && f === 'curso' && crF(t, crRetro()) < 0.985;
    const col = f === 'fin' ? ROJO : caida ? [255, 107, 94] : colorMult(m), rgb = col.join(',');
    // velas
    let ultX = px(0), ultY = py(1), x2 = null;
    for (const [i, v] of lista) {
      const x = px(i), sube = v.c >= v.o, c = sube ? VERDE : ROJOV, bw = Math.max(3, paso * 0.62), vivo = f === 'curso' && i === nUlt;
      g.strokeStyle = c; g.fillStyle = c; g.lineWidth = 1.6;
      if (vivo) { g.save(); g.shadowColor = c; g.shadowBlur = 14 }
      g.beginPath(); g.moveTo(x, py(v.h)); g.lineTo(x, py(v.l)); g.stroke();
      const y1 = py(Math.max(v.o, v.c)), y2 = py(Math.min(v.o, v.c)); g.fillRect(x - bw / 2, y1, bw, Math.max(2, y2 - y1));
      if (vivo) g.restore();
      ultX = x; ultY = py(v.c);
    }
    // la vela roja enorme que cae al suelo cuando explota
    if (f === 'fin') {
      const b = CRX.boom, age = b ? (now - b.t0) / 1000 : 9, k = clamp(age / 0.3, 0, 1), x = px(nUlt + 1), top = lista.length ? lista[lista.length - 1][1].c : m;
      const yTop = py(top), yBajo = yTop + (py(CRX.yb * 0.97) - yTop) * (1 - Math.pow(1 - k, 3)), bw = Math.max(5, paso * 0.8);
      g.save(); g.shadowColor = 'rgba(224,100,111,.9)'; g.shadowBlur = 22 * (1 - clamp(age / 1.4, 0, 1)) + 6;
      g.strokeStyle = ROJOV; g.fillStyle = ROJOV; g.lineWidth = 2; g.beginPath(); g.moveTo(x, yTop - 4); g.lineTo(x, yBajo + 6); g.stroke(); g.fillRect(x - bw / 2, yTop, bw, Math.max(3, yBajo - yTop)); g.restore();
      ultX = x; ultY = yTop; x2 = x;
      if (b && !b.nacio) { b.nacio = true; chispas(x, yTop, 70, ['#ffdc85', '#ff8c38', '#e0646f', '#fff'], 300, 340, 1.1) }
      if (b && age < 0.35) { g.fillStyle = `rgba(255,255,255,${0.22 * (1 - age / 0.35)})`; g.fillRect(0, 0, w, h) }
      if (b && age < 0.7) { g.strokeStyle = `rgba(255,200,120,${1 - age / 0.7})`; g.lineWidth = 3; g.beginPath(); g.arc(x, yTop, age * 190, 0, 7); g.stroke() }
      if (b && age > 1.4 && !CRX.parts.length) CRX.boom = null;
    }
    CRX.head = { x: ultX, y: ultY };
    // linea punteada del precio y su etiqueta a la derecha
    const yP = clamp(py(f === 'fin' ? m : m), padT, h - padB);
    if (corre || f === 'apuestas' || f === 'idle') {
      const yy = f === 'apuestas' || f === 'idle' ? py(1) : yP;
      g.save(); g.strokeStyle = `rgba(${rgb},.7)`; g.lineWidth = 1.2; g.setLineDash([5, 5]); g.beginPath(); g.moveTo(padL, yy); g.lineTo(w - padR + 4, yy); g.stroke(); g.restore();
      const txt = '×' + X(f === 'apuestas' || f === 'idle' ? 1 : m);
      g.save(); g.shadowColor = `rgba(${rgb},.55)`; g.shadowBlur = 10; g.fillStyle = `rgb(${rgb})`;
      const rx = w - padR + 6, rw = padR - 12, rh = 24, rr = 6; g.beginPath(); g.moveTo(rx + rr, yy - rh / 2); g.arcTo(rx + rw, yy - rh / 2, rx + rw, yy + rh / 2, rr); g.arcTo(rx + rw, yy + rh / 2, rx, yy + rh / 2, rr); g.arcTo(rx, yy + rh / 2, rx, yy - rh / 2, rr); g.arcTo(rx, yy - rh / 2, rx + rw, yy - rh / 2, rr); g.closePath(); g.fill(); g.restore();
      g.fillStyle = '#12100a'; g.font = '700 12px JB, ui-monospace, monospace'; g.textAlign = 'center'; g.fillText(txt, rx + rw / 2, yy + 1); g.textAlign = 'left';
    }
    // particulas (cobro y explosion)
    for (let i = CRX.parts.length - 1; i >= 0; i--) {
      const p = CRX.parts[i]; p.t += dt;
      const kk = 1 - p.t / p.vida; if (kk <= 0) { CRX.parts.splice(i, 1); continue }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      g.globalAlpha = Math.min(1, kk * 1.4); g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y, p.r * (0.4 + kk * 0.8), 0, 7); g.fill();
    }
    g.globalAlpha = 1;
  }
  // bucle de la ronda: solo mientras hay una ronda viva (o un efecto en el aire) con la pantalla a la vista
  function crLoop() {
    cancelAnimationFrame(crRaf); clearTimeout(crPoll); crRaf = crPoll = 0;
    if (!visible() || S.juego !== 'crash' || !D.crash) return;
    const f = crFase();
    if (crActivo(f)) crRaf = requestAnimationFrame(() => crFrame());
    if (f === 'curso') crPoll = setTimeout(crSondeo, 700);
    else if (f === 'apuestas') crPoll = setTimeout(crSondeo, Math.max(250, ms(D.crash.ronda.arranca) - ahora() + 400));
  }
  async function crSondeo() {
    crPoll = 0;
    if (!visible() || S.juego !== 'crash') return;
    const f0 = crFase(), id0 = D.crash && D.crash.ronda && D.crash.ronda.id;
    try { D.crash = await rpc('crash_estado'); S.err = null } catch (e) { S.err = msgErr(e) }
    if (D.crash) crTrans(f0, id0);
    const fase = crFase();
    if (fase === 'fin' && S.cr.ultima !== D.crash.ronda.id) { S.cr.ultima = D.crash.ronda.id; if (crMia() && ctx.refresh) ctx.refresh() }
    pintaSi(); crLoop();
  }
  A.crGo = async () => {
    const f = crFase(), mia = crMia();
    if (f === 'curso' && mia && mia.estado === 'viva') {
      const id0 = D.crash.ronda.id, r = await rpc('crash_retirar');
      if (r.ok) { toast(`Retirado a <b>×${X(r.retiro)}</b> · +${N(r.pago)}`); crCobroFx(r.pago) }
      else toast(`Tarde: explotó en <b>×${X(r.punto)}</b>`);
      D.crash = await rpc('crash_estado'); crTrans('curso', id0); pintaSi(true); crLoop(); if (ctx.refresh) ctx.refresh();
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
  // cartas de verdad: indices en las esquinas, puntos en su sitio, figuras con marco y un dorso con dibujo. Se pueden girar (volteo de la tapada).
  const PIPS = { 2: [[50, 22], [50, 78]], 3: [[50, 22], [50, 50], [50, 78]], 4: [[36, 24], [64, 24], [36, 76], [64, 76]], 5: [[36, 24], [64, 24], [50, 50], [36, 76], [64, 76]], 6: [[36, 24], [64, 24], [36, 50], [64, 50], [36, 76], [64, 76]],
    7: [[36, 24], [64, 24], [50, 37], [36, 50], [64, 50], [36, 76], [64, 76]], 8: [[36, 24], [64, 24], [50, 37], [36, 50], [64, 50], [50, 63], [36, 76], [64, 76]],
    9: [[36, 22], [64, 22], [36, 41], [64, 41], [50, 50], [36, 59], [64, 59], [36, 78], [64, 78]], 10: [[36, 22], [64, 22], [50, 31], [36, 41], [64, 41], [36, 59], [64, 59], [50, 69], [36, 78], [64, 78]] };
  function frente(c) {
    const s = Math.floor(c / 13), r = c % 13, P = SUIT[s], R = RANK[r];
    const centro = r === 0 ? `<span class="jg-pp big" style="left:50%;top:50%">${P}</span>`
      : r >= 10 ? `<span class="jg-fc"><em>${R}</em><u>${P}</u></span>`
      : PIPS[r + 1].map(([x, y]) => `<span class="jg-pp ${y > 50 ? 'rv' : ''}" style="left:${x}%;top:${y}%">${P}</span>`).join('');
    const ix = `<span class="jg-ix"><b>${R}</b><i>${P}</i></span>`;
    return ix + centro + ix.replace('jg-ix', 'jg-ix rv');
  }
  const carta = (c, down) => {
    const s = down ? 0 : Math.floor(c / 13);
    return `<span class="jg-card ${s === 1 || s === 2 ? 'rd' : ''}"><span class="jg-ci"${down ? ' style="transform:rotateY(180deg)"' : ''}><span class="jg-cfr">${down ? '' : frente(c)}</span><span class="jg-cbk"></span></span></span>`;
  };
  const bjNb = (m) => m.banca.length + (m.estado === 'curso' ? 1 : 0);
  const FICHAS = [[100, 'c100'], [50, 'c50'], [25, 'c25'], [10, 'c10'], [5, 'c5'], [1, 'c1']];
  function fichasN(n) { let k = 0; for (const [v] of FICHAS) while (n >= v && k < 8) { n -= v; k++ } return k }
  function fichasHtml(n) { let o = '', k = 0; for (const [v, c] of FICHAS) while (n >= v && k < 8) { o += `<i class="jg-ch ${c}" style="--k:${k}"></i>`; n -= v; k++ } return o }
  function vBj() {
    const m = D.blackjack && D.blackjack.mano, curso = m && m.estado === 'curso';
    const gan = m && m.estado === 'fin' ? m.pago - m.apostado : 0;
    let res = m ? '' : 'Haz tu apuesta';
    if (m && m.estado === 'fin') {
      res = m.resultado === 'blackjack' ? `Blackjack · ▲ ${N(gan)}` : m.resultado === 'gana' ? `Ganas ▲ ${N(gan)}` : m.resultado === 'empate' ? 'Empate · te devuelvo la apuesta' : m.valor > 21 ? `Te pasas · ▼ ${N(m.apostado)}` : `Pierdes ▼ ${N(m.apostado)}`;
    }
    const cls = m && m.estado === 'fin' ? (m.resultado === 'gana' || m.resultado === 'blackjack' ? 'win' : m.resultado === 'empate' ? '' : 'lose') : (m ? '' : 'dim');
    return `<section class="jg-g jg-gbj">
      <div class="jg-stage jg-bj">
        <div class="jg-felt" data-felt>
          <div class="jg-dk" data-deck><i></i><i></i><i></i><i></i></div>
          <div class="jg-zb">
            <div class="jg-hl"><span class="lab">Banca</span><b class="num" data-bv>${m ? (m.valor_banca || '') : ''}</b></div>
            <div class="jg-hand" data-bj-b>${m ? m.banca.map((c) => carta(c)).join('') + (curso ? carta(null, true) : '') : ''}</div>
          </div>
          <div class="jg-mid">
            <div class="jg-pot" data-pot>${curso ? `<span class="jg-fs">${fichasHtml(m.apostado)}</span><b class="num jg-pa">${N(m.apostado)}</b>` : ''}</div>
            <p class="jg-res ${cls}" data-bj-res>${esc(res)}</p>
          </div>
          <div class="jg-zb">
            <div class="jg-hand" data-bj-j>${m ? m.jugador.map((c) => carta(c)).join('') : ''}</div>
            <div class="jg-hl"><span class="lab">Tú</span><b class="num">${m ? m.valor : ''}</b>${m && m.doblada ? '<em>doblada</em>' : ''}</div>
          </div>
          <p class="jg-arco">Blackjack paga 3 a 2</p>
        </div>
      </div>
      <div class="jg-side">
        ${curso ? `<span class="lab">En juego</span><div class="jg-pott num">${N(m.apostado)}${coin()}</div>
          <button class="go" data-jg="pedir" data-id="${m.id}">Pedir</button>
          <div class="jg-two"><button class="go ghost" data-jg="plantar" data-id="${m.id}">Plantarse</button>${m.puede_doblar ? `<button class="go ghost" data-jg="doblar" data-id="${m.id}" ${S.saldo < m.stake || (S.bjRest != null && S.bjRest < m.stake) ? 'disabled' : ''}>Doblar</button>` : ''}</div>${bjLim()}${aviso()}`
        : `${apuesta()}<button class="go" data-jg="repartir" data-go ${S.bjRest != null && S.bjRest <= 0 ? 'disabled' : ''}>${m ? 'Otra mano' : 'Repartir'} por <span data-go-n>${N(S.stake)}</span></button>${aviso()}`}
        <p class="jg-rule">Blackjack paga 3 a 2. La banca se planta en 17.</p>
      </div></section>`;
  }
  // confeti contenido: un lienzo encima del anfitrion que solo vive lo que dura el chorro
  function confeti(host, o = {}) {
    if (quieto() || !host) return;
    const cv = document.createElement('canvas'); cv.className = 'jg-fx'; host.appendChild(cv);
    const w = host.clientWidth, h = host.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = w * dpr; cv.height = h * dpr;
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const cols = o.cols || ['#f2c14e', '#ffdc85', '#2bd47d', '#f4f2ec'], ox = o.x == null ? w / 2 : o.x, oy = o.y == null ? h * 0.42 : o.y;
    const P = Array.from({ length: o.n || 50 }, () => { const a = rnd(-Math.PI * 0.95, -Math.PI * 0.05), v = rnd(180, 520); return { x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: rnd(2.5, 5.5), rot: rnd(0, 6), vr: rnd(-9, 9), c: cols[(Math.random() * cols.length) | 0], life: rnd(0.9, 1.7), w: rnd(0.5, 1) } });
    const t0 = performance.now(); let last = t0;
    const paso = (now) => {
      const dt = Math.min(0.04, (now - last) / 1000), el = (now - t0) / 1000; last = now; g.clearRect(0, 0, w, h); let vivo = 0;
      for (const p of P) {
        p.vy += 900 * dt; p.vx *= 0.992; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        const k = 1 - el / p.life; if (k <= 0) continue; vivo++;
        g.save(); g.globalAlpha = Math.min(1, k * 1.6); g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = p.c; g.fillRect(-p.r, -p.r * p.w, p.r * 2, p.r * 2 * p.w); g.restore();
      }
      if (vivo && cv.isConnected) requestAnimationFrame(paso); else cv.remove();
    };
    requestAnimationFrame(paso);
  }
  // anima solo lo nuevo de esta mano: las cartas vuelan desde el mazo, la tapada se voltea, las fichas entran y salen, y al ganar hay brillo y confeti
  function bjPost() {
    const m = D.blackjack && D.blackjack.mano; if (!m) return;
    const felt = root.querySelector('[data-felt]'), deck = root.querySelector('[data-deck]'); if (!felt || !deck) return;
    const fr = felt.getBoundingClientRect(), dk = deck.getBoundingClientRect();
    const js = [...root.querySelectorAll('[data-bj-j] .jg-card')], bs = [...root.querySelectorAll('[data-bj-b] .jg-card')];
    const cx = (el) => { const r = el.getBoundingClientRect(); return r.left - fr.left + r.width / 2 };
    const prev = S.bj.id === m.id ? S.bj : { id: m.id, nj: 0, nb: 0, back: false, xj: [], xb: [], ap: 0 };
    const nuevo = { init: true, id: m.id, nj: js.length, nb: bs.length, back: m.estado === 'curso', xj: js.map(cx), xb: bs.map(cx), ap: m.apostado };
    const inicio = prev.nj === 0 && prev.nb === 0, final = m.estado === 'fin' && (inicio || prev.back);
    const resEl = root.querySelector('[data-bj-res]'), pot = root.querySelector('[data-pot]');
    const hayAnim = (js.length > prev.nj || bs.length > prev.nb || final || (m.apostado > prev.ap && prev.ap)) && !quieto();
    if (!hayAnim) { S.bj = nuevo; return }
    let d = 0;
    const EASE = 'cubic-bezier(.2,.8,.25,1)';
    const vuela = (el, delay, flip) => {
      const r = el.getBoundingClientRect(), dx = dk.left + dk.width / 2 - (r.left + r.width / 2), dy = dk.top + dk.height / 2 - (r.top + r.height / 2);
      el.animate([{ transform: `translate(${dx}px,${dy}px) rotate(-14deg) scale(.8)` }, { transform: 'none' }], { duration: 440, delay, easing: EASE, fill: 'backwards' });
      if (flip) el.querySelector('.jg-ci').animate([{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(180deg)', offset: 0.4 }, { transform: 'rotateY(0deg)' }], { duration: 440, delay, easing: 'ease-out', fill: 'backwards' });
    };
    const volteo = (el, delay) => {
      el.querySelector('.jg-ci').animate([{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(0deg)' }], { duration: 520, delay, easing: 'ease-in-out', fill: 'backwards' });
      el.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-16px) scale(1.06)', offset: 0.5 }, { transform: 'translateY(0)' }], { duration: 520, delay, easing: 'ease-in-out' });
    };
    if (!inicio) {                                                                  // las ya puestas se hacen sitio (la fila va centrada)
      const mueve = (els, xs, nx, n) => els.forEach((el, i) => { if (i < n && xs[i] != null && Math.abs(xs[i] - nx[i]) > 1) el.animate([{ transform: `translateX(${xs[i] - nx[i]}px)` }, { transform: 'none' }], { duration: 300, easing: EASE }) });
      mueve(js, prev.xj, nuevo.xj, prev.nj); mueve(bs, prev.xb, nuevo.xb, prev.nb);
    }
    const dealer = m.estado === 'fin' && prev.back && prev.id === m.id;             // la banca juega: voltea su carta y pide
    if (inicio) {                                                                   // reparto: tu carta, la suya, la tuya, la suya (tapada si se sigue jugando)
      for (let i = 0; i < Math.max(js.length, bs.length); i++) {
        if (js[i]) { vuela(js[i], d, true); d += 300 }
        if (bs[i]) { vuela(bs[i], d, !(m.estado === 'curso' && i === 1)); d += 300 }
      }
      if (fichasN(m.apostado) && !final && pot) pot.querySelectorAll('.jg-ch').forEach((c, k) => c.animate([{ transform: 'translateY(200px) scale(.8)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 400, delay: k * 70, easing: EASE, fill: 'backwards' }));
    } else {
      for (let i = prev.nj; i < js.length; i++) { vuela(js[i], d, true); d += 400 }
      if (dealer) {
        if (bs.length > 1) { volteo(bs[1], d); d += 620 }
        for (let i = 2; i < bs.length; i++) { vuela(bs[i], d, true); d += 560 }
      }
      if (m.apostado > prev.ap && prev.ap && pot) pot.querySelectorAll('.jg-ch').forEach((c, k) => { if (k >= fichasN(prev.ap)) c.animate([{ transform: 'translateY(200px) scale(.8)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 400, delay: k * 60, easing: EASE, fill: 'backwards' }) });
    }
    if (final && pot) {                                                             // las fichas se van: al jugador si gana o empata, a la banca si pierde
      const gana = m.resultado === 'gana' || m.resultado === 'blackjack', empate = m.resultado === 'empate', tf = d + 200;
      const tmp = document.createElement('div'); tmp.className = 'jg-tmp';
      tmp.innerHTML = `<span class="jg-fs">${fichasHtml(m.apostado)}</span>${gana ? `<span class="jg-fs jg-fs2">${fichasHtml(m.pago - m.apostado)}</span>` : ''}`;
      pot.appendChild(tmp);
      const dir = gana || empate ? 230 : -230;
      [...tmp.querySelectorAll('.jg-ch')].forEach((c, k) => {
        const premio = c.parentElement.classList.contains('jg-fs2');
        if (premio) c.animate([{ transform: 'translateY(-200px) scale(.8)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, delay: tf + k * 60, easing: EASE, fill: 'backwards' });
        c.animate([{ transform: 'none', opacity: 1 }, { transform: `translateY(${dir}px) scale(.85)`, opacity: 0 }], { duration: 560, delay: tf + (premio ? 620 : 380) + k * 40, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'both' });
      });
      d = tf + (gana ? 1600 : 950);
      setTimeout(() => tmp.remove(), d + 100);
      if (gana) {
        const big = m.resultado === 'blackjack';
        setTimeout(() => { if (felt.isConnected) { confeti(felt, { n: big ? 110 : 55, cols: big ? ['#f2c14e', '#ffdc85', '#fff'] : undefined }); felt.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.3)' }, { filter: 'brightness(1)' }], { duration: 900 }) } }, tf + 380);
      }
    }
    if (resEl && m.estado === 'fin') resEl.animate([{ opacity: 0, transform: 'scale(.7)' }, { opacity: 1, transform: 'scale(1.12)', offset: 0.6 }, { opacity: 1, transform: 'none' }], { duration: 520, delay: Math.max(0, d - 700), easing: EASE, fill: 'backwards' });
    // hasta que la banca acaba, el valor de la banca y el saldo de la cabecera no se mueven
    const vb = root.querySelector('[data-bv]'); if (vb && (dealer || final)) { const real = m.valor_banca; vb.textContent = ''; setTimeout(() => { const v2 = root && root.querySelector('[data-bv]'); if (v2) v2.textContent = real }, Math.max(0, d - 900)) }
    S.bj = nuevo;
    S.busy++; setTimeout(libera, d + 450);
  }
  async function bjAccion(fn, args) {
    const r = await rpc(fn, args);
    D.blackjack = { mano: r.mano, saldo: r.saldo };
    S.saldoPend = r.saldo;                                                       // el saldo y lo que queda hoy se ven cuando acaban las cartas
    S.bjRestPend = await bjLimite();
    sigs.v = null; pinta();
    if (!S.busy) { S.saldo = S.saldoPend; S.saldoPend = null; S.bjRest = S.bjRestPend; S.bjRestPend = undefined; pinta(); if (ctx.refresh) ctx.refresh() }
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
      if (nueva || !D[S.juego] || Date.now() - ultima > 1200) cargar();
      else { post(); reanuda(); clearTimeout(tCarga); tCarga = setTimeout(cargar, 1250 - (Date.now() - ultima)) }      // pulso pegado al anterior: no se pierde, se pide un poco despues
    },
    // true mientras una animacion esconde un resultado: la app no debe repintar el saldo todavia (llamara a refresh() sola al acabar)
    ocupado: () => S.busy > 0,
    estado: () => ({ juego: S.juego, ocupado: S.busy > 0 }),
  };
})();
