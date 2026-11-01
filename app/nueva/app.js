// Gambling Master: la app. Los datos viven en Supabase; aqui solo se pintan y se piden cosas.
// El dinero nunca se calcula aqui: apostar, pagar y cobrar lo hacen las funciones de la base (db/001_init.sql).
'use strict';
const CFG = window.APP_CONFIG || {};
const db = supabase.createClient(CFG.url, CFG.anon, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'apuestas-auth' } });
const TZ = 'Europe/Madrid', DAY = 864e5, DOMAIN = '@apuestas.app';
const TOP = new Set(['esp.1', 'eng.1', 'ger.1', 'ita.1', 'fra.1', 'uefa.champions', 'uefa.europa', 'esp.copa_del_rey']);
const SP = { f: ['Fútbol', '../img/futbol.svg'], v: ['Valorant', '../img/valorant.svg'], c: ['CS2', '../img/cs2.png'], u: ['UFC', '../img/ufc.png'],
  b: ['NBA', 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="29" fill="#f58426"/><g fill="none" stroke="#1d1309" stroke-width="3.4"><circle cx="32" cy="32" r="29"/><path d="M3 32h58M32 3v58M13 10c8 6 12 13 12 22s-4 16-12 22M51 10c-8 6-12 13-12 22s4 16 12 22"/></g></svg>')],
  r: ['Fórmula 1', 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="29" fill="#e10600"/><text x="32" y="41" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-style="italic" font-size="26" text-anchor="middle" fill="#fff">F1</text></svg>')] };   // NBA (nba.js, db/039) y F1 (f1.js, db/052)
const DEP = ['f', 'v', 'c', 'u', 'b', 'r'];
const KIND = { paga: 'Paga del lunes', apuesta: 'Apuesta', premio: 'Premio', devolucion: 'Devolución', ajuste: 'Ajuste', diario: 'Premio diario', rescate: 'Rescate', bote: 'Bote de la semana', tiempo: 'Tiempo en la app', trato: 'Trato entre amigos', mercado: 'Mercado', jackpot: 'Jackpot', pred_apuesta: 'Predicción rápida', pred_premio: 'Predicción acertada', pred_devol: 'Predicción devuelta', bote_gana: 'Bote ganado', caja: 'Caja de CS2', venta: 'Venta de skin', batalla: 'Batalla de cajas', ruleta_semana: 'Ruleta de premios', ruleta_global: 'Ruleta global', premio_semana: 'Premio de la semana', moneda: 'Cara o cruz', crash: 'Crash', ruleta: 'Ruleta', blackjack: 'Blackjack', plinko: 'Plinko', cashout: 'Cash out', pred_apuesta: 'Predicción rápida', pred_premio: 'Predicción acertada', pred_devol: 'Predicción devuelta' };
let TIEMPO = null, CLAIM = null, BOTE = null, REACT = new Map(), POLLS = new Map(), CAMPEON = null;

/* ---------- estado ---------- */
let NOW = Date.now(), PAY = 0, WEEK0 = 0;
let ME = null, MEK = 'pm', VIS = 'open', WEEKLY = 1000, SEASON = '';
let F = [], M = [], MI = new Map(), L = {}, ALL = [], LEDGER = [], CHAT = [], AW = [], H2H = {};
let CH = [], DAILY = [], DAILY_ON = false, DAILY_BONUS = 1.25;
let S = { side: null, scr: 'inicio', f: 'all', lg: 'top', sel: null, stake: 200, foc: null, sheet: false, bf: 'all', pf: 'pm', prof: 'pm', prev: 'colegas', calc: 0, reto: null, sure: null };
try { localStorage.removeItem('apuestas-calc') } catch {}
let loaded = false;

/* ---------- formato ---------- */
const N = (x) => { const v = Math.round(x || 0); return (v < 0 ? '−' : '') + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, document.documentElement.lang === 'en' ? ',' : '.') };
// 047: el bote cobra a todos y el saldo puede quedar por debajo de 0: en rojo
const NS = (x) => (Math.round(x || 0) < 0 ? `<span class="neg-s">${N(x)}</span>` : N(x));
const O = (x) => Number(x).toFixed(2).replace('.', document.documentElement.lang === 'en' ? '.' : ',');
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
  const [st, ms, ch, ex, wh, ti, rm] = await Promise.all([
    db.rpc('get_state'),
    db.from('matches').select(COLS).gte('starts_at', from).lte('starts_at', to).neq('status', 'canceled').order('starts_at').limit(3000),
    db.from('chat').select('*').order('id', { ascending: false }).limit(150),
    db.rpc('get_extras'),
    db.from('wheel_spins').select('player,week,prize,label,amount,created_at').order('id', { ascending: false }).limit(40),
    db.rpc('time_status'),
    db.rpc('get_retos').then((r) => r, () => ({ error: 1 })),   // db/053: quien esta dentro de cada reto (con 053 sin cargar da error y los retos son de 2 como antes)
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
  TIEMPO = ti.error ? null : ti.data || null;
  build(st.data, rows, (ch.data || []).reverse(), ex.error ? null : { ...ex.data, retos: rm && !rm.error && rm.data && typeof rm.data === 'object' ? rm.data : null });
  avisos();
}
const LIGAS_FUERA = new Set(['eng.fa', 'usa.1', 'uefa.europa.conf', 'ned.1', 'bra.1', 'mex.1', 'por.1']);
const LIGAS_FUERA_NOMBRE = /gamers ?club|betboom/i;                                   // PM, 01-11: fuera Gamers Club (CS2) y BetBoom (Valorant)
function build(st, rows, chat, ex) {
  window.BUILD_ARGS = [st, rows, chat, ex];   // ocultas.js: al ocultar o mostrar una liga se vuelve a construir con esto, sin pedir nada
  NOW = Date.now(); PAY = nextMonday(); WEEK0 = PAY - 7 * DAY;
  ME = st.me; VIS = st.vis; WEEKLY = st.weekly; SEASON = st.season_start;
  const key = new Map(st.players.map((p) => [p.id, p.color]));
  MEK = key.get(ME) || 'pm';
  // PM, 30-10: fuera la FA Cup, MLS, Conference, Eredivisie, Brasileirao, Liga MX y Liga Portugal (sync.mjs ya no las trae y
  // db/028 borra lo que habia); si quedara algun partido suyo con apuestas, se sigue viendo para que se pueda seguir
  const conBets = new Set((st.bets || []).map((b) => b.match));
  rows = rows.filter((r) => !(LIGAS_FUERA.has(r.league) || LIGAS_FUERA_NOMBRE.test(r.league_name || '')) || conBets.has(r.id));
  // ligas y juegos que cada jugador oculta (ocultas.js): no salen en Partidos, Inicio ni Directo, pero lo que ya tienes apostado
  // o retado sigue saliendo en Mis apuestas (esos partidos se quedan en MI y en L, fuera de M)
  const oc = window.GM_OCULTAS ? GM_OCULTAS.parte(rows, { bets: st.bets, ch: ex?.challenges, retos: ex?.retos, me: ME }) : { vis: rows, ocu: [] };
  rows = oc.vis;
  const mkM = (r) => ({
    id: r.id, s: r.sport, lg: r.league, a: r.home, b: r.away, la: r.home_logo, lb: r.away_logo, at: r.starts_at,
    o: [r.odds_1, r.odds_x, r.odds_2].map((x) => (x == null ? null : Number(x))), status: r.status, live: r.status === 'live' && r.sport !== 'r', fk: r.details?.kind || null,
    score: r.score, winner: r.winner, tag: r.tag, venue: r.venue, stage: r.stage, bo: r.bo, tape: r.details?.tape || [], src: r.odds_src,
    tv: r.details?.tv || [], espn: r.details?.espn || null, players: r.details?.players || null, recent: r.details?.recent || null, tier: r.details?.tier || null, tid: r.details?.ids || null, games: r.details?.games || null, tour: r.details?.bracket ? `${r.details.game}:${r.details.tour}` : null,
  });
  M = rows.map(mkM);
  MI = new Map(M.concat(oc.ocu.map(mkM)).map((m) => [m.id, m]));
  // logos de liga de ESPN a 128 px (se pintan a 40 y en pantallas de doble densidad se veian borrosos a 64)
  L = {}; for (const r of rows.concat(oc.ocu)) if (!L[r.league]) L[r.league] = [r.league_name, (r.league_logo || '').replace(/([?&])w=64&h=64/, '$1w=128&h=128') || (r.sport === 'c' || r.sport === 'v' ? lgSigla(r.league_name, r.sport) : SP[r.sport][1]), r.sport];
  // cash out (db/024): una apuesta retirada cuenta como resuelta; con beneficio es 'won' (cobra pay), con perdida es 'lost' (pierde stake - pay). cash = true
  ALL = st.bets.map((b) => { const c = b.status === 'cashout', w = c && b.payout > b.stake; return { id: b.id, k: key.get(b.player), m: b.match, p: b.pick, stake: b.stake, o: w ? b.payout / b.stake : Number(b.odds), st: c ? (w ? 'won' : 'lost') : b.status, pay: b.payout, at: b.created, set: b.settled, cash: c } });
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
    if (a.k === b.k || a.p === b.p || !H2H[a.k]?.[b.k] || (window.GM_MK && GM_MK.grupo(a.p) !== GM_MK.grupo(b.p))) continue;   // duelo: solo dentro del mismo mercado
    if (a.st === 'won') H2H[a.k][b.k][0]++; else if (b.st === 'won') H2H[a.k][b.k][1]++;
  }
  // premios de la temporada
  AW = [];
  const won = ALL.filter((b) => b.st === 'won'), lost = ALL.filter((b) => b.st === 'lost');
  const nm = (b) => { const m = MI.get(b.m); return m ? pn(m, b.p) : '' };
  if (won.length) { const b = won.reduce((a, c) => (c.pay > a.pay ? c : a)); AW.push(['Mayor premio', N(b.pay) + coin(), b.k, `${nm(b)} ${O(b.o)} · ${N(b.stake)} apostados`]) }
  if (won.length) { const b = won.reduce((a, c) => (c.o > a.o ? c : a)); AW.push(['Cuota más alta acertada', O(b.o), b.k, `${nm(b)} · ${N(b.stake)} a ${N(b.pay)}`]) }
  const wkBest = F.flatMap((f) => f.wk.map((v, i) => [v, f.id, i])).sort((a, b) => b[0] - a[0])[0];
  if (wkBest && wkBest[0] > 0) AW.push(['Mejor semana', '▲ ' + N(wkBest[0]) + coin(), wkBest[1], 'Semana ' + (wkBest[2] + 1)]);
  if (lost.length) { const b = lost.reduce((a, c) => (perd(c) > perd(a) ? c : a)); AW.push(['Peor golpe', '▼ ' + N(perd(b)) + coin(), b.k, nm(b)]) }
  const most = [...F].sort((a, b) => b.bets - a.bets)[0]; if (most?.bets) AW.push(['Más apuestas', String(most.bets), most.id, 'esta temporada']);
  const st2 = [...F].sort((a, b) => b.streak - a.streak)[0]; if (st2?.streak >= 2) AW.push(['Mejor racha', String(st2.streak), st2.id, 'ganadas seguidas']);
  if (!F.some((f) => f.id === S.pf)) S.pf = MEK;
  const uk = new Map(st.players.map((p) => [p.id, p.color]));
  // retos con mas gente (db/053): pl = quien esta dentro y con que lado, en el orden de la base (quien reta, quien acepta, los demas); win = lado ganador
  const RM = ex?.retos || {};
  CH = (ex?.challenges || []).map((c) => {
    const o = { id: c.id, m: c.match, from: uk.get(c.from), to: uk.get(c.to), ab: c.to == null, fp: c.from_pick, tp: c.to_pick, stake: c.stake, st: c.status, at: c.created, set: c.settled };
    const r = RM[c.id];
    o.pl = r && Array.isArray(r.e) ? r.e.map(([u, p]) => ({ k: uk.get(u), p })).filter((x) => x.k) : [{ k: o.from, p: o.fp }].concat(o.to && o.tp ? [{ k: o.to, p: o.tp }] : []);
    o.win = r ? r.w || null : c.status === 'won_from' ? c.from_pick : c.status === 'won_to' ? c.to_pick : null;
    return o;
  });
  DAILY = ex?.daily || []; DAILY_ON = !!ex?.daily_on; DAILY_BONUS = Number(ex?.daily_bonus) || 1.25;
  // primera tanda de ideas (db/009): premio diario, rescate, bote, reacciones, encuestas
  CLAIM = ex?.claim || null; BOTE = ex?.bote || null;
  REACT = new Map(); for (const r of ex?.reactions || []) { const k = uk.get(r.p); if (!k) continue; const t = REACT.get(r.t) || {}; (t[r.e] = t[r.e] || []).push(k); REACT.set(r.t, t) }
  POLLS = new Map((ex?.polls || []).map((q) => [q.id, { q: q.q, o: q.o || [], v: Object.fromEntries(Object.entries(q.v || {}).map(([u, o]) => [uk.get(u), o]).filter(([k]) => k)) }]));
  const reg = ex?.regalos || {}; for (const f of F) f.recibido += reg[f.uid] || 0;
  // campeon del mes pasado: el que mas gano con sus apuestas resueltas ese mes; lleva corona todo el mes
  { const d = new Date(NOW), ini = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1), fin = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1), tot = {};
    for (const b of ALL) { const t = Date.parse(b.set || ''); if (!(t >= ini && t < fin) || (b.st !== 'won' && b.st !== 'lost')) continue; tot[b.k] = (tot[b.k] || 0) + (b.st === 'won' ? b.pay - b.stake : -perd(b)) }
    const best = Object.entries(tot).sort((a, b) => b[1] - a[1])[0]; CAMPEON = best && best[1] > 0 ? { k: best[0], mes: fmt(ini, { month: 'long' }), v: best[1] } : null }
  for (const m of M) { const o = ODDS0[m.id]; m.mv = o && m.status === 'scheduled' ? m.o.map((x, i) => (x && o[i] ? Math.sign(x - o[i]) : 0)) : [0, 0, 0] }
  loaded = true;
}

/* ---------- utilidades de pintado ---------- */
// PM, 30-10: "que puedan seguir lo que quieran: poner en favoritos sus equipos, sus partidos o jugadores para que les notifique".
// Van en players.favs (update_profile p_favs, db/001): { k: 'eq:f:Real Madrid' o 'pa:<id>', n, img, s, face }
const favK = (s, n) => `eq:${s}:${n}`;
const misFavs = () => ((F.find((f) => f.me) || {}).favs || []).filter((x) => x && !Array.isArray(x) && x.k);
const esFav = (k) => misFavs().some((x) => x.k === k);
const sigo = (m) => esFav('pa:' + m.id) || esFav(favK(m.s, m.a)) || esFav(favK(m.s, m.b));
const IC_FAV = '<svg viewBox="0 0 24 24"><path d="M12 3.6l2.5 5.3 5.8.7-4.3 4 1.1 5.7L12 16.5l-5.1 2.8 1.1-5.7-4.3-4 5.8-.7z"/></svg>';
const favEq = (m, side) => ({ k: favK(m.s, side === 'a' ? m.a : m.b), n: side === 'a' ? m.a : m.b, img: (side === 'a' ? m.la : m.lb) || null, s: m.s, face: m.s === 'u' || undefined });
const favPa = (m) => ({ k: 'pa:' + m.id, n: `${m.a} vs ${m.b}`, s: m.s, at: m.at });
const favBtn = (o, txt) => { const on = esFav(o.k); return `<button class="fav-b ${on ? 'on' : ''}" data-fav="${esc(JSON.stringify(o))}" aria-pressed="${on}">${IC_FAV}<span>${on ? 'Siguiendo' : txt || 'Seguir'}</span></button>` };
// PM, 30-10: "los torneos de CS2: que en Matches salga el logo de la liga, no el de CS2". Si PandaScore no da logo de la liga,
// en vez del icono del juego sale una placa con sus siglas (IEM, SR...); el icono del juego va pequeno al lado
const lgSigla = (n, sp) => { const ws = String(n || '?').replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  const t = (/^[A-Z0-9]{2,5}$/.test(ws[0] || '') ? ws[0] : ws.filter((w) => /^[\p{Lu}\p{N}]/u.test(w)).slice(0, 3).map((w) => w[0]).join('') || (ws[0] || '?').slice(0, 2)).toUpperCase().slice(0, 4);
  const c = sp === 'v' ? '#ff4655' : '#f5a524', f = t.length > 3 ? 19 : t.length > 2 ? 23 : 28;
  return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="3" y="3" width="58" height="58" rx="16" fill="#2a2f3a" stroke="${c}" stroke-width="3"/><text x="32" y="33" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="${f}" fill="#f4f2ec" text-anchor="middle" dominant-baseline="central">${t.replace(/[<&>]/g, '')}</text></svg>`) };
const me = () => F.find((f) => f.me) || F[0];
const fr = (k) => F.find((f) => f.id === k) || { id: k, n: '·', ini: '·', apodo: '', frase: '', favs: [], h: [0], wk: [], sp: { f: [0, 0], v: [0, 0], u: [0, 0] }, share: {}, last: '' };
const byId = (id) => MI.get(id);
const pn = (m, p) => (p === '1' ? m.a : p === 'X' ? 'Empate' : p === '2' ? m.b : window.GM_MK ? GM_MK.nombre(m, p) : '?');   // mercados nuevos: mercados.js (db/036)
const PI = { 1: 0, X: 1, 2: 2 };
const po = (m, p) => (p in PI ? m.o[PI[p]] : window.GM_MK ? GM_MK.cuota(m, p) : null);
const isOpen = (m) => m.status === 'scheduled' && Date.parse(m.at) > NOW;
const picksOf = (m) => (m.o[1] == null ? ['1', '2'] : ['1', 'X', '2']);
const isSel = (m, p) => S.sel && S.sel.m === m.id && S.sel.p === p;
const isMine = (m, p) => ALL.some((b) => b.k === MEK && b.m === m.id && b.p === p && b.st === 'open');
const openOf = (k) => ALL.filter((b) => b.k === k && b.st === 'open' && byId(b.m)).sort((a, b) => Date.parse(byId(a.m).at) - Date.parse(byId(b.m).at));
const doneOf = (k) => ALL.filter((b) => b.k === k && b.st !== 'open' && byId(b.m)).sort((a, b) => Date.parse(b.set) - Date.parse(a.set)).slice(0, 3)
  .map((b) => { const m = byId(b.m); return [pn(m, b.p), b.o, b.stake, b.st, b.pay, `${m.a} ${m.score || ''} ${m.b} · ${when(b.set)}`] });
const whoOn = (mid) => ALL.filter((b) => b.m === mid && b.st === 'open').map((b) => ({ f: b.k, ...b }));
const short = (m) => (m.s === 'u' ? m.a.split(' ').pop().slice(0, 3) + '·' + m.b.split(' ').pop().slice(0, 3) : m.a.slice(0, 3) + '·' + m.b.slice(0, 3)).toUpperCase();
const en = () => !!(window.GM_LANG && GM_LANG.get() === 'en');
const coin = (cls = '') => `<span class="cn ${cls}"></span>`;
const LOCK = '<svg class="lock" viewBox="0 0 12 12"><rect x="2" y="5.5" width="8" height="5.5" rx="1.2"/><path d="M4 5.5V4a2 2 0 0 1 4 0v1.5"/></svg>';
const av = (k, cls = '') => { const f = fr(k); return `<span class="av ${k} ${cls} ${f.photo ? 'ph' : ''} ${window.GM_RATIO && GM_RATIO.top1() === k ? 'rey' : ''}" data-prof="${k}" title="Perfil de ${esc(f.n)}">${esc(f.ini)}</span>` };
const net = (f) => { const d = f.s - f.recibido; return `<span class="net ${d >= 0 ? 'up' : ''}">${d >= 0 ? '▲' : '▼'} ${N(Math.abs(d))}${coin()}</span>` };
const img = (src, cls = '') => (src ? `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : `<span class="noimg ${cls}"></span>`);
const logo = (m, side) => img(side === 'a' ? m.la : m.lb, m.s === 'u' ? 'face' : 'tl');
const form = (s) => `<span class="fm">${[...s].map((c) => `<b class="${c === 'G' ? 'g' : c === 'E' ? 'e' : ''}">${c}</b>`).join('')}</span>`;
const board = () => M.filter((m) => (m.status === 'scheduled' || m.live || (m.s === 'r' && m.status === 'live')) && (m.live || Date.parse(m.at) > NOW - (m.s === 'r' ? 8 : 4) * 3600e3) && Date.parse(m.at) < NOW + (m.s === 'u' ? 72 : m.s === 'r' ? 120 : 8) * DAY);
const inLeague = (m) => S.lg === 'fav' ? sigo(m) : S.lg === 'all' ? true : S.lg === 'top' ? m.live || m.s === 'v' || m.s === 'b' || (m.s === 'r' && (S.f === 'r' || ['race', 'quali', 'sprint'].includes(m.fk))) || (m.s === 'c' ? 'sa'.includes(m.tier || 'x') : m.s === 'u' ? !!m.tag : TOP.has(m.lg)) || whoOn(m.id).length > 0 : m.lg === S.lg;
const filtered = () => board().filter((m) => (S.f === 'all' || m.s === S.f) && inLeague(m)).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
const groups = (list) => { const g = new Map(); for (const m of list) { const k = DK(m.at); if (!g.has(k)) g.set(k, []); g.get(k).push(m) } return [...g.values()].map((ms) => (window.GM_QUIEN ? GM_QUIEN.dia(ms) : ms)) };
const dayLab = (t) => (today(t) ? `HOY · ${WD(t)}` : `${WD(t)} · ${MO(t)}`);
const stakeNow = () => Math.max(0, Math.min(S.stake, me().s));
const chips = () => [50, 100, 250, 500, 'all'].map((v) => { const on = v === 'all' ? S.stake >= me().s : S.stake === v; return `<button class="chip ${on ? 'on' : ''}" data-stake="${v}">${v === 'all' ? 'Todo' : N(v)}</button>` }).join('');
const filt = () => { const b = board().filter(inLeague), cnt = (k) => b.filter((m) => k === 'all' || m.s === k).length;
  return [['all', 'Todo', null], ...DEP.filter((k) => !(window.GM_OCULTAS && GM_OCULTAS.depOculto(k))).map((k) => [k, ...SP[k]])].map(([k, n, im]) => `<button class="f ${S.f === k ? 'on' : ''}" data-f="${k}">${im ? `<img src="${im}" alt="">` : ''}${n}<i>${cnt(k)}</i></button>`).join('') };
const IC_TOP = '<svg viewBox="0 0 24 24"><path d="M12 3.2l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.5l6-.8z"/></svg>';
const IC_ALL = '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2"/></svg>';
// PM, 30-10: "los menus de champions league, europa... no me gusta nada": una fila de escudos, el elegido con su nombre encendido
// PM, 01-11: "la liga de Argentina no esta en la misma linea": cada deporte junto (en el orden de DEP), y dentro las principales primero
const leagues = () => { const c = {}, dep = {}; for (const m of board()) if (S.f === 'all' || m.s === S.f) { c[m.lg] = (c[m.lg] || 0) + 1; dep[m.lg] = m.s }
  const od = (k) => { const i = DEP.indexOf(dep[k]); return i < 0 ? 99 : i };
  const ks = Object.keys(c).sort((a, b) => (od(a) - od(b)) || (TOP.has(b) - TOP.has(a)) || c[b] - c[a]);
  const it = (k, n, ico, cnt) => `<button class="lgc ${S.lg === k ? 'on' : ''}" data-lg="${esc(k)}" title="${esc(n)}${cnt != null ? ' · ' + cnt : ''}"><span class="lgc-i">${ico}${cnt != null ? `<i>${cnt}</i>` : ''}</span><span class="lgc-n">${esc(n)}</span></button>`;
  return `<div class="lgw"><button class="lga l" data-lga="-1" aria-label="Anteriores" hidden><svg viewBox="0 0 24 24"><path d="M14.5 6l-6 6 6 6"/></svg></button><button class="lga r" data-lga="1" aria-label="Más ligas" hidden><svg viewBox="0 0 24 24"><path d="M9.5 6l6 6-6 6"/></svg></button><nav class="lgs2" data-lgs>${it('top', 'Principales', IC_TOP, null)}${misFavs().length ? it('fav', 'Siguiendo', IC_FAV, board().filter((m) => (S.f === 'all' || m.s === S.f) && sigo(m)).length) : ''}${it('all', 'Todas', IC_ALL, null)}${ks.map((k) => it(k, L[k]?.[0] || k, `<img class="tl" src="${esc(L[k]?.[1])}" alt="" loading="lazy">`, c[k])).join('')}</nav></div>` };
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
// PM, 30-10 noche: "pon lo de cancelar apuesta y que se vea tambien visualmente el boton": antes era un texto gris pequeño.
// Se puede mientras el partido no empiece (cancel_bet, db/003) y devuelve lo apostado entero; el segundo toque confirma.
const IC_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>';
const cancelBtn = (b) => (canCancel(b) ? `<button class="x-cancel ${S.sure === 'b' + b.id ? 'sure' : ''}" data-cancel="${b.id}">${IC_X}${S.sure === 'b' + b.id ? `¿Seguro? Te devuelvo ${N(b.stake)}` : 'Cancelar apuesta'}</button>` : '');
const STAR = '<svg class="star" viewBox="0 0 24 24"><path d="M12 3.2l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.5l6-.8z"/></svg>';
const dailyTag = (m) => (isDaily(m) ? `<span class="dly" title="Apuesta del día${DAILY_ON ? ': se cobra ×' + O(DAILY_BONUS) : ''}">${STAR}${DAILY_ON ? '×' + O(DAILY_BONUS) : ''}</span>` : '');
const calcChips = () => `<span class="calc"><span class="lab">Cobro con</span>${[0, 100, 250, 500, 1000].map((v) => `<button class="chip ${S.calc === v ? 'on' : ''}" data-calc="${v}">${v ? N(v) : 'nada'}</button>`).join('')}</span>`;
const oddBtn = (m, p, open) => { const o = po(m, p); if (o == null) return '<span class="o na">·</span>'; const mv = m.mv?.[PI[p]] || 0;
  return `<button class="o ${isSel(m, p) ? 'on' : ''} ${isMine(m, p) ? 'mine' : ''}" data-pick="${m.id}|${p}" ${open ? '' : 'disabled'}>${mv ? `<i class="mv ${mv > 0 ? 'up' : 'dn'}">${mv > 0 ? '▲' : '▼'}</i>` : ''}${O(o)}${S.calc && open ? `<small>${N(S.calc * o)}</small>` : ''}</button>` };

/* datos en directo de ESPN (posesion, tiros, ultimos 5, clasificacion, canales). Se piden desde la app, solo para el partido abierto */
const ESPN = new Map();
const ESPN_HTML = new Map();   // lo ultimo pintado en el cuadro de ESPN de cada partido: al repintar la ficha (p. ej. al pulsar Retar) no se vacia a "Cargando" y no salta lo de debajo
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
  // ficha pro (fichapro.js): alineaciones en el campo, forma, cara a cara y clasificacion con bandas; si no carga, queda lo de abajo
  const fp = window.GM_FP && (m.s === 'f' || m.s === 'b') ? GM_FP.html(m, d) : '';
  if (fp) h += fp;
  // alineaciones (ESPN las publica cerca del partido)
  const ro = fp ? [] : (d?.rosters || []).filter((r) => (r.roster || []).some((x) => x.starter));
  if (ro.length === 2) {
    const col = (r) => { const xi = r.roster.filter((x) => x.starter); return `<div class="xi"><span class="lab">${esc(r.team?.displayName || '')}${r.formation ? ' · ' + esc(r.formation) : ''}</span>${xi.map((x) => `<span class="xp"><b>${esc(x.jersey || '')}</b>${esc(x.athlete?.displayName || '')}<i>${esc(x.position?.abbreviation || '')}</i></span>`).join('')}</div>` };
    h += `<div class="alin"><span class="lab">Alineaciones</span><div class="alin2">${col(ro[0])}${col(ro[1])}</div></div>`;
  } else if (!fp && !m.live && m.s === 'f') h += `<p class="hint">Las alineaciones salen cuando los equipos las dan, sobre una hora antes.</p>`;
  // ultimos 5 de cada uno
  const l5 = fp ? null : d?.lastFiveGames;
  if (Array.isArray(l5) && l5.length) {
    h += `<div class="l5"><span class="lab">Últimos 5</span>${l5.slice(0, 2).map((t) => `<div class="l5r"><span class="nm">${esc(t.team?.displayName || '')}</span><span class="fm">${(t.events || []).slice(0, 5).map((e) => { const r = (e.gameResult || '').toUpperCase(); const c = r === 'W' ? 'g' : r === 'D' ? 'e' : ''; return `<b class="${c}" title="${esc((e.atVs || '') + ' ' + (e.opponent?.displayName || '') + ' ' + (e.score || ''))}">${r === 'W' ? 'G' : r === 'D' ? 'E' : r === 'L' ? 'P' : '·'}</b>` }).join('')}</span></div>`).join('')}</div>`;
  }
  // clasificacion: las filas de los dos equipos y las de arriba
  const ent = fp ? null : d?.standings?.groups?.[0]?.standings?.entries;
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
  // PM 01-11: solo español e inglés; los demas idiomas solo salen si no hay ninguna emision en esos dos
  const otros = tv.some((v) => ['en', 'es'].includes(v.l)) ? [] : tv.filter((v) => !['en', 'es'].includes(v.l));
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
  const html = d ? espnHtml(m, d) : tvHtml(m.tv || [], m); ESPN_HTML.set(m.id, html);
  if (now.innerHTML !== html) now.innerHTML = html;
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
      const y = sc?.season?.year, prev = y ? await fetch(base + '/schedule?season=' + (y - 1)).then((r) => r.json()).catch(() => null) : null;
      if (prev?.events?.length) sc.events = [...(sc.events || []), ...prev.events.filter((e) => !(sc.events || []).some((x) => x.id === e.id))];
      d = { sc, ro, base };
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
// PM, 30-10: "que se vean todos los games de cada equipo por temporadas; por defecto solo los ultimos 5 o 6 pero que se pueda
// expandir, y un popout con toda la info del equipo, fichajes, etc." Lo que no da ninguna fuente gratis no se ensena
const SH_POR = 6;
const shMas = (n) => (n > SH_POR ? `<button class="sh-mas" data-act="sh-todos">${S.shTodos ? 'Ver menos' : `Ver todos · ${n}`}</button>` : '');
const shInfoBtn = (t) => `<button class="sh-info" data-act="sh-info"><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg>${t}</button>`;
const shPorGrupo = (xs, clave, fila) => { const g = new Map(); for (const x of xs) { const k = clave(x) || 'Otros'; if (!g.has(k)) g.set(k, []); g.get(k).push(x) }
  return [...g.entries()].map(([k, l]) => `<div class="shs"><span class="lab">${esc(k)} · ${l.length}</span>${l.map(fila).join('')}</div>`).join('') };
/* ---------- Todo sobre el equipo (PM, 30-10: "que este bien hecho, esta terrible; los partidos tienen demasiado espacio";
   "registros de victorias de torneos, earnings; que no se tenga que hacer scroll tanto, pon paginas, y varias categorias";
   "que se pueda dar clic a los equipos con los que han jugado para ver tambien sus perfiles").
   Panel con pestanas (Resumen, Partidos, Plantilla, Clasificacion, Palmares, Ganancias); las que no tienen datos no salen.
   Cada equipo es una descripcion { s, n, logo, league+id (ESPN), tid (PandaScore), id (luchador) }; los rivales abren su panel
   y Volver regresa al anterior. Palmares y ganancias: de vlr.gg (Valorant) y del campo nuevo de la tabla teams cuando exista */
