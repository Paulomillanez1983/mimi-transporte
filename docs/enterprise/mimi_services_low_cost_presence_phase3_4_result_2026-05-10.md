# MIMI Servicios - Presencia low-cost - Fases 3 y 4

Fecha: 2026-05-10
Alcance: prestador online/offline, ubicacion snapshot y tracking acotado.

## Diagnostico

El panel prestador ya tenia una proteccion de tracking por distancia/heartbeat, pero al ponerse online arrancaba un intervalo de geolocalizacion cada 10 segundos aunque no hubiera un servicio activo. Eso no encaja con la arquitectura low-cost definida para MIMI Servicios.

## Cambios aplicados

- `mimi-servicios/src/main-provider.js`
  - Build actualizado a `2026.05.10.8`.
  - Al pasar a `ONLINE_IDLE` se corta cualquier tracking previo.
  - Se usa la ubicacion snapshot devuelta por `updateProviderStatus()` para actualizar estado/mapa.
  - No se inicia tracking permanente al ponerse online.
  - Se agrega heartbeat liviano cada 15 minutos para actualizar presencia sin GPS.
  - El tracking sigue activo solo cuando el prestador acepta un servicio inmediato.
  - Al completar servicio, se detiene tracking y vuelve el heartbeat liviano.
  - Al cerrar sesion, se limpian tracking y heartbeat.

- `mimi-servicios/src/services/service-api.js`
  - Nueva funcion `touchProviderPresence(providerId)`.
  - Actualiza solo `last_seen_at` en `svc_providers`.
  - No solicita geolocalizacion.
  - No toca estado, categoria, precios ni datos sensibles.

- `mimi-servicios/prestador.html`
  - Cache bust del script de prestador a `2026.05.10.8`.

## Modelo resultante

- Online: una captura de ubicacion + `status=ONLINE_IDLE`.
- Espera: heartbeat liviano cada 15 minutos, sin GPS.
- Solicitud aceptada inmediata: tracking controlado por distancia/heartbeat hacia `svc-track-location`.
- Servicio terminado u offline: tracking detenido.

## Riesgos

- Riesgo bajo-medio: cambia comportamiento de presencia del prestador.
- Si RLS impide actualizar `last_seen_at` con `touchProviderPresence`, el heartbeat fallara con warning pero no rompe el flujo online ni solicitud.
- La busqueda de prestadores actualmente no filtra por frescura de `last_seen_at`; esa mejora queda para una migracion/edge function posterior si se decide endurecer presencia.

## QA ejecutado

- `node --check mimi-servicios/src/main-provider.js` -> OK
- `node --check mimi-servicios/src/services/service-api.js` -> OK
- `node qa/audit-routes.js` -> OK
- `node qa/audit-encoding.js` -> OK
- `node qa/audit-supabase.js` -> OK
- `node qa/backend-hardening-static.js` -> OK
- `git diff --check` -> OK, solo advertencias CRLF de Windows

## QA no ejecutado

- `node qa/enterprise-global-e2e.js` -> `BLOCKED_BY_ENVIRONMENT`
  - Faltan variables E2E locales: `MIMI_SUPABASE_URL`, `MIMI_SUPABASE_ANON_KEY`, emails y passwords de cliente/prestador/admin test.

## Como probar manualmente

1. Entrar a `/prestador`.
2. Poner el prestador online.
3. Confirmar que aparece online y no queda haciendo tracking continuo.
4. Crear una solicitud inmediata desde `/servicios`.
5. Aceptar desde prestador.
6. Confirmar que ahi si inicia tracking de servicio.
7. Completar el servicio.
8. Confirmar que vuelve a online y se corta el tracking.

## Estado

Fases 3 y 4 aplicadas localmente y listas para deploy.
