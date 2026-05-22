-- MIMI Servicios - Phase D provider service addons foundation.
--
-- Scope:
-- - Adds disabled feature flags for provider addons/packages.
-- - Hardens svc_provider_offering_addons so providers cannot write direct.
-- - Extends the provider service audit change_type constraint for future
--   audited addon mutations through svc-save-provider-service.
--
-- This migration intentionally does not touch Transporte, payments, Mercado Pago,
-- payment-webhook, _shared/payments, requests, client search, or Edge deployment.

begin;

insert into public.svc_feature_flags (key, enabled, scope, description, metadata_json)
values
  (
    'MIMI_PROVIDER_SERVICE_ADDONS_ENABLED',
    false,
    'provider',
    'Enable provider service addons configuration beta.',
    '{"default":"off","phase":"provider_services_enterprise_ui_d1"}'::jsonb
  ),
  (
    'MIMI_PROVIDER_SERVICE_PACKAGES_ENABLED',
    false,
    'provider',
    'Enable provider service packages beta.',
    '{"default":"off","phase":"future"}'::jsonb
  )
on conflict (key) do nothing;

alter table public.svc_provider_offering_addons enable row level security;

-- The frontend may read provider-owned addons for display, but all mutations
-- must go through an audited Edge Function using service_role.
revoke insert, update, delete, truncate, references, trigger
  on table public.svc_provider_offering_addons
  from anon;

revoke insert, update, delete, truncate, references, trigger
  on table public.svc_provider_offering_addons
  from authenticated;

grant select on table public.svc_provider_offering_addons to authenticated;
grant all privileges on table public.svc_provider_offering_addons to service_role;

drop policy if exists svc_provider_addons_provider_insert on public.svc_provider_offering_addons;
drop policy if exists svc_provider_addons_provider_update on public.svc_provider_offering_addons;
drop policy if exists svc_provider_addons_provider_delete on public.svc_provider_offering_addons;

drop policy if exists svc_provider_addons_provider_select on public.svc_provider_offering_addons;
create policy svc_provider_addons_provider_select
on public.svc_provider_offering_addons
for select
to authenticated
using (
  provider_id = public.svc_get_provider_id_by_user(auth.uid())
  or public.is_admin_user(auth.uid())
);

alter table public.svc_provider_service_change_events
  drop constraint if exists svc_provider_service_change_events_change_type_check;

alter table public.svc_provider_service_change_events
  add constraint svc_provider_service_change_events_change_type_check
  check (
    change_type = any (
      array[
        'created'::text,
        'updated'::text,
        'activated'::text,
        'deactivated'::text,
        'price_changed'::text,
        'deleted_soft'::text,
        'reactivated'::text,
        'addon_created'::text,
        'addon_updated'::text,
        'addon_deactivated'::text
      ]
    )
  );

comment on table public.svc_provider_offering_addons is
  'Provider configured service addons. Readable by owning provider/admin; writes must be audited through svc-save-provider-service.';

commit;

-- Manual rollback proposal. Do not execute unless explicitly approved.
--
-- begin;
-- delete from public.svc_feature_flags
-- where key in (
--   'MIMI_PROVIDER_SERVICE_ADDONS_ENABLED',
--   'MIMI_PROVIDER_SERVICE_PACKAGES_ENABLED'
-- );
--
-- alter table public.svc_provider_service_change_events
--   drop constraint if exists svc_provider_service_change_events_change_type_check;
--
-- alter table public.svc_provider_service_change_events
--   add constraint svc_provider_service_change_events_change_type_check
--   check (
--     change_type = any (
--       array[
--         'created'::text,
--         'updated'::text,
--         'activated'::text,
--         'deactivated'::text,
--         'price_changed'::text,
--         'deleted_soft'::text,
--         'reactivated'::text
--       ]
--     )
--   );
-- commit;
