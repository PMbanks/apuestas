// NBA (PM, 01-11: "pon nba tambien pero solo nba, no las demas ligas, para poder apostar, y que sea como el futbol que se
// pueda apostar, y tambien a jugadores y todo eso"). Todo de ESPN, gratis y sin clave, como el futbol y la UFC.
//
//  Partidos      site.api.espn.com .../basketball/nba/scoreboard?dates=AAAAMMDD, un dia por peticion (el rango da error 400)
//  Cuotas        DraftKings via ESPN, en el mismo scoreboard: ganador (moneyline), handicap (pointSpread) y total de puntos.
//                Sin ellas: modelo con el record de los dos (log5 + ventaja de jugar en casa) y una linea calculada.
//  Jugadores     DraftKings via la core API de ESPN (events/E/competitions/E/odds/100/propBets): puntos, rebotes, asistencias,
//                triples y puntos+rebotes+asistencias, mas/menos de una linea N,5. Los dos lados no vienen marcados: el de
//                "mas" se reconoce con la linea alternativa (milestones "18+" = mas de 17,5) y si no, es el primero (ESPN los da
//                asi en el 96 % de los casos medidos el 01-11, y los que no cuadraban tenian cuotas casi iguales).
//                Sin props de DraftKings: modelo con sus ultimos partidos (media y dispersion de la hoja de cada partido).
//  Directo       summary?event=E: marcador, cuarto, reloj y estadisticas de cada jugador (ex_live, para el cash out).
//  Resultado     summary?event=E: la hoja final (box score, prorroga incluida). Va en details.bx y con ella se pagan las
//                apuestas a jugadores. Si la hoja no llega, el partido se manda como en juego hasta tenerla (y pasadas 8 h,
//                como acabado sin hoja: las apuestas a jugadores se devuelven).
//
// Codigos de apuesta (db/039_nba.sql; los mismos en la app, nba.js):
//   1, 2                         gana el local o el visitante (sin empate; cuenta la prorroga)
//   SP1-6.5  SP2+6.5             handicap del local o del visitante con esa linea (linea entera: si cae justo, se devuelve)
//   TO220.5  TU220.5             mas / menos de N puntos entre los dos
//   J1:4251:PO17.5               jugador del local (J1) o del visitante (J2), id de ESPN, estadistica y mas (O) o menos (U)
//                                P puntos, R rebotes, A asistencias, T triples, X puntos+rebotes+asistencias
// details.pj = { id: nombre } de los jugadores de los dos equipos (para nombrar las apuestas).
// details.bx = { id: [puntos, rebotes, asistencias, triples] } de los que jugaron; details.bxok = true si la hoja esta entera.

const DAY = 864e5;
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const CORE = 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba';
const PASADO = 2, FUTURO = 4;                       // dias de scoreboard hacia atras y hacia delante
const PROPS_ANTES = 36 * 3600e3;                     // props de jugadores: solo partidos que empiezan en menos de 36 h
const SIN_HOJA = 8 * 3600e3;                         // acabado sin hoja: pasadas 8 h desde el inicio se da por acabado igual
const FICHA_VIEJA = 12 * 3600e3, FICHAS_POR_PASADA = 3;
const TIPO = { 1: 'P', 3: 'R', 2: 'A', 4: 'T', 90: 'X' };            // propBets.type.id -> estadistica
const HITO = { P: '218', R: '220', A: '219', T: '221', X: '225' };   // la linea alternativa ("18+") de cada una
const IDX = { P: 0, R: 1, A: 2, T: 3 };

