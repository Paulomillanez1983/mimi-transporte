# MIMI Maps Enterprise Audit

Fecha: 2026-05-10

## Resumen ejecutivo

El proyecto ya tiene una base avanzada: MapLibre GL en transporte, chofer, admin y MIMI Servicios; tracking realtime para viajes y servicios; Edge Functions productivas; PWA/service workers; push FCM HTTP v1; RLS endurecido; y rutas limpias en Vercel.

El riesgo principal no es falta de funcionalidad, sino dispersion: cada vertical inicializa mapas, markers, rutas, resize y realtime con patrones propios. Esto funciona, pero hace dificil mantener una experiencia tipo Uber/Google Maps de forma consistente.

La mejora recomendada es crear una capa modular "MIMI Maps" incremental: helpers compartidos para coordenadas, WebGL, camara, markers, rutas y performance mobile. La primera integracion segura debe ir sobre MIMI Servicios, donde `mimi-servicios/src/services/map.js` ya concentra el mapa cliente/prestador y se puede mejorar sin tocar RLS ni Edge Functions.

## Estado actual

### Frontend principal

- Cliente transporte: `index.html`, `js/cliente-transporte-v2/*`, `js/cliente-chofer-tracking.js`, `mimi-transporte.css`.
- Chofer transporte: `chofer-panel.html`, `js/driver-app.js`, `js/map-service.js`, `js/trip-manager.js`, `css/panel.css`.
- Cliente servicios: `mimi-servicios/cliente.html`, `mimi-servicios/src/main-client.js`, `mimi-servicios/src/ui/render-client.js`, `mimi-servicios/styles/client.css`.
- Prestador servicios: `mimi-servicios/prestador.html`, `mimi-servicios/src/main-provider.js`, `mimi-servicios/src/ui/render-provider.js`, `mimi-servicios/styles/provider.css`.
- Admin: `admin/admin-panel.html`, `admin/admin-map.js`, `admin/admin-services-providers.js`, `admin/admin-transport.js`.

### MapLibre

- Transporte cliente usa `js/cliente-transporte-v2/ui-geocoding-waypoints-map.js`.
- Transporte chofer usa `js/map-service.js` con OSRM, modo navegacion, reroute y seguimiento.
- Servicios cliente/prestador usan `mimi-servicios/src/services/map.js` para markers y ruta simple.
- Prestador servicios tambien tiene mapa operativo propio en `mimi-servicios/src/main-provider.js`.
- Admin usa `admin/admin-map.js`.
- Hay versiones distintas de MapLibre: 4.7.1 en servicios, 5.21.1 en chofer, 5.22.0 en admin.

### Realtime y tracking

- Viajes:
  - `viaje_tracking` existe, tiene RLS y esta publicado en realtime.
  - Chofer publica tracking desde `js/driver-app.js`.
  - Cliente transporte consume tracking con `js/cliente-chofer-tracking.js`.
- Servicios:
  - `svc_tracking` existe y se alimenta por `svc-track-location`.
  - Cliente servicios escucha tracking con `mimi-servicios/src/services/realtime.js`.
  - Prestador publica tracking desde `mimi-servicios/src/controllers/provider-controller.js` y tambien flujo legacy en `main-provider.js`.

### PWA/TWA

- Manifests presentes:
  - `manifest-clientes.json`
  - `manifest-partners.json`
  - `manifest-driver.json`
  - `mimi-servicios/manifest.json`
  - `mimi-servicios/manifest-prestador.json`
- Service workers:
  - `service-worker.js`
  - `service-worker-clientes.js`
  - `firebase-messaging-sw.js`
  - `mimi-servicios/sw-2026.js`
- `.well-known/assetlinks.json` existe.

### Vercel

- `vercel.json` tiene `cleanUrls`, `trailingSlash: false` y rewrites para `/`, `/cliente`, `/viaje`, `/chofer`, `/servicios`, `/prestador`, `/operadores`, `/privacidad`, `/terminos`, `/delete-account`.
- Headers anti-cache existen para `mimi-servicios/sw-2026.js` y manifests de servicios.

## Riesgos criticos

1. Logica de mapas duplicada por vertical.
   - Evidencia: `js/map-service.js`, `mimi-servicios/src/services/map.js`, `main-provider.js`, `admin-map.js`, `ui-geocoding-waypoints-map.js`.
   - Impacto: bugs mobile y diferencias de UX al tocar una vertical.
   - Solucion: capa modular MIMI Maps incremental.

2. Resize/camara dispersos.
   - Evidencia: multiples `resize`, `easeTo`, `fitBounds`, timeouts manuales.
   - Impacto: mapas negros, mal centrados o tapados por bottom sheets en Android.
   - Solucion: helpers centralizados de resize y fit con padding mobile.

3. Markers inconsistentes.
   - Evidencia: markers inline con estilos JS y CSS repartido.
   - Impacto: UX visual no uniforme entre servicios/transporte.
   - Solucion: markers premium con clases comunes.

## Riesgos medios

- `mimi-servicios/src/services/realtime.js` usa un arreglo global de canales y `disconnectRealtime()` limpia todo; funciona, pero limita coexistencia de canales por dominio funcional.
- `mimi-servicios/src/services/map.js` mueve camara en cada update, lo que puede pelear con el gesto del usuario.
- Los service workers cachean assets core, pero cualquier nuevo modulo compartido debe agregarse a cache para evitar version drift.
- Algunos textos visibles todavia muestran problemas de encoding historicos en HTML fuente, aunque el auditor actual no reporta hallazgos.

## Riesgos bajos

- No hay `package.json`; la QA depende de scripts Node propios y checks de sintaxis.
- MapLibre se carga por CDN. Es simple y compatible, pero para TWA enterprise conviene evaluar pin local o integrity en una fase futura.

## Quick wins seguros

1. Crear `js/mimi-maps/map-core.js`, `map-markers.js`, `map-routing.js`.
2. Integrar esos helpers en `mimi-servicios/src/services/map.js`.
3. Crear `mimi-servicios/styles/map-ui.css` y `css/mimi-maps.css` para markers/controles compartidos.
4. Actualizar cache busting y service worker de servicios.
5. Crear `qa/audit-mimi-enterprise.js` para rutas, manifests, SW, modulos MIMI Maps y checks de duplicidad basica.

## Roadmap recomendado

### Fase segura actual

- Modularizar helpers de mapa.
- Mejorar markers y ruta visual en servicios.
- Mejorar fit de camara para bottom sheets mobile.
- Agregar QA enterprise.
- Deployar si todos los checks pasan.

### Fase siguiente

- Migrar `js/map-service.js` del chofer para usar mas helpers compartidos sin cambiar su motor OSRM.
- Separar realtime por dominios en servicios para que notificaciones, tracking y requests no dependan de un unico `disconnectRealtime()`.
- Crear E2E Playwright real para mapa en mobile 360/390/430.
- Consolidar version de MapLibre o documentar la razon de cada version.

## Criterio de no regresion

- No tocar RLS ni schema.
- No tocar Edge Functions salvo bug real.
- No cambiar estados ni contratos de API.
- Mantener rutas existentes.
- Mantener service workers funcionando.
- Ejecutar QA local y validar produccion tras deploy.
