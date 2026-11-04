/* fx.js: efectos y sonido de Gambling Addicts. Modulo ES autonomo, sin ficheros de audio.
   import { sonido, gana, pierde, giro, boton } from './fx.js'
   Tambien queda en window.GMFX para scripts sueltos.
   Todo es seguro si esta en silencio, antes del primer gesto o con prefers-reduced-motion. */

const CLAVE = 'gm_sonido';
const MAESTRO = 0.35;

/* ---------- estado ---------- */
let ctx = null, master = null, ruido = null, desbloqueado = false;
let activo = true;
try { activo = localStorage.getItem(CLAVE) !== '0'; } catch (e) {}

const lang = () => ((document.documentElement.lang || navigator.language || 'es') + '').toLowerCase().startsWith('en') ? 'en' : 'es';
const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const quieto = () => !!(mq && mq.matches);

/* ---------- audio ---------- */
function crearContexto() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 24; comp.ratio.value = 6;
    comp.attack.value = 0.003; comp.release.value = 0.18;
    master = ctx.createGain(); master.gain.value = MAESTRO;
    master.connect(comp); comp.connect(ctx.destination);
    const n = ctx.sampleRate * 2, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    ruido = b;
  } catch (e) { ctx = null; }
  return ctx;
}

function desbloquear() {
  if (!desbloqueado) {
    if (!crearContexto()) return;
    desbloqueado = true;
  }
  try { if (ctx && ctx.state !== 'running') ctx.resume(); } catch (e) {}
}
['pointerdown', 'keydown', 'touchstart'].forEach(ev =>
  window.addEventListener(ev, desbloquear, { capture: true, passive: true }));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && desbloqueado && ctx && ctx.state !== 'running') { try { ctx.resume(); } catch (e) {} }
});

const listo = () => activo && desbloqueado && ctx && ctx.state === 'running' && master;

/* tono: oscilador con envolvente. f1 opcional = glissando exponencial */
function tono(t, tipo, f0, f1, dur, vol, o = {}) {
  const osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = tipo;
  osc.frequency.setValueAtTime(f0, t);
  if (f1 && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const a = o.ataque == null ? 0.004 : o.ataque;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let nodo = osc;
  if (o.filtro) {
    const f = ctx.createBiquadFilter();
    f.type = o.filtro; f.frequency.value = o.fq || 1000; f.Q.value = o.q || 0.7;
    osc.connect(f); nodo = f;
  }
  nodo.connect(g); g.connect(o.destino || master);
  osc.start(t); osc.stop(t + dur + 0.05);
  return g;
}

/* ruido filtrado con barrido de frecuencia */
function soplo(t, dur, vol, tipo, f0, f1, q, o = {}) {
  const src = ctx.createBufferSource(); src.buffer = ruido;
  src.loop = dur > 1.8;
  const f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = tipo; f.Q.value = q || 0.8;
  f.frequency.setValueAtTime(f0, t);
  if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const a = o.ataque == null ? 0.005 : o.ataque, pico = o.pico == null ? a : o.pico;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + Math.max(a, pico));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(o.destino || master);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  return g;
}

const nota = n => 440 * Math.pow(2, (n - 69) / 12);

