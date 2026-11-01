// Pruebas sin red de sync/push.mjs: una libreria web-push de mentira y un servidor de mentira que hace de Supabase (las tres funciones sync_*).
// Se lanzan con: node sync/push-prueba.mjs  (cada linea "ok" es una comprobacion; si una falla, sale con codigo 1).
// Si web-push esta instalada (npm install en sync/) tambien prueba el cifrado de verdad con un aparato inventado, sin mandar nada a ningun sitio.
import http from 'node:http';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { crearRpc, pasada, bucle, textoPara, pasajero, muerto } from './push.mjs';

const ok = (c, msg) => { if (!c) { console.log('FALLO', msg); process.exitCode = 1 } else console.log('ok', msg) };
const SECRETO = 'secreto-de-prueba';

// ---------- el servidor de mentira ----------
function servidor(estado) {
  return new Promise((res) => {
    const s = http.createServer((rq, rs) => {
      let cuerpo = '';
      rq.on('data', (d) => (cuerpo += d));
      rq.on('end', () => {
        const fn = rq.url.split('/rpc/')[1], a = cuerpo ? JSON.parse(cuerpo) : {};
        estado.llamadas.push({ fn, a });
        const json = (code, x) => { rs.writeHead(code, { 'content-type': 'application/json' }); rs.end(JSON.stringify(x)); };
        if (rq.headers.apikey !== 'anon-de-prueba') return json(401, { message: 'sin clave' });
        if (estado.sinFunciones) return json(404, { code: 'PGRST202', message: `Could not find the function public.${fn}` });
        if (a.p_secret !== SECRETO) return json(400, { message: 'Clave de sincronización no válida' });
        if (fn === 'sync_avisos_pendientes') return json(200, estado.avisos.filter((x) => !estado.marcados.has(x.id)).slice(0, a.p_limite));
        if (fn === 'sync_avisos_marca') { for (const i of a.p_ids) estado.marcados.add(i); for (const e of a.p_endpoints || []) estado.ultimoOk.add(e); return json(200, a.p_ids.length); }
        if (fn === 'sync_push_baja') { estado.bajas.push(a.p_endpoint); return json(200, 1); }
        return json(404, { message: 'no existe' });
      });
    }).listen(0, '127.0.0.1', () => res({ s, url: `http://127.0.0.1:${s.address().port}` }));
  });
}
const nuevoEstado = (avisos) => ({ avisos, marcados: new Set(), ultimoOk: new Set(), bajas: [], llamadas: [], sinFunciones: false });

// ---------- web-push de mentira ----------
function falsoWebPush(reglas = {}) {
  const w = { enviados: [], sendNotification: async (sub, payload, opciones) => {
    w.enviados.push({ sub, payload: JSON.parse(payload), opciones });
    const r = reglas[sub.endpoint];
    if (r) { const e = new Error('push de mentira ' + r); e.statusCode = r; throw e; }
    return { statusCode: 201 };
  } };
  return w;
}
const sub = (n, lang = 'es') => ({ endpoint: `https://push.example.com/${n}`, p256dh: 'p' + n, auth: 'a' + n, lang });
const log = () => {};

// ---------- funciones sueltas ----------
const av = { id: 7, tipo: 'retos', titulo: 'Te han retado', cuerpo: 'Darkam te ha retado a 250 en Liverpool vs Arsenal', titulo_en: 'You have been challenged', cuerpo_en: 'Darkam challenged you to 250 on Liverpool vs Arsenal', url: 'inicio' };
ok(textoPara(av, 'es').t === 'Te han retado' && textoPara(av, 'es').b.startsWith('Darkam te ha retado'), 'texto en español para un aparato en español');
ok(textoPara(av, 'en').t === 'You have been challenged' && textoPara(av, 'en').b.includes('challenged you'), 'texto en ingles para un aparato en ingles');
ok(textoPara({ ...av, titulo_en: null, cuerpo_en: null }, 'en').t === 'Te han retado', 'sin ingles en la base, el aparato en ingles recibe el español');
ok(textoPara(av, 'es').u === 'inicio' && textoPara(av, 'es').i === 7 && textoPara(av, 'es').k === 'retos', 'el aviso lleva la pantalla, el id y el tipo');
ok(textoPara({ ...av, titulo: 'x'.repeat(500), cuerpo: 'y'.repeat(500) }, 'es').t.length === 120 && textoPara({ ...av, cuerpo: 'y'.repeat(500) }, 'es').b.length === 240, 'se recorta lo largo');
ok(pasajero({ statusCode: 500 }) && pasajero({ statusCode: 429 }) && pasajero(new Error('red')) && !pasajero({ statusCode: 403 }) && !pasajero({ statusCode: 410 }), 'errores pasajeros: sin respuesta, 429 y 5xx');
ok(muerto({ statusCode: 404 }) && muerto({ statusCode: 410 }) && !muerto({ statusCode: 500 }) && !muerto(null), 'aparato muerto: 404 y 410');

