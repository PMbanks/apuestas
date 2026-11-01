// Sincronizador: trae partidos, cuotas y resultados (ESPN para futbol y UFC, PandaScore para Valorant y CS2),
// los guarda en Supabase, revela las apuestas al empezar y paga las apuestas de los partidos acabados.
// Lo lanza GitHub Actions cada 15 minutos. Con DRY=1 solo cuenta lo que haria, sin tocar Supabase.
//   SUPABASE_URL, SUPABASE_ANON_KEY, SYNC_SECRET, PANDASCORE_KEY
//   DISCORD_WEBHOOK (opcional): si existe, avisos en Discord (sync/discord.mjs, db/021_discord.sql)
// Con SOLO_DISCORD=1 hace nada mas que los avisos de Discord (para probarlos).
import { avisos } from './discord.mjs';
import { equiposExtra } from './equipos-extra.mjs';

const SB = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SECRET = process.env.SYNC_SECRET, PS = process.env.PANDASCORE_KEY;
const DRY = !!process.env.DRY;
const DAY = 864e5, NOW = Date.now();
const UA = { 'user-agent': 'apuestas-colegas/1.0' };

const SOCCER = [
  ['esp.1', 'LaLiga'], ['eng.1', 'Premier League'], ['ger.1', 'Bundesliga'], ['ita.1', 'Serie A'], ['fra.1', 'Ligue 1'],
  // PM, 30-10 noche: fuera FA Cup, MLS, Conference League, Eredivisie, Brasileirao, Liga MX y Liga Portugal (db/028 borra lo que habia)
  ['uefa.champions', 'Champions League'], ['uefa.europa', 'Europa League'],
  ['esp.copa_del_rey', 'Copa del Rey'], ['esp.2', 'LaLiga Hypermotion'], ['arg.1', 'Liga Argentina'],
  ['sau.1', 'Saudi Pro League'], ['uefa.nations', 'Nations League'], ['fifa.worldq.uefa', 'Clasificación Mundial'], ['fifa.friendly', 'Amistosos'],
];
const SOCCER_PAST = 3 * DAY, SOCCER_AHEAD = 10 * DAY, UFC_AHEAD = 70 * DAY;
const MARGIN = 1.06;

const getJson = async (url, headers = {}) => {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { ...UA, ...headers } });
      if (r.ok) return await r.json();
      if (r.status < 500 && r.status !== 429) return null;
    } catch {}
    await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
  }
  return null;
};

// ---------- cuotas ----------
const r2 = (x) => Math.round(x * 100) / 100;
const clampOdds = (o) => r2(Math.min(25, Math.max(1.03, o)));
const american = (s) => {
  const n = parseFloat(String(s ?? '').replace('+', ''));
  if (!isFinite(n) || n === 0) return null;
  return clampOdds(n > 0 ? 1 + n / 100 : 1 + 100 / -n);
};
const fromProbs = (ps) => ps.map((p) => (p == null ? null : clampOdds(1 / (Math.max(0.02, p) * MARGIN))));
// dos rivales con su porcentaje de victorias (log5)
const log5 = (a, b) => (a - a * b) / Math.max(1e-6, a + b - 2 * a * b);
const twoWay = (a, b) => {
  const p = log5(a, b);
  return fromProbs([p, null, 1 - p]);
};

