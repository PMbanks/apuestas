// Retos 1 contra 1 (PM, 01-11). Tres cosas, todas aqui para no tocar mas app.js:
//  1. Reto que te llega: se ve nada mas entrar y en cualquier pantalla (tarjeta arriba con Acepto / No / Luego), con punto en
//     Inicio y Apuestas, y aviso del navegador si la app esta en segundo plano (avisa() de app.js).
//  2. Reto abierto (db/042, challenge_join): "A cualquiera" al crear; lo ve todo el mundo y entra el primero. A quien lo creo
//     le avisa dentro de la app y con aviso del navegador cuando alguien entra. Mientras 042 no este cargado la opcion no sale
//     (se prueba una vez con challenge_join(0), que no toca nada: "Ese reto no existe").
//  3. Doble confirmacion al crear Y al entrar en un reto: dos pasos dentro de la pagina (no confirm(): no se ve en el movil
//     instalado). Un reto no se puede cancelar: si nadie entra antes de empezar el partido la base devuelve lo puesto.
// app.js llama a GM_RETOS.crea() / entra() / tras() / abiertoOK() / fueAbierto(). Usa lo global de app.js: S, CH, M, byId, isOpen,
// picksOf, pn, fr, av, me, MEK, N, CD, esc, toast, errMsg, refresh, db.
'use strict';
(function () {
  const g = (f, d) => { try { return f() } catch { return d } };
  const tr = (el) => { if (window.GM_LANG) GM_LANG.traduce(el) };
  const listo = () => { const a = document.getElementById('app'); return a && !a.hidden && g(() => typeof S === 'object' && Array.isArray(CH) && Array.isArray(M) && F.length > 0, false) };

  /* ---------- ¿la base ya sabe de retos abiertos? (db/042) ---------- */
  let OK = null, probando = false, ULT = 0;
  async function sonda() {
    if (OK !== null || probando || !listo() || Date.now() - ULT < 60e3 || typeof db === 'undefined' || !db.rpc) return;
    probando = true; ULT = Date.now();
    try {
      const { error } = await db.rpc('challenge_join', { p_id: 0, p_pick: '1' });
      const msg = (error && error.message) || '', cod = (error && error.code) || '';
      // sin la funcion: PGRST202 / 42883. Con ella, "Ese reto no existe" llega como error de la base (con codigo). Sin codigo = fallo de red: se vuelve a probar
      OK = !error ? true : (cod === 'PGRST202' || cod === '42883' || /could not find|schema cache|function .* does not exist/i.test(msg)) ? false : cod === 'P0001' ? true : null;
    } catch { OK = null } finally { probando = false; if (OK) g(() => render()) }
  }
  const abiertoOK = () => OK === true || g(() => CH.some((c) => c.ab), false);

  /* ---------- doble confirmacion ---------- */
  let ocupado = false;
  // d: { tipo: 'crear' | 'entrar', m, pick, stake, rival (nombre o ''), abierto, suyo (pick del otro) }
  function confirma(d) {
    return new Promise((ok) => {
      document.getElementById('rt-cf')?.remove();
      const cf = document.createElement('div'); cf.id = 'rt-cf'; cf.setAttribute('role', 'dialog'); cf.setAttribute('aria-modal', 'true');
      document.body.appendChild(cf); document.body.classList.add('rt-cf-on');
      const fin = (v) => { document.removeEventListener('keydown', tecla, true); cf.classList.remove('on'); document.body.classList.remove('rt-cf-on'); setTimeout(() => cf.remove(), 160); ok(v) };
      const tecla = (e) => { if (e.key === 'Escape') { e.stopPropagation(); fin(false) } };
      document.addEventListener('keydown', tecla, true);
      const m = d.m, entrar = d.tipo === 'entrar';
      const nn = (s) => `<span data-notr>${esc(s)}</span>`;
      const fila = (k, v, num) => `<div class="rt-cf-r"><span>${k}</span><b${num ? ' class="num"' : ''}>${v}</b></div>`;
      const resumen = `<div class="rt-cf-s">${fila('Partido', nn(`${m.a} vs ${m.b}`))}${fila('Tú vas con', esc(pn(m, d.pick)))}${fila(entrar ? 'Contra' : 'Rival', d.rival === 'Cualquiera' ? 'Cualquiera' : nn(d.rival))}${fila('Pones', N(d.stake) + g(() => coin(), ''), true)}${fila('En juego', N(d.stake * 2) + g(() => coin(), ''), true)}</div>`;
      const paso1 = () => {
        cf.innerHTML = `<div class="rt-cf-f" data-cf="no"></div><div class="rt-cf-c"><span class="lab">Paso 1 de 2</span>
          <h2>¿Seguro que quieres apostar aquí?</h2>${resumen}
          <div class="rt-cf-b"><button type="button" class="go" data-cf="si">Sí, seguir</button><button type="button" class="chip q" data-cf="no">Volver</button></div></div>`;
        tr(cf); requestAnimationFrame(() => { cf.classList.add('on'); cf.querySelector('.go')?.focus() });
      };
      const paso2 = () => {
        cf.innerHTML = `<div class="rt-cf-f" data-cf="no"></div><div class="rt-cf-c"><span class="lab">Paso 2 de 2</span>
          <h2>Un reto no se puede cancelar</h2>
          <p>${entrar ? 'Cuando entres, lo que pones se queda dentro y no puedes echarte atrás.' : 'Cuando lo envíes, lo que pones se queda dentro y no puedes retirarlo.'}</p>
          <p>${entrar ? 'Gana el que acierte y se lleva lo de los dos. Si el partido se anula, se devuelve a los dos.' : d.abierto ? 'Solo te lo devolvemos si nadie entra antes de que empiece el partido. Si entra alguien, gana el que acierte y se lleva lo de los dos.' : 'Solo te lo devolvemos si tu amigo lo rechaza o no contesta antes de que empiece el partido. Si acepta, gana el que acierte y se lleva lo de los dos.'}</p>
          <div class="rt-cf-s">${fila('Pones', N(d.stake) + g(() => coin(), ''), true)}</div>
          <div class="rt-cf-b"><button type="button" class="go" data-cf="ya">${entrar ? 'Entrar al reto' : 'Enviar reto'}</button><button type="button" class="chip q" data-cf="no">Volver</button></div></div>`;
        tr(cf); requestAnimationFrame(() => cf.querySelector('.chip')?.focus());
      };
      cf.addEventListener('click', (e) => {
        const b = e.target.closest('[data-cf]'); if (!b) return;
        e.stopPropagation();
        const k = b.dataset.cf;
        if (k === 'no') return fin(false);
        if (k === 'si') return paso2();
        if (k === 'ya') { b.disabled = true; return fin(true) }
      });
      paso1();
    });
  }

  /* ---------- crear ---------- */
  async function crea() {
    if (ocupado) return;
    const r = g(() => S.reto, null); if (!r || !r.p || !r.to) return;
    const m = byId(r.m); if (!m) return;
    const any = r.to === 'any', to = any ? null : fr(r.to), st = Math.max(0, Math.min(r.stake, me().s));
    if (st < 1) return toast('Pon al menos 1');
    if (!await confirma({ tipo: 'crear', m, pick: r.p, stake: st, rival: any ? 'Cualquiera' : to.n, abierto: any })) return;
    ocupado = true;
    try {
      const { error } = await db.rpc('challenge_create', { p_match: r.m, p_to: any ? null : to.uid, p_pick: r.p, p_stake: st });
      if (error) return toast(errMsg(error));
      S.reto = null;
      toast(any ? 'Reto abierto: puede entrar cualquiera' : `Reto enviado a <b data-notr>${esc(to.n)}</b>`);
      await refresh();
    } finally { ocupado = false }
  }

  /* ---------- entrar / aceptar ---------- */
  async function entra(id, pick) {
    if (ocupado) return;
    const c = g(() => CH.find((x) => x.id === id), null); if (!c) return;
    const m = byId(c.m); if (!m) return;
    if (!await confirma({ tipo: 'entrar', m, pick, stake: c.stake, rival: fr(c.from).n, abierto: c.ab })) return;
    ocupado = true;
    try {
      const { error } = c.ab
        ? await db.rpc('challenge_join', { p_id: id, p_pick: pick })
        : await db.rpc('challenge_answer', { p_id: id, p_accept: true, p_pick: pick });
      if (error) { toast(errMsg(error)); return refresh() }
      toast(c.ab ? 'Has entrado en el reto' : 'Reto aceptado');
      await refresh();
    } finally { ocupado = false }
  }

  /* ---------- avisos (los llama avisos() de app.js tras cada carga) ---------- */
  const ABIERTOS = new Set();   // retos que alguna vez se vieron abiertos: app.js no repite su "X acepta tu reto"
  let PREV = null;
  const fueAbierto = (id) => ABIERTOS.has(id);
  function tras() {
    if (!g(() => Array.isArray(CH) && typeof MEK !== 'undefined', false)) return;
    const now = new Map(CH.map((c) => [c.id, { st: c.st, ab: !!c.ab }]));
    if (PREV) for (const c of CH) {
      const p = PREV.get(c.id), m = byId(c.m); if (!m) continue;
      const lin = `${m.a} vs ${m.b} · ${N(c.stake)} a ${pn(m, c.fp)}`;
      if (!p && c.st === 'pending' && c.ab && c.from !== MEK && isOpen(m)) { avisa(`${fr(c.from).n} reta a cualquiera`, lin); toast(`<b data-notr>${esc(fr(c.from).n)}</b> reta a cualquiera`) }
      if (p && p.ab && p.st === 'pending' && c.st === 'accepted' && c.from === MEK) {
        avisa(`${fr(c.to).n} entra en tu reto`, `${m.a} vs ${m.b} · ${N(c.stake * 2)} en juego`);
        toast(`<b data-notr>${esc(fr(c.to).n)}</b> entra en tu reto`);
      }
    }
    for (const c of CH) if (c.ab) ABIERTOS.add(c.id);
    PREV = now;
    pinta();
  }

  /* ---------- tarjeta de "te han retado" y puntos del menu ---------- */
  const LUEGO = new Set();   // los que has dejado para luego (hasta recargar)
  const pendientes = () => g(() => CH.filter((c) => c.st === 'pending' && (c.to === MEK || (c.ab && c.from !== MEK)) && byId(c.m) && isOpen(byId(c.m))), []);
  function pinta() {
    if (!listo()) { document.getElementById('rt-av')?.remove(); return }
    const pend = pendientes(), ver = pend.filter((c) => !LUEGO.has(c.id));
    // puntos en Inicio y Apuestas
    const nav = document.getElementById('nav');
    if (nav) for (const k of ['inicio', 'apuestas']) { const b = nav.querySelector(`.nv[data-scr="${k}"]`); if (!b) continue; const t = b.querySelector('.rt-pt'); if (pend.length && !t) b.insertAdjacentHTML('beforeend', '<i class="nv-pt rt-pt" title="Retos que esperan"></i>'); else if (!pend.length && t) t.remove() }
    let el = document.getElementById('rt-av');
    if (!ver.length) { if (el) el.remove(); return }
    if (!el) { el = document.createElement('div'); el.id = 'rt-av'; el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Retos para ti'); document.body.appendChild(el) }
    const c = ver[0], m = byId(c.m), f = fr(c.from), otros = pend.length - 1;
    const acepta = picksOf(m).filter((p) => p !== c.fp);
    const html = `<div class="rtb-c ${c.ab ? 'ab' : ''}">${av(c.from)}
      <div class="rtb-t"><span class="lab"><span>${c.ab ? 'Reto abierto' : 'Reto para ti'}</span>${otros > 0 ? `<span> · </span><span>+${otros}</span>` : ''}</span>
        <p><b data-notr>${esc(f.n)}</b> <span>${c.ab ? 'reta a cualquiera' : 'te reta'}</span></p>
        <small><span data-notr>${esc(m.a)} vs ${esc(m.b)}</span> <span>·</span> <span>Pone</span> <b class="num">${N(c.stake)}</b> <span>y va con</span> <b>${esc(pn(m, c.fp))}</b> <span>·</span> <span>empieza en</span> <b class="num">${g(() => CD(m.at), '')}</b></small>
        <div class="rtb-b">${acepta.map((p) => `<button type="button" class="chip" data-accept="${c.id}|${p}"><span>${c.ab ? 'Entro con' : 'Acepto'}</span> <span>${esc(pn(m, p))}</span></button>`).join('')}${c.ab ? '' : `<button type="button" class="chip q" data-decline="${c.id}">No</button>`}<button type="button" class="chip q" data-rtb-luego="${c.id}">Luego</button></div>
      </div></div>`;
    const k = html + g(() => GM_LANG.get(), '') + S.scr + (document.body.classList.contains('rt-cf-on') ? 1 : 0);
    // se coloca debajo de la cabecera (y de la tira "en directo" en movil), encima de todo; no empuja nada
    const top = document.getElementById('top'), lb = document.getElementById('livebar');
    const y = Math.round(((lb && !lb.hidden && lb.getBoundingClientRect().height ? lb.getBoundingClientRect().bottom : top ? top.getBoundingClientRect().bottom : 64)) + 8);
    el.style.top = y + 'px';
    if (el.dataset.k !== k) { el.dataset.k = k; el.innerHTML = html; tr(el) }
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rtb-luego]'); if (!b) return;
    e.stopPropagation(); LUEGO.add(+b.dataset.rtbLuego); pinta();
  }, true);
  // app.js repinta la cabecera y la barra en cada render: ahi se repintan tambien los puntos y la tarjeta
  let pend = false;
  const vigila = () => { if (pend) return; pend = true; queueMicrotask(() => { pend = false; try { pinta(); sonda() } catch (e) { if (!vigila.av) { vigila.av = 1; console.warn('retos.js', e) } } }) };
  for (const id of ['top', 'nav']) { const n = document.getElementById(id); if (n) new MutationObserver(vigila).observe(n, { childList: true }) }
  const app = document.getElementById('app'); if (app) new MutationObserver(vigila).observe(app, { attributes: true, attributeFilter: ['hidden'] });
  addEventListener('resize', vigila);
  document.addEventListener('visibilitychange', vigila);

  window.GM_RETOS = { crea, entra, tras, abiertoOK, fueAbierto, pinta, pendientes, confirma, forzar: (v) => { OK = v }, sonda };
})();
