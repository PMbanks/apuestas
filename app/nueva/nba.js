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
  const resB = (r) => `<b class="rs ${r === 'W' ? 'g' : 'p'}">${r === 'W' ? T('G', 'W') : T('P', 'L')}</b>`;

  /* ---------- ficha completa del equipo (PM, 01-11: "solo salen los ultimos 5 partidos, eso no me mola") ----------
     Todo viene de ESPN, gratis y sin clave, y se pide desde el navegador en cuanto se abre la ficha (los cinco sitios dejan CORS):
       standings?level=3 (conferencia, division, record, racha, puntos a favor y en contra de los 30)
       teams/{id}/schedule (toda la temporada), teams/{id}/roster (plantilla, fotos, lesiones),
       core .../teams/{id}/statistics (estadisticas del equipo con su puesto) y core .../athletes/{id}/statistics/0 (medias de cada jugador).
     Memoria en esta sesion y en sessionStorage (con try/catch), nada pasa por el sincronizador ni por la base. */
  const API = 'https://site.api.espn.com/apis', CORE = 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba';
  const jget = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const MEM = new Map();                                        // clave -> { t, d, p }
  function pide(k, ttl, f) {
    const c = MEM.get(k); if (c && Date.now() - c.t < ttl) return c.p;
    const e = { t: Date.now(), d: undefined, p: null }; MEM.set(k, e);
    let v; try { const s = JSON.parse(sessionStorage.getItem('gm-nba1:' + k) || 'null'); if (s && s.d != null && Date.now() - s.t < ttl) { v = s.d; e.t = s.t } } catch {}
    e.p = (v != null ? Promise.resolve(v) : f().catch(() => null)).then((d) => {
      if (d == null) { MEM.delete(k); return null }
      e.d = d; if (v == null) try { sessionStorage.setItem('gm-nba1:' + k, JSON.stringify({ t: e.t, d })) } catch {}
      return d;
    });
    return e.p;
  }
  const dato = (k) => { const c = MEM.get(k); return c ? c.d : undefined };   // lo que ya llego (undefined = aun no)
  const TTL = 3 * 60e3;
  let ANIO = null;                                              // anio de la temporada (2027 = 2026 27), lo da el calendario
  const anio = () => ANIO || (new Date().getMonth() >= 7 ? new Date().getFullYear() + 1 : new Date().getFullYear());
  const DIV = { Atlantic: ['Atlántico', 'Atlantic'], Central: ['Central', 'Central'], Southeast: ['Sureste', 'Southeast'], Northwest: ['Noroeste', 'Northwest'], Pacific: ['Pacífico', 'Pacific'], Southwest: ['Suroeste', 'Southwest'] };
  const sv = (e, k) => (e.stats || []).find((s) => s.name === k)?.displayValue;
  async function dClasif() {
    const j = await jget(`${API}/v2/sports/basketball/nba/standings?level=3`); if (!j?.children?.length) return null;
    const eq = {}, conf = {}, div = {};
    for (const c of j.children) {
      const cn = /west/i.test(c.name || '') ? 'W' : 'E'; conf[cn] = conf[cn] || [];
      for (const d of c.children || [c]) {
        div[d.name] = div[d.name] || [];
        for (const e of d.standings?.entries || []) {
          const t = e.team || {}, num = (k) => { const v = parseFloat(sv(e, k)); return isFinite(v) ? v : null };
          eq[t.id] = { id: String(t.id), n: t.displayName || '', c: t.shortDisplayName || t.name || t.displayName || '', lg: t.logos?.[0]?.href || '', w: num('wins'), l: num('losses'), pct: sv(e, 'winPercent') || '',
            sd: num('playoffSeed'), st: sv(e, 'streak') || '', l10: sv(e, 'Last Ten Games') || '', pf: num('avgPointsFor'), pa: num('avgPointsAgainst'), df: num('differential'), casa: sv(e, 'Home') || '', fu: sv(e, 'Road') || '', cf: cn, dv: d.name };
          conf[cn].push(String(t.id)); div[d.name].push(String(t.id));
        }
      }
    }
    const ord2 = (a, b) => (eq[a].sd ?? 99) - (eq[b].sd ?? 99) || (eq[b].w ?? 0) - (eq[a].w ?? 0);
    for (const k in conf) conf[k].sort(ord2); for (const k in div) div[k].sort(ord2);
    return Object.keys(eq).length > 5 ? { eq, conf, div } : null;
  }
  async function dSched(tid) {
    const j = await jget(`${API}/site/v2/sports/basketball/nba/teams/${tid}/schedule`); if (!j?.events?.length) return null;
    const seen = new Set(), ev = [];
    for (const e of j.events) {
      const c = e.competitions?.[0]; if (!c || seen.has(e.id)) continue; seen.add(e.id);
      const yo = (c.competitors || []).find((x) => String(x.team?.id) === String(tid)), el = (c.competitors || []).find((x) => x !== yo); if (!yo || !el) continue;
      const ty = c.status?.type || {}, sc = (x) => x?.score?.displayValue ?? x?.score ?? '';
      ev.push({ id: e.id, t: Date.parse(e.date), h: yo.homeAway === 'home', rid: String(el.team?.id), rn: el.team?.displayName || '', rl: el.team?.logos?.[0]?.href || el.team?.logo || '',
        done: !!ty.completed, live: ty.state === 'in', w: !!yo.winner, a: sc(yo), b: sc(el), ot: /OT/.test(ty.detail || ''), pp: /POSTPONED|CANCELED|SUSPENDED/i.test(ty.name || ''), dt: ty.shortDetail || '' });
    }
    ev.sort((x, y) => x.t - y.t);
    if (j.season?.year) ANIO = j.season.year;
    return ev.length ? { y: j.season?.year || null, s: j.season?.displayName || '', ev } : null;
  }
  async function dRoster(tid) {
    const j = await jget(`${API}/site/v2/sports/basketball/nba/teams/${tid}/roster`); if (!j?.athletes?.length) return null;
    const co = (j.coach || []).map((c) => `${c.firstName || ''} ${c.lastName || ''}`.trim())[0] || '';
    return { co, at: j.athletes.map((a) => ({ id: String(a.id), n: a.displayName || a.fullName || '', j: a.jersey || '', p: String(a.position?.abbreviation || '')[0] || '', h: a.height || 0, hd: a.displayHeight || '', ed: a.age || 0, im: a.headshot?.href || '', bj: a.injuries?.[0]?.status || '' })) };
  }
  const NEQ = ['avgPoints', 'fieldGoalPct', 'threePointFieldGoalPct', 'freeThrowPct', 'avgThreePointFieldGoalsMade', 'avgRebounds', 'avgAssists', 'avgSteals', 'avgBlocks', 'avgTurnovers', 'gamesPlayed'];
  async function dEq(tid) {
    const j = await jget(`${CORE}/seasons/${anio()}/types/2/teams/${tid}/statistics`); const cs = j?.splits?.categories; if (!cs) return null;
    const o = {}; for (const c of cs) for (const s of c.stats || []) if (NEQ.includes(s.name) && o[s.name] == null) o[s.name] = { v: s.value, r: s.rank ?? null };
    return o;
  }
  async function dJug(id) {
    let j; try { const r = await fetch(`${CORE}/seasons/${anio()}/types/2/athletes/${id}/statistics/0`); if (r.status === 404) return { gp: 0 }; if (!r.ok) return null; j = await r.json() } catch { return null }
    const o = {}; for (const c of j?.splits?.categories || []) for (const s of c.stats || []) o[s.name] = s.value;
    return { gp: o.gamesPlayed ?? 0, mn: o.avgMinutes ?? null, pt: o.avgPoints ?? null, rb: o.avgRebounds ?? null, as: o.avgAssists ?? null, fg: o.fieldGoalPct ?? null };
  }

  /* ---------- textos y formatos ---------- */
  const f1 = (x) => (x == null || !isFinite(x) ? '·' : dec((+x).toFixed(1)));
  const ord = (n) => (en() ? n + (([11, 12, 13].includes(n % 100) ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10]) || 'th') : n + 'º');
  const sgn = (x) => (x == null || !isFinite(x) ? '·' : (x > 0 ? '+' : x < 0 ? MENOS : '') + dec(Math.abs(x).toFixed(1)));
  const gp2 = (s) => String(s ?? '').replace(/\s*-\s*/g, ' · ');          // "4-2" -> "4 · 2"
  const racha = (s) => { const x = /^([WL])(\d+)$/.exec(String(s || '')); return x ? { w: x[1] === 'W', n: +x[2] } : null };
  const tz = () => g(() => TZ, undefined);
  const fd = (t) => new Intl.DateTimeFormat(en() ? 'en-GB' : 'es-ES', { timeZone: tz(), weekday: 'short', day: 'numeric', month: 'short' }).format(t).replace(/[.,]/g, '');
  const fdd = (t) => { const o = { timeZone: tz() }, l = en() ? 'en-GB' : 'es-ES', c = (x) => new Intl.DateTimeFormat(l, { ...o, ...x }).format(t).replace(/[.,]/g, ''); return `<i>${esc(c({ weekday: 'short' }))}</i>${esc(c({ day: 'numeric', month: 'short' }))}` };
  const fh = (t) => new Intl.DateTimeFormat(en() ? 'en-GB' : 'es-ES', { timeZone: tz(), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(t);
  const POS = { G: ['Base o escolta', 'Guard'], F: ['Alero', 'Forward'], C: ['Pívot', 'Center'] };
  const CONF = { E: ['Este', 'East', 'Conferencia Este', 'Eastern Conference'], W: ['Oeste', 'West', 'Conferencia Oeste', 'Western Conference'] };
  const dn = (d) => (DIV[d] ? DIV[d][en() ? 1 : 0] : d);
  const ini = (n) => String(n || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const FT = { key: null, tab: 'resumen', sort: 'pt', cal: 'todos', over: null, hp0: false, tid0: null, m: null, side: null, seq: 0, ircal: false, arriba: false };
  const TABS = [['resumen', 'Resumen', 'Summary'], ['plantilla', 'Plantilla', 'Roster'], ['clasificacion', 'Clasificación', 'Standings'], ['estadisticas', 'Estadísticas', 'Team stats'], ['calendario', 'Calendario', 'Schedule']];

  /* ---------- trozos de la ficha ---------- */
  function filaPartido(e, nuevo) {
    const sc = e.done ? `<span class="m ${e.w ? 'g' : 'p'}"><b>${esc(e.a)}</b><i>:</i>${esc(e.b)}${e.ot ? `<small>${T('prórroga', 'OT')}</small>` : ''}</span>` : e.live ? `<span class="m v"><b>${esc(e.a)}</b><i>:</i>${esc(e.b)}<small>${T('en directo', 'live')}</small></span>` : e.pp ? `<span class="m">${T('Aplazado', 'Postponed')}</span>` : `<span class="m h">${esc(fh(e.t))}</span>`;
    const ins = e.done ? resB(e.w ? 'W' : 'L') : '<span class="rs"></span>';
    return `<div class="nbf-g ${e.done ? '' : 'pr'} ${nuevo ? 'nx' : ''}"><span class="d">${fdd(e.t)}</span>${e.rl ? `<img class="lo" src="${esc(e.rl)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : '<span class="lo"></span>'}<span class="n"><b data-notr>${esc(e.rn)}</b><small>${e.h ? T('Local', 'Home') : T('Visitante', 'Away')}</small></span>${sc}${ins}</div>`;
  }
  function kpis(eq, sc) {
    const hechos = sc ? sc.ev.filter((e) => e.done) : [], gg = hechos.filter((e) => e.w).length;
    const w = eq ? eq.w : sc ? gg : null, l = eq ? eq.l : sc ? hechos.length - gg : null, r = racha(eq?.st);
    const c = (lab, val, sub, cls = '') => `<div class="nbf-k"><span class="lab">${lab}</span><b class="${cls}">${val}</b><small>${sub}</small></div>`;
    const gpL = T('G · P', 'W · L');
    return `<div class="nbf-ks">${c(T('Récord', 'Record'), w == null ? '·' : `${w} · ${l}`, gpL)}
      ${c(T('Conferencia', 'Conference'), eq?.sd ? ord(eq.sd) : '·', eq ? T(`del ${CONF[eq.cf][0]}`, `in the ${CONF[eq.cf][1]}`) : '')}
      ${c(T('División', 'Division'), eq && g(() => FT.cl.div[eq.dv].indexOf(eq.id) + 1, 0) ? ord(FT.cl.div[eq.dv].indexOf(eq.id) + 1) : '·', eq ? dn(eq.dv) : '')}
      ${c(T('Racha', 'Streak'), r ? r.n : '·', r ? (r.w ? (r.n === 1 ? T('victoria seguida', 'win in a row') : T('victorias seguidas', 'wins in a row')) : (r.n === 1 ? T('derrota seguida', 'loss in a row') : T('derrotas seguidas', 'losses in a row'))) : '', r ? (r.w ? 'g' : 'p') : '')}
      ${c(T('En casa', 'Home'), eq?.casa ? gp2(eq.casa) : '·', gpL)}
      ${c(T('Fuera', 'Away'), eq?.fu ? gp2(eq.fu) : '·', gpL)}</div>`;
  }
  const nada = (t) => `<p class="hint nbf-nada">${t || T('ESPN todavía no tiene estos datos.', 'ESPN does not have this data yet.')}</p>`;

  function tabResumen(tid, sc) {
    if (!sc) return nada();
    const hechos = sc.ev.filter((e) => e.done), ult = hechos.slice(-10), pend = sc.ev.filter((e) => !e.done);
    const gg = ult.filter((e) => e.w).length;
    const q = Array.from({ length: 10 }, (_, i) => { const e = ult[i - (10 - ult.length)]; return e ? `<b class="nbf-q ${e.w ? 'g' : 'p'}">${e.w ? T('G', 'W') : T('P', 'L')}</b>` : '<b class="nbf-q v"></b>' }).join('');
    let h = `<section class="nbf-s"><span class="lab">${T('Forma, últimos 10 partidos', 'Form, last 10 games')}</span>
      <div class="nbf-f">${q}</div><p class="nbf-fp">${hechos.length ? `${gg} ${gg === 1 ? T('ganado', 'won') : T('ganados', 'won')} · ${ult.length - gg} ${ult.length - gg === 1 ? T('perdido', 'lost') : T('perdidos', 'lost')}. ${T('El último partido está a la derecha.', 'The latest game is on the right.')}` : T('Todavía no ha jugado ningún partido.', 'No games played yet.')}</p></section>`;
    if (hechos.length) h += `<section class="nbf-s"><span class="lab">${T('Últimos 5 resultados', 'Last 5 results')}</span><div class="nbf-l">${hechos.slice(-5).reverse().map((e) => filaPartido(e)).join('')}</div></section>`;
    if (pend.length) h += `<section class="nbf-s"><span class="lab">${T('Próximos partidos', 'Next games')}</span><div class="nbf-l">${pend.slice(0, 3).map((e, i) => filaPartido(e, !i)).join('')}</div><button class="nbf-mas" data-nbt="calendario">${T('Ver el calendario completo', 'See the full schedule')} ›</button></section>`;
    const ro = dato('r:' + tid), bj = (ro?.at || []).filter((a) => a.bj);
    if (bj.length) h += `<section class="nbf-s"><span class="lab">${T('Lesionados', 'Injured')}</span><div class="nbf-l">${bj.map((a) => `<div class="nbf-bj"><b data-notr>${esc(a.n)}</b><span>${esc(estadoBaja(a.bj))}</span></div>`).join('')}</div></section>`;
    return h;
  }
  function tabPlantilla(tid) {
    const ro = dato('r:' + tid); if (!ro) return nada();
    const L = ro.at.map((a) => ({ a, s: dato('j:' + a.id) || {} }));
    const k = FT.sort, v = (x) => (x.s[k] == null || !(x.s.gp > 0) ? -1 : +x.s[k]);
    L.sort((x, y) => v(y) - v(x) || x.a.n.localeCompare(y.a.n));
    const cab = (kk, n) => `<button class="${kk === k ? 'on' : ''}" data-nbs="${kk}" aria-label="${esc(n)}">${n}</button>`;
    const fila = ({ a, s }) => {
      const tiene = s.gp > 0, m = a.h ? `${dec((a.h * 2.54 / 100).toFixed(2))} m` : '';
      const sub = [a.j ? '#' + a.j : '', POS[a.p] ? POS[a.p][en() ? 1 : 0] : ''].filter(Boolean).join(' · '), ext = en() ? [a.hd, a.ed ? a.ed + ' yrs' : ''] : [m, a.ed ? a.ed + ' años' : ''];
      return `<div class="nbf-p ${a.bj ? 'bj' : ''}"><span class="ph"><b>${esc(ini(a.n))}</b>${a.im ? `<img src="${esc(a.im)}" alt="" loading="lazy" onload="this.previousElementSibling.style.visibility='hidden'" onerror="this.remove()">` : ''}</span>
        <span class="n"><b data-notr>${esc(a.n)}</b><small>${esc(sub)}<em> · ${esc(ext.filter(Boolean).join(' · '))}</em></small>${a.bj ? `<i>${T('Lesionado', 'Injured')} · ${esc(estadoBaja(a.bj))}</i>` : ''}</span>
        <span class="x">${tiene ? s.gp : '·'}</span><span class="${k === 'pt' ? 'on' : ''}">${tiene ? f1(s.pt) : '·'}</span><span class="${k === 'rb' ? 'on' : ''}">${tiene ? f1(s.rb) : '·'}</span><span class="${k === 'as' ? 'on' : ''}">${tiene ? f1(s.as) : '·'}</span><span class="${k === 'mn' ? 'on' : ''}">${tiene ? f1(s.mn) : '·'}</span></div>`;
    };
    const hay = L.some((x) => x.s.gp > 0);
    return `<section class="nbf-s"><span class="lab">${T('Plantilla completa', 'Full roster')} · ${ro.at.length}</span>${ro.co ? `<p class="nbf-co">${T('Entrenador', 'Head coach')}: <b data-notr>${esc(ro.co)}</b></p>` : ''}
      <p class="nbf-fp">${hay ? T('Medias por partido de esta temporada. Toca una columna para ordenar.', 'Per game averages this season. Tap a column to sort.') : T('Todavía no hay estadísticas de esta temporada.', 'There are no stats for this season yet.')}</p>
      <div class="nbf-pl"><div class="nbf-p h"><span></span><span class="n">${T('Jugador', 'Player')}</span><span class="x">${T('PJ', 'GP')}</span>${cab('pt', 'PTS')}${cab('rb', 'REB')}${cab('as', 'AST')}${cab('mn', 'MIN')}</div>${L.map(fila).join('')}</div></section>`;
  }
  function tablaEq(ids, cl, tid, bandas) {
    const filas = ids.map((id, i) => {
      const e = cl.eq[id], r = racha(e.st), dif = e.df;
      const banda = bandas ? (e.sd <= 6 ? 'b1' : e.sd <= 10 ? 'b2' : 'b3') : '', cab = bandas && (e.sd === 1 || e.sd === 7 || e.sd === 11) ? `<div class="nbf-bd ${banda}"><span>${e.sd === 1 ? 'Playoffs' : e.sd === 7 ? T('Play in', 'Play in') : T('Fuera de playoffs', 'Missing the playoffs')}</span></div>` : '';
      return cab + `<button class="nbf-t ${id === tid ? 'me' : ''} ${banda}" data-nbteam="${id}"><span class="p">${bandas ? e.sd || i + 1 : i + 1}</span><img src="${esc(e.lg)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><span class="n" data-notr>${esc(e.c)}</span><span>${e.w ?? '·'}</span><span>${e.l ?? '·'}</span><span class="x">${esc(dec(e.pct.replace(/^0(?=\.)/, '')))}</span><span class="x">${sgn(dif)}</span><span class="x ${r ? (r.w ? 'g' : 'p') : ''}">${r ? (r.w ? T('G', 'W') : T('P', 'L')) + r.n : '·'}</span><span class="x">${esc(gp2(e.l10) || '·')}</span></button>`;
    }).join('');
    return `<div class="nbf-tb"><div class="nbf-t h"><span>#</span><span></span><span class="n">${T('Equipo', 'Team')}</span><span>${T('G', 'W')}</span><span>${T('P', 'L')}</span><span class="x">%</span><span class="x">${T('DIF', 'DIFF')}</span><span class="x">${T('Racha', 'Strk')}</span><span class="x">${T('Últ. 10', 'L10')}</span></div>${filas}</div>`;
  }
  function tabClasif(tid) {
    const cl = dato('cl'), eq = cl?.eq?.[tid]; if (!eq) return nada();
    return `<section class="nbf-s"><span class="lab">${CONF[eq.cf][en() ? 3 : 2]} · ${cl.conf[eq.cf].length}</span>${tablaEq(cl.conf[eq.cf], cl, tid, true)}<p class="nbf-fp">${T('Los seis primeros van a playoffs, del séptimo al décimo juegan el play in. Toca un equipo para ver su ficha.', 'The top six go to the playoffs, seventh to tenth play the play in. Tap a team to open its page.')}</p></section>
      <section class="nbf-s"><span class="lab">${T('División', 'Division')} ${esc(dn(eq.dv))} · ${cl.div[eq.dv].length}</span>${tablaEq(cl.div[eq.dv], cl, tid, false)}</section>`;
  }
  function tabStats(tid) {
    const cl = dato('cl'), eq = cl?.eq?.[tid], es = dato('e:' + tid); if (!es && !eq) return nada();
    const rk = (k, alza) => { if (!eq || eq[k] == null) return null; const t = Object.values(cl.eq).filter((x) => x[k] != null); return t.filter((x) => (alza ? x[k] > eq[k] : x[k] < eq[k])).length + 1 };
    const e = (k) => es?.[k]?.v, r = (k) => es?.[k]?.r;
    const F = [
      [T('Puntos a favor', 'Points scored'), eq ? f1(eq.pf) : '·', rk('pf', true)], [T('Puntos en contra', 'Points allowed'), eq ? f1(eq.pa) : '·', rk('pa', false)], [T('Diferencia por partido', 'Margin per game'), eq ? sgn(eq.df) : '·', rk('df', true)],
      [T('Tiros de campo', 'Field goals'), e('fieldGoalPct') != null ? f1(e('fieldGoalPct')) + ' %' : '·', r('fieldGoalPct')], [T('Triples, acierto', 'Three point %'), e('threePointFieldGoalPct') != null ? f1(e('threePointFieldGoalPct')) + ' %' : '·', r('threePointFieldGoalPct')],
      [T('Triples anotados por partido', 'Threes made per game'), f1(e('avgThreePointFieldGoalsMade')), null], [T('Tiros libres', 'Free throws'), e('freeThrowPct') != null ? f1(e('freeThrowPct')) + ' %' : '·', r('freeThrowPct')],
      [T('Rebotes', 'Rebounds'), f1(e('avgRebounds')), null], [T('Asistencias', 'Assists'), f1(e('avgAssists')), null], [T('Robos', 'Steals'), f1(e('avgSteals')), null], [T('Tapones', 'Blocks'), f1(e('avgBlocks')), null], [T('Pérdidas de balón', 'Turnovers'), f1(e('avgTurnovers')), null]];
    return `<section class="nbf-s"><span class="lab">${T('Estadísticas del equipo', 'Team stats')}${e('gamesPlayed') ? ` · ${e('gamesPlayed')} ${T('partidos', 'games')}` : ''}</span><p class="nbf-fp">${T('Medias por partido de esta temporada.', 'Per game averages this season.')}</p>
      <div class="nbf-es">${F.map(([n, v, p]) => `<div class="nbf-e"><span>${n}</span><b>${v}</b><i>${p ? `${ord(p)} ${T('de', 'of')} ${Object.keys(cl?.eq || {}).length || 30}` : ''}</i></div>`).join('')}</div>
      <p class="nbf-fp">${T('El puesto en la liga sale donde la fuente lo da.', 'The league rank shows where the source provides it.')}</p></section>`;
  }
  const POR = 10;
  function tabCal(tid, sc) {
    if (!sc) return nada();
    const todos = sc.ev, hechos = todos.filter((e) => e.done), pend = todos.filter((e) => !e.done);
    const lista = FT.cal === 'jugados' ? hechos.slice().reverse() : FT.cal === 'proximos' ? pend : todos;
    const pags = Math.max(1, Math.ceil(lista.length / POR));
    if (!FT.hp0) { FT.hp0 = true; const ix = FT.cal === 'todos' ? lista.findIndex((e) => !e.done) : 0; S.hp = ix > 0 ? Math.floor(ix / POR) : FT.cal === 'todos' && ix < 0 ? pags - 1 : 0 }
    const pg = Math.max(0, Math.min(+S.hp || 0, pags - 1)), de = pg * POR, tr = lista.slice(de, de + POR), prim = pend[0];
    const chip = (k, n, c) => `<button class="${FT.cal === k ? 'on' : ''}" data-nbc="${k}">${n} <small>${c}</small></button>`;
    return `<section class="nbf-s" id="nbf-cal"><span class="lab">${T('Temporada', 'Season')} ${esc(sc.s)} · ${todos.length} ${T('partidos', 'games')}</span>
      <div class="nbf-ch">${chip('todos', T('Todos', 'All'), todos.length)}${chip('jugados', T('Jugados', 'Played'), hechos.length)}${chip('proximos', T('Próximos', 'Upcoming'), pend.length)}</div>
      <div class="nbf-l">${tr.length ? tr.map((e) => filaPartido(e, e === prim && FT.cal !== 'jugados')).join('') : nada(T('No hay partidos en esta lista.', 'No games in this list.'))}</div>
      ${pags > 1 ? `<nav class="pags"><button data-hp="${pg - 1}" ${pg ? '' : 'disabled'} aria-label="${T('Anterior', 'Previous')}">‹</button><span class="pags-n" data-notr>${pg + 1} / ${pags}</span><button data-hp="${pg + 1}" ${pg < pags - 1 ? '' : 'disabled'} aria-label="${T('Siguiente', 'Next')}">›</button></nav>` : ''}
      ${lista.length ? `<p class="nbf-fp nbf-c">${T('Partidos', 'Games')} ${de + 1} ${T('a', 'to')} ${de + tr.length} ${T('de', 'of')} ${lista.length}</p>` : ''}</section>`;
  }

  /* ---------- armado y carga ---------- */
  function esqueleto(tid) { return cuerpo(tid, `<p class="hint nbf-nada">${T('Cargando la ficha…', 'Loading…')}</p>`) }
  function cuerpo(tid, contenido) {
    const m = FT.m, cl = dato('cl'), sc = dato('s:' + tid); FT.cl = cl;
    const volver = FT.over ? `<button class="nbf-back" data-nbback>‹ ${T('Volver a', 'Back to')} <span data-notr>${esc(FT.side === 'a' ? m.a : m.b)}</span></button>` : '';
    return `${volver}${kpis(cl?.eq?.[tid], sc)}<nav class="nb-tabs nbf-tabs">${TABS.map(([k, a, b]) => `<button class="nb-tab ${k === FT.tab ? 'on' : ''}" data-nbt="${k}">${T(a, b)}</button>`).join('')}</nav><div class="nbf-cu">${contenido}</div>
      <p class="nbf-fu">ESPN · ${T('se actualiza cada vez que abres la ficha', 'refreshed every time you open this page')}</p>`;
  }
  function listo(tid, tab) {
    if (dato('cl') === undefined || dato('s:' + tid) === undefined) return false;
    if (tab === 'plantilla') { const r = dato('r:' + tid); return r !== undefined && r.at.every((a) => dato('j:' + a.id) !== undefined) }
    if (tab === 'resumen') return dato('r:' + tid) !== undefined;
    if (tab === 'estadisticas') return dato('e:' + tid) !== undefined;
    return true;
  }
  async function carga(tid, tab) {
    await Promise.all([pide('cl', TTL, dClasif), pide('s:' + tid, TTL, () => dSched(tid))]);
    if (tab === 'plantilla') { const r = await pide('r:' + tid, TTL, () => dRoster(tid)); await Promise.all((r?.at || []).map((a) => pide('j:' + a.id, TTL, () => dJug(a.id)))) }
    else if (tab === 'resumen') await pide('r:' + tid, TTL, () => dRoster(tid));
    else if (tab === 'estadisticas') await pide('e:' + tid, TTL, () => dEq(tid));
  }
  function pintaFicha(box, tid) {
    const sc = dato('s:' + tid), t = FT.tab;
    const c = t === 'plantilla' ? tabPlantilla(tid) : t === 'clasificacion' ? tabClasif(tid) : t === 'estadisticas' ? tabStats(tid) : t === 'calendario' ? tabCal(tid, sc) : tabResumen(tid, sc);
    box.innerHTML = cuerpo(tid, c);
    // arriba: el nombre y el escudo de la cabecera siguen al equipo que se mira
    const hd = box.parentElement && box.parentElement.querySelector('.sh-hd'), eq = dato('cl')?.eq?.[tid], m = FT.m;
    if (hd) {
      const h2 = hd.querySelector('h2'), im = hd.querySelector('img'), fav = hd.querySelector('.fav-b');
      const nm = FT.over ? eq?.n || h2?.textContent : FT.side === 'a' ? m.a : m.b, lg = FT.over ? eq?.lg : FT.side === 'a' ? m.la : m.lb;
      if (h2 && nm && h2.textContent !== nm) h2.textContent = nm; if (im && lg && im.getAttribute('src') !== lg) im.src = lg; if (fav) fav.style.visibility = FT.over ? 'hidden' : '';
    }
    const on = box.querySelector('.nbf-tabs .on'); if (on) g(() => { const nv = on.parentElement, l = on.offsetLeft - nv.offsetLeft; if (l < nv.scrollLeft) nv.scrollLeft = Math.max(0, l - 8); else if (l + on.offsetWidth > nv.scrollLeft + nv.clientWidth) nv.scrollLeft = l + on.offsetWidth - nv.clientWidth + 8 });
    if (FT.arriba) { FT.arriba = false; g(() => { const v = document.getElementById('view'); if (v) v.scrollTop = 0; document.querySelector('.det')?.scrollTo?.(0, 0) }) }
    else if (FT.ircal) { FT.ircal = false; g(() => document.getElementById('nbf-cal')?.scrollIntoView({ block: 'start' })) }
    box.dataset.nb = FT.key;
  }
  async function ficha(box) {
    const tid = String(FT.over?.tid || FT.tid0), tab = FT.tab, mi = ++FT.seq, vivo = () => mi === FT.seq && box.isConnected && box.dataset.nbk === FT.key;
    if (!listo(tid, tab)) {
      box.innerHTML = esqueleto(tid);
      await carga(tid, tab).catch(() => {});
      if (!vivo()) return;
    }
    pintaFicha(box, tid);
  }
  async function fichaEquipo(box, m, side) {
    const k = m.id + side, tid = m.espn?.ids?.[side]; if (!tid) return;
    if (FT.key !== k) Object.assign(FT, { key: k, tab: 'resumen', sort: 'pt', cal: 'todos', over: null, hp0: false });
    Object.assign(FT, { m, side, tid0: String(tid) });
    box.dataset.nbk = k;
    await ficha(box);
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('#sheet-box [data-nbt],#sheet-box [data-nbs],#sheet-box [data-nbc],#sheet-box [data-nbteam],#sheet-box [data-nbback],#sheet-box [data-hp]'); if (!t) return;
    const d = t.dataset;
    if (d.hp != null && !d.nbt) { FT.ircal = true; return }                 // las paginas del calendario las mueve app.js (S.hp) y se repinta sola
    if (d.nbt) { FT.tab = d.nbt; FT.hp0 = false; FT.ircal = d.nbt === 'calendario' }
    else if (d.nbs) FT.sort = d.nbs;
    else if (d.nbc) { FT.cal = d.nbc; FT.hp0 = false }
    else if (d.nbteam) { FT.over = String(d.nbteam) === FT.tid0 ? null : { tid: String(d.nbteam) }; FT.tab = 'resumen'; FT.hp0 = false; FT.arriba = true }
    else if (d.nbback != null) { FT.over = null; FT.tab = 'resumen'; FT.hp0 = false; FT.arriba = true }
    e.preventDefault(); const box = document.getElementById('sheet-box'); if (box && box.dataset.nbk === FT.key) ficha(box);
  });
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
    if (tb) { const ver = box.querySelector('.ver'); const w = document.createElement('div'); w.className = 'nb-tbs'; w.innerHTML = tb; if (ver) ver.before(w); else box.appendChild(w) }
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
    // app.js escribe "No se ha podido cargar la ficha" cuando termina su propia carga (la NBA no la tiene): se vuelve a pintar la ficha
    else if (sb && sb.dataset.nbp && sb.dataset.nbk && sb.dataset.nbk === FT.key && !sb.querySelector('.nbf-ks') && /No se ha podido|could not/i.test(sb.textContent)) ficha(sb);
    if (!sb && FT.key) { FT.key = null; FT.over = null }
    if (pend) return; pend = true;
    queueMicrotask(() => { pend = false; try { if (g(() => loaded, false)) { pinta(); mejoraEspn(); nombres() } } catch (e) { if (!pinta.av) { pinta.av = 1; console.warn('nba.js', e) } } });
  }).observe(document.getElementById('app') || document.documentElement, { childList: true, subtree: true });
  addEventListener('gm:mk', () => pinta(true));
  setInterval(() => { if (!document.hidden && g(() => loaded, false)) nombres() }, 60e3);

  // ponNombres: nombres de jugadores que llegan por otro lado (las pruebas de pantalla los ponen asi, sin tocar la base)
  window.GM_NBA = { vivo, nombre, esN, va, cara, jugador: nombreJ, vivoDe: (id) => LV.get(id) || null, ponNombres: (o) => { for (const [k, v] of Object.entries(o || {})) PJ.set(String(k), String(v)); pinta(true) } };
})();
