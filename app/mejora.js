// Mejorar (upgrader), la cuarta pestana de Cajas. PM, 03-11: pones skins de tu inventario y/o V-Bucks, eliges un objeto que valga mas
// (de 1,25 a 100 veces) y la rueda dice si lo ganas. El azar y el dinero estan en la base (db/071_mejora.sql, cs_upgrade): aqui solo se pide
// y se pinta. La zona verde de la rueda es EXACTAMENTE la probabilidad del servidor y la aguja para EXACTAMENTE en su tirada (roll x 360 grados).
// cajas.js pinta un hueco [data-mejora] en la pestana y llama a GM_MEJORA.montar(hueco, GM_CAJAS.util) despues de cada repintado:
// el nodo de esta pantalla es siempre el mismo, asi que aunque Cajas repinte la rueda sigue girando.
// Textos: se escriben ya en el idioma elegido (L(es, en)); el nodo lleva data-notr para que i18n.js solo traduzca nombres de objetos.
'use strict';
(function () {
  const MIN_X = 1.25, MAX_X = 100, MAX_SKINS = 20, EDGE = 0.95, TOPE = 0.76;
  const PRESETS = [1.5, 2, 3, 5, 10];
  const PASO = 40;               // skins del inventario que se pintan de cada vez
  const DUR = 4200;              // lo que tarda la aguja
  const VUELTAS = 5;
  const WEAR_ES = ['Recién fabricado', 'Casi nuevo', 'Algo desgastado', 'Bastante desgastado', 'Deplorable'];
  const WEAR_EN = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'];

  let U = null, el = null;
  const M = { sel: new Set(), vb: 0, mult: 2, tgt: null, q: '', lista: null, listaK: '', cargaT: 0, inv: null, invN: PASO, fase: 'idle', res: null,
    ang: 0, ocupado: false, ult: null, err: null, base: true, aviso: '' };
  let anim = null, tTimer = 0;

  /* ---------- utilidades ---------- */
  const en = () => !!(window.GM_LANG && GM_LANG.get() === 'en');
  const L = (es, eng) => (en() ? eng : es);
  const lee = (k) => { try { return localStorage.getItem(k) } catch { return null } };
  const guarda = (k, v) => { try { localStorage.setItem(k, v) } catch {} };
  const ctx = () => (U && U.ctx()) || null;
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const N = (x) => String(Math.round(x || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, en() ? ',' : '.');
  const coin = () => '<span class="cn"></span>';
  const dec = (x, d) => Number(x).toFixed(d).replace('.', en() ? '.' : ',');
  const pct = (p) => dec(p * 100, 2) + ' %';
  const xTxt = (m) => '×' + dec(m, m >= 10 ? 1 : 2);
  const wear = (w) => (w == null ? '' : (en() ? WEAR_EN : WEAR_ES)[w] || '');
  const sonido = (d) => { try { window.dispatchEvent(new CustomEvent('gm:sonido', { detail: d })) } catch {} };
  const toast = (t) => { const c = ctx(); if (c && c.toast) c.toast(t) };
  const color = (r) => (U ? U.color(r) : '#4b69ff');
  const info = (id) => (U ? U.item(id) : { id, name: '·', rarity: 'mil' });
  // la misma cuenta que el servidor: 0,95 x lo que pones / lo que vale, con tope 76 % (a x1,25 sale justo eso)
  const chanceDe = (stake, tv) => (stake > 0 && tv > 0 ? Math.min(EDGE * stake / tv, TOPE) : 0);
  const multDeSlider = (s) => MIN_X * Math.pow(MAX_X / MIN_X, s / 1000);
  const sliderDeMult = (m) => Math.round((1000 * Math.log(m / MIN_X)) / Math.log(MAX_X / MIN_X));
  const saldo = () => { const c = ctx(); return c ? +c.saldo || 0 : 0 };
  const nombre = (it) => (U ? U.nombre(it) : { top: '', main: it.name || '·' });
  const pic = (img, s = 256) => (U ? U.pic(img, s) : '');
  {
    const m = parseFloat(lee('mj-mult'));
    if (m >= MIN_X && m <= MAX_X) M.mult = m;
  }

  // los mensajes del servidor, en ingles si hace falta
  const ERR_EN = {
    'Tienes que entrar primero': 'You need to log in first', 'Hay una skin repetida': 'A skin is in there twice', 'Como mucho 20 skins a la vez': 'At most 20 skins at a time',
    'Los V-Bucks no pueden ser negativos': 'V-Bucks cannot be negative', 'Ese objeto no se puede conseguir con una mejora': 'That item cannot be won with an upgrade',
    'Ese objeto no existe con ese desgaste': 'That item does not exist in that wear', 'Alguna de esas skins no es tuya o ya no está en tu inventario': 'Some of those skins are not yours or are no longer in your inventory',
    'Pon algo para mejorar: skins o V-Bucks': 'Put something in first: skins or V-Bucks', 'El objetivo tiene que valer al menos 1,25 veces lo que pones': 'The target has to be worth at least 1.25 times what you put in',
    'El objetivo puede valer como mucho 100 veces lo que pones': 'The target can be worth at most 100 times what you put in',
  };
  function msgErr(e) {
    const m = String((e && (e.message || e.error_description)) || L('Algo ha fallado', 'Something went wrong'));
    if (/Could not find the function|PGRST202|schema cache|cs_upgrade/i.test(m + (e && e.code))) { M.base = false; return L('Mejorar aún no está en la base: falta cargar db/071_mejora.sql.', 'The upgrader is not in the database yet: db/071_mejora.sql has to be loaded.') }
    if (!en()) return m;
    if (ERR_EN[m]) return ERR_EN[m];
    const s = m.match(/^No tienes saldo suficiente: te quedan ([\d.]+)$/);
    return s ? `Not enough balance: you have ${s[1].replace(/\./g, ',')} left` : m;
  }

  /* ---------- datos ---------- */
  async function cargaInv() {
    const c = ctx(); if (!c) return;
    M.invT = Date.now();
    try {
      const { data, error } = await c.db.from('cs_inv').select('id,item_id,wear,fl,st,value,created_at').eq('player', c.me).eq('status', 'own')
        .order('value', { ascending: false }).order('id', { ascending: false }).limit(3000);
      if (error) throw error;
      await U.asegura((data || []).map((i) => i.item_id));
      M.inv = data || [];
      // lo marcado que ya no esta (vendido en otra pestana, gastado...) se quita
      const hay = new Set(M.inv.map((i) => i.id));
      for (const id of [...M.sel]) if (!hay.has(id)) M.sel.delete(id);
      M.err = null;
    } catch (e) { M.err = msgErr(e); M.inv = M.inv || [] }
  }
  async function cargaUlt() {
    const c = ctx(); if (!c) return;
    try {
      const { data, error } = await c.db.from('cs_upgrades').select('id,player,item_id,wear,st,stake_value,target_value,chance,won,created_at')
        .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(10);
      if (error) throw error;
      await U.asegura((data || []).map((u) => u.item_id));
      M.ult = data || [];
    } catch { M.ult = [] }
  }
  // objetivos cerca de lo que pones x el multiplicador elegido (o por nombre)
  function rango() {
    const st = stake(); if (st < 1) return null;
    const lo = Math.ceil(st * MIN_X), hi = Math.floor(st * MAX_X), c = st * M.mult;
    let a = Math.max(lo, Math.floor(c * 0.85)), b = Math.min(hi, Math.ceil(c * 1.3));
    if (M.q) { a = lo; b = hi }
    if (a > b) { a = lo; b = Math.max(lo, hi) }
    return [a, b];
  }
  function pideTargets(ya) {
    clearTimeout(tTimer);
    const r = rango();
    if (!r) { M.lista = null; M.listaK = ''; return }
    const k = r.join('|') + '|' + M.q;
    if (k === M.listaK && M.lista) return pintaLista();
    tTimer = setTimeout(async () => {
      const n = ++M.cargaT, c = ctx(); if (!c) return;
      try {
        const { data, error } = await c.db.rpc('cs_upgrade_targets', { p_min: r[0], p_max: r[1], p_q: M.q || null, p_lim: 60 });
        if (error) throw error;
        if (n !== M.cargaT) return;
        let l = data || [];
        // sin buscar: los 60 mas cercanos al valor buscado, de menos a mas
        if (!M.q) { const obj = stake() * M.mult; l = l.slice().sort((x, y) => Math.abs(x.value - obj) - Math.abs(y.value - obj)).slice(0, 36).sort((x, y) => x.value - y.value) }
        M.lista = l; M.listaK = k; M.err = null;
      } catch (e) { if (n === M.cargaT) { M.lista = []; M.listaK = k; M.err = msgErr(e) } }
      pintaLista();
    }, ya ? 0 : 260);
  }

  /* ---------- cuentas ---------- */
  const elegidas = () => (M.inv || []).filter((i) => M.sel.has(i.id));
  const valorSkins = () => elegidas().reduce((a, i) => a + i.value, 0);
  const stake = () => valorSkins() + (M.vb || 0);
  // por que no se puede mejorar ahora (o '' si se puede)
  function falta() {
    const st = stake(), t = M.tgt;
    if (st < 1) return L('Elige qué pones: skins o V-Bucks', 'Pick what you put in: skins or V-Bucks');
    if (M.vb > saldo()) return L(`Tienes ${N(saldo())} V-Bucks`, `You have ${N(saldo())} V-Bucks`);
    if (!t) return L('Elige qué quieres conseguir', 'Pick what you want to get');
    const x = t.value / st;
    if (x < MIN_X) return L('El objetivo tiene que valer al menos 1,25 veces lo que pones', 'The target has to be worth at least 1.25 times what you put in');
    if (x > MAX_X) return L('El objetivo puede valer como mucho 100 veces lo que pones', 'The target can be worth at most 100 times what you put in');
    return '';
  }

  /* ---------- pintar ---------- */
  const W = 200, R0 = 84, C = 2 * Math.PI * R0;
  function rueda() {
    const st = stake(), t = M.tgt, fin = M.fase === 'fin' && M.res, gira = M.fase === 'gira';
    const p = M.res && (gira || fin) ? +M.res.chance : t ? chanceDe(st, t.value) : 0;
    const x = M.res && (gira || fin) ? M.res.target_value / M.res.stake_value : t && st ? t.value / st : 0;
    const marcas = Array.from({ length: 40 }, (_, i) => { const a = (i / 40) * 2 * Math.PI, r1 = i % 5 ? 96 : 94, r2 = 99;
      return `<line x1="${(100 + r1 * Math.sin(a)).toFixed(2)}" y1="${(100 - r1 * Math.cos(a)).toFixed(2)}" x2="${(100 + r2 * Math.sin(a)).toFixed(2)}" y2="${(100 - r2 * Math.cos(a)).toFixed(2)}"/>` }).join('');
    let centro;
    if (fin) {
      const g = !!M.res.won;
      centro = `<b class="mj-res ${g ? 'win' : 'lose'}">${g ? L('Has ganado', 'You won') : L('Has perdido', 'You lost')}</b>
        <span class="mj-roll">${L('Tirada', 'Roll')} ${dec(M.res.roll * 100, 2)} · ${L('ganabas por debajo de', 'you needed under')} ${dec(M.res.chance * 100, 2)}</span>`;
    } else if (gira) {
      centro = `<b class="mj-p">${pct(p)}</b><span class="mj-x">${xTxt(x)}</span>`;
    } else {
      centro = p ? `<b class="mj-p">${pct(p)}</b><span class="mj-x">${xTxt(x)} · ${L('probabilidad', 'chance')}</span>` : `<b class="mj-p dim">0 %</b><span class="mj-x">${L('probabilidad', 'chance')}</span>`;
    }
    return `<div class="mj-wheel ${gira ? 'gira' : ''} ${fin ? (M.res.won ? 'won' : 'lost') : ''}">
      <svg viewBox="0 0 ${W} ${W}" aria-hidden="true">
        <g class="mj-ticks">${marcas}</g>
        <circle class="mj-ring" cx="100" cy="100" r="${R0}"/>
        <circle class="mj-arc" cx="100" cy="100" r="${R0}" stroke-dasharray="${(C * p).toFixed(3)} ${C.toFixed(3)}" transform="rotate(-90 100 100)"/>
        <g class="mj-needle" data-mj-needle style="transform:rotate(${M.ang.toFixed(3)}deg)"><path d="M100 8 L106 30 L94 30 Z"/><line x1="100" y1="30" x2="100" y2="44"/></g>
      </svg>
      <div class="mj-c">${centro}</div>
      ${gira ? `<button class="mj-skip" data-mj="saltar">${L('Saltar', 'Skip')}</button>` : ''}
    </div>`;
  }
  function tile(it, ex) {
    const n = nombre(it), tag = ex.v != null ? 'button' : 'div';
    return `<${tag} class="cj-it mj-it ${ex.on ? 'on' : ''}" style="--c:${color(it.rarity)}" ${ex.v != null ? `data-mj="${ex.a}" data-v="${esc(ex.v)}"` : ''} title="${esc(it.name)}">
      <span class="cj-it-img">${pic(it.image)}</span>
      <span class="cj-it-t">${n.top ? `<span class="lab">${esc(n.top)}</span>` : ''}<b>${it.rarity === 'esp' && n.top ? '★ ' : ''}${esc(n.main)}</b>
        ${ex.meta ? `<em>${ex.meta}</em>` : ''}<span class="v">${N(ex.valor)}${coin()}</span></span></${tag}>`;
  }
  const meta = (w, st, lujo) => `${st ? '<i class="cj-st">StatTrak</i>' : ''}${w != null ? `<span>${wear(w)}</span>` : lujo ? '' : `<span>${L('Sin desgaste', 'No wear')}</span>`}`;
  const esLujo = (id) => (U ? U.esLujo(id) : false);

  function vPon() {
    const ys = elegidas(), st = stake(), off = M.fase === 'gira' || M.ocupado ? 'disabled' : '';
    const fotos = ys.slice(0, 4).map((i, k) => { const it = info(i.item_id); return `<span class="mj-st-i" style="--c:${color(it.rarity)};--k:${k}">${pic(it.image, 128)}</span>` }).join('');
    return `<section class="mj-side mj-pon">
      <span class="lab">${L('Lo que pones', 'What you put in')}</span>
      <div class="mj-st ${ys.length ? 'n' + Math.min(ys.length, 4) : 'vacio'}">${ys.length ? fotos + (ys.length > 4 ? `<em>+${ys.length - 4}</em>` : '') : `<span class="mj-st-0">${L('Toca skins de tu inventario', 'Tap skins in your inventory')}</span>`}</div>
      <b class="mj-v">${N(st)}${coin()}</b>
      <span class="mj-sub">${ys.length ? `${ys.length === 1 ? L('1 skin', '1 skin') : L(`${ys.length} skins`, `${ys.length} skins`)} ${N(valorSkins())}` : L('Sin skins', 'No skins')}${M.vb ? ` + ${N(M.vb)} V-Bucks` : ''}</span>
      <label class="mj-vb"><span>${L('Más V-Bucks', 'Add V-Bucks')}</span><input type="text" inputmode="numeric" data-mj-vb value="${M.vb ? M.vb : ''}" placeholder="0" ${off}></label>
      <div class="mj-chips">${[100, 500, 1000].map((v) => `<button class="chip" data-mj="vb+" data-v="${v}" ${off}>+${N(v)}</button>`).join('')}${M.vb || ys.length ? `<button class="chip" data-mj="limpia" ${off}>${L('Quitar todo', 'Clear all')}</button>` : ''}</div>
    </section>`;
  }
  function vQuiero() {
    const t = M.tgt;
    if (!t) return `<section class="mj-side mj-quiero"><span class="lab">${L('Lo que quieres', 'What you want')}</span>
      <div class="mj-tg vacio"><span class="mj-st-0">${L('Elige un objetivo en la lista', 'Pick a target from the list')}</span></div><b class="mj-v dim">0${coin()}</b><span class="mj-sub">&nbsp;</span></section>`;
    const n = nombre(t);
    return `<section class="mj-side mj-quiero" style="--c:${color(t.rarity)}"><span class="lab">${L('Lo que quieres', 'What you want')}</span>
      <div class="mj-tg">${pic(t.image, 360)}</div>
      <span class="mj-tn">${n.top ? `<em>${esc(n.top)}</em>` : ''}<b>${t.rarity === 'esp' && n.top ? '★ ' : ''}${esc(n.main)}</b></span>
      <span class="mj-sub mj-meta">${meta(t.wear, t.st, esLujo(t.id))}</span>
      <b class="mj-v">${N(t.value)}${coin()}</b>
      ${M.fase === 'fin' && M.res ? `<span class="mj-fin ${M.res.won ? 'win' : ''}">${M.res.won ? L('Ya es tuyo: está en tu inventario', 'It is yours: it is in your inventory') : L('Lo que pusiste se ha perdido', 'What you put in is gone')}</span>` : ''}</section>`;
  }
  function vCentro() {
    const f = falta(), gira = M.fase === 'gira', bloq = !!f || gira || M.ocupado || !M.base;
    const t = M.tgt, st = stake();
    return `<section class="mj-mid">${rueda()}
      <button class="go mj-go" data-mj="mejorar" ${bloq ? 'disabled' : ''}>${M.ocupado && !gira ? `<span>${L('Un momento…', 'One moment…')}</span>` : gira ? `<span>${L('Girando…', 'Spinning…')}</span>`
        : `<span>${L('Mejorar', 'Upgrade')}</span>${t && st && !f ? `<b>${pct(chanceDe(st, t.value))}</b>` : ''}`}</button>
      <p class="mj-why">${!M.base ? L('Mejorar aún no está en la base.', 'The upgrader is not in the database yet.') : f && !gira ? esc(f) : L('Lo verde es tu probabilidad exacta y la aguja para donde dice la tirada del servidor. La casa se queda un 5 %.', 'The green part is your exact chance and the needle stops where the server roll says. The house keeps 5 %.')}</p>
    </section>`;
  }
  function vInv() {
    if (!M.inv) return `<p class="hint">${L('Cargando tu inventario…', 'Loading your inventory…')}</p>`;
    if (!M.inv.length) return `<p class="hint">${L('No tienes skins. Puedes mejorar solo con V-Bucks.', 'You have no skins. You can upgrade with V-Bucks only.')}</p>`;
    const off = M.fase === 'gira' || M.ocupado;
    const ls = M.inv.slice(0, M.invN);
    return `<div class="mj-grid">${ls.map((i) => { const it = info(i.item_id); return tile(it, { a: off ? 'nada' : 'pon', v: i.id, on: M.sel.has(i.id), valor: i.value, meta: meta(i.wear, i.st, esLujo(i.item_id)) }) }).join('')}</div>
      ${M.inv.length > M.invN ? `<button class="chip mj-mas" data-mj="mas">${L(`Ver más (${N(M.inv.length - M.invN)})`, `See more (${N(M.inv.length - M.invN)})`)}</button>` : ''}`;
  }
  function vTargets() {
    const st = stake(), s = sliderDeMult(M.mult);
    const ctl = `<div class="mj-risk">
        <div class="mj-risk-h"><span>${L('Más probable', 'Safer')}</span><b>${xTxt(M.mult)}</b><span>${L('Más premio', 'Bigger prize')}</span></div>
        <input type="range" min="0" max="1000" step="1" value="${s}" data-mj-x aria-label="${L('Multiplicador', 'Multiplier')}">
        <div class="mj-chips">${PRESETS.map((p) => `<button class="chip ${Math.abs(M.mult - p) < 0.01 ? 'on' : ''}" data-mj="x" data-v="${p}">${xTxt(p)}</button>`).join('')}</div>
        <input class="mj-q" type="search" data-mj-q value="${esc(M.q)}" placeholder="${L('Buscar por nombre', 'Search by name')}">
      </div>`;
    return ctl + `<div data-mj-lista>${vLista()}</div>`;
  }
  function vLista() {
    const st = stake();
    let cuerpo;
    if (st < 1) cuerpo = `<p class="hint">${L('Elige primero qué pones y aquí salen objetos que valen más.', 'Pick what you put in first and items worth more show up here.')}</p>`;
    else if (!M.lista) cuerpo = `<p class="hint">${L('Buscando…', 'Searching…')}</p>`;
    else if (!M.lista.length && M.err) cuerpo = `<p class="hint mj-err">${esc(M.err)}</p>`;
    else if (!M.lista.length) cuerpo = `<p class="hint">${M.q ? L('Nada con ese nombre entre ×1,25 y ×100 de lo que pones.', 'Nothing with that name between ×1.25 and ×100 of what you put in.') : L('Nada en ese rango: mueve el riesgo.', 'Nothing in that range: move the risk.')}</p>`;
    else cuerpo = `<div class="mj-grid">${M.lista.map((t) => {
      const k = `${t.id}|${t.wear == null ? '' : t.wear}|${t.st ? 1 : 0}`, on = M.tgt && M.tgt.k === k;
      return tile(t, { a: 'tgt', v: k, on, valor: t.value, meta: meta(t.wear, t.st, esLujo(t.id)) + `<span class="mj-pc">${pct(chanceDe(st, t.value))}</span>` });
    }).join('')}</div>`;
    return cuerpo;
  }
  const buscaTxt = () => (stake() ? L(`Buscando cerca de ${N(stake() * M.mult)}`, `Looking around ${N(stake() * M.mult)}`) : '');
  function vUlt() {
    if (!M.ult || !M.ult.length) return '';
    const c = ctx(), jug = (id) => ((c && c.jugadores) || []).find((j) => j.id === id) || { n: '·' };
    return `<section class="mj-ult"><header class="cj-sec-h"><h3>${L('Últimas mejoras', 'Latest upgrades')}</h3></header>
      <ol>${M.ult.map((u) => { const it = info(u.item_id), n = nombre(it);
        return `<li class="${u.won ? 'won' : 'lost'}" style="--c:${color(it.rarity)}">${U && U.av ? U.av(u.player, 'sm') : ''}<span class="mj-u-n"><b>${esc(jug(u.player).n)}</b><em>${esc(n.top ? n.top + ' | ' + n.main : n.main)}${u.wear != null ? ' · ' + esc(wear(u.wear)) : ''}</em></span>
          <span class="mj-u-x"><span>${N(u.stake_value)} → ${N(u.target_value)}${coin()}</span><small>${pct(+u.chance)}</small></span><span class="mj-u-r">${u.won ? L('Ganada', 'Won') : L('Perdida', 'Lost')}</span></li>` }).join('')}</ol></section>`;
  }
  function html() {
    return `<div class="mj-stage">${vPon()}${vCentro()}${vQuiero()}</div>
      ${M.err ? `<p class="hint mj-err">${esc(M.err)}</p>` : ''}
      <div class="mj-pick">
        <section class="mj-col"><header class="mj-col-h"><h3>${L('Tu inventario', 'Your inventory')}</h3><span>${M.sel.size ? L(`${M.sel.size} de ${MAX_SKINS} como mucho`, `${M.sel.size} of ${MAX_SKINS} max`) : L('Toca para poner, hasta 20', 'Tap to put in, up to 20')}</span></header>${vInv()}</section>
        <section class="mj-col"><header class="mj-col-h"><h3>${L('Objetivo', 'Target')}</h3><span data-mj-busca>${buscaTxt() || '&nbsp;'}</span></header>${vTargets()}</section>
      </div>${vUlt()}`;
  }
  // repinta todo menos la aguja si esta girando (la mueve el bucle) y sin perder el foco de los campos
  function pinta() {
    if (!el) return;
    const foco = document.activeElement && el.contains(document.activeElement) ? (document.activeElement.matches('[data-mj-vb]') ? '[data-mj-vb]' : document.activeElement.matches('[data-mj-q]') ? '[data-mj-q]' : document.activeElement.matches('[data-mj-x]') ? '[data-mj-x]' : null) : null;
    const pos = foco && document.activeElement.selectionStart;
    el.innerHTML = html();
    if (window.GM_LANG) GM_LANG.traduce(el);
    if (foco) { const f = el.querySelector(foco); if (f) { f.focus(); try { if (pos != null && f.setSelectionRange) f.setSelectionRange(pos, pos) } catch {} } }
  }
  // solo la parte de arriba (al teclear V-Bucks o mover el riesgo no se rehace la lista)
  function pintaArriba() {
    if (!el) return;
    const s = el.querySelector('.mj-stage'); if (!s) return pinta();
    const foco = document.activeElement && s.contains(document.activeElement) && document.activeElement.matches('[data-mj-vb]');
    const pos = foco && document.activeElement.selectionStart;
    s.innerHTML = vPon() + vCentro() + vQuiero();
    if (window.GM_LANG) GM_LANG.traduce(s);
    if (foco) { const f = s.querySelector('[data-mj-vb]'); if (f) { f.focus(); try { f.setSelectionRange(pos, pos) } catch {} } }
  }

  // solo la lista de objetivos (al llegar del servidor): el deslizador y el buscador no se tocan mientras se usan
  function pintaLista() {
    if (!el) return;
    const l = el.querySelector('[data-mj-lista]'); if (!l) return pinta();
    l.innerHTML = vLista();
    const b = el.querySelector('[data-mj-busca]'); if (b) b.innerHTML = buscaTxt() || '&nbsp;';
    if (window.GM_LANG) GM_LANG.traduce(l);
  }

  /* ---------- la rueda ---------- */
  const ease = (t) => 1 - Math.pow(1 - t, 4);
  function gira(roll) {
    return new Promise((ok) => {
      const a0 = M.ang % 360, fin = VUELTAS * 360 + roll * 360, total = fin - a0, ini = performance.now();
      const sinAnim = document.documentElement.classList.contains('sin-anim');
      let seg = Math.floor(a0 / 30);
      anim = { saltar: sinAnim };
      const paso = (now) => {
        const t = anim.saltar ? 1 : Math.min(1, (now - ini) / DUR);
        M.ang = a0 + total * ease(t);
        const n = el && el.querySelector('[data-mj-needle]');
        if (n) n.style.transform = `rotate(${M.ang.toFixed(3)}deg)`;
        const s = Math.floor(M.ang / 30);
        if (s !== seg && !anim.saltar) { seg = s; sonido('caja-tic') }
        if (t < 1) requestAnimationFrame(paso);
        else { M.ang = fin % 360 + 0; anim = null; ok() }
      };
      requestAnimationFrame(paso);
    });
  }

  async function mejorar() {
    const c = ctx(); if (!c || M.ocupado || M.fase === 'gira' || falta()) return;
    // antes de pedir la mejora se vuelve a leer el inventario: lo que ya no esta (vendido, gastado en otra pestana) sale de lo puesto
    M.ocupado = true;
    const antes = M.sel.size; await cargaInv();
    if (M.sel.size !== antes) { M.ocupado = false; pideTargets(); pinta(); return toast(L('Alguna skin ya no está en tu inventario: la he quitado. Revisa lo que pones', 'Some skin is no longer in your inventory: I took it out. Check what you put in')) }
    const t = M.tgt, ids = [...M.sel], vb = M.vb || 0;
    if (!t || (!ids.length && vb < 1)) { M.ocupado = false; return pinta() }
    M.fase = 'idle'; M.res = null; pintaArriba();
    let r;
    try {
      const { data, error } = await c.db.rpc('cs_upgrade', { p_ids: ids, p_vb: vb, p_item: t.id, p_wear: t.wear, p_st: !!t.st });
      if (error) throw error;
      r = data;
    } catch (e) { M.ocupado = false; toast(esc(msgErr(e))); pinta(); return }
    // lo puesto ya no esta: se quita de la lista y de lo marcado
    M.inv = (M.inv || []).filter((i) => !M.sel.has(i.id)); M.sel.clear(); M.vb = 0;
    M.res = r; M.fase = 'gira'; M.ocupado = false;
    // la aguja empieza desde arriba, asi la vuelta entera se ve
    M.ang = M.ang % 360;
    pinta();
    await gira(+r.roll);
    M.fase = 'fin';
    if (r.won) sonido({ tipo: 'caja-final', rareza: t.rarity || 'cla' }); else sonido('perder');
    pinta();
    try { if (U.recarga) U.recarga() } catch {}
    try { if (c.refresh) await c.refresh() } catch {}
    await Promise.all([cargaInv(), cargaUlt()]);
    M.listaK = ''; pideTargets(true);
    pinta();
  }

  /* ---------- eventos ---------- */
  function onClick(e) {
    const b = e.target.closest('[data-mj]');
    if (!b || !el || !el.contains(b) || b.disabled) return;
    const a = b.dataset.mj, v = b.dataset.v;
    if (a !== 'saltar' && a !== 'nada' && M.fase === 'fin') { M.fase = 'idle'; M.res = null }
    switch (a) {
      case 'pon': {
        const id = +v;
        if (M.sel.has(id)) M.sel.delete(id);
        else { if (M.sel.size >= MAX_SKINS) return toast(L('Como mucho 20 skins a la vez', 'At most 20 skins at a time')); M.sel.add(id) }
        pideTargets(); return pinta();
      }
      case 'mas': M.invN += PASO; return pinta();
      case 'vb+': M.vb = Math.max(0, (M.vb || 0) + (+v || 0)); pideTargets(); return pinta();
      case 'limpia': M.sel.clear(); M.vb = 0; pideTargets(); return pinta();
      case 'x': M.mult = +v; guarda('mj-mult', String(M.mult)); pideTargets(true); return pinta();
      case 'tgt': {
        const [id, w, st] = v.split('|'), t = (M.lista || []).find((x) => x.id === id && String(x.wear == null ? '' : x.wear) === w && (x.st ? '1' : '0') === st);
        if (!t) return;
        M.tgt = M.tgt && M.tgt.k === v ? null : { ...t, k: v };
        return pinta();
      }
      case 'mejorar': return mejorar();
      case 'saltar': if (anim) anim.saltar = true; return;
    }
  }
  function onInput(e) {
    if (!el || !el.contains(e.target)) return;
    if (e.target.matches('[data-mj-vb]')) {
      const v = parseInt(String(e.target.value).replace(/[^\d]/g, ''), 10);
      M.vb = isFinite(v) ? Math.min(v, 1e9) : 0;
      if (M.fase === 'fin') { M.fase = 'idle'; M.res = null }
      pideTargets(); pintaArriba();
      // la lista de objetivos cambia con lo que pones: se rehace sola cuando llega
    } else if (e.target.matches('[data-mj-x]')) {
      M.mult = Math.round(multDeSlider(+e.target.value) * 100) / 100;
      guarda('mj-mult', String(M.mult));
      const h = el.querySelector('.mj-risk-h b'); if (h) h.textContent = xTxt(M.mult);
      el.querySelectorAll('[data-mj="x"]').forEach((c) => c.classList.toggle('on', Math.abs(M.mult - +c.dataset.v) < 0.01));
      pideTargets();
    } else if (e.target.matches('[data-mj-q]')) {
      M.q = String(e.target.value || '').trim().slice(0, 60);
      pideTargets();
    }
  }
  document.addEventListener('click', onClick);
  document.addEventListener('input', onInput);

  window.GM_MEJORA = {
    // hueco: el [data-mejora] que pinta cajas.js; u: GM_CAJAS.util
    montar(hueco, u) {
      U = u || U;
      if (!U) return;
      const nuevo = !el;
      if (!el) { el = document.createElement('div'); el.className = 'mj'; el.setAttribute('data-notr', '') }
      if (hueco && hueco !== el) hueco.replaceWith(el);
      if (nuevo || !M.inv) {
        pinta();
        Promise.all([cargaInv(), cargaUlt()]).then(() => { pideTargets(true); pinta() });
      } else {
        const escribe = () => document.activeElement && el.contains(document.activeElement) && document.activeElement.matches('input');
        if (!anim && !escribe()) pinta();
        // PM 04-11: "las skins que me acaban de tocar no estan en el upgrader". El inventario solo se leia la primera vez: al volver a la
        // pestana (o cuando Cajas repinta porque ha cambiado algo) se vuelve a leer, como mucho cada 2 s, para que entre lo que acaba de
        // salir y salga lo vendido o gastado
        if (!anim && M.fase !== 'gira' && Date.now() - (M.invT || 0) > 2000) cargaInv().then(() => { pideTargets(); if (!anim && !escribe()) pinta() });
      }
    },
    estado: () => ({ fase: M.fase, girando: !!anim }),
  };
})();
