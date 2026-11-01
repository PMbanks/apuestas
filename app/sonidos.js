// Sonidos de Gambling Addicts, sin ficheros de audio: todo se sintetiza con Web Audio, corto y suave.
// Se engancha de dos maneras, sin tocar los otros modulos:
//   1. Eventos: window.dispatchEvent(new CustomEvent('gm:sonido', { detail: 'cobrar' })) (ver SONIDOS-EVENTOS.md).
//   2. El DOM, donde se puede: la ruleta de las cajas (tic y golpe final), el crash (subida y explosion), el aviso de
//      arriba (#toast: cobros y fallos), los resultados de los juegos, los mensajes nuevos del chat y los botones principales.
// El audio no arranca hasta la primera pulsacion o toque (los navegadores no lo dejan antes). El silencio (en Ajustes) se
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
    // PM eligio sus sonidos el 30-10 (pagina de sonidos): botones B, ruleta D, premio B, cobrar A, perder C, crash D, mensaje C, sticker A
    clic: () => nota(600, 0.07, 0.12, { a: 300 }),
    // un tic de la ruleta al pasar cada carta
    'caja-tic': (p) => nota(720, 0.04, 0.14 * (p.vol ?? 1), { a: 420, ataque: 0.002 }),
    // el golpe final: cuanto mas rara, mas notas y brillo
    // el premio: monedas cayendo (mas cuanto mas rara) y una campana
    'caja-final': (p) => {
      const r = ESCALA[p.rareza] ? p.rareza : 'mil', v = p.vol ?? 1, n = { mil: 2, res: 4, cla: 7, cov: 11, esp: 16 }[r];
      for (let i = 0; i < n; i++) nota(2000 + Math.random() * 2000, 0.14, 0.05 * v, { en: i * 0.045, onda: 'triangle', ataque: 0.001 });
      nota(r === 'esp' ? 1568 : 1047, 0.9, (r === 'mil' ? 0.03 : 0.08) * v, { en: n * 0.045 });
    },
    // monedas: dos notas altas seguidas
    cobrar: () => { nota(1319, 0.16, 0.09, { onda: 'square', filtro: 3800, ataque: 0.003 }); nota(1760, 0.34, 0.09, { en: 0.085, onda: 'square', filtro: 4200, ataque: 0.003 }); nota(2637, 0.3, 0.025, { en: 0.085 }) },
    perder: () => { nota(400, 0.5, 0.14, { a: 40 }); barrido(0.25, 0.06, 2000, 200) },
    // el crash: una subida que no se para hasta que explota o se retira
    // el crash: rugido grave que sube (cohete) hasta que explota o se retira
    'crash-sube': () => {
      if (crash) return;
      const t0 = ac.currentTime, g = ac.createGain(), o1 = ac.createOscillator(), fl = ac.createBiquadFilter();
      o1.type = 'sine'; o1.frequency.setValueAtTime(60, t0); o1.frequency.exponentialRampToValueAtTime(260, t0 + 45);
      fl.type = 'lowpass'; fl.frequency.value = 420; o1.connect(fl); fl.connect(g);
      const o2 = ac.createBufferSource(), fn = ac.createBiquadFilter(), gn = ac.createGain();
      o2.buffer = buffer(); o2.loop = true; fn.type = 'lowpass'; fn.frequency.setValueAtTime(300, t0); fn.frequency.exponentialRampToValueAtTime(1600, t0 + 45);
      gn.gain.value = 0.6; o2.connect(fn); fn.connect(gn); gn.connect(g);
      g.connect(maestro); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.06, t0 + 0.4);
      o1.start(t0); o2.start(t0); o1.stop(t0 + 46); o2.stop(t0 + 46);
      crash = { g, o1, o2 };
    },
    'crash-para': () => paraCrash(),
    'crash-boom': (p) => {
      paraCrash(); const v = p.vol ?? 1;
      nota(55, 1.4, 0.4 * v, { a: 25, ataque: 0.004 });
      barrido(1.6, 0.45 * v, 1800, 60, { q: 0.5, ataque: 0.004 });
    },
    chat: () => { nota(1319, 0.5, 0.06); nota(1760, 0.6, 0.05, { en: 0.09 }) },
    // la mesa de blackjack (bjmesa.js): carta que se desliza, fichas que caen y aviso de que te toca
    carta: () => barrido(0.11, 0.07, 3200, 900, { tipo: 'bandpass', q: 1.1, ataque: 0.004 }),
    ficha: () => { nota(2400, 0.05, 0.05, { onda: 'triangle', ataque: 0.001 }); nota(1900, 0.06, 0.04, { en: 0.04, onda: 'triangle', ataque: 0.001 }) },
    turno: () => { nota(880, 0.18, 0.07, { onda: 'triangle' }); nota(1175, 0.3, 0.06, { en: 0.11, onda: 'triangle' }) },
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

  /* ---------- silencio: el interruptor vive en Ajustes (PM 30-10: "lo de mutear el sonido en settings, no fuera") ---------- */
  function silencia(v) {
    mudo = !!v; guarda(CLAVE, mudo ? '0' : '1');
    if (mudo) { paraCrash() }
  }
  function alterna() { const era = mudo; silencia(!mudo); if (era) { desbloquea(); suena('clic') } return !mudo }

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
      for (const n of r.addedNodes) ve(n);
    }
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });


  window.GM_SONIDOS = { suena, silencia, alterna, silenciado: () => mudo };
  revisaChat();       // si el chat ya esta pintado, se anotan sus mensajes para que no suenen como nuevos
})();
