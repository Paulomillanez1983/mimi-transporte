-- MIMIGO financial wallet + risk foundation phase 2C.
-- Additive only. This prepares cash/manual accounting, provider debt limits,
-- recovery previews and antifraud/device reputation without enabling real cash
-- collection, automatic blocks or payout holds.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Provider wallet foundation
-- ---------------------------------------------------------------------
create table if not exists public.provider_wallets (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.svc_providers(id) on delete cascade,
  provider_user_id uuid references auth.users(id) on delete set null,
  currency text not null default 'ARS',
  available_balance numeric(18,2) not null default 0,
  pending_balance numeric(18,2) not null default 0,
  negative_balance numeric(18,2) not null default 0,
  cash_debt_balance numeric(18,2) not null default 0,
  cash_debt_limit numeric(18,2) not null default 0,
  risk_hold_balance numeric(18,2) not null default 0,
  payout_hold_balance numeric(18,2) not null default 0,
  lifetime_earnings numeric(18,2) not null default 0,
  lifetime_platform_fees numeric(18,2) not null default 0,
  lifetime_cash_collected numeric(18,2) not null default 0,
  wallet_status text not null default 'active'
    check (wallet_status in ('active','cash_disabled','review_required','hold','closed')),
  risk_level text not null default 'low'
    check (risk_level in ('low','medium','high','critical')),
  cash_enabled boolean not null default false,
  recovery_enabled boolean not null default false,
  last_activity_at timestamptz,
  last_recomputed_at timestamptz,
  trace_id text,
  correlation_id text,
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  test_run_id uuid,
  fiscal_visibility public.financial_fiscal_visibility not null default 'fiscal_reportable',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, currency, environment, is_test)
);

create table if not exists public.provider_wallet_events (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid references public.provider_wallets(id) on delete set null,
  provider_id uuid references public.svc_providers(id) on delete set null,
  provider_user_id uuid references auth.users(id) on delete set null,
  event_key text not null,
  event_type text not null,
  event_source text not null default 'system',
  amount numeric(18,2) not null default 0,
  currency text not null default 'ARS',
  available_delta numeric(18,2) not null default 0,
  pending_delta numeric(18,2) not null default 0,
  negative_delta numeric(18,2) not null default 0,
  cash_debt_delta numeric(18,2) not null default 0,
  risk_hold_delta numeric(18,2) not null default 0,
  payout_hold_delta numeric(18,2) not null default 0,
  available_after numeric(18,2),
  pending_after numeric(18,2),
  negative_after numeric(18,2),
  cash_debt_after numeric(18,2),
  risk_hold_after numeric(18,2),
  payout_hold_after numeric(18,2),
  payment_id uuid references public.payments(id) on delete set null,
  refund_id uuid references public.refunds(id) on delete set null,
  settlement_id uuid references public.provider_settlements(id) on delete set null,
  payout_id uuid references public.payouts(id) on delete set null,
  financial_transaction_id uuid references public.financial_transactions(id) on delete set null,
  trace_id text not null default gen_random_uuid()::text,
  correlation_id text not null default gen_random_uuid()::text,
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  test_run_id uuid,
  fiscal_visibility public.financial_fiscal_visibility not null default 'fiscal_reportable',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (event_key)
);

