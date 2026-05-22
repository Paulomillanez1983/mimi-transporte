-- MIMI Servicios - append-only audit trail for published provider services.
-- Scope: MIMI Servicios only. No Transporte tables are touched.

begin;

create table if not exists public.svc_provider_service_change_events (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.svc_providers(id) on delete cascade,
  offering_id uuid references public.svc_provider_service_offerings(id) on delete set null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  change_type text not null check (
    change_type in (
      'created',
      'updated',
      'activated',
      'deactivated',
      'price_changed',
      'deleted_soft'
    )
  ),
  previous_snapshot jsonb not null default '{}'::jsonb,
  new_snapshot jsonb not null default '{}'::jsonb,
  diff jsonb not null default '{}'::jsonb,
  source text not null default 'svc-save-provider-service',
  correlation_id text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.svc_provider_service_change_events enable row level security;

revoke all privileges on table public.svc_provider_service_change_events from anon, authenticated;
grant select on table public.svc_provider_service_change_events to authenticated;

create index if not exists idx_svc_provider_service_change_events_provider_created
  on public.svc_provider_service_change_events (provider_id, created_at desc);

create index if not exists idx_svc_provider_service_change_events_offering_created
  on public.svc_provider_service_change_events (offering_id, created_at desc);

create index if not exists idx_svc_provider_service_change_events_correlation
  on public.svc_provider_service_change_events (correlation_id);

drop policy if exists svc_provider_service_change_events_owner_select
  on public.svc_provider_service_change_events;

create policy svc_provider_service_change_events_owner_select
on public.svc_provider_service_change_events
for select
to authenticated
using (
  exists (
    select 1
    from public.svc_providers p
    where p.id = svc_provider_service_change_events.provider_id
      and p.user_id = (select auth.uid())
  )
  or public.is_admin_user((select auth.uid()))
);

create or replace function public.prevent_svc_provider_service_change_events_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'svc_provider_service_change_events is append-only';
end;
$$;

drop trigger if exists trg_prevent_svc_provider_service_change_events_mutation
  on public.svc_provider_service_change_events;

create trigger trg_prevent_svc_provider_service_change_events_mutation
before update or delete on public.svc_provider_service_change_events
for each row execute function public.prevent_svc_provider_service_change_events_mutation();

commit;
