# SIGUE: batallas6 (rama `batallas6`, 03-11)

Dos cosas para Cajas, SIN cargar en Supabase y SIN publicar (solo app/nueva y la imagen de Novedades).

## A. Mas batallas (db/072_batallas_mas.sql + db/072_prueba.sql)
- Formatos: 1v1, 2v2 (como siempre) y nuevos 1v1v1, 1v1v1v1, 1v1v1v1v1v1 (3, 4 y 6 todos contra todos), 2v2v2 y 3v3.
  mode sigue siendo el texto; equipo de un sitio = sitio / tamano del equipo. Sitios 0..5.
- Columna nueva `cs_battles.regla` ('normal' | 'crazy'). Crazy: gana el equipo que MENOS saca.
- Checks de mode, winner y seat rehechos buscandolos en pg_constraint (da igual su nombre).
- `cs_battle_create(p_mode, p_cases, p_regla default 'normal')`: se BORRA la de 2 argumentos (la llamada vieja con nombres sigue valiendo).
- `cs_battle_join` toma el tamano del formato; `cs_battle_resolve` generalizado (total por equipo, empate a suertes con cs_rand entre los empatados,
  el ganador se lo lleva todo como antes). Nota del monedero `Batalla <formato> #id` (`... Crazy #id`). `cs_battle_j` manda `regla`.
- Ayudantes nuevos: cs_equipos, cs_tam_equipo, cs_plazas, cs_modo_ok, cs_battle_nota (sin permiso para los jugadores).

## B. Giro Dorado (db/073_giro_bonus.sql + db/073_prueba.sql), VA DESPUES DE 072
- settings `giro_dorado_pct` = 4. `cs_inv.bonus jsonb` = {orig, up, down, won}; `cs_inv_j` lo manda solo si existe.
- `cs_giro(...)` decide en la misma transaccion (cs_open, cs_open_owned y cs_battle_resolve, que es el de 072 mas el giro):
  ARRIBA al azar entre 1,5x y 6x (si no, el mas barato que valga mas; si ya es lo mejor, no hay giro);
  ABAJO al azar entre 0,25x y 0,75x (si no, el mas caro que valga menos; si no hay, quedarse con lo mismo). Moneda cs_rand() < 0,5.
  CS2: mismo desgaste (o el mas cercano que quepa en el rango de float) y StatTrak solo si la skin lo admite y tiene precio.
- Se cobra una vez; lo que queda en cs_inv (y en la ronda y el total de la batalla) es el objeto final.

## Pruebas locales (PGlite): D:\eddwi\claude\sandbox\pglite-batallas6\prueba.mjs  (`node prueba.mjs`, o `node prueba.mjs solo072`)
- 072 y 073 cargadas dos veces sin error; batallas viejas (1v1, 2v2, una abierta) intactas y se cierran bien despues.
- 072_prueba: PRUEBA SUPERADA (14 batallas, 7 formatos x Normal/Crazy; formatos falsos fallan; llamada vieja; salir/cancelar devuelven; 60 empates a tres repartidos).
- 073_prueba: PRUEBA SUPERADA. Al 4 %: 807 giros en 20.000 tiradas (4,04 %). Moneda 6027/12243.
- Devolucion medida (sin giro -> con giro): Alijo Pokemon 92,7 -> 95,5 % (+2,8); Imperio Gamer 95,6 -> 98,1 (+2,5);
  Rolex 10 % 83,4 -> 87,2 (+3,8); Kilowatt Case (CS2) 66,7 -> 68,5 (+1,9). El giro regala de media unos 2 a 4 puntos a los jugadores.

## Cliente (app/nueva)
- cajas.js: formatos y regla al crear (Normal pide como siempre con 2 argumentos; Crazy manda p_regla), filas con N equipos,
  repeticion con columnas por equipo y VS (movil: equipos uno debajo de otro; todos contra todos en rejilla de 2 o 3 columnas con ruletas
  compactas), barra de reparto por equipo, ranking con N equipos, Giro Dorado en la tira de abrir, en la repeticion (alarga esa ronda) y en
  la prueba gratis (4 %, de mentira). Si la base aun no tiene `regla`, la lista se lee como antes.
- cajas.css: bloque propio al final. app.js: feed y Monedero con N equipos y Crazy (rivales = los de otros equipos). i18n.js: bloque propio
  arriba de D y de R. novedades.json: `batallas-mas-0311` y `giro-dorado-0311` (imagenes en app/img/novedades/).

## Capturas
D:\eddwi\claude\sandbox\wt-batallas6\modelos\capturas\batallas6\ (1440 y 390, es y en; informe.json). Script:
D:\eddwi\claude\sandbox\pglite-batallas6\batallas6-pantallas.cjs (solo mira la base real; cs_state, cs_battle, cs_open y la lista son de mentira).

## Para publicar (lo hace James)
1. Cargar 072, 072_prueba, 073, 073_prueba (en ese orden). OJO: otro ayudante hace db/071 (mejora.js) y db/074; no tocan cs_battle_*.
2. Copiar app/nueva -> app (rutas), versionar, Novedades ya estan en app/nueva/novedades.json (copiar tambien a app/).
3. Decidir con PM si el 4 % y la devolucion extra (+2 a +4 puntos) le parecen bien; se cambia sin tocar codigo con
   `update settings set value = 'N' where key = 'giro_dorado_pct'` (0 lo apaga).
