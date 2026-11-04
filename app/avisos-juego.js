// Avisos de juego en directo (PM 04-11): cuando alguien EMPIEZA a jugar a un juego (crash, ruleta, minas, caballos, blackjack, cara o cruz)
// todos los que tienen la app abierta ven un aviso pequeño: "Johan está jugando Mines · 50". Tocarlo lleva a ese juego.
// Solo dentro de la app abierta (sin notificaciones push). La senal es jg_feed (db/077): un trigger del ledger inserta una fila cada vez que
// alguien pone dinero en un juego (con la cantidad) y Supabase Realtime la manda a todos. Nunca sale un aviso de ti mismo; maximo uno por
// jugador y juego cada minuto; maximo 3 apilados; se esconden a los 4 s. Cada fila se reenvia ademas a la app como el evento 'gm:jg-aviso'
// (juegos.js refresca con el las 5 ultimas jugadas de cara o cruz y blackjack).
// Va aparte, como alarmas.js y avisos.js: usa lo global de app.js (db, ME, F, S, av, render) y se monta solo.
'use strict';
(function () {
  const g = (f, d) => { try { return f() } catch { return d } };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const en = () => g(() => GM_LANG.get() === 'en', false);
  const N = (x) => { const v = Math.round(x || 0); return String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, en() ? ',' : '.') };
  const JUEGOS = { crash: ['Crash', 'Crash'], ruleta: ['Ruleta', 'Roulette'], minas: ['Minas', 'Mines'], carrera: ['Caballos', 'Horse race'], blackjack: ['Blackjack', 'Blackjack'], moneda: ['Cara o cruz', 'Coin flip'] };
  const MAX = 3, VIDA = 4000, ESPERA = 60000;
  const vistos = new Map();                       // "jugador|juego" -> hora del ultimo aviso
  let host = null, canal = null, yo = null;

  function caja() {
    if (host && host.isConnected) return host;
    host = document.createElement('div');
    host.className = 'avj'; host.setAttribute('role', 'status'); host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
    return host;
  }
  function quita(el) {
    if (!el || el._m) return;
    el._m = 1; clearTimeout(el._t);
    el.classList.remove('on');
    setTimeout(() => el.remove(), 260);
  }
  // tocar el aviso: ir a Juegos y abrir esa pestana
  function ir(j) {
    g(() => localStorage.setItem('jg-juego', j));
    g(() => { S.scr = 'juegos'; S.sheet = false; S.nvp = false; S.eqp = null; document.getElementById('view').scrollTop = 0; render() });
    let n = 0;
    const t = setInterval(() => {
      const b = document.querySelector(`.jg-tab[data-v="${j}"]`);
      if (b) { clearInterval(t); if (!b.classList.contains('on')) b.click() }
      else if (++n > 40) clearInterval(t);
    }, 100);
  }
  function muestra(f, r) {
    const nom = (JUEGOS[r.juego] || [r.juego, r.juego])[en() ? 1 : 0];
    const h = caja();
    const el = document.createElement('button');
    el.type = 'button'; el.className = 'avj-t'; el.dataset.notr = '1';
    const cara = g(() => String(av(f.id, 'sm')).replace(/ data-prof="[^"]*"/, ''), '');
    el.innerHTML = `${cara}<span class="avj-x"><b>${esc(f.n)}</b> ${en() ? 'is playing' : 'está jugando'} <b>${esc(nom)}</b>${r.stake > 0 ? ` <i>·</i> <b class="num">${N(r.stake)}</b><span class="cn"></span>` : ''}</span>`;
    // Minas es de uno solo: tocar el aviso abre la vista para mirar su partida en directo (espectar.js); el resto lleva al juego
    const ver = r.juego === 'minas' && !!window.GM_ESPECTAR;
    if (ver) el.insertAdjacentHTML('beforeend', `<span class="avj-ver">${en() ? 'Watch' : 'Ver'}</span>`);
    el.addEventListener('click', () => { quita(el); if (ver) GM_ESPECTAR.abre(f.id); else ir(r.juego) });
    h.appendChild(el);
    while (h.querySelectorAll('.avj-t:not(.fuera)').length > MAX) { const v = h.querySelector('.avj-t:not(.fuera)'); v.classList.add('fuera'); quita(v) }
    void el.offsetWidth; el.classList.add('on');
    el._t = setTimeout(() => quita(el), VIDA);
  }
  function entra(r) {
    if (!r || !JUEGOS[r.juego]) return;
    try { window.dispatchEvent(new CustomEvent('gm:jg-aviso', { detail: r })) } catch {}
    if (r.player === yo || document.hidden) return;
    if (!quiere()) return;
    const k = r.player + '|' + r.juego, ahora = Date.now();
    if (vistos.has(k) && ahora - vistos.get(k) < ESPERA) return;
    const f = g(() => F.find((x) => x.uid === r.player), null);
    if (!f) return;
    vistos.set(k, ahora);
    if (vistos.size > 200) for (const [kk, t] of vistos) if (ahora - t > ESPERA) vistos.delete(kk);
    muestra(f, r);
  }

  // Ajustes > Avisos de actividad (actividad.js) manda tambien aqui: el interruptor general y el de Juegos
  function quiere() {
    try { const x = JSON.parse(localStorage.getItem('gm-actividad-avisos:' + g(() => MEK, '')) || 'null'); if (x && (x.on === false || x.juegos === false)) return false } catch {}
    return true;
  }

  function conecta() {
    const d = g(() => db, null), me = g(() => ME, null);
    if (!d || !me || !d.channel) return;
    if (canal && yo === me) return;
    if (canal) { g(() => d.removeChannel(canal)); canal = null }
    yo = me;
    try {
      canal = d.channel('jg-feed-avisos').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'jg_feed' }, (p) => entra(p && p.new)).subscribe();
    } catch { canal = null }
  }
  // la app arranca y entra el jugador despues: se espera a que haya sesion y se vigila por si cambia de cuenta
  setInterval(conecta, 2000);
  setTimeout(conecta, 600);
  window.GM_AVISOJUEGO = { prueba: (r) => entra(r) };
})();