const EQD = new Map();
let VLR_TEAMS = null;
const normEq = (t) => { const b = String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''), x = b.replace(/\b(esports?|gaming|team|club)\b/g, '').replace(/[^a-z0-9]/g, '');
  return x.length >= 3 ? x : b.replace(/[^a-z0-9]/g, '') };
const eqKey = (e) => `${e.s}:${e.id || e.tid || normEq(e.n)}`;
const EQ_POR = 8, EQ_CARAS = 18;
const eqDeMatch = (m, side) => ({ s: m.s, n: side === 'a' ? m.a : m.b, logo: (side === 'a' ? m.la : m.lb) || null, league: m.espn?.league || null, id: m.s === 'f' || m.s === 'u' ? m.espn?.ids?.[side] || null : null, tid: m.tid?.[side] || null, lg: m.lg });
const getJ = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
async function eqCarga(e) {
  const k = eqKey(e), c = EQD.get(k); if (c && Date.now() - c.t < 6e5) return c.d;
  const d = { s: e.s };
  try {
    if (e.s === 'f' && e.id && e.league) {
      const base = `https://site.api.espn.com/apis/site/v2/sports/soccer/${e.league}/teams/${e.id}`;
      const [sc, ro, tab] = await Promise.all([getJ(base + '/schedule'), getJ(base + '/roster'), getJ(`https://site.api.espn.com/apis/v2/sports/soccer/${e.league}/standings`)]);
      const y = sc?.season?.year, prev = y ? await getJ(base + '/schedule?season=' + (y - 1)) : null;
      if (sc && prev?.events?.length) sc.events = [...(sc.events || []), ...prev.events.filter((x) => !(sc.events || []).some((z) => z.id === x.id))];
      Object.assign(d, { sc, ro, tab });
      d.x = await db.from('teams').select('extra').eq('id', `f:${e.id}`).maybeSingle().then((r) => r.data?.extra || null, () => null);
    } else if ((e.s === 'v' || e.s === 'c') && (e.tid || e.n)) {
      const juego = e.s === 'v' ? 'valorant' : 'csgo';
      if (e.tid) { let r = await db.from('teams').select('data,extra,pj').eq('id', `${juego}:${e.tid}`).maybeSingle(); if (r.error) r = await db.from('teams').select('data,extra').eq('id', `${juego}:${e.tid}`).maybeSingle(); const data = r.data; d.t = data?.data || null; d.x = data?.extra || null; d.pj = data?.pj || null }
      if (e.s === 'v') {
        if (!VLR_TEAMS) VLR_TEAMS = await getJ('https://vlr.orlandomm.net/api/v1/teams?limit=all&region=all').then((x) => x?.data || []);
        const nm = normEq(e.n), t = VLR_TEAMS.find((x) => normEq(x.name) === nm) || VLR_TEAMS.find((x) => nm.length > 2 && normEq(x.name).length > 2 && (normEq(x.name).includes(nm) || nm.includes(normEq(x.name))));
        if (t) d.vlr = await getJ(`https://vlr.orlandomm.net/api/v1/teams/${t.id}`).then((x) => x?.data || null);
      }
    } else if (e.s === 'u' && e.id) d.at = await getJ(`https://site.web.api.espn.com/apis/common/v3/sports/mma/ufc/athletes/${e.id}`);
  } catch {}
  EQD.set(k, { t: Date.now(), d }); return d;
}
// todo a un mismo formato: partidos jugados y proximos, jugadores, clasificacion, palmares y ganancias
function eqNorm(e, d) {
  const o = { jug: [], prox: [], gente: [], tabla: null, palm: [], gan: null, kpi: [] };
  if (e.s === 'f') {
    const id = String(e.id), ev = d.sc?.events || [];
    for (const x of ev) { const c = x.competitions?.[0] || {}, yo = (c.competitors || []).find((z) => String(z.team?.id) === id), el = (c.competitors || []).find((z) => String(z.team?.id) !== id); if (!el) continue;
      const sc = (z) => z?.score?.displayValue ?? z?.score ?? '', hecho = c.status?.type?.completed;
      const fila = { at: Date.parse(x.date), riv: { s: 'f', n: el.team?.displayName || '', logo: el.team?.logos?.[0]?.href || el.team?.logo || null, league: e.league, id: el.team?.id }, casa: yo?.homeAway === 'home', torneo: x.league?.name || '', grupo: x.season?.displayName || '' };
      if (hecho) o.jug.push({ ...fila, r: yo?.winner ? 'W' : el?.winner ? 'L' : 'D', marca: `${sc(yo)}:${sc(el)}` }); else o.prox.push(fila) }
    o.gente = (d.ro?.athletes || []).map((a) => ({ img: a.headshot?.href || null, n: a.displayName, pais: a.citizenship || a.flag?.alt || '', bandera: a.flag?.href || '', rol: a.position?.displayName || a.position?.abbreviation || '', num: a.jersey || '', edad: a.age || '' }));
    const coach = (d.ro?.coach || []).length === 1 ? d.ro.coach[0] : null;
    if (coach) o.gente.unshift({ n: `${coach.firstName || ''} ${coach.lastName || ''}`.trim(), rol: 'Entrenador', staff: true });
    const ents = (d.tab?.children || [d.tab]).flatMap((c) => c?.standings?.entries || []);
    if (ents.length) { const v = (x, k) => (x.stats || []).find((z) => z.name === k)?.value; o.tabla = ents.map((x) => ({ id: String(x.team?.id), n: x.team?.displayName || '', logo: x.team?.logos?.[0]?.href || null, pj: v(x, 'gamesPlayed'), pts: v(x, 'points'), dg: v(x, 'pointDifferential'), rank: v(x, 'rank') }))
      .sort((a, b) => (a.rank || 99) - (b.rank || 99)); const yo = o.tabla.find((x) => x.id === id);
      if (yo) { const st = Object.fromEntries((ents.find((x) => String(x.team?.id) === id)?.stats || []).map((z) => [z.name, z.value])); o.kpi = [['Puesto', yo.rank ? yo.rank + 'º' : null], ['Puntos', st.points], ['G · E · P', st.wins != null ? `${st.wins} · ${st.ties} · ${st.losses}` : null], ['Goles', st.pointsFor != null ? `${st.pointsFor} : ${st.pointsAgainst}` : null]] } }
  } else if (e.s === 'v' || e.s === 'c') {
    const t = d.t || {}, v = d.vlr;
    for (const x of t.hist || []) o.jug.push({ at: Date.parse(x.at || '') || 0, riv: { s: e.s, n: x.vs, logo: x.logo || null, tid: x.vsId || null }, torneo: corto(x.t || ''), grupo: corto(x.t || '') || 'Otros', r: x.won ? 'W' : 'L', marca: x.score || '' });
    if (!o.jug.length && v?.results?.length) for (const x of v.results) { const [p, q] = x.teams || []; if (!p || !q) continue; const yo = normEq(p.name) === normEq(e.n) ? p : q, el = yo === p ? q : p;
      o.jug.push({ at: Date.parse(x.utc) || 0, riv: { s: e.s, n: el.name, logo: el.logo || null }, torneo: x.event?.name || '', grupo: x.event?.name || 'Otros', r: +yo.points > +el.points ? 'W' : 'L', marca: `${yo.points}:${el.points}` }) }
    for (const x of board().filter((z) => z.s === e.s && (z.a === e.n || z.b === e.n))) { const s2 = x.a === e.n ? 'b' : 'a'; o.prox.push({ at: Date.parse(x.at), riv: eqDeMatch(x, s2), torneo: corto(L[x.lg]?.[0] || ''), live: x.live }) }
    const ext = (x) => ({ rol: x.rol || x.role || x.tag || '', gan: x.ganancias ?? x.earnings ?? null });
    o.gente = v?.players?.length ? [...v.players.map((x) => ({ img: x.img, n: x.user, nombre: x.name, pais: (x.country || '').toUpperCase(), ...ext(x) })), ...(v.staff || []).map((x) => ({ img: x.img, n: x.user, nombre: x.name, pais: (x.country || '').toUpperCase(), rol: x.tag || 'staff', staff: true }))]
      : (t.players || []).map((x) => ({ img: x.img, n: x.n, nombre: x.nombre, pais: x.nat || x.pais || '', edad: x.age || '', ...ext(x) }));
    // palmares: el campo nuevo de teams (cuando exista) o los torneos de vlr.gg con su puesto
    const pal = t.palmares || t.honours || t.trophies || t.placements || null;
    if (Array.isArray(pal)) o.palm = pal.map((x) => ({ n: x.torneo || x.name || x.t || '', puesto: x.puesto || x.place || x.p || '', fecha: x.fecha || x.date || x.year || '', premio: x.premio ?? x.prize ?? x.earnings ?? null }));
    else if (v?.events?.length) o.palm = v.events.map((x) => ({ n: x.name, puesto: (x.results || []).map((z) => String(z).replace(/\s+-\s+/g, ': ').replace(/[^\x20-\x7EÀ-ſ·:]/g, '·').replace(/·+/g, '·')).join(' · '), fecha: x.year || '' }));
    const g = t.ganancias ?? t.earnings ?? null;
    if (g != null) o.gan = typeof g === 'number' ? { total: g, anos: [] } : { total: g.total ?? null, anos: (g.anos || g.years || g.por_ano || []).map((x) => ({ a: x.a || x.year || x.ano, v: x.v ?? x.value ?? x.total })) };
    const w = o.jug.filter((x) => x.r === 'W').length;
    o.kpi = [['País', t.loc || null], ['Siglas', t.acr || v?.info?.tag || null], ['Victorias', o.jug.length ? `${Math.round((w / o.jug.length) * 100)}%` : null], ['Balance', o.jug.length ? `${w} · ${o.jug.length - w}` : null]];
  } else if (e.s === 'u') {
    const a = d.at?.athlete, st = Object.fromEntries((a?.statsSummary?.statistics || []).map((x) => [x.abbreviation, x.displayValue]));
    for (const x of Object.values(d.at?.eventsMap || {}).filter((z) => z.gameResult)) o.jug.push({ at: Date.parse(x.gameDate) || 0, riv: { s: 'u', n: x.opponent?.displayName || '', logo: x.opponent?.headshot?.href || null, id: x.opponent?.id || null }, torneo: x.shortName || '', grupo: String(new Date(Date.parse(x.gameDate) || 0).getFullYear()), r: x.gameResult === 'W' ? 'W' : x.gameResult === 'D' ? 'D' : 'L', marca: '' });
    o.kpi = [['Récord', st['W-L-D'] ? String(st['W-L-D']).replace(/-/g, '·') : null], ['KO / TKO', st['(T)KO']], ['Sumisiones', st.SUB], ['Edad', a?.age], ['Altura', a?.displayHeight], ['Alcance', a?.displayReach], ['Categoría', a?.weightClass?.text], ['País', window.GM_EQ && a?.flag?.href ? { html: GM_EQ.flag('', a.flag.href, '', a.flag.alt) + esc(a.flag.alt || a.citizenship || '') } : a?.flag?.alt || a?.citizenship]];
  }
  // proximos que ya tenemos en Partidos (ESPN no siempre da el calendario que viene)
  if (e.s !== 'v' && e.s !== 'c') for (const x of board().filter((z) => z.s === e.s && (z.a === e.n || z.b === e.n))) if (!o.prox.some((y) => Math.abs(y.at - Date.parse(x.at)) < 36e5)) o.prox.push({ at: Date.parse(x.at), riv: eqDeMatch(x, x.a === e.n ? 'b' : 'a'), torneo: corto(L[x.lg]?.[0] || ''), live: x.live });
  o.jug.sort((a, b) => b.at - a.at); o.prox.sort((a, b) => a.at - b.at); o.kpi = o.kpi.filter((x) => x[1] != null && x[1] !== '');
  if (!o.gan && o.gente.some((x) => x.gan != null)) o.gan = { total: o.gente.reduce((s, x) => s + (+x.gan || 0), 0), anos: [] };
  if (window.GM_EQ) GM_EQ.norm(e, d, o);   // equipos.js: ficha ampliada (plantilla, titulos, cambios, banderas)
  return o;
}
const eqRes = (r) => `<b class="eq-res ${r === 'W' ? 'g' : r === 'D' ? 'e' : 'p'}">${r === 'W' ? 'G' : r === 'D' ? 'E' : 'P'}</b>`;
const eqRiv = (x) => `<button class="eq-riv" data-eqv="${esc(JSON.stringify(x.riv))}">${img(x.riv.logo, x.riv.s === 'u' ? 'face' : 'tl')}<span>${x.casa === false ? '@ ' : ''}${esc(x.riv.n)}</span></button>`;
const eqFila = (x) => `<div class="eq-f">${x.r ? eqRes(x.r) : `<b class="eq-res ${x.live ? 'v' : 'n'}">${x.live ? '●' : '·'}</b>`}<span class="eq-d">${x.at ? dmy(x.at) : ''}</span>${eqRiv(x)}<span class="eq-m">${esc(x.marca || (x.at && !x.r ? HM(x.at) : ''))}</span><span class="eq-t">${esc(x.torneo || '')}</span></div>`;
const eqCara = (x) => `<div class="eq-c ${x.staff ? 'st' : ''}">${x.img ? `<img src="${esc(x.img)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : `<span class="eq-ci">${esc(String(x.n || '?').slice(0, 2).toUpperCase())}</span>`}
  <b>${esc(x.n)}</b><small>${window.GM_EQ ? GM_EQ.flag(x.pais, x.bandera, '', x.bandera ? x.pais : '') : ''}${esc([x.num ? '#' + x.num : '', x.rol, window.GM_EQ && GM_EQ.flag(x.pais, x.bandera, '', x.bandera ? x.pais : '') ? '' : x.pais, x.edad ? x.edad + ' años' : ''].filter(Boolean).join(' · '))}</small>${x.gan != null ? `<em>${N(x.gan)} $</em>` : ''}</div>`;
const eqPags = (n, por, pg) => { const t = Math.ceil(n / por); return t > 1 ? `<nav class="pags eq-pags"><button data-eqpg="${pg - 1}" ${pg ? '' : 'disabled'} aria-label="Anterior">‹</button><span class="pags-n" data-notr>${pg + 1} / ${t}</span><button data-eqpg="${pg + 1}" ${pg < t - 1 ? '' : 'disabled'} aria-label="Siguiente">›</button></nav>` : '' };
function eqHtml(e, o) {
  const P = S.eqp, forma = o.jug.slice(0, 5).reverse();
  const tabs = [['resumen', 'Resumen', true], ['partidos', 'Partidos', o.jug.length || o.prox.length], ['plantilla', e.s === 'u' ? '' : 'Plantilla', o.gente.length], ['tabla', 'Clasificación', !!o.tabla], ['palmares', 'Palmarés', o.palm.length], ['cambios', 'Cambios', !!(o.cam && o.cam.length)], ['ganancias', 'Ganancias', !!o.gan]].filter(([, n, ok]) => n && ok);
  const tab = tabs.some(([k]) => k === P.tab) ? P.tab : 'resumen';
  let c = '';
  if (tab === 'resumen') {
    c = `${o.kpi.length ? `<div class="eq-k">${o.kpi.map(([a, b]) => `<div><span class="lab">${a}</span><b>${b && b.html != null ? b.html : esc(String(b))}</b></div>`).join('')}</div>` : ''}
      <div class="eq-2"><section><h4>Próximos</h4>${o.prox.slice(0, 4).map(eqFila).join('') || '<p class="hint">Nada a la vista.</p>'}</section>
      <section><h4>Últimos resultados</h4>${o.jug.slice(0, 5).map(eqFila).join('') || '<p class="hint">Sin resultados.</p>'}</section></div>`;
  } else if (tab === 'partidos') {
    const xs = [...o.prox.map((x) => ({ ...x, grupo: 'Próximos' })), ...o.jug], pg = Math.min(P.pag || 0, Math.max(0, Math.ceil(xs.length / EQ_POR) - 1));
    let g0 = '', h = ''; for (const x of xs.slice(pg * EQ_POR, pg * EQ_POR + EQ_POR)) { if (x.grupo !== g0) { h += `<span class="lab eq-g">${esc(x.grupo || 'Otros')}</span>`; g0 = x.grupo } h += eqFila(x) }
    c = h + eqPags(xs.length, EQ_POR, pg);
  } else if (tab === 'plantilla') {
    const pg = Math.min(P.pag || 0, Math.max(0, Math.ceil(o.gente.length / EQ_CARAS) - 1));
    c = `<div class="eq-cs">${o.gente.slice(pg * EQ_CARAS, pg * EQ_CARAS + EQ_CARAS).map(eqCara).join('')}</div>${eqPags(o.gente.length, EQ_CARAS, pg)}`;
  } else if (tab === 'tabla') {
    c = `<div class="eq-tb"><div class="eq-tr h"><span>#</span><span>Equipo</span><span>PJ</span><span>DG</span><span>Pts</span></div>${o.tabla.map((x) => `<div class="eq-tr ${x.id === String(e.id) ? 'yo' : ''}"><span>${x.rank ?? ''}</span><button class="eq-riv" data-eqv="${esc(JSON.stringify({ s: 'f', n: x.n, logo: x.logo, league: e.league, id: x.id }))}">${img(x.logo, 'tl')}<span>${esc(x.n)}</span></button><span>${x.pj ?? ''}</span><span>${x.dg ?? ''}</span><b>${x.pts ?? ''}</b></div>`).join('')}</div>`;
  } else if (tab === 'palmares') {
    const pg = Math.min(P.pag || 0, Math.max(0, Math.ceil(o.palm.length / EQ_POR) - 1));
    c = o.palm.slice(pg * EQ_POR, pg * EQ_POR + EQ_POR).map((x) => `<div class="eq-p ${/^(1|1st|1º|campe|winner|ganador)/i.test(String(x.puesto)) ? 'oro' : ''}"><span class="eq-pi">${/^(1|1st|1º|campe|winner|ganador)/i.test(String(x.puesto)) ? '🏆' : '·'}</span><span class="eq-pn">${esc(x.n)}<small>${esc(x.puesto)}</small></span><span class="eq-pf">${esc(String(x.fecha || ''))}</span>${x.premio != null ? `<b>${N(x.premio)} $</b>` : '<span></span>'}</div>`).join('') + eqPags(o.palm.length, EQ_POR, pg);
  } else if (tab === 'ganancias') {
    const mx = Math.max(1, ...o.gan.anos.map((x) => +x.v || 0)), top = o.gente.filter((x) => x.gan != null).sort((a, b) => b.gan - a.gan).slice(0, 6);
    c = `<div class="eq-gt"><span class="lab">En total</span><b>${o.gan.total != null ? N(o.gan.total) + ' $' : '·'}</b></div>${o.gan.anos.length ? `<div class="eq-ga">${o.gan.anos.map((x) => `<div><span>${esc(String(x.a))}</span><i style="width:${((+x.v || 0) / mx) * 100}%"></i><b>${N(x.v)} $</b></div>`).join('')}</div>` : ''}${top.length ? `<h4>Quién más ha ganado</h4><div class="eq-cs">${top.map(eqCara).join('')}</div>` : ''}`;
  }
  if (window.GM_EQ) { const h = GM_EQ.tab(tab, e, o, P); if (h != null) c = h; }   // equipos.js pinta Plantilla, Palmarés, Cambios y Ganancias con la ficha ampliada
  return `<header class="eq-h">${P.pila.length > 1 ? '<button class="eq-back" data-act="eq-atras" aria-label="Volver">‹</button>' : ''}${img(e.logo, e.s === 'u' ? 'face' : 'tl')}
      <div class="eq-hn"><span class="lab">${esc(e.lg ? L[e.lg]?.[0] || '' : SP[e.s][0])}</span><h2>${esc(e.n)}</h2>${window.GM_EQ ? GM_EQ.cab(e, o) : ''}${forma.length ? `<span class="eq-fm">${forma.map((x) => eqRes(x.r)).join('')}</span>` : ''}</div>
      <button class="rw-x" data-act="sh-info" aria-label="Cerrar"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></header>
    <nav class="eq-tabs">${tabs.map(([k, n]) => `<button class="${k === tab ? 'on' : ''}" data-eqtab="${k}">${n}</button>`).join('')}</nav>
    <div class="eq-cu">${c}</div>`;
}
async function pintaEq() {
  let el = document.getElementById('eqp');
  const P = S.eqp, e = P?.pila?.[P.pila.length - 1];
  if (!e) { if (el) el.remove(); return }
  if (!el) { el = document.createElement('div'); el.id = 'eqp'; document.body.appendChild(el); el.innerHTML = `<div class="rw-fondo" data-act="sh-info"></div><aside class="eqp abre" role="dialog" aria-label="Todo sobre el equipo"><p class="hint">Cargando…</p></aside>` }
  if (e.jug && window.GM_JUG) return GM_JUG.pinta(el, e, P);   // ficha de jugador (jugadores.js)
  const k = eqKey(e) + '|' + P.tab + '|' + (P.pag || 0) + '|' + (P.tier || '') + '|' + (P.pto || ''); if (el.dataset.k === k) return;
  const box = el.querySelector('.eqp'); if (!EQD.has(eqKey(e))) box.innerHTML = `<header class="eq-h">${img(e.logo, e.s === 'u' ? 'face' : 'tl')}<div class="eq-hn"><h2>${esc(e.n)}</h2></div></header><p class="hint">Cargando…</p>`;
  const d = await eqCarga(e);
  const P2 = S.eqp, e2 = P2?.pila?.[P2.pila.length - 1]; if (!e2 || eqKey(e2) + '|' + P2.tab + '|' + (P2.pag || 0) + '|' + (P2.tier || '') + '|' + (P2.pto || '') !== k) return;
  el.dataset.k = k; box.innerHTML = eqHtml(e, eqNorm(e, d)); box.scrollTop = 0;
  if (window.GM_LANG) GM_LANG.traduce(el);
  if (window.GM_EQ) GM_EQ.post(el);
}
function sheetFutbol(m, side, d) {
  const id = String(m.espn.ids[side]);
  const evs = (d.sc?.events || []).map((e) => { const c = e.competitions?.[0] || {}; const yo = (c.competitors || []).find((x) => String(x.team?.id) === id), el = (c.competitors || []).find((x) => String(x.team?.id) !== id);
    const sc = (x) => x?.score?.displayValue ?? x?.score ?? ''; const hecho = c.status?.type?.completed;
    const r = hecho ? (yo?.winner ? 'W' : el?.winner ? 'L' : 'D') : null;
    return { at: Date.parse(e.date), hecho, r, rival: el?.team?.displayName || el?.team?.shortDisplayName || '', logo: el?.team?.logos?.[0]?.href || el?.team?.logo || null, casa: yo?.homeAway === 'home', marca: hecho ? `${sc(yo)}:${sc(el)}` : '', temp: e.season?.displayName || e.league?.name || '' } });
  const todos = evs.filter((e) => e.hecho).sort((a, b) => b.at - a.at), jugados = todos.slice(0, SH_POR), proximos = evs.filter((e) => !e.hecho).sort((a, b) => a.at - b.at).slice(0, 4);
  const fila = (e) => `<div class="shr">${img(e.logo, 'tl')}<span class="nm">${e.casa ? '' : '@ '}${esc(e.rival)}</span><span class="dt">${dmy(e.at)}</span>${e.hecho ? `<span class="mk">${esc(e.marca)}</span>${res(e.r)}` : `<span class="mk">${HM(e.at)}</span>`}</div>`;
  let h = shInfoBtn('Todo sobre el equipo') + (jugados.length ? `<div class="shs"><span class="lab">Forma</span><span class="fm big">${jugados.slice(0, 5).reverse().map((e) => res(e.r)).join('')}</span></div>` : '');
  if (todos.length) h += S.shTodos ? shPorGrupo(todos, (e) => e.temp, fila) + shMas(todos.length) : `<div class="shs"><span class="lab">Últimos partidos</span>${jugados.map(fila).join('')}${shMas(todos.length)}</div>`;
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
  const todas = Object.values(d.at.eventsMap || {}).filter((e) => e.gameResult).sort((x, y) => Date.parse(y.gameDate) - Date.parse(x.gameDate)), peleas = S.shTodos ? todas : todas.slice(0, SH_POR);
  return `${shInfoBtn('Todo sobre el luchador')}<div class="bio">${bio.map(([k, v]) => `<div><span class="lab">${k}</span><b>${esc(String(v).replace(/-/g, '·'))}</b></div>`).join('')}</div>
    ${peleas.length ? `<div class="shs"><span class="lab">Últimas peleas</span>${peleas.map((e) => `<div class="shr"><span class="nm">${esc(e.opponent?.displayName || '')}</span><span class="dt">${esc(e.shortName || '')} · ${dmy(Date.parse(e.gameDate))}</span>${res(e.gameResult === 'W' ? 'W' : e.gameResult === 'D' ? 'D' : 'L')}</div>`).join('')}${shMas(todas.length)}</div>` : ''}`;
}
// Valorant y CS2: historial de PandaScore que guarda el sincronizador en la tabla teams (db/006)
function sheetEsports(m, side, d) {
  const t = d.yo; if (!t) return sheetValorant(m, side);
  const h = t.hist || [], w = h.filter((x) => x.won).length, mapsW = h.reduce((a, x) => a + (+String(x.score).split(':')[0] || 0), 0), mapsL = h.reduce((a, x) => a + (+String(x.score).split(':')[1] || 0), 0);
  let racha = 0; for (const x of h) { if (x.won === h[0]?.won) racha++; else break }
  const nm = side === 'a' ? m.a : m.b, prox = board().filter((x) => x.id !== m.id && (x.a === nm || x.b === nm)).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(0, 4);
  const h2h = h.filter((x) => String(x.vsId) === String(d.rival));
  const kpi = [['Últimos ' + h.length, `${w}-${h.length - w}`], ['Victorias', h.length ? Math.round((w / h.length) * 100) + '%' : '·'], ['Racha', h.length ? `${racha} ${h[0].won ? 'ganados' : 'perdidos'}` : '·'], ['Mapas', `${mapsW}-${mapsL}`], ['País', window.GM_EQ && t.loc && GM_EQ.flag(t.loc) ? { html: GM_EQ.flag(t.loc) + esc(GM_EQ.nombrePais(t.loc)) } : t.loc || '·'], ['Siglas', t.acr || '·']];
  let o = shInfoBtn('Todo sobre el equipo') + `<div class="bio">${kpi.map(([k, v]) => `<div><span class="lab">${k}</span><b>${v && v.html != null ? v.html : esc(String(v))}</b></div>`).join('')}</div>`;
  if (h.length) o += `<div class="shs"><span class="lab">Forma</span><span class="fm big">${h.slice(0, 5).reverse().map((x) => res(x.won ? 'W' : 'L')).join('')}</span></div>`;
  if (h2h.length) o += `<div class="shs"><span class="lab">Cara a cara</span>${h2h.map((e) => `<div class="shr">${img(e.logo, 'tl')}<span class="nm">${esc(e.vs)}${e.t ? `<small>${esc(corto(e.t))}</small>` : ''}</span><span class="dt">${e.at ? dmy(Date.parse(e.at)) : ''}</span><span class="mk">${esc(e.score)}</span>${res(e.won ? 'W' : 'L')}</div>`).join('')}</div>`;
  const filaE = (e) => `<div class="shr">${img(e.logo, 'tl')}<span class="nm">${esc(e.vs)}${e.t ? `<small>${esc(corto(e.t))}</small>` : ''}</span><span class="dt">${e.at ? dmy(Date.parse(e.at)) : ''}</span><span class="mk">${esc(e.score)}</span>${res(e.won ? 'W' : 'L')}</div>`;
  if (h.length) o += S.shTodos ? shPorGrupo(h, (e) => corto(e.t) || 'Otros', filaE) + shMas(h.length) : `<div class="shs"><span class="lab">Últimos resultados</span>${h.slice(0, SH_POR).map(filaE).join('')}${shMas(h.length)}</div>`;
  if (prox.length) o += `<div class="shs"><span class="lab">Próximos</span>${prox.map((x) => { const r = x.a === nm ? x.b : x.a; return `<div class="shr">${img(x.a === nm ? x.lb : x.la, 'tl')}<span class="nm">${esc(r)}<small>${esc(corto(L[x.lg]?.[0] || ''))}</small></span><span class="dt">${dmy(Date.parse(x.at))}</span><span class="mk">${HM(Date.parse(x.at))}</span><span></span></div>` }).join('')}</div>`;
  const pl = t.players || m.players?.[side] || [];
  if (pl.length) o += `<div class="shs"><span class="lab">Jugadores</span><div class="pls">${pl.map((x) => `<div class="pl">${x.img ? `<img class="face" src="${esc(x.img)}" alt="" loading="lazy">` : `<span class="pl-i">${esc((x.n || '?').slice(0, 2).toUpperCase())}</span>`}<b class="eqx-jn" data-jug="${esc(x.n)}" data-jtn="${esc(side === 'a' ? m.a : m.b)}">${esc(x.n)}</b><span>${window.GM_EQ ? GM_EQ.flag(x.nat) : ''}${esc([x.nombre, window.GM_EQ && GM_EQ.flag(x.nat) ? '' : x.nat, x.age ? x.age + ' años' : null].filter(Boolean).join(' · '))}</span></div>`).join('')}</div></div>`;
  return o;
}
function sheetValorant(m, side) {
  const pl = m.players?.[side] || [], rc = m.recent?.[side] || [];
  let h = '';
  if (pl.length) h += `<div class="shs"><span class="lab">Jugadores</span><div class="pls">${pl.map((x) => `<div class="pl">${x.img ? `<img class="face" src="${esc(x.img)}" alt="" loading="lazy">` : `<span class="pl-i">${esc((x.n || '?').slice(0, 2).toUpperCase())}</span>`}<b class="eqx-jn" data-jug="${esc(x.n)}" data-jtn="${esc(side === 'a' ? m.a : m.b)}">${esc(x.n)}</b><span>${window.GM_EQ ? GM_EQ.flag(x.nat) : ''}${esc([x.nombre, window.GM_EQ && GM_EQ.flag(x.nat) ? '' : x.nat].filter(Boolean).join(' · '))}</span></div>`).join('')}</div></div>`;
  if (rc.length) h += `<div class="shs"><span class="lab">Últimos resultados</span>${rc.map((e) => `<div class="shr">${img(e.logo, 'tl')}<span class="nm">${esc(e.vs)}${e.t ? `<small>${esc(corto(e.t))}</small>` : ''}</span><span class="dt">${e.at ? dmy(Date.parse(e.at)) : ''}</span><span class="mk">${esc(e.score)}</span>${res(e.won ? 'W' : 'L')}</div>`).join('')}</div>`;
  return h || '<p class="hint">PandaScore todavía no tiene datos de este equipo.</p>';
}
function sheet(m, side) {
  const nm = side === 'a' ? m.a : m.b;
  return `<section class="det sheet ${S.sheet ? 'open' : ''}" data-keep="dt">
    <button class="det-x vis" data-act="sheet-back">← ${esc(m.a)} vs ${esc(m.b)}</button>
    <div class="sh-hd">${logo(m, side)}<div><h2>${esc(nm)}</h2><span class="lab">${esc(L[m.lg][0])}${m.stage ? ' · ' + esc(m.stage) : ''}</span>${favBtn(favEq(m, side))}</div></div>
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
const brNom = (r) => { const x = r.replace(/^(upper|lower) bracket\s*/i, '').trim(); return /grand final/i.test(x) ? 'Gran final' : /^quarter/i.test(x) ? 'Cuartos' : /^semi/i.test(x) ? 'Semis' : /^final$/i.test(x) ? 'Final' : /^round of 16$/i.test(x) ? 'Octavos' : /^round of 32$/i.test(x) ? 'Dieciseisavos' : x.replace(/^round/i, 'Ronda') || 'Ronda' };
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

/* directo (PM, 30-10: "un boton de live para ver como va el partido; ahora juegan en Valorant y no se ve nada") */
const IC_OJO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const viendo = (mid) => Object.entries(MIRA).filter(([, v]) => v === mid).map(([k]) => k);
const embedDe = (v) => { if (!v?.e) return null; let u = v.e; const j = u.includes('?') ? '&' : '?';
  if (/player\.twitch\.tv/.test(u)) u += `${j}parent=pmbanks.github.io&parent=localhost&parent=127.0.0.1&muted=true`;
  else if (/youtube\.com\/embed/.test(u)) u += `${j}autoplay=1&mute=1`;
  return u };
const LIVE_ORD = (a, b) => (window.GM_QUIEN ? GM_QUIEN.ord(a, b) : whoOn(b.id).length - whoOn(a.id).length) || Date.parse(a.at) - Date.parse(b.at);
function dvSel() {
  const vs = M.filter((m) => m.live).sort(LIVE_ORD), m = vs.find((x) => x.id === S.dv) || vs[0]; if (!m) return { vs, m: null, tvs: [], tv: null };
  const tvs = (m.tv || []).filter((v) => v.e), pri = (v) => (/^(es|en)$/.test(v.l) ? 2 : 0) + (v.main ? 1 : 0);
  const tv = tvs[S.dtv] && S.dvm === m.id ? tvs[S.dtv] : [...tvs].sort((a, b) => pri(b) - pri(a))[0] || null;
  return { vs, m, tvs, tv };
}
const dvKey = () => { const { m, tv } = dvSel(); return (m?.id || '') + '|' + (S.dvVer ? tv?.e || '' : 'sin') };
function dvInfo(m, cta = '') {
  const w = whoOn(m.id), g = m.games || [];
  const mapas = g.length ? `<div class="dv-maps">${g.map((x) => `<span class="${x.st === 'running' ? 'run' : x.st === 'finished' ? 'fin' : ''}"><small>Mapa ${x.n}</small><b>${x.st === 'running' ? 'en juego' : x.st === 'finished' ? (x.w === m.tid?.a ? esc(m.a) : x.w === m.tid?.b ? esc(m.b) : 'acabado') : 'pendiente'}</b></span>`).join('')}</div>` : '';
  return `<div class="dv-info" data-dv-info data-espn="${m.espn ? esc(m.espn.sport + '|' + m.espn.league + '|' + m.espn.event) : ''}">
    <div class="dv-sc"><div>${logo(m, 'a')}<b>${esc(m.a)}</b></div><strong>${esc(String(m.score || '0:0').split(/\s+/)[0])}<small>${esc(String(m.score || '').split(/\s+/).slice(1).join(' ').replace(/^[·(]\s*|\)$/g, '')) || (m.s === 'v' || m.s === 'c' ? 'mapas ganados' : 'en vivo')}</small></strong><div>${logo(m, 'b')}<b>${esc(m.b)}</b></div></div>
    ${window.GM_QUIEN ? GM_QUIEN.bloque(m) : ''}${cta}
    <p class="dv-meta"><span class="dv-sp"><img src="${SP[m.s][1]}" alt="">${SP[m.s][0]}</span><img class="tl" src="${esc(L[m.lg]?.[1] || '')}" alt="">${esc(L[m.lg]?.[0] || '')}${m.stage ? ' · ' + esc(corto(m.stage)) : ''}${m.bo ? ' · BO' + m.bo : ''}</p>
    ${mapas}
    ${viendo(m.id).length ? `<div class="dv-watch">${IC_OJO}<span>Viendo este directo</span>${viendo(m.id).map((k) => `<span class="dv-w">${av(k, 'sm')}${esc(fr(k).n)}</span>`).join('')}</div>` : ''}
    ${window.GM_QUIEN ? '' : `<div class="dv-bets"><span class="lab">Apuestas en este partido</span>${w.length ? w.map((x) => `<div class="dv-b" style="--c:var(--f-${x.f})">${av(x.f, 'sm')}<b>${esc(fr(x.f).n)}</b><span>${x.p ? esc(pn(m, x.p)) + ' · ' + O(x.o) : 'oculta'}</span><em>${N(x.stake)} → ${x.p ? N(x.stake * x.o) : '?'}${coin()}</em></div>`).join('') : '<p class="hint">Nadie ha apostado a este partido.</p>'}</div>`}
    <button class="go-s res" data-goto="${m.id}">Ver la ficha y las estadísticas</button>
    <p class="hint">El marcador se actualiza cada pocos minutos; lo de verdad va en el vídeo.</p>
  </div>`;
}
function directo() {
  const { vs, m, tvs, tv } = dvSel();
  if (!m) { const sig = M.filter((x) => !x.live && Date.parse(x.at) > NOW).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0];
    return `<div class="pad"><div class="dv-nada"><h2>Ahora mismo no se juega nada</h2>${sig ? `<p>Lo siguiente: <b>${esc(sig.a)} vs ${esc(sig.b)}</b>, ${WD(sig.at)} a las ${HM(sig.at)} (faltan ${CD(sig.at)}).</p>` : ''}</div></div>` }
  const emb = embedDe(tv), fuera = (m.tv || []).filter((v) => v.u).map((v) => `<a class="tv" href="${esc(v.u)}" target="_blank" rel="noopener">${esc(v.n)}${v.l && !/^(en|es)$/.test(v.l) ? ' · ' + esc(LANG[v.l] || v.l) : ''} ↗</a>`).join('');
  // el video solo si lo pides: la vista empieza centrada en el partido (marcador, vivo.js, apuestas)
  const cta = S.dvVer ? '' : `<div class="dv-cta">${emb ? `<button class="dv-ver" data-act="dv-ver"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></svg>Ver el stream aquí</button>` : '<span class="hint">No hay una emisión que se pueda ver dentro de la app.</span>'}${fuera ? `<span class="dv-fuera">${emb ? 'o en' : 'Verlo en'} ${fuera}</span>` : ''}</div>`;
  return `<div class="pad dv ${S.dvVer ? '' : 'sin'}" data-dv-key="${esc(dvKey())}">
    <div class="dv-main">
      ${S.dvVer ? `<div class="dv-player">${emb ? `<iframe src="${esc(emb)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen title="Directo"></iframe>` : `<div class="dv-sin"><p>Este partido no tiene una emisión que se pueda ver aquí.</p>${fuera}</div>`}</div>
      <nav class="dv-tvs">${tvs.length > 1 ? tvs.map((v, i) => `<button class="chip ${v === tv ? 'on' : ''}" data-dtv="${i}">${esc(v.n)} · ${esc(LANG[v.l] || v.l || '')}</button>`).join('') : ''}<button class="chip q dv-oc" data-act="dv-ver">Ocultar el stream</button></nav>` : ''}
      ${dvInfo(m, cta)}
    </div>
    <aside class="dv-list"><span class="lab">En directo · ${vs.length}</span>${vs.map((x) => `<button class="dv-it ${x === m ? 'on' : ''}" data-dv="${x.id}"><img class="tl" src="${esc(L[x.lg]?.[1] || '')}" alt=""><span><b>${esc(x.a)} <i>${esc(x.score || '0:0')}</i> ${esc(x.b)}</b><small><img class="dv-spi" src="${SP[x.s][1]}" alt="">${SP[x.s][0]} · ${esc(L[x.lg]?.[0] || '')}</small>${viendo(x.id).length ? `<small class="dv-ven">${IC_OJO}${viendo(x.id).map((k) => esc(fr(k).n)).join(', ')}</small>` : ''}</span>${window.GM_QUIEN ? (GM_QUIEN.hay(x.id) ? `<em>${GM_QUIEN.caras(x.id)}</em>` : '') + GM_QUIEN.retoLinea(x.id) : whoOn(x.id).length ? `<em>${whoOn(x.id).map((w) => av(w.f, 'sm')).join('')}</em>` : ''}</button>`).join('')}</aside>
  </div>`;
}

/* retos (1v1, 2v1, 2v2, 3v1...: db/053, las cuentas estan en retos.js) */
const chName = (st) => ({ pending: 'Esperando respuesta', accepted: 'En juego', declined: 'Rechazado', expired: 'Sin contestar', canceled: 'Retirado', won_from: 'Ganado', won_to: 'Ganado', won_other: 'Ganado', void: 'Sin ganador' }[st] || st);
function retoRow(c) {
  const m = byId(c.m); if (!m) return '';
  const R = window.GM_RETOS;
  // retos.js (01-11): un reto abierto (c.ab) no tiene destinatario: lo coge el primero que entra. Los retos no se cancelan:
  // ya no hay boton Retirar (si nadie entra antes de empezar, la base devuelve lo puesto)
  const forMe = R ? R.paraMi(c) : (c.to === MEK || (c.ab && c.from !== MEK)) && c.st === 'pending' && isOpen(m);
  const ls = R ? R.lados(c) : [{ p: c.fp, ks: [c.from] }].concat(c.tp ? [{ p: c.tp, ks: [c.to] }] : []);
  const ws = R ? R.ganan(c) : [];
  const grupo = (l) => l.ks.length === 1 ? esc(fr(l.ks[0]).n) : `${esc(fr(l.ks[0]).n)} +${l.ks.length - 1}`;
  const caras = (l) => l.ks.slice(0, 3).map((k) => av(k, 'sm')).join('') + (l.ks.length > 3 ? `<span class="rt-n">+${l.ks.length - 3}</span>` : '');
  let act = '';
  if (forMe) act = `<span class="rt-act">${R ? R.accion(c) : ''}</span>`;   // retos.js: "Aceptar · pones X, ganas Y" en un toque (el lado es el contrario) y No
  const anyAv = '<span class="av sm rt-any" title="Cualquiera"><svg viewBox="0 0 24 24"><circle cx="9" cy="9" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6.2a3 3 0 0 1 0 5.6M17.5 14a5 5 0 0 1 3 5"/></svg></span>';
  const rival = ls[1] ? caras(ls[1]) : c.ab ? anyAv : av(c.to, 'sm');
  const vs = ls[1] ? ` <i>contra</i> ${grupo(ls[1])} · ${esc(pn(m, ls[1].p))}` : c.ab ? ` <i>reta a</i> cualquiera` : ` <i>reta a</i> ${esc(fr(c.to).n)}`;
  const gana = ws.length ? (ws.length === 1 ? 'Gana ' + esc(fr(ws[0]).n) : 'Ganan ' + esc(fr(ws[0]).n) + ' +' + (ws.length - 1)) : '';
  const nv = R ? R.nvm(c) : '1v1', bote = R ? R.bote(c) : c.stake * 2;
  return `<div class="rt ${c.st} ${c.ab ? 'ab' : ''}"><div class="rt-who">${caras(ls[0])}<i>vs</i>${rival}</div>
    <div style="min-width:0"><strong>${grupo(ls[0])} · ${esc(pn(m, ls[0].p))}${vs}</strong>
    <span class="m"><b class="rt-nvm">${nv}</b> · ${esc(m.a)} vs ${esc(m.b)} · ${m.live ? 'en juego' : c.st === 'pending' || c.st === 'accepted' ? WD(m.at).toLowerCase() + ' ' + HM(m.at) + ' · ' + CD(m.at) : when(c.set || c.at)}</span></div>
    <div class="v"><b>${N(bote)}${coin()}</b><span class="st">${gana || (c.ab && c.st === 'pending' ? 'Abierto a todos' : chName(c.st))}</span></div>${act}</div>`;
}
const retosHtml = (list, empty) => (list.length ? `<div class="rts">${list.map(retoRow).join('')}</div>` : `<p class="hint">${empty}</p>`);
function retoForm(m) { return window.GM_RETOS ? GM_RETOS.btn(m, 'grande') : '' }   // retos.js: un boton Retar que abre un panel con todo a la vista

/* logros (se calculan con lo que ya hay) */
const LOGROS = [
  ['primera', 'Primera victoria', 'Gana una apuesta', (f, b) => b.some((x) => x.st === 'won')],
  ['racha3', 'En racha', '3 ganadas seguidas', (f) => f.streak >= 3],
  ['racha5', 'Imparable', '5 ganadas seguidas', (f) => f.streak >= 5],
  ['valiente', 'Valiente', 'Gana con cuota de 3 o más', (f, b) => b.some((x) => x.st === 'won' && x.o >= 3)],
  ['tirador', 'Francotirador', 'Gana con cuota de 5 o más', (f, b) => b.some((x) => x.st === 'won' && x.o >= 5)],
  ['todo', 'Todoterreno', 'Apuesta en fútbol, Valorant y UFC', (f, b) => DEP.filter((s) => s !== 'b' && s !== 'r').every((s) => b.some((x) => byId(x.m)?.s === s))],
  ['fiel', 'Fiel', '20 apuestas', (f, b) => b.length >= 20],
  ['ballena', 'Ballena', 'Apuesta 1.000 de una vez', (f, b) => b.some((x) => x.stake >= 1000)],
  ['verde', 'En verde', 'Ten más de lo que te han dado', (f) => f.s > f.recibido && f.bets > 0],
  ['duelo', 'Duelista', 'Gana un reto', (f) => CH.some((c) => (window.GM_RETOS ? GM_RETOS.ganan(c).includes(f.id) : (c.st === 'won_from' && c.from === f.id) || (c.st === 'won_to' && c.to === f.id)))],
  ['dia', 'Del día', 'Acierta la apuesta del día', (f, b) => b.some((x) => x.st === 'won' && DAILY.some((d) => d.match === x.m))],
  ['rico', 'Rico', 'Llega a 5.000', (f) => f.s >= 5000],
];
const logrosDe = (f) => { const b = ALL.filter((x) => x.k === f.id); return LOGROS.map(([id, n, d, ok]) => [id, n, d, !!ok(f, b)]) };
const MEDAL = '<svg viewBox="0 0 24 24"><circle cx="12" cy="14.5" r="5.5"/><path d="M8.5 9.6L6 3.5h4l2 4 2-4h4l-2.5 6.1"/></svg>';

/* avisos del navegador (mientras la app esta abierta, aunque sea de fondo) y confeti al ganar */
let SNAP = null;
function avisos() {
  const now = { fav: new Map(M.filter(sigo).map((m) => [m.id, m.status])), bets: new Map(ALL.filter((b) => b.k === MEK).map((b) => [b.id, b.st])), ch: new Map(CH.map((c) => [c.id, c.st])), live: new Set(M.filter((m) => m.live && myBetsOn(m.id).length).map((m) => m.id)) };
  if (SNAP) {
    for (const [id, st] of now.fav) { const was = SNAP.fav?.get(id), m = byId(id); if (!was || was === st || !m) continue;
      if (st === 'live') { avisa('Empieza ' + m.a + ' vs ' + m.b, 'Lo sigues · ' + (L[m.lg]?.[0] || '')); toast(`Empieza <b>${esc(m.a)} vs ${esc(m.b)}</b>`) }
      else if (st === 'final') { avisa('Final: ' + m.a + ' ' + (m.score || '') + ' ' + m.b, 'Lo sigues · ' + (L[m.lg]?.[0] || '')); toast(`Final: <b>${esc(m.a)} ${esc(m.score || '')} ${esc(m.b)}</b>`) } }
    for (const b of ALL.filter((x) => x.k === MEK)) {
      const was = SNAP.bets.get(b.id); if (!was || was === b.st || was !== 'open' || b.cash) continue;
      const m = byId(b.m); if (!m) continue;
      // la celebracion (tarjeta, confeti y sonido) la pone ganado.js; aqui solo el aviso del sistema, con la misma etiqueta que el suyo
      if (b.st === 'won') avisa('¡Has ganado ' + N(b.pay) + '!', `${pn(m, b.p)} · ${m.a} ${m.score || ''} ${m.b}`);
      else if (b.st === 'lost') avisa('Apuesta perdida', `${pn(m, b.p)} · ${m.a} ${m.score || ''} ${m.b}`);
    }
    for (const c of CH) {
      const was = SNAP.ch.get(c.id), m = byId(c.m); if (!m) continue;
      if (!was && c.to === MEK && c.st === 'pending') avisa(`${fr(c.from).n} te reta`, `${m.a} vs ${m.b} · pones ${N(c.stake)}, ganas ${N(c.stake * 2)}`);
      if (was && was !== c.st && /^won_/.test(c.st)) { const gana = window.GM_RETOS ? GM_RETOS.ganan(c).includes(MEK) : (c.st === 'won_from' ? c.from : c.to) === MEK; if (gana) confeti(); if (window.GM_RETOS ? GM_RETOS.dentro(c) : (c.from === MEK || c.to === MEK)) avisa(gana ? '¡Reto ganado!' : 'Reto perdido', `${m.a} ${m.score || ''} ${m.b}`) }
      if (was === 'pending' && c.st === 'accepted' && c.from === MEK && !(window.GM_RETOS && GM_RETOS.fueAbierto(c.id))) avisa(`${fr(c.to).n} acepta tu reto`, `${m.a} vs ${m.b} · ${N(c.stake * 2)} en juego`);
    }
    for (const id of now.live) if (!SNAP.live.has(id)) { const m = byId(id); avisa('Empieza tu partido', `${m.a} vs ${m.b}`) }
  }
  SNAP = now;
  if (window.GM_RETOS) GM_RETOS.tras();   // retos.js: retos que te llegan, retos abiertos nuevos y quien entra en el tuyo
}
function avisa(t, b) { try { if (window.Notification && Notification.permission === 'granted' && document.hidden) new Notification(t, { body: b, icon: '../img/icon-192.png', tag: t + b }) } catch {} }
function confeti(ox, oy) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas'), x = c.getContext('2d'), W = (c.width = innerWidth), H = (c.height = innerHeight);
  c.className = 'confeti'; document.body.appendChild(c);
  const col = ['#f2c14e', '#ffdc85', '#cc6496', '#4d88e6', '#2bd47d', '#f4f2ec'];
  const P = Array.from({ length: 140 }, () => ({ x: (ox ?? W / 2) + (Math.random() - 0.5) * 200, y: oy ?? H * 0.35, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 13 - 4, r: Math.random() * 6 + 3, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4, c: col[(Math.random() * col.length) | 0] }));
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
  (function f(t) { const k = Math.min(1, (t - t0) / 700), e = 1 - Math.pow(1 - k, 3); el.textContent = N(from + (to - from) * e); el.classList.toggle('neg-s', from + (to - from) * e < -0.5); if (k < 1) requestAnimationFrame(f); else setTimeout(() => el.classList.remove('sube', 'baja'), 400) })(t0);
}