const SON = {
  tick(t) {
    const j = 1 + (Math.random() - 0.5) * 0.06;
    tono(t, 'triangle', 2100 * j, 1500 * j, 0.035, 0.55);
    soplo(t, 0.02, 0.25, 'highpass', 3500, 3500, 0.7);
  },
  bola(t) {
    /* rebotes cada vez mas juntos y asiento final */
    let x = 0, sep = 0.2, v = 0.5;
    for (let i = 0; i < 6; i++) {
      tono(t + x, 'sine', 1700 - i * 130, 1100 - i * 100, 0.07, v, { ataque: 0.001 });
      soplo(t + x, 0.03, v * 0.3, 'bandpass', 3200, 2400, 3);
      x += sep; sep *= 0.68; v *= 0.78;
    }
    tono(t + x + 0.02, 'sine', 210, 90, 0.18, 0.55);
    soplo(t + x + 0.02, 0.08, 0.2, 'lowpass', 900, 300, 0.8);
  },
  giro(t) {
    soplo(t, 0.7, 0.55, 'bandpass', 250, 2600, 2.2, { ataque: 0.01, pico: 0.28 });
    tono(t, 'sawtooth', 120, 520, 0.6, 0.08, { filtro: 'lowpass', fq: 900, ataque: 0.2 });
  },
  publico(t) {
    /* oleaje de ruido con murmullo */
    const g = soplo(t, 2.2, 0.85, 'bandpass', 500, 1100, 0.6, { ataque: 0.9, pico: 0.9 });
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 9; lg.gain.value = 0.25;
    lfo.connect(lg); lg.connect(g.gain);
    lfo.start(t); lfo.stop(t + 2.3);
    soplo(t + 0.15, 1.9, 0.35, 'highpass', 1800, 2600, 0.5, { ataque: 0.8, pico: 0.8 });
    for (let i = 0; i < 5; i++) {
      const r = Math.random();
      tono(t + 0.5 + i * 0.12, 'sawtooth', 300 + r * 200, 420 + r * 160, 0.4, 0.04,
        { filtro: 'bandpass', fq: 800, q: 1.2, ataque: 0.1 });
    }
  },
  campana(t) {
    const parciales = [1, 2.76, 5.4, 8.93], vols = [0.5, 0.3, 0.16, 0.08], largo = [1.5, 1.1, 0.7, 0.4];
    [0, 0.34].forEach((d, k) => parciales.forEach((p, i) =>
      tono(t + d, 'sine', 880 * p, null, largo[i] * (k ? 1.3 : 1), vols[i] * (k ? 0.85 : 1), { ataque: 0.002 })));
  },
  casilla(t) {
    soplo(t, 0.05, 0.4, 'bandpass', 2400, 1200, 1.5);
    tono(t, 'triangle', 520, 980, 0.1, 0.4);
    tono(t + 0.07, 'sine', 1300, 1300, 0.12, 0.18);
  },
  gema(t) {
    [84, 88, 91, 96, 100].forEach((n, i) => {
      tono(t + i * 0.055, 'triangle', nota(n), null, 0.5, 0.26, { ataque: 0.002 });
      tono(t + i * 0.055, 'sine', nota(n) * 2.01, null, 0.28, 0.1);
    });
    soplo(t, 0.5, 0.06, 'highpass', 6000, 6000, 0.5, { ataque: 0.1 });
  },
  explosion(t) {
    soplo(t, 1.0, 1.0, 'lowpass', 3200, 70, 0.9, { ataque: 0.003 });
    soplo(t, 0.25, 0.7, 'highpass', 1200, 800, 0.7, { ataque: 0.002 });
    tono(t, 'sine', 140, 28, 0.8, 0.9, { ataque: 0.002 });
    tono(t + 0.02, 'sawtooth', 90, 30, 0.5, 0.2, { filtro: 'lowpass', fq: 300 });
  },
  gana(t) {
    [72, 76, 79, 84].forEach((n, i) => {
      tono(t + i * 0.09, 'square', nota(n), null, 0.28, 0.14, { filtro: 'lowpass', fq: 3500 });
      tono(t + i * 0.09, 'triangle', nota(n) * 2, null, 0.3, 0.12);
    });
    [72, 76, 79, 84, 88].forEach(n => tono(t + 0.4, 'triangle', nota(n), null, 0.9, 0.12, { ataque: 0.01 }));
    [96, 100, 103].forEach((n, i) => tono(t + 0.5 + i * 0.07, 'sine', nota(n), null, 0.5, 0.08));
  },
  pierde(t) {
    [67, 63, 60, 55].forEach((n, i) => {
      tono(t + i * 0.16, 'sawtooth', nota(n), nota(n) * 0.96, 0.32, 0.2, { filtro: 'lowpass', fq: 700, ataque: 0.01 });
    });
    tono(t + 0.55, 'sine', 90, 45, 0.5, 0.45);
  },
  /* PM 04-11 (ruleta): "que los sonidos esten mejores" */
  /* ficha de casino: dos golpes secos de arcilla y un cuerpo grave */
  ficha(t) {
    [0, 0.05].forEach((d, i) => {
      soplo(t + d, 0.04, i ? 0.32 : 0.5, 'bandpass', 3600 - i * 500, 2400, 3.5, { ataque: 0.0008 });
      tono(t + d, 'triangle', 2300 - i * 280, 1700 - i * 200, 0.035, i ? 0.12 : 0.18, { ataque: 0.0008 });
    });
    tono(t, 'sine', 380, 240, 0.07, 0.14, { ataque: 0.002 });
  },
  /* la mano lanza la bola: un zumbido corto que sube */
  lanza(t) {
    soplo(t, 0.5, 0.32, 'bandpass', 900, 3400, 1.6, { ataque: 0.02, pico: 0.1 });
    tono(t, 'sine', 700, 1400, 0.28, 0.04, { ataque: 0.01 });
  },
  /* la bola golpea un traste al bajar: clic metalico muy corto */
  traste(t) {
    const j = 1 + (Math.random() - 0.5) * 0.12;
    tono(t, 'sine', 3400 * j, 2700 * j, 0.022, 0.2, { ataque: 0.0006 });
    tono(t, 'triangle', 5200 * j, 4600 * j, 0.012, 0.06, { ataque: 0.0006 });
    soplo(t, 0.014, 0.14, 'highpass', 5200, 5200, 0.7, { ataque: 0.0006 });
  },
  /* la bola cae: rebota en los trastes cada vez mas junto y se mete en la casilla con un golpe seco */
  bolaCae(t) {
    let x = 0, sep = 0.12, v = 0.4;
    for (let i = 0; i < 6; i++) {
      const j = 1 + (Math.random() - 0.5) * 0.1;
      tono(t + x, 'sine', (3000 - i * 150) * j, (2400 - i * 120) * j, 0.03, v, { ataque: 0.0006 });
      soplo(t + x, 0.02, v * 0.42, 'bandpass', 4300, 3100, 3, { ataque: 0.0006 });
      x += sep; sep *= 0.7; v *= 0.8;
    }
    soplo(t + x + 0.01, 0.08, 0.45, 'lowpass', 1500, 380, 0.9, { ataque: 0.001 });
    tono(t + x + 0.01, 'sine', 230, 130, 0.14, 0.4, { ataque: 0.001 });
    tono(t + x + 0.1, 'triangle', 1980, 1900, 0.06, 0.06, { ataque: 0.002 });
  },
  /* monedas que caen (acompana a gana) */
  monedas(t) {
    for (let i = 0; i < 9; i++) {
      const d = 0.05 + i * 0.065 + Math.random() * 0.03, f = 2600 + Math.random() * 1400;
      tono(t + d, 'sine', f, f * 0.995, 0.16, 0.06, { ataque: 0.001 });
      tono(t + d, 'sine', f * 2.76, f * 2.75, 0.07, 0.025, { ataque: 0.001 });
    }
  }
};

