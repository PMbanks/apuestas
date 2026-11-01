// Formula 1 (PM, 01-11: "pondria F1 para apostar en Bets y que haga todo bien"). Todo de Jolpica (la continuacion de Ergast),
// gratis y sin clave: https://api.jolpi.ca/ergast/f1/ . Base de datos: db/052_f1.sql. La app: app/nueva/f1.js y f1fichas.js.
//
// QUE HACE EN CADA PASADA
//   1. Calendario de la temporada y, para los Grandes Premios de 4 dias atras a 16 dias adelante, una fila por sesion con apuestas:
//        f1-AAAA-RR-R carrera · f1-AAAA-RR-Q clasificacion · f1-AAAA-RR-S sprint (si lo hay)
//        f1-AAAA-RR-D-a-b duelo entre companeros (partido normal 1 / 2, el reto lo usa tal cual)
//        f1-AAAA-WDC y f1-AAAA-WCC campeonato de pilotos y de constructores (se cierran al empezar la ultima carrera)
//   2. Cuotas (matches.odds_mk) mientras la sesion no ha empezado, con el modelo de abajo.
//   3. Resultados oficiales de Jolpica cuando existen: details.res = { o: [ids por orden], st: {id: F|L|R|D|S}, fl: id } y el partido
//      pasa a final; sync_close (db) paga solo. Estados: F acaba, L acaba con vueltas de menos, R abandona, D descalificado, S no sale.
//   4. Un Gran Premio que Jolpica ya no trae en el calendario, o sin resultado 4 dias despues de la salida, se anula (sync_f1_anula)
//      y se devuelve todo.
//
// MODELO DE CUOTAS (no hay fuente gratuita y sin clave de cuotas reales de F1: ESPN no las da en F1 y The Odds API pide clave)
//   Cada piloto tiene una fuerza s = 3,0 * ln(puntos por carrera + 1,5), donde los puntos por carrera mezclan, segun cuantas
//   carreras van: la media de la temporada (55 %) y de las ultimas 3 carreras (45 %) con la temporada pasada (cuando van pocas);
//   si hay historial de ese circuito (ultimas 3 ediciones, el doble de peso si fue con la misma escuderia) pesa un 15 %.
//   Con la parrilla ya conocida (despues de la clasificacion) se suma 0,8 * (-ln(puesto de salida)). La carrera se simula 30.000
//   veces: orden de llegada = fuerza + ruido de Gumbel (que es exactamente una carrera de Plackett y Luce), cada piloto abandona
//   con su probabilidad (7 % de base ajustada con sus ultimas carreras), la vuelta rapida es para uno de los 10 primeros con peso
//   proporcional a su fuerza^0,45. De ahi salen ganador, podio, top 10, vuelta rapida, abandono y los duelos (quien termina por
//   delante). Clasificacion y sprint, igual con menos ruido. Campeonatos: se simulan las carreras que quedan sumando a los puntos de hoy.
//   Cuota = 1 / (probabilidad * 1,06), el margen de la casa de sync.mjs, y luego el +5 % (sube) que PM pidio; minimo 1,03 y maximo
//   150 (60 en podio, top 10, vuelta rapida y abandono). La semilla es fija por sesion y parrilla: la cuota solo cambia si cambian los datos.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const JOL = 'https://api.jolpi.ca/ergast/f1';
const ESPN_ST = 'https://site.api.espn.com/apis/v2/sports/racing/f1/standings';
const WEB = 'https://pmbanks.github.io/apuestas/nueva/f1/';          // iconos de las sesiones (app/nueva/f1/)
const DAY = 864e5, HORA = 3600e3;
const MARGEN = 1.06;
const PTS_CARRERA = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], PTS_SPRINT = [8, 7, 6, 5, 4, 3, 2, 1];
const ALFA = 3.0, GRID_K = 0.8, SIMS = 30000, SIMS_CAMP = 6000;

