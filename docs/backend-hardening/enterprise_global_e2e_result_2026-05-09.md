# MIMI enterprise global E2E result - 2026-05-09

## Executive status

Global enterprise 10/10 is **not declared by this runner yet**.

The backend hardening is applied and the security validation is passing in production. The last production blocker in `svc-complete-service` was fixed and the current E2E request was completed with the corrected backend path. The only remaining declaration gate is re-running `node qa\enterprise-global-e2e.js` in a terminal that has the controlled client/provider/admin credentials configured, so the script itself can return `"ok": true`.

I did not fake JWTs, did not disable JWT verification, did not weaken RLS, and did not expose service-role credentials to the frontend path.

## Production baseline confirmed

- Supabase project: `xrphpqmutvadjrucqicn`
- Vercel production deployment: Ready at validation time; inspect the current alias for the live deployment id.
- Production alias: `https://mimi-transporte.vercel.app`
- Backend migrations local/remote: aligned through `20260510020223`
- Realtime publication: 8 required tables present
- Stale service requests/offers: `0/0`
- RPC internal exposure: `0`
- SECURITY DEFINER missing search_path: `0`
- `push_tokens` true policies: `0`
- `svc_provider_intents` public policies: `0`
- `svc_request_events` participant/admin read policy: present

## Fix applied during final gate

### Final completion ledger fix

`supabase/migrations/20260510020223_fix_svc_complete_service_ledger_entries.sql`

Production error found in `svc-complete-service`:

```text
code: 23514
constraint: svc_financial_ledger_entry_type_check
failing entry_type: PLATFORM_FEE
```

The enterprise ledger constraint currently allows:

- `ESCROW_RELEASE`
- `PLATFORM_FEE_ACCRUAL`
- `PROVIDER_EARNING_ACCRUAL`
- `REFUND`
- `CANCELLATION_FEE`

The old RPC `svc_complete_service_atomic` still inserted legacy values `PLATFORM_FEE` and `PROVIDER_EARNING`. The migration replaced those with `PLATFORM_FEE_ACCRUAL` and `PROVIDER_EARNING_ACCRUAL`, kept `search_path = public, pg_temp`, preserved internal-only execute grants, validates provider ownership, completes the active assignment, returns the provider to `ONLINE_IDLE`, and keeps the audit trigger path intact.

`svc-complete-service` was redeployed after updating `_shared/service-lifecycle.ts` so Supabase error objects are surfaced with their real `message` instead of collapsing to `unexpected_error`.

### Migration

`supabase/migrations/20260509234909_enterprise_06_guard_provider_admin_fields.sql`

### Why

The policy `svc_providers_self_update` allows a provider to update their own provider row. That is correct for profile fields, but it also made admin-controlled fields risky if not guarded at database level.

### What changed

Added a `BEFORE UPDATE` trigger on `public.svc_providers`:

- Blocks non-admin/non-service-role updates to `approved`.
- Blocks non-admin/non-service-role updates to `blocked`.
- Blocks non-admin/non-service-role updates to `notes_internal`.
- Keeps normal provider profile updates compatible.
- Uses SECURITY DEFINER with `search_path = public, pg_temp`.
- Revokes execute from `public`, `anon`, and `authenticated`.

### Validation

`enterprise_validation.sql` now includes:

- `provider_admin_guard.guard_function_hardened = 1`
- `provider_admin_guard.guard_trigger_present = 1`

Both are passing in production.

## Authenticated E2E status

### Provider test account preparation

Prepared on 2026-05-10 UTC, scoped only to:

- Email: `testprestador@mimi-go.app`
- Auth user id: `ed5fe977-d2cb-414c-84ba-205dffbd4eac`
- Provider id: `4a05bc72-b6f5-4f6b-b27f-2f93921f9745`

Preparation SQL:

- `docs/backend-hardening/e2e_prepare_test_provider_2026-05-09.sql`

The script is intentionally scoped by exact email and does not touch real providers. It made the test provider compatible with the E2E flow:

