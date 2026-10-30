// Gambling Master: la app. Los datos viven en Supabase; aqui solo se pintan y se piden cosas.
// El dinero nunca se calcula aqui: apostar, pagar y cobrar lo hacen las funciones de la base (db/001_init.sql).
'use strict';
const CFG = window.APP_CONFIG || {};
const db = supabase.createClient(CFG.url, CFG.anon, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'apuestas-auth' } });
const TZ = 'Europe/Madrid', DAY = 864e5, DOMAIN = '@apuestas.app';
const TOP = new Set(['esp.1', 'eng.1', 'ger.1', 'ita.1', 'fra.1', 'uefa.champions', 'uefa.europa', 'esp.copa_del_rey']);
const SP = { f: ['Fútbol', 'img/futbol.svg'], v: ['Valorant', 'img/valorant.svg'], c: ['CS2', 'img/cs2.png'], u: ['UFC', 'img/ufc.png'] };
const DEP = ['f', 'v', 'c', 'u'];
const KIND = { paga: 'Paga del lunes', apuesta: 'Apuesta', premio: 'Premio', devolucion: 'Devolución', ajuste: 'Ajuste', diario: 'Premio diario', rescate: 'Rescate', bote: 'Bote de la semana', bote_gana: 'Bote ganado', caja: 'Caja de CS2', venta: 'Venta de skin', batalla: 'Batalla de cajas', ruleta: 'Ruleta de la semana', premio_semana: 'Premio de la semana' };
let CLAIM = null, BOTE = null, REACT = new Map(), POLLS = new Map(), CAMPEON = null;

/* ---------- estado ---------- */
let NOW = Date.now(), PAY = 0, WEEK0 = 0;
let ME = null, MEK = 'pm', VIS = 'open', WEEKLY = 1000, SEASON = '';
let F = [], M = [], MI = new Map(), L = {}, ALL = [], LEDGER = [], CHAT = [], AW = [], H2H = {};
let CH = [], DAILY = [], DAILY_ON = false, DAILY_BONUS = 1.25;
let S = { side: null, scr: 'partidos', f: 'all', lg: 'top', sel: null, stake: 200, foc: null, sheet: false, bf: 'all', pf: 'pm', prof: 'pm', prev: 'colegas', calc: 0, reto: null, sure: null };
try { localStorage.removeItem('apuestas-calc') } catch {}
let loaded = false;

/* ---------- formato ---------- */
const N = (x) => String(Math.round(x || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const O = (x) => Number(x).toFixed(2).replace('.', ',');
const fmt = (t, o) => new Intl.DateTimeFormat('es-ES', { timeZone: TZ, ...o }).format(new Date(t));
const HM = (t) => fmt(t, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const DD = (t) => fmt(t, { day: 'numeric' });
const WD = (t) => fmt(t, { weekday: 'short' }).replace('.', '').toUpperCase();
const MO = (t) => fmt(t, { month: 'short' }).replace('.', '').toUpperCase();
const DK = (t) => fmt(t, { year: 'numeric', month: '2-digit', day: '2-digit' });
const today = (t) => DK(t) === DK(NOW);
const CD = (t) => { const s = Math.max(0, ((typeof t === 'number' ? t : Date.parse(t)) - NOW) / 1e3), d = (s / 86400) | 0, h = ((s % 86400) / 3600) | 0, mi = ((s % 3600) / 60) | 0; return d ? `${d}d ${h}h` : h ? `${h}h ${mi}m` : `${mi}m` };
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const when = (t) => { const d = Date.parse(t); return today(d) ? HM(d) : DK(d) === DK(NOW - DAY) ? 'ayer ' + HM(d) : WD(d).toLowerCase() + ' ' + DD(d) };
// medianoche de Madrid del lunes que viene (cambia de hora en verano e invierno)
function nextMonday() {
  for (let d = 0; d <= 8; d++) {
    const ymd = DK(NOW + d * DAY).split('/').reverse().join('-');
    for (const h of [22, 23, 0, 1]) {
      const base = Date.parse(ymd + 'T00:00:00Z') + (h >= 22 ? -DAY : 0) + h * 36e5;
      if (base > NOW && fmt(base, { weekday: 'short' }).startsWith('lun') && HM(base) === '00:00') return base;
    }
  }
  return NOW + 7 * DAY;
}

/* ---------- datos ---------- */
const COLS = 'id,sport,league,league_name,league_logo,stage,tag,venue,home,away,home_logo,away_logo,starts_at,status,score,winner,odds_1,odds_x,odds_2,odds_src,bo,details';
async function load() {
  const from = new Date(Date.now() - 2 * DAY).toISOString(), to = new Date(Date.now() + 72 * DAY).toISOString();
  const [st, ms, ch, ex, wh] = await Promise.all([
    db.rpc('get_state'),
    db.from('matches').select(COLS).gte('starts_at', from).lte('starts_at', to).neq('status', 'canceled').order('starts_at').limit(3000),
    db.from('chat').select('*').order('id', { ascending: false }).limit(150),
    db.rpc('get_extras'),
    db.from('wheel_spins').select('player,week,prize,label').order('id', { ascending: false }).limit(40),
  ]);
  if (st.error) throw st.error;
  if (ms.error) throw ms.error;
  let rows = ms.data || [];
  const have = new Set(rows.map((r) => r.id)), need = [...new Set(st.data.bets.map((b) => b.match))].filter((id) => !have.has(id));
  for (let i = 0; i < need.length; i += 150) {
    const r = await db.from('matches').select(COLS).in('id', need.slice(i, i + 150));
    if (!r.error) rows = rows.concat(r.data);
  }
  WHEEL = wh.error ? null : wh.data || [];
  build(st.data, rows, (ch.data || []).reverse(), ex.error ? null : ex.data);
  avisos();
}
function build(st, rows, chat, ex) {
  NOW = Date.now(); PAY = nextMonday(); WEEK0 = PAY - 7 * DAY;
  ME = st.me; VIS = st.vis; WEEKLY = st.weekly; SEASON = st.season_start;
  const key = new Map(st.players.map((p) => [p.id, p.color]));
  MEK = key.get(ME) || 'pm';
  M = rows.map((r) => ({
    id: r.id, s: r.sport, lg: r.league, a: r.home, b: r.away, la: r.home_logo, lb: r.away_logo, at: r.starts_at,
    o: [r.odds_1, r.odds_x, r.odds_2].map((x) => (x == null ? null : Number(x))), status: r.status, live: r.status === 'live',
    score: r.score, winner: r.winner, tag: r.tag, venue: r.venue, stage: r.stage, bo: r.bo, tape: r.details?.tape || [], src: r.odds_src,
    tv: r.details?.tv || [], espn: r.details?.espn || null, players: r.details?.players || null, recent: r.details?.recent || null, tier: r.details?.tier || null, tid: r.details?.ids || null, tour: r.details?.bracket ? `${r.details.game}:${r.details.tour}` : null,
  }));
  MI = new Map(M.map((m) => [m.id, m]));
  L = {}; for (const r of rows) if (!L[r.league]) L[r.league] = [r.league_name, r.league_logo || SP[r.sport][1]];
  ALL = st.bets.map((b) => ({ id: b.id, k: key.get(b.player), m: b.match, p: b.pick, stake: b.stake, o: Number(b.odds), st: b.status, pay: b.payout, at: b.created, set: b.settled }));
  LEDGER = st.ledger.map((l) => ({ t: when(l.at), at: Date.parse(l.at), kind: l.kind, c: KIND[l.kind] || l.kind, d: l.note, a: l.amount }));
  chat = chat.filter((c) => c.player || !/^(Batalla (1v1|2v2) lista|.+ abre una batalla (1v1|2v2))/.test(c.body || ''));
  CHAT = chat.map((c) => ({ id: c.id, poll: c.poll_id || null, bet: c.bet_id || null, k: c.player ? key.get(c.player) : null, at: Date.parse(c.created_at), t: HM(Date.parse(c.created_at)), txt: c.body, img: c.image_url, aud: c.audio_url || null, secs: c.audio_secs || 0 }));
  F = st.players.map((p) => {
    const k = p.color, mine = ALL.filter((b) => b.k === k);
    const settled = mine.filter((b) => b.st === 'won' || b.st === 'lost').sort((a, b) => Date.parse(a.set) - Date.parse(b.set));
    const w = settled.filter((b) => b.st === 'won').length, t = settled.length;
    let run = 0, last = settled[settled.length - 1]; for (let i = settled.length - 1; i >= 0 && settled[i].st === last.st; i--) run++;
    let streak = 0, cur = 0; for (const b of settled) { cur = b.st === 'won' ? cur + 1 : 0; streak = Math.max(streak, cur) }
    const sp = {}, stakeBy = {}; let stakeAll = 0;
    for (const s of DEP) { const x = settled.filter((b) => MI.get(b.m)?.s === s); sp[s] = [x.filter((b) => b.st === 'won').length, x.length]; stakeBy[s] = mine.filter((b) => MI.get(b.m)?.s === s).reduce((a, b) => a + b.stake, 0); stakeAll += stakeBy[s] }
    const ranked = DEP.filter((s) => sp[s][1] >= 2).sort((a, b) => sp[b][0] / sp[b][1] - sp[a][0] / sp[a][1]);
    const weeks = p.weeks.length ? p.weeks : [p.saldo];
    return {
      id: k, uid: p.id, n: p.name, ini: p.ini, s: p.saldo, me: p.id === ME, admin: p.admin, username: p.username,
      apodo: p.apodo, frase: p.frase, photo: p.photo, favs: Array.isArray(p.favs) ? p.favs : [], recibido: p.recibido,
      h: [WEEKLY, ...weeks], wk: weeks.map((v, i) => v - (i ? weeks[i - 1] : 0) - WEEKLY),
      ac: t ? Math.round((w / t) * 100) + '%' : '·', acn: `${w} de ${t}`, bets: mine.length,
      racha: t ? `${last.st === 'won' ? '▲' : '▼'} ${run}` : '·', streak,
      best: Math.max(0, ...mine.filter((b) => b.st === 'won').map((b) => b.pay)),
      fuerte: ranked[0] ? SP[ranked[0]][0] : stakeAll ? SP[DEP.sort((a, b) => stakeBy[b] - stakeBy[a])[0]][0] : '·',
      sp, share: Object.fromEntries(DEP.map((s) => [s, stakeAll ? Math.round((stakeBy[s] / stakeAll) * 100) : 0])),
      last: settled.slice(-10).map((b) => (b.st === 'won' ? 'W' : 'L')).join(''),
      avgO: mine.length ? mine.reduce((a, b) => a + b.o, 0) / mine.length : 0,
    };
  });
  // duelos: partidos cerrados en los que dos apostaron a cosas distintas
  H2H = {}; for (const f of F) H2H[f.id] = Object.fromEntries(F.filter((g) => g.id !== f.id).map((g) => [g.id, [0, 0]]));
  const byMatch = {}; for (const b of ALL) if (b.st === 'won' || b.st === 'lost') (byMatch[b.m] = byMatch[b.m] || []).push(b);
  for (const list of Object.values(byMatch)) for (const a of list) for (const b of list) {
    if (a.k === b.k || a.p === b.p || !H2H[a.k]?.[b.k]) continue;
    if (a.st === 'won') H2H[a.k][b.k][0]++; else if (b.st === 'won') H2H[a.k][b.k][1]++;
  }
  // premios de la temporada
  AW = [];
  const won = ALL.filter((b) => b.st === 'won'), lost = ALL.filter((b) => b.st === 'lost');
  const nm = (b) => { const m = MI.get(b.m); return m ? pn(m, b.p) : '' };
  if (won.length) { const b = won.reduce((a, c) => (c.pay > a.pay ? c : a)); AW.push(['Mayor premio', N(b.pay), b.k, `${nm(b)} ${O(b.o)} · ${N(b.stake)} apostados`]) }
  if (won.length) { const b = won.reduce((a, c) => (c.o > a.o ? c : a)); AW.push(['Cuota más alta acertada', O(b.o), b.k, `${nm(b)} · ${N(b.stake)} a ${N(b.pay)}`]) }
  const wkBest = F.flatMap((f) => f.wk.map((v, i) => [v, f.id, i])).sort((a, b) => b[0] - a[0])[0];
  if (wkBest && wkBest[0] > 0) AW.push(['Mejor semana', '▲ ' + N(wkBest[0]), wkBest[1], 'Semana ' + (wkBest[2] + 1)]);
  if (lost.length) { const b = lost.reduce((a, c) => (c.stake > a.stake ? c : a)); AW.push(['Peor golpe', '▼ ' + N(b.stake), b.k, nm(b)]) }
  const most = [...F].sort((a, b) => b.bets - a.bets)[0]; if (most?.bets) AW.push(['Más apuestas', String(most.bets), most.id, 'esta temporada']);
  const st2 = [...F].sort((a, b) => b.streak - a.streak)[0]; if (st2?.streak >= 2) AW.push(['Mejor racha', String(st2.streak), st2.id, 'ganadas seguidas']);
  if (!F.some((f) => f.id === S.pf)) S.pf = MEK;
  const uk = new Map(st.players.map((p) => [p.id, p.color]));
  CH = (ex?.challenges || []).map((c) => ({ id: c.id, m: c.match, from: uk.get(c.from), to: uk.get(c.to), fp: c.from_pick, tp: c.to_pick, stake: c.stake, st: c.status, at: c.created, set: c.settled }));
  DAILY = ex?.daily || []; DAILY_ON = !!ex?.daily_on; DAILY_BONUS = Number(ex?.daily_bonus) || 1.25;
  // primera tanda de ideas (db/009): premio diario, rescate, bote, reacciones, encuestas
  CLAIM = ex?.claim || null; BOTE = ex?.bote || null;
  REACT = new Map(); for (const r of ex?.reactions || []) { const k = uk.get(r.p); if (!k) continue; const t = REACT.get(r.t) || {}; (t[r.e] = t[r.e] || []).push(k); REACT.set(r.t, t) }
  POLLS = new Map((ex?.polls || []).map((q) => [q.id, { q: q.q, o: q.o || [], v: Object.fromEntries(Object.entries(q.v || {}).map(([u, o]) => [uk.get(u), o]).filter(([k]) => k)) }]));
  const reg = ex?.regalos || {}; for (const f of F) f.recibido += reg[f.uid] || 0;
  // campeon del mes pasado: el que mas gano con sus apuestas resueltas ese mes; lleva corona todo el mes
  { const d = new Date(NOW), ini = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1), fin = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1), tot = {};
    for (const b of ALL) { const t = Date.parse(b.set || ''); if (!(t >= ini && t < fin) || (b.st !== 'won' && b.st !== 'lost')) continue; tot[b.k] = (tot[b.k] || 0) + (b.st === 'won' ? b.pay - b.stake : -b.stake) }
    const best = Object.entries(tot).sort((a, b) => b[1] - a[1])[0]; CAMPEON = best && best[1] > 0 ? { k: best[0], mes: fmt(ini, { month: 'long' }), v: best[1] } : null }
  for (const m of M) { const o = ODDS0[m.id]; m.mv = o && m.status === 'scheduled' ? m.o.map((x, i) => (x && o[i] ? Math.sign(x - o[i]) : 0)) : [0, 0, 0] }
  loaded = true;
}

/* ---------- utilidades de pintado ---------- */
const me = () => F.find((f) => f.me) || F[0];
const fr = (k) => F.find((f) => f.id === k) || { id: k, n: '·', ini: '·', apodo: '', frase: '', favs: [], h: [0], wk: [], sp: { f: [0, 0], v: [0, 0], u: [0, 0] }, share: {}, last: '' };
const byId = (id) => MI.get(id);
const pn = (m, p) => (p === '1' ? m.a : p === 'X' ? 'Empate' : p === '2' ? m.b : '?');
const PI = { 1: 0, X: 1, 2: 2 };
const po = (m, p) => m.o[PI[p]];
const isOpen = (m) => m.status === 'scheduled' && Date.parse(m.at) > NOW;
const picksOf = (m) => (m.o[1] == null ? ['1', '2'] : ['1', 'X', '2']);
const isSel = (m, p) => S.sel && S.sel.m === m.id && S.sel.p === p;
const isMine = (m, p) => ALL.some((b) => b.k === MEK && b.m === m.id && b.p === p && b.st === 'open');
const openOf = (k) => ALL.filter((b) => b.k === k && b.st === 'open' && byId(b.m)).sort((a, b) => Date.parse(byId(a.m).at) - Date.parse(byId(b.m).at));
const doneOf = (k) => ALL.filter((b) => b.k === k && b.st !== 'open' && byId(b.m)).sort((a, b) => Date.parse(b.set) - Date.parse(a.set)).slice(0, 3)
  .map((b) => { const m = byId(b.m); return [pn(m, b.p), b.o, b.stake, b.st, b.pay, `${m.a} ${m.score || ''} ${m.b} · ${when(b.set)}`] });
const whoOn = (mid) => ALL.filter((b) => b.m === mid && b.st === 'open').map((b) => ({ f: b.k, ...b }));
const short = (m) => (m.s === 'u' ? m.a.split(' ').pop().slice(0, 3) + '·' + m.b.split(' ').pop().slice(0, 3) : m.a.slice(0, 3) + '·' + m.b.slice(0, 3)).toUpperCase();
const coin = (cls = '') => `<span class="cn ${cls}"></span>`;
const LOCK = '<svg class="lock" viewBox="0 0 12 12"><rect x="2" y="5.5" width="8" height="5.5" rx="1.2"/><path d="M4 5.5V4a2 2 0 0 1 4 0v1.5"/></svg>';
const av = (k, cls = '') => { const f = fr(k); return `<span class="av ${k} ${cls} ${f.photo ? 'ph' : ''} ${CAMPEON?.k === k ? 'rey' : ''}" data-prof="${k}" title="Perfil de ${esc(f.n)}">${esc(f.ini)}</span>` };
const net = (f) => { const d = f.s - f.recibido; return `<span class="net ${d >= 0 ? 'up' : ''}">${d >= 0 ? '▲' : '▼'} ${N(Math.abs(d))}</span>` };
const img = (src, cls = '') => (src ? `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : `<span class="noimg ${cls}"></span>`);
const logo = (m, side) => img(side === 'a' ? m.la : m.lb, m.s === 'u' ? 'face' : 'tl');
const form = (s) => `<span class="fm">${[...s].map((c) => `<b class="${c === 'G' ? 'g' : c === 'E' ? 'e' : ''}">${c}</b>`).join('')}</span>`;
const board = () => M.filter((m) => (m.status === 'scheduled' || m.live) && (m.live || Date.parse(m.at) > NOW) && Date.parse(m.at) < NOW + (m.s === 'u' ? 72 : 8) * DAY);
const inLeague = (m) => S.lg === 'all' ? true : S.lg === 'top' ? m.live || m.s === 'v' || (m.s === 'c' ? 'sa'.includes(m.tier || 'x') : m.s === 'u' ? !!m.tag : TOP.has(m.lg)) || whoOn(m.id).length > 0 : m.lg === S.lg;
const filtered = () => board().filter((m) => (S.f === 'all' || m.s === S.f) && inLeague(m)).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
const groups = (list) => { const g = new Map(); for (const m of list) { const k = DK(m.at); if (!g.has(k)) g.set(k, []); g.get(k).push(m) } return [...g.values()] };
const dayLab = (t) => (today(t) ? `HOY · ${WD(t)}` : `${WD(t)} · ${MO(t)}`);
const stakeNow = () => Math.max(0, Math.min(S.stake, me().s));
const chips = () => [50, 100, 250, 500, 'all'].map((v) => { const on = v === 'all' ? S.stake >= me().s : S.stake === v; return `<button class="chip ${on ? 'on' : ''}" data-stake="${v}">${v === 'all' ? 'Todo' : N(v)}</button>` }).join('');
const filt = () => { const b = board().filter(inLeague), cnt = (k) => b.filter((m) => k === 'all' || m.s === k).length;
  return [['all', 'Todo', null], ...DEP.map((k) => [k, ...SP[k]])].map(([k, n, im]) => `<button class="f ${S.f === k ? 'on' : ''}" data-f="${k}">${im ? `<img src="${im}" alt="">` : ''}${n}<i>${cnt(k)}</i></button>`).join('') };
const IC_TOP = '<svg viewBox="0 0 24 24"><path d="M12 3.2l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.5l6-.8z"/></svg>';
const IC_ALL = '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2"/></svg>';
// PM, 30-10: "los menus de champions league, europa... no me gusta nada": una fila de escudos, el elegido con su nombre encendido
const leagues = () => { const c = {}; for (const m of board()) if (S.f === 'all' || m.s === S.f) c[m.lg] = (c[m.lg] || 0) + 1;
  const ks = Object.keys(c).sort((a, b) => (TOP.has(b) - TOP.has(a)) || c[b] - c[a]);
  const it = (k, n, ico, cnt) => `<button class="lgc ${S.lg === k ? 'on' : ''}" data-lg="${esc(k)}" title="${esc(n)}${cnt != null ? ' · ' + cnt : ''}"><span class="lgc-i">${ico}${cnt != null ? `<i>${cnt}</i>` : ''}</span><span class="lgc-n">${esc(n)}</span></button>`;
  return `<div class="lgw"><button class="lga l" data-lga="-1" aria-label="Anteriores" hidden><svg viewBox="0 0 24 24"><path d="M14.5 6l-6 6 6 6"/></svg></button><button class="lga r" data-lga="1" aria-label="Más ligas" hidden><svg viewBox="0 0 24 24"><path d="M9.5 6l6 6-6 6"/></svg></button><nav class="lgs2" data-lgs>${it('top', 'Principales', IC_TOP, null)}${it('all', 'Todas', IC_ALL, null)}${ks.map((k) => it(k, L[k]?.[0] || k, `<img class="tl" src="${esc(L[k]?.[1])}" alt="" loading="lazy">`, c[k])).join('')}</nav></div>` };
let LGX = 0;
function lgFlechas() {
  const n = document.querySelector('[data-lgs]'); if (!n) return;
  if (n.scrollLeft !== LGX) n.scrollLeft = LGX;
  const pon = () => { const w = n.closest('.lgw'); w.querySelector('.l').hidden = n.scrollLeft < 8; w.querySelector('.r').hidden = n.scrollLeft + n.clientWidth > n.scrollWidth - 8; w.classList.toggle('fin', n.scrollLeft + n.clientWidth > n.scrollWidth - 8) };
  n.onscroll = () => { LGX = n.scrollLeft; pon() };
  pon();
}
const betRow = (b) => {
  const m = byId(b.m); if (!m) return '';
  const st = b.st === 'open' ? (m.live ? 'live' : 'pend') : b.st;
  const lbl = { pend: 'Pendiente', live: 'En juego', won: 'Ganada', lost: 'Perdida', void: 'Anulada' }[st];
  const val = st === 'won' ? '+' + N(b.pay) : st === 'lost' || st === 'void' ? N(b.stake) : N(b.stake * b.o);
  const match = `${m.a} ${m.score && b.st !== 'open' ? m.score : 'vs'} ${m.b} · ${b.st === 'open' ? (m.live ? 'en juego' : WD(m.at).toLowerCase() + ' ' + HM(m.at)) : when(b.set)}`;
  return `<div class="bet ${st} ${canCancel(b) ? 'can' : ''}" data-goto="${m.id}"><img class="sp" src="${SP[m.s][1]}" alt=""><div style="min-width:0"><span class="p">${esc(pn(m, b.p))}<em>${O(b.o)} · ${N(b.stake)}</em>${isDaily(m) ? dailyTag(m) : ''}</span><span class="m">${esc(match)}</span></div><div class="v"><b>${val}</b><span class="st">${lbl}</span></div>${cancelBtn(b)}</div>`;
};

/* ---------- extras de la version nueva ---------- */
// cuotas de la vez anterior (para las flechas de subida y bajada); se guardan al salir de la pagina
let ODDS0 = {}; try { ODDS0 = JSON.parse(localStorage.getItem('apuestas-cuotas') || '{}') } catch {}
const guardaCuotas = () => { try { const o = {}; for (const m of M) if (m.status === 'scheduled' && m.o[0]) o[m.id] = m.o; localStorage.setItem('apuestas-cuotas', JSON.stringify(o)) } catch {} };
addEventListener('pagehide', guardaCuotas);
const isDaily = (m) => DAILY.some((d) => d.match === m.id);
const fmtPay = (t) => { const s = Math.max(0, (t - Date.now()) / 1e3), d = (s / 86400) | 0, h = ((s % 86400) / 3600) | 0, mi = ((s % 3600) / 60) | 0, se = (s % 60) | 0, z = (n) => String(n).padStart(2, '0'); return `${d ? d + 'd ' : ''}${z(h)}:${z(mi)}:${z(se)}` };
const myBetsOn = (mid) => ALL.filter((b) => b.k === MEK && b.m === mid && b.st === 'open');
const canCancel = (b) => { const m = byId(b.m); return b.k === MEK && b.st === 'open' && m && isOpen(m) };
const cancelBtn = (b) => (canCancel(b) ? `<button class="x-cancel ${S.sure === 'b' + b.id ? 'sure' : ''}" data-cancel="${b.id}">${S.sure === 'b' + b.id ? '¿Seguro? Toca otra vez' : 'Cancelar'}</button>` : '');
const STAR = '<svg class="star" viewBox="0 0 24 24"><path d="M12 3.2l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.5l6-.8z"/></svg>';
const dailyTag = (m) => (isDaily(m) ? `<span class="dly" title="Apuesta del día${DAILY_ON ? ': se cobra ×' + O(DAILY_BONUS) : ''}">${STAR}${DAILY_ON ? '×' + O(DAILY_BONUS) : ''}</span>` : '');
const calcChips = () => `<span class="calc"><span class="lab">Cobro con</span>${[0, 100, 250, 500, 1000].map((v) => `<button class="chip ${S.calc === v ? 'on' : ''}" data-calc="${v}">${v ? N(v) : 'nada'}</button>`).join('')}</span>`;
const oddBtn = (m, p, open) => { const o = po(m, p); if (o == null) return '<span class="o na">·</span>'; const mv = m.mv?.[PI[p]] || 0;
  return `<button class="o ${isSel(m, p) ? 'on' : ''} ${isMine(m, p) ? 'mine' : ''}" data-pick="${m.id}|${p}" ${open ? '' : 'disabled'}>${mv ? `<i class="mv ${mv > 0 ? 'up' : 'dn'}">${mv > 0 ? '▲' : '▼'}</i>` : ''}${O(o)}${S.calc && open ? `<small>${N(S.calc * o)}</small>` : ''}</button>` };

/* datos en directo de ESPN (posesion, tiros, ultimos 5, clasificacion, canales). Se piden desde la app, solo para el partido abierto */
const ESPN = new Map();
async function espnData(m) {
  if (!m.espn) return null;
  const k = m.id, c = ESPN.get(k);
  if (c && Date.now() - c.t < (m.live ? 55e3 : 6e5)) return c.d;
  const { sport, league, event } = m.espn;
  try {
    const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/summary?event=${event}`);
    if (!r.ok) return null;
    const d = await r.json(); ESPN.set(k, { t: Date.now(), d }); return d;
  } catch { return null }
}
const STATS = [['possessionPct', 'Posesión', '%'], ['totalShots', 'Tiros'], ['shotsOnTarget', 'A puerta'], ['wonCorners', 'Córners'], ['foulsCommitted', 'Faltas'], ['yellowCards', 'Amarillas'], ['redCards', 'Rojas'], ['offsides', 'Fueras de juego']];
function espnHtml(m, d) {
  let h = '';
  const comp = d?.header?.competitions?.[0];
  if (m.live && comp) {
    const st = comp.status?.type || {}, home = comp.competitors?.find((x) => x.homeAway === 'home'), away = comp.competitors?.find((x) => x.homeAway === 'away');
    if (home && away) {
      m.score = `${home.score ?? 0}:${away.score ?? 0}`;
      h += `<div class="lv"><span class="lab"><i class="dot"></i>En directo · ${esc(comp.status?.displayClock || st.shortDetail || '')}</span><b class="lv-sc">${esc(m.score)}</b></div>`;
    }
    const tA = d.boxscore?.teams?.find((t) => t.homeAway === 'home') || d.boxscore?.teams?.[0], tB = d.boxscore?.teams?.find((t) => t.homeAway === 'away') || d.boxscore?.teams?.[1];
    const val = (t, k) => { const x = t?.statistics?.find((s) => s.name === k); return x ? parseFloat(x.displayValue) : null };
    const rows = STATS.map(([k, n, u]) => [n, val(tA, k), val(tB, k), u]).filter((r) => r[1] != null && r[2] != null);
    if (rows.length) h += `<div class="sts">${rows.map(([n, a, b, u]) => { const t = a + b || 1; return `<div class="st2"><span>${a}${u || ''}</span><span class="k">${n}</span><span>${b}${u || ''}</span><i class="bar"><b style="width:${(a / t) * 100}%"></b><b style="width:${(b / t) * 100}%"></b></i></div>` }).join('')}</div>`;
  }
  // alineaciones (ESPN las publica cerca del partido)
  const ro = (d?.rosters || []).filter((r) => (r.roster || []).some((x) => x.starter));
  if (ro.length === 2) {
    const col = (r) => { const xi = r.roster.filter((x) => x.starter); return `<div class="xi"><span class="lab">${esc(r.team?.displayName || '')}${r.formation ? ' · ' + esc(r.formation) : ''}</span>${xi.map((x) => `<span class="xp"><b>${esc(x.jersey || '')}</b>${esc(x.athlete?.displayName || '')}<i>${esc(x.position?.abbreviation || '')}</i></span>`).join('')}</div>` };
    h += `<div class="alin"><span class="lab">Alineaciones</span><div class="alin2">${col(ro[0])}${col(ro[1])}</div></div>`;
  } else if (!m.live && m.s === 'f') h += `<p class="hint">Las alineaciones salen cuando los equipos las dan, sobre una hora antes.</p>`;
  // ultimos 5 de cada uno
  const l5 = d?.lastFiveGames;
  if (Array.isArray(l5) && l5.length) {
    h += `<div class="l5"><span class="lab">Últimos 5</span>${l5.slice(0, 2).map((t) => `<div class="l5r"><span class="nm">${esc(t.team?.displayName || '')}</span><span class="fm">${(t.events || []).slice(0, 5).map((e) => { const r = (e.gameResult || '').toUpperCase(); const c = r === 'W' ? 'g' : r === 'D' ? 'e' : ''; return `<b class="${c}" title="${esc((e.atVs || '') + ' ' + (e.opponent?.displayName || '') + ' ' + (e.score || ''))}">${r === 'W' ? 'G' : r === 'D' ? 'E' : r === 'L' ? 'P' : '·'}</b>` }).join('')}</span></div>`).join('')}</div>`;
  }
  // clasificacion: las filas de los dos equipos y las de arriba
  const ent = d?.standings?.groups?.[0]?.standings?.entries;
  if (Array.isArray(ent) && ent.length) {
    const ids = new Set((comp?.competitors || []).map((c) => c.team?.id || c.id));
    const val = (e, k) => e.stats?.find((s) => s.name === k || s.type === k)?.displayValue ?? '';
    const show = ent.map((e, i) => [e, i + 1]).filter(([e, i]) => i <= 4 || ids.has(e.id) || ids.has(e.team?.id));
    h += `<div class="tbl2"><span class="lab">Clasificación</span>${show.map(([e, i]) => `<div class="tr2 ${ids.has(e.id) || ids.has(e.team?.id) ? 'me' : ''}"><span class="p">${i}</span><span class="nm">${esc(e.team?.displayName || e.team || '')}</span><span>${esc(val(e, 'gamesPlayed'))}</span><span class="b">${esc(val(e, 'points'))}</span></div>`).join('')}</div>`;
  }
  // donde verlo: lo de ESPN en directo y lo guardado por el sincronizador
  const tv = [...(m.tv || [])];
  for (const b of d?.broadcasts || []) { const n = b.media?.shortName; if (n && !tv.some((x) => x.n === n)) tv.push({ n, l: /deportes|univision|unim[aá]s|tudn|telemundo|universo|vix/i.test(n) ? 'es' : b.lang || 'en' }) }
  h += tvHtml(tv, m);
  return h;
}
const LANG = { en: 'inglés', es: 'español', pt: 'portugués', fr: 'francés', de: 'alemán', ru: 'ruso', zh: 'chino', ja: 'japonés', ko: 'coreano', tr: 'turco', pl: 'polaco', it: 'italiano', ar: 'árabe', th: 'tailandés', vi: 'vietnamita' };
const mainTv = (m) => (m.tv || []).find((v) => v.u && v.main && /^(en|es)$/.test(v.l)) || (m.tv || []).find((v) => v.u && /^(en|es)$/.test(v.l)) || (m.tv || []).find((v) => v.u);
const tvHtml = (tv, m) => {
  const link = (v) => (v.u ? `<a class="tv" href="${esc(v.u)}" target="_blank" rel="noopener">${esc(v.n)}${v.l && !/^(en|es)$/.test(v.l) ? ' · ' + esc(LANG[v.l] || v.l) : ''} ↗</a>` : `<span class="tv">${esc(v.n)}</span>`);
  const col = (ls, t) => { const x = tv.filter((v) => ls.includes(v.l)); return x.length ? `<div><span class="lab">${t}</span>${x.map(link).join('')}</div>` : '' };
  const otros = tv.filter((v) => !['en', 'es'].includes(v.l));
  let cols = col(['en'], 'En inglés') + col(['es'], 'En español') + (otros.length ? `<div><span class="lab">Otros idiomas</span>${otros.map(link).join('')}</div>` : '');
  // esports sin emision apuntada: buscarlo en Twitch y YouTube
  if (!cols && m && (m.s === 'v' || m.s === 'c')) { const q = encodeURIComponent((L[m.lg]?.[0] || '') + ' ' + m.a + ' ' + m.b); cols = `<div><span class="lab">Buscarlo</span><a class="tv" href="https://www.twitch.tv/search?term=${encodeURIComponent(L[m.lg]?.[0] || m.a)}" target="_blank" rel="noopener">Twitch ↗</a><a class="tv" href="https://www.youtube.com/results?search_query=${q}" target="_blank" rel="noopener">YouTube ↗</a></div>` }
  return cols ? `<div class="ver"><span class="lab">Dónde verlo</span><div class="ver2">${cols}</div></div>` : '' };