// ---------- Grandes Premios en español y pais de cada circuito ----------
const GP_ES = {
  'Australian Grand Prix': 'Gran Premio de Australia', 'Chinese Grand Prix': 'Gran Premio de China', 'Japanese Grand Prix': 'Gran Premio de Japón',
  'Bahrain Grand Prix': 'Gran Premio de Baréin', 'Saudi Arabian Grand Prix': 'Gran Premio de Arabia Saudí', 'Miami Grand Prix': 'Gran Premio de Miami',
  'Emilia Romagna Grand Prix': 'Gran Premio de Emilia Romaña', 'Monaco Grand Prix': 'Gran Premio de Mónaco', 'Canadian Grand Prix': 'Gran Premio de Canadá',
  'Spanish Grand Prix': 'Gran Premio de España', 'Barcelona Grand Prix': 'Gran Premio de Barcelona', 'Austrian Grand Prix': 'Gran Premio de Austria',
  'British Grand Prix': 'Gran Premio de Gran Bretaña', 'Hungarian Grand Prix': 'Gran Premio de Hungría', 'Belgian Grand Prix': 'Gran Premio de Bélgica',
  'Dutch Grand Prix': 'Gran Premio de los Países Bajos', 'Italian Grand Prix': 'Gran Premio de Italia', 'Azerbaijan Grand Prix': 'Gran Premio de Azerbaiyán',
  'Singapore Grand Prix': 'Gran Premio de Singapur', 'United States Grand Prix': 'Gran Premio de Estados Unidos', 'Mexico City Grand Prix': 'Gran Premio de México',
  'Mexican Grand Prix': 'Gran Premio de México', 'São Paulo Grand Prix': 'Gran Premio de São Paulo', 'Sao Paulo Grand Prix': 'Gran Premio de São Paulo',
  'Brazilian Grand Prix': 'Gran Premio de Brasil', 'Las Vegas Grand Prix': 'Gran Premio de Las Vegas', 'Qatar Grand Prix': 'Gran Premio de Catar',
  'Abu Dhabi Grand Prix': 'Gran Premio de Abu Dabi', 'French Grand Prix': 'Gran Premio de Francia', 'German Grand Prix': 'Gran Premio de Alemania',
  'Portuguese Grand Prix': 'Gran Premio de Portugal', 'Turkish Grand Prix': 'Gran Premio de Turquía', 'Russian Grand Prix': 'Gran Premio de Rusia',
  'Styrian Grand Prix': 'Gran Premio de Estiria', 'Eifel Grand Prix': 'Gran Premio de Eifel', 'Tuscan Grand Prix': 'Gran Premio de la Toscana',
  'Sakhir Grand Prix': 'Gran Premio de Sakhir', '70th Anniversary Grand Prix': 'Gran Premio del 70 Aniversario', 'Malaysian Grand Prix': 'Gran Premio de Malasia',
  'Madrid Grand Prix': 'Gran Premio de Madrid',
};
const PAIS_ISO = {
  Australia: 'au', China: 'cn', Japan: 'jp', Bahrain: 'bh', 'Saudi Arabia': 'sa', USA: 'us', 'United States': 'us', Italy: 'it', Monaco: 'mc', Canada: 'ca', Spain: 'es',
  Austria: 'at', UK: 'gb', 'United Kingdom': 'gb', Hungary: 'hu', Belgium: 'be', Netherlands: 'nl', Azerbaijan: 'az', Singapore: 'sg', Mexico: 'mx', Brazil: 'br',
  UAE: 'ae', 'United Arab Emirates': 'ae', Qatar: 'qa', Malaysia: 'my', France: 'fr', Germany: 'de', Portugal: 'pt', Turkey: 'tr', Russia: 'ru',
};
const ISO_ES = { au: 'Australia', cn: 'China', jp: 'Japón', bh: 'Baréin', sa: 'Arabia Saudí', us: 'Estados Unidos', it: 'Italia', mc: 'Mónaco', ca: 'Canadá', es: 'España', at: 'Austria',
  gb: 'Gran Bretaña', hu: 'Hungría', be: 'Bélgica', nl: 'Países Bajos', az: 'Azerbaiyán', sg: 'Singapur', mx: 'México', br: 'Brasil', ae: 'Emiratos Árabes', qa: 'Catar',
  my: 'Malasia', fr: 'Francia', de: 'Alemania', pt: 'Portugal', tr: 'Turquía', ru: 'Rusia' };
export const nombreGP = (raceName, pais) => GP_ES[raceName] || (PAIS_ISO[pais] && ISO_ES[PAIS_ISO[pais]] ? `Gran Premio de ${ISO_ES[PAIS_ISO[pais]]}` : String(raceName || 'Gran Premio'));
export const banderaPais = (pais) => (PAIS_ISO[pais] ? `https://flagcdn.com/w160/${PAIS_ISO[pais]}.png` : null);

// ---------- utilidades ----------
const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : null };
const arr = (x) => (Array.isArray(x) ? x : []);
const r2 = (x) => Math.round(x * 100) / 100;
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const instante = (fecha, hora) => {
  if (!/^\d{4}-\d\d-\d\d$/.test(String(fecha || ''))) return null;
  const h = /^\d\d:\d\d(:\d\d)?Z?$/.test(String(hora || '')) ? String(hora).replace(/Z$/, '').padEnd(8, ':00').slice(0, 8) : '12:00:00';
  const t = Date.parse(`${fecha}T${h}Z`);
  return Number.isFinite(t) ? t : null;
};
export function prng(seed) {                                        // mulberry32: la misma semilla da siempre los mismos numeros
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) } return h >>> 0 };
const gumbel = (u) => -Math.log(-Math.log(Math.max(1e-12, Math.min(1 - 1e-12, u))));

// ---------- Jolpica: ritmo, reintentos y cache en disco (entre pasadas de una misma ejecucion) ----------
const CACHE_F = path.join(os.tmpdir(), 'gm-f1-cache.json');
let CACHE = null, ULTIMA = 0;
const cargaCache = () => { if (CACHE) return CACHE; try { CACHE = JSON.parse(fs.readFileSync(CACHE_F, 'utf8')) } catch { CACHE = {} } return CACHE };
const guardaCache = () => { try { fs.writeFileSync(CACHE_F, JSON.stringify(CACHE)) } catch {} };
export const _cache = { limpia() { CACHE = {} } };
async function pideJson(url, { reintentos = 3, headers = {} } = {}) {
  for (let i = 0; i < reintentos; i++) {
    const espera = 300 - (Date.now() - ULTIMA); if (espera > 0) await sleep(espera);
    ULTIMA = Date.now();
    try {
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 15000);
      const r = await fetch(url, { headers: { 'user-agent': 'apuestas-colegas/1.0', ...headers }, signal: ctl.signal }); clearTimeout(to);
      if (r.ok) return await r.json();
      if (r.status === 429) { const ra = num(r.headers.get('retry-after')); await sleep(Math.min(30000, ra ? ra * 1000 : 4000 * 2 ** i)); continue }
      if (r.status < 500) return null;
    } catch {}
    await sleep(1500 * (i + 1));
  }
  return null;
}
// pide con cache en disco: ttl (valor vacio o sin respuesta valida) y lleno (valor bueno, null = para siempre). Un fallo de red
// no cambia la cache; si hay algo viejo, se usa.
async function conCache(clave, ttl, fn, { vacio = (v) => v == null, lleno = ttl } = {}) {
  const c = cargaCache(), e = c[clave];
  if (e) { const t = vacio(e.v) ? ttl : lleno; if (t == null || Date.now() - e.t < t) return e.v }
  const v = await fn();
  if (v != null) { c[clave] = { t: Date.now(), v }; guardaCache(); return v }
  return e ? e.v : null;
}
const jol = (p) => pideJson(JOL + p);
const tabla = (j, k) => arr(j?.MRData?.[k]);

