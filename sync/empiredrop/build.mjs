// Genera empire-cajas.json (resumen), db/055_empiredrop.sql (+055b datos) y las listas para cajas.js / i18n.js a partir de raw/empiredrop-cajas-crudo.json.
// node build.mjs   (Node 24, sin dependencias)
import fs from 'node:fs';
import { MAP, NUEVAS, SIN_EQUIVALENTE, TODAS } from './seleccion.mjs';

const WT = 'D:/eddwi/claude/sandbox/wt-empire/';
const RAW = JSON.parse(fs.readFileSync('raw/empiredrop-cajas-crudo.json', 'utf8'));
const B = RAW.boxes;
const URL_IMG = 'https://pmbanks.github.io/apuestas/img/lujo/';
const RTP = 0.9;                 // devolucion media de EmpireDrop: todas sus cajas valen un 90 % de su precio

// nombre de cada caja: [espanol, ingles (el de EmpireDrop)]. Sin guiones en lo visible.
const NOM = {
  'gaming-empire': ['Imperio Gamer', 'Gaming Empire'], 'black-deals': ['Ofertas Black', 'Black Deals'], 'exclusive-5-tech': ['Tecnología exclusiva 5 %', 'Exclusive 5% Tech'],
  'apple-degens': ['Fanáticos de Apple', 'Apple Degens'], 'shutter-sanctuary': ['Santuario del obturador', 'Shutter Sanctuary'], 'affordable-watch': ['Reloj asequible', 'Affordable Watch'],
  '5-watches': ['Relojes 5 %', '5% Watches'], '10-rolex': ['Rolex 10 %', '10% Rolex'], 'gems-addict': ['Adicto a las gemas', 'Gems Addict'], 'luxury-jewelry': ['Joyería de lujo', 'Luxury Jewelry'],
  'nike-vs-adidas': ['Nike contra Adidas', 'Nike VS Adidas'], 'grail-kicks': ['Zapatillas grial', 'Grail Kicks'], 'sneakers-drip': ['Estilo sneakers', 'Sneakers Drip'], 'stone-island': ['Stone Island', 'Stone Island'],
  'palm-angels': ['Palm Angels', 'Palm Angels'], 'bag-enthusiast': ['Amante de los bolsos', 'Bag Enthusiast'], 'private-perfume': ['Perfume privado', 'Private Perfume'],
  'bikers-bounty': ['Botín del motero', "Biker's Bounty"], '10-cars': ['Coches 10 %', '10% Cars'], 'autobahn': ['Autobahn', 'Autobahn'], '10-travel': ['Viajes 10 %', '10% Travel'],
  'precious-duo': ['Dúo precioso', 'Precious Duo'], 'blockchain-bundle': ['Pack blockchain', 'Blockchain Bundle'], 'pokemon-stash': ['Alijo Pokémon', 'Pokemon Stash'],
  'xbox-vs-playstation': ['Xbox contra PlayStation', 'Xbox VS Playstation'], '5-console-legends': ['Consolas legendarias 5 %', '5% Console Legends'], '10-gaming': ['Gaming 10 %', '10% Gaming'],
  'full-send-gaming': ['Gaming a tope', 'Full Send Gaming'], 'pro-setup': ['Equipo pro', 'Pro Setup'], 'streamer-setup': ['Equipo de streamer', 'Streamer Setup'], 'only-mac': ['Solo Mac', 'Only Mac'],
  'cinematic-view': ['Vista de cine', 'Cinematic View'], '1-patek': ['Patek 1 %', '1% Patek'], 'master-of-time': ['Maestro del tiempo', 'Master of Time'], 'rado-vs-tudor': ['Rado contra Tudor', 'Rado VS Tudor'],
  'cartier-treasure': ['Tesoro Cartier', 'Cartier Treasure'], 'pandora': ['Pandora', 'Pandora'], '1-versace': ['Versace 1 %', '1% Versace'], '1-louis-vuitton': ['Louis Vuitton 1 %', '1% Louis Vuitton'],
  'chanel-prestige': ['Prestigio Chanel', 'Chanel Prestige'], 'birkin-addict': ['Adicto a los Birkin', 'Birkin Addict'], '100-bags': ['Bolsos 100 %', '100% Bags'], 'nike': ['Nike', 'Nike'], 'jordan': ['Jordan', 'Jordan'],
  'street-soles': ['Suelas de calle', 'Street Soles'], '1-cars': ['Coches 1 %', '1% Cars'], '1-mercedes': ['Mercedes 1 %', '1% Mercedes'], 'german-engine': ['Motor alemán', 'German Engine'],
  'heritage-motors': ['Motores de herencia', 'Heritage Motors'], 'tesla': ['Tesla', 'Tesla'], 'american-driver': ['Conductor americano', 'American Driver'], 'yacht-club': ['Club náutico', 'Yacht Club'],
  'luxury-garage': ['Garaje de lujo', 'Luxury Garage'], 'gold-digger': ['Buscador de oro', 'Gold Digger'], 'fortune-box': ['Caja de la fortuna', 'Fortune Box'], 'poke-starter': ['Inicial Pokémon', 'Poké Starter'],
  '5-pokemon': ['Pokémon 5 %', '5% Pokémon'], 'legendary-pulls': ['Sobres legendarios', 'Legendary Pulls'], 'panini': ['Panini', 'Panini'],
};
// grupo de la app (cajas.js GRUPOS) de cada caja que sustituye a una vieja
const GRUPO_DE = {
  'lujo-tecnologia-basica': 'tec', 'lujo-tecnologia': 'tec', 'lujo-tecnologia-2026': 'tec', 'lujo-gaming': 'tec', 'lujo-camaras': 'tec', 'lujo-patinetes': 'tec',
  'lujo-relojes-calle': 'relojes', 'lujo-relojes': 'relojes', 'lujo-relojes-2026': 'relojes', 'lujo-joyas': 'relojes', 'lujo-moda-joyas': 'relojes',
  'lujo-zapatillas-basicas': 'moda', 'lujo-zapatillas': 'moda', 'lujo-zapatillas-2026': 'moda', 'lujo-moda-calle': 'moda', 'lujo-bolsos': 'moda', 'lujo-gafas': 'moda', 'lujo-streetwear': 'moda', 'lujo-perfumes': 'moda',
  'lujo-motos': 'motor', 'lujo-coches': 'motor', 'lujo-motor': 'motor', 'lujo-viajes': 'motor', 'lujo-oro': 'inv', 'lujo-cripto': 'inv', 'lujo-cartas': 'inv' };
