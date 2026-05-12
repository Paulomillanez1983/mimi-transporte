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

- `VITE_POCKETBASE_URL` or `MIMI_POCKETBASE_URL` can override the CMS URL.
- Local development defaults to `http://127.0.0.1:8090`.
- Production on `mimigo.com.ar` derives `https://cms.mimigo.com.ar`.
- Vercel previews and fallback domains keep CMS disabled unless explicitly configured.
- If PocketBase is down, the app uses local fallback content and cached CMS content when available.
- PocketBase reads are timeout-bound, non-blocking and never required for auth or service requests.

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

## Rollback

Set `MIMI_POCKETBASE_ENABLED=false` in runtime config or clear `VITE_POCKETBASE_URL`.
The app will continue with local fallback categories and static content.
