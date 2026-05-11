-- Enterprise KYC read-path hardening for MIMI Servicios.
-- Non-destructive: adds indexes used by svc-verify-provider-identity rate limiting
-- and by admin/provider document review screens.

create index if not exists idx_svc_identity_checks_provider_created_at
on public.svc_provider_identity_checks (provider_id, created_at desc);

create index if not exists idx_svc_identity_checks_provider_status_created_at
on public.svc_provider_identity_checks (provider_id, status, created_at desc);

create index if not exists idx_svc_provider_documents_provider_type_created_at
on public.svc_provider_documents (provider_id, document_type, created_at desc);

create index if not exists idx_svc_provider_documents_pending_review
on public.svc_provider_documents (review_status, created_at desc)
where review_status = 'PENDING';
