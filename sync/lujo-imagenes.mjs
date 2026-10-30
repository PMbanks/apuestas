// Baja UNA vez las fotos de los objetos de las cajas de lujo desde Wikimedia Commons (licencia libre), les quita el fondo
// (sync/lujo-recorte.py, con rembg), las encuadra sin bordes vacios y las guarda como webp con transparencia de 512 px como mucho
// en app/img/lujo/. Escribe app/img/lujo/FUENTES.md con la pagina, el autor y la licencia de cada una.
//   node sync/lujo-imagenes.mjs
// Necesita Python con rembg y Pillow (pip install "rembg[cpu]", con PYTHONPATH y U2NET_HOME apuntando fuera de C: si hace falta).
//   ORIG=carpeta  donde dejar las fotos originales (por defecto sync/.orig, se puede borrar al acabar)
//   OUT=carpeta   donde guardar los webp (por defecto app/img/lujo)
//   FORZAR=1      vuelve a bajar y recortar todas; SOLO=id,id  solo esas
// Al final llama a sync/lujo-cajas.py, que dibuja la imagen de cada caja en <OUT>/cajas/ (necesita numpy; baja la Horizon Case de la CDN de Steam).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { OBJETOS, LUJO } from './lujo-datos.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.OUT || path.join(AQUI, '..', 'app', 'img', 'lujo');
const ORIG = process.env.ORIG || path.join(AQUI, '.orig');
const UA = 'apuestas-colegas/1.0 (https://github.com/PMbanks; imagenes de cajas)';
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(ORIG, { recursive: true });
const limpia = (h) => String(h || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
const cajasDe = new Map();
for (const c of LUJO) for (const [id] of c.items) cajasDe.set(id, [...(cajasDe.get(id) || []), c.nombre]);
const solo = process.env.SOLO ? new Set(process.env.SOLO.split(',')) : null;
const filas = [], nuevos = [];
for (const [id, [nombre, , foto, opc = {}]] of Object.entries(OBJETOS)) {
  const slug = id.replace(/^lujo-/, '');
  const orig = path.join(ORIG, slug + '.src'), dest = path.join(OUT, slug + '.webp');
  const u = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({ action: 'query', format: 'json', titles: 'File:' + foto, prop: 'imageinfo',
    iiprop: 'url|size|extmetadata', iiurlwidth: '1000', iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist|Credit' });
  const j = await (await fetch(u, { headers: { 'user-agent': UA } })).json();
  const p = Object.values(j.query?.pages || {})[0], i = p?.imageinfo?.[0];
  if (!i) { console.error('NO ESTA en Commons:', foto); process.exitCode = 1; continue }
  const lic = i.extmetadata?.LicenseShortName?.value || '?';
  if (!/public domain|cc0|cc by/i.test(lic)) { console.error('Licencia no libre:', foto, lic); process.exitCode = 1; continue }
  const forzar = process.env.FORZAR || (solo && solo.has(id));
  if (!fs.existsSync(dest) || forzar) {
    if (!fs.existsSync(orig) || forzar) {
      let ok = false;
      for (let t = 0; t < 4 && !ok; t++) {
        const r = await fetch(i.thumburl || i.url, { headers: { 'user-agent': UA } });
        if (r.ok) { fs.writeFileSync(orig, Buffer.from(await r.arrayBuffer())); ok = true }
        else await new Promise((res) => setTimeout(res, 3000 * (t + 1)));
      }
      if (!ok) { console.error('No he podido bajar', foto); process.exitCode = 1; continue }
      await new Promise((res) => setTimeout(res, 400));
    }
    nuevos.push(slug + (opc.espejo ? '!espejo' : '') + (opc.mitad ? '!mitad-' + opc.mitad : ''));
  }
  filas.push({ id, nombre, foto, caja: (cajasDe.get(id) || ['(sin caja)']).join(', '), file: slug + '.webp', pagina: i.descriptionurl,
    autor: limpia(i.extmetadata?.Artist?.value || i.extmetadata?.Credit?.value) || 'desconocido', lic, licUrl: i.extmetadata?.LicenseUrl?.value || '' });
}
if (nuevos.length) execFileSync('python', [path.join(AQUI, 'lujo-recorte.py'), ORIG, OUT, ...nuevos], { stdio: 'inherit', env: process.env });
const L = ['# Fuentes de las fotos de las cajas de lujo', '',
  'Las fotos de los objetos salen de Wikimedia Commons con licencia libre (dominio publico, CC0, CC BY o CC BY-SA). Se bajaron una vez con `sync/lujo-imagenes.mjs`,',
  'se les quito el fondo con rembg (modelo isnet-general-use), se encuadraron sin bordes vacios y se guardaron aqui como webp con transparencia de 512 px como mucho.',
  'La foto recortada es una obra derivada: mantiene la licencia de la original. Las CC BY y CC BY-SA piden citar al autor: esta tabla es esa cita.', '',
  'Las imagenes de las cajas (`cajas/*.webp`, 460x480 transparentes) las dibuja `sync/lujo-cajas.py`: la caja es el arte de la Horizon Case de CS2 (de Valve, la misma CDN de Steam que ya usa la app para las cajas) recolorada, con aura de luz, destellos y el objeto estrella (foto recortada de esta tabla) saliendo por la tapa.', '',
  '| Foto | Objeto | Cajas | Pagina en Commons | Autor | Licencia |', '|---|---|---|---|---|---|'];
for (const f of filas) L.push(`| ${f.file} | ${f.nombre} | ${f.caja} | [${f.foto.replace(/\|/g, '/')}](${f.pagina}) | ${f.autor.replace(/\|/g, '/').slice(0, 120)} | ${f.licUrl ? `[${f.lic}](${f.licUrl})` : f.lic} |`);
fs.writeFileSync(path.join(OUT, 'FUENTES.md'), L.join('\n') + '\n');
// la imagen de cada caja: una caja de CS2 recolorada con tres de sus objetos en la cara de delante
const sl = (id) => id.replace(/^lujo-/, '');
const specs = LUJO.map((c) => `${sl(c.id)}:${c.color}:${[c.centro, ...c.lados].map(sl).join('+')}`);
execFileSync('python', [path.join(AQUI, 'lujo-cajas.py'), OUT, ...specs], { stdio: 'inherit', env: process.env });
const kb = fs.readdirSync(OUT).filter((f) => f.endsWith('.webp')).reduce((a, f) => a + fs.statSync(path.join(OUT, f)).size, 0) / 1024;
console.log(`${filas.length}/${Object.keys(OBJETOS).length} fotos en ${OUT} (${kb.toFixed(0)} KB en total)`);
