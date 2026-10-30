// Cajas de lujo (no son skins): que trae cada una, cuanto vale cada objeto y de donde sale su foto.
// Lo lee sync/cajas-datos.mjs (las mete en el SQL), sync/lujo-imagenes.mjs (baja y recorta las fotos de los objetos)
// y sync/lujo-cajas.py (dibuja la imagen de cada caja).
// Precio de cada objeto: su precio real aproximado en euros (usado o de reventa si ya no se vende nuevo, 2026); en lujo 1 euro = 1 V-Buck (FACTOR_LUJO en cajas-datos.mjs).
// Rareza dentro de cada caja: mil grado militar (lo barato, lo frecuente) ... esp especial (lo carisimo, rarisimo). Mismas probabilidades que las cajas de CS2.
// Un objeto puede estar en varias cajas con otra rareza en cada una. Cada caja tiene que llevar las cinco rarezas (la prueba lo da por hecho).
// foto: nombre del fichero en Wikimedia Commons (licencia libre); se baja una vez, se recorta (sin fondo) y se guarda en app/img/lujo/<id sin "lujo-">.webp.
export const BASE_IMG = 'https://pmbanks.github.io/apuestas/img/lujo/';

// id: [nombre, euros, fichero de Commons, opciones]
// opciones (opcional): espejo = voltear en horizontal (todo lo que se ve de lado mira a la derecha: coches, motos y zapatillas con la punta a la derecha);
//                      mitad = 'der' | 'izq': quedarse con esa mitad de la foto (cuando trae dos objetos)
export const OBJETOS = {
  // relojes
  'lujo-casio-f91w': ['Casio F-91W', 15, 'Casio F-91W watch (2023) (front closeup - time) (minor retouch).jpg'],
  'lujo-swatch': ['Swatch', 70, 'Swatch-1985 hg.jpg'],
  'lujo-casio-g-shock': ['Casio G-Shock', 110, 'Casio G-Shock DW-5600E wristwatch.jpg'],
  'lujo-citizen-eco-drive': ['Citizen Eco-Drive Diver', 200, "Citizen Eco-Drive Diver's 200m - Diving watch (cropped to watch casing).jpg"],
  'lujo-seiko-5': ['Seiko 5', 250, 'Seiko-5-blue-gold.jpg'],
  'lujo-tissot-prx': ['Tissot PRX', 400, 'Tissot PRX.jpg'],
  'lujo-tag-heuer-carrera': ['Tag Heuer Carrera', 3200, 'TAG Heuer Carrera blue.jpg'],
  'lujo-omega-speedmaster': ['Omega Speedmaster', 6500, 'Vintage Omega Speedmaster "Pre-moon".jpg'],
  'lujo-rolex-submariner': ['Rolex Submariner', 10500, 'Rolex-Submariner.jpg'],
  'lujo-rolex-daytona': ['Rolex Daytona', 32000, 'Rolex Daytona Cosmograph.jpg'],
  'lujo-ap-royal-oak': ['Audemars Piguet Royal Oak', 45000, 'Audemars 2385 Royal Oak resized.jpg'],
  'lujo-patek-nautilus': ['Patek Philippe Nautilus', 110000, 'Patek-Philippe-Nautilus-5711-1A-010-1.jpg'],
  'lujo-richard-mille': ['Richard Mille RM 030', 160000, 'RM 030 Automatic.jpg'],
  // zapatillas
  'lujo-converse-all-star': ['Converse Chuck Taylor All Star', 80, 'Converse side view.JPG'],
  'lujo-adidas-superstar': ['Adidas Superstar', 100, 'Adidas Superstar shoes pair.jpg'],
  'lujo-nike-air-force-1': ['Nike Air Force 1', 120, 'Nike air Force 1 white on white.jpg'],
  'lujo-nike-dunk-low': ['Nike Dunk Low', 150, 'Nike dunk low.jpg'],
  'lujo-yeezy-350': ['Adidas Yeezy Boost 350 V2', 300, '2023 Adidas Yeezy 350 V2 EF2905 (1).jpg', { espejo: true }],
  'lujo-air-jordan-4': ['Air Jordan 4', 400, 'Nike Air Jordan IV.jpg', { espejo: true }],
  'lujo-air-jordan-11': ['Air Jordan 11', 450, 'Air Jordan XI (cropped).jpg', { espejo: true }],
  'lujo-air-jordan-1': ['Air Jordan 1 High', 800, 'Nike Air Jordan.jpg'],
  'lujo-off-white-af1': ['Off-White x Nike Air Force 1', 1800, 'Off-White x Nike Air Force 1 "MCA".png'],
  'lujo-yeezy-red-october': ['Nike Air Yeezy 2 Red October', 8000, 'Yeezy Red Octobers.jpg', { espejo: true }],
  // tecnologia
  'lujo-dualsense': ['Mando DualSense', 65, 'DualSense Wireless Controller Cobalt Blue.jpg'],
  'lujo-raspberry-pi': ['Raspberry Pi 5', 85, 'Raspberry Pi 5.jpg'],
  'lujo-jbl-flip': ['Altavoz JBL Flip', 100, 'JBL Flip 4.jpg'],
  'lujo-kindle': ['Kindle Paperwhite', 150, '2023 Amazon Kindle Paperwhite (1).jpg'],
  'lujo-switch-lite': ['Nintendo Switch Lite', 200, 'Nintendo Switch Lite Grey - 01.jpg'],
  'lujo-airpods-pro': ['AirPods Pro', 250, 'AirPods Pro (2nd generation).jpg'],
  'lujo-nintendo-switch': ['Nintendo Switch', 300, 'Nintendo-Switch-Console-Docked-wJoyConRB.jpg'],
  'lujo-airpods-max': ['AirPods Max', 550, 'Apple AirPods Max 4.jpg'],
  'lujo-steam-deck': ['Steam Deck', 450, 'Steam Deck (front).png'],
  'lujo-ps5': ['PlayStation 5', 500, 'PlayStation 5 and DualSense with transparent background.png'],
  'lujo-xbox-series-x': ['Xbox Series X', 500, 'Xbox series X (50648118708).jpg'],
  'lujo-iphone-15-pro': ['iPhone 15 Pro Max', 900, 'IPhone 15 pro max.png', { mitad: 'der' }],
  'lujo-rtx-3090': ['Gráfica NVIDIA RTX 3090', 800, 'Gigabyte GeForce RTX 3090 Eagle OC 24G, 24576 MiB GDDR6X Front 20201114 DSC5880.jpg'],
  'lujo-macbook-pro': ['MacBook Pro 16', 3000, 'MacBook Pro 16 (M1 Pro, 2021) - Wikipedia.jpg'],
  'lujo-vision-pro': ['Apple Vision Pro', 3700, 'Apple Vision Pro on display.jpg'],
  'lujo-leica-m11': ['Cámara Leica M11', 8500, 'Leica M11 with Summicron-M 50mm F2 lens.jpg'],
  // moda y joyas
  'lujo-eastpak': ['Mochila Eastpak', 70, 'Eastpak Sugarbush backpack black.jpg'],
  'lujo-lacoste': ['Polo Lacoste', 100, "Vintage 90's Lacoste Polo Shirt.jpg"],
  'lujo-levis-501': ["Vaqueros Levi's 501", 110, "Levi's 501.jpg"],
  'lujo-rayban-wayfarer': ['Gafas Ray-Ban Wayfarer', 150, 'Ray-Ban, New Wayfarer - 4.jpg'],
  'lujo-cadena-oro': ['Cadena de oro', 600, 'Gold necklace MET sf2213965.jpg'],
  'lujo-bolso-gucci': ['Bolso Gucci Bamboo', 2500, 'Gucci, bamboo bag, 1960-65 ca. (firenze, archivio storico gucci).jpg'],
  'lujo-collar-diamantes': ['Collar de diamantes y amatista', 3000, 'Amethyst & Diamond Necklace.jpg'],
  'lujo-chanel-flap': ['Bolso Chanel Classic Flap', 9500, 'Chanel CLASSIC Double Flap 2.55 .jpg'],
  'lujo-lingote-100g': ['Lingote de oro de 100 g', 9500, 'Gold Ingot 100g Barren Österreich.jpg'],
  'lujo-birkin': ['Bolso Hermès Birkin', 14000, 'Hermes Birkin-4.JPG'],
  'lujo-lingote-1kg': ['Lingote de oro de 1 kg', 95000, 'Gold Ingots on white background.jpg'],
  // motos y scooters
  'lujo-xiaomi-m365': ['Patinete Xiaomi M365', 350, 'Xiaomi M365 Scooter.jpg', { espejo: true }],
  'lujo-vespa': ['Vespa Primavera 125', 4000, 'Vespa Primavera 125.jpg'],
  'lujo-honda-cb500': ['Honda CB500 Hornet', 7500, 'Honda CB500 Hornet 2026.jpg'],
  'lujo-yamaha-mt07': ['Yamaha MT-07', 8000, '2021 Black Yamaha MT-07.jpg', { espejo: true }],
  'lujo-harley-sportster': ['Harley-Davidson Sportster', 8500, 'Harley-Davidson Sportster XL883 2007.JPG', { espejo: true }],
  'lujo-ducati-v2': ['Ducati Panigale V2', 17000, 'Ducati 955 Panigale V2 (IMG 9851).jpg', { espejo: true }],
  'lujo-ducati-v4': ['Ducati Panigale V4', 30000, 'Ducati Panigale V4 - Tuning World Bodensee 2018, Friedrichshafen (OW1A0484).jpg'],
  // coches
  'lujo-fiat-panda': ['Fiat Panda', 8000, 'Fiat Panda Type 319 Minimal Grey (2).jpg', { espejo: true }],
  'lujo-seat-ibiza': ['SEAT Ibiza', 14000, 'SEAT Ibiza 021 facelift side (22313465765).jpg'],
  'lujo-mini-cooper': ['Mini Cooper', 24000, '2024 MINI Cooper Sport C - 1499cc 1.5 (156PS) Petrol - Nanuq White - 06-2024, Side.jpg'],
  'lujo-golf-gti': ['Volkswagen Golf GTI', 40000, 'VW Golf VII GTi CS Seite.JPG'],
  'lujo-mustang-gt': ['Ford Mustang GT', 60000, 'Kissingen Ford GT 5.0 Mustang 0417RM0283.jpg', { espejo: true }],
  'lujo-bmw-m3': ['BMW M3', 95000, '2024 BMW M3 Competition M XDrive grey side.jpg'],
  'lujo-porsche-911': ['Porsche 911', 130000, 'Porsche 911 Targa pink dllu.jpg', { espejo: true }],
  'lujo-mercedes-g63': ['Mercedes-AMG G 63', 190000, 'Mercedes-AMG G 63 (2018) IMG 4370.jpg'],
  'lujo-lamborghini-huracan': ['Lamborghini Huracán', 250000, 'Lamborghini Huracán Tecnica 1X7A7430.jpg', { espejo: true }],
};

