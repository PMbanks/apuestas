# Apuestas entre colegas

App de apuestas con dinero falso para PM y sus colegas: fútbol, Valorant y UFC, solo 1 X 2,
+1.000 cada lunes que se acumulan, chat con fotos, perfiles, liga con gráficas.

- `app/`: la web (GitHub Pages). `config.js` lleva la URL y la clave pública de Supabase.
- `db/001_init.sql`: tablas, reglas y funciones. El dinero solo se mueve ahí dentro.
- `sync/sync.mjs`: partidos, cuotas y resultados (ESPN y PandaScore). GitHub Actions lo lanza cada 15 minutos.
  Entra con la clave pública y una clave propia (`SYNC_SECRET`): solo puede guardar partidos y cerrar los acabados.
- Cuentas: las crea PM en el editor SQL de Supabase con `admin_create_player(...)` (db/002). Nadie puede registrarse solo.
- `EMBED.md`: cómo meter la app dentro del programa de cada uno.

Las claves privadas nunca van al repo: viven en los secretos de GitHub Actions y en el PC de PM.
