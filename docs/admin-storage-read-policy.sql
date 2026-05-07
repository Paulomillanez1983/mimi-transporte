-- MIMI Admin - lectura segura de documentos de prestadores.
-- Permite que usuarios activos en public.admin_users generen signed URLs
-- para revisar archivos privados del bucket service-provider-documents.

drop policy if exists "admin read service provider documents" on storage.objects;

create policy "admin read service provider documents"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'service-provider-documents'
  and exists (
    select 1
    from public.admin_users au
    where au.user_id = auth.uid()
      and au.active = true
  )
);
