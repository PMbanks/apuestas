// Cierre rapido de Valorant y CS2 (PM 02-11: "tiene que pagar cuando termine"; KRU acabo a las 22:41 y se pago a las 22:44).
// El sincronizador cerraba los partidos al empezar cada pasada (cada 5 min). Esto mira, cada 25 s dentro de la pasada, SOLO los partidos
// de PandaScore que la pasada vio en directo (una sola peticion para todos) y, si alguno ya acabo con ganador, lo guarda como final
// y pide a la base que pague (sync_close). Lo que no cierra aqui lo cierra la pasada de siempre: nunca decide nada que ella no decidiria.
// La fila final se hace igual que en esports() de sync.mjs (mismo marcador, mismo ganador, mismos mapas).
export async function cierraRapido({ rows, getJson, rpc, secret, ps, log = console.log }) {
  if (!ps) return 0;
  const vivos = rows.filter((r) => r.status === 'live' && /^ps:(valorant|csgo):\d+$/.test(r.id));
  if (!vivos.length) return 0;
  const ids = vivos.map((r) => r.id.split(':')[2]);
  const lista = await getJson(`https://api.pandascore.co/matches?filter[id]=${ids.join(',')}&per_page=50`, { authorization: `Bearer ${ps}` });
  if (!Array.isArray(lista)) return 0;
  const finales = [];
  for (const m of lista) {
    if (m.status !== 'finished' || !m.winner_id) continue;
    const r = vivos.find((x) => x.id.endsWith(':' + m.id));
    const a = r?.details?.ids?.a, b = r?.details?.ids?.b;
    if (!r || m.winner_id !== a && m.winner_id !== b) continue;
    const sc = (id) => m.results?.find((x) => x.team_id === id)?.score ?? 0;
    finales.push({
      ...r, status: 'final', score: `${sc(a)}:${sc(b)}`, winner: m.winner_id === a ? '1' : '2',
      details: { ...r.details, games: (m.games || []).map((g) => ({ n: g.position, st: g.status, w: g.winner?.id ?? null })), ff: !!m.forfeit },
    });
  }
  if (!finales.length) return 0;
  await rpc('sync_push', { p_secret: secret, p_rows: finales });
  for (const f of finales) { const r = vivos.find((x) => x.id === f.id); r.status = 'final'; }   // la pasada ya no lo trata como en directo
  let res;
  do { res = await rpc('sync_close', { p_secret: secret }); } while ((res?.pagadas || 0) >= 60);
  log(`cierre rapido: ${finales.map((f) => `${f.home} ${f.score} ${f.away}`).join(' · ')}`);
  return finales.length;
}
