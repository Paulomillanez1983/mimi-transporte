# MIMI Servicios - Fase 2 UX async enterprise

Fecha: 2026-05-10
Alcance: feedback visual y prevencion de doble accion en flujos criticos cliente/prestador.

## Diagnostico

El cliente ya tenia loading en la busqueda de prestadores, pero podia repetir acciones criticas por eventos duplicados o doble toque rapido. El prestador usaba loading global, pero acciones como online/offline, aceptar/rechazar oferta y avanzar estado de servicio no tenian bloqueo exclusivo por accion.

## Cambios aplicados

- `mimi-servicios/src/main-client.js`
  - Se agrego `clientPendingActions`.
  - Se agrego `runClientAction()`.
  - Busqueda de prestadores queda protegida contra doble submit.
  - `Solicitar`, cancelar request y acciones de pago quedan con loader por boton y guard anti doble toque.

- `mimi-servicios/src/main-provider.js`
  - Build actualizado a `2026.05.10.9`.
  - Se agrego `pendingActions`.
  - Se agrego `runProviderAction()`.
  - Online/offline, aceptar oferta, rechazar oferta y accion de servicio quedan con loader por boton y guard anti doble toque.

- `mimi-servicios/cliente.html`
  - Cache bust de `main-client.js` a `2026.05.10.8`.

- `mimi-servicios/prestador.html`
  - Cache bust de `main-provider.js` a `2026.05.10.9`.

## Riesgos

- Riesgo bajo: no cambia backend ni estados de negocio.
- Si una accion tarda mucho, el boton queda ocupado hasta que la promesa resuelve o falla. Esto es intencional para evitar doble solicitud.
- E2E autenticado no se pudo ejecutar por falta de variables locales.

## QA ejecutado

- `node --check mimi-servicios/src/main-client.js` -> OK
- `node --check mimi-servicios/src/main-provider.js` -> OK
- `node --check mimi-servicios/src/services/service-api.js` -> OK
- `node qa/audit-routes.js` -> OK
- `node qa/audit-encoding.js` -> OK
- `git diff --check` -> OK, solo advertencias CRLF de Windows

## QA no ejecutado

- `node qa/enterprise-global-e2e.js` -> `BLOCKED_BY_ENVIRONMENT`
  - Faltan variables E2E locales de Supabase y usuarios test.

## Como probar manualmente

1. En `/servicios`, buscar prestadores y tocar varias veces rapido `Buscar prestadores`.
2. Confirmar que el boton queda ocupado y no duplica la busqueda.
3. Tocar varias veces rapido `Solicitar`.
4. Confirmar que no duplica la solicitud.
5. En `/prestador`, tocar online/offline rapido.
6. Confirmar que el boton muestra estado de carga y no dispara acciones duplicadas.
7. En una oferta, tocar aceptar/rechazar rapido.
8. Confirmar que solo corre una accion.

## Estado

Fase 2 aplicada localmente y lista para deploy.