async function fillEspn() {
  const box = document.getElementById('espn-box'); if (!box) return;
  const m = byId(box.dataset.m); if (!m) return;
  if (!m.espn) { box.innerHTML = tvHtml(m.tv || [], m); return }
  const d = await espnData(m);
  const now = document.getElementById('espn-box'); if (!now || now.dataset.m !== m.id) return;
  now.innerHTML = d ? espnHtml(m, d) : tvHtml(m.tv || [], m);
  if (window.GM_LANG) GM_LANG.traduce(now);
}

/* ficha de un equipo o un luchador: ESPN (futbol y UFC) desde la app; Valorant con lo que guarda el sincronizador */
const SHEETS = new Map();
async function sheetData(m, side) {
  const k = m.id + side, c = SHEETS.get(k);
  if (c && Date.now() - c.t < 6e5) return c.d;
  const id = m.espn?.ids?.[side];
  let d = null;
  try {
    if (m.s === 'f' && id) {
      const base = `https://site.api.espn.com/apis/site/v2/sports/soccer/${m.espn.league}/teams/${id}`;
      const [sc, ro] = await Promise.all([fetch(base + '/schedule').then((r) => r.json()), fetch(base + '/roster').then((r) => r.json()).catch(() => null)]);
      d = { sc, ro };
    } else if ((m.s === 'v' || m.s === 'c') && m.tid) {
      const juego = m.s === 'v' ? 'valorant' : 'csgo';
      const { data } = await db.from('teams').select('id,data').in('id', [`${juego}:${m.tid.a}`, `${juego}:${m.tid.b}`]);
      const t = Object.fromEntries((data || []).map((r) => [r.id, r.data]));
      d = { yo: t[`${juego}:${m.tid[side]}`] || null, otro: t[`${juego}:${m.tid[side === 'a' ? 'b' : 'a']}`] || null, rival: m.tid[side === 'a' ? 'b' : 'a'] };
    } else if (m.s === 'u' && id) {
      d = { at: await fetch(`https://site.web.api.espn.com/apis/common/v3/sports/mma/ufc/athletes/${id}`).then((r) => r.json()) };
    }
  } catch { d = null }
  SHEETS.set(k, { t: Date.now(), d });
  return d;
}
const dmy = (t) => `${DD(t)} ${MO(t)}`;
// PM, 30-10: "VCT China Stage 2" mas corto: fuera los anos y las palabras largas
const corto = (t) => { const x = String(t || '').replace(/\b20\d\d\b/g, '').replace(/Champions Tour/gi, '').replace(/Group Stage/gi, 'Grupos').replace(/\bStage\s*/gi, 'S').replace(/Qualifiers?/gi, 'Qual').replace(/Season\s*/gi, 'T').replace(/Championship/gi, 'Champ').replace(/\s{2,}/g, ' ').replace(/[\s:·]+$/, '').trim(); return x.length > 28 ? x.slice(0, 27) + '…' : x };
const res = (r) => `<b class="rs ${r === 'W' ? 'g' : r === 'D' ? 'e' : 'p'}">${r === 'W' ? 'G' : r === 'D' ? 'E' : 'P'}</b>`;
function sheetFutbol(m, side, d) {
  const id = String(m.espn.ids[side]);
  const evs = (d.sc?.events || []).map((e) => { const c = e.competitions?.[0] || {}; const yo = (c.competitors || []).find((x) => String(x.team?.id) === id), el = (c.competitors || []).find((x) => String(x.team?.id) !== id);
    const sc = (x) => x?.score?.displayValue ?? x?.score ?? ''; const hecho = c.status?.type?.completed;
    const r = hecho ? (yo?.winner ? 'W' : el?.winner ? 'L' : 'D') : null;
    return { at: Date.parse(e.date), hecho, r, rival: el?.team?.displayName || el?.team?.shortDisplayName || '', logo: el?.team?.logos?.[0]?.href || el?.team?.logo || null, casa: yo?.homeAway === 'home', marca: hecho ? `${sc(yo)}:${sc(el)}` : '' } });
  const jugados = evs.filter((e) => e.hecho).sort((a, b) => b.at - a.at).slice(0, 8), proximos = evs.filter((e) => !e.hecho).sort((a, b) => a.at - b.at).slice(0, 4);
  const fila = (e) => `<div class="shr">${img(e.logo, 'tl')}<span class="nm">${e.casa ? '' : '@ '}${esc(e.rival)}</span><span class="dt">${dmy(e.at)}</span>${e.hecho ? `<span class="mk">${esc(e.marca)}</span>${res(e.r)}` : `<span class="mk">${HM(e.at)}</span>`}</div>`;
  let h = jugados.length ? `<div class="shs"><span class="lab">Forma</span><span class="fm big">${jugados.slice(0, 5).reverse().map((e) => res(e.r)).join('')}</span></div><div class="shs"><span class="lab">Últimos partidos</span>${jugados.map(fila).join('')}</div>` : '';
  if (proximos.length) h += `<div class="shs"><span class="lab">Próximos</span>${proximos.map(fila).join('')}</div>`;
  const at = d.ro?.athletes || [];
  if (at.length) {
    const g = { G: 'Porteros', D: 'Defensas', M: 'Centrocampistas', F: 'Delanteros' };
    h += `<div class="shs"><span class="lab">Plantilla</span><div class="sq">${Object.entries(g).map(([k, n]) => { const x = at.filter((a) => (a.position?.abbreviation || '')[0] === k); return x.length ? `<div><small>${n}</small>${x.map((a) => `<span><b>${esc(a.jersey || '')}</b>${esc(a.displayName)}</span>`).join('')}</div>` : '' }).join('')}</div></div>`;
  }
  return h || '<p class="hint">ESPN no tiene más datos de este equipo.</p>';
}
function sheetUfc(m, side, d) {
  const a = d.at?.athlete; if (!a) return '<p class="hint">ESPN no tiene la ficha de este luchador.</p>';
  const st = Object.fromEntries((a.statsSummary?.statistics || []).map((x) => [x.abbreviation, x.displayValue]));
  const bio = [['Récord', st['W-L-D']], ['KO / TKO', st['(T)KO']], ['Sumisiones', st.SUB], ['Edad', a.age], ['Altura', a.displayHeight], ['Peso', a.displayWeight], ['Alcance', a.displayReach], ['Guardia', a.stance?.text], ['País', a.flag?.alt || a.citizenship], ['Gimnasio', a.association?.name], ['Categoría', a.weightClass?.text], ['Apodo', a.nickname]].filter((x) => x[1]);
  const peleas = Object.values(d.at.eventsMap || {}).filter((e) => e.gameResult).sort((x, y) => Date.parse(y.gameDate) - Date.parse(x.gameDate)).slice(0, 8);
  return `<div class="bio">${bio.map(([k, v]) => `<div><span class="lab">${k}</span><b>${esc(String(v).replace(/-/g, '·'))}</b></div>`).join('')}</div>
    ${peleas.length ? `<div class="shs"><span class="lab">Últimas peleas</span>${peleas.map((e) => `<div class="shr"><span class="nm">${esc(e.opponent?.displayName || '')}</span><span class="dt">${esc(e.shortName || '')} · ${dmy(Date.parse(e.gameDate))}</span>${res(e.gameResult === 'W' ? 'W' : e.gameResult === 'D' ? 'D' : 'L')}</div>`).join('')}</div>` : ''}`;
}
// Valorant y CS2: historial de PandaScore que guarda el sincronizador en la tabla teams (db/006)
function sheetEsports(m, side, d) {
  const t = d.yo; if (!t) return sheetValorant(m, side);
  const h = t.hist || [], w = h.filter((x) => x.won).length, mapsW = h.reduce((a, x) => a + (+String(x.score).split(':')[0] || 0), 0), mapsL = h.reduce((a, x) => a + (+String(x.score).split(':')[1] || 0), 0);
  let racha = 0; for (const x of h) { if (x.won === h[0]?.won) racha++; else break }
  const nm = side === 'a' ? m.a : m.b, prox = board().filter((x) => x.id !== m.id && (x.a === nm || x.b === nm)).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(0, 4);
  const h2h = h.filter((x) => String(x.vsId) === String(d.rival));
  const kpi = [['Últimos ' + h.length, `${w}-${h.length - w}`], ['Victorias', h.length ? Math.round((w / h.length) * 100) + '%' : '·'], ['Racha', h.length ? `${racha} ${h[0].won ? 'ganados' : 'perdidos'}` : '·'], ['Mapas', `${mapsW}-${mapsL}`], ['País', t.loc || '·'], ['Siglas', t.acr || '·']];
  let o = `<div class="bio">${kpi.map(([k, v]) => `<div><span class="lab">${k}</span><b>${esc(String(v))}</b></div>`).join('')}</div>`;
  if (h.length) o += `<div class="shs"><span class="lab">Forma</span><span class="fm big">${h.slice(0, 5).reverse().map((x) => res(x.won ? 'W' : 'L')).join('')}</span></div>`;
  if (h2h.length) o += `<div class="shs"><span class="lab">Cara a cara</span>${h2h.map((e) => `<div class="shr">${img(e.logo, 'tl')}<span class="nm">${esc(e.vs)}${e.t ? `<small>${esc(corto(e.t))}</small>` : ''}</span><span class="dt">${e.at ? dmy(Date.parse(e.at)) : ''}</span><span class="mk">${esc(e.score)}</span>${res(e.won ? 'W' : 'L')}</div>`).join('')}</div>`;
  if (h.length) o += `<div class="shs"><span class="lab">Últimos resultados</span>${h.map((e) => `<div class="shr">${img(e.logo, 'tl')}<span class="nm">${esc(e.vs)}${e.t ? `<small>${esc(corto(e.t))}</small>` : ''}</span><span class="dt">${e.at ? dmy(Date.parse(e.at)) : ''}</span><span class="mk">${esc(e.score)}</span>${res(e.won ? 'W' : 'L')}</div>`).join('')}</div>`;
  if (prox.length) o += `<div class="shs"><span class="lab">Próximos</span>${prox.map((x) => { const r = x.a === nm ? x.b : x.a; return `<div class="shr">${img(x.a === nm ? x.lb : x.la, 'tl')}<span class="nm">${esc(r)}<small>${esc(corto(L[x.lg]?.[0] || ''))}</small></span><span class="dt">${dmy(Date.parse(x.at))}</span><span class="mk">${HM(Date.parse(x.at))}</span><span></span></div>` }).join('')}</div>`;
  const pl = t.players || m.players?.[side] || [];
  if (pl.length) o += `<div class="shs"><span class="lab">Jugadores</span><div class="pls">${pl.map((x) => `<div class="pl">${x.img ? `<img class="face" src="${esc(x.img)}" alt="" loading="lazy">` : `<span class="pl-i">${esc((x.n || '?').slice(0, 2).toUpperCase())}</span>`}<b>${esc(x.n)}</b><span>${esc([x.nombre, x.nat, x.age ? x.age + ' años' : null].filter(Boolean).join(' · '))}</span></div>`).join('')}</div></div>`;
  return o;
}
function sheetValorant(m, side) {
  const pl = m.players?.[side] || [], rc = m.recent?.[side] || [];
  let h = '';
  if (pl.length) h += `<div class="shs"><span class="lab">Jugadores</span><div class="pls">${pl.map((x) => `<div class="pl">${x.img ? `<img class="face" src="${esc(x.img)}" alt="" loading="lazy">` : `<span class="pl-i">${esc((x.n || '?').slice(0, 2).toUpperCase())}</span>`}<b>${esc(x.n)}</b><span>${esc([x.nombre, x.nat].filter(Boolean).join(' · '))}</span></div>`).join('')}</div></div>`;
  if (rc.length) h += `<div class="shs"><span class="lab">Últimos resultados</span>${rc.map((e) => `<div class="shr">${img(e.logo, 'tl')}<span class="nm">${esc(e.vs)}${e.t ? `<small>${esc(corto(e.t))}</small>` : ''}</span><span class="dt">${e.at ? dmy(Date.parse(e.at)) : ''}</span><span class="mk">${esc(e.score)}</span>${res(e.won ? 'W' : 'L')}</div>`).join('')}</div>`;
  return h || '<p class="hint">PandaScore todavía no tiene datos de este equipo.</p>';
}
function sheet(m, side) {
  const nm = side === 'a' ? m.a : m.b;
  return `<section class="det sheet ${S.sheet ? 'open' : ''}" data-keep="dt">
    <button class="det-x vis" data-act="sheet-back">← ${esc(m.a)} vs ${esc(m.b)}</button>
    <div class="sh-hd">${logo(m, side)}<div><h2>${esc(nm)}</h2><span class="lab">${esc(L[m.lg][0])}${m.stage ? ' · ' + esc(m.stage) : ''}</span></div></div>
    <div id="sheet-box" data-m="${m.id}" data-side="${side}">${'<p class="hint">Cargando la ficha…</p>'}</div>
  </section>`;
}
async function fillSheet() {
  const box = document.getElementById('sheet-box'); if (!box) return;
  const m = byId(box.dataset.m), side = box.dataset.side; if (!m) return;
  const d = await sheetData(m, side);
  const now = document.getElementById('sheet-box'); if (!now || now.dataset.m !== m.id || now.dataset.side !== side) return;
  now.innerHTML = !d ? '<p class="hint">No se ha podido cargar la ficha.</p>' : m.s === 'f' ? sheetFutbol(m, side, d) : m.s === 'u' ? sheetUfc(m, side, d) : sheetEsports(m, side, d);
  if (window.GM_LANG) GM_LANG.traduce(now);
}

