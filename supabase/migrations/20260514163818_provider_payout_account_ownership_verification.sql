-- Provider payout account ownership verification foundation.
-- Additive only. No real payouts are enabled, no ledger is touched, and no
-- full CBU/CVU/CUIT/CUIL is stored in plaintext.

begin;

-- ---------------------------------------------------------------------
-- KYC tax identity anchor
-- ---------------------------------------------------------------------
alter table public.svc_providers
  add column if not exists kyc_tax_id_hash text,
  add column if not exists kyc_tax_id_last4 text,
  add column if not exists kyc_tax_id_masked text,
  add column if not exists kyc_tax_id_status text not null default 'missing'
    check (kyc_tax_id_status in ('missing','pending_review','verified','rejected','disabled')),
  add column if not exists kyc_tax_id_verified_at timestamptz,
  add column if not exists kyc_tax_id_source text,
  add column if not exists kyc_tax_id_metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_svc_providers_kyc_tax_id_hash
  on public.svc_providers(kyc_tax_id_hash)
  where kyc_tax_id_hash is not null;

create index if not exists idx_svc_providers_kyc_tax_status
  on public.svc_providers(kyc_tax_id_status, approved, blocked);

-- Providers may update their public profile via RLS, so these new KYC tax
-- fields must be protected by the same admin/backend-only trigger.
create or replace function public.svc_guard_provider_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_uid uuid := auth.uid();
  v_is_privileged boolean := false;
begin
  v_is_privileged :=
    v_role = 'service_role'
    or public.is_admin_user(v_uid);

  if v_is_privileged then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.approved, false) is distinct from false then
      raise exception 'provider_approved_admin_only' using errcode = '42501';
    end if;
    if coalesce(new.blocked, false) is distinct from false then
      raise exception 'provider_blocked_admin_only' using errcode = '42501';
    end if;
    if new.notes_internal is not null then
      raise exception 'provider_notes_internal_admin_only' using errcode = '42501';
    end if;
    if new.kyc_tax_id_hash is not null
       or new.kyc_tax_id_last4 is not null
       or new.kyc_tax_id_masked is not null
       or coalesce(new.kyc_tax_id_status, 'missing') <> 'missing'
       or new.kyc_tax_id_verified_at is not null
       or new.kyc_tax_id_source is not null
       or coalesce(new.kyc_tax_id_metadata, '{}'::jsonb) <> '{}'::jsonb then
      raise exception 'provider_kyc_tax_id_admin_only' using errcode = '42501';
    end if;

    return new;
  end if;

  if new.approved is distinct from old.approved then
    raise exception 'provider_approved_admin_only' using errcode = '42501';
  end if;

  if new.blocked is distinct from old.blocked then
    raise exception 'provider_blocked_admin_only' using errcode = '42501';
  end if;

  if new.notes_internal is distinct from old.notes_internal then
    raise exception 'provider_notes_internal_admin_only' using errcode = '42501';
  end if;

  if new.kyc_tax_id_hash is distinct from old.kyc_tax_id_hash
     or new.kyc_tax_id_last4 is distinct from old.kyc_tax_id_last4
     or new.kyc_tax_id_masked is distinct from old.kyc_tax_id_masked
     or new.kyc_tax_id_status is distinct from old.kyc_tax_id_status
     or new.kyc_tax_id_verified_at is distinct from old.kyc_tax_id_verified_at
     or new.kyc_tax_id_source is distinct from old.kyc_tax_id_source
     or new.kyc_tax_id_metadata is distinct from old.kyc_tax_id_metadata then
    raise exception 'provider_kyc_tax_id_admin_only' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_svc_providers_guard_admin_fields on public.svc_providers;
create trigger trg_svc_providers_guard_admin_fields
before insert or update on public.svc_providers
for each row
execute function public.svc_guard_provider_admin_fields();

revoke execute on function public.svc_guard_provider_admin_fields() from public, anon, authenticated;
grant execute on function public.svc_guard_provider_admin_fields() to service_role;

