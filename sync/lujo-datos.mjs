// Cajas de lujo (no son skins): que trae cada una, cuanto vale cada objeto y de donde sale su foto.
// Lo lee sync/cajas-datos.mjs (las mete en el SQL) y sync/lujo-imagenes.mjs (baja y guarda las fotos).
// Precio de cada objeto: su precio real aproximado en euros (usado o de reventa si ya no se vende nuevo, 2026); en lujo 1 euro = 1 V-Buck (FACTOR_LUJO en cajas-datos.mjs).
// Rareza: mil grado militar (lo barato, lo frecuente) ... esp especial (lo carisimo, rarisimo). Mismas probabilidades que las cajas de CS2.
// foto: nombre del fichero en Wikimedia Commons (licencia libre); se baja una vez a app/img/lujo/<id sin "lujo-">.webp y se apunta en FUENTES.md.
export const BASE_IMG = 'https://pmbanks.github.io/apuestas/img/lujo/';

// [id, nombre, euros, rareza, fichero de Commons]
export const LUJO = [
  { id: 'lujo-zapatillas', nombre: 'Zapatillas', portada: 'lujo-yeezy-red-october', items: [
    ['lujo-converse-all-star', 'Converse Chuck Taylor All Star', 80, 'mil', 'Converse All Star High White (4649858686).jpg'],
    ['lujo-adidas-superstar', 'Adidas Superstar', 100, 'mil', 'Adidas Superstar shoes pair.jpg'],
    ['lujo-nike-air-force-1', 'Nike Air Force 1', 120, 'mil', 'Air Force 1.JPG'],
    ['lujo-nike-dunk-low', 'Nike Dunk Low', 150, 'res', 'Nike dunk low.jpg'],
    ['lujo-yeezy-350', 'Adidas Yeezy Boost 350 V2', 300, 'res', '2023 Adidas Yeezy Boost 350 V2 Sesame.jpg'],
    ['lujo-air-jordan-4', 'Air Jordan 4', 400, 'res', 'Nike Air Jordan IV.jpg'],
    ['lujo-air-jordan-11', 'Air Jordan 11', 450, 'cla', 'Air Jordan XI.jpg'],
    ['lujo-air-jordan-1', 'Air Jordan 1 Banned', 800, 'cla', 'Air Jordan 1 Banned.jpg'],
    ['lujo-off-white-af1', 'Off-White x Nike Air Force 1', 1800, 'cov', 'Off-White x Nike Air Force 1 "MCA".png'],
    ['lujo-yeezy-red-october', 'Nike Air Yeezy 2 Red October', 8000, 'esp', 'Yeezy Red Octobers.jpg'],
  ] },
  { id: 'lujo-tecnologia', nombre: 'Tecnología', portada: 'lujo-leica-m11', items: [
    ['lujo-airpods-pro', 'AirPods Pro', 250, 'mil', 'AirPods Pro (2nd generation).jpg'],
    ['lujo-nintendo-switch', 'Nintendo Switch', 300, 'mil', 'Nintendo-Switch-Console-Docked-wJoyConRB.jpg'],
    ['lujo-steam-deck', 'Steam Deck', 450, 'res', 'Steam Deck (front).jpg'],
    ['lujo-ps5', 'PlayStation 5', 500, 'res', 'PlayStation 5 and DualSense.jpg'],
    ['lujo-xbox-series-x', 'Xbox Series X', 500, 'res', 'Xbox series X (50648118708).jpg'],
    ['lujo-iphone-15-pro', 'iPhone 15 Pro', 800, 'res', 'Apple iPhone 15 Pro.jpg'],
    ['lujo-rtx-4090', 'Gráfica NVIDIA RTX 4090', 2000, 'cla', 'NVIDIA RTX 4090 Founders Edition - Nahaufnahme (ZMASLO).png'],
    ['lujo-macbook-pro', 'MacBook Pro 16', 3000, 'cla', 'MacBook Pro 16 (M1 Pro, 2021) - Wikipedia.jpg'],
    ['lujo-vision-pro', 'Apple Vision Pro', 3700, 'cov', 'Apple Vision Pro on display.jpg'],
    ['lujo-leica-m11', 'Cámara Leica M11', 8500, 'esp', 'Leica M11 with Summicron-M 50mm F2 lens.jpg'],
  ] },
  { id: 'lujo-moda-joyas', nombre: 'Moda y joyas', portada: 'lujo-lingote-1kg', items: [
    ['lujo-rayban-wayfarer', 'Gafas Ray-Ban Wayfarer', 150, 'mil', 'Ray-Ban, New Wayfarer - 4.jpg'],
    ['lujo-cadena-oro', 'Cadena de oro', 600, 'mil', 'Gold necklace MET sf2213965.jpg'],
    ['lujo-bolso-gucci', 'Bolso Gucci Bamboo', 2500, 'res', 'Gucci, bamboo bag, 1960-65 ca. (firenze, archivio storico gucci).jpg'],
    ['lujo-collar-diamantes', 'Collar de diamantes y amatista', 3000, 'res', 'Amethyst & Diamond Necklace.jpg'],
    ['lujo-chanel-flap', 'Bolso Chanel Classic Flap', 9500, 'cla', 'Chanel CLASSIC Double Flap 2.55 .jpg'],
    ['lujo-lingote-100g', 'Lingote de oro de 100 g', 9500, 'cla', 'Gold Ingot 100g Barren Österreich.jpg'],
    ['lujo-birkin', 'Bolso Hermès Birkin', 14000, 'cov', 'Hermes Birkin-4.JPG'],
    ['lujo-lingote-1kg', 'Lingote de oro de 1 kg', 95000, 'esp', 'Gold Ingots on white background.jpg'],
  ] },
  { id: 'lujo-relojes', nombre: 'Relojes', portada: 'lujo-patek-nautilus', items: [
    ['lujo-casio-f91w', 'Casio F-91W', 15, 'mil', 'Casio F-91W watch (2023) (front closeup - time) (minor retouch).jpg'],
    ['lujo-casio-g-shock', 'Casio G-Shock', 110, 'mil', 'Casio G-Shock DW-5600E wristwatch.jpg'],
    ['lujo-seiko-5', 'Seiko 5 Sports', 250, 'mil', 'Seiko 5 Sports SNZH53K1.jpg'],
    ['lujo-tag-heuer-carrera', 'Tag Heuer Carrera', 3200, 'res', 'TAG Heuer Carrera blue.jpg'],
    ['lujo-omega-speedmaster', 'Omega Speedmaster', 6500, 'res', 'Vintage Omega Speedmaster "Pre-moon".jpg'],
    ['lujo-rolex-submariner', 'Rolex Submariner', 10500, 'cla', 'Rolex-Submariner.jpg'],
    ['lujo-rolex-daytona', 'Rolex Daytona', 32000, 'cov', 'Rolex Daytona Cosmograph.jpg'],
    ['lujo-ap-royal-oak', 'Audemars Piguet Royal Oak', 45000, 'cov', 'Audemars 2385 Royal Oak resized.jpg'],
    ['lujo-patek-nautilus', 'Patek Philippe Nautilus', 110000, 'esp', 'Patek-Philippe-Nautilus-5711-1A-010-1.jpg'],
    ['lujo-richard-mille', 'Richard Mille RM 030', 160000, 'esp', 'RM 030 Automatic.jpg'],
  ] },
  { id: 'lujo-coches', nombre: 'Coches', portada: 'lujo-lamborghini-huracan', items: [
    ['lujo-fiat-panda', 'Fiat Panda', 8000, 'mil', 'Fiat Panda 1.jpg'],
    ['lujo-seat-ibiza', 'SEAT Ibiza', 14000, 'mil', 'Seat Ibiza FR.jpg'],
    ['lujo-mini-cooper', 'Mini Cooper', 24000, 'res', 'Dülmen, Dernekamp, Mini Hatch Cooper -- 2018 -- 1545-51.jpg'],
    ['lujo-golf-gti', 'Volkswagen Golf GTI', 40000, 'res', 'Volkswagen Golf VIII GTI Clubsport 45 IMG 4884.jpg'],
    ['lujo-mustang-gt', 'Ford Mustang GT', 60000, 'cla', '2018 Ford Mustang GT 5.0 Front.jpg'],
    ['lujo-bmw-m3', 'BMW M3', 95000, 'cla', 'BMW M3 CS 1X7A6394.jpg'],
    ['lujo-porsche-911', 'Porsche 911 Carrera', 130000, 'cov', '2013 Porsche 911 Carrera 4S (991) (9626546987).jpg'],
    ['lujo-mercedes-g63', 'Mercedes-AMG G 63', 190000, 'cov', 'Mercedes-AMG G 63 (2018) IMG 4370.jpg'],
    ['lujo-lamborghini-huracan', 'Lamborghini Huracán', 250000, 'esp', 'Lamborghini Huracan Performante, IAA 2017, Frankfurt (1Y7A2827).jpg'],
  ] },
];
