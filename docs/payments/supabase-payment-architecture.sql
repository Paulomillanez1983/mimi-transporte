-- MIMI payment-agnostic marketplace architecture.
-- Run in Supabase SQL editor after reviewing names against production.

create extension if not exists pgcrypto;

create or replace function public.is_admin_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users au
    where au.user_id = p_user_id
      and au.active = true
  );
$$;

create or replace function public.mimi_current_service_provider_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select sp.id
  from public.svc_providers sp
  where sp.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.mimi_current_driver_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id_uuid
  from public.choferes c
  where c.user_id = auth.uid()
  limit 1;
$$;

create table if not exists public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  service_type text not null default 'DEFAULT',
  percentage numeric(7,4) not null default 10 check (percentage >= 0 and percentage <= 100),
  minimum_fee numeric(12,2) not null default 0 check (minimum_fee >= 0),
  fixed_fee numeric(12,2) not null default 0 check (fixed_fee >= 0),
  rounding text not null default 'ceil' check (rounding in ('ceil','floor','round')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists commission_rules_one_default_active
on public.commission_rules (service_type)
where active;

insert into public.commission_rules (service_type, percentage, minimum_fee, fixed_fee, rounding, active)
values ('DEFAULT', 10, 0, 0, 'ceil', true)
on conflict do nothing;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  context_type text not null check (context_type in ('SERVICE_REQUEST','TRANSPORT_TRIP','TRANSPORT_QUOTE')),
  context_id uuid not null,
  service_request_id uuid null references public.svc_requests(id) on delete set null,
  trip_id uuid null references public.viajes(id) on delete set null,
  customer_id uuid not null references auth.users(id) on delete restrict,
  provider_id uuid null,
  total_amount numeric(12,2) not null check (total_amount >= 0),
  platform_fee numeric(12,2) not null check (platform_fee >= 0),
  provider_amount numeric(12,2) not null check (provider_amount >= 0),
  currency text not null default 'ARS',
  status text not null default 'PENDING' check (
    status in ('PENDING','CHECKOUT_CREATED','APPROVED','CAPTURED','REJECTED','CANCELLED','REFUNDED','PARTIALLY_REFUNDED','SETTLED')
  ),
  provider_name text not null default 'mock',
  provider_payment_id text null,
  checkout_url text null,
  raw_response jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  approved_at timestamptz null,
  captured_at timestamptz null,
  cancelled_at timestamptz null,
  refunded_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_amounts_match check (round((platform_fee + provider_amount)::numeric, 2) <= round(total_amount::numeric, 2))
);

create unique index if not exists payments_one_active_per_context
on public.payments (context_type, context_id)
where status in ('PENDING','CHECKOUT_CREATED','APPROVED','CAPTURED');

create index if not exists payments_customer_id_idx on public.payments(customer_id);
create index if not exists payments_provider_id_idx on public.payments(provider_id);
create index if not exists payments_service_request_id_idx on public.payments(service_request_id);
create index if not exists payments_trip_id_idx on public.payments(trip_id);
create index if not exists payments_provider_payment_id_idx on public.payments(provider_name, provider_payment_id);

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  provider_event_id text null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists payment_events_provider_event_id_idx
on public.payment_events(provider_event_id)
where provider_event_id is not null;

create index if not exists payment_events_payment_id_idx on public.payment_events(payment_id);

create table if not exists public.settlements (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.payments(id) on delete cascade,
  provider_id uuid null,
  gross_amount numeric(12,2) not null check (gross_amount >= 0),
  platform_fee numeric(12,2) not null check (platform_fee >= 0),
  net_amount numeric(12,2) not null check (net_amount >= 0),
  currency text not null default 'ARS',
  status text not null default 'PENDING' check (status in ('PENDING','READY','SETTLED','FAILED','CANCELLED')),
  settled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists settlements_provider_id_idx on public.settlements(provider_id);

create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  reason text null,
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED','REFUNDED','FAILED','REFUND_PENDING')),
  provider_refund_id text null,
  raw_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists refunds_payment_id_idx on public.refunds(payment_id);

create table if not exists public.cancellation_rules (
  id uuid primary key default gen_random_uuid(),
  context_type text not null check (context_type in ('SERVICE_REQUEST','TRANSPORT_TRIP','TRANSPORT_QUOTE','DEFAULT')),
  status text not null default 'DEFAULT',
  cancelled_by text not null default 'client',
  fee_percentage numeric(7,4) not null default 0,
  fixed_fee numeric(12,2) not null default 0,
  platform_share_percentage numeric(7,4) not null default 0,
  provider_share_percentage numeric(7,4) not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.commission_rules enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.settlements enable row level security;
alter table public.refunds enable row level security;
alter table public.cancellation_rules enable row level security;

drop policy if exists commission_rules_read on public.commission_rules;
create policy commission_rules_read
on public.commission_rules for select
to authenticated
using (active = true or public.is_admin_user(auth.uid()));

drop policy if exists payments_customer_provider_admin_read on public.payments;
create policy payments_customer_provider_admin_read
on public.payments for select
to authenticated
using (
  customer_id = auth.uid()
  or provider_id = public.mimi_current_service_provider_id()
  or provider_id = public.mimi_current_driver_id()
  or public.is_admin_user(auth.uid())
);

drop policy if exists payment_events_participant_read on public.payment_events;
create policy payment_events_participant_read
on public.payment_events for select
to authenticated
using (
  exists (
    select 1
    from public.payments p
    where p.id = payment_events.payment_id
      and (
        p.customer_id = auth.uid()
        or p.provider_id = public.mimi_current_service_provider_id()
        or p.provider_id = public.mimi_current_driver_id()
        or public.is_admin_user(auth.uid())
      )
  )
);

drop policy if exists settlements_provider_admin_read on public.settlements;
create policy settlements_provider_admin_read
on public.settlements for select
to authenticated
using (
  provider_id = public.mimi_current_service_provider_id()
  or provider_id = public.mimi_current_driver_id()
  or public.is_admin_user(auth.uid())
);

drop policy if exists refunds_participant_read on public.refunds;
create policy refunds_participant_read
on public.refunds for select
to authenticated
using (
  exists (
    select 1
    from public.payments p
    where p.id = refunds.payment_id
      and (
        p.customer_id = auth.uid()
        or p.provider_id = public.mimi_current_service_provider_id()
        or p.provider_id = public.mimi_current_driver_id()
        or public.is_admin_user(auth.uid())
      )
  )
);

drop policy if exists cancellation_rules_read on public.cancellation_rules;
create policy cancellation_rules_read
on public.cancellation_rules for select
to authenticated
using (active = true or public.is_admin_user(auth.uid()));

-- No INSERT/UPDATE/DELETE policies for authenticated users on payments/refunds/settlements/events:
-- mutations must go through Edge Functions with service role, JWT validation and idempotency.