// ---------- utilidades ----------
const ymd = (t) => new Date(t).toISOString().slice(0, 10).replace(/-/g, '');
const lin = (x) => String(x);                                          // 220.5 -> "220.5", 3 -> "3"
const conSigno = (x) => (x > 0 ? '+' : x < 0 ? '-' : '+') + lin(Math.abs(x));
// normal estandar: funcion de distribucion (Abramowitz y Stegun 7.1.26, error < 1e-6 de sobra para cuotas)
export function ncdf(x) {
  const z = Math.abs(x) / Math.SQRT2, t = 1 / (1 + 0.3275911 * z);
  const e = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return x >= 0 ? 0.5 * (1 + e) : 0.5 * (1 - e);
}
export function ninv(p) { let lo = -8, hi = 8; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (ncdf(m) < p) lo = m; else hi = m } return (lo + hi) / 2 }
async function enTandas(xs, n, fn) { const out = []; for (let i = 0; i < xs.length; i += n) out.push(...(await Promise.all(xs.slice(i, i + n).map(fn)))); return out }
const rec = (s) => { const [w, l] = String(s || '').split('-').map(Number); return isFinite(w) && isFinite(l) ? { w, l } : null };
const recDe = (c, tipo) => (c.records || []).find((r) => r.type === tipo || r.name === tipo)?.summary || '';
const logoEq = (t) => { const f = String(t?.logo || '').split('/').pop() || `${String(t?.abbreviation || '').toLowerCase()}.png`; return `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nba/500-dark/${f}&w=96&h=96` };

// ---------- hoja de estadisticas de un summary ----------
// { bx: {id: [p, r, a, t]}, nombres: {id: nombre}, lados: {id: '1'|'2'}, ok } ; ok = los dos equipos con 5 o mas que jugaron
export function hoja(d, idLocal) {
  const out = { bx: {}, nombres: {}, lados: {}, min: {}, ok: false };
  const eqs = d?.boxscore?.players || [];
  let n1 = 0, n2 = 0;
  for (const eq of eqs) {
    const lado = String(eq.team?.id) === String(idLocal) ? '1' : '2';
    const st = eq.statistics?.[0]; if (!st) continue;
    const k = st.keys || [], col = (n) => k.indexOf(n);
    const iMin = col('minutes'), iP = col('points'), iR = col('rebounds'), iA = col('assists'), iT = col('threePointFieldGoalsMade-threePointFieldGoalsAttempted');
    for (const a of st.athletes || []) {
      const id = String(a.athlete?.id || ''); if (!id) continue;
      out.nombres[id] = a.athlete.displayName || a.athlete.shortName || ''; out.lados[id] = lado;
      const s = a.stats || [];
      if (a.didNotPlay || !s.length) continue;
      const num = (i) => (i < 0 ? NaN : parseInt(String(s[i]).split('-')[0], 10));
      const v = [num(iP), num(iR), num(iA), num(iT)], mins = num(iMin);
      if (v.some((x) => !isFinite(x))) continue;
      if (!(mins > 0) && !v.some((x) => x > 0)) continue;                       // en la lista pero sin pisar la pista
      out.bx[id] = v; out.min[id] = isFinite(mins) ? mins : 0;
      if (lado === '1') n1++; else n2++;
    }
  }
  out.ok = n1 >= 5 && n2 >= 5;
  return out;
}

