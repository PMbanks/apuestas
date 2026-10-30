// Sonidos de Gambling Addicts, sin ficheros de audio: todo se sintetiza con Web Audio, corto y suave.
// Se engancha de dos maneras, sin tocar los otros modulos:
//   1. Eventos: window.dispatchEvent(new CustomEvent('gm:sonido', { detail: 'cobrar' })) (ver SONIDOS-EVENTOS.md).
//   2. El DOM, donde se puede: la ruleta de las cajas (tic y golpe final), el crash (subida y explosion), el aviso de
//      arriba (#toast: cobros y fallos), los resultados de los juegos, los mensajes nuevos del chat y los botones principales.
// El audio no arranca hasta la primera pulsacion o toque (los navegadores no lo dejan antes). El boton de silencio se
// recuerda. En reposo no hay ningun bucle: solo observadores, y un bucle corto mientras gira una ruleta.
'use strict';
(function () {
  const CLAVE = 'gm-sonido';
  const lee = (k) => { try { return localStorage.getItem(k) } catch { return null } };
  const guarda = (k, v) => { try { localStorage.setItem(k, v) } catch {} };
  let mudo = lee(CLAVE) === '0';
  let ac = null, maestro = null, desbloqueado = false, ruido = null;
  const quieto = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } };

  /* ---------- audio ---------- */
  function contexto() {
    if (ac) return ac;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ac = new AC({ latencyHint: 'interactive' }) } catch { return null }
    maestro = ac.createGain(); maestro.gain.value = 1.6;
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 6;
    maestro.connect(comp); comp.connect(ac.destination);
    return ac;
  }
  function desbloquea() {
    if (desbloqueado) return;
    const c = contexto(); if (!c) return;
    desbloqueado = true;
    for (const e of ['pointerdown', 'keydown', 'touchend']) window.removeEventListener(e, desbloquea, true);
    if (c.state === 'suspended') c.resume().catch(() => {});
  }
  for (const e of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(e, desbloquea, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => { if (ac && document.hidden && ac.state === 'running') ac.suspend().catch(() => {}); else if (ac && !document.hidden && desbloqueado) ac.resume().catch(() => {}) });

  // una nota: onda, frecuencia (o de a), duracion, volumen; ataque corto y caida suave
  function nota(f, dur, vol = 0.1, o = {}) {
    const c = ac, t0 = c.currentTime + (o.en || 0), g = c.createGain(), osc = c.createOscillator();
    osc.type = o.onda || 'sine';
    osc.frequency.setValueAtTime(f, t0);
    if (o.a) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.a), t0 + dur);
    if (o.det) osc.detune.value = o.det;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + (o.ataque || 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let fin = osc;
    if (o.filtro) { const fl = c.createBiquadFilter(); fl.type = o.tipo || 'lowpass'; fl.frequency.value = o.filtro; osc.connect(fl); fin = fl }
    fin.connect(g); g.connect(maestro);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
    return { osc, g };
  }
  function buffer() {
    if (ruido) return ruido;
    const n = ac.sampleRate, b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return (ruido = b);
  }
  // ruido filtrado que barre de una frecuencia a otra (explosiones, brillo del premio gordo)
  function barrido(dur, vol, de, a, o = {}) {
    const c = ac, t0 = c.currentTime + (o.en || 0), s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buffer(); s.loop = true;
    fl.type = o.tipo || 'lowpass'; fl.Q.value = o.q || 0.8;
    fl.frequency.setValueAtTime(de, t0); fl.frequency.exponentialRampToValueAtTime(Math.max(30, a), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + (o.ataque || 0.01)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(fl); fl.connect(g); g.connect(maestro);
    s.start(t0); s.stop(t0 + dur + 0.05);
  }

  /* ---------- los sonidos ---------- */
  const ESCALA = { mil: [392, 523], res: [440, 587, 740], cla: [494, 659, 784, 988], cov: [523, 659, 784, 1047, 1319], esp: [523, 659, 784, 1047, 1319, 1568] };
  const S = {
    clic: () => nota(900, 0.05, 0.09, { onda: 'triangle', a: 640 }),
    // un tic de la ruleta al pasar cada carta
    'caja-tic': (p) => nota(1500 + Math.random() * 120, 0.028, 0.11 * (p.vol ?? 1), { onda: 'triangle', a: 900, ataque: 0.002 }),
    // el golpe final: cuanto mas rara, mas notas y brillo
    'caja-final': (p) => {
      const r = ESCALA[p.rareza] ? p.rareza : 'mil', fa = ESCALA[r], v = p.vol ?? 1;
      nota(150, 0.22, 0.2 * v, { a: 50, ataque: 0.004 });
      nota(75, 0.3, 0.14 * v, { ataque: 0.004 });
      fa.forEach((f, i) => { nota(f, r === 'mil' ? 0.2 : 0.55, (r === 'mil' ? 0.05 : 0.07) * v, { en: 0.05 + i * (r === 'esp' ? 0.075 : 0.09), onda: 'triangle', filtro: 5200 }); if (r === 'esp' || r === 'cov') nota(f * 2, 0.45, 0.025 * v, { en: 0.05 + i * 0.075 }) });
      if (r === 'cla' || r === 'cov') barrido(0.5, 0.025 * v, 2500, 9000, { tipo: 'highpass', en: 0.1 });
      if (r === 'esp') { barrido(1.1, 0.05 * v, 1800, 11000, { tipo: 'bandpass', q: 1.4, en: 0.1 }); nota(1568, 0.9, 0.05 * v, { en: 0.5, onda: 'sine' }) }
    },
    // monedas: dos notas altas seguidas
    cobrar: () => { nota(1319, 0.16, 0.09, { onda: 'square', filtro: 3800, ataque: 0.003 }); nota(1760, 0.34, 0.09, { en: 0.085, onda: 'square', filtro: 4200, ataque: 0.003 }); nota(2637, 0.3, 0.025, { en: 0.085 }) },
    perder: () => { nota(330, 0.26, 0.11, { onda: 'sawtooth', a: 300, filtro: 900 }); nota(247, 0.42, 0.11, { en: 0.2, onda: 'sawtooth', a: 165, filtro: 700 }) },
    // el crash: una subida que no se para hasta que explota o se retira
    'crash-sube': () => {
      if (crash) return;
      const t0 = ac.currentTime, g = ac.createGain(), o1 = ac.createOscillator(), o2 = ac.createOscillator(), fl = ac.createBiquadFilter();
      o1.type = 'triangle'; o2.type = 'sine'; o2.detune.value = 7;
      for (const o of [o1, o2]) { o.frequency.setValueAtTime(190, t0); o.frequency.exponentialRampToValueAtTime(1500, t0 + 45) }
      fl.type = 'lowpass'; fl.frequency.value = 2400;
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.03, t0 + 0.4);
      o1.connect(fl); o2.connect(fl); fl.connect(g); g.connect(maestro);
      o1.start(t0); o2.start(t0); o1.stop(t0 + 46); o2.stop(t0 + 46);
      crash = { g, o1, o2 };
    },
    'crash-para': () => paraCrash(),
    'crash-boom': (p) => {
      paraCrash(); const v = p.vol ?? 1;
      barrido(0.9, 0.5 * v, 3200, 80, { q: 0.6, ataque: 0.004 });
      nota(130, 0.5, 0.3 * v, { a: 28, ataque: 0.004 });
      nota(60, 0.7, 0.2 * v, { a: 30, ataque: 0.004 });
    },
    chat: () => { nota(520, 0.13, 0.12, { a: 780, ataque: 0.005 }); nota(1040, 0.1, 0.04, { en: 0.03, a: 1560 }) },
    sticker: () => { nota(380, 0.09, 0.12, { a: 640, onda: 'triangle', ataque: 0.004 }); nota(760, 0.12, 0.09, { en: 0.07, a: 1100, onda: 'triangle' }) },
  };
  let crash = null;
  function paraCrash() {
    if (!crash) return;
    const c = crash, t = ac.currentTime; crash = null;
    try { c.g.gain.cancelScheduledValues(t); c.g.gain.setValueAtTime(Math.max(0.0002, c.g.gain.value), t); c.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12); c.o1.stop(t + 0.15); c.o2.stop(t + 0.15) } catch {}
  }
  const ultimo = {};
  function suena(tipo, p = {}) {
    if (typeof tipo === 'object' && tipo) { p = tipo; tipo = tipo.tipo }
    if (mudo || !desbloqueado || !S[tipo]) return;
    const c = contexto(); if (!c) return;
    if (c.state === 'suspended') c.resume().catch(() => {});
    // el mismo sonido no se repite en menos de 25 ms (un repintado no debe sonar dos veces)
    const t = performance.now(); if (t - (ultimo[tipo] || 0) < 25 && tipo !== 'caja-tic') return; ultimo[tipo] = t;
    if (window.__gmSonidoLog) window.__gmSonidoLog.push(tipo);       // gancho de pruebas: si la pagina de prueba pone esta lista, aqui se anota lo que suena
    try { S[tipo](p) } catch (err) { suena.error = err }
  }
  window.addEventListener('gm:sonido', (e) => suena(e.detail));

  /* ---------- botones principales: un clic suave ---------- */
  const PRINCIPALES = '.go, .go-s, .send, .cj-go, .nv, .chip, [data-go]';
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest(PRINCIPALES);
    if (b && !b.disabled) suena('clic');
  }, true);

  /* ---------- boton de silencio, en la cabecera ---------- */
  const SVG_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/></svg>';
  const SVG_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';
  let boton = null;
  function pintaBoton() {
    if (!boton) return;
    boton.innerHTML = mudo ? SVG_OFF : SVG_ON;
    boton.setAttribute('aria-label', mudo ? 'Activar sonidos' : 'Silenciar sonidos');
    boton.title = mudo ? 'Activar sonidos' : 'Silenciar sonidos';
    boton.classList.toggle('off', mudo);
    if (window.GM_LANG) GM_LANG.traduce(boton);
  }
  function silencia(v) {
    mudo = !!v; guarda(CLAVE, mudo ? '0' : '1');
    if (mudo) { paraCrash() }
    pintaBoton();
  }
  function cuelga() {
    const top = document.getElementById('top'); if (!top) return;
    if (!boton) {
      boton = document.createElement('button'); boton.type = 'button'; boton.className = 'sn-mute';
      boton.addEventListener('click', (e) => { e.stopPropagation(); const era = mudo; silencia(!mudo); if (era) { desbloquea(); suena('clic') } });
      pintaBoton();
    }
    if (boton.parentNode !== top) top.appendChild(boton);
  }

  /* ---------- la ruleta de las cajas: un tic por carta y el golpe final ---------- */
  const COLOR_RAREZA = { '#e4ae39': 'esp', '#eb4b4b': 'cov', '#d32ce6': 'cla', '#8847ff': 'res', '#4b69ff': 'mil' };
  const ORDEN = ['mil', 'res', 'cla', 'cov', 'esp'];
  const rarezaDe = (k) => (!k ? 'mil' : k.classList.contains('esp') ? 'esp' : COLOR_RAREZA[(k.style.getPropertyValue('--c') || '').trim().toLowerCase()] || 'mil');
  const siguiendo = new WeakSet();
  function siguePista(escena) {
    const pistas = [...escena.querySelectorAll('.cj-track')];
    if (!pistas.length || siguiendo.has(escena)) return;
    siguiendo.add(escena);
    const pista = pistas[0], tira = pista.parentElement, ya = pista.children;
    if (ya.length < 3) return;
    const paso = ya[1].offsetLeft - ya[0].offsetLeft || 1, w = tira.clientWidth;
    let idx = -1, ultimoTic = 0, activo = true;
    const fin = Promise.all(pistas.flatMap((p) => p.getAnimations().map((a) => a.finished.catch(() => {}))));
    fin.then(() => {
      activo = false;
      // el mejor premio de las filas (G = 46 en cajas.js: la carta que gana)
      let mejor = 0; for (const p of pistas) { const k = p.children[46] || p.children[p.children.length - 8]; mejor = Math.max(mejor, ORDEN.indexOf(rarezaDe(k))) }
      suena('caja-final', { rareza: ORDEN[mejor] });
    });
    if (quieto()) return;
    (function marco() {
      if (!activo || !pista.isConnected) return;
      const m = getComputedStyle(pista).transform, tx = m && m !== 'none' ? new DOMMatrix(m).m41 : 0, i = Math.floor((-tx + w / 2) / paso);
      if (i !== idx) { const t = performance.now(); idx = i; if (t - ultimoTic > 32) { ultimoTic = t; suena('caja-tic') } }
      requestAnimationFrame(marco);
    })();
  }

  /* ---------- crash: la subida, el cobro y la explosion ---------- */
  let multEl = null, multClase = '', multT = 0;
  function revisaMult(el) {
    const c = el.className, seguido = el === multEl || performance.now() - multT < 800;     // la app repinta el nodo: si no pasa de 0,8 s es el mismo cohete
    multEl = el; multT = performance.now();
    if (!seguido) { multClase = c; return }                           // lo primero que se ve no suena: solo los cambios
    if (c === multClase) return;
    multClase = c;
    const sub = () => (document.querySelector('[data-sub]')?.textContent || '');
    if (/\bon\b/.test(c)) setTimeout(() => { if (/Retira/.test(sub())) suena('crash-sube') }, 70);
    else if (/\bboom\b/.test(c)) setTimeout(() => { const dentro = /perdiste|cobraste/.test(sub()); suena('crash-boom', { vol: dentro ? 1 : 0.35 }); if (/perdiste/.test(sub())) suena('perder') }, 60);
    else paraCrash();
  }

  /* ---------- el aviso de arriba y los resultados de los juegos ---------- */
  let ultToast = '';
  function revisaToast(t) {
    const x = t.textContent.trim(); if (!x || x === ultToast) return; ultToast = x; setTimeout(() => { if (ultToast === x) ultToast = '' }, 3000);
    if (/^Retirado a/.test(x)) { paraCrash(); suena('cobrar') }
    else if (/^Tarde/.test(x)) { paraCrash(); suena('perder') }
    else if (/^¡?Ganada|^Has ganado|^Ruleta:|^Rescate|^\+\d|del premio diario|por tu tiempo|^Vendid/.test(x)) suena('cobrar');
  }
  let ultRes = '';
  function revisaResultado(el) {
    const c = el.classList, win = c.contains('win'), lose = c.contains('lose');
    if (!win && !lose) { ultRes = ''; return }
    const clave = (win ? 'w' : 'l') + '|' + el.textContent.trim(); if (clave === ultRes) return; ultRes = clave;
    suena(win ? 'cobrar' : 'perder');
  }

  /* ---------- chat: un mensaje nuevo de otro suena ---------- */
  let vistos = null;
  const claveMsg = (m) => (m.querySelector('.nm')?.textContent || '') + '|' + (m.querySelector('time')?.textContent || '') + '|' + (m.querySelector('p')?.textContent || (m.textContent || '').slice(0, 80));
  function revisaChat() {
    const lista = document.querySelector('[data-chat]'); if (!lista) return;
    const msgs = [...lista.querySelectorAll('.msg')], claves = msgs.map(claveMsg);
    if (!vistos) { vistos = new Set(claves); return }                   // la primera vez que se ve el chat no suena
    const ultimo = msgs[msgs.length - 1], k = claves[claves.length - 1];
    const nuevo = ultimo && !vistos.has(k);
    const yo = (document.querySelector('.rail-me b')?.textContent || '').trim();
    claves.forEach((c) => vistos.add(c));
    if (vistos.size > 400) vistos = new Set(claves);
    if (nuevo && (ultimo.querySelector('.nm')?.textContent || '').trim() !== yo) suena(/^\[sticker:/.test(ultimo.querySelector('p')?.textContent || '') ? 'sticker' : 'chat');
  }

  /* ---------- un solo observador, barato: solo mira lo que se anade y las clases ---------- */
  let pendienteChat = false;
  function programaChat() { if (pendienteChat) return; pendienteChat = true; requestAnimationFrame(() => { pendienteChat = false; revisaChat() }) }
  function ve(n) {
    if (n.nodeType !== 1) return;
    if (n.matches('.cj-spin') || n.querySelector('.cj-spin')) { const e = n.matches('.cj-spin') ? n : n.querySelector('.cj-spin'); setTimeout(() => siguePista(e), 30) }
    if (n.matches('[data-mult]') || n.querySelector('[data-mult]')) revisaMult(n.matches('[data-mult]') ? n : n.querySelector('[data-mult]'));
    if (n.matches('.msg, [data-chat]') || n.querySelector('.msg, [data-chat]')) programaChat();
    if (n.matches('.jg-res, .jg-msg') || n.querySelector('.jg-res, .jg-msg')) for (const r of (n.matches('.jg-res, .jg-msg') ? [n] : n.querySelectorAll('.jg-res, .jg-msg'))) revisaResultado(r);
    if (n.id === 'top' || n.querySelector('#top')) cuelga();
  }
  new MutationObserver((rs) => {
    for (const r of rs) {
      if (r.type === 'attributes') {
        const t = r.target;
        if (t.matches('[data-mult]')) revisaMult(t);
        else if (t.matches('.jg-res, .jg-msg')) revisaResultado(t);
        continue;
      }
      if (r.target.id === 'toast') { revisaToast(r.target); continue }
      if (r.target.hasAttribute && r.target.hasAttribute('data-mult')) { multT = performance.now(); continue }
      if (r.target.id === 'top') cuelga();
      for (const n of r.addedNodes) ve(n);
    }
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  const css = document.createElement('style');
  css.textContent = `
.sn-mute{flex:none;display:grid;place-items:center;width:34px;height:34px;margin-left:12px;border-radius:50%;color:var(--mute);transition:color .15s,background .15s}
.sn-mute:hover{color:var(--ink);background:rgba(255,255,255,.06)}
.sn-mute.off{color:var(--dim)}
.sn-mute svg{width:20px;height:20px}
@media (max-width:860px){.sn-mute{margin-left:4px;width:32px;height:32px}}`;
  document.head.appendChild(css);

  window.GM_SONIDOS = { suena, silencia, silenciado: () => mudo };
  cuelga(); revisaChat();       // si el chat ya esta pintado, se anotan sus mensajes para que no suenen como nuevos
})();
