# Datos de la ficha ampliada de equipos (para el ayudante de interfaz)

Los escribe `sync/equipos-extra.mjs` (cada pasada, unos pocos equipos) en `teams.extra` (db/025_equipos_extra.sql).
Se leen igual que hoy `teams.data`: `db.from('teams').select('id,data,extra,extra_at').in('id', [...])`.
Si `extra` es `null` o la fila no existe, todavia no hay ficha ampliada: no pintar las pestanas nuevas (o decir "Aun cargando").
Se rehace cada 3 dias como mucho; `extra.actualizado` y `extra_at` dicen cuando.

## Ids de la tabla `teams`
| Deporte | id | De donde sale |
|---|---|---|
| Valorant | `valorant:<id PandaScore>` | `m.tid.a` / `m.tid.b` (como hasta ahora) |
| CS2 | `csgo:<id PandaScore>` | igual |
| Futbol | `f:<id equipo ESPN>` | `m.espn.ids.a` / `.b` |
| UFC | `u:<id luchador ESPN>` | `m.espn.ids.a` / `.b` |

Para futbol y UFC la fila solo tiene `extra` (`data` es `{}`); no mirar `data` ahi.

## Formato (`v: 1`)
Todo texto va tal cual la fuente (nombres de torneos en ingles). Cualquier campo puede ser `null` o faltar: pintar solo lo que haya.

```
extra = {
  v: 1, tipo: 'v'|'c'|'f'|'u', nombre, actualizado: ISO,
  fuente: ['PandaScore','Liquipedia','vlr.gg', ...],
  atribucion: [{ fuente, texto, url, licencia?, licencia_url? }],   // ENSENARLA, ver abajo
  equipo: { pais, siglas, logo },                                    // solo Valorant y CS2
  palmares: [ { torneo, puesto, puesto_n, fecha, premio, tier, logo, rival, marcador, url,   // esports y UFC
                veces, anios } ],                                                            // futbol (ver abajo)
  resumen: { oros, platas, bronces?, premios? },    // conteo sobre la lista de palmares
  ganancias: { total, moneda:'USD', por_ano:[{ano, usd}]|null, nota } | null,   // SOLO del equipo, esports
  jugadores: [ { nombre, nombre_real, pais, rol, estado, desde, foto, edad, ganancias:null,
                 anteriores:[{equipo, hasta, nota}]|null } ],   // esports; ganancias SIEMPRE null (ver "Lo que no hay")
  exjugadores: [ { nombre, pais, desde, hasta, nuevo_equipo } ],   // esports, los 25 mas recientes
  staff: [ { nombre, nombre_real, rol, pais, desde } ],             // esports: entrenador, CEO, analista...
  club: { nombre, apodo, estadio, ciudad, pais, logo, fundado, wikidata },   // solo futbol
  ficha, cinturones, record, ranking,                                         // solo UFC
  aviso_liquipedia?, aviso_vlr?                                               // texto tecnico si una fuente fallo; no pintarlo
}
```
- `puesto`: ya en espanol corto (`1º`, `2º`, `5º a 6º`, `Campeón`, `Subcampeón`, `Victoria`, `Derrota`). `puesto_n`: numero para ordenar o colorear (1 oro, 2 plata, 3 bronce; 0 = derrota en UFC).
- `fecha`: `YYYY-MM-DD` (en la reserva de vlr.gg solo `YYYY`). `premio`: dolares como numero, `null` si no hay. `tier`: `S`, `A`, `B`... Liquipedia. `logo`: URL absoluta (liquipedia.net; si se quiere evitar el enlace directo, no pintarlo).
- `jugadores[].estado`: `Inactive`, `Substitute`... o `null` (titular). `desde`: fecha de llegada al equipo (`YYYY-MM-DD` o `YYYY-MM`). `pais`: ISO de 2 letras en mayuscula (`CN`, `UA`; hay alguno raro como `GB-ENG`). `foto`: PandaScore (a veces `null`).
- `ganancias.total` incluye lo que ganaron los jugadores mientras representaban al equipo (lo dice la `nota`; ensenar la nota o un "aprox.").

### Futbol: `palmares` es otra forma
Cada entrada: `{ torneo, puesto:'Campeón'|'Subcampeón', puesto_n:1|2, veces, anios:['2008','2016','2026'] }` (los ultimos 15 anios; no hay `fecha` ni `premio`).
Puede salir el mismo `torneo` dos veces (una por Campeón y otra por Subcampeón). Agrupar por `torneo` o dividir en dos listas "Títulos" / "Subcampeonatos".

### UFC
- `ficha`: `{ apodo, edad, nacimiento, pais, categoria, altura, peso, alcance, postura, gimnasio, activo }`.
- `cinturones`: `[{ nombre:'UFC Heavyweight Title', tipo:'Belt' }]` (los que ha tenido, incluido el interino).
- `record`: `{ resumen:'14-2-0', victorias, derrotas, empates, sin_resultado, por_ko, por_sumision, por_decision, derrotas_ko, derrotas_sumision, titulo:{victorias,derrotas,empates} }`.
- `ranking`: `{ posicion, categoria, defensas, campeon }` (`defensas` = defensas del titulo).
- `palmares`: ultimos 5 combates por el titulo (`torneo` = nombre del evento, `puesto` Victoria/Derrota, `rival`, `fecha`).