// ---------- mercados nuevos (db/036_mercados.sql): mas/menos goles, ambos marcan y mapas ----------
// Todo sale del mismo 1X2 del partido, para que las cuotas sean coherentes entre si, con el margen de siempre (fromProbs) y
// el +5 % (sube). La linea de goles que traiga DraftKings (ESPN) va con su cuota de verdad.
const fact = (n) => (n <= 1 ? 1 : n * fact(n - 1));
const pois = (l, k) => Math.exp(-l) * l ** k / fact(k);
const pMas = (L, linea) => { let t = 0; for (let k = 0; k <= Math.floor(linea); k++) t += pois(L, k); return 1 - t };   // P(goles > linea)
const p1x2 = (lh, la) => { const r = [0, 0, 0]; for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) r[i > j ? 0 : i === j ? 1 : 2] += pois(lh, i) * pois(la, j); return r };
// parte de los goles del local para que P(gana el local) / P(gana alguno) cuadre con el 1X2
const reparto = (L, q) => { let lo = 0.03, hi = 0.97; for (let i = 0; i < 30; i++) { const s = (lo + hi) / 2, [a, , c] = p1x2(L * s, L * (1 - s)); if (a / (a + c) < q) lo = s; else hi = s } return (lo + hi) / 2 };
const mkPar = (out, si, no, p, minimo = 0.06) => { if (p < minimo || p > 1 - minimo) return; const [a, , b] = fromProbs([p, null, 1 - p]); out[si] = sube(a); out[no] = sube(b) };
const lin = (x) => String(x);                                                              // 2.5 -> "2.5" (los codigos de la base)
// futbol. o: cuotas 1, X, 2 sin el +5 % (DraftKings o modelo). tot: {linea, over, under} de DraftKings o null. real: el 1X2 es de
// DraftKings (si es del modelo de la forma, su empate es una estimacion y los goles esperados van fijos a 2,6)
function mercadosFutbol(o, tot, real) {
  if (!o || !o.every((x) => x > 1)) return {};
  const inv = o.map((x) => 1 / x), s = inv[0] + inv[1] + inv[2], [p1, px, p2] = inv.map((x) => x / s), q = p1 / (p1 + p2);
  let L;
  if (tot) {                                                                               // goles esperados: los que dice la linea de DraftKings
    const po = (1 / tot.over) / (1 / tot.over + 1 / tot.under); let lo = 0.3, hi = 7;
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (pMas(m, tot.linea) < po) lo = m; else hi = m }
    L = (lo + hi) / 2;
  } else if (!real) L = 2.6;
  else {                                                                                   // sin linea: los que hacen que el empate cuadre con el del 1X2
    let lo = 1.6, hi = 4.2;
    for (let i = 0; i < 25; i++) { const m = (lo + hi) / 2, sh = reparto(m, q), x = p1x2(m * sh, m * (1 - sh))[1]; if (x > px) lo = m; else hi = m }
    L = Math.min(3.4, Math.max(2.0, (lo + hi) / 2));
  }
  const sh = reparto(L, q), lh = L * sh, la = L * (1 - sh), out = {};
  for (const l of [1.5, 2.5, 3.5]) {
    if (tot && tot.linea === l) { out['O' + lin(l)] = sube(tot.over); out['U' + lin(l)] = sube(tot.under); continue }
    mkPar(out, 'O' + lin(l), 'U' + lin(l), pMas(L, l));
  }
  mkPar(out, 'GG', 'NG', (1 - Math.exp(-lh)) * (1 - Math.exp(-la)));
  return out;
}
// la linea de goles de DraftKings (ESPN): solo lineas N,5 con cuota a los dos lados
function totalDk(c) {
  const t = c.odds?.[0]?.total; if (!t) return null;
  const lado = (x) => ({ l: parseFloat(String(x?.close?.line ?? x?.open?.line ?? '').replace(/^[ou]/i, '')), o: american(x?.close?.odds ?? x?.open?.odds) });
  const ov = lado(t.over), un = lado(t.under);
  if (!(ov.l > 0) || ov.l !== un.l || ov.l % 1 !== 0.5 || ov.l > 6.5 || !ov.o || !un.o) return null;
  return { linea: ov.l, over: ov.o, under: un.o };
}
// el resultado de los 90 minutos (db/036: goles y ambos marcan se pagan con el, sin prorroga ni penaltis). Sin prorroga es el
// marcador. Con prorroga sale del minuto de cada gol (ESPN pone el descuento de la segunda parte en 90:00 = 5400 s y la prorroga
// despues); si los goles no cuadran con el marcador o alguno no trae minuto, null (la base devuelve esas apuestas)
function r90(c, h, a, sh, sa) {
  if (!isFinite(sh) || !isFinite(sa)) return null;
  const st = c.status || {}, prorroga = (Number(st.period) || 0) > 2 || /AET|PEN|EXTRA|SHOOTOUT/i.test(st.type?.name || '');
  if (!prorroga) return `${sh}:${sa}`;
  const g = (c.details || []).filter((d) => d.scoringPlay && !d.shootout);
  if (g.some((d) => !isFinite(Number(d.clock?.value)))) return null;
  const de = (id) => g.filter((d) => String(d.team?.id) === String(id));
  if (de(h.team.id).length !== sh || de(a.team.id).length !== sa) return null;
  const en90 = (d) => Number(d.clock.value) <= 5400;
  return `${de(h.team.id).filter(en90).length}:${de(a.team.id).filter(en90).length}`;
}
// series al mejor de bo (3 o 5). p: probabilidad de que gane la serie el local. Mapas independientes con la probabilidad por
// mapa que da esa p (como el cash out de la base): resultado exacto, +1,5 mapas de cada uno, si se juega el ultimo mapa y
// (db/037) quien gana cada mapa. Gana todos los mapas es el resultado exacto sin perder mapa (S2-0, S0-2, S3-0, S0-3)
const comb = (n, k) => fact(n) / (fact(k) * fact(n - k));
function mercadosSerie(p, bo) {
  if (!(p > 0 && p < 1) || (bo !== 3 && bo !== 5)) return {};
  const need = (bo + 1) / 2, serie = (pm) => { let t = 0; for (let k = 0; k < need; k++) t += comb(need - 1 + k, k) * pm ** need * (1 - pm) ** k; return t };
  let lo = 0.01, hi = 0.99;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (serie(m) < p) lo = m; else hi = m }
  const pm = (lo + hi) / 2, ex = {}, out = {};
  for (let k = 0; k < need; k++) {
    ex[`S${need}-${k}`] = comb(need - 1 + k, k) * pm ** need * (1 - pm) ** k;
    ex[`S${k}-${need}`] = comb(need - 1 + k, k) * (1 - pm) ** need * pm ** k;
  }
  for (const [c, q] of Object.entries(ex)) if (q >= 0.02) out[c] = sube(fromProbs([q])[0]);
  const suma = (f) => Object.entries(ex).filter(([c]) => f(+c[1], +c[3])).reduce((t, [, q]) => t + q, 0);
  for (const lado of [1, 2]) { const q = 1 - suma((x, y) => (lado === 1 ? x - y : y - x) <= -2); if (q >= 0.04 && q <= 0.96) out[`H${lado}+1.5`] = sube(fromProbs([q])[0]) }
  mkPar(out, `MO${lin(bo - 0.5)}`, `MU${lin(bo - 0.5)}`, suma((x, y) => x + y === bo));
  for (let k = 1; k <= bo; k++) mkPar(out, `W${k}-1`, `W${k}-2`, pm);                  // db/037: ganador de cada mapa (Wk-1 local, Wk-2 visitante), con la probabilidad por mapa
  return out;
}
// futbol: puntos por partido de cada uno + ventaja de jugar en casa
const soccerModel = (ppgH, ppgA) => {
  const d = ppgH - ppgA + 0.3;
  const draw = Math.min(0.3, Math.max(0.16, 0.28 - 0.06 * Math.abs(d)));
  const ph = 1 / (1 + Math.exp(-1.25 * d));
  return fromProbs([(1 - draw) * ph, draw, (1 - draw) * (1 - ph)]);
};
const parseRecord = (s) => { const [w, d, l] = String(s || '').split('-').map(Number); return isFinite(w) ? { w, d: d || 0, l: l || 0 } : null; };
const formEs = (f) => String(f || '').toUpperCase().replace(/[^WDL]/g, '').slice(-5).replace(/W/g, 'G').replace(/D/g, 'E').replace(/L/g, 'P');

// donde verlo: canales y plataformas de ESPN con su idioma (en, es)
const tvEspn = (c) => {
  const seen = new Set(), out = [];
  for (const b of [...(c.geoBroadcasts || []), ...(c.broadcasts || [])]) {
    const n = b.media?.shortName || (Array.isArray(b.names) ? b.names[0] : null);
    // ESPN marca casi todo como 'en': los canales en espanol se reconocen por su nombre
    const l = /deportes|univision|unim[aá]s|tudn|telemundo|universo|vix|espa[nñ]ol/i.test(n) ? 'es' : b.lang || 'en';
    if (!n || seen.has(n + l)) continue;
    seen.add(n + l); out.push({ n, l, t: b.type?.shortName === 'Streaming' || b.type?.shortName === 'STREAMING' ? 'stream' : 'tv' });
  }
  return out.slice(0, 8);
};

