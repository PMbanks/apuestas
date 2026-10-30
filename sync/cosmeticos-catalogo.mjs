// El catalogo de cosmeticos (marcos, fondos y objetos de coleccion) y sus cajas. Solo datos: lo leen
//   sync/cosmeticos-imagenes.mjs  (baja y recorta las fotos de los objetos reales)
//   sync/cosmeticos-datos.mjs     (escribe db/020b_cosmeticos_datos.sql y dibuja los SVG de marcos, fondos y cajas)
// El aspecto de cada marco y de cada fondo (ESTILOS) vive en app/nueva/mercado.js: aqui solo va quien es, de que rareza y cuanto vale.
// Rarezas como en las demas cajas: mil, res, cla, cov, esp. Valor en V-Bucks (un solo precio: no llevan desgaste ni StatTrak).

// [clave, nombre, rareza, valor]
export const MARCOS = [
  ['aro-blanco', 'Aro blanco', 'mil', 8], ['aro-cian', 'Aro cian', 'mil', 9], ['aro-rosa', 'Aro rosa', 'mil', 9], ['aro-lima', 'Aro lima', 'mil', 10],
  ['doble-aro', 'Doble aro', 'res', 30], ['neon-azul', 'Neón azul', 'res', 38], ['neon-rosa', 'Neón rosa', 'res', 38],
  ['oro', 'Oro macizo', 'cla', 105], ['plata', 'Plata líquida', 'cla', 90], ['arcoiris', 'Arcoíris', 'cla', 125],
  ['fuego', 'Fuego', 'cov', 330], ['hielo', 'Hielo', 'cov', 300],
  ['diamante', 'Diamante', 'esp', 1100], ['corona', 'Corona real', 'esp', 1500],
];
export const FONDOS = [
  ['medianoche', 'Medianoche', 'mil', 8], ['ceniza', 'Ceniza', 'mil', 8], ['oceano', 'Océano', 'mil', 10],
  ['atardecer', 'Atardecer', 'res', 32], ['aurora', 'Aurora', 'res', 36], ['miami', 'Miami', 'res', 40],
  ['galaxia', 'Galaxia', 'cla', 110], ['ciber', 'Ciberpunk', 'cla', 120],
  ['lava', 'Lava', 'cov', 340], ['boreal', 'Aurora boreal', 'cov', 310],
  ['oro-liquido', 'Oro líquido', 'esp', 1300],
];
// objetos reales: [clave, nombre, rareza, valor, archivo de Wikimedia Commons (sin "File:")]
export const OBJETOS = [
  ['gorra-beisbol', 'Gorra de béisbol', 'mil', 10, 'Baseball-Cap-c.jpg'],
  ['red-bull', 'Red Bull', 'mil', 12, 'Lattina di Red Bull.jpg'],
  ['dados-casino', 'Dados de casino', 'mil', 9, 'Casino Dice (11275288753).jpg'],
  ['cubo-rubik', 'Cubo de Rubik', 'mil', 14, 'Speedcube GAN.jpg'],
  ['monster-violeta', 'Monster Violeta', 'mil', 11, 'Monster Energy Ultra Violet (China Version) 330ml 20260628130033.jpg'],
  ['fichas-poker', 'Fichas de póker', 'res', 32, 'Poker Chips (3047161739).jpg'],
  ['gafas-aviador', 'Gafas de aviador', 'res', 40, 'RayBanAviator.jpg'],
  ['gorro-pescador', 'Gorro de pescador', 'res', 36, 'Black Barbour bucket hat.jpg'],
  ['monopatin', 'Monopatín', 'res', 44, 'Skateboard upside.jpg'],
  ['monster-white', 'Monster White', 'cla', 120, 'Monster Energy Zero Ultra (China Version) 330ml 20260628130320.jpg'],
  ['game-boy', 'Game Boy', 'cla', 105, 'Game-Boy-Original.jpg'],
  ['cadena-oro', 'Cadena de oro', 'cla', 140, 'Necklace, chain MET SF2213969.jpg'],
  ['boombox', 'Boombox', 'cov', 320, 'JBL Boombox 2 1v2.jpg'],
  ['auriculares-beats', 'Auriculares Beats', 'cov', 380, 'BEATS BY DR.DRE SOLO HD MONSTER HEADPHONE.jpg'],
  ['lingotes-oro', 'Lingotes de oro', 'esp', 1400, 'Gold bullion bars.jpg'],
  ['copa-oro', 'Copa de oro', 'esp', 1100, 'Hong Kong Gold Cup (trophy) 20260301.jpg'],
];

// las cajas: [id, nombre, color, lista de claves (marco:x, fondo:x, obj:x)]
// El precio de cada una sale solo: su valor medio (devolucion del 100 %, como las demas). Tiene que quedar entre 20 y 150.
export const CAJAS = [
  ['cos-aros', 'Caja Aros', '#4d88e6', MARCOS.map((m) => 'marco:' + m[0])],
  ['cos-fondos', 'Caja Fondos', '#cc6496', FONDOS.map((m) => 'fondo:' + m[0])],
  ['cos-calle', 'Caja Calle', '#a3c93a', OBJETOS.map((m) => 'obj:' + m[0])],
  ['cos-neon', 'Caja Neón', '#8847ff', ['marco:doble-aro', 'marco:neon-azul', 'marco:neon-rosa', 'fondo:miami', 'fondo:aurora', 'obj:fichas-poker',
    'marco:arcoiris', 'fondo:ciber', 'marco:fuego', 'fondo:boreal', 'obj:boombox', 'marco:diamante']],
  ['cos-oro', 'Caja Oro', '#e4ae39', ['marco:plata', 'marco:oro', 'obj:game-boy', 'fondo:galaxia', 'obj:monster-white', 'marco:hielo']],
];
