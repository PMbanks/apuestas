// La mesa de blackjack (PM, 01-11: "1 mesa pero se podra jugar varias personas en la misma mesa y no habra max lose").
// Una sola mesa de 7 asientos: todos los sentados juegan la misma ronda contra la banca. Las cartas, el tiempo y el dinero los
// decide la base (db/040_blackjack_mesa.sql); aqui solo se pide ("apuesto", "pido carta") y se pinta lo que devuelve.
// La pestana Blackjack de juegos.js deja un hueco [data-bjm] y llama a GM_BJMESA.montar(hueco, ctx, { rank }). El nodo de la mesa
// es siempre el mismo (como el de Juegos): aunque Juegos o la app repinten, las cartas ya puestas y sus animaciones siguen.
// Directo: bjm_pulso por Supabase Realtime (cualquier cambio de la mesa) + un temporizador al vencer cada plazo (la llamada a
// bjm_estado es la que hace avanzar la ronda) + un sondeo corto de respaldo. Todo para cuando la mesa no se ve.
'use strict';
(function () {
  const SUIT = ['♠', '♥', '♦', '♣'], RANK = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const NA = 7, PASO = 320, VUELO = 460, EASE = 'cubic-bezier(.2,.8,.25,1)';     // PASO: igual que bjm_t_reparto en la base
  const FICHAS = [[1000, 'f1k'], [500, 'f500'], [100, 'f100'], [50, 'f50'], [25, 'f25'], [10, 'f10'], [5, 'f5'], [1, 'f1']];

  let ctx = null, el = null, hooks = {}, D = null, err = null;
  const T = { off: 0 };
  const S = { stake: Math.max(1, parseInt(lee('bj-stake'), 10) || 10), ocupa: false, aviso: '', anim: 0, pend: null, chan: null, on: false,
    tPoll: 0, tPlazo: 0, tRt: 0, tic: 0, ultima: 0, cargando: false, otra: false, ctlSig: '', dn: null, pd: 0, saldo: null, refrescar: false, turnoVisto: null };
  let V = { ronda: null, seats: {}, banca: [], tapada: false };                    // lo que ya esta pintado (para animar solo lo nuevo)

  /* ---------- utilidades ---------- */
  function lee(k) { try { return localStorage.getItem(k) } catch { return null } }
  function guarda(k, v) { try { localStorage.setItem(k, String(v)) } catch {} }
  const N = (x) => { const v = Math.round(x || 0); return (v < 0 ? '−' : '') + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, document.documentElement.lang === 'en' ? ',' : '.') };
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const coin = () => '<span class="cn"></span>';
  const quieto = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } };
  const ahora = () => Date.now() + T.off;
  const ms = (t) => (t ? Date.parse(t) : 0);
  const visible = () => !!(el && el.isConnected && !document.hidden);
  const tr = (n) => { if (window.GM_LANG && n) GM_LANG.traduce(n) };
  const suena = (t) => { try { window.dispatchEvent(new CustomEvent('gm:sonido', { detail: t })) } catch {} };
  const jug = (u) => (ctx && ctx.jugadores.find((j) => j.uuid === u)) || { id: 'pm', color: 'pm', n: '·', uuid: u };
  const av = (u) => (ctx && ctx.av ? String(ctx.av(jug(u).id, 'xl')).replace(/ data-prof="[^"]*"/, '').replace(/ title="[^"]*"/, '') : `<span class="av ${esc(jug(u).color)} xl">${esc(String(jug(u).n || '·')[0])}</span>`);
  const nom = (u) => (u === (ctx && ctx.me) ? 'Tú' : jug(u).n);
  const movil = () => { try { return matchMedia('(max-width:700px)').matches } catch { return false } };
  const msgErr = (e) => {
    const m = (e && (e.message || e.error_description)) || 'Algo ha fallado', c = m + ((e && e.code) || '');
    if (/Could not find the function|PGRST202|schema cache/i.test(c)) return 'La mesa aún no está en la base: falta cargar db/040';
    if (/permission denied|42501/i.test(c)) return 'Este juego está cerrado ahora mismo';
    return m;
  };
  const toast = (h) => { if (ctx && ctx.toast) ctx.toast(h) };
  const falla = (e) => { const m = msgErr(e); S.aviso = m; toast(esc(m)); pintaCtl(true) };
  const manoDe = (d, s) => (d && d.ronda && fase(d) !== 'espera' ? d.manos.find((m) => m.asiento === s) : null);
  // varias manos por jugador (db/048): mis asientos, mis manos de la ronda que se ve y el numero de cada una (1, 2, 3 por asiento)
  const misAsientos = (d) => (d && Array.isArray(d.mios) ? d.mios : d && d.yo ? [d.yo] : []);
  const misManos = (d) => (d && d.ronda && fase(d) !== 'espera' ? d.manos.filter((m) => m.player === ctx.me).sort((a, b) => a.asiento - b.asiento) : []);
  const ordenMio = (d) => [...new Set([...misAsientos(d), ...misManos(d).map((m) => m.asiento)])].sort((a, b) => a - b);
  const numDe = (d, s) => ordenMio(d).indexOf(s) + 1;
  const turnoMio = (d) => { const r = d && d.ronda; return r && r.estado === 'turnos' ? misManos(d).find((m) => m.asiento === r.turno) || null : null };
  // la mano mia que importa ahora: la que juega, si no la primera
  const miMano = (d) => turnoMio(d) || misManos(d)[0] || null;
  const saldo = () => (S.saldo != null ? S.saldo : ctx ? ctx.saldo : 0);
  const MAX = () => (D && D.cfg && D.cfg.max) || 100000;

  // la fase que se ve: sin ronda (o acabada hace rato) la mesa espera
  function fase(d) {
    const r = d && d.ronda;
    if (!r) return 'espera';
    if (r.estado === 'fin') return ahora() - ms(r.fin_at) > 30000 ? 'espera' : 'fin';
    return r.estado;
  }

  /* ---------- cartas ---------- */
  function caraHtml(c) {
    const s = Math.floor(c / 13), r = c % 13, P = SUIT[s], R = RANK[r];
    const ix = `<span class="bjm-ix"><b>${R}</b><i>${P}</i></span>`;
    const centro = r >= 10 ? `<span class="bjm-fig"><em>${R}</em><u>${P}</u></span>` : `<span class="bjm-pip">${P}</span>`;
    return ix + centro + ix.replace('bjm-ix', 'bjm-ix rv');
  }
  const rojo = (c) => c != null && (Math.floor(c / 13) === 1 || Math.floor(c / 13) === 2);
  function cartaEl(c) {
    const e = document.createElement('span');
    e.className = 'bjm-card' + (rojo(c) ? ' rd' : '');
    e.innerHTML = `<span class="bjm-ci"${c == null ? ' style="transform:rotateY(180deg)"' : ''}><span class="bjm-cf">${c == null ? '' : caraHtml(c)}</span><span class="bjm-cb"></span></span>`;
    e._c = c;
    return e;
  }
  function fichasHtml(n) {
    let o = '', k = 0;
    for (const [v, c] of FICHAS) while (n >= v && k < 6) { o += `<i class="bjm-ch ${c}" style="--k:${k}"></i>`; n -= v; k++ }
    return o;
  }

  /* ---------- armazon ---------- */
  function crea() {
    el = document.createElement('div');
    el.className = 'bjm';
    let seats = '';
    for (let s = 1; s <= NA; s++) {
      seats += `<div class="bjm-seat libre" data-s="${s}">
        <div class="bjm-res" data-res></div>
        <div class="bjm-hw"><div class="bjm-hand" data-h></div><span class="bjm-pill num" data-v></span></div>
        <div class="bjm-spot"><span class="bjm-chs" data-ch></span><b class="bjm-amt num" data-a></b></div>
        <button class="bjm-who" data-bjm="sit" data-v="${s}" aria-label="Asiento ${s}"><span class="bjm-avw"><svg class="bjm-ring" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22.5"/></svg><span class="bjm-av" data-av></span><b class="bjm-nb num" data-nb></b></span><span class="bjm-nm" data-n data-notr></span></button>
      </div>`;
    }
    el.innerHTML = `<div class="bjm-felt" data-felt>
        <div class="bjm-shoe" data-shoe aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        <div class="bjm-dealer"><div class="bjm-dl"><span class="lab">Banca</span><b class="num" data-dv></b></div><div class="bjm-hand bjm-dh" data-dh></div></div>
        <div class="bjm-mid" data-mid><svg class="bjm-arc" viewBox="0 0 600 44" preserveAspectRatio="xMidYMin meet" aria-hidden="true"><defs><path id="bjm-arco" d="M30 8 Q300 44 570 8"/></defs><text><textPath href="#bjm-arco" startOffset="50%" text-anchor="middle">Blackjack paga 3 a 2 · La banca se planta en 17</textPath></text></svg><div class="bjm-cd" data-cd><svg viewBox="0 0 64 64" aria-hidden="true"><circle class="bjm-cd-b" cx="32" cy="32" r="29"/><circle class="bjm-cd-f" data-cdr cx="32" cy="32" r="29"/></svg><b class="num" data-cdn></b></div>
          <div class="bjm-st"><p class="bjm-t" data-t></p><p class="bjm-s" data-sub></p></div></div>
        <div class="bjm-seats" data-seats>${seats}</div>
      </div>
      <div class="bjm-ctl" data-ctl></div>`;
    el.addEventListener('pointerdown', (e) => {
      if ((e.button || 0) !== 0) return;
      const b = e.target.closest && e.target.closest('[data-bjm]');
      S.dn = b && !b.disabled ? { k: llave(b), t: Date.now() } : null;
    });
    el.addEventListener('pointerup', (e) => {
      const d = S.dn; S.dn = null;
      if (!d || Date.now() - d.t > 4000) return;
      const b = e.target.closest && e.target.closest('[data-bjm]');
      if (!b || b.disabled || llave(b) !== d.k) return;
      S.pd = Date.now(); onClick(b);
    });
    el.addEventListener('pointercancel', () => { S.dn = null });
    el.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-bjm]'); if (!b || b.disabled) return; if (S.pd && Date.now() - S.pd < 900) { S.pd = 0; return } onClick(b) });
    el.addEventListener('input', (e) => {
      if (!e.target.matches('[data-bjm-in]')) return;
      S.stake = Math.min(MAX(), parseInt(e.target.value.replace(/\D/g, ''), 10) || 0);
      guarda('bj-stake', S.stake); goN();
    });
    el.addEventListener('focusout', (e) => { if (e.target.matches('[data-bjm-in]')) { e.target.value = N(S.stake || 0); setTimeout(() => pintaCtl(), 60) } });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-bjm-in]')) { e.target.blur(); const b = el.querySelector('[data-bjm="apostar"]'); if (b && !b.disabled) onClick(b) } });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && S.on && visible()) carga(); else programa() });
    window.addEventListener('resize', () => { clearTimeout(S.tRz); S.tRz = setTimeout(() => { if (D && !err && visible() && S.anim === 0) pinta(D, true) }, 160) });
    tr(el);
  }
  const llave = (b) => `${b.dataset.bjm}|${b.dataset.v || ''}`;

  /* ---------- datos ---------- */
  async function carga() {
    if (!ctx || !visible()) return;
    if (S.cargando) { S.otra = true; return }
    S.cargando = true; S.ultima = Date.now();
    const t0 = Date.now();
    try {
      const { data, error } = await ctx.db.rpc('bjm_estado');
      if (error) throw error;
      reloj(data, t0); err = null; recibe(data);
    } catch (e) { err = msgErr(e); pintaError() }
    finally { S.cargando = false; programa(); if (S.otra) { S.otra = false; carga() } }
  }
  function reloj(data, t0) { const s = data && ms(data.now); if (s) T.off = s - (t0 + Date.now()) / 2 }
  // el siguiente vistazo: al vencer el plazo de la ronda (asi avanza aunque nadie toque nada) y, de respaldo, cada pocos segundos
  function programa() {
    clearTimeout(S.tPoll); clearTimeout(S.tPlazo);
    if (!S.on || !visible()) { if (S.on && el && !el.isConnected) para(); return }
    const r = D && D.ronda, viva = r && (r.estado === 'apuestas' || r.estado === 'turnos');
    S.tPoll = setTimeout(carga, viva ? 2500 : 7000);
    const lim = viva ? ms(r.estado === 'apuestas' ? r.cierra : r.plazo) : 0;
    if (lim) S.tPlazo = setTimeout(carga, Math.max(150, lim - ahora() + 250 + Math.random() * 400));
  }
  function recibe(d) {
    if (S.anim > 0) { S.pend = d; return }                                       // se pinta al acabar lo que se esta moviendo
    const antes = D;
    D = d;
    if (S.saldo == null || !S.refrescar) S.saldo = d.saldo;
    pinta(d, !antes);
  }

  /* ---------- pintar ---------- */
  function pintaError() {
    if (!el) return;
    el.classList.add('err');
    setTxt(el.querySelector('[data-t]'), err || '');
    setTxt(el.querySelector('[data-sub]'), '');
    el.querySelector('[data-cd]').classList.remove('on');
    el.querySelector('[data-ctl]').innerHTML = '';
    S.ctlSig = '';
  }
  function setTxt(n, t, cls) { if (!n) return; if (n._t !== t) { n._t = t; n.textContent = t; tr(n) } if (cls !== undefined && n._c !== cls) { n._c = cls; n.className = cls } }
  function setHtml(n, h) { if (!n) return; if (n._h !== h) { n._h = h; n.innerHTML = h; tr(n) } }

  // ancho de carta segun el sitio que hay: asientos ocupados anchos, libres estrechos
  function medidas(d) {
    const felt = el.querySelector('[data-felt]'), w = felt.clientWidth || 600, mv = movil();
    const ocup = d ? d.asientos.length : 0, libres = NA - ocup;
    const filas = mv && ocup > 4 ? 2 : 1, porFila = filas === 2 ? Math.ceil(ocup / 2) : ocup;
    const slots = mv ? Math.max(1, porFila) : Math.max(1, ocup + libres * 0.42);
    const sw = (w - (mv ? 8 : 36)) / slots;
    let cw = Math.round(Math.max(34, Math.min(mv ? 56 : 74, sw * (mv ? 0.5 : 0.48))));
    let dw = Math.round(Math.max(48, Math.min(mv ? 64 : 88, w * 0.12)));
    // en escritorio ancho el tapete tiene alto fijo: las cartas caben en el
    if (!mv && window.matchMedia && matchMedia('(min-width:1360px)').matches) {
      const hmax = Math.max(34, Math.floor(((felt.clientHeight || 520) - 286) / 3.0));
      cw = Math.min(cw, hmax); dw = Math.min(dw, Math.round(hmax * 1.14));
    }
    felt.style.setProperty('--cw', cw + 'px');
    felt.style.setProperty('--dw', dw + 'px');
    felt.style.setProperty('--sw', Math.round(sw) + 'px');
    felt.classList.toggle('bjm-dos', filas === 2);
    felt.classList.toggle('bjm-movil', mv);
    felt.classList.toggle('bjm-chica', cw < 48);
    requestAnimationFrame(() => { const mid = el.querySelector('[data-mid]'); if (mid) felt.classList.toggle('bjm-apretada', mid.clientHeight < 100) });
    return { cw, dw, sw };
  }
  // las cartas de una mano se pisan lo justo para caber en su asiento
  function ajusta(hand, w, n, max) {
    const ov = n > 1 ? Math.min(w * 0.46, Math.max(w * 0.2, (max - w) / (n - 1))) : w;
    hand.style.setProperty('--ov', Math.round(w - ov) + 'px');
  }

  function pinta(d, inicial) {
    if (!el) return;
    el.classList.remove('err');
    const f = fase(d), r = d.ronda, rid = r && f !== 'espera' ? r.id : null;
    const manos = rid ? d.manos : [], sinAnim = inicial || quieto();
    const { cw, dw, sw } = medidas(d);
    // ronda nueva o mesa sin ronda: fuera las cartas de antes
    if (V.ronda !== rid) { barre(!sinAnim && V.ronda != null); V = { ronda: rid, seats: {}, banca: [], tapada: false } }
    const antes = new Map();
    if (!sinAnim) el.querySelectorAll('.bjm-card').forEach((c) => antes.set(c, c.getBoundingClientRect()));
    asientos(d, manos, f, sinAnim);
    // cartas nuevas de cada asiento
    const nuevas = [];                                                            // { e, s (0 = banca), i, flip }
    for (const m of manos) {
      const seat = el.querySelector(`.bjm-seat[data-s="${m.asiento}"]`), hand = seat.querySelector('[data-h]');
      const prev = V.seats[m.asiento] || [];
      m.cartas.forEach((c, i) => { if (i >= prev.length) { const e = cartaEl(c); hand.appendChild(e); nuevas.push({ e, s: m.asiento, i }) } });
      V.seats[m.asiento] = m.cartas.slice();
      ajusta(hand, cw, m.cartas.length, Math.max(cw, sw - 10));
    }
    // la banca: su segunda carta va tapada mientras se juega
    const dh = el.querySelector('[data-dh]');
    let volteo = null;
    if (rid) {
      const banca = r.banca, tapada = !!r.tapada, prev = V.banca, cards = [...dh.children];
      banca.forEach((c, i) => {
        if (i < prev.length) return;
        if (i === 1 && V.tapada && cards[1]) { volteo = cards[1]; return }      // la tapada ya estaba: se le da la vuelta
        const bjBanca = i === 1 && r.estado === 'fin' && banca.length === 2 && prev.length < 2 && !tapada;
        const e = cartaEl(bjBanca ? null : c); dh.appendChild(e);
        if (bjBanca) { e._sig = c; nuevas.push({ e, s: 0, i, tapada: true }); volteo = e } else nuevas.push({ e, s: 0, i });
      });
      if (tapada && prev.length < 2 && !V.tapada) { const e = cartaEl(null); dh.appendChild(e); nuevas.push({ e, s: 0, i: 1, tapada: true }) }
      V.banca = banca.slice(); V.tapada = tapada;
    }
    ajusta(dh, dw, dh.children.length, Math.max(dw, dw * 3.4));
    // las ya puestas se hacen sitio (las manos van centradas)
    if (!sinAnim) antes.forEach((r0, c) => {
      if (!c.isConnected) return;
      const r1 = c.getBoundingClientRect(), dx = r0.left - r1.left, dy = r0.top - r1.top;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) c.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 300, easing: EASE });
    });
    // orden de reparto: primera carta de cada asiento y de la banca, segunda de cada uno, despues lo pedido y al final la banca
    const orden = (x) => (x.i < 2 ? x.i * 100 + (x.s === 0 ? 99 : x.s) : x.s === 0 ? 1000 + x.i : 300 + x.s * 20 + x.i);
    nuevas.sort((a, b) => orden(a) - orden(b));
    const reparto = nuevas.filter((x) => x.i < 2).length > 2;
    const extra = volteo ? nuevas.filter((x) => x.s === 0 && x.i >= 2) : [];          // lo que pide la banca va despues de su volteo
    const cola = nuevas.filter((x) => !extra.includes(x));
    const finCartas = {};
    let t = 0, tFin = 0;
    for (const x of cola) {
      if (!sinAnim) { vuela(x.e, t, !x.tapada); setTimeout(() => suena('carta'), t + 80) }
      if (x.s) finCartas[x.s] = t + VUELO;
      tFin = Math.max(tFin, t + VUELO);
      t += reparto && x.i < 2 ? PASO : x.s === 0 ? 560 : 380;
    }
    if (volteo) {
      const c = volteo._sig != null ? volteo._sig : r.banca[1];
      if (sinAnim) { destapa(volteo, c, 0, true); extra.forEach((x) => x.e.getAnimations().forEach((a) => a.cancel())) }
      else {
        const tv = tFin + 150;
        destapa(volteo, c, tv, false);
        let tb = tv + 620;
        tFin = tv + 520;
        for (const x of extra) { vuela(x.e, tb, true); const tt = tb; setTimeout(() => suena('carta'), tt + 80); tFin = tb + VUELO; tb += 560 }
      }
    }
    const dur = sinAnim || !(cola.length || volteo) ? 0 : tFin + 150;
    // lo que se ve cuando caen las cartas: valores, banca, resultados y fichas
    const hayFin = !!(r && r.estado === 'fin' && rid);
    textos(d, f, manos, sinAnim ? null : finCartas, dur);
    if (dur > 0) {
      S.anim++;
      S.fx = volteo ? 'banca' : reparto ? 'reparto' : 'carta';
      if (hayFin) S.refrescar = true;
      setTimeout(() => {
        S.anim--;
        if (S.anim === 0) S.fx = null;
        if (hayFin) resultados(d, manos, true, true);
        centro(); pintaCtl();
        if (S.refrescar && S.anim === 0) { S.refrescar = false; S.saldo = D ? D.saldo : S.saldo; pintaCtl(true); if (ctx.refresh) ctx.refresh(); S.rankRonda = d.ronda && d.ronda.id; if (hooks.rank) hooks.rank() }
        if (S.pend && S.anim === 0) { const p = S.pend; S.pend = null; recibe(p) }
      }, dur);
    } else {
      if (hayFin) resultados(d, manos, false, !inicial);
      if (hayFin && !inicial && S.rankRonda !== rid) { S.rankRonda = rid; if (hooks.rank) hooks.rank() }
    }
    // el turno: un aviso cuando te toca
    const turnoK = r && r.estado === 'turnos' ? r.id + ':' + r.turno : null;
    if (turnoK && turnoK !== S.turnoVisto && turnoMio(d) && !inicial) setTimeout(() => suena('turno'), dur);
    S.turnoVisto = turnoK;
    centro(); pintaCtl(); tic();
  }

  function vuela(e, delay, conCara) {
    const z = el.querySelector('[data-shoe]').getBoundingClientRect(), r = e.getBoundingClientRect();
    const dx = z.left + z.width / 2 - (r.left + r.width / 2), dy = z.top + z.height / 2 - (r.top + r.height / 2);
    e.animate([{ transform: `translate(${dx}px,${dy}px) rotate(-16deg) scale(.72)`, opacity: 0 }, { opacity: 1, offset: 0.12 }, { transform: 'none', opacity: 1 }], { duration: VUELO, delay, easing: EASE, fill: 'backwards' });
    if (conCara) e.querySelector('.bjm-ci').animate([{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(180deg)', offset: 0.42 }, { transform: 'rotateY(0deg)' }], { duration: VUELO, delay, easing: 'ease-out', fill: 'backwards' });
  }
  function destapa(e, c, delay, ya) {
    const ci = e.querySelector('.bjm-ci');
    const pon = () => { e._c = c; e.classList.toggle('rd', rojo(c)); e.querySelector('.bjm-cf').innerHTML = caraHtml(c); ci.style.transform = '' };
    if (ya) { pon(); return }
    setTimeout(() => {
      if (!e.isConnected) return;
      pon();
      ci.animate([{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(0deg)' }], { duration: 520, easing: 'ease-in-out' });
      e.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-14px) scale(1.06)', offset: 0.5 }, { transform: 'translateY(0)' }], { duration: 520, easing: 'ease-in-out' });
      suena('carta');
    }, delay);
  }
  // fin de ronda: las cartas de antes se recogen hacia el mazo
  function barre(anima) {
    const cs = [...el.querySelectorAll('.bjm-card')];
    el.querySelectorAll('.bjm-seat').forEach((s) => { setHtml(s.querySelector('[data-res]'), ''); setTxt(s.querySelector('[data-v]'), '', 'bjm-pill num'); s.classList.remove('gano', 'perdio') });
    setTxt(el.querySelector('[data-dv]'), '');
    if (!anima || !cs.length) { cs.forEach((c) => c.remove()); return }
    const z = el.querySelector('[data-shoe]').getBoundingClientRect();
    cs.forEach((c, k) => {
      const r = c.getBoundingClientRect(), cl = c.cloneNode(true), felt = el.querySelector('[data-felt]'), fr = felt.getBoundingClientRect();
      cl.classList.add('bjm-fly'); cl.style.left = r.left - fr.left + 'px'; cl.style.top = r.top - fr.top + 'px'; cl.style.width = r.width + 'px'; cl.style.height = r.height + 'px';
      felt.appendChild(cl); c.remove();
      cl.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${z.left - r.left}px,${z.top - r.top}px) rotate(12deg) scale(.6)`, opacity: 0 }], { duration: 420, delay: k * 18, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' }).finished.then(() => cl.remove(), () => cl.remove());
    });
  }

  // los asientos: quien esta, su apuesta y si le toca
  function asientos(d, manos, f, sinAnim) {
    const r = d.ronda, mv = movil(), ocup = d.asientos.map((a) => a.asiento);
    const vis = [];
    for (let s = 1; s <= NA; s++) if (!mv || ocup.includes(s)) vis.push(s);
    for (let s = 1; s <= NA; s++) {
      const seat = el.querySelector(`.bjm-seat[data-s="${s}"]`), a = d.asientos.find((x) => x.asiento === s), m = manos.find((x) => x.asiento === s);
      const m0 = manos.find((x) => x.asiento === s), yo = (a && a.player === ctx.me) || (!a && m0 && m0.player === ctx.me), turno = r && r.estado === 'turnos' && r.turno === s && f === 'turnos';
      const k = vis.indexOf(s), mid = (vis.length - 1) / 2, dist = vis.length > 1 ? Math.abs(k - mid) / Math.max(1, mid) : 0;
      seat.style.setProperty('--y', (mv ? 0 : -Math.round(dist * dist * 34)) + 'px');
      seat.hidden = k < 0;
      seat.classList.toggle('libre', !a); seat.classList.toggle('yo', !!yo); seat.classList.toggle('turno', !!turno);
      seat.classList.toggle('activa', !!(turno && yo));
      const nb = seat.querySelector('[data-nb]'), orden = ordenMio(d);
      setTxt(nb, yo && orden.length > 1 ? String(orden.indexOf(s) + 1) : '');
      seat.classList.toggle('con', !!m); seat.classList.toggle('fuera', !!(a && !m && f === 'turnos'));
      const who = seat.querySelector('.bjm-who');
      who.disabled = !!a && !yo;
      who.dataset.bjm = a ? (yo ? 'yo' : 'nada') : 'sit';
      const avEl = seat.querySelector('[data-av]'), nm = seat.querySelector('[data-n]');
      const pk = a ? a.player : '';
      if (avEl._p !== pk) { avEl._p = pk; avEl.innerHTML = a ? av(a.player) : '<span class="bjm-plus">+</span>' }
      nm.toggleAttribute('data-notr', !!a && !yo);
      setTxt(nm, a ? nom(a.player) : 'Libre');
      // la apuesta en su circulo
      const ch = seat.querySelector('[data-ch]'), amt = seat.querySelector('[data-a]');
      const tot = m ? m.total : 0;
      if (ch._n !== tot) {
        const nuevo = tot > (ch._n || 0) && !sinAnim;
        ch._n = tot; ch.innerHTML = tot ? fichasHtml(tot) : '';
        if (nuevo && tot) { ch.querySelectorAll('.bjm-ch').forEach((c, i) => c.animate([{ transform: 'translateY(46px) scale(.8)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 380, delay: i * 50, easing: EASE, fill: 'backwards' })); suena('ficha') }
      }
      setTxt(amt, tot ? N(tot) : '');
      if (!m) { const v = seat.querySelector('[data-v]'); setTxt(v, '', 'bjm-pill num'); }
    }
  }
  // valores de cada mano (cuando han caido sus cartas) y de la banca
  function textos(d, f, manos, finCartas, dur) {
    const r = d.ronda;
    for (const m of manos) {
      const v = el.querySelector(`.bjm-seat[data-s="${m.asiento}"] [data-v]`);
      const txt = m.estado === 'blackjack' ? 'BJ' : m.estado === 'pasada' ? String(m.valor) : m.estado === 'apuesta' ? '' : String(m.valor);
      const cls = 'bjm-pill num' + (m.estado === 'blackjack' ? ' bj' : m.estado === 'pasada' ? ' pas' : m.valor === 21 ? ' v21' : '') + (m.doblada ? ' dob' : '') + (m.auto ? ' auto' : '');
      const at = finCartas && finCartas[m.asiento] != null ? finCartas[m.asiento] : 0;
      if (at > 0) setTimeout(() => setTxt(v, txt, cls), at); else setTxt(v, txt, cls);
    }
    const dv = el.querySelector('[data-dv]');
    const vb = r && f !== 'espera' ? (r.estado === 'fin' ? String(r.valor_banca) : r.banca.length ? String(r.valor_banca) : '') : '';
    if (dur > 0 && r && r.estado === 'fin') { setTxt(dv, ''); setTimeout(() => setTxt(dv, vb), dur - 200) } else setTxt(dv, vb);
  }
  // resultado de cada asiento: cartel y fichas
  function resultados(d, manos, anima, sonar) {
    for (const m of manos) {
      if (!m.resultado) continue;
      const seat = el.querySelector(`.bjm-seat[data-s="${m.asiento}"]`), res = seat.querySelector('[data-res]');
      const g = m.pago - m.total;
      const h = m.resultado === 'blackjack' ? `<span class="bjm-rs bj"><em>Blackjack</em><b class="num">▲ ${N(g)}</b></span>`
        : m.resultado === 'gana' ? `<span class="bjm-rs win"><em>Gana</em><b class="num">▲ ${N(g)}</b></span>`
        : m.resultado === 'empate' ? '<span class="bjm-rs eq"><em>Empata</em></span>'
        : `<span class="bjm-rs lose"><em>${m.estado === 'pasada' ? 'Se pasa' : 'Pierde'}</em><b class="num">▼ ${N(m.total)}</b></span>`;
      if (res._h !== h) {
        setHtml(res, h);
        if (anima && !quieto()) {
          res.firstElementChild.animate([{ opacity: 0, transform: 'translateY(8px) scale(.8)' }, { opacity: 1, transform: 'scale(1.08)', offset: 0.6 }, { opacity: 1, transform: 'none' }], { duration: 480, easing: EASE });
          const chs = [...seat.querySelectorAll('[data-ch] .bjm-ch')];
          if (m.resultado === 'pierde') chs.forEach((c, i) => c.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(-70px) scale(.8)', opacity: 0 }], { duration: 520, delay: 200 + i * 40, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' }));
          else if (m.resultado !== 'empate') chs.forEach((c, i) => c.animate([{ transform: 'none' }, { transform: 'translateY(-10px)' }, { transform: 'none' }], { duration: 420, delay: i * 50 }));
        }
      }
      seat.classList.toggle('gano', m.resultado === 'gana' || m.resultado === 'blackjack');
      seat.classList.toggle('perdio', m.resultado === 'pierde');
    }
    const mis = misManos(d).filter((m) => m.resultado), neto = mis.reduce((a, m) => a + m.pago - m.total, 0);
    const mejor = mis.filter((m) => m.pago > m.total).sort((a, b) => (b.pago - b.total) - (a.pago - a.total))[0];
    if (sonar && mis.length && resultados.dicho !== d.ronda.id) { resultados.dicho = d.ronda.id; suena(neto < 0 ? 'perder' : neto === 0 ? 'clic' : 'cobrar') }
    if (anima && mejor && !quieto()) brillo(mejor.resultado === 'blackjack', mejor.asiento);
  }
  function brillo(fuerte, asiento) {
    const felt = el.querySelector('[data-felt]'), s = el.querySelector(`.bjm-seat[data-s="${asiento}"]`);
    felt.animate([{ filter: 'brightness(1)' }, { filter: `brightness(${fuerte ? 1.32 : 1.16})` }, { filter: 'brightness(1)' }], { duration: 900 });
    const fr = felt.getBoundingClientRect(), sr = s ? s.getBoundingClientRect() : null;
    confeti(felt, { n: fuerte ? 110 : 50, x: sr ? sr.left - fr.left + sr.width / 2 : null, y: sr ? sr.top - fr.top + sr.height * 0.4 : null, cols: fuerte ? ['#f2c14e', '#ffdc85', '#fff'] : undefined });
  }
  // confeti contenido en el tapete: un lienzo que solo vive lo que dura el chorro
  const rnd = (a, b) => a + Math.random() * (b - a);
  function confeti(host, o = {}) {
    if (quieto() || !host) return;
    const cv = document.createElement('canvas'); cv.className = 'bjm-fx'; host.appendChild(cv);
    const w = host.clientWidth, h = host.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = w * dpr; cv.height = h * dpr;
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const cols = o.cols || ['#f2c14e', '#ffdc85', '#2bd47d', '#f4f2ec'], ox = o.x == null ? w / 2 : o.x, oy = o.y == null ? h * 0.6 : o.y;
    const P = Array.from({ length: o.n || 50 }, () => { const a = rnd(-Math.PI * 0.92, -Math.PI * 0.08), v = rnd(160, 460); return { x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: rnd(2.5, 5), rot: rnd(0, 6), vr: rnd(-9, 9), c: cols[(Math.random() * cols.length) | 0], life: rnd(0.9, 1.6), w: rnd(0.5, 1) } });
    const t0 = performance.now(); let last = t0;
    const paso = (now) => {
      const dt = Math.min(0.04, (now - last) / 1000), e = (now - t0) / 1000; last = now; g.clearRect(0, 0, w, h); let vivo = 0;
      for (const p of P) {
        p.vy += 900 * dt; p.vx *= 0.992; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        const k = 1 - e / p.life; if (k <= 0) continue; vivo++;
        g.save(); g.globalAlpha = Math.min(1, k * 1.6); g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = p.c; g.fillRect(-p.r, -p.r * p.w, p.r * 2, p.r * 2 * p.w); g.restore();
      }
      if (vivo && cv.isConnected) requestAnimationFrame(paso); else cv.remove();
    };
    requestAnimationFrame(paso);
  }

  // el centro del tapete: en que va la mesa y la cuenta atras
  function centro() {
    if (!el || !D || err) return;
    const d = D, f = fase(d), r = d.ronda, t = el.querySelector('[data-t]'), sub = el.querySelector('[data-sub]'), cd = el.querySelector('[data-cd]');
    let tt = '', ss = '', cls = 'bjm-t', ring = false;
    const sentados = d.asientos.length;
    if (S.fx === 'banca' && f === 'fin') { tt = 'Juega la banca' }
    else if (f === 'espera') { tt = 'Mesa abierta'; ss = misAsientos(d).length ? 'Apuesta para empezar una mano' : 'Siéntate y apuesta para empezar una mano' }
    else if (f === 'apuestas') { tt = 'Apuestas'; ss = 'Se reparte al acabar la cuenta'; ring = true }
    else if (f === 'turnos') {
      if (S.fx === 'reparto') tt = 'Repartiendo';
      else if (turnoMio(d)) { tt = 'Tu turno'; cls = 'bjm-t yo'; ss = ordenMio(d).length > 1 ? `Mano ${numDe(d, r.turno)} · Pide carta, plántate o dobla` : 'Pide carta, plántate o dobla'; ring = true }
      else { const m = d.manos.find((x) => x.asiento === r.turno); tt = m ? `Turno de ${nom(m.player)}` : 'Repartiendo'; ring = !!m }
    } else if (f === 'fin') {
      const b = r.banca, vb = r.valor_banca;
      tt = b.length === 2 && vb === 21 ? 'Blackjack de la banca' : vb > 21 ? 'La banca se pasa' : `La banca tiene ${vb}`;
      ss = 'Nueva mano en cuanto alguien apueste';
    }
    if (sentados === 0 && f === 'espera') ss = 'Siéntate y apuesta para empezar una mano';
    setTxt(t, tt, cls); setTxt(sub, ss);
    cd.classList.toggle('on', ring);
    tic();
  }
  // cuenta atras: solo corre con una ronda viva y la mesa a la vista
  function tic() {
    clearTimeout(S.tic);
    if (!el || !D || !visible()) return;
    const d = D, r = d.ronda, f = fase(d);
    if (!(f === 'apuestas' || (f === 'turnos' && S.fx !== 'reparto'))) { pintaTiempo(null); return }
    const fin = f === 'apuestas' ? ms(r.cierra) : ms(r.plazo) - 1000;            // el turno se ve acabar un segundo antes que en la base
    const total = f === 'apuestas' ? (d.cfg.apuestas || 12) * 1000 : (d.cfg.turno || 15) * 1000;
    const quedan = Math.max(0, fin - ahora());
    pintaTiempo(quedan, total, f === 'turnos' ? r.turno : null);
    if (quedan > 0) S.tic = setTimeout(tic, 250);
  }
  function pintaTiempo(quedan, total, turno) {
    const n = el.querySelector('[data-cdn]'), rr = el.querySelector('[data-cdr]');
    const L = 2 * Math.PI * 29;
    if (quedan == null) { setTxt(n, ''); rr.style.strokeDashoffset = 0; el.querySelectorAll('.bjm-seat .bjm-ring circle').forEach((c) => { c.style.strokeDashoffset = '' }); return }
    const p = total ? Math.min(1, quedan / total) : 0;
    setTxt(n, String(Math.ceil(quedan / 1000)));
    rr.style.strokeDasharray = L; rr.style.strokeDashoffset = (L * (1 - p)).toFixed(1);
    el.classList.toggle('prisa', quedan < 5000 && quedan > 0);
    const L2 = 2 * Math.PI * 22.5;
    el.querySelectorAll('.bjm-seat').forEach((s) => { const c = s.querySelector('.bjm-ring circle'); if (+s.dataset.s === turno) { c.style.strokeDasharray = L2; c.style.strokeDashoffset = (L2 * (1 - p)).toFixed(1) } else c.style.strokeDashoffset = '' });
    const mb = el.querySelector('[data-mibar]'); if (mb) mb.style.transform = `scaleX(${p.toFixed(3)})`;
    const ms2 = el.querySelector('[data-mis]'); if (ms2) setTxt(ms2, Math.ceil(quedan / 1000) + ' s');
  }

  /* ---------- los controles de debajo de la mesa ---------- */
  function apuestaHtml(dis) {
    const sal = saldo();
    return `<div class="bjm-bet"><div class="bjm-bl"><span class="lab">Apuesta</span><span class="bjm-sal"><span class="lab">Tu saldo</span><b class="num">${N(sal)}</b>${coin()}</span></div>
      <label class="jg-amt bjm-amtin"><input data-bjm-in inputmode="numeric" autocomplete="off" value="${N(S.stake)}" aria-label="Apuesta" ${dis ? 'disabled' : ''}>${coin()}</label>
      <div class="jg-q bjm-q">${[5, 10, 25, 50, 100].map((c) => `<button data-bjm="q" data-v="${c}" ${dis ? 'disabled' : ''}>${N(c)}</button>`).join('')}<button data-bjm="q" data-v="mitad" ${dis ? 'disabled' : ''}>1/2</button><button data-bjm="q" data-v="doble" ${dis ? 'disabled' : ''}>×2</button><button data-bjm="q" data-v="todo" ${dis ? 'disabled' : ''}>Máx</button></div></div>`;
  }
  function miasHtml(d) {
    const l = (d.mias || []).slice(0, 8);
    if (!l.length) return '<div class="bjm-mias"><span class="lab">Tus últimas manos</span><p class="bjm-nada">Todavía no has jugado en la mesa</p></div>';
    return `<div class="bjm-mias"><span class="lab">Tus últimas manos</span><div class="bjm-ml">${l.map((x) => {
      const g = x.pago - x.total;
      return `<span class="bjm-mi ${g > 0 ? 'win' : g < 0 ? 'lose' : 'eq'}">${g > 0 ? '▲ ' + N(g) : g < 0 ? '▼ ' + N(-g) : '='}</span>`;
    }).join('')}</div></div>`;
  }
  // una fila por cada mano mia: su numero (el mismo que en el tapete), su valor, como va y lo puesto
  function filaMano(d, m, o = {}) {
    const n = numDe(d, m.asiento), g = m.pago - m.total;
    const val = o.res ? (g > 0 ? '▲ ' + N(g) : g < 0 ? '▼ ' + N(-g) : '=') : o.apuesta ? N(m.total) : S.fx === 'reparto' ? '' : String(m.valor);
    const cls = o.res ? (g > 0 ? 'win' : g < 0 ? 'lose' : '') : m.estado === 'pasada' ? 'lose' : m.estado === 'blackjack' ? 'acc' : '';
    const txt = o.res ? resTxt(m) : o.apuesta ? '' : o.estado(m);
    const fin = o.apuesta ? `<button class="bjm-qm" data-bjm="quitar" data-v="${m.asiento}" ${S.ocupa ? 'disabled' : ''}>Quitar mano</button>` : o.res ? '' : `<em class="num">${N(m.total)}</em>`;
    return `<div class="bjm-mr ${o.on ? 'on' : ''}"><i class="bjm-nb num">${n}</i><b class="num ${cls}">${val}</b><span>${txt}</span>${fin}</div>`;
  }
  const resTxt = (x) => (x.resultado === 'blackjack' ? 'Blackjack' : x.resultado === 'gana' ? 'Ganas' : x.resultado === 'empate' ? 'Te devuelvo la apuesta' : x.estado === 'pasada' ? 'Te pasas' : 'Pierdes');
  function ctlHtml(d) {
    const f = fase(d), mias = misManos(d), mios = misAsientos(d), sentado = mios.length > 0, varias = ordenMio(d).length > 1;
    const max = (d.cfg && d.cfg.manos) || 3, libres = NA - d.asientos.length, llena = !sentado && libres <= 0;
    const enRonda = f === 'apuestas' ? mias.map((m) => m.asiento) : [];
    const libreMio = mios.find((s) => !enRonda.includes(s));
    const puedeOtra = sentado && mios.length < max && libres > 0;
    const ocupa = S.ocupa ? 'disabled' : '';
    const m = miMano(d);
    let izq = '', der = '', arriba = '';
    if ((f === 'turnos' || (f === 'fin' && S.refrescar)) && m) {
      const enBanca = f === 'fin', reparte = S.fx === 'reparto', act = !enBanca && !reparte ? turnoMio(d) : null;
      const activa = act && act.estado === 'juega' ? act : null;
      const estado = (x) => (enBanca ? 'Juega la banca' : reparte ? 'Repartiendo' : x.estado === 'blackjack' ? 'Blackjack' : x.estado === 'pasada' ? 'Te pasas'
        : x.estado === 'plantada' ? (x.auto ? 'Te plantas sin tiempo' : 'Te plantas') : activa && x.asiento === activa.asiento ? 'Te toca' : 'Esperas tu turno');
      const uno = activa || m;
      izq = varias
        ? `<div class="bjm-yo bjm-ms"><span class="lab">Tus manos</span>${mias.map((x) => filaMano(d, x, { estado, on: activa && x.asiento === activa.asiento })).join('')}</div>`
        : `<div class="bjm-yo"><span class="lab">Tu mano</span><div class="bjm-yv"><b class="num ${uno.estado === 'pasada' ? 'lose' : uno.estado === 'blackjack' ? 'acc' : ''}">${reparte ? '' : uno.valor}</b><span>${estado(uno)}</span></div>
        <span class="bjm-yap"><span class="lab">En juego</span> <b class="num">${N(uno.total)}</b>${coin()}</span></div>`;
      if (activa) {
        const puedeDoblar = activa.cartas.length === 2 && !activa.doblada && saldo() >= activa.stake;
        der = `<div class="bjm-acc bjm-3">${varias ? `<p class="bjm-cual"><span>Juegas la mano</span> <i class="bjm-nb num">${numDe(d, activa.asiento)}</i></p>` : ''}<button class="go" data-bjm="pedir" ${ocupa}>Pedir carta</button><button class="go ghost" data-bjm="plantar" ${ocupa}>Plantarse</button>${activa.cartas.length === 2 && !activa.doblada ? `<button class="go ghost" data-bjm="doblar" ${puedeDoblar && !S.ocupa ? '' : 'disabled'}><span>Doblar</span> <b class="num">${N(activa.stake)}</b></button>` : ''}<div class="bjm-tm"><div class="bjm-bar"><i data-mibar></i></div><p class="bjm-mis"><b class="num" data-mis></b> <span>para decidir</span></p></div></div>`;
      } else der = '<div class="bjm-acc bjm-wait"><p class="bjm-note">La banca juega cuando acaben todos</p></div>';
    } else if (f === 'turnos') {
      izq = `<div class="bjm-yo"><span class="lab">Mano en juego</span><p class="bjm-note">Apuesta para la siguiente mano</p></div>${apuestaHtml(false)}`;
      der = '<div class="bjm-acc"><button class="go" disabled>Siguiente mano</button></div>';
    } else {
      // apostar: lo ya puesto (cada mano con Quitar mano), la cantidad, Apostar y Anadir otra mano
      let previo = '';
      if (f === 'apuestas' && mias.length) {
        arriba = `<div class="bjm-ms h"><span class="lab">${mias.length > 1 ? 'Tus manos' : 'Tu apuesta'}</span>${mias.map((x) => filaMano(d, x, { apuesta: true })).join('')}</div>`;
      } else if (f === 'fin' && mias.some((x) => x.resultado)) {
        const hechas = mias.filter((x) => x.resultado), neto = hechas.reduce((a, x) => a + x.pago - x.total, 0);
        const big = (g) => `<b class="num ${g > 0 ? 'win' : g < 0 ? 'lose' : ''}">${g > 0 ? '▲ ' + N(g) : g < 0 ? '▼ ' + N(-g) : '='}</b>`;
        if (hechas.length > 1) arriba = `<div class="bjm-ms h bjm-last"><span class="lab">Tus manos</span>${hechas.map((x) => filaMano(d, x, { res: true })).join('')}<p class="bjm-tot">${big(neto)} <span>en total</span></p></div>`;
        else previo = `<div class="bjm-yo bjm-last"><span class="lab">Tu mano</span><div class="bjm-yv">${big(hechas[0].pago - hechas[0].total)}<span>${resTxt(hechas[0])}</span></div></div>`;
      }
      const todas = sentado && !libreMio;                                           // todas tus manos ya tienen apuesta
      izq = previo + (todas && !puedeOtra ? '' : apuestaHtml(llena));
      const principal = todas
        ? (puedeOtra ? `<button class="go" data-bjm="otra" data-go ${ocupa}><span>Otra mano</span> <span class="num" data-bjm-n>${N(S.stake)}</span></button>` : '')
        : `<button class="go" data-bjm="apostar" data-go ${llena || S.ocupa ? 'disabled' : ''}>${llena ? '<span>La mesa está llena</span>' : `<span>Apostar</span> <span class="num" data-bjm-n>${N(S.stake)}</span>`}</button>`;
      const nota = !todas && ordenMio(d).length > 1 ? `<p class="bjm-note">Va a tu mano ${numDe(d, libreMio)}</p>` : f === 'apuestas' && !mias.length ? '<p class="bjm-note">Entras en esta mano</p>' : '';
      const otra = !todas && puedeOtra ? '<button class="go ghost bjm-otra" data-bjm="otra" ' + ocupa + '><span>Añadir otra mano</span></button>' : '';
      const tope = todas && !puedeOtra ? (mios.length >= max ? `<p class="bjm-note">Ya tienes ${max} manos</p>` : '<p class="bjm-note">La mesa está llena</p>') : '';
      der = `<div class="bjm-acc">${principal}${nota}${otra}${tope}</div>`;
    }
    const pie = `<div class="bjm-pie">${miasHtml(d)}<div class="bjm-pd">${sentado ? `<button class="bjm-lev" data-bjm="levantarse" ${S.ocupa ? 'disabled' : ''}>Levantarse</button>` : ''}<span class="bjm-cnt"><b class="num">${d.asientos.length}</b> <span>de 7 asientos</span></span></div></div>`;
    return `${arriba}<div class="bjm-row">${izq ? `<div class="bjm-l">${izq}</div>` : ''}${der}</div><p class="jg-aviso bjm-aviso" data-aviso>${esc(S.aviso)}</p>${pie}`;
  }
  function pintaCtl(fuerza) {
    if (!el || !D || err) return;
    const box = el.querySelector('[data-ctl]'), foco = document.activeElement;
    if (foco && box.contains(foco) && foco.matches('input')) return;            // escribiendo la cantidad: no se toca
    const h = ctlHtml(D), sig = h + '|' + saldo();
    if (!fuerza && sig === S.ctlSig) return;
    S.ctlSig = sig; box.innerHTML = h; tr(box); tic();
  }
  function goN() { el.querySelectorAll('[data-bjm-n]').forEach((e) => (e.textContent = N(S.stake))) }

  /* ---------- acciones ---------- */
  async function onClick(b) {
    const a = b.dataset.bjm;
    if (a === 'q') return cantidad(b.dataset.v);
    if (a === 'nada') return;
    if (S.ocupa) return;
    const fn = { apostar: 'bjm_apostar', otra: 'bjm_otra_mano', quitar: 'bjm_quitar', sit: 'bjm_sentarse', levantarse: 'bjm_levantarse', pedir: 'bjm_pedir', plantar: 'bjm_plantarse', doblar: 'bjm_doblar' }[a];
    if (!fn) return;
    let args = {};
    if (a === 'apostar' || a === 'otra') {
      if (!(S.stake >= 1)) return falla({ message: 'Pon una cantidad' });
      if (S.stake > saldo()) return falla({ message: `No tienes tanto: te quedan ${N(saldo())}` });
      args = { p_stake: S.stake };
    }
    if (a === 'sit') args = { p_asiento: +b.dataset.v };                       // un asiento libre: te sientas (otra mano mas, hasta 3)
    if (a === 'quitar' && b.dataset.v) args = { p_asiento: +b.dataset.v };
    S.ocupa = true; S.aviso = ''; pintaCtl(true);
    const t0 = Date.now();
    try {
      const { data, error } = await ctx.db.rpc(fn, args);
      if (error) throw error;
      reloj(data, t0);
      S.saldo = data.saldo; S.ocupa = false;
      recibe(data);
      if (a === 'apostar' || a === 'otra' || a === 'quitar' || a === 'doblar' || a === 'levantarse') { if (ctx.refresh && !S.anim) ctx.refresh() }
    } catch (e) { S.ocupa = false; falla(e); carga() }
    finally { S.ocupa = false; pintaCtl() }
  }
  function cantidad(v) {
    const sal = Math.max(0, saldo());
    S.stake = v === 'mitad' ? Math.max(1, Math.floor(S.stake / 2)) : v === 'doble' ? Math.min(MAX(), S.stake * 2) : v === 'todo' ? Math.max(1, Math.min(MAX(), sal)) : +v;
    guarda('bj-stake', S.stake);
    const i = el.querySelector('[data-bjm-in]'); if (i) i.value = N(S.stake);
    goN();
  }

  /* ---------- tiempo real ---------- */
  function escucha() {
    if (S.chan || !ctx || !ctx.db || !ctx.db.channel) return;
    try {
      S.chan = ctx.db.channel('bj-mesa').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bjm_pulso' }, () => {
        clearTimeout(S.tRt); S.tRt = setTimeout(carga, 40 + Math.random() * 160);
      }).subscribe();
    } catch { S.chan = null }
  }
  function para() {
    S.on = false;
    clearTimeout(S.tPoll); clearTimeout(S.tPlazo); clearTimeout(S.tRt); clearTimeout(S.tic);
    if (S.chan) { try { ctx.db.removeChannel(S.chan) } catch {} S.chan = null }
  }

  /* ---------- la pestana Blackjack llama a esto ---------- */
  window.GM_BJMESA = {
    montar(hueco, c, h) {
      ctx = c; hooks = h || {};
      if (!el) crea();
      if (hueco && hueco !== el) hueco.replaceWith(el);
      if (!S.refrescar && S.anim === 0 && c.saldo != null && S.saldo !== c.saldo && !S.ocupa) { S.saldo = c.saldo; pintaCtl() }
      if (!S.on) { S.on = true; escucha(); carga(); return }
      if (Date.now() - S.ultima > 1500) carga(); else { programa(); tic() }
    },
    para,
    ocupado: () => S.anim > 0 || S.refrescar,
    recarga: () => carga(),
  };
})();
