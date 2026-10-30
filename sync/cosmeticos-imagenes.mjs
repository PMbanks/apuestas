// Baja UNA vez las fotos de los objetos de coleccion de las cajas de Cosmeticos desde Wikimedia Commons (licencia libre), les quita el fondo
// con sync/lujo-recorte.py (rembg) y las guarda como webp con transparencia de 512 px como mucho en app/img/cosmeticos/.
// Escribe app/img/cosmeticos/FUENTES.md con la pagina, el autor y la licencia de cada una.
//   node sync/cosmeticos-imagenes.mjs
// Necesita Python con rembg y Pillow; U2NET_HOME y ORIG (carpeta de originales, se puede borrar al acabar) fuera de C: si hace falta.
//   OUT=carpeta   donde guardar los webp (por defecto app/img/cosmeticos)    FORZAR=1   vuelve a bajar todas    SOLO=clave,clave   solo esas
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { OBJETOS, CAJAS } from './cosmeticos-catalogo.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.OUT || path.join(AQUI, '..', 'app', 'img', 'cosmeticos');
const ORIG = process.env.ORIG || path.join(AQUI, '.orig');
const UA = 'apuestas-colegas/1.0 (https://github.com/PMbanks; imagenes de cosmeticos)';
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(ORIG, { recursive: true });
const limpia = (h) => String(h || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
const cajasDe = new Map();
for (const [, nombre, , lista] of CAJAS) for (const k of lista) if (k.startsWith('obj:')) cajasDe.set(k.slice(4), [...(cajasDe.get(k.slice(4)) || []), nombre]);
const solo = process.env.SOLO ? new Set(process.env.SOLO.split(',')) : null;
const filas = [], nuevos = [];
for (const [clave, nombre, , , foto] of OBJETOS) {
  const orig = path.join(ORIG, clave + '.src'), dest = path.join(OUT, clave + '.webp');
  const u = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({ action: 'query', format: 'json', titles: 'File:' + foto, prop: 'imageinfo',
    iiprop: 'url|size|extmetadata', iiurlwidth: '1000', iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist|Credit' });
  const j = await (await fetch(u, { headers: { 'user-agent': UA } })).json();
  const p = Object.values(j.query?.pages || {})[0], i = p?.imageinfo?.[0];
  if (!i) { console.error('NO ESTA en Commons:', foto); process.exitCode = 1; continue }
  const lic = i.extmetadata?.LicenseShortName?.value || '?';
  if (!/public domain|cc0|cc by/i.test(lic)) { console.error('Licencia no libre:', foto, lic); process.exitCode = 1; continue }
  const forzar = process.env.FORZAR || (solo && solo.has(clave));
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
    nuevos.push(clave);
  }
  filas.push({ nombre, foto, caja: (cajasDe.get(clave) || ['(sin caja)']).join(', '), file: clave + '.webp', pagina: i.descriptionurl,
    autor: limpia(i.extmetadata?.Artist?.value || i.extmetadata?.Credit?.value) || 'desconocido', lic, licUrl: i.extmetadata?.LicenseUrl?.value || '' });
}
if (nuevos.length) execFileSync('python', [path.join(AQUI, 'lujo-recorte.py'), ORIG, OUT, ...nuevos], { stdio: 'inherit', env: process.env });
const L = ['# Fuentes de las fotos de los objetos de coleccion (cajas de Cosmeticos)', '',
  'Las fotos salen de Wikimedia Commons con licencia libre (dominio publico, CC0, CC BY o CC BY-SA). Se bajaron una vez con `sync/cosmeticos-imagenes.mjs`,',
  'se les quito el fondo con rembg (modelo isnet-general-use), se encuadraron sin bordes vacios y se guardaron aqui como webp con transparencia de 512 px como mucho.',
  'La foto recortada es una obra derivada: mantiene la licencia de la original. Las CC BY y CC BY-SA piden citar al autor: esta tabla es esa cita.', '',
  'Los marcos, los fondos y las imagenes de las cajas (`marco-*.svg`, `fondo-*.svg`, `caja-*.svg`) estan dibujados en codigo por `sync/cosmeticos-datos.mjs`: no tienen fuente externa.', '',
  '| Foto | Objeto | Cajas | Pagina en Commons | Autor | Licencia |', '|---|---|---|---|---|---|'];
for (const f of filas) L.push(`| ${f.file} | ${f.nombre} | ${f.caja} | [${f.foto.replace(/\|/g, '/')}](${f.pagina}) | ${f.autor.replace(/\|/g, '/').slice(0, 120)} | ${f.licUrl ? `[${f.lic}](${f.licUrl})` : f.lic} |`);
fs.writeFileSync(path.join(OUT, 'FUENTES.md'), L.join('\n') + '\n');
console.log(filas.length + ' fotos; ' + nuevos.length + ' nuevas');
