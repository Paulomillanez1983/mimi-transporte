-- MIMI Servicios / MIMI GO
-- Enterprise financial core: append-only double-entry ledger, wallets,
-- settlements, reconciliation, tax exports, QA ledger separation and audit.
--
-- Design goals:
-- - Incremental and backward compatible with existing payments/svc_payment_intents.
-- - Ledger is append-only; corrections use compensating transactions.
-- - Production/test/sandbox entries are separated by ledger + fiscal visibility.
-- - No frontend/client role can mutate financial truth.

create extension if not exists pgcrypto;

do $$
begin
  create type public.financial_environment as enum ('production','staging','development','sandbox','qa','internal_testing');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.financial_fiscal_visibility as enum (
    'fiscal_reportable',
    'internal_test_only',
    'sandbox_only',
    'qa_only',
    'excluded_from_accounting',
    'reversed',
    'voided'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.financial_entry_side as enum ('debit','credit');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.financial_actor_type as enum ('client','provider','platform','driver','psp','bank','tax_authority','admin','system');
exception when duplicate_object then null;
end $$;

create or replace function public.financial_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.financial_block_immutable_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'FINANCIAL_IMMUTABLE_RECORD: use compensating transactions/events instead';
end;
$$;

create table if not exists public.financial_ledgers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  ledger_type text not null default 'operational'
    check (ledger_type in ('operational','test','audit','sandbox','qa')),
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  fiscal_visibility public.financial_fiscal_visibility not null default 'fiscal_reportable',
  currency text not null default 'ARS',
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.financial_ledgers (code, name, description, ledger_type, environment, is_test, fiscal_visibility)
values
  ('operational_financial_ledger', 'Operational Financial Ledger', 'Real production financial source of truth.', 'operational', 'production', false, 'fiscal_reportable'),
  ('test_financial_ledger', 'Test Financial Ledger', 'Audited non-fiscal ledger for QA/sandbox/internal financial tests.', 'test', 'sandbox', true, 'sandbox_only'),
  ('audit_financial_ledger', 'Audit Financial Ledger', 'Technical audit stream for financial operations.', 'audit', 'production', false, 'excluded_from_accounting')
on conflict (code) do nothing;

create table if not exists public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.financial_ledgers(id),
  code text not null,
  name text not null,
  account_type text not null check (account_type in ('asset','liability','equity','revenue','expense','contra_asset','contra_revenue')),
  normal_side public.financial_entry_side not null,
  actor_type public.financial_actor_type,
  actor_user_id uuid references auth.users(id) on delete set null,
  provider_id uuid references public.svc_providers(id) on delete set null,
  driver_id uuid,
  parent_account_id uuid references public.financial_accounts(id),
  currency text not null default 'ARS',
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  fiscal_visibility public.financial_fiscal_visibility not null default 'fiscal_reportable',
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ledger_id, code)
);

create table if not exists public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.financial_ledgers(id),
  transaction_key text not null,
  transaction_type text not null,
  status text not null default 'posted' check (status in ('draft','posted','voided','reversed')),
  description text,
  currency text not null default 'ARS',
  gross_amount numeric(18,2) not null default 0,
  net_amount numeric(18,2) not null default 0,
  source text not null default 'system',
  payment_id uuid,
  payment_intent_id uuid references public.svc_payment_intents(id) on delete set null,
  service_request_id uuid references public.svc_requests(id) on delete set null,
  settlement_id uuid,
  payout_id uuid,
  refund_id uuid,
  reversal_of uuid references public.financial_transactions(id),
  trace_id text not null default gen_random_uuid()::text,
  correlation_id text not null default gen_random_uuid()::text,
  idempotency_key text not null,
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  test_run_id uuid,
  test_actor_id uuid,
  fiscal_visibility public.financial_fiscal_visibility not null default 'fiscal_reportable',
  metadata jsonb not null default '{}'::jsonb,
  posted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (ledger_id, transaction_key),
  unique (ledger_id, idempotency_key)
);

create table if not exists public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.financial_transactions(id) on delete restrict,
  ledger_id uuid not null references public.financial_ledgers(id),
  account_id uuid not null references public.financial_accounts(id),
  entry_side public.financial_entry_side not null,
  amount numeric(18,2) not null check (amount > 0),
  currency text not null default 'ARS',
  description text,
  service_request_id uuid references public.svc_requests(id) on delete set null,
  provider_id uuid references public.svc_providers(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  source text not null default 'system',
  trace_id text not null,
  correlation_id text not null,
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  test_run_id uuid,
  fiscal_visibility public.financial_fiscal_visibility not null default 'fiscal_reportable',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.financial_ledgers(id),
  actor_type public.financial_actor_type not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  provider_id uuid references public.svc_providers(id) on delete set null,
  driver_id uuid,
  currency text not null default 'ARS',
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ledger_id, actor_type, actor_user_id, provider_id, driver_id, currency)
);