// ---------- cuotas del partido ----------
// o: [cuota local, cuota visitante] sin el +5 %. Devuelve odds_mk (con el +5 %) de handicap y total
function mercadosPartido(c, p1, ctx) {
  const { american, sube, fromProbs } = ctx, out = {};
  const dk = c.odds?.[0] || {};
  const lado = (x) => ({ l: parseFloat(String(x?.close?.line ?? x?.open?.line ?? '').replace(/^[ou]/i, '')), o: american(x?.close?.odds ?? x?.open?.odds) });
  // handicap: el de DraftKings (mismas lineas con signo contrario, cuota a los dos lados)
  const sh = lado(dk.pointSpread?.home), sa = lado(dk.pointSpread?.away);
  let hayH = false;
  if (isFinite(sh.l) && isFinite(sa.l) && sh.l === -sa.l && sh.l !== 0 && Math.abs(sh.l) < 40 && (sh.l * 2) % 1 === 0 && sh.o && sa.o) {
    out['SP1' + conSigno(sh.l)] = sube(sh.o); out['SP2' + conSigno(sa.l)] = sube(sa.o); hayH = true;
  }
  // total: el de DraftKings
  const ov = lado(dk.total?.over), un = lado(dk.total?.under);
  let hayT = false;
  if (isFinite(ov.l) && ov.l === un.l && ov.l >= 150 && ov.l <= 300 && (ov.l * 2) % 1 === 0 && ov.o && un.o) {
    out['TO' + lin(ov.l)] = sube(ov.o); out['TU' + lin(ov.l)] = sube(un.o); hayT = true;
  }
  // sin DraftKings: linea calculada (siempre N,5) y cuotas del modelo con el margen de siempre
  const par = (si, no, q) => { const [a, , b] = fromProbs([q, null, 1 - q]); out[si] = sube(a); out[no] = sube(b) };
  if (!hayH && p1 > 0.03 && p1 < 0.97) {
    const mu = ninv(p1) * 12.5, l = Math.floor(mu) + 0.5;                       // ventaja esperada del local; linea N,5 de al lado
    if (Math.abs(l) < 30) par('SP1' + conSigno(-l), 'SP2' + conSigno(l), ncdf((mu - l) / 12.5));
  }
  if (!hayT) {
    const avg = (x) => Number((x.statistics || []).find((s) => s.name === 'avgPoints')?.displayValue);
    const [h, a] = ['home', 'away'].map((k) => c.competitors.find((x) => x.homeAway === k));
    const L = avg(h) + avg(a);
    if (L > 170 && L < 290) { const l = Math.floor(L) + 0.5; par('TO' + lin(l), 'TU' + lin(l), ncdf((L - l) / 18)) }
  }
  return out;
}

// ---------- props de jugadores de DraftKings ----------
// lados: {id: '1'|'2'} (quien juega en cada equipo). Devuelve { mk: {codigo: cuota}, ids: Set }
async function propsDk(ev, lados, ctx) {
  const { getJson, sube } = ctx, items = [];
  for (let pg = 1; pg <= 4; pg++) {
    const d = await getJson(`${CORE}/events/${ev}/competitions/${ev}/odds/100/propBets?limit=1000&page=${pg}`);
    if (!d?.items) break;
    items.push(...d.items);
    if (!(d.pageCount > pg)) break;
  }
  const ath = (i) => String(i.athlete?.$ref || '').match(/athletes\/(\d+)/)?.[1] || null;
  const dec = (i) => { const x = Number(i.odds?.decimal?.value); return x > 1.01 && x < 30 ? Math.min(25, x) : null };
  const pares = new Map(), hitos = new Map();
  for (const i of items) {
    const a = ath(i), t = String(i.type?.id || ''); if (!a) continue;
    if (TIPO[t]) { const k = TIPO[t] + ':' + a; if (!pares.has(k)) pares.set(k, []); pares.get(k).push(i) }
    for (const [s, h] of Object.entries(HITO)) if (t === h) hitos.set(`${s}:${a}:${Number(i.current?.target?.value)}`, dec(i));
  }
  const mk = {}, ids = new Set();
  for (const [k, xs] of pares) {
    if (xs.length !== 2) continue;
    const [s, a] = k.split(':'), side = lados[a]; if (!side) continue;
    const L = Number(xs[0].current?.target?.value ?? xs[0].odds?.total?.value);
    if (!(L > 0 && L < 100 && L % 1 === 0.5) || Number(xs[1].current?.target?.value ?? xs[1].odds?.total?.value) !== L) continue;
    let [o, u] = [dec(xs[0]), dec(xs[1])]; if (!o || !u) continue;
    const h = hitos.get(`${s}:${a}:${L + 0.5}`);                               // "18+" cuesta lo mismo que "mas de 17,5"
    if (h && Math.abs(h - u) + 0.02 < Math.abs(h - o)) [o, u] = [u, o];
    mk[`J${side}:${a}:${s}O${lin(L)}`] = sube(o); mk[`J${side}:${a}:${s}U${lin(L)}`] = sube(u); ids.add(a);
  }
  return { mk, ids };
}

