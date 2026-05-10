# MIMI Communication Hub - Enterprise Audit

Fecha: 2026-05-10

## Resumen ejecutivo

El backend vivo de comunicacion ya esta consolidado sobre `svc_conversations`, `svc_messages` y `svc_notifications`. Esas tablas tienen RLS, indices y realtime publicado segun la validacion enterprise previa. El problema principal encontrado no era falta de base, sino drift de frontend/codigo fuente:

- Servicios usaba `svc_conversations`/`svc_messages`, pero la funcion remota `svc-send-message` no estaba versionada localmente y en produccion figuraba con `verify_jwt=false`.
- Transporte tenia `js/trip-chat.js` apuntando a tablas legacy `soporte_tickets` y `soporte_mensajes`, que ya no existen en la base remota.
- Soporte de chofer tambien mantenia fallback legacy a `soporte_tickets`/`soporte_mensajes`.
- Admin soporte funcionaba contra `svc_conversations`, pero sus Edge Functions estaban desplegadas y no versionadas localmente.

## Arquitectura actual detectada

### Backend

Tablas reales:

- `svc_conversations`: conversacion contextual o soporte.
- `svc_messages`: mensajes por conversacion.
- `svc_notifications`: notificaciones internas/realtime.
- `svc_request_events`: auditoria de servicios.
- `viajes`, `viaje_ofertas`, `viaje_tracking`: transporte.
- `svc_requests`, `svc_request_offers`, `svc_tracking`: servicios.

Policies relevantes:

- `svc_conversations_participant_rw`: permite leer/escribir a cliente, prestador o admin participante.
- `svc_messages_participant_rw`: permite leer/escribir mensajes si el usuario pertenece a la conversacion y `sender_user_id = auth.uid()`.

Realtime:

- Servicios escucha `svc_messages`, `svc_notifications`, `svc_requests`, `svc_request_offers`, `svc_tracking`.
- Transporte escucha `viajes`, `viaje_tracking` y ahora debe usar `svc_messages` para chat contextual.

### Frontend

- Cliente servicios: tiene chat de solicitud activa y soporte drawer.
- Prestador servicios: tiene drawer de chat ligado a `conversation_id`.
- Cliente transporte: soporte sobre `svc_conversations` y chat de viaje via `js/trip-chat.js`.
- Chofer: soporte en `js/driver-support.js`; chat de viaje en `js/trip-chat.js`.
- Admin: inbox de soporte en `admin/admin-support.js`.

## Riesgos encontrados

### Criticos

1. `js/trip-chat.js` dependia de tablas inexistentes.
   - Impacto: cliente y chofer no podian chatear de forma confiable durante el viaje.
   - Fix: migrar a `svc_conversations`/`svc_messages` mediante Edge Function de contexto.

2. `svc-send-message` no estaba en el repo y en produccion tenia `verify_jwt=false`.
   - Impacto: drift de release y postura de seguridad insuficiente para mensajeria.
   - Fix: versionar funcion segura, validar JWT, participante, estado de contexto y sender role.

### Altos

1. Soporte de chofer mantenia fallback legacy.
   - Impacto: realtime y carga de soporte podian fallar contra tablas que no existen.
   - Fix: mover a `svc_conversations`/`svc_messages`.

2. Admin support functions desplegadas sin source local.
   - Impacto: deploy no reproducible.
   - Fix: versionar source local.

### Medios

1. Creacion de conversacion de soporte cliente sigue usando insert RLS directo.
   - Impacto: es aceptable para owner-only hoy, pero la siguiente fase deberia moverlo a `communication-create-support-ticket`.
   - Estado: warning documentado en QA.

2. No hay tabla separada `conversation_participants`.
   - Impacto: el modelo actual es simple y suficiente para 1:1 + admin, pero grupos/multiparte requeriran migracion.

## Arquitectura recomendada

Nombre: MIMI Communication Hub.

Base actual reutilizada:

- `svc_conversations` como hub unico.
- `svc_messages` como ledger de mensajes.
- `svc_notifications` como capa interna/realtime.

Funciones:

- `communication-ensure-conversation`: abre o reutiliza conversacion contextual validando viaje activo.
- `svc-send-message`: envia mensaje validando JWT, participante, sender role y contexto abierto.
- `communication-mark-read`: marca como leidos mensajes ajenos mediante backend.
- `admin-list-support-conversations`, `admin-send-support-message`, `admin-update-support-status`: soporte admin versionado.

Reglas:

- Cliente/chofer solo chatean si el viaje esta activo/asignado.
- Cliente/prestador solo chatean si la solicitud de servicio no esta finalizada/cancelada/expirada.
- Admin solo accede si existe en `admin_users` activo.
- Conversaciones cerradas no aceptan mensajes.
- `sender_user_id` se toma del JWT, nunca del cliente.

## Checklist QA recomendado

- `node qa/audit-mimi-communication.js`
- `node --check js/trip-chat.js`
- `node --check js/driver-support.js`
- `node --check js/cliente-transporte-v2/state-notifications-support.js`
- `node --check mimi-servicios/src/services/service-api.js`
- Verificar deploy de `svc-send-message` con JWT activo.
- Probar chat viaje cliente/chofer en estado `ASIGNADO` o `EN_CURSO`.
- Probar chat servicio cliente/prestador con request activa.
- Probar admin soporte lectura/respuesta.
- Validar consola sin 401/403 inesperados.

