# MIMI MapLibre, GPS y Realtime Capacity Audit - 2026-05-10

## 1. Resumen ejecutivo

Se inspecciono el repo real `mimi-transporte` con foco en MapLibre GL, GPS, Supabase Realtime, PWA/TWA y capacidad de usuarios simultaneos. No se reemplazo MapLibre, no se modifico RLS, no se tocaron pagos, KYC ni backend sensible.

Resultado principal:

- Transporte ya tiene tracking fino tipo viaje: GPS de chofer, `viaje_tracking`, canal realtime filtrado por `viaje_id`, mapa con ruta y camara de seguimiento.
- Servicios ya tiene tracking de prestador, `svc_tracking`, canales filtrados por `request_id`, mapa cliente/prestador y push backend.
- La presion principal de capacidad no esta en MapLibre en si, sino en frecuencia GPS + Postgres Changes + escrituras a Supabase.
- Se encontro una duplicacion real en transporte: `location-tracker.js` escribia `choferes` cada ~4s y `driver-app.js` volvia a persistir ubicacion. Se elimino esa duplicacion.
- Para prestadores de Servicios se bajo el tracking backend a 1 km o heartbeat cada 3 minutos, como criterio orientado a capacidad. El mapa local puede seguir actualizando posicion, pero el backend/realtime no se quema por movimientos chicos.
- Para que el cliente no vea al prestador "clavado", se agrego simulacion visual cliente-side: el marcador avanza como posicion estimada entre puntos reales y se reconcilia cuando llega la ubicacion real.
- No se puede declarar una capacidad exacta sin conocer el plan Supabase/Vercel, metricas reales, CPU/IO de Postgres, latencia Edge Functions, cuotas de tiles y load testing.

Fuentes externas usadas:

- Supabase Realtime limits: https://supabase.com/docs/guides/realtime/rate-limits
- Supabase Postgres Changes scaling notes: https://supabase.com/docs/guides/realtime/postgres-changes

## 2. Que se inspecciono

- `js/map-service.js`
- `js/location-tracker.js`
- `js/driver-app.js`
- `js/trip-manager.js`
- `js/supabase-client.js`
- `js/cliente-chofer-tracking.js`
- `js/cliente-transporte-v2/ui-geocoding-waypoints-map.js`
- `js/cliente-transporte-v2/state-notifications-support.js`
- `js/mimi-maps/map-core.js`
- `js/mimi-maps/map-markers.js`
- `js/mimi-maps/map-routing.js`
- `mimi-servicios/src/services/map.js`
- `mimi-servicios/src/services/realtime.js`
- `mimi-servicios/src/main-client.js`
- `mimi-servicios/src/main-provider.js`
- `mimi-servicios/src/controllers/provider-controller.js`
- `mimi-servicios/supabase/functions/svc-track-location/index.ts`
- `admin/admin-map.js`
- `vercel.json`, manifests y service workers via QA local.

## 3. Usos reales de MapLibre encontrados

| Archivo | Linea aprox. | Funcion/clase | Que hace | Riesgo | Estado |
|---|---:|---|---|---|---|
| `js/map-service.js` | 83 | `MapService.init` | Crea mapa chofer con MapLibre, guard anti doble init, estilo Carto, `antialias:false`, `preserveDrawingBuffer:false`. | Bajo. Buena base mobile. | Optimizado razonable. |
| `js/map-service.js` | 249-281 | `_addCustomLayers` | Crea source/layers de ruta una sola vez. | Bajo. | Correcto. |
| `js/map-service.js` | 552-589 | `updateDriverPosition` | Mueve marker chofer, actualiza camara y ruta restante. | Medio si GPS dispara muy seguido; tiene throttle de camara 400ms y reroute 8s. | Correcto para transporte. |
| `js/map-service.js` | 654-930 | `showRoute` / `_getOSRMRoute` | Ruta OSRM con cache por coordenadas redondeadas. | Medio por OSRM publico si escala. | Requiere proveedor/routing propio para escala alta. |
| `js/mimi-maps/map-core.js` | 75 | `createMimiMap` | Helper comun: MapLibre con `antialias:false`, sin rotacion, sin world copies. | Bajo. | Correcto. |
| `js/mimi-maps/map-markers.js` | 17-47 | `createOrMoveMarker` | Reutiliza DOM marker si existe. | Bajo para 1-2 markers; no sirve para miles. | Correcto para tracking individual. |
| `js/mimi-maps/map-routing.js` | 23-132 | `ensureRouteLayers`, `updateRouteLine`, `updateRouteCoordinates` | GeoJSON source/layers reutilizables. | Bajo. | Correcto. |
| `mimi-servicios/src/services/map.js` | 82-122 | `initMap` | Singleton de mapa servicios; remueve mapa anterior antes de crear otro. | Bajo. | Correcto. |
| `mimi-servicios/src/services/map.js` | 45-79 | `fetchRoadRoute` | OSRM publico para ruta prestador-cliente, throttle 15s por key. | Medio/alto a escala por dependencia externa publica. | Para alto volumen conviene routing propio/cache. |
| `mimi-servicios/src/main-provider.js` | 484 | `initMap` provider legacy/current | Crea mapa del prestador. | Medio por coexistencia con modulo nuevo. | Funciona; conviene consolidar a `mimi-maps` luego. |
| `js/cliente-transporte-v2/ui-geocoding-waypoints-map.js` | 1184 | `initMapa` | Mapa cliente transporte con WebGL fallback. | Bajo/medio; archivo grande y legacy. | Funcional, refactor futuro recomendado. |
| `admin/admin-map.js` | 368 | `mountAdminMap` | Mapa admin, hasta 500 markers de choferes. | Medio si se quiere ver miles de choferes sin clustering. | Limite actual intencional 500. |

