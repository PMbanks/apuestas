// Ruleta global de la semana (PM, 01-11): "habra una ruleta semanal global y mas grande que saldra las fotos de todos y le
// tocara a alguien random 1000 monedas cada semana"; "la primera vez que abra alguien esa ruleta le saldra la animacion de la
// ruleta y a quien le toca, y ya esta, la animacion no saldra mas de 1 vez por semana".
// El sorteo lo hace la base cada lunes (db/047: ruleta_global_sortea, dentro de bote_semanal en sync_close). Aqui solo se lee
// con ruleta_global() y se pinta: una rueda grande con la foto (o las iniciales con su color) de cada uno en su gajo, que gira
// y para en el ganador con su nombre y +1.000. Sale sola la primera vez que abres la app (o entras en Inicio o la Liga) en una
// semana con sorteo hecho, una vez por jugador y semana (gm-ruleta-global-vista:<jugador>:<semana>), se cierra cuando quieras
// y se vuelve a ver desde Recompensas. Con Animaciones apagadas sale ya parada en el ganador. Usa lo global de app.js
// (db, F, ME, S, av, N, coin, esc, confeti, render) y los sonidos de sonidos.js.
'use strict';
(function () {
  const g = (f, d) => { try { return f() } catch { return d } };
  const lee = (k) => { try { return localStorage.getItem(k) } catch { return null } };
  const guarda = (k, v) => { try { localStorage.setItem(k, v) } catch {} };
  const T = (es, en_) => (g(() => en(), false) ? en_ : es);
  const traduce = (el) => { if (window.GM_LANG && el) g(() => GM_LANG.traduce(el)) };
  const suena = (t, p) => { if (window.GM_SONIDOS) g(() => GM_SONIDOS.suena(t, p)) };
  const sinAnim = () => document.documentElement.classList.contains('sin-anim') || g(() => matchMedia('(prefers-reduced-motion: reduce)').matches, false);
  const DUR = 7200;

  /* ---------- datos ---------- */
  let RG = null, cargaT = 0, cargando = null;
  function carga(forzar) {
    if (cargando || !g(() => loaded) || !g(() => db)) return cargando;
    if (!forzar && Date.now() - cargaT < 120e3) return null;
    cargaT = Date.now();
    cargando = db.rpc('ruleta_global').then(({ data, error }) => {
      cargando = null;
      if (error || !data) return;
      const antes = JSON.stringify(RG); RG = data;
      if (antes !== JSON.stringify(RG)) { if (g(() => S.rew)) g(() => render()); intenta() }
    }).catch(() => { cargando = null });
    return cargando;
  }
  // la de esta semana (o null si el lunes aun no ha pasado el sincronizador)
  const actual = () => (RG && RG.ultima && RG.ultima.week === RG.week ? RG.ultima : null);
  // cada gajo: el jugador de la app (F) por su uuid; si no esta, lo que trae la base
  function gajos(u) {
    return (u.jugadores || []).map((j) => {
      const f = g(() => F.find((x) => x.uid === j.id), null);
      return { uid: j.id, k: f ? f.id : j.color, n: f ? f.n : j.name, ini: f ? f.ini : j.ini, photo: f && f.photo ? f.photo : null };
    });
  }
  const ganador = (u) => gajos(u)[u.idx] || null;

  /* ---------- la rueda ---------- */
  const C = 200, R = 178;
  const pt = (r, a) => [C + r * Math.sin(a * Math.PI / 180), C - r * Math.cos(a * Math.PI / 180)];
  const P = (r, a) => pt(r, a).map((v) => v.toFixed(2)).join(' ');
  function ruedaSvg(js, gana) {
    const n = Math.max(1, js.length), w = 360 / n;
    const rc = R * 0.55, rf = Math.min(36, rc * Math.sin(Math.PI / n) * 0.84);   // radio de la foto y donde va
    const defs = `<defs>
      <linearGradient id="rg-oro" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0bd"/><stop offset=".3" stop-color="#e2b24c"/><stop offset=".55" stop-color="#8a6418"/><stop offset=".8" stop-color="#f6d47a"/><stop offset="1" stop-color="#7a5714"/></linearGradient>
      <radialGradient id="rg-som" gradientUnits="userSpaceOnUse" cx="${C}" cy="${C}" r="${R}"><stop offset=".18" stop-color="#000" stop-opacity=".55"/><stop offset=".62" stop-color="#000" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".34"/></radialGradient>
      <radialGradient id="rg-hub" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#fff0bd"/><stop offset=".55" stop-color="#d9a640"/><stop offset="1" stop-color="#7a5714"/></radialGradient>
      ${js.map((j, i) => `<clipPath id="rg-cl${i}"><circle cx="${C}" cy="${(C - rc).toFixed(2)}" r="${rf.toFixed(2)}"/></clipPath>`).join('')}</defs>`;
    const seg = js.map((j, i) => {
      const a0 = i * w, a1 = a0 + w, cy = (C - rc).toFixed(2);
      const cara = j.photo
        ? `<circle cx="${C}" cy="${cy}" r="${(rf + 2.5).toFixed(2)}" class="rg-fb"/><image href="${esc(j.photo)}" x="${(C - rf).toFixed(2)}" y="${(C - rc - rf).toFixed(2)}" width="${(2 * rf).toFixed(2)}" height="${(2 * rf).toFixed(2)}" preserveAspectRatio="xMidYMin slice" clip-path="url(#rg-cl${i})"/>`
        : `<circle cx="${C}" cy="${cy}" r="${(rf + 2.5).toFixed(2)}" class="rg-fb"/><circle cx="${C}" cy="${cy}" r="${rf.toFixed(2)}" style="fill:var(--f-${esc(j.k)})"/><text x="${C}" y="${(C - rc + rf * 0.36).toFixed(2)}" class="rg-ini" style="font-size:${(rf * 0.9).toFixed(1)}px">${esc(j.ini)}</text>`;
      const nom = String(j.n || '').length > 9 ? String(j.n).slice(0, 8) + '.' : j.n;
      return `<g class="rg-s ${i === gana ? 'gana' : ''}"><path d="M${C} ${C}L${P(R, a0)}A${R} ${R} 0 ${w > 180 ? 1 : 0} 1 ${P(R, a1)}Z" style="fill:var(--f-${esc(j.k)})" class="rg-g"/>
        <g transform="rotate(${(a0 + w / 2).toFixed(2)} ${C} ${C})">${cara}<text x="${C}" y="${(C - R * 0.855).toFixed(2)}" class="rg-nm">${esc(nom)}</text></g></g>`;
    }).join('');
    const rayas = js.map((_, i) => `<path d="M${P(40, i * w)}L${P(R, i * w)}" class="rg-ra"/><circle cx="${pt(R - 3, i * w)[0].toFixed(2)}" cy="${pt(R - 3, i * w)[1].toFixed(2)}" r="3.6" class="rg-peg"/>`).join('');
    const luces = Array.from({ length: 36 }, (_, k) => { const [x, y] = pt(190, k * 10 + 5); return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="3.3" class="rg-led ${k % 2 ? 'b' : 'a'}"/>` }).join('');
    return `<svg viewBox="0 0 400 400" class="rg-svg" role="img" aria-label="${T('Ruleta global de la semana', 'Weekly global wheel')}">${defs}
      <circle cx="${C}" cy="${C}" r="199" fill="url(#rg-oro)"/><circle cx="${C}" cy="${C}" r="${R + 3}" class="rg-in"/>${luces}${seg}
      <circle cx="${C}" cy="${C}" r="${R}" fill="url(#rg-som)" pointer-events="none"/>${rayas}
      <circle cx="${C}" cy="${C}" r="44" fill="url(#rg-hub)"/><circle cx="${C}" cy="${C}" r="36" class="rg-hc"/></svg>`;
  }
  // donde para: el centro del gajo del ganador, movido un poco segun la semilla (igual en todos los moviles)
  function anguloFinal(u, n) {
    const w = 360 / n, off = (((+u.seed || 0) % 1000) / 1000 - 0.5) * w * 0.7;
    return -(u.idx * w + w / 2 + off);
  }

  /* ---------- la pantalla grande ---------- */
  let OV = null;
  function cierra(ya) {
    if (!OV) return;
    const o = OV; OV = null;
    cancelAnimationFrame(o.raf); o.timers.forEach(clearTimeout);
    document.removeEventListener('keydown', o.tecla);
    if (ya || sinAnim()) return o.el.remove();
    o.el.classList.add('sale'); setTimeout(() => o.el.remove(), 280);
  }
  function abre(u0) {
    const u = u0 || actual() || (RG && RG.ultima); if (!u) return false;
    const js = gajos(u), n = js.length, gw = ganador(u); if (!n || !gw) return false;
    cierra(true);
    const quieta = sinAnim(), fin = anguloFinal(u, n), amt = +u.amount || 1000, yo = g(() => ME, null) === gw.uid;
    const esta = RG && u.week === RG.week;
    const el = document.createElement('div');
    el.className = 'rg-ov' + (quieta ? ' quieta listo' : ''); el.id = 'rg-ov';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', T('Ruleta global de la semana', 'Weekly global wheel'));
    el.innerHTML = `<div class="rg-fondo"></div><div class="rg-c">
      <button type="button" class="rg-x" aria-label="${T('Cerrar', 'Close')}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      <header class="rg-h"><span class="lab">${esta ? 'Ruleta global de la semana' : 'Ruleta global de la semana pasada'}</span>
        <h2 data-notr>${T(`${N(amt)} para uno de los ${n}`, `${N(amt)} for one of the ${n}`)}</h2></header>
      <div class="rg-w"><span class="rg-glow"></span><div class="rg-rot" style="transform:rotate(${(quieta ? fin : 0).toFixed(2)}deg)">${ruedaSvg(js, quieta ? u.idx : -1)}</div>
        <span class="rg-pin"><svg viewBox="0 0 32 46"><path d="M16 44C10 30 3 22 3 14a13 13 0 0 1 26 0c0 8-7 16-13 30z" class="rg-pa"/><circle cx="16" cy="14" r="5" class="rg-pc"/></svg></span>
        <span class="rg-hub"><span class="cn"></span></span></div>
      <div class="rg-res" aria-live="polite">
        <div class="rg-gan">${av(gw.k, 'xl').replace(/ data-prof="[^"]*"/, '').replace(/ title="[^"]*"/, '')}<div><span class="lab">${yo ? '¡Te ha tocado a ti!' : 'Le ha tocado a'}</span><b>${esc(gw.n)}</b></div></div>
        <p class="rg-amt num"><span>+${N(amt)}</span>${coin()}</p>
        <p class="rg-sub" data-notr>${yo ? T('Ya está en tu saldo. La semana que viene, otra vez entre todos.', 'Already in your balance. Next week, again among everyone.') : T('Ya está en su saldo. Cada lunes se sortean otros 1.000 entre todos.', 'Already in their balance. Every Monday another 1,000 is drawn among everyone.')}</p>
        <button type="button" class="rg-ok">${T('Seguir', 'Continue')}</button></div>
      <div class="rg-gira"><span class="lab">Girando…</span><div class="rg-tod">${js.map((j) => av(j.k, 'sm').replace(/ data-prof="[^"]*"/, '').replace(/ title="[^"]*"/, '')).join('')}</div>
        <p data-notr>${T(`Entran los ${n}. Le toca a uno solo.`, `All ${n} are in. Only one wins.`)}</p></div></div>`;
    document.body.appendChild(el); traduce(el);
    const o = OV = { el, timers: [], raf: 0, tecla: (e) => { if (e.key === 'Escape') cierra() } };
    el.querySelector('.rg-x').addEventListener('click', (e) => { e.stopPropagation(); cierra() });
    el.querySelector('.rg-ok').addEventListener('click', (e) => { e.stopPropagation(); cierra() });
    el.querySelector('.rg-fondo').addEventListener('click', () => { if (el.classList.contains('listo')) cierra() });
    document.addEventListener('keydown', o.tecla);
    g(() => el.querySelector('.rg-ok').focus({ preventScroll: true }));
    if (quieta) return true;
    // el giro: 7 vueltas y para en el ganador frenando poco a poco; un tic al pasar cada pivote
    const rot = el.querySelector('.rg-rot'), w = 360 / n, total = 360 * 7 + (((fin % 360) + 360) % 360);
    let t0 = 0, ult = 0;
    const paso = (t) => {
      if (OV !== o) return;
      if (!t0) t0 = t;
      const p = Math.min(1, (t - t0) / DUR), e = 1 - Math.pow(1 - p, 4), a = total * e;
      rot.style.transform = `rotate(${a.toFixed(2)}deg)`;
      const k = Math.floor((a + w / 2) / w); if (k !== ult) { ult = k; if (p < 0.985) suena('caja-tic', { vol: 0.9 }) }
      if (p < 1) { o.raf = requestAnimationFrame(paso); return }
      el.classList.add('listo'); el.querySelector('.rg-s.gana') || g(() => el.querySelectorAll('.rg-s')[u.idx].classList.add('gana'));
      suena('caja-final', { rareza: 'esp' }); g(() => setTimeout(() => suena('cobrar'), 380));
      const b = el.querySelector('.rg-gan')?.getBoundingClientRect();
      g(() => confeti(b ? b.left + b.width / 2 : undefined, b ? b.top : undefined));
    };
    o.timers.push(setTimeout(() => { o.raf = requestAnimationFrame(paso) }, 450));
    return true;
  }

  /* ---------- cuando sale sola ---------- */
  const VISTO = new Set();
  let ultima = null, espera = 0, intentos = 0, armada = false;
  function intenta() {
    clearTimeout(espera);
    if (!armada) return;
    const u = actual(), yo = g(() => ME, null);
    if (!u || !yo) return;
    const k = `gm-ruleta-global-vista:${yo}:${u.week}`;
    if (VISTO.has(k) || lee(k)) return;
    const app = document.getElementById('app');
    // si esta saliendo otra celebracion (lo ganado, el bote de la semana) o un dialogo, espera a que se cierre
    if (document.hidden || !app || app.hidden || document.getElementById('gnd') || document.getElementById('apo-ov') || OV) { if (intentos++ < 80) espera = setTimeout(intenta, 1500); return }
    if (abre(u)) { VISTO.add(k); guarda(k, '1') }
  }
  function mira() {
    if (!g(() => loaded)) return;
    const scr = g(() => S.scr), primera = ultima === null, entra = (scr === 'inicio' || scr === 'liga') && ultima !== scr;
    ultima = scr;
    carga();
    // al abrir la app, despues de lo ganado (ganado.js) y del bote (apostadores.js, a los 2,6 s)
    if (primera) { armada = true; intentos = 0; clearTimeout(espera); espera = setTimeout(intenta, 3400) }
    else if (entra) { armada = true; intentos = 0; intenta() }
  }
  const vw = document.getElementById('view');
  if (vw) new MutationObserver(mira).observe(vw, { attributes: true, attributeFilter: ['data-vista'] });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && ultima !== null) { carga(); intentos = 0; intenta() } });
  setInterval(() => { if (!document.hidden && ultima !== null) carga() }, 180e3);

  /* ---------- el sitio fijo: una fila en Recompensas ---------- */
  const IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17M3.5 12h17M6 6l12 12M18 6L6 18" opacity=".55"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/></svg>';
  function fila() {
    carga();
    const u = actual(), ant = RG && RG.ultima && !u ? RG.ultima : null, amt = +(RG && RG.amount) || 1000;
    let txt, btn = '';
    if (u) {
      const gw = ganador(u);
      txt = gw ? `<span class="rg-fw">${av(gw.k, 'sm')}<b>${esc(gw.n)}</b><i class="num">+${N(+u.amount || amt)}</i>${coin()}</span>` : '';
      btn = `<button class="go-s res" data-rg-ver>${T('Ver', 'Watch')}</button>`;
    } else if (ant) {
      const gw = ganador(ant);
      txt = `<span data-notr>${T(`El lunes se sortean ${N(amt)} entre todos. La última se la llevó`, `On Monday ${N(amt)} is drawn among everyone. Last one went to`)} ${gw ? `<b>${esc(gw.n)}</b>` : ''}</span>`;
      btn = `<button class="go-s res" data-rg-ver>${T('Ver', 'Watch')}</button>`;
    } else {
      txt = `<span data-notr>${T(`Cada lunes, ${N(amt)} para uno de todos al azar`, `Every Monday, ${N(amt)} for one of everyone at random`)}</span>`;
    }
    return `<div class="rw-r2 rg-fila"><span class="rw-t rg-ic">${IC}</span><p><b>Ruleta global de la semana</b>${txt}</p>${btn}</div>`;
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-rg-ver]'); if (!t) return;
    e.stopPropagation();
    abre();
  });
  window.GM_RGLOBAL = { fila, abre, carga, datos: () => RG };
})();
