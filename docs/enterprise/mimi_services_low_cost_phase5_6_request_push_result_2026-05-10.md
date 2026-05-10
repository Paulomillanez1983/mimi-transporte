# MIMI Servicios - Fase 5/6 request -> push -> prestador

Fecha: 2026-05-10

## Resumen

Se cerro una mejora acotada del flujo cliente -> solicitud -> push -> prestador con enfoque low-cost:

- El cliente ya no pide permiso push al iniciar la app.
- El cliente intenta registrar push sin prompt si el permiso ya estaba concedido.
- El prompt de push se dispara en contexto, despues de confirmar una solicitud.
- El prestador intenta registrar push sin prompt al iniciar.
- El prompt de push del prestador se dispara en contexto, al ponerse online.
- Se elimino el listener global que pedia permiso de notificaciones al primer click sin registrar device.
- La solicitud del cliente ahora muestra un flujo simple: solicitud enviada, prestador avisado, esperando respuesta, servicio.
- Se agrego accion de actualizar estado sin depender de realtime agresivo.

## Diagnostico

El backend ya tenia los puntos principales:

- `svc-create-request` crea solicitud, oferta y notificacion.
- `_shared/push-notifications.ts` usa FCM HTTP v1 con service account y fallback legacy.
- `svc-provider-respond-offer` notifica cambios al cliente.
- Realtime se mantiene filtrado por request/provider y no se amplio.

Los problemas de UX/costo estaban en frontend:

- Cliente pedia push demasiado temprano.
- Prestador tenia doble camino de permiso: registro FCM y un listener global de `Notification.requestPermission()`.
- Cliente podia enviar solicitud y quedar con poca claridad mientras esperaba respuesta.
- No habia accion explicita de refresh bajo demanda para estados de solicitud.

## Cambios aplicados

Archivos modificados:

- `mimi-servicios/src/main-client.js`
  - `registerCurrentDevice({ prompt })`.
  - registro silencioso al boot.
  - prompt contextual despues de confirmar solicitud.
  - accion `refresh` para solicitud activa.
  - accion `rate` con feedback claro si aun no corresponde.

- `mimi-servicios/src/main-provider.js`
  - build `2026.05.10.10`.
  - `registerProviderPushToken({ prompt })`.
  - registro silencioso al boot.
  - prompt contextual al ponerse online.
  - eliminado prompt global al primer click.

- `mimi-servicios/src/ui/render-client.js`
  - estado visual de solicitud en cuatro pasos.
  - copy claro para solicitud enviada, prestador avisado, esperando respuesta y servicio.
  - boton `Actualizar estado` para flujo low-cost.

- `mimi-servicios/styles/client.css`
  - estilos del nuevo panel de progreso de solicitud.

- `mimi-servicios/cliente.html`
  - cache bust `main-client.js?v=2026.05.10.9`.

- `mimi-servicios/prestador.html`
  - cache bust `main-provider.js?v=2026.05.10.10`.

## Arquitectura low-cost resultante

El flujo recomendado queda:

1. Cliente confirma domicilio y prestador.
2. Cliente confirma solicitud.
3. Frontend registra push en contexto si el usuario acepta.
4. Edge Function crea request, offer, conversation y notification.
5. Backend despacha push FCM al prestador si tiene device registrado.
6. Cliente ve estado claro y puede actualizar bajo demanda.
7. Prestador online registra push en contexto y recibe futuras solicitudes.
8. Realtime queda como mejora filtrada, no como dependencia masiva global.

## QA ejecutado

- `node --check mimi-servicios/src/main-client.js` OK.
- `node --check mimi-servicios/src/main-provider.js` OK.
- `node --check mimi-servicios/src/ui/render-client.js` OK.
- `node --check mimi-servicios/src/services/service-api.js` OK.
- `node qa/audit-routes.js` OK.
- `node qa/audit-encoding.js` OK.
- `git diff --check` OK, solo warnings de CRLF esperados por Windows.

## QA pendiente / no ejecutado aun

- E2E autenticado real: `BLOCKED_BY_ENVIRONMENT`.
  - Faltan variables locales QA: `MIMI_SUPABASE_URL`, `MIMI_SUPABASE_ANON_KEY`, `MIMI_E2E_CLIENT_EMAIL`, `MIMI_E2E_CLIENT_PASSWORD`, `MIMI_E2E_PROVIDER_EMAIL`, `MIMI_E2E_PROVIDER_PASSWORD`, `MIMI_E2E_ADMIN_EMAIL`, `MIMI_E2E_ADMIN_PASSWORD`.
- Validacion push nativa real: requiere navegador/dispositivo con permisos, service worker activo y token FCM registrado.
- Deploy produccion: pendiente en esta fase hasta commit/push/deploy.

## Riesgos residuales

- El prompt de notificaciones depende de reglas del navegador. Se dispara en contexto, pero algunos navegadores pueden bloquearlo si consideran que la activacion de usuario ya expiro por flujos async.
- Push en segundo plano requiere que el service worker y Firebase Messaging esten activos en el navegador/TWA del usuario.
- Para escala masiva, mantener este modelo: push + estado bajo demanda + realtime filtrado solo para requests activas.

## Como probar manualmente

Cliente:

1. Entrar a `/mimi-servicios/cliente`.
2. Buscar rubro y prestador.
3. Confirmar solicitud.
4. Ver panel: solicitud enviada -> prestador avisado -> esperando respuesta.
5. Tocar `Actualizar estado`.
6. Confirmar que no hay prompt push al abrir la app, solo en contexto.

Prestador:

1. Entrar a `/mimi-servicios/prestador`.
2. Iniciar sesion como prestador.
3. Tocar online.
4. Confirmar que se pide permiso push en contexto.
5. Confirmar que la ubicacion se toma como snapshot y no inicia tracking permanente.