## 4. Usos reales de GPS/tracking encontrados

| Archivo | Linea aprox. | Frecuencia observada | Que hace | Riesgo |
|---|---:|---:|---|---|
| `js/location-tracker.js` | 69, 81, 237 | `watchPosition` + refresh cada 5s visible, 60s hidden | Captura GPS del chofer y llama callbacks. | Ya no escribe DB directo; antes duplicaba. |
| `js/driver-app.js` | 1358-1418 | `choferes`: 5s en viaje, 15s online, 30s offline; `viaje_tracking`: 5s en estados activos | Persistencia real chofer + tracking viaje. | Correcto para transporte, pero caro a gran escala. |
| `mimi-servicios/src/main-provider.js` | 3736-3780 | Timer 10s, envio backend solo si 1 km o 180s | Tracking prestador de Servicios. | Optimizado para capacidad. |
| `mimi-servicios/src/controllers/provider-controller.js` | 260-319 | Timer 12s, envio backend solo si 1 km o 180s | Variante modular/legacy defensiva. | Optimizado para capacidad. |
| `mimi-servicios/supabase/functions/svc-track-location/index.ts` | 84 | 1 insert por envio aceptado | Inserta `svc_tracking`, actualiza `svc_providers.last_lat/last_lng`. | Correcto; cada llamada usa Edge Function. |
| `js/cliente-chofer-tracking.js` | 310-430 | Realtime por `viaje_id` | Cliente recibe inserts de `viaje_tracking`. | Correcto; ruta dinamica throttle 4s. |
| `mimi-servicios/src/services/realtime.js` | 88-99 | Realtime por `request_id` | Cliente/prestador reciben `svc_tracking`. | Correcto; canales filtrados. |

## 5. Usos reales de Supabase Realtime encontrados

| Archivo | Canal | Filtro | Riesgo |
|---|---|---|---|
| `js/trip-manager.js` | `offers-${driverId}` | `viaje_ofertas.chofer_id=driverId` | Correcto. |
| `js/trip-manager.js` | `trips-*` | `viajes.chofer_id_uuid=driverId` | Correcto. |
| `js/trip-manager.js` | `trips-assigned-*` | `viajes.assigned_driver_id=driverId` | Duplicado por compatibilidad; aceptable. |
| `js/cliente-chofer-tracking.js` | `viaje-tracking-${viajeId}` | `viaje_tracking.viaje_id=viajeId` | Correcto. |
| `js/cliente-transporte-v2/state-notifications-support.js` | `viaje-estado-${viajeId}` | `viajes.id=viajeId` | Correcto. |
| `mimi-servicios/src/services/realtime.js` | `mimi-servicios-tracking-${requestId}` | `svc_tracking.request_id=requestId` | Correcto. |
| `mimi-servicios/src/services/realtime.js` | `mimi-servicios-requests-${requestId}` | `svc_requests.id=requestId`, `svc_request_offers.request_id=requestId` | Correcto. |
| `mimi-servicios/src/services/realtime.js` | `mimi-servicios-provider-offers-${providerId}` | `svc_request_offers.provider_id=providerId` | Correcto. |
| `mimi-servicios/src/main-provider.js` | provider notifications/offers/chat | `user_id`, `provider_id`, `conversation_id` | Correcto. |

No se detectaron suscripciones abiertas a tablas completas para tracking principal. Si se escala fuerte, el riesgo viene de Postgres Changes en si: Supabase documenta que cada cambio debe autorizarse contra cada suscriptor y puede volverse cuello de botella.

