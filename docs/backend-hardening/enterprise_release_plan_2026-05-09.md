# MIMI backend enterprise release plan

Fecha: 2026-05-09

Objetivo: aplicar hardening Supabase/Postgres por fases, sin romper cliente, prestador, chofer, admin, KYC, pagos ni realtime.

## Estado base

- Auditor local `node qa/audit-supabase.js`: debe seguir en `ok: true`.
- Encoding `node qa/audit-encoding.js`: debe seguir en `ok: true`.
- Edge Functions criticas ya desplegadas:
  - `svc-search-providers`
  - `svc-provider-respond-offer`
- Riesgos abiertos antes de aplicar migrations:
  - RPC internas expuestas.
  - Policies permisivas en `push_tokens`.
  - Policy publica amplia en `svc_provider_intents`.
  - `svc_request_events` sin audit trail real.
  - Ofertas/requests viejas pendientes.
  - Drift de migrations remoto/local.

## Migrations nuevas

1. `supabase/migrations/20260509221109_enterprise_01_security_definer_search_path.sql`
   - Bajo riesgo.
   - Fija `search_path = public, pg_temp` para funciones de aplicacion.

2. `supabase/migrations/20260509221209_enterprise_02_rpc_permissions.sql`
   - Riesgo medio.
   - Revoca `anon/authenticated` en RPC internas y deja `service_role`.
   - Mantiene RPC legacy de transporte y helpers RLS como `authenticated`.

3. `supabase/migrations/20260509221309_enterprise_03_rls_policy_hardening.sql`
   - Riesgo medio.
   - Endurece `push_tokens`, `svc_provider_intents`, `svc_request_events` y storage policies amplias.

4. `supabase/migrations/20260509221409_enterprise_04_service_audit_and_expiration.sql`
   - Riesgo medio.
   - Agrega audit trail via triggers.
   - Agrega worker `svc_expire_stale_service_requests(p_limit integer)`.

## Backup obligatorio

Crear carpeta local:

```powershell
New-Item -ItemType Directory -Force backups
```

Dump de schema:

```powershell
supabase db dump --linked --schema public,storage -f backups/mimi_schema_before_enterprise_hardening.sql
```

Dump de datos criticos:

```powershell
supabase db dump --linked --data-only -f backups/mimi_data_before_enterprise_hardening.sql
```

Guardar tambien capturas o exports de:

- `supabase_migrations.schema_migrations`
- `pg_policies`
- `information_schema.role_table_grants`
- `pg_proc` grants de funciones criticas

## Comandos de drift

```powershell
supabase migration list --linked
supabase migration list --local
```

El drift conocido no se resuelve borrando migrations. Se agregaron archivos no-op `*.remote_applied.sql` para reflejar localmente las versiones que ya existen en el historial remoto y permitir `db push` futuro sin reparar historia remota.

Estrategia recomendada:

1. Mantener las migrations remotas actuales como baseline productivo.
2. No usar esos archivos no-op como baseline para ambientes nuevos.
3. En una ventana separada, generar snapshot/baseline real con `supabase db pull` o dump validado.
4. No usar Supabase Studio para cambios estructurales sin migration.
5. A partir de esta release, todo cambio entra por `supabase/migrations`.

## Validaciones antes de aplicar

```powershell
node qa/audit-supabase.js
node qa/audit-encoding.js
node --check mimi-servicios/src/services/service-api.js
node qa/backend-hardening-static.js
git diff --check
```

SQL read-only:

```powershell
supabase db query --linked -f docs/backend-hardening/enterprise_validation.sql
```

Si la CLI no tiene `db query`, ejecutar el contenido de `enterprise_validation.sql` en Supabase SQL Editor.

Dry-run de aplicacion:

```powershell
supabase db push --linked --dry-run
```

Este comando debe listar solo las cuatro migrations enterprise nuevas antes de aplicar.

## Orden de aplicacion

Aplicar de a una migration y validar despues de cada una.

Aplicacion general cuando el dry-run este correcto:

```powershell
supabase db push --linked
```

