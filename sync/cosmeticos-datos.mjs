// Escribe db/020b_cosmeticos_datos.sql (los objetos cosmeticos y las cajas de Cosmeticos) y dibuja con codigo las imagenes SVG de los marcos,
// los fondos y las cajas en app/img/cosmeticos/. Los datos salen de sync/cosmeticos-catalogo.mjs y el aspecto de cada marco y fondo de
// app/nueva/mercado.js (el bloque entre /*ESTILOS*/ y /*FIN ESTILOS*/), para que la miniatura y lo que se ve en la app sean lo mismo.
//   node sync/cosmeticos-datos.mjs
// Precio de cada caja = valor medio de lo que sale (pesos de rareza de db/012_cajas_mas.sql: 7570, 1800, 450, 130 y 50 de cada 10.000;
// si a una caja le falta una rareza se reparte entre las que tiene), devolucion media del 100 %, como las demas. Tiene que quedar entre 20 y 150.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARCOS as LM, FONDOS as LF, OBJETOS as LO, CAJAS } from './cosmeticos-catalogo.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const IMG = path.join(AQUI, '..', 'app', 'img', 'cosmeticos');
const BASE = 'https://pmbanks.github.io/apuestas/img/cosmeticos/';
fs.mkdirSync(IMG, { recursive: true });

const js = fs.readFileSync(path.join(AQUI, '..', 'app', 'nueva', 'mercado.js'), 'utf8');
const bloque = js.slice(js.indexOf('/*ESTILOS*/'), js.indexOf('/*FIN ESTILOS*/'));
const { MARCOS: EM, FONDOS: EF } = new Function(bloque + '; return { MARCOS, FONDOS }')();
for (const [k] of LM) if (!EM[k]) throw new Error('Falta el estilo del marco ' + k + ' en mercado.js');
for (const [k] of LF) if (!EF[k]) throw new Error('Falta el estilo del fondo ' + k + ' en mercado.js');
for (const k of Object.keys(EM)) if (!LM.some((m) => m[0] === k)) throw new Error('Sobra el estilo del marco ' + k + ' (no esta en el catalogo)');
for (const k of Object.keys(EF)) if (!LF.some((m) => m[0] === k)) throw new Error('Sobra el estilo del fondo ' + k + ' (no esta en el catalogo)');