const GRUPO_N = { tec: 1, relojes: 2, moda: 3, motor: 4, inv: 5 };
const RAR = { COMMON: 'mil', UNCOMMON: 'mil', RARE: 'res', EPIC: 'cla', LEGENDARY: 'cov', GOLDEN: 'esp' };

const limpia = (s) => String(s).replace(/[\u2013\u2014]/g, '-').replace(/(\s+-+)+\s+/g, ' ').replace(/\s+/g, ' ').trim();
const sq = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const imgId = (p) => p.split('/').pop().replace(/\.\w+$/, '');

// ---------- cajas ----------
const cajas = [];   // { id, slug, grupo, ... }
for (const [id, slug] of Object.entries(MAP)) cajas.push({ id, slug, grupo: GRUPO_DE[id], sustituye: id });
for (const [g, l] of Object.entries(NUEVAS)) for (const slug of l) cajas.push({ id: 'lujo-ed-' + slug.replace(/[^a-z0-9]+/g, '-'), slug, grupo: g, sustituye: null });

const itemsGlobal = new Map();   // id de objeto -> fila
const hashPrecio = new Map();
function idObjeto(i) {
  const hash = i[9], cents = i[2];
  const base = 'ed-' + hash;
  if (!hashPrecio.has(hash)) { hashPrecio.set(hash, cents); return base }
  return hashPrecio.get(hash) === cents ? base : base + '-' + cents;
}
const resumen = [];
for (const c of cajas) {
  const b = B[c.slug];
  const tot = b.it.reduce((a, i) => a + i[3], 0);
  const its = b.it.map((i) => {
    const id = idObjeto(i);
    const cents = i[2], vb = Math.max(1, Math.round(cents / 100));
    const fila = { id, nombre: limpia(i[0]), nombreOriginal: i[0], marca: i[6] || null, rarezaED: i[5], rareza: RAR[i[5]] || 'mil', precioEUR: +(cents / 100).toFixed(2), precioVB: vb,
      tickets: i[3], pct: +((i[3] / tot) * 100).toFixed(6), imgED: i[7] || i[4], img: imgId(i[7] || i[4]) };
    if (!itemsGlobal.has(id)) itemsGlobal.set(id, fila);
    return fila;
  });
  const suma = its.reduce((a, x) => a + x.pct, 0);
  const evEUR = its.reduce((a, x) => a + (x.pct / 100) * x.precioEUR, 0), evVB = its.reduce((a, x) => a + (x.pct / 100) * x.precioVB, 0);
  const precioED = b.p / 100;
  // precio en la app: el de EmpireDrop (1 euro = 1 V-Buck) si la devolucion queda en el 90 % +-3; si no (cajas de pocos euros, donde redondear a V-Bucks enteros descuadra), el que da el 90 % con los precios redondeados
  const directo = Math.max(1, Math.round(precioED)), rtpDirecto = evVB / directo;
  const precio = Math.abs(rtpDirecto - RTP) <= 0.03 ? directo : Math.max(1, Math.round(evVB / RTP));
  Object.assign(c, { nombre: NOM[c.slug][0], nombreEN: NOM[c.slug][1], nombreED: b.n, categoriaED: b.c, precioED, precio, ev: +evVB.toFixed(2), rtp: +(evVB / precio).toFixed(4), rtpED: +(evEUR / precioED).toFixed(4),
    sumaPct: +suma.toFixed(6), n: its.length, imgCaja: imgId(b.img), items: its });
  if (!NOM[c.slug]) throw new Error('falta nombre de ' + c.slug);
}
// orden dentro de cada grupo: de barata a cara
const orden = new Map();
for (const g of Object.keys(GRUPO_N)) {
  const l = cajas.filter((c) => c.grupo === g).sort((a, b) => a.precio - b.precio || a.nombre.localeCompare(b.nombre));
  l.forEach((c, k) => { c.sort = 100 + GRUPO_N[g] * 100 + k });
}

