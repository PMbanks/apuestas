// Mas tipos de apuesta (db/036_mercados.sql, PM 01-11): mas/menos goles y ambos marcan en futbol, y mapas en Valorant y CS2
// (resultado exacto de la serie, +1,5 mapas y mapas jugados). La base guarda las cuotas en matches.odds_mk y paga cada una.
// Este modulo:
//  1) lee esas cuotas de la base aparte de app.js (si la columna aun no existe, no rompe nada: no sale ningun mercado);
//  2) las pinta en la ficha del partido debajo del 1X2, mientras no ha empezado. Cada cuota lleva data-pick="partido|codigo",
//     asi que boleto.js la mete en el boleto como las demas (dorado, sueltas o combinada) y place_bet la apuesta;
//  3) da GM_MK a app.js y a los demas modulos: nombre de cada eleccion (en español o en inglés), su cuota, su equipo y como va
//     en directo. Si un partido no tiene cuota de un mercado, ese mercado no sale.
// Codigos (los mismos que la base): O2.5 U2.5 (goles), GG NG (ambos marcan), S2-1 (serie, mapas del local primero),
// H1+1.5 H2+1.5 (handicap), MO2.5 MU2.5 (mapas jugados).
'use strict';
(function () {
  const RE = /^(1|X|2|[OU][0-9]\.5|GG|NG|S[0-4]-[0-4]|H[12]\+[0-9]\.5|M[OU][0-9]\.5)$/;
  const g = (f, d) => { try { const v = f(); return v === undefined ? d : v } catch { return d } };
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const en = () => document.documentElement.lang === 'en';
  const T = (es, ing) => (en() ? ing : es);
  const dec = (x) => String(x).replace('.', en() ? '.' : ',');
  const O = (x) => Number(x).toFixed(2).replace('.', en() ? '.' : ',');

  /* ---------- los codigos ---------- */
  const valido = (p) => typeof p === 'string' && RE.test(p);
  const es = (p) => valido(p) && p !== '1' && p !== 'X' && p !== '2';
  // dentro de un grupo se elige una cosa, como 1, X o 2 (en el boleto, tocar otra del mismo grupo la cambia)
  const grupo = (p) => (!es(p) ? '1X2' : /^[OU]/.test(p) ? 'G' + p.slice(1) : p === 'GG' || p === 'NG' ? 'AM' : p[0] === 'S' ? 'S' : p[0] === 'H' ? 'H' + p.slice(2) : 'M' + p.slice(2));
  // de que equipo es: '1', '2' o null (los goles, ambos marcan y los mapas jugados son de los dos)
  const lado = (p) => (p === '1' || p === '2' ? p : /^H[12]\+/.test(p) ? p[1] : /^S\d-\d$/.test(p) && p[1] !== p[3] ? (p[1] > p[3] ? '1' : '2') : null);
  const equipos = (m) => [m.a ?? m.home ?? '', m.b ?? m.away ?? ''];
  function nombre(m, p) {
    const [A, B] = equipos(m || {}), E = en();
    let x;
    if (p === '1') return A; if (p === '2') return B; if (p === 'X') return 'Empate';
    if ((x = /^([OU])(\d\.5)$/.exec(p))) return E ? `${x[1] === 'O' ? 'Over' : 'Under'} ${x[2]} goals` : `${x[1] === 'O' ? 'Más' : 'Menos'} de ${dec(x[2])} goles`;
    if (p === 'GG') return T('Ambos marcan: sí', 'Both teams score: yes');
    if (p === 'NG') return T('Ambos marcan: no', 'Both teams score: no');
    if ((x = /^S(\d)-(\d)$/.exec(p))) return +x[1] > +x[2] ? `${A} ${x[1]}:${x[2]}` : `${B} ${x[2]}:${x[1]}`;
    if ((x = /^H([12])\+(\d\.5)$/.exec(p))) return `${x[1] === '1' ? A : B} +${dec(x[2])} ${T('mapas', 'maps')}`;
    if ((x = /^M([OU])(\d\.5)$/.exec(p))) return E ? `${x[1] === 'O' ? 'Over' : 'Under'} ${x[2]} maps` : `${x[1] === 'O' ? 'Más' : 'Menos'} de ${dec(x[2])} mapas`;
    return String(p ?? '?');
  }
  // como va en directo con el marcador [local, visitante] (goles o mapas): 'gana', 'pierde' o '' si no se sabe todavia
  function va(m, p, sc) {
    if (!es(p) || !Array.isArray(sc) || sc.length < 2 || sc[0] == null || sc[1] == null || sc[0] === '' || sc[1] === '' || !isFinite(sc[0]) || !isFinite(sc[1])) return '';
    const [h, a] = sc.map(Number); let x;
    if ((x = /^([OU])(\d\.5)$/.exec(p))) return (h + a > +x[2]) === (x[1] === 'O') ? 'gana' : 'pierde';
    if (p === 'GG') return h > 0 && a > 0 ? 'gana' : 'pierde';
    if (p === 'NG') return h > 0 && a > 0 ? 'pierde' : 'gana';
    if ((x = /^H([12])\+(\d\.5)$/.exec(p))) return (x[1] === '1' ? h - a : a - h) + +x[2] > 0 ? 'gana' : 'pierde';
    if ((x = /^S(\d)-(\d)$/.exec(p))) return h > +x[1] || a > +x[2] ? 'pierde' : '';
    if ((x = /^M([OU])(\d\.5)$/.exec(p))) return h + a > +x[2] ? (x[1] === 'O' ? 'gana' : 'pierde') : '';
    return '';
  }

  /* ---------- las cuotas (matches.odds_mk) ---------- */
  const MK = new Map();
  const C = { t: 0, off: 0, vivo: false };
  const cuota = (m, p) => { const o = m && MK.get(m.id)?.[p]; return typeof o === 'number' && o > 1 ? o : null };
  async function carga(ya) {
    if (C.vivo || Date.now() < C.off || (!ya && Date.now() - C.t < 60e3)) return;
    const cli = g(() => db, null); if (!cli) return;
    C.vivo = true;
    try {
      const { data, error } = await cli.from('matches').select('id,odds_mk').eq('status', 'scheduled')
        .gte('starts_at', new Date(Date.now() - 6 * 3600e3).toISOString()).not('odds_mk', 'is', null).limit(3000);
      if (error) throw error;
      MK.clear();
      for (const r of data || []) if (r.odds_mk && typeof r.odds_mk === 'object') MK.set(r.id, r.odds_mk);
      C.t = Date.now();
    } catch (e) {
      // sin la columna (db/036 sin cargar) se vuelve a mirar en 30 minutos; otro fallo, en 3
      C.off = Date.now() + (/odds_mk|42703|does not exist|column/i.test(String(e?.message || '') + ' ' + (e?.code || '')) ? 30 : 3) * 60e3; C.t = Date.now();
    }
    C.vivo = false;
    pinta();
    try { window.dispatchEvent(new CustomEvent('gm:mk')) } catch {}
  }

  /* ---------- la ficha ---------- */
  const abierto = (m) => m && m.status === 'scheduled' && Date.parse(m.at) > Date.now();
  const mias = (m) => new Set(g(() => ALL.filter((b) => b.k === MEK && b.m === m.id && b.st === 'open').map((b) => b.p), []));
  function boton(m, p, txt, mine) {
    const o = cuota(m, p);
    return o == null ? '<span class="mq-o na"></span>'
      : `<button type="button" class="mq-o ${mine.has(p) ? 'mine' : ''}" data-pick="${esc(m.id)}|${esc(p)}" title="${esc(nombre(m, p))}">${txt ? `<span class="mq-k" data-notr>${esc(txt)}</span>` : ''}<b>${O(o)}</b></button>`;
  }
  // tabla: cabecera con el titulo y las columnas, y una fila por linea (goles) o por equipo (resultado exacto)
  function tabla(m, titulo, cols, filas, mine) {
    const vivas = filas.filter((f) => f.picks.some((p) => cuota(m, p) != null));
    if (!vivas.length) return '';
    return `<section class="mq-g mq-tb" style="--c:${cols.length}">
      <div class="mq-hd"><span class="lab">${esc(titulo)}</span>${cols.map((c) => `<span class="lab mq-ch" data-notr>${esc(c)}</span>`).join('')}</div>
      ${vivas.map((f) => `<div class="mq-r"><span class="mq-l" data-notr>${esc(f.l)}</span>${f.picks.map((p) => boton(m, p, '', mine)).join('')}</div>`).join('')}
    </section>`;
  }
  // par: titulo y dos (o mas) elecciones con su nombre
  function par(m, titulo, picks, mine) {
    const vivas = picks.filter(([p]) => cuota(m, p) != null);
    if (vivas.length < 2) return '';
    return `<section class="mq-g mq-pr"><div class="mq-hd"><span class="lab">${esc(titulo)}</span></div>
      <div class="mq-ps">${vivas.map(([p, t]) => boton(m, p, t, mine)).join('')}</div></section>`;
  }
  function bloque(m) {
    const ks = Object.keys(MK.get(m.id) || {}); if (!ks.length || !abierto(m)) return '';
    const mine = mias(m), [A, B] = equipos(m);
    let h = '';
    if (m.s === 'f') {
      const lineas = [...new Set(ks.filter((k) => /^[OU]\d\.5$/.test(k)).map((k) => k.slice(1)))].sort();
      h += tabla(m, T('Goles', 'Goals'), [T('Más de', 'Over'), T('Menos de', 'Under')], lineas.map((l) => ({ l: `${dec(l)} ${T('goles', 'goals')}`, picks: ['O' + l, 'U' + l] })), mine);
      h += par(m, T('Ambos marcan', 'Both teams score'), [['GG', T('Sí', 'Yes')], ['NG', T('No', 'No')]], mine);
    } else if (m.s === 'v' || m.s === 'c') {
      const need = m.bo === 5 ? 3 : m.bo === 3 ? 2 : 0;
      if (need) {
        const cols = Array.from({ length: need }, (_, k) => `${need}:${k}`);
        h += tabla(m, T('Resultado', 'Score'), cols, [
          { l: A, picks: cols.map((_, k) => `S${need}-${k}`) },
          { l: B, picks: cols.map((_, k) => `S${k}-${need}`) },
        ], mine);
        const hl = ks.find((k) => /^H1\+/.test(k))?.slice(3) || ks.find((k) => /^H2\+/.test(k))?.slice(3) || '1.5';
        h += par(m, T(`Hándicap · +${dec(hl)} mapas`, `Handicap · +${dec(hl)} maps`), [[`H1+${hl}`, `${A} +${dec(hl)}`], [`H2+${hl}`, `${B} +${dec(hl)}`]], mine);
        const ml = (m.bo - 0.5).toFixed(1);
        h += par(m, T('Mapas jugados', 'Maps played'), [[`MO${ml}`, `${T('Más de', 'Over')} ${dec(ml)}`], [`MU${ml}`, `${T('Menos de', 'Under')} ${dec(ml)}`]], mine);
      }
    }
    if (!h) return '';
    const fuente = m.s === 'f' ? (m.src === 'draftkings' ? T('Con las cuotas de DraftKings del partido', 'From the DraftKings match odds') : T('Con la forma y el récord', 'From form and record'))
      : T('Con la forma de los dos equipos', 'From both teams’ form');
    return `<div class="mq-top"><span class="lab">${T('Más apuestas', 'More bets')}</span></div>${h}<p class="hint mq-src">${fuente} · ${T('se congelan al apostar', 'locked when you bet')}</p>`;
  }
  function pinta() {
    const det = document.querySelector('#view .det'); if (!det) return;
    const picks = det.querySelector('.picks'), ya = det.querySelector('.mq');
    const mid = (picks?.querySelector('[data-pick]')?.dataset.pick || '').split('|')[0] || det.querySelector('#espn-box')?.dataset.m || '';
    const m = picks && mid ? g(() => byId(mid), null) : null;
    if (m && abierto(m) && Date.now() - C.t > 60e3) carga();
    const html = m ? bloque(m) : '';
    const f = JSON.stringify([mid, html.length, html.slice(0, 40), [...(m ? mias(m) : [])], document.documentElement.lang, C.t]);
    if (!html) { if (ya) ya.remove(); return }
    if (ya && ya.dataset.f === f && ya.dataset.m === mid) return;
    const el = ya || document.createElement('div');
    el.className = 'mq'; el.dataset.f = f; el.dataset.m = mid; el.innerHTML = html;
    if (!ya) { const tras = picks.nextElementSibling && picks.nextElementSibling.matches('p.hint') ? picks.nextElementSibling : picks; tras.after(el) }
  }

  /* ---------- montaje: cada vez que la app repinta ---------- */
  let pend = false;
  const app = document.getElementById('app');
  new MutationObserver((ms) => {
    if (pend || ms.every((x) => x.target.closest && x.target.closest('.mq'))) return;
    pend = true;
    queueMicrotask(() => { pend = false; try { if (g(() => loaded, false)) { carga(); pinta() } } catch (e) { if (!pinta.av) { pinta.av = 1; console.warn('mercados.js', e) } } });
  }).observe(app || document.documentElement, { childList: true, subtree: true });
  setInterval(() => { if (!document.hidden && g(() => loaded, false)) carga() }, 120e3);

  window.GM_MK = { valido, es, grupo, lado, nombre, va, cuota, carga: () => carga(true), cuotas: (id) => MK.get(id) || null };
})();