## 6. Cambios seguros aplicados

### 6.1 Transporte: eliminar escritura GPS duplicada

Archivo: `js/location-tracker.js`

Antes:

- `LocationTracker` capturaba GPS y tambien escribia `choferes` cada ~4s.
- `DriverApp` tambien escribia `choferes` cada 5/15/30s y `viaje_tracking` cada 5s.

Ahora:

- `LocationTracker` solo captura GPS y emite callbacks.
- `DriverApp` queda como unico dueño de persistencia GPS.

Impacto esperado:

- Chofer online idle: baja de hasta ~0.316 writes/s por chofer a ~0.067 writes/s por chofer.
- Chofer en viaje activo: baja de hasta ~0.65 writes/s por chofer a ~0.40 writes/s por chofer.

### 6.2 Servicios: prestador actualiza cada 1 km o heartbeat

Archivos:

- `mimi-servicios/src/main-provider.js`
- `mimi-servicios/src/controllers/provider-controller.js`
- `mimi-servicios/prestador.html` cache bust `2026.05.10.7`

Regla:

- Enviar primer punto al iniciar request.
- Luego enviar solo si se movio al menos 1000 metros.
- Si no se mueve, enviar heartbeat cada 180 segundos.
- Resetear tracking cuando cambia el `requestId`.

Impacto esperado:

- Antes: 1 envio cada 10-12s por servicio activo (~0.083 a 0.10 writes/s).
- Ahora: estacionario ~0.0056 writes/s; moviendose rapido ~0.008 a 0.017 writes/s segun velocidad.
- Reduccion aproximada: 6x a 18x en tracking de prestadores.

### 6.3 Servicios: simulacion visual sin escribir backend

Archivo: `mimi-servicios/src/services/map.js`

Regla:

- La simulacion solo vive en el navegador del cliente.
- No inserta filas en `svc_tracking`.
- No actualiza `svc_providers`.
- Usa el ultimo punto real del prestador y el domicilio del cliente.
- Si existe ruta OSRM, intenta avanzar sobre esa geometria; si no, usa interpolacion directa.
- El marcador se marca como estimado con `data-estimated="true"` y tooltip "Ubicacion estimada del prestador".
- Se limita al 88% del recorrido para no fingir llegada si no existe evento real.
- Al recibir nueva ubicacion real, el marcador se reconcilia con ese punto y reinicia la simulacion desde ahi.

Impacto esperado:

- UX viva para el cliente aunque el backend reciba puntos cada 1 km o 3 minutos.
- Costo backend casi igual al tracking optimizado.
- Riesgo controlado: no se muestra como posicion certificada ni se persiste.

## 7. Capacidad estimada

### Supuestos

- El plan real de Supabase del proyecto no fue verificado desde el repo.
- Se usan limites oficiales de Supabase Realtime por plan como techo externo.
- Se asume 1 a 2 suscriptores por evento de tracking activo.
- No se midio CPU/IO de Postgres, latencia Edge Functions, ni cuotas de Carto/OSRM.
- No se ejecuto load test real.

### Limites oficiales relevantes de Supabase Realtime

| Plan | Conexiones realtime | Mensajes/seg |
|---|---:|---:|
| Free | 200 | 100 |
| Pro | 500 | 500 |
| Pro sin spend cap / Team | 10,000 | 2,500 |
| Enterprise | 10,000+ | 2,500+ |

### Tabla de capacidad

