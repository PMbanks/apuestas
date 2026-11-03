// Lo comun de los juegos sueltos de la pestana Juegos (ruleta.js, minas.js, carrera.js; db/073): numeros, avatares, el reloj del
// servidor, las llamadas a la base, la cantidad, el clic que sobrevive a los repintados de la app y el pulso en directo (jg_pulso).
// Cada juego es un nodo propio que juegos.js cuelga en su hueco; aqui no se decide nada de dinero: solo se pide y se pinta.
'use strict';
(function () {
  const en = () => !!(window.GM_LANG && GM_LANG.get && GM_LANG.get() === 'en');
  const N = (x) => { const v = Math.round(x || 0); return (v < 0 ? '−' : '') + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, en() ? ',' : '.') };
  const X = (m) => { const t = Number(m || 0).toFixed(2); return en() ? t : t.replace('.', ',') };
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const coin = () => '<span class="cn"></span>';
  const quieto = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } };
  const movil = () => { try { return matchMedia('(max-width:700px)').matches } catch { return false } };
  const ms = (t) => (t ? Date.parse(t) : 0);
  const suena = (t, p) => { try { window.dispatchEvent(new CustomEvent('gm:sonido', { detail: p ? { ...p, tipo: t } : t })) } catch {} };
  // efectos y sonido de fx.js (window.GMFX); si no ha cargado todavia, no hacen nada
  const fx = (f, ...a) => { try { const g = window.GMFX; return g && g[f] ? g[f](...a) : undefined } catch { return undefined } };
  window.addEventListener('gm-sonido', (e) => { try { if (window.GM_SONIDOS) GM_SONIDOS.silencia(!e.detail) } catch {} });
  function lee(k) { try { return localStorage.getItem(k) } catch { return null } }
  function guarda(k, v) { try { localStorage.setItem(k, String(v)) } catch {} }
  // diccionario propio de cada juego: el texto se escribe ya en el idioma (el nodo lleva data-notr y el traductor general no lo toca)
  const dic = (d) => (s) => (en() && d[s] != null ? d[s] : s);

  function msgErr(e, falta) {
    const m = (e && (e.message || e.error_description)) || (en() ? 'Something went wrong' : 'Algo ha fallado'), c = m + ((e && e.code) || '');
    if (/Could not find the function|PGRST202|schema cache/i.test(c)) return en() ? `This game is not in the database yet: ${falta} is missing` : `Este juego aún no está en la base: falta cargar ${falta}`;
    if (/permission denied|42501/i.test(c)) return en() ? 'This game is closed right now' : 'Este juego está cerrado ahora mismo';
    if (en() && window.GM_LANG) { const t = document.createElement('span'); t.textContent = m; GM_LANG.traduce(t); return t.textContent }
    return m;
  }

  // un juego: lleva su propio reloj (desfase con la base) y sus ayudas atadas al ctx que le da juegos.js
  function juego(nombre) {
    const J = { ctx: null, off: 0, nombre };
    J.ahora = () => Date.now() + J.off;
    J.jug = (u) => (J.ctx && J.ctx.jugadores.find((j) => j.uuid === u || j.id === u)) || { id: 'pm', color: 'pm', n: '·', uuid: u };
    J.av = (u, cls = 'sm') => (J.ctx && J.ctx.av ? String(J.ctx.av(J.jug(u).id, cls)).replace(/ data-prof="[^"]*"/, '') : `<span class="av ${esc(J.jug(u).color)} ${cls}">${esc(String(J.jug(u).n || '·')[0])}</span>`);
    J.nom = (u) => (u === (J.ctx && J.ctx.me) ? (en() ? 'You' : 'Tú') : J.jug(u).n);
    J.toast = (h) => { if (J.ctx && J.ctx.toast) J.ctx.toast(h) };
    J.rpc = async (fn, args) => {
      const t0 = Date.now();
      const { data, error } = await J.ctx.db.rpc(fn, args || {});
      if (error) throw error;
      if (data && data.now) { const s = ms(data.now); if (s) J.off = s - (t0 + Date.now()) / 2 }
      return data;
    };
    // pulso en directo: jg_pulso cambia con cada apuesta y cada salida de este juego
    J.chan = null;
    J.escucha = (cb) => {
      if (J.chan || !J.ctx || !J.ctx.db || !J.ctx.db.channel) return;
      try {
        let t = 0;
        J.chan = J.ctx.db.channel('jg-' + nombre).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'jg_pulso', filter: 'juego=eq.' + nombre }, () => {
          clearTimeout(t); t = setTimeout(cb, 40 + Math.random() * 180);
        }).subscribe();
      } catch { J.chan = null }
    };
    J.calla = () => { if (J.chan) { try { J.ctx.db.removeChannel(J.chan) } catch {} J.chan = null } };
    return J;
  }

  // clic que aguanta repintados: la app descuelga y vuelve a colgar el nodo de Juegos y entre pulsar y soltar el clic nativo se pierde.
  // Se activa con pulsar+soltar sobre el mismo boton (por su clave) y el clic nativo, que queda para el teclado, se ignora justo despues.
  function clics(el, attr, fn) {
    let dn = null, pd = 0;
    const llave = (b) => `${b.getAttribute(attr)}|${b.dataset.v || ''}`;
    const de = (e) => e.target.closest && e.target.closest(`[${attr}]`);
    el.addEventListener('pointerdown', (e) => { if ((e.button || 0) !== 0) return; const b = de(e); dn = b && !b.disabled ? { k: llave(b), t: Date.now() } : null });
    el.addEventListener('pointerup', (e) => {
      const d = dn; dn = null; if (!d || Date.now() - d.t > 4000) return;
      const b = de(e); if (!b || b.disabled || llave(b) !== d.k) return;
      pd = Date.now(); fn(b);
    });
    el.addEventListener('pointercancel', () => { dn = null });
    el.addEventListener('click', (e) => { const b = de(e); if (!b || b.disabled) return; if (pd && Date.now() - pd < 900) { pd = 0; return } fn(b) });
  }

  // la cantidad (misma memoria que el resto de Juegos: jg-stake)
  function cantidad(t, saldo) {
    const chips = [100, 500, 1000];
    return `<div class="jg-stake"><div class="jg-lab"><span class="lab">${t('Apuesta')}</span><span class="jg-sal"><span class="num" data-jx-saldo>${N(saldo)}</span>${coin()}</span></div>
      <label class="jg-amt"><input data-jx-in inputmode="numeric" autocomplete="off" value="${N(stake.v)}" aria-label="${t('Apuesta')}">${coin()}</label>
      <div class="jg-q">${chips.map((c) => `<button type="button" data-jx-q data-v="${c}">${N(c)}</button>`).join('')}<button type="button" data-jx-q data-v="mitad">1/2</button><button type="button" data-jx-q data-v="doble">×2</button><button type="button" data-jx-q data-v="todo">${t('Todo')}</button></div></div>`;
  }
  const stake = { v: Math.max(1, parseInt(lee('jg-stake'), 10) || 100) };
  // engancha la cantidad de un nodo: escribir, chips; al cambiar llama a cb()
  function engancha(el, saldo, cb) {
    el.addEventListener('input', (e) => {
      if (!e.target.matches('[data-jx-in]')) return;
      stake.v = Math.min(100000, parseInt(e.target.value.replace(/\D/g, ''), 10) || 0); guarda('jg-stake', stake.v); cb && cb();
    });
    el.addEventListener('focusout', (e) => { if (e.target.matches('[data-jx-in]')) e.target.value = N(stake.v || 0) });
    el.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-jx-q]'); if (!b) return;
      const v = b.dataset.v, sal = Math.max(0, saldo());
      stake.v = v === 'mitad' ? Math.max(1, Math.floor(stake.v / 2)) : v === 'doble' ? Math.min(100000, stake.v * 2) : v === 'todo' ? Math.max(1, Math.min(100000, sal)) : +v;
      guarda('jg-stake', stake.v);
      el.querySelectorAll('[data-jx-in]').forEach((i) => (i.value = N(stake.v)));
      cb && cb();
    });
  }
  // escribe solo si cambia
  const txt = (n, t) => { if (n && n._t !== t) { n._t = t; n.textContent = t } };
  const html = (n, h) => { if (n && n._h !== h) { n._h = h; n.innerHTML = h; return true } return false };

  // azar con semilla (la misma animacion en todos los navegadores): mulberry32 sobre la semilla hexadecimal de la ronda
  function azar(sem) {
    let a = 0; const s = String(sem || '0');
    for (let i = 0; i < s.length; i++) a = (Math.imul(a ^ s.charCodeAt(i), 2654435761) + i) >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
  }

  /* ---------- las 5 ultimas jugadas de todos (jg_ultimas, db/077), en vivo: al montar, cada 8 s mientras se ve y cuando el juego avisa ---------- */
  function ultimas(juego, J) {
    const el = document.createElement('div');
    el.className = 'jx-ult'; el.setAttribute('data-notr', '');
    let t = 0, sig = '', on = false;
    const T = dic({ 'Últimas 5 jugadas': 'Last 5 plays', 'Todavía no ha jugado nadie': 'Nobody has played yet', 'salió': 'came up', 'minas': 'mines', 'mina': 'mine', 'abiertas': 'open', 'abierta': 'open', 'ganó': 'won', 'a': 'on', 'Gana': 'Wins', 'Pierde': 'Loses', 'Empate': 'Push', 'le gana a': 'beats', 'Rojo': 'Red', 'Negro': 'Black', 'Verde': 'Green', 'cara': 'heads', 'cruz': 'tails' });
    const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
    function que(x) {
      if (juego === 'ruleta') return `${T(cap(x.que))} · ${T('salió')} ${x.sale}`;
      if (juego === 'minas') return `${x.minas} ${T(x.minas === 1 ? 'mina' : 'minas')} · ${x.n} ${T(x.n === 1 ? 'abierta' : 'abiertas')}`;
      if (juego === 'carrera') return `${T('a')} ${esc(x.que)}${x.pago > 0 ? '' : ' · ' + T('ganó') + ' ' + esc(x.sale)}`;
      if (juego === 'blackjack') return T({ blackjack: 'Blackjack', gana: 'Gana', pierde: 'Pierde', empate: 'Empate' }[x.que] || '');
      if (juego === 'moneda') return `${T('le gana a')} ${esc(J.nom(x.rival))} · ${T(x.sale)}`;
      return '';
    }
    function pinta(d) {
      const xs = (d && d.jugadas) || [];
      const h = `<span class="lab jx-ult-t">${T('Últimas 5 jugadas')}</span>` + (xs.length ? xs.map((x) => {
        const neto = x.pago - x.stake, gana = neto > 0, emp = neto === 0;
        return `<div class="jx-u ${gana ? 'w' : emp ? 'e' : 'l'}">${J.av(x.player)}<span class="jx-un"><b>${esc(J.nom(x.player))}</b><em>${que(x)}</em></span><span class="num jx-us">${N(x.stake)}</span><b class="num jx-ux">${x.x ? '×' + X(x.x) : '·'}</b><b class="num jx-uv">${gana ? '+' + N(neto) : emp ? '0' : '−' + N(-neto)}</b></div>`;
      }).join('') : `<p class="jx-uv0">${T('Todavía no ha jugado nadie')}</p>`);
      if (h !== sig) { sig = h; el.innerHTML = h }
    }
    async function refresca() {
      if (!J.ctx || !el.isConnected || document.hidden) return;
      try { const { data, error } = await J.ctx.db.rpc('jg_ultimas', { p_juego: juego }); if (!error) pinta(data) } catch {}
    }
    function bucle() { clearTimeout(t); if (!on) return; t = setTimeout(() => { refresca(); bucle() }, 8000) }
    return { el, refresca, arranca() { if (!on) { on = true; bucle() } refresca() }, para() { on = false; clearTimeout(t) } };
  }

  window.GM_JX = { en, N, X, esc, coin, quieto, movil, ms, suena, lee, guarda, dic, msgErr, juego, clics, cantidad, engancha, stake, txt, html, azar, ultimas, fx };
})();
