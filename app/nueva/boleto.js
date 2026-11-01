// Boleto multiple de Gambling Addicts (PM, 30-10: "haz mas facil apostar en varias a la vez").
//  - Tocar una cuota en la lista de Partidos o en la ficha la mete en el boleto (marcada en dorado) en vez de abrir la ficha.
//    Tocarla otra vez la quita. Una sola eleccion por partido: tocar otra del mismo partido la cambia.
//  - El boleto flota: en escritorio, abajo a la derecha, se despliega; en movil, barra encima de la barra de abajo que abre
//    una hoja. Vacio no se ve. Cada eleccion lleva su importe; arriba, "mismo importe para todas" con atajos.
//  - "Apostar" pide confirmacion (dos toques) y llama a place_bet una por una, en serie (db/001 y db/022: cierre al empezar,
//    saldo, cuota mejorada con tope por jugador). Dice cuales han entrado y cuales no y por que, y quita las que entraron.
//  - Se guarda en localStorage (gm-boleto) y caduca lo que ya ha empezado.
// Va aparte, como extras.js: se engancha al DOM con un MutationObserver y usa lo global de app.js (db, S, M, byId, po, pn,
// me, render, refresh, toast, vuela). No usa rutas de imagenes: la moneda es la clase .cn de app.css.
'use strict';
(function () {
  const CLAVE = 'gm-boleto';
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const N = (x) => String(Math.round(x || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, document.documentElement.lang === 'en' ? ',' : '.');
  const O = (x) => Number(x).toFixed(2).replace('.', document.documentElement.lang === 'en' ? '.' : ',');
  const coin = () => '<span class="cn"></span>';
  const traduce = (el) => { if (window.GM_LANG && el) { try { GM_LANG.traduce(el) } catch {} } };
  const sinAnim = () => document.documentElement.classList.contains('sin-anim');
  const escritorio = () => { try { return matchMedia('(min-width: 861px)').matches } catch { return true } };
  const BOLT = '<svg class="blt-bolt" viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 2 5 13.5h6L10 22l9-12h-6z"/></svg>';
  const CHEV = '<svg class="blt-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>';
  const EQUIS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>';

  /* ---------- lo de app.js, con red por si algo no esta ---------- */
  const listo = () => { try { return !!loaded && typeof byId === 'function' } catch { return false } };
  const partido = (id) => { try { return byId(id) || null } catch { return null } };
  const saldo = () => { try { return Math.max(0, me().s || 0) } catch { return 0 } };
  const yo = () => { try { return MEK || '' } catch { return '' } };
  const pantalla = () => { try { return S.scr } catch { return '' } };
  const cuotaBase = (m, p) => { try { return po(m, p) } catch { return null } };
  const nombre = (it, m) => (it.p === '1' ? (m ? m.a : it.a) : it.p === '2' ? (m ? m.b : it.b) : it.p === 'X' ? 'Empate' : (() => { try { return pn(m || { a: it.a, b: it.b }, it.p) } catch { return it.p } })());
  // mercados nuevos (db/036, mercados.js): una eleccion por mercado y partido (tocar otra del mismo mercado la cambia, como
  // 1, X o 2); en una combinada, un solo pronostico por partido
  const PICK_OK = /^(1|X|2|[OU][0-9]\.5|GG|NG|S[0-4]-[0-4]|H[12]\+[0-9]\.5|M[OU][0-9]\.5|W[1-5]-[12])$/;   // W: mapas sueltos (db/037)
  const grupo = (p) => { try { return window.GM_MK ? GM_MK.grupo(p) : '1X2' } catch { return '1X2' } };
  const clave = (it) => it.m + '|' + grupo(it.p);
  const lado = (p) => { try { return p === 'X' ? 'x' : window.GM_MK && GM_MK.es(p) ? (GM_MK.lado(p) ? 'p' + GM_MK.lado(p) : 'mq') : 'p' + p } catch { return 'mq' } };
  const cuando = (t) => { try { return `${WD(t)} ${HM(t)}` } catch { return '' } };
  const avisa = (html) => { try { toast(html) } catch {} };

  /* ---------- estado ---------- */
  // items: { m: partido, p: '1'|'X'|'2', st: importe, at, a, b, la, lb, s, o0: cuota al meterla, err }
  const B = { items: [], comun: 50, abierto: false, sure: 0, vaciar: 0, busy: false, prog: '', res: null, fuera: [], k: '', modo: 'sueltas', cst: 50, cerr: '' };
  // combinada (db/029, PM 30-10 noche): una sola apuesta con todos los partidos del boleto, cuotas multiplicadas, solo cobra si aciertas todos
  const COMB_MAX = 8;
  const comb = () => B.modo === 'comb' && B.items.length >= 2;
  const cuotaComb = () => Math.min(1000, Math.round(B.items.reduce((t, it) => { const c = cuota(it); return t * (c.base ?? c.o ?? 1) }, 1) * 100) / 100);
  function carga() {
    try {
      const d = JSON.parse(localStorage.getItem(CLAVE) || 'null'); if (!d) return;
      const ahora = Date.now();
      B.k = d.k || ''; B.comun = Math.max(1, +d.comun || 50); B.modo = d.modo === 'comb' ? 'comb' : 'sueltas'; B.cst = Math.max(1, +d.cst || 50);
      B.items = (Array.isArray(d.items) ? d.items : []).filter((x) => x && x.m && (PICK_OK.test(x.p) || !!(window.GM_MK && GM_MK.valido(x.p))) && Date.parse(x.at) > ahora)   // NBA: nba.js
        .map((x) => ({ m: x.m, p: x.p, st: Math.max(0, Math.floor(+x.st || 0)), at: x.at, a: x.a, b: x.b, la: x.la, lb: x.lb, s: x.s, o0: x.o0 ?? null, err: '' }));
    } catch {}
  }
  function guarda() {
    try { localStorage.setItem(CLAVE, JSON.stringify({ k: B.k || yo(), comun: B.comun, modo: B.modo, cst: B.cst, items: B.items.map(({ err, ...x }) => x) })) } catch {}
  }
  carga();

  /* ---------- cuota mejorada (db/022: ex_estado), igual que extras.js ---------- */
  const XB = { t: 0, list: [], tope: 1000, vivo: false, off: 0 };
  async function cargaBoost() {
    if (XB.vivo || Date.now() < XB.off || Date.now() - XB.t < 90e3) return;
    XB.vivo = true;
    try { const { data, error } = await db.rpc('ex_estado'); if (error) throw error; XB.list = data?.boosts || []; XB.tope = data?.tope || 1000; XB.t = Date.now() }
    catch (e) { XB.off = Date.now() + (/Could not find the function|PGRST202|schema cache/i.test(String(e?.message || '') + e?.code) ? 30 : 3) * 60e3; XB.t = Date.now() }
    XB.vivo = false; pinta(true);
  }
  const boostDe = (mid, p) => ((p === '1' || p === 'X' || p === '2') && XB.list.find((b) => b.match === mid && (!b.pick || b.pick === p) && Date.parse(b.at) > Date.now())) || null;   // solo 1 X 2 (db/036)
  // la cuota que se pagaria: con la mejora, redondeada como la base: round(o * (100 + pct) / 100, 2)
  function cuota(it) {
    // mercados nuevos: hasta que mercados.js lee sus cuotas (al abrir la app), la de cuando se metio; la base manda al apostar
    const m = partido(it.m), o = m ? (cuotaBase(m, it.p) ?? (grupo(it.p) !== '1X2' && !(window.GM_MK && GM_MK.cuotas(it.m)) ? it.o0 : null)) : it.o0;
    if (o == null) return { o: null };
    const bo = boostDe(it.m, it.p);
    if (!bo) return { o, base: o };
    const c = Math.round(o * 100);
    return { o: Math.floor((c * (100 + bo.pct) + 50) / 100) / 100, base: o, pct: bo.pct, resta: Math.max(0, XB.tope - (bo.usado || 0)) };
  }

  /* ---------- meter y quitar ---------- */
  function toca(mid, p) {
    const m = partido(mid); if (!m || B.busy) return;
    const i = B.items.findIndex((x) => x.m === mid && grupo(x.p) === grupo(p)), antes = B.items.length;
    if (i >= 0 && B.items[i].p === p) B.items.splice(i, 1);
    else if (i >= 0) Object.assign(B.items[i], { p, o0: cuotaBase(m, p), err: '' });
    else B.items.push({ m: mid, p, st: B.comun, at: m.at, a: m.a, b: m.b, la: m.la || null, lb: m.lb || null, s: m.s, o0: cuotaBase(m, p), err: '' });
    B.k = yo(); B.res = null; B.sure = 0; B.vaciar = 0;
    if (!B.items.length) B.abierto = false;
    guarda(); marca(); pinta(true);
    if (B.items.length > antes) late();
    if (B.items.length) cargaBoost();
  }
  function quita(k) { B.items = B.items.filter((x) => (String(k).includes('|') ? clave(x) !== k : x.m !== k)); B.sure = 0; if (!B.items.length && !B.res) B.abierto = false; guarda(); marca(); pinta(true) }
  function vacia() { B.items = []; B.sure = 0; B.vaciar = 0; B.res = null; B.abierto = false; guarda(); marca(); pinta(true) }
  // lo que ya ha empezado sale solo (al cargar, al repintar la app y cada 15 s)
  function caduca() {
    if (B.busy || !B.items.length) return;
    const ahora = Date.now(), fuera = [];
    B.items = B.items.filter((x) => {
      const m = listo() ? partido(x.m) : null;
      const ya = m ? !(m.status === 'scheduled' && Date.parse(m.at) > ahora) : Date.parse(x.at) <= ahora;
      if (ya) fuera.push(x); return !ya;
    });
    if (!fuera.length) return;
    B.fuera = [...new Map(fuera.map((x) => [x.m, x])).values()].map((x) => ({ a: x.a, b: x.b, t: ahora }));
    B.sure = 0; if (!B.items.length && !B.res) B.abierto = false;
    guarda(); marca(); pinta(true);
    avisa(`<b>${esc(fuera[0].a)} vs ${esc(fuera[0].b)}</b> ya ha empezado y sale del boleto`);
    setTimeout(() => { if (B.fuera.length && Date.now() - B.fuera[0].t >= 9e3) { B.fuera = []; pinta(true) } }, 9100);
  }
  setInterval(caduca, 15e3);

  // dorado en las cuotas que estan en el boleto (lista y ficha)
  function marca() {
    const sel = new Set(B.items.map((x) => x.m + '|' + x.p));
    document.querySelectorAll('#view [data-pick]').forEach((b) => {
      const on = sel.has(b.dataset.pick);
      if (b.classList.contains('blt-on') !== on) b.classList.toggle('blt-on', on);
    });
  }
  // en la ficha, "Elige 1, X o 2 para apostar." pasa a decir como se apuesta ahora
  const PISTAS = ['Elige 1, X o 2 para apostar.', 'Elige 1 o 2 para apostar.', 'Pick 1, X or 2 to bet.', 'Pick 1 or 2 to bet.'];
  function pista() {
    document.querySelectorAll('.det p.hint:not([data-blt-h])').forEach((p) => {
      if (!PISTAS.includes(p.textContent.trim())) return;
      p.dataset.bltH = '1'; p.textContent = 'Toca una cuota para añadirla al boleto.'; traduce(p);
    });
  }

  /* ---------- el clic en una cuota: al boleto, sin abrir la ficha ---------- */
  // Fase de captura en document: va antes que el clic de app.js (burbuja en document) y lo para. Solo las cuotas de #view.
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('#view [data-pick]');
    if (!b || b.disabled || !listo()) return;
    e.stopPropagation(); e.preventDefault();
    const [mid, p] = b.dataset.pick.split('|');
    let repinta = false;
    try { if (S.sel && S.sel.m === mid) { S.sel = null; repinta = true } } catch {}   // si venia de "me sumo" con el deslizador
    toca(mid, p);
    if (repinta) { try { render() } catch {} }
  }, true);

  /* ---------- pintar ---------- */
  let raiz = null;
  function monta() {
    if (raiz && raiz.isConnected) return raiz;
    raiz = document.getElementById('blt');
    if (!raiz) {
      raiz = document.createElement('div'); raiz.id = 'blt'; raiz.className = 'blt'; raiz.hidden = true;
      raiz.innerHTML = '<button type="button" class="blt-barra" data-blt="abre" aria-label="Abrir el boleto"></button><div class="blt-fondo" data-blt="cierra"></div><section class="blt-hoja" role="dialog" aria-label="Boleto"><header class="blt-cab"></header><div class="blt-cuerpo"><div class="blt-res"></div><div class="blt-comun"></div><div class="blt-lista"></div></div><footer class="blt-pie"></footer></section>';
      const rail = document.querySelector('#app .rail');
      if (rail) rail.prepend(raiz); else document.body.appendChild(raiz);   // en movil va dentro de la barra de abajo: empuja, no tapa
      raiz.addEventListener('click', clicDentro);
      raiz.addEventListener('input', escribe);
      raiz.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur() });
    }
    return raiz;
  }
  const valida = (it) => it.st >= 1 && cuota(it).o != null;
  const totales = () => B.items.reduce((t, it) => { const c = cuota(it); t.st += it.st; t.co += c.o ? Math.round(it.st * c.o) : 0; return t }, { st: 0, co: 0 });
  function problemas() {
    const t = totales(), s = saldo(), out = [];
    if (comb()) {
      if (B.items.some((it) => cuota(it).o == null)) out.push('<p class="blt-av">Quita las que ya no tienen cuota</p>');
      if (B.items.length > COMB_MAX) out.push(`<p class="blt-av">Una combinada lleva ${COMB_MAX} partidos como máximo</p>`);
      if (new Set(B.items.map((it) => it.m)).size < B.items.length) out.push('<p class="blt-av">Una combinada lleva un solo pronóstico por partido</p>');
      if (B.cst < 1) out.push('<p class="blt-av">Pon un importe</p>');
      else if (B.cst > s) out.push(`<p class="blt-av"><span>Te faltan</span> <b>${N(B.cst - s)}${coin()}</b> <span>para apostarlo</span></p>`);
      if (B.cerr) out.push(`<p class="blt-av">${esc(B.cerr)}</p>`);
      return out;
    }
    if (B.items.some((it) => cuota(it).o == null)) out.push('<p class="blt-av">Quita las que ya no tienen cuota</p>');
    if (B.items.some((it) => it.st < 1)) out.push('<p class="blt-av">Pon un importe en cada una</p>');
    else if (t.st > s) out.push(`<p class="blt-av"><span>Te faltan</span> <b>${N(t.st - s)}${coin()}</b> <span>para apostarlo todo</span></p>`);
    return out;
  }
  const escudo = (src, s, cls) => (src ? `<img class="${cls}${s === 'u' ? ' face' : ''}" src="${esc(src)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : `<span class="noimg ${cls}"></span>`);
  function linea(it) {
    const m = partido(it.m), c = cuota(it), at = m ? m.at : it.at, solo = B.items.length === 1;
    const mv = c.base != null && it.o0 != null && Math.abs(c.base - it.o0) > 0.001 ? (c.base > it.o0 ? '<i class="blt-mv sube">▲</i>' : '<i class="blt-mv baja">▼</i>') : '';
    const tope = c.pct && it.st > c.resta ? `<p class="blt-e tope"><span>Con cuota mejorada te quedan</span> <b>${N(c.resta)}${coin()}</b> <span>en este partido</span></p>` : '';
    return `<div class="blt-l ${lado(it.p)} ${c.pct ? 'mej' : ''} ${it.ok ? 'ok' : it.err ? 'ko' : ''} ${solo ? 'solo' : ''}" data-k="${esc(clave(it))}">
      <span class="blt-es">${escudo(m?.la || it.la, it.s, 'blt-ea')}${escudo(m?.lb || it.lb, it.s, 'blt-eb')}</span>
      <span class="blt-q"><b>${esc(nombre(it, m))}</b><button type="button" class="blt-pt" data-blt="ir" data-m="${esc(it.m)}" title="Ir al partido"><span>${esc(cuando(at))}</span> · <span>${esc(m ? m.a : it.a)} vs ${esc(m ? m.b : it.b)}</span></button></span>
      <span class="blt-o">${c.o == null ? '<em>·</em>' : `${mv}${c.pct ? `${BOLT}<s>${O(c.base)}</s>` : ''}<b>${O(c.o)}</b>`}</span>
      <button type="button" class="blt-x" data-blt="quita" data-m="${esc(clave(it))}" aria-label="Quitar">${EQUIS}</button>
      <label class="blt-in"><input type="text" inputmode="numeric" autocomplete="off" maxlength="7" data-blt-i="${esc(clave(it))}" value="${it.st || ''}" aria-label="Importe">${coin()}</label>
      <span class="blt-co">${c.o == null ? '<span>Esa opción ya no tiene cuota</span>' : `<i>→</i> <b>${N(it.st * c.o)}</b>${coin()}`}</span>
      ${it.err ? `<p class="blt-e">${esc(it.err)}</p>` : ''}${tope}
    </div>`;
  }
  function chipOn(v) {
    const n = B.items.length; if (!n) return false;
    const s = saldo(), per = v === 'mitad' ? Math.floor(s / 2 / n) : v === 'todo' ? Math.floor(s / n) : +v;
    return per >= 1 && B.items.every((it) => it.st === per);
  }
  function pintaComun(r) {
    const n = B.items.length, el = r.querySelector('.blt-comun');
    if (!n) { el.innerHTML = ''; return }
    const chip = (v, t, ti) => `<button type="button" class="chip ${chipOn(v) ? 'on' : ''}" data-blt="c" data-v="${v}"${ti ? ` title="${ti}"` : ''}>${t}</button>`;
    const modo = n >= 2 ? `<div class="blt-modo" role="tablist"><button type="button" class="${comb() ? '' : 'on'}" data-blt="modo" data-v="sueltas"><b>Sueltas</b><small>cada una por su lado</small></button><button type="button" class="${comb() ? 'on' : ''}" data-blt="modo" data-v="comb"><b>Combinada</b><small>cuotas multiplicadas, aciertas todas</small></button></div>` : '';
    if (comb()) {
      const cc = (v, t, ti) => `<button type="button" class="chip ${B.cst === (v === 'mitad' ? Math.floor(saldo() / 2) : v === 'todo' ? saldo() : +v) ? 'on' : ''}" data-blt="c" data-v="${v}"${ti ? ` title="${ti}"` : ''}>${t}</button>`;
      el.innerHTML = `${modo}<div class="blt-cq"><span class="lab">Cuota de la combinada</span><b>${O(cuotaComb())}</b></div><span class="lab">Importe de la combinada</span>
      <div class="blt-cf"><label class="blt-in grande"><input type="text" inputmode="numeric" autocomplete="off" maxlength="7" data-blt-c value="${B.cst || ''}" placeholder="50" aria-label="Importe">${coin()}</label>
      <span class="blt-chips">${cc(10, '10')}${cc(50, '50')}${cc(100, '100')}${cc('mitad', '1/2', 'La mitad de tu saldo')}${cc('todo', 'Todo', 'Todo tu saldo')}</span></div>`;
      return;
    }
    el.innerHTML = `${modo}<span class="lab">${n > 1 ? 'Mismo importe para todas' : 'Importe'}</span>
      <div class="blt-cf"><label class="blt-in grande"><input type="text" inputmode="numeric" autocomplete="off" maxlength="7" data-blt-c value="${B.items.every((it) => it.st === B.items[0].st) ? B.items[0].st || '' : ''}" placeholder="${N(B.comun)}" aria-label="Importe">${coin()}</label>
      <span class="blt-chips">${chip(10, '10')}${chip(50, '50')}${chip(100, '100')}${chip('mitad', '1/2', 'La mitad de tu saldo, repartida')}${chip('todo', 'Todo', 'Todo tu saldo, repartido')}</span></div>`;
  }
  function pintaRes(r) {
    const el = r.querySelector('.blt-res'), x = B.res, f = B.fuera;
    let h = f.length ? f.map((q) => `<p class="blt-fuera"><b>${esc(q.a)} vs ${esc(q.b)}</b> <span>ya ha empezado y sale del boleto</span></p>`).join('') : '';
    if (x) {
      const ok = x.list.filter((y) => y.ok), t = x.list.length;
      const titulo = t === 1 ? (ok.length ? 'Ha entrado' : 'No ha entrado') : ok.length === t ? `Han entrado las ${t}` : ok.length ? `Han entrado ${ok.length} de ${t}` : 'No ha entrado ninguna';
      h += `<div class="blt-r ${ok.length === t ? 'todo' : ok.length ? 'parte' : 'nada'}"><b class="blt-rt">${titulo}</b>
        ${ok.map((y) => `<div class="blt-rl"><i>✓</i><span>${esc(y.nom)}</span><em>${O(y.odds)} · ${N(y.st)}${coin()}</em></div>`).join('')}
        ${ok.length < t && B.items.length ? '<p class="blt-rn">Las que no han entrado siguen abajo con el motivo</p>' : ''}</div>`;
    }
    el.innerHTML = h;
  }
  function pintaLista(r) {
    const el = r.querySelector('.blt-lista');
    el.innerHTML = B.items.map(linea).join('');
  }
  function pintaPie(r) {
    const el = r.querySelector('.blt-pie'), n = B.items.length;
    if (!n) { el.innerHTML = B.res ? '<button type="button" class="blt-listo" data-blt="cierra">Cerrar</button>' : ''; return }
    if (comb()) {
      const pr = problemas(), q = cuotaComb(), txt = B.busy ? B.prog : B.sure ? '¿Seguro? Toca otra vez' : `Apostar combinada de ${n}`;
      el.innerHTML = `<div class="blt-tot"><span>Importe</span><b>${N(B.cst)}${coin()}</b></div>
        <div class="blt-tot gana"><span>Cobrarías si aciertas las ${n}</span><b>${N(B.cst * q)}${coin()}</b></div>
        ${pr.join('')}
        <button type="button" class="go blt-go ${B.sure ? 'sure' : ''}" data-blt="apuesta" ${pr.length || B.busy ? 'disabled' : ''}>${esc(txt)}</button>`;
      return;
    }
    const t = totales(), pr = problemas(), mal = pr.length > 0 || !B.items.every(valida);
    const txt = B.busy ? B.prog : B.sure ? '¿Seguro? Toca otra vez' : n === 1 ? `Apostar ${N(t.st)}` : `Apostar las ${n}`;
    el.innerHTML = `<div class="blt-tot"><span>Total apostado</span><b>${N(t.st)}${coin()}</b></div>
      <div class="blt-tot gana"><span>${n > 1 ? 'Cobrarías si aciertas todas' : 'Cobrarías si aciertas'}</span><b>${N(t.co)}${coin()}</b></div>
      ${pr.join('')}
      <button type="button" class="go blt-go ${B.sure ? 'sure' : ''}" data-blt="apuesta" ${mal || B.busy ? 'disabled' : ''}>${esc(txt)}</button>`;
  }
  function pintaCab(r) {
    const n = B.items.length;
    r.querySelector('.blt-cab').innerHTML = `${!n && B.res ? '<span class="blt-n ok">✓</span>' : `<span class="blt-n">${n}</span>`}<b class="blt-t">Boleto</b>
      ${n ? `<button type="button" class="blt-vac ${B.vaciar ? 'sure' : ''}" data-blt="vacia">${B.vaciar ? '¿Seguro? Toca otra vez' : 'Vaciar'}</button>` : ''}
      <button type="button" class="blt-cierra" data-blt="cierra" aria-label="Cerrar">${CHEV}</button>`;
  }
  function pintaBarra(r) {
    const n = B.items.length, t = totales(), el = r.querySelector('.blt-barra');
    if (!n && B.res) {
      const ok = B.res.list.filter((y) => y.ok).length, tt = B.res.list.length;
      el.innerHTML = `<span class="blt-n ok">✓</span><span class="blt-bt"><b>${tt === 1 ? (ok ? 'Ha entrado' : 'No ha entrado') : ok === tt ? `Han entrado las ${tt}` : `Han entrado ${ok} de ${tt}`}</b></span><span></span>${CHEV}`;
      return;
    }
    if (comb()) { el.innerHTML = `<span class="blt-n">${n}</span><span class="blt-bt"><b>Combinada</b><small>cuota ${O(cuotaComb())} · ${N(B.cst)}${coin()}</small></span>
      <span class="blt-bc"><small>Cobrarías</small><b>${N(B.cst * cuotaComb())}${coin()}</b></span>${CHEV}`; return }
    el.innerHTML = `<span class="blt-n">${n}</span><span class="blt-bt"><b>Boleto</b><small>${N(t.st)}${coin()}</small></span>
      <span class="blt-bc"><small>Cobrarías</small><b>${N(t.co)}${coin()}</b></span>${CHEV}`;
  }
  // todo de nuevo (estructura) o solo lo que cambia al escribir un importe (sin perder el foco del campo)
  let firma = '';
  function pinta(todo) {
    const r = monta();
    const ver = pantalla() === 'partidos' && listo() && (B.items.length > 0 || !!B.res);
    if (r.hidden === ver) r.hidden = !ver;
    document.body.classList.toggle('blt-hay', ver);
    if (!ver) { if (B.abierto && !B.items.length) B.abierto = false; return }
    r.classList.toggle('abierto', B.abierto); r.classList.toggle('comb', comb());
    const det = document.querySelector('.det.open');
    r.classList.toggle('sobre', !!det && getComputedStyle(det).position === 'fixed');
    const foco = document.activeElement && r.contains(document.activeElement) && document.activeElement.matches('input') ? document.activeElement : null;
    const f = JSON.stringify([B.items.map((x) => [x.m, x.p, x.err, x.st, x.ok, cuota(x).o]), B.res && B.res.at, B.fuera.length, B.abierto, B.sure, B.vaciar, B.busy, B.prog, XB.t, saldo(), document.documentElement.lang, B.modo, B.cst, B.cerr]);
    if (!todo && f === firma) return;
    firma = f;
    pintaBarra(r); pintaCab(r); pintaRes(r); pintaPie(r);
    if (foco) actualizaLineas(r); else { pintaComun(r); pintaLista(r) }
    traduce(r);
  }
  function actualizaLineas(r) {
    for (const it of B.items) {
      const l = r.querySelector(`.blt-l[data-k="${CSS.escape(clave(it))}"]`); if (!l) continue;
      const c = cuota(it), co = l.querySelector('.blt-co b'); if (co && c.o) co.textContent = N(it.st * c.o);
      const inp = l.querySelector('input'); if (inp && document.activeElement !== inp && +inp.value !== it.st) inp.value = it.st || '';
      const av = l.querySelector('.blt-e.tope'), sobra = c.pct && it.st > c.resta;
      if (sobra && !av) { l.insertAdjacentHTML('beforeend', `<p class="blt-e tope"><span>Con cuota mejorada te quedan</span> <b>${N(c.resta)}${coin()}</b> <span>en este partido</span></p>`); traduce(l.lastElementChild) }
      else if (!sobra && av) av.remove();
    }
    r.querySelectorAll('.blt-comun .chip[data-v]').forEach((b) => b.classList.toggle('on', chipOn(b.dataset.v)));
    const ic = r.querySelector('[data-blt-c]');
    if (ic && document.activeElement !== ic) ic.value = B.items.length && B.items.every((it) => it.st === B.items[0].st) ? B.items[0].st || '' : '';
  }
  // late la cuenta al meter una
  function late() {
    if (sinAnim()) return;
    monta().querySelectorAll('.blt-n, .blt-barra').forEach((n) => { n.classList.remove('late'); void n.offsetWidth; n.classList.add('late') });
  }

  /* ---------- escribir importes ---------- */
  const entero = (v) => Math.min(9999999, Math.max(0, parseInt(String(v).replace(/\D/g, ''), 10) || 0));
  function escribe(e) {
    const t = e.target;
    if (t.matches('[data-blt-i]')) {
      const it = B.items.find((x) => clave(x) === t.dataset.bltI); if (!it) return;
      const v = entero(t.value); if (String(v || '') !== t.value) t.value = v || '';
      it.st = v; it.err = '';
    } else if (t.matches('[data-blt-c]') && comb()) {
      const v = entero(t.value); if (String(v || '') !== t.value) t.value = v || '';
      B.cst = v; B.cerr = '';
    } else if (t.matches('[data-blt-c]')) {
      const v = entero(t.value); if (String(v || '') !== t.value) t.value = v || '';
      if (v >= 1) B.comun = v;
      for (const it of B.items) { it.st = v; it.err = '' }
    } else return;
    B.sure = 0; B.res = null; guarda();
    const r = monta(); firma = '';
    pintaBarra(r); pintaPie(r); pintaRes(r); actualizaLineas(r); traduce(r.querySelector('.blt-pie')); traduce(r.querySelector('.blt-barra'));
  }

  /* ---------- clics dentro del boleto ---------- */
  async function clicDentro(e) {
    const b = e.target.closest('[data-blt]'); if (!b || b.disabled) return;
    const k = b.dataset.blt;
    if (k === 'abre') { B.abierto = B.items.length > 0 || !!B.res; return pinta(true) }
    if (k === 'cierra') { B.abierto = false; B.vaciar = 0; B.sure = 0; if (!B.items.length) { B.res = null; B.fuera = [] } return pinta(true) }
    if (k === 'quita') return quita(b.dataset.m);
    if (k === 'vacia') {
      if (!B.vaciar || Date.now() - B.vaciar > 4000) { B.vaciar = Date.now(); pinta(true); setTimeout(() => { if (B.vaciar && Date.now() - B.vaciar >= 4000) { B.vaciar = 0; pinta(true) } }, 4100); return }
      return vacia();
    }
    if (k === 'modo') { B.modo = b.dataset.v === 'comb' ? 'comb' : 'sueltas'; B.sure = 0; B.cerr = ''; B.res = null; guarda(); return pinta(true) }
    if (k === 'c' && comb()) {
      const s = saldo(), v = b.dataset.v; B.cst = Math.max(0, v === 'mitad' ? Math.floor(s / 2) : v === 'todo' ? s : +v); B.sure = 0; B.cerr = ''; guarda(); return pinta(true);
    }
    if (k === 'c') {
      const n = B.items.length; if (!n) return;
      const s = saldo(), v = b.dataset.v, per = v === 'mitad' ? Math.floor(s / 2 / n) : v === 'todo' ? Math.floor(s / n) : +v;
      if (per >= 1 && v !== 'mitad' && v !== 'todo') B.comun = per;
      for (const it of B.items) { it.st = per; it.err = '' }
      B.sure = 0; B.res = null; guarda(); return pinta(true);
    }
    if (k === 'ir') {
      const mid = b.dataset.m; if (!partido(mid)) return;
      if (!escritorio()) B.abierto = false;
      try { S.scr = 'partidos'; S.foc = mid; S.sheet = true; S.side = null; S.brk = false; render() } catch {}
      return pinta(true);
    }
    if (k === 'apuesta') return apuesta();
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && B.abierto && raiz && !raiz.hidden) { B.abierto = false; pinta(true) } });
  // en escritorio, un clic fuera del boleto (que no sea en una cuota ni en el aviso de arriba) lo pliega
  document.addEventListener('click', (e) => {
    if (!B.abierto || B.busy || !raiz || raiz.hidden || !escritorio() || !e.target.isConnected || raiz.contains(e.target)) return;
    if (e.target.closest('#view [data-pick], #toast')) return;
    B.abierto = false; B.vaciar = 0; B.sure = 0; if (!B.items.length) { B.res = null; B.fuera = [] } pinta(true);
  });

  /* ---------- apostar: una por una, en serie ---------- */
  const motivo = (e) => {
    const t = String((e && (e.message || e.error_description)) || '').trim();
    if (!t || /Failed to fetch|NetworkError|Load failed|network/i.test(t)) return 'Sin conexión: no ha entrado';
    return t.replace(/^(Error|P0001):\s*/i, '');
  };
  async function apuesta() {
    if (B.busy) return;
    const lista = B.items.slice();
    if (!lista.length || problemas().length || !lista.every(valida)) return pinta(true);
    if (!B.sure || Date.now() - B.sure > 5000) {
      B.sure = Date.now(); pinta(true);
      setTimeout(() => { if (B.sure && Date.now() - B.sure >= 5000) { B.sure = 0; pinta(true) } }, 5100);
      return;
    }
    if (comb()) return apuestaComb(lista);
    B.sure = 0; B.busy = true; B.res = null; B.fuera = [];
    const res = [], r = monta();
    for (let i = 0; i < lista.length; i++) {
      const it = lista[i], m = partido(it.m);
      B.prog = `Apostando ${i + 1} de ${lista.length}…`; pinta(true);
      let x;
      try {
        const { data, error } = await db.rpc('place_bet', { p_match: it.m, p_pick: it.p, p_stake: it.st });
        if (error) throw error;
        x = { ok: true, odds: Number(data && data.odds) || cuota(it).o };
      } catch (err) { x = { ok: false, err: motivo(err) } }
      res.push({ m: it.m, p: it.p, k: clave(it), st: it.st, nom: nombre(it, m), ...x });
      if (x.ok) { it.ok = true; it.err = '' } else it.err = x.err;
      pinta(true);
      const l = r.querySelector(`.blt-l[data-k="${CSS.escape(clave(it))}"]`);
      if (x.ok && l) { try { vuela(l.querySelector('.blt-co .cn') || l) } catch {} }
    }
    const dentro = new Set(res.filter((y) => y.ok).map((y) => y.k));
    B.items = B.items.filter((it) => !dentro.has(clave(it)));
    B.busy = false; B.prog = ''; B.res = { at: Date.now(), list: res };
    guarda(); marca();
    const ok = dentro.size, t = res.length;
    avisa(t === 1 ? (ok ? 'Ha entrado' : 'No ha entrado') : ok === t ? `Han entrado las ${t}` : ok ? `Han entrado ${ok} de ${t}` : 'No ha entrado ninguna');
    pinta(true);
    try { await refresh() } catch {}
    if (!B.items.length) {
      const at = B.res.at;
      setTimeout(() => { if (B.res && B.res.at === at && !B.items.length) { B.res = null; B.abierto = false; pinta(true) } }, 7000);
    }
  }

  async function apuestaComb(lista) {
    B.sure = 0; B.busy = true; B.res = null; B.fuera = []; B.cerr = ''; B.prog = 'Apostando la combinada…'; pinta(true);
    try {
      const { data, error } = await db.rpc('place_combo', { p_legs: lista.map((it) => ({ match: it.m, pick: it.p })), p_stake: B.cst });
      if (error) throw error;
      B.res = { at: Date.now(), list: [{ ok: true, m: 'comb', nom: `Combinada de ${lista.length}`, odds: Number(data && data.odds) || cuotaComb(), st: B.cst }] };
      B.items = []; avisa('Ha entrado la combinada');
      try { vuela(monta().querySelector('.blt-tot.gana .cn') || monta()) } catch {}
    } catch (err) { B.cerr = motivo(err); avisa(esc(B.cerr)) }
    B.busy = false; B.prog = ''; guarda(); marca(); pinta(true);
    try { await refresh() } catch {}
    window.dispatchEvent(new CustomEvent('gm:combo'));
    if (!B.items.length && B.res) { const at = B.res.at; setTimeout(() => { if (B.res && B.res.at === at && !B.items.length) { B.res = null; B.abierto = false; pinta(true) } }, 7000) }
  }

  /* ---------- montaje: cada vez que la app repinta ---------- */
  let pendiente = false;
  function rev() {
    if (!listo()) return;
    if (B.k && yo() && B.k !== yo()) { B.items = []; B.res = null; B.k = yo(); guarda() }     // otro jugador en este navegador
    caduca(); marca(); pista(); pinta(false);
  }
  const app = document.getElementById('app');
  new MutationObserver((ms) => {
    if (pendiente) return;
    if (raiz && ms.every((m) => raiz.contains(m.target))) return;                          // lo mio no cuenta
    pendiente = true;
    queueMicrotask(() => { pendiente = false; try { rev() } catch (e) { if (!rev.avisado) { rev.avisado = 1; console.warn('boleto.js', e) } } });
  }).observe(app || document.documentElement, { childList: true, subtree: true });
  addEventListener('resize', () => { if (raiz && !raiz.hidden) pinta(true) });
  addEventListener('gm:mk', () => { if (raiz && !raiz.hidden) { marca(); pinta(true) } });   // llegan las cuotas de los mercados nuevos (mercados.js)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) caduca() });

  // para otros modulos y para las pruebas
  window.GM_BOLETO = { mete: (mid, p) => { const it = B.items.find((x) => x.m === mid && grupo(x.p) === grupo(p)); if (!it || it.p !== p) toca(mid, p) }, quita, vacia, lista: () => B.items.map(({ m, p, st }) => ({ m, p, st })), abre: () => { if (B.items.length) { B.abierto = true; pinta(true) } } };

  /* ---------- estilos ---------- */
  const css = document.createElement('style');
  css.id = 'blt-css';
  css.textContent = `
/* cuotas en el boleto: dorado */
.o.blt-on{color:#141008;isolation:isolate}
.o.blt-on:hover{color:#141008}
.o.blt-on::after{content:"";position:absolute;top:17px;bottom:17px;left:8px;right:8px;height:auto;z-index:-1;border-radius:12px;background:linear-gradient(180deg,var(--acc2),var(--acc));box-shadow:0 6px 18px rgba(242,193,78,.28)}
.o.blt-on.mine::before{background:#141008}
.o.blt-on small,.o.blt-on .xb-o b{color:#141008}
.o.blt-on .xb-o s{color:rgba(20,16,8,.6)}
.o.blt-on .mv{color:#141008}
.pk.blt-on{background:linear-gradient(0deg,rgba(242,193,78,.16),transparent 75%)}
.pk.blt-on b{color:var(--acc)}
.pk.blt-on .n{color:var(--ink)}
.pk.blt-on::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:3px;background:var(--acc)}
.pk.blt-on .k::before{content:"✓";display:inline-grid;place-items:center;width:14px;height:14px;margin-right:7px;border-radius:50%;background:var(--acc);color:#141008;font:800 9px/1 var(--sans);letter-spacing:0;vertical-align:1px}

/* el boleto */
.blt{font-family:var(--sans);color:var(--ink)}
.blt-bolt{width:12px;height:12px;flex:none;fill:currentColor}
.blt-chev{width:18px;height:18px;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;transition:transform .2s var(--ease)}
.blt-n{display:grid;place-items:center;min-width:30px;height:30px;padding:0 8px;border-radius:999px;background:linear-gradient(180deg,var(--acc2),var(--acc));color:#141008;font:800 14px/1 var(--disp)}
.blt-n.ok{background:var(--win);color:#06150c}
.blt-n.late{animation:bltLate .45s var(--ease)}
@keyframes bltLate{40%{transform:scale(1.28)}}
.blt-barra.late{animation:bltBrilla .9s ease-out}
@keyframes bltBrilla{0%{box-shadow:0 0 0 0 rgba(242,193,78,.6),0 18px 50px rgba(0,0,0,.55)}100%{box-shadow:0 0 0 14px rgba(242,193,78,0),0 18px 50px rgba(0,0,0,.55)}}
.blt-barra{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;align-items:center;gap:14px;width:100%;text-align:left;color:var(--ink)}
.blt-bt{display:grid;gap:2px;min-width:0}
.blt-bt b{font:800 15px/1.1 var(--disp);letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.blt-bt small{display:flex;align-items:center;font:12px var(--mono);color:var(--mute)}
.blt-bc{display:grid;justify-items:end;gap:2px}
.blt-bc small{font:10px var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--mute)}
.blt-bc b{display:flex;align-items:center;font:500 18px/1 var(--mono);letter-spacing:-.04em;color:var(--acc)}
.blt-barra .blt-chev{color:var(--mute)}
.blt-hoja{display:none;flex-direction:column;min-height:0;background:var(--bg2);box-shadow:0 24px 60px rgba(0,0,0,.55),0 0 0 1px var(--hair);animation:bltEntra .22s var(--ease)}
.blt.abierto .blt-hoja{display:flex}
@keyframes bltEntra{from{transform:translateY(12px);opacity:0}}
.blt-cab{display:flex;align-items:center;gap:12px;padding:16px 18px 12px 20px}
.blt-t{font:800 20px/1 var(--disp);letter-spacing:-.02em}
.blt-vac{margin-left:auto;padding:6px 2px;font:500 12px var(--mono);color:var(--mute);transition:color .15s}
.blt-vac:hover{color:var(--ink)}
.blt-vac.sure{color:#ff8a8a}
.blt-cierra{display:grid;place-items:center;width:34px;height:34px;margin-right:-6px;border-radius:50%;color:var(--mute);transition:color .15s,background .15s}
.blt-cab .blt-vac+.blt-cierra{margin-left:0}
.blt-cab>.blt-cierra:only-of-type{margin-left:auto}
.blt-cierra:hover{color:var(--ink);background:rgba(255,255,255,.06)}
.blt-cierra .blt-chev{transform:rotate(180deg)}
.blt-cuerpo{flex:1 1 auto;min-height:0;overflow:auto;overscroll-behavior:contain;padding:0 20px;scrollbar-width:thin;scrollbar-color:#2a2e36 transparent}
.blt-comun{display:grid;gap:8px;padding:4px 0 14px}
.blt-comun:empty{display:none}
.blt-cf{display:flex;align-items:center;gap:18px;flex-wrap:wrap}
.blt-chips{display:flex;gap:16px}
.blt-chips .chip{font-size:13px}
.blt-in{display:inline-flex;align-items:center;gap:2px;height:34px;padding:0 10px 0 12px;border-radius:10px;background:rgba(255,255,255,.06);cursor:text;transition:background .15s}
.blt-in:focus-within{background:rgba(242,193,78,.12)}
.blt-in input{width:64px;min-width:0;border:0;outline:0;background:none;font:500 15px var(--mono);letter-spacing:-.02em;color:var(--ink)}
.blt-in input::placeholder{color:var(--dim)}
.blt-in.grande input{width:76px;font-size:17px}
.blt-in .cn{--s:15px}
.blt-lista{display:grid}
.blt-l{display:grid;grid-template-columns:40px minmax(0,1fr) auto 26px;grid-template-areas:"e q o x" "e i c c";align-items:center;gap:8px 12px;padding:14px 0;border-top:1px solid var(--hair);transition:opacity .25s,background .25s}
.blt-l.solo{grid-template-areas:"e q o x" "e c c c"}
.blt-l.solo .blt-in{display:none}
.blt-es{grid-area:e;position:relative;align-self:start;width:40px;height:40px}
.blt-es img,.blt-es .noimg{position:absolute;width:26px;height:26px;object-fit:contain}
.blt-ea{left:0;top:0}.blt-eb{right:0;bottom:0}
.blt-l.p1 .blt-ea,.blt-l.p2 .blt-eb{z-index:1}
.blt-l.p1 .blt-eb,.blt-l.p2 .blt-ea{opacity:.45}
.blt-es img.face{border-radius:50%;object-fit:cover}
.blt-q{grid-area:q;display:grid;gap:3px;min-width:0}
.blt-q b{font:600 15px/1.2 var(--sans);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.blt-pt{display:block;min-width:0;font:11px/1.3 var(--mono);color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color .15s}
.blt-pt:hover{color:var(--soft)}
.blt-o{grid-area:o;display:flex;align-items:center;gap:6px;font:500 19px/1 var(--mono);letter-spacing:-.03em}
.blt-o s{font-size:12px;color:var(--dim)}
.blt-l.mej .blt-o{color:var(--acc)}
.blt-mv{font-style:normal;font-size:9px}
.blt-mv.sube{color:var(--win)}.blt-mv.baja{color:#ff8a8a}
.blt-x{grid-area:x;display:grid;place-items:center;width:26px;height:26px;border-radius:50%;color:var(--dim);transition:color .15s,background .15s}
.blt-x svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}
.blt-x:hover{color:var(--ink);background:rgba(255,255,255,.06)}
.blt-l .blt-in{grid-area:i;justify-self:start}
.blt-co{grid-area:c;justify-self:end;display:flex;align-items:center;gap:4px;font:13px var(--mono);color:var(--mute)}
.blt-co i{font-style:normal;color:var(--dim)}
.blt-co b{font-weight:500;font-size:15px;color:var(--ink)}
.blt-e{grid-column:2/-1;font:12px/1.45 var(--mono);color:#ff8a8a}
.blt-e.tope{color:var(--acc2)}
.blt-e b{display:inline-flex;align-items:center;font-weight:500}
.blt-l.ok{opacity:.55;background:linear-gradient(90deg,rgba(43,212,125,.12),transparent 70%)}
.blt-l.ok .blt-co b{color:var(--win)}
.blt-l.ko .blt-in{background:rgba(255,138,138,.12)}
.blt-r{display:grid;gap:6px;padding:4px 0 14px}
.blt-rt{font:800 17px/1.2 var(--disp);letter-spacing:-.01em;color:var(--win)}
.blt-r.parte .blt-rt{color:var(--acc)}
.blt-r.nada .blt-rt{color:#ff8a8a}
.blt-rl{display:grid;grid-template-columns:18px minmax(0,1fr) auto;align-items:center;gap:8px;font:600 14px var(--sans)}
.blt-rl i{font-style:normal;color:var(--win)}
.blt-rl span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.blt-rl em{display:flex;align-items:center;font:13px var(--mono);font-style:normal;color:var(--mute)}
.blt-rn{font:12px var(--mono);color:var(--dim)}
.blt-fuera{padding:4px 0 10px;font:13px/1.45 var(--sans);color:var(--acc2)}
.blt-pie{display:grid;gap:6px;padding:14px 20px 18px;box-shadow:0 -1px 0 var(--hair)}
.blt-pie:empty{display:none}
.blt-tot{display:flex;align-items:baseline;justify-content:space-between;gap:12px;font:12px var(--mono);color:var(--mute)}
.blt-tot b{display:flex;align-items:center;font:500 17px/1 var(--mono);letter-spacing:-.03em;color:var(--ink)}
.blt-tot.gana b{font-size:26px;color:var(--acc)}
.blt-tot.gana b .cn{--s:20px;margin-left:6px}
.blt-av{display:flex;flex-wrap:wrap;align-items:center;gap:0 6px;font:12px/1.45 var(--mono);color:#ff8a8a}
.blt-av b{display:inline-flex;align-items:center;font-weight:500}
.blt-go{height:52px;margin-top:8px}
.blt-go.sure{background:var(--ink)}
.blt-go:disabled{opacity:.45}
.blt-listo{justify-self:center;padding:8px 18px;border-radius:999px;background:rgba(255,255,255,.07);font:600 13px var(--sans);color:var(--soft)}
.blt-listo:hover{background:rgba(255,255,255,.11);color:var(--ink)}

/* escritorio: abajo a la derecha */
@media (min-width:861px){
  #blt{position:fixed;right:28px;bottom:24px;z-index:59;width:min(400px,calc(100vw - 280px))}
  #blt.sobre{z-index:62}
  .blt-barra{height:64px;padding:0 18px 0 14px;border-radius:18px;background:#252a34;box-shadow:0 18px 50px rgba(0,0,0,.55);transition:transform .15s var(--ease),background .15s}
  .blt-barra:hover{background:#2b313c;transform:translateY(-2px)}
  .blt.abierto .blt-barra{display:none}
  .blt-hoja{max-height:min(640px,calc(100vh - 110px));border-radius:20px}
  .blt-fondo{display:none}
  body.blt-hay .det{padding-bottom:110px}
  body.blt-hay .p-board{padding-bottom:110px}
}
/* movil: barra dentro de la de abajo, encima de los iconos; abre una hoja */
@media (max-width:860px){
  #blt{order:-2;flex:0 0 100%;padding:8px 4px 0}
  .blt-barra{height:50px;padding:0 12px 0 8px;border-radius:14px;background:linear-gradient(90deg,rgba(242,193,78,.2),rgba(242,193,78,.06));gap:12px}
  .blt-barra .blt-bt b{font-size:14px}
  .blt-barra .blt-bc b{font-size:16px}
  .blt-n{min-width:28px;height:28px;font-size:13px}
  #blt.sobre{position:fixed;left:0;right:0;bottom:0;z-index:62;padding:8px 10px calc(8px + env(safe-area-inset-bottom,0px));background:var(--bg2);box-shadow:0 -10px 30px rgba(0,0,0,.4)}
  body.blt-hay .det.open{padding-bottom:calc(110px + env(safe-area-inset-bottom,0px))}
  .blt-fondo{display:none;position:fixed;inset:0;z-index:70;background:rgba(5,7,10,.6)}
  .blt.abierto .blt-fondo{display:block}
  .blt-hoja{position:fixed;left:0;right:0;bottom:0;z-index:71;max-height:88vh;border-radius:22px 22px 0 0;padding-bottom:env(safe-area-inset-bottom,0px);animation-name:bltSube}
  .blt-hoja::before{content:"";align-self:center;flex:none;width:40px;height:4px;margin-top:8px;border-radius:2px;background:rgba(255,255,255,.18)}
  .blt-cab{padding-top:10px}
  .blt-in input{font-size:16px}
  .blt-chips{gap:14px}
}
@keyframes bltSube{from{transform:translateY(40%);opacity:0}}
html.sin-anim .blt-hoja,html.sin-anim .blt-n.late,html.sin-anim .blt-barra.late{animation:none}
`;
  document.head.appendChild(css);
  rev();
})();