/* bracket del torneo (Valorant y CS2; lo guarda el sincronizador en la tabla brackets, db/011) */
const BRK = new Map();
const brRonda = (n) => String(n).split(':')[0].replace(/\s+(Match\s+)?\d+$/i, '').trim();
const brSec = (n) => (/grand final/i.test(n) ? 'Gran final' : /lower/i.test(n) ? 'Cuadro de perdedores' : /upper/i.test(n) ? 'Cuadro de ganadores' : 'Eliminatorias');
const brNom = (r) => { const x = r.replace(/^(upper|lower) bracket\s*/i, '').trim(); return /grand final/i.test(x) ? 'Gran final' : /^quarter/i.test(x) ? 'Cuartos' : /^semi/i.test(x) ? 'Semis' : /^final$/i.test(x) ? 'Final' : x.replace(/^round/i, 'Ronda') || 'Ronda' };
function bracketHtml(ms, cur) {
  const secs = new Map();
  for (const x of ms) { const sc = brSec(x.name), rk = brRonda(x.name); if (!secs.has(sc)) secs.set(sc, new Map()); const rs = secs.get(sc); if (!rs.has(rk)) rs.set(rk, []); rs.get(rk).push(x) }
  const t0 = (x) => Date.parse(x.at || '') || 9e15;
  const orden = ['Cuadro de ganadores', 'Eliminatorias', 'Cuadro de perdedores', 'Gran final'];
  const fila = (x, e, sc, w) => `<div class="bt ${w ? 'w' : ''} ${e ? '' : 'tbd'}">${e?.img ? `<img class="tl" src="${esc(e.img)}" alt="" loading="lazy">` : '<span class="bt-i"></span>'}<span class="bt-n">${esc(e ? e.acr || e.n : 'Por decidir')}</span><b>${sc ?? ''}</b></div>`;
  return [...secs.entries()].sort((a, b) => orden.indexOf(a[0]) - orden.indexOf(b[0])).map(([sc, rs]) => {
    const cols = [...rs.entries()].sort((a, b) => Math.min(...a[1].map(t0)) - Math.min(...b[1].map(t0)) || a[1][0].id - b[1][0].id);
    return `<section class="brk-s"><span class="lab">${sc}</span><div class="brk-cols">${cols.map(([rk, xs]) => `<div class="brk-c"><span class="brk-r">${esc(brNom(rk))}</span><div class="brk-ms">${xs.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true })).map((x) => {
      const live = x.st === 'running', fin = x.st === 'finished';
      return `<div class="brk-m ${live ? 'live' : ''} ${String(x.id) === cur ? 'yo' : ''}" data-bm="${x.id}" data-prev="${(x.prev || []).filter((p) => p.t === 'winner').map((p) => p.id).join(',')}">
        <span class="bm-h">${live ? 'EN VIVO' : fin ? 'Final' : x.at ? `${WD(Date.parse(x.at))} ${HM(Date.parse(x.at))}` : ''}${x.bo ? ' · BO' + x.bo : ''}</span>${fila(x, x.a, x.sa, fin && x.w && x.a && x.w === x.a.id)}${fila(x, x.b, x.sb, fin && x.w && x.b && x.w === x.b.id)}</div>` }).join('')}</div></div>`).join('')}</div></section>`;
  }).join('');
}
function bracketSheet(m) {
  return `<section class="det sheet ${S.sheet ? 'open' : ''}" data-keep="dt">
    <button class="det-x vis" data-act="brk-back">← ${esc(m.a)} vs ${esc(m.b)}</button>
    <div class="sh-hd"><img class="tl" src="${esc(L[m.lg]?.[1] || '')}" alt=""><div><h2>${esc(L[m.lg]?.[0] || '')}</h2><span class="lab">${esc(m.stage || '')}</span></div></div>
    <div id="brk-box" data-t="${esc(m.tour)}" data-cur="${esc(String(m.id).split(':').pop())}"><p class="hint">Cargando el bracket…</p></div>
  </section>`;
}
async function fillBracket() {
  const box = document.getElementById('brk-box'); if (!box) return;
  const k = box.dataset.t; let d = BRK.get(k);
  if (!d || Date.now() - d.t > 3e5) { const { data } = await db.from('brackets').select('data').eq('id', k).maybeSingle(); d = { t: Date.now(), ms: data?.data || [] }; BRK.set(k, d) }
  const now = document.getElementById('brk-box'); if (!now || now.dataset.t !== k) return;
  now.innerHTML = d.ms.length ? `<div class="brk">${bracketHtml(d.ms, now.dataset.cur)}</div>` : '<p class="hint">Este torneo todavía no tiene bracket.</p>';
  if (window.GM_LANG) GM_LANG.traduce(now);
  brLineas(now);
  const yo = now.querySelector('.brk-m.yo'), cols = yo?.closest('.brk-cols'); if (cols) cols.scrollLeft = Math.max(0, yo.offsetLeft - cols.clientWidth / 2 + yo.offsetWidth / 2);
}
// lineas de quien pasa a donde, dentro de cada cuadro
function brLineas(box) {
  box.querySelectorAll('.brk-s').forEach((sec) => {
    const cols = sec.querySelector('.brk-cols'); cols.querySelector('svg.brk-l')?.remove();
    const R = cols.getBoundingClientRect(), W = cols.scrollWidth, H = cols.scrollHeight;
    let d = '';
    cols.querySelectorAll('.brk-m[data-prev]').forEach((m) => {
      for (const id of (m.dataset.prev || '').split(',').filter(Boolean)) {
        const p = cols.querySelector(`.brk-m[data-bm="${id}"]`); if (!p) continue;
        const a = p.getBoundingClientRect(), b = m.getBoundingClientRect();
        const x1 = a.right - R.left + cols.scrollLeft, y1 = a.top + a.height / 2 - R.top, x2 = b.left - R.left + cols.scrollLeft, y2 = b.top + b.height / 2 - R.top, xm = (x1 + x2) / 2;
        d += `M${x1} ${y1}H${xm}V${y2}H${x2}`;
      }
    });
    if (d) cols.insertAdjacentHTML('afterbegin', `<svg class="brk-l" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${d}"/></svg>`);
  });
}

/* retos 1 contra 1 */
const chName = (st) => ({ pending: 'Esperando respuesta', accepted: 'En juego', declined: 'Rechazado', expired: 'Sin contestar', canceled: 'Retirado', won_from: 'Ganado', won_to: 'Ganado', void: 'Sin ganador' }[st] || st);
function retoRow(c) {
  const m = byId(c.m); if (!m) return '';
  const forMe = c.to === MEK && c.st === 'pending' && isOpen(m), mine = c.from === MEK && c.st === 'pending';
  const win = c.st === 'won_from' ? c.from : c.st === 'won_to' ? c.to : null;
  let act = '';
  if (forMe) act = `<span class="rt-act">${picksOf(m).filter((p) => p !== c.fp).map((p) => `<button class="chip" data-accept="${c.id}|${p}">Acepto ${esc(pn(m, p))}</button>`).join('')}<button class="chip q" data-decline="${c.id}">No</button></span>`;
  else if (mine) act = `<span class="rt-act"><button class="chip q" data-retirar="${c.id}">Retirar</button></span>`;
  return `<div class="rt ${c.st}"><div class="rt-who">${av(c.from, 'sm')}<i>vs</i>${av(c.to, 'sm')}</div>
    <div style="min-width:0"><strong>${esc(fr(c.from).n)} · ${esc(pn(m, c.fp))}${c.tp ? ` <i>contra</i> ${esc(fr(c.to).n)} · ${esc(pn(m, c.tp))}` : ` <i>reta a</i> ${esc(fr(c.to).n)}`}</strong>
    <span class="m">${esc(m.a)} vs ${esc(m.b)} · ${m.live ? 'en juego' : c.st === 'pending' || c.st === 'accepted' ? WD(m.at).toLowerCase() + ' ' + HM(m.at) + ' · ' + CD(m.at) : when(c.set || c.at)}</span></div>
    <div class="v"><b>${N(c.stake * 2)}</b><span class="st">${win ? 'Gana ' + esc(fr(win).n) : chName(c.st)}</span></div>${act}</div>`;
}
const retosHtml = (list, empty) => (list.length ? `<div class="rts">${list.map(retoRow).join('')}</div>` : `<p class="hint">${empty}</p>`);
function retoForm(m) {
  const r = S.reto; if (!r || r.m !== m.id) return `<button class="go ghost" data-retar="${m.id}">Retar a un colega en este partido</button>`;
  const others = F.filter((f) => !f.me), st = Math.max(0, Math.min(r.stake, me().s));
  return `<div class="rform"><span class="lab">Reto 1 contra 1 · el que acierte se lleva lo de los dos</span>
    <div class="rf-row">${others.map((f) => `<button class="rf-to ${r.to === f.id ? 'on' : ''}" data-rto="${f.id}">${av(f.id)}<span>${esc(f.n)}</span></button>`).join('')}</div>
    <div class="rf-row">${picksOf(m).map((p) => `<button class="chip ${r.p === p ? 'on' : ''}" data-rpick="${p}">${esc(pn(m, p))}</button>`).join('')}</div>
    <div class="rf-row">${[100, 250, 500, 1000].map((v) => `<button class="chip ${r.stake === v ? 'on' : ''}" data-rstake="${v}">${N(v)}</button>`).join('')}</div>
    <p class="hint">${r.to && r.p ? `Pones ${N(st)}. Si ${esc(fr(r.to).n)} acepta, hay ${N(st * 2)} en juego.` : 'Elige colega y resultado.'}</p>
    <div class="rf-row"><button class="go" data-act="reto-send" ${r.to && r.p && st >= 1 ? '' : 'disabled'}>Enviar reto de ${N(st)}</button><button class="chip q" data-act="reto-close">Cerrar</button></div></div>`;
}

/* logros (se calculan con lo que ya hay) */
const LOGROS = [
  ['primera', 'Primera victoria', 'Gana una apuesta', (f, b) => b.some((x) => x.st === 'won')],
  ['racha3', 'En racha', '3 ganadas seguidas', (f) => f.streak >= 3],
  ['racha5', 'Imparable', '5 ganadas seguidas', (f) => f.streak >= 5],
  ['valiente', 'Valiente', 'Gana con cuota de 3 o más', (f, b) => b.some((x) => x.st === 'won' && x.o >= 3)],
  ['tirador', 'Francotirador', 'Gana con cuota de 5 o más', (f, b) => b.some((x) => x.st === 'won' && x.o >= 5)],
  ['todo', 'Todoterreno', 'Apuesta en fútbol, Valorant y UFC', (f, b) => DEP.every((s) => b.some((x) => byId(x.m)?.s === s))],
  ['fiel', 'Fiel', '20 apuestas', (f, b) => b.length >= 20],
  ['ballena', 'Ballena', 'Apuesta 1.000 de una vez', (f, b) => b.some((x) => x.stake >= 1000)],
  ['verde', 'En verde', 'Ten más de lo que te han dado', (f) => f.s > f.recibido && f.bets > 0],
  ['duelo', 'Duelista', 'Gana un reto 1 contra 1', (f) => CH.some((c) => (c.st === 'won_from' && c.from === f.id) || (c.st === 'won_to' && c.to === f.id))],
  ['dia', 'Del día', 'Acierta la apuesta del día', (f, b) => b.some((x) => x.st === 'won' && DAILY.some((d) => d.match === x.m))],
  ['rico', 'Rico', 'Llega a 5.000', (f) => f.s >= 5000],
];
const logrosDe = (f) => { const b = ALL.filter((x) => x.k === f.id); return LOGROS.map(([id, n, d, ok]) => [id, n, d, !!ok(f, b)]) };
const MEDAL = '<svg viewBox="0 0 24 24"><circle cx="12" cy="14.5" r="5.5"/><path d="M8.5 9.6L6 3.5h4l2 4 2-4h4l-2.5 6.1"/></svg>';