// ---------- una pasada completa contra el servidor de mentira ----------
{
  const estado = nuevoEstado([
    { id: 1, tipo: 'apuestas', titulo: 'Has ganado 120 con Arsenal', cuerpo: 'Liverpool vs Arsenal', titulo_en: 'You won 120 on Arsenal', cuerpo_en: 'Liverpool vs Arsenal', url: 'apuestas', edad_s: 5, subs: [sub('movil'), sub('pc', 'en')] },
    { id: 2, tipo: 'retos', ...av, id: 2, edad_s: 5, subs: [sub('muerto'), sub('movil2')] },
    { id: 3, tipo: 'chat', titulo: 'Sin aparatos', cuerpo: 'x', url: 'chat', edad_s: 5, subs: [] },
    { id: 4, tipo: 'paga', titulo: 'Reintentar', cuerpo: 'x', url: 'monedero', edad_s: 5, subs: [sub('caido')] },
    { id: 5, tipo: 'paga', titulo: 'Caido y viejo', cuerpo: 'x', url: 'monedero', edad_s: 3600, subs: [sub('caido')] },
    { id: 6, tipo: 'paga', titulo: 'Sin arreglo', cuerpo: 'x', url: 'monedero', edad_s: 5, subs: [sub('prohibido')] },
  ]);
  const { s, url } = await servidor(estado);
  const wp = falsoWebPush({ 'https://push.example.com/muerto': 410, 'https://push.example.com/caido': 503, 'https://push.example.com/prohibido': 403 });
  const rpc = crearRpc(url, 'anon-de-prueba');
  const r = await pasada({ rpc, secret: SECRETO, webpush: wp, log });
  ok(estado.llamadas[0].fn === 'sync_avisos_pendientes' && estado.llamadas[0].a.p_limite === 50, 'pide como mucho 50 avisos por pasada');
  ok(r.avisos === 6 && r.enviados === 3, `6 avisos, 3 enviados a un aparato (${r.enviados})`);
  const aMovil = wp.enviados.find((x) => x.sub.endpoint.endsWith('/movil') && x.payload.i === 1), aPc = wp.enviados.find((x) => x.sub.endpoint.endsWith('/pc'));
  ok(aMovil && aMovil.payload.t === 'Has ganado 120 con Arsenal' && aMovil.sub.keys.p256dh === 'pmovil' && aMovil.sub.keys.auth === 'amovil', 'el aparato recibe el texto en español y sus claves');
  ok(aPc && aPc.payload.t === 'You won 120 on Arsenal', 'el aparato en ingles recibe el texto en ingles');
  ok(aMovil.opciones.TTL === 21600, 'el aviso aguanta 6 horas en el servicio de push');
  ok(estado.bajas.length === 1 && estado.bajas[0].endsWith('/muerto'), 'el aparato que contesta 410 se borra de la base');
  ok([1, 2, 3, 5, 6].every((i) => estado.marcados.has(i)), 'se marcan enviados: los que llegaron, el que no tenia aparatos, el caido muy viejo y el que no tiene arreglo');
  ok(!estado.marcados.has(4) && r.pendientes === 1, 'el aviso con fallo pasajero (503) y reciente no se marca: se reintenta');
  ok(estado.ultimoOk.has('https://push.example.com/movil') && estado.ultimoOk.has('https://push.example.com/pc') && !estado.ultimoOk.has('https://push.example.com/caido'), 'se apunta cuando le llego un aviso a un aparato');
  // segunda pasada: lo marcado no vuelve, solo el reintento
  wp.enviados.length = 0;
  const r2 = await pasada({ rpc, secret: SECRETO, webpush: wp, log });
  ok(r2.avisos === 1 && wp.enviados.length === 1 && wp.enviados[0].payload.i === 4, 'la segunda pasada solo reintenta el que fallo');
  // clave del sincronizador mala: la base la rechaza y se nota
  let fallo = '';
  try { await pasada({ rpc, secret: 'mala', webpush: wp, log }); } catch (e) { fallo = e.message; }
  ok(/Clave de sincronización no válida/.test(fallo), 'con una clave mala la base rechaza la pasada');
  // cola vacia
  estado.avisos.length = 0;
  const r3 = await pasada({ rpc, secret: SECRETO, webpush: wp, log });
  ok(r3.avisos === 0 && estado.llamadas.filter((x) => x.fn === 'sync_avisos_marca').length === 1, 'cola vacia: no marca nada ni llama de mas');
  s.close();
}

