-- MIMI backend hardening - RLS policies
-- Draft idempotente. Revisar en branch antes de produccion.

begin;

-- 1) push_tokens: cerrar SELECT/UPDATE globales.
drop policy if exists "allow insert push tokens" on public.push_tokens;
drop policy if exists "allow select push tokens" on public.push_tokens;
drop policy if exists "allow update push tokens" on public.push_tokens;

create policy push_tokens_insert_own
on public.push_tokens
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and token is not null
);

create policy push_tokens_select_own_or_admin
on public.push_tokens
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.is_admin_user((select auth.uid()))
);

create policy push_tokens_update_own_or_admin
on public.push_tokens
for update
to authenticated
using (
  user_id = (select auth.uid())
  or public.is_admin_user((select auth.uid()))
)
with check (
  user_id = (select auth.uid())
  or public.is_admin_user((select auth.uid()))
);

-- 2) svc_provider_intents: quitar role public + ALL.
drop policy if exists providers_own_intents on public.svc_provider_intents;

create policy svc_provider_intents_select_own_or_admin
on public.svc_provider_intents
for select
to authenticated
using (
  provider_id in (
    select p.id from public.svc_providers p where p.user_id = (select auth.uid())
  )
  or public.is_admin_user((select auth.uid()))
);

create policy svc_provider_intents_insert_own
on public.svc_provider_intents
for insert
to authenticated
with check (
  provider_id in (
    select p.id from public.svc_providers p where p.user_id = (select auth.uid())
  )
);

create policy svc_provider_intents_update_own_or_admin
on public.svc_provider_intents
for update
to authenticated
using (
  provider_id in (
    select p.id from public.svc_providers p where p.user_id = (select auth.uid())
  )
  or public.is_admin_user((select auth.uid()))
)
with check (
  provider_id in (
    select p.id from public.svc_providers p where p.user_id = (select auth.uid())
  )
  or public.is_admin_user((select auth.uid()))
);

-- 3) Storage driver-documents: eliminar policies bucket-only.
-- Mantener las policies por carpeta auth.uid() y admin.
drop policy if exists "Allow read own documents" on storage.objects;
drop policy if exists "Allow update own documents" on storage.objects;
drop policy if exists "Allow upload own documents" on storage.objects;
drop policy if exists driver_documents_storage_insert on storage.objects;
drop policy if exists driver_documents_storage_select on storage.objects;
drop policy if exists driver_documents_storage_update on storage.objects;

-- 4) Legal/audit/payment ledgers: no agregar escrituras de cliente aqui.
-- Si se requieren mutaciones, deben pasar por Edge Functions con service role e idempotency.

commit;

-- Rollback rapido:
-- create policy "allow select push tokens" on public.push_tokens for select to authenticated using (true);
-- create policy "allow update push tokens" on public.push_tokens for update to authenticated using (true) with check (true);
-- create policy "allow insert push tokens" on public.push_tokens for insert to authenticated with check (true);

