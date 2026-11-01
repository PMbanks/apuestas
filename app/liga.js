// Liga, pestana Saldo (Balance), rehecha (PM, 01-11): ranking de saldos con cara, color y mini linea; "Quien sabe mas" con
// expertos por deporte y mapa de calor; "Saldo semana a semana" con grafico de lineas que no se sale nunca; y "Ganancia por
// semana" con barras. Va aparte, como apostadores.js: app.js lo pinta desde liga() y aqui se usa lo global de app.js
// (F, ALL, DEP, SP, N, O, av, coin, en, me, MEK, WEEKLY, PAY, CD, AW, heat, chCuota, strips, table, barPath, legend...).
// Los graficos se dibujan en SVG a su tamano real (sin escalar): el eje Y va fijo a la izquierda y lo de la derecha hace
// scroll horizontal DENTRO del grafico si hay muchas semanas; la pagina nunca. Alto fijo: no hay saltos al cargar.
'use strict';
(function () {
  const g = (f, d) => { try { return f() } catch { return d } };
  const T = (es, en_) => (en() ? en_ : es);
  const MINSP = 3, MINALL = 5;   // resueltas que hacen falta para entrar en "Quien sabe mas": por deporte y en general
  const R0 = (x) => Math.round(x || 0);
  const Nn = (x) => (R0(x) < 0 ? '−' : '') + N(Math.abs(R0(x)));            // menos tipografico
  const Ns = (x) => (R0(x) > 0 ? '+' : R0(x) < 0 ? '−' : '') + N(Math.abs(R0(x)));
  const K = (v) => { const a = Math.abs(v), s = a >= 1000 ? (a / 1000).toFixed(a % 1000 ? 1 : 0).replace('.', en() ? '.' : ',') + 'k' : String(Math.round(a)); return (v < 0 ? '−' : '') + s };
  const col = (id) => `var(--f-${id})`;
  const movil = () => innerWidth < 700;

  /* ---------- escala bonita: marcas redondas que cubren el minimo y el maximo ---------- */
  function ticks(mn, mx, target, libre) {
    if (!libre) { mn = Math.min(mn, 0); mx = Math.max(mx, 0) } if (mx === mn) mx = mn + 100;
    const raw = (mx - mn) / (target || 5), p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p, step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
    const lo = Math.floor(mn / step + 1e-9) * step, hi = Math.ceil(mx / step - 1e-9) * step, t = [];
    for (let v = lo; v <= hi + step / 2; v += step) t.push(Math.round(v * 100) / 100);
    return { t, lo, hi };
  }

  /* ---------- 1. ranking de saldos ---------- */
  function spark(f, w, h) {
    const v = f.h.length > 1 ? f.h : [f.h[0], f.h[0]], mn = Math.min(...v), mx = Math.max(...v), pd = 3.5;
    const X = (i) => pd + ((w - 2 * pd) * i) / (v.length - 1), Y = (x) => (mx === mn ? h / 2 : h - pd - ((h - 2 * pd) * (x - mn)) / (mx - mn));
    const pts = v.map((x, i) => `${X(i).toFixed(1)},${Y(x).toFixed(1)}`);
    return `<svg class="lq-spk" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polygon points="${X(0).toFixed(1)},${h} ${pts.join(' ')} ${X(v.length - 1).toFixed(1)},${h}" fill="${col(f.id)}" opacity=".13"/><polyline points="${pts.join(' ')}" fill="none" stroke="${col(f.id)}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${X(v.length - 1).toFixed(1)}" cy="${Y(v[v.length - 1]).toFixed(1)}" r="3.2" fill="${col(f.id)}" stroke="var(--bg)" stroke-width="1.6"/></svg>`;
  }
  const semDe = (f) => (f.wk.length ? f.wk[f.wk.length - 1] : 0);   // lo ganado o perdido esta semana (sin contar la paga)
  const dlt = (f) => { const d = R0(semDe(f)); return `<span class="lq-d ${d > 0 ? 'up' : d < 0 ? 'dn' : ''}">${d > 0 ? '▲' : d < 0 ? '▼' : '·'} ${N(Math.abs(d))}${coin()}</span>` };
  const sal = (f) => `<b class="num ${f.s < 0 ? 'neg' : ''}">${Nn(f.s)}</b>${coin()}`;
  function rankHtml(rank) {
    const mx = Math.max(1, rank[0] ? rank[0].s : 1), pos = (i) => i + 1, a = rank[0], b = rank[1];
    const hero = a ? `<article class="lq-hero ${a.me ? 'me' : ''}" data-prof="${a.id}" style="--c:${col(a.id)}">
      <div class="lq-hl"><span class="lq-crown" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3.5 18.5l-1.2-9 5 3.8L12 5.5l4.7 7.8 5-3.8-1.2 9z"/><path d="M4 21.2h16"/></svg></span>${av(a.id, 'lq-big')}
        <div class="lq-hn"><span class="lab">${T('Líder de la liga', 'League leader')}</span><b>${esc(a.n)}${a.me ? `<i>${T('tú', 'you')}</i>` : ''}</b>${b ? `<span class="lq-lead">${R0(a.s - b.s) > 0 ? T(`Le saca <b>${N(a.s - b.s)}</b> a ${esc(b.n)}`, `Leads ${esc(b.n)} by <b>${N(a.s - b.s)}</b>`) : T(`Empatado con ${esc(b.n)}`, `Level with ${esc(b.n)}`)}</span>` : ''}${window.GM_RATIO ? GM_RATIO.mini(a.id) : ''}</div></div>
      <div class="lq-hs"><span class="lab">${T('Saldo', 'Balance')}</span><span class="lq-hv">${sal(a)}</span></div>
      <div class="lq-hr"><span class="lab">${T('Esta semana', 'This week')}</span>${dlt(a)}<span class="lq-hsp">${spark(a, 220, 46)}</span></div></article>` : '';
    const rows = rank.slice(1).map((f, j) => `<button type="button" class="lq-r ${f.me ? 'me' : ''}" data-prof="${f.id}" style="--c:${col(f.id)};--w:${f.s > 0 ? Math.max(2, Math.round((f.s / mx) * 100)) : 0}%">
      <span class="lq-p">${pos(j + 1)}</span>${av(f.id, 'lq-av')}<span class="lq-n"><span class="lq-nn"><b>${esc(f.n)}</b>${f.me ? `<i>${T('tú', 'you')}</i>` : ''}</span><span class="lq-dm">${dlt(f)}</span>${window.GM_RATIO ? GM_RATIO.mini(f.id) : ''}</span>
      <span class="lq-sp">${spark(f, 96, 30)}</span><span class="lq-dl">${dlt(f)}</span><span class="lq-v">${sal(f)}</span></button>`).join('');
    return `<section class="lq-rank" data-lq-sec="rank" data-notr><div class="lq-rh"><span class="lab">${T('Clasificación por saldo', 'Ranking by balance')}</span><span class="lab lq-rh2">${T('Evolución · esta semana', 'Trend · this week')}</span></div>${hero}<div class="lq-rows">${rows}</div></section>`;
  }

  /* ---------- 2. quien sabe mas ---------- */
  const IC_TROFEO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4"/></svg>';
  const colIc = (c) => (c === 'all' ? IC_TROFEO : `<img src="${SP[c][1]}" alt="">`);
  const SPEN = { f: 'Football' }, colNom = (c) => (c === 'all' ? T('General', 'Overall') : en() && SPEN[c] ? SPEN[c] : SP[c][0]);
  function sabeHtml() {
    const cols = ['all', ...DEP], cell = (r, c) => (c === 'all' ? r.all : r.sp[c]);
    const rows = F.map((f) => { const sp = {}; let w = 0, t = 0; for (const k of DEP) { const x = (f.sp && f.sp[k]) || [0, 0]; sp[k] = x; w += x[0]; t += x[1] } return { f, sp, all: [w, t] } });
    const exp = {};
    for (const c of cols) {
      const min = c === 'all' ? MINALL : MINSP, cand = rows.map((r) => ({ r, w: cell(r, c)[0], t: cell(r, c)[1] })).filter((x) => x.t >= min).sort((a, b) => b.w / b.t - a.w / a.t || b.t - a.t);
      const top = cand[0]; exp[c] = top ? { w: top.w, t: top.t, who: cand.filter((x) => x.w / x.t === top.w / top.t && x.t === top.t).map((x) => x.r.f) } : null;
    }
    const pc = (w, t) => (t ? Math.round((w / t) * 100) : 0), tot = rows.reduce((a, r) => a + r.all[1], 0);
    const cards = cols.map((c) => { const e = exp[c], cl = e ? e.who[0] : null;
      return `<div class="lq-ex ${e ? '' : 'vacio'}" style="--c:${cl ? col(cl.id) : 'var(--dim)'}"><span class="lq-exh"><i>${colIc(c)}</i>${esc(colNom(c))}</span>${e
        ? `<span class="lq-exw">${e.who.slice(0, 3).map((f) => av(f.id, 'lq-xl')).join('')}</span><b class="lq-exn">${e.who.slice(0, 3).map((f) => esc(f.n)).join(T(' y ', ' & '))}</b><span class="lq-exp"><b class="num">${pc(e.w, e.t)}%</b><em>${T(`${e.w} de ${e.t}`, `${e.w} of ${e.t}`)}</em></span>`
        : `<span class="lq-exw lq-ni"></span><b class="lq-exn">${T('Aún sin experto', 'No expert yet')}</b><span class="lq-exp"><em>${T(`hacen falta ${c === 'all' ? MINALL : MINSP} resueltas`, `needs ${c === 'all' ? MINALL : MINSP} settled`)}</em></span>`}</div>` }).join('');
    const ord = [...rows].sort((a, b) => { const qa = a.all[1] >= MINALL, qb = b.all[1] >= MINALL; return qa !== qb ? (qb ? 1 : -1) : pc(b.all[0], b.all[1]) - pc(a.all[0], a.all[1]) || b.all[1] - a.all[1] });
    const head = cols.map((c) => `<span class="lq-hh ${c === 'all' ? 'all' : ''}" title="${esc(colNom(c))}"><i>${colIc(c)}</i><em>${esc(colNom(c))}</em></span>`).join('');
    const body = ord.map((r) => `<span class="lq-hn2 ${r.f.me ? 'me' : ''}" data-prof="${r.f.id}">${av(r.f.id, 'sm')}<b>${esc(r.f.n)}</b></span>${cols.map((c) => {
      const [w, t] = cell(r, c), min = c === 'all' ? MINALL : MINSP, e = exp[c], star = e && e.who.some((f) => f.id === r.f.id), ok = t >= min, p = pc(w, t);
      const tip = `${r.f.n} · ${colNom(c)}: ${t ? T(`${w} de ${t} (${p}%)`, `${w} of ${t} (${p}%)`) : T('sin apuestas resueltas', 'no settled bets')}${t && !ok ? T(` · aún no entra (mínimo ${min})`, ` · not ranked yet (minimum ${min})`) : ''}`;
      return `<span class="lq-hc ${c === 'all' ? 'all' : ''} ${!t ? 'cero' : !ok ? 'bajo' : ''} ${star ? 'exp' : ''}" style="${ok ? `--a:${(0.1 + 0.52 * (p / 100)).toFixed(2)}` : ''}" title="${esc(tip)}">${t ? `<b class="num">${ok ? p + '%' : `${w}/${t}`}</b>${ok ? `<em>${w}/${t}</em>` : ''}` : '<b>·</b>'}${star ? '<s aria-hidden="true">★</s>' : ''}</span>` }).join('')}`).join('');
    return `<section class="lq-sec" data-lq-sec="sabe" data-notr><div class="lq-sh"><h2>${T('Quién sabe más', 'Who knows best')}</h2><p>${T(`Quién acierta más sobre sus apuestas resueltas. Para entrar hacen falta ${MINSP} resueltas en un deporte y ${MINALL} en general.`, `Who hits the most of their settled bets. You need ${MINSP} settled in a sport and ${MINALL} overall to be ranked.`)}</p></div>
      ${tot ? `<div class="lq-exs">${cards}</div><div class="lq-heat"><span class="lq-hh0"></span>${head}${body}</div>
      <p class="lq-key"><span class="lq-rampk"><i></i>${T('Más aciertos', 'More hits')}</span><span><s>★</s>${T('Experto', 'Expert')}</span><span><i class="b"></i>${T('Aún sin muestra suficiente: sale lo que llevan', 'Not enough bets yet: shows what they have')}</span></p>`
      : `<p class="hint">${T('Sale cuando se resuelvan las primeras apuestas.', 'Shows up once the first bets are settled.')}</p>`}</section>`;
  }

  /* ---------- graficos: base comun ---------- */
  const ST = { bal: null, pf: null };   // jugador resaltado en Saldo semana a semana; jugador de Ganancia por semana (null = tu; 'all' = todos)
  const PAD = { l: 14, t: 16, b: 30 }, AXW = 44;
  const hostW = () => { const v = document.getElementById('view'); const w = v ? v.clientWidth : innerWidth; return Math.max(240, Math.min(1120, w) - (movil() ? 32 : 64)) };
  function ejeY(tk, Y, H) {
    return `<svg class="lq-ay" width="${AXW}" height="${H}" viewBox="0 0 ${AXW} ${H}" aria-hidden="true">${tk.map((v) => `<text x="${AXW - 8}" y="${Y(v) + 4}" text-anchor="end" class="lq-t ${v === 0 ? 'z' : ''}">${K(v)}</text>`).join('')}</svg>`;
  }
  const tipBox = '<div class="lq-tt" hidden></div>';

  /* ---------- 3. saldo semana a semana ---------- */
  function chBal() {
    const W0 = hostW(), pcM = movil(), H = pcM ? 300 : 360, n = Math.max(2, ...F.map((f) => f.h.length)), end = !pcM;
    const padR = end ? 132 : 22, inner = W0 - AXW, minStep = pcM ? 78 : 96;
    const Wp = Math.max(inner, padR + PAD.l + (n - 1) * minStep), given = Array.from({ length: n }, (_, i) => WEEKLY * Math.max(1, i));
    const vals = F.flatMap((f) => f.h).concat(given), vmn = Math.min(...vals), vmx = Math.max(...vals), tk = ticks(vmn >= 0 ? Math.max(0, vmn - (vmx - vmn) * 0.06) : vmn - (vmx - vmn) * 0.06, vmx + (vmx - vmn) * 0.08, pcM ? 5 : 7, true), lo = tk.lo, hi = tk.hi;
    const X = (i) => PAD.l + ((Wp - PAD.l - padR) * i) / (n - 1), Y = (v) => PAD.t + ((H - PAD.t - PAD.b) * (hi - v)) / (hi - lo);
    const lab = (i) => (i === 0 ? T('Inicio', 'Start') : i === n - 1 ? T('Hoy', 'Today') : T('S', 'W') + i);
    const rank = [...F].sort((a, b) => b.s - a.s), sel = F.some((f) => f.id === ST.bal) ? ST.bal : null;
    let s = `<svg class="lq-plot" width="${Wp}" height="${H}" viewBox="0 0 ${Wp} ${H}" role="img" aria-label="${T('Saldo semana a semana', 'Balance week by week')}">`;
    if (lo < 0) s += `<rect x="0" y="${Y(0)}" width="${Wp}" height="${Y(lo) - Y(0)}" fill="#e0646f" opacity=".07"/>`;
    for (const v of tk.t) s += `<line x1="0" x2="${Wp}" y1="${Y(v)}" y2="${Y(v)}" class="${v === 0 ? 'lq-z' : 'lq-gl'}"/>`;
    for (let i = 0; i < n; i++) s += `<text x="${X(i)}" y="${H - 9}" class="lq-t ${i === n - 1 ? 'a' : ''}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${lab(i)}</text>`;
    s += `<polyline points="${given.map((v, i) => `${X(i)},${Y(v)}`).join(' ')}" fill="none" class="lq-ref"/>`;
    const orden = [...F].sort((a, b) => (a.id === sel ? 1 : b.id === sel ? -1 : a.me ? 1 : b.me ? -1 : 0));
    for (const f of orden) {
      const h = Array.from({ length: n }, (_, i) => (i < f.h.length ? f.h[i] : f.h[f.h.length - 1])), last = n - 1;
      s += `<g class="lq-ln ${f.id === sel ? 'sel' : ''}" data-p="${f.id}"><polyline points="${h.map((v, i) => `${X(i)},${Y(v)}`).join(' ')}" fill="none" stroke="${col(f.id)}" stroke-width="${f.id === sel ? 3.2 : 2.3}" stroke-linejoin="round" stroke-linecap="round"/>`;
      h.forEach((v, i) => { s += `<circle cx="${X(i)}" cy="${Y(v)}" r="${i === last ? 5 : 3.2}" fill="${col(f.id)}" stroke="var(--bg)" stroke-width="2"/>` });
      if (f.id === sel) h.forEach((v, i) => { s += `<text x="${X(i)}" y="${v >= (h[i - 1] ?? v) || i === 0 ? Y(v) - 11 : Y(v) + 19}" text-anchor="${i === 0 ? 'start' : i === last && end ? 'middle' : 'middle'}" class="lq-vl">${Nn(v)}</text>` });
      s += '</g>';
    }
    if (end) {   // nombre y saldo al final de cada linea, separados para que no se pisen
      const L = rank.map((f) => ({ f, y: Y(f.h[f.h.length - 1]) })), gap = 17, top = PAD.t + 6, bot = H - PAD.b - 2;
      L.forEach((o, i) => { if (i && o.y < L[i - 1].y + gap) o.y = L[i - 1].y + gap }); for (let i = L.length - 1; i >= 0; i--) { const lim = i === L.length - 1 ? bot : L[i + 1].y - gap; if (L[i].y > lim) L[i].y = lim } L.forEach((o) => { if (o.y < top) o.y = top });
      L.forEach((o, i) => { if (i && o.y < L[i - 1].y + gap) o.y = L[i - 1].y + gap });
      const x1 = X(n - 1);
      for (const o of L) s += `<g class="lq-el ${sel && sel !== o.f.id ? 'dim' : ''}" data-p="${o.f.id}">${Math.abs(o.y - 4 - Y(o.f.h[o.f.h.length - 1])) > 3 ? `<line x1="${x1 + 6}" y1="${Y(o.f.h[o.f.h.length - 1])}" x2="${x1 + 15}" y2="${o.y - 4}" stroke="${col(o.f.id)}" stroke-width="1" opacity=".35"/>` : ''}<circle cx="${x1 + 20}" cy="${o.y - 4}" r="3.6" fill="${col(o.f.id)}"/><text x="${x1 + 28}" y="${o.y}" class="lq-en">${esc(o.f.n.length > 8 ? o.f.n.slice(0, 8) + '…' : o.f.n)}<tspan class="lq-ev" dx="6">${Nn(o.f.s)}</tspan></text></g>`;
    }
    s += `<g class="lq-hvg" data-hv></g><rect class="lq-hit" x="0" y="0" width="${Wp}" height="${H}" fill="transparent" data-hit/></svg>`;
    const chips = rank.map((f) => `<button type="button" class="lq-chip ${sel === f.id ? 'on' : ''}" data-lq-sel="${f.id}" style="--c:${col(f.id)}" aria-pressed="${sel === f.id}"><i></i><span>${esc(f.n)}</span><em class="num ${f.s < 0 ? 'neg' : ''}">${Nn(f.s)}</em></button>`).join('');
    return { html: `<div class="lq-chips">${chips}</div><div class="lq-cw ${sel ? 'has-sel' : ''}" data-lq="bal" data-w="${W0}" style="--h:${H}px">${ejeY(tk.t, Y, H)}<div class="lq-sc">${s}</div>${tipBox}</div>`,
      d: { kind: 'bal', n, X, Y, lab, Wp, H, padR } };
  }
  const SBAL = () => { const c = chBal(); return `<section class="lq-sec" data-lq-sec="bal" data-notr><div class="lq-sh"><h2>${T('Saldo semana a semana', 'Balance week by week')}</h2><p>${T('Lo que tiene cada uno al cerrar la semana. La línea discontinua es lo repartido solo con la paga: por encima vas ganando dinero. Toca un nombre para resaltarlo.', 'What each one has at the end of the week. The dashed line is the payday money alone: above it you are winning. Tap a name to highlight it.')}</p></div>${c.html}</section>` };

  /* ---------- 4. ganancia por semana ---------- */
  function chPf() {
    const W0 = hostW(), pcM = movil(), H = pcM ? 280 : 330, n = Math.max(1, ...F.map((f) => f.wk.length));
    const quien = ST.pf === 'all' ? null : F.find((f) => f.id === (ST.pf || MEK)) || me(), todos = !quien, lista = todos ? F : [quien];
    const padR = 18, inner = W0 - AXW, minStep = todos ? Math.max(70, F.length * 9 + 14) : 64;
    const Wp = Math.max(inner, PAD.l + padR + n * minStep), step = (Wp - PAD.l - padR) / n;
    const val = (f, w) => R0(f.wk[w] || 0), all = lista.flatMap((f) => Array.from({ length: n }, (_, w) => val(f, w)));
    const mn0 = Math.min(0, ...all), mx0 = Math.max(0, ...all), ext = (mx0 - mn0 || 100) * (todos ? 0.04 : 0.14);
    const tk = ticks(mn0 < 0 ? mn0 - ext : mn0, mx0 > 0 ? mx0 + ext : mx0, pcM ? 4 : 5), lo = tk.lo, hi = tk.hi;
    const Y = (v) => PAD.t + ((H - PAD.t - PAD.b) * (hi - v)) / (hi - lo), cx = (w) => PAD.l + step * w + step / 2, y0 = Y(0);
    let s = `<svg class="lq-plot" width="${Wp}" height="${H}" viewBox="0 0 ${Wp} ${H}" role="img" aria-label="${T('Ganancia por semana', 'Profit by week')}">`;
    for (const v of tk.t) s += `<line x1="0" x2="${Wp}" y1="${Y(v)}" y2="${Y(v)}" class="${v === 0 ? 'lq-z' : 'lq-gl'}"/>`;
    for (let w = 0; w < n; w++) {
      s += `<text x="${cx(w)}" y="${H - 9}" text-anchor="middle" class="lq-t ${w === n - 1 ? 'a' : ''}">${w === n - 1 ? T('Ahora', 'Now') : T('S', 'W') + (w + 1)}</text>`;
      if (todos) {
        const gw = Math.min(step * 0.82, F.length * 16), bw = gw / F.length, x0 = cx(w) - gw / 2;
        F.forEach((f, i) => { const v = val(f, w); if (v) s += `<path d="${barPath(x0 + i * bw + 0.8, bw - 1.6, y0, Y(v), 2.5)}" fill="${col(f.id)}" class="lq-bar"/>` });
      } else {
        const v = val(quien, w), bw = Math.min(46, step * 0.5), up = v >= 0;
        if (v) s += `<path d="${barPath(cx(w) - bw / 2, bw, y0, Y(v), 5)}" fill="${up ? 'var(--win)' : '#e0646f'}" class="lq-bar"/>`;
        s += `<text x="${cx(w)}" y="${v === 0 ? y0 - 8 : up ? Y(v) - 8 : Y(v) + 17}" text-anchor="middle" class="lq-vl ${v === 0 ? 'z' : up ? 'up' : 'dn'}">${v ? Ns(v) : '0'}</text>`;
      }
    }
    s += `<g class="lq-hvg" data-hv></g><rect class="lq-hit" x="0" y="0" width="${Wp}" height="${H}" fill="transparent" data-hit/></svg>`;
    // resumen del jugador elegido
    const sum = (f) => { const a = Array.from({ length: n }, (_, w) => val(f, w)), t = a.reduce((x, y) => x + y, 0), best = Math.max(...a), worst = Math.min(...a); return { t, best, bi: a.indexOf(best), worst, wi: a.indexOf(worst) } };
    let res = '';
    if (quien) { const q = sum(quien); res = `<div class="lq-sum"><div><span class="lab">${T('Total', 'Total')}</span><b class="num ${q.t > 0 ? 'up' : q.t < 0 ? 'dn' : ''}">${Ns(q.t)}${coin()}</b></div><div><span class="lab">${T('Mejor semana', 'Best week')}</span><b class="num ${q.best > 0 ? 'up' : ''}">${q.best > 0 ? Ns(q.best) : '·'}</b><em>${q.best > 0 ? T('S', 'W') + (q.bi + 1) : ''}</em></div><div><span class="lab">${T('Peor semana', 'Worst week')}</span><b class="num ${q.worst < 0 ? 'dn' : ''}">${q.worst < 0 ? Ns(q.worst) : '·'}</b><em>${q.worst < 0 ? T('S', 'W') + (q.wi + 1) : ''}</em></div></div>` }
    else { const b = F.flatMap((f) => Array.from({ length: n }, (_, w) => [val(f, w), f, w])).sort((a, c) => c[0] - a[0]), w0 = b[b.length - 1]; res = `<div class="lq-sum"><div><span class="lab">${T('Mejor semana del grupo', 'Best week in the group')}</span><b class="num ${b[0][0] > 0 ? 'up' : ''}">${b[0][0] > 0 ? Ns(b[0][0]) : '·'}</b><em>${b[0][0] > 0 ? esc(b[0][1].n) + ' · ' + T('S', 'W') + (b[0][2] + 1) : ''}</em></div><div><span class="lab">${T('Peor semana del grupo', 'Worst week in the group')}</span><b class="num ${w0[0] < 0 ? 'dn' : ''}">${w0[0] < 0 ? Ns(w0[0]) : '·'}</b><em>${w0[0] < 0 ? esc(w0[1].n) + ' · ' + T('S', 'W') + (w0[2] + 1) : ''}</em></div></div>` }
    const sel = quien ? quien.id : 'all';
    const chips = `<button type="button" class="lq-chip all ${todos ? 'on' : ''}" data-lq-pf="all" aria-pressed="${todos}"><span>${T('Todos', 'Everyone')}</span></button>` + [...F].sort((a, b) => (b.me ? 1 : 0) - (a.me ? 1 : 0)).map((f) => `<button type="button" class="lq-chip ${sel === f.id ? 'on' : ''}" data-lq-pf="${f.id}" style="--c:${col(f.id)}" aria-pressed="${sel === f.id}"><i></i><span>${esc(f.n)}${f.me ? ' · ' + T('tú', 'you') : ''}</span></button>`).join('');
    return { html: `<div class="lq-chips">${chips}</div>${res}<div class="lq-cw" data-lq="pf" data-w="${W0}" style="--h:${H}px">${ejeY(tk.t, Y, H)}<div class="lq-sc">${s}</div>${tipBox}</div>`, d: { kind: 'pf', n, cx, Y, step, val, todos, quien, Wp, H } };
  }
  const SPF = () => { const c = chPf(); return `<section class="lq-sec" data-lq-sec="pf" data-notr><div class="lq-sh"><h2>${T('Ganancia por semana', 'Profit by week')}</h2><p>${T('Lo ganado o perdido cada semana apostando, sin contar la paga. Verde sube, rojo baja, el eje está en 0.', 'Won or lost each week by betting, without the payday. Green is up, red is down, the axis sits at 0.')}</p></div>${c.html}</section>` };

  /* ---------- pagina entera ---------- */
  const DATA = new WeakMap();
  function html() {
    const rank = [...F].sort((a, b) => b.s - a.s), meI = rank.findIndex((f) => f.me);
    const open = ALL.filter((b) => b.st === 'open').reduce((a, b) => a + b.stake, 0), set = ALL.filter((b) => b.st === 'won' || b.st === 'lost'), won = set.filter((b) => b.st === 'won').length;
    const gapUp = meI > 0 ? rank[meI - 1].s - me().s : 0, gapDn = meI >= 0 && meI < rank.length - 1 ? me().s - rank[meI + 1].s : 0, nWeeks = Math.max(1, me().h.length - 1);
    const mr = rank[meI - 1], md = rank[meI + 1];
    return `<div class="lc lq">${window.GM_APOST ? GM_APOST.tabs() : ''}
    <header class="lc-h"><span class="lab">${T('Temporada · desde el', 'Season · since')} ${esc(SEASON ? fmt(SEASON + 'T12:00:00Z', { day: 'numeric', month: 'short' }) : '')} · ${F.length} ${T('jugadores', 'players')}</span><h2 class="wk"><small>${T('SEMANA', 'WEEK')}</small>${String(nWeeks).padStart(2, '0')}</h2>
      <p class="l-pay" data-notr>${T('Paga de', 'Payday of')} <b>+${N(WEEKLY)}</b> ${T('a cada uno en', 'each, in')} ${CD(PAY)}</p>${CAMPEON ? `<p class="l-rey" data-notr>${av(CAMPEON.k, 'sm')}${en() ? `<b>${esc(fr(CAMPEON.k).n)}</b> is the champion of ${esc(CAMPEON.mes)} (▲ ${N(CAMPEON.v)}) and wears the crown all month` : `<b>${esc(fr(CAMPEON.k).n)}</b> es el campeón de ${esc(CAMPEON.mes)} (▲ ${N(CAMPEON.v)}) y lleva la corona todo el mes`}</p>` : ''}</header>
    ${rankHtml(rank)}
    <p class="gap" data-notr>${en() ? `${gapUp > 0 ? `You need <b>${N(gapUp)}</b> to catch ${esc(mr.n)}` : meI > 0 ? `Level with ${esc(mr.n)}` : 'You are first'}${gapDn > 0 ? ` · you lead ${esc(md.n)} by <b>${N(gapDn)}</b>` : ''}`
      : `${gapUp > 0 ? `Te faltan <b>${N(gapUp)}</b> para alcanzar a ${esc(mr.n)}` : meI > 0 ? `Empatado con ${esc(mr.n)}` : 'Vas primero'}${gapDn > 0 ? ` · le sacas <b>${N(gapDn)}</b> a ${esc(md.n)}` : ''}`}</p>
    ${sabeHtml()}
    <div class="kpis">
      <div class="kpi"><span class="lab">En juego ahora</span><b>${N(open)}${coin()}</b><span>entre todos</span></div>
      <div class="kpi"><span class="lab">Repartido</span><b>${N(F.reduce((a, f) => a + f.recibido, 0))}${coin()}</b><span>${nWeeks} lunes · ${F.length} jugadores</span></div>
      <div class="kpi"><span class="lab">Apuestas</span><b>${ALL.length}</b><span>esta temporada</span></div>
      <div class="kpi"><span class="lab">Aciertos del grupo</span><b>${set.length ? Math.round((won / set.length) * 100) + '%' : '·'}</b><span>${won} de ${set.length} resueltas</span></div>
    </div>
    ${SBAL()}${SPF()}
    <div class="cgrid">
      <section class="cs"><div class="cs-h"><div><h3>Dónde apuesta cada uno</h3><p>Qué parte de lo apostado va a cada deporte.</p></div></div>${heat()}</section>
      <section class="cs"><div class="cs-h"><div><h3>Cuota media</h3><p>Cuanto más alta, más arriesga.</p></div></div><div class="chart">${chCuota()}</div></section>
    </div>
    <section class="cs full"><div class="cs-h"><div><h3>Últimas apuestas</h3><p>Cada punto es una apuesta resuelta.</p></div></div>${strips()}</section>
    <section class="cs full"><div class="cs-h"><div><h3>Premios de la temporada</h3></div></div>
      ${AW.length ? `<div class="aw">${AW.map(([k, v, id, d]) => `<div class="awi"><span class="lab">${k}</span><b>${v}</b><span class="who3">${av(id, 'sm')}${esc(fr(id).n)}</span><span class="dd">${esc(d)}</span></div>`).join('')}</div>` : '<p class="hint">Se reparten cuando haya apuestas resueltas.</p>'}</section>
    <section class="cs full"><div class="cs-h"><div><h3>Clasificación</h3></div></div>${table(rank)}</section>
  </div>`;
  }

  /* ---------- interaccion: tooltip, resaltar, elegir jugador, encajar al ancho ---------- */
  const calc = (host) => (host.dataset.lq === 'bal' ? chBal().d : chPf().d);
  const dd = (host) => { let d = DATA.get(host); if (!d) { d = calc(host); DATA.set(host, d) } return d };
  function ponTip(host, e) {
    const d = dd(host), sc = host.querySelector('.lq-sc'), tt = host.querySelector('.lq-tt'), hv = host.querySelector('[data-hv]'), pl = host.querySelector('.lq-plot');
    const r = pl.getBoundingClientRect(), x = e.clientX - r.left;
    let i, h = '', g = '';
    if (d.kind === 'bal') {
      i = Math.max(0, Math.min(d.n - 1, Math.round((x - PAD.l) / ((d.Wp - PAD.l - d.padR) / (d.n - 1)))));
      const L = F.map((f) => ({ f, v: f.h[Math.min(i, f.h.length - 1)], p: i ? f.h[Math.min(i - 1, f.h.length - 1)] : null })).sort((a, b) => b.v - a.v);
      g = `<line x1="${d.X(i)}" x2="${d.X(i)}" y1="${PAD.t - 6}" y2="${d.H - PAD.b + 2}" class="lq-gd"/>` + L.map((o) => `<circle cx="${d.X(i)}" cy="${d.Y(o.v)}" r="6" fill="${col(o.f.id)}" stroke="var(--bg)" stroke-width="2.4"/>`).join('');
      h = `<b class="lq-tth">${d.lab(i)}</b>` + L.map((o) => `<div class="lq-ttr ${ST.bal === o.f.id ? 'on' : ''}"><i style="background:${col(o.f.id)}"></i><span>${esc(o.f.n)}</span><b class="num ${o.v < 0 ? 'neg' : ''}">${Nn(o.v)}</b></div>`).join('');
    } else {
      i = Math.max(0, Math.min(d.n - 1, Math.floor((x - PAD.l) / d.step)));
      const lista = d.todos ? [...F].sort((a, b) => d.val(b, i) - d.val(a, i)) : [d.quien];
      g = `<rect x="${PAD.l + d.step * i}" y="${PAD.t - 6}" width="${d.step}" height="${d.H - PAD.t - PAD.b + 8}" fill="#fff" opacity=".045" rx="6"/>`;
      h = `<b class="lq-tth">${i === d.n - 1 ? T('Esta semana', 'This week') : T('Semana ', 'Week ') + (i + 1)}</b>` + lista.map((f) => { const v = d.val(f, i); return `<div class="lq-ttr"><i style="background:${col(f.id)}"></i><span>${esc(f.n)}</span><b class="num ${v > 0 ? 'up' : v < 0 ? 'dn' : ''}">${v ? (v > 0 ? '▲ ' : '▼ ') + N(Math.abs(v)) : '·'}</b></div>` }).join('');
    }
    hv.innerHTML = g; tt.innerHTML = h; tt.hidden = false;
    const cw = host.getBoundingClientRect(), px = e.clientX - cw.left, tw = tt.offsetWidth, th = tt.offsetHeight;
    let left = px + 16; if (left + tw > cw.width - 4) left = px - tw - 16; left = Math.max(AXW + 2, Math.min(left, cw.width - tw - 2));
    tt.style.left = left + 'px'; tt.style.top = Math.max(4, Math.min(e.clientY - cw.top - th / 2, cw.height - th - 4)) + 'px';
  }
  const quita = (host) => { const tt = host.querySelector('.lq-tt'), hv = host.querySelector('[data-hv]'); if (tt) tt.hidden = true; if (hv) hv.innerHTML = '' };
  function redibuja(nombre) {   // cambia solo esa seccion, sin mover la pagina ni el scroll del grafico
    const cur = document.querySelector(`[data-lq-sec="${nombre}"]`); if (!cur) return;
    const sc = cur.querySelector('.lq-sc'), x = sc ? sc.scrollLeft : 0, t = document.createElement('div'); t.innerHTML = nombre === 'bal' ? SBAL() : SPF();
    const nu = t.firstElementChild; cur.replaceWith(nu); const s2 = nu.querySelector('.lq-sc'); if (s2) { s2.dataset.ini = '1'; s2.scrollLeft = x }
  }
  function encaja() {   // tras pintar: si el ancho no es el que se dibujo, se redibuja; y el grafico empieza por lo mas reciente
    const w = hostW();
    for (const n of ['bal', 'pf']) { const h = document.querySelector(`[data-lq="${n}"]`); if (h && Math.abs(+h.dataset.w - w) > 2) redibuja(n) }
    document.querySelectorAll('.lq-sc:not([data-ini])').forEach((s) => { s.dataset.ini = '1'; const k = s.parentElement.dataset.lq, v = SCX[k]; s.scrollLeft = v === undefined || v < 0 ? s.scrollWidth : v });
  }
  const SCX = {};   // por donde iba cada grafico (-1 = al final): al repintarse la pagina sigue donde estaba
  document.addEventListener('scroll', (e) => { const s = e.target; if (!s || !s.classList || !s.classList.contains('lq-sc') || !s.dataset.ini) return; SCX[s.parentElement.dataset.lq] = s.scrollWidth - s.clientWidth - s.scrollLeft < 4 ? -1 : s.scrollLeft }, true);
  const vw = document.getElementById('view');
  if (vw) new MutationObserver(() => { if (vw.querySelector('.lq-sc:not([data-ini])') || vw.querySelector('[data-lq]')) encaja() }).observe(vw, { childList: true });
  let rt = 0; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (document.querySelector('[data-lq]')) { document.querySelectorAll('[data-lq]').forEach((h) => DATA.delete(h)); encaja() } }, 150) });
  document.addEventListener('pointermove', (e) => { const h = e.target.closest && e.target.closest('[data-lq]'); if (!h || !e.target.closest('[data-hit]')) return; ponTip(h, e) });
  document.addEventListener('pointerdown', (e) => { const h = e.target.closest && e.target.closest('[data-lq]'); if (h && e.target.closest('[data-hit]')) ponTip(h, e); else document.querySelectorAll('[data-lq]').forEach(quita) });
  document.addEventListener('pointerout', (e) => { const h = e.target.closest && e.target.closest('[data-hit]'); if (h && e.pointerType === 'mouse' && !(e.relatedTarget && h.contains(e.relatedTarget))) quita(h.closest('[data-lq]')) });
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('[data-lq-sel],[data-lq-pf]'); if (!a) return;
    if (a.dataset.lqSel) { ST.bal = ST.bal === a.dataset.lqSel ? null : a.dataset.lqSel; redibuja('bal') }
    else { ST.pf = a.dataset.lqPf; redibuja('pf') }
  });

  window.GM_LIGA = { html };
})();
