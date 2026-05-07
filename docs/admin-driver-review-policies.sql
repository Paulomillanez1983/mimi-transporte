-- Admin review support for driver/provider operations.
-- Safe additive RLS policies: no data is deleted and existing self-service policies stay intact.

alter table public.driver_profiles enable row level security;
alter table public.driver_documents enable row level security;
alter table public.choferes enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "admin users can read driver profiles" on public.driver_profiles;
create policy "admin users can read driver profiles"
on public.driver_profiles
for select
to authenticated
using (public.is_admin_user(auth.uid()));

drop policy if exists "admin users can update driver profiles" on public.driver_profiles;
create policy "admin users can update driver profiles"
on public.driver_profiles
for update
to authenticated
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

drop policy if exists "admin users can read driver documents" on public.driver_documents;
create policy "admin users can read driver documents"
on public.driver_documents
for select
to authenticated
using (public.is_admin_user(auth.uid()));

drop policy if exists "admin users can update driver documents" on public.driver_documents;
create policy "admin users can update driver documents"
on public.driver_documents
for update
to authenticated
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

drop policy if exists "admin users can read choferes" on public.choferes;
create policy "admin users can read choferes"
on public.choferes
for select
to authenticated
using (public.is_admin_user(auth.uid()));

drop policy if exists "admin users can update choferes" on public.choferes;
create policy "admin users can update choferes"
on public.choferes
for update
to authenticated
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

drop policy if exists "admin users can read audit logs" on public.audit_logs;
create policy "admin users can read audit logs"
on public.audit_logs
for select
to authenticated
using (public.is_admin_user(auth.uid()));

drop policy if exists "admin users can insert audit logs" on public.audit_logs;
create policy "admin users can insert audit logs"
on public.audit_logs
for insert
to authenticated
with check (
  user_id = auth.uid()
  and actor_type = 'admin'
  and public.is_admin_user(auth.uid())
);

drop policy if exists "admin read driver documents" on storage.objects;
create policy "admin read driver documents"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'driver-documents'
  and public.is_admin_user(auth.uid())
);