/* avisos del navegador (mientras la app esta abierta, aunque sea de fondo) y confeti al ganar */
let SNAP = null;
function avisos() {
  const now = { bets: new Map(ALL.filter((b) => b.k === MEK).map((b) => [b.id, b.st])), ch: new Map(CH.map((c) => [c.id, c.st])), live: new Set(M.filter((m) => m.live && myBetsOn(m.id).length).map((m) => m.id)) };
  if (SNAP) {
    for (const b of ALL.filter((x) => x.k === MEK)) {
      const was = SNAP.bets.get(b.id); if (!was || was === b.st || was !== 'open') continue;
      const m = byId(b.m); if (!m) continue;
      if (b.st === 'won') { confeti(); avisa('¡Has ganado ' + N(b.pay) + '!', `${pn(m, b.p)} · ${m.a} ${m.score || ''} ${m.b}`); toast(`¡Ganada! <b>+${N(b.pay)}</b> con ${esc(pn(m, b.p))}`) }
      else if (b.st === 'lost') avisa('Apuesta perdida', `${pn(m, b.p)} · ${m.a} ${m.score || ''} ${m.b}`);
    }
    for (const c of CH) {
      const was = SNAP.ch.get(c.id), m = byId(c.m); if (!m) continue;
      if (!was && c.to === MEK && c.st === 'pending') avisa(`${fr(c.from).n} te reta`, `${m.a} vs ${m.b} · ${N(c.stake)} a ${pn(m, c.fp)}`);
      if (was && was !== c.st && (c.st === 'won_from' || c.st === 'won_to')) { const w = c.st === 'won_from' ? c.from : c.to; if (w === MEK) confeti(); if (c.from === MEK || c.to === MEK) avisa(w === MEK ? '¡Reto ganado!' : 'Reto perdido', `${m.a} ${m.score || ''} ${m.b}`) }
      if (was === 'pending' && c.st === 'accepted' && c.from === MEK) avisa(`${fr(c.to).n} acepta tu reto`, `${m.a} vs ${m.b} · ${N(c.stake * 2)} en juego`);
    }
    for (const id of now.live) if (!SNAP.live.has(id)) { const m = byId(id); avisa('Empieza tu partido', `${m.a} vs ${m.b}`) }
  }
  SNAP = now;
}
function avisa(t, b) { try { if (window.Notification && Notification.permission === 'granted' && document.hidden) new Notification(t, { body: b, icon: 'img/icon-192.png', tag: t + b }) } catch {} }
function confeti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas'), x = c.getContext('2d'), W = (c.width = innerWidth), H = (c.height = innerHeight);
  c.className = 'confeti'; document.body.appendChild(c);
  const col = ['#f2c14e', '#ffdc85', '#cc6496', '#4d88e6', '#2bd47d', '#f4f2ec'];
  const P = Array.from({ length: 140 }, () => ({ x: W / 2 + (Math.random() - 0.5) * 200, y: H * 0.35, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 13 - 4, r: Math.random() * 6 + 3, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4, c: col[(Math.random() * col.length) | 0] }));
  const t0 = performance.now();
  (function f(t) {
    x.clearRect(0, 0, W, H);
    for (const p of P) { p.vy += 0.38; p.x += p.vx; p.y += p.vy; p.a += p.va; x.save(); x.translate(p.x, p.y); x.rotate(p.a); x.fillStyle = p.c; x.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); x.restore() }
    if (t - t0 < 1800) requestAnimationFrame(f); else c.remove();
  })(t0);
}
// la moneda que vuela del boton al saldo al apostar
function vuela(from) {
  const to = document.querySelector('.top .bal .cn'); if (!from || !to || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect(), c = document.createElement('span');
  c.className = 'cn vuela'; c.style.left = a.left + a.width / 2 - 14 + 'px'; c.style.top = a.top + a.height / 2 - 14 + 'px'; document.body.appendChild(c);
  requestAnimationFrame(() => { c.style.transform = `translate(${b.left - a.left - a.width / 2 + 14}px,${b.top - a.top - a.height / 2 + 14}px) scale(.8)`; c.style.opacity = '.2' });
  setTimeout(() => c.remove(), 750);
}
// el saldo de arriba sube o baja contando
let lastBal = null;
function cuentaSaldo() {
  const el = document.querySelector('.top .bal .num'); if (!el) return;
  const to = me().s, from = lastBal; lastBal = to;
  if (from == null || from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const t0 = performance.now(); el.classList.add(to > from ? 'sube' : 'baja');
  (function f(t) { const k = Math.min(1, (t - t0) / 700), e = 1 - Math.pow(1 - k, 3); el.textContent = N(from + (to - from) * e); if (k < 1) requestAnimationFrame(f); else setTimeout(() => el.classList.remove('sube', 'baja'), 400) })(t0);
}

/* ---------- Partidos ---------- */
function featured() {
  const soon = board().filter((m) => !m.live && Date.parse(m.at) < NOW + 4 * DAY && (TOP.has(m.lg) || m.s !== 'f'));
  const score = (m) => whoOn(m.id).length * 10 - (m.o[0] && m.o[2] ? Math.abs(m.o[0] - m.o[2]) : 9) + (TOP.has(m.lg) ? 2 : 0);
  return soon.sort((a, b) => score(b) - score(a)).slice(0, 3);
}
function partidos() {
  const list = filtered();
  if (!S.foc || !byId(S.foc) || !board().some((m) => m.id === S.foc)) S.foc = (featured()[0] || list[0] || {}).id;
  const feat = featured();
  const lives = M.filter((m) => m.live).sort((a, b) => whoOn(b.id).length - whoOn(a.id).length).slice(0, 14);
  let h = `<div class="p-wrap"><section class="p-board" data-keep="pb">
    ${lives.length ? `<div class="ticker"><span class="lab"><i class="dot"></i>En directo</span>${lives.map((m) => `<button class="tk" data-foc="${m.id}">${logo(m, 'a')}<b>${esc(m.score || '0:0')}</b>${logo(m, 'b')}<span>${esc(short(m))}</span></button>`).join('')}</div>` : ''}
    ${feat.length ? `<div class="feat">${feat.map((m) => `<button class="ft ${S.foc === m.id ? 'on' : ''}" data-foc="${m.id}">
      <span class="lab"><img src="${esc(L[m.lg][1])}" alt=""><b>${WD(m.at)} ${HM(m.at)}</b> · ${isDaily(m) ? 'Apuesta del día' : esc(m.tag || L[m.lg][0])}</span>
      <span class="ft-v">${logo(m, 'a')}<i>vs</i>${logo(m, 'b')}</span><span class="ft-n">${esc(m.a)} · ${esc(m.b)}</span>
      <span class="ft-o">${picksOf(m).map((p) => `<span>${p} <b>${po(m, p) ? O(po(m, p)) : '·'}</b></span>`).join('')}</span></button>`).join('')}</div>` : ''}
    <nav class="fil">${filt()}</nav>${leagues()}`;
  if (!list.length) h += `<p class="hint" style="padding:30px 0">No hay partidos con este filtro en los próximos días.</p>`;
  let ri = 0;
  for (const ms of groups(list)) {
    h += `<div class="day"><b>${DD(ms[0].at)}</b><span>${dayLab(ms[0].at)}</span><i>${ms.length} ${ms.length > 1 ? 'partidos' : 'partido'}</i></div>`;
    for (const m of ms) {
      const open = isOpen(m);
      h += `<div class="row ${S.foc === m.id ? 'on' : ''}" data-foc="${m.id}" style="--i:${Math.min(ri++, 14)}">
        <span class="t">${m.live ? '<em>VIVO</em>' : HM(m.at)}${m.live ? `<small class="sc">${esc(m.score || '')}</small>` : `<small>${CD(m.at)}</small>`}</span>
        <img class="ll" src="${esc(L[m.lg][1])}" alt="" title="${esc(L[m.lg][0])}" loading="lazy">
        <span class="tms"><span class="tm">${logo(m, 'a')}<span>${esc(m.a)}</span>${dailyTag(m)}</span><span class="tm">${logo(m, 'b')}<span>${esc(m.b)}</span></span></span>
        <span class="who">${whoOn(m.id).filter((x) => x.f !== MEK).map((x) => av(x.f, 'sm')).join('')}</span>
        ${['1', 'X', '2'].map((p) => oddBtn(m, p, open)).join('')}
      </div>`;
    }
  }
  return h + `</section>${byId(S.foc) ? ficha(byId(S.foc)) : '<section class="det"></section>'}</div>`;
}
function ficha(m) {
  if (S.brk && m.tour) return bracketSheet(m);
  if (S.side) return sheet(m, S.side);
  const open = isOpen(m), ps = picksOf(m).filter((p) => po(m, p) != null);
  const imp = ps.map((p) => 1 / po(m, p)), sum = imp.reduce((a, b) => a + b, 0) || 1, pct = imp.map((x) => Math.round((x / sum) * 100));
  const sel = S.sel && S.sel.m === m.id;
  const cell = (v) => (String(v).startsWith('F:') ? form(String(v).slice(2)) : esc(v));
  let h = `<section class="det ${S.sheet ? 'open' : ''}" data-keep="dt">
    <button class="det-x" data-act="close">← Partidos</button>
    <div class="d-meta"><img src="${esc(L[m.lg][1])}" alt="">${esc(L[m.lg][0])}${m.stage ? ' · ' + esc(m.stage) : ''}</div>
    ${m.tour ? `<button class="d-brk" data-act="bracket"><svg viewBox="0 0 24 24"><path d="M4 5h5v5H4zM4 14h5v5H4zM9 7.5h3v9H9M12 12h3M15 9.5h5v5h-5z"/></svg>Ver bracket</button>` : ''}
    ${mainTv(m) ? `<a class="d-ver" href="${esc(mainTv(m).u)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></svg>${m.live ? 'Verlo en directo' : 'Dónde verlo'} · ${esc(mainTv(m).n)}${mainTv(m).l ? ' en ' + esc(LANG[mainTv(m).l] || mainTv(m).l) : ''}</a>` : ''}
    <div class="d-cd">${m.live ? `En vivo · ${esc(m.score || '')}` : `${WD(m.at)} ${DD(m.at)} ${MO(m.at)} · ${HM(m.at)} · empieza en ${CD(m.at)}`}${m.venue ? ' · ' + esc(m.venue) : ''}</div>
    <div class="d-vs"><button class="d-side" data-side="a" title="Ver ficha">${logo(m, 'a')}<h3>${esc(m.a)}</h3><small>Ver ficha</small></button><span class="x">vs</span><button class="d-side" data-side="b" title="Ver ficha">${logo(m, 'b')}<h3>${esc(m.b)}</h3><small>Ver ficha</small></button></div>
    ${m.tag ? `<div class="d-tag">${esc(m.tag)}</div>` : ''}
    ${isDaily(m) ? `<div class="d-daily">${STAR}Apuesta del día${DAILY_ON ? ` · si aciertas cobras ×${O(DAILY_BONUS)}` : ' · el extra lo enciende PM'}</div>` : ''}
    ${m.tape.length ? `<div class="tape">${m.tape.map(([a, k, b]) => `<div class="tp"><span>${cell(a)}</span><span class="k">${esc(k)}</span><span>${cell(b)}</span></div>`).join('')}</div>` : ''}
    ${ps.length ? `<div class="prob">${ps.map((p, i) => `<i style="flex:${pct[i]}" class="${isSel(m, p) ? 'on' : ''}"></i>`).join('')}</div>
    <div class="prob-l">${ps.map((p, i) => `<span>${esc(p === 'X' ? 'empate' : pn(m, p))} ${pct[i]}%</span>`).join('')}</div>` : ''}
    <div class="picks ${open ? '' : 'closed'}" style="--n:${Math.max(1, ps.length)}">${ps.map((p) => `<button class="pk ${isSel(m, p) ? 'on' : ''} ${isMine(m, p) ? 'mine' : ''}" data-pick="${m.id}|${p}" ${open ? '' : 'disabled'}><span class="k">${p === 'X' ? 'X · EMPATE' : p + ' · GANA'}</span><span class="n">${esc(pn(m, p))}</span><b>${O(po(m, p))}</b></button>`).join('')}</div>
    <p class="hint" style="margin-top:10px">${m.src === 'draftkings' ? 'Cuotas reales de DraftKings' : 'Cuotas calculadas con la forma y el récord'} · se congelan al apostar</p>`;
  if (!open) h += `<p class="hint">${LOCK}Cerrado: ya ha empezado. Se paga solo al acabar.</p>`;
  else if (!sel) h += `<p class="hint">Elige ${ps.length > 2 ? '1, X o 2' : '1 o 2'} para apostar.</p>`;
  else {
    const o = po(m, S.sel.p), st = stakeNow(), pv = ((st / Math.max(1, me().s)) * 100).toFixed(1);
    h += `<div class="stk"><span class="lab">Apuestas</span><b data-sv>${N(st)}${coin()}</b>
      <input type="range" id="stake" min="1" max="${Math.max(1, me().s)}" step="1" value="${st}" data-in style="--p:${pv}%" aria-label="Cuánto apuestas"><div class="chips">${chips()}</div></div>
      <div class="ret"><span>Si aciertas con <em>${esc(pn(m, S.sel.p))} ${O(o)}</em></span><b data-ret>${N(st * o)}${coin()}</b></div>
      <div class="ret2" data-gain>${N(st * o - st)} limpias</div>
      <button class="go" data-act="bet" data-go ${st < 1 ? 'disabled' : ''}>Apostar ${N(st)}</button>`;
  }
  const mineHere = myBetsOn(m.id);
  if (mineHere.length) h += `<div class="d-mine"><span class="lab">Tus apuestas aquí</span>${mineHere.map((b) => `<div class="dm"><strong>${esc(pn(m, b.p))} <em>${O(b.o)}</em></strong><span>${N(b.stake)} → <b>${N(b.stake * b.o)}</b></span><button class="x-share" data-share="${b.id}">Al chat</button>${cancelBtn(b)}</div>`).join('')}</div>`;
  h += `<div id="espn-box" class="espn" data-m="${m.id}">${m.espn ? '<p class="hint">Cargando datos de ESPN…</p>' : tvHtml(m.tv || [], m)}</div>`;
  const rts = CH.filter((c) => c.m === m.id);
  if (isOpen(m) || rts.length) h += `<div class="d-retos">${rts.length ? retosHtml(rts, '') : ''}${isOpen(m) ? retoForm(m) : ''}</div>`;
  const ws = whoOn(m.id).filter((x) => x.f !== MEK);
  h += `<div class="d-fr"><span class="lab">Colegas en este partido</span>${F.filter((f) => !f.me).map((f) => {
    const x = ws.filter((y) => y.f === f.id);
    const st = !x.length ? `<span class="st">aún no ha apostado</span>` : x.map((y) => (y.p ? `<span class="st rev">${esc(pn(m, y.p))} ${O(y.o)} · ${N(y.stake)}</span>` : `<span class="st">${LOCK}${N(y.stake)} · se ve a las ${HM(m.at)}</span>`)).join(' ');
    return `<div class="ifr">${av(f.id)}<span class="nm">${esc(f.n)}</span>${st}</div>` }).join('')}</div></section>`;
  return h;
}

/* ---------- Mis apuestas ---------- */
function apuestas() {
  const mine = ALL.filter((b) => b.k === MEK), set = mine.filter((b) => b.st !== 'open'), won = set.filter((b) => b.st === 'won'), open = mine.filter((b) => b.st === 'open');
  const res = set.filter((b) => b.st !== 'void'), best = won.length ? Math.max(...won.map((b) => b.o)) : 0, f = me();
  const list = set.filter((b) => S.bf === 'all' || b.st === S.bf);
  return `<div class="pad">
    <div class="stats">
      <div class="stt"><span class="lab">En juego</span><b>${N(open.reduce((a, b) => a + b.stake, 0))}${coin()}</b><span>${open.length} apuestas abiertas</span></div>
      <div class="stt"><span class="lab">Apostado</span><b>${N(mine.reduce((a, b) => a + b.stake, 0))}</b><span>${mine.length} apuestas en total</span></div>
      <div class="stt"><span class="lab">Cobrado</span><b>${N(won.reduce((a, b) => a + b.pay, 0))}</b><span>${won.length} premios</span></div>
      <div class="stt ac"><span class="lab">Aciertos</span><b>${f.ac}</b><span>${f.acn} resueltas</span></div>
      <div class="stt"><span class="lab">Racha</span><b>${f.racha}</b><span>la de ahora</span></div>
      <div class="stt"><span class="lab">Mejor cuota</span><b>${best ? O(best) : '·'}</b><span>acertada</span></div>
    </div>
    <div class="potential"><span class="lab">Si aciertas todo lo abierto</span><b>+${N(open.reduce((a, b) => a + b.stake * b.o, 0))}${coin()}</b><span>${open.filter(canCancel).length} se pueden cancelar todavía</span></div>
    <div class="bys">${DEP.map((k) => { const [w, t] = f.sp[k]; return `<div class="by"><img src="${SP[k][1]}" alt=""><strong>${SP[k][0]}</strong><em>${w} de ${t}</em><span class="bar"><i style="width:${t ? (w / t) * 100 : 0}%"></i></span></div>` }).join('')}</div>
    <div class="b-cols">
      <section><div class="sec-h"><h2>En juego</h2><i>${open.length}</i></div>${open.map(betRow).join('') || '<p class="hint">Nada en juego. Ve a Partidos y toca una cuota.</p>'}
        <div class="sec-h" style="margin-top:34px"><h2>Tus retos</h2><i>${CH.filter((c) => c.from === MEK || c.to === MEK).length}</i></div>${retosHtml(CH.filter((c) => c.from === MEK || c.to === MEK).slice(0, 12), 'Aún no has retado a nadie. Abre un partido y pulsa Retar.')}</section>
      <section><div class="sec-h"><h2>Resueltas</h2><i>${res.length}</i><nav class="r" style="display:flex;gap:20px">${[['all', 'Todas'], ['won', 'Ganadas'], ['lost', 'Perdidas']].map(([k, n]) => `<button class="chip ${S.bf === k ? 'on' : ''}" data-bf="${k}">${n}</button>`).join('')}</nav></div>${list.map(betRow).join('') || '<p class="hint">Todavía nada.</p>'}</section>
    </div></div>`;
}

/* ---------- Colegas ---------- */
function timeline() {
  const W = 1200, H = 236, x0 = 78, x1 = 1012, xU = 1136, ax = 192, X = (t) => x0 + ((x1 - x0) * (t - NOW)) / (PAY - NOW);
  const ids = [...new Set(F.flatMap((f) => openOf(f.id).map((b) => b.m)))];
  const evs = ids.map(byId).filter(Boolean).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const far = evs.filter((m) => !m.live && Date.parse(m.at) >= PAY);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Partidos con apuestas de aquí al lunes">`;
  const mids = []; for (let k = 1; k <= 7; k++) { const t = PAY - k * DAY; if (t > NOW) mids.unshift(t) }
  [...mids, PAY].forEach((t, i, arr) => { const a = i ? arr[i - 1] : NOW; if (i) s += `<line x1="${X(a)}" x2="${X(a)}" y1="14" y2="${ax}" stroke="var(--hair2)" stroke-dasharray="2 4"/>`;
    if (X(t) - X(a) > 60) s += `<text x="${(X(a) + X(t)) / 2}" y="${ax + 26}" class="tx-m" text-anchor="middle" font-size="11" letter-spacing="2">${WD(a + 36e5)} ${DD(a + 36e5)}</text>` });
  s += `<line x1="${x0}" x2="${x1}" y1="${ax}" y2="${ax}" stroke="var(--hair2)"/>`;
  if (far.length) s += `<line x1="${x1 + 18}" x2="${xU + 40}" y1="${ax}" y2="${ax}" stroke="var(--hair2)" stroke-dasharray="2 5"/><text x="${(x1 + xU) / 2 + 8}" y="${ax + 4}" class="tx-d" text-anchor="middle" font-size="12">//</text><text x="${xU}" y="${ax + 26}" class="tx-m" text-anchor="middle" font-size="11" letter-spacing="2">MÁS ADELANTE</text>`;
  s += `<line x1="${x0}" x2="${x0}" y1="10" y2="${ax + 8}" stroke="var(--acc)" stroke-width="1.5"/><text x="${x0}" y="${ax + 26}" class="tx-a" text-anchor="middle" font-size="11" letter-spacing="2">AHORA</text>`;
  s += `<line x1="${x1}" x2="${x1}" y1="10" y2="${ax + 8}" stroke="var(--acc)" stroke-dasharray="3 3"/><text x="${x1}" y="${ax + 26}" class="tx-a" text-anchor="middle" font-size="11" letter-spacing="1">PAGA +${N(WEEKLY)}</text>`;
  let px = -999, pt = 1, lx = -999;
  evs.forEach((m) => {
    const fi = far.indexOf(m);
    // partidos muy seguidos: se separan lo justo para que no se pisen las caras
    let x = fi >= 0 ? xU + (fi - (far.length - 1) / 2) * 40 : m.live ? x0 + 34 : X(Date.parse(m.at));
    if (fi < 0 && x - lx < 28) x = lx + 28; lx = x;
    const tier = x - px < 104 ? 1 - pt : 0; px = x; pt = tier;
    const ly = tier ? 66 : 28, ws = whoOn(m.id), duel = new Set(ws.map((w) => w.p).filter(Boolean)).size > 1;
    const tip = `${m.a} vs ${m.b} · ${m.live ? 'en vivo ' + (m.score || '') : WD(m.at).toLowerCase() + ' ' + DD(m.at) + ' ' + HM(m.at)} · ` + ws.map((w) => `${fr(w.f).n} ${w.p ? pn(m, w.p) + ' ' : ''}${N(w.stake)}`).join(' · ');
    s += `<g class="ev" data-goto="${m.id}"><title>${esc(tip)}</title><rect x="${x - 34}" y="8" width="68" height="${ax - 8}" fill="transparent"/>`;
    const top = ax - 14 - (ws.length - 1) * 24 - 12;
    s += `<line x1="${x}" x2="${x}" y1="${ly + 22}" y2="${top - 6}" stroke="${m.live ? 'var(--acc)' : 'var(--hair2)'}"/>`;
    s += `<text x="${x}" y="${ly}" class="tx-i" text-anchor="middle" font-size="12" font-weight="500">${esc(short(m))}</text>`;
    s += `<text x="${x}" y="${ly + 15}" class="${m.live ? 'tx-a' : 'tx-m'}" text-anchor="middle" font-size="10">${m.live ? 'VIVO ' + esc(m.score || '') : fi >= 0 ? DD(m.at) + ' ' + MO(m.at) : HM(m.at)}</text>`;
    ws.slice(0, 6).forEach((w, i) => { const cy = ax - 14 - i * 24; s += `<circle cx="${x}" cy="${cy}" r="10.5" fill="var(--f-${w.f})" stroke="var(--bg)" stroke-width="2"/><text x="${x}" y="${cy + 3}" text-anchor="middle" font-size="7.5" font-weight="700" fill="#0d0b06">${esc(fr(w.f).ini)}</text>` });
    if (duel) s += `<text x="${x + 14}" y="${ax - 14 - (ws.length - 1) * 24 - 14}" class="tx-a" font-size="9" letter-spacing="1.5">DUELO</text>`;
    s += `</g>`;
  });
  if (!evs.length) s += `<text x="${(x0 + x1) / 2}" y="110" class="tx-m" text-anchor="middle" font-size="14">Nadie tiene nada en juego todavía</text>`;
  return s + '</svg>';
}
function duels() {
  const evs = [...new Set(F.flatMap((f) => openOf(f.id).map((b) => b.m)))].map(byId).filter(Boolean).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const rows = evs.map((m) => {
    const g = {}; whoOn(m.id).forEach((w) => { if (w.p) (g[w.p] = g[w.p] || []).push(w) });
    const ks = ['1', 'X', '2'].filter((k) => g[k]); if (ks.length < 2) return '';
    return `<div class="du" data-goto="${m.id}"><div class="du-t"><b>${m.live ? 'EN VIVO' : CD(m.at)}</b><span>${m.live ? esc(m.score || '') : WD(m.at) + ' ' + HM(m.at)}</span></div>
      <div class="du-s">${ks.map((k) => `<div class="du-g">${k === 'X' ? '<span class="du-x">X</span>' : logo(m, k === '1' ? 'a' : 'b')}<div><strong>${esc(pn(m, k))}</strong><span>${g[k].map((w) => av(w.f, 'sm')).join('')}<em>${N(g[k].reduce((a, w) => a + w.stake, 0))}</em></span></div></div>`).join('<i>vs</i>')}</div></div>`;
  }).join('');
  return rows || `<p class="hint">Sin duelos a la vista.${VIS === 'kick' ? ' Se descubren al empezar cada partido.' : ''}</p>`;
}
function betCard(f, b) {
  const m = byId(b.m), left = Date.parse(m.at) - NOW, fill = m.live ? 100 : Math.max(4, 100 - (left / (72 * 36e5)) * 100);
  return `<div class="bc ${m.live ? 'live' : ''}" data-goto="${m.id}">
    <div class="bc-t"><b>${m.live ? 'EN VIVO' : CD(m.at)}</b><span>${m.live ? esc(m.score || '') : WD(m.at) + ' ' + DD(m.at) + ' · ' + HM(m.at)}</span></div>
    <div class="bc-m">${logo(m, 'a')}<span>${esc(m.a)}</span><i>vs</i><span>${esc(m.b)}</span>${logo(m, 'b')}</div>
    <div class="bc-p">${b.p ? `<strong>${esc(pn(m, b.p))}</strong><em>${O(b.o)}</em>` : `<strong class="hid">${LOCK}Oculta</strong><em>hasta las ${HM(m.at)}</em>`}<span>${N(b.stake)} <i>→</i> <b>${b.p ? N(b.stake * b.o) : '?'}</b></span></div>
    <span class="bc-bar" title="${m.live ? 'en juego' : 'faltan ' + CD(m.at)}"><i style="width:${fill.toFixed(1)}%"></i></span>
  </div>`;
}
const histRow = (b) => { const m = byId(b.m); if (!m) return ''; const t = Date.parse(b.at);
  const [c, r] = b.st === 'won' ? ['g', '▲ ' + N(b.pay)] : b.st === 'lost' ? ['p', '▼ ' + N(b.stake)] : b.st === 'void' ? ['e', 'anulada'] : ['o', m.live ? 'en vivo' : 'en juego'];
  return `<div class="hst ${c}" data-goto="${m.id}"><span class="hd">${DD(t)} ${MO(t)}<small>${HM(t)}</small></span><img class="tl" src="${esc(L[m.lg]?.[1] || '')}" alt="" loading="lazy"><span class="hm"><strong>${esc(m.a)} vs ${esc(m.b)}</strong><small>${b.p ? esc(pn(m, b.p)) + ' · ' + O(b.o) : 'oculta hasta empezar'} · ${N(b.stake)} apostados</small></span><b>${r}</b></div>` };
function historial(f) {
  const bs = ALL.filter((b) => b.k === f.id && byId(b.m)).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)), lim = S.histAll ? bs.length : 15;
  const g = bs.filter((b) => b.st === 'won'), pe = bs.filter((b) => b.st === 'lost'), neto = g.reduce((a, b) => a + b.pay - b.stake, 0) - pe.reduce((a, b) => a + b.stake, 0);
  return `<section class="cs" id="historial"><div class="cs-h"><div><h3>Historial</h3><p>${bs.length} apuestas · ${g.length} ganadas · ${pe.length} perdidas · ${neto >= 0 ? '▲' : '▼'} ${N(Math.abs(neto))} en total</p></div></div>
    <div class="hsts">${bs.slice(0, lim).map(histRow).join('') || '<p class="hint">Todavía no ha apostado.</p>'}</div>
    ${bs.length > lim ? `<button class="q hst-mas" data-act="hist-all">Ver las ${bs.length}</button>` : ''}</section>`;
}
// PM, 30-10: "all bets lo quiero mejor, esta raro y feo" y "que se vea con que equipo van":
// arriba los jugadores; luego cada partido con sus opciones y las caras de quien va con cada una; al final lo resuelto
function colegas() {
  const rank = [...F].sort((a, b) => b.s - a.s), admin = me().admin;
  const abiertas = ALL.filter((b) => b.st === 'open' && byId(b.m));
  const partidos = [...new Set(abiertas.map((b) => b.m))].map(byId).sort((a, b) => (b.live - a.live) || Date.parse(a.at) - Date.parse(b.at));
  const hechas = ALL.filter((b) => (b.st === 'won' || b.st === 'lost') && byId(b.m)).sort((a, b) => Date.parse(b.set || b.at) - Date.parse(a.set || a.at)).slice(0, 12);
  const ajustes = admin ? `<div class="ab-aj"><nav class="vis"><span class="lab">Apuesta del día</span><button class="chip ${DAILY_ON ? 'on' : ''}" data-daily="true">Con extra ×${O(DAILY_BONUS)}</button><button class="chip ${!DAILY_ON ? 'on' : ''}" data-daily="false">Sin extra</button></nav><nav class="vis"><span class="lab">Elecciones</span><button class="chip ${VIS === 'open' ? 'on' : ''}" data-vis="open">Visibles</button><button class="chip ${VIS === 'kick' ? 'on' : ''}" data-vis="kick">Ocultas hasta empezar</button></nav></div>` : '';
  const gente = rank.map((f, i) => {
    const op = openOf(f.id), inP = op.reduce((a, b) => a + b.stake, 0);
    return `<button class="ab-p ${f.me ? 'me' : ''}" data-prof="${f.id}" style="--c:var(--f-${f.id})">${av(f.id, 'xl')}<span class="ab-pn"><b>${esc(f.n)}</b><small>${i + 1}º · ${f.ac !== '·' ? f.ac + ' aciertos' : 'sin resueltas'}</small></span><span class="ab-ps num">${N(f.s)}${coin()}</span><span class="ab-pj">${op.length ? `${N(inP)} en juego · ${op.length} ${op.length === 1 ? 'apuesta' : 'apuestas'}` : 'nada en juego'}</span></button>`;
  }).join('');
  const partido = (m) => {
    const bs = abiertas.filter((b) => b.m === m.id), tot = bs.reduce((a, b) => a + b.stake, 0), ocultas = bs.filter((b) => !b.p);
    const col = (p) => {
      const x = bs.filter((b) => b.p === p);
      const cara = p === '1' ? logo(m, 'a') : p === '2' ? logo(m, 'b') : '<span class="ab-x">X</span>';
      return `<div class="ab-c ${x.length ? 'con' : ''}"><div class="ab-ct">${cara}<span class="nm">${esc(pn(m, p))}</span><em>${O(po(m, p))}</em></div>
        ${x.map((b) => `<div class="ab-b" style="--c:var(--f-${b.k})">${av(b.k, 'sm')}<b data-prof="${b.k}">${esc(fr(b.k).n)}</b><span>${N(b.stake)} <i>→</i> <em>${N(b.stake * b.o)}</em></span>${b.k !== MEK && isOpen(m) ? `<button class="sumo" data-sumo="${m.id}|${p}">Me sumo</button>` : ''}<div class="ab-rx">${rxHtml('b:' + b.id)}</div></div>`).join('') || '<p class="ab-nadie">nadie</p>'}</div>`;
    };
    return `<article class="ab-m ${m.live ? 'live' : ''}">
      <header data-goto="${m.id}"><img class="tl" src="${esc(L[m.lg]?.[1] || '')}" alt="" loading="lazy"><span class="ab-lg">${esc(L[m.lg]?.[0] || '')}</span><b>${m.live ? 'EN VIVO ' + esc(m.score || '') : `${WD(m.at)} ${HM(m.at)} · faltan ${CD(m.at)}`}</b><em>${N(tot)}${coin()} en juego</em></header>
      <div class="ab-cols n${picksOf(m).length}">${picksOf(m).map(col).join('')}</div>
      ${ocultas.length ? `<p class="ab-oc">${LOCK}${ocultas.map((b) => esc(fr(b.k).n)).join(', ')} ya ${ocultas.length > 1 ? 'han' : 'ha'} apostado: se ve al empezar</p>` : ''}
    </article>`;
  };
  const hecha = (b) => { const m = byId(b.m), w = b.st === 'won';
    return `<div class="ab-r ${w ? 'g' : 'p'}" data-goto="${m.id}">${av(b.k, 'sm')}<span class="tx"><b>${esc(fr(b.k).n)}</b> ${w ? 'acertó' : 'falló'} con <em>${esc(pn(m, b.p))} ${O(b.o)}</em><small>${esc(m.a)} vs ${esc(m.b)} · ${esc(L[m.lg]?.[0] || '')}</small></span><b class="amt">${w ? '▲ ' + N(b.pay) : '▼ ' + N(b.stake)}</b></div>` };
  const retosAbiertos = CH.filter((c) => c.st === 'pending' || c.st === 'accepted');
  return `<div class="cg ab">${ajustes}
    <div class="ab-gente">${gente}</div>
    <div class="sec-h ab-sec"><h2>En juego</h2><i>${abiertas.length} ${abiertas.length === 1 ? 'apuesta' : 'apuestas'} · ${partidos.length} ${partidos.length === 1 ? 'partido' : 'partidos'}</i></div>
    ${partidos.map(partido).join('') || '<p class="hint">Nadie tiene nada en juego. Se apuesta desde Partidos.</p>'}
    ${CH.length ? `<div class="sec-h ab-sec"><h2>Retos 1 contra 1</h2><i>${retosAbiertos.length} abiertos</i></div>${retosHtml(CH.slice(0, 10), '')}` : ''}
    <div class="sec-h ab-sec"><h2>Resueltas</h2><i>las últimas de todos</i></div>
    ${hechas.map(hecha).join('') || '<p class="hint">Todavía no se ha resuelto ninguna. Cuando acabe un partido sale aquí quién acertó.</p>'}
  </div>`;
}