// ---------- resumen JSON ----------
const salida = {
  fuente: 'empiredrop.com (GET de /_next/data/<build>/en/boxes/<slug>.json con la sesion de PM, 01-11-2026). Precios en euros; 1 euro = 1 V-Buck. Probabilidad = game_odds / suma de game_odds de la caja (EmpireDrop reparte 10.000.000 de tickets).',
  buildId: RAW.buildId, obtenido: RAW.fetched, devolucion: 'todas las cajas de EmpireDrop devuelven el 90 % de su precio',
  cajas: cajas.map((c) => ({ id: c.id, sustituyeA: c.sustituye, slugED: c.slug, nombre: c.nombre, nombreEN: c.nombreEN, categoriaED: c.categoriaED, grupoApp: c.grupo, precioED_EUR: c.precioED, precioApp_VB: c.precio, evApp_VB: c.ev, devolucionApp: c.rtp, devolucionED: c.rtpED,
    sumaProbabilidades: c.sumaPct, imagenCaja: `app/img/lujo/cajas/ed-${c.slug}.webp`,
    objetos: c.items.map((x) => ({ id: x.id, nombre: x.nombre, original: x.nombreOriginal, marca: x.marca, rarezaED: x.rarezaED, precioEUR: x.precioEUR, precioVB: x.precioVB, probabilidadPct: x.pct, tickets: x.tickets, imagen: x.img })) })),
  sinEquivalente: SIN_EQUIVALENTE,
};
fs.writeFileSync('empire-cajas.json', JSON.stringify(salida, null, 1));
fs.writeFileSync('empire-resumen.tsv', ['id\tsustituye\tslugED\tnombre\tgrupo\tn\tprecioED\tprecioApp\tdevolucionApp\tsuma%', ...cajas.map((c) => [c.id, c.sustituye || '(nueva)', c.slug, c.nombre, c.grupo, c.n, c.precioED, c.precio, c.rtp, c.sumaPct.toFixed(4)].join('\t'))].join('\n'));

// ---------- SQL ----------
const ids = cajas.map((c) => c.id), idsq = ids.map(sq).join(',');
const items = [...itemsGlobal.values()];
const cab = `-- 055 (01-11). EmpireDrop: PM pidio "que las odds sean las de EmpireDrop; copiale las cajas y lo que hay en sus cajas" (la caja de Nvidia no traia Nvidia ni Xbox ni HyperX).
-- ${cajas.length} cajas de lujo con sus objetos, precios y probabilidades copiados de empiredrop.com (datos crudos en D:/eddwi/claude/sandbox/empiredrop/raw). Las ${Object.keys(MAP).length} que ya existian
-- (db/012b y db/046) conservan su id y SUSTITUYEN su contenido (los objetos viejos siguen en cs_items por los inventarios, solo salen de la caja); ${cajas.length - Object.keys(MAP).length} cajas nuevas (lujo-ed-*).
-- Patinetes (lujo-patinetes) y Gafas (lujo-gafas) no tienen caja en EmpireDrop: no se tocan.
-- Probabilidad por objeto: nueva columna cs_case_items.tickets (los game_odds de EmpireDrop, 10.000.000 por caja). Si una caja lleva tickets, cs_roll tira con ellos; si no (CS2, Patinetes, Gafas),
-- tira por rareza como siempre (027). Generado por D:/eddwi/claude/sandbox/empiredrop/build.mjs: no se edita a mano.
-- Precios: 1 euro = 1 V-Buck. Cada caja devuelve de media un 90 % de lo que cuesta (como EmpireDrop).
`;