// ---------- el bucle ----------
{
  const estado = nuevoEstado([{ id: 1, tipo: 'retos', ...av, edad_s: 1, subs: [sub('uno')] }]);
  const { s, url } = await servidor(estado);
  const wp = falsoWebPush();
  let t = 1000, esperas = [];
  const r = await bucle({ rpc: crearRpc(url, 'anon-de-prueba'), secret: SECRETO, webpush: wp, hasta: 100, cada: 20, log, ahora: () => t, dorm: async (ms) => { esperas.push(ms); t += ms; } });
  ok(r.pasadas === 5 && r.enviados === 1 && esperas.every((x) => x === 20000), `mira la cola cada 20 s: 5 pasadas en 100 s y el aviso sale una sola vez (${r.pasadas} pasadas, esperas ${[...new Set(esperas)]})`);
  // la base aun sin db/060: espera 5 minutos y no se rompe
  estado.sinFunciones = true; t = 0; esperas = [];
  const logs = [];
  const r2 = await bucle({ rpc: crearRpc(url, 'anon-de-prueba'), secret: SECRETO, webpush: wp, hasta: 1000, cada: 20, log: (m) => logs.push(m), ahora: () => t, dorm: async (ms) => { esperas.push(ms); t += ms; } });
  ok(r2.pasadas === 0 && esperas[0] === 300000 && logs.filter((m) => /falta cargar db\/060/.test(m)).length === 1, 'sin db/060 cargada: espera 5 minutos entre intentos, lo cuenta una vez y no rompe');
  // un error de red tampoco rompe el bucle
  s.close();
  t = 0; esperas = [];
  const r3 = await bucle({ rpc: crearRpc('http://127.0.0.1:9', 'x'), secret: SECRETO, webpush: wp, hasta: 60, cada: 20, log, ahora: () => t, dorm: async (ms) => { esperas.push(ms); t += ms; } });
  ok(r3.pasadas === 0 && esperas.length === 3, 'sin red el bucle sigue intentandolo sin caerse');
}

// ---------- sin claves no hace nada ----------
{
  const aqui = fileURLToPath(new URL('./push.mjs', import.meta.url));
  const limpio = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot };
  const a = spawnSync(process.execPath, [aqui], { env: limpio, encoding: 'utf8', timeout: 20000 });
  ok(a.status === 0 && /sin claves VAPID/.test(a.stdout), 'sin claves VAPID sale enseguida sin error');
  const b = spawnSync(process.execPath, [aqui], { env: { ...limpio, VAPID_PUBLIC: 'x', VAPID_PRIVATE: 'y' }, encoding: 'utf8', timeout: 20000 });
  ok(b.status === 0 && /faltan SUPABASE_URL/.test(b.stdout), 'con claves pero sin datos de la base sale sin error');
  const c = spawnSync(process.execPath, [aqui], { env: { ...limpio, VAPID_PUBLIC: 'x', VAPID_PRIVATE: 'y', SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_ANON_KEY: 'a', SYNC_SECRET: 's' }, encoding: 'utf8', timeout: 20000 });
  ok(c.status === 0 && /(no esta instalada|no valen)/.test(c.stdout), 'sin la libreria o con claves que no valen sale sin error');
}

// ---------- el cifrado de verdad (solo si web-push esta instalada) ----------
let real = null;
try { real = (await import('web-push')).default; } catch {}
if (!real) console.log('(web-push no esta instalada aqui: salto la prueba del cifrado real; en el workflow se instala con npm install --prefix sync)');
else {
  const par = real.generateVAPIDKeys();
  real.setVapidDetails('https://pmbanks.github.io/apuestas/', par.publicKey, par.privateKey);
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  const aparato = { endpoint: 'https://fcm.googleapis.com/fcm/send/prueba', keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') } };
  const d = real.generateRequestDetails(aparato, JSON.stringify(textoPara(av, 'es')), { TTL: 21600, urgency: 'normal' });
  ok(d.method === 'POST' && d.endpoint === aparato.endpoint && d.headers.TTL === 21600 && d.headers['Content-Encoding'] === 'aes128gcm', 'web-push cifra el aviso (aes128gcm) para un aparato con claves de verdad');
  ok(/^vapid t=.+, k=/.test(d.headers.Authorization) && d.headers.Authorization.includes(par.publicKey), 'web-push firma con las claves VAPID');
  ok(Buffer.isBuffer(d.body) && d.body.length > 100 && d.body.length < 4096, 'el cuerpo cifrado cabe en un aviso (menos de 4 KB)');
}
