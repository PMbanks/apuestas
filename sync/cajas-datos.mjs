// Datos de la pantalla Cajas: escribe db/007b_cajas_datos.sql con las cajas de CS2, lo que trae cada una y su valor.
// Cajas, skins, desgaste e imagenes: ByMykel/CSGO-API (GitHub). Precios: Skinport, en euros. Las dos sin clave.
// Se lanza a mano cuando se quiera poner precios al dia o cambiar la lista de cajas; el SQL se carga en Supabase.
//   node sync/cajas-datos.mjs
//   CACHE=carpeta  guarda y reutiliza los JSON descargados (Skinport deja 8 consultas cada 5 minutos)
//   JSON=fichero   escribe ademas los mismos datos en JSON (para probar la pantalla sin base)
// Node 24, sin dependencias.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FACTOR = 20;     // 1 euro = 20 V-Bucks (la paga del lunes, 1.000, son 50 euros de skins)
const MARGEN = 0.10;   // cada caja cuesta un 10 % mas que el valor medio de lo que sale de ella
const CAJAS = [        // en este orden salen en la app: recientes primero, luego las clasicas
  'Fever Case', 'Gallery Case', 'Kilowatt Case', 'Revolution Case', 'Recoil Case', 'Dreams & Nightmares Case',
  'Operation Riptide Case', 'Snakebite Case', 'Fracture Case', 'Prisma 2 Case', 'Clutch Case', 'Glove Case',
  'Chroma 2 Case', 'Operation Breakout Weapon Case', 'CS:GO Weapon Case',
];
// probabilidades reales por rareza (se reparten entre las que tenga la caja)
const TIER_P = { mil: 0.7992, res: 0.1598, cla: 0.032, cov: 0.0064, esp: 0.0026 };
const RAR = { rarity_rare_weapon: 'mil', rarity_mythical_weapon: 'res', rarity_legendary_weapon: 'cla', rarity_ancient_weapon: 'cov' };
// desgaste real: el juego elige un tramo con estos pesos y lo encaja en el rango de la skin (igual que cs_roll en SQL)
const X_TRAMOS = [[0, 0.07, 0.03], [0.07, 0.15, 0.24], [0.15, 0.38, 0.33], [0.38, 0.45, 0.24], [0.45, 1, 0.16]];
const CORTES = [0, 0.07, 0.15, 0.38, 0.45, 1.000001];
const WEARS = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'];
const ST_P = 0.1;
// un Doppler es un solo objeto en el juego; la fase sale despues (aproximado: las 4 fases casi siempre, gemas pocas)
const FASES = { 'Phase 1': 23, 'Phase 2': 23, 'Phase 3': 23, 'Phase 4': 23, Ruby: 3, Sapphire: 3, 'Black Pearl': 2 };
const FASES_GAMMA = { 'Phase 1': 24, 'Phase 2': 24, 'Phase 3': 24, 'Phase 4': 24, Emerald: 4 };
const IMG = 'https://community.akamai.steamstatic.com/economy/image/';

const URLS = {
  crates: 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/crates.json',
  skins: 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json',
  precios: 'https://api.skinport.com/v1/items?app_id=730&currency=EUR',
};
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SALIDA = path.join(AQUI, '..', 'db', '007b_cajas_datos.sql');

async function trae(k) {
  const cache = process.env.CACHE && path.join(process.env.CACHE, k + '.json');
  if (cache && fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache, 'utf8'));
  const headers = { 'user-agent': 'apuestas-colegas/1.0', ...(k === 'precios' ? { 'accept-encoding': 'br' } : {}) };
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(URLS[k], { headers });
      if (r.ok) {
        const txt = await r.text();
        if (cache) { fs.mkdirSync(path.dirname(cache), { recursive: true }); fs.writeFileSync(cache, txt) }
        return JSON.parse(txt);
      }
      console.error(k, 'HTTP', r.status);
      if (r.status < 500 && r.status !== 429) break;
    } catch (e) { console.error(k, e.message) }
    await new Promise((ok) => setTimeout(ok, 3000 * (i + 1)));
  }
  return null;
}

const mediana = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null };
const vb = (eur) => Math.max(1, Math.round(eur * FACTOR));
const q = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);

// probabilidad de cada desgaste (RF CN AD BD D) para una skin con ese rango de float
function probDesgaste(minf, maxf) {
  if (minf == null) return [1, 0, 0, 0, 0];
  const p = [0, 0, 0, 0, 0];
  for (const [a, b, w] of X_TRAMOS) {
    const fa = minf + (maxf - minf) * a, fb = minf + (maxf - minf) * b, len = fb - fa;
    for (let t = 0; t < 5; t++) {
      if (len <= 0) { if (fa >= CORTES[t] && fa < CORTES[t + 1]) p[t] += w; continue }
      const lo = Math.max(fa, CORTES[t]), hi = Math.min(fb, CORTES[t + 1]);
      if (hi > lo) p[t] += (w * (hi - lo)) / len;
    }
  }
  return p;
}

