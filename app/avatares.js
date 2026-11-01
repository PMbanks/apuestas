// Tu foto y el aro de tu circulo, en Ajustes. PM, 01-11: "que cada uno se pueda cambiar el color de su contorno del circulo a lo
// que quiera en settings, y que pueda elegir fotos; habra fotos randoms asi graciosas".
// Cada jugador elige (1) el color del aro que rodea su circulo y (2) una foto de la galeria (app/img/avatares/aNN-nombre.webp).
// Se guarda en la base (db/057: players.ring, players.avatar, set_ring, set_avatar) y lo ven todos, en todas partes:
//   - El aro: una regla CSS por jugador (.av.c3 { outline }) y la variable --rg-c3 (el perfil grande la usa). Va en una hoja
//     de estilos propia (#av-css), asi se repinta al instante en toda la app sin volver a construir nada.
//   - La foto: la misma hoja pone background-image al .av del jugador (gana a la foto subida) y F[i].photo lleva la de la galeria,
//     que es lo que leen la ruleta global y las cajas. foto(uid, base) es la unica funcion que decide la imagen.
// El ajuste de la foto subida (db/059: players.foto_ajuste 'x,y,z', set_foto_ajuste): x e y = desplazamiento en % del ancho del
// circulo (-50..50), z = zoom en % (40..300, 100 = como siempre). Sale en la misma hoja de estilos (background-size/position del
// .av del jugador), asi lo ven todos y en todos los tamanos (sm, lg, xl, huge, perfil, Liga, chat). Se edita en Ajustes > Tu foto.
// Si la base aun no tiene las columnas (057 sin cargar) todo sigue como antes y lo que elijas se queda solo en este aparato
// (localStorage 'gm-avatares'), como hace moneda.js. El resto de jugadores se leen de la base (players) cada pocos segundos.
'use strict';
(function () {
  const BASE = (document.querySelector('link[rel="icon"]')?.getAttribute('href') || 'img/icon-192.png').replace(/icon-192\.png$/, '') + 'avatares/';
  // clave, nombre (el ingles esta en i18n.js), 1 si esta animada
  const G = [
    ['a01-stonks', 'Stonks'],
    ['a06-todo-bien', 'Esto es fine'],
    ['a09-bebe-exito', 'Bebé del éxito'],
    ['a10-trollface', 'Trollface'],
    ['a11-chungus', 'Big Chungus'],
    ['a14-nyan', 'Nyan Cat'],
    ['a15-desastre', 'Todo arde y sonríe'],
    ['a16-rana-casino', 'Rana apostando', 1],
    ['a17-rana-dinero', 'Rana con billetes', 1],
    ['a18-rana-sudor', 'Rana sudando', 1],
    ['a19-rana-copium', 'Copium', 1],
    ['a20-rana-llora', 'Rana llorando'],
    ['a21-sadge', 'Sadge'],
    ['a22-rana-risa', 'Rana riéndose de ti'],
    ['a23-rana-payaso', 'Rana payaso'],
    ['a24-rana-miedo', 'Rana con miedo'],
    ['a25-rana-reza', 'Rana rezando'],
    ['a26-gato-baila', 'Gato bailando', 1],
    ['a27-no-puedo', 'No puedo más', 1],
    ['a28-abuelos-casino', 'Abuelos en el casino', 1],
    ['a29-doge-corre', 'Doge se va', 1],
    ['a30-gato-triste', 'Gato triste', 1],
    ['a31-gato-peludo', 'Gato señorial', 1],
    ['a32-capibara', 'Capibara', 1],
    ['a33-pato-tigre', 'Pato tigre', 1],
    ['a34-pato-rico', 'Pato rico', 1],
    ['a35-mono-bailon', 'Mono en la nieve', 1],
    ['a36-doomer', 'Wojak desesperado'],
    ['a37-esqueleto-stonks', 'Esqueleto stonks'],
    ['a38-not-stonks', 'Not stonks'],
    ['a39-rana-pasa', 'Rana en la manta', 1],
    ['a40-rana-meltdown', 'Rana con un ataque', 1],
  ];
  const GK = new Map(G.map((g) => [g[0], g]));
  // colores del aro: valor, nombre (el ingles esta en i18n.js)
  const PAL = [['#ff5d5d', 'Rojo'], ['#ff8a3d', 'Naranja'], ['#f2c14e', 'Oro'], ['#b7e34a', 'Lima'], ['#2bd47d', 'Verde'], ['#2fd6c8', 'Turquesa'],
    ['#4fd6e8', 'Cian'], ['#4d88e6', 'Azul'], ['#7e57c2', 'Violeta'], ['#ff7ab8', 'Rosa'], ['#ff3ea5', 'Fucsia'], ['#f4f2ec', 'Blanco']];
  const RE_C = /^#[0-9a-f]{6}$/, RE_K = /^a[0-9]{2}-[a-z0-9-]{1,30}$/;
  const RE_J = /^-?[0-9]{1,3}(\.[0-9]{1,2})?,-?[0-9]{1,3}(\.[0-9]{1,2})?,[0-9]{1,3}(\.[0-9]{1,2})?$/;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const r1 = (v) => Math.round(v * 10) / 10;
  // 'x,y,z' -> { x, y, z } (o null si no vale o es el de siempre); y al reves
  function leeJ(t) {
    if (typeof t !== 'string' || !RE_J.test(t)) return null;
    const [x, y, z] = t.split(',').map(Number);
    if (x < -50 || x > 50 || y < -50 || y > 50 || z < 40 || z > 300) return null;
    return { x, y, z };
  }
  const textoJ = (j) => { const x = r1(clamp(j.x, -50, 50)), y = r1(clamp(j.y, -50, 50)), z = Math.round(clamp(j.z, 40, 300)); return x === 0 && y === 0 && z === 100 ? null : `${x},${y},${z}`; };
  const normJ = (t) => { const j = leeJ(t); return j ? textoJ(j) : null; };
  // el CSS de un ajuste: la imagen mide z% del circulo y se desplaza x% / y% del ancho del circulo. background-position en % mide
  // (circulo - imagen), asi que x pide 50 + 100x/(100 - z); a z = 100 justo no hay hueco, se usa 100.01 (no se nota)
  function cssJ(j) {
    const z = Math.abs(j.z - 100) < 0.01 ? 100.01 : j.z, f = (v) => Math.round(v * 1000) / 1000;
    return `background-size:${f(z)}% auto;background-position:${f(50 + (100 * j.x) / (100 - z))}% ${f(50 + (100 * j.y) / (100 - z))}%;background-repeat:no-repeat`;
  }
  // el fondo del circulo cuando la foto no lo llena (zoom por debajo de 100): el color del aro, apagado
  const fondoJ = (aro) => `background-color:#1b1812;background-color:color-mix(in srgb,${aro || '#8a8472'} 30%,#14120d)`;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // uid -> { c: clase de color del jugador (pm, c1...), a: clave de la galeria o null, r: '#rrggbb' o null }
  let st = {};
  try { const v = JSON.parse(localStorage.getItem('gm-avatares') || '{}'); if (v && typeof v === 'object') st = v; } catch (e) {}
  let sinColumna = false, sinAjuste = false, mirando = false, ult = 0, pend = 0, arrastra = null;
  const guardaLocal = () => { try { localStorage.setItem('gm-avatares', JSON.stringify(st)); } catch (e) {} };
  const yo = () => (typeof ME !== 'undefined' ? ME : null);
  const claseYo = () => { try { const f = F.find((x) => x.uid === ME); return f ? f.id : null; } catch (e) { return null; } };
  const limpio = (s) => ({ c: s && /^(pm|c\d+)$/.test(s.c || '') ? s.c : null, a: s && RE_K.test(s.a || '') && GK.has(s.a) ? s.a : null, r: s && RE_C.test(s.r || '') ? s.r : null, j: s ? normJ(s.j) : null });

  // La imagen de un jugador: la de la galeria si la ha elegido, si no la de siempre (base: la que subio, o null)
  function foto(uid, base) { const s = st[uid]; return s && s.a && GK.has(s.a) ? BASE + s.a + '.webp' : base; }

  // ---------- la hoja de estilos de todos ----------
  const EST = `.av.huge,.av.av-pv{outline:0 !important}.av.sm{--rgw:1.5px}
.av-s .av-top{display:grid;grid-template-columns:auto 1fr;gap:18px 30px;align-items:center;margin:2px 0 30px}
.av-s .av.av-pv{width:124px;height:124px;font-size:38px;box-shadow:0 0 0 5px var(--bg),0 0 0 8px var(--ring,var(--hair2));margin:8px 8px 0}
.av-s .av-who{display:grid;gap:12px;justify-items:center;text-align:center}
.av-s .av-nm{font:600 13px var(--sans);color:var(--mute);min-height:1.3em}
.av-s .av-ctl{display:grid;gap:14px;align-content:center}
.av-s .av-pal{display:flex;flex-wrap:wrap;gap:12px 10px}
.av-s .av-sw,.av-s .av-cu{position:relative;flex:none;width:28px;height:28px;border-radius:50%;background:var(--sw);transition:transform .15s var(--ease)}
.av-s .av-sw:hover,.av-s .av-cu:hover{transform:scale(1.14)}
.av-s .av-sw.on,.av-s .av-cu.on{box-shadow:0 0 0 3px var(--bg),0 0 0 5px var(--ink)}
.av-s .av-cu{display:block;cursor:pointer;background:conic-gradient(#ff5d5d,#ffee58,#4cd964,#4fc3f7,#7e57c2,#ff7ab8,#ff5d5d)}
.av-s .av-cu.on{background:var(--sw)}
.av-s .av-cu input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;border:0;padding:0}
.av-s .av-acts{display:flex;flex-wrap:wrap;gap:4px 26px}
.av-s .av-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(66px,1fr));gap:18px 14px;margin:6px 0 20px}
.av-s .av-g{position:relative;display:block;width:100%;aspect-ratio:1;border-radius:50%;background:var(--bg2);transition:transform .15s var(--ease)}
.av-s .av-g img{width:100%;height:100%;border-radius:50%;object-fit:cover;background:var(--bg2)}
.av-s .av-g:hover{transform:scale(1.08)}
.av-s .av-g.on{box-shadow:0 0 0 3px var(--bg),0 0 0 5px var(--acc)}
.av-s .lab.av-l{margin:0 0 12px}
.av-s .av-aj{display:grid;grid-template-columns:auto 1fr;gap:18px 30px;align-items:center;margin:2px 0 30px}
.av-s .av-ed{position:relative;width:200px;height:200px;margin:8px;border-radius:50%;background-repeat:no-repeat;touch-action:none;cursor:grab;user-select:none;-webkit-user-select:none;outline:0;box-shadow:0 0 0 5px var(--bg),0 0 0 8px var(--ring,var(--hair2))}
.av-s .av-ed.on{cursor:grabbing}
.av-s .av-ed:focus-visible{box-shadow:0 0 0 5px var(--bg),0 0 0 8px var(--acc)}
.av-s .av-ed::after{content:'';position:absolute;inset:0;border-radius:50%;pointer-events:none;opacity:0;transition:opacity .15s var(--ease);background:linear-gradient(rgba(255,255,255,.7),rgba(255,255,255,.7)) center/1px 100% no-repeat,linear-gradient(rgba(255,255,255,.7),rgba(255,255,255,.7)) center/100% 1px no-repeat}
.av-s .av-ed.on::after{opacity:.55}
.av-s .av-ajc{display:grid;gap:14px;align-content:center;min-width:0}
.av-s .av-ajc .aj-n{margin:0}
.av-s .av-zm{display:grid;gap:0}
.av-s .av-zl{display:flex;justify-content:space-between;font:600 13px var(--sans);color:var(--mute)}
.av-s .av-zl b{font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums}
@media (max-width:560px){.av-s .av-aj{grid-template-columns:1fr;gap:12px;justify-items:center}.av-s .av-ed{width:180px;height:180px}.av-s .av-ajc{width:100%;justify-items:stretch}.av-s .av-ajc .aj-n{text-align:center}.av-s .av-ajc .av-acts{justify-content:center}.av-s .av-top{grid-template-columns:1fr;gap:18px;justify-items:center;margin-bottom:26px}.av-s .av.av-pv{width:108px;height:108px;font-size:34px}.av-s .av-sw,.av-s .av-cu{width:34px;height:34px}.av-s .av-pal{gap:14px 12px}.av-s .av-ctl{justify-items:center;text-align:center}.av-s .av-pal{justify-content:center}.av-s .av-acts{justify-content:center}.av-s .av-grid{grid-template-columns:repeat(5,1fr);gap:16px 10px}}`;
  function estiloBase() {
    if (document.getElementById('av-base')) return;
    const s = document.createElement('style'); s.id = 'av-base'; s.textContent = EST; document.head.appendChild(s);
  }
  function pintaCss() {
    let h = document.getElementById('av-css');
    if (!h) { h = document.createElement('style'); h.id = 'av-css'; document.head.appendChild(h); }
    let vars = '', t = '';
    for (const s0 of Object.values(st)) {
      const s = limpio(s0); if (!s.c) continue;
      if (s.a) t += `.av.${s.c}.av:not(.zz){background-image:url("${BASE}${s.a}.webp");background-size:cover;background-position:center;background-repeat:no-repeat;color:transparent}`;
      if (s.j && !s.a) t += `.av.${s.c}.ph:not(.zz){${fondoJ(s.r)};${cssJ(leeJ(s.j))}}`;
      if (s.r) { vars += `--rg-${s.c}:${s.r};`; t += `.av.${s.c}{outline:var(--rgw,2px) solid ${s.r};outline-offset:0}`; }
    }
    const x = (vars ? `:root{${vars}}` : '') + t;
    if (h.textContent !== x) h.textContent = x;
  }
  // F lleva la foto de la galeria (la leen la ruleta global y las cajas); photo0 es la de siempre
  function ponF() {
    try { for (const f of F) { if (f.photo0 === undefined) f.photo0 = f.photo; f.photo = foto(f.uid, f.photo0); } } catch (e) {}
  }
  function repinta() {
    pintaCss(); ponF();
    try { if (typeof photoCss === 'function') photoCss(); } catch (e) {}
    if (arrastra) return;                                  // moviendo la foto: no se reconstruye la pantalla bajo el dedo
    if (typeof render === 'function') try { render(); } catch (e) {}
  }

  // ---------- Ajustes: la seccion "Tu foto" ----------
  // El editor del ajuste: solo con una foto SUBIDA (la de la galeria ya viene encuadrada). La vista previa se pinta con el mismo
  // CSS que ven los demas (cssJ), asi lo que ves es lo que sale.
  const jActual = (me) => { const j = leeJ(limpio(st[me]).j); return j || { x: 0, y: 0, z: 100 }; };
  const estiloEd = (foto, aro, j) => `background-image:url("${encodeURI(foto)}");${fondoJ(aro)};${cssJ(j)}`;
  function editor(f, s, k) {
    if (!f.photo0 || s.a) return '';
    const j = jActual(yo());
    return `<h4 class="lab av-l">Ajustar mi foto</h4>
      <div class="av-aj">
        <div class="av-ed" data-aj-ed tabindex="0" role="img" aria-label="Vista previa de tu foto, arrástrala para moverla" style="--ring:var(--rg-${k},var(--hair2));${esc(estiloEd(f.photo0, s.r, j))}"></div>
        <div class="av-ajc">
          <p class="aj-n">Arrastra la foto con el dedo o el ratón para moverla y usa el zoom para encuadrarla.</p>
          <label class="av-zm"><span class="av-zl"><span>Zoom</span><b data-aj-zv>${Math.round(j.z)} %</b></span><input type="range" min="40" max="300" step="1" value="${Math.round(j.z)}" data-aj-z style="--p:${((j.z - 40) / 260) * 100}%" aria-label="Zoom de la foto"></label>
          <div class="av-acts"><button type="button" class="aj-a q" data-av="aj-centrar">Centrar</button><button type="button" class="aj-a q" data-av="aj-reset">Restablecer</button></div>
        </div>
      </div>`;
  }
  function seccion() {
    estiloBase();
    const me = yo(), k = claseYo(), s = limpio(st[me] || { c: k });
    if (!me || !k) return '';
    const f = (typeof F !== 'undefined' && F.find((x) => x.uid === me)) || {};
    const enPal = PAL.some((p) => p[0] === s.r), g = s.a ? GK.get(s.a) : null;
    const pal = PAL.map(([v, nom]) => `<button type="button" class="av-sw ${s.r === v ? 'on' : ''}" style="--sw:${v}" data-av="ring:${v}" title="${esc(nom)}" aria-label="${esc(nom)}" aria-pressed="${s.r === v}"></button>`).join('');
    const cu = `<label class="av-cu ${s.r && !enPal ? 'on' : ''}" style="--sw:${s.r || '#ffffff'}" title="Otro color"><input type="color" data-avc value="${s.r || '#ffffff'}" aria-label="Otro color"></label>`;
    const grid = G.map(([key, nom]) => `<button type="button" class="av-g ${s.a === key ? 'on' : ''}" data-av="foto:${key}" title="${esc(nom)}" aria-label="${esc(nom)}" aria-pressed="${s.a === key}"><img src="${BASE}${key}.webp" width="66" height="66" loading="lazy" decoding="async" alt=""></button>`).join('');
    return `<section class="aj-s av-s"><h3 class="lab">Tu foto</h3>
      <p class="aj-n">Elige el color del aro de tu círculo y una foto. Todos te ven así.</p>
      <div class="av-top">
        <div class="av-who"><span class="av ${k} huge av-pv ${f.photo ? 'ph' : ''}" style="--ring:var(--rg-${k},var(--hair2))">${esc(f.ini || '·')}</span><span class="av-nm" data-nomon>${g ? esc(g[1]) : ''}</span></div>
        <div class="av-ctl"><h4 class="lab av-l">Color del aro</h4><div class="av-pal">${pal}${cu}</div>
          <div class="av-acts"><button type="button" class="aj-a q" data-av="ring-reset">Color por defecto</button></div></div>
      </div>
      ${editor(f, s, k)}
      <h4 class="lab av-l">Foto</h4>
      <div class="av-grid" data-nomon>${grid}</div>
      <div class="av-acts"><button type="button" class="aj-a q" data-av="foto-reset">Quitar mi foto elegida</button></div>
    </section>`;
  }
  function refrescaSec() {
    const e = document.querySelector('.av-s'); if (!e) return;
    const t = document.createElement('div'); t.innerHTML = seccion(); const n = t.firstElementChild; if (!n) return;
    e.replaceWith(n); if (window.GM_LANG) GM_LANG.traduce(n);
  }

  // ---------- elegir y guardar ----------
  const DB = () => (typeof db !== 'undefined' && db && db.auth ? db : null);
  const avisa = (m) => { try { if (typeof toast === 'function') toast(m); } catch (e) {} };
  const tim = {};
  function sube(que, v) {
    const b = DB(); if (!b || (que === 'ajuste' ? sinAjuste : sinColumna)) return;
    pend++;
    const fn = que === 'ring' ? 'set_ring' : que === 'ajuste' ? 'set_foto_ajuste' : 'set_avatar', arg = que === 'ring' ? { p_ring: v } : que === 'ajuste' ? { p_ajuste: v } : { p_avatar: v };
    Promise.resolve(b.rpc(fn, arg)).then(({ error }) => {
      if (!error) return;
      if (/set_ring|set_avatar|set_foto_ajuste|function|schema cache/i.test(error.message || '')) { if (que === 'ajuste') sinAjuste = true; else sinColumna = true; }
      else avisa('No se ha podido guardar. Prueba otra vez');
    }, () => {}).finally(() => { pend = Math.max(0, pend - 1); });
  }
  function cambia(que, v, ya) {
    const me = yo(), k = claseYo(); if (!me || !k) return;
    const s = limpio(st[me] || { c: k }); s.c = k;
    if (que === 'ring') s.r = v && RE_C.test(v) ? v : null; else s.a = v && GK.has(v) ? v : null;
    st[me] = s; guardaLocal();
    if (que === 'ring') {
      pintaCss();
      if (!ya) { tim.ring = 1; return; }                  // arrastrando el selector libre: solo se ve, aun no se guarda
      tim.ring = 0; sube('ring', s.r); refrescaSec();
    } else { sube('avatar', s.a); repinta(); }
  }

  // el ajuste de la foto: se ve al instante (hoja de estilos + vista previa) y se guarda 0,5 s despues del ultimo cambio
  function pintaEd() {
    const e = document.querySelector('[data-aj-ed]'); if (!e) return;
    const me = yo(), j = jActual(me), f = (typeof F !== 'undefined' && F.find((x) => x.uid === me)) || {}, s = limpio(st[me]);
    if (f.photo0) e.style.cssText = `--ring:var(--rg-${claseYo()},var(--hair2));${estiloEd(f.photo0, s.r, j)}`;
    const z = document.querySelector('input[data-aj-z]'); if (z) { z.value = Math.round(j.z); z.style.setProperty('--p', ((j.z - 40) / 260) * 100 + '%'); }
    const v = document.querySelector('[data-aj-zv]'); if (v) v.textContent = Math.round(j.z) + ' %';
  }
  function cambiaAj(j) {
    const me = yo(), k = claseYo(); if (!me || !k) return;
    const s = limpio(st[me] || { c: k }); s.c = k; s.j = j ? textoJ(j) : null;
    st[me] = s; guardaLocal(); pintaCss(); pintaEd();
    clearTimeout(tim.aj); tim.aj = setTimeout(() => { tim.aj = 0; sube('ajuste', limpio(st[me]).j); }, 500);
  }
  const suelta = () => { arrastra = null; const e = document.querySelector('[data-aj-ed]'); if (e) e.classList.remove('on'); };

  // ---------- los de los demas, de la base ----------
  async function mira(fuerza) {
    const b = DB(); if (!b || mirando || (!fuerza && Date.now() - ult < 12000)) return;
    mirando = true;
    try {
      const { data: { session } } = await b.auth.getSession();
      if (!session) return;
      // select('*') y no select('ring,avatar'): sin las columnas no da error 400, solo no vienen
      const { data, error } = await b.from('players').select('*');
      if (error || !data || !data.length) return;
      ult = Date.now();
      if (!('avatar' in data[0]) || !('ring' in data[0])) { sinColumna = true; return; }
      sinColumna = false; sinAjuste = !('foto_ajuste' in data[0]);
      // sin la columna del ajuste (059 sin cargar) se queda el de este aparato
      const n = {}; for (const p of data) n[p.id] = { c: p.color, a: p.avatar || null, r: p.ring || null, j: sinAjuste ? normJ((st[p.id] || {}).j) : normJ(p.foto_ajuste) };
      const me = yo();
      // lo mio: si hay un cambio en camino, manda lo de aqui; si la base no tiene nada y este aparato si (se eligio antes de cargar 057), sube
      if (me && st[me] && (pend > 0 || tim.ring || tim.aj)) n[me] = limpio(st[me]);
      else if (me && st[me] && n[me] && !n[me].a && !n[me].r && (limpio(st[me]).a || limpio(st[me]).r)) { const l = limpio(st[me]); if (l.a) sube('avatar', l.a); if (l.r) sube('ring', l.r); n[me] = { c: n[me].c, a: l.a, r: l.r, j: n[me].j }; }
      if (JSON.stringify(n) !== JSON.stringify(st)) { st = n; guardaLocal(); repinta(); }
    } catch (e) {} finally { mirando = false; }
  }
  if (DB()) {
    DB().auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_IN' || ev === 'INITIAL_SESSION') setTimeout(() => mira(true), 0); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') mira(); });
  }

  // ---------- clics ----------
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-av]'); if (!b) return;
    const [a, v] = b.dataset.av.split(/:(.*)/s);
    if (a === 'ring') cambia('ring', v, true);
    else if (a === 'ring-reset') cambia('ring', null, true);
    else if (a === 'foto') cambia('avatar', v, true);
    else if (a === 'foto-reset') cambia('avatar', null, true);
    else if (a === 'aj-centrar') { const j = jActual(yo()); cambiaAj({ x: 0, y: 0, z: j.z }); }
    else if (a === 'aj-reset') cambiaAj(null);
  });
  // mover la foto con el dedo o el raton; las flechas del teclado la mueven 1 % (con Mayus 5 %)
  document.addEventListener('pointerdown', (e) => {
    const ed = e.target.closest && e.target.closest('[data-aj-ed]'); if (!ed || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const j = jActual(yo());
    arrastra = { id: e.pointerId, x0: e.clientX, y0: e.clientY, jx: j.x, jy: j.y, jz: j.z, w: ed.getBoundingClientRect().width || 200 };
    try { ed.setPointerCapture(e.pointerId); } catch (x) {}
    ed.classList.add('on'); e.preventDefault();
  });
  document.addEventListener('pointermove', (e) => {
    if (!arrastra || e.pointerId !== arrastra.id) return;
    cambiaAj({ x: clamp(arrastra.jx + ((e.clientX - arrastra.x0) / arrastra.w) * 100, -50, 50), y: clamp(arrastra.jy + ((e.clientY - arrastra.y0) / arrastra.w) * 100, -50, 50), z: arrastra.jz });
  });
  document.addEventListener('pointerup', (e) => { if (arrastra && e.pointerId === arrastra.id) suelta(); });
  document.addEventListener('pointercancel', (e) => { if (arrastra && e.pointerId === arrastra.id) suelta(); });
  document.addEventListener('keydown', (e) => {
    const ed = e.target.closest && e.target.closest('[data-aj-ed]'); if (!ed) return;
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!d) return;
    e.preventDefault(); const j = jActual(yo()), p = e.shiftKey ? 5 : 1;
    cambiaAj({ x: clamp(j.x + d[0] * p, -50, 50), y: clamp(j.y + d[1] * p, -50, 50), z: j.z });
  });
  document.addEventListener('input', (e) => { const i = e.target; if (i && i.matches && i.matches('input[data-aj-z]')) { const j = jActual(yo()); cambiaAj({ x: j.x, y: j.y, z: Number(i.value) }); return; } if (i && i.matches && i.matches('input[data-avc]')) { cambia('ring', i.value, false); const l = i.closest('.av-cu'); if (l) { l.style.setProperty('--sw', i.value); l.classList.add('on'); document.querySelectorAll('.av-s .av-sw.on').forEach((x) => x.classList.remove('on')); } } });
  document.addEventListener('change', (e) => { const i = e.target; if (i && i.matches && i.matches('input[data-avc]')) cambia('ring', i.value, true); });

  // una foto nueva (o quitar la foto) pide un ajuste nuevo: el de la anterior no encaja
  function quitaAjuste() { if (limpio(st[yo()]).j) cambiaAj(null); }

  estiloBase(); pintaCss();
  window.GM_AVATARES = {
    foto, seccion, galeria: () => G.map((g) => g[0]), mira: () => mira(true),
    // la app lo llama en cada render: repone la hoja de estilos y mira la base como mucho cada 12 s
    aplica() { pintaCss(); mira(); },
    // subir una foto propia (Perfil) pasa por encima de la elegida: se quita la de la galeria
    quita() { const s = limpio(st[yo()]); if (s.a) cambia('avatar', null, true); quitaAjuste(); },
    quitaAjuste, cssAjuste: (t) => { const j = leeJ(t); return j ? cssJ(j) : ''; },
    estado: () => ({ st, sinColumna }),
  };
})();