// ---------- datos de la temporada ----------
function carrera(r) {   // una carrera del calendario de Jolpica, con sus sesiones como instantes
  const ronda = num(r.round), temporada = num(r.season), t = instante(r.date, r.time);
  if (!r.raceName || !ronda || !temporada || !t) return null;
  const c = r.Circuit || {}, loc = c.Location || {};
  const sq = r.SprintQualifying || r.SprintShootout;
  const q = r.Qualifying && instante(r.Qualifying.date, r.Qualifying.time);
  const s = r.Sprint && instante(r.Sprint.date, r.Sprint.time);
  return { temporada, ronda, nombre: r.raceName, circuito: c.circuitId, circuitoNombre: c.circuitName, lugar: loc.locality || '', pais: loc.country || '', lat: num(loc.lat), lon: num(loc.long),
    carrera: t, quali: q || null, sprint: s || null, sprintQuali: sq ? instante(sq.date, sq.time) : null };
}
const calendario = (cal) => arr(cal?.MRData?.RaceTable?.Races).map(carrera).filter(Boolean).sort((a, b) => a.ronda - b.ronda);

// estado de un resultado de Jolpica: F acaba, L acaba con vueltas de menos, R abandona, D descalificado, S no sale
export function estadoResultado(r) {
  const s = String(r.status || ''), pt = String(r.positionText || '');
  if (pt === 'D' || pt === 'E' || /disqualif|excluded/i.test(s)) return 'D';
  if (pt === 'W' || pt === 'F' || (num(r.laps) === 0 && /did not (start|qualify|prequalify)|withdrew|illness|injur|not started/i.test(s))) return 'S';
  if (/^finished$/i.test(s)) return 'F';
  if (/^\+\d+ laps?$/i.test(s) || /^lapped$/i.test(s)) return 'L';
  return 'R';
}
// clasificacion oficial de una lista de resultados (carrera o sprint): { o, st, fl, n }
export function clasifica(res) {
  const filas = arr(res).filter((r) => r?.Driver?.driverId).map((r, i) => ({ id: r.Driver.driverId, pos: num(r.position) ?? 999 + i, st: estadoResultado(r), fl: String(r.FastestLap?.rank) === '1', eq: r.Constructor?.constructorId, pts: num(r.points) || 0, grid: num(r.grid), laps: num(r.laps), r }))
    .sort((a, b) => a.pos - b.pos);
  const st = {}; for (const f of filas) st[f.id] = f.st;
  return { o: filas.map((f) => f.id), st, fl: filas.find((f) => f.fl)?.id ?? null, n: filas.length, filas };
}
export function clasificaQuali(res) {
  const filas = arr(res).filter((r) => r?.Driver?.driverId).map((r, i) => ({ id: r.Driver.driverId, pos: num(r.position) ?? 999 + i, eq: r.Constructor?.constructorId })).sort((a, b) => a.pos - b.pos);
  return { o: filas.map((f) => f.id), n: filas.length, filas };
}