- `approved = true`
- `blocked = false`
- `status = ONLINE_IDLE`
- `last_lat = -31.3101063`
- `last_lng = -64.2753784`
- `notes_internal = E2E test account...`
- profile `review_status = approved`
- profile `kyc_status = approved`
- profile `onboarding_completed = true`
- category linked: `PINTURA`
- active offering created/updated: `Pintura E2E`
- offering pricing model: `SQUARE_METER`
- offering unit: `m2`
- offering price: `15000`
- offering metadata includes `"e2e": true`

Verification after preparation confirmed rows in:

- `svc_providers`
- `svc_provider_profiles`
- `svc_provider_categories`
- `svc_provider_service_offerings`

### Required test users

The provider row is now prepared, but reusable controlled credentials are still required in the shell that runs the E2E.

Required env for the real E2E runner:

```powershell
$env:MIMI_SUPABASE_URL="https://xrphpqmutvadjrucqicn.supabase.co"
$env:MIMI_SUPABASE_ANON_KEY="<anon key>"
$env:MIMI_E2E_CLIENT_EMAIL="<controlled client email>"
$env:MIMI_E2E_CLIENT_PASSWORD="<password>"
$env:MIMI_E2E_PROVIDER_EMAIL="<controlled provider email>"
$env:MIMI_E2E_PROVIDER_PASSWORD="<password>"
$env:MIMI_E2E_ADMIN_EMAIL="<controlled admin email>"
$env:MIMI_E2E_ADMIN_PASSWORD="<password>"
node qa\enterprise-global-e2e.js
```

### Signup attempts

I intentionally avoided creating uncontrolled users. Attempts to create disposable test users through the public auth path did not produce usable accounts:

- `@example.com` style test email: rejected by Supabase as invalid email.
- Gmail plus-address test email: blocked by email rate limit (`429`).

### E2E runner created

`qa/enterprise-global-e2e.js`

The script performs the real authenticated path:

1. Signs in client and provider with real Supabase Auth.
2. Confirms real user/JWT for both.
3. Loads the provider row owned by the provider session.
4. Verifies provider is approved and not blocked.
5. Loads an active provider service offering.
6. Calls `svc-search-providers`.
7. Calls `svc-create-request`.
8. Verifies the provider can see the request/offer via RLS.
9. Calls `svc-provider-respond-offer` to accept.
10. Calls `svc-provider-en-route`.
11. Calls `svc-provider-arrived`.
12. Calls `svc-start-service`.
13. Calls `svc-complete-service`.
14. Reads `svc_request_events`.
15. Opens a Realtime websocket for request/offer changes.
16. If admin credentials are provided, verifies admin can read the trace.

The script fails closed if credentials, events, realtime, or admin trace are missing.

Current execution result:

```json
{
  "ok": false,
  "skipped": true,
  "reason": "missing_required_env",
  "missing": [
    "MIMI_SUPABASE_URL",
    "MIMI_SUPABASE_ANON_KEY",
    "MIMI_E2E_CLIENT_EMAIL",
    "MIMI_E2E_CLIENT_PASSWORD",
    "MIMI_E2E_PROVIDER_EMAIL",
    "MIMI_E2E_PROVIDER_PASSWORD",
    "MIMI_E2E_ADMIN_EMAIL",
    "MIMI_E2E_ADMIN_PASSWORD"
  ]
}
```

Earlier blocker `provider_not_approved_or_blocked` is resolved for `testprestador@mimi-go.app`.

Second blocker `provider_request_not_found` was traced to the E2E fixture, not to the production flow:

- Before accepting, the provider should see the pending work through `svc_request_offers`.
- `svc_requests` is intentionally not visible to the provider until `accepted_provider_id` is set.
- The E2E runner now verifies `svc_request_offers` first, accepts through `svc-provider-respond-offer`, then verifies the request with the provider JWT after acceptance.

The runner also now asserts that `svc-search-providers` returns the prepared test provider before creating the request.