| Metrica | Actual verificado | Actual probable | Optimizado esperado | Confianza | Evidencia |
|---|---:|---:|---:|---|---|
| Usuarios navegando sin mapa | NO VERIFICADO | Miles si son rutas estaticas cacheadas | Miles+ con CDN/cache correcto | Baja | Repo no define plan Vercel ni trafico real. |
| Usuarios con mapa abierto | NO VERIFICADO | Cientos a miles segun dispositivo/tiles | Igual; MapLibre corre en cliente | Baja | Mapas usan Carto/MapLibre; falta cuota tile y load test. |
| Conexiones realtime simultaneas | 200/500/10k segun plan | NO VERIFICADO por plan real | Igual, salvo upgrade/custom quota | Alta para docs, baja para proyecto | Supabase Realtime limits oficiales. |
| Choferes online idle enviando GPS | 1 update `choferes` cada 15s | Free/Pro limitan por conexiones antes que mensajes | 200 Free, 500 Pro, 10k Team si DB aguanta | Media | `driver-app.js` 15s online; duplicado eliminado. |
| Choferes en viaje activo | `choferes` cada 5s + `viaje_tracking` cada 5s = ~0.4 writes/s por chofer | Pro: hasta ~500 por conexiones; Team: ~3k-6k por mensajes si 1-2 subs | Igual sin cambiar UX de transporte | Media-baja | `driver-app.js` mantiene tracking fino; Supabase Postgres Changes puede bottleneck. |
| Prestadores en servicio activo | 1 km o 180s heartbeat + simulacion visual cliente-side | 10k conexiones con Team; mensajes aprox 56/s por 10k estacionarios | Mucho mejor que antes; 10k servicios activos es plausible si DB/Edge aguanta | Media | `main-provider.js`, `provider-controller.js` y `services/map.js` parcheados. |
| Viajes activos simultaneos | NO VERIFICADO | Centenas en Pro; miles bajos en Team con Postgres Changes | Miles bajos sin arquitectura nueva | Baja | Falta load testing; transporte usa 5s tracking. |
| Servicios activos simultaneos | NO VERIFICADO | Miles en Team por baja frecuencia GPS | 5k-10k con plan/DB adecuados | Baja-media | Tracking prestador ahora 1km/180s. |
| Writes GPS/seg transporte | ~0.4 por viaje activo | 100 viajes = 40 writes/s; 1000 = 400 writes/s | Sin duplicado: antes era hasta ~0.65 por viaje | Media | Calculo desde intervalos de codigo. |
| Writes GPS/seg servicios | ~0.0056-0.017 por prestador activo | 1000 = 6-17 writes/s; 10k = 56-167 writes/s | Optimizado frente a 83-100 writes/s por 1000 antes | Media | Calculo desde regla 1km/180s. |
| Eventos realtime/seg | Writes x subscriptores | 1-2x writes de tracking activo | Menor en servicios; transporte igual fino | Baja-media | Canales filtrados por request/viaje. |
| Renders mapa/seg | Depende de GPS recibido | Bajo en servicios; medio en viajes | Servicios baja fuerte; transporte throttle camara/ruta | Media | Markers reutilizados; route throttles 4s/8s/15s. |
| Memoria mobile por sesion mapa | NO VERIFICADO | MapLibre + DOM overlays, aceptable para 1 mapa | Igual; falta profiling real | Baja | No se pudo ejecutar Playwright/Chrome trace local. |

## 8. Formulas usadas

- Writes por segundo = usuarios activos * (1 / intervalo_segundos).
- Transporte activo despues del cambio = 1 write `choferes` cada 5s + 1 insert `viaje_tracking` cada 5s = 0.2 + 0.2 = 0.4 writes/s por chofer.
- Transporte activo antes = lo anterior + LocationTracker cada ~4s = 0.4 + 0.25 = 0.65 writes/s por chofer.
- Prestador estacionario = 1 / 180s = 0.0056 writes/s.
- Prestador por distancia = velocidad_km_h / 3600 writes/s si se envia cada 1 km. Ejemplo 30 km/h = 0.0083 writes/s.
- Realtime messages aproximados = writes relevantes * cantidad de suscriptores autorizados.

## 9. Riesgos actuales

### Criticos para escala alta

1. Postgres Changes no es ideal para tracking masivo de alta frecuencia.
   - Evidencia: `viaje_tracking` y `svc_tracking` se consumen via `postgres_changes`.
   - Impacto: a miles de viajes activos, cada insert debe pasar por WAL/realtime/RLS.
   - Mitigacion futura: usar Realtime Broadcast server-side para ubicacion efimera y persistir snapshots espaciados.

2. OSRM publico no es garantia para escala.
   - Evidencia: `router.project-osrm.org` en transporte y servicios.
   - Impacto: puede limitar o fallar en produccion alta.
   - Mitigacion futura: OSRM/Valhalla/GraphHopper propio o proveedor contratado con cache.

### Altos

1. Transporte mantiene 5s de tracking activo.
   - Es correcto para experiencia tipo Uber, pero caro.
   - Para escalar a 50k+ viajes activos se necesita arquitectura realtime distinta.

2. Admin map usa DOM markers sin clustering.
   - Evidencia: `admin/admin-map.js` limita a 500 rows.
   - Funciona para operacion actual; para miles debe pasar a GeoJSON layer cluster.

3. `TripManager` mantiene polling cada 3s.
   - Evidencia: `CONFIG.TRIP_REFRESH_INTERVAL = 3000`.
   - No se cambio porque ofertas tienen timeout corto y realtime es critico.
   - Futuro: usar push/realtime confiable y polling adaptativo.

### Medios