/* limite de frecuencia por sonido (ms) para que llamadas rapidas no saturen */
const MIN_MS = { tick: 40, casilla: 60, gema: 90, bola: 150, giro: 200, publico: 600, campana: 300, explosion: 250, gana: 300, pierde: 300,
  ficha: 60, lanza: 300, traste: 45, bolaCae: 400, monedas: 300 };

/* la bola rodando por la pista: ruido filtrado que suena mas fuerte y mas agudo cuanto mas corre. rueda() da { vel(0..1), para() } */
function rueda() {
  const nada = { vel() {}, para() {} };
  if (!listo()) return nada;
  try {
    const src = ctx.createBufferSource(); src.buffer = ruido; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2; bp.frequency.value = 1100;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 380;
    const am = ctx.createGain(); am.gain.value = 0.75;
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 14; lg.gain.value = 0.25;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    lfo.connect(lg); lg.connect(am.gain);
    src.connect(bp); bp.connect(hp); hp.connect(am); am.connect(g); g.connect(master);
    const t0 = ctx.currentTime; src.start(t0, Math.random() * 1.5); lfo.start(t0);
    let vivo = true;
    return {
      vel(v) {
        if (!vivo) return;
        v = Math.max(0, Math.min(1, +v || 0));
        const t = ctx.currentTime;
        g.gain.setTargetAtTime(activo ? 0.015 + 0.34 * v * v : 0.0001, t, 0.07);
        bp.frequency.setTargetAtTime(650 + 2300 * v, t, 0.09);
        lfo.frequency.setTargetAtTime(7 + 30 * v, t, 0.12);
      },
      para(fade = 0.12) {
        if (!vivo) return; vivo = false;
        const t = ctx.currentTime;
        g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0.0001, t, fade / 3);
        try { src.stop(t + fade + 0.1); lfo.stop(t + fade + 0.1); } catch (e) {}
      }
    };
  } catch (e) { return nada; }
}
const ultimo = {};

function galope() {
  const parar = () => {};
  if (!listo()) return parar;
  let vivo = true, prox = ctx.currentTime + 0.02;
  /* patron de galope: tres cascos y un silencio, repetido */
  const patron = [0, 0.1, 0.2];
  const ciclo = 0.52;
  const paso = () => {
    if (!vivo) return;
    if (!listo()) { vivo = false; return; }
    while (prox < ctx.currentTime + 0.25) {
      patron.forEach((d, i) => {
        const t = prox + d, v = i === 2 ? 0.5 : 0.65;
        tono(t, 'sine', 150, 55, 0.09, v, { ataque: 0.001 });
        soplo(t, 0.05, 0.25, 'bandpass', 1500 + i * 150, 900, 2);
      });
      prox += ciclo;
    }
    setTimeout(paso, 40);
  };
  paso();
  return function stop() { vivo = false; };
}