-- ---------------------------------------------------------------------
-- Payout account ownership status
-- ---------------------------------------------------------------------
alter table public.provider_payout_accounts
  add column if not exists holder_tax_id_hash text,
  add column if not exists holder_tax_id_last4 text,
  add column if not exists ownership_verification_status text not null default 'not_verified'
    check (
      ownership_verification_status in (
        'not_verified',
        'pending_missing_tax_id',
        'pending_external_verification',
        'verification_failed',
        'ownership_verified',
        'ownership_mismatch',
        'needs_more_info',
        'manual_review',
        'account_inactive'
      )
    ),
  add column if not exists ownership_match boolean not null default false,
  add column if not exists ownership_match_reason text,
  add column if not exists ownership_verified_at timestamptz,
  add column if not exists latest_ownership_verification_id uuid;

create index if not exists idx_provider_payout_accounts_ownership
  on public.provider_payout_accounts(provider_id, ownership_verification_status, ownership_match, status);

create index if not exists idx_provider_payout_accounts_holder_tax_hash
  on public.provider_payout_accounts(holder_tax_id_hash)
  where holder_tax_id_hash is not null;

create table if not exists public.provider_payout_account_verifications (
  id uuid primary key default gen_random_uuid(),
  payout_account_id uuid not null references public.provider_payout_accounts(id) on delete cascade,
  provider_user_id uuid not null references auth.users(id) on delete cascade,
  provider_id uuid references public.svc_providers(id) on delete set null,
  verification_provider text not null default 'manual',
  verification_status text not null
    check (
      verification_status in (
        'pending_missing_tax_id',
        'pending_external_verification',
        'verification_failed',
        'ownership_verified',
        'ownership_mismatch',
        'needs_more_info',
        'manual_review',
        'account_inactive'
      )
    ),
  account_active boolean,
  account_type text,
  bank_name text,
  holder_name_masked text,
  holder_tax_id_hash text,
  holder_tax_id_last4 text,
  ownership_match boolean not null default false,
  ownership_match_reason text,
  matched_kyc_tax_id_hash text,
  raw_response_encrypted jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  verified_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_reason text,
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  test_run_id uuid,
  fiscal_visibility public.financial_fiscal_visibility not null default 'excluded_from_accounting',
  created_at timestamptz not null default now()
);

create index if not exists idx_provider_payout_account_verifications_account
  on public.provider_payout_account_verifications(payout_account_id, created_at desc);

create index if not exists idx_provider_payout_account_verifications_provider
  on public.provider_payout_account_verifications(provider_id, verification_status, created_at desc);

create index if not exists idx_provider_payout_account_verifications_user
  on public.provider_payout_account_verifications(provider_user_id, created_at desc);

create index if not exists idx_provider_payout_account_verifications_tax_hash
  on public.provider_payout_account_verifications(holder_tax_id_hash)
  where holder_tax_id_hash is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'provider_payout_accounts_latest_ownership_verification_fkey'
  ) then
    alter table public.provider_payout_accounts
      add constraint provider_payout_accounts_latest_ownership_verification_fkey
      foreign key (latest_ownership_verification_id)
      references public.provider_payout_account_verifications(id)
      on delete set null;
  end if;
end $$;

alter table public.provider_payout_account_verifications enable row level security;

drop policy if exists provider_payout_account_verifications_owner_finance_read
  on public.provider_payout_account_verifications;
create policy provider_payout_account_verifications_owner_finance_read
on public.provider_payout_account_verifications
for select
to authenticated
using (
  provider_user_id = auth.uid()
  or public.is_financial_auditor(auth.uid())
  or public.is_admin_user(auth.uid())
);

revoke all on public.provider_payout_account_verifications from public, anon;
revoke all on public.provider_payout_account_verifications from authenticated;
grant select on public.provider_payout_account_verifications to authenticated;
grant all on public.provider_payout_account_verifications to service_role;

comment on table public.provider_payout_account_verifications is
  'Append-only ownership verification results for provider payout accounts. Raw external responses are encrypted server-side; admins and providers only see masked/hash data.';

comment on column public.svc_providers.kyc_tax_id_hash is
  'Stable hash of verified provider CUIT/CUIL. Full value must never be stored in plaintext.';

comment on column public.provider_payout_account_verifications.raw_response_encrypted is
  'AES-GCM encrypted response from account ownership verification provider. Must not contain plaintext in ordinary query output.';

