// Apuestas entre colegas: la app. Los datos viven en Supabase; aqui solo se pintan y se piden cosas.
// El dinero nunca se calcula aqui: apostar, pagar y cobrar lo hacen las funciones de la base (db/001_init.sql).
'use strict';
const CFG = window.APP_CONFIG || {};
const db = supabase.createClient(CFG.url, CFG.anon, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'apuestas-auth' } });
const TZ = 'Europe/Madrid', DAY = 864e5, DOMAIN = '@apuestas.app';
const TOP = new Set(['esp.1', 'eng.1', 'ger.1', 'ita.1', 'fra.1', 'uefa.champions', 'uefa.europa', 'esp.copa_del_rey']);
const SP = { f: ['Fútbol', '../img/futbol.svg'], v: ['Valorant', '../img/valorant.svg'], u: ['UFC', '../img/ufc.png'] };
const KIND = { paga: 'Paga del lunes', apuesta: 'Apuesta', premio: 'Premio', devolucion: 'Devolución', ajuste: 'Ajuste' };

/* ---------- estado ---------- */
let NOW = Date.now(), PAY = 0, WEEK0 = 0;
let ME = null, MEK = 'pm', VIS = 'open', WEEKLY = 1000, SEASON = '';
let F = [], M = [], MI = new Map(), L = {}, ALL = [], LEDGER = [], CHAT = [], AW = [], H2H = {};
let CH = [], DAILY = [], DAILY_ON = false, DAILY_BONUS = 1.25;
let S = { scr: 'partidos', f: 'all', lg: 'top', sel: null, stake: 200, foc: null, sheet: false, bf: 'all', pf: 'pm', prof: 'pm', prev: 'colegas', calc: 0, reto: null, sure: null };
try { S.calc = +localStorage.getItem('apuestas-calc') || 0 } catch {}
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
  const [st, ms, ch, ex] = await Promise.all([
    db.rpc('get_state'),
    db.from('matches').select(COLS).gte('starts_at', from).lte('starts_at', to).neq('status', 'canceled').order('starts_at').limit(3000),
    db.from('chat').select('*').order('id', { ascending: false }).limit(150),
    db.rpc('get_extras'),
  ]);
  if (st.error) throw st.error;
  if (ms.error) throw ms.error;
  let rows = ms.data || [];
  const have = new Set(rows.map((r) => r.id)), need = [...new Set(st.data.bets.map((b) => b.match))].filter((id) => !have.has(id));
  for (let i = 0; i < need.length; i += 150) {
    const r = await db.from('matches').select(COLS).in('id', need.slice(i, i + 150));
    if (!r.error) rows = rows.concat(r.data);
  }
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
    tv: r.details?.tv || [], espn: r.details?.espn || null,
  }));
  MI = new Map(M.map((m) => [m.id, m]));
  L = {}; for (const r of rows) if (!L[r.league]) L[r.league] = [r.league_name, r.league_logo || SP[r.sport][1]];
  ALL = st.bets.map((b) => ({ id: b.id, k: key.get(b.player), m: b.match, p: b.pick, stake: b.stake, o: Number(b.odds), st: b.status, pay: b.payout, at: b.created, set: b.settled }));
  LEDGER = st.ledger.map((l) => [when(l.at), KIND[l.kind] || l.kind, l.note, l.amount]);
  CHAT = chat.map((c) => ({ id: c.id, k: c.player ? key.get(c.player) : null, t: when(c.created_at), txt: c.body, img: c.image_url }));
  F = st.players.map((p) => {
    const k = p.color, mine = ALL.filter((b) => b.k === k);
    const settled = mine.filter((b) => b.st === 'won' || b.st === 'lost').sort((a, b) => Date.parse(a.set) - Date.parse(b.set));
    const w = settled.filter((b) => b.st === 'won').length, t = settled.length;
    let run = 0, last = settled[settled.length - 1]; for (let i = settled.length - 1; i >= 0 && settled[i].st === last.st; i--) run++;
    let streak = 0, cur = 0; for (const b of settled) { cur = b.st === 'won' ? cur + 1 : 0; streak = Math.max(streak, cur) }
    const sp = {}, stakeBy = {}; let stakeAll = 0;
    for (const s of ['f', 'v', 'u']) { const x = settled.filter((b) => MI.get(b.m)?.s === s); sp[s] = [x.filter((b) => b.st === 'won').length, x.length]; stakeBy[s] = mine.filter((b) => MI.get(b.m)?.s === s).reduce((a, b) => a + b.stake, 0); stakeAll += stakeBy[s] }
    const ranked = ['f', 'v', 'u'].filter((s) => sp[s][1] >= 2).sort((a, b) => sp[b][0] / sp[b][1] - sp[a][0] / sp[a][1]);
    const weeks = p.weeks.length ? p.weeks : [p.saldo];
    return {
      id: k, uid: p.id, n: p.name, ini: p.ini, s: p.saldo, me: p.id === ME, admin: p.admin, username: p.username,
      apodo: p.apodo, frase: p.frase, photo: p.photo, favs: Array.isArray(p.favs) ? p.favs : [], recibido: p.recibido,
      h: [WEEKLY, ...weeks], wk: weeks.map((v, i) => v - (i ? weeks[i - 1] : 0) - WEEKLY),
      ac: t ? Math.round((w / t) * 100) + '%' : '·', acn: `${w} de ${t}`, bets: mine.length,
      racha: t ? `${last.st === 'won' ? '▲' : '▼'} ${run}` : '·', streak,
      best: Math.max(0, ...mine.filter((b) => b.st === 'won').map((b) => b.pay)),
      fuerte: ranked[0] ? SP[ranked[0]][0] : stakeAll ? SP[['f', 'v', 'u'].sort((a, b) => stakeBy[b] - stakeBy[a])[0]][0] : '·',
      sp, share: Object.fromEntries(['f', 'v', 'u'].map((s) => [s, stakeAll ? Math.round((stakeBy[s] / stakeAll) * 100) : 0])),
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
const av = (k, cls = '') => { const f = fr(k); return `<span class="av ${k} ${cls} ${f.photo ? 'ph' : ''}" data-prof="${k}" title="Perfil de ${esc(f.n)}">${esc(f.ini)}</span>` };
const net = (f) => { const d = f.s - f.recibido; return `<span class="net ${d >= 0 ? 'up' : ''}">${d >= 0 ? '▲' : '▼'} ${N(Math.abs(d))}</span>` };
const img = (src, cls = '') => (src ? `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : `<span class="noimg ${cls}"></span>`);
const logo = (m, side) => img(side === 'a' ? m.la : m.lb, m.s === 'u' ? 'face' : '');
const form = (s) => `<span class="fm">${[...s].map((c) => `<b class="${c === 'G' ? 'g' : c === 'E' ? 'e' : ''}">${c}</b>`).join('')}</span>`;
const board = () => M.filter((m) => (m.status === 'scheduled' || m.live) && (m.live || Date.parse(m.at) > NOW) && Date.parse(m.at) < NOW + (m.s === 'u' ? 72 : 8) * DAY);
const inLeague = (m) => S.lg === 'all' ? true : S.lg === 'top' ? m.live || m.s === 'v' || (m.s === 'u' ? !!m.tag : TOP.has(m.lg)) || whoOn(m.id).length > 0 : m.lg === S.lg;
const filtered = () => board().filter((m) => (S.f === 'all' || m.s === S.f) && inLeague(m)).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
const groups = (list) => { const g = new Map(); for (const m of list) { const k = DK(m.at); if (!g.has(k)) g.set(k, []); g.get(k).push(m) } return [...g.values()] };
const dayLab = (t) => (today(t) ? `HOY · ${WD(t)}` : `${WD(t)} · ${MO(t)}`);
const stakeNow = () => Math.max(0, Math.min(S.stake, me().s));
const chips = () => [50, 100, 250, 500, 'all'].map((v) => { const on = v === 'all' ? S.stake >= me().s : S.stake === v; return `<button class="chip ${on ? 'on' : ''}" data-stake="${v}">${v === 'all' ? 'Todo' : N(v)}</button>` }).join('');
const filt = () => { const b = board().filter(inLeague), cnt = (k) => b.filter((m) => k === 'all' || m.s === k).length;
  return [['all', 'Todo', null], ['f', ...SP.f], ['v', ...SP.v], ['u', ...SP.u]].map(([k, n, im]) => `<button class="f ${S.f === k ? 'on' : ''}" data-f="${k}">${im ? `<img src="${im}" alt="">` : ''}${n}<i>${cnt(k)}</i></button>`).join('') };
const leagues = () => { const c = {}; for (const m of board()) if (S.f === 'all' || m.s === S.f) c[m.lg] = (c[m.lg] || 0) + 1;
  const ks = Object.keys(c).sort((a, b) => (TOP.has(b) - TOP.has(a)) || c[b] - c[a]);
  return `<nav class="lgs"><button class="chip ${S.lg === 'top' ? 'on' : ''}" data-lg="top">Principales</button><button class="chip ${S.lg === 'all' ? 'on' : ''}" data-lg="all">Todas</button>${ks.map((k) => `<button class="chip ${S.lg === k ? 'on' : ''}" data-lg="${esc(k)}">${esc(L[k]?.[0] || k)} <i>${c[k]}</i></button>`).join('')}</nav>` };
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
  h += tvHtml(tv);
  return h;
}
const tvHtml = (tv) => { if (!tv.length) return ''; const col = (l, t) => { const x = tv.filter((v) => v.l === l); return `<div><span class="lab">${t}</span>${x.length ? x.map((v) => (v.u ? `<a class="tv" href="${esc(v.u)}" target="_blank" rel="noopener">${esc(v.n)} ↗</a>` : `<span class="tv">${esc(v.n)}</span>`)).join('') : '<span class="tv off">sin datos</span>'}</div>` };
  return `<div class="ver"><span class="lab">Dónde verlo</span><div class="ver2">${col('en', 'En inglés')}${col('es', 'En español')}</div></div>` };
async function fillEspn() {
  const box = document.getElementById('espn-box'); if (!box) return;
  const m = byId(box.dataset.m); if (!m) return;
  if (!m.espn) { box.innerHTML = tvHtml(m.tv || []); return }
  const d = await espnData(m);
  const now = document.getElementById('espn-box'); if (!now || now.dataset.m !== m.id) return;
  now.innerHTML = d ? espnHtml(m, d) : tvHtml(m.tv || []);
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
  ['todo', 'Todoterreno', 'Apuesta en fútbol, Valorant y UFC', (f, b) => ['f', 'v', 'u'].every((s) => b.some((x) => byId(x.m)?.s === s))],
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
function avisa(t, b) { try { if (window.Notification && Notification.permission === 'granted' && document.hidden) new Notification(t, { body: b, icon: '../img/icon-192.png', tag: t + b }) } catch {} }
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
    <nav class="fil">${filt()}</nav>${leagues()}<div class="calcrow">${calcChips()}<span class="note">cuotas reales de DraftKings o calculadas · se congelan al apostar</span></div>`;
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
  const open = isOpen(m), ps = picksOf(m).filter((p) => po(m, p) != null);
  const imp = ps.map((p) => 1 / po(m, p)), sum = imp.reduce((a, b) => a + b, 0) || 1, pct = imp.map((x) => Math.round((x / sum) * 100));
  const sel = S.sel && S.sel.m === m.id;
  const cell = (v) => (String(v).startsWith('F:') ? form(String(v).slice(2)) : esc(v));
  let h = `<section class="det ${S.sheet ? 'open' : ''}" data-keep="dt">
    <button class="det-x" data-act="close">← Partidos</button>
    <div class="d-meta"><img src="${esc(L[m.lg][1])}" alt="">${esc(L[m.lg][0])}${m.stage ? ' · ' + esc(m.stage) : ''}</div>
    <div class="d-cd">${m.live ? `En vivo · ${esc(m.score || '')}` : `${WD(m.at)} ${DD(m.at)} ${MO(m.at)} · ${HM(m.at)} · empieza en ${CD(m.at)}`}${m.venue ? ' · ' + esc(m.venue) : ''}</div>
    <div class="d-vs"><div>${logo(m, 'a')}<h3>${esc(m.a)}</h3></div><span class="x">vs</span><div>${logo(m, 'b')}<h3>${esc(m.b)}</h3></div></div>
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
  if (mineHere.length) h += `<div class="d-mine"><span class="lab">Tus apuestas aquí</span>${mineHere.map((b) => `<div class="dm"><strong>${esc(pn(m, b.p))} <em>${O(b.o)}</em></strong><span>${N(b.stake)} → <b>${N(b.stake * b.o)}</b></span>${cancelBtn(b)}</div>`).join('')}</div>`;
  h += `<div id="espn-box" class="espn" data-m="${m.id}">${m.espn ? '<p class="hint">Cargando datos de ESPN…</p>' : tvHtml(m.tv || [])}</div>`;
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
    <div class="bys">${['f', 'v', 'u'].map((k) => { const [w, t] = f.sp[k]; return `<div class="by"><img src="${SP[k][1]}" alt=""><strong>${SP[k][0]}</strong><em>${w} de ${t}</em><span class="bar"><i style="width:${t ? (w / t) * 100 : 0}%"></i></span></div>` }).join('')}</div>
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
function colegas() {
  const rank = [...F].sort((a, b) => b.s - a.s), admin = me().admin;
  let h = `<div class="cg">
    <div class="cg-h"><div><span class="lab">De aquí a la paga del lunes</span><h2>Lo que viene</h2></div>
      ${me().admin ? `<nav class="vis"><span class="lab">Apuesta del día</span><button class="chip ${DAILY_ON ? 'on' : ''}" data-daily="true">Con extra ×${O(DAILY_BONUS)}</button><button class="chip ${!DAILY_ON ? 'on' : ''}" data-daily="false">Sin extra</button></nav>` : ''}
      <nav class="vis"><span class="lab">Elecciones</span>${admin ? `<button class="chip ${VIS === 'open' ? 'on' : ''}" data-vis="open">Visibles</button><button class="chip ${VIS === 'kick' ? 'on' : ''}" data-vis="kick">Ocultas hasta empezar</button>` : `<span class="chip on">${VIS === 'open' ? 'Visibles' : 'Ocultas hasta empezar'}</span>`}</nav></div>
    <div class="tl">${timeline()}</div>
    <div class="sec-h" style="margin-top:34px"><h2>Retos 1 contra 1</h2><i>${CH.filter((c) => c.st === 'pending' || c.st === 'accepted').length} abiertos</i></div>
    ${retosHtml(CH.slice(0, 10), 'Nadie ha retado a nadie todavía. Se reta desde la ficha de cada partido.')}
    <div class="sec-h" style="margin-top:34px"><h2>Duelos</h2><i>apostáis a cosas distintas</i></div>
    <div class="duels">${duels()}</div>
    <nav class="pf-tabs">${rank.map((f) => `<button class="chip ${S.pf === f.id ? 'on' : ''}" data-pf="${f.id}">${esc(f.n)}</button>`).join('')}</nav>
    <div class="cols3">`;
  for (const f of rank) {
    const op = openOf(f.id), dn = doneOf(f.id), inPlay = op.reduce((a, b) => a + b.stake, 0), pot = op.reduce((a, b) => a + b.stake * b.o, 0), pos = rank.indexOf(f) + 1;
    const visAll = op.every((b) => b.p);
    h += `<section class="pc ${S.pf === f.id ? 'on' : ''} ${f.me ? 'me' : ''}">
      <header class="pc-h" data-prof="${f.id}" style="cursor:pointer">${av(f.id, 'xl')}<div><span class="nm">${esc(f.n)}</span><span class="ps">${pos}º · racha ${f.racha}</span></div><b>${N(f.s)}${coin()}</b></header>
      <div class="pc-k"><div><span class="lab">En juego</span><b>${N(inPlay)}</b></div><div><span class="lab">Si acierta</span><b>${!op.length ? '·' : visAll ? '+' + N(pot) : '?'}</b></div><div><span class="lab">Aciertos</span><b>${f.ac}</b></div></div>
      <div class="pc-sec"><span class="lab">Próximas · ${op.length}</span></div>
      ${op.map((b) => betCard(f, b)).join('') || '<p class="hint">Nada en juego.</p>'}
      <div class="pc-sec"><span class="lab">Últimas resueltas</span></div>
      ${dn.map(([n, o, st, r, ret, mt]) => `<div class="dn ${r}"><div style="min-width:0"><strong>${esc(n)} <em>${O(o)}</em></strong><span>${esc(mt)}</span></div><b>${r === 'won' ? '+' + N(ret) : N(st)}</b></div>`).join('') || '<p class="hint">Todavía nada.</p>'}
    </section>`;
  }
  return h + `</div></div>`;
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
  const W = 520, H = 230, x0 = 110, x1 = 500, X = (v) => x0 + ((x1 - x0) * v) / 100;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Aciertos por deporte">`;
  [0, 25, 50, 75, 100].forEach((v) => (s += `<line x1="${X(v)}" x2="${X(v)}" y1="14" y2="${H - 30}" stroke="var(--hair)"/><text x="${X(v)}" y="${H - 10}" class="tx-d" font-size="10" text-anchor="middle">${v}%</text>`));
  [['f', 'Fútbol'], ['v', 'Valorant'], ['u', 'UFC']].forEach(([k, n], r) => { const y = 40 + r * 60;
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
  return `<div class="heat"><span></span>${['f', 'v', 'u'].map((k) => `<span class="hh"><img src="${SP[k][1]}" alt="">${SP[k][0]}</span>`).join('')}
    ${F.map((f) => `<span class="hr">${av(f.id, 'sm')}${esc(f.n)}</span>${['f', 'v', 'u'].map((k) => { const v = f.share[k] || 0, [bg, fg] = ramp(v); return `<span class="hc" style="background:${bg};color:${fg}" title="${esc(f.n)} pone el ${v}% de lo que apuesta en ${SP[k][0]}">${v}%</span>` }).join('')}`).join('')}</div>` };
const strips = () => F.some((f) => f.last) ? `<div class="strips">${F.map((f) => { const w = [...f.last].filter((c) => c === 'W').length; return `<div class="strip">${av(f.id)}<span class="nm">${esc(f.n)}</span>
  <span class="dots">${[...f.last].map((c) => `<i class="${c === 'W' ? 'w' : 'l'}" style="--c:var(--f-${f.id})" title="${c === 'W' ? 'ganada' : 'perdida'}"></i>`).join('')}</span><b>${w} de ${f.last.length}</b><span class="rc ${f.racha.startsWith('▲') ? 'up' : ''}">${f.racha}</span></div>` }).join('')}
  <p class="strips-k"><span><i class="w" style="--c:var(--mute)"></i>ganada</span><span><i class="l"></i>perdida</span><span>la más reciente, a la derecha</span></p></div>` : '<p class="hint">Cuando se resuelvan las primeras apuestas saldrán aquí.</p>';
const table = (rank) => `<div class="tbl"><div class="tr h"><span></span><span>Colega</span><span>Saldo</span><span>Neto</span><span>Aciertos</span><span>Apuestas</span><span>Racha</span><span>Mejor premio</span><span>Fuerte en</span></div>
  ${rank.map((f, i) => `<div class="tr ${f.me ? 'me' : ''}"><span class="p">${i + 1}</span><span class="who2" data-prof="${f.id}" style="cursor:pointer">${av(f.id, 'xl')}${esc(f.n)}</span>
    <span class="big">${N(f.s)}</span>${net(f)}<span>${f.ac} <span class="dim">${f.acn}</span></span><span>${f.bets}</span>
    <span class="${f.racha.startsWith('▲') ? 'net up' : 'net'}">${f.racha}</span><span>${N(f.best)}</span><span class="dim">${f.fuerte}</span></div>`).join('')}</div>`;
function liga() {
  const rank = [...F].sort((a, b) => b.s - a.s), mx = Math.max(1, rank[0]?.s || 1), meI = rank.findIndex((f) => f.me);
  const open = ALL.filter((b) => b.st === 'open').reduce((a, b) => a + b.stake, 0), set = ALL.filter((b) => b.st === 'won' || b.st === 'lost'), won = set.filter((b) => b.st === 'won').length;
  const gapUp = meI > 0 ? rank[meI - 1].s - me().s : 0, gapDn = meI >= 0 && meI < rank.length - 1 ? me().s - rank[meI + 1].s : 0;
  const order = rank.length >= 3 ? [1, 0, 2] : rank.map((_, i) => i), nWeeks = Math.max(1, me().h.length - 1);
  return `<div class="lc">
    <header class="lc-h"><span class="lab">Temporada · desde el ${esc(SEASON ? fmt(SEASON + 'T12:00:00Z', { day: 'numeric', month: 'short' }) : '')} · ${F.length} jugadores</span><h2 class="wk"><small>SEMANA</small>${String(nWeeks).padStart(2, '0')}</h2>
      <p class="l-pay">Paga de <b>+${N(WEEKLY)}</b> a cada uno en ${CD(PAY)}</p></header>
    <div class="podium">${order.map((i) => { const f = rank[i]; return `<div class="pd ${f.me ? 'me' : ''}" data-prof="${f.id}" style="cursor:pointer">${av(f.id, 'xl')}<span class="nm">${esc(f.n)}</span><b class="num">${N(f.s)}</b>${net(f)}
      <span class="bar" style="height:${Math.max(6, Math.round((f.s / mx) * 180))}px;background:var(--f-${f.id})"></span><span class="ps">${i + 1}º</span></div>` }).join('')}</div>
    <p class="gap">${gapUp > 0 ? `Te faltan <b>${N(gapUp)}</b> para alcanzar a ${esc(rank[meI - 1].n)}` : 'Vas primero'}${gapDn > 0 ? ` · le sacas <b>${N(gapDn)}</b> a ${esc(rank[meI + 1].n)}` : ''}</p>
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
const msgRow = (c) => (!c.k
  ? `<div class="sys"><span class="dot"></span><span>${sysTxt(c.txt)}</span><time>${c.t}</time></div>`
  : `<div class="msg">${av(c.k)}<div style="min-width:0"><div class="hd"><span class="nm">${esc(fr(c.k).n)}</span><time>${c.t}</time></div>${c.txt ? `<p>${esc(c.txt)}</p>` : ''}${c.img ? `<img class="pic" src="${esc(c.img)}" alt="" loading="lazy">` : ''}</div></div>`);
let lastSeen = 0; try { lastSeen = +localStorage.getItem('apuestas-chat-visto') || 0 } catch {}
const unread = () => CHAT.filter((c) => c.id > lastSeen && c.k !== MEK).length;
function chat() {
  const live = M.filter((m) => m.live && whoOn(m.id).length)[0];
  const maxId = Math.max(0, ...CHAT.map((c) => c.id)); if (maxId > lastSeen) { lastSeen = maxId; try { localStorage.setItem('apuestas-chat-visto', maxId) } catch {} }
  return `<div class="c-wrap"><section class="c-main"><div class="chat"><div class="ch-list" data-chat>${CHAT.map(msgRow).join('') || '<p class="hint">Escribe el primero.</p>'}</div>
    <div class="ch-in"><button class="ic" data-act="img" aria-label="Mandar foto">${IC_IMG}</button><input type="text" id="msg" data-msg placeholder="Escribe a tus colegas" maxlength="500" autocomplete="off"><button class="send" data-act="send" aria-label="Enviar">${IC_SEND}</button><input type="file" id="pic" accept="image/*" data-file hidden></div></div></section>
    <aside class="c-side">
      ${live ? `<section><span class="lab">En juego ahora</span><div class="live-m" data-goto="${live.id}" style="cursor:pointer"><div>${logo(live, 'a')}${esc(live.a)}</div><b>${esc(live.score || '')}</b><div>${logo(live, 'b')}${esc(live.b)}</div></div></section>
      <section><span class="lab">Sus apuestas</span>${whoOn(live.id).map((x) => `<div class="ifr">${av(x.f)}<span class="nm">${esc(fr(x.f).n)}</span><span class="st rev">${x.p ? esc(pn(live, x.p)) + ' · ' : ''}${N(x.stake)}</span></div>`).join('')}</section>` : ''}
      <section><span class="lab">Fotos</span><div class="pics">${CHAT.filter((c) => c.img).slice(-12).reverse().map((c) => `<img src="${esc(c.img)}" alt="" loading="lazy">`).join('') || '<p class="hint">Aún no hay fotos.</p>'}</div></section>
    </aside></div>`;
}

/* ---------- Monedero ---------- */
function monedero() {
  const days = ['L', 'M', 'X', 'J', 'V', 'S', 'D'], di = Math.min(6, Math.max(0, Math.floor((NOW - WEEK0) / DAY)));
  let run = me().s; const rows = LEDGER.map(([t, c, d, a]) => { const after = run; run -= a; return `<div class="lg"><time>${t}</time><p>${esc(c)}${d && d !== c ? `<em>${esc(d)}</em>` : ''}</p><span class="a ${a > 0 ? 'up' : 'dn'}">${a > 0 ? '▲' : '▼'} ${N(Math.abs(a))}</span><span class="s">${N(after)}</span></div>` }).join('');
  const mine = ALL.filter((b) => b.k === MEK), open = mine.filter((b) => b.st === 'open'), won = mine.filter((b) => b.st === 'won').reduce((a, b) => a + b.pay, 0);
  return `<div class="pad">
    <div class="w-hero">${coin('big')}
      <div><span class="lab">Tu saldo</span><div class="w-bal">${N(me().s)}</div>
        <p class="w-pay">Paga del lunes <b>+${N(WEEKLY)}</b> · se acumula</p>
        <div class="w-cd" data-cdpay>${fmtPay(PAY)}</div>
        <div class="wk7">${days.map((d, i) => `<i class="${i <= di ? 'on' : ''}"></i>`).join('')}${days.map((d, i) => `<span class="${i === di ? 'on' : ''}">${d}</span>`).join('')}</div>
      </div></div>
    <div class="stats" style="margin-top:30px;grid-template-columns:repeat(4,minmax(0,1fr))">
      <div class="stt"><span class="lab">Repartido</span><b>${N(me().recibido)}</b><span>pagas de los lunes</span></div>
      <div class="stt"><span class="lab">Premios</span><b>${N(won)}</b><span>lo que te han pagado</span></div>
      <div class="stt"><span class="lab">En juego</span><b>${N(open.reduce((a, b) => a + b.stake, 0))}</b><span>${open.length} apuestas abiertas</span></div>
      <div class="stt ac"><span class="lab">Si aciertas todo</span><b>${N(me().s + open.reduce((a, b) => a + b.stake * b.o, 0))}</b><span>saldo posible</span></div>
    </div>
    <div class="w-cols">
      <section><div class="sec-h"><h2>Movimientos</h2><i>los últimos</i></div>
        <div class="lg h"><span>Cuándo</span><span>Qué</span><span>Importe</span><span>Saldo</span></div>${rows || '<p class="hint">Sin movimientos todavía.</p>'}</section>
      <section class="rules"><div class="sec-h"><h2>Reglas</h2></div><ul>
        <li><b>1</b>Cada lunes a las 00:00 entran ${N(WEEKLY)} a cada uno. No se compran ni se ganan de otra forma.</li>
        <li><b>2</b>Lo que no gastas se acumula para siempre.</li>
        <li><b>3</b>Solo se apuesta a quién gana: 1, X o 2. En Valorant y UFC no hay empate.</li>
        <li><b>4</b>Cierra al empezar el partido. ${VIS === 'open' ? 'Las elecciones de todos se ven siempre.' : 'Las elecciones de todos se ven al empezar.'}</li>
        <li><b>5</b>Los resultados llegan solos y se pagan al momento. Si un partido no se juega, se devuelve lo apostado.</li>
      </ul><p>Reglas fijas. Solo PM puede cambiarlas.</p></section>
    </div></div>`;
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
        <div class="pf-act">${window.Notification && Notification.permission !== 'granted' ? '<button data-act="notif">Activar avisos</button>' : window.Notification ? '<span class="pf-ok">Avisos activados</span>' : ''}<button class="q" data-act="pass">Cambiar contraseña</button><button class="q" data-act="logout">Cerrar sesión</button></div>` : ''}</div>
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
        ${['f', 'v', 'u'].map((k) => { const [w, t] = f.sp[k]; return `<div class="sb"><img src="${SP[k][1]}" alt=""><strong>${SP[k][0]}</strong><em>${w} de ${t} · ${t ? Math.round((w / t) * 100) : 0}%</em><span class="bar"><i style="width:${t ? (w / t) * 100 : 0}%"></i></span></div>` }).join('')}
        ${f.last ? `<div class="sb"><span></span><strong>Últimas ${f.last.length}</strong><em>${wins} de ${f.last.length}</em><span class="dots" style="grid-column:1/4">${[...f.last].map((c) => `<i class="${c === 'W' ? 'w' : 'l'}" style="--c:var(--f-${f.id})"></i>`).join('')}</span></div>` : ''}
      </section>
    </div>
    ${h2h.some(([, [a, b]]) => a + b > 0) ? `<section class="cs"><div class="cs-h"><div><h3>${mine ? 'Tus duelos' : 'Duelos'}</h3><p>Partidos en los que apostasteis a cosas distintas: quién acertó.</p></div></div>
      ${h2h.map(([o, [a, b]]) => `<div class="hh2"><span style="display:flex;align-items:center;gap:12px">${av(f.id, 'xl')}<strong style="font:600 15px var(--sans)">${esc(f.n)}</strong></span>
        <div class="sc">${a}<i>:</i>${b}<small>${a > b ? esc(f.n) + ' gana' : a < b ? esc(fr(o).n) + ' gana' : 'empate'} el cara a cara</small></div>
        <span style="display:flex;align-items:center;gap:12px;justify-self:end"><strong style="font:600 15px var(--sans)">${esc(fr(o).n)}</strong>${av(o, 'xl')}</span></div>`).join('')}</section>` : ''}
    ${f.favs.length ? `<section class="cs"><div class="cs-h"><div><h3>Sigue a</h3></div></div><div class="favs">${f.favs.map(([src, n, face]) => `<span class="fav">${img(src, face ? 'face' : '')}${esc(n)}</span>`).join('')}</div></section>` : ''}
    <section class="cs"><div class="cs-h"><div><h3>En juego</h3><p>${op.length} apuestas · toca una para ver el partido.</p></div></div>
      <div class="pf-bets">${op.map((b) => betCard(f, b)).join('') || '<p class="hint">Nada en juego ahora mismo.</p>'}</div></section>
    <section class="cs"><div class="cs-h"><div><h3>Logros</h3><p>${logrosDe(f).filter((l) => l[3]).length} de ${LOGROS.length}</p></div></div>
      <div class="logros">${logrosDe(f).map(([id, n, d, ok]) => `<div class="lg2 ${ok ? 'ok' : ''}" title="${esc(d)}">${MEDAL}<strong>${esc(n)}</strong><span>${esc(d)}</span></div>`).join('')}</div></section>
    <section class="cs"><div class="cs-h"><div><h3>Premios</h3></div></div>
      ${aw.length ? `<div class="pf-aw">${aw.map(([k, v, , d]) => `<div><span class="lab">${k}</span><b>${v}</b><span class="dd">${esc(d)}</span></div>`).join('')}</div>` : '<p class="hint">Aún sin premios esta temporada.</p>'}</section>
  </div>`;
}

/* ---------- motor ---------- */
const SCREENS = {
  partidos: ['Partidos', 'Fútbol, Valorant y UFC · solo 1 X 2 · cierra al empezar', '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'],
  apuestas: ['Mis apuestas', 'Lo que llevas en juego y todo lo que ya se ha pagado', '<path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4z"/><path d="M14.5 6.5v11" stroke-dasharray="1.5 2"/>'],
  colegas: ['Colegas', 'Lo que lleva cada uno en juego y cuánto falta', '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.2 19.5a5.8 5.8 0 0 1 11.6 0"/><circle cx="16.8" cy="9.6" r="2.6"/><path d="M15.4 14.4a4.6 4.6 0 0 1 5.6 4.5"/>'],
  liga: ['Liga', 'La temporada, semana a semana', '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4"/>'],
  chat: ['Chat', 'Fotos, mensajes y avisos', '<path d="M5 5h14a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 17h-8l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 5 5z"/>'],
  monedero: ['Monedero', 'Tu dinero, la paga del lunes y cada movimiento', '<path d="M4.5 8V7a2 2 0 0 1 2-2H17v3"/><rect x="4" y="8" width="16.5" height="11" rx="2.5"/><circle cx="16" cy="13.5" r="1.3"/>'],
};
const R = { partidos, apuestas, colegas, liga, chat, monedero, perfil };
const photoCss = () => { document.getElementById('phs').textContent = F.filter((f) => f.photo).map((f) => `.av.${f.id}.ph{background-image:url("${encodeURI(f.photo)}")}`).join('') };
function render() {
  if (!loaded) return;
  NOW = Date.now();
  const keep = {}; document.querySelectorAll('[data-keep]').forEach((e) => (keep[e.dataset.keep] = e.scrollTop));
  const un = S.scr === 'chat' ? 0 : unread();
  document.getElementById('nav').innerHTML = Object.entries(SCREENS).map(([k, [n, , ic]]) => `<button class="nv ${S.scr === k ? 'on' : ''}" data-scr="${k}"><svg viewBox="0 0 24 24">${ic}</svg><span class="nl">${n}</span><span class="ns">${n.replace('Mis apuestas', 'Apuestas')}</span>${k === 'chat' && un ? `<i>${un}</i>` : ''}</button>`).join('');
  const rank = [...F].sort((a, b) => b.s - a.s);
  document.getElementById('me').innerHTML = `${av(MEK, 'xl')}<b>${esc(me().n)}</b><em>${N(me().s)} · ${rank.indexOf(me()) + 1}º de ${F.length}</em>`;
  document.getElementById('me').dataset.prof = MEK;
  const [t, sub] = S.scr === 'perfil' ? ['Perfil', fr(S.prof).n + (fr(S.prof).apodo ? ' · ' + fr(S.prof).apodo : '')] : SCREENS[S.scr];
  document.getElementById('top').innerHTML = `<h1>${t}</h1><span class="sub">${esc(sub)}</span><span class="pay">+${N(WEEKLY)} el lunes · <b data-cdpay>${fmtPay(PAY)}</b></span><span class="bal"><span class="num">${N(lastBal ?? me().s)}</span>${coin()}</span>`;
  photoCss();
  const vw = document.getElementById('view'), cambia = vw.dataset.scr !== S.scr;
  vw.innerHTML = R[S.scr](); vw.dataset.scr = S.scr;
  if (cambia) { vw.classList.remove('entra'); void vw.offsetWidth; vw.classList.add('entra') }
  cuentaSaldo();
  if (S.scr === 'partidos') fillEspn();
  document.querySelectorAll('[data-keep]').forEach((e) => { if (keep[e.dataset.keep]) e.scrollTop = keep[e.dataset.keep] });
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
function toast(html) { const t = document.getElementById('toast'); t.innerHTML = html; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 2800) }
const errMsg = (e) => esc((e && (e.message || e.error_description)) || 'Algo ha fallado').replace(/^.*?: /, (x) => (x.length < 30 ? '' : x));
async function refresh() { try { await load(); render() } catch (e) { toast(errMsg(e)) } }
let busy = false;
async function placeBet() {
  const m = S.sel && byId(S.sel.m); if (!m || !isOpen(m) || busy) return;
  const st = stakeNow(); if (st < 1) return toast('Sin saldo: espera a la paga del lunes');
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
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-cancel],[data-calc],[data-retar],[data-rto],[data-rpick],[data-rstake],[data-accept],[data-decline],[data-retirar],[data-daily],[data-scr],[data-f],[data-lg],[data-pick],[data-stake],[data-act],[data-foc],[data-bf],[data-vis],[data-pf],[data-goto],[data-prof]'); if (!t || t.disabled) return;
  const d = t.dataset;
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
  else if (d.pick) { const [m, p] = d.pick.split('|'); S.sel = isSel(byId(m), p) ? null : { m, p }; if (S.foc !== m) { S.foc = m; S.sheet = true } }
  else if (d.stake) { S.stake = d.stake === 'all' ? me().s : +d.stake; return updStake() }
  else if (d.act === 'bet') return placeBet();
  else if (d.act === 'send') return sendMsg();
  else if (d.act === 'img') return document.getElementById('pic').click();
  else if (d.act === 'photo') return document.getElementById('foto').click();
  else if (d.act === 'nophoto') { const { error } = await db.rpc('update_profile', { p_photo: '' }); if (error) return toast(errMsg(error)); toast('Foto quitada'); return refresh() }
  else if (d.act === 'logout') { await db.auth.signOut(); return showLogin() }
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
  else if (d.foc) { if (S.foc !== d.foc) S.reto = null; S.foc = d.foc; S.sheet = true }
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
function showLogin() { document.getElementById('boot').hidden = true; document.getElementById('app').hidden = true; document.getElementById('login').hidden = false; setTimeout(() => document.getElementById('user').focus(), 50) }
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
let chan = null;
function live() {
  if (chan) return;
  let to; const soon = () => { clearTimeout(to); to = setTimeout(refresh, 700) };
  chan = db.channel('vivo').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pulse' }, soon).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat' }, soon).subscribe();
  // cuenta atras cada minuto y datos frescos cada 5, solo con la pantalla visible
  let ticks = 0;
  setInterval(() => { if (document.hidden) return; ticks++; if (ticks % 5 === 0) return refresh(); if (!document.activeElement?.matches('input')) render() }, 60000);
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
async function start() {
  if (!CFG.url) { document.getElementById('boot').innerHTML = '<p class="hint">Falta config.js</p>'; return }
  const { data: { session } } = await db.auth.getSession();
  if (!session) return showLogin();
  try { await load() } catch (e) { if (/JWT|session|entrar/i.test(e.message || '')) { await db.auth.signOut(); return showLogin() } toast(errMsg(e)); return }
  const h = location.hash.slice(1); if (R[h] && h !== 'perfil') S.scr = h;
  S.prof = MEK; showApp(); render(); live();
}
window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (R[h] && h !== 'perfil') { S.scr = h; render() } });
start();
