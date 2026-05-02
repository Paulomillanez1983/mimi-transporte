[README.md](https://github.com/user-attachments/files/27308768/README.md)

# MIMICar Cliente Transporte V2 desacoplado

Esta versión es paralela y segura: no reemplaza `index.html`.

## Archivos

- `index-v2.html`: HTML principal sin JavaScript inline gigante.
- `js/cliente-transporte-v2/00-oauth-redirect.js`: redirección temprana de OAuth servicios/prestador.
- `js/cliente-transporte-v2/01-supabase-rest-client.js`: Supabase REST/Auth/Realtime + helpers de red.
- `js/cliente-transporte-v2/02-geocoding-client.js`: cache, recientes y búsqueda de direcciones.
- `js/cliente-transporte-v2/03-config-auth-legal.js`: configuración, helpers, sesión, login, legal gate.
- `js/cliente-transporte-v2/04-state-notifications-support.js`: estado global, notificaciones, viaje activo, soporte.
- `js/cliente-transporte-v2/05-ui-geocoding-waypoints-map.js`: UI loading, autocomplete, waypoints, mapa y ruta.
- `js/cliente-transporte-v2/06-quote-actions-next-ui.js`: cotización, acciones, confirmación y UI final.

## Cómo probar

Subí estos archivos a la raíz del proyecto y abrí:

`https://mimi-transporte.vercel.app/index-v2.html`

No borres ni reemplaces `index.html` hasta probar login, geocoding, cotización, mapa, confirmación, soporte y chat.