const sql055 = `${cab}-- Este fichero lleva la estructura y las dos funciones; los datos van en 055b_empiredrop_datos.sql (despues). Se puede ejecutar varias veces.

alter table cs_case_items add column if not exists tickets bigint check (tickets is null or tickets > 0);

-- cs_roll: igual que la de 027, con una rama nueva para las cajas con tickets
create or replace function cs_roll(p_case text, out o_item text, out o_wear smallint, out o_fl numeric, out o_st boolean, out o_value int)
language plpgsql volatile security definer set search_path = public as $$
declare
  pesos int[] := array[7992, 1598, 320, 64, 26];
  rar text[] := array['mil','res','cla','cov','esp'];
  hay text[];
  suma int := 0;
  tiro int;
  k int;
  grado text;
  x double precision;
  tramo int;
  it record;
  con_tickets boolean;
begin
  select exists (select 1 from cs_case_items where case_id = p_case and tickets is not null) into con_tickets;
  if con_tickets then
    -- cajas de EmpireDrop: cada objeto sale con su propia probabilidad (tickets / suma de tickets)
    x := cs_rand();
    select q.* into it from (
      select t.id, t.minf, t.maxf, t.st, t.price,
             sum(ci.tickets) over (order by t.id) as acum, sum(ci.tickets) over () as total
      from cs_items t join cs_case_items ci on ci.item_id = t.id
      where ci.case_id = p_case and ci.tickets is not null
    ) q where q.acum > x * q.total order by q.acum limit 1;
    if it.id is null then raise exception 'Esa caja está vacía'; end if;
  else
    select array_agg(distinct ci_it.rarity) into hay
      from cs_case_items ci join cs_items ci_it on ci_it.id = ci.item_id where ci.case_id = p_case;
    if hay is null then raise exception 'Esa caja está vacía'; end if;
    for k in 1..5 loop if rar[k] = any(hay) then suma := suma + pesos[k]; end if; end loop;
    tiro := floor(cs_rand() * suma)::int;
    for k in 1..5 loop
      if rar[k] = any(hay) then
        if tiro < pesos[k] then grado := rar[k]; exit; end if;
        tiro := tiro - pesos[k];
      end if;
    end loop;
    x := cs_rand();
    select q.* into it from (
      select t.id, t.minf, t.maxf, t.st, t.price,
             sum(t.weight) over (order by t.id) as acum, sum(t.weight) over () as total
      from cs_items t join cs_case_items ci on ci.item_id = t.id
      where ci.case_id = p_case and t.rarity = grado
    ) q where q.acum > x * q.total order by q.acum limit 1;
  end if;

  if it.minf is null then
    o_wear := null; o_fl := null;      -- sin desgaste: cuchillos lisos y todo el lujo
  else
    tramo := floor(cs_rand() * 100)::int;
    x := case when tramo < 3 then 0.07 * cs_rand()
              when tramo < 27 then 0.07 + 0.08 * cs_rand()
              when tramo < 60 then 0.15 + 0.23 * cs_rand()
              when tramo < 84 then 0.38 + 0.07 * cs_rand()
              else 0.45 + 0.55 * cs_rand() end;
    o_fl := round((it.minf + (it.maxf - it.minf) * x)::numeric, 6);
    o_wear := case when o_fl < 0.07 then 0 when o_fl < 0.15 then 1 when o_fl < 0.38 then 2 when o_fl < 0.45 then 3 else 4 end;
  end if;
  o_st := it.st and cs_rand() < 0.1;
  o_value := greatest(1, coalesce(it.price[1 + (case when o_st then 5 else 0 end) + coalesce(o_wear, 0)], 1));
  o_item := it.id;
end $$;
revoke all on function cs_roll(text) from public, anon, authenticated;

-- cs_case: igual que la de 012, con los tickets de cada objeto (null si la caja tira por rareza)
create or replace function cs_case(p_case text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare caja cs_cases;
begin
  if not is_player() then raise exception 'Tienes que entrar primero'; end if;
  select * into caja from cs_cases where id = p_case;
  if not found then raise exception 'Esa caja no existe'; end if;
  return jsonb_build_object('id', caja.id, 'name', caja.name, 'image', caja.image, 'price', caja.price, 'ev', caja.ev, 'active', caja.active, 'cat', caja.cat,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'phase', t.phase, 'rarity', t.rarity, 'image', t.image,
                'st', t.st, 'minf', t.minf, 'maxf', t.maxf, 'weight', t.weight, 'price', to_jsonb(t.price), 'tickets', ci.tickets) order by t.id), '[]'::jsonb)
              from cs_items t join cs_case_items ci on ci.item_id = t.id where ci.case_id = p_case));
end $$;
revoke all on function cs_case(text) from public, anon;
grant execute on function cs_case(text) to authenticated;
`;

