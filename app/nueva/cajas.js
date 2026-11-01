// Cajas en Gambling Master: abrir cajas, el inventario de cada uno y batallas 1v1 y 2v2.
// El azar y el dinero los pone la base (db/007_cajas.sql); aqui solo se pide y se pinta.
// La app lo monta asi (ver CAJAS-INTEGRAR.md): R.cajas = () => GM_CAJAS.html() y, justo despues de pintar,
// GM_CAJAS.montar(vista, ctx, cambia). El nodo de la pantalla es siempre el mismo, asi que aunque la app
// repinte (cada minuto o cuando alguien mueve dinero) la ruleta sigue girando.
// Rediseno (PM, 30-10): todo centrado, inventario con orden y filtros, y todas las batallas terminadas por paginas.
// Las cajas pueden traer categoria ('skins' o 'lujo' en cat, category o categoria; si no, se mira si el id empieza por lujo).
'use strict';
(function () {
  const CDN = 'https://community.akamai.steamstatic.com/economy/image/';
  const RAR = { esp: ['Especial', '#e4ae39'], cov: ['Encubierto', '#eb4b4b'], cla: ['Clasificado', '#d32ce6'], res: ['Restringido', '#8847ff'], mil: ['Grado militar', '#4b69ff'] };
  const ORDEN = ['esp', 'cov', 'cla', 'res', 'mil'];
  const RANGO = { esp: 0, cov: 1, cla: 2, res: 3, mil: 4 };
  // de cada 10.000 aperturas; si a una caja le falta una rareza se reparte entre las que tiene.
  // db/012_cajas_mas.sql cambia las odds y a la vez anade cat a las cajas: si las cajas traen cat, mandan las nuevas.
  // db/027 (PM 30-10: "que las odds sean mas complicadas de que te toquen, mola que tengan cuchillos") vuelve a las de CS2 de verdad.
  const PESO_007 = { mil: 7992, res: 1598, cla: 320, cov: 64, esp: 26 }, PESO_012 = { mil: 7992, res: 1598, cla: 320, cov: 64, esp: 26 };
  const WEAR = ['Recién fabricado', 'Casi nuevo', 'Algo desgastado', 'Bastante desgastado', 'Deplorable'];
  // solo para rellenar la ruleta: lo que sale de verdad lo decide el servidor
  const RELLENO = { mil: 60, res: 25, cla: 9, cov: 4, esp: 2 };
  const X_TRAMOS = [[0, 0.07, 0.03], [0.07, 0.15, 0.24], [0.15, 0.38, 0.33], [0.38, 0.45, 0.24], [0.45, 1, 0.16]];
  const CORTES = [0, 0.07, 0.15, 0.38, 0.45, 1.000001];
  const BARATA = 10;          // "elegir las baratas": las que valen menos de esto
  const POR_PAG = 8;          // batallas terminadas por pagina
  const INV_PASO = 60;        // skins del inventario que se pintan de cada vez
  const ESP_VER = 6;          // cuchillos y guantes que se ven de primeras en lo que trae una caja
  const CATS = [['skins', 'Skins de CS2'], ['lujo', 'Lujo']];  // Cosmeticos ocultos: el Mercado esta en mantenimiento (PM 30-10)
  // categorias de la lista de cajas (PM 01-11: "separa por categorias: cajas de csgo, cajas de X"). La base solo sabe skins / lujo: el grupo de cada caja de lujo
  // se decide aqui por su id (una caja de lujo que no este en la lista cae en la ultima categoria).
  const GRUPOS = [['cs2', 'CS2'], ['tec', 'Tecnología'], ['relojes', 'Relojes y joyas'], ['moda', 'Moda'], ['motor', 'Motor y viajes'], ['inv', 'Inversión']];
  const GRUPO_DE = {
    'lujo-tecnologia-basica': 'tec', 'lujo-tecnologia': 'tec', 'lujo-tecnologia-2026': 'tec', 'lujo-gaming': 'tec', 'lujo-camaras': 'tec', 'lujo-patinetes': 'tec',
    'lujo-relojes-calle': 'relojes', 'lujo-relojes': 'relojes', 'lujo-relojes-2026': 'relojes', 'lujo-joyas': 'relojes', 'lujo-moda-joyas': 'relojes',
    'lujo-zapatillas-basicas': 'moda', 'lujo-zapatillas': 'moda', 'lujo-zapatillas-2026': 'moda', 'lujo-moda-calle': 'moda', 'lujo-bolsos': 'moda', 'lujo-gafas': 'moda', 'lujo-streetwear': 'moda', 'lujo-perfumes': 'moda',
    'lujo-motos': 'motor', 'lujo-coches': 'motor', 'lujo-motor': 'motor', 'lujo-viajes': 'motor',
    'lujo-oro': 'inv', 'lujo-cripto': 'inv', 'lujo-cartas': 'inv' };
  const ORDENES = [['valor', 'Más valiosas'], ['nuevas', 'Más nuevas'], ['rareza', 'Por rareza']];
  const SEL_BAT = 'id,mode,cases,cost,status,created_by,winner,totals,created_at,done_at,cs_battle_seats(seat,player)';

  /* ---------- estado ---------- */
  let ctx = null, root = null;
  const S = { tab: 'abrir', cat: GRUPOS.some((g) => g[0] === lee('cj-cat')) ? lee('cj-cat') : 'cs2', caja: null, n: 1, rapido: lee('cj-rapido') === '1', vel: ['0', '1', '2'].includes(lee('cj-vel')) ? lee('cj-vel') : lee('cj-rapido') === '1' ? '1' : '0', auto: false, tiras: null, tirasK: '', tirasC: null, fase: 'idle', prueba: false, quien: null, sel: new Set(), bat: null, nueva: null, res: null, sure: null, rep: null, espTodo: null,
    orden: ['valor', 'nuevas', 'rareza'].includes(lee('cj-orden')) ? lee('cj-orden') : 'valor', fR: null, fC: null, invN: INV_PASO, pag: 0 };
  const D = { cases: null, caja: new Map(), items: new Map(), st: null, bats: new Map(), err: null, hechas: null, cajasDe: new Map() };
  let anim = null, pendiente = false, cargando = null, otraVez = false, ultima = 0, ocupado = false;

  /* ---------- utilidades ---------- */
  function lee(k) { try { return localStorage.getItem(k) } catch { return null } }
  function guarda(k, v) { try { localStorage.setItem(k, v) } catch {} }
  const N = (x) => String(Math.round(x || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, document.documentElement.lang === 'en' ? ',' : '.');
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const coin = () => '<span class="cn"></span>';
  const src = (p, s) => (!p ? '' : /^https?:/.test(p) ? p : `${CDN}${p}/${s}fx${s}f`);
  // las imagenes de lujo (cajas y objetos) son webp recortados con transparencia, igual que las skins: no llevan marco ni fondo
  const pic = (p, s, cls = '', eager = false) => p ? `<img class="${cls}" src="${esc(src(p, s))}" alt="" ${eager ? '' : 'loading="lazy" '}decoding="async" onerror="this.style.visibility='hidden'">` : '';
  const color = (r) => (RAR[r] || RAR.mil)[1];
  const espera = (ms) => new Promise((ok) => setTimeout(ok, anim && anim.saltar ? 0 : ms));
  // PM, 30-10: "no funcionan ni las animaciones". Con "quitar animaciones" en el sistema (en Android lo pone la escala de
  // animacion a 0 de las opciones de desarrollador) el navegador pide movimiento reducido y las ruletas saltaban al final.
  // Aqui la ruleta ES lo que se juega: gira siempre (tambien la de las batallas, que usa esto mismo).
  const quieto = () => false;
  // que clave de S.sure arma cada boton de confirmar
  const ARMADO = { salir: (v) => 'salir' + v, venderRes: () => 'res', vender: () => 'inv', vendertodo: () => 'todo' };
  const flo = (f) => (f == null ? '' : Number(f).toFixed(4).replace('.', ','));
  const item = (id) => D.items.get(id) || { id, name: '·', rarity: 'mil' };
  // 'AK-47 | Redline' -> ['AK-47', 'Redline']; '★ Karambit' -> ['Karambit', 'Original']; 'Rolex Submariner' (lujo) -> ['Rolex Submariner']
  function partes(it) {
    const s = String(it.name || '·'), [w, k] = s.split(' | ');
    if (k == null && !/^★/.test(s)) return [s];
    return [w.replace(/^★ /, ''), (k || 'Original') + (it.phase ? ' · ' + it.phase : '')];
  }
  const nombre = (it) => { const p = partes(it); return p.length > 1 ? { top: p[0], main: p[1] } : { top: '', main: p[0] } };
  // el brillo de cada caja de lujo (el color de su categoria, el mismo de su imagen); las de skins, dorado
  const GLOW = { 'lujo-relojes-calle': '#ffc43a', 'lujo-relojes': '#ffc43a', 'lujo-zapatillas-basicas': '#3ee270', 'lujo-zapatillas': '#3ee270', 'lujo-tecnologia-basica': '#48a0ff', 'lujo-tecnologia': '#48a0ff',
    'lujo-moda-calle': '#c060ff', 'lujo-moda-joyas': '#c060ff', 'lujo-motos': '#ff4848', 'lujo-coches': '#ff4848',
    // las 16 de Gemini (db/046): el color de su caja
    'lujo-gaming': '#a855f7', 'lujo-zapatillas-2026': '#ff8a2a', 'lujo-relojes-2026': '#ffc43a', 'lujo-tecnologia-2026': '#ff4fb0', 'lujo-motor': '#ff4848', 'lujo-joyas': '#34d6d6', 'lujo-perfumes': '#ff9eb5',
    'lujo-bolsos': '#e0c9a0', 'lujo-viajes': '#48a0ff', 'lujo-patinetes': '#a6e22e', 'lujo-camaras': '#c8ccd2', 'lujo-streetwear': '#e6e6e6', 'lujo-oro': '#ffb020', 'lujo-cripto': '#ff9a1f', 'lujo-gafas': '#ffd23a', 'lujo-cartas': '#a855f7' };
  const brillo = (c) => GLOW[c && c.id] || '#f2c14e';
  const esLujo = (id) => /^(lujo|cos)-/.test(String(id || ''));
  const catDe = (c) => { const k = c && (c.cat || c.category || c.categoria); return k ? (/lujo/i.test(k) ? 'lujo' : /cosm/i.test(k) ? 'cosmeticos' : 'skins') : /^cos-/.test(String((c && c.id) || '')) ? 'cosmeticos' : esLujo(c && c.id) ? 'lujo' : 'skins' };
  const grupoDe = (c) => (catDe(c) === 'skins' ? 'cs2' : GRUPO_DE[c && c.id] || GRUPOS[GRUPOS.length - 1][0]);
  // las categorias que tienen alguna caja ahora mismo (con Lujo en mantenimiento solo sale CS2 y no hay pestanas) y la que esta abierta
  const gruposVivos = () => GRUPOS.filter((g) => (D.cases || []).some((c) => grupoDe(c) === g[0]));
  const grupoAbierto = (vivos) => (vivos.some((g) => g[0] === S.cat) ? S.cat : vivos.length ? vivos[0][0] : 'cs2');
  const caja = (id) => (D.cases && D.cases.find((c) => c.id === id)) || D.caja.get(id) || {};
  // cajas sin abrir (las regala la ruleta de la semana): las tuyas, de una caja o todas
  const mias = (cid) => (D.cajasDe.get(ctx && ctx.me) || []).filter((o) => !cid || o.case_id === cid);
  const jug = (id) => (ctx && ctx.jugadores.find((j) => j.id === id)) || { id, n: '·', color: 'pm' };
  const av = (id, cls = '') => { const j = jug(id); return `<span class="av ${esc(j.color)} ${j.photo ? 'ph' : ''} ${cls}" title="${esc(j.n)}">${esc(j.ini || String(j.n || '·').slice(0, 1).toUpperCase())}</span>` };
  const msgErr = (e) => {
    const m = (e && (e.message || e.error_description)) || 'Algo ha fallado';
    return /Could not find the function|PGRST202|cs_cases|schema cache/i.test(m + (e && e.code)) ? 'Las cajas aún no están en la base: falta cargar db/007_cajas.sql, 012_cajas_mas.sql y 012b_cajas_datos.sql.' : m;
  };
  const avisa = (html) => ctx && ctx.toast && ctx.toast(html);
  const traduce = (el) => { if (window.GM_LANG && el) GM_LANG.traduce(el) };
  const vistas = () => { try { return JSON.parse(lee('cj-vistas') || '[]') } catch { return [] } };
  const visto = (id) => vistas().includes(id);
  const marcaVisto = (id) => { const v = vistas().filter((x) => x !== id); v.push(id); guarda('cj-vistas', JSON.stringify(v.slice(-200))) };
  const reciente = (b) => Date.now() - (Date.parse(b.done_at || b.at) || 0) < 3 * 864e5;
  // la vista sube arriba al cambiar de pantalla dentro de Cajas
  const arriba = () => { const sc = root && root.closest('.scr'); if (sc && sc.scrollTop > 0) sc.scrollTop = 0 };
  const idioma = () => (window.GM_LANG && GM_LANG.get() === 'en' ? 'en-GB' : 'es-ES');
  // "hace 2 horas", "ayer", "28 oct" en el idioma elegido (no pasa por el diccionario)
  function cuando(t) {
    const at = Date.parse(t), ms = Date.now() - at;
    if (!isFinite(ms)) return '';
    try {
      const rtf = new Intl.RelativeTimeFormat(idioma(), { numeric: 'auto', style: 'short' });
      if (ms < 36e5) return rtf.format(-Math.max(1, Math.round(ms / 6e4)), 'minute');
      if (ms < 864e5) return rtf.format(-Math.round(ms / 36e5), 'hour');
      if (ms < 6 * 864e5) return rtf.format(-Math.round(ms / 864e5), 'day');
      return new Intl.DateTimeFormat(idioma(), { day: 'numeric', month: 'short' }).format(new Date(at)).replace('.', '');
    } catch { return '' }
  }
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
  // probabilidad de cada rareza en esta caja: '79,92 %'
  function probs(info) {
    const PESO = D.cases && D.cases.some((c) => c.cat != null) ? PESO_012 : PESO_007;
    const hay = info ? ORDEN.filter((r) => info.por[r]) : ORDEN, tot = hay.reduce((a, r) => a + PESO[r], 0), o = {};
    for (const r of hay) o[r] = ((PESO[r] / tot) * 100).toFixed(2).replace(/\.?0+$/, '').replace('.', ',') + ' %';
    return o;
  }

  // probabilidad de cada rareza (fraccion) y de cada objeto dentro de ella, para "lo que trae"
  function probN(info) { const PESO = D.cases && D.cases.some((c) => c.cat != null) ? PESO_012 : PESO_007, hay = info ? ORDEN.filter((r) => info.por[r]) : ORDEN, tot = hay.reduce((a, r) => a + PESO[r], 0), o = {}; for (const r of hay) o[r] = PESO[r] / tot; return o }
  const pctTxt = (f) => { const v = f * 100, t = (v >= 10 ? v.toFixed(1) : v >= 0.1 ? v.toFixed(2) : v.toFixed(3)).replace('.', ','); return t.replace(/(,\d*?)0+$/, '$1').replace(/,$/, '') + ' %' };

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
  // las terminadas, de todas las fechas, por paginas: se leen de las tablas (los jugadores pueden leerlas).
  // cs_state solo trae las de los ultimos 14 dias; si la lectura falla se usan esas.
  const aBat = (r) => ({ id: r.id, mode: r.mode, cases: r.cases || [], cost: r.cost, status: r.status, by: r.created_by, winner: r.winner, totals: r.totals,
    at: r.created_at, done_at: r.done_at, seats: (r.cs_battle_seats || []).slice().sort((x, y) => x.seat - y.seat) });
  async function cargaHechas() {
    const pag = S.pag, a = pag * POR_PAG;
    try {
      const { data, error, count } = await ctx.db.from('cs_battles').select(SEL_BAT, { count: 'exact' }).eq('status', 'done')
        .order('done_at', { ascending: false, nullsFirst: false }).order('id', { ascending: false }).range(a, a + POR_PAG - 1);
      if (error) throw error;
      const total = count == null ? (data || []).length : count;
      if (pag > 0 && !(data || []).length && total) { S.pag = Math.max(0, Math.ceil(total / POR_PAG) - 1); return cargaHechas() }
      D.hechas = { pag, total, rows: (data || []).map(aBat), local: false };
    } catch { D.hechas = { local: true } }
  }
  // cs_owned: lo que tiene cada uno sin abrir (status own). Si la tabla aun no esta, nada
  async function cargaMias(quien) {
    try {
      const { data, error } = await ctx.db.from('cs_owned').select('id,case_id,source,created_at').eq('player', quien).eq('status', 'own').order('created_at', { ascending: true });
      if (error) throw error;
      D.cajasDe.set(quien, data || []);
    } catch { D.cajasDe.set(quien, []) }
  }
  async function cargar(fuerza) {
    if (!ctx) return;
    if (cargando) { if (fuerza) otraVez = true; return cargando }
    if (!fuerza && Date.now() - ultima < 1500) return;
    cargando = (async () => {
      try {
        // Lujo en mantenimiento (PM 30-10): solo las cajas de skins de CS2 se ven y se abren
        if (!D.cases) D.cases = ((await rpc('cs_cases')) || []).filter((c) => catDe(c) === 'skins');
        const st = await rpc('cs_state', { p_player: S.quien || ctx.me });
        await asegura([...st.inv, ...st.feed].map((i) => i.item));
        D.st = st; D.err = null;
        await cargaMias(ctx.me);
        if (S.quien && S.quien !== ctx.me) await cargaMias(S.quien);
        if (S.caja) await cargaCaja(S.caja);
        if (S.bat) await cargaBat(S.bat);
        else if (S.tab === 'batallas') await cargaHechas();
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
    // los botones que piden confirmacion (cancelar, salir, vender) se ponen en rojo mientras esperan el segundo toque,
    // tambien el de la batalla abierta
    root.querySelectorAll('[data-cj]').forEach((b) => { const f = ARMADO[b.dataset.cj]; if (f) b.classList.toggle('armado', S.sure === f(b.dataset.v)) });
    traduce(root);
    if (!anim && S.tab === 'batallas' && S.bat && !S.rep) {
      const b = D.bats.get(S.bat);
      if (b && b.status === 'done' && !visto(b.id)) repeticion(b);
    }
  }
  // un puntito en Batallas si hay una abierta a la que unirse o un resultado tuyo sin ver
  function hayAviso() {
    if (!D.st || !ctx) return false;
    return D.st.battles.some((b) => { const dentro = b.seats.some((x) => x.player === ctx.me); return b.status === 'open' ? !dentro : dentro && reciente(b) && !visto(b.id) });
  }
  function vista() {
    const tabs = [['abrir', 'Abrir'], ['inventario', 'Inventario'], ['batallas', 'Batallas']], dot = hayAviso();
    const cab = `<nav class="cj-tabs">${tabs.map(([k, n]) => `<button class="cj-tab ${S.tab === k ? 'on' : ''}" data-cj="tab" data-v="${k}">${n}${k === 'batallas' && dot ? '<i class="cj-dot"></i>' : ''}</button>`).join('')}</nav>`;
    if (!D.st || !D.cases) return cab + `<p class="hint cj-c">${D.err ? esc(D.err) : 'Cargando…'}</p>`;
    return cab + (S.tab === 'abrir' ? vAbrir() : S.tab === 'inventario' ? vInv() : S.bat ? vBat() : S.nueva ? vNueva() : vBatallas());
  }

  // una skin (u objeto de lujo) en rejilla: imagen sobre el color de su rareza, arma, nombre, desgaste y valor
  function tile(it, ex = {}) {
    const n = nombre(it), top = n.top || ex.top || '', main = n.main, tag = ex.boton ? 'button' : 'div';
    return `<${tag} class="cj-it ${ex.on ? 'on' : ''} ${it.rarity || ''}" style="--c:${color(it.rarity)}" title="${esc(it.name)}" ${ex.boton || ''}>
      <span class="cj-it-img">${pic(it.image, 256)}</span>
      <span class="cj-it-t">${top ? `<span class="lab" data-notr>${esc(top)}</span>` : ''}
        <b data-notr>${it.rarity === 'esp' && n.top ? '★ ' : ''}${esc(main)}</b>
        ${ex.meta ? `<em>${ex.meta}</em>` : ''}
        ${ex.pct != null ? `<span class="cj-pct">${pctTxt(ex.pct)}</span>` : ''}
        ${ex.valor != null ? `<span class="v">${ex.desde ? '<i>desde</i>' : ''}${N(ex.valor)}${coin()}</span>` : ''}</span>
    </${tag}>`;
  }
  // StatTrak y desgaste (lo de lujo no tiene desgaste)
  const metaDe = (i) => `${i.st ? '<i class="cj-st">StatTrak</i>' : ''}${i.wear != null ? `<span>${WEAR[i.wear]}</span>` : esLujo(i.item) ? '' : '<span>Sin desgaste</span>'}`;
  // "skins" si todo es de CS2, "objetos" si hay algo de lujo
  const cuantas = (n, lista) => { const o = lista.some((i) => esLujo(i.item)); return n === 1 ? (o ? '1 objeto' : '1 skin') : `${N(n)} ${o ? 'objetos' : 'skins'}` };
  const seg = (accion, opciones, actual, cls = '') => `<nav class="cj-seg ${cls}">${opciones.map(([k, n]) => `<button class="${actual === k ? 'on' : ''}" data-cj="${accion}" data-v="${k}">${n}</button>`).join('')}</nav>`;

  /* ----- abrir ----- */
  // PM, 01-11: la pantalla de abrir una caja es una tira ancha de premios (parada, con la caja en el centro; al abrir corre y frena
  // en el premio), debajo sus botones en una fila y, mas abajo, el contenido de la caja. Una tira por caja abierta, una encima de otra.
  // G (46) es la carta que gana y sonidos.js tambien la cuenta; INI es la carta del centro cuando esta parada.
  const G = 46, INI = 3, TOTAL = 54, DUR = [5600, 1400, 650], PASO = [330, 120, 60], FIN = [750, 250, 120], REPOSO = [1500, 650, 300];
  const sinAnim = () => document.documentElement.classList.contains('sin-anim');
  const valorDe = (x) => { const v = tipico(x); return v == null ? 0 : v };
  // una tira: sus cartas (la del premio en G si ya se sabe) y cuanto se desvia al parar
  function nuevaTira(info, inv) {
    const cs = [];
    // que no salgan dos cartas iguales seguidas (ni a una de distancia) si la caja tiene de donde elegir
    for (let i = 0; i < TOTAL; i++) {
      if (i === G && inv) { cs.push({ x: item(inv.item), v: inv.value }); continue }
      let x = relleno(info);
      for (let k = 0; k < 12 && cs.slice(-2).some((c) => c.x.id === x.id); k++) x = relleno(info);
      cs.push({ x, v: valorDe(x) });
    }
    return { cs, j: inv ? (Math.random() - 0.5) * 0.6 : 0, premio: inv || null };
  }
  function kcard(t, gana) {
    const { x, v } = t, n = nombre(x), sinFoto = x.rarity === 'esp' && !esLujo(x.id) && !x.image;
    return `<div class="cj-k ${gana ? 'gana' : ''}" style="--c:${color(x.rarity)}"><span class="cj-k-i">${sinFoto ? '<i class="cj-k-star">★</i>' : pic(x.image, 256, '', true)}</span>
      ${n.top ? `<em data-notr>${esc(n.top)}</em>` : ''}<b data-notr>${esc(n.main)}</b><span class="cj-k-v">${N(v)}${coin()}</span></div>`;
  }
  function vTira(t, modo, c) {
    const fin = modo === 'fin', col = t.premio ? color(item(t.premio.item).rarity) : color('mil');
    return `<div class="cj-strip ${fin ? 'fin' : ''}" style="--i:${fin ? G : INI};--j:${fin ? t.j.toFixed(3) : 0};--c:${col}"><div class="cj-track">${t.cs.map((k, i) => kcard(k, fin && i === G)).join('')}</div><i class="cj-mark"></i>${modo === 'idle' ? `<span class="cj-box">${pic(c.image, 256, '', true)}</span>` : ''}</div>`;
  }
  // las tiras: paradas con la caja en medio, girando (cj-spin: sonidos.js la oye) o ya paradas en el premio
  function vEscena(c, info) {
    const propias = S.tiras && S.tirasC === c.id && S.fase !== 'idle';
    if (!propias) {
      const k = c.id + '|' + S.n;
      if (!S.tiras || S.tirasK !== k) { S.tiras = Array.from({ length: S.n }, () => nuevaTira(info)); S.tirasK = k; S.tirasC = c.id; S.fase = 'idle' }
    }
    const modo = propias ? S.fase : 'idle', test = S.prueba && modo !== 'idle';
    return `<div class="${modo === 'gira' ? 'cj-spin' : 'cj-idle'} ca-tiras n${S.tiras.length} ${test ? 'prueba' : ''}">${test ? '<span class="ca-badge">Prueba gratis</span>' : ''}
      ${S.tiras.map((t) => vTira(t, modo, c)).join('')}${modo === 'gira' ? '<button class="cj-skip" data-cj="saltar">Saltar</button>' : ''}</div>`;
  }
  function vAbrir() {
    const c = S.caja && (D.cases.find((x) => x.id === S.caja) || D.caja.get(S.caja));
    if (!c) return vCajas();
    const info = D.caja.get(c.id), cat = (GRUPOS.find((k) => k[0] === grupoDe(c)) || GRUPOS[0])[1];
    const cab = `<header class="ca-h"><button class="cj-back" data-cj="cajas">Atrás</button>
      <div class="ca-id"><span class="ca-img">${pic(c.image, 256, '', true)}</span><div class="ca-nm"><h2 data-notr>${esc(c.name)}</h2><span class="lab">${cat}</span></div></div>
      <p class="ca-price"><b class="num">${N(c.price)}</b>${coin()}<em>por caja</em></p></header>`;
    if (!info) return `<section class="ca" style="--g:${brillo(c)}">${cab}<p class="hint cj-c">Cargando lo que trae…</p></section>`;
    const esperaSrv = ocupado && !anim, busy = !!anim || ocupado, total = c.price * S.n, falta = ctx.saldo < total, tuyas = mias(c.id), off = busy || S.auto ? 'disabled' : '';
    const go = S.auto ? '<button class="go ca-go ca-stop" data-cj="parar"><i></i><span>Parar</span></button>'
      : `<button class="go ca-go" data-cj="abrir" ${falta || busy ? 'disabled' : ''}>${esperaSrv ? '<span>Abriendo…</span>' : `<span>${falta ? 'Sin saldo' : 'Abrir por'}</span><b>${N(total)}</b>${coin()}`}</button>`;
    const barra = `<div class="ca-bar">
      <button class="ca-try" data-cj="prueba" ${off}>Prueba gratis</button>
      <div class="ca-ns" role="group" aria-label="Cuántas">${[1, 2, 3, 4, 5].map((n) => `<button class="${S.n === n ? 'on' : ''}" data-cj="n" data-v="${n}" ${off}>${n}</button>`).join('')}</div>
      ${go}
      ${seg('vel', [['0', 'Normal'], ['1', 'Rápido'], ['2', 'Ultra']], S.vel, 'sm ca-vel')}
      <button class="cj-fast ca-auto ${S.auto ? 'on' : ''}" data-cj="auto" aria-pressed="${S.auto}" ${busy || S.auto || falta ? 'disabled' : ''}><i></i><span>Giro automático</span></button>
    </div>
    ${tuyas.length ? `<button class="go ghost ca-mia" data-cj="abrirMia" data-v="${tuyas[0].id}" ${busy ? 'disabled' : ''}><span>${tuyas.length === 1 ? 'Abrir la tuya' : 'Abrir una tuya'}</span>${tuyas.length > 1 ? `<b>×${tuyas.length}</b>` : ''}</button>` : ''}
    ${falta && !tuyas.length && !S.auto ? `<p class="hint ca-hint">Tienes ${N(ctx.saldo)}. La paga del lunes llega sola.</p>` : ''}`;
    return `<section class="ca" style="--g:${brillo(c)}">${cab}${vEscena(c, info)}${vResultado(c)}${barra}</section>${vContenido(info)}`;
  }
  // lo que ha salido: cada premio con su valor y, si es de verdad, Vender. Si fue una prueba, solo se dice lo que habria salido
  function vResultado(c) {
    const r = S.res; if (!r || r.caja !== c.id || S.tirasC !== c.id) return '';
    const it = r.items, uno = it.length === 1, vivas = it.filter((i) => i.status !== 'sold');
    const suma = vivas.reduce((a, i) => a + i.value, 0), todo = it.reduce((a, i) => a + i.value, 0), total = c.price * r.n;
    const filas = it.map((i) => {
      const x = item(i.item), { top, main } = nombre(x), vendida = i.status === 'sold';
      return `<div class="ca-rw ${vendida ? 'sold' : ''}" style="--c:${color(x.rarity)}"><span class="ca-rw-i">${pic(x.image, 256)}</span>
        <span class="ca-rw-t">${top ? `<span class="lab" data-notr>${esc(top)}</span>` : `<span class="lab">${(RAR[x.rarity] || RAR.mil)[0]}</span>`}<b data-notr>${x.rarity === 'esp' && top ? '★ ' : ''}${esc(main)}</b></span>
        <span class="ca-rw-v">${N(i.value)}${coin()}</span>
        ${r.prueba ? '' : vendida ? '<span class="cj-sold">Vendida</span>' : `<button class="chip" data-cj="vender1" data-v="${i.id}">Vender</button>`}</div>`;
    }).join('');
    if (r.prueba) return `<div class="ca-got prueba"><p class="ca-test"><b>Prueba gratis</b><span>No se ha cobrado ni ganado nada. Es solo para ver cómo gira.</span></p>${filas}</div>`;
    return `<div class="ca-got">${uno ? '' : `<p class="ca-sum"><span class="lab">Has sacado</span><b class="num">${N(todo)}</b>${coin()}<em>por ${N(total)}</em></p>`}${filas}
      ${vivas.length ? `<button class="go ghost ca-sell" data-cj="venderRes">${S.sure === 'res' ? '<span>¿Seguro? Toca otra vez</span>' : `<span>${uno ? 'Vender por' : 'Vender todo por'}</span><b>${N(suma)}</b>${coin()}`}</button>` : ''}</div>`;
  }
  function vCajas() {
    const vivos = gruposVivos(), dos = vivos.length > 1, abierto = grupoAbierto(vivos);
    const lista = dos ? D.cases.filter((x) => grupoDe(x) === abierto) : D.cases;
    // las pestanas llevan cuantas cajas tiene cada categoria
    return `${dos ? seg('cat', vivos.map(([k, t]) => [k, `${t}<em>${D.cases.filter((x) => grupoDe(x) === k).length}</em>`]), abierto, 'cj-cat') : ''}
      <section class="cj-cases">${lista.map((x) => `<button class="cj-case ${catDe(x)}" data-cj="caja" data-v="${esc(x.id)}" style="--g:${brillo(x)}">
        <span class="cj-case-img">${pic(x.image, 256)}${mias(x.id).length ? `<i class="cj-case-own" title="Tuyas sin abrir">${mias(x.id).length}</i>` : ''}</span>
        <span class="cj-case-n" data-notr>${esc(x.name)}</span>
        <span class="cj-case-p">${N(x.price)}${coin()}</span></button>`).join('')}</section>
      ${vFeed()}`;
  }
  // el contenido de la caja: una sola rejilla, de más a menos valor, con la franja de su rareza y el % arriba a la derecha
  function vContenido(info) {
    const pn = probN(info), filas = [];
    for (const r of ORDEN) {
      const list = info.por[r]; if (!list) continue;
      const wsum = list.reduce((a, it) => a + (it.weight || 100), 0) || 1;
      if (r === 'esp') {
        // las fases de un Doppler cuentan como una: se pinta una y "desde" lo que vale la mas barata
        const por = new Map();
        for (const it of list) { const v = tipico(it), w = it.weight || 100, p = por.get(it.name); if (!p) por.set(it.name, { it, v, n: 1, w }); else { p.n++; p.w += w; if (v != null && (p.v == null || v < p.v)) p.v = v } }
        for (const p of por.values()) filas.push({ it: { ...p.it, phase: null }, v: p.v, desde: p.n > 1, pct: pn[r] * p.w / wsum });
      } else for (const it of list) filas.push({ it, v: tipico(it), pct: pn[r] * (it.weight || 100) / wsum });
    }
    filas.sort((a, b) => (b.v || 0) - (a.v || 0));
    return `<section class="cj-cont ca-cont"><header class="cj-sec-h"><h3>Contenido de la caja</h3></header><div class="ca-grid">${filas.map((f) => {
      const x = f.it, n = nombre(x);
      return `<div class="ca-c" style="--c:${color(x.rarity)}" title="${esc(x.name)}"><span class="ca-pct">${pctTxt(f.pct)}</span><span class="ca-ci">${pic(x.image, 256)}</span>
        <span class="ca-ct">${n.top ? `<em data-notr>${esc(n.top)}</em>` : ''}<b data-notr>${esc(n.main)}</b></span><span class="ca-cv">${f.desde ? '<i>desde</i>' : ''}${N(f.v || 0)}${coin()}</span></div>`;
    }).join('')}</div></section>`;
  }
  function vFeed() {
    const f = D.st.feed; if (!f.length) return '';
    return `<section class="cj-feed-s"><header class="cj-sec-h"><h3>Lo último que ha salido</h3></header><div class="cj-feed">${f.map((i) => {
      const x = item(i.item), { main } = nombre(x), top = nombre(x).top || (esLujo(x.id) ? caja(i.case).name || '' : '');
      return `<div class="cj-fd" style="--c:${color(x.rarity)}" title="${esc(x.name)}"><span class="cj-fd-img">${pic(x.image, 256)}</span>
        <span class="cj-fd-n" data-notr>${top ? `<em>${esc(top)}</em>` : ''}${esc(main)}</span>
        <span class="cj-fd-b">${av(i.by, 'sm')}<span class="cj-fd-v">${N(i.value)}${coin()}</span></span></div>`;
    }).join('')}</div></section>`;
  }

  /* ----- inventario ----- */
  function ordena(l) {
    const a = l.slice();
    if (S.orden === 'nuevas') a.sort((x, y) => (Date.parse(y.at) || 0) - (Date.parse(x.at) || 0) || y.id - x.id);
    else if (S.orden === 'rareza') a.sort((x, y) => (RANGO[item(x.item).rarity] ?? 9) - (RANGO[item(y.item).rarity] ?? 9) || y.value - x.value);
    else a.sort((x, y) => y.value - x.value || y.id - x.id);
    return a;
  }
  function vInv() {
    const quien = S.quien || ctx.me, mio = quien === ctx.me, st = D.st;
    const fila = `<nav class="cj-pls">${st.players.map((p) => `<button class="cj-pl ${p.id === quien ? 'on' : ''}" data-cj="quien" data-v="${esc(p.id)}">${av(p.id, 'xl')}<span class="cj-pl-t"><b data-notr>${esc(jug(p.id).n)}</b><em>${N(p.value)}${coin()}</em></span></button>`).join('')}</nav>`;
    if (st.who !== quien) return fila + '<p class="hint cj-c">Cargando…</p>';
    const inv = st.inv, total = inv.reduce((a, i) => a + i.value, 0), own = D.cajasDe.get(quien) || [], grupos = new Map();
    for (const o of own) { if (!grupos.has(o.case_id)) grupos.set(o.case_id, []); grupos.get(o.case_id).push(o.id) }
    const tuyas = own.length ? `<section class="cj-own"><span class="lab">${mio ? 'Tus cajas' : 'Cajas sin abrir'}</span><div class="cj-own-l">${[...grupos].map(([cid, ids]) => `<div class="cj-ob ${catDe(caja(cid))}">
        <span class="cj-ob-img">${pic(caja(cid).image, 256)}${ids.length > 1 ? `<i>×${ids.length}</i>` : ''}</span><b data-notr>${esc(caja(cid).name || cid)}</b>
        ${mio ? `<button class="go" data-cj="abrirMia" data-v="${ids[0]}"><span>Abrir</span></button>` : ''}</div>`).join('')}</div></section>` : '';
    const head = `<header class="cj-inv-h"><span class="lab">${mio ? 'Tu inventario' : esc('Inventario de ' + jug(quien).n)}</span>
      <div class="cj-big">${N(total)}${coin()}</div><span class="cj-sub">${cuantas(inv.length, inv)}</span></header>`;
    if (!inv.length) return `${fila}${tuyas}${head}<div class="cj-empty">${mio ? '<p>Aún no tienes skins. Abre una caja o gana una batalla.</p><button class="go" data-cj="tab" data-v="abrir"><span>Abrir una caja</span></button>' : '<p>Todavía no tiene skins.</p>'}</div>`;
    // filtros: rareza y caja (solo las que hay); si el filtro se queda vacio (se ha vendido todo) se quita
    const nR = {}, nC = new Map();
    for (const i of inv) { const r = item(i.item).rarity; nR[r] = (nR[r] || 0) + 1; if (i.case) nC.set(i.case, (nC.get(i.case) || 0) + 1) }
    if (S.fR && !nR[S.fR]) S.fR = null;
    if (S.fC && !nC.has(S.fC)) S.fC = null;
    const rars = ORDEN.filter((r) => nR[r]);
    const vis = ordena(inv.filter((i) => (!S.fR || item(i.item).rarity === S.fR) && (!S.fC || i.case === S.fC))), ver = vis.slice(0, S.invN);
    const sel = mio ? inv.filter((i) => S.sel.has(i.id)) : [], selV = sel.reduce((a, i) => a + i.value, 0);
    const baratas = mio ? inv.filter((i) => i.value < BARATA && !S.sel.has(i.id)).length : 0, faltan = vis.filter((i) => !S.sel.has(i.id)).length;
    const filtrado = S.fR || S.fC;
    const filtros = inv.length < 2 ? '' : `<div class="cj-filt">
        ${seg('orden', ORDENES, S.orden, 'sm')}
        ${rars.length > 1 ? `<nav class="cj-rars"><button class="${!S.fR ? 'on' : ''}" data-cj="fR" data-v="">Todas</button>${rars.map((r) => `<button class="${S.fR === r ? 'on' : ''}" style="--c:${color(r)}" data-cj="fR" data-v="${r}"><i></i><span>${RAR[r][0]}</span><b>${nR[r]}</b></button>`).join('')}</nav>` : ''}
      </div>
      ${nC.size > 1 ? `<nav class="cj-fcs"><button class="cj-fc ${!S.fC ? 'on' : ''}" data-cj="fC" data-v=""><span>Todas las cajas</span></button>${[...nC].sort((a, b) => b[1] - a[1]).map(([id, n]) => `<button class="cj-fc ${S.fC === id ? 'on' : ''}" data-cj="fC" data-v="${esc(id)}" title="${esc(caja(id).name || '')}">${pic(caja(id).image, 128)}<span data-notr>${esc(caja(id).name || id)}</span><b>${n}</b></button>`).join('')}</nav>` : ''}`;
    const herramientas = mio ? `<div class="cj-tools"><span class="hint">Toca una para elegirla</span>
        ${faltan > 1 ? `<button class="chip" data-cj="todas">Elegir las ${faltan}</button>` : ''}
        ${baratas && !filtrado ? `<button class="chip" data-cj="baratas">Elegir las de menos de ${BARATA}</button>` : ''}
        ${D.st.inv.length ? `<button class="chip cj-todo ${S.sure === 'todo' ? 'on' : ''}" data-cj="vendertodo">${S.sure === 'todo' ? `¿Vender las ${N((S.todo || []).length)} por ${N((S.todo || []).reduce((a, x) => a + x.value, 0))}? Toca otra vez` : 'Vender todo el inventario'}</button>` : ''}</div>` : '';
    return `${fila}${tuyas}${head}${herramientas}${filtros}
      ${filtrado ? `<p class="cj-count"><span>${cuantas(vis.length, vis)}</span><span class="num">${N(vis.reduce((a, i) => a + i.value, 0))}${coin()}</span><button class="chip" data-cj="sinfiltro">Quitar filtros</button></p>` : ''}
      <div class="cj-grid cj-inv">${ver.map((i) => tile(item(i.item), { top: caja(i.case).name, meta: metaDe(i), valor: i.value, on: S.sel.has(i.id), boton: mio ? `data-cj="sel" data-v="${i.id}"` : '' })).join('')}</div>
      ${vis.length > ver.length ? `<div class="cj-more"><button class="chip" data-cj="mas">Ver ${Math.min(INV_PASO, vis.length - ver.length)} más</button></div>` : ''}
      ${sel.length ? `<div class="cj-bar"><span class="cj-bar-l"><b>${cuantas(sel.length, sel)}</b><em>${N(selV)}${coin()}</em><button class="chip" data-cj="nosel">Quitar</button></span>
        <span class="cj-bar-b"><button class="go" data-cj="vender">${S.sure === 'inv' ? '<span>¿Seguro? Toca otra vez</span>' : `<span>Vender por</span><b>${N(selV)}</b>${coin()}`}</button></span></div>` : ''}`;
  }

  /* ----- batallas ----- */
  const tamDe = (b) => (b.mode === '1v1' ? 2 : 4);
  // las terminadas de esta pagina: de la base si se ha podido, si no las de cs_state
  function hechas() {
    const h = D.hechas;
    if (h && !h.local) return { rows: h.rows, total: h.total, pags: Math.max(1, Math.ceil(h.total / POR_PAG)), espera: h.pag !== S.pag };
    const all = D.st.battles.filter((b) => b.status === 'done'), pags = Math.max(1, Math.ceil(all.length / POR_PAG));
    if (S.pag >= pags) S.pag = pags - 1;
    return { rows: all.slice(S.pag * POR_PAG, (S.pag + 1) * POR_PAG), total: all.length, pags };
  }
  // PM, 30-10: "en battles una leaderboard del total ganado de cada uno, el top 3 que más ganaron"
  let TOPB = null, topT = 0;
  function topBat() {
    if (!TOPB || Date.now() - topT > 60000) {
      topT = Date.now();
      ctx.db.from('cs_battles').select('mode,winner,totals,cs_battle_seats(seat,player)').eq('status', 'done').limit(1000).then(({ data }) => {
        const t = {};
        for (const b of data || []) {
          const mitad = b.mode === '1v1' ? 1 : 2, bote = (b.totals || []).reduce((a, v) => a + (v || 0), 0);
          const gan = (b.cs_battle_seats || []).filter((x) => Math.floor(x.seat / mitad) === b.winner);
          for (const g of gan) { const o = t[g.player] || (t[g.player] = { won: 0, n: 0 }); o.won += bote / gan.length; o.n++ }
        }
        TOPB = Object.entries(t).sort((a, b) => b[1].won - a[1].won).slice(0, 3);
        if (S.tab === 'batallas' && !S.bat) pinta();
      });
    }
    if (!TOPB || !TOPB.length) return '';
    return `<section class="cj-top"><span class="lab">Los que más han ganado en batallas</span><div class="cj-top-r">${TOPB.map(([u, o], i) => `<div class="cj-top-p p${i + 1}"><span class="pos">${i + 1}</span>${av(u, 'xl')}<b>${esc(jug(u).n)}</b><span class="v">${N(o.won)}${coin()}</span><small>${o.n} ${o.n === 1 ? 'batalla ganada' : 'batallas ganadas'}</small></div>`).join('')}</div></section>`;
  }
  function vBatallas() {
    const abiertas = D.st.battles.filter((b) => b.status === 'open'), H = hechas();
    return `${topBat()}<header class="cj-bh"><p class="cj-lead">Cada uno abre las mismas cajas. El lado que saque más valor se lleva todas las skins.</p>
        <button class="go" data-cj="nueva"><span>Crear batalla</span></button></header>
      <section class="cj-bl"><header class="cj-bl-h"><h3>Abiertas</h3>${abiertas.length ? `<span class="num">${abiertas.length}</span>` : ''}</header>
        ${abiertas.length ? `<div class="cj-bts">${abiertas.map(filaBat).join('')}</div>` : '<p class="hint">Ninguna abierta ahora mismo.</p>'}</section>
      <section class="cj-bl" data-hechas><header class="cj-bl-h"><h3>Terminadas</h3>${H.total ? `<span class="num">${N(H.total)}</span>` : ''}</header>
        ${H.rows.length ? `<div class="cj-bts ${H.espera ? 'espera' : ''}">${H.rows.map(filaBat).join('')}</div>${pager(H)}` : '<p class="hint">Todavía no ha terminado ninguna.</p>'}</section>`;
  }
  // un lado de la fila: avatares, nombres y (si ha terminado) lo que ha sacado
  function lado(b, t, unir) {
    const mitad = tamDe(b) / 2, done = b.status === 'done', dentro = b.seats.some((x) => x.player === ctx.me);
    const ss = Array.from({ length: mitad }, (_, i) => ({ s: t * mitad + i, x: b.seats.find((y) => y.seat === t * mitad + i) }));
    const avs = ss.map(({ s, x }) => x ? av(x.player, 'md')
      : unir && !dentro && b.status === 'open' && ctx.saldo >= b.cost ? `<button class="cj-seat" data-cj="unir" data-v="${b.id}|${s}" title="Unirme aquí">+</button>` : '<span class="cj-seat"></span>').join('');
    const nombres = ss.filter(({ x }) => x).map(({ x }) => esc(jug(x.player).n)).join(' y ');
    const gana = done && b.winner === t;
    return `<span class="cj-side s${t} ${done ? (gana ? 'win' : 'lose') : ''}"><span class="cj-avs">${avs}</span>
      <span class="cj-side-n"><b data-notr>${nombres || '&nbsp;'}</b>${gana ? '<i class="cj-crown" title="Ganador"></i>' : ''}</span>
      ${done && b.totals ? `<span class="num">${N(b.totals[t])}</span>` : ''}</span>`;
  }
  function filaBat(b) {
    const dentro = b.seats.some((x) => x.player === ctx.me), mio = b.by === ctx.me, done = b.status === 'done', nueva = done && dentro && reciente(b) && !visto(b.id);
    const n = b.cases.length, muestra = b.cases.slice(0, 4);
    const cs = `${muestra.map((cid) => pic(caja(cid).image, 128)).join('')}${n > muestra.length ? `<em>+${n - muestra.length}</em>` : ''}`;
    const vs = `<span class="cj-vs">${lado(b, 0, true)}<i>vs</i>${lado(b, 1, true)}</span>`;
    const meta = (cases) => `<span class="cj-bt-meta"><span class="cj-bt-m"><b>${b.mode}</b><em>${n === 1 ? '1 ronda' : n + ' rondas'}</em></span>${cases}
      <span class="cj-bt-wh">${done ? `<span data-notr>${cuando(b.done_at || b.at)}</span>` : `<b class="num">${N(b.cost)}</b>${coin()}<em>por cabeza</em>`}</span></span>`;
    // en el movil no cabe la hora: el precio va en el boton de unirse
    if (done) return `<button class="cj-bt done ${dentro ? 'mia' : ''}" data-cj="ver" data-v="${b.id}">${meta(`<span class="cj-bt-cs">${cs}</span>`)}${vs}
      <span class="cj-bt-act"><span class="cj-ver ${nueva ? 'nueva' : ''}">${nueva ? 'Ver el resultado' : 'Ver'}</span></span></button>`;
    // cancelar (la tuya) o salir: boton rojo; al tocarlo pregunta en claro y dice cuanto te devuelve
    let act, pide = false;
    if (mio || dentro) {
      pide = S.sure === 'salir' + b.id;
      act = pide ? `<span class="cj-conf"><span class="cj-conf-t">${mio ? '¿Cancelar la batalla?' : '¿Salir de la batalla?'}</span>
          <button class="cj-no" data-cj="nosure">No</button>
          <button class="cj-danger armado" data-cj="salir" data-v="${b.id}"><span>${mio ? 'Sí, cancelar' : 'Sí, salir'}</span><em>+${N(b.cost)}</em>${coin()}</button></span>`
        : `<button class="cj-danger" data-cj="salir" data-v="${b.id}"><i></i><span>${mio ? 'Cancelar' : 'Salir'}</span></button>`;
    } else act = ctx.saldo >= b.cost ? `<button class="go" data-cj="unir" data-v="${b.id}|"><span>Unirme</span><b>${N(b.cost)}</b>${coin()}</button>` : '<span class="hint">Sin saldo</span>';
    return `<div class="cj-bt open ${pide ? 'pide' : ''}">${meta(`<button class="cj-bt-cs" data-cj="ver" data-v="${b.id}" title="Ver">${cs}</button>`)}${vs}<span class="cj-bt-act">${act}</span></div>`;
  }
  function pager(H) {
    if (H.pags <= 1) return '';
    const p = Math.min(S.pag, H.pags - 1), nums = [];
    for (let i = 0; i < H.pags; i++) if (i === 0 || i === H.pags - 1 || Math.abs(i - p) <= 1) nums.push(i); else if (nums[nums.length - 1] !== -1) nums.push(-1);
    return `<nav class="cj-pager" aria-label="Páginas">
      <button class="cj-pg prev" data-cj="pag" data-v="${p - 1}" ${p === 0 ? 'disabled' : ''} aria-label="Anterior"></button>
      ${nums.map((i) => (i < 0 ? '<span>…</span>' : `<button class="${i === p ? 'on' : ''}" data-cj="pag" data-v="${i}">${i + 1}</button>`)).join('')}
      <button class="cj-pg next" data-cj="pag" data-v="${p + 1}" ${p >= H.pags - 1 ? 'disabled' : ''} aria-label="Siguiente"></button></nav>`;
  }
  function vNueva() {
    const nv = S.nueva, tam = nv.mode === '1v1' ? 2 : 4, n = nv.cases.length;
    const cuesta = nv.cases.reduce((a, id) => a + (caja(id).price || 0), 0), falta = cuesta > ctx.saldo;
    const dos = gruposVivos().length > 1;
    const pk = (c) => { const k = nv.cases.filter((x) => x === c.id).length; return `<button class="cj-pk ${k ? 'on' : ''}" data-cj="add" data-v="${esc(c.id)}" ${n >= 10 ? 'disabled' : ''} title="${esc(c.name)}">
      <span class="cj-pk-img">${pic(c.image, 128)}${k ? `<i>${k}</i>` : ''}</span><span class="cj-pk-n" data-notr>${esc(c.name)}</span><span class="cj-pk-p">${N(c.price)}${coin()}</span></button>` };
    const elegir = dos ? GRUPOS.map(([k, t]) => { const l = D.cases.filter((c) => grupoDe(c) === k); return l.length ? `<h4 class="cj-pk-h">${t}</h4><div class="cj-pick">${l.map(pk).join('')}</div>` : '' }).join('') : `<div class="cj-pick">${D.cases.map(pk).join('')}</div>`;
    const puntos = (m) => { const k = m === '1v1' ? 1 : 2, d = '<i></i>'.repeat(k); return `<span class="cj-mode-d">${d}<em>vs</em>${d}</span>` };
    return `<button class="cj-back" data-cj="nueva-x">Batallas</button>
    <section class="cj-new">
      <header class="cj-new-h"><h2>Nueva batalla</h2><p class="cj-lead">El lado que saque más valor se lleva todas las skins.</p></header>
      <div class="cj-modes">${['1v1', '2v2'].map((m) => `<button class="cj-mode ${nv.mode === m ? 'on' : ''}" data-cj="modo" data-v="${m}">${puntos(m)}<b>${m}</b></button>`).join('')}</div>
      <header class="cj-sec-h"><h3>Cajas</h3><span class="cj-sec-s">Toca una caja para añadir una ronda</span></header>
      ${elegir}
      <header class="cj-sec-h"><h3>Rondas</h3><span class="cj-sec-s">${n} de 10</span></header>
      <div class="cj-rounds">${n ? nv.cases.map((id, i) => `<button class="cj-rnd" data-cj="quita" data-v="${i}" title="Quitar">${pic(caja(id).image, 128)}<span>${i + 1}</span></button>`).join('') : '<span class="hint">Aún sin cajas. Hasta 10 rondas.</span>'}</div>
      <footer class="cj-new-go">
        ${n ? `<p class="cj-new-sum"><span class="lab">Cada jugador paga</span><b class="num">${N(cuesta)}</b>${coin()}<em>bote de ${N(cuesta * tam)}</em></p>` : ''}
        ${n ? `<button class="go" data-cj="crear" ${falta ? 'disabled' : ''}><span>${falta ? 'Sin saldo' : 'Crear por'}</span><b>${N(cuesta)}</b>${coin()}</button>` : ''}
      </footer>
    </section>`;
  }

  // PM, 30-10: "lo de las battles se bugea y quiero un diseño mucho mejor".
  // La repeticion va por reloj: cada fotograma saca la ronda y la posicion de cada ruleta de la hora de inicio,
  // y las ruletas se rellenan con un azar con semilla. Si la app repinta a mitad, se vuelve a pintar igual y sigue.
  const KH = 92, GAP = 8, WIN = 212, KN = 34;
  let REP = null, repRaf = 0;
  const RD = () => (S.rapido ? 1700 : 4600), SPIN = () => (quieto() ? 1 : S.rapido ? 1150 : 3500);
  const sem = (x) => () => { x = (x + 0x6D2B79F5) | 0; let t = Math.imul(x ^ (x >>> 15), 1 | x); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
  function rellenoS(info, rnd) {
    if (!info) return null;
    const hay = ORDEN.filter((r) => info.por[r]), tot = hay.reduce((a, r) => a + RELLENO[r], 0);
    let x = rnd() * tot, r = hay[hay.length - 1];
    for (const k of hay) { if (x < RELLENO[k]) { r = k; break } x -= RELLENO[k] }
    const l = info.por[r]; return l[(rnd() * l.length) | 0];
  }
  const kCard = (it, gana) => it.rarity === 'esp' && !esLujo(it.id) && !it.image ? `<div class="bv-k esp ${gana ? 'gana' : ''}"><span>★</span></div>` : `<div class="bv-k ${gana ? 'gana' : ''}" style="--c:${color(it.rarity)}">${pic(it.image, 256, '', true)}</div>`;
  function reel(b, r, seat, e, landed) {
    const d = b.drops.find((x) => x.round === r && x.seat === seat);
    if (!d) return `<div class="bv-reel"></div>`;
    const info = D.caja.get(b.cases[r - 1]), rnd = sem(b.id * 1009 + r * 31 + seat * 7), win = item(d.inv.item), cs = [];
    for (let i = 0; i < KN + 3; i++) cs.push(i === KN ? win : rellenoS(info, rnd) || win);
    const fin = KN * (KH + GAP) - (WIN - KH) / 2 + (rnd() - 0.5) * KH * 0.45;
    const p = landed ? 1 : Math.min(1, Math.max(0, (e - (r - 1) * RD()) / SPIN())), y = fin * (1 - Math.pow(1 - p, 4));
    return `<div class="bv-reel ${landed ? 'ya' : ''}" style="--c:${color(win.rarity)}"><div class="bv-track" data-tr="${seat}" data-fin="${fin.toFixed(1)}" style="transform:translateY(${(-y).toFixed(1)}px)">${cs.map((it, i) => kCard(it, i === KN)).join('')}</div><i class="bv-line"></i></div>`;
  }
  function bvIt(d, nuevo) { const x = item(d.inv.item); return `<span class="bv-it ${nuevo ? 'nuevo' : ''}" style="--c:${color(x.rarity)}" title="${esc(x.name)}">${x.rarity === 'esp' && !x.image ? '<b>★</b>' : pic(x.image, 128)}<em>${N(d.inv.value)}</em></span>` }
  function vBat() {
    const b = D.bats.get(S.bat), atras = '<button class="cj-back" data-cj="batallas">Batallas</button>';
    if (!b) return atras + `<p class="hint">${D.err ? esc(D.err) : 'Cargando batalla…'}</p>`;
    const tam = tamDe(b), mitad = tam / 2, n = b.cases.length, rep = !!(REP && REP.id === b.id);
    const e = rep ? Date.now() - REP.t0 : 0, rNow = rep ? Math.min(n, Math.floor(e / RD()) + 1) : n + 1, landed = rep && e - (rNow - 1) * RD() >= SPIN();
    const visible = (d) => b.status === 'done' && (!rep || d.round < rNow || (d.round === rNow && landed));
    const dr = (st) => b.drops.filter((d) => d.seat === st && visible(d)).sort((x, y) => x.round - y.round);
    const tot = (st) => dr(st).reduce((a, d) => a + d.inv.value, 0);
    const T = [0, 1].map((t) => Array.from({ length: mitad }, (_, i) => tot(t * mitad + i)).reduce((a, v) => a + v, 0));
    const fin = b.status === 'done' && !rep, dentro = b.seats.some((y) => y.player === ctx.me);
    const nombres = (t) => b.seats.filter((x) => Math.floor(x.seat / mitad) === t).map((x) => esc(jug(x.player).n)).join(' y ');
    const lider = T[0] === T[1] ? null : T[0] > T[1] ? 0 : 1;
    const titulo = b.status === 'open' ? (tam - b.seats.length === 1 ? 'Falta 1 jugador' : `Faltan ${tam - b.seats.length} jugadores`)
      : rep ? `Ronda ${rNow} de ${n}` : `Gana ${nombres(b.winner) || '·'}`;
    const sub = b.status === 'open' ? 'Se abre sola en cuanto se llena. El lado que saque más valor se lleva todas las skins.'
      : fin ? `${N(T[b.winner])} contra ${N(T[1 - b.winner])} · ${mitad > 1 ? 'se llevan' : 'se lleva'} las ${b.drops.length} skins`
      : lider == null ? 'Van empatados' : `Va ganando ${nombres(lider)} por ${N(Math.abs(T[0] - T[1]))}`;
    const act = rep ? '<button class="chip" data-cj="saltar">Saltar</button>' : fin ? '<button class="chip" data-cj="otravez">Ver otra vez</button>'
      : b.status === 'open' && dentro ? `<button class="chip" data-cj="salir" data-v="${b.id}">${S.sure === 'salir' + b.id ? '¿Seguro? Toca otra vez' : b.by === ctx.me ? 'Cancelar' : 'Salir'}</button>` : '';
    const head = `<header class="bv-h"><div class="bv-t"><span class="lab">Batalla ${b.mode} · ${n} ${n === 1 ? 'ronda' : 'rondas'}</span><h2 class="${fin ? 'gana' : ''}">${titulo}</h2><p>${sub}</p></div>
      <div class="bv-pot"><span class="num">${N(b.cost * tam)}</span>${coin()}<em>${b.status === 'open' ? N(b.cost) + ' cada uno' : 'en juego'}</em></div>${act ? `<div class="bv-act">${act}</div>` : ''}</header>`;
    const rds = `<div class="bv-rds">${b.cases.map((cid, i) => { const st = !rep ? (b.status === 'done' ? 'ok' : '') : i + 1 < rNow || (i + 1 === rNow && landed) ? 'ok' : i + 1 === rNow ? 'now' : ''; return `<span class="${st}">${pic((D.cases.find((c) => c.id === cid) || {}).image, 128)}<i>${i + 1}</i></span>` }).join('')}</div>`;
    const tug = b.status === 'done' ? `<div class="bv-tug" aria-hidden="true"><i style="flex:${T[0] + T[1] ? Math.max(T[0], 0.01) : 1}"></i><i style="flex:${T[0] + T[1] ? Math.max(T[1], 0.01) : 1}"></i></div>` : '';
    const col = (st) => {
      const x = b.seats.find((y) => y.seat === st), t = Math.floor(st / mitad);
      if (!x) return `<div class="bv-col vacio">${b.status === 'open' && !dentro && ctx.saldo >= b.cost ? `<button class="bv-join" data-cj="unir" data-v="${b.id}|${st}"><b>+</b><span>Unirme aquí</span><em>${N(b.cost)}${coin()}</em></button>` : '<span class="bv-free">Libre</span>'}</div>`;
      const j = jug(x.player), ds = dr(st), mejor = ds.reduce((a, d) => (!a || d.inv.value > a.inv.value ? d : a), null);
      const stage = rep ? reel(b, rNow, st, e, landed)
        : fin && mejor ? `<div class="bv-best" style="--c:${color(item(mejor.inv.item).rarity)}">${pic(item(mejor.inv.item).image, 360)}<span>${esc(partes(item(mejor.inv.item)).join(' | '))}</span><b>${N(mejor.inv.value)}${coin()}</b></div>` : '';
      return `<div class="bv-col ${fin ? (t === b.winner ? 'win' : 'lose') : rep && lider === t ? 'va' : ''}" style="--pc:var(--f-${esc(j.color)})">
        <div class="bv-p">${av(x.player, 'xl')}<b>${esc(j.n)}</b><span class="bv-tot"><span class="num">${N(tot(st))}</span>${coin()}</span></div>
        ${stage}<div class="bv-haul">${ds.map((d) => bvIt(d, rep && d.round === rNow)).join('')}</div></div>`;
    };
    const team = (t) => `<div class="bv-team n${mitad}">${Array.from({ length: mitad }, (_, i) => col(t * mitad + i)).join('')}</div>`;
    const cl = (t) => jug(b.seats.find((y) => Math.floor(y.seat / mitad) === t)?.player).color;
    return `${atras}<div class="bv" style="--c0:var(--f-${esc(cl(0))});--c1:var(--f-${esc(cl(1))})">${head}${rds}${tug}<div class="bv-arena m${tam}">${team(0)}<span class="bv-vs">VS</span>${team(1)}</div></div>`;
  }

  /* ---------- la ruleta ---------- */
  function relleno(info) {
    const hay = ORDEN.filter((r) => info.por[r]), tot = hay.reduce((a, r) => a + RELLENO[r], 0);
    let x = Math.random() * tot, r = hay[hay.length - 1];
    for (const k of hay) { if (x < RELLENO[k]) { r = k; break } x -= RELLENO[k] }
    const l = info.por[r]; return l[(Math.random() * l.length) | 0];
  }
  // la tira corre desde la carta del centro (INI) hasta la del premio (G) y frena con el mismo desvio que luego pinta el CSS
  function gira(strip, t, dur) {
    const track = strip.firstElementChild, ini = track.children[INI], k = track.children[G], kw = k.offsetWidth;
    // al parar: la ganadora crece y brilla con el color de su rareza y el resto se apaga
    const fin = () => { k.classList.add('gana'); strip.classList.add('fin') };
    if (!strip.isConnected || !kw) { fin(); return Promise.resolve() }
    const x0 = -(ini.offsetLeft + ini.offsetWidth / 2), x1 = -(k.offsetLeft + kw / 2 + t.j * kw);
    const a = track.animate([{ transform: `translateX(${x0}px)` }, { transform: `translateX(${x1}px)` }], { duration: dur, easing: 'cubic-bezier(.08,.6,.12,1)', fill: 'forwards' });
    if (anim) anim.anims.push(a);
    return a.finished.then(fin, fin);
  }
  function para() { if (REP) return termina(); if (!anim) return; anim.saltar = true; for (const a of anim.anims) { try { a.finish() } catch {} } }

  // mia: id de una caja sin abrir (cs_owned); se abre sin pagar con las mismas tiras y el mismo resultado.
  // prueba: gira de mentira. No llama a la base, no cobra, no da nada y no avisa a los demas: el premio sale del azar de la pantalla.
  // Devuelve true si ha abierto (para el giro automatico).
  async function abrir(mia, prueba) {
    if (anim || ocupado) return false;
    const c = D.cases.find((x) => x.id === S.caja) || D.caja.get(S.caja), info = D.caja.get(S.caja), n = mia ? 1 : S.n;
    if (!c || !info) return false;
    let items;
    if (prueba) items = Array.from({ length: n }, () => { const x = relleno(info); return { id: 0, item: x.id, value: valorDe(x), status: 'prueba' } });
    else {
      if (!mia && c.price * n > ctx.saldo) { avisa('No tienes saldo suficiente'); return false }
      ocupado = true;
      root.querySelectorAll('[data-cj=abrir],[data-cj=abrirMia],[data-cj=prueba],[data-cj=auto],[data-cj=n]').forEach((b) => { b.disabled = true });
      // mientras contesta el servidor, el boton lo dice (si no, parece que no ha hecho nada)
      const b0 = root.querySelector(mia ? `[data-cj=abrirMia][data-v="${mia}"]` : '.ca-go[data-cj=abrir]');
      if (b0) { b0.classList.add('abriendo'); b0.innerHTML = '<span>Abriendo…</span>'; traduce(b0) }
      let r;
      try { r = mia ? await rpc('cs_open_owned', { p_id: mia }) : await rpc('cs_open', { p_case: c.id, p_n: n }) } catch (e) { ocupado = false; pinta(); avisa(esc(msgErr(e))); return false }
      ocupado = false;
      items = r.items;
      try { const f = (x) => ({ r: x.rarity, i: src(x.image, 256), l: esLujo(x.id) ? 1 : 0 }); window.dispatchEvent(new CustomEvent('gm:caja-abierta', { detail: { quien: ctx.me, nombre: jug(ctx.me).n, caja: c.id, cajaNombre: c.name, items: r.items.map((i) => ({ ...f(item(i.item)), n: item(i.item).name, v: i.value })), pool: Array.from({ length: 24 }, () => f(relleno(info))) } })) } catch {}   // en directo (cajas-vivo.js)
      if (mia) D.cajasDe.set(ctx.me, mias().filter((o) => o.id !== mia));
      // la imagen grande del premio se va bajando mientras gira
      for (const i of r.items) { const im = new Image(); im.decoding = 'async'; im.src = src(item(i.item).image, 256) }
    }
    const animar = !sinAnim();
    S.res = null; S.sure = null; S.prueba = !!prueba;
    S.tiras = items.map((inv) => nuevaTira(info, inv)); S.tirasK = ''; S.tirasC = c.id;
    S.fase = animar ? 'gira' : 'fin';
    anim = { anims: [], saltar: false };
    pinta(true);    // las tiras con su sitio, ya con el premio dentro
    if (animar) {
      const strips = [...root.querySelectorAll('.cj-spin .cj-strip')], sc = root.querySelector('.ca-tiras');
      if (sc && sc.getBoundingClientRect().top < 64) sc.scrollIntoView({ block: 'start', behavior: 'smooth' });
      const v = +S.vel;
      await Promise.all(strips.map((s, i) => gira(s, S.tiras[i], DUR[v] + i * PASO[v])));
      await espera(FIN[v]);
    } else {
      const top = items.reduce((a, i) => (i.value > a.value ? i : a), items[0]);
      window.dispatchEvent(new CustomEvent('gm:sonido', { detail: { tipo: 'caja-final', rareza: item(top.item).rarity, vol: 0.6 } }));
    }
    anim = null;
    if (S.caja === c.id) { S.fase = 'fin'; S.res = { caja: c.id, n, items, prueba: !!prueba } }
    pinta();
    if (prueba) return true;
    const top = items.reduce((a, i) => (i.value > a.value ? i : a), items[0]);
    if (item(top.item).rarity === 'esp') avisa(`¡${esc(item(top.item).name)}! <b>${N(top.value)}</b>`);
    // el saldo nuevo tiene que estar antes del siguiente giro del automatico
    try { if (ctx.refresh) await ctx.refresh() } catch {}
    cargar(true);
    return true;
  }
  // giro automatico: abre y abre hasta que lo paras, se acaba el saldo o falla algo
  async function auto() {
    if (S.auto || anim || ocupado) return;
    const id = S.caja;
    S.auto = true; pinta();
    try {
      while (S.auto && S.caja === id && S.tab === 'abrir' && root && root.isConnected) {
        const c = caja(id);
        if (!c.price || ctx.saldo < c.price * S.n) { avisa('Sin saldo: el giro automático se ha parado'); break }
        if (!(await abrir())) break;
        if (!S.auto) break;
        await new Promise((ok) => setTimeout(ok, REPOSO[+S.vel]));
      }
    } finally { S.auto = false; if (!anim) pinta() }
  }

  function repeticion(b) {
    if (!b || b.status !== 'done') return;
    marcaVisto(b.id);
    REP = { id: b.id, t0: Date.now(), key: '' }; S.rep = b.id;
    pinta(true); bucle();
  }
  function bucle() {
    cancelAnimationFrame(repRaf);
    const paso = () => {
      if (!REP) return;
      const b = D.bats.get(REP.id);
      if (!b || S.bat !== REP.id || S.tab !== 'batallas') { REP = null; S.rep = null; return }
      const n = b.cases.length, e = Date.now() - REP.t0, r = Math.floor(e / RD()) + 1;
      if (r > n) return termina();
      const landed = e - (r - 1) * RD() >= SPIN(), key = r + '|' + landed;
      if (key !== REP.key || !root.querySelector('[data-tr]')) { REP.key = key; pinta(true) }
      else if (!landed) {
        const k = 1 - Math.pow(1 - Math.min(1, (e - (r - 1) * RD()) / SPIN()), 4);
        root.querySelectorAll('[data-tr]').forEach((tr) => { tr.style.transform = `translateY(${(-(+tr.dataset.fin) * k).toFixed(1)}px)` });
      }
      repRaf = requestAnimationFrame(paso);
    };
    repRaf = requestAnimationFrame(paso);
  }
  function termina() {
    cancelAnimationFrame(repRaf); REP = null; S.rep = null;
    pinta(true);
    if (ctx.refresh) ctx.refresh();
    cargar(true);
  }

  /* ---------- acciones ---------- */
  // la confirmacion se desarma sola; el token evita que el temporizador de una vez anterior la quite antes de tiempo
  let sureT = 0;
  function seguro(clave, ms = 3500) {
    if (S.sure === clave) { S.sure = null; return true }
    S.sure = clave; pinta();
    const tok = ++sureT;
    setTimeout(() => { if (S.sure === clave && tok === sureT) { S.sure = null; pinta() } }, ms);
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
    arriba();
    await cargar(true);
  }
  // los filtros del inventario vuelven a enseñar las primeras
  const filtra = () => { S.invN = INV_PASO; S.sure = null; pinta() };

  async function onClick(e) {
    const t = e.target.closest('[data-cj]');
    if (!t || !root || !root.contains(t) || t.disabled) return;
    const a = t.dataset.cj, v = t.dataset.v;
    const navega = ['tab', 'cajas', 'batallas', 'ver', 'quien', 'caja', 'cat'];
    if (anim && navega.includes(a)) para();
    if (navega.includes(a)) S.auto = false;     // salir de la caja para el giro automatico
    switch (a) {
      case 'tab':
        if (S.tab === v) { if (v === 'abrir') { S.caja = null; S.res = null; S.fase = 'idle'; S.prueba = false } if (v === 'batallas') { S.bat = null; S.nueva = null } }
        S.tab = v; S.sure = null; if (v !== 'batallas') S.bat = null;
        pinta(); arriba();
        if (v === 'batallas' && !S.bat) { await cargaHechas(); pinta() }
        return;
      case 'cat': S.cat = GRUPOS.some((g) => g[0] === v) ? v : 'cs2'; guarda('cj-cat', S.cat); return pinta();
      case 'caja': S.caja = v; S.res = null; S.fase = 'idle'; S.prueba = false; pinta(); arriba(); try { await cargaCaja(v) } catch (err) { avisa(esc(msgErr(err))) } return pinta();
      case 'cajas': S.caja = null; S.res = null; S.fase = 'idle'; S.prueba = false; pinta(); return arriba();
      case 'n': S.n = +v; S.res = null; S.fase = 'idle'; S.prueba = false; return pinta();
      case 'vel': S.vel = v; S.rapido = v !== '0'; guarda('cj-vel', v); guarda('cj-rapido', S.rapido ? '1' : '0'); return pinta();
      case 'abrir': return abrir();
      case 'prueba': return abrir(null, true);
      case 'auto': return auto();
      case 'parar': S.auto = false; t.disabled = true; t.innerHTML = '<span>Parando…</span>'; traduce(t); if (!anim) pinta(); return;
      case 'abrirMia': {
        // desde el inventario o la caja: se va a la caja y gira alli, igual que al pagar
        const id = +v, o = mias().find((x) => x.id === id);
        if (!o || anim || ocupado) return;
        if (S.tab !== 'abrir' || S.caja !== o.case_id) {
          S.tab = 'abrir'; S.caja = o.case_id; S.res = null; S.fase = 'idle'; S.prueba = false; S.sure = null; S.bat = null; pinta(); arriba();
          try { await cargaCaja(o.case_id) } catch (err) { return avisa(esc(msgErr(err))) }
        }
        return abrir(id);
      }
      case 'saltar': return para();
      case 'vender1': return vender([+v]);
      case 'venderRes': if (!seguro('res')) return; return vender(S.res.items.filter((i) => i.status !== 'sold').map((i) => i.id));
      case 'quien': S.quien = v === ctx.me ? null : v; S.sel.clear(); S.sure = null; S.fR = null; S.fC = null; S.invN = INV_PASO; pinta(); return cargar(true);
      case 'sel': { const id = +v; if (S.sel.has(id)) S.sel.delete(id); else S.sel.add(id); S.sure = null; return pinta() }
      // PM, 30-10: "un botón para vender todo el inventario" (todo lo suyo, no solo lo cargado en pantalla)
      case 'vendertodo': {
        if (S.sure !== 'todo') {
          const { data } = await ctx.db.from('cs_inv').select('id,value').eq('player', ctx.me).eq('status', 'own').limit(5000);
          S.todo = data || []; if (!S.todo.length) return; S.sure = 'todo'; pinta();
          setTimeout(() => { if (S.sure === 'todo') { S.sure = null; pinta() } }, 4500); return;
        }
        S.sure = null; const ids = (S.todo || []).map((x) => x.id); S.todo = null; if (!ids.length) return pinta();
        return vender(ids);
      }
      case 'baratas': for (const i of D.st.inv) if (i.value < BARATA) S.sel.add(i.id); S.sure = null; return pinta();
      case 'todas': for (const i of D.st.inv) if ((!S.fR || item(i.item).rarity === S.fR) && (!S.fC || i.case === S.fC)) S.sel.add(i.id); S.sure = null; return pinta();
      case 'nosel': S.sel.clear(); S.sure = null; return pinta();
      case 'vender': if (!S.sel.size || !seguro('inv')) return; return vender([...S.sel]);
      case 'orden': S.orden = v; guarda('cj-orden', v); return filtra();
      case 'fR': S.fR = v || null; return filtra();
      case 'fC': S.fC = v || null; return filtra();
      case 'sinfiltro': S.fR = null; S.fC = null; return filtra();
      case 'mas': S.invN += INV_PASO; return pinta();
      case 'esptodo': S.espTodo = v; return pinta();
      case 'pag': {
        S.pag = Math.max(0, +v || 0); pinta();
        const l = root.querySelector('[data-hechas]'), sc = root.closest('.scr');
        if (l && sc && l.getBoundingClientRect().top < sc.getBoundingClientRect().top) l.scrollIntoView({ block: 'start' });
        await cargaHechas(); return pinta();
      }
      case 'nueva': S.nueva = { mode: '1v1', cases: [] }; pinta(); return arriba();
      case 'nueva-x': S.nueva = null; pinta(); return arriba();
      case 'modo': S.nueva.mode = v; return pinta();
      case 'add': if (S.nueva.cases.length < 10) S.nueva.cases.push(v); return pinta();
      case 'quita': S.nueva.cases.splice(+v, 1); return pinta();
      case 'crear': {
        const nv = S.nueva; if (!nv || !nv.cases.length) return;
        const r = await hazlo(() => rpc('cs_battle_create', { p_mode: nv.mode, p_cases: nv.cases }));
        if (!r) return;
        S.nueva = null; S.bat = r.id; avisa('Batalla creada: falta que se unan');
        if (ctx.refresh) ctx.refresh();
        arriba();
        return cargar(true);
      }
      case 'unir': { const [id, s] = v.split('|'); return unir(+id, s === '' ? null : +s) }
      case 'nosure': S.sure = null; return pinta();
      case 'salir': {
        if (!seguro('salir' + v, 7000)) return;
        const r = await hazlo(() => rpc('cs_battle_leave', { p_id: +v }));
        if (!r) return;
        avisa(`Te devuelvo <b>${N(r.devuelto)}</b>`);
        if (S.bat === +v) S.bat = null;
        if (ctx.refresh) ctx.refresh();
        return cargar(true);
      }
      case 'ver': S.tab = 'batallas'; S.bat = +v; S.nueva = null; pinta(); arriba(); try { await cargaBat(+v) } catch (err) { avisa(esc(msgErr(err))) } return pinta();
      case 'batallas': S.bat = null; pinta(); arriba(); await cargaHechas(); return pinta();
      case 'otravez': { const b = D.bats.get(S.bat); if (b) { const v2 = vistas().filter((x) => x !== b.id); guarda('cj-vistas', JSON.stringify(v2)); repeticion(b) } return }
    }
  }
  document.addEventListener('click', onClick);

  window.GM_CAJAS = {
    html: () => '<div data-cajas></div>',
    // el: la vista de la app (o el hueco [data-cajas]); c: { db, me, jugadores, saldo, toast, refresh }; nueva: se acaba de entrar en la pantalla
    montar(el, c, nueva) {
      ctx = c;
      try { window.dispatchEvent(new CustomEvent('gm:cajas-montada', { detail: { db: c.db, me: c.me } })) } catch {}   // en directo (cajas-vivo.js)
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
