# Push y tracking enterprise - 2026-05-10

## Alcance

Se aplico la capa de notificaciones push nativas y tracking realtime para MIMI Servicios y MIMI Transporte, usando Firebase Cloud Messaging HTTP v1 con service account del proyecto.

## Servicios

- `svc-create-request` notifica al prestador online cuando recibe una nueva solicitud.
- `svc-provider-respond-offer`, `svc-provider-en-route`, `svc-provider-arrived`, `svc-start-service`, `svc-complete-service` y `svc-cancel-request` notifican al cliente/prestador segun el cambio de estado.
- `svc-track-location` guarda ubicacion del prestador en `svc_tracking`.
- `mimi-servicios/src/services/push.js` registra FCM token con Service Worker.
- La card flotante del prestador se hizo mas compacta y el mapa muestra ruta proveedor -> cliente sin exponer el domicilio completo en la card.

## Transporte

- `send_push` queda alineada con FCM HTTP v1 y soporta:
  - `FIREBASE_SERVICE_ACCOUNT_JSON`
  - `FIREBASE_PROJECT_ID`
  - `FIREBASE_CLIENT_EMAIL`
  - `FIREBASE_PRIVATE_KEY`
- `dispatch-viaje` envia push nativa al chofer cuando se crea una oferta.
- `aceptar-viaje-multi`, `iniciar-viaje-ts`, `completar-viaje-ts` y `cancelar-viaje-ts` notifican al cliente o chofer segun corresponda.
- `js/driver-app.js` solicita/actualiza push cuando el chofer se conecta.
- `js/driver-app.js` inserta tracking en `viaje_tracking` mientras el viaje esta asignado/en curso.
- `viaje_tracking` ahora tiene RLS de participantes y esta publicado en `supabase_realtime`.

## Seguridad

- No se expone `service_role` en frontend.
- Los tokens FCM ya no se imprimen en consola.
- `viaje_tracking` solo permite:
  - INSERT del chofer asignado.
  - SELECT del cliente del viaje, chofer asignado o admin.
- Las funciones publicas de transporte conservaron `verify_jwt=false` donde ya estaba asi para no romper compatibilidad del frontend actual.

## QA ejecutado

- `node --check js/driver-app.js`
- `node --check js/push-fcm.js`
- `node --check js/push-support.js`
- `node --check mimi-servicios/src/main-provider.js`
- `node --check mimi-servicios/src/main-client.js`
- `node --check mimi-servicios/src/services/service-api.js`
- `node --check mimi-servicios/src/services/push.js`
- `node qa/audit-routes.js`
- `node qa/audit-supabase.js`
- `node qa/audit-encoding.js`
- `git diff --check`
- Supabase migration aplicada y validada:
  - policies `viaje_tracking_select_participants_or_admin`
  - policy `viaje_tracking_insert_assigned_driver`
  - publication realtime `viaje_tracking`
- Edge Functions desplegadas y versionadas:
  - `send_push` v30
  - `dispatch-viaje` v53
  - `aceptar-viaje-multi` v20
  - `iniciar-viaje-ts` v24
  - `completar-viaje-ts` v25
  - `cancelar-viaje-ts` v30

## Pendiente de validacion en dispositivo real

- Aceptar permiso de notificaciones en Android/Chrome/TWA.
- Confirmar token en `push_tokens` para cliente y chofer.
- Crear viaje real con chofer online.
- Bloquear pantalla o abrir otra app.
- Confirmar que la push aparece por encima de otras apps.
- Confirmar que el cliente ve tracking realtime desde `viaje_tracking`.

Nota: en web/PWA Android la entrega por encima de otras apps depende de permiso del usuario, token FCM valido, Service Worker activo y politicas del sistema operativo/navegador. El backend y frontend ya quedan preparados para ese comportamiento.
