// Ficha de partido profesional (PM, 01-11: "cuando le das a un partido, cuando sale el top de la liga me gusta pero quiero que se vea un
// poco mejor, y las alineaciones y todo que sea mas profesional y bonito, un poco mas detallado"). Futbol y baloncesto.
// Sustituye lo que pintaba espnHtml (app.js) de alineaciones, ultimos 5 y clasificacion y le suma lo que ESPN ya daba y no se ensenaba:
// estadio, goles y tarjetas, estadisticas del partido jugado, cara a cara y goleadores del equipo.
// Todo sale de la respuesta de ESPN que ya pide app.js (summary: rosters, standings, lastFiveGames, seasonseries, keyEvents, boxscore,
// leaders, gameInfo, header) mas, solo para las bandas de la tabla (Champions, Europa, descenso), la tabla de la liga (apis/v2 standings).
// Es solo lectura: nunca toca dinero ni la base. app.js lo llama desde espnHtml: GM_FP.html(m, d) y GM_FP.esqueleto(m).
'use strict';
(function () {
  if (window.GM_FP) return;
  const g = (f, d) => { try { const v = f(); return v == null ? d : v } catch { return d } };
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (v) => { const x = parseFloat(v); return isNaN(x) ? null : x };
  const miles = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const PUNTOS = (s) => String(s ?? '').replace(/-/g, ':');   // marcadores como en el resto de la app: 5:0
  const IMG_ERR = `onerror="this.style.visibility='hidden'"`, IMG_QUITA = `onerror="this.remove()"`;

  /* ---------- iconos ---------- */
  const IC = {
    gol: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="#fff" stroke="#14161b" stroke-width="1.2"/><path d="M8 4.6l2.6 1.9-1 3H6.4l-1-3z" fill="#14161b"/><path d="M8 4.6V1.4M10.6 6.5l3-1M9.6 9.5l1.9 2.6M6.4 9.5l-1.9 2.6M5.4 6.5l-3-1" stroke="#14161b" stroke-width="1"/></svg>',
    pp: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="#e0646f" stroke="#14161b" stroke-width="1.2"/><path d="M8 4.6l2.6 1.9-1 3H6.4l-1-3z" fill="#14161b"/></svg>',
    am: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="1.5" width="9" height="13" rx="1.6" fill="#f5c542" stroke="#14161b" stroke-width="1"/></svg>',
    ro: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="1.5" width="9" height="13" rx="1.6" fill="#e5484d" stroke="#14161b" stroke-width="1"/></svg>',
    ent: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="#2bd47d" stroke="#14161b" stroke-width="1.2"/><path d="M8 12V4.6M4.8 7.6L8 4.4l3.2 3.2" fill="none" stroke="#0b1a12" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    sal: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="#e0646f" stroke="#14161b" stroke-width="1.2"/><path d="M8 4V11.4M4.8 8.4L8 11.6l3.2-3.2" fill="none" stroke="#1d0a0c" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  /* ---------- datos de ESPN ---------- */
  const comp = (d) => g(() => d.header.competitions[0], {});
  const estado = (m, d) => g(() => comp(d).status.type.state, m.live ? 'in' : m.status === 'final' ? 'post' : 'pre');   // pre, in, post
  const idsDe = (m, d) => {
    const ids = { a: String(g(() => m.espn.ids.a, '')), b: String(g(() => m.espn.ids.b, '')) };
    const cs = comp(d).competitors || [];
    if (!ids.a || !ids.b) { const h = cs.find((c) => c.homeAway === 'home'), a = cs.find((c) => c.homeAway === 'away'); if (h && a) { ids.a = ids.a || String(h.team?.id || h.id); ids.b = ids.b || String(a.team?.id || a.id) } }
    return ids;
  };
  const ladoDe = (ids, id) => (String(id) === ids.a ? 'a' : String(id) === ids.b ? 'b' : null);
  const eqInfo = (m, d, side) => {
    const ids = idsDe(m, d), c = (comp(d).competitors || []).find((x) => String(x.team?.id || x.id) === ids[side]);
    return { id: ids[side], nombre: side === 'a' ? m.a : m.b, abr: c?.team?.abbreviation || '', color: c?.team?.color, alt: c?.team?.alternateColor, form: c?.team?.form || '' };
  };
  const crest = (m, side, cls) => (typeof logo === 'function' ? logo(m, side).replace('class="', `class="${cls || ''} `) : '');
  const crestId = (liga, id, dep) => `<img class="fp-c" src="https://a.espncdn.com/i/teamlogos/${dep === 'b' ? 'nba' : 'soccer'}/500/${esc(id)}.png" alt="" loading="lazy" ${IMG_ERR}>`;

  const H = (t, sub, cls) => `<header class="fp-sh ${cls || ''}"><h4>${t}</h4>${sub ? `<span>${sub}</span>` : ''}</header>`;
  const SEC = (id, t, sub, body, cls) => `<section class="fp-s ${cls || ''}" data-fp="${id}">${H(t, sub)}${body}</section>`;

  /* ---------- ficha del partido: estadio, arbitro, hora ---------- */
  function datos(m, d) {
    const gi = d.gameInfo || {}, v = gi.venue || {}, of = (gi.officials || []).find((o) => /referee|árbitro|arbitro/i.test(o.position?.displayName || o.position?.name || '')) || (gi.officials || [])[0];
    const ciudad = [v.address?.city, v.address?.state || v.address?.country].filter(Boolean).join(', ');
    const it = [];
    if (v.fullName) it.push([['Estadio', 'est'], `<b data-notr>${esc(v.fullName)}</b>${ciudad ? `<small data-notr>${esc(ciudad)}</small>` : ''}`]);
    if (of?.displayName || of?.fullName) it.push([['Árbitro', 'arb'], `<b data-notr>${esc(of.displayName || of.fullName)}</b>`]);
    const asis = num(gi.attendance);
    if (asis > 0) it.push([['Asistencia', 'asi'], `<b>${miles(asis)}</b>`]);
    if (typeof HM === 'function' && m.at) it.push([['Hora local', 'hor'], `<b>${esc(WD(m.at))} ${esc(DD(m.at))} ${esc(MO(m.at))}</b><small>${esc(HM(m.at))}</small>`]);
    if (!it.length) return '';
    return `<div class="fp-fx">${it.map(([[t], h]) => `<div><span class="lab">${t}</span>${h}</div>`).join('')}</div>`;
  }

  /* ---------- goles y tarjetas (partido empezado) ---------- */
  function resumen(m, d) {
    const ids = idsDe(m, d), ev = [];
    for (const k of d.keyEvents || []) {
      const t = String(k.type?.type || '') + ' ' + String(k.type?.text || '');
      const lado = ladoDe(ids, k.team?.id); if (!lado) continue;
      const nombre = k.participants?.[0]?.athlete?.displayName || (k.shortText || '').replace(/\s+(Goal|Penalty|Yellow|Red).*/i, '');
      let tipo = null;
      if (k.scoringPlay) tipo = /own/i.test(t) ? 'pp' : /penalty/i.test(t) ? 'pe' : 'gol';
      else if (/yellow.?red|second.?yellow/i.test(t)) tipo = 'ro';
      else if (/red.?card/i.test(t)) tipo = 'ro';
      else if (/yellow.?card/i.test(t)) tipo = 'am';
      if (!tipo) continue;
      ev.push({ lado, tipo, min: k.clock?.displayValue || '', nombre, t: k.clock?.value ?? 0 });
    }
    if (!ev.length) return '';
    ev.sort((x, y) => x.t - y.t);
    const filas = ev.map((e) => {
      const ic = e.tipo === 'am' ? IC.am : e.tipo === 'ro' ? IC.ro : e.tipo === 'pp' ? IC.pp : IC.gol;
      const txt = `<span class="fp-ev-t"><i class="fp-ic">${ic}</i><b data-notr>${esc(e.nombre)}</b>${e.tipo === 'pe' ? '<small>p</small>' : e.tipo === 'pp' ? '<small>pp</small>' : ''}</span>`;
      return `<div class="fp-ev ${e.tipo}">${e.lado === 'a' ? txt : '<span></span>'}<em>${esc(e.min)}</em>${e.lado === 'b' ? txt : '<span></span>'}</div>`;
    }).join('');
    const goles = ev.filter((e) => /gol|pe|pp/.test(e.tipo));
    return SEC('res', 'Goles y tarjetas', '', `<div class="fp-evs">${filas}</div>`, 'fp-res');
  }

  /* ---------- alineaciones: el campo ---------- */
  const lum = (hex) => { const h = String(hex || '').replace('#', ''); if (h.length !== 6) return 0.5; const [r, gg, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * gg + 0.0722 * b };
  const rgb = (hex) => { const h = String(hex || '').replace('#', ''); return h.length === 6 ? [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) : [128, 128, 128] };
  const dist = (a, b) => { const x = rgb(a), y = rgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) };
  function colores(ra, rb) {
    const col = (r) => '#' + String(r?.uniform?.color || r?.team?.color || '888888').replace('#', '');
    const alt = (r) => '#' + String(r?.uniform?.alternateColor || r?.team?.alternateColor || '4d88e6').replace('#', '');
    let a = col(ra), b = col(rb);
    if (dist(a, b) < 110) { b = dist(a, alt(rb)) >= 110 ? alt(rb) : lum(a) > 0.5 ? '#1e4fb8' : '#f2f2f2' }
    return { a, b };
  }
  const DEPTH = (p) => { const a = String(p || '').toUpperCase(); if (/^(G|GK)$/.test(a)) return 0; if (/^(LWB|RWB|WB)/.test(a)) return 1.6; if (/^(CDM|DM)/.test(a)) return 2.4; if (/^(CD|CB|SW|LB|RB|D)/.test(a)) return 1; if (/^(CAM|AM)/.test(a)) return 4; if (/^(LW|RW)/.test(a)) return 4.6; if (/^(F|CF|ST|SS|FW|LF|RF)/.test(a)) return 5; return 3 };
  const LADO = (p) => { const a = String(p || '').toUpperCase(); if (/-L$/.test(a)) return -1; if (/-R$/.test(a)) return 1; if (/^L/.test(a)) return -2; if (/^R/.test(a)) return 2; return 0 };   // CD-L un poco a la izquierda, LB y LM del todo
  // Coloca los once segun la formacion: portero y una fila por cada numero (4 2 3 1 = defensas, pivotes, mediapuntas, delantero)
  function colocar(xi, formacion) {
    const n = String(formacion || '').split(/[^0-9]+/).filter(Boolean).map(Number);
    if (!n.length || n.reduce((s, x) => s + x, 0) !== 10 || xi.length !== 11) return null;
    const portero = xi.find((p) => DEPTH(p.pos) === 0) || xi.slice().sort((x, y) => x.place - y.place)[0];
    const resto = xi.filter((p) => p !== portero).sort((x, y) => DEPTH(x.pos) - DEPTH(y.pos) || x.place - y.place);
    const filas = [[portero]]; let i = 0;
    for (const k of n) { filas.push(resto.slice(i, i + k).sort((x, y) => LADO(x.pos) - LADO(y.pos) || x.place - y.place)); i += k }
    return filas;
  }
  function eventosJugador(x) {
    const e = { gol: [], pp: 0, pe: 0, am: null, ro: null, ent: null, sal: null };
    for (const p of x.plays || []) {
      const min = p.clock?.displayValue || '';
      if (p.scoringPlay) { if (p.ownGoal) e.pp++; else { e.gol.push(min); if (p.penaltyKick) e.pe++ } }
      else if (p.redCard) e.ro = min;
      else if (p.yellowCard) e.am = min;
      else if (p.substitution) { if (x.starter) e.sal = min; else e.ent = min }
    }
    if (x.starter && x.subbedOut && e.sal == null) e.sal = '';
    if (!x.starter && x.subbedIn && e.ent == null) e.ent = '';
    return e;
  }
  const apellido = (a) => String(a?.lastName || String(a?.displayName || a?.shortName || '').split(' ').slice(-1)[0] || '');
  const insignias = (e) => {
    const b = [];
    if (e.gol.length) b.push(`<i class="fp-bd" title="Gol ${esc(e.gol.join(', '))}">${IC.gol}${e.gol.length > 1 ? `<s>${e.gol.length}</s>` : ''}</i>`);
    if (e.pp) b.push(`<i class="fp-bd" title="En propia puerta">${IC.pp}</i>`);
    if (e.ro != null) b.push(`<i class="fp-bd" title="Roja ${esc(e.ro)}">${IC.ro}</i>`);
    else if (e.am != null) b.push(`<i class="fp-bd" title="Amarilla ${esc(e.am)}">${IC.am}</i>`);
    if (e.sal != null) b.push(`<i class="fp-bd" title="Sale ${esc(e.sal)}">${IC.sal}</i>`);
    return b.length ? `<span class="fp-bds">${b.join('')}</span>` : '';
  };
  function fichaje(x, e) {
    const a = x.athlete || {};
    return { n: x.jersey || '', nombre: apellido(a), full: a.displayName || '', pos: x.position?.abbreviation || '', place: parseInt(x.formationPlace) || 0, foto: a.headshot?.href || '', e, x };
  }
  function ficha(p) { return p }
  function jugadorHtml(p, color, x, y) {
    const lt = lum(color) > 0.6 ? '#101216' : '#fff';
    return `<div class="fp-pl" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%" title="${esc(p.full)}${p.pos ? ' · ' + esc(p.pos) : ''}">
      <span class="fp-d" style="--k:${color};--kt:${lt}">${p.foto ? `<img src="${esc(p.foto)}" alt="" loading="lazy" ${IMG_QUITA}>` : ''}<b>${esc(p.n)}</b>${insignias(p.e)}</span><span class="fp-nm" data-notr>${esc(p.nombre)}</span></div>`;
  }
  const PISTA = '<svg class="fp-pista" viewBox="0 0 68 105" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="rgba(255,255,255,.24)" stroke-width=".35"><rect x="1.2" y="1.2" width="65.6" height="102.6" rx="1"/><path d="M1.2 52.5h65.6"/><circle cx="34" cy="52.5" r="9.15"/><rect x="13.85" y="1.2" width="40.3" height="16.5"/><rect x="24.85" y="1.2" width="18.3" height="5.5"/><path d="M27.56 17.7A9.15 9.15 0 0 0 40.44 17.7"/><rect x="13.85" y="87.3" width="40.3" height="16.5"/><rect x="24.85" y="98.3" width="18.3" height="5.5"/><path d="M27.56 87.3A9.15 9.15 0 0 1 40.44 87.3"/></g><g fill="rgba(255,255,255,.3)"><circle cx="34" cy="52.5" r=".5"/><circle cx="34" cy="11.2" r=".45"/><circle cx="34" cy="93.8" r=".45"/></g></svg>';

  function alineaciones(m, d) {
    const ids = idsDe(m, d), R = {};
    for (const r of d.rosters || []) { const lado = ladoDe(ids, r.team?.id); if (lado && (r.roster || []).some((x) => x.starter)) R[lado] = r }
    if (!R.a || !R.b) return null;
    const col = colores(R.a, R.b), cols = { a: col.a, b: col.b };
    const equipos = {};
    for (const s of ['a', 'b']) {
      const todos = R[s].roster.map((x) => fichaje(x, eventosJugador(x)));
      equipos[s] = { r: R[s], xi: todos.filter((p) => p.x.starter), banco: todos.filter((p) => !p.x.starter) };
    }
    const filasA = colocar(equipos.a.xi, R.a.formation), filasB = colocar(equipos.b.xi, R.b.formation);
    const form = (s) => String(R[s].formation || '').replace(/[^0-9]+/g, '·').replace(/^·|·$/g, '');
    const cab = (s, cls) => `<div class="fp-eq ${cls}"><span class="fp-eq-i">${crest(m, s, 'fp-lg')}<b data-notr>${esc(s === 'a' ? m.a : m.b)}</b></span>${form(s) ? `<span class="fp-fo">${esc(form(s))}</span>` : ''}</div>`;
    let campo;
    if (filasA && filasB) {
      const pon = (filas, s) => { let h = ''; const K = filas.length - 1;
        filas.forEach((fila, k) => {
          const y0 = 6.8 + (k / K) * 36.8, y = s === 'a' ? y0 : 100 - y0;
          fila.forEach((p, i) => { const xl = fila.length === 1 ? 50 : 9 + (82 * (i + 0.5)) / fila.length; h += jugadorHtml(p, cols[s], s === 'a' ? 100 - xl : xl, y) });
        }); return h };
      campo = `<div class="fp-campo">${PISTA}${pon(filasA, 'a')}${pon(filasB, 'b')}</div>`;
    } else {
      // sin formacion: lista por posicion
      const lista = (s) => { const orden = equipos[s].xi.slice().sort((x, y) => DEPTH(x.pos) - DEPTH(y.pos) || x.place - y.place);
        return `<div class="fp-lista"><div class="fp-eq">${crest(m, s, 'fp-lg')}<b data-notr>${esc(s === 'a' ? m.a : m.b)}</b></div>${orden.map((p) => `<div class="fp-lr"><span class="fp-d sm" style="--k:${cols[s]};--kt:${lum(cols[s]) > 0.6 ? '#101216' : '#fff'}"><b>${esc(p.n)}</b></span><b data-notr>${esc(p.full)}</b><i>${esc(p.pos)}</i>${insignias(p.e)}</div>`).join('')}</div>` };
      campo = `<div class="fp-listas">${lista('a')}${lista('b')}</div>`;
    }
    const banco = (s) => {
      const b = equipos[s].banco.slice().sort((x, y) => (y.e.ent != null) - (x.e.ent != null) || (parseInt(x.n) || 99) - (parseInt(y.n) || 99));
      if (!b.length) return '';
      return `<div class="fp-bq"><div class="fp-eq">${crest(m, s, 'fp-lg')}<b data-notr>${esc(s === 'a' ? m.a : m.b)}</b><span class="lab">Suplentes</span></div><div class="fp-bqs">${b.map((p) => `<span class="fp-sp ${p.e.ent != null ? 'in' : ''}" title="${esc(p.full)}"><em style="--k:${cols[s]};--kt:${lum(cols[s]) > 0.6 ? '#101216' : '#fff'}">${esc(p.n)}</em><b data-notr>${esc(p.nombre)}</b>${p.e.ent != null ? `<i class="fp-bd">${IC.ent}</i>${p.e.ent ? `<small>${esc(p.e.ent)}</small>` : ''}` : ''}${p.e.gol.length ? `<i class="fp-bd">${IC.gol}</i>` : ''}${p.e.ro != null ? `<i class="fp-bd">${IC.ro}</i>` : p.e.am != null ? `<i class="fp-bd">${IC.am}</i>` : ''}</span>`).join('')}</div></div>`;
    };
    const sub = estado(m, d) === 'pre' ? '' : 'Titulares y cambios';
    return SEC('ali', 'Alineaciones', sub, `<div class="fp-ali">${filasA && filasB ? cab('a', 'top') : ''}${campo}${filasA && filasB ? cab('b', 'bot') : ''}</div><div class="fp-bqw">${banco('a')}${banco('b')}</div>`, 'fp-sali');
  }
  // los once todavia no estan: bloque bonito con los jugadores a seguir
  function alineacionesPendientes(m, d) {
    const ids = idsDe(m, d), cuerpo = ['a', 'b'].map((s) => {
      const t = (d.leaders || []).find((x) => ladoDe(ids, x.team?.id) === s), gl = t?.leaders?.find((l) => /goal/i.test(l.name));
      return gl ? s : null;
    });
    return `<div class="fp-pend"><div class="fp-pend-c">${PISTA.replace('preserveAspectRatio="none"', 'preserveAspectRatio="xMidYMid slice"')}<div class="fp-pend-t"><b>Las alineaciones salen sobre una hora antes</b><span>Cuando los equipos las den, aquí verás los once colocados en el campo, con su dorsal, los suplentes y los cambios.</span></div></div></div>`;
  }

  /* ---------- baloncesto: el quinteto ---------- */
  function quinteto(m, d) {
    const ids = idsDe(m, d), B = g(() => d.boxscore.players, []);
    const eq = {};
    for (const t of B) { const lado = ladoDe(ids, t.team?.id); const st = t.statistics?.[0]; if (lado && st?.athletes?.length) eq[lado] = st }
    if (!eq.a || !eq.b) return null;
    const bloque = (s) => {
      const st = eq[s], lab = st.labels || [], ix = (k) => lab.indexOf(k);
      const fila = (a, grande) => { const v = a.stats || [], pts = v[ix('PTS')] ?? '', reb = v[ix('REB')] ?? '', ast = v[ix('AST')] ?? '', min = v[ix('MIN')] ?? '';
        const au = a.athlete || {}, jug = !a.didNotPlay && v.length;
        return `<div class="fp-nb ${grande ? '' : 'sm'} ${jug ? '' : 'off'}"><span class="fp-ph">${au.headshot?.href ? `<img src="${esc(au.headshot.href)}" alt="" loading="lazy" ${IMG_QUITA}>` : ''}<b>${esc(au.jersey || '')}</b></span><span class="fp-nbn"><b data-notr>${esc(au.shortName || au.displayName || '')}</b><small>${esc(au.position?.abbreviation || '')}${min && jug ? ` · ${esc(min)}'` : ''}</small></span>${jug ? `<span class="fp-ps"><b>${esc(pts)}</b><small>PTS</small></span><span class="fp-ps"><b>${esc(reb)}</b><small>REB</small></span><span class="fp-ps"><b>${esc(ast)}</b><small>AST</small></span>` : '<span class="fp-ps nj">No juega</span>'}</div>` };
      const ini = st.athletes.filter((a) => a.starter), ban = st.athletes.filter((a) => !a.starter && !a.didNotPlay && (a.stats || []).length).sort((x, y) => (num(y.stats[ix('PTS')]) || 0) - (num(x.stats[ix('PTS')]) || 0)).slice(0, 4);
      return `<div class="fp-nbq"><div class="fp-eq">${crest(m, s, 'fp-lg')}<b data-notr>${esc(s === 'a' ? m.a : m.b)}</b></div>${ini.map((a) => fila(a, true)).join('')}${ban.length ? `<span class="lab fp-mini">Banquillo</span>${ban.map((a) => fila(a, false)).join('')}` : ''}</div>`;
    };
    return SEC('ali', 'Quinteto inicial', 'Puntos, rebotes y asistencias', `<div class="fp-nbs">${bloque('a')}${bloque('b')}</div>`, 'fp-sali');
  }
  function aSeguir(m, d) {   // baloncesto sin empezar: los lideres de cada equipo con su foto, un jugador una sola vez
    const ids = idsDe(m, d), K = { points: 0, pointsPerGame: 0, assists: 1, assistsPerGame: 1, rebounds: 2, reboundsPerGame: 2 };
    const col = ['a', 'b'].map((s) => {
      const t = (d.leaders || []).find((x) => ladoDe(ids, x.team?.id) === s); if (!t) return '';
      const P = new Map();
      for (const l of t.leaders || []) { const x = l.leaders?.[0], k = K[l.name]; if (!x?.athlete || k == null) continue;
        const e = P.get(x.athlete.id) || { a: x.athlete, v: ['', '', ''] }; e.v[k] = String(x.displayValue || '').replace(/[^0-9.,]/g, ''); P.set(x.athlete.id, e) }
      const f = [...P.values()].map(({ a, v }) => `<div class="fp-nb sm"><span class="fp-ph">${a.headshot?.href ? `<img src="${esc(a.headshot.href)}" alt="" loading="lazy" ${IMG_QUITA}>` : ''}<b>${esc(a.jersey || '')}</b></span><span class="fp-nbn"><b data-notr>${esc(a.shortName || a.displayName)}</b><small>${esc(a.position?.abbreviation || '')}</small></span>${['PTS', 'AST', 'REB'].map((n, i) => `<span class="fp-ps ${v[i] ? '' : 'vac'}"><b>${v[i] ? esc(v[i]) : '·'}</b><small>${n}</small></span>`).join('')}</div>`).join('');
      return f ? `<div class="fp-nbq"><div class="fp-eq">${crest(m, s, 'fp-lg')}<b data-notr>${esc(s === 'a' ? m.a : m.b)}</b></div>${f}</div>` : '';
    }).join('');
    return col ? SEC('ali', 'Jugadores a seguir', 'Medias por partido de esta temporada', `<div class="fp-nbs">${col}</div>`, 'fp-sali') : '';
  }

  /* ---------- estadisticas del partido jugado ---------- */
  function estadisticas(m, d) {
    const ts = g(() => d.boxscore.teams, []);
    const A = ts.find((t) => String(t.team?.id) === idsDe(m, d).a) || ts[0], B = ts.find((t) => String(t.team?.id) === idsDe(m, d).b) || ts[1];
    const val = (t, k) => { const x = t?.statistics?.find((s) => s.name === k); return x ? parseFloat(x.displayValue) : null };
    const defs = typeof STATS !== 'undefined' ? STATS : [['possessionPct', 'Posesión', '%'], ['totalShots', 'Tiros'], ['shotsOnTarget', 'A puerta'], ['wonCorners', 'Córners'], ['foulsCommitted', 'Faltas'], ['yellowCards', 'Amarillas'], ['redCards', 'Rojas'], ['offsides', 'Fueras de juego']];
    const rows = defs.map(([k, n, u]) => [n, val(A, k), val(B, k), u]).filter((r) => r[1] != null && r[2] != null);
    if (!rows.length) return '';
    return SEC('sts', 'Estadísticas', '', `<div class="fp-sth">${crest(m, 'a', 'fp-lg')}<span></span>${crest(m, 'b', 'fp-lg')}</div><div class="sts fp-sts">${rows.map(([n, a, b, u]) => { const t = a + b || 1; return `<div class="st2"><span class="${a > b ? 'ga' : ''}">${a}${u || ''}</span><span class="k">${n}</span><span class="${b > a ? 'ga' : ''}">${b}${u || ''}</span><i class="bar"><b style="width:${(a / t) * 100}%"></b><b style="width:${(b / t) * 100}%"></b></i></div>` }).join('')}</div>`);
  }

  /* ---------- forma ---------- */
  function forma(m, d) {
    const l5 = d.lastFiveGames; if (!Array.isArray(l5) || !l5.length) return '';
    const ids = idsDe(m, d);
    const blq = (s) => {
      const t = l5.find((x) => String(x.team?.id) === ids[s]) || l5[s === 'a' ? 0 : 1]; if (!t) return '';
      const ev = (t.events || []).slice(0, 5); if (!ev.length) return '';
      const cuenta = { G: 0, E: 0, P: 0 };
      const cel = ev.map((e) => { const r = String(e.gameResult || '').toUpperCase(), k = r === 'W' ? 'g' : r === 'D' ? 'e' : r === 'L' ? 'p' : '';
        if (k) cuenta[{ g: 'G', e: 'E', p: 'P' }[k]]++;
        const fuera = e.atVs === '@', sc = [fuera ? e.awayTeamScore : e.homeTeamScore, fuera ? e.homeTeamScore : e.awayTeamScore];
        return `<div class="fp-fc"><b class="${k}">${r === 'W' ? 'G' : r === 'D' ? 'E' : r === 'L' ? 'P' : '·'}</b><small data-notr>${esc(e.opponent?.abbreviation || '')}</small><em>${sc[0] != null ? esc(sc[0] + ':' + sc[1]) : ''}</em></div>` }).join('');
      return `<div class="fp-fb"><div class="fp-eq">${crest(m, s, 'fp-lg')}<b data-notr>${esc(s === 'a' ? m.a : m.b)}</b><span class="fp-fr">${cuenta.G}G ${cuenta.E}E ${cuenta.P}P</span></div><div class="fm fp-f">${cel}</div></div>`;
    };
    const h = blq('a') + blq('b'); return h ? SEC('for', 'Forma', 'Últimos 5 partidos', `<div class="fp-fo2">${h}</div>`) : '';
  }
  // los cinco puntos de forma de un equipo (para la tabla)
  const puntos = (d, id) => {
    const t = (d.lastFiveGames || []).find((x) => String(x.team?.id) === String(id)); if (!t) return '';
    const dots = (t.events || []).slice(0, 5).map((e) => { const r = String(e.gameResult || '').toUpperCase(); return `<b class="${r === 'W' ? 'g' : r === 'D' ? 'e' : r === 'L' ? 'p' : ''}">${r === 'W' ? 'G' : r === 'D' ? 'E' : r === 'L' ? 'P' : '·'}</b>` }).join('');
    return dots ? `<span class="fm fp-f fp-tf">${dots}</span>` : '';
  };

  /* ---------- cara a cara ---------- */
  function caraACara(m, d) {
    const ss = (d.seasonseries || []).find((s) => /head/i.test(s.type || s.seriesLabel || '')) || (d.seasonseries || [])[0]; if (!ss) return '';
    const ids = idsDe(m, d), ev = (ss.events || []).filter((e) => /post/i.test(e.status || e.statusType?.state || ''));
    if (!ev.length) return '';
    const cuenta = { a: 0, e: 0, b: 0 };
    const filas = ev.slice(0, 5).map((e) => {
      const cs = e.competitors || [], A = cs.find((c) => String(c.team?.id) === ids.a), B = cs.find((c) => String(c.team?.id) === ids.b); if (!A || !B) return '';
      const sa = num(A.score), sb = num(B.score);
      if (sa != null && sb != null) { if (sa > sb) cuenta.a++; else if (sb > sa) cuenta.b++; else cuenta.e++ }
      const local = cs.find((c) => c.homeAway === 'home') || cs[0], vis = cs.find((c) => c !== local) || cs[1];
      const f = new Date(e.date), fecha = isNaN(f) ? '' : f.toLocaleDateString(document.documentElement.lang === 'en' ? 'en-GB' : 'es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).replace(/\./g, '');
      return `<div class="fp-hr"><span class="fp-hd">${esc(fecha)}</span><span class="fp-ht l ${local.winner ? 'w' : ''}" data-notr>${esc(local.team?.abbreviation || local.team?.displayName || '')}</span><b>${esc(local.score ?? '')}:${esc(vis.score ?? '')}</b><span class="fp-ht ${vis.winner ? 'w' : ''}" data-notr>${esc(vis.team?.abbreviation || vis.team?.displayName || '')}</span></div>`;
    }).join('');
    const tot = cuenta.a + cuenta.e + cuenta.b || 1;
    if (!filas.trim()) return '';
    const barra = `<div class="fp-hb"><span style="flex:${cuenta.a || 0.001}" class="a"></span><span style="flex:${cuenta.e || 0.001}" class="e"></span><span style="flex:${cuenta.b || 0.001}" class="b"></span></div>
      <div class="fp-hn"><span><b>${cuenta.a}</b> <small data-notr>${esc(m.a)}</small></span><span><b>${cuenta.e}</b> <small>Empates</small></span><span><b>${cuenta.b}</b> <small data-notr>${esc(m.b)}</small></span></div>`;
    return SEC('h2h', 'Cara a cara', 'Últimos duelos', barra + `<div class="fp-hs">${filas}</div>`);
  }

  /* ---------- goleadores del equipo (antes del partido) ---------- */
  function goleadores(m, d) {
    const ids = idsDe(m, d), col = ['a', 'b'].map((s) => {
      const t = (d.leaders || []).find((x) => ladoDe(ids, x.team?.id) === s), gl = t?.leaders?.find((l) => /^goals/i.test(l.name)); if (!gl) return '';
      const f = (gl.leaders || []).slice(0, 3).map((x) => { const gm = /Goals:\s*(\d+)/i.exec(x.displayValue || ''), pj = /Matches:\s*(\d+)/i.exec(x.displayValue || '');
        return `<div class="fp-gl"><b class="num">${gm ? gm[1] : ''}</b><span><b data-notr>${esc(x.athlete?.displayName || '')}</b><small>${esc(x.athlete?.position?.abbreviation || '')}${pj ? ` · ${pj[1]} <i>PJ</i>` : ''}</small></span></div>` }).join('');
      return `<div class="fp-gc"><div class="fp-eq">${crest(m, s, 'fp-lg')}<b data-notr>${esc(s === 'a' ? m.a : m.b)}</b></div>${f}</div>`;
    }).join('');
    return col.trim() ? SEC('gol', 'Goleadores del equipo', 'Esta temporada', `<div class="fp-gs">${col}</div>`) : '';
  }

  /* ---------- clasificacion ---------- */
  const V2 = new Map();   // liga -> { t, ent: [grupos], cargando }
  const ABIERTAS = new Set();
  const LAST = new Map();  // id de partido -> { m, d } para repintar la tabla cuando llegan las bandas
  const dep = (m) => m.espn?.sport || (m.s === 'b' ? 'basketball' : 'soccer');
  function pidev2(m) {
    const k = dep(m) + '/' + m.espn.league, c = V2.get(k);
    if (c && (c.ent || Date.now() - c.t < 3e4) && (!c.ent || Date.now() - c.t < 18e5)) return c;
    if (c && c.cargando) return c;
    const nuevo = { t: Date.now(), cargando: true, ent: c?.ent || null }; V2.set(k, nuevo);
    fetch(`https://site.api.espn.com/apis/v2/sports/${dep(m)}/${m.espn.league}/standings`).then((r) => (r.ok ? r.json() : null)).then((j) => {
      const ch = j?.children?.length ? j.children : j?.standings ? [j] : [];
      V2.set(k, { t: Date.now(), cargando: false, ent: ch.map((x) => ({ nombre: x.name || x.abbreviation || '', entries: x.standings?.entries || [] })).filter((x) => x.entries.length) });
      repinta(k);
    }).catch(() => V2.set(k, { t: Date.now(), cargando: false, ent: c?.ent || null, fallo: true }));
    return nuevo;
  }
  function repinta(k) {
    for (const [id, x] of LAST) {
      if (dep(x.m) + '/' + x.m.espn.league !== k) continue;
      const el = document.querySelector(`#espn-box[data-m="${id}"] [data-fp="tab"], .vnt-espn [data-fp="tab"][data-mid="${id}"]`); if (!el) continue;
      const h = tabla(x.m, x.d, true); if (!h) continue;
      const t = document.createElement('div'); t.innerHTML = h; const nuevo = t.firstElementChild;
      el.replaceWith(nuevo); if (window.GM_LANG) GM_LANG.traduce(nuevo);
    }
  }
  const NOTA = (n) => {
    const t = String(n?.description || ''), c = n?.color || '';
    if (/champions/i.test(t) && !/round|play/i.test(t)) return ['#4d88e6', 'Champions League'];
    if (/europa/i.test(t)) return ['#f2994a', 'Europa League'];
    if (/conference/i.test(t)) return ['#2bd4a8', 'Conference League'];
    if (/relegation play|promotion play|play.?off/i.test(t)) return ['#b48cf0', /relegation/i.test(t) ? 'Promoción de descenso' : /promotion/i.test(t) ? 'Playoff de ascenso' : 'Playoff'];
    if (/releg/i.test(t)) return ['#e0646f', 'Descenso'];
    if (/promot/i.test(t)) return ['#2bd47d', 'Ascenso'];
    if (/round of 16|knockout|next round|qualif/i.test(t)) return ['#2bd47d', 'Clasifica'];
    return t ? [String(c).replace(/^#+/, '#') || '#99a0aa', t] : null;
  };
  function tabla(m, d, soloV2) {
    const futbol = dep(m) === 'soccer', en = document.documentElement.lang === 'en';
    const ids = new Set([...Object.values(m.espn?.ids || {}).map(String), ...(comp(d).competitors || []).map((c) => String(c.team?.id || c.id))]);
    const v2 = m.espn?.league ? pidev2(m) : null;
    let grupos = [];
    const sumGrupos = g(() => d.standings.groups, []).map((x) => ({ nombre: x.header || x.name || '', entries: x.standings?.entries || [] })).filter((x) => x.entries.length);
    if (futbol) grupos = sumGrupos.length ? sumGrupos : v2?.ent || [];
    else grupos = v2?.ent || [];
    grupos = grupos.filter((x) => x.entries.some((e) => ids.has(String(e.id || e.team?.id))));
    LAST.set(m.id, { m, d });
    if (!grupos.length) {
      if (!futbol && (!v2 || v2.cargando)) return `<section class="fp-s fp-tab" data-fp="tab" data-mid="${esc(m.id)}">${H('Clasificación', '')}<div class="fp-tsk">${'<i></i>'.repeat(8)}</div></section>`;
      return '';
    }
    LAST.set(m.id, { m, d });
    // notas (Champions, Europa, descenso) por equipo: de la tabla de la liga de ESPN
    const notas = new Map(), vistos = new Map();
    if (futbol && v2?.ent) for (const gr of v2.ent) for (const e of gr.entries) { const n = NOTA(e.note); if (n) notas.set(String(e.team?.id || e.id), n) }
    for (const gr of grupos) for (const e of gr.entries) { const n = notas.get(String(e.id || e.team?.id)) || (futbol ? NOTA(e.note) : null); if (n) notas.set(String(e.id || e.team?.id), n) }
    const cols = futbol
      ? [['gamesPlayed', 'PJ', ''], ['wins', 'G', 'w'], ['ties', 'E', 'w'], ['losses', 'P', 'w'], ['pointDifferential', 'DG', ''], ['points', 'Pts', 'b']]
      : [['wins', 'G', ''], ['losses', 'P', ''], ['winPercent', '%', 'b'], ['gamesBehind', 'DIF', 'w'], ['streak', 'Racha', 'w']];
    const gn = `3px 24px 22px minmax(0,1fr) ${cols.filter((c) => c[2] !== 'w').map((c) => (c[2] === 'b' ? '40px' : '28px')).join(' ')}`;
    const gw = `3px 28px 24px minmax(0,1fr) ${cols.map((c) => (c[2] === 'b' ? '46px' : c[0] === 'streak' || c[0] === 'gamesBehind' ? '44px' : '32px')).join(' ')}`;
    const val = (e, k) => { const s = e.stats?.find((x) => x.name === k || x.type === k); if (k === 'gamesPlayed' && !s) { const w = num(e.stats?.find((x) => x.name === 'wins')?.value), l = num(e.stats?.find((x) => x.name === 'losses')?.value); return w != null && l != null ? String(w + l) : '' } return s ? (s.displayValue ?? String(s.value ?? '')) : '' };
    const rank = (e, i) => num(e.stats?.find((x) => x.name === 'rank')?.value) ?? i + 1;
    const pct = (e) => num(e.stats?.find((x) => x.name === 'winPercent')?.value) ?? -1;
    let h = '', leyenda = new Map();
    for (const gr of grupos) {
      let es = gr.entries.map((e, i) => ({ e, r: rank(e, i), i })); if (!futbol) { es.sort((x, y) => pct(y.e) - pct(x.e) || x.i - y.i); es.forEach((x, i) => { x.r = i + 1 }) } else if (es.every((x) => x.r != null)) es.sort((x, y) => x.r - y.r || x.i - y.i);
      const N = es.length, mias = es.map((x, i) => (ids.has(String(x.e.id || x.e.team?.id)) ? i : -1)).filter((i) => i >= 0);
      const vis = new Set([0, 1, 2, 3]); for (const i of mias) { vis.add(i - 1); vis.add(i); vis.add(i + 1) }
      for (let i = 0; i < N - 1; i++) if (!vis.has(i) && vis.has(i - 1) && vis.has(i + 1)) vis.add(i);   // un hueco de una fila no se esconde
      let filas = '', ant = -1;
      es.forEach((x, i) => {
        const e = x.e, id = String(e.id || e.team?.id), mia = ids.has(id), n = notas.get(id);
        if (n) leyenda.set(n[1], n[0]);
        const v = vis.has(i) || mias.length === 0 && i < 6;
        if (v && ant >= 0 && i - ant > 1) filas += `<div class="fp-pts" aria-hidden="true"><i></i><i></i><i></i></div>`;
        if (v) ant = i;
        const logoUrl = g(() => (Array.isArray(e.logo) ? e.logo.find((l) => !/dark/.test((l.rel || []).join(' '))) || e.logo[0] : null)?.href, '') || g(() => e.team.logos[0].href, '');
        const nombre = typeof e.team === 'string' ? e.team : e.team?.displayName || e.team?.name || '';
        const lado = mia ? ladoDe(idsDe(m, d), id) : null, forma = mia ? puntos(d, id) : '';
        filas += `<div class="fp-r ${mia ? 'me' : ''} ${v ? '' : 'fp-h'}" ${n ? `style="--b:${n[0]}"` : ''}><i class="fp-bd2"></i><span class="fp-p">${x.r}</span>${logoUrl ? `<img class="fp-c" src="${esc(logoUrl)}" alt="" loading="lazy" ${IMG_ERR}>` : '<span class="fp-c"></span>'}<span class="fp-n"><b data-notr>${esc(nombre)}</b>${forma}</span>${cols.map(([k, , c]) => `<span class="${c}">${esc(val(e, k))}</span>`).join('')}</div>`;
      });
      const hay = ABIERTAS.has(m.id);
      h += `<div class="fp-tw ${hay ? 'all' : ''}" data-fp-t>${grupos.length > 1 ? `<span class="lab fp-gn" data-notr>${esc(String(gr.nombre).replace(/^\d{4}[ -]\d{2,4}\s*/, '').replace(/ Standings$/i, ''))}</span>` : ''}<div class="fp-th fp-r" style="--gn:${gn};--gw:${gw}"><i></i><span>#</span><span></span><span></span>${cols.map(([, t, c]) => `<span class="${c}">${en ? ({ G: 'W', E: 'D', P: 'L', PJ: 'GP', DG: 'GD', DIF: 'GB', Racha: 'Strk' }[t] || t) : t}</span>`).join('')}</div><div class="fp-tb" style="--gn:${gn};--gw:${gw}">${filas}</div></div>`;
    }
    const ley = [...leyenda].map(([t, c]) => `<span><i style="background:${c}"></i>${esc(t)}</span>`).join('');
    const total = grupos.reduce((s, x) => s + x.entries.length, 0), todo = grupos.some((x) => x.entries.length > 9) ? `<button class="fp-mas" data-fp-all="${esc(m.id)}"><span class="a">Ver toda la clasificación</span><span class="b">Ver menos</span></button>` : '';
    return `<section class="fp-s fp-tab ${ABIERTAS.has(m.id) ? 'all' : ''}" data-fp="tab" data-mid="${esc(m.id)}">${H('Clasificación', futbol ? 'Liga' : '')}<div class="fp-tabw">${h}</div>${ley || todo ? `<div class="fp-ley">${ley ? `<div class="fp-lg2">${ley}</div>` : ''}${todo}</div>` : ''}</section>`;
  }

  /* ---------- montaje ---------- */
  function html(m, d) {
    const fut = dep(m) === 'soccer', est = estado(m, d), vnt = !!m._vnt, jugado = est !== 'pre';
    let h = '';
    if (!vnt) h += datos(m, d);
    if (!vnt && jugado) h += (fut ? resumen(m, d) : '');
    if (fut) {
      const a = alineaciones(m, d);
      h += a || (est === 'pre' ? SEC('ali', 'Alineaciones', '', alineacionesPendientes(m, d), 'fp-sali') : '');
    } else {
      h += quinteto(m, d) || (est === 'pre' ? aSeguir(m, d) : '');
    }
    if (!vnt && fut && jugado && !m.live) h += estadisticas(m, d);   // en directo ya las pinta app.js bajo el marcador
    h += forma(m, d) + caraACara(m, d);
    if (fut && est === 'pre') h += goleadores(m, d);
    h += tabla(m, d);
    return h ? `<div class="fp">${h}</div>` : '';
  }
  // el hueco mientras llega ESPN: misma altura que lo que va a salir
  function esqueleto(m) {
    const fut = dep(m) === 'soccer', pre = !m.live && m.status !== 'final';
    // un bloque gris por cada seccion que va a salir, con su altura (para que lo de debajo no salte al llegar ESPN)
    const b = (c, h) => `<div class="fp-sk-b ${c}" ${h ? `style="height:${h}px"` : ''}></div>`;
    const lista = fut ? (pre ? [b('fx'), b('pend'), b('', 350), b('', 370), b('', 540), b('', 470)]
      : [b('fx'), b('', 230), b('campo'), b('', 330), b('', 480), b('', 350), b('', 370), b('', 470)])
      : (pre ? [b('fx'), b('', 540), b('', 190), b('', 440)] : [b('fx'), b('', 850), b('', 190), b('', 440)]);
    return `<div class="fp fp-sk" aria-hidden="true">${lista.join('')}</div><p class="hint fp-load">Cargando datos de ESPN…</p>`;
  }
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest?.('[data-fp-all]'); if (!b) return;
    const id = b.dataset.fpAll, w = b.closest('.fp-tab'); if (!w) return;
    const on = !w.classList.contains('all'); w.classList.toggle('all', on); w.querySelectorAll('.fp-tw').forEach((x) => x.classList.toggle('all', on));
    if (on) ABIERTAS.add(id); else ABIERTAS.delete(id);
  });
  window.GM_FP = { html, esqueleto };
})();
