// Fichas de la Formula 1 (PM, 01-11: "registro de otros años de corredores, etc., todo bien hecho"): ficha de piloto, ficha de
// escuderia y clasificaciones del campeonato, con la historia entera desde 1950. Todo se pide DIRECTO desde el navegador a Jolpica
// (la continuacion de Ergast, gratis y sin clave, https://api.jolpi.ca/ergast/f1/) con cache en memoria y en sessionStorage, y sin
// depender del sincronizador ni de la base: si el sincronizador aun no ha traido los Grandes Premios, las fichas funcionan igual.
// Jolpica limita el ritmo (rafagas de unas 4 por segundo, unas 500 por hora): una sola cola con 300 ms entre peticiones y reintento
// con espera si responde 429. Cada ficha se pinta por trozos a medida que llega cada dato. Nunca toca dinero: solo se mira.
// Se abren con GM_F1.abre({ t: 'p', id }) piloto, { t: 'e', id } escuderia, { t: 'c' } clasificaciones, y al tocar cualquier nombre
// con data-f1d (piloto) o data-f1e (escuderia). Sin dependencias del resto de la app salvo f1.js.
'use strict';
(function () {
  const F = window.GM_F1; if (!F || F.abre) return;
  const g = (f, d) => { try { const v = f(); return v === undefined ? d : v } catch { return d } };
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const en = () => document.documentElement.lang === 'en';
  const nf = (x) => (x == null || !isFinite(x) ? '·' : String(Math.round(x * 10) / 10).replace(/\B(?=(\d{3})+(?!\d))/g, en() ? ',' : '.').replace(/\.(\d)$/, en() ? '.$1' : ',$1'));
  const BASE = 'https://api.jolpi.ca/ergast/f1';

  /* ---------- Jolpica: una cola, cache y reintentos ---------- */
  const MEM = new Map(), VUELO = new Map(), JOBS = [];
  let ULT = 0, corre = false;
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  let caida = 0;   // cuando fallo la red por ultima vez: durante 20 s las demas peticiones fallan al instante (la ficha ensena el error y "Reintentar" en vez de esperar una por una)
  async function pide(path) {
    if (Date.now() - caida < 20e3) return null;
    for (let i = 0; i < 4; i++) {
      const w = 300 - (Date.now() - ULT); if (w > 0) await dormir(w);
      ULT = Date.now();
      try {
        const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 12000);
        const r = await fetch(BASE + path, { signal: ctl.signal }); clearTimeout(to);
        caida = 0;
        if (r.ok) return await r.json();
        if (r.status === 429) { const ra = Number(r.headers.get('retry-after')); await dormir(Math.min(20000, ra ? ra * 1000 : 3000 * 2 ** i)); continue }
        if (r.status < 500) return null;
      } catch { if (i >= 1) { caida = Date.now(); return null } }
      await dormir(900 * (i + 1));
    }
    return null;
  }
  // una sola cola: sale primero lo de la ficha que se abrio la ultima (seq mayor); dentro de una ficha, por orden. Asi al abrir otra ficha no espera a la anterior
  async function bomba() {
    if (corre) return; corre = true;
    while (JOBS.length) { let k = 0; for (let i = 1; i < JOBS.length; i++) if (JOBS[i].seq > JOBS[k].seq) k = i; const j = JOBS.splice(k, 1)[0]; j.res(await pide(j.path)) }
    corre = false;
  }
  // devuelve el json de Jolpica o null (sin red, 4xx). ttl en ms; seq: la ficha que lo pide
  function jl(path, ttl = 6 * 3600e3, seq = 0) {
    const c = MEM.get(path); if (c && Date.now() - c.t < ttl) return Promise.resolve(c.v);
    try { const s = sessionStorage.getItem('gm-f1j:' + path); if (s) { const o = JSON.parse(s); if (Date.now() - o.t < ttl) { MEM.set(path, o); return Promise.resolve(o.v) } } } catch {}
    if (VUELO.has(path)) { const j = JOBS.find((x) => x.path === path); if (j && seq > j.seq) j.seq = seq; return VUELO.get(path) }
    const p = new Promise((res) => { JOBS.push({ path, seq, res }); bomba() }).then((v) => {
      VUELO.delete(path);
      if (v) { const o = { t: Date.now(), v }; MEM.set(path, o); try { const t = JSON.stringify(o); if (t.length < 250e3) sessionStorage.setItem('gm-f1j:' + path, t) } catch {} }
      return v;
    });
    VUELO.set(path, p);
    return p;
  }
  F.jl = jl;
  const total = (j) => Number(j?.MRData?.total) || 0;
  const lists = (j) => g(() => j.MRData.StandingsTable.StandingsLists, []) || [];
  const races = (j) => g(() => j.MRData.RaceTable.Races, []) || [];
  const YA = new Date().getUTCFullYear();

  /* ---------- Grandes Premios en español ---------- */
  const GPES = { 'Australian': 'Australia', 'Chinese': 'China', 'Japanese': 'Japón', 'Bahrain': 'Baréin', 'Saudi Arabian': 'Arabia Saudí', 'Miami': 'Miami', 'Emilia Romagna': 'Emilia Romaña', 'Monaco': 'Mónaco', 'Canadian': 'Canadá',
    'Spanish': 'España', 'Barcelona': 'Barcelona', 'Austrian': 'Austria', 'British': 'Gran Bretaña', 'Hungarian': 'Hungría', 'Belgian': 'Bélgica', 'Dutch': 'Países Bajos', 'Italian': 'Italia', 'Azerbaijan': 'Azerbaiyán',
    'Singapore': 'Singapur', 'United States': 'Estados Unidos', 'Mexico City': 'México', 'Mexican': 'México', 'São Paulo': 'São Paulo', 'Sao Paulo': 'São Paulo', 'Brazilian': 'Brasil', 'Las Vegas': 'Las Vegas', 'Qatar': 'Catar',
    'Abu Dhabi': 'Abu Dabi', 'French': 'Francia', 'German': 'Alemania', 'Portuguese': 'Portugal', 'Turkish': 'Turquía', 'Russian': 'Rusia', 'Malaysian': 'Malasia', 'Argentine': 'Argentina', 'Swiss': 'Suiza', 'Swedish': 'Suecia',
    'South African': 'Sudáfrica', 'Moroccan': 'Marruecos', 'Pacific': 'del Pacífico', 'European': 'Europa', 'Indian': 'India', 'Korean': 'Corea', 'Styrian': 'Estiria', 'Eifel': 'Eifel', 'Tuscan': 'la Toscana', 'Sakhir': 'Sakhir',
    '70th Anniversary': 'del 70 Aniversario', 'Luxembourg': 'Luxemburgo', 'San Marino': 'San Marino', 'Caesars Palace': 'Caesars Palace', 'Indianapolis 500': 'Indianápolis 500', 'Madrid': 'Madrid', 'Detroit': 'Detroit', 'Dallas': 'Dallas', 'Pescara': 'Pescara' };
  const gpNombre = (n) => { const s = String(n || ''); const m = /^(.+) Grand Prix$/.exec(s); if (!m) return s; return sg(en() ? s : `Gran Premio de ${GPES[m[1]] || m[1]}`.replace('de del', 'del')) };

  /* ---------- pagina ---------- */
  const ST = { pila: [], el: null, tick: 0 };
  const sg = F.sg, quien = (j) => sg(`${j?.givenName || ''} ${j?.familyName || ''}`);
  const edad = (dob) => { const t = Date.parse(dob); if (!t) return ''; const d = new Date(t), n = new Date(); let a = n.getFullYear() - d.getFullYear(); if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a--; return a };
  const fecha = (dob) => { const t = Date.parse(dob + 'T12:00:00Z'); return t ? new Intl.DateTimeFormat(en() ? 'en-GB' : 'es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(t) : '' };
  const pais = (cc) => g(() => new Intl.DisplayNames([en() ? 'en' : 'es'], { type: 'region' }).of(cc.toUpperCase()), '') || cc;
  const colorEq = (id) => F.colorE(id);
  function ficha(x) { return x }
  // undefined = todavia cargando (esqueleto); null = no se pudo (un punto)
  const kpi = (v, l) => `<div class="f1k"><b>${v === undefined ? '<i class="f1-sk"></i>' : v === null ? '·' : esc(v)}</b><span>${l}</span></div>`;
  const cargando = '<p class="hint f1-load">Cargando…</p>';
  const fallo = (k) => `<p class="hint">No se ha podido cargar este dato: Jolpica no responde ahora. <button type="button" class="f1-link" data-f1x="re">Reintentar</button></p>`;
  const pagin = (n, por, pag, k) => { const tp = Math.ceil(n / por); if (tp <= 1) return ''; const b = (i, t, on) => `<button type="button" class="f1-pg ${on ? 'on' : ''}" data-f1pg="${k}|${i}" ${i < 0 || i >= tp ? 'disabled' : ''}>${t}</button>`;
    const ps = []; for (let i = 0; i < tp; i++) if (i === 0 || i === tp - 1 || Math.abs(i - pag) <= 1) ps.push(i); const out = []; ps.forEach((i, j) => { if (j && i - ps[j - 1] > 1) out.push('<span class="f1-pe">…</span>'); out.push(b(i, i + 1, i === pag)) });
    return `<nav class="f1-pgs">${b(pag - 1, '‹')}${out.join('')}${b(pag + 1, '›')}</nav>` };

  /* ----- ficha de piloto ----- */
  function pPiloto(p) {
    const D = p.d || (p.d = {});
    const info = D.info, seas = D.seas, S2 = D.sea2;
    const nom = quien(info) || F.bonito(p.id), cc = F.iso(info?.nationality), numero = info?.permanentNumber;
    const ult = seas?.length ? seas[seas.length - 1] : null, eq = ult?.eq?.[ult.eq.length - 1];
    const e = F.datos ? [...F.datos().values()].find((x) => x.d?.dr?.[p.id]) : null;
    const tm = e?.d?.tm?.[p.id] || eq?.id, ph = e ? F.fotoP(e.d, p.id) : F.fotoDeNombre(nom);
    const col = colorEq(tm);
    let h = `<header class="f1-pf" style="--c:${col}"><span class="f1-big" style="--c:${col}">${ph ? `<img src="${esc(ph)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}<i>${esc(F.ini(nom))}</i></span>
      <div class="f1-pi"><span class="lab">Piloto de Fórmula 1</span><h2 data-notr>${esc(nom)}</h2><div class="f1-ps">${numero ? `<b class="f1-num">${esc(numero)}</b>` : ''}${cc ? F.bandera(cc) : ''}<span data-notr>${esc(cc ? pais(cc) : info?.nationality || '')}</span>${info?.dateOfBirth ? `<span class="f1-d" data-notr>${esc(fecha(info.dateOfBirth))}</span><span>${edad(info.dateOfBirth)} años</span>` : ''}</div>
      ${eq ? `<button type="button" class="f1-eqb" data-f1e="${esc(eq.id)}" style="--c:${colorEq(eq.id)}"><i></i><b data-notr>${esc(eq.n)}</b><small>${ult.y === YA || ult.y === YA - 1 ? 'Escudería actual' : 'Su última escudería'}</small></button>` : ''}</div></header>`;
    // numeros de siempre
    const k = D.k || {}, falla = !!(D.err && D.err.seas), titulos = seas ? seas.filter((s) => s.pos === 1 && s.fin).length : falla ? null : undefined, pts = seas ? seas.reduce((a, s) => a + s.pts, 0) : falla ? null : undefined;
    const podios = k.p1 === undefined || k.p2 === undefined || k.p3 === undefined ? undefined : k.p1 == null || k.p2 == null || k.p3 == null ? null : k.p1 + k.p2 + k.p3;
    const kvl = (l, v) => `<div><span>${l}</span><b ${v ? 'data-notr' : ''}>${v === undefined ? '<i class="f1-sk"></i>' : v === null ? '·' : esc(v)}</b></div>`;
    h += `<div class="f1ks">${kpi(titulos, 'Títulos')}${kpi(k.p1, 'Victorias')}${kpi(podios, 'Podios')}${kpi(k.pole, 'Poles')}${kpi(k.fl, 'Vueltas rápidas')}${kpi(k.n, 'Carreras')}</div>
      <div class="f1kv">${kvl('Puntos', pts == null ? pts : nf(pts))}${kvl('Primera carrera', k.first)}${kvl('Última carrera', k.last)}</div>`;
    if (seas && seas[0] && seas[0].y < 2004) h += `<p class="hint f1-nota">Las vueltas rápidas solo constan desde 2004.</p>`;
    // temporada por temporada
    h += `<section class="f1-sc"><div class="f1-sh"><h3>Temporada por temporada</h3>${seas ? `<span class="f1-or">${[['y', 'Año'], ['p', 'Puesto'], ['s', 'Puntos']].map(([o, t]) => `<button type="button" class="${(p.ord || 'y') === o ? 'on' : ''}" data-f1o="${o}">${t}</button>`).join('')}</span>` : ''}</div>`;
    if (D.err?.seas) h += fallo(); else if (!seas) h += cargando; else {
      const o = p.ord || 'y', arr = seas.slice().sort(o === 'y' ? (a, b) => b.y - a.y : o === 'p' ? (a, b) => a.pos - b.pos || b.y - a.y : (a, b) => b.pts - a.pts || b.y - a.y), por = 10, pag = Math.min(p.pag || 0, Math.max(0, Math.ceil(arr.length / por) - 1));
      h += `<div class="f1-tb"><div class="f1-th"><span>Año</span><span>Puesto</span><span>Puntos</span><span>Victorias</span><span>Escudería</span></div>${arr.slice(pag * por, pag * por + por).map((s) => `<div class="f1-tr ${s.pos === 1 && s.fin ? 'ti' : ''}"><span class="n">${s.y}</span><span class="n">${s.pos === 1 && s.fin ? '<b class="f1-ti">1º</b>' : s.pos ? s.pos + 'º' : '·'}</span><span class="n">${nf(s.pts)}</span><span class="n">${s.w}</span><span class="f1-le">${s.eq.map((q) => `<button type="button" class="f1-lk" data-f1e="${esc(q.id)}" data-notr>${esc(q.n)}</button>`).join(' · ')}</span></div>`).join('')}</div>${pagin(arr.length, por, pag, 'p')}`;
    }
    h += '</section>';
    // la temporada de hoy
    const yy = D.yr || YA;
    h += `<section class="f1-sc"><div class="f1-sh"><h3>Esta temporada, carrera a carrera</h3><span class="lab" data-notr>${yy}</span></div>`;
    if (D.err?.sea2) h += fallo(); else if (!S2) h += cargando; else if (!S2.length) h += `<p class="hint">Este piloto no ha corrido esta temporada.</p>`;
    else h += `<div class="f1-tb"><div class="f1-th f1-th2"><span>Ronda</span><span>Gran Premio</span><span>Salida</span><span>Llegada</span><span>Puntos</span></div>${S2.map((r) => `<div class="f1-tr f1-tr2"><span class="n">${r.r}</span><span class="f1-le" data-notr>${esc(gpNombre(r.n))}</span><span class="n">${r.grid ? r.grid + 'º' : 'Pit'}</span><span class="n ${r.pos === 1 ? 'w' : ''}">${/^\d+$/.test(r.pt) ? r.pt + 'º' : esc(r.st)}</span><span class="n">${nf(r.pts)}</span></div>`).join('')}</div>`;
    return h + '</section>';
  }
  function cargaPiloto(p) {
    const D = p.d = p.d || {}; if (D.cargado) return; D.cargado = true; const id = p.id;
    const sub = async (fn, ...a) => { try { return await fn(...a) } catch { return null } };
    const re = () => { if (ST.pila.includes(p)) pinta() };
    jl(`/drivers/${id}.json`, 7 * 864e5, p.seq).then((j) => { D.info = j?.MRData?.DriverTable?.Drivers?.[0] || {}; re() });
    jl(`/drivers/${id}/driverStandings.json?limit=100`, 12 * 3600e3, p.seq).then((j) => {
      if (!j) { D.err = { ...D.err, seas: 1 }; return re() }
      const fin = (y) => y < YA || (y === YA && new Date().getUTCMonth() === 11 && new Date().getUTCDate() > 15);
      D.seas = lists(j).map((l) => { const s = l.DriverStandings?.[0] || {}; return { y: +l.season, pos: +s.position || 0, pts: +s.points || 0, w: +s.wins || 0, eq: (s.Constructors || []).map((c) => ({ id: c.constructorId, n: sg(c.name) })), fin: fin(+l.season) } }).sort((a, b) => a.y - b.y);
      re();
    });
    const k = D.k = D.k || {};
    const tot = (key, path) => jl(path, 12 * 3600e3, p.seq).then((j) => { k[key] = j ? total(j) : null; re(); return j });
    tot('p1', `/drivers/${id}/results/1.json?limit=1`); tot('p2', `/drivers/${id}/results/2.json?limit=1`); tot('p3', `/drivers/${id}/results/3.json?limit=1`);
    tot('pole', `/drivers/${id}/grid/1/results.json?limit=1`); tot('fl', `/drivers/${id}/fastest/1/results.json?limit=1`);
    tot('n', `/drivers/${id}/results.json?limit=1`).then(async (j) => {
      const n = j ? total(j) : 0; if (!n) { k.first = null; k.last = null; return re() }
      const a = races(j)[0]; if (a) k.first = `${a.season} · ${gpNombre(a.raceName)}`;
      const l = await jl(`/drivers/${id}/results.json?limit=1&offset=${n - 1}`, 12 * 3600e3, p.seq); const b = races(l)[0]; if (b) k.last = `${b.season} · ${gpNombre(b.raceName)}`; re();
    });
    // la temporada de hoy (o la ultima con carreras)
    (async () => {
      let y = YA, j = await jl(`/${y}/drivers/${id}/results.json?limit=100`, 20 * 60e3, p.seq);
      if (j && !races(j).length) { y = YA - 1; j = await jl(`/${y}/drivers/${id}/results.json?limit=100`, 12 * 3600e3, p.seq) }
      D.yr = y;
      if (!j) { D.err = { ...D.err, sea2: 1 }; return re() }
      D.sea2 = races(j).map((r) => { const x = r.Results?.[0] || {}; return { r: +r.round, n: r.raceName, grid: +x.grid || 0, pos: +x.position || 0, pt: x.positionText || '', st: x.status || '', pts: +x.points || 0 } }); re();
    })();
  }

  /* ----- ficha de escuderia ----- */
  function pEquipo(p) {
    const D = p.d || (p.d = {}), info = D.info, seas = D.seas, k = D.k || {};
    const col = colorEq(p.id), nom = sg(info?.name) || F.nomE(null, p.id), cc = F.iso(info?.nationality);
    let h = `<header class="f1-pf" style="--c:${col}"><span class="f1-big f1-bigeq" style="--c:${col}"><i>${esc(F.ini(nom))}</i></span><div class="f1-pi"><span class="lab">Escudería de Fórmula 1</span><h2 data-notr>${esc(nom)}</h2>
      <div class="f1-ps">${cc ? F.bandera(cc) : ''}<span data-notr>${esc(cc ? pais(cc) : info?.nationality || '')}</span>${seas && seas.length ? `<span class="f1-d" data-notr>${seas[0].y} ${en() ? 'to' : 'a'} ${seas[seas.length - 1].y}</span>` : ''}</div></div></header>`;
    const falla = !!(D.err && D.err.seas), titulos = seas ? seas.filter((s) => s.pos === 1 && s.fin) : null, pts = seas ? seas.reduce((a, s) => a + s.pts, 0) : falla ? null : undefined;
    const podios = k.p1 === undefined || k.p2 === undefined || k.p3 === undefined ? undefined : k.p1 == null || k.p2 == null || k.p3 == null ? null : k.p1 + k.p2 + k.p3;
    h += `<div class="f1ks">${kpi(titulos ? titulos.length : falla ? null : undefined, 'Títulos de constructores')}${kpi(k.p1, 'Victorias')}${kpi(podios, 'Podios')}${kpi(k.pole, 'Poles')}${kpi(seas ? seas.length : falla ? null : undefined, 'Temporadas')}${kpi(pts == null ? pts : nf(pts), 'Puntos')}</div>`;
    if (titulos && titulos.length) h += `<section class="f1-sc"><div class="f1-sh"><h3>Títulos de constructores</h3></div><p class="f1-ye" data-notr>${titulos.map((s) => s.y).join(' · ')}</p></section>`;
    // pilotos
    h += `<section class="f1-sc"><div class="f1-sh"><h3>Pilotos de esta temporada</h3><span class="lab" data-notr>${D.yr || YA}</span></div>`;
    if (D.err?.act) h += fallo(); else if (!D.act) h += cargando; else if (!D.act.length) h += `<p class="hint">No hay pilotos esta temporada.</p>`;
    else h += `<div class="f1-pl">${D.act.map((d) => `<button type="button" class="f1-pc2" data-f1d="${esc(d.id)}">${F.caraP({ ph: {}, tm: { [d.id]: p.id } }, d.id, 'sm')}<b data-notr>${esc(d.n)}</b><small>${F.bandera(F.iso(d.nat))}</small></button>`).join('')}</div>`;
    h += `</section><section class="f1-sc"><div class="f1-sh"><h3>Pilotos de siempre</h3>${D.his ? `<span class="lab">${D.his.n}</span>` : ''}</div>`;
    if (D.err?.his) h += fallo(); else if (!D.his) h += cargando; else {
      const por = 16, pag = Math.min(p.pagh || 0, Math.max(0, Math.ceil(D.his.l.length / por) - 1));
      h += `<div class="f1-pl f1-hist">${D.his.l.slice(pag * por, pag * por + por).map((d) => `<button type="button" class="f1-pc2" data-f1d="${esc(d.id)}"><b data-notr>${esc(d.n)}</b><small>${F.bandera(F.iso(d.nat))}</small></button>`).join('')}</div>${pagin(D.his.l.length, por, pag, 'h')}`;
    }
    h += '</section>';
    h += `<section class="f1-sc"><div class="f1-sh"><h3>Temporada por temporada</h3></div>`;
    if (D.err?.seas) h += fallo(); else if (!seas) h += cargando; else {
      const arr = seas.slice().sort((a, b) => b.y - a.y), por = 10, pag = Math.min(p.pag || 0, Math.max(0, Math.ceil(arr.length / por) - 1));
      h += `<div class="f1-tb f1-tbe"><div class="f1-th f1-the"><span>Año</span><span>Puesto</span><span>Puntos</span><span>Victorias</span></div>${arr.slice(pag * por, pag * por + por).map((s) => `<div class="f1-tr f1-tre ${s.pos === 1 && s.fin ? 'ti' : ''}"><span class="n">${s.y}</span><span class="n">${s.pos === 1 && s.fin ? '<b class="f1-ti">1º</b>' : s.pos ? s.pos + 'º' : '·'}</span><span class="n">${nf(s.pts)}</span><span class="n">${s.w}</span></div>`).join('')}</div>${pagin(arr.length, por, pag, 'p')}`;
    }
    return h + '</section>';
  }
  function cargaEquipo(p) {
    const D = p.d = p.d || {}; if (D.cargado) return; D.cargado = true; const id = p.id, k = D.k = {};
    const re = () => { if (ST.pila.includes(p)) pinta() };
    jl(`/constructors/${id}.json`, 7 * 864e5, p.seq).then((j) => { D.info = j?.MRData?.ConstructorTable?.Constructors?.[0] || {}; re() });
    jl(`/constructors/${id}/constructorStandings.json?limit=100`, 12 * 3600e3, p.seq).then((j) => {
      if (!j) { D.err = { ...D.err, seas: 1 }; return re() }
      const fin = (y) => y < YA || (y === YA && new Date().getUTCMonth() === 11 && new Date().getUTCDate() > 15);
      D.seas = lists(j).map((l) => { const s = l.ConstructorStandings?.[0] || {}; return { y: +l.season, pos: +s.position || 0, pts: +s.points || 0, w: +s.wins || 0, fin: fin(+l.season) } }).sort((a, b) => a.y - b.y); re();
    });
    for (const [key, path] of [['p1', 'results/1'], ['p2', 'results/2'], ['p3', 'results/3'], ['pole', 'grid/1/results']]) jl(`/constructors/${id}/${path}.json?limit=1`, 12 * 3600e3, p.seq).then((j) => { k[key] = j ? total(j) : null; re() });
    (async () => {
      let y = YA, j = await jl(`/${y}/constructors/${id}/drivers.json?limit=100`, 3600e3, p.seq);
      if (j && !(j.MRData?.DriverTable?.Drivers || []).length) { y = YA - 1; j = await jl(`/${y}/constructors/${id}/drivers.json?limit=100`, 12 * 3600e3, p.seq) }
      D.yr = y; if (!j) { D.err = { ...D.err, act: 1 }; return re() }
      D.act = (j.MRData.DriverTable.Drivers || []).map((d) => ({ id: d.driverId, n: quien(d), nat: d.nationality })); re();
    })();
    (async () => {
      const j = await jl(`/constructors/${id}/drivers.json?limit=100`, 12 * 3600e3, p.seq); if (!j) { D.err = { ...D.err, his: 1 }; return re() }
      let l = j.MRData.DriverTable.Drivers || []; const n = total(j);
      for (let off = 100; off < Math.min(n, 400); off += 100) { const j2 = await jl(`/constructors/${id}/drivers.json?limit=100&offset=${off}`, 12 * 3600e3, p.seq); l = l.concat(j2?.MRData?.DriverTable?.Drivers || []) }
      D.his = { n, l: l.map((d) => ({ id: d.driverId, n: quien(d), nat: d.nationality })) }; re();
    })();
  }

  /* ----- clasificaciones ----- */
  function pClasif(p) {
    const D = p.d || (p.d = {}); p.tab = p.tab || 'p'; p.y = p.y || YA;
    const key = `${p.tab}:${p.y}`, L = D[key], anos = [];
    for (let y = YA; y >= (p.tab === 'p' ? 1950 : 1958); y--) anos.push(y);
    let h = `<header class="f1-pf f1-pfc"><div class="f1-pi"><span class="lab">Fórmula 1</span><h2>Clasificaciones del campeonato</h2></div></header>
      <div class="f1-cl-bar"><nav class="nb-tabs f1-tabs">${[['p', 'Pilotos'], ['c', 'Constructores']].map(([k, t]) => `<button type="button" class="nb-tab ${p.tab === k ? 'on' : ''}" data-f1ct="${k}">${t}</button>`).join('')}</nav>
      <label class="f1-sel"><span class="lab">Temporada</span><select data-f1y>${anos.map((y) => `<option value="${y}" ${y === p.y ? 'selected' : ''}>${y}</option>`).join('')}</select></label></div>`;
    if (L === 'err') return h + fallo();
    if (!L) return h + cargando;
    if (!L.rows.length) return h + `<p class="hint">No hay clasificación de esa temporada.</p>`;
    h += `<p class="hint">Tras ${L.round} ${L.round === 1 ? 'carrera' : 'carreras'}</p>`;
    h += `<div class="f1-tb f1-tbc"><div class="f1-th f1-thc"><span>Pos</span><span>${p.tab === 'p' ? 'Piloto' : 'Escudería'}</span><span>Victorias</span><span>Puntos</span></div>${L.rows.map((r) => `<div class="f1-tr f1-trc ${r.pos === 1 ? 'ti' : ''}"><span class="n">${r.pos || '·'}</span>
      <button type="button" class="f1-lk f1-lkc" ${p.tab === 'p' ? `data-f1d="${esc(r.id)}"` : `data-f1e="${esc(r.id)}"`}>${p.tab === 'p' ? F.bandera(F.iso(r.nat)) : `<i class="f1-dot" style="--c:${colorEq(r.id)}"></i>`}<b data-notr>${esc(r.n)}</b>${p.tab === 'p' && r.eq ? `<small data-notr>${esc(r.eq)}</small>` : ''}</button><span class="n">${r.w}</span><span class="n">${nf(r.pts)}</span></div>`).join('')}</div>`;
    return h;
  }
  function cargaClasif(p) {
    const D = p.d = p.d || {}, key = `${p.tab}:${p.y}`; if (D[key]) return;
    D[key] = null; const tab = p.tab, y = p.y;
    jl(`/${y}/${tab === 'p' ? 'driverStandings' : 'constructorStandings'}.json?limit=100`, y === YA ? 15 * 60e3 : 24 * 3600e3, p.seq).then((j) => {
      if (!j) { D[key] = 'err'; return pintaSi(p) }
      const l = lists(j)[0]; if (!l) { D[key] = { rows: [], round: 0 }; return pintaSi(p) }
      D[key] = { round: +l.round || 0, rows: (tab === 'p' ? l.DriverStandings : l.ConstructorStandings || []).map((r) => tab === 'p'
        ? { pos: +r.position || 0, id: r.Driver.driverId, n: quien(r.Driver), nat: r.Driver.nationality, w: +r.wins || 0, pts: +r.points || 0, eq: (r.Constructors || []).map((c) => sg(c.name)).join(' · ') }
        : { pos: +r.position || 0, id: r.Constructor.constructorId, n: sg(r.Constructor.name), nat: r.Constructor.nationality, w: +r.wins || 0, pts: +r.points || 0 }) };
      pintaSi(p);
    });
  }
  const pintaSi = (p) => { if (ST.pila[ST.pila.length - 1] === p) pinta() };

  /* ---------- el panel ---------- */
  const TIT = { p: 'Ficha del piloto', e: 'Ficha de la escudería', c: 'Clasificaciones' };
  function pinta() {
    if (!ST.el) return; const p = ST.pila[ST.pila.length - 1]; if (!p) return;
    const cuerpo = ST.el.querySelector('.f1p-body'); const top = cuerpo.scrollTop;
    let h = p.t === 'p' ? pPiloto(p) : p.t === 'e' ? pEquipo(p) : pClasif(p);
    const sig = `${ST.pila.length}|${h}|${document.documentElement.lang}`;
    if (ST.sig === sig) return; ST.sig = sig;
    ST.el.querySelector('.f1p-ttl').textContent = TIT[p.t];
    ST.el.querySelector('[data-f1x="atras"]').hidden = ST.pila.length < 2;
    cuerpo.innerHTML = h; if (window.GM_LANG) GM_LANG.traduce(ST.el);
    cuerpo.scrollTop = top;
  }
  function abre(p) {
    if (!p || !p.t) return;
    if (!ST.el) {
      const el = document.createElement('div'); el.id = 'f1p'; el.className = 'f1p'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
      el.innerHTML = `<div class="f1p-bg" data-f1x="cierra"></div><aside class="f1p-box"><header class="f1p-top"><button type="button" class="f1p-b" data-f1x="atras" hidden aria-label="Atrás">←</button><span class="lab f1p-ttl"></span><button type="button" class="f1p-b" data-f1x="cierra" aria-label="Cerrar">×</button></header><div class="f1p-body"></div></aside>`;
      document.body.appendChild(el); ST.el = el;
    }
    ST.el.classList.add('on'); document.documentElement.classList.add('f1p-abierto');
    const mismo = ST.pila.find((x) => x.t === p.t && x.id === p.id && (p.t !== 'c')); if (mismo) ST.pila.splice(ST.pila.indexOf(mismo), 1);
    const ya = p.t === 'c' ? ST.pila.find((x) => x.t === 'c') : null; if (ya) ST.pila.splice(ST.pila.indexOf(ya), 1);
    const nuevo = { t: p.t, id: p.id, seq: ++ST.tick, pag: 0, pagh: 0, ord: 'y', ...(p.t === 'c' ? { tab: p.tab || 'p', y: p.y || YA } : {}) }; ST.pila.push(nuevo); ST.sig = '';
    carga(nuevo); pinta(); ST.el.querySelector('.f1p-body').scrollTop = 0;
  }
  const carga = (p) => (p.t === 'p' ? cargaPiloto(p) : p.t === 'e' ? cargaEquipo(p) : cargaClasif(p));
  function cierra() { if (!ST.el) return; ST.el.classList.remove('on'); document.documentElement.classList.remove('f1p-abierto'); ST.pila = []; ST.sig = '' }
  function resuelveEq(el) { if (el.dataset.f1en) return F.idEqPorNombre(el.dataset.f1en); return el.dataset.f1e }
  document.addEventListener('click', (ev) => {
    const t = ev.target.closest && ev.target.closest('[data-f1d],[data-f1e],[data-f1n],[data-f1c],[data-f1x],[data-f1o],[data-f1pg],[data-f1ct]'); if (!t) return;
    if (t.closest('#boleto, .blt')) return;
    const top = ST.pila[ST.pila.length - 1], open = ST.el && ST.el.classList.contains('on');
    if (t.dataset.f1x && !open) return;
    ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
    if (t.dataset.f1x === 'cierra') return cierra();
    if (t.dataset.f1x === 'atras') { ST.pila.pop(); ST.sig = ''; return pinta() }
    if (t.dataset.f1x === 're' && top) { top.d = null; if (top.t === 'c') top.d = {}; carga(top); ST.sig = ''; return pinta() }
    if (t.dataset.f1d) return abre({ t: 'p', id: t.dataset.f1d });
    if (t.dataset.f1n) { const id = F.idPorNombre(t.dataset.f1n); return id ? abre({ t: 'p', id }) : abre({ t: 'c', tab: 'p' }) }
    if (t.dataset.f1e != null && !t.dataset.f1x) { const id = resuelveEq(t); return id ? abre({ t: 'e', id }) : abre({ t: 'c', tab: 'c' }) }
    if (t.dataset.f1c) return abre({ t: 'c', tab: 'p' });
    if (!top) return;
    if (t.dataset.f1o) { top.ord = t.dataset.f1o; top.pag = 0; return pinta() }
    if (t.dataset.f1pg) { const [k, i] = t.dataset.f1pg.split('|'); if (k === 'h') top.pagh = +i; else top.pag = +i; return pinta() }
    if (t.dataset.f1ct) { top.tab = t.dataset.f1ct; if (top.tab === 'c' && top.y < 1958) top.y = 1958; carga(top); return pinta() }
  }, true);
  document.addEventListener('change', (ev) => {
    const s = ev.target.closest && ev.target.closest('[data-f1y]'); if (!s) return;
    const top = ST.pila[ST.pila.length - 1]; if (!top) return; top.y = +s.value; carga(top); pinta();
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && ST.el && ST.el.classList.contains('on')) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation(); if (ST.pila.length > 1) { ST.pila.pop(); ST.sig = ''; pinta() } else cierra() } }, true);
  window.addEventListener('gm:f1', () => { if (ST.el && ST.el.classList.contains('on')) pinta() });

  F.abre = abre; F.cierra = cierra; F.gpNombre = gpNombre;
})();
