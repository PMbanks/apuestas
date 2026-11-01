// Anadir amigo (01-11). PM: "vamos a meter a mi amigo Sebastian, se llamara Sebas en la app". Una seccion mas en Ajustes que
// solo ve el admin: escribe el nombre, la base (db/043 admin_alta) crea la cuenta con usuario, color y contrasena, y aqui se
// ensenan para pasarselos. La contrasena no se guarda en ningun sitio: si se cierra, se cambia desde Supabase.
'use strict';
(function () {
  const en = () => !!(window.GM_LANG && GM_LANG.get() === 'en');
  const T = (es, e) => (en() ? e : es);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const soyAdmin = () => { try { return !!me().admin } catch (e) { return false } };
  let ultimo = null;                                                     // la ultima alta, para que no se pierda al repintar Ajustes

  function res(r) {
    return `<div class="alta-ok"><b>${esc(r.nombre)}</b> ${T('ya está dentro. Pásale esto:', 'is in. Send them this:')}
      <dl><dt>${T('Usuario', 'Username')}</dt><dd>${esc(r.usuario)}</dd><dt>${T('Contraseña', 'Password')}</dt><dd>${esc(r.contrasena)}</dd></dl>
      <button class="aj-a" data-alta-copia>${T('Copiar los dos', 'Copy both')}</button></div>`;
  }
  function seccion() {
    return `<section class="aj-s aj-alta" data-notr><h3 class="lab">${T('Añadir amigo', 'Add a friend')}</h3>
      <p class="aj-n">${T('Solo lo ves tú. Escribe su nombre y te doy su usuario y su contraseña para que se los pases.', 'Only you see this. Type their name and you get their username and password to send them.')}</p>
      <div class="pf-pass"><input id="alta-n" maxlength="20" autocomplete="off" placeholder="${T('Su nombre', 'Their name')}"><button class="go" data-alta>${T('Añadir', 'Add')}</button></div>
      <p class="alta-err" hidden></p><div class="alta-res">${ultimo ? res(ultimo) : ''}</div></section>`;
  }
  function pon() {
    const aj = document.querySelector('#view .pad.aj');
    if (!aj || aj.querySelector('.aj-alta') || !soyAdmin()) return;
    aj.insertAdjacentHTML('beforeend', seccion());
  }
  new MutationObserver(pon).observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-alta]'), cp = e.target.closest('[data-alta-copia]');
    if (cp && ultimo) {
      const t = `${T('Usuario', 'Username')}: ${ultimo.usuario}\n${T('Contraseña', 'Password')}: ${ultimo.contrasena}\nhttps://pmbanks.github.io/apuestas/`;
      try { await navigator.clipboard.writeText(t); cp.textContent = T('Copiado', 'Copied') } catch (x) { cp.textContent = T('Cópialo a mano', 'Copy it by hand') }
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