// ---------- el modelo ----------
const ppr = (pts, n) => (n > 0 ? pts / n : 0);
// lineup: [{ id, nombre, eq, eqNombre, num }]; datos: { pts: {id}, rondas, form: {id: [puntos de las ultimas carreras]}, retirados: {id: n}, previa: {id: ppr}, circ: {id: ppr en ese circuito},
// eqppr: {eq: ppr}, grid: {id: puesto} }
export function fuerzas(lineup, d) {
  const out = {}, n = d.rondas || 0, w = n / (n + 3);
  for (const p of lineup) {
    const temp = n > 0 ? ppr(d.pts?.[p.id] ?? 0, n) : null;
    const fo = d.form?.[p.id] || [];
    const form = fo.length ? fo.reduce((a, b) => a + b, 0) / fo.length : null;
    const previa = d.previa?.[p.id] ?? (d.eqppr?.[p.eq] != null ? d.eqppr[p.eq] / 2 : 0.5);
    let base = temp == null ? previa : w * (form == null ? temp : 0.55 * temp + 0.45 * form) + (1 - w) * previa;
    const c = d.circ?.[p.id];
    if (c != null) base = 0.85 * base + 0.15 * c;
    let s = ALFA * Math.log(base + 1.5);
    const g = d.grid?.[p.id];
    if (g) s += GRID_K * -Math.log(g);
    out[p.id] = s;
  }
  return out;
}
export function probAbandono(lineup, d) {
  const out = {};
  for (const p of lineup) { const f = (d.form?.[p.id] || []).length, ret = d.retirados?.[p.id] || 0; out[p.id] = Math.min(0.2, Math.max(0.04, (ret + 0.07 * 6) / (f + 6))) }
  return out;
}
// simula una carrera: devuelve { orden: [indices por llegada], aband: Set, fl: indice | -1 }
function unaCarrera(s, pdnf, rnd, k = 1, flPeso = 0.45) {
  const n = s.length, fin = [], dnf = [];
  for (let i = 0; i < n; i++) { if (rnd() < pdnf[i]) dnf.push(i); else fin.push({ i, v: k * s[i] + gumbel(rnd()) }) }
  fin.sort((a, b) => b.v - a.v);
  for (let i = dnf.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [dnf[i], dnf[j]] = [dnf[j], dnf[i]] }
  const orden = fin.map((x) => x.i).concat(dnf);
  let fl = -1;
  const top = fin.slice(0, 10);
  if (top.length) {
    const ws = top.map((x) => Math.exp(flPeso * s[x.i])), tot = ws.reduce((a, b) => a + b, 0); let u = rnd() * tot;
    for (let j = 0; j < top.length; j++) { u -= ws[j]; if (u <= 0) { fl = top[j].i; break } }
    if (fl < 0) fl = top[top.length - 1].i;
  }
  return { orden, nfin: fin.length, fl };
}
// probabilidades de la carrera (o del sprint con tipo 'sprint', o de la clasificacion con tipo 'quali')
export function simula(lineup, st, pdnf, { tipo = 'carrera', semilla = 1, n = SIMS, duelos = [] } = {}) {
  const ids = lineup.map((p) => p.id), s = ids.map((id) => st[id]), pd = ids.map((id) => (tipo === 'carrera' ? pdnf[id] : tipo === 'sprint' ? pdnf[id] * 0.5 : 0));
  const k = tipo === 'quali' ? 1.35 : tipo === 'sprint' ? 1.1 : 1;
  const rnd = prng(semilla), N = ids.length;
  const win = new Array(N).fill(0), pod = new Array(N).fill(0), top10 = new Array(N).fill(0), fl = new Array(N).fill(0), dnf = new Array(N).fill(0);
  const dz = duelos.map(([a, b]) => ({ a: ids.indexOf(a), b: ids.indexOf(b), ganaA: 0 })).filter((d) => d.a >= 0 && d.b >= 0);
  for (let it = 0; it < n; it++) {
    const r = unaCarrera(s, pd, rnd, k);
    const pos = new Array(N);
    r.orden.forEach((i, j) => { pos[i] = j; if (j < r.nfin) { } else dnf[i]++ });
    win[r.orden[0]]++; for (let j = 0; j < Math.min(3, N); j++) pod[r.orden[j]]++; for (let j = 0; j < Math.min(10, N); j++) top10[r.orden[j]]++;
    if (r.fl >= 0) fl[r.fl]++;
    for (const d of dz) if (pos[d.a] < pos[d.b]) d.ganaA++;
  }
  const f = (a) => Object.fromEntries(ids.map((id, i) => [id, a[i] / n]));
  return { win: f(win), podio: f(pod), top10: f(top10), fl: f(fl), dnf: f(dnf), duelos: dz.map((d) => ({ a: ids[d.a], b: ids[d.b], p: d.ganaA / n })) };
}
// campeonato: carreras restantes [{sprint: bool}], puntos de hoy de pilotos {id: pts} y de escuderias {eq: pts}
export function simulaCampeonato(lineup, st, pdnf, restantes, ptsP, ptsE, semilla, n = SIMS_CAMP) {
  const ids = lineup.map((p) => p.id), s = ids.map((id) => st[id]), pd = ids.map((id) => pdnf[id]), rnd = prng(semilla);
  const eqs = [...new Set(Object.keys(ptsE).concat(lineup.map((p) => p.eq)))];
  const winP = {}, winE = {};
  for (let it = 0; it < n; it++) {
    const pp = ids.map((id) => ptsP[id] || 0), ee = Object.fromEntries(eqs.map((e) => [e, ptsE[e] || 0]));
    for (const c of restantes) {
      if (c.sprint) { const r = unaCarrera(s, pd.map((x) => x * 0.5), rnd, 1.1); for (let j = 0; j < Math.min(8, r.nfin); j++) { pp[r.orden[j]] += PTS_SPRINT[j]; ee[lineup[r.orden[j]].eq] += PTS_SPRINT[j] } }
      const r = unaCarrera(s, pd, rnd, 1);
      for (let j = 0; j < Math.min(10, r.nfin); j++) { pp[r.orden[j]] += PTS_CARRERA[j]; ee[lineup[r.orden[j]].eq] += PTS_CARRERA[j] }
    }
    // todos los pilotos con puntos (incluidos los que ya no corren) compiten por el titulo
    let mejor = -1, mp = -1; ids.forEach((id, i) => { if (pp[i] > mp || (pp[i] === mp && (ptsP[id] || 0) > (ptsP[ids[mejor]] || 0))) { mp = pp[i]; mejor = i } });
    let otro = null, pmax = mp; for (const [id, v] of Object.entries(ptsP)) if (!ids.includes(id) && v > pmax) { pmax = v; otro = id }
    const campeon = otro || ids[mejor]; winP[campeon] = (winP[campeon] || 0) + 1;
    let me = null, mv = -1; for (const e of eqs) if (ee[e] > mv) { mv = ee[e]; me = e } winE[me] = (winE[me] || 0) + 1;
  }
  const f = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v / n]));
  return { pilotos: f(winP), escuderias: f(winE) };
}
// probabilidad -> cuota con el margen de la casa y el +5 % (sube); null si no se ofrece
export function cuota(p, { sube = (x) => Math.round(x * 105) / 100, min = 0.004, maxP = 0.97, tope = 150 } = {}) {
  if (!(p >= min) || p > maxP) return null;
  const o = sube(1 / (p * MARGEN));
  return r2(Math.min(tope, Math.max(1.03, o)));
}

// ---------- resultado ----------
export function resultadoDuelo(a, b, fila) {
  const x = fila.find((f) => f.id === a), y = fila.find((f) => f.id === b);
  if (!x || !y || x.st === 'S' || y.st === 'S') return null;
  return { winner: x.pos < y.pos ? '1' : '2', score: `${x.pos}:${y.pos}` };
}

// ---------- construccion de las filas ----------
const SESION = { R: ['Carrera', 'carrera.svg'], Q: ['Clasificación', 'quali.svg'], S: ['Sprint', 'sprint.svg'] };
const apellido = (d) => d.familyName || String(d.nombre || '').split(' ').pop();
export const nombrePiloto = (d) => `${d.givenName || ''} ${d.familyName || ''}`.trim();

function filaBase(c, ses, n, extra) {
  const lugar = [c.circuitoNombre, [c.lugar, c.pais].filter(Boolean).join(', ')].filter(Boolean).join(', ');
  return { sport: 'r', league: 'f1', league_name: 'Fórmula 1', league_logo: null, stage: `Ronda ${c.ronda} de ${n}`, tag: null, venue: lugar,
    bo: null, odds_1: null, odds_x: null, odds_2: null, odds_src: 'modelo', ...extra };
}
function estadoSesion(inicio, duracion, tiene, ahora, resultados) {
  if (resultados) return 'final';
  if (ahora < inicio) return 'scheduled';
  if (ahora > inicio + 4 * DAY) return 'canceled';
  return 'live';
}

