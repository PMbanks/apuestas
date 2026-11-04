// Cajas en Gambling Master: abrir cajas, el inventario de cada uno y batallas (1v1, 2v2, 3v3, 2v2v2 y de 3, 4 o 6 todos contra todos, db/072).
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
    const MENOS_DE = [10, 50, 100];   // atajo "menos de X" (V-Bucks)
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
    'lujo-oro': 'inv', 'lujo-cripto': 'inv', 'lujo-cartas': 'inv',
    // las 35 cajas nuevas de lujo (db/055)
    'lujo-ed-xbox-vs-playstation': 'tec', 'lujo-ed-5-console-legends': 'tec', 'lujo-ed-10-gaming': 'tec', 'lujo-ed-full-send-gaming': 'tec', 'lujo-ed-pro-setup': 'tec', 'lujo-ed-streamer-setup': 'tec', 'lujo-ed-only-mac': 'tec', 'lujo-ed-cinematic-view': 'tec', 'lujo-ed-1-patek': 'relojes', 'lujo-ed-master-of-time': 'relojes', 'lujo-ed-rado-vs-tudor': 'relojes', 'lujo-ed-cartier-treasure': 'relojes', 'lujo-ed-pandora': 'relojes', 'lujo-ed-1-versace': 'moda', 'lujo-ed-1-louis-vuitton': 'moda', 'lujo-ed-chanel-prestige': 'moda', 'lujo-ed-birkin-addict': 'moda', 'lujo-ed-100-bags': 'moda', 'lujo-ed-nike': 'moda', 'lujo-ed-jordan': 'moda', 'lujo-ed-street-soles': 'moda', 'lujo-ed-1-cars': 'motor', 'lujo-ed-1-mercedes': 'motor', 'lujo-ed-german-engine': 'motor', 'lujo-ed-heritage-motors': 'motor', 'lujo-ed-tesla': 'motor', 'lujo-ed-american-driver': 'motor', 'lujo-ed-yacht-club': 'motor', 'lujo-ed-luxury-garage': 'motor', 'lujo-ed-gold-digger': 'inv', 'lujo-ed-fortune-box': 'inv', 'lujo-ed-poke-starter': 'inv', 'lujo-ed-5-pokemon': 'inv', 'lujo-ed-legendary-pulls': 'inv', 'lujo-ed-panini': 'inv' };
  const ORDENES = [['valor', 'Más valiosas'], ['nuevas', 'Más nuevas'], ['rareza', 'Por rareza']];
  const SEL_BAT0 = 'id,mode,cases,cost,status,created_by,winner,totals,created_at,done_at,cs_battle_seats(seat,player)';
  let SEL_BAT = SEL_BAT0.replace('totals,', 'totals,regla,');   // regla (Normal o Crazy) llega con db/072; sin ella se lee como antes
  // formatos de batalla (db/072): mode es el texto de siempre; cada trozo separado por v es un equipo y el numero, cuantos van en el
  // ('2v2v2' son 3 equipos de 2). El equipo de un sitio es sitio / tamano del equipo. Regla: 'normal' gana quien mas saca, 'crazy' quien menos.
  const FORMATOS = [['1v1', '1v1', 'cara a cara'], ['2v2', '2v2', 'por parejas'], ['1v1v1', '3', 'jugadores'], ['1v1v1v1', '4', 'jugadores'], ['1v1v1v1v1v1', '6', 'jugadores'], ['2v2v2', '2v2v2', 'tres parejas'], ['3v3', '3v3', 'por tríos']];
  const eqDe = (b) => Math.max(2, String((b && b.mode) || '1v1').split('v').length);       // cuantos equipos
  const teDe = (b) => Math.max(1, parseInt(String((b && b.mode) || '1v1'), 10) || 1);    // cuantos en cada equipo
  const libre = (b) => teDe(b) === 1 && eqDe(b) > 2;                                     // 3, 4 o 6 todos contra todos
  const loca = (b) => !!b && b.regla === 'crazy';
  // '1v1v1v1' -> '4 jugadores'; los de equipos se quedan como estan
  const fmtTxt = (m) => (libre({ mode: m }) ? `${eqDe({ mode: m })} jugadores` : m);
  // Giro Dorado (db/075): lo decide la base; aqui solo se ensena. La prueba gratis lo imita con la misma probabilidad
  const GD_PCT = 4, GD_DUR = [1800, 1000, 550], GD_HOLD = [650, 380, 200];
  // Tickets (db/081, PM 04-11): la tira para en un ticket en vez de en un objeto, espera y vuelve a girar SOLO esa linea con lo que puede
  // salir de esa caja. Dorado: entre lo malo y lo medianamente bueno. Diamante (mas raro): solo lo bueno. Lo decide la base; aqui se ensena.
  // Sin db/081 cargada la base sigue mandando el Giro Dorado viejo ({orig, up, down, won}) y se ensena como antes.
  const TK = { oro: { n: 'Ticket Dorado', c: '#f5c542' }, diamante: { n: 'Ticket de Diamante', c: '#7fe3ff' } };
  const TK_HOLD = [1100, 600, 300], TK_DUR = [3800, 1500, 750];          // parado en el ticket y la vuelta de esa linea (Normal, Rapido, Ultra)
  const TKB_HOLD = [1000, 500, 280], TKB_SPIN = [2600, 1100, 600];       // lo mismo en las batallas
  const TK_DEF = { oro: 4, diamante: 0.2, sube: 40 };                    // la prueba gratis si la base aun no contesta cs_giro_info

  /* ---------- estado ---------- */
  let ctx = null, root = null;
  const S = { tab: 'abrir', cat: GRUPOS.some((g) => g[0] === lee('cj-cat')) ? lee('cj-cat') : 'cs2', caja: null, n: 1, rapido: lee('cj-rapido') === '1', vel: ['0', '1', '2'].includes(lee('cj-vel')) ? lee('cj-vel') : lee('cj-rapido') === '1' ? '1' : '0', auto: false, tiras: null, tirasK: '', tirasC: null, fase: 'idle', prueba: false, quien: null, sel: new Set(), ancla: null, anclaOn: true, bat: null, nueva: null, res: null, sure: null, rep: null, espTodo: null,
    orden: ['valor', 'nuevas', 'rareza'].includes(lee('cj-orden')) ? lee('cj-orden') : 'valor', fR: null, fC: null, invN: INV_PASO, pag: 0 };
  const D = { buenos: null, cases: null, caja: new Map(), items: new Map(), st: null, bats: new Map(), err: null, hechas: null, cajasDe: new Map() };
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
  const GLOW_G = { tec: '#48a0ff', relojes: '#ffc43a', moda: '#c060ff', motor: '#ff4848', inv: '#ffb020' };   // las de db/055 sin color propio: el de su categoria
  const brillo = (c) => GLOW[c && c.id] || (c && GRUPO_DE[c.id] && GLOW_G[GRUPO_DE[c.id]]) || '#f2c14e';
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
  // una caja con tickets (las de db/055) tira por objeto; sin ellos (CS2, Patinetes, Gafas) tira por rareza
  const conTickets = (info) => !!(info && info.items && info.items.some((it) => it.tickets != null));
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
    // las probabilidades de los tickets en esta caja (db/081); sin 081 no hay y se sigue como antes
    try { c.giro = await rpc('cs_giro_info', { p_case: id }) } catch { c.giro = null }
    D.caja.set(id, c);
    return c;
  }
  async function cargaBat(id) {
    const b = await rpc('cs_battle', { p_id: id });
    for (const cid of new Set(b.cases)) await cargaCaja(cid);
    await asegura(b.drops.flatMap((d) => [d.inv.item, ...(d.inv.bonus ? ['orig', 'up', 'down'].map((k) => d.inv.bonus[k] && d.inv.bonus[k].item) : [])]));
    D.bats.set(id, b);
    return b;
  }
  // las terminadas, de todas las fechas, por paginas: se leen de las tablas (los jugadores pueden leerlas).
  // cs_state solo trae las de los ultimos 14 dias; si la lectura falla se usan esas.
  const aBat = (r) => ({ id: r.id, mode: r.mode, regla: r.regla || 'normal', cases: r.cases || [], cost: r.cost, status: r.status, by: r.created_by, winner: r.winner, totals: r.totals,
    at: r.created_at, done_at: r.done_at, seats: (r.cs_battle_seats || []).slice().sort((x, y) => x.seat - y.seat) });
  async function cargaHechas() {
    const pag = S.pag, a = pag * POR_PAG;
    try {
      const lee = (sel) => ctx.db.from('cs_battles').select(sel, { count: 'exact' }).eq('status', 'done')
        .order('done_at', { ascending: false, nullsFirst: false }).order('id', { ascending: false }).range(a, a + POR_PAG - 1);
      let { data, error, count } = await lee(SEL_BAT);
      // sin db/072 cargada no hay columna regla: se lee como antes
      if (error && SEL_BAT !== SEL_BAT0) { SEL_BAT = SEL_BAT0; ({ data, error, count } = await lee(SEL_BAT)) }
      if (error) throw error;
      const total = count == null ? (data || []).length : count;
      if (pag > 0 && !(data || []).length && total) { S.pag = Math.max(0, Math.ceil(total / POR_PAG) - 1); return cargaHechas() }
      D.hechas = { pag, total, rows: (data || []).map(aBat), local: false };
    } catch { D.hechas = { local: true } }
  }
  // cs_owned: lo que tiene cada uno sin abrir (status own). Si la tabla aun no esta, nada
  // lo ultimo bueno (Clasificado, Encubierto o ★) de todos, tambien lo que sale en las batallas: cs_inv se puede leer entero
  // (politica cs_inv_read, is_player). Si falla, se usa el feed de cs_state (solo cajas sueltas).
  async function cargaBuenos() {
    try {
      const { data, error } = await ctx.db.from('cs_inv').select('id,item_id,value,case_id,battle_id,opened_by,created_at,cs_items!inner(rarity)')
        .in('cs_items.rarity', ['cla', 'cov', 'esp']).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(FD_N);
      if (error) throw error;
      return (data || []).map((r) => ({ id: r.id, item: r.item_id, value: r.value, case: r.case_id, battle: r.battle_id, by: r.opened_by, at: r.created_at }));
    } catch { return null }
  }
  // los 7 de mas valor de siempre (cs_inv entera: cajas, batallas, vendidas o no)
  async function cargaMejores() {
    try {
      const { data, error } = await ctx.db.from('cs_inv').select('id,item_id,value,case_id,battle_id,opened_by,player,created_at')
        .order('value', { ascending: false }).order('id', { ascending: true }).limit(FD_N);
      if (error) throw error;
      return (data || []).map((r) => ({ id: r.id, item: r.item_id, value: r.value, case: r.case_id, battle: r.battle_id, by: r.opened_by || r.player, at: r.created_at }));
    } catch { return null }
  }
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
        // PM 01-11 "si, abrelas": Lujo abierta otra vez con las 16 cajas nuevas (db/046). Cosmeticos sigue fuera (Mercado en mantenimiento)
        if (!D.cases) D.cases = ((await rpc('cs_cases')) || []).filter((c) => catDe(c) !== 'cosmeticos');
        const st = await rpc('cs_state', { p_player: S.quien || ctx.me });
        const [bu, mj] = await Promise.all([cargaBuenos(), cargaMejores()]);
        await asegura([...st.inv, ...st.feed, ...(bu || []), ...(mj || [])].map((i) => i.item));
        D.st = st; D.buenos = bu; D.mejores = mj || D.mejores || []; D.err = null;
        await cargaMias(ctx.me);
        if (S.quien && S.quien !== ctx.me) await cargaMias(S.quien);
        if (S.caja) await cargaCaja(S.caja);
        if (S.bat) await cargaBat(S.bat);
        else if (S.tab === 'batallas') await cargaHechas();
      } catch (e) { D.err = msgErr(e) }
      ultima = Date.now(); cargando = null;
      pinta();
      if (!D.err) fdSync();
      if (otraVez) { otraVez = false; cargar(true) }
    })();
    return cargando;
  }

  /* ---------- seleccion del inventario ---------- */
  // PM, 02-11: "que puedas seleccionar rapido en inventory para poder vender varios a la vez pero no todos".
  // Tocar una carta la marca o desmarca (como siempre). En PC: mayus y clic marca el rango, arrastrar con el raton pulsado pinta,
  // ctrl o cmd y clic suma una. En movil: mantener pulsado y arrastrar marca varias. Nada de esto repinta la rejilla: solo cambia
  // la clase .on de las cartas tocadas (con 300 objetos un repintado entero a cada movimiento iria a saltos) y el texto de la barra.
  const P = { act: false, on: true, down: null, t: null, tm: 0, ult: null, sup: 0, auto: 0, ptr: null };
  let tiles = new Map();      // id -> boton de la carta, solo las que estan pintadas
  const armados = (el) => el.querySelectorAll('[data-cj]').forEach((b) => { const f = ARMADO[b.dataset.cj]; if (f) b.classList.toggle('armado', S.sure === f(b.dataset.v)) });
  function indexa() { tiles = new Map(); if (root) root.querySelectorAll('.cj-inv [data-cj="sel"]').forEach((b) => tiles.set(+b.dataset.v, b)) }
  // una carta se puede vender si sigue en el inventario y no esta bloqueada (en una batalla, en un trato...)
  const vendible = (i) => !!i && (i.status == null || i.status === 'own') && !i.locked && !i.bloqueado && !i.hold;
  const porId = (id) => (D.st && D.st.inv || []).find((i) => i.id === id);
  const enFiltro = (i) => (!S.fR || item(i.item).rarity === S.fR) && (!S.fC || i.case === S.fC);
  const visibles = () => ordena(D.st.inv.filter(enFiltro));
  // marca o desmarca una carta sin repintar: false si no ha cambiado nada (ya estaba asi, o no se puede vender)
  function pon(id, on) {
    if (on && !vendible(porId(id))) return false;
    if (S.sel.has(id) === on) return false;
    if (on) S.sel.add(id); else S.sel.delete(id);
    const el = tiles.get(id); if (el) el.classList.toggle('on', on);
    return true;
  }
  function barraHtml() {
    const inv = D.st.inv, sel = inv.filter((i) => S.sel.has(i.id)), val = sel.reduce((a, i) => a + i.value, 0);
    if (!sel.length) return '';
    const todos = sel.length === inv.length, fuera = sel.filter((i) => !enFiltro(i)).length;
    const boton = S.sure === 'inv' ? `<span>${todos ? `¿Vender las ${N(sel.length)} por ${N(val)}? Toca otra vez` : '¿Seguro? Toca otra vez'}</span>` : `<span>${todos ? 'Vender todo por' : 'Vender por'}</span><b>${N(val)}</b>${coin()}`;
    return `<span class="cj-bar-l"><b>${cuantas(sel.length, sel)}</b><em>${N(val)}${coin()}</em>${fuera > 0 ? `<small>${N(fuera)} fuera del filtro</small>` : ''}<button class="chip" data-cj="nosel">Quitar selección</button></span>
      <span class="cj-bar-b"><button class="go ${todos ? 'todo' : ''}" data-cj="vender">${boton}</button></span>`;
  }
  // la barra de abajo: solo se reescribe ella, no la pantalla
  function pintaBarra() {
    const b = root && root.querySelector('[data-selbar]'); if (!b) return;
    const h = barraHtml();
    b.hidden = !h;
    if (b.dataset.h !== h) { b.dataset.h = h; b.innerHTML = h; armados(b); traduce(b) }
  }
  function cambioSel() { S.sure = null; pintaBarra() }
  let barraRaf = 0;
  const pintaBarraRaf = () => { if (!barraRaf) barraRaf = requestAnimationFrame(() => { barraRaf = 0; pintaBarra() }) };

  // atajos de arriba: actuan sobre lo que se ve (el filtro activo) y dejan en paz lo marcado fuera de el
  function atajo(tipo, v) {
    const vis = visibles().filter(vendible);
    if (tipo === 'ninguno') { for (const id of [...S.sel]) pon(id, false); S.sel.clear(); S.ancla = null; return cambioSel() }
    let ids;
    if (tipo === 'todo') ids = new Set(vis.map((i) => i.id));
    else if (tipo === 'invertir') ids = new Set(vis.filter((i) => !S.sel.has(i.id)).map((i) => i.id));
    else if (tipo === 'baratas') ids = new Set(vis.slice().sort((a, b) => a.value - b.value || a.id - b.id).slice(0, +v).map((i) => i.id));
    else if (tipo === 'menos') ids = new Set(vis.filter((i) => i.value < +v).map((i) => i.id));
    else if (tipo === 'rareza') ids = new Set(vis.filter((i) => item(i.item).rarity === v).map((i) => i.id));
    else return;
    for (const i of vis) pon(i.id, ids.has(i.id));
    cambioSel();
  }
  // toque o clic en una carta
  function tocaCarta(id, e) {
    if (!vendible(porId(id))) return;
    const orden = [...tiles.keys()];
    if (e && e.shiftKey && S.ancla != null && S.ancla !== id && tiles.has(S.ancla)) {
      const a = orden.indexOf(S.ancla), b = orden.indexOf(id);
      for (let k = Math.min(a, b); k <= Math.max(a, b); k++) pon(orden[k], S.anclaOn);
      try { window.getSelection().removeAllRanges() } catch {}
    } else {
      const on = !S.sel.has(id);
      pon(id, on); S.ancla = id; S.anclaOn = on;
    }
    cambioSel();
  }
  const cartaEn = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.closest ? el.closest('.cj-inv [data-cj="sel"]') : null };
  // pinta por donde pasa el puntero, rellenando los huecos si ha ido rapido (un punto cada 14 px)
  function pasa(x, y) {
    const a = P.ptr || [x, y], d = Math.hypot(x - a[0], y - a[1]), n = Math.max(1, Math.ceil(d / 14));
    for (let k = 1; k <= n; k++) {
      const c = cartaEn(a[0] + (x - a[0]) * k / n, a[1] + (y - a[1]) * k / n);
      if (c && c !== P.ult) { P.ult = c; if (pon(+c.dataset.v, P.on)) { S.ancla = +c.dataset.v; S.anclaOn = P.on } }
    }
    P.ptr = [x, y];
    pintaBarraRaf();
  }
  function empieza(id) {
    P.act = true; P.on = !S.sel.has(id); P.ult = tiles.get(id) || null; P.ptr = null;
    pon(id, P.on); S.ancla = id; S.anclaOn = P.on;
    document.documentElement.classList.add('cj-pintando');
    cambioSel();
  }
  function finPinta() {
    clearTimeout(P.tm); clearInterval(P.auto); P.down = null; P.t = null;
    if (!P.act) return;
    P.act = false; P.ult = null; P.ptr = null; P.sup = Date.now();
    document.documentElement.classList.remove('cj-pintando');
    pintaBarra();
    if (pendiente && !anim) pinta();
  }
  const enRejilla = (e) => !!(root && e.target && e.target.closest && e.target.closest('.cj-inv [data-cj="sel"]'));
  // PC: raton pulsado y moverse = pintar
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !enRejilla(e)) return;
    P.down = { id: +e.target.closest('[data-cj="sel"]').dataset.v, x: e.clientX, y: e.clientY };
  });
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    if ((P.down || P.act) && !(e.buttons & 1)) { finPinta(); return }
    if (P.down && !P.act) {
      const c = cartaEn(e.clientX, e.clientY);
      if (!c || +c.dataset.v === P.down.id) return;      // sigue en la misma carta: sera un clic normal
      empieza(P.down.id);
      P.ptr = [P.down.x, P.down.y];
    }
    if (P.act) pasa(e.clientX, e.clientY);
  });
  document.addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') finPinta() });
  document.addEventListener('pointercancel', (e) => { if (e.pointerType === 'mouse') finPinta() });
  // movil: mantener pulsado marca esa carta, y sin soltar el dedo se marcan las que se rozan
  document.addEventListener('touchstart', (e) => {
    if (!enRejilla(e) || e.touches.length !== 1) { finPinta(); return }
    const t = e.touches[0], id = +e.target.closest('[data-cj="sel"]').dataset.v;
    P.t = { id, x: t.clientX, y: t.clientY, cy: t.clientY }; clearTimeout(P.tm);
    P.tm = setTimeout(() => {
      if (!P.t) return;
      empieza(P.t.id); P.sup = Date.now();
      try { navigator.vibrate && navigator.vibrate(18) } catch {}
      // cerca del borde de arriba o de abajo la lista se desplaza sola
      clearInterval(P.auto);
      P.auto = setInterval(() => {
        const sc = root && root.closest('.scr'); if (!sc || !P.act || !P.t) return;
        const r = sc.getBoundingClientRect(), y = P.t.cy, borde = 90;
        const v = (d) => Math.min(14, Math.ceil(d / 12)), dy = y < r.top + borde ? -v(r.top + borde - y) : y > r.bottom - borde ? v(y - (r.bottom - borde)) : 0;
        if (dy) { sc.scrollTop += dy; pasa(P.t.x, P.t.cy) }
      }, 16);
    }, 380);
  }, { passive: true });
  // touchmove no pasivo solo dentro de Cajas (si estuviera en todo el documento frenaria el desplazamiento de toda la app)
  const ligaToque = (el) => el.addEventListener('touchmove', (e) => {
    if (!P.t) return;
    const t = e.touches[0];
    if (!P.act) { if (Math.hypot(t.clientX - P.t.x, t.clientY - P.t.y) > 10) { clearTimeout(P.tm); P.t = null } return }   // se movio antes: es un desplazamiento normal
    if (e.cancelable) e.preventDefault();
    P.t.x = t.clientX; P.t.cy = t.clientY;
    pasa(t.clientX, t.clientY);
  }, { passive: false });
  document.addEventListener('touchend', finPinta);
  document.addEventListener('touchcancel', finPinta);
  // ni el menu del movil al mantener pulsado, ni arrastrar la foto, ni seleccionar texto al pintar
  document.addEventListener('contextmenu', (e) => { if (enRejilla(e)) e.preventDefault() });
  document.addEventListener('dragstart', (e) => { if (enRejilla(e)) e.preventDefault() });

  /* ---------- pintar ---------- */
  function pinta(forzar) {
    if (!root) return;
    if ((anim || P.act) && !forzar) { pendiente = true; return }
    pendiente = false;
    if (S.tab !== 'inventario' && S.sel.size) { S.sel.clear(); S.ancla = null }   // la seleccion se queda en el inventario: al salir se limpia
    root.innerHTML = vista();
    root.classList.toggle('cj-nv-on', S.tab === 'batallas' && !S.bat && !!S.nueva);   // crear batalla: cabecera mas baja (cajas.css)
    // los botones que piden confirmacion (cancelar, salir, vender) se ponen en rojo mientras esperan el segundo toque,
    // tambien el de la batalla abierta
    ponFeed();
    armados(root);
    indexa();
    traduce(root);
    if (S.tab === 'mejorar' && window.GM_MEJORA) GM_MEJORA.montar(root.querySelector('[data-mejora]'), window.GM_CAJAS.util);
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
    const tabs = [['abrir', 'Abrir'], ['inventario', 'Inventario'], ['batallas', 'Batallas'], ['mejorar', 'Mejorar']], dot = hayAviso();   // Mejorar: mejora.js (db/071)
    const cab = `<nav class="cj-tabs">${tabs.map(([k, n]) => `<button class="cj-tab ${S.tab === k ? 'on' : ''}" data-cj="tab" data-v="${k}">${n}${k === 'batallas' && dot ? '<i class="cj-dot"></i>' : ''}</button>`).join('')}</nav>`;
    if (!D.st || !D.cases) return cab + `<p class="hint cj-c">${D.err ? esc(D.err) : 'Cargando…'}</p>`;
    if (S.tab === 'mejorar') return cab + '<div data-mejora></div>';
    return cab + (S.tab === 'abrir' ? vAbrir() : S.tab === 'inventario' ? vInv() : S.bat ? vBat() : S.nueva ? vNueva() : vBatallas());
  }

  // una skin (u objeto de lujo) en rejilla: imagen sobre el color de su rareza, arma, nombre, desgaste y valor
  function tile(it, ex = {}) {
    const n = nombre(it), top = n.top || ex.top || '', main = n.main, tag = ex.boton ? 'button' : 'div';
    return `<${tag} class="cj-it ${ex.on ? 'on' : ''} ${ex.bloq ? 'bloq' : ''} ${it.rarity || ''}" style="--c:${color(it.rarity)}" title="${esc(it.name)}" ${ex.boton || ''}>
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
    // con Giro Dorado la tira frena en lo que salio de la caja (orig); el giro lo cambia despues por lo que se queda
    // con ticket (db/081) frena en el ticket, justo en el centro; luego vuelve a girar solo esa linea
    const o = inv && inv.bonus && inv.bonus.orig ? inv.bonus.orig : inv, tk = esTk(inv) ? inv.bonus.tipo : null;
    for (let i = 0; i < TOTAL; i++) {
      if (i === G && inv) { cs.push(tk ? { tk } : { x: item(o.item), v: o.value }); continue }
      let x = relleno(info);
      for (let k = 0; k < 12 && cs.slice(-2).some((c) => c.x && c.x.id === x.id); k++) x = relleno(info);
      cs.push({ x, v: valorDe(x) });
    }
    return { cs, j: inv && !tk ? (Math.random() - 0.5) * 0.6 : 0, premio: inv || null, tk, col: tk ? TK[tk].c : o ? color(item(o.item).rarity) : null };
  }
  function kcard(t, gana) {
    if (t.tk) return tkCard(t.tk, gana);
    const { x, v } = t, n = nombre(x), sinFoto = x.rarity === 'esp' && !esLujo(x.id) && !x.image;
    return `<div class="cj-k ${gana ? 'gana' : ''}" style="--c:${color(x.rarity)}"><span class="cj-k-i">${sinFoto ? '<i class="cj-k-star">★</i>' : pic(x.image, 256, '', true)}</span>
      ${n.top ? `<em data-notr>${esc(n.top)}</em>` : ''}<b data-notr>${esc(n.main)}</b><span class="cj-k-v">${N(v)}${coin()}</span></div>`;
  }
  function vTira(t, modo, c) {
    const fin = modo === 'fin', col = t.col || (t.premio ? color(item(t.premio.item).rarity) : color('mil'));
    return `<div class="cj-strip ${fin ? 'fin' : ''} ${t.tk ? `tk-on tk-${t.tk}` : ''}" style="--i:${fin ? G : INI};--j:${fin ? t.j.toFixed(3) : 0};--c:${col}"><div class="cj-track">${t.cs.map((k, i) => kcard(k, fin && i === G)).join('')}</div><i class="cj-mark"></i></div>`;
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
    ${falta && !tuyas.length && !S.auto ? `<p class="hint ca-hint">Tienes ${N(ctx.saldo)}. La paga del lunes se reclama en Recompensas.</p>` : ''}`;
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
        <span class="ca-rw-t">${top ? `<span class="lab" data-notr>${esc(top)}</span>` : `<span class="lab">${(RAR[x.rarity] || RAR.mil)[0]}</span>`}<b data-notr>${x.rarity === 'esp' && top ? '★ ' : ''}${esc(main)}</b>${gdTag(i)}</span>
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
    const pn = probN(info), filas = [], tk = conTickets(info);
    // cajas con tickets (db/055): cada objeto lleva su propia probabilidad (sus tickets entre el total)
    if (tk) { const tot = info.items.reduce((a, it) => a + (it.tickets || 0), 0) || 1; for (const it of info.items) filas.push({ it, v: tipico(it), pct: (it.tickets || 0) / tot }) }
    else for (const r of ORDEN) {
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
    // los tickets de esta caja (db/081): con que probabilidad sale cada uno
    const g = info.giro, tks = g && (+g.oro > 0 || +g.diamante > 0) ? `<div class="ca-tks">${[['oro', g.oro, 'Vuelve a girar entre lo malo y lo medianamente bueno'], ['diamante', g.diamante, 'Vuelve a girar solo con lo bueno']].filter((x) => +x[1] > 0)
      .map(([k, p, t]) => `<span class="ca-tk tk-${k}" style="--tk:${TK[k].c}">${tkSvg(k)}<span class="ca-tk-n"><b>${TK[k].n}</b><span class="num">${pctTxt(+p / 100)}</span></span><em>${t}</em></span>`).join('')}</div>` : '';
    return `<section class="cj-cont ca-cont"><header class="cj-sec-h"><h3>Contenido de la caja</h3></header>${tks}<div class="ca-grid">${filas.map((f) => {
      const x = f.it, n = nombre(x);
      return `<div class="ca-c" style="--c:${color(x.rarity)}" title="${esc(x.name)}"><span class="ca-pct">${pctTxt(f.pct)}</span><span class="ca-ci">${pic(x.image, 256)}</span>
        <span class="ca-ct">${n.top ? `<em data-notr>${esc(n.top)}</em>` : ''}<b data-notr>${esc(n.main)}</b></span><span class="ca-cv">${f.desde ? '<i>desde</i>' : ''}${N(f.v || 0)}${coin()}</span></div>`;
    }).join('')}</div></section>`;
  }
  /* ----- lo ultimo bueno que ha salido: una tira viva de 7 ----- */
  // PM 03-11: "que salgan los ultimos 7 buenos drops y se vaya moviendo: cuando toca algo bueno otra vez y sea la 8a vez, el numero 1 se
  // cambia de lugar y todos se mueven un lado mas para darle espacio al drop 8; y si pasas el mouse por arriba que salga que caja fue".
  // Bueno = Clasificado, Encubierto o ★ (lo que cs_state ya manda en feed: rareza cla, cov o esp, sacado de una caja, sin batallas).
  // El mas viejo a la izquierda y el nuevo entra por la derecha. La tira es un nodo fijo (FD.el) que la pantalla vuelve a colgar en cada
  // repintado, asi que la animacion no se corta. Llega en vivo: abrir una caja toca pulse, la app recarga y cargar() llama a fdSync().
  const FD_N = 7, FD_ESPERA = 3600;   // lo que saca otro espera a que acabe su ruleta en directo (cajas-vivo.js), para no chafarsela
  // PM 03-11: "en Latest drops haz que se pueda cambiar por Best drops tambien". Mejores = los 7 de mas valor de siempre (cajas y batallas,
  // cualquier rareza), del mas caro al mas barato; se rehace cuando sale uno que supera al 7o. La eleccion se guarda en este aparato.
  const FD = { el: null, list: [], cola: [], t: 0, mov: false, sx: 0, modo: lee('cj-fd-modo') === 'best' ? 'best' : 'latest' };
  const fdObjetivo = () => (!D.st ? [] : FD.modo === 'best' ? (D.mejores || []).slice(0, FD_N) : (D.buenos || D.st.feed).slice(0, FD_N).reverse());
  function fdTile(i) {
    const x = item(i.item), n = nombre(x), c = caja(i.case), top = n.top || (esLujo(x.id) || catDe(c) === 'lujo' ? c.name || '' : '');
    return `<div class="cj-fd" data-id="${esc(i.id)}" style="--c:${color(x.rarity)}"><span class="cj-fd-img">${pic(x.image, 256)}</span>
        <span class="cj-fd-n" data-notr>${top ? `<em>${esc(top)}</em>` : ''}${x.rarity === 'esp' && n.top ? '★ ' : ''}${esc(n.main)}</span>
        <span class="cj-fd-b">${av(i.by, 'sm')}<span class="cj-fd-v">${N(i.value)}${coin()}</span></span>
        <span class="cj-fd-tip">${c.image ? `<span class="cj-fd-ti">${pic(c.image, 256)}</span>` : ''}${c.name ? `<span class="lab">${i.battle ? 'En batalla' : 'Salió de'}</span><b data-notr>${esc(c.name)}</b>` : ''}<span class="cj-fd-q"><span>Lo abrió</span><i data-notr>${esc(jug(i.by).n)}</i></span></span></div>`;
  }
  // Ultimos: al final (lo nuevo entra por la derecha); Mejores: al principio (el mas caro a la izquierda)
  function fdAlFinal() { const e = FD.el; if (e && e.isConnected) e.scrollLeft = FD.modo === 'best' ? 0 : e.scrollWidth - e.clientWidth + FD.sx }
  function fdLlena(list) {
    FD.list = list.slice(); if (!FD.el) return;
    FD.el.innerHTML = FD.list.map(fdTile).join('');
    traduce(FD.el); fdAlFinal();
  }
  // pasar el raton (PC, por CSS) o tocar (movil) ensena de que caja salio y quien la abrio.
  // PM 04-11 "sigue bugeado lo del drop, aun me sale en la pantalla el drop de la caja": antes un clic (PC) o un toque dejaba la tarjeta
  // puesta hasta tocar otra cosa (deslizar la pagina no la quitaba). Ahora en PC el clic no deja nada; en movil se va sola a los 3 s,
  // al deslizar (la pagina o la tira) y al tocar fuera.
  const fdRaton = () => { try { return matchMedia('(hover: hover) and (pointer: fine)').matches } catch { return false } };
  function fdCierra() { clearTimeout(FD.tv); if (FD.el) FD.el.querySelectorAll('.cj-fd.ver').forEach((x) => x.classList.remove('ver')) }
  function fdToque(e) {
    const k = e.target.closest('.cj-fd'); if (!k) return;
    const on = !k.classList.contains('ver');
    fdCierra();
    if (!on || (fdRaton() && e.pointerType !== 'touch')) return;
    k.classList.add('ver'); FD.tv = setTimeout(fdCierra, 3000);
  }
  document.addEventListener('click', (e) => { if (FD.el && !FD.el.contains(e.target)) fdCierra() });
  window.addEventListener('scroll', () => { if (FD.el && FD.el.querySelector('.cj-fd.ver')) fdCierra() }, { capture: true, passive: true });
  function vFeed() {
    const hay = D.st && ((D.buenos || D.st.feed).length || (D.mejores || []).length); if (!hay) return '';
    return `<section class="cj-feed-s ${FD.modo}"><header class="cj-sec-h"><h3>${FD.modo === 'best' ? 'Los mejores drops' : 'Lo último que ha salido'}</h3>${seg('fdmodo', [['latest', 'Últimos'], ['best', 'Mejores']], FD.modo, 'sm cj-fd-modo')}</header><div data-cjfeed></div></section>`;
  }
  // despues de cada repintado: la tira de siempre en su hueco (y en el sitio del scroll en el que estaba)
  function ponFeed() {
    const h = root && root.querySelector('[data-cjfeed]'); if (!h) return;
    if (!FD.el) {
      FD.el = document.createElement('div'); FD.el.className = 'cj-feed';
      FD.el.addEventListener('click', fdToque);
      FD.el.addEventListener('scroll', () => { if (!FD.mov && FD.modo !== 'best') FD.sx = Math.min(0, FD.el.scrollLeft - (FD.el.scrollWidth - FD.el.clientWidth)) }, { passive: true });
    }
    if (!FD.list.length) fdLlena(fdObjetivo());
    h.replaceWith(FD.el); fdAlFinal();
  }
  // tras cada carga: lo que ha entrado nuevo se pone en cola y entra de uno en uno; si no cuadra (o es la primera vez), se pinta tal cual
  function fdSync() {
    const obj = fdObjetivo(), ids = obj.map((i) => i.id).join();
    // Mejores: sin tira viva; si entra uno nuevo en el top 7 se repinta y el nuevo brilla
    if (FD.modo === 'best') {
      if (FD.list.map((i) => i.id).join() === ids) return;
      const antes = new Set(FD.list.map((i) => i.id)), habia = FD.list.length;
      FD.cola = []; clearTimeout(FD.t); fdLlena(obj);
      if (habia && FD.el) for (const i of obj) if (!antes.has(i.id)) { const k = FD.el.querySelector(`.cj-fd[data-id="${CSS.escape(String(i.id))}"]`); if (k) { k.classList.add('nuevo'); setTimeout(() => k.classList.remove('nuevo'), 2600) } }
      return;
    }
    if (!FD.list.length) { FD.cola = []; clearTimeout(FD.t); return fdLlena(obj) }
    const ya = new Set([...FD.list, ...FD.cola.map((q) => q.i)].map((i) => i.id)), nuevos = obj.filter((i) => !ya.has(i.id));
    const esperado = [...FD.list, ...FD.cola.map((q) => q.i), ...nuevos].slice(-FD_N).map((i) => i.id).join();
    if (esperado !== ids) { FD.cola = []; clearTimeout(FD.t); return fdLlena(obj) }
    const ahora = Date.now();
    for (const i of nuevos) FD.cola.push({ i, at: ctx && i.by !== ctx.me ? ahora + FD_ESPERA : ahora });
    fdSigue();
  }
  function fdSigue() {
    clearTimeout(FD.t);
    if (FD.mov || !FD.cola.length) return;
    const w = FD.cola[0].at - Date.now();
    if (w > 0) { FD.t = setTimeout(fdSigue, w); return }
    fdEntra(FD.cola.shift().i);
  }
  // la entrada: el nuevo aparece por la derecha, los demas se corren un sitio a la izquierda y el mas viejo se va (FLIP con animate())
  function fdEntra(i) {
    const el = FD.el, sale = FD.list.length >= FD_N ? FD.list[0] : null;
    const anima = el && el.isConnected && !document.hidden && !document.documentElement.classList.contains('sin-anim') && typeof el.animate === 'function';
    FD.list = [...FD.list, i].slice(-FD_N);
    if (!anima) { fdLlena(FD.list); return fdSigue() }
    FD.mov = true;
    const caja0 = el.getBoundingClientRect(), antes = new Map([...el.children].map((k) => [k.dataset.id, k.getBoundingClientRect()]));
    const viejo = sale && el.querySelector(`.cj-fd[data-id="${CSS.escape(String(sale.id))}"]`);
    if (viejo) {
      const r = antes.get(String(sale.id));
      viejo.classList.add('sale'); viejo.classList.remove('ver');
      Object.assign(viejo.style, { position: 'absolute', left: `${r.left - caja0.left + el.scrollLeft}px`, top: `${r.top - caja0.top + el.scrollTop}px`, width: `${r.width}px` });
    }
    const t = document.createElement('div'); t.innerHTML = fdTile(i); const nuevo = t.firstElementChild;
    nuevo.classList.add('nuevo'); traduce(nuevo);
    el.appendChild(nuevo);
    fdAlFinal();
    const ease = 'cubic-bezier(.2,.8,.2,1)';
    for (const k of el.children) {
      if (k === nuevo || k === viejo) continue;
      const a = antes.get(k.dataset.id); if (!a) continue;
      const dx = a.left - k.getBoundingClientRect().left;
      if (Math.abs(dx) > 0.5) k.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: 620, easing: ease });
    }
    if (viejo) viejo.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(-28px) scale(.86)' }], { duration: 420, easing: 'ease-in', fill: 'forwards' });
    nuevo.animate([{ opacity: 0, transform: 'translateX(46px) scale(.82)' }, { opacity: 1, transform: 'none' }], { duration: 640, delay: 140, easing: ease, fill: 'backwards' });
    setTimeout(() => { if (viejo) viejo.remove(); FD.mov = false; fdSigue() }, 820);
    setTimeout(() => nuevo.classList.remove('nuevo'), 2600);
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
    const vis = visibles(), ver = vis.slice(0, S.invN);
    if (mio) for (const id of [...S.sel]) if (!vendible(porId(id))) S.sel.delete(id);   // lo que ya no esta (vendida desde otro sitio) sale de la seleccion
    const filtrado = S.fR || S.fC;
    const filtros = inv.length < 2 ? '' : `<div class="cj-filt">
        ${seg('orden', ORDENES, S.orden, 'sm')}
        ${rars.length > 1 ? `<nav class="cj-rars"><button class="${!S.fR ? 'on' : ''}" data-cj="fR" data-v="">Todas</button>${rars.map((r) => `<button class="${S.fR === r ? 'on' : ''}" style="--c:${color(r)}" data-cj="fR" data-v="${r}"><i></i><span>${RAR[r][0]}</span><b>${nR[r]}</b></button>`).join('')}</nav>` : ''}
      </div>
      ${nC.size > 1 ? `<nav class="cj-fcs"><button class="cj-fc ${!S.fC ? 'on' : ''}" data-cj="fC" data-v=""><span>Todas las cajas</span></button>${[...nC].sort((a, b) => b[1] - a[1]).map(([id, n]) => `<button class="cj-fc ${S.fC === id ? 'on' : ''}" data-cj="fC" data-v="${esc(id)}" title="${esc(caja(id).name || '')}">${pic(caja(id).image, 128)}<span data-notr>${esc(caja(id).name || id)}</span><b>${n}</b></button>`).join('')}</nav>` : ''}`;
    const herramientas = mio ? `<div class="cj-tools"><span class="hint cj-hint"><span class="pc">Clic para elegir, Mayús y clic para un rango, arrastra para marcar varias</span><span class="mv">Toca para elegir, mantén y arrastra para marcar varias</span></span>
        ${D.st.inv.length ? `<button class="chip cj-todo ${S.sure === 'todo' ? 'on' : ''}" data-cj="vendertodo">${S.sure === 'todo' ? `¿Vender las ${N((S.todo || []).length)} por ${N((S.todo || []).reduce((a, x) => a + x.value, 0))}? Toca otra vez` : 'Vender todo el inventario'}</button>` : ''}</div>` : '';
    // atajos: sobre lo que se ve (el filtro activo)
    const atajos = mio && vis.length > 1 ? `<div class="cj-at">
        <button data-cj="at" data-t="todo"><span>Todo lo visible</span><i>${N(vis.length)}</i></button>
        <span class="cj-at-g"><em>Menos de</em>${MENOS_DE.map((x) => `<button data-cj="at" data-t="menos" data-v="${x}"><span>${x}</span></button>`).join('')}</span>
      </div>` : '';
    return `${fila}${tuyas}${head}${herramientas}${filtros}
      ${filtrado ? `<p class="cj-count"><span>${cuantas(vis.length, vis)}</span><span class="num">${N(vis.reduce((a, i) => a + i.value, 0))}${coin()}</span><button class="chip" data-cj="sinfiltro">Quitar filtros</button></p>` : ''}
      ${atajos}
      <div class="cj-grid cj-inv">${ver.map((i) => { const ok = vendible(i); return tile(item(i.item), { top: caja(i.case).name, meta: metaDe(i), valor: i.value, on: S.sel.has(i.id), bloq: mio && !ok, boton: mio && ok ? `data-cj="sel" data-v="${i.id}"` : '' }) }).join('')}</div>
      ${vis.length > ver.length ? `<div class="cj-more"><button class="chip" data-cj="mas">Ver ${Math.min(INV_PASO, vis.length - ver.length)} más</button></div>` : ''}
      ${mio ? `<div class="cj-bar" data-selbar ${S.sel.size ? '' : 'hidden'}>${S.sel.size ? barraHtml() : ''}</div>` : ''}`;
  }

  /* ----- Giro Dorado (db/075) ----- */
  // PM 03-11: un giro extra de premio dentro de las cajas. A veces (4 %), despues de frenar la tira, salta el Giro Dorado: dos objetos de
  // verdad de la misma caja, uno que vale mas (Sube) y otro que vale menos (Baja; si no hay nada mas barato, quedarse con lo que salio),
  // al 50 %. Lo decide la base al abrir la caja y lo guarda en cs_inv.bonus ({orig, up, down, won}); aqui solo se ensena: un selector
  // dorado que salta de uno a otro cada vez mas despacio y para en el que toco. Respeta la velocidad (Normal, Rapido, Ultra) y Saltar.
  const gdDur = () => GD_DUR[+S.vel] || GD_DUR[0];
  const gdTag = (i) => (esTk(i) ? `<span class="ca-gd tk-${i.bonus.tipo}"><b>${TK[i.bonus.tipo].n}</b></span>` : !i || !i.bonus || !i.bonus.orig ? '' : `<span class="ca-gd ${i.bonus.won ? 'sube' : 'baja'}"><b>Giro Dorado</b><i>${i.bonus.won ? '▲' : i.bonus.down && i.bonus.down.keep ? '=' : '▼'}</i><em>antes ${N(i.bonus.orig.value)}</em></span>`);
  function gdCarta(o, lado) {
    const x = item(o.item), n = nombre(x), sinFoto = x.rarity === 'esp' && !esLujo(x.id) && !x.image, t = lado === 'sube' ? 'Sube' : o.keep ? 'Se queda' : 'Baja';
    return `<div class="gd-c ${lado}" style="--c:${color(x.rarity)}"><span class="gd-p"><i>${lado === 'sube' ? '▲' : o.keep ? '=' : '▼'}</i><span>${t}</span><b>50 %</b></span>
      <span class="gd-i">${sinFoto ? '<i class="cj-k-star">★</i>' : pic(x.image, 256, '', true)}</span>
      <span class="gd-n" data-notr>${esc(n.main)}</span><span class="gd-v">${N(o.value)}${coin()}</span></div>`;
  }
  // h: sobre la tira de abrir (las dos cartas una al lado de otra); v: en la columna de una batalla (una encima de otra)
  const gdHtml = (bo, cls = '') => `<div class="gd ${cls}" data-gd data-k="${bo.won ? 12 : 11}" data-on="0" data-won="${bo.won ? 1 : 0}" data-keep="${bo.down && bo.down.keep ? 1 : 0}">
    <span class="gd-t"><i></i><span>Giro Dorado</span><i></i></span><div class="gd-cs">${gdCarta(bo.up, 'sube')}${gdCarta(bo.down, 'baja')}</div></div>`;
  // el selector a los ms de empezar: k saltos, cada uno mas lento (el salto i a dur * (i/k)^1,8); acaba en el lado que toco
  function gdPaso(el, ms, dur, sonFin = true) {
    const k = +el.dataset.k || 12, fin = ms >= dur;
    let c = k;
    if (!fin) { c = 0; for (let i = 1; i <= k; i++) { if (dur * Math.pow(i / k, 1.8) <= ms) c = i; else break } }
    if (el.dataset.c !== String(c)) {
      if (el.dataset.c != null) { try { window.dispatchEvent(new CustomEvent('gm:sonido', { detail: { tipo: 'caja-tic', vol: 0.9 } })) } catch {} }
      el.dataset.c = String(c); el.dataset.on = String(c % 2);
    }
    if (fin && !el.classList.contains('fin')) {
      el.classList.add('fin', el.dataset.won === '1' ? 'gano' : 'perdio');
      if (sonFin) { try { window.dispatchEvent(new CustomEvent('gm:sonido', { detail: el.dataset.won === '1' ? 'cobrar' : el.dataset.keep === '1' ? 'clic' : 'perder' })) } catch {} }
    }
  }
  // al acabar el giro, la carta del centro de la tira pasa a ser lo que se queda
  function gdFinTira(strip, t, inv) {
    t.cs[G] = { x: item(inv.item), v: inv.value }; t.col = color(item(inv.item).rarity);
    if (!strip || !strip.isConnected) return;
    const k = strip.firstElementChild && strip.firstElementChild.children[G];
    if (k) { const w = document.createElement('div'); w.innerHTML = kcard(t.cs[G], true); const nk = w.firstElementChild; k.replaceWith(nk); traduce(nk) }
    strip.style.setProperty('--c', t.col);
  }
  // el Giro Dorado encima de una tira ya parada
  function gdEnTira(strip, t, inv) {
    return new Promise((ok) => {
      if (!strip || !strip.isConnected) { gdFinTira(strip, t, inv); return ok() }
      const w = document.createElement('div'); w.innerHTML = gdHtml(inv.bonus, 'h'); const el = w.firstElementChild;
      traduce(el); strip.appendChild(el); strip.classList.add('dorado');
      const dur = gdDur(), hold = GD_HOLD[+S.vel] || GD_HOLD[0], t0 = performance.now();
      const paso = () => {
        const sal = !!(anim && anim.saltar), ms = sal ? dur : performance.now() - t0;
        gdPaso(el, ms, dur);
        if (ms < dur) { requestAnimationFrame(paso); return }
        setTimeout(() => {
          gdFinTira(strip, t, inv); el.classList.add('sale');
          setTimeout(() => { el.remove(); strip.classList.remove('dorado'); ok() }, anim && anim.saltar ? 0 : 260);
        }, sal ? 0 : hold);
      };
      requestAnimationFrame(paso);
    });
  }
  // la prueba gratis lo imita (sin base) con la misma probabilidad y las mismas reglas, con lo que vale cada objeto normalmente
  function gdFalso(info, i) {
    const v = i.value; if (!(v >= 1) || !info || !info.items) return null;
    const tk = conTickets(info), al = (l) => l[(Math.random() * l.length) | 0];
    const cand = info.items.filter((it) => it.id !== i.item && (!tk || it.tickets != null)).map((it) => ({ item: it.id, value: valorDe(it) })).filter((c) => c.value >= 1);
    let up = cand.filter((c) => c.value >= 1.5 * v && c.value <= 6 * v);
    up = up.length ? al(up) : cand.filter((c) => c.value > v).sort((a, b) => a.value - b.value)[0];
    if (!up) return null;
    let dn = cand.filter((c) => c.value >= 0.25 * v && c.value <= 0.75 * v);
    dn = dn.length ? al(dn) : cand.filter((c) => c.value < v).sort((a, b) => b.value - a.value)[0];
    const orig = { item: i.item, value: v };
    return { orig, up, down: dn || { ...orig, keep: true }, won: Math.random() < 0.5 };
  }

  /* ----- Tickets: Ticket Dorado y Ticket de Diamante (db/081) ----- */
  // bonus = {tipo: 'oro'|'diamante', lado: 'malo'|'medio'|'bueno', desde, hasta}; desde/hasta: entre que valores medios va lo que pasa por
  // la tira al volver a girar (el Dorado: lo malo y lo medianamente bueno; el Diamante: solo lo bueno). Lo que sale ya viene en la pieza.
  function esTk(i) { return !!(i && i.bonus && TK[i.bonus.tipo]) }
  // lo que vale de media un objeto si sale (igual que cs_ev de db/081): el desgaste como en el juego y StatTrak el 10 %
  function evDe(it) {
    if (!it || !it.price) return 0;
    const pw = it.minf == null ? [1, 0, 0, 0, 0] : probW(+it.minf, +it.maxf), pst = it.st ? 0.1 : 0, p = (k) => Math.max(1, it.price[k] == null ? 1 : +it.price[k]);
    let ev = 0; for (let w = 0; w < 5; w++) if (pw[w] > 0) ev += pw[w] * ((1 - pst) * p(w) + pst * p(5 + w));
    return ev;
  }
  // el peso de cada objeto dentro de la caja (como cs_roll): sus tickets o, en CS2, el de su rareza por su peso
  function qDe(info, it) {
    if (conTickets(info)) return +it.tickets || 0;
    const PESO = D.cases && D.cases.some((c) => c.cat != null) ? PESO_012 : PESO_007, l = info.por[it.rarity] || [it];
    return (PESO[it.rarity] || 1) * (it.weight || 100) / (l.reduce((a, x) => a + (x.weight || 100), 0) || 1);
  }
  // lo que pasa por la tira al volver a girar
  function montonTk(info, bo) {
    if (!info || !info.items) return [];
    const tk = conTickets(info), lo = +bo.desde || 0, hi = bo.hasta == null ? Infinity : +bo.hasta;
    return info.items.filter((it) => (!tk || it.tickets != null) && (() => { const e = evDe(it); return e >= lo && e <= hi })());
  }
  // el ticket: un billete con su sello (estrella el Dorado, diamante el de Diamante). Sin degradados con id: se pinta igual repetido
  const tkSello = (tipo) => (tipo === 'diamante'
    ? '<path class="tk-g" d="M61 31l7-9h14l7 9-14 22z"/><path class="tk-l" d="M61 31h28M68 22l4 9 3 22M82 22l-4 9-3 22"/>'
    : '<path class="tk-g" d="M75 20l4.1 11.3 12.1.4-9.5 7.4 3.3 11.6L75 44l-10 6.7 3.3-11.6-9.5-7.4 12.1-.4z"/>');
  const tkSvg = (tipo) => `<svg class="tk-svg" viewBox="0 0 120 76" aria-hidden="true"><path class="tk-b" d="M8 6h104a4 4 0 0 1 4 4v16a12 12 0 0 0 0 24v16a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V50a12 12 0 0 0 0-24V10a4 4 0 0 1 4-4z"/>
    <path class="tk-s" d="M10 12h100v14H10z"/><path class="tk-d" d="M34 12v52"/>${tkSello(tipo)}</svg>`;
  // la carta del ticket en la tira (--c dorado: sonidos.js la oye como lo mejor y suena el premio grande)
  const tkCard = (tipo, gana) => `<div class="cj-k tk tk-${tipo} ${gana ? 'gana' : ''}" style="--c:#e4ae39;--tk:${TK[tipo].c}"><span class="cj-k-i">${tkSvg(tipo)}</span><b>${TK[tipo].n}</b><span class="cj-k-v tk-x">Giro extra</span></div>`;
  // el sonido de la tira al pasar cartas, mientras se mueve (la vuelta del ticket no la sigue sonidos.js)
  function tkTics(track, kw) {
    let idx = -1, vivo = true;
    (function marco() {
      if (!vivo || !track.isConnected) return;
      const m = getComputedStyle(track).transform, tx = m && m !== 'none' ? new DOMMatrix(m).m41 : 0, i = Math.floor(-tx / (kw || 1));
      if (i !== idx) { if (idx !== -1) suena({ tipo: 'caja-tic', vol: 0.8 }); idx = i }
      requestAnimationFrame(marco);
    })();
    return () => { vivo = false };
  }
  const suena = (detail) => { try { window.dispatchEvent(new CustomEvent('gm:sonido', { detail })) } catch {} };
  // sin animacion (o la tira ya no esta): la carta del centro pasa a ser lo que ha salido
  function tkFinTira(t, inv) { t.cs[G] = { x: item(inv.item), v: inv.value }; t.col = color(item(inv.item).rarity) }
  // la tira ha parado en el ticket: brilla, espera y vuelve a girar sola, del ticket a lo que ha salido. Las demas tiras no se tocan
  async function tkEnTira(strip, t, inv, info) {
    const v = +S.vel, tipo = inv.bonus.tipo;
    if (!strip || !strip.isConnected) { tkFinTira(t, inv); return }
    strip.classList.add('tk-pop');
    suena(tipo === 'diamante' ? 'cobrar' : 'clic');
    await espera(TK_HOLD[v]);
    if (!strip.isConnected) { tkFinTira(t, inv); return }
    // la tira nueva: el ticket donde se para (INI) y lo que ha salido en G; en medio, solo lo de su monton
    const pool = montonTk(info, inv.bonus), al = () => (pool.length ? pool[(Math.random() * pool.length) | 0] : item(inv.item)), cs = [];
    for (let i = 0; i < TOTAL; i++) {
      if (i === G) { cs.push({ x: item(inv.item), v: inv.value }); continue }
      if (i === INI) { cs.push({ tk: tipo }); continue }
      let x = al(); for (let k = 0; k < 8 && cs.slice(-2).some((c) => c.x && c.x.id === x.id); k++) x = al();
      cs.push({ x, v: valorDe(x) });
    }
    t.cs = cs; t.j = (Math.random() - 0.5) * 0.6; t.col = color(item(inv.item).rarity);
    const track = strip.firstElementChild;
    for (const a of track.getAnimations()) { try { a.cancel() } catch {} }
    track.innerHTML = cs.map((c) => kcard(c, false)).join(''); traduce(track);
    strip.classList.remove('fin', 'tk-pop'); strip.classList.add('tk-gira');
    const k0 = track.children[INI], calla = tkTics(track, k0 ? k0.offsetWidth + (parseFloat(getComputedStyle(track).columnGap) || 0) : 1);
    await gira(strip, t, anim && anim.saltar ? 1 : TK_DUR[v]);
    calla();
    strip.classList.remove('tk-gira'); strip.style.setProperty('--c', t.col);
    suena({ tipo: 'caja-final', rareza: item(inv.item).rarity, vol: 0.7 });
  }
  // la prueba gratis lo imita (sin base) con las probabilidades de la caja (cs_giro_info) y los mismos montones
  function tkFalso(info) {
    const g = info.giro || TK_DEF, r = Math.random() * 100, P = (caja(info.id).price || info.price || 1);
    let tipo = null, bo = null;
    if (r < +g.oro) { tipo = 'oro'; bo = { tipo, lado: Math.random() * 100 < +g.sube ? 'medio' : 'malo', desde: 0, hasta: g.hasta != null ? +g.hasta : Math.floor(3 * P) } }
    else if (r - g.oro < +g.diamante) { tipo = 'diamante'; bo = { tipo, lado: 'bueno', desde: g.desde != null ? +g.desde : Math.ceil(1.5 * P), hasta: null } }
    if (!bo) return null;
    const tk = conTickets(info), todos = info.items.filter((it) => !tk || it.tickets != null).map((it) => ({ it, e: evDe(it) }));
    let l = bo.lado === 'malo' ? todos.filter((o) => o.e < P) : bo.lado === 'medio' ? todos.filter((o) => o.e >= P && o.e <= bo.hasta) : todos.filter((o) => o.e >= bo.desde);
    if (!l.length) { const s = todos.slice().sort((a, b) => a.e - b.e); l = [bo.lado === 'malo' ? s[0] : bo.lado === 'medio' ? s.find((o) => o.e >= P) || s[s.length - 1] : s[s.length - 1]] }
    const tot = l.reduce((a, o) => a + qDe(info, o.it), 0); let x = Math.random() * tot, pick = l[l.length - 1].it;
    for (const o of l) { x -= qDe(info, o.it); if (x < 0) { pick = o.it; break } }
    return { item: pick.id, value: valorDe(pick), bonus: bo };
  }

  /* ----- batallas ----- */
  // db/072: 1v1, 2v2, 3v3, 2v2v2 y 3, 4 o 6 todos contra todos; Normal (gana quien mas saca) o Crazy (quien menos)
  const tamDe = (b) => eqDe(b) * teDe(b);
  const sitiosDe = (b, t) => Array.from({ length: teDe(b) }, (_, i) => t * teDe(b) + i);
  // el color de un equipo: el de su primer jugador
  const eqColor = (b, t) => { const x = b.seats.find((y) => Math.floor(y.seat / teDe(b)) === t); return x ? `var(--f-${esc(jug(x.player).color)})` : 'rgba(255,255,255,.18)' };
  // "Ana", "Ana y Luis", "Ana, Luis y Eva"
  // (en: los nombres de las filas no pasan por el diccionario, asi que ahi se pone and directamente)
  const yLista = (l, en) => (l.length < 2 ? l.join('') : `${l.slice(0, -1).join(', ')} ${en && window.GM_LANG && GM_LANG.get() === 'en' ? 'and' : 'y'} ${l[l.length - 1]}`);
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
          const te = teDe(b), bote = (b.totals || []).reduce((a, v) => a + (v || 0), 0);
          const gan = (b.cs_battle_seats || []).filter((x) => Math.floor(x.seat / te) === b.winner);
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
    return `${topBat()}<header class="cj-bh"><p class="cj-lead">Cada uno abre las mismas cajas y el lado ganador se lo lleva todo. En Normal gana quien más saca; en Crazy, quien menos.</p>
        <button class="go" data-cj="nueva"><span>Crear batalla</span></button></header>
      <section class="cj-bl"><header class="cj-bl-h"><h3>Abiertas</h3>${abiertas.length ? `<span class="num">${abiertas.length}</span>` : ''}</header>
        ${abiertas.length ? `<div class="cj-bts">${abiertas.map(filaBat).join('')}</div>` : '<p class="hint">Ninguna abierta ahora mismo.</p>'}</section>
      <section class="cj-bl" data-hechas><header class="cj-bl-h"><h3>Terminadas</h3>${H.total ? `<span class="num">${N(H.total)}</span>` : ''}</header>
        ${H.rows.length ? `<div class="cj-bts ${H.espera ? 'espera' : ''}">${H.rows.map(filaBat).join('')}</div>${pager(H)}` : '<p class="hint">Todavía no ha terminado ninguna.</p>'}</section>`;
  }
  // un lado (un equipo) de la fila: avatares, nombres y (si ha terminado) lo que ha sacado. Con mas de dos equipos, en columna y mas pequeno
  function lado(b, t, unir) {
    const multi = eqDe(b) > 2 || teDe(b) > 2, done = b.status === 'done', dentro = b.seats.some((x) => x.player === ctx.me);
    const ss = sitiosDe(b, t).map((s) => ({ s, x: b.seats.find((y) => y.seat === s) }));
    const avs = ss.map(({ s, x }) => x ? av(x.player, 'md')
      : unir && !dentro && b.status === 'open' && ctx.saldo >= b.cost ? `<button class="cj-seat" data-cj="unir" data-v="${b.id}|${s}" title="Unirme aquí">+</button>` : '<span class="cj-seat"></span>').join('');
    const nombres = yLista(ss.filter(({ x }) => x).map(({ x }) => esc(jug(x.player).n)), true);
    const gana = done && b.winner === t;
    return `<span class="cj-side ${multi ? 'm' : 's' + t} ${done ? (gana ? 'win' : 'lose') : ''}"><span class="cj-avs">${avs}</span>
      <span class="cj-side-n"><b data-notr>${nombres || '&nbsp;'}</b>${gana ? '<i class="cj-crown" title="Ganador"></i>' : ''}</span>
      ${done && b.totals ? `<span class="num">${N(b.totals[t])}</span>` : ''}</span>`;
  }
  // el formato en la fila: 1v1, 2v2v2... y los de todos contra todos como "4 jugadores"
  const fmtB = (b) => (libre(b) ? `<b class="w">${eqDe(b)}<small>jugadores</small></b>` : `<b class="${b.mode.length > 3 ? 'l' : ''}">${esc(b.mode)}</b>`);
  function filaBat(b) {
    const dentro = b.seats.some((x) => x.player === ctx.me), mio = b.by === ctx.me, done = b.status === 'done', nueva = done && dentro && reciente(b) && !visto(b.id);
    const n = b.cases.length, muestra = b.cases.slice(0, 4), ne = eqDe(b), multi = ne > 2 || teDe(b) > 2;
    const cs = `${muestra.map((cid) => pic(caja(cid).image, 128)).join('')}${n > muestra.length ? `<em>+${n - muestra.length}</em>` : ''}`;
    const vs = `<span class="cj-vs ${multi ? 'multi' : ''}">${Array.from({ length: ne }, (_, t) => lado(b, t, true)).join('<i>vs</i>')}</span>`;
    const meta = (cases) => `<span class="cj-bt-meta"><span class="cj-bt-m">${fmtB(b)}${loca(b) ? '<i class="cj-loca">Crazy</i>' : ''}<em>${n === 1 ? '1 ronda' : n + ' rondas'}</em></span>${cases}
      <span class="cj-bt-wh">${done ? `<span data-notr>${cuando(b.done_at || b.at)}</span>` : `<b class="num">${N(b.cost)}</b>${coin()}<em>por cabeza</em>`}</span></span>`;
    // en el movil no cabe la hora: el precio va en el boton de unirse
    if (done) return `<button class="cj-bt done ${dentro ? 'mia' : ''} ${multi ? 'multi' : ''}" data-cj="ver" data-v="${b.id}">${meta(`<span class="cj-bt-cs">${cs}</span>`)}${vs}
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
    return `<div class="cj-bt open ${pide ? 'pide' : ''} ${multi ? 'multi' : ''}">${meta(`<button class="cj-bt-cs" data-cj="ver" data-v="${b.id}" title="Ver">${cs}</button>`)}${vs}<span class="cj-bt-act">${act}</span></div>`;
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
  // Crear batalla (PM 04-11: "para crear se tiene que scrollear mucho"): arriba el modo y la regla en una fila; debajo, a la izquierda,
  // las cajas con buscador, categorias y paginas (18 por pagina, 9 en el movil) y, a la derecha, la batalla con lo que cuesta y Crear,
  // siempre a la vista (en el movil es una barra pegada abajo).
  const enNv = () => !!(window.GM_LANG && GM_LANG.get() === 'en');
  const LN = (es, eng) => (enNv() ? eng : es);
  const sinTilde = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const nvPorPag = () => (!window.matchMedia ? 18 : window.matchMedia('(max-width:860px)').matches ? 9 : window.matchMedia('(max-width:1179px)').matches ? 16 : 18);   // 3, 4 o 6 columnas
  // las cajas de la pagina de ahora: por categoria (nv.g, vacio = todas) y por lo que se busca (con busqueda se mira en todas)
  function nvLista(nv) {
    const q = sinTilde(nv.q).trim();
    return (D.cases || []).filter((c) => (q ? sinTilde(c.name).includes(q) : !nv.g || grupoDe(c) === nv.g));
  }
  function nvPick(nv) {
    const lista = nvLista(nv), per = nvPorPag(), pags = Math.max(1, Math.ceil(lista.length / per)), p = (nv.p = Math.max(0, Math.min(nv.p || 0, pags - 1)));
    const n = nv.cases.length, vivos = gruposVivos();
    const pk = (c) => { const k = nv.cases.filter((x) => x === c.id).length; return `<button class="cj-pk ${k ? 'on' : ''}" data-cj="add" data-v="${esc(c.id)}" ${n >= 10 ? 'disabled' : ''} title="${esc(c.name)}">
      <span class="cj-pk-img">${pic(c.image, 128)}${k ? `<i>${k}</i>` : ''}</span><span class="cj-pk-n" data-notr>${esc(c.name)}</span><span class="cj-pk-p">${N(c.price)}${coin()}</span></button>` };
    const chips = vivos.length > 1 ? `<nav class="nv-grp" aria-label="${LN('Categorías', 'Categories')}">${[['', LN('Todas', 'All')], ...vivos].map(([k, t]) => `<button class="${(nv.g || '') === k && !nv.q ? 'on' : ''}" data-cj="ngrp" data-v="${k}">${t}</button>`).join('')}</nav>` : '';
    const nums = [];
    for (let i = 0; i < pags; i++) if (i === 0 || i === pags - 1 || Math.abs(i - p) <= 1) nums.push(i); else if (nums[nums.length - 1] !== -1) nums.push(-1);
    const pg = pags > 1 ? `<nav class="cj-pager nv-pager" aria-label="${LN('Páginas', 'Pages')}">
      <button class="cj-pg prev" data-cj="npag" data-v="${p - 1}" ${p === 0 ? 'disabled' : ''} aria-label="${LN('Anterior', 'Previous')}"></button>
      ${nums.map((i) => (i < 0 ? '<span>…</span>' : `<button class="${i === p ? 'on' : ''}" data-cj="npag" data-v="${i}">${i + 1}</button>`)).join('')}
      <button class="cj-pg next" data-cj="npag" data-v="${p + 1}" ${p >= pags - 1 ? 'disabled' : ''} aria-label="${LN('Siguiente', 'Next')}"></button></nav>` : '';
    return `<div class="nv-z" data-nvz>${chips}${lista.length ? `<div class="cj-pick nv-grid">${lista.slice(p * per, (p + 1) * per).map(pk).join('')}</div>` : `<p class="hint nv-vacio">${LN('Ninguna caja se llama así', 'No box has that name')}</p>`}${pg}</div>`;
  }
  const nvRepintaPick = () => {
    const z = root && root.querySelector('[data-nvz]'); if (!z || !S.nueva) return;
    const t = document.createElement('div'); t.innerHTML = nvPick(S.nueva); const nuevo = t.firstElementChild; traduce(nuevo); z.replaceWith(nuevo);
  };
  function vNueva() {
    const nv = S.nueva, tam = tamDe(nv), n = nv.cases.length, cz = loca(nv);
    const cuesta = nv.cases.reduce((a, id) => a + (caja(id).price || 0), 0), falta = cuesta > ctx.saldo;
    // un punto por jugador, agrupados por equipo
    const puntos = (m) => { const eq = m.split('v'); return `<span class="cj-mode-d ${eq.length > 2 ? 'multi' : ''}">${eq.map((k) => `<span>${'<i></i>'.repeat(+k || 1)}</span>`).join(eq.length === 2 ? '<em>vs</em>' : '')}</span>` };
    const SUBEN = { 'cara a cara': 'head to head', 'por parejas': 'in pairs', jugadores: 'players', 'tres parejas': 'three pairs', 'por tríos': 'teams of three' };
    const modos = FORMATOS.map(([m, t, sub]) => { const tt = esc(`${t} ${LN(sub, SUBEN[sub] || sub)}`); return `<button class="nv-mode ${nv.mode === m ? 'on' : ''}" data-cj="modo" data-v="${m}" title="${tt}" aria-label="${tt}">${puntos(m)}<b>${t}</b></button>` }).join('');
    const rondas = n ? nv.cases.map((id, i) => `<button class="cj-rnd" data-cj="quita" data-v="${i}" title="${LN('Quitar', 'Remove')}">${pic(caja(id).image, 128)}<span>${i + 1}</span></button>`).join('')
      : `<span class="hint nv-sin">${LN('Toca una caja para añadir una ronda (hasta 10).', 'Tap a box to add a round (up to 10).')}</span>`;
    return `<section class="cj-new nvx">
      <header class="nv-h"><button class="cj-back" data-cj="nueva-x">Batallas</button><h2>Nueva batalla</h2><p class="cj-lead">Cada uno abre las mismas cajas y el lado ganador se lleva todas las skins.</p></header>
      <div class="nv-top"><div class="nv-modes" role="group">${modos}</div>
        <div class="cj-regla ${cz ? 'crazy' : ''}">${seg('regla', [['normal', 'Normal'], ['crazy', 'Crazy']], cz ? 'crazy' : 'normal', 'sm')}
          <p class="cj-regla-t">${cz ? 'Crazy: gana el lado que saque menos valor.' : 'Normal: gana el lado que saque más valor.'}</p></div></div>
      <div class="nv-body">
        <div class="nv-pick"><input class="nv-q" type="search" data-nv-q value="${esc(nv.q || '')}" placeholder="${LN('Buscar una caja', 'Search a box')}" autocomplete="off" aria-label="${LN('Buscar una caja', 'Search a box')}">${nvPick(nv)}</div>
        <footer class="cj-new-go nv-go">
          <div class="nv-sel"><span class="lab">${LN('Tu batalla', 'Your battle')}</span><span class="nv-n">${n} ${n === 1 ? LN('ronda', 'round') : LN('rondas', 'rounds')}<em> ${LN('de 10', 'of 10')}</em></span></div>
          <div class="cj-rounds nv-rounds">${rondas}</div>
          ${n ? `<p class="cj-new-sum"><span class="lab">Cada jugador paga</span><b class="num">${N(cuesta)}</b>${coin()}<em>bote de ${N(cuesta * tam)}</em></p>` : ''}
          <button class="go" data-cj="crear" ${!n || falta ? 'disabled' : ''}><span>${!n ? LN('Elige una caja', 'Pick a box') : falta ? 'Sin saldo' : 'Crear por'}</span>${n && !falta ? `<b>${N(cuesta)}</b>${coin()}` : ''}</button>
        </footer>
      </div>
    </section>`;
  }

  // PM, 30-10: "lo de las battles se bugea y quiero un diseño mucho mejor".
  // La repeticion va por reloj: cada fotograma saca la ronda y la posicion de cada ruleta de la hora de inicio,
  // y las ruletas se rellenan con un azar con semilla. Si la app repinta a mitad, se vuelve a pintar igual y sigue.
  // Con Giro Dorado (db/075) la ronda dura un poco mas: la ruleta frena en lo que salio y el giro lo cambia por lo que se queda.
  const KN = 34;
  let REP = null, repRaf = 0;
  const RD = () => (S.rapido ? 1700 : 4600), SPIN = () => (quieto() ? 1 : S.rapido ? 1150 : 3500);
  const gdRep = () => gdDur() + (GD_HOLD[+S.vel] || GD_HOLD[0]);
  const conGd = (b, r) => b.drops.some((d) => d.round === r && d.inv && d.inv.bonus && d.inv.bonus.orig);
  // tickets (db/081): la ruleta del sitio para en el ticket, espera y vuelve a girar sola; las de los demas sitios se quedan paradas
  const tkHold = () => TKB_HOLD[+S.vel] || TKB_HOLD[0], tkSpin = () => (quieto() ? 1 : TKB_SPIN[+S.vel] || TKB_SPIN[0]), tkRep = () => tkHold() + tkSpin();
  const conTk = (b, r) => b.drops.some((d) => d.round === r && esTk(d.inv));
  // donde va la repeticion a los e ms: ronda, tiempo dentro de ella, si ya ha frenado, el Giro Dorado (ms desde que empieza), el ticket
  // (ms desde que ha parado en el: hasta tkHold quieto, luego vuelve a girar) y si ya acabo
  function reloj(b, e) {
    const n = b.cases.length; let ini = 0;
    for (let r = 1; r <= n; r++) {
      const gd = conGd(b, r), tk = conTk(b, r), dur = RD() + (gd ? gdRep() : 0) + (tk ? tkRep() : 0), t = e - ini;
      if (t < dur || r === n) return { r, t, landed: t >= SPIN(), gd: gd && t >= SPIN() && t < SPIN() + gdRep() ? t - SPIN() : null, gdOk: !gd || t >= SPIN() + gdRep(),
        tk: tk && t >= SPIN() ? t - SPIN() : null, tkOk: !tk || t >= SPIN() + tkRep(), fin: t >= dur };
      ini += dur;
    }
    return { r: n, t: 0, landed: true, gd: null, gdOk: true, tk: null, tkOk: true, fin: true };
  }
  // la fase del ticket en la ronda de ahora: n (no hay o aun gira), h (parado en el ticket), s (vuelve a girar), ok (ya ha salido)
  const tkFase = (ph) => (ph.tk == null ? 'n' : ph.tkOk ? 'ok' : ph.tk < tkHold() ? 'h' : 's');
  // el tamano de las ruletas: en el movil, con 3 columnas, cartas mas bajas
  const movil = () => !!(window.matchMedia && window.matchMedia('(max-width:860px)').matches);
  const colsDe = (b) => (!movil() ? tamDe(b) : libre(b) ? (eqDe(b) === 4 ? 2 : 3) : teDe(b) === 1 ? 2 : teDe(b));
  const geo = (b) => { const m = movil(), c = colsDe(b); return m && c >= 3 ? { kh: 64, gap: 6, win: 150, c: 'mini' } : m ? { kh: 92, gap: 8, win: 190, c: '' } : { kh: 92, gap: 8, win: 212, c: c >= 5 ? 'estrecha' : '' } };
  // un objeto de la caja segun sus tickets (x entre 0 y 1)
  function porTickets(info, x) { const l = info.items, tot = l.reduce((a, it) => a + (it.tickets || 0), 0) || 1; let t = x * tot; for (const it of l) { t -= it.tickets || 0; if (t < 0) return it } return l[l.length - 1] }
  const sem = (x) => () => { x = (x + 0x6D2B79F5) | 0; let t = Math.imul(x ^ (x >>> 15), 1 | x); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
  function rellenoS(info, rnd) {
    if (!info) return null;
    if (conTickets(info)) return porTickets(info, rnd());
    const hay = ORDEN.filter((r) => info.por[r]), tot = hay.reduce((a, r) => a + RELLENO[r], 0);
    let x = rnd() * tot, r = hay[hay.length - 1];
    for (const k of hay) { if (x < RELLENO[k]) { r = k; break } x -= RELLENO[k] }
    const l = info.por[r]; return l[(rnd() * l.length) | 0];
  }
  const kCard = (it, gana) => it.tk ? `<div class="bv-k tk tk-${it.tk} ${gana ? 'gana' : ''}" style="--c:${TK[it.tk].c};--tk:${TK[it.tk].c}">${tkSvg(it.tk)}<b>${TK[it.tk].n}</b></div>` : it.rarity === 'esp' && !esLujo(it.id) && !it.image ? `<div class="bv-k esp ${gana ? 'gana' : ''}"><span>★</span></div>` : `<div class="bv-k ${gana ? 'gana' : ''}" style="--c:${color(it.rarity)}">${pic(it.image, 256, '', true)}</div>`;
  // la ruleta de un sitio en una ronda: p de 0 (parada arriba) a 1 (frenada en el premio). antes: con Giro Dorado, aun en lo que salio
  // tk: 'para' = la ruleta frena en el ticket (sin desvio, justo en la raya); 'vuelve' = la vuelta del ticket, que empieza con el ticket en
  // la raya (carta 1) y frena en lo que ha salido, solo con lo de su monton (data-rs: bucle() la mueve); 'fin' = ya parada en lo que salio
  function reel(b, r, seat, p, g, ya, antes, tk) {
    const d = b.drops.find((x) => x.round === r && x.seat === seat);
    if (!d) return `<div class="bv-reel"></div>`;
    const info = D.caja.get(b.cases[r - 1]), rnd = sem(b.id * 1009 + r * 31 + seat * 7 + (tk === 'vuelve' || tk === 'fin' ? 5 : 0)), o = antes && d.inv.bonus && d.inv.bonus.orig ? d.inv.bonus.orig : d.inv, cs = [];
    const win = tk === 'para' ? { tk: d.inv.bonus.tipo, rarity: 'esp' } : item(o.item), pool = tk === 'vuelve' || tk === 'fin' ? montonTk(info, d.inv.bonus) : null;
    for (let i = 0; i < KN + 3; i++) cs.push(i === KN ? win : pool && i === 1 ? { tk: d.inv.bonus.tipo } : pool && pool.length ? pool[(rnd() * pool.length) | 0] : rellenoS(info, rnd) || item(d.inv.item));
    const paso = g.kh + g.gap, centra = (g.win - g.kh) / 2, j = (rnd() - 0.5) * g.kh * 0.45, fin = KN * paso - centra + (tk === 'para' ? 0 : j);
    const y0 = tk === 'vuelve' ? paso - centra : 0, y = y0 + (fin - y0) * (1 - Math.pow(1 - p, 4)), col = win.tk ? TK[win.tk].c : color(win.rarity);
    return `<div class="bv-reel ${ya ? 'ya' : ''} ${tk ? `tk-on tk-${d.inv.bonus.tipo}` : ''} ${tk === 'para' && ya ? 'tk-pop' : ''}" style="--c:${col}"><div class="bv-track" ${tk === 'vuelve' ? `data-rs="${seat}" data-y0="${y0.toFixed(1)}"` : `data-tr="${seat}"`} data-fin="${fin.toFixed(1)}" style="transform:translateY(${(-y).toFixed(1)}px)">${cs.map((it, i) => kCard(it, i === KN)).join('')}</div><i class="bv-line"></i></div>`;
  }
  function bvIt(d, nuevo, antes) {
    const o = antes ? d.inv.bonus.orig : d.inv, x = item(o.item), tk = esTk(d.inv) ? d.inv.bonus.tipo : null, gd = d.inv.bonus && !antes && !tk;
    return `<span class="bv-it ${nuevo ? 'nuevo' : ''} ${gd ? 'gd' : ''} ${tk ? 'tk tk-' + tk : ''}" style="--c:${color(x.rarity)}${tk ? ';--tk:' + TK[tk].c : ''}" title="${esc(x.name)}${gd ? ' · Giro Dorado' : tk ? ' · ' + TK[tk].n : ''}">${x.rarity === 'esp' && !x.image ? '<b>★</b>' : pic(x.image, 128)}<em>${N(o.value)}</em></span>`;
  }
  function vBat() {
    const b = D.bats.get(S.bat), atras = '<button class="cj-back" data-cj="batallas">Batallas</button>';
    if (!b) return atras + `<p class="hint">${D.err ? esc(D.err) : 'Cargando batalla…'}</p>`;
    const ne = eqDe(b), te = teDe(b), tam = ne * te, n = b.cases.length, rep = !!(REP && REP.id === b.id), cz = loca(b), g = geo(b);
    const ph = rep ? reloj(b, Date.now() - REP.t0) : null, rNow = rep ? ph.r : n + 1, landed = rep && ph.landed;
    // con ticket en la ronda de ahora, lo que sale no se ve (ni cuenta) hasta que acaba su vuelta
    const visible = (d) => b.status === 'done' && (!rep || d.round < rNow || (d.round === rNow && landed && (!esTk(d.inv) || ph.tkOk)));
    // con Giro Dorado en la ronda de ahora, hasta que acaba se ve (y cuenta) lo que salio, no lo que se queda
    const antes = (d) => rep && d.round === rNow && !!(d.inv.bonus && d.inv.bonus.orig) && !ph.gdOk;
    const val = (d) => (antes(d) ? d.inv.bonus.orig.value : d.inv.value);
    const dr = (st) => b.drops.filter((d) => d.seat === st && visible(d)).sort((x, y) => x.round - y.round);
    const tot = (st) => dr(st).reduce((a, d) => a + val(d), 0);
    const T = Array.from({ length: ne }, (_, t) => sitiosDe(b, t).reduce((a, st) => a + tot(st), 0));
    const fin = b.status === 'done' && !rep, dentro = b.seats.some((y) => y.player === ctx.me);
    const nombres = (t) => yLista(b.seats.filter((x) => Math.floor(x.seat / te) === t).map((x) => esc(jug(x.player).n)));
    // va ganando el que mas lleva (en Crazy, el que menos); si los dos primeros empatan, nadie
    const orden = T.map((v, t) => [v, t]).sort((x, y) => (cz ? x[0] - y[0] : y[0] - x[0]));
    const lider = orden[0][0] === orden[1][0] ? null : orden[0][1], ventaja = Math.abs(orden[0][0] - orden[1][0]);
    const titulo = b.status === 'open' ? (tam - b.seats.length === 1 ? 'Falta 1 jugador' : `Faltan ${tam - b.seats.length} jugadores`)
      : rep ? `Ronda ${rNow} de ${n}` : `Gana ${nombres(b.winner) || '·'}`;
    const sub = b.status === 'open' ? (cz ? 'Se abre sola en cuanto se llena. En Crazy el lado que saque menos valor se lleva todas las skins.' : 'Se abre sola en cuanto se llena. El lado que saque más valor se lleva todas las skins.')
      : fin ? `${N(T[b.winner])} contra ${yLista(T.filter((_, t) => t !== b.winner).map(N))} · ${te > 1 ? 'se llevan' : 'se lleva'} las ${b.drops.length} skins`
      : lider == null ? 'Van empatados' : `Va ganando ${nombres(lider)} por ${N(ventaja)}`;
    const act = rep ? '<button class="chip" data-cj="saltar">Saltar</button>' : fin ? '<button class="chip" data-cj="otravez">Ver otra vez</button>'
      : b.status === 'open' && dentro ? `<button class="chip" data-cj="salir" data-v="${b.id}">${S.sure === 'salir' + b.id ? '¿Seguro? Toca otra vez' : b.by === ctx.me ? 'Cancelar' : 'Salir'}</button>` : '';
    const head = `<header class="bv-h"><div class="bv-t"><span class="lab">Batalla ${fmtTxt(b.mode)} · ${n} ${n === 1 ? 'ronda' : 'rondas'}</span>${cz ? '<i class="cj-loca">Crazy</i>' : ''}<h2 class="${fin ? 'gana' : ''}">${titulo}</h2><p>${sub}</p>${cz && b.status !== 'open' ? '<p class="bv-cz">Crazy: gana el lado que saque menos valor.</p>' : ''}</div>
      <div class="bv-pot"><span class="num">${N(b.cost * tam)}</span>${coin()}<em>${b.status === 'open' ? N(b.cost) + ' cada uno' : 'en juego'}</em></div>${act ? `<div class="bv-act">${act}</div>` : ''}</header>`;
    const rds = `<div class="bv-rds">${b.cases.map((cid, i) => { const st = !rep ? (b.status === 'done' ? 'ok' : '') : i + 1 < rNow || (i + 1 === rNow && landed) ? 'ok' : i + 1 === rNow ? 'now' : ''; return `<span class="${st}">${pic((D.cases.find((c) => c.id === cid) || {}).image, 128)}<i>${i + 1}</i></span>` }).join('')}</div>`;
    // la barra de reparto: un trozo por equipo, del tamano de lo que lleva
    const sumT = T.reduce((a, v) => a + v, 0);
    const tug = b.status === 'done' ? `<div class="bv-tug" aria-hidden="true">${T.map((v, t) => `<i style="flex:${sumT ? Math.max(v, sumT * 0.004) : 1};background:${eqColor(b, t)}"></i>`).join('')}</div>` : '';
    const col = (st) => {
      const x = b.seats.find((y) => y.seat === st), t = Math.floor(st / te);
      if (!x) return `<div class="bv-col vacio">${b.status === 'open' && !dentro && ctx.saldo >= b.cost ? `<button class="bv-join" data-cj="unir" data-v="${b.id}|${st}"><b>+</b><span>Unirme aquí</span><em>${N(b.cost)}${coin()}</em></button>` : '<span class="bv-free">Libre</span>'}</div>`;
      const j = jug(x.player), ds = dr(st), mejor = ds.reduce((a, d) => (!a || d.inv.value > a.inv.value ? d : a), null);
      const dNow = rep ? b.drops.find((d) => d.round === rNow && d.seat === st) : null;
      const p0 = landed ? 1 : Math.min(1, Math.max(0, ph ? ph.t / SPIN() : 1)), tf = ph ? tkFase(ph) : 'n', tkNow = rep && dNow && esTk(dNow.inv);
      const stage = rep ? (dNow && dNow.inv.bonus && dNow.inv.bonus.orig && ph.gd != null ? `<div class="bv-gdw">${gdHtml(dNow.inv.bonus, 'v')}</div>`
        : tkNow && (tf === 'n' || tf === 'h') ? reel(b, rNow, st, p0, g, landed, false, 'para')
        : tkNow && tf === 's' ? reel(b, rNow, st, Math.min(1, (ph.tk - tkHold()) / tkSpin()), g, false, false, 'vuelve')
        : reel(b, rNow, st, p0, g, landed, !ph.gdOk, tkNow ? 'fin' : null))
        : fin && mejor ? `<div class="bv-best" style="--c:${color(item(mejor.inv.item).rarity)}">${pic(item(mejor.inv.item).image, 360)}<span>${esc(partes(item(mejor.inv.item)).join(' | '))}</span><b>${N(mejor.inv.value)}${coin()}</b>${esTk(mejor.inv) ? `<i class="bv-gdt tk-${mejor.inv.bonus.tipo}">${TK[mejor.inv.bonus.tipo].n}</i>` : mejor.inv.bonus ? '<i class="bv-gdt">Giro Dorado</i>' : ''}</div>` : '';
      return `<div class="bv-col ${fin ? (t === b.winner ? 'win' : 'lose') : rep && lider === t ? 'va' : ''}" style="--pc:var(--f-${esc(j.color)})">
        <div class="bv-p">${av(x.player, 'xl')}<b>${esc(j.n)}</b><span class="bv-tot"><span class="num">${N(tot(st))}</span>${coin()}</span></div>
        ${stage}<div class="bv-haul">${ds.map((d) => bvIt(d, rep && d.round === rNow, antes(d))).join('')}</div></div>`;
    };
    const team = (t) => `<div class="bv-team n${te}">${sitiosDe(b, t).map(col).join('')}</div>`;
    const arena = `<div class="bv-arena m${tam} e${ne} t${te} ${libre(b) ? 'ffa' : ''} ${g.c}" style="--te:${te};--fc:${colsDe(b)}">${Array.from({ length: ne }, (_, t) => team(t)).join('<span class="bv-vs">VS</span>')}</div>`;
    return `${atras}<div class="bv ${cz ? 'crazy' : ''}" style="--c0:${eqColor(b, 0)};--c1:${eqColor(b, 1)};--rkh:${g.kh}px;--rwin:${g.win}px;--rgap:${g.gap}px">${head}${rds}${tug}${arena}</div>`;
  }

  /* ---------- la ruleta ---------- */
  function relleno(info) {
    if (conTickets(info)) return porTickets(info, Math.random());
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
    if (prueba) items = Array.from({ length: n }, () => {
      // con db/081 (la caja contesta cs_giro_info) la prueba imita los tickets; sin ella, el Giro Dorado viejo
      if (info.giro) { const tk = tkFalso(info); if (tk) return { id: 0, status: 'prueba', ...tk } }
      const x = relleno(info), i = { id: 0, item: x.id, value: valorDe(x), status: 'prueba' };
      const bo = !info.giro && Math.random() * 100 < GD_PCT ? gdFalso(info, i) : null;
      if (bo) { const f = bo.won ? bo.up : bo.down; Object.assign(i, { item: f.item, value: f.value, bonus: bo }) }
      return i;
    });
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
      try { const f = (x) => ({ r: x.rarity, i: src(x.image, 256), l: esLujo(x.id) ? 1 : 0 }); window.dispatchEvent(new CustomEvent('gm:caja-abierta', { detail: { quien: ctx.me, nombre: jug(ctx.me).n, caja: c.id, cajaNombre: c.name, items: r.items.map((i) => ({ ...f(item(i.item)), n: item(i.item).name, v: i.value, ...(esTk(i) ? { t: i.bonus.tipo, tp: montonTk(info, i.bonus).sort(() => Math.random() - 0.5).slice(0, 16).map(f) } : {}) })), pool: Array.from({ length: 24 }, () => f(relleno(info))) } })) } catch {}   // en directo (cajas-vivo.js)
      if (mia) D.cajasDe.set(ctx.me, mias().filter((o) => o.id !== mia));
      // la imagen grande del premio se va bajando mientras gira
      for (const i of r.items) for (const o of [i, ...(i.bonus && i.bonus.orig ? [i.bonus.up, i.bonus.down] : [])]) { const im = new Image(); im.decoding = 'async'; im.src = src(item(o.item).image, 256) }
    }
    const animar = !sinAnim();
    S.res = null; S.sure = null; S.prueba = !!prueba;
    S.tiras = items.map((inv) => nuevaTira(info, inv)); S.tirasK = ''; S.tirasC = c.id;
    // sin animaciones el Giro Dorado no se ensena: la tira queda directamente en lo que se queda
    if (!animar) items.forEach((inv, i) => { if (esTk(inv)) tkFinTira(S.tiras[i], inv); else if (inv.bonus) gdFinTira(null, S.tiras[i], inv) });
    S.fase = animar ? 'gira' : 'fin';
    anim = { anims: [], saltar: false };
    pinta(true);    // las tiras con su sitio, ya con el premio dentro
    if (animar) {
      const strips = [...root.querySelectorAll('.cj-spin .cj-strip')], sc = root.querySelector('.ca-tiras');
      if (sc && sc.getBoundingClientRect().top < 64) sc.scrollIntoView({ block: 'start', behavior: 'smooth' });
      const v = +S.vel;
      await Promise.all(strips.map((s, i) => gira(s, S.tiras[i], DUR[v] + i * PASO[v])));
      // Giro Dorado: en las tiras que lo llevan, en cuanto frenan (todas a la vez)
      const conGiro = items.map((inv, i) => (inv.bonus && inv.bonus.orig ? i : -1)).filter((i) => i >= 0);
      if (conGiro.length) { await espera(GD_HOLD[v]); await Promise.all(conGiro.map((i) => gdEnTira(strips[i], S.tiras[i], items[i]))) }
      // tickets (db/081): solo las lineas que han parado en un ticket vuelven a girar, todas a la vez; las demas se quedan como estan
      const conTk = items.map((inv, i) => (esTk(inv) ? i : -1)).filter((i) => i >= 0);
      if (conTk.length) await Promise.all(conTk.map((i) => tkEnTira(strips[i], S.tiras[i], items[i], info)));
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
      const ph = reloj(b, Date.now() - REP.t0);
      if (ph.fin) return termina();
      const tf = tkFase(ph), key = `${ph.r}|${ph.landed}|${ph.gd != null}|${ph.gdOk}|${tf}`;
      if (key !== REP.key || !root.querySelector('[data-tr],[data-gd],[data-rs]')) {
        // el ticket: al pararse en el suena; al acabar su vuelta, el premio de lo que ha salido
        // (como al abrir una caja: el Diamante suena a premio, el Dorado un clic)
        const tkPara = tf === 'h' && !REP.key.endsWith('|h');
        if (tkPara) suena(b.drops.some((d) => d.round === ph.r && esTk(d.inv) && d.inv.bonus.tipo === 'diamante') ? 'cobrar' : 'clic');
        if (tf === 'ok' && REP.key.endsWith('|s')) { const ds = (D.bats.get(REP.id) || { drops: [] }).drops.filter((d) => d.round === ph.r && esTk(d.inv)); const m = ds.reduce((a, d) => Math.max(a, ORDEN.length - 1 - ORDEN.indexOf(item(d.inv.item).rarity)), 0); suena({ tipo: 'caja-final', rareza: ORDEN[ORDEN.length - 1 - m], vol: 0.7 }) }
        // PM 04-11: "no suena cuando se abren las cajas en battles". Un solo sonido por ronda (no uno por ruleta): al frenar, el del mejor premio de
        // la ronda (con ticket suena el del ticket, mas arriba y al acabar su vuelta); y un solo tic compartido mientras gira (abajo)
        if (ph.landed && REP.land !== ph.r) {
          REP.land = ph.r;
          if (!conTk(b, ph.r)) {
            const rs = b.drops.filter((d) => d.round === ph.r).map((d) => ORDEN.indexOf(item(d.inv.bonus && d.inv.bonus.orig ? d.inv.bonus.orig.item : d.inv.item).rarity)).filter((i) => i >= 0);
            if (rs.length) suena({ tipo: 'caja-final', rareza: ORDEN[Math.min(...rs)], vol: 0.8 });
          }
        }
        if (ph.r !== REP.rt) { REP.rt = ph.r; REP.tk0 = null }
        REP.key = key; pinta(true);
        // PM 05-11 (tickets en batallas): si la ruleta del ticket no se ve (en el movil, con 4 o 6 jugadores queda abajo), se acerca sola
        if (tkPara) { const el = root.querySelector('.bv-reel.tk-on'), r = el && el.getBoundingClientRect(); if (r && (r.top < 56 || r.bottom > innerHeight - 72)) try { el.scrollIntoView({ block: 'center', behavior: quieto() ? 'auto' : 'smooth' }) } catch {} }
      }
      else if (!ph.landed) {
        const k = 1 - Math.pow(1 - Math.min(1, ph.t / SPIN()), 4);
        root.querySelectorAll('[data-tr]').forEach((tr) => { tr.style.transform = `translateY(${(-(+tr.dataset.fin) * k).toFixed(1)}px)` });
        // un tic cada vez que una carta pasa por la raya (de la primera ruleta, que las demas giran igual); en Rapido y Ultra, mas espaciados
        const t0 = root.querySelector('[data-tr]');
        if (t0 && t0.firstElementChild) {
          const paso = t0.firstElementChild.offsetHeight + (parseFloat(getComputedStyle(t0).rowGap) || 0), idx = paso ? Math.floor((+t0.dataset.fin * k) / paso) : 0, ahora = performance.now();
          if (REP.tk0 != null && idx !== REP.tk0 && ahora - (REP.tkT || 0) > (+S.vel ? 55 : 40)) { REP.tkT = ahora; suena({ tipo: 'caja-tic', vol: 0.7 }) }
          REP.tk0 = idx;
        }
      }
      else if (tf === 's') {
        // solo las ruletas con ticket vuelven a girar; con un tic cada vez que pasa una carta
        const k = 1 - Math.pow(1 - Math.min(1, (ph.tk - tkHold()) / tkSpin()), 4);
        root.querySelectorAll('[data-rs]').forEach((tr, i) => {
          const y0 = +tr.dataset.y0, y = y0 + (+tr.dataset.fin - y0) * k; tr.style.transform = `translateY(${(-y).toFixed(1)}px)`;
          if (i === 0) { const c = tr.firstElementChild, paso = c ? c.offsetHeight + (parseFloat(getComputedStyle(tr).rowGap) || 0) : 0, idx = paso ? Math.floor(y / paso) : 0; if (REP.tic !== idx) { if (REP.tic != null) suena({ tipo: 'caja-tic', vol: 0.8 }); REP.tic = idx } }
        });
      }
      // el Giro Dorado de los sitios que lo tienen en esta ronda; el sonido del final, una vez por ronda
      if (ph.gd != null) {
        root.querySelectorAll('[data-gd]').forEach((el) => gdPaso(el, ph.gd, gdDur(), false));
        if (ph.gd >= gdDur() && REP.son !== ph.r) { REP.son = ph.r; try { window.dispatchEvent(new CustomEvent('gm:sonido', { detail: 'cobrar' })) } catch {} }
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
  // el segundo toque de "Vender por": solo se repinta la barra. Dura mas si es TODO el inventario
  function seguroInv() {
    if (S.sure === 'inv') { S.sure = null; return true }
    S.sure = 'inv'; pintaBarra();
    const tok = ++sureT, todo = D.st.inv.length && S.sel.size >= D.st.inv.length;
    setTimeout(() => { if (S.sure === 'inv' && tok === sureT) { S.sure = null; pintaBarra() } }, todo ? 5000 : 3500);
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
    S.sel.clear(); S.ancla = null;      // tras vender se limpia toda la seleccion
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
    if (a === 'sel' && P.sup && Date.now() - P.sup < 450) { P.sup = 0; return }   // el clic que sigue a soltar un arrastre
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
      case 'quien': S.quien = v === ctx.me ? null : v; S.sel.clear(); S.ancla = null; S.sure = null; S.fR = null; S.fC = null; S.invN = INV_PASO; pinta(); return cargar(true);
      case 'sel': return tocaCarta(+v, e);
      case 'at': return atajo(t.dataset.t, v);
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
      case 'nosel': return atajo('ninguno');
      case 'vender': { const ids = D.st.inv.filter((i) => S.sel.has(i.id) && vendible(i)).map((i) => i.id); if (!ids.length || !seguroInv()) return; return vender(ids) }
      case 'orden': S.orden = v; guarda('cj-orden', v); return filtra();
      case 'fR': S.fR = v || null; return filtra();
      case 'fC': S.fC = v || null; return filtra();
      case 'sinfiltro': S.fR = null; S.fC = null; return filtra();
      case 'mas': S.invN += INV_PASO; return pinta();
      case 'esptodo': S.espTodo = v; return pinta();
      case 'fdmodo': if (v === FD.modo) return; FD.modo = v === 'best' ? 'best' : 'latest'; guarda('cj-fd-modo', FD.modo); FD.cola = []; clearTimeout(FD.t); FD.list = []; FD.sx = 0; return pinta();
      case 'pag': {
        S.pag = Math.max(0, +v || 0); pinta();
        const l = root.querySelector('[data-hechas]'), sc = root.closest('.scr');
        if (l && sc && l.getBoundingClientRect().top < sc.getBoundingClientRect().top) l.scrollIntoView({ block: 'start' });
        await cargaHechas(); return pinta();
      }
      case 'nueva': S.nueva = { mode: '1v1', regla: 'normal', cases: [], q: '', g: grupoAbierto(gruposVivos()), p: 0 }; pinta(); return arriba();
      case 'nueva-x': S.nueva = null; pinta(); return arriba();
      case 'modo': if (FORMATOS.some((f) => f[0] === v)) S.nueva.mode = v; return pinta();
      case 'regla': S.nueva.regla = v === 'crazy' ? 'crazy' : 'normal'; return pinta();
      case 'ngrp': S.nueva.g = v; S.nueva.q = ''; S.nueva.p = 0; { const q = root.querySelector('[data-nv-q]'); if (q) q.value = '' } return nvRepintaPick();
      case 'npag': S.nueva.p = Math.max(0, +v || 0); nvRepintaPick(); { const z = root.querySelector('[data-nvz]'), sc = root.closest('.scr'); if (z && sc && z.getBoundingClientRect().top < sc.getBoundingClientRect().top) z.scrollIntoView({ block: 'start' }) } return;
      case 'add': if (S.nueva.cases.length < 10) S.nueva.cases.push(v); return pinta();
      case 'quita': S.nueva.cases.splice(+v, 1); return pinta();
      case 'crear': {
        const nv = S.nueva; if (!nv || !nv.cases.length) return;
        // Normal se pide como siempre (dos argumentos): vale con y sin db/072; Crazy necesita 072
        const r = await hazlo(() => rpc('cs_battle_create', loca(nv) ? { p_mode: nv.mode, p_cases: nv.cases, p_regla: 'crazy' } : { p_mode: nv.mode, p_cases: nv.cases }));
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
  document.addEventListener('input', (e) => {
    const q = e.target && e.target.matches && e.target.matches('[data-nv-q]') ? e.target : null;
    if (!q || !S.nueva || !root || !root.contains(q)) return;
    S.nueva.q = q.value; S.nueva.p = 0; nvRepintaPick();
  });
  // al girar el movil o cambiar el ancho cambia cuantas cajas caben en una pagina
  try { for (const q of ['(max-width:860px)', '(max-width:1179px)']) window.matchMedia(q).addEventListener('change', () => { if (S.nueva && root && root.isConnected && S.tab === 'batallas' && !S.bat) nvRepintaPick() }) } catch {}

  window.GM_CAJAS = {
    html: () => '<div data-cajas></div>',
    // el: la vista de la app (o el hueco [data-cajas]); c: { db, me, jugadores, saldo, toast, refresh }; nueva: se acaba de entrar en la pantalla
    montar(el, c, nueva) {
      ctx = c;
      try { window.dispatchEvent(new CustomEvent('gm:cajas-montada', { detail: { db: c.db, me: c.me } })) } catch {}   // en directo (cajas-vivo.js)
      if (!root) { root = document.createElement('div'); root.className = 'cj'; ligaToque(root); pinta() }
      const hueco = el && (el.matches && el.matches('[data-cajas]') ? el : el.querySelector('[data-cajas]'));
      if (hueco) hueco.replaceWith(root); else if (el && !root.isConnected) el.appendChild(root);
      if (nueva) { S.sel.clear(); S.ancla = null; root.classList.remove('cj-in'); void root.offsetWidth; root.classList.add('cj-in') }
      else if (!anim && pendiente) pinta();
      cargar();
    },
    estado: () => ({ tab: S.tab, girando: !!anim }),
    // lo que usa Mejorar (mejora.js) para no repetirlo
    util: { ctx: () => ctx, item, asegura, pic, color, nombre, esLujo, av, recarga: () => cargar(true) },
  };
})();
