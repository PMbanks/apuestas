// Resumen para la tarjeta del Dashboard de AMbicious. Va en un marco invisible dentro de AMbicious: lee la sesion que dejo
// la pestana Bets (mismo navegador, mismo AMbicious) y le pasa al padre SOLO lo que pinta la tarjeta. Nunca toca la contrasena.
// Solo contesta si el padre es AMbicious en este PC (localhost o 127.0.0.1).
'use strict';
(async () => {
  const anc = (location.ancestorOrigins && location.ancestorOrigins[0]) || document.referrer || '';
  const padre = (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.exec(anc) || [])[0];
  if (!padre || window.parent === window) return;
  const manda = (d) => window.parent.postMessage({ tipo: 'gm-resumen', ...d }, padre);
  try {
    const CFG = window.APP_CONFIG;
    const db = supabase.createClient(CFG.url, CFG.anon, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'apuestas-auth' } });
    const { data: { session } } = await db.auth.getSession();
    if (!session) return manda({ entrar: true });
    const { data: st, error } = await db.rpc('get_state');
    if (error) return manda({ error: error.message });
    const yo = st.players.find((p) => p.id === st.me);
    const rank = [...st.players].sort((a, b) => b.saldo - a.saldo).findIndex((p) => p.id === st.me) + 1;
    const abiertas = st.bets.filter((b) => b.player === st.me && b.status === 'open');
    let next = null;
    if (abiertas.length) {
      const { data: ms } = await db.from('matches').select('id,home,away,starts_at,status,score,home_logo,away_logo,sport').in('id', [...new Set(abiertas.map((b) => b.match))]);
      const lista = abiertas.map((b) => ({ b, m: (ms || []).find((x) => x.id === b.match) })).filter((x) => x.m)
        .sort((x, y) => (y.m.status === 'live') - (x.m.status === 'live') || Date.parse(x.m.starts_at) - Date.parse(y.m.starts_at));
      const x = lista[0];
      if (x) next = { home: x.m.home, away: x.m.away, at: Date.parse(x.m.starts_at), live: x.m.status === 'live', score: x.m.score || '',
        pick: x.b.pick === '1' ? x.m.home : x.b.pick === '2' ? x.m.away : 'Draw', odds: Number(x.b.odds), stake: x.b.stake, sport: x.m.sport };
    }
    manda({ name: yo.name, saldo: yo.saldo, neto: yo.saldo - yo.recibido, rank, n: st.players.length, abiertas: abiertas.length,
      enJuego: abiertas.reduce((a, b) => a + b.stake, 0), next, weekly: st.weekly, t: Date.now() });
  } catch (e) { manda({ error: String((e && e.message) || e) }) }
})();
