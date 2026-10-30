// Gambling Master en español o en inglés. La app escribe en español; con el inglés elegido se traduce lo pintado
// con este diccionario (frases exactas) y estas reglas (frases con números o nombres). Lo que escriben los jugadores no se toca.
'use strict';
(function () {
  const D = {
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
    'Últimos 5': 'Last 5', 'Ver ficha': 'View profile', 'Recompensas': 'Rewards', 'Una tirada gratis': 'One free spin', 'Girar': 'Spin', 'De 50 a 1.000 V-Bucks o una caja de CS2 que se abre sola.': 'From 50 to 1,000 V-Bucks or a CS2 box that opens by itself.', 'Reclamar': 'Claim', 'Hecho hoy': 'Done today', 'Entrar': 'Join', 'Estás dentro': 'You are in', 'Empieza el lunes': 'Starts Monday', 'Cerrado hasta el lunes': 'Closed until Monday', 'Pedir': 'Ask', 'Cerrar': 'Close', 'Estás dentro del bote de esta semana': 'You are in this week\u2019s pot', 'Juegos': 'Games', 'Blackjack · como mucho 100 de pérdida al día': 'Blackjack · at most 100 lost per day', 'Cara o cruz, crash, ruleta, blackjack y plinko': 'Coin flip, crash, roulette, blackjack and plinko', 'Cara o cruz': 'Coin flip', 'Ruleta': 'Roulette', 'Cualquiera': 'Anyone', 'Tu lado': 'Your side', 'Cara': 'Heads', 'Cruz': 'Tails', 'Apuesta': 'Bet', 'Aceptar': 'Accept', 'Retirar': 'Cash out', 'Abiertos': 'Open', 'Tus retos': 'Your challenges', 'Últimos': 'Latest', 'Retirar solo en': 'Auto cash out at', 'sin límite': 'no limit', 'Apostar': 'Bet', 'Dentro': 'In', 'En marcha': 'Running', 'Retirado': 'Cashed out', 'Perdida': 'Lost', 'dentro': 'in', 'En la ronda': 'In this round', 'Color': 'Colour', 'Rojo': 'Red', 'Negro': 'Black', 'Verde': 'Green', 'Girando': 'Spinning', 'Banca': 'Dealer', 'Tú': 'You', 'Pedir': 'Hit', 'Plantarse': 'Stand', 'Doblar': 'Double', 'doblada': 'doubled', 'Riesgo': 'Risk', 'Bajo': 'Low', 'Medio': 'Medium', 'Alto': 'High', 'Últimas bolas': 'Last balls', 'Apuesta para abrir una ronda': 'Bet to open a round', 'Retira antes de que explote': 'Cash out before it crashes', 'Empate · te devuelvo la apuesta': 'Push · bet returned', 'Blackjack paga 3 a 2. La banca se planta en 17.': 'Blackjack pays 3 to 2. Dealer stands on 17.', 'Pon una cantidad': 'Enter an amount', 'Directo': 'Live', 'Viendo este directo': 'Watching this stream', 'EN JUEGO': 'OPEN', 'EN VIVO': 'LIVE', 'mapas ganados': 'maps won', 'Lo que se está jugando ahora mismo': 'What is being played right now', 'Apuestas en este partido': 'Bets on this match', 'Nadie ha apostado a este partido.': 'Nobody has bet on this match.', 'Ver la ficha y las estadísticas': 'Open the match and stats', 'El marcador se actualiza cada pocos minutos; lo de verdad va en el vídeo.': 'The score updates every few minutes; the video is live.', 'Ahora mismo no se juega nada': 'Nothing is being played right now', 'Este partido no tiene una emisión que se pueda ver aquí.': 'This match has no stream that can play here.', 'en juego': 'live', 'pendiente': 'pending', 'acabado': 'finished', 'oculta': 'hidden', 'Ruleta de la semana': 'Weekly wheel', 'Una tirada gratis cada semana': 'One free spin every week', 'Girar la ruleta': 'Spin the wheel', 'Girando…': 'Spinning…', 'Ya has girado esta semana. La siguiente, el lunes.': 'Already spun this week. Next one on Monday.', 'V-Bucks de 50 a 1.000 o una caja de CS2 gratis que se abre sola y va a tu inventario.': 'V-Bucks from 50 to 1,000 or a free CS2 box that opens by itself into your inventory.', 'Movimientos': 'Moves', 'Todo': 'All', 'Apuestas': 'Bets', 'Cajas y skins': 'Boxes and skins', 'Pagas y premios': 'Pay and rewards', 'Nada por aquí todavía.': 'Nothing here yet.', 'pagas y regalos': 'pay and gifts', 'Caja': 'Box', 'Caja ★': 'Box ★', 'Cajas': 'Boxes', 'Caja de CS2': 'CS2 box', 'Batalla de cajas': 'Box battle', 'Todas las cajas': 'All boxes', 'Volver a la caja': 'Back to the box', 'Abre cajas de CS2, guarda skins y juega batallas': 'Open CS2 boxes, keep skins and play battles', 'Premio de la semana': 'Weekly award', 'Ver bracket': 'View bracket', 'Cuadro de ganadores': 'Upper bracket', 'Cuadro de perdedores': 'Lower bracket', 'Gran final': 'Grand final', 'Eliminatorias': 'Playoffs', 'Cuartos': 'Quarterfinals', 'Semis': 'Semifinals', 'Por decidir': 'TBD', 'Cargando el bracket…': 'Loading the bracket…', 'Este torneo todavía no tiene bracket.': 'This tournament has no bracket yet.', 'Abrir': 'Open', 'Inventario': 'Inventory', 'Batallas': 'Battles', 'Todas las cajas': 'All cases', 'Cargando lo que trae…': 'Loading contents…', 'Especial': 'Special', 'Encubierto': 'Covert', 'Clasificado': 'Classified', 'Restringido': 'Restricted', 'Grado militar': 'Mil-Spec', 'Cuántas': 'How many', 'Rápido': 'Fast', 'Sin saldo': 'No balance', 'Abrir por': 'Open for', 'Otra por': 'Again for', 'Vender todo por': 'Sell all for', 'Recién fabricado': 'Factory New', 'Casi nuevo': 'Minimal Wear', 'Algo desgastado': 'Field-Tested', 'Bastante desgastado': 'Well-Worn', 'Deplorable': 'Battle-Scarred', 'Sin desgaste': 'No wear', 'Vender': 'Sell', 'Vendida': 'Sold', 'Volver a la caja': 'Back to the case', 'Lo que trae': 'Contents', '★ Objeto especial': '★ Rare special item', 'Lo último que ha salido': 'Latest drops', 'Tu inventario': 'Your inventory', 'Su inventario': 'Inventory', '1 skin': '1 skin', 'Toca una skin para elegirla': 'Tap a skin to select it', 'Quitar': 'Clear', 'Vender por': 'Sell for', 'Aún no tienes skins. Abre una caja o gana una batalla.': 'No skins yet. Open a case or win a battle.', 'Todavía no tiene skins.': 'No skins yet.', 'Cada uno abre las mismas cajas. El lado que saque más valor se lleva todas las skins.': 'Everyone opens the same cases. The side with the most value takes every skin.', 'Crear batalla': 'Create battle', 'Abiertas': 'Open', 'Terminadas': 'Finished', 'Ninguna abierta ahora mismo.': 'None open right now.', 'Unirme': 'Join', 'Unirme aquí': 'Join here', 'Salir': 'Leave', 'Ver': 'Watch', 'Ver el resultado': 'See the result', 'Ver otra vez': 'Watch again', 'Saltar': 'Skip', 'valor sacado': 'value unboxed', 'por cabeza': 'each', 'a': 'to', 'Nueva batalla': 'New battle', 'Toca una caja para añadir una ronda': 'Tap a case to add a round', 'Aún sin cajas. Hasta 10 rondas.': 'No cases yet. Up to 10 rounds.', 'Crear por': 'Create for', 'Cada jugador paga lo mismo al unirse.': 'Each player pays the same to join.', 'Libre': 'Free', 'Cargando batalla…': 'Loading battle…', 'Estás dentro': 'You are in', 'Batalla llena: se abren las cajas': 'Battle full: opening the cases', 'Batalla creada: falta que se unan': 'Battle created: waiting for players', 'No tienes saldo suficiente': 'Not enough balance', 'Caja de CS2': 'CS2 case', 'Venta de skin': 'Skin sale', 'Batalla de cajas': 'Case battle', 'Me sumo': 'Me too', 'sin resueltas': 'none settled', 'Al chat': 'To chat', 'Encuesta': 'Poll', 'Reaccionar': 'React', 'La pregunta': 'The question', 'Crear encuesta': 'Create poll', 'Bote de la semana': 'Weekly pot', 'Quién sabe más': 'Who knows best', 'aciertos por deporte': 'wins by sport', 'Premio diario': 'Daily reward', 'Rescate': 'Rescue', 'Bote ganado': 'Pot won', 'Apuesta mandada al chat': 'Bet sent to chat', 'Elige cuánto y dale a Apostar': 'Pick an amount and hit Bet', 'Sale cuando se resuelvan las primeras apuestas.': 'Shows up once the first bets settle.', 'Premio diario reclamado · vuelve mañana': 'Daily reward claimed · come back tomorrow', 'Oculta hasta empezar': 'Hidden until kick-off', 'Esa apuesta ya no está.': 'That bet is gone.', 'se lo lleva': 'takes it', 'Otros idiomas': 'Other languages', 'Buscarlo': 'Search for it', 'Resueltas': 'Settled', 'las últimas de todos': 'latest from everyone', 'nadie': 'nobody', 'nada en juego': 'nothing in play', 'acertó': 'won', 'falló': 'lost', 'Nadie tiene nada en juego. Se apuesta desde Partidos.': 'Nobody has anything in play. Bet from Matches.', 'Todavía no se ha resuelto ninguna. Cuando acabe un partido sale aquí quién acertó.': 'Nothing settled yet. When a match ends, who won shows up here.', 'Historial': 'History', 'Perfil, stats e historial →': 'Profile, stats and history →', 'anulada': 'void', 'en juego': 'open', 'en vivo': 'live', 'oculta hasta empezar': 'hidden until kick-off', 'Todavía no ha apostado.': 'No bets yet.', 'En línea': 'Online', 'Hoy': 'Today', 'Ayer': 'Yesterday', 'Nota de voz': 'Voice note', 'Parar y enviar': 'Stop and send', 'Cancelar': 'Cancel', 'Enviando nota de voz…': 'Sending voice note…', 'No hay micrófono o no has dado permiso': 'No microphone or no permission', 'Este navegador no deja grabar audio': 'This browser cannot record audio', 'Tus V-Bucks, la paga del lunes y cada movimiento': 'Your V-Bucks, Monday pay and every move', 'Victorias': 'Win rate', 'Racha': 'Streak', 'Mapas': 'Maps', 'Siglas': 'Tag', 'Cara a cara': 'Head to head', 'Anteriores': 'Previous', 'Más ligas': 'More leagues', 'Alineaciones': 'Line-ups', 'Las alineaciones salen cuando los equipos las dan, sobre una hora antes.': 'Line-ups show once the teams announce them, about an hour before.', 'Últimos partidos': 'Last matches', 'Próximos': 'Next', 'Plantilla': 'Squad', 'Porteros': 'Goalkeepers', 'Defensas': 'Defenders', 'Centrocampistas': 'Midfielders', 'Delanteros': 'Forwards', 'Sumisiones': 'Submissions', 'Edad': 'Age', 'Altura': 'Height', 'Peso': 'Weight', 'Alcance': 'Reach', 'Guardia': 'Stance', 'País': 'Country', 'Gimnasio': 'Gym', 'Categoría': 'Division', 'Apodo': 'Nickname', 'Últimas peleas': 'Last fights', 'Jugadores': 'Players', 'Últimos resultados': 'Last results', 'Cargando la ficha…': 'Loading the profile…', 'No se ha podido cargar la ficha.': 'Could not load the profile.', 'ESPN no tiene más datos de este equipo.': 'ESPN has no more data on this team.', 'ESPN no tiene la ficha de este luchador.': 'ESPN has no profile for this fighter.', 'PandaScore todavía no tiene datos de este equipo.': 'PandaScore has no data on this team yet.', 'Clasificación': 'Standings', 'Posesión': 'Possession', 'Tiros': 'Shots', 'A puerta': 'On target', 'Córners': 'Corners',
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
  };
  const DIAS = { LUN: 'MON', 'MIÉ': 'WED', JUE: 'THU', VIE: 'FRI', 'SÁB': 'SAT', DOM: 'SUN', HOY: 'TODAY', ENE: 'JAN', ABR: 'APR', AGO: 'AUG', DIC: 'DEC' };
  const R = [
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
    [/^Pones ([\d.]+)\. Si (.+) acepta, hay ([\d.]+) en juego\.$/, 'You put in $1. If $2 accepts, $3 is at stake.'], [/^Acepto (.+)$/, 'I take $1'],
    [/^Gana (.+)$/, '$1 wins'], [/ · reta a /g, ' · challenges '], [/^cuota$/, 'odds'], [/gana · cuota/g, 'win · odds'], [/empate · cuota/g, 'draw · odds'],
    [/^Paga del lunes /, 'Monday payday '], [/ · se acumula$/, ' · it adds up'], [/^Cancelada: /, 'Cancelled: '], [/^Anulado: /, 'Void: '],
    [/^Cada lunes a las 00:00 entran ([\d.]+) a cada uno\. No se compran ni se ganan de otra forma\.$/, 'Every Monday at 00:00 each of you gets $1. They cannot be bought or earned any other way.'],
    [/^Cierra al empezar el partido\. Las elecciones de todos se ven siempre\.$/, 'Betting closes at kick-off. Everyone\'s picks are always visible.'],
    [/^Cierra al empezar el partido\. Las elecciones de todos se ven al empezar\.$/, 'Betting closes at kick-off. Everyone\'s picks show at kick-off.'],
    [/^Gana (\d) con/, 'Win $1 with'], [/^([\d.]+) V-Bucks cada día, reclamándolos$/, '$1 V-Bucks every day, if you claim them'], [/^Retar por (.+)$/, 'Challenge for $1'], [/^Apostar ([\d.]+)$/, 'Bet $1'], [/^Apostar ([\d.]+) a (rojo|negro|verde)$/, 'Bet $1 on $2'], [/^Repartir por (.+)$/, 'Deal for $1'], [/^Otra mano por (.+)$/, 'Another hand for $1'], [/^Soltar bola por (.+)$/, 'Drop ball for $1'], [/^Has cobrado (.+)$/, 'You collected $1'], [/^Ganas ▲ (.+)$/, 'You win ▲ $1'], [/^Pierdes ▼ (.+)$/, 'You lose ▼ $1'], [/^Te pasas · ▼ (.+)$/, 'Bust · ▼ $1'], [/^Mapa (\d+)$/, 'Map $1'], [/^En directo · (\d+)$/, 'Live · $1'], [/^(\d+) movimientos?$/, '$1 moves'], [/^Contra (.+)$/, 'Against $1'], [/^Caja gratis: (.+)$/, 'Free box: $1'], [/^Ronda (\d+)$/, 'Round $1'], [/^Otras (\d) por$/, 'Again ×$1 for'], [/^(\d+) skins$/, '$1 skins'], [/^Elegir las de menos de (\d+)$/, 'Select the ones under $1'], [/^Tienes ([\d.]+)\. La paga del lunes llega sola\.$/, 'You have $1. The Monday payday arrives by itself.'], [/^Batalla (1v1|2v2)$/, 'Battle $1'], [/^Ganan (.+) y (.+)$/, '$1 and $2 win'], [/^Gana (.+)$/, '$1 wins'], [/^contra ([\d.]+) · se llevan? las (\d+) skins$/, 'against $1 · takes all $2 skins'], [/^Esperando a 1 jugador\. Se abre sola al llenarse\.$/, 'Waiting for 1 player. It opens by itself when full.'], [/^Esperando a (\d) jugadores\. Se abre sola al llenarse\.$/, 'Waiting for $1 players. It opens by itself when full.'], [/^Vendidas? (\d* ?)por/, 'Sold $1for'], [/^Te devuelvo/, 'Refunded'], [/ abre una batalla (1v1|2v2) de (\d+) cajas? por ([\d.]+)\. Únete en Cajas$/, ' opens a $1 battle of $2 cases for $3. Join in Boxes'], [/^Batalla (1v1|2v2) lista: (.+) contra (.+)\. Mírala en Cajas$/, '$1 battle ready: $2 vs $3. Watch it in Boxes'], [/^Reclamar ([\d.]+)( de hoy)?$/, 'Claim $1'], [/^Pedir rescate de ([\d.]+)$/, 'Ask for $1 rescue'], [/^Opción (\d)( \(si quieres\))?$/, 'Option $1'], [/^(\d+) votos?( · .+)?$/, '$1 votes'], [/^Acertada ▲ (.+)$/, 'Won ▲ $1'], [/^Fallada ▼ (.+)$/, 'Lost ▼ $1'], [/^Verlo en directo · (.+?)( en .+)?$/, 'Watch live · $1'], [/^Dónde verlo · (.+?)( en .+)?$/, 'Where to watch · $1'], [/^Ver las (\d+)$/, 'See all $1'], [/^(\d+) apuestas · (\d+) ganadas · (\d+) perdidas · (.) (.+) en total$/, '$1 bets · $2 won · $3 lost · $4 $5 overall'], [/ apostados$/, ' staked'], [/^Grabando (\d+:\d+)$/, 'Recording $1'], [/^Últimos (\d+)$/, 'Last $1'], [/^(\d+) ganados$/, '$1 won'], [/^(\d+) perdidos$/, '$1 lost'], [/ años$/, ' y/o'], [/^← (.+) vs (.+)$/, '← $1 vs $2'], [/^(\d+) apuestas · toca una para ver el partido\.$/, '$1 bets · tap one to open the match.'],
  ];
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