/* ---------- Liga ---------- */
const legend = () => `<div class="leg">${F.map((f) => `<span><i style="background:var(--f-${f.id})"></i>${esc(f.n)}</span>`).join('')}</div>`;
const nice = (v) => { const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, v)))); return Math.ceil(v / p) * p };
const barPath = (x, w, y0, y, r = 4) => { const up = y < y0, h = Math.abs(y - y0); r = Math.min(r, h, w / 2); if (h < 0.5) return '';
  return up ? `M${x},${y0}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y0}Z` : `M${x},${y0}V${y - r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y - r}V${y0}Z` };
const weekLabels = (n) => Array.from({ length: n }, (_, i) => (i === 0 ? 'INICIO' : i === n - 1 ? 'HOY' : 'SEM ' + i));
const given = (n) => Array.from({ length: n }, (_, i) => WEEKLY * Math.max(1, i));
function chLines(list, W, H, x0, x1, endLabels) {
  const n = Math.max(...list.map((f) => f.h.length)), g = given(n), labs = weekLabels(n);
  const mx = nice(Math.max(...list.flatMap((f) => f.h), ...g) * 1.15), X = (i) => x0 + ((x1 - x0) * i) / Math.max(1, n - 1), Y = (v) => H - 34 - ((H - 60) * v) / mx;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Saldo semana a semana">`;
  for (let k = 0; k <= 3; k++) { const v = (mx / 3) * k; s += `<line x1="${x0}" x2="${x1}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--hair)"/><text x="${x0 - 12}" y="${Y(v) + 4}" class="tx-d" font-size="11" text-anchor="end">${v ? (v / 1000).toFixed(v % 1000 ? 1 : 0).replace('.', ',') + 'k' : '0'}</text>` }
  if (list.length === 1) { const f = list[0], pts = f.h.map((v, i) => `${X(i)},${Y(v)}`).join(' '); s += `<polygon points="${X(0)},${Y(0)} ${pts} ${X(f.h.length - 1)},${Y(0)}" fill="var(--f-${f.id})" opacity=".12"/>` }
  s += `<polyline points="${g.map((v, i) => `${X(i)},${Y(v)}`).join(' ')}" fill="none" stroke="var(--dim)" stroke-width="1.4" stroke-dasharray="3 5"/>`;
  for (const f of [...list].sort((a, b) => (a.me ? 1 : b.me ? -1 : 0))) {
    s += `<polyline points="${f.h.map((v, i) => `${X(i)},${Y(v)}`).join(' ')}" fill="none" stroke="var(--f-${f.id})" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`;
    f.h.forEach((v, i) => { s += `<circle cx="${X(i)}" cy="${Y(v)}" r="${i === f.h.length - 1 ? 5.5 : 3.5}" fill="var(--f-${f.id})" stroke="var(--bg)" stroke-width="2"/>`; if (list.length === 1) s += `<text x="${X(i)}" y="${Y(v) - 14}" class="${i === f.h.length - 1 ? 'tx-i' : 'tx-m'}" font-size="11" text-anchor="middle">${N(v)}</text>` });
  }
  if (endLabels) { let ly = -99; [...list].sort((a, b) => b.s - a.s).forEach((f) => { let y = Y(f.h[f.h.length - 1]); if (y - ly < 34) y = ly + 34; ly = y; s += `<circle cx="${x1 + 22}" cy="${y - 4}" r="4" fill="var(--f-${f.id})"/><text x="${x1 + 32}" y="${y}" class="tx-m" font-size="12">${esc(f.n)}</text><text x="${x1 + 32}" y="${y + 17}" class="tx-i" font-size="16" font-weight="500">${N(f.h[f.h.length - 1])}</text>` }) }
  labs.forEach((t, i) => { s += `<text x="${X(i)}" y="${H - 8}" class="${i === n - 1 ? 'tx-a' : 'tx-d'}" font-size="11" text-anchor="middle" letter-spacing="1">${t}</text><rect class="hit" x="${X(i) - 30}" y="10" width="60" height="${H - 44}"><title>${t} · ${list.map((f) => `${esc(f.n)} ${N(f.h[i] ?? 0)}`).join(' · ')} · repartido ${N(g[i])}</title></rect>` });
  return s + '</svg>';
}
function chSemanas() {
  const n = Math.max(1, ...F.map((f) => f.wk.length)), first = Math.max(0, n - 6), W = 520, H = 290, x0 = 54, x1 = 510, y0 = 140;
  const mx = nice(Math.max(100, ...F.flatMap((f) => f.wk.map(Math.abs))) * 1.1), sc = 118 / mx, Y = (v) => y0 - v * sc, cols = n - first, gw = (x1 - x0) / cols, bw = Math.min(22, gw / (F.length + 1)), gap = 2;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ganancia o pérdida por semana">`;
  [-1, -0.5, 0.5, 1].forEach((k) => { const v = mx * k; s += `<line x1="${x0}" x2="${x1}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--hair)"/><text x="${x0 - 10}" y="${Y(v) + 4}" class="tx-d" font-size="10" text-anchor="end">${v > 0 ? '▲' : '▼'}${N(Math.abs(v))}</text>` });
  for (let w = first; w < n; w++) {
    const cx = x0 + gw * (w - first) + gw / 2, start = cx - (F.length * bw + (F.length - 1) * gap) / 2;
    F.forEach((f, i) => { const v = f.wk[w] || 0, x = start + i * (bw + gap); s += `<path d="${barPath(x, bw, y0, Y(v))}" fill="var(--f-${f.id})"><title>${esc(f.n)} · semana ${w + 1} · ${v >= 0 ? '▲' : '▼'} ${N(Math.abs(v))}</title></path>` });
    s += `<text x="${cx}" y="${H - 6}" class="${w === n - 1 ? 'tx-a' : 'tx-d'}" font-size="11" text-anchor="middle" letter-spacing="1">${w === n - 1 ? 'AHORA' : 'SEM ' + (w + 1)}</text>`;
  }
  return s + `<line x1="${x0}" x2="${x1}" y1="${y0}" y2="${y0}" stroke="var(--mute)"/></svg>`;
}
function chDeporte() {
  const W = 520, H = 290, x0 = 110, x1 = 500, X = (v) => x0 + ((x1 - x0) * v) / 100;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Aciertos por deporte">`;
  [0, 25, 50, 75, 100].forEach((v) => (s += `<line x1="${X(v)}" x2="${X(v)}" y1="14" y2="${H - 30}" stroke="var(--hair)"/><text x="${X(v)}" y="${H - 10}" class="tx-d" font-size="10" text-anchor="middle">${v}%</text>`));
  DEP.map((k) => [k, SP[k][0]]).forEach(([k, n], r) => { const y = 40 + r * 60;
    s += `<image href="${SP[k][1]}" x="0" y="${y - 9}" width="18" height="18"/><text x="26" y="${y + 4}" class="tx-i" font-size="13">${n}</text><line x1="${x0}" x2="${x1}" y1="${y}" y2="${y}" stroke="var(--hair2)"/>`;
    F.forEach((f, i) => { const [w, t] = f.sp[k]; if (!t) return; const v = (w / t) * 100, dy = (i - (F.length - 1) / 2) * 9; s += `<circle cx="${X(v)}" cy="${y + dy}" r="7" fill="var(--f-${f.id})" stroke="var(--bg)" stroke-width="2"><title>${esc(f.n)} · ${n} · ${w} de ${t} · ${Math.round(v)}%</title></circle>` });
  });
  return s + '</svg>';
}
function chCuota() {
  const W = 520, H = 40 + F.length * 50, x0 = 110, x1 = 470, mx = Math.max(3, Math.ceil(Math.max(...F.map((f) => f.avgO)))), X = (v) => x0 + ((x1 - x0) * v) / mx;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cuota media de cada uno">`;
  for (let v = 1; v <= mx; v++) s += `<line x1="${X(v)}" x2="${X(v)}" y1="10" y2="${H - 28}" stroke="var(--hair)"/><text x="${X(v)}" y="${H - 8}" class="tx-d" font-size="10" text-anchor="middle">${v},00</text>`;
  F.forEach((f, i) => { const y = 22 + i * 50, x = X(f.avgO || 0);
    s += `<text x="0" y="${y + 15}" class="tx-i" font-size="13">${esc(f.n)}</text>${f.avgO ? `<path d="M${x0},${y}H${x - 4}Q${x},${y} ${x},${y + 4}V${y + 18}Q${x},${y + 22} ${x - 4},${y + 22}H${x0}Z" fill="var(--f-${f.id})"><title>${esc(f.n)} · cuota media ${O(f.avgO)}</title></path>` : ''}<text x="${Math.max(x, x0) + 10}" y="${y + 16}" class="tx-i" font-size="13" font-weight="500">${f.avgO ? O(f.avgO) : '·'}</text>` });
  return s + '</svg>';
}
const heat = () => { const ramp = (v) => (v >= 60 ? ['#f2c14e', '#14100a'] : v >= 40 ? ['#b88c2c', '#100c05'] : v >= 20 ? ['#6b5420', '#f4f2ec'] : ['#2e2615', '#f4f2ec']);
  return `<div class="heat"><span></span>${DEP.map((k) => `<span class="hh"><img src="${SP[k][1]}" alt="">${SP[k][0]}</span>`).join('')}
    ${F.map((f) => `<span class="hr">${av(f.id, 'sm')}${esc(f.n)}</span>${DEP.map((k) => { const v = f.share[k] || 0, [bg, fg] = ramp(v); return `<span class="hc" style="background:${bg};color:${fg}" title="${esc(f.n)} pone el ${v}% de lo que apuesta en ${SP[k][0]}">${v}%</span>` }).join('')}`).join('')}</div>` };
const strips = () => F.some((f) => f.last) ? `<div class="strips">${F.map((f) => { const w = [...f.last].filter((c) => c === 'W').length; return `<div class="strip">${av(f.id)}<span class="nm">${esc(f.n)}</span>
  <span class="dots">${[...f.last].map((c) => `<i class="${c === 'W' ? 'w' : 'l'}" style="--c:var(--f-${f.id})" title="${c === 'W' ? 'ganada' : 'perdida'}"></i>`).join('')}</span><b>${w} de ${f.last.length}</b><span class="rc ${f.racha.startsWith('▲') ? 'up' : ''}">${f.racha}</span></div>` }).join('')}
  <p class="strips-k"><span><i class="w" style="--c:var(--mute)"></i>ganada</span><span><i class="l"></i>perdida</span><span>la más reciente, a la derecha</span></p></div>` : '<p class="hint">Cuando se resuelvan las primeras apuestas saldrán aquí.</p>';
