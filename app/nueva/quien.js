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
  // ---------- el centro de las filas de Partidos (PM 01-11) ----------
  // Entre los equipos y las cuotas: si hay reto, el sello NvM con las caras de cada lado (1 v 1, 2 v 1...); y las caras de todos los
  // que estan dentro (apuestas sueltas y retos). Cada cara es un boton: raton encima o un toque abre la previa de lo que ha apostado en
  // ese partido, y otro click en la misma foto abre su perfil (la previa y su cierre estan mas abajo).
  const sinTitulo = (h) => h.replace(/ title="[^"]*"/, '');
  const fw = (k) => `<button type="button" class="qn-fw" data-qf="${esc(k)}" aria-label="${nom(k)}">${sinTitulo(cara(k, 'sm'))}</button>`;
  // las caras de un lado: hasta dos, y si hay mas, una y un "+n"
  const caraLado = (ks) => (ks.length > 2 ? fw(ks[0]) + `<span class="qn-n">+${ks.length - 1}</span>` : ks.map(fw).join(''));
  const ladoHtml = (L) => `<span class="qn-ld">${L.ks.length ? caraLado(L.ks) : sinTitulo(rival({}, 'sm'))}</span>`;
  const dueloHtml = (c) => { const [A, B] = ladosDe(c); return `<span class="qn-duelo">${ladoHtml(A)}<b class="qn-vs">${nvmDe(c)}</b>${ladoHtml(B)}</span>` };
  function centro(m) {
    const k = gente(m.id); if (!k.length) return '';
    const rs = retosDe(m.id); let top = '', resto = k;
    if (rs.length) { const [A, B] = ladosDe(rs[0]), en = A.ks.concat(B.ks); top = dueloHtml(rs[0]); resto = k.filter((x) => !en.includes(x)) }
    const mx = top ? 3 : 4;
    const caras = resto.length ? `<span class="qn-fs ${top ? 'peq' : ''}">${resto.slice(0, resto.length > mx ? mx - 1 : mx).map(fw).join('')}${resto.length > mx ? `<span class="qn-n">+${resto.length - mx + 1}</span>` : ''}</span>` : '';
    return `<span class="qn-c ${top ? 'con-reto' : ''}">${top}${caras}</span>`;
  }
  // marca de las filas de Partidos: la clase (azul), el centro en escritorio (who) y en movil el mismo centro en una linea bajo los equipos
  function fila(m) {
    const k = gente(m.id); if (!k.length) return { cls: '', who: '', movil: '' };
    const rs = retosDe(m.id), n = k.length, c = centro(m);
    return {
      cls: 'qn-hay' + (rs.length ? ' qn-reto' : ''),
      who: c,
      movil: `<span class="qn-mv">${c}${rs.length ? '' : `<span class="qn-mt">${n} ${n === 1 ? 'amigo' : 'amigos'}</span>`}</span>`,
    };
  }

  /* ---------- la previa de una cara (PM 01-11): que ha apostado o esta apostando esa persona en ese partido ---------- */
  const lockSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  const esMk = (p) => g(() => !!(window.GM_MK && GM_MK.es(p)), false);
  const escudoDe = (m, p) => {
    const mk = esMk(p), ld = mk ? g(() => GM_MK.lado(p), null) : p;
    return ld === '1' ? g(() => logo(m, 'a'), '') : ld === '2' ? g(() => logo(m, 'b'), '') : ld === 'X' ? '<i class="qn-x">=</i>' : mk ? g(() => img(L[m.lg]?.[1], 'tl'), '') : '<i class="qn-x">?</i>';
  };
  const lineaApuesta = (m, b, solo) => {
    if (!b.p) return `<div class="qn-pl oc"><span class="qn-pe">${lockSvg}</span><span class="qn-pt"><b>Apuesta oculta</b><small>${N(b.stake)}${coin()} <span>· se ve a las ${g(() => HM(m.at), '')}</span></small></span></div>`;
    return `<div class="qn-pl"><span class="qn-pe">${escudoDe(m, b.p)}</span><span class="qn-pt"><b ${b.p === 'X' ? '' : 'data-notr'}>${esc(pn(m, b.p))}</b><small>${esMk(b.p) && !solo ? '<span>Mercado</span> <i>·</i> ' : ''}${N(b.stake)}${coin()} <i>→</i> ${N(b.stake * b.o)}${coin()}</small></span><span class="qn-po">${O(b.o)}</span></div>`;
  };
  const lineaReto = (m, c, k) => {
    const pl = g(() => GM_RETOS.pl(c), []), yo = pl.find((x) => x.k === k);
    const otros = pl.filter((x) => x.k !== k).map((x) => x.k), nv = nvmDe(c), bote = g(() => GM_RETOS.bote(c), c.stake * 2);
    const sello = `<b class="qn-tag"><span>Reto</span> ${nv}</b>`;
    if (!yo) return `<div class="qn-rt">${sello}<span class="qn-rl2"><b data-notr>${nom(c.from)}</b> <span>le reta</span></span></div><div class="qn-pl oc"><span class="qn-pt"><small><span>aún no ha contestado</span> <i>·</i> ${N(c.stake)}${coin()}</small></span></div>`;
    const rivales = otros.length ? `<i>contra</i> <b data-notr>${nomsG(otros)}</b>` : `<i>contra</i> <span>Cualquiera</span>`;
    return `<div class="qn-rt">${sello}<span class="qn-rl2">${rivales}</span></div>
      <div class="qn-pl"><span class="qn-pe">${escudoDe(m, yo.p)}</span><span class="qn-pt"><b ${yo.p === 'X' ? '' : 'data-notr'}>${esc(pn(m, yo.p))}</b><small><span class="nw">${N(c.stake)}${coin()} <span>cada uno</span></span> <span class="nw">${N(bote)}${coin()} <span>en juego</span></span>${c.v2 ? ` <span class="nw"><i>→</i> ${N(g(() => GM_RETOS.pagoDe(c, k), 0))}${coin()} <span>si acierta</span></span>` : ''}</small></span></div>`;
  };
  function previa(k, mid) {
    const m = g(() => byId(mid)); if (!m) return '';
    const bs = apuestasDe(mid).filter((b) => b.f === k);
    const rs = retosDe(mid).filter((c) => g(() => GM_RETOS.pl(c), []).some((x) => x.k === k) || (c.to === k && c.st === 'pending'));
    const sec = [];
    if (bs.length) sec.push(`<div class="qn-sc"><span class="lab">${bs.every((b) => b.p && esMk(b.p)) ? 'Mercado' : 'Apuesta suelta'}</span>${bs.map((b) => lineaApuesta(m, b, bs.every((x) => x.p && esMk(x.p)))).join('')}</div>`);
    for (const c of rs) sec.push(`<div class="qn-sc">${lineaReto(m, c, k)}</div>`);
    if (!sec.length) sec.push('<div class="qn-sc"><p class="qn-nada">Nada abierto en este partido</p></div>');
    return `<div class="qn-ph" data-prof="${esc(k)}">${sinTitulo(cara(k, 'xl'))}<span class="qn-pn"><b data-notr>${nom(k)}</b><span data-notr>${esc(g(() => m.a + ' vs ' + m.b, ''))}</span></span></div>
      ${sec.join('')}<p class="qn-pf">Toca la foto para ver su perfil</p>`;
  }
  let pv = null, pk = null, tOp = 0, tCl = 0, vig = 0;
  const midDe = (el) => { const r = el.closest('.row,[data-foc]'); return r ? r.dataset.foc : '' };
  function cierra() {
    clearTimeout(tOp); clearTimeout(tCl); clearInterval(vig);
    if (pk && pk.el) pk.el.classList.remove('on');
    if (pv) { pv.remove(); pv = null }
    pk = null;
  }
  function pon() {
    const el = pk.el, row = el.closest('.row'), rr = (row || el).getBoundingClientRect(), movil = innerWidth <= 860;
    const o1 = row && row.querySelector('.o'), who = row && row.querySelector('.who');
    const ph = pv.offsetHeight; let w = 272, x, y;
    if (movil || !who || !who.offsetWidth) {
      // movil: a la izquierda de las cuotas (no las tapa), justo debajo de la fila (o encima si abajo no cabe)
      const tope = o1 ? o1.getBoundingClientRect().left - 8 : innerWidth - 10;
      x = Math.max(10, rr.left); w = Math.max(190, Math.min(w, tope - x));
      y = rr.bottom + 6; if (y + ph > innerHeight - 74) y = rr.top - ph - 6;
    } else {
      // escritorio: a la izquierda del centro de la fila, sobre los nombres: ninguna cuota queda tapada
      const cw = who.getBoundingClientRect(); x = cw.left - 8 - w; if (x < 12) { w = Math.max(220, w + x - 12); x = 12 }
      y = rr.top + rr.height / 2 - ph / 2;
    }
    y = Math.max(70, Math.min(y, innerHeight - ph - 12));
    pv.style.width = w + 'px'; pv.style.left = Math.round(x) + 'px'; pv.style.top = Math.round(y) + 'px';
  }
  function abre(el) {
    const k = el.dataset.qf, mid = midDe(el); if (!k || !mid) return;
    if (pk && pk.k === k && pk.mid === mid && pv) { clearTimeout(tCl); return }
    cierra();
    pv = document.createElement('div'); pv.className = 'qn-pv'; pv.setAttribute('role', 'dialog'); pv.style.setProperty('--c', `var(--f-${k},#8a8f99)`);
    pv.innerHTML = previa(k, mid); pv.style.visibility = 'hidden'; document.body.appendChild(pv);
    try { if (window.GM_LANG) GM_LANG.traduce(pv) } catch {}
    pk = { k, mid, el }; el.classList.add('on'); pon(); pv.style.visibility = '';
    // si la fila se repinta sin esa cara (o te vas de la pantalla), la previa se va
    vig = setInterval(() => { if (!document.querySelector(`.row[data-foc="${CSS.escape(mid)}"] .qn-fw[data-qf="${CSS.escape(k)}"]`)) cierra() }, 700);
  }
  const programa = () => { clearTimeout(tCl); tCl = setTimeout(cierra, 240) };
  // el primer click (o toque) en una cara abre la previa; con la previa ya abierta, otro click en esa foto sigue su camino y abre el perfil
  document.addEventListener('click', (e) => {
    const t = e.target, w = t.closest && t.closest('.qn-fw');
    if (w) {
      if (pv && pk && pk.k === w.dataset.qf && pk.mid === midDe(w)) { cierra(); return }
      e.stopPropagation(); e.preventDefault(); clearTimeout(tOp); abre(w); return;
    }
    if (pv) cierra();
  }, true);
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const t = e.target; if (!t.closest) return;
    const w = t.closest('.qn-fw');
    if (w) { clearTimeout(tCl); clearTimeout(tOp); if (!(pk && pk.el === w)) tOp = setTimeout(() => abre(w), 120); return }
    if (t.closest('.qn-pv')) { clearTimeout(tCl); return }
    clearTimeout(tOp); if (pv) programa();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pv) cierra() }, true);
  addEventListener('scroll', (e) => { if (pv && !(e.target.closest && e.target.closest('.qn-pv'))) cierra() }, true);
  addEventListener('resize', cierra);

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
    // PM 01-11: "en la pantalla del challenge que salga el tiempo por el que van": el minuto (futbol), el cuarto y el reloj (NBA), el mapa (esports) o, si no hay, cuanto lleva
    const lin = m.live ? g(() => (window.GM_VIVO ? GM_VIVO.lineaTxt(m) : ''), '') : '';
    const lleva = m.live && !lin ? Math.max(0, Math.floor((Date.now() - t) / 60000)) : 0;
    const tiempo = lin || (lleva > 0 && lleva < 600 ? 'Lleva ' + (lleva >= 60 ? Math.floor(lleva / 60) + ' h ' + String(lleva % 60).padStart(2, '0') + ' min' : lleva + ' min') : '');
    const estado = m.live ? `<span class="rc-st live"><i></i><span>En vivo</span>${tiempo ? `<span class="rc-t">${esc(tiempo)}</span>` : ''}</span>`
      : c.st === 'pending' ? `<span class="rc-st">${c.to ? 'Esperando respuesta' : 'Abierto a todos'}</span>`
      : `<span class="rc-st"><span>Empieza en</span> <b>${g(() => CD(t), '')}</b></span>`;
    const nv = nvmDe(c), bote = g(() => R.bote(c), c.stake * 2), varios = g(() => R.nEntradas(c) > 2, false), dentroYo = g(() => R.dentro(c), false);
    // db/066: en un reto contra la banca, lo que te llevas si aciertas es tu cuota de la banca + lo de los rivales (siempre se ensena)
    const miParte = dentroYo && (varios || c.v2) ? g(() => R.pagoDe(c, yo), 0) : 0;
    const quienes = g(() => R.pl(c).length, 1), cierre = g(() => R.retirarBtn(c, 'en-rc'), '') || (quienes > 1 || c.st === 'accepted' ? `<span class="rc-no">${LOCK}<span>Sin cancelar · se paga al final</span></span>` : '');
    const boteTxt = c.v2 ? 'en juego entre vosotros · el que acierta cobra además su cuota de la banca' : varios ? 'en juego · se reparte entre los que acierten' : 'en juego · se lo lleva quien acierte';
    // quien mas hay: un tercer lado (por ejemplo el empate en un reto de dos equipos)
    const extra = mas.length ? `<p class="rc-ex">${mas.map((l) => `<span class="rc-ex1">${l.ks.slice(0, 2).map((k) => cara(k, 'sm')).join('')}<b data-notr>${nomsG(l.ks)}</b><i>con</i><span ${l.p === 'X' ? '' : 'data-notr'}>${esc(l.p === 'X' ? 'el empate' : pn(m, l.p))}</span></span>`).join('')}</p>` : '';
    // unirte: un boton por lado si el reto esta abierto y no estas dentro; si es un reto para ti, el de aceptar de siempre
    const acc = g(() => R.puedeEntrar(c), false) ? `<div class="rc-acc rc-un">${R.botonesUnir(c, 'en-rc')}</div>`
      : R && R.paraMi(c) ? `<div class="rc-acc">${R.accion(c, 'en-rc')}</div>` : '';
    return `<article class="rc ${m.live ? 'live' : ''} ${c.st} ${ld ? 'hay-lead' : ''}" ${op.ir ? `data-goto="${esc(m.id)}"` : ''} style="--ca:var(--f-${A.ks[0] || 'pm'},#8a8f99);--cb:var(--f-${B.ks[0] || 'pm'},#8a8f99);--i:${op.i || 0}">
      <header class="rc-top"><span class="qn-seal">${SVS}<span>Reto</span> <span class="rc-nv">${nv}</span></span>${estado}</header>
      <div class="rc-duel">${lado(A, 'a', lA)}<div class="rc-mid">${centro}</div>${lado(B, 'b', lB)}</div>
      ${extra}${op.sinPartido ? '' : `<p class="rc-pt" data-notr>${esc(m.a)} vs ${esc(m.b)}</p>`}
      <footer class="rc-pie"><span class="rc-bote"><b class="num">${N(bote)}${coin()}</b><small>${boteTxt}</small>${miParte ? `<small class="rc-yo"><span>${c.v2 ? 'Si aciertas cobras' : 'Tu parte si aciertas'}</span> <b class="num">${N(miParte)}${coin()}</b></small>` : ''}</span>${cierre}</footer>
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

  window.GM_QUIEN = { cartaReto, gente, hay, ord, dia, caras, retoLinea, vivoPie, fila, centro, previa, bloque, retosDe };
})();
