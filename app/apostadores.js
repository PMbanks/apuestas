// Apostadores (PM, 01-11): pestana nueva de la Liga, el modelo B de modelos/m1101/apostadores "pero hay que ponerle lo del
// bote". Arriba el bote de la semana (db/035: cada lunes la base quita 100 a cada uno que los tenga y los mete en el bote):
// cuanto hay, quien va ganandolo y por cuanto, cuanto falta para que se reparta y los premios de la semana. Debajo, una tabla
// con Semana / Mes / De siempre y Dinero / Mejor cuota / Aciertos. Solo cuenta apostar en partidos: sueltas y combinadas
// ganadas, perdidas o retiradas con cash out (nada de cajas, Crash, Cara o cruz, Blackjack ni mercado), igual que bote_neto.
// La primera vez que abres la app (o la Liga) en una semana con el bote lleno, de la cara de cada uno que ha puesto cae una
// moneda al bote (se recuerda por jugador y semana en localStorage; con Animaciones apagadas sale quieto).
// Va aparte, como inicio.js: app.js lo pinta desde liga() y aqui se usa lo global de app.js (ALL, F, BOTE, ME, PAY, S, av,
// N, O, coin, CD, DK...) y las combinadas que ya carga combinadas.js (GM_CMB). No pide nada nuevo a la base.
'use strict';
(function () {
  const g = (f, d) => { try { return f() } catch { return d } };
  const lee = (k) => { try { return localStorage.getItem(k) } catch { return null } };
  const guarda = (k, v) => { try { localStorage.setItem(k, v) } catch {} };
  const T = (es, en_) => (en() ? en_ : es);
  const traduce = (el) => { if (window.GM_LANG && el) g(() => GM_LANG.traduce(el)) };
  const suena = (t, p) => { if (window.GM_SONIDOS) g(() => GM_SONIDOS.suena(t, p)) };
  const sinAnim = () => document.documentElement.classList.contains('sin-anim');
  const MIN = 3;   // aciertos: resueltas que hacen falta para entrar en la tabla
  // lo que paga cada premio de la semana (settings premio_dinero, premio_ratio y premio_combinada: get_extras no los trae)
  const PREMIO = { din: 200, cuota: 100, comb: 300 };
  let TAB = lee('gm-liga-tab') === 'saldo' ? 'saldo' : 'apost';
  const ST = { p: 'sem', m: 'din' };

  /* ---------- fechas: semana de lunes a lunes y mes, hora de Madrid (como madrid_week de la base) ---------- */
  const ymd = (t) => DK(t).split('/').reverse().join('-');
  function medianoche(s) {
    for (const z of ['+01:00', '+02:00']) { const t = Date.parse(s + 'T00:00:00' + z); if (ymd(t) === s && HM(t) === '00:00') return t }
    return Date.parse(s + 'T00:00:00+01:00');
  }
  function desde(p) {
    if (p === 'sie') return -Infinity;
    const [y, m, d] = ymd(Date.now()).split('-').map(Number);
    if (p === 'mes') return medianoche(`${y}-${String(m).padStart(2, '0')}-01`);
    const dw = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
    return medianoche(new Date(Date.UTC(y, m - 1, d - dw)).toISOString().slice(0, 10));
  }
  const mesEn = (t) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', month: 'short' }).format(new Date(t)).toUpperCase();
  const dia = (t) => `${DD(t)} ${en() ? mesEn(t) : MO(t)}`;

  /* ---------- las apuestas que cuentan ---------- */
  // una fila por apuesta resuelta desde t0: sueltas de ALL (app.js ya pasa el cash out a ganada o perdida) y combinadas de GM_CMB
  function resueltas(t0) {
    const out = [];
    for (const b of g(() => ALL, [])) {
      if (b.st !== 'won' && b.st !== 'lost') continue;
      const t = Date.parse(b.set || ''); if (!(t >= t0)) continue;
      const cobro = b.cash || b.st === 'won' ? +b.pay || 0 : 0;
      out.push({ k: b.k, t, apostado: b.stake, cobro, neto: cobro - b.stake, ok: b.st === 'won', cuota: b.st === 'won' && !b.cash ? +b.o : 0, m: b.m, p: b.p, c: false });
    }
    const uk = new Map(F.map((f) => [f.uid, f.id]));
    for (const c of g(() => GM_CMB.todas(), null) || []) {
      if (c.status !== 'won' && c.status !== 'lost' && c.status !== 'cashout') continue;
      const t = Date.parse(c.settled_at || ''), k = uk.get(c.player); if (!(t >= t0) || !k) continue;
      const ap = +c.stake || 0, cobro = c.status === 'lost' ? 0 : +c.payout || 0;
      out.push({ k, t, apostado: ap, cobro, neto: cobro - ap, ok: c.status === 'won' || (c.status === 'cashout' && cobro > ap), cuota: c.status === 'won' ? +c.odds : 0, c: true, n: (c.combo_legs || []).length });
    }
    return out;
  }
  // como la base (035): la cuota mas alta, si empatan la que mas gano y luego la primera que se cobro; la combinada, sin la ganancia
  const porCuota = (a, b) => b.cuota - a.cuota || b.neto - a.neto || a.t - b.t;
  const porCuotaC = (a, b) => b.cuota - a.cuota || a.t - b.t;
  function tabla(p) {
    const xs = resueltas(desde(p));
    return F.map((f) => {
      const mias = xs.filter((x) => x.k === f.id), n = mias.length, h = mias.filter((x) => x.ok).length, suma = (c) => mias.reduce((a, x) => a + x[c], 0);
      return { f, n, h, apostado: suma('apostado'), cobro: suma('cobro'), neto: suma('neto'), hit: n ? h / n : 0,
        mejor: mias.filter((x) => !x.c && x.cuota > 0).sort(porCuota)[0] || null, comb: mias.filter((x) => x.c && x.cuota > 0).sort(porCuotaC)[0] || null };
    });
  }
  const nombre = (a, b) => String(a.f.n).localeCompare(String(b.f.n));
  function orden(filas, m) {
    if (m === 'din') return { ok: [...filas].sort((a, b) => b.neto - a.neto || nombre(a, b)), fuera: [] };
    if (m === 'cuota') return { ok: filas.filter((x) => x.mejor).sort((a, b) => porCuota(a.mejor, b.mejor)), fuera: filas.filter((x) => !x.mejor).sort(nombre) };
    return { ok: filas.filter((x) => x.n >= MIN).sort((a, b) => b.hit - a.hit || b.n - a.n || nombre(a, b)), fuera: filas.filter((x) => x.n < MIN).sort((a, b) => b.n - a.n || nombre(a, b)) };
  }
  const val = (x, m) => (m === 'din' ? x.neto : m === 'cuota' ? x.mejor.cuota : x.hit);
  // el bote de esta semana: quien ha puesto (BOTE.players de get_extras) y su carrera con los netos de la tabla de la semana
  function boteDe(sem) {
    const B = g(() => BOTE, null); if (!B) return null;
    const uk = new Map(F.map((f) => [f.uid, f.id])), dentro = Object.keys(B.players || {}).map((u) => uk.get(u)).filter(Boolean), set = new Set(dentro);
    return { B, dentro, set, carrera: sem.filter((x) => set.has(x.f.id)).sort((a, b) => b.neto - a.neto || nombre(a, b)), pot: +B.pot || 0, amt: +B.amount || 100 };
  }
  function lideres(sem) {
    const din = [...sem].sort((a, b) => b.neto - a.neto || nombre(a, b))[0];
    const cuota = sem.filter((x) => x.mejor).sort((a, b) => porCuota(a.mejor, b.mejor))[0];
    const comb = sem.filter((x) => x.comb).sort((a, b) => porCuotaC(a.comb, b.comb))[0];
    return { din: din && din.neto > 0 ? din : null, cuota: cuota || null, comb: comb || null };
  }

  /* ---------- pintar ---------- */
  const flecha = (v) => (v > 0 ? `<span class="up">▲ ${N(v)}</span>` : v < 0 ? `<span class="dn">▼ ${N(-v)}</span>` : `<span class="cero">${N(0)}</span>`);
  const puesto = (i) => (en() ? `${i}${['st', 'nd', 'rd'][i - 1] || 'th'}` : `${i}º`);
  const pc = (x) => Math.round(x * 100) + '%';
  const apuestasTxt = (n) => (en() ? `${n} bet${n === 1 ? '' : 's'}` : `${n} ${n === 1 ? 'apuesta' : 'apuestas'}`);
  function tabs() {
    return `<nav class="apo-tabs" aria-label="Liga">${[['saldo', 'Saldo'], ['apost', 'Apostadores']].map(([k, n]) => `<button type="button" data-apo-tab="${k}" class="${TAB === k ? 'on' : ''}" aria-pressed="${TAB === k}">${n}</button>`).join('')}</nav>`;
  }

  function boteHtml(sem) {
    const b = boteDe(sem); if (!b) return '';
    const { B, dentro, carrera, pot, amt } = b, li = lideres(sem);
    const t0 = desde('sem'), t1 = t0 + 6.5 * 864e5, rango = MO(t0) === MO(t1) ? `${DD(t0)} ${T('A', 'TO')} ${dia(t1)}` : `${dia(t0)} ${T('A', 'TO')} ${dia(t1)}`;
    const hoy = ymd(Date.now()), ini = Date.parse((B.desde || '') + 'T12:00:00Z'), antes = !dentro.length && !!B.desde && hoy < B.desde;
    const manana = antes && B.desde === ymd(Date.now() + 864e5), lunes = !dentro.length && !antes && hoy === ymd(t0);   // el lunes, hasta que pase el sincronizador (cada 5 min)
    const reparte = `<p class="apo-cd" data-notr>${T('Se reparte en', 'Paid out in')} <b>${CD(PAY)}</b>${T(', el lunes a las 00:00', ', on Monday at 00:00')}</p>`;
    let b1, b2 = '';
    if (pot > 0 && dentro.length) {
      b1 = `<div class="apo-pot"><span class="num">${N(pot)}</span>${coin()}</div>
        <p class="apo-bsub" data-notr>${en() ? `${dentro.length} ${dentro.length === 1 ? 'friend' : 'friends'} put in ${N(amt)} each` : `${dentro.length} ${dentro.length === 1 ? 'amigo ha' : 'amigos han'} puesto ${N(amt)}`}</p>
        <div class="apo-caras">${dentro.map((k) => av(k)).join('')}<button type="button" class="apo-otra" data-apo-anim><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>Ver cómo se llenó</button></div>`;
      const [a, s2] = carrera, alguien = carrera.some((x) => x.n);
      let lid;
      if (!a || !alguien) lid = `<p class="apo-nadie" data-notr>${T('Todavía nadie ha cobrado ni perdido nada. Cuenta desde la primera apuesta que se resuelva.', 'Nobody has won or lost anything yet. It counts from the first bet that settles.')}</p>`;
      else {
        const emp = s2 && s2.neto === a.neto, dif = s2 ? a.neto - s2.neto : 0;
        lid = `<div class="apo-lid" data-prof="${a.f.id}">${av(a.f.id)}<div><b>${esc(a.f.n)}</b><span class="apo-lv">${flecha(a.neto)}${coin()}</span></div></div>
          <p class="apo-por" data-notr>${!s2 ? T('Es el único que ha puesto', 'The only one in') : emp ? (en() ? `Level with ${esc(s2.f.n)}: they would split it` : `Empata con ${esc(s2.f.n)}: se lo repartirían`) : en() ? `Leads ${esc(s2.f.n)} by <b>${N(dif)}</b>` : `Le saca <b>${N(dif)}</b> a ${esc(s2.f.n)}`}</p>`;
      }
      b2 = `<div class="apo-b2"><span class="lab">Va ganándolo</span>${lid}${reparte}</div>`;
    } else if (antes) {
      b1 = `<p class="apo-pot apo-pot-t" data-notr>${manana ? T('Empieza mañana', 'Starts tomorrow') : en() ? `Starts on Monday ${dia(ini)}` : `Empieza el lunes ${dia(ini)}`}</p>
        <p class="apo-bsub" data-notr>${en() ? `Every Monday the app takes ${N(amt)} from everyone who has it and puts it in the pot. Whoever wins the most betting on matches that week takes it all.` : `Cada lunes la app quita ${N(amt)} a cada uno que los tenga y los mete en el bote. Se lo lleva entero el que más gane apostando en partidos esa semana.`}</p>
        <div class="apo-caras">${F.map((f) => av(f.id)).join('')}</div>`;
    } else if (lunes) {
      b1 = `<p class="apo-pot apo-pot-t" data-notr>${T('Se está llenando', 'Filling up')}</p><p class="apo-bsub" data-notr>${en() ? `In a few minutes the app takes ${N(amt)} from everyone who has it and puts it in the pot.` : `En unos minutos la app quita ${N(amt)} a cada uno que los tenga y los mete en el bote.`}</p>
        <div class="apo-caras">${F.map((f) => av(f.id)).join('')}</div>`;
    } else {
      b1 = `<p class="apo-pot apo-pot-t" data-notr>${T('Este lunes no hay bote', 'No pot this Monday')}</p><p class="apo-bsub" data-notr>${en() ? `Nobody had ${N(amt)} to put in. Next Monday it fills up again by itself.` : `Nadie tenía ${N(amt)} para ponerlos. El lunes que viene se vuelve a llenar solo.`}</p>`;
    }
    const pr = (amtP, tit, desc, x, val) => `<div class="apo-pr"><b class="apo-pa num">+${N(amtP)}${coin()}</b><span class="apo-pt">${tit}</span><span class="apo-pd">${desc}</span>
      ${x ? `<span class="apo-pw" data-prof="${x.f.id}">${av(x.f.id, 'sm')}<b>${esc(x.f.n)}</b><em data-notr>${val}</em></span>` : '<span class="apo-pw nadie">Nadie todavía</span>'}</div>`;
    const prem = `<div class="apo-prs"><div class="apo-prl"><span class="lab">Premios de la semana</span><span class="apo-prc" data-notr>${T('se reparten en', 'paid out in')} <b>${CD(PAY)}</b></span></div>
      ${pr(PREMIO.din, 'Más dinero', 'el que más gane apostando', li.din, li.din ? `▲ ${N(li.din.neto)}` : '')}
      ${pr(PREMIO.cuota, 'Mejor apuesta', 'la suelta acertada con la cuota más alta', li.cuota, li.cuota ? T(`a ${O(li.cuota.mejor.cuota)}`, `at ${O(li.cuota.mejor.cuota)}`) : '')}
      ${pr(PREMIO.comb, 'Combinada de la semana', 'la combinada acertada con la cuota más alta', li.comb, li.comb ? T(`a ${O(li.comb.comb.cuota)}`, `at ${O(li.comb.comb.cuota)}`) : '')}</div>`;
    const ult = (B.last || []).map((x) => F.find((f) => f.uid === x.player)).filter(Boolean), cuanto = (B.last || []).reduce((a, x) => a + (+x.amount || 0), 0);
    const last = ult.length ? `<p class="apo-last" data-notr>${en() ? `Last week ${ult.map((f) => esc(f.n)).join(' and ')} took it: <b>+${N(cuanto)}</b>` : `La semana pasada se lo llevó ${ult.map((f) => esc(f.n)).join(' y ')}: <b>+${N(cuanto)}</b>`}</p>` : '';
    return `<section class="apo-bote ${b2 ? '' : 'solo'}"><div class="apo-b1"><span class="lab">Bote de la semana</span>${b2 ? `<span class="lab apo-rango" data-notr>${rango}</span>` : ''}${b1}${last}</div>${b2}${prem}</section>`;
  }

  function filaHtml(x, pos, m, out, max, marca) {
    const f = x.f, yo = f.me;
    let sub, vl, w = 0, color = 'var(--acc)';
    if (m === 'din') {
      sub = x.n ? (en() ? `${apuestasTxt(x.n)} · ${x.h} won` : `${apuestasTxt(x.n)} · ${x.h} ${x.h === 1 ? 'acierto' : 'aciertos'}`) : T('sin apuestas resueltas', 'no settled bets');
      vl = `${flecha(x.neto)}${coin()}`; w = max ? Math.abs(x.neto) / max : 0; color = x.neto >= 0 ? 'var(--win)' : 'var(--rojo)';
    } else if (m === 'cuota') {
      if (out) { sub = x.n ? T('ninguna suelta acertada', 'no single won') : T('sin apuestas resueltas', 'no settled bets'); vl = '·' }
      else {
        const b = x.mejor, mt = byId(b.m), pick = mt ? (b.p === 'X' ? T('Empate', 'Draw') : pn(mt, b.p)) : '';
        sub = `${pick ? esc(pick) + ' · ' : ''}${en() ? `staked ${N(b.apostado)} · won` : `apostó ${N(b.apostado)} · ganó`} <span class="up apo-nw">▲ ${N(b.neto)}</span>`;
        vl = `<b class="apo-q">${O(b.cuota)}</b>`; w = max ? b.cuota / max : 0;
      }
    } else {
      sub = out ? (x.n ? (en() ? `only ${x.n} of ${MIN} bets` : `solo ${x.n} de ${MIN} apuestas`) : T('sin apuestas resueltas', 'no settled bets')) : (en() ? `${x.h} of ${apuestasTxt(x.n)}` : `${x.h} de ${x.n} apuestas`);
      vl = out ? '·' : `<b>${pc(x.hit)}</b>`; w = x.hit;
    }
    const tags = (marca || []).map(([c, t, ti]) => `<em class="apo-tag ${c}"${ti ? ` title="${ti}"` : ''}>${t}</em>`).join('');
    return `<div class="apo-r${pos === 1 && !out ? ' r1' : ''}${yo ? ' me' : ''}${out ? ' out' : ''}" data-prof="${f.id}">
      <span class="apo-rk">${out ? '·' : puesto(pos)}</span>${av(f.id, 'xl')}
      <span class="apo-nm"><span class="apo-nl"><b>${esc(f.n)}</b>${yo ? '<span class="apo-tu">TÚ</span>' : ''}${tags}</span><small data-notr>${sub}</small></span>
      <span class="apo-tr">${out || !w ? '' : `<i style="width:${Math.max(3, Math.min(100, w * 100)).toFixed(1)}%;background:${color}"></i>`}</span>
      <span class="apo-vl">${vl}</span></div>`;
  }

  function html() {
    if (!g(() => loaded)) return '';
    if (window.GM_CMB) setTimeout(() => g(() => GM_CMB.carga()), 0);   // las combinadas de todos: la primera vez y luego cada 30 s como mucho
    const { p, m } = ST, filas = tabla(p), sem = p === 'sem' ? filas : tabla('sem');
    const { ok, fuera } = orden(filas, m), max = ok.length ? Math.max(...ok.map((x) => Math.abs(val(x, m)))) : 0;
    // marcas de premio: solo en la semana (dinero: el bote y +200; mejor cuota: +100)
    const b = boteDe(sem), hayBote = p === 'sem' && b && b.pot > 0 && b.dentro.length, li = p === 'sem' ? lideres(sem) : {};
    const lidBote = hayBote && b.carrera[0] && b.carrera.some((x) => x.n) ? b.carrera[0].f.id : null;
    const marcas = (x) => {
      const out = [];
      if (m === 'din' && p === 'sem') {
        if (lidBote && x.f.id === lidBote) out.push(['oro', 'Bote', 'Se lleva el bote si acaba así']);
        if (li.din && li.din.f.id === x.f.id) out.push(['', '+' + N(PREMIO.din), 'Premio al que más gane']);
        if (hayBote && !b.set.has(x.f.id)) out.push(['off', 'fuera del bote', 'No tenía para poner en el bote']);
      }
      if (m === 'cuota' && p === 'sem' && li.cuota && li.cuota.f.id === x.f.id) out.push(['', '+' + N(PREMIO.cuota), 'Premio a la mejor apuesta']);
      return out;
    };
    const filasH = ok.map((x, i) => filaHtml(x, i + 1, m, false, max, marcas(x))).join('')
      + (fuera.length ? `<div class="apo-sep lab" data-notr>${m === 'aci' ? (en() ? `Not in yet · at least ${MIN} settled bets` : `Aún no entran · mínimo ${MIN} apuestas resueltas`) : T('Sin ninguna suelta acertada', 'No single won yet')}</div>` + fuera.map((x) => filaHtml(x, 0, m, true, max, [])).join('') : '');
    const per = { sem: T('esta semana', 'this week'), mes: T('este mes', 'this month'), sie: T('de siempre', 'all time') }[p];
    const tit = { din: T('Más dinero ganado', 'Most money won'), cuota: T('Mejor cuota acertada', 'Best odds won'), aci: T('Más aciertos', 'Best hit rate') }[m];
    const th = { din: 'Neto en apuestas', cuota: 'Cuota más alta acertada', aci: 'Aciertos' }[m];
    const nota = m === 'din' && p === 'sem' ? (hayBote ? T('Es la carrera del bote: se lo lleva el primero de los que han puesto, el lunes a las 00:00.', 'This is the pot race: the top one among those who put in takes it, on Monday at 00:00.')
      : T('Desde el lunes, esta es la carrera del bote: se lo lleva el que más gane de los que han puesto.', 'From Monday on, this is the pot race: whoever wins the most among those who put in takes it.'))
      : m === 'cuota' ? T('La suelta acertada con la cuota más alta de cada uno. Si empatan, la que más ganó.', 'Each one’s single won at the highest odds. If tied, the one that won more.')
        : m === 'aci' ? (en() ? `Share of settled bets won. At least ${MIN} to get in.` : `Qué parte de sus apuestas resueltas acierta cada uno. Con ${MIN} como mínimo.`) : T('Lo cobrado menos lo apostado, en apuestas ya resueltas.', 'What was collected minus what was staked, in settled bets.');
    // la brecha contigo
    const i = ok.findIndex((x) => x.f.me), yo = filas.find((x) => x.f.me);
    let gap = '';
    if (i === 0) gap = T('Vas primero', 'You are first');
    else if (i > 0) {
      const a = ok[i - 1], d = ok[i + 1];
      if (m === 'din') gap = en() ? `You need <b>${N(a.neto - ok[i].neto)}</b> to catch ${esc(a.f.n)}${d ? ` · you lead ${esc(d.f.n)} by <b>${N(ok[i].neto - d.neto)}</b>` : ''}` : `Te faltan <b>${N(a.neto - ok[i].neto)}</b> para alcanzar a ${esc(a.f.n)}${d ? ` · le sacas <b>${N(ok[i].neto - d.neto)}</b> a ${esc(d.f.n)}` : ''}`;
      else if (m === 'cuota') gap = en() ? `To pass ${esc(a.f.n)}, win a single at odds above <b>${O(a.mejor.cuota)}</b>` : `Para pasar a ${esc(a.f.n)}, acierta una suelta de más de <b>${O(a.mejor.cuota)}</b>`;
      else { const pts = Math.round((a.hit - ok[i].hit) * 100); gap = pts ? (en() ? `${esc(a.f.n)} is <b>${pts}</b> points ahead of you` : `${esc(a.f.n)} te saca <b>${pts}</b> puntos`) : (en() ? `Level with ${esc(a.f.n)} on hit rate` : `Empatas con ${esc(a.f.n)} en aciertos`) }
    } else if (yo) gap = m === 'cuota' ? T('Acierta una suelta para entrar', 'Win a single to get in') : m === 'aci' ? (en() ? `You need ${MIN - yo.n} more settled ${MIN - yo.n === 1 ? 'bet' : 'bets'} to get in` : `Te ${MIN - yo.n === 1 ? 'falta 1 apuesta resuelta' : `faltan ${MIN - yo.n} apuestas resueltas`} para entrar`) : '';
    // tu resumen
    const yoH = yo ? `<section class="apo-yo"><span class="lab">${{ sem: 'Tu semana', mes: 'Tu mes', sie: 'Tu historial' }[p]}</span>
      <div class="apo-yw">${av(yo.f.id)}<div data-notr><b>${i >= 0 ? `${puesto(i + 1)} ${{ din: T('por dinero', 'by money'), cuota: T('por cuota', 'by odds'), aci: T('por aciertos', 'by hit rate') }[m]}` : T('Fuera de la tabla', 'Not in the table')}</b><span>${en() ? `${yo.n} settled ${yo.n === 1 ? 'bet' : 'bets'}` : `${yo.n} ${yo.n === 1 ? 'apuesta resuelta' : 'apuestas resueltas'}`}</span></div></div>
      <div class="apo-st"><div><small>Apostado</small><b>${N(yo.apostado)}${coin()}</b></div><div><small>Cobrado</small><b>${N(yo.cobro)}${coin()}</b></div>
        <div><small>Neto</small><b>${flecha(yo.neto)}${coin()}</b></div><div><small>Mejor cuota</small><b>${yo.mejor ? O(yo.mejor.cuota) : '·'}</b></div>
        <div class="w"><small>Aciertos</small><b data-notr>${yo.n ? (en() ? `${yo.h} of ${yo.n} · ${pc(yo.hit)}` : `${yo.h} de ${yo.n} · ${pc(yo.hit)}`) : '·'}</b></div></div></section>` : '';
    const reglas = `<section class="apo-reglas"><span class="lab">Cómo se cuenta</span><h3>Solo apuestas en partidos</h3><ul>
      <li>Sueltas y combinadas ya resueltas: ganadas, perdidas o retiradas con cash out.</li>
      <li>Dinero es lo cobrado menos lo apostado.</li>
      <li>Mejor cuota es tu suelta acertada con la cuota más alta.</li>
      <li>Aciertos, con 3 apuestas resueltas como mínimo. Una combinada cuenta como una.</li>
      <li>Cajas, Crash, Cara o cruz, Blackjack y el mercado no cuentan.</li>
      <li>La semana va de lunes a domingo, hora de España.</li></ul></section>`;
    return `<div class="lc apo">${tabs()}${boteHtml(sem)}
      <div class="apo-head"><h1 data-notr>${tit} <em>${per}</em></h1>
        <div class="apo-ctl"><div class="apo-seg" role="group" aria-label="Periodo">${[['sem', 'Semana'], ['mes', 'Mes'], ['sie', 'De siempre']].map(([k, n]) => `<button type="button" data-apo-p="${k}" class="${p === k ? 'on' : ''}" aria-pressed="${p === k}">${n}</button>`).join('')}</div>
          <div class="apo-seg b" role="group" aria-label="Orden">${[['din', 'Dinero'], ['cuota', 'Mejor cuota'], ['aci', 'Aciertos']].map(([k, n]) => `<button type="button" data-apo-m="${k}" class="${m === k ? 'on' : ''}" aria-pressed="${m === k}">${n}</button>`).join('')}</div></div></div>
      <p class="apo-nota" data-notr>${nota}</p>
      <div class="apo-grid"><section class="apo-card"><div class="apo-th"><span class="lab">Apostador</span><span class="lab">${th}</span></div>${filasH}${gap ? `<p class="apo-gap" data-notr>${gap}</p>` : ''}</section>
        <aside class="apo-side">${yoH}${reglas}</aside></div>
    </div>`;
  }

  /* ---------- la animacion del bote: de cada cara cae una moneda al bote ---------- */
  let OV = null;
  const cara = (k) => av(k, 'xl').replace(/ data-prof="[^"]*"/, '').replace(/ title="[^"]*"/, '');
  function cierra(ya) {
    if (!OV) return;
    const o = OV; OV = null;
    o.timers.forEach(clearTimeout); o.anims.forEach((a) => g(() => a.cancel()));
    document.removeEventListener('keydown', o.tecla);
    if (ya || sinAnim()) return o.el.remove();
    o.el.classList.add('sale'); setTimeout(() => o.el.remove(), 260);
  }
  function anima(B0) {
    const B = B0 || g(() => BOTE, null), uk = new Map(F.map((f) => [f.uid, f.id]));
    const ks = Object.keys((B && B.players) || {}).map((u) => uk.get(u)).filter(Boolean);
    if (!B || !(+B.pot > 0) || !ks.length) return false;
    cierra(true);
    const quieta = sinAnim(), amt = +B.amount || 100, pot = +B.pot;
    const el = document.createElement('div');
    el.className = 'apo-ov' + (quieta ? ' quieta lleno' : ''); el.id = 'apo-ov';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Bote de la semana');
    el.innerHTML = `<div class="apo-ov-c"><span class="lab">Bote de la semana</span>
      <div class="apo-ov-caras">${ks.map((k, i) => `<span class="apo-ov-p" style="--i:${i}">${cara(k)}<small class="num">${N(amt)}</small></span>`).join('')}</div>
      <div class="apo-ov-bote"><span class="cn"></span><b class="num" data-n>${quieta ? N(pot) : N(0)}</b></div>
      <p data-notr>${en() ? `${ks.length} ${ks.length === 1 ? 'friend puts' : 'friends put'} in ${N(amt)}. Whoever wins the most betting on matches until Sunday takes it all.` : `${ks.length} ${ks.length === 1 ? 'amigo pone' : 'amigos ponen'} ${N(amt)}. Se lo lleva entero el que más gane apostando en partidos hasta el domingo.`}</p>
      <small class="apo-ov-skip">Toca para seguir</small></div>`;
    document.body.appendChild(el); traduce(el);
    const o = OV = { el, timers: [], anims: [], tecla: (e) => { if (e.key === 'Escape') cierra() } };
    el.addEventListener('click', (e) => { e.stopPropagation(); cierra() });
    document.addEventListener('keydown', o.tecla);
    if (quieta) { o.timers.push(setTimeout(() => cierra(), 4500)); return true }
    const caras = [...el.querySelectorAll('.apo-ov-p')], cn = el.querySelector('.apo-ov-bote .cn'), num = el.querySelector('[data-n]');
    const paso = Math.min(240, 1400 / Math.max(1, ks.length - 1)), vuelo = 700, t0 = 420;
    let llevan = 0;
    const cae = (i) => {
      if (OV !== o) return;
      const a = caras[i].querySelector('.av').getBoundingClientRect(), b = cn.getBoundingClientRect();
      const x0 = a.left + a.width / 2 - 17, y0 = a.top + a.height / 2 - 17, dx = b.left + b.width / 2 - 17 - x0, dy = b.top + b.height * 0.42 - 17 - y0;
      const m = document.createElement('span'); m.className = 'cn apo-ov-m'; m.style.left = x0 + 'px'; m.style.top = y0 + 'px'; el.appendChild(m);
      caras[i].classList.add('dio');
      // una parabola: sube un poco y cae en el bote (curva de Bezier en 9 puntos)
      const cx = dx * 0.3, cy = Math.min(0, dy) - 60, ks2 = [];
      for (let j = 0; j <= 8; j++) { const t = j / 8, u = 1 - t; ks2.push({ transform: `translate(${(2 * u * t * cx + t * t * dx).toFixed(1)}px,${(2 * u * t * cy + t * t * dy).toFixed(1)}px) scale(${(0.7 + 0.5 * Math.sin(Math.PI * t) - 0.25 * t).toFixed(3)})`, opacity: j === 0 ? 0.2 : 1 }) }
      const an = m.animate(ks2, { duration: vuelo, easing: 'cubic-bezier(.4,0,.8,.6)', fill: 'forwards' }); o.anims.push(an);
      an.onfinish = () => {
        m.remove(); if (OV !== o) return;
        llevan++; const fin = llevan >= ks.length;
        num.textContent = N(fin ? pot : Math.min(pot, llevan * amt));
        o.anims.push(cn.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' }));
        suena('caja-tic', { vol: 1.3 });
        if (fin) { el.classList.add('lleno'); suena('caja-final', { rareza: 'cla' }); o.timers.push(setTimeout(() => cierra(), 1700)) }
      };
    };
    requestAnimationFrame(() => ks.forEach((_, i) => o.timers.push(setTimeout(() => cae(i), t0 + i * paso))));
    return true;
  }
  // cuando sale: la primera vez que se pinta la app y cada vez que entras en la Liga, si el bote de esta semana ya tiene algo y
  // no lo has visto (gm-bote-visto:<jugador>:<semana>). Si esta saliendo la celebracion de ganado.js (#gnd), espera a que se cierre
  const VISTO = new Set();
  let ultima = null, espera = 0, intentos = 0;
  function intenta() {
    clearTimeout(espera);
    const B = g(() => BOTE, null), yo = g(() => ME, null);
    if (!B || !(+B.pot > 0) || !yo || !Object.keys(B.players || {}).length) return;
    const k = `gm-bote-visto:${yo}:${B.week}`;
    if (VISTO.has(k) || lee(k)) return;
    const app = document.getElementById('app');
    if (document.hidden || !app || app.hidden || document.getElementById('gnd') || OV) { if (intentos++ < 60) espera = setTimeout(intenta, 1500); return }
    if (anima(B)) { VISTO.add(k); guarda(k, '1') }
  }
  function mira() {
    if (!g(() => loaded)) return;
    const scr = g(() => S.scr), primera = ultima === null, liga = scr === 'liga' && ultima !== 'liga';
    ultima = scr;
    // al abrir la app, un poco despues: ganado.js tarda en sacar su celebracion y no deben salir las dos a la vez
    if (primera) { intentos = 0; clearTimeout(espera); espera = setTimeout(intenta, 2600) }
    else if (liga) { intentos = 0; intenta() }
  }
  const vw = document.getElementById('view');
  if (vw) new MutationObserver(mira).observe(vw, { attributes: true, attributeFilter: ['data-vista'] });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && ultima !== null && intentos) { intentos = 0; intenta() } });

  /* ---------- botones ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-apo-tab],[data-apo-p],[data-apo-m],[data-apo-anim],[data-apo-ir]'); if (!t) return;
    const d = t.dataset, v = document.getElementById('view');
    if (d.apoAnim != null) { e.stopPropagation(); anima(); return }
    if (d.apoTab) { TAB = d.apoTab === 'saldo' ? 'saldo' : 'apost'; guarda('gm-liga-tab', TAB); if (v) v.scrollTop = 0 }
    else if (d.apoP) ST.p = ['sem', 'mes', 'sie'].includes(d.apoP) ? d.apoP : 'sem';
    else if (d.apoM) ST.m = ['din', 'cuota', 'aci'].includes(d.apoM) ? d.apoM : 'din';
    else if (d.apoIr != null) { TAB = 'apost'; g(() => { S.rew = false; S.scr = 'liga'; S.sheet = false; S.nvp = false }); if (v) v.scrollTop = 0 }
    suena('clic');
    g(() => render());
  });
  // las combinadas llegan despues de pintar: se repinta una vez cuando cambian
  addEventListener('gm:cmb-datos', () => { if (TAB === 'apost' && g(() => S.scr) === 'liga' && !document.activeElement?.matches('input,textarea')) g(() => render()) });
  window.GM_APOST = { tab: () => TAB, tabs, html, anima, intenta };
})();
