-- MIMI Servicios low-cost realtime/snapshot indexes.
-- Safe additive indexes only; no data rewrite, no destructive changes.

create index if not exists idx_svc_providers_search_snapshot
  on public.svc_providers (approved, blocked, status, last_seen_at desc)
  where approved = true and blocked = false;

create index if not exists idx_svc_provider_categories_category_active_provider
  on public.svc_provider_categories (category_id, active, provider_id);

create index if not exists idx_svc_provider_pricing_category_active_provider
  on public.svc_provider_pricing (category_id, active, provider_id);

create index if not exists idx_svc_provider_service_offerings_category_active_provider
  on public.svc_provider_service_offerings (category_id, active, provider_id);

create index if not exists idx_svc_request_offers_provider_inbox
  on public.svc_request_offers (provider_id, status, expires_at desc, request_id);

create index if not exists idx_svc_requests_client_active
  on public.svc_requests (client_user_id, status, updated_at desc);

create index if not exists idx_svc_requests_provider_active
  on public.svc_requests (selected_provider_id, accepted_provider_id, status, updated_at desc);

create index if not exists idx_svc_tracking_request_recent
  on public.svc_tracking (request_id, tracked_at desc);