// n: carreras de la temporada. ctx: { ahora, lineup, st, pdnf, grid, ph, resQ, resR, resS }
export function filasGP(c, n, D) {
  const { ahora } = D, filas = [];
  const dr = Object.fromEntries(D.lineup.map((p) => [p.id, p.nombre])), eq = Object.fromEntries(D.lineup.map((p) => [p.eq, p.eqNombre])), tm = Object.fromEntries(D.lineup.map((p) => [p.id, p.eq]));
  const gpEs = nombreGP(c.nombre, c.pais);
  const detalle = (kind, extra = {}) => ({ kind, gp: `${c.temporada}-${c.ronda}`, year: c.temporada, round: c.ronda, gpEn: c.nombre, circ: { id: c.circuito, name: c.circuitoNombre, loc: c.lugar, country: c.pais },
    ses: { Q: c.quali, S: c.sprint, R: c.carrera }, dr, tm, eq, ...extra });
  const logoPais = banderaPais(c.pais);
  const mk = (kind, key, inicio, resultados, p) => {
    const abierta = ahora < inicio;
    const id = `f1-${c.temporada}-${c.ronda}-${key}`;
    const status = estadoSesion(inicio, 0, true, ahora, resultados);
    let odds = null;
    if (abierta && p) odds = p;
    const det = detalle(kind, { grid: D.grid && Object.keys(D.grid).length ? D.grid : undefined, ph: D.ph, ...(resultados ? { res: resultados } : {}) });
    const winnerName = resultados ? (D.lineup.find((x) => x.id === resultados.o[0]) || {}).nombre : null;
    return { id, ...filaBase(c, key, n, {}), home: gpEs, away: SESION[key][0], home_logo: logoPais, away_logo: WEB + SESION[key][1], starts_at: new Date(inicio).toISOString(),
      status, score: resultados ? apellido({ nombre: winnerName }) : null, winner: resultados ? '1' : null, details: det, odds_mk: odds };
  };
  // carrera
  const pr = D.pCarrera, mkR = {}, mkQ = {}, mkS = {};
  if (pr) for (const p of D.lineup) {
    const put = (o, k, v, opt) => { const q = cuota(v, { sube: D.sube, ...opt }); if (q) o[k + ':' + p.id] = q };
    put(mkR, 'FW', pr.win[p.id]); put(mkR, 'FP', pr.podio[p.id], { min: 0.01, tope: 60 }); put(mkR, 'FT', pr.top10[p.id], { min: 0.03, tope: 60 });
    put(mkR, 'FL', pr.fl[p.id], { min: 0.01, tope: 60 }); put(mkR, 'FX', pr.dnf[p.id], { min: 0.02, maxP: 0.9, tope: 60 });
  }
  if (D.pQuali) for (const p of D.lineup) { const q = cuota(D.pQuali.win[p.id], { sube: D.sube }); if (q) mkQ['FQ:' + p.id] = q }
  if (D.pSprint) for (const p of D.lineup) { const q = cuota(D.pSprint.win[p.id], { sube: D.sube }); if (q) mkS['FS:' + p.id] = q }
  const hayMk = (m) => (Object.keys(m).length ? m : null);
  const resR = D.resR, resS = D.resS, resQ = D.resQ;
  filas.push(mk('race', 'R', c.carrera, resR && resR.n >= 10 ? { o: resR.o, st: resR.st, fl: resR.fl } : null, hayMk(mkR)));
  if (c.quali) filas.push(mk('quali', 'Q', c.quali, resQ && resQ.n >= 10 ? { o: resQ.o } : null, hayMk(mkQ)));
  if (c.sprint) filas.push(mk('sprint', 'S', c.sprint, resS && resS.n >= 10 ? { o: resS.o, st: resS.st } : null, hayMk(mkS)));
  // duelos entre companeros: solo con la carrera por jugar o recien jugada
  if (D.duelos) for (const d of D.duelos) {
    const A = D.lineup.find((p) => p.id === d.a), B = D.lineup.find((p) => p.id === d.b); if (!A || !B) continue;
    const id = `f1-${c.temporada}-${c.ronda}-D-${d.a}-${d.b}`.slice(0, 120);
    let status = ahora < c.carrera ? 'scheduled' : 'live', winner = null, score = null;
    if (resR && resR.n >= 10) { const x = resultadoDuelo(d.a, d.b, resR.filas); if (x) { status = 'final'; winner = x.winner; score = x.score } else status = 'canceled' }
    else if (ahora > c.carrera + 4 * DAY) status = 'canceled';
    const o1 = ahora < c.carrera && d.p != null ? cuota(d.p, { sube: D.sube, min: 0.02, maxP: 0.98, tope: 40 }) : null;
    const o2 = ahora < c.carrera && d.p != null ? cuota(1 - d.p, { sube: D.sube, min: 0.02, maxP: 0.98, tope: 40 }) : null;
    filas.push({ id, ...filaBase(c, 'D', n, {}), stage: gpEs, tag: 'Duelo entre compañeros', home: A.nombre, away: B.nombre, home_logo: D.foto?.[A.id] || null, away_logo: D.foto?.[B.id] || null,
      starts_at: new Date(c.carrera).toISOString(), status, score, winner, odds_1: o1, odds_2: o2, details: { kind: 'duel', gp: `${c.temporada}-${c.ronda}`, year: c.temporada, round: c.ronda, gpEn: c.nombre, dr: { [A.id]: A.nombre, [B.id]: B.nombre }, tm: { [A.id]: A.eq, [B.id]: B.eq }, eq: { [A.eq]: A.eqNombre, [B.eq]: B.eqNombre } }, odds_mk: null });
  }
  return filas;
}

