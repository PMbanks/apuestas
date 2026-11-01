// Retos 1 contra 1 (PM, 01-11), todo aqui para no tocar mas app.js:
//  ENVIAR (PM: "es un lio, que sea mas facil aceptar y enviar challenges"): un boton "Retar" en cada partido que aun no ha empezado
//    (fila de Partidos, ficha, ventana del partido) abre UN panel con todo a la vista, sin pasos: a quien (Cualquiera ya elegido, o un
//    amigo), tu lado (los equipos, y empate si hay; el rival se queda con el contrario), cuanto (50 100 250 500, con lo ultimo que usaste)
//    y el boton "Retar por 250". Dos toques: lado + boton.
//  CONTRA LA BANCA (PM, 02-11; db/066): un reto nuevo (c.v2) es una apuesta normal de cada uno a la banca con la cuota de su lado al
//    entrar (congelada) MAS lo que ponen los rivales: si aciertas cobras stake x tu cuota + tu parte de lo que pusieron los que fallan
//    (en proporcion a lo puesto). Si nadie entra en contra antes de empezar, se queda como una apuesta normal tuya (no se devuelve).
//    El importe se escribe a mano (de 1 a 100.000, con los atajos del boleto). pagoV2 es la UNICA cuenta de un reto v2 (la misma que
//    settle_challenges): la usan pagoDe, pagoSiEntra y cuotaEf, y de ahi todas las pantallas. Los retos viejos (sin v2) siguen con parte().
//  RETIRAR (PM, 02-11: "que tu puedas cancelar una bet desde my bets"): mientras no haya entrado NADIE mas y no haya empezado, quien reta
//    lo retira (challenge_cancel, doble toque como Cancelar apuesta) y se le devuelve todo. Con alguien dentro: sin cancelar.
//  ACEPTAR: la tarjeta del reto que te llega (arriba en cualquier pantalla, y en las listas de retos) lleva un boton "Aceptar · pones 250,
//    ganas 500" que acepta en un toque (tu lado es el contrario al del que reta). Sin saldo, sale apagado y dice cuanto te falta.
//  Aviso: punto en Inicio y Apuestas, aviso del navegador (avisa() de app.js) y aviso dentro de la app cuando alguien entra en tu reto abierto.
//  MAS GENTE (PM, 01-11: "en los challenges se podra meter gente ... 2v1, 2v2, 3v1"; db/053): un reto abierto o aceptado admite a cualquiera
//    que no este dentro mientras el partido no haya empezado, en cualquier lado (los dos equipos o el empate), poniendo lo mismo. El bote
//    (lo puesto x la gente) se reparte a partes iguales entre los que aciertan. Aqui van las cuentas comunes (lados, 2v1, bote, reparto):
//    cada reto de CH lleva pl (quien esta dentro y su lado) y win (el lado que gano), y todos los modulos usan estas funciones.
// db/042 (retos abiertos, challenge_join) ya esta cargada. Usa lo global de app.js: S, CH, M, F, byId, isOpen, picksOf, po, pn, fr, av, logo,
// me, MEK, N, CD, coin, esc, toast, errMsg, refresh, db.
'use strict';
(function () {
  const g = (f, d) => { try { return f() } catch { return d } };
  const tr = (el) => { if (window.GM_LANG) GM_LANG.traduce(el) };
  const listo = () => { const a = document.getElementById('app'); return a && !a.hidden && g(() => typeof S === 'object' && Array.isArray(CH) && Array.isArray(M) && F.length > 0, false) };
  const abiertoOK = () => true;
  const ANY = '<svg viewBox="0 0 24 24"><circle cx="9" cy="9" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6.2a3 3 0 0 1 0 5.6M17.5 14a5 5 0 0 1 3 5"/></svg>';
  const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  const SWORDS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19l9-9M5 19l-1 2 2-1M15 5l4 0 0 4-6 6M19 19l-9-9M19 19l1 2-2-1M9 5L5 5 5 9 11 15"/></svg>';
  const MAXR = 100000;   // tope de un reto (db/066), igual que el de una apuesta

  /* ---------- las cuentas de un reto con mas gente ---------- */
  // pl(c): quien esta dentro, en el orden de la base (quien reta, quien acepta, los demas por llegada). Sin db/053, solo los dos de siempre
  const pl = (c) => (c.pl && c.pl.length ? c.pl : [{ k: c.from, p: c.fp }].concat(c.to && c.tp ? [{ k: c.to, p: c.tp }] : []));
  const dentro = (c, k) => pl(c).some((x) => x.k === (k === undefined ? g(() => MEK, null) : k));
  const esperaAmigo = (c) => c.st === 'pending' && !c.ab && !!c.to && !pl(c).some((x) => x.k === c.to);   // reto a un amigo que aun no contesta
  const nEntradas = (c) => pl(c).length + (esperaAmigo(c) ? 1 : 0);
  const bote = (c) => c.stake * nEntradas(c);
  // los lados: [{ p, ks }], el de quien reta primero
  function lados(c) {
    const o = [];
    for (const x of pl(c)) { let l = o.find((y) => y.p === x.p); if (!l) { l = { p: x.p, ks: [] }; o.push(l) } l.ks.push(x.k) }
    return o;
  }
  // el marcador: 1v1, 2v1, 2v2, 3v1... (sin rival aun: 1v? ; reto a un amigo que no contesta: 1v1)
  function nvm(c) {
    const ls = lados(c);
    if (ls.length < 2) return c.ab ? `${ls[0] ? ls[0].ks.length : 1}v?` : '1v1';
    return ls.map((l) => l.ks.length).join('v');
  }
  const final = (c) => /^(won_|void)/.test(c.st);
  const ganan = (c) => (!/^won_/.test(c.st) ? [] : c.v2 ? pl(c).filter((x) => x.bst === 'won').map((x) => x.k) : c.win ? pl(c).filter((x) => x.p === c.win).map((x) => x.k) : []);
  // reparto a partes iguales; lo que no divide exacto se da de una en una a los primeros del lado (igual que la base)
  function parte(c, pick, k, extra) {
    const ent = pl(c), n = ent.length + (extra ? 1 : 0) + (esperaAmigo(c) && !extra ? 1 : 0);
    const gan = ent.filter((x) => x.p === pick).map((x) => x.k); if (extra) gan.push(k);
    if (!gan.length) return 0;
    const pool = c.stake * n, share = Math.floor(pool / gan.length), rem = pool - share * gan.length, i = gan.indexOf(k);
    return i < 0 ? 0 : share + (i < rem ? 1 : 0);
  }
  // db/066, la cuenta de un reto contra la banca: lo que cobra k si gana `pick` = stake x su cuota (redondeado, como settle_match) + su
  // parte de lo que pusieron los de los otros lados, en proporcion a lo puesto (lo que no divide exacto, de una en una a los primeros del
  // lado). extra: k aun no esta dentro y entraria ahora por ese lado con la cuota de ahora. Un reto a un amigo que aun no contesta
  // cuenta con el amigo en el lado contrario (lo que se lleva quien reta si acepta)
  const cuotaYa = (c, p) => g(() => po(byId(c.m), p), null);
  function pagoV2(c, pick, k, extra) {
    const ent = pl(c).map((x) => ({ k: x.k, p: x.p, s: c.stake, o: x.o }));
    if (extra) ent.push({ k, p: pick, s: c.stake, o: cuotaYa(c, pick) });
    else if (esperaAmigo(c)) { const p = g(() => ladoRival(byId(c.m), c.fp), null); if (p) ent.push({ k: c.to, p, s: c.stake, o: cuotaYa(c, p) }) }
    const gan = ent.filter((x) => x.p === pick), yo = gan.find((x) => x.k === k); if (!yo) return 0;
    const bote = ent.filter((x) => x.p !== pick).reduce((a, x) => a + x.s, 0), ws = gan.reduce((a, x) => a + x.s, 0);
    let dado = 0; const sh = gan.map((x) => { const v = ws ? Math.floor((bote * x.s) / ws) : 0; dado += v; return v });
    const i = gan.indexOf(yo);
    return Math.round(yo.s * (Number(yo.o) || 0)) + sh[i] + (i < bote - dado ? 1 : 0);
  }
  // lo de la banca por separado (para escribirlo en las tarjetas)
  const bancaDe = (c, k) => { const e = pl(c).find((x) => x.k === k); return e && c.v2 ? Math.round(c.stake * (Number(e.o) || 0)) : 0 };
  // lo que cobra k: lo que le pagaron (acabado), lo que se le devolvio (sin ganador) o, si aun no acabo, lo que cobraria si gana su lado
  function pagoDe(c, k) {
    const e = pl(c).find((x) => x.k === k); if (!e) return 0;
    if (c.st === 'void') return c.stake;
    if (c.v2) {
      if (/^won_/.test(c.st)) return e.bst === 'won' ? (e.pay || 0) + (e.x || 0) : e.bst === 'void' ? c.stake : 0;
      return pagoV2(c, e.p, k);
    }
    if (/^won_/.test(c.st)) return e.p === c.win ? parte(c, c.win, k) : 0;
    return parte(c, e.p, k);
  }
  // lo que cobraria alguien que entra ahora por ese lado
  const pagoSiEntra = (c, pick) => (c.v2 ? pagoV2(c, pick, g(() => MEK, null), true) : parte(c, pick, g(() => MEK, null), true));
  // cuota efectiva del reto para k: lo cobrado / lo puesto (2,00 en un 1v1 viejo). 0 si pierde, 1 si se devuelve, null si no acabo
  function cuotaEf(c, k) {
    if (c.st === 'void') return 1;
    if (!/^won_/.test(c.st)) return null;
    if (c.v2) { const e = pl(c).find((x) => x.k === k); return !e ? 0 : e.bst === 'void' ? 1 : e.bst === 'won' ? pagoDe(c, k) / c.stake : 0 }
    const gan = ganan(c); return gan.includes(k) ? pl(c).length / gan.length : 0;
  }
  // retirar (db/066): quien reta, sin nadie mas dentro, antes de empezar
  const puedeRetirar = (c) => g(() => c.from === MEK && c.st === 'pending' && pl(c).length === 1 && isOpen(byId(c.m)), false);
  const seguro = (c) => g(() => S.sure, '') === 'r' + c.id;
  const retirarBtn = (c, cls) => (puedeRetirar(c) ? `<button type="button" class="x-cancel rt-cx ${cls || ''} ${seguro(c) ? 'sure' : ''}" data-retirar="${c.id}">${g(() => IC_X, '')}${seguro(c) ? `<span>¿Seguro? Te devuelvo</span> <b class="num">${N(c.stake)}</b>` : '<span>Cancelar reto</span>'}</button>` : '');
  const abierto = (c) => c.st === 'pending' || c.st === 'accepted';
  // puedo entrar: no estoy dentro, el partido no ha empezado y el reto esta sin rival (abierto) o ya aceptado. Los retos a un amigo sin contestar no
  const puedeEntrar = (c) => !dentro(c) && g(() => isOpen(byId(c.m)), false) && ((c.st === 'pending' && c.ab) || c.st === 'accepted');
  const picksDe = (m) => g(() => picksOf(m), ['1', '2']);

  /* ---------- el lado del que acepta: el contrario al del que reta ---------- */
  // 1 <-> 2; si el que reta va con el empate, el rival se queda con el favorito (la cuota mas baja)
  function ladoRival(m, fp) {
    if (fp === '1') return '2';
    if (fp === '2') return '1';
    return g(() => (po(m, '1') <= po(m, '2') ? '1' : '2'), '1');
  }

  /* ---------- boton "Retar" (en las filas, la ficha y la ventana) ---------- */
  const btn = (m, cls) => (g(() => isOpen(m) && !(m.s === 'r' && m.fk !== 'duel'), false) ? `<button type="button" class="rt-btn ${cls || ''}" data-retar="${esc(m.id)}" aria-label="Retar">${SWORDS}<span>Retar</span></button>` : '');

  /* ---------- boton "Aceptar · pones 250, ganas 500" (banner, listas y tarjetas) ---------- */
  function aceptar(c, cls) {
    const m = g(() => byId(c.m)); if (!m) return '';
    const falta = c.stake - g(() => me().s, 0);
    if (falta > 0) return `<button type="button" class="rt-ok off ${cls || ''}" disabled><span>Te faltan</span> <b class="num">${N(falta)}</b>${g(() => coin(), '')}</button>`;
    const gana = pagoSiEntra(c, ladoRival(m, c.fp)) || c.stake * 2;
    return `<button type="button" class="rt-ok ${cls || ''}" data-accept="${c.id}"><span>Aceptar · pones</span> <b class="num">${N(c.stake)}</b><span>, ganas</span> <b class="num">${N(gana)}</b></button>`;
  }
  // "Unirme con Arsenal, pones 250": un boton por lado, un toque (la confirmacion es el propio boton). Sin saldo, apagado con lo que falta
  function unirme(c, p, cls) {
    const m = g(() => byId(c.m)); if (!m) return '';
    const falta = c.stake - g(() => me().s, 0), eq = p === 'X' ? '<b class="rt-eq">Empate</b>' : `<b class="rt-eq" data-notr>${esc(g(() => pn(m, p), p))}</b>`;
    if (falta > 0) return `<button type="button" class="rt-ok rt-j off ${cls || ''}" disabled><span class="rt-j1"><span>Unirme con</span> ${eq}</span><span class="rt-j2"><span>Te faltan</span> <b class="num">${N(falta)}</b></span></button>`;
    const gana = c.v2 ? pagoSiEntra(c, p) : 0;
    return `<button type="button" class="rt-ok rt-j ${cls || ''}" data-accept="${c.id}|${p}" data-lado="${p}"><span class="rt-j1"><span>Unirme con</span> ${eq}</span><span class="rt-j2"><span>pones</span> <b class="num">${N(c.stake)}</b>${gana ? `<span>, ganas</span> <b class="num">${N(gana)}</b>` : ''}</span></button>`;
  }
  // todos los lados a los que puedo unirme (los del partido: local, empate si hay, visitante)
  const botonesUnir = (c, cls) => (puedeEntrar(c) ? picksDe(byId(c.m)).map((p) => unirme(c, p, cls)).join('') : '');
  const paraMi = (c) => c.st === 'pending' && (c.to === MEK || (c.ab && c.from !== MEK && !dentro(c))) && g(() => isOpen(byId(c.m)), false);
  const accion = (c, cls) => (paraMi(c) ? `${aceptar(c, cls)}${c.ab ? '' : `<button type="button" class="rt-no" data-decline="${c.id}">No</button>`}` : '');

  /* ---------- aceptar en un toque ---------- */
  let ocupado = false;
  async function entra(id, pick) {
    if (ocupado) return;
    const c = g(() => CH.find((x) => x.id === id), null); if (!c) return;
    const m = byId(c.m); if (!m) return;
    if (c.stake > me().s) return toast(`Te faltan ${N(c.stake - me().s)}`);
    const p = pick || ladoRival(m, c.fp);
    if (dentro(c)) return toast('Ya estás dentro de este reto');
    ocupado = true;
    try {
      const unir = c.ab || c.st === 'accepted';   // reto abierto o ya aceptado: se entra; reto a ti: se acepta
      const { error } = unir ? await db.rpc('challenge_join', { p_id: id, p_pick: p }) : await db.rpc('challenge_answer', { p_id: id, p_accept: true, p_pick: p });
      if (error) { toast(errMsg(error)); return refresh() }
      toast(unir ? 'Has entrado en el reto' : 'Reto aceptado');
      await refresh();
    } finally { ocupado = false }
  }

  /* ---------- el panel de enviar un reto ---------- */
  const P = { m: null, to: 'any', p: null, stake: 250 };
  try { const v = Math.floor(+localStorage.getItem('gm-reto-stake')); if (v >= 1 && v <= MAXR) P.stake = v } catch {}
  const entero = (v) => Math.min(9999999, Math.max(0, parseInt(String(v).replace(/\D/g, ''), 10) || 0));
  let enviando = false;
  const cierra = () => { const el = document.getElementById('rt-pn'); if (!el) return; document.removeEventListener('keydown', tecla, true); el.classList.remove('on'); document.body.classList.remove('rt-pn-on'); setTimeout(() => el.remove(), 160) };
  const tecla = (e) => { if (e.key === 'Escape') { e.stopPropagation(); cierra() } };
  function abre(mid) {
    const m = byId(mid); if (!m || !isOpen(m)) return toast('Ese partido ya ha empezado');
    Object.assign(P, { m: mid, to: 'any', p: null });
    document.getElementById('rt-pn')?.remove();
    const el = document.createElement('div'); el.id = 'rt-pn'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    document.body.appendChild(el); document.body.classList.add('rt-pn-on');
    document.addEventListener('keydown', tecla, true);
    pintaPanel();
    requestAnimationFrame(() => el.classList.add('on'));
  }
  function pintaPanel() {
    const el = document.getElementById('rt-pn'); if (!el) return;
    const m = byId(P.m); if (!m) return cierra();
    const otros = F.filter((f) => !f.me), saldo = Math.max(0, me().s), st = P.stake, falta = st - saldo;
    const ps = picksOf(m), rival = P.p ? ladoRival(m, P.p) : null, tres = ps.includes('X');
    const quien = `<button type="button" class="rp-q ${P.to === 'any' ? 'on' : ''}" data-pn="to|any"><span class="av xl rt-any">${ANY}</span><b>Cualquiera</b></button>`
      + otros.map((f) => `<button type="button" class="rp-q ${P.to === f.id ? 'on' : ''}" data-pn="to|${f.id}">${av(f.id, 'xl')}<b data-notr>${esc(f.n)}</b></button>`).join('');
    const lado = (p) => p === 'X' ? `<button type="button" class="rp-l x ${P.p === 'X' ? 'on' : ''}" data-pn="p|X"><i class="rc-x">=</i><b>Empate</b></button>`
      : `<button type="button" class="rp-l ${P.p === p ? 'on' : ''}" data-pn="p|${p}">${logo(m, p === '1' ? 'a' : 'b')}<b data-notr>${esc(pn(m, p))}</b></button>`;
    const nota = !P.p ? '' : P.p === 'X' ? `<span>Tu rival se queda con</span> <b data-notr>${esc(pn(m, rival))}</b>` : `<span>Tu rival se queda con</span> <b data-notr>${esc(pn(m, rival))}</b>${tres ? ' <span>· si empatan y nadie va con el empate, perdéis los dos</span>' : ''}`;
    const quienN = P.to === 'any' ? '' : g(() => fr(P.to).n, '');
    const boton = st < 1 ? `<button type="button" class="go rp-go" disabled><span>Escribe cuánto</span></button>`
      : st > MAXR ? `<button type="button" class="go rp-go" disabled><span>El reto máximo es 100.000</span></button>`
      : falta > 0 ? `<button type="button" class="go rp-go" disabled><span>Te faltan</span> <b>${N(falta)}</b></button>`
      : !P.p ? `<button type="button" class="go rp-go" disabled><span>Elige tu lado</span></button>`
      : `<button type="button" class="go rp-go" data-pn="go"><span>Retar por</span> <b>${N(st)}</b></button>`;
    // lo que cobras si aciertas: tu apuesta a la banca (cuota de ahora, se queda fija al retar) + lo que pongan los que entren en contra
    const o = P.p ? po(m, P.p) : null, banca = o ? Math.round(st * o) : 0;
    const chip = (v, t, ti) => { const n = v === 'mitad' ? Math.floor(saldo / 2) : v === 'todo' ? Math.min(MAXR, saldo) : v; return `<button type="button" class="rp-f1 ${st === n && n > 0 ? 'on' : ''}" data-pn="st|${v}"${ti ? ` title="${ti}"` : ''}>${t}</button>` };
    const cobras = !P.p || !o || st < 1 ? `<span class="nw"><span>Pones</span> <b class="num">${N(st)}</b>${g(() => coin(), '')}</span> <span>·</span> <span class="nw"><span>elige tu lado para ver lo que cobras</span></span>`
      : `<span class="nw"><span>Si aciertas cobras</span> <b class="num">${N(banca)}</b>${g(() => coin(), '')}</span> <span class="nw"><span>de la banca (cuota</span> <b class="num">${O(o)}</b><span>)</span></span>
         <span class="nw"><span>+</span> <b class="num">${N(st)}</b>${g(() => coin(), '')} <span>${P.to === 'any' ? 'de cada uno que entre en contra' : 'de tu rival si acepta'}</span></span>
         <span class="rp-s2">Si nadie entra en contra, se queda como una apuesta normal a esa cuota</span>`;
    const html = `<div class="rp-f" data-pn="x"></div><section class="rp-c">
      <header><span class="lab">Retar</span><button type="button" class="rp-x" data-pn="x" aria-label="Cerrar"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></header>
      <p class="rp-m"><b data-notr>${esc(m.a)}</b> <i>vs</i> <b data-notr>${esc(m.b)}</b></p>
      <span class="lab">A quién</span><div class="rp-qs">${quien}</div>
      <span class="lab">Tu lado</span><div class="rp-ls n${ps.length}">${ps.map(lado).join('')}</div>
      <p class="rp-n">${nota}</p>
      <span class="lab">Cuánto</span><div class="rp-cf"><label class="rp-in"><input type="text" inputmode="numeric" autocomplete="off" maxlength="7" data-pn-in value="${st || ''}" placeholder="250" aria-label="Cuánto">${g(() => coin(), '')}</label>
        <div class="rp-fs">${chip(10, '10')}${chip(50, '50')}${chip(100, '100')}${chip('mitad', '1/2', 'La mitad de tu saldo')}${chip('todo', 'Todo', 'Todo tu saldo (máximo 100.000)')}</div></div>
      ${boton}
      <p class="rp-s">${cobras}</p>
      <p class="rp-no">${LOCK}<span>Puedes cancelarlo mientras no entre nadie y no empiece el partido</span></p></section>`;
    if (el.dataset.k === html) return;
    // escribiendo el importe: se repinta todo menos el cursor, que sigue donde estaba
    const ae = document.activeElement, foco = !!(ae && ae.matches && ae.matches('#rt-pn [data-pn-in]')), pos = foco ? ae.selectionStart : 0;
    el.dataset.k = html; el.innerHTML = html; tr(el);
    if (foco) { const i = el.querySelector('[data-pn-in]'); if (i) { i.focus(); try { i.setSelectionRange(pos, pos) } catch {} } }
  }
  async function envia() {
    if (enviando) return;
    const m = byId(P.m), any = P.to === 'any', to = any ? null : fr(P.to);
    if (!m || !P.p || P.stake < 1 || P.stake > MAXR || P.stake > me().s) return;
    if (!isOpen(m)) { cierra(); return toast('Ese partido ya ha empezado') }
    enviando = true;
    const b = document.querySelector('#rt-pn [data-pn="go"]'); if (b) b.disabled = true;
    try {
      const { error } = await db.rpc('challenge_create', { p_match: P.m, p_to: any ? null : to.uid, p_pick: P.p, p_stake: P.stake });
      if (error) { toast(errMsg(error)); if (b) b.disabled = false; return }
      try { localStorage.setItem('gm-reto-stake', String(P.stake)) } catch {}
      cierra();
      toast(any ? 'Reto abierto: puede entrar cualquiera' : `Reto enviado a <b data-notr>${esc(to.n)}</b>`);
      await refresh();
    } finally { enviando = false }
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-pn]'); if (!t || !t.closest('#rt-pn')) return;
    e.stopPropagation();
    const [k, v] = t.dataset.pn.split('|');
    if (k === 'x') return cierra();
    if (k === 'to') P.to = v; else if (k === 'p') P.p = v;
    else if (k === 'st') { const s = Math.max(0, me().s); P.stake = v === 'mitad' ? Math.floor(s / 2) : v === 'todo' ? Math.min(MAXR, s) : +v; try { if (P.stake >= 1) localStorage.setItem('gm-reto-stake', String(P.stake)) } catch {} }
    else if (k === 'go') return envia();
    pintaPanel();
  }, true);
  // el importe escrito a mano (como en el boleto: solo numeros)
  document.addEventListener('input', (e) => {
    const t = e.target; if (!t.matches || !t.matches('#rt-pn [data-pn-in]')) return;
    const v = entero(t.value); if (String(v || '') !== t.value) t.value = v || '';
    P.stake = v; try { if (v >= 1 && v <= MAXR) localStorage.setItem('gm-reto-stake', String(v)) } catch {}
    pintaPanel();
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches && e.target.matches('#rt-pn [data-pn-in]')) { e.preventDefault(); envia() } }, true);

  /* ---------- avisos (los llama avisos() de app.js tras cada carga) ---------- */
  const ABIERTOS = new Set();   // retos que alguna vez se vieron abiertos: app.js no repite su "X acepta tu reto"
  let PREV = null;
  const fueAbierto = (id) => ABIERTOS.has(id);
  function tras() {
    if (!g(() => Array.isArray(CH) && typeof MEK !== 'undefined', false)) return;
    const now = new Map(CH.map((c) => [c.id, { st: c.st, ab: !!c.ab, ks: pl(c).map((x) => x.k) }]));
    if (PREV) for (const c of CH) {
      const p = PREV.get(c.id), m = byId(c.m); if (!m) continue;
      if (!p && c.st === 'pending' && c.ab && c.from !== MEK && isOpen(m)) avisa(`${fr(c.from).n} reta a cualquiera`, `${m.a} vs ${m.b} · pones ${N(c.stake)}, ganas ${N(pagoSiEntra(c, ladoRival(m, c.fp)) || c.stake * 2)}`);
      // alguien entra en un reto en el que estoy (el mio abierto, o uno al que me uni)
      if (p && p.ks.includes(MEK)) {
        const nuevos = pl(c).filter((x) => !p.ks.includes(x.k) && x.k !== MEK);
        if (nuevos.length) {
          const n = fr(nuevos[0].k).n + (nuevos.length > 1 ? ` +${nuevos.length - 1}` : '');
          avisa(`${n} entra en tu reto`, `${m.a} vs ${m.b} · ${N(bote(c))} en juego · ${nvm(c)}`);
          toast(`<b data-notr>${esc(n)}</b> entra en tu reto`);
        }
      }
    }
    for (const c of CH) if (c.ab) ABIERTOS.add(c.id);
    PREV = now;
    pinta();
  }

  /* ---------- tarjeta de "te han retado" y puntos del menu ---------- */
  const LUEGO = new Set();   // los que has dejado para luego (hasta recargar)
  const pendientes = () => g(() => CH.filter(paraMi), []);
  function pinta() {
    if (!listo()) { document.getElementById('rt-av')?.remove(); return }
    const pend = pendientes(), ver = pend.filter((c) => !LUEGO.has(c.id));
    const nav = document.getElementById('nav');
    if (nav) for (const k of ['inicio', 'apuestas']) { const b = nav.querySelector(`.nv[data-scr="${k}"]`); if (!b) continue; const t = b.querySelector('.rt-pt'); if (pend.length && !t) b.insertAdjacentHTML('beforeend', '<i class="nv-pt rt-pt" title="Retos que esperan"></i>'); else if (!pend.length && t) t.remove() }
    let el = document.getElementById('rt-av');
    if (!ver.length) { if (el) el.remove(); return }
    if (!el) { el = document.createElement('div'); el.id = 'rt-av'; el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Retos para ti'); document.body.appendChild(el) }
    const c = ver[0], m = byId(c.m), f = fr(c.from), otros = pend.length - 1, mio = ladoRival(m, c.fp);
    const html = `<div class="rtb-c ${c.ab ? 'ab' : ''}">${av(c.from, 'xl')}
      <div class="rtb-t"><span class="lab"><span>${c.ab ? 'Reto abierto' : 'Reto para ti'}</span>${otros > 0 ? `<span> · </span><span>+${otros}</span>` : ''}</span>
        <p><b data-notr>${esc(f.n)}</b> <span>${c.ab ? 'reta a cualquiera' : 'te reta'}</span></p>
        <small><span data-notr>${esc(m.a)} vs ${esc(m.b)}</span> <span>·</span> <span>tú irías con</span> <b data-notr>${esc(pn(m, mio))}</b> <span>·</span> <span>empieza en</span> <b class="num">${g(() => CD(m.at), '')}</b></small>
        <div class="rtb-b">${aceptar(c)}${c.ab ? '' : `<button type="button" class="rt-no" data-decline="${c.id}">No</button>`}<button type="button" class="rt-no" data-rtb-luego="${c.id}">Luego</button></div>
      </div></div>`;
    const k = html + g(() => GM_LANG.get(), '') + S.scr + me().s;
    const top = document.getElementById('top'), lb = document.getElementById('livebar');
    const y = Math.round(((lb && !lb.hidden && lb.getBoundingClientRect().height ? lb.getBoundingClientRect().bottom : top ? top.getBoundingClientRect().bottom : 64)) + 8);
    el.style.top = y + 'px';
    if (el.dataset.k !== k) { el.dataset.k = k; el.innerHTML = html; tr(el) }
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rtb-luego]'); if (!b) return;
    e.stopPropagation(); LUEGO.add(+b.dataset.rtbLuego); pinta();
  }, true);
  let pend = false;
  const vigila = () => { if (pend) return; pend = true; queueMicrotask(() => { pend = false; try { pinta() } catch (e) { if (!vigila.av) { vigila.av = 1; console.warn('retos.js', e) } } }) };
  for (const id of ['top', 'nav']) { const n = document.getElementById(id); if (n) new MutationObserver(vigila).observe(n, { childList: true }) }
  const app = document.getElementById('app'); if (app) new MutationObserver(vigila).observe(app, { attributes: true, attributeFilter: ['hidden'] });
  addEventListener('resize', vigila);
  document.addEventListener('visibilitychange', vigila);

  window.GM_RETOS = { abre, entra, tras, abiertoOK, fueAbierto, pinta, pendientes, btn, aceptar, accion, paraMi, ladoRival, forzar() {}, repinta: pintaPanel,
    pl, dentro, lados, nvm, bote, nEntradas, ganan, final, pagoDe, pagoSiEntra, cuotaEf, abierto, puedeEntrar, unirme, botonesUnir, esperaAmigo, picksDe,
    pagoV2, bancaDe, puedeRetirar, retirarBtn };
})();
