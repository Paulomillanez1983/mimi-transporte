# MIMI GO / MIMI - Plan QA manual

## Cliente transporte
1. Abrir `/hub-clientes` y entrar a transporte.
2. Iniciar sesion como cliente.
3. Crear cotizacion con origen, destino y, si aplica, paradas.
4. Confirmar solicitud de viaje.
5. Verificar que se cree fila en `viajes` y, si corresponde, `viaje_ofertas`.
6. En panel chofer, poner un chofer online y aceptar.
7. Confirmar que cliente ve estados `ASIGNADO` / `ACEPTADO` / `EN_CURSO`.
8. Confirmar marker de chofer y ruta en vivo.
9. Completar/cancelar y verificar estado final.

## Cliente servicios
1. Abrir `/servicios`.
2. Iniciar sesion como cliente.
3. Escribir una necesidad real: "se rompio un cano y pierde agua".
4. Confirmar que MIMI sugiere Plomeria y explica la derivacion.
5. Completar direccion y buscar prestadores.
6. Si no hay prestadores, verificar mensaje claro sin prometer calidad ni seguridad.
7. Crear solicitud con prestador compatible.
8. Verificar `svc_requests`, `svc_request_offers`, notificacion y timeline.

## Prestador servicios
1. Abrir `/prestador`.
2. Iniciar sesion.
3. Completar perfil, categorias, precios/ofertas y disponibilidad.
4. Subir DNI/selfie y confirmar estados KYC.
5. Ponerse online.
6. Aceptar/rechazar solicitud compatible.
7. Avanzar estados: en camino, llego, iniciar, completar.
8. Confirmar tracking en cliente.

## Admin
1. Abrir `/operadores`.
2. Confirmar que usuarios no admin son redirigidos.
3. Iniciar sesion admin.
4. Revisar choferes, prestadores, documentos, soporte y mapa.
5. Aprobar/rechazar prestador y verificar que el prestador ve el estado.

## PWA/Vercel
1. Probar rutas limpias: `/`, `/cliente`, `/viaje`, `/chofer`, `/servicios`, `/prestador`.
2. Probar mobile 390x844 y desktop.
3. Validar manifiestos e instalacion.
4. Limpiar service workers y cache tras deploy.
5. Verificar consola sin errores criticos ni 404 locales.
