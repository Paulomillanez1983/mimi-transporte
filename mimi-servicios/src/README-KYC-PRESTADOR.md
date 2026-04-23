# MIMI Servicios - Patch KYC Prestador

Archivos modificados:

- src/services/service-api.js
- src/main-provider.js
- src/ui/render-provider.js
- styles/provider.css

Qué agrega:

1. Crea/asegura `svc_providers` cuando un usuario entra por `prestador.html` y todavía no tiene fila de prestador.
2. Agrega función `uploadProviderDocument()` para subir documentos al bucket `service-provider-documents`.
3. Inserta metadata en `public.svc_provider_documents` con:
   - provider_id
   - document_type
   - storage_bucket
   - storage_path
   - mime_type
   - file_size_bytes
   - review_status = PENDING
   - metadata_json
4. Agrega screen/form de verificación en el panel de prestador.
5. Bloquea pasar a ONLINE si `svc_providers.approved` no es true.
6. No toca Transporte.

IMPORTANTE BACKEND/STORAGE

Tu inventario muestra la tabla `svc_provider_documents`, pero no muestra bucket/policies de `service-provider-documents`.
Si al subir aparece error de bucket, ejecutá esto en Supabase SQL Editor:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'service-provider-documents',
  'service-provider-documents',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy if not exists "svc provider docs read own folder"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'service-provider-documents'
  and (storage.foldername(name))[1] = public.svc_get_provider_id_by_user(auth.uid())::text
);

create policy if not exists "svc provider docs upload own folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'service-provider-documents'
  and (storage.foldername(name))[1] = public.svc_get_provider_id_by_user(auth.uid())::text
);

create policy if not exists "svc provider docs update own folder"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'service-provider-documents'
  and (storage.foldername(name))[1] = public.svc_get_provider_id_by_user(auth.uid())::text
)
with check (
  bucket_id = 'service-provider-documents'
  and (storage.foldername(name))[1] = public.svc_get_provider_id_by_user(auth.uid())::text
);

create policy if not exists "svc provider docs delete own folder"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'service-provider-documents'
  and (storage.foldername(name))[1] = public.svc_get_provider_id_by_user(auth.uid())::text
);

notify pgrst, 'reload schema';
```
