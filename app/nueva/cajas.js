// Cajas de CS2 en Gambling Master: abrir cajas, el inventario de cada uno y batallas 1v1 y 2v2.
// El azar y el dinero los pone la base (db/007_cajas.sql); aqui solo se pide y se pinta.
// La app lo monta asi (ver CAJAS-INTEGRAR.md): R.cajas = () => GM_CAJAS.html() y, justo despues de pintar,
// GM_CAJAS.montar(vista, ctx, cambia). El nodo de la pantalla es siempre el mismo, asi que aunque la app
// repinte (cada minuto o cuando alguien mueve dinero) la ruleta sigue girando.
'use strict';
(function () {
  const CDN = 'https://community.akamai.steamstatic.com/economy/image/';
  const RAR = { esp: ['Especial', '#e4ae39'], cov: ['Encubierto', '#eb4b4b'], cla: ['Clasificado', '#d32ce6'], res: ['Restringido', '#8847ff'], mil: ['Grado militar', '#4b69ff'] };
  const ORDEN = ['esp', 'cov', 'cla', 'res', 'mil'];
  const PROB = { mil: '79,92 %', res: '15,98 %', cla: '3,2 %', cov: '0,64 %', esp: '0,26 %' };
  const WEAR = ['Recién fabricado', 'Casi nuevo', 'Algo desgastado', 'Bastante desgastado', 'Deplorable'];
  // solo para rellenar la ruleta: lo que sale de verdad lo decide el servidor
  const RELLENO = { mil: 60, res: 25, cla: 9, cov: 4, esp: 2 };
  const X_TRAMOS = [[0, 0.07, 0.03], [0.07, 0.15, 0.24], [0.15, 0.38, 0.33], [0.38, 0.45, 0.24], [0.45, 1, 0.16]];
  const CORTES = [0, 0.07, 0.15, 0.38, 0.45, 1.000001];
  const BARATA = 10;          // "elegir las baratas": las que valen menos de esto

  /* ---------- estado ---------- */
  let ctx = null, root = null;
  const S = { tab: 'abrir', caja: null, n: 1, rapido: lee('cj-rapido') === '1', quien: null, sel: new Set(), bat: null, nueva: null, res: null, sure: null, rep: null };
  const D = { cases: null, caja: new Map(), items: new Map(), st: null, bats: new Map(), err: null };
  let anim = null, pendiente = false, cargando = null, otraVez = false, ultima = 0, ocupado = false;

  /* ---------- utilidades ---------- */
  function lee(k) { try { return localStorage.getItem(k) } catch { return null } }
  function guarda(k, v) { try { localStorage.setItem(k, v) } catch {} }
  const N = (x) => String(Math.round(x || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const coin = () => '<span class="cn"></span>';
  const src = (p, s) => (!p ? '' : /^https?:/.test(p) ? p : `${CDN}${p}/${s}fx${s}f`);
  const pic = (p, s, cls = '', eager = false) => p ? `<img class="${cls}" src="${esc(src(p, s))}" alt="" ${eager ? '' : 'loading="lazy" '}decoding="async" onerror="this.style.visibility='hidden'">` : '';
  const color = (r) => (RAR[r] || RAR.mil)[1];
  const espera = (ms) => new Promise((ok) => setTimeout(ok, anim && anim.saltar ? 0 : ms));
  const quieto = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } };
  const flo = (f) => (f == null ? '' : Number(f).toFixed(4).replace('.', ','));
  const item = (id) => D.items.get(id) || { id, name: '·', rarity: 'mil' };
  // 'AK-47 | Redline' -> ['AK-47', 'Redline']; '★ Karambit' -> ['Karambit', 'Original']
  function partes(it) { const [w, k] = String(it.name || '·').split(' | '); return [w.replace(/^★ /, ''), (k || 'Original') + (it.phase ? ' · ' + it.phase : '')] }
  const jug = (id) => (ctx && ctx.jugadores.find((j) => j.id === id)) || { id, n: '·', color: 'pm' };
  const av = (id, cls = '') => { const j = jug(id); return `<span class="av ${esc(j.color)} ${j.photo ? 'ph' : ''} ${cls}" title="${esc(j.n)}">${esc(j.ini || String(j.n || '·').slice(0, 1).toUpperCase())}</span>` };
  const msgErr = (e) => {
    const m = (e && (e.message || e.error_description)) || 'Algo ha fallado';
    return /Could not find the function|PGRST202|cs_cases|schema cache/i.test(m + (e && e.code)) ? 'Las cajas aún no están en la base: falta cargar db/007_cajas.sql y 007b_cajas_datos.sql.' : m;
  };
  const avisa = (html) => ctx && ctx.toast && ctx.toast(html);
  const traduce = (el) => { if (window.GM_LANG && el) GM_LANG.traduce(el) };
  const vistas = () => { try { return JSON.parse(lee('cj-vistas') || '[]') } catch { return [] } };
  const visto = (id) => vistas().includes(id);
  const marcaVisto = (id) => { const v = vistas().filter((x) => x !== id); v.push(id); guarda('cj-vistas', JSON.stringify(v.slice(-200))) };
  function probW(minf, maxf) {
    if (minf == null) return [1, 0, 0, 0, 0];
    const p = [0, 0, 0, 0, 0];
    for (const [a, b, w] of X_TRAMOS) {
      const fa = minf + (maxf - minf) * a, fb = minf + (maxf - minf) * b, len = fb - fa;
      for (let t = 0; t < 5; t++) {
        if (len <= 0) { if (fa >= CORTES[t] && fa < CORTES[t + 1]) p[t] += w; continue }
        const lo = Math.max(fa, CORTES[t]), hi = Math.min(fb, CORTES[t + 1]);
        if (hi > lo) p[t] += (w * (hi - lo)) / len;
      }
    }
    return p;
  }
  // lo que vale normalmente: el precio del desgaste que mas sale
  function tipico(it) { if (!it.price) return null; const p = probW(it.minf == null ? null : +it.minf, +it.maxf); let k = 0; for (let w = 1; w < 5; w++) if (p[w] > p[k]) k = w; return it.price[k] }

  /* ---------- datos ---------- */
  async function rpc(fn, args) { const { data, error } = await ctx.db.rpc(fn, args); if (error) throw error; return data }
  async function asegura(ids) {
    const faltan = [...new Set(ids)].filter((id) => id && !D.items.has(id));
    for (let i = 0; i < faltan.length; i += 200) for (const it of (await rpc('cs_items_info', { p_ids: faltan.slice(i, i + 200) })) || []) D.items.set(it.id, it);
  }
  async function cargaCaja(id) {
    if (D.caja.has(id)) return D.caja.get(id);
    const c = await rpc('cs_case', { p_case: id });
    for (const it of c.items) D.items.set(it.id, it);
    c.por = {}; for (const it of c.items) (c.por[it.rarity] = c.por[it.rarity] || []).push(it);
    D.caja.set(id, c);
    return c;
  }
  async function cargaBat(id) {
    const b = await rpc('cs_battle', { p_id: id });
    for (const cid of new Set(b.cases)) await cargaCaja(cid);
    await asegura(b.drops.map((d) => d.inv.item));
    D.bats.set(id, b);
    return b;
  }
  async function cargar(fuerza) {
    if (!ctx) return;
    if (cargando) { if (fuerza) otraVez = true; return cargando }
    if (!fuerza && Date.now() - ultima < 1500) return;
    cargando = (async () => {
      try {
        if (!D.cases) D.cases = await rpc('cs_cases');
        const st = await rpc('cs_state', { p_player: S.quien || ctx.me });
        await asegura([...st.inv, ...st.feed].map((i) => i.item));
        D.st = st; D.err = null;
        if (S.caja) await cargaCaja(S.caja);
        if (S.bat) await cargaBat(S.bat);
      } catch (e) { D.err = msgErr(e) }
      ultima = Date.now(); cargando = null;
      pinta();
      if (otraVez) { otraVez = false; cargar(true) }
    })();
    return cargando;
  }

  /* ---------- pintar ---------- */
  function pinta(forzar) {
    if (!root) return;
    if (anim && !forzar) { pendiente = true; return }
    pendiente = false;
    root.innerHTML = vista();
    traduce(root);
    if (!anim && S.tab === 'batallas' && S.bat && !S.rep) {
      const b = D.bats.get(S.bat);
      if (b && b.status === 'done' && !visto(b.id)) repeticion(b);
    }
  }
  function vista() {
    const tabs = [['abrir', 'Abrir'], ['inventario', 'Inventario'], ['batallas', 'Batallas']];
    const cab = `<nav class="cj-tabs">${tabs.map(([k, n]) => `<button class="cj-tab ${S.tab === k ? 'on' : ''}" data-cj="tab" data-v="${k}">${n}</button>`).join('')}</nav>`;
    if (!D.st || !D.cases) return cab + `<p class="hint">${D.err ? esc(D.err) : 'Cargando…'}</p>`;
    return cab + (S.tab === 'abrir' ? vAbrir() : S.tab === 'inventario' ? vInv() : S.bat ? vBat() : vBatallas());
  }

  // una skin en rejilla: imagen sobre el color de su rareza, arma, nombre, desgaste y valor
  function tile(it, extra = {}) {
    const [w, k] = partes(it), tag = extra.boton ? 'button' : 'div';
    return `<${tag} class="cj-it ${extra.on ? 'on' : ''} ${it.rarity === 'esp' ? 'esp' : ''}" style="--c:${color(it.rarity)}" ${extra.boton || ''}>
      <span class="cj-it-img">${pic(it.image, 256)}</span>
      <span class="lab" data-notr>${esc(w)}</span>
      <b data-notr>${it.rarity === 'esp' ? '★ ' : ''}${esc(k)}</b>
      ${extra.meta ? `<em>${extra.meta}</em>` : ''}
      ${extra.valor != null ? `<span class="v">${N(extra.valor)}${coin()}</span>` : ''}
    </${tag}>`;
  }
  const metaInv = (i) => `${i.st ? '<i class="cj-st">StatTrak</i>' : ''}${i.wear != null ? WEAR[i.wear] : 'Sin desgaste'}`;

  /* ----- abrir ----- */
  function vAbrir() {
    const c = S.caja && D.cases.find((x) => x.id === S.caja);
    if (!c) return `<section class="cj-cases">${D.cases.map((x) => `<button class="cj-case" data-cj="caja" data-v="${esc(x.id)}">${pic(x.image, 256)}<span class="cj-case-n" data-notr>${esc(x.name)}</span><span class="cj-case-p">${N(x.price)}${coin()}</span></button>`).join('')}</section>${vFeed()}`;
    const info = D.caja.get(c.id);
    return `<button class="cj-back" data-cj="cajas">Todas las cajas</button>
      <section class="cj-stage" data-cj-stage>${S.res && S.res.caja === c.id ? vRes(c) : vHero(c)}</section>
      ${info ? vContenido(info) : '<p class="hint">Cargando lo que trae…</p>'}`;
  }
  function vHero(c) {
    const total = c.price * S.n, falta = ctx.saldo < total;
    return `<div class="cj-hero">
      <div class="cj-hero-img">${pic(c.image, 360, '', true)}</div>
      <div class="cj-hero-t">
        <h2 data-notr>${esc(c.name)}</h2>
        <div class="cj-odds">${ORDEN.slice().reverse().map((r) => `<span style="--c:${color(r)}"><i></i>${RAR[r][0]}<b>${PROB[r]}</b></span>`).join('')}</div>
        <div class="cj-ctl">
          <div class="cj-ns"><span class="lab">Cuántas</span>${[1, 2, 3, 4, 5].map((n) => `<button class="chip ${S.n === n ? 'on' : ''}" data-cj="n" data-v="${n}">${n}</button>`).join('')}</div>
          <button class="chip ${S.rapido ? 'on' : ''}" data-cj="rapido">Rápido</button>
        </div>
        <button class="go cj-go" data-cj="abrir" ${falta ? 'disabled' : ''}><span>${falta ? 'Sin saldo' : 'Abrir por'}</span><b>${N(total)}</b>${coin()}</button>
        ${falta ? `<p class="hint">Tienes ${N(ctx.saldo)}. La paga del lunes llega sola.</p>` : ''}
      </div></div>`;
  }
  function vRes(c) {
    const it = S.res.items, uno = it.length === 1, vivas = it.filter((i) => i.status !== 'sold');
    const suma = vivas.reduce((a, i) => a + i.value, 0), total = c.price * S.res.n, falta = ctx.saldo < total;
    const acciones = `<div class="cj-res-act">
      <button class="go" data-cj="abrir" ${falta ? 'disabled' : ''}><span>${uno ? 'Otra por' : 'Otras ' + it.length + ' por'}</span><b>${N(total)}</b>${coin()}</button>
      ${!uno && vivas.length > 1 ? `<button class="go ghost" data-cj="venderRes">${S.sure === 'res' ? '<span>¿Seguro? Toca otra vez</span>' : `<span>Vender todo por</span><b>${N(suma)}</b>${coin()}`}</button>` : ''}
      <button class="chip" data-cj="otra">Volver a la caja</button>
    </div>`;
    return `<div class="cj-res ${uno ? 'uno' : ''}">${it.map((i) => {
      const x = item(i.item), [w, k] = partes(x), vendida = i.status === 'sold';
      return `<div class="cj-drop ${x.rarity} ${vendida ? 'sold' : ''}" style="--c:${color(x.rarity)}">
        <div class="cj-drop-img">${pic(x.image, uno ? 512 : 360, '', true)}</div>
        <div class="cj-drop-t">
          <span class="lab" data-notr>${esc(w)}</span>
          <h3 data-notr>${x.rarity === 'esp' ? '★ ' : ''}${esc(k)}</h3>
          <p class="cj-meta">${i.st ? '<i class="cj-st">StatTrak</i>' : ''}<span>${i.wear != null ? WEAR[i.wear] : 'Sin desgaste'}</span>${i.float != null ? `<span class="cj-fl">${flo(i.float)}</span>` : ''}</p>
          <div class="cj-val">${N(i.value)}${coin()}</div>
          ${vendida ? '<span class="cj-sold">Vendida</span>' : `<button class="chip" data-cj="vender1" data-v="${i.id}">Vender</button>`}
          ${uno ? acciones : ''}
        </div>
      </div>`;
    }).join('')}</div>${uno ? '' : acciones}`;
  }
  function vContenido(info) {
    const out = [];
    for (const r of ORDEN) {
      const list = info.por[r]; if (!list) continue;
      if (r === 'esp') {
        const vistos = new Set(), unicos = list.filter((it) => { const k = it.name; if (vistos.has(k)) return false; vistos.add(k); return true });
        out.push(`<div class="cj-grp" style="--c:${color(r)}"><span class="cj-grp-h">★ Objeto especial<b>${PROB[r]}</b></span>
          <div class="cj-rare">${unicos.map((it) => { const [w, k] = partes({ name: it.name }); return `<span class="cj-rare-it" title="${esc(it.name)}">${pic(it.image, 128)}<em data-notr>${esc(w)}</em><small data-notr>${esc(k)}</small></span>` }).join('')}</div></div>`);
      } else {
        const orden = [...list].sort((a, b) => (tipico(b) || 0) - (tipico(a) || 0));
        out.push(`<div class="cj-grp" style="--c:${color(r)}"><span class="cj-grp-h">${RAR[r][0]}<b>${PROB[r]}</b></span>
          <div class="cj-grid">${orden.map((it) => tile(it, { valor: tipico(it) })).join('')}</div></div>`);
      }
    }
    return `<section class="cj-cont"><div class="cj-sec-h"><h3>Lo que trae</h3></div>${out.join('')}</section>`;
  }
  function vFeed() {
    const f = D.st.feed; if (!f.length) return '';
    return `<section><div class="cj-sec-h"><h3>Lo último que ha salido</h3></div><div class="cj-feed">${f.map((i) => {
      const x = item(i.item), [w, k] = partes(x);
      return `<span class="cj-fd" style="--c:${color(x.rarity)}" title="${esc(x.name)}">${pic(x.image, 256)}<span class="cj-fd-t">${av(i.by, 'sm')}<b data-notr>${esc(w)} · ${esc(k)}</b></span><span class="cj-fd-v">${N(i.value)}${coin()}</span></span>`;
    }).join('')}</div></section>`;
  }

  /* ----- inventario ----- */
  function vInv() {
    const quien = S.quien || ctx.me, mio = quien === ctx.me, st = D.st;
    const fila = `<div class="cj-pls">${st.players.map((p) => `<button class="cj-pl ${p.id === quien ? 'on' : ''}" data-cj="quien" data-v="${esc(p.id)}">${av(p.id, 'xl')}<span><b>${esc(jug(p.id).n)}</b><em>${N(p.value)}${coin()}</em></span></button>`).join('')}</div>`;
    if (st.who !== quien) return fila + '<p class="hint">Cargando…</p>';
    const inv = st.inv, total = inv.reduce((a, i) => a + i.value, 0);
    const sel = mio ? inv.filter((i) => S.sel.has(i.id)) : [], selV = sel.reduce((a, i) => a + i.value, 0);
    const baratas = mio ? inv.filter((i) => i.value < BARATA).length : 0;
    return `${fila}
      <div class="cj-inv-h">
        <div><span class="lab">${mio ? 'Tu inventario' : 'Su inventario'}</span><div class="cj-big">${N(total)}${coin()}</div><span class="cj-sub">${inv.length === 1 ? '1 skin' : N(inv.length) + ' skins'}</span></div>
        ${mio && inv.length ? `<div class="cj-tools"><span class="hint">Toca una skin para elegirla</span>${baratas ? `<button class="chip" data-cj="baratas">Elegir las de menos de ${BARATA}</button>` : ''}</div>` : ''}
      </div>
      ${inv.length ? `<div class="cj-grid cj-inv">${inv.map((i) => tile(item(i.item), { meta: metaInv(i), valor: i.value, on: S.sel.has(i.id), boton: mio ? `data-cj="sel" data-v="${i.id}"` : '' })).join('')}</div>`
        : `<p class="hint">${mio ? 'Aún no tienes skins. Abre una caja o gana una batalla.' : 'Todavía no tiene skins.'}</p>`}
      ${sel.length ? `<div class="cj-bar"><span class="cj-bar-l"><b>${sel.length === 1 ? '1 skin' : sel.length + ' skins'}</b><em>${N(selV)}${coin()}</em><button class="chip" data-cj="nosel">Quitar</button></span>
        <span class="cj-bar-b"><button class="go" data-cj="vender">${S.sure === 'inv' ? '<span>¿Seguro? Toca otra vez</span>' : `<span>Vender por</span><b>${N(selV)}</b>${coin()}`}</button></span></div>` : ''}`;
  }

  /* ----- batallas ----- */
  const tamDe = (b) => (b.mode === '1v1' ? 2 : 4);
  function vBatallas() {
    const bs = D.st.battles, abiertas = bs.filter((b) => b.status === 'open'), hechas = bs.filter((b) => b.status === 'done');
    return `${S.nueva ? vNueva() : `<div class="cj-bh"><p class="cj-lead">Cada uno abre las mismas cajas. El lado que saque más valor se lleva todas las skins.</p><button class="go" data-cj="nueva"><span>Crear batalla</span></button></div>`}
      <section><div class="cj-sec-h"><h3>Abiertas</h3></div>${abiertas.map(filaBat).join('') || '<p class="hint">Ninguna abierta ahora mismo.</p>'}</section>
      ${hechas.length ? `<section><div class="cj-sec-h"><h3>Terminadas</h3></div>${hechas.map(filaBat).join('')}</section>` : ''}`;
  }
  function asientos(b, unir) {
    const tam = tamDe(b), mitad = tam / 2, de = (s) => b.seats.find((x) => x.seat === s), dentro = b.seats.some((x) => x.player === ctx.me);
    const uno = (s) => {
      const x = de(s);
      if (x) return av(x.player, `xl ${b.status === 'done' && Math.floor(s / mitad) === b.winner ? 'cj-win' : ''}`);
      return unir && !dentro && b.status === 'open' && ctx.saldo >= b.cost ? `<button class="cj-seat" data-cj="unir" data-v="${b.id}|${s}" title="Unirme aquí">+</button>` : '<span class="cj-seat"></span>';
    };
    const lado = (t) => Array.from({ length: mitad }, (_, i) => uno(t * mitad + i)).join('');
    return `<div class="cj-seats">${lado(0)}<i>vs</i>${lado(1)}</div>`;
  }
  function filaBat(b) {
    const dentro = b.seats.some((x) => x.player === ctx.me), mio = b.by === ctx.me, nueva = b.status === 'done' && dentro && !visto(b.id);
    let act = '';
    if (b.status === 'open') {
      if (mio) act = `<button class="chip" data-cj="salir" data-v="${b.id}">${S.sure === 'salir' + b.id ? '¿Seguro? Toca otra vez' : 'Cancelar'}</button>`;
      else if (dentro) act = `<button class="chip" data-cj="salir" data-v="${b.id}">${S.sure === 'salir' + b.id ? '¿Seguro? Toca otra vez' : 'Salir'}</button>`;
      else act = ctx.saldo >= b.cost ? `<button class="go" data-cj="unir" data-v="${b.id}|"><span>Unirme</span></button>` : '<span class="hint">Sin saldo</span>';
    } else act = `<button class="chip ${nueva ? 'cj-nueva' : ''}" data-cj="ver" data-v="${b.id}">${nueva ? 'Ver el resultado' : 'Ver'}</button>`;
    return `<div class="cj-bt ${b.status}">
      <button class="cj-bt-m" data-cj="ver" data-v="${b.id}">${b.mode}</button>
      <button class="cj-bt-cases" data-cj="ver" data-v="${b.id}">${b.cases.map((cid) => pic((D.cases.find((c) => c.id === cid) || {}).image, 128)).join('')}</button>
      <span class="cj-bt-cost">${b.status === 'done' && b.totals ? `${N(b.totals[0])}<i>a</i>${N(b.totals[1])}` : `${N(b.cost)}${coin()}`}<em>${b.status === 'done' ? 'valor sacado' : 'por cabeza'}</em></span>
      ${asientos(b, true)}
      <span class="cj-bt-act">${act}</span>
    </div>`;
  }
  function vNueva() {
    const nv = S.nueva, cuesta = nv.cases.reduce((a, id) => a + ((D.cases.find((c) => c.id === id) || {}).price || 0), 0), falta = cuesta > ctx.saldo;
    return `<section class="cj-new">
      <div class="cj-sec-h"><h3>Nueva batalla</h3><button class="chip" data-cj="nueva-x">Cerrar</button></div>
      <div class="cj-modes">${['1v1', '2v2'].map((m) => `<button class="chip ${nv.mode === m ? 'on' : ''}" data-cj="modo" data-v="${m}">${m}</button>`).join('')}</div>
      <span class="lab">Toca una caja para añadir una ronda</span>
      <div class="cj-pick">${D.cases.map((c) => `<button class="cj-pk" data-cj="add" data-v="${esc(c.id)}" ${nv.cases.length >= 10 ? 'disabled' : ''} title="${esc(c.name)}">${pic(c.image, 128)}<span>${N(c.price)}${coin()}</span></button>`).join('')}</div>
      <div class="cj-rounds">${nv.cases.length ? nv.cases.map((id, i) => `<button class="cj-rnd" data-cj="quita" data-v="${i}" title="Quitar">${pic((D.cases.find((c) => c.id === id) || {}).image, 128)}<span>${i + 1}</span></button>`).join('') : '<span class="hint">Aún sin cajas. Hasta 10 rondas.</span>'}</div>
      <div class="cj-new-go">
        <button class="go" data-cj="crear" ${!nv.cases.length || falta ? 'disabled' : ''}><span>${falta ? 'Sin saldo' : 'Crear por'}</span><b>${N(cuesta)}</b>${coin()}</button>
        <span class="hint">${nv.cases.length ? 'Cada jugador paga lo mismo al unirse.' : ''}</span>
      </div>
    </section>`;
  }
  function vBat() {
    const b = D.bats.get(S.bat), atras = '<button class="cj-back" data-cj="batallas">Batallas</button>';
    if (!b) return atras + `<p class="hint">${D.err ? esc(D.err) : 'Cargando batalla…'}</p>`;
    const tam = tamDe(b), mitad = tam / 2, fin = b.status === 'done' && S.rep !== b.id, rep = S.rep === b.id;
    const drops = (s) => b.drops.filter((d) => d.seat === s).sort((x, y) => x.round - y.round);
    const totS = (s) => (fin ? drops(s).reduce((a, d) => a + d.inv.value, 0) : 0);
    const gan = b.seats.filter((x) => Math.floor(x.seat / mitad) === b.winner).map((x) => jug(x.player).n);
    const cab = `<div class="cj-bv-h">
      <div><span class="lab">Batalla ${b.mode}</span>
        <div class="cj-rd" data-cj-rd>${b.cases.map((cid, i) => `<span data-r="${i + 1}" class="${rep ? '' : 'on'}">${pic((D.cases.find((c) => c.id === cid) || {}).image, 128)}</span>`).join('')}</div></div>
      <div class="cj-bv-act">${rep ? '<button class="chip" data-cj="saltar">Saltar</button>' : fin ? '<button class="chip" data-cj="otravez">Ver otra vez</button>'
        : b.status === 'open' && b.seats.some((y) => y.player === ctx.me) ? `<button class="chip" data-cj="salir" data-v="${b.id}">${S.sure === 'salir' + b.id ? '¿Seguro? Toca otra vez' : b.by === ctx.me ? 'Cancelar' : 'Salir'}</button>` : ''}</div>
    </div>`;
    const tt = b.totals || [0, 0];
    const res = fin ? `<div class="cj-result"><h2>${gan.length > 1 ? 'Ganan ' + esc(gan.join(' y ')) : 'Gana ' + esc(gan[0] || '·')}</h2>
      <p><b>${N(tt[b.winner])}</b> contra ${N(tt[1 - b.winner])} · se ${gan.length > 1 ? 'llevan' : 'lleva'} las ${b.drops.length} skins</p></div>`
      : b.status === 'open' ? `<p class="cj-lead">Esperando ${tam - b.seats.length === 1 ? 'a 1 jugador' : 'a ' + (tam - b.seats.length) + ' jugadores'}. Se abre sola al llenarse.</p>` : '';
    const fila = (s) => {
      const x = b.seats.find((y) => y.seat === s);
      if (!x) return `<div class="cj-sr vacio"><div class="cj-sr-h">${b.status === 'open' && !b.seats.some((y) => y.player === ctx.me) && ctx.saldo >= b.cost ? `<button class="cj-seat" data-cj="unir" data-v="${b.id}|${s}">+</button><b>Unirme aquí</b>` : '<span class="cj-seat"></span><b class="cj-dim">Libre</b>'}</div></div>`;
      return `<div class="cj-sr" data-seat="${s}">
        <div class="cj-sr-h">${av(x.player, 'xl')}<b>${esc(jug(x.player).n)}</b>${b.status === 'open' ? '' : `<span class="cj-sr-tot"><span data-tot="${s}">${N(totS(s))}</span>${coin()}</span>`}</div>
        <div class="cj-sr-stage" data-st="${s}"></div>
        <div class="cj-haul" data-haul="${s}">${fin ? drops(s).map((d) => haulIt(d.inv)).join('') : ''}</div>
      </div>`;
    };
    const lado = (t) => `<div class="cj-team ${fin ? (b.winner === t ? 'win' : 'lose') : ''}" data-team="${t}">${Array.from({ length: mitad }, (_, i) => fila(t * mitad + i)).join('')}</div>`;
    return `${atras}${cab}${res}<div class="cj-arena m${tam}">${lado(0)}<span class="cj-vs">VS</span>${lado(1)}</div>`;
  }
  function haulIt(i) { const x = item(i.item); return `<span class="cj-h-it" style="--c:${color(x.rarity)}" title="${esc(x.name)}">${pic(x.image, 128)}<em>${N(i.value)}</em></span>` }

  /* ---------- la ruleta ---------- */
  function relleno(info) {
    const hay = ORDEN.filter((r) => info.por[r]), tot = hay.reduce((a, r) => a + RELLENO[r], 0);
    let x = Math.random() * tot, r = hay[hay.length - 1];
    for (const k of hay) { if (x < RELLENO[k]) { r = k; break } x -= RELLENO[k] }
    const l = info.por[r]; return l[(Math.random() * l.length) | 0];
  }
  // como en el juego: un cuchillo o unos guantes salen en la ruleta como una estrella dorada
  const carta = (it) => it.rarity === 'esp' ? '<div class="cj-k esp"><span>★</span></div>' : `<div class="cj-k" style="--c:${color(it.rarity)}">${pic(it.image, 256, '', true)}</div>`;
  function girar(el, info, inv, dur) {
    if (!el) return Promise.resolve();
    const G = 46, cartas = [];
    for (let i = 0; i < 54; i++) cartas.push(i === G ? item(inv.item) : relleno(info));
    el.innerHTML = `<div class="cj-strip"><div class="cj-track">${cartas.map(carta).join('')}</div><i class="cj-mark"></i></div>`;
    const strip = el.firstElementChild, track = strip.firstElementChild, k = track.children[G], w = strip.clientWidth;
    if (!el.isConnected || !w) { track.style.transform = 'none'; k.classList.add('gana'); return Promise.resolve() }
    const dx = k.offsetLeft + k.offsetWidth / 2 - w / 2 + (Math.random() - 0.5) * k.offsetWidth * 0.6;
    const a = track.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${-dx}px)` }], { duration: quieto() ? 0 : dur, easing: 'cubic-bezier(.08,.6,.12,1)', fill: 'forwards' });
    if (anim) anim.anims.push(a);
    return a.finished.then(() => k.classList.add('gana'), () => k.classList.add('gana'));
  }
  function para() { if (!anim) return; anim.saltar = true; for (const a of anim.anims) { try { a.finish() } catch {} } }

  async function abrir() {
    if (anim || ocupado) return;
    const c = D.cases.find((x) => x.id === S.caja), info = D.caja.get(S.caja);
    if (!c || !info) return;
    if (c.price * S.n > ctx.saldo) return avisa('No tienes saldo suficiente');
    ocupado = true;
    root.querySelectorAll('[data-cj=abrir]').forEach((b) => { b.disabled = true });
    let r;
    try { r = await rpc('cs_open', { p_case: c.id, p_n: S.n }) } catch (e) { ocupado = false; pinta(); return avisa(esc(msgErr(e))) }
    ocupado = false;
    // la imagen grande del premio se va bajando mientras gira
    for (const i of r.items) { const im = new Image(); im.decoding = 'async'; im.src = src(item(i.item).image, r.items.length === 1 ? 512 : 360) }
    S.res = null; S.sure = null;
    anim = { anims: [], saltar: false };
    pinta(true);    // la caja con su sitio para la ruleta
    const stage = root.querySelector('[data-cj-stage]');
    if (stage) {
      if (stage.isConnected && stage.getBoundingClientRect().top < 64) stage.scrollIntoView({ block: 'start', behavior: quieto() ? 'auto' : 'smooth' });
      stage.innerHTML = `<div class="cj-spin">${r.items.map((_, i) => `<div class="cj-spin-row" data-row="${i}"></div>`).join('')}<button class="chip cj-skip" data-cj="saltar">Saltar</button></div>`;
      traduce(stage);
      const dur = S.rapido ? 1400 : 5600;
      await Promise.all(r.items.map((inv, i) => girar(stage.querySelector(`[data-row="${i}"]`), info, inv, dur + i * 330)));
      await espera(S.rapido ? 250 : 750);
    }
    anim = null;
    S.res = { caja: c.id, n: S.n, items: r.items };
    pinta();
    const top = r.items.reduce((a, i) => (i.value > a.value ? i : a), r.items[0]);
    if (item(top.item).rarity === 'esp') avisa(`¡${esc(item(top.item).name)}! <b>${N(top.value)}</b>`);
    if (ctx.refresh) ctx.refresh();
    cargar(true);
  }

  async function repeticion(b) {
    if (anim || !b || b.status !== 'done') return;
    marcaVisto(b.id);
    const tam = tamDe(b), mitad = tam / 2, vel = S.rapido ? 0.32 : 1;
    anim = { anims: [], saltar: false };
    S.rep = b.id; pinta(true);
    const tot = [0, 0, 0, 0];
    for (let r = 1; r <= b.cases.length && !anim.saltar; r++) {
      root.querySelectorAll('[data-cj-rd] [data-r]').forEach((e) => e.classList.toggle('on', +e.dataset.r <= r));
      const info = D.caja.get(b.cases[r - 1]);
      const ronda = b.drops.filter((d) => d.round === r);
      await Promise.all(ronda.map((d, i) => girar(root.querySelector(`[data-st="${d.seat}"]`), info, d.inv, 3600 * vel + i * 140)));
      for (const d of ronda) {
        tot[d.seat] += d.inv.value;
        const h = root.querySelector(`[data-haul="${d.seat}"]`); if (h) h.insertAdjacentHTML('beforeend', haulIt(d.inv));
        const t = root.querySelector(`[data-tot="${d.seat}"]`); if (t) t.textContent = N(tot[d.seat]);
      }
      // quien va ganando
      const eq = [0, 1].map((t) => tot.slice(t * mitad, t * mitad + mitad).reduce((a, v) => a + v, 0));
      root.querySelectorAll('[data-team]').forEach((e) => e.classList.toggle('va', eq[+e.dataset.team] > eq[1 - +e.dataset.team]));
      await espera(500 * vel);
    }
    anim = null; S.rep = null;
    pinta();
    if (ctx.refresh) ctx.refresh();
    cargar(true);
  }

  /* ---------- acciones ---------- */
  function seguro(clave) {
    if (S.sure === clave) { S.sure = null; return true }
    S.sure = clave; pinta();
    setTimeout(() => { if (S.sure === clave) { S.sure = null; pinta() } }, 3500);
    return false;
  }
  async function hazlo(fn) {
    if (ocupado) return null;
    ocupado = true;
    try { return await fn() } catch (e) { avisa(esc(msgErr(e))); return null } finally { ocupado = false }
  }
  async function vender(ids) {
    const r = await hazlo(() => rpc('cs_sell', { p_ids: ids }));
    if (!r) return;
    if (S.res) for (const i of S.res.items) if (ids.includes(i.id)) i.status = 'sold';
    for (const id of ids) S.sel.delete(id);
    avisa(`${r.vendidas === 1 ? 'Vendida' : 'Vendidas ' + r.vendidas} por <b>${N(r.total)}</b>`);
    pinta();
    if (ctx.refresh) ctx.refresh();
    cargar(true);
  }
  async function unir(id, seat) {
    const r = await hazlo(() => rpc('cs_battle_join', { p_id: id, p_seat: seat }));
    if (!r) return;
    S.tab = 'batallas'; S.bat = id; S.nueva = null;
    avisa(r.done ? 'Batalla llena: se abren las cajas' : 'Estás dentro');
    if (ctx.refresh) ctx.refresh();
    await cargar(true);
  }

  async function onClick(e) {
    const t = e.target.closest('[data-cj]');
    if (!t || !root || !root.contains(t) || t.disabled) return;
    const a = t.dataset.cj, v = t.dataset.v;
    const navega = ['tab', 'cajas', 'batallas', 'ver', 'quien', 'caja'];
    if (anim && navega.includes(a)) para();
    switch (a) {
      case 'tab':
        if (S.tab === v) { if (v === 'abrir') { S.caja = null; S.res = null } if (v === 'batallas') { S.bat = null; S.nueva = null } }
        S.tab = v; S.sure = null; if (v !== 'batallas') S.bat = null;
        return pinta();
      case 'caja': S.caja = v; S.res = null; pinta(); try { await cargaCaja(v) } catch (err) { avisa(esc(msgErr(err))) } return pinta();
      case 'cajas': S.caja = null; S.res = null; return pinta();
      case 'n': S.n = +v; return pinta();
      case 'rapido': S.rapido = !S.rapido; guarda('cj-rapido', S.rapido ? '1' : '0'); return pinta();
      case 'abrir': return abrir();
      case 'saltar': return para();
      case 'otra': S.res = null; return pinta();
      case 'vender1': return vender([+v]);
      case 'venderRes': if (!seguro('res')) return; return vender(S.res.items.filter((i) => i.status !== 'sold').map((i) => i.id));
      case 'quien': S.quien = v === ctx.me ? null : v; S.sel.clear(); S.sure = null; pinta(); return cargar(true);
      case 'sel': { const id = +v; if (S.sel.has(id)) S.sel.delete(id); else S.sel.add(id); S.sure = null; return pinta() }
      case 'baratas': for (const i of D.st.inv) if (i.value < BARATA) S.sel.add(i.id); return pinta();
      case 'nosel': S.sel.clear(); S.sure = null; return pinta();
      case 'vender': if (!S.sel.size || !seguro('inv')) return; return vender([...S.sel]);
      case 'nueva': S.nueva = { mode: '1v1', cases: [] }; return pinta();
      case 'nueva-x': S.nueva = null; return pinta();
      case 'modo': S.nueva.mode = v; return pinta();
      case 'add': if (S.nueva.cases.length < 10) S.nueva.cases.push(v); return pinta();
      case 'quita': S.nueva.cases.splice(+v, 1); return pinta();
      case 'crear': {
        const nv = S.nueva; if (!nv || !nv.cases.length) return;
        const r = await hazlo(() => rpc('cs_battle_create', { p_mode: nv.mode, p_cases: nv.cases }));
        if (!r) return;
        S.nueva = null; S.bat = r.id; avisa('Batalla creada: falta que se unan');
        if (ctx.refresh) ctx.refresh();
        return cargar(true);
      }
      case 'unir': { const [id, s] = v.split('|'); return unir(+id, s === '' ? null : +s) }
      case 'salir': {
        if (!seguro('salir' + v)) return;
        const r = await hazlo(() => rpc('cs_battle_leave', { p_id: +v }));
        if (!r) return;
        avisa(`Te devuelvo <b>${N(r.devuelto)}</b>`);
        if (S.bat === +v) S.bat = null;
        if (ctx.refresh) ctx.refresh();
        return cargar(true);
      }
      case 'ver': S.tab = 'batallas'; S.bat = +v; S.nueva = null; pinta(); try { await cargaBat(+v) } catch (err) { avisa(esc(msgErr(err))) } return pinta();
      case 'batallas': S.bat = null; return pinta();
      case 'otravez': { const b = D.bats.get(S.bat); if (b) { const v2 = vistas().filter((x) => x !== b.id); guarda('cj-vistas', JSON.stringify(v2)); repeticion(b) } return }
    }
  }
  document.addEventListener('click', onClick);

  window.GM_CAJAS = {
    html: () => '<div data-cajas></div>',
    // el: la vista de la app (o el hueco [data-cajas]); c: { db, me, jugadores, saldo, toast, refresh }; nueva: se acaba de entrar en la pantalla
    montar(el, c, nueva) {
      ctx = c;
      if (!root) { root = document.createElement('div'); root.className = 'cj'; pinta() }
      const hueco = el && (el.matches && el.matches('[data-cajas]') ? el : el.querySelector('[data-cajas]'));
      if (hueco) hueco.replaceWith(root); else if (el && !root.isConnected) el.appendChild(root);
      if (nueva) { root.classList.remove('cj-in'); void root.offsetWidth; root.classList.add('cj-in') }
      else if (!anim && pendiente) pinta();
      cargar();
    },
    estado: () => ({ tab: S.tab, girando: !!anim }),
  };
})();
