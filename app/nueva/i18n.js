// Gambling Master en español o en inglés. La app escribe en español; con el inglés elegido se traduce lo pintado
// con este diccionario (frases exactas) y estas reglas (frases con números o nombres). Lo que escriben los jugadores no se toca.
'use strict';
// Animaciones (PM, 30-10: quiere animaciones aunque el sistema diga "reducir movimiento"): las manda el interruptor
// Animaciones del perfil (localStorage gm-anim, encendido por defecto), no prefers-reduced-motion. Va aqui porque este
// fichero se carga antes que cajas.js, juegos.js, app.js y el resto: todos los matchMedia de movimiento le preguntan a esto.
(function () {
  const off = () => { try { return localStorage.getItem('gm-anim') === '0'; } catch (e) { return false; } };
  document.documentElement.classList.toggle('sin-anim', off());
  const mm = window.matchMedia ? window.matchMedia.bind(window) : null;
  if (mm) window.matchMedia = function (q) {
    if (/prefers-reduced-motion/.test(String(q))) { const red = off(), m = /no-preference/.test(String(q)) ? !red : red;
      return { matches: m, media: String(q), onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } }; }
    return mm(q);
  };
  window.GM_ANIM = { on: () => !off(), set(on) { try { localStorage.setItem('gm-anim', on ? '1' : '0'); } catch (e) {} document.documentElement.classList.toggle('sin-anim', !on); } };
})();
(function () {
  const D = {
    // Equipos (01-11, equipos.js): plantilla, palmares de siempre y cambios
    'Titulares': 'Starters', 'Suplentes y banquillo': 'Substitutes and bench', 'Organización': 'Organisation', 'Capitán': 'Captain', 'Cedido': 'On loan', 'Suplente': 'Substitute',
    'Suplente temporal': 'Stand in', 'Inactivo': 'Inactive', 'Desde': 'Since', 'Cambios': 'Changes', 'Entra': 'Joins', 'Sale': 'Leaves', 'Pasa a inactivo': 'Goes inactive', 'Jugador': 'Player',
    'Torneos ganados': 'Tournaments won', 'Segundo puesto': 'Runner up', 'Tercer puesto': 'Third place', 'Torneos jugados': 'Tournaments played', 'Nivel del torneo': 'Tournament tier',
    'Sin clasificatorias ni partidos de exhibición.': 'Qualifiers and showmatches are not counted.', 'veces': 'times', 'Títulos': 'Titles', 'Subcampeonatos': 'Runner up finishes',
    'Estadio': 'Stadium', 'Fundado': 'Founded', 'Analista': 'Analyst', 'Manager': 'Manager', 'Ojeador': 'Scout', 'Líder del equipo': 'Team leader', 'Entrenador principal': 'Head coach',
    'Entrenador asistente': 'Assistant coach', 'Entrenador asistente y analista': 'Assistant coach and analyst', 'Preparador de rendimiento': 'Performance coach',
    'Entrenador estratégico': 'Strategic coach', 'Entrenador interino': 'Interim coach', 'Analista de datos': 'Data analyst', 'Psicólogo deportivo': 'Sports psychologist',
    'Sin titulares a la vista.': 'No starters to show.', 'a': 'to', 'Datos de Liquipedia': 'Data from Liquipedia', 'Datos de vlr.gg': 'Data from vlr.gg', 'Datos de Wikipedia': 'Data from Wikipedia',
    'Datos de Wikidata (CC0)': 'Data from Wikidata (CC0)', 'Datos de ESPN': 'Data from ESPN', 'Fotos y datos de jugadores: PandaScore': 'Player photos and data: PandaScore',
    'Iconos de agentes: Riot Games': 'Agent icons: Riot Games', 'Aproximado. Incluye lo que ganaron los jugadores mientras representaban al equipo.': 'Approximate. Includes what the players won while representing the team.',
    // Chat rapido (mensajes.js) y Cara o cruz rehecha (juegos.js), 01-11
    'Enviando': 'Sending', 'No se ha enviado': 'Not sent', 'Reintentar': 'Try again', 'Descartar': 'Discard', 'Mensaje nuevo': 'New message',
    'No se ha enviado un mensaje del chat': 'A chat message was not sent', 'Está tardando demasiado': 'It is taking too long',
    'Pones una cantidad y eliges cara o cruz. Quien acepte pone lo mismo, se lanza la moneda y el que acierte se lleva todo.': 'You put in an amount and pick heads or tails. Whoever accepts puts in the same, the coin is tossed and whoever calls it right takes it all.',
    'Salió': 'It came up', 'Te llevas': 'You take', 'Pierdes': 'You lose', 'Aceptó': 'Accepted by', 'te reta': 'challenges you', 'reta a cualquiera': 'challenges anyone',
    'Va a': 'Goes for', 'tú vas a': 'you go for', 'Tú vas a': 'You go for', 'No te llega': 'Not enough', 'Pones': 'You put in', 'ganas': 'you win', 'Esperando a': 'Waiting for',
    'has puesto': 'you put in', 'Quitar reto': 'Remove challenge', 'Te devuelvo': 'You get back', 'Retos abiertos': 'Open challenges', 'Tus retos esperando': 'Your waiting challenges',
    'Ahora no hay ningún reto abierto. Crea uno y espera a que alguien lo acepte.': 'No open challenges right now. Create one and wait for someone to accept.',
    'Si nadie acepta en 24 horas, te devuelvo lo que pusiste.': 'If nobody accepts within 24 hours, you get your stake back.',
    'le gana a': 'beats', 'le ganas a': 'beat', 'Crear un reto': 'Create a challenge', 'Cuánto pones': 'How much you put in', 'Tienes': 'You have', 'Contra quién': 'Against whom',
    'si sale cara te llevas': 'if it lands heads you take', 'si sale cruz te llevas': 'if it lands tails you take',
    // Ventana del partido (01-11, ventana.js)
    'Ver en Partidos': 'View in Matches', 'Apuesta de': 'Bet by', 'Tus apuestas': 'Your bets', 'Perdido': 'Lost', 'Anulado': 'Cancelled', 'Partido': 'Match', 'Descanso': 'Half time',
    'Oculta hasta que empiece': 'Hidden until kickoff', 'Estadísticas del partido': 'Match stats', 'Todavía no hay estadísticas de este partido.': 'There are no stats for this match yet.',
    // Abrir una caja con tira ancha (01-11, cajas.js)
    'Atrás': 'Back', 'Prueba gratis': 'Free trial', 'Normal': 'Normal', 'Ultra': 'Ultra', 'Giro automático': 'Auto spin', 'Parar': 'Stop', 'Parando…': 'Stopping…', 'Abriendo…': 'Opening…', 'Contenido de la caja': 'Box contents',
    'No se ha cobrado ni ganado nada. Es solo para ver cómo gira.': 'Nothing was charged or won. It is only to see how it spins.', 'Sin saldo: el giro automático se ha parado': 'No balance: auto spin stopped',
    // Mis apuestas (01-11, misapuestas.js)
    'Empieza en': 'Starts in', 'Tienes en juego': 'You have in play', 'Lo próximo': 'Up next', 'Tus números': 'Your numbers', 'Total': 'Total',
    'sin aciertos aún': 'no wins yet', 'sin resultados aún': 'no results yet', 'la última, ganada': 'last one won', 'la última, perdida': 'last one lost',
    'ganadas seguidas': 'wins in a row', 'perdidas seguidas': 'losses in a row', 'Retos acabados': 'Finished challenges',
    // menu A (01-11): Más en la barra de abajo de movil, burbuja del chat y Monedero arriba
    'Más': 'More', 'Más secciones': 'More sections', 'mantenimiento': 'maintenance', 'Abrir el chat': 'Open chat', 'Foto': 'Photo', 'Nuevos': 'New',
    // Ya jugados B (01-11): el menu del titulo de Partidos
    'Lo que se juega a partir de ahora': 'What is coming up next', 'Partidos que se están jugando': 'Matches being played right now',
    'Resultados de los últimos dos días': 'Results from the last two days', 'No hay partidos jugados con este filtro.': 'No finished matches with this filter.',
    // Inicio (01-11) y "amigos" en vez de "colegas" (PM: "no pongas colegas, pon amigos")
    'Inicio': 'Home', 'Amigos': 'Friends', 'Amigo': 'Friend', 'lo último de cada uno': 'the latest from each one', 'esta semana': 'this week', 'últimos 30 días': 'last 30 days', 'de siempre': 'all time', 'Nada en este periodo': 'Nothing in this period',
    'desde ayer': 'since yesterday', 'desde el lunes': 'since Monday', 'desde el martes': 'since Tuesday', 'desde el miércoles': 'since Wednesday',
    'desde el jueves': 'since Thursday', 'desde el viernes': 'since Friday', 'desde el sábado': 'since Saturday', 'desde el domingo': 'since Sunday',
    'Acaba de pasar': 'Just happened', 'Tus últimos resultados': 'Your latest results', 'nada nuevo desde tu última visita': 'nothing new since your last visit',
    // Directo (vivo.js) y lo que quedaba suelto en inglés (01-11, Detalles)
    'Esta fuente aún no da las rondas de este mapa. Se pone aquí en cuanto las tenga.': 'This source does not give the rounds of this map yet. They show up here as soon as it does.',
    'No hay marcador de rondas de este mapa.': 'There is no round score for this map.',
    'Cuando ruede el balón, aquí irá todo lo que pase.': 'Once the ball rolls, everything that happens shows up here.',
    'bomba desactivada': 'bomb defused', 'bomba explotada': 'bomb exploded', 'eliminación': 'elimination', 'se acabó el tiempo': 'time ran out',
    'primera mitad': 'first half', 'segunda mitad': 'second half', 'prórroga': 'overtime', 'Todavía no ha empezado': 'Not started yet',
    'penalti fallado': 'penalty missed', 'Acabado': 'Finished', 'Empezando': 'Starting', 'Últimas 3': 'Last 3',
    'Combinada': 'Parlay', 'Ganaste': 'You won', 'Retiraste': 'Cashed out', 'Devuelta': 'Refunded', 'te pagan': 'paid', 'te devuelven': 'refunded',
    'si aciertas todo': 'if everything wins', 'Vas ganando': 'Winning', 'Vas perdiendo': 'Losing', 'Vas empatando': 'Level', 'cobrarías': 'payout',
    'Por orden de movimiento': 'By latest move', 'sin resultados nuevos': 'no new results', 'Sin movimiento': 'No moves lately',
    'Ganó con': 'Won with', 'Perdió con': 'Lost with', 'Retiró con': 'Cashed out with', 'Ganó con el': 'Won with the', 'Perdió con el': 'Lost with the', 'Retiró con el': 'Cashed out with the',
    'Ganó una': 'Won a', 'Perdió una': 'Lost a', 'Retiró una': 'Cashed out a', 'Ganó en': 'Won at', 'Ganó a': 'Won at', 'Perdió a': 'Lost at',
    'cara o cruz': 'coin flip', 'la ruleta': 'roulette', 'va ganando': 'winning', 'va perdiendo': 'losing', 'va empatando': 'level',
    '· contra ti': '· against you', 'Tú también': 'You too', 'ahora': 'now',
    'Ver todas en Mis apuestas': 'See them all in My bets', 'Todavía no has apostado': 'You have not placed a bet yet', 'Nada en juego': 'Nothing in play',
    'Se apuesta en Partidos: toca una cuota y dale a Apostar.': 'You bet in Matches: tap any odds and hit Bet.',
    'Tus amigos aún no se han movido': 'Your friends have not moved yet', 'Cuando apuesten, sale aquí. Se apuesta en Partidos: toca una cuota y dale a Apostar.': 'When they bet, it shows up here. You bet in Matches: tap any odds and hit Bet.',
    'Aún no hay amigos en la app': 'No friends in the app yet', 'Cuando entren, verás aquí lo que apuestan.': 'When they join, you will see their bets here.',
    'Amigos en este partido': 'Friends in this match', 'Retar a un amigo en este partido': 'Challenge a friend on this match', 'Elige amigo y resultado.': 'Pick a friend and a result.',
    'Escribe a tus amigos': 'Message your friends', 'Pides a tu amigo': 'You ask your friend for', 'Elige a un amigo': 'Pick a friend', 'Los amigos': 'The friends',
    'Aún no hay tratos. Elige a un amigo y propón el primero.': 'No trades yet. Pick a friend and make the first offer.', 'Trato entre amigos': 'Trade between friends',
    // ganada o perdida en las tarjetas (01-11, resultado.js e Inicio)
    'Retirada': 'Cashed out', 'Cobraría': 'Payout', 'Devuelto': 'Refunded', '★ Empate': '★ Draw', '★ Empate ·': '★ Draw ·',
    'Combinada cobrada': 'Parlay won', 'Combinada perdida': 'Parlay lost', 'Combinada devuelta': 'Parlay refunded', 'Combinada cancelada': 'Parlay cashed out',
    'Ninguna en juego. En Partidos, mete 2 o más cuotas en el boleto y elige Combinada.': 'None in play. In Matches, put 2 or more odds in the slip and pick Parlay.',
    // Apuestas de todos, una fila por amigo (01-11, todos.js)
    'Quién lleva qué': 'Who has what', 'Con algo en juego': 'With bets in play', 'Lo que tiene en juego': 'What they have in play', 'Último resultado': 'Last result',
    'Ya ha apostado': 'Already bet', ': se ve al empezar': ': shown at kick-off', 'apostado': 'staked', 'cobraría': 'payout', 'Tu apuesta': 'Your bet',
    'Te reta con': 'Challenges you with', 'Retas a': 'You challenge', 'Reta a': 'Challenges', 'Reto contra': 'Challenge vs', 'Acepto': 'I take', 'esperando': 'waiting',
    'bote': 'pot', 'Último:': 'Last:', 'con el empate': 'with the draw', 'Resultados recientes': 'Recent results', 'de todos': 'from everyone',
    'acertó con': 'won with', 'falló con': 'lost with', 'retiró con': 'cashed out with', 'acertaste con': 'won with', 'fallaste con': 'lost with', 'retiraste con': 'cashed out with',
    'reta a': 'challenges', 'contra': 'vs', 'Combinadas': 'Parlays', 'filtra por amigo, estado o deporte': 'filter by friend, status or sport', 'Ajustes de la mesa · solo tú': 'Table settings · only you',
    // apostar en directo (31-10): frases enteras, antes de que las reglas sueltas cambien palabras sueltas
    'la cuota se mueve con el marcador': 'odds move with the score', 'Combinada de la semana': 'Parlay of the week', 'CANCELADA': 'CANCELLED', 'Combinada cancelada: cobras': 'Parlay cancelled: you get',
    // perfil con pestanas (31-10)
    'Resumen': 'Summary', 'Dinero': 'Money', 'Duelos y premios': 'Duels and prizes', 'Dónde ganas y pierdes': 'Where you win and lose',
    'Lo que te ha dado o quitado cada cosa desde el principio.': 'What each thing has given or taken from you since the start.',
    'Sueltas, combinadas, predicciones y cancelaciones': 'Singles, parlays, predictions and cancellations', 'Sueltas, combinadas y cancelaciones': 'Singles, parlays and cancellations', 'Pones': 'You put', 'Te llevas': 'You take', 'Los retos no se cancelan: se paga al acabar el partido.': 'Challenges cannot be cancelled: paid when the match ends.', 'Contraseña nueva (6 o más)': 'New password (6 or more)', 'Mínimo 6 caracteres': 'At least 6 characters', 'PM puede ver esta contraseña para devolvértela si la pierdes. No uses la de tu correo ni la de nada más.': 'PM can see this password to give it back if you lose it. Do not use the one from your email or anything else.', 'Apuestas rápidas': 'Quick bets', 'Predicciones en directo: gol o siguiente ronda': 'Live predictions: next goal or next round', 'Cajas y skins': 'Cases and skins',
    'Cajas abiertas, skins vendidas y batallas': 'Cases opened, skins sold and battles', 'Blackjack, crash y los demás': 'Blackjack, crash and the rest',
    'Pagas y premios': 'Pay and prizes', 'Paga del lunes, recompensas, bote y premios': 'Monday pay, rewards, pot and prizes',
    'Tus apuestas sueltas': 'Your single bets', 'Sus apuestas sueltas': 'Their single bets', 'Beneficio de las resueltas, por tipo.': 'Profit of settled bets, by type.',
    'Antes del partido': 'Before the match', 'Canceladas en directo': 'Cancelled live',
    // Ajustes, moneda y ya jugados (30-10 noche)
    'Ajustes': 'Settings', 'Sonido y movimiento': 'Sound and motion', 'Sonidos': 'Sounds', 'Botones, ruletas, premios y mensajes': 'Buttons, spins, prizes and messages',
    'Ruletas, confeti y transiciones': 'Spins, confetti and transitions', 'Moneda': 'Currency', 'Cambia el logo y el nombre. Lo que tienes es lo mismo.': 'Changes the logo and the name. What you have stays the same.',
    'Idioma': 'Language', 'Abrir Ajustes': 'Open Settings', 'Cuenta': 'Account', 'Este navegador no deja mandar avisos.': 'This browser does not allow notifications.',
    'Te avisa de tus apuestas y de los partidos que sigues.': 'Lets you know about your bets and the matches you follow.',
    // resultados (ganado.js, 30-10)
    'Resultados': 'Results', 'Resultados nuevos': 'New results', 'Apuesta ganada': 'Bet won', 'Reto ganado': 'Challenge won', 'Cash out': 'Cash out',
    'Has ganado': 'You won', 'Has retirado': 'You cashed out', 'Tu elección': 'Your pick', 'Apostaste': 'You staked', 'limpias': 'profit',
    'Toca para cerrar': 'Tap to close', 'Desde la última vez': 'Since you were away', 'más en Resultados': 'more in Results', 'También': 'Also',
    'ganadas': 'won', 'perdidas': 'lost', 'devuelta': 'refunded', 'devueltas': 'refunded',
    'Perdiste': 'You lost', 'con': 'with', 'Cash out con': 'Cash out with', 'Perdiste el reto con': 'You lost the challenge to', 'Reto devuelto': 'Challenge refunded',
    'Te devolvemos': 'Refunded', 'Reto a': 'Challenge vs', 'Tuyos': 'Yours', 'De todos': 'Everyone', 'Últimos 7 días': 'Last 7 days',
    'Todavía no hay resultados.': 'No results yet.', 'Ver el Feed': 'See the Feed', 'ganó': 'won', 'perdió': 'lost', 'retiró': 'cashed out', 'recupera': 'gets back',

    // boleto multiple (boleto.js, 30-10)
    'Boleto': 'Bet slip', 'Vaciar': 'Clear', 'Mismo importe para todas': 'Same stake for all', 'Abrir el boleto': 'Open the bet slip', 'Ir al partido': 'Go to the match',
    'La mitad de tu saldo, repartida': 'Half your balance, split', 'Todo tu saldo, repartido': 'Your whole balance, split',
    'Total apostado': 'Total stake', 'Cobrarías si aciertas todas': 'Payout if all win', 'Cobrarías si aciertas': 'Payout if it wins',
    'para apostarlo todo': 'to place it all', 'Pon un importe en cada una': 'Put a stake on each pick',
    'Quita las que ya no tienen cuota': 'Remove the picks with no odds', 'Esa opción ya no tiene cuota': 'No odds for this pick any more',
    'Con cuota mejorada te quedan': 'With boosted odds you have', 'en este partido': 'left on this match',
    'ya ha empezado y sale del boleto': 'has started and leaves the slip', 'Ha entrado': 'Placed', 'No ha entrado': 'Not placed', 'No ha entrado ninguna': 'None placed',
    'Las que no han entrado siguen abajo con el motivo': 'The ones that did not go in stay below with the reason', 'Sin conexión: no ha entrado': 'No connection: not placed',
    'Toca una cuota para añadirla al boleto.': 'Tap any odds to add them to your slip.',
    'Este partido ya ha empezado: apuestas cerradas': 'This match has already started: betting closed', 'Esa opción no se puede apostar': 'That pick cannot be bet on',
    'Ese partido no existe': 'That match does not exist', 'Elige 1, X o 2': 'Pick 1, X or 2',

    'Ya jugados': 'Already played', 'últimos dos días': 'last two days', 'por empezar': 'about to start',
    // juegos (crash de velas, rankings, en la ronda; 30-10)
    'Cara o cruz': 'Heads or tails', 'Crash': 'Crash', 'Blackjack': 'Blackjack',
    'Contra': 'Against', 'Cualquiera': 'Anyone', 'Tu lado': 'Your side', 'Cara': 'Heads', 'Cruz': 'Tails', 'cara': 'heads', 'cruz': 'tails',
    'Apuesta': 'Bet', 'Todo': 'All', 'Máx': 'Max', 'Retar por': 'Challenge for', 'Abiertos': 'Open', 'Tus retos': 'Your challenges', 'Últimos': 'Latest',
    'Aceptar': 'Accept', 'Retirar': 'Withdraw', 'Tú': 'You', 'ti': 'you',
    'Retirar solo en': 'Cash out only at', 'sin límite': 'no limit', 'Retirada automática': 'Auto cash out',
    'Dentro': 'In', 'dentro': 'in', 'En marcha': 'Running', 'Retirado': 'Cashed out', 'Perdida': 'Lost', 'En la ronda': 'In the round', 'Últimas rondas': 'Last rounds',
    'Ranking': 'Leaderboard', 'De siempre': 'All time', 'Esta semana': 'This week', 'Ver todos': 'See all', 'Ocultar': 'Hide', 'Todavía no ha jugado nadie': 'Nobody has played yet',
    'Ese juego no tiene ranking': 'That game has no leaderboard', 'Elige siempre o semana': 'Pick all time or this week',
    'Más ganado': 'Most won', 'Mayor ×': 'Biggest ×', 'Mayor premio': 'Biggest win', 'Todavía no ha ganado nadie': 'Nobody has won yet', 'Explotado': 'Crashed',
    'Todavía nadie dentro': 'Nobody in yet', 'segundos': 'seconds', 'Apuesta para abrir una ronda': 'Bet to open a round', 'Retira antes de que explote': 'Cash out before it blows',
    'Banca': 'Dealer', 'Haz tu apuesta': 'Place your bet', 'En juego': 'In play', 'Pedir': 'Hit', 'Plantarse': 'Stand', 'Doblar': 'Double', 'doblada': 'doubled',
    'Repartir por': 'Deal for', 'Otra mano por': 'Another hand for', 'Hoy te quedan': 'Today you have', 'por arriesgar': 'left to risk',
    'Hoy ya has perdido 500. Vuelve mañana': 'You have already lost 500 today. Come back tomorrow',
    'Blackjack paga 3 a 2': 'Blackjack pays 3 to 2', 'Blackjack paga 3 a 2. La banca se planta en 17.': 'Blackjack pays 3 to 2. The dealer stands on 17.',
    'Empate · te devuelvo la apuesta': 'Push · your bet is returned',
    'Pon una cantidad': 'Enter an amount', 'Este juego está cerrado ahora mismo': 'This game is closed right now',
    'La retirada automática va de ×1,01 a ×1000': 'Auto cash out goes from ×1.01 to ×1000',
    'Tienes que entrar primero': 'You need to log in first', 'La apuesta mínima es 1': 'The minimum bet is 1', 'La apuesta máxima es 100.000': 'The maximum bet is 100,000',
    'Elige cara o cruz': 'Pick heads or tails', 'Elige a un colega': 'Pick a friend', 'Ya tienes 5 retos abiertos: retira alguno': 'You already have 5 open challenges: withdraw one',
    'Ese reto no existe': 'That challenge does not exist', 'Ese reto ya no está abierto': 'That challenge is no longer open', 'No puedes aceptar tu propio reto': 'You cannot accept your own challenge',
    'Ese reto es para otro': 'That challenge is for someone else', 'Ese reto no es tuyo': 'That challenge is not yours', 'Ese reto ya no se puede retirar': 'That challenge can no longer be withdrawn',
    'La ronda ya ha arrancado: espera a la siguiente': 'The round has already started: wait for the next one', 'Ya estás dentro de esta ronda': 'You are already in this round',
    'No hay ninguna ronda': 'There is no round', 'No estás en esta ronda': 'You are not in this round', 'La ronda aún no ha arrancado': 'The round has not started yet',
    'Ya tienes una mano en juego': 'You already have a hand in play', 'Esa mano no es tuya': 'That hand is not yours', 'Esa mano ya ha terminado': 'That hand has already ended',
    'Solo puedes doblar con las dos primeras cartas': 'You can only double on your first two cards',
    'Los juegos aún no están en la base: falta cargar db/010_juegos.sql': 'The games are not in the database yet: db/010_juegos.sql is missing',
    'En mantenimiento': 'Under maintenance', 'El Mercado está casi listo. Intercambios, ventas, contratos y jackpot llegan pronto.': 'The Market is almost ready. Trades, sales, contracts and jackpot are coming soon.',
    // menú y cabeceras
    'Partidos': 'Matches', 'Mis apuestas': 'My bets', 'Apuestas de todos': 'All bets', 'Todos': 'All', 'Apuestas': 'Bets', 'Colegas': 'Friends', 'Liga': 'League', 'Monedero': 'Wallet', 'Perfil': 'Profile',
    'Fútbol, Valorant, CS2 y UFC · solo 1 X 2 · cierra al empezar': 'Football, Valorant, CS2 and UFC · 1 X 2 only · closes at kick-off',
    'Lo que llevas en juego y todo lo que ya se ha pagado': 'What you have in play and everything already paid',
    'Lo que lleva cada uno en juego y cuánto falta': 'What each of you has in play and how long is left',
    'La temporada, semana a semana': 'The season, week by week', 'Fotos, mensajes y avisos': 'Photos, messages and notices',
    'Tu dinero, la paga del lunes y cada movimiento': 'Your money, the Monday payday and every move',
    // entrar
    'Usuario': 'Username', 'Contraseña': 'Password', 'Entrar': 'Log in', 'Usuario o contraseña incorrectos': 'Wrong username or password',
    // partidos
    'Fútbol': 'Football', 'Todo': 'All', 'Principales': 'Top', 'Todas': 'All', 'Cobro con': 'Payout with', 'nada': 'none',
    'cuotas reales de DraftKings o calculadas · se congelan al apostar': 'real DraftKings odds or our own · locked when you bet',
    'cuotas: DraftKings o calculadas': 'odds: DraftKings or our own', 'VIVO': 'LIVE', 'En directo': 'Live', 'EN DIRECTO': 'LIVE', 'vs': 'vs',
    'No hay partidos con este filtro en los próximos días.': 'No matches with this filter in the next days.',
    'Empate': 'Draw', 'empate': 'draw', 'X · EMPATE': 'X · DRAW', '1 · GANA': '1 · WIN', '2 · GANA': '2 · WIN',
    'Cuotas reales de DraftKings · se congelan al apostar': 'Real DraftKings odds · locked when you bet',
    'Cuotas calculadas con la forma y el récord · se congelan al apostar': 'Odds from form and record · locked when you bet',
    'Elige 1, X o 2 para apostar.': 'Pick 1, X or 2 to bet.', 'Elige 1 o 2 para apostar.': 'Pick 1 or 2 to bet.',
    'Cerrado: ya ha empezado. Se paga solo al acabar.': 'Closed: it has started. It pays out by itself at the end.',
    'Si aciertas con': 'If you win with', 'Colegas en este partido': 'Friends in this match', 'aún no ha apostado': 'has not bet yet',
    'Tus apuestas aquí': 'Your bets here', 'Cancelar': 'Cancel', '¿Seguro? Toca otra vez': 'Sure? Tap again',
    'Retar a un colega en este partido': 'Challenge a friend on this match', 'Cerrar': 'Close', 'Elige colega y resultado.': 'Pick a friend and a result.',
    'Reto 1 contra 1 · el que acierte se lleva lo de los dos': '1 vs 1 challenge · whoever is right takes both stakes',
    'Dónde verlo': 'Where to watch', 'En inglés': 'In English', 'En español': 'In Spanish', 'sin datos': 'no data',
    'Últimos 5': 'Last 5', 'Ver ficha': 'View profile', 'Recompensas': 'Rewards', 'Una tirada gratis': 'One free spin', 'Girar': 'Spin', 'De 50 a 1.000 V-Bucks o una caja de CS2 que se abre sola.': 'From 50 to 1,000 V-Bucks or a CS2 box that opens by itself.', 'Reclamar': 'Claim', 'Hecho hoy': 'Done today', 'Entrar': 'Join', 'Estás dentro': 'You are in', 'Empieza el lunes': 'Starts Monday', 'Cerrado hasta el lunes': 'Closed until Monday', 'Pedir': 'Ask', 'Cerrar': 'Close', 'Estás dentro del bote de esta semana': 'You are in this week\u2019s pot', 'Juegos': 'Games', 'Blackjack · como mucho 100 de pérdida al día': 'Blackjack · at most 100 lost per day', 'Cara o cruz, crash, ruleta, blackjack y plinko': 'Coin flip, crash, roulette, blackjack and plinko', 'Cara o cruz': 'Coin flip', 'Ruleta': 'Roulette', 'Cualquiera': 'Anyone', 'Tu lado': 'Your side', 'Cara': 'Heads', 'Cruz': 'Tails', 'Apuesta': 'Bet', 'Aceptar': 'Accept', 'Retirar': 'Cash out', 'Abiertos': 'Open', 'Tus retos': 'Your challenges', 'Últimos': 'Latest', 'Retirar solo en': 'Auto cash out at', 'sin límite': 'no limit', 'Apostar': 'Bet', 'Dentro': 'In', 'En marcha': 'Running', 'Retirado': 'Cashed out', 'Perdida': 'Lost', 'dentro': 'in', 'En la ronda': 'In this round', 'Color': 'Colour', 'Rojo': 'Red', 'Negro': 'Black', 'Verde': 'Green', 'Girando': 'Spinning', 'Banca': 'Dealer', 'Tú': 'You', 'Pedir': 'Hit', 'Plantarse': 'Stand', 'Doblar': 'Double', 'doblada': 'doubled', 'Riesgo': 'Risk', 'Bajo': 'Low', 'Medio': 'Medium', 'Alto': 'High', 'Últimas bolas': 'Last balls', 'Apuesta para abrir una ronda': 'Bet to open a round', 'Retira antes de que explote': 'Cash out before it crashes', 'Empate · te devuelvo la apuesta': 'Push · bet returned', 'Blackjack paga 3 a 2. La banca se planta en 17.': 'Blackjack pays 3 to 2. Dealer stands on 17.', 'Pon una cantidad': 'Enter an amount', 'Directo': 'Live', 'Viendo este directo': 'Watching this stream', 'EN JUEGO': 'OPEN', 'EN VIVO': 'LIVE', 'mapas ganados': 'maps won', 'Lo que se está jugando ahora mismo': 'What is being played right now', 'Apuestas en este partido': 'Bets on this match', 'Nadie ha apostado a este partido.': 'Nobody has bet on this match.', 'Ver la ficha y las estadísticas': 'Open the match and stats', 'El marcador se actualiza cada pocos minutos; lo de verdad va en el vídeo.': 'The score updates every few minutes; the video is live.', 'Ahora mismo no se juega nada': 'Nothing is being played right now', 'Este partido no tiene una emisión que se pueda ver aquí.': 'This match has no stream that can play here.', 'en juego': 'live', 'pendiente': 'pending', 'acabado': 'finished', 'oculta': 'hidden', 'Ruleta de la semana': 'Weekly wheel', 'Una tirada gratis cada semana': 'One free spin every week', 'Girar la ruleta': 'Spin the wheel', 'Girando…': 'Spinning…', 'Ya has girado esta semana. La siguiente, el lunes.': 'Already spun this week. Next one on Monday.', 'V-Bucks de 50 a 1.000 o una caja de CS2 gratis que se abre sola y va a tu inventario.': 'V-Bucks from 50 to 1,000 or a free CS2 box that opens by itself into your inventory.', 'Movimientos': 'Moves', 'Todo': 'All', 'Apuestas': 'Bets', 'Cajas y skins': 'Boxes and skins', 'Pagas y premios': 'Pay and rewards', 'Nada por aquí todavía.': 'Nothing here yet.', 'pagas y regalos': 'pay and gifts', 'Caja': 'Box', 'Caja ★': 'Box ★', 'Cajas': 'Boxes', 'Caja de CS2': 'CS2 box', 'Batalla de cajas': 'Box battle', 'Todas las cajas': 'All boxes', 'Volver a la caja': 'Back to the box', 'Abre cajas de CS2, guarda skins y juega batallas': 'Open CS2 boxes, keep skins and play battles', 'Premio de la semana': 'Weekly award', 'Ver bracket': 'View bracket', 'Cuadro de ganadores': 'Upper bracket', 'Cuadro de perdedores': 'Lower bracket', 'Gran final': 'Grand final', 'Eliminatorias': 'Playoffs', 'Cuartos': 'Quarterfinals', 'Semis': 'Semifinals', 'Por decidir': 'TBD', 'Cargando el bracket…': 'Loading the bracket…', 'Este torneo todavía no tiene bracket.': 'This tournament has no bracket yet.', 'Abrir': 'Open', 'Inventario': 'Inventory', 'Batallas': 'Battles', 'Todas las cajas': 'All boxes', 'Cargando lo que trae…': 'Loading contents…', 'Especial': 'Special', 'Encubierto': 'Covert', 'Clasificado': 'Classified', 'Restringido': 'Restricted', 'Grado militar': 'Mil-Spec', 'Cuántas': 'How many', 'Rápido': 'Fast', 'Sin saldo': 'No balance', 'Abrir por': 'Open for', 'Otra por': 'Again for', 'Vender todo por': 'Sell all for', 'Recién fabricado': 'Factory New', 'Casi nuevo': 'Minimal Wear', 'Algo desgastado': 'Field-Tested', 'Bastante desgastado': 'Well-Worn', 'Deplorable': 'Battle-Scarred', 'Sin desgaste': 'No wear', 'Vender': 'Sell', 'Vendida': 'Sold', 'Volver a la caja': 'Back to the box', 'Lo que trae': 'Contents', '★ Objeto especial': '★ Rare special item', 'Lo último que ha salido': 'Latest drops', 'Tu inventario': 'Your inventory', 'Su inventario': 'Inventory', '1 skin': '1 skin', 'Toca una skin para elegirla': 'Tap a skin to select it', 'Quitar': 'Clear', 'Vender por': 'Sell for', 'Aún no tienes skins. Abre una caja o gana una batalla.': 'No skins yet. Open a box or win a battle.', 'Todavía no tiene skins.': 'No skins yet.', 'Cada uno abre las mismas cajas. El lado que saque más valor se lleva todas las skins.': 'Everyone opens the same boxes. The side with the most value takes every skin.', 'Crear batalla': 'Create battle', 'Abiertas': 'Open', 'Terminadas': 'Finished', 'Ninguna abierta ahora mismo.': 'None open right now.', 'Unirme': 'Join', 'Unirme aquí': 'Join here', 'Salir': 'Leave', 'Ver': 'Watch', 'Ver el resultado': 'See the result', 'Ver otra vez': 'Watch again', 'Saltar': 'Skip', 'valor sacado': 'value unboxed', 'por cabeza': 'each', 'a': 'to', 'Nueva batalla': 'New battle', 'Toca una caja para añadir una ronda': 'Tap a box to add a round', 'Aún sin cajas. Hasta 10 rondas.': 'No boxes yet. Up to 10 rounds.', 'Crear por': 'Create for', 'Cada jugador paga lo mismo al unirse.': 'Each player pays the same to join.', 'Libre': 'Free', 'Cargando batalla…': 'Loading battle…', 'Estás dentro': 'You are in', 'Batalla llena: se abren las cajas': 'Battle full: opening the boxes', 'Batalla creada: falta que se unan': 'Battle created: waiting for players', 'No tienes saldo suficiente': 'Not enough balance', 'Caja de CS2': 'CS2 box', 'Venta de skin': 'Skin sale', 'Batalla de cajas': 'Box battle', 'Me sumo': 'Me too', 'sin resueltas': 'none settled', 'Al chat': 'To chat', 'Encuesta': 'Poll', 'Reaccionar': 'React', 'La pregunta': 'The question', 'Crear encuesta': 'Create poll', 'Bote de la semana': 'Weekly pot', 'Quién sabe más': 'Who knows best', 'aciertos por deporte': 'wins by sport', 'Premio diario': 'Daily reward', 'Rescate': 'Rescue', 'Bote ganado': 'Pot won', 'Apuesta mandada al chat': 'Bet sent to chat', 'Elige cuánto y dale a Apostar': 'Pick an amount and hit Bet', 'Sale cuando se resuelvan las primeras apuestas.': 'Shows up once the first bets settle.', 'Premio diario reclamado · vuelve mañana': 'Daily reward claimed · come back tomorrow', 'Oculta hasta empezar': 'Hidden until kick-off', 'Esa apuesta ya no está.': 'That bet is gone.', 'se lo lleva': 'takes it', 'Otros idiomas': 'Other languages', 'Buscarlo': 'Search for it', 'Resueltas': 'Settled', 'las últimas de todos': 'latest from everyone', 'nadie': 'nobody', 'nada en juego': 'nothing in play', 'acertó': 'won', 'falló': 'lost', 'Nadie tiene nada en juego. Se apuesta desde Partidos.': 'Nobody has anything in play. Bet from Matches.', 'Todavía no se ha resuelto ninguna. Cuando acabe un partido sale aquí quién acertó.': 'Nothing settled yet. When a match ends, who won shows up here.', 'Historial': 'History', 'Perfil, stats e historial →': 'Profile, stats and history →', 'anulada': 'void', 'en juego': 'open', 'en vivo': 'live', 'oculta hasta empezar': 'hidden until kick-off', 'Todavía no ha apostado.': 'No bets yet.', 'En línea': 'Online', 'Hoy': 'Today', 'Ayer': 'Yesterday', 'Nota de voz': 'Voice note', 'Parar y enviar': 'Stop and send', 'Cancelar': 'Cancel', 'Enviando nota de voz…': 'Sending voice note…', 'No hay micrófono o no has dado permiso': 'No microphone or no permission', 'Este navegador no deja grabar audio': 'This browser cannot record audio', 'Tus V-Bucks, la paga del lunes y cada movimiento': 'Your V-Bucks, Monday pay and every move', 'Victorias': 'Win rate', 'Racha': 'Streak', 'Mapas': 'Maps', 'Siglas': 'Tag', 'Cara a cara': 'Head to head', 'Anteriores': 'Previous', 'Más ligas': 'More leagues', 'Alineaciones': 'Line-ups', 'Las alineaciones salen cuando los equipos las dan, sobre una hora antes.': 'Line-ups show once the teams announce them, about an hour before.', 'Últimos partidos': 'Last matches', 'Próximos': 'Next', 'Plantilla': 'Squad', 'Porteros': 'Goalkeepers', 'Defensas': 'Defenders', 'Centrocampistas': 'Midfielders', 'Delanteros': 'Forwards', 'Sumisiones': 'Submissions', 'Edad': 'Age', 'Altura': 'Height', 'Peso': 'Weight', 'Alcance': 'Reach', 'Guardia': 'Stance', 'País': 'Country', 'Gimnasio': 'Gym', 'Categoría': 'Division', 'Apodo': 'Nickname', 'Últimas peleas': 'Last fights', 'Jugadores': 'Players', 'Últimos resultados': 'Last results', 'Cargando la ficha…': 'Loading the profile…', 'No se ha podido cargar la ficha.': 'Could not load the profile.', 'ESPN no tiene más datos de este equipo.': 'ESPN has no more data on this team.', 'ESPN no tiene la ficha de este luchador.': 'ESPN has no profile for this fighter.', 'PandaScore todavía no tiene datos de este equipo.': 'PandaScore has no data on this team yet.', 'Clasificación': 'Standings', 'Posesión': 'Possession', 'Tiros': 'Shots', 'A puerta': 'On target', 'Córners': 'Corners',
    'Faltas': 'Fouls', 'Amarillas': 'Yellow cards', 'Rojas': 'Red cards', 'Fueras de juego': 'Offsides', 'Forma': 'Form', 'G · E · P': 'W · D · L',
    'Récord': 'Record', 'Formato': 'Format', 'Cargando datos de ESPN…': 'Loading ESPN data…', 'Apuesta del día': 'Bet of the day',
    '← Partidos': '← Matches', '← Volver': '← Back', 'Cartelera principal': 'Main card', 'Combate estelar': 'Main event', 'Internacional': 'International',
    // mis apuestas
    'En juego': 'In play', 'Apostado': 'Staked', 'Cobrado': 'Collected', 'Aciertos': 'Hit rate', 'Racha': 'Streak', 'Mejor cuota': 'Best odds',
    'acertada': 'won', 'la de ahora': 'right now', 'Si aciertas todo lo abierto': 'If everything open wins', 'Resueltas': 'Settled', 'Ganadas': 'Won',
    'Perdidas': 'Lost', 'Pendiente': 'Pending', 'Ganada': 'Won', 'Perdida': 'Lost', 'Anulada': 'Void', 'Tus retos': 'Your challenges',
    'Nada en juego. Ve a Partidos y toca una cuota.': 'Nothing in play. Go to Matches and tap a price.', 'Todavía nada.': 'Nothing yet.',
    'Aún no has retado a nadie. Abre un partido y pulsa Retar.': 'You have not challenged anyone yet. Open a match and tap Challenge.',
    'Esperando respuesta': 'Waiting for an answer', 'Rechazado': 'Declined', 'Sin contestar': 'No answer', 'Retirado': 'Withdrawn', 'Ganado': 'Won',
    'Sin ganador': 'No winner', 'No': 'No', 'Retirar': 'Withdraw',
    // colegas
    'De aquí a la paga del lunes': 'From now to the Monday payday', 'Lo que viene': 'Coming up', 'Sin extra': 'No bonus', 'Elecciones': 'Picks',
    'Visibles': 'Visible', 'Ocultas hasta empezar': 'Hidden until kick-off', 'Retos 1 contra 1': '1 vs 1 challenges', 'Duelos': 'Duels',
    'apostáis a cosas distintas': 'you bet on different outcomes', 'Sin duelos a la vista.': 'No duels in sight.', 'Si acierta': 'If it wins',
    'Últimas resueltas': 'Last settled', 'Nada en juego.': 'Nothing in play.', 'Oculta': 'Hidden', 'EN VIVO': 'LIVE',
    'Nadie ha retado a nadie todavía. Se reta desde la ficha de cada partido.': 'Nobody has challenged anyone yet. Challenges start from each match.',
    'AHORA': 'NOW', 'MÁS ADELANTE': 'LATER', 'DUELO': 'DUEL', 'Nadie tiene nada en juego todavía': 'Nobody has anything in play yet', 'vs.': 'vs.',
    // liga
    'SEMANA': 'WEEK', 'Vas primero': 'You are first', 'En juego ahora': 'In play now', 'entre todos': 'between all of you', 'Repartido': 'Handed out',
    'esta temporada': 'this season', 'Aciertos del grupo': 'Group hit rate', 'Saldo semana a semana': 'Balance week by week',
    'Por encima de la línea discontinua vas ganando dinero. Pasa el ratón por cada semana.': 'Above the dashed line you are making money. Hover each week.',
    'Ganancia por semana': 'Profit by week', 'Lo ganado o perdido cada semana, sin contar la paga.': 'Won or lost each week, without the payday.',
    'Aciertos por deporte': 'Hit rate by sport', 'Qué parte de sus apuestas acierta cada uno.': 'How many of their bets each one wins.',
    'Dónde apuesta cada uno': 'Where each one bets', 'Qué parte de lo apostado va a cada deporte.': 'How much of each one\'s stakes goes to each sport.',
    'Cuota media': 'Average odds', 'Cuanto más alta, más arriesga.': 'The higher, the riskier.', 'Últimas apuestas': 'Latest bets',
    'Cada punto es una apuesta resuelta.': 'Each dot is a settled bet.', 'Premios de la temporada': 'Season awards',
    'Se reparten cuando haya apuestas resueltas.': 'Handed out once bets are settled.', 'Cuando se resuelvan las primeras apuestas saldrán aquí.': 'The first settled bets show up here.',
    'Colega': 'Player', 'Saldo': 'Balance', 'Neto': 'Net', 'Mejor premio': 'Best win', 'Fuerte en': 'Strong at', 'ganada': 'won', 'perdida': 'lost',
    'la más reciente, a la derecha': 'the newest on the right', 'INICIO': 'START', 'lo repartido': 'handed out', 'Mayor premio': 'Biggest win',
    'Cuota más alta acertada': 'Highest odds won', 'Mejor semana': 'Best week', 'Peor golpe': 'Worst hit', 'Más apuestas': 'Most bets', 'Mejor racha': 'Best streak',
    'ganadas seguidas': 'wins in a row', 'Valorant': 'Valorant', 'UFC': 'UFC',
    // chat
    'Escribe a tus colegas': 'Message your friends', 'Sus apuestas': 'Their bets', 'Fotos': 'Photos', 'Aún no hay fotos.': 'No photos yet.', 'Escribe el primero.': 'Be the first to write.',
    // monedero
    'Tu saldo': 'Your balance', 'Paga del lunes': 'Monday payday', 'pagas de los lunes': 'Monday paydays', 'Premios': 'Winnings',
    'lo que te han pagado': 'what you have been paid', 'Si aciertas todo': 'If everything wins', 'saldo posible': 'possible balance', 'Movimientos': 'Moves',
    'los últimos': 'the latest', 'Cuándo': 'When', 'Qué': 'What', 'Importe': 'Amount', 'Reglas': 'Rules', 'Apuesta': 'Bet', 'Premio': 'Win', 'Devolución': 'Refund',
    'Ajuste': 'Adjustment', 'Sin movimientos todavía.': 'No moves yet.', 'Reglas fijas. Solo PM puede cambiarlas.': 'Fixed rules. Only PM can change them.',
    'Lo que no gastas se acumula para siempre.': 'What you do not spend adds up for ever.',
    'Solo se apuesta a quién gana: 1, X o 2. En Valorant, CS2 y UFC no hay empate.': 'You only bet on who wins: 1, X or 2. Valorant, CS2 and UFC have no draw.',
    'Los resultados llegan solos y se pagan al momento. Si un partido no se juega, se devuelve lo apostado.': 'Results arrive by themselves and pay out at once. If a match is not played, the stake comes back.',
    // perfil
    'Poner foto': 'Add photo', 'Cambiar foto': 'Change photo', 'Quitar': 'Remove', 'Cambiar contraseña': 'Change password', 'Cerrar sesión': 'Log out',
    'Activar avisos': 'Turn on alerts', 'Avisos activados': 'Alerts on', 'Guardar': 'Save', 'Contraseña nueva (8 o más)': 'New password (8 or more)',
    'Toca tu apodo o tu frase para cambiarlos. Tu foto la ven los demás.': 'Tap your nickname or your line to change them. The others see your photo.',
    'de una vez': 'in one go', 'sin apuestas': 'no bets', 'arriesga mucho': 'takes big risks', 'término medio': 'middle of the road', 'juega seguro': 'plays it safe',
    'Tu saldo ': 'Your balance', 'Su saldo': 'Their balance', 'Por encima de la línea discontinua va ganando.': 'Above the dashed line they are winning.',
    'Por deporte': 'By sport', 'Apuestas acertadas de las resueltas.': 'Settled bets that won.', 'Tus duelos': 'Your duels',
    'Partidos en los que apostasteis a cosas distintas: quién acertó.': 'Matches where you bet on different outcomes: who was right.',
    'Sigue a': 'Follows', 'Logros': 'Achievements', 'Aún sin premios esta temporada.': 'No awards yet this season.', 'Nada en juego ahora mismo.': 'Nothing in play right now.',
    'Primera victoria': 'First win', 'Gana una apuesta': 'Win a bet', 'En racha': 'On a roll', '3 ganadas seguidas': '3 wins in a row', 'Imparable': 'Unstoppable',
    '5 ganadas seguidas': '5 wins in a row', 'Valiente': 'Brave', 'Gana con cuota de 3 o más': 'Win at odds of 3 or more', 'Francotirador': 'Sniper',
    'Gana con cuota de 5 o más': 'Win at odds of 5 or more', 'Todoterreno': 'All-rounder', 'Apuesta en fútbol, Valorant y UFC': 'Bet on football, Valorant and UFC',
    'Fiel': 'Loyal', '20 apuestas': '20 bets', 'Ballena': 'Whale', 'Apuesta 1.000 de una vez': 'Bet 1,000 in one go', 'En verde': 'In the green',
    'Ten más de lo que te han dado': 'Have more than you were given', 'Duelista': 'Duellist', 'Gana un reto 1 contra 1': 'Win a 1 vs 1 challenge',
    'Del día': 'Of the day', 'Acierta la apuesta del día': 'Win the bet of the day', 'Rico': 'Rich', 'Llega a 5.000': 'Reach 5,000',
    // avisos de la app
    'Sin saldo: espera a la paga del lunes': 'No chips: wait for the Monday payday', 'Subiendo foto…': 'Uploading photo…',
    'Foto de perfil cambiada': 'Profile photo changed', 'Foto quitada': 'Photo removed', 'Apodo guardado': 'Nickname saved', 'Frase guardada': 'Line saved',
    'Reto aceptado': 'Challenge accepted', 'Reto rechazado': 'Challenge declined', 'Mínimo 8 caracteres': 'At least 8 characters',
    'Contraseña cambiada. Solo la sabes tú.': 'Password changed. Only you know it.', 'Algo ha fallado': 'Something went wrong',
    // mis apuestas nueva (30-10)
    'Cobrable': 'Payout', 'Beneficio': 'Profit', 'Cuota': 'Odds', 'Cobrarías': 'You would get', 'tu apuesta': 'your pick', 'EMPATE': 'DRAW', 'Anuladas': 'Void', 'devueltas': 'refunded',
    'Nada con este filtro.': 'Nothing with this filter.', 'Todavía nada. Cuando acabe un partido en el que hayas apostado, sale aquí.': 'Nothing yet. When a match you bet on ends, it shows up here.',
    'sale con la primera resuelta': 'shows after the first settled bet', 'aciertos': 'hit rate', 'mejor cuota acertada': 'best odds won', 'cobrado en total': 'collected in total',
    // cajas (CAJAS-I18N.md, 30-10) y subtitulo de Juegos
    'Skins de CS2': 'CS2 skins', 'Lujo': 'Luxury', 'Más valiosas': 'Most valuable', 'Más nuevas': 'Newest', 'Por rareza': 'By rarity',
    'por caja': 'per box', 'Has sacado': 'You got', 'Quitar filtros': 'Clear filters', 'Abrir una caja': 'Open a box', 'desde': 'from',
    'Todavía no ha terminado ninguna.': 'None finished yet.', '1 ronda': '1 round', 'Rondas': 'Rounds', 'Cada jugador paga': 'Each player pays',
    'El lado que saque más valor se lleva todas las skins.': 'The side with the most value takes every skin.',
    'Páginas': 'Pages', 'Anterior': 'Previous', 'Siguiente': 'Next', 'Ganador': 'Winner',
    'Toca una para elegirla': 'Tap one to select it', '1 objeto': '1 item', 'Cargando…': 'Loading…',
    'Tus cajas': 'Your boxes', 'Cajas sin abrir': 'Unopened boxes', 'Tuyas sin abrir': 'Yours, unopened',
    'Abrir la tuya': 'Open yours', 'Abrir una tuya': 'Open one of yours', 'Abrir otra tuya': 'Open another of yours',
    'Cara o cruz, crash y blackjack': 'Coin flip, crash and blackjack',
    // recompensas y ruleta nuevas (30-10)
    '¡Te ha tocado!': 'You won!', 'Tu premio de esta semana': 'Your prize this week', 'Caja sin abrir: la tienes en Cajas › Inventario para abrirla tú': 'Unopened box: it is in Boxes › Inventory for you to open',
    'Ya está en tu saldo': 'Already in your balance', 'Ir a Cajas': 'Go to Boxes', '¡Premio!': 'Prize!', 'Ya has girado': 'Already spun', 'Mira dónde para la aguja': 'Watch where the pointer stops',
    'De 50 a 1.000 V-Bucks o una caja de CS2 para abrirla tú.': 'From 50 to 1,000 V-Bucks or a CS2 box to open yourself.', 'GIRAR': 'SPIN', 'Girar la ruleta': 'Spin the wheel', 'Esta semana': 'This week',
    'CAJA': 'BOX', 'CAJA ★': 'BOX ★', 'en el bote · se lo lleva quien más gane': 'in the pot · the biggest winner takes it',
    // mis apuestas estilo boleto (30-10)
    'Tu beneficio': 'Your profit', 'mejor cuota': 'best odds', 'mejor momento': 'best moment', 'peor momento': 'worst moment', 'primera': 'first', 'COBRADA': 'PAID', 'PERDIDA': 'LOST', 'ANULADA': 'VOID',
    '★ tu apuesta': '★ your pick', 'mapas': 'maps', 'marcador': 'score', 'empieza en': 'starts in', 'La curva sale cuando tengas dos apuestas resueltas.': 'The curve shows once you have two settled bets.',
    // en linea y premios por tiempo (30-10)
    'Tiempo en la app': 'Time in the app', 'Hoy llevas': 'Today you have', '· cuenta mientras la tienes abierta y a la vista': '· counts while it is open and on screen', 'Quién más está': 'Who else is on',
    // chat y feed (30-10)
    'Feed': 'Feed', 'Ruleta semanal': 'Weekly wheel', 'Avisos': 'Notices', 'se ve al empezar': 'shown at kick-off', 'acierta con': 'wins with', 'falla con': 'loses with', 'gira la ruleta de la semana': 'spins the weekly wheel',
    'abre una caja': 'opens a box', 'le sale': 'gets', 'gana la batalla a': 'wins the battle against', 'ganan la batalla a': 'win the battle against', 'Todavía no ha pasado nada por aquí.': 'Nothing has happened here yet.', 'Ver más': 'Show more', 'de CS2': 'CS2',
    // novedades (30-10)
    'Novedades': 'News', 'Nuevo': 'New', 'Todo lo nuevo de la app, con fotos': 'Everything new in the app', 'Ir a Partidos': 'Go to Matches', 'Ir a Inicio': 'Go to Home', 'Ver mis apuestas': 'See my bets', 'Ver las apuestas de todos': 'See everyone\'s bets',
    'Ir a la Liga': 'Go to the League', 'Ir al Chat': 'Go to Chat', 'Ir al Monedero': 'Go to Wallet', 'Ir a Juegos': 'Go to Games', 'Ver el directo': 'Watch live', 'Abrir Recompensas': 'Open Rewards', 'Todavía no hay novedades.': 'No news yet.',
    // juegos (JUEGOS-INTEGRAR.md, las que faltaban)
    'Crash': 'Crash', 'Blackjack': 'Blackjack', 'Contra': 'Against', 'cara': 'heads', 'cruz': 'tails', 'Máx': 'Max',
    'Retar por': 'Challenge for', 'ti': 'you', 'Retirada automática': 'Auto cash out', 'Últimas rondas': 'Last rounds', 'Todavía nadie dentro': 'Nobody in yet', 'segundos': 'seconds',
    'Haz tu apuesta': 'Place your bet', 'Repartir por': 'Deal for', 'Otra mano por': 'Another hand for', 'Hoy te quedan': 'Today you have', 'por arriesgar': 'left to risk', 'Hoy ya has perdido 500. Vuelve mañana': 'You have already lost 500 today. Come back tomorrow',
    'Blackjack paga 3 a 2': 'Blackjack pays 3 to 2', 'Este juego está cerrado ahora mismo': 'This game is closed right now', 'La retirada automática va de ×1,01 a ×1000': 'Auto cash out goes from ×1.01 to ×1000', 'Tienes que entrar primero': 'You need to log in first', 'La apuesta mínima es 1': 'The minimum bet is 1', 'La apuesta máxima es 100.000': 'The maximum bet is 100,000',
    'Elige cara o cruz': 'Pick heads or tails', 'Elige a un colega': 'Pick a friend', 'Ya tienes 5 retos abiertos: retira alguno': 'You already have 5 open challenges: withdraw one', 'Ese reto no existe': 'That challenge does not exist', 'Ese reto ya no está abierto': 'That challenge is no longer open', 'No puedes aceptar tu propio reto': 'You cannot accept your own challenge',
    'Ese reto es para otro': 'That challenge is for someone else', 'Ese reto no es tuyo': 'That challenge is not yours', 'Ese reto ya no se puede retirar': 'That challenge can no longer be withdrawn', 'La ronda ya ha arrancado: espera a la siguiente': 'The round has already started: wait for the next one', 'Ya estás dentro de esta ronda': 'You are already in this round', 'No hay ninguna ronda': 'There is no round',
    'No estás en esta ronda': 'You are not in this round', 'La ronda aún no ha arrancado': 'The round has not started yet', 'Ya tienes una mano en juego': 'You already have a hand in play', 'Esa mano no es tuya': 'That hand is not yours', 'Esa mano ya ha terminado': 'That hand has already ended', 'Solo puedes doblar con las dos primeras cartas': 'You can only double on your first two cards',
    'Los juegos aún no están en la base: falta cargar db/010_juegos.sql': 'The games are not in the database yet: db/010_juegos.sql is missing',
    // repaso del ingles en todas las pantallas (30-10)
    'Paga de': 'Payday of', 'Te faltan': 'You need', '· se acumula': '· it adds up', 'Paga del lunes: +': 'Monday payday: +', 'para cada uno': 'for each of you', 'acertó con': 'won with', 'falló con': 'lost with',
    'Cuota media de cada uno': 'Average odds of each one', 'Vender todo el inventario': 'Sell the whole inventory', 'Los que más han ganado en batallas': 'Top battle winners',
    'Zapatillas': 'Sneakers', 'Tecnología': 'Tech', 'Moda y joyas': 'Fashion and jewellery', 'Relojes': 'Watches', 'Coches': 'Cars',
    // categorias de la lista de cajas (01-11)
    'Relojes y joyas': 'Watches & jewels', 'Moda': 'Fashion', 'Motor y viajes': 'Motor and travel', 'Inversión': 'Investments',
    'Devolución de las cajas de prueba': 'Refund of the test boxes', 'Tu apodo': 'Your nickname', 'Tu frase': 'Your line', 'Blackjack paga 3 a 2': 'Blackjack pays 3 to 2',
    'Marcador en directo': 'Live score', 'en propia': 'own goal', 'Aún no ha pasado nada.': 'Nothing has happened yet.', 'Paradas': 'Saves', 'Posesión': 'Possession', 'Tiros': 'Shots', 'A puerta': 'On target', 'Córners': 'Corners',
    'EMPEZANDO': 'STARTING', 'acabado': 'finished', 'Ronda': 'Round', 'Otros idiomas': 'Other languages', 'Buscarlo': 'Search for it',
    // repaso del ingles: notas del monedero y cajas nuevas (30-10)
    'Relojes de calle': 'Street watches', 'Moda de calle': 'Streetwear', 'Motos y scooters': 'Motorbikes and scooters', 'Relojes de lujo': 'Luxury watches',
    'Blackjack ¡blackjack!': 'Blackjack, blackjack!', 'Cara o cruz: nadie aceptó': 'Coin flip: nobody accepted', 'Cara o cruz: reto retirado': 'Coin flip: challenge withdrawn', 'Cara o cruz: reto abierto': 'Coin flip: open challenge',
    'Mejor ratio de la semana': 'Best ratio of the week', 'Más dinero de la semana': 'Most money of the week', 'Reto sin contestar': 'Challenge unanswered', 'Reto sin ganador': 'Challenge without a winner', 'Predicción sin resultado, devuelta': 'Prediction without a result, refunded',
    // rendimiento en el perfil (30-10)
    'Rendimiento': 'Performance', 'Beneficio neto': 'Net profit', 'en apuestas resueltas': 'on settled bets', 'beneficio por cada 100 apostados': 'profit per 100 staked', 'Risk : reward': 'Risk : reward', 'arriesga 1 para ganar esto de media': 'risks 1 to win this on average',
    'ganadas / perdidas': 'won / lost', 'Mayor acierto': 'Biggest win', 'Beneficio acumulado': 'Cumulative profit', 'Apuesta a apuesta: por encima de cero, ganando.': 'Bet by bet: above zero means winning.', 'Beneficio por deporte': 'Profit by sport',
    'Lo ganado o perdido en cada deporte.': 'Won or lost in each sport.', 'En qué te lo gastas': 'Where your money goes', 'En qué se lo gasta': 'Where their money goes', 'V-Bucks puestos en cada cosa desde el principio.': 'V-Bucks put into each thing since the start.',
    'Batallas': 'Battles', 'Bote': 'Pot', 'cargando': 'loading', 'Sale cuando tenga apuestas resueltas.': 'Shows once there are settled bets.', 'En total': 'In total', 'Cómo te va apostando': 'How your betting is going',
    // panel de novedades y arreglos (30-10)
    'Ver todas en grande': 'See them all big', 'Octavos': 'Round of 16', 'Dieciseisavos': 'Round of 32', 'Cuartos': 'Quarter-finals', 'Semis': 'Semi-finals',
    // extras (EXTRAS-INTEGRAR.md: sonidos, stickers, cajas en directo) y lo que faltaba en el repaso (30-10)
    'Silenciar sonidos': 'Mute sounds', 'Activar sonidos': 'Turn sounds on', 'Mandar un sticker': 'Send a sticker', 'está abriendo': 'is opening', 'ha abierto': 'opened', 'Se lleva': 'Takes', 'Stickers': 'Stickers',
    'Ver partido ›': 'See match ›', 'Nadie ha apostado': 'Nobody has bet', 'Ganancia o pérdida por semana': 'Profit or loss by week', 'Zapatillas básicas': 'Basic sneakers', 'Tech básica': 'Basic tech', 'Zapatillas hype': 'Hype sneakers',
    'Compensación por el fallo de las cajas': 'Compensation for the boxes bug',
    // feed compacto (30-10)
    'lo mejor:': 'best:', 'apuesta a': 'bets on', 'ha apostado': 'has bet',
    // moneda al lado de cada cantidad (30-10)
    'en total': 'overall',
    // seguir equipos y partidos (30-10)
    'Seguir': 'Follow', 'Siguiendo': 'Following', 'Seguir el partido': 'Follow the match', 'Ya no lo sigues': 'Unfollowed', 'Siguiendo: te aviso cuando empiece y cuando acabe': 'Following: you get a notice when it starts and when it ends', 'Empieza': 'Starts',
    // ruleta Todos y apuestas en vivo (30-10)
    'aún no ha girado': 'has not spun yet', '▲ Vas ganando': '▲ Winning', '▼ Vas perdiendo': '▼ Losing',
    // vista del partido en vivo (30-10)
    'Ver el stream aquí': 'Watch the stream here', 'Ocultar el stream': 'Hide the stream', 'o en': 'or on', 'Verlo en': 'Watch on', 'No hay una emisión que se pueda ver dentro de la app.': 'There is no stream that can play inside the app.', 'en vivo': 'live',
    // animaciones (30-10)
    'Animaciones': 'Animations', 'Animaciones encendidas': 'Animations on', 'Animaciones apagadas': 'Animations off',
    // fichas: ver todos y todo sobre el equipo (30-10)
    'Todo sobre el equipo': 'All about the team', 'Todo sobre el luchador': 'All about the fighter', 'Ver menos': 'Show less', 'Puesto': 'Position', 'Ganados': 'Won', 'Empatados': 'Drawn', 'Perdidos': 'Lost', 'Puntos': 'Points',
    'Goles a favor': 'Goals for', 'Goles en contra': 'Goals against', 'Diferencia': 'Difference', 'Temporada': 'Season', 'Cuerpo técnico': 'Staff', 'Entrenador': 'Coach', 'Plantilla': 'Squad', 'Inactivos': 'Inactive', 'Torneos': 'Tournaments',
    'Las fuentes gratis no dan más datos de este equipo.': 'The free sources give no more data on this team.', 'Resultados de esta temporada y la anterior: en la ficha, Ver todos.': 'This season and last season results: in the team page, See all.', 'Otros': 'Others',
    // mercado (30-10)
    'Intercambios': 'Trades', 'Mercado': 'Market', 'Contratos': 'Contracts', 'Mis cosméticos': 'My cosmetics',
    'Proponer un trato': 'Propose a trade', 'Skins, marcos, fondos y objetos, y también V-Bucks. Lo que ofreces queda en depósito hasta que el otro responde.': 'Skins, frames, backgrounds and items, and V-Bucks too. What you offer is held in escrow until the other answers.',
    'Tú das': 'You give', 'Pides a tu colega': 'You ask your friend for', 'Elegir piezas': 'Pick items', 'Cambiar piezas': 'Change items', 'Nada de momento': 'Nothing yet', 'Nada': 'Nothing',
    'Un mensaje, si quieres': 'A message, if you like', 'Proponer trato': 'Propose trade', 'Te proponen': 'Offered to you', 'Tus propuestas': 'Your offers', 'Últimos tratos': 'Latest trades',
    'Aún no hay tratos. Elige a un colega y propón el primero.': 'No trades yet. Pick a friend and make the first offer.',
    'Das': 'You give', 'Te da': 'Gives you', 'Pides': 'You ask for', 'Te pide': 'Asks you for', 'Cancelar trato': 'Cancel trade', 'Rechazar': 'Decline', 'Aceptado': 'Accepted', 'Rechazado': 'Declined', 'Cancelado': 'Cancelled',
    'Pon algo a la venta por el precio que quieras. El primero que lo compre se lo lleva y tú cobras al momento. Puedes retirarlo cuando quieras.': 'Put something up for sale at any price. The first to buy it takes it and you get paid at once. You can take it back any time.',
    'Poner algo a la venta': 'Put something up for sale', 'Retirar de la venta': 'Take off sale', 'A la venta': 'For sale', 'Lo tuyo a la venta': 'Your items for sale', 'Vendido hace poco': 'Sold recently',
    'Ahora mismo no hay nada a la venta.': 'Nothing is for sale right now.', 'Comprar': 'Buy', 'Qué pones a la venta': 'What are you selling', 'Poner a la venta': 'Put up for sale',
    'Mete 10 piezas de la misma rareza y sale 1 de la rareza siguiente, al azar y de las mismas cajas. No se mezclan skins, lujo y cosméticos. Casi siempre sale algo que vale menos que lo que metes: a veces sale algo que vale mucho más.': 'Put in 10 items of the same rarity and 1 of the next rarity comes out, at random and from the same boxes. Skins, luxury and cosmetics are not mixed. It usually comes out worth less than what you put in: sometimes it is worth a lot more.',
    'Elige 10 piezas de la misma rareza': 'Pick 10 items of the same rarity', 'Firmar contrato': 'Sign contract', 'Últimos contratos': 'Latest contracts', 'Tu contrato ha salido': 'Your contract came out', 'Valor': 'Value', 'Otro contrato': 'Another contract',
    'Cada uno mete V-Bucks o piezas por su valor. Cuando entra la segunda persona empiezan 60 segundos; al acabar el servidor saca un boleto: cuanto más has metido, más grande es tu trozo. Quien gana se lo lleva todo.': 'Everyone puts in V-Bucks or items at their value. When the second person joins, 60 seconds start; when they end the server draws a ticket: the more you put in, the bigger your slice. The winner takes everything.',
    'Falta alguien': 'Waiting for someone', 'Girando…': 'Spinning…', 'Sin ronda': 'No round', 'Tú metes': 'You put in', 'Y piezas, si quieres': 'And items, if you like', 'Retirar lo que metí': 'Take back what I put in', 'Nadie ha metido nada todavía.': 'Nobody has put anything in yet.',
    'Un marco para tu foto y un fondo para la app. Se ven en todo lo que pintan los demás. Consíguelos en Cajas, en Cosméticos, o cómpralos y cámbialos aquí.': 'A frame for your photo and a background for the app. Everyone sees them. Get them in Boxes, under Cosmetics, or buy and swap them here.',
    'Marco': 'Frame', 'Fondo': 'Background', 'Ninguno': 'None', 'Marcos': 'Frames', 'Fondos': 'Backgrounds', 'Objetos de colección': 'Collectibles', 'Ponerme': 'Wear it', 'Puesto · quitar': 'Worn · remove', 'Los colegas': 'The friends',
    'Aún no tienes ningún marco. Salen en la Caja Aros, la Caja Neón y la Caja Oro.': 'You have no frames yet. They come in the Aros, Neón and Oro boxes.',
    'Aún no tienes ningún fondo. Salen en la Caja Fondos y en la Caja Neón.': 'You have no backgrounds yet. They come in the Fondos and Neón boxes.',
    'Aún no tienes objetos. Salen en la Caja Calle y en la Caja Oro.': 'You have no items yet. They come in the Calle and Oro boxes.',
    'V-Bucks que das': 'V-Bucks you give', 'V-Bucks que pides': 'V-Bucks you ask for', 'Precio': 'Price', 'Lo que das': 'What you give', 'Piezas para el jackpot': 'Items for the jackpot', 'Listo': 'Done', 'No hay nada de esa rareza.': 'Nothing of that rarity.',
    'Trato hecho': 'Trade done', 'Trato rechazado': 'Trade declined', 'Trato cancelado: te devuelvo lo que ofrecías': 'Trade cancelled: what you offered is back', 'Retirado de la venta': 'Taken off sale',
    'Has retirado lo que metiste': 'You took back what you put in', 'La ronda acababa de cerrarse. Prueba otra vez': 'The round had just closed. Try again', 'Estás dentro del jackpot': 'You are in the jackpot',
    // avisos de la base (db/020_mercado.sql)
    'Un trato vacío no sirve': 'An empty trade is no use', 'Elige a un colega': 'Pick a friend', 'Esa cantidad de V-Bucks no vale': 'That V-Bucks amount is not valid', 'Ya tienes 6 tratos abiertos: cancela alguno': 'You already have 6 open trades: cancel one',
    'Lo que pides ya no lo tiene': 'They no longer have what you ask for', 'Alguna de tus piezas ya no está libre': 'One of your items is no longer free', 'Ese trato no es tuyo': 'That trade is not yours', 'Ese trato ya está cerrado': 'That trade is already closed',
    'Ese trato no es para ti': 'That trade is not for you', 'Lo que ofrecía ya no está disponible': 'What they offered is no longer available', 'Ya no tienes lo que te piden': 'You no longer have what they ask for',
    'No se ha podido entregar lo ofrecido': 'The offered items could not be handed over', 'No se ha podido entregar lo pedido': 'The requested items could not be handed over', 'Elige qué poner a la venta': 'Pick what to sell',
    'Pon un precio de 1 a 10.000.000': 'Set a price from 1 to 10,000,000', 'Ya tienes 12 cosas a la venta': 'You already have 12 things for sale', 'Eso no es tuyo o ya no está libre': 'That is not yours or no longer free', 'Eso no es tuyo': 'That is not yours',
    'Eso ya no está a la venta': 'That is no longer for sale', 'Eso no existe': 'That does not exist', 'Eso ya se ha vendido o se ha retirado': 'That was already sold or taken back', 'Eso es tuyo: puedes retirarlo': 'That is yours: you can take it back',
    'Esa pieza ya no está disponible': 'That item is no longer available', 'Un contrato son exactamente 10 piezas': 'A contract is exactly 10 items', 'Alguna de esas piezas no es tuya o ya no está libre': 'One of those items is not yours or no longer free',
    'Tienen que ser las 10 de la misma rareza': 'All 10 must be the same rarity', 'Con lo especial no hay nada mejor': 'There is nothing better than special', 'No se mezclan skins, lujo y cosméticos': 'Skins, luxury and cosmetics are not mixed',
    'No hay nada de la rareza siguiente para esas piezas': 'There is nothing of the next rarity for those items', 'Hay una pieza repetida': 'An item is repeated', 'Mete al menos 10 de valor': 'Put in at least 10 of value',
    'Alguna de esas piezas ya no está libre': 'One of those items is no longer free', 'No estás dentro': 'You are not in', 'Ya hay más gente: no se puede salir': 'Others have joined: you cannot leave', 'Eso no es tuyo, o no se puede llevar': 'That is not yours or cannot be worn',
    'Se lleva un marco o un fondo': 'You wear a frame or a background', 'Eso no es un marco': 'That is not a frame', 'Eso no es un fondo': 'That is not a background', 'Esa caja no existe': 'That box does not exist',
    // extras 2 (30-10): cuota mejorada, predicción rápida, vitrina y trofeos
    'CUOTA MEJORADA': 'BOOSTED ODDS', 'Predicción rápida': 'Quick prediction', 'Predicción acertada': 'Prediction won', 'Predicción devuelta': 'Prediction refunded',
    'Predicción rápida: apostado': 'Quick prediction: bet placed',
    '¿Habrá gol en los próximos 10 minutos?': 'Will there be a goal in the next 10 minutes?', 'Sí, habrá gol': 'Yes, there will be a goal', 'No, sin goles': 'No, no goals',
    '¿Quién gana la siguiente ronda?': 'Who wins the next round?', 'Tus predicciones aquí': 'Your predictions here',
    'Cuenta desde 1 minuto después de apostar, durante 10 minutos. Lo comprueba el servidor con la hora real de cada gol en ESPN.': 'Counts from 1 minute after you bet, for 10 minutes. The server checks it against the real time of each goal on ESPN.',
    'La apuesta vale para esa ronda. El servidor la comprueba después con el historial ronda a ronda de vlr.gg.': 'The bet is for that round. The server checks it afterwards with the round by round history from vlr.gg.',
    'Descanso: vuelve cuando ruede el balón.': 'Half time: come back when the ball rolls.', 'El partido no está en juego.': 'The match is not being played.',
    'Las predicciones rápidas de este partido todavía no están disponibles.': 'Quick predictions are not available for this match yet.',
    'No consigo los datos del partido ahora mismo.': 'I cannot get the match data right now.', 'No consigo los datos de vlr.gg ahora mismo.': 'I cannot get the vlr.gg data right now.',
    'Queda muy poco partido para una ventana de 10 minutos.': 'Too little of the match is left for a 10 minute window.', 'Entre mapas: vuelve cuando empiece el siguiente.': 'Between maps: come back when the next one starts.',
    'esperando': 'waiting', 'perdida': 'lost', 'devuelta': 'refunded',
    'Vitrina': 'Showcase', 'Elegir skins': 'Choose skins', 'Vacío': 'Empty', 'Las 3 skins de tu inventario que enseñas a los demás.': 'The 3 skins from your inventory that you show to everyone.',
    'Guardar vitrina': 'Save showcase', 'Vitrina guardada': 'Showcase saved', 'Cargando tu inventario…': 'Loading your inventory…', 'La vitrina tiene sitio para 3 skins': 'The showcase has room for 3 skins',
    'No tienes skins todavía. Abre cajas en Cajas.': 'You have no skins yet. Open boxes in Boxes.',
    'Sala de trofeos': 'Trophy room', 'Permanente: lo que se gana aquí no se borra.': 'Permanent: what you win here is never erased.', 'Mayor premio': 'Biggest win',
    'Cuota más alta acertada': 'Highest odds hit', 'Todavía nadie': 'Nobody yet', 'Campeón de cada mes': 'Champion of each month', 'Bote y premios de la semana': 'Pot and prizes of the week',
    'Aún no ha acabado ningún mes con ganador.': 'No month has ended with a winner yet.', 'Aún no se ha repartido ninguno.': 'None handed out yet.', 'Ver menos': 'Show less',
    'Bote de la semana': 'Pot of the week', 'Más dinero de la semana': 'Most money of the week', 'Mejor ratio de la semana': 'Best ratio of the week',
    // Liga > Apostadores y el bote automatico (01-11, apostadores.js)
    'Apostadores': 'Bettors', 'Semana': 'Week', 'Mes': 'Month', 'Apostador': 'Bettor', 'Neto en apuestas': 'Net from bets', 'TÚ': 'YOU',
    'Va ganándolo': 'In the lead', 'Premios de la semana': 'Prizes of the week', 'Más dinero': 'Most money', 'el que más gane apostando': 'whoever wins the most betting',
    'Mejor apuesta': 'Best bet', 'la suelta acertada con la cuota más alta': 'the single won at the highest odds', 'la combinada acertada con la cuota más alta': 'the parlay won at the highest odds',
    'Nadie todavía': 'Nobody yet', 'Ver cómo se llenó': 'Watch it fill up', 'Toca para seguir': 'Tap to continue', 'Ver el bote': 'See the pot', 'fuera del bote': 'not in the pot',
    'Se lleva el bote si acaba así': 'Takes the pot if it ends like this', 'Premio al que más gane': 'Prize for the biggest winner', 'No tenía para poner en el bote': 'Did not have enough for the pot',
    'Premio a la mejor apuesta': 'Prize for the best bet', 'Tu semana': 'Your week', 'Tu mes': 'Your month', 'Tu historial': 'All time', 'Periodo': 'Period', 'Orden': 'Order',
    'Cómo se cuenta': 'How it counts', 'Solo apuestas en partidos': 'Only bets on matches',
    'Sueltas y combinadas ya resueltas: ganadas, perdidas o retiradas con cash out.': 'Settled singles and parlays: won, lost or cashed out.',
    'Dinero es lo cobrado menos lo apostado.': 'Money is what you collected minus what you staked.', 'Mejor cuota es tu suelta acertada con la cuota más alta.': 'Best odds is your single won at the highest odds.',
    'Aciertos, con 3 apuestas resueltas como mínimo. Una combinada cuenta como una.': 'Hit rate needs at least 3 settled bets. A parlay counts as one.',
    'Cajas, Crash, Cara o cruz, Blackjack y el mercado no cuentan.': 'Boxes, Crash, Coin flip, Blackjack and the market do not count.', 'La semana va de lunes a domingo, hora de España.': 'The week runs Monday to Sunday, Spanish time.',
    // mercado y extras 2: frases de la app nueva
    'Mercado': 'Market',
    // tarjeta en vivo nueva (30-10)
    'Vas con el empate': 'You back the draw', '▲ Ganando': '▲ Winning', '▼ Perdiendo': '▼ Losing',
    // panel de equipo nuevo (30-10)
    'Resumen': 'Overview', 'Partidos': 'Matches', 'Clasificación': 'Table', 'Palmarés': 'Honours', 'Ganancias': 'Earnings', 'Próximos': 'Upcoming', 'Últimos resultados': 'Latest results', 'Nada a la vista.': 'Nothing coming up.', 'Sin resultados.': 'No results.',
    'Equipo': 'Team', 'Balance': 'Record', 'Victorias': 'Win rate', 'Goles': 'Goals', 'Quién más ha ganado': 'Top earners', 'Volver': 'Back',
    // todas las apuestas con paginas (30-10)
    'Todas las apuestas': 'All bets', 'En vivo': 'Live', 'Devueltas': 'Refunded', 'Retiradas': 'Cashed out', 'RETIRADA': 'CASHED OUT', 'EN JUEGO': 'OPEN', 'Oculta hasta empezar': 'Hidden until kick-off', 'Nada con estos filtros.': 'Nothing with these filters.', 'Todavía nadie ha apostado.': 'Nobody has bet yet.',
    // todas las apuestas con paginas (30-10)
    'Todas las apuestas': 'All bets', 'En vivo': 'Live', 'Devueltas': 'Refunded', 'Retiradas': 'Cashed out', 'RETIRADA': 'CASHED OUT', 'EN JUEGO': 'OPEN', 'Oculta hasta empezar': 'Hidden until kick-off', 'Nada con estos filtros.': 'Nothing with these filters.', 'Todavía nadie ha apostado.': 'Nobody has bet yet.',
    // ranking de Juegos: tira de caras y duelo (modelo F, 01-11)
    'Ranking ·': 'Leaderboard ·', 'Tu posición': 'Your position', 'Delante': 'Ahead', 'detrás': 'behind', 'Detrás': 'Behind', 'Vais igualados': 'You are level',
    // retos: reto abierto, tarjeta de reto pendiente y doble confirmacion (retos.js) y ocultar ligas y juegos (ocultas.js), 01-11
    'Retar a un amigo o a cualquiera': 'Challenge a friend or anyone', 'Elige a quién retas y el resultado.': 'Pick who to challenge and a result.',
    'Un reto no se puede cancelar después.': 'A challenge cannot be cancelled afterwards.', 'Un reto no se puede cancelar': 'A challenge cannot be cancelled',
    'Entro con': 'I join with', 'reta a cualquiera': 'challenges anyone', 'Reta a cualquiera': 'Challenges anyone', 'Reta a cualquiera con': 'Challenges anyone with', 'Retas a cualquiera': 'You challenge anyone',
    'Abierto a todos': 'Open to everyone', 'Reto abierto': 'Open challenge', 'Reto para ti': 'Challenge for you', 'Retos para ti': 'Challenges for you', 'Retos que esperan': 'Challenges waiting',
    'Pone': 'Puts in', 'y va con': 'and backs', 'Luego': 'Later', 'Paso 1 de 2': 'Step 1 of 2', 'Paso 2 de 2': 'Step 2 of 2',
    '¿Seguro que quieres apostar aquí?': 'Are you sure you want to bet here?', 'Partido': 'Match', 'Tú vas con': 'You back', 'Rival': 'Opponent', 'Pones': 'You put in', 'Sí, seguir': 'Yes, continue',
    'Cuando entres, lo que pones se queda dentro y no puedes echarte atrás.': 'Once you join, what you put in stays in and you cannot back out.',
    'Cuando lo envíes, lo que pones se queda dentro y no puedes retirarlo.': 'Once you send it, what you put in stays in and you cannot take it back.',
    'Gana el que acierte y se lleva lo de los dos. Si el partido se anula, se devuelve a los dos.': 'Whoever gets it right wins and takes both stakes. If the match is called off, both get their stake back.',
    'Solo te lo devolvemos si nadie entra antes de que empiece el partido. Si entra alguien, gana el que acierte y se lleva lo de los dos.': 'You only get it back if nobody joins before the match starts. If someone joins, whoever gets it right takes both stakes.',
    'Solo te lo devolvemos si tu amigo lo rechaza o no contesta antes de que empiece el partido. Si acepta, gana el que acierte y se lleva lo de los dos.': 'You only get it back if your friend turns it down or does not answer before the match starts. If they accept, whoever gets it right takes both stakes.',
    'Entrar al reto': 'Join the challenge', 'Enviar reto': 'Send challenge', 'Reto abierto: puede entrar cualquiera': 'Open challenge: anyone can join', 'Has entrado en el reto': 'You joined the challenge',
    'Pon al menos 1': 'Put in at least 1', 'entra en tu reto': 'joins your challenge', 'Reto enviado a': 'Challenge sent to',
    'Qué ves': 'What you see', 'Se ve': 'Visible', 'Oculto': 'Hidden', 'Elegir ligas': 'Choose leagues', 'Ocultar la lista de ligas': 'Hide the list of leagues', 'Ocultar esta liga': 'Hide this league',
    'Se vuelve a mostrar desde Ajustes.': 'You can show it again in Settings.',
    'Lo que ocultes no sale en Partidos, Inicio ni Directo. Tus apuestas de ahí siguen en Mis apuestas. También puedes mantener pulsado el escudo de una liga en Partidos.': 'Whatever you hide does not show in Matches, Home or Live. Your bets there stay in My bets. You can also press and hold a league badge in Matches.',
    'Todavía no has jugado': 'You have not played yet', 'Todavía no has ganado ningún premio': 'You have not won a prize yet', '. Te falta eso para pasarle.': '. You need that much to pass them.',
    // la mesa de blackjack compartida (bjmesa.js, db/040)
    'Mesa abierta': 'Table open', 'Apuesta para empezar una mano': 'Bet to start a hand', 'Siéntate y apuesta para empezar una mano': 'Take a seat and bet to start a hand',
    'Se reparte al acabar la cuenta': 'Cards are dealt when the countdown ends', 'Repartiendo': 'Dealing', 'Tu turno': 'Your turn', 'Pide carta, plántate o dobla': 'Hit, stand or double',
    'Juega la banca': 'Dealer plays', 'Blackjack de la banca': 'Dealer blackjack', 'La banca se pasa': 'Dealer busts', 'Nueva mano en cuanto alguien apueste': 'New hand as soon as someone bets',
    'Gana': 'Wins', 'Pierde': 'Loses', 'Empata': 'Push', 'Se pasa': 'Bust', 'Ganas': 'You win', 'Pierdes': 'You lose', 'Te pasas': 'Bust', 'Te plantas': 'You stand',
    'Te plantas sin tiempo': 'Out of time, you stand', 'Te toca': 'Your move', 'Esperas tu turno': 'Waiting for your turn', 'Te devuelvo la apuesta': 'Bet returned',
    'Tu mano': 'Your hand', 'Mano en juego': 'Hand in play', 'Apuesta para la siguiente mano': 'Bet on the next hand', 'Siguiente mano': 'Next hand', 'Entras en esta mano': 'You join this hand',
    'Quitar apuesta': 'Take bet back', 'Pedir carta': 'Hit', 'La banca juega cuando acaben todos': 'The dealer plays when everyone is done', 'para decidir': 'to decide',
    'La mesa está llena': 'The table is full', 'Levantarse': 'Leave seat', 'Tus últimas manos': 'Your last hands', 'Todavía no has jugado en la mesa': 'You have not played at the table yet',
    'de 7 asientos': 'of 7 seats', 'Blackjack paga 3 a 2 · La banca se planta en 17': 'Blackjack pays 3 to 2 · Dealer stands on 17',
    'La mesa aún no está en la base: falta cargar db/040': 'The table is not in the database yet: db/040 still has to be loaded',
    'Ese asiento no existe': 'That seat does not exist', 'Ese asiento ya está ocupado': 'That seat is taken', 'La mesa está llena: espera a que se levante alguien': 'The table is full: wait for someone to leave',
    'Espera a que acabe la mano para cambiar de asiento': 'Wait for the hand to end to change seats', 'Espera a la siguiente mano': 'Wait for the next hand', 'Ya has apostado en esta mano': 'You already bet on this hand',
    'Ya se ha repartido: la apuesta sigue en juego': 'Cards are out: your bet stays in play', 'No tienes apuesta en esta mano': 'You have no bet on this hand', 'No hay ninguna mano en juego': 'No hand in play',
    'No juegas en esta mano': 'You are not in this hand', 'No es tu turno': 'It is not your turn',
    'Blackjack: apuesta retirada': 'Blackjack: bet taken back', 'Blackjack: mano devuelta al abrir la mesa': 'Blackjack: hand refunded when the table opened',
    // Quien esta dentro, retos y patas (quien.js, 01-11)
    'Quién está dentro': 'Who is in', 'Reto': 'Challenge', 'Reto 1 contra 1': '1 vs 1 challenge', 'cada uno': 'each', 'en juego': 'at stake', 'Apuesta oculta': 'Hidden bet', 'Esperando a que entre alguien': 'Waiting for someone to join',
    'Sin cancelar · se paga al final': 'No cancelling · paid at the end', 'en juego · se lo lleva quien acierte': 'at stake · winner takes all', 'Va ganando': 'Winning', 'Nadie ha apostado a este partido.': 'Nobody has bet on this match.',
    // ruleta global de la semana, tu ruleta cada 3 dias y saldos en negativo (db/047, ruleta-global.js)
    'Ruleta global de la semana': 'Weekly global wheel', 'Ruleta global de la semana pasada': 'Last week\u2019s global wheel', 'Ruleta global': 'Global wheel',
    'Le ha tocado a': 'It went to', '¡Te ha tocado a ti!': 'You won it!', 'Ruleta de premios': 'Prize wheel', 'Tu ruleta · cada 3 días': 'Your wheel · every 3 days',
    'Tu premio de esta tirada': 'Your prize this spin', 'gira la ruleta': 'spins the wheel',
    'De 25 a 400 V-Bucks o una caja de CS2 para abrirla tú. Una tirada cada 3 días.': 'From 25 to 400 V-Bucks or a CS2 box to open yourself. One spin every 3 days.',
    'Estás en negativo (': 'You are below zero (', '): no puedes apostar hasta volver a tener saldo. La paga del lunes llega sola.': '): you cannot bet until you have a balance again. Monday pay comes in by itself.',
    'No te queda saldo para apostar. La paga del lunes llega sola.': 'You have no balance left to bet. Monday pay comes in by itself.',
  };
  const DIAS = { LUN: 'MON', 'MIÉ': 'WED', JUE: 'THU', VIE: 'FRI', 'SÁB': 'SAT', DOM: 'SUN', HOY: 'TODAY', ENE: 'JAN', ABR: 'APR', AGO: 'AUG', DIC: 'DEC' };
  const MESES = { ene: 'jan', feb: 'feb', mar: 'mar', abr: 'apr', may: 'may', jun: 'jun', jul: 'jul', ago: 'aug', sep: 'sep', sept: 'sep', oct: 'oct', nov: 'nov', dic: 'dec' };
  const R = [
    [/^(\d+) mensajes nuevos$/, '$1 new messages'],
    [/^Te faltan ([\d.]+)$/, 'You need $1 more'],
    [/^(\d+) amigos?$/, (m, n) => `${n} ${n === '1' ? 'friend' : 'friends'}`], [/^Esperando a que (.+) acepte$/, 'Waiting for $1 to accept'],   // quien.js (01-11)
    [/^Pones ([\d.]+)\. El primero que entre se lo queda y hay ([\d.]+) en juego\. Si nadie entra antes de empezar, te lo devolvemos\.$/, 'You put in $1. The first to join takes it and $2 is at stake. If nobody joins before the match starts, you get it back.'], [/^Pones ([\d.]+)\. Si (.+) acepta, hay ([\d.]+) en juego\.$/, 'You put in $1. If $2 accepts, $3 is at stake.'],
    [/^(\d+) resueltas?$/, (m, n) => `${n} settled`], [/^(\d+) en vivo$/, '$1 live'],   // Mis apuestas (01-11)
    // la mesa de blackjack (bjmesa.js)
    [/^Turno de (.+)$/, 'Turn: $1'], [/^La banca tiene (\d+)$/, 'Dealer has $1'], [/^Asiento (\d)$/, 'Seat $1'],
    [/^(\d+) en directo$/, '$1 live'], [/^Reto 1 contra 1 · Contra (.+)$/, 'Challenge · against $1'], [/^Reto 1 contra 1 · Esperando a que entre alguien$/, 'Challenge · waiting for someone to join'], [/^Reto 1 contra 1 · Esperando a que (.+) acepte$/, 'Challenge · waiting for $1 to accept'], [/^Empate: Tú$/, 'Draw: You'], [/^Empate: (.+)$/, 'Draw: $1'],   // menu A (01-11): la tira de directo de movil
    [/^(\d+) resultados?$/, (m, n) => `${n} result${n === '1' ? '' : 's'}`],   // Ya jugados B (01-11)
    // Apuestas de todos (01-11, todos.js)
    [/^Los (\d+)$/, 'All $1'], [/^(\d+) apuestas?$/, (m, n) => `${n} bet${n === '1' ? '' : 's'}`], [/^(\d+) de (\d+) acertadas$/, '$1 of $2 won'], [/^(\d+) de (\d+) en vivo$/, '$1 of $2 live'],
    [/^([\d.]+) cada uno$/, '$1 each'], [/^pierde ([\d.]+)$/, 'loses $1'], [/^(\d+) cobradas?$/, '$1 won'], [/^(\d+) te esperan?$/, '$1 waiting for you'],
    // Inicio (01-11): van primero porque son frases enteras de un nodo
    [/^desde las ([\d:]+)$/, 'since $1'], [/^desde el (\d+) ([a-z]+)$/, (m, d, mo) => `since ${d} ${MESES[mo] || mo}`],
    [/^mañana ([\d:]+)$/, 'tomorrow $1'], [/^hace (\d+) min$/, '$1 min ago'], [/^hace (\d+) h$/, '$1 h ago'], [/^en vivo\b/, 'live'],
    [/^(\d+) resultados? nuevos?$/, (m, n) => `${n} new result${n === '1' ? '' : 's'}`],
    [/^\d+ (ganadas?|perdidas?|devueltas?)( · \d+ (ganadas?|perdidas?|devueltas?))*$/, (m) => m.replace(/(\d+) (ganadas?|perdidas?|devueltas?)/g, (x, n, w) => `${n} ${/^g/.test(w) ? 'won' : /^p/.test(w) ? 'lost' : 'refunded'}`)],
    [/^cobraría ([\d.]+)$/, 'would get $1'], [/^· ([\d.]+) a ([\d.]+)$/, '· $1 at $2'],
    [/^· contra (.+)$/, '· against $1'], [/^contra (.+)$/, 'against $1'], [/^cobró ([\d.]+) a ×([\d.,]+)$/, 'cashed $1 at ×$2'],
    [/^combinada de (\d+)$/, 'parlay of $1'], [/^una combinada de (\d+)$/, 'a parlay of $1'], [/^y (\d+) más en juego$/, 'and $1 more in play'],
    [/\bMinuto (?=\d)/g, 'Minute '], [/ · Descanso$/, ' · Half time'], [/\bmié(?= \d)/g, 'wed'],
    [/(^|\s)(\d{1,2}) (ene|abr|ago|dic)(?=$| \d)/g, (m, s, d, mo) => `${s}${d} ${MESES[mo]}`],
    // boleto multiple (boleto.js, 30-10)
    [/^Apostar las (\d+)$/, 'Bet all $1'], [/^Apostando (\d+) de (\d+)…$/, 'Placing $1 of $2…'], [/^Han entrado las (\d+)$/, 'All $1 placed'], [/^Han entrado (\d+) de (\d+)$/, '$1 of $2 placed'],
    [/^La cuota mejorada admite hasta ([\d.]+) por jugador en este partido y te quedan ([\d.]+)$/, 'Boosted odds allow up to $1 per player on this match and you have $2 left'],

    [/^Final ([\d:]+)\. Ya se ha pagado\.$/, 'Final $1. Already paid.'],
    [/^Ver más \((\d+)\)$/, 'See more ($1)'],
    // juegos (30-10)
    [/^Apostar ([\d.]+)$/, 'Bet $1'], [/^Retirar ×([\d.,]+)$/, 'Cash out ×$1'],
    [/^([\d.]+) dentro$/, '$1 in'], [/^sale en ×([\d.,]+)$/, 'exits at ×$1'],
    [/^Has cobrado ([\d.]+)$/, 'You cashed $1'], [/^Explotó en ×([\d.,]+)/, 'Crashed at ×$1'], [/ · cobraste ([\d.]+)$/, ' · you cashed $1'], [/ · perdiste ([\d.]+)$/, ' · you lost $1'],
    [/^Retirado a ×([\d.,]+) · \+([\d.]+)$/, 'Cashed out at ×$1 · +$2'], [/^Tarde: explotó en ×([\d.,]+)$/, 'Too late: it crashed at ×$1'],
    [/^Reto lanzado por ([\d.]+)$/, 'Challenge sent for $1'], [/^Reto retirado: te devuelvo ([\d.]+)$/, 'Challenge withdrawn: your $1 is back'],
    [/^No tienes tanto: te quedan ([\d.]+)$/, 'You do not have that much: you have $1 left'],
    [/^No tienes saldo suficiente: te quedan ([\d.]+)$/, 'Not enough balance: you have $1 left'],
    [/^Salió (cara|cruz)\. Ganas ([\d.]+)$/, 'It came up $1. You win $2'], [/^Salió (cara|cruz)\. Pierdes ([\d.]+)$/, 'It came up $1. You lose $2'],
    [/^Salió (cara|cruz)\. (.+) aceptó y ganas ([\d.]+)$/, 'It came up $1. $2 accepted and you win $3'], [/^Salió (cara|cruz)\. (.+) aceptó y pierdes ([\d.]+)$/, 'It came up $1. $2 accepted and you lose $3'],
    [/^It came up cara/, 'It came up heads'], [/^It came up cruz/, 'It came up tails'],
    [/^te reta, va a cara$/, 'challenges you, goes for heads'], [/^te reta, va a cruz$/, 'challenges you, goes for tails'], [/^va a cara$/, 'goes for heads'], [/^va a cruz$/, 'goes for tails'],
    [/^le gana a (.+) · (cara|cruz)$/, 'beats $1 · $2'], [/^le ganas a (.+) · (cara|cruz)$/, 'you beat $1 · $2'], [/^(beats|you beat) (.+) · cara$/, '$1 $2 · heads'], [/^(beats|you beat) (.+) · cruz$/, '$1 $2 · tails'], [/^beats ti · /, 'beats you · '],
    [/^Ganas ▲ ([\d.]+)$/, 'You win ▲ $1'], [/^Te pasas · ▼ ([\d.]+)$/, 'Bust · ▼ $1'], [/^Pierdes ▼ ([\d.]+)$/, 'You lose ▼ $1'],
    [/^(\d+)º$/, '$1th'],
    [/×(\d+),(\d\d)/g, '×$1.$2'],   // decimales con punto (juegos.js ya los pinta con punto en ingles; esta regla solo es por si acaso): va el ultimo
    // mas tipos de apuesta (db/036, 01-11): lo que escribe la base en el monedero y en el chat (la app ya los pinta en ingles)
    [/Más de (\d+),5 goles/g, 'Over $1.5 goals'], [/Menos de (\d+),5 goles/g, 'Under $1.5 goals'], [/Más de (\d+),5 mapas/g, 'Over $1.5 maps'], [/Menos de (\d+),5 mapas/g, 'Under $1.5 maps'],
    [/ \+(\d+),5 mapas/g, ' +$1.5 maps'], [/Ambos marcan: sí/g, 'Both teams score: yes'], [/Ambos marcan: no/g, 'Both teams score: no'],
    [/ en (.+ vs .+) no tiene resultado de los 90 minutos$/, ' in $1 has no 90 minute result'], [/ en (.+ vs .+) no tiene una serie completa$/, ' in $1 was not a full series'],
    [/^Una combinada lleva un solo pronóstico por partido$/, 'A parlay takes one pick per match'],
    // mapas sueltos (db/037): 'Mapa 2: FaZe' en el monedero y el chat, y el mapa que no se jugo (va antes que ' no se ha jugado')
    [/\bMapa (\d): /g, 'Map $1: '], [/ en (.+ vs .+) no se ha jugado$/, ' in $1 was not played'],
    // mercado (30-10)
    [/^Pides a (.+)$/, 'You ask $1 for'], [/^Lo que pides a (.+)$/, 'What you ask $1 for'], [/^(.+) te propone$/, '$1 offers you a trade'], [/^Le propones a (.+)$/, 'You offer $1 a trade'], [/^Tú a (.+)$/, 'You to $1'], [/^(.+) a ti$/, '$1 to you'],
    [/^Trato propuesto a (.+)$/, 'Trade offered to $1'], [/^A la venta por ([\d.]+)$/, 'For sale at $1'], [/^Comprado por ([\d.]+)$/, 'Bought for $1'],
    [/^(.+) compró$/, '$1 bought'], [/^a (.+) por$/, 'from $1 for'],
    [/^Todas · (\d+)$/, 'All · $1'], [/^(\d+) de (\d+) elegidas ·$/, '$1 of $2 selected ·'], [/^(\d+) de 10 ·$/, '$1 of 10 ·'], [/^· metes$/, '· you put in'], [/^(\d+) de 10 · (.+) →$/, (m, n, r) => `${n} of 10 · ${D[r] || r} →`],
    [/^10 más baratas · (.+?)(?: \((.+)\))?$/, (m, r, f) => `10 cheapest · ${D[r] || r}${f ? ' (' + ({ 'skins de CS2': 'CS2 skins', 'objetos de lujo': 'luxury items', 'cosméticos': 'cosmetics' }[f] || f) + ')' : ''}`],
    [/^Tú metes \(ya llevas ([\d.]+)\)$/, 'You put in (you already have $1)'], [/^Entrar con ([\d.]+)$/, 'Join with $1'], [/^(.+) gana$/, '$1 wins'], [/^(.+) se lleva ([\d.]+)$/, '$1 takes $2'],
    [/^· te llevas ([\d.]+)$/, '· you take $1'], [/^Jackpot · (.+) se lleva ([\d.]+)$/, 'Jackpot · $1 takes $2'], [/^Como mucho (\d+) piezas$/, 'At most $1 items'], [/^frente a lo que metiste$/, 'compared with what you put in'], [/^Eso no es un (marco|fondo)$/, 'That is not a $1'],
    [/\b(LUN|MIÉ|JUE|VIE|SÁB|DOM|HOY|ENE|ABR|AGO|DIC)\b/g, (m) => DIAS[m]],
    [/\bMAR(?= \d)/g, 'TUE'],
    [/\b(lun|mar|mié|jue|vie|sáb|dom)\b(?= \d)/g, (m) => ({ lun: 'mon', mar: 'tue', 'mié': 'wed', jue: 'thu', vie: 'fri', 'sáb': 'sat', dom: 'sun' }[m])],
    [/\bayer\b/g, 'yesterday'], [/\bhoy\b/g, 'today'],
    [/^(\d+) partidos?$/, (m, n) => `${n} match${n === '1' ? '' : 'es'}`],
    [/empieza en /g, 'starts in '], [/^En vivo/, 'Live'], [/en mapas/g, 'on maps'], [/\ben juego\b/g, 'in play'],
    [/^\+([\d.]+) el lunes ·$/, '+$1 on Monday ·'], [/^\+([\d.]+) V-Bucks el lunes ·$/, '+$1 V-Bucks on Monday ·'], [/(\d+)º de (\d+)/g, '#$1 of $2'], [/^Apostar ([\d.]+)$/, 'Bet $1'], [/^([\d.]+) limpias$/, '$1 profit'],
    [/^(\d+) apuestas abiertas$/, '$1 open bets'], [/^(\d+) apuestas en total$/, '$1 bets in total'], [/^(\d+) premios$/, '$1 wins'],
    [/^(\d+) de (\d+) resueltas$/, '$1 of $2 settled'], [/^(\d+) de (\d+)$/, '$1 of $2'], [/^(\d+) se pueden cancelar todavía$/, '$1 can still be cancelled'],
    [/^(\d+) abiertos$/, '$1 open'], [/^Próximas · (\d+)$/, 'Upcoming · $1'], [/racha/g, 'streak'], [/^hasta las (.+)$/, 'until $1'],
    [/se ve a las ([\d:]+)/g, 'shown at $1'], [/aún no ha apostado/g, 'has not bet yet'],
    [/^Temporada · desde el (.+) · (\d+) jugadores$/, 'Season · since $1 · $2 players'], [/^Paga de \+([\d.]+) a cada uno en$/, 'Payday +$1 for each in'],
    [/^Te faltan ([\d.]+) para alcanzar a (.+)$/, 'You need $1 to catch $2'], [/ · le sacas ([\d.]+) a (.+)$/, ' · you lead $2 by $1'], [/^le sacas ([\d.]+) a (.+)$/, 'you lead $2 by $1'],
    [/^(\d+) lunes · (\d+) jugadores$/, '$1 Mondays · $2 players'], [/^(\d+) de (\d+) resueltas$/, '$1 of $2 settled'],
    [/^SEM (\d+)$/, 'WK $1'], [/^SEM (\d+) · AHORA$/, 'WK $1 · NOW'], [/^repartido ([\d.]+)$/, 'handed out $1'], [/^PAGA \+([\d.]+)$/, 'PAYDAY +$1'],
    [/^Semana (\d+)$/, 'Week $1'], [/apostados/g, 'staked'], [/\bpor semana\b/g, 'a week'],
    [/^(\d+)º de (\d+)$/, '#$1 of $2'], [/^(\d+)º · /, '#$1 · '], [/^fuerte en$/, 'strong at'], [/^desde el$/, 'since the'],
    [/^Solo (.+) puede cambiar su foto, su apodo y su frase\.$/, 'Only $1 can change their photo, nickname and line.'],
    [/^Paga del lunes: \+([\d.]+) para cada uno$/, 'Monday payday: +$1 for each'], [/^Resumen de la semana: /, 'Week summary: '],
    [/ ganó /g, ' won '], [/ perdió /g, ' lost '], [/ recupera /g, ' gets back '], [/ con /g, ' with '], [/^Empieza (.+?)\. Apuestas: /, 'Kick-off: $1. Bets: '],
    [/ reta a /g, ' challenges '], [/ acepta el reto de /g, ' accepts the challenge from '], [/ en juego$/, ' in play'], [/ contra /g, ' against '],
    [/ no se ha jugado$/, ' was not played'], [/· apuesta del día/g, '· bet of the day'], [/ · si aciertas cobras ×/, ' · win and get ×'],
    [/ · el extra lo enciende PM/, ' · PM turns the bonus on'], [/^Con extra ×/, 'With bonus ×'],
    [/^Apostado ([\d.]+) a (.+)$/, 'Bet $1 on $2'], [/^Cancelada: te devuelvo ([\d.]+)$/, 'Cancelled: $1 back to you'], [/^Reto enviado a (.+)$/, 'Challenge sent to $1'],
    [/^Reto retirado: te devuelvo lo puesto$/, 'Challenge withdrawn: your stake is back'], [/^Enviar reto de ([\d.]+)$/, 'Send a $1 challenge'],
    [/^(\d+) ligas? ocultas?$/, (m, n) => `${n} hidden ${n === '1' ? 'league' : 'leagues'}`], [/^Ocultar todo (.+)$/, (m, s) => 'Hide all ' + (s === 'Fútbol' ? 'Football' : s)],
    [/^Pones ([\d.]+)\. Si (.+) acepta, hay ([\d.]+) en juego\.$/, 'You put in $1. If $2 accepts, $3 is at stake.'], [/^Acepto (.+)$/, 'I take $1'],
    [/^Gana (.+)$/, '$1 wins'], [/ · reta a /g, ' · challenges '], [/^cuota$/, 'odds'], [/gana · cuota/g, 'win · odds'], [/empate · cuota/g, 'draw · odds'],
    [/^Paga del lunes /, 'Monday payday '], [/ · se acumula$/, ' · it adds up'], [/^Cancelada: /, 'Cancelled: '], [/^Anulado: /, 'Void: '],
    [/^Cada lunes a las 00:00 entran ([\d.]+) a cada uno\. No se compran ni se ganan de otra forma\.$/, 'Every Monday at 00:00 each of you gets $1. They cannot be bought or earned any other way.'],
    [/^Cierra al empezar el partido\. Las elecciones de todos se ven siempre\.$/, 'Betting closes at kick-off. Everyone\'s picks are always visible.'],
    [/^Cierra al empezar el partido\. Las elecciones de todos se ven al empezar\.$/, 'Betting closes at kick-off. Everyone\'s picks show at kick-off.'],
    [/^Gana (\d) con/, 'Win $1 with'], [/^([\d.]+) V-Bucks cada día, reclamándolos$/, '$1 V-Bucks every day, if you claim them'], [/^Retar por (.+)$/, 'Challenge for $1'], [/^Apostar ([\d.]+)$/, 'Bet $1'], [/^Apostar ([\d.]+) a (rojo|negro|verde)$/, 'Bet $1 on $2'], [/^Repartir por (.+)$/, 'Deal for $1'], [/^Otra mano por (.+)$/, 'Another hand for $1'], [/^Soltar bola por (.+)$/, 'Drop ball for $1'], [/^Has cobrado (.+)$/, 'You collected $1'], [/^Ganas ▲ (.+)$/, 'You win ▲ $1'], [/^Pierdes ▼ (.+)$/, 'You lose ▼ $1'], [/^Te pasas · ▼ (.+)$/, 'Bust · ▼ $1'], [/^Mapa (\d+)$/, 'Map $1'], [/^En directo · (\d+)$/, 'Live · $1'], [/^(\d+) movimientos?$/, '$1 moves'], [/^Contra (.+)$/, 'Against $1'], [/^Caja gratis: (.+)$/, 'Free box: $1'], [/^Ronda (\d+)$/, 'Round $1'], [/^Otras (\d) por$/, 'Again ×$1 for'], [/^(\d+) skins$/, '$1 skins'], [/^Elegir las de menos de (\d+)$/, 'Select the ones under $1'], [/^Tienes ([\d.]+)\. La paga del lunes llega sola\.$/, 'You have $1. The Monday payday arrives by itself.'], [/^Batalla (1v1|2v2)$/, 'Battle $1'], [/^Ganan (.+) y (.+)$/, '$1 and $2 win'], [/^Gana (.+)$/, '$1 wins'], [/^contra ([\d.]+) · se llevan? las (\d+) skins$/, 'against $1 · takes all $2 skins'], [/^Esperando a 1 jugador\. Se abre sola al llenarse\.$/, 'Waiting for 1 player. It opens by itself when full.'], [/^Esperando a (\d) jugadores\. Se abre sola al llenarse\.$/, 'Waiting for $1 players. It opens by itself when full.'], [/^Vendidas? (\d* ?)por/, 'Sold $1for'], [/^Te devuelvo/, 'Refunded'], [/ abre una batalla (1v1|2v2) de (\d+) cajas? por ([\d.]+)\. Únete en Cajas$/, ' opens a $1 battle of $2 boxes for $3. Join in Boxes'], [/^Batalla (1v1|2v2) lista: (.+) contra (.+)\. Mírala en Cajas$/, '$1 battle ready: $2 vs $3. Watch it in Boxes'], [/^Reclamar ([\d.]+)( de hoy)?$/, 'Claim $1'], [/^Pedir rescate de ([\d.]+)$/, 'Ask for $1 rescue'], [/^Opción (\d)( \(si quieres\))?$/, 'Option $1'], [/^(\d+) votos?( · .+)?$/, '$1 votes'], [/^Acertada ▲ (.+)$/, 'Won ▲ $1'], [/^Fallada ▼ (.+)$/, 'Lost ▼ $1'], [/^Verlo en directo · (.+?)( en .+)?$/, 'Watch live · $1'], [/^Dónde verlo · (.+?)( en .+)?$/, 'Where to watch · $1'], [/^Ver las (\d+)$/, 'See all $1'], [/^(\d+) apuestas · (\d+) ganadas · (\d+) perdidas · (.) (.+) en total$/, '$1 bets · $2 won · $3 lost · $4 $5 overall'], [/ apostados$/, ' staked'], [/^Grabando (\d+:\d+)$/, 'Recording $1'], [/^Últimos (\d+)$/, 'Last $1'], [/^(\d+) ganados$/, '$1 won'], [/^(\d+) perdidos$/, '$1 lost'], [/ años$/, ' y/o'], [/^← (.+) vs (.+)$/, '← $1 vs $2'], [/^(\d+) apuestas · toca una para ver el partido\.$/, '$1 bets · tap one to open the match.'],
    // mis apuestas nueva (30-10)
    [/^(\d+) apuestas? abiertas?/, (m, n) => `${n} open bet${n === '1' ? '' : 's'}`], [/ · (\d+) en vivo$/, ' · $1 live'], [/^si aciertas todo · (.) ([\d.]+) limpias$/, 'if everything wins · $1 $2 clear'],
    [/^ROI (.+) · (\d+) resueltas?$/, 'ROI $1 · $2 settled'], [/^(\d+) resueltas?$/, '$1 settled'], [/^cobradas ([\d.]+)$/, 'paid $1'],
    // cajas (CAJAS-I18N.md, 30-10) y subtitulo de Juegos
    [/^(\d+) objetos$/, '$1 items'], [/^(\d+) rondas$/, '$1 rounds'], [/^(\d+) de 10$/, '$1 of 10'], [/^bote de ([\d.]+)$/, 'pot of $1'],
    [/^Inventario de (.+)$/, "$1's inventory"], [/^Elegir las (\d+)$/, 'Select all $1'], [/^Ver los (\d+)$/, 'See all $1'], [/^Ver (\d+) más$/, 'Show $1 more'],
    // recompensas y ruleta nuevas (30-10)
    [/^([\d.]+) V-Bucks cada día que lo reclames$/, '$1 V-Bucks every day you claim them'], [/^([\d.]+) cada uno, de lunes a miércoles · se lo lleva quien más gane$/, '$1 each, Monday to Wednesday · the biggest winner takes it'],
    [/^(\d+) dentro$/, '$1 in'], [/^La siguiente tirada, el lunes · en (.+)$/, 'Next spin on Monday · in $1'], [/: la tienes en Cajas › Inventario$/, ': it is in Boxes › Inventory'],
    // mis apuestas estilo boleto (30-10)
    [/^última · (\d+) apuestas$/, 'last · $1 bets'],
    // en linea y premios por tiempo (30-10)
    [/^En línea ahora · (\d+)$/, 'Online now · $1'], [/^faltan (\d.*)$/, '$1 to go'], [/ por tu tiempo en la app$/, ' for your time in the app'],
    // chat y feed (30-10)
    [/^apuesta ([\d.]+) a$/, 'bets $1 on'], [/^ha apostado ([\d.]+)$/, 'has bet $1'], [/^abre (\d+) cajas$/, 'opens $1 boxes'], [/^· ([\d.]+) · en total ([\d.]+)$/, '· $1 · $2 in total'],
    [/^Batalla (1v1|2v2) · ([\d.]+) (?:contra|against) ([\d.]+) · (\d+) cajas?$/, 'Battle $1 · $2 vs $3 · $4 boxes'],
    // juegos (JUEGOS-INTEGRAR.md, las que faltaban)
    [/^Retirar ×([\d,]+)$/, 'Cash out ×$1'], [/^([\d.]+) dentro$/, '$1 in'], [/^sale en ×([\d,]+)$/, 'exits at ×$1'],
    [/^Has cobrado ([\d.]+)$/, 'You cashed $1'], [/^Explotó en ×([\d,]+)/, 'Crashed at ×$1'], [/ · cobraste ([\d.]+)$/, ' · you cashed $1'],
    [/ · perdiste ([\d.]+)$/, ' · you lost $1'], [/^Retirado a ×([\d,]+) · \+([\d.]+)$/, 'Cashed out at ×$1 · +$2'], [/^Tarde: explotó en ×([\d,]+)$/, 'Too late: it crashed at ×$1'],
    [/^Reto lanzado por ([\d.]+)$/, 'Challenge sent for $1'], [/^Reto retirado: te devuelvo ([\d.]+)$/, 'Challenge withdrawn: your $1 is back'], [/^No tienes tanto: te quedan ([\d.]+)$/, 'You do not have that much: you have $1 left'],
    [/^No tienes saldo suficiente: te quedan ([\d.]+)$/, 'Not enough balance: you have $1 left'], [/^Salió (cara|cruz)\. Ganas ([\d.]+)$/, 'It came up $1. You win $2'], [/^Salió (cara|cruz)\. Pierdes ([\d.]+)$/, 'It came up $1. You lose $2'],
    [/^Salió (cara|cruz)\. (.+) aceptó y ganas ([\d.]+)$/, 'It came up $1. $2 accepted and you win $3'], [/^Salió (cara|cruz)\. (.+) aceptó y pierdes ([\d.]+)$/, 'It came up $1. $2 accepted and you lose $3'], [/^It came up cara/, 'It came up heads'],
    [/^It came up cruz/, 'It came up tails'], [/^te reta, va a cara$/, 'challenges you, goes for heads'], [/^te reta, va a cruz$/, 'challenges you, goes for tails'],
    [/^va a cara$/, 'goes for heads'], [/^va a cruz$/, 'goes for tails'], [/^le gana a (.+) · (cara|cruz)$/, 'beats $1 · $2'],
    [/^le ganas a (.+) · (cara|cruz)$/, 'you beat $1 · $2'], [/^(beats|you beat) (.+) · cara$/, '$1 $2 · heads'], [/^(beats|you beat) (.+) · cruz$/, '$1 $2 · tails'],
    [/^beats ti · /, 'beats you · '], [/^Ganas ▲ ([\d.]+)$/, 'You win ▲ $1'], [/^Te pasas · ▼ ([\d.]+)$/, 'Bust · ▼ $1'],
    [/^Pierdes ▼ ([\d.]+)$/, 'You lose ▼ $1'], [/^Hoy solo puedes arriesgar ([\d.]+) más en el blackjack$/, 'Today you can only risk $1 more in blackjack'], [/^Hoy ya has perdido 500 en el blackjack\. Vuelve mañana$/, 'You have already lost 500 today in blackjack. Come back tomorrow'],
    // repaso del ingles en todas las pantallas (30-10)
    [/^Perfil de (.+)$/, "$1's profile"], [/^Apuesta del día: se cobra ×(.+)$/, 'Bet of the day: pays ×$1'], [/^Ronda of (\d+)$/, 'Round of $1'], [/^EN VIVO\b/, 'LIVE'],
    [/ · sin resueltas$/, ' · none settled'], [/ · (\d+%) aciertos$/, ' · $1 hit rate'], [/^(\d+) apuestas? · (\d+) partidos?$/, (m, a, b) => `${a} bet${a === '1' ? '' : 's'} · ${b} match${b === '1' ? '' : 'es'}`],
    [/ · (\d+) apuestas?$/, (m, n) => ` · ${n} bet${n === '1' ? '' : 's'}`], [/ · faltan (.+)$/, ' · $1 left'],
    [/^a cada uno en (.+)$/, 'each, in $1'], [/^para alcanzar a (.+?) · le sacas$/, 'to catch $1 · you lead'], [/^para alcanzar a (.+)$/, 'to catch $1'],
    [/^cada lunes ([\d.]+) cada uno · se lo lleva el que más gane$/, 'every Monday $1 each · the biggest winner takes it'],
    [/^Empieza el lunes (.+?): ese día cada uno pone ([\d.]+) y el que más gane en la semana se lleva todo\.$/, 'Starts Monday $1: that day each of you puts in $2 and the biggest winner of the week takes it all.'],
    [/ · semana (\d+) · /, ' · week $1 · '], [/^(.+) pone el (\d+)% de lo que apuesta en (.+)$/, (m, a, p, s) => `${a} puts ${p}% of their stakes on ${s === 'Fútbol' ? 'Football' : s}`],
    [/^(\d+) batallas? ganadas?$/, (m, n) => `${n} battle${n === '1' ? '' : 's'} won`], [/^le gana a ti · (cara|cruz)$/, (m, c) => `beats you · ${c === 'cara' ? 'heads' : 'tails'}`],
    [/^Explotó en (×[\d,]+) · cobraste ([\d.]+)$/, 'Crashed at $1 · you cashed $2'],
    [/ challenges (quien quiera|.+?) a cara o cruz por ([\d.]+) \(él va a (cara|cruz)\)$/, (m, w, n, c) => ` challenges ${w === 'quien quiera' ? 'anyone' : w} to a coin flip for ${n} (they pick ${c === 'cara' ? 'heads' : 'tails'})`],
    [/^Cara o cruz: salió (cara|cruz) y (.+) gana ([\d.]+) a (.+)$/, (m, c, a, n, b) => `Coin flip: it came up ${c === 'cara' ? 'heads' : 'tails'} and ${a} wins ${n} from ${b}`],
    [/^(.+) ganó$/, '$1 won'], [/^en (blackjack|crash|plinko|moneda|ruleta) \((×[\d,]+)\)$/, 'at $1 ($2)'], [/^Bote de la semana: (.+) se lleva ([\d.]+)$/, 'Weekly pot: $1 takes $2'], [/^Premios de la semana: /, 'Weekly awards: '],
    [/^Tiempo en la app: (\d+) min$/, 'Time in the app: $1 min'], [/^Batalla (1v1|2v2) #(\d+)$/, 'Battle $1 #$2'],
    [/^de (\d+)$/, 'of $1'], [/^(\d+) de (\d+) · (\d+)%$/, '$1 of $2 · $3%'], [/^(\d)º$/, (m, n) => n + (n === '1' ? 'st' : n === '2' ? 'nd' : n === '3' ? 'rd' : 'th')],
    [/^Marcador en directo · (.*)$/, 'Live score · $1'], [/ · cada (\d+) s$/, ' · every $1 s'], [/^Mapa (\d+) · (.+)$/, 'Map $1 · $2'],
    [/^acabado · gana (.+?)( · |$)/, 'finished · $1 wins$2'], [/^EMPEZANDO\b/, 'STARTING'], [/^EN JUEGO · /, 'LIVE · '], [/^pendiente\b/, 'pending'], [/ · pick de (.+)$/, ' · picked by $1'],
    [/ · ronda a ronda( \(acabado\))?$/, (m, f) => ' · round by round' + (f ? ' (finished)' : '')], [/^Ronda (\d+) · /, 'Round $1 · '], [/^queda (.+)$/, 'decider $1'], [/^En directo · (.+)$/, 'Live · $1'],
    [/^por ([A-ZÁÉÍÓÚ].*)$/, 'for $1'], [/^asistencia de (.+)$/, 'assist by $1'],
    [/ · (inglés|español|portugués|francés|alemán|ruso|chino|japonés|coreano|turco|polaco|italiano|árabe|tailandés|vietnamita)( ↗)?$/, (m, l, f) => ' · ' + ({ inglés: 'English', español: 'Spanish', portugués: 'Portuguese', francés: 'French', alemán: 'German', ruso: 'Russian', chino: 'Chinese', japonés: 'Japanese', coreano: 'Korean', turco: 'Turkish', polaco: 'Polish', italiano: 'Italian', árabe: 'Arabic', tailandés: 'Thai', vietnamita: 'Vietnamese' }[l]) + (f || '')],
    // repaso del ingles: notas del monedero y cajas nuevas (30-10)
    [/^(Blackjack|Crash): (apuesta|doblar|empate|ganas)$/, (m, g, r) => `${g}: ${{ apuesta: 'bet', doblar: 'double', empate: 'push', ganas: 'you win' }[r]}`], [/ \(retirada automática\)$/, ' (auto cash out)'],
    [/^Cara o cruz contra (.+)$/, 'Coin flip against $1'], [/^Cara o cruz: ganas contra (.+)$/, 'Coin flip: you win against $1'], [/^Cara o cruz: reto a (.+)$/, 'Coin flip: challenge to $1'],
    [/^Plinko: riesgo (.+)$/, 'Plinko: $1 risk'], [/^Ruleta: salió (.+)$/, 'Roulette: $1 came up'], [/^Ruleta: /, 'Roulette: '],
    [/^Reto a (.+)$/, 'Challenge to $1'], [/^Reto de (.+)$/, 'Challenge from $1'], [/^Reto rechazado por (.+)$/, 'Challenge declined by $1'], [/^Sales de la batalla #(\d+)$/, 'You leave battle #$1'],
    [/^Venta: /, 'Sale: '], [/^Compra: /, 'Purchase: '], [/^Predicción devuelta: /, 'Prediction refunded: '],
    // rendimiento en el perfil (30-10)
    [/^cobrado ([\d.]+)$/, 'collected $1'], [/^mejor: (\d+) seguidas$/, 'best: $1 in a row'], [/^(\d+)% de lo gastado$/, '$1% of the spending'], [/^solo lo ve (.+)$/, 'only $1 sees it'],
    [/^Cómo te va apostando: (\d+) apuestas? resueltas?\.$/, (m, n) => `How your betting is going: ${n} settled bet${n === '1' ? '' : 's'}.`], [/^Cómo le va a (.+) apostando: (\d+) apuestas? resueltas?\.$/, (m, a, n) => `How ${a}'s betting is going: ${n} settled bet${n === '1' ? '' : 's'}.`], [/^ · los juegos y el bote solo los ve (.+)$/, ' · only $1 sees games and pot'], [/^(\d+) apuestas?$/, (m, n) => `${n} bet${n === '1' ? '' : 's'}`],
    // panel de novedades y arreglos (30-10)
    [/^· los juegos y el bote solo los ve (.+)$/, '· only $1 sees games and pot'],
    // extras (EXTRAS-INTEGRAR.md: sonidos, stickers, cajas en directo) y lo que faltaba en el repaso (30-10)
    [/^(\d+) cosas$/, '$1 items'], [/^(\d+) apuestas? · ([\d.]+)$/, (m, n, v) => `${n} bet${n === '1' ? '' : 's'} · ${v}`], [/MIÉ/g, 'WED'], [/ · Mapa (\d+) de (\d+)/, ' · Map $1 of $2'], [/^gana (.+)$/, '$1 wins'],
    [/ · se actualiza cada (\d+) s$/, ' · updates every $1 s'], [/^Rondas ganadas, hasta (\d+)$/, 'Rounds won, first to $1'],
    // moneda al lado de cada cantidad (30-10)
    [/^(\d+) apuestas · (\d+) ganadas · (\d+) perdidas · (.) ([\d.]+)$/, '$1 bets · $2 won · $3 lost · $4 $5'], [/^en juego · (\d+) apuestas?$/, (m, n) => `in play · ${n} bet${n === '1' ? '' : 's'}`],
    // ruleta Todos y apuestas en vivo (30-10)
    [/^(\d+) de (\d+) han girado$/, '$1 of $2 have spun'],
    [/^Cada lunes, ([\d.]+) de cada uno · se lo lleva quien más gane$/, 'Every Monday, $1 from each one · the biggest winner takes it'],   // Recompensas: bote automatico (01-11)
    // fichas: ver todos y todo sobre el equipo (30-10)
    [/^Ver todos · (\d+)$/, 'See all · $1'], [/^Plantilla · (\d+)$/, 'Squad · $1'], [/^Resultados · (\d+)$/, 'Results · $1'], [/^Todas sus peleas · (\d+)$/, 'All fights · $1'],
    // extras 2 (30-10)
    [/^Sube un (\d+) % la cuota de (.+)$/, 'The odds for $2 go up $1 %'], [/^Sube un (\d+) % las tres cuotas$/, 'All three odds go up $1 %'],
    [/^Hasta ([\d.]+) por jugador(.*)$/, 'Up to $1 per player$2'], [/^Te quedan ([\d.]+)$/, '$1 left'], [/ · te quedan ([\d.]+)$/, ' · $1 left'],
    [/^Cuota mejorada, antes (.+)$/, 'Boosted odds, were $1'],
    [/cuota fija · máximo ([\d.]+)$/, 'fixed odds · max $1'], [/^¿Quién gana la ronda (\d+) de (.+)\?$/, 'Who wins round $1 on $2?'],
    [/^Has apostado (\d+) a la ronda (\d+)$/, 'You bet $1 on round $2'], [/^Has apostado (\d+) · cuenta hasta las (.+)$/, 'You bet $1 · counts until $2'],
    [/^ganada \+([\d.]+)$/, 'won +$1'], [/^Gol en 10 min · (Sí|No)$/, (m, a) => `Goal in 10 min · ${a === 'Sí' ? 'Yes' : 'No'}`],
    [/^Ronda (\d+) de (.+) · (local|visitante)$/, (m, n, mp, l) => `Round ${n} on ${mp} · ${l === 'local' ? 'home' : 'away'}`],
    [/^Las 3 skins que (.+) enseña a los demás\.$/, 'The 3 skins $1 shows to everyone.'], [/^Elige hasta 3 · el orden es el de los números · (\d) de 3$/, 'Pick up to 3 · the order is the numbers · $1 of 3'],
    [/^(\d+) mes$/, '$1 month'], [/^(\d+) meses$/, '$1 months'], [/^(\d+) bote$/, '$1 pot'], [/^(\d+) botes$/, '$1 pots'], [/^(\d+) premio$/, '$1 prize'], [/^(\d+) premios$/, '$1 prizes'],
    [/, de momento: $/, ', so far: '], [/^Semana del (.+)$/, 'Week of $1'],
    // tarjeta en vivo nueva (30-10)
    [/^Mapa (\d+) de (\d+) · (.+)$/, 'Map $1 of $2 · $3'], [/^Mapa (\d+) de (\d+)$/, 'Map $1 of $2'], [/^(\d+) en vivo$/, '$1 live'],
    // prediccion de ronda en la celebracion y en Resultados: 'Ronda 18 de Split · Nova Esports' (30-10 noche)
    [/^Ronda (\d+) de (.+?) · (.+)$/, 'Round $1 on $2 · $3'],
    // cancelar apuesta, antes y durante el partido (30-10 noche)
    [/^Cancelar apuesta$/, 'Cancel bet'], [/^¿Seguro\? Te devuelvo ([\d.]+)$/, 'Sure? You get $1 back'], [/^Cancelar · cobras$/, 'Cancel · you get'],
    [/^¿Seguro\? Cobras$/, 'Sure? You get'], [/^, (pierdes|ganas) ([\d.]+)$/, (m, v, n) => `, you ${v === 'pierdes' ? 'lose' : 'win'} ${n}`],
    [/^Cancelar no disponible$/, 'Cancel not available'], [/^Cancelada: cobras$/, 'Cancelled: you get'], [/^· (pierdes|ganas) ([\d.]+)$/, (m, v, n) => `· you ${v === 'pierdes' ? 'lose' : 'win'} ${n}`],
    [/^Cancelada: te devuelvo$/, 'Cancelled: you get back'],
    // combinadas (30-10 noche, db/029)
    [/^Sueltas$/, 'Singles'], [/^cada una por su lado$/, 'each one on its own'], [/^Combinada$/, 'Parlay'], [/^cuotas multiplicadas, aciertas todas$/, 'odds multiplied, win them all'],
    [/^Cuota de la combinada$/, 'Parlay odds'], [/^Importe de la combinada$/, 'Parlay stake'], [/^Apuestas$/, 'You bet'], [/^Cobrarías si aciertas las (\d+)$/, 'Payout if all $1 win'],
    [/^Apostar combinada de (\d+)$/, 'Place parlay of $1'], [/^Apostando la combinada…$/, 'Placing the parlay…'], [/^Ha entrado la combinada$/, 'Parlay placed'],
    [/^Una combinada lleva (\d+) partidos como máximo$/, 'A parlay takes $1 matches at most'], [/^Pon un importe$/, 'Enter an amount'], [/^para apostarlo$/, 'to bet it'],
    [/^Combinada de (\d+)$/, 'Parlay of $1'], [/^cuota ([\d,]+) · ([\d.]+)$/, 'odds $1 · $2'], [/^Combinadas$/, 'Parlays'], [/^(\d+) de (\d+) acertados$/, '$1 of $2 won'],
    [/^Acertado$/, 'Won'], [/^Fallado$/, 'Lost'], [/^Anulado: cuenta como 1$/, 'Void: counts as 1'], [/^Cancelar combinada$/, 'Cancel parlay'],
    [/^COBRADA$/, 'PAID'], [/^PERDIDA$/, 'LOST'], [/^DEVUELTA$/, 'REFUNDED'], [/^Combinada cancelada: te devuelvo$/, 'Parlay cancelled: you get back'],
    [/^Ninguna en juego\. En Partidos, mete 2 o más cuotas en el boleto y elige Combinada\.$/, 'None in play. In Matches, add 2 or more odds to the slip and choose Parlay.'],
    [/^Toca 2 o más cuotas y en el boleto elige$/, 'Tap 2 or more odds and in the slip choose'], [/^: las cuotas se multiplican y cobras si aciertas todas\.$/, ': the odds multiply and you win if they all win.'],
    [/^Combinada de (\d+) · cuota ([\d,]+)$/, 'Parlay of $1 · odds $2'], [/^Combinada · cuota ([\d,]+)$/, 'Parlay · odds $1'], [/^Combinada (cancelada|anulada)$/, (m, v) => `Parlay ${v === 'cancelada' ? 'cancelled' : 'void'}`],
    // combinadas en Apuestas de todos y en el perfil (31-10)
    [/^(\d+) en juego$/, '$1 in play'], [/^perdida$/, 'lost'], [/^devuelta$/, 'refunded'], [/^Mejor cuota acertada$/, 'Best odds won'],
    [/^(\d+) hechas · (\d+) ganadas? · (\d+) perdidas?( · (\d+) en juego)?$/, (m, a, b, c, d, e) => `${a} made · ${b} won · ${c} lost${d ? ` · ${e} in play` : ''}`],
    // apostar en directo (31-10, db/031)
    [/^Apostar en directo$/, 'Live betting'], [/^la cuota se mueve con el marcador$/, 'odds move with the score'], [/^Cobrarías$/, 'You would get'],
    [/^Apostar ([\d.,]+) a (.+) en directo$/, 'Bet $1 on $2 live'], [/^Apostando…$/, 'Placing…'], [/^Ha entrado a ([\d.,]+)\. En revisión hasta la siguiente lectura del marcador\.$/, 'Placed at $1. Under review until the next score update.'],
    [/^Hasta ([\d.,]+) más en directo en este partido\. Tu apuesta queda en revisión hasta la siguiente lectura del marcador: si hubo gol o mapa justo al apostar, se anula y te devuelve todo\.$/, 'Up to $1 more live on this match. Your bet stays under review until the next score update: if a goal or map happened right as you bet, it is voided and fully refunded.'],
    [/^(Esperando datos del directo|El partido no está en juego|La UFC no tiene apuestas en directo|Cerrado desde el minuto 80|Ahora no hay cuotas en directo)\. Se paga solo al acabar\.$/, (m, w) => `${{ 'Esperando datos del directo': 'Waiting for live data', 'El partido no está en juego': 'The match is not in play', 'La UFC no tiene apuestas en directo': 'UFC has no live betting', 'Cerrado desde el minuto 80': 'Closed from minute 80', 'Ahora no hay cuotas en directo': 'No live odds right now' }[w]}. Settles automatically at the end.`],
    [/^Se paga solo al acabar\.$/, 'Settles automatically at the end.'], [/^En directo: ([\d.,]+) a ([\d.,]+)$/, 'Live: $1 at $2'],
    // ranking de Juegos: tira de caras y duelo (01-11)
    [/^de (\d+)$/, 'of $1'], [/^a[\s\u00a0]([\d.,×]+)$/, 'by $1'], [/^(.+) te saca$/, '$1 is ahead by'], [/^Vas por delante de (.+) por$/, 'You are ahead of $1 by'], [/^Sin jugar · (.+)$/, 'Not played · $1'],
    // Directo y fechas sueltas (01-11, Detalles)
    [/^pick de (.+)$/, 'picked by $1'], [/^asistencia de (.+)$/, 'assist by $1'], [/^(.+) \(en propia\)$/, '$1 (own goal)'],
    [/^(.+) · se actualiza cada (\d+) s$/, '$1 · updates every $2 s'], [/^Fútbol(?= · )/, 'Football'], [/^· Apuesta del día$/, '· Bet of the day'],
    [/^No se han podido cargar las cuotas en directo\. Se paga solo al acabar\.$/, 'Could not load the live odds. It settles automatically at the end.'],
    [/^empate (\d+)%$/, 'draw $1%'], [/\bMAR(?= · )/g, 'TUE'],
    // Ya jugados: lo tuyo en cada partido (01-11)
    [/^([\d.,]+) a (.+?)( · [\d.,]+)?$/, '$1 on $2$3'], [/^(\d+) apuestas$/, '$1 bets'],
    // tu ruleta cada 3 dias (db/047)
    [/^Ya has girado\. La siguiente tirada, mañana$/, 'Already spun. Next spin tomorrow'], [/^Ya has girado\. La siguiente tirada, el (\d\d)\/(\d\d)$/, 'Already spun. Next spin on $1/$2'],
    // decimales con punto en ingles (x1,25 a x1.25): esta va la ultima de la lista
    [/×(\d+),(\d\d)/g, '×$1.$2'],
  ];
  // en ingles N y O escriben 1,808 y 18.08 (31-10): las reglas que capturan numeros acepten los dos formatos
  for (const r of R) r[0] = new RegExp(r[0].source.split('[\\d.]').join('[\\d.,]').split('[\\d,]').join('[\\d.,]'), r[0].flags);
  const tr = (s) => {
    const t = s.trim();
    if (!t) return s;
    if (D[t]) return s.replace(t, D[t]);
    let x = t;
    for (const [re, to] of R) x = x.replace(re, to);
    return x === t ? s : s.replace(t, x);
  };
  let lang = 'es';
  try { lang = localStorage.getItem('gm-lang') === 'en' ? 'en' : 'es'; } catch (e) {}
  function traduce(root) {
    if (lang !== 'en' || !root) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (w.nextNode()) nodes.push(w.currentNode);
    for (const n of nodes) {
      if (n.parentElement && n.parentElement.closest('.msg p, textarea, input, [data-notr]')) continue;   // lo que escribe la gente no se traduce
      const v = n.nodeValue;
      if (/[A-Za-zÁÉÍÓÚÜáéíóúüñ]/.test(v)) { const x = tr(v); if (x !== v) n.nodeValue = x; }
    }
    for (const e of root.querySelectorAll('[placeholder],[title],[aria-label]')) {
      for (const a of ['placeholder', 'title', 'aria-label']) { const v = e.getAttribute(a); if (v) { const x = tr(v); if (x !== v) e.setAttribute(a, x); } }
    }
    // la forma: G E P en español, W D L en inglés
    for (const b of root.querySelectorAll('.fm b, b.rs')) b.textContent = { G: 'W', E: 'D', P: 'L' }[b.textContent] || b.textContent;
  }
  document.documentElement.lang = lang;
  window.GM_LANG = { get: () => lang, set: (l) => { lang = l === 'en' ? 'en' : 'es'; try { localStorage.setItem('gm-lang', lang); } catch (e) {} document.documentElement.lang = lang; }, traduce };
})();
