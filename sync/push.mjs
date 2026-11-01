// Envio de avisos al movil (web push). Lo lanza el workflow sync.yml UNA vez al principio de la ejecucion larga, a la vez que el bucle de
// sincronizacion (mismo job, ningun job nuevo), y se queda vivo repasando la cola cada 20 segundos hasta que se acaba el tiempo.
//   SUPABASE_URL, SUPABASE_ANON_KEY, SYNC_SECRET   como el resto del sincronizador
//   VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT     las claves VAPID (la privada solo en un secreto de GitHub, nunca en el repo)
//   PUSH_HASTA_S (opcional)                        segundos que se queda vivo (por defecto 340 minutos: lo que dura el bucle del workflow)
//   PUSH_CADA_S  (opcional)                        cada cuantos segundos mira la cola (por defecto 20)
// Si faltan las claves, o la libreria web-push no esta instalada, o la base aun no tiene db/060_push.sql, NO hace nada y NO rompe el
// sincronizador (sale con codigo 0 y lo cuenta en el registro). Que cada cosa pasa por la base: sync_avisos_pendientes (que hay por enviar y a que
// aparatos), sync_avisos_marca (ya enviado) y sync_push_baja (aparato muerto: el navegador contesto 404 o 410).
// Prueba sin red: node sync/push-prueba.mjs
import { pathToFileURL } from 'node:url';

const LIMITE = 50;                 // avisos por pasada
const TTL = 6 * 3600;              // el servicio de push guarda un aviso hasta 6 horas si el movil esta apagado
const VIEJO_S = 30 * 60;           // un aviso que no se ha podido enviar en media hora ya no vale la pena
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