1. Archivos legacy grandes de cliente transporte tienen mucha logica acoplada.
2. Algunos logs de tracking son verbosos y pueden afectar debug mobile.
3. Falta profiling real de WebGL en Android gama baja.

## 10. QA ejecutado

| Comando | Estado | Resultado |
|---|---|---|
| `node --check js/location-tracker.js` | PASSED | Sin errores de sintaxis. |
| `node --check mimi-servicios/src/main-provider.js` | PASSED | Sin errores de sintaxis. |
| `node --check mimi-servicios/src/controllers/provider-controller.js` | PASSED | Sin errores de sintaxis. |
| `node --check mimi-servicios/src/services/map.js` | PASSED | Sin errores de sintaxis. |
| `node --check js/driver-map-light-2026.js` | PASSED | Sin errores de sintaxis. |
| `node --check js/driver-bootstrap-2026.js` | PASSED | Sin errores de sintaxis. |
| `node --check js/driver-app.js` | PASSED | Sin errores de sintaxis. |
| `node qa/audit-routes.js` | PASSED | Rutas, manifests y service workers OK. |
| `node qa/audit-encoding.js` | PASSED | Sin findings. |
| `node qa/audit-supabase.js` | PASSED | Tablas criticas presentes, sin service_role hardcodeado. |
| `node qa/backend-hardening-static.js` | PASSED | Hardening estatico OK. |
| `git diff --check` | PASSED con warnings | Solo warnings LF->CRLF. |
| `node qa/enterprise-global-e2e.js` | BLOCKED_BY_ENVIRONMENT | Faltan envs E2E y credenciales test en este entorno. |
| `node qa/audit-frontend-production.js` | SKIPPED | `playwright_not_available`. |

## 11. Validacion produccion posible

Se validaron HTTP 200 con `curl.exe`:

- `/`
- `/servicios`
- `/prestador`
- `/chofer`
- `/operadores`
- `/viaje`
- `/privacidad`
- `/delete-account`

No se pudo validar consola visual ni WebGL real en navegador porque Playwright no esta disponible en este entorno.

## 12. Recomendaciones por objetivo de escala

### Para 10k simultaneos

- Confirmar plan Supabase con 10k realtime connections.
- Mantener servicios con tracking 1km/180s.
- Medir `viaje_tracking` con load test.
- Reducir logs de tracking en produccion.
- Crear dashboards de writes/s, events/s, lag realtime y Edge Function p95/p99.

### Para 50k simultaneos

- Sacar tracking de alta frecuencia de Postgres Changes.
- Usar Realtime Broadcast server-side por viaje/request.
- Persistir snapshots cada 30-60s y eventos de lifecycle en DB.
- Implementar routing cacheado y proveedor de rutas propio.
- Clustering/layers para admin maps.

### Para 100k simultaneos

- Separar transporte y servicios por canales/proyectos o workloads.
- Ingestion de ubicacion con cola/worker y deduplicacion server-side.
- Geoceldas/bounding boxes para discovery, no escuchar tablas completas.
- Observabilidad con alertas por lag realtime y backpressure.

### Para 500k simultaneos

- Arquitectura multi-region o proveedor realtime dedicado para ubicacion efimera.
- Pub/Sub por entidad activa y snapshots DB desacoplados.
- Sharding por ciudad/zona.
- CDN/routing tile cache propio.

### Para 1M simultaneos

- No alcanzable de forma responsable solo con Postgres Changes.
- Requiere plataforma realtime dedicada, cuotas enterprise custom, load balancing regional, data pipeline de ubicacion, particionado operacional y pruebas de carga continuas.

## 13. Estado final honesto

MIMI quedo mejor para capacidad:

- Transporte redujo escrituras duplicadas sin perder UX.
- Servicios quedo configurado para tracking de prestador por 1 km / 3 min, mucho mas barato para backend.
- El cliente de Servicios ahora ve movimiento estimado entre puntos reales sin aumentar escrituras backend.
- MapLibre esta razonablemente optimizado para mapas individuales y tracking por entidad.

No queda verificado:

- Plan Supabase real.
- Plan Vercel real.
- Cuotas de tiles/routing.
- Capacidad exacta de Postgres.
- Carga real de WebGL en Android gama baja.
- E2E autenticado en este entorno.

Conclusion tecnica: con el codigo actual optimizado, Servicios puede escalar mucho mejor que antes. Transporte mantiene tracking fino, por lo que su techo real depende mas de Realtime/Postgres y del plan Supabase. Para decenas de miles de viajes activos simultaneos hay que migrar tracking efimero desde Postgres Changes hacia Broadcast/servicio realtime dedicado.
