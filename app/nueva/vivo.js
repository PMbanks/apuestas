// Marcador en directo dentro de la pantalla Directo (PM, 30-10: "el score real del game in real time", "en el futbol
// asistencias, goles, faltas y todo eso", "en Valorant mucho mas currado", "ver los mapas que han jugado y el que
// estan jugando ahora mismo con el score").
// Valorant: API abierta y gratis de vlr.gg (vlr.orlandomm.net, CORS abierto), cada 20 s: mapas con rondas en CT y T,
// el mapa en juego ronda a ronda con como se gano cada una, jugadores con su agente y sus numeros, picks y bans.
// Futbol: ESPN (la misma que ya usa la app), cada 30 s: minuto, goles con asistencia, tarjetas, cambios y estadisticas.
// Va aparte de app.js: se cuelga del bloque [data-dv-info] y se vuelve a poner solo cuando la app repinta.
'use strict';
(function () {
  const API = 'https://vlr.orlandomm.net/api/v1';
  const CADA = 20000;
  let lista = { t: 0, d: [] }, timer = 0;
  const det = new Map(), html = new Map(), espn = new Map();
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const base = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  // "A Team" no puede quedarse en "a": si al quitar palabras comunes queda casi nada, se compara entero
  const norm = (s) => { const x = base(s).replace(/\b(esports?|gaming|team|gc|club)\b/g, '').replace(/[^a-z0-9]/g, ''); return x.length >= 3 ? x : base(s).replace(/[^a-z0-9]/g, '') };
  const parecido = (a, b) => { a = norm(a); b = norm(b); if (!a || !b) return false; if (a === b) return true; return Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a)) };
  async function json(url) { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error(r.status); return r.json() }

  /* ---------- Valorant ---------- */
  async function valorant(a, b) {
    if (Date.now() - lista.t > CADA) { try { lista = { t: Date.now(), d: (await json(`${API}/matches`)).data || [] } } catch { lista.t = Date.now() } }
    const m = lista.d.find((x) => (x.teams || []).length === 2 && ((parecido(x.teams[0].name, a) && parecido(x.teams[1].name, b)) || (parecido(x.teams[0].name, b) && parecido(x.teams[1].name, a))));
    if (!m) return null;
    const c = det.get(m.id);
    if (c && Date.now() - c.t < CADA) return c.d;
    try { const d = (await json(`${API}/matches/${m.id}`)).data; det.set(m.id, { t: Date.now(), d }); return d } catch { return c?.d || null }
  }
  const METODO = { defuse: 'desactivada', detonate: 'explotó', elimination: 'eliminación', time: 'tiempo' };
  function pintaValorant(d, a, b) {
    const rev = !parecido(d.teams?.[0]?.name, a), par = (x) => (rev ? [x[1], x[0]] : x);
    const [ta, tb] = par(d.teams || [{}, {}]);
    const maps = (d.maps || []).filter((m) => m.name && !/all maps/i.test(m.name));
    const vivo = maps.find((m) => m.status === 'live') || [...maps].reverse().find((m) => (m.rounds || []).length);
    const cab = `<div class="vv-cab"><span>${ta.img ? `<img src="${esc(ta.img)}" alt="">` : ''}<b>${esc(a)}</b></span><strong>${ta.score ?? 0}<i>:</i>${tb.score ?? 0}<small>mapas</small></strong><span class="d"><b>${esc(b)}</b>${tb.img ? `<img src="${esc(tb.img)}" alt="">` : ''}</span></div>`;
    const tarjeta = (m, i) => {
      const [x, y] = par(m.teams || [{}, {}]), live = m.status === 'live', jugado = (x.score ?? 0) + (y.score ?? 0) > 0;
      const lado = (t) => (t.roundsCt != null ? `<small>CT ${t.roundsCt} · T ${t.roundsT}</small>` : '');
      return `<div class="vv-map ${live ? 'live' : jugado ? 'fin' : ''}"><div class="vv-mn"><b>Mapa ${i + 1} · ${esc(m.name)}</b><small>${live ? 'EN JUEGO' : jugado ? 'acabado' : 'pendiente'}${m.pickedBy ? ' · pick de ' + esc(m.pickedBy) : ''}</small></div>
        <div class="vv-ms"><span class="${(x.score ?? 0) > (y.score ?? 0) ? 'gana' : ''}">${jugado || live ? x.score ?? 0 : '·'}${jugado ? lado(x) : ''}</span><i>:</i><span class="${(y.score ?? 0) > (x.score ?? 0) ? 'gana' : ''}">${jugado || live ? y.score ?? 0 : '·'}${jugado ? lado(y) : ''}</span></div></div>`;
    };
    let rondas = '';
    if (vivo && (vivo.rounds || []).length) {
      let ant = [0, 0];
      const rs = vivo.rounds.filter((r) => r.score).map((r) => { const [p, q] = String(r.score).split('-').map(Number), g = p > ant[0] ? 0 : 1; ant = [p, q]; const k = rev ? 1 - g : g;
        return `<i class="${k ? 'b' : 'a'} ${r.number === 12 ? 'medio' : ''}" title="Ronda ${r.number} · ${esc(METODO[r.method] || r.method || '')}">${r.methodIcon ? `<img src="${esc(r.methodIcon)}" alt="">` : ''}</i>` }).join('');
      rondas = `<div class="vv-r"><span class="lab">${esc(vivo.name)} · ronda a ronda</span><div class="vv-rs">${rs}</div><div class="vv-leg"><span class="a">${esc(a)}</span><span class="b">${esc(b)}</span></div></div>`;
    }
    let jug = '';
    const ps = vivo?.players?.length ? vivo.players : d.players || [];
    if (ps.length) {
      const tagDe = (t) => { const tags = [...new Set(ps.map((p) => p.teamTag).filter(Boolean))]; return tags.find((g) => parecido(g, t.name) || norm(t.name).startsWith(norm(g)) || base(t.name).split(/\s+/).map((w) => w[0]).join('') === base(g)) };
      const ga = tagDe(ta), gb = tagDe(tb) || [...new Set(ps.map((p) => p.teamTag))].find((g) => g !== ga);
      let pa = ps.filter((p) => p.teamTag === ga), pb = ps.filter((p) => p.teamTag === gb);
      if (!pa.length && !pb.length) { pa = ps.slice(0, 5); pb = ps.slice(5, 10); if (rev) [pa, pb] = [pb, pa] }
      const num = (v) => (v == null || v === '' ? '·' : esc(v));
      const fila = (p) => `<div class="vv-p"><span class="vv-ag">${(p.agents || []).slice(0, 1).map((g) => `<img src="${esc(g.img)}" alt="${esc(g.name)}" title="${esc(g.name)}">`).join('')}</span><b>${esc(p.name)}${p.flag ? `<small>${esc(p.flag.toUpperCase())}</small>` : ''}</b><span>${num(p.stats?.acs)}</span><span>${num(p.stats?.kills)}/${num(p.stats?.deaths)}/${num(p.stats?.assists)}</span><span>${num(p.stats?.adr)}</span></div>`;
      const tabla = (n, l) => (l.length ? `<div class="vv-pt"><div class="vv-p h"><span></span><b>${esc(n)}</b><span>ACS</span><span>K/D/A</span><span>ADR</span></div>${l.map(fila).join('')}</div>` : '');
      jug = `<div class="vv-ps">${tabla(a, pa)}${tabla(b, pb)}</div>`;
    }
    const pbs = d.picksBans?.list?.length ? `<p class="vv-pb">${d.picksBans.list.map((x) => `<span class="${x.action}">${x.action === 'ban' ? 'ban' : x.action === 'pick' ? 'pick' : 'queda'} ${esc(x.map)}${x.team ? ' · ' + esc(x.team) : ''}</span>`).join('')}</p>` : '';
    return `<div class="vv" data-vv><div class="vv-h"><span class="vv-dot"></span>Marcador en directo · ${esc(d.format || '')}<small>vlr.gg · cada 20 s</small></div>${cab}<div class="vv-maps">${maps.map(tarjeta).join('')}</div>${rondas}${jug}${pbs}</div>`;
  }

  /* ---------- futbol ---------- */
  async function futbol(key) {
    const c = espn.get(key); if (c && Date.now() - c.t < 30000) return c.d;
    const [, lg, ev] = key.split('|');
    try { const d = await json(`https://site.api.espn.com/apis/site/v2/sports/soccer/${lg}/summary?event=${ev}`); espn.set(key, { t: Date.now(), d }); return d } catch { return c?.d || null }
  }
  function pintaFutbol(d) {
    const comp = d?.header?.competitions?.[0]; if (!comp) return '';
    const st = comp.status?.type || {}, h = comp.competitors?.find((x) => x.homeAway === 'home'), a = comp.competitors?.find((x) => x.homeAway === 'away');
    const logo = (c) => c?.team?.logos?.[0]?.href || c?.team?.logo || '';
    const tipo = (t) => (/own goal/i.test(t) ? 'pp' : /penalty.*(missed|saved)/i.test(t) ? 'fallo' : /goal|penalty/i.test(t) ? 'gol' : /red/i.test(t) ? 'roja' : /yellow/i.test(t) ? 'amarilla' : /substitution/i.test(t) ? 'cambio' : '');
    const ICO = { gol: '⚽', pp: '⚽', fallo: '✕', roja: '<i class="tj r"></i>', amarilla: '<i class="tj"></i>', cambio: '⇄' };
    const ev = (d.keyEvents || []).filter((k) => tipo(k.type?.text || ''));
    const evs = ev.map((k) => { const t = tipo(k.type?.text || ''), p = k.participants || [], local = String(k.team?.id) === String(h?.team?.id);
      const quien = t === 'cambio' ? `${esc(p[0]?.athlete?.displayName || '')} <small>por ${esc(p[1]?.athlete?.displayName || '')}</small>` : `${esc(p[0]?.athlete?.displayName || k.shortText || '')}${t === 'gol' && p[1] ? ` <small>asistencia de ${esc(p[1].athlete?.displayName || '')}</small>` : t === 'pp' ? ' <small>en propia</small>' : ''}`;
      return `<div class="vv-e ${local ? 'h' : 'a'} ${t}"><span class="m">${esc(k.clock?.displayValue || '')}</span><span class="ic">${ICO[t]}</span><span class="tx">${quien}</span></div>` }).join('');
    const stats = d.boxscore?.teams || [];
    const idx = (c) => stats.findIndex((t) => String(t.team?.id) === String(c?.team?.id));
    const ih = idx(h) >= 0 ? idx(h) : 0, ia = idx(a) >= 0 ? idx(a) : 1;
    const val = (i, n) => (stats[i]?.statistics || []).find((x) => x.name === n)?.displayValue;
    const filas = [['possessionPct', 'Posesión', '%'], ['totalShots', 'Tiros', ''], ['shotsOnTarget', 'A puerta', ''], ['wonCorners', 'Córners', ''], ['foulsCommitted', 'Faltas', ''], ['offsides', 'Fueras de juego', ''], ['saves', 'Paradas', ''], ['yellowCards', 'Amarillas', ''], ['redCards', 'Rojas', '']]
      .map(([k, n, u]) => { const x = val(ih, k), y = val(ia, k); if (x == null && y == null) return ''; const nx = parseFloat(x) || 0, ny = parseFloat(y) || 0, tot = nx + ny || 1;
        return `<div class="vv-st"><b>${esc(x ?? '·')}${u}</b><span><em>${n}</em><i><u style="width:${(nx / tot) * 100}%"></u><u style="width:${(ny / tot) * 100}%"></u></i></span><b>${esc(y ?? '·')}${u}</b></div>` }).join('');
    return `<div class="vv" data-vv><div class="vv-h"><span class="vv-dot ${st.state === 'in' ? '' : 'off'}"></span>${st.state === 'in' ? 'En directo · ' + esc(st.shortDetail || comp.status?.displayClock || '') : esc(st.shortDetail || st.description || '')}<small>ESPN · cada 30 s</small></div>
      <div class="vv-cab"><span>${logo(h) ? `<img src="${esc(logo(h))}" alt="">` : ''}<b>${esc(h?.team?.shortDisplayName || '')}</b></span><strong>${esc(h?.score ?? '0')}<i>:</i>${esc(a?.score ?? '0')}</strong><span class="d"><b>${esc(a?.team?.shortDisplayName || '')}</b>${logo(a) ? `<img src="${esc(logo(a))}" alt="">` : ''}</span></div>
      ${evs ? `<div class="vv-evs">${evs}</div>` : '<p class="vv-nada">Aún no ha pasado nada.</p>'}
      ${filas ? `<div class="vv-sts">${filas}</div>` : ''}</div>`;
  }

  /* ---------- el marcador en toda la app (PM: "sigue sin poner el match score in real time") ----------
     Cada 20 s, para los partidos de Valorant en directo, pone en el partido de la app (M, global de app.js) los mapas
     ganados y las rondas del mapa en juego, por ejemplo "1:0 (7-5)". Asi sale en Partidos, Mis apuestas y Directo. */
  let globalT = 0;
  async function marcadores() {
    clearTimeout(globalT);
    try {
      const lista = typeof M !== 'undefined' ? M.filter((m) => m.live && m.s === 'v').slice(0, 6) : [];
      let cambia = false;
      for (const m of lista) {
        const d = await valorant(m.a, m.b); if (!d) continue;
        const rev = !parecido(d.teams?.[0]?.name, m.a), par = (x) => (rev ? [x[1], x[0]] : x);
        const [ta, tb] = par(d.teams || [{}, {}]);
        const vivoMap = (d.maps || []).find((x) => x.status === 'live');
        let txt = `${ta.score ?? 0}:${tb.score ?? 0}`;
        if (vivoMap) { const [x, y] = par(vivoMap.teams || [{}, {}]); if (x.score != null) txt += ` (${x.score}-${y.score})` }
        if (m.score !== txt) { m.score = txt; m.vlr = true; cambia = true }
      }
      // que el siguiente load() no lo pise hasta que vuelva a pasar por aqui
      if (cambia && typeof render === 'function' && !document.activeElement?.matches('input,textarea')) render();
    } catch {}
    globalT = setTimeout(marcadores, document.hidden ? 60000 : CADA);
  }
  setTimeout(marcadores, 3000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) marcadores() });

  /* ---------- montaje ---------- */
  async function tick() {
    clearTimeout(timer);
    const info = document.querySelector('.dv [data-dv-info]');
    if (info && !document.hidden) {
      const sp = info.querySelector('.dv-sp')?.textContent || '', nombres = [...info.querySelectorAll('.dv-sc b')].map((e) => e.textContent.trim()), k = nombres.join('|');
      const ek = info.dataset.espn || '';
      if (/^soccer\|/.test(ek)) { try { html.set(k, pintaFutbol(await futbol(ek))) } catch {} pon() }
      else if (/valorant/i.test(sp) && nombres.length === 2) { try { const d = await valorant(nombres[0], nombres[1]); html.set(k, d ? pintaValorant(d, nombres[0], nombres[1]) : '') } catch {} pon() }
    }
    timer = setTimeout(tick, document.querySelector('.dv') ? CADA : 4000);
  }
  // la app repinta la informacion del directo cada poco: se vuelve a poner lo ultimo que hay
  function pon() {
    const info = document.querySelector('.dv [data-dv-info]'); if (!info) return;
    const h = html.get([...info.querySelectorAll('.dv-sc b')].map((e) => e.textContent.trim()).join('|'));
    const ya = info.querySelector('[data-vv]');
    if (!h) { if (ya) ya.remove(); return }
    if (ya) { if (ya.outerHTML !== h) ya.outerHTML = h } else info.querySelector('.dv-meta')?.insertAdjacentHTML('afterend', h);
    const nuevo = info.querySelector('[data-vv]'); if (nuevo && window.GM_LANG) GM_LANG.traduce(nuevo);
  }
  new MutationObserver(() => { if (document.querySelector('.dv [data-dv-info]') && !document.querySelector('[data-vv]')) pon() }).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick() });
  document.addEventListener('click', (e) => { if (e.target.closest('[data-dv], .dv-btn')) setTimeout(tick, 300) });
  tick();

  const css = document.createElement('style');
  css.textContent = `
.vv{display:grid;gap:14px;padding:16px 18px 18px;border-radius:16px;background:var(--bg2)}
.vv-h{display:flex;align-items:center;gap:8px;font:600 12px var(--sans);color:#ff8f98}
.vv-h small{margin-left:auto;font:10px var(--mono);color:var(--dim)}
.vv-dot{width:8px;height:8px;border-radius:50%;background:#e0646f;animation:latido 1.2s ease-in-out infinite}
.vv-dot.off{background:var(--dim);animation:none}
.vv-cab{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:14px;padding-bottom:10px}
.vv-cab span{display:flex;align-items:center;gap:10px;min-width:0}
.vv-cab span.d{justify-content:flex-end;text-align:right}
.vv-cab img{width:34px;height:34px;object-fit:contain}
.vv-cab b{font:700 15px var(--sans);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vv-cab strong{display:grid;grid-auto-flow:column;align-items:center;gap:6px;font:600 30px var(--mono);color:#ff8f98;position:relative}
.vv-cab strong i{font-style:normal;color:var(--dim)}
.vv-cab strong small{position:absolute;left:0;right:0;bottom:-14px;text-align:center;font:9px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}
.vv-maps{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px}
.vv-map{display:grid;gap:8px;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.03)}
.vv-map.live{background:rgba(224,100,111,.1);box-shadow:inset 0 0 0 1.5px rgba(224,100,111,.6)}
.vv-mn b{display:block;font:700 14px var(--sans)}
.vv-mn small{font:10px var(--mono);color:var(--dim)}
.vv-map.live .vv-mn small{color:#ff8f98}
.vv-ms{display:grid;grid-template-columns:1fr auto 1fr;align-items:start;gap:6px;font:600 24px var(--mono);color:var(--mute)}
.vv-ms span:last-child{text-align:right}
.vv-ms span small{display:block;font:9px var(--mono);color:var(--dim);font-weight:400;margin-top:2px}
.vv-ms i{font-style:normal;color:var(--dim)}
.vv-ms span.gana{color:var(--ink)}
.vv-map.live .vv-ms span{color:#ffd0d4}
.vv-r .lab{display:block;margin-bottom:6px}
.vv-rs{display:flex;flex-wrap:wrap;gap:3px}
.vv-rs i{display:grid;place-items:center;width:20px;height:24px;border-radius:4px;background:var(--acc)}
.vv-rs i.b{background:#4d88e6}
.vv-rs i.medio{margin-right:8px}
.vv-rs img{width:13px;height:13px;object-fit:contain;filter:brightness(0) invert(.08)}
.vv-leg{display:flex;gap:14px;margin-top:6px;font:11px var(--mono);color:var(--dim)}
.vv-leg span::before{content:'';display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px;vertical-align:-1px;background:var(--acc)}
.vv-leg .b::before{background:#4d88e6}
.vv-ps{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}
.vv-p{display:grid;grid-template-columns:26px minmax(0,1fr) 40px 64px 40px;align-items:center;gap:8px;min-height:32px;border-top:1px solid var(--hair);font:13px var(--mono);color:var(--soft)}
.vv-p.h{border-top:0;min-height:22px;font:10px var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}
.vv-p.h b{font:700 12px var(--sans);letter-spacing:0;text-transform:none;color:var(--ink)}
.vv-p b{min-width:0;font:600 13px var(--sans);color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vv-p b small{margin-left:6px;font:10px var(--mono);color:var(--dim)}
.vv-p span{text-align:right}
.vv-ag img{width:24px;height:24px;border-radius:6px;background:rgba(255,255,255,.06)}
.vv-pb{display:flex;flex-wrap:wrap;gap:4px 12px;font:11px var(--mono);color:var(--dim)}
.vv-pb .pick{color:var(--soft)}.vv-pb .remains{color:var(--acc)}
.vv-evs{display:grid;gap:2px}
.vv-e{display:grid;grid-template-columns:40px 22px minmax(0,1fr);align-items:center;gap:8px;min-height:30px;font:13px var(--sans);color:var(--soft)}
.vv-e.a{grid-template-columns:minmax(0,1fr) 22px 40px;text-align:right}
.vv-e.a .m{order:3}.vv-e.a .ic{order:2}.vv-e.a .tx{order:1}
.vv-e .m{font:12px var(--mono);color:var(--dim)}
.vv-e .ic{text-align:center}
.vv-e .tx small{font:11px var(--mono);color:var(--dim)}
.vv-e.gol .tx,.vv-e.pp .tx{font-weight:700;color:var(--ink)}
.tj{display:inline-block;width:10px;height:14px;border-radius:2px;background:#f2c14e;vertical-align:-2px}
.tj.r{background:#e0646f}
.vv-nada{font:12px var(--mono);color:var(--dim)}
.vv-sts{display:grid;gap:6px}
.vv-st{display:grid;grid-template-columns:52px 1fr 52px;align-items:center;gap:10px;font:500 13px var(--mono);color:var(--soft)}
.vv-st b:last-child{text-align:right}
.vv-st span{display:grid;gap:4px}
.vv-st em{font:10px var(--mono);font-style:normal;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);text-align:center}
.vv-st span i{display:flex;gap:3px;height:5px}
.vv-st span u{display:block;border-radius:3px;background:var(--acc)}
.vv-st span u+u{background:#4d88e6}
@media (prefers-reduced-motion:reduce){.vv-dot{animation:none}}`;
  document.head.appendChild(css);
})();
