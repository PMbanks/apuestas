// Prueba del cierre rapido del futbol (cierraFutbol en sync.mjs) con ESPN de verdad y la base de mentira: node sync/cierre-futbol-prueba.mjs
// Coge un partido de Champions ya acabado (Villarreal 0:6 PSG, 03-11), lo pone "en directo" como lo veria la pasada y comprueba que:
// la fila final es la misma que haria soccer(), se guarda con sync_push, se pide sync_close y el partido deja de estar en directo.
// Tambien que un partido que de verdad sigue en juego (o no esta en ESPN) no toca la base.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const aqui = dirname(fileURLToPath(import.meta.url));
let src = readFileSync(join(aqui, 'sync.mjs'), 'utf8');
src = src.replace(/\nmain\(\)\.catch\([^\n]*\n?$/, '\n');            // sin la pasada
assert.ok(!/\nmain\(\)\.catch/.test(src), 'no se ha quitado main()');
src = src.replace('const rpc = async (fn, args) =>', 'const rpc = (...a) => (globalThis.__rpc ?? rpc0)(...a); const rpc0 = async (fn, args) =>');
src += '\nexport { cierraFutbol, filaFutbol, SOCCER };\n';
const tmp = join(aqui, '_cierre-futbol-tmp.mjs');
writeFileSync(tmp, src);
const llamadas = [];
globalThis.__rpc = async (fn, args) => { llamadas.push([fn, args]); return fn === 'sync_close' ? { pagadas: 2 } : 1; };
try {
  const { cierraFutbol, filaFutbol } = await import(pathToFileURL(tmp).href);
  const d = await (await fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard?dates=202611&limit=1000')).json();
  const e = d.events.find((x) => x.id === '401915309');
  const lgId = (d.leagues?.[0]?.logos?.[0]?.href || '').match(/\/(\d+)\.png/)?.[1];
  const final = filaFutbol('uefa.champions', 'Champions League', lgId, e);
  assert.equal(final.status, 'final'); assert.equal(final.score, '0:6'); assert.equal(final.winner, '2'); assert.equal(final.details.r90, '0:6');
  // 1) la pasada lo vio en directo: se cierra y se paga
  const vivo = { ...final, status: 'live', score: '0:5', winner: null, details: { ...final.details } }; delete vivo.details.r90;
  const otro = { ...vivo, id: 'espn:uefa.champions:1', details: { ...vivo.details, espn: { ...vivo.details.espn, event: '1' } } };   // no esta en ESPN
  const nba = { id: 'espn:nba:1', status: 'live', sport: 'b', details: {} };
  const n = await cierraFutbol([vivo, otro, nba]);
  assert.equal(n, 1);
  assert.deepEqual(llamadas.map((x) => x[0]), ['sync_push', 'sync_close']);
  const fila = llamadas[0][1].p_rows;
  assert.equal(fila.length, 1);
  assert.deepEqual(fila[0], final, 'la misma fila que la pasada');
  assert.equal(vivo.status, 'final'); assert.equal(otro.status, 'live');
  // 2) nada en directo, o ESPN dice que sigue en juego: no se toca la base
  llamadas.length = 0;
  assert.equal(await cierraFutbol([vivo, nba]), 0);
  const enJuego = { ...e, competitions: [{ ...e.competitions[0], status: { ...e.competitions[0].status, type: { ...e.competitions[0].status.type, state: 'in', completed: false, name: 'STATUS_SECOND_HALF' } } }] };
  assert.equal(filaFutbol('uefa.champions', 'Champions League', lgId, enJuego).status, 'live', 'en juego no es final');
  assert.equal(llamadas.length, 0);
  console.log('cierre rapido futbol: todo bien');
} finally { rmSync(tmp, { force: true }); }
