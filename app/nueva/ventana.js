// La ventana del partido (PM, 01-11: "cuando le de click a una bet que ya he hecho, que salga una ventana del partido, no que me
// lleve a Matches, y el partido con las stats de los jugadores, equipos, score etc.").
// Tocar una apuesta (Mis apuestas, Inicio, Apuestas de todos, tarjetas de resultado, Ya jugados, chat y feed...) ya no cambia de
// pantalla: abre esta ventana ENCIMA de donde estas (PC: panel centrado; movil: hoja a pantalla completa) y al cerrarla sigues
// en el mismo sitio. Lleva el partido (escudos, marcador, minuto o mapa), la apuesta, lo que paga, y las estadisticas que ya
// sabe pintar la ficha de Partidos: ESPN (posesion, tiros, alineaciones, ultimos 5, clasificacion), vivo.js (eventos del
// futbol, mapas y rondas de Valorant y CS2) y las fichas de equipo (jugadores, ultimos resultados, luchadores de UFC).
// No hace nada propio con datos: solo usa lo global de app.js (ALL, M, byId, MEK, esp. espnData, espnHtml, sheetData, sheetEsports,
// sheetValorant, sheetUfc, tvHtml) y GM_VIVO. Nunca toca dinero: solo se mira.
'use strict';
(function () {
  if (window.GM_VENT) return;
  const g = (f, d) => { try { return f() } catch { return d } };
  const ga = async (f, d) => { try { return await f() } catch { return d } };
  const traduce = (el) => { if (window.GM_LANG && el) g(() => GM_LANG.traduce(el)) };
  // las apuestas que abren la ventana (cada una lleva data-goto con el id del partido); el resto de data-goto sigue yendo a Partidos
  const SEL = '.bet,.fd,.bshare,.ab-r,.abt,.bor,.bol:has(.bol-no),.mt,.ini-tk,.ini-ln,.td-tk,.td-rs,.rsl,.jug-r,.du,.bc,.hst,.ab-m>header';
  // lo que hay dentro de una fila y tiene su propia accion: eso lo atiende app.js como siempre
  const INNER = 'button,a[href],input,select,textarea,[data-cancel],[data-share],[data-sumo],[data-prof],[data-accept],[data-decline],[data-retirar],[data-act],[data-cmb-co],[data-vote],[data-rx],[data-rxo],[data-pick],[data-retar],[data-rto],.xc-btn';
  const IC_ATRAS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5L8 12l6.5 6.5M8.5 12H20"/></svg>';
  const IC_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const IC_IR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6l6 6-6 6"/></svg>';
  const V = { min: '', id: null, foco: '', tok: 0, map: null, serie: null, htmlS: '', htmlT: '', htmlB: '', vuelta: null, hist: false, ign: 0, timer: 0 };
  let EL = null;

  /* ---------- el partido ---------- */
  const estado = (m) => (m.live ? 'live' : m.status === 'final' ? 'fin' : m.status === 'scheduled' ? 'pend' : 'otro');
  const marcador = (m) => {
    const sc = String(m.score || '').trim().split(/\s+/)[0] || '', mm = /^(\d+)\s*[:\-]\s*(\d+)$/.exec(sc);
    return mm ? [+mm[1], +mm[2]] : null;
  };
  const escudo = (m, l) => { const src = l === 'a' ? m.la : m.lb, n = String(l === 'a' ? m.a : m.b || '?').trim();
    return src ? `<img class="vv-lg${m.s === 'u' ? ' vnt-cara' : ''}" src="${esc(src)}" alt="" onerror="this.style.visibility='hidden'">` : `<span class="vv-lg sin">${esc(n.charAt(0).toUpperCase())}</span>` };
  function heroHtml(m) {
    const e = estado(m), es = m.s === 'v' || m.s === 'c', v = m.vivo || null, sc = marcador(m);
    const pill = e === 'live' ? '<span class="vv-live"><i></i><span>En directo</span></span>'
      : e === 'fin' ? '<span class="vv-fin">Final</span>'
      : e === 'pend' ? `<span class="vv-fin"><span>Empieza en</span> <b>${CD(m.at)}</b></span>` : '<span class="vv-fin">Anulado</span>';
    const sub = [SP[m.s]?.[0] || '', m.stage ? corto(m.stage) : '', m.bo ? 'BO' + m.bo : ''].filter(Boolean);
    const gana = (l) => e === 'fin' && m.winner === (l === 'a' ? '1' : '2');
    const eq = (l) => `<div class="vv-t ${l}${gana(l) ? ' gana' : ''}">${escudo(m, l)}<b>${esc(l === 'a' ? m.a : m.b)}</b></div>`;
    let centro;
    if (sc && e !== 'pend') {
      const [a, b] = sc;
      let min = '', peq = '';
      if (e === 'live' && m.s === 'f') min = `<span class="vv-min on">${esc((v && v.k === 'f' && v.minuto) || V.min || '·')}</span>`;
      if (es) peq = e === 'live' && v && v.mapa ? `Mapa ${v.n || ''}${v.total ? ' de ' + v.total : ''} · ${esc(v.mapa)}${v.a?.rondas != null && v.b?.rondas != null ? ` ${v.a.rondas}-⁠${v.b.rondas}` : ''}` : 'mapas ganados';
      centro = `<div class="vv-sr">${min}<strong><span class="${a > b ? 'ml' : ''}">${a}</span><i>:</i><span class="${b > a ? 'ml' : ''}">${b}</span></strong>${peq ? `<small>${peq}</small>` : ''}</div>`;
    } else if (e === 'fin' && m.score) {
      centro = `<div class="vv-sr"><span class="vnt-res">${esc(String(m.score).replace(/^[·(]\s*|\)$/g, ''))}</span></div>`;
    } else {
      centro = `<div class="vv-sr"><span class="vv-min">${HM(m.at)}</span><small>${WD(m.at)} ${DD(m.at)} ${MO(m.at)}</small></div>`;
    }
    return `<div class="vv vnt-hero"><div class="vv-top">${pill}<span class="vv-sub">${sub.map((x) => `<u>${esc(x)}</u>`).join('')}</span></div>
      <div class="vv-hero ${m.s === 'f' ? 'fut' : ''}">${eq('a')}${centro}${eq('b')}</div>
      ${m.venue ? `<p class="vnt-sede">${esc(m.venue)}</p>` : ''}
      ${e === 'pend' && window.GM_RETOS ? `<div class="vnt-ret">${GM_RETOS.btn(m, 'grande')}</div>` : ''}</div>`;
  }

  /* ---------- las apuestas ---------- */
  const clase = (b, m) => (b.st === 'open' ? (m.live ? 'live' : 'open') : b.cash ? 'cash' : b.st === 'won' || b.st === 'lost' ? b.st : 'void');
  const ETQ = { live: 'En vivo', open: 'Pendiente', won: 'Ganada', lost: 'Perdida', void: 'Anulada', cash: 'Retirada' };
  function apuesta(b, m, grande) {
    const k = clase(b, m), mio = b.k === MEK, oculta = !b.p, pay = b.pay || 0, dif = pay - b.stake;
    const quien = mio ? '' : `${av(b.k, 'sm')}<span class="vnt-qn" data-notr>${esc(fr(b.k).n)}</span>`;
    const pick = oculta ? `${LOCK}<span>Oculta hasta que empiece</span>` : `<span>${esc(pn(m, b.p))}</span>`;
    let lab3, val3, delta = '';
    if (k === 'won') { lab3 = 'Cobrado'; val3 = N(pay); delta = `▲ ${N(dif)}` }
    else if (k === 'lost') { lab3 = 'Perdido'; val3 = N(g(() => perd(b), b.stake)); delta = `▼ ${N(g(() => perd(b), b.stake))}` }
    else if (k === 'void') { lab3 = 'Devuelto'; val3 = N(b.stake) }
    else if (k === 'cash') { lab3 = 'Cobrado'; val3 = N(pay); delta = dif ? `${dif > 0 ? '▲' : '▼'} ${N(Math.abs(dif))}` : '' }
    else { lab3 = 'Cobraría'; val3 = oculta ? '?' : N(b.stake * b.o) }
    const est = `<span class="vnt-st">${delta ? `<b>${delta}</b>` : ''}<span>${ETQ[k]}</span></span>`;
    if (!grande) return `<div class="vnt-f ${k}">${quien}<p class="vnt-fp">${pick}${oculta ? '' : `<em>${O(b.o)}</em>`}</p><span class="vnt-fn">${N(b.stake)}${k === 'open' || k === 'live' ? ` <i>→</i> ${val3}` : ` <i>→</i> ${k === 'lost' ? '0' : val3}`}${coin()}</span>${est}</div>`;
    return `<article class="vnt-b ${k}${mio ? ' mio' : ''}">
      <header>${quien}<strong class="vnt-pk">${pick}</strong>${est}</header>
      <div class="vnt-bn"><div><span class="lab">Cuota</span><b>${oculta ? '·' : O(b.o)}</b></div><div><span class="lab">Apostado</span><b>${N(b.stake)}${coin()}</b></div><div class="hi"><span class="lab">${lab3}</span><b>${val3}${val3 === '?' ? '' : coin()}</b></div></div>
    </article>`;
  }
  function apuestasHtml(m, foco) {
    const todas = ALL.filter((b) => b.m === m.id && b.k);
    if (!todas.length) return '';
    const ord = (a, b) => (a.st === 'open' ? 0 : 1) - (b.st === 'open' ? 0 : 1) || Date.parse(b.at) - Date.parse(a.at);
    const mias = todas.filter((b) => b.k === MEK).sort(ord);
    const deFoco = foco && foco !== MEK ? todas.filter((b) => b.k === foco).sort(ord) : [];
    const resto = todas.filter((b) => b.k !== MEK && b.k !== foco).sort(ord);
    let h = '';
    const sec = (lab, cuerpo) => `<section class="vnt-sec">${lab}${cuerpo}</section>`;
    if (deFoco.length) h += sec(`<span class="lab">Apuesta de <b data-notr>${esc(fr(foco).n)}</b></span>`, deFoco.map((b) => apuesta(b, m, true)).join(''));
    if (mias.length) h += sec(`<span class="lab">${mias.length > 1 ? 'Tus apuestas' : 'Tu apuesta'}</span>`, mias.map((b) => apuesta(b, m, true)).join(''));
    if (resto.length) h += sec('<span class="lab">Amigos en este partido</span>', `<div class="vnt-fs">${resto.map((b) => apuesta(b, m, false)).join('')}</div>`);
    return h;
  }

  /* ---------- las estadisticas (lo que ya pinta la ficha de Partidos) ---------- */
  const sinBoton = (h) => String(h || '').replace(/<button class="sh-info"[\s\S]*?<\/button>/g, '').replace(/<button class="sh-mas"[\s\S]*?<\/button>/g, '');
  const espera = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);
  const vv = (secs) => (secs && secs.length ? `<div class="vv vnt-vv">${secs.map((x) => `<div class="vs">${x}</div>`).join('')}</div>` : '');

  async function statsFutbol(m) {
    const d = m.espn ? await ga(() => espnData(m), null) : null;
    if (!d) return '';
    const st = g(() => d.header.competitions[0].status, null);
    V.min = st && st.type && st.type.state === 'in' ? (st.type.name === 'STATUS_HALFTIME' ? 'Descanso' : st.displayClock || st.type.shortDetail || '') : '';
    let h = '';
    const e = estado(m);
    if (e !== 'pend' && window.GM_VIVO) { const s = g(() => GM_VIVO.pintaFutbol(d), null); if (s) h += vv([s[2], s[1]].filter(Boolean)).replace(e === 'fin' ? /<p class="vv-fuente">[\s\S]*?<\/p>/ : /$^/, '') }   // eventos (goles, tarjetas, cambios) y estadisticas del equipo
    let x = g(() => espnHtml({ ...m, live: false }, d), '');   // alineaciones, ultimos 5 y clasificacion (el directo ya sale arriba)
    if (e !== 'pend') x = x.replace(/<p class="hint">Las alineaciones salen[\s\S]*?<\/p>/, '');
    if (e === 'fin') { const i = x.lastIndexOf('<div class="ver">'); if (i >= 0) x = x.slice(0, i) }   // dónde verlo no sirve de nada ya
    if (x.trim()) h += `<div class="espn vnt-espn">${x}</div>`;
    return h;
  }
  const columnas = (m, f) => {
    const c = ['a', 'b'].map((sd) => ({ sd, h: sinBoton(f(sd)) }));
    if (!c.some((x) => x.h.trim())) return '';
    return `<div class="vnt-eqs">${c.map((x) => `<div class="vnt-eq"><h4>${logo(m, x.sd)}<b>${esc(x.sd === 'a' ? m.a : m.b)}</b></h4><div class="shs-w">${x.h}</div></div>`).join('')}</div>`;
  };
  async function statsEsports(m) {
    let h = '';
    if (window.GM_VIVO && estado(m) !== 'pend') {   // antes de empezar no hay mapas ni rondas que enseñar
      let s = g(() => GM_VIVO.memoria.get(m.id), null);
      if (!s || Date.now() - (s._t || 0) > 3e5) {
        s = await ga(() => espera(m.s === 'v' ? GM_VIVO.serieValorant(m.a, m.b) : GM_VIVO.serieCs2(m.a, m.b), 9000), null);
        if (s) { s._t = Date.now(); g(() => GM_VIVO.memoria.set(m.id, s)) }
      }
      V.serie = s || null;
      h += pintaSerie();
    }
    const ds = await Promise.all([ga(() => sheetData(m, 'a'), null), ga(() => sheetData(m, 'b'), null)]);
    h += columnas(m, (sd) => { const d = ds[sd === 'a' ? 0 : 1]; return g(() => (d ? sheetEsports(m, sd, d) : sheetValorant(m, sd)), '') });
    if (estado(m) !== 'fin') h += `<div class="espn vnt-espn">${g(() => tvHtml(m.tv || [], m), '')}</div>`;
    return h;
  }
  // el cuerpo de la serie (mapas, rondas, jugadores): sin su cabecera, que ya esta arriba
  function pintaSerie() {
    const s = V.serie; if (!s || !window.GM_VIVO) return '';
    const secs = g(() => GM_VIVO.pintaSerie(s, V.map), null);
    return secs ? vv(secs.slice(1)) : '';
  }
  async function statsUfc(m) {
    const ds = await Promise.all([ga(() => sheetData(m, 'a'), null), ga(() => sheetData(m, 'b'), null)]);
    let h = columnas(m, (sd) => { const d = ds[sd === 'a' ? 0 : 1]; return d ? g(() => sheetUfc(m, sd, d), '') : '' });
    if (estado(m) !== 'fin') h += `<div class="espn vnt-espn">${g(() => tvHtml(m.tv || [], m), '')}</div>`;
    return h;
  }
  async function cargaStats(m, tok) {
    let h = '';
    try { h = await espera(m.s === 'f' ? statsFutbol(m) : m.s === 'u' ? statsUfc(m) : statsEsports(m), 14000) || '' } catch { h = '' }
    if (tok !== V.tok || !EL) return;
    pon('[data-vnt-stats]', 'htmlS', stat(h));
    pinta();   // el minuto, que llega con los datos
  }
  const stat = (h) => (h.trim() ? `<section class="vnt-sec vnt-st-s"><span class="lab">Estadísticas del partido</span>${h}</section>` : '<p class="vnt-nada">Todavía no hay estadísticas de este partido.</p>');

  /* ---------- pintar ---------- */
  function pon(sel, clave, html) {
    const el = EL && EL.querySelector(sel); if (!el || V[clave] === html) return;
    V[clave] = html; el.innerHTML = html; traduce(el);
  }
  function pinta() {
    const m = byId(V.id); if (!m || !EL) return;
    pon('[data-vnt-top]', 'htmlT', heroHtml(m));
    pon('[data-vnt-bets]', 'htmlB', apuestasHtml(m, V.foco));
  }
  function abre(id, foco, desde) {
    const m = byId(id); if (!m) return false;
    const nueva = !EL;
    V.id = id; V.foco = foco || ''; V.min = ''; V.tok++; V.map = null; V.serie = null; V.htmlT = V.htmlB = V.htmlS = '';
    if (nueva) {
      V.vuelta = desde || document.activeElement;
      EL = document.createElement('div'); EL.id = 'vnt'; EL.className = 'vnt';
      EL.innerHTML = `<div class="vnt-fondo" data-vnt="x"></div>
        <section class="vnt-hoja" role="dialog" aria-modal="true" aria-label="Partido" tabindex="-1">
          <header class="vnt-bar"><button class="vnt-back" data-vnt="x" aria-label="Volver">${IC_ATRAS}</button><span class="vnt-lg" data-vnt-lg></span>
            <button class="vnt-ver" data-vnt="ver"><span>Ver en Partidos</span>${IC_IR}</button><button class="vnt-x" data-vnt="x" aria-label="Cerrar">${IC_X}</button></header>
          <div class="vnt-cuerpo" data-vnt-cuerpo><div data-vnt-top></div><div data-vnt-bets></div><div data-vnt-stats></div></div>
        </section>`;
      document.body.appendChild(EL);
      traduce(EL);
      try { history.pushState({ gmvent: 1 }, ''); V.hist = true } catch { V.hist = false }
      EL.querySelector('.vnt-hoja').focus({ preventScroll: true });
      V.timer = setInterval(tick, 15e3);
    }
    EL.querySelector('[data-vnt-lg]').innerHTML = `<img class="tl" src="${esc(L[m.lg]?.[1] || SP[m.s]?.[1] || '')}" alt="" onerror="this.style.visibility='hidden'"><span>${esc(corto(L[m.lg]?.[0] || SP[m.s]?.[0] || ''))}</span>`;
    EL.querySelector('[data-vnt-cuerpo]').scrollTop = 0;
    pinta();
    pon('[data-vnt-stats]', 'htmlS', '<div class="vnt-sk" aria-hidden="true"><i></i><i></i><i></i><i></i></div>');
    cargaStats(m, V.tok);
    return true;
  }
  function tick() {
    if (!EL) return;
    if (document.hidden) return;
    const m = byId(V.id); if (!m) return;
    pinta();
    if (estado(m) !== 'fin' || /vnt-nada/.test(V.htmlS)) cargaStats(m, V.tok);
  }
  function cierra(sinHist) {
    if (!EL) return;
    clearInterval(V.timer);
    const el = EL, vuelta = V.vuelta; EL = null; V.id = null; V.tok++; V.vuelta = null;
    el.classList.add('sale'); setTimeout(() => el.remove(), 140);
    if (!sinHist && V.hist) { V.hist = false; V.ign++; try { history.back() } catch { V.ign-- } }
    V.hist = false;
    if (vuelta && vuelta.isConnected && vuelta.focus) g(() => vuelta.focus({ preventScroll: true }));
  }
  function aPartidos() {
    const id = V.id; if (!id) return;
    cierra();
    g(() => { S.scr = 'partidos'; S.foc = id; S.sheet = true; S.side = null; document.getElementById('view').scrollTop = 0; render() });
  }

  /* ---------- eventos ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target; if (!t || !t.closest) return;
    if (EL && EL.contains(t)) {
      const c = t.closest('[data-vnt]');
      if (c) { e.stopPropagation(); if (c.dataset.vnt === 'x') cierra(); else if (c.dataset.vnt === 'ver') aPartidos(); return }
      const mp = t.closest('[data-vvmap]');   // elegir mapa en una serie de Valorant o CS2
      if (mp) { e.stopPropagation(); e.stopImmediatePropagation(); V.map = +mp.dataset.vvmap; recomponeSerie(); return }
      return;
    }
    const el = t.closest(SEL); if (!el || !el.dataset.goto) return;
    for (let n = t; n && n !== el; n = n.parentElement) if (n.matches(INNER)) return;
    const m = g(() => byId(el.dataset.goto), null); if (!m) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    abre(m.id, g(() => dueno(el, m), ''), el);
  }, true);
  // de quien es la apuesta que se ha tocado: su avatar si lo lleva la fila; si no, la que coincide con lo que dice la fila
  // (lo apostado, la cuota y lo elegido). Si no se sabe con certeza, no se destaca a nadie y sale primero la tuya.
  function dueno(el, m) {
    const av0 = el.querySelector('[data-prof]'); if (av0 && av0.dataset.prof) return av0.dataset.prof;
    const t = el.innerText || '', bs = ALL.filter((b) => b.m === m.id && b.k);
    const pts = bs.map((b) => [b, (t.includes(N(b.stake)) ? 1 : 0) + (b.p && t.includes(O(b.o)) ? 1 : 0) + (b.p && t.includes(pn(m, b.p)) ? 1 : 0)]);
    const mx = Math.max(0, ...pts.map((x) => x[1])); if (mx < 2) return '';
    const top = pts.filter((x) => x[1] === mx).map((x) => x[0].k);
    return top.includes(MEK) ? '' : new Set(top).size === 1 ? top[0] : '';
  }
  // cambiar de mapa: se rehace solo el bloque de la serie, sin tocar lo de debajo
  function recomponeSerie() {
    const cont = EL && EL.querySelector('.vnt-vv'); if (!cont || !V.serie) return;
    const nuevo = document.createElement('div'); nuevo.innerHTML = pintaSerie();
    const n = nuevo.firstElementChild; if (!n) return;
    cont.replaceWith(n); traduce(n);
    V.htmlS = EL.querySelector('[data-vnt-stats]').innerHTML;
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && EL) { e.preventDefault(); e.stopPropagation(); cierra() } }, true);
  addEventListener('popstate', () => { if (V.ign > 0) { V.ign--; return } if (EL) { V.hist = false; cierra(true) } });

  window.GM_VENT = { abre: (id, foco) => abre(id, foco), cierra, abierta: () => !!EL };
})();