function sonido(nombre) {
  try {
    if (nombre === 'galope') return galope();
    const f = SON[nombre];
    if (!f) return undefined;
    if (!listo()) return undefined;
    const ahora = performance.now(), min = MIN_MS[nombre] || 50;
    if (ultimo[nombre] && ahora - ultimo[nombre] < min) return undefined;
    ultimo[nombre] = ahora;
    f(ctx.currentTime + 0.005);
  } catch (e) { console.warn('fx sonido', nombre, e); }
  return undefined;
}

/* ---------- visuales ---------- */
const fmt = n => {
  if (typeof n === 'string') return n;
  const v = Math.round(Math.abs(Number(n) || 0));
  try { return v.toLocaleString(lang() === 'en' ? 'en-US' : 'es-ES'); } catch (e) { return String(v); }
};

function centro(el) {
  try {
    if (el && el.getBoundingClientRect) {
      const r = el.getBoundingClientRect();
      if (r.width || r.height) return { x: r.left + r.width / 2, y: r.top + r.height / 2, r };
    }
  } catch (e) {}
  return { x: innerWidth / 2, y: innerHeight / 2, r: null };
}

// o.at (opcional): donde sale el numero (+/-), si no debe tapar lo que hay en el centro de o.el. Un elemento o un punto {x, y} de pantalla
function sitio(o, c) {
  const a = o && o.at;
  if (!a) return c;
  if (a.getBoundingClientRect) return centro(a);
  return isFinite(a.x) && isFinite(a.y) ? { x: +a.x, y: +a.y, r: null } : c;
}

function texto(cls, str, c) {
  const d = document.createElement('div');
  d.className = 'fx-pop ' + cls + (quieto() ? ' fx-q' : '');
  d.textContent = str;
  d.style.left = c.x + 'px';
  d.style.top = c.y + 'px';
  d.setAttribute('aria-hidden', 'true');
  document.body.appendChild(d);
  setTimeout(() => d.remove(), quieto() ? 1300 : 1700);
}

/* particulas en un solo canvas compartido; se retira cuando no queda nada */
let cv = null, cx = null, parts = [], raf = 0, dpr = 1;
function lienzo() {
  if (cv) return;
  cv = document.createElement('canvas');
  cv.className = 'fx-canvas';
  cv.setAttribute('aria-hidden', 'true');
  dpr = Math.min(devicePixelRatio || 1, 2);
  cv.width = Math.round(innerWidth * dpr);
  cv.height = Math.round(innerHeight * dpr);
  cx = cv.getContext('2d');
  cx.scale(dpr, dpr);
  document.body.appendChild(cv);
}
function bucle(ts) {
  if (!cv) return;
  const dt = Math.min(0.033, (ts - (bucle.t || ts)) / 1000 || 0.016);
  bucle.t = ts;
  cx.clearRect(0, 0, innerWidth, innerHeight);
  parts = parts.filter(p => p.vida > 0);
  for (const p of parts) {
    p.vida -= dt;
    p.vy += 900 * dt;
    p.vx *= 1 - 0.9 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.rot += p.vr * dt;
    const a = Math.max(0, Math.min(1, p.vida / 0.5));
    cx.globalAlpha = a;
    cx.save();
    cx.translate(p.x, p.y);
    if (p.mon) {
      const sx = Math.cos(p.rot);
      cx.scale(sx, 1);
      cx.beginPath(); cx.arc(0, 0, p.s, 0, 6.2832);
      cx.fillStyle = p.c; cx.fill();
      cx.lineWidth = 1.5; cx.strokeStyle = 'rgba(120,80,0,.7)'; cx.stroke();
      cx.beginPath(); cx.arc(0, 0, p.s * 0.55, 0, 6.2832);
      cx.strokeStyle = 'rgba(255,255,255,.45)'; cx.lineWidth = 1; cx.stroke();
    } else {
      cx.rotate(p.rot);
      cx.fillStyle = p.c;
      cx.fillRect(-p.s, -p.s * 0.45, p.s * 2, p.s * 0.9);
    }
    cx.restore();
  }
  cx.globalAlpha = 1;
  if (parts.length) raf = requestAnimationFrame(bucle);
  else { cv.remove(); cv = cx = null; raf = 0; bucle.t = 0; }
}
function chorro(c, n) {
  lienzo();
  if (!cv) return;
  const oro = ['#f2c14e', '#ffdc85', '#e0a92c'];
  const conf = ['#2bd47d', '#f2c14e', '#4d88e6', '#cc6496', '#a3c93a', '#f4f2ec'];
  for (let i = 0; i < n; i++) {
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, vel = 300 + Math.random() * 520;
    const mon = i % 2 === 0;
    parts.push({
      x: c.x + (Math.random() - 0.5) * 30, y: c.y + (Math.random() - 0.5) * 20,
      vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel,
      vida: 1.3 + Math.random() * 0.4, mon,
      s: mon ? 5 + Math.random() * 4 : 3 + Math.random() * 3,
      c: mon ? oro[i % 3] : conf[i % conf.length],
      rot: Math.random() * 6, vr: (Math.random() - 0.5) * 18
    });
  }
  if (!raf) raf = requestAnimationFrame(bucle);
}

