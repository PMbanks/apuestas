// Ganada o perdida en las tarjetas (PM, 01-11: modelo A de modelos/m1101/resultado mezclado con dos cosas del C).
// Del A: la franja de color arriba con como acabo ("Ganada", "Perdida", "Combinada cobrada"...) y la cifra, y el partido
// con el marcador y la elegida. Del C: el escudo del equipo grande y tenue de fondo y los cuadrados de abajo (Cuota,
// Apostado, Cobrado). Anulada en gris y retirada (cash out) en azul. Para Todas las apuestas tambien las abiertas
// (En juego, En vivo) con la franja apagada.
// La usan Mis apuestas (mbFila de app.js), Todas las apuestas de Apuestas de todos (abTicket) y las combinadas resueltas
// (combinadas.js). Usa lo global de app.js (byId, L, SP, logo, pn, av, fr, N, O, coin, WD, DD, MO, HM, MEK, LOCK, esc).
'use strict';
(function () {
  const g = (f, d) => { try { return f() } catch { return d } };
  const MARCA = { won: '<path d="M7 12.5l3.2 3.2L17 9"/>', lost: '<path d="M8.5 8.5l7 7M15.5 8.5l-7 7"/>', void: '<path d="M7.5 12h9"/>',
    cash: '<path d="M8.8 15.2l6.4-6.4M10.2 8.8h5v5"/>', open: '<path d="M12 7.6V12l2.8 1.8"/>' };
  const icono = (k) => (k === 'live' ? '<i class="rsl-pt"></i>' : `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11"/><g>${MARCA[k] || ''}</g></svg>`);
  const cuando = (t) => `${WD(t)} ${DD(t)} ${MO(t)} · ${HM(t)}`;
  const marcaCifra = (k) => (k === 'won' ? '▲' : k === 'lost' ? '▼' : '');
  // el escudo de fondo: el del equipo elegido (o el de la liga si es empate u oculta)
  const fondo = (u, cara, cls = '') => (u ? `<img class="rsl-wm ${cara ? 'face' : ''} ${cls}" src="${esc(u)}" alt="" loading="lazy" onerror="this.remove()">` : '');
  const cuadro = (lab, val, cls = '') => `<div class="${cls}"><span class="lab">${lab}</span><b>${val}</b></div>`;
  const franja = (k, txt, cifra, signo) => `<header class="rsl-band"><span class="rsl-st">${icono(k)}<span>${txt}</span></span><span class="rsl-amt">${signo ? `<small>${signo}</small>` : ''}${cifra}</span></header>`;

  /* ---------- una apuesta suelta (formato de ALL en app.js; vale tambien para las filas de bets_page) ---------- */
  function apuesta(b, op) {
    const m = byId(b.m); if (!m) return '';
    op = op || {};
    const abierta = b.st === 'open', cash = !!b.cash || b.st === 'cashout', oculta = !b.p;
    const k = abierta ? (m.live ? 'live' : 'open') : cash ? 'cash' : b.st === 'won' || b.st === 'lost' || b.st === 'void' ? b.st : 'void';
    const pay = b.pay || 0, dif = pay - b.stake, mio = b.k === MEK;
    let txt, cifra, signo = '', tercero;
    if (k === 'won') { txt = 'Ganada'; cifra = N(dif); signo = '▲'; tercero = cuadro('Cobrado', N(pay) + coin(), 'hi') }
    else if (k === 'lost') { txt = 'Perdida'; cifra = N(b.stake); signo = '▼'; tercero = cuadro('Cobrado', '0', 'zero') }
    else if (k === 'void') { txt = 'Anulada'; cifra = N(b.stake); tercero = cuadro('Devuelto', N(b.stake) + coin()) }
    else if (k === 'cash') { txt = 'Retirada'; cifra = N(Math.abs(dif)); signo = dif > 0 ? '▲' : dif < 0 ? '▼' : ''; tercero = cuadro('Cobrado', N(pay) + coin(), 'hi') }
    else { txt = k === 'live' ? 'En vivo' : 'En juego'; cifra = oculta ? '?' : N(b.stake * b.o); tercero = cuadro('Cobraría', oculta ? '?' : N(b.stake * b.o) + coin(), 'hi') }
    const t = abierta ? Date.parse(m.at) : Date.parse(b.set || b.at);
    const etiqueta = mio ? '★ tu apuesta' : `★ <span data-notr>${esc(fr(b.k).n)}</span>`;
    const lado = (s, p) => `<div class="rsl-tm ${b.p === p ? 'pick' : ''}">${logo(m, s)}<span>${esc(s === 'a' ? m.a : m.b)}</span>${b.p === p ? `<em>${etiqueta}</em>` : ''}</div>`;
    const sc = String(m.score || '').split(/\s+/)[0], mm = /^(\d+)\s*[:\-]\s*(\d+)$/.exec(sc);
    const centro = mm && (!abierta || m.live) ? `<span class="rsl-num"><span class="${m.winner === '1' ? 'w' : ''}">${mm[1]}</span><i>:</i><span class="${m.winner === '2' ? 'w' : ''}">${mm[2]}</span></span>` : sc && !abierta ? `<span class="tx">${esc(sc)}</span>` : '<span class="vs">vs</span>';
    const mkp = !!(window.GM_MK && GM_MK.es(b.p)), lp = mkp ? GM_MK.lado(b.p) : b.p;   // mercados nuevos (db/036): su nombre en el centro
    const pk = b.p === 'X' ? `<em>★ Empate${mio ? '' : ` · <span data-notr>${esc(fr(b.k).n)}</span>`}</em>`
      : mkp ? `<em class="rsl-mk">★ <span data-notr>${esc(pn(m, b.p))}</span>${mio ? '' : ` · <span data-notr>${esc(fr(b.k).n)}</span>`}</em>` : '';
    const wm = lp === '1' ? m.la : lp === '2' ? m.lb : L[m.lg]?.[1];
    const quien = op.quien ? `${av(b.k, 'sm')}<b class="rsl-who" data-notr>${esc(fr(b.k).n)}</b>` : '';
    return `<article class="rsl" data-r="${k}" data-goto="${esc(m.id)}" style="--i:${op.i || 0}">
      ${fondo(wm, m.s === 'u' && b.p !== 'X' && !oculta)}
      ${franja(k, txt, cifra + (cifra === '?' ? '' : coin()), signo)}
      <div class="rsl-meta">${quien}<img class="tl" src="${esc(L[m.lg]?.[1] || SP[m.s][1])}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><span class="lab ell">${esc(corto(L[m.lg]?.[0] || SP[m.s][0]))}</span><span class="lab n">${m.live && abierta ? 'en juego' : cuando(t)}</span></div>
      <div class="rsl-vs">${lado('a', '1')}<div class="rsl-sc">${centro}${pk}</div>${lado('b', '2')}</div>
      ${oculta ? `<p class="rsl-oc">${LOCK}Oculta hasta empezar</p>` : ''}
      <div class="rsl-n">${cuadro('Cuota', oculta ? '·' : O(b.o))}${cuadro('Apostado', N(b.stake) + coin())}${tercero}</div>
    </article>`;
  }

  /* ---------- una combinada resuelta (formato de la tabla combos con combo_legs, como la carga combinadas.js) ---------- */
  const mpN = (ls) => { const k = {}; for (const l of ls || []) k[l.match_id] = (k[l.match_id] || 0) + 1; return Object.values(k).filter((v) => v > 1).reduce((t, v) => t + v, 0) };   // db/067: cuantas van del mismo partido que otra
  const nombrePata = (l) => { const m = l.matches || {}; return l.pick === '1' ? m.home : l.pick === '2' ? m.away : l.pick === 'X' ? 'Empate' : pn({ a: m.home, b: m.away }, l.pick) };
  const ladoPata = (p) => (window.GM_MK && GM_MK.es(p) ? GM_MK.lado(p) : p);
  const estadoPata = (l) => { const m = l.matches || {};
    if (l.result === 'won') return 'ok'; if (l.result === 'lost') return 'ko'; if (l.result === 'void') return 'nul';
    return m.status === 'live' || (m.status === 'scheduled' && Date.parse(m.starts_at) <= Date.now()) ? 'vivo' : 'pend' };
  const PATA = { ok: '<path d="M2.5 6.3l2.3 2.3L9.5 3.8"/>', ko: '<path d="M3.5 3.5l5 5M8.5 3.5l-5 5"/>', nul: '<path d="M3.5 6h5"/>', pend: '<circle cx="6" cy="6" r="3.6"/>' };
  function caraPata(l) {
    const m = byId(l.match_id), s = (l.matches || {}).sport || 'f';
    const lp = ladoPata(l.pick);
    if (m && (lp === '1' || lp === '2')) return logo(m, lp === '1' ? 'a' : 'b');
    return `<img class="tl" src="${esc((m && L[m.lg]?.[1]) || SP[s]?.[1] || '')}" alt="" loading="lazy">`;
  }
  const urlPata = (l) => { const m = byId(l.match_id), lp = ladoPata(l.pick); return m ? (lp === '1' ? m.la : lp === '2' ? m.lb : L[m.lg]?.[1]) : null };
  function combinada(c, op) {
    op = op || {};
    const legs = (c.combo_legs || []).slice().sort((a, b) => Date.parse(a.matches?.starts_at || 0) - Date.parse(b.matches?.starts_at || 0));
    const st = c.status, pay = c.payout || 0, dif = pay - c.stake;
    const k = st === 'cashout' ? 'cash' : st === 'won' || st === 'lost' || st === 'void' ? st : 'open';
    let txt, cifra, signo = '', tercero;
    if (k === 'won') { txt = 'Combinada cobrada'; cifra = N(dif); signo = '▲'; tercero = cuadro('Cobrado', N(pay) + coin(), 'hi') }
    else if (k === 'lost') { txt = 'Combinada perdida'; cifra = N(c.stake); signo = '▼'; tercero = cuadro('Cobrado', '0', 'zero') }
    else if (k === 'void') { txt = 'Combinada devuelta'; cifra = N(pay || c.stake); tercero = cuadro('Devuelto', N(pay || c.stake) + coin()) }
    else if (k === 'cash') { txt = 'Combinada cancelada'; cifra = N(Math.abs(dif)); signo = dif > 0 ? '▲' : dif < 0 ? '▼' : ''; tercero = cuadro('Cobrado', N(pay) + coin(), 'hi') }
    else { txt = 'En juego'; cifra = N(c.stake * c.odds); tercero = cuadro('Cobraría', N(c.stake * c.odds) + coin(), 'hi') }
    const t = Date.parse(c.settled_at || c.created_at);
    const wms = legs.map(urlPata).filter(Boolean).slice(0, 2);
    const pata = (l) => { const m = l.matches || {}, e = estadoPata(l), s = String(m.score || '').split(/\s+/)[0];
      return `<div class="rsl-leg ${e}"><span class="rsl-ok">${PATA[e] ? `<svg viewBox="0 0 12 12">${PATA[e]}</svg>` : e === 'vivo' ? '<i class="rsl-pt"></i>' : ''}</span>${caraPata(l)}<div><b>${esc(nombrePata(l))}</b><small>${esc(m.home || '')} ${esc(s && (m.status === 'final' || m.status === 'live') ? s : 'vs')} ${esc(m.away || '')}</small></div><span class="q">${O(l.odds)}</span></div>` };
    return `<article class="rsl rsl-c" data-r="${k}" style="--i:${op.i || 0}">
      ${wms.map((u, i) => fondo(u, false, i ? 'b' : '')).join('')}
      ${franja(k, txt, cifra + coin(), signo)}
      <div class="rsl-meta"><span class="lab ell">Combinada de ${legs.length}${mpN(legs) ? `<span class="mp-tag"> · ${mpN(legs)} del mismo partido</span>` : ''}</span><span class="lab n">${cuando(t)}</span></div>
      <div class="rsl-legs">${legs.map(pata).join('')}</div>
      <div class="rsl-n">${cuadro('Cuota', O(c.odds))}${cuadro('Apostado', N(c.stake) + coin())}${tercero}</div>
    </article>`;
  }

  window.GM_RES = { apuesta: (b, op) => g(() => apuesta(b, op), ''), combinada: (c, op) => g(() => combinada(c, op), '') };
})();