Third blocker `BOOT_ERROR / Function failed to start / 503` was traced to the service lifecycle Edge Functions:

- `svc-provider-en-route`
- `svc-provider-arrived`
- `svc-start-service`
- `svc-complete-service`

The installed Supabase CLI version does not provide `supabase functions logs`; attempting the requested command returned CLI usage help. The source issue was still confirmed from repository state and smoke tests: these remote functions existed, but their local source directories were empty. I rebuilt the source and redeployed only the affected functions using:

```powershell
supabase functions deploy svc-provider-en-route --project-ref xrphpqmutvadjrucqicn --workdir mimi-servicios --use-api
supabase functions deploy svc-provider-arrived --project-ref xrphpqmutvadjrucqicn --workdir mimi-servicios --use-api
supabase functions deploy svc-start-service --project-ref xrphpqmutvadjrucqicn --workdir mimi-servicios --use-api
supabase functions deploy svc-complete-service --project-ref xrphpqmutvadjrucqicn --workdir mimi-servicios --use-api
```

Smoke verification after redeploy:

- `svc-provider-en-route`: controlled `401 AUTH_REQUIRED`, no BOOT_ERROR.
- `svc-provider-arrived`: controlled `401 AUTH_REQUIRED`, no BOOT_ERROR.
- `svc-start-service`: controlled `401 AUTH_REQUIRED`, no BOOT_ERROR.
- `svc-complete-service`: controlled `401 AUTH_REQUIRED`, no BOOT_ERROR.

Implementation notes:

- JWT is validated with Supabase Auth before any mutation.
- Provider is resolved from `auth.uid()`.
- Provider must be approved and not blocked.
- Request must belong to `accepted_provider_id`.
- Lifecycle transitions are explicit:
  - `ACCEPTED/SCHEDULED -> PROVIDER_EN_ROUTE`
  - `PROVIDER_EN_ROUTE -> PROVIDER_ARRIVED`
  - `PROVIDER_ARRIVED/PROVIDER_EN_ROUTE/ACCEPTED/SCHEDULED -> IN_PROGRESS`
  - `IN_PROGRESS -> COMPLETED`
- `svc-complete-service` calls the internal RPC `svc_complete_service_atomic` only after provider ownership validation.
- `service_role` remains server-side only inside Edge Functions.
- No RLS policy was weakened.

Current blocker in the Codex execution environment: missing E2E credential env vars. The script must be re-run in the terminal where the client/provider/admin test credentials are configured.

Final `svc-complete-service` blocker was fixed and verified against the current E2E request:

- Request: `0b3d9815-8677-417f-8122-8ba7ac02dc01`
- Status after fix: `COMPLETED`
- `completed_at`: `2026-05-10 02:06:09.721681+00`
- Provider: `testprestador@mimi-go.app`
- Provider status after completion: `ONLINE_IDLE`
- Ledger rows:
  - `ESCROW_RELEASE` / `ARS 15000.00`
  - `PLATFORM_FEE_ACCRUAL` / `ARS 0.00`
  - `PROVIDER_EARNING_ACCRUAL` / `ARS 15000.00`

## Events currently present

Current E2E request event trail:

```text
request_created
offer_created
offer_accepted
request_provider_en_route
request_provider_arrived
request_started
request_completed
```

Production validation after the fix reports `service_events.total_events = 32` and `service_expiration.stale_active_requests/stale_pending_offers = 0/0`.

## QA commands executed

```powershell
supabase migration list --linked
supabase db query --linked -f docs/backend-hardening/enterprise_validation.sql -o json
node qa\backend-hardening-static.js
node qa\backend-hardening-rpc-smoke.js --require-env
node qa\audit-supabase.js
node qa\audit-routes.js
node qa\audit-encoding.js
node qa\enterprise-global-e2e.js
node --check qa\enterprise-global-e2e.js
node --check mimi-servicios\src\services\service-api.js
git diff --check
npx vercel inspect https://mimi-transporte.vercel.app
curl.exe -L -s -o NUL -w "%{http_code} %{url_effective}" https://mimi-transporte.vercel.app/servicios
curl.exe -L -s -o NUL -w "%{http_code} %{url_effective}" https://mimi-transporte.vercel.app/prestador
curl.exe -L -s -o NUL -w "%{http_code} %{url_effective}" https://mimi-transporte.vercel.app/chofer
curl.exe -L -s -o NUL -w "%{http_code} %{url_effective}" https://mimi-transporte.vercel.app/operadores
```

