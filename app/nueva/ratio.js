// Ratio global (PM, 01-11): "abajo de la foto saldra el top en el que se encuentra la persona del ranking global, pero sera el
// ranking de ratio en bets, es decir el mas alto contando aciertos: el winrate de ratio de un x7 es mejor que un x1.23" y "que el
// top del ranking siempre se vea actualizado".
// RATIO = retorno medio por apuesta: cada apuesta resuelta (suelta o combinada, solo de partidos) vale su cuota si se acierta y 0
// si se falla; la media de eso es el ratio. Retiradas con cash out: lo cobrado entre lo apostado. Anuladas: no cuentan.
// Ejemplo: 4 apuestas, una acertada a x7 y tres falladas = 7/4 = 1,75. Tres acertadas a x1,23 y una fallada = 3,69/4 = 0,92.
// Minimo 5 apuestas resueltas para tener puesto. Ranking global de siempre. Empate de ratio: gana quien tenga mas apuestas.
// Siempre vivo: no guarda nada. Cada vez que se pinta (app.js render(), tras refresh() o el tiempo real) y cada vez que llegan
// las combinadas (gm:cmb-datos) se calcula de nuevo desde ALL y GM_CMB, y se repinta SOLO esa pastilla.
// Usa lo global de app.js (ALL, F, O, av, esc, en) y las combinadas de combinadas.js (GM_CMB). No pide nada nuevo a la base.
'use strict';
(function () {
  const MIN = 5;   // apuestas resueltas que hacen falta para tener puesto

  /* ---------- la cuenta (pura, sin DOM: se prueba aparte) ---------- */
  // un valor por apuesta: cuota si acierta, 0 si falla, cobrado/apostado si es cash out
  function valorSuelta(b) {
    if (!b || (b.st !== 'won' && b.st !== 'lost') || !(+b.stake > 0)) return null;
    if (b.cash) return (+b.pay || 0) / +b.stake;
    return b.st === 'won' ? +b.o || 0 : 0;
  }
  function valorCombinada(c) {
    if (!c || !(+c.stake > 0)) return null;
    if (c.status === 'won') return +c.odds || 0;
    if (c.status === 'lost') return 0;
    if (c.status === 'cashout') return (+c.payout || 0) / +c.stake;
    return null;
  }
  // jugadores: [{ id, n (nombre), vals: [valor, ...] }] -> { orden: [con puesto], fuera: [sin puesto], por: { id: fila } }
  function ranking(jugadores, min) {
    const mn = min || MIN;
    const filas = jugadores.map((j) => { const n = j.vals.length, suma = j.vals.reduce((a, v) => a + v, 0); return { id: j.id, nombre: j.n, n, suma, ratio: n ? suma / n : 0, pos: 0 } });
    const r6 = (x) => Math.round(x * 1e6);
    const orden = filas.filter((x) => x.n >= mn).sort((a, b) => r6(b.ratio) - r6(a.ratio) || b.n - a.n || String(a.nombre).localeCompare(String(b.nombre)));
    orden.forEach((x, i) => (x.pos = i + 1));
    const fuera = filas.filter((x) => x.n < mn).sort((a, b) => r6(b.ratio) - r6(a.ratio) || b.n - a.n || String(a.nombre).localeCompare(String(b.nombre)));
    const por = {}; for (const x of filas) por[x.id] = x;
    return { orden, fuera, por, min: mn };
  }

  if (typeof document === 'undefined') { module.exports = { ranking, valorSuelta, valorCombinada, MIN }; return }

  /* ---------- con los datos vivos de la app ---------- */
  const g = (f, d) => { try { return f() } catch { return d } };
  const T = (es, en_) => (en() ? en_ : es);
  const suena = (t) => { if (window.GM_SONIDOS) g(() => GM_SONIDOS.suena(t)) };
  function calcula() {
    const vals = new Map(F.map((f) => [f.id, []]));
    for (const b of g(() => ALL, [])) { const v = valorSuelta(b), a = vals.get(b.k); if (v != null && a) a.push(v) }
    const uk = new Map(F.map((f) => [f.uid, f.id]));
    for (const c of g(() => GM_CMB.todas(), null) || []) { const v = valorCombinada(c), a = vals.get(uk.get(c.player)); if (v != null && a) a.push(v) }
    // PM 01-11: un reto 1 contra 1 resuelto cuenta como una apuesta a cuota 2,00 para cada uno de los dos (como en Mis apuestas)
    for (const c of g(() => CH, [])) { if ((c.st !== 'won_from' && c.st !== 'won_to') || !c.set || !c.from || !c.to) continue; const gana = c.st === 'won_from' ? c.from : c.to;
      for (const k of [c.from, c.to]) { const a = vals.get(k); if (a) a.push(k === gana ? 2 : 0) } }
    return ranking(F.map((f) => ({ id: f.id, n: f.n, vals: vals.get(f.id) })), MIN);
  }
  // las combinadas llegan por su cuenta (cada 30 s como mucho): pedirlas cada vez que se pinta mantiene el puesto al dia
  const pideCmb = () => { if (window.GM_CMB) setTimeout(() => g(() => GM_CMB.carga()), 0) };

  const fx = (x) => O(x) + 'x';
  const puesto = (i) => (en() ? `${i}${['st', 'nd', 'rd'][i - 1] || 'th'}` : `${i}º`);
  const apuestas = (n) => (en() ? `${n} bet${n === 1 ? '' : 's'}` : `${n} ${n === 1 ? 'apuesta' : 'apuestas'}`);
  const medalla = (pos) => (pos >= 1 && pos <= 3 ? ` m${pos}` : '');
  let ABIERTO = null;   // de que jugador esta abierto el desplegable (sobrevive a los repintados)

  function texto(x) {
    if (x.pos) return `<span>${T(`Top ${x.pos} en ratio`, `Top ${x.pos} in ratio`)}</span><em class="num">${fx(x.ratio)}</em>`;
    if (!x.n) return `<span>${T('Sin puesto', 'Unranked')}</span><small>${T('aún sin apuestas', 'no bets yet')}</small>`;
    return `<span>${T('Sin puesto', 'Unranked')} <em class="num">${fx(x.ratio)}</em></span><small>${T(`${x.n} de ${MIN} apuestas`, `${x.n} of ${MIN} bets`)}</small>`;
  }
  function lista(R, id) {
    const fila = (x, pos) => `<div class="rt-r${x.id === id ? ' yo' : ''}${pos ? medalla(pos) : ' fuera'}" data-prof="${x.id}">
      <span class="rt-p">${pos ? puesto(pos) : '·'}</span>${av(x.id, 'sm')}<b class="rt-n">${esc(x.nombre)}</b>
      <span class="rt-v">${x.n ? `<b class="num">${fx(x.ratio)}</b>` : `<em>·</em>`}<small>${pos ? apuestas(x.n) : x.n ? T(`${x.n} de ${MIN}`, `${x.n} of ${MIN}`) : T('sin apuestas', 'no bets')}</small></span></div>`;
    return `<div class="rt-pop" role="dialog" aria-label="${T('Ranking de ratio', 'Ratio ranking')}"><span class="rt-h">${T('Ranking de ratio', 'Ratio ranking')}</span>
      ${R.orden.map((x) => fila(x, x.pos)).join('')}
      ${R.fuera.length ? `<span class="rt-sep">${T(`Aún sin puesto · mínimo ${MIN} apuestas`, `Not ranked yet · at least ${MIN} bets`)}</span>${R.fuera.map((x) => fila(x, 0)).join('')}` : ''}
      <p class="rt-nota">${T('Lo que devuelve de media cada apuesta resuelta: la cuota si aciertas, 0 si fallas. Un acierto a 7,00 pesa mucho más que uno a 1,23.', 'What each settled bet returns on average: the odds if you win, 0 if you lose. A win at 7.00 weighs far more than one at 1.23.')}</p></div>`;
  }
  function dentro(id) {
    const R = calcula(), x = R.por[id]; if (!x) return '';
    const abre = ABIERTO === id;
    return `<button type="button" class="rt-pill${medalla(x.pos)}${x.pos ? '' : ' sin'}" data-rt-t="${id}" aria-expanded="${abre}"><i class="rt-med" aria-hidden="true"></i><span class="rt-tx">${texto(x)}</span><svg class="rt-ch" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>${abre ? lista(R, id) : ''}`;
  }
  // la pastilla de la cabecera del perfil (alto reservado: nunca mueve nada)
  function slot(id) { pideCmb(); return `<div class="rt-slot${ABIERTO === id ? ' abre' : ''}" data-rt-slot="${id}" data-notr>${dentro(id)}</div>` }
  // Liga > Saldo: el puesto pequeno bajo el nombre, y el numero junto al nombre (en las filas; el lider grande lleva los dos juntos)
  const miniTxt = (x, junto) => (x.pos ? `<b>#${x.pos}</b><s> ratio</s>${junto ? ` · ${fx(x.ratio)}` : ''}` : `${T('sin puesto', 'unranked')}${junto && x.n ? ` · ${fx(x.ratio)}` : ''}`);
  const miniCls = (x) => 'lq-rt' + medalla(x.pos) + (x.pos ? '' : ' sin');
  function mini(id, junto) {
    pideCmb();
    const x = calcula().por[id]; if (!x) return '';
    return `<span class="${miniCls(x)}" data-rt-mini="${id}"${junto ? ' data-rt-junto' : ''} data-notr>${miniTxt(x, junto)}</span>`;
  }
  const numTxt = (x) => (x.n ? fx(x.ratio) : '');
  function num(id) {
    const x = calcula().por[id]; if (!x) return '';
    return `<i class="lq-rv${medalla(x.pos)}${x.pos ? '' : ' sin'}" data-rt-num="${id}" data-notr>${numTxt(x)}</i>`;
  }
  // la corona (clase rey de av()): solo el 1.o del ranking de ratio, con puesto
  const top1 = () => { const R = calcula(); return R.orden.length ? R.orden[0].id : null };
  // repinta solo esas piezas, con datos nuevos
  function repinta() {
    const R = calcula();
    document.querySelectorAll('[data-rt-slot]').forEach((e) => { const id = e.dataset.rtSlot; e.classList.toggle('abre', ABIERTO === id); e.innerHTML = dentro(id) });
    document.querySelectorAll('[data-rt-mini]').forEach((e) => { const x = R.por[e.dataset.rtMini]; if (!x) return; e.className = miniCls(x); e.innerHTML = miniTxt(x, e.hasAttribute('data-rt-junto')) });
    document.querySelectorAll('[data-rt-num]').forEach((e) => { const x = R.por[e.dataset.rtNum]; if (!x) return; e.className = 'lq-rv' + medalla(x.pos) + (x.pos ? '' : ' sin'); e.textContent = numTxt(x) });
    const t = R.orden.length ? R.orden[0].id : null;
    document.querySelectorAll('.av[data-prof]').forEach((e) => e.classList.toggle('rey', e.dataset.prof === t));
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-rt-t]');
    if (t) { e.stopPropagation(); ABIERTO = ABIERTO === t.dataset.rtT ? null : t.dataset.rtT; suena('clic'); repinta(); return }
    if (ABIERTO && !e.target.closest('.rt-pop')) { ABIERTO = null; repinta() }
    else if (ABIERTO && e.target.closest('[data-prof]')) ABIERTO = null;   // ir al perfil de otro: se cierra
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ABIERTO) { ABIERTO = null; repinta() } });
  addEventListener('gm:cmb-datos', repinta);
  window.GM_RATIO = { calcula, slot, mini, num, top1, repinta, ranking, MIN };
})();