// ---------- futbol (ESPN) ----------
const espnDark = (kind, id, size) => `https://a.espncdn.com/combiner/i?img=/i/${kind}/soccer/500-dark/${id}.png&w=${size}&h=${size}`;
async function soccer() {
  const months = [...new Set([0, SOCCER_AHEAD].map((o) => new Date(NOW + o).toISOString().slice(0, 7).replace('-', '')))];
  months.unshift(new Date(NOW - SOCCER_PAST).toISOString().slice(0, 7).replace('-', ''));
  const out = [];
  for (const [lg, name] of SOCCER) {
    for (const mo of [...new Set(months)]) {
      const d = await getJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${lg}/scoreboard?dates=${mo}&limit=1000`);
      if (!d?.events) continue;
      const lgId = (d.leagues?.[0]?.logos?.[0]?.href || '').match(/\/(\d+)\.png/)?.[1];
      for (const e of d.events) {
        const c = e.competitions?.[0]; if (!c) continue;
        const t = Date.parse(c.date || e.date);
        if (!(t > NOW - SOCCER_PAST && t < NOW + SOCCER_AHEAD)) continue;
        const h = c.competitors.find((x) => x.homeAway === 'home'), a = c.competitors.find((x) => x.homeAway === 'away');
        if (!h || !a) continue;
        const st = c.status?.type || {};
        const status = /CANCELED|POSTPONED|ABANDONED|FORFEIT/.test(st.name || '') ? 'canceled' : st.state === 'post' && st.completed ? 'final' : st.state === 'in' ? 'live' : st.state === 'post' ? 'live' : 'scheduled';
        const sh = Number(h.score), sa = Number(a.score);
        const row = {
          id: `espn:${lg}:${e.id}`, sport: 'f', league: lg, league_name: name,
          league_logo: lgId ? espnDark('leaguelogos', lgId, 64) : null,
          stage: c.notes?.[0]?.headline || null, venue: c.venue?.fullName || null,
          home: h.team.shortDisplayName || h.team.displayName, away: a.team.shortDisplayName || a.team.displayName,
          home_logo: espnDark('teamlogos', h.team.id, 96), away_logo: espnDark('teamlogos', a.team.id, 96),
          starts_at: new Date(t).toISOString(), status,
          score: status === 'live' || status === 'final' ? `${isFinite(sh) ? sh : 0}:${isFinite(sa) ? sa : 0}` : null,
          winner: status === 'final' ? (sh > sa ? '1' : sh < sa ? '2' : 'X') : null,
          details: {
            espn: { sport: 'soccer', league: lg, event: e.id, ids: { a: h.team.id, b: a.team.id } },
            tv: tvEspn(c),
            tape: [
              [formEs(h.form) ? 'F:' + formEs(h.form) : '', 'Forma', formEs(a.form) ? 'F:' + formEs(a.form) : ''],
              [h.records?.[0]?.summary?.replace(/-/g, '·') || '', 'G · E · P', a.records?.[0]?.summary?.replace(/-/g, '·') || ''],
            ].filter((r) => r[0] || r[2]),
          },
        };
        if (status === 'scheduled') {
          const ml = c.odds?.[0]?.moneyline;
          let o = ml ? [american(ml.home?.close?.odds ?? ml.home?.open?.odds), american(ml.draw?.close?.odds ?? ml.draw?.open?.odds), american(ml.away?.close?.odds ?? ml.away?.open?.odds)] : null;
          if (o && o.every(Boolean)) row.odds_src = 'draftkings';
          else {
            const rh = parseRecord(h.records?.[0]?.summary), ra = parseRecord(a.records?.[0]?.summary);
            const ppg = (r) => (r && r.w + r.d + r.l ? (3 * r.w + r.d) / (r.w + r.d + r.l) : 1.35);
            o = soccerModel(ppg(rh), ppg(ra)); row.odds_src = 'modelo';
          }
          [row.odds_1, row.odds_x, row.odds_2] = o.map(sube);
          row.odds_mk = mercadosFutbol(o, totalDk(c), row.odds_src === 'draftkings');                                  // db/036: goles y ambos marcan
        }
        if (status === 'final') row.details.r90 = r90(c, h, a, sh, sa);                   // db/036: con esto se pagan
        out.push(row);
      }
    }
  }
  return out;
}

// ---------- UFC (ESPN) ----------
async function ufc() {
  const ymd = (t) => new Date(t).toISOString().slice(0, 10).replace(/-/g, '');
  const d = await getJson(`https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates=${ymd(NOW - 3 * DAY)}-${ymd(NOW + UFC_AHEAD)}&limit=200`);
  const out = [];
  for (const e of d?.events || []) {
    const comps = e.competitions || [];
    comps.forEach((c, i) => {
      const [x, y] = [...c.competitors].sort((p, q) => (p.order || 0) - (q.order || 0));
      if (!x?.athlete || !y?.athlete) return;
      const st = c.status?.type || {};
      const done = st.state === 'post' && st.completed;
      const status = /CANCELED|POSTPONED/.test(st.name || '') ? 'canceled' : done ? (x.winner || y.winner ? 'final' : 'canceled') : st.state === 'in' ? 'live' : 'scheduled';
      const face = (a) => `https://a.espncdn.com/i/headshots/mma/players/full/${a.id}.png`;
      const rx = parseRecord(x.records?.[0]?.summary), ry = parseRecord(y.records?.[0]?.summary);
      const row = {
        id: `espn:ufc:${c.id}`, sport: 'u', league: 'ufc', league_name: 'UFC', league_logo: null,
        stage: [c.type?.abbreviation, e.shortName || e.name].filter(Boolean).join(' · '),
        tag: i === comps.length - 1 ? 'Combate estelar' : i >= comps.length - 5 ? 'Cartelera principal' : null,
        venue: c.venue?.fullName || e.venues?.[0]?.fullName || null,
        home: x.athlete.displayName, away: y.athlete.displayName, home_logo: face(x), away_logo: face(y),
        starts_at: new Date(Date.parse(c.date || e.date)).toISOString(), status,
        score: done ? (c.status?.result?.shortDisplayName || st.shortDetail || null) : null,
        winner: status === 'final' ? (x.winner ? '1' : '2') : null,
        details: { espn: { sport: 'mma', league: 'ufc', event: e.id, ids: { a: x.id, b: y.id } }, tv: tvEspn(c).length ? tvEspn(c) : tvEspn(e.competitions?.[comps.length - 1] || {}), tape: [[x.records?.[0]?.summary?.replace(/-/g, '·') || '', 'Récord', y.records?.[0]?.summary?.replace(/-/g, '·') || '']].filter((r) => r[0] || r[2]) },
      };
      if (status === 'scheduled') {
        const pct = (r) => (r ? (r.w + 1) / (r.w + r.l + r.d + 2) : 0.5);
        [row.odds_1, row.odds_x, row.odds_2] = twoWay(pct(rx), pct(ry)).map(sube);
        row.odds_src = 'modelo';
      }
      out.push(row);
    });
  }
  return out;
}

