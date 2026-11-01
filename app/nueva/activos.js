// Retos activos (PM, 01-11: "los challenges saldran en Home arriba, donde Friends, antes de 'by latest move' saldran los active challenges y
// quien esta dentro, y saldra para unirse al que creen que gana o empata"). Una seccion de Inicio, en la columna de Amigos, entre la
// cabecera y "Por orden de movimiento": una tarjeta por reto (partido, bote, quien esta en cada lado, cuanto cuesta entrar, cuanto queda)
// con un boton por lado para unirse en un toque ("Unirme con Arsenal, pones 250"; el propio boton es la confirmacion). Si ya estas dentro
// se ve tu lado y no hay botones. Las cuentas (lados, 2v1, bote) y entrar estan en retos.js; el click lo recoge app.js (data-accept).
// Lo llama inicio.js: GM_ACTIVOS.html(). Usa lo global de app.js: CH, byId, av, logo, pn, N, coin, esc, CD, MEK.
'use strict';
(function () {
  const g = (f, d) => { try { return f() } catch { return d } };
  const MAX = 6;   // tarjetas a la vista; el resto, en Apuestas de todos
  const R = () => window.GM_RETOS;

  // los retos que se enseñan: abiertos sin rival, aceptados y sin acabar; los retos a un amigo solo si son tuyos
  function lista() {
    const r = R(); if (!r) return [];
    return g(() => CH, []).filter((c) => {
      const m = byId(c.m); if (!m || !r.abierto(c) || m.status === 'final' || m.status === 'canceled') return false;
      if (c.st === 'pending' && !c.ab) return r.dentro(c) || c.to === MEK;
      return true;
    }).sort((a, b) => (byId(a.m).live ? 1 : 0) - (byId(b.m).live ? 1 : 0) || Date.parse(byId(a.m).at) - Date.parse(byId(b.m).at) || b.id - a.id);
  }

  const cara = (k) => g(() => av(k, 'sm'), '');
  function gente(ks) {
    if (!ks.length) return '<span class="ac-nadie">Nadie todavía</span>';
    const nom = (k) => esc(g(() => fr(k).n, '·'));
    return `<span class="ac-fs">${ks.slice(0, 3).map(cara).join('')}${ks.length > 3 ? `<span class="qn-n">+${ks.length - 3}</span>` : ''}</span><span class="ac-nm" data-notr>${ks.slice(0, 2).map(nom).join(', ')}${ks.length > 2 ? ` +${ks.length - 2}` : ''}</span>`;
  }
  function lado(c, m, p, lados, puede, yo) {
    const l = lados.find((x) => x.p === p), ks = l ? l.ks : [], mio = ks.includes(MEK);
    const eq = p === 'X' ? '<i class="rc-x">=</i>' : g(() => logo(m, p === '1' ? 'a' : 'b'), '');
    const nombre = p === 'X' ? '<b>Empate</b>' : `<b data-notr>${esc(pn(m, p))}</b>`;
    const accion = mio ? '<span class="ac-dentro"><span>Estás dentro</span></span>' : puede ? R().unirme(c, p, 'en-ac') : '';
    return `<div class="ac-lado ${mio ? 'mio' : ''} ${ks.length ? '' : 'vacio'}"><span class="ac-eq">${eq}</span><div class="ac-q">${nombre}<span class="ac-g">${gente(ks)}</span></div>${accion}</div>`;
  }

  function tarjeta(c, i) {
    const r = R(), m = byId(c.m), puede = r.puedeEntrar(c), lados = r.lados(c), yo = r.dentro(c);
    const nv = r.nvm(c), bote = r.bote(c), live = !!m.live;
    const cuando = live ? '<span class="ac-vivo"><i></i><span>En vivo</span></span>' : `<span class="ac-cd"><span>Empieza en</span> <b>${g(() => CD(Date.parse(m.at)), '')}</b></span>`;
    // para ti (reto a un amigo que te han hecho): el Aceptar de siempre
    const paraMi = r.paraMi(c) && c.to === MEK;
    const ps = r.picksDe ? r.picksDe(m) : g(() => picksOf(m), ['1', '2']);
    return `<article class="ac-c ${yo ? 'yo' : ''} ${live ? 'live' : ''}" data-goto="${esc(m.id)}" style="--i:${i}">
      <header class="ac-h"><div class="ac-ti"><b data-notr>${esc(m.a)} <i>vs</i> ${esc(m.b)}</b>
        <span class="ac-mt"><b class="qn-tag"><span>Reto</span> ${nv}</b><span class="ac-en"><span>entras con</span> <b class="num">${N(c.stake)}</b>${g(() => coin(), '')}</span></span></div>
        <div class="ac-bo"><b class="num">${N(bote)}${g(() => coin(), '')}</b>${cuando}</div></header>
      <div class="ac-ls">${ps.map((p) => lado(c, m, p, lados, puede, yo)).join('')}</div>
      ${paraMi ? `<div class="ac-acc">${r.accion(c, 'en-ac')}</div>` : ''}
    </article>`;
  }

  function html() {
    const xs = lista(); if (!xs.length) return '';
    const ver = xs.slice(0, MAX), mas = xs.length - ver.length;
    return `<section class="ac" aria-label="Retos activos">
      <div class="ini-sub"><h3><span>Retos activos</span> <i>${xs.length}</i></h3><span>entra en un lado: el bote se reparte entre los que aciertan</span></div>
      <div class="ac-lista">${ver.map(tarjeta).join('')}</div>
      ${mas > 0 ? `<button type="button" class="ini-mas2 ac-mas" data-scr="colegas"><span>y ${mas} ${mas === 1 ? 'reto más' : 'retos más'}</span></button>` : ''}
    </section>`;
  }

  window.GM_ACTIVOS = { html, lista };
})();
