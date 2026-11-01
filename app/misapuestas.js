// Mis apuestas (PM, 01-11: "en my bets lo primero que salga es las tuyas activas, luego ya las stats y el resto, y el grafico
// y in play y todo no me gusta tampoco mucho, esta mal hecho, haz 1 solo diseno currado y bonito").
// Tres partes, en este orden:
//  1. En juego: tus apuestas abiertas, sueltas y combinadas, las de en directo primero (marcador, mapa o minuto y como vas)
//     y luego las que faltan por empezar con su cuenta atras. Cada una con lo apostado, la cuota y lo que cobrarias, y su
//     boton: Cancelar antes de empezar (cancelBtn de app.js) o cancelar en directo (cash out: lo pone extras.js en
//     [data-cobet]; el de las combinadas lo da combinadas.js con GM_CMB.boton). Al lado (abajo en movil), el resumen.
//     Debajo, los retos 1 contra 1 que siguen vivos.
//  2. Tus numeros: beneficio, aciertos, racha y mejor cuota, con la curva de beneficio (sueltas y combinadas).
//  3. Historial: lo resuelto con la tarjeta de resultado.js (franja de color, escudo de fondo, cuadrados), sueltas y
//     combinadas juntas, con filtros (S.bf, S.bsp) y paginas (S.bp) de app.js. Al final, los retos ya acabados.
// Va aparte, como inicio.js: app.js lo pinta desde apuestas() con GM_MIS.html() y aqui se usa lo global de app.js.
// No pide nada nuevo a la base.
'use strict';
(function () {
  const g = (f, d) => { try { return f() } catch { return d } };
  const t2 = (x) => (typeof x === 'number' ? x : Date.parse(x || '')) || 0;
  const tr = (el) => { if (window.GM_LANG && el) g(() => GM_LANG.traduce(el)) };
  const POR = 6;                                                        // PM, 01-11: flechas despues de 6

  /* ---------- combinadas (las carga combinadas.js) ---------- */
  const combos = () => g(() => (window.GM_CMB && GM_CMB.todas()) || null, null);
  const misCombos = () => { const t = combos(); return t ? t.filter((c) => c.player === ME) : null };
  const legsDe = (c) => (c.combo_legs || []).slice().sort((a, b) => t2(a.matches && a.matches.starts_at) - t2(b.matches && b.matches.starts_at));
  const mpN = (ls) => { const k = {}; for (const l of ls || []) k[l.match_id] = (k[l.match_id] || 0) + 1; return Object.values(k).filter((v) => v > 1).reduce((t, v) => t + v, 0) };   // db/067: cuantas van del mismo partido que otra
  const pata = (l) => { const m = l.matches || {};
    if (l.result === 'won') return 'ok'; if (l.result === 'lost') return 'ko'; if (l.result === 'void') return 'nul';
    if (m.status === 'live' || (m.status === 'scheduled' && t2(m.starts_at) <= Date.now())) return 'vivo'; return 'pend' };
  const nombrePata = (l) => { const m = l.matches || {}; return l.pick === '1' ? m.home : l.pick === '2' ? m.away : l.pick === 'X' ? 'Empate' : pn({ a: m.home, b: m.away }, l.pick) };
  const ladoPata = (p) => (window.GM_MK && GM_MK.es(p) ? GM_MK.lado(p) : p);
  const netoC = (c) => (c.status === 'won' || c.status === 'cashout' ? (c.payout || 0) - c.stake : c.status === 'lost' ? -c.stake : 0);
  const stC = (c) => (c.status === 'cashout' ? ((c.payout || 0) > c.stake ? 'won' : 'lost') : c.status);   // como las sueltas retiradas (app.js)

  /* ---------- piezas ---------- */
  const IC_RELOJ = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>';
  const IC_CMB = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8.5h11a1.5 1.5 0 0 1 1.5 1.5v1.2a1.6 1.6 0 0 0 0 3.1V16a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 16v-1.7a1.6 1.6 0 0 0 0-3.1V10A1.5 1.5 0 0 1 5 8.5z"/><path d="M7.5 6h11A1.5 1.5 0 0 1 20 7.5v7"/></svg>';
  const IC_TICKET = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4z"/><path d="M14.5 6.5v11" stroke-dasharray="1.5 2"/></svg>';
  const PATA = { ok: '<path d="M2.5 6.3l2.3 2.3L9.5 3.8"/>', ko: '<path d="M3.5 3.5l5 5M8.5 3.5l-5 5"/>', nul: '<path d="M3.5 6h5"/>', pend: '<circle cx="6" cy="6" r="3.6"/>' };
  const cuadro = (lab, val, cls = '') => `<div class="${cls}"><span class="lab">${lab}</span><b>${val}</b></div>`;
  const fecha = (t) => `${WD(t)} ${DD(t)} ${MO(t)} · ${HM(t)}`;
  // cuando empieza, corto para la franja: hoy 17:15, mañana 08:00, lun 08:00 o lun 9 nov · 08:00
  const empieza = (t) => { const now = Date.now(), DIA = 864e5;
    if (DK(t) === DK(now)) return 'hoy ' + HM(t);
    if (DK(t) === DK(now + DIA)) return 'mañana ' + HM(t);
    if (t - now < 6 * DIA) return WD(t) + ' ' + HM(t);
    return fecha(t) };
  const fondo = (u, cara) => (u ? `<img class="mt-wm ${cara ? 'face' : ''}" src="${esc(u)}" alt="" loading="lazy" onerror="this.remove()">` : '');
  const flecha = (v) => (v > 0 ? '▲' : v < 0 ? '▼' : '');
  const VA = { gana: 'Vas ganando', pierde: 'Vas perdiendo', empata: 'Vas empatando' };

  /* ---------- 1. en juego ---------- */
  // como va una suelta en directo: 'gana', 'pierde', 'empata' o '' si no se sabe
  function comoVa(m, b, d) {
    if (window.GM_MK && GM_MK.es(b.p)) return g(() => GM_MK.va(m, b.p, [d.sa, d.sb]), '') || '';   // mercados nuevos (db/036)
    const l = vyLider(m, d); if (!l) return '';
    if (b.p === 'X') return l === 'X' ? 'gana' : 'pierde';
    return l === 'X' ? 'empata' : l === b.p ? 'gana' : 'pierde';
  }
  function banda(m, extra) {
    if (m.live) return '';
    const t = t2(m.at);
    if (m.status === 'final') return `<span class="mt-st">${IC_RELOJ}<span>Acabado</span></span>${extra || ''}`;
    if (t - NOW < 60e3) return `<span class="mt-st">${IC_RELOJ}<span>Empezando</span></span>${extra || ''}`;
    return `<span class="mt-st">${IC_RELOJ}<span>Empieza en</span> <b>${CD(t)}</b></span>${extra || ''}`;
  }
  // PM 01-11: "en my bets no sale el desafio que he hecho con Darkam; tendria que salir aunque no pudiera cancelarlo, para verlo":
  // cada reto 1 contra 1 vivo es una tarjeta mas de En juego (antes era una linea al final que en el movil no se veia)
  function reto(c, i) {
    const m = byId(c.m); if (!m) return '';
    if (window.GM_QUIEN) return GM_QUIEN.cartaReto(c, { i, ir: true });   // la tarjeta de duelo es la misma en Inicio, Mis apuestas y Directo (quien.js)
    const live = !!m.live, d = live ? vyDatos(m) : null, yo = c.from === MEK, riv = yo ? c.to : c.from;
    const mio = yo ? c.fp : c.tp, suyo = yo ? c.tp : c.fp, nom = (k) => (k ? esc(fr(k).n) : 'Cualquiera');
    const eq = (s) => { const p = s === 'a' ? '1' : '2', sc = s === 'a' ? d && d.sa : d && d.sb, quien = mio === p ? 'Tú' : suyo === p ? nom(riv) : '';
      return `<div class="mt-eq ${mio === p ? 'mio' : ''}"><span class="mt-cr">${logo(m, s)}</span><span class="mt-nm"><b>${esc(s === 'a' ? m.a : m.b)}</b>${quien ? `<em>${quien}</em>` : ''}</span>${live && sc != null ? `<span class="mt-pts"><b>${sc}</b></span>` : ''}</div>` };
    const empate = mio === 'X' || suyo === 'X' ? `<p class="mt-pk"><i>★</i><b>Empate: ${mio === 'X' ? 'Tú' : nom(riv)}</b></p>` : '';
    const estado = c.st === 'pending' ? (c.ab ? 'Esperando a que entre alguien' : `Esperando a que ${nom(riv)} acepte`) : '';
    const rivAv = riv ? av(riv, 'xl') : '<span class="av xl rt-any"><svg viewBox="0 0 24 24"><circle cx="9" cy="9" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6.2a3 3 0 0 1 0 5.6M17.5 14a5 5 0 0 1 3 5"/></svg></span>';
    const head = live ? `<span class="mt-st"><i class="mt-pt"></i><span>En vivo</span></span>` : banda(m, `<span class="mt-when">${empieza(t2(m.at))}</span>`);
    return `<article class="mt mt-r ${live ? 'live' : ''}" data-goto="${esc(m.id)}" style="--i:${i};--sc:${SPC[m.s] || 'var(--acc)'}">
      <header class="mt-band">${head}<span class="mt-bar"><i style="width:${live ? 100 : 40}%"></i></span></header>
      <div class="mt-rv"><span class="mt-rf">${av(MEK, 'xl')}<b>Tú</b></span><span class="qn-seal"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5"/></svg><span>Reto</span> ${g(() => GM_RETOS.nvm(c), '1v1')}</span><span class="mt-rf">${rivAv}<b>${nom(riv)}</b></span></div>
      ${estado ? `<p class="mt-rs">${estado}</p>` : ''}
      <div class="mt-m">${eq('a')}${eq('b')}</div>${empate}
      <div class="mt-n">${cuadro('Pones', N(c.stake) + coin())}${cuadro('En juego', N(g(() => GM_RETOS.bote(c), c.stake * 2)) + coin())}${cuadro('Te llevas', N(g(() => GM_RETOS.pagoDe(c, MEK), c.stake * 2)) + coin(), 'hi')}</div>
      ${g(() => GM_RETOS.puedeRetirar(c), false) ? `<div class="mt-act">${GM_RETOS.retirarBtn(c)}</div>` : `<p class="mt-rt-no"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg><span>Sin cancelar · se paga al final</span></p>`}
    </article>`;
  }
  function suelta(b, i) {
    const m = byId(b.m); if (!m) return '';
    const live = !!m.live, d = live ? vyDatos(m) : null, mkp = !!(window.GM_MK && GM_MK.es(b.p));
    const lp = mkp ? GM_MK.lado(b.p) : b.p, va = live ? comoVa(m, b, d) : '';
    const lid = live && d.sa != null && d.sb != null ? (d.sa > d.sb ? 'a' : d.sa < d.sb ? 'b' : '') : '';
    const rondas = live && d.ra != null && d.rb != null;
    const eq = (s) => { const p = s === 'a' ? '1' : '2', mio = lp === p, sc = s === 'a' ? d && d.sa : d && d.sb;
      return `<div class="mt-eq ${mio ? 'mio' : ''}"><span class="mt-cr">${logo(m, s)}</span><span class="mt-nm"><b>${esc(s === 'a' ? m.a : m.b)}</b>${mio ? '<em>Tu apuesta</em>' : ''}</span>${live ? `<span class="mt-pts">${rondas ? `<small>${s === 'a' ? d.ra : d.rb}</small>` : ''}<strong class="${lid === s ? 'w' : ''}">${sc ?? '·'}</strong></span>` : ''}</div>` };
    const pk = b.p === 'X' ? '<p class="mt-pk"><i>★</i><b>Empate</b></p>' : mkp ? `<p class="mt-pk"><i>★</i><b data-notr>${esc(pn(m, b.p))}</b></p>` : '';
    const det = live ? (g(() => (window.GM_VIVO ? GM_VIVO.lineaTxt(m) : ''), '') || d.mapa || '') : '';
    // PM 01-11: "no se ve el tiempo del partido, solo el marcador": cuanto lleva jugandose (el futbol y la NBA ya traen su minuto en la cabecera)
    const lleva = live ? Math.max(0, Math.floor((Date.now() - t2(m.at)) / 60000)) : 0;
    const tiempo = live && lleva > 0 && lleva < 600 && !/Minuto /.test(det) && m.s !== 'b' ? `<span class="mt-lleva">Lleva ${lleva >= 60 ? Math.floor(lleva / 60) + ' h ' + String(lleva % 60).padStart(2, '0') + ' min' : lleva + ' min'}</span>` : '';
    const head = live
      ? `<span class="mt-st"><i class="mt-pt"></i><span>En vivo</span></span>${det ? `<span class="mt-det">${det.split(' · ').map((x) => `<span>${esc(x)}</span>`).join('<i>·</i>')}</span>` : ''}${va ? `<span class="mt-va ${va}">${VA[va]}</span>` : ''}`
      : banda(m, `<span class="mt-when">${empieza(t2(m.at))}</span>`);
    const t0 = t2(b.at), t1 = t2(m.at), fill = live ? 100 : Math.max(3, Math.min(100, ((NOW - t0) / Math.max(1, t1 - t0)) * 100));
    const puede = canCancel(b);
    const wm = lp === '1' ? m.la : lp === '2' ? m.lb : L[m.lg] && L[m.lg][1];
    return `<article class="mt ${live ? 'live' : ''}" data-goto="${esc(m.id)}" style="--i:${i};--sc:${SPC[m.s] || 'var(--acc)'}">
      ${fondo(wm, m.s === 'u' && (lp === '1' || lp === '2'))}
      <header class="mt-band">${head}<span class="mt-bar"><i style="width:${fill.toFixed(1)}%"></i></span></header>
      <div class="mt-meta"><img class="tl" src="${esc((L[m.lg] && L[m.lg][1]) || SP[m.s][1])}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><span class="lab ell">${esc(corto((L[m.lg] && L[m.lg][0]) || SP[m.s][0]))}</span>${dailyTag(m)}${tiempo}<span class="mt-no">${codigo(b)}</span></div>
      <div class="mt-m">${eq('a')}${eq('b')}</div>${pk}
      <div class="mt-n">${cuadro('Cuota', O(b.o))}${cuadro('Apostado', N(b.stake) + coin())}${cuadro('Cobraría', N(b.stake * b.o) + coin(), 'hi')}</div>
      ${puede || live ? `<div class="mt-act ${live ? 'co' : ''}" data-cobet="${b.id}">${puede ? cancelBtn(b) : ''}</div>` : ''}
    </article>`;
  }
  function combinada(c, i) {
    const ls = legsDe(c), hechas = ls.filter((l) => l.result === 'won').length, vivo = ls.some((l) => pata(l) === 'vivo');
    const sig = ls.find((l) => pata(l) === 'pend'), t = sig ? t2(sig.matches.starts_at) : 0;
    const head = vivo ? `<span class="mt-st"><i class="mt-pt"></i><span>En vivo</span></span><span class="mt-det"><span>${hechas} de ${ls.length} acertados</span></span>`
      : `<span class="mt-st">${IC_RELOJ}${t - NOW >= 60e3 ? `<span>Empieza en</span> <b>${CD(t)}</b>` : '<span>Empezando</span>'}</span><span class="mt-when">${hechas ? `${hechas} de ${ls.length} acertados` : t ? empieza(t) : ''}</span>`;
    const t0 = t2(c.created_at), t1 = t2(ls[0] && ls[0].matches && ls[0].matches.starts_at), fill = vivo || hechas ? 100 : Math.max(3, Math.min(100, ((NOW - t0) / Math.max(1, t1 - t0)) * 100));
    const cara = (l) => { const m = byId(l.match_id), lp = ladoPata(l.pick), s = (l.matches || {}).sport || 'f';
      return m && (lp === '1' || lp === '2') ? logo(m, lp === '1' ? 'a' : 'b') : `<img class="tl" src="${esc((m && L[m.lg] && L[m.lg][1]) || SP[s][1])}" alt="" loading="lazy">` };
    const fila = (l) => { const m = l.matches || {}, k = pata(l), sc = String(m.score || '').split(/\s+/)[0], mk = !!(window.GM_MK && GM_MK.es(l.pick));
      return `<div class="mt-leg ${k}"><span class="mt-ok">${PATA[k] ? `<svg viewBox="0 0 12 12">${PATA[k]}</svg>` : k === 'vivo' ? '<i class="mt-pt"></i>' : ''}</span><span class="mt-cr">${cara(l)}</span><span class="mt-lt"><b ${mk ? 'data-notr' : ''}>${esc(nombrePata(l))}</b><small>${esc(m.home || '')} ${esc(sc && (m.status === 'live' || m.status === 'final') ? sc : 'vs')} ${esc(m.away || '')}</small></span><span class="mt-q">${O(l.odds)}</span></div>` };
    const u = ls.map((l) => { const m = byId(l.match_id), lp = ladoPata(l.pick); return m ? (lp === '1' ? m.la : lp === '2' ? m.lb : null) : null }).find(Boolean);
    const boton = g(() => (window.GM_CMB && GM_CMB.boton ? GM_CMB.boton(c) : ''), '') || '';
    return `<article class="mt mt-c ${vivo ? 'live' : ''}" style="--i:${i}">
      ${fondo(u, false)}
      <header class="mt-band">${head}<span class="mt-bar"><i style="width:${fill.toFixed(1)}%"></i></span></header>
      <div class="mt-meta"><span class="mt-ci">${IC_CMB}</span><span class="lab ell">Combinada de ${ls.length}${mpN(ls) ? `<span class="mp-tag"> · ${mpN(ls)} del mismo partido</span>` : ''}</span><span class="mt-no">Nº C${String(c.id).padStart(5, '0')}</span></div>
      <div class="mt-legs">${ls.map(fila).join('')}</div>
      <div class="mt-n">${cuadro('Cuota', O(c.odds))}${cuadro('Apostado', N(c.stake) + coin())}${cuadro('Cobraría', N(c.stake * Number(c.odds)) + coin(), 'hi')}</div>
      <div class="mt-act ${boton ? '' : 'vacio'}" data-cmbact="${c.id}" data-h="${esc(boton)}">${boton}</div>
    </article>`;
  }
  // las combinadas cambian de boton (Cancelar, ¿Seguro?, cancelar en directo) sin repintar toda la pantalla: combinadas.js
  // llama aqui cada vez que pinta
  function cmb() {
    const cs = misCombos(); if (!cs) return;
    document.querySelectorAll('[data-cmbact]').forEach((el) => {
      const c = cs.find((x) => x.id === +el.dataset.cmbact); if (!c) return;
      const h = g(() => GM_CMB.boton(c), '') || '';
      if (el.dataset.h === h) return;
      el.dataset.h = h; el.innerHTML = h; el.classList.toggle('vacio', !h); tr(el);
    });
  }
  const vacio = () => `<div class="mis-vacio"><span class="mis-vacio-i">${IC_TICKET}</span><b>Nada en juego</b><p>Se apuesta en Partidos: toca una cuota y dale a Apostar.</p><button class="mis-ir" data-scr="partidos">Ir a Partidos</button></div>`;
  function enJuego() {
    const sueltas = ALL.filter((b) => b.k === MEK && b.st === 'open' && byId(b.m)).map((b) => ({ k: 'b', b, live: !!byId(b.m).live, t: t2(byId(b.m).at) }));
    const cs = misCombos();
    const comb = (cs || []).filter((c) => c.status === 'open').map((c) => { const ls = legsDe(c), sig = ls.find((l) => pata(l) === 'pend');
      return { k: 'c', c, live: ls.some((l) => pata(l) === 'vivo'), t: sig ? t2(sig.matches.starts_at) : 0 } });
    const retos = CH.filter((c) => GM_RETOS.dentro(c) && (c.st === 'pending' || c.st === 'accepted') && byId(c.m))
      .map((c) => ({ k: 'r', r: c, live: !!byId(c.m).live, t: t2(byId(c.m).at) }));
    const xs = [...sueltas, ...comb, ...retos].sort((a, b) => (b.live - a.live) || a.t - b.t);
    const puesto = xs.reduce((a, x) => a + (x.k === 'b' ? x.b.stake : x.k === 'r' ? x.r.stake : x.c.stake), 0), cobra = xs.reduce((a, x) => a + (x.k === 'b' ? x.b.stake * x.b.o : x.k === 'r' ? GM_RETOS.pagoDe(x.r, MEK) : x.c.stake * Number(x.c.odds)), 0);
    const vivas = xs.filter((x) => x.live).length, prox = xs.find((x) => !x.live && x.t > NOW);
    const cards = xs.map((x, i) => (x.k === 'b' ? suelta(x.b, i) : x.k === 'r' ? reto(x.r, i) : combinada(x.c, i))).join('');
    const proxTxt = !prox ? '' : prox.k === 'b' ? `${esc(byId(prox.b.m).a)} <i>vs</i> ${esc(byId(prox.b.m).b)}` : prox.k === 'r' ? `<span>Reto: ${esc(byId(prox.r.m).a)} <i>vs</i> ${esc(byId(prox.r.m).b)}</span>` : `<span>Combinada de ${legsDe(prox.c).length}</span>`;
    const resumen = `<aside class="mis-sum">
        <div class="mis-sum-a"><span class="lab">Tienes en juego</span><b class="num">${N(puesto)}${coin()}</b><small><span>${xs.length} ${xs.length === 1 ? 'apuesta' : 'apuestas'}</span>${vivas ? `<span> · </span><span>${vivas} en vivo</span>` : ''}</small></div>
        <div class="mis-sum-b"><span class="lab">Si aciertas todo</span><b class="num">${N(cobra)}${coin()}</b><small><span>${flecha(cobra - puesto)} ${N(Math.abs(cobra - puesto))}</span> <span>limpias</span></small></div>
        ${prox ? `<div class="mis-sum-c"><span class="lab">Lo próximo</span><p>${proxTxt}</p><small><span>empieza en</span> <b>${CD(prox.t)}</b></small></div>` : ''}
        <button class="mis-ir" data-scr="partidos">Ir a Partidos</button>
      </aside>`;
    return `<section class="mis-sec mis-ab">
      <div class="mis-h"><span class="mis-k">01</span><h2>En juego</h2><i>${xs.length}</i></div>
      <div class="mis-cols ${xs.length ? '' : 'solo'}"><div class="mis-main">${xs.length ? `<div class="mt-grid ${xs.length === 1 ? 'uno' : ''}">${cards}</div>` : cs ? vacio() : '<div class="mis-vacio mis-esp" aria-hidden="true"></div>'}</div>
        ${xs.length ? resumen : ''}</div>
    </section>`;
  }

  /* ---------- 2. tus numeros ---------- */
  function resueltas() {
    const out = [];
    for (const b of ALL) { if (b.k !== MEK || (b.st !== 'won' && b.st !== 'lost')) continue; const m = byId(b.m); if (!m) continue;
      out.push({ t: t2(b.set || b.at), st: b.st, v: neto(b), stake: b.stake, o: b.o, txt: pn(m, b.p), mk: !!(window.GM_MK && GM_MK.es(b.p)), sub: `${m.a} vs ${m.b}` }) }
    for (const c of misCombos() || []) { const s = stC(c); if (s !== 'won' && s !== 'lost') continue;
      out.push({ t: t2(c.settled_at || c.created_at), st: s, v: netoC(c), stake: c.stake, o: Number(c.odds), txt: `Combinada de ${legsDe(c).length}`, c: 1 }) }
    // PM 01-11: "en my bets los challenges tambien cuentan como apuestas, lo digo por las stats": un reto resuelto es una apuesta a cuota 2,00
    // (el que acierta se lleva lo de los dos); los devueltos o sin rival no cuentan
    // (ahora con la cuota real del reto: 2,00 en un 1v1, el bote entre los que aciertan si hay mas gente)
    for (const c of CH) { if (!GM_RETOS.dentro(c) || !/^won_/.test(c.st) || !c.set) continue;
      const gano = GM_RETOS.ganan(c).includes(MEK), m = byId(c.m), pay = GM_RETOS.pagoDe(c, MEK), rs = GM_RETOS.pl(c).filter((x) => x.k !== MEK), n = GM_RETOS.lados(c).length;
      const riv = (GM_RETOS.pl(c).find((x) => x.k === MEK) || {}).p, otros = GM_RETOS.pl(c).filter((x) => x.p !== riv), rk = (otros[0] || rs[0] || {}).k;
      out.push({ t: t2(c.set), st: gano ? 'won' : 'lost', v: gano ? pay - c.stake : -c.stake, stake: c.stake, o: GM_RETOS.cuotaEf(c, MEK) || 2, txt: `Reto contra ${g(() => fr(rk).n, '')}${otros.length > 1 ? ' +' + (otros.length - 1) : ''}`, mk: false, r: 1, sub: m ? `${m.a} vs ${m.b}` : '' }) }
    return out.sort((a, b) => a.t - b.t);
  }
  let CHART = null;   // la curva pintada: puntos y escala, para el recuadro que sale al pasar el dedo o el raton
  function curva(xs) {
    if (xs.length < 2) { CHART = null; return `<div class="mis-ch-v mis-ch-0"><p class="hint">La curva sale cuando tengas dos apuestas resueltas.</p></div>` }
    let acc = 0; const pts = [0, ...xs.map((x) => (acc += x.v))];
    const mov = matchMedia('(max-width:760px)').matches, ancho = matchMedia('(min-width:1181px)').matches, W = mov ? 360 : ancho ? 1100 : 720, H = mov ? 220 : ancho ? 300 : 260;
    const x0 = mov ? 40 : 56, x1 = W - (mov ? 58 : 76), yT = 18, yB = H - 30;
    const mx = Math.max(10, ...pts), mn = Math.min(-10, ...pts), X = (i) => x0 + ((x1 - x0) * i) / (pts.length - 1), Y = (v) => yT + ((mx - v) * (yB - yT)) / (mx - mn), z = Y(0);
    const line = pts.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' '), area = `${X(0).toFixed(1)},${z.toFixed(1)} ${line} ${X(pts.length - 1).toFixed(1)},${z.toFixed(1)}`;
    const fin = pts[pts.length - 1], fs = mov ? 11 : 12;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Tu beneficio"><defs>
      <clipPath id="mis-up"><rect x="0" y="0" width="${W}" height="${z.toFixed(1)}"/></clipPath><clipPath id="mis-dn"><rect x="0" y="${z.toFixed(1)}" width="${W}" height="${(H - z).toFixed(1)}"/></clipPath>
      <linearGradient id="mis-gu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2bd47d" stop-opacity=".34"/><stop offset="1" stop-color="#2bd47d" stop-opacity="0"/></linearGradient>
      <linearGradient id="mis-gd" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ef5b5b" stop-opacity=".34"/><stop offset="1" stop-color="#ef5b5b" stop-opacity="0"/></linearGradient></defs>`;
    for (const v of [mx, mn]) if (Math.abs(Y(v) - z) > 18) s += `<line x1="${x0}" x2="${x1}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="mis-gr"/><text x="${x0 - 10}" y="${(Y(v) + 4).toFixed(1)}" class="mis-ax" font-size="${fs}" text-anchor="end">${flecha(v)} ${N(Math.abs(v))}</text>`;
    s += `<line x1="${x0}" x2="${x1}" y1="${z.toFixed(1)}" y2="${z.toFixed(1)}" class="mis-zero"/><text x="${x0 - 10}" y="${(z + 4).toFixed(1)}" class="mis-ax" font-size="${fs}" text-anchor="end">0</text>`;
    s += `<polygon points="${area}" fill="url(#mis-gu)" clip-path="url(#mis-up)"/><polygon points="${area}" fill="url(#mis-gd)" clip-path="url(#mis-dn)"/>`;
    s += `<polyline points="${line}" class="mis-ln up" clip-path="url(#mis-up)"/><polyline points="${line}" class="mis-ln dn" clip-path="url(#mis-dn)"/>`;
    const r = pts.length > 40 ? 3 : 4.5;
    xs.forEach((x, i) => { s += `<circle cx="${X(i + 1).toFixed(1)}" cy="${Y(pts[i + 1]).toFixed(1)}" r="${r}" class="mis-pt ${x.st}"/>` });
    s += `<line class="mis-guia" x1="0" x2="0" y1="${yT}" y2="${yB}" style="display:none"/><circle class="mis-sel" r="7" cx="0" cy="0" style="display:none"/>`;
    s += `<text x="${(X(pts.length - 1) + 12).toFixed(1)}" y="${(Y(fin) + 5).toFixed(1)}" class="mis-fin ${fin > 0 ? 'up' : fin < 0 ? 'dn' : ''}" font-size="${mov ? 14 : 16}">${flecha(fin)} ${N(Math.abs(fin))}</text>`;
    s += `<text x="${x0}" y="${H - 6}" class="mis-ax" font-size="${fs}">${DD(xs[0].t)} ${MO(xs[0].t)}</text><text x="${x1}" y="${H - 6}" class="mis-ax" font-size="${fs}" text-anchor="end">${DD(xs[xs.length - 1].t)} ${MO(xs[xs.length - 1].t)}</text></svg>`;
    CHART = { W, H, x0, x1, n: pts.length, X, Y, pts, xs };
    return `<div class="mis-ch-v" style="aspect-ratio:${W}/${H}">${s}<div class="mis-tip" hidden></div></div>`;
  }
  function numeros() {
    const xs = resueltas(), ganadas = xs.filter((x) => x.st === 'won');
    const ben = xs.reduce((a, x) => a + x.v, 0), apostado = xs.reduce((a, x) => a + x.stake, 0), roi = apostado ? Math.round((ben / apostado) * 100) : 0;
    let racha = 0; for (let i = xs.length - 1; i >= 0 && xs[i].st === xs[xs.length - 1].st; i--) racha++;
    const ult = xs.length ? xs[xs.length - 1].st : '', mejor = ganadas.length ? Math.max(...ganadas.map((x) => x.o)) : 0;
    let acc = 0, alto = 0, bajo = 0; for (const x of xs) { acc += x.v; alto = Math.max(alto, acc); bajo = Math.min(bajo, acc) }
    const rachaTxt = !racha ? 'sin resultados aún' : racha === 1 ? (ult === 'won' ? 'la última, ganada' : 'la última, perdida') : ult === 'won' ? 'ganadas seguidas' : 'perdidas seguidas';
    const tiles = `<div class="mis-tiles">
        <div class="mis-tl ben ${ben > 0 ? 'pos' : ben < 0 ? 'neg' : ''}"><span class="lab">Beneficio</span><b class="num">${ben ? `<i>${flecha(ben)}</i>` : ''}${N(Math.abs(ben))}${coin()}</b><small>${xs.length ? `<span>ROI ${flecha(roi)} ${Math.abs(roi)}%</span><span class="sep"> · </span><span>${xs.length} ${xs.length === 1 ? 'resuelta' : 'resueltas'}</span>` : '<span>sale con la primera resuelta</span>'}</small></div>
        <div class="mis-tl"><span class="lab">Aciertos</span><b class="num">${xs.length ? Math.round((ganadas.length / xs.length) * 100) + '%' : '·'}</b><small>${xs.length ? `<span><span>${ganadas.length}</span> <span>de ${xs.length}</span></span>` : '<span>sin resultados aún</span>'}</small></div>
        <div class="mis-tl ${ult === 'won' ? 'pos' : ult === 'lost' ? 'neg' : ''}"><span class="lab">Racha</span><b class="num">${racha ? `<i>${ult === 'won' ? '▲' : '▼'}</i>${racha}` : '·'}</b><small><span>${rachaTxt}</span></small></div>
        <div class="mis-tl"><span class="lab">Mejor cuota</span><b class="num">${mejor ? O(mejor) : '·'}</b><small><span>${mejor ? 'acertada' : 'sin aciertos aún'}</span></small></div>
      </div>`;
    return `<section class="mis-sec mis-nums">
      <div class="mis-h"><span class="mis-k">02</span><h2>Tus números</h2></div>
      ${tiles}<div class="mis-ch">
        <div class="mis-ch-h"><h3>Tu beneficio</h3>${xs.length > 1 ? `<p><span><span>mejor momento</span> <b class="up">${flecha(alto)} ${N(Math.abs(alto))}</b></span><span><span>peor momento</span> <b class="dn">${flecha(bajo)} ${N(Math.abs(bajo))}</b></span></p>` : ''}</div>
        ${curva(xs)}</div>
    </section>`;
  }

  /* ---------- 3. historial ---------- */
  function historial() {
    const sueltas = ALL.filter((b) => b.k === MEK && b.st !== 'open' && byId(b.m)).map((b) => ({ k: 'b', b, st: b.st, t: t2(b.set || b.at), sp: [byId(b.m).s] }));
    const comb = (misCombos() || []).filter((c) => c.status !== 'open').map((c) => ({ k: 'c', c, st: stC(c), t: t2(c.settled_at || c.created_at), sp: [...new Set(legsDe(c).map((l) => (l.matches || {}).sport).filter(Boolean))] }));
    const set = [...sueltas, ...comb].sort((a, b) => b.t - a.t);
    const deps = DEP.filter((k) => set.some((x) => x.sp.includes(k))), sp = deps.includes(S.bsp) ? S.bsp : 'all';
    const ests = [['all', 'Todas'], ['won', 'Ganadas'], ['lost', 'Perdidas'], ['void', 'Anuladas']].filter(([k]) => k === 'all' || set.some((x) => x.st === k));
    const bf = ests.some(([k]) => k === S.bf) ? S.bf : 'all';
    const list = set.filter((x) => (bf === 'all' || x.st === bf) && (sp === 'all' || x.sp.includes(sp)));
    const pags = Math.max(1, Math.ceil(list.length / POR)), pg = Math.min(S.bp || 0, pags - 1);
    const carta = (x, i) => (x.k === 'b' ? GM_RES.apuesta(x.b, { i }) : GM_RES.combinada(x.c, { i }));
    const retos = CH.filter((c) => GM_RETOS.dentro(c) && c.st !== 'pending' && c.st !== 'accepted');
    return `<section class="mis-sec mis-his">
      <div class="mis-h"><span class="mis-k">03</span><h2>Historial</h2><i>${set.length}</i></div>
      ${set.length ? `<nav class="mb-fil mis-fil"><span class="mb-fg">${ests.map(([k, n]) => `<button class="chip ${bf === k ? 'on' : ''}" data-bf="${k}">${n} <i>${k === 'all' ? set.length : set.filter((x) => x.st === k).length}</i></button>`).join('')}</span>
        ${deps.length > 1 ? `<span class="mb-fg">${[['all', 'Todo', null], ...deps.map((k) => [k, ...SP[k]])].map(([k, n, im]) => `<button class="f ${sp === k ? 'on' : ''}" data-bsp="${k}">${im ? `<img src="${im}" alt="">` : ''}${n}</button>`).join('')}</span>` : ''}</nav>` : ''}
      ${list.length && window.GM_RES ? `<div class="mb-rs2 mis-rs">${list.slice(pg * POR, pg * POR + POR).map(carta).join('')}</div>` : `<p class="hint">${set.length ? 'Nada con este filtro.' : 'Todavía nada. Cuando acabe un partido en el que hayas apostado, sale aquí.'}</p>`}
      ${pags > 1 ? `<nav class="pags"><button data-bp="${pg - 1}" ${pg ? '' : 'disabled'} aria-label="Anterior">‹</button>${Array.from({ length: pags }, (_, i) => `<button data-bp="${i}" class="${i === pg ? 'on' : ''}">${i + 1}</button>`).join('')}<button data-bp="${pg + 1}" ${pg < pags - 1 ? '' : 'disabled'} aria-label="Siguiente">›</button></nav>` : ''}
      ${retos.length ? `<div class="mis-sub"><h3>Retos acabados</h3><i>${retos.length}</i></div>${retosHtml(retos.slice(0, 12), '')}` : ''}
    </section>`;
  }

  /* ---------- la pantalla ---------- */
  function html() {
    if (!g(() => loaded)) return '';
    if (window.GM_CMB) setTimeout(() => g(() => GM_CMB.carga()), 0);   // la primera vez y luego cada 30 s como mucho (lo frena combinadas.js)
    return `<div class="pad mis">${enJuego()}${numeros()}${historial()}</div>`;
  }

  /* ---------- el recuadro de la curva (raton o dedo) ---------- */
  function tip(e) {
    const v = e.target.closest && e.target.closest('.mis-ch-v'); if (!v || !CHART) return;
    const svg = v.querySelector('svg'), box = v.querySelector('.mis-tip'); if (!svg || !box) return;
    const r = svg.getBoundingClientRect(), k = r.width / CHART.W, x = (e.clientX - r.left) / k;
    const i = Math.max(1, Math.min(CHART.n - 1, Math.round(((x - CHART.x0) / (CHART.x1 - CHART.x0)) * (CHART.n - 1))));
    const p = CHART.xs[i - 1], tot = CHART.pts[i], cx = CHART.X(i), cy = CHART.Y(tot);
    const gl = svg.querySelector('.mis-guia'), sel = svg.querySelector('.mis-sel');
    gl.setAttribute('x1', cx); gl.setAttribute('x2', cx); gl.style.display = '';
    sel.setAttribute('cx', cx); sel.setAttribute('cy', cy); sel.setAttribute('class', 'mis-sel ' + p.st); sel.style.display = '';
    const key = i + '|' + document.documentElement.lang;
    if (box.dataset.k !== key) {
      box.dataset.k = key;
      box.innerHTML = `<b ${p.mk ? 'data-notr' : ''}>${esc(p.txt)}</b><small>${DD(p.t)} ${MO(p.t)} · ${HM(p.t)}</small><span class="${p.v > 0 ? 'pos' : 'neg'}"><span>${p.st === 'won' ? 'Ganada' : 'Perdida'}</span> <b>${flecha(p.v)} ${N(Math.abs(p.v))}</b></span><span><span>Total</span> <b class="${tot > 0 ? 'up' : tot < 0 ? 'dn' : ''}">${flecha(tot)} ${N(Math.abs(tot))}</b></span>`;
      tr(box);
    }
    box.hidden = false;
    const bw = box.offsetWidth, vw = v.clientWidth, px = cx * k, left = Math.max(0, Math.min(vw - bw, px - bw / 2));
    box.style.left = left + 'px'; box.style.top = Math.max(0, cy * k - box.offsetHeight - 16) + 'px';
  }
  function sinTip(e) {
    const v = e.target.closest && e.target.closest('.mis-ch-v'); if (!v) return;
    const b = v.querySelector('.mis-tip'); if (b) b.hidden = true;
    v.querySelectorAll('.mis-guia,.mis-sel').forEach((x) => (x.style.display = 'none'));
  }
  document.addEventListener('pointermove', tip);
  document.addEventListener('pointerdown', tip);
  document.addEventListener('pointerout', (e) => { const v = e.target.closest && e.target.closest('.mis-ch-v'); if (v && !v.contains(e.relatedTarget)) sinTip(e) });

  // las combinadas llegan despues de pintar (o cambian): se repinta una vez cuando cambian
  addEventListener('gm:cmb-datos', () => { if (g(() => S.scr) === 'apuestas' && !document.activeElement?.matches('input,textarea')) g(() => render()) });
  setInterval(() => { if (!document.hidden && g(() => S.scr) === 'apuestas' && window.GM_CMB) g(() => GM_CMB.carga()) }, 30e3);
  window.GM_MIS = { html, cmb };
})();