// caras oficiales de la UFC (ufc.com): la foto de su ficha. Una vez por hora como mucho; la base guarda la ultima buena
const slugUfc = (n) => String(n).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
async function caraUfc(nombre) {
  try {
    const r = await fetch(`https://www.ufc.com/athlete/${slugUfc(nombre)}`, { headers: { 'user-agent': 'Mozilla/5.0 (apuestas-colegas)' } });
    if (!r.ok) return null;
    const html = await r.text();
    const ap = String(nombre).normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(' ').pop().toUpperCase();
    const urls = [...html.matchAll(/https:\/\/(?:www\.)?ufc\.com\/images\/[^"' )]+?\.png(?:\?itok=[\w-]+)?/g)].map((m) => m[0]);
    return urls.find((u) => /athlete_bio_full_body|event_results_athlete_headshot/.test(u) && u.toUpperCase().includes(ap)) || urls.find((u) => u.toUpperCase().includes(ap)) || null;
  } catch { return null; }
}
async function carasUfc(rows) {
  if (!process.env.FORCE_FACES && new Date().getUTCMinutes() >= 10) return;
  const vivos = rows.filter((r) => r.sport === 'u' && r.status === 'scheduled' && Date.parse(r.starts_at) < NOW + 42 * DAY);
  for (const r of vivos) {
    for (const k of ['home', 'away']) {
      const u = await caraUfc(r[k]);
      if (u) r[k + '_logo'] = u;
      await new Promise((res) => setTimeout(res, 400));
    }
  }
}

// ---------- Valorant y CS2 (PandaScore) ----------
// Valorant: todo lo que haya (VCT, VCL, Game Changers, terceros). CS2: tiers s, a, b y c (el d son ligas minusculas).
// Cada equipo tiene ficha en la tabla teams (db/006): ultimos 10 resultados, pais, siglas y jugadores. Se refresca cada
// 12 h como mucho y 45 equipos por pasada, para no pasar del limite de PandaScore (1000 peticiones por hora)
const ES = {
  valorant: { sport: 'v', tiers: new Set(['s', 'a', 'b', 'c', 'd']), ahead: 14 * DAY, up: 2, past: 1 },
  csgo: { sport: 'c', tiers: new Set(['s', 'a', 'b', 'c']), ahead: 7 * DAY, up: 3, past: 3 },
};
const FICHA_VIEJA = 12 * 3600e3, FICHAS_POR_PASADA = 45;
const FUERA_ES = /gamers ?club|betboom/i;
const nombreLiga = (m) => {
  const l = m.league?.name || '', s = m.serie?.name || '';
  if (!s || s === l) return l || 'Torneo';
  return s.toLowerCase().startsWith(l.toLowerCase()) ? s : `${l} ${s}`;
};
async function esports(game) {
  const cfg = ES[game];
  if (!PS) return [];
  const H = { authorization: `Bearer ${PS}` };
  const base = `https://api.pandascore.co/${game}/matches`;
  const rango = `range[begin_at]=${new Date(NOW - 3 * DAY).toISOString()},${new Date(NOW).toISOString()}`;
  const listas = await Promise.all([
    ...Array.from({ length: cfg.up }, (_, i) => getJson(`${base}/upcoming?per_page=100&sort=begin_at&page=${i + 1}`, H)),
    getJson(`${base}/running?per_page=50`, H),
    ...Array.from({ length: cfg.past }, (_, i) => getJson(`${base}/past?per_page=100&sort=-begin_at&${rango}&page=${i + 1}`, H)),
  ]);
  const out = [];
  for (const m of listas.flatMap((x) => x || [])) {
    const t = Date.parse(m.begin_at || m.scheduled_at);
    if (!t || t > NOW + cfg.ahead || t < NOW - 3 * DAY) continue;
    const tier = m.tournament?.tier;
    if (tier && !cfg.tiers.has(tier)) continue;
    if (FUERA_ES.test(`${m.league?.name || ''} ${m.serie?.name || ''}`)) continue;           // PM, 01-11: fuera Gamers Club (CS2) y BetBoom (Valorant)
    const [A, B] = (m.opponents || []).map((o) => o.opponent);
    if (!A || !B) continue;
    const status = m.status === 'canceled' ? 'canceled' : m.status === 'finished' ? (m.winner_id ? 'final' : 'canceled') : m.status === 'running' ? 'live' : 'scheduled';
    const sc = (id) => m.results?.find((r) => r.team_id === id)?.score ?? 0;
    out.push({
      id: game === 'valorant' ? `ps:valorant:${m.id}` : `ps:${game}:${m.id}`, sport: cfg.sport,
      league: `ps:${game}:${m.serie?.id || m.league?.id || 'x'}`, league_name: nombreLiga(m),
      league_logo: m.league?.image_url || null, stage: [m.serie?.full_name, m.tournament?.name].filter(Boolean).join(' · ') || null,
      tag: tier === 's' ? 'Internacional' : null,
      home: A.name, away: B.name, home_logo: A.image_url || null, away_logo: B.image_url || null,
      starts_at: new Date(t).toISOString(), status, bo: m.number_of_games || null,
      score: status === 'live' || status === 'final' ? `${sc(A.id)}:${sc(B.id)}` : null,
      winner: status === 'final' ? (m.winner_id === A.id ? '1' : '2') : null,
      details: { ids: { a: A.id, b: B.id }, tier: tier || null, game, tour: m.tournament_id || null, bracket: !!m.tournament?.has_bracket,
        tv: (m.streams_list || []).filter((x) => x.raw_url).sort((x, y) => (/^(en|es)$/.test(y.language) - /^(en|es)$/.test(x.language)) || (y.main - x.main)).slice(0, 8)
          .map((x) => ({ n: /twitch/.test(x.raw_url) ? 'Twitch' : /youtube/.test(x.raw_url) ? 'YouTube' : /kick\.com/.test(x.raw_url) ? 'Kick' : 'Stream', l: x.language, u: x.raw_url, e: x.embed_url || null, main: !!x.main })),
        games: (m.games || []).map((g) => ({ n: g.position, st: g.status, w: g.winner?.id ?? null })),
        mt: m.match_type || null, ff: !!m.forfeit,                                          // db/036: los mapas solo se pagan al mejor de y sin abandono
        tape: [[m.number_of_games ? 'BO' + m.number_of_games : '', 'Formato', m.number_of_games ? 'BO' + m.number_of_games : '']].filter((r) => r[0] || r[2]) },
    });
  }
  return [...new Map(out.map((r) => [r.id, r])).values()];
}

// brackets de los torneos con eliminatorias (PM, 30-10: "si hay torneo con brackets que se vean bien").
// Se refrescan cada 30 min como mucho, 12 torneos por pasada; los que tienen partidos en directo, en cada pasada
async function bracketsEsports(rows) {
  if (!PS) return;
  const H = { authorization: `Bearer ${PS}` };
  const tours = new Map();
  for (const r of rows) if (r.details.bracket && r.details.tour) { const k = `${r.details.game}:${r.details.tour}`; tours.set(k, (tours.get(k) || false) || r.status === 'live') }
  if (!tours.size) return;
  let fresh = {};
  if (SECRET && SB) { try { fresh = (await rpc('sync_brackets_get', { p_secret: SECRET, p_ids: [...tours.keys()] })) || {} } catch {} }
  const toca = [...tours.entries()].filter(([k, vivo]) => vivo || !fresh[k] || NOW - fresh[k] > 30 * 60e3).map(([k]) => k).slice(0, 12);
  const filas = [];
  for (const k of toca) {
    const ms = await getJson(`https://api.pandascore.co/tournaments/${k.split(':')[1]}/brackets?per_page=100`, H);
    if (!Array.isArray(ms) || !ms.length) continue;
    const eq = (o) => (o ? { id: o.id, n: o.name, acr: o.acronym || null, img: o.image_url || null } : null);
    filas.push({ id: k, data: ms.map((m) => {
      const [A, B] = (m.opponents || []).map((o) => o.opponent), sc = (x) => (x ? m.results?.find((r) => r.team_id === x.id)?.score ?? null : null);
      return { id: m.id, name: m.name || '', st: m.status, at: m.begin_at || m.scheduled_at || null, bo: m.number_of_games || null,
        a: eq(A), b: eq(B), sa: sc(A), sb: sc(B), w: m.winner_id || null, prev: (m.previous_matches || []).map((x) => ({ t: x.type, id: x.match_id })) };
    }) });
  }
  if (filas.length && SECRET && SB && !DRY) await rpc('sync_brackets_put', { p_secret: SECRET, p_rows: filas });
  console.log(`brackets: ${tours.size} torneos · ${filas.length} refrescados`);
}

// fichas de los equipos: lee lo guardado, refresca lo viejo (primero los que juegan antes) y pone forma y cuotas
async function fichasEsports(rows) {
  if (!PS || !rows.length) return;
  const H = { authorization: `Bearer ${PS}` };
  const vivos = rows.filter((r) => r.status !== 'final' && r.status !== 'canceled').sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const ids = [...new Set(vivos.flatMap((r) => [`${r.details.game}:${r.details.ids.a}`, `${r.details.game}:${r.details.ids.b}`]))];
  let cache = {};
  if (SECRET && SB && ids.length) { try { cache = (await rpc('sync_teams_get', { p_secret: SECRET, p_ids: ids })) || {} } catch (e) { console.log('fichas: no se pudo leer', e.message) } }
  const viejas = ids.filter((k) => !cache[k] || NOW - cache[k].t > FICHA_VIEJA).slice(0, FICHAS_POR_PASADA);
  const nuevas = {};
  for (let i = 0; i < viejas.length; i += 5) {
    await Promise.all(viejas.slice(i, i + 5).map(async (k) => {
      const id = +k.split(':')[1];
      const ms = await getJson(`https://api.pandascore.co/teams/${id}/matches?filter[status]=finished&sort=-begin_at&per_page=10`, H);
      if (!Array.isArray(ms)) return;
      const hist = ms.filter((m) => m.winner_id).map((m) => {
        const otro = (m.opponents || []).map((o) => o.opponent).find((o) => o && o.id !== id);
        const sc = (x) => m.results?.find((r) => r.team_id === x)?.score ?? 0;
        return { vs: otro?.name || '?', vsId: otro?.id || null, logo: otro?.image_url || null, won: m.winner_id === id, score: `${sc(id)}:${sc(otro?.id)}`, at: m.begin_at, t: [m.league?.name, m.serie?.name].filter(Boolean).join(' ') };
      });
      const w = hist.filter((x) => x.won).length;
      nuevas[k] = { w, g: hist.length, f: hist.slice(0, 5).reverse().map((x) => (x.won ? 'G' : 'P')).join(''), hist };
    }));
  }
  // pais, siglas y jugadores de los equipos refrescados (una peticion por juego)
  for (const game of Object.keys(ES)) {
    const ks = Object.keys(nuevas).filter((k) => k.startsWith(game + ':'));
    for (let i = 0; i < ks.length; i += 100) {
      const ts = await getJson(`https://api.pandascore.co/${game}/teams?filter[id]=${ks.slice(i, i + 100).map((k) => k.split(':')[1]).join(',')}&per_page=100`, H);
      for (const t of ts || []) {
        const k = `${game}:${t.id}`; if (!nuevas[k]) continue;
        Object.assign(nuevas[k], { name: t.name, logo: t.image_url || null, loc: t.location || null, acr: t.acronym || null,
          players: (t.players || []).filter((p) => p.active !== false).map((p) => ({ n: p.name, img: p.image_url || null, nat: p.nationality || null, role: p.role || null, age: p.age || null, nombre: [p.first_name, p.last_name].filter(Boolean).join(' ') || null })) });
      }
    }
  }
  if (SECRET && SB && !DRY && Object.keys(nuevas).length) {
    const filas = Object.entries(nuevas).map(([id, data]) => ({ id, data }));
    for (let i = 0; i < filas.length; i += 50) await rpc('sync_teams_put', { p_secret: SECRET, p_rows: filas.slice(i, i + 50) });
  }
  const forma = (k) => nuevas[k] || cache[k] || null;
  for (const r of rows) {
    const fa = forma(`${r.details.game}:${r.details.ids.a}`), fb = forma(`${r.details.game}:${r.details.ids.b}`);
    if (fa?.f || fb?.f) r.details.tape.push([fa?.f ? 'F:' + fa.f : '', 'Forma', fb?.f ? 'F:' + fb.f : '']);
    if (r.status === 'scheduled') {
      const pct = (f) => (f?.g ? (f.w + 1) / (f.g + 2) : 0.5);
      [r.odds_1, r.odds_x, r.odds_2] = twoWay(pct(fa), pct(fb)).map(sube);
      r.odds_src = 'modelo';
      r.odds_mk = r.details.mt === 'best_of' ? mercadosSerie(log5(pct(fa), pct(fb)), r.bo) : {};   // db/036: mapas
    }
  }
  console.log(`fichas de equipos: ${Object.keys(cache).length} guardadas · ${Object.keys(nuevas).length} refrescadas`);
}

// ---------- predicciones rapidas, cuota mejorada y trofeos (db/022_extras.sql) ----------
// La base no ve ESPN ni vlr.gg: aqui se mira lo que ya paso y se le dice el veredicto de cada prediccion.
//  - Gol en 10 minutos (ESPN): cada gol trae la hora real (wallclock). Cuenta desde 1 minuto despues de apostar hasta 11;
//    si hay descanso en medio la ventana se alarga lo que dure; si el partido acaba antes y no hubo gol, se devuelve.
//  - Ronda de Valorant (vlr.gg, API abierta de orlandomm): el historial ronda a ronda dice quien gano la ronda N del mapa.
//    Ademas, cada pasada apunta en la base cuantas rondas lleva cada mapa en directo (ex_pred_obs): con eso la base rechaza
//    apuestas a rondas que ya se jugaron. PRED_WATCH_S=540 (maximo) repite esto cada 25 s durante la pasada y el hueco casi desaparece.
const VLR = 'https://vlr.orlandomm.net/api/v1';
const baseN = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const normN = (s) => { const x = baseN(s).replace(/\b(esports?|gaming|team|gc|club)\b/g, '').replace(/[^a-z0-9]/g, ''); return x.length >= 3 ? x : baseN(s).replace(/[^a-z0-9]/g, ''); };
const parecido = (a, b) => { a = normN(a); b = normN(b); if (!a || !b) return false; if (a === b) return true; return Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a)); };
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const horaMadrid = (t) => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(t));
let vlrLista = null;
const vlrMapas = (d) => (d.maps || []).filter((m) => m.name && !/all maps/i.test(m.name));
async function vlrBuscar(home, away, placedMs) {
  if (!vlrLista) vlrLista = [...((await getJson(`${VLR}/matches`))?.data || []), ...((await getJson(`${VLR}/results`))?.data || [])];
  const c = vlrLista.filter((x) => (x.teams || []).length === 2 && ((parecido(x.teams[0].name, home) && parecido(x.teams[1].name, away)) || (parecido(x.teams[0].name, away) && parecido(x.teams[1].name, home))));
  const ds = [];
  for (const x of c.slice(0, 4)) { const d = (await getJson(`${VLR}/matches/${x.id}`))?.data; if (d) ds.push(d); }
  ds.sort((a, b) => Math.abs((a.timestamp || 0) * 1000 - placedMs) - Math.abs((b.timestamp || 0) * 1000 - placedMs));
  return ds[0] || null;
}
// quien gano la ronda n del mapa ref: {res:'win'|'lose', ev} | {res:'void', ev} | null (todavia no se sabe)
function rondaGanador(d, ref, n, pick, home) {
  const maps = vlrMapas(d), i = maps.findIndex((m) => String(m.name).toLowerCase() === ref);
  if (i < 0) return null;
  const m = maps[i], rs = (m.rounds || []).filter((r) => r.score), k = rs.findIndex((r) => Number(r.number) === n);
  if (k >= 0) {
    const [p, q] = String(rs[k].score).split('-').map(Number), [pp, pq] = String(k ? rs[k - 1].score : '0-0').split('-').map(Number);
    if (p + q !== n || (k && Number(rs[k - 1].number) !== n - 1)) return null;           // datos que no cuadran: mejor esperar
    const w = p === pp + 1 && q === pq ? 0 : q === pq + 1 && p === pp ? 1 : null;
    if (w == null) return null;
    const homeIdx = parecido(d.teams?.[0]?.name, home) ? 0 : 1;
    return { res: (pick === '1') === (w === homeIdx) ? 'win' : 'lose', ev: `Ronda ${n} de ${m.name}: ${d.teams?.[w]?.name || '?'} (${p}-${q}), vlr.gg` };
  }
  if (maps.slice(i + 1).some((x) => (x.rounds || []).length) || !['live', 'upcoming'].includes(String(d.status).toLowerCase())) return { res: 'void', ev: `El mapa ${m.name} acabó antes de la ronda ${n}` };
  return null;
}
// lo que va por cada mapa en directo
async function obsValorant(vrows) {
  const out = [], live = [];
  for (const r of vrows.filter((x) => x.status === 'live')) {
    const d = await vlrBuscar(r.home, r.away, Date.parse(r.starts_at));
    if (!d || String(d.status).toLowerCase() !== 'live') continue;
    const maps = vlrMapas(d), n = (m) => (m.rounds || []).filter((x) => x.score).length;
    const vivos = maps.filter((m) => m.status === 'live');
    for (const m of vivos) out.push({ match: r.id, ref: String(m.name).toLowerCase(), n: n(m) });
    if (!vivos.length) { const sig = maps.find((m) => !n(m)); if (sig) out.push({ match: r.id, ref: String(sig.name).toLowerCase(), n: 0 }); }
    // estado para el cash out: mapas de cada uno y rondas del mapa en juego (en el orden local, visitante de la base)
    const ih = parecido(d.teams?.[0]?.name, r.home) ? 0 : 1, sc = (i) => Number(d.teams?.[i]?.score) || 0;
    let ra = null, rb = null;
    if (vivos[0]) { const rs = (vivos[0].rounds || []).filter((x) => x.score), last = rs[rs.length - 1], [p, q] = last ? String(last.score).split('-').map(Number) : [0, 0]; ra = ih === 0 ? p : q; rb = ih === 0 ? q : p; }
    live.push({ match: r.id, data: { k: 's', a: sc(ih), b: sc(1 - ih), bo: Number(/\d+/.exec(d.format || '')?.[0]) || r.bo || 3, ra, rb } });
  }
  if (out.length) await rpc('sync_ex_pred_put', { p_secret: SECRET, p_rows: out });
  await ponLive(live);
  return out.length;
}
// estado en vivo para el cash out (db/024_cashout.sql). Si 024 aun no esta cargada, avisa una vez y sigue
let liveAvisado = false;
async function ponLive(rows) {
  if (!rows.length) return 0;
  try { await rpc('sync_ex_live_put', { p_secret: SECRET, p_rows: rows }); return rows.length; }
  catch (e) { if (!liveAvisado) { liveAvisado = true; console.log('cash out: falta cargar db/024_cashout.sql (' + String(e.message).slice(0, 120) + ')'); } return 0; }
}
// futbol: marcador y minuto de ESPN de cada partido en juego
async function liveFutbol(frows) {
  const out = [];
  for (const r of frows.filter((x) => x.status === 'live' && x.details?.espn?.event)) {
    const e = r.details.espn, d = await getJson(`https://site.api.espn.com/apis/site/v2/sports/${e.sport}/${e.league}/summary?event=${e.event}`);
    const c = d?.header?.competitions?.[0], st = c?.status; if (!st || st.type?.state !== 'in') continue;
    const h = c.competitors?.find((x) => x.homeAway === 'home'), a = c.competitors?.find((x) => x.homeAway === 'away');
    // el minuto: segundos del reloj, o el texto ("52'", "45'+3'") si ESPN no manda el reloj
    const tx = String(st.displayClock || st.type?.detail || st.type?.shortDetail || ''), mt = /(\d+)(?:'?\s*\+\s*(\d+))?/.exec(tx);
    const min = Number(st.clock) > 0 ? Math.floor(Number(st.clock) / 60) : /HALFTIME/i.test(st.type?.name || '') ? 45 : mt ? +mt[1] + (+mt[2] || 0) : null;
    const per = Number(st.period) || (/SECOND|2ND/i.test(st.type?.name || '') ? 2 : /EXTRA|PENALT/i.test(st.type?.name || '') ? 3 : 1);
    if (!h || !a || min == null) continue;
    out.push({ match: r.id, data: { k: 'f', hs: Number(h.score) || 0, as: Number(a.score) || 0, min, per } });
  }
  return ponLive(out);
}
// CS2: mapas ganados de cada uno (PandaScore no da las rondas)
async function liveCs2(crows) {
  if (!PS || !crows.some((x) => x.status === 'live')) return 0;
  const lista = await getJson('https://api.pandascore.co/csgo/matches/running?per_page=50', { authorization: `Bearer ${PS}` }), out = [];
  const ids = new Set(crows.map((x) => x.id));
  for (const m of lista || []) {
    const [A, B] = (m.opponents || []).map((o) => o.opponent), id = `ps:csgo:${m.id}`;
    if (!A || !B || !ids.has(id)) continue;
    const sc = (x) => m.results?.find((r) => r.team_id === x.id)?.score ?? 0;
    out.push({ match: id, data: { k: 's', a: sc(A), b: sc(B), bo: m.number_of_games || 3, ra: null, rb: null } });
  }
  return ponLive(out);
}
const espnCache = new Map();
async function resolverGol(p) {
  const e = p.espn; if (!e?.event) return null;
  const k = `${e.sport}/${e.league}/${e.event}`;
  if (!espnCache.has(k)) espnCache.set(k, await getJson(`https://site.api.espn.com/apis/site/v2/sports/${e.sport}/${e.league}/summary?event=${e.event}`));
  const d = espnCache.get(k); if (!d) return null;
  const evs = d.keyEvents || [], t = (x) => Date.parse(x.wallclock), from = Date.parse(p.from);
  let to = Date.parse(p.to);
  const ht = evs.find((x) => /^halftime$/i.test(x.type?.text || '')), h2 = evs.find((x) => /start 2nd half/i.test(x.type?.text || ''));
  if (ht && h2 && t(ht) && t(h2)) to += Math.max(0, Math.min(to, t(h2)) - Math.max(from, t(ht)));      // el descanso no cuenta
  const goles = evs.filter((x) => x.scoringPlay && !x.shootout && t(x) > from && t(x) <= to);
  const quien = (x) => `${x.participants?.[0]?.athlete?.displayName || 'gol'} (${x.clock?.displayValue || '?'})`;
  const ventana = `${horaMadrid(from)} a ${horaMadrid(to)}`;
  if (goles.length) return { res: p.pick === 'si' ? 'won' : 'lost', ev: `Gol de ${quien(goles[0])} a las ${horaMadrid(t(goles[0]))}, ESPN. Ventana ${ventana}` };
  const st = d.header?.competitions?.[0]?.status?.type || {};
  if (st.state === 'post') {
    const fin = evs.filter((x) => /end regular time|end extra time|full time/i.test(x.type?.text || '')).map(t).filter(Boolean).pop() || Math.max(0, ...evs.map(t).filter(Boolean));
    if (fin && fin < to - 90e3) return { res: 'void', ev: `El partido acabó a las ${horaMadrid(fin)}, antes de que terminara la ventana (${ventana})` };
    return { res: p.pick === 'no' ? 'won' : 'lost', ev: `Sin goles entre ${ventana}, ESPN` };
  }
  if (Date.now() > to + 4 * 60e3) return { res: p.pick === 'no' ? 'won' : 'lost', ev: `Sin goles entre ${ventana}, ESPN` };
  return null;
}
async function resolverRonda(p) {
  const d = await vlrBuscar(p.home, p.away, Date.parse(p.placed));
  if (!d) return null;
  const x = rondaGanador(d, p.ref, p.n, p.pick, p.home);
  if (!x) return null;
  return { res: x.res === 'win' ? 'won' : x.res === 'lose' ? 'lost' : 'void', ev: x.ev };
}
async function resolverPredicciones() {
  const pend = (await rpc('sync_ex_pred_pending', { p_secret: SECRET })) || [], out = [];
  for (const p of pend) {
    try { const x = p.kind === 'gol' ? await resolverGol(p) : await resolverRonda(p); if (x) out.push({ id: p.id, res: x.res, ev: x.ev }); }
    catch (e) { console.log('predicción', p.id, 'sin resolver:', e.message); }
  }
  if (out.length) await rpc('sync_ex_pred_resolve', { p_secret: SECRET, p_rows: out });
  return [pend.length, out.length];
}
async function extras(vrows, frows = [], crows = []) {
  try {
    const r = await rpc('sync_ex', { p_secret: SECRET });
    console.log(`extras: partido mejorado ${r.boost || 'ninguno'} · trofeos nuevos ${r.trofeos} · predicciones caducadas ${r.caducadas}`);
  } catch (e) { console.log('extras: falta cargar db/022_extras.sql (' + String(e.message).slice(0, 140) + ')'); return; }
  const watch = Math.min(540, +process.env.PRED_WATCH_S || 0), t0 = Date.now();
  for (;;) {
    vlrLista = null; espnCache.clear();
    const o = await obsValorant(vrows), [abiertas, cerradas] = await resolverPredicciones();
    const lf = await liveFutbol(frows).catch(() => 0), lc = await liveCs2(crows).catch(() => 0);
    console.log(`predicciones: ${o} mapas en directo apuntados · ${abiertas} abiertas · ${cerradas} resueltas · cash out: ${lf} partidos de futbol y ${lc} de CS2 al día`);
    if (!watch || Date.now() - t0 + 25e3 > watch * 1000) break;
    await sleep(25e3);
  }
}

// ---------- Supabase ----------
// Entra con la clave publica del proyecto y una clave propia del sincronizador (SYNC_SECRET):
// la base solo le deja guardar partidos y cerrar los acabados (db/002_sync_y_cuentas.sql).
const rpc = async (fn, args) => {
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: ANON, authorization: `Bearer ${ANON}`, 'content-type': 'application/json' }, body: JSON.stringify(args) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${fn} ${r.status}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
};

