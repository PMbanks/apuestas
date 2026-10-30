// Extras de Gambling Addicts (PM, 30-10), tres cosas que se cuelgan del DOM de la app sin tocar app.js:
//  1) CUOTA MEJORADA SEMANAL: cada semana el servidor sube un 25 a 50 % la cuota de un partido gordo (db/022_extras.sql). Aqui se
//     marca en la fila, en la ficha y en un aviso de Partidos, con la cuota vieja tachada. El servidor es quien paga con la nueva.
//  2) PREDICCION RAPIDA en Directo: "habra gol en 10 minutos" (futbol) y "quien gana la siguiente ronda" (Valorant, con vlr.gg).
//     Apuesta pequena a cuota fija; la resuelve el sincronizador con ESPN y vlr.gg, esto solo pide y pinta.
//  3) VITRINA (3 skins del inventario) y SALA DE TROFEOS en el perfil.
// Va aparte, como vivo.js: un MutationObserver pone cada cosa cuando la app pinta su pantalla y la vuelve a poner cuando repinta.
// Usa el cliente de la app (const db de app.js); si no existe, crea uno con la misma sesion.
'use strict';
(function () {
  if (window.__gaExtras) return;   // por si la pagina lo carga dos veces: dos copias se pelearian por el DOM
  window.__gaExtras = true;
  const CFG = window.APP_CONFIG || {};
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const N = (x) => String(Math.round(x || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, document.documentElement.lang === 'en' ? ',' : '.');
  const O = (x) => Number(x).toFixed(2).replace('.', document.documentElement.lang === 'en' ? '.' : ',');
  const lang = () => (window.GM_LANG && GM_LANG.get() === 'en' ? 'en-GB' : 'es-ES');
  const traduce = (el) => { if (window.GM_LANG && el) { try { GM_LANG.traduce(el) } catch {} } };
  const coin = () => '<span class="cn"></span>';
  const BOLT = '<svg class="xb-bolt" viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 2 5 13.5h6L10 22l9-12h-6z"/></svg>';
  const CUP = '<svg class="xv-cup" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4"/></svg>';
  const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h + ':' + s.length };
  const saldo = () => { try { return me().s } catch { return null } };
  const avisa = (html) => { try { if (typeof toast === 'function') toast(html) } catch {} };
  const recarga = () => { try { if (typeof refresh === 'function') refresh() } catch {} };
  const aviso = (e) => esc((e && (e.message || e.error_description)) || 'Algo ha fallado').replace(/^.*?: /, (x) => (x.length < 30 ? '' : x));

  /* ---------- la base ---------- */
  let cli = null;
  function base() {
    if (cli) return cli;
    try { cli = db } catch { cli = null }
    if (!cli && window.supabase && CFG.url) cli = supabase.createClient(CFG.url, CFG.anon, { auth: { persistSession: true, autoRefreshToken: false, storageKey: 'apuestas-auth' } });
    return cli;
  }
  async function rpc(fn, args) {
    const c = base(); if (!c) throw new Error('Sin conexión');
    const { data, error } = await c.rpc(fn, args || {});
    if (error) throw error;
    return data;
  }
  const noEsta = (e) => /Could not find the function|PGRST202|schema cache/i.test(String((e && (e.message || '')) + (e && e.code)));

  /* =====================================================================================================
     1) CUOTA MEJORADA
     ===================================================================================================== */
  const B = { t: 0, list: [], tope: 1000, vivo: false, off: 0 };
  async function cargaBoost(forzar) {
    if (B.vivo || Date.now() < B.off || (!forzar && Date.now() - B.t < 90e3)) return;
    B.vivo = true;
    try { const d = await rpc('ex_estado'); B.list = d.boosts || []; B.tope = d.tope || 1000; B.t = Date.now() }
    catch (e) { B.off = Date.now() + (noEsta(e) ? 30 : 3) * 60e3; B.t = Date.now() }
    B.vivo = false; rev();
  }
  const centimos = (txt) => { const m = /(\d+),(\d\d)/.exec(txt || ''); return m ? +m[1] * 100 + +m[2] : null };
  const mejora = (c, pct) => Math.floor((c * (100 + pct) + 50) / 100);         // igual que round(o * (100 + pct) / 100, 2) en la base
  const fmtC = (c) => (c / 100).toFixed(2).replace('.', document.documentElement.lang === 'en' ? '.' : ',');
  const aplica = (b, p) => !b.pick || b.pick === p;
  const cuando = (t) => { try { const f = (o) => new Intl.DateTimeFormat(lang(), { timeZone: 'Europe/Madrid', ...o }).format(new Date(t)); return `${f({ weekday: 'short' }).replace('.', '')} ${f({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}` } catch { return '' } };
  const quePick = (b) => (b.pick ? `la cuota de ${b.pick === '1' ? b.home : b.pick === '2' ? b.away : 'el empate'}` : 'las tres cuotas');
  const primerTexto = (el) => { for (const n of el.childNodes) if (n.nodeType === 3 && n.nodeValue.trim()) return n; return null };

  function parcheaBoost() {
    const hoy = Date.now(), vivas = B.list.filter((b) => Date.parse(b.at) > hoy);
    // aviso en Partidos
    const tablero = document.querySelector('.p-board');
    if (tablero) {
      const sig = hash(JSON.stringify(vivas.map((b) => [b.match, b.pick, b.pct, b.usado])) + B.tope), ya = tablero.querySelector('.xb-aviso');
      if (!vivas.length) { if (ya) ya.remove() }
      else if (!ya || ya.dataset.sig !== sig) {
        const b = vivas[0], resta = b.usado ? Math.max(0, B.tope - b.usado) : null;
        const h = `<button class="xb-aviso" data-foc="${esc(b.match)}" data-sig="${sig}"><span class="xb-pill">${BOLT}CUOTA MEJORADA</span>
          <span class="xb-tx"><b>${esc(b.home)} vs ${esc(b.away)}</b><em>${esc(cuando(b.at))} · ${esc(b.league || '')}</em><span>Sube un ${b.pct} % ${esc(quePick(b))}</span></span>
          <span class="xb-lim">Hasta ${N(B.tope)} por jugador${resta != null ? `<small>Te quedan ${N(resta)}</small>` : ''}</span></button>`;
        if (ya) ya.remove();
        tablero.insertAdjacentHTML('afterbegin', h); traduce(tablero.firstElementChild);
      }
    }
    for (const b of vivas) {
      const id = b.match;
      // filas y destacados
      document.querySelectorAll(`.row[data-foc="${id}"]`).forEach((row) => {
        if (!row.querySelector('.xb-tag')) { row.classList.add('xb-row'); row.insertAdjacentHTML('beforeend', `<i class="xb-tag">${BOLT}CUOTA MEJORADA</i>`); traduce(row.lastElementChild) }
        row.querySelectorAll('.o[data-pick]').forEach((btn) => tachaBoton(btn, b));
      });
      document.querySelectorAll(`.ft[data-foc="${id}"] .ft-o span`).forEach((sp) => {
        const p = (sp.firstChild && String(sp.firstChild.nodeValue || '').trim()) || '', bb = sp.querySelector('b');
        if (!bb || bb.dataset.xb || !PICKS.includes(p) || !aplica(b, p)) return;
        const c = centimos(bb.textContent); if (c == null) return;
        bb.dataset.xb = '1'; bb.className = 'xb-g'; bb.title = `Cuota mejorada, antes ${bb.textContent}`; bb.textContent = fmtC(mejora(c, b.pct));
      });
      // ficha
      const caja = document.querySelector(`#espn-box[data-m="${id}"]`), det = caja && caja.closest('.det');
      if (det) {
        const picks = det.querySelector('.picks');
        if (picks && !det.querySelector('.xb-ficha')) {
          const resta = b.usado ? ` · te quedan ${N(Math.max(0, B.tope - b.usado))}` : '';
          picks.insertAdjacentHTML('beforebegin', `<div class="xb-ficha"><span class="xb-pill">${BOLT}CUOTA MEJORADA</span><p>Sube un ${b.pct} % ${esc(quePick(b))}</p><p class="xb-p2">Hasta ${N(B.tope)} por jugador${resta}</p></div>`);
          traduce(picks.previousElementSibling);
        }
        det.querySelectorAll('.pk[data-pick]').forEach((pk) => {
          const p = pk.dataset.pick.split('|')[1], bb = pk.querySelector('b');
          if (!bb || bb.querySelector('s') || !aplica(b, p)) return;
          const c = centimos(bb.textContent); if (c == null) return;
          const nuevo = fmtC(mejora(c, b.pct)); bb.classList.add('xb-b'); bb.dataset.n = nuevo; bb.innerHTML = `<s>${esc(bb.textContent.trim())}</s>${nuevo}`;
        });
        parcheaApuesta(det, b);
      }
    }
  }
  const PICKS = ['1', 'X', '2'];
  function tachaBoton(btn, b) {
    if (btn.querySelector('.xb-o')) return;
    const p = btn.dataset.pick.split('|')[1]; if (!aplica(b, p)) return;
    const nodo = [...btn.childNodes].find((n) => n.nodeType === 3 && /^\s*\d+,\d\d\s*$/.test(n.nodeValue)); if (!nodo) return;
    const c = centimos(nodo.nodeValue), nuevo = mejora(c, b.pct), sp = document.createElement('span');
    sp.className = 'xb-o'; sp.innerHTML = `<s>${esc(nodo.nodeValue.trim())}</s><b>${fmtC(nuevo)}</b>`;
    btn.replaceChild(sp, nodo);
    try { const sm = btn.querySelector('small'); if (sm && typeof S !== 'undefined' && S.calc) sm.textContent = N((S.calc * nuevo) / 100) } catch {}
  }
  // lo que cobras si aciertas, con la cuota mejorada, mientras eliges cuanto apostar
  function parcheaApuesta(det, b) {
    const on = det.querySelector('.pk.on[data-pick]'); if (!on) return;
    const p = on.dataset.pick.split('|')[1]; if (!aplica(b, p)) return;
    const bb = on.querySelector('b'), c = bb && centimos(bb.dataset.n); if (c == null) return;
    const o = c / 100, st = +(det.querySelector('#stake')?.value || 0);
    const em = det.querySelector('.ret em'); if (em) { const t = em.textContent.replace(/\d+,\d\d\s*$/, O(o)); if (em.textContent !== t) em.textContent = t }
    const ret = det.querySelector('[data-ret]'), nodo = ret && ret.firstChild;
    if (nodo && nodo.nodeType === 3 && nodo.nodeValue !== N(st * o)) nodo.nodeValue = N(st * o);
    const gain = det.querySelector('[data-gain]');
    if (gain) { const t = `${N(st * o - st)} limpias`; if (gain.textContent !== t && gain.textContent !== (window.GM_LANG && GM_LANG.get() === 'en' ? `${N(st * o - st)} profit` : t)) { gain.textContent = t; traduce(gain) } }
  }

  /* =====================================================================================================
     2) PREDICCION RAPIDA EN DIRECTO
     ===================================================================================================== */
  const P = { t: 0, d: null, vivo: false, off: 0 };                // ex_pred_estado
  const PX = { key: '', pick: null, stake: 10, msg: '', msgOk: false, busy: false };
  const Q = { names: '', html: '' };                                // la pregunta de ahora, ya pintada
  const ESP = new Map(), VLRC = { lista: { t: 0, d: [] }, det: new Map() };
  const VLR = 'https://vlr.orlandomm.net/api/v1';
  const base0 = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const norm = (s) => { const x = base0(s).replace(/\b(esports?|gaming|team|gc|club)\b/g, '').replace(/[^a-z0-9]/g, ''); return x.length >= 3 ? x : base0(s).replace(/[^a-z0-9]/g, '') };
  const parecido = (a, b) => { a = norm(a); b = norm(b); if (!a || !b) return false; if (a === b) return true; return Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a)) };
  async function jsonGet(url) { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error(r.status); return r.json() }

  async function cargaPred(forzar) {
    if (P.vivo || Date.now() < P.off || (!forzar && Date.now() - P.t < 15e3)) return;
    P.vivo = true;
    try {
      const antes = new Map(((P.d && P.d.mine) || []).map((x) => [x.id, x.status]));
      P.d = await rpc('ex_pred_estado'); P.t = Date.now();
      // si el sincronizador ha resuelto una prediccion mia, se recarga la app (saldo y monedero) sin esperar al pulso
      if ((P.d.mine || []).some((x) => x.status !== 'open' && antes.get(x.id) === 'open')) { recarga(); avisa('Predicción rápida resuelta') }
    }
    catch (e) { P.off = Date.now() + (noEsta(e) ? 30 : 2) * 60e3; P.d = null; P.t = Date.now() }
    P.vivo = false;
  }
  async function espn(ev) {
    const c = ESP.get(ev); if (c && Date.now() - c.t < 25e3) return c.d;
    const [, lg, id] = ev.split('|');
    try { const d = await jsonGet(`https://site.api.espn.com/apis/site/v2/sports/soccer/${lg}/summary?event=${id}`); ESP.set(ev, { t: Date.now(), d }); return d } catch { return c ? c.d : null }
  }
  async function vlr(a, b) {
    if (Date.now() - VLRC.lista.t > 20e3) { try { VLRC.lista = { t: Date.now(), d: (await jsonGet(`${VLR}/matches`)).data || [] } } catch { VLRC.lista.t = Date.now() } }
    const m = VLRC.lista.d.find((x) => (x.teams || []).length === 2 && ((parecido(x.teams[0].name, a) && parecido(x.teams[1].name, b)) || (parecido(x.teams[0].name, b) && parecido(x.teams[1].name, a))));
    if (!m) return null;
    const c = VLRC.det.get(m.id); if (c && Date.now() - c.t < 18e3) return c.d;
    try { const d = (await jsonGet(`${VLR}/matches/${m.id}`)).data; VLRC.det.set(m.id, { t: Date.now(), d }); return d } catch { return c ? c.d : null }
  }
  const infoEl = () => document.querySelector('.dv [data-dv-info]');
  const nombresDe = (info) => [...info.querySelectorAll('.dv-sc b')].map((e) => e.textContent.trim());

  // la pregunta que toca ahora: {names, kind, match, key, titulo, opts:[[pick,texto,cuota]], nota, sub, off} o {names, off:'por que no'}
  async function preguntaAhora() {
    const info = infoEl(); if (!info || !P.d) return null;
    const nombres = nombresDe(info), names = nombres.join('|'), sp = info.querySelector('.dv-sp')?.textContent || '', ek = info.dataset.espn || '';
    if (/^soccer\|/.test(ek)) {
      const [, lg, ev] = ek.split('|'), id = `espn:${lg}:${ev}`;
      const lm = P.d.live.find((m) => m.id === id);
      if (!lm) return { names, kind: 'gol', off: 'Las predicciones rápidas de este partido todavía no están disponibles.' };
      const d = await espn(ek), st = d?.header?.competitions?.[0]?.status || {}, t = st.type || {};
      const per = Number(st.period) || 0, c = lm.c || {};
      let off = '';
      if (!d) off = 'No consigo los datos del partido ahora mismo.';
      else if (t.state !== 'in') off = 'El partido no está en juego.';
      else if (/HALFTIME/i.test(t.name || '') || /^(ht|half ?time|descanso)$/i.test(String(t.shortDetail || t.description || '').trim())) off = 'Descanso: vuelve cuando ruede el balón.';
      else if (per > 2) off = 'Prórroga: sin predicciones.';
      else if (!c.ok) off = c.why || 'Sin datos frescos del directo';
      return { names, kind: 'gol', match: id, key: `gol|${id}`, titulo: '¿Habrá gol en los próximos 10 minutos?', minuto: st.displayClock || '',
        opts: [['si', 'Sí, habrá gol', c.si], ['no', 'No, sin goles', c.no]],
        nota: 'Cuenta desde 3 minutos después de apostar, durante 10 minutos, porque ESPN va con retraso respecto al directo. La cuota depende del minuto y del marcador y se queda fija al apostar.', off };
    }
    if (/valorant/i.test(sp) && nombres.length === 2) {
      const m = P.d.live.find((x) => x.sport === 'v' && x.home === nombres[0] && x.away === nombres[1]);
      if (!m) return { names, kind: 'ronda', off: 'Las predicciones rápidas de este partido todavía no están disponibles.' };
      const d = await vlr(nombres[0], nombres[1]);
      const maps = (d?.maps || []).filter((x) => x.name && !/all maps/i.test(x.name)), vivo = maps.find((x) => x.status === 'live');
      let off = '';
      if (!d) off = 'No consigo los datos de vlr.gg ahora mismo.';
      else if (String(d.status).toLowerCase() !== 'live') off = 'El partido no está en juego.';
      else if (!vivo) off = 'Entre mapas: vuelve cuando empiece el siguiente.';
      const rondas = vivo ? (vivo.rounds || []).filter((r) => r.score).length : 0, rev = d && !parecido(d.teams?.[0]?.name, nombres[0]);
      const mg = Number(P.d.margen) || 3, nr = rondas + 1 + mg, cc = m.c || {};
      if (!off && vivo) {
        if (rondas >= 8 && rondas <= 13) off = 'Estamos cerca del descanso entre mitades: sin predicciones hasta pasarlo.';
        else if (rondas >= 19) off = 'El mapa está acabando: sin predicciones hasta el siguiente.';
        else if (!cc.ok) off = cc.why || 'Sin datos frescos del directo';
      }
      const sc = vivo ? ((rev ? [vivo.teams?.[1], vivo.teams?.[0]] : vivo.teams) || []).map((t) => t?.score ?? 0) : [0, 0];
      return { names, kind: 'ronda', match: m.id, ref: vivo ? String(vivo.name).toLowerCase() : '', n: nr, key: `ronda|${m.id}|${vivo ? vivo.name : ''}|${nr}`,
        titulo: vivo ? `¿Quién gana la ronda ${nr} de ${vivo.name}?` : '¿Quién gana la ronda?', sub: vivo ? `${vivo.name} · ${sc[0]}:${sc[1]} · vlr.gg marca ${rondas} rondas` : '',
        opts: [['1', nombres[0], cc.c1], ['2', nombres[1], cc.c2]],
        nota: 'El stream va por delante de vlr.gg, por eso se apuesta a una ronda que todavía no ha empezado, 3 rondas más allá de lo que marca vlr.gg. La cuota depende de cómo va el mapa y se queda fija al apostar.', off };
    }
    return { names, off: '' };
  }
  const ESTADO = { open: 'esperando', won: 'ganada', lost: 'perdida', void: 'devuelta' };
  function etiqueta(p) { return p.kind === 'gol' ? `Gol en 10 min · ${p.pick === 'si' ? 'Sí' : 'No'}` : `Ronda ${p.n} de ${String(p.ref || '').replace(/^./, (c) => c.toUpperCase())} · ${p.pick === '1' ? 'local' : 'visitante'}` }
  function htmlPred(q) {
    if (Date.now() < (P.cerrado || 0)) q = { ...q, off: 'Predicciones cerradas un momento' };
    const max = P.d.max || 50, s = saldo(), tope = Math.max(1, Math.min(max, s == null ? max : Math.floor(s)));
    if (PX.key !== q.key) { PX.key = q.key || ''; PX.pick = null; PX.msg = '' }
    const chips = [...new Set([5, 10, 25, max, tope].filter((v) => v >= 1 && v <= tope))].sort((a, b) => a - b);
    if (!chips.includes(PX.stake)) PX.stake = chips[chips.length - 1] || 1;
    const mias = (P.d.mine || []).filter((p) => p.match === q.match).slice(0, 5);
    const lista = mias.length ? `<div class="xq-mias"><span class="lab">Tus predicciones aquí</span>${mias.map((p) => `<div class="xq-m ${p.status}"><b>${esc(etiqueta(p))}</b><span>${N(p.stake)} → ${N(Math.round(p.stake * p.odds))}</span><em>${ESTADO[p.status]}${p.status === 'won' ? ` +${N(p.payout)}` : ''}</em>${p.ev ? `<small data-notr>${esc(p.ev)}</small>` : ''}</div>`).join('')}</div>` : '';
    let cuerpo;
    if (q.off) cuerpo = `<p class="xq-off">${esc(q.off)}</p>`;
    else {
      const opcs = q.opts.map(([k, t, o]) => `<button class="xq-o ${PX.pick === k ? 'on' : ''}" data-xp="pick" data-v="${k}"><span>${esc(t)}</span><b>${O(o)}</b></button>`).join('');
      cuerpo = `<div class="xq-opts">${opcs}</div>
        <div class="xq-ap"><span class="xq-chips">${chips.map((v) => `<button class="${PX.stake === v ? 'on' : ''}" data-xp="stake" data-v="${v}">${v}</button>`).join('')}</span>
        <button class="go-s" data-xp="go" ${PX.pick && !PX.busy ? '' : 'disabled'}>Apostar ${PX.stake}</button></div>
        ${PX.msg ? `<p class="xq-msg ${PX.msgOk ? 'ok' : ''}">${PX.msg}</p>` : ''}<p class="xq-nota">${esc(q.nota)}</p>`;
    }
    const inner = `<div class="xq-h">${BOLT}<b>Predicción rápida</b><small>${q.minuto ? esc(q.minuto) + ' · ' : ''}cuota fija al apostar · máximo ${N(max)}</small></div>
      <p class="xq-q">${esc(q.titulo)}</p>${q.sub ? `<p class="xq-sub">${esc(q.sub)}</p>` : ''}${cuerpo}${lista}`;
    return `<section class="xq" data-xq-box data-sig="${hash(inner)}">${inner}</section>`;
  }
  function pintaPred() {
    const info = infoEl(); if (!info) return;
    const ya = info.querySelector('[data-xq-box]');
    const names = nombresDe(info).join('|');
    if (!Q.q || Q.names !== names || !P.d) { if (ya) ya.remove(); return }
    const h = htmlPred(Q.q), sig = /data-sig="([^"]+)"/.exec(h)[1];
    if (ya && ya.dataset.sig === sig) return;
    if (ya) ya.remove();
    const donde = info.querySelector('.dv-bets');
    if (donde) donde.insertAdjacentHTML('beforebegin', h); else info.insertAdjacentHTML('beforeend', h);
    traduce(info.querySelector('[data-xq-box]'));
  }
  let tPred = 0;
  async function bucle() {
    clearTimeout(tPred);
    const info = infoEl();
    if (info && !document.hidden) {
      try {
        await cargaPred();
        const q = await preguntaAhora();
        Q.q = q; Q.names = q ? q.names : '';
      } catch {}
      pintaPred();
    } else if (P.d && (P.d.mine || []).some((x) => x.status === 'open') && !document.hidden) cargaPred();   // aunque no estes en Directo, se mira si ya han resuelto la tuya
    tPred = setTimeout(bucle, document.querySelector('.dv') ? 20e3 : 4e3);
  }
  async function apostarPred() {
    const q = Q.q; if (!q || q.off || !PX.pick || PX.busy) return;
    PX.busy = true; PX.msg = ''; pintaPred();
    try {
      const visto = (q.opts.find((o) => o[0] === PX.pick) || [])[2];
      const r = q.kind === 'gol' ? await rpc('ex_pred_gol', { p_match: q.match, p_pick: PX.pick, p_stake: PX.stake, p_odds: visto })
        : await rpc('ex_pred_ronda', { p_match: q.match, p_ref: q.ref, p_round: q.n, p_pick: PX.pick, p_stake: PX.stake, p_odds: visto });
      PX.msg = q.kind === 'gol' ? `Has apostado ${PX.stake} a ${O(r.odds)} · cuenta de ${cuandoHM(r.desde)} a ${cuandoHM(r.hasta)}` : `Has apostado ${PX.stake} a ${O(r.odds)} a la ronda ${q.n}`; PX.msgOk = true; PX.pick = null;
      avisa(`Predicción rápida: apostado <b>${N(PX.stake)}</b>`);
      await cargaPred(true); recarga();
    } catch (e) { PX.msg = aviso(e); PX.msgOk = false; avisa(aviso(e)); cargaPred(true); if (e && (e.code === '42501' || /permission denied|insufficient/i.test(String(e.message || '')))) { P.cerrado = Date.now() + 120e3; PX.msg = 'Predicciones cerradas un momento'; PX.msgOk = false } }
    PX.busy = false; pintaPred();
  }
  const cuandoHM = (t) => { try { return new Intl.DateTimeFormat(lang(), { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t)) } catch { return '' } };

  /* =====================================================================================================
     3) VITRINA Y SALA DE TROFEOS (perfil)
     ===================================================================================================== */
  const V = { t: 0, d: null, vivo: false, off: 0 };
  const XV = { pick: false, sel: [], inv: null, cargandoInv: false, msg: '', guardando: false, mas: { mes: false, sem: false } };
  const CDN = 'https://community.akamai.steamstatic.com/economy/image/';
  const RAR = { esp: ['Especial', '#e4ae39'], cov: ['Encubierto', '#eb4b4b'], cla: ['Clasificado', '#d32ce6'], res: ['Restringido', '#8847ff'], mil: ['Grado militar', '#4b69ff'] };
  const WEAR = ['Recién fabricado', 'Casi nuevo', 'Algo desgastado', 'Bastante desgastado', 'Deplorable'];
  const img = (p, s) => (!p ? '' : /^https?:/.test(p) ? p : `${CDN}${p}/${s}fx${s}f`);
  const partes = (name) => { const s = String(name || '·'), [w, k] = s.split(' | '); return k == null && !/^★/.test(s) ? ['', s] : [w.replace(/^★ /, ''), k || 'Original'] };
  async function cargaVit(forzar) {
    if (V.vivo || Date.now() < V.off || (!forzar && Date.now() - V.t < 60e3)) return;
    V.vivo = true;
    try { V.d = await rpc('ex_vitrinas'); V.t = Date.now() }
    catch (e) { V.off = Date.now() + (noEsta(e) ? 30 : 2) * 60e3; V.t = Date.now() }
    V.vivo = false; rev();
  }
  const jugador = (id) => (V.d.jug || []).find((j) => j.id === id) || { id, n: '·', color: 'pm', ini: '·' };
  const avatar = (j, cls = '') => (typeof av === 'function' ? av(j.color, cls) : `<span class="av ${esc(j.color)} ${cls}">${esc(j.ini)}</span>`);
  const mesLabel = (p) => { try { return new Intl.DateTimeFormat(lang(), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(p + 'T12:00:00Z')) } catch { return p } };
  const semLabel = (p) => { try { return new Intl.DateTimeFormat(lang(), { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(p + 'T12:00:00Z')).replace('.', '') } catch { return p } };
  const fechaCorta = (t) => { try { return new Intl.DateTimeFormat(lang(), { day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' }).format(new Date(t)).replace('.', '') } catch { return '' } };

  function skinHtml(s, mini) {
    const [top, main] = partes(s.name), r = RAR[s.rarity] || RAR.mil;
    const desg = s.wear == null ? '' : WEAR[s.wear], fl = s.float == null ? '' : Number(s.float).toFixed(4).replace('.', ',');
    return `<div class="xv-s ${mini ? 'mini' : ''}" style="--rc:${r[1]}"><span class="xv-img"><img src="${esc(img(s.image, mini ? 128 : 360))}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"></span>
      <span class="xv-n">${top ? `<small>${esc(top)}${s.st ? ' · StatTrak' : ''}</small>` : s.st ? '<small>StatTrak</small>' : ''}<b>${esc(main)}${s.phase ? ' · ' + esc(s.phase) : ''}</b></span>
      ${mini ? '' : `<span class="xv-m">${esc([desg, fl].filter(Boolean).join(' · '))}</span>`}<span class="xv-v">${N(s.value)}${coin()}</span></div>`;
  }
  function htmlVitrina(j, mia) {
    const slots = [0, 1, 2].map((i) => (j.vit[i] ? skinHtml(j.vit[i]) : `<div class="xv-s vacio"><span class="xv-img"></span><span class="xv-n"><b>Vacío</b></span></div>`)).join('');
    let picker = '';
    if (mia && XV.pick) {
      if (!XV.inv) picker = `<p class="hint">Cargando tu inventario…</p>`;
      else if (!XV.inv.length) picker = `<p class="hint">No tienes skins todavía. Abre cajas en Cajas.</p>`;
      else picker = `<div class="xv-pick"><span class="lab">Elige hasta 3 · el orden es el de los números · ${XV.sel.length} de 3</span>
        <div class="xv-grid">${XV.inv.map((s) => { const k = XV.sel.indexOf(s.id); return `<button class="xv-p ${k >= 0 ? 'on' : ''}" data-xv="sel" data-id="${s.id}">${k >= 0 ? `<i>${k + 1}</i>` : ''}${skinHtml(s, true)}</button>` }).join('')}</div>
        <div class="xv-acc"><button class="go-s" data-xv="guardar" ${XV.guardando ? 'disabled' : ''}>Guardar vitrina</button><button class="xv-link" data-xv="cancelar">Cancelar</button>${XV.msg ? `<span class="xv-msg">${esc(XV.msg)}</span>` : ''}</div></div>`;
    }
    const inner = `<div class="cs-h"><div><h3>Vitrina</h3><p>${mia ? 'Las 3 skins de tu inventario que enseñas a los demás.' : `Las 3 skins que ${esc(j.n)} enseña a los demás.`}</p></div>
      ${mia && !XV.pick ? '<button class="xv-link" data-xv="abrir">Elegir skins</button>' : ''}</div>
      <div class="xv-slots">${slots}</div>${picker}`;
    return `<section class="cs xv" data-xv-vit data-sig="${hash(inner)}">${inner}</section>`;
  }
  function trofeosDe(j) { return (V.d.trofeos || []).filter((t) => t.pl === j.id) }
  function htmlSala(j) {
    const T = V.d.trofeos || [], jug = V.d.jug || [];
    const cuenta = (id, tipo) => T.filter((t) => t.pl === id && t.t === tipo).length;
    const medallero = jug.map((p) => { const m = cuenta(p.id, 'mes'), b = cuenta(p.id, 'bote'), pr = cuenta(p.id, 'premio'), tot = m + b + pr;
      return `<div class="xv-md ${p.id === j.id ? 'yo' : ''}">${avatar(p, 'xl')}<span><b>${esc(p.n)}</b><small><span>${m} ${m === 1 ? 'mes' : 'meses'}</span><span>${b} ${b === 1 ? 'bote' : 'botes'}</span><span>${pr} ${pr === 1 ? 'premio' : 'premios'}</span></small></span><strong>${CUP}${tot}</strong></div>` }).join('');
    const rec = V.d.records || {};
    const reco = (lab, r, val) => `<div class="xv-rc"><span class="lab">${lab}</span>${r ? `<b>${val}</b><span class="xv-rw">${avatar(jugador(r.pl), 'sm')}${esc(jugador(r.pl).n)}</span><small>${esc(r.match)} · ${esc(r.pick)}${r.at ? ' · ' + esc(fechaCorta(r.at)) : ''}</small>` : '<small>Todavía nadie</small>'}</div>`;
    const records = `<div class="xv-recs">${reco('Mayor premio', rec.premio, rec.premio ? N(rec.premio.v) + coin() : '')}${reco('Cuota más alta acertada', rec.cuota, rec.cuota ? O(rec.cuota.v) : '')}</div>`;
    const meses = T.filter((t) => t.t === 'mes'), sem = T.filter((t) => t.t !== 'mes');
    const fila = (cab, t, extra) => { const p = jugador(t.pl); return `<div class="xv-f ${t.pl === j.id ? 'yo' : ''}"><span class="xv-fc">${cab}</span>${extra ? `<span class="xv-fx">${extra}</span>` : ''}<span class="xv-fj">${avatar(p, 'sm')}${esc(p.n)}</span><em>+${N(t.v)}${coin()}</em></div>` };
    const lim = 5, mesesV = XV.mas.mes ? meses : meses.slice(0, lim), semV = XV.mas.sem ? sem : sem.slice(0, lim);
    const lider = (V.d.mes && V.d.mes.lider) || [];
    const marcha = lider.length ? `<p class="xv-marcha">${esc(mesLabel(V.d.mes.p))}, de momento: ${lider.map((l) => `<b>${esc(jugador(l.pl).n)}</b> +${N(l.v)}`).join(' y ')}</p>` : '';
    const inner = `<div class="cs-h"><div><h3>Sala de trofeos</h3><p>Permanente: lo que se gana aquí no se borra.</p></div></div>
      <div class="xv-meda">${medallero}</div>${records}
      <div class="xv-lista"><span class="lab">Campeón de cada mes</span>${marcha}${mesesV.map((t) => fila(esc(mesLabel(t.p).replace(/^./, (c) => c.toUpperCase())), t, '')).join('') || '<p class="hint">Aún no ha acabado ningún mes con ganador.</p>'}
        ${meses.length > lim ? `<button class="xv-link" data-xv="mas" data-k="mes">${XV.mas.mes ? 'Ver menos' : `Ver los ${meses.length}`}</button>` : ''}</div>
      <div class="xv-lista"><span class="lab">Bote y premios de la semana</span>${semV.map((t) => fila(`Semana del ${esc(semLabel(t.p))}`, t, esc(t.n))).join('') || '<p class="hint">Aún no se ha repartido ninguno.</p>'}
        ${sem.length > lim ? `<button class="xv-link" data-xv="mas" data-k="sem">${XV.mas.sem ? 'Ver menos' : `Ver los ${sem.length}`}</button>` : ''}</div>`;
    return `<section class="cs xv" data-xv-sala data-sig="${hash(inner)}">${inner}</section>`;
  }
  function pintaPerfil() {
    const pf = document.querySelector('.pf'); if (!pf) return;
    if (!V.d) { cargaVit(); return }
    if (Date.now() - V.t > 60e3) cargaVit();
    const color = (/--f-([a-z0-9]+)/.exec(pf.getAttribute('style') || '') || [])[1];
    const j = (V.d.jug || []).find((x) => x.color === color); if (!j) return;
    // PM 31-10: "tu saldo arriba de la sala de trofeos": la vitrina y la sala van despues del grafico del saldo (.pf-2)
    const mia = j.id === V.d.me, donde = pf.querySelector('.pf-2') || pf.querySelector('.kpis') || pf.querySelector('.pf-hero');
    if (!donde) return;
    // si nada ha cambiado desde la ultima vez no se vuelve a construir nada (la app toca el DOM cada segundo)
    const kk = [V.t, color, XV.pick, XV.sel.join(), XV.inv && XV.inv.length, XV.msg, XV.guardando, XV.mas.mes, XV.mas.sem].join('|');
    const a0 = pf.querySelector('[data-xv-vit]'), b0 = pf.querySelector('[data-xv-sala]');
    if (a0 && b0 && a0.dataset.k === kk && b0.dataset.k === kk && a0.previousElementSibling === donde && b0.previousElementSibling === a0) return;
    const poner = (sel, html, ref) => {
      const ya = pf.querySelector(sel), sig = /data-sig="([^"]+)"/.exec(html)[1];
      if (ya && ya.dataset.sig === sig && ya.previousElementSibling === ref) return ref = ya;
      if (ya) ya.remove();
      ref.insertAdjacentHTML('afterend', html); const nuevo = ref.nextElementSibling; traduce(nuevo); return nuevo;
    };
    const a = poner('[data-xv-vit]', htmlVitrina(j, mia), donde);
    const b = poner('[data-xv-sala]', htmlSala(j), a);
    a.dataset.k = kk; b.dataset.k = kk;
  }
  async function abrirPicker() {
    XV.pick = true; XV.msg = '';
    const j = (V.d.jug || []).find((x) => x.id === V.d.me); XV.sel = j ? j.vit.map((s) => s.id) : [];
    rev();
    if (!XV.inv && !XV.cargandoInv) {
      XV.cargandoInv = true;
      try { XV.inv = await rpc('ex_mis_skins') } catch (e) { XV.msg = aviso(e); XV.inv = [] }
      XV.cargandoInv = false; rev();
    }
  }
  async function guardarVitrina() {
    if (XV.guardando) return;
    XV.guardando = true; XV.msg = ''; rev();
    try { await rpc('ex_set_vitrina', { p_ids: XV.sel }); XV.pick = false; XV.inv = null; await cargaVit(true); avisa('Vitrina guardada') }
    catch (e) { XV.msg = aviso(e) }
    XV.guardando = false; rev();
  }

  /* =====================================================================================================
     CANCELAR DURANTE EL PARTIDO = cash out (db/024_cashout.sql). PM, 30-10 noche: "que pueda cancelar apuestas antes de su
     partido y tambien durante, pero si lo hago durante tal vez pierdo X dinero, como en las casas de apuestas reales".
     Antes de empezar manda el boton de app.js (cancel_bet, devuelve todo). Ya empezado, este: cobras lo que vale tu apuesta
     ahora mismo (lo calcula el servidor con el marcador, menos el margen de la casa; nunca mas de lo que pagaria si gana).
     Aqui solo se pregunta el valor (cada 20 s) y se pide, con confirmacion de dos toques.
     ===================================================================================================== */
  const CO = { t: 0, q: new Map(), vivo: false, off: 0, sure: null, busy: false };
  async function cargaCO(forzar) {
    if (CO.vivo || Date.now() < CO.off || (!forzar && Date.now() - CO.t < 20e3)) return;
    CO.vivo = true;
    try { const l = await rpc('cash_out_quotes'); CO.q = new Map((l || []).map((x) => [x.bet, x])); CO.t = Date.now() }
    catch (e) { CO.off = Date.now() + (noEsta(e) ? 30 : 2) * 60e3; CO.t = Date.now() }
    CO.vivo = false; rev();
  }
  function botonCO(id, qt) {
    if (!qt.ok) return { sig: `${id}|no|${qt.why || ''}`, html: `<button class="xc-btn off" disabled data-bet="${id}" data-sig="${esc(`${id}|no|${qt.why || ''}`)}" title="${esc(qt.why || '')}">Cancelar no disponible</button>` };
    const sure = CO.sure && CO.sure.bet === id, v = qt.value, dif = v - qt.stake, sig = `${id}|${v}|${sure ? 1 : 0}`;
    const txt = sure ? `¿Seguro? Cobras <b>${N(v)}</b>${coin()}<span>, ${dif < 0 ? 'pierdes' : 'ganas'} ${N(Math.abs(dif))}</span>`
      : `Cancelar · cobras <b>${N(v)}</b>${coin()}`;
    return { sig, html: `<button class="xc-btn ${sure ? 'sure' : ''} ${dif < 0 ? 'neg' : 'pos'}" data-xc="ask" data-bet="${id}" data-sig="${sig}" title="${dif >= 0 ? 'Ganas' : 'Pierdes'} ${N(Math.abs(dif))} frente a lo apostado">${txt}</button>` };
  }
  // solo con el partido ya empezado: antes, el boton de cancelar de app.js lo devuelve todo
  const enJuego = (qt) => qt && qt.mode !== 'pre';
  function pon(fila, id, ya, despues) {
    const qt = CO.q.get(id);
    if (!enJuego(qt)) { if (ya) ya.remove(); return }
    const b = botonCO(id, qt);
    if (ya && ya.dataset.sig === b.sig) return;
    if (ya) ya.remove();
    if (despues) { fila.insertAdjacentHTML('afterend', `<div class="xc-vy">${b.html}</div>`); traduce(fila.nextElementSibling) }
    else { fila.insertAdjacentHTML('beforeend', b.html); traduce(fila.lastElementChild) }
  }
  function parcheaCash() {
    if (CO.sure && Date.now() - CO.sure.t > 6000) CO.sure = null;
    // boletos de Mis apuestas: el numero de la apuesta esta en el propio boleto ("Nº 000123")
    document.querySelectorAll('.bol[data-goto]').forEach((art) => {
      const id = +((/(\d+)/.exec(art.querySelector('.bol-no')?.textContent || '') || [])[1] || 0), fila = art.querySelector('.bol-n');
      if (fila && id) pon(fila, id, art.querySelector('.xc-btn'));
    });
    // "Tus apuestas aqui" en la ficha del partido
    document.querySelectorAll('.dm[data-bet]').forEach((dm) => pon(dm, +dm.dataset.bet, dm.querySelector('.xc-btn')));
    // la tarjeta de tus apuestas en directo, encima del perfil: una por apuesta, en el mismo orden que las del servidor
    const porPartido = new Map();
    for (const qt of CO.q.values()) { const l = porPartido.get(qt.match) || []; l.push(qt); porPartido.set(qt.match, l) }
    const vistos = new Map();
    document.querySelectorAll('#vivoyo .vy[data-vivo]').forEach((vy) => {
      const m = vy.dataset.vivo, k = vistos.get(m) || 0; vistos.set(m, k + 1);
      const qt = (porPartido.get(m) || [])[k], ya = vy.nextElementSibling && vy.nextElementSibling.classList.contains('xc-vy') ? vy.nextElementSibling : null;
      if (!qt) { if (ya) ya.remove(); return }
      pon(vy, qt.bet, ya && ya.firstElementChild, true);
      if (ya && !ya.firstElementChild) ya.remove();
    });
  }
  async function pideCO(id) {
    if (CO.busy) return;
    if (!(CO.sure && CO.sure.bet === id)) {
      // primer toque: se pide el valor de ahora mismo y se enseña para confirmar
      CO.sure = { bet: id, t: Date.now() }; rev();
      try { const q = await rpc('cash_out_quote', { p_bet: id }); if (q && q.ok) CO.q.set(id, { ...CO.q.get(id), ...q, match: q.match || (CO.q.get(id) || {}).match }); else { CO.sure = null; avisa(esc((q && q.why) || 'Ahora no se puede cancelar')); cargaCO(true) } }
      catch (e) { CO.sure = null; avisa(aviso(e)) }
      rev(); setTimeout(rev, 6200); return;
    }
    const qt = CO.q.get(id); CO.busy = true;
    try {
      const r = await rpc('cash_out', { p_bet: id, p_min: qt ? qt.value : null });
      avisa(`Cancelada: cobras <b>${N(r.value)}</b> · ${r.beneficio >= 0 ? 'ganas' : 'pierdes'} ${N(Math.abs(r.beneficio))}`);
      CO.q.delete(id); recarga();
    } catch (e) { avisa(aviso(e)) }
    CO.sure = null; CO.busy = false; await cargaCO(true); rev();
  }
  // en fase de captura, para que el boleto (que lleva al partido) no navegue al tocar el boton
  document.addEventListener('click', (e) => { const c = e.target.closest('[data-xc]'); if (c) { e.stopPropagation(); e.preventDefault(); pideCO(+c.dataset.bet) } }, true);

  /* ---------- clics ---------- */
  document.addEventListener('click', (e) => {
    const p = e.target.closest('[data-xp]');
    if (p) {
      const k = p.dataset.xp;
      if (k === 'pick') { PX.pick = p.dataset.v; PX.msg = ''; pintaPred() }
      else if (k === 'stake') { PX.stake = +p.dataset.v; pintaPred() }
      else if (k === 'go') apostarPred();
      return;
    }
    const v = e.target.closest('[data-xv]');
    if (v) {
      const k = v.dataset.xv;
      if (k === 'abrir') abrirPicker();
      else if (k === 'cancelar') { XV.pick = false; XV.msg = ''; rev() }
      else if (k === 'guardar') guardarVitrina();
      else if (k === 'mas') { XV.mas[v.dataset.k] = !XV.mas[v.dataset.k]; rev() }
      else if (k === 'sel') { const id = +v.dataset.id, i = XV.sel.indexOf(id); if (i >= 0) XV.sel.splice(i, 1); else if (XV.sel.length < 3) XV.sel.push(id); else XV.msg = 'La vitrina tiene sitio para 3 skins'; rev() }
    }
    if (e.target.closest('[data-dv], .dv-btn')) setTimeout(bucle, 300);
  });
  // al mover el deslizador de la apuesta la app reescribe lo que cobras: se vuelve a poner con la cuota mejorada
  document.addEventListener('input', (e) => { if (e.target && e.target.id === 'stake') rev() });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { bucle(); cargaBoost() } });

  /* ---------- montaje ---------- */
  function rev() {
    if (document.querySelector('.p-board, .det')) { if (Date.now() - B.t > 90e3) cargaBoost(); parcheaBoost() }
    if (document.querySelector('.dv [data-dv-info]')) pintaPred();
    if (document.querySelector('.pf')) pintaPerfil();
    if (document.querySelector('.bol, .dm[data-bet], #vivoyo .vy')) { cargaCO(); parcheaCash() }
  }
  let pendiente = false;
  new MutationObserver(() => { if (pendiente) return; pendiente = true; queueMicrotask(() => { pendiente = false; try { rev() } catch (e) { if (!rev.avisado) { rev.avisado = 1; console.warn('extras.js', e) } } }) }).observe(document.documentElement, { childList: true, subtree: true });
  rev(); bucle();

  const css = document.createElement('style');
  css.textContent = `
.xb-bolt{width:1.05em;height:1.05em;flex:none;fill:currentColor}
.xb-pill{display:inline-flex;align-items:center;gap:6px;padding:5px 12px 5px 9px;border-radius:999px;background:linear-gradient(180deg,var(--acc2),var(--acc));color:#141008;font:800 11px var(--disp);letter-spacing:.14em;text-transform:uppercase;white-space:nowrap;animation:xbPulso 2.6s ease-out infinite}
@keyframes xbPulso{0%{box-shadow:0 0 0 0 rgba(242,193,78,.55)}70%,100%{box-shadow:0 0 0 12px rgba(242,193,78,0)}}
.xb-aviso{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:6px 22px;width:100%;margin-bottom:24px;padding:14px 18px 14px 18px;border-left:3px solid var(--acc);background:linear-gradient(90deg,rgba(242,193,78,.16),transparent 75%);text-align:left;transition:background .2s}
.xb-aviso:hover{background:linear-gradient(90deg,rgba(242,193,78,.24),transparent 80%)}
.xb-tx{display:grid;gap:3px;min-width:0}
.xb-tx b{font:800 18px/1.15 var(--disp);letter-spacing:-.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.xb-tx em{font:11px var(--mono);font-style:normal;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.xb-tx>span{font:600 13px var(--sans);color:var(--acc2)}
.xb-lim{font:11px var(--mono);color:var(--mute);text-align:right;white-space:nowrap}
.xb-lim small{display:block;margin-top:3px;color:var(--dim)}
.xb-row{background:linear-gradient(90deg,rgba(242,193,78,.1),transparent 55%)}
.xb-tag{position:absolute;top:4px;right:8px;z-index:1;display:inline-flex;align-items:center;gap:4px;pointer-events:none;font:800 8px var(--disp);font-style:normal;letter-spacing:.14em;text-transform:uppercase;color:var(--acc)}
.xb-tag .xb-bolt{width:9px;height:9px}
.row .o .xb-o{display:grid;justify-items:center;gap:2px;line-height:1}
.xb-o s{font:500 10px var(--mono);color:var(--dim);text-decoration:line-through}
.xb-o b{font:700 1em var(--mono);color:var(--acc)}
.xb-g{color:var(--acc)!important}
.xb-ficha{display:grid;justify-items:center;gap:7px;margin-top:18px;text-align:center}
.xb-ficha p{font:600 13px var(--sans);color:var(--acc2)}
.xb-ficha .xb-p2{font:11px var(--mono);font-weight:400;color:var(--dim)}
.pk b.xb-b{color:var(--acc)}
.pk b.xb-b s{position:absolute;top:17px;right:12px;font:500 12px var(--mono);letter-spacing:0;color:var(--dim);text-decoration:line-through}
@media (max-width:860px){
  .xb-aviso{grid-template-columns:1fr;padding:12px 14px}
  .xb-aviso .xb-pill{justify-self:start}
  .xb-lim{text-align:left}
  .xb-tag{font-size:7px;letter-spacing:.1em}
}

.xq{display:grid;gap:12px;padding:16px 0 4px;border-top:1px solid var(--hair);border-bottom:1px solid var(--hair)}
.xq-h{display:flex;align-items:center;gap:8px;font:600 12px var(--sans);color:var(--acc)}
.xq-h b{font-weight:800;letter-spacing:.12em;text-transform:uppercase;font-family:var(--disp);font-size:12px}
.xq-h small{margin-left:auto;font:10px var(--mono);color:var(--dim)}
.xq-q{font:800 22px/1.15 var(--disp);letter-spacing:-.025em}
.xq-sub{margin-top:-6px;font:12px var(--mono);color:var(--mute)}
.xq-opts{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid var(--hair)}
.xq-o{position:relative;display:grid;gap:6px;padding:14px 12px 14px 0;text-align:left;color:var(--mute);transition:color .15s}
.xq-o+.xq-o{padding-left:16px;border-left:1px solid var(--hair)}
.xq-o span{font:600 14px var(--sans);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.xq-o b{font:500 30px/1 var(--mono);letter-spacing:-.04em;color:var(--ink)}
.xq-o:hover,.xq-o.on{color:var(--ink)}
.xq-o:hover b,.xq-o.on b{color:var(--acc)}
.xq-o.on::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;background:var(--acc)}
.xq-ap{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px}
.xq-chips{display:flex;gap:18px}
.xq-chips button{position:relative;padding:6px 0;font:500 13px var(--mono);color:var(--mute)}
.xq-chips button:hover,.xq-chips button.on{color:var(--ink)}
.xq-chips button.on::after{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;background:var(--acc)}
.xq .go-s:disabled{opacity:.4;cursor:default}
.xq-msg{font:600 13px var(--sans);color:#ff8a8a}
.xq-msg.ok{color:var(--win)}
.xq-nota{font:11px/1.5 var(--mono);color:var(--dim)}
.xq-off{font:13px/1.5 var(--mono);color:var(--mute)}
.xq-mias{display:grid;margin-top:4px}
.xq-mias .lab{margin-bottom:4px}
.xq-m{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:baseline;gap:2px 14px;padding:9px 0;border-top:1px solid var(--hair);font:13px var(--mono);color:var(--soft)}
.xq-m b{font:600 13px var(--sans);color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.xq-m em{font-style:normal;color:var(--mute)}
.xq-m.won em{color:var(--win)}
.xq-m.lost em{color:#ff8a8a}
.xq-m small{grid-column:1/-1;font:11px var(--mono);color:var(--dim)}

.xv-link{font:600 13px var(--sans);color:var(--acc);padding:4px 0}
.xv-link:hover{color:var(--acc2)}
.xv-slots{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:36px}
.xv-s{position:relative;display:grid;gap:6px;justify-items:center;justify-self:center;width:100%;max-width:340px;text-align:center;padding-bottom:12px}
.xv-img{position:relative;display:grid;place-items:center;width:100%;aspect-ratio:4/3;background:radial-gradient(closest-side,color-mix(in srgb,var(--rc,#fff) 26%,transparent),transparent 72%)}
.xv-img::after{content:"";position:absolute;left:20%;right:20%;bottom:0;height:2px;border-radius:2px;background:var(--rc,var(--hair));opacity:.85}
.xv-img img{width:86%;height:86%;object-fit:contain;filter:drop-shadow(0 8px 14px rgba(0,0,0,.55))}
.xv-n{display:grid;gap:2px;min-width:0;max-width:100%}
.xv-n small{font:10px var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.xv-n b{font:800 17px/1.15 var(--disp);letter-spacing:-.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.xv-m{font:11px var(--mono);color:var(--dim)}
.xv-v{display:flex;align-items:center;font:500 15px var(--mono);color:var(--acc)}
.xv-s.vacio .xv-img{aspect-ratio:auto;height:72px;background:none}
.xv-s.vacio .xv-img::after{display:none}
.xv-s.vacio .xv-n b{font:500 13px var(--mono);color:var(--dim)}
.xv-pick{display:grid;gap:12px;margin-top:30px}
.xv-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:14px 18px;max-height:440px;overflow:auto;padding:4px 2px 8px}
.xv-p{position:relative;text-align:center;padding:4px 4px 0;border-radius:10px;transition:background .15s}
.xv-p:hover{background:rgba(255,255,255,.04)}
.xv-p.on{background:rgba(242,193,78,.1)}
.xv-p i{position:absolute;top:6px;left:8px;z-index:1;display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:var(--acc);color:#141008;font:700 11px var(--mono);font-style:normal}
.xv-s.mini{padding-bottom:8px;gap:3px}
.xv-s.mini .xv-img{aspect-ratio:4/3}
.xv-s.mini .xv-n b{font-size:12px}
.xv-s.mini .xv-v{font-size:12px}
.xv-acc{display:flex;flex-wrap:wrap;align-items:center;gap:20px}
.xv-msg{font:600 13px var(--sans);color:#ff8a8a}
.xv-cup{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;margin-right:6px;color:var(--acc)}
.xv-meda{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:22px 40px}
.xv-md{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:0 14px;padding:6px 0;color:var(--soft)}
.xv-md b{display:block;font:600 15px var(--sans);color:var(--ink)}
.xv-md small{display:flex;flex-wrap:wrap;gap:0 10px;margin-top:3px;font:11px var(--mono);color:var(--dim)}
.xv-md small span{white-space:nowrap}
.xv-md strong{display:flex;align-items:center;font:500 28px/1 var(--mono);letter-spacing:-.05em;color:var(--ink)}
.xv-md.yo b,.xv-md.yo strong{color:var(--acc)}
.xv-recs{display:flex;flex-wrap:wrap;gap:22px 70px;margin-top:34px}
.xv-rc{display:grid;gap:6px;min-width:200px}
.xv-rc>b{display:flex;align-items:center;font:500 40px/1 var(--mono);letter-spacing:-.05em}
.xv-rc>b .cn{--s:28px;margin-left:8px}
.xv-rw{display:flex;align-items:center;gap:8px;font:600 14px var(--sans)}
.xv-rc small{font:11px var(--mono);color:var(--dim)}
.xv-lista{display:grid;margin-top:34px}
.xv-lista .lab{margin-bottom:6px}
.xv-marcha{margin-bottom:6px;font:12px var(--mono);color:var(--mute)}
.xv-marcha b{color:var(--acc);font-weight:500}
.xv-f{display:grid;grid-template-columns:150px minmax(0,1fr) minmax(0,1fr) auto;align-items:center;gap:0 16px;min-height:44px;border-top:1px solid var(--hair);font:13px var(--mono);color:var(--mute)}
.xv-f .xv-fx{grid-column:2;color:var(--dim)}
.xv-f .xv-fj{grid-column:3;display:flex;align-items:center;gap:8px;font:600 14px var(--sans);color:var(--ink)}
.xv-f:not(:has(.xv-fx)) .xv-fj{grid-column:2 / span 2}
.xv-f em{grid-column:4;display:flex;align-items:center;font-style:normal;font-size:15px;color:var(--win)}
.xv-f.yo{background:linear-gradient(90deg,rgba(242,193,78,.1),transparent 70%)}
.xv-f.yo .xv-fj{color:var(--acc)}
.xv-lista .xv-link{justify-self:start;margin-top:8px}
@media (max-width:860px){
  .xv-slots{gap:10px}
  .xv-n b{font-size:13px}.xv-v{font-size:12px}.xv-m{display:none}
  .xv-f{grid-template-columns:minmax(0,1fr) auto;row-gap:2px;padding:8px 0}
  .xv-f .xv-fc{grid-column:1}.xv-f .xv-fx{grid-column:1;grid-row:2}.xv-f .xv-fj,.xv-f:not(:has(.xv-fx)) .xv-fj{grid-column:1;grid-row:3}.xv-f em{grid-column:2;grid-row:1 / span 3}
  .xv-rc>b{font-size:32px}
}
html.sin-anim .xb-pill{animation:none}`;
  document.head.appendChild(css);
})();