// ---------- los SVG ----------
const mezcla = (hex, con, t) => {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)), a = p(hex), b = p(con);
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
};
const svg = (w, h, cuerpo, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs>${defs}</defs>${cuerpo}</svg>\n`;
const stops = (c) => c.map((x, i) => `<stop offset="${(i / (c.length - 1) * 100).toFixed(1)}%" stop-color="${x}"/>`).join('');

function svgMarco(k) {
  const [t, a, b] = EM[k], cx = 200, cy = 150, r = 62, w = 12;
  const av = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#3a3f4a"/><circle cx="${cx}" cy="${cy - 14}" r="19" fill="#99a0aa"/><path d="M${cx - 34} ${cy + 46}a34 30 0 0 1 68 0z" fill="#99a0aa"/>`;
  const R = r + w / 2 + 1;
  let aro = '', defs = '';
  if (t === 'aro') aro = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${a}" stroke-width="${w}"/>`;
  else if (t === 'doble') aro = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${a}" stroke-width="${w}"/><circle cx="${cx}" cy="${cy}" r="${R + w + 5}" fill="none" stroke="${b}" stroke-width="${w * .8}"/>`;
  else if (t === 'neon') { defs = '<filter id="g" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="7"/></filter>'; aro = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${a}" stroke-width="${w + 4}" filter="url(#g)" opacity=".9"/><circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${a}" stroke-width="${w * .8}"/><circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#fff" stroke-width="2" opacity=".6"/>`; }
  else {
    defs = `<linearGradient id="l" x1="0" y1="0" x2="1" y2="1">${stops(a)}</linearGradient><filter id="g" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="6"/></filter>`;
    aro = (b ? `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${b}" stroke-width="${w}" filter="url(#g)" opacity=".7"/>` : '') + `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="url(#l)" stroke-width="${w}"/>`;
    if (t === 'gema') for (const [x, y] of [[0, -R], [R, 0], [0, R], [-R, 0]]) aro += `<circle cx="${cx + x}" cy="${cy + y}" r="${w * .55}" fill="#fff"/>`;
  }
  return svg(400, 300, '<rect x="30" y="20" width="340" height="260" rx="26" fill="#1d2129"/>' + av + aro, defs);
}
function svgFondo(k) {
  const f = EF[k], ang = (f.ang - 90) * Math.PI / 180, x1 = .5 - Math.cos(ang) * .5, y1 = .5 - Math.sin(ang) * .5, x2 = .5 + Math.cos(ang) * .5, y2 = .5 + Math.sin(ang) * .5;
  const glows = (f.glow || []).map(([x, y, c, rr], i) => `<radialGradient id="r${i}" cx="${x / 100}" cy="${y / 100}" r="${rr / 100 * 1.15}"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`).join('');
  const defs = `<linearGradient id="b" x1="${x1.toFixed(3)}" y1="${y1.toFixed(3)}" x2="${x2.toFixed(3)}" y2="${y2.toFixed(3)}">${stops(f.c)}</linearGradient>${glows}<clipPath id="c"><rect x="30" y="20" width="340" height="260" rx="26"/></clipPath>`;
  const cuerpo = `<g clip-path="url(#c)"><rect x="30" y="20" width="340" height="260" fill="url(#b)"/>${(f.glow || []).map((_, i) => `<rect x="30" y="20" width="340" height="260" fill="url(#r${i})"/>`).join('')}</g>`;
  return svg(400, 300, cuerpo, defs);
}
function svgCaja(color) {
  const claro = mezcla(color, '#ffffff', .35), oscuro = mezcla(color, '#000000', .38), medio = mezcla(color, '#000000', .16);
  const cuerpo = `<ellipse cx="200" cy="262" rx="120" ry="16" fill="#000" opacity=".25"/>
<polygon points="200,60 310,112 200,164 90,112" fill="${claro}"/>
<polygon points="90,112 200,164 200,254 90,202" fill="${medio}"/>
<polygon points="310,112 200,164 200,254 310,202" fill="${oscuro}"/>
<polygon points="188,163 212,163 212,253 188,253" fill="#fff" opacity=".18"/>
<polygon points="200,60 213,66 103,118 90,112" fill="#fff" opacity=".1"/>
<polygon points="200,118 212,124 200,130 188,124" fill="#fff" opacity=".85"/>`;
  return svg(400, 300, cuerpo);
}
for (const [k] of LM) fs.writeFileSync(path.join(IMG, `marco-${k}.svg`), svgMarco(k));
for (const [k] of LF) fs.writeFileSync(path.join(IMG, `fondo-${k}.svg`), svgFondo(k));
for (const [id, , col] of CAJAS) fs.writeFileSync(path.join(IMG, `caja-${id.replace(/^cos-/, '')}.svg`), svgCaja(col));

// ---------- el SQL ----------
const PESO = { mil: 7570, res: 1800, cla: 450, cov: 130, esp: 50 };
const todo = new Map();
for (const [k, n, r, v] of LM) todo.set('marco:' + k, { id: 'cos-marco-' + k, name: 'Marco | ' + n, r, v, tipo: 'marco', clave: k, img: `marco-${k}.svg` });
for (const [k, n, r, v] of LF) todo.set('fondo:' + k, { id: 'cos-fondo-' + k, name: 'Fondo | ' + n, r, v, tipo: 'fondo', clave: k, img: `fondo-${k}.svg` });
for (const [k, n, r, v] of LO) todo.set('obj:' + k, { id: 'cos-obj-' + k, name: n, r, v, tipo: 'objeto', clave: k, img: `${k}.webp` });
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const L = ['-- Generado por sync/cosmeticos-datos.mjs el ' + new Date().toISOString().slice(0, 10) + '. No se edita a mano: se vuelve a generar.',
  "-- Los objetos cosmeticos (marcos, fondos y objetos de coleccion) y las cinco cajas de Cosmeticos (cs_cases.cat = 'cosmeticos').",
  '-- Se carga despues de 020_mercado.sql (y de 007, 012 y 012b). Se puede cargar otra vez para poner precios o piezas al dia.',
  '-- Precio de cada caja = su valor medio (devolucion media del 100 %), con los pesos de rareza de 012_cajas_mas.sql.', ''];
const usados = new Map();
for (const [, , , lista] of CAJAS) for (const k of lista) { const it = todo.get(k); if (!it) throw new Error('Pieza que no existe: ' + k); usados.set(k, it) }
const sinCaja = [...todo.keys()].filter((k) => !usados.has(k));
if (sinCaja.length) console.warn('Aviso: piezas que no estan en ninguna caja:', sinCaja.join(', '));
L.push('insert into cs_items(id, name, phase, rarity, image, minf, maxf, st, weight, price) values');
L.push([...usados.values()].map((i) => `(${q(i.id)},${q(i.name)},null,${q(i.r)},${q(BASE + i.img)},null,null,false,100,'{${Array(10).fill(i.v).join(',')}}')`).join(',\n'));
L.push('on conflict (id) do update set name = excluded.name, rarity = excluded.rarity, image = excluded.image, price = excluded.price, weight = excluded.weight;', '');
L.push('insert into cos_def(item_id, tipo, clave) values');
L.push([...usados.values()].map((i) => `(${q(i.id)},${q(i.tipo)},${q(i.clave)})`).join(',\n'));
L.push('on conflict (item_id) do update set tipo = excluded.tipo, clave = excluded.clave;', '');
const filas = [], resumen = [];
CAJAS.forEach(([id, nombre, , lista], n) => {
  const por = {};
  for (const k of lista) (por[usados.get(k).r] ||= []).push(usados.get(k).v);
  let s = 0, t = 0;
  for (const r in por) { s += PESO[r] * (por[r].reduce((a, b) => a + b, 0) / por[r].length); t += PESO[r] }
  const ev = s / t, precio = Math.max(1, Math.round(ev));
  if (precio < 20 || precio > 150) throw new Error(`${nombre} cuesta ${precio}: tiene que quedar entre 20 y 150`);
  filas.push(`(${q(id)},${q(nombre)},${q(BASE + 'caja-' + id.replace(/^cos-/, '') + '.svg')},${precio},${ev.toFixed(2)},${5000 + n},'2026-10-30',true,'cosmeticos')`);
  resumen.push(`${nombre} ${precio} (${lista.length} piezas, valor medio ${ev.toFixed(1)})`);
});
L.push('insert into cs_cases(id, name, image, price, ev, sort, released, active, cat) values');
L.push(filas.join(',\n'));
L.push('on conflict (id) do update set name = excluded.name, image = excluded.image, price = excluded.price, ev = excluded.ev, sort = excluded.sort, active = excluded.active, cat = excluded.cat;', '');
L.push(`delete from cs_case_items where case_id in (${CAJAS.map((c) => q(c[0])).join(',')});`);
L.push('insert into cs_case_items(case_id, item_id) values');
L.push(CAJAS.flatMap(([id, , , lista]) => lista.map((k) => `(${q(id)},${q(usados.get(k).id)})`)).join(',\n') + ';');
fs.writeFileSync(path.join(AQUI, '..', 'db', '020b_cosmeticos_datos.sql'), L.join('\n') + '\n');
console.log('020b escrito: ' + usados.size + ' piezas. ' + resumen.join(' · '));
