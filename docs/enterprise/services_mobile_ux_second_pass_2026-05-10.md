# MIMI Servicios - Mobile UX Second Pass - 2026-05-10

## Resumen CTO

Se aplico una segunda pasada quirurgica sobre el cliente de MIMI Servicios, sin tocar backend, RLS, realtime ni Edge Functions. El foco fue compactar la confirmacion de solicitud y reorganizar el resumen posterior para separar servicio actual, novedades, pago, busqueda y servicios anteriores.

## Cambios aplicados

- La card "Confirmar solicitud" ahora usa menor padding, menor gap, altura adaptable, scroll interno y acciones sticky dentro del modal.
- El titulo ya no queda pegado ni cortado en mobile.
- El bloque de cantidad/precio queda separado de los botones y con densidad mas compacta.
- "Resumen del servicio" ahora prioriza:
  - Novedades de este servicio.
  - Prestador elegido.
  - Detalle de pago.
  - Busqueda de prestador.
  - Servicios anteriores.
- Las notificaciones del panel principal se filtran por la solicitud activa; el drawer conserva el historial general.
- "Pagos y plataforma" paso a "Detalle de pago" y se muestra como bloque colapsable.
- "Matching" paso a "Busqueda de prestador" y el copy tecnico fue reemplazado por textos de usuario.
- El service worker y los assets del cliente fueron cache-busteados para forzar refresco.

## Archivos modificados

- `mimi-servicios/cliente.html`
- `mimi-servicios/src/ui/render-client.js`
- `mimi-servicios/styles/client.css`
- `mimi-servicios/sw-2026.js`
- `qa/mobile-ux-confirmation.spec.js`

## QA ejecutado

| Check | Estado | Resultado |
| --- | --- | --- |
| `node --check mimi-servicios/src/ui/render-client.js` | PASSED | Sintaxis OK |
| `node --check mimi-servicios/src/main-client.js` | PASSED | Sintaxis OK |
| `node --check mimi-servicios/sw-2026.js` | PASSED | Sintaxis OK |
| `node --check qa/mobile-ux-confirmation.spec.js` | PASSED | Sintaxis OK |
| `node qa/audit-routes.js` | PASSED | Rutas, manifests y service workers OK |
| `node qa/audit-encoding.js` | PASSED | Sin findings |
| `git diff --check` | PASSED | Solo warnings CRLF esperados |
| Playwright mobile 360/390/430 | PASSED | Modal sin cortes ni overflow critico |
| Orden visual de resumen | PASSED | Servicio actual aparece antes de historial |
| `node qa/audit-frontend-production.js` | NOT_EXECUTED | Script reporta `playwright_not_available` en runtime Node local |
| E2E autenticado | BLOCKED_BY_ENVIRONMENT | Variables `MIMI_E2E_*` y Supabase no estaban cargadas en el proceso |

## Evidencia visual

- Screenshot local 360px: `C:\tmp\mimi-confirm-360.png`
- Screenshot local 390px: `C:\tmp\mimi-confirm-390.png`
- Screenshot local 430px: `C:\tmp\mimi-confirm-430.png`

## Riesgos residuales

- Si las notificaciones productivas llegan sin `request_id` o metadata equivalente, el panel "Novedades de este servicio" puede quedar vacio aunque el drawer general tenga eventos. El codigo soporta `request_id`, `service_request_id`, `svc_request_id` y metadata JSON.
- El E2E autenticado no se ejecuto porque las variables no estaban disponibles en este proceso.

## Estado

Frontend mobile UX second pass listo para commit y deploy. Sin cambios de backend.
