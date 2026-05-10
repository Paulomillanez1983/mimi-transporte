# MIMI Communication Hub - Enterprise Upgrade Result

Fecha: 2026-05-10  
Proyecto: MIMI / MIMI GO / MIMI Transporte / MIMI Servicios

## Resumen ejecutivo

Se cerró una primera versión enterprise del ecosistema de comunicación contextual usando las tablas reales actuales de Supabase:

- `svc_conversations`
- `svc_messages`
- `svc_notifications`

El objetivo fue reemplazar rutas legacy rotas (`soporte_tickets`, `soporte_mensajes`) por una capa segura, autenticada, auditada por estado de conversación y compatible con Supabase Realtime.

## Qué se corrigió

### Cliente ↔ chofer en transporte

- El chat de viaje ya no crea ni consulta tablas legacy inexistentes.
- La conversación se asegura mediante la Edge Function `communication-ensure-conversation`.
- Solo se habilita si existe viaje activo y el usuario autenticado es cliente o chofer del viaje.
- El envío de mensajes pasa por `svc-send-message`.
- La lectura de mensajes usa `svc_messages` con Realtime filtrado por `conversation_id`.
- El marcado como leído pasa por `communication-mark-read`.
- Se corrigió una incompatibilidad runtime: el flujo ya no selecciona columnas legacy no presentes en `viajes` (`cliente_nombre`, `pasajero_nombre`, etc.).

### Cliente/prestador/usuario ↔ soporte/admin

- El envío de soporte del cliente usa `svc-send-message`.
- El soporte de chofer usa `svc_conversations` + `svc_messages`, con `participant_role = driver`.
- Se versionaron fuentes locales de funciones admin que existían desplegadas pero no estaban en el repo:
  - `admin-list-support-conversations`
  - `admin-send-support-message`
  - `admin-update-support-status`

### Seguridad

- `svc-send-message` valida JWT, rol real y participación en la conversación.
- Bloquea spoofing de `sender_id` y `sender_role`.
- Bloquea mensajes en conversaciones cerradas.
- Bloquea mensajes si el viaje o servicio contextual está cerrado.
- Crea `svc_notifications` internas para el destinatario.
- Las funciones nuevas quedaron con `verify_jwt = true`.

## Edge Functions desplegadas/validadas

| Función | Estado | JWT |
| --- | --- | --- |
| `svc-send-message` | ACTIVE | true |
| `communication-ensure-conversation` | ACTIVE | true |
| `communication-mark-read` | ACTIVE | true |
| `admin-list-support-conversations` | ACTIVE | true |
| `admin-send-support-message` | ACTIVE | true |
| `admin-update-support-status` | ACTIVE | true |

## Auditoría de credenciales E2E

Resultado sin exponer valores:

- Local `.env.local`: existe, sin variables E2E requeridas.
- Runtime local: sin variables E2E requeridas.
- Vercel Environment Variables: no hay variables configuradas para el proyecto.
- GitHub Actions Secrets: no se listaron secrets para el repo consultado.
- Referencias encontradas: documentación enterprise y `qa/enterprise-global-e2e.js`.

Estado E2E autenticado actual: `BLOCKED_BY_ENVIRONMENT`.

## Realtime

Validación remota de publicación `supabase_realtime`:

- `svc_conversations`
- `svc_messages`
- `svc_notifications`
- `svc_requests`
- `svc_request_offers`
- `svc_tracking`
- `viajes`
- `viaje_ofertas`

## QA ejecutado

Comandos ejecutados:

```powershell
node qa\audit-mimi-communication.js
node qa\audit-supabase.js
node qa\audit-encoding.js
node --check js\trip-chat.js
node --check js\driver-support.js
node --check js\cliente-transporte-v2\state-notifications-support.js
node --check mimi-servicios\src\services\service-api.js
node qa\audit-routes.js
node qa\enterprise-global-e2e.js
git diff --check
```

Resultado:

- QA comunicación: OK
- QA Supabase local: OK
- Encoding: OK
- JS syntax checks: OK
- Rutas/manifests/service workers: OK
- `git diff --check`: OK, solo warnings CRLF de Windows.
- `enterprise-global-e2e`: `BLOCKED_BY_ENVIRONMENT`, no fallo. Se inspeccionaron `.env*`, runtime local, referencias QA/docs, Vercel Env Vars y GitHub Actions Secrets sin imprimir valores. No hay credenciales E2E cargadas en el entorno local/Vercel/GitHub consultado. El runner fue ajustado para reportar `ok: null`, `status: "BLOCKED_BY_ENVIRONMENT"` y `skipped: true` cuando falten credenciales, en vez de marcar un falso failed.

Validaciones remotas:

- `POST` sin JWT a funciones nuevas devuelve `401`.
- `OPTIONS` a funciones nuevas devuelve `200`, confirmando arranque del runtime sin BOOT_ERROR.
- Realtime remoto publicado para tablas críticas.

## Archivos modificados

- `js/trip-chat.js`
- `js/driver-support.js`
- `js/cliente-transporte-v2/state-notifications-support.js`
- `supabase/config.toml`
- `supabase/functions/svc-send-message/index.ts`
- `supabase/functions/communication-ensure-conversation/index.ts`
- `supabase/functions/communication-mark-read/index.ts`
- `mimi-servicios/supabase/functions/admin-list-support-conversations/index.ts`
- `mimi-servicios/supabase/functions/admin-send-support-message/index.ts`
- `mimi-servicios/supabase/functions/admin-update-support-status/index.ts`
- `qa/audit-mimi-communication.js`
- `mimi_communication_enterprise_audit.md`
- `mimi_communication_enterprise_upgrade_result.md`

## Riesgos residuales honestos

1. Todavía no existe una tabla universal `conversation_participants`; el modelo actual soporta conversaciones bipartitas con `client_user_id` y `provider_user_id`. Funciona para transporte/servicios/soporte actual, pero una fase futura debería normalizar participantes múltiples.
2. La creación de conversación de soporte cliente todavía usa insert directo con RLS propio antes de enviar vía `svc-send-message`. Es compatible hoy; en una siguiente fase conviene moverlo a `communication-create-support-ticket`.
3. `svc_notifications` registra eventos internos de mensaje nuevo. La entrega push nativa depende del dispatcher/worker de notificaciones existente; esta fase no cambia FCM/Web Push.
4. Las funciones legacy de soporte (`support-send-message`, `support-list-conversation`, `support-update-status`) siguen desplegadas. No se eliminaron para no romper producción sin auditoría de dependencias final.

## Rollback

Rollback seguro:

1. Revertir commit frontend/backend.
2. Redeployar funciones anteriores desde Supabase Dashboard si fuese necesario.
3. Mantener tablas `svc_conversations`, `svc_messages`, `svc_notifications`; no se aplicaron migraciones destructivas.

## Estado final

MIMI Communication Hub queda operativo para:

- cliente ↔ chofer con viaje activo
- cliente/prestador ↔ mensajes de servicios sobre `svc_messages`
- usuario ↔ admin/soporte con funciones admin versionadas
- Realtime seguro sobre tablas publicadas
- Envío de mensajes centralizado y autenticado

No se declara como fase final absoluta del hub hasta implementar participantes múltiples y push nativo específico para mensajes, pero la deuda crítica de tablas legacy rotas y funciones sin JWT queda resuelta.