// Llama a las funciones de la base con la clave publica del proyecto (igual que sync.mjs); el secreto va en los argumentos.
export const crearRpc = (sb, anon) => async (fn, args) => {
  const r = await fetch(`${sb}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: anon, authorization: `Bearer ${anon}`, 'content-type': 'application/json' }, body: JSON.stringify(args) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${fn} ${r.status}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
};

// El texto del aviso en el idioma del aparato (el ingles solo si la base lo trae; si no, el español)
export function textoPara(aviso, lang) {
  const en = lang === 'en' && aviso.titulo_en;
  return { t: String(en ? aviso.titulo_en : aviso.titulo || '').slice(0, 120), b: String(en ? (aviso.cuerpo_en ?? '') : aviso.cuerpo || '').slice(0, 240), u: String(aviso.url || 'inicio'), i: aviso.id, k: aviso.tipo };
}

// Un error es "pasajero" si merece reintentarlo (sin respuesta, 429, 5xx); 404 y 410 son aparato muerto; el resto (400, 401, 403...) no se arregla esperando.
export const pasajero = (e) => { const s = e && e.statusCode; return !s || s === 429 || s >= 500; };
export const muerto = (e) => !!e && (e.statusCode === 404 || e.statusCode === 410);

// Una pasada: pide la cola, envia a cada aparato, marca lo enviado y borra los aparatos muertos. Devuelve el resumen.
export async function pasada({ rpc, secret, webpush, limite = LIMITE, log = console.log }) {
  const lista = (await rpc('sync_avisos_pendientes', { p_secret: secret, p_limite: limite })) || [];
  const res = { avisos: lista.length, enviados: 0, fallos: 0, muertos: 0, pendientes: 0 };
  if (!lista.length) return res;
  const marcar = [], okEnds = new Set(), bajas = new Set();
  for (const av of lista) {
    const subs = Array.isArray(av.subs) ? av.subs : [];
    let ok = 0, pas = 0;
    await Promise.all(subs.map(async (s) => {
      if (bajas.has(s.endpoint)) return;
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(textoPara(av, s.lang)), { TTL: TTL, urgency: 'normal' });
        ok++; okEnds.add(s.endpoint); res.enviados++;
      } catch (e) {
        if (muerto(e)) { bajas.add(s.endpoint); res.muertos++; }
        else { res.fallos++; if (pasajero(e)) pas++; log(`push: aviso ${av.id} a un aparato: ${e && e.statusCode ? 'HTTP ' + e.statusCode : String(e && e.message || e).slice(0, 120)}`); }
      }
    }));
    // se da por enviado si llego a alguien, si no habia a quien mandarlo, o si el fallo no tiene arreglo; si solo hubo fallos pasajeros se reintenta (hasta media hora)
    if (ok > 0 || !subs.length || pas === 0 || (av.edad_s || 0) > VIEJO_S) marcar.push(av.id); else res.pendientes++;
  }
  for (const ep of bajas) { try { await rpc('sync_push_baja', { p_secret: secret, p_endpoint: ep }); } catch (e) { log(`push: no se pudo borrar un aparato muerto: ${e.message}`); } }
  if (marcar.length || okEnds.size) await rpc('sync_avisos_marca', { p_secret: secret, p_ids: marcar, p_endpoints: [...okEnds] });
  return res;
}

// El bucle: cada `cada` segundos hasta `hasta` segundos. Si la base aun no tiene la funcion, espera 5 minutos entre intentos.
export async function bucle({ rpc, secret, webpush, hasta, cada = 20, log = console.log, ahora = Date.now, dorm = dormir }) {
  const fin = ahora() + hasta * 1000;
  let n = 0, enviados = 0, sinBase = false;
  while (ahora() < fin) {
    try {
      const r = await pasada({ rpc, secret, webpush, log });
      n++; enviados += r.enviados; sinBase = false;
      if (r.avisos) log(`push: ${r.avisos} avisos · ${r.enviados} enviados · ${r.fallos} fallos · ${r.muertos} aparatos muertos${r.pendientes ? ' · ' + r.pendientes + ' por reintentar' : ''}`);
    } catch (e) {
      const m = String(e && e.message || e);
      if (/sync_avisos_pendientes|Could not find|does not exist|PGRST202/i.test(m)) { if (!sinBase) log('push: falta cargar db/060_push.sql, espero'); sinBase = true; }
      else log(`push: ${m.slice(0, 200)}`);
    }
    await dorm(Math.min((sinBase ? 300 : cada) * 1000, Math.max(0, fin - ahora())));
  }
  return { pasadas: n, enviados };
}

async function main() {
  const E = process.env;
  const { SUPABASE_URL: sb, SUPABASE_ANON_KEY: anon, SYNC_SECRET: secret, VAPID_PUBLIC: pub, VAPID_PRIVATE: priv } = E;
  if (!pub || !priv) { console.log('push: sin claves VAPID (VAPID_PUBLIC y VAPID_PRIVATE), no se mandan avisos'); return; }
  if (!sb || !anon || !secret) { console.log('push: faltan SUPABASE_URL, SUPABASE_ANON_KEY o SYNC_SECRET, no se mandan avisos'); return; }
  let webpush;
  try { webpush = (await import('web-push')).default; } catch { console.log('push: la libreria web-push no esta instalada (npm install en sync/), no se mandan avisos'); return; }
  try { webpush.setVapidDetails(E.VAPID_SUBJECT || 'https://pmbanks.github.io/apuestas/', pub, priv); }
  catch (e) { console.log(`push: las claves VAPID no valen (${String(e.message).slice(0, 120)}), no se mandan avisos`); return; }
  const hasta = +E.PUSH_HASTA_S || 340 * 60, cada = +E.PUSH_CADA_S || 20;
  console.log(`push: vivo, miro la cola cada ${cada} s durante ${Math.round(hasta / 60)} min`);
  const r = await bucle({ rpc: crearRpc(sb, anon), secret, webpush, hasta, cada });
  console.log(`push: fin · ${r.pasadas} pasadas · ${r.enviados} avisos enviados`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.log('push:', e && e.message || e); });
