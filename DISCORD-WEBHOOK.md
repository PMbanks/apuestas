# Avisos en Discord: lo que tiene que hacer PM

El sincronizador (GitHub Actions, cada 10 minutos) manda avisos al canal de Discord **solo si existe el secreto
`DISCORD_WEBHOOK`**. Sin él no hace nada y todo sigue como hasta ahora.

## Qué avisa

| Aviso | Cuándo |
|---|---|
| Partido con apuestas | Empieza en los próximos 15 minutos y alguien ha apostado (dice quién y cuánto hay dentro, no qué ha elegido) |
| Apuesta grande resuelta | Ganada o perdida con 300 V-Bucks o más apostados, en las últimas 3 horas |
| Skin especial | Cuchillo o guantes de CS2, o un objeto de lujo de 1.500 o más, sacados en las últimas 3 horas (también en batallas) |
| Resumen de la semana | El lunes, cuando llega la paga: quién ha ganado o perdido, aciertos y saldo |

Cada aviso se manda una sola vez: la base anota lo avisado en la tabla `discord_avisos`.

## Pasos (los haces tú)

1. **Cargar la base.** En el editor SQL de Supabase, pega y ejecuta `db/021_discord.sql` (se puede repetir sin problema).
   Si se te olvida, el sincronizador lo cuenta en su registro ("¿Falta cargar db/021_discord.sql?") y no manda nada.
2. **Crear el webhook en Discord.** En tu servidor: canal donde quieras los avisos, rueda dentada (Editar canal),
   **Integraciones**, **Webhooks**, **Nuevo webhook**. Ponle de nombre "Gambling Addicts" (el aviso ya lleva ese nombre,
   pero así queda también en la lista) y pulsa **Copiar URL del webhook**.
   La URL es como `https://discord.com/api/webhooks/123.../abc...`.
3. **Guardarlo como secreto en GitHub.** En el repositorio: **Settings**, **Secrets and variables**, **Actions**,
   **New repository secret**. Nombre: `DISCORD_WEBHOOK`. Valor: la URL copiada. **Add secret**.
4. **Probar.** En **Actions**, "Sincronizar partidos", **Run workflow**. En el registro del paso de sincronizar sale una
   línea `discord: N avisos mandados de N`. La primera vez pueden llegar de golpe los avisos de las últimas 3 horas.

## Ajustes opcionales (en el editor SQL)

```sql
-- apuesta mínima para avisar (por defecto 300)
insert into settings(key, value) values ('discord_min_apuesta', '500') on conflict (key) do update set value = excluded.value;
-- valor mínimo de un objeto de lujo para avisar (por defecto 1500)
insert into settings(key, value) values ('discord_min_lujo', '3000') on conflict (key) do update set value = excluded.value;
```

## Cosas a saber

- La URL del webhook es una llave: quien la tenga puede escribir en tu canal. No la pegues en el chat ni en el repo.
  Si se escapa, borra el webhook en Discord y crea otro.
- Para dejar de recibir avisos, borra el secreto `DISCORD_WEBHOOK` en GitHub. No hace falta tocar nada más.
- Un fallo de Discord nunca rompe la sincronización de partidos y pagos: solo queda escrito en el registro.
- Si Discord no responde, los avisos no se anotan y se reintentan en la ejecución siguiente (mientras no pasen las 3 horas).
