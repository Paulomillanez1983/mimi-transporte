# MIMI Enterprise Final Result - 2026-05-09

## Estado ejecutivo

Estado final: **backend enterprise hardening aplicado y validado en produccion**.

Las migrations enterprise 01-04 fueron aplicadas por el operador con backups validos. Durante la validacion post-release se encontro exposicion residual de RPC `SECURITY DEFINER` ejecutables por `anon`; se creo y aplico una migration incremental 05 para cerrar ese residuo.

## Backups confirmados

Backups creados antes de aplicar migrations:

| Archivo | Tamano |
|---|---:|
| `backups/public_schema.sql` | 367877 bytes |
| `backups/roles_pre_enterprise.sql` | 297 bytes |
| `backups/data_public_pre_enterprise.sql` | 6268262 bytes |

Nota: `pg_dump` aviso circular FK en `svc_categories` para data-only. No bloquea el backup, pero para restore completo conviene usar full dump o restaurar con constraints/trigger strategy.

## Migrations aplicadas

Confirmadas en remoto:

- `20260509221109_enterprise_01_security_definer_search_path.sql`
- `20260509221209_enterprise_02_rpc_permissions.sql`
- `20260509221309_enterprise_03_rls_policy_hardening.sql`
- `20260509221409_enterprise_04_service_audit_and_expiration.sql`
- `20260509233520_enterprise_05_close_residual_rpc_exposure.sql`

La migration 05 cerro funciones residuales como:

- `dispatch_aceptar_oferta_pro`
- `dispatch_rechazar_oferta_pro`
- `dispatch_viaje`
- `expirar_ofertas_vencidas`
- `buscar_choferes_cercanos`
- `search_categories_hybrid`
- helpers de soporte, pricing y PostGIS expuestos a `anon`

## Validacion SQL final

`docs/backend-hardening/enterprise_validation.sql` post migration 05:

| Metric | Actual | Estado |
|---|---:|---|
| `internal_rpc_exposed_count` | 0 | pass |
| `internal_rpc_service_role_count` | 15 | pass |
| `required_realtime_tables` | 8 | pass |
| `provider_intents_public_policies` | 0 | pass |
| `push_tokens_true_policies` | 0 | pass |
| `request_events_participant_policy` | 1 | pass |
| `secdef_anon_execute` | 0 | pass |
| `secdef_missing_search_path` | 0 | pass |
| `svc_request_events.total_events` | 14 | pass |
| `stale_active_requests/stale_pending_offers` | 0/0 | pass |

## Smoke remoto RPC

Se ejecuto:

```powershell
$env:MIMI_SUPABASE_URL="https://xrphpqmutvadjrucqicn.supabase.co"
$env:MIMI_SUPABASE_ANON_KEY="<anon-public-key>"
node qa\backend-hardening-rpc-smoke.js --require-env
```

Resultado: `ok: true`.

RPC internas probadas contra `anon` devolvieron `401 permission denied`, incluyendo:

- `admin_review_driver`
- `reset_test_driver`
- `dispatch_queue_mark_done`
- `svc_create_request_atomic`
- `svc_accept_offer_atomic`
- `svc_cancel_request_atomic`
- `svc_complete_service_atomic`
- `svc_search_providers_ranked`
- `svc_expire_stale_service_requests`

## Expiration worker

Ejecutado:

```sql
select public.svc_expire_stale_service_requests(500);
```

Resultado:

```json
{
  "ok": true,
  "offers_expired": 8,
  "requests_expired": 3
}
```

Validacion posterior:

- stale requests/offers: `0/0`
- audit events creados: `14`

Eventos actuales:

| Event type | Total |
|---|---:|
| `offer_expired` | 8 |
| `request_cancelled` | 3 |
| `request_expired` | 3 |

## QA ejecutado

