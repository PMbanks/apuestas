// Fichas ampliadas de equipos y luchadores (PM, 30-10: "que salgan registros de victorias de torneos, earnings y tal de cada persona").
// Se guardan en teams.extra (db/025_equipos_extra.sql) y las pinta la ventana "Todo sobre el equipo". Formato: app/nueva/EQUIPOS-DATOS.md.
//
// Lo llama sync.mjs con UNA linea (despues de fichasEsports): equiposExtra({ rows, rpc, secret, dry, ps }).
// Reparte el trabajo entre pasadas (cada pasada es un proceso nuevo, cada 5 minutos): pocos equipos por pasada, primero los de partidos
// cercanos y los que tienen apuestas abiertas, cada equipo como mucho cada 3 dias, y si una fuente falla se apunta y se sigue.
//
// Fuentes, todas gratis:
//   Valorant y CS2 -> Liquipedia (MediaWiki, CC BY-SA 3.0): palmares, ganancias del equipo, plantilla con fecha de llegada, ex jugadores, staff.
//                     Sus reglas: User-Agent propio con contacto, gzip, 1 peticion cada 2 s y action=parse 1 cada 30 s (aqui 32 s), cachear.
//                     PandaScore pone foto, rol, nombre y pais de los jugadores; vlr.gg (vlr.orlandomm.net) los equipos anteriores
//                     de los de Valorant y el palmares de reserva si Liquipedia no responde.
//   Futbol         -> ESPN (apodo, estadio) + Wikidata (identifica el club) + Wikipedia (seccion Honours: titulos de liga y copa).
//   UFC            -> ESPN (record, KO, sumisiones, cinturones, ranking, defensas, combates por el titulo).
// Lo que ninguna fuente gratis da (ganancias por jugador, titulos del club completos) NO se inventa: el campo se queda en null o no sale.
const CONTACTO = process.env.EQUIPOS_CONTACTO || 'https://github.com/PMbanks/apuestas';
const UA_LP = `GamblingAddictsApp/1.0 (https://pmbanks.github.io/apuestas/; ${CONTACTO})`;
const DAY = 864e5;

export const CFG = {
  vida: 3 * DAY,                 // una ficha no se rehace antes de 3 dias
  presupuestoMs: 215e3,          // lo maximo que puede alargar una pasada
  maxJugCs: 3,                   // jugadores de CS2 por pasada (1 action=parse cada uno; los de Valorant son una pagina de vlr.gg y no cuentan)
  maxEsports: 2,                 // equipos de Valorant y CS2 por pasada (2 action=parse cada uno, la pagina y su Results, 1 cada 32 s)
  ver: 2,                        // version del formato de extra (v2: titulares y banquillo, roles de CS2, agentes de Valorant, titulos de siempre, cambios)
  maxFutbol: 8,
  maxUfc: 4,
  ventana: 14 * DAY,             // solo equipos con partido en las proximas 2 semanas
  gapQuery: 2200, gapParse: 32e3, gapWeb: 300,
  tamMax: 140000,                // db/025 rechaza mas de 150 KB
};

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const iso2 = (t) => (t ? new Date(t).toISOString() : null);

// ---------- red ----------
async function pedir(url, { headers = {}, json = true, intentos = 2 } = {}) {
  let ult = null;
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await fetch(url, { headers: { 'accept-encoding': 'gzip', ...headers } });
      if (r.ok) return json ? await r.json() : await r.text();
      ult = new Error(`${r.status} ${url.slice(0, 80)}`);
      if (r.status < 500 && r.status !== 429) break;
    } catch (e) { ult = e; }
    await sleep(1500 * (i + 1));
  }
  throw ult || new Error('sin respuesta');
}
const qs = (o) => Object.entries(o).filter(([, v]) => v != null).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

// Liquipedia: un solo reloj para todo el proceso
let lpUltQ = 0, lpUltParse = 0;
async function lp(wiki, params, esParse) {
  const gap = esParse ? CFG.gapParse : CFG.gapQuery;
  const ult = esParse ? lpUltParse : lpUltQ;
  const espera = Math.max(lpUltQ + CFG.gapQuery, ult + gap) - Date.now();
  if (espera > 0) await sleep(espera);
  const j = await pedir(`https://liquipedia.net/${wiki}/api.php?${qs({ format: 'json', formatversion: 2, ...params })}`, { headers: { 'user-agent': UA_LP } });
  lpUltQ = Date.now(); if (esParse) lpUltParse = lpUltQ;
  if (j?.error) throw new Error(`Liquipedia: ${j.error.code || j.error.info}`);
  return j;
}
let webUlt = 0;
async function web(url, headers = {}, json = true) {
  const espera = webUlt + CFG.gapWeb - Date.now(); if (espera > 0) await sleep(espera);
  try { return await pedir(url, { headers: { 'user-agent': UA_LP, ...headers }, json }); } finally { webUlt = Date.now(); }
}

// ---------- texto y HTML ----------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—' };
const dec = (s) => String(s).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
const limpio = (h) => dec(String(h).replace(/<style[\s\S]*?<\/style>/g, '').replace(/<sup[\s\S]*?<\/sup>/g, '').replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const base = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (s) => base(s).replace(/\b(esports?|gaming|team|club|fc|cf|afc|a\.f\.c\.)\b/g, '').replace(/[^a-z0-9]/g, '');
const normFuerte = (s) => base(s).replace(/[^a-z0-9]/g, '');

function tablas(html) {
  const out = [];
  for (const m of html.matchAll(/<table[\s\S]*?<\/table>/g)) {
    const filas = m[0].split(/<tr[\s>]/).slice(1).map((r) => {
      const celdas = [];
      for (const c of r.matchAll(/<t([dh])([^>]*)>([\s\S]*?)<\/t\1>/g)) celdas.push({ th: c[1] === 'h', attrs: c[2], html: c[3], txt: limpio(c[3]) });
      return celdas;
    }).filter((f) => f.length);
    out.push({ pos: m.index, filas });
  }
  return out;
}
const numero = (s) => { const m = String(s || '').replace(/[, ]/g, '').match(/-?\d+(?:\.\d+)?/); return m ? Number(m[0]) : null; };
const fechaLp = (s) => (String(s || '').match(/\d{4}-\d{2}-\d{2}/) || String(s || '').match(/\d{4}-\d{2}/) || [null])[0];
const banderaLp = (h) => { const m = String(h).match(/\/([A-Za-z]{2}(?:-[A-Za-z]+)?)_hd\.png/); return m ? m[1].toUpperCase() : null; };
const imgLp = (h) => {
  const oscuro = String(h).match(/darkmode[\s\S]*?<img[^>]+src="([^"]+)"/);
  const m = oscuro || String(h).match(/<img[^>]+src="([^"]+)"/);
  return m ? (m[1].startsWith('http') ? m[1] : 'https://liquipedia.net' + dec(m[1])) : null;
};
const puestoEs = (t) => String(t || '').replace(/(\d+)(?:st|nd|rd|th)/gi, '$1º').replace(/\s*-\s*/g, ' a ');
const ordinal = (txt, sortVal) => {
  const n = numero(String(sortVal || '').split('-')[0]) ?? numero(txt);
  return n && n > 0 && n < 1000 ? n : null;
};

