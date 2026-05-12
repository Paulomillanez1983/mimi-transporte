# PocketBase CMS Enterprise Runtime - MIMI Servicios

## Decision

PocketBase stays enabled as a secondary, decoupled CMS for lightweight visual content.
Supabase remains the primary transactional backend.

## Supabase owns

- Auth
- Users
- Service requests and offers
- Payments and commissions
- KYC
- Critical storage
- Realtime
- Audit logs
- Providers, clients and drivers

## PocketBase owns

- `service_categories`
- `banners`
- `home_sections`
- `feature_flags`
- `faqs`
- visual app config
- marketing and editable UI text

PocketBase must never store secrets, tokens, payment data, KYC documents, service lifecycle state or marketplace transactions.

## Frontend runtime behavior

- MIMI Servicios has two primary CMS-aware experiences:
  - Client: `/servicios`
  - Provider: `/prestador`
- `/servicios` can consume CMS categories, banners, home sections, FAQs and visual flags.
- `/prestador` consumes CMS flags and uses CMS categories only to enrich existing Supabase categories. It does not let CMS-only categories become transactional provider services.
- `VITE_POCKETBASE_URL` or `MIMI_POCKETBASE_URL` can override the CMS URL.
- Local development defaults to `http://127.0.0.1:8090`.
- Production on `mimigo.com.ar` derives `https://cms.mimigo.com.ar`.
- Vercel previews and fallback domains keep CMS disabled unless explicitly configured.
- `mimi-servicios/env.js` currently points production traffic to `https://cms.mimigo.com.ar` with a 2500ms timeout.
- If PocketBase is down, the app uses local fallback content and cached CMS content when available.
- PocketBase reads are timeout-bound, non-blocking and never required for auth or service requests.
- The CMS client supports both the current production schema (`active=true`) and the earlier seed schema (`enabled=true`) for rollback compatibility.

## Service worker policy

- `env.js` is treated as live runtime config and is fetched network-first.
- PocketBase API requests are not cached by the service worker.
- CMS caching is handled by the app-level PocketBase client with bounded TTL.

## Production hosting checklist

- Hetzner VPS running PocketBase behind Caddy.
- Public CMS domain: `https://cms.mimigo.com.ar`.
- Cloudflare proxy enabled only after health checks pass.
- HTTPS valid through Caddy or Cloudflare Full Strict.
- CORS allows `https://mimigo.com.ar` and the Vercel fallback domain.
- Public list/view rules only for enabled CMS records.
- Public create/update/delete disabled.
- Admin access protected with strong credentials and 2FA where available.
- Daily backups of `pb_data`.
- Server firewall allows only SSH, HTTP and HTTPS.
- Health check monitored at `/api/health`.

## Setup command

Run only from a trusted local terminal with admin variables set. Never commit these values.

```powershell
$env:POCKETBASE_URL="https://cms.mimigo.com.ar"
$env:POCKETBASE_ADMIN_EMAIL="<admin email>"
$env:POCKETBASE_ADMIN_PASSWORD="<admin password>"
node scripts/setup-pocketbase-cms.mjs
```

Expected public checks after setup:

```powershell
curl.exe -I https://cms.mimigo.com.ar/_/
curl.exe -I https://cms.mimigo.com.ar/api/health
curl.exe -L "https://cms.mimigo.com.ar/api/collections/service_categories/records?perPage=1&filter=active=true"
```

Public write checks must return unauthorized/forbidden:

```powershell
curl.exe -X POST "https://cms.mimigo.com.ar/api/collections/banners/records" -H "Content-Type: application/json" -d "{\"slug\":\"public-probe\",\"title\":\"probe\",\"active\":true}"
```

## Rollback

Set `MIMI_POCKETBASE_ENABLED=false` in runtime config or clear `VITE_POCKETBASE_URL`.
The app will continue with local fallback categories and static content.
