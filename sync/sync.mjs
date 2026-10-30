// Sincronizador: trae partidos, cuotas y resultados (ESPN para futbol y UFC, PandaScore para Valorant),
// los guarda en Supabase, revela las apuestas al empezar y paga las apuestas de los partidos acabados.
// Lo lanza GitHub Actions cada 15 minutos. Con DRY=1 solo cuenta lo que haria, sin tocar Supabase.
//   SUPABASE_URL, SUPABASE_ANON_KEY, SYNC_SECRET, PANDASCORE_KEY

const SB = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SECRET = process.env.SYNC_SECRET, PS = process.env.PANDASCORE_KEY;
const DRY = !!process.env.DRY;
const DAY = 864e5, NOW = Date.now();
const UA = { 'user-agent': 'apuestas-colegas/1.0' };

const SOCCER = [
  ['esp.1', 'LaLiga'], ['eng.1', 'Premier League'], ['ger.1', 'Bundesliga'], ['ita.1', 'Serie A'], ['fra.1', 'Ligue 1'],
  ['uefa.champions', 'Champions League'], ['uefa.europa', 'Europa League'], ['uefa.europa.conf', 'Conference League'],
  ['esp.copa_del_rey', 'Copa del Rey'], ['eng.fa', 'FA Cup'], ['esp.2', 'LaLiga Hypermotion'], ['por.1', 'Liga Portugal'],
  ['ned.1', 'Eredivisie'], ['usa.1', 'MLS'], ['mex.1', 'Liga MX'], ['arg.1', 'Liga Argentina'], ['bra.1', 'Brasileirão'],
  ['sau.1', 'Saudi Pro League'], ['uefa.nations', 'Nations League'], ['fifa.worldq.uefa', 'Clasificación Mundial'], ['fifa.friendly', 'Amistosos'],
];
const SOCCER_PAST = 3 * DAY, SOCCER_AHEAD = 10 * DAY, UFC_AHEAD = 70 * DAY, VAL_AHEAD = 10 * DAY;
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
const twoWay = (a, b) => {
  const p = (a - a * b) / Math.max(1e-6, a + b - 2 * a * b);
  return fromProbs([p, null, 1 - p]);
};
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
          [row.odds_1, row.odds_x, row.odds_2] = o;
        }
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
        home: x.athlete.displayName, away: y.athlete.displayName, home_logo: face(x.athlete), away_logo: face(y.athlete),
        starts_at: new Date(Date.parse(c.date || e.date)).toISOString(), status,
        score: done ? (c.status?.result?.shortDisplayName || st.shortDetail || null) : null,
        winner: status === 'final' ? (x.winner ? '1' : '2') : null,
        details: { espn: { sport: 'mma', league: 'ufc', event: e.id, ids: { a: x.athlete.id, b: y.athlete.id } }, tv: tvEspn(c).length ? tvEspn(c) : tvEspn(e.competitions?.[comps.length - 1] || {}), tape: [[x.records?.[0]?.summary?.replace(/-/g, '·') || '', 'Récord', y.records?.[0]?.summary?.replace(/-/g, '·') || '']].filter((r) => r[0] || r[2]) },
      };
      if (status === 'scheduled') {
        const pct = (r) => (r ? (r.w + 1) / (r.w + r.l + r.d + 2) : 0.5);
        [row.odds_1, row.odds_x, row.odds_2] = twoWay(pct(rx), pct(ry));
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

// ---------- Valorant (PandaScore) ----------
async function valorant() {
  if (!PS) return [];
  const H = { authorization: `Bearer ${PS}` };
  const base = 'https://api.pandascore.co/valorant/matches';
  const [up1, up2, run, past1, past2] = await Promise.all([
    getJson(`${base}/upcoming?per_page=100&sort=begin_at&page=1`, H), getJson(`${base}/upcoming?per_page=100&sort=begin_at&page=2`, H),
    getJson(`${base}/running?per_page=50`, H),
    getJson(`${base}/past?per_page=100&sort=-end_at&page=1`, H), getJson(`${base}/past?per_page=100&sort=-end_at&page=2`, H),
  ]);
  const past = [...(past1 || []), ...(past2 || [])];
  // forma de cada equipo con sus ultimos resultados
  const form = new Map();
  for (const m of [...past].sort((a, b) => Date.parse(a.end_at || a.begin_at) - Date.parse(b.end_at || b.begin_at))) {
    if (m.status !== 'finished' || !m.winner_id) continue;
    for (const o of m.opponents || []) {
      const id = o.opponent?.id; if (!id) continue;
      const f = form.get(id) || { w: 0, g: 0, s: '', ult: [] };
      const won = id === m.winner_id;
      f.g++; if (won) f.w++; f.s = (f.s + (won ? 'G' : 'P')).slice(-5);
      const otro = (m.opponents || []).find((o) => o.opponent?.id !== id)?.opponent;
      const sc = (x) => m.results?.find((r) => r.team_id === x)?.score ?? 0;
      f.ult = [...f.ult, { vs: otro?.name || '?', logo: otro?.image_url || null, won, score: `${sc(id)}:${sc(otro?.id)}`, at: m.end_at || m.begin_at, t: m.tournament?.name || '' }].slice(-5);
      form.set(id, f);
    }
  }
  const out = [];
  const tiers = new Set(['s', 'a', 'b', 'c']);
  for (const m of [...(run || []), ...(up1 || []), ...(up2 || []), ...past]) {
    const t = Date.parse(m.begin_at || m.scheduled_at);
    if (!t || t > NOW + VAL_AHEAD || t < NOW - 3 * DAY) continue;
    const tier = m.tournament?.tier;
    if (tier && !tiers.has(tier)) continue;
    const [A, B] = (m.opponents || []).map((o) => o.opponent);
    if (!A || !B) continue;
    const status = m.status === 'canceled' ? 'canceled' : m.status === 'finished' ? (m.winner_id ? 'final' : 'canceled') : m.status === 'running' ? 'live' : 'scheduled';
    const sc = (id) => m.results?.find((r) => r.team_id === id)?.score ?? 0;
    const fa = form.get(A.id), fb = form.get(B.id);
    const row = {
      id: `ps:valorant:${m.id}`, sport: 'v', league: `ps:${m.league?.id || 'val'}`, league_name: m.league?.name || 'Valorant',
      league_logo: m.league?.image_url || null, stage: [m.serie?.full_name, m.tournament?.name].filter(Boolean).join(' · ') || null,
      tag: tier === 's' ? 'Internacional' : null,
      home: A.name, away: B.name, home_logo: A.image_url || null, away_logo: B.image_url || null,
      starts_at: new Date(t).toISOString(), status, bo: m.number_of_games || null,
      score: status === 'live' || status === 'final' ? `${sc(A.id)}:${sc(B.id)}` : null,
      winner: status === 'final' ? (m.winner_id === A.id ? '1' : '2') : null,
      details: { recent: { a: (fa?.ult || []).slice().reverse(), b: (fb?.ult || []).slice().reverse() }, ids: { a: A.id, b: B.id },
        tv: (m.streams_list || []).filter((x) => x.raw_url && /^(en|es)$/.test(x.language)).slice(0, 6)
          .map((x) => ({ n: /twitch/.test(x.raw_url) ? 'Twitch' : /youtube/.test(x.raw_url) ? 'YouTube' : /kick\.com/.test(x.raw_url) ? 'Kick' : 'Stream', l: x.language, u: x.raw_url, main: !!x.main })),
        tape: [[m.number_of_games ? 'BO' + m.number_of_games : '', 'Formato', m.number_of_games ? 'BO' + m.number_of_games : ''],
        [fa ? 'F:' + fa.s : '', 'Forma', fb ? 'F:' + fb.s : '']].filter((r) => r[0] || r[2]) },
    };
    if (status === 'scheduled') {
      const pct = (f) => (f ? (f.w + 1) / (f.g + 2) : 0.5);
      [row.odds_1, row.odds_x, row.odds_2] = twoWay(pct(fa), pct(fb));
      row.odds_src = 'modelo';
    }
    out.push(row);
  }
  // los jugadores de cada equipo (una peticion para todos)
  const ids = [...new Set(out.filter((r) => r.status !== 'final').flatMap((r) => [r.details.ids.a, r.details.ids.b]))].slice(0, 100);
  if (ids.length) {
    const teams = await getJson(`https://api.pandascore.co/valorant/teams?filter[id]=${ids.join(',')}&per_page=100`, H);
    const pl = new Map((teams || []).map((t) => [t.id, (t.players || []).map((p) => ({ n: p.name, img: p.image_url || null, nat: p.nationality || null, role: p.role || null, nombre: [p.first_name, p.last_name].filter(Boolean).join(' ') || null }))]));
    for (const r of out) r.details.players = { a: pl.get(r.details.ids.a) || [], b: pl.get(r.details.ids.b) || [] };
  }
  return [...new Map(out.map((r) => [r.id, r])).values()];
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

async function main() {
  const t0 = Date.now();
  const [f, u, v] = await Promise.all([soccer(), ufc(), valorant()]);
  const rows = [...f, ...u, ...v];
  await carasUfc(rows);
  console.log(`futbol ${f.length} · ufc ${u.length} · valorant ${v.length} · con cuotas reales ${rows.filter((r) => r.odds_src === 'draftkings').length}`);
  if (DRY) {
    if (process.env.DRY_OUT) (await import('node:fs')).writeFileSync(process.env.DRY_OUT, JSON.stringify(rows));
    const show = rows.filter((r) => r.status === 'scheduled').sort((a, b) => a.starts_at.localeCompare(b.starts_at)).slice(0, 8);
    for (const r of show) console.log(r.starts_at.slice(5, 16), r.league_name.padEnd(18), `${r.home} vs ${r.away}`.padEnd(42), r.odds_1, r.odds_x ?? '·', r.odds_2, r.odds_src);
    return;
  }
  if (!SB || !ANON || !SECRET) throw new Error('Faltan SUPABASE_URL, SUPABASE_ANON_KEY y SYNC_SECRET');
  let saved = 0;
  for (let i = 0; i < rows.length; i += 100) saved += await rpc('sync_push', { p_secret: SECRET, p_rows: rows.slice(i, i + 100) });
  let res = { pagadas: 0 }, total = { revelados: 0, pagadas: 0, pagas: 0 };
  do { res = await rpc('sync_close', { p_secret: SECRET }); for (const k in total) total[k] += res[k] || 0 } while (res.pagadas >= 60);
  console.log(`guardados ${saved} · reveladas ${total.revelados} · apuestas pagadas ${total.pagadas} · pagas ${total.pagas} · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