## QA results

- `enterprise_validation.sql`: pass.
- RPC smoke with real anon key: pass, internal RPCs return `42501 permission denied`.
- `backend-hardening-static.js`: pass.
- `audit-supabase.js`: pass.
- `audit-routes.js`: pass in previous route validation.
- `audit-encoding.js`: pass.
- `service-api.js` syntax: pass.
- `git diff --check`: pass, only LF/CRLF warnings.
- `svc-complete-service` unauthenticated smoke: controlled `401`, no BOOT_ERROR.
- `enterprise-global-e2e.js` in this runner: skipped because E2E env secrets are not available in this process.
- Production routes:
  - `/servicios`: 200
  - `/prestador`: 200
  - `/chofer`: 200
  - `/operadores`: 200
- Vercel production: Ready.

## Edge Functions

Remote production functions are active for the service lifecycle:

- `svc-search-providers`
- `svc-create-request`
- `svc-provider-respond-offer`
- `svc-provider-en-route`
- `svc-provider-arrived`
- `svc-start-service`
- `svc-complete-service`
- `svc-cancel-request`

Source-of-truth status:

The service lifecycle function source has been recreated in the repository and redeployed. The earlier empty-directory governance issue for `svc-provider-en-route`, `svc-provider-arrived`, `svc-start-service`, and `svc-complete-service` is resolved.

## Frontend/PWA/Vercel audit

Confirmed:

- Critical clean routes exist locally and return 200 in production for the requested routes.
- Manifests are valid locally.
- Service workers exist locally:
  - `service-worker.js`
  - `service-worker-clientes.js`
  - `firebase-messaging-sw.js`
  - `mimi-servicios/sw-2026.js`
- No missing local assets detected by route audit.
- No encoding findings.

Not fully confirmed:

- Browser console authenticated customer/provider/admin flows, because authenticated E2E credentials are missing.
- Mobile visual QA with a real logged-in session, for the same reason.

## Go/no-go

### Backend security

Go.

Production checks are passing after hardening phases 01-06.

### Global enterprise 10/10

Go for backend hardening. Global enterprise 10/10 remains gated only on the authenticated E2E script returning `"ok": true` from a shell with the controlled credentials. The current request lifecycle evidence is complete, but the release rule requires the runner output.

- one completed test request,
- accepted offer,
- request lifecycle through `IN_PROGRESS` and `COMPLETED`,
- `request_started` and `request_completed` events,
- Realtime events observed,
- admin trace confirmed.

## Exact next action

Create or provide three controlled test accounts:

1. Client test user.
2. Provider test user, approved, not blocked, with one active offering and online/available.
3. Admin test user.

Then run:

```powershell
$env:MIMI_SUPABASE_URL="https://xrphpqmutvadjrucqicn.supabase.co"
$env:MIMI_SUPABASE_ANON_KEY="<anon key>"
$env:MIMI_E2E_CLIENT_EMAIL="<client>"
$env:MIMI_E2E_CLIENT_PASSWORD="<password>"
$env:MIMI_E2E_PROVIDER_EMAIL="<provider>"
$env:MIMI_E2E_PROVIDER_PASSWORD="<password>"
$env:MIMI_E2E_ADMIN_EMAIL="<admin>"
$env:MIMI_E2E_ADMIN_PASSWORD="<password>"
node qa\enterprise-global-e2e.js
```

If the script returns `"ok": true`, the final global enterprise 10/10 declaration can be made.
