// Avisos en Discord. Solo se usa si existe el secreto DISCORD_WEBHOOK (ver DISCORD-WEBHOOK.md).
// Pregunta a la base (db/021_discord.sql) que hay de nuevo, lo manda al canal con embeds y, cuando Discord lo ha
// recibido, lo anota para no repetirlo. Nunca tira el sincronizador: si algo falla, lo cuenta y sigue.
const COLOR = { oro: 0xf2c14e, gana: 0x2bd47d, pierde: 0xe0646f, esp: 0xe4ae39, cov: 0xeb4b4b, cla: 0xd32ce6, res: 0x8847ff, mil: 0x4b69ff };
const CDN = 'https://community.akamai.steamstatic.com/economy/image/';
const NOMBRE = 'Gambling Addicts';
const N = (x) => String(Math.round(x || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const O = (x) => Number(x).toFixed(2).replace('.', ',');
const corta = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));
const imagen = (p) => (!p ? undefined : /^https?:/.test(p) ? p : `${CDN}${p}/256fx256f`);
const url = (u) => (u && /^https?:/.test(u) ? { url: u } : undefined);
const RAREZA = { esp: 'Especial', cov: 'Encubierto', cla: 'Clasificado', res: 'Restringido', mil: 'Grado militar' };

/* ---------- los embeds ---------- */
export function embedPartido(p) {
  const t = Math.floor(Date.parse(p.empieza) / 1000);
  const quien = (p.jugadores || []).join(', ');
  return {
    title: corta(`${p.home} vs ${p.away}`, 250),
    description: `Empieza <t:${t}:R> · ${p.liga}`,
    color: COLOR.oro,
    thumbnail: url(p.logo),
    fields: [
      { name: 'Apuestas dentro', value: `${p.n} ${p.n === 1 ? 'apuesta' : 'apuestas'} · ${N(p.total)} V-Bucks`, inline: true },
      ...(quien ? [{ name: 'Quién', value: corta(quien, 200), inline: true }] : []),
    ],
    footer: { text: 'Último aviso antes del pitido' },
    timestamp: p.empieza,
  };
}
export function embedApuesta(a) {
  const gana = a.estado === 'won', neto = a.payout - a.stake;
  return {
    title: gana ? `${a.jugador} se lleva ${N(neto)}` : `${a.jugador} pierde ${N(a.stake)}`,
    description: `${gana ? 'Acertó' : 'Falló'} con **${a.pick}** a ×${O(a.odds)} en ${a.home} vs ${a.away}`,
    color: gana ? COLOR.gana : COLOR.pierde,
    thumbnail: url(a.logo),
    fields: [
      { name: 'Apostó', value: `${N(a.stake)} V-Bucks`, inline: true },
      ...(gana ? [{ name: 'Cobra', value: `${N(a.payout)} V-Bucks`, inline: true }] : []),
      { name: 'Liga', value: corta(a.liga, 100), inline: true },
    ],
  };
}
export function embedSkin(s) {
  const nombre = s.nombre + (s.fase ? ` ${s.fase}` : '');
  const fuente = s.batalla ? 'en una batalla de cajas' : s.caja ? `en ${s.caja}` : 'en una caja';
  return {
    title: corta(`${s.jugador} saca ${nombre}`, 250),
    description: `${s.lujo ? 'Objeto de lujo' : (s.stattrak ? 'StatTrak · ' : '') + (RAREZA[s.rareza] || 'Especial')} ${fuente}.`,
    color: COLOR[s.rareza] || COLOR.esp,
    thumbnail: url(imagen(s.imagen)),
    fields: [{ name: 'Vale', value: `${N(s.valor)} V-Bucks`, inline: true }],
  };
}
export function embedResumen(r) {
  const fila = (f, i) => `\`${i + 1}\` **${f.name}** ${f.neto >= 0 ? '▲' : '▼'} ${N(Math.abs(f.neto))} · ${f.aciertos}/${f.apuestas} acertadas · saldo ${N(f.saldo)}`;
  return {
    title: 'Resumen de la semana',
    description: (r.filas || []).map(fila).join('\n') || 'Nadie ha apostado.',
    color: COLOR.oro,
    footer: { text: `Del ${String(r.desde).slice(5).split('-').reverse().join('/')} al ${String(r.hasta).slice(5).split('-').reverse().join('/')} · llega la paga del lunes` },
  };
}

/* ---------- el envio ---------- */
// hasta 10 embeds por mensaje; si Discord pide esperar (429) se espera y se repite
async function manda(hook, embeds, fetchFn) {
  for (let i = 0; i < 4; i++) {
    let r;
    try { r = await fetchFn(hook + (hook.includes('?') ? '&' : '?') + 'wait=true', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: NOMBRE, embeds, allowed_mentions: { parse: [] } }) }) } catch (e) { await dormir(1500); continue }
    if (r.ok) return true;
    if (r.status === 429) { const j = await r.json().catch(() => ({})); await dormir(Math.min(15000, (Number(j.retry_after) || 1) * 1000 + 200)); continue }
    if (r.status >= 500) { await dormir(1500); continue }
    console.log(`discord: ${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`);
    return false;
  }
  return false;
}

export async function avisos({ rpc, secret, hook, fetchFn = fetch }) {
  let d;
  try { d = await rpc('sync_discord_get', { p_secret: secret }) } catch (e) { console.log(`discord: no hay avisos (${String(e.message || e).slice(0, 120)}). ¿Falta cargar db/021_discord.sql?`); return 0 }
  const lotes = [
    ...(d.partidos || []).map((p) => [p.clave, embedPartido(p)]),
    ...(d.apuestas || []).map((a) => [a.clave, embedApuesta(a)]),
    ...(d.skins || []).map((s) => [s.clave, embedSkin(s)]),
    ...(d.resumen ? [[d.resumen.clave, embedResumen(d.resumen)]] : []),
  ];
  const hechos = [];
  for (let i = 0; i < lotes.length; i += 10) {
    const trozo = lotes.slice(i, i + 10);
    if (await manda(hook, trozo.map((x) => x[1]), fetchFn)) hechos.push(...trozo.map((x) => x[0]));
    if (i + 10 < lotes.length) await dormir(700);
  }
  if (hechos.length) { try { await rpc('sync_discord_hecho', { p_secret: secret, p_claves: hechos }) } catch (e) { console.log(`discord: no pude anotar los avisos (${e.message || e})`) } }
  console.log(`discord: ${hechos.length} avisos mandados de ${lotes.length}`);
  return hechos.length;
}
