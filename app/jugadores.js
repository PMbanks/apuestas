// Jugadores (PM, 01-11): "informacion de los jugadores, de earnings, pasados equipos, y si sale su nombre en cualquier lado se le podra dar
// click y te lleva a ese lugar, y si pasas el mouse sin darle click te sale un preview de informacion relevante del jugador, y si puede ser
// encuentra foto suya donde salga".
//
//  1. Cualquier nombre de jugador de Valorant o CS2 marcado con data-jug (plantilla, cambios, Directo, ficha del partido, ventana del partido...)
//     se toca y abre la ficha del jugador encima de todo (en el mismo panel del equipo; "Volver" regresa al anterior).
//  2. Ficha: foto, bandera, nombre real, edad, equipo actual, agentes (Valorant) o rol (CS2), ganancias de siempre y torneo a torneo,
//     y los equipos por los que paso con sus fechas. Foto: PandaScore o vlr.gg (lo que traiga la ficha del equipo).
//  3. En PC, al pasar el raton sin pulsar (320 ms) sale una vista previa pequena al lado, sin tapar el nombre, que se va al quitar el raton.
// Datos: la ficha del equipo (teams.extra) y el detalle de jugadores que guarda el sincronizador (teams.pj, db/050). Nunca toca dinero.
'use strict';
(function () {
  if (window.GM_JUG) return;
  const g = (f, d) => { try { return f() } catch { return d } };
  const Q = () => window.GM_EQ;
  const nk = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const juego = (s) => (s === 'v' ? 'valorant' : 'csgo');
  const NO = '[data-pick],[data-stake],[data-cancel],[data-retirar],[data-accept],[data-decline],[data-sumo],[data-retar],[data-pn],[data-rto],[data-rpick],[data-rstake],[data-share],[data-xc],[data-cmb-co],[data-bsp]';
  const IC_X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  /* ---------- datos ---------- */
  // el equipo de un nombre de equipo: se busca en los partidos de la app (v y c llevan el id de PandaScore en m.tid)
  function equipoDe(tn) {
    for (const m of g(() => M, [])) {
      if (m.s !== 'v' && m.s !== 'c') continue;
      if (m.a === tn) return { s: m.s, tid: m.tid && m.tid.a, logo: m.la, n: tn };
      if (m.b === tn) return { s: m.s, tid: m.tid && m.tid.b, logo: m.lb, n: tn };
    }
    return null;
  }
  const TX = new Map();   // 'valorant:123' -> { t, p: promesa }
  function carga(s, tid) {
    if (!s || !tid) return Promise.resolve(null);
    const k = `${juego(s)}:${tid}`, c = TX.get(k);
    if (c && Date.now() - c.t < 6e5) return c.p;
    const sel = async (cols) => g(() => db.from('teams').select(cols).eq('id', k).maybeSingle(), null);
    // si la columna pj aun no existe en la base (db/050 sin cargar), se pide sin ella
    const p = (async () => { let r = await sel('data,extra,pj'); if (!r || r.error) r = await sel('data,extra'); return r && r.data ? { x: r.data.extra || null, pj: r.data.pj || null, t: r.data.data || null } : null })().catch(() => null);
    TX.set(k, { t: Date.now(), p }); return p;
  }
  // un elemento marcado -> descriptor de jugador { jug, s, tid, n (equipo), logo }
  function desc(t) {
    const d = t.dataset, e = { jug: d.jug, n: d.jtn || '', s: d.js || '', tid: d.jtid || '' };
    if (!e.s || !e.tid) { const q = equipoDe(e.n); if (q) { e.s = e.s || q.s; e.tid = e.tid || q.tid || ''; e.logo = q.logo } }
    return e;
  }
  // dentro de la ficha del equipo: el jugador (o ex jugador o staff) por su nombre
  function busca(x, nick) {
    if (!x) return null;
    for (const [lista, tipo] of [['jugadores', 'jug'], ['exjugadores', 'ex'], ['staff', 'staff'], ['exstaff', 'exstaff']]) {
      const j = (x[lista] || []).find((z) => nk(z.nombre) === nk(nick)); if (j) return { j, tipo };
    }
    return null;
  }
  const detalle = (pj, nick, j) => (pj && (pj[String((j && j.nombre) || nick).toLowerCase()] || pj[String(nick).toLowerCase()])) || null;
  const ESTADO = { Substitute: 'Suplente', 'Stand-in': 'Suplente temporal', Inactive: 'Inactivo', Loan: 'Cedido' };

  /* ---------- trozos de la ficha ---------- */
  const usd = (n) => `${N(n)} $`;
  const totalTxt = (G) => (G && G.total != null ? `${G.aprox ? '≈ ' : ''}${usd(G.total)}` : '·');
  const agentesHtml = (j, grande) => {
    const l = ((j && j.agentes) || []).filter((a) => a && a.a).slice(0, grande ? 4 : 3); if (!l.length) return '';
    return `<span class="eqx-ags${grande ? ' fj-ags' : ''}">${l.map((a) => `<span class="eqx-ag" data-ag="${esc(a.a)}" data-t="${esc(a.pj != null ? `${a.pj} ${document.documentElement.lang === 'en' ? 'maps' : 'mapas'}${a.pct != null ? ` · ${a.pct}%` : ''}` : '')}"><img alt="" loading="lazy"><i>${a.pct != null ? a.pct + '%' : ''}</i><u>${esc(Q().cap(a.a))}</u></span>`).join('')}</span>`;
  };
  const rolesHtml = (j) => (((j && j.roles) || []).length ? `<span class="eqx-ros">${j.roles.map((r) => `<span class="eqx-ro">${esc(Q().rolCs(r))}</span>`).join('')}</span>` : '');
  const fotoHtml = (j, nick, cls) => `<span class="fj-ph ${cls || ''}">${j && j.foto ? `<img src="${esc(j.foto)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">` : `<span class="eqx-i">${esc(Q().ini(nick))}</span>`}${j && j.pais ? Q().flag(j.pais, null, 'eqx-fb') : ''}</span>`;
  const nota = (n) => (ESTADO[n] ? ESTADO[n] : '');
  // fechas de un paso por un equipo: "oct 2025 a hoy", "ene 2023 a jun 2023", "desde jun 2026", "hasta nov 2024"
  const rango = (desde, hasta, actual) => {
    const a = desde ? Q().fe(desde) : '', b = hasta ? Q().fe(hasta) : '';
    if (a && b) return `<time>${esc(a)}</time> <span>a</span> <time>${esc(b)}</time>`;
    if (a) return actual ? `<time>${esc(a)}</time> <span>a</span> <span>hoy</span>` : `<span>desde</span> <time>${esc(a)}</time>`;
    if (b) return `<span>hasta</span> <time>${esc(b)}</time>`;
    return '';
  };
  const fila = (x, cv) => `<div class="eqx-w g n${Q().pn(x[2])}"><span class="eqx-ic sin">${Q().copa(Q().pn(x[2]))}</span>
    <span class="eqx-wn"><b>${esc(Q().sg(x[1]))}</b><small><time>${esc(Q().fe(x[0]))}</time>${x[2] ? ` · ${esc(Q().sg(Q().pst(x[2])))}` : ''}${x[5] ? ` · ${esc(Q().sg(x[5]))}` : ''}${x[4] ? ` · ${esc(Q().sg(x[4]))}` : ''}</small></span>
    <span class="eqx-wk"></span><b class="eqx-wp${x[3] ? '' : ' cero'}">${x[3] ? usd(x[3]) + (cv ? '' : '') : '·'}</b></div>`;

  function html(e, d, P) {
    const x = d && d.x, f = x && busca(x, e.jug), j = f && f.j, nick = (j && j.nombre) || e.jug, pj = d && d.pj, det = detalle(pj, e.jug, j), G = det && det.g;
    const esc_ = esc, tipo = f && f.tipo, actual = tipo === 'jug' || tipo === 'staff';
    const eqd = JSON.stringify({ s: e.s, n: e.n, logo: e.logo || (x && x.equipo && x.equipo.logo) || null, tid: e.tid });
    const logo = e.logo || (x && x.equipo && x.equipo.logo) || '';
    const esV = e.s === 'v', pais = j && j.pais;
    const real = [j && j.nombre_real && j.nombre_real !== nick ? Q().sg(j.nombre_real) : '', j && j.edad ? j.edad + ' años' : ''].filter(Boolean).join(' · ');
    const rol = tipo === 'staff' || tipo === 'exstaff' ? Q().rolStaff(j.rol) : (j && j.estado && ESTADO[j.estado]) || '';
    const kpi = [
      pais ? ['País', { html: Q().flag(pais) + esc_(Q().nombrePais(pais)) }] : null,
      G ? ['Ganancias de siempre', totalTxt(G)] : null,
      j && j.desde && actual ? ['En el equipo desde', Q().fe(j.desde)] : null,
      rol ? [tipo === 'staff' || tipo === 'exstaff' ? 'Función' : 'Estado', rol] : null,
    ].filter(Boolean);
    const pasos = [];
    if (actual && x) pasos.push({ equipo: e.n, desde: j && j.desde, hasta: null, actual: true });
    if (tipo === 'ex' || tipo === 'exstaff') pasos.push({ equipo: e.n, desde: j.desde, hasta: j.hasta, nota: '' });
    for (const a of (j && j.anteriores) || []) pasos.push({ equipo: a.equipo, desde: a.desde, hasta: a.hasta, nota: nota(a.nota) });
    const tabs = [['resumen', 'Resumen', true], ['ganancias', 'Ganancias', !!(G && (G.lista || []).length)], ['equipos', 'Equipos', pasos.length > 1 || (pasos.length === 1 && !pasos[0].actual)]].filter((t) => t[2]);
    const tab = tabs.some((t) => t[0] === P.tab) ? P.tab : 'resumen';
    let c = '';
    if (tab === 'resumen') {
      const top = G ? [...(G.lista || [])].filter((z) => z[3] > 0).sort((a, b) => b[3] - a[3]).slice(0, 5) : [];
      c = `${kpi.length ? `<div class="eq-k">${kpi.map(([a, b]) => `<div><span class="lab">${a}</span><b>${b && b.html != null ? b.html : esc_(String(b))}</b></div>`).join('')}</div>` : ''}
        ${esV && j && (j.agentes || []).length ? `<h4 class="eqx-h"><span>Agentes que más juega</span></h4>${agentesHtml(j, true)}<p class="eqx-nota">Últimos 60 días, según vlr.gg. Iconos oficiales de Riot Games.</p>` : ''}
        ${!esV && j && (j.roles || []).length ? `<h4 class="eqx-h"><span>Rol en el equipo</span></h4>${rolesHtml(j)}` : ''}
        ${top.length ? `<h4 class="eqx-h"><span>Sus mejores premios</span></h4><div class="eqx-ws">${top.map((z) => fila(z)).join('')}</div>` : ''}
        ${!G ? `<p class="hint fj-vacio">${tipo === 'jug' || !tipo ? 'Todavía no tenemos sus ganancias: se cargan solas, jugador a jugador.' : 'De este nombre solo hay lo que consta en la ficha del equipo.'}</p>` : ''}
        ${!j ? `<p class="hint fj-vacio">No encontramos a este jugador en la ficha de su equipo.</p>` : ''}`;
    } else if (tab === 'ganancias') {
      const L = G.lista || [], pg = Math.min(P.pag || 0, Math.max(0, Math.ceil(L.length / EQ_POR) - 1));
      c = `<div class="eq-gt"><span class="lab">En total</span><b>${totalTxt(G)}</b></div>
        <p class="eqx-nota fj-nota">${G.aprox ? 'Aproximado: Liquipedia da el premio de cada torneo para el equipo entero y aquí se reparte a partes iguales entre cinco jugadores.' : 'Lo que ha ganado en cada evento, según vlr.gg.'}</p>
        <h4 class="eqx-h"><span>Torneo a torneo</span><i>${G.n != null ? G.n : L.length}</i></h4>
        <div class="eqx-ws">${L.slice(pg * EQ_POR, pg * EQ_POR + EQ_POR).map((z) => fila(z)).join('')}</div>${eqPags(L.length, EQ_POR, pg)}`;
    } else if (tab === 'equipos') {
      const pg = Math.min(P.pag || 0, Math.max(0, Math.ceil(pasos.length / 10) - 1));
      c = `<div class="fj-eqs">${pasos.slice(pg * 10, pg * 10 + 10).map((s) => `<div class="fj-eq${s.actual ? ' ya' : ''}"><b>${esc_(Q().sg(s.equipo))}</b>${s.nota ? `<small>${s.nota}</small>` : ''}<span class="fj-rg">${rango(s.desde, s.hasta, s.actual)}</span></div>`).join('')}</div>${eqPags(pasos.length, 10, pg)}`;
    }
    const src = [(x && x.atribucion || []).filter((a) => /vlr|Liquipedia|PandaScore/.test(a.fuente || '')).map((a) => (a.url ? `<a href="${esc_(a.url)}" target="_blank" rel="noopener">${esc_(a.texto)}</a>` : `<span>${esc_(a.texto)}</span>`)).join(' · ')].filter(Boolean)[0];
    return `<header class="eq-h fj-h">${P.pila.length > 1 ? '<button class="eq-back" data-act="eq-atras" aria-label="Volver">‹</button>' : ''}${fotoHtml(j, nick)}
      <div class="eq-hn"><span class="lab">${esc_(esV ? 'Valorant' : 'CS2')} · <span>${tipo === 'staff' || tipo === 'exstaff' ? 'Cuerpo técnico' : tipo === 'ex' ? 'Ex jugador' : 'Jugador'}</span></span><h2>${esc_(nick)}</h2>
        ${real ? `<span class="fj-real">${esc_(real)}</span>` : ''}
        ${e.n ? `<button class="eq-riv fj-eqb" data-eqv="${esc_(eqd)}">${logo ? `<img class="tl" src="${esc_(logo)}" alt="" onerror="this.style.visibility='hidden'">` : ''}<span>${esc_(e.n)}</span></button>` : ''}</div>
      <button class="rw-x" data-act="sh-info" aria-label="Cerrar">${IC_X}</button></header>
      <nav class="eq-tabs">${tabs.map(([k, n]) => `<button class="${k === tab ? 'on' : ''}" data-eqtab="${k}">${n}</button>`).join('')}</nav>
      <div class="eq-cu">${c}${src ? `<p class="eqx-at">${src}${j && j.foto ? '' : ''}</p>` : ''}</div>`;
  }

  async function pinta(el, e, P) {
    const k = `j|${e.s}|${e.tid}|${nk(e.jug)}|${P.tab}|${P.pag || 0}`;
    if (el.dataset.k === k) return;
    const box = el.querySelector('.eqp');
    if (!(TX.get(`${juego(e.s)}:${e.tid}`))) box.innerHTML = `<header class="eq-h fj-h"><div class="eq-hn"><h2>${esc(e.jug)}</h2></div></header><p class="hint">Cargando…</p>`;
    const d = await carga(e.s, e.tid);
    const P2 = g(() => S.eqp, null), e2 = P2 && P2.pila[P2.pila.length - 1];
    if (!e2 || e2 !== e || P2.tab !== P.tab || (P2.pag || 0) !== (P.pag || 0)) return;
    el.dataset.k = k; box.innerHTML = html(e, d, P); box.scrollTop = 0;
    if (window.GM_LANG) GM_LANG.traduce(el);
    Q().post(el);
  }

  /* ---------- tocar un nombre ---------- */
  function oculta() { clearTimeout(tm); clearInterval(vig); cur = null; if (PV) { PV.remove(); PV = null } }
  document.addEventListener('click', (ev) => {
    const t = ev.target.closest && ev.target.closest('[data-jug]'); if (!t || t.closest(NO)) return;
    ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
    oculta();
    const d = desc(t); if (!d.jug) return;
    const top = g(() => S.eqp.pila[S.eqp.pila.length - 1], null);
    if (top && top.jug && nk(top.jug) === nk(d.jug) && top.tid === d.tid) return;
    if (g(() => S.eqp, null)) { S.eqp.pila.push(d); S.eqp.tab = 'resumen'; S.eqp.pag = 0 } else S.eqp = { pila: [d], tab: 'resumen', pag: 0 };
    render();
  }, true);

  /* ---------- vista previa al pasar el raton (solo PC) ---------- */
  let PV = null, tm = 0, cur = null, mx = 0, my = 0, vig = 0;
  document.addEventListener('mousemove', (ev) => { mx = ev.clientX; my = ev.clientY }, { capture: true, passive: true });
  // la lista de partidos se repinta sola: si el nombre bajo el raton se sustituye, se sigue con el nuevo, y si ya no hay ninguno, la vista previa se va
  const bajoRaton = () => { const n = document.elementFromPoint(mx, my); return n && n.closest ? n.closest('[data-jug]') : null };
  const hover = () => g(() => matchMedia('(hover: hover) and (pointer: fine)').matches, false);
  async function muestra(t) {   // eslint-disable-line
    if (!t.isConnected) return;
    const e = desc(t), d = await carga(e.s, e.tid);
    if (cur !== t) return;
    if (!t.isConnected) { const n = bajoRaton(); if (!n || nk(n.dataset.jug) !== nk(e.jug)) return; t = n; cur = n }
    const x = d && d.x, f = x && busca(x, e.jug), j = f && f.j, nick = (j && j.nombre) || e.jug, G = (detalle(d && d.pj, e.jug, j) || {}).g;
    const logo = e.logo || (x && x.equipo && x.equipo.logo) || '', esV = e.s === 'v', tipo = f && f.tipo;
    const real = [j && j.nombre_real && j.nombre_real !== nick ? Q().sg(j.nombre_real) : '', j && j.edad ? j.edad + ' años' : ''].filter(Boolean).join(' · ');
    const rol = tipo === 'staff' || tipo === 'exstaff' ? Q().rolStaff(j.rol) : '';
    if (!PV) { PV = document.createElement('div'); PV.className = 'fjv'; PV.style.visibility = 'hidden'; document.body.appendChild(PV) }
    PV.innerHTML = `<div class="fjv-c">${fotoHtml(j, nick, 'p')}<div class="fjv-t"><b>${esc(nick)}</b>${real ? `<small>${esc(real)}</small>` : ''}
        ${e.n ? `<span class="fjv-eq">${logo ? `<img src="${esc(logo)}" alt="" onerror="this.style.visibility='hidden'">` : ''}<span>${esc(e.n)}</span></span>` : ''}
        ${rol ? `<span class="fjv-r">${esc(rol)}</span>` : esV ? agentesHtml(j) : rolesHtml(j)}</div></div>
      ${G ? `<div class="fjv-g"><span class="lab">Ganancias de siempre</span><b>${esc(totalTxt(G))}</b></div>` : ''}
      <p class="fjv-h">Pulsa para ver su ficha</p>`;
    if (window.GM_LANG) GM_LANG.traduce(PV);
    Q().post(PV);
    // al lado del nombre (a la derecha, o a la izquierda si no cabe), sin taparlo
    const r = t.getBoundingClientRect(), w = PV.offsetWidth, h = PV.offsetHeight;
    let left = r.right + 14; if (left + w > innerWidth - 8) left = Math.max(8, r.left - w - 14);
    let top = r.top + r.height / 2 - h / 2; top = Math.max(8, Math.min(top, innerHeight - h - 8));
    PV.style.left = left + 'px'; PV.style.top = top + 'px'; PV.style.visibility = 'visible';
    clearInterval(vig); vig = setInterval(() => { if (!PV) return clearInterval(vig); const n = bajoRaton(); if (!n) oculta(); else if (n !== cur) cur = n }, 350);
  }
  document.addEventListener('mouseover', (ev) => {
    if (!hover()) return;
    const t = ev.target.closest && ev.target.closest('[data-jug]'); if (!t || t === cur || t.closest(NO)) return;
    oculta(); cur = t; tm = setTimeout(() => muestra(t), 320);
  }, true);
  document.addEventListener('mouseout', (ev) => {
    const t = ev.target.closest && ev.target.closest('[data-jug]'); if (!t || t !== cur || t.contains(ev.relatedTarget)) return;
    oculta();
  }, true);
  document.addEventListener('scroll', () => { if (PV || cur) oculta() }, true);
  document.addEventListener('keydown', () => { if (PV) oculta() }, true);

  window.GM_JUG = { pinta, oculta, carga, desc, busca };
})();
