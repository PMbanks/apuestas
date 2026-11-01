// Apuestas de todos (PM, 01-11: modelo B "Colega a colega" de modelos/m1101/todos, pero se dice amigos).
// Arriba, en una banda, el partido en vivo y quien va en el. Luego una fila por amigo (por saldo): puesto, saldo, lo que
// tiene en juego en boletos pequenos (sus apuestas con Me sumo, las ocultas con candado, sus combinadas y sus retos) y su
// ultimo resultado. Debajo, en bloques plegables: resultados recientes de todos, combinadas (las pinta combinadas.js en
// #cmb-todos), retos 1 contra 1 y Todas las apuestas (todasHtml de app.js, con sus filtros y paginas). Abajo del todo, y
// solo para el admin, los interruptores de la mesa (Apuesta del dia, Elecciones). Lo resuelto sale con el estilo de
// resultado.js (franja de color). Va aparte, como inicio.js: app.js lo pinta desde colegas() y aqui se usa lo global de
// app.js (ALL, F, CH, M, S, MEK, VIS, DAILY_ON, DAILY_BONUS, byId, av, fr, logo, pn, N, O, coin, isOpen, isMine...).
'use strict';
(function () {
  const g = (f, d) => { try { return f() } catch { return d } };
  const DIA = 864e5, t2 = (x) => (typeof x === 'number' ? x : Date.parse(x || '')) || 0;
  const T = { filtro: 'todos', todas: false, blk: { res: true, cmb: false, ret: false } };   // lo que se queda al repintar

  /* ---------- marcador en vivo (como inicio.js: lo pone vivo.js en m.vivo o viene en m.score) ---------- */
  const marcador = (m) => { const v = m.vivo; if (v && v.a && v.b && v.a.mapas != null) return [v.a.mapas, v.b.mapas];
    const x = /^(\d+)\s*[:\-]\s*(\d+)/.exec(String(m.score || '')); return x ? [+x[1], +x[2]] : null };
  const lider = (m) => { if (m.vivo && typeof m.vivo.lidera === 'string') return m.vivo.lidera; const s = marcador(m); return s ? (s[0] > s[1] ? 'a' : s[0] < s[1] ? 'b' : '') : null };
  const comoVa = (m, p) => { if (!m.live) return ''; if (window.GM_MK && GM_MK.es(p)) return GM_MK.va(m, p, marcador(m));   // mercados nuevos (db/036)
    const l = lider(m); if (l == null) return ''; const yo = p === '1' ? 'a' : p === '2' ? 'b' : 'x';
    return yo === 'x' ? (l === '' ? 'gana' : 'pierde') : l === '' ? 'empata' : l === yo ? 'gana' : 'pierde' };
  const empieza = (t) => { const now = Date.now();
    if (DK(t) === DK(now)) return 'hoy ' + HM(t);
    if (DK(t) === DK(now + DIA)) return 'mañana ' + HM(t);
    if (t - now < 6 * DIA) return WD(t).toLowerCase() + ' ' + HM(t);
    return WD(t).toLowerCase() + ' ' + DD(t) + ' ' + MO(t).toLowerCase() };
  const cuando = (m) => (m.live ? `<span class="rd">en vivo${marcador(m) ? ' ' + marcador(m).join(':') : ''}</span>` : `<span>${esc(empieza(t2(m.at)))}</span>`);
  const partido = (m) => `<span data-notr>${esc(m.a)} vs ${esc(m.b)}</span><span> · </span>${cuando(m)}`;
  const nombre = (k) => (k === MEK ? 'Tú' : fr(k).n), sinTr = (k) => (k === MEK ? '' : 'data-notr');   // "Tú" si se traduce; los nombres no
  const ligaImg = (m) => `<img class="tl" src="${esc((L[m.lg] && L[m.lg][1]) || SP[m.s][1])}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`;
  const caraPick = (m, p) => { const q = window.GM_MK && GM_MK.es(p) ? GM_MK.lado(p) : p; return q === '1' ? logo(m, 'a') : q === '2' ? logo(m, 'b') : ligaImg(m) };
  const VA = { gana: ['bien', 'va ganando'], pierde: ['mal', 'va perdiendo'], empata: ['q', 'va empatando'] };
  const PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  const CHEV = '<svg class="td-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  const GEAR = '<svg viewBox="0 0 24 24" aria-hidden="true">' + (g(() => SCREENS.ajustes[2], '') || '') + '</svg>';

  /* ---------- combinadas (las carga combinadas.js) ---------- */
  const combos = () => g(() => (window.GM_CMB && GM_CMB.todas()) || [], []);
  const legsDe = (c) => (c.combo_legs || []).slice().sort((a, b) => t2(a.matches && a.matches.starts_at) - t2(b.matches && b.matches.starts_at));
  const pataViva = (l) => { const m = l.matches || {}; return !l.result && (m.status === 'live' || (m.status === 'scheduled' && t2(m.starts_at) <= Date.now())) };
  const nombrePata = (l) => { const m = l.matches || {}; return l.pick === '1' ? m.home : l.pick === '2' ? m.away : l.pick === 'X' ? 'Empate' : pn({ a: m.home, b: m.away }, l.pick) };

  /* ---------- reacciones a cada apuesta (las mismas de antes: data-rx y data-rxo los atiende app.js) ---------- */
  function rx(t) {
    const r = g(() => REACT.get(t), null) || {}, hay = g(() => EMO, []).filter((e) => r[e] && r[e].length), abierto = g(() => S.rx) === t;
    return { add: `<button class="rx-add td-rxa" data-rxo="${t}" aria-label="Reaccionar">${g(() => IC_RX, '')}</button>`,
      fila: hay.length || abierto ? `<div class="rx td-rx">${hay.map((e) => `<button class="rx-c ${r[e].includes(MEK) ? 'mio' : ''}" data-rx="${t}|${e}" title="${esc(r[e].map((k) => fr(k).n).join(', '))}">${e}<i>${r[e].length}</i></button>`).join('')}${abierto ? `<span class="rx-pick">${EMO.map((e) => `<button data-rx="${t}|${e}">${e}</button>`).join('')}</span>` : ''}</div>` : '' };
  }

  /* ---------- los boletos pequenos de cada amigo ---------- */
  function tkApuesta(b) {
    const m = byId(b.m);
    if (!b.p) return `<div class="td-tk hid" data-goto="${esc(m.id)}"><span class="td-ic">${LOCK}</span>
      <div class="t"><b><span>Ya ha apostado</span><span class="lf">: se ve al empezar</span></b><small>${partido(m)}</small></div>
      <div class="m"><b>${N(b.stake)}</b>${coin()}<small>apostado</small></div><div class="bx"><span class="td-tag q">se ve al empezar</span></div></div>`;
    const va = comoVa(m, b.p), r = rx('b:' + b.id);
    const accion = b.k === MEK ? '<span class="td-tag me">Tu apuesta</span>'
      : m.live ? (va ? `<span class="td-tag ${VA[va][0]}">${VA[va][1]}</span>` : '')
      : isOpen(m) ? (isMine(m, b.p) ? '<span class="td-tag q">Tú también</span>' : `<button class="td-sumo" data-sumo="${esc(m.id)}|${b.p}">${PLUS}Me sumo</button>`) : '';
    return `<div class="td-tk ${m.live ? 'live' : ''}" data-goto="${esc(m.id)}">${caraPick(m, b.p)}
      <div class="t"><b><span class="nm" ${b.p === 'X' ? '' : 'data-notr'}>${esc(pn(m, b.p))}</span><em>${O(b.o)}</em>${r.add}</b><small>${partido(m)}</small></div>
      <div class="m"><span>${N(b.stake)}</span> → <b>${N(b.stake * b.o)}</b>${coin()}<small>cobraría</small></div><div class="bx">${accion}</div>${r.fila}</div>`;
  }
  function tkCombo(c) {
    const ls = legsDe(c), vivas = ls.filter(pataViva).length, hechas = ls.filter((l) => l.result === 'won').length, odds = Number(c.odds);
    const etq = vivas ? `<span class="td-tag rd">${vivas} de ${ls.length} en vivo</span>` : hechas ? `<span class="td-tag bien">${hechas} de ${ls.length} acertados</span>`
      : ls[0] && ls[0].matches ? `<span class="td-tag q">${esc(empieza(t2(ls[0].matches.starts_at)))}</span>` : '';
    return `<div class="td-tk tcmb" ${c.player === ME ? 'data-scr="apuestas"' : ''}><span class="td-ic tcmb">×${ls.length}</span>
      <div class="t"><b><span class="nm">Combinada de ${ls.length}</span><em>${O(odds)}</em></b><small>${ls.map((l) => (l.pick === '1' || l.pick === '2' ? `<span data-notr>${esc(nombrePata(l))}</span>` : '<span>Empate</span>')).join('<span> · </span>')}</small></div>
      <div class="m"><span>${N(c.stake)}</span> → <b>${N(c.stake * odds)}</b>${coin()}<small>cobraría</small></div><div class="bx">${etq}</div></div>`;
  }
  function tkReto(c, fid) {
    const m = byId(c.m), suyo = fid && c.to === fid && c.st !== 'pending', paraMi = c.to === MEK && c.st === 'pending' && isOpen(m), mio = c.from === MEK, de = pn(m, c.fp);
    let tit, acc = '', act = false;
    if (c.st === 'pending') {
      if (paraMi) { tit = `<span>Te reta con</span> <span class="nm" data-notr>${esc(de)}</span>`; act = true;
        acc = `<span class="td-btns">${picksOf(m).filter((p) => p !== c.fp).map((p) => `<button class="td-btn g" data-accept="${c.id}|${p}"><span>Acepto</span> <span data-notr>${esc(pn(m, p))}</span></button>`).join('')}<button class="td-btn q" data-decline="${c.id}">No</button></span>` }
      else if (mio) { tit = `<span>Retas a</span> <span class="nm" data-notr>${esc(fr(c.to).n)}</span><em data-notr>${esc(de)}</em>`; acc = `<button class="td-btn q" data-retirar="${c.id}">Retirar</button>` }
      else { tit = `<span>Reta a</span> <span class="nm" ${sinTr(c.to)}>${esc(nombre(c.to))}</span><em data-notr>${esc(de)}</em>`; acc = '<span class="td-tag q">esperando</span>' }
    } else {
      const va = comoVa(m, suyo ? c.tp : c.fp);
      tit = `<span>Reto contra</span> <span class="nm" ${sinTr(suyo ? c.from : c.to)}>${esc(nombre(suyo ? c.from : c.to))}</span><em data-notr>${esc(suyo ? pn(m, c.tp) : de)}</em>`;
      acc = va ? `<span class="td-tag ${VA[va][0]}">${VA[va][1]}</span>` : `<span class="td-tag q">${m.live ? 'en vivo' : esc(empieza(t2(m.at)))}</span>`;
    }
    return `<div class="td-tk reto ${act ? 'act' : ''}" data-goto="${esc(m.id)}"><span class="td-ic vs">1v1</span>
      <div class="t"><b>${tit}</b><small><span data-notr>${esc(m.a)} vs ${esc(m.b)}</span><span> · </span><span>${N(c.stake)} cada uno</span></small></div>
      <div class="m"><b>${N(c.stake * 2)}</b>${coin()}<small>bote</small></div><div class="bx">${acc}</div></div>`;
  }

  /* ---------- lo ultimo resuelto de cada uno, con el estilo de resultado (franja de color) ---------- */
  const chip = (k, v) => `<span class="rsl-chip" data-r="${k}">${k === 'won' || (k === 'cash' && v > 0) ? '▲ ' : k === 'lost' || (k === 'cash' && v < 0) ? '▼ ' : ''}${N(Math.abs(v))}${coin()}</span>`;
  function resueltas(f) {
    const out = [];
    for (const b of ALL) { if (b.k !== f.id || (b.st !== 'won' && b.st !== 'lost')) continue; const m = byId(b.m); if (!m) continue;
      out.push({ t: t2(b.set || b.at), k: b.cash ? 'cash' : b.st, v: b.st === 'won' ? b.pay - b.stake : -perd(b), b, m }) }
    for (const c of combos()) { if (c.player !== f.uid || !['won', 'lost', 'cashout'].includes(c.status)) continue;
      out.push({ t: t2(c.settled_at || c.created_at), k: c.status === 'cashout' ? 'cash' : c.status, v: c.status === 'lost' ? -c.stake : (c.payout || 0) - c.stake, c }) }
    return out.sort((a, b) => b.t - a.t);
  }
  const conQue = (x) => (x.c ? `<span>combinada de ${legsDe(x.c).length}</span>` : x.b.p === 'X' ? '<span>con el empate</span>' : `<span>con</span> <span data-notr>${esc(pn(x.m, x.b.p))}</span>`);
  function ultimo(f) {
    const x = resueltas(f)[0];
    if (!x) return '<div class="td-ult no"><span class="lf-m">Último:</span><b>sin resueltas</b></div>';
    return `<div class="td-ult"><span class="lf-m">Último:</span>${chip(x.k, x.v)}<small>${conQue(x)}<span> · </span><span>${esc(when(new Date(x.t).toISOString()))}</span></small></div>`;
  }

  /* ---------- la banda de arriba: partidos en vivo con apuestas de alguien ---------- */
  function banda(m) {
    const bs = ALL.filter((b) => b.m === m.id && b.st === 'open' && b.p), sc = marcador(m), l = lider(m), linea = g(() => (window.GM_VIVO ? GM_VIVO.lineaTxt(m) : ''), '');
    const quien = bs.map((b) => { const va = comoVa(m, b.p);
      const tx = va === 'pierde' ? `<span>pierde ${N(b.stake)}</span>` : `<span>cobraría ${N(b.stake * b.o)}</span>`;
      return `<span class="td-vw" data-prof="${b.k}">${av(b.k)}<span class="vt"><b ${sinTr(b.k)}>${esc(nombre(b.k))}</b><em class="${va === 'gana' ? 'bien' : va === 'pierde' ? 'mal' : ''}"><span data-notr>${esc(pn(m, b.p))}</span> · ${tx}</em></span></span>` }).join('');
    return `<section class="td-vivo" data-vivo="${esc(m.id)}">
      <div class="v-st"><b><i class="td-pt"></i>EN VIVO</b><small>${ligaImg(m)}<span class="ell">${esc(corto((L[m.lg] && L[m.lg][0]) || SP[m.s][0]))}${linea ? ' · ' + esc(linea) : ''}</span></small></div>
      <div class="v-vs"><span class="v-tm">${logo(m, 'a')}<b data-notr>${esc(m.a)}</b></span><span class="sc"><span class="${l === 'b' ? 't' : ''}">${sc ? sc[0] : '·'}</span><i>:</i><span class="${l === 'a' ? 't' : ''}">${sc ? sc[1] : '·'}</span></span><span class="v-tm b"><b data-notr>${esc(m.b)}</b>${logo(m, 'b')}</span></div>
      <div class="v-who">${quien}</div>
    </section>`;
  }

  /* ---------- la pantalla ---------- */
  function html() {
    if (!g(() => loaded)) return '';
    if (window.GM_CMB) setTimeout(() => g(() => GM_CMB.carga()), 0);   // las combinadas de todos (lo frena combinadas.js: cada 30 s como mucho)
    const rank = [...F].sort((a, b) => b.s - a.s), admin = g(() => me().admin);
    const abiertas = ALL.filter((b) => b.st === 'open' && byId(b.m)), cmbAb = combos().filter((c) => c.status === 'open');
    const retosAb = CH.filter((c) => (c.st === 'pending' || c.st === 'accepted') && byId(c.m));
    const enJuego = abiertas.reduce((a, b) => a + b.stake, 0) + cmbAb.reduce((a, c) => a + c.stake, 0), nAp = abiertas.length + cmbAb.length;
    // la banda: partidos en vivo con apuestas visibles, los que mas llevan primero
    const vivos = [...new Set(abiertas.filter((b) => b.p && byId(b.m).live).map((b) => b.m))].map(byId)
      .sort((a, b) => abiertas.filter((x) => x.m === b.id).length - abiertas.filter((x) => x.m === a.id).length).slice(0, 3);
    const filas = rank.map((f, i) => {
      const bs = abiertas.filter((b) => b.k === f.id).sort((a, b) => (byId(b.m).live - byId(a.m).live) || t2(byId(a.m).at) - t2(byId(b.m).at));
      const cs = cmbAb.filter((c) => c.player === f.uid), rs = retosAb.filter((c) => c.from === f.id || (c.to === f.id && c.st === 'accepted'));
      const j = bs.reduce((a, b) => a + b.stake, 0) + cs.reduce((a, c) => a + c.stake, 0);
      return { f, i, bs, cs, rs, j, algo: bs.length + cs.length + rs.length > 0 };
    });
    const ver = T.filtro === 'juego' ? filas.filter((x) => x.algo) : filas;
    const fila = ({ f, i, bs, cs, rs, j }) => {
      const tks = [...rs.filter((c) => c.to === MEK && c.st === 'pending').map((c) => tkReto(c, f.id)), ...bs.map(tkApuesta), ...cs.map(tkCombo), ...rs.filter((c) => !(c.to === MEK && c.st === 'pending')).map((c) => tkReto(c, f.id))].join('');
      return `<article class="td-fila ${f.me ? 'me' : ''} ${i === 0 ? 'p1' : ''}" style="--i:${Math.min(i, 8)}">
        <span class="td-pos">${i + 1}</span>
        <div class="td-who" data-prof="${f.id}">${av(f.id, 'xl')}<div><b ${sinTr(f.id)}>${esc(nombre(f.id))}</b><small>${f.ac !== '·' ? `${esc(f.acn)} acertadas` : 'sin resueltas'}</small></div></div>
        <div class="td-sal"><b class="num">${N(f.s)}${coin()}</b>${j ? `<small>${N(j)} en juego</small>` : '<small class="no">nada en juego</small>'}</div>
        <div class="td-tks">${tks || '<span class="td-nada">Nada en juego</span>'}</div>
        ${ultimo(f)}
      </article>`;
    };
    // debajo: resultados recientes de todos
    const hechas = ALL.filter((b) => (b.st === 'won' || b.st === 'lost') && byId(b.m)).sort((a, b) => t2(b.set || b.at) - t2(a.set || a.at)).slice(0, 10);
    const hecha = (b) => { const m = byId(b.m), w = b.st === 'won', yo = b.k === MEK, k = b.cash ? 'cash' : b.st;
      const vb = b.cash ? (yo ? 'retiraste con' : 'retiró con') : w ? (yo ? 'acertaste con' : 'acertó con') : yo ? 'fallaste con' : 'falló con';
      return `<div class="td-rs" data-goto="${esc(m.id)}">${av(b.k)}<div class="tx"><b ${sinTr(b.k)}>${esc(nombre(b.k))}</b> <span>${vb}</span> <em data-notr>${esc(pn(m, b.p))}</em><small><span data-notr>${esc(m.a)} ${esc(String(m.score || 'vs').split(/\s+/)[0])} ${esc(m.b)}</span><span> · </span><span>${esc(when(b.set || b.at))}</span></small></div>${chip(k, w ? b.pay - b.stake : -perd(b))}</div>` };
    // combinadas de todos (combinadas.js rellena #cmb-todos): las abiertas y las de los dos ultimos dias, como alli
    const cmbRec = combos().filter((c) => c.status === 'open' || t2(c.settled_at) > Date.now() - 2 * DIA), cmbGan = cmbRec.filter((c) => c.status === 'won').length;
    const caras = (ks) => [...new Set(ks)].filter(Boolean).slice(0, 4).map((k) => av(k, 'sm')).join('');
    const kDeUid = (uid) => g(() => F.find((x) => x.uid === uid).id, null);
    const retoTeEspera = CH.filter((c) => c.to === MEK && c.st === 'pending' && byId(c.m) && isOpen(byId(c.m))).length;
    const blk = (k, h3, i, pv, cuerpo) => `<details class="td-blk" data-tdb="${k}" ${T.blk[k] ? 'open' : ''}><summary><h3>${h3}</h3>${i ? `<i>${i}</i>` : ''}<span class="pv">${pv || ''}</span>${CHEV}</summary><div class="in">${cuerpo}</div></details>`;
    const bajo = `<div class="td-bajo">
        ${blk('res', 'Resultados recientes', 'de todos', '', hechas.map(hecha).join('') || '<p class="hint">Todavía no se ha resuelto ninguna. Cuando acabe un partido sale aquí quién acertó.</p>')}
        <div class="td-col">
          ${cmbRec.length ? blk('cmb', 'Combinadas', `<span>${cmbAb.length} en juego</span>${cmbGan ? `<span> · </span><span>${cmbGan} ${cmbGan === 1 ? 'cobrada' : 'cobradas'}</span>` : ''}`, caras(cmbRec.map((c) => kDeUid(c.player))), '<div id="cmb-todos"></div>') : ''}
          ${CH.length ? blk('ret', 'Retos 1 contra 1', retoTeEspera ? `<span>${retoTeEspera} ${retoTeEspera === 1 ? 'te espera' : 'te esperan'}</span>` : `<span>${retosAb.length} abiertos</span>`, caras(CH.slice(0, 6).map((c) => c.from)), retosHtml(CH.slice(0, 10), '')) : ''}
          <button type="button" class="td-all ${T.todas ? 'on' : ''}" data-tdall><span>Todas las apuestas<small><span>${N(ALL.length)} ${ALL.length === 1 ? 'apuesta' : 'apuestas'}</span><span> · </span><span>filtra por amigo, estado o deporte</span></small></span>${CHEV}</button>
        </div>
      </div>`;
    const ajustes = admin ? `<section class="td-adm"><span class="who2">${GEAR}<span>Ajustes de la mesa · solo tú</span></span>
        <span class="grp"><span class="lab">Apuesta del día</span><span class="seg"><button class="${DAILY_ON ? 'on' : ''}" data-daily="true" ${DAILY_ON ? 'disabled' : ''}>Con extra ×${O(DAILY_BONUS)}</button><button class="${!DAILY_ON ? 'on' : ''}" data-daily="false" ${!DAILY_ON ? 'disabled' : ''}>Sin extra</button></span></span>
        <span class="grp"><span class="lab">Elecciones</span><span class="seg"><button class="${VIS === 'open' ? 'on' : ''}" data-vis="open" ${VIS === 'open' ? 'disabled' : ''}>Visibles</button><button class="${VIS === 'kick' ? 'on' : ''}" data-vis="kick" ${VIS === 'kick' ? 'disabled' : ''}>Ocultas hasta empezar</button></span></span>
      </section>` : '';
    return `<div class="td">
      ${vivos.length ? `<div class="td-vivos">${vivos.map(banda).join('')}</div>` : ''}
      <header class="td-sh"><h2>Quién lleva qué</h2><span class="td-i"><span>${nAp} ${nAp === 1 ? 'apuesta' : 'apuestas'}</span><span> · </span><span>${N(enJuego)} en juego</span>${coin()}</span>
        <nav class="td-fil"><button type="button" class="${T.filtro === 'todos' ? 'on' : ''}" data-tdf="todos">Los ${F.length}</button><button type="button" class="${T.filtro === 'juego' ? 'on' : ''}" data-tdf="juego">Con algo en juego</button></nav></header>
      <div class="td-cab"><span>#</span><span>Amigo</span><span>Saldo</span><span>Lo que tiene en juego</span><span>Último resultado</span></div>
      <div class="td-gente">${ver.map(fila).join('') || '<p class="hint">Nadie tiene nada en juego. Se apuesta desde Partidos.</p>'}</div>
      ${bajo}
      ${T.todas ? `<div class="td-todas">${todasHtml()}</div>` : ''}
      ${ajustes}
    </div>`;
  }

  /* ---------- lo que se toca aqui (el resto lo atiende app.js: data-sumo, data-goto, data-prof, data-vivo, data-accept...) ---------- */
  document.addEventListener('click', (e) => {
    const f = e.target.closest('[data-tdf]'), a = e.target.closest('[data-tdall]'), s = e.target.closest('.td-blk>summary');
    if (s) { const d = s.parentElement, k = d.dataset.tdb; if (k) T.blk[k] = !d.open; return }   // el desplegable lo abre el navegador; aqui solo se recuerda
    if (!f && !a) return;
    if (f) T.filtro = f.dataset.tdf === 'juego' ? 'juego' : 'todos';
    if (a) T.todas = !T.todas;
    if (window.GM_SONIDOS) g(() => GM_SONIDOS.suena('clic'));
    g(() => render());
    if (a && T.todas) setTimeout(() => { const x = document.querySelector('.td-todas'); if (x) x.scrollIntoView({ block: 'start', behavior: 'smooth' }) }, 60);
  });
  // las combinadas llegan despues de pintar: se repinta una vez cuando cambian
  addEventListener('gm:cmb-datos', () => { if (g(() => S.scr) === 'colegas' && !document.activeElement?.matches('input,textarea')) g(() => render()) });
  window.GM_TODOS = { html };
})();