// color: el de la caja (oro relojes, verde zapatillas, azul tecnologia, morado moda, rojo motos y coches); centro y lados: los objetos que se ven en la cara de delante de la caja (el mas raro, grande, en medio)
// items: [id, rareza]
export const LUJO = [
  { id: 'lujo-relojes-calle', nombre: 'Relojes de calle', color: 'oro', centro: 'lujo-tissot-prx', lados: ['lujo-casio-f91w', 'lujo-seiko-5'], items: [
    ['lujo-casio-f91w', 'mil'], ['lujo-swatch', 'mil'], ['lujo-casio-g-shock', 'res'], ['lujo-citizen-eco-drive', 'cla'], ['lujo-seiko-5', 'cov'], ['lujo-tissot-prx', 'esp'] ] },
  { id: 'lujo-zapatillas-basicas', nombre: 'Zapatillas básicas', color: 'verde', centro: 'lujo-air-jordan-11', lados: ['lujo-converse-all-star', 'lujo-adidas-superstar'], items: [
    ['lujo-converse-all-star', 'mil'], ['lujo-adidas-superstar', 'mil'], ['lujo-nike-air-force-1', 'res'], ['lujo-nike-dunk-low', 'res'], ['lujo-yeezy-350', 'cla'],
    ['lujo-air-jordan-4', 'cov'], ['lujo-air-jordan-11', 'esp'] ] },
  { id: 'lujo-tecnologia-basica', nombre: 'Tech básica', color: 'azul', centro: 'lujo-steam-deck', lados: ['lujo-dualsense', 'lujo-kindle'], items: [
    ['lujo-dualsense', 'mil'], ['lujo-raspberry-pi', 'mil'], ['lujo-jbl-flip', 'mil'], ['lujo-kindle', 'res'], ['lujo-switch-lite', 'cla'], ['lujo-airpods-max', 'cov'], ['lujo-steam-deck', 'esp'] ] },
  { id: 'lujo-moda-calle', nombre: 'Moda de calle', color: 'morado', centro: 'lujo-chanel-flap', lados: ['lujo-levis-501', 'lujo-lacoste'], items: [
    ['lujo-eastpak', 'mil'], ['lujo-lacoste', 'mil'], ['lujo-levis-501', 'res'], ['lujo-rayban-wayfarer', 'res'], ['lujo-cadena-oro', 'cla'], ['lujo-bolso-gucci', 'cov'], ['lujo-chanel-flap', 'esp'] ] },
  { id: 'lujo-zapatillas', nombre: 'Zapatillas hype', color: 'verde', centro: 'lujo-yeezy-red-october', lados: ['lujo-air-jordan-1', 'lujo-off-white-af1'], items: [
    ['lujo-converse-all-star', 'mil'], ['lujo-adidas-superstar', 'mil'], ['lujo-nike-air-force-1', 'mil'], ['lujo-nike-dunk-low', 'res'], ['lujo-yeezy-350', 'res'], ['lujo-air-jordan-4', 'res'],
    ['lujo-air-jordan-11', 'cla'], ['lujo-air-jordan-1', 'cla'], ['lujo-off-white-af1', 'cov'], ['lujo-yeezy-red-october', 'esp'] ] },
  { id: 'lujo-tecnologia', nombre: 'Tecnología', color: 'azul', centro: 'lujo-leica-m11', lados: ['lujo-ps5', 'lujo-iphone-15-pro'], items: [
    ['lujo-airpods-pro', 'mil'], ['lujo-nintendo-switch', 'mil'], ['lujo-steam-deck', 'res'], ['lujo-ps5', 'res'], ['lujo-xbox-series-x', 'res'], ['lujo-iphone-15-pro', 'res'],
    ['lujo-rtx-3090', 'cla'], ['lujo-macbook-pro', 'cla'], ['lujo-vision-pro', 'cov'], ['lujo-leica-m11', 'esp'] ] },
  { id: 'lujo-motos', nombre: 'Motos y scooters', color: 'rojo', centro: 'lujo-ducati-v4', lados: ['lujo-vespa', 'lujo-yamaha-mt07'], items: [
    ['lujo-xiaomi-m365', 'mil'], ['lujo-vespa', 'res'], ['lujo-honda-cb500', 'cla'], ['lujo-yamaha-mt07', 'cla'], ['lujo-harley-sportster', 'cla'], ['lujo-ducati-v2', 'cov'], ['lujo-ducati-v4', 'esp'] ] },
  { id: 'lujo-moda-joyas', nombre: 'Moda y joyas', color: 'morado', centro: 'lujo-lingote-1kg', lados: ['lujo-birkin', 'lujo-bolso-gucci'], items: [
    ['lujo-rayban-wayfarer', 'mil'], ['lujo-cadena-oro', 'mil'], ['lujo-bolso-gucci', 'res'], ['lujo-collar-diamantes', 'res'], ['lujo-chanel-flap', 'cla'], ['lujo-lingote-100g', 'cla'],
    ['lujo-birkin', 'cov'], ['lujo-lingote-1kg', 'esp'] ] },
  { id: 'lujo-relojes', nombre: 'Relojes de lujo', color: 'oro', centro: 'lujo-patek-nautilus', lados: ['lujo-rolex-submariner', 'lujo-richard-mille'], items: [
    ['lujo-casio-f91w', 'mil'], ['lujo-casio-g-shock', 'mil'], ['lujo-seiko-5', 'mil'], ['lujo-tag-heuer-carrera', 'res'], ['lujo-omega-speedmaster', 'res'], ['lujo-rolex-submariner', 'cla'],
    ['lujo-rolex-daytona', 'cov'], ['lujo-ap-royal-oak', 'cov'], ['lujo-patek-nautilus', 'esp'], ['lujo-richard-mille', 'esp'] ] },
  { id: 'lujo-coches', nombre: 'Coches', color: 'rojo', centro: 'lujo-lamborghini-huracan', lados: ['lujo-porsche-911', 'lujo-mercedes-g63'], items: [
    ['lujo-fiat-panda', 'mil'], ['lujo-seat-ibiza', 'mil'], ['lujo-mini-cooper', 'res'], ['lujo-golf-gti', 'res'], ['lujo-mustang-gt', 'cla'], ['lujo-bmw-m3', 'cla'],
    ['lujo-porsche-911', 'cov'], ['lujo-mercedes-g63', 'cov'], ['lujo-lamborghini-huracan', 'esp'] ] },
];