| Comando | Resultado |
|---|---|
| `supabase migration list --linked` | OK, local/remoto alineado con 05 |
| `supabase db query --linked -f docs/backend-hardening/enterprise_validation.sql -o json` | OK |
| `node qa/backend-hardening-rpc-smoke.js --require-env` | OK |
| `node qa/audit-supabase.js` | OK |
| `node qa/audit-encoding.js` | OK |
| `node qa/audit-routes.js` | OK |
| `node qa/audit-inline-scripts.js` | OK |
| `node qa/backend-hardening-static.js` | OK, actualizado para migration 05 |
| `node --check mimi-servicios/src/services/service-api.js` | OK |
| `node --check mimi-servicios/src/main-client.js` | OK |
| `node --check mimi-servicios/src/main-provider.js` | OK |
| `node --check qa/backend-hardening-static.js` | OK |
| `npm audit --audit-level=moderate` | 0 vulnerabilities |
| `git diff --check` | OK |

## Vercel / PWA

Vercel:

- Project: `mimi-transporte`
- Target: `production`
- Status: `Ready`
- Alias principal: `https://mimi-transporte.vercel.app`
- Deployment: `dpl_DjAbnYCLhwDUwbyQV46HkEANWs1J`

HTTP smoke:

- `/prestador` -> `200`
- `/servicios` -> `200`
- `/mimi-servicios/manifest.json` -> `200`

Rutas/manifests/service workers locales:

- `manifest.json`, `manifest-clientes.json`, `manifest-driver.json`, `manifest-partners.json`, `mimi-servicios/manifest.json`: OK
- `service-worker.js`, `service-worker-clientes.js`, `firebase-messaging-sw.js`, `mimi-servicios/sw-2026.js`: OK
- `vercel.json` rewrites criticos: OK

## Frontend post-hardening

No se detecto uso frontend directo de las RPC residuales cerradas en la migration 05. El frontend de transporte usa wrappers/Edge/RPC distintas para aceptar/rechazar viajes, y MIMI Servicios usa Edge Functions para requests/providers.

No se redeployaron Edge Functions porque no hubo cambios de codigo en functions. Las Edge Functions criticas siguen activas con `verify_jwt=true`:

- `svc-search-providers`
- `svc-create-request`
- `svc-provider-respond-offer`
- `svc-cancel-request`
- `admin-list-service-providers`
- `admin-review-service-provider`

## Pendiente no ejecutado por falta de credenciales

No se ejecuto E2E autenticado completo desde browser/API para:

- cliente crea solicitud real
- prestador recibe solicitud real
- oferta creada real por flujo cliente
- oferta aceptada/rechazada real por prestador
- request iniciada/completada real

Motivo: no se proporcionaron JWTs/sesiones de usuario cliente y prestador para pruebas automatizadas remotas. Ejecutar esos pasos manualmente o proveer `MIMI_AUTH_JWT_CLIENT` y `MIMI_AUTH_JWT_PROVIDER` permitiria automatizarlo sin usar service_role en cliente.

## Riesgos residuales

1. Falta E2E autenticado real post-hardening con usuarios cliente/prestador/admin/chofer.
2. `svc_request_events` ya registra eventos, pero todavia no hay eventos reales de `request_created`, `offer_created`, `offer_accepted`, `offer_rejected`, `request_started` o `request_completed` posteriores a una prueba funcional completa.
3. Frontend sigue teniendo archivos grandes (`main-provider.js`, `main-client.js`) y varios usos de `innerHTML`; no es blocker inmediato, pero es deuda enterprise para refactor/sanitizacion sistematica.
4. CLI Supabase instalada: `v2.95.4`; disponible `v2.98.2`. Actualizar en ventana controlada, no durante release caliente.

## Criterio 10/10

Backend hardening: **cumplido**.

- RPC internas cerradas: OK
- `SECURITY DEFINER` sin `anon`: OK
- `search_path`: OK
- RLS push tokens/provider intents: OK
- audit trail instalado y generando eventos: OK
- expiration worker instalado y ejecutado: OK
- realtime requerido: OK
- backups previos: OK

Release global: **9/10 operativo**, no 10/10 absoluto hasta ejecutar E2E autenticado real cliente/prestador/admin/chofer y confirmar eventos de ciclo completo.
