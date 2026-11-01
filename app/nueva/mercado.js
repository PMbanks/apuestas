// Mercado de Gambling Addicts: intercambios entre colegas, mercado pequeno, contratos (10 -> 1), jackpot y tus cosmeticos
// (marcos para la foto, fondos para la app y objetos de coleccion). El azar y el dinero los pone la base (db/020_mercado.sql):
// aqui solo se pide ("propongo esto", "compro esto", "firmo el contrato") y se pinta lo que devuelve.
// La app lo monta asi (ver MERCADO-INTEGRAR.md): R.mercado = () => GM_MERCADO.html(ctx) y, justo despues de pintar,
// GM_MERCADO.montar(vista, ctx, cambia). Ademas GM_MERCADO.aplicaCosmeticos(ctx) tras cada load: pinta los marcos y el fondo de todos.
// El nodo de la pantalla es siempre el mismo, asi que aunque la app repinte, el sorteo del jackpot sigue girando.
// Sin bucles de fondo: un temporizador de 1 s solo corre con una cuenta atras del jackpot a la vista, y una consulta cada 5 s solo con una ronda viva.
'use strict';
(function () {
  /*ESTILOS*/
  // Como se ve cada marco (aro de la foto de perfil) y cada fondo (fondo de la app). La clave es la de cos_def.clave (db/020b).
  // Lo lee tambien sync/cosmeticos-datos.mjs para dibujar las miniaturas SVG: si cambias un color, vuelve a lanzarlo.
  const MARCOS = {
    'aro-blanco': ['aro', '#f4f2ec'], 'aro-cian': ['aro', '#4fd6e8'], 'aro-rosa': ['aro', '#ff7ab8'], 'aro-lima': ['aro', '#b7e34a'],
    'doble-aro': ['doble', '#f2c14e', '#4d88e6'],
    'neon-azul': ['neon', '#3d8bff'], 'neon-rosa': ['neon', '#ff3ea5'],
    'oro': ['grad', ['#fff3b0', '#e6b422', '#8a6414', '#ffe27a', '#c9951a', '#fff3b0'], '#f2c14e'],
    'plata': ['grad', ['#ffffff', '#9aa5b1', '#e8edf2', '#6b7683', '#ffffff'], '#c9d2dc'],
    'arcoiris': ['grad', ['#ff5d5d', '#ffb74d', '#ffee58', '#4cd964', '#4fc3f7', '#7e57c2', '#ff5d5d'], ''],
    'fuego': ['grad', ['#ffd54a', '#ff7a1a', '#d92b0b', '#ff7a1a', '#ffd54a'], '#ff6a1a'],
    'hielo': ['grad', ['#ffffff', '#9be7ff', '#3fb2ff', '#c9f3ff', '#ffffff'], '#6fd3ff'],
    'diamante': ['gema', ['#ffffff', '#9be7ff', '#e6f7ff', '#7fd0ff', '#ffffff'], '#9be7ff'],
    'corona': ['gema', ['#fff3b0', '#e6b422', '#fff3b0', '#c9951a', '#fff3b0'], '#f2c14e'],
  };
  const FONDOS = {
    'medianoche': { ang: 160, c: ['#0a0f1f', '#1b2547'], glow: [[78, 8, '#3b4f9a', 60]] },
    'ceniza': { ang: 150, c: ['#1b1d22', '#3a3d46'], glow: [[20, 90, '#555a66', 55]] },
    'oceano': { ang: 170, c: ['#04202e', '#0c5a73'], glow: [[85, 95, '#17a3b8', 50]] },
    'atardecer': { ang: 180, c: ['#2a1a4a', '#c2417a', '#f59e4c'], glow: [[50, 100, '#ffd27a', 45]] },
    'aurora': { ang: 160, c: ['#071a2b', '#0b3d3a'], glow: [[25, 20, '#2bd47d', 55], [75, 30, '#4d88e6', 50]] },
    'miami': { ang: 135, c: ['#1b0b3a', '#ff3ea5'], glow: [[85, 15, '#3de3ff', 50], [10, 95, '#ff3ea5', 45]] },
    'galaxia': { ang: 150, c: ['#07051a', '#2a0f5a'], glow: [[20, 25, '#7e57c2', 45], [80, 75, '#cc6496', 45], [60, 15, '#3d8bff', 30]] },
    'ciber': { ang: 120, c: ['#0b0b16', '#17103a'], glow: [[10, 10, '#00f0ff', 40], [90, 90, '#ff2bd6', 45]] },
    'lava': { ang: 180, c: ['#1a0502', '#7a1a05'], glow: [[50, 105, '#ff7a1a', 60], [20, 80, '#ffb347', 35]] },
    'boreal': { ang: 170, c: ['#041a14', '#0a3a52'], glow: [[30, 10, '#4dff9b', 55], [70, 25, '#7ee0ff', 45], [55, 50, '#7e57c2', 35]] },
    'oro-liquido': { ang: 140, c: ['#2a1c05', '#a8761a', '#f2c14e'], glow: [[75, 20, '#fff3b0', 40], [15, 85, '#c9951a', 45]] },
  };
  /*FIN ESTILOS*/

  // las declaraciones del ::after de un marco (el aro va por fuera de la foto; --fw es su grosor)
  const RING = 'content:"";position:absolute;inset:calc(var(--fw,3px)*-1);border-radius:50%;pointer-events:none;';
  const MASK = '-webkit-mask:radial-gradient(farthest-side,#0000 calc(100% - var(--fw,3px)),#000 calc(100% - var(--fw,3px) + .6px));mask:radial-gradient(farthest-side,#0000 calc(100% - var(--fw,3px)),#000 calc(100% - var(--fw,3px) + .6px));';
  function marcoDecl(clave) {
    const m = MARCOS[clave];
    if (!m) return '';
    const [t, a, b] = m;
    if (t === 'aro') return `${RING}border:var(--fw,3px) solid ${a};`;
    if (t === 'doble') return `${RING}border:var(--fw,3px) solid ${a};box-shadow:0 0 0 calc(var(--fw,3px)*.45) var(--bg,#1d2129),0 0 0 calc(var(--fw,3px)*1.45) ${b};`;
    if (t === 'neon') return `${RING}border:var(--fw,3px) solid ${a};box-shadow:0 0 5px ${a},0 0 13px ${a},inset 0 0 5px ${a};`;
    const brillo = b ? `filter:drop-shadow(0 0 3px ${b});` : '';
    const conico = `conic-gradient(from 25deg,${a.join(',')})`;
    if (t === 'grad') return `${RING}background:${conico};${MASK}${brillo}`;
    // gema: el mismo aro con cuatro piedras blancas
    const p = 'calc(var(--fw,3px)*.5)', d = 'calc(var(--fw,3px)*.46)', e = 'calc(var(--fw,3px)*.52)';
    const gema = (pos) => `radial-gradient(circle at ${pos},#fff 0 ${d},#fff0 ${e})`;
    return `${RING}background:${gema(`50% ${p}`)},${gema(`calc(100% - ${p}) 50%`)},${gema(`50% calc(100% - ${p})`)},${gema(`${p} 50%`)},${conico};${MASK}${brillo}`;
  }
  function fondoCss(clave) {
    const f = FONDOS[clave];
    if (!f) return '';
    return [...(f.glow || []).map(([x, y, c, r]) => `radial-gradient(circle at ${x}% ${y}%,${c},transparent ${r}%)`), `linear-gradient(${f.ang}deg,${f.c.join(',')})`].join(',');
  }

  const CDN = 'https://community.akamai.steamstatic.com/economy/image/';
  const RAR = { esp: ['Especial', '#e4ae39'], cov: ['Encubierto', '#eb4b4b'], cla: ['Clasificado', '#d32ce6'], res: ['Restringido', '#8847ff'], mil: ['Grado militar', '#4b69ff'] };
  const ORDEN = ['mil', 'res', 'cla', 'cov', 'esp'];
  const WEAR = ['Recién fabricado', 'Casi nuevo', 'Algo desgastado', 'Bastante desgastado', 'Deplorable'];
  const TABS = [['tratos', 'Intercambios'], ['mercado', 'Mercado'], ['contratos', 'Contratos'], ['jackpot', 'Jackpot'], ['cos', 'Mis cosméticos']];
  const FAM = { skin: 'skins de CS2', lujo: 'objetos de lujo', cos: 'cosméticos' };
  const FIN_JP = 60;         // segundos de la cuenta atras del jackpot (los pone la base: aqui solo se pinta)

  /* ---------- estado ---------- */
  let ctx = null, root = null, main = null, host = null;
  const S = {
    tab: (() => { const t = lee('mk-tab'); return TABS.some((x) => x[0] === t) ? t : 'tratos' })(),
    para: null, da: [], pide: [], daVb: '', pideVb: '', nota: '',          // el trato que se esta armando
    con: [],                                                              // las piezas del contrato
    jpVb: '100', jpInv: [],                                               // lo que se mete al jackpot
    pk: null,                                                             // el selector de piezas abierto
    busy: 0, aviso: '', err: null, press: 0, anim: false, vistoJp: parseInt(lee('mk-jp-visto'), 10) || 0,
    rev: null,                                                            // el resultado de un contrato que se esta enseñando
    jpRot: 0, jpGiro: null,
  };
  const D = { est: null, cos: null, inv: new Map(), iss: new Map() };
  const T = { off: 0 };
  let ultima = 0, pend = false, tCarga = 0, tSeg = 0, tPoll = 0, cargaId = 0, eqCache = null, eqAt = 0, eqId = 0;

  /* ---------- utilidades ---------- */
  function lee(k) { try { return localStorage.getItem(k) } catch { return null } }
  function guarda(k, v) { try { localStorage.setItem(k, String(v)) } catch {} }
  const N = (x) => String(Math.round(x || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, document.documentElement.lang === 'en' ? ',' : '.');
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const coin = () => '<span class="cn"></span>';
  const ahora = () => Date.now() + T.off;
  const ms = (t) => Date.parse(t);
  const visible = () => !!(root && root.isConnected && !document.hidden);
  const quieto = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } };
  const espera = (t) => new Promise((ok) => setTimeout(ok, t));
  const toast = (h) => { if (ctx && ctx.toast) ctx.toast(h) };
  const tr = (el) => { if (window.GM_LANG && el) GM_LANG.traduce(el) };
  const jug = (u) => (ctx && ctx.jugadores.find((j) => j.uuid === u || j.id === u)) || { id: 'pm', color: 'pm', n: '·', uuid: u };
  const nom = (u) => (u === (ctx && ctx.me) ? 'Tú' : jug(u).n);
  const av = (u, cls = 'sm') => (ctx && ctx.av ? String(ctx.av(jug(u).id, cls)).replace(/ data-prof="[^"]*"/, '') : `<span class="av ${esc(jug(u).color)} ${cls}">${esc(String(jug(u).n || '·')[0])}</span>`);
  const src = (p) => (!p ? '' : /^https?:/.test(p) ? p : `${CDN}${p}/256fx256f`);
  const color = (r) => (RAR[r] || RAR.mil)[1];
  const fam = (it) => String(it.item || it.id || '').split('-')[0];
  const msgErr = (e) => {
    const m = (e && (e.message || e.error_description)) || 'Algo ha fallado';
    if (/Could not find the function|PGRST202|schema cache/i.test(m + ((e && e.code) || ''))) return 'El mercado aún no está en la base: falta cargar db/020_mercado.sql';
    return m;
  };
  const falla = (e) => { const m = msgErr(e); S.aviso = m; toast(esc(m)); const a = root && root.querySelector('[data-aviso]'); if (a) { a.textContent = m; tr(a) } };
  const aviso = () => `<p class="mk-aviso" data-aviso>${esc(S.aviso)}</p>`;
  const mios = () => (ctx && ctx.me) || '';
  // 'AK-47 | Redline' -> arriba 'AK-47', abajo 'Redline'; un objeto cualquiera solo lleva nombre
  function nombre(it) {
    const s = String(it.name || '·'), [w, k] = s.split(' | ');
    if (k == null && !/^★/.test(s)) return { top: '', main: s };
    return { top: w.replace(/^★ /, ''), main: (k || 'Original') + (it.phase ? ' · ' + it.phase : '') };
  }
  const meta = (it) => [it.st ? 'StatTrak' : '', it.wear != null ? WEAR[it.wear] : ''].filter(Boolean).join(' · ');

  async function rpc(fn, args) {
    const t0 = Date.now();
    const { data, error } = await ctx.db.rpc(fn, args || {});
    if (error) throw error;
    if (data && data.now) { const s = ms(data.now); if (s) T.off = s - (t0 + Date.now()) / 2 }
    return data;
  }
  // una accion del jugador: bloquea el repintado mientras dura, avisa si falla y refresca el saldo de la cabecera al acabar
  async function haz(fn, args, ok) {
    if (S.busy) return;
    S.busy++; S.aviso = '';
    let r = null;
    try { r = await rpc(fn, args); } catch (e) { falla(e); S.busy--; return null }
    try { if (ok) await ok(r) } catch (e) { falla(e) }
    S.busy--;
    if (ctx && ctx.refresh) ctx.refresh();
    cargar(true);
    return r;
  }

  /* ---------- como se pinta una pieza ---------- */
  // imagen: un marco o un fondo se dibujan con su estilo (son codigo, no fotos); lo demas, su foto
  function imagen(it, tam = '') {
    if (it.tipo === 'marco') return `<span class="mk-mv ${tam}">${avDe(null, it.clave)}</span>`;
    if (it.tipo === 'fondo') return `<span class="mk-fv ${tam}" data-fondo="${esc(it.clave)}"></span>`;
    return it.image ? `<img src="${esc(src(it.image))}" alt="" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'">` : '';
  }
  // el avatar de pruebas de un marco: el tuyo con el marco puesto
  function avDe(u, marco) {
    const j = jug(u || mios());
    return `<span class="av ${esc(j.color)} mk-pv" data-marco="${esc(marco || '')}">${esc(String(j.n || '·').slice(0, 1).toUpperCase())}</span>`;
  }
  function tile(it, ex = {}) {
    const n = nombre(it), tag = ex.btn ? 'button' : 'div', m = meta(it);
    return `<${tag} class="mk-it ${ex.on ? 'on' : ''} ${ex.off ? 'off' : ''} ${ex.cls || ''} ${it.tipo ? 't-' + it.tipo : ''}" style="--c:${color(it.rarity)}" title="${esc(it.name)}" ${ex.btn || ''}>
      <span class="mk-it-img">${imagen(it)}</span>
      <span class="mk-it-t">${n.top ? `<span class="lab" data-notr>${esc(n.top)}</span>` : ''}<b data-notr>${esc(n.main)}</b>${m ? `<em>${esc(m)}</em>` : ''}
        ${ex.extra || ''}<span class="v">${N(it.value)}${coin()}</span></span>
    </${tag}>`;
  }
  // varias piezas en una fila pequena
  const fila = (items) => (items && items.length ? `<span class="mk-fila">${items.map((it) => tile(it, { cls: 'mini' })).join('')}</span>` : '');
  const dinero = (vb) => (vb > 0 ? `<span class="mk-vb">${N(vb)}${coin()}</span>` : '');
  const lado = (items, vb) => ((items && items.length) || vb > 0 ? `<span class="mk-lado">${fila(items)}${dinero(vb)}</span>` : '<span class="mk-lado dim">Nada</span>');

  /* ---------- cargar ---------- */
  async function cargar(fuerza) {
    if (!ctx || !root || document.hidden) return;
    const n = ++cargaId;
    ultima = Date.now();
    try {
      const [est, cos] = await Promise.all([rpc('mk_estado'), S.tab === 'cos' ? rpc('cos_estado') : null]);
      if (n !== cargaId) return;
      D.est = est; if (cos) D.cos = cos;
      S.err = null;
      if (est.equipados) pintaEquipados(est.equipados);
      tratarJackpot();
    } catch (e) { if (n !== cargaId) return; S.err = msgErr(e) }
    pintaSi(fuerza);
    reloj();
  }
  let firmaV = '';
  function firma() {
    return JSON.stringify([S.tab, S.err, S.para, S.da, S.pide, S.daVb, S.pideVb, S.nota, S.con, S.jpVb, S.jpInv, S.aviso, S.rev && S.rev.id, S.jpRot, D.est, D.cos], (k, v) => (k === 'now' ? undefined : v));
  }
  function pintaSi(fuerza) {
    const s = firma();
    if (!fuerza && s === firmaV) return;
    firmaV = s; pinta();
  }

  /* ---------- armazon ---------- */
  function crea() {
    root = document.createElement('div');
    root.className = 'mk';
    root.innerHTML = '<div class="mk-main"></div><div class="mk-host"></div>';
    main = root.firstChild; host = root.lastChild;
    // La app repinta la pantalla (cada minuto y con cada pulso) y vuelve a colgar este nodo: si eso pasa entre pulsar y soltar el clic se pierde.
    // Por eso se actua al pulsar+soltar sobre el mismo boton (comparado por su clave), y mientras se pulsa no se repinta.
    root.addEventListener('pointerdown', (e) => {
      if ((e.button || 0) !== 0) return;
      const b = e.target.closest && e.target.closest('[data-mk]');
      if (!b || b.disabled) { S.dn = null; return }
      S.dn = { k: llave(b), t: Date.now() }; S.press = Date.now();
    });
    root.addEventListener('pointerup', (e) => {
      const d = S.dn; S.dn = null;
      const b = e.target.closest && e.target.closest('[data-mk]');
      if (!d || !b || b.disabled || Date.now() - d.t > 4000 || llave(b) !== d.k) return;
      S.pd = Date.now(); accion(b);
    });
    root.addEventListener('pointercancel', () => { S.dn = null; S.press = 0 });
    root.addEventListener('click', (e) => {              // el teclado (Enter o espacio): el raton ya se atendio al soltar
      const b = e.target.closest && e.target.closest('[data-mk]');
      if (!b || b.disabled || (S.pd && Date.now() - S.pd < 600) || e.detail > 0) return;
      accion(b);
    });
    root.addEventListener('input', (e) => {
      const t = e.target;
      if (!t.matches || !t.matches('[data-in]')) return;
      const k = t.dataset.in;
      const v = k === 'nota' ? t.value : t.value.replace(/[^\d]/g, '').slice(0, 8);
      if (t.value !== v) t.value = v;
      if (k === 'daVb') S.daVb = v; else if (k === 'pideVb') S.pideVb = v; else if (k === 'jpVb') S.jpVb = v;
      else if (k === 'precio' && S.pk) { S.pk.precio = v; const b = host.querySelector('[data-mk=pk-ok]'); if (b) b.disabled = !pkCompleta() }
      else if (k === 'nota') S.nota = t.value.slice(0, 140);
    });
    root.addEventListener('focusout', () => { if (pend) setTimeout(() => { if (pend && !S.busy) pinta() }, 60) });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && root && root.isConnected) { cargar(); reloj() } else paraTimers() });
  }
  const llave = (b) => [b.dataset.mk, b.dataset.v, b.dataset.i].join('|');

  function pinta(forzado) {
    if (!root || !ctx) return;
    const f = document.activeElement;
    if ((S.anim && !forzado) || (f && root.contains(f) && f.matches('input')) || (S.press && Date.now() - S.press < 700 && S.dn)) { pend = true; return }
    pend = false;
    main.innerHTML = `<nav class="mk-tabs">${TABS.map(([k, n]) => `<button class="mk-tab ${S.tab === k ? 'on' : ''}" data-mk="tab" data-v="${k}">${n}${badge(k)}</button>`).join('')}</nav>${S.err ? `<p class="mk-err">${esc(S.err)}</p>` : D.est ? vista() : '<p class="mk-hint">Cargando…</p>'}`;
    tr(main);
    const nav = main.querySelector('.mk-tabs'), on = nav && nav.querySelector('.on');
    if (on && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = Math.max(0, on.offsetLeft - 24);
  }
  function badge(k) {
    if (!D.est) return '';
    if (k === 'tratos') { const n = D.est.tratos.filter((t) => t.status === 'abierto' && t.para === mios()).length; return n ? `<b>${n}</b>` : '' }
    if (k === 'jackpot') return D.est.jackpot ? '<i></i>' : '';
    return '';
  }
  function vista() {
    return { tratos: vTratos, mercado: vMercado, contratos: vContratos, jackpot: vJackpot, cos: vCos }[S.tab]();
  }

  /* ---------- intercambios ---------- */
  const colegas = () => ctx.jugadores.filter((j) => j.uuid !== mios());
  const invDe = (u) => D.inv.get(u) || [];
  const pieza = (id) => { for (const l of D.inv.values()) { const x = l.find((i) => i.id === id); if (x) return x } return null };

  function vTratos() {
    const e = D.est, yo = mios();
    const para = S.para && jug(S.para);
    const abiertos = e.tratos.filter((t) => t.status === 'abierto'), cerrados = e.tratos.filter((t) => t.status !== 'abierto').slice(0, 6);
    const recibidos = abiertos.filter((t) => t.para === yo), enviados = abiertos.filter((t) => t.de === yo);
    const sel = (ids) => ids.map((id) => pieza(id)).filter(Boolean);
    return `<section class="mk-sec mk-nuevo">
      <h2>Proponer un trato</h2>
      <p class="mk-sub">Skins, marcos, fondos y objetos, y también V-Bucks. Lo que ofreces queda en depósito hasta que el otro responde.</p>
      <div class="mk-quien">${colegas().map((j) => `<button class="mk-q ${S.para === j.uuid ? 'on' : ''}" data-mk="para" data-v="${j.uuid}">${av(j.uuid, 'xl')}<span>${esc(j.n)}</span></button>`).join('')}</div>
      <div class="mk-par ${para ? '' : 'off'}">
        <div class="mk-lado-e">
          <span class="lab">Tú das</span>
          <div class="mk-sel">${lados(sel(S.da))}</div>
          <button class="mk-link" data-mk="elige" data-v="da">${S.da.length ? 'Cambiar piezas' : 'Elegir piezas'}</button>
          <label class="mk-vbin"><input data-in="daVb" inputmode="numeric" placeholder="0" value="${esc(S.daVb)}" aria-label="V-Bucks que das">${coin()}</label>
        </div>
        <div class="mk-cambio" aria-hidden="true">⇄</div>
        <div class="mk-lado-e">
          <span class="lab">Pides a ${para ? esc(para.n) : 'tu amigo'}</span>
          <div class="mk-sel">${lados(sel(S.pide))}</div>
          <button class="mk-link" data-mk="elige" data-v="pide">${S.pide.length ? 'Cambiar piezas' : 'Elegir piezas'}</button>
          <label class="mk-vbin"><input data-in="pideVb" inputmode="numeric" placeholder="0" value="${esc(S.pideVb)}" aria-label="V-Bucks que pides">${coin()}</label>
        </div>
      </div>
      ${para ? `<input class="mk-nota" data-in="nota" maxlength="140" placeholder="Un mensaje, si quieres" value="${esc(S.nota)}">` : ''}
      ${aviso()}
      <button class="go" data-mk="propone" ${para ? '' : 'disabled'}>Proponer trato</button>
    </section>
    ${recibidos.length ? `<section class="mk-sec"><h2>Te proponen</h2>${recibidos.map((t) => filaTrato(t, 'rec')).join('')}</section>` : ''}
    ${enviados.length ? `<section class="mk-sec"><h2>Tus propuestas</h2>${enviados.map((t) => filaTrato(t, 'env')).join('')}</section>` : ''}
    ${cerrados.length ? `<section class="mk-sec"><h2>Últimos tratos</h2>${cerrados.map((t) => filaTrato(t, 'fin')).join('')}</section>` : ''}
    ${!abiertos.length && !cerrados.length ? '<p class="mk-hint">Aún no hay tratos. Elige a un amigo y propón el primero.</p>' : ''}`;
  }
  const lados = (items) => (items.length ? `<span class="mk-fila">${items.map((it) => tile(it, { cls: 'mini', btn: `data-mk="quita" data-v="${it.id}"` })).join('')}</span>` : '<span class="mk-nada">Nada de momento</span>');
  const ESTADO = { aceptado: 'Aceptado', rechazado: 'Rechazado', cancelado: 'Cancelado' };
  function filaTrato(t, tipo) {
    const yo = mios(), otro = t.de === yo ? t.para : t.de;
    const quien = tipo === 'rec' ? `${esc(nom(t.de))} te propone` : tipo === 'env' ? `Le propones a ${esc(nom(t.para))}` : t.de === yo ? `Tú a ${esc(nom(t.para))}` : `${esc(nom(t.de))} a ti`;
    const da = t.de === yo ? 'Das' : 'Te da', pide = t.de === yo ? 'Pides' : 'Te pide';
    return `<article class="mk-trato ${tipo}">
      <header>${av(otro, 'sm')}<b>${quien}</b>${tipo === 'fin' ? `<em class="${t.status === 'aceptado' ? 'win' : ''}">${ESTADO[t.status] || t.status}</em>` : ''}</header>
      ${t.nota ? `<p class="mk-nota-t" data-notr>“${esc(t.nota)}”</p>` : ''}
      <div class="mk-par"><div class="mk-lado-e"><span class="lab">${da}</span>${lado(t.da, t.da_vb)}</div><div class="mk-cambio" aria-hidden="true">⇄</div><div class="mk-lado-e"><span class="lab">${pide}</span>${lado(t.pide, t.pide_vb)}</div></div>
      ${tipo === 'rec' ? `<div class="mk-bt"><button class="mk-b ok" data-mk="aceptar" data-v="${t.id}">Aceptar</button><button class="mk-b" data-mk="rechazar" data-v="${t.id}">Rechazar</button></div>` : ''}
      ${tipo === 'env' ? `<div class="mk-bt"><button class="mk-b" data-mk="cancelar" data-v="${t.id}">Cancelar trato</button></div>` : ''}
    </article>`;
  }

  /* ---------- mercado ---------- */
  function vMercado() {
    const e = D.est, yo = mios();
    const mias = e.ventas.filter((v) => v.vendedor === yo), otras = e.ventas.filter((v) => v.vendedor !== yo);
    const card = (v) => `<div class="mk-vta">${tile(v.inv, { cls: 'gr' })}
      <div class="mk-vta-p"><span class="mk-vta-q">${av(v.vendedor, 'sm')}${esc(nom(v.vendedor))}</span><b class="num">${N(v.precio)}${coin()}</b>
      ${v.vendedor === yo ? `<button class="mk-b" data-mk="retira" data-v="${v.id}">Retirar de la venta</button>` : `<button class="mk-b ok" data-mk="compra" data-v="${v.id}">Comprar</button>`}</div></div>`;
    return `<section class="mk-sec">
      <h2>Mercado</h2>
      <p class="mk-sub">Pon algo a la venta por el precio que quieras. El primero que lo compre se lo lleva y tú cobras al momento. Puedes retirarlo cuando quieras.</p>
      <button class="go mk-go-s" data-mk="vende">Poner algo a la venta</button>
      ${aviso()}
    </section>
    ${otras.length ? `<section class="mk-sec"><h2>A la venta</h2><div class="mk-grid">${otras.map(card).join('')}</div></section>` : '<p class="mk-hint">Ahora mismo no hay nada a la venta.</p>'}
    ${mias.length ? `<section class="mk-sec"><h2>Lo tuyo a la venta</h2><div class="mk-grid">${mias.map(card).join('')}</div></section>` : ''}
    ${e.vendidas.length ? `<section class="mk-sec"><h2>Vendido hace poco</h2><div class="mk-hist">${e.vendidas.map((v) => `<p><span>${esc(nom(v.comprador))} compró</span> <b data-notr>${esc(v.inv.name)}</b> <span>a ${esc(nom(v.vendedor))} por</span> <span class="num">${N(v.precio)}</span>${coin()}</p>`).join('')}</div></section>` : ''}`;
  }

  /* ---------- contratos ---------- */
  function vContratos() {
    const e = D.est, items = S.con.map((id) => pieza(id)).filter(Boolean);
    const r = items[0] && items[0].rarity, sig = r ? ORDEN[ORDEN.indexOf(r) + 1] : null;
    const valor = items.reduce((a, i) => a + i.value, 0), listo = items.length === 10;
    if (S.rev) return vReveal();
    const slots = Array.from({ length: 10 }, (_, k) => items[k] ? `<button class="mk-slot on" style="--c:${color(items[k].rarity)}" data-mk="quita-c" data-v="${items[k].id}" title="${esc(items[k].name)}"><span class="mk-it-img">${imagen(items[k])}</span></button>` : '<span class="mk-slot"></span>').join('');
    return `<section class="mk-sec mk-con">
      <h2>Contratos</h2>
      <p class="mk-sub">Mete 10 piezas de la misma rareza y sale 1 de la rareza siguiente, al azar y de las mismas cajas. No se mezclan skins, lujo y cosméticos. Casi siempre sale algo que vale menos que lo que metes: a veces sale algo que vale mucho más.</p>
      <div class="mk-slots">${slots}</div>
      <p class="mk-resu">${items.length ? `${items.length} de 10 · ${esc(RAR[r][0])} → <span style="color:${sig ? color(sig) : 'inherit'}">${sig ? esc(RAR[sig][0]) : '·'}</span> · metes <span class="num">${N(valor)}</span>${coin()}` : 'Elige 10 piezas de la misma rareza'}</p>
      <button class="mk-link" data-mk="elige" data-v="con">${items.length ? 'Cambiar piezas' : 'Elegir piezas'}</button>
      ${aviso()}
      <button class="go" data-mk="firma" ${listo ? '' : 'disabled'}>Firmar contrato</button>
    </section>
    ${e.contratos.length ? `<section class="mk-sec"><h2>Últimos contratos</h2><div class="mk-grid">${e.contratos.map((c) => `<div class="mk-vta">${tile(c.salida, { cls: 'gr' })}<div class="mk-vta-p"><span class="mk-vta-q">${av(c.player, 'sm')}${esc(nom(c.player))}</span></div></div>`).join('')}</div></section>` : ''}`;
  }
  function vReveal() {
    const it = S.rev.salida, ent = S.rev.entrada || [], dif = it.value - ent.reduce((a, i) => a + i.value, 0);
    return `<section class="mk-sec mk-rev" style="--c:${color(it.rarity)}">
      <p class="lab">Tu contrato ha salido</p>
      <div class="mk-rev-it">${tile(it, { cls: 'gr big' })}</div>
      <p class="mk-resu">Valor <span class="num">${N(it.value)}</span>${coin()} · ${dif >= 0 ? `<span class="win">▲ ${N(dif)}</span>` : `<span class="lose">▼ ${N(-dif)}</span>`} frente a lo que metiste</p>
      <button class="go" data-mk="rev-ok">Otro contrato</button>
    </section>`;
  }

  /* ---------- jackpot ---------- */
  const COLORES = { pm: '#b88c2c', c1: '#cc6496', c2: '#4d88e6', c3: '#a3c93a' };
  const colorJ = (u) => { const j = jug(u); return cssVar('--f-' + j.color, COLORES[j.color] || '#99a0aa') };
  function cssVar(n, d) { try { return getComputedStyle(root).getPropertyValue(n).trim() || d } catch { return d } }
  function jpActual() { const e = D.est; return e && (e.jackpot || e.ultimo) }
  function rueda(j) {
    if (!j || !j.players.length || !j.total) return 'conic-gradient(rgba(255,255,255,.08) 0 100%)';
    let a = 0;
    const partes = j.players.map((p) => { const d = (p.valor / j.total) * 100, s = `${colorJ(p.player)} ${a.toFixed(3)}% ${(a + d).toFixed(3)}%`; a += d; return s });
    return `conic-gradient(${partes.join(',')})`;
  }
  const mm = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  function restante(j) { return j && j.closes_at ? Math.max(0, Math.ceil((ms(j.closes_at) - ahora()) / 1000)) : null }
  function vJackpot() {
    const e = D.est, vivo = e.jackpot, j = vivo || e.ultimo, yo = mios();
    const ganado = !vivo && e.ultimo && !S.anim ? e.ultimo : null;       // mientras gira no se dice quien ha ganado
    const dentro = vivo ? vivo.players.find((p) => p.player === yo) : null;
    const quedan = restante(vivo);
    const ps = j ? j.players : [];
    const items = S.jpInv.map((id) => pieza(id)).filter(Boolean), vp = items.reduce((a, i) => a + i.value, 0), vb = parseInt(S.jpVb, 10) || 0;
    const centro = vivo
      ? `<span class="mk-jp-t num" data-jp-pozo>${N(vivo.total)}</span><span class="mk-jp-c num" data-jp-reloj>${quedan == null ? 'Falta alguien' : mm(quedan)}</span>`
      : ganado ? `<span class="mk-jp-t num">${N(ganado.total)}</span><span class="mk-jp-c">${esc(nom(ganado.winner))} gana</span>` : S.anim && j ? `<span class="mk-jp-t num">${N(j.total)}</span><span class="mk-jp-c">Girando…</span>` : '<span class="mk-jp-c">Sin ronda</span>';
    return `<section class="mk-sec mk-jp">
      <h2>Jackpot</h2>
      <p class="mk-sub">Cada uno mete V-Bucks o piezas por su valor. Cuando entra la segunda persona empiezan ${FIN_JP} segundos; al acabar el servidor saca un boleto: cuanto más has metido, más grande es tu trozo. Quien gana se lo lleva todo.</p>
      <div class="mk-rw"><span class="mk-rw-pt"></span><div class="mk-rw-d" data-rueda style="background:${rueda(j)};transform:rotate(${S.jpRot}deg)"></div><div class="mk-rw-c">${centro}</div></div>
      ${ganado ? `<p class="mk-resu win" data-jp-fin>${esc(nom(ganado.winner))} se lleva ${N(ganado.total)}${coin()}</p>` : '<p class="mk-resu" data-jp-fin></p>'}
      <div class="mk-jp-p">${ps.length ? ps.map((p) => `<div class="mk-jp-r ${ganado && ganado.winner === p.player ? 'gana' : ''}"><i style="background:${colorJ(p.player)}"></i>${av(p.player, 'sm')}<span>${esc(nom(p.player))}</span>
        <em>${j.total ? Math.round((p.valor / j.total) * 100) : 0} %</em><span class="num">${N(p.valor)}${coin()}</span></div>${p.items.length ? `<div class="mk-jp-i">${fila(p.items)}</div>` : ''}`).join('') : '<p class="mk-hint">Nadie ha metido nada todavía.</p>'}</div>
      <div class="mk-jp-e">
        <span class="lab">Tú metes${dentro ? ' (ya llevas ' + N(dentro.valor) + ')' : ''}</span>
        <label class="mk-vbin big"><input data-in="jpVb" inputmode="numeric" placeholder="0" value="${esc(S.jpVb)}" aria-label="V-Bucks">${coin()}</label>
        <div class="mk-q-r">${[50, 100, 500, 1000].map((n) => `<button data-mk="jp-vb" data-v="${n}">${N(n)}</button>`).join('')}<button data-mk="jp-vb" data-v="max">Todo</button></div>
        <div class="mk-sel">${items.length ? lados(items) : ''}</div>
        <button class="mk-link" data-mk="elige" data-v="jp">${items.length ? 'Cambiar piezas' : 'Y piezas, si quieres'}</button>
        ${aviso()}
        <button class="go" data-mk="jp-entra" ${vb + vp >= 10 ? '' : 'disabled'}>Entrar${vb + vp > 0 ? ' con ' + N(vb + vp) : ''}</button>
        ${dentro && vivo && vivo.players.length === 1 ? '<button class="mk-link" data-mk="jp-sale">Retirar lo que metí</button>' : ''}
      </div>
    </section>`;
  }
  // una ronda recien terminada que aun no se ha visto girar: se anima; si no, solo se marca como vista
  function tratarJackpot() {
    const u = D.est && D.est.ultimo;
    if (D.est && D.est.jackpot && !S.anim) S.jpRot = 0;
    if (!u) return;
    if (S.vistoJp >= u.id) { if (!D.est.jackpot) S.jpRot = rotFinal(u, 0) % 360; return }
    const reciente = u.done_at && ahora() - ms(u.done_at) < 30000;
    S.vistoJp = u.id; guarda('mk-jp-visto', u.id);
    if (reciente && S.tab === 'jackpot' && visible() && !S.anim && !D.est.jackpot) giraRueda(u);
    else if (!D.est.jackpot) S.jpRot = rotFinal(u, 0) % 360;
  }
  // la rueda gira para que el boleto (pos, de 0 a 1 desde arriba y en el sentido del reloj) quede bajo la flecha
  const rotFinal = (j, vueltas) => vueltas * 360 + (360 - j.pos * 360);
  async function giraRueda(j) {
    const final = rotFinal(j, quieto() ? 0 : 5);
    S.anim = true;                                                           // mientras gira la app no repinta
    S.jpRot = 0; firmaV = ''; pinta(true);                                   // se pinta la ronda cerrada en su posicion de salida
    await espera(80);
    const d = main.querySelector('[data-rueda]');
    if (d && final > 360) { d.style.transition = 'transform 6s cubic-bezier(.12,.62,.12,1)'; void d.offsetWidth; d.style.transform = `rotate(${final}deg)`; await espera(6300) }
    S.jpRot = final % 360;
    S.anim = false;
    toast(j.winner === mios() ? `<b>Jackpot</b> · te llevas ${N(j.total)}` : `Jackpot · ${esc(nom(j.winner))} se lleva ${N(j.total)}`);
    firmaV = ''; pinta();
    if (ctx.refresh) ctx.refresh();
  }
  // temporizadores: uno de 1 s mientras la cuenta atras esta a la vista, y una consulta cada 5 s mientras hay una ronda viva con la pantalla del jackpot
  function reloj() {
    paraTimers();
    const e = D.est;
    if (!e || !visible() || S.tab !== 'jackpot') return;
    if (e.jackpot) {
      tSeg = setInterval(segundo, 1000);
      tPoll = setInterval(() => { if (!S.busy && !S.anim) cargar() }, 5000);
    }
  }
  function paraTimers() { clearInterval(tSeg); clearInterval(tPoll); tSeg = tPoll = 0 }
  let cerrando = false;
  function segundo() {
    const j = D.est && D.est.jackpot;
    if (!j || !visible() || S.tab !== 'jackpot') { paraTimers(); return }
    const q = restante(j), el = root.querySelector('[data-jp-reloj]');
    if (el && q != null) { const t = mm(q); if (el.textContent !== t) el.textContent = t }
    if (q === 0 && !cerrando && !S.busy) {
      cerrando = true;
      rpc('mk_jackpot_cerrar').catch(() => {}).then(() => cargar(true)).then(() => { cerrando = false });
    }
  }

  /* ---------- mis cosmeticos ---------- */
  function vCos() {
    const c = D.cos, e = D.est;
    if (!c) return '<p class="mk-hint">Cargando…</p>';
    const eq = (e.equipados || []).find((x) => x.player === mios()) || {};
    const lista = c.mios, tipo = (t) => lista.filter((i) => i.tipo === t);
    const grupo = (t, titulo, vacio) => {
      const l = tipo(t);
      return `<section class="mk-sec"><h2>${titulo}</h2>${l.length ? `<div class="mk-grid">${l.map((it) => {
        const puesto = (t === 'marco' && eq.marco_inv === it.id) || (t === 'fondo' && eq.fondo_inv === it.id);
        return tile(it, { cls: 'gr', btn: t === 'objeto' ? '' : `data-mk="equipa" data-v="${it.id}" data-i="${t}"`, on: puesto, extra: t === 'objeto' ? '' : `<span class="mk-pon">${puesto ? 'Puesto · quitar' : 'Ponerme'}</span>` });
      }).join('')}</div>` : `<p class="mk-hint">${vacio}</p>`}</section>`;
    };
    return `<section class="mk-sec mk-cos">
      <h2>Mis cosméticos</h2>
      <p class="mk-sub">Un marco para tu foto y un fondo para la app. Se ven en todo lo que pintan los demás. Consíguelos en Cajas, en Cosméticos, o cómpralos y cámbialos aquí.</p>
      <div class="mk-ahora">
        <div><span class="lab">Marco</span>${avDe(mios(), eq.marco)}${eq.marco ? '<button class="mk-link" data-mk="quita-eq" data-v="marco">Quitar</button>' : '<span class="dim">Ninguno</span>'}</div>
        <div><span class="lab">Fondo</span><span class="mk-fv wide" data-fondo="${esc(eq.fondo || '')}"></span>${eq.fondo ? '<button class="mk-link" data-mk="quita-eq" data-v="fondo">Quitar</button>' : '<span class="dim">Ninguno</span>'}</div>
      </div>
      ${aviso()}
    </section>
    ${grupo('marco', 'Marcos', 'Aún no tienes ningún marco. Salen en la Caja Aros, la Caja Neón y la Caja Oro.')}
    ${grupo('fondo', 'Fondos', 'Aún no tienes ningún fondo. Salen en la Caja Fondos y en la Caja Neón.')}
    ${grupo('objeto', 'Objetos de colección', 'Aún no tienes objetos. Salen en la Caja Calle y en la Caja Oro.')}
    <section class="mk-sec"><h2>Los amigos</h2><div class="mk-colegas">${ctx.jugadores.map((j) => { const x = (e.equipados || []).find((q) => q.player === j.uuid) || {}; return `<div>${avDe(j.uuid, x.marco).replace('mk-pv', 'mk-pv big')}<span>${esc(j.n)}</span></div>` }).join('')}</div></section>`;
  }

  /* ---------- selector de piezas ---------- */
  // modo: 'multi' (varias, hasta max), 'uno' (una y su precio), 'con' (10 de la misma rareza)
  async function abreSelector(modo, titulo, quien, ya, max, onOk, ex = {}) {
    S.pk = { modo, titulo, quien, sel: new Set(ya || []), max, onOk, rar: '', mas: 60, items: invDe(quien), precio: '', ...ex };
    pintaSheet(false);
    try {
      const l = await rpc('mk_inv', { p_player: quien, p_lim: 400 });
      D.inv.set(quien, l);
      if (S.pk) { S.pk.items = l; pintaSheet(true) }
    } catch (e) { cierraSelector(); falla(e) }
  }
  function cierraSelector() { S.pk = null; host.innerHTML = ''; root.classList.remove('mk-abierto') }
  function permitida(it, sel) {
    const p = S.pk;
    if (p.modo !== 'con' || !sel.size) return true;
    const p0 = [...sel].map((id) => p.items.find((i) => i.id === id) || pieza(id)).find(Boolean);
    return !p0 || (p0.rarity === it.rarity && fam(p0) === fam(it) && p0.rarity !== 'esp');
  }
  function pkCompleta() {
    const p = S.pk, n = p ? p.sel.size : 0;
    if (!p) return false;
    return p.modo === 'con' ? n === 10 : p.modo === 'uno' ? n === 1 && (parseInt(p.precio, 10) || 0) >= 1 : n > 0 || !!p.vacioOk;
  }
  function pintaSheet(conservaScroll) {
    const p = S.pk;
    if (!p) return;
    const prev = host.querySelector('.mk-sheet-g'), sc = prev ? prev.scrollTop : 0;
    root.classList.add('mk-abierto');
    const todas = p.items, lista = todas.filter((i) => !p.rar || i.rarity === p.rar && true);
    const cuentas = {};
    for (const i of todas) cuentas[i.rarity] = (cuentas[i.rarity] || 0) + 1;
    const nsel = p.sel.size, valor = [...p.sel].reduce((a, id) => a + ((p.items.find((i) => i.id === id) || pieza(id) || {}).value || 0), 0);
    // contratos: atajos de "las 10 mas baratas de ..."
    let atajos = '';
    if (p.modo === 'con') {
      const gr = new Map();
      for (const i of todas) { if (i.rarity === 'esp') continue; const k = fam(i) + '|' + i.rarity; gr.set(k, (gr.get(k) || 0) + 1) }
      atajos = [...gr.entries()].filter(([, n]) => n >= 10).map(([k, n]) => { const [f, r] = k.split('|'); return `<button data-mk="pk-bara" data-v="${k}"><i style="background:${color(r)}"></i>10 más baratas · ${esc(RAR[r][0])}${f !== 'skin' ? ' (' + esc(FAM[f] || f) + ')' : ''}</button>` }).join('');
    }
    const primera = !host.firstChild;
    host.innerHTML = `<div class="mk-sheet ${primera ? 'in' : ''}"><div class="mk-sheet-c" role="dialog" aria-label="${esc(p.titulo)}">
      <header><h3>${esc(p.titulo)}</h3><button class="mk-x" data-mk="pk-cierra" aria-label="Cerrar">×</button></header>
      <div class="mk-sheet-f"><button class="${p.rar ? '' : 'on'}" data-mk="pk-rar" data-v="">Todas · ${todas.length}</button>${ORDEN.slice().reverse().filter((r) => cuentas[r]).map((r) => `<button class="${p.rar === r ? 'on' : ''}" data-mk="pk-rar" data-v="${r}"><i style="background:${color(r)}"></i>${esc(RAR[r][0])} · ${cuentas[r]}</button>`).join('')}</div>
      ${atajos ? `<div class="mk-sheet-f at">${atajos}</div>` : ''}
      <div class="mk-sheet-g">${!todas.length ? '<p class="mk-hint">Cargando…</p>' : lista.length ? lista.slice(0, p.mas).map((it) => { const on = p.sel.has(it.id), off = !on && !permitida(it, p.sel); return tile(it, { cls: 'gr', btn: `data-mk="pk-it" data-v="${it.id}"`, on, off }) }).join('') + (lista.length > p.mas ? `<button class="mk-mas" data-mk="pk-mas">Ver ${Math.min(60, lista.length - p.mas)} más</button>` : '') : '<p class="mk-hint">No hay nada de esa rareza.</p>'}</div>
      <footer>
        <span class="mk-sheet-n">${p.modo === 'con' ? `${nsel} de 10` : `${nsel}${p.max < 99 ? ' de ' + p.max : ''} elegidas`} · <span class="num">${N(valor)}</span>${coin()}</span>
        ${p.modo === 'uno' ? `<label class="mk-vbin"><input data-in="precio" inputmode="numeric" placeholder="Precio" value="${esc(p.precio)}" aria-label="Precio">${coin()}</label>` : ''}
        <button class="go" data-mk="pk-ok" ${pkCompleta() ? '' : 'disabled'}>${esc(p.ok || 'Listo')}</button>
      </footer></div></div>`;
    tr(host);
    const g = host.querySelector('.mk-sheet-g');
    if (g && conservaScroll) g.scrollTop = sc;
  }

  /* ---------- acciones ---------- */
  async function accion(b) {
    const k = b.dataset.mk, v = b.dataset.v;
    if (k === 'tab') { S.tab = v; guarda('mk-tab', v); S.aviso = ''; D.cos = null; pinta(); cargar(true); return }
    if (k === 'para') { S.para = v; S.da = S.da.filter(Boolean); S.pide = []; D.inv.delete(v); pinta(); return }
    if (k === 'quita') { S.da = S.da.filter((x) => String(x) !== v); S.pide = S.pide.filter((x) => String(x) !== v); pinta(); return }
    if (k === 'quita-c') { S.con = S.con.filter((x) => String(x) !== v); pinta(); return }
    if (k === 'elige') return eligePiezas(v);
    if (k === 'propone') return propone();
    if (k === 'aceptar') return haz('mk_trato_aceptar', { p_id: +v }, () => toast('Trato hecho'));
    if (k === 'rechazar') return haz('mk_trato_rechazar', { p_id: +v }, () => toast('Trato rechazado'));
    if (k === 'cancelar') return haz('mk_trato_cancelar', { p_id: +v }, () => toast('Trato cancelado: te devuelvo lo que ofrecías'));
    if (k === 'vende') return vende();
    if (k === 'compra') return haz('mk_comprar', { p_id: +v }, (r) => toast(`Comprado por <b>${N(D.est.ventas.find((x) => x.id === +v)?.precio || 0)}</b>`));
    if (k === 'retira') return haz('mk_retirar', { p_id: +v }, () => toast('Retirado de la venta'));
    if (k === 'firma') return firma_();
    if (k === 'rev-ok') { S.rev = null; S.con = []; pinta(); return }
    if (k === 'jp-vb') { S.jpVb = v === 'max' ? String(Math.max(0, ctx.saldo || 0)) : v; pinta(); return }
    if (k === 'jp-entra') return jpEntra();
    if (k === 'jp-sale') return haz('mk_jackpot_salir', {}, () => toast('Has retirado lo que metiste'));
    if (k === 'equipa') {
      const tipo = b.dataset.i, eq = ((D.est.equipados || []).find((x) => x.player === mios()) || {});
      const puesto = (tipo === 'marco' && eq.marco_inv === +v) || (tipo === 'fondo' && eq.fondo_inv === +v);
      return haz('cos_equipar', { p_tipo: tipo, p_inv: puesto ? null : +v }, async () => { eqAt = 0; await aplicaCosmeticos(ctx, true) });
    }
    if (k === 'quita-eq') return haz('cos_equipar', { p_tipo: v, p_inv: null }, async () => { eqAt = 0; await aplicaCosmeticos(ctx, true) });
    // selector
    const p = S.pk;
    if (k === 'pk-cierra') return cierraSelector();
    if (!p) return;
    if (k === 'pk-rar') { p.rar = v; p.mas = 60; return pintaSheet(false) }
    if (k === 'pk-mas') { p.mas += 60; return pintaSheet(true) }
    if (k === 'pk-it') {
      const id = +v, it = p.items.find((i) => i.id === id);
      if (p.sel.has(id)) p.sel.delete(id);
      else if (it && permitida(it, p.sel)) { if (p.modo === 'uno') p.sel.clear(); if (p.sel.size < p.max) p.sel.add(id); }
      return pintaSheet(true);
    }
    if (k === 'pk-bara') {
      const [f, r] = v.split('|');
      p.sel = new Set(p.items.filter((i) => fam(i) === f && i.rarity === r).sort((a, c) => a.value - c.value || a.id - c.id).slice(0, 10).map((i) => i.id));
      return pintaSheet(true);
    }
    if (k === 'pk-ok') {
      const ids = [...p.sel], f = p.onOk;
      cierraSelector();
      return f(ids, p);
    }
  }
  // un toque fuera del cuadro cierra el selector
  document.addEventListener('pointerup', (e) => {
    const f = e.target && e.target.classList && e.target.classList.contains('mk-sheet') ? e.target : null;
    if (f && S.pk && root && root.contains(f)) cierraSelector();
  }, true);

  async function eligePiezas(que) {
    const yo = mios();
    if (que === 'da') return abreSelector('multi', 'Lo que das', yo, S.da, 10, (ids) => { S.da = ids; pinta() }, { vacioOk: true, ok: 'Listo' });
    if (que === 'pide') {
      if (!S.para) return;
      return abreSelector('multi', `Lo que pides a ${jug(S.para).n}`, S.para, S.pide, 10, (ids) => { S.pide = ids; pinta() }, { vacioOk: true, ok: 'Listo' });
    }
    if (que === 'con') return abreSelector('con', 'Elige 10 piezas de la misma rareza', yo, S.con, 10, (ids) => { S.con = ids; pinta() }, { ok: 'Listo' });
    if (que === 'jp') return abreSelector('multi', 'Piezas para el jackpot', yo, S.jpInv, 20, (ids) => { S.jpInv = ids; pinta() }, { vacioOk: true, ok: 'Listo' });
  }
  async function propone() {
    if (!S.para) return;
    const dv = parseInt(S.daVb, 10) || 0, pv = parseInt(S.pideVb, 10) || 0;
    if (!S.da.length && !S.pide.length && !dv && !pv) { S.aviso = 'Un trato vacío no sirve'; return pinta() }
    return haz('mk_trato_crear', { p_para: S.para, p_da: S.da, p_da_vb: dv, p_pide: S.pide, p_pide_vb: pv, p_nota: S.nota }, () => {
      S.da = []; S.pide = []; S.daVb = ''; S.pideVb = ''; S.nota = '';
      toast(`Trato propuesto a ${esc(jug(S.para).n)}`);
    });
  }
  function vende() {
    return abreSelector('uno', 'Qué pones a la venta', mios(), [], 1, async (ids, p) => {
      const precio = parseInt(p.precio, 10) || 0;
      if (!ids.length || precio < 1) return;
      await haz('mk_vender', { p_inv: ids[0], p_precio: precio }, () => toast(`A la venta por <b>${N(precio)}</b>`));
    }, { ok: 'Poner a la venta' });
  }
  async function firma_() {
    if (S.con.length !== 10) return;
    const r = await haz('mk_contrato', { p_ids: S.con }, async (r) => {
      S.rev = { id: r.salida.id, salida: r.salida, entrada: r.entrada };
      S.anim = false;
    });
    if (r) { pend = false; pinta() }
  }
  async function jpEntra() {
    const vb = parseInt(S.jpVb, 10) || 0;
    await haz('mk_jackpot_entrar', { p_vb: vb, p_inv: S.jpInv }, (r) => {
      if (r && r.cerrada) { toast('La ronda acababa de cerrarse. Prueba otra vez'); return }
      S.jpInv = [];
      toast('Estás dentro del jackpot');
    });
  }

  /* ---------- cosmeticos de todos: marcos y fondo ---------- */
  // Una hoja de estilos con una regla por jugador: .av.pm::after lleva el marco que tiene puesto (en todas partes donde la app pinta un avatar).
  // El fondo del que mira se pone detras de toda la app; el de cada uno queda como .mk-bg-pm para quien quiera pintarlo en su perfil.
  function pintaEquipados(lista) {
    eqCache = lista; eqAt = Date.now();
    let st = document.getElementById('mk-cos'), css = '';
    if (!st) { st = document.createElement('style'); st.id = 'mk-cos'; document.head.appendChild(st) }
    const yo = ctx && ctx.me;
    for (const e of lista) {
      const j = ctx && ctx.jugadores.find((x) => x.uuid === e.player);
      if (!j) continue;
      const d = e.marco && marcoDecl(e.marco);
      if (d) css += `.av.${j.id}{position:relative}.av.${j.id}::after{${d}}`;
      const f = e.fondo && fondoCss(e.fondo);
      if (f) css += `.mk-bg-${j.id}{background:${f}}`;
      if (e.player === yo) {
        const h = document.documentElement;
        if (f) { css += `html[data-mkf]::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;background:linear-gradient(rgba(29,33,41,.38),rgba(29,33,41,.38)),${f}}html[data-mkf] body{background:transparent}`; h.dataset.mkf = e.fondo }
        else delete h.dataset.mkf;
      }
    }
    if (st.textContent !== css) st.textContent = css;
  }
  // la app lo llama tras cada load(): si hay datos recientes los pinta ya y pide los nuevos como mucho cada 10 s
  async function aplicaCosmeticos(c, fuerza) {
    if (c) ctx = c;
    if (!ctx || !ctx.db) return;
    if (eqCache) pintaEquipados(eqCache);
    if (!fuerza && Date.now() - eqAt < 10000) return;
    const n = ++eqId;
    try { const l = await rpc('cos_equipados'); if (n === eqId) pintaEquipados(l) } catch (e) { /* sin la base de cosmeticos todo sigue como antes */ }
  }

  // las miniaturas de marcos y fondos (en las piezas, los selectores y la pantalla de cosmeticos): una regla por clave
  function estilosPrevios() {
    if (document.getElementById('mk-prev')) return;
    const st = document.createElement('style'); st.id = 'mk-prev';
    let css = '';
    for (const k of Object.keys(MARCOS)) css += `.mk-pv[data-marco="${k}"]::after{${marcoDecl(k)}}`;
    for (const k of Object.keys(FONDOS)) css += `.mk-fv[data-fondo="${k}"]{background:${fondoCss(k)}}`;
    st.textContent = css; document.head.appendChild(st);
  }

  /* ---------- la app llama a esto ---------- */
  window.GM_MERCADO = {
    html: () => '<div data-mercado></div>',
    // el: la vista de la app (o el hueco [data-mercado]); c: { db, me, meKey, jugadores, saldo, av, toast, refresh }; nueva: se acaba de entrar en la pantalla
    montar(el, c, nueva) {
      ctx = c;
      if (!root) { crea(); estilosPrevios() }
      const hueco = el && (el.matches && el.matches('[data-mercado]') ? el : el.querySelector('[data-mercado]'));
      if (hueco) hueco.replaceWith(root); else if (el && !root.isConnected) el.appendChild(root);
      if (nueva) { root.classList.remove('mk-in'); void root.offsetWidth; root.classList.add('mk-in'); setTimeout(() => root.classList.remove('mk-in'), 600) }
      if (!main.firstChild) pinta();
      if (nueva || !D.est || Date.now() - ultima > 1200) cargar(true);
      else { reloj(); clearTimeout(tCarga); tCarga = setTimeout(cargar, 1250 - (Date.now() - ultima)) }
    },
    aplicaCosmeticos: (c) => aplicaCosmeticos(c),
    // true mientras una animacion esconde un resultado
    ocupado: () => !!S.anim,
    estado: () => ({ tab: S.tab, ocupado: !!S.anim }),
    marcoCss: marcoDecl, fondoCss, estilos: { MARCOS, FONDOS },
  };
})();
