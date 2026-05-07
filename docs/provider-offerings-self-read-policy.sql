-- Let each service provider read their own service offerings before admin approval.
-- Public clients still only see active offerings from approved, unblocked providers through the existing policy.

alter table public.svc_provider_service_offerings enable row level security;

drop policy if exists "svc_provider_service_offerings_provider_select_own" on public.svc_provider_service_offerings;
create policy "svc_provider_service_offerings_provider_select_own"
on public.svc_provider_service_offerings
for select
to authenticated
using (
  exists (
    select 1
    from public.svc_providers p
    where p.id = svc_provider_service_offerings.provider_id
      and p.user_id = auth.uid()
  )
);