function gana_(importe, o = {}) {
  try {
    const el = o && o.el;
    const c = centro(el);
    texto('fx-gana', '+' + fmt(importe), sitio(o, c));
    if (!quieto()) {
      chorro(c, innerWidth < 600 ? 44 : 70);
      if (el && el.classList) {
        el.classList.remove('fx-brilla'); void el.offsetWidth;
        el.classList.add('fx-brilla');
        setTimeout(() => el.classList.remove('fx-brilla'), 1000);
      }
    }
    sonido('gana');
    sonido('monedas');
  } catch (e) { console.warn('fx gana', e); }
}

function pierde_(importe, o = {}) {
  try {
    const el = o && o.el;
    const c = centro(el);
    texto('fx-pierde', '−' + fmt(importe), sitio(o, c));
    if (!quieto()) {
      const f = document.createElement('div');
      f.className = 'fx-flash';
      f.setAttribute('aria-hidden', 'true');
      if (c.r) {
        f.style.left = c.r.left + 'px'; f.style.top = c.r.top + 'px';
        f.style.width = c.r.width + 'px'; f.style.height = c.r.height + 'px';
        try { f.style.borderRadius = getComputedStyle(el).borderRadius; } catch (e) {}
      } else { f.style.inset = '0'; }
      document.body.appendChild(f);
      setTimeout(() => f.remove(), 750);
      if (el && el.animate) {
        const a = [0, -9, 8, -6, 5, -3, 0].map(x => ({ transform: 'translateX(' + x + 'px)' }));
        try { el.animate(a, { duration: 420, easing: 'ease-out', composite: 'add' }); }
        catch (e) { el.animate(a, { duration: 420, easing: 'ease-out' }); }
      }
    }
    sonido('pierde');
  } catch (e) { console.warn('fx pierde', e); }
}

function giro(el, on) {
  if (!el || !el.classList) return;
  el.classList.toggle('fx-giro', !!on);
}

/* ---------- boton de sonido ---------- */
const botones = new Set();
const ICON_ON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor" stroke="none"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>';
const ICON_OFF = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor" stroke="none"/><path d="M16 9.5l5 5"/><path d="M21 9.5l-5 5"/></svg>';

function pinta(b) {
  const t = lang() === 'en' ? (activo ? 'Sound on' : 'Sound off') : (activo ? 'Sonido activado' : 'Sonido apagado');
  b.innerHTML = activo ? ICON_ON : ICON_OFF;
  b.setAttribute('aria-pressed', activo ? 'true' : 'false');
  b.setAttribute('aria-label', t);
  b.title = t;
  b.classList.toggle('off', !activo);
}
function fijar(v, notificar) {
  activo = !!v;
  try { localStorage.setItem(CLAVE, activo ? '1' : '0'); } catch (e) {}
  botones.forEach(b => b.isConnected ? pinta(b) : botones.delete(b));
  if (notificar) { try { window.dispatchEvent(new CustomEvent('gm-sonido', { detail: activo })); } catch (e) {} }
}
window.addEventListener('storage', e => {
  if (e.key === CLAVE) { activo = e.newValue !== '0'; botones.forEach(pinta); }
});

function boton(container) {
  const host = typeof container === 'string' ? document.querySelector(container) : container;
  if (!host) return null;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'fx-sonido';
  botones.add(b);
  pinta(b);
  b.addEventListener('click', () => {
    desbloquear();
    fijar(!activo, true);
    if (activo) setTimeout(() => sonido('tick'), 30);
  });
  host.appendChild(b);
  return b;
}

const API = {
  sonido, gana: gana_, pierde: pierde_, giro, boton, rueda,
  activo: () => activo,
  silenciar: v => fijar(!v, true)
};
try { window.GMFX = API; } catch (e) {}

export { sonido, gana_ as gana, pierde_ as pierde, giro, boton, rueda };
export const activoSonido = () => activo;
export default API;
