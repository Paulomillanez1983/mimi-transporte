-- 20260919000200_request_photos_storage.sql
-- Fotos del problema del cliente: bucket privado, con vencimiento y sin costo acumulado.
--
-- POR QUÉ ASÍ
--   El costo de storage no está en la subida, está en la RETENCIÓN. Entonces:
--     · Bucket privado (como los otros 4 que ya existen): nada público, nada listable,
--       sin egreso de CDN. Se sirve por URL firmada y con vencimiento.
--     · file_size_limit de 512 KB: es un tope DURO en el servidor, no una sugerencia.
--       Obliga a comprimir en el teléfono antes de subir. Una foto de 4 MB no entra.
--     · TTL: cada foto nace con expires_at. La retención es una ventana móvil, no un
--       acumulado, así que el storage crece con el volumen reciente y no con la antigüedad.
--
-- ADITIVO: bucket y tabla nuevos. Nada los usa todavía.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. El bucket
-- ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'service-request-photos',
  'service-request-photos',
  false,
  524288,                                   -- 512 KB: obliga a comprimir en el teléfono
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. El registro de cada foto
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.svc_request_photos (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  storage_path text not null unique,
  byte_size integer not null default 0,
  width integer,
  height integer,
  -- Miniaturas chicas que se conservan si hubo disputa, como evidencia.
  thumb_path text,
  -- Huella para no guardar dos veces la misma foto si el cliente reintenta.
  content_hash text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  deleted_at timestamptz
);

create index if not exists ix_request_photos_request on public.svc_request_photos (request_id);
create index if not exists ix_request_photos_expira on public.svc_request_photos (expires_at)
  where deleted_at is null;
create unique index if not exists ux_request_photos_hash
  on public.svc_request_photos (request_id, content_hash)
  where content_hash is not null;

alter table public.svc_request_photos enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Políticas del bucket: el dueño sube, los destinatarios leen
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "fotos pedido: el dueno sube" on storage.objects;
create policy "fotos pedido: el dueno sube"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'service-request-photos'
    -- La primera carpeta del path tiene que ser el id del usuario: no puede escribir
    -- en la carpeta de otro ni pisar archivos ajenos.
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "fotos pedido: el dueno administra" on storage.objects;
create policy "fotos pedido: el dueno administra"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'service-request-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "fotos pedido: destinatarios leen" on storage.objects;
create policy "fotos pedido: destinatarios leen"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'service-request-photos'
    and (
      -- El dueño
      (storage.foldername(name))[1] = auth.uid()::text
      -- O un prestador que RECIBIO el pedido. Se apoya en svc_quote_requests: cada
      -- difusion crea una fila por prestador, asi que "destinatario" ya esta modelado.
      or exists (
        select 1
        from public.svc_quote_requests qr
        join public.svc_providers p on p.id = qr.provider_id
        where qr.request_id::text = (storage.foldername(name))[2]
          and p.user_id = auth.uid()
      )
    )
  );

alter table public.svc_request_photos enable row level security;

drop policy if exists "svc_request_photos: dueno y destinatarios" on public.svc_request_photos;
create policy "svc_request_photos: dueno y destinatarios"
  on public.svc_request_photos for select to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1
      from public.svc_quote_requests qr
      join public.svc_providers p on p.id = qr.provider_id
      where qr.request_id = svc_request_photos.request_id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists "svc_request_photos: el dueno inserta" on public.svc_request_photos;
create policy "svc_request_photos: el dueno inserta"
  on public.svc_request_photos for insert to authenticated
  with check (created_by = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Borrado de lo vencido
-- ─────────────────────────────────────────────────────────────────────────────
-- La funcion borra el archivo y recien despues marca la fila. Si se marcara primero y
-- fallara el borrado del objeto, quedaria storage basura sin registro.
create or replace function public.svc_expire_request_photos(p_limit integer default 200)
returns jsonb
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $function$
declare
  v_foto record;
  v_borradas integer := 0;
begin
  for v_foto in
    select id, storage_path, thumb_path
    from public.svc_request_photos
    where deleted_at is null
      and expires_at < now()
    order by expires_at
    limit greatest(1, least(p_limit, 1000))
  loop
    delete from storage.objects
    where bucket_id = 'service-request-photos'
      and name in (v_foto.storage_path, coalesce(v_foto.thumb_path, ''));

    update public.svc_request_photos
    set deleted_at = now()
    where id = v_foto.id;

    v_borradas := v_borradas + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'borradas', v_borradas,
    'quedan_vencidas', (
      select count(*) from public.svc_request_photos
      where deleted_at is null and expires_at < now()
    )
  );
end;
$function$;

comment on function public.svc_expire_request_photos(integer) is
  'Borra del storage las fotos de pedidos vencidos. Llamar por cron (pg_cron o un worker), no en cada request.';

revoke all on function public.svc_expire_request_photos(integer) from public, anon, authenticated;
grant execute on function public.svc_expire_request_photos(integer) to service_role;

commit;

-- Verificación después de aplicar:
--   select id, public, file_size_limit, allowed_mime_types from storage.buckets
--   where id = 'service-request-photos';
--   select public.svc_expire_request_photos(10);
