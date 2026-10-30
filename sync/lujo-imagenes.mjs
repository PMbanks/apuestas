// Baja UNA vez las fotos de las cajas de lujo desde Wikimedia Commons (licencia libre), las pasa a webp de 512 px como mucho
// y las guarda en app/img/lujo/. Escribe app/img/lujo/FUENTES.md con la pagina, el autor y la licencia de cada una.
//   node sync/lujo-imagenes.mjs            (necesita ffmpeg en el PATH; salta las que ya estan)
//   OUT=carpeta  guarda en otra carpeta (para revisar antes), FORZAR=1  vuelve a bajarlas todas
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LUJO } from './lujo-datos.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.OUT || path.join(AQUI, '..', 'app', 'img', 'lujo');
const UA = 'apuestas-colegas/1.0 (https://github.com/PMbanks; imagenes de cajas)';
fs.mkdirSync(OUT, { recursive: true });
const limpia = (h) => String(h || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
const items = LUJO.flatMap((c) => c.items.map(([id, nombre, , , foto]) => ({ id, nombre, foto, caja: c.nombre })));
const filas = [];
for (const it of items) {
  const u = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({ action: 'query', format: 'json', titles: 'File:' + it.foto, prop: 'imageinfo',
    iiprop: 'url|size|extmetadata', iiurlwidth: '640', iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist|Credit' });
  const j = await (await fetch(u, { headers: { 'user-agent': UA } })).json();
  const p = Object.values(j.query?.pages || {})[0], i = p?.imageinfo?.[0];
  if (!i) { console.error('NO ESTA en Commons:', it.foto); process.exitCode = 1; continue }
  const lic = i.extmetadata?.LicenseShortName?.value || '?';
  if (!/public domain|cc0|cc by/i.test(lic)) { console.error('Licencia no libre:', it.foto, lic); process.exitCode = 1; continue }
  const dest = path.join(OUT, it.id.replace(/^lujo-/, '') + '.webp');
  if (!fs.existsSync(dest) || process.env.FORZAR) {
    let ok = false;
    for (let t = 0; t < 4 && !ok; t++) {
      const r = await fetch(i.thumburl || i.url, { headers: { 'user-agent': UA } });
      if (r.ok) { fs.writeFileSync(dest + '.src', Buffer.from(await r.arrayBuffer())); ok = true }
      else await new Promise((res) => setTimeout(res, 3000 * (t + 1)));
    }
    if (!ok) { console.error('No he podido bajar', it.foto); process.exitCode = 1; continue }
    // 512 px como mucho por el lado largo, sin agrandar
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', dest + '.src', '-vf', "scale='min(512,iw)':'min(512,ih)':force_original_aspect_ratio=decrease",
      '-c:v', 'libwebp', '-quality', '78', '-compression_level', '6', dest]);
    fs.unlinkSync(dest + '.src');
    await new Promise((res) => setTimeout(res, 500));
  }
  filas.push({ ...it, file: path.basename(dest), pagina: i.descriptionurl, autor: limpia(i.extmetadata?.Artist?.value || i.extmetadata?.Credit?.value) || 'desconocido', lic, licUrl: i.extmetadata?.LicenseUrl?.value || '' });
}
const L = ['# Fuentes de las fotos de las cajas de lujo', '',
  'Todas salen de Wikimedia Commons con licencia libre (dominio publico, CC0, CC BY o CC BY-SA). Se bajaron una vez con `sync/lujo-imagenes.mjs`,',
  'se pasaron a webp de 512 px como mucho y estan guardadas aqui en local. Las CC BY y CC BY-SA piden citar al autor: esta tabla es esa cita.', '',
  '| Foto | Objeto | Caja | Pagina en Commons | Autor | Licencia |', '|---|---|---|---|---|---|'];
for (const f of filas) L.push(`| ${f.file} | ${f.nombre} | ${f.caja} | [${f.foto.replace(/\|/g, '/')}](${f.pagina}) | ${f.autor.replace(/\|/g, '/').slice(0, 120)} | ${f.licUrl ? `[${f.lic}](${f.licUrl})` : f.lic} |`);
fs.writeFileSync(path.join(OUT, 'FUENTES.md'), L.join('\n') + '\n');
const kb = fs.readdirSync(OUT).filter((f) => f.endsWith('.webp')).reduce((a, f) => a + fs.statSync(path.join(OUT, f)).size, 0) / 1024;
console.log(`${filas.length}/${items.length} fotos en ${OUT} (${kb.toFixed(0)} KB en total)`);
