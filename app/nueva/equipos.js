// Equipos (PM, 01-11): "en players que se pueda ver quien es el roster principal, quien es el coach, separalo bien, y que se vea los agentes
// que juegan, pon fotos del juego de personajes pero oficiales, y que se pueda ver que juegan en csgo, y en country de cualquier lugar pon las
// banderas de verdad; y que pueda darle click al equipo y salga informacion de este: cualquier vez que se vea el logo, si se le da click te
// lleva a informacion del club, torneos all time ganados, cambios all time, etc."
//
// Lo que hace este modulo (el panel "Todo sobre el equipo" sigue siendo el de app.js; aqui se le cuelga lo nuevo con GM_EQ):
//  1. Cualquier logo de equipo de la app (Partidos, ficha, Inicio, Directo, Mis apuestas, Todos, la ventana del partido, brackets...) se
//     puede tocar y abre el panel de ese equipo. Se reconoce el logo por su direccion, buscandola en los partidos que ya tiene la app.
//  2. Plantilla de Valorant y CS2 separada en Titulares, Suplentes y banquillo, Cuerpo tecnico y Organizacion, con la bandera de cada uno.
//  3. Valorant: los agentes que mas juega cada jugador, con el icono OFICIAL del agente (lo sirve valorant-api.com; se enlaza, no se copia).
//     CS2: el rol de cada jugador (IGL, AWPer, rifler, entry, support, lurker) si Liquipedia lo da; si no, nada.
//  4. Palmares de siempre (torneos ganados por categoria) y Cambios de plantilla de siempre (quien entro y salio, y cuando).
// Los datos vienen de la ficha ampliada que guarda el sincronizador en teams.extra (sync/equipos-extra.mjs, formato 2).
// Banderas: flagcdn.com por codigo de pais (o la bandera que traiga ESPN). Nunca toca dinero: solo se mira.
'use strict';
(function () {
  if (window.GM_EQ) return;
  const g = (f, d) => { try { return f() } catch { return d } };
  const EN = () => document.documentElement.lang === 'en';
  // sin guiones en ningun texto visible: " - " pasa a " · " y el guion dentro de una palabra se quita ("Co-Founder" sale "Co Founder")
  const sg = (t) => String(t ?? '').replace(/\s[-–—]\s/g, ' · ').replace(/[–—]/g, '/').replace(/(?<=\p{L})-(?=\p{L})/gu, ' ').replace(/-/g, ' ').replace(/\s{2,}/g, ' ').trim();

  /* ---------- banderas ---------- */
  const UK = { 'GB-ENG': ['England', 'Inglaterra'], 'GB-SCT': ['Scotland', 'Escocia'], 'GB-WLS': ['Wales', 'Gales'], 'GB-NIR': ['Northern Ireland', 'Irlanda del Norte'] };
  const cod = (c) => { c = String(c || '').trim(); return /^[A-Za-z]{2}$/.test(c) ? c.toLowerCase() : /^GB-[A-Za-z]{3}$/i.test(c) ? c.toLowerCase() : '' };
  const nombrePais = (c) => {
    c = String(c || '').trim().toUpperCase(); if (UK[c]) return UK[c][EN() ? 0 : 1];
    return g(() => new Intl.DisplayNames([EN() ? 'en' : 'es'], { type: 'region' }).of(c), '') || c;
  };
  // <img> de la bandera de verdad. cc = codigo de 2 letras (UA, BR, GB-ENG...); href = bandera ya hecha (la de ESPN); '' si no hay nada que pintar
  const flag = (cc, href, cls = '', nombre = '') => {
    const k = cod(cc), src = href || (k ? `https://flagcdn.com/w40/${k}.png` : ''); if (!src) return '';
    const set = !href && k ? ` srcset="https://flagcdn.com/w80/${k}.png 2x"` : '', nm = nombre || (k ? nombrePais(cc) : '');
    return `<img class="fl ${cls}" src="${esc(src)}"${set} alt="${esc(nm)}" title="${esc(nm)}" width="20" height="15" loading="lazy" onerror="this.style.display='none'">`;
  };

  /* ---------- agentes de Valorant: iconos oficiales de valorant-api.com ---------- */
  const ngr = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  let AG = null, agP = null;
  function cargaAg() {
    if (AG) return Promise.resolve(AG);
    if (agP) return agP;
    const KEY = 'gm-valo-agentes-1';
    try { const c = JSON.parse(localStorage.getItem(KEY) || 'null'); if (c && Date.now() - c.t < 6048e5 && c.l?.length) { AG = new Map(c.l); return Promise.resolve(AG) } } catch {}
    agP = fetch('https://valorant-api.com/v1/agents?isPlayableCharacter=true').then((r) => (r.ok ? r.json() : null)).then((j) => {
      const l = (j?.data || []).filter((a) => a.displayName && (a.displayIconSmall || a.displayIcon)).map((a) => [ngr(a.displayName), { n: a.displayName, i: a.displayIconSmall || a.displayIcon }]);
      if (!l.length) return null;
      AG = new Map(l); try { localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), l })) } catch {}
      return AG;
    }).catch(() => null).finally(() => { agP = null });
    return agP;
  }
  // despues de pintar el panel: pone el icono de cada agente (hasta que llegue, el hueco ya tiene su tamano y no salta nada)
  function post(el) {
    const top = g(() => S.eqp.pila[S.eqp.pila.length - 1], null);
    if (top && !top.jug && (top.s === 'v' || top.s === 'c')) for (const b of el.querySelectorAll('.eq-c:not(.st):not(.eqx-p) > b:not([data-jug])')) { b.dataset.jug = b.textContent.trim(); b.dataset.jtid = top.tid || ''; b.dataset.js = top.s; b.dataset.jtn = top.n || ''; b.classList.add('eqx-jn') }
    const on = el && el.querySelector && el.querySelector('.eq-tabs .on'); if (on && on.scrollIntoView) g(() => on.scrollIntoView({ inline: 'center', block: 'nearest' }));   // en el movil la pestana activa puede quedar fuera de la vista
    const hs = el && el.querySelectorAll ? el.querySelectorAll('.eqx-ag[data-ag]:not(.ok)') : [];
    if (!hs.length) return;
    cargaAg().then((m) => {
      for (const h of hs) {
        if (!h.isConnected) continue; const a = m && m.get(ngr(h.dataset.ag));
        if (a) { const im = h.querySelector('img'); im.alt = a.n; im.src = a.i; im.onerror = () => { h.classList.add('sin') }; h.title = [a.n, h.dataset.t].filter(Boolean).join(' · '); h.classList.add('ok') }
        else h.classList.add('sin', 'ok');
      }
    });
  }

  /* ---------- fechas y textos ---------- */
  const loc = () => (EN() ? 'en-GB' : 'es-ES');
  // 'AAAA-MM-DD', 'AAAA-MM' o 'AAAA' -> "4 oct 2026", "oct 2026" o "2026"
  const fe = (f) => {
    const m = String(f || '').match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/); if (!m) return '';
    if (!m[2]) return m[1];
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +(m[3] || 1), 12));
    return new Intl.DateTimeFormat(loc(), { timeZone: 'UTC', ...(m[3] ? { day: 'numeric' } : {}), month: 'short', year: 'numeric' }).format(d).replace(/\./g, '');
  };
  // "5º a 8º" -> "5th to 8th" en ingles
  const ordEn = (n) => { n = +n; const v = n % 100; return n + (v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th') };
  const pst = (t) => (EN() ? String(t || '').replace(/(\d+)º/g, (m, n) => ordEn(n)).replace(/ a /g, ' to ') : String(t || ''));
  const ini = (n) => String(n || '?').trim().slice(0, 2).toUpperCase();
  const cap = (t) => String(t || '').charAt(0).toUpperCase() + String(t || '').slice(1);

  // roles del cuerpo tecnico (Liquipedia los da en ingles). En ingles se dejan; en espanol los comunes se traducen
  const TEC = /coach|analyst|psycholog|performance|scout|strateg|team manager|^manager$|team leader/i;
  const esTec = (s) => TEC.test(String(s.rol || ''));
  const ROLES = [[/assistant coach.*(analyst|manager)|analyst.*coach/i, 'Entrenador asistente y analista'], [/head coach/i, 'Entrenador principal'], [/assistant coach/i, 'Entrenador asistente'],
    [/performance (coach|manager)/i, 'Preparador de rendimiento'], [/strateg\w+ coach|analyst.*strateg/i, 'Entrenador estratégico'], [/interim coach/i, 'Entrenador interino'], [/coach/i, 'Entrenador'],
    [/data analyst/i, 'Analista de datos'], [/analyst/i, 'Analista'], [/psycholog/i, 'Psicólogo deportivo'], [/^team manager$|^manager$/i, 'Manager'], [/scout/i, 'Ojeador'], [/team leader/i, 'Líder del equipo']];
  const rolStaff = (r) => { r = String(r || ''); if (!r) return ''; if (EN()) return sg(r); for (const [re, t] of ROLES) if (re.test(r)) return t; return sg(r) };
  const CS = { igl: 'IGL', awp: 'AWPer', awper: 'AWPer', rifle: 'Rifler', rifler: 'Rifler', entry: 'Entry', support: 'Support', lurk: 'Lurker', lurker: 'Lurker', flex: 'Flex', hybrid: 'Hybrid', sniper: 'AWPer' };
  const rolCs = (r) => CS[String(r).toLowerCase()] || cap(sg(r));

  /* ---------- la ficha ampliada ---------- */
  const tier = (t) => (t && /^[SABCD]$/.test(t) ? t : '');
  // los cambios de siempre: quien entro, quien salio y cuando (jugadores y cuerpo tecnico), del mas nuevo al mas viejo
  function cambiosDe(x) {
    const ev = [], f2 = (f) => String(f || '').padEnd(10, '0');
    const add = (f, k, q, pais, rol, nuevo) => { if (f && /^\d{4}/.test(f)) ev.push({ f, k, q, pais, rol, nuevo: nuevo || '' }) };
    for (const j of x.jugadores || []) { add(j.desde, 'in', j.nombre, j.pais, 'J'); if (j.estado === 'Inactive') add(j.inactivo_desde, 'ina', j.nombre, j.pais, 'J') }
    for (const j of x.exjugadores || []) { add(j.desde, 'in', j.nombre, j.pais, 'J'); add(j.hasta, 'out', j.nombre, j.pais, 'J', j.nuevo_equipo) }
    for (const s of (x.staff || []).filter(esTec)) add(s.desde, 'in', s.nombre, s.pais, rolStaff(s.rol));
    for (const s of (x.exstaff || []).filter(esTec)) { add(s.desde, 'in', s.nombre, s.pais, rolStaff(s.rol)); add(s.hasta, 'out', s.nombre, s.pais, rolStaff(s.rol), s.nuevo_equipo) }
    return ev.sort((a, b) => f2(b.f).localeCompare(f2(a.f)) || (a.k === 'out') - (b.k === 'out'));
  }
  // lo que app.js ve de una ficha ampliada: KPI con bandera, palmares, ganancias y cambios
  function norm(e, d, o) {
    const x = d && d.x; if (!x || typeof x !== 'object') return;
    o.x = x;
    if (e.s === 'v' || e.s === 'c') {
      if (e.s === 'v') cargaAg();
      const T = x.titulos, pais = (x.equipo && x.equipo.pais) || (d.t && d.t.loc) || '', sig = (x.equipo && x.equipo.siglas) || (d.t && d.t.acr) || '';
      o.ps = { pais, sig };
      const fl = pais && flag(pais);
      o.kpi = [...(pais ? [['País', fl ? { html: fl + esc(nombrePais(pais)) } : pais]] : []), ...(sig ? [['Siglas', sig]] : []), ...(T && T.total != null ? [['Torneos ganados', T.total]] : []),
        ...o.kpi.filter(([a]) => a !== 'País' && a !== 'Siglas')];
      if (!o.palm.length) o.palm = (x.palmares || []).map((p) => ({ n: p.torneo, puesto: p.puesto, fecha: p.fecha, premio: p.premio }));
      if (!o.palm.length && T && T.lista && T.lista.length) o.palm = T.lista.slice(0, 12).map((p) => ({ n: p.t, puesto: '1º', fecha: p.f, premio: p.p }));
      if (x.ganancias && x.ganancias.total != null) o.gan = { total: x.ganancias.total, anos: (x.ganancias.por_ano || []).map((a) => ({ a: a.ano, v: a.usd })), nota: x.ganancias.nota || '' };
      if (!o.gente.length && (x.jugadores || []).length) o.gente = x.jugadores.map((j) => ({ n: j.nombre, pais: j.pais, img: j.foto }));
      o.cam = cambiosDe(x);
    } else if (e.s === 'f') {
      const c = x.club || {};
      o.ps = { club: [c.estadio, c.ciudad].filter(Boolean).join(' · ') };
      o.kpi = [...o.kpi, ...(c.estadio ? [['Estadio', c.estadio]] : []), ...(c.fundado ? [['Fundado', c.fundado]] : []), ...(c.apodo ? [['Apodo', c.apodo]] : [])];
      if (!o.palm.length) o.palm = (x.palmares || []).map((p) => ({ n: p.torneo, puesto: p.puesto, fecha: '', premio: null }));
    }
  }
  const cab = (e, o) => {
    const p = o && o.ps; if (!p) return '';
    if (p.club) return `<span class="eq-ps">${esc(p.club)}</span>`;
    const fl = p.pais && flag(p.pais); if (!fl && !p.sig) return '';
    return `<span class="eq-ps">${fl}${p.pais ? `<span>${esc(nombrePais(p.pais))}</span>` : ''}${p.sig ? `<span class="eq-sg">${esc(p.sig)}</span>` : ''}</span>`;
  };

  /* ---------- pestana Plantilla ---------- */
  // el nombre de un jugador tocable: jugadores.js lo atiende (ficha al pulsar, vista previa al pasar el raton)
  const ja = (nick, e) => `data-jug="${esc(nick)}" data-jtid="${esc((e && e.tid) || '')}" data-js="${esc((e && e.s) || '')}" data-jtn="${esc((e && e.n) || '')}"`;
  const pn = (t) => { const m = String(t || '').match(/^(\d+)/); return m ? +m[1] : 0 };
  // copa dibujada aqui (no es arte de ningun juego): oro, plata y bronce segun el puesto; del 4 en adelante, un punto
  const copa = (n) => (n >= 1 && n <= 3 ? `<svg class="eqx-copa c${n}" viewBox="0 0 24 24" aria-hidden="true"><path class="as" d="M7.5 5H4.5v1.6A3.6 3.6 0 0 0 8 10.2M16.5 5h3v1.6a3.6 3.6 0 0 1-3.5 3.6"/><path class="cu" d="M7 3h10v5.2a5 5 0 0 1-10 0z"/><path class="pi" d="M12 13.2v3.3M9.2 16.5h5.6l.7 4H8.5z"/></svg>` : '<span class="eqx-pt"></span>');
  const LOGO = 'https://liquipedia.net/commons/images/';
  // icono de un titulo: el logo del torneo (Liquipedia) con una copa pequena, o solo la copa si no hay logo
  const icono = (l, n) => `<span class="eqx-ic${l ? '' : ' sin'}">${l ? `<img src="${LOGO}${esc(l)}" referrerpolicy="no-referrer" alt="" loading="lazy" onerror="this.parentNode.classList.add('sin');this.remove()">` : ''}${copa(n)}</span>`;
  const sec = (t, n, cuerpo) => `<h4 class="eqx-h"><span>${t}</span>${n != null ? `<i>${n}</i>` : ''}</h4>${cuerpo}`;
  const foto = (j) => (j.foto ? `<img src="${esc(j.foto)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : `<span class="eqx-i">${esc(ini(j.nombre))}</span>`);
  function agentes(j) {
    const l = (j.agentes || []).filter((a) => a && a.a).slice(0, 3); if (!l.length) return '';
    return `<span class="eqx-ags">${l.map((a) => `<span class="eqx-ag" data-ag="${esc(a.a)}" data-t="${esc(a.pj != null ? `${a.pj} ${EN() ? 'maps' : 'mapas'}${a.pct != null ? ` · ${a.pct}%` : ''}` : '')}"><img alt="" loading="lazy"><i>${a.pct != null ? a.pct + '%' : ''}</i><u>${esc(cap(a.a))}</u></span>`).join('')}</span>`;
  }
  const rolesCs = (j) => ((j.roles || []).length ? `<span class="eqx-ros">${j.roles.map((r) => `<span class="eqx-ro">${esc(rolCs(r))}</span>`).join('')}</span>` : '');
  function card(j, e, chico) {
    const est = j.estado === 'Inactive' ? ['Inactivo', j.inactivo_desde] : j.estado === 'Substitute' ? ['Suplente', ''] : j.estado === 'Stand-in' ? ['Suplente temporal', ''] : j.estado === 'Loan' ? ['Cedido', ''] : null;
    const real = [j.nombre_real && j.nombre_real !== j.nombre ? sg(j.nombre_real) : '', j.edad ? j.edad + ' años' : ''].filter(Boolean).join(' · ');
    return `<div class="eqx-p${chico ? ' chico' : ''}">
      <span class="eqx-ph" ${ja(j.nombre, e)}>${foto(j)}${flag(j.pais, null, 'eqx-fb')}</span>
      <span class="eqx-n"><b class="eqx-jn" ${ja(j.nombre, e)}>${esc(j.nombre)}</b>${j.capitan ? '<em class="eqx-cap">Capitán</em>' : ''}</span>
      ${real ? `<small>${esc(real)}</small>` : ''}
      ${e.s === 'v' ? agentes(j) : rolesCs(j)}
      ${est ? `<span class="eqx-est"><span>${est[0]}</span>${est[1] ? ` <span>desde</span> <time>${esc(fe(est[1]))}</time>` : ''}</span>` : j.desde ? `<span class="eqx-ds"><span>Desde</span> <time>${esc(fe(j.desde))}</time></span>` : ''}
    </div>`;
  }
  const filaStaff = (s, e) => `<div class="eqx-s">${flag(s.pais) || '<i class="eqx-sf"></i>'}<span class="eqx-sn"><b class="eqx-jn" ${ja(s.nombre, e)}>${esc(s.nombre)}</b>${s.nombre_real && s.nombre_real !== s.nombre ? `<small>${esc(sg(s.nombre_real))}</small>` : ''}</span><span class="eqx-sr">${esc(rolStaff(s.rol))}</span>${s.desde ? `<time>${esc(fe(s.desde))}</time>` : '<time></time>'}</div>`;
  function atrib(x, e) {
    const l = (x.atribucion || []).filter((a) => a && a.texto);
    const hs = l.map((a) => (a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.texto)}</a>` : `<span>${esc(a.texto)}</span>`) + (a.licencia ? ` <small>${esc(sg(a.licencia))}</small>` : ''));
    if (e.s === 'v') hs.push('<a href="https://valorant-api.com" target="_blank" rel="noopener">Iconos de agentes: Riot Games</a>');
    return hs.length ? `<p class="eqx-at">${hs.join(' · ')}</p>` : '';
  }
  function plantilla(e, o) {
    const x = o.x, J = (x.jugadores || []).filter((j) => j && j.nombre); if (!J.length) return null;
    const v2 = (x.ver || 1) >= 2;
    const tit = v2 ? J.filter((j) => !j.estado || j.estado === 'Loan') : J, ban = v2 ? J.filter((j) => j.estado && j.estado !== 'Loan') : [];
    const tec = (x.staff || []).filter(esTec), org = (x.staff || []).filter((s) => !esTec(s));
    let h = sec(v2 ? 'Titulares' : 'Plantilla', tit.length, `<div class="eqx-pl">${tit.map((j) => card(j, e)).join('') || '<p class="hint">Sin titulares a la vista.</p>'}</div>`);
    if (ban.length) h += sec('Suplentes y banquillo', ban.length, `<div class="eqx-pl chico">${ban.map((j) => card(j, e, true)).join('')}</div>`);
    if (tec.length) h += sec('Cuerpo técnico', tec.length, `<div class="eqx-ss">${tec.map((s) => filaStaff(s, e)).join('')}</div>`);
    if (org.length) h += sec('Organización', org.length, `<div class="eqx-ss org">${org.map((s) => filaStaff(s, e)).join('')}</div>`);
    return h + atrib(x, e);
  }

  /* ---------- pestana Palmares ---------- */
  function palmares(e, o, P) {
    const T = o.x.titulos; if (!T || !(T.lista || []).length) return null;
    const todos = [...T.lista.map((x) => ({ ...x, n: 1 })), ...(T.podios || [])].sort((a, b) => String(b.f).localeCompare(String(a.f)));
    const pto = ['1', '2', '3'].includes(String(P.pto)) ? +P.pto : 0, porPto = (n) => todos.filter((x) => x.n === n).length;
    const base = pto ? todos.filter((x) => x.n === pto) : todos;
    const tiers = [...new Set(base.map((x) => x.k).filter(tier))].sort((a, b) => 'SABCD'.indexOf(a) - 'SABCD'.indexOf(b)), filtro = tier(P.tier) && tiers.includes(P.tier) ? P.tier : '';
    const lista = filtro ? base.filter((x) => x.k === filtro) : base, pg = Math.min(P.pag || 0, Math.max(0, Math.ceil(lista.length / EQ_POR) - 1));
    const filas = lista.slice(pg * EQ_POR, pg * EQ_POR + EQ_POR).map((x) => `<div class="eqx-w n${x.n}">${icono(x.l, x.n)}
      <span class="eqx-wn"><b>${esc(sg(x.t))}</b><small><time>${esc(fe(x.f))}</time>${x.m ? ` · ${esc(x.m)}` : ''}${x.r ? ` <span>contra</span> ${esc(sg(x.r))}` : ''}</small></span>
      <span class="eqx-wk">${x.k ? esc(x.k) : ''}</span>${x.p ? `<b class="eqx-wp">${N(x.p)} $</b>` : '<span></span>'}</div>`).join('');
    const kp = (a, b) => (b != null ? `<div><span class="lab">${a}</span><b>${b}</b></div>` : '');
    const chip = (n, txt) => `<button data-eqpto="${n}" class="${pto === n ? 'on' : ''}">${n ? copa(n) : ''}${txt}<i>${n ? porPto(n) : todos.length}</i></button>`;
    return `<div class="eqx-tt"><div class="eqx-big"><span class="lab">Torneos ganados</span><b>${N(T.total)}</b></div>${kp('Segundo puesto', T.segundos != null ? N(T.segundos) : null)}${kp('Tercer puesto', T.terceros != null ? N(T.terceros) : null)}${kp('Torneos jugados', T.jugados != null ? N(T.jugados) : null)}${kp('Desde', T.desde ? esc(fe(T.desde)) : null)}</div>
      <nav class="eqx-tr"><span class="lab">Puesto final</span>${chip(0, 'Todos')}${chip(1, 'Oro')}${porPto(2) ? chip(2, 'Plata') : ''}${porPto(3) ? chip(3, 'Bronce') : ''}</nav>
      <nav class="eqx-tr"><span class="lab">Nivel del torneo</span><button data-eqtier="" class="${filtro ? '' : 'on'}">Todas</button>${tiers.map((k) => `<button data-eqtier="${k}" class="${filtro === k ? 'on' : ''}">${k}</button>`).join('')}</nav>
      <div class="eqx-ws">${filas}</div>${eqPags(lista.length, EQ_POR, pg)}
      <p class="eqx-nota">Sin clasificatorias ni partidos de exhibición.</p>${atrib(o.x, e)}`;
  }
  function palmaresFutbol(o) {
    // la lista de titulos de futbol sale de Wikipedia y a veces trae anos imposibles: solo se ensenan las filas cuyos anos son todos creibles
    const ok = (y) => { const n = +String(y).slice(0, 4); return n >= 1860 && n <= new Date().getFullYear() + 1 };
    const P = (o.x.palmares || []).filter((p) => p && p.torneo && (p.anios || []).every(ok)); if (!P.length) return null;
    const fila = (p) => `<div class="eqx-f"><span class="eqx-fn">${esc(sg(p.torneo))}</span><b>${p.veces || (p.anios || []).length || ''}</b><span class="eqx-fv">veces</span><small>${esc((p.anios || []).slice(-4).map((a) => String(a).replace(/[–-]/g, '/')).join(' · '))}</small></div>`;
    const ti = P.filter((p) => p.puesto_n === 1), su = P.filter((p) => p.puesto_n === 2);
    return (ti.length ? sec('Títulos', ti.reduce((s, p) => s + (p.veces || 1), 0), `<div class="eqx-fs">${ti.map(fila).join('')}</div>`) : '')
      + (su.length ? sec('Subcampeonatos', su.reduce((s, p) => s + (p.veces || 1), 0), `<div class="eqx-fs">${su.map(fila).join('')}</div>`) : '') + atrib(o.x, { s: 'f' });
  }

  /* ---------- pestana Cambios ---------- */
  function cambios(e, o, P) {
    const ev = o.cam || []; if (!ev.length) return null;
    const POR = 14, pg = Math.min(P.pag || 0, Math.max(0, Math.ceil(ev.length / POR) - 1));
    let anio = '', h = '';
    for (const c of ev.slice(pg * POR, pg * POR + POR)) {
      const y = c.f.slice(0, 4); if (y !== anio) { h += `<span class="lab eq-g">${y}</span>`; anio = y }
      const k = c.k === 'in' ? ['Entra', 'in'] : c.k === 'out' ? ['Sale', 'out'] : ['Pasa a inactivo', 'ina'];
      h += `<div class="eqx-c ${k[1]}"><time>${esc(fe(c.f))}</time><span class="eqx-ck">${k[0]}</span><span class="eqx-cq">${flag(c.pais) || '<i class="eqx-sf"></i>'}<b class="eqx-jn" ${ja(c.q, e)}>${esc(c.q)}</b><small>${c.rol === 'J' ? '<span>Jugador</span>' : esc(c.rol)}</small></span>${c.nuevo ? `<span class="eqx-cn"><span>a</span> ${esc(sg(c.nuevo))}</span>` : '<span></span>'}</div>`;
    }
    return `<div class="eqx-cs">${h}</div>${eqPags(ev.length, POR, pg)}${atrib(o.x, e)}`;
  }

  /* ---------- pestana Ganancias (con la nota de la fuente) ---------- */
  function ganancias(e, o, P) {
    const G = o.gan; if (!G) return null;
    const mx = Math.max(1, ...G.anos.slice(-6).map((x) => +x.v || 0)), T = o.x.titulos, pr = (T && T.premios) || [];
    const pg = Math.min(P.pag || 0, Math.max(0, Math.ceil(pr.length / EQ_POR) - 1));
    const filas = pr.slice(pg * EQ_POR, pg * EQ_POR + EQ_POR).map((x) => `<div class="eqx-w g n${pn(x[2])}"><span class="eqx-ic sin">${copa(pn(x[2]))}</span>
      <span class="eqx-wn"><b>${esc(sg(x[1]))}</b><small><time>${esc(fe(x[0]))}</time>${x[2] ? ` · ${esc(sg(pst(x[2])))}` : ''}</small></span><span class="eqx-wk">${tier(x[4]) ? esc(x[4]) : ''}</span><b class="eqx-wp">${N(x[3])} $</b></div>`).join('');
    return `<div class="eq-gt"><span class="lab">En total</span><b>${G.total != null ? N(G.total) + ' $' : '·'}</b></div>
      ${G.anos.length ? `<div class="eq-ga">${G.anos.slice(-6).map((x) => `<div><span>${esc(String(x.a))}</span><i style="width:${((+x.v || 0) / mx) * 100}%"></i><b>${N(x.v)} $</b></div>`).join('')}</div>` : ''}
      ${pr.length ? `<h4 class="eqx-h"><span>Torneo a torneo</span><i>${T.premios_n || pr.length}</i></h4><div class="eqx-ws">${filas}</div>${eqPags(pr.length, EQ_POR, pg)}` : ''}
      <p class="eqx-nota">${G.nota ? 'Aproximado. Incluye lo que ganaron los jugadores mientras representaban al equipo.' : ''}</p>${atrib(o.x, { s: 'c' })}`;
  }
  function tab(t, e, o, P) {
    if (!o || !o.x) return null;
    if (e.s === 'f') return t === 'palmares' ? palmaresFutbol(o) : null;
    if (e.s !== 'v' && e.s !== 'c') return null;
    return t === 'plantilla' ? plantilla(e, o) : t === 'palmares' ? palmares(e, o, P) : t === 'cambios' ? cambios(e, o, P) : t === 'ganancias' ? ganancias(e, o, P) : null;
  }

  /* ---------- tocar un logo abre el equipo ---------- */
  // acciones que mueven dinero o escogen una apuesta: ahi el logo no se atiende, para no estorbar
  const NO = '[data-pick],[data-stake],[data-cancel],[data-retirar],[data-accept],[data-decline],[data-sumo],[data-retar],[data-rto],[data-rpick],[data-rstake],[data-share],[data-xc],[data-cmb-co],[data-bsp]';
  // de que equipo es un logo: se busca su direccion en los partidos de la app (y en los rivales de las fichas ya abiertas)
  function deLogo(im) {
    const src = im.getAttribute('src'); if (!src || /^data:/.test(src)) return null;
    for (const m of g(() => M, [])) { if (m.s === 'b') continue; if (m.la === src) return g(() => eqDeMatch(m, 'a'), null); if (m.lb === src) return g(() => eqDeMatch(m, 'b'), null) }
    for (const [, c] of g(() => EQD, new Map())) for (const h of (c && c.d && c.d.t && c.d.t.hist) || []) if (h.logo === src && h.vsId) return { s: c.d.s, n: h.vs, logo: src, tid: h.vsId };
    return null;
  }
  const abre = (d) => { S.eqp = { pila: [d], tab: 'resumen', pag: 0 }; render() };
  document.addEventListener('click', (e) => {
    const im = e.target; if (!im || im.tagName !== 'IMG' || !im.closest) return;
    if (im.closest('#eqp') || im.closest(NO) || im.classList.contains('fl') || /(^|-)wm(\s|$)|rc-wm|mt-wm|rsl-wm/.test(im.className || '')) return;
    const d = deLogo(im); if (!d) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    abre(d);
  }, true);
  // el cursor de mano solo en los logos que de verdad abren un equipo
  document.addEventListener('mouseover', (e) => {
    const im = e.target; if (!im || im.tagName !== 'IMG' || im.classList.contains('eqx-lg') || im.classList.contains('fl') || (im.closest && (im.closest('#eqp') || im.closest(NO)))) return;
    if (deLogo(im)) im.classList.add('eqx-lg');
  }, true);
  // Escape cierra primero el panel del equipo (si no, cerraria la ventana del partido que tiene debajo)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && g(() => S.eqp, null)) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); S.eqp = null; render() }
  }, true);
  // filtro de categoria del palmares
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-eqtier]'); if (!b || !g(() => S.eqp, null)) return;
    e.stopPropagation(); S.eqp.tier = b.dataset.eqtier; S.eqp.pag = 0; render();
  }, true);

  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-eqpto]'); if (!b || !g(() => S.eqp, null)) return;
    e.stopPropagation(); S.eqp.pto = b.dataset.eqpto; S.eqp.pag = 0; render();
  }, true);

  window.GM_EQ = { flag, norm, cab, tab, post, abre, nombrePais, de: deLogo, fe, sg, ngr, cap, ini, copa, pst, pn, icono, rolCs, rolStaff, esTec, cargaAg, ja, loc };
})();