// campeonatos
export function filasCampeonato(year, ult, D) {
  const out = [];
  const comun = (kind, id, home, mkp, res) => ({
    id, sport: 'r', league: 'f1', league_name: 'Fórmula 1', league_logo: null, stage: `Temporada ${year}`, tag: null, venue: null, home, away: 'Fórmula 1',
    home_logo: null, away_logo: WEB + 'campeonato.svg', starts_at: new Date(ult.carrera).toISOString(), status: res ? 'final' : (D.ahora > ult.carrera + 4 * DAY ? 'canceled' : D.ahora >= ult.carrera ? 'live' : 'scheduled'),
    score: res ? res.nombre : null, winner: res ? '1' : null, bo: null, odds_1: null, odds_x: null, odds_2: null, odds_src: 'modelo',
    details: { kind, gp: `C${year}`, year, dr: Object.fromEntries(D.lineup.map((p) => [p.id, p.nombre])), tm: Object.fromEntries(D.lineup.map((p) => [p.id, p.eq])), eq: Object.fromEntries(D.lineup.map((p) => [p.eq, p.eqNombre])), ...(res ? { res: { o: res.o } } : {}) }, odds_mk: mkp });
  const mkP = {}, mkE = {};
  if (D.pCamp && D.ahora < ult.carrera) {
    for (const [id, p] of Object.entries(D.pCamp.pilotos)) { const q = cuota(p, { sube: D.sube, min: 0.004, tope: 150 }); if (q && D.lineup.some((x) => x.id === id)) mkP['FC:' + id] = q }
    for (const [e, p] of Object.entries(D.pCamp.escuderias)) { const q = cuota(p, { sube: D.sube, min: 0.004, tope: 150 }); if (q) mkE['FK:' + e] = q }
  }
  out.push(comun('wdc', `f1-${year}-WDC`, `Campeonato de pilotos ${year}`, Object.keys(mkP).length ? mkP : null, D.resWDC));
  out.push(comun('wcc', `f1-${year}-WCC`, `Campeonato de constructores ${year}`, Object.keys(mkE).length ? mkE : null, D.resWCC));
  return out;
}