create table if not exists public.provider_debt_limit_rules (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null unique,
  provider_tier text not null,
  risk_level text not null default 'low'
    check (risk_level in ('low','medium','high','critical')),
  provider_status text,
  kyc_status text,
  cash_debt_limit numeric(18,2) not null check (cash_debt_limit >= 0),
  priority integer not null default 100,
  active boolean not null default true,
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  fiscal_visibility public.financial_fiscal_visibility not null default 'excluded_from_accounting',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.provider_cash_debt_recovery_queue (
  id uuid primary key default gen_random_uuid(),
  recovery_key text not null unique,
  provider_id uuid not null references public.svc_providers(id) on delete cascade,
  wallet_id uuid references public.provider_wallets(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  source_wallet_event_id uuid references public.provider_wallet_events(id) on delete set null,
  status text not null default 'previewed'
    check (status in ('previewed','queued','eligible','applied','skipped','cancelled','failed')),
  debt_amount numeric(18,2) not null default 0,
  incoming_amount numeric(18,2) not null default 0,
  recovery_amount numeric(18,2) not null default 0,
  remaining_debt_amount numeric(18,2) not null default 0,
  provider_net_after_recovery numeric(18,2) not null default 0,
  currency text not null default 'ARS',
  eligible_after timestamptz,
  applied_at timestamptz,
  trace_id text not null default gen_random_uuid()::text,
  correlation_id text not null default gen_random_uuid()::text,
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  test_run_id uuid,
  fiscal_visibility public.financial_fiscal_visibility not null default 'fiscal_reportable',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Antifraud and device reputation foundation
-- ---------------------------------------------------------------------
create table if not exists public.fraud_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  event_type text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  provider_id uuid references public.svc_providers(id) on delete set null,
  visitor_id_hash text,
  request_id text,
  ip_hash text,
  user_agent_hash text,
  fingerprint_confidence numeric(6,4),
  risk_score integer not null default 0,
  risk_level text not null default 'low'
    check (risk_level in ('low','medium','high','critical')),
  recommendation text not null default 'allow'
    check (recommendation in ('allow','log','additional_verification','manual_review_hold')),
  decision_applied boolean not null default false,
  reasons text[] not null default '{}'::text[],
  trace_id text not null default gen_random_uuid()::text,
  correlation_id text not null default gen_random_uuid()::text,
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  test_run_id uuid,
  fiscal_visibility public.financial_fiscal_visibility not null default 'excluded_from_accounting',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.device_reputation (
  id uuid primary key default gen_random_uuid(),
  visitor_id_hash text not null unique,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  actor_count integer not null default 0,
  provider_count integer not null default 0,
  event_count integer not null default 0,
  recent_event_count integer not null default 0,
  payout_change_count integer not null default 0,
  financial_change_count integer not null default 0,
  risk_score integer not null default 0,
  risk_level text not null default 'low'
    check (risk_level in ('low','medium','high','critical')),
  reputation_status text not null default 'observed'
    check (reputation_status in ('observed','trusted','watch','review')),
  last_event_id uuid references public.fraud_events(id) on delete set null,
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  fiscal_visibility public.financial_fiscal_visibility not null default 'excluded_from_accounting',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.risk_scores (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  provider_id uuid references public.svc_providers(id) on delete set null,
  subject_type text not null default 'user'
    check (subject_type in ('user','provider','device','payment','payout')),
  subject_key text not null,
  current_score integer not null default 0,
  risk_level text not null default 'low'
    check (risk_level in ('low','medium','high','critical')),
  recommendation text not null default 'allow'
    check (recommendation in ('allow','log','additional_verification','manual_review_hold')),
  last_event_id uuid references public.fraud_events(id) on delete set null,
  factors jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  test_run_id uuid,
  fiscal_visibility public.financial_fiscal_visibility not null default 'excluded_from_accounting',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_type, subject_key, environment, is_test)
);

create index if not exists idx_provider_wallets_provider
  on public.provider_wallets(provider_id, wallet_status, risk_level);
create index if not exists idx_provider_wallets_debt
  on public.provider_wallets(cash_debt_balance, cash_debt_limit)
  where cash_debt_balance > 0;
create index if not exists idx_provider_wallet_events_provider
  on public.provider_wallet_events(provider_id, created_at desc);
create index if not exists idx_provider_recovery_queue_provider
  on public.provider_cash_debt_recovery_queue(provider_id, status, created_at desc);
create index if not exists idx_fraud_events_actor
  on public.fraud_events(actor_user_id, created_at desc);
create index if not exists idx_fraud_events_provider
  on public.fraud_events(provider_id, event_type, created_at desc);
create index if not exists idx_fraud_events_visitor
  on public.fraud_events(visitor_id_hash, created_at desc)
  where visitor_id_hash is not null;
create index if not exists idx_risk_scores_provider
  on public.risk_scores(provider_id, risk_level, updated_at desc);

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'provider_wallets','provider_debt_limit_rules',
    'provider_cash_debt_recovery_queue','device_reputation','risk_scores'
  ]
  loop
    execute format('drop trigger if exists trg_financial_set_updated_at_%I on public.%I', tbl, tbl);
    execute format('create trigger trg_financial_set_updated_at_%I before update on public.%I for each row execute function public.financial_set_updated_at()', tbl, tbl);
  end loop;
end $$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array['provider_wallet_events','fraud_events']
  loop
    execute format('drop trigger if exists trg_block_update_%I on public.%I', tbl, tbl);
    execute format('drop trigger if exists trg_block_delete_%I on public.%I', tbl, tbl);
    execute format('create trigger trg_block_update_%I before update on public.%I for each row execute function public.financial_block_immutable_mutation()', tbl, tbl);
    execute format('create trigger trg_block_delete_%I before delete on public.%I for each row execute function public.financial_block_immutable_mutation()', tbl, tbl);
  end loop;
end $$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'provider_wallets','provider_wallet_events','provider_debt_limit_rules',
    'provider_cash_debt_recovery_queue','fraud_events','device_reputation','risk_scores'
  ]
  loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('revoke all on public.%I from anon', tbl);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', tbl);
    execute format('grant select on public.%I to authenticated', tbl);
    execute format('grant select, insert, update on public.%I to service_role', tbl);
  end loop;
end $$;

drop policy if exists provider_wallets_owner_finance_read on public.provider_wallets;
create policy provider_wallets_owner_finance_read on public.provider_wallets
for select to authenticated
using (
  provider_user_id = auth.uid()
  or provider_id = public.mimi_current_service_provider_id()
  or public.is_financial_auditor(auth.uid())
  or public.is_admin_user(auth.uid())
);

drop policy if exists provider_wallet_events_owner_finance_read on public.provider_wallet_events;
create policy provider_wallet_events_owner_finance_read on public.provider_wallet_events
for select to authenticated
using (
  provider_user_id = auth.uid()
  or provider_id = public.mimi_current_service_provider_id()
  or public.is_financial_auditor(auth.uid())
  or public.is_admin_user(auth.uid())
);

drop policy if exists provider_recovery_queue_finance_read on public.provider_cash_debt_recovery_queue;
create policy provider_recovery_queue_finance_read on public.provider_cash_debt_recovery_queue
for select to authenticated
using (
  provider_id = public.mimi_current_service_provider_id()
  or public.is_financial_auditor(auth.uid())
  or public.is_admin_user(auth.uid())
);

drop policy if exists provider_debt_limit_rules_finance_read on public.provider_debt_limit_rules;
create policy provider_debt_limit_rules_finance_read on public.provider_debt_limit_rules
for select to authenticated
using (public.is_financial_auditor(auth.uid()) or public.is_admin_user(auth.uid()));

drop policy if exists fraud_events_finance_or_actor_read on public.fraud_events;
create policy fraud_events_finance_or_actor_read on public.fraud_events
for select to authenticated
using (
  actor_user_id = auth.uid()
  or provider_id = public.mimi_current_service_provider_id()
  or public.is_financial_auditor(auth.uid())
  or public.is_admin_user(auth.uid())
);

drop policy if exists risk_scores_finance_or_subject_read on public.risk_scores;
create policy risk_scores_finance_or_subject_read on public.risk_scores
for select to authenticated
using (
  actor_user_id = auth.uid()
  or provider_id = public.mimi_current_service_provider_id()
  or public.is_financial_auditor(auth.uid())
  or public.is_admin_user(auth.uid())
);

drop policy if exists device_reputation_finance_read on public.device_reputation;
create policy device_reputation_finance_read on public.device_reputation
for select to authenticated
using (public.is_financial_auditor(auth.uid()) or public.is_admin_user(auth.uid()));

insert into public.provider_debt_limit_rules (
  rule_key, provider_tier, risk_level, provider_status, kyc_status,
  cash_debt_limit, priority, metadata
)
values
  ('cash_limit:new_provider:v1', 'new', 'low', null, null, 10000, 300,
   jsonb_build_object('description', 'Initial controlled cash debt limit for new providers.')),
  ('cash_limit:verified_provider:v1', 'verified', 'low', null, 'APPROVED', 50000, 200,
   jsonb_build_object('description', 'Controlled cash debt limit for verified providers.')),
  ('cash_limit:premium_provider:v1', 'premium', 'low', null, 'PREMIUM', 150000, 100,
   jsonb_build_object('description', 'Future premium/provider-health tier; not auto-assigned.')),
  ('cash_limit:high_risk:v1', 'risk_limited', 'high', null, null, 0, 50,
   jsonb_build_object('description', 'High risk providers require review before cash enablement.'))
on conflict (rule_key) do nothing;

comment on table public.provider_wallets is
  'Phase 2C provider wallet foundation. Mutable derived snapshot, not the ledger source of truth. Cash/recovery disabled by default.';
comment on table public.provider_wallet_events is
  'Append-only wallet event stream for cash debt, holds and recovery previews.';
comment on table public.provider_cash_debt_recovery_queue is
  'Future debt recovery queue. Phase 2C only records previews/queued intent; no automatic discounting is active.';
comment on table public.fraud_events is
  'Append-only antifraud/risk event stream. Stores hashed device identifiers only.';
comment on table public.device_reputation is
  'Device reputation aggregate keyed by visitor_id_hash. Finance/admin only by RLS.';

create or replace function public.financial_get_provider_debt_limit(p_provider_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_provider public.svc_providers%rowtype;
  v_profile public.svc_provider_profiles%rowtype;
  v_wallet public.provider_wallets%rowtype;
  v_limit numeric(18,2);
begin
  if p_provider_id is null then
    return 0;
  end if;

  select * into v_provider from public.svc_providers where id = p_provider_id;
  select * into v_profile from public.svc_provider_profiles where provider_id = p_provider_id;
  select * into v_wallet
  from public.provider_wallets
  where provider_id = p_provider_id and currency = 'ARS'
  order by is_test asc, created_at desc
  limit 1;

  if coalesce(v_wallet.risk_level, 'low') in ('high','critical') or coalesce(v_provider.blocked, false) then
    select cash_debt_limit into v_limit
    from public.provider_debt_limit_rules
    where active = true and rule_key = 'cash_limit:high_risk:v1'
    limit 1;
    return coalesce(v_limit, 0);
  end if;

  if coalesce(v_provider.approved, false)
     and upper(coalesce(v_profile.kyc_status, '')) in ('APPROVED','READY_FOR_APPROVAL')
     and lower(coalesce(v_profile.review_status, '')) = 'approved' then
    select cash_debt_limit into v_limit
    from public.provider_debt_limit_rules
    where active = true and rule_key = 'cash_limit:verified_provider:v1'
    limit 1;
    return coalesce(v_limit, 50000);
  end if;

  select cash_debt_limit into v_limit
  from public.provider_debt_limit_rules
  where active = true and rule_key = 'cash_limit:new_provider:v1'
  limit 1;
  return coalesce(v_limit, 10000);
end;
$$;

create or replace function public.financial_ensure_provider_wallet(
  p_provider_id uuid,
  p_environment public.financial_environment default 'production',
  p_is_test boolean default false,
  p_test_run_id uuid default null,
  p_fiscal_visibility public.financial_fiscal_visibility default 'fiscal_reportable'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider_user_id uuid;
  v_wallet_id uuid;
  v_limit numeric(18,2);
begin
  if p_provider_id is null then
    raise exception 'PROVIDER_REQUIRED';
  end if;

  select user_id into v_provider_user_id
  from public.svc_providers
  where id = p_provider_id;

  if v_provider_user_id is null then
    raise exception 'PROVIDER_NOT_FOUND';
  end if;

  v_limit := public.financial_get_provider_debt_limit(p_provider_id);

  insert into public.provider_wallets (
    provider_id, provider_user_id, cash_debt_limit, currency,
    environment, is_test, test_run_id, fiscal_visibility
  )
  values (
    p_provider_id, v_provider_user_id, v_limit, 'ARS',
    p_environment, p_is_test, p_test_run_id, p_fiscal_visibility
  )
  on conflict (provider_id, currency, environment, is_test) do update
  set provider_user_id = excluded.provider_user_id,
      cash_debt_limit = excluded.cash_debt_limit,
      test_run_id = coalesce(provider_wallets.test_run_id, excluded.test_run_id),
      fiscal_visibility = excluded.fiscal_visibility,
      updated_at = now()
  returning id into v_wallet_id;

  insert into public.provider_wallet_events (
    wallet_id, provider_id, provider_user_id, event_key, event_type,
    event_source, amount, environment, is_test, test_run_id, fiscal_visibility,
    metadata
  )
  values (
    v_wallet_id, p_provider_id, v_provider_user_id,
    'wallet:ensure:' || v_wallet_id::text || ':' || p_environment::text || ':' || p_is_test::text,
    'wallet_ensured', 'financial_ensure_provider_wallet', 0,
    p_environment, p_is_test, p_test_run_id, p_fiscal_visibility,
    jsonb_build_object('cash_debt_limit', v_limit, 'cash_enabled', false, 'recovery_enabled', false)
  )
  on conflict (event_key) do nothing;

  return v_wallet_id;
end;
$$;

create or replace function public.financial_recompute_provider_wallet_foundation(
  p_provider_id uuid,
  p_environment public.financial_environment default 'production',
  p_is_test boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet_id uuid;
  v_wallet public.provider_wallets%rowtype;
  v_available numeric(18,2);
  v_pending numeric(18,2);
  v_platform_fees numeric(18,2);
  v_cash_collected numeric(18,2);
  v_negative numeric(18,2);
  v_limit numeric(18,2);
begin
  v_wallet_id := public.financial_ensure_provider_wallet(
    p_provider_id,
    p_environment,
    p_is_test,
    null,
    case when p_is_test then 'excluded_from_accounting'::public.financial_fiscal_visibility else 'fiscal_reportable'::public.financial_fiscal_visibility end
  );

  select * into v_wallet from public.provider_wallets where id = v_wallet_id;
  v_limit := public.financial_get_provider_debt_limit(p_provider_id);

  select coalesce(sum(net_amount), 0)
  into v_available
  from public.provider_earnings
  where provider_id = p_provider_id
    and status in ('available','settled','earned')
    and is_test = p_is_test
    and (p_is_test or fiscal_visibility = 'fiscal_reportable');

  select coalesce(sum(net_amount), 0)
  into v_pending
  from public.provider_earnings
  where provider_id = p_provider_id
    and status in ('pending','processing')
    and is_test = p_is_test
    and (p_is_test or fiscal_visibility = 'fiscal_reportable');

  select coalesce(sum(commission_amount), 0)
  into v_platform_fees
  from public.provider_earnings
  where provider_id = p_provider_id
    and is_test = p_is_test
    and (p_is_test or fiscal_visibility = 'fiscal_reportable');

  select coalesce(sum(total_amount), 0)
  into v_cash_collected
  from public.payments
  where provider_id = p_provider_id
    and payment_method in ('cash','manual')
    and status in ('APPROVED','CAPTURED','SETTLED','PARTIALLY_REFUNDED')
    and is_test = p_is_test
    and (p_is_test or fiscal_visibility = 'fiscal_reportable');

  v_negative := greatest(coalesce(v_wallet.cash_debt_balance, 0) - greatest(v_available, 0), 0);

  update public.provider_wallets
  set available_balance = greatest(v_available - coalesce(risk_hold_balance, 0) - coalesce(payout_hold_balance, 0), 0),
      pending_balance = v_pending,
      negative_balance = v_negative,
      cash_debt_limit = v_limit,
      lifetime_earnings = greatest(v_available + v_pending, 0),
      lifetime_platform_fees = greatest(v_platform_fees, 0),
      lifetime_cash_collected = greatest(v_cash_collected, 0),
      wallet_status = case
        when cash_debt_balance > v_limit then 'cash_disabled'
        when risk_level in ('high','critical') then 'review_required'
        else wallet_status
      end,
      last_activity_at = coalesce(last_activity_at, now()),
      last_recomputed_at = now(),
      updated_at = now()
  where id = v_wallet_id
  returning * into v_wallet;

  insert into public.provider_wallet_events (
    wallet_id, provider_id, provider_user_id, event_key, event_type, event_source,
    amount, available_after, pending_after, negative_after, cash_debt_after,
    risk_hold_after, payout_hold_after, environment, is_test, fiscal_visibility, metadata
  )
  values (
    v_wallet.id, v_wallet.provider_id, v_wallet.provider_user_id,
    'wallet:recompute:' || v_wallet.id::text || ':' || gen_random_uuid()::text,
    'wallet_recomputed', 'financial_recompute_provider_wallet_foundation',
    0, v_wallet.available_balance, v_wallet.pending_balance, v_wallet.negative_balance,
    v_wallet.cash_debt_balance, v_wallet.risk_hold_balance, v_wallet.payout_hold_balance,
    v_wallet.environment, v_wallet.is_test, v_wallet.fiscal_visibility,
    jsonb_build_object('cash_debt_limit', v_wallet.cash_debt_limit, 'activation', 'foundation_only')
  );

  return v_wallet_id;
end;
$$;

create or replace function public.financial_preview_debt_recovery(
  p_provider_id uuid,
  p_incoming_amount numeric,
  p_payment_id uuid default null,
  p_create_queue_item boolean default false,
  p_environment public.financial_environment default 'production',
  p_is_test boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet_id uuid;
  v_wallet public.provider_wallets%rowtype;
  v_debt numeric(18,2);
  v_incoming numeric(18,2);
  v_recovery numeric(18,2);
  v_remaining numeric(18,2);
  v_net numeric(18,2);
  v_key text;
begin
  if p_provider_id is null then
    raise exception 'PROVIDER_REQUIRED';
  end if;

  v_incoming := greatest(coalesce(p_incoming_amount, 0), 0);
  v_wallet_id := public.financial_ensure_provider_wallet(
    p_provider_id,
    p_environment,
    p_is_test,
    null,
    case when p_is_test then 'excluded_from_accounting'::public.financial_fiscal_visibility else 'fiscal_reportable'::public.financial_fiscal_visibility end
  );
  select * into v_wallet from public.provider_wallets where id = v_wallet_id;

  v_debt := greatest(coalesce(v_wallet.cash_debt_balance, 0), 0);
  v_recovery := least(v_debt, v_incoming);
  v_remaining := greatest(v_debt - v_recovery, 0);
  v_net := greatest(v_incoming - v_recovery, 0);

  if p_create_queue_item then
    v_key := 'recovery:preview:' || v_wallet_id::text || ':' || coalesce(p_payment_id::text, 'no-payment') || ':' || v_incoming::text;
    insert into public.provider_cash_debt_recovery_queue (
      recovery_key, provider_id, wallet_id, payment_id, status,
      debt_amount, incoming_amount, recovery_amount, remaining_debt_amount,
      provider_net_after_recovery, environment, is_test, fiscal_visibility,
      metadata
    )
    values (
      v_key, p_provider_id, v_wallet_id, p_payment_id, 'previewed',
      v_debt, v_incoming, v_recovery, v_remaining, v_net,
      p_environment, p_is_test,
      case when p_is_test then 'excluded_from_accounting'::public.financial_fiscal_visibility else 'fiscal_reportable'::public.financial_fiscal_visibility end,
      jsonb_build_object('activation', 'preview_only', 'will_not_apply_without_future_phase', true)
    )
    on conflict (recovery_key) do nothing;
  end if;

  return jsonb_build_object(
    'provider_id', p_provider_id,
    'wallet_id', v_wallet_id,
    'incoming_amount', v_incoming,
    'cash_debt_balance', v_debt,
    'recovery_amount', v_recovery,
    'remaining_debt_amount', v_remaining,
    'provider_net_after_recovery', v_net,
    'cash_enabled', false,
    'recovery_applied', false,
    'recommendation', case when v_debt > v_wallet.cash_debt_limit then 'cash_disabled_review' else 'preview_only' end
  );
end;
$$;

create or replace function public.financial_record_cash_manual_foundation_event(
  p_provider_id uuid,
  p_payment_id uuid,
  p_cash_collected_amount numeric,
  p_platform_fee_amount numeric,
  p_event_key text,
  p_environment public.financial_environment default 'production',
  p_is_test boolean default false,
  p_test_run_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet_id uuid;
  v_wallet public.provider_wallets%rowtype;
  v_fee numeric(18,2);
  v_cash numeric(18,2);
begin
  if p_provider_id is null or coalesce(p_event_key, '') = '' then
    raise exception 'FOUNDATION_EVENT_INVALID';
  end if;

  v_cash := greatest(coalesce(p_cash_collected_amount, 0), 0);
  v_fee := greatest(coalesce(p_platform_fee_amount, 0), 0);

  v_wallet_id := public.financial_ensure_provider_wallet(
    p_provider_id,
    p_environment,
    p_is_test,
    p_test_run_id,
    case when p_is_test then 'excluded_from_accounting'::public.financial_fiscal_visibility else 'fiscal_reportable'::public.financial_fiscal_visibility end
  );

  update public.provider_wallets
  set cash_debt_balance = cash_debt_balance + v_fee,
      negative_balance = greatest((cash_debt_balance + v_fee) - available_balance, 0),
      lifetime_cash_collected = lifetime_cash_collected + v_cash,
      wallet_status = case
        when cash_debt_balance + v_fee > cash_debt_limit then 'cash_disabled'
        else wallet_status
      end,
      last_activity_at = now(),
      updated_at = now()
  where id = v_wallet_id
  returning * into v_wallet;

  insert into public.provider_wallet_events (
    wallet_id, provider_id, provider_user_id, event_key, event_type,
    event_source, amount, cash_debt_delta, cash_debt_after, negative_after,
    payment_id, environment, is_test, test_run_id, fiscal_visibility, metadata
  )
  values (
    v_wallet_id, p_provider_id, v_wallet.provider_user_id, p_event_key,
    'cash_manual_commission_receivable_prepared', 'financial_record_cash_manual_foundation_event',
    v_fee, v_fee, v_wallet.cash_debt_balance, v_wallet.negative_balance,
    p_payment_id, p_environment, p_is_test, p_test_run_id,
    case when p_is_test then 'excluded_from_accounting'::public.financial_fiscal_visibility else 'fiscal_reportable'::public.financial_fiscal_visibility end,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'cash_collected_amount', v_cash,
      'platform_fee_amount', v_fee,
      'cash_enabled_in_production', false
    )
  )
  on conflict (event_key) do nothing;

  return v_wallet_id;
end;
$$;

revoke all on function public.financial_get_provider_debt_limit(uuid) from public, anon, authenticated;
revoke all on function public.financial_ensure_provider_wallet(uuid, public.financial_environment, boolean, uuid, public.financial_fiscal_visibility) from public, anon, authenticated;
revoke all on function public.financial_recompute_provider_wallet_foundation(uuid, public.financial_environment, boolean) from public, anon, authenticated;
revoke all on function public.financial_preview_debt_recovery(uuid, numeric, uuid, boolean, public.financial_environment, boolean) from public, anon, authenticated;
revoke all on function public.financial_record_cash_manual_foundation_event(uuid, uuid, numeric, numeric, text, public.financial_environment, boolean, uuid, jsonb) from public, anon, authenticated;

grant execute on function public.financial_get_provider_debt_limit(uuid) to service_role;
grant execute on function public.financial_ensure_provider_wallet(uuid, public.financial_environment, boolean, uuid, public.financial_fiscal_visibility) to service_role;
grant execute on function public.financial_recompute_provider_wallet_foundation(uuid, public.financial_environment, boolean) to service_role;
grant execute on function public.financial_preview_debt_recovery(uuid, numeric, uuid, boolean, public.financial_environment, boolean) to service_role;
grant execute on function public.financial_record_cash_manual_foundation_event(uuid, uuid, numeric, numeric, text, public.financial_environment, boolean, uuid, jsonb) to service_role;

insert into public.audit_financial_events (
  event_key, event_type, actor_type, source, after_snapshot,
  trace_id, correlation_id, environment, is_test, fiscal_visibility, metadata
)
values (
  'migration:financial_wallet_risk_foundation_phase_2c',
  'financial.wallet_risk.phase_2c_foundation_applied',
  'system',
  'migration',
  jsonb_build_object(
    'provider_wallet_foundation', true,
    'cash_manual_enabled', false,
    'automatic_recovery_enabled', false,
    'automatic_blocking_enabled', false,
    'fingerprint_scope', 'critical_events_only'
  ),
  gen_random_uuid()::text,
  'migration:20260514133241',
  'production',
  false,
  'excluded_from_accounting',
  jsonb_build_object('migration', '20260514133241_financial_wallet_risk_foundation_phase_2c')
)
on conflict (event_key) do nothing;