const table = (rank) => `<div class="tbl"><div class="tr h"><span></span><span>Colega</span><span>Saldo</span><span>Neto</span><span>Aciertos</span><span>Apuestas</span><span>Racha</span><span>Mejor premio</span><span>Fuerte en</span></div>
  ${rank.map((f, i) => `<div class="tr ${f.me ? 'me' : ''}"><span class="p">${i + 1}</span><span class="who2" data-prof="${f.id}" style="cursor:pointer">${av(f.id, 'xl')}${esc(f.n)}</span>
    <span class="big">${N(f.s)}</span>${net(f)}<span>${f.ac} <span class="dim">${f.acn}</span></span><span>${f.bets}</span>
    <span class="${f.racha.startsWith('▲') ? 'net up' : 'net'}">${f.racha}</span><span>${N(f.best)}</span><span class="dim">${f.fuerte}</span></div>`).join('')}</div>`;
function boteHtml() {
  if (!BOTE) return '';
  const desde = Date.parse((BOTE.desde || '') + 'T00:00:00+01:00'), ents = Object.entries(BOTE.players || {}).map(([u, v]) => [F.find((f) => f.uid === u)?.id, v]).filter(([k]) => k).sort((a, b) => b[1] - a[1]);
  const last = (BOTE.last || []).map((x) => F.find((f) => f.uid === x.player)).filter(Boolean);
  const cab = `<div class="sec-h"><h2>Bote de la semana</h2><i>cada lunes ${N(BOTE.amount || 100)} cada uno · se lo lleva el que más gane</i></div>`;
  if (!ents.length) return `<section class="bote">${cab}<p class="hint">${NOW < desde ? `Empieza el lunes ${DD(desde)} ${MO(desde)}: ese día cada uno pone ${N(BOTE.amount || 100)} y el que más gane en la semana se lleva todo.` : 'Este lunes nadie tenía para entrar.'}</p></section>`;
  return `<section class="bote">${cab}<div class="bote-pot"><span class="num">${N(BOTE.pot)}${coin()}</span><span>en el bote · se reparte en ${CD(PAY)}</span></div>
    ${ents.map(([k, v], i) => `<div class="bote-r ${i === 0 && v > 0 ? 'lider' : ''}">${av(k, 'sm')}<b>${esc(fr(k).n)}</b><span class="${v >= 0 ? 'up' : 'dn'}">${v >= 0 ? '▲' : '▼'} ${N(Math.abs(v))}</span>${i === 0 && v > 0 ? '<em>se lo lleva</em>' : ''}</div>`).join('')}
    ${last.length ? `<p class="hint">La semana pasada se lo llevó ${last.map((f) => esc(f.n)).join(' y ')}.</p>` : ''}</section>`;
}
// quien sabe mas de cada deporte: aciertos de lo resuelto
function sabeHtml() {
  const filas = DEP.map((k) => { const r = F.map((f) => ({ f, w: f.sp[k][0], t: f.sp[k][1] })).filter((x) => x.t).sort((a, b) => b.w / b.t - a.w / a.t || b.t - a.t); return [k, r] }).filter(([, r]) => r.length);
  return `<section class="sabe"><div class="sec-h"><h2>Quién sabe más</h2><i>aciertos por deporte</i></div>${filas.length ? filas.map(([k, r]) => `<div class="sabe-r"><span class="sd"><img src="${SP[k][1]}" alt="">${SP[k][0]}</span><span class="sw">${r.map((x, i) => `<span class="${i === 0 ? 'top' : ''}">${av(x.f.id, 'sm')}${esc(x.f.n)} <em>${x.w} de ${x.t}</em></span>`).join('')}</span></div>`).join('') : '<p class="hint">Sale cuando se resuelvan las primeras apuestas.</p>'}</section>`;
}
function liga() {
  const rank = [...F].sort((a, b) => b.s - a.s), mx = Math.max(1, rank[0]?.s || 1), meI = rank.findIndex((f) => f.me);
  const open = ALL.filter((b) => b.st === 'open').reduce((a, b) => a + b.stake, 0), set = ALL.filter((b) => b.st === 'won' || b.st === 'lost'), won = set.filter((b) => b.st === 'won').length;
  const gapUp = meI > 0 ? rank[meI - 1].s - me().s : 0, gapDn = meI >= 0 && meI < rank.length - 1 ? me().s - rank[meI + 1].s : 0;
  const order = rank.length >= 3 ? [1, 0, ...rank.map((_, i) => i).slice(2)] : rank.map((_, i) => i), nWeeks = Math.max(1, me().h.length - 1);
  return `<div class="lc">
    <header class="lc-h"><span class="lab">Temporada · desde el ${esc(SEASON ? fmt(SEASON + 'T12:00:00Z', { day: 'numeric', month: 'short' }) : '')} · ${F.length} jugadores</span><h2 class="wk"><small>SEMANA</small>${String(nWeeks).padStart(2, '0')}</h2>
      <p class="l-pay">Paga de <b>+${N(WEEKLY)}</b> a cada uno en ${CD(PAY)}</p>${CAMPEON ? `<p class="l-rey">${av(CAMPEON.k, 'sm')}<b>${esc(fr(CAMPEON.k).n)}</b> es el campeón de ${esc(CAMPEON.mes)} (▲ ${N(CAMPEON.v)}) y lleva la corona todo el mes</p>` : ''}</header>
    <div class="podium">${order.map((i) => { const f = rank[i]; return `<div class="pd ${f.me ? 'me' : ''}" data-prof="${f.id}" style="cursor:pointer">${av(f.id, 'xl')}<span class="nm">${esc(f.n)}</span><b class="num">${N(f.s)}</b>${net(f)}
      <span class="bar" style="height:${Math.max(6, Math.round((f.s / mx) * 180))}px;background:var(--f-${f.id})"></span><span class="ps">${i + 1}º</span></div>` }).join('')}</div>
    <p class="gap">${gapUp > 0 ? `Te faltan <b>${N(gapUp)}</b> para alcanzar a ${esc(rank[meI - 1].n)}` : meI > 0 ? `Empatado con ${esc(rank[meI - 1].n)}` : 'Vas primero'}${gapDn > 0 ? ` · le sacas <b>${N(gapDn)}</b> a ${esc(rank[meI + 1].n)}` : ''}</p>
    ${boteHtml()}
    ${sabeHtml()}
    <div class="kpis">
      <div class="kpi"><span class="lab">En juego ahora</span><b>${N(open)}${coin()}</b><span>entre todos</span></div>
      <div class="kpi"><span class="lab">Repartido</span><b>${N(F.reduce((a, f) => a + f.recibido, 0))}</b><span>${nWeeks} ${nWeeks > 1 ? 'lunes' : 'lunes'} · ${F.length} jugadores</span></div>
      <div class="kpi"><span class="lab">Apuestas</span><b>${ALL.length}</b><span>esta temporada</span></div>
      <div class="kpi"><span class="lab">Aciertos del grupo</span><b>${set.length ? Math.round((won / set.length) * 100) + '%' : '·'}</b><span>${won} de ${set.length} resueltas</span></div>
    </div>
    <section class="cs full"><div class="cs-h"><div><h3>Saldo semana a semana</h3><p>Por encima de la línea discontinua vas ganando dinero. Pasa el ratón por cada semana.</p></div>${legend()}</div><div class="chart">${chLines(F, 1000, 300, 44, 860, true)}</div></section>
    <div class="cgrid">
      <section class="cs"><div class="cs-h"><div><h3>Ganancia por semana</h3><p>Lo ganado o perdido cada semana, sin contar la paga.</p></div></div><div class="chart">${chSemanas()}</div>${legend()}</section>
      <section class="cs"><div class="cs-h"><div><h3>Aciertos por deporte</h3><p>Qué parte de sus apuestas acierta cada uno.</p></div></div><div class="chart">${chDeporte()}</div>${legend()}</section>
      <section class="cs"><div class="cs-h"><div><h3>Dónde apuesta cada uno</h3><p>Qué parte de lo apostado va a cada deporte.</p></div></div>${heat()}</section>
      <section class="cs"><div class="cs-h"><div><h3>Cuota media</h3><p>Cuanto más alta, más arriesga.</p></div></div><div class="chart">${chCuota()}</div></section>
    </div>
    <section class="cs full"><div class="cs-h"><div><h3>Últimas apuestas</h3><p>Cada punto es una apuesta resuelta.</p></div></div>${strips()}</section>
    <section class="cs full"><div class="cs-h"><div><h3>Premios de la temporada</h3></div></div>
      ${AW.length ? `<div class="aw">${AW.map(([k, v, id, d]) => `<div class="awi"><span class="lab">${k}</span><b>${v}</b><span class="who3">${av(id, 'sm')}${esc(fr(id).n)}</span><span class="dd">${esc(d)}</span></div>`).join('')}</div>` : '<p class="hint">Se reparten cuando haya apuestas resueltas.</p>'}</section>
    <section class="cs full"><div class="cs-h"><div><h3>Clasificación</h3></div></div>${table(rank)}</section>
  </div>`;
}

/* ---------- Chat ---------- */
const IC_IMG = '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="15" rx="3.5"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 15.5l-4.5-4.5-8.5 8.5"/></svg>';
const IC_SEND = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';
const sysTxt = (t) => esc(t).replace(/ (ganó|\+)\s?([\d.]+)/, ' $1 <b class="up">$2</b>').replace(/ (perdió|recupera) ([\d.]+)/, ' $1 <b>$2</b>');
const EMO = ['👍', '😂', '🔥', '💀', '🤡', '😭'];
const IC_RX = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9.2 9.8h.01M14.8 9.8h.01"/></svg>';
const rxHtml = (t) => { const r = REACT.get(t) || {}, hay = EMO.filter((e) => r[e]?.length);
  return `<div class="rx">${hay.map((e) => `<button class="rx-c ${r[e].includes(MEK) ? 'mio' : ''}" data-rx="${t}|${e}" title="${esc(r[e].map((k) => fr(k).n).join(', '))}">${e}<i>${r[e].length}</i></button>`).join('')}<button class="rx-add" data-rxo="${t}" aria-label="Reaccionar">${IC_RX}</button>${S.rx === t ? `<span class="rx-pick">${EMO.map((e) => `<button data-rx="${t}|${e}">${e}</button>`).join('')}</span>` : ''}</div>` };
// encuesta y apuesta compartida dentro del chat
const pollHtml = (id) => { const q = POLLS.get(id); if (!q) return ''; const tot = Object.keys(q.v).length, mio = q.v[MEK];
  return `<div class="poll"><b class="pq">${esc(q.q)}</b>${q.o.map((o, i) => { const who = Object.entries(q.v).filter(([, v]) => v === i).map(([k]) => k), pc = tot ? Math.round((who.length / tot) * 100) : 0;
    return `<button class="po ${mio === i ? 'mio' : ''}" data-vote="${id}|${i}"><span class="pb" style="width:${pc}%"></span><span class="pt">${esc(o)}</span><span class="pw">${who.map((k) => av(k, 'sm')).join('')}</span><em>${pc}%</em></button>` }).join('')}<small>${tot} ${tot === 1 ? 'voto' : 'votos'}${mio == null ? ' · toca una para votar' : ' · puedes cambiar tu voto'}</small></div>` };
const betShare = (id) => { const b = ALL.find((x) => x.id === id), m = b && byId(b.m); if (!m) return '<p class="hint">Esa apuesta ya no está.</p>';
  const est = b.st === 'won' ? `<b class="ok">Acertada ▲ ${N(b.pay)}</b>` : b.st === 'lost' ? `<b class="ko">Fallada ▼ ${N(b.stake)}</b>` : `<b>${m.live ? 'En vivo' : 'Faltan ' + CD(m.at)}</b>`;
  return `<div class="bshare" data-goto="${m.id}"><div class="bs-m">${logo(m, 'a')}<span>${esc(m.a)} <i>vs</i> ${esc(m.b)}</span>${logo(m, 'b')}</div><div class="bs-p"><strong>${b.p ? esc(pn(m, b.p)) : 'Oculta hasta empezar'}</strong>${b.p ? `<em>${O(b.o)}</em>` : ''}<span>${N(b.stake)} → ${b.p ? N(b.stake * b.o) : '?'}</span>${est}</div></div>` };
const msgRow = (c) => (!c.k
  ? `<div class="sys"><span class="dot"></span><span>${sysTxt(c.txt)}</span><time>${c.t}</time></div>`
  : `<div class="msg">${av(c.k)}<div style="min-width:0"><div class="hd"><span class="nm">${esc(fr(c.k).n)}</span><time>${c.t}</time></div>${c.txt ? `<p>${esc(c.txt)}</p>` : ''}${c.img ? `<img class="pic" src="${esc(c.img)}" alt="" loading="lazy">` : ''}${c.poll ? pollHtml(c.poll) : ''}${c.bet ? betShare(c.bet) : ''}${rxHtml('c:' + c.id)}${c.aud ? `<div class="voz"><audio controls preload="none" src="${esc(c.aud)}"></audio>${c.secs ? `<span>${Math.floor(c.secs / 60)}:${String(c.secs % 60).padStart(2, '0')}</span>` : ''}</div>` : ''}</div></div>`);
// PM, 30-10: que en el chat ponga el dia: una raya con el dia cada vez que cambia
const diaChat = (t) => (DK(t) === DK(NOW) ? 'Hoy' : DK(t) === DK(NOW - DAY) ? 'Ayer' : `${WD(t)} ${DD(t)} ${MO(t)}`);
const conDias = (lista) => { let k = ''; return lista.map((c) => { const d = DK(c.at), sep = d !== k ? `<div class="ch-dia"><span>${diaChat(c.at)}</span></div>` : ''; k = d; return sep + msgRow(c) }).join('') };
let lastSeen = 0; try { lastSeen = +localStorage.getItem('apuestas-chat-visto') || 0 } catch {}
const unread = () => CHAT.filter((c) => c.id > lastSeen && c.k !== MEK).length;
function chat() {
  const live = M.filter((m) => m.live && whoOn(m.id).length)[0];
  const maxId = Math.max(0, ...CHAT.map((c) => c.id)); if (maxId > lastSeen) { lastSeen = maxId; try { localStorage.setItem('apuestas-chat-visto', maxId) } catch {} }
  return `<div class="c-wrap ${live ? '' : 'solo'}"><section class="c-main"><div class="chat"><div class="ch-list" data-chat>${conDias(CHAT) || '<p class="hint">Escribe el primero.</p>'}</div>
    ${S.pollForm ? `<div class="poll-f"><input type="text" id="poll-q" maxlength="140" placeholder="La pregunta" autocomplete="off">${[0, 1, 2, 3].map((i) => `<input type="text" id="poll-o${i}" maxlength="40" placeholder="Opción ${i + 1}${i > 1 ? ' (si quieres)' : ''}" autocomplete="off">`).join('')}<div class="poll-b"><button class="q" data-act="poll-x">Cancelar</button><button class="go-s" data-act="poll-ok">Crear encuesta</button></div></div>` : ''}<div class="ch-in"><button class="ic" data-act="img" aria-label="Mandar foto">${IC_IMG}</button><button class="ic" data-act="poll" aria-label="Encuesta">${IC_POLL}</button><button class="ic mic ${REC ? 'on' : ''}" data-act="mic" aria-label="${REC ? 'Parar y enviar' : 'Nota de voz'}">${IC_MIC}</button>${REC ? `<span class="rec" data-rec>${recTxt()}</span><button class="q rec-x" data-act="mic-x">Cancelar</button>` : ''}<input type="text" id="msg" data-msg placeholder="Escribe a tus colegas" maxlength="500" autocomplete="off"><button class="send" data-act="send" aria-label="Enviar">${IC_SEND}</button><input type="file" id="pic" accept="image/*" data-file hidden></div></div></section>
    ${live ? `<aside class="c-side">
      ${live ? `<section><span class="lab">En juego ahora</span><div class="live-m" data-goto="${live.id}" style="cursor:pointer"><div>${logo(live, 'a')}${esc(live.a)}</div><b>${esc(live.score || '')}</b><div>${logo(live, 'b')}${esc(live.b)}</div></div></section>
      <section><span class="lab">Sus apuestas</span>${whoOn(live.id).map((x) => `<div class="ifr">${av(x.f)}<span class="nm">${esc(fr(x.f).n)}</span><span class="st rev">${x.p ? esc(pn(live, x.p)) + ' · ' : ''}${N(x.stake)}</span></div>`).join('')}</section>` : ''}
    </aside>` : ''}</div>`;
}

