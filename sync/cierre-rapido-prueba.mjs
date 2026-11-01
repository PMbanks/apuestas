// Prueba de cierre-rapido.mjs sin red ni base: node sync/cierre-rapido-prueba.mjs
import assert from 'node:assert/strict';
import { cierraRapido } from './cierre-rapido.mjs';

const fila = (id, a, b, status = 'live') => ({ id, sport: 'v', home: 'Gentle Mates GC', away: 'KRÜ Blaze', status, score: '2:2', winner: null, details: { ids: { a, b }, game: 'valorant', ff: false } });
const llamadas = [];
const rpc = async (fn, args) => { llamadas.push([fn, args]); return fn === 'sync_close' ? { pagadas: 1 } : 1; };
const sin = () => {};

// 1) acabado con ganador: se guarda como final con el marcador y el ganador de PandaScore, y se pide pagar
{
  llamadas.length = 0;
  const rows = [fila('ps:valorant:1752428', 137995, 131858), fila('ps:valorant:9', 1, 2), fila('espn:soccer:1', 0, 0), fila('ps:valorant:7', 5, 6, 'scheduled')];
  let url = '';
  const getJson = async (u) => { url = u; return [
    { id: 1752428, status: 'finished', winner_id: 131858, forfeit: false, results: [{ team_id: 137995, score: 2 }, { team_id: 131858, score: 3 }], games: [{ position: 5, status: 'finished', winner: { id: 131858 } }] },
    { id: 9, status: 'running', winner_id: null, results: [] },
  ]; };
  const n = await cierraRapido({ rows, getJson, rpc, secret: 's', ps: 'k', log: sin });
  assert.equal(n, 1);
  assert.match(url, /filter\[id\]=1752428,9&/, 'pregunta solo por los partidos de PandaScore en directo');
  const push = llamadas.find((x) => x[0] === 'sync_push')[1].p_rows;
  assert.equal(push.length, 1);
  assert.deepEqual([push[0].status, push[0].score, push[0].winner], ['final', '2:3', '2']);
  assert.equal(push[0].details.games[0].w, 131858);
  assert.deepEqual(llamadas.map((x) => x[0]), ['sync_push', 'sync_close']);
  assert.equal(rows[0].status, 'final', 'la pasada ya no lo ve en directo');
  assert.equal(rows[1].status, 'live');
}
// 2) gana el local
{
  llamadas.length = 0;
  const rows = [fila('ps:csgo:5', 10, 20)];
  const getJson = async () => [{ id: 5, status: 'finished', winner_id: 10, results: [{ team_id: 10, score: 2 }, { team_id: 20, score: 1 }], games: [] }];
  assert.equal(await cierraRapido({ rows, getJson, rpc, secret: 's', ps: 'k', log: sin }), 1);
  assert.deepEqual([llamadas[0][1].p_rows[0].score, llamadas[0][1].p_rows[0].winner], ['2:1', '1']);
}
// 3) acabado sin ganador (anulado), aun en directo, sin clave, sin partidos en directo o respuesta rara: no hace nada ni toca la base
for (const [rows, getJson, ps] of [
  [[fila('ps:valorant:1', 1, 2)], async () => [{ id: 1, status: 'finished', winner_id: null, results: [] }], 'k'],
  [[fila('ps:valorant:1', 1, 2)], async () => [{ id: 1, status: 'running', winner_id: null, results: [] }], 'k'],
  [[fila('ps:valorant:1', 1, 2)], async () => [{ id: 1, status: 'finished', winner_id: 99, results: [] }], 'k'],
  [[fila('ps:valorant:1', 1, 2)], async () => [{ id: 1, status: 'finished', winner_id: 1, results: [] }], ''],
  [[fila('ps:valorant:1', 1, 2, 'final')], async () => assert.fail('no debia preguntar'), 'k'],
  [[fila('ps:valorant:1', 1, 2)], async () => null, 'k'],
]) {
  llamadas.length = 0;
  assert.equal(await cierraRapido({ rows, getJson, rpc, secret: 's', ps, log: sin }), 0);
  assert.equal(llamadas.length, 0);
}
// 4) si la base falla, el error sube (sync.mjs lo apunta y sigue) y el partido sigue en directo para la pasada normal
{
  const rows = [fila('ps:valorant:1', 1, 2)];
  const getJson = async () => [{ id: 1, status: 'finished', winner_id: 1, results: [{ team_id: 1, score: 2 }, { team_id: 2, score: 0 }], games: [] }];
  await assert.rejects(cierraRapido({ rows, getJson, rpc: async () => { throw new Error('base caida'); }, secret: 's', ps: 'k', log: sin }), /base caida/);
  assert.equal(rows[0].status, 'live');
}
console.log('cierre rapido: todo bien');
