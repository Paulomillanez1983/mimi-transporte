-- Hardening: provider publication tables must be written through
-- svc-save-provider-service so every title/price/publication change is audited.
--
-- Scope:
-- - svc_provider_service_offerings
-- - svc_provider_pricing
-- - svc_provider_categories
--
-- This migration intentionally does not touch profiles, availability,
-- requests, payments, Mercado Pago, Transporte, or Edge Functions.

begin;

alter table public.svc_provider_service_offerings enable row level security;
alter table public.svc_provider_pricing enable row level security;
alter table public.svc_provider_categories enable row level security;

-- Browser clients may keep reading the data they already need, but direct
-- writes from authenticated/anon must stop. The audited Edge Function writes
-- with service_role and keeps ownership validation in application code.
revoke insert, update, delete on table public.svc_provider_service_offerings from authenticated;
revoke insert, update, delete on table public.svc_provider_pricing from authenticated;
revoke insert, update, delete on table public.svc_provider_categories from authenticated;

revoke insert, update, delete on table public.svc_provider_service_offerings from anon;
revoke insert, update, delete on table public.svc_provider_pricing from anon;
revoke insert, update, delete on table public.svc_provider_categories from anon;

grant select on table public.svc_provider_service_offerings to authenticated;
grant select on table public.svc_provider_pricing to authenticated;
grant select on table public.svc_provider_categories to authenticated;

grant select on table public.svc_provider_service_offerings to anon;

grant all privileges on table public.svc_provider_service_offerings to service_role;
grant all privileges on table public.svc_provider_pricing to service_role;
grant all privileges on table public.svc_provider_categories to service_role;

-- Remove legacy direct write policies. Grants already block writes, but
-- policies are also removed so future grants cannot silently reopen the path.
drop policy if exists svc_provider_categories_self_rw on public.svc_provider_categories;
drop policy if exists svc_provider_pricing_self_rw on public.svc_provider_pricing;
drop policy if exists svc_provider_service_offerings_provider_insert on public.svc_provider_service_offerings;
drop policy if exists svc_provider_service_offerings_provider_update on public.svc_provider_service_offerings;
drop policy if exists svc_provider_service_offerings_provider_delete on public.svc_provider_service_offerings;

drop policy if exists svc_provider_categories_provider_select_own on public.svc_provider_categories;
create policy svc_provider_categories_provider_select_own
on public.svc_provider_categories
for select
to authenticated
using (
  provider_id = svc_get_provider_id_by_user(auth.uid())
  or is_admin_user(auth.uid())
);

drop policy if exists svc_provider_pricing_provider_select_own on public.svc_provider_pricing;
create policy svc_provider_pricing_provider_select_own
on public.svc_provider_pricing
for select
to authenticated
using (
  provider_id = svc_get_provider_id_by_user(auth.uid())
  or is_admin_user(auth.uid())
);

drop policy if exists svc_provider_service_offerings_provider_select_own on public.svc_provider_service_offerings;
create policy svc_provider_service_offerings_provider_select_own
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

drop policy if exists svc_provider_service_offerings_read_active on public.svc_provider_service_offerings;
create policy svc_provider_service_offerings_read_active
on public.svc_provider_service_offerings
for select
to anon, authenticated
using (
  active = true
  and exists (
    select 1
    from public.svc_providers p
    where p.id = svc_provider_service_offerings.provider_id
      and p.approved = true
      and p.blocked = false
  )
);

commit;

-- Manual rollback proposal. Do not execute unless a legitimate production
-- flow breaks and the release manager explicitly approves rollback.
--
-- begin;
-- grant insert, update on table public.svc_provider_service_offerings to authenticated;
-- grant insert, update on table public.svc_provider_pricing to authenticated;
-- grant insert, update on table public.svc_provider_categories to authenticated;
--
-- drop policy if exists svc_provider_categories_provider_select_own on public.svc_provider_categories;
-- drop policy if exists svc_provider_pricing_provider_select_own on public.svc_provider_pricing;
--
-- create policy svc_provider_categories_self_rw
-- on public.svc_provider_categories
-- for all
-- to authenticated
-- using (
--   provider_id = svc_get_provider_id_by_user(auth.uid())
--   or is_admin_user(auth.uid())
-- )
-- with check (
--   provider_id = svc_get_provider_id_by_user(auth.uid())
--   or is_admin_user(auth.uid())
-- );
--
-- create policy svc_provider_pricing_self_rw
-- on public.svc_provider_pricing
-- for all
-- to authenticated
-- using (
--   provider_id = svc_get_provider_id_by_user(auth.uid())
--   or is_admin_user(auth.uid())
-- )
-- with check (
--   provider_id = svc_get_provider_id_by_user(auth.uid())
--   or is_admin_user(auth.uid())
-- );
--
-- create policy svc_provider_service_offerings_provider_insert
-- on public.svc_provider_service_offerings
-- for insert
-- to authenticated
-- with check (
--   exists (
--     select 1
--     from public.svc_providers p
--     where p.id = svc_provider_service_offerings.provider_id
--       and p.user_id = auth.uid()
--       and p.blocked = false
--   )
-- );
--
-- create policy svc_provider_service_offerings_provider_update
-- on public.svc_provider_service_offerings
-- for update
-- to authenticated
-- using (
--   exists (
--     select 1
--     from public.svc_providers p
--     where p.id = svc_provider_service_offerings.provider_id
--       and p.user_id = auth.uid()
--       and p.blocked = false
--   )
-- )
-- with check (
--   exists (
--     select 1
--     from public.svc_providers p
--     where p.id = svc_provider_service_offerings.provider_id
--       and p.user_id = auth.uid()
--       and p.blocked = false
--   )
-- );
-- commit;
