// Seleccion de cajas de EmpireDrop para la app (PM 01-11). MAP: id de caja de la app -> caja de EmpireDrop que la sustituye (mismo id, mismo sitio en el inventario).
export const MAP = {
 'lujo-gaming':'gaming-empire','lujo-tecnologia-basica':'black-deals','lujo-tecnologia':'exclusive-5-tech','lujo-tecnologia-2026':'apple-degens','lujo-camaras':'shutter-sanctuary',
 'lujo-relojes-calle':'affordable-watch','lujo-relojes-2026':'5-watches','lujo-relojes':'10-rolex','lujo-joyas':'gems-addict','lujo-moda-joyas':'luxury-jewelry',
 'lujo-zapatillas-basicas':'nike-vs-adidas','lujo-zapatillas':'grail-kicks','lujo-zapatillas-2026':'sneakers-drip','lujo-moda-calle':'stone-island','lujo-streetwear':'palm-angels',
 'lujo-bolsos':'bag-enthusiast','lujo-perfumes':'private-perfume','lujo-motos':'bikers-bounty','lujo-coches':'10-cars','lujo-motor':'autobahn','lujo-viajes':'10-travel',
 'lujo-oro':'precious-duo','lujo-cripto':'blockchain-bundle','lujo-cartas':'pokemon-stash' };
// sin equivalente en EmpireDrop (no tiene cajas de patinetes ni de gafas): se quedan como estan
export const SIN_EQUIVALENTE = ['lujo-patinetes', 'lujo-gafas'];
// cajas nuevas: grupo de la app -> cajas de EmpireDrop
export const NUEVAS = {
 tec:['xbox-vs-playstation','5-console-legends','10-gaming','full-send-gaming','pro-setup','streamer-setup','only-mac','cinematic-view'],
 relojes:['1-patek','master-of-time','rado-vs-tudor','cartier-treasure','pandora'],
 moda:['1-versace','1-louis-vuitton','chanel-prestige','birkin-addict','100-bags','nike','jordan','street-soles'],
 motor:['1-cars','1-mercedes','german-engine','heritage-motors','tesla','american-driver','yacht-club','luxury-garage'],
 inv:['gold-digger','fortune-box','poke-starter','5-pokemon','legendary-pulls','panini'],
};
export const TODAS = [...Object.values(MAP), ...Object.values(NUEVAS).flat()];
