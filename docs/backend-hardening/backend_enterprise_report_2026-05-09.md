# MIMI backend enterprise hardening report

Fecha: 2026-05-09

## Resumen ejecutivo

Se preparo una estrategia enterprise por fases para cerrar los riesgos detectados sin aplicar cambios destructivos ni permisos masivos a ciegas.

Lo nuevo queda listo como migrations idempotentes, scripts QA y plan de release. No se aplicaron las migrations en produccion en esta pasada.

## Riesgos y acciones

| Prioridad | Riesgo | Evidencia | Accion preparada | Impacto esperado | Test |
|---|---|---|---|---|---|
| Critico | RPC internas expuestas | Reporte previo: SECURITY DEFINER ejecutables por anon/authenticated | `enterprise_02_rpc_permissions` | Reducir superficie PostgREST | `enterprise_validation.sql` y `backend-hardening-rpc-smoke.js` |
| Alto | SECURITY DEFINER con search_path mutable | Advisors y auditoria previa | `enterprise_01_security_definer_search_path` | Evitar search_path hijacking | `secdef_missing_search_path` |
| Alto | `push_tokens` con SELECT/UPDATE `true` | Policies previas amplias | `enterprise_03_rls_policy_hardening` | Tokens solo owner/admin/backend | policy matrix + flujo push |
| Alto | `svc_provider_intents` publico amplio | Policy `{public}` + ALL detectada | `enterprise_03_rls_policy_hardening` | Intents solo prestador owner/admin | policy matrix + provider setup |
| Alto | Sin audit trail de servicios | `svc_request_events` vacio | `enterprise_04_service_audit_and_expiration` | Eventos create/offer/accept/reject/cancel/start/complete/expire | crear flujo completo y contar eventos |
| Alto | Ofertas/requests viejas pendientes | Requests/ofertas vencidas detectadas | `svc_expire_stale_service_requests` | Cierre controlado de stale rows | ejecutar worker en ventana |
| Medio | Drift remoto/local | Migrations remotas no estan todas locales | release plan baseline | Gobernanza futura | `supabase migration list` |

## Matriz RPC

Internal only, service_role:

- `admin_review_driver`
- `reset_test_driver`
- `seed_test_driver_kyc`
- `simulate_driver_admin_decision`
- `simulate_driver_kyc_scenario`
- `dispatch_queue_mark_done`
- `dispatch_queue_mark_retry`
- `dispatch_queue_release_stale_locks`
- `dispatch_expirar_ofertas_y_liberar_viajes`
- `svc_create_request_atomic`
- `svc_accept_offer_atomic`
- `svc_cancel_request_atomic`
- `svc_complete_service_atomic`
- `svc_prepare_request_pricing`
- `svc_search_providers_ranked`
- `upsert_address_index`
- `upsert_geocoding_feedback`
- `svc_expire_stale_service_requests`

Authenticated temporal por compatibilidad:

- `aceptar_oferta_viaje`
- `rechazar_oferta_viaje`
- `iniciar_viaje`
- `completar_viaje`
- `aceptar_oferta_secuencial`
- `aceptar_viaje_legacy`
- `aceptar_viaje_multi_oferta`
- `ensure_driver_profile_exists`
- `get_driver_onboarding_status`
- helpers RLS: `is_admin_user`, `mimi_current_driver_id`, `mimi_current_service_provider_id`, `svc_get_provider_id_by_user`, `svc_is_request_participant`

## Audit trail preparado

Eventos obligatorios soportados:

- `request_created`
- `offer_created`
- `offer_accepted`
- `offer_rejected`
- `request_cancelled`
- `request_started`
- `request_completed`
- `request_expired`
- `offer_expired`

Eventos adicionales utiles:

- `offer_cancelled`
- `request_provider_en_route`
- `request_provider_arrived`

Implementacion:

- Trigger `trg_svc_requests_audit_lifecycle` sobre `svc_requests`.
- Trigger `trg_svc_request_offers_audit_lifecycle` sobre `svc_request_offers`.
- Helper `svc_log_request_event`.

## Worker de expiracion

Funcion:

```sql
select public.svc_expire_stale_service_requests(50);
```

Comportamiento:

- `svc_request_offers.status='PENDING'` vencidas pasan a `EXPIRED`.
- `svc_requests` activas vencidas pasan a `CANCELLED` con `cancellation_reason='provider_response_expired'`.
- Se registra `offer_expired`.
- Se registra `request_expired`.

No se introduce estado `EXPIRED` en `svc_requests` para no romper frontend ni constraints existentes.

## QA automatico nuevo

- `node qa/backend-hardening-static.js`
- `node qa/backend-hardening-rpc-smoke.js`
- `docs/backend-hardening/enterprise_validation.sql`

Smoke remoto pre-hardening ejecutado con anon key publica: `svc_search_providers_ranked` devolvio `200` a rol anon. Eso confirma exposicion directa de RPC de busqueda rankeada y justifica aplicar fase 02. Tras fase 02, ese mismo script debe devolver no-2xx para todas las RPC internas.

Baseline remoto `enterprise_validation.sql` antes de aplicar hardening:

- `secdef_anon_execute`: 52, esperado 0 despues de fase 02.
- `secdef_missing_search_path`: 19, esperado 0 despues de fase 01.
- `internal_rpc_exposed_count`: 14, esperado 0 despues de fase 02.
- `push_tokens_true_policies`: 3, esperado 0 despues de fase 03.
- `provider_intents_public_policies`: 1, esperado 0 despues de fase 03.
- `request_events_participant_policy`: 0, esperado 1 despues de fase 03.
- `total_events`: 0, esperado mayor a 0 despues de fase 04 y QA real.
- `stale_active_requests/stale_pending_offers`: 3/8, esperado 0/0 despues de fase 04 y worker.
- `required_realtime_tables`: 8, correcto.

## Comandos minimos

```powershell
node qa/audit-supabase.js
node qa/audit-encoding.js
node --check mimi-servicios/src/services/service-api.js
node qa/backend-hardening-static.js
git diff --check
supabase migration list --linked
supabase migration list --local
```

SQL remoto:

```powershell
supabase db query --linked -f docs/backend-hardening/enterprise_validation.sql
```

Fallback: ejecutar `enterprise_validation.sql` en Supabase SQL Editor.

## Drift

El primer `supabase db push --linked --dry-run` fallo porque el remoto tenia migrations aplicadas que no existian localmente. Se agregaron archivos `*.remote_applied.sql` como espejo no-op de esas versiones para que el historial local pueda alinearse con produccion. Esto es seguro para el proyecto actual, pero no reemplaza un baseline completo para crear ambientes nuevos desde cero.

Segundo dry-run despues de espejar historial: correcto. Supabase CLI indica que solo empujaria:

- `20260509221109_enterprise_01_security_definer_search_path.sql`
- `20260509221209_enterprise_02_rpc_permissions.sql`
- `20260509221309_enterprise_03_rls_policy_hardening.sql`
- `20260509221409_enterprise_04_service_audit_and_expiration.sql`

## Estado honesto

Preparado, no aplicado. El backend no debe marcarse 10/10 hasta que:

- Se aplique fase por fase.
- Pasen pruebas reales cliente/prestador/admin/chofer.
- `anon` y `authenticated` no ejecuten RPC internas.
- El worker limpie stale rows sin romper solicitudes activas.
- Admin pueda auditar eventos reales del lifecycle.
