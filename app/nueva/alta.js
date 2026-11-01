// Anadir amigo (01-11). PM: "vamos a meter a mi amigo Sebastian, se llamara Sebas en la app". Una seccion mas en Ajustes que
// solo ve el admin: escribe el nombre, la base (db/043 admin_alta) crea la cuenta con usuario, color y contrasena, y aqui se
// ensenan para pasarselos. La contrasena no se guarda en ningun sitio: si se cierra, se cambia desde Supabase.
// Contrasenas de los amigos (01-11, db/044). PM: "mis colegas son capaces de perder todo eso". Las que elige cada uno no se
// guardan ni se ven; el admin le pone una nueva a quien la pierda (dos toques) y ve quien cambio la suya y cuando.
'use strict';
(function () {
  const en = () => !!(window.GM_LANG && GM_LANG.get() === 'en');
  const T = (es, e) => (en() ? e : es);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const soyAdmin = () => { try { return !!me().admin } catch (e) { return false } };
  const amigos = () => { try { return F.filter((f) => !f.me) } catch (e) { return [] } };
  let ultimo = null;                                                     // la ultima alta, para que no se pierda al repintar Ajustes
  let nueva = null;                                                      // la ultima contrasena puesta por el admin
  let seguro = null;                                                     // uid al que ya se le dio el primer toque
  let LOG = null;                                                        // admin_pass_log
  let PASS = {};                                                         // admin_pass_ver: uid -> contrasena apuntada

  const ficha = (r, txt) => `<div class="alta-ok"><b>${esc(r.nombre)}</b> ${txt}
      <dl><dt>${T('Usuario', 'Username')}</dt><dd>${esc(r.usuario)}</dd><dt>${T('Contraseña', 'Password')}</dt><dd>${esc(r.contrasena)}</dd></dl>
      <button class="aj-a" data-alta-copia="${r === nueva ? 'n' : 'a'}">${T('Copiar los dos', 'Copy both')}</button></div>`;
  const res = (r) => ficha(r, T('ya está dentro. Pásale esto:', 'is in. Send them this:'));
  const fecha = (t) => { const d = new Date(t); return d.toLocaleDateString(en() ? 'en-GB' : 'es-ES', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) };
  function logHtml() {
    if (LOG === null) return `<p class="aj-n">${T('Cargando…', 'Loading…')}</p>`;
    if (LOG === false) return `<p class="aj-n">${T('Falta cargar db/044 en Supabase', 'db/044 is not loaded yet')}</p>`;
    if (!LOG.length) return `<p class="aj-n">${T('Nadie ha cambiado su contraseña todavía.', 'Nobody has changed their password yet.')}</p>`;
    return `<ul class="pw-log">${LOG.slice(0, 12).map((x) => `<li><b>${esc(x.nombre)}</b><span>${x.quien === 'admin' ? T('se la pusiste tú', 'set by you') : T('la cambió', 'changed it')}</span><small>${fecha(x.cuando)}</small></li>`).join('')}</ul>`;
  }
  function pwHtml() {
    return `<section class="aj-s aj-pw" data-notr><h3 class="lab">${T('Contraseñas de los amigos', 'Friends’ passwords')}</h3>
      <p class="aj-n">${T('La de cada uno. Cuando alguien cambia la suya, sale aquí sola; las de antes apúntalas tú. Si alguno la pierde, ponle una nueva.', 'Each one’s password. When someone changes theirs it shows up here; write down the older ones yourself. If someone loses theirs, set a new one.')}</p>
      <div class="pw-l">${amigos().map((f) => `<div class="pw-r">${typeof av === 'function' ? av(f.id, 'sm') : ''}<b>${esc(f.n)}</b>
        <span class="pw-in"><input type="text" autocomplete="off" spellcheck="false" maxlength="72" data-pv="${esc(f.uid)}" value="${esc(PASS[f.uid] || '')}" placeholder="${T('Sin apuntar', 'Not saved')}"><button class="aj-a" data-ps="${esc(f.uid)}">${T('Guardar', 'Save')}</button></span>
        <button class="aj-a q ${seguro === f.uid ? 'pw-seg' : ''}" data-rp="${esc(f.uid)}">${seguro === f.uid ? T('Toca otra vez: la suya deja de valer', 'Tap again: theirs stops working') : T('Nueva', 'New')}</button></div>`).join('')}</div>
      <div class="pw-res">${nueva ? ficha(nueva, T('tiene contraseña nueva. Pásale esto:', 'has a new password. Send them this:')) : ''}</div>
      <h3 class="lab pw-h">${T('Cambios', 'Changes')}</h3><div class="pw-logw">${logHtml()}</div></section>`;
  }
  function seccion() {
    return `<section class="aj-s aj-alta" data-notr><h3 class="lab">${T('Añadir amigo', 'Add a friend')}</h3>
      <p class="aj-n">${T('Solo lo ves tú. Escribe su nombre y te doy su usuario y su contraseña para que se los pases.', 'Only you see this. Type their name and you get their username and password to send them.')}</p>
      <div class="pf-pass"><input id="alta-n" maxlength="20" autocomplete="off" placeholder="${T('Su nombre', 'Their name')}"><button class="go" data-alta>${T('Añadir', 'Add')}</button></div>
      <p class="alta-err" hidden></p><div class="alta-res">${ultimo ? res(ultimo) : ''}</div></section>`;
  }
  async function cargaLog() {
    const [{ data, error }, ver] = await Promise.all([db.rpc('admin_pass_log'), db.rpc('admin_pass_ver')]);
    LOG = error ? false : data || [];
    if (!ver.error) { PASS = {}; for (const x of ver.data || []) if (x.pass) PASS[x.player] = x.pass }
    if (!ver.error) {                                                    // rellena los huecos sin pisar lo que se esta escribiendo
      for (const i of document.querySelectorAll('.aj-pw [data-pv]')) if (i !== document.activeElement) i.value = PASS[i.dataset.pv] || '';
    }
    const w = document.querySelector('.aj-pw .pw-logw'); if (w) w.innerHTML = logHtml();
  }
  function repinta() { const s = document.querySelector('.aj-pw'); if (s) s.outerHTML = pwHtml() }
  function pon() {
    const aj = document.querySelector('#view .pad.aj');
    if (!aj || aj.querySelector('.aj-alta') || !soyAdmin()) return;
    aj.insertAdjacentHTML('beforeend', seccion() + pwHtml());
    cargaLog();
  }
  new MutationObserver(pon).observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-alta]'), cp = e.target.closest('[data-alta-copia]'), rp = e.target.closest('[data-rp]'), ps = e.target.closest('[data-ps]');
    if (ps) {
      const uid = ps.dataset.ps, inp = document.querySelector(`.aj-pw [data-pv="${CSS.escape(uid)}"]`); if (!inp) return;
      ps.disabled = true;
      const { error } = await db.rpc('admin_pass_set', { p_player: uid, p_pass: inp.value });
      ps.disabled = false;
      ps.textContent = error ? (/function|schema cache/i.test(error.message) ? T('Falta db/044', 'db/044 missing') : T('No se guardó', 'Not saved')) : T('Guardada', 'Saved');
      if (!error) PASS[uid] = inp.value.trim();
      setTimeout(() => { ps.textContent = T('Guardar', 'Save') }, 2000);
      return;
    }
    if (cp) {
      const r = cp.dataset.altaCopia === 'n' ? nueva : ultimo; if (!r) return;
      const t = `${T('Usuario', 'Username')}: ${r.usuario}\n${T('Contraseña', 'Password')}: ${r.contrasena}\nhttps://pmbanks.github.io/apuestas/`;
      try { await navigator.clipboard.writeText(t); cp.textContent = T('Copiado', 'Copied') } catch (x) { cp.textContent = T('Cópialo a mano', 'Copy it by hand') }
      return;
    }
    if (rp) {
      const uid = rp.dataset.rp;
      if (seguro !== uid) { seguro = uid; return repinta() }               // primer toque: pide el segundo
      seguro = null; rp.disabled = true; rp.textContent = T('Cambiando…', 'Changing…');
      const { data, error } = await db.rpc('admin_reset_pass', { p_player: uid });
      if (error) { rp.disabled = false; rp.textContent = /function|schema cache/i.test(error.message) ? T('Falta cargar db/044', 'db/044 is not loaded') : error.message; return }
      nueva = data; repinta(); cargaLog();
      return;
    }
    if (!b) return;
    const s = b.closest('.aj-alta'), inp = s.querySelector('#alta-n'), err = s.querySelector('.alta-err'), n = inp.value.trim();
    err.hidden = true;
    if (n.length < 2) { err.textContent = T('Escribe su nombre', 'Type their name'); err.hidden = false; return }
    b.disabled = true; b.textContent = T('Creando…', 'Creating…');
    const { data, error } = await db.rpc('admin_alta', { p_nombre: n });
    b.disabled = false; b.textContent = T('Añadir', 'Add');
    if (error) { err.textContent = /function|schema cache/i.test(error.message) ? T('Falta cargar db/043 en Supabase', 'db/043 is not loaded yet') : error.message; err.hidden = false; return }
    ultimo = data; inp.value = '';
    s.querySelector('.alta-res').innerHTML = res(data);
  });
})();