// ---------- modelo de jugadores (sin props de DraftKings) ----------
// Ficha de cada equipo (sus ultimos 6 partidos) en la tabla teams (db/006) con la clave nba:<id>. sync_teams_get solo
// devuelve los campos t, w, g y f del jsonb, asi que la ficha va dentro de f: { f: { j: { id: [n, min, [medias], [desv]] } } }
async function fichasNba(equipos, ctx) {
  const { getJson, rpc, secret, dry } = ctx;
  const ids = [...new Set(equipos)].map((x) => 'nba:' + x);
  if (!ids.length) return {};
  let cache = {};
  if (secret) { try { cache = (await rpc('sync_teams_get', { p_secret: secret, p_ids: ids })) || {} } catch {} }
  const viejas = ids.filter((k) => !cache[k]?.f?.j || Date.now() - cache[k].t > FICHA_VIEJA).slice(0, FICHAS_POR_PASADA), nuevas = {};
  for (const k of viejas) {
    const tid = k.split(':')[1];
    const sc = await getJson(`${BASE}/teams/${tid}/schedule`);
    const evs = (sc?.events || []).filter((e) => e.competitions?.[0]?.status?.type?.completed).sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 6);
    const hs = await enTandas(evs, 3, async (e) => hoja(await getJson(`${BASE}/summary?event=${e.id}`), tid));
    const pj = {};
    for (const h of hs) for (const [id, v] of Object.entries(h.bx)) {
      if (h.lados[id] !== '1') continue;                                      // hoja() pone '1' a los de tid
      (pj[id] = pj[id] || { n: h.nombres[id], g: [], min: [] }).g.push([...v, v[0] + v[1] + v[2]]); pj[id].min.push(h.min[id] || 0);
    }
    const j = {};
    for (const [id, x] of Object.entries(pj)) {
      if (x.g.length < 3) continue;
      const media = [0, 1, 2, 3, 4].map((i) => x.g.reduce((t, r) => t + r[i], 0) / x.g.length);
      const desv = [0, 1, 2, 3, 4].map((i) => Math.sqrt(x.g.reduce((t, r) => t + (r[i] - media[i]) ** 2, 0) / (x.g.length - 1)));
      const min = x.min.reduce((t, m) => t + m, 0) / x.min.length;
      if (min >= 22) j[id] = [x.n, Math.round(min), media.map((v) => Math.round(v * 10) / 10), desv.map((v) => Math.round(v * 10) / 10)];
    }
    nuevas[k] = { w: null, g: hs.length, f: { j } };
  }
  if (secret && !dry && Object.keys(nuevas).length) { try { await rpc('sync_teams_put', { p_secret: secret, p_rows: Object.entries(nuevas).map(([id, data]) => ({ id, data })) }) } catch {} }
  const out = {};
  for (const k of ids) { const x = nuevas[k] || cache[k]; if (x?.f?.j) out[k.split(':')[1]] = x.f.j }
  return out;
}
// lineas N,5 alrededor de la media y la probabilidad de pasarla con una normal (dispersion minima por si salen pocos partidos)
export function propsModelo(fichas, tidLocal, tidVisit, ctx) {
  const { sube, fromProbs } = ctx, mk = {}, ids = new Set();
  for (const [side, tid] of [['1', tidLocal], ['2', tidVisit]]) {
    const js = Object.entries(fichas[tid] || {}).sort((a, b) => b[1][1] - a[1][1]).slice(0, 6);
    for (const [id, [, , media, desv]] of js) {
      ['P', 'R', 'A', 'T', 'X'].forEach((s, i) => {
        const mu = media[i]; if (!(mu >= 1.5)) return;
        const sd = Math.max(desv[i] || 0, 0.55 * Math.sqrt(mu) + 0.6), L = Math.floor(mu) + 0.5;
        const q = Math.min(0.8, Math.max(0.2, ncdf((mu - L) / sd)));
        const [o, , u] = fromProbs([q, null, 1 - q]);
        mk[`J${side}:${id}:${s}O${lin(L)}`] = sube(o); mk[`J${side}:${id}:${s}U${lin(L)}`] = sube(u); ids.add(id);
      });
    }
  }
  return { mk, ids };
}

