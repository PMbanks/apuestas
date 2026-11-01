// Mensajes del chat rapidos (PM, 01-11: "los mensajes no funcionan creo, no se envia, o si lo hace pero tarda muchisimo").
// Que pasaba: al enviar se esperaba el insert Y despues refresh(), que vuelve a pedir TODO el estado (get_state, 3000 partidos,
// extras...: 9 peticiones y ~400 KB) antes de ver el mensaje, y la caja no se vaciaba hasta entonces. Y al recibir uno de otro,
// el canal en tiempo real esperaba 700 ms y hacia ese mismo refresh entero. Con red de movil eso eran varios segundos.
// Ahora:
//  - el mensaje propio sale al instante en pantalla ("Enviando", y si falla "No se ha enviado" con Reintentar y Descartar);
//  - el insert devuelve la fila (.select().single()) y se pinta sin pedir nada mas;
//  - los de los demas entran por el payload del tiempo real, se pintan en la propia lista (sin repintar la app) y solo avisos,
//    encuestas y apuestas compartidas (que dependen de mas datos) piden el estado entero;
//  - red de seguridad: una pregunta muy pequena ("mensajes con id mayor que el ultimo") al volver a la pestana, al reconectar el
//    canal y cada 2,5 s con el chat abierto y cada 15 s fuera, por si el tiempo real se duerme (movil con la pantalla apagada).
// Usa lo global de app.js: db, ME, MEK, CHAT, S, F, av, fr, esc, HM, toast, errMsg, upload, shrink, conDias, msgRow, lastSeen, loaded.
'use strict';
(function () {
  const g = (f, d) => { try { return f() } catch { return d } };
  const tr = (el) => { if (window.GM_LANG) GM_LANG.traduce(el) };
  let PEND = [], seq = 0, vistoMax = 0, hayNuevos = 0;

  const maxId = () => Math.max(vistoMax, 0, ...CHAT.map((c) => c.id));
  const claves = () => new Map(g(() => BUILD_ARGS[0].players, []).map((p) => [p.id, p.color]));
  const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  /* ---------- lo que se pinta ---------- */
  const filaPend = (p) => `<div class="msg cp ${p.st}" data-cp="${p.id}">${av(MEK)}<div style="min-width:0"><div class="hd"><span class="nm">${esc(fr(MEK).n)}</span><time>${HM(p.at)}</time></div>
    ${p.txt ? `<p>${esc(p.txt)}</p>` : ''}${p.local && !p.audio ? `<img class="pic" src="${esc(p.local)}" alt="">` : ''}${p.audio && p.local ? `<div class="voz"><audio controls preload="none" src="${esc(p.local)}"></audio><span>${mmss(p.secs)}</span></div>` : ''}
    <div class="cp-est">${p.st === 'envia' ? '<i class="cp-spin"></i><span>Enviando</span>' : `<span class="cp-ko">No se ha enviado</span><button type="button" data-cp-retry="${p.id}">Reintentar</button><button type="button" data-cp-drop="${p.id}">Descartar</button>`}</div></div></div>`;
  const lista = () => (conDias(CHAT.filter((c) => c.k)) + PEND.map(filaPend).join('')) || '<p class="hint">Escribe el primero.</p>';

  // repinta SOLO la lista del chat (no la app entera). propio = acabo de mandar algo: bajar siempre
  function pinta(propio) {
    const lst = document.querySelector('[data-chat]');
    if (!lst || S.scr !== 'chat' || S.ct === 'feed') return false;
    const cerca = lst.scrollHeight - lst.scrollTop - lst.clientHeight < 160;
    lst.innerHTML = lista(); tr(lst);
    if (cerca || propio) { lst.scrollTop = lst.scrollHeight; lst.querySelectorAll('img').forEach((i) => i.addEventListener('load', () => (lst.scrollTop = lst.scrollHeight), { once: true })); hayNuevos = 0 }
    chip(lst);
    return true;
  }
  // "Mensaje nuevo": si estas leyendo mas arriba no te bajo de golpe
  function chip(lst) {
    let c = document.querySelector('.cp-nuevo');
    if (!hayNuevos) { if (c) c.remove(); return }
    if (!c) { c = document.createElement('button'); c.type = 'button'; c.className = 'cp-nuevo'; c.dataset.cpBaja = '1'; lst.parentElement.appendChild(c) }
    c.textContent = hayNuevos === 1 ? 'Mensaje nuevo' : `${hayNuevos} mensajes nuevos`; tr(c);
  }
  const marcaVisto = () => {
    if (S.scr !== 'chat' || S.ct === 'feed' || document.hidden) return;
    const m = Math.max(0, ...CHAT.map((c) => c.id));
    if (m > lastSeen) { lastSeen = m; try { localStorage.setItem('apuestas-chat-visto', m) } catch {} }
  };

  /* ---------- recibir ---------- */
  let pideT = 0;
  function pideTodo() {
    clearTimeout(pideT);
    pideT = setTimeout(function f() { if (g(() => window.GM_JUEGOS && GM_JUEGOS.ocupado(), false)) { pideT = setTimeout(f, 1500); return } refresh() }, 300);
  }
  function entra(r) {
    if (!r || r.id == null || !loaded) return;
    if (r.id > vistoMax) vistoMax = r.id;
    if (CHAT.some((c) => c.id === r.id)) return;
    const k = r.player ? claves().get(r.player) : null;
    // avisos de la app, encuestas y apuestas compartidas necesitan mas datos: se pide el estado como siempre
    if (!k || r.poll_id || r.bet_id) { pideTodo(); return }
    // el eco de un mensaje mio que sigo esperando: se cambia el "enviando" por el de verdad, sin que parpadee doble
    if (k === MEK) { const i = PEND.findIndex((p) => p.txt === (r.body || '') && !!p.audio === !!r.audio_url && Date.parse(r.created_at) >= p.at - 8000); if (i >= 0) { const [p] = PEND.splice(i, 1); if (p.local) g(() => URL.revokeObjectURL(p.local)) } }
    const at = Date.parse(r.created_at) || Date.now();
    CHAT.push({ id: r.id, poll: null, bet: null, k, at, t: HM(at), txt: r.body, img: r.image_url, aud: r.audio_url || null, secs: r.audio_secs || 0 });
    CHAT.sort((a, b) => a.id - b.id);
    const mio = k === MEK, lst = document.querySelector('[data-chat]');
    if (!mio && S.scr === 'chat' && S.ct !== 'feed' && lst && lst.scrollHeight - lst.scrollTop - lst.clientHeight >= 160) hayNuevos++;
    if (!pinta(mio)) { if (S.scr === 'chat') render() }
    marcaVisto();
    if (!mio && document.hidden) g(() => avisa(fr(k).n, r.body || (r.image_url ? 'Foto' : r.audio_url ? 'Nota de voz' : '')));
    if (window.GM_MENU) GM_MENU.pinta();
  }
  // pregunta pequena: solo lo que pasa del ultimo id que conozco
  let alDiaOcupado = false;
  async function alDia() {
    if (alDiaOcupado || !loaded) return;
    alDiaOcupado = true;
    try {
      const { data, error } = await db.from('chat').select('*').gt('id', maxId()).order('id').limit(60);
      if (!error && data) for (const r of data) entra(r);
    } catch {} finally { alDiaOcupado = false }
  }

  /* ---------- enviar ---------- */
  const tope = (pr, ms) => Promise.race([pr, new Promise((_, no) => setTimeout(() => no(new Error('Está tardando demasiado')), ms))]);
  async function subeAudio(p) {
    const t = p.blob.type || 'audio/webm', ext = /mp4/.test(t) ? 'm4a' : /ogg/.test(t) ? 'ogg' : 'webm', path = `${ME}/voz-${Date.now()}.${ext}`;
    const { error } = await db.storage.from('fotos').upload(path, p.blob, { contentType: t, cacheControl: '31536000' }); if (error) throw error;
    return db.storage.from('fotos').getPublicUrl(path).data.publicUrl;
  }
  async function manda(p, reintento) {
    p.st = 'envia'; p.n = (p.n || 0) + 1; const mi = p.n;
    pinta(true);
    try {
      // si un intento anterior se quedo colgado pero llego a entrar, no se manda dos veces
      if (reintento) {
        const { data } = await db.from('chat').select('*').eq('player', ME).eq('body', p.txt || '').gte('created_at', new Date(p.at - 5000).toISOString()).order('id', { ascending: false }).limit(5);
        const ya = (data || []).find((r) => (!p.audio === !r.audio_url) && (p.audio || !p.blob || !!r.image_url === !!p.blob));
        if (ya) { fin(p); entra(ya); return }
      }
      const fila = await tope((async () => {
        if (p.blob && !p.url) p.url = p.audio ? await subeAudio(p) : await upload(await shrink(p.blob, 1280, false), 'chat');
        const row = { player: ME, body: p.txt || '', image_url: p.audio ? null : p.url || null };
        if (p.audio) { row.audio_url = p.url; row.audio_secs = Math.min(p.secs || 1, 300) }
        const { data, error } = await db.from('chat').insert(row).select().single(); if (error) throw error;
        return data;
      })(), p.blob ? 60000 : 20000);
      fin(p); entra(fila);
    } catch (e) {
      if (!PEND.includes(p) || p.n !== mi) return;
      p.st = 'fallo';
      if (!pinta(true)) toast('No se ha enviado un mensaje del chat');
    }
  }
  function fin(p) { PEND = PEND.filter((x) => x !== p); if (p.local) g(() => URL.revokeObjectURL(p.local)); pinta(true) }

  // x: nada (solo texto), un File (foto) o { audio: true, blob, secs } (nota de voz)
  function envia(x) {
    const el = document.querySelector('[data-msg]'), txt = x && x.audio ? '' : el ? el.value.trim() : '';
    const foto = x && !x.audio ? x : null;
    if (!txt && !foto && !(x && x.audio)) return;
    const p = { id: 'p' + ++seq, at: Date.now(), txt, st: 'envia', blob: foto || (x && x.audio ? x.blob : null), audio: !!(x && x.audio), secs: x && x.secs || 0, local: null };
    if (p.blob) p.local = g(() => URL.createObjectURL(p.blob), null);
    if (el && !(x && x.audio)) { el.value = ''; el.focus() }
    PEND.push(p);
    manda(p, false);
  }

  /* ---------- botones de los mensajes pendientes ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('[data-cp-retry],[data-cp-drop],[data-cp-baja]'); if (!t) return;
    e.stopPropagation();
    if (t.dataset.cpBaja) { const l = document.querySelector('[data-chat]'); hayNuevos = 0; if (l) l.scrollTop = l.scrollHeight; chip(l); return }
    const p = PEND.find((x) => x.id === (t.dataset.cpRetry || t.dataset.cpDrop)); if (!p) return;
    if (t.dataset.cpRetry) return manda(p, true);
    // descartar: el texto vuelve a la caja para no perderlo
    const el = document.querySelector('[data-msg]'); if (el && p.txt && !el.value) el.value = p.txt;
    fin(p);
  }, true);

  /* ---------- red de seguridad ---------- */
  document.addEventListener('visibilitychange', () => { if (!document.hidden) alDia() });
  // con el chat abierto, cada 2,5 s (la pregunta pesa casi nada); en cualquier otra pantalla, cada 15 s
  let vuelta = 0;
  setInterval(() => { if (document.hidden) return; if (g(() => S.scr === 'chat', false) || ++vuelta % 6 === 0) alDia() }, 2500);
  addEventListener('online', alDia);

  window.GM_CHAT = { envia, entra, alDia, lista, pinta, pendientes: () => PEND.length };
})();