/* ---------- Partidos ---------- */
function featured() {
  const soon = board().filter((m) => !m.live && m.s !== 'r' && Date.parse(m.at) < NOW + 4 * DAY && (TOP.has(m.lg) || m.s !== 'f'));
  const score = (m) => whoOn(m.id).length * 10 - (m.o[0] && m.o[2] ? Math.abs(m.o[0] - m.o[2]) : 9) + (TOP.has(m.lg) ? 2 : 0);
  return soon.sort((a, b) => score(b) - score(a)).slice(0, 3);
}
// PM, 30-10: "lo de live se ve terrible; que se vea en largo, estirado, no tan junto todo": una tarjeta ancha por partido
// en vivo (escudos, nombres enteros, marcador grande con la serie y el mapa, juego y liga, quien ha apostado); si hay
// muchos, carrusel con flechas
// vivo.js da por equipo los mapas ganados y las rondas del mapa en juego (m.vivo, con "a" siempre el local) y la linea
// "Mapa 2 de 3 · Haven" (o el minuto en futbol); aqui solo se pintan. Sin vivo.js o sin datos, queda lo de antes.
const vN = (m, s) => (m.live && window.GM_VIVO ? GM_VIVO.n(m, s) : ''), vL = (m) => (m.live && window.GM_VIVO ? GM_VIVO.linea(m) : '');
function vivoCard(m) {
  const sc = String(m.score || '0:0'), [g, ...resto] = sc.split(/\s+/), det = resto.join(' ').replace(/^[·(]\s*|\)$/g, ''), ws = whoOn(m.id), tot = ws.reduce((a, w) => a + w.stake, 0);
  const lado = (s) => `<span class="lvc-t ${s}">${logo(m, s)}<b>${esc(s === 'a' ? m.a : m.b)}</b>${vN(m, s)}</span>`;
  return `<button class="lvc" data-vivo="${m.id}" style="--sc:${SPC[m.s]}">
    <span class="lvc-h"><i class="lvc-dot"></i><em>EN VIVO</em><img class="lvc-sp" src="${SP[m.s][1]}" alt=""><img class="tl" src="${esc(L[m.lg]?.[1] || '')}" alt="" loading="lazy"><span class="lvc-lg">${esc(corto(L[m.lg]?.[0] || ''))}</span></span>
    <span class="lvc-m">${lado('a')}<span class="lvc-sc">${m.vivo ? vL(m) || '<strong>·</strong>' : `<strong>${esc(g)}</strong>${det ? `<small>${esc(det)}</small>` : m.s === 'v' || m.s === 'c' ? '<small>mapas</small>' : ''}`}</span>${lado('b')}</span>
    <span class="lvc-w">${window.GM_QUIEN && GM_QUIEN.hay(m.id) ? GM_QUIEN.vivoPie(m) : ws.length ? `<span class="lvc-avs">${ws.slice(0, 5).map((w) => av(w.f, 'sm')).join('')}</span><span>${ws.length} ${ws.length === 1 ? 'apuesta' : 'apuestas'} · ${N(tot)}${coin()} en juego</span>` : '<span class="lvc-nadie">Nadie ha apostado</span>'}<span class="lvc-ir">Ver partido ›</span></span>
  </button>`;
}
const vivosHtml = (ls) => `<section class="lv2 ${ls.length > 1 ? 'mas' : ''}"><div class="lv2-h"><span class="lab"><i class="dot"></i>En directo · ${ls.length}</span>${ls.length > 1 ? '<span class="lv2-fl"><button data-lvx="-1" aria-label="Anterior"><svg viewBox="0 0 24 24"><path d="M14.5 6l-6 6 6 6"/></svg></button><button data-lvx="1" aria-label="Siguiente"><svg viewBox="0 0 24 24"><path d="M9.5 6l6 6-6 6"/></svg></button></span>' : ''}</div><div class="lv2-row" data-lv>${ls.map(vivoCard).join('')}</div></section>`;
let LVX = 0;
function lvFlechas() { const n = document.querySelector('[data-lv]'); if (!n) return; if (n.scrollLeft !== LVX) n.scrollLeft = LVX; n.onscroll = () => { LVX = n.scrollLeft } }
document.addEventListener('click', (e) => { const b = e.target.closest('[data-lvx]'); if (!b) return; const n = document.querySelector('[data-lv]'); n?.scrollBy({ left: +b.dataset.lvx * (n.querySelector('.lvc')?.offsetWidth || 300) + +b.dataset.lvx * 14, behavior: 'smooth' }) });
const jugados = () => M.filter((m) => m.status === 'final' && (S.f === 'all' || m.s === S.f) && inLeague(m)).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
// PM, 30-10: "que se puedan ver latest games, osea juegos ya jugados": la lista estaba al final de Partidos y no se veia.
// Ahora hay un boton arriba, al lado de los filtros, que deja solo los ya jugados (todos, sin "Ver mas").
// PM, 01-11 (modelo B de modelos/m1101/jugados): Ya jugados sale de la fila de deportes y va en el titulo "Próximos ▾",
// que despliega Próximos, En directo (lleva a Directo) y Ya jugados. Estilos en menu.css
const IC_CK = '<svg class="pm-ck" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const jugMenu = (np) => { const nj = jugados().length, nl = M.filter((m) => m.live).length, j = !!S.soloJug;
  const it = (on, act, ic, b, sm, n, cls = '') => `<button class="pm-it ${on ? 'on' : ''} ${cls}" ${act} role="menuitem"><span class="pm-ic"><svg viewBox="0 0 24 24">${ic}</svg></span><span class="pm-tx"><b>${b}</b><small>${sm}</small></span><em>${n}</em>${IC_CK}</button>`;
  return `<div class="pm-hd ${S.pmenu ? 'abre' : ''}"><button class="pm-tt" data-act="pmenu" aria-haspopup="menu" aria-expanded="${!!S.pmenu}"><span>${j ? 'Ya jugados' : 'Próximos'}</span><svg viewBox="0 0 24 24"><path d="M6 9.5l6 6 6-6"/></svg></button>${j ? '<span class="pm-res">Resultados</span>' : ''}<span class="pm-n">${j ? `${nj} ${nj === 1 ? 'resultado' : 'resultados'}` : `${np} ${np === 1 ? 'partido' : 'partidos'}`}</span>
    <div class="pm-menu" role="menu">${it(!j, j ? 'data-act="soloJug"' : '', SCREENS.partidos[2], 'Próximos', 'Lo que se juega a partir de ahora', np)}${nl ? it(false, 'data-scr="directo"', SCREENS.directo[2], 'En directo', 'Partidos que se están jugando', nl, 'vivo') : ''}${it(j, j ? '' : `data-act="soloJug"${nj ? '' : ' disabled'}`, SCREENS.apuestas[2], 'Ya jugados', 'Resultados de los últimos dos días', nj)}</div></div>` };
