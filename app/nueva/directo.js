// Apostar en directo (db/031, PM 31-10: "ok todas" a "apostar con el partido ya empezado, con cuotas en vivo").
// En la ficha de un partido en juego, app.js deja un hueco (.lv-ap[data-lvap]); aqui se pide live_quote cada 20 s y se pinta:
// las tres cuotas en vivo, el importe y Apostar en directo con confirmacion de dos toques. La apuesta queda en revision hasta la
// siguiente lectura del directo (si cambia el marcador justo al apostar, se anula y se devuelve todo): se avisa debajo.
// Va aparte, como extras.js: usa lo global de app.js (db, toast, refresh, me, byId, pn).
'use strict';
(function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const N = (x) => String(Math.round(x || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, document.documentElement.lang === 'en' ? ',' : '.');
  const O = (x) => Number(x).toFixed(2).replace('.', document.documentElement.lang === 'en' ? '.' : ',');
  const coin = () => '<span class="cn"></span>';
  const g = (f) => { try { return f() } catch { return undefined } };
  const traduce = (el) => { if (window.GM_LANG && el) { try { GM_LANG.traduce(el) } catch {} } };
  const Q = new Map();                                  // partido -> { t, q, vivo }
  const V = { m: null, pick: null, st: 100, sure: 0, busy: false, msg: '' };

  async function pide(mid, forzar) {
    const x = Q.get(mid) || { t: 0, q: null, vivo: false }; Q.set(mid, x);
    if (x.vivo || (!forzar && Date.now() - x.t < 20e3)) return;
    x.vivo = true;
    try { const { data, error } = await db.rpc('live_quote', { p_match: mid }); if (error) throw error; x.q = data }
    catch (e) { x.q = { ok: false, why: /Could not find|PGRST202/.test(String(e && (e.message || e.code))) ? '' : 'No se han podido cargar las cuotas en directo' } }
    x.t = Date.now(); x.vivo = false; pinta();
  }

  function html(mid, q) {
    const m = g(() => byId(mid)); if (!m) return '';
    if (!q || !q.ok) return `<p class="hint">${q && q.why ? `${esc(q.why)}. ` : ''}Se paga solo al acabar.</p>`;
    if (V.m !== mid) { V.m = mid; V.pick = null; V.sure = 0; V.msg = '' }
    const picks = ['1', 'X', '2'].filter((p) => q.odds[p] != null);
    if (V.pick && q.odds[V.pick] == null) V.pick = null;
    const queda = Math.max(0, (q.tope || 1000) - (q.usado || 0)), o = V.pick ? q.odds[V.pick] : null, sure = V.sure && Date.now() - V.sure < 5000;
    const nom = (p) => g(() => pn(m, p)) || p;
    return `<div class="lv-h"><span class="lab"><i class="dot"></i>Apostar en directo</span><small>la cuota se mueve con el marcador</small></div>
      <div class="lv-os">${picks.map((p) => `<button type="button" class="lv-o ${V.pick === p ? 'on' : ''}" data-lv="pick" data-p="${p}"><small>${esc(nom(p))}</small><b>${O(q.odds[p])}</b></button>`).join('')}</div>
      ${V.pick ? `<div class="lv-st"><label class="lv-in"><input type="text" inputmode="numeric" maxlength="6" data-lv-st value="${V.st || ''}" aria-label="Importe">${coin()}</label>
        <span class="lv-ch">${[50, 100, 250, 500].map((v) => `<button type="button" class="chip ${V.st === v ? 'on' : ''}" data-lv="st" data-v="${v}">${v}</button>`).join('')}</span>
        <span class="lv-co">Cobrarías <b>${N(V.st * o)}</b>${coin()}</span></div>
      <button type="button" class="go lv-go ${sure ? 'sure' : ''}" data-lv="go" ${V.busy || V.st < 1 || V.st > queda ? 'disabled' : ''}>${V.busy ? 'Apostando…' : sure ? '¿Seguro? Toca otra vez' : `Apostar ${N(V.st)} a ${esc(nom(V.pick))} en directo`}</button>` : ''}
      ${V.msg ? `<p class="lv-msg">${V.msg}</p>` : ''}
      <p class="lv-nota">Hasta ${N(queda)} más en directo en este partido. Tu apuesta queda en revisión hasta la siguiente lectura del marcador: si hubo gol o mapa justo al apostar, se anula y te devuelve todo.</p>`;
  }
  let firma = '';
  function pinta() {
    const el = document.querySelector('.lv-ap[data-lvap]'); if (!el) return;
    const mid = el.dataset.lvap, x = Q.get(mid);
    if (!x || !x.q) { pide(mid); return }
    if (Date.now() - x.t > 20e3) pide(mid);
    const f = JSON.stringify([mid, x.q, V.pick, V.st, V.sure, V.busy, V.msg, document.documentElement.lang]);
    if (f === firma && el.dataset.f === '1') return;
    const foco = document.activeElement && el.contains(document.activeElement) && document.activeElement.matches('input');
    if (foco) return;                                    // no se repinta mientras escribes el importe
    firma = f; el.dataset.f = '1';
    el.innerHTML = html(mid, x.q); traduce(el);
  }

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-lv]'); if (!b || !b.closest('.lv-ap')) return;
    e.stopPropagation();
    const k = b.dataset.lv, mid = b.closest('.lv-ap').dataset.lvap, x = Q.get(mid);
    if (k === 'pick') { V.pick = V.pick === b.dataset.p ? null : b.dataset.p; V.sure = 0; V.msg = '' }
    else if (k === 'st') { V.st = +b.dataset.v; V.sure = 0 }
    else if (k === 'go') {
      if (V.busy || !V.pick || !x || !x.q || !x.q.ok) return;
      if (!V.sure || Date.now() - V.sure > 5000) { V.sure = Date.now(); firma = ''; pinta(); setTimeout(() => { if (V.sure && Date.now() - V.sure >= 5000) { V.sure = 0; firma = ''; pinta() } }, 5100); return }
      V.sure = 0; V.busy = true; firma = ''; pinta();
      try {
        const { data, error } = await db.rpc('place_live_bet', { p_match: mid, p_pick: V.pick, p_stake: V.st, p_min: x.q.odds[V.pick] });
        if (error) throw error;
        V.msg = `Ha entrado a ${O(data.odds)}. En revisión hasta la siguiente lectura del marcador.`; V.pick = null;
        g(() => toast(`En directo: <b>${N(V.st)}</b> a ${O(data.odds)}`));
        g(() => refresh());
      } catch (err) { const t = String((err && err.message) || ''); V.msg = esc(!t || /Failed to fetch|NetworkError|Load failed/i.test(t) ? 'Sin conexión: no ha entrado' : t.replace(/^(Error|P0001):\s*/i, '')) }
      V.busy = false; await pide(mid, true);
    }
    firma = ''; pinta();
  }, true);
  document.addEventListener('input', (e) => {
    if (!e.target.matches('[data-lv-st]')) return;
    const v = Math.min(999999, parseInt(String(e.target.value).replace(/\D/g, ''), 10) || 0); e.target.value = v || '';
    V.st = v; V.sure = 0;
    const el = e.target.closest('.lv-ap'), x = el && Q.get(el.dataset.lvap), co = el && el.querySelector('.lv-co b');
    if (co && x && x.q && x.q.ok && V.pick) co.textContent = N(v * x.q.odds[V.pick]);
  });
  document.addEventListener('focusout', (e) => { if (e.target.matches && e.target.matches('[data-lv-st]')) { firma = ''; setTimeout(pinta, 0) } });

  let pendiente = false;
  new MutationObserver(() => { if (pendiente) return; pendiente = true; queueMicrotask(() => { pendiente = false; const el = document.querySelector('.lv-ap[data-lvap]'); if (el && el.dataset.f !== '1') { firma = ''; pinta() } }) })
    .observe(document.documentElement, { childList: true, subtree: true });
  setInterval(() => { if (!document.hidden && document.querySelector('.lv-ap[data-lvap]')) pinta() }, 5e3);
})();
