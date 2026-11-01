// Inicio (PM, 01-11: modelo C de modelos/m1101/inicio): la pantalla principal y la primera al abrir la app.
// Dos columnas: Tu (lo que te ha pasado desde tu ultima visita y lo que tienes en juego) y Amigos (lo ultimo de cada uno,
// por orden de movimiento, con Me sumo). En movil y en pantallas medianas, un conmutador Tu | Amigos.
// Va aparte, como combinadas.js: app.js lo pinta con R.inicio y aqui se usa lo global de app.js (ALL, M, F, CHAT, ME, MEK,
// byId, av, logo, N, O, coin...) y las combinadas que ya carga combinadas.js (GM_CMB). No pide nada nuevo a la base.
// Las fichas de resultado llevan clases propias (.ini-rc / .ini-rv con data-r): PM aun va a elegir como se marca
// ganada o perdida (seccion "resultado" de modelos/m1101); se cambia solo ese bloque de inicio.css.
'use strict';
(function () {
  const DIA = 864e5, HUECO = 30 * 60e3;   // media hora sin mirar la app = visita nueva
  const g = (f, d) => { try { return f() } catch { return d } };
  const t2 = (x) => (typeof x === 'number' ? x : Date.parse(x || '')) || 0;

  /* ---------- tu ultima visita (localStorage, por jugador) ----------
     prev = cuando miraste la app por ultima vez antes de esta visita; last = la ultima vez que la estabas mirando.
     Recargar (version.js) o volver en menos de media hora es la misma visita: no se pierde "Acaba de pasar". */
  let V = null, VK = '';
  const lee = (k) => { try { const x = JSON.parse(localStorage.getItem(k) || 'null'); if (x && typeof x === 'object') return { prev: +x.prev || 0, last: +x.last || 0 } } catch {} return { prev: 0, last: 0 } };
  const guarda = () => { if (!VK || !V) return; try { localStorage.setItem(VK, JSON.stringify(V)) } catch {} };
  function abre(k) {
    const x = lee(k), now = Date.now();
    const v = !x.last ? { prev: 0, last: now } : now - x.last > HUECO ? { prev: x.last, last: now } : { prev: x.prev, last: now };
    VK = k; V = v; guarda(); return v;
  }
  function visita() {
    const yo = g(() => ME); if (!yo) return { prev: 0, last: 0 };
    const k = 'gm-ini-visita:' + yo;
    return V && VK === k ? V : abre(k);
  }
  const toca = () => { if (V) { V.last = Date.now(); guarda() } };
  setInterval(() => { if (!document.hidden) toca() }, 60e3);
  addEventListener('pagehide', toca);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return toca();
    if (!VK) return;
    const antes = V && V.prev; abre(VK);
    if (V.prev !== antes && g(() => S.scr) === 'inicio') g(() => render());
  });

  /* ---------- fechas ---------- */
  const desde = (t) => { const now = Date.now();
    if (DK(t) === DK(now)) return 'desde las ' + HM(t);
    if (DK(t) === DK(now - DIA)) return 'desde ayer';
    if (now - t < 6 * DIA) return 'desde el ' + fmt(t, { weekday: 'long' });
    return 'desde el ' + DD(t) + ' ' + MO(t).toLowerCase() };
  const fue = (t) => { const now = Date.now();   // cuando se resolvio
    if (DK(t) === DK(now)) return HM(t);
    if (DK(t) === DK(now - DIA)) return 'ayer ' + HM(t);
    if (now - t < 6 * DIA) return WD(t).toLowerCase() + ' ' + HM(t);
    return DD(t) + ' ' + MO(t).toLowerCase() };
  const empieza = (t) => { const now = Date.now();
    if (DK(t) === DK(now)) return 'hoy ' + HM(t);
    if (DK(t) === DK(now + DIA)) return 'mañana ' + HM(t);
    if (t - now < 6 * DIA) return WD(t).toLowerCase() + ' ' + HM(t);
    return WD(t).toLowerCase() + ' ' + DD(t) + ' ' + MO(t).toLowerCase() + ' ' + HM(t) };
  const hace = (t) => { const s = (Date.now() - t) / 1e3;
    if (s < 90) return 'ahora';
    if (s < 3600) return `hace ${Math.round(s / 60)} min`;
    if (DK(t) === DK(Date.now())) return `hace ${Math.floor(s / 3600)} h`;
    if (DK(t) === DK(Date.now() - DIA)) return 'ayer';
    if (s < 6 * 86400) return WD(t).toLowerCase() + ' ' + DD(t);
    return DD(t) + ' ' + MO(t).toLowerCase() };
  const puesto = (f) => { const p = [...F].sort((a, b) => b.s - a.s).indexOf(f) + 1; return en() ? '#' + p : p + 'º' };

  /* ---------- marcador en vivo (lo pone vivo.js en m.vivo / m.score) ---------- */
  const marcador = (m) => { const v = m.vivo; if (v && v.a && v.b && v.a.mapas != null) return [v.a.mapas, v.b.mapas];
    const x = /^(\d+)\s*[:\-]\s*(\d+)/.exec(String(m.score || '')); return x ? [+x[1], +x[2]] : null };
  const lider = (m) => { if (m.vivo && typeof m.vivo.lidera === 'string') return m.vivo.lidera; const s = marcador(m); return s ? (s[0] > s[1] ? 'a' : s[0] < s[1] ? 'b' : '') : null };
  // como va una apuesta en vivo: 'gana', 'pierde', 'empata' o '' si no se sabe
  const comoVa = (m, p) => { if (!m.live) return ''; const l = lider(m); if (l == null) return ''; const yo = p === '1' ? 'a' : p === '2' ? 'b' : 'x';
    return yo === 'x' ? (l === '' ? 'gana' : 'pierde') : l === '' ? 'empata' : l === yo ? 'gana' : 'pierde' };
  const scoreCorto = (m) => String(m.score || '').split(/\s+/)[0];
  const lado = (p) => (p === '1' ? 'a' : p === '2' ? 'b' : null);
  const ligaImg = (m) => `<img class="tl" src="${esc((L[m.lg] && L[m.lg][1]) || SP[m.s][1])}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`;
  const caraPick = (m, p) => (lado(p) ? logo(m, lado(p)) : ligaImg(m));
  const conA = (al) => `<span data-notr>${en() ? (al ? ' on the ' : ' on ') : (al ? ' al ' : ' a ')}</span>`;   // "200 a Real Madrid" / "200 on Real Madrid"
  const aCuota = (o) => `<span data-notr>${en() ? ' at ' : ' a '}</span>${O(o)}`;   // "300 a 2,36" / "300 at 2.36" ("a 2,36" suelto ya lo usa Juegos)
  const linea = (m) => g(() => (window.GM_VIVO ? GM_VIVO.lineaTxt(m) : ''), '');

  /* ---------- combinadas (las carga combinadas.js) ---------- */
  const combos = () => g(() => (window.GM_CMB && GM_CMB.todas()) || [], []);
  const legsDe = (c) => (c.combo_legs || []).slice().sort((a, b) => t2(a.matches && a.matches.starts_at) - t2(b.matches && b.matches.starts_at));
  const netoC = (c) => (c.status === 'won' || c.status === 'cashout' ? (c.payout || 0) - c.stake : c.status === 'lost' ? -c.stake : 0);
  const pata = (l) => { const m = l.matches || {};
    if (l.result === 'won') return 'ok'; if (l.result === 'lost') return 'ko'; if (l.result === 'void') return 'nul';
    if (m.status === 'live' || (m.status === 'scheduled' && t2(m.starts_at) <= Date.now())) return 'vivo'; return 'pend' };
  const nombrePata = (l) => { const m = l.matches || {}; return l.pick === '1' ? m.home : l.pick === '2' ? m.away : 'Empate' };
  const carasC = (c) => { const ls = legsDe(c).slice(0, 2);
    return `<span class="ini-two">${ls.map((l) => { const m = byId(l.match_id); return m ? caraPick(m, l.pick) : `<img class="tl" src="${esc(SP[(l.matches || {}).sport || 'f'][1])}" alt="">` }).join('')}</span>` };
  const IC_CMB = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M5 8.5h11a1.5 1.5 0 0 1 1.5 1.5v1.2a1.6 1.6 0 0 0 0 3.1V16a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 16v-1.7a1.6 1.6 0 0 0 0-3.1V10A1.5 1.5 0 0 1 5 8.5z"/><path d="M7.5 6h11A1.5 1.5 0 0 1 20 7.5v7"/></svg>';

  /* ---------- juegos de los amigos: solo lo que ya trae el chat (premios gordos y cara o cruz) ---------- */
  const IC_JUEGO = { Crash: '<path d="M3 17c3.5 0 7.5-1.8 10.5-8.2l1.8 1.4L17 4.3l-5.4 1 1.6 1.4C10.6 12.2 7.1 14.6 3 14.6z" fill="currentColor"/>',
    moneda: '<circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 8v8M9.5 10.2c0-1.1 1.1-1.7 2.5-1.7s2.5.6 2.5 1.6c0 2.4-5 1.4-5 3.8 0 1 1.1 1.6 2.5 1.6s2.5-.6 2.5-1.7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    otro: '<rect x="4.5" y="4.5" width="15" height="15" rx="3.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="9.5" cy="9.5" r="1.3" fill="currentColor"/><circle cx="14.5" cy="14.5" r="1.3" fill="currentColor"/>' };
  const porNombre = (n) => F.find((f) => f.n === n);
  const numES = (s) => +String(s).replace(/\./g, '').replace(',', '.') || 0;
  function juegosChat() {
    const out = [];
    for (const c of g(() => CHAT, []) || []) {
      if (c.k || !c.txt) continue;
      let x = /^(.+?) ganó ([\d.]+) en (.+?) \(×([\d,]+)\)$/.exec(c.txt);
      if (x) { const f = porNombre(x[1]); if (!f) continue; const pago = numES(x[2]), mult = numES(x[4]) || 1, stake = Math.round(pago / mult);
        out.push({ k: f.id, t: c.at, tipo: 'j', juego: x[3], pago, mult, v: pago - stake, r: 'won' }); continue }
      x = /^Cara o cruz: salió (cara|cruz) y (.+?) gana ([\d.]+) a (.+)$/.exec(c.txt);
      if (x) { const a = porNombre(x[2]), b = porNombre(x[4]), mitad = Math.round(numES(x[3]) / 2);
        if (a) out.push({ k: a.id, t: c.at, tipo: 'm', rival: x[4], v: mitad, r: 'won' });
        if (b) out.push({ k: b.id, t: c.at, tipo: 'm', rival: x[2], v: -mitad, r: 'lost' }) }
    }
    return out;
  }

  /* ---------- lo resuelto y lo abierto de cada uno ---------- */
  const claseR = (st, v) => (st === 'void' ? 'void' : v > 0 ? 'won' : v < 0 ? 'lost' : 'void');
  function resueltas(k, uid, juegos) {
    const out = [];
    for (const b of ALL) { if (b.k !== k || b.st === 'open') continue; const m = byId(b.m); if (!m) continue;
      const v = neto(b); out.push({ t: t2(b.set || b.at), tipo: 'b', b, m, v, r: claseR(b.st, v) }) }
    for (const c of combos()) { if (c.player !== uid || c.status === 'open') continue; const v = netoC(c); out.push({ t: t2(c.settled_at || c.created_at), tipo: 'c', c, v, r: claseR(c.status, v) }) }
    if (juegos) for (const j of juegos) if (j.k === k) out.push(j);
    return out.sort((a, b) => b.t - a.t);
  }
  function abiertas(k, uid) {
    const out = [];
    for (const b of ALL) { if (b.k !== k || b.st !== 'open') continue; const m = byId(b.m); if (!m) continue; out.push({ tipo: 'b', b, m, at: t2(m.at), puesta: t2(b.at), live: !!m.live }) }
    for (const c of combos()) { if (c.player !== uid || c.status !== 'open') continue; const ls = legsDe(c);
      out.push({ tipo: 'c', c, at: t2(ls[0] && ls[0].matches && ls[0].matches.starts_at), puesta: t2(c.created_at), live: ls.some((l) => pata(l) === 'vivo') }) }
    return out.sort((a, b) => (b.live - a.live) || a.at - b.at);
  }
  const cobraria = (x) => (x.tipo === 'b' ? x.b.stake * x.b.o : x.c.stake * Number(x.c.odds));
  const valor = (r, v, extra) => `<span class="ini-rv" data-r="${r}"><small>${r === 'won' ? '▲' : r === 'lost' ? '▼' : ''}</small>${N(Math.abs(v || extra || 0))}${coin()}</span>`;

  /* ---------- Tu ---------- */
  // PM 01-11 (resultado: A mezclada con C): franja de color arriba con como acabo y la cifra, el escudo de lo elegido grande y
  // tenue de fondo y abajo los cuadrados Cuota, Apostado y Cobrado (en una ficha estrecha de movil, sin la cuota)
  const IC_RC = { won: '<path d="M7 12.5l3.2 3.2L17 9"/>', lost: '<path d="M8.5 8.5l7 7M15.5 8.5l-7 7"/>', void: '<path d="M7.5 12h9"/>', cash: '<path d="M8.8 15.2l6.4-6.4M10.2 8.8h5v5"/>' };
  function ficha(x, i) {
    const r = x.r;
    let cab, sm, go, wm = null, cara = false, cash, cuota, stake, pay;
    if (x.tipo === 'b') {
      const { b, m } = x, p = b.p, sc = scoreCorto(m);
      cab = `${caraPick(m, p)}<b>${esc(pn(m, p))}</b>`;
      cash = !!b.cash; cuota = b.o; stake = b.stake; pay = b.pay || 0;
      sm = `${esc(m.a)} <span class="ini-sc0">${esc(sc || 'vs')}</span> ${esc(m.b)}`;
      wm = lado(p) ? (lado(p) === 'a' ? m.la : m.lb) : (L[m.lg] && L[m.lg][1]); cara = m.s === 'u' && !!lado(p);
      go = `data-goto="${esc(m.id)}"`;
    } else {
      const c = x.c, ls = legsDe(c), l0 = ls[0], m0 = l0 && byId(l0.match_id);
      cab = `${carasC(c)}<b>Combinada de ${ls.length}</b>`;
      cash = c.status === 'cashout'; cuota = Number(c.odds); stake = c.stake; pay = c.payout || 0;
      sm = `<span>${ls.filter((l) => l.result === 'won').length} de ${ls.length} acertados</span>`;
      if (m0) wm = l0.pick === '1' ? m0.la : l0.pick === '2' ? m0.lb : L[m0.lg] && L[m0.lg][1];
      go = 'data-scr="apuestas"';
    }
    const k = cash ? 'cash' : r, st = cash ? 'Retiraste' : { won: 'Ganaste', lost: 'Perdiste', void: 'Devuelta' }[r];
    const cifra = N(Math.abs(x.v || (r === 'void' ? (x.tipo === 'c' ? pay || stake : stake) : 0)));
    const ultimo = r === 'lost' && !cash ? ['Cobrado', '0', 'zero'] : r === 'void' && !cash ? ['Devuelto', N(x.tipo === 'c' ? pay || stake : stake) + coin(), ''] : ['Cobrado', N(pay) + coin(), 'hi'];
    return `<article class="ini-rc" data-r="${r}" data-k="${k}" ${go} style="--i:${i}">
      ${wm ? `<img class="ini-rc-wm ${cara ? 'face' : ''}" src="${esc(wm)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
      <div class="ini-rc-b"><span class="ini-rc-st"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11"/><g>${IC_RC[k] || ''}</g></svg><span>${st}</span></span><span class="ini-rc-v">${r === 'won' ? '<small>▲</small>' : r === 'lost' ? '<small>▼</small>' : ''}${cifra}${coin()}</span></div>
      <div class="ini-rc-h">${cab}<span class="ini-when">${esc(fue(x.t))}</span></div>
      <span class="ini-rc-sm">${sm}</span>
      <div class="ini-rc-n"><span class="q"><small>Cuota</small><b>${O(cuota)}</b></span><span><small>Apostado</small><b>${N(stake)}${coin()}</b></span><span class="${ultimo[2]}"><small>${ultimo[0]}</small><b>${ultimo[1]}</b></span></div>
    </article>`;
  }
  function ticket(x) {
    if (x.tipo === 'c') return ticketC(x.c);
    const { b, m } = x, sd = lado(b.p), sc = m.live ? marcador(m) : null, va = comoVa(m, b.p), ld = m.live ? lider(m) : null;
    const head = m.live
      ? `<i class="dot"></i><span class="lab rd ell">${esc(['En vivo', linea(m)].filter(Boolean).join(' · '))}</span>${va ? `<span class="ini-va ${va}">${{ gana: 'Vas ganando', pierde: 'Vas perdiendo', empata: 'Vas empatando' }[va]}</span>` : ''}`
      : `${ligaImg(m)}<span class="lab ell">${esc(corto((L[m.lg] && L[m.lg][0]) || SP[m.s][0]))}</span><span class="lab r">${esc(empieza(t2(m.at)))}</span>`;
    const eq = (s) => `<div class="ini-eq ${s === 'b' ? 'r' : ''} ${sd === s ? 'pick' : ''}">${logo(m, s)}<span>${esc(s === 'a' ? m.a : m.b)}</span></div>`;
    const mid = sc ? `<div class="ini-sc"><span class="${ld === 'a' && sd === 'a' ? 'w' : ''}">${sc[0]}</span><i>:</i><span class="${ld === 'b' && sd === 'b' ? 'w' : ''}">${sc[1]}</span></div>`
      : `<div class="ini-vs ${b.p === 'X' ? 'pick' : ''}">${b.p === 'X' ? 'Empate' : 'vs'}</div>`;
    return `<article class="ini-tk ${m.live ? 'live' : ''}" data-goto="${esc(m.id)}">
      <div class="ini-tk-h">${head}</div>
      <div class="ini-tk-m">${eq('a')}${mid}${eq('b')}</div>
      <div class="ini-tk-f"><span class="k"><em><i>★</i>${esc(pn(m, b.p))}</em><span class="ini-k2">· ${N(b.stake)}${coin()}${aCuota(b.o)}</span></span><span class="p"><span>cobrarías</span><b>${N(b.stake * b.o)}${coin()}</b></span></div>
    </article>`;
  }
  function ticketC(c) {
    const ls = legsDe(c), hechas = ls.filter((l) => l.result === 'won').length, vivo = ls.some((l) => pata(l) === 'vivo');
    return `<article class="ini-tk ini-tkc ${vivo ? 'live' : ''}" data-scr="apuestas">
      <div class="ini-tk-h">${vivo ? '<i class="dot"></i>' : `<span class="ini-cmb-ic">${IC_CMB}</span>`}<span class="lab ell">Combinada de ${ls.length}</span><span class="lab r">${hechas} de ${ls.length} acertados</span></div>
      <div class="ini-patas">${ls.map((l) => { const k = pata(l); return `<span class="ini-pata ${k}"><i>${{ ok: '✓', ko: '✗', nul: '·', vivo: '●', pend: '' }[k]}</i>${esc(nombrePata(l))}</span>` }).join('')}</div>
      <div class="ini-tk-f"><span class="k"><span class="ini-k2">${N(c.stake)}${coin()}${aCuota(c.odds)}</span></span><span class="p"><span>cobrarías</span><b>${N(c.stake * Number(c.odds))}${coin()}</b></span></div>
    </article>`;
  }
  const IC_TICKET = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4z"/><path d="M14.5 6.5v11" stroke-dasharray="1.5 2"/></svg>';
  const IC_GENTE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="9" cy="8.5" r="3.2"/><path d="M3.2 19.5a5.8 5.8 0 0 1 11.6 0"/><circle cx="16.8" cy="9.6" r="2.6"/><path d="M15.4 14.4a4.6 4.6 0 0 1 5.6 4.5"/></svg>';
  const vacio = (ic, t, p, btn) => `<div class="ini-vacio"><span class="ini-vacio-i">${ic}</span><b>${t}</b><p>${p}</p>${btn ? `<button class="ini-ir" data-scr="partidos">Ir a Partidos</button>` : ''}</div>`;

  function colTu(v, juegos) {
    const yo = F.find((f) => f.me) || F[0]; if (!yo) return '';
    const res = resueltas(MEK, ME, null), abiertasYo = abiertas(MEK, ME);
    const nuevos = v.prev ? res.filter((x) => x.t > v.prev) : [], hay = nuevos.length > 0;
    const neto = (hay ? nuevos : res.filter((x) => x.t >= WEEK0)).reduce((a, x) => a + x.v, 0);
    const lista = hay ? nuevos : res.slice(0, 4), POR = 6;
    const cuenta = (xs) => { const c = { won: 0, lost: 0, void: 0 }; for (const x of xs) c[x.r]++;
      return [[c.won, c.won === 1 ? 'ganada' : 'ganadas'], [c.lost, c.lost === 1 ? 'perdida' : 'perdidas'], [c.void, c.void === 1 ? 'devuelta' : 'devueltas']].filter(([n]) => n).map(([n, t]) => `${n} ${t}`).join(' · ') };
    const cobrable = abiertasYo.reduce((a, x) => a + cobraria(x), 0);
    const head = `<div class="ini-colh yo">${av(MEK, 'ini-yo')}<div class="ini-who"><h2>Tú</h2><span class="lab">${N(yo.s)}${coin()} · ${[...F].sort((a, b) => b.s - a.s).indexOf(yo) + 1}º de ${F.length}</span></div>
      <div class="r"><span class="lab">${hay ? desde(v.prev) : 'esta semana'}</span><b class="ini-net ${neto > 0 ? 'up' : neto < 0 ? 'dn' : ''}">${neto ? `<small>${neto > 0 ? '▲' : '▼'}</small>` : ''}${N(Math.abs(neto))}${coin()}</b></div></div>`;
    if (!res.length && !abiertasYo.length) return head + vacio(IC_TICKET, 'Todavía no has apostado', 'Se apuesta en Partidos: toca una cuota y dale a Apostar.', true);
    let h = head;
    if (lista.length) {
      h += `<div class="ini-sub"><h3>${hay ? 'Acaba de pasar' : 'Tus últimos resultados'}<i>${lista.length}</i></h3><span>${hay ? cuenta(nuevos) : v.prev ? 'nada nuevo desde tu última visita' : ''}</span></div>
        <div class="ini-res">${lista.slice(0, POR).map(ficha).join('')}</div>${lista.length > POR ? '<button class="ini-mas" data-scr="apuestas">Ver todas en Mis apuestas</button>' : ''}`;
    }
    h += `<div class="ini-sub"><h3>En juego<i>${abiertasYo.length}</i></h3>${abiertasYo.length ? `<span><span>si aciertas todo</span> <b>${N(cobrable)}</b>${coin()}</span>` : ''}</div>`;
    h += abiertasYo.length ? abiertasYo.slice(0, POR).map(ticket).join('') + (abiertasYo.length > POR ? '<button class="ini-mas" data-scr="apuestas">Ver todas en Mis apuestas</button>' : '')
      : vacio(IC_TICKET, 'Nada en juego', 'Se apuesta en Partidos: toca una cuota y dale a Apostar.', true);
    return h;
  }

  /* ---------- Amigos ---------- */
  function lineaRes(x) {
    if (x.tipo === 'j') return `<div class="ini-ln" data-scr="juegos"><span class="ini-ico">${`<svg viewBox="0 0 24 24">${IC_JUEGO[/crash/i.test(x.juego) ? 'Crash' : 'otro']}</svg>`}</span><p>Ganó en <b>${esc(x.juego)}</b><small>cobró ${N(x.pago)} a ×${O(x.mult)}</small></p>${valor('won', x.v)}</div>`;
    if (x.tipo === 'm') return `<div class="ini-ln" data-scr="juegos"><span class="ini-ico">${`<svg viewBox="0 0 24 24">${IC_JUEGO.moneda}</svg>`}</span><p>${x.r === 'won' ? 'Ganó a' : 'Perdió a'} <b>cara o cruz</b><small>contra ${esc(x.rival)}</small></p>${valor(x.r, x.v)}</div>`;
    if (x.tipo === 'c') { const c = x.c, ls = legsDe(c), vb = c.status === 'cashout' ? 'Retiró una' : x.r === 'won' ? 'Ganó una' : x.r === 'lost' ? 'Perdió una' : '';
      if (!vb) return '';
      return `<div class="ini-ln" data-scr="colegas"><span class="ini-ico ini-ico-c">${IC_CMB}</span><p>${vb} <b>combinada de ${ls.length}</b><small>cuota ${O(c.odds)} · ${N(c.stake)}</small></p>${valor(x.r, x.v)}</div>` }
    const { b, m } = x; if (b.st === 'void') return '';
    const vb = b.cash ? 'Retiró con' : x.r === 'won' ? 'Ganó con' : 'Perdió con', sc = scoreCorto(m);
    return `<div class="ini-ln" data-goto="${esc(m.id)}">${caraPick(m, b.p)}<p>${b.p === 'X' ? `${vb} el <b>empate</b>` : `${vb} <b>${esc(pn(m, b.p))}</b>`}<small>${esc(m.a)} ${esc(sc || 'vs')} ${esc(m.b)}<span> · ${N(b.stake)} a ${O(b.o)}</span></small></p>${valor(x.r, x.v)}</div>`;
  }
  function lineaAb(x, f) {
    if (x.tipo === 'c') { const c = x.c, ls = legsDe(c), hechas = ls.filter((l) => l.result === 'won').length;
      return `<div class="ini-ln" data-scr="colegas"><span class="ini-ico ini-ico-c">${IC_CMB}</span><p><span class="ini-tag ${x.live ? 'rd' : ''}">${x.live ? '<i class="ini-pt"></i>' : ''}${hechas} de ${ls.length}</span><b>${N(c.stake)}</b>${conA()}una combinada de ${ls.length}<small>cobraría ${N(c.stake * Number(c.odds))}${coin()}</small></p><span class="ini-o">${O(c.odds)}</span></div>` }
    const { b, m } = x, live = m.live, va = live ? comoVa(m, b.p) : '';
    const tag = live ? `<span class="ini-tag rd"><i class="ini-pt"></i>en vivo${marcador(m) ? ' ' + marcador(m).join(':') : ''}</span>` : `<span class="ini-tag">${esc(empieza(t2(m.at)))}</span>`;
    if (!b.p) return `<div class="ini-ln" data-goto="${esc(m.id)}">${ligaImg(m)}<p>${tag}<b>${N(b.stake)}</b> apostados<small>${esc(m.a)} vs ${esc(m.b)}<span> · </span>se ve al empezar</small></p><span class="ini-lock">${LOCK}</span></div>`;
    const contra = whoOn(m.id).filter((w) => w.p && w.p !== b.p && w.k !== f.id).map((w) => (w.k === MEK ? 'ti' : fr(w.k).n));
    const quien = [...new Set(contra)];
    const der = live ? `<span class="ini-o">${O(b.o)}</span>` : isOpen(m) ? (isMine(m, b.p) ? '<span class="ini-tam">Tú también</span>' : `<button class="sumo ini-join" data-sumo="${esc(m.id)}|${b.p}">Me sumo</button>`) : `<span class="ini-o">${O(b.o)}</span>`;
    return `<div class="ini-ln" data-goto="${esc(m.id)}">${caraPick(m, b.p)}<p>${tag}<b>${N(b.stake)}</b>${b.p === 'X' ? conA(true) + 'empate' : conA() + esc(pn(m, b.p))}<small>${va ? `<span>${{ gana: 'va ganando', pierde: 'va perdiendo', empata: 'va empatando' }[va]}</span><span> · </span>` : ''}<span>cobraría ${N(b.stake * b.o)}</span>${coin()}${quien.length ? `<span> · contra ${quien.map(esc).join(', ')}</span>` : ''}</small></p>${der}</div>`;
  }
  function colAmigos(v, juegos) {
    const otros = F.filter((f) => !f.me), semana = Date.now() - 7 * DIA;
    if (!otros.length) return `<div class="ini-colh"><div class="ini-who"><h2>Amigos</h2></div></div>` + vacio(IC_GENTE, 'Aún no hay amigos en la app', 'Cuando entren, verás aquí lo que apuestan.', false);
    let nuevosTot = 0;
    const gente = otros.map((f) => {
      const rs = resueltas(f.id, f.uid, juegos).filter((x) => !(x.tipo === 'b' && x.b.st === 'void') && x.r !== 'void');
      const nuevos = v.prev ? rs.filter((x) => x.t > v.prev) : [];
      nuevosTot += nuevos.length;
      const ver = nuevos.length ? nuevos.slice(0, 3) : rs.filter((x) => x.t > semana).slice(0, 1);
      const ab = abiertas(f.id, f.uid);
      const mov = Math.max(0, ...ver.map((x) => x.t), ...ab.map((x) => x.puesta));
      return { f, ver, ab, mov, nuevos: nuevos.length };
    });
    const conAlgo = gente.filter((x) => x.ver.length || x.ab.length).sort((a, b) => b.mov - a.mov);
    const quietos = gente.filter((x) => !x.ver.length && !x.ab.length);
    const enJuego = gente.filter((x) => x.ab.length).length;
    const orden = [...conAlgo, ...quietos].map((x) => x.f);
    const head = `<div class="ini-colh"><div class="ini-stack">${orden.map((f, i) => av(f.id, i >= 4 ? 'ini-mas4' : '')).join('')}${orden.length > 4 ? `<span class="ini-stack-n">+${orden.length - 4}</span>` : ''}</div>
      <div class="ini-who"><h2>Amigos</h2><span class="lab">lo último de cada uno</span></div><div class="r"><span class="lab" data-notr>${en() ? 'in play' : 'en juego'}</span><b class="ini-big">${enJuego}</b></div></div>`;
    if (!conAlgo.length) return head + vacio(IC_GENTE, 'Tus amigos aún no se han movido', 'Cuando apuesten, sale aquí. Se apuesta en Partidos: toca una cuota y dale a Apostar.', true);
    const persona = (x) => {
      const f = x.f, ab = x.ab.slice(0, 3);
      return `<article class="ini-pp"><header data-prof="${f.id}">${av(f.id)}<div class="ini-who"><b>${esc(f.n)}</b><small>${N(f.s)}${coin()} · ${puesto(f)}</small></div><span class="ini-when">${esc(hace(x.mov))}</span></header>
        ${x.ver.map(lineaRes).join('')}${ab.map((y) => lineaAb(y, f)).join('')}${x.ab.length > 3 ? `<button class="ini-mas2" data-scr="colegas">y ${x.ab.length - 3} más en juego</button>` : ''}</article>`;
    };
    return head + `<div class="ini-sub"><h3>Por orden de movimiento</h3><span>${v.prev ? (nuevosTot ? `${nuevosTot} ${nuevosTot === 1 ? 'resultado nuevo' : 'resultados nuevos'}` : 'sin resultados nuevos') : ''}</span></div>
      <div class="ini-ppl">${conAlgo.map(persona).join('')}</div>
      ${quietos.length ? `<div class="ini-quietos"><span class="lab">Sin movimiento</span><span class="ini-quietos-c">${quietos.map((x) => av(x.f.id)).join('')}</span></div>` : ''}`;
  }

  /* ---------- la pantalla ---------- */
  let TAB = 'tu';
  function html() {
    if (!g(() => loaded)) return '';
    const v = visita(), juegos = juegosChat();
    if (window.GM_CMB) setTimeout(() => g(() => GM_CMB.carga()), 0);   // la primera vez y luego cada 30 s como mucho (lo frena combinadas.js)
    const tu = colTu(v, juegos), am = colAmigos(v, juegos);
    // el conmutador: lo neto tuyo y cuantos amigos tienen algo en juego
    const res = resueltas(MEK, ME, null), nuevos = v.prev ? res.filter((x) => x.t > v.prev) : [];
    const neto = (nuevos.length ? nuevos : res.filter((x) => x.t >= WEEK0)).reduce((a, x) => a + x.v, 0);
    const enJuego = F.filter((f) => !f.me && abiertas(f.id, f.uid).length).length;
    return `<div class="ini" data-tab="${TAB}">
      <div class="ini-segw"><nav class="ini-seg"><button type="button" data-ini="tu" class="${TAB === 'tu' ? 'on' : ''}">Tú${neto ? ` <i class="${neto > 0 ? 'up' : 'dn'}">${neto > 0 ? '▲' : '▼'} ${N(Math.abs(neto))}</i>` : ''}</button><button type="button" data-ini="am" class="${TAB === 'am' ? 'on' : ''}">Amigos <i>${enJuego} en juego</i></button></nav></div>
      <div class="ini-cols"><section class="ini-col ini-tu">${tu}</section><section class="ini-col ini-am">${am}</section></div>
    </div>`;
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ini]'); if (!b) return;
    TAB = b.dataset.ini === 'am' ? 'am' : 'tu';
    const w = document.querySelector('.ini'); if (!w) return;
    w.dataset.tab = TAB; w.querySelectorAll('[data-ini]').forEach((x) => x.classList.toggle('on', x.dataset.ini === TAB));
    const vw = document.getElementById('view'); if (vw) vw.scrollTop = 0;
    if (window.GM_SONIDOS) g(() => GM_SONIDOS.suena('clic'));
  });
  // las combinadas llegan despues de pintar: se repinta Inicio una vez cuando cambian
  addEventListener('gm:cmb-datos', () => { if (g(() => S.scr) === 'inicio' && !document.activeElement?.matches('input,textarea')) g(() => render()) });
  window.GM_INICIO = { html, visita: () => (V ? V.prev : 0) };
})();
