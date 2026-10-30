// Marcador en directo de Valorant (PM, 30-10: "¿no podemos hacer que salga el score real del game en real time?").
// Fuente gratis y abierta: la API no oficial de vlr.gg (vlr.orlandomm.net, CORS abierto). Mientras la pantalla de
// Directo esta abierta en un partido de Valorant, cada 20 s busca el partido por los nombres de los equipos y pinta
// los mapas con sus rondas, el mapa en juego ronda a ronda y los picks y bans. Va aparte de app.js: se cuelga del
// bloque [data-dv-info] y se vuelve a poner solo cuando la app repinta.
'use strict';
(function () {
  const API = 'https://vlr.orlandomm.net/api/v1';
  const CADA = 20000;
  let lista = { t: 0, d: [] }, det = new Map(), html = new Map(), timer = 0;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\b(esports?|gaming|team|gc|club)\b/g, '').replace(/[^a-z0-9]/g, '');
  const parecido = (a, b) => { a = norm(a); b = norm(b); return !!a && !!b && (a === b || a.includes(b) || b.includes(a)) };
  async function json(url) { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error(r.status); return r.json() }

  async function buscar(a, b) {
    if (Date.now() - lista.t > CADA) { try { lista = { t: Date.now(), d: (await json(`${API}/matches`)).data || [] } } catch { lista.t = Date.now() } }
    const m = lista.d.find((x) => (x.teams || []).length === 2 && ((parecido(x.teams[0].name, a) && parecido(x.teams[1].name, b)) || (parecido(x.teams[0].name, b) && parecido(x.teams[1].name, a))));
    if (!m) return null;
    const c = det.get(m.id);
    if (c && Date.now() - c.t < CADA) return c.d;
    try { const d = (await json(`${API}/matches/${m.id}`)).data; det.set(m.id, { t: Date.now(), d }); return d } catch { return c?.d || null }
  }

  function pinta(d, a, b) {
    const t0 = d.teams?.[0]?.name, alReves = !parecido(t0, a);   // que el marcador siga el orden de la app (a | b)
    const par = (arr) => (alReves ? [arr[1], arr[0]] : arr);
    const maps = (d.maps || []).filter((m) => m.name && !/all maps/i.test(m.name));
    const vivo = maps.find((m) => m.status === 'live');
    const fila = (m) => { const [x, y] = par(m.teams || [{}, {}]); const fin = m.status !== 'live' && (x.score != null || y.score != null) && (x.score || y.score);
      return `<div class="vv-m ${m.status === 'live' ? 'live' : fin ? 'fin' : ''}"><span class="vv-n">${esc(m.name)}${m.pickedBy ? `<small>pick de ${esc(m.pickedBy)}</small>` : ''}</span><b class="${(x.score ?? 0) > (y.score ?? 0) ? 'gana' : ''}">${x.score ?? '·'}</b><i>:</i><b class="${(y.score ?? 0) > (x.score ?? 0) ? 'gana' : ''}">${y.score ?? '·'}</b><em>${m.status === 'live' ? 'en juego' : fin ? 'acabado' : 'pendiente'}</em></div>` };
    let rondas = '';
    if (vivo && Array.isArray(vivo.rounds) && vivo.rounds.length) {
      // quien gana cada ronda: el marcador acumulado ("7-5") sube del lado del que la gana
      let ant = [0, 0];
      const marcas = vivo.rounds.filter((r) => r.score).map((r) => { const [p, q] = String(r.score).split('-').map(Number), g = p > ant[0] ? 0 : 1; ant = [p, q]; const nuestro = alReves ? 1 - g : g;
        return `<i class="${nuestro ? 'b' : 'a'}" title="Ronda ${r.number}${r.method ? ' · ' + esc(r.method) : ''}"></i>` }).join('');
      rondas = `<div class="vv-r"><span class="lab">${esc(vivo.name)} · ronda a ronda</span><div class="vv-rs">${marcas}</div><div class="vv-leg"><span class="a">${esc(a)}</span><span class="b">${esc(b)}</span></div></div>`;
    }
    const pb = d.picksBans?.list?.length ? `<p class="vv-pb">${d.picksBans.list.map((x) => `<span class="${x.action}">${x.action === 'ban' ? 'ban' : x.action === 'pick' ? 'pick' : 'queda'} ${esc(x.map)}${x.team ? ' · ' + esc(x.team) : ''}</span>`).join('')}</p>` : '';
    return `<div class="vv" data-vv><div class="vv-h"><span class="vv-dot"></span>Marcador en directo<small>vlr.gg · cada 20 s</small></div>${maps.map(fila).join('')}${rondas}${pb}</div>`;
  }

  // ---------- futbol (PM: "para football también quiero alguna cosa in real time"): ESPN cada 30 s ----------
  const espn = new Map();
  async function futbol(key) {
    const c = espn.get(key); if (c && Date.now() - c.t < 30000) return c.d;
    const [, lg, ev] = key.split('|');
    try { const d = await json(`https://site.api.espn.com/apis/site/v2/sports/soccer/${lg}/summary?event=${ev}`); espn.set(key, { t: Date.now(), d }); return d } catch { return c?.d || null }
  }
  function pintaFutbol(d) {
    const comp = d?.header?.competitions?.[0]; if (!comp) return '';
    const st = comp.status?.type || {}, h = comp.competitors?.find((x) => x.homeAway === 'home'), a = comp.competitors?.find((x) => x.homeAway === 'away');
    const ev = (d.keyEvents || []).filter((k) => /goal|card|substitution|penalty/i.test(k.type?.text || '')).slice(-14);
    const ico = (t) => (/goal/i.test(t) ? '⚽' : /red/i.test(t) ? '🟥' : /yellow/i.test(t) ? '🟨' : /substitution/i.test(t) ? '⇄' : '•');
    const stats = (d.boxscore?.teams || []);
    const st2 = (n) => stats.map((t) => (t.statistics || []).find((x) => x.name === n)?.displayValue ?? '·');
    const filas = [['possessionPct', 'Posesión', '%'], ['totalShots', 'Tiros', ''], ['shotsOnTarget', 'A puerta', ''], ['wonCorners', 'Córners', ''], ['foulsCommitted', 'Faltas', '']].map(([k, n, u]) => { const [x, y] = st2(k); return x === '·' && y === '·' ? '' : `<div class="vv-st"><b>${esc(x)}${u}</b><span>${n}</span><b>${esc(y)}${u}</b></div>` }).join('');
    return `<div class="vv" data-vv><div class="vv-h"><span class="vv-dot"></span>${st.state === 'in' ? 'En directo · ' + esc(st.shortDetail || comp.status?.displayClock || '') : esc(st.shortDetail || st.description || '')}<small>ESPN · cada 30 s</small></div>
      <div class="vv-fs"><span>${esc(h?.team?.shortDisplayName || '')}</span><b>${esc(h?.score ?? '0')} : ${esc(a?.score ?? '0')}</b><span>${esc(a?.team?.shortDisplayName || '')}</span></div>
      ${ev.length ? `<div class="vv-ev">${ev.map((k) => `<span class="${k.team?.id === h?.team?.id ? 'h' : 'a'}"><i>${esc(k.clock?.displayValue || '')}</i>${ico(k.type?.text || '')} ${esc(k.participants?.[0]?.athlete?.displayName || k.text || '')}</span>`).join('')}</div>` : ''}
      ${filas ? `<div class="vv-sts">${filas}</div>` : ''}</div>`;
  }

  async function tick() {
    clearTimeout(timer);
    const info = document.querySelector('.dv [data-dv-info]');
    if (info && !document.hidden) {
      const sp = info.querySelector('.dv-sp')?.textContent || '', nombres = [...info.querySelectorAll('.dv-sc b')].map((e) => e.textContent.trim());
      const ek = info.dataset.espn || '';
      if (/^soccer\|/.test(ek)) { try { html.set(nombres.join('|'), pintaFutbol(await futbol(ek))) } catch {} pon() }
      else if (/valorant/i.test(sp) && nombres.length === 2) {
        const k = nombres.join('|');
        try { const d = await buscar(nombres[0], nombres[1]); html.set(k, d ? pinta(d, nombres[0], nombres[1]) : '') } catch {}
        pon();
      }
    }
    timer = setTimeout(tick, document.querySelector('.dv') ? CADA : 4000);   // el futbol tiene su propia cache de 30 s
  }
  // la app repinta la informacion del directo cada poco: se vuelve a poner lo ultimo que hay
  function pon() {
    const info = document.querySelector('.dv [data-dv-info]'); if (!info) return;
    const nombres = [...info.querySelectorAll('.dv-sc b')].map((e) => e.textContent.trim()), h = html.get(nombres.join('|'));
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
.vv{display:grid;gap:8px;padding:14px 16px;border-radius:14px;background:var(--bg2)}
.vv-h{display:flex;align-items:center;gap:8px;margin-bottom:4px;font:600 12px var(--sans);color:#ff8f98}
.vv-h small{margin-left:auto;font:10px var(--mono);color:var(--dim)}
.vv-dot{width:8px;height:8px;border-radius:50%;background:#e0646f;animation:latido 1.2s ease-in-out infinite}
.vv-m{display:grid;grid-template-columns:minmax(0,1fr) 34px 10px 34px 78px;align-items:center;min-height:36px;font:600 14px var(--sans);color:var(--mute)}
.vv-m.live{color:var(--ink)}.vv-m.fin{color:var(--soft)}
.vv-n small{display:block;font:10px var(--mono);color:var(--dim);font-weight:400}
.vv-m b{font:600 20px var(--mono);text-align:center}
.vv-m b.gana{color:var(--acc)}.vv-m.live b{color:#ff8f98}.vv-m.live b.gana{color:#ffd0d4}
.vv-m i{font-style:normal;color:var(--dim);text-align:center}
.vv-m em{font:10px var(--mono);font-style:normal;color:var(--dim);text-align:right;text-transform:uppercase;letter-spacing:.1em}
.vv-m.live em{color:#ff8f98}
.vv-r{margin-top:6px}
.vv-r .lab{display:block;margin-bottom:6px}
.vv-rs{display:flex;flex-wrap:wrap;gap:3px}
.vv-rs i{width:14px;height:18px;border-radius:3px;background:var(--acc)}
.vv-rs i.b{background:#4d88e6}
.vv-leg{display:flex;gap:14px;margin-top:6px;font:11px var(--mono);color:var(--dim)}
.vv-leg span::before{content:'';display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px;vertical-align:-1px;background:var(--acc)}
.vv-leg .b::before{background:#4d88e6}
.vv-pb{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:4px;font:11px var(--mono);color:var(--dim)}
.vv-pb .pick{color:var(--soft)}.vv-pb .remains{color:var(--acc)}
.vv-fs{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:14px;font:600 14px var(--sans)}
.vv-fs b{font:600 26px var(--mono);color:#ff8f98}
.vv-fs span:last-child{text-align:right}
.vv-ev{display:grid;gap:4px;margin-top:4px}
.vv-ev span{font:13px var(--sans);color:var(--soft)}
.vv-ev span.a{text-align:right}
.vv-ev i{font:11px var(--mono);font-style:normal;color:var(--dim);margin:0 8px}
.vv-sts{display:grid;gap:4px;margin-top:6px}
.vv-st{display:grid;grid-template-columns:60px 1fr 60px;align-items:center;font:13px var(--mono);color:var(--mute)}
.vv-st span{text-align:center;font:10px var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}
.vv-st b:last-child{text-align:right}
@media (prefers-reduced-motion:reduce){.vv-dot{animation:none}}`;
  document.head.appendChild(css);
})();
