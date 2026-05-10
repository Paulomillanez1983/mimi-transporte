# MIMI enterprise global E2E result - 2026-05-09

## Executive status

Global enterprise 10/10 is **not declared yet**.

The backend hardening is applied and the security validation is passing in production, but the final authenticated E2E could not be completed because there are no controlled client/provider/admin test credentials available to this release runner. I did not fake JWTs, did not use service-role shortcuts from the frontend path, and did not create uncontrolled production users.

## Production baseline confirmed

- Supabase project: `xrphpqmutvadjrucqicn`
- Vercel production deployment: Ready at validation time; inspect the current alias for the live deployment id.
- Production alias: `https://mimi-transporte.vercel.app`
- Backend migrations local/remote: aligned through `20260509234909`
- Realtime publication: 8 required tables present
- Stale service requests/offers: `0/0`
- RPC internal exposure: `0`
- SECURITY DEFINER missing search_path: `0`
- `push_tokens` true policies: `0`
- `svc_provider_intents` public policies: `0`
- `svc_request_events` participant/admin read policy: present

## Fix applied during final gate

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

Current blocker in the Codex execution environment: missing E2E credential env vars. The script must be re-run in the terminal where the client/provider/admin test credentials are configured.

## Events currently present

Current `svc_request_events` production counts:

```text
offer_accepted: 1
offer_created: 1
offer_expired: 8
request_cancelled: 3
request_created: 1
request_expired: 3
```

Important: there are no `request_started` or `request_completed` events yet from the new E2E gate. This is exactly why global 10/10 is still pending.

## QA commands executed

```powershell
supabase migration list --linked
supabase db query --linked -f docs/backend-hardening/enterprise_validation.sql -o json
node qa\backend-hardening-static.js
node qa\backend-hardening-rpc-smoke.js --require-env
node qa\audit-supabase.js
node qa\audit-routes.js
node qa\audit-encoding.js
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
- `audit-routes.js`: pass.
- `audit-encoding.js`: pass.
- `service-api.js` syntax: pass.
- `git diff --check`: pass, only LF/CRLF warnings.
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

Residual governance issue:

The local directories for `svc-provider-en-route`, `svc-provider-arrived`, `svc-start-service`, and `svc-complete-service` are present but empty in the workspace, while the remote functions are active. This does not break current production, but it prevents a clean source-of-truth guarantee until the deployed source is recovered into the repository or intentionally recreated and redeployed.

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

No-go until the authenticated E2E runs with controlled credentials and produces:

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
