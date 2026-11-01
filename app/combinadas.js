// Tus combinadas en Mis apuestas (db/029, PM 30-10 noche: "has hecho lo de las apuestas combinadas? hazlo").
// Una tarjeta por combinada: sus partidos con lo que elegiste y como va cada uno (acertado, fallado, anulado, en juego o por
// empezar), la cuota total, lo apostado y lo que cobras o cobraste, y Cancelar (devuelve todo) hasta que empiece el primero.
// Va aparte, como extras.js: rellena #cmb-slot (lo pone app.js) y usa lo global de app.js (db, ME, S, toast, refresh).
'use strict';
(function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const N = (x) => String(Math.round(x || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, document.documentElement.lang === 'en' ? ',' : '.');
  const O = (x) => Number(x).toFixed(2).replace('.', document.documentElement.lang === 'en' ? '.' : ',');
  const coin = () => '<span class="cn"></span>';
  const g = (f) => { try { return f() } catch { return undefined } };
  const traduce = (el) => { if (window.GM_LANG && el) { try { GM_LANG.traduce(el) } catch {} } };
  const IC_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>';
  const C = { t: 0, list: null, vivo: false, sure: 0, busy: false, err: '' };
  // cancelar en directo (db/033): lo que vale cada combinada tuya abierta con algun partido empezado, cada 20 s
  const CQ = { t: 0, q: new Map(), vivo: false, sure: 0, busy: false };
  async function cargaCQ(forzar) {
    if (CQ.vivo || (!forzar && Date.now() - CQ.t < 20e3)) return;
    CQ.vivo = true;
    try { const { data, error } = await db.rpc('combo_cash_quotes'); if (error) throw error; CQ.q = new Map((data || []).map((x) => [x.combo, x])) } catch { }
    CQ.t = Date.now(); CQ.vivo = false; pinta(true);
  }
  function botonCQ(c) {
    const q = CQ.q.get(c.id); if (!q || q.mode === 'pre') return '';
    if (!q.ok) return `<button class="xc-btn off" disabled title="${esc(q.why || '')}">Cancelar no disponible</button>`;
    const sure = CQ.sure === c.id, dif = q.value - c.stake;
    return `<button class="xc-btn ${sure ? 'sure' : ''} ${dif < 0 ? 'neg' : 'pos'}" data-cmb-co="${c.id}" data-v="${q.value}">${sure ? `¿Seguro? Cobras <b>${N(q.value)}</b>${coin()}<span>, ${dif < 0 ? 'pierdes' : 'ganas'} ${N(Math.abs(dif))}</span>` : `Cancelar · cobras <b>${N(q.value)}</b>${coin()}`}</button>`;
  }

  async function carga(forzar) {
    const me = g(() => ME); if (!me || C.vivo || (!forzar && Date.now() - C.t < 30e3)) return;
    C.vivo = true;
    try {
      // las de todos (las ven todos, como las apuestas sueltas): Mis apuestas se queda con las tuyas
      const { data, error } = await db.from('combos')
        .select('id,player,stake,odds,status,payout,created_at,settled_at,combo_legs(match_id,pick,odds,result,matches(home,away,sport,status,starts_at,score,winner))')
        .order('created_at', { ascending: false }).limit(80);
      if (error) throw error;
      C.todas = data || []; C.list = C.todas.filter((c) => c.player === me); C.err = '';
    } catch (e) { C.err = /does not exist|PGRST/.test(String(e && (e.message || e.code))) ? '' : 'No se han podido cargar tus combinadas'; if (!C.list) C.list = [] }
    C.t = Date.now(); C.vivo = false; pinta(true); avisaIni();
    if (C.list.some((c) => c.status === 'open' && (c.combo_legs || []).some((l) => l.matches && empezado(l.matches)))) cargaCQ();
  }

  // Inicio (inicio.js, 01-11) lee de aqui las combinadas de todos y se repinta cuando cambian (sin pedir nada mas a la base)
  let firmaIni = '';
  function avisaIni() {
    const f = JSON.stringify((C.todas || []).map((c) => [c.id, c.status, (c.combo_legs || []).map((l) => [l.result, l.matches && l.matches.status])]));
    if (f === firmaIni) return; firmaIni = f;
    try { window.dispatchEvent(new CustomEvent('gm:cmb-datos')) } catch {}
  }
  window.GM_CMB = { todas: () => C.todas || null, carga: (f) => carga(f) };
  const nombre = (m, p) => (p === '1' ? m.home : p === '2' ? m.away : p === 'X' ? 'Empate' : window.GM_MK ? GM_MK.nombre({ a: m.home, b: m.away }, p) : p);   // mercados nuevos (db/036)
  const empezado = (m) => m.status !== 'scheduled' || Date.parse(m.starts_at) <= Date.now();
  function estadoPata(l) {
    const m = l.matches || {};
    if (l.result === 'won') return ['ok', '✓', 'Acertado'];
    if (l.result === 'lost') return ['ko', '✗', 'Fallado'];
    if (l.result === 'void') return ['nul', '·', 'Anulado: cuenta como 1'];
    if (m.status === 'live' || (m.status === 'scheduled' && Date.parse(m.starts_at) <= Date.now())) return ['vivo', '●', 'En juego'];
    return ['pend', '', ''];
  }
  const cuando = (t) => g(() => new Intl.DateTimeFormat(document.documentElement.lang === 'en' ? 'en-GB' : 'es-ES', { timeZone: 'Europe/Madrid', weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(t))) || '';
  function tarjeta(c) {
    const legs = (c.combo_legs || []).slice().sort((a, b) => Date.parse(a.matches?.starts_at || 0) - Date.parse(b.matches?.starts_at || 0));
    const puede = c.status === 'open' && legs.length && legs.every((l) => l.matches && !empezado(l.matches));
    const sello = { open: '', won: `<span class="cmb-sello won">COBRADA<b>${N(c.payout)}${coin()}</b></span>`, lost: '<span class="cmb-sello lost">PERDIDA</span>', void: `<span class="cmb-sello void">DEVUELTA<b>${N(c.payout || c.stake)}${coin()}</b></span>`, cashout: `<span class="cmb-sello ${c.payout >= c.stake ? 'won' : 'void'}">CANCELADA<b>${N(c.payout)}${coin()}</b></span>` }[c.status] || '';
    const hechas = legs.filter((l) => l.result === 'won').length;
    const sure = C.sure === c.id;
    return `<article class="cmb ${c.status}">
      <header><span class="cmb-t">Combinada de ${legs.length}</span>${c.status === 'open' ? `<span class="cmb-va">${hechas} de ${legs.length} acertados</span>` : ''}<span class="cmb-no">Nº C${String(c.id).padStart(5, '0')}</span></header>
      <div class="cmb-ls">${legs.map((l) => { const m = l.matches || {}, [k, ic, tx] = estadoPata(l); return `<div class="cmb-l ${k}">
        <i class="cmb-i">${ic}</i><span class="cmb-p"><b>${esc(nombre(m, l.pick))}</b><small>${esc(m.home || '')} vs ${esc(m.away || '')}${m.score && (m.status === 'live' || m.status === 'final') ? ` · ${esc(String(m.score).split(' ')[0])}` : ` · ${esc(cuando(m.starts_at))}`}</small></span>
        <span class="cmb-o">${O(l.odds)}${tx ? `<small>${tx}</small>` : ''}</span></div>` }).join('')}</div>
      <div class="cmb-n"><span><small>Cuota</small><b>${O(c.odds)}</b></span><span><small>Apostado</small><b>${N(c.stake)}${coin()}</b></span>
        ${c.status === 'open' ? `<span class="cmb-co"><small>Cobrarías</small><b>${N(c.stake * c.odds)}${coin()}</b></span>` : sello}
        ${puede ? `<button class="x-cancel ${sure ? 'sure' : ''}" data-cmb-cancel="${c.id}">${IC_X}${sure ? `¿Seguro? Te devuelvo ${N(c.stake)}` : 'Cancelar combinada'}</button>` : c.status === 'open' && c.player === g(() => ME) ? botonCQ(c) : ''}</div>
    </article>`;
  }
  /* ---------- Apuestas de todos y el perfil (PM 31-10: "que salgan en Apuestas de todos y en el perfil") ---------- */
  const quien = (uid) => g(() => F.find((f) => f.uid === uid));
  const ava = (f) => (f ? g(() => av(f.id, 'sm')) || '' : '');
  function filaTodos(c) {
    const f = quien(c.player), legs = (c.combo_legs || []).slice().sort((a, b) => Date.parse(a.matches?.starts_at || 0) - Date.parse(b.matches?.starts_at || 0));
    const fin = c.status === 'won' ? `<em class="up">+${N(c.payout)}${coin()}</em>` : c.status === 'lost' ? '<em class="dn">perdida</em>' : c.status === 'void' ? '<em>devuelta</em>' : c.status === 'cashout' ? `<em>cancelada · ${N(c.payout)}${coin()}</em>` : `<em>→ ${N(c.stake * c.odds)}${coin()}</em>`;
    // PM 01-11: lo resuelto con el color de la franja de resultado.js (pastilla .rsl-chip), si esta cargado
    const dif = (c.payout || 0) - c.stake, chip = (k, v) => `<span class="rsl-chip" data-r="${k}">${v > 0 ? '▲ ' : v < 0 ? '▼ ' : ''}${N(Math.abs(v))}${coin()}</span>`;
    const fin2 = !window.GM_RES || c.status === 'open' ? fin : c.status === 'won' ? chip('won', dif) : c.status === 'lost' ? chip('lost', -c.stake) : c.status === 'void' ? `<span class="rsl-chip" data-r="void">${N(c.payout || c.stake)}${coin()}</span>` : chip('cash', dif);
    return `<div class="cmt ${c.status}" style="--c:var(--f-${f ? f.id : 'pm'})">${ava(f)}<div class="cmt-b"><p><b>${esc(f ? f.n : '?')}</b> <span>Combinada de ${legs.length} · cuota ${O(c.odds)}</span></p>
      <p class="cmt-ls">${legs.map((l) => { const [k, ic] = estadoPata(l); return `<span class="cmt-l ${k}"><i>${ic || '·'}</i>${esc(nombre(l.matches || {}, l.pick))}</span>` }).join('')}</p></div>
      <span class="cmt-v"><b>${N(c.stake)}${coin()}</b>${fin2}</span></div>`;
  }
  function pintaTodos(slot) {
    const recientes = (C.todas || []).filter((c) => c.status === 'open' || Date.parse(c.settled_at || 0) > Date.now() - 2 * 864e5);
    const f = JSON.stringify(['t', recientes.map((c) => [c.id, c.status, (c.combo_legs || []).map((l) => l.result)]), document.documentElement.lang]);
    if (slot.dataset.f === f && slot.childElementCount) return;
    slot.dataset.f = f;
    slot.innerHTML = !recientes.length ? '' : `<div class="sec-h ab-sec"><h2>Combinadas</h2><i>${recientes.filter((c) => c.status === 'open').length} en juego</i></div><div class="cmt-s">${recientes.map(filaTodos).join('')}</div>`;
    traduce(slot);
  }
  function pintaPerfil(slot) {
    const f = g(() => F.find((x) => x.id === slot.dataset.k)); if (!f) return;
    const suyas = (C.todas || []).filter((c) => c.player === f.uid);
    const firmaP = JSON.stringify(['p', f.id, suyas.map((c) => [c.id, c.status]), document.documentElement.lang]);
    if (slot.dataset.f === firmaP && slot.childElementCount) return;
    slot.dataset.f = firmaP;
    if (!suyas.length) { slot.innerHTML = ''; return }
    const gan = suyas.filter((c) => c.status === 'won'), per = suyas.filter((c) => c.status === 'lost'), abiertas = suyas.filter((c) => c.status === 'open');
    const neto = [...gan, ...per].reduce((t, c) => t + (c.status === 'won' ? c.payout - c.stake : -c.stake), 0), mejor = gan.reduce((m, c) => Math.max(m, +c.odds), 0);
    slot.innerHTML = `<div class="rd-gw cmp"><h4>Combinadas</h4><p class="rd-s">${suyas.length} hechas · ${gan.length} ${gan.length === 1 ? 'ganada' : 'ganadas'} · ${per.length} ${per.length === 1 ? 'perdida' : 'perdidas'}${abiertas.length ? ` · ${abiertas.length} en juego` : ''}</p>
      <div class="cmp-n"><span><small>Beneficio</small><b class="${neto > 0 ? 'up' : neto < 0 ? 'dn' : ''}">${neto > 0 ? '▲' : neto < 0 ? '▼' : ''}${N(Math.abs(neto))}${coin()}</b></span>${mejor ? `<span><small>Mejor cuota acertada</small><b>${O(mejor)}</b></span>` : ''}</div>
      <div class="cmt-s">${suyas.slice(0, 3).map(filaTodos).join('')}</div></div>`;
    traduce(slot);
  }
  function pintaOtros() {
    const t = document.getElementById('cmb-todos'), p = document.getElementById('cmb-perfil');
    if (!t && !p) return;
    if (!C.todas) { carga(); return }
    if (t) pintaTodos(t);
    if (p) pintaPerfil(p);
  }

  let firma = '';
  function pinta(todo) {
    pintaOtros();
    const slot = document.getElementById('cmb-slot'); if (!slot) return;
    if (!C.list) { carga(); return }
    const abiertas = C.list.filter((c) => c.status === 'open'), cerradas = C.list.filter((c) => c.status !== 'open').slice(0, 6);
    const f = JSON.stringify([C.list.map((c) => [c.id, c.status, (c.combo_legs || []).map((l) => l.result + (l.matches && l.matches.status))]), C.sure, C.err, document.documentElement.lang, [...CQ.q.values()].map((x) => [x.combo, x.ok, x.value]), CQ.sure, CQ.busy]);
    if (!todo && f === firma && slot.childElementCount) return;
    firma = f;
    slot.innerHTML = !C.list.length ? '' : `<div class="sec-h mb-h"><h2>Combinadas</h2><i>${abiertas.length}</i></div>
      ${abiertas.length ? `<div class="cmb-cs">${abiertas.map(tarjeta).join('')}</div>` : '<p class="hint">Ninguna en juego. En Partidos, mete 2 o más cuotas en el boleto y elige Combinada.</p>'}
      ${cerradas.length ? (window.GM_RES ? `<div class="rsl-g">${cerradas.map((c, i) => GM_RES.combinada(c, { i }) || tarjeta(c)).join('')}</div>` : `<div class="cmb-cs cerr">${cerradas.map(tarjeta).join('')}</div>`) : ''}${C.err ? `<p class="hint">${esc(C.err)}</p>` : ''}`;
    traduce(slot);
  }

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-cmb-cancel]'); if (!b) return;
    e.stopPropagation(); e.preventDefault();
    const id = +b.dataset.cmbCancel; if (C.busy) return;
    if (C.sure !== id) { C.sure = id; pinta(true); setTimeout(() => { if (C.sure === id) { C.sure = 0; pinta(true) } }, 3500); return }
    C.sure = 0; C.busy = true;
    try { const { data, error } = await db.rpc('cancel_combo', { p_id: id }); if (error) throw error; g(() => toast(`Combinada cancelada: te devuelvo <b>${N(data.devuelto)}</b>`)) }
    catch (err) { g(() => toast(esc(String((err && err.message) || 'No se ha podido cancelar')))) }
    C.busy = false; await carga(true); g(() => refresh());
  }, true);
  window.addEventListener('gm:combo', () => carga(true));
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-cmb-co]'); if (!b) return;
    e.stopPropagation(); e.preventDefault();
    const id = +b.dataset.cmbCo; if (CQ.busy) return;
    if (CQ.sure !== id) { CQ.sure = id; pinta(true); setTimeout(() => { if (CQ.sure === id) { CQ.sure = 0; pinta(true) } }, 6000); return }
    CQ.sure = 0; CQ.busy = true; pinta(true);
    try { const { data, error } = await db.rpc('combo_cash_out', { p_id: id, p_min: +b.dataset.v }); if (error) throw error; g(() => toast(`Combinada cancelada: cobras <b>${N(data.value)}</b>`)) }
    catch (err) { const t = String((err && err.message) || ''); g(() => toast(esc(!t || /Failed to fetch|NetworkError/i.test(t) ? 'Sin conexión: no se ha cancelado' : t.replace(/^(Error|P0001):\s*/i, '')))) }
    CQ.busy = false; await carga(true); await cargaCQ(true); g(() => refresh());
  }, true);

  // cada vez que la app pinta Mis apuestas, el hueco vuelve vacio: se rellena con lo que ya hay y se refresca si es viejo
  let pendiente = false;
  new MutationObserver(() => {
    if (pendiente) return; pendiente = true;
    queueMicrotask(() => {
      pendiente = false;
      const s = document.getElementById('cmb-slot'), t = document.getElementById('cmb-todos'), p = document.getElementById('cmb-perfil');
      if ((s && !s.childElementCount) || (t && !t.childElementCount) || (p && !p.childElementCount)) { pinta(true); carga() }
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(() => { if (document.querySelector('#cmb-slot, #cmb-todos, #cmb-perfil') && !document.hidden) carga() }, 60e3);
})();
