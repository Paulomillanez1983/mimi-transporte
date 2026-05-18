-- Provider payout account foundation for MIMIGO Servicios.
-- Additive only. Prepares CBU/CVU/alias collection and review without
-- enabling real payouts, moving funds or touching financial ledger history.

create extension if not exists pgcrypto;

create table if not exists public.provider_payout_accounts (
  id uuid primary key default gen_random_uuid(),
  provider_user_id uuid not null references auth.users(id) on delete cascade,
  provider_id uuid references public.svc_providers(id) on delete set null,
  account_type text not null check (account_type in ('cbu','cvu','alias','bank_account')),
  cbu_masked text,
  cvu_masked text,
  alias_masked text,
  account_last4 text,
  account_hash text not null,
  encrypted_payload jsonb not null default '{}'::jsonb,
  encrypted_payload_required boolean not null default true,
  encrypted_payload_status text not null default 'required_missing_secret'
    check (encrypted_payload_status in ('server_encrypted','required_missing_secret')),
  encryption_key_id text,
  bank_name text,
  holder_name text,
  holder_tax_id_masked text,
  status text not null default 'pending_review'
    check (status in ('draft','pending_review','verified','rejected','disabled')),
  is_active boolean not null default false,
  verification_status text not null default 'pending_review'
    check (verification_status in ('draft','pending_review','verified','rejected','disabled')),
  risk_status text not null default 'pending'
    check (risk_status in ('pending','low','medium','high','critical','manual_review')),
  changed_at timestamptz,
  change_reason text,
  submitted_at timestamptz,
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  test_run_id uuid,
  fiscal_visibility public.financial_fiscal_visibility not null default 'excluded_from_accounting',
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.provider_payout_account_events (
  id uuid primary key default gen_random_uuid(),
  payout_account_id uuid references public.provider_payout_accounts(id) on delete set null,
  provider_user_id uuid references auth.users(id) on delete set null,
  provider_id uuid references public.svc_providers(id) on delete set null,
  event_key text not null unique,
  event_type text not null check (
    event_type in (
      'created',
      'submitted',
      'changed',
      'verification_requested',
      'verified',
      'rejected',
      'disabled'
    )
  ),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_type text not null default 'provider'
    check (actor_type in ('provider','admin','system')),
  before_snapshot jsonb not null default '{}'::jsonb,
  after_snapshot jsonb not null default '{}'::jsonb,
  reason text,
  trace_id text not null default gen_random_uuid()::text,
  correlation_id text not null default gen_random_uuid()::text,
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  test_run_id uuid,
  fiscal_visibility public.financial_fiscal_visibility not null default 'excluded_from_accounting',
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_provider_payout_accounts_provider
  on public.provider_payout_accounts(provider_id, status, created_at desc);

create index if not exists idx_provider_payout_accounts_user
  on public.provider_payout_accounts(provider_user_id, status, created_at desc);

create index if not exists idx_provider_payout_accounts_review
  on public.provider_payout_accounts(status, risk_status, created_at desc)
  where status = 'pending_review';

create index if not exists idx_provider_payout_accounts_hash
  on public.provider_payout_accounts(account_hash);

create unique index if not exists provider_payout_accounts_one_verified_active
  on public.provider_payout_accounts(provider_user_id)
  where is_active and status = 'verified';

create index if not exists idx_provider_payout_account_events_account
  on public.provider_payout_account_events(payout_account_id, created_at desc);

create index if not exists idx_provider_payout_account_events_provider
  on public.provider_payout_account_events(provider_id, created_at desc);

drop trigger if exists trg_financial_set_updated_at_provider_payout_accounts
  on public.provider_payout_accounts;

create trigger trg_financial_set_updated_at_provider_payout_accounts
before update on public.provider_payout_accounts
for each row execute function public.financial_set_updated_at();

alter table public.provider_payout_accounts enable row level security;
alter table public.provider_payout_account_events enable row level security;

drop policy if exists provider_payout_accounts_owner_finance_read
  on public.provider_payout_accounts;
create policy provider_payout_accounts_owner_finance_read
on public.provider_payout_accounts
for select
to authenticated
using (
  provider_user_id = auth.uid()
  or public.is_financial_auditor(auth.uid())
  or public.is_admin_user(auth.uid())
);

drop policy if exists provider_payout_account_events_owner_finance_read
  on public.provider_payout_account_events;
create policy provider_payout_account_events_owner_finance_read
on public.provider_payout_account_events
for select
to authenticated
using (
  provider_user_id = auth.uid()
  or actor_user_id = auth.uid()
  or public.is_financial_auditor(auth.uid())
  or public.is_admin_user(auth.uid())
);

-- No direct authenticated insert/update/delete policies. Writes are mediated by
-- provider-payout-account and admin-provider-payout-accounts Edge Functions.
revoke all on public.provider_payout_accounts from public, anon;
revoke all on public.provider_payout_account_events from public, anon;
grant select on public.provider_payout_accounts to authenticated;
grant select on public.provider_payout_account_events to authenticated;
grant all on public.provider_payout_accounts to service_role;
grant all on public.provider_payout_account_events to service_role;

comment on table public.provider_payout_accounts is
  'Provider payout account review foundation. Stores masked/hash identifiers plus optional server-side encrypted payload. Payouts remain disabled.';

comment on column public.provider_payout_accounts.encrypted_payload is
  'AES-GCM server-side encrypted raw account data. If encryption secret is absent, raw values are not stored and encrypted_payload_required remains true.';

comment on column public.provider_payout_accounts.encrypted_payload_required is
  'True means the full CBU/CVU was not persisted encrypted and must be re-entered after Supabase Secret/Vault encryption is configured.';

comment on table public.provider_payout_account_events is
  'Append-only audit trail for provider payout account creation, changes and admin review.';

insert into public.audit_financial_events (
  event_key,
  event_type,
  actor_type,
  source,
  environment,
  is_test,
  fiscal_visibility,
  metadata
)
values (
  'provider_payout_account.foundation.created.20260514152000',
  'provider_payout_account.foundation_created',
  'system',
  'migration',
  'qa',
  true,
  'excluded_from_accounting',
  jsonb_build_object(
    'tables', jsonb_build_array('provider_payout_accounts', 'provider_payout_account_events'),
    'real_payouts_enabled', false,
    'ledger_touched', false,
    'raw_account_values_exposed', false,
    'full_bank_values_plaintext_stored', false,
    'encryption_required', true,
    'write_surface', 'edge_functions_only'
  )
)
on conflict (event_key) do nothing;