// PM 01-11 (Ya jugados B): en cada partido, lo que TU ganaste o perdiste (tus apuestas resueltas de ese partido) y, debajo, tus combinadas
// con ese partido y lo que sacó cada amigo. Las combinadas las carga combinadas.js (GM_CMB); aquí solo se leen
const jugResueltas = (k, mid) => ALL.filter((b) => b.k === k && b.m === mid && b.st !== 'open');
const jugCmbs = (mid) => ((window.GM_CMB && GM_CMB.todas()) || []).filter((c) => c.player === ME && ['won', 'lost', 'void'].includes(c.status) && (c.combo_legs || []).some((l) => l.match_id === mid));
const jugSig = (v) => (v > 0 ? '▲ ' : v < 0 ? '▼ ' : '');
function jugMio(m) {
  const bs = jugResueltas(MEK, m.id); if (!bs.length) return '<span class="jug-mi"></span>';
  const v = bs.reduce((a, b) => a + neto(b), 0), nul = bs.every((b) => b.st === 'void'), b0 = bs[0];
  const txt = bs.length > 1 ? `${bs.length} apuestas` : nul ? 'Devuelta' : `${N(b0.stake)} a ${esc(pn(m, b0.p))} · ${O(b0.o)}`;
  return `<span class="jug-mi ${nul ? 'nul' : v > 0 ? 'win' : v < 0 ? 'lose' : 'nul'}"><b>${nul ? N(bs.reduce((a, b) => a + b.stake, 0)) : jugSig(v) + N(Math.abs(v))}${coin()}</b><small>${txt}</small></span>`;
}
function jugX(m) {
  const cs = jugCmbs(m.id).map((c) => { const v = c.status === 'won' ? c.payout - c.stake : c.status === 'lost' ? -c.stake : 0;
    return `<span class="jug-tg ${v > 0 ? 'win' : v < 0 ? 'lose' : ''}"><em>Combinada</em><b>${c.status === 'void' ? N(c.stake) : jugSig(v) + N(Math.abs(v))}${coin()}</b></span>` });
  const fs = F.filter((f) => f.id !== MEK).map((f) => [f, jugResueltas(f.id, m.id)]).filter(([, bs]) => bs.length && bs.some((b) => b.st !== 'void'))
    .map(([f, bs]) => { const v = bs.reduce((a, b) => a + neto(b), 0); return `<span class="jug-tg ${v > 0 ? 'win' : v < 0 ? 'lose' : ''}">${av(f.id, 'sm')}<b>${jugSig(v) + N(Math.abs(v))}${coin()}</b></span>` });
  const t = [...cs, ...fs]; return t.length ? `<span class="jug-x">${t.join('')}</span>` : '';
}
// PM 01-11: "si ha ganado el partido que salga toda la linea de color rojo o verde": la fila entera en verde si ganaste lo apostado y en rojo si perdiste
function jugTono(m) { const bs = jugResueltas(MEK, m.id).filter((b) => b.st !== 'void'); if (!bs.length) return ''; const v = bs.reduce((a, b) => a + neto(b), 0); return v > 0 ? 'mi-gana' : v < 0 ? 'mi-pierde' : ''; }
function jugadosHtml() {
  const l = jugados(); if (!l.length) return '';
  if (window.GM_CMB) setTimeout(() => { try { GM_CMB.carga() } catch {} }, 0);   // tus combinadas con cada partido (lo frena combinadas.js: cada 30 s)
  const n = S.soloJug ? l.length : Math.min(l.length, S.jugN || 8), gan = (m, k) => { const [x, y] = String(m.score || '').split(' ')[0].split(':').map(Number); if (!(x >= 0 && y >= 0) || x === y) return ''; return (x > y) === (k === 'home') ? 'w' : 'l' };
  return `<section class="jug"><div class="day"><b>Ya jugados</b><span>últimos dos días</span><i>${l.length}</i></div>${l.slice(0, n).map((m) => `<button class="jug-r ${jugTono(m)}" data-goto="${m.id}">
    <span class="jug-t">${WD(m.at)} ${HM(m.at)}<small>${esc(L[m.lg]?.[0] || '')}</small></span>
    <span class="jug-e ${gan(m, 'home')}">${logo(m, 'a')}<b>${esc(m.a)}</b></span><span class="jug-s">${esc(String(m.score || '').split(' ')[0] || 'final')}</span><span class="jug-e b ${gan(m, 'away')}"><b>${esc(m.b)}</b>${logo(m, 'b')}</span>
    ${jugMio(m)}${jugX(m)}</button>`).join('')}
    ${n < l.length ? `<button class="jug-mas" data-jugmas="1">Ver más (${l.length - n})</button>` : ''}</section>`;
}
addEventListener('gm:cmb-datos', () => { if (S.scr === 'partidos' && S.soloJug && !document.activeElement?.matches('input,textarea')) render() });
function partidos() {
  const list = filtered();
  if (!S.foc || !byId(S.foc) || !(board().some((m) => m.id === S.foc) || byId(S.foc).status === 'final')) S.foc = (featured()[0] || list[0] || {}).id;
  if (S.brk && byId(S.foc)?.tour) return `<div class="pad brk-full">${bracketSheet(byId(S.foc)).replace('class="det sheet', 'class="brk-page').replace(' open"', '"')}</div>`;
  const feat = featured();
  const lives = M.filter((m) => m.live).sort((a, b) => (window.GM_QUIEN ? GM_QUIEN.ord(a, b) : whoOn(b.id).length - whoOn(a.id).length)).slice(0, 14);
  let h = `<div class="p-wrap"><section class="p-board ${S.soloJug ? 'solo-jug' : ''}" data-keep="pb">
    ${lives.length ? vivosHtml(lives) : ''}
    ${feat.length ? `<div class="feat">${feat.map((m) => `<button class="ft ${S.foc === m.id ? 'on' : ''}" data-foc="${m.id}">
      <span class="lab"><img src="${esc(L[m.lg][1])}" alt=""><b>${WD(m.at)} ${HM(m.at)}</b> · ${isDaily(m) ? 'Apuesta del día' : esc(m.tag || L[m.lg][0])}</span>
      <span class="ft-v">${logo(m, 'a')}<i>vs</i>${logo(m, 'b')}</span><span class="ft-n">${esc(m.a)} · ${esc(m.b)}</span>
      <span class="ft-o">${picksOf(m).map((p) => `<span>${p} <b>${po(m, p) ? O(po(m, p)) : '·'}</b></span>`).join('')}</span></button>`).join('')}</div>` : ''}
    ${jugMenu(list.length)}<nav class="fil">${filt()}</nav>${leagues()}${window.GM_F1 && S.f === 'r' ? GM_F1.cabeza() : ''}${S.soloJug ? '' : '<p class="cmb-hint"><i>+</i><span>Toca 2 o más cuotas y en el boleto elige <b>Combinada</b>: las cuotas se multiplican y cobras si aciertas todas.</span></p>'}`;
  if (!list.length && !S.soloJug) h += `<p class="hint" style="padding:30px 0">No hay partidos con este filtro en los próximos días.</p>`;
  const jugH = jugadosHtml();
  if (S.soloJug && !jugH) h += `<p class="hint" style="padding:30px 0">No hay partidos jugados con este filtro.</p>`;
  let ri = 0;
  for (const ms of S.soloJug ? [] : groups(list)) {
    h += `<div class="day"><b>${DD(ms[0].at)}</b><span>${dayLab(ms[0].at)}</span><i>${ms.length} ${ms.length > 1 ? 'partidos' : 'partido'}</i></div>`;
    for (const m of ms) {
      const open = isOpen(m), qn = window.GM_QUIEN ? GM_QUIEN.fila(m) : { cls: '', who: '', movil: '' };
      h += `<div class="row ${S.foc === m.id ? 'on' : ''} ${m.live && m.vivo ? 'cv' : ''} ${m.live ? 'envivo' : ''} ${qn.cls}" data-foc="${m.id}" style="--i:${Math.min(ri++, 14)}">
        <span class="t">${m.live ? '<em>VIVO</em>' : HM(m.at)}${m.live ? (m.vivo ? '' : `<small class="sc">${esc(String(m.score || '').split(' ')[0])}</small>`) : Date.parse(m.at) <= NOW ? `<small class="pe">${m.s === 'r' ? 'en juego' : 'por empezar'}</small>` : `<small>${CD(m.at)}</small>`}</span>
        <span class="llw" title="${esc(L[m.lg][0])} · ${SP[m.s][0]}"><img class="ll" src="${esc(L[m.lg][1])}" alt="" loading="lazy">${m.s === 'c' || m.s === 'v' ? `<img class="lls" src="${SP[m.s][1]}" alt="">` : ''}</span>
        <span class="tms"><span class="tm">${logo(m, 'a')}<span>${esc(m.a)}</span>${esFav(favK(m.s, m.a)) || esFav('pa:' + m.id) ? `<i class="fav-i">${IC_FAV}</i>` : ''}${dailyTag(m)}${vN(m, 'a')}</span><span class="tm">${logo(m, 'b')}<span>${esc(m.b)}</span>${esFav(favK(m.s, m.b)) ? `<i class="fav-i">${IC_FAV}</i>` : ''}${vN(m, 'b')}</span>${vL(m)}${qn.movil}</span>
        <span class="who">${window.GM_QUIEN ? qn.who : [...new Set(whoOn(m.id).map((x) => x.f))].map((k) => av(k, 'sm')).join('')}</span>
        ${window.GM_F1 && GM_F1.es(m) ? GM_F1.cuotasFila(m, open) : ['1', 'X', '2'].map((p) => oddBtn(m, p, open)).join('')}
      </div>`;
    }
  }
  return h + jugH + `</section>${byId(S.foc) ? ficha(byId(S.foc)) : '<section class="det"></section>'}</div>`;
}
function ficha(m) {
  if (window.GM_F1 && GM_F1.es(m)) return GM_F1.ficha(m);   // F1 (f1.js): un Gran Premio no es A contra B
  if (S.brk && m.tour) return bracketSheet(m);
  if (S.side) return sheet(m, S.side);
  const open = isOpen(m), ps = picksOf(m).filter((p) => po(m, p) != null);
  const imp = ps.map((p) => 1 / po(m, p)), sum = imp.reduce((a, b) => a + b, 0) || 1, pct = imp.map((x) => Math.round((x / sum) * 100));
  const sel = S.sel && S.sel.m === m.id;
  const cell = (v) => (String(v).startsWith('F:') ? form(String(v).slice(2)) : esc(v));
  let h = `<section class="det ${S.sheet ? 'open' : ''}" data-keep="dt">
    <button class="det-x" data-act="close">← Partidos</button>
    ${open && window.GM_RETOS ? `<div class="d-ret">${GM_RETOS.btn(m, 'grande')}</div>` : ''}
    ${window.GM_ACTIVOS ? GM_ACTIVOS.arriba(m) : ''}
    <div class="d-meta"><span class="d-sp"><img src="${SP[m.s][1]}" alt="">${SP[m.s][0]}</span><img src="${esc(L[m.lg][1])}" alt="">${esc(L[m.lg][0])}${m.stage ? ' · ' + esc(m.stage) : ''}</div>
    ${m.tour ? `<button class="d-brk" data-act="bracket"><svg viewBox="0 0 24 24"><path d="M4 5h5v5H4zM4 14h5v5H4zM9 7.5h3v9H9M12 12h3M15 9.5h5v5h-5z"/></svg>Ver bracket</button>` : ''}
    ${mainTv(m) ? `<a class="d-ver" href="${esc(mainTv(m).u)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></svg>${m.live ? 'Verlo en directo' : 'Dónde verlo'} · ${esc(mainTv(m).n)}${mainTv(m).l ? ' en ' + esc(LANG[mainTv(m).l] || mainTv(m).l) : ''}</a>` : ''}
    <div class="d-cd">${m.live ? `En vivo · ${esc(m.score || '')}` : `${WD(m.at)} ${DD(m.at)} ${MO(m.at)} · ${HM(m.at)} · empieza en ${CD(m.at)}`}${m.venue ? ' · ' + esc(m.venue) : ''}</div>
    <div class="d-vs"><button class="d-side" data-side="a" title="Ver ficha">${logo(m, 'a')}<h3>${esc(m.a)}</h3><small>Ver ficha</small></button><span class="x">vs</span><button class="d-side" data-side="b" title="Ver ficha">${logo(m, 'b')}<h3>${esc(m.b)}</h3><small>Ver ficha</small></button></div>
    <div class="d-favs">${favBtn(favEq(m, 'a'))}${favBtn(favPa(m), 'Seguir el partido')}${favBtn(favEq(m, 'b'))}</div>
    ${m.tag ? `<div class="d-tag">${esc(m.tag)}</div>` : ''}
    ${isDaily(m) ? `<div class="d-daily">${STAR}Apuesta del día${DAILY_ON ? ` · si aciertas cobras ×${O(DAILY_BONUS)}` : ' · el extra lo enciende PM'}</div>` : ''}
    ${m.tape.length ? `<div class="tape">${m.tape.map(([a, k, b]) => `<div class="tp"><span>${cell(a)}</span><span class="k">${esc(k)}</span><span>${cell(b)}</span></div>`).join('')}</div>` : ''}
    ${ps.length ? `<div class="prob">${ps.map((p, i) => `<i style="flex:${pct[i]}" class="${isSel(m, p) ? 'on' : ''}"></i>`).join('')}</div>
    <div class="prob-l">${ps.map((p, i) => `<span>${esc(p === 'X' ? 'empate' : pn(m, p))} ${pct[i]}%</span>`).join('')}</div>` : ''}
    <div class="picks ${open ? '' : 'closed'}" style="--n:${Math.max(1, ps.length)}">${ps.map((p) => `<button class="pk ${isSel(m, p) ? 'on' : ''} ${isMine(m, p) ? 'mine' : ''}" data-pick="${m.id}|${p}" ${open ? '' : 'disabled'}><span class="k">${p === 'X' ? 'X · EMPATE' : p + ' · GANA'}</span><span class="n">${esc(pn(m, p))}</span><b>${O(po(m, p))}</b></button>`).join('')}</div>
    <p class="hint" style="margin-top:10px">${m.src === 'draftkings' ? 'Cuotas reales de DraftKings' : 'Cuotas calculadas con la forma y el récord'} · se congelan al apostar</p>`;
  // en directo (db/031): directo.js rellena el hueco con las cuotas en vivo; si no hay, deja el aviso de cerrado
  if (!open) h += m.status === 'final' ? `<p class="hint">${LOCK}Final ${esc(String(m.score || '').split(' ')[0])}. Ya se ha pagado.</p>` : m.live ? `<div class="lv-ap" data-lvap="${esc(m.id)}"><p class="hint">${LOCK}Cerrado: ya ha empezado. Se paga solo al acabar.</p></div>` : `<p class="hint">${LOCK}Cerrado: ya ha empezado. Se paga solo al acabar.</p>`;
  else if (!sel) h += `<p class="hint">Elige ${ps.length > 2 ? '1, X o 2' : '1 o 2'} para apostar.</p>`;
  else {
    const o = po(m, S.sel.p), st = stakeNow(), pv = ((st / Math.max(1, me().s)) * 100).toFixed(1);
    if (me().s < 1) h += `<p class="hint sin-saldo">${me().s < 0 ? `Estás en negativo (<span class="neg-s">${N(me().s)}</span>): no puedes apostar hasta volver a tener saldo.` : 'No te queda saldo para apostar.'} La paga del lunes llega sola.</p>`;
    else h += `<div class="stk"><span class="lab">Apuestas</span><b data-sv>${N(st)}${coin()}</b>
      <input type="range" id="stake" min="1" max="${Math.max(1, me().s)}" step="1" value="${st}" data-in style="--p:${pv}%" aria-label="Cuánto apuestas"><div class="chips">${chips()}</div></div>
      <div class="ret"><span>Si aciertas con <em>${esc(pn(m, S.sel.p))} ${O(o)}</em></span><b data-ret>${N(st * o)}${coin()}</b></div>
      <div class="ret2" data-gain>${N(st * o - st)} limpias</div>
      <button class="go" data-act="bet" data-go ${st < 1 ? 'disabled' : ''}>Apostar ${N(st)}</button>`;
  }
  const mineHere = myBetsOn(m.id);
  if (mineHere.length) h += `<div class="d-mine"><span class="lab">Tus apuestas aquí</span>${mineHere.map((b) => `<div class="dm" data-bet="${b.id}"><strong>${esc(pn(m, b.p))} <em>${O(b.o)}</em></strong><span>${N(b.stake)} → <b>${N(b.stake * b.o)}${coin()}</b></span><button class="x-share" data-share="${b.id}">Al chat</button>${cancelBtn(b)}</div>`).join('')}</div>`;
  h += `<div id="espn-box" class="espn" data-m="${m.id}">${m.espn ? ESPN_HTML.get(m.id) || (window.GM_FP && (m.s === 'f' || m.s === 'b') ? GM_FP.esqueleto(m) : '<p class="hint">Cargando datos de ESPN…</p>') : tvHtml(m.tv || [], m)}</div>`;
  const rts = CH.filter((c) => c.m === m.id);
  if (rts.length) h += `<div class="d-retos">${retosHtml(rts, '')}</div>`;
  const ws = whoOn(m.id);
  h += `<div class="d-fr"><span class="lab">Amigos en este partido</span>${[...F].sort((a, b) => (b.me - a.me)).map((f) => {
    const x = ws.filter((y) => y.f === f.id);
    const st = !x.length ? `<span class="st">aún no ha apostado</span>` : x.map((y) => (y.p ? `<span class="st rev">${esc(pn(m, y.p))} ${O(y.o)} · ${N(y.stake)}${coin()}</span>` : `<span class="st">${LOCK}${N(y.stake)} · se ve a las ${HM(m.at)}</span>`)).join(' ');
    return `<div class="ifr">${av(f.id)}<span class="nm">${esc(f.n)}</span>${st}</div>` }).join('')}</div></section>`;
  return h;
}

/* ---------- Mis apuestas ---------- */
// PM, 30-10: "rework de My bets, se ve terrible" y luego "quiero que se vea mejor, un estilo NUEVO, se ve muy feo y simple":
// estilo casa de apuestas. Arriba el balance y la curva de beneficio; lo abierto en boletos con muesca, codigo y escudos
// con halo; lo resuelto en boletos pequenos con su sello (COBRADA verde, PERDIDA roja); entran con una animacion suave
const perd = (b) => (b.cash ? b.stake - b.pay : b.stake);   // lo que se pierde de verdad (en un cash out con perdida, solo la diferencia)
const neto = (b) => (b.st === 'won' ? b.pay - b.stake : b.st === 'lost' ? -perd(b) : 0);
const signo = (v) => `${v > 0 ? '▲' : v < 0 ? '▼' : ''} ${N(Math.abs(v))}`.trim();
const SPC = { f: '#2bd47d', v: '#ff4655', c: '#f5a524', u: '#e0464f', b: '#f58426', r: '#e10600' };
const codigo = (b) => 'Nº ' + String(b.id).padStart(6, '0');
function mbCard(b, i) {
  const m = byId(b.m); if (!m) return '';
  const t0 = Date.parse(b.at), t1 = Date.parse(m.at), fill = m.live ? 100 : Math.max(3, Math.min(100, ((NOW - t0) / Math.max(1, t1 - t0)) * 100));
  const lado = (s) => { const on = b.p === (s === 'a' ? '1' : '2') || !!(window.GM_MK && GM_MK.es(b.p) && GM_MK.lado(b.p) === (s === 'a' ? '1' : '2'));
    return `<div class="bol-t ${on ? 'on' : ''}"><span class="bol-cr">${logo(m, s)}</span><b>${esc(s === 'a' ? m.a : m.b)}</b>${vN(m, s)}<em>${on ? '★ tu apuesta' : ''}</em></div>` };
  const [sg, ...sr] = String(m.score || '0:0').split(/\s+/), sdet = sr.join(' ').replace(/^[·(]\s*|\)$/g, '');
  const mid = m.live ? `<span class="bol-sc">${m.vivo ? vL(m) || '·' : `${esc(sg)}<small>${sdet ? esc(sdet) : m.s === 'v' || m.s === 'c' ? 'mapas' : 'marcador'}</small>`}</span>` : b.p === 'X' ? '<span class="bol-x on">EMPATE<em>★ tu apuesta</em></span>' : window.GM_MK && GM_MK.es(b.p) ? `<span class="bol-x on mq-bol"><b data-notr>${esc(pn(m, b.p))}</b>${GM_MK.lado(b.p) ? '' : '<em>★ tu apuesta</em>'}</span>` : '<span class="bol-x">VS</span>';
  return `<article class="bol ${m.live ? 'live' : ''}" data-goto="${m.id}" style="--sc:${SPC[m.s]};--i:${i}">
    <header><img class="tl" src="${esc(L[m.lg]?.[1] || '')}" alt="" loading="lazy"><span class="bol-lg">${esc(corto(L[m.lg]?.[0] || ''))}</span>${dailyTag(m)}<span class="bol-no">${codigo(b)}</span></header>
    ${m.live ? '<span class="bol-live"><i></i>EN VIVO</span>' : ''}
    <div class="bol-vs">${lado('a')}${mid}${lado('b')}</div>
    <div class="bol-cut"></div>
    <div class="bol-n"><span><small>Cuota</small><b>${O(b.o)}</b></span><span><small>Apostado</small><b>${N(b.stake)}${coin()}</b></span><span class="bol-co"><small>Cobrarías</small><b>${N(b.stake * b.o)}${coin()}</b></span>${canCancel(b) ? cancelBtn(b) : ''}</div>
    <div class="bol-time"><span class="bol-bar"><i style="width:${fill.toFixed(1)}%"></i></span><span class="bol-cd"><span>${m.live ? '<b>en juego</b>' : `empieza en <b>${CD(m.at)}</b>`}</span><small>${WD(m.at)} ${DD(m.at)} ${MO(m.at)} · ${HM(m.at)}</small></span></div>
  </article>`;
}
function mbFila(b, i) {
  if (window.GM_RES) { const h = GM_RES.apuesta(b, { i }); if (h) return h }   // PM 01-11: franja de color, escudo de fondo y cuadrados (resultado.js)
  const m = byId(b.m); if (!m) return '';
  const t = Date.parse(b.set || b.at), v = neto(b);
  const cr = (s, p) => `<span class="bor-cr ${b.p === p ? 'on' : ''}">${logo(m, s)}</span>`;
  const sello = b.cash ? `RETIRADA<b>${v >= 0 ? '▲' : '▼'} ${N(Math.abs(v))}${coin()}</b>` : b.st === 'won' ? `COBRADA<b>▲ ${N(v)}${coin()}</b>` : b.st === 'lost' ? `PERDIDA<b>▼ ${N(b.stake)}${coin()}</b>` : `ANULADA<b>${N(b.stake)}${coin()}</b>`;
  return `<article class="bor ${b.st}" data-goto="${m.id}" style="--sc:${SPC[m.s]};--i:${i}">
    <header><img class="tl" src="${esc(L[m.lg]?.[1] || '')}" alt="" loading="lazy"><span>${DD(t)} ${MO(t)} · ${HM(t)}</span><span class="bol-no">${codigo(b)}</span></header>
    <div class="bor-vs">${cr('a', '1')}<b>${esc(m.a)}</b><i>${esc(m.score || 'vs')}</i><b>${esc(m.b)}</b>${cr('b', '2')}</div>
    <p class="bor-p"><img class="mb-spi" src="${SP[m.s][1]}" alt="">${esc(pn(m, b.p))} · ${O(b.o)} · ${N(b.stake)}${coin()} apostados</p>
    <span class="bor-sello">${sello}</span>
  </article>`;
}
// la curva de beneficio: cada punto una apuesta resuelta, en orden; verde por encima de cero, rojo por debajo
function mbCurva(res) {
  const xs = [...res].sort((a, b) => Date.parse(a.set || a.at) - Date.parse(b.set || b.at));
  if (xs.length < 2) return `<p class="hint mb2-nada">La curva sale cuando tengas dos apuestas resueltas.</p>`;
  let acc = 0; const pts = [0, ...xs.map((b) => (acc += neto(b)))];
  const mov = matchMedia('(max-width:860px)').matches, W = mov ? 360 : 640, H = mov ? 210 : 220, x0 = 46, x1 = W - (mov ? 54 : 40), yT = 22, yB = H - 34, mx = Math.max(10, ...pts), mn = Math.min(-10, ...pts), X = (i) => x0 + ((x1 - x0) * i) / (pts.length - 1), Y = (v) => yT + ((mx - v) * (yB - yT)) / (mx - mn), z = Y(0);
  const line = pts.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' '), area = `${X(0)},${z} ${line} ${X(pts.length - 1)},${z}`;
  const fin = pts[pts.length - 1], best = Math.max(...pts), worst = Math.min(...pts);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Beneficio acumulado"><defs>
    <clipPath id="mb-up"><rect x="0" y="0" width="${W}" height="${z}"/></clipPath><clipPath id="mb-dn"><rect x="0" y="${z}" width="${W}" height="${H - z}"/></clipPath>
    <linearGradient id="mb-gu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2bd47d" stop-opacity=".4"/><stop offset="1" stop-color="#2bd47d" stop-opacity="0"/></linearGradient>
    <linearGradient id="mb-gd" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#e0646f" stop-opacity=".4"/><stop offset="1" stop-color="#e0646f" stop-opacity="0"/></linearGradient></defs>`;
  for (const v of [mx, mn]) if (Math.abs(Y(v) - z) > 18) s += `<line x1="${x0}" x2="${x1}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--hair)"/><text x="${x0 - 10}" y="${Y(v) + 4}" class="tx-d" font-size="11" text-anchor="end">${signo(v)}</text>`;
  s += `<line x1="${x0}" x2="${x1}" y1="${z}" y2="${z}" stroke="var(--mute)" stroke-dasharray="3 4"/><text x="${x0 - 10}" y="${z + 4}" class="tx-m" font-size="11" text-anchor="end">0</text>`;
  s += `<polygon points="${area}" fill="url(#mb-gu)" clip-path="url(#mb-up)"/><polygon points="${area}" fill="url(#mb-gd)" clip-path="url(#mb-dn)"/>`;
  s += `<polyline points="${line}" fill="none" stroke="#2bd47d" stroke-width="2.6" stroke-linejoin="round" clip-path="url(#mb-up)"/><polyline points="${line}" fill="none" stroke="#e0646f" stroke-width="2.6" stroke-linejoin="round" clip-path="url(#mb-dn)"/>`;
  xs.forEach((b, i) => { const v = pts[i + 1], m = byId(b.m); s += `<circle cx="${X(i + 1).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="${pts.length > 40 ? 2.4 : 4}" fill="${b.st === 'won' ? '#2bd47d' : '#e0646f'}" stroke="var(--bg)" stroke-width="2"><title>${esc(m ? pn(m, b.p) : '')} · ${b.st === 'won' ? '▲ ' + N(b.pay - b.stake) : '▼ ' + N(b.stake)} · total ${signo(v)}</title></circle>` });
  s += `<text x="${X(pts.length - 1) + 12}" y="${Y(fin) + 5}" class="${fin >= 0 ? 'tx-g' : 'tx-r'}" font-size="15" font-weight="600">${signo(fin) || '0'}</text>`;
  s += `<text x="${x0}" y="${H - 6}" class="tx-d" font-size="11">primera</text><text x="${x1}" y="${H - 6}" class="tx-d" font-size="11" text-anchor="end">última · ${xs.length} apuestas</text></svg>`;
  return `<div class="chart mb2-chart">${s}</div><p class="mb2-ch"><span>mejor momento <b class="g">${signo(best) || '0'}</b></span><span>peor momento <b class="r">${signo(worst) || '0'}</b></span></p>`;
}
function apuestas() {
  if (window.GM_MIS) return GM_MIS.html();   // PM 01-11: un solo diseno nuevo, lo tuyo en juego primero (misapuestas.js); lo de abajo queda por si no carga
  const mine = ALL.filter((b) => b.k === MEK && byId(b.m));
  const open = mine.filter((b) => b.st === 'open').sort((a, b) => (byId(b.m).live - byId(a.m).live) || Date.parse(byId(a.m).at) - Date.parse(byId(b.m).at));
  const set = mine.filter((b) => b.st !== 'open').sort((a, b) => Date.parse(b.set || b.at) - Date.parse(a.set || a.at)), res = set.filter((b) => b.st !== 'void'), won = res.filter((b) => b.st === 'won');
  const enJuego = open.reduce((a, b) => a + b.stake, 0), cobrable = open.reduce((a, b) => a + b.stake * b.o, 0), ben = res.reduce((a, b) => a + neto(b), 0), apostado = res.reduce((a, b) => a + b.stake, 0);
  const vivas = open.filter((b) => byId(b.m).live).length, f = me(), best = won.length ? Math.max(...won.map((b) => b.o)) : 0;
  const deps = DEP.filter((k) => set.some((b) => byId(b.m).s === k)), sp = deps.includes(S.bsp) ? S.bsp : 'all';
  const ests = [['all', 'Todas'], ['won', 'Ganadas'], ['lost', 'Perdidas'], ['void', 'Anuladas']].filter(([k]) => k === 'all' || set.some((b) => b.st === k));
  const bf = ests.some(([k]) => k === S.bf) ? S.bf : 'all';
  const list = set.filter((b) => (bf === 'all' || b.st === bf) && (sp === 'all' || byId(b.m).s === sp));
  const POR = 9, pags = Math.max(1, Math.ceil(list.length / POR)), pg = Math.min(S.bp || 0, pags - 1);
  const misRetos = CH.filter((c) => (window.GM_RETOS ? GM_RETOS.dentro(c) : c.from === MEK || c.to === MEK));
  return `<div class="pad mb mb2">
    <section class="mb2-hero">
      <div class="mb2-nums">
        <div><span class="lab">En juego</span><b class="num">${N(enJuego)}${coin()}</b><small>${open.length} ${open.length === 1 ? 'apuesta abierta' : 'apuestas abiertas'}${vivas ? ` · ${vivas} en vivo` : ''}</small></div>
        <div class="co"><span class="lab">Cobrable</span><b class="num">${N(cobrable)}${coin()}</b><small>si aciertas todo · ${signo(cobrable - enJuego)} limpias</small></div>
        <div class="${ben > 0 ? 'up' : ben < 0 ? 'dn' : ''}"><span class="lab">Beneficio</span><b class="num">${ben ? `<i class="ar">${ben > 0 ? '▲' : '▼'}</i>${N(Math.abs(ben))}${coin()}` : '0'}</b><small>${res.length ? `${apostado ? 'ROI ' + Math.round((ben / apostado) * 100) + '% · ' : ''}${res.length} ${res.length === 1 ? 'resuelta' : 'resueltas'}` : 'sale con la primera resuelta'}</small></div>
      </div>
      <div class="mb2-curva"><div class="mb2-ct"><h3>Tu beneficio</h3><p class="mb-tags"><span>aciertos <b>${f.ac}</b></span><span>racha <b>${f.racha}</b></span><span>mejor cuota <b>${best ? O(best) : '·'}</b></span></p></div>${mbCurva(res)}</div>
    </section>
    <div class="sec-h mb-h"><h2>En juego</h2><i>${open.length}</i></div>
    ${open.length ? `<div class="mb-cs">${open.map(mbCard).join('')}</div>` : '<p class="hint mb-vacio">Nada en juego. Ve a Partidos y toca una cuota.</p>'}
    <div id="cmb-slot"></div>${'' /* combinadas.js pinta aqui tus combinadas (db/029) */}
    ${misRetos.length ? `<div class="sec-h mb-h"><h2>Tus retos</h2><i>${misRetos.length}</i></div>${retosHtml(misRetos.slice(0, 12), '')}` : ''}
    <div class="sec-h mb-h"><h2>Resueltas</h2><i>${set.length}</i></div>
    ${set.length ? `<nav class="mb-fil"><span class="mb-fg">${ests.map(([k, n]) => `<button class="chip ${bf === k ? 'on' : ''}" data-bf="${k}">${n} <i>${k === 'all' ? set.length : set.filter((b) => b.st === k).length}</i></button>`).join('')}</span>
      ${deps.length > 1 ? `<span class="mb-fg">${[['all', 'Todo', null], ...deps.map((k) => [k, ...SP[k]])].map(([k, n, im]) => `<button class="f ${sp === k ? 'on' : ''}" data-bsp="${k}">${im ? `<img src="${im}" alt="">` : ''}${n}</button>`).join('')}</span>` : ''}</nav>` : ''}
    ${list.length ? `<div class="mb-rs2">${list.slice(pg * POR, pg * POR + POR).map(mbFila).join('')}</div>` : `<p class="hint">${set.length ? 'Nada con este filtro.' : 'Todavía nada. Cuando acabe un partido en el que hayas apostado, sale aquí.'}</p>`}
    ${pags > 1 ? `<nav class="pags"><button data-bp="${pg - 1}" ${pg ? '' : 'disabled'} aria-label="Anterior">‹</button>${Array.from({ length: pags }, (_, i) => `<button data-bp="${i}" class="${i === pg ? 'on' : ''}">${i + 1}</button>`).join('')}<button data-bp="${pg + 1}" ${pg < pags - 1 ? '' : 'disabled'} aria-label="Siguiente">›</button></nav>` : ''}
  </div>`;
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
      <div class="du-s">${ks.map((k) => `<div class="du-g">${k === 'X' ? '<span class="du-x">X</span>' : logo(m, k === '1' ? 'a' : 'b')}<div><strong>${esc(pn(m, k))}</strong><span>${g[k].map((w) => av(w.f, 'sm')).join('')}<em>${N(g[k].reduce((a, w) => a + w.stake, 0))}${coin()}</em></span></div></div>`).join('<i>vs</i>')}</div></div>`;
  }).join('');
  return rows || `<p class="hint">Sin duelos a la vista.${VIS === 'kick' ? ' Se descubren al empezar cada partido.' : ''}</p>`;
}
function betCard(f, b) {
  const m = byId(b.m), left = Date.parse(m.at) - NOW, fill = m.live ? 100 : Math.max(4, 100 - (left / (72 * 36e5)) * 100);
  return `<div class="bc ${m.live ? 'live' : ''}" data-goto="${m.id}">
    <div class="bc-t"><b>${m.live ? 'EN VIVO' : CD(m.at)}</b><span>${m.live ? esc(m.score || '') : WD(m.at) + ' ' + DD(m.at) + ' · ' + HM(m.at)}</span></div>
    <div class="bc-m">${logo(m, 'a')}<span>${esc(m.a)}</span><i>vs</i><span>${esc(m.b)}</span>${logo(m, 'b')}</div>
    <div class="bc-p">${b.p ? `<strong>${esc(pn(m, b.p))}</strong><em>${O(b.o)}</em>` : `<strong class="hid">${LOCK}Oculta</strong><em>hasta las ${HM(m.at)}</em>`}<span>${N(b.stake)} <i>→</i> <b>${b.p ? N(b.stake * b.o) : '?'}${coin()}</b></span></div>
    <span class="bc-bar" title="${m.live ? 'en juego' : 'faltan ' + CD(m.at)}"><i style="width:${fill.toFixed(1)}%"></i></span>
  </div>`;
}
const histRow = (b) => { const m = byId(b.m); if (!m) return ''; const t = Date.parse(b.at);
  const [c, r] = b.cash ? [b.pay >= b.stake ? 'h-g' : 'h-p', 'RETIRADA ' + N(b.pay) + coin()] : b.st === 'won' ? ['h-g', '▲ ' + N(b.pay) + coin()] : b.st === 'lost' ? ['h-p', '▼ ' + N(b.stake) + coin()] : b.st === 'void' ? ['h-e', 'anulada'] : [m.live ? 'h-o h-live' : 'h-o', m.live ? 'EN VIVO' : 'EN JUEGO'];
  return `<div class="hst ${c}" data-goto="${m.id}"><span class="hd">${DD(t)} ${MO(t)}<small>${HM(t)}</small></span><img class="tl" src="${esc(L[m.lg]?.[1] || '')}" alt="" loading="lazy"><span class="hm"><strong>${esc(m.a)} vs ${esc(m.b)}</strong><small>${b.p ? esc(pn(m, b.p)) + ' · ' + O(b.o) : 'oculta hasta empezar'} · ${N(b.stake)}${coin()} apostados</small></span><b>${r}</b></div>` };
function historial(f) {
  // PM, 01-11: "en history tambien lo de las flechas: despues de 6 bets que haya flechas"
  const bs = ALL.filter((b) => b.k === f.id && byId(b.m)).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)), POR = 6, pags = Math.max(1, Math.ceil(bs.length / POR)), pg = Math.min(S.hp || 0, pags - 1);
  const g = bs.filter((b) => b.st === 'won'), pe = bs.filter((b) => b.st === 'lost'), neto = g.reduce((a, b) => a + b.pay - b.stake, 0) - pe.reduce((a, b) => a + perd(b), 0);
  return `<section class="cs" id="historial"><div class="cs-h"><div><h3>Historial</h3><p>${bs.length} apuestas · ${g.length} ganadas · ${pe.length} perdidas · ${neto >= 0 ? '▲' : '▼'} ${N(Math.abs(neto))}${coin()} en total</p></div></div>
    <div class="hsts">${bs.slice(pg * POR, pg * POR + POR).map(histRow).join('') || '<p class="hint">Todavía no ha apostado.</p>'}</div>
    ${pags > 1 ? `<nav class="pags"><button data-hp="${pg - 1}" ${pg ? '' : 'disabled'} aria-label="Anterior">‹</button><span class="pags-n" data-notr>${pg + 1} / ${pags}</span><button data-hp="${pg + 1}" ${pg < pags - 1 ? '' : 'disabled'} aria-label="Siguiente">›</button></nav>` : ''}</section>`;
}
// PM, 30-10: "all bets lo quiero mejor, esta raro y feo" y "que se vea con que equipo van":
// arriba los jugadores; luego cada partido con sus opciones y las caras de quien va con cada una; al final lo resuelto
// PM, 30-10: "que se vean en All bets todas las bets, pero con paginas y tal": todas las apuestas de todos y de siempre,
// lo mas nuevo arriba, 12 por pagina, filtros por jugador, estado y deporte. Se piden por paginas a la base (bets_page,
// db/026); si esa funcion aun no esta, se pagina en el navegador lo que ya trae get_state
const AB_POR = 12;
let ABP = null, cargandoAbp = null;
const abMap = (b) => ({ id: b.id, k: kDe(b.player), m: b.match, p: b.pick, stake: b.stake, o: Number(b.odds), st: b.status, pay: b.payout, at: b.created, set: b.settled });
const abEst = (b) => { const m = byId(b.m); return b.st === 'open' ? (m?.live ? 'live' : 'open') : b.st };
const abFiltra = (f) => ALL.filter((b) => byId(b.m) && (!f.k || b.k === f.k) && (!f.sp || byId(b.m).s === f.sp) && (!f.st || abEst(b) === f.st)).sort((x, y) => Date.parse(y.at) - Date.parse(x.at) || y.id - x.id);
async function cargaAbp() {
  const f = S.abf || {}, pg = S.abpg || 0, key = JSON.stringify([f.k || '', f.st || '', f.sp || '', pg, ALL.length, ALL.filter((b) => b.st !== 'open').length]);
  if (ABP?.key === key || cargandoAbp === key || ABP?.srv === false) return;
  cargandoAbp = key;
  const { data, error } = await db.rpc('bets_page', { p_player: f.k ? fr(f.k).uid : null, p_status: f.st || null, p_sport: f.sp || null, p_offset: pg * AB_POR, p_limit: AB_POR });
  cargandoAbp = null;
  ABP = error ? { key, srv: false } : { key, srv: true, total: data?.total || 0, rows: (data?.rows || []).map(abMap).filter((b) => b.k) };
  if (S.scr === 'colegas') render();
}
function abTicket(b, i) {
  if (window.GM_RES) { const h = GM_RES.apuesta(b, { i, quien: true }); if (h) return h }   // como en Mis apuestas (resultado.js)
  const m = byId(b.m); if (!m) return '';
  const est = abEst(b), t = Date.parse(b.set || b.at), v = b.st === 'won' ? b.pay - b.stake : 0;
  const cr = (sd, p) => `<span class="bor-cr ${b.p === p ? 'on' : ''}">${logo(m, sd)}</span>`;
  const sello = { won: `COBRADA<b>▲ ${N(v)}${coin()}</b>`, lost: `PERDIDA<b>▼ ${N(b.stake)}${coin()}</b>`, void: `ANULADA<b>${N(b.stake)}${coin()}</b>`, cashout: `RETIRADA<b>${N(b.pay)}${coin()}</b>`, live: `EN VIVO<b>${N(b.stake * b.o)}${coin()}</b>`, open: `EN JUEGO<b>${N(b.stake * b.o)}${coin()}</b>` }[est] || '';
  return `<article class="bor abt ${est}" data-goto="${m.id}" style="--sc:${SPC[m.s]}">
    <header>${av(b.k, 'sm')}<b class="abt-n">${esc(fr(b.k).n)}</b><img class="tl" src="${esc(L[m.lg]?.[1] || '')}" alt="" loading="lazy"><span>${DD(t)} ${MO(t)} · ${HM(t)}</span></header>
    <div class="bor-vs">${cr('a', '1')}<b>${esc(m.a)}</b><i>${esc(b.st === 'open' && !m.live ? 'vs' : String(m.score || 'vs').split(' ')[0])}</i><b>${esc(m.b)}</b>${cr('b', '2')}</div>
    <p class="bor-p"><img class="mb-spi" src="${SP[m.s][1]}" alt="">${b.p ? `${esc(pn(m, b.p))} · ${O(b.o)}` : 'Oculta hasta empezar'} · ${N(b.stake)}${coin()} apostados</p>
    <span class="bor-sello">${sello}</span>
  </article>`;
}
function todasHtml() {
  const f = S.abf || {}, pg0 = S.abpg || 0;
  if (!ABP || ABP.srv !== false) setTimeout(cargaAbp, 0);
  let filas, total;
  if (ABP?.srv && ABP.key === JSON.stringify([f.k || '', f.st || '', f.sp || '', pg0, ALL.length, ALL.filter((b) => b.st !== 'open').length])) { filas = ABP.rows; total = ABP.total }
  else { const xs = abFiltra(f); total = xs.length; filas = xs.slice(pg0 * AB_POR, pg0 * AB_POR + AB_POR) }
  const pags = Math.max(1, Math.ceil(total / AB_POR)), pg = Math.min(pg0, pags - 1);
  const ests = [['', 'Todas'], ['open', 'En juego'], ['live', 'En vivo'], ['won', 'Ganadas'], ['lost', 'Perdidas'], ['void', 'Devueltas'], ['cashout', 'Retiradas']].filter(([k]) => !k || k === f.st || ALL.some((b) => abEst(b) === k));
  const deps = DEP.filter((k) => ALL.some((b) => byId(b.m)?.s === k));
  const nums = (() => { const out = [], ver = new Set([0, pags - 1, pg - 1, pg, pg + 1]); for (let i = 0; i < pags; i++) if (ver.has(i)) { if (out.length && i - out[out.length - 1] > 1) out.push('…'); out.push(i) } return out })();
  return `<div class="sec-h ab-sec"><h2>Todas las apuestas</h2><i>${N(total)} ${total === 1 ? 'apuesta' : 'apuestas'}</i></div>
    <nav class="ab-fil">
      <span class="ab-fg"><button class="ab-pl ${!f.k ? 'on' : ''}" data-abf="k|">Todos</button>${F.map((x) => `<button class="ab-pl ${f.k === x.id ? 'on' : ''}" data-abf="k|${x.id}">${av(x.id, 'sm')}<span>${esc(x.n)}</span></button>`).join('')}</span>
      <span class="ab-fg">${ests.map(([k, n]) => `<button class="chip ${(f.st || '') === k ? 'on' : ''}" data-abf="st|${k}">${n}</button>`).join('')}</span>
      ${deps.length > 1 ? `<span class="ab-fg">${[['', 'Todo', null], ...deps.map((k) => [k, ...SP[k]])].map(([k, n, im]) => `<button class="f ${(f.sp || '') === k ? 'on' : ''}" data-abf="sp|${k}">${im ? `<img src="${im}" alt="">` : ''}${n}</button>`).join('')}</span>` : ''}
    </nav>
    ${filas.length ? `<div class="mb-rs2 ab-ts">${filas.map(abTicket).join('')}</div>` : `<p class="hint">${ALL.length ? 'Nada con estos filtros.' : 'Todavía nadie ha apostado.'}</p>`}
    ${pags > 1 ? `<nav class="pags"><button data-abpg="${pg - 1}" ${pg ? '' : 'disabled'} aria-label="Anterior">‹</button>${nums.map((i) => (i === '…' ? '<span class="pags-g">…</span>' : `<button data-abpg="${i}" class="${i === pg ? 'on' : ''}">${i + 1}</button>`)).join('')}<button data-abpg="${pg + 1}" ${pg < pags - 1 ? '' : 'disabled'} aria-label="Siguiente">›</button></nav>` : ''}`;
}
function colegas() {
  if (window.GM_TODOS) return GM_TODOS.html();   // PM 01-11: modelo B, una fila por amigo (todos.js); lo de abajo queda por si no carga
  const rank = [...F].sort((a, b) => b.s - a.s), admin = me().admin;
  const abiertas = ALL.filter((b) => b.st === 'open' && byId(b.m));
  const partidos = [...new Set(abiertas.map((b) => b.m))].map(byId).sort((a, b) => (b.live - a.live) || Date.parse(a.at) - Date.parse(b.at));
  const hechas = ALL.filter((b) => (b.st === 'won' || b.st === 'lost') && byId(b.m)).sort((a, b) => Date.parse(b.set || b.at) - Date.parse(a.set || a.at)).slice(0, 12);
  const ajustes = admin ? `<div class="ab-aj"><nav class="vis"><span class="lab">Apuesta del día</span><button class="chip ${DAILY_ON ? 'on' : ''}" data-daily="true">Con extra ×${O(DAILY_BONUS)}</button><button class="chip ${!DAILY_ON ? 'on' : ''}" data-daily="false">Sin extra</button></nav><nav class="vis"><span class="lab">Elecciones</span><button class="chip ${VIS === 'open' ? 'on' : ''}" data-vis="open">Visibles</button><button class="chip ${VIS === 'kick' ? 'on' : ''}" data-vis="kick">Ocultas hasta empezar</button></nav></div>` : '';
  const gente = rank.map((f, i) => {
    const op = openOf(f.id), inP = op.reduce((a, b) => a + b.stake, 0);
    return `<button class="ab-p ${f.me ? 'me' : ''}" data-prof="${f.id}" style="--c:var(--f-${f.id})">${av(f.id, 'xl')}<span class="ab-pn"><b>${esc(f.n)}</b><small>${i + 1}º · ${f.ac !== '·' ? f.ac + ' aciertos' : 'sin resueltas'}</small></span><span class="ab-ps num">${N(f.s)}${coin()}</span><span class="ab-pj">${op.length ? `${N(inP)}${coin()} en juego · ${op.length} ${op.length === 1 ? 'apuesta' : 'apuestas'}` : 'nada en juego'}</span></button>`;
  }).join('');
  const partido = (m) => {
    const bs = abiertas.filter((b) => b.m === m.id), tot = bs.reduce((a, b) => a + b.stake, 0), ocultas = bs.filter((b) => !b.p);
    const col = (p) => {
      const x = bs.filter((b) => b.p === p);
      const cara = p === '1' ? logo(m, 'a') : p === '2' ? logo(m, 'b') : '<span class="ab-x">X</span>';
      return `<div class="ab-c ${x.length ? 'con' : ''}"><div class="ab-ct">${cara}<span class="nm">${esc(pn(m, p))}</span><em>${O(po(m, p))}</em></div>
        ${x.map((b) => `<div class="ab-b" style="--c:var(--f-${b.k})">${av(b.k, 'sm')}<b data-prof="${b.k}">${esc(fr(b.k).n)}</b><span>${N(b.stake)} <i>→</i> <em>${N(b.stake * b.o)}${coin()}</em></span>${b.k !== MEK && isOpen(m) ? `<button class="sumo" data-sumo="${m.id}|${p}">Me sumo</button>` : ''}<div class="ab-rx">${rxHtml('b:' + b.id)}</div></div>`).join('') || '<p class="ab-nadie">nadie</p>'}</div>`;
    };
    return `<article class="ab-m ${m.live ? 'live' : ''}">
      <header data-goto="${m.id}"><img class="tl" src="${esc(L[m.lg]?.[1] || '')}" alt="" loading="lazy"><span class="ab-lg">${esc(L[m.lg]?.[0] || '')}</span><b>${m.live ? 'EN VIVO ' + esc(m.score || '') : `${WD(m.at)} ${HM(m.at)} · faltan ${CD(m.at)}`}</b><em>${N(tot)}${coin()} en juego</em></header>
      <div class="ab-cols n${picksOf(m).length}">${picksOf(m).map(col).join('')}</div>
      ${ocultas.length ? `<p class="ab-oc">${LOCK}${ocultas.map((b) => esc(fr(b.k).n)).join(', ')} ya ${ocultas.length > 1 ? 'han' : 'ha'} apostado: se ve al empezar</p>` : ''}
    </article>`;
  };
  const hecha = (b) => { const m = byId(b.m), w = b.st === 'won';
    return `<div class="ab-r ${w ? 'g' : 'p'}" data-goto="${m.id}">${av(b.k, 'sm')}<span class="tx"><b>${esc(fr(b.k).n)}</b> ${w ? 'acertó' : 'falló'} con <em>${esc(pn(m, b.p))} ${O(b.o)}</em><small>${esc(m.a)} vs ${esc(m.b)} · ${esc(L[m.lg]?.[0] || '')}</small></span><b class="amt">${w ? '▲ ' + N(b.pay) : '▼ ' + N(b.stake)}${coin()}</b></div>` };
  const retosAbiertos = CH.filter((c) => c.st === 'pending' || c.st === 'accepted');
  return `<div class="cg ab">${ajustes}
    <div class="ab-gente">${gente}</div>
    <div class="sec-h ab-sec"><h2>En juego</h2><i>${abiertas.length} ${abiertas.length === 1 ? 'apuesta' : 'apuestas'} · ${partidos.length} ${partidos.length === 1 ? 'partido' : 'partidos'}</i></div>
    ${partidos.map(partido).join('') || '<p class="hint">Nadie tiene nada en juego. Se apuesta desde Partidos.</p>'}
    <div id="cmb-todos"></div>
    ${CH.length ? `<div class="sec-h ab-sec"><h2>Retos</h2><i>${retosAbiertos.length} abiertos</i></div>${retosHtml(CH.slice(0, 10), '')}` : ''}
    ${todasHtml()}
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
  const mx = nice(Math.max(...list.flatMap((f) => f.h), ...g) * 1.15), lo = Math.min(0, ...list.flatMap((f) => f.h)), mn = lo < 0 ? -nice(-lo * 1.15) : 0;
  const X = (i) => x0 + ((x1 - x0) * i) / Math.max(1, n - 1), Y = (v) => H - 34 - ((H - 60) * (v - mn)) / (mx - mn);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Saldo semana a semana">`;
  if (mn < 0) s += `<line x1="${x0}" x2="${x1}" y1="${Y(mn)}" y2="${Y(mn)}" stroke="var(--hair)"/><text x="${x0 - 12}" y="${Y(mn) + 4}" class="tx-d" font-size="11" text-anchor="end">−${(-mn / 1000).toFixed(-mn % 1000 ? 1 : 0).replace('.', ',')}k</text>`;
  for (let k = 0; k <= 3; k++) { const v = (mx / 3) * k; s += `<line x1="${x0}" x2="${x1}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--hair)"/><text x="${x0 - 12}" y="${Y(v) + 4}" class="tx-d" font-size="11" text-anchor="end">${v ? (v / 1000).toFixed(v % 1000 ? 1 : 0).replace('.', ',') + 'k' : '0'}</text>` }
  if (list.length === 1) { const f = list[0], pts = f.h.map((v, i) => `${X(i)},${Y(v)}`).join(' '); s += `<polygon points="${X(0)},${Y(Math.max(0, mn))} ${pts} ${X(f.h.length - 1)},${Y(Math.max(0, mn))}" fill="var(--f-${f.id})" opacity=".12"/>` }
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
  const W = 520, H = 50 + DEP.length * 60, x0 = 110, x1 = 500, X = (v) => x0 + ((x1 - x0) * v) / 100;
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
const table = (rank) => `<div class="tbl"><div class="tr h"><span></span><span>Amigo</span><span>Saldo</span><span>Neto</span><span>Aciertos</span><span>Apuestas</span><span>Racha</span><span>Mejor premio</span><span>Fuerte en</span></div>
  ${rank.map((f, i) => `<div class="tr ${f.me ? 'me' : ''}"><span class="p">${i + 1}</span><span class="who2" data-prof="${f.id}" style="cursor:pointer">${av(f.id, 'xl')}${esc(f.n)}</span>
    <span class="big">${NS(f.s)}${coin()}</span>${net(f)}<span>${f.ac} <span class="dim">${f.acn}</span></span><span>${f.bets}</span>
    <span class="${f.racha.startsWith('▲') ? 'net up' : 'net'}">${f.racha}</span><span>${N(f.best)}${coin()}</span><span class="dim">${f.fuerte}</span></div>`).join('')}</div>`;
// quien sabe mas de cada deporte: aciertos de lo resuelto
function sabeHtml() {
  const filas = DEP.map((k) => { const r = F.map((f) => ({ f, w: f.sp[k][0], t: f.sp[k][1] })).filter((x) => x.t).sort((a, b) => b.w / b.t - a.w / a.t || b.t - a.t); return [k, r] }).filter(([, r]) => r.length);
  return `<section class="sabe"><div class="sec-h"><h2>Quién sabe más</h2><i>aciertos por deporte</i></div>${filas.length ? filas.map(([k, r]) => `<div class="sabe-r"><span class="sd"><img src="${SP[k][1]}" alt="">${SP[k][0]}</span><span class="sw">${r.map((x, i) => `<span class="${i === 0 ? 'top' : ''}">${av(x.f.id, 'sm')}${esc(x.f.n)} <em>${x.w} de ${x.t}</em></span>`).join('')}</span></div>`).join('') : '<p class="hint">Sale cuando se resuelvan las primeras apuestas.</p>'}</section>`;
}
function liga() {
  if (window.GM_APOST && GM_APOST.tab() === 'apost') return GM_APOST.html();   // pestana Apostadores con el bote (apostadores.js, 01-11)
  if (window.GM_LIGA) return GM_LIGA.html();   // pestana Saldo rehecha (liga.js, 01-11): ranking, Quien sabe mas, saldo y ganancia por semana
  const rank = [...F].sort((a, b) => b.s - a.s), mx = Math.max(1, rank[0]?.s || 1), meI = rank.findIndex((f) => f.me);
  const open = ALL.filter((b) => b.st === 'open').reduce((a, b) => a + b.stake, 0), set = ALL.filter((b) => b.st === 'won' || b.st === 'lost'), won = set.filter((b) => b.st === 'won').length;
  const gapUp = meI > 0 ? rank[meI - 1].s - me().s : 0, gapDn = meI >= 0 && meI < rank.length - 1 ? me().s - rank[meI + 1].s : 0;
  const order = rank.length >= 3 ? [1, 0, ...rank.map((_, i) => i).slice(2)] : rank.map((_, i) => i), nWeeks = Math.max(1, me().h.length - 1);
  return `<div class="lc">${window.GM_APOST ? GM_APOST.tabs() : ''}
    <header class="lc-h"><span class="lab">Temporada · desde el ${esc(SEASON ? fmt(SEASON + 'T12:00:00Z', { day: 'numeric', month: 'short' }) : '')} · ${F.length} jugadores</span><h2 class="wk"><small>SEMANA</small>${String(nWeeks).padStart(2, '0')}</h2>
      <p class="l-pay">Paga de <b>+${N(WEEKLY)}</b> a cada uno en ${CD(PAY)}</p>${CAMPEON ? `<p class="l-rey">${av(CAMPEON.k, 'sm')}<b>${esc(fr(CAMPEON.k).n)}</b> es el campeón de ${esc(CAMPEON.mes)} (▲ ${N(CAMPEON.v)}) y lleva la corona todo el mes</p>` : ''}</header>
    <div class="podium" style="--pdn:${rank.length}">${order.map((i) => { const f = rank[i]; return `<div class="pd ${f.me ? 'me' : ''} ${i >= 3 ? 'rest' : ''}" data-prof="${f.id}" style="cursor:pointer">${av(f.id, 'xl')}<span class="nm">${esc(f.n)}</span><b class="num">${NS(f.s)}${coin()}</b>${net(f)}
      <span class="bar" style="height:${Math.max(6, Math.round((f.s / mx) * 180))}px;background:var(--f-${f.id})"></span><span class="ps">${i + 1}${en() ? ['st', 'nd', 'rd'][i] || 'th' : 'º'}</span></div>` }).join('')}</div>
    ${rank.length > 3 ? `<div class="pd-rest">${rank.slice(3).map((f, j) => `<button class="pr-r ${f.me ? 'me' : ''}" data-prof="${f.id}"><span class="pr-p">${j + 4}${en() ? 'th' : 'º'}</span>${av(f.id)}<span class="pr-n">${esc(f.n)}</span><span class="pr-v"><b class="num">${NS(f.s)}${coin()}</b>${net(f)}</span></button>`).join('')}</div>` : ''}
    <p class="gap" data-notr>${en() ? `${gapUp > 0 ? `You need <b>${N(gapUp)}</b> to catch ${esc(rank[meI - 1].n)}` : meI > 0 ? `Level with ${esc(rank[meI - 1].n)}` : 'You are first'}${gapDn > 0 ? ` · you lead ${esc(rank[meI + 1].n)} by <b>${N(gapDn)}</b>` : ''}`
      : `${gapUp > 0 ? `Te faltan <b>${N(gapUp)}</b> para alcanzar a ${esc(rank[meI - 1].n)}` : meI > 0 ? `Empatado con ${esc(rank[meI - 1].n)}` : 'Vas primero'}${gapDn > 0 ? ` · le sacas <b>${N(gapDn)}</b> a ${esc(rank[meI + 1].n)}` : ''}`}</p>
    ${sabeHtml()}
    <div class="kpis">
      <div class="kpi"><span class="lab">En juego ahora</span><b>${N(open)}${coin()}</b><span>entre todos</span></div>
      <div class="kpi"><span class="lab">Repartido</span><b>${N(F.reduce((a, f) => a + f.recibido, 0))}${coin()}</b><span>${nWeeks} ${nWeeks > 1 ? 'lunes' : 'lunes'} · ${F.length} jugadores</span></div>
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
  const est = b.st === 'won' ? `<b class="ok">Acertada ▲ ${N(b.pay)}${coin()}</b>` : b.st === 'lost' ? `<b class="ko">Fallada ▼ ${N(b.stake)}${coin()}</b>` : `<b>${m.live ? 'En vivo' : 'Faltan ' + CD(m.at)}</b>`;
  return `<div class="bshare" data-goto="${m.id}"><div class="bs-m">${logo(m, 'a')}<span>${esc(m.a)} <i>vs</i> ${esc(m.b)}</span>${logo(m, 'b')}</div><div class="bs-p"><strong>${b.p ? esc(pn(m, b.p)) : 'Oculta hasta empezar'}</strong>${b.p ? `<em>${O(b.o)}</em>` : ''}<span>${N(b.stake)} → ${b.p ? N(b.stake * b.o) : '?'}${coin()}</span>${est}</div></div>` };
const msgRow = (c) => (!c.k
  ? `<div class="sys"><span class="dot"></span><span>${sysTxt(c.txt)}</span><time>${c.t}</time></div>`
  : `<div class="msg">${av(c.k)}<div style="min-width:0"><div class="hd"><span class="nm">${esc(fr(c.k).n)}</span><time>${c.t}</time></div>${c.txt ? `<p>${esc(c.txt)}</p>` : ''}${c.img ? `<img class="pic" src="${esc(c.img)}" alt="" loading="lazy">` : ''}${c.poll ? pollHtml(c.poll) : ''}${c.bet ? betShare(c.bet) : ''}${rxHtml('c:' + c.id)}${c.aud ? `<div class="voz"><audio controls preload="none" src="${esc(c.aud)}"></audio>${c.secs ? `<span>${Math.floor(c.secs / 60)}:${String(c.secs % 60).padStart(2, '0')}</span>` : ''}</div>` : ''}</div></div>`);
// PM, 30-10: que en el chat ponga el dia: una raya con el dia cada vez que cambia
const diaChat = (t) => (DK(t) === DK(NOW) ? 'Hoy' : DK(t) === DK(NOW - DAY) ? 'Ayer' : `${WD(t)} ${DD(t)} ${MO(t)}`);
const conDias = (lista) => { let k = ''; return lista.map((c) => { const d = DK(c.at), sep = d !== k ? `<div class="ch-dia"><span>${diaChat(c.at)}</span></div>` : ''; k = d; return sep + msgRow(c) }).join('') };
let lastSeen = 0; try { lastSeen = +localStorage.getItem('apuestas-chat-visto') || 0 } catch {}
const unread = () => CHAT.filter((c) => c.id > lastSeen && c.k && c.k !== MEK).length;
// PM, 30-10: "la feed de lo que abrimos y todo eso que no son mensajes, en otro lugar dentro de chat, no en el medio,
// que se llame Feed". Chat solo con lo que escribe la gente; Feed con avisos, apuestas de todos, resultados, ruleta, cajas y batallas
const RAR_C = { esp: '#e4ae39', cov: '#eb4b4b', cla: '#d32ce6', res: '#8847ff', mil: '#4b69ff' };
// los resultados de apuestas ya salen de las apuestas: esos avisos no se repiten
const avisoRepe = (t) => /^.+ (ganó|perdió) [\d.]+ con .+ · /.test(t || '') || /^.+ recupera [\d.]+: .+ no se ha jugado$/.test(t || '');
let FEED_CS = null, FEED_T = 0, cargandoFeed = null;
async function cargaFeed() {
  if (cargandoFeed) return cargandoFeed;
  cargandoFeed = (async () => {
    try {
      if (!CAJAS_L) await cargaCasos();
      const [inv, bt] = await Promise.all([
        db.from('cs_inv').select('id,player,item_id,wear,st,value,case_id,battle_id,opened_by,created_at').is('battle_id', null).order('created_at', { ascending: false }).limit(80),
        db.from('cs_battles').select('id,mode,cases,cost,winner,totals,done_at,cs_battle_seats(seat,player)').eq('status', 'done').order('done_at', { ascending: false }).limit(20),
      ]);
      const ids = [...new Set((inv.data || []).map((x) => x.item_id))];
      const it = ids.length ? await db.rpc('cs_items_info', { p_ids: ids }) : { data: [] };
      FEED_CS = { inv: inv.data || [], bats: bt.data || [], items: new Map(((it.data) || []).map((x) => [x.id, x])) };
    } catch { FEED_CS = FEED_CS || { inv: [], bats: [], items: new Map() } }
    FEED_T = Date.now(); cargandoFeed = null;
    if (S.scr === 'chat' && S.ct === 'feed') render();
  })();
  return cargandoFeed;
}
const kDe = (uid) => F.find((f) => f.uid === uid)?.id;
const IC_BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>';
const IC_VS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l9 9M4 4h4M4 4v4M20 4l-9 9M20 4h-4M20 4v4M7 17l-3 3M17 17l3 3M9.5 14.5l-3 3M14.5 14.5l3 3"/></svg>';
function feedItems() {
  const out = [], hora = (t) => `<time>${HM(t)}</time>`, amt = (v, cls = '') => `<span class="fd-amt ${cls}">${v}${coin()}</span>`;
  // avisos de la app (mensajes sin jugador)
  for (const c of CHAT) if (!c.k && !avisoRepe(c.txt)) out.push({ at: c.at, t: 'aviso', html: `<div class="fd aviso"><span class="fd-ic ${/^Paga del lunes|Bote|Premios/.test(c.txt) ? 'oro' : ''}">${/^Paga del lunes/.test(c.txt) ? '<span class="cn"></span>' : IC_BELL}</span><div class="fd-b"><p>${sysTxt(c.txt)}</p></div><span></span><span></span>${hora(c.at)}</div>` });
  // apuestas de todos y sus resultados (PM, 30-10: la moneda al lado de cada cantidad)
  for (const b of ALL) {
    const m = byId(b.m); if (!m || !b.k) continue;
    const mkp = !!(window.GM_MK && GM_MK.es(b.p)), ld = mkp ? GM_MK.lado(b.p) : b.p;   // mercados nuevos: su equipo o la liga
    const lado = ld === '1' ? logo(m, 'a') : ld === '2' ? logo(m, 'b') : mkp ? img(L[m.lg]?.[1], 'tl') : `<span class="fd-x">${b.p ? 'X' : '?'}</span>`;
    out.push({ at: Date.parse(b.at), t: 'apuestas', html: `<div class="fd" data-goto="${m.id}">${av(b.k)}<div class="fd-b"><p><b>${esc(fr(b.k).n)}</b> <span>${b.p ? 'apuesta a' : 'ha apostado'}</span> ${b.p ? `<em>${esc(pn(m, b.p))}</em> <i class="fd-o">${O(b.o)}</i>` : '<i class="fd-o">se ve al empezar</i>'}<small>${esc(m.a)} vs ${esc(m.b)} · ${esc(corto(L[m.lg]?.[0] || ''))}</small></p></div>${amt(N(b.stake))}<span class="fd-vis">${lado}</span>${hora(Date.parse(b.at))}</div>` });
    if ((b.st === 'won' || b.st === 'lost') && b.set) out.push({ at: Date.parse(b.set), t: 'apuestas', html: `<div class="fd res ${b.st}" data-goto="${m.id}">${av(b.k)}<div class="fd-b"><p><b>${esc(fr(b.k).n)}</b> <span>${b.st === 'won' ? 'acierta con' : 'falla con'}</span> <em>${esc(pn(m, b.p))}</em> <i class="fd-o">${O(b.o)}</i><small>${esc(m.a)} ${esc(m.score || '')} ${esc(m.b)}</small></p></div>${amt(b.st === 'won' ? '▲ ' + N(b.pay - b.stake) : '▼ ' + N(b.stake), b.st)}<span class="fd-vis">${lado}</span>${hora(Date.parse(b.set))}</div>` });
  }
  // la ruleta de la semana
  for (const w of WHEEL || []) {
    const k = kDe(w.player); if (!k || !w.created_at) continue;
    const caja = /^Caja gratis: /.test(w.label) ? casoPorNombre(w.label.replace(/^Caja gratis: /, '')) : null;
    out.push({ at: Date.parse(w.created_at), t: 'premios', html: `<div class="fd">${av(k)}<div class="fd-b"><p><b>${esc(fr(k).n)}</b> <span>gira la ruleta</span><small>${esc(w.label)}</small></p></div>${w.amount ? amt('+' + N(w.amount), 'won') : '<span></span>'}<span class="fd-vis">${caja ? `<img class="fd-case" src="${esc(casoSrc(caja.image, 128))}" alt="">` : '<span class="cn fd-coin"></span>'}</span>${hora(Date.parse(w.created_at))}</div>` });
  }
  // cajas: las aperturas seguidas de la misma persona (menos de 10 minutos entre una y otra) van en una sola fila
  if (FEED_CS) {
    const grupos = [], RK = { esp: 5, cov: 4, cla: 3, res: 2, mil: 1 };
    for (const x of FEED_CS.inv) { const quien = x.opened_by || x.player, t = Date.parse(x.created_at), g = grupos[grupos.length - 1];
      if (g && g.quien === quien && g.tMin - t < 6e5) { g.xs.push(x); g.tMin = t } else grupos.push({ quien, t, tMin: t, xs: [x] }) }
    for (const g of grupos) {
      const k = kDe(g.quien); if (!k) continue;
      const porCaja = {}; for (const x of g.xs) porCaja[x.case_id] = (porCaja[x.case_id] || 0) + 1;
      const cajas = Object.entries(porCaja).sort((a, b) => b[1] - a[1]).map(([id, n]) => [(CAJAS_L || []).find((y) => y.id === id), n]);
      const its = g.xs.map((x) => ({ x, it: FEED_CS.items.get(x.item_id) || { name: '·', rarity: 'mil' } })).sort((a, b) => (RK[b.it.rarity] || 0) - (RK[a.it.rarity] || 0) || b.x.value - a.x.value);
      const top = its[0], tot = g.xs.reduce((a, x) => a + x.value, 0), c0 = cajas[0]?.[0];
      out.push({ at: g.t, t: 'cajas', html: `<div class="fd fdc" data-scr="cajas">${av(k)}<div class="fd-b"><p><b>${esc(fr(k).n)}</b> <span>${g.xs.length > 1 ? `abre ${g.xs.length} cajas` : 'abre una caja'}</span> <em>${cajas.slice(0, 3).map(([c, n]) => esc(c?.name || 'CS2') + (n > 1 ? ' ×' + n : '')).join(', ')}${cajas.length > 3 ? '…' : ''}</em>
        <small>lo mejor: <b style="color:${RAR_C[top.it.rarity] || RAR_C.mil}">${esc(top.it.name)}${top.it.phase ? ' · ' + esc(top.it.phase) : ''}</b> · ${N(top.x.value)}${coin()}</small></p>
        <span class="fd-its">${its.slice(0, 14).map(({ x, it }) => `<span class="fd-it" style="--c:${RAR_C[it.rarity] || RAR_C.mil}" title="${esc(it.name)} · ${N(x.value)}">${it.image ? `<img src="${esc(casoSrc(it.image, 96))}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : ''}</span>`).join('')}${its.length > 14 ? `<i class="fd-mas">+${its.length - 14}</i>` : ''}</span></div>
        ${amt(N(tot))}<span class="fd-vis">${c0?.image ? `<img class="fd-case" src="${esc(casoSrc(c0.image, 128))}" alt="" loading="lazy">` : `<span class="fd-ic">${IC_BOX}</span>`}</span>${hora(g.t)}</div>` });
    }
    for (const b of FEED_CS.bats) {
      const seats = (b.cs_battle_seats || []).sort((x, y) => x.seat - y.seat), mitad = seats.length / 2;
      const lados = [seats.filter((s) => s.seat < mitad), seats.filter((s) => s.seat >= mitad)].map((l) => l.map((s) => kDe(s.player)).filter(Boolean));
      if (!lados[0].length || !lados[1].length || b.winner == null) continue;
      const g = lados[b.winner], p = lados[1 - b.winner], tt = b.totals || [0, 0], c = (CAJAS_L || []).find((y) => y.id === (b.cases || [])[0]);
      out.push({ at: Date.parse(b.done_at), t: 'cajas', html: `<div class="fd fdb" data-scr="cajas"><span class="fd-avs">${g.map((k) => av(k)).join('')}</span><div class="fd-b"><p><b>${g.map((k) => esc(fr(k).n)).join(' y ')}</b> <span>${g.length > 1 ? 'ganan la batalla a' : 'gana la batalla a'}</span> <b>${p.map((k) => esc(fr(k).n)).join(' y ')}</b><small>Batalla ${esc(b.mode)} · ${N(tt[b.winner])} contra ${N(tt[1 - b.winner])} · ${(b.cases || []).length} ${(b.cases || []).length === 1 ? 'caja' : 'cajas'}</small></p></div>${amt(N((tt[0] || 0) + (tt[1] || 0)), 'won')}<span class="fd-vis">${c?.image ? `<img class="fd-case" src="${esc(casoSrc(c.image, 128))}" alt="" loading="lazy">` : `<span class="fd-ic">${IC_VS}</span>`}</span>${hora(Date.parse(b.done_at))}</div>` });
    }
  }
  return out.filter((x) => isFinite(x.at)).sort((a, b) => b.at - a.at);
}
let feedVisto = 0; try { feedVisto = +localStorage.getItem('apuestas-feed-visto') || 0 } catch {}
const feedNuevo = () => { const ult = Math.max(0, ...CHAT.filter((c) => !c.k).map((c) => c.at), ...ALL.filter((b) => b.k !== MEK).map((b) => Date.parse(b.set || b.at) || 0)); return ult > feedVisto };
function feedHtml() {
  if (!FEED_CS || Date.now() - FEED_T > 6e4) setTimeout(cargaFeed, 0);
  const tipos = [['todo', 'Todo'], ['apuestas', 'Apuestas'], ['cajas', 'Cajas'], ['premios', 'Ruleta semanal'], ['aviso', 'Avisos']];
  const todo = feedItems(), ft = S.ft || 'todo', xs = todo.filter((x) => ft === 'todo' || x.t === ft), n = S.fdN || 60;
  let k = '', h = '';
  for (const x of xs.slice(0, n)) { const d = DK(x.at); if (d !== k) { h += `<div class="ch-dia fd-dia"><span>${diaChat(x.at)}</span></div>`; k = d } h += x.html }
  return `<nav class="fd-fil">${tipos.filter(([t]) => t === 'todo' || todo.some((x) => x.t === t)).map(([t, nm]) => `<button class="chip ${ft === t ? 'on' : ''}" data-ft="${t}">${nm}</button>`).join('')}</nav>
    <div class="fd-list">${h || `<p class="hint">${FEED_CS ? 'Todavía no ha pasado nada por aquí.' : 'Cargando…'}</p>`}${xs.length > n ? `<button class="q hst-mas" data-act="fd-mas">Ver más</button>` : ''}</div>`;
}
function chat() {
  const live = M.filter((m) => m.live && whoOn(m.id).length)[0];
  const fd = S.ct === 'feed';
  if (fd) { feedVisto = Date.now(); try { localStorage.setItem('apuestas-feed-visto', feedVisto) } catch {} }
  else { const maxId = Math.max(0, ...CHAT.map((c) => c.id)); if (maxId > lastSeen) { lastSeen = maxId; try { localStorage.setItem('apuestas-chat-visto', maxId) } catch {} } }
  const un = fd ? unread() : 0;
  const tabs = `<nav class="ch-tabs"><button class="${fd ? '' : 'on'}" data-ct="chat">Chat${un ? `<i>${un}</i>` : ''}</button><button class="${fd ? 'on' : ''}" data-ct="feed">Feed${!fd && feedNuevo() ? '<i class="nv-pt"></i>' : ''}</button></nav>`;
  return `<div class="c-wrap ${live ? '' : 'solo'}"><section class="c-main">${tabs}${fd ? `<div class="fd-wrap" data-keep="fd">${feedHtml()}</div>` : `<div class="chat"><div class="ch-list" data-chat>${window.GM_CHAT ? GM_CHAT.lista() : conDias(CHAT.filter((c) => c.k)) || '<p class="hint">Escribe el primero.</p>'}</div>
    ${S.pollForm ? `<div class="poll-f"><input type="text" id="poll-q" maxlength="140" placeholder="La pregunta" autocomplete="off">${[0, 1, 2, 3].map((i) => `<input type="text" id="poll-o${i}" maxlength="40" placeholder="Opción ${i + 1}${i > 1 ? ' (si quieres)' : ''}" autocomplete="off">`).join('')}<div class="poll-b"><button class="q" data-act="poll-x">Cancelar</button><button class="go-s" data-act="poll-ok">Crear encuesta</button></div></div>` : ''}<div class="ch-in"><button class="ic" data-act="img" aria-label="Mandar foto">${IC_IMG}</button><button class="ic" data-act="poll" aria-label="Encuesta">${IC_POLL}</button><button class="ic mic ${REC ? 'on' : ''}" data-act="mic" aria-label="${REC ? 'Parar y enviar' : 'Nota de voz'}">${IC_MIC}</button>${REC ? `<span class="rec" data-rec>${recTxt()}</span><button class="q rec-x" data-act="mic-x">Cancelar</button>` : ''}<input type="text" id="msg" data-msg placeholder="Escribe a tus amigos" maxlength="500" autocomplete="off"><button class="send" data-act="send" aria-label="Enviar">${IC_SEND}</button><input type="file" id="pic" accept="image/*" data-file hidden></div></div>`}</section>
    ${live ? `<aside class="c-side">
      ${live ? `<section><span class="lab">En juego ahora</span><div class="live-m" data-goto="${live.id}" style="cursor:pointer"><div>${logo(live, 'a')}${esc(live.a)}${vN(live, 'a')}</div><b>${live.vivo ? vL(live) || '·' : esc(live.score || '')}</b><div>${logo(live, 'b')}${esc(live.b)}${vN(live, 'b')}</div></div></section>
      ${window.GM_ACTIVOS && GM_ACTIVOS.retos(live.id) ? `<section class="ac ac-top"><span class="lab">Retos de este partido</span><div class="ac-lista">${GM_ACTIVOS.retos(live.id)}</div></section>` : ''}
      <section><span class="lab">Sus apuestas</span>${whoOn(live.id).map((x) => `<div class="ifr">${av(x.f)}<span class="nm">${esc(fr(x.f).n)}</span><span class="st rev">${x.p ? esc(pn(live, x.p)) + ' · ' : ''}${N(x.stake)}${coin()}</span></div>`).join('')}</section>` : ''}
    </aside>` : ''}</div>`;
}

/* ---------- Monedero ---------- */
// PM, 30-10: movimientos con paginas y separados (apuestas, cajas y skins, pagas y premios), con la foto de la caja
// o contra quien fue la batalla; sin las reglas. Y la ruleta de la semana
let WHEEL = null, CASOS = null, BATS = new Map();
// PM, 01-11: "las bets rapidas que se vean como categoria distinta y que no cuenten como apuestas reales": las predicciones en directo van aparte
const movTipo = (k) => (['apuesta', 'premio', 'devolucion', 'cashout'].includes(k) ? 'apuestas' : ['pred_apuesta', 'pred_premio', 'pred_devol'].includes(k) ? 'rapidas' :['caja', 'venta', 'batalla', 'trato', 'mercado', 'jackpot'].includes(k) ? 'cajas' : ['moneda', 'crash', 'ruleta', 'blackjack', 'plinko'].includes(k) ? 'juegos' : 'pagas');
// 047: una tirada cada 3 dias con premios mas pequenos. [texto, tipo, probabilidad]: cada gajo mide lo que toca (spin_wheel)
const RUEDA = [['50', 0, .34], ['Caja', 1, .065], ['75', 0, .25], ['150', 0, .12], ['Caja ★', 2, .02], ['300', 0, .05], ['100', 0, .145], ['600', 3, .01]];
const RU_A = RUEDA.reduce((a, r) => (a.push(a[a.length - 1] + r[2] * 360), a), [0]), RU_W = RUEDA.map((r) => r[2] * 360);
// los periodos de 3 dias de la base (ruleta_periodo): fijos desde el lunes 02/11/2026, hora de Madrid
const RU_ANCLA = Date.UTC(2026, 10, 2);
function ruPer(t = Date.now()) {
  const hoy = Date.parse(DK(t).split('/').reverse().join('-') + 'T00:00:00Z'), k = Math.floor((hoy - RU_ANCLA) / DAY / 3), dia = (j) => new Date(RU_ANCLA + j * 3 * DAY).toISOString().slice(0, 10);
  const sig = dia(k + 1), sigT = ['+01:00', '+02:00'].map((z) => Date.parse(sig + 'T00:00:00' + z)).find((x) => DK(x).split('/').reverse().join('-') === sig && HM(x) === '00:00') || Date.parse(sig + 'T00:00:00+01:00');
  return { ini: dia(k), sig, sigT, iniT: sigT - 3 * DAY };
}
// cuando toca la siguiente tirada: manana, en N dias o hoy a las HH:MM
function ruSigTxt() {
  const { sigT } = ruPer(), d0 = Date.parse(DK(Date.now()).split('/').reverse().join('-') + 'T00:00:00Z'), d1 = Date.parse(DK(sigT).split('/').reverse().join('-') + 'T00:00:00Z'), dd = Math.round((d1 - d0) / DAY);
  return dd <= 0 ? (en() ? `today at ${HM(sigT)}` : `hoy a las ${HM(sigT)}`) : dd === 1 ? (en() ? 'tomorrow' : 'mañana') : en() ? `in ${dd} days` : `en ${dd} días`;
}
// tu tirada de este periodo (tambien una de la regla vieja de la semana hecha dentro del periodo)
const ruMia = (uid) => { const p = ruPer(); return (WHEEL || []).find((w) => w.player === uid && (w.week === p.ini || Date.parse(w.created_at || 0) >= p.iniT)) };
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
    : `<span class="mv-i ${tipo === 'apuestas' ? 'b' : tipo === 'cajas' ? 'c' : tipo === 'juegos' ? 'j' : 'p'}">${tipo === 'apuestas' ? IC_TICKET : tipo === 'cajas' ? IC_BOX : tipo === 'juegos' ? IC_DADO : IC_GIFT}</span>`;
  const det = m.kind === 'batalla' && rivales.length ? `Contra ${rivales.map((f) => esc(f.n)).join(' y ')}` : esc(m.d && m.d !== m.c ? m.d : '');
  return `<div class="mv"><time>${DD(m.at)} ${MO(m.at)}<small>${HM(m.at)}</small></time>${ico}<p><b>${esc(m.c)}</b>${det ? `<span>${det}</span>` : ''}</p><span class="a ${m.a > 0 ? 'up' : 'dn'}">${m.a > 0 ? '▲' : '▼'} ${N(Math.abs(m.a))}${coin()}</span>${saldo != null ? `<span class="s">${N(saldo)}</span>` : ''}</div>`;
}
// PM, 30-10: "la weekly wheel esta super bugeada, las vueltas y todo". Ahora el angulo sale del reloj en cada
// fotograma: aunque la app repinte a mitad (el pulso de Realtime llega en cuanto giras), la rueda sigue donde iba.
// PM, 30-10 tarde: "Rewards que se vea mucho mejor y bonito, refresh de la weekly wheel": aro de oro con luces, premios
// con la moneda o la caja de verdad, aguja que golpea los pivotes, brillo en el premio y confeti. La caja llega SIN abrir
let RU = null, RU_P = 0;
const RU_DUR = 5600;
const IMG = SP.f[1].replace(/futbol\.svg$/, '');
let CAJAS_L = null, cargandoCasos = null;
const casoSrc = (im, s = 128) => (!im ? '' : /^https?:/.test(im) ? im : `https://community.akamai.steamstatic.com/economy/image/${im}/${s}fx${s}f`);
function cargaCasos() {
  if (CAJAS_L || cargandoCasos) return cargandoCasos;
  cargandoCasos = db.rpc('cs_cases').then(({ data }) => { CAJAS_L = (Array.isArray(data) ? data : data?.cases) || []; if (!CASOS) CASOS = new Map(CAJAS_L.map((c) => [c.name, c.image])); render() }).catch(() => { CAJAS_L = [] });
  return cargandoCasos;
}
const casoPorNombre = (n) => (CAJAS_L || []).find((c) => c.name === n);
// la caja barata y la buena de la ruleta (spin_wheel saca una de las 5 mas baratas o de las 3 mas caras de skins)
const ruCajas = () => { const sk = (CAJAS_L || []).filter((c) => (c.cat || 'skins') === 'skins').sort((a, b) => a.price - b.price); return [sk[0]?.image, sk[sk.length - 1]?.image] };
const ruAng = () => { if (!RU) return S.ruRot || 0; const p = Math.min(1, (Date.now() - RU.t0) / RU_DUR); return RU.from + (RU.to - RU.from) * (1 - Math.pow(1 - p, 3.4)) };
// la aguja: cada pivote del borde la empuja al pasar por debajo y vuelve con muelle (los gajos ya no miden lo mismo)
const ruEmpuje = (a) => { const w = 11, x = Math.min(...RU_A.slice(0, -1).map((b) => (((-(b + a)) % 360) + 360) % 360)); return x < w ? -24 * (w - x) / w : 0 };
function ruLoop() {
  const a = ruAng(), el = document.getElementById('rueda'); if (el) el.style.transform = `rotate(${a.toFixed(2)}deg)`;
  const t = ruEmpuje(a); RU_P = t < RU_P ? t : RU_P + (t - RU_P) * 0.28;
  const pin = document.getElementById('ru-pin'); if (pin) pin.style.transform = `rotate(${RU_P.toFixed(2)}deg)`;
  if (!RU) return;
  if (Date.now() - RU.t0 < RU_DUR) return requestAnimationFrame(ruLoop);
  const r = RU; RU = null; S.ruRot = r.to; S.ruGira = false; S.ruWin = r.res.prize; S.ruRes = r.res; S.ruCel = Date.now();
  { const b = document.getElementById('rueda')?.getBoundingClientRect(); confeti(b ? b.left + b.width / 2 : undefined, b ? b.top + b.height * 0.3 : undefined) }
  toast(r.res.box ? `${esc(r.res.label)}: la tienes en Cajas › Inventario` : `Ruleta: <b>${esc(r.res.label)}</b>`);
  setTimeout(() => { if (S.rew) render() }, 4200);
  refresh();
}
function ruedaSvg(gana) {
  const C = 120, R = 103, pt = (r, g) => `${(C + r * Math.sin(g * Math.PI / 180)).toFixed(2)} ${(C - r * Math.cos(g * Math.PI / 180)).toFixed(2)}`;
  const [cBar, cBuena] = ruCajas(), vb = IMG + 'vbucks.webp';
  const grad = [['g0', '#1b2140', '#3a4890'], ['g1', '#171b24', '#2f374a'], ['gc', '#13286f', '#3f62f0'], ['gb', '#3d1260', '#c02fd6'], ['gd', '#7c5410', '#ffe08a'], ['gt', '#0f2b2a', '#1e8577'], ['gr', '#36111a', '#b8364a']];
  const defs = `<defs>${grad.map(([id, a, b]) => `<radialGradient id="ru-${id}" gradientUnits="userSpaceOnUse" cx="${C}" cy="${C}" r="${R}"><stop offset=".25" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient>`).join('')}
    <linearGradient id="ru-oro" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0bd"/><stop offset=".3" stop-color="#e2b24c"/><stop offset=".55" stop-color="#8a6418"/><stop offset=".8" stop-color="#f6d47a"/><stop offset="1" stop-color="#7a5714"/></linearGradient>
    <radialGradient id="ru-hub" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#fff0bd"/><stop offset=".55" stop-color="#d9a640"/><stop offset="1" stop-color="#7a5714"/></radialGradient></defs>`;
  const seg = RUEDA.map(([t, c], i) => {
    const fill = ['g1', 'gc', 'g0', 'gt', 'gb', 'gr', 'g0', 'gd'][i] || 'g0', caja = c === 1 || c === 2, im = c === 1 ? cBar : cBuena, a0 = RU_A[i], aw = RU_W[i];
    // los gajos finos (caja buena 2 %, 400 1 %): el texto a lo largo del radio
    const cont = aw < 25 ? `<text x="${C}" y="${C - 72}" class="ru-tx fino ${c === 3 ? 'osc' : ''}" transform="rotate(-90 ${C} ${C - 72})" style="font-size:${Math.max(5.5, Math.min(11, aw * 1.45)).toFixed(1)}px">${c === 2 ? 'CAJA ★' : c === 1 ? 'CAJA' : t}</text>`
      : caja
      ? `${im ? `<image href="${esc(casoSrc(im, 128))}" x="${C - 25}" y="${C - 99}" width="50" height="38" preserveAspectRatio="xMidYMid meet"/>` : `<text x="${C}" y="${C - 74}" class="ru-ic">▣</text>`}<text x="${C}" y="${C - 50}" class="ru-tx sm">${c === 2 ? 'CAJA ★' : 'CAJA'}</text>`
      : `<image href="${vb}" x="${C - 12}" y="${C - 96}" width="24" height="24"/><text x="${C}" y="${C - 56}" class="ru-tx ${c === 3 ? 'osc' : ''}">${t}</text>`;
    return `<g class="ru-s ${i === gana ? 'gana' : ''}"><path d="M${C} ${C}L${pt(R, a0)}A${R} ${R} 0 ${aw > 180 ? 1 : 0} 1 ${pt(R, a0 + aw)}Z" fill="url(#ru-${fill})"/><g transform="rotate(${(a0 + aw / 2).toFixed(2)} ${C} ${C})">${cont}</g></g>`;
  }).join('');
  const rayas = RUEDA.map((_, i) => `<path d="M${pt(27, RU_A[i])}L${pt(R, RU_A[i])}" class="ru-ra"/><circle cx="${pt(R - 2, RU_A[i]).split(' ')[0]}" cy="${pt(R - 2, RU_A[i]).split(' ')[1]}" r="2.6" class="ru-peg"/>`).join('');
  const luces = Array.from({ length: 24 }, (_, k) => { const [x, y] = pt(111.5, k * 15 + 7.5).split(' '); return `<circle cx="${x}" cy="${y}" r="2.7" class="ru-led ${k % 2 ? 'b' : 'a'}"/>` }).join('');
  return `<svg viewBox="0 0 240 240" class="ru2" id="rueda" style="transform:rotate(${ruAng().toFixed(2)}deg)" role="img" aria-label="Ruleta de premios">${defs}
    <circle cx="${C}" cy="${C}" r="119" fill="url(#ru-oro)"/><circle cx="${C}" cy="${C}" r="106.5" class="ru-in"/>${luces}${seg}${rayas}
    <circle cx="${C}" cy="${C}" r="28" fill="url(#ru-hub)"/><circle cx="${C}" cy="${C}" r="22.5" class="ru-hc"/></svg>`;
}
function ruedaHtml() {
  const mio = ruMia(me().uid);
  if (!CAJAS_L) cargaCasos();
  // si ya giraste esta semana, la rueda se queda con tu premio debajo de la aguja
  if (S.ruRot == null && mio && !RU) S.ruRot = -(RU_A[mio.prize] + RU_W[mio.prize] / 2);
  const gana = RU ? -1 : S.ruWin ?? (mio ? mio.prize : -1), cel = !RU && S.ruCel && Date.now() - S.ruCel < 4000;
  const res = S.ruRes || mio, label = res?.label || '', esCaja = !!(S.ruRes ? S.ruRes.box : /^Caja gratis: /.test(label));
  const caja = esCaja ? casoPorNombre(label.replace(/^Caja gratis: /, '')) || (CAJAS_L || []).find((c) => c.id === S.ruRes?.box?.case) : null;
  RU_P = RU ? RU_P : ruEmpuje(ruAng());
  const premio = res && !RU ? `<div class="ru-win ${cel ? 'nuevo' : ''}">${esCaja ? (caja ? `<img src="${esc(casoSrc(caja.image, 256))}" alt="" class="ru-wc">` : `<span class="ru-wi">${IC_BOX}</span>`) : '<span class="cn ru-wv"></span>'}
      <div><span class="lab">${cel ? '¡Te ha tocado!' : 'Tu premio de esta tirada'}</span><b>${esc(esCaja ? (caja?.name || label.replace(/^Caja gratis: /, '')) : label)}</b>
      <small>${esCaja ? 'Caja sin abrir: la tienes en Cajas › Inventario para abrirla tú' : 'Ya está en tu saldo'}</small>${esCaja ? '<button class="q ru-ir" data-act="rw-cajas">Ir a Cajas</button>' : ''}</div></div>` : '';
  return `<section class="ru-hero">
    <div class="ru-w ${RU ? 'gira' : ''} ${cel ? 'celebra' : ''}"><span class="ru-glow"></span>${ruedaSvg(gana)}
      <span class="ru-pin"><svg id="ru-pin" viewBox="0 0 32 46" style="transform:rotate(${RU_P.toFixed(2)}deg)"><path d="M16 44C10 30 3 22 3 14a13 13 0 0 1 26 0c0 8-7 16-13 30z" class="ru-pa"/><circle cx="16" cy="14" r="5" class="ru-pc"/></svg></span>
      ${mio || RU ? `<span class="ru-hub"><span class="cn"></span></span>` : `<button class="ru-hub can" data-act="girar" aria-label="Girar">GIRAR</button>`}</div>
    <span class="lab">Tu ruleta · cada 3 días</span>
    <h3>${RU ? 'Girando…' : mio ? (cel ? '¡Premio!' : 'Ya has girado') : 'Una tirada gratis'}</h3>
    <p>${RU ? 'Mira dónde para la aguja' : mio ? `<span data-notr>${en() ? `Next spin ${ruSigTxt()}` : `La siguiente, ${ruSigTxt()}`}</span>` : 'De 50 a 600 V-Bucks o una caja de CS2 para abrirla tú. Una tirada cada 3 días.'}</p>
    ${mio || RU ? '' : '<button class="ru-go" data-act="girar">Girar la ruleta</button>'}
    ${premio}
    <div class="ru-todos ${S.ruTodos ? 'abre' : ''}"><button class="ru-tb" data-act="ru-todos" aria-expanded="${!!S.ruTodos}"><span class="ru-tav">${F.map((f) => av(f.id, 'sm')).join('')}</span><b>Todos</b><small>${F.filter((f) => ruMia(f.uid)).length} de ${F.length} han girado</small><i>${S.ruTodos ? '▴' : '▾'}</i></button>
      ${S.ruTodos ? `<div class="ru-tl">${F.map((f) => { const w = ruMia(f.uid); return `<span class="${w ? '' : 'no'}">${av(f.id, 'sm')}<b>${esc(f.n)}</b><em>${w ? esc(w.label) : 'aún no ha girado'}</em></span>` }).join('')}</div>` : ''}</div>
  </section>`;
}
// lo que hay para reclamar: cuantas cosas esperan
function rwPend() {
  const rueda = !ruMia(me().uid);
  const tiempo = (TIEMPO?.tiers || []).filter((t) => !t.claimed && TIEMPO.minutes >= t.min).length;
  return { diario: !!CLAIM && !CLAIM.today, rueda, rescate: puedeRescate(), tiempo };
}
function rwBoton() { const p = rwPend(), n = [p.diario, p.rueda, p.rescate].filter(Boolean).length + p.tiempo;
  return `<button class="claim ${n ? '' : 'nada'} ${S.rew ? 'on' : ''}" data-act="rw" aria-label="Recompensas">${IC_GIFT}<span>Recompensas</span>${n ? `<b>${n}</b>` : ''}</button>` }
const IC_OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
// PM, 30-10: premios por estar en la app (db/019): 30 min, 1 h y 2 h al dia. La app manda un latido por minuto a la vista
const IC_RELOJ = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>';
const minTxt = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}` : `${m} min`);
function tiempoHtml() {
  if (!TIEMPO?.tiers?.length) return '';
  const ts = [...TIEMPO.tiers].sort((a, b) => a.min - b.min), mins = TIEMPO.minutes || 0, n = ts.length;
  // cada tramo en el centro de su columna; la barra avanza a trozos entre tramo y tramo
  const at = (i) => ((i + 0.5) / n) * 100, pos = (m) => { let a = 0, x0 = 0; for (let i = 0; i < n; i++) { const b = at(i); if (m <= ts[i].min) return x0 + (b - x0) * (m - a) / (ts[i].min - a); a = ts[i].min; x0 = b } return 100 }, pc = pos(mins);
  return `<div class="rw-tiempo"><div class="rw-th"><span class="rw-t r">${IC_RELOJ}</span><p><b>Tiempo en la app</b><span>Hoy llevas <i>${minTxt(mins)}</i> · cuenta mientras la tienes abierta y a la vista</span></p></div>
    <div class="rw-tb"><span class="rw-tf" style="width:${pc.toFixed(1)}%"></span>${ts.map((t, i) => `<i class="${t.claimed ? 'hecho' : mins >= t.min ? 'listo' : ''}" style="left:${at(i).toFixed(1)}%"></i>`).join('')}</div>
    <div class="rw-tt" style="--n:${ts.length}">${ts.map((t) => `<div class="${t.claimed ? 'hecho' : mins >= t.min ? 'listo' : ''}"><b>+${N(t.amt)}${coin()}</b><small>${minTxt(t.min)}</small>${t.claimed ? `<em class="rw-ok">${IC_OK}Cobrado</em>` : mins >= t.min ? `<button class="go-s" data-tclaim="${t.min}">Reclamar</button>` : `<em>faltan ${minTxt(t.min - mins)}</em>`}</div>`).join('')}</div></div>`;
}
let LATIDO = null;
function latido() {
  if (LATIDO) return;
  const uno = async () => {
    if (document.visibilityState !== 'visible') return;
    const { data, error } = await db.rpc('heartbeat'); if (error || typeof data !== 'number' || !TIEMPO) return;
    const antes = rwPend().tiempo; TIEMPO.minutes = data;
    if (rwPend().tiempo !== antes || S.rew) render();
  };
  uno(); LATIDO = setInterval(uno, 60000);
}
function pintaRw() {
  let el = document.getElementById('rw');
  if (!S.rew) { if (el) el.remove(); return }
  const nuevo = !el;
  if (!el) { el = document.createElement('div'); el.id = 'rw'; document.body.appendChild(el) }
  const p = rwPend(), dentro = Object.keys(BOTE?.players || {}).map((u) => F.find((f) => f.uid === u)).filter(Boolean);
  const hecho = (t) => `<em class="rw-ok">${IC_OK}${t}</em>`;
  el.innerHTML = `<div class="rw-fondo" data-act="rw"></div><aside class="rw2 ${nuevo ? 'abre' : ''}" role="dialog" aria-label="Recompensas">
    <header><span class="rw-gi">${IC_GIFT}</span><h2>Recompensas</h2><button class="rw-x" data-act="rw" aria-label="Cerrar"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></header>
    ${ruedaHtml()}
    <div class="rw-l">
      ${window.GM_RGLOBAL ? GM_RGLOBAL.fila() : ''}
      ${tiempoHtml()}
      <div class="rw-r2"><span class="rw-t d"><span class="cn"></span></span><p><b>Premio diario</b><span>${N(CLAIM?.amount || 50)} V-Bucks cada día que lo reclames</span></p>${p.diario ? `<button class="go-s" data-act="claim">Reclamar</button>` : hecho('Hecho hoy')}</div>
      <div class="rw-r2"><span class="rw-t b">${IC_TICKET}</span><p><b>Bote de la semana</b><span>${BOTE?.pot ? `<i class="rw-pot">${N(BOTE.pot)}${coin()}</i> en el bote` : `Cada lunes, ${N(BOTE?.amount || 100)} de cada uno`} · se lo lleva quien más gane</span>${dentro.length ? `<span class="rw-av">${dentro.map((f) => av(f.id, 'sm')).join('')}<small>${dentro.length} dentro</small></span>` : ''}</p><button class="go-s res" data-apo-ir>Ver el bote</button></div>
      ${p.rescate ? `<div class="rw-r2"><span class="rw-t p">${IC_GIFT}</span><p><b>Rescate</b><span>Te has quedado a cero: ${N(CLAIM.rescue)} para seguir, una vez por semana</span></p><button class="go-s" data-act="rescue">Pedir</button></div>` : ''}
    </div>
  </aside>`;
  if (window.GM_LANG) GM_LANG.traduce(el);
  if (RU) requestAnimationFrame(ruLoop);
}

function monedero() {
  const days = en() ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'] : ['L', 'M', 'X', 'J', 'V', 'S', 'D'], di = Math.min(6, Math.max(0, Math.floor((NOW - WEEK0) / DAY)));
  const mine = ALL.filter((b) => b.k === MEK), open = mine.filter((b) => b.st === 'open'), won = mine.filter((b) => b.st === 'won').reduce((a, b) => a + b.pay, 0);
  const tab = S.mt || 'todo', lista = LEDGER.filter((m) => tab === 'todo' || movTipo(m.kind) === tab), POR = 10, pags = Math.max(1, Math.ceil(lista.length / POR)), pg = Math.min(S.mp || 0, pags - 1);
  const saldos = []; { let run = me().s; for (const m of LEDGER) { saldos.push(run); run -= m.a } }
  const filas = lista.slice(pg * POR, pg * POR + POR).map((m) => movFila(m, tab === 'todo' ? saldos[LEDGER.indexOf(m)] : null)).join('');
  const cnt = (k) => LEDGER.filter((m) => k === 'todo' || movTipo(m.kind) === k).length;
  if (!CASOS || LEDGER.some((m) => m.kind === 'batalla' && !BATS.has(+((m.d || '').match(/#(\d+)/) || [])[1]))) setTimeout(cargaMov, 0);
  return `<div class="pad">
    <div class="w-hero">${coin('big')}
      <div><span class="lab">Tu saldo</span><div class="w-bal">${NS(me().s)}</div>
        <p class="w-pay">Paga del lunes <b>+${N(WEEKLY)}</b> · se acumula</p>
        <div class="w-cd" data-cdpay>${fmtPay(PAY)}</div>
        <div class="wk7">${days.map((d, i) => `<i class="${i <= di ? 'on' : ''}"></i>`).join('')}${days.map((d, i) => `<span class="${i === di ? 'on' : ''}">${d}</span>`).join('')}</div>
      </div></div>
    <div class="stats" style="margin-top:30px;grid-template-columns:repeat(4,minmax(0,1fr))">
      <div class="stt"><span class="lab">Repartido</span><b>${N(me().recibido)}${coin()}</b><span>pagas y regalos</span></div>
      <div class="stt"><span class="lab">Premios</span><b>${N(won)}${coin()}</b><span>lo que te han pagado</span></div>
      <div class="stt"><span class="lab">En juego</span><b>${N(open.reduce((a, b) => a + b.stake, 0))}${coin()}</b><span>${open.length} apuestas abiertas</span></div>
      <div class="stt ac"><span class="lab">Si aciertas todo</span><b>${N(me().s + open.reduce((a, b) => a + b.stake * b.o, 0))}${coin()}</b><span>saldo posible</span></div>
    </div>
    <section class="movs"><div class="sec-h"><h2>Movimientos</h2><i>${lista.length} ${lista.length === 1 ? 'movimiento' : 'movimientos'}</i></div>
      <nav class="mv-tabs">${[['todo', 'Todo'], ['apuestas', 'Apuestas'], ['rapidas', 'Apuestas rápidas'], ['cajas', 'Cajas y skins'], ['juegos', 'Juegos'], ['pagas', 'Pagas y premios']].filter(([k]) => k === 'todo' || cnt(k)).map(([k, n]) => `<button class="chip ${tab === k ? 'on' : ''}" data-mt="${k}">${n} <i>${cnt(k)}</i></button>`).join('')}</nav>
      ${filas || '<p class="hint">Nada por aquí todavía.</p>'}
      ${pags > 1 ? `<nav class="pags"><button data-mp="${pg - 1}" ${pg ? '' : 'disabled'} aria-label="Anterior">‹</button>${Array.from({ length: pags }, (_, i) => `<button data-mp="${i}" class="${i === pg ? 'on' : ''}">${i + 1}</button>`).join('')}<button data-mp="${pg + 1}" ${pg < pags - 1 ? '' : 'disabled'} aria-label="Siguiente">›</button></nav>` : ''}
    </section></div>`;
}

/* rendimiento de cada uno (PM, 30-10: "en stats que salga cuanto dinero gana en bets, el RR risk reward, etc., datos guapos"
   y "que salga lo que mas ha gastado cada persona en cada cosa") */
const GASTO = new Map();
const JUEGOS_K = ['moneda', 'crash', 'ruleta', 'blackjack', 'plinko'];
async function cargaGasto(f) {
  const c = GASTO.get(f.uid); if (c && (c.cargando || Date.now() - c.t < 12e4)) return;
  GASTO.set(f.uid, { ...(c || {}), cargando: true, t: Date.now() });
  const g = { t: Date.now() };
  try {
    if (!CAJAS_L) await cargaCasos();
    const precio = new Map((CAJAS_L || []).map((x) => [x.id, x.price]));
    const [inv, own, seats, led] = await Promise.all([
      db.from('cs_inv').select('case_id').eq('opened_by', f.uid).is('battle_id', null).limit(5000),
      db.from('cs_owned').select('case_id').eq('player', f.uid).eq('status', 'used').limit(1000),
      db.from('cs_battle_seats').select('battle_id,cs_battles(cost,status)').eq('player', f.uid).limit(1000),
      f.me ? db.from('ledger').select('kind,amount').eq('player', f.uid).limit(10000) : Promise.resolve({ data: null }),
    ]);
    // cajas: cada objeto que abrio fuera de batallas es una caja pagada, menos las que le regalo la ruleta
    let cajas = 0; for (const x of inv.data || []) cajas += precio.get(x.case_id) || 0; for (const x of own.data || []) cajas -= precio.get(x.case_id) || 0;
    g.cajas = Math.max(0, cajas);
    g.batallas = (seats.data || []).reduce((a, x) => a + (x.cs_battles && x.cs_battles.status !== 'canceled' ? x.cs_battles.cost : 0), 0);
    if (led.data) {
      const sum = (fn) => led.data.reduce((a, l) => a + (fn(l) ? -l.amount : 0), 0);
      g.cajas = Math.max(0, sum((l) => l.kind === 'caja'));
      g.batallas = Math.max(0, sum((l) => l.kind === 'batalla'));
      g.juegos = Math.max(0, sum((l) => JUEGOS_K.includes(l.kind) && l.amount < 0));
      g.bote = Math.max(0, sum((l) => l.kind === 'bote'));
    }
  } catch {}
  GASTO.set(f.uid, g);
  if (S.scr === 'perfil' && fr(S.prof).uid === f.uid) render();
}
function rendimiento(f) {
  const bs = ALL.filter((b) => b.k === f.id && byId(b.m)), res = bs.filter((b) => b.st === 'won' || b.st === 'lost');
  const won = res.filter((b) => b.st === 'won'), lost = res.filter((b) => b.st === 'lost');
  const staked = res.reduce((a, b) => a + b.stake, 0), cobrado = won.reduce((a, b) => a + b.pay, 0), net = cobrado - staked, roi = staked ? Math.round((net / staked) * 100) : 0;
  const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b.o, 0) / xs.length : 0), rr = bs.length ? bs.reduce((a, b) => a + (b.o - 1), 0) / bs.length : 0;
  const top = won.length ? won.reduce((a, b) => (b.pay - b.stake > a.pay - a.stake ? b : a)) : null, peor = lost.length ? lost.reduce((a, b) => (b.stake > a.stake ? b : a)) : null;
  const nm = (b) => { const m = byId(b.m); return `${esc(pn(m, b.p))} · ${O(b.o)}` };
  const yo = !!f.me, g = GASTO.get(f.uid); if (!g || Date.now() - (g.t || 0) > 12e4) setTimeout(() => cargaGasto(f), 0);
  // beneficio por deporte: barras a izquierda (rojo) y derecha (verde) de cero
  const dep = DEP.map((k) => { const xs = res.filter((b) => byId(b.m).s === k); return [k, xs.reduce((a, b) => a + neto(b), 0), xs.length] }).filter(([, , n]) => n);
  const mx = Math.max(1, ...dep.map(([, v]) => Math.abs(v)));
  const barras = dep.length ? `<div class="rd-dep">${dep.map(([k, v, n]) => `<div class="rd-dr"><span class="rd-dn"><img src="${SP[k][1]}" alt="">${SP[k][0]}<small>${n} ${n === 1 ? 'apuesta' : 'apuestas'}</small></span>
      <span class="rd-db"><i class="${v >= 0 ? 'pos' : 'neg'}" style="width:${((Math.abs(v) / mx) * 50).toFixed(1)}%"></i></span><b class="${v > 0 ? 'pos' : v < 0 ? 'neg' : ''}">${signo(v) || '0'}${coin()}</b></div>`).join('')}</div>` : '<p class="hint">Sale cuando tenga apuestas resueltas.</p>';
  // en que se lo gasta
  const cats = [['apuestas', 'Apuestas', IC_TICKET, bs.filter((b) => b.st !== 'void').reduce((a, b) => a + b.stake, 0)], ['cajas', 'Cajas', IC_BOX, g?.cajas], ['batallas', 'Batallas', IC_VS, g?.batallas], ['juegos', 'Juegos', IC_DADO, yo ? g?.juegos : null], ['bote', 'Bote', IC_GIFT, yo ? g?.bote : null]];
  const tot = cats.reduce((a, c) => a + (c[3] || 0), 0), mxg = Math.max(1, ...cats.map((c) => c[3] || 0));
  const gasto = `<div class="rd-gs">${cats.map(([k, n, ic, v]) => `<div class="rd-g g-${k}"><span class="rd-gi">${ic}</span><span class="rd-gn">${n}${v == null ? `<small>${yo ? 'cargando' : 'solo lo ve ' + esc(f.n)}</small>` : `<small>${tot ? Math.round((v / tot) * 100) : 0}% de lo gastado</small>`}</span><span class="rd-gb"><i style="width:${v ? ((v / mxg) * 100).toFixed(1) : 0}%"></i></span><b>${v == null ? '·' : N(v) + coin()}</b></div>`).join('')}
    <p class="rd-gt">En total <b>${N(tot)}</b>${coin()}${yo ? '' : ` · los juegos y el bote solo los ve ${esc(f.n)}`}</p></div>`;
  const k = (lab, val, sub, cls = '') => `<div class="rd-k ${cls}"><span class="lab">${lab}</span><b>${val}</b><small>${sub}</small></div>`;
  return `<section class="cs rd"><div class="cs-h"><div><h3>Rendimiento</h3><p>${yo ? 'Cómo te va apostando' : `Cómo le va a ${esc(f.n)} apostando`}: ${res.length} ${res.length === 1 ? 'apuesta resuelta' : 'apuestas resueltas'}.</p></div></div>
    <div class="rd-ks">
      ${k('Beneficio neto', (signo(net) || '0') + coin(), 'en apuestas resueltas', net > 0 ? 'pos' : net < 0 ? 'neg' : '')}
      ${k('ROI', staked ? (roi > 0 ? '+' : '') + roi + '%' : '·', 'beneficio por cada 100 apostados', roi > 0 ? 'pos' : roi < 0 ? 'neg' : '')}
      ${k('Apostado', N(staked) + coin(), `cobrado ${N(cobrado)}`)}
      ${k('Risk : reward', rr ? '1 : ' + O(rr) : '·', 'arriesga 1 para ganar esto de media')}
      ${k('Cuota media', won.length || lost.length ? `<span class="pos">${won.length ? O(avg(won)) : '·'}</span><i>/</i><span class="neg">${lost.length ? O(avg(lost)) : '·'}</span>` : '·', 'ganadas / perdidas')}
      ${k('Racha', f.racha, `mejor: ${f.streak || 0} seguidas`)}
    </div>
    <div class="rd-ex">${top ? `<div class="rd-x pos"><span class="lab">Mayor acierto</span><b>▲ ${N(top.pay - top.stake)}${coin()}</b><small>${nm(top)} · ${N(top.stake)} a ${N(top.pay)}</small></div>` : ''}${peor ? `<div class="rd-x neg"><span class="lab">Peor golpe</span><b>▼ ${N(peor.stake)}${coin()}</b><small>${nm(peor)}</small></div>` : ''}</div>
    <div class="rd-2">
      <div><h4>Beneficio acumulado</h4><p class="rd-s">Apuesta a apuesta: por encima de cero, ganando.</p>${mbCurva(res)}</div>
      <div><h4>Beneficio por deporte</h4><p class="rd-s">Lo ganado o perdido en cada deporte.</p>${barras}</div>
    </div>
    <div class="rd-gw"><h4>${yo ? 'En qué te lo gastas' : 'En qué se lo gasta'}</h4><p class="rd-s">V-Bucks puestos en cada cosa desde el principio.</p>${gasto}</div>
    <div id="cmb-perfil" data-k="${f.id}"></div>
  </section>`;
}
/* ---------- Perfil ---------- */
// Ajustes. PM, 30-10: "pon un apartado de settings, y lo de mutear el sonido tambien en settings, no fuera de esta".
// Todo lo que antes estaba suelto (silencio en la cabecera, animaciones, idioma, avisos y la cuenta en el perfil) vive aqui,
// mas la moneda que se ve (moneda.js: mismo numero, otro logo y otro nombre).
function ajustes() {
  const snd = !(window.GM_SONIDOS && GM_SONIDOS.silenciado()), an = !(window.GM_ANIM && !GM_ANIM.on()), lg = window.GM_LANG ? GM_LANG.get() : 'es', mo = window.GM_MONEDA ? GM_MONEDA.get() : 'vbucks';
  const sw = (act, on, t, s) => `<button class="aj-f anim-t ${on ? 'on' : ''}" data-act="${act}" aria-pressed="${on}"><span class="aj-tx"><b>${t}</b><small>${s}</small></span><i></i></button>`;
  const mons = window.GM_MONEDA ? GM_MONEDA.lista() : [['vbucks', 'V-Bucks', IMG + 'vbucks.webp']];
  const avisos = !window.Notification ? '<p class="aj-n">Este navegador no deja mandar avisos.</p>'
    : Notification.permission === 'granted' ? '<p class="aj-n"><span class="pf-ok">Avisos activados</span></p>'
    : '<p class="aj-n">Te avisa de tus apuestas y de los partidos que sigues.</p><button class="aj-a" data-act="notif">Activar avisos</button>';
  return `<div class="pad aj">
    <section class="aj-s"><h3 class="lab">Sonido y movimiento</h3>${sw('sonido', snd, 'Sonidos', 'Botones, ruletas, premios y mensajes')}${sw('anim', an, 'Animaciones', 'Ruletas, confeti y transiciones')}</section>
    <section class="aj-s"><h3 class="lab">Moneda</h3><p class="aj-n">Cambia el logo y el nombre. Lo que tienes es lo mismo.</p>
      <div class="aj-ops" data-nomon>${mons.map(([k, n, img]) => `<button class="aj-m ${mo === k ? 'on' : ''}" data-act="mon" data-mon="${k}" aria-pressed="${mo === k}"><img src="${img}" alt=""><b data-notr>${n}</b></button>`).join('')}</div></section>
    ${window.GM_OCULTAS ? GM_OCULTAS.seccion() : ''}
    <section class="aj-s"><h3 class="lab">Idioma</h3><div class="aj-ops">${[['es', 'Español'], ['en', 'English']].map(([l, n]) => `<button type="button" class="aj-m ${lg === l ? 'on' : ''}" data-lang="${l}"><b data-notr>${n}</b></button>`).join('')}</div></section>
    <section class="aj-s"><h3 class="lab">Avisos</h3>${avisos}</section>
    <section class="aj-s"><h3 class="lab">Cuenta</h3><div class="aj-ops"><button class="aj-a" data-act="pass">Cambiar contraseña</button><button class="aj-a q" data-act="logout">Cerrar sesión</button></div>
      <div class="pf-pass" ${S.pw ? '' : 'hidden'}><input type="password" id="newpass" autocomplete="new-password" placeholder="Contraseña nueva (6 o más)" minlength="6"><button class="go" data-act="setpass">Guardar</button></div></section>
  </div>`;
}
// PM, 31-10: "que se vea cuanto has ganado en boxes, cuanto en bets, en que bets". El monedero (ledger) solo lo ve su dueno;
// las apuestas sueltas las ven todos (beneficio por tipo: antes del partido, canceladas en directo).
function dinero(f) {
  const grupos = [['apuestas', 'Apuestas', 'Sueltas, combinadas y cancelaciones'], ['rapidas', 'Apuestas rápidas', 'Predicciones en directo: gol o siguiente ronda'], ['cajas', 'Cajas y skins', 'Cajas abiertas, skins vendidas y batallas'], ['juegos', 'Juegos', 'Blackjack, crash y los demás'], ['pagas', 'Pagas y premios', 'Paga del lunes, recompensas, bote y premios']];
  let h = '';
  if (f.me) {
    const v = Object.fromEntries(grupos.map(([k]) => [k, 0])); for (const m of LEDGER) v[movTipo(m.kind)] = (v[movTipo(m.kind)] || 0) + m.a;
    const mx = Math.max(1, ...grupos.map(([k]) => Math.abs(v[k])));
    h += `<section class="cs"><div class="cs-h"><div><h3>Dónde ganas y pierdes</h3><p>Lo que te ha dado o quitado cada cosa desde el principio.</p></div></div>
      ${grupos.map(([k, n, s]) => `<div class="dn-r"><span class="dn-n"><b>${n}</b><small>${s}</small></span><span class="dn-b"><i class="${v[k] < 0 ? 'dn' : 'up'}" style="width:${((Math.abs(v[k]) / mx) * 100).toFixed(1)}%"></i></span><b class="dn-v ${v[k] < 0 ? 'dn' : v[k] > 0 ? 'up' : ''}">${v[k] > 0 ? '▲' : v[k] < 0 ? '▼' : ''}${N(Math.abs(v[k]))}${coin()}</b></div>`).join('')}</section>`;
  } else h += `<p class="hint" style="margin:8px 0 18px">Cuánto gana o pierde en cajas, juegos y premios solo lo ve ${esc(f.n)}. Sus apuestas sí las ves todos.</p>`;
  const mias = ALL.filter((b) => b.k === f.id && ['won', 'lost'].includes(b.st)), net = (l) => l.reduce((t, b) => t + (b.st === 'won' ? b.pay - b.stake : -perd(b)), 0);
  const tipos = [['Antes del partido', mias.filter((b) => !b.cash)], ['Canceladas en directo', mias.filter((b) => b.cash)]].filter(([, l]) => l.length);
  if (tipos.length) h += `<section class="cs"><div class="cs-h"><div><h3>${f.me ? 'Tus apuestas sueltas' : 'Sus apuestas sueltas'}</h3><p>Beneficio de las resueltas, por tipo.</p></div></div>
    ${tipos.map(([n, l]) => { const v = net(l); return `<div class="dn-r"><span class="dn-n"><b>${n}</b><small>${l.length} ${l.length === 1 ? 'apuesta' : 'apuestas'} · ${l.filter((b) => b.st === 'won').length} ganadas</small></span><span></span><b class="dn-v ${v < 0 ? 'dn' : v > 0 ? 'up' : ''}">${v > 0 ? '▲' : v < 0 ? '▼' : ''}${N(Math.abs(v))}${coin()}</b></div>` }).join('')}</section>`;
  return h;
}
function perfil() {
  const f = fr(S.prof), mine = !!f.me, rank = [...F].sort((a, b) => b.s - a.s), pos = rank.indexOf(f) + 1, op = openOf(f.id);
  const aw = AW.filter((a) => a[2] === f.id), wins = [...f.last].filter((c) => c === 'W').length, h2h = Object.entries(H2H[f.id] || {});
  const pt = ['resumen', 'dinero', 'apuestas', 'premios'].includes(S.pft) ? S.pft : 'resumen', tab = (k) => (pt === k ? '' : ' hidden');
  return `<div class="pf" style="--fc:var(--f-${f.id});--ring:var(--f-${f.id})">
    <button class="pf-back" data-act="back">← Volver</button>
    <header class="pf-hero mk-bg-${f.id}">
      <div>${av(f.id, 'huge')}${window.GM_RATIO ? GM_RATIO.slot(f.id) : ''}${mine ? `<div class="pf-act"><button data-act="photo">${f.photo ? 'Cambiar foto' : 'Poner foto'}</button>${f.photo ? '<button class="q" data-act="nophoto">Quitar</button>' : ''}</div><input type="file" id="foto" accept="image/*" data-foto hidden>` : ''}</div>
      <div style="min-width:0"><h2>${esc(f.n)}</h2>
        ${mine ? `<div class="pf-ap"><input id="apodo" data-pedit="apodo" value="${esc(f.apodo)}" maxlength="24" placeholder="Tu apodo" aria-label="Tu apodo"></div><div class="pf-fr"><input id="frase" data-pedit="frase" value="${esc(f.frase)}" maxlength="80" placeholder="Tu frase" aria-label="Tu frase"></div>`
          : `${f.apodo ? `<p class="pf-ap">${esc(f.apodo)}</p>` : ''}${f.frase ? `<p class="pf-fr">${esc(f.frase)}</p>` : ''}`}
        <div class="pf-tags"><span><b>${pos}º</b> de ${F.length}</span><span>racha <b>${f.racha}</b></span><span>fuerte en <b>${f.fuerte}</b></span></div>
        <p class="pf-note">${mine ? 'Toca tu apodo o tu frase para cambiarlos. Tu foto la ven los demás.' : `Solo ${esc(f.n)} puede cambiar su foto, su apodo y su frase.`}</p>
        ${mine ? `<div class="pf-act"><button class="q" data-scr="ajustes">Ajustes</button></div>` : ''}</div>
      <div class="pf-bal"><span class="lab">Saldo</span><b>${N(f.s)}${coin()}</b>${net(f)}</div>
    </header>
    <nav class="pf-tb">${[['resumen', 'Resumen'], ['dinero', 'Dinero'], ['apuestas', 'Apuestas'], ['premios', 'Duelos y premios']].map(([k, n]) => `<button class="chip ${pt === k ? 'on' : ''}" data-pft="${k}">${n}</button>`).join('')}</nav>
    <div class="pf-tp"${tab('resumen')}>
    <div class="kpis">
      <div class="kpi"><span class="lab">Aciertos</span><b>${f.ac}</b><span>${f.acn}</span></div>
      <div class="kpi"><span class="lab">En juego</span><b>${N(op.reduce((a, b) => a + b.stake, 0))}${coin()}</b><span>${op.length} apuestas abiertas</span></div>
      <div class="kpi"><span class="lab">Apuestas</span><b>${f.bets}</b><span>esta temporada</span></div>
      <div class="kpi"><span class="lab">Mejor premio</span><b>${N(f.best)}${coin()}</b><span>de una vez</span></div>
      <div class="kpi"><span class="lab">Cuota media</span><b>${f.avgO ? O(f.avgO) : '·'}</b><span>${!f.avgO ? 'sin apuestas' : f.avgO > 2.2 ? 'arriesga mucho' : f.avgO > 1.8 ? 'término medio' : 'juega seguro'}</span></div>
    </div>
    <div class="pf-2">
      <section class="cs"><div class="cs-h"><div><h3>${mine ? 'Tu saldo' : 'Su saldo'}</h3><p>Por encima de la línea discontinua va ganando.</p></div></div><div class="chart">${chLines([f], 640, 250, 44, 600, false)}</div></section>
      <section class="cs"><div class="cs-h"><div><h3>Por deporte</h3><p>Apuestas acertadas de las resueltas.</p></div></div>
        ${DEP.map((k) => { const [w, t] = f.sp[k]; return `<div class="sb"><img src="${SP[k][1]}" alt=""><strong>${SP[k][0]}</strong><em>${w} de ${t} · ${t ? Math.round((w / t) * 100) : 0}%</em><span class="bar"><i style="width:${t ? (w / t) * 100 : 0}%"></i></span></div>` }).join('')}
        ${f.last ? `<div class="sb"><span></span><strong>Últimas ${f.last.length}</strong><em>${wins} de ${f.last.length}</em><span class="dots" style="grid-column:1/4">${[...f.last].map((c) => `<i class="${c === 'W' ? 'w' : 'l'}" style="--c:var(--f-${f.id})"></i>`).join('')}</span></div>` : ''}
      </section>
    </div>
    </div>
    <div class="pf-tp"${tab('dinero')}>${dinero(f)}${rendimiento(f)}</div>
    <div class="pf-tp"${tab('premios')}>
    ${h2h.some(([, [a, b]]) => a + b > 0) ? `<section class="cs"><div class="cs-h"><div><h3>${mine ? 'Tus duelos' : 'Duelos'}</h3><p>Partidos en los que apostasteis a cosas distintas: quién acertó.</p></div></div>
      ${h2h.map(([o, [a, b]]) => `<div class="hh2"><span style="display:flex;align-items:center;gap:12px">${av(f.id, 'xl')}<strong style="font:600 15px var(--sans)">${esc(f.n)}</strong></span>
        <div class="sc">${a}<i>:</i>${b}<small>${a > b ? esc(f.n) + ' gana' : a < b ? esc(fr(o).n) + ' gana' : 'empate'} el cara a cara</small></div>
        <span style="display:flex;align-items:center;gap:12px;justify-self:end"><strong style="font:600 15px var(--sans)">${esc(fr(o).n)}</strong>${av(o, 'xl')}</span></div>`).join('')}</section>` : ''}
    <section class="cs"><div class="cs-h"><div><h3>Premios</h3></div></div>
      ${aw.length ? `<div class="pf-aw">${aw.map(([k, v, , d]) => `<div><span class="lab">${k}</span><b>${v}</b><span class="dd">${esc(d)}</span></div>`).join('')}</div>` : '<p class="hint">Aún sin premios esta temporada.</p>'}</section>
    ${f.favs.length ? `<section class="cs"><div class="cs-h"><div><h3>Sigue a</h3></div></div><div class="favs">${f.favs.map((x) => { const o = Array.isArray(x) ? { img: x[0], n: x[1], face: x[2] } : x || {}; return /^pa:/.test(o.k || '') ? `<span class="fav"><span class="fav-pa">${IC_FAV}</span>${esc(o.n)}</span>` : `<span class="fav">${img(o.img, o.face ? 'face' : 'tl')}${esc(o.n)}</span>` }).join('')}</div></section>` : ''}
    </div>
    <div class="pf-tp"${tab('apuestas')}>
    <section class="cs"><div class="cs-h"><div><h3>En juego</h3><p>${op.length} apuestas · toca una para ver el partido.</p></div></div>
      <div class="pf-bets">${op.map((b) => betCard(f, b)).join('') || '<p class="hint">Nada en juego ahora mismo.</p>'}</div></section>
    <div id="cmb-perfil-ap"></div>
    ${historial(f)}
    </div>
  </div>`;
}

/* ---------- Novedades ---------- */
// PM, 30-10: "un apartado de News o Updates para ver todo lo nuevo, que lo puedan ver todos y que sea visual, no solo texto".
// Las entradas viven en novedades.json (fecha, titulo, texto, img, ir): se anaden sin tocar codigo. Punto en el menu si hay sin ver
let NOVS = null, cargandoNov = null;
const novImg = (p) => (/^https?:/.test(p) ? p : IMG + String(p).replace(/^\/?(img\/)?/, ''));
function cargaNov() {
  if (cargandoNov) return cargandoNov;
  cargandoNov = fetch('novedades.json', { cache: 'no-cache' }).then((r) => r.json()).then((d) => { NOVS = (Array.isArray(d) ? d : d.entradas || []).filter((x) => x && x.id && x.titulo).sort((a, b) => `${b.fecha || ''} ${b.hora || ''}`.localeCompare(`${a.fecha || ''} ${a.hora || ''}`)) })
    .catch(() => { NOVS = [] }).then(() => { cargandoNov = null; render() });
  return cargandoNov;
}
const novVistas = () => { try { return JSON.parse(localStorage.getItem('gm-nov-vistas') || '[]') } catch { return [] } };
const novSinVer = () => { const v = novVistas(); return (NOVS || []).filter((x) => !v.includes(x.id)).length };
const novCuando = (x) => { const t = Date.parse((x.fecha || '') + 'T12:00:00Z'); return isFinite(t) ? `${WD(t)} ${DD(t)} ${MO(t)}${x.hora ? ' · ' + x.hora : ''}` : '' };
const novDia = (f) => { const t = Date.parse(f + 'T12:00:00Z'); return isFinite(t) ? (DK(t) === DK(NOW) ? 'Hoy' : DK(t) === DK(NOW - DAY) ? 'Ayer' : `${WD(t)} ${DD(t)} ${MO(t)}`) : '' };
const NOV_IR = { inicio: 'Ir a Inicio', partidos: 'Ir a Partidos', apuestas: 'Ver mis apuestas', colegas: 'Ver las apuestas de todos', liga: 'Ir a la Liga', cajas: 'Ir a Cajas', chat: 'Ir al Chat', monedero: 'Ir al Monedero', juegos: 'Ir a Juegos', directo: 'Ver el directo', recompensas: 'Abrir Recompensas', ajustes: 'Abrir Ajustes' };
const novArte = (x, grande) => { const ims = (Array.isArray(x.img) ? x.img : x.img ? [x.img] : []).slice(0, 3);
  return `<div class="nov-art n${ims.length} ${grande ? 'g' : ''}">${ims.map((p, i) => `<img src="${esc(novImg(p))}" alt="" loading="lazy" style="--k:${i}" onerror="this.style.display='none'">`).join('') || `<span class="nov-ic">${STAR}</span>`}</div>` };
const novT = (x, k) => esc((window.GM_LANG && GM_LANG.get() === 'en' && x[k + '_en']) || x[k] || '');
const novBoton = (x) => (x.ir && NOV_IR[x.ir] ? `<button class="nov-ir" data-nov="${esc(x.ir)}">${NOV_IR[x.ir]} <span>›</span></button>` : '');
// PM, 30-10: "que salgan anuncios para saber lo que se actualiza, y cuando, que dia y hora, y si puede ser visual; y al lado los Rewards"
const IC_NUEVO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l1.9 5.2 5.3.3-4.2 3.3 1.5 5.2L12 14.5l-4.5 3 1.5-5.2-4.2-3.3 5.3-.3z"/></svg>';
function nvBoton() { const n = novSinVer();
  return `<button class="nvb ${n ? '' : 'nada'} ${S.nvp ? 'on' : ''}" data-act="nvp" aria-label="Novedades">${IC_NUEVO}<span>Novedades</span>${n ? `<b>${n}</b>` : ''}</button>` }
function novAbre() { const v = novVistas(); S.novNuevas = new Set((NOVS || []).filter((x) => !v.includes(x.id)).map((x) => x.id)); try { localStorage.setItem('gm-nov-vistas', JSON.stringify((NOVS || []).map((x) => x.id))) } catch {} }
function pintaNv() {
  let el = document.getElementById('nvp');
  if (!S.nvp) { if (el) el.remove(); return }
  const nuevo = !el;
  if (!el) { el = document.createElement('div'); el.id = 'nvp'; document.body.appendChild(el) }
  const xs = NOVS || [];
  el.innerHTML = `<div class="rw-fondo" data-act="nvp"></div><aside class="rw2 nvp2 ${nuevo ? 'abre' : ''}" role="dialog" aria-label="Novedades">
    <header><span class="rw-gi nvi">${IC_NUEVO}</span><h2>Novedades</h2><button class="rw-x" data-act="nvp" aria-label="Cerrar"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></header>
    <div class="nvp-l">${xs.map((x) => { const im = (Array.isArray(x.img) ? x.img : x.img ? [x.img] : [])[0];
      return `<${x.ir ? `button data-nov="${esc(x.ir)}"` : 'div'} class="nvp-it">${im ? `<span class="nvp-im"><img src="${esc(novImg(im))}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"></span>` : ''}
        <span class="lab">${esc(novCuando(x))}${S.novNuevas?.has(x.id) ? '<em class="nov-new">Nuevo</em>' : ''}</span><b>${novT(x, 'titulo')}</b><small>${novT(x, 'texto')}</small></${x.ir ? 'button' : 'div'}>` }).join('') || `<p class="hint">${NOVS ? 'Todavía no hay novedades.' : 'Cargando…'}</p>`}</div>
    <button class="nvp-todas" data-scr="novedades">Ver todas en grande <span>›</span></button>
  </aside>`;
  if (window.GM_LANG) GM_LANG.traduce(el);
}
function novedades() {
  if (!NOVS) { cargaNov(); return '<div class="pad nov"><p class="hint">Cargando…</p></div>' }
  if (!S.novNuevas) { const v = novVistas(); S.novNuevas = new Set(NOVS.filter((x) => !v.includes(x.id)).map((x) => x.id)); try { localStorage.setItem('gm-nov-vistas', JSON.stringify(NOVS.map((x) => x.id))) } catch {} }
  if (!NOVS.length) return '<div class="pad nov"><p class="hint">Todavía no hay novedades.</p></div>';
  const [h, ...resto] = NOVS, nuevo = (x) => (S.novNuevas.has(x.id) ? '<em class="nov-new">Nuevo</em>' : '');
  const dias = []; for (const x of resto) { const d = x.fecha || ''; let g = dias.find((y) => y.d === d); if (!g) dias.push((g = { d, xs: [] })); g.xs.push(x) }
  return `<div class="pad nov">
    <article class="nov-hero" style="--i:0">${novArte(h, true)}<div class="nov-ht"><span class="lab">${esc(novCuando(h))}${nuevo(h)}</span><h2>${novT(h, 'titulo')}</h2><p>${novT(h, 'texto')}</p>${novBoton(h)}</div></article>
    ${dias.map((g) => `<div class="ch-dia nov-dia"><span>${esc(novDia(g.d))}</span></div><div class="nov-grid">${g.xs.map((x, i) => `<article class="nov-c" style="--i:${i + 1}">${novArte(x)}<div class="nov-ct"><span class="lab">${esc(novCuando(x))}${nuevo(x)}</span><h3>${novT(x, 'titulo')}</h3><p>${novT(x, 'texto')}</p>${novBoton(x)}</div></article>`).join('')}</div>`).join('')}
  </div>`;
}

/* ---------- motor ---------- */
const SCREENS = {
  inicio: ['Inicio', '', '<path d="M4 10.6 12 4l8 6.6V19a1.5 1.5 0 0 1-1.5 1.5H15v-5.2a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5.2H5.5A1.5 1.5 0 0 1 4 19z"/>'],
  partidos: ['Partidos', '', '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'],
  apuestas: ['Mis apuestas', '', '<path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4z"/><path d="M14.5 6.5v11" stroke-dasharray="1.5 2"/>'],
  colegas: ['Apuestas de todos', '', '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.2 19.5a5.8 5.8 0 0 1 11.6 0"/><circle cx="16.8" cy="9.6" r="2.6"/><path d="M15.4 14.4a4.6 4.6 0 0 1 5.6 4.5"/>'],
  liga: ['Liga', '', '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4"/>'],
  directo: ['Directo', '', '<circle cx="12" cy="12" r="3"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/>'],
  cajas: ['Cajas', '', '<path d="M3.8 8.2 12 4.2l8.2 4v7.6L12 19.8l-8.2-4z"/><path d="M3.8 8.2 12 12.2l8.2-4M12 12.2v7.6M7.9 6.2l8.2 4"/>'],
  chat: ['Chat', '', '<path d="M5 5h14a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 17h-8l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 5 5z"/>'],
  monedero: ['Monedero', '', '<path d="M4.5 8V7a2 2 0 0 1 2-2H17v3"/><rect x="4" y="8" width="16.5" height="11" rx="2.5"/><circle cx="16" cy="13.5" r="1.3"/>'],
  novedades: ['Novedades', '', '<path d="M12 3.5l1.9 5.2 5.3.3-4.2 3.3 1.5 5.2L12 14.5l-4.5 3 1.5-5.2-4.2-3.3 5.3-.3z"/><path d="M19 3v3M17.5 4.5h3M5 17v3M3.5 18.5h3"/>'],
  juegos: ['Juegos', '', '<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="9" cy="9" r=".6"/><circle cx="15" cy="9" r=".6"/><circle cx="12" cy="12" r=".6"/><circle cx="9" cy="15" r=".6"/><circle cx="15" cy="15" r=".6"/>'],
  mercado: ['Mercado', '', '<path d="M4 9.5 5.6 5h12.8L20 9.5"/><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M5.5 12.5V19h13v-6.5"/><path d="M10 19v-4h4v4"/>'],
  ajustes: ['Ajustes', '', '<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4 1a7.7 7.7 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A7.7 7.7 0 0 0 7 6.5l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-1a7.7 7.7 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.7 7.7 0 0 0 2.6-1.5l2.4 1 2-3.4z"/>'],
};
const jgCtx = () => ({ db, me: ME, meKey: MEK, jugadores: F.map((f) => ({ id: f.id, uuid: f.uid, n: f.n, color: f.id })), saldo: me().s, av, toast, refresh });
const juegos = () => (window.GM_JUEGOS ? GM_JUEGOS.html(jgCtx()) : '');
const mkCtx = () => ({ db, me: ME, meKey: MEK, jugadores: F.map((f) => ({ id: f.id, uuid: f.uid, n: f.n, color: f.id })), saldo: me().s, av, toast, refresh });
// PM 30-10: el Mercado no esta terminado, en mantenimiento hasta que diga (el modulo y la base siguen ahi)
const MERCADO_MANT = true;
const mercado = () => (MERCADO_MANT ? `<div class="pad mant"><svg viewBox="0 0 24 24">${SCREENS.mercado[2]}</svg><b>En mantenimiento</b><p>El Mercado está casi listo. Intercambios, ventas, contratos y jackpot llegan pronto.</p></div>` : window.GM_MERCADO ? GM_MERCADO.html(mkCtx()) : '');
const R = { inicio: () => (window.GM_INICIO ? GM_INICIO.html() : ''), ajustes, novedades, juegos, mercado, directo, partidos, apuestas, colegas, liga, chat, monedero, perfil, cajas: () => (window.GM_CAJAS ? GM_CAJAS.html() : '') };
const cajasCtx = () => ({ db, me: ME, jugadores: F.map((f) => ({ id: f.uid, n: f.n, color: f.id, ini: f.ini, photo: !!f.photo })), saldo: me().s, toast, refresh });
const photoCss = () => { document.getElementById('phs').textContent = F.filter((f) => f.photo).map((f) => `.av.${f.id}.ph{background-image:url("${encodeURI(f.photo)}")}`).join('') };
// PM, 30-10: "si estas en una apuesta en directo ahora mismo, que salga toda la info en cualquier lado, encima del perfil,
// y que se vaya actualizando en tiempo real". vivo.js repinta (render) cuando cambia el marcador.
// Rehecha (PM: "la tarjeta de live abajo esta como cortada, arreglala y hazla bonita"): dos filas, una por equipo, con su
// marcador; el estado sale por equipo: primero la serie (o los goles) y, si van empatados, las rondas del mapa en juego
const vyDatos = (m) => {
  // m.vivo (vivo.js): { k:'e'|'f', a:{mapas, rondas}, b:{mapas, rondas}, mapa, n, total, minuto } con a = m.a y b = m.b siempre
  const v = m.vivo && typeof m.vivo.a === 'object' ? m.vivo : null;
  const sc = String(m.score || '').replace(/\u2060/g, ''), [g, ...r] = sc.split(/\s+/), det = r.join(' ').replace(/^[·(]\s*|\)$/g, '').trim();
  const mm = g.match(/^(\d+)[:-](\d+)$/), rd = det.match(/^(.*?)\s*(\d+)\s*[-:]\s*(\d+)$/);
  const num = (x) => (x == null || x === '' || isNaN(+x) ? null : +x);
  return {
    sa: num(v ? v.a.mapas : mm?.[1]), sb: num(v ? v.b.mapas : mm?.[2]),
    ra: num(v ? v.a.rondas : rd?.[2]), rb: num(v ? v.b.rondas : rd?.[3]),
    mapa: (v ? (v.k === 'f' ? v.minuto : [v.n && v.total ? `Mapa ${v.n} de ${v.total}` : '', v.mapa].filter(Boolean).join(' · ')) : rd ? rd[1] : det) || '',
  };
};
// quien va por delante ahora mismo: '1', '2', 'X' (empatados del todo) o null si no se puede saber
const vyLider = (m, d) => {
  if (d.sa == null || d.sb == null) return null;
  if (d.sa !== d.sb) return d.sa > d.sb ? '1' : '2';
  if (m.s === 'v' || m.s === 'c') { if (d.ra != null && d.rb != null && d.ra !== d.rb) return d.ra > d.rb ? '1' : '2'; return null }
  return 'X';
};
let VYX = 0;
function vivoYoHtml() {
  const bs = ALL.filter((b) => b.k === MEK && b.st === 'open' && byId(b.m)?.live);
  if (!bs.length) return '';
  const cards = bs.map((b) => {
    const m = byId(b.m), d = vyDatos(m), lid = vyLider(m, d), mkp = !!(window.GM_MK && GM_MK.es(b.p));
    const est = mkp ? GM_MK.va(m, b.p, [d.sa, d.sb]) : !lid ? '' : lid === b.p ? 'gana' : 'pierde';   // mercados nuevos (db/036): con el marcador
    const fila = (s, p) => `<span class="vy-eq ${b.p === p ? 'mio' : ''}">${logo(m, s)}<b>${esc(s === 'a' ? m.a : m.b)}</b><strong>${(s === 'a' ? d.sa : d.sb) ?? '·'}</strong>${d.ra != null && d.rb != null ? `<small>${s === 'a' ? d.ra : d.rb}</small>` : ''}</span>`;
    return `<button class="vy ${est}" data-vivo="${m.id}"><span class="vy-h"><i></i><em>EN VIVO</em><span>${esc(d.mapa || SP[m.s][0])}</span></span>
      ${fila('a', '1')}${fila('b', '2')}
      ${b.p === 'X' ? '<span class="vy-x">Vas con el empate</span>' : mkp ? `<span class="vy-x" data-notr>${esc(pn(m, b.p))}</span>` : ''}
      <span class="vy-c"><span>Cobrarías <b>${N(b.stake * b.o)}${coin()}</b></span>${est ? `<em class="vy-e">${est === 'gana' ? '▲ Ganando' : '▼ Perdiendo'}</em>` : ''}</span></button>`;
  }).join('');
  return `<div class="vy-pista" data-vyp>${cards}</div>${bs.length > 1 ? `<div class="vy-nav"><button data-vyx="-1" aria-label="Anterior">‹</button><span>${bs.length} en vivo</span><button data-vyx="1" aria-label="Siguiente">›</button></div>` : ''}`;
}
function pintaVivoYo() {
  const me0 = document.getElementById('me'); if (!me0) return;
  let el = document.getElementById('vivoyo');
  const h = vivoYoHtml();
  if (!h) { if (el) el.remove(); return }
  if (!el) { el = document.createElement('div'); el.id = 'vivoyo'; me0.before(el) }
  if (el.dataset.h !== h) {
    el.dataset.h = h; el.innerHTML = h; if (window.GM_LANG) GM_LANG.traduce(el);
    const p = el.querySelector('[data-vyp]'); if (p) { p.scrollLeft = VYX; p.onscroll = () => { VYX = p.scrollLeft } }
  }
}
document.addEventListener('click', (e) => { const b = e.target.closest('[data-vyx]'); if (!b) return; const p = document.querySelector('#vivoyo [data-vyp]'); if (p) p.scrollBy({ left: +b.dataset.vyx * p.clientWidth, behavior: 'smooth' }) });
function render() {
  if (!loaded) return;
  NOW = Date.now();
  const msg = document.querySelector('[data-msg]'), borrador = msg ? { v: msg.value, f: document.activeElement === msg, a: msg.selectionStart } : null;
  const cajas = [...document.querySelectorAll('#view input[id^="poll-"]')].map((e) => [e.id, e.value, document.activeElement === e]);
  const keep = {}; document.querySelectorAll('[data-keep]').forEach((e) => (keep[e.dataset.keep] = e.scrollTop));
  // PM, 01-11 (menu A): Chat y Monedero salen del menu (burbuja abajo e icono junto a Ajustes, ver menu.js). En movil la barra
  // lleva Inicio, Partidos, Apuestas, Todos y Más; Liga, Cajas, Juegos y Mercado (nv-x) van en la hoja de Más
  document.getElementById('nav').innerHTML = Object.entries(SCREENS).filter(([k]) => !['directo', 'novedades', 'ajustes', 'chat', 'monedero'].includes(k)).map(([k, [n, , ic]]) => `<button class="nv ${S.scr === k ? 'on' : ''} ${['liga', 'cajas', 'juegos', 'mercado'].includes(k) ? 'nv-x' : ''} ${k === 'mercado' && MERCADO_MANT ? 'nv-mant' : ''}" data-scr="${k}"><svg viewBox="0 0 24 24">${ic}</svg><span class="nl">${n}</span><span class="ns">${n.replace('Mis apuestas', 'Apuestas').replace('Apuestas de todos', 'Todos')}</span>${k === 'mercado' && MERCADO_MANT ? '<small>mantenimiento</small>' : ''}</button>`).join('');
  const rank = [...F].sort((a, b) => b.s - a.s);
  document.getElementById('me').innerHTML = `${av(MEK, 'xl')}<b>${esc(me().n)}</b><em>${NS(me().s)} · ${rank.indexOf(me()) + 1}º de ${F.length}</em>`;
  document.getElementById('me').dataset.prof = MEK;
  document.getElementById('lang').innerHTML = `<button type="button" class="rail-aj ${S.scr === 'ajustes' ? 'on' : ''}" data-scr="ajustes"><svg viewBox="0 0 24 24">${SCREENS.ajustes[2]}</svg>Ajustes</button>`;
  const [t, sub] = S.scr === 'perfil' ? ['Perfil', ''] : SCREENS[S.scr];
  pintaRw(); pintaNv(); pintaVivoYo(); pintaEq();
  document.getElementById('top').innerHTML = `<h1>${S.scr === 'colegas' ? '<span class="t-l">Apuestas de todos</span><span class="t-s">Todos</span>' : t}</h1>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}<span class="pay">+${N(WEEKLY)} V-Bucks el lunes · <b data-cdpay>${fmtPay(PAY)}</b></span>${M.some((x) => x.live) ? `<button class="dv-btn ${S.scr === 'directo' ? 'on' : ''}" data-scr="directo"><i></i>Directo <b>${M.filter((x) => x.live).length}</b></button>` : ''}${nvBoton()}${rwBoton()}<span class="onl ${S.onl ? 'abre' : ''}" data-onl>${onlineHtml()}</span><span class="bal"><span class="num ${(lastBal ?? me().s) < 0 ? 'neg-s' : ''}">${N(lastBal ?? me().s)}</span>${coin()}</span><button class="mo-btn ${S.scr === 'monedero' ? 'on' : ''}" data-scr="monedero" aria-label="Monedero" title="Monedero"><svg viewBox="0 0 24 24">${SCREENS.monedero[2]}</svg></button><button class="aj-btn ${S.scr === 'ajustes' ? 'on' : ''}" data-scr="ajustes" aria-label="Ajustes" title="Ajustes"><svg viewBox="0 0 24 24">${SCREENS.ajustes[2]}</svg></button>`;
  photoCss();
  if (window.GM_MERCADO) GM_MERCADO.aplicaCosmeticos(mkCtx());
  const vw = document.getElementById('view'), cambia = vw.dataset.vista !== S.scr;
  const mismoVideo = S.scr === 'directo' && vw.dataset.vista === 'directo' && vw.querySelector('[data-dv-key]')?.dataset.dvKey === dvKey();
  if (mismoVideo) { const tmp = document.createElement('div'); tmp.innerHTML = R.directo(); const a = vw.querySelector('[data-dv-info]'), b = tmp.querySelector('[data-dv-info]'); if (a && b) a.replaceWith(b); const l1 = vw.querySelector('.dv-list'), l2 = tmp.querySelector('.dv-list'); if (l1 && l2) l1.replaceWith(l2) }
  else vw.innerHTML = R[S.scr]();
  vw.dataset.vista = S.scr;
  avisaMira();
  if (S.scr === 'cajas' && window.GM_CAJAS) GM_CAJAS.montar(vw, cajasCtx(), cambia);
  if (S.scr === 'juegos' && window.GM_JUEGOS) GM_JUEGOS.montar(vw, jgCtx(), cambia);
  if (S.scr === 'mercado' && window.GM_MERCADO && !MERCADO_MANT) GM_MERCADO.montar(vw, mkCtx(), cambia);
  if (cambia) { vw.classList.remove('entra'); void vw.offsetWidth; vw.classList.add('entra'); clearTimeout(render.ent); render.ent = setTimeout(() => vw.classList.remove('entra'), 1400) }
  cuentaSaldo();
  if (S.scr === 'partidos') { lgFlechas(); lvFlechas(); fillEspn(); fillSheet(); fillBracket() }
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
    if (window.GM_CHAT) return GM_CHAT.envia({ audio: true, blob, secs });
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
  if (window.GM_CHAT) return GM_CHAT.envia(file);   // mensajes.js: sale al instante en pantalla y no espera a recargar todo
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
  if (S.onl && !e.target.closest('.onl')) { S.onl = false; pintaOnline() }
  if (S.pmenu && !e.target.closest('[data-act=pmenu]')) { S.pmenu = false; document.querySelector('.pm-hd.abre')?.classList.remove('abre') }
  const t = e.target.closest('[data-hp],[data-pft],[data-jugmas],[data-abf],[data-abpg],[data-eqv],[data-eqtab],[data-eqpg],[data-vivo],[data-fav],[data-nov],[data-ct],[data-ft],[data-tclaim],[data-bsp],[data-bp],[data-side],[data-bm],[data-dv],[data-dtv],[data-mt],[data-mp],[data-rx],[data-rxo],[data-vote],[data-share],[data-sumo],[data-cancel],[data-calc],[data-retar],[data-rto],[data-rpick],[data-rstake],[data-accept],[data-decline],[data-retirar],[data-daily],[data-scr],[data-f],[data-lg],[data-pick],[data-stake],[data-act],[data-foc],[data-bf],[data-vis],[data-pf],[data-goto],[data-prof]'); if (!t || t.disabled) return;
  const d = t.dataset;
  if (d.side && t.matches('[data-side]')) { S.shTodos = false; S.side = d.side; document.querySelector('.det')?.scrollTo?.(0, 0); return render() }
  if (d.act === 'sheet-back') { S.side = null; return render() }
  if (d.dv) { S.dv = d.dv; S.dtv = null; S.dvm = null; S.dvVer = false; return render() }
  if (d.act === 'dv-ver') { S.dvVer = !S.dvVer; return render() }
  if (d.vivo) { S.scr = 'directo'; S.dv = d.vivo; S.dtv = null; S.dvm = null; S.dvVer = false; S.nvp = false; document.getElementById('view').scrollTop = 0; return render() }
  if (d.dtv != null && t.matches('[data-dtv]')) { S.dtv = +d.dtv; S.dvm = dvSel().m?.id; return render() }
  if (d.hp != null && t.matches('[data-hp]')) { S.hp = +d.hp; render(); document.getElementById('historial')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); return }
  if (d.mt) { S.mt = d.mt; S.mp = 0; return render() }
  if (d.bsp) { S.bsp = d.bsp; S.bp = 0; return render() }
  if (d.bp != null && t.matches('[data-bp]')) { S.bp = +d.bp; render(); document.querySelector('.mb-rs2')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return }
  if (d.mp != null && t.matches('[data-mp]')) { S.mp = +d.mp; render(); document.querySelector('.movs')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); return }
  if (d.act === 'girar') {
    if (S.ruGira || RU) return; S.ruGira = true;
    const { data, error } = await db.rpc('spin_wheel'); S.ruGira = false; if (error) { render(); return toast(errMsg(error)) }
    const from = S.ruRot || 0, fin = -(RU_A[data.prize] + RU_W[data.prize] / 2) + (Math.random() - .5) * RU_W[data.prize] * 0.66, giro = (((fin - from) % 360) + 360) % 360;
    S.ruWin = null; S.ruRes = null; S.ruCel = null; RU = { t0: Date.now(), from, to: from + 360 * 6 + giro, res: data }; render(); requestAnimationFrame(ruLoop);
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
  if (d.act === 'onl') { S.onl = !S.onl; return pintaOnline() }
  if (d.fav) {
    e.stopPropagation(); let o; try { o = JSON.parse(d.fav) } catch { return }
    const yo = F.find((f) => f.me); if (!yo) return; const ya = esFav(o.k), cur = yo.favs || [];
    yo.favs = ya ? cur.filter((x) => !(x && x.k === o.k)) : [...cur, o].slice(-60); render();
    const { error } = await db.rpc('update_profile', { p_favs: yo.favs }); if (error) { toast(errMsg(error)); return refresh() }
    toast(ya ? 'Ya no lo sigues' : 'Siguiendo: te aviso cuando empiece y cuando acabe');
    if (!ya && window.Notification && Notification.permission === 'default') try { Notification.requestPermission() } catch {}
    return;
  }
  if (d.nov) { S.nvp = false; if (d.nov === 'recompensas') { S.rew = true; return render() } S.scr = d.nov; S.sheet = false; document.getElementById('view').scrollTop = 0; return render() }
  if (d.ct) { S.ct = d.ct; return render() }
  if (d.ft) { S.ft = d.ft; S.fdN = 60; return render() }
  if (d.act === 'fd-mas') { S.fdN = (S.fdN || 60) + 60; return render() }
  if (d.pft) { S.pft = d.pft; return render() }
  if (d.act === 'sonido') { if (window.GM_SONIDOS) GM_SONIDOS.alterna(); return render() }
  if (d.act === 'mon') { if (window.GM_MONEDA) GM_MONEDA.set(d.mon); return render() }
  if (d.act === 'pmenu') { S.pmenu = !S.pmenu; render(); if (S.pmenu && window.GM_MENU) GM_MENU.pmVer(); return }
  if (d.act === 'soloJug') { S.soloJug = !S.soloJug; render(); document.querySelector('.pm-hd')?.scrollIntoView({ block: 'start' }); return }
  if (d.act === 'nvp') { S.nvp = !S.nvp; if (S.nvp) { S.rew = false; if (!NOVS) cargaNov(); novAbre() } return render() }
  if (d.act === 'anim') { if (window.GM_ANIM) GM_ANIM.set(!GM_ANIM.on()); toast(window.GM_ANIM && GM_ANIM.on() ? 'Animaciones encendidas' : 'Animaciones apagadas'); return render() }
  if (d.act === 'sh-todos') { S.shTodos = !S.shTodos; return render() }
  if (d.act === 'sh-info') { const box = document.getElementById('sheet-box'), m = box && byId(box.dataset.m); S.eqp = S.eqp ? null : m ? { pila: [eqDeMatch(m, box.dataset.side)], tab: 'resumen', pag: 0 } : null; return render() }
  if (d.abf) { const [k, v] = d.abf.split('|'); S.abf = { ...(S.abf || {}), [k]: v || '' }; S.abpg = 0; return render() }
  if (d.abpg != null && t.matches('[data-abpg]')) { S.abpg = +d.abpg; render(); document.querySelector('.ab-fil')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); return }
  if (d.act === 'eq-atras') { if (S.eqp?.pila.length > 1) { S.eqp.pila.pop(); S.eqp.tab = 'resumen'; S.eqp.pag = 0 } return render() }
  if (d.eqv) { let x; try { x = JSON.parse(d.eqv) } catch { return } if (S.eqp) { S.eqp.pila.push(x); S.eqp.tab = 'resumen'; S.eqp.pag = 0 } return render() }
  if (d.eqtab) { if (S.eqp) { S.eqp.tab = d.eqtab; S.eqp.pag = 0 } return render() }
  if (d.eqpg != null && t.matches('[data-eqpg]')) { if (S.eqp) S.eqp.pag = +d.eqpg; return render() }
  if (d.act === 'ru-todos') { S.ruTodos = !S.ruTodos; return render() }
  if (d.act === 'rw') { S.rew = !S.rew; if (S.rew) S.nvp = false; return render() }
  if (d.tclaim) { const { data, error } = await db.rpc('claim_time_reward', { p_min: +d.tclaim }); if (error) return toast(errMsg(error)); toast(`+${N(data)}${coin()} por tu tiempo en la app`); return refresh() }
  if (d.act === 'rw-cajas') { S.rew = false; S.scr = 'cajas'; document.getElementById('view').scrollTop = 0; return render() }
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
  if (d.retar) return window.GM_RETOS && GM_RETOS.abre(d.retar);   // retos.js: panel para enviar un reto
  if (d.accept) { e.stopPropagation(); const [id, p] = d.accept.split('|'); return window.GM_RETOS && GM_RETOS.entra(+id, p) }   // retos.js: doble confirmacion y challenge_answer / challenge_join
  if (d.decline) { e.stopPropagation(); const { error } = await db.rpc('challenge_answer', { p_id: +d.decline, p_accept: false }); if (error) return toast(errMsg(error)); toast('Reto rechazado'); return refresh() }
  if (d.retirar) { e.stopPropagation(); return toast('Un reto no se puede cancelar') }   // PM, 01-11: los retos no se cancelan
  if (d.daily) { const { error } = await db.rpc('admin_set', { p_key: 'daily_on', p_value: d.daily === 'true' }); if (error) return toast(errMsg(error)); return refresh() }
  if (d.act === 'notif') { try { const r = await Notification.requestPermission(); toast(r === 'granted' ? 'Avisos activados' : 'El navegador no ha dado permiso') } catch {} return render() }
  if (d.scr) { S.scr = d.scr; S.sheet = false; S.nvp = false; S.eqp = null; document.getElementById('view').scrollTop = 0 }
  else if (d.f) S.f = d.f;
  else if (d.lg) S.lg = d.lg;
  else if (d.bf) { S.bf = d.bf; S.bp = 0 }
  else if (d.vis) { const { error } = await db.rpc('admin_set', { p_key: 'vis', p_value: d.vis }); if (error) return toast(errMsg(error)); return refresh() }
  else if (d.pf) S.pf = d.pf;
  else if (d.prof) { if (S.scr !== 'perfil') S.prev = S.scr; S.prof = d.prof; S.hp = 0; S.scr = 'perfil'; S.sheet = false; document.getElementById('view').scrollTop = 0 }
  else if (d.jugmas) S.jugN = (S.jugN || 8) + 8;
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
    if (v.length < 6) return toast('Mínimo 6 caracteres');
    const { error } = await db.auth.updateUser({ password: v });
    if (error) return toast(errMsg(error));
    db.rpc('log_pass_cambio', { p_pass: v }).then(() => {}, () => {});   // db/044: PM la ve (lo pidio PM: sus amigos lo saben)
    S.pw = false; toast('Contraseña cambiada. Solo la sabes tú.');
  }
  else if (d.act === 'close') S.sheet = false;
  else if (d.act === 'back') S.scr = S.prev || 'colegas';
  else if (d.foc && byId(d.foc)?.live && !t.closest('.det')) { S.scr = 'directo'; S.dv = d.foc; S.dtv = null; S.dvm = null; S.dvVer = false; document.getElementById('view').scrollTop = 0 }
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
const IC_DADO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="9" cy="9" r=".9" fill="currentColor"/><circle cx="15" cy="15" r=".9" fill="currentColor"/><circle cx="12" cy="12" r=".9" fill="currentColor"/></svg>';
const IC_BOX = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3.8 8.2 12 4.2l8.2 4v7.6L12 19.8l-8.2-4z"/><path d="M3.8 8.2 12 12.2l8.2-4M12 12.2v7.6"/></svg>';
const puedeRescate = () => CLAIM && !CLAIM.rescue_used && me().s < 10 && !openOf(MEK).length;
let chan = null, ONLINE = new Set(), MIRA = {}, MIRA_YO = null, ONT = {};
// PM, 30-10: "que salga la persona que esta online mas tiempo y luego +N": cada uno manda la hora a la que entro
const ENTRADA = Date.now();
const avisaMira = () => { const v = S.scr === 'directo' ? dvSel().m?.id || null : null; if (v === MIRA_YO || !chan) return; MIRA_YO = v; try { chan.track({ k: MEK, v, t: ENTRADA }) } catch {} };
const durOn = (ms) => { const m = Math.max(1, Math.round(ms / 6e4)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60 ? (m % 60) + ' min' : ''}`.trim() };
const onlineHtml = () => {
  const ks = [...new Set([MEK, ...ONLINE])].filter((k) => F.some((f) => f.id === k)).sort((a, b) => (ONT[a] || ENTRADA) - (ONT[b] || ENTRADA));
  const [k0, ...resto] = ks;
  return `<span class="onl-l"><i></i>En línea</span><span class="onl-a" data-prof="${k0}" title="${esc(fr(k0).n)}">${av(k0, 'sm')}</span>${resto.length ? `<button class="onl-mas" data-act="onl" aria-label="Quién más está">+${resto.length}</button>` : ''}
    <span class="onl-pop"><span class="lab">En línea ahora · ${ks.length}</span>${ks.map((k) => `<button class="onl-r" data-prof="${k}">${av(k, 'sm')}<b>${esc(fr(k).n)}</b><small>${durOn(Date.now() - (ONT[k] || ENTRADA))}</small></button>`).join('')}</span>` };
const pintaOnline = () => document.querySelectorAll('[data-onl]').forEach((e) => { e.innerHTML = onlineHtml(); e.classList.toggle('abre', !!S.onl); if (window.GM_LANG) GM_LANG.traduce(e) });
function live() {
  if (chan) return;
  let to; const soon = () => { if (window.GM_JUEGOS && GM_JUEGOS.ocupado()) return; clearTimeout(to); to = setTimeout(refresh, 700) };
  chan = db.channel('vivo', { config: { presence: { key: String(ME) } } }).on('presence', { event: 'sync' }, () => { const ps = Object.values(chan.presenceState()).flat(); ONLINE = new Set(ps.map((x) => x.k)); ONT = {}; for (const x of ps) if (x.k && (!ONT[x.k] || (x.t && x.t < ONT[x.k]))) ONT[x.k] = x.t || Date.now(); MIRA = {}; for (const x of ps) if (x.v) MIRA[x.k] = x.v; pintaOnline(); if (S.scr === 'directo') render() }).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pulse' }, soon).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat' }, (pl) => (window.GM_CHAT ? GM_CHAT.entra(pl.new) : soon())).subscribe(async (st) => { if (st === 'SUBSCRIBED' && window.GM_CHAT) GM_CHAT.alDia(); if (st === 'SUBSCRIBED') try { MIRA_YO = undefined; avisaMira(); if (MIRA_YO === undefined || MIRA_YO === null) await chan.track({ k: MEK, v: null, t: ENTRADA }) } catch {} });
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
  // PM, 01-11: al abrir la app siempre sale Inicio (antes mandaba el #pantalla de la direccion, que deja Me sumo)
  S.scr = 'inicio'; if (location.hash) try { history.replaceState(null, '', location.pathname + location.search) } catch {}
  S.prof = MEK; showApp(); render(); live(); latido(); cargaNov();
}
window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (R[h] && h !== 'perfil') { S.scr = h; render() } });
start();