Para control quirurgico, aplicar en branch/staging primero o copiar cada migration al SQL Editor en el orden exacto indicado abajo.

### Fase 01

Aplicar `enterprise_01_security_definer_search_path`.

Validar:

- Login cliente/prestador/chofer/admin.
- `enterprise_validation.sql`: `secdef_missing_search_path` debe bajar.
- No deben aparecer errores 42501/permission denied.

Go/no-go:

- Go si no hay errores funcionales.
- No-go si alguna Edge Function empieza a fallar por resolucion de objetos.

### Fase 02

Aplicar `enterprise_02_rpc_permissions`.

Validar:

- `svc-create-request`, `svc-search-providers`, `svc-provider-respond-offer`.
- Transporte legacy: aceptar/rechazar/iniciar/completar.
- Admin KYC.
- `enterprise_validation.sql`: RPC internal debe mostrar `anon_execute=false` y `authenticated_execute=false`.
- `node qa/backend-hardening-rpc-smoke.js --require-env` con env configurado.

Go/no-go:

- Go si Edge Functions service-role siguen funcionando.
- No-go si frontend invoca una RPC que paso a service-only. Rollback puntual con `GRANT EXECUTE`.

### Fase 03

Aplicar `enterprise_03_rls_policy_hardening`.

Validar:

- Registro/update de push token con usuario logueado.
- Prestador puede guardar intents/oficio.
- Admin puede listar/operar.
- Usuario no puede leer/modificar tokens de otro usuario.
- Documentos KYC siguen visibles para owner/admin y no publicos.

Go/no-go:

- Go si no se rompe login, notificaciones, provider onboarding ni admin.
- No-go si push token o provider intent quedan bloqueados por falta de `user_id/provider_id`.

### Fase 04

Aplicar `enterprise_04_service_audit_and_expiration`.

Validar:

- Crear solicitud genera `request_created`.
- Crear oferta genera `offer_created`.
- Aceptar genera `offer_accepted`.
- Rechazar genera `offer_rejected`.
- Cancelar genera `request_cancelled`.
- Iniciar genera `request_started`.
- Completar genera `request_completed`.
- Ejecutar worker en ventana controlada:

```sql
select public.svc_expire_stale_service_requests(50);
```

- Confirmar `offer_expired` y `request_expired` donde corresponda.

Go/no-go:

- Go si audit trail aparece sin duplicaciones masivas ni bloqueo de requests.
- No-go si trigger genera errores en create/accept/cancel.

## Rollback

Rollback de search_path:

```sql
alter function public.nombre(args) reset search_path;
```

Rollback RPC puntual:

```sql
grant execute on function public.nombre(args) to authenticated;
```

Rollback RLS puntual:

```sql
drop policy if exists policy_name on public.table_name;
```

Rollback audit triggers:

```sql
drop trigger if exists trg_svc_requests_audit_lifecycle on public.svc_requests;
drop trigger if exists trg_svc_request_offers_audit_lifecycle on public.svc_request_offers;
```

Rollback worker:

```sql
revoke execute on function public.svc_expire_stale_service_requests(integer) from service_role;
```

No borrar eventos generados salvo que se confirme que son corruptos. El audit trail debe ser append-only.

## Checklist final

- Cliente busca prestador con domicilio valido.
- Cliente solicita a prestador.
- Prestador recibe solicitud completa.
- Prestador acepta y cliente ve aceptado.
- Prestador rechaza y la oferta no queda pendiente.
- Cliente cancela y request/ofertas se cierran.
- Admin ve eventos, documentos y estados.
- Chofer/transporte legacy sigue operando.
- No hay errores 401/403/42501 inesperados.
- No hay service_role en frontend.
- `enterprise_validation.sql` no muestra exposiciones criticas nuevas.

## Criterio final

No declarar backend 10/10 hasta que:

- Las cuatro fases esten aplicadas.
- Los tests automaticos y manuales pasen.
- No haya stale requests/ofertas despues del worker.
- Admin pueda auditar el lifecycle completo.
- Las funciones internal-only no sean ejecutables por `anon` ni `authenticated`.