create table if not exists public.wallet_balances (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  ledger_id uuid not null references public.financial_ledgers(id),
  available numeric(18,2) not null default 0,
  pending numeric(18,2) not null default 0,
  reserved numeric(18,2) not null default 0,
  disputed numeric(18,2) not null default 0,
  processing numeric(18,2) not null default 0,
  currency text not null default 'ARS',
  calculated_from_entry_id uuid references public.financial_entries(id),
  calculation_version bigint not null default 1,
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (wallet_id, currency)
);

create table if not exists public.wallet_reservations (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  reservation_key text not null,
  amount numeric(18,2) not null check (amount > 0),
  currency text not null default 'ARS',
  status text not null default 'active' check (status in ('active','released','captured','expired','cancelled')),
  service_request_id uuid references public.svc_requests(id) on delete set null,
  financial_transaction_id uuid references public.financial_transactions(id),
  expires_at timestamptz,
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wallet_id, reservation_key)
);

create table if not exists public.commission_versions (
  id uuid primary key default gen_random_uuid(),
  version_key text not null unique,
  description text,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.commission_rules
  add column if not exists version_id uuid references public.commission_versions(id),
  add column if not exists rule_type text default 'percentage',
  add column if not exists category_id text,
  add column if not exists zone_id text,
  add column if not exists campaign_id text,
  add column if not exists starts_at timestamptz default now(),
  add column if not exists ends_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

insert into public.commission_versions (version_key, description, active)
values ('default-2026-05', 'Default MIMI Servicios commission version migrated from existing commission_rules.', true)
on conflict (version_key) do nothing;

create table if not exists public.provider_earnings (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.financial_ledgers(id),
  provider_id uuid not null references public.svc_providers(id),
  service_request_id uuid references public.svc_requests(id) on delete set null,
  financial_transaction_id uuid references public.financial_transactions(id),
  gross_amount numeric(18,2) not null default 0,
  commission_amount numeric(18,2) not null default 0,
  psp_fee_amount numeric(18,2) not null default 0,
  tax_amount numeric(18,2) not null default 0,
  adjustment_amount numeric(18,2) not null default 0,
  net_amount numeric(18,2) not null default 0,
  currency text not null default 'ARS',
  status text not null default 'pending' check (status in ('pending','available','reserved','settled','paid','reversed','disputed')),
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  fiscal_visibility public.financial_fiscal_visibility not null default 'fiscal_reportable',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_revenue (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.financial_ledgers(id),
  service_request_id uuid references public.svc_requests(id) on delete set null,
  financial_transaction_id uuid references public.financial_transactions(id),
  revenue_type text not null default 'marketplace_commission',
  gross_amount numeric(18,2) not null default 0,
  tax_amount numeric(18,2) not null default 0,
  net_amount numeric(18,2) not null default 0,
  currency text not null default 'ARS',
  recognized_at timestamptz not null default now(),
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  fiscal_visibility public.financial_fiscal_visibility not null default 'fiscal_reportable',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_expenses (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.financial_ledgers(id),
  financial_transaction_id uuid references public.financial_transactions(id),
  expense_type text not null,
  amount numeric(18,2) not null check (amount >= 0),
  currency text not null default 'ARS',
  occurred_at timestamptz not null default now(),
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  fiscal_visibility public.financial_fiscal_visibility not null default 'fiscal_reportable',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.settlement_batches (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.financial_ledgers(id),
  batch_key text not null,
  settlement_type text not null check (settlement_type in ('daily','weekly','monthly','manual','test')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  status text not null default 'draft' check (status in ('draft','calculating','ready','approved','locked','paid','cancelled','failed')),
  provider_count integer not null default 0,
  gross_amount numeric(18,2) not null default 0,
  commission_amount numeric(18,2) not null default 0,
  psp_fee_amount numeric(18,2) not null default 0,
  tax_amount numeric(18,2) not null default 0,
  adjustment_amount numeric(18,2) not null default 0,
  net_amount numeric(18,2) not null default 0,
  currency text not null default 'ARS',
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  locked_at timestamptz,
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  fiscal_visibility public.financial_fiscal_visibility not null default 'fiscal_reportable',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ledger_id, batch_key)
);

create table if not exists public.provider_settlements (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.settlement_batches(id) on delete cascade,
  ledger_id uuid not null references public.financial_ledgers(id),
  provider_id uuid not null references public.svc_providers(id),
  status text not null default 'draft' check (status in ('draft','ready','approved','locked','payout_pending','paid','failed','reversed')),
  service_count integer not null default 0,
  gross_amount numeric(18,2) not null default 0,
  commission_amount numeric(18,2) not null default 0,
  psp_fee_amount numeric(18,2) not null default 0,
  refund_amount numeric(18,2) not null default 0,
  dispute_amount numeric(18,2) not null default 0,
  tax_amount numeric(18,2) not null default 0,
  adjustment_amount numeric(18,2) not null default 0,
  net_amount numeric(18,2) not null default 0,
  currency text not null default 'ARS',
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  fiscal_visibility public.financial_fiscal_visibility not null default 'fiscal_reportable',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, provider_id)
);

create table if not exists public.provider_liquidations (
  id uuid primary key default gen_random_uuid(),
  provider_settlement_id uuid not null references public.provider_settlements(id) on delete cascade,
  liquidation_key text not null unique,
  provider_id uuid not null references public.svc_providers(id),
  gross_amount numeric(18,2) not null default 0,
  deductions_amount numeric(18,2) not null default 0,
  net_amount numeric(18,2) not null default 0,
  currency text not null default 'ARS',
  status text not null default 'generated' check (status in ('generated','approved','sent','paid','cancelled','reversed')),
  export_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  provider_settlement_id uuid references public.provider_settlements(id) on delete set null,
  provider_id uuid references public.svc_providers(id) on delete set null,
  payout_key text not null unique,
  psp_provider text,
  bank_account_ref text,
  amount numeric(18,2) not null check (amount >= 0),
  currency text not null default 'ARS',
  status text not null default 'pending' check (status in ('pending','processing','sent','paid','failed','cancelled','reversed')),
  scheduled_for timestamptz,
  processed_at timestamptz,
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  fiscal_visibility public.financial_fiscal_visibility not null default 'fiscal_reportable',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payout_events (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid references public.payouts(id) on delete cascade,
  provider_event_id text,
  event_type text not null,
  status text,
  payload jsonb not null default '{}'::jsonb,
  trace_id text not null default gen_random_uuid()::text,
  correlation_id text not null default gen_random_uuid()::text,
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.refunds
  add column if not exists ledger_id uuid references public.financial_ledgers(id),
  add column if not exists refund_key text,
  add column if not exists financial_transaction_id uuid references public.financial_transactions(id),
  add column if not exists environment public.financial_environment not null default 'production',
  add column if not exists is_test boolean not null default false,
  add column if not exists test_run_id uuid,
  add column if not exists fiscal_visibility public.financial_fiscal_visibility not null default 'fiscal_reportable',
  add column if not exists trace_id text,
  add column if not exists correlation_id text;

create table if not exists public.refund_events (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid references public.refunds(id) on delete cascade,
  event_type text not null,
  status text,
  payload jsonb not null default '{}'::jsonb,
  trace_id text not null default gen_random_uuid()::text,
  correlation_id text not null default gen_random_uuid()::text,
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_processor_events (
  id uuid primary key default gen_random_uuid(),
  provider_name text not null,
  provider_event_id text,
  provider_payment_id text,
  normalized_event_type text not null,
  normalized_status text,
  payment_id uuid,
  payment_intent_id uuid references public.svc_payment_intents(id) on delete set null,
  amount numeric(18,2),
  currency text default 'ARS',
  payload jsonb not null default '{}'::jsonb,
  signature_valid boolean,
  processed boolean not null default false,
  processed_at timestamptz,
  trace_id text not null default gen_random_uuid()::text,
  correlation_id text not null default gen_random_uuid()::text,
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  fiscal_visibility public.financial_fiscal_visibility not null default 'fiscal_reportable',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chargeback_events (
  id uuid primary key default gen_random_uuid(),
  provider_name text,
  provider_chargeback_id text,
  payment_id uuid,
  payment_intent_id uuid references public.svc_payment_intents(id) on delete set null,
  amount numeric(18,2) not null default 0,
  currency text not null default 'ARS',
  status text not null default 'received',
  payload jsonb not null default '{}'::jsonb,
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.dispute_events (
  id uuid primary key default gen_random_uuid(),
  provider_name text,
  provider_dispute_id text,
  payment_id uuid,
  payment_intent_id uuid references public.svc_payment_intents(id) on delete set null,
  amount numeric(18,2) not null default 0,
  currency text not null default 'ARS',
  status text not null default 'open',
  payload jsonb not null default '{}'::jsonb,
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.reconciliation_reports (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.financial_ledgers(id),
  report_key text not null,
  report_type text not null check (report_type in ('psp','bank','payout','refund','dispute','monthly','manual')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  status text not null default 'draft' check (status in ('draft','running','matched','differences','failed','approved','locked')),
  total_internal numeric(18,2) not null default 0,
  total_external numeric(18,2) not null default 0,
  difference_amount numeric(18,2) not null default 0,
  differences_count integer not null default 0,
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  include_tests boolean not null default false,
  fiscal_visibility public.financial_fiscal_visibility not null default 'fiscal_reportable',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ledger_id, report_key)
);

create table if not exists public.payment_reconciliations (
  id uuid primary key default gen_random_uuid(),
  reconciliation_report_id uuid references public.reconciliation_reports(id) on delete cascade,
  payment_id uuid,
  payment_intent_id uuid references public.svc_payment_intents(id) on delete set null,
  provider_name text,
  provider_payment_id text,
  internal_amount numeric(18,2) not null default 0,
  external_amount numeric(18,2) not null default 0,
  difference_amount numeric(18,2) not null default 0,
  status text not null default 'unmatched' check (status in ('matched','unmatched','amount_mismatch','missing_internal','missing_external','duplicate','orphan')),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.financial_ledgers(id),
  period_key text not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'open' check (status in ('open','closing','closed','locked','reopened')),
  closed_by uuid references auth.users(id),
  closed_at timestamptz,
  locked_at timestamptz,
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ledger_id, period_key)
);

create table if not exists public.monthly_closures (
  id uuid primary key default gen_random_uuid(),
  accounting_period_id uuid not null references public.accounting_periods(id),
  closure_key text not null unique,
  status text not null default 'draft' check (status in ('draft','validating','ready','closed','locked','failed')),
  ledger_snapshot_id uuid,
  reconciliation_report_id uuid references public.reconciliation_reports(id),
  gross_amount numeric(18,2) not null default 0,
  revenue_amount numeric(18,2) not null default 0,
  expense_amount numeric(18,2) not null default 0,
  provider_liability_amount numeric(18,2) not null default 0,
  discrepancy_amount numeric(18,2) not null default 0,
  closed_by uuid references auth.users(id),
  closed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.financial_snapshots (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.financial_ledgers(id),
  snapshot_key text not null,
  snapshot_type text not null check (snapshot_type in ('wallet_balance','ledger_trial_balance','period_close','settlement','reconciliation','test_run')),
  as_of timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb,
  hash text,
  previous_hash text,
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  fiscal_visibility public.financial_fiscal_visibility not null default 'fiscal_reportable',
  created_at timestamptz not null default now(),
  unique (ledger_id, snapshot_key)
);

create table if not exists public.financial_exports (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.financial_ledgers(id),
  export_key text not null,
  export_type text not null,
  format text not null check (format in ('csv','xlsx','json','pdf')),
  period_start timestamptz,
  period_end timestamptz,
  status text not null default 'queued' check (status in ('queued','running','ready','failed','voided')),
  storage_bucket text,
  storage_path text,
  include_tests boolean not null default false,
  fiscal_visibility_filter public.financial_fiscal_visibility not null default 'fiscal_reportable',
  generated_by uuid references auth.users(id),
  generated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ledger_id, export_key)
);

create table if not exists public.tax_exports (
  id uuid primary key default gen_random_uuid(),
  financial_export_id uuid references public.financial_exports(id) on delete set null,
  ledger_id uuid not null references public.financial_ledgers(id),
  export_key text not null,
  tax_authority text not null default 'ARCA',
  tax_export_type text not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'queued',
  total_taxable numeric(18,2) not null default 0,
  total_tax numeric(18,2) not null default 0,
  storage_bucket text,
  storage_path text,
  metadata jsonb not null default '{}'::jsonb,
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  fiscal_visibility public.financial_fiscal_visibility not null default 'fiscal_reportable',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ledger_id, export_key)
);

create table if not exists public.tax_documents (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.financial_ledgers(id),
  document_key text not null,
  document_type text not null,
  actor_type public.financial_actor_type not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  provider_id uuid references public.svc_providers(id) on delete set null,
  service_request_id uuid references public.svc_requests(id) on delete set null,
  amount numeric(18,2) not null default 0,
  tax_amount numeric(18,2) not null default 0,
  currency text not null default 'ARS',
  issued_at timestamptz,
  status text not null default 'draft',
  storage_bucket text,
  storage_path text,
  metadata jsonb not null default '{}'::jsonb,
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  fiscal_visibility public.financial_fiscal_visibility not null default 'fiscal_reportable',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ledger_id, document_key)
);

create table if not exists public.invoice_registry (
  id uuid primary key default gen_random_uuid(),
  tax_document_id uuid references public.tax_documents(id) on delete set null,
  invoice_key text not null unique,
  invoice_number text,
  invoice_type text,
  issuer_actor_type public.financial_actor_type,
  receiver_actor_type public.financial_actor_type,
  service_request_id uuid references public.svc_requests(id) on delete set null,
  payment_id uuid,
  amount numeric(18,2) not null default 0,
  tax_amount numeric(18,2) not null default 0,
  currency text not null default 'ARS',
  status text not null default 'draft',
  issued_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  fiscal_visibility public.financial_fiscal_visibility not null default 'fiscal_reportable',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_financial_events (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid references public.financial_ledgers(id),
  event_key text not null,
  event_type text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_type text,
  ip_address inet,
  device_id text,
  user_agent text,
  source text not null default 'system',
  service_request_id uuid references public.svc_requests(id) on delete set null,
  payment_id uuid,
  settlement_id uuid,
  financial_transaction_id uuid references public.financial_transactions(id),
  before_snapshot jsonb,
  after_snapshot jsonb,
  trace_id text not null default gen_random_uuid()::text,
  correlation_id text not null default gen_random_uuid()::text,
  hash text,
  previous_hash text,
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  test_run_id uuid,
  fiscal_visibility public.financial_fiscal_visibility not null default 'excluded_from_accounting',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (event_key)
);

-- QA financial scenarios: all auditable, excluded from real accounting by default.
create table if not exists public.financial_test_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  scenario text not null,
  expected_result jsonb not null default '{}'::jsonb,
  actual_result jsonb not null default '{}'::jsonb,
  differences jsonb not null default '[]'::jsonb,
  status text not null default 'created' check (status in ('created','running','passed','failed','blocked')),
  initiated_by uuid references auth.users(id),
  environment public.financial_environment not null default 'qa',
  fiscal_visibility public.financial_fiscal_visibility not null default 'qa_only',
  evidence_export_id uuid references public.financial_exports(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create or replace function public.financial_assert_transaction_balanced(p_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  debit_total numeric(18,2);
  credit_total numeric(18,2);
begin
  select
    coalesce(sum(amount) filter (where entry_side = 'debit'), 0),
    coalesce(sum(amount) filter (where entry_side = 'credit'), 0)
  into debit_total, credit_total
  from public.financial_entries
  where transaction_id = p_transaction_id;

  if debit_total <= 0 or credit_total <= 0 or debit_total <> credit_total then
    raise exception 'FINANCIAL_UNBALANCED_TRANSACTION % debit=% credit=%', p_transaction_id, debit_total, credit_total;
  end if;
end;
$$;

create or replace function public.financial_post_transaction(
  p_ledger_code text,
  p_transaction_key text,
  p_transaction_type text,
  p_description text,
  p_currency text,
  p_idempotency_key text,
  p_entries jsonb,
  p_context jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ledger public.financial_ledgers%rowtype;
  v_tx_id uuid;
  v_entry jsonb;
  v_account_id uuid;
  v_amount numeric(18,2);
  v_side public.financial_entry_side;
  v_trace_id text := coalesce(p_context->>'trace_id', gen_random_uuid()::text);
  v_correlation_id text := coalesce(p_context->>'correlation_id', gen_random_uuid()::text);
begin
  select * into v_ledger
  from public.financial_ledgers
  where code = p_ledger_code
  for update;

  if not found then
    raise exception 'FINANCIAL_LEDGER_NOT_FOUND %', p_ledger_code;
  end if;

  select id into v_tx_id
  from public.financial_transactions
  where ledger_id = v_ledger.id
    and idempotency_key = p_idempotency_key;

  if v_tx_id is not null then
    return v_tx_id;
  end if;

  insert into public.financial_transactions (
    ledger_id, transaction_key, transaction_type, description, currency,
    gross_amount, net_amount, source, payment_id, payment_intent_id,
    service_request_id, trace_id, correlation_id, idempotency_key,
    environment, is_test, test_run_id, test_actor_id, fiscal_visibility, metadata
  )
  values (
    v_ledger.id, p_transaction_key, p_transaction_type, p_description, coalesce(p_currency, v_ledger.currency),
    coalesce((p_context->>'gross_amount')::numeric, 0), coalesce((p_context->>'net_amount')::numeric, 0),
    coalesce(p_context->>'source', 'financial_post_transaction'),
    nullif(p_context->>'payment_id','')::uuid,
    nullif(p_context->>'payment_intent_id','')::uuid,
    nullif(p_context->>'service_request_id','')::uuid,
    v_trace_id, v_correlation_id, p_idempotency_key,
    coalesce((p_context->>'environment')::public.financial_environment, v_ledger.environment),
    coalesce((p_context->>'is_test')::boolean, v_ledger.is_test),
    nullif(p_context->>'test_run_id','')::uuid,
    nullif(p_context->>'test_actor_id','')::uuid,
    coalesce((p_context->>'fiscal_visibility')::public.financial_fiscal_visibility, v_ledger.fiscal_visibility),
    p_context
  )
  returning id into v_tx_id;

  for v_entry in select * from jsonb_array_elements(p_entries)
  loop
    select id into v_account_id
    from public.financial_accounts
    where ledger_id = v_ledger.id
      and code = v_entry->>'account_code';

    if v_account_id is null then
      raise exception 'FINANCIAL_ACCOUNT_NOT_FOUND %', v_entry->>'account_code';
    end if;

    v_side := coalesce(v_entry->>'entry_side', v_entry->>'side')::public.financial_entry_side;
    v_amount := (v_entry->>'amount')::numeric;

    insert into public.financial_entries (
      transaction_id, ledger_id, account_id, entry_side, amount, currency,
      description, service_request_id, provider_id, actor_user_id, source,
      trace_id, correlation_id, environment, is_test, test_run_id, fiscal_visibility, metadata
    )
    values (
      v_tx_id, v_ledger.id, v_account_id, v_side, v_amount, coalesce(p_currency, v_ledger.currency),
      v_entry->>'description',
      nullif(coalesce(v_entry->>'service_request_id', p_context->>'service_request_id'),'')::uuid,
      nullif(coalesce(v_entry->>'provider_id', p_context->>'provider_id'),'')::uuid,
      nullif(coalesce(v_entry->>'actor_user_id', p_context->>'actor_user_id'),'')::uuid,
      coalesce(p_context->>'source', 'financial_post_transaction'),
      v_trace_id, v_correlation_id,
      coalesce((p_context->>'environment')::public.financial_environment, v_ledger.environment),
      coalesce((p_context->>'is_test')::boolean, v_ledger.is_test),
      nullif(p_context->>'test_run_id','')::uuid,
      coalesce((p_context->>'fiscal_visibility')::public.financial_fiscal_visibility, v_ledger.fiscal_visibility),
      v_entry
    );
  end loop;

  perform public.financial_assert_transaction_balanced(v_tx_id);

  insert into public.audit_financial_events (
    ledger_id, event_key, event_type, actor_user_id, actor_type, source,
    service_request_id, payment_id, financial_transaction_id, after_snapshot,
    trace_id, correlation_id, environment, is_test, test_run_id, fiscal_visibility, metadata
  )
  values (
    v_ledger.id,
    'financial.transaction.posted:' || v_tx_id::text,
    'financial.transaction.posted',
    nullif(p_context->>'actor_user_id','')::uuid,
    p_context->>'actor_type',
    coalesce(p_context->>'source', 'financial_post_transaction'),
    nullif(p_context->>'service_request_id','')::uuid,
    nullif(p_context->>'payment_id','')::uuid,
    v_tx_id,
    jsonb_build_object('transaction_id', v_tx_id, 'transaction_key', p_transaction_key, 'entries', p_entries),
    v_trace_id,
    v_correlation_id,
    coalesce((p_context->>'environment')::public.financial_environment, v_ledger.environment),
    coalesce((p_context->>'is_test')::boolean, v_ledger.is_test),
    nullif(p_context->>'test_run_id','')::uuid,
    'excluded_from_accounting',
    p_context
  );

  return v_tx_id;
end;
$$;

-- Bootstrap chart of accounts for operational and test ledgers.
insert into public.financial_accounts (ledger_id, code, name, account_type, normal_side, actor_type, currency, environment, is_test, fiscal_visibility)
select l.id, v.code, v.name, v.account_type, v.normal_side::public.financial_entry_side, v.actor_type::public.financial_actor_type,
       'ARS', l.environment, l.is_test, l.fiscal_visibility
from public.financial_ledgers l
cross join (values
  ('cash_psp_ars', 'PSP clearing cash ARS', 'asset', 'debit', 'psp'),
  ('client_receivable_ars', 'Client receivables ARS', 'asset', 'debit', 'client'),
  ('escrow_funds_ars', 'Funds held in escrow ARS', 'liability', 'credit', 'platform'),
  ('provider_payable_ars', 'Provider payable ARS', 'liability', 'credit', 'provider'),
  ('platform_revenue_ars', 'Platform commission revenue ARS', 'revenue', 'credit', 'platform'),
  ('psp_fees_ars', 'Payment processor fees ARS', 'expense', 'debit', 'psp'),
  ('refunds_payable_ars', 'Refunds payable ARS', 'liability', 'credit', 'client'),
  ('chargebacks_expense_ars', 'Chargebacks expense ARS', 'expense', 'debit', 'psp'),
  ('tax_payable_ars', 'Tax payable ARS', 'liability', 'credit', 'tax_authority'),
  ('manual_adjustments_ars', 'Manual compensating adjustments ARS', 'expense', 'debit', 'admin')
) as v(code, name, account_type, normal_side, actor_type)
where l.code in ('operational_financial_ledger','test_financial_ledger')
on conflict (ledger_id, code) do nothing;

create or replace view public.operational_financial_ledger
with (security_invoker = true) as
select
  t.id as transaction_id,
  t.transaction_key,
  t.transaction_type,
  t.status,
  t.description as transaction_description,
  e.id as entry_id,
  a.code as account_code,
  a.name as account_name,
  a.account_type,
  e.entry_side,
  e.amount,
  e.currency,
  e.service_request_id,
  e.provider_id,
  e.actor_user_id,
  t.trace_id,
  t.correlation_id,
  t.fiscal_visibility,
  t.created_at
from public.financial_transactions t
join public.financial_entries e on e.transaction_id = t.id
join public.financial_accounts a on a.id = e.account_id
join public.financial_ledgers l on l.id = t.ledger_id
where l.code = 'operational_financial_ledger'
  and t.is_test = false
  and t.fiscal_visibility = 'fiscal_reportable';

create or replace view public.test_financial_ledger
with (security_invoker = true) as
select
  t.id as transaction_id,
  t.transaction_key,
  t.transaction_type,
  t.status,
  e.id as entry_id,
  a.code as account_code,
  e.entry_side,
  e.amount,
  e.currency,
  t.test_run_id,
  t.environment,
  t.fiscal_visibility,
  t.created_at
from public.financial_transactions t
join public.financial_entries e on e.transaction_id = t.id
join public.financial_accounts a on a.id = e.account_id
join public.financial_ledgers l on l.id = t.ledger_id
where l.code = 'test_financial_ledger'
  or t.is_test = true
  or t.fiscal_visibility in ('internal_test_only','sandbox_only','qa_only','excluded_from_accounting');

-- Indexes
create index if not exists idx_financial_accounts_actor on public.financial_accounts(actor_user_id, provider_id, actor_type);
create index if not exists idx_financial_transactions_ledger_created on public.financial_transactions(ledger_id, created_at desc);
create index if not exists idx_financial_transactions_context on public.financial_transactions(service_request_id, payment_intent_id, payment_id);
create index if not exists idx_financial_transactions_trace on public.financial_transactions(trace_id, correlation_id);
create index if not exists idx_financial_transactions_fiscal on public.financial_transactions(environment, is_test, fiscal_visibility);
create index if not exists idx_financial_entries_account on public.financial_entries(account_id, created_at desc);
create index if not exists idx_financial_entries_provider on public.financial_entries(provider_id, created_at desc);
create index if not exists idx_wallets_actor on public.wallets(actor_type, actor_user_id, provider_id);
create index if not exists idx_provider_earnings_provider on public.provider_earnings(provider_id, created_at desc);
create index if not exists idx_platform_revenue_created on public.platform_revenue(created_at desc);
create index if not exists idx_settlement_batches_period on public.settlement_batches(period_start, period_end, status);
create index if not exists idx_provider_settlements_provider on public.provider_settlements(provider_id, status);
create index if not exists idx_payouts_provider on public.payouts(provider_id, status);
create unique index if not exists ux_refunds_refund_key on public.refunds(refund_key) where refund_key is not null;
create unique index if not exists ux_payout_events_provider_event on public.payout_events(provider_event_id) where provider_event_id is not null;
create unique index if not exists ux_payment_processor_events_provider_event on public.payment_processor_events(provider_name, provider_event_id) where provider_event_id is not null;
create index if not exists idx_audit_financial_trace on public.audit_financial_events(trace_id, correlation_id, created_at desc);

-- Updated-at triggers for mutable operational metadata tables.
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'financial_accounts','wallets','wallet_reservations','settlement_batches',
    'provider_settlements','provider_liquidations','payouts','reconciliation_reports',
    'accounting_periods','monthly_closures','payment_processor_events',
    'financial_exports','tax_exports','tax_documents','invoice_registry',
    'financial_test_runs'
  ]
  loop
    execute format('drop trigger if exists trg_financial_set_updated_at_%I on public.%I', tbl, tbl);
    execute format('create trigger trg_financial_set_updated_at_%I before update on public.%I for each row execute function public.financial_set_updated_at()', tbl, tbl);
  end loop;
end $$;

-- Immutable append-only records.
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'financial_ledgers','financial_transactions','financial_entries',
    'payout_events','refund_events','chargeback_events','dispute_events',
    'financial_snapshots','audit_financial_events','provider_earnings',
    'platform_revenue','platform_expenses'
  ]
  loop
    execute format('drop trigger if exists trg_block_update_%I on public.%I', tbl, tbl);
    execute format('drop trigger if exists trg_block_delete_%I on public.%I', tbl, tbl);
    execute format('create trigger trg_block_update_%I before update on public.%I for each row execute function public.financial_block_immutable_mutation()', tbl, tbl);
    execute format('create trigger trg_block_delete_%I before delete on public.%I for each row execute function public.financial_block_immutable_mutation()', tbl, tbl);
  end loop;
end $$;

-- RLS: default no client mutation. Service-role functions write financial truth.
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'financial_ledgers','financial_accounts','financial_transactions','financial_entries',
    'wallets','wallet_balances','wallet_reservations','settlement_batches',
    'provider_settlements','provider_liquidations','payouts','payout_events',
    'refund_events','reconciliation_reports','payment_reconciliations',
    'financial_exports','tax_exports','audit_financial_events','accounting_periods',
    'monthly_closures','commission_versions','provider_earnings','platform_revenue',
    'platform_expenses','tax_documents','invoice_registry','payment_processor_events',
    'chargeback_events','dispute_events','financial_snapshots','financial_test_runs'
  ]
  loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', tbl);
  end loop;
end $$;

-- Admin read policies.
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'financial_ledgers','financial_accounts','financial_transactions','financial_entries',
    'wallets','wallet_balances','wallet_reservations','settlement_batches',
    'provider_settlements','provider_liquidations','payouts','payout_events',
    'refund_events','reconciliation_reports','payment_reconciliations',
    'financial_exports','tax_exports','audit_financial_events','accounting_periods',
    'monthly_closures','commission_versions','provider_earnings','platform_revenue',
    'platform_expenses','tax_documents','invoice_registry','payment_processor_events',
    'chargeback_events','dispute_events','financial_snapshots','financial_test_runs'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'financial_admin_read', tbl);
    execute format('create policy financial_admin_read on public.%I for select to authenticated using (public.is_admin_user(auth.uid()))', tbl);
  end loop;
end $$;

-- Participant read for wallets, balances, earnings, tax docs and invoices.
drop policy if exists wallets_actor_read on public.wallets;
create policy wallets_actor_read on public.wallets
for select to authenticated
using (
  actor_user_id = auth.uid()
  or provider_id = public.mimi_current_service_provider_id()
  or public.is_admin_user(auth.uid())
);

drop policy if exists wallet_balances_actor_read on public.wallet_balances;
create policy wallet_balances_actor_read on public.wallet_balances
for select to authenticated
using (
  exists (
    select 1 from public.wallets w
    where w.id = wallet_balances.wallet_id
      and (w.actor_user_id = auth.uid() or w.provider_id = public.mimi_current_service_provider_id() or public.is_admin_user(auth.uid()))
  )
);

drop policy if exists provider_earnings_actor_read on public.provider_earnings;
create policy provider_earnings_actor_read on public.provider_earnings
for select to authenticated
using (provider_id = public.mimi_current_service_provider_id() or public.is_admin_user(auth.uid()));

drop policy if exists provider_settlements_actor_read on public.provider_settlements;
create policy provider_settlements_actor_read on public.provider_settlements
for select to authenticated
using (provider_id = public.mimi_current_service_provider_id() or public.is_admin_user(auth.uid()));

drop policy if exists provider_liquidations_actor_read on public.provider_liquidations;
create policy provider_liquidations_actor_read on public.provider_liquidations
for select to authenticated
using (
  exists (
    select 1 from public.provider_settlements ps
    where ps.id = provider_liquidations.provider_settlement_id
      and (ps.provider_id = public.mimi_current_service_provider_id() or public.is_admin_user(auth.uid()))
  )
);

drop policy if exists payouts_actor_read on public.payouts;
create policy payouts_actor_read on public.payouts
for select to authenticated
using (provider_id = public.mimi_current_service_provider_id() or public.is_admin_user(auth.uid()));

drop policy if exists tax_documents_actor_read on public.tax_documents;
create policy tax_documents_actor_read on public.tax_documents
for select to authenticated
using (
  actor_user_id = auth.uid()
  or provider_id = public.mimi_current_service_provider_id()
  or public.is_admin_user(auth.uid())
);

drop policy if exists invoice_registry_actor_read on public.invoice_registry;
create policy invoice_registry_actor_read on public.invoice_registry
for select to authenticated
using (public.is_admin_user(auth.uid()));

grant usage on schema public to anon, authenticated, service_role;
grant select on public.operational_financial_ledger to authenticated;
grant select on public.test_financial_ledger to authenticated;
revoke all on function public.financial_post_transaction(text,text,text,text,text,text,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.financial_assert_transaction_balanced(uuid) from public, anon, authenticated;
grant execute on function public.financial_post_transaction(text,text,text,text,text,text,jsonb,jsonb) to service_role;
grant execute on function public.financial_assert_transaction_balanced(uuid) to service_role;
