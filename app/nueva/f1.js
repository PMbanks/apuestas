// Formula 1 en Gambling Addicts (PM, 01-11: "pondria F1 para apostar en Bets y que haga todo bien: que se pueda apostar bien,
// registro de otros años de corredores, etc., todo bien hecho"). Base: db/052_f1.sql. Sincronizador: sync/f1.mjs (Jolpica).
// Cada sesion de un Gran Premio es un partido (carrera, clasificacion, sprint) y los duelos entre companeros tambien (1 / 2 normal,
// con reto). Este modulo, aparte de app.js como nba.js:
//  1) amplia GM_MK (mercados.js) con los codigos de la F1, asi el boleto, Mis apuestas, Inicio, Todos, el resultado y las combinadas
//     los nombran, los agrupan y saben su cuota sin tocar nada mas;
//  2) pinta la ficha del Gran Premio (GM_F1.ficha): sesiones, mercados con cuota, parrilla, resultado, circuito y ganadores;
//  3) pinta la fila de Partidos (GM_F1.cuotasFila) y la cabecera del filtro F1 con el campeonato (GM_F1.cabeza);
//  4) comparte con f1fichas.js (fichas de piloto y escuderia, clasificaciones) los datos de piloto, color, bandera y ESPN.
// Codigos (los mismos que la base): FW:id gana la carrera · FP:id podio · FT:id top 10 · FL:id vuelta rapida · FX:id abandona ·
// FQ:id pole · FS:id gana el sprint · FC:id campeon de pilotos · FK:id campeon de constructores (id = el de Jolpica).
'use strict';
(function () {
  if (window.GM_F1) return;
  const g = (f, d) => { try { const v = f(); return v === undefined ? d : v } catch { return d } };
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const en = () => document.documentElement.lang === 'en';
  const T = (es, ing) => (en() ? ing : es);
  const dec = (x) => String(x).replace('.', en() ? '.' : ',');
  const O = (x) => Number(x).toFixed(2).replace('.', en() ? '.' : ',');
  const RE = /^F([WPTLXQSCK]):([a-z0-9_]{2,40})$/;
  const MKN = { W: ['gana la carrera', 'wins the race'], P: ['sube al podio', 'finishes on the podium'], T: ['entre los 10 primeros', 'finishes in the top 10'], L: ['vuelta rápida', 'fastest lap'],
    X: ['abandona', 'retires'], Q: ['pole position', 'pole position'], S: ['gana el sprint', 'wins the sprint'], C: ['campeón de pilotos', "drivers' champion"], K: ['campeón de constructores', "constructors' champion"] };
  const SESION = { race: ['Carrera', 'Race'], quali: ['Clasificación', 'Qualifying'], sprint: ['Sprint', 'Sprint'] };
  const PRINCIPAL = { race: 'FW', quali: 'FQ', sprint: 'FS', wdc: 'FC', wcc: 'FK' };
  const WEB = 'https://pmbanks.github.io/apuestas/nueva/f1/';

  /* ---------- colores de las escuderias y banderas ---------- */
  const COLOR = { mercedes: '#27f4d2', ferrari: '#e8002d', red_bull: '#3671c6', mclaren: '#ff8000', alpine: '#00a1e8', aston_martin: '#229971', williams: '#64c4ff', rb: '#6692ff', alphatauri: '#5e8faa',
    haas: '#b6babd', sauber: '#52e252', audi: '#e5e5e5', cadillac: '#c9c9c9', alfa: '#a42134', renault: '#ffd800', racing_point: '#f596c8', toro_rosso: '#469bff', lotus_f1: '#ffb800', force_india: '#f596c8' };
  const NAC = { British: 'gb', Dutch: 'nl', Monegasque: 'mc', Spanish: 'es', German: 'de', Finnish: 'fi', French: 'fr', Italian: 'it', Australian: 'au', Canadian: 'ca', Mexican: 'mx', Thai: 'th', Japanese: 'jp', Chinese: 'cn',
    Danish: 'dk', American: 'us', Brazilian: 'br', Argentine: 'ar', Argentinian: 'ar', Austrian: 'at', Belgian: 'be', Swiss: 'ch', Swedish: 'se', Polish: 'pl', Russian: 'ru', Venezuelan: 've', 'New Zealander': 'nz',
    Colombian: 'co', Indonesian: 'id', 'South African': 'za', Irish: 'ie', Hungarian: 'hu', Czech: 'cz', Portuguese: 'pt', Uruguayan: 'uy', Chilean: 'cl', Indian: 'in', Malaysian: 'my', Liechtensteiner: 'li',
    Rhodesian: 'zw', 'East German': 'de', Moroccan: 'ma', Estonian: 'ee', Luxembourger: 'lu', Emirati: 'ae', Turkish: 'tr', Egyptian: 'eg', Monacan: 'mc', Cuban: 'cu', Peruvian: 'pe', Romanian: 'ro', Dane: 'dk' };
  const iso = (nac) => NAC[nac] || '';
  const paisDe = (cc) => g(() => new Intl.DisplayNames([en() ? 'en' : 'es'], { type: 'region' }).of(String(cc).toUpperCase()), '') || cc;
  const flagUrl = (cc, w = 40) => (cc ? `https://flagcdn.com/w${w}/${cc}.png` : '');
  const bandera = (cc, cls = '') => (cc ? `<img class="fl f1-fl ${cls}" src="${flagUrl(cc)}" srcset="${flagUrl(cc, 80)} 2x" alt="" width="20" height="15" loading="lazy" onerror="this.style.display='none'">` : '');
  const FOTO = (espnId) => `https://a.espncdn.com/i/headshots/rpm/players/full/${espnId}.png`;
  const ini = (n) => String(n || '?').split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const bonito = (id) => String(id || '').split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  // el apellido de un nombre completo: "Andrea Kimi Antonelli" da Antonelli, "Nyck de Vries" da de Vries
  const apellido = (n) => { const w = String(n || '').trim().split(/\s+/); if (w.length < 3) return w.length > 1 ? w[1] : w[0] || ''; return /^(de|da|di|del|van|von|der|le|la|el|dos|du|ten)$/i.test(w[1]) ? w.slice(1).join(' ') : w.slice(2).join(' ') };

  /* ---------- datos de los partidos de F1 (details y cuotas) ---------- */
  const D = new Map();                       // id -> { id, k, s, at, h, a, d, mk }
  const C = { t: 0, vivo: false, off: 0 };
  async function carga(ya) {
    const cli = g(() => db, null); if (!cli || C.vivo || Date.now() < C.off || (!ya && Date.now() - C.t < 60e3) || !g(() => loaded, false)) return;
    C.vivo = true;
    try {
      const { data, error } = await cli.from('matches').select('id,status,starts_at,home,away,details,odds_mk').eq('sport', 'r')
        .gte('starts_at', new Date(Date.now() - 40 * 864e5).toISOString()).limit(600);
      if (error) throw error;
      D.clear();
      for (const r of data || []) D.set(r.id, { id: r.id, k: r.details?.kind || '', s: r.status, at: r.starts_at, h: r.home, a: r.away, d: r.details || {}, mk: r.odds_mk && typeof r.odds_mk === 'object' ? r.odds_mk : {} });
      C.t = Date.now();
    } catch (e) { C.off = Date.now() + 3 * 60e3; C.t = Date.now() }
    C.vivo = false;
    if (g(() => S.scr, '') === 'partidos' && g(() => byId(S.foc)?.s, '') === 'r' && !document.activeElement?.matches?.('input,textarea')) g(() => render());
    try { window.dispatchEvent(new CustomEvent('gm:f1')) } catch {}
  }
  const dat = (id) => D.get(id) || null;
  const nomP = (d, id) => d?.dr?.[id] || bonito(id);
  const nomE = (d, id) => d?.eq?.[id] || (id === 'rb' ? 'Racing Bulls' : bonito(id));
  const colorE = (id) => (id && COLOR[id]) || ESPN.col.get(id) || '#8a8f98';
  const fotoP = (d, id) => (d?.ph?.[id] ? FOTO(d.ph[id]) : fotoDeNombre(nomP(d, id)));
  const caraP = (d, id, cls = '') => { const f = fotoP(d, id), c = colorE(d?.tm?.[id]); return `<span class="f1-ph ${cls}" style="--c:${c}">${f ? `<img src="${esc(f)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}<i>${esc(ini(nomP(d, id)))}</i></span>` };

  /* ---------- ESPN: clasificacion (fotos, colores, campeonato de hoy) ---------- */
  const ESPN = { j: null, p: null, foto: new Map(), col: new Map(), pil: [], con: [] };
  function espn() {
    if (ESPN.p) return ESPN.p;
    try { const c = JSON.parse(sessionStorage.getItem('gm-f1-espn') || 'null'); if (c && Date.now() - c.t < 30 * 60e3) { llena(c.j); ESPN.p = Promise.resolve(ESPN.j); return ESPN.p } } catch {}
    ESPN.p = fetch('https://site.api.espn.com/apis/v2/sports/racing/f1/standings').then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!j || !j.children) return null; llena(j); try { sessionStorage.setItem('gm-f1-espn', JSON.stringify({ t: Date.now(), j })) } catch {} return j;
    }).catch(() => null).then((j) => { if (!j) setTimeout(() => { ESPN.p = null }, 60e3); return j });
    return ESPN.p;
  }
  function llena(j) {
    ESPN.j = j; ESPN.pil = []; ESPN.con = [];
    const stat = (e, n) => g(() => e.stats.find((s) => s.name === n).value, 0);
    for (const ch of j.children || []) {
      const es = ch.standings?.entries || [];
      if (/driver/i.test(ch.name)) ESPN.pil = es.map((e) => ({ id: e.athlete?.id, n: e.athlete?.displayName || '', pts: stat(e, 'championshipPts'), pos: stat(e, 'rank'), flag: e.athlete?.flag?.href || '' }));
      else ESPN.con = es.map((e) => ({ id: e.team?.id, n: e.team?.displayName || '', pts: stat(e, 'points'), pos: stat(e, 'rank'), col: e.team?.color || '' }));
    }
    for (const t of ESPN.con) if (t.col) ESPN.col.set(norm(t.n), '#' + t.col);
  }
  // el id de Jolpica de un nombre de ESPN ("Kimi Antonelli"): con los pilotos de los partidos cargados
  function idPorNombre(n) {
    const x = norm(n); if (!x) return '';
    let best = '';
    for (const e of D.values()) for (const [id, full] of Object.entries(e.d.dr || {})) {
      const y = norm(full); if (y === x || y.endsWith(' ' + x) || x.endsWith(' ' + y)) return id;
      const fam = norm(apellido(full)).split(' ').pop(); if (fam && x.split(' ').pop() === fam && norm(full).split(' ')[0].charAt(0) === x.charAt(0)) best = best || id;
    }
    return best;
  }
  const fotoDeNombre = (n) => { const x = norm(n); if (!x) return ''; const a = ESPN.pil.find((p) => { const y = norm(p.n); return y === x || y.endsWith(' ' + x) || x.endsWith(' ' + y) }); return a ? FOTO(a.id) : '' };
  // el id de Jolpica de una escuderia por el nombre que da ESPN ("Red Bull", "Haas")
  function idEqPorNombre(n) {
    const x = norm(n); if (!x) return '';
    for (const e of D.values()) for (const [id, full] of Object.entries(e.d.eq || {})) { const y = norm(full); if (y === x || y.includes(x) || x.includes(y)) return id }
    return '';
  }

  /* ---------- los codigos ---------- */
  const esF = (p) => typeof p === 'string' && RE.test(p);
  const equipos = (m) => [m?.a ?? m?.home ?? '', m?.b ?? m?.away ?? ''];
  function nombre(m, p) {
    const x = RE.exec(p); const e = dat(m?.id), d = e?.d;
    const quien = x[1] === 'K' ? nomE(d, x[2]) : nomP(d, x[2]);
    return `${quien}: ${MKN[x[1]][en() ? 1 : 0]}`;
  }
  const MK0 = window.GM_MK || { valido: () => false, es: () => false, grupo: () => '1X2', lado: () => null, nombre: (m, p) => String(p ?? '?'), va: () => '', cuota: () => null, cuotas: () => null, carga: () => {} };
  const orig = { ...MK0 };
  Object.assign(MK0, {
    valido: (p) => esF(p) || orig.valido(p),
    es: (p) => esF(p) || orig.es(p),
    grupo: (p) => (esF(p) ? 'F' + RE.exec(p)[1] : orig.grupo(p)),
    lado: (p) => (esF(p) ? null : orig.lado(p)),
    nombre: (m, p) => (esF(p) ? nombre(m, p) : orig.nombre(m, p)),
    va: (m, p, sc) => (esF(p) ? '' : orig.va(m, p, sc)),
    cuota: (m, p) => { if (!esF(p)) return orig.cuota(m, p); const o = m && dat(m.id)?.mk?.[p]; return typeof o === 'number' && o > 1 ? o : orig.cuota(m, p) },
  });
  window.GM_MK = MK0;

  /* ---------- lo que toca app.js ---------- */
  const esGP = (m) => !!m && m.s === 'r' && !!m.fk && m.fk !== 'duel';
  const mkDe = (m) => dat(m.id)?.mk || {};
  function favorito(m) {
    const code = PRINCIPAL[m.fk]; if (!code) return null;
    const mk = mkDe(m), ks = Object.keys(mk).filter((k) => k.startsWith(code + ':')); if (!ks.length) return null;
    ks.sort((a, b) => mk[a] - mk[b]); const k = ks[0], id = k.slice(3), d = dat(m.id)?.d;
    return { id, n: code === 'FK' ? nomE(d, id) : apellido(nomP(d, id)), o: mk[k] };
  }
  // la fila de Partidos: en vez de 1 X 2, lo que se sabe de la sesion (favorito, ganador, en juego)
  function cuotasFila(m, open) {
    carga();
    const fin = m.status === 'final', ET = { race: 'Ganó', quali: 'Pole', sprint: 'Ganó', wdc: 'Campeón', wcc: 'Campeón' };
    let h;
    if (fin) h = `<i>${ET[m.fk] || 'Ganó'}</i><b data-notr>${esc(m.score || '·')}</b>`;
    else if (!open) h = `<i>En juego</i>`;
    else { const f = favorito(m); h = f ? `<i>Favorito</i><b data-notr>${esc(f.n)}</b><em>${O(f.o)}</em>` : `<i>${dat(m.id) ? 'Cuotas pronto' : '·'}</i>` }
    return `<span class="f1-ov">${h}</span>`;
  }

  /* ---------- la cabecera del filtro F1: el campeonato ---------- */
  const V = { mk: {}, circ: {} };
  function cabeza() {
    carga(); espn().then(() => { if (g(() => S.f, '') === 'r' && g(() => S.scr, '') === 'partidos') pintaCab() });
    return `<section class="f1-cab" id="f1-cab">${cabHtml()}</section>`;
  }
  function pintaCab() { const el = document.getElementById('f1-cab'); if (!el) return; const h = cabHtml(); if (el.dataset.h === h) return; el.dataset.h = h; el.innerHTML = h; if (window.GM_LANG) GM_LANG.traduce(el) }
  function cabHtml() {
    const p = ESPN.pil.slice(0, 3), c = ESPN.con.slice(0, 3);
    const yr = g(() => (ESPN.j?.children?.[0]?.standings?.season) || new Date().getFullYear(), new Date().getFullYear());
    const fila = (x, i, k) => `<button type="button" class="f1-cr" ${k === 'p' ? `data-f1n="${esc(x.n)}"` : `data-f1e="${esc(norm(x.n))}" data-f1en="${esc(x.n)}"`}><span class="f1-pos">${x.pos || i + 1}</span>${k === 'p' ? `<img class="f1-mini" src="${FOTO(x.id)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : `<i class="f1-dot" style="--c:${esc(ESPN.col.get(norm(x.n)) || '#888')}"></i>`}<b data-notr>${esc(x.n)}</b><span class="f1-pts">${x.pts}</span></button>`;
    const vacio = !g(() => M.some((x) => x.s === 'r'), false) ? '<p class="hint f1-vacio">Los Grandes Premios con cuotas aparecen aquí unos días antes de cada fin de semana.</p>' : '';
    return `${vacio}<div class="f1-cab-h"><span class="lab">Campeonato ${esc(yr)}</span><button type="button" class="f1-link" data-f1c="d">Ver clasificaciones completas</button></div>
      <div class="f1-cab-g"><div class="f1-cs"><span class="lab f1-sub">Pilotos</span>${p.length ? p.map((x, i) => fila(x, i, 'p')).join('') : '<p class="hint">·</p>'}</div>
      <div class="f1-cs"><span class="lab f1-sub">Constructores</span>${c.length ? c.map((x, i) => fila(x, i, 'c')).join('') : '<p class="hint">·</p>'}</div></div>`;
  }

  /* ---------- la ficha del Gran Premio ---------- */
  const abierto = (m) => m && m.status === 'scheduled' && Date.parse(m.at) > Date.now();
  const mias = (m) => new Set(g(() => ALL.filter((b) => b.k === MEK && b.m === m.id && b.st === 'open').map((b) => b.p), []));
  const hoy = (t) => `${g(() => WD(t), '')} ${g(() => DD(t), '')} ${g(() => MO(t), '')} · ${g(() => HM(t), '')}`;
  function boton(m, p, mine) {
    const o = mkDe(m)[p];
    return !(o > 1) ? '<span class="mq-o na f1-o"></span>' : `<button type="button" class="mq-o f1-o ${mine.has(p) ? 'mine' : ''}" data-pick="${esc(m.id)}|${esc(p)}" title="${esc(nombre(m, p))}"><b>${O(o)}</b></button>`;
  }
  // una fila por piloto (o escuderia): puesto de salida, cara, nombre y su cuota
  function filaP(m, d, id, code, mine, extra) {
    const esK = code === 'FK', p = `${code}:${id}`, grid = d?.grid?.[id];
    const sin = !(mkDe(m)[p] > 1);
    const quien = esK ? `<span class="f1-eq" style="--c:${colorE(id)}"><i></i></span>` : caraP(d, id);
    return `<div class="f1-r ${sin ? 'sin' : ''}"><span class="f1-g">${grid ? 'P' + grid : ''}</span>${quien}
      <span class="f1-n">${esK ? `<b class="f1-lk" data-f1e="${esc(id)}" data-notr>${esc(nomE(d, id))}</b>` : `<b class="f1-lk" data-f1d="${esc(id)}" data-notr>${esc(nomP(d, id))}</b><small data-notr>${esc(nomE(d, d?.tm?.[id]))}</small>`}</span>${extra || ''}${boton(m, p, mine)}</div>`;
  }
  const hayGrid = (d) => !!d?.grid && Object.keys(d.grid).length > 0;
  function listaMercado(m, d, code, mine) {
    const ids = Object.keys(code === 'FK' ? d.eq || {} : d.dr || {});
    const mk = mkDe(m);
    const con = ids.filter((id) => mk[`${code}:${id}`] > 1).sort((a, b) => mk[`${code}:${a}`] - mk[`${code}:${b}`]);
    const sin = ids.filter((id) => !(mk[`${code}:${id}`] > 1)).sort((a, b) => (d.grid?.[a] || 99) - (d.grid?.[b] || 99));
    return [...con, ...sin].map((id) => filaP(m, d, id, code, mine)).join('');
  }
  const TABS = [['FW', 'Ganador'], ['FP', 'Podio'], ['FT', 'Top 10'], ['FL', 'Vuelta rápida'], ['FX', 'Abandona'], ['DU', 'Duelos']];
  const AYUDA = { FW: 'Gana la carrera', FP: 'Termina entre los 3 primeros', FT: 'Termina entre los 10 primeros', FL: 'Hace la vuelta más rápida de la carrera', FX: 'No ve la bandera de cuadros',
    FQ: 'Sale primero en la parrilla', FS: 'Gana el sprint', FC: 'Gana el campeonato de pilotos', FK: 'Gana el campeonato de constructores' };
  function duelos(m, d) {
    const gp = d.gp, ds = [...D.values()].filter((x) => x.k === 'duel' && x.d.gp === gp).sort((a, b) => a.id.localeCompare(b.id));
    if (!ds.length) return `<p class="hint">Los duelos entre compañeros salen cuando el Gran Premio está cerca.</p>`;
    const mine = (x) => g(() => ALL.filter((b) => b.k === MEK && b.m === x.id && b.st === 'open').map((b) => b.p), []);
    return ds.map((x) => {
      const mm = g(() => byId(x.id), null), ids = Object.keys(x.d.dr || {}), [A, B] = ids, oa = mm?.o?.[0], ob = mm?.o?.[2] ?? mm?.o?.[1];
      const ok = mm && mm.status === 'scheduled' && Date.parse(mm.at) > Date.now() && oa > 1;
      const ms = mine(x), win = mm?.winner;
      const bt = (id, p, o) => ok ? `<button type="button" class="mq-o f1-o ${ms.includes(p) ? 'mine' : ''}" data-pick="${esc(x.id)}|${p}"><b>${O(o)}</b></button>` : `<span class="f1-oo ${win === p ? 'w' : ''}">${win === p ? '✓' : ''}</span>`;
      return `<div class="f1-du"><div class="f1-dl">${caraP(x.d, A, 'sm')}<span class="f1-n"><b class="f1-lk" data-f1d="${esc(A)}" data-notr>${esc(nomP(x.d, A))}</b></span>${bt(A, '1', oa)}</div>
        <div class="f1-dv"><i>vs</i>${ok && window.GM_RETOS && mm ? GM_RETOS.btn(mm, 'f1') : ''}</div>
        <div class="f1-dl r">${bt(B, '2', ob)}<span class="f1-n"><b class="f1-lk" data-f1d="${esc(B)}" data-notr>${esc(nomP(x.d, B))}</b></span>${caraP(x.d, B, 'sm')}</div></div>`;
    }).join('');
  }
  // resultado oficial (o parrilla) en lista
  function listaResultado(d, res, titulo, esCarrera) {
    const o = res.o || [], st = res.st || {};
    const TXT = { R: 'Abandonó', D: 'Descalificado', S: 'No salió', L: 'Con vueltas de menos' };
    return `<div class="f1-res"><span class="lab">${titulo}</span>${o.map((id, i) => `<div class="f1-rr">
      <span class="f1-pos">${i + 1}</span>${caraP(d, id, 'sm')}<span class="f1-n"><b class="f1-lk" data-f1d="${esc(id)}" data-notr>${esc(nomP(d, id))}</b><small data-notr>${esc(nomE(d, d.tm?.[id]))}</small></span>
      <span class="f1-st">${esCarrera && res.fl === id ? '<em class="vr">Vuelta rápida</em>' : ''}${TXT[st[id]] && st[id] !== 'L' ? `<em class="${st[id] === 'R' ? 'rt' : 'ds'}">${TXT[st[id]]}</em>` : ''}</span></div>`).join('')}</div>`;
  }
  function parrilla(d) {
    const gr = Object.entries(d.grid || {}).sort((a, b) => a[1] - b[1]); if (!gr.length) return '';
    return `<div class="f1-res f1-par"><span class="lab">Parrilla de salida</span><div class="f1-pg">${gr.map(([id, n]) => `<div class="f1-pc"><span class="f1-pos">${n}</span>${caraP(d, id, 'xs')}<b class="f1-lk" data-f1d="${esc(id)}" data-notr>${esc(apellido(nomP(d, id)))}</b></div>`).join('')}</div></div>`;
  }
  // el fin de semana: las sesiones del mismo Gran Premio, cada una un partido
  function sesiones(m, d) {
    const sib = [...D.values()].filter((x) => x.d.gp === d.gp && ['quali', 'sprint', 'race'].includes(x.k)).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    if (sib.length < 2) return '';
    return `<nav class="f1-ses">${sib.map((x) => { const mm = g(() => byId(x.id), null), fin = x.s === 'final';
      return `<button type="button" class="f1-sp ${x.id === m.id ? 'on' : ''}" ${mm ? `data-foc="${esc(x.id)}"` : 'disabled'}><b>${SESION[x.k][0]}</b><small>${esc(hoy(x.at))}</small><i class="${fin ? 'ok' : x.s === 'live' ? 'vv' : ''}">${fin ? 'Acabada' : x.s === 'live' ? 'En juego' : x.s === 'canceled' ? 'Anulada' : ''}</i></button>` }).join('')}</nav>`;
  }
  const LONG = { albert_park: 5.278, shanghai: 5.451, suzuka: 5.807, bahrain: 5.412, jeddah: 6.174, miami: 5.412, imola: 4.909, monaco: 3.337, villeneuve: 4.361, catalunya: 4.657, red_bull_ring: 4.318, silverstone: 5.891,
    hungaroring: 4.381, spa: 7.004, zandvoort: 4.259, monza: 5.793, baku: 6.003, marina_bay: 4.94, americas: 5.513, rodriguez: 4.304, interlagos: 4.309, vegas: 6.201, losail: 5.419, yas_marina: 5.281, madring: 5.47 };
  function circuito(m, d) {
    const c = d.circ || {}, e = V.circ[c.id];
    const cc = g(() => (m.la || '').match(/\/w\d+\/([a-z]{2})\.png/)?.[1], '') || '';
    let h = `<div class="f1-circ" data-c="${esc(c.id)}"><span class="lab">Circuito</span><div class="f1-cn">${bandera(cc)}<b data-notr>${esc(c.name || '')}</b><small data-notr>${esc([c.loc, cc ? paisDe(cc) : c.country].filter(Boolean).join(', '))}</small></div>`;
    const km = LONG[c.id] || LONG[String(c.id).replace(/^.*?_/, '')];
    const laps = e?.laps;
    h += `<div class="f1-kv">${laps ? `<div><b>${laps}</b><span>Vueltas</span></div>` : ''}${km ? `<div><b>${dec(km.toFixed(3))} km</b><span>Longitud</span></div>` : ''}${km && laps ? `<div><b>${dec((km * laps).toFixed(1))} km</b><span>Distancia</span></div>` : ''}</div>`;
    h += `<span class="lab f1-sub">Ganadores en los últimos 10 años</span>`;
    if (!e) h += `<p class="hint f1-load">Cargando el historial…</p>`;
    else if (e.err) h += `<p class="hint">No se ha podido cargar el historial (Jolpica no responde). <button type="button" class="f1-link" data-f1r="${esc(c.id)}">Reintentar</button></p>`;
    else if (!e.w.length) h += `<p class="hint">Este circuito no tiene ganadores anteriores.</p>`;
    else h += e.w.map((w) => `<div class="f1-rr"><span class="f1-yr">${w.y}</span><span class="f1-n"><b class="f1-lk" data-f1d="${esc(w.id)}" data-notr>${esc(w.n)}</b><small data-notr>${esc(w.e)}</small></span></div>`).join('');
    return h + '</div>';
  }
  async function cargaCirc(id) {
    if (!id || V.circ[id] || V.circ['@' + id]) return;
    V.circ['@' + id] = 1;
    const j = await g(() => GM_F1.jl(`/circuits/${id}/results/1.json?limit=100`), Promise.resolve(null)).catch(() => null);
    delete V.circ['@' + id];
    const races = j?.MRData?.RaceTable?.Races;
    if (!Array.isArray(races)) { V.circ[id] = { err: true, w: [] } } else {
      const o = races.slice().sort((a, b) => b.season - a.season), last = o[0];
      V.circ[id] = { w: o.slice(0, 10).map((r) => { const x = r.Results?.[0] || {}; return { y: r.season, id: x.Driver?.driverId, n: `${x.Driver?.givenName || ''} ${x.Driver?.familyName || ''}`.trim(), e: x.Constructor?.name || '' } }), laps: Number(last?.Results?.[0]?.laps) || null };
    }
    const el = document.querySelector(`.f1-circ[data-c="${id}"]`); if (el) { const m = g(() => byId(S.foc), null), e = m && dat(m.id); if (m && e) { el.outerHTML = circuito(m, e.d); const nu = document.querySelector(`.f1-circ[data-c="${id}"]`); if (nu && window.GM_LANG) GM_LANG.traduce(nu) } }
  }
  function ficha(m) {
    carga();
    const e = dat(m.id), open = abierto(m), kind = m.fk;
    const cab = (inner) => `<section class="det f1-det ${S.sheet ? 'open' : ''}" data-keep="dt"><button class="det-x" data-act="close">← Partidos</button>${inner}</section>`;
    if (!e) return cab(`<div class="d-meta"><span class="d-sp"><img src="${SP.r[1]}" alt="">Fórmula 1</span></div><h2 class="f1-t" data-notr>${esc(m.a)}</h2><p class="hint f1-load">Cargando el Gran Premio…</p>`);
    const d = e.d, esC = kind === 'wdc' || kind === 'wcc', lbl = SESION[kind]?.[0] || '';
    const cc = g(() => (m.la || '').match(/\/w\d+\/([a-z]{2})\.png/)?.[1], '') || '';
    let h = `<div class="d-meta"><span class="d-sp"><img src="${SP.r[1]}" alt="">Fórmula 1</span>${m.stage ? `<span class="f1-stg">${esc(m.stage)}</span>` : ''}</div>
      <div class="f1-gp">${bandera(cc, 'big')}<div><h2 class="f1-t" data-notr>${esc(m.a)}</h2>${esC ? '' : `<span class="f1-s">${lbl}</span>`}</div></div>`;
    h += `<div class="d-cd">${m.status === 'final' ? (kind === 'race' ? 'Carrera acabada' : kind === 'quali' ? 'Clasificación acabada' : kind === 'sprint' ? 'Sprint acabado' : 'Campeonato decidido') : m.status === 'canceled' ? 'Anulada: se devuelve todo' : open ? `${hoy(m.at)} · empieza en ${CD(m.at)}` : 'En juego: a la espera del resultado oficial'}${m.venue && !esC ? '' : ''}</div>`;
    if (!esC) h += sesiones(m, d);
    // mercados
    const mine = mias(m), mk = e.mk;
    const code = PRINCIPAL[kind];
    if (m.status === 'canceled') h += '';
    else if (m.status === 'final' && d.res) {
      h += listaResultado(d, d.res, esC ? 'Clasificación final' : kind === 'quali' ? 'Orden de salida' : 'Resultado', kind === 'race');
    } else if (open) {
      if (!Object.keys(mk).length && kind !== 'race') h += `<p class="hint f1-vacio">Todavía no hay cuotas para esta sesión. Salen solas en unos minutos.</p>`;
      else {
        if (kind === 'race') {
          const tab = V.mk[m.id] && TABS.some((t) => t[0] === V.mk[m.id]) ? V.mk[m.id] : 'FW';
          if (!Object.keys(mk).length && tab !== 'DU') h += `<p class="hint f1-vacio">Todavía no hay cuotas para esta sesión. Salen solas en unos minutos.</p>`;
          h += `<div class="f1-top"><span class="lab">Apuestas</span></div><nav class="nb-tabs f1-tabs">${TABS.map(([k, n]) => `<button type="button" class="nb-tab ${tab === k ? 'on' : ''}" data-f1tab="${k}">${n}</button>`).join('')}</nav>`;
          if (tab === 'DU') h += `<div class="f1-duelos">${duelos(m, d)}</div>`;
          else h += `<p class="hint f1-ay">${AYUDA[tab]}</p><div class="f1-lista ${hayGrid(d) ? '' : 'sg'}">${Object.keys(mk).length ? listaMercado(m, d, tab, mine) : ''}</div>`;
        } else if (code) h += `<div class="f1-top"><span class="lab">Apuestas</span></div><p class="hint f1-ay">${AYUDA[code]}</p><div class="f1-lista ${hayGrid(d) ? '' : 'sg'}">${listaMercado(m, d, code, mine)}</div>`;
      }
      if (kind === 'race') h += parrilla(d);
      h += `<p class="hint f1-src">Cuotas calculadas con la forma de la temporada, el historial del circuito y la parrilla · se congelan al apostar</p>`;
    } else if (kind === 'race' && d.grid) h += parrilla(d);
    // el resto de la ficha: lo que ya hay en cualquier partido
    const mineHere = g(() => myBetsOn(m.id), []);
    if (mineHere.length) h += `<div class="d-mine"><span class="lab">Tus apuestas aquí</span>${mineHere.map((b) => `<div class="dm" data-bet="${b.id}"><strong data-notr>${esc(pn(m, b.p))} <em>${O(b.o)}</em></strong><span>${N(b.stake)} → <b>${N(b.stake * b.o)}${coin()}</b></span><button class="x-share" data-share="${b.id}">Al chat</button>${cancelBtn(b)}</div>`).join('')}</div>`;
    if (!esC && d.circ) { h += circuito(m, d); cargaCirc(d.circ.id) }
    if (esC) h += `<p class="hint f1-src">Las cuotas del campeonato se recalculan después de cada carrera con los puntos de hoy y las carreras que quedan · se cierran cuando empieza la última carrera</p>`;
    const ws = g(() => whoOn(m.id), []);
    h += `<div class="d-fr"><span class="lab">Amigos en este partido</span>${[...F].sort((a, b) => (b.me - a.me)).map((f) => {
      const x = ws.filter((y) => y.f === f.id);
      const st = !x.length ? `<span class="st">aún no ha apostado</span>` : x.map((y) => (y.p ? `<span class="st rev" data-notr>${esc(pn(m, y.p))} ${O(y.o)} · ${N(y.stake)}${coin()}</span>` : `<span class="st">${LOCK}${N(y.stake)} · se ve a las ${HM(m.at)}</span>`)).join(' ');
      return `<div class="ifr">${av(f.id)}<span class="nm">${esc(f.n)}</span>${st}</div>` }).join('')}</div>`;
    return cab(h);
  }

  /* ---------- eventos ---------- */
  document.addEventListener('click', (ev) => {
    const t = ev.target.closest && ev.target.closest('[data-f1tab],[data-f1r]'); if (!t) return;
    if (t.dataset.f1tab) { const m = g(() => byId(S.foc), null); if (m) { V.mk[m.id] = t.dataset.f1tab; ev.stopPropagation(); g(() => render()) } }
    else if (t.dataset.f1r) { delete V.circ[t.dataset.f1r]; ev.stopPropagation(); cargaCirc(t.dataset.f1r); const el = document.querySelector(`.f1-circ[data-c="${t.dataset.f1r}"]`); if (el) { const m = g(() => byId(S.foc), null), e = m && dat(m.id); if (e) el.outerHTML = circuito(m, e.d) } }
  }, true);
  // en los duelos, "Ver ficha" del piloto abre su ficha (no la del equipo de ESPN)
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest && ev.target.closest('[data-side]'); if (!b) return;
    const m = g(() => byId(S.foc), null); if (!m || m.s !== 'r' || m.fk !== 'duel') return;
    const e = dat(m.id), ids = Object.keys(e?.d?.dr || {}); const id = ids[b.dataset.side === 'a' ? 0 : 1]; if (!id || !window.GM_F1?.abre) return;
    ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation(); GM_F1.abre({ t: 'p', id });
  }, true);
  setInterval(() => { if (!document.hidden && g(() => loaded, false) && g(() => M.some((m) => m.s === 'r'), false)) carga() }, 90e3);
  window.addEventListener('gm:f1', () => { try { pintaCab() } catch {} });

  window.GM_F1 = { es: esGP, kind: (m) => m?.fk || '', cuotasFila, ficha, cabeza, carga: () => carga(true), dat, datos: () => D, nomP, nomE, colorE, fotoP, caraP, bandera, flagUrl, iso, ini, norm, bonito, apellido, espn, espnData: ESPN, idPorNombre, idEqPorNombre, fotoDeNombre,
    cuota: (m, p) => dat(m.id)?.mk?.[p] ?? null, LONG, NAC, COLOR };
})();