## Que hay por deporte
| | Palmares | Ganancias | Plantilla / jugadores | Equipos anteriores |
|---|---|---|---|---|
| Valorant | si, los 10 destacados de Liquipedia con fecha, premio y marcador (reserva vlr.gg: puesto y ano, sin premio) | del equipo, total y por ano | si, con fecha de llegada, pais, foto, edad | si, de vlr.gg (por jugador) y los ex jugadores del equipo |
| CS2 | igual, 10 destacados | del equipo, total (por ano no siempre) | si | solo los ex jugadores de ESTE equipo (no la carrera del jugador) |
| Futbol | titulos y subcampeonatos del club (Wikipedia, seccion Honours; si falla, Wikidata, mas corto) | no | no (la app ya trae la plantilla de ESPN) | no |
| UFC | cinturones, titulo, ultimos 5 combates por el titulo | no | no | no |

## Lo que NO hay (ninguna fuente gratis lo da; no se inventa)
- **Ganancias por jugador** (`jugadores[].ganancias` es siempre `null`): Liquipedia solo las tiene en su base de pago/aprobacion, vlr.gg no las expone en la API abierta, PandaScore no las tiene. Si se quiere un hueco, poner "No disponible" o no mostrar la columna.
- Ganancias de futbolistas, de clubes de futbol y de luchadores de UFC.
- Palmares completo de esports: solo salen los destacados (Liquipedia elige ~10). `resumen` cuenta solo sobre esos.
- Carrera previa de jugadores de CS2.
- Equipos sin pagina en Liquipedia (ej. "A Team" de Valorant): `palmares` y `ganancias` vacios, solo la plantilla de PandaScore.
- Futbol: algunos clubes pequenos no tienen seccion de titulos en Wikipedia: `palmares` vacio.

## Atribucion obligatoria
Si se muestra algo de Liquipedia (palmares, ganancias, plantilla de Valorant o CS2) hay que enseñar en la ficha, visible, un texto **"Datos de Liquipedia"** con enlace a `atribucion[fuente=='Liquipedia'].url` (CC BY-SA 3.0).
Con Wikipedia (futbol): "Datos de Wikipedia" enlazando a su `url` (CC BY-SA 4.0). Wikidata es CC0 (no obliga). vlr.gg y PandaScore: poner el texto de `atribucion` en pequeno. Lo mas simple: pintar al pie de la pestana todos los `atribucion[].texto` con su `url` cuando exista.

## Para el que sincroniza
- Cada ficha cuesta a Liquipedia 1 `action=parse` (32 s de espera) + 1 consulta; 3 equipos de esports como mucho por pasada, 8 de futbol, 4 de UFC. Al arrancar, con la base vacia, tarda unas horas en tener todo: es normal que muchos equipos no tengan `extra` al principio.
- Contacto en el User-Agent: por defecto la URL del repo; se cambia con la variable `EQUIPOS_CONTACTO` en el workflow (Liquipedia pide un contacto; un correo es lo mejor).

## Formato 2 (ver: 2) y detalle de jugadores (01-11)
Campos nuevos de extra para Valorant y CS2 (db/045 guarda la version; los pinta equipos.js):
- jugadores[].estado: null (titular), 'Loan', 'Substitute', 'Stand-in', 'Inactive'; capitan, inactivo_desde, roles (CS2: igl, awp, rifle, entry, support, lurk), agentes (Valorant: [{a, pj, pct}] de vlr.gg, ultimos 60 dias), anteriores [{equipo, desde, hasta, nota}] (CS2 de Liquipedia, Valorant de vlr.gg).
- exjugadores (hasta 70), staff, exstaff (cuerpo tecnico y organizacion, con fechas de entrada y salida).
- titulos: { total, otros, segundos, terceros, jugados, por_tier, desde, lista:[{f,t,k,p,r,m,l}] (torneos ganados), podios:[{f,t,k,n,p,l}] (2º y 3º de torneos S, A y B),
  premios:[[fecha, torneo, puesto, premio, nivel]] (todo lo que cobro el equipo), premios_total, premios_n, por_ano:[{ano, usd}] }. l = ruta del logo del torneo en liquipedia.net/commons/images/ (la app lo enlaza, no lo copia).
- Los premios de Liquipedia son del EQUIPO (los jugadores se reparten ese dinero): total y por ano de ganancias del equipo salen de ahi si el grafico de Liquipedia no existe.

Detalle de jugadores: columna teams.pj (db/050), un objeto por jugador con su nick en minusculas como clave:
    pj = { "coconut": { t: ms, g: { total, aprox, n, jugados, lista: [[fecha o ano, torneo, puesto, premio, equipo, fase?]] } } }   (o { t, fallo: "motivo" } si la fuente fallo)
- Valorant: pagina del jugador en vlr.gg (Event Placements): premio por evento del propio jugador, total exacto (aprox: false).
- CS2: pagina Jugador/Results de Liquipedia (1 action=parse por jugador): el premio de cada fila es del equipo y se reparte entre 5 (aprox: true).
- Se rehace cada 7 dias (1 dia tras un fallo), 3 jugadores de CS2 por pasada; los de Valorant no cuentan (no usan la API de Liquipedia).
