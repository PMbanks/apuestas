// NBA en Gambling Addicts (PM, 01-11: "pon nba tambien pero solo nba, no las demas ligas, para poder apostar, y que sea como
// el futbol que se pueda apostar, y tambien a jugadores y todo eso"). Base: db/039_nba.sql. Sincronizador: sync/nba.mjs.
// Este modulo, aparte de app.js como mercados.js:
//  1) amplia GM_MK (mercados.js) con los codigos de la NBA, asi el boleto, Mis apuestas, Inicio, Todos, el resultado y las
//     combinadas los nombran, los agrupan y saben de que equipo son sin tocar nada mas;
//  2) pinta en la ficha del partido, mientras no ha empezado, el handicap, el total de puntos y las apuestas a jugadores
//     (cada cuota con data-pick="partido|codigo": boleto.js la mete en el boleto y place_bet la apuesta);
//  3) da a vivo.js el directo de la NBA (marcador, cuarto, reloj, parciales, hoja de cada jugador) desde ESPN;
//  4) rellena la ficha de cada equipo (Ver ficha) y mejora lo de ESPN en la ficha del partido (clasificacion y bajas).
// Codigos (los mismos que la base):
//   1, 2               gana el local o el visitante (cuenta la prorroga; no hay empate)
//   SP1-6.5  SP2+6.5   handicap del local o del visitante con esa linea
//   TO220.5  TU220.5   mas / menos de N puntos entre los dos
//   J1:4251:PO17.5     jugador del local (J1) o del visitante (J2), su id de ESPN, estadistica (P puntos, R rebotes,
//                      A asistencias, T triples, X puntos+rebotes+asistencias) y mas (O) o menos (U) de la linea
'use strict';
(function () {
  if (window.__nbaCargado) return; window.__nbaCargado = true;
  const BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
  const RE = { SP: /^SP([12])([+-])(\d{1,2}(?:\.5)?)$/, T: /^T([OU])(\d{3}(?:\.5)?)$/, J: /^J([12]):(\d{1,10}):([PRATX])([OU])(\d{1,2}\.5)$/ };
  const g = (f, d) => { try { const v = f(); return v === undefined ? d : v } catch { return d } };
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const en = () => document.documentElement.lang === 'en';
  const T = (es, ing) => (en() ? ing : es);
  const dec = (x) => String(x).replace('.', en() ? '.' : ',');
  const O = (x) => Number(x).toFixed(2).replace('.', en() ? '.' : ',');
  const MENOS = '−';                                       // signo menos de verdad (no es un guion)
  const ST = { P: ['puntos', 'points', 'Puntos', 'Points'], R: ['rebotes', 'rebounds', 'Rebotes', 'Rebounds'], A: ['asistencias', 'assists', 'Asistencias', 'Assists'],
    T: ['triples', 'threes', 'Triples', 'Threes'], X: ['pts + reb + asist', 'pts + reb + ast', 'P+R+A', 'P+R+A'] };
  const IX = { P: 0, R: 1, A: 2, T: 3 };
  const cara = (id, w = 96) => `https://a.espncdn.com/combiner/i?img=/i/headshots/nba/players/full/${id}.png&w=${w}&h=${Math.round(w * 0.73)}`;

  /* ---------- los codigos ---------- */
  const esN = (p) => typeof p === 'string' && (RE.SP.test(p) || RE.T.test(p) || RE.J.test(p));
  const PJ = new Map();                                         // id de jugador -> nombre (de matches.details.pj)
  const PJM = new Set();                                        // partidos con props del modelo (sin DraftKings)
  const nombreJ = (id) => PJ.get(String(id)) || T('Jugador', 'Player');
  const corto = (n) => { const w = String(n).split(' '); return w.length > 1 ? w[0][0] + '. ' + w.slice(1).join(' ') : n };   // "F. Wagner" si no cabe
  const equipos = (m) => [m?.a ?? m?.home ?? '', m?.b ?? m?.away ?? ''];
  function nombre(m, p) {
    const [A, B] = equipos(m); let x;
    if ((x = RE.SP.exec(p))) return `${x[1] === '1' ? A : B} ${x[2] === '+' ? '+' : MENOS}${dec(x[3])}`;
    if ((x = RE.T.exec(p))) return en() ? `${x[1] === 'O' ? 'Over' : 'Under'} ${x[2]} points` : `${x[1] === 'O' ? 'Más' : 'Menos'} de ${dec(x[2])} puntos`;
    if ((x = RE.J.exec(p))) return `${nombreJ(x[2])}: ${en() ? (x[4] === 'O' ? 'over' : 'under') : x[4] === 'O' ? 'más de' : 'menos de'} ${dec(x[5])} ${ST[x[3]][en() ? 1 : 0]}`;
    return String(p ?? '?');
  }
  const lado = (p) => { const x = RE.SP.exec(p) || RE.J.exec(p); return x ? x[1] : null };
  const grupo = (p) => { let x; if (RE.SP.test(p)) return 'SP'; if (RE.T.test(p)) return 'TP'; if ((x = RE.J.exec(p))) return `J${x[1]}:${x[2]}:${x[3]}`; return null };
  // como va en directo: con el marcador [local, visitante] y lo que se sabe del directo (minutos jugados, hoja de cada uno)
  function va(m, p, sc) {
    let x; const lv = m && LV.get(m.id)?.est;
    const ok = Array.isArray(sc) && sc.length > 1 && isFinite(sc[0]) && isFinite(sc[1]) && sc[0] !== '' && sc[1] !== '' && sc[0] != null && sc[1] != null;
    if ((x = RE.SP.exec(p))) { if (!ok) return ''; const d = (x[1] === '1' ? sc[0] - sc[1] : sc[1] - sc[0]) + (x[2] === '+' ? 1 : -1) * +x[3]; return d > 0 ? 'gana' : d < 0 ? 'pierde' : '' }
    if ((x = RE.T.exec(p))) {
      if (!ok) return ''; const t = +sc[0] + +sc[1], l = +x[2];
      if (t > l) return x[1] === 'O' ? 'gana' : 'pierde';
      if (!lv || !(lv.el > 3)) return '';
      const proy = t * Math.max(48, lv.el) / lv.el;                               // al ritmo de ahora
      return (proy > l) === (x[1] === 'O') ? 'gana' : 'pierde';
    }
    if ((x = RE.J.exec(p))) {
      const v = lv?.bx?.[x[2]]; if (!v) return '';
      const s = x[3] === 'X' ? v[0] + v[1] + v[2] : v[IX[x[3]]], l = +x[5];
      if (s > l) return x[4] === 'O' ? 'gana' : 'pierde';
      return '';
    }
    return '';
  }

  /* ---------- GM_MK ampliado (mercados.js lo crea; si no estuviera, uno minimo) ---------- */
  const MK0 = window.GM_MK || { valido: () => false, es: () => false, grupo: () => '1X2', lado: () => null, nombre: (m, p) => String(p ?? '?'), va: () => '', cuota: () => null, cuotas: () => null, carga: () => {} };
  const orig = { ...MK0 };
  Object.assign(MK0, {
    valido: (p) => esN(p) || orig.valido(p),
    es: (p) => esN(p) || orig.es(p),
    grupo: (p) => (esN(p) ? grupo(p) : orig.grupo(p)),
    lado: (p) => (esN(p) ? lado(p) : orig.lado(p)),
    nombre: (m, p) => (esN(p) ? nombre(m, p) : orig.nombre(m, p)),
    va: (m, p, sc) => (esN(p) ? va(m, p, sc) : orig.va(m, p, sc)),
  });
  window.GM_MK = MK0;
  const cuotas = (id) => g(() => GM_MK.cuotas(id), null) || {};

  /* ---------- nombres de los jugadores (matches.details.pj), solo de los partidos de la NBA que hacen falta ---------- */
  const PED = new Map();                                        // partido -> cuando se pidio
  let pidiendo = false;
  async function nombres() {
    const cli = g(() => db, null); if (!cli || pidiendo || !g(() => loaded, false)) return;
    const ids = new Set(g(() => M.filter((m) => m.s === 'b').map((m) => m.id), []));
    for (const c of g(() => (window.GM_CMB && GM_CMB.todas()) || [], [])) for (const l of c.combo_legs || []) if (l.matches?.sport === 'b' || esN(l.pick)) ids.add(l.match_id);
    const ahora = Date.now();
    const falta = [...ids].filter((id) => { const t = PED.get(id); if (!t) return true; const m = g(() => byId(id), null); return m && m.status === 'scheduled' && ahora - t > 10 * 60e3 });
    if (!falta.length) return;
    pidiendo = true; let nuevos = 0;
    try {
      for (let i = 0; i < falta.length; i += 100) {
        const { data, error } = await cli.from('matches').select('id,pj:details->pj,pjm:details->pjm').in('id', falta.slice(i, i + 100));
        if (error) throw error;
        for (const r of data || []) {
          PED.set(r.id, ahora);
          if (r.pjm === true) PJM.add(r.id); else PJM.delete(r.id);
          for (const [id, n] of Object.entries(r.pj && typeof r.pj === 'object' ? r.pj : {})) if (n && PJ.get(id) !== n) { PJ.set(id, String(n)); nuevos++ }
        }
      }
    } catch { for (const id of falta) PED.set(id, ahora - 8 * 60e3) }   // fallo: se reintenta en 2 minutos
    pidiendo = false;
    if (nuevos) { pinta(true); if (!document.activeElement?.matches('input,textarea')) g(() => render()) }
  }

  /* ---------- la ficha: handicap, total y jugadores ---------- */
  const abierto = (m) => m && m.status === 'scheduled' && Date.parse(m.at) > Date.now();
  const mias = (m) => new Set(g(() => ALL.filter((b) => b.k === MEK && b.m === m.id && b.st === 'open').map((b) => b.p), []));
  const V = { st: 'P', m: null };
  function boton(m, p, txt, mine, mk) {
    const o = mk[p];
    return !(o > 1) ? '<span class="mq-o na"></span>'
      : `<button type="button" class="mq-o ${mine.has(p) ? 'mine' : ''}" data-pick="${esc(m.id)}|${esc(p)}" title="${esc(nombre(m, p))}">${txt ? `<span class="mq-k" data-notr>${esc(txt)}</span>` : ''}<b>${O(o)}</b></button>`;
  }
  function par(m, titulo, picks, mine, mk) {
    const vivas = picks.filter(([p]) => mk[p] > 1); if (vivas.length < 2) return '';
    return `<section class="mq-g mq-pr"><div class="mq-hd"><span class="lab">${esc(titulo)}</span></div><div class="mq-ps">${vivas.map(([p, t]) => boton(m, p, t, mine, mk)).join('')}</div></section>`;
  }
  function bloque(m) {
    const mk = cuotas(m.id), ks = Object.keys(mk); if (!ks.length || !abierto(m)) return '';
    const mine = mias(m), [A, B] = equipos(m);
    let h = '';
    // handicap: una linea por equipo (la del local y la del visitante son la misma con el signo al reves)
    const s1 = ks.find((k) => RE.SP.exec(k)?.[1] === '1'), s2 = ks.find((k) => RE.SP.exec(k)?.[1] === '2');
    if (s1 && s2) {
      const lb = (k) => { const x = RE.SP.exec(k); return `${x[2] === '+' ? '+' : MENOS}${dec(x[3])}` };
      h += par(m, T('Hándicap', 'Spread'), [[s1, `${A} ${lb(s1)}`], [s2, `${B} ${lb(s2)}`]], mine, mk);
    }
    const tl = ks.map((k) => RE.T.exec(k)).find(Boolean)?.[2];
    if (tl) h += par(m, T(`Total de puntos · ${dec(tl)}`, `Total points · ${tl}`), [[`TO${tl}`, T(`Más de ${dec(tl)}`, `Over ${tl}`)], [`TU${tl}`, T(`Menos de ${dec(tl)}`, `Under ${tl}`)]], mine, mk);
    // jugadores: una pestaña por estadistica, una fila por jugador con su linea, mas y menos
    const js = ks.map((k) => RE.J.exec(k)).filter((x) => x && x[4] === 'O');
    if (js.length) {
      const hay = ['P', 'R', 'A', 'T', 'X'].filter((s) => js.some((x) => x[3] === s));
      if (V.m !== m.id) { V.m = m.id; V.st = 'P' }
      if (!hay.includes(V.st)) V.st = hay[0];
      const filas = js.filter((x) => x[3] === V.st).sort((a, b) => +b[5] - +a[5] || nombreJ(a[2]).localeCompare(nombreJ(b[2])));
      const tabs = hay.map((s) => `<button type="button" class="nb-tab ${s === V.st ? 'on' : ''}" data-nbst="${s}">${esc(ST[s][en() ? 3 : 2])}</button>`).join('');
      const fila = (x) => { const id = x[2], o = x[0], u = o.replace(/O(\d)/, 'U$1'), tm = x[1] === '1' ? m.la : m.lb;
        return `<div class="nb-r"><span class="nb-p"><span class="nb-f"><img src="${esc(cara(id))}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">${tm ? `<img class="nb-e" src="${esc(tm)}" alt="" loading="lazy" onerror="this.remove()">` : ''}</span><span class="nb-n"><b data-notr title="${esc(nombreJ(id))}"><span class="nb-lg">${esc(nombreJ(id))}</span><span class="nb-ct">${esc(corto(nombreJ(id)))}</span></b><small data-notr>${esc(x[1] === '1' ? A : B)}</small></span></span><span class="nb-l">${dec(x[5])}</span>${boton(m, o, '', mine, mk)}${boton(m, u, '', mine, mk)}</div>` };
      h += `<section class="mq-g nb-j"><div class="mq-hd nb-hd"><span class="lab">${T('Jugadores', 'Players')}</span></div><nav class="nb-tabs" role="tablist">${tabs}</nav>
        <div class="nb-r nb-rh"><span class="lab">${T('Jugador', 'Player')}</span><span class="lab nb-lh">${T('Línea', 'Line')}</span><span class="lab mq-ch">${T('Más', 'Over')}</span><span class="lab mq-ch">${T('Menos', 'Under')}</span></div>
        ${filas.map(fila).join('')}</section>`;
    }
    if (!h) return '';
    const real = m.src === 'draftkings';
    const fuente = [real ? T('Cuotas de DraftKings', 'DraftKings odds') : T('Con el récord de los dos', 'From both records'),
      js.length ? (PJM.has(m.id) ? T('jugadores con sus últimos partidos', 'players from their last games') : T('jugadores de DraftKings', 'players from DraftKings')) : '',
      T('se congelan al apostar', 'locked when you bet'), T('cuenta la prórroga', 'overtime counts'),
      js.length ? T('si un jugador no juega, se devuelve lo apostado', 'if a player does not play, your stake comes back') : ''].filter(Boolean);
    return `<div class="mq-top"><span class="lab">${T('Más apuestas', 'More bets')}</span></div>${h}<p class="hint mq-src">${fuente.join(' · ')}</p>`;
  }
  function pinta(forzar) {
    const det = document.querySelector('#view .det'); if (!det) return;
    const picks = det.querySelector('.picks'), ya = det.querySelector('.nb');
    const mid = (picks?.querySelector('[data-pick]')?.dataset.pick || '').split('|')[0] || det.querySelector('#espn-box')?.dataset.m || '';
    const m = picks && mid ? g(() => byId(mid), null) : null;
    if (!m || m.s !== 'b') { if (ya) ya.remove(); return }
    const html = bloque(m);
    if (!html) { if (ya) ya.remove(); return }
    const f = JSON.stringify([mid, html.length, html.slice(-60), V.st, [...mias(m)], document.documentElement.lang]);
    if (ya && ya.dataset.f === f && !forzar) return;
    const el = ya || document.createElement('div');
    el.className = 'nb'; el.dataset.f = f; el.innerHTML = html;                 // sin la clase mq: mercados.js borra la suya si no tiene nada
    if (!ya) { const tras = det.querySelector('.mq') || (picks.nextElementSibling && picks.nextElementSibling.matches('p.hint') ? picks.nextElementSibling : picks); tras.after(el) }
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-nbst]'); if (!t) return;
    V.st = t.dataset.nbst; pinta(true);
  });

  /* ---------- directo (vivo.js llama a GM_NBA.vivo cada 20 s con cada partido en juego) ---------- */
  const LV = new Map();                                         // partido -> { t, d, est: { el, bx } }
  const cuarto = (p) => (p <= 4 ? T(['1er', '2º', '3er', '4º'][p - 1] + ' cuarto', 'Q' + p) : p === 5 ? T('Prórroga', 'OT') : T(`${p - 4}ª prórroga`, `${p - 4}OT`));
  function hojaVivo(d, idLocal) {
    const out = { bx: {}, filas: [[], []] };
    for (const eq of d?.boxscore?.players || []) {
      const i = String(eq.team?.id) === String(idLocal) ? 0 : 1, st = eq.statistics?.[0]; if (!st) continue;
      const k = st.keys || [], c = (n) => k.indexOf(n);
      const iM = c('minutes'), iP = c('points'), iR = c('rebounds'), iA = c('assists'), iT = c('threePointFieldGoalsMade-threePointFieldGoalsAttempted');
      for (const a of st.athletes || []) {
        const s = a.stats || []; if (a.didNotPlay || !s.length) continue;
        const n = (j) => (j < 0 ? 0 : parseInt(String(s[j]).split('-')[0], 10) || 0);
        const v = [n(iP), n(iR), n(iA), n(iT)], min = n(iM);
        if (!min && !v.some(Boolean)) continue;
        out.bx[String(a.athlete?.id)] = v;
        out.filas[i].push({ id: String(a.athlete?.id), n: a.athlete?.shortName || a.athlete?.displayName || '', min, v, t3: iT >= 0 ? String(s[iT]) : '', ini: !!a.starter });
      }
    }
    return out;
  }
  async function datos(m) {
    const ev = m.espn?.event; if (!ev) return null;
    const c = LV.get(m.id); if (c && Date.now() - c.t < 15e3) return c;
    try {
      const r = await fetch(`${BASE}/summary?event=${ev}`, { cache: 'no-store' }); if (!r.ok) throw new Error(r.status);
      const d = await r.json(), comp = d?.header?.competitions?.[0], st = comp?.status || {};
      const h = comp?.competitors?.find((x) => x.homeAway === 'home');
      const per = Number(st.period) || 0, clk = Number(st.clock) || 0;
      const el = per <= 0 ? 0 : per <= 4 ? (per - 1) * 12 + (12 - clk / 60) : 48 + (per - 5) * 5 + (5 - clk / 60);
      const x = { t: Date.now(), d, est: { el, ...hojaVivo(d, h?.team?.id) } };
      LV.set(m.id, x); return x;
    } catch { return c || null }
  }
  function partes(st) {
    const n = st?.type?.name || '', p = Number(st?.period) || 0;
    if (/HALFTIME/.test(n)) return [T('Descanso', 'Halftime')];
    if (/END_PERIOD/.test(n)) return [cuarto(p), T('acabado', 'ended')];
    if (st?.type?.state === 'post') return [T('Final', 'Final')];
    if (!p) return [T('Empezando', 'Starting')];
    return [cuarto(p), String(st.displayClock || '')];
  }
  function pintaNba(m, x) {
    const d = x.d, comp = d?.header?.competitions?.[0]; if (!comp) return null;
    const st = comp.status || {}, h = comp.competitors?.find((c) => c.homeAway === 'home'), a = comp.competitors?.find((c) => c.homeAway === 'away');
    const enJ = st.type?.state === 'in', fin = st.type?.state === 'post';
    const sh = Number(h?.score) || 0, sa = Number(a?.score) || 0, pt = partes(st);
    const logo = (src, n) => (src ? `<img class="vv-lg" src="${esc(src)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : `<span class="vv-lg sin">${esc(String(n || '?').charAt(0))}</span>`);
    const hero = `<div class="vv-top">${enJ ? `<span class="vv-live"><i></i>${T('En directo', 'Live')}</span>` : fin ? `<span class="vv-fin">${T('Final', 'Final')}</span>` : `<span class="vv-fin">${T('Todavía no ha empezado', 'Not started yet')}</span>`}<span class="vv-sub">${esc(comp.venue?.fullName || d.gameInfo?.venue?.fullName || '')}</span></div>
      <div class="vv-hero fut"><div class="vv-t a">${logo(m.la, m.a)}<b>${esc(m.a)}</b></div>
        <div class="vv-sr"><span class="vv-min ${enJ ? 'on' : ''}">${esc(pt.join(' · '))}</span><strong><span class="${sh > sa ? 'ml' : ''}">${sh}</span><i>:</i><span class="${sa > sh ? 'ml' : ''}">${sa}</span></strong><small>${T('puntos', 'points')}</small></div>
        <div class="vv-t b">${logo(m.lb, m.b)}<b>${esc(m.b)}</b></div></div>`;
    // parciales por cuarto
    const ls = (c) => (c?.linescores || []).map((q) => q.displayValue ?? q.value ?? '');
    const lh = ls(h), la = ls(a), nq = Math.max(4, lh.length, la.length);
    const cab = Array.from({ length: nq }, (_, i) => (i < 4 ? String(i + 1) : i === 4 ? T('P', 'OT') : T(`P${i - 3}`, `OT${i - 3}`)));
    const fila = (n, l, tot, gana) => `<div class="nb-lr"><b data-notr>${esc(n)}</b>${cab.map((_, i) => `<span>${esc(l[i] ?? '')}</span>`).join('')}<strong class="${gana ? 'ml' : ''}">${tot}</strong></div>`;
    const parc = (lh.length || la.length) ? `<div class="nb-ls" style="--q:${nq}"><div class="nb-lr h"><b></b>${cab.map((c) => `<span>${c}</span>`).join('')}<strong>${T('Total', 'Total')}</strong></div>${fila(m.a, lh, sh, sh > sa)}${fila(m.b, la, sa, sa > sh)}</div>` : '';
    // hoja de cada jugador (los que han jugado), con los que tienen apuesta marcados
    const conApuesta = new Set(g(() => ALL.filter((b) => b.m === m.id && b.st === 'open' && b.p).map((b) => RE.J.exec(b.p)?.[2]).filter(Boolean), []));
    const tabla = (n, l, cls) => (l.length ? `<div class="nb-bx ${cls}"><div class="nb-br h"><b data-notr>${esc(n)}</b><span>MIN</span><span>PTS</span><span>REB</span><span>AST</span><span>3PT</span></div>${l.sort((p, q) => q.ini - p.ini || q.min - p.min).map((p) => `<div class="nb-br ${conApuesta.has(p.id) ? 'apo' : ''}"><b data-notr>${esc(p.n)}</b><span>${p.min}</span><span class="pt">${p.v[0]}</span><span>${p.v[1]}</span><span>${p.v[2]}</span><span>${esc(p.t3.replace('-', '/'))}</span></div>`).join('')}</div>` : '');
    const jug = x.est.filas[0].length || x.est.filas[1].length ? `<div class="nb-bxs">${tabla(m.a, x.est.filas[0], 'a')}${tabla(m.b, x.est.filas[1], 'b')}</div>` : `<p class="vv-nada">${T('La hoja de los jugadores sale en cuanto empiece.', 'The box score shows up once it starts.')}</p>`;
    // estadisticas de los dos
    const tm = d.boxscore?.teams || [], ih = tm.findIndex((t) => String(t.team?.id) === String(h?.team?.id)), ia = ih === 0 ? 1 : 0;
    const val = (i, k) => (tm[i]?.statistics || []).find((s) => s.name === k)?.displayValue;
    const filas = [['fieldGoalPct', T('Tiros de campo', 'Field goals'), '%'], ['threePointFieldGoalPct', T('Triples', 'Threes'), '%'], ['freeThrowPct', T('Tiros libres', 'Free throws'), '%'], ['totalRebounds', T('Rebotes', 'Rebounds'), ''], ['assists', T('Asistencias', 'Assists'), ''], ['turnovers', T('Pérdidas', 'Turnovers'), ''], ['steals', T('Robos', 'Steals'), ''], ['blocks', T('Tapones', 'Blocks'), '']]
      .map(([k, n, u]) => { const p = val(ih, k), q = val(ia, k); if (p == null && q == null) return ''; const np = parseFloat(p) || 0, nq2 = parseFloat(q) || 0, t = np + nq2 || 1;
        return `<div class="vv-st"><b class="${np > nq2 ? 'ml' : ''}">${esc(p ?? '·')}${u}</b><span class="et">${esc(n)}</span><b class="${nq2 > np ? 'ml' : ''}">${esc(q ?? '·')}${u}</b><div class="bs"><u class="a" style="width:${(np / t) * 100}%"></u><u class="b" style="width:${(nq2 / t) * 100}%"></u></div></div>` }).join('');
    return [hero, parc + jug, `${filas ? `<div class="vv-sts">${filas}</div>` : ''}<p class="vv-fuente">ESPN · ${T('se actualiza cada 20 s', 'updates every 20 s')}</p>`];
  }
  async function vivo(m) {
    const x = await datos(m); if (!x) return null;
    const comp = x.d?.header?.competitions?.[0]; if (!comp) return null;
    const h = comp.competitors?.find((c) => c.homeAway === 'home'), a = comp.competitors?.find((c) => c.homeAway === 'away');
    const sh = Number(h?.score) || 0, sa = Number(a?.score) || 0, pt = partes(comp.status);
    return { txt: `${sh}:${sa}`, html: pintaNba(m, x),
      vivo: { k: 'b', a: { mapas: sh, rondas: null }, b: { mapas: sa, rondas: null }, minuto: pt.join(' · '), partes: pt, lidera: sh === sa ? '' : sh > sa ? 'a' : 'b' } };
  }

  /* ---------- ficha de cada equipo (Ver ficha) y lo de ESPN en la ficha del partido ---------- */
  const resumen = (m) => g(() => ESPN.get(m.id)?.d, null);     // lo que ya pidio app.js (espnData) para la ficha
  async function resumenPide(m) {
    const ya = resumen(m); if (ya) return ya;
    try { const r = await fetch(`${BASE}/summary?event=${m.espn.event}`); return r.ok ? await r.json() : null } catch { return null }
  }
  const PLANT = new Map();
  const plantilla = (tid) => { if (!PLANT.has(tid)) PLANT.set(tid, fetch(`${BASE}/teams/${tid}/roster`).then((r) => (r.ok ? r.json() : null)).catch(() => null)); return PLANT.get(tid) };
  const resB = (r) => `<b class="rs ${r === 'W' ? 'g' : 'p'}">${r === 'W' ? T('G', 'W') : T('P', 'L')}</b>`;
  async function fichaEquipo(box, m, side) {
    const tid = m.espn?.ids?.[side]; if (!tid) return;
    const [d, ro] = await Promise.all([resumenPide(m), plantilla(tid)]);
    const now = document.getElementById('sheet-box'); if (!now || now.dataset.m !== m.id || now.dataset.side !== side) return;
    const nm = side === 'a' ? m.a : m.b, l5 = (d?.lastFiveGames || []).find((t) => String(t.team?.id) === String(tid))?.events || [];
    const rec = (m.tape || []).map((r) => r[side === 'a' ? 0 : 2]);
    const bio = [[T('Récord', 'Record'), rec[0]], [side === 'a' ? T('En casa', 'At home') : T('Fuera', 'Away'), rec[1]]].filter((x) => x[1]);
    let h = bio.length ? `<div class="bio">${bio.map(([k, v]) => `<div><span class="lab">${k}</span><b>${esc(String(v))}</b></div>`).join('')}</div>` : '';
    if (l5.length) {
      h += `<div class="shs"><span class="lab">${T('Forma', 'Form')}</span><span class="fm big">${l5.slice(0, 5).reverse().map((e) => resB(e.gameResult)).join('')}</span></div>`;
      h += `<div class="shs"><span class="lab">${T('Últimos partidos', 'Last games')}</span>${l5.map((e) => `<div class="shr"><img class="tl" src="${esc(e.opponent?.logo || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><span class="nm">${e.atVs === '@' ? '@ ' : ''}${esc(e.opponent?.displayName || '')}</span><span class="dt">${esc(g(() => dmy(Date.parse(e.gameDate)), ''))}</span><span class="mk">${esc(String(e.score || '').replace(/-/g, ':'))}</span>${resB(e.gameResult)}</div>`).join('')}</div>`;
    }
    const prox = g(() => board().filter((x) => x.s === 'b' && x.id !== m.id && (x.a === nm || x.b === nm)).sort((p, q) => Date.parse(p.at) - Date.parse(q.at)).slice(0, 4), []);
    if (prox.length) h += `<div class="shs"><span class="lab">${T('Próximos', 'Next')}</span>${prox.map((x) => `<div class="shr"><img class="tl" src="${esc(x.a === nm ? x.lb : x.la)}" alt="" loading="lazy"><span class="nm">${x.a === nm ? '' : '@ '}${esc(x.a === nm ? x.b : x.a)}</span><span class="dt">${esc(g(() => dmy(Date.parse(x.at)), ''))}</span><span class="mk">${esc(g(() => HM(Date.parse(x.at)), ''))}</span><span></span></div>`).join('')}</div>`;
    const bajas = ((d?.injuries || []).find((t) => String(t.team?.id) === String(tid))?.injuries || []);
    if (bajas.length) h += `<div class="shs"><span class="lab">${T('Bajas', 'Injuries')}</span>${bajas.map((b) => `<div class="shr nb-baja"><span class="nm" data-notr>${esc(b.athlete?.displayName || '')}</span><span class="dt">${esc(estadoBaja(b.status))}</span></div>`).join('')}</div>`;
    const at = ro?.athletes || [];
    if (at.length) {
      const grupos = [['G', T('Bases y escoltas', 'Guards')], ['F', T('Aleros', 'Forwards')], ['C', T('Pívots', 'Centers')]];
      h += `<div class="shs"><span class="lab">${T('Plantilla', 'Roster')}</span><div class="sq">${grupos.map(([k, n]) => { const x = at.filter((p) => String(p.position?.abbreviation || '').replace(/^.*-/, '')[0] === k);
        return x.length ? `<div><small>${n}</small>${x.map((p) => `<span><b>${esc(p.jersey || '')}</b><span data-notr>${esc(p.displayName)}</span></span>`).join('')}</div>` : '' }).join('')}</div></div>`;
    }
    now.innerHTML = h || `<p class="hint">${T('ESPN no tiene más datos de este equipo.', 'ESPN has no more data on this team.')}</p>`;
    now.dataset.nb = m.id + side;
  }
  const estadoBaja = (s) => ({ Out: T('No juega', 'Out'), 'Day-To-Day': T('Duda', 'Day to day'), Questionable: T('Duda', 'Questionable'), Doubtful: T('Casi seguro que no', 'Doubtful'), Probable: T('Probable', 'Probable') }[s] || String(s || '').replace(/-/g, ' '));
  // la clasificacion de la conferencia de cada uno (la de app.js pide puntos y partidos jugados, que en la NBA no vienen) y las bajas
  function mejoraEspn() {
    const box = document.getElementById('espn-box'); if (!box || box.querySelector(`[data-nbok="${document.documentElement.lang}"]`)) return;
    const m = g(() => byId(box.dataset.m), null); if (!m || m.s !== 'b') return;
    const d = resumen(m); if (!d || box.querySelector('.hint:only-child')) return;
    const ids = new Set(Object.values(m.espn?.ids || {}).map(String));
    const grupos = (d.standings?.groups || []).filter((gr) => (gr.standings?.entries || []).some((e) => ids.has(String(e.id))));
    const v = (e, k) => (e.stats || []).find((s) => s.name === k)?.displayValue ?? '';
    const tb = grupos.map((gr) => { const es = gr.standings.entries;
      return `<div class="tbl2 nb-tb"><span class="lab">${esc(gr.header || gr.name || T('Clasificación', 'Standings'))}</span><div class="tr2 h"><span class="p"></span><span class="nm"></span><span>${T('G', 'W')}</span><span>${T('P', 'L')}</span><span class="b">%</span></div>${es.map((e, i) => [e, i + 1]).filter(([e, i]) => i <= 4 || ids.has(String(e.id))).map(([e, i]) => `<div class="tr2 ${ids.has(String(e.id)) ? 'me' : ''}"><span class="p">${i}</span><span class="nm" data-notr>${esc(e.team?.displayName || e.team || '')}</span><span>${esc(v(e, 'wins'))}</span><span>${esc(v(e, 'losses'))}</span><span class="b">${esc(v(e, 'winPercent'))}</span></div>`).join('')}</div>` }).join('');
    box.querySelectorAll('.tbl2, .nb-tbs, .nb-bajas').forEach((x) => x.remove());
    if (tb && !box.querySelector(".fp-tab")) { const ver = box.querySelector('.ver'); const w = document.createElement('div'); w.className = 'nb-tbs'; w.innerHTML = tb; if (ver) ver.before(w); else box.appendChild(w) }
    const bajas = (d.injuries || []).flatMap((t) => (t.injuries || []).map((b) => ({ eq: t.team?.id, n: b.athlete?.displayName, s: b.status }))).filter((b) => b.n);
    if (bajas.length) {
      const w = document.createElement('div'); w.className = 'nb-bajas';
      w.innerHTML = `<span class="lab">${T('Bajas', 'Injuries')}</span><div class="nb-bj2">${[['a', m.a], ['b', m.b]].map(([s, n]) => { const l = bajas.filter((b) => String(b.eq) === String(m.espn.ids[s])); return `<div><small data-notr>${esc(n)}</small>${l.length ? l.map((b) => `<span><b data-notr>${esc(b.n)}</b><i>${esc(estadoBaja(b.s))}</i></span>`).join('') : `<span class="nada">${T('Ninguna', 'None')}</span>`}</div>` }).join('')}</div>`;
      const ver = box.querySelector('.ver'); if (ver) ver.before(w); else box.appendChild(w);
    }
    box.querySelectorAll('[data-nbok]').forEach((x) => x.remove());
    box.insertAdjacentHTML('beforeend', `<i data-nbok="${document.documentElement.lang}" hidden></i>`);
  }

  /* ---------- montaje: cada vez que la app repinta ---------- */
  let pend = false;
  new MutationObserver((ms) => {
    if (ms.every((x) => x.target.closest && x.target.closest('.nb'))) return;
    // la ficha de un equipo de la NBA: app.js no la sabe hacer y escribe "No se ha podido cargar la ficha"; se cambia antes de pintarse
    const sb = document.getElementById('sheet-box');
    if (sb && !sb.dataset.nbp) { const m = g(() => byId(sb.dataset.m), null);
      if (m && m.s === 'b') { sb.dataset.nbp = '1'; sb.innerHTML = `<p class="hint">${T('Cargando la ficha…', 'Loading…')}</p>`; fichaEquipo(sb, m, sb.dataset.side) } }
    else if (sb && sb.dataset.nbp && !sb.dataset.nb && /No se ha podido|could not/i.test(sb.textContent)) sb.innerHTML = `<p class="hint">${T('Cargando la ficha…', 'Loading…')}</p>`;
    if (pend) return; pend = true;
    queueMicrotask(() => { pend = false; try { if (g(() => loaded, false)) { pinta(); mejoraEspn(); nombres() } } catch (e) { if (!pinta.av) { pinta.av = 1; console.warn('nba.js', e) } } });
  }).observe(document.getElementById('app') || document.documentElement, { childList: true, subtree: true });
  addEventListener('gm:mk', () => pinta(true));
  setInterval(() => { if (!document.hidden && g(() => loaded, false)) nombres() }, 60e3);

  // ponNombres: nombres de jugadores que llegan por otro lado (las pruebas de pantalla los ponen asi, sin tocar la base)
  window.GM_NBA = { vivo, nombre, esN, va, cara, jugador: nombreJ, vivoDe: (id) => LV.get(id) || null, ponNombres: (o) => { for (const [k, v] of Object.entries(o || {})) PJ.set(String(k), String(v)); pinta(true) } };
})();