/* ---------- Monedero ---------- */
// PM, 30-10: movimientos con paginas y separados (apuestas, cajas y skins, pagas y premios), con la foto de la caja
// o contra quien fue la batalla; sin las reglas. Y la ruleta de la semana
let WHEEL = null, CASOS = null, BATS = new Map();
const movTipo = (k) => (['apuesta', 'premio', 'devolucion'].includes(k) ? 'apuestas' : ['caja', 'venta', 'batalla'].includes(k) ? 'cajas' : 'pagas');
const RUEDA = [['50', 0], ['Caja', 1], ['100', 0], ['250', 0], ['Caja ★', 2], ['500', 0], ['150', 0], ['1.000', 3]];
async function cargaMov() {
  let cambia = false;
  if (!CASOS) { const { data } = await db.rpc('cs_cases'); CASOS = new Map(((Array.isArray(data) ? data : data?.cases) || []).map((c) => [c.name, c.image])); cambia = true }
  const ids = [...new Set(LEDGER.filter((m) => m.kind === 'batalla').map((m) => +((m.d || '').match(/#(\d+)/) || [])[1]).filter((x) => x && !BATS.has(x)))];
  if (ids.length) { const { data } = await db.from('cs_battle_seats').select('battle_id,player').in('battle_id', ids); for (const id of ids) BATS.set(id, (data || []).filter((x) => x.battle_id === id).map((x) => x.player)); cambia = true }
  if (cambia && S.scr === 'monedero') render();
}
const casoImg = (nota) => { const nm = String(nota || '').replace(/ × \d+$/, ''), im = CASOS?.get(nm); return im ? `<img class="mv-img" src="${esc(/^https?:/.test(im) ? im : 'https://community.akamai.steamstatic.com/economy/image/' + im + '/128fx128f')}" alt="" loading="lazy">` : '' };
function movFila(m, saldo) {
  const tipo = movTipo(m.kind), bid = m.kind === 'batalla' ? +((m.d || '').match(/#(\d+)/) || [])[1] : 0;
  const rivales = bid ? (BATS.get(bid) || []).map((u) => F.find((f) => f.uid === u)).filter((f) => f && !f.me) : [];
  const ico = m.kind === 'caja' ? casoImg(m.d) || `<span class="mv-i c">${IC_BOX}</span>`
    : m.kind === 'batalla' && rivales.length ? `<span class="mv-av">${rivales.map((f) => av(f.id, 'sm')).join('')}</span>`
    : `<span class="mv-i ${tipo === 'apuestas' ? 'b' : tipo === 'cajas' ? 'c' : 'p'}">${tipo === 'apuestas' ? IC_TICKET : tipo === 'cajas' ? IC_BOX : IC_GIFT}</span>`;
  const det = m.kind === 'batalla' && rivales.length ? `Contra ${rivales.map((f) => esc(f.n)).join(' y ')}` : esc(m.d && m.d !== m.c ? m.d : '');
  return `<div class="mv"><time>${DD(m.at)} ${MO(m.at)}<small>${HM(m.at)}</small></time>${ico}<p><b>${esc(m.c)}</b>${det ? `<span>${det}</span>` : ''}</p><span class="a ${m.a > 0 ? 'up' : 'dn'}">${m.a > 0 ? '▲' : '▼'} ${N(Math.abs(m.a))}</span>${saldo != null ? `<span class="s">${N(saldo)}</span>` : ''}</div>`;
}
function ruedaHtml() {
  const wk = new Date(WEEK0 + DAY / 2).toISOString().slice(0, 10), mio = (WHEEL || []).find((w) => w.player === me().uid && w.week === wk);
  const otros = (WHEEL || []).filter((w) => w.week === wk && w.player !== me().uid).map((w) => [F.find((f) => f.uid === w.player), w.label]).filter(([f]) => f);
  const seg = RUEDA.map(([t, c], i) => { const a0 = (i * 45 - 90) * Math.PI / 180, a1 = ((i + 1) * 45 - 90) * Math.PI / 180, am = ((i + .5) * 45 - 90) * Math.PI / 180;
    return `<path d="M100 100L${(100 + 96 * Math.cos(a0)).toFixed(1)} ${(100 + 96 * Math.sin(a0)).toFixed(1)}A96 96 0 0 1 ${(100 + 96 * Math.cos(a1)).toFixed(1)} ${(100 + 96 * Math.sin(a1)).toFixed(1)}Z" class="rs${c} ${i % 2 ? 'imp' : ''}"/><text x="${(100 + 64 * Math.cos(am)).toFixed(1)}" y="${(100 + 64 * Math.sin(am)).toFixed(1)}" transform="rotate(${(i + .5) * 45} ${(100 + 64 * Math.cos(am)).toFixed(1)} ${(100 + 64 * Math.sin(am)).toFixed(1)})">${t}</text>` }).join('');
  return `<section class="rueda"><div class="ru-w"><i class="ru-pin"></i><svg viewBox="0 0 200 200" class="ru" id="rueda" style="transform:rotate(${S.ruRot || 0}deg)" role="img" aria-label="Ruleta de la semana">${seg}<circle cx="100" cy="100" r="16" class="ru-c"/></svg></div>
    <div class="ru-t"><span class="lab">Ruleta de la semana</span><h2>${mio ? esc(mio.label) : 'Una tirada gratis cada semana'}</h2>
      <p>${mio ? 'Ya has girado esta semana. La siguiente, el lunes.' : 'V-Bucks de 50 a 1.000 o una caja de CS2 gratis que se abre sola y va a tu inventario.'}</p>
      ${mio ? '' : `<button class="go-s" data-act="girar" ${S.ruGira ? 'disabled' : ''}>${S.ruGira ? 'Girando…' : 'Girar la ruleta'}</button>`}
      ${otros.length ? `<div class="ru-o">${otros.map(([f, l]) => `<span>${av(f.id, 'sm')}${esc(f.n)} <em>${esc(l)}</em></span>`).join('')}</div>` : ''}</div></section>`;
}
function monedero() {
  const days = ['L', 'M', 'X', 'J', 'V', 'S', 'D'], di = Math.min(6, Math.max(0, Math.floor((NOW - WEEK0) / DAY)));
  const mine = ALL.filter((b) => b.k === MEK), open = mine.filter((b) => b.st === 'open'), won = mine.filter((b) => b.st === 'won').reduce((a, b) => a + b.pay, 0);
  const tab = S.mt || 'todo', lista = LEDGER.filter((m) => tab === 'todo' || movTipo(m.kind) === tab), POR = 10, pags = Math.max(1, Math.ceil(lista.length / POR)), pg = Math.min(S.mp || 0, pags - 1);
  const saldos = []; { let run = me().s; for (const m of LEDGER) { saldos.push(run); run -= m.a } }
  const filas = lista.slice(pg * POR, pg * POR + POR).map((m) => movFila(m, tab === 'todo' ? saldos[LEDGER.indexOf(m)] : null)).join('');
  const cnt = (k) => LEDGER.filter((m) => k === 'todo' || movTipo(m.kind) === k).length;
  if (!CASOS || LEDGER.some((m) => m.kind === 'batalla' && !BATS.has(+((m.d || '').match(/#(\d+)/) || [])[1]))) setTimeout(cargaMov, 0);
  return `<div class="pad">
    <div class="w-hero">${coin('big')}
      <div><span class="lab">Tu saldo</span><div class="w-bal">${N(me().s)}</div>
        <p class="w-pay">Paga del lunes <b>+${N(WEEKLY)}</b> · se acumula</p>
        <div class="w-claim">${CLAIM ? (CLAIM.today ? `<span class="pf-ok">Premio diario reclamado · vuelve mañana</span>` : `<button class="go-s" data-act="claim">${IC_GIFT}Reclamar ${N(CLAIM.amount)} de hoy</button>`) : ''}${puedeRescate() ? `<button class="go-s res" data-act="rescue">Pedir rescate de ${N(CLAIM.rescue)}</button>` : ''}</div>
        <div class="w-cd" data-cdpay>${fmtPay(PAY)}</div>
        <div class="wk7">${days.map((d, i) => `<i class="${i <= di ? 'on' : ''}"></i>`).join('')}${days.map((d, i) => `<span class="${i === di ? 'on' : ''}">${d}</span>`).join('')}</div>
      </div></div>
    <div class="stats" style="margin-top:30px;grid-template-columns:repeat(4,minmax(0,1fr))">
      <div class="stt"><span class="lab">Repartido</span><b>${N(me().recibido)}</b><span>pagas y regalos</span></div>
      <div class="stt"><span class="lab">Premios</span><b>${N(won)}</b><span>lo que te han pagado</span></div>
      <div class="stt"><span class="lab">En juego</span><b>${N(open.reduce((a, b) => a + b.stake, 0))}</b><span>${open.length} apuestas abiertas</span></div>
      <div class="stt ac"><span class="lab">Si aciertas todo</span><b>${N(me().s + open.reduce((a, b) => a + b.stake * b.o, 0))}</b><span>saldo posible</span></div>
    </div>
    ${ruedaHtml()}
    <section class="movs"><div class="sec-h"><h2>Movimientos</h2><i>${lista.length} ${lista.length === 1 ? 'movimiento' : 'movimientos'}</i></div>
      <nav class="mv-tabs">${[['todo', 'Todo'], ['apuestas', 'Apuestas'], ['cajas', 'Cajas y skins'], ['pagas', 'Pagas y premios']].map(([k, n]) => `<button class="chip ${tab === k ? 'on' : ''}" data-mt="${k}">${n} <i>${cnt(k)}</i></button>`).join('')}</nav>
      ${filas || '<p class="hint">Nada por aquí todavía.</p>'}
      ${pags > 1 ? `<nav class="pags"><button data-mp="${pg - 1}" ${pg ? '' : 'disabled'} aria-label="Anterior">‹</button>${Array.from({ length: pags }, (_, i) => `<button data-mp="${i}" class="${i === pg ? 'on' : ''}">${i + 1}</button>`).join('')}<button data-mp="${pg + 1}" ${pg < pags - 1 ? '' : 'disabled'} aria-label="Siguiente">›</button></nav>` : ''}
    </section></div>`;
}

/* ---------- Perfil ---------- */
function perfil() {
  const f = fr(S.prof), mine = !!f.me, rank = [...F].sort((a, b) => b.s - a.s), pos = rank.indexOf(f) + 1, op = openOf(f.id);
  const aw = AW.filter((a) => a[2] === f.id), wins = [...f.last].filter((c) => c === 'W').length, h2h = Object.entries(H2H[f.id] || {});
  return `<div class="pf" style="--fc:var(--f-${f.id});--ring:var(--f-${f.id})">
    <button class="pf-back" data-act="back">← Volver</button>
    <header class="pf-hero">
      <div>${av(f.id, 'huge')}${mine ? `<div class="pf-act"><button data-act="photo">${f.photo ? 'Cambiar foto' : 'Poner foto'}</button>${f.photo ? '<button class="q" data-act="nophoto">Quitar</button>' : ''}</div><input type="file" id="foto" accept="image/*" data-foto hidden>` : ''}</div>
      <div style="min-width:0"><h2>${esc(f.n)}</h2>
        ${mine ? `<div class="pf-ap"><input id="apodo" data-pedit="apodo" value="${esc(f.apodo)}" maxlength="24" placeholder="Tu apodo" aria-label="Tu apodo"></div><div class="pf-fr"><input id="frase" data-pedit="frase" value="${esc(f.frase)}" maxlength="80" placeholder="Tu frase" aria-label="Tu frase"></div>`
          : `${f.apodo ? `<p class="pf-ap">${esc(f.apodo)}</p>` : ''}${f.frase ? `<p class="pf-fr">${esc(f.frase)}</p>` : ''}`}
        <div class="pf-tags"><span><b>${pos}º</b> de ${F.length}</span><span>racha <b>${f.racha}</b></span><span>fuerte en <b>${f.fuerte}</b></span></div>
        <p class="pf-note">${mine ? 'Toca tu apodo o tu frase para cambiarlos. Tu foto la ven los demás.' : `Solo ${esc(f.n)} puede cambiar su foto, su apodo y su frase.`}</p>
        ${mine ? `<div class="pf-pass" ${S.pw ? '' : 'hidden'}><input type="password" id="newpass" autocomplete="new-password" placeholder="Contraseña nueva (8 o más)" minlength="8"><button class="go" data-act="setpass">Guardar</button></div>
        <div class="pf-act">${window.Notification && Notification.permission !== 'granted' ? '<button data-act="notif">Activar avisos</button>' : window.Notification ? '<span class="pf-ok">Avisos activados</span>' : ''}<button class="q" data-act="pass">Cambiar contraseña</button><button class="q" data-act="logout">Cerrar sesión</button><span class="lang" style="margin:0">${['es', 'en'].map((l) => `<button type="button" class="${(window.GM_LANG ? GM_LANG.get() : 'es') === l ? 'on' : ''}" data-lang="${l}">${l.toUpperCase()}</button>`).join('')}</span></div>` : ''}</div>
      <div class="pf-bal"><span class="lab">Saldo</span><b>${N(f.s)}${coin()}</b>${net(f)}</div>
    </header>
    <div class="kpis">
      <div class="kpi"><span class="lab">Aciertos</span><b>${f.ac}</b><span>${f.acn}</span></div>
      <div class="kpi"><span class="lab">En juego</span><b>${N(op.reduce((a, b) => a + b.stake, 0))}</b><span>${op.length} apuestas abiertas</span></div>
      <div class="kpi"><span class="lab">Apuestas</span><b>${f.bets}</b><span>esta temporada</span></div>
      <div class="kpi"><span class="lab">Mejor premio</span><b>${N(f.best)}</b><span>de una vez</span></div>
      <div class="kpi"><span class="lab">Cuota media</span><b>${f.avgO ? O(f.avgO) : '·'}</b><span>${!f.avgO ? 'sin apuestas' : f.avgO > 2.2 ? 'arriesga mucho' : f.avgO > 1.8 ? 'término medio' : 'juega seguro'}</span></div>
    </div>
    <div class="pf-2">
      <section class="cs"><div class="cs-h"><div><h3>${mine ? 'Tu saldo' : 'Su saldo'}</h3><p>Por encima de la línea discontinua va ganando.</p></div></div><div class="chart">${chLines([f], 640, 250, 44, 600, false)}</div></section>
      <section class="cs"><div class="cs-h"><div><h3>Por deporte</h3><p>Apuestas acertadas de las resueltas.</p></div></div>
        ${DEP.map((k) => { const [w, t] = f.sp[k]; return `<div class="sb"><img src="${SP[k][1]}" alt=""><strong>${SP[k][0]}</strong><em>${w} de ${t} · ${t ? Math.round((w / t) * 100) : 0}%</em><span class="bar"><i style="width:${t ? (w / t) * 100 : 0}%"></i></span></div>` }).join('')}
        ${f.last ? `<div class="sb"><span></span><strong>Últimas ${f.last.length}</strong><em>${wins} de ${f.last.length}</em><span class="dots" style="grid-column:1/4">${[...f.last].map((c) => `<i class="${c === 'W' ? 'w' : 'l'}" style="--c:var(--f-${f.id})"></i>`).join('')}</span></div>` : ''}
      </section>
    </div>
    ${h2h.some(([, [a, b]]) => a + b > 0) ? `<section class="cs"><div class="cs-h"><div><h3>${mine ? 'Tus duelos' : 'Duelos'}</h3><p>Partidos en los que apostasteis a cosas distintas: quién acertó.</p></div></div>
      ${h2h.map(([o, [a, b]]) => `<div class="hh2"><span style="display:flex;align-items:center;gap:12px">${av(f.id, 'xl')}<strong style="font:600 15px var(--sans)">${esc(f.n)}</strong></span>
        <div class="sc">${a}<i>:</i>${b}<small>${a > b ? esc(f.n) + ' gana' : a < b ? esc(fr(o).n) + ' gana' : 'empate'} el cara a cara</small></div>
        <span style="display:flex;align-items:center;gap:12px;justify-self:end"><strong style="font:600 15px var(--sans)">${esc(fr(o).n)}</strong>${av(o, 'xl')}</span></div>`).join('')}</section>` : ''}
    ${f.favs.length ? `<section class="cs"><div class="cs-h"><div><h3>Sigue a</h3></div></div><div class="favs">${f.favs.map(([src, n, face]) => `<span class="fav">${img(src, face ? 'face' : 'tl')}${esc(n)}</span>`).join('')}</div></section>` : ''}
    <section class="cs"><div class="cs-h"><div><h3>En juego</h3><p>${op.length} apuestas · toca una para ver el partido.</p></div></div>
      <div class="pf-bets">${op.map((b) => betCard(f, b)).join('') || '<p class="hint">Nada en juego ahora mismo.</p>'}</div></section>
    ${historial(f)}
    <section class="cs"><div class="cs-h"><div><h3>Premios</h3></div></div>
      ${aw.length ? `<div class="pf-aw">${aw.map(([k, v, , d]) => `<div><span class="lab">${k}</span><b>${v}</b><span class="dd">${esc(d)}</span></div>`).join('')}</div>` : '<p class="hint">Aún sin premios esta temporada.</p>'}</section>
  </div>`;
}

/* ---------- motor ---------- */
const SCREENS = {
  partidos: ['Partidos', 'Fútbol, Valorant, CS2 y UFC · solo 1 X 2 · cierra al empezar', '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'],
  apuestas: ['Mis apuestas', 'Lo que llevas en juego y todo lo que ya se ha pagado', '<path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4z"/><path d="M14.5 6.5v11" stroke-dasharray="1.5 2"/>'],
  colegas: ['Apuestas de todos', 'Lo que lleva cada uno en juego y cuánto falta', '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.2 19.5a5.8 5.8 0 0 1 11.6 0"/><circle cx="16.8" cy="9.6" r="2.6"/><path d="M15.4 14.4a4.6 4.6 0 0 1 5.6 4.5"/>'],
  liga: ['Liga', 'La temporada, semana a semana', '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4"/>'],
  cajas: ['Cajas', 'Abre cajas de CS2, guarda skins y juega batallas', '<path d="M3.8 8.2 12 4.2l8.2 4v7.6L12 19.8l-8.2-4z"/><path d="M3.8 8.2 12 12.2l8.2-4M12 12.2v7.6M7.9 6.2l8.2 4"/>'],
  chat: ['Chat', 'Fotos, mensajes y avisos', '<path d="M5 5h14a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 17h-8l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 5 5z"/>'],
  monedero: ['Monedero', 'Tus V-Bucks, la paga del lunes y cada movimiento', '<path d="M4.5 8V7a2 2 0 0 1 2-2H17v3"/><rect x="4" y="8" width="16.5" height="11" rx="2.5"/><circle cx="16" cy="13.5" r="1.3"/>'],
};
const R = { partidos, apuestas, colegas, liga, chat, monedero, perfil, cajas: () => (window.GM_CAJAS ? GM_CAJAS.html() : '') };
const cajasCtx = () => ({ db, me: ME, jugadores: F.map((f) => ({ id: f.uid, n: f.n, color: f.id, ini: f.ini, photo: !!f.photo })), saldo: me().s, toast, refresh });
const photoCss = () => { document.getElementById('phs').textContent = F.filter((f) => f.photo).map((f) => `.av.${f.id}.ph{background-image:url("${encodeURI(f.photo)}")}`).join('') };
function render() {
  if (!loaded) return;
  NOW = Date.now();
  const msg = document.querySelector('[data-msg]'), borrador = msg ? { v: msg.value, f: document.activeElement === msg, a: msg.selectionStart } : null;
  const cajas = [...document.querySelectorAll('#view input[id^="poll-"]')].map((e) => [e.id, e.value, document.activeElement === e]);
  const keep = {}; document.querySelectorAll('[data-keep]').forEach((e) => (keep[e.dataset.keep] = e.scrollTop));
  const un = S.scr === 'chat' ? 0 : unread();
  document.getElementById('nav').innerHTML = Object.entries(SCREENS).map(([k, [n, , ic]]) => `<button class="nv ${S.scr === k ? 'on' : ''}" data-scr="${k}"><svg viewBox="0 0 24 24">${ic}</svg><span class="nl">${n}</span><span class="ns">${n.replace('Mis apuestas', 'Apuestas').replace('Apuestas de todos', 'Todos')}</span>${k === 'chat' && un ? `<i>${un}</i>` : ''}</button>`).join('');
  const rank = [...F].sort((a, b) => b.s - a.s);
  document.getElementById('me').innerHTML = `${av(MEK, 'xl')}<b>${esc(me().n)}</b><em>${N(me().s)} · ${rank.indexOf(me()) + 1}º de ${F.length}</em>`;
  document.getElementById('me').dataset.prof = MEK;
  const lg = window.GM_LANG ? GM_LANG.get() : 'es';
  document.getElementById('lang').innerHTML = ['es', 'en'].map((l) => `<button type="button" class="${l === lg ? 'on' : ''}" data-lang="${l}">${l.toUpperCase()}</button>`).join('');
  const [t, sub] = S.scr === 'perfil' ? ['Perfil', fr(S.prof).n + (fr(S.prof).apodo ? ' · ' + fr(S.prof).apodo : '')] : SCREENS[S.scr];
  document.getElementById('top').innerHTML = `<h1>${t}</h1><span class="sub">${esc(sub)}</span><span class="pay">+${N(WEEKLY)} V-Bucks el lunes · <b data-cdpay>${fmtPay(PAY)}</b></span>${CLAIM && !CLAIM.today ? `<button class="claim" data-act="claim">${IC_GIFT}<span>Reclamar ${N(CLAIM.amount)}</span></button>` : ''}<span class="onl" data-onl>${onlineHtml()}</span><span class="bal"><span class="num">${N(lastBal ?? me().s)}</span>${coin()}</span>`;
  photoCss();
  const vw = document.getElementById('view'), cambia = vw.dataset.vista !== S.scr;
  vw.innerHTML = R[S.scr](); vw.dataset.vista = S.scr;
  if (S.scr === 'cajas' && window.GM_CAJAS) GM_CAJAS.montar(vw, cajasCtx(), cambia);
  if (cambia) { vw.classList.remove('entra'); void vw.offsetWidth; vw.classList.add('entra') }
  cuentaSaldo();
  if (S.scr === 'partidos') { lgFlechas(); fillEspn(); fillSheet(); fillBracket() }
  document.querySelectorAll('[data-keep]').forEach((e) => { if (keep[e.dataset.keep]) e.scrollTop = keep[e.dataset.keep] });
  if (window.GM_LANG) GM_LANG.traduce(document.getElementById('app'));
  for (const [id, v, f] of cajas) { const e = document.getElementById(id); if (e) { e.value = v; if (f) e.focus() } }
  const msg2 = document.querySelector('[data-msg]'); if (msg2 && borrador) { msg2.value = borrador.v; if (borrador.f) { msg2.focus(); try { msg2.setSelectionRange(borrador.a, borrador.a) } catch {} } }
  document.querySelectorAll('[data-chat]').forEach((e) => { e.scrollTop = e.scrollHeight; e.querySelectorAll('img').forEach((i) => i.addEventListener('load', () => (e.scrollTop = e.scrollHeight), { once: true })) });
}
function updStake() {
  const m = S.sel && byId(S.sel.m); if (!m) return; const st = stakeNow(), o = po(m, S.sel.p);
  document.querySelectorAll('[data-ret]').forEach((e) => (e.innerHTML = N(st * o) + coin()));
  document.querySelectorAll('[data-gain]').forEach((e) => (e.textContent = N(st * o - st) + ' limpias'));
  document.querySelectorAll('[data-sv]').forEach((e) => (e.innerHTML = N(st) + coin()));
  document.querySelectorAll('[data-go]').forEach((e) => { e.textContent = 'Apostar ' + N(st); e.disabled = st < 1 });
  document.querySelectorAll('input[type=range][data-in]').forEach((e) => { e.style.setProperty('--p', ((st / Math.max(1, me().s)) * 100).toFixed(1) + '%'); if (+e.value !== st) e.value = st });
  document.querySelectorAll('[data-stake]').forEach((e) => { const v = e.dataset.stake; e.classList.toggle('on', v === 'all' ? S.stake >= me().s : +v === S.stake) });
}
let tt;
function toast(html) { const t = document.getElementById('toast'); t.innerHTML = html; if (window.GM_LANG) GM_LANG.traduce(t); t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 2800) }
const errMsg = (e) => esc((e && (e.message || e.error_description)) || 'Algo ha fallado').replace(/^.*?: /, (x) => (x.length < 30 ? '' : x));
async function refresh() { try { await loadSeguro(); render() } catch (e) { toast(errMsg(e)) } }
let busy = false;
async function placeBet() {
  const m = S.sel && byId(S.sel.m); if (!m || !isOpen(m) || busy) return;
  const st = stakeNow(); if (st < 1) return toast(puedeRescate() ? 'Sin saldo: pide el rescate en Monedero' : CLAIM && !CLAIM.today ? 'Sin saldo: reclama el premio diario arriba' : 'Sin saldo: espera a la paga del lunes');
  busy = true; const p = S.sel.p;
  const { data, error } = await db.rpc('place_bet', { p_match: m.id, p_pick: p, p_stake: st });
  busy = false;
  if (error) return toast(errMsg(error));
  vuela(document.querySelector('[data-act=bet]'));
  toast(`Apostado <b>${N(st)}</b> a ${esc(pn(m, p))} · <b>${O(data.odds)}</b>`);
  S.sel = null; await refresh();
}
// fotos: se encogen antes de subir (perfil 256 px cuadrada, chat 1280 px)
async function shrink(file, max, square) {
  const url = URL.createObjectURL(file);
  try {
    const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url });
    let sx = 0, sy = 0, sw = im.width, sh = im.height, w = sw, h = sh;
    if (square) { const s = Math.min(sw, sh); sx = (sw - s) / 2; sy = (sh - s) / 2; sw = sh = s; w = h = Math.min(max, s) } else { const k = Math.min(1, max / Math.max(sw, sh)); w = Math.round(sw * k); h = Math.round(sh * k) }
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(im, sx, sy, sw, sh, 0, 0, w, h);
    return await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85));
  } finally { URL.revokeObjectURL(url) }
}
async function upload(blob, name) {
  const path = `${ME}/${name}-${Date.now()}.jpg`;
  const { error } = await db.storage.from('fotos').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
  if (error) throw error;
  return db.storage.from('fotos').getPublicUrl(path).data.publicUrl;
}
const IC_POLL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 19.5V11M12 19.5V5M19 19.5v-6"/></svg>';
const IC_MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/></svg>';
let REC = null;
const recTxt = () => { const s = REC ? Math.floor((Date.now() - REC.t0) / 1000) : 0; return `Grabando ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` };
async function micEmpieza() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast('Este navegador no deja grabar audio');
  let st; try { st = await navigator.mediaDevices.getUserMedia({ audio: true }) } catch { return toast('No hay micrófono o no has dado permiso') }
  const tipo = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
  const mr = new MediaRecorder(st, tipo ? { mimeType: tipo } : undefined), trozos = [];
  mr.ondataavailable = (e) => e.data.size && trozos.push(e.data);
  REC = { mr, st, trozos, t0: Date.now(), cancel: false, iv: setInterval(() => { document.querySelectorAll('[data-rec]').forEach((e) => (e.textContent = recTxt())); if (Date.now() - REC.t0 > 120000) micPara() }, 500) };
  mr.onstop = async () => {
    const r = REC; REC = null; clearInterval(r.iv); r.st.getTracks().forEach((t) => t.stop()); render();
    if (r.cancel || !r.trozos.length) return;
    const secs = Math.max(1, Math.round((Date.now() - r.t0) / 1000)), blob = new Blob(r.trozos, { type: (mr.mimeType || 'audio/webm').split(';')[0] });
    try {
      toast('Enviando nota de voz…');
      const ext = /mp4/.test(blob.type) ? 'm4a' : /ogg/.test(blob.type) ? 'ogg' : 'webm', path = `${ME}/voz-${Date.now()}.${ext}`;
      const { error } = await db.storage.from('fotos').upload(path, blob, { contentType: blob.type, cacheControl: '31536000' }); if (error) throw error;
      const audio_url = db.storage.from('fotos').getPublicUrl(path).data.publicUrl;
      const { error: e2 } = await db.from('chat').insert({ player: ME, body: '', audio_url, audio_secs: Math.min(secs, 300) }); if (e2) throw e2;
      await refresh();
    } catch (e) { toast(errMsg(e)) }
  };
  mr.start(); render();
}
function micPara(cancel) { if (!REC) return; REC.cancel = !!cancel; try { REC.mr.stop() } catch {} }
async function sendMsg(file) {
  const el = document.querySelector('[data-msg]'), txt = el ? el.value.trim() : '';
  if (!txt && !file) return;
  try {
    let image_url = null; if (file) { toast('Subiendo foto…'); image_url = await upload(await shrink(file, 1280, false), 'chat') }
    const { error } = await db.from('chat').insert({ player: ME, body: txt, image_url }); if (error) throw error;
    if (el) el.value = ''; await refresh(); document.querySelector('[data-msg]')?.focus();
  } catch (e) { toast(errMsg(e)) }
}
async function setPhoto(file) {
  try { toast('Subiendo foto…'); const url = await upload(await shrink(file, 256, true), 'perfil'); const { error } = await db.rpc('update_profile', { p_photo: url }); if (error) throw error; toast('Foto de perfil cambiada'); await refresh() } catch (e) { toast(errMsg(e)) }
}
async function savePerfil(k, v) {
  const { error } = await db.rpc('update_profile', k === 'apodo' ? { p_apodo: v } : { p_frase: v });
  if (error) return toast(errMsg(error)); toast(k === 'apodo' ? 'Apodo guardado' : 'Frase guardada'); await refresh();
}
document.addEventListener('click', (e) => { const b = e.target.closest('[data-lang]'); if (!b || !window.GM_LANG) return; GM_LANG.set(b.dataset.lang); location.reload(); }, true);
document.addEventListener('click', (e) => { const b = e.target.closest('[data-lga]'); if (!b) return; const n = document.querySelector('[data-lgs]'); n?.scrollBy({ left: +b.dataset.lga * n.clientWidth * 0.8, behavior: 'smooth' }) });
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-side],[data-bm],[data-mt],[data-mp],[data-rx],[data-rxo],[data-vote],[data-share],[data-sumo],[data-cancel],[data-calc],[data-retar],[data-rto],[data-rpick],[data-rstake],[data-accept],[data-decline],[data-retirar],[data-daily],[data-scr],[data-f],[data-lg],[data-pick],[data-stake],[data-act],[data-foc],[data-bf],[data-vis],[data-pf],[data-goto],[data-prof]'); if (!t || t.disabled) return;
  const d = t.dataset;
  if (d.side && t.matches('[data-side]')) { S.side = d.side; document.querySelector('.det')?.scrollTo?.(0, 0); return render() }
  if (d.act === 'sheet-back') { S.side = null; return render() }
  if (d.mt) { S.mt = d.mt; S.mp = 0; return render() }
  if (d.mp != null && t.matches('[data-mp]')) { S.mp = +d.mp; render(); document.querySelector('.movs')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); return }
  if (d.act === 'girar') {
    if (S.ruGira) return; S.ruGira = true; render();
    const { data, error } = await db.rpc('spin_wheel'); if (error) { S.ruGira = false; render(); return toast(errMsg(error)) }
    const el = document.getElementById('rueda'), base = Math.ceil((S.ruRot || 0) / 360) * 360;
    S.ruRot = base + 360 * 6 - (data.prize * 45 + 22.5) + (Math.random() - .5) * 30;
    if (el) { el.style.transition = 'transform 5.2s cubic-bezier(.12,.7,.14,1)'; el.style.transform = `rotate(${S.ruRot}deg)` }
    setTimeout(async () => { S.ruGira = false; toast(data.item ? `${esc(data.label)}: ya está en tu inventario` : `Ruleta: <b>${esc(data.label)}</b>`); if (window.GM_FX?.confeti) GM_FX.confeti(); await refresh() }, 5400);
    return;
  }
  if (d.act === 'bracket') { S.brk = true; S.side = null; document.querySelector('.det')?.scrollTo?.(0, 0); return render() }
  if (d.act === 'brk-back') { S.brk = false; return render() }
  if (d.bm) { const g = (byId(S.foc)?.tour || '').split(':')[0], mid = `ps:${g}:${d.bm}`; if (byId(mid) && mid !== S.foc) { S.foc = mid; S.brk = false; return render() } return }
  if (d.rxo !== undefined && t.matches('[data-rxo]')) { S.rx = S.rx === d.rxo ? null : d.rxo; return render() }
  if (d.rx) { const [tg, em] = d.rx.split('|'); S.rx = null; const { error } = await db.rpc('react', { p_target: tg, p_emoji: em }); if (error) return toast(errMsg(error)); return refresh() }
  if (d.vote) { const [pid, o] = d.vote.split('|'); const { error } = await db.rpc('vote_poll', { p_poll: +pid, p_opt: +o }); if (error) return toast(errMsg(error)); return refresh() }
  if (d.share) { const { error } = await db.from('chat').insert({ player: ME, body: '', bet_id: +d.share }); if (error) return toast(errMsg(error)); toast('Apuesta mandada al chat'); return refresh() }
  if (d.sumo) { const [mid, pk] = d.sumo.split('|'); S.scr = 'partidos'; S.foc = mid; S.sheet = true; S.side = null; S.sel = { m: mid, p: pk }; location.hash = 'partidos'; render(); return toast('Elige cuánto y dale a Apostar') }
  if (d.act === 'claim') { const { data, error } = await db.rpc('claim_daily'); if (error) return toast(errMsg(error)); toast(`+${N(data)}${coin()} del premio diario`); return refresh() }
  if (d.act === 'rescue') { const { data, error } = await db.rpc('claim_rescue'); if (error) return toast(errMsg(error)); toast(`Rescate: +${N(data)}${coin()}`); return refresh() }
  if (d.act === 'poll') { S.pollForm = !S.pollForm; render(); if (S.pollForm) document.getElementById('poll-q')?.focus(); return }
  if (d.act === 'poll-x') { S.pollForm = false; return render() }
  if (d.act === 'poll-ok') { const q = document.getElementById('poll-q')?.value || '', o = [0, 1, 2, 3].map((i) => document.getElementById('poll-o' + i)?.value || '');
    const { error } = await db.rpc('create_poll', { p_question: q, p_options: o }); if (error) return toast(errMsg(error)); S.pollForm = false; return refresh() }
  if (d.cancel) {
    e.stopPropagation();
    if (S.sure !== 'b' + d.cancel) { S.sure = 'b' + d.cancel; render(); setTimeout(() => { if (S.sure === 'b' + d.cancel) { S.sure = null; render() } }, 3500); return }
    S.sure = null; const { data, error } = await db.rpc('cancel_bet', { p_bet: +d.cancel }); if (error) return toast(errMsg(error));
    toast(`Cancelada: te devuelvo <b>${N(data.devuelto)}</b>`); return refresh();
  }
  if (d.calc != null && d.calc !== undefined && t.matches('[data-calc]')) { S.calc = +d.calc; try { localStorage.setItem('apuestas-calc', S.calc) } catch {} return render() }
  if (d.retar) { S.reto = { m: d.retar, to: F.find((f) => !f.me)?.id || null, p: null, stake: 250 }; return render() }
  if (d.rto) { S.reto.to = d.rto; return render() }
  if (d.rpick) { S.reto.p = d.rpick; return render() }
  if (d.rstake) { S.reto.stake = +d.rstake; return render() }
  if (d.accept) { e.stopPropagation(); const [id, p] = d.accept.split('|'); const { error } = await db.rpc('challenge_answer', { p_id: +id, p_accept: true, p_pick: p }); if (error) return toast(errMsg(error)); toast('Reto aceptado'); return refresh() }
  if (d.decline) { e.stopPropagation(); const { error } = await db.rpc('challenge_answer', { p_id: +d.decline, p_accept: false }); if (error) return toast(errMsg(error)); toast('Reto rechazado'); return refresh() }
  if (d.retirar) { e.stopPropagation(); const { error } = await db.rpc('challenge_cancel', { p_id: +d.retirar }); if (error) return toast(errMsg(error)); toast('Reto retirado: te devuelvo lo puesto'); return refresh() }
  if (d.daily) { const { error } = await db.rpc('admin_set', { p_key: 'daily_on', p_value: d.daily === 'true' }); if (error) return toast(errMsg(error)); return refresh() }
  if (d.act === 'reto-close') { S.reto = null; return render() }
  if (d.act === 'reto-send') {
    const r = S.reto, to = fr(r.to); const st = Math.max(0, Math.min(r.stake, me().s));
    const { error } = await db.rpc('challenge_create', { p_match: r.m, p_to: to.uid, p_pick: r.p, p_stake: st }); if (error) return toast(errMsg(error));
    S.reto = null; toast(`Reto enviado a ${esc(to.n)}`); return refresh();
  }
  if (d.act === 'notif') { try { const r = await Notification.requestPermission(); toast(r === 'granted' ? 'Avisos activados' : 'El navegador no ha dado permiso') } catch {} return render() }
  if (d.scr) { S.scr = d.scr; S.sheet = false; document.getElementById('view').scrollTop = 0 }
  else if (d.f) S.f = d.f;
  else if (d.lg) S.lg = d.lg;
  else if (d.bf) S.bf = d.bf;
  else if (d.vis) { const { error } = await db.rpc('admin_set', { p_key: 'vis', p_value: d.vis }); if (error) return toast(errMsg(error)); return refresh() }
  else if (d.pf) S.pf = d.pf;
  else if (d.prof) { if (S.scr !== 'perfil') S.prev = S.scr; S.prof = d.prof; S.scr = 'perfil'; S.sheet = false; document.getElementById('view').scrollTop = 0 }
  else if (d.goto) { S.scr = 'partidos'; S.foc = d.goto; S.sheet = true; document.getElementById('view').scrollTop = 0 }
  else if (d.pick) { S.side = null; const [m, p] = d.pick.split('|'); S.sel = isSel(byId(m), p) ? null : { m, p }; if (S.foc !== m) { S.foc = m; S.sheet = true } }
  else if (d.stake) { S.stake = d.stake === 'all' ? me().s : +d.stake; return updStake() }
  else if (d.act === 'bet') return placeBet();
  else if (d.act === 'send') return sendMsg();
  else if (d.act === 'img') return document.getElementById('pic').click();
  else if (d.act === 'mic') return REC ? micPara(false) : micEmpieza();
  else if (d.act === 'mic-x') return micPara(true);
  else if (d.act === 'hist-all') S.histAll = true;
  else if (d.act === 'photo') return document.getElementById('foto').click();
  else if (d.act === 'nophoto') { const { error } = await db.rpc('update_profile', { p_photo: '' }); if (error) return toast(errMsg(error)); toast('Foto quitada'); return refresh() }
  else if (d.act === 'logout') { await db.auth.signOut({ scope: 'local' }); return showLogin() }
  else if (d.act === 'pass') S.pw = !S.pw;
  else if (d.act === 'setpass') {
    const v = document.getElementById('newpass').value;
    if (v.length < 8) return toast('Mínimo 8 caracteres');
    const { error } = await db.auth.updateUser({ password: v });
    if (error) return toast(errMsg(error));
    S.pw = false; toast('Contraseña cambiada. Solo la sabes tú.');
  }
  else if (d.act === 'close') S.sheet = false;
  else if (d.act === 'back') S.scr = S.prev || 'colegas';
  else if (d.foc) { if (S.foc !== d.foc) { S.reto = null; S.side = null; S.brk = false } S.foc = d.foc; S.sheet = true }
  render();
});
document.addEventListener('input', (e) => { if (!e.target.matches('[data-in]')) return; S.stake = Math.max(0, Math.round(+e.target.value || 0)); updStake() });
document.addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0];
  if (e.target.matches('[data-foto]') && f && /^image\//.test(f.type)) return setPhoto(f);
  if (e.target.matches('[data-file]') && f && /^image\//.test(f.type)) return sendMsg(f);
  if (e.target.matches('[data-pedit]')) { const v = e.target.value.trim(); if (v) savePerfil(e.target.dataset.pedit, v) }
});
document.addEventListener('keydown', (e) => { if (e.target.matches('[data-msg]') && e.key === 'Enter') sendMsg(); if (e.target.matches('[data-pedit]') && e.key === 'Enter') e.target.blur() });

/* ---------- entrar ---------- */
function showLogin() { if (window.GM_LANG) GM_LANG.traduce(document.getElementById('login')); document.getElementById('boot').hidden = true; document.getElementById('app').hidden = true; document.getElementById('login').hidden = false; setTimeout(() => document.getElementById('user').focus(), 50) }
function showApp() { document.getElementById('boot').hidden = true; document.getElementById('login').hidden = true; document.getElementById('app').hidden = false }
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const u = document.getElementById('user').value.trim().toLowerCase().replace(/\s+/g, ''), p = document.getElementById('pass').value;
  const err = document.getElementById('login-err'), go = document.getElementById('login-go'); err.textContent = ''; go.disabled = true;
  const { error } = await db.auth.signInWithPassword({ email: u.includes('@') ? u : u + DOMAIN, password: p });
  go.disabled = false;
  if (error) { err.textContent = 'Usuario o contraseña incorrectos'; return }
  start();
});
const IC_GIFT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3 9h18M12 9v11M12 9c-1.5-3.5-6-4-6-1.5S10 9 12 9zm0 0c1.5-3.5 6-4 6-1.5S14 9 12 9z"/></svg>';
const IC_TICKET = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4z"/></svg>';
const IC_BOX = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3.8 8.2 12 4.2l8.2 4v7.6L12 19.8l-8.2-4z"/><path d="M3.8 8.2 12 12.2l8.2-4M12 12.2v7.6"/></svg>';
const puedeRescate = () => CLAIM && !CLAIM.rescue_used && me().s < 10 && !openOf(MEK).length;
let chan = null, ONLINE = new Set();
const onlineHtml = () => { const ks = [...new Set([MEK, ...ONLINE])].filter((k) => F.some((f) => f.id === k)); return `<span class="onl-l"><i></i>En línea</span>${ks.map((k) => `<span class="onl-a" data-prof="${k}" title="${esc(fr(k).n)}">${av(k, 'sm')}</span>`).join('')}` };
const pintaOnline = () => document.querySelectorAll('[data-onl]').forEach((e) => { e.innerHTML = onlineHtml(); if (window.GM_LANG) GM_LANG.traduce(e) });
function live() {
  if (chan) return;
  let to; const soon = () => { clearTimeout(to); to = setTimeout(refresh, 700) };
  chan = db.channel('vivo', { config: { presence: { key: String(ME) } } }).on('presence', { event: 'sync' }, () => { ONLINE = new Set(Object.values(chan.presenceState()).flat().map((x) => x.k)); pintaOnline() }).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pulse' }, soon).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat' }, soon).subscribe(async (st) => { if (st === 'SUBSCRIBED') try { await chan.track({ k: MEK }) } catch {} });
  // cuenta atras cada minuto y datos frescos cada 5, solo con la pantalla visible
  let ticks = 0;
  setInterval(() => { if (document.hidden) return; ticks++; if (ticks % 5 === 0) return refresh(); if (!document.activeElement?.matches('input,textarea')) render() }, 60000);
  // la cuenta atras de la paga con segundos: solo cambia ese texto
  setInterval(() => { if (document.hidden) return; const t = fmtPay(PAY); document.querySelectorAll('[data-cdpay]').forEach((e) => (e.textContent = t)); if (Date.now() > PAY) refresh() }, 1000);
  // marcadores en directo: cada minuto, ESPN da el marcador de los partidos en juego (solo con Partidos en pantalla)
  setInterval(async () => {
    if (document.hidden || S.scr !== 'partidos') return;
    const lv = M.filter((m) => m.live && m.espn).slice(0, 10); if (!lv.length) return;
    await Promise.all(lv.map((m) => espnData(m).then((d) => { const c = d?.header?.competitions?.[0], h = c?.competitors?.find((x) => x.homeAway === 'home'), a = c?.competitors?.find((x) => x.homeAway === 'away'); if (h && a) m.score = `${h.score ?? 0}:${a.score ?? 0}` })));
    if (!document.activeElement?.matches('input')) render();
  }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh() });
}
const haySesionGuardada = () => { try { return !!localStorage.getItem('apuestas-auth') } catch { return false } };
const sesionMuerta = (e) => /refresh token|invalid grant|not found|revoked|already used|session_not_found/i.test(e?.message || '');
async function loadSeguro() {
  try { return await load() } catch (e) {
    if (!/JWT|session|entrar/i.test(e?.message || '')) throw e;
    const { error } = await db.auth.refreshSession(); if (error) throw error;
    return await load();
  }
}
async function start() {
  if (!CFG.url) { document.getElementById('boot').innerHTML = '<p class="hint">Falta config.js</p>'; return }
  // antes: si el token habia caducado al abrir, se cerraba la sesion (y signOut la cerraba en TODOS sus aparatos).
  // Ahora se renueva y se reintenta; solo se pide la contrasena si la base dice que esa sesion ya no vale
  let { data: { session } } = await db.auth.getSession();
  for (let i = 0; !session && i < 3 && haySesionGuardada(); i++) {
    const r = await db.auth.refreshSession(); session = r.data?.session;
    if (!session && r.error && sesionMuerta(r.error)) break;
    if (!session) await new Promise((ok) => setTimeout(ok, 1500 * (i + 1)));
  }
  if (!session) return showLogin();
  try { await loadSeguro() } catch (e) {
    if (sesionMuerta(e)) return showLogin();
    toast(errMsg(e)); setTimeout(start, 6000); return
  }
  const h = location.hash.slice(1); if (R[h] && h !== 'perfil') S.scr = h;
  S.prof = MEK; showApp(); render(); live();
}
window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (R[h] && h !== 'perfil') { S.scr = h; render() } });
start();