// ---------- los partidos ----------
export async function nba(ctx) {
  const { getJson, sube, american, fromProbs, tvEspn } = ctx, NOW = ctx.now || Date.now();
  const dias = Array.from({ length: PASADO + FUTURO + 1 }, (_, i) => ymd(NOW + (i - PASADO) * DAY));
  const sbs = await Promise.all(dias.map((d) => getJson(`${BASE}/scoreboard?dates=${d}&limit=100`)));
  const evs = [...new Map(sbs.flatMap((d) => d?.events || []).map((e) => [e.id, e])).values()];
  const filas = [];
  for (const e of evs) {
    const c = e.competitions?.[0]; if (!c) continue;
    const t = Date.parse(c.date || e.date); if (!(t > NOW - PASADO * DAY && t < NOW + FUTURO * DAY)) continue;
    const h = c.competitors?.find((x) => x.homeAway === 'home'), a = c.competitors?.find((x) => x.homeAway === 'away');
    if (!h?.team || !a?.team) continue;
    const st = c.status?.type || {};
    let status = /CANCELED|POSTPONED|SUSPENDED|FORFEIT|DELAYED/.test(st.name || '') ? 'canceled' : st.state === 'post' && st.completed ? 'final' : st.state === 'in' || st.state === 'post' ? 'live' : 'scheduled';
    const sh = Number(h.score), sa = Number(a.score);
    const nota = String(c.notes?.[0]?.headline || '').replace(/\s+[-–—]\s+/g, ' · ').replace(/-/g, ' ').trim();
    const row = {
      id: `espn:nba:${e.id}`, sport: 'b', league: 'nba', league_name: 'NBA',
      league_logo: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500-dark/nba.png&w=64&h=64',
      stage: nota || null, tag: /final|playoff|play in|cup/i.test(nota) ? nota : null, venue: c.venue?.fullName || null,
      home: h.team.shortDisplayName || h.team.displayName, away: a.team.shortDisplayName || a.team.displayName,
      home_logo: logoEq(h.team), away_logo: logoEq(a.team),
      starts_at: new Date(t).toISOString(), status,
      score: status === 'live' || status === 'final' ? `${isFinite(sh) ? sh : 0}:${isFinite(sa) ? sa : 0}` : null,
      winner: status === 'final' && isFinite(sh) && isFinite(sa) && sh !== sa ? (sh > sa ? '1' : '2') : null,
      details: {
        espn: { sport: 'basketball', league: 'nba', event: e.id, ids: { a: h.team.id, b: a.team.id } },
        tv: tvEspn(c),
        tape: [
          [recDe(h, 'total').replace(/-/g, '·'), 'Récord', recDe(a, 'total').replace(/-/g, '·')],
          [recDe(h, 'home').replace(/-/g, '·'), 'Casa · fuera', recDe(a, 'road').replace(/-/g, '·')],
        ].filter((r) => r[0] || r[2]),
      },
    };
    if (status === 'final' && !row.winner) row.status = 'canceled';            // un empate en la NBA no existe: algo va mal, se devuelve
    if (status === 'scheduled') {
      const ml = c.odds?.[0]?.moneyline;
      let o = ml ? [american(ml.home?.close?.odds ?? ml.home?.open?.odds), american(ml.away?.close?.odds ?? ml.away?.open?.odds)] : null;
      if (o && o.every(Boolean)) row.odds_src = 'draftkings';
      else {                                                                   // modelo: record de los dos y ventaja de jugar en casa
        const pct = (r) => (r ? (r.w + 5) / (r.w + r.l + 10) : 0.5), x = pct(rec(recDe(h, 'total'))), y = pct(rec(recDe(a, 'total')));
        const p = 1 / (1 + Math.exp(-(0.6 * (Math.log(x / (1 - x)) - Math.log(y / (1 - y))) + 0.2)));      // a medias: el record de pocas semanas engaña
        const [p1, , p2] = fromProbs([p, null, 1 - p]); o = [p1, p2]; row.odds_src = 'modelo';
      }
      const p1 = (1 / o[0]) / (1 / o[0] + 1 / o[1]);
      [row.odds_1, row.odds_x, row.odds_2] = [sube(o[0]), null, sube(o[1])];
      row.odds_mk = mercadosPartido(c, p1, ctx);
    }
    filas.push({ row, c, h, a, t });
  }

  // jugadores: nombres (plantillas de los dos), props, hoja final
  const conJug = filas.filter(({ row, t }) => row.status === 'live' || row.status === 'final' || (row.status === 'scheduled' && t < NOW + PROPS_ANTES));
  const plantillas = new Map();
  const plantilla = async (tid) => {
    if (!plantillas.has(tid)) plantillas.set(tid, getJson(`${BASE}/teams/${tid}/roster`).then((d) => Object.fromEntries((d?.athletes || []).map((x) => [String(x.id), x.displayName || x.fullName || '']))));
    return plantillas.get(tid);
  };
  const sinProps = [];
  await enTandas(conJug, 4, async (f) => {
    const { row, h, a, t } = f, ev = row.details.espn.event;
    const [ph, pa] = await Promise.all([plantilla(h.team.id), plantilla(a.team.id)]);
    const lados = {}; for (const id of Object.keys(ph || {})) lados[id] = '1'; for (const id of Object.keys(pa || {})) lados[id] = '2';
    const pj = { ...(pa || {}), ...(ph || {}) };
    if (row.status === 'scheduled') {
      const p = await propsDk(ev, lados, ctx).catch(() => ({ mk: {}, ids: new Set() }));
      if (Object.keys(p.mk).length) Object.assign(row.odds_mk, p.mk);
      else sinProps.push(f);
    } else if (row.status === 'final') {
      const d = await getJson(`${BASE}/summary?event=${ev}`), x = hoja(d, h.team.id);
      Object.assign(pj, x.nombres);
      if (x.ok) { row.details.bx = x.bx; row.details.bxok = true }
      else if (NOW - t < SIN_HOJA) row.status = 'live';                          // sin hoja todavia: se paga en la siguiente vuelta
      else { row.details.bx = x.bx; row.details.bxok = false }                    // sin hoja ni a la de 8 h: las de jugadores se devuelven
    }
    if (Object.keys(pj).length) row.details.pj = pj;
  });
  // sin props de DraftKings: el modelo con los ultimos partidos de cada uno (fichas guardadas, 3 equipos nuevos por pasada)
  if (sinProps.length) {
    const fichas = await fichasNba(sinProps.flatMap((f) => [f.h.team.id, f.a.team.id]), ctx).catch(() => ({}));
    for (const f of sinProps) {
      const p = propsModelo(fichas, String(f.h.team.id), String(f.a.team.id), ctx);
      if (Object.keys(p.mk).length) { Object.assign(f.row.odds_mk, p.mk); f.row.details.pjm = true }
      for (const id of p.ids) if (!f.row.details.pj?.[id]) (f.row.details.pj = f.row.details.pj || {})[id] = (fichas[f.h.team.id]?.[id] || fichas[f.a.team.id]?.[id])?.[0] || '';
    }
  }
  return filas.map((f) => f.row);
}

// ---------- directo: marcador, cuarto, reloj y lo de cada jugador (ex_live, db/024 y 039) ----------
export async function liveNba(rows, { getJson, ponLive }) {
  const out = [];
  await enTandas(rows.filter((x) => x.sport === 'b' && x.status === 'live' && x.details?.espn?.event), 4, async (r) => {
    const d = await getJson(`${BASE}/summary?event=${r.details.espn.event}`);
    const c = d?.header?.competitions?.[0], st = c?.status; if (!st || st.type?.state !== 'in') return;
    const h = c.competitors?.find((x) => x.homeAway === 'home'), a = c.competitors?.find((x) => x.homeAway === 'away'); if (!h || !a) return;
    const x = hoja(d, h.team?.id ?? h.id);
    out.push({ match: r.id, data: { k: 'b', hs: Number(h.score) || 0, as: Number(a.score) || 0, per: Number(st.period) || 1, clk: Math.max(0, Math.round(Number(st.clock) || 0)), pj: x.bx } });
  });
  return ponLive(out);
}