// ---------- Liquipedia: pagina de un equipo ----------
export function leerPaginaLp(html, wiki) {
  const t = tablas(html);
  const posOrg = html.search(/id="Organi[sz]ation"/), posRes = html.search(/id="Results"/);
  // titulos de seccion (h2 y h3) para saber a que grupo pertenece cada tabla: Active, Inactive, Former, Stand-in, y lo mismo bajo Organization
  const cabezas = [...html.matchAll(/<h[23][^>]*\bid="([^"]+)"/g)].map((m) => ({ pos: m.index, id: dec(m[1]).toLowerCase().replace(/_\d+$/, '') }));
  const seccion = (pos) => { let s = ''; for (const c of cabezas) { if (c.pos < pos) s = c.id; else break; } return s; };
  const out = { palmares: [], activos: [], suplentes: [], inactivos: [], antiguos: [], staff: [], exstaff: [], total: null, porAno: null };

  // ganancias del equipo ("Approx. Total Winnings: $13,732,460"; incluye lo que ganaron los jugadores mientras representaban al equipo)
  const g = html.match(/Total Winnings[\s\S]{0,200}?<div>\s*(?:<[^>]+>)*\s*\$\s*([\d,]+(?:\.\d+)?)/);
  if (g) out.total = Number(g[1].replace(/,/g, ''));
  // ganancias por ano: el grafico de barras lleva un JSON en <template class="charts-barchart">
  const ch = html.match(/<template[^>]*charts-barchart[^>]*>([\s\S]*?)<\/template>/);
  if (ch) {
    try {
      const d = JSON.parse(dec(ch[1])).data;
      const porAno = d.map((x) => ({ ano: +x.name, usd: Math.round((x.values || []).reduce((a, v) => a + (+v.y || 0), 0)) })).filter((x) => x.ano > 1990 && x.ano < 2100);
      if (porAno.length) out.porAno = porAno;
    } catch {}
  }

  for (const tb of t) {
    const cab = tb.filas[0].map((c) => c.txt);
    // palmares: Date | Place | Tier | ... | Tournament | Result | Prize  (sirve igual para la pagina de Results, que trae todos)
    if (cab.includes('Date') && cab.includes('Place') && cab.includes('Prize') && !cab.includes('Opponent')) {
      for (const f of tb.filas.slice(1)) {
        const n = f.length; if (n < 7) continue;
        const fecha = fechaLp(f[0].txt); if (!fecha) continue;
        const nombre = f[n - 4].txt || f[n - 5].txt;
        const enlace = (f[n - 4].html.match(/href="([^"]+)"/) || f[n - 5].html.match(/href="([^"]+)"/) || [])[1];
        const premioTxt = f[n - 1].txt, premio = /\d/.test(premioTxt) ? numero(premioTxt) : null;
        out.palmares.push({
          torneo: nombre, puesto: puestoEs(f[1].txt), puesto_n: ordinal(f[1].txt, (f[1].attrs.match(/data-sort-value="([^"]*)"/) || [])[1]),
          fecha, premio, tier: f[2].txt.replace(/-Tier$/, '') || null,
          logo: imgLp(f[n - 5].html), rival: f[n - 2].txt || null, marcador: f[n - 3].txt.replace(/\s*:\s*/g, ':') || null,
          url: enlace ? 'https://liquipedia.net' + dec(enlace) : null,
        });
      }
      continue;
    }
    // plantillas: ID | Name | [rol] | Join Date | [Inactive Date] | [Leave Date] | [New Team]
    if (cab[0] === 'ID' && cab.includes('Join Date')) {
      const iId = 0, iNom = cab.indexOf('Name'), iJoin = cab.indexOf('Join Date'), iInac = cab.indexOf('Inactive Date'), iLeave = cab.indexOf('Leave Date'), iNew = cab.indexOf('New Team');
      let iRol = -1; cab.forEach((c, i) => { if (c === '' && i > 0 && i < iJoin) iRol = i; });   // la ultima columna sin titulo antes de Join Date lleva el rol (Coach, Loan, Substitute...)
      if (tb.pos > posRes && posRes > 0) continue;
      const org = posOrg > 0 && tb.pos > posOrg, sec = seccion(tb.pos);
      for (const f of tb.filas.slice(1)) {
        if (f.length < 3) continue;
        const ancla = f[iId].html.match(/<a href="\/[^"\/]+\/([^"?#]+)"[^>]*?title="([^"]*)"/);
        const p = {
          id: limpio(f[iId].html), pais: banderaLp(f[iId].html), titulo: ancla ? dec(ancla[2]).replace(/ \(page does not exist\)$/, '') : null,
          capitan: /fa-crown|title="Captain"/.test(f[iId].html), nombre: iNom >= 0 ? f[iNom]?.txt || null : null,
          rol: iRol >= 0 ? f[iRol]?.txt || null : null, desde: fechaLp(f[iJoin]?.txt), inactivo: iInac >= 0 ? fechaLp(f[iInac]?.txt) : null,
          hasta: iLeave >= 0 ? fechaLp(f[iLeave]?.txt) : null, nuevo: iNew >= 0 ? f[iNew]?.txt || null : null,
        };
        if (!p.id && !p.nombre) continue;
        const rol = (p.rol || '').toLowerCase();
        const esStaff = org || /coach|analyst|manager|director|owner|ceo|founder|streamer|caster|chairman|president|psycholog|physio|scout/.test(rol);
        if (esStaff) { (p.hasta || sec.startsWith('former') ? out.exstaff : out.staff).push(p); continue; }
        if (p.hasta || sec.startsWith('former')) out.antiguos.push(p);
        else if (/inactive/.test(sec) || (cab.includes('Inactive Date') && p.inactivo)) out.inactivos.push(p);
        else if (/stand|sub|loan/.test(sec) || /substitute|stand-?in|trial/.test(rol)) out.suplentes.push(p);
        else out.activos.push(p);
      }
    }
  }
  out.antiguos.sort((a, b) => String(b.hasta || '').localeCompare(String(a.hasta || '')));
  out.exstaff.sort((a, b) => String(b.hasta || '').localeCompare(String(a.hasta || '')));
  return out;
}

// todos los torneos ganados de siempre (pagina "Equipo/Results" de Liquipedia): total, por categoria y la lista compacta
const logoCorto = (u) => (u && /^https:\/\/liquipedia\.net\/commons\/images\//.test(u) ? u.replace('https://liquipedia.net/commons/images/', '') : null);
export function resumirTitulos(res) {
  const ok = (res || []).filter((x) => x.fecha);
  if (!ok.length) return null;
  const torneo = (x) => /^[SABCD]$/.test(x.tier || '') && !/qualifier|showmatch|exhibition/i.test(x.torneo || '');   // S, A, B, C, D son torneos; clasificatorias, exhibiciones y Points no cuentan como titulo
  const gan = ok.filter((x) => x.puesto_n === 1 && torneo(x));
  const porTier = {};
  for (const x of gan) porTier[x.tier] = (porTier[x.tier] || 0) + 1;
  const conPremio = ok.filter((x) => x.premio > 0), porAno = {};
  for (const x of conPremio) { const a = x.fecha.slice(0, 4); porAno[a] = (porAno[a] || 0) + x.premio; }
  return {
    total: gan.length, otros: ok.filter((x) => x.puesto_n === 1 && !torneo(x)).length,
    segundos: ok.filter((x) => x.puesto_n === 2 && torneo(x)).length, terceros: ok.filter((x) => x.puesto_n === 3 && torneo(x)).length, jugados: ok.filter(torneo).length,
    por_tier: porTier, desde: ok[ok.length - 1].fecha,
    lista: gan.slice(0, 120).map((x) => ({ f: x.fecha, t: x.torneo, k: x.tier, p: x.premio, r: x.rival || null, m: x.marcador || null, l: logoCorto(x.logo) })),
    // segundos y terceros puestos de los torneos grandes (S, A y B), para que el palmares tenga plata y bronce ademas del oro
    podios: ok.filter((x) => (x.puesto_n === 2 || x.puesto_n === 3) && torneo(x) && /^[SAB]$/.test(x.tier)).slice(0, 80).map((x) => ({ f: x.fecha, t: x.torneo, k: x.tier, n: x.puesto_n, p: x.premio, l: logoCorto(x.logo) })),
    // todo lo que cobro el equipo torneo a torneo: [fecha, torneo, puesto, premio, categoria]
    premios: conPremio.slice(0, 150).map((x) => [x.fecha, x.torneo, x.puesto || '', x.premio, x.tier || '']),
    premios_total: conPremio.reduce((a, x) => a + x.premio, 0), premios_n: conPremio.length,
    por_ano: Object.entries(porAno).map(([ano, usd]) => ({ ano: +ano, usd })).sort((a, b) => a.ano - b.ano),
  };
}

// ganancias de un jugador de Liquipedia, de su pagina Jugador/Results: cada fila trae el premio de ESE EQUIPO (no el reparto), asi que aqui
// se reparte a partes iguales entre 5 y se marca como aproximado. Devuelve filas [fecha, torneo, puesto, premio estimado, equipo]
export function leerResultadosJugador(html, reparto = 5) {
  const filas = [];
  for (const tb of tablas(html)) {
    const cab = tb.filas[0].map((c) => c.txt);
    if (!(cab.includes('Date') && cab.includes('Place') && cab.includes('Prize') && cab.includes('Team'))) continue;
    for (const f of tb.filas.slice(1)) {
      const n = f.length; if (n < 8) continue;
      const fecha = fechaLp(f[0].txt); if (!fecha) continue;
      const premioTxt = f[n - 1].txt, premio = /\d/.test(premioTxt) ? numero(premioTxt) : null;
      filas.push({ fecha, puesto: puestoEs(f[1].txt), tier: f[2].txt.replace(/-Tier$/, '') || null, torneo: f[n - 5].txt, equipo: f[n - 4].txt || null, premio, est: premio ? Math.round(premio / reparto) : 0 });
    }
  }
  return filas;
}
export function resumirGananciasJugador(filas, reparto = 5) {
  const con = filas.filter((x) => x.est > 0);
  if (!filas.length) return null;
  return { total: con.reduce((a, x) => a + x.est, 0), aprox: true, reparto, n: con.length, jugados: filas.length,
    lista: con.slice(0, 80).map((x) => [x.fecha, x.torneo, x.puesto, x.est, x.equipo || '']) };
}

// ganancias de un jugador de Valorant, de su pagina de vlr.gg ("Event Placements"): cada evento con su fase, puesto, premio y equipo
export function leerGananciasVlr(html) {
  const t = String(html).replace(/<script[\s\S]*?<\/script>/g, '');
  const i = t.search(/Event Placements/i); if (i < 0) return null;
  const sec = t.slice(i);
  const tot = sec.match(/Total Winnings[\s\S]{0,260}?\$\s*([\d,]+)/);
  const lista = [];
  for (const it of sec.split('player-event-item').slice(1)) {
    const trozo = it.split('</a>')[0];
    const titulo = (trozo.match(/class="text-of"[^>]*>\s*([^<]+?)\s*</) || [])[1]; if (!titulo) continue;
    const ano = (trozo.match(/<div>\s*((?:19|20)\d\d)\s*<\/div>\s*$/) || [])[1] || null;
    let premio = 0, mejor = null, equipo = '';
    for (const b of trozo.split('line-height: 1.2;">').slice(1)) {
      const fase = limpio(((b.match(/ge-text-light">([\s\S]*?)<\/span>/) || [])[1] || '').replace(/&ndash;/g, '|'));
      const [stage, puesto] = fase.split('|').map((x) => x.trim());
      const p = (b.match(/\$([\d,]+)/) || [])[1], v = p ? Number(p.replace(/,/g, '')) : 0;
      const eq = limpio(b.split('</div>')[0].replace(/<span[\s\S]*?<\/span>/g, ' ').replace(/<br\s*\/?>/g, ' '));
      premio += v;
      if (!mejor || (v && !mejor.v)) mejor = { stage, puesto: puestoEs(puesto || '').replace(/\s*[–—]\s*/g, ' a '), v };
      if (!equipo) equipo = eq;
    }
    lista.push([ano, dec(titulo).trim(), (mejor && mejor.puesto) || '', premio, equipo, (mejor && mejor.stage) || '']);
  }
  if (!lista.length && !tot) return null;
  return { total: tot ? Number(tot[1].replace(/,/g, '')) : lista.reduce((a, x) => a + x[3], 0), aprox: false, n: lista.filter((x) => x[3] > 0).length, jugados: lista.length,
    lista: lista.slice(0, 80) };
}

async function lpTitulo(wiki, nombre) {
  const q = await lp(wiki, { action: 'query', titles: nombre, redirects: 1, prop: 'info' });
  const p = q.query?.pages?.find((x) => !x.missing);
  if (p) return p.title;
  const s = await lp(wiki, { action: 'query', list: 'search', srsearch: nombre, srlimit: 5, srnamespace: 0 });
  const ok = (s.query?.search || []).find((x) => norm(x.title) === norm(nombre));
  return ok ? ok.title : null;
}

// ficha de cada jugador de CS2 en Liquipedia (solo la seccion 0 de su pagina, una consulta barata para varios): roles (igl, awp, rifle,
// entry, support, lurk), equipo actual y los equipos por los que paso con sus fechas ({{TH|desde — hasta|equipo|nota}})
const fechaTh = (t) => { const m = String(t || '').match(/(\d{4})(?:-(\d\d|\?\?))?(?:-(\d\d|\?\?))?/); if (!m) return null; return m[2] && m[2] !== '??' ? (m[3] && m[3] !== '??' ? `${m[1]}-${m[2]}-${m[3]}` : `${m[1]}-${m[2]}`) : m[1]; };
export function leerInfoJugadorLp(c) {
  const m = c.match(/\|\s*roles?\s*=\s*([^\n|]*)/i);
  const roles = m ? m[1].split(/[,;/]/).map((r) => r.trim().toLowerCase()).filter((r) => /^[a-z][a-z -]{1,20}$/.test(r)).slice(0, 3) : [];
  const tm = c.match(/\|\s*team\s*=\s*([^\n|]*)/i), hist = [];
  for (const h of c.matchAll(/\{\{TH\|([^|}]*)\|([^|}]*)(?:\|([^|}]*))?\}\}/g)) {
    const [d, a] = String(h[1]).split(/\s*[—–]\s*|\s+-\s+/);
    const equipo = String(h[2]).replace(/\[\[|\]\]/g, '').trim(); if (!equipo) continue;
    hist.push({ equipo, desde: fechaTh(d), hasta: /present/i.test(a || '') ? null : fechaTh(a), nota: (h[3] || '').trim() || null });
  }
  return { roles, team: tm ? tm[1].replace(/\[\[|\]\]/g, '').trim() : '', hist: hist.reverse().slice(0, 20) };
}
async function rolesLp(wiki, titulos) {
  const lista = [...new Set(titulos.filter(Boolean))].slice(0, 40), res = new Map();
  if (!lista.length) return res;
  const j = await lp(wiki, { action: 'query', titles: lista.join('|'), redirects: 1, prop: 'revisions', rvprop: 'content', rvslots: 'main', rvsection: 0 });
  const alias = new Map();
  for (const x of j.query?.normalized || []) alias.set(x.from, x.to);
  for (const x of j.query?.redirects || []) alias.set(x.from, x.to);
  for (const p of j.query?.pages || []) {
    const c = p.revisions?.[0]?.slots?.main?.content || '';
    const i = leerInfoJugadorLp(c);
    if (i.roles.length || i.hist.length || i.team) res.set(p.title, i);
  }
  const buscar = (t) => { let x = t; for (let i = 0; i < 3 && alias.has(x); i++) x = alias.get(x); return res.get(x) || res.get(t.replace(/_/g, ' ')) || null; };
  return new Map(lista.map((t) => [t, buscar(t)]).filter(([, r]) => r));
}

// ---------- PandaScore: jugadores ----------
async function jugadoresPS(game, id, ps) {
  if (!ps) return [];
  const ts = await pedir(`https://api.pandascore.co/${game}/teams?filter[id]=${id}&per_page=1`, { headers: { authorization: `Bearer ${ps}` } });
  const t = ts?.[0]; if (!t) return [];
  jugadoresPS.equipo = { pais: t.location || null, siglas: t.acronym || null, logo: t.image_url || null };
  return (t.players || []).filter((p) => p.active !== false).map((p) => ({
    nick: p.name, nombre_real: [p.first_name, p.last_name].filter(Boolean).join(' ') || null, pais: p.nationality || null,
    rol: p.role || null, foto: p.image_url || null, edad: p.age || null,
  }));
}

// ---------- vlr.gg (API abierta de orlandomm): equipos anteriores y palmares de reserva de Valorant ----------
const VLR = 'https://vlr.orlandomm.net/api/v1';
let vlrLista = null;
async function vlrEquipo(nombre, acr) {
  if (!vlrLista) vlrLista = (await web(`${VLR}/teams?limit=all&region=all`)).data || [];
  const n = norm(nombre);
  const t = vlrLista.find((x) => norm(x.name) === n) || (acr ? vlrLista.find((x) => norm(x.name) === norm(acr)) : null);
  if (!t) return null;
  return (await web(`${VLR}/teams/${t.id}`)).data || null;
}
const mesesIng = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
function fechaVlr(txt) {   // "joined in January 2024" -> "2024-01"
  const m = String(txt || '').toLowerCase().match(/(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/);
  return m ? `${m[2]}-${String(mesesIng.indexOf(m[1]) + 1).padStart(2, '0')}` : (String(txt || '').match(/\d{4}/) || [null])[0];
}
export function fechasVlr(txt) {
  const t = String(txt || '').toLowerCase(), re = /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/g, f = [...t.matchAll(re)].map((m) => `${m[2]}-${String(mesesIng.indexOf(m[1]) + 1).padStart(2, '0')}`);
  if (/^\s*joined/.test(t)) return { desde: f[0] || null, hasta: null };
  if (/^\s*left/.test(t)) return { desde: null, hasta: f[0] || null };
  return { desde: f[0] || null, hasta: f[1] || null };
}
async function vlrAnteriores(equipoVlr, nicks) {
  const res = new Map();
  const lista = [...(equipoVlr.players || []), ...(equipoVlr.staff || [])];
  for (const nick of nicks.slice(0, 10)) {
    const p = lista.find((x) => normFuerte(x.user) === normFuerte(nick)); if (!p) continue;
    try {
      const d = (await web(`${VLR}/players/${p.id}`)).data;
      const agentes = (d?.agents || []).filter((a) => a.name).slice(0, 4).map((a) => ({ a: String(a.name).toLowerCase(), pj: a.mapsPlayed ?? null, pct: a.pickRate ?? null }));
      const foto = d?.info?.img && !/\/ph\/sil\.png/.test(d.info.img) ? d.info.img : null;
      res.set(nick, { agentes, foto_vlr: foto, vlr_url: d?.info?.url || p.url || null, pais_vlr: d?.info?.flag ? String(d.info.flag).toUpperCase() : null, desde_vlr: fechaVlr(d?.team?.joined), anteriores: (d?.pastTeams || []).filter((x) => x.name).slice(0, 14).map((x) => { const f = fechasVlr(x.info); return { equipo: x.name, desde: f.desde, hasta: f.hasta, nota: x.info || null }; }) });
    } catch {}
  }
  return res;
}
function palmaresVlr(equipoVlr) {
  const sirve = /playoffs?|main event|finals?|knockout|bracket|grand/i;
  const out = [];
  for (const e of equipoVlr.events || []) {
    let mejor = null;
    for (const r of e.results || []) {
      if (!sirve.test(r)) continue;
      const m = r.match(/(\d+)(?:st|nd|rd|th)(?:\s*[–-]\s*(\d+)(?:st|nd|rd|th))?/); if (!m) continue;
      const n = +m[1]; if (!mejor || n < mejor.n) mejor = { n, txt: m[2] ? `${m[1]}º a ${m[2]}º` : `${m[1]}º` };
    }
    if (mejor) out.push({ torneo: e.name, puesto: mejor.txt, puesto_n: mejor.n, fecha: e.year || null, premio: null, tier: null, logo: null, url: e.url || null });
  }
  return out.sort((a, b) => a.puesto_n - b.puesto_n || String(b.fecha).localeCompare(String(a.fecha))).slice(0, 12);
}

// ---------- una ficha de Valorant o CS2 ----------
export async function fichaEsports(c, ps) {
  const wiki = c.game === 'valorant' ? 'valorant' : 'counterstrike';
  const fuente = [], atribucion = [];
  const extra = { v: 1, ver: CFG.ver, tipo: c.game === 'valorant' ? 'v' : 'c', nombre: c.nombre, fuente, atribucion, actualizado: iso2(Date.now()), palmares: [], titulos: null, ganancias: null, jugadores: [], exjugadores: [], staff: [], exstaff: [] };
  jugadoresPS.equipo = null;
  const psJug = await jugadoresPS(c.game, c.id, ps).catch(() => []);
  if (jugadoresPS.equipo) extra.equipo = jugadoresPS.equipo;
  if (psJug.length) fuente.push('PandaScore');
  const nicks = new Map(psJug.map((p) => [normFuerte(p.nick), p]));

  let lpOk = false, titulo = null;
  try {
    titulo = await lpTitulo(wiki, c.nombre);
    if (titulo) {
      const r = await lp(wiki, { action: 'parse', page: titulo, prop: 'text', redirects: 1, disablelimitreport: 1, disabletoc: 1 }, true);
      const pag = leerPaginaLp(r.parse.text, wiki);
      const gente = [...pag.activos, ...pag.suplentes, ...pag.inactivos];
      const solapan = gente.some((p) => nicks.has(normFuerte(p.id)));
      const exacto = norm(titulo) === norm(c.nombre);
      if (gente.length || pag.palmares.length || pag.total != null) {
        if (!psJug.length && !exacto) throw new Error(`la pagina "${titulo}" no se puede confirmar`);
        if (psJug.length && gente.length && !solapan && !exacto) throw new Error(`la pagina "${titulo}" no coincide con la plantilla`);
        lpOk = true;
        extra.palmares = pag.palmares.slice(0, 12);
        extra.ganancias = pag.total != null ? { total: pag.total, moneda: 'USD', por_ano: pag.porAno, nota: 'Aproximado; incluye lo que ganaron los jugadores mientras representaban al equipo' } : null;
        // titulares (Active), suplentes (Substitute, Stand-in) e inactivos (Inactive): el estado dice a cual pertenece cada uno
        const estadoDe = (p, grupo) => (grupo === 'inactivos' ? 'Inactive' : grupo === 'suplentes' ? (/stand/i.test(p.rol || '') ? 'Stand-in' : 'Substitute') : /loan/i.test(p.rol || '') ? 'Loan' : null);
        const jug = [];
        for (const grupo of ['activos', 'suplentes', 'inactivos']) for (const p of pag[grupo]) {
          const q = nicks.get(normFuerte(p.id));
          jug.push({ nombre: p.id, nombre_real: p.nombre || q?.nombre_real || null, pais: (q?.pais || p.pais || null), rol: q?.rol || null, estado: estadoDe(p, grupo),
            capitan: p.capitan || undefined, desde: p.desde, inactivo_desde: p.inactivo || undefined, foto: q?.foto || null, edad: q?.edad || null, ganancias: null, anteriores: null, _t: p.titulo });
        }
        extra.jugadores = jug;
        extra.exjugadores = pag.antiguos.slice(0, 70).map((p) => ({ nombre: p.id, pais: p.pais, desde: p.desde, hasta: p.hasta, nuevo_equipo: p.nuevo || null }));
        extra.staff = pag.staff.slice(0, 16).map((p) => ({ nombre: p.id, nombre_real: p.nombre || null, rol: p.rol || null, pais: p.pais, desde: p.desde }));
        extra.exstaff = pag.exstaff.slice(0, 25).map((p) => ({ nombre: p.id, rol: p.rol || null, pais: p.pais, desde: p.desde, hasta: p.hasta, nuevo_equipo: p.nuevo || null }));
        fuente.push('Liquipedia');
        atribucion.push({ fuente: 'Liquipedia', texto: 'Datos de Liquipedia', url: `https://liquipedia.net/${wiki}/${encodeURIComponent(titulo.replace(/ /g, '_'))}`, licencia: 'CC BY-SA 3.0', licencia_url: 'https://creativecommons.org/licenses/by-sa/3.0/' });
      }
    }
  } catch (e) { extra.aviso_liquipedia = String(e.message || e).slice(0, 120); }

  if (lpOk && c.game !== 'valorant') {   // CS2: roles (IGL, AWPer, rifler, entry, support, lurker) desde la ficha de cada jugador
    try {
      const info = await rolesLp(wiki, extra.jugadores.filter((j) => j.estado !== 'Inactive').map((j) => j._t));
      for (const j of extra.jugadores) {
        const r = j._t && info.get(j._t); if (!r) continue;
        if (r.roles.length) j.roles = r.roles;
        if (r.hist.length) j.anteriores = r.hist;
      }
    } catch (e) { extra.aviso_roles = String(e.message || e).slice(0, 120); }
  }
  for (const j of extra.jugadores) delete j._t;
  if (lpOk && titulo) {   // todos los torneos del equipo de siempre: Equipo/Results
    try {
      const r = await lp(wiki, { action: 'parse', page: `${titulo}/Results`, prop: 'text', redirects: 1, disablelimitreport: 1, disabletoc: 1 }, true);
      extra.titulos = resumirTitulos(leerPaginaLp(r.parse.text, wiki).palmares);
      const T = extra.titulos;
      if (T && T.premios_total && !extra.ganancias) extra.ganancias = { total: T.premios_total, moneda: 'USD', por_ano: T.por_ano, nota: 'Suma de los premios de torneos; incluye lo que ganaron los jugadores mientras representaban al equipo' };
      else if (T && extra.ganancias && !extra.ganancias.por_ano && T.por_ano.length) extra.ganancias.por_ano = T.por_ano;
    } catch (e) { extra.aviso_results = String(e.message || e).slice(0, 120); }
  }

  if (!extra.jugadores.length && psJug.length) {
    extra.jugadores = psJug.map((q) => ({ nombre: q.nick, nombre_real: q.nombre_real, pais: q.pais, rol: q.rol, estado: null, desde: null, foto: q.foto, edad: q.edad, ganancias: null, anteriores: null }));
  }

  if (c.game === 'valorant') {   // vlr.gg: equipos anteriores de cada jugador, y palmares de reserva
    try {
      const ev = await vlrEquipo(c.nombre, c.acr);
      if (ev) {
        const ant = await vlrAnteriores(ev, extra.jugadores.map((j) => j.nombre));
        for (const j of extra.jugadores) {
          const a = ant.get(j.nombre);
          if (a) { j.anteriores = a.anteriores; if (!j.desde && a.desde_vlr) j.desde = a.desde_vlr; if (a.agentes?.length) j.agentes = a.agentes; if (!j.foto && a.foto_vlr) j.foto = a.foto_vlr; if (!j.pais && a.pais_vlr) j.pais = a.pais_vlr; if (a.vlr_url) j.vlr = a.vlr_url; }
        }
        if (!extra.palmares.length) extra.palmares = palmaresVlr(ev);
        if (ant.size || extra.palmares.length) { fuente.push('vlr.gg'); atribucion.push({ fuente: 'vlr.gg', texto: 'Datos de vlr.gg', url: ev.info?.name ? 'https://www.vlr.gg/' : null }); }
      }
    } catch (e) { extra.aviso_vlr = String(e.message || e).slice(0, 120); }
  }
  if (psJug.length) atribucion.push({ fuente: 'PandaScore', texto: 'Fotos y datos de jugadores: PandaScore', url: 'https://pandascore.co' });

  extra.resumen = resumenPalmares(extra.palmares);
  if (!extra.palmares.length && !extra.jugadores.length && !extra.ganancias) throw new Error('ninguna fuente dio datos');
  return extra;
}
function resumenPalmares(p) {
  const n = (k) => p.reduce((a, x) => a + (x.puesto_n === k ? (x.veces || 1) : 0), 0);
  return { oros: n(1), platas: n(2), bronces: n(3), premios: p.reduce((a, x) => a + (x.premio || 0), 0) || null };
}

// ---------- futbol: ESPN + Wikidata + Wikipedia ----------
const tipoClub = /football club|soccer club|association football|football team|football association/i;
async function wikidataClub(nombres) {
  for (const nombre of nombres) {
    const j = await web(`https://www.wikidata.org/w/api.php?${qs({ action: 'wbsearchentities', search: nombre, language: 'en', type: 'item', limit: 8, format: 'json' })}`);
    const buenos = (j.search || []).filter((x) => tipoClub.test(x.description || '') && !/women|ladies|youth|reserves|under-\d+|u\d\d/i.test(`${x.label} ${x.description}`));
    const nn = normFuerte(nombre);
    const x = buenos.find((b) => normFuerte(b.label) === nn) || buenos.find((b) => { const l = normFuerte(b.label); return l.includes(nn) || nn.includes(l); }) || null;
    if (x) return x;
  }
  return null;
}
async function wikipediaHonours(titulo) {
  const api = 'https://en.wikipedia.org/w/api.php';
  const sec = await web(`${api}?${qs({ action: 'parse', page: titulo, prop: 'sections', format: 'json', formatversion: 2, redirects: 1 })}`);
  const s = (sec.parse?.sections || []).find((x) => /^(honou?rs|trophies|titles|palmar[eè]s|achievements|major honou?rs)$/i.test(x.line.replace(/<[^>]+>/g, '').trim()) && x.toclevel <= 2);
  if (!s) return null;
  const j = await web(`${api}?${qs({ action: 'parse', page: titulo, prop: 'text', section: s.index, format: 'json', formatversion: 2, redirects: 1 })}`);
  return j.parse?.text || null;
}
const anios = (s) => [...String(s).matchAll(/\b(1[89]\d\d|20\d\d)(?:\s*[–-]\s*(\d{2,4}))?/g)].map((m) => (m[2] ? `${m[1]}–${m[2].slice(-2)}` : m[1]));
const esSub = /^runners?[- ]up/i;
// lee tablas (Type | Competition | Titles | Seasons) y listas anidadas (Competicion > Champions: anos)
export function leerHonoursHtml(html) {
  const out = [];
  const poner = (torneo, puesto_n, veces, lista) => {
    torneo = torneo.replace(/\s*\(level \d+\)/i, '').replace(/\s+/g, ' ').trim();
    if (!torneo || (!lista.length && !veces)) return;
    out.push({ torneo, puesto: puesto_n === 1 ? 'Campeón' : 'Subcampeón', puesto_n, veces: veces ?? lista.length, anios: lista.slice(-15) });
  };
  for (const tb of tablas(html)) {
    const cab = tb.filas[0].map((c) => c.txt.toLowerCase());
    if (!cab.some((c) => /titles|winners|won/.test(c))) continue;
    for (const f of tb.filas.slice(1)) {
      if (f.length < 3) continue;
      const [comp, tit, temp] = f.slice(-3);
      if (/^total/i.test(comp.txt) || !/^\d/.test(tit.txt)) continue;
      poner(comp.txt, 1, numero(tit.txt), anios(temp.txt));
    }
  }
  if (out.length) return out;
  // listas: <li>Competicion<ul><li>Champions: 1932-33, ...</li><li>Runners-up: ...</li></ul></li>
  const lineas = [];
  const resto = html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<sup[\s\S]*?<\/sup>/g, '');
  for (const m of resto.matchAll(/<(\/?)(\w+)[^>]*>|([^<]+)/g)) {
    if (m[2]) {
      const et = m[2].toLowerCase();
      if (!m[1] && /^(li|p|dd|dt|h[2-6])$/.test(et)) lineas.push('');
      else if (et === 'br' && lineas.length) lineas[lineas.length - 1] += ' ';
    } else if (lineas.length) lineas[lineas.length - 1] += m[3];
  }
  let comp = null;
  for (const linea of lineas) {
    const t = dec(linea).replace(/\s+/g, ' ').trim(); if (!t) continue;
    const m = t.match(/^(.*?)\s*[:–-]\s*(champions?|winners?|runners?[- ]up)\s*(?:\((\d+)\))?\s*[:–-]?\s*(.*)$/i);
    const m2 = t.match(/^(champions?|winners?|runners?[- ]up|play-?offs? winners)\s*(?:\((\d+)\))?\s*:\s*(.*)$/i);
    if (m2 && comp) {
      const nombre = /play-?offs? winners/i.test(m2[1]) ? comp + ' (play-off)' : comp;
      poner(nombre, /runner/i.test(m2[1]) ? 2 : 1, m2[2] ? +m2[2] : null, anios(m2[3]));
    } else if (m && m[1] && m[1].length < 80) {
      poner(m[1], /runner/i.test(m[2]) ? 2 : 1, m[3] ? +m[3] : null, anios(m[4]));
    } else if (t.length < 90 && !/^(source|note)/i.test(t) && !/^(league|cup|domestic|european|international|other|worldwide|friendly|doubles?)$/i.test(t)) {
      comp = t.replace(/:$/, '');
    }
  }
  return out;
}
export async function fichaFutbol(c) {
  const fuente = ['ESPN'], atribucion = [{ fuente: 'ESPN', texto: 'Datos de ESPN', url: null }];
  const extra = { v: 1, tipo: 'f', nombre: c.nombre, fuente, atribucion, actualizado: iso2(Date.now()), palmares: [], club: {}, ganancias: null };
  let nombres = [c.nombre];
  try {
    const e = await web(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/${c.liga}/teams/${c.id.slice(2)}`);
    nombres = [...new Set([e.displayName, e.location, c.nombre].filter(Boolean))];
    extra.club = { nombre: e.displayName || null, apodo: e.nickname || null, estadio: e.venue?.fullName || null, ciudad: e.venue?.address?.city || null, pais: e.venue?.address?.country || null, logo: e.logos?.[0]?.href || null };
    extra.nombre = e.displayName || c.nombre;
  } catch {}
  const x = await wikidataClub(nombres);
  if (!x) throw new Error(`Wikidata no encuentra el club "${nombres[0]}"`);
  const ent = (await web(`https://www.wikidata.org/w/api.php?${qs({ action: 'wbgetentities', ids: x.id, props: 'sitelinks|claims', sitefilter: 'enwiki', format: 'json' })}`)).entities?.[x.id];
  const tituloWp = ent?.sitelinks?.enwiki?.title;
  const ano = ent?.claims?.P571?.[0]?.mainsnak?.datavalue?.value?.time?.match(/\+(\d{4})/)?.[1];
  if (ano) extra.club.fundado = +ano;
  extra.club.wikidata = x.id;
  if (tituloWp) {
    const html = await wikipediaHonours(tituloWp).catch(() => null);
    if (html) extra.palmares = leerHonoursHtml(html).slice(0, 40);
    fuente.push('Wikipedia');
    atribucion.push({ fuente: 'Wikipedia', texto: 'Datos de Wikipedia', url: `https://en.wikipedia.org/wiki/${encodeURIComponent(tituloWp.replace(/ /g, '_'))}`, licencia: 'CC BY-SA 4.0', licencia_url: 'https://creativecommons.org/licenses/by-sa/4.0/' });
  }
  if (!extra.palmares.length) {   // plan B: Wikidata, mas corto pero estructurado (temporadas con "ganador" = el club)
    const q = `SELECT ?sLabel ?compLabel ?start WHERE { ?s wdt:P1346 wd:${x.id} . OPTIONAL{?s wdt:P3450 ?comp} OPTIONAL{?s wdt:P580 ?start} SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`;
    try {
      const j = await web(`https://query.wikidata.org/sparql?${qs({ query: q, format: 'json' })}`, { accept: 'application/sparql-results+json' });
      const g = new Map();
      for (const b of j.results.bindings) { const k = b.compLabel?.value || b.sLabel?.value; if (!k) continue; const a = (b.sLabel?.value.match(/\b(1[89]\d\d|20\d\d)(?:[–-]\d{2,4})?/) || [''])[0]; if (!g.has(k)) g.set(k, []); if (a) g.get(k).push(a); }
      extra.palmares = [...g.entries()].map(([torneo, l]) => ({ torneo, puesto: 'Campeón', puesto_n: 1, veces: l.length || 1, anios: l.sort().slice(-15) })).sort((a, b) => b.veces - a.veces).slice(0, 20);
      if (extra.palmares.length) { fuente.push('Wikidata'); atribucion.push({ fuente: 'Wikidata', texto: 'Datos de Wikidata (CC0)', url: `https://www.wikidata.org/wiki/${x.id}` }); }
    } catch {}
  }
  extra.resumen = { oros: extra.palmares.filter((p) => p.puesto_n === 1).reduce((a, p) => a + (p.veces || 1), 0), platas: extra.palmares.filter((p) => p.puesto_n === 2).reduce((a, p) => a + (p.veces || 1), 0) };
  if (!extra.palmares.length && !extra.club.estadio) throw new Error('ninguna fuente dio datos');
  return extra;
}

// ---------- UFC (ESPN) ----------
export async function fichaUfc(c) {
  const core = 'https://sports.core.api.espn.com/v2/sports/mma';
  const a = await web(`${core}/athletes/${c.id.slice(2)}`);
  const extra = { v: 1, tipo: 'u', nombre: a.fullName || c.nombre, fuente: ['ESPN'], atribucion: [{ fuente: 'ESPN', texto: 'Datos de ESPN', url: a.links?.find((l) => l.rel?.includes('playercard'))?.href || null }],
    actualizado: iso2(Date.now()), palmares: [], ganancias: null,
    ficha: { apodo: a.nickname || null, edad: a.age || null, nacimiento: (a.dateOfBirth || '').slice(0, 10) || null, pais: a.citizenship || null, categoria: a.weightClass?.text || null, altura: a.displayHeight || null,
      peso: a.displayWeight || null, alcance: a.displayReach || null, postura: a.stance?.text || null, gimnasio: a.association?.name || null, activo: a.active ?? null },
    cinturones: (a.accolades || []).map((x) => ({ nombre: x.name, tipo: x.type })) };
  try {
    const rec = (await web(`${core}/athletes/${c.id.slice(2)}/records`)).items?.[0];
    if (rec) {
      const s = Object.fromEntries((rec.stats || []).map((x) => [x.name, x.value]));
      extra.record = { resumen: rec.summary, victorias: s.wins ?? null, derrotas: s.losses ?? null, empates: s.draws ?? null, sin_resultado: s.noContests ?? null,
        por_ko: s.tkos ?? null, por_sumision: s.submissions ?? null, por_decision: s.wins != null ? s.wins - (s.tkos || 0) - (s.submissions || 0) : null,
        derrotas_ko: s.tkoLosses ?? null, derrotas_sumision: s.submissionLosses ?? null,
        titulo: { victorias: s.titleWins ?? 0, derrotas: s.titleLosses ?? 0, empates: s.titleDraws ?? 0 } };
    }
  } catch {}
  try {
    const r = a.ranks?.$ref ? (await web(a.ranks.$ref.replace(/^http:/, 'https:'))).items?.[0]?.$ref : null;
    if (r) { const k = await web(r.replace(/^http:/, 'https:')); extra.ranking = { posicion: k.rank?.current ?? null, categoria: k.weightClass?.text || k.shortName || null, defensas: k.rank?.defenses ?? null, campeon: k.rank?.hasAccolade ?? null }; }
  } catch {}
  // ultimos combates por el titulo (hasta 5): fecha, evento, rival y resultado
  try {
    const ov = await web(`https://site.web.api.espn.com/apis/common/v3/sports/mma/ufc/athletes/${c.id.slice(2)}/overview`);
    for (const uid of (ov.titleFights || []).slice(0, 5)) {
      const m = String(uid).match(/e:(\d+)~c:(\d+)/); if (!m) continue;
      try {
        const comp = await web(`${core}/leagues/ufc/events/${m[1]}/competitions/${m[2]}`);
        const yo = (comp.competitors || []).find((x) => String(x.id) === c.id.slice(2)), otro = (comp.competitors || []).find((x) => String(x.id) !== c.id.slice(2));
        const ev = await web(`${core}/leagues/ufc/events/${m[1]}`).catch(() => null);
        const rival = otro ? (await web(`${core}/athletes/${otro.id}`).catch(() => null))?.fullName : null;
        extra.palmares.push({ torneo: ev?.name || 'Combate por el título', puesto: yo?.winner ? 'Victoria' : 'Derrota', puesto_n: yo?.winner ? 1 : 0,
          fecha: (comp.date || '').slice(0, 10), premio: null, tier: comp.type?.text || null, logo: null, rival: rival || null, marcador: null, url: null });
      } catch {}
    }
  } catch {}
  if (!extra.record && !extra.cinturones.length && !extra.ficha.pais) throw new Error('ESPN no dio datos del luchador');
  extra.resumen = { oros: extra.record?.titulo?.victorias ?? 0, platas: extra.record?.titulo?.derrotas ?? 0 };
  return extra;
}

// ---------- jugadores de esports: ganancias torneo a torneo (db/050, teams.pj) ----------
// Aparte de la ficha del equipo porque se rehace a otro ritmo y la ficha se reescribe entera cada vez.
//   Valorant: la pagina del jugador en vlr.gg (una peticion normal, rapida): cada evento con fase, puesto, premio y equipo, y el total.
//   CS2: la pagina Jugador/Results de Liquipedia (un action=parse, 1 cada 32 s): premio del equipo repartido entre 5, aproximado.
// Un jugador no se rehace antes de 7 dias (1 dia tras un fallo); la clave del jugador es su nick en minusculas.
const JVIDA = 7 * DAY, JFALLO = DAY;
const titulares = (p) => (p || []).filter((x) => x && x[0] && (!x[1] || x[1] === 'Loan')).slice(0, 7);
const pendienteJ = (t, ahora) => !t || ahora - t > JVIDA;
const entradaFallo = (ahora, motivo) => ({ t: ahora - JVIDA + JFALLO, fallo: String(motivo || '').slice(0, 80) });

export async function jugadoresValorant(c, nicks, ahora = Date.now()) {
  const out = {};
  const ev = await vlrEquipo(c.nombre, c.acr);
  if (!ev) { for (const n of nicks) out[n.toLowerCase()] = entradaFallo(ahora, 'equipo sin pagina en vlr.gg'); return out; }
  for (const nick of nicks) {
    const clave = nick.toLowerCase(), vp = (ev.players || []).find((x) => normFuerte(x.user) === normFuerte(nick));
    if (!vp) { out[clave] = entradaFallo(ahora, 'jugador sin pagina en vlr.gg'); continue; }
    try {
      const html = await web(`https://www.vlr.gg/player/${vp.id}`, {}, false);
      const g = leerGananciasVlr(html);
      out[clave] = g ? { t: Date.now(), g } : entradaFallo(ahora, 'sin ganancias en vlr.gg');
    } catch (e) { out[clave] = entradaFallo(ahora, e.message); }
  }
  return out;
}

// CS2: primero una consulta barata para varios (confirma que el titulo de Liquipedia es de este jugador y de este equipo), y despues el parse de cada uno
export async function jugadoresCs(c, nicks, { quedaTiempo = () => true, max = CFG.maxJugCs, ahora = Date.now() } = {}) {
  const out = {}, wiki = 'counterstrike';
  const info = await rolesLp(wiki, nicks);
  const mismo = (i) => i && (norm(i.team) === norm(c.nombre) || (i.hist || []).some((h) => !h.hasta && norm(h.equipo) === norm(c.nombre)) || (i.hist || []).some((h) => norm(h.equipo) === norm(c.nombre)));
  let hechos = 0;
  for (const nick of nicks) {
    const clave = nick.toLowerCase(), i = info.get(nick) || [...info.entries()].find(([t]) => normFuerte(t) === normFuerte(nick))?.[1];
    if (!i) { out[clave] = entradaFallo(ahora, 'sin pagina en Liquipedia'); continue; }
    if (!mismo(i)) { out[clave] = entradaFallo(ahora, 'la pagina no es de este equipo'); continue; }
    if (hechos >= max || !quedaTiempo()) continue;
    hechos++;
    try {
      const r = await lp(wiki, { action: 'parse', page: `${nick}/Results`, prop: 'text', redirects: 1, disablelimitreport: 1, disabletoc: 1 }, true);
      const g = resumirGananciasJugador(leerResultadosJugador(r.parse.text));
      out[clave] = g ? { t: Date.now(), g } : entradaFallo(ahora, 'sin resultados en Liquipedia');
    } catch (e) { out[clave] = entradaFallo(ahora, e.message); }
  }
  return out;
}

export async function jugadoresEsports({ cands, rpc, secret, dry = false, limite, log = console.log } = {}) {
  const hechos = { equipos: 0, jugadores: 0 };
  if (!rpc || !secret) return hechos;
  const ahora = Date.now(), ids = cands.filter((c) => c.tipo === 'esports').map((c) => c.clave);
  if (!ids.length) return hechos;
  let estado = {}; try { estado = (await rpc('sync_jugadores_get', { p_secret: secret, p_ids: ids })) || {}; } catch (e) { log('jugadores: no pude leer lo guardado', e.message); return hechos; }
  let cs = 0;
  for (const c of cands.filter((x) => x.tipo === 'esports')) {
    const e = estado[c.clave]; if (!e) continue;   // sin ficha del equipo todavia: no se sabe quienes son sus titulares
    const nicks = titulares(e.p).map((x) => x[0]).filter((n) => pendienteJ(e.t?.[n.toLowerCase()], ahora));
    if (!nicks.length) continue;
    if (Date.now() > limite - (c.game === 'valorant' ? 10e3 : CFG.gapParse)) break;
    try {
      const jug = c.game === 'valorant' ? await jugadoresValorant(c, nicks, ahora)
        : await jugadoresCs(c, nicks, { quedaTiempo: () => Date.now() < limite - CFG.gapParse, max: Math.max(0, CFG.maxJugCs - cs), ahora });
      if (c.game !== 'valorant') cs += Object.values(jug).filter((x) => x.g).length;
      const n = Object.keys(jug).length; if (!n) continue;
      hechos.equipos++; hechos.jugadores += n;
      if (!dry) await rpc('sync_jugadores_put', { p_secret: secret, p_rows: [{ id: c.clave, jug }] });
      if (process.env.EQUIPOS_VER) log(JSON.stringify({ [c.clave]: jug }));
    } catch (er) { log('jugadores', c.clave, 'fallo:', String(er.message || er).slice(0, 120)); }
  }
  return hechos;
}

// ---------- reparto entre pasadas ----------
export function candidatos(rows, apuestas = {}, ahora = Date.now()) {
  const mapa = new Map();
  for (const r of rows) {
    if (r.status !== 'scheduled' && r.status !== 'live') continue;
    const t = Date.parse(r.starts_at); if (!t || t > ahora + CFG.ventana) continue;
    for (const lado of ['a', 'b']) {
      const nombre = lado === 'a' ? r.home : r.away, logo = lado === 'a' ? r.home_logo : r.away_logo;
      let c = null;
      if ((r.sport === 'v' || r.sport === 'c') && r.details?.ids?.[lado]) { const game = r.details.game; c = { clave: `${game}:${r.details.ids[lado]}`, tipo: 'esports', game, id: String(r.details.ids[lado]), nombre, logo }; }
      else if (r.sport === 'f' && r.details?.espn?.ids?.[lado]) c = { clave: `f:${r.details.espn.ids[lado]}`, id: `f:${r.details.espn.ids[lado]}`, tipo: 'futbol', liga: r.details.espn.league, nombre, logo };
      else if (r.sport === 'u' && r.details?.espn?.ids?.[lado]) c = { clave: `u:${r.details.espn.ids[lado]}`, id: `u:${r.details.espn.ids[lado]}`, tipo: 'ufc', nombre, logo };
      if (!c) continue;
      c.apuestas = apuestas[r.id] || 0; c.t = t;
      const antes = mapa.get(c.clave);
      if (!antes) mapa.set(c.clave, c);
      else { antes.apuestas += c.apuestas; antes.t = Math.min(antes.t, c.t); }
    }
  }
  return [...mapa.values()].sort((a, b) => (b.apuestas > 0) - (a.apuestas > 0) || a.t - b.t);
}
// toca si nunca se hizo, si pasaron 3 dias, y no si se intento hace poco (espera 1 h, 2 h, 4 h... hasta 24 h tras fallos seguidos)
export function toca(c, cache, ahora = Date.now()) {
  const k = cache?.[c.clave];
  if (!k) return true;
  if (k.i) { const espera = Math.min(24, 2 ** (k.f || 0)) * 3600e3; if (ahora - k.i < (k.f ? espera : 3600e3)) return false; }
  return !k.t || ahora - k.t > CFG.vida || (c.tipo === 'esports' && k.p != null && k.p < CFG.ver);
}

export async function equiposExtra({ rows, rpc, secret, dry = false, ps = process.env.PANDASCORE_KEY, log = console.log, cache: cacheFija, apuestas: apFija } = {}) {
  const t0 = Date.now(), limite = t0 + CFG.presupuestoMs;
  let apuestas = apFija || {}, cache = cacheFija || {};
  if (rpc && secret && !apFija) { try { apuestas = (await rpc('sync_equipos_extra_apuestas', { p_secret: secret })) || {}; } catch (e) { log('equipos extra: no pude leer las apuestas', e.message); } }
  const cands = candidatos(rows, apuestas);
  if (rpc && secret && !cacheFija) { try { cache = (await rpc('sync_equipos_extra_get', { p_secret: secret, p_ids: cands.map((c) => c.clave) })) || {}; } catch (e) { log('equipos extra: no pude leer lo guardado', e.message); return; } }
  const pend = cands.filter((c) => toca(c, cache));
  const carril = (tipo, max) => pend.filter((c) => c.tipo === tipo).slice(0, max);
  const lista = { esports: carril('esports', CFG.maxEsports), otros: [...carril('futbol', CFG.maxFutbol), ...carril('ufc', CFG.maxUfc)] };
  const hechos = { ok: 0, fallo: 0 };
  const guardar = async (c, extra, error) => {
    if (error) { hechos.fallo++; log(`equipos extra: ${c.clave} (${c.nombre}) fallo: ${error}`); }
    else { hechos.ok++; }
    if (!rpc || !secret || dry) return;
    let fila = error ? { id: c.clave, fallo: true } : { id: c.clave, extra };
    if (!error && JSON.stringify(extra).length > CFG.tamMax) { extra.exjugadores = (extra.exjugadores || []).slice(0, 20); extra.exstaff = (extra.exstaff || []).slice(0, 5); extra.palmares = extra.palmares.slice(0, 8); if (extra.titulos) { extra.titulos.lista = extra.titulos.lista.slice(0, 40); extra.titulos.podios = (extra.titulos.podios || []).slice(0, 20); extra.titulos.premios = (extra.titulos.premios || []).slice(0, 50); } fila = { id: c.clave, extra }; }
    try { await rpc('sync_equipos_extra_put', { p_secret: secret, p_rows: [fila] }); } catch (e) { log('equipos extra: no pude guardar', c.clave, e.message); }
  };
  const correr = async (cs) => {
    for (const c of cs) {
      if (Date.now() > limite - (c.tipo === 'esports' ? CFG.gapParse : 5000)) break;
      try {
        const extra = c.tipo === 'esports' ? await fichaEsports(c, ps) : c.tipo === 'futbol' ? await fichaFutbol(c) : await fichaUfc(c);
        await guardar(c, extra);
        if (log && process.env.EQUIPOS_VER) log(JSON.stringify({ [c.clave]: extra }));
      } catch (e) { await guardar(c, null, String(e.message || e).slice(0, 160)); }
    }
  };
  await Promise.all([correr(lista.esports), correr(lista.otros)]);
  let jug = { equipos: 0, jugadores: 0 };
  try { jug = await jugadoresEsports({ cands, rpc, secret, dry, limite, log }); } catch (e) { log('jugadores de esports:', e.message || e); }
  log(`fichas ampliadas: ${cands.length} equipos con partido · ${pend.length} por hacer · ${hechos.ok} hechas · ${hechos.fallo} con fallo · ${jug.jugadores} jugadores de ${jug.equipos} equipos · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  return hechos;
}
