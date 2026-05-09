# MIMI Backend Audit - 2026-05-09

## Resumen ejecutivo

Estado general: el backend ya tiene una base real de produccion: RLS activo en casi todas las tablas sensibles, buckets privados para documentos, Edge Functions con service role del lado servidor, Realtime publicado solo para las tablas principales de viaje/servicios y estructura de pagos/legal/KYC bastante completa.

Riesgo principal: la superficie RPC esta demasiado abierta. En remoto hay 107 funciones de aplicacion en `public`; 52 son `SECURITY DEFINER`; 52 `SECURITY DEFINER` son ejecutables por `anon` y `authenticated`; 19 no tienen `search_path` fijado. Esto debe endurecerse por fases para no romper transporte legacy ni servicios.

Correcciones aplicadas en codigo local: habia sintaxis invalida en `mimi-servicios/src/services/service-api.js` y `mimi-servicios/supabase/functions/svc-search-providers/index.ts`: tres lineas con `<< .order(...)`. Eso podia romper el fallback de busqueda de prestadores y/o impedir redeploy limpio de Edge Function. Tambien se corrigio `mimi-servicios/supabase/functions/svc-provider-respond-offer/index.ts` para no devolver `ok:true` cuando aceptar/rechazar no aplica por oferta vencida, inexistente o no pendiente. Se valido `node --check` para `service-api.js` y `node qa/audit-supabase.js`.

## Inventario real auditado

- Tablas publicas sensibles auditadas: transporte, servicios, KYC, pagos, legal, realtime, categorias dinamicas y soporte.
- RLS: activo en tablas sensibles. Excepcion esperada: `public.spatial_ref_sys` de PostGIS.
- Realtime: `svc_requests`, `svc_request_offers`, `svc_tracking`, `svc_conversations`, `svc_messages`, `svc_notifications`, `viajes`, `viaje_ofertas`.
- Buckets:
  - `driver-documents`: privado.
  - `service-provider-documents`: privado.
  - `support-attachments`: privado.
  - `provider-avatars`: publico, limitado a imagenes y 5 MB.
- Edge Functions auditadas: servicios, busqueda, respuesta de oferta, cancelacion, pagos, legal, geocoding, admin, KYC.
- Migrations remotas: hay drift. Remoto contiene semantic migrations y duplicados de `add_reviewed_at_to_identity_checks` que no estan todos en archivos locales.

## Riesgos criticos

| Prioridad | Hallazgo | Evidencia | Impacto | Solucion |
|---|---|---|---|---|
| Critico | RPC `SECURITY DEFINER` expuestas | 52 `SECURITY DEFINER` ejecutables por `anon/authenticated` | Escalada por `/rest/v1/rpc/*`, cambios de estado, admin/test functions accesibles | Aplicar `hardening_rpc_permissions.sql` por fases |
| Critico | Admin/test helpers expuestos | `admin_review_driver`, `reset_test_driver`, `seed_test_driver_kyc`, `simulate_*` con execute amplio | Usuarios no admin podrian invocar flujos de revision/simulacion si conocen firma | Revocar `PUBLIC`, `anon`, `authenticated`; dejar solo `service_role` |
| Critico | Storage documentos de chofer con policies amplias | Policies `bucket_id='driver-documents'` sin carpeta owner | Cualquier autenticado podria leer/subir/actualizar objetos del bucket si conoce path | Dropear policies bucket-only; dejar carpeta `auth.uid()` + admin |
| Alto | `push_tokens` expuesto | SELECT/UPDATE/INSERT con `true` | Fuga o modificacion de tokens push de otros usuarios | RLS own-row por `user_id = auth.uid()` |
| Alto | `svc_provider_intents` con `{public}` + `ALL` | Policy `providers_own_intents` roles public | Prompts/oficios de prestadores pueden quedar escribibles/visibles de mas | Separar select/insert/update/delete por authenticated owner/admin |
| Alto | Funciones sin `search_path` fijo | 19 `SECURITY DEFINER` sin config; advisors alertan muchas invoker tambien | Riesgo de shadowing/resolucion mutable | Aplicar `hardening_security_definer_search_path.sql` |
| Alto | Flujo servicios sin audit trail | `svc_request_events` esta vacia en produccion | Admin no ve timeline real; dificil investigar aceptacion/cancelacion | Insertar eventos desde create/accept/reject/cancel/start/complete |
| Alto | Requests/ofertas vencidas quedan `PENDING` | Varias `svc_requests` viejas en `PENDING_PROVIDER_RESPONSE` con deadline vencido | UI confusa, bloqueos por unique active request, provider ve solicitudes viejas | Worker o RPC de expiracion periodico para servicios |

