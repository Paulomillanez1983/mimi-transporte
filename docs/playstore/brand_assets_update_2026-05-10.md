# MIMI GO - Brand assets update

Fecha: 2026-05-10

## Resumen

Se actualizo la identidad visual publica de MIMI Servicios con dos variantes:

- Cliente: `MIMI GO`
- Prestador / Partners: `MIMI GO PARTNERS`

Los assets se conectaron a previews sociales, PWA/TWA manifests, iconos de app, splash/login y assets requeridos para Play Store.

## Assets principales

Cliente:

- OG/social: `assets/og/og-mimigo-client-2026.png`
- Splash: `assets/brand/mimigo-client-splash-1536x1024.png`
- Wordmark: `mimi-servicios/assets/brand/mimigo-client-wordmark.png`
- Iconos PWA: `assets/icons/mimigo-client-icon-192.png`, `assets/icons/mimigo-client-icon-512.png`, `assets/icons/mimigo-client-icon-512-maskable.png`
- Play Store icon: `docs/playstore/assets/mimigo-clientes-icon-512.png`
- Play Store feature graphic: `docs/playstore/assets/mimigo-clientes-feature-graphic.png`

Partners:

- OG/social: `assets/og/og-mimigo-partners-2026.png`
- Splash: `assets/brand/mimigo-partners-splash-1536x1024.png`
- Wordmark: `mimi-servicios/assets/brand/mimigo-partners-wordmark.png`
- Iconos PWA: `assets/icons/mimigo-partners-icon-192.png`, `assets/icons/mimigo-partners-icon-512.png`, `assets/icons/mimigo-partners-icon-512-maskable.png`
- Play Store icon: `docs/playstore/assets/mimigo-partners-icon-512.png`
- Play Store feature graphic: `docs/playstore/assets/mimigo-partners-feature-graphic.png`

## Integracion

- `/servicios` y `mimi-servicios/cliente.html` usan `og-mimigo-client-2026.png`.
- `/prestador` y `mimi-servicios/prestador.html` usan `og-mimigo-partners-2026.png`.
- `manifest.json`, `manifest-clientes.json` y `mimi-servicios/manifest.json` usan iconos cliente.
- `manifest-partners.json` y `mimi-servicios/manifest-prestador.json` usan iconos partners.
- El splash/login de prestador usa `mimigo-partners-splash-1536x1024.png` y `mimigo-partners-wordmark.png`.
- Service Workers actualizados para evitar cache viejo de iconos.
- Push notifications usan icono cliente o partners segun URL destino.

## Validacion pendiente

- Redes sociales pueden cachear previews antiguos. Para refrescar de inmediato, usar los validadores oficiales de cada red despues del deploy.
- Play Console debe subir los AAB finales y confirmar iconos/feature graphics desde `docs/playstore/assets`.
