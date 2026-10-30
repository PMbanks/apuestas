// Marcador en directo de Gambling Addicts (PM, 30-10: "lo de real time, mapa y score, esta terrible el modelo, hazlo bien,
// y que lo haga con el resto de partidos live, no solo con ese").
//
// Valorant  vlr.gg (vlr.orlandomm.net, CORS abierto): mapas, rondas con su lado CT o T, jugadores, picks y bans.
// CS2       bo3.gg a traves de una Edge Function de Supabase (supabase/functions/vivo), porque bo3.gg no tiene CORS.
//           Si la funcion aun no esta desplegada o falla, CS2 no enseña nada y todo lo demas sigue igual.
// Futbol    ESPN summary (CORS abierto): minuto, goles con asistencia, tarjetas, cambios y estadisticas.
//
// Hace tres cosas, todas desde aqui para no tocar app.js:
//  1. Pinta el marcador en la pantalla Directo, dentro de [data-dv-info], y esconde el marcador basico de la app.
//  2. Cada 20 s pone en M (la lista global de partidos) un marcador corto por partido en vivo ("1:0 · Haven 7-5").
//  3. Se acuerda del ultimo marcador por partido y lo vuelve a poner cada vez que la app rehace M o repinta
//     (load() rehace M desde la base y, sin esto, el marcador volvia al viejo hasta la siguiente vuelta).
'use strict';
(function () {
  if (window.__vivoCargado) return; window.__vivoCargado = true;
  const VLR = 'https://vlr.orlandomm.net/api/v1';
  const CFG = window.APP_CONFIG || {};
  const EDGE = (CFG.url || 'https://cfxajqycetwdivmldrob.supabase.co') + '/functions/v1/vivo';
  const CADA = 20000;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

  /* ---------- nombres: encontrar el partido de la API a partir del de la app, sin falsos positivos ---------- */
  const base = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  // palabras que distinguen a un equipo de su filial o de su version femenina: tienen que coincidir en los dos
  const VARIANTE = /^(academy|junior|jr|youth|fe|female|women|gc|ii|iii|2|b|white|black|blue|red)$/;
  const RELLENO = /^(esports?|gaming|team|club|gg|the|fc)$/, RELLENO2 = /^(esports?|gaming|club|gg|the|fc)$/;
  function claves(s) {
    const t = base(s).split(/[^a-z0-9]+/).filter(Boolean);
    const full = t.join(''), sinV = t.filter((x) => !VARIANTE.test(x));
    let core = sinV.filter((x) => !RELLENO.test(x)).join('');
    // "A Team": al quitar "team" queda "a", demasiado corto, asi que "team" se queda; "G2 Esports" si puede quedarse en "g2"
    if (core.length < 3) core = sinV.filter((x) => !RELLENO2.test(x)).join('');
    if (core.length < 2) core = full;
    return { full, core, vars: t.filter((x) => VARIANTE.test(x)).sort().join('.') };
  }
  function parecido(x, y) {
    const a = claves(x), b = claves(y);
    if (!a.full || !b.full || a.vars !== b.vars) return false;
    if (a.full === b.full || a.core === b.core) return true;
    const mn = Math.min(a.core.length, b.core.length), mx = Math.max(a.core.length, b.core.length);
    return mn >= 5 && mn / mx >= 0.65 && (a.core.includes(b.core) || b.core.includes(a.core));
  }
  const alguno = (lista, n) => lista.some((x) => parecido(x, n));
  // los dos equipos de la app contra los dos de la API (con sus alias); devuelve null, 'dir' o 'rev'
  function cruce(ax, bx, a, b) {
    if (alguno(ax, a) && alguno(bx, b)) return 'dir';
    if (alguno(ax, b) && alguno(bx, a)) return 'rev';
    return null;
  }

  /* ---------- red, con cache, sin duplicar peticiones y con el ultimo dato bueno si falla ---------- */
  const cc = new Map(), ultimo = new Map();
  function cached(k, ttl, fn) {
    const c = cc.get(k); if (c && Date.now() - c.t < ttl) return c.p;
    const p = Promise.resolve().then(fn).then((d) => { ultimo.set(k, d); return d }, () => ultimo.get(k) ?? null);
    cc.set(k, { t: Date.now(), p }); return p;
  }
  async function json(url, opts) { const r = await fetch(url, { cache: 'no-store', ...opts }); if (!r.ok) throw new Error(r.status); return r.json() }

  /* ---------- modelo comun de una serie (Valorant y CS2) ----------
     { fuente, fmt, estado:'live'|'fin', torneo, fase, a:{n,img,s}, b:{...},
       maps:[{n,nombre,est:'fin'|'live'|'pend', a,b, ganador:0|1|2, pick:0|1|2, rondas:[{w:1|2,lado,how,icono}], ct:[x,y], t:[x,y], jug:[[...],[...]]}],
       picks:[...] }                                                                                                 */
  const mapaNombre = (m) => m.nombre || `Mapa ${m.n}`;
  function mitades(rondas) {
    const ct = [0, 0], t = [0, 0];
    for (const r of rondas) (r.lado === 'ct' ? ct : t)[r.w - 1]++;
    return { ct, t };
  }

  /* --- Valorant --- */
  const vlrLista = () => cached('vlr:lista', CADA, async () => (await json(`${VLR}/matches`)).data || []);
  const vlrDetalle = (id) => cached('vlr:' + id, CADA, async () => (await json(`${VLR}/matches/${id}`)).data);
  async function serieValorant(a, b) {
    const lista = (await vlrLista()) || [];
    const cand = lista.filter((x) => (x.teams || []).length === 2 && cruce([x.teams[0].name], [x.teams[1].name], a, b));
    const m = cand.find((x) => /live/i.test(x.status)) || cand[0];
    if (!m) return null;
    const d = await vlrDetalle(m.id); if (!d) return null;
    const rev = cruce([d.teams?.[0]?.name], [d.teams?.[1]?.name], a, b) === 'rev', par = (x) => (rev ? [x[1], x[0]] : x);
    const [ta, tb] = par(d.teams || [{}, {}]);
    const sa = num(ta.score) ?? 0, sb = num(tb.score) ?? 0, hechos = sa + sb, completo = /complet|final/i.test(d.status || '');
    const mapas = (d.maps || []).filter((x) => x.name && !/all maps/i.test(x.name));
    // la API tarda en marcar un mapa como acabado: los acabados son los que ya cuentan en la serie y el siguiente esta en juego
    const maps = mapas.map((x, i) => {
      const [p, q] = par(x.teams || [{}, {}]);
      const est = i < hechos ? 'fin' : i === hechos && !completo ? 'live' : 'pend';
      let ant = [0, 0];
      const rondas = (x.rounds || []).filter((r) => r.score).map((r) => {
        const [u, v] = String(r.score).split('-').map(Number), g = u > ant[0] ? 0 : 1; ant = [u, v];
        return { w: (rev ? 1 - g : g) + 1, lado: String(r.side).toLowerCase() === 'ct' ? 'ct' : 't', how: r.method, icono: r.methodIcon, n: r.number };
      });
      // el marcador del mapa: el de la API, y si aun no lo trae (pasa en los acabados) el de la ultima ronda
      let ra = num(p.score), rb = num(q.score);
      if (ra == null && rb == null && rondas.length) { ra = rondas.filter((r) => r.w === 1).length; rb = rondas.length - ra }
      const h = mitades(rondas);
      const ganador = est === 'fin' && ra != null ? (ra > rb ? 1 : rb > ra ? 2 : 0) : 0;
      const pick = x.pickedBy ? (parecido(x.pickedBy, a) ? 1 : parecido(x.pickedBy, b) ? 2 : 0) : 0;
      return { n: i + 1, nombre: x.name, est, a: ra, b: rb, ganador, pick, rondas, ct: h.ct, t: h.t, jug: jugadoresVlr(x.players, [ta, tb], rev) };
    });
    return {
      fuente: 'vlr.gg', fmt: d.format || '', estado: completo ? 'fin' : 'live', torneo: d.event?.name || '', fase: d.event?.series || '',
      a: { n: a, img: ta.img, s: sa }, b: { n: b, img: tb.img, s: sb }, maps,
      picks: (d.picksBans?.list || []).map((x) => ({ accion: x.action, mapa: x.map, eq: x.team })),
    };
  }
  // los jugadores vienen de diez en diez, los cinco primeros del primer equipo de la API
  function jugadoresVlr(ps, eqs, rev) {
    if (!ps?.length) return null;
    const tags = [...new Set(ps.map((p) => p.teamTag).filter(Boolean))];
    let g = [ps.filter((p) => p.teamTag === tags[0]), ps.filter((p) => p.teamTag === tags[1])];
    if (tags.length < 2) g = [ps.slice(0, 5), ps.slice(5, 10)];
    if (rev) g = [g[1], g[0]];
    const f = (p) => ({ n: p.name, flag: p.flag, ag: (p.agents || [])[0] || null, acs: num(p.stats?.acs), k: num(p.stats?.kills), d: num(p.stats?.deaths), as: num(p.stats?.assists), adr: num(p.stats?.adr) });
    return g.map((l) => l.map(f));
  }

  /* --- CS2, por la Edge Function --- */
  let edgeFallo = 0;
  async function edgeCs2() {
    if (Date.now() - edgeFallo < 180000) return null;
    const probar = async (opts) => { const r = await fetch(`${EDGE}?cs2=1`, { cache: 'no-store', ...opts }); if (!r.ok) throw new Error(r.status); const j = await r.json(); if (!j.ok) throw new Error('mal'); return j.matches || [] };
    try { return await probar() } catch {}
    // si la funcion se desplego pidiendo JWT, con la clave publica de la app tambien contesta
    try { if (CFG.anon) return await probar({ headers: { apikey: CFG.anon, authorization: 'Bearer ' + CFG.anon } }) } catch {}
    edgeFallo = Date.now(); return null;
  }
  const cs2Lista = () => cached('cs2', 15000, edgeCs2);
  async function serieCs2(a, b) {
    const lista = (await cs2Lista()) || [];
    let rev = false;
    const m = lista.find((x) => { const c = cruce([x.a.n, ...(x.a.al || [])], [x.b.n, ...(x.b.al || [])], a, b); rev = c === 'rev'; return !!c });
    if (!m) return null;
    const [ta, tb] = rev ? [m.b, m.a] : [m.a, m.b], o = (w) => (rev ? 3 - w : w);
    const maps = (m.maps || []).map((x) => {
      const rondas = (x.rondas || []).map((r, i) => ({ w: o(r[0]), lado: r[1], how: r[2], n: i + 1 }));
      const h = mitades(rondas);
      return { n: x.n, nombre: x.nombre, est: x.st, a: rev ? x.b : x.a, b: rev ? x.a : x.b, ganador: x.ganador ? o(x.ganador) : 0, pick: 0, rondas, ct: h.ct, t: h.t, jug: null };
    });
    return {
      fuente: 'bo3.gg', fmt: m.bo ? 'Bo' + m.bo : '', estado: m.ganador ? 'fin' : 'live', torneo: m.torneo, fase: m.fase,
      a: { n: a, img: ta.img, s: ta.s }, b: { n: b, img: tb.img, s: tb.s }, maps, picks: [],
    };
  }

  const serieDe = (m) => (m.s === 'v' ? serieValorant(m.a, m.b) : m.s === 'c' ? serieCs2(m.a, m.b) : Promise.resolve(null));
  const enJuego = (s) => s.maps.find((x) => x.est === 'live') || null;

  // texto corto para listas y chat: "1:0 · Haven 7-5" (con un unir-palabras invisible tras el guion para que "7-5" no se parta en dos lineas)
  function resumen(s) {
    let t = `${s.a.s}:${s.b.s}`;
    const v = enJuego(s);
    if (v && s.estado === 'live') t += ` · ${mapaNombre(v)}${v.a != null && v.b != null ? ` ${v.a}-⁠${v.b}` : ''}`;
    return t;
  }

  /* ---------- pintar una serie ---------- */
  const logo = (src, n, cls) => (src ? `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : `<span class="${cls} sin">${esc(String(n || '?').trim().charAt(0).toUpperCase())}</span>`);
  const METODO = { defuse: 'bomba desactivada', detonate: 'bomba explotada', elimination: 'eliminación', time: 'se acabó el tiempo' };
  const mitadDe = (n) => (n <= 12 ? 'primera mitad' : n <= 24 ? 'segunda mitad' : 'prórroga');

  function pintaSerie(s, sel) {
    const { a, b, maps } = s;
    const iv = maps.findIndex((x) => x.est === 'live');
    const ultFin = maps.map((x) => x.est).lastIndexOf('fin');
    const i = sel != null && maps[sel] ? sel : iv >= 0 ? iv : ultFin >= 0 ? ultFin : 0;
    const m = maps[i];
    const vivo = s.estado === 'live';
    const ganaSerie = !vivo ? (a.s > b.s ? 'a' : b.s > a.s ? 'b' : '') : '';
    const bo = num(String(s.fmt).replace(/\D/g, ''));
    const estado = vivo ? '<span class="vv-live"><i></i>En directo</span>' : '<span class="vv-fin">Final</span>';
    const sub = [s.fmt ? esc(s.fmt.toUpperCase()) : '', vivo && iv >= 0 ? `Mapa ${iv + 1}${bo ? ' de ' + bo : ''}` : '', s.fase ? esc(s.fase) : ''].filter(Boolean).map((x) => `<u>${x}</u>`).join('');
    const cab = `<div class="vv-top">${estado}<span class="vv-sub">${sub}</span></div>
      <div class="vv-hero"><div class="vv-t a${ganaSerie === 'a' ? ' gana' : ''}">${logo(a.img, a.n, 'vv-lg')}<b>${esc(a.n)}</b></div>
        <div class="vv-sr"><strong><span class="${a.s > b.s ? 'ml' : ''}">${a.s}</span><i>:</i><span class="${b.s > a.s ? 'ml' : ''}">${b.s}</span></strong><small>mapas ganados</small></div>
        <div class="vv-t b${ganaSerie === 'b' ? ' gana' : ''}">${logo(b.img, b.n, 'vv-lg')}<b>${esc(b.n)}</b></div></div>`;

    const chips = maps.length ? `<nav class="vv-chips">${maps.map((x, k) => {
      const sc = x.est !== 'pend' && x.a != null ? `<span class="sc"><u class="${x.ganador === 1 ? 'g' : ''}">${x.a}</u><i>:</i><u class="${x.ganador === 2 ? 'g' : ''}">${x.b}</u></span>` : `<span class="sc dim">${x.est === 'live' ? 'en juego' : x.est === 'fin' ? 'jugado' : 'pendiente'}</span>`;
      const quien = x.est === 'fin' && x.ganador ? `<em>gana ${esc(x.ganador === 1 ? a.n : b.n)}</em>` : x.est === 'live' && x.a != null ? '<em class="rojo">en juego</em>' : '';
      return `<button type="button" class="vv-chip ${x.est}${k === i ? ' sel' : ''}" data-vvmap="${k}"><small>Mapa ${x.n}</small><b>${esc(mapaNombre(x))}</b>${sc}${quien}</button>`;
    }).join('')}</nav>` : '';

    let det = '';
    if (m) {
      const rd = m.rondas || [], jugadas = rd.length, enCurso = m.est === 'live';
      const tiene = m.a != null && m.b != null;
      const objetivo = tiene ? (m.a >= 12 && m.b >= 12 ? Math.max(m.a, m.b) + 1 : 13) : 13;
      const partes = m.est === 'live' ? (jugadas ? [`Ronda ${jugadas + 1}`, mitadDe(jugadas + 1)] : tiene && m.a + m.b > 0 ? [`Ronda ${m.a + m.b + 1}`] : [tiene ? 'Empezando' : 'En juego']) : m.est === 'fin' ? (m.ganador ? ['Acabado', `gana ${esc(m.ganador === 1 ? a.n : b.n)}`] : ['Acabado']) : ['Todavía no ha empezado'];
      if (m.pick) partes.push(`pick de ${esc(m.pick === 1 ? a.n : b.n)}`);
      const estadoMapa = partes.map((x) => `<u>${x}</u>`).join('');
            const lado = (k) => (jugadas ? `<em><span class="ct">CT ${m.ct[k]}</span><span class="t">T ${m.t[k]}</span></em>` : '');
      const marcador = tiene && m.est !== 'pend'
        ? `<div class="vv-rs"><div class="vv-rt a"><small>${esc(a.n)}</small><b class="${m.a > m.b ? 'ml' : ''}">${m.a}</b>${lado(0)}</div><i>:</i><div class="vv-rt b"><small>${esc(b.n)}</small><b class="${m.b > m.a ? 'ml' : ''}">${m.b}</b>${lado(1)}</div></div>
           <div class="vv-bar" title="Rondas ganadas, hasta ${objetivo}"><u class="a" style="width:${Math.min(m.a / objetivo, 1) * 50}%"></u><u class="b" style="width:${Math.min(m.b / objetivo, 1) * 50}%"></u></div>`
        : m.est === 'pend' ? '' : `<p class="vv-nada">${enCurso ? 'Esta fuente aún no da las rondas de este mapa. Se pone aquí en cuanto las tenga.' : 'No hay marcador de rondas de este mapa.'}</p>`;
      let cinta = '';
      if (jugadas) {
        cinta = `<div class="vv-tape">${rd.map((r, k) => `<span class="rd ${k === 11 ? 'medio' : ''}${k === 23 ? ' medio' : ''}" title="Ronda ${r.n} · ${esc(METODO[r.how] || r.how || '')}"><u class="${r.w === 1 ? 'a' : ''}">${r.w === 1 && r.icono ? `<img src="${esc(r.icono)}" referrerpolicy="no-referrer" alt="">` : ''}</u><u class="${r.w === 2 ? 'b' : ''}">${r.w === 2 && r.icono ? `<img src="${esc(r.icono)}" referrerpolicy="no-referrer" alt="">` : ''}</u></span>`).join('')}</div>
          <div class="vv-leg"><span class="a">${esc(a.n)}</span><span class="b">${esc(b.n)}</span></div>`;
      }
      let jug = '';
      if (m.jug && m.jug.some((l) => l.length)) {
        const val = (v) => (v == null ? '·' : esc(v));
        const fila = (p) => `<div class="vv-p"><span class="ag">${p.ag?.img ? `<img src="${esc(p.ag.img)}" referrerpolicy="no-referrer" alt="${esc(p.ag.name)}" title="${esc(p.ag.name)}">` : ''}</span><b>${esc(p.n)}${p.flag ? `<small>${esc(String(p.flag).toUpperCase())}</small>` : ''}</b><span>${val(p.acs)}</span><span>${p.k == null && p.d == null && p.as == null ? '·' : val(p.k) + '/' + val(p.d) + '/' + val(p.as)}</span><span class="adr">${val(p.adr)}</span></div>`;
        const tabla = (n, l, c) => (l.length ? `<div class="vv-pt ${c}"><div class="vv-p h"><span></span><b>${esc(n)}</b><span>ACS</span><span>K/D/A</span><span class="adr">ADR</span></div>${l.map(fila).join('')}</div>` : '');
        jug = `<div class="vv-ps">${tabla(a.n, m.jug[0], 'a')}${tabla(b.n, m.jug[1], 'b')}</div>`;
      }
      det = `<section class="vv-det ${m.est}"><header><h3>${esc(mapaNombre(m))}</h3><span class="${enCurso ? 'rojo' : ''}">${enCurso ? '<i class="pto"></i>' : ''}${estadoMapa}</span></header>${marcador}${cinta}${jug}</section>`;
    }
    const pb = s.picks?.length ? `<p class="vv-pb">${s.picks.map((x) => `<span class="${esc(x.accion)}">${x.accion === 'ban' ? 'ban' : x.accion === 'pick' ? 'pick' : 'queda'} ${esc(x.mapa)}${x.eq ? ' ' + esc(x.eq) : ''}</span>`).join('')}</p>` : '';
    return `${cab}${chips}${det}${pb}<p class="vv-fuente">${esc(s.fuente)} · se actualiza cada 20 s</p>`;
  }

  /* ---------- futbol ---------- */
  const espn = new Map();
  async function futbol(key) {
    const c = espn.get(key); if (c && Date.now() - c.t < 30000) return c.d;
    const [, lg, ev] = key.split('|');
    try { const d = await json(`https://site.api.espn.com/apis/site/v2/sports/soccer/${lg}/summary?event=${ev}`); espn.set(key, { t: Date.now(), d }); return d } catch { return c?.d || null }
  }
  const SVG = {
    gol: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M8 4.1l3 2.2-1.1 3.6H6.1L5 6.3z" fill="var(--bg2)"/></svg>',
    fallo: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
    cambio: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5.5h9M9.5 3l2.5 2.5L9.5 8M13 10.5H4M6.5 8L4 10.5 6.5 13"/></svg>',
  };
  function pintaFutbol(d) {
    const comp = d?.header?.competitions?.[0]; if (!comp) return '';
    const st = comp.status?.type || {}, h = comp.competitors?.find((x) => x.homeAway === 'home'), a = comp.competitors?.find((x) => x.homeAway === 'away');
    const logoF = (c) => c?.team?.logos?.[0]?.href || c?.team?.logo || '';
    const nom = (c) => c?.team?.shortDisplayName || c?.team?.displayName || '';
    const tipo = (t) => (/own goal/i.test(t) ? 'pp' : /penalty.*(missed|saved)/i.test(t) ? 'fallo' : /goal|penalty.*scored|penalty - scored/i.test(t) ? 'gol' : /red/i.test(t) ? 'roja' : /yellow/i.test(t) ? 'amarilla' : /substitution/i.test(t) ? 'cambio' : /halftime|half time|end regular/i.test(t) ? 'descanso' : '');
    const en = st.state === 'in', fin = st.state === 'post';
    const minuto = st.name === 'STATUS_HALFTIME' ? 'Descanso' : fin ? 'Final' : en ? (comp.status?.displayClock || st.shortDetail || '') : (st.shortDetail || st.description || '');
    const esLocal = (k) => String(k.team?.id) === String(h?.team?.id);
    const evs = (d.keyEvents || []).map((k) => ({ k, t: tipo(k.type?.text || '') })).filter((x) => x.t);
    const goles = (local) => evs.filter((x) => (x.t === 'gol' || x.t === 'pp') && (x.t === 'pp' ? !esLocal(x.k) : esLocal(x.k)) === local)
      .map((x) => `${esc(x.k.participants?.[0]?.athlete?.displayName || x.k.shortText || '')} ${esc(x.k.clock?.displayValue || '')}${x.t === 'pp' ? ' (en propia)' : ''}`);
    const lista = (l) => (l.length ? `<ul>${l.map((x) => `<li>${x}</li>`).join('')}</ul>` : '');
    const hero = `<div class="vv-top">${en ? '<span class="vv-live"><i></i>En directo</span>' : fin ? '<span class="vv-fin">Final</span>' : '<span class="vv-fin">Todavía no ha empezado</span>'}<span class="vv-sub">${esc(comp.venue?.fullName || '')}</span></div>
      <div class="vv-hero fut"><div class="vv-t a">${logo(logoF(h), nom(h), 'vv-lg')}<b>${esc(nom(h))}</b></div>
        <div class="vv-sr"><span class="vv-min ${en ? 'on' : ''}">${esc(minuto)}</span><strong><span>${esc(h?.score ?? '0')}</span><i>:</i><span>${esc(a?.score ?? '0')}</span></strong></div>
        <div class="vv-t b">${logo(logoF(a), nom(a), 'vv-lg')}<b>${esc(nom(a))}</b></div></div>
      ${goles(true).length || goles(false).length ? `<div class="vv-gl"><div class="a">${lista(goles(true))}</div><div class="b">${lista(goles(false))}</div></div>` : ''}`;
    const fila = ({ k, t }) => {
      const p = k.participants || [], local = esLocal(k);
      const ic = t === 'gol' || t === 'pp' ? SVG.gol : t === 'fallo' ? SVG.fallo : t === 'cambio' ? SVG.cambio : t === 'roja' ? '<i class="tj r"></i>' : '<i class="tj"></i>';
      if (t === 'descanso') return `<div class="vv-e pausa"><span class="m">${esc(k.clock?.displayValue || '')}</span><span class="c">Descanso</span></div>`;
      const quien = t === 'cambio' ? `<b>${esc(p[0]?.athlete?.displayName || '')}</b><small>por ${esc(p[1]?.athlete?.displayName || '')}</small>`
        : `<b>${esc(p[0]?.athlete?.displayName || k.shortText || '')}</b>${t === 'gol' && p[1] ? `<small>asistencia de ${esc(p[1].athlete?.displayName || '')}</small>` : t === 'pp' ? '<small>en propia</small>' : t === 'fallo' ? '<small>penalti fallado</small>' : ''}`;
      const lado = t === 'pp' ? !local : local;
      const celda = `<span class="x ${t}"><span class="ic">${ic}</span><span class="tx">${quien}</span></span>`;
      return `<div class="vv-e ${lado ? 'h' : 'a'}"><span class="l">${lado ? celda : ''}</span><span class="m">${esc(k.clock?.displayValue || '')}</span><span class="r">${lado ? '' : celda}</span></div>`;
    };
    const linea = evs.length ? `<div class="vv-evs">${evs.slice().reverse().map(fila).join('')}</div>` : `<p class="vv-nada">${en || fin ? 'Aún no ha pasado nada.' : 'Cuando ruede el balón, aquí irá todo lo que pase.'}</p>`;
    const stats = d.boxscore?.teams || [];
    const idx = (c) => stats.findIndex((t) => String(t.team?.id) === String(c?.team?.id));
    const ih = idx(h) >= 0 ? idx(h) : 0, ia = idx(a) >= 0 ? idx(a) : 1;
    const val = (i, n) => (stats[i]?.statistics || []).find((x) => x.name === n)?.displayValue;
    const filas = [['possessionPct', 'Posesión', '%'], ['totalShots', 'Tiros', ''], ['shotsOnTarget', 'A puerta', ''], ['wonCorners', 'Córners', ''], ['foulsCommitted', 'Faltas', ''], ['offsides', 'Fueras de juego', ''], ['saves', 'Paradas', ''], ['yellowCards', 'Amarillas', ''], ['redCards', 'Rojas', '']]
      .map(([k, n, u]) => {
        const x = val(ih, k), y = val(ia, k); if (x == null && y == null) return '';
        const nx = parseFloat(x) || 0, ny = parseFloat(y) || 0, tot = nx + ny || 1;
        return `<div class="vv-st"><b class="${nx > ny ? 'ml' : ''}">${esc(x ?? '·')}${u}</b><span class="et">${n}</span><b class="${ny > nx ? 'ml' : ''}">${esc(y ?? '·')}${u}</b><div class="bs"><u class="a" style="width:${(nx / tot) * 100}%"></u><u class="b" style="width:${(ny / tot) * 100}%"></u></div></div>`;
      }).join('');
    return `${hero}${linea}${filas ? `<div class="vv-sts">${filas}</div>` : ''}<p class="vv-fuente">ESPN · se actualiza cada 30 s</p>`;
  }

  /* ---------- el marcador corto en toda la app, y que no se pierda ---------- */
  const fijados = new Map(); // id del partido -> { txt, t }
  function aplica() {
    if (typeof M === 'undefined') return;
    const ahora = Date.now();
    for (const m of M) { const f = fijados.get(m.id); if (f && m.live && ahora - f.t < 240000 && m.score !== f.txt) m.score = f.txt }
  }
  // load() rehace M desde la base cada vez que se manda un mensaje, llega un pulso o pasan 5 minutos; render() repinta.
  // Envolverlos aqui vuelve a poner el ultimo marcador antes de que nadie lo vea.
  try {
    const b0 = window.build, r0 = window.render;
    if (typeof b0 === 'function') window.build = function () { const r = b0.apply(this, arguments); aplica(); return r };
    if (typeof r0 === 'function') window.render = function () { aplica(); return r0.apply(this, arguments) };
  } catch {}

  let globalT = 0;
  async function marcadores() {
    clearTimeout(globalT);
    try {
      if (!document.hidden && typeof M !== 'undefined') {
        let cambia = false;
        for (const m of M.filter((x) => x.live && (x.s === 'v' || x.s === 'c')).slice(0, 12)) {
          let s = null; try { s = await serieDe(m) } catch {}
          if (!s) continue;
          const txt = resumen(s);
          fijados.set(m.id, { txt, t: Date.now() });
          if (m.score !== txt) { m.score = txt; cambia = true }
          memoria.set(m.id, s);
        }
        if (cambia && typeof render === 'function' && !document.activeElement?.matches('input,textarea')) render();
      }
    } catch {}
    globalT = setTimeout(marcadores, document.hidden ? 60000 : CADA);
  }
  setTimeout(marcadores, 2500);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { marcadores(); tick() } });

  /* ---------- montaje en la pantalla Directo ---------- */
  const memoria = new Map(); // id -> serie
  const htmlPor = new Map(); // id -> html (futbol)
  const sel = { id: null, idx: null };
  let timer = 0;
  const dvId = () => (document.querySelector('.dv')?.dataset.dvKey || '').split('|')[0];
  const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36) };
  async function tick() {
    clearTimeout(timer);
    const info = document.querySelector('.dv [data-dv-info]');
    if (info && !document.hidden) {
      const id = dvId(), m = typeof MI !== 'undefined' ? MI.get(id) : null, ek = info.dataset.espn || '';
      try {
        if (/^soccer\|/.test(ek)) htmlPor.set(id, pintaFutbol(await futbol(ek)));
        else if (m && (m.s === 'v' || m.s === 'c')) { const s = await serieDe(m); if (s) memoria.set(id, s); else memoria.delete(id) }
      } catch {}
      pon();
    }
    timer = setTimeout(tick, document.querySelector('.dv') ? CADA : 4000);
  }
  function cuerpo(id) {
    const s = memoria.get(id);
    if (s) return pintaSerie(s, sel.id === id ? sel.idx : null);
    return htmlPor.get(id) || '';
  }
  // la app repinta la informacion del directo cada poco: se vuelve a poner lo ultimo que hay
  function pon() {
    const info = document.querySelector('.dv [data-dv-info]'); if (!info) return;
    const id = dvId(), inner = cuerpo(id), ya = info.querySelector('[data-vv]');
    if (!inner) { if (ya) ya.remove(); return }
    const hh = hash(inner);
    if (ya && ya.dataset.h === hh) return;
    const html = `<div class="vv" data-vv data-h="${hh}">${inner}</div>`;
    if (ya) ya.outerHTML = html; else info.querySelector('.dv-meta')?.insertAdjacentHTML('afterend', html);
    const nuevo = info.querySelector('[data-vv]'); if (nuevo && window.GM_LANG) GM_LANG.traduce(nuevo);
  }
  new MutationObserver(() => { if (document.querySelector('.dv [data-dv-info]') && !document.querySelector('[data-vv]')) pon() }).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('click', (e) => {
    const c = e.target.closest('[data-vvmap]');
    if (c) { sel.id = dvId(); sel.idx = Number(c.dataset.vvmap); pon(); return }
    if (e.target.closest('[data-dv], .dv-btn')) setTimeout(tick, 300);
  });
  window.GM_VIVO = { pintaSerie, pintaFutbol, resumen, parecido, serieValorant, serieCs2, memoria };
  tick();

  const css = document.createElement('style');
  css.textContent = `
/* esconde el marcador basico de la app cuando esta el de verdad */
.dv-info:has([data-vv])>.dv-sc,.dv-info:has([data-vv])>.dv-maps,.dv-info:has([data-vv])>p.hint{display:none}
.vv{--ca:var(--acc);--cb:#4d88e6;--live:#ff8f98;display:grid;gap:22px;padding:22px 0 6px;container-type:inline-size}
.vv *{box-sizing:border-box}
.vv-top{display:flex;align-items:center;gap:10px 14px;flex-wrap:wrap;font:600 12px var(--sans);color:var(--mute)}
.vv-live{display:inline-flex;align-items:center;gap:8px;padding:5px 12px 5px 10px;border-radius:999px;background:rgba(224,100,111,.16);color:var(--live);font-weight:700;letter-spacing:.02em}
.vv-live i,.pto{width:8px;height:8px;border-radius:50%;background:#e0646f;animation:latido 1.2s ease-in-out infinite;display:inline-block}
.vv-fin{padding:5px 12px;border-radius:999px;background:rgba(255,255,255,.07);color:var(--soft)}
.vv-sub{font:12px var(--mono);color:var(--mute)}
.vv-sub u,.vv-det header u{text-decoration:none}
.vv-sub u+u::before,.vv-det header u+u::before{content:'·';margin:0 8px}
.vv-hero{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:clamp(8px,3cqw,32px)}
.vv-t{display:grid;justify-items:center;gap:10px;text-align:center;min-width:0}
.vv-t b{font:700 clamp(14px,2.4cqw,20px)/1.15 var(--disp);letter-spacing:-.01em;max-width:100%;overflow-wrap:anywhere}
.vv-t.gana b{color:var(--acc2)}
.vv-lg{width:clamp(48px,11cqw,84px);height:clamp(48px,11cqw,84px);object-fit:contain;filter:drop-shadow(0 6px 14px rgba(0,0,0,.35))}
.vv-lg.sin{display:grid;place-items:center;border-radius:50%;background:rgba(255,255,255,.07);font:700 28px var(--disp);color:var(--mute);filter:none}
.vv-sr{display:grid;justify-items:center;gap:6px}
.vv-sr strong{display:flex;align-items:center;gap:clamp(6px,1.6cqw,14px);font:800 clamp(46px,12cqw,92px)/.9 var(--disp);letter-spacing:-.04em;font-variant-numeric:tabular-nums;color:var(--soft)}
.vv-sr strong i{font-style:normal;color:var(--dim);font-weight:500}
.vv-sr strong .ml{color:var(--ink)}
.vv-sr small{font:10px var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--dim)}
.vv-min{font:700 clamp(18px,3cqw,26px) var(--mono);color:var(--soft)}
.vv-min.on{color:var(--live)}
/* mapas */
.vv-chips{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;padding:2px 0 4px;margin:0 -2px}
.vv-chips::-webkit-scrollbar{display:none}
.vv-chip{flex:1 1 0;min-width:112px;display:grid;gap:3px;justify-items:start;text-align:left;padding:10px 14px;border-radius:14px;background:rgba(255,255,255,.04);color:var(--soft);transition:background .15s,opacity .15s}
.vv-chip:hover{background:rgba(255,255,255,.07)}
.vv-chip small{font:10px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}
.vv-chip b{font:700 15px var(--sans);color:var(--ink)}
.vv-chip .sc{display:flex;align-items:center;gap:5px;font:600 15px var(--mono);color:var(--mute)}
.vv-chip .sc i{font-style:normal;color:var(--dim)}
.vv-chip .sc u{text-decoration:none}.vv-chip .sc u.g{color:var(--ink)}
.vv-chip .sc.dim{font:11px var(--mono);color:var(--dim)}
.vv-chip em{font:11px var(--sans);font-style:normal;color:var(--dim)}
.vv-chip em.rojo{color:var(--live)}
.vv-chip.pend{opacity:.45}
.vv-chip.live{background:rgba(224,100,111,.12)}
.vv-chip.sel{background:rgba(255,255,255,.1);box-shadow:inset 0 -2px 0 var(--acc)}
.vv-chip.live.sel{background:rgba(224,100,111,.2);box-shadow:inset 0 -2px 0 #e0646f}
/* mapa elegido */
.vv-det{display:grid;gap:16px}
.vv-det header{display:flex;align-items:baseline;justify-content:space-between;gap:6px 16px;flex-wrap:wrap}
.vv-det h3{font:800 clamp(24px,5cqw,34px)/1 var(--disp);letter-spacing:-.03em}
.vv-det header span{display:inline-flex;align-items:center;gap:8px;font:12px var(--mono);color:var(--mute)}
.rojo{color:var(--live)!important}
.vv-rs{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:clamp(8px,3cqw,28px)}
.vv-rs>i{font:500 clamp(30px,7cqw,54px)/1 var(--disp);font-style:normal;color:var(--dim)}
.vv-rt{display:grid;gap:6px}
.vv-rt.a{justify-items:end;text-align:right}.vv-rt.b{justify-items:start;text-align:left}
.vv-rt small{font:600 12px var(--sans);color:var(--mute);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vv-rt b{font:800 clamp(52px,14cqw,96px)/.9 var(--disp);letter-spacing:-.04em;font-variant-numeric:tabular-nums;color:var(--mute)}
.vv-rt.a b.ml{color:var(--ca)}.vv-rt.b b.ml{color:var(--cb)}
.vv-rt em{display:flex;gap:12px;font:600 12px var(--mono);font-style:normal;color:var(--dim)}
.vv-rt em .ct{color:#7fb8ff}.vv-rt em .t{color:#e8b468}
.vv-bar{position:relative;height:6px;border-radius:3px;background:rgba(255,255,255,.07);overflow:hidden}
.vv-bar::after{content:'';position:absolute;left:50%;top:0;bottom:0;width:2px;margin-left:-1px;background:var(--bg2)}
.vv-bar u{position:absolute;top:0;bottom:0;border-radius:3px;transition:width .5s var(--ease)}
.vv-bar u.a{left:0;background:var(--ca)}.vv-bar u.b{right:0;background:var(--cb)}
.vv-tape{display:flex;gap:3px;align-items:stretch}
.vv-tape .rd{flex:1 1 0;min-width:7px;max-width:22px;display:grid;grid-template-rows:20px 20px;gap:3px}
.vv-tape .rd.medio{margin-right:10px}
.vv-tape .rd u{display:grid;place-items:center;border-radius:4px;background:rgba(255,255,255,.04)}
.vv-tape .rd u.a{background:var(--ca)}.vv-tape .rd u.b{background:var(--cb)}
.vv-tape img{width:12px;height:12px;object-fit:contain;filter:brightness(0) invert(.08)}
@container (max-width:520px){.vv-tape img{display:none}.vv-tape .rd{grid-template-rows:16px 16px}}
.vv-leg{display:flex;gap:16px;font:11px var(--mono);color:var(--dim)}
.vv-leg span::before{content:'';display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px;vertical-align:-1px;background:var(--ca)}
.vv-leg .b::before{background:var(--cb)}
.vv-nada{font:13px/1.5 var(--sans);color:var(--dim);max-width:46ch}
/* jugadores */
.vv-ps{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:22px}
.vv-p{display:grid;grid-template-columns:28px minmax(0,1fr) 40px 66px 40px;align-items:center;gap:8px;min-height:34px;font:13px var(--mono);color:var(--soft);border-radius:8px}
.vv-pt .vv-p:not(.h):nth-child(even){background:rgba(255,255,255,.025)}
.vv-p.h{min-height:24px;font:10px var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}
.vv-p.h b{font:700 13px var(--sans);letter-spacing:0;text-transform:none}
.vv-pt.a .vv-p.h b{color:var(--ca)}.vv-pt.b .vv-p.h b{color:var(--cb)}
.vv-p b{min-width:0;font:600 13px var(--sans);color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vv-p b small{margin-left:6px;font:10px var(--mono);color:var(--dim)}
.vv-p span{text-align:right}
.vv-p .ag img{width:26px;height:26px;border-radius:7px;background:rgba(255,255,255,.06);display:block}
@container (max-width:430px){.vv-p{grid-template-columns:26px minmax(0,1fr) 36px 60px}.vv-p .adr{display:none}}
.vv-pb{display:flex;flex-wrap:wrap;gap:4px 14px;font:11px var(--mono);color:var(--dim)}
.vv-pb .pick{color:var(--soft)}.vv-pb .remains{color:var(--acc)}
.vv-fuente{font:10px var(--mono);letter-spacing:.06em;color:var(--dim)}
/* futbol */
.vv-hero.fut .vv-sr{gap:8px}
.vv-gl{display:grid;grid-template-columns:1fr 1fr;gap:clamp(8px,3cqw,32px);margin-top:-10px;font:12px var(--sans);color:var(--mute)}
.vv-gl ul{list-style:none;display:grid;gap:3px;padding:0;margin:0}
.vv-gl .a{text-align:right}.vv-gl .b{text-align:left}
.vv-evs{display:grid;gap:2px;position:relative}
.vv-evs::before{content:'';position:absolute;left:50%;top:0;bottom:0;width:1px;background:var(--hair)}
.vv-e{display:grid;grid-template-columns:minmax(0,1fr) 56px minmax(0,1fr);align-items:center;min-height:38px;position:relative}
.vv-e .m{justify-self:center;padding:2px 8px;border-radius:999px;background:var(--bg2);font:600 12px var(--mono);color:var(--mute);position:relative}
.vv-e .l{justify-self:end;text-align:right}.vv-e .r{justify-self:start}
.vv-e .x{display:inline-flex;align-items:center;gap:9px;min-width:0}
.vv-e .l .x{flex-direction:row-reverse}
.vv-e .tx{display:grid;gap:1px;min-width:0}
.vv-e .tx b{font:600 14px var(--sans);color:var(--soft)}
.vv-e .tx small{font:11px var(--mono);color:var(--dim)}
.vv-e .ic{display:grid;place-items:center;width:20px;height:20px;flex:none;color:var(--soft)}
.vv-e .ic svg{width:18px;height:18px}
.vv-e .x.gol .tx b,.vv-e .x.pp .tx b{color:var(--ink);font-weight:800}
.vv-e .x.gol .ic{color:var(--ink)}
.vv-e .x.fallo .ic{color:#e0646f}
.vv-e.pausa{grid-template-columns:1fr auto 1fr;min-height:30px}
.vv-e.pausa .c{grid-column:3;font:10px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--dim);padding-left:10px}
.vv-e.pausa .m{grid-column:2}
.tj{display:inline-block;width:11px;height:15px;border-radius:2px;background:#f2c14e}
.tj.r{background:#e0646f}
.vv-sts{display:grid;gap:14px}
.vv-st{display:grid;grid-template-columns:56px 1fr 56px;align-items:center;gap:2px 10px;font:600 14px var(--mono);color:var(--mute)}
.vv-st b.ml{color:var(--ink)}
.vv-st b:nth-of-type(2){text-align:right}
.vv-st .et{text-align:center;font:10px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}
.vv-st .bs{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:4px;height:6px}
.vv-st .bs u{display:block;height:100%;border-radius:3px}
.vv-st .bs u.a{justify-self:end;background:var(--ca)}.vv-st .bs u.b{justify-self:start;background:var(--cb)}
.vv-st .bs{background:linear-gradient(90deg,rgba(255,255,255,.04),rgba(255,255,255,.04));background-clip:content-box;border-radius:3px}
/* el marcador corto en las listas del directo: una sola linea, sin recortar los nombres */
.dv-it b{display:flex;flex-wrap:wrap;gap:0 4px;white-space:normal!important}
.dv-it b i{flex:none;margin:0!important}
/* y en el boleto de Mis apuestas y en el perfil: el texto es mas largo que un 1:0 */
.bol-sc{font-size:19px!important;line-height:1.2;text-align:center;white-space:nowrap}
.live-m b{font-size:17px;text-wrap:balance}
@media (max-width:560px){.bol-sc{font-size:14px!important;white-space:normal;max-width:96px}}
/* el marcador corto en la lista de Partidos: la columna de la hora se ensancha para que quepa en una linea (y si el mapa tiene un nombre largo, baja con gracia a dos) */
.row .t small.sc{font-size:12px;line-height:1.25;white-space:normal}
@media (min-width:861px){#view:has(.row .t small.sc) .row{grid-template-columns:116px 30px minmax(0,1fr) 44px 72px 72px 72px}}
@media (max-width:860px){#view:has(.row .t small.sc) .row{grid-template-columns:84px minmax(0,1fr) repeat(3,52px)}.row .t small.sc{font-size:11px}}
@media (prefers-reduced-motion:reduce){.vv-live i,.pto{animation:none}.vv-bar u{transition:none}}`;
  document.head.appendChild(css);
})();