## Riesgos altos/medios

- `svc_requests_client_update_limited` permite UPDATE amplio a cliente/admin. RLS no limita columnas; conviene mover cambios de estado a Edge Functions y usar grants por columna si se mantiene acceso directo.
- `svc_accept_offer_atomic`, `svc_cancel_request_atomic`, `svc_complete_service_atomic` son `SECURITY INVOKER`, pero ejecutables por `anon/authenticated`. Hoy el camino correcto es Edge Function con service role + JWT; conviene revocar acceso directo y dejar `service_role`.
- `svc_create_request_atomic` es `SECURITY DEFINER` y acepta `p_client_user_id`; no valida `auth.uid()` internamente. Debe ser service-role-only o reescribirse.
- `svc_search_providers_ranked` filtra por disponibilidad semanal obligatoria. Como UX decidio que disponibilidad depende de estar online, hay que revisar si ese filtro debe ser opcional o reemplazarse por `svc_providers.status='ONLINE_IDLE'`.
- `driver_profiles` tiene policies duplicadas e indices duplicados.
- `viajes`, `viaje_ofertas`, `viaje_tracking`, `viaje_eventos` tienen RLS activo pero advisors reportan tablas sin policies. Si transporte usa funciones `SECURITY DEFINER`, puede funcionar, pero conviene explicitar policies o mover todo por Edge/RPC service-only.

## Matriz RPC recomendada

### Internal only

Solo `service_role/postgres`; no `PUBLIC`, no `anon`, no `authenticated`.

- `admin_review_driver`
- `reset_test_driver`
- `seed_test_driver_kyc`
- `simulate_driver_admin_decision`
- `simulate_driver_kyc_scenario`
- `dispatch_queue_mark_done`
- `dispatch_queue_mark_retry`
- `dispatch_queue_release_stale_locks`
- `dispatch_expirar_ofertas_y_liberar_viajes`
- `dispatch_crear_mejor_oferta_legacy`
- `dispatch_crear_mejores_ofertas`
- `dispatch_crear_siguiente_oferta_secuencial`
- `dispatch_crear_siguiente_oferta_secuencial_pro`
- `dispatch_viaje`, `dispatch_viaje_pro`, `dispatch_loop`, `dispatch_procesar_timeouts`
- `sync_dispatch_attempt_count`
- `sync_driver_profile_from_documents`
- `trg_sync_driver_profile_from_documents`
- `trigger_dispatch_after_viaje_insert`
- `trigger_dispatch_viaje`
- `trigger_verify_identity`
- `svc_create_request_atomic`
- `svc_accept_offer_atomic`
- `svc_cancel_request_atomic`
- `svc_complete_service_atomic`
- `svc_search_providers_ranked`
- `upsert_address_index`
- `upsert_geocoding_feedback`

### Authenticated only

Requieren `auth.uid()` o ownership interno antes de mantener acceso directo.

- Transporte legacy: `aceptar_oferta_viaje`, `rechazar_oferta_viaje`, `iniciar_viaje`, `completar_viaje`.
- Driver onboarding: `ensure_driver_profile_exists`, `get_driver_onboarding_status`.
- Soporte: `crear_ticket_soporte`, `responder_ticket_soporte` con validacion de participante/admin.
- Helpers RLS: `is_admin_user`, `mimi_current_driver_id`, `mimi_current_service_provider_id`, `svc_get_provider_id_by_user`, `svc_is_request_participant`. Mantener `authenticated` si se usan en policies; revocar `anon`.

### Public safe

Solo lectura no sensible y sin `SECURITY DEFINER` si se puede:

- Categorias activas y reglas publicas no sensibles.
- Busqueda semantica de categorias si no expone PII ni muta usage counters.

## Flujo cliente-prestador servicios

Lo que ya funciona:

