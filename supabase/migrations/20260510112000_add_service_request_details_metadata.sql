-- Store the client-confirmed service details in the service request itself.
-- Safe additive migration: no existing data is changed or deleted.

alter table public.svc_requests
  add column if not exists metadata_json jsonb not null default '{}'::jsonb;

create index if not exists idx_svc_requests_metadata_json
  on public.svc_requests using gin (metadata_json);

comment on column public.svc_requests.metadata_json is
  'Structured request details confirmed by the client, such as pricing model, unit quantity, service mode and provider-facing summary.';
