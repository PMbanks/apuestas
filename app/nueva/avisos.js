// Avisos en tu movil (PM, 02-11: "podemos hacer que lleguen notificaciones, por ejemplo: alguien te ha challengeado a X?").
// Web push de la propia app: llegan con la app CERRADA, gratis, en Android y en iPhone (en iPhone solo con la app instalada en la pantalla de inicio).
// Ajustes > Avisos en tu movil: Activar avisos (pide el permiso SOLO al pulsar, registra sw.js, suscribe con la clave VAPID de config.js y apunta el
// aparato en la base con push_alta), el estado (activados / bloqueados / no disponibles), un interruptor por tipo (push_tipos), Desactivar en este
// aparato (push_baja + unsubscribe) y Probar aviso (push_prueba: un aviso a ti mismo, uno por minuto). Debajo, Instalar la app: el aviso de instalacion
// de Android/Chrome con un toque (beforeinstallprompt) o los pasos de cada aparato.
// Quien envia es el sincronizador (sync/push.mjs) leyendo la cola de avisos que llenan los triggers de db/060_push.sql.
// Si la base aun no tiene db/060 (push_estado o push_alta fallan) la seccion lo dice amablemente y no rompe nada.
// Al tocar un aviso, sw.js abre o enfoca la app y este modulo lleva a la pantalla del aviso (mensaje del service worker o ?aviso=pantalla al abrir).
// Va aparte, como alarmas.js: usa lo global de app.js (db, ME, S, render, toast, errMsg) y expone GM_AVISOS.seccion() para Ajustes.
'use strict';
(function () {
  const g = (f, d) => { try { return f() } catch { return d } };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tr = (el) => { if (window.GM_LANG) GM_LANG.traduce(el) };
  const DB = () => (typeof db !== 'undefined' && db && db.rpc ? db : null);
  const yo = () => g(() => ME, '') || '';
  const lang = () => g(() => GM_LANG.get(), 'es') === 'en' ? 'en' : 'es';
  const avisa = (m) => g(() => toast(m));
  const VAPID = g(() => window.APP_CONFIG.vapid, '') || '';
  const PANTALLAS = ['inicio', 'partidos', 'apuestas', 'colegas', 'liga', 'directo', 'cajas', 'chat', 'monedero', 'juegos', 'ajustes', 'novedades'];

  /* ---------- el aparato ---------- */
  const UA = g(() => navigator.userAgent, '') || '';
  const IOS = /iPad|iPhone|iPod/.test(UA) || (g(() => navigator.platform, '') === 'MacIntel' && g(() => navigator.maxTouchPoints, 0) > 1);
  const ANDROID = /Android/i.test(UA);
  const instalada = () => g(() => matchMedia('(display-mode: standalone)').matches, false) || g(() => navigator.standalone, false) === true;
  const SOPORTA = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const aparato = () => {
    const so = IOS ? 'iPhone' : ANDROID ? 'Android' : /Windows/.test(UA) ? 'Windows' : /Mac/.test(UA) ? 'Mac' : /Linux/.test(UA) ? 'Linux' : 'otro';
    const nav = /Edg\//.test(UA) ? 'Edge' : /Firefox|FxiOS/.test(UA) ? 'Firefox' : /Chrome|CriOS/.test(UA) ? 'Chrome' : /Safari/.test(UA) ? 'Safari' : 'navegador';
    return `${nav} en ${so}${instalada() ? ' (app instalada)' : ''}`;
  };

  /* ---------- tipos de aviso ---------- */
  const TIPOS = [
    ['retos', 'Retos', 'Te retan, entran en tu reto, te lo aceptan o se resuelve'],
    ['apuestas', 'Apuestas', 'Una apuesta tuya o una combinada se resuelve'],
    ['ranking', 'Ranking', 'Te quitan el puesto 1 del ranking de ratio'],
    ['paga', 'Paga y premios', 'La paga del lunes, el bote, los premios de la semana y la ruleta global'],
    ['chat', 'Chat', 'Alguien te menciona con @tunombre'],
  ];
  const TODOS = { retos: true, apuestas: true, ranking: true, paga: true, chat: true };

  /* ---------- estado (lo que ve Ajustes) ---------- */
  // fase: cargando | activo | apagado | bloqueado | nodisp | sinbase
  const E = { fase: 'cargando', tipos: { ...TODOS }, aparatos: 0, busy: '', cargando: false, t: 0, uid: '', sub: null };
  let DP = null;                // el aviso de instalacion de Chrome, guardado hasta que se pulse Instalar la app
  let INST = instalada();
  const faltaFuncion = (er) => /push_(alta|baja|tipos|estado|prueba)|schema cache|Could not find|does not exist|PGRST202/i.test((er && er.message) || '') && !/entrar/i.test((er && er.message) || '');

  const u8 = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, (c) => c.charCodeAt(0)) };
  const igual = (a, b) => { if (!a || !b || a.byteLength !== b.byteLength) return false; const x = new Uint8Array(a), y = new Uint8Array(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false; return true };

  async function registro(registra) {
    if (!SOPORTA) return null;
    let r = await navigator.serviceWorker.getRegistration();
    if (!r && registra) r = await navigator.serviceWorker.register('sw.js', { scope: './' });
    if (r && !r.active) await navigator.serviceWorker.ready;
    return r;
  }

  // apunta (o vuelve a apuntar) este aparato en la base
  async function alta(sub) {
    const d = DB(); if (!d || !sub) return { error: { message: 'sin sesion' } };
    const j = sub.toJSON(), k = (j && j.keys) || {};
    const r = await d.rpc('push_alta', { p_endpoint: sub.endpoint, p_p256dh: k.p256dh || '', p_auth: k.auth || '', p_ua: aparato(), p_lang: lang() });
    if (!r.error) g(() => localStorage.setItem('gm-avisos-sync', JSON.stringify({ u: yo(), e: sub.endpoint, l: lang(), t: Date.now() })));
    return r;
  }

  /* ---------- mirar como esta todo ---------- */
  async function refresca() {
    if (E.cargando) return;
    if (E.uid !== yo()) { E.uid = yo(); E.fase = 'cargando'; E.sub = null; E.tipos = { ...TODOS }; E.aparatos = 0 }
    E.cargando = true;
    try {
      if (!SOPORTA) { E.fase = 'nodisp'; return }
      if (!VAPID) { E.fase = 'sinbase'; return }
      if (Notification.permission === 'denied') { E.fase = 'bloqueado'; return }
      const reg = await registro(false), sub = reg ? await reg.pushManager.getSubscription() : null;
      E.sub = sub;
      if (!sub || Notification.permission !== 'granted') { E.fase = 'apagado'; return }
      const d = DB(); if (!d || !yo()) { E.fase = 'apagado'; return }
      let { data, error } = await d.rpc('push_estado', { p_endpoint: sub.endpoint });
      if (error) { if (faltaFuncion(error)) E.fase = 'sinbase'; else if (E.fase === 'cargando') E.fase = 'apagado'; return }
      // el navegador lo tiene pero la base no (se borro, otra cuenta...) o ha cambiado el idioma: se vuelve a apuntar sin molestar
      const ult = g(() => JSON.parse(localStorage.getItem('gm-avisos-sync') || 'null'), null);
      if (!data.aparato || !ult || ult.u !== yo() || ult.e !== sub.endpoint || ult.l !== lang()) {
        const a = await alta(sub);
        if (a.error) { E.fase = faltaFuncion(a.error) ? 'sinbase' : 'apagado'; return }
        ({ data, error } = await d.rpc('push_estado', { p_endpoint: sub.endpoint }));
        if (error) return;
      }
      E.fase = 'activo'; E.tipos = { ...TODOS, ...(data.tipos || {}) }; E.aparatos = +data.aparatos || 1;
    } catch (e) {
      if (E.fase === 'cargando') E.fase = SOPORTA ? 'apagado' : 'nodisp';
    } finally { E.cargando = false; E.t = Date.now(); pinta() }
  }

  /* ---------- acciones ---------- */
  async function activa() {
    if (E.busy || !SOPORTA) return;
    if (!VAPID) { E.fase = 'sinbase'; return pinta() }
    E.busy = 'on'; pinta();
    try {
      const perm = await Notification.requestPermission();            // el permiso se pide aqui, solo al pulsar
      if (perm !== 'granted') { avisa(perm === 'denied' ? 'El navegador ha bloqueado los avisos' : 'No has dado el permiso'); return }
      const reg = await registro(true);
      let sub = await reg.pushManager.getSubscription();
      if (sub && !igual(sub.options && sub.options.applicationServerKey, u8(VAPID))) { await sub.unsubscribe(); sub = null }
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: u8(VAPID) });
      const r = await alta(sub);
      if (r.error) { if (faltaFuncion(r.error)) E.fase = 'sinbase'; else avisa(errMsg(r.error)); return }
      avisa('Avisos activados en este aparato');
    } catch (e) {
      avisa('No se han podido activar los avisos en este aparato');
    } finally { E.busy = ''; await refresca() }
  }
  async function apaga() {
    if (E.busy) return;
    E.busy = 'off'; pinta();
    try {
      const reg = await registro(false), sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        const ep = sub.endpoint;
        await sub.unsubscribe();
        const d = DB(); if (d) await d.rpc('push_baja', { p_endpoint: ep });
      }
      g(() => localStorage.removeItem('gm-avisos-sync'));
      avisa('Avisos desactivados en este aparato');
    } catch (e) { avisa('No se han podido desactivar los avisos') }
    finally { E.busy = ''; await refresca() }
  }
  async function tipo(k) {
    const d = DB(); if (!d || !(k in TODOS)) return;
    const nuevo = !E.tipos[k], antes = { ...E.tipos };
    E.tipos[k] = nuevo; pinta();
    const { error } = await d.rpc('push_tipos', { p_tipos: { [k]: nuevo } });
    if (error) { E.tipos = antes; avisa(errMsg(error)); pinta() }
  }
  async function prueba() {
    const d = DB(); if (!d || E.busy) return;
    E.busy = 'test'; pinta();
    const { error } = await d.rpc('push_prueba');
    E.busy = ''; pinta();
    if (error) return avisa(errMsg(error));
    avisa('Aviso de prueba enviado. Llega en unos segundos');
  }
  async function instala() {
    if (DP) {
      const p = DP; DP = null;
      try { p.prompt(); const r = await p.userChoice; if (r && r.outcome === 'accepted') INST = true } catch {}
      return pinta();
    }
    avisa('Sigue los pasos de tu aparato');
    const el = document.getElementById('avs-pasos'); if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); g(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' })) }
  }

  /* ---------- Ajustes ---------- */
  function estadoHtml() {
    const f = E.fase;
    const txt = {
      cargando: 'Mirando…',
      activo: 'Activados en este aparato',
      apagado: 'Desactivados en este aparato',
      bloqueado: 'Bloqueados en el navegador',
      nodisp: 'No disponibles en este aparato',
      sinbase: 'Todavía no están listos en el servidor',
    }[f];
    const nota = {
      bloqueado: 'Cambia el permiso de notificaciones de esta web en los ajustes del navegador y vuelve aquí.',
      nodisp: IOS && !instalada() ? 'En iPhone solo funcionan con la app abierta desde la pantalla de inicio.' : 'Este navegador no sabe recibir avisos con la app cerrada. Prueba con Chrome, Edge o Firefox.',
      sinbase: 'Es cosa nuestra, no tuya. Prueba otra vez dentro de un rato.',
      activo: E.aparatos > 1 ? `Tienes ${E.aparatos} aparatos con avisos.` : '',
    }[f] || '';
    const cls = f === 'activo' ? 'on' : f === 'bloqueado' || f === 'sinbase' ? 'bad' : '';
    return `<p class="avs-st ${cls}"><i></i><b>${txt}</b></p>${nota ? `<p class="aj-n avs-nota">${nota}</p>` : ''}`;
  }
  function accionesHtml() {
    const f = E.fase, b = E.busy;
    let h = '';
    if (f === 'apagado') h += `<button type="button" class="avs-go" data-avs="on" ${b ? 'disabled' : ''}>${b === 'on' ? 'Activando…' : 'Activar avisos'}</button>`;
    if (f === 'activo') h += `<button type="button" class="avs-go" data-avs="test" ${b ? 'disabled' : ''}>${b === 'test' ? 'Enviando…' : 'Probar aviso'}</button><button type="button" class="aj-a q" data-avs="off" ${b ? 'disabled' : ''}>${b === 'off' ? 'Desactivando…' : 'Desactivar en este aparato'}</button>`;
    if (f === 'bloqueado' || f === 'sinbase') h += `<button type="button" class="aj-a" data-avs="again">Volver a mirar</button>`;
    if (f === 'nodisp' && !IOS && !SOPORTA && window.Notification && Notification.permission === 'default') h += `<button type="button" class="aj-a" data-act="notif">Activar avisos con la app abierta</button>`;
    return h ? `<div class="avs-ac">${h}</div>` : '';
  }
  function tiposHtml() {
    if (E.fase !== 'activo') return '';
    return `<div class="avs-ti"><h4 class="lab">Qué quieres que te avise</h4>${TIPOS.map(([k, n, s]) => {
      const on = E.tipos[k] !== false;
      return `<button type="button" class="aj-f anim-t ${on ? 'on' : ''}" data-avs="t|${k}" aria-pressed="${on}"><span class="aj-tx"><b>${n}</b><small>${s}</small></span><i></i></button>`;
    }).join('')}</div>`;
  }
  function pasosHtml() {
    const pasos = [
      ['android', 'Android, Chrome', 'Abre el menú de los tres puntos y toca Instalar app', ANDROID],
      ['ios', 'iPhone, Safari', 'Toca Compartir y luego Añadir a pantalla de inicio', IOS],
      ['pc', 'PC, Chrome o Edge', 'Pulsa el icono de instalar que sale a la derecha de la barra de direcciones', !ANDROID && !IOS],
    ];
    pasos.sort((a, b) => (b[3] ? 1 : 0) - (a[3] ? 1 : 0));
    return `<div class="avs-pasos" id="avs-pasos">${pasos.map(([k, n, t, mio]) => `<div class="avs-p ${mio ? 'mio' : ''}"><span class="avs-pn"><b>${n}</b>${mio ? '<em>Tu aparato</em>' : ''}</span><span class="avs-pt">${t}</span></div>`).join('')}</div>`;
  }
  function instalarHtml() {
    const hecha = INST || instalada();
    return `<section class="aj-s avs" id="avs-inst"><h3 class="lab">Instalar la app</h3>
      <p class="aj-n">Instalada se abre como cualquier otra, a pantalla completa. En iPhone hace falta para recibir avisos.</p>
      ${hecha ? '<p class="avs-st on"><i></i><b>Ya está instalada en este aparato</b></p>'
        : `<div class="avs-ac"><button type="button" class="avs-go" data-avs="inst">Instalar la app</button></div>
           ${DP ? '<p class="aj-n avs-nota">Tu navegador puede instalarla con un toque.</p>' : ''}${pasosHtml()}`}
    </section>`;
  }
  function avisosHtml() {
    return `<section class="aj-s avs" id="avs"><h3 class="lab">Avisos en tu móvil</h3>
      <p class="aj-n">Te avisamos con la app cerrada: cuando te retan, cuando entra alguien en tu reto, cuando se resuelve una apuesta tuya y poco más.</p>
      ${IOS && !instalada() ? '<p class="avs-ios">En iPhone, primero instala la app: Compartir, Añadir a pantalla de inicio</p>' : ''}
      ${estadoHtml()}${accionesHtml()}${tiposHtml()}</section>`;
  }
  function seccion() {
    if (E.uid !== yo() || (!E.cargando && Date.now() - E.t > 60000)) setTimeout(refresca, 0);
    return avisosHtml() + instalarHtml();
  }
  function pinta() {
    for (const [id, f] of [['avs', avisosHtml], ['avs-inst', instalarHtml]]) {
      const el = document.getElementById(id); if (!el) continue;
      const t = document.createElement('div'); t.innerHTML = f(); const n = t.firstElementChild; if (!n) continue;
      el.replaceWith(n); tr(n);
    }
  }

  /* ---------- clics ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('[data-avs]'); if (!t) return;
    e.stopPropagation(); e.preventDefault();
    const [k, v] = t.dataset.avs.split('|');
    if (k === 'on') activa(); else if (k === 'off') apaga(); else if (k === 't') tipo(v);
    else if (k === 'test') prueba(); else if (k === 'inst') instala(); else if (k === 'again') { E.fase = 'cargando'; pinta(); refresca() }
  }, true);

  /* ---------- el aviso de instalacion de Chrome ---------- */
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); DP = e; pinta() });
  window.addEventListener('appinstalled', () => { DP = null; INST = true; pinta() });

  /* ---------- tocar un aviso: llevar a su pantalla ---------- */
  function ir(p) {
    if (!PANTALLAS.includes(p)) p = 'inicio';
    g(() => { S.scr = p; S.sheet = false; S.nvp = false; document.getElementById('view').scrollTop = 0; render() });
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', (ev) => { if (ev.data && ev.data.gmAviso) ir(String(ev.data.gmAviso)) });
  const pedido = g(() => new URLSearchParams(location.search).get('aviso'), null);
  if (pedido) {
    let n = 0;
    const t = setInterval(() => {
      const ap = document.getElementById('app');
      if ((ap && !ap.hidden && typeof S !== 'undefined' && g(() => ME, null)) || ++n > 80) {
        clearInterval(t);
        g(() => history.replaceState(null, '', location.pathname + location.hash));
        if (n <= 80) ir(pedido);
      }
    }, 250);
  }

  /* ---------- al abrir la app ---------- */
  // si ya diste permiso: el service worker queda registrado (tambien lo usan las alarmas en Android) y el aparato se comprueba sin molestar
  if (SOPORTA && g(() => Notification.permission, '') === 'granted') {
    g(() => navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {}));
    setTimeout(() => { if (yo()) refresca() }, 6000);
  }

  window.GM_AVISOS = { seccion, refresca, estado: () => ({ ...E, soporta: SOPORTA, ios: IOS, android: ANDROID, instalada: instalada() }) };
})();
