// Quien esta dentro de cada partido (PM, 01-11: "en live que salgan arriba las que mas gente esta apostando, o si es que hay
// alguien apostando; el challenge con Darkam no sale en la lista; si le doy click que salga arriba quien esta en las bets, y lo
// mismo en matches"). Todo lo comun va aqui para no tocar mas app.js:
//  - gente(mid): los amigos que tienen algo abierto en el partido, con apuestas sueltas o dentro de un reto (pendiente o aceptado; 1v1, 2v1, 2v2, 3v1...: retos.js)
//  - ord(a, b): orden "mas gente primero, luego mas dinero" para Directo, la tira de En directo y Partidos
//  - dia(ms): dentro de un dia de Partidos, primero los partidos con amigos dentro y luego el resto, cada grupo por hora
//  - bloque(m): "Quien esta dentro" (Directo): los retos como duelos y cada apuesta con su pick, cuota e importe
//  - caras(mid) / retoLinea(mid) / vivoPie(m): las piezas que usan la lista de Directo, la tira y las filas de Partidos
// Usa lo global de app.js: CH, whoOn, fr, av, pn, N, O, coin, esc, MEK, HM, F.
'use strict';
(function () {
  const g = (f, d) => { try { return f() } catch { return d } };
  const abierto = (c) => c.st === 'pending' || c.st === 'accepted';
  const retosDe = (mid) => g(() => CH.filter((c) => c.m === mid && abierto(c)), []);
  const apuestasDe = (mid) => g(() => whoOn(mid), []);
  const nom = (k) => (k ? esc(g(() => fr(k).n, '·')) : '');

  function gente(mid) {
    const s = [], add = (k) => { if (k && !s.includes(k)) s.push(k) };
    for (const b of apuestasDe(mid)) add(b.f);
    for (const c of retosDe(mid)) { for (const x of g(() => GM_RETOS.pl(c), [{ k: c.from }, { k: c.to }])) add(x.k); add(c.to) }
    return s;
  }
  // lo que hay puesto: apuestas sueltas y retos (los dos lados si ya esta aceptado)
  const dinero = (mid) => apuestasDe(mid).reduce((a, b) => a + b.stake, 0) + retosDe(mid).reduce((a, c) => a + c.stake * g(() => GM_RETOS.pl(c).length, c.st === 'accepted' ? 2 : 1), 0);
  const hay = (mid) => gente(mid).length > 0;
  // < 0 si a va antes que b
  const ord = (a, b) => gente(b.id).length - gente(a.id).length || dinero(b.id) - dinero(a.id);
  const dia = (ms) => [...ms.filter((m) => hay(m.id))].sort(ord).concat(ms.filter((m) => !hay(m.id)));

  const SVS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5"/></svg>';
  const cara = (k, cls) => g(() => av(k, cls), '');
  const rival = (c, cls) => (c.to ? cara(c.to, cls) : `<span class="av ${cls || ''} rt-any" title="Cualquiera"><svg viewBox="0 0 24 24"><circle cx="9" cy="9" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6.2a3 3 0 0 1 0 5.6M17.5 14a5 5 0 0 1 3 5"/></svg></span>`);

  // un lado de un reto: [{ p, ks }]; el segundo, aunque este vacio (reto abierto sin rival: nadie, o el amigo al que se reta)
  const ladosDe = (c) => { const L = g(() => GM_RETOS.lados(c), [{ p: c.fp, ks: [c.from] }].concat(c.tp ? [{ p: c.tp, ks: [c.to] }] : []));
    return [L[0], L[1] || { p: null, ks: c.ab ? [] : [c.to].filter(Boolean) }, L.slice(2)] };
  const carasG = (ks, cls, max = 2) => (ks.length ? ks.slice(0, max).map((k) => cara(k, cls)).join('') + (ks.length > max ? `<span class="qn-n">+${ks.length - max}</span>` : '') : rival({}, cls));
  const nomsG = (ks) => (ks.length ? ks.slice(0, 2).map(nom).join(', ') + (ks.length > 2 ? ` +${ks.length - 2}` : '') : 'Cualquiera');
  const nvmDe = (c) => g(() => GM_RETOS.nvm(c), '1v1');

  // las caras de quien esta dentro (hasta 4 y un "+n")
  function caras(mid, cls = 'sm', max = 4) {
    const k = gente(mid); if (!k.length) return '';
    return k.slice(0, max).map((x) => cara(x, cls)).join('') + (k.length > max ? `<span class="qn-n">+${k.length - max}</span>` : '');
  }
  // "Reto 2v1: PM, Chris contra Darkam" con sus caras (en la lista de Directo): el primero, y un "+n" si hay mas
  function retoLinea(mid) {
    const rs = retosDe(mid); if (!rs.length) return '';
    const c = rs[0], [A, B] = ladosDe(c);
    return `<small class="qn-rl"><b class="qn-tag"><span>Reto</span> ${nvmDe(c)}</b>${carasG(A.ks, 'sm')}<span data-notr>${nomsG(A.ks)}</span><i>contra</i>${carasG(B.ks, 'sm')}<span ${B.ks.length ? 'data-notr' : ''}>${nomsG(B.ks)}</span>${rs.length > 1 ? `<em class="qn-mas">+${rs.length - 1}</em>` : ''}</small>`;
  }
  // pie de la tarjeta de la tira En directo de Partidos
  function vivoPie(m) {
    const ws = apuestasDe(m.id), tot = ws.reduce((a, w) => a + w.stake, 0), rs = retosDe(m.id);
    const l1 = ws.length ? `<span class="lvc-avs">${caras(m.id)}</span><span>${ws.length} ${ws.length === 1 ? 'apuesta' : 'apuestas'} · ${N(tot)}${coin()} en juego</span>` : '';
    const c0 = rs[0], [A, B] = c0 ? ladosDe(c0) : [];
    const l2 = rs.length ? `<span class="qn-lv"><b class="qn-tag"><span>Reto</span> ${nvmDe(c0)}</b>${carasG(A.ks, 'sm')}<span data-notr>${nomsG(A.ks)}</span><i>contra</i>${carasG(B.ks, 'sm')}<span ${B.ks.length ? 'data-notr' : ''}>${nomsG(B.ks)}</span></span>` : '';
    return `${l1 || (rs.length ? '' : '<span class="lvc-nadie">Nadie ha apostado</span>')}${l2}`;
  }
  // marca de las filas de Partidos: las caras y, si hay reto, su sello; en movil sale una linea debajo de los equipos
  function fila(m) {
    const k = gente(m.id); if (!k.length) return { cls: '', who: '', movil: '' };
    const rs = retosDe(m.id), n = k.length;
    const pill = rs.length ? `<b class="qn-tag" title="Reto">${nvmDe(rs[0])}</b>` : '';
    return {
      cls: 'qn-hay' + (rs.length ? ' qn-reto' : ''),
      who: `<span class="qn-fs">${caras(m.id, 'sm', 2)}</span>${pill}`,
      movil: `<span class="qn-mv"><span class="qn-fs">${caras(m.id, 'sm', 3)}</span>${rs.length ? `<b class="qn-tag"><span>Reto</span> ${nvmDe(rs[0])}</b>` : `<span>${n} ${n === 1 ? 'amigo' : 'amigos'}</span>`}</span>`,
    };
  }

  /* ---------- "Quien esta dentro": lo que se ve al abrir un partido en Directo ---------- */
  // La tarjeta del reto (la misma en Inicio, Mis apuestas y Directo): un duelo. Fondo con los colores de los dos jugadores, las dos
  // caras cara a cara con su VS (o el marcador en directo) en medio, el escudo de lo que eligio cada uno y el bote abajo.
  // op: i (orden, para la entrada), ir (tocarla lleva al partido), sinPartido (quita la linea del partido)
  const ANY = '<svg viewBox="0 0 24 24"><circle cx="9" cy="9" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6.2a3 3 0 0 1 0 5.6M17.5 14a5 5 0 0 1 3 5"/></svg>';
  const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  function cartaReto(c, op) {
    op = op || {};
    const m = g(() => byId(c.m)); if (!m) return '';
    const R = window.GM_RETOS, yo = g(() => MEK);
    const ls = g(() => R.lados(c), [{ p: c.fp, ks: [c.from] }]);
    // a la izquierda, tu lado si estas dentro; si no, el de quien reta. A la derecha el siguiente (o "Cualquiera" / el amigo al que se reta)
    let iA = ls.findIndex((l) => l.ks.includes(yo)); if (iA < 0) iA = 0;
    const A = ls[iA] || { p: c.fp, ks: [c.from] };
    const resto = ls.filter((l, i) => i !== iA), B = resto[0] || { p: null, ks: c.ab ? [] : [c.to].filter(Boolean) }, mas = resto.slice(1);
    const d = m.live ? g(() => vyDatos(m)) : null, hay = !!(d && d.sa != null && d.sb != null);
    const ld = hay ? g(() => vyLider(m, d), null) : null;
    const lA = !!(ld && A.p === ld), lB = !!(ld && B.p === ld);
    const escudo = (p) => (p === '1' ? g(() => logo(m, 'a'), '') : p === '2' ? g(() => logo(m, 'b'), '') : p === 'X' ? '<i class="rc-x">=</i>' : '');
    const carasL = (ks) => {
      if (!ks.length) return `<span class="av xl rt-any">${ANY}</span>`;
      if (ks.length === 1) return cara(ks[0], 'xl');
      return `<span class="rc-grp n${Math.min(ks.length, 3)}">${ks.slice(0, 3).map((k) => cara(k, 'xl')).join('')}${ks.length > 3 ? `<span class="rc-mas">+${ks.length - 3}</span>` : ''}</span>`;
    };
    const lado = (S, cl, lead) => `<div class="rc-lado ${cl} ${lead ? 'lead' : ''} ${S.ks.length > 1 ? 'grp' : ''}" style="--cl:var(--f-${S.ks[0] || 'pm'},#8a8f99)">
        ${lead ? `<em class="rc-ld">${S.ks.includes(yo) ? 'Vas ganando' : S.ks.length > 1 ? 'Van ganando' : 'Va ganando'}</em>` : ''}
        <span class="rc-cara">${carasL(S.ks)}</span>
        <b class="rc-n" ${S.ks.length ? 'data-notr' : ''}>${nomsG(S.ks)}</b>
        <span class="rc-pick">${S.p ? `${escudo(S.p)}<span ${S.p === 'X' ? '' : 'data-notr'}>${esc(pn(m, S.p))}</span>` : '<span class="rc-sin">esperando</span>'}</span></div>`;
    // PM 01-11: "se ve como que Darkam esta ganando cuando no es verdad, el 1 esta en el lado que no es": el marcador va en el orden de
    // los jugadores (cada numero junto a la cara del que eligio ese equipo), no en el del partido (local:visitante)
    const gol = (p) => (p === '1' ? d.sa : p === '2' ? d.sb : null);
    let sA = hay ? gol(A.p) : null, sB = hay ? gol(B.p) : null;
    const mapeado = hay && sA != null && sB != null && A.p !== B.p;
    const centro = hay ? (mapeado ? `<span class="rc-sc"><b>${sA}</b><i>:</i><b>${sB}</b></span>` : `<span class="rc-sc"><b>${d.sa}</b><i>:</i><b>${d.sb}</b></span><small class="rc-sc-n" data-notr>${esc(m.a)} · ${esc(m.b)}</small>`) + '<span class="rc-vs s">vs</span>' : '<span class="rc-vs">VS</span>';
    const t = Date.parse(m.at) || 0;
    const estado = m.live ? `<span class="rc-st live"><i></i><span>En vivo</span></span>`
      : c.st === 'pending' ? `<span class="rc-st">${c.to ? 'Esperando respuesta' : 'Abierto a todos'}</span>`
      : `<span class="rc-st"><span>Empieza en</span> <b>${g(() => CD(t), '')}</b></span>`;
    const nv = nvmDe(c), bote = g(() => R.bote(c), c.stake * 2), varios = g(() => R.nEntradas(c) > 2, false), dentroYo = g(() => R.dentro(c), false);
    const miParte = dentroYo && varios ? g(() => R.pagoDe(c, yo), 0) : 0;
    // quien mas hay: un tercer lado (por ejemplo el empate en un reto de dos equipos)
    const extra = mas.length ? `<p class="rc-ex">${mas.map((l) => `<span class="rc-ex1">${l.ks.slice(0, 2).map((k) => cara(k, 'sm')).join('')}<b data-notr>${nomsG(l.ks)}</b><i>con</i><span ${l.p === 'X' ? '' : 'data-notr'}>${esc(l.p === 'X' ? 'el empate' : pn(m, l.p))}</span></span>`).join('')}</p>` : '';
    // unirte: un boton por lado si el reto esta abierto y no estas dentro; si es un reto para ti, el de aceptar de siempre
    const acc = g(() => R.puedeEntrar(c), false) ? `<div class="rc-acc rc-un">${R.botonesUnir(c, 'en-rc')}</div>`
      : R && R.paraMi(c) ? `<div class="rc-acc">${R.accion(c, 'en-rc')}</div>` : '';
    return `<article class="rc ${m.live ? 'live' : ''} ${c.st} ${ld ? 'hay-lead' : ''}" ${op.ir ? `data-goto="${esc(m.id)}"` : ''} style="--ca:var(--f-${A.ks[0] || 'pm'},#8a8f99);--cb:var(--f-${B.ks[0] || 'pm'},#8a8f99);--i:${op.i || 0}">
      <header class="rc-top"><span class="qn-seal">${SVS}<span>Reto</span> <span class="rc-nv">${nv}</span></span>${estado}</header>
      <div class="rc-duel">${lado(A, 'a', lA)}<div class="rc-mid">${centro}</div>${lado(B, 'b', lB)}</div>
      ${extra}${op.sinPartido ? '' : `<p class="rc-pt" data-notr>${esc(m.a)} vs ${esc(m.b)}</p>`}
      <footer class="rc-pie"><span class="rc-bote"><b class="num">${N(bote)}${coin()}</b><small>${varios ? 'en juego · se reparte entre los que acierten' : 'en juego · se lo lleva quien acierte'}</small>${miParte ? `<small class="rc-yo"><span>Tu parte si aciertas</span> <b class="num">${N(miParte)}${coin()}</b></small>` : ''}</span><span class="rc-no">${LOCK}<span>Sin cancelar · se paga al final</span></span></footer>
      ${acc}
    </article>`;
  }
  function apuesta(m, x) {
    const gana = x.p ? `${N(x.stake)} <i>→</i> <b>${N(x.stake * x.o)}</b>` : `${N(x.stake)}`;
    return `<div class="qn-b" style="--c:var(--f-${x.f})">${cara(x.f, 'xl')}<span class="qn-q"><b data-notr>${nom(x.f)}</b>${x.p ? `<em data-notr>${esc(pn(m, x.p))} <i>·</i> ${O(x.o)}</em>` : '<em>Apuesta oculta</em>'}</span><span class="qn-d">${gana}${coin()}</span></div>`;
  }
  function bloque(m) {
    const bs = apuestasDe(m.id).slice().sort((a, b) => b.stake - a.stake), rs = retosDe(m.id).slice().sort((a, b) => (a.st === 'accepted' ? 0 : 1) - (b.st === 'accepted' ? 0 : 1) || b.stake - a.stake);
    const k = gente(m.id), tot = dinero(m.id);
    if (!k.length) return `<section class="qn qn-vacio"><div class="qn-h"><span class="lab">Quién está dentro</span></div><p class="hint">Nadie ha apostado a este partido.</p></section>`;
    return `<section class="qn"><div class="qn-h"><span class="lab">Quién está dentro</span><span class="qn-t"><span>${k.length} ${k.length === 1 ? 'amigo' : 'amigos'}</span><i>·</i><b>${N(tot)}${coin()}</b></span></div>
      ${rs.map((c) => cartaReto(c, { sinPartido: true })).join('')}
      ${bs.length ? `<div class="qn-bs">${bs.map((x) => apuesta(m, x)).join('')}</div>` : ''}
    </section>`;
  }

  window.GM_QUIEN = { cartaReto, gente, hay, ord, dia, caras, retoLinea, vivoPie, fila, bloque, retosDe };
})();
