// Puente de CS2 en directo para Gambling Addicts (PM, 30-10).
// bo3.gg tiene una API publica pero sin CORS, asi que el navegador no puede leerla. Esta funcion la lee desde el
// servidor, la deja compacta y la devuelve con CORS abierto. Sin dependencias (Deno).
//   GET /functions/v1/vivo?cs2=1              -> los partidos de CS2 en directo, con mapas y rondas
//   GET /functions/v1/vivo?slug=<slug de bo3> -> un partido concreto (aunque no este en directo)
// Cache de 15 s en memoria para no machacar a bo3.gg (muchos navegadores, un solo viaje).

const B = 'https://api.bo3.gg/api/v1';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-max-age': '86400',
};
const TTL = 15000;
// deno-lint-ignore no-explicit-any
type J = any;
const cache = new Map<string, { t: number; d: J }>();
const fin = new Map<number, J>(); // partidas acabadas: ya no cambian, se guardan (con tope)

async function api(path: string): Promise<J> {
  const r = await fetch(B + path, { headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (compatible; gambling-addicts/1.0)' } });
  if (!r.ok) throw new Error(`bo3 ${r.status} ${path}`);
  return r.json();
}
const low = (s: unknown) => String(s ?? '').toLowerCase().trim();
const METODO: Record<string, string> = { TargetBombed: 'detonate', BombDefused: 'defuse', TargetSaved: 'time', TerroristsWin: 'elimination', CTWin: 'elimination', CounterTerroristsWin: 'elimination' };
const mapa = (s: string) => { const x = String(s || '').replace(/^de_/, '').replace(/_/g, ' '); return x.charAt(0).toUpperCase() + x.slice(1) };

// rondas compactas: [equipo que gana (1 o 2), lado en el que gana ('ct' o 't'), como]
function rondas(g: J, quien: (n: string) => number): { r: J[]; a: number; b: number } {
  const r: J[] = []; let a = 0, b = 0;
  for (const x of (g.game_rounds || []).slice().sort((p: J, q: J) => p.round_number - q.round_number)) {
    let w = quien(x.winner_clan_name);
    if (!w) { const l = quien(x.loser_clan_name); if (l) w = l === 1 ? 2 : 1 }
    if (!w) continue;
    if (w === 1) a++; else b++;
    r.push([w, low(x.winner_clan_side) === 'ct' ? 'ct' : 't', METODO[x.end_reason] || 'elimination']);
  }
  return { r, a, b };
}

async function partido(slug: string): Promise<J> {
  const m = await api('/matches/' + encodeURIComponent(slug));
  const lista = await api('/games?filter%5Bgames.match_id%5D%5Beq%5D=' + m.id);
  const nombres = new Map<string, number>();
  for (const [i, t] of [[1, m.team1], [2, m.team2]] as [number, J][]) {
    nombres.set(low(t?.name), i); nombres.set(low(t?.slug), i);
    for (const c of t?.team_clans || []) nombres.set(low(c.clan_name), i);
  }
  const quien = (n: string) => nombres.get(low(n)) || 0;
  const juegos = (lista.results || []).slice().sort((p: J, q: J) => p.number - q.number);
  const maps: J[] = [];
  for (const g of juegos) {
    const st = g.status === 'finished' ? 'fin' : g.status === 'current' ? 'live' : 'pend';
    const o: J = { n: g.number, nombre: mapa(g.map_name), st, a: null, b: null, ganador: 0, rondas: [] };
    if (st !== 'pend') {
      let d: J = st === 'fin' ? fin.get(g.id) : null;
      if (!d) {
        try { d = await api('/games/' + g.id) } catch { d = g }
        if (st === 'fin' && d.game_rounds) { if (fin.size > 400) fin.clear(); fin.set(g.id, d) }
      }
      for (const c of [d.winner_team_clan, d.loser_team_clan]) if (c?.clan_name && c.team_id) nombres.set(low(c.clan_name), c.team_id === m.team1_id ? 1 : 2);
      const rr = rondas(d, quien);
      o.rondas = rr.r;
      const ws = d.winner_clan_score, ls = d.loser_clan_score;
      if (ws != null && ls != null) {
        const g1 = quien(d.winner_clan_name) || (d.winner_team_clan?.team_id === m.team1_id ? 1 : d.winner_team_clan?.team_id === m.team2_id ? 2 : 0);
        if (g1 === 1) { o.a = ws; o.b = ls; o.ganador = ws > ls ? 1 : 2 } else if (g1 === 2) { o.a = ls; o.b = ws; o.ganador = ws > ls ? 2 : 1 }
      }
      if (o.a == null && rr.r.length) { o.a = rr.a; o.b = rr.b }
      if (st === 'fin' && !o.ganador && o.a != null) o.ganador = o.a > o.b ? 1 : o.b > o.a ? 2 : 0;
    }
    maps.push(o);
  }
  const eq = (t: J) => {
    const al = new Set<string>();
    for (const c of t?.team_clans || []) { const x = String(c.clan_name || '').trim(); if (x && low(x) !== low(t.name)) al.add(x) }
    if (t?.slug) al.add(String(t.slug).replace(/-/g, ' '));
    return [...al].slice(0, 5);
  };
  return {
    id: m.id, slug: m.slug, bo: m.bo_type, inicio: m.start_date, torneo: m.tournament?.name || '', fase: m.stage?.title || m.round?.name || '',
    a: { id: m.team1_id, n: m.team1?.name || '', al: eq(m.team1), img: m.team1?.image_url || '', s: m.team1_score ?? 0 },
    b: { id: m.team2_id, n: m.team2?.name || '', al: eq(m.team2), img: m.team2?.image_url || '', s: m.team2_score ?? 0 },
    estado: m.status, ganador: m.winner_team_id ? (m.winner_team_id === m.team1_id ? 1 : 2) : 0,
    maps,
  };
}

async function directos(): Promise<J[]> {
  const l = await api('/matches?scope=widget-matches&page%5Boffset%5D=0&page%5Blimit%5D=50&sort=tier&filter%5Bmatches.status%5D%5Bin%5D=current&filter%5Bmatches.discipline_id%5D%5Beq%5D=1');
  const ahora = Date.now();
  // bo3 deja partidos "current" olvidados de dias atras: solo los que han empezado hace poco, sin ganador y no rechazados
  const vivos = (l.results || []).filter((m: J) => {
    const t = Date.parse(m.start_date);
    return m.status === 'current' && !m.winner_team_id && m.parsed_status !== 'rejected' && t < ahora + 15 * 60000 && t > ahora - 14 * 3600000;
  });
  const out = await Promise.all(vivos.map((m: J) => partido(m.slug).catch(() => null)));
  return out.filter(Boolean);
}

async function datos(clave: string, f: () => Promise<J>): Promise<J> {
  const c = cache.get(clave);
  if (c && Date.now() - c.t < TTL) return c.d;
  try { const d = await f(); cache.set(clave, { t: Date.now(), d }); return d } catch (e) { if (c) return c.d; throw e }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const u = new URL(req.url);
  try {
    const slug = u.searchParams.get('slug');
    let matches: J[];
    if (slug) { if (!/^[a-z0-9_.-]{3,120}$/i.test(slug)) throw new Error('slug no valido'); matches = [await datos('s:' + slug, () => partido(slug))] }
    else if (u.searchParams.has('cs2')) matches = await datos('cs2', directos);
    else return new Response(JSON.stringify({ ok: false, error: 'usa ?cs2=1 o ?slug=...' }), { status: 400, headers: { ...CORS, 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ ok: true, t: Date.now(), matches }), { headers: { ...CORS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=15' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message || e) }), { status: 502, headers: { ...CORS, 'content-type': 'application/json' } });
  }
});
