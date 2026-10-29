# Meter la app de apuestas dentro de tu programa

Esto es para el Claude Code (o quien sea) del programa de cada colega.

La app vive en un solo sitio: **https://pmbanks.github.io/apuestas/**
No la copies: enséñala dentro de tu programa. Así, cuando PM cambie algo, te llega solo.

## Qué hay que hacer

Añade una pestaña o sección "Apuestas" que muestre esa dirección dentro:

- **Programa web o PWA:**
  `<iframe src="https://pmbanks.github.io/apuestas/" title="Apuestas" style="width:100%;height:100%;border:0" allow="clipboard-write"></iframe>`
- **Electron:** una `<webview>` o un `WebContentsView` con esa dirección.
- **Tauri:** una ventana o webview con esa dirección.
- **Si tu programa no puede enseñar una web dentro:** un botón que la abra en el navegador.

## Entrar

Usuario y contraseña: te los da PM. No los guardes en el código ni en el repo.
Se entra una vez dentro de la pestaña y ya se queda.

## No hace falta

- Ninguna clave ni cuenta de Supabase.
- Copiar ficheros de la app.
- Tocar nada cuando PM la actualice.
