# Backend QA checklist - MIMI / MIMI GO

Fecha: 2026-05-09

Este checklist se usa antes y despues de aplicar cualquier hardening RPC/RLS en Supabase. No aplicar permisos masivos sin completar al menos los flujos criticos.

## Antes de aplicar migrations

- Ejecutar `node qa/audit-supabase.js`.
- Ejecutar `node qa/audit-encoding.js`.
- Ejecutar el SQL read-only de `docs/backend-hardening/backend_readonly_validation.sql`.
- Confirmar que Realtime publica `svc_requests`, `svc_request_offers`, `svc_tracking`, `svc_conversations`, `svc_messages`, `svc_notifications`, `viajes` y `viaje_ofertas`.
- Guardar snapshot de grants/policies/functions antes de tocar permisos.

## Servicios cliente -> prestador

- Cliente logueado con domicilio valido busca "quiero pintar la casa".
- Deben aparecer 1 a 3 categorias relevantes y seleccion visibles.
- Debe encontrar al prestador online con categoria compatible.
- La card debe mostrar nombre publico seguro, disponibilidad y precio/modalidad.
- Cliente solicita al prestador.
- Prestador recibe oferta con direccion/resumen/precio entendible.
- Prestador acepta.
- Cliente ve estado aceptado y prestador asignado.
- Prestador puede rechazar una oferta pendiente y el cliente queda en busqueda o sin oferta clara.
- Ofertas vencidas deben devolver error controlado, no falso exito.
- Cancelacion del cliente debe cerrar request/ofertas/asignaciones y emitir realtime.

## Transporte cliente -> chofer

- Cliente crea viaje.
- Chofer online compatible recibe oferta.
- Chofer acepta; ningun segundo chofer puede aceptar el mismo viaje.
- Chofer rechaza; la oferta queda rechazada y no reaparece como pendiente.
- Iniciar/completar viaje sigue funcionando despues de cambios RPC.
- Viajes vencidos no quedan bloqueando al cliente.

## Admin / KYC / documentos

- Admin puede listar choferes y prestadores.
- Admin puede abrir DNI frente/dorso/selfie desde signed URL.
- Usuario no admin no puede leer documentos ajenos.
- Prestador ve estado correcto por documento: selfie, DNI frente, DNI dorso, antecedentes.
- Si un documento no existe en storage, admin ve fallback claro y no rompe la pantalla.

## Storage

- DNI/selfie/documentos no tienen public URL.
- Owner puede subir su documento en su carpeta.
- Owner no puede leer carpeta de otro usuario.
- Admin puede leer documentos para revision.
- Avatar publico solo se usa para imagen de perfil, no para PII.

## Legal / pagos

- Aceptacion de terminos del prestador queda registrada con usuario, fecha, version y contexto.
- Crear payment intent no permite doble cobro con la misma idempotency key.
- Webhook rechaza requests sin firma valida.
- Refund/cancel no permite doble devolucion.
- `payment_events` conserva historial append-only.

## Despues de aplicar hardening

- Probar login cliente, prestador, chofer y admin.
- Repetir flujo servicios completo.
- Repetir flujo transporte completo.
- Confirmar que Edge Functions siguen pudiendo llamar RPC service-role-only.
- Confirmar que el frontend ya no puede invocar RPC internal-only desde anon.
- Revisar logs de Supabase por errores 401/403/42501.
- Revisar consola del navegador sin errores criticos.

## Rollback

- Si falla login/onboarding, revertir primero los GRANT/REVOKE del grupo aplicado.
- Si falla upload/lectura de documentos, restaurar temporalmente policies de storage previas y revisar carpeta owner/admin.
- Si falla busqueda/aceptacion de servicios, restaurar EXECUTE de `svc_*_atomic` a `authenticated` solo como mitigacion temporal y volver a mover el flujo a Edge Function.
- Documentar timestamp, migration, error, usuario afectado y funcion/policy revertida.