-- ---------------------------------------------------------------------
-- Payout safety guard
-- ---------------------------------------------------------------------
create or replace function public.financial_provider_payout_account_guard(p_provider_id uuid)
returns table (
  payout_account_id uuid,
  eligible boolean,
  reason text,
  ownership_match boolean,
  ownership_verification_status text,
  kyc_tax_id_status text
)
language sql
security definer
set search_path = public
stable
as $$
  with provider_row as (
    select id, approved, blocked, kyc_tax_id_hash, kyc_tax_id_status
    from public.svc_providers
    where id = p_provider_id
  ),
  account_row as (
    select pa.*
    from public.provider_payout_accounts pa
    where pa.provider_id = p_provider_id
      and pa.status = 'verified'
      and pa.is_active = true
    order by pa.ownership_verified_at desc nulls last, pa.created_at desc
    limit 1
  ),
  latest_verification as (
    select v.*
    from public.provider_payout_account_verifications v
    join account_row a on a.id = v.payout_account_id
    order by v.created_at desc
    limit 1
  )
  select
    a.id as payout_account_id,
    (
      coalesce(p.approved, false) = true
      and coalesce(p.blocked, false) = false
      and p.kyc_tax_id_hash is not null
      and p.kyc_tax_id_status = 'verified'
      and a.id is not null
      and a.ownership_match = true
      and a.ownership_verification_status = 'ownership_verified'
      and coalesce(v.ownership_match, false) = true
      and v.verification_status = 'ownership_verified'
    ) as eligible,
    case
      when p.id is null then 'provider_not_found'
      when coalesce(p.approved, false) = false then 'provider_kyc_not_approved'
      when coalesce(p.blocked, false) = true then 'provider_blocked'
      when p.kyc_tax_id_hash is null or p.kyc_tax_id_status <> 'verified' then 'provider_kyc_tax_id_missing'
      when a.id is null then 'verified_payout_account_missing'
      when a.ownership_match <> true then 'ownership_not_verified'
      when a.ownership_verification_status <> 'ownership_verified' then a.ownership_verification_status
      when coalesce(v.ownership_match, false) <> true then 'latest_verification_not_matching'
      when v.verification_status <> 'ownership_verified' then v.verification_status
      else 'eligible'
    end as reason,
    coalesce(a.ownership_match, false) as ownership_match,
    coalesce(a.ownership_verification_status, 'not_verified') as ownership_verification_status,
    coalesce(p.kyc_tax_id_status, 'missing') as kyc_tax_id_status
  from provider_row p
  left join account_row a on true
  left join latest_verification v on true;
$$;

revoke all on function public.financial_provider_payout_account_guard(uuid) from public, anon, authenticated;
grant execute on function public.financial_provider_payout_account_guard(uuid) to service_role;