const filasItems = items.map((x) => `(${sq(x.id)},${sq(x.nombre)},null,${sq(x.rareza)},${sq(URL_IMG + 'ed/' + x.img + '.webp')},null,null,false,100,'{${Array(10).fill(x.precioVB).join(',')}}')`);
const filasCajas = cajas.map((c) => `(${sq(c.id)},${sq(c.nombre)},${sq(URL_IMG + 'cajas/ed-' + c.slug + '.webp')},${c.precio},${c.ev.toFixed(2)},${c.sort},null,true,'lujo')`);
const filasCI = []; for (const c of cajas) for (const x of c.items) filasCI.push(`(${sq(c.id)},${sq(x.id)},${x.tickets})`);
const trozos = (a, n) => { const r = []; for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n)); return r };

const sql055b = `${cab}-- Datos: ${items.length} objetos, ${cajas.length} cajas, ${filasCI.length} filas caja-objeto. Va despues de 055_empiredrop.sql. Se puede ejecutar varias veces: las cajas y los objetos se actualizan,
-- el contenido de cada caja se rehace (los objetos que ya tengan los jugadores no se tocan: cs_inv apunta a cs_items, que no se borra).

${trozos(filasItems, 400).map((t) => `insert into cs_items(id, name, phase, rarity, image, minf, maxf, st, weight, price) values\n${t.join(',\n')}\non conflict (id) do update set name = excluded.name, phase = excluded.phase, rarity = excluded.rarity, image = excluded.image,\n  minf = excluded.minf, maxf = excluded.maxf, st = excluded.st, weight = excluded.weight, price = excluded.price;`).join('\n\n')}

insert into cs_cases(id, name, image, price, ev, sort, released, active, cat) values
${filasCajas.join(',\n')}
on conflict (id) do update set name = excluded.name, image = excluded.image, price = excluded.price, ev = excluded.ev,
  sort = excluded.sort, released = excluded.released, active = true, cat = excluded.cat;

delete from cs_case_items where case_id in (${idsq});
${trozos(filasCI, 500).map((t) => `insert into cs_case_items(case_id, item_id, tickets) values\n${t.join(',\n')};`).join('\n\n')}
`;
fs.writeFileSync(WT + 'db/055_empiredrop.sql', sql055);
fs.writeFileSync(WT + 'db/055b_empiredrop_datos.sql', sql055b);

// ---------- trozos para cajas.js e i18n.js ----------
const gd = cajas.filter((c) => !c.sustituye).map((c) => `'${c.id}': '${c.grupo}'`);
fs.writeFileSync('cajas-grupo-de.txt', gd.join(', '));
const ds = new Map(); for (const c of cajas) ds.set(c.nombre, c.nombreEN);
fs.writeFileSync('i18n-nomb.txt', [...ds].filter(([es, en]) => es !== en).map(([es, en]) => `'${es.replace(/'/g, "\\'")}': '${en.replace(/'/g, "\\'")}'`).join(', '));

// ---------- numeros ----------
const rt = cajas.map((c) => c.rtp), imgsUnicas = new Set(items.map((x) => x.img));
console.log('cajas', cajas.length, 'objetos', items.length, 'imagenes de objeto', imgsUnicas.size, 'filas', filasCI.length);
console.log('devolucion app min/max', Math.min(...rt).toFixed(3), Math.max(...rt).toFixed(3), ' suma pct min/max', Math.min(...cajas.map((c) => c.sumaPct)), Math.max(...cajas.map((c) => c.sumaPct)));
console.log('cajas con precio distinto al de ED', cajas.filter((c) => Math.abs(c.precio - c.precioED) > 0.6).map((c) => `${c.slug}:${c.precioED}->${c.precio}`).join(' '));
console.log('sql', fs.statSync(WT + 'db/055_empiredrop.sql').size, fs.statSync(WT + 'db/055b_empiredrop_datos.sql').size);