// ---------- toda la pasada ----------
export async function f1(ctx = {}) {
  const ahora = ctx.now || Date.now(), sube = ctx.sube || ((x) => Math.round(x * 105) / 100);
  const year = new Date(ahora).getUTCFullYear();
  const cal = await conCache('cal:' + year, 6 * HORA, () => jol(`/${year}.json?limit=100`), { vacio: (v) => !arr(v?.MRData?.RaceTable?.Races).length });
  const carreras = calendario(cal);
  if (!carreras.length) { console.log('f1: sin calendario de Jolpica'); return { rows: [], anular: [] }; }
  const n = carreras.length, ult = carreras[n - 1];
  const rows = [], enVentana = carreras.filter((c) => c.carrera >= ahora - 6 * DAY && c.carrera <= ahora + 16 * DAY);
  // pilotos y escuderias de hoy (clasificaciones) y de la temporada pasada
  const stD = await conCache('stD:' + year, 25 * 60e3, () => jol(`/${year}/driverStandings.json`), { vacio: (v) => !arr(v?.MRData?.StandingsTable?.StandingsLists).length });
  const stC = await conCache('stC:' + year, 25 * 60e3, () => jol(`/${year}/constructorStandings.json`), { vacio: (v) => !arr(v?.MRData?.StandingsTable?.StandingsLists).length });
  const listaD = arr(stD?.MRData?.StandingsTable?.StandingsLists)[0], listaC = arr(stC?.MRData?.StandingsTable?.StandingsLists)[0];
  const rondasHechas = num(listaD?.round) || 0;
  const filasD = arr(listaD?.DriverStandings), filasC = arr(listaC?.ConstructorStandings);
  const ptsP = Object.fromEntries(filasD.map((f) => [f.Driver.driverId, num(f.points) || 0]));
  const ptsE = Object.fromEntries(filasC.map((f) => [f.Constructor.constructorId, num(f.points) || 0]));
  // fotos de ESPN (por nombre) para los duelos
  const espn = await conCache('espn', 12 * HORA, () => pideJson(ESPN_ST), { vacio: (v) => !v?.children });
  const fotoDe = {}; const lista = arr(espn?.children?.[0]?.standings?.entries).map((e) => e.athlete).filter(Boolean);
  const idEspn = (d) => { const fam = norm(d.familyName), ini = norm(d.givenName).split(' ')[0]; const cand = lista.filter((a) => norm(a.displayName).endsWith(fam) || norm(a.displayName).split(' ').includes(fam.split(' ').pop()));
    const uno = cand.length === 1 ? cand[0] : cand.find((a) => norm(a.displayName).startsWith(ini)) || null; return uno?.id };
  const resultado = { rows: [], anular: [] };
  const ids = new Set(carreras.map((c) => c.ronda));
  for (const c of enVentana) {
    // resultados oficiales
    const finQ = c.quali && ahora > c.quali + 50 * 60e3, finS = c.sprint && ahora > c.sprint + 40 * 60e3, finR = ahora > c.carrera + 90 * 60e3;
    const get = async (k, pth, ya, tipo) => ya ? conCache(`${k}:${c.temporada}:${c.ronda}`, 7 * 60e3, () => jol(pth), { vacio: (v) => !arr(v?.MRData?.RaceTable?.Races?.[0]?.[tipo]).length, lleno: null }) : null;
    const jQ = await get('qua', `/${c.temporada}/${c.ronda}/qualifying.json`, finQ, 'QualifyingResults');
    const jS = await get('spr', `/${c.temporada}/${c.ronda}/sprint.json`, finS, 'SprintResults');
    const jR = await get('res', `/${c.temporada}/${c.ronda}/results.json`, finR, 'Results');
    const resQ = jQ ? clasificaQuali(jQ.MRData.RaceTable.Races?.[0]?.QualifyingResults) : null;
    const resS = jS ? clasifica(jS.MRData.RaceTable.Races?.[0]?.SprintResults) : null;
    const resR = jR ? clasifica(jR.MRData.RaceTable.Races?.[0]?.Results) : null;
    // los pilotos: los de la parrilla de la ultima carrera hecha; si ya hay clasificacion o carrera de esta ronda, los que de verdad participan
    const sinResolver = c.carrera > ahora || (c.quali && c.quali > ahora) || (c.sprint && c.sprint > ahora);
    let lineup = [];
    const fuenteLinea = resR?.n >= 10 ? resR.filas : resQ?.n >= 10 ? resQ.filas : null;
    const mapaD = new Map(filasD.map((f) => [f.Driver.driverId, f]));
    const mapaE = new Map(filasC.map((f) => [f.Constructor.constructorId, f.Constructor.name]));
    let ultimaRonda = null;
    if (!fuenteLinea) {
      const rUlt = c.ronda > 1 ? await conCache(`res:${c.temporada}:${c.ronda - 1}`, 6 * HORA, () => jol(`/${c.temporada}/${c.ronda - 1}/results.json`), { vacio: (v) => !arr(v?.MRData?.RaceTable?.Races?.[0]?.Results).length, lleno: null }) : null;
      ultimaRonda = rUlt && arr(rUlt.MRData.RaceTable.Races?.[0]?.Results);
    }
    const crudos = fuenteLinea ? (resR?.n >= 10 ? arr(jR.MRData.RaceTable.Races[0].Results) : arr(jQ.MRData.RaceTable.Races[0].QualifyingResults)) : ultimaRonda || [];
    for (const r of crudos) { const d = r.Driver, e = r.Constructor; if (!d?.driverId) continue;
      lineup.push({ id: d.driverId, nombre: nombrePiloto(d), eq: e?.constructorId || 'x', eqNombre: e?.name || '', num: d.permanentNumber, d }); }
    if (!lineup.length) for (const f of filasD.slice(0, 22)) { const e = arr(f.Constructors).slice(-1)[0] || {}; lineup.push({ id: f.Driver.driverId, nombre: nombrePiloto(f.Driver), eq: e.constructorId || 'x', eqNombre: e.name || '', d: f.Driver }) }
    if (!lineup.length) { console.log(`f1: sin pilotos para la ronda ${c.ronda}`); continue }
    for (const p of lineup) { const e = idEspn(p.d || {}); if (e) fotoDe[p.id] = `https://a.espncdn.com/i/headshots/rpm/players/full/${e}.png` }
    // datos del modelo (solo si alguna sesion sigue abierta)
    let D = { ahora, lineup, sube, resQ, resR, resS, foto: fotoDe, ph: Object.fromEntries(Object.entries(fotoDe).map(([k, v]) => [k, v.match(/(\d+)\.png/)?.[1]])) };
    if (sinResolver || !resR) {
      // forma: las ultimas 3 carreras
      const form = {}, retirados = {}, previa = {}, eqppr = {}, circ = {};
      const desde = Math.max(1, c.ronda - 3);
      for (let r = c.ronda - 1; r >= desde; r--) {
        const j = await conCache(`res:${c.temporada}:${r}`, 6 * HORA, () => jol(`/${c.temporada}/${r}/results.json`), { vacio: (v) => !arr(v?.MRData?.RaceTable?.Races?.[0]?.Results).length, lleno: null });
        for (const x of arr(j?.MRData?.RaceTable?.Races?.[0]?.Results)) { const id = x.Driver?.driverId; if (!id) continue; (form[id] ||= []).push(num(x.points) || 0); if (estadoResultado(x) === 'R') retirados[id] = (retirados[id] || 0) + 1 }
      }
      const stPrev = await conCache('stD:' + (year - 1), 24 * HORA, () => jol(`/${year - 1}/driverStandings.json`), { vacio: (v) => !arr(v?.MRData?.StandingsTable?.StandingsLists).length });
      const lp = arr(stPrev?.MRData?.StandingsTable?.StandingsLists)[0]; const rp = Math.max(1, num(lp?.round) || 1);
      for (const f of arr(lp?.DriverStandings)) previa[f.Driver.driverId] = ppr(num(f.points) || 0, rp);
      for (const f of filasC) eqppr[f.Constructor.constructorId] = ppr(num(f.points) || 0, Math.max(1, rondasHechas));
      // historial del circuito: ultimas 3 ediciones
      for (let y = c.temporada - 1; y >= c.temporada - 3; y--) {
        const j = await conCache(`circ:${c.circuito}:${y}`, 7 * DAY, () => jol(`/${y}/circuits/${c.circuito}/results.json`), { vacio: (v) => !arr(v?.MRData?.RaceTable?.Races?.[0]?.Results).length, lleno: null });
        for (const x of arr(j?.MRData?.RaceTable?.Races?.[0]?.Results)) { const id = x.Driver?.driverId; if (!id) continue;
          const lin = lineup.find((p) => p.id === id); const peso = lin && lin.eq === x.Constructor?.constructorId ? 1 : 0.5;
          const a = (circ[id] ||= { s: 0, w: 0 }); a.s += (num(x.points) || 0) * peso; a.w += peso }
      }
      const circF = Object.fromEntries(Object.entries(circ).filter(([, a]) => a.w > 0).map(([id, a]) => [id, a.s / a.w]));
      const grid = resQ?.n >= 10 ? Object.fromEntries(resQ.o.map((id, i) => [id, i + 1])) : {};
      const datos = { pts: ptsP, rondas: rondasHechas, form, retirados, previa, eqppr, circ: circF, grid };
      D.grid = grid;
      const st = fuerzas(lineup, datos), stSinGrid = fuerzas(lineup, { ...datos, grid: {} }), pdnf = probAbandono(lineup, datos);
      const sem = hash(`f1-${c.temporada}-${c.ronda}-${Object.entries(grid).map(([k, v]) => k + v).join('')}`);
      // duelos entre companeros (con la mayor cantidad de puntos primero)
      const porEq = new Map(); for (const p of lineup) { const a = porEq.get(p.eq) || []; a.push(p); porEq.set(p.eq, a) }
      const pares = [...porEq.values()].filter((a) => a.length >= 2).map((a) => a.sort((x, y) => (ptsP[y.id] || 0) - (ptsP[x.id] || 0)).slice(0, 2).map((p) => p.id));
      if (c.carrera > ahora || !resR) {
        D.pCarrera = simula(lineup, st, pdnf, { tipo: 'carrera', semilla: sem, duelos: pares });
        D.duelos = D.pCarrera.duelos.map((d) => ({ a: d.a, b: d.b, p: d.p }));
        if (c.quali && c.quali > ahora) D.pQuali = simula(lineup, stSinGrid, pdnf, { tipo: 'quali', semilla: sem + 1, n: 15000 });
        if (c.sprint && c.sprint > ahora) D.pSprint = simula(lineup, stSinGrid, pdnf, { tipo: 'sprint', semilla: sem + 2, n: 15000 });
      }
      if (!D.duelos) D.duelos = pares.map(([a, b]) => ({ a, b, p: null }));
    } else {
      const porEq = new Map(); for (const p of lineup) { const a = porEq.get(p.eq) || []; a.push(p); porEq.set(p.eq, a) }
      D.duelos = [...porEq.values()].filter((a) => a.length >= 2).map((a) => a.sort((x, y) => (ptsP[y.id] || 0) - (ptsP[x.id] || 0)).slice(0, 2).map((p) => p.id)).map(([a, b]) => ({ a, b, p: null }));
    }
    // duelos solo para la carrera que viene (o recien jugada), no para un Gran Premio lejano
    if (c.carrera > ahora + 8 * DAY) D.duelos = null;
    rows.push(...filasGP(c, n, D));
    resultado.lineup = lineup;
  }
  // campeonatos (mientras dure la temporada)
  const primera = carreras[0];
  if (ahora > primera.carrera - 30 * DAY && ahora < ult.carrera + 6 * DAY) {
    const lineup = [];
    for (const f of filasD) { const e = arr(f.Constructors).slice(-1)[0] || {}; lineup.push({ id: f.Driver.driverId, nombre: nombrePiloto(f.Driver), eq: e.constructorId || 'x', eqNombre: e.name || '' }) }
    for (const f of filasC) if (!lineup.some((p) => p.eq === f.Constructor.constructorId)) lineup.push({ id: 'x_' + f.Constructor.constructorId, nombre: '', eq: f.Constructor.constructorId, eqNombre: f.Constructor.name });
    const D = { ahora, lineup: lineup.filter((p) => !p.id.startsWith('x_')), sube };
    // final: la clasificacion tras la ultima carrera
    const hecho = rondasHechas >= ult.ronda && listaD && num(listaD.round) === ult.ronda;
    if (hecho) {
      D.resWDC = { o: filasD.map((f) => f.Driver.driverId), nombre: apellido(filasD[0].Driver) };
      D.resWCC = { o: filasC.map((f) => f.Constructor.constructorId), nombre: filasC[0]?.Constructor?.name || '' };
    } else if (filasD.length) {
      const restantes = carreras.filter((c) => c.carrera > ahora - 3 * HORA).map((c) => ({ sprint: !!c.sprint }));
      const rdl = carreras.find((c) => c.carrera > ahora - 3 * HORA);
      const st = fuerzas(D.lineup, { pts: ptsP, rondas: rondasHechas, form: {}, retirados: {}, previa: {}, eqppr: Object.fromEntries(filasC.map((f) => [f.Constructor.constructorId, ppr(num(f.points) || 0, Math.max(1, rondasHechas))])), circ: {}, grid: {} });
      // la forma de las ultimas carreras ya esta en los puntos de la temporada; para el titulo basta con eso
      const pdnf = probAbandono(D.lineup, { form: {}, retirados: {} });
      D.pCamp = simulaCampeonato(D.lineup, st, pdnf, restantes, ptsP, ptsE, hash(`camp-${year}-${rondasHechas}`));
    }
    rows.push(...filasCampeonato(year, ult, D));
  }
  resultado.rows = rows;
  resultado.rondas = ids;
  resultado.year = year;
  resultado.calFresco = Date.now() - (cargaCache()['cal:' + year]?.t || 0) < 8 * HORA;
  return resultado;
}

// Lo que ya no existe: ids pendientes de la base de la temporada cuyo Gran Premio no esta en el calendario de Jolpica
export function aAnular(pendientes, rondasEnCalendario, year) {
  const out = [];
  for (const p of arr(pendientes)) {
    const m = /^f1-(\d{4})-(\d+)-/.exec(p.id || ''); if (!m || +m[1] !== year) continue;
    if (!rondasEnCalendario.has(+m[2]) && p.status !== 'final') out.push(p.id);
  }
  return out;
}
// Anula en la base (se devuelve todo) lo que Jolpica ya no trae. Solo si el calendario es de hace menos de 8 horas: sin red no se anula nada.
export async function anulaF1(ctx, res) {
  if (!ctx.rpc || !ctx.secret || !res?.rondas?.size || !res.calFresco) return 0;
  const pend = await ctx.rpc('sync_f1_pendientes', { p_secret: ctx.secret });
  const ids = aAnular(pend, res.rondas, res.year);
  if (!ids.length) return 0;
  return ctx.rpc('sync_f1_anula', { p_secret: ctx.secret, p_ids: ids });
}