create or replace function public.financial_create_payout_batch(
  p_settlement_batch_id uuid,
  p_actor_user_id uuid default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settlement_batch public.settlement_batches%rowtype;
  v_batch_id uuid;
  v_key text;
begin
  select * into v_settlement_batch
  from public.settlement_batches
  where id = p_settlement_batch_id
  for update;

  if not found then
    raise exception 'FINANCIAL_SETTLEMENT_BATCH_NOT_FOUND';
  end if;

  if v_settlement_batch.status not in ('approved','locked') then
    raise exception 'FINANCIAL_SETTLEMENT_NOT_APPROVED_FOR_PAYOUT';
  end if;

  v_key := coalesce(p_idempotency_key, 'payout-batch:' || p_settlement_batch_id::text);

  select id into v_batch_id
  from public.payout_batches
  where ledger_id = v_settlement_batch.ledger_id
    and batch_key = v_key;

  if v_batch_id is not null then
    return v_batch_id;
  end if;

  insert into public.payout_batches (
    ledger_id, batch_key, settlement_batch_id, status, currency,
    actor_user_id, environment, is_test, fiscal_visibility, metadata
  )
  values (
    v_settlement_batch.ledger_id, v_key, p_settlement_batch_id, 'pending', v_settlement_batch.currency,
    p_actor_user_id, v_settlement_batch.environment, v_settlement_batch.is_test, v_settlement_batch.fiscal_visibility,
    jsonb_build_object(
      'source', 'financial_create_payout_batch',
      'payout_account_guard_enabled', true,
      'real_payout_execution_enabled', false
    )
  )
  returning id into v_batch_id;

  insert into public.payouts (
    provider_settlement_id, provider_id, batch_id, payout_key, idempotency_key,
    bank_account_ref, amount, currency, status, scheduled_for, environment,
    is_test, fiscal_visibility, actor_user_id, trace_id, correlation_id, metadata
  )
  select
    ps.id,
    ps.provider_id,
    v_batch_id,
    'payout:' || ps.id::text,
    'payout:' || ps.id::text,
    case when guard.eligible then guard.payout_account_id::text else null end,
    greatest(ps.net_amount, 0),
    ps.currency,
    case
      when coalesce(sp.approved, false) = false or coalesce(sp.blocked, false) = true then 'on_hold'
      when coalesce(guard.eligible, false) = false then 'on_hold'
      when ps.dispute_amount > 0 then 'disputed'
      else 'pending'
    end,
    now(),
    ps.environment,
    ps.is_test,
    ps.fiscal_visibility,
    p_actor_user_id,
    coalesce(ps.trace_id, gen_random_uuid()::text),
    coalesce(ps.correlation_id, gen_random_uuid()::text),
    jsonb_build_object(
      'provider_kyc_approved', coalesce(sp.approved, false),
      'provider_blocked', coalesce(sp.blocked, false),
      'settlement_status', ps.status,
      'payout_account_guard_enabled', true,
      'payout_account_id', guard.payout_account_id,
      'payout_account_eligible', coalesce(guard.eligible, false),
      'payout_account_guard_reason', guard.reason,
      'ownership_match', coalesce(guard.ownership_match, false),
      'ownership_verification_status', guard.ownership_verification_status,
      'kyc_tax_id_status', guard.kyc_tax_id_status,
      'real_payout_execution_enabled', false
    )
  from public.provider_settlements ps
  left join public.svc_providers sp on sp.id = ps.provider_id
  left join lateral public.financial_provider_payout_account_guard(ps.provider_id) guard on true
  where ps.batch_id = p_settlement_batch_id
    and ps.status in ('approved','locked','payout_pending')
    and ps.net_amount > 0
  on conflict (payout_key) do nothing;

  insert into public.payout_batch_items (payout_batch_id, payout_id, provider_settlement_id, provider_id, amount, status)
  select v_batch_id, p.id, p.provider_settlement_id, p.provider_id, p.amount, p.status
  from public.payouts p
  where p.batch_id = v_batch_id
  on conflict (payout_batch_id, payout_id) do nothing;

  update public.payout_batches pb
  set provider_count = totals.provider_count,
      payout_count = totals.payout_count,
      gross_amount = totals.gross_amount,
      net_amount = totals.net_amount,
      updated_at = now()
  from (
    select
      count(distinct provider_id)::int as provider_count,
      count(*)::int as payout_count,
      coalesce(sum(amount), 0) as gross_amount,
      coalesce(sum(amount), 0) as net_amount
    from public.payouts
    where batch_id = v_batch_id
  ) totals
  where pb.id = v_batch_id;

  return v_batch_id;
end;
$$;

revoke all on function public.financial_create_payout_batch(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.financial_create_payout_batch(uuid,uuid,text) to service_role;

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
  'provider_payout_account.ownership_verification.foundation.20260514163818',
  'provider_payout_account.ownership_verification.foundation_created',
  'system',
  'migration',
  'qa',
  true,
  'excluded_from_accounting',
  jsonb_build_object(
    'tables', jsonb_build_array('provider_payout_account_verifications'),
    'svc_providers_kyc_tax_id_plaintext_stored', false,
    'raw_account_values_exposed', false,
    'raw_verification_response_plaintext_stored', false,
    'manual_observed_tax_id_plaintext_stored', false,
    'manual_observed_tax_id_compares_full_hash', true,
    'manual_name_only_approval_allowed', false,
    'manual_last4_only_approval_allowed', false,
    'payout_real_enabled', false,
    'ledger_touched', false,
    'payout_guard_enabled', true
  )
)
on conflict (event_key) do nothing;

notify pgrst, 'reload schema';

commit;