// PM 30-10: "sube un poco mas las odds, solo un poquito": +5 % a todas las cuotas (las reales y las del modelo)
const SUBE = 1.05;
function sube(o) { return o == null ? o : Math.round(o * SUBE * 100) / 100 }

async function main() {
  const t0 = Date.now();
  if (process.env.SOLO_DISCORD) { if (process.env.DISCORD_WEBHOOK && SB && ANON && SECRET) await avisos({ rpc, secret: SECRET, hook: process.env.DISCORD_WEBHOOK }); return; }
  const [f, u, v, c] = await Promise.all([soccer(), ufc(), esports('valorant'), esports('csgo')]);
  await fichasEsports([...v, ...c]);
  await bracketsEsports([...v, ...c]);
  const rows = [...f, ...u, ...v, ...c];
  await carasUfc(rows);
  console.log(`futbol ${f.length} · ufc ${u.length} · valorant ${v.length} · cs2 ${c.length} · con cuotas reales ${rows.filter((r) => r.odds_src === 'draftkings').length}`);
  if (DRY) {
    if (process.env.DRY_OUT) (await import('node:fs')).writeFileSync(process.env.DRY_OUT, JSON.stringify(rows));
    const show = rows.filter((r) => r.status === 'scheduled').sort((a, b) => a.starts_at.localeCompare(b.starts_at)).slice(0, 8);
    for (const r of show) console.log(r.starts_at.slice(5, 16), r.league_name.padEnd(18), `${r.home} vs ${r.away}`.padEnd(42), r.odds_1, r.odds_x ?? '·', r.odds_2, r.odds_src);
    // db/036: las cuotas de los mercados nuevos que mandaria (unas de cada deporte) y el resultado de los 90 de lo acabado con prorroga
    const conMk = rows.filter((r) => r.status === 'scheduled' && r.odds_mk && Object.keys(r.odds_mk).length);
    console.log(`mercados nuevos: ${conMk.length} partidos con cuotas · ${rows.filter((r) => r.status === 'scheduled' && r.odds_mk && !Object.keys(r.odds_mk).length).length} sin ninguna`);
    for (const s of ['f', 'v', 'c']) for (const r of conMk.filter((x) => x.sport === s).slice(0, 3))
      console.log(` ${r.home} vs ${r.away} (${r.odds_1} ${r.odds_x ?? '·'} ${r.odds_2}${r.bo ? ' BO' + r.bo : ''}):`, Object.entries(r.odds_mk).map(([k, v]) => `${k} ${v}`).join(' · '));
    for (const r of rows.filter((x) => x.sport === 'f' && x.status === 'final' && x.details.r90 !== `${x.score}`).slice(0, 8)) console.log(` 90 min: ${r.home} ${r.score} ${r.away} -> ${r.details.r90}`);
    return;
  }
  if (!SB || !ANON || !SECRET) throw new Error('Faltan SUPABASE_URL, SUPABASE_ANON_KEY y SYNC_SECRET');
  let saved = 0;
  for (let i = 0; i < rows.length; i += 100) saved += await rpc('sync_push', { p_secret: SECRET, p_rows: rows.slice(i, i + 100) });
  let res = { pagadas: 0 }, total = { revelados: 0, pagadas: 0, pagas: 0 };
  do { res = await rpc('sync_close', { p_secret: SECRET }); for (const k in total) total[k] += res[k] || 0 } while (res.pagadas >= 60);
  console.log(`guardados ${saved} · reveladas ${total.revelados} · apuestas pagadas ${total.pagadas} · pagas ${total.pagas} · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  equiposExtra({ rows, rpc, secret: SECRET, dry: DRY, ps: PS }).catch((e) => console.log('equipos extra:', e.message || e));   // fichas ampliadas (db/025): corre a la vez que extras() y no la espera
  await extras(v, f, c).catch((e) => console.log('extras:', e.message || e));        // cuota mejorada, predicciones rapidas y trofeos (db/022)
  // avisos en Discord: nunca hacen fallar la sincronizacion
  if (process.env.DISCORD_WEBHOOK) { try { await avisos({ rpc, secret: SECRET, hook: process.env.DISCORD_WEBHOOK }) } catch (e) { console.log(`discord: ${e.message || e}`) } }
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
