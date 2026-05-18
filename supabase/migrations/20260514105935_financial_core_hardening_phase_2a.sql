-- MIMIGO financial core hardening phase 2A.
-- Additive operation locks for PSP-safe idempotency, replay protection and audit.

create extension if not exists pgcrypto;

create table if not exists public.financial_operation_locks (
  id uuid primary key default gen_random_uuid(),
  operation_type text not null
    check (operation_type in ('payment_create','payment_cancel','payment_refund','payment_webhook','manual_payment','cash_collection')),
  operation_key text not null,
  status text not null default 'processing'
    check (status in ('reserved','processing','succeeded','failed','retryable_failed','dead_letter')),
  provider_name text not null default 'mock',
  provider_payment_id text,
  provider_event_id text,
  payment_id uuid references public.payments(id) on delete set null,
  refund_id uuid references public.refunds(id) on delete set null,
  idempotency_key text not null,
  request_hash text,
  response_json jsonb,
  raw_event jsonb,
  error_code text,
  error_message text,
  trace_id text not null default gen_random_uuid()::text,
  correlation_id text not null default gen_random_uuid()::text,
  locked_by uuid references auth.users(id) on delete set null,
  locked_until timestamptz,
  processed_at timestamptz,
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  fiscal_visibility public.financial_fiscal_visibility not null default 'fiscal_reportable',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (operation_type, operation_key)
);

create index if not exists idx_financial_operation_locks_payment
  on public.financial_operation_locks(payment_id, operation_type, created_at desc);

create index if not exists idx_financial_operation_locks_provider_event
  on public.financial_operation_locks(provider_name, provider_event_id)
  where provider_event_id is not null;

create index if not exists idx_financial_operation_locks_trace
  on public.financial_operation_locks(trace_id, correlation_id, created_at desc);

alter table public.financial_operation_locks enable row level security;
revoke insert, update, delete, truncate on public.financial_operation_locks from anon, authenticated;
grant select on public.financial_operation_locks to authenticated;
grant select, insert, update on public.financial_operation_locks to service_role;

drop policy if exists financial_operation_locks_finance_read on public.financial_operation_locks;
create policy financial_operation_locks_finance_read on public.financial_operation_locks
for select to authenticated
using (public.is_financial_auditor(auth.uid()) or public.is_admin_user(auth.uid()));

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_financial_operation_locks_updated_at'
      and tgrelid = 'public.financial_operation_locks'::regclass
  ) then
    create trigger trg_financial_operation_locks_updated_at
    before update on public.financial_operation_locks
    for each row execute function public.financial_set_updated_at();
  end if;
end $$;

alter table public.refunds
  add column if not exists financial_operation_lock_id uuid references public.financial_operation_locks(id) on delete set null;

alter table public.payment_processor_events
  add column if not exists financial_operation_lock_id uuid references public.financial_operation_locks(id) on delete set null;

alter table public.payments
  add column if not exists payment_method text,
  add column if not exists payment_method_status text,
  add column if not exists external_idempotency_key text,
  add column if not exists cash_collection_status text,
  add column if not exists cash_debt_limit_snapshot numeric(18,2);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payments_payment_method_safe_chk'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments
      add constraint payments_payment_method_safe_chk
      check (
        payment_method is null
        or payment_method in ('mock','card','wallet','bank_transfer','manual','cash')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'payments_cash_collection_status_safe_chk'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments
      add constraint payments_cash_collection_status_safe_chk
      check (
        cash_collection_status is null
        or cash_collection_status in ('not_applicable','pending_collection','collected','settled','over_limit','disabled')
      );
  end if;
end $$;

create unique index if not exists ux_payments_external_idempotency_key
  on public.payments(external_idempotency_key)
  where external_idempotency_key is not null;

insert into public.audit_financial_events (
  event_key, event_type, actor_type, source, after_snapshot,
  trace_id, correlation_id, environment, is_test, fiscal_visibility, metadata
)
values (
  'migration:financial_core_hardening_phase_2a',
  'financial.hardening.phase_2a_applied',
  'system',
  'migration',
  jsonb_build_object(
    'operation_locks', true,
    'psp_idempotency_prepared', true,
    'cash_manual_future_fields_prepared', true
  ),
  gen_random_uuid()::text,
  'migration:20260514105935',
  'production',
  false,
  'excluded_from_accounting',
  jsonb_build_object('migration', '20260514105935_financial_core_hardening_phase_2a')
)
on conflict (event_key) do nothing;