- `svc-create-request` valida JWT, usa service role, crea `svc_requests`, `svc_request_offers`, conversacion, payment intent y notificacion.
- Ultima request auditada quedo `ACCEPTED` con oferta `ACCEPTED`, `accepted_provider_id` y deadline nulo.
- Busqueda de prestadores ya encuentra el provider y usa nombre de pila si hay identity/profile.

Problemas detectados:

- Varias requests antiguas quedaron vencidas pero con request/offer `PENDING`. Falta job/worker de expiracion confiable en servicios.
- Provider UI recibe ofertas desde tabla `svc_request_offers` con `select("*")`, sin join a `svc_requests`, por eso puede mostrar "Ubicacion a confirmar" o datos incompletos.
- `svc_request_events` esta vacia; faltan eventos de `REQUEST_CREATED`, `OFFER_SENT`, `OFFER_ACCEPTED`, `OFFER_REJECTED`, `REQUEST_CANCELLED`.
- Si se aplica RPC hardening, `svc-provider-respond-offer`, `svc-create-request` y `svc-cancel-request` deben seguir usando service role.

## Payments / webhooks

Fortalezas:

- Webhook llama provider parser y verifica firma (`event.valid`).
- `payment_events.provider_event_id` tiene unique index parcial, esto ayuda contra replay.
- `create-payment-intent` reutiliza pagos activos por contexto.

Riesgos:

- `refund-payment` permite refund si el usuario autenticado existe; no vi validacion admin/owner en el fragmento auditado. Debe requerir admin o participante con reglas estrictas.
- Hay que agregar idempotency key explicita para refund/cancel ademas de provider ids.
- `payment_events` debe tratarse como ledger append-only; hoy RLS solo lectura, pero conviene trigger prevent update/delete como en legal/audit.

## Storage/KYC

Fortalezas:

- Documentos de prestador y chofer estan en buckets privados.
- Avatar separado en bucket publico con mime y limite.

Riesgos:

- Policies legacy de `driver-documents` permiten SELECT/UPDATE/INSERT por bucket completo; hay que mantener solo carpeta propia + admin.
- `uploadProviderAvatar` local todavia sube al bucket `service-provider-documents` aunque existe `provider-avatars`; conviene corregir en una pasada frontend/backend separada.
- `svc_provider_identity_checks` ya tiene `reviewed_at` remoto, pero codigo y comentarios todavia asumen a veces que no existe. Normalizar.

## DevOps / migrations

Riesgo: drift confirmado.

Remoto tiene:

- `20260508002748` a `20260508005828` semantic migrations.
- `20260508120000` y `20260508124039` `add_reviewed_at_to_identity_checks`.
- `20260508125557` `add_first_name_to_provider_profiles`.
- `20260508181807` RLS identity checks/request events.
- `20260508181944` avatar storage/column.

Local tiene solo snapshot remoto, un snapshot vacio y `20260508120000_add_reviewed_at_to_identity_checks.sql`.

Plan:

1. Hacer baseline actual remoto con `supabase db pull`.
2. No cambiar schema desde Studio sin migration.
3. A partir de ahora, cada cambio: migration local, review, deploy.
4. Antes de borrar o consolidar migrations, crear snapshot/branch.

## Performance

Advisors reportan:

- FKs sin indice: `pagos.viaje_id`, `svc_requests.offering_id`, varios KYC/events/credentials.
- Indices duplicados: `choferes.user_id`, `driver_profiles.user_id`, `svc_providers.user_id`, `svc_request_offers(request_id,provider_id) pending`, otros.
- Policies RLS con `auth.uid()` evaluado por fila; conviene usar `(select auth.uid())` en hot paths.

No borrar indices duplicados aun: primero medir uso real y preparar migration reversible.

## Rollout recomendado

1. Aplicar primero sintaxis local corregida y redeploy de frontend/Edge Function de busqueda.
2. Aplicar `hardening_security_definer_search_path.sql`; bajo riesgo.
3. Aplicar `hardening_rls_policies.sql` en ventana corta; probar upload docs, push tokens y provider intents.
4. Aplicar `hardening_rpc_permissions.sql` por grupos:
   - Grupo A: test/admin/queue/internal.
   - Grupo B: servicios Edge-only.
   - Grupo C: transporte legacy tras confirmar que front no invoca directo.
5. Agregar eventos auditables de servicio.
6. Agregar worker de expiracion de ofertas/requests de servicios.