async function main() {
  const [crates, skins, precios] = await Promise.all([trae('crates'), trae('skins'), trae('precios')]);
  if (!crates || !skins) throw new Error('No he podido bajar las cajas de ByMykel/CSGO-API');
  const SK = new Map(skins.map((s) => [s.id, s]));
  const EUR = new Map();
  for (const x of precios || []) {
    const v = x.suggested_price ?? x.min_price ?? x.median_price;
    if (v != null && v > 0) EUR.set(x.market_hash_name + '|' + (x.version || ''), v);
  }
  if (!EUR.size) console.error('Sin precios de Skinport: se usan precios por rareza');

  const cajas = CAJAS.map((n) => { const c = crates.find((x) => x.name === n && x.type === 'Case'); if (!c) console.error('No encuentro la caja', n); return c }).filter(Boolean);
  const items = new Map();   // id -> objeto
  for (const c of cajas) {
    for (const [lista, rara] of [[c.contains, false], [c.contains_rare, true]]) {
      for (const it of lista) {
        if (items.has(it.id)) continue;
        const s = SK.get(it.id) || {};
        const phase = s.phase || it.phase || null;
        const gamma = /Gamma Doppler/.test(it.name);
        items.set(it.id, {
          id: it.id, name: it.name, phase,
          rarity: rara ? 'esp' : RAR[it.rarity.id] || 'mil',
          image: it.image || s.image || '',
          minf: s.min_float ?? null, maxf: s.max_float ?? null,
          st: !!s.stattrak,
          weight: phase ? (gamma ? FASES_GAMMA : FASES)[phase] || 10 : 100,
        });
      }
    }
  }

  // precios en euros: 5 desgastes normal y 5 StatTrak
  const nombre = (it, st, w) => {
    let n = it.name;
    if (st) n = n.startsWith('★ ') ? '★ StatTrak™ ' + n.slice(2) : 'StatTrak™ ' + n;
    return it.minf == null ? n : `${n} (${WEARS[w]})`;
  };
  for (const it of items.values()) {
    it.eur = [false, true].map((st) => [0, 1, 2, 3, 4].map((w) => EUR.get(nombre(it, st, w) + '|' + (it.phase || '')) ?? null));
  }
  // huecos: el desgaste mas cercano; si falta toda una fila, la otra por la proporcion tipica de su rareza; si no hay nada, la mediana de su rareza
  const ratio = {}, base = {};
  for (const r of Object.keys(TIER_P)) {
    const del = [...items.values()].filter((it) => it.rarity === r);
    const rs = []; for (const it of del) for (let w = 0; w < 5; w++) if (it.eur[0][w] && it.eur[1][w]) rs.push(it.eur[1][w] / it.eur[0][w]);
    ratio[r] = Math.min(4, Math.max(1.05, mediana(rs) || (r === 'esp' ? 1.2 : 2)));
    base[r] = [0, 1, 2, 3, 4].map((w) => mediana(del.map((it) => it.eur[0][w]).filter(Boolean)) || { mil: 0.1, res: 0.5, cla: 3, cov: 15, esp: 150 }[r]);
  }
  const huecos = { desgaste: 0, statrak: 0, rareza: 0 };
  const cerca = (fila) => fila.map((v, w) => {
    if (v != null) return v;
    for (let d = 1; d < 5; d++) for (const k of [w - d, w + d]) if (fila[k] != null) return fila[k];
    return null;
  });
  for (const it of items.values()) {
    let [n, s] = it.eur;
    if (it.minf == null) { n = n.map(() => n[0]); s = s.map(() => s[0]) }   // sin desgaste: el mismo precio
    if (n.some((v) => v == null) && n.some((v) => v != null)) huecos.desgaste++;
    n = cerca(n); s = cerca(s);
    if (n[0] == null && s[0] != null) n = s.map((v) => v / ratio[it.rarity]);
    if (n[0] == null) { n = [...base[it.rarity]]; huecos.rareza++ }
    if (s[0] == null) { s = n.map((v) => v * ratio[it.rarity]); if (it.st) huecos.statrak++ }
    if (!it.st) s = [...n];
    it.price = [...n, ...s].map(vb);
  }

  // valor medio de cada skin y de cada caja (lo mismo que hace el servidor al abrir)
  const evItem = (it) => {
    const p = probDesgaste(it.minf, it.maxf);
    return p.reduce((a, pw, w) => a + pw * (it.st ? (1 - ST_P) * it.price[w] + ST_P * it.price[5 + w] : it.price[w]), 0);
  };
  const filas = cajas.map((c, i) => {
    const ids = [...c.contains, ...c.contains_rare].map((x) => x.id);
    const por = {}; for (const id of ids) { const it = items.get(id); (por[it.rarity] = por[it.rarity] || []).push(it) }
    const tot = Object.keys(por).reduce((a, r) => a + TIER_P[r], 0);
    let ev = 0;
    for (const [r, list] of Object.entries(por)) {
      const wsum = list.reduce((a, it) => a + it.weight, 0);
      ev += (TIER_P[r] / tot) * list.reduce((a, it) => a + (it.weight / wsum) * evItem(it), 0);
    }
    return { id: c.id, name: c.name, image: c.image, released: (c.first_sale_date || '').replace(/\//g, '-') || null, sort: i + 1, ev, price: Math.max(1, Math.round(ev * (1 + MARGEN))), ids };
  });

  const corta = (u) => (u.startsWith(IMG) ? u.slice(IMG.length) : u);
  const fecha = (s) => { const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s || ''); return m ? `'${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}'` : 'null' };
  const L = [];
  L.push(`-- Generado por sync/cajas-datos.mjs el ${new Date().toISOString().slice(0, 10)}. No se edita a mano: se vuelve a generar.`);
  L.push(`-- Fuentes: ByMykel/CSGO-API (cajas, skins, imagenes de Steam) y Skinport (precios en euros). 1 euro = ${FACTOR} V-Bucks.`);
  L.push(`-- Precio de cada caja: valor medio de lo que sale (probabilidades reales, desgaste y StatTrak) mas un ${Math.round(MARGEN * 100)} %.`);
  L.push(`-- Se carga despues de 007_cajas.sql y se puede cargar otra vez para poner los precios al dia.`);
  L.push(`-- Precios de cada skin: RF CN AD BD D y despues lo mismo en StatTrak, en V-Bucks.`);
  L.push('');
  L.push('insert into cs_items(id, name, phase, rarity, image, minf, maxf, st, weight, price) values');
  L.push([...items.values()].map((it) => `(${q(it.id)},${q(it.name)},${q(it.phase)},'${it.rarity}',${q(corta(it.image))},${it.minf ?? 'null'},${it.maxf ?? 'null'},${it.st},${it.weight},'{${it.price.join(',')}}')`).join(',\n'));
  L.push('on conflict (id) do update set name = excluded.name, phase = excluded.phase, rarity = excluded.rarity, image = excluded.image,');
  L.push('  minf = excluded.minf, maxf = excluded.maxf, st = excluded.st, weight = excluded.weight, price = excluded.price;');
  L.push('');
  L.push('insert into cs_cases(id, name, image, price, ev, sort, released, active) values');
  L.push(filas.map((c) => `(${q(c.id)},${q(c.name)},${q(corta(c.image))},${c.price},${c.ev.toFixed(2)},${c.sort},${fecha(c.released)},true)`).join(',\n'));
  L.push('on conflict (id) do update set name = excluded.name, image = excluded.image, price = excluded.price, ev = excluded.ev,');
  L.push('  sort = excluded.sort, released = excluded.released, active = true;');
  L.push(`update cs_cases set active = false where id not in (${filas.map((c) => q(c.id)).join(',')});`);
  L.push('');
  L.push(`delete from cs_case_items where case_id in (${filas.map((c) => q(c.id)).join(',')});`);
  L.push('insert into cs_case_items(case_id, item_id) values');
  L.push(filas.map((c) => c.ids.map((id) => `(${q(c.id)},${q(id)})`).join(',')).join(',\n') + ';');
  L.push('');
  fs.writeFileSync(SALIDA, L.join('\n'));

  if (process.env.JSON) {
    fs.writeFileSync(process.env.JSON, JSON.stringify({
      cases: filas.map(({ id, name, image, price, ev, sort, ids }) => ({ id, name, image: corta(image), price, ev: +ev.toFixed(2), sort, ids })),
      items: [...items.values()].map(({ id, name, phase, rarity, image, minf, maxf, st, weight, price }) => ({ id, name, phase, rarity, image: corta(image), minf, maxf, st, weight, price })),
    }));
  }
  const kb = (fs.statSync(SALIDA).size / 1024).toFixed(0);
  console.log(`${path.relative(process.cwd(), SALIDA)}: ${filas.length} cajas, ${items.size} skins, ${kb} KB. Huecos rellenados: ${JSON.stringify(huecos)}`);
  for (const c of filas) console.log(`  ${c.name.padEnd(32)} ${String(c.price).padStart(4)} V-Bucks  (valor medio ${c.ev.toFixed(1)})`);
}

main().catch((e) => { console.error(e.message); process.exit(1) });
