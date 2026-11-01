// Pruebas sin red de sync/f1.mjs (estados de los resultados, clasificacion oficial, duelos, cuotas, simulacion, campeonato y anulaciones).
// Se lanzan con: node sync/f1-prueba.mjs  (cada linea "ok" es una comprobacion; si una falla, sale con codigo 1).
import * as m from './f1.mjs';
const ok = (c, msg) => { if (!c) { console.log('FALLO', msg); process.exitCode = 1 } else console.log('ok', msg) };
const R = (o) => ({ position: o.p, positionText: o.pt ?? o.p, status: o.s ?? 'Finished', laps: o.l ?? '57', grid: o.g ?? '1', points: o.pts ?? '0', Driver: { driverId: o.id }, Constructor: { constructorId: o.eq || 'x' }, ...(o.fl ? { FastestLap: { rank: '1' } } : {}) });
ok(m.estadoResultado({ status: 'Finished', positionText: '1', laps: '57' }) === 'F', 'Finished -> F');
ok(m.estadoResultado({ status: '+1 Lap', positionText: '15', laps: '56' }) === 'L', '+1 Lap -> L');
ok(m.estadoResultado({ status: 'Lapped', positionText: '16', laps: '55' }) === 'L', 'Lapped -> L');
ok(m.estadoResultado({ status: 'Engine', positionText: 'R', laps: '20' }) === 'R', 'Engine -> R');
ok(m.estadoResultado({ status: 'Accident', positionText: 'R', laps: '0' }) === 'R', 'accidente en la vuelta 0 sigue siendo R (salio)');
ok(m.estadoResultado({ status: 'Disqualified', positionText: 'D', laps: '57' }) === 'D', 'Disqualified -> D');
ok(m.estadoResultado({ status: 'Withdrew', positionText: 'W', laps: '0' }) === 'S', 'Withdrew -> S');
ok(m.estadoResultado({ status: 'Did not start', positionText: 'R', laps: '0' }) === 'S', 'Did not start -> S');
ok(m.estadoResultado({ status: 'Retired', positionText: 'R', laps: '33' }) === 'R', 'Retired -> R');
const c = m.clasifica([R({ id: 'a', p: '2' }), R({ id: 'b', p: '1', fl: true }), R({ id: 'c', p: '3', pt: 'R', s: 'Engine' }), R({ id: 'd', p: '4', pt: 'D', s: 'Disqualified' })]);
ok(c.o.join() === 'b,a,c,d' && c.fl === 'b' && c.st.c === 'R' && c.st.d === 'D' && c.n === 4, 'clasifica ordena por posicion, vuelta rapida y estados');
const q = m.clasificaQuali([{ position: '2', Driver: { driverId: 'x' } }, { position: '1', Driver: { driverId: 'y' } }]);
ok(q.o.join() === 'y,x', 'clasificaQuali');
// duelos
const f = m.clasifica([R({ id: 'a', p: '5' }), R({ id: 'b', p: '9' }), R({ id: 'c', p: '12', s: 'Withdrew', pt: 'W', l: '0' })]).filas;
ok(m.resultadoDuelo('a', 'b', f).winner === '1' && m.resultadoDuelo('b', 'a', f).winner === '2', 'duelo: el de delante gana');
ok(m.resultadoDuelo('a', 'c', f) === null, 'duelo con uno que no sale: se anula');
// cuotas
const sube = (x) => Math.round(x * 105) / 100;
ok(m.cuota(0.5, { sube }) === 1.98 && m.cuota(0.001, { sube }) === null && m.cuota(0.99, { sube }) === null, 'cuota: 50 % -> 1,98; muy raro y casi seguro no se ofrecen');
ok(m.cuota(0.0045, { sube, tope: 150 }) === 150, 'cuota con tope 150');
ok(m.cuota(0.96, { sube }) >= 1.03, 'cuota minima 1,03');
// nombre de GP y bandera
ok(m.nombreGP('Brazilian Grand Prix', 'Brazil') === 'Gran Premio de Brasil' && m.nombreGP('Nuevo Grand Prix', 'Spain') === 'Gran Premio de España' && m.nombreGP('Raro', 'Chile') === 'Raro', 'nombreGP con respaldo');
ok(m.banderaPais('Brazil') === 'https://flagcdn.com/w160/br.png', 'bandera');
// modelo: suma de probabilidades y orden
const lineup = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => ({ id, eq: 'e' + (i >> 1), nombre: id.toUpperCase(), eqNombre: 'E' }));
const st = m.fuerzas(lineup, { pts: { a: 300, b: 200, c: 150, d: 100, e: 20, f: 5 }, rondas: 15, form: {}, retirados: {}, previa: {}, eqppr: {}, circ: {}, grid: {} });
const pd = m.probAbandono(lineup, { form: {}, retirados: {} });
const s = m.simula(lineup, st, pd, { tipo: 'carrera', semilla: 1, n: 20000, duelos: [['a', 'b'], ['e', 'f']] });
const sw = Object.values(s.win).reduce((x, y) => x + y, 0), sp = Object.values(s.podio).reduce((x, y) => x + y, 0), st10 = Object.values(s.top10).reduce((x, y) => x + y, 0), sf = Object.values(s.fl).reduce((x, y) => x + y, 0);
ok(Math.abs(sw - 1) < 1e-9 && Math.abs(sp - 3) < 1e-9 && Math.abs(st10 - 6) < 1e-9 && Math.abs(sf - 1) < 1e-9, 'simulacion: ganador suma 1, podio 3, top10 (6 pilotos) 6, vuelta rapida 1');
ok(s.win.a > s.win.b && s.win.b > s.win.c && s.win.c > s.win.f, 'el mas fuerte gana mas');
ok(s.duelos[0].p > 0.5 && s.duelos[1].p > 0.5, 'duelos: el mejor lleva ventaja');
const s2 = m.simula(lineup, st, pd, { tipo: 'carrera', semilla: 1, n: 20000, duelos: [['a', 'b']] });
ok(s2.win.a === s.win.a, 'misma semilla, mismas probabilidades (las cuotas no bailan)');
const sq = m.simula(lineup, st, pd, { tipo: 'quali', semilla: 2, n: 20000 });
ok(sq.win.a > s.win.a, 'la clasificacion es mas previsible que la carrera');
// campeonato
const camp = m.simulaCampeonato(lineup, st, pd, [{ sprint: false }, { sprint: true }, { sprint: false }], { a: 100, b: 95, c: 60, d: 10, e: 0, f: 0 }, { e0: 195, e1: 70, e2: 0 }, 9);
ok(Math.abs(Object.values(camp.pilotos).reduce((x, y) => x + y, 0) - 1) < 1e-9 && Math.abs(Object.values(camp.escuderias).reduce((x, y) => x + y, 0) - 1) < 1e-9, 'campeonato: probabilidades suman 1');
console.log('P(win) =', JSON.stringify(Object.fromEntries(Object.entries(s.win).map(([k, v]) => [k, +v.toFixed(3)]))));
// la pareja de un duelo no cambia de orden aunque cambien los puntos
const eqx = [{ id: 'z_driver' }, { id: 'a_driver' }, { id: 'm_driver' }];
ok(m.parejaDe(eqx, { z_driver: 50, a_driver: 40, m_driver: 10 }).join() === 'a_driver,z_driver' && m.parejaDe(eqx, { z_driver: 40, a_driver: 50, m_driver: 10 }).join() === 'a_driver,z_driver', 'duelo: misma pareja y mismo orden aunque cambien los puntos');
// anular
ok(JSON.stringify(m.aAnular([{ id: 'f1-2026-20-R', status: 'scheduled' }, { id: 'f1-2026-21-Q', status: 'scheduled' }, { id: 'f1-2026-WDC', status: 'scheduled' }, { id: 'f1-2025-3-R', status: 'live' }, { id: 'f1-2026-22-R', status: 'final' }], new Set([20, 22]), 2026)) === '["f1-2026-21-Q"]', 'aAnular: solo lo del ano que ya no esta en el calendario y no acabado');
