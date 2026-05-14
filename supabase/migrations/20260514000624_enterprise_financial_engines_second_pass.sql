-- MIMI Servicios / MIMI GO
-- Enterprise financial engines second pass.
-- Adds real settlement, payout, reconciliation, wallet rebuild, closing and role foundations.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Admin financial scopes
-- ---------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'admin_users_role_check'
      and conrelid = 'public.admin_users'::regclass
  ) then
    alter table public.admin_users drop constraint admin_users_role_check;
  end if;
end $$;

alter table public.admin_users
  add constraint admin_users_role_check
  check (
    role = any(array[
      'ADMIN','SUPERADMIN','OPS','SUPPORT',
      'FINANCE','FINANCE_ADMIN','AUDITOR','SUPPORT_ADMIN'
    ]::text[])
  );

create or replace function public.financial_admin_role(p_user_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select upper(coalesce(role, ''))
  from public.admin_users
  where user_id = p_user_id
    and active = true
  limit 1
$$;

create or replace function public.is_finance_admin(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.financial_admin_role(p_user_id), '') = any(array['SUPERADMIN','ADMIN','FINANCE','FINANCE_ADMIN'])
$$;

create or replace function public.is_financial_auditor(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.financial_admin_role(p_user_id), '') = any(array['SUPERADMIN','ADMIN','FINANCE','FINANCE_ADMIN','AUDITOR'])
$$;

-- ---------------------------------------------------------------------
-- Schema hardening and enterprise state model
-- ---------------------------------------------------------------------
alter table public.provider_earnings
  add column if not exists payment_id uuid,
  add column if not exists earning_key text,
  add column if not exists provider_settlement_id uuid references public.provider_settlements(id) on delete set null,
  add column if not exists available_at timestamptz,
  add column if not exists trace_id text,
  add column if not exists correlation_id text;

alter table public.platform_revenue
  add column if not exists payment_id uuid,
  add column if not exists revenue_key text,
  add column if not exists revenue_amount numeric(18,2) not null default 0,
  add column if not exists trace_id text,
  add column if not exists correlation_id text;

alter table public.settlement_batches
  add column if not exists calculated_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists failed_reason text,
  add column if not exists trace_id text,
  add column if not exists correlation_id text;

alter table public.provider_settlements
  add column if not exists period_start timestamptz,
  add column if not exists period_end timestamptz,
  add column if not exists approved_by uuid references auth.users(id),
  add column if not exists approved_at timestamptz,
  add column if not exists locked_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists failed_reason text,
  add column if not exists trace_id text,
  add column if not exists correlation_id text;

alter table public.payouts
  add column if not exists batch_id uuid,
  add column if not exists idempotency_key text,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists failure_code text,
  add column if not exists failure_reason text,
  add column if not exists paid_at timestamptz,
  add column if not exists trace_id text,
  add column if not exists correlation_id text,
  add column if not exists actor_user_id uuid references auth.users(id) on delete set null;

alter table public.refunds
  add column if not exists idempotency_key text,
  add column if not exists actor_user_id uuid references auth.users(id) on delete set null,
  add column if not exists evidence_url text,
  add column if not exists provider_settlement_id uuid references public.provider_settlements(id) on delete set null;

alter table public.payment_processor_events
  add column if not exists event_hash text,
  add column if not exists received_at timestamptz not null default now(),
  add column if not exists dead_letter boolean not null default false,
  add column if not exists dead_letter_reason text,
  add column if not exists out_of_order boolean not null default false,
  add column if not exists provider_fee_amount numeric(18,2) not null default 0;

alter table public.dispute_events
  add column if not exists dispute_key text,
  add column if not exists evidence_url text,
  add column if not exists provider_id uuid references public.svc_providers(id) on delete set null,
  add column if not exists service_request_id uuid references public.svc_requests(id) on delete set null,
  add column if not exists trace_id text not null default gen_random_uuid()::text,
  add column if not exists correlation_id text not null default gen_random_uuid()::text,
  add column if not exists fiscal_visibility public.financial_fiscal_visibility not null default 'fiscal_reportable';

alter table public.chargeback_events
  add column if not exists chargeback_key text,
  add column if not exists provider_id uuid references public.svc_providers(id) on delete set null,
  add column if not exists service_request_id uuid references public.svc_requests(id) on delete set null,
  add column if not exists trace_id text not null default gen_random_uuid()::text,
  add column if not exists correlation_id text not null default gen_random_uuid()::text,
  add column if not exists fiscal_visibility public.financial_fiscal_visibility not null default 'fiscal_reportable';

alter table public.wallet_balances
  add column if not exists paid_out numeric(18,2) not null default 0,
  add column if not exists reversed numeric(18,2) not null default 0,
  add column if not exists last_rebuild_at timestamptz,
  add column if not exists integrity_status text not null default 'unknown',
  add column if not exists integrity_difference numeric(18,2) not null default 0;

-- Replace early narrow state constraints with the enterprise state model.
do $$
declare
  r record;
begin
  for r in
    select conrelid::regclass as table_name, conname
    from pg_constraint
    where contype = 'c'
      and conrelid in (
        'public.settlement_batches'::regclass,
        'public.provider_settlements'::regclass,
        'public.payouts'::regclass,
        'public.provider_earnings'::regclass,
        'public.accounting_periods'::regclass
      )
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table %s drop constraint %I', r.table_name, r.conname);
  end loop;
end $$;

alter table public.settlement_batches
  add constraint settlement_batches_status_enterprise_chk
  check (status in ('draft','calculating','calculated','pending_review','approved','locked','paid','failed','reversed','cancelled'));

alter table public.provider_settlements
  add constraint provider_settlements_status_enterprise_chk
  check (status in ('draft','calculating','calculated','pending_review','approved','locked','payout_pending','paid','failed','reversed','cancelled','on_hold','disputed'));

alter table public.payouts
  add constraint payouts_status_enterprise_chk
  check (status in ('pending','processing','paid','failed','cancelled','reversed','on_hold','disputed','sent'));

alter table public.provider_earnings
  add constraint provider_earnings_status_enterprise_chk
  check (status in ('pending','earned','available','reserved','settled','paid','reversed','disputed','refunded','adjusted'));

alter table public.accounting_periods
  add constraint accounting_periods_status_enterprise_chk
  check (status in ('open','pending_reconciliation','ready_to_close','closed','locked','reopened_exception','closing','reopened'));

-- ---------------------------------------------------------------------
-- Engine tables
-- ---------------------------------------------------------------------
create table if not exists public.settlement_items (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.provider_settlements(id) on delete cascade,
  batch_id uuid not null references public.settlement_batches(id) on delete cascade,
  provider_earning_id uuid references public.provider_earnings(id) on delete set null,
  payment_id uuid,
  service_request_id uuid references public.svc_requests(id) on delete set null,
  provider_id uuid not null references public.svc_providers(id) on delete cascade,
  item_type text not null default 'earning' check (item_type in ('earning','refund','adjustment','chargeback','fee','tax')),
  gross_amount numeric(18,2) not null default 0,
  commission_amount numeric(18,2) not null default 0,
  psp_fee_amount numeric(18,2) not null default 0,
  refund_amount numeric(18,2) not null default 0,
  adjustment_amount numeric(18,2) not null default 0,
  net_amount numeric(18,2) not null default 0,
  currency text not null default 'ARS',
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  fiscal_visibility public.financial_fiscal_visibility not null default 'fiscal_reportable',
  trace_id text not null default gen_random_uuid()::text,
  correlation_id text not null default gen_random_uuid()::text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (settlement_id, provider_earning_id, item_type)
);

create table if not exists public.payout_batches (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.financial_ledgers(id),
  batch_key text not null,
  settlement_batch_id uuid references public.settlement_batches(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','processing','paid','failed','cancelled','reversed','on_hold','disputed')),
  provider_count integer not null default 0,
  payout_count integer not null default 0,
  gross_amount numeric(18,2) not null default 0,
  net_amount numeric(18,2) not null default 0,
  currency text not null default 'ARS',
  scheduled_for timestamptz,
  processed_at timestamptz,
  actor_user_id uuid references auth.users(id) on delete set null,
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  fiscal_visibility public.financial_fiscal_visibility not null default 'fiscal_reportable',
  trace_id text not null default gen_random_uuid()::text,
  correlation_id text not null default gen_random_uuid()::text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ledger_id, batch_key)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'payouts_batch_id_fkey'
      and conrelid = 'public.payouts'::regclass
  ) then
    alter table public.payouts
      add constraint payouts_batch_id_fkey
      foreign key (batch_id) references public.payout_batches(id) on delete set null;
  end if;
end $$;

create table if not exists public.payout_batch_items (
  id uuid primary key default gen_random_uuid(),
  payout_batch_id uuid not null references public.payout_batches(id) on delete cascade,
  payout_id uuid not null references public.payouts(id) on delete cascade,
  provider_settlement_id uuid references public.provider_settlements(id) on delete set null,
  provider_id uuid references public.svc_providers(id) on delete set null,
  amount numeric(18,2) not null default 0,
  status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (payout_batch_id, payout_id)
);

create table if not exists public.reconciliation_items (
  id uuid primary key default gen_random_uuid(),
  reconciliation_report_id uuid not null references public.reconciliation_reports(id) on delete cascade,
  item_key text not null,
  item_type text not null check (item_type in ('payment','refund','payout','fee','chargeback','dispute','ledger','test_data')),
  internal_reference text,
  external_reference text,
  payment_id uuid,
  payout_id uuid references public.payouts(id) on delete set null,
  refund_id uuid,
  internal_amount numeric(18,2) not null default 0,
  external_amount numeric(18,2) not null default 0,
  difference_amount numeric(18,2) not null default 0,
  discrepancy_status text not null default 'matched'
    check (discrepancy_status in ('matched','mismatch','missing_internal','missing_external','duplicate','orphan','resolved','ignored_with_reason')),
  severity text not null default 'info' check (severity in ('info','low','medium','high','critical')),
  suggested_resolution text,
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  environment public.financial_environment not null default 'production',
  is_test boolean not null default false,
  fiscal_visibility public.financial_fiscal_visibility not null default 'fiscal_reportable',
  trace_id text not null default gen_random_uuid()::text,
  correlation_id text not null default gen_random_uuid()::text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (reconciliation_report_id, item_key)
);

create table if not exists public.financial_dead_letters (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  event_key text not null,
  reason text not null,
  payload jsonb not null default '{}'::jsonb,
  retry_count integer not null default 0,
  resolved boolean not null default false,
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  trace_id text not null default gen_random_uuid()::text,
  correlation_id text not null default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  unique (source, event_key)
);

-- ---------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------
create unique index if not exists ux_provider_earnings_earning_key on public.provider_earnings(earning_key) where earning_key is not null;
create index if not exists idx_provider_earnings_period on public.provider_earnings(created_at, provider_id, status, environment, is_test, fiscal_visibility);
create unique index if not exists ux_platform_revenue_revenue_key on public.platform_revenue(revenue_key) where revenue_key is not null;
create index if not exists idx_platform_revenue_payment on public.platform_revenue(payment_id, service_request_id);
create index if not exists idx_settlement_items_provider_period on public.settlement_items(provider_id, created_at, item_type);
create index if not exists idx_reconciliation_items_report_status on public.reconciliation_items(reconciliation_report_id, discrepancy_status, severity);
create index if not exists idx_payout_batches_settlement on public.payout_batches(settlement_batch_id, status);
create unique index if not exists ux_payouts_idempotency_key on public.payouts(idempotency_key) where idempotency_key is not null;
create index if not exists idx_payment_processor_events_processing on public.payment_processor_events(processed, dead_letter, provider_name, received_at desc);
create unique index if not exists ux_payment_processor_events_hash on public.payment_processor_events(provider_name, event_hash) where event_hash is not null;
create unique index if not exists ux_wallets_provider_actor_not_null on public.wallets(ledger_id, provider_id, currency) where provider_id is not null;

-- ---------------------------------------------------------------------
-- Guard fiscal posting into closed periods
-- ---------------------------------------------------------------------
create or replace function public.financial_prevent_closed_period_posting()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_test = false and new.fiscal_visibility = 'fiscal_reportable' then
    if exists (
      select 1
      from public.accounting_periods ap
      where ap.ledger_id = new.ledger_id
        and ap.status in ('closed','locked')
        and new.posted_at::date between ap.period_start and ap.period_end
    ) then
      raise exception 'FINANCIAL_PERIOD_CLOSED: use a compensating adjustment in the current open period';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_financial_prevent_closed_period_posting on public.financial_transactions;
create trigger trg_financial_prevent_closed_period_posting
before insert on public.financial_transactions
for each row execute function public.financial_prevent_closed_period_posting();

-- ---------------------------------------------------------------------
-- Settlement engine
-- ---------------------------------------------------------------------
create or replace function public.financial_calculate_settlement_batch(
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_settlement_type text default 'weekly',
  p_actor_user_id uuid default null,
  p_include_tests boolean default false,
  p_batch_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ledger public.financial_ledgers%rowtype;
  v_batch_id uuid;
  v_batch_key text := coalesce(p_batch_key, 'settlement:' || p_settlement_type || ':' || to_char(p_period_start, 'YYYYMMDDHH24MISS') || ':' || to_char(p_period_end, 'YYYYMMDDHH24MISS') || ':' || case when p_include_tests then 'test' else 'prod' end);
  v_trace_id text := gen_random_uuid()::text;
  v_correlation_id text := gen_random_uuid()::text;
  v_rec record;
begin
  if p_period_start >= p_period_end then
    raise exception 'FINANCIAL_INVALID_PERIOD';
  end if;

  select * into v_ledger
  from public.financial_ledgers
  where code = case when p_include_tests then 'test_financial_ledger' else 'operational_financial_ledger' end;

  if not found then
    raise exception 'FINANCIAL_LEDGER_NOT_FOUND';
  end if;

  select id into v_batch_id
  from public.settlement_batches
  where ledger_id = v_ledger.id
    and batch_key = v_batch_key
  for update;

  if v_batch_id is not null then
    if exists (
      select 1 from public.settlement_batches
      where id = v_batch_id
        and status in ('approved','locked','paid','reversed','cancelled')
    ) then
      raise exception 'FINANCIAL_SETTLEMENT_BATCH_LOCKED';
    end if;

    delete from public.settlement_items where batch_id = v_batch_id;
    delete from public.provider_settlements where batch_id = v_batch_id;
    update public.settlement_batches
    set status = 'calculating',
        provider_count = 0,
        gross_amount = 0,
        commission_amount = 0,
        psp_fee_amount = 0,
        tax_amount = 0,
        adjustment_amount = 0,
        net_amount = 0,
        calculated_at = null,
        updated_at = now()
    where id = v_batch_id;
  else
    insert into public.settlement_batches (
      ledger_id, batch_key, settlement_type, period_start, period_end, status,
      currency, environment, is_test, fiscal_visibility, trace_id, correlation_id,
      metadata
    )
    values (
      v_ledger.id, v_batch_key, p_settlement_type, p_period_start, p_period_end, 'calculating',
      v_ledger.currency, v_ledger.environment, v_ledger.is_test, v_ledger.fiscal_visibility,
      v_trace_id, v_correlation_id,
      jsonb_build_object('include_tests', p_include_tests, 'actor_user_id', p_actor_user_id)
    )
    returning id into v_batch_id;
  end if;

  for v_rec in
    select
      pe.provider_id,
      count(*)::int as service_count,
      coalesce(sum(pe.gross_amount), 0) as gross_amount,
      coalesce(sum(pe.commission_amount), 0) as commission_amount,
      coalesce(sum(pe.psp_fee_amount), 0) as psp_fee_amount,
      coalesce(sum(pe.tax_amount), 0) as tax_amount,
      coalesce(sum(pe.adjustment_amount), 0) as adjustment_amount,
      coalesce(sum(pe.net_amount), 0) as net_amount
    from public.provider_earnings pe
    where pe.created_at >= p_period_start
      and pe.created_at < p_period_end
      and pe.status in ('pending','earned','available','adjusted')
      and (p_include_tests or (pe.is_test = false and pe.fiscal_visibility = 'fiscal_reportable'))
      and not exists (
        select 1 from public.settlement_items si
        where si.provider_earning_id = pe.id
      )
    group by pe.provider_id
  loop
    insert into public.provider_settlements (
      batch_id, ledger_id, provider_id, status, service_count,
      gross_amount, commission_amount, psp_fee_amount, tax_amount, adjustment_amount, net_amount,
      currency, period_start, period_end, environment, is_test, fiscal_visibility, trace_id, correlation_id,
      metadata
    )
    values (
      v_batch_id, v_ledger.id, v_rec.provider_id, 'calculated', v_rec.service_count,
      v_rec.gross_amount, v_rec.commission_amount, v_rec.psp_fee_amount, v_rec.tax_amount, v_rec.adjustment_amount, v_rec.net_amount,
      v_ledger.currency, p_period_start, p_period_end, v_ledger.environment, v_ledger.is_test, v_ledger.fiscal_visibility, v_trace_id, v_correlation_id,
      jsonb_build_object('calculated_by', p_actor_user_id)
    );
  end loop;

  insert into public.settlement_items (
    settlement_id, batch_id, provider_earning_id, payment_id, service_request_id, provider_id,
    item_type, gross_amount, commission_amount, psp_fee_amount, adjustment_amount, net_amount,
    currency, environment, is_test, fiscal_visibility, trace_id, correlation_id, metadata
  )
  select
    ps.id, v_batch_id, pe.id, pe.payment_id, pe.service_request_id, pe.provider_id,
    'earning', pe.gross_amount, pe.commission_amount, pe.psp_fee_amount, pe.adjustment_amount, pe.net_amount,
    pe.currency, pe.environment, pe.is_test, pe.fiscal_visibility, coalesce(pe.trace_id, v_trace_id), coalesce(pe.correlation_id, v_correlation_id),
    jsonb_build_object('earning_status', pe.status)
  from public.provider_earnings pe
  join public.provider_settlements ps
    on ps.batch_id = v_batch_id
   and ps.provider_id = pe.provider_id
  where pe.created_at >= p_period_start
    and pe.created_at < p_period_end
    and pe.status in ('pending','earned','available','adjusted')
    and (p_include_tests or (pe.is_test = false and pe.fiscal_visibility = 'fiscal_reportable'))
    and not exists (
      select 1 from public.settlement_items si
      where si.provider_earning_id = pe.id
    );

  update public.provider_settlements ps
  set refund_amount = coalesce(r.refund_amount, 0),
      net_amount = ps.net_amount - coalesce(r.refund_amount, 0),
      updated_at = now()
  from (
    select p.provider_id, coalesce(sum(r.amount), 0) as refund_amount
    from public.refunds r
    join public.payments p on p.id = r.payment_id
    where r.created_at >= p_period_start
      and r.created_at < p_period_end
      and (p_include_tests or (coalesce(r.is_test, false) = false and coalesce(r.fiscal_visibility, 'fiscal_reportable') = 'fiscal_reportable'))
    group by p.provider_id
  ) r
  where ps.batch_id = v_batch_id
    and ps.provider_id = r.provider_id;

  update public.settlement_batches sb
  set status = 'calculated',
      provider_count = totals.provider_count,
      gross_amount = totals.gross_amount,
      commission_amount = totals.commission_amount,
      psp_fee_amount = totals.psp_fee_amount,
      tax_amount = totals.tax_amount,
      adjustment_amount = totals.adjustment_amount,
      net_amount = totals.net_amount,
      calculated_at = now(),
      updated_at = now()
  from (
    select
      count(*)::int as provider_count,
      coalesce(sum(gross_amount), 0) as gross_amount,
      coalesce(sum(commission_amount), 0) as commission_amount,
      coalesce(sum(psp_fee_amount), 0) as psp_fee_amount,
      coalesce(sum(tax_amount), 0) as tax_amount,
      coalesce(sum(adjustment_amount), 0) as adjustment_amount,
      coalesce(sum(net_amount), 0) as net_amount
    from public.provider_settlements
    where batch_id = v_batch_id
  ) totals
  where sb.id = v_batch_id;

  insert into public.audit_financial_events (
    ledger_id, event_key, event_type, actor_user_id, actor_type, source, settlement_id,
    after_snapshot, trace_id, correlation_id, environment, is_test, fiscal_visibility, metadata
  )
  values (
    v_ledger.id,
    'settlement.batch.calculated:' || v_batch_id::text,
    'settlement.batch.calculated',
    p_actor_user_id,
    'admin',
    'financial_calculate_settlement_batch',
    v_batch_id,
    (select to_jsonb(sb) from public.settlement_batches sb where sb.id = v_batch_id),
    v_trace_id,
    v_correlation_id,
    v_ledger.environment,
    v_ledger.is_test,
    'excluded_from_accounting',
    jsonb_build_object('period_start', p_period_start, 'period_end', p_period_end)
  )
  on conflict (event_key) do nothing;

  return v_batch_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Payout engine
-- ---------------------------------------------------------------------
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
    jsonb_build_object('source', 'financial_create_payout_batch')
  )
  returning id into v_batch_id;

  insert into public.payouts (
    provider_settlement_id, provider_id, batch_id, payout_key, idempotency_key,
    amount, currency, status, scheduled_for, environment, is_test, fiscal_visibility,
    actor_user_id, trace_id, correlation_id, metadata
  )
  select
    ps.id,
    ps.provider_id,
    v_batch_id,
    'payout:' || ps.id::text,
    'payout:' || ps.id::text,
    greatest(ps.net_amount, 0),
    ps.currency,
    case
      when coalesce(sp.approved, false) = false or coalesce(sp.blocked, false) = true then 'on_hold'
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
      'settlement_status', ps.status
    )
  from public.provider_settlements ps
  left join public.svc_providers sp on sp.id = ps.provider_id
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

create or replace function public.financial_approve_settlement_batch(
  p_settlement_batch_id uuid,
  p_actor_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.settlement_batches%rowtype;
begin
  select * into v_batch
  from public.settlement_batches
  where id = p_settlement_batch_id
  for update;

  if not found then
    raise exception 'FINANCIAL_SETTLEMENT_BATCH_NOT_FOUND';
  end if;

  if v_batch.status not in ('calculated','pending_review','approved') then
    raise exception 'FINANCIAL_SETTLEMENT_BATCH_NOT_APPROVABLE status=%', v_batch.status;
  end if;

  update public.settlement_batches
  set status = 'approved',
      approved_by = p_actor_user_id,
      approved_at = coalesce(approved_at, now()),
      updated_at = now()
  where id = p_settlement_batch_id;

  update public.provider_settlements
  set status = 'approved',
      approved_by = p_actor_user_id,
      approved_at = coalesce(approved_at, now()),
      updated_at = now()
  where batch_id = p_settlement_batch_id
    and status in ('calculated','pending_review','approved');

  insert into public.audit_financial_events (
    ledger_id, event_key, event_type, actor_user_id, actor_type, source, settlement_id,
    after_snapshot, trace_id, correlation_id, environment, is_test, fiscal_visibility, metadata
  )
  values (
    v_batch.ledger_id,
    'settlement.batch.approved:' || p_settlement_batch_id::text,
    'settlement.batch.approved',
    p_actor_user_id,
    'admin',
    'financial_approve_settlement_batch',
    p_settlement_batch_id,
    (select to_jsonb(sb) from public.settlement_batches sb where sb.id = p_settlement_batch_id),
    coalesce(v_batch.trace_id, gen_random_uuid()::text),
    coalesce(v_batch.correlation_id, gen_random_uuid()::text),
    v_batch.environment,
    v_batch.is_test,
    'excluded_from_accounting',
    '{}'::jsonb
  )
  on conflict (event_key) do nothing;

  return p_settlement_batch_id;
end;
$$;

create or replace function public.financial_mark_payout_paid(
  p_payout_id uuid,
  p_actor_user_id uuid default null,
  p_provider_event_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payout public.payouts%rowtype;
  v_tx_id uuid;
  v_event_id text := coalesce(p_provider_event_id, 'manual-paid:' || p_payout_id::text);
begin
  select * into v_payout
  from public.payouts
  where id = p_payout_id
  for update;

  if not found then
    raise exception 'FINANCIAL_PAYOUT_NOT_FOUND';
  end if;

  if v_payout.status = 'paid' then
    select id into v_tx_id
    from public.financial_transactions
    where idempotency_key = 'payout.paid:' || p_payout_id::text || ':' || v_event_id
    limit 1;
    return v_tx_id;
  end if;

  if v_payout.status not in ('pending','processing','sent') then
    raise exception 'FINANCIAL_PAYOUT_NOT_PAYABLE status=%', v_payout.status;
  end if;

  v_tx_id := public.financial_post_transaction(
    case when v_payout.is_test then 'test_financial_ledger' else 'operational_financial_ledger' end,
    'payout.paid:' || p_payout_id::text,
    'payout.paid',
    'Pago liquidado al prestador',
    v_payout.currency,
    'payout.paid:' || p_payout_id::text || ':' || v_event_id,
    jsonb_build_array(
      jsonb_build_object('account_code','provider_payable_ars','entry_side','debit','amount',v_payout.amount,'provider_id',v_payout.provider_id,'description','Reduccion payable prestador por payout'),
      jsonb_build_object('account_code','cash_psp_ars','entry_side','credit','amount',v_payout.amount,'provider_id',v_payout.provider_id,'description','Salida de fondos por payout')
    ),
    jsonb_build_object(
      'source','financial_mark_payout_paid',
      'provider_id', v_payout.provider_id,
      'settlement_id', v_payout.provider_settlement_id,
      'payout_id', p_payout_id,
      'actor_user_id', p_actor_user_id,
      'environment', v_payout.environment,
      'is_test', v_payout.is_test,
      'fiscal_visibility', v_payout.fiscal_visibility,
      'trace_id', coalesce(v_payout.trace_id, gen_random_uuid()::text),
      'correlation_id', coalesce(v_payout.correlation_id, v_event_id)
    )
  );

  update public.payouts
  set status = 'paid',
      processed_at = now(),
      paid_at = now(),
      attempt_count = attempt_count + 1,
      updated_at = now()
  where id = p_payout_id;

  insert into public.payout_events (
    payout_id, provider_event_id, event_type, status, payload,
    trace_id, correlation_id, environment, is_test
  )
  values (
    p_payout_id, v_event_id, 'payout.paid', 'paid',
    jsonb_build_object('actor_user_id', p_actor_user_id, 'financial_transaction_id', v_tx_id),
    coalesce(v_payout.trace_id, gen_random_uuid()::text),
    coalesce(v_payout.correlation_id, v_event_id),
    v_payout.environment,
    v_payout.is_test
  )
  on conflict do nothing;

  update public.provider_settlements
  set status = 'paid',
      paid_at = now(),
      updated_at = now()
  where id = v_payout.provider_settlement_id;

  perform public.financial_rebuild_provider_wallet(v_payout.provider_id);

  return v_tx_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Wallet engine: provider rebuild from ledger entries
-- ---------------------------------------------------------------------
create or replace function public.financial_rebuild_provider_wallet(p_provider_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ledger_id uuid;
  v_wallet_id uuid;
  v_available numeric(18,2);
  v_paid_out numeric(18,2);
  v_disputed numeric(18,2);
begin
  if p_provider_id is null then
    raise exception 'FINANCIAL_PROVIDER_REQUIRED';
  end if;

  select id into v_ledger_id
  from public.financial_ledgers
  where code = 'operational_financial_ledger';

  select id into v_wallet_id
  from public.wallets
  where ledger_id = v_ledger_id
    and provider_id = p_provider_id
    and currency = 'ARS'
  limit 1;

  if v_wallet_id is null then
    insert into public.wallets (ledger_id, actor_type, provider_id, currency, environment, is_test)
    values (v_ledger_id, 'provider', p_provider_id, 'ARS', 'production', false)
    returning id into v_wallet_id;
  end if;

  select
    coalesce(sum(case when fe.entry_side = 'credit' then fe.amount else -fe.amount end), 0)
  into v_available
  from public.financial_entries fe
  join public.financial_accounts fa on fa.id = fe.account_id
  where fe.ledger_id = v_ledger_id
    and fa.code = 'provider_payable_ars'
    and fe.provider_id = p_provider_id
    and fe.is_test = false
    and fe.fiscal_visibility = 'fiscal_reportable';

  select coalesce(sum(amount), 0)
  into v_paid_out
  from public.payouts
  where provider_id = p_provider_id
    and status = 'paid'
    and is_test = false
    and fiscal_visibility = 'fiscal_reportable';

  select coalesce(sum(amount), 0)
  into v_disputed
  from public.dispute_events
  where provider_id = p_provider_id
    and status in ('opened','under_review')
    and is_test = false
    and fiscal_visibility = 'fiscal_reportable';

  insert into public.wallet_balances (
    wallet_id, ledger_id, available, pending, reserved, disputed, processing, paid_out, reversed,
    currency, last_rebuild_at, integrity_status, integrity_difference, environment, is_test
  )
  values (
    v_wallet_id, v_ledger_id, greatest(v_available - v_disputed, 0), 0, 0, v_disputed, 0, v_paid_out, 0,
    'ARS', now(), 'ok', 0, 'production', false
  )
  on conflict (wallet_id, currency) do update
  set available = excluded.available,
      disputed = excluded.disputed,
      paid_out = excluded.paid_out,
      last_rebuild_at = now(),
      integrity_status = 'ok',
      integrity_difference = 0,
      updated_at = now();

  return v_wallet_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Reconciliation engine
-- ---------------------------------------------------------------------
create or replace function public.financial_run_reconciliation(
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_report_type text default 'psp',
  p_actor_user_id uuid default null,
  p_include_tests boolean default false,
  p_report_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ledger public.financial_ledgers%rowtype;
  v_report_id uuid;
  v_key text := coalesce(p_report_key, 'reconciliation:' || p_report_type || ':' || to_char(p_period_start, 'YYYYMMDDHH24MISS') || ':' || to_char(p_period_end, 'YYYYMMDDHH24MISS') || ':' || case when p_include_tests then 'test' else 'prod' end);
  v_diff_count integer;
  v_total_internal numeric(18,2);
  v_total_external numeric(18,2);
begin
  select * into v_ledger
  from public.financial_ledgers
  where code = case when p_include_tests then 'test_financial_ledger' else 'operational_financial_ledger' end;

  insert into public.reconciliation_reports (
    ledger_id, report_key, report_type, period_start, period_end, status,
    environment, is_test, include_tests, fiscal_visibility, metadata
  )
  values (
    v_ledger.id, v_key, p_report_type, p_period_start, p_period_end, 'running',
    v_ledger.environment, v_ledger.is_test, p_include_tests, v_ledger.fiscal_visibility,
    jsonb_build_object('actor_user_id', p_actor_user_id)
  )
  on conflict (ledger_id, report_key) do update
  set status = 'running',
      updated_at = now()
  returning id into v_report_id;

  delete from public.reconciliation_items where reconciliation_report_id = v_report_id;

  insert into public.reconciliation_items (
    reconciliation_report_id, item_key, item_type, internal_reference, external_reference,
    payment_id, internal_amount, external_amount, difference_amount,
    discrepancy_status, severity, suggested_resolution, environment, is_test, fiscal_visibility, metadata
  )
  select
    v_report_id,
    'payment:' || coalesce(p.id::text, ppe.provider_payment_id, ppe.provider_event_id, gen_random_uuid()::text),
    'payment',
    p.id::text,
    ppe.provider_payment_id,
    p.id,
    coalesce(p.total_amount, 0),
    coalesce(ppe.amount, 0),
    coalesce(p.total_amount, 0) - coalesce(ppe.amount, 0),
    case
      when p.id is null then 'orphan'
      when ppe.id is null then 'missing_external'
      when abs(coalesce(p.total_amount, 0) - coalesce(ppe.amount, 0)) > 0.01 then 'mismatch'
      else 'matched'
    end,
    case
      when p.id is null or ppe.id is null then 'high'
      when abs(coalesce(p.total_amount, 0) - coalesce(ppe.amount, 0)) > 0.01 then 'medium'
      else 'info'
    end,
    case
      when p.id is null then 'Evento PSP sin pago interno: revisar provider_payment_id y registrar dead-letter si es fraude.'
      when ppe.id is null then 'Pago interno sin evento PSP: consultar PSP y cargar evento externo faltante.'
      when abs(coalesce(p.total_amount, 0) - coalesce(ppe.amount, 0)) > 0.01 then 'Diferencia de monto: revisar fee, refund parcial o payload PSP.'
      else 'Sin accion.'
    end,
    coalesce(ppe.environment, 'production'),
    coalesce(ppe.is_test, false),
    coalesce(ppe.fiscal_visibility, 'fiscal_reportable'),
    jsonb_build_object('payment_status', p.status, 'processor_status', ppe.normalized_status)
  from public.payment_processor_events ppe
  full join public.payments p
    on p.provider_payment_id = ppe.provider_payment_id
  where coalesce(ppe.received_at, p.created_at) >= p_period_start
    and coalesce(ppe.received_at, p.created_at) < p_period_end
    and (p_include_tests or coalesce(ppe.is_test, false) = false);

  insert into public.reconciliation_items (
    reconciliation_report_id, item_key, item_type, payout_id, internal_reference,
    internal_amount, external_amount, difference_amount, discrepancy_status, severity,
    suggested_resolution, environment, is_test, fiscal_visibility
  )
  select
    v_report_id,
    'payout:' || p.id::text,
    'payout',
    p.id,
    p.payout_key,
    p.amount,
    case when p.status = 'paid' then p.amount else 0 end,
    case when p.status = 'paid' then 0 else p.amount end,
    case when p.status = 'paid' then 'matched' else 'missing_external' end,
    case when p.status = 'paid' then 'info' else 'medium' end,
    case when p.status = 'paid' then 'Sin accion.' else 'Payout pendiente de confirmacion bancaria/PSP.' end,
    p.environment,
    p.is_test,
    p.fiscal_visibility
  from public.payouts p
  where p.created_at >= p_period_start
    and p.created_at < p_period_end
    and (p_include_tests or (p.is_test = false and p.fiscal_visibility = 'fiscal_reportable'));

  select
    count(*) filter (where discrepancy_status <> 'matched'),
    coalesce(sum(internal_amount), 0),
    coalesce(sum(external_amount), 0)
  into v_diff_count, v_total_internal, v_total_external
  from public.reconciliation_items
  where reconciliation_report_id = v_report_id;

  update public.reconciliation_reports
  set status = case when v_diff_count = 0 then 'matched' else 'differences' end,
      total_internal = v_total_internal,
      total_external = v_total_external,
      difference_amount = v_total_internal - v_total_external,
      differences_count = v_diff_count,
      updated_at = now()
  where id = v_report_id;

  return v_report_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Month-end closing and exports
-- ---------------------------------------------------------------------
create or replace function public.financial_close_accounting_period(
  p_period_key text,
  p_period_start date,
  p_period_end date,
  p_actor_user_id uuid default null,
  p_force boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ledger_id uuid;
  v_period_id uuid;
  v_snapshot_id uuid;
  v_closure_id uuid;
  v_diff_count integer;
  v_data jsonb;
  v_hash text;
begin
  select id into v_ledger_id
  from public.financial_ledgers
  where code = 'operational_financial_ledger';

  if not p_force then
    select coalesce(sum(differences_count), 0)::int
    into v_diff_count
    from public.reconciliation_reports
    where ledger_id = v_ledger_id
      and period_start::date >= p_period_start
      and period_end::date <= p_period_end
      and status = 'differences';

    if coalesce(v_diff_count, 0) > 0 then
      raise exception 'FINANCIAL_PERIOD_HAS_RECONCILIATION_DIFFERENCES';
    end if;
  end if;

  insert into public.accounting_periods (
    ledger_id, period_key, period_start, period_end, status,
    closed_by, closed_at, locked_at, environment, is_test, metadata
  )
  values (
    v_ledger_id, p_period_key, p_period_start, p_period_end, 'closed',
    p_actor_user_id, now(), now(), 'production', false,
    jsonb_build_object('force', p_force)
  )
  on conflict (ledger_id, period_key) do update
  set status = case when accounting_periods.status in ('closed','locked') and p_force = false then accounting_periods.status else 'closed' end,
      closed_by = coalesce(excluded.closed_by, accounting_periods.closed_by),
      closed_at = coalesce(accounting_periods.closed_at, now()),
      locked_at = coalesce(accounting_periods.locked_at, now()),
      updated_at = now()
  returning id into v_period_id;

  select jsonb_build_object(
    'period_key', p_period_key,
    'period_start', p_period_start,
    'period_end', p_period_end,
    'trial_balance', coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb)
  )
  into v_data
  from (
    select
      fa.code,
      fa.account_type,
      coalesce(sum(case when fe.entry_side = 'debit' then fe.amount else 0 end), 0) as debit_total,
      coalesce(sum(case when fe.entry_side = 'credit' then fe.amount else 0 end), 0) as credit_total
    from public.financial_accounts fa
    left join public.financial_entries fe
      on fe.account_id = fa.id
     and fe.created_at::date between p_period_start and p_period_end
     and fe.is_test = false
     and fe.fiscal_visibility = 'fiscal_reportable'
    where fa.ledger_id = v_ledger_id
    group by fa.code, fa.account_type
    order by fa.code
  ) x;

  v_hash := encode(digest(v_data::text, 'sha256'), 'hex');

  insert into public.financial_snapshots (
    ledger_id, snapshot_key, snapshot_type, as_of, data, hash,
    environment, is_test, fiscal_visibility
  )
  values (
    v_ledger_id, 'period-close:' || p_period_key, 'period_close', now(), v_data, v_hash,
    'production', false, 'fiscal_reportable'
  )
  on conflict (ledger_id, snapshot_key) do nothing
  returning id into v_snapshot_id;

  if v_snapshot_id is null then
    select id into v_snapshot_id
    from public.financial_snapshots
    where ledger_id = v_ledger_id
      and snapshot_key = 'period-close:' || p_period_key;
  end if;

  insert into public.monthly_closures (
    accounting_period_id, closure_key, status, ledger_snapshot_id,
    gross_amount, revenue_amount, expense_amount, provider_liability_amount,
    discrepancy_amount, closed_by, closed_at, metadata
  )
  values (
    v_period_id, 'closure:' || p_period_key, 'closed', v_snapshot_id,
    coalesce((select sum(gross_amount) from public.platform_revenue where created_at::date between p_period_start and p_period_end and is_test = false and fiscal_visibility = 'fiscal_reportable'), 0),
    coalesce((select sum(coalesce(revenue_amount, net_amount)) from public.platform_revenue where created_at::date between p_period_start and p_period_end and is_test = false and fiscal_visibility = 'fiscal_reportable'), 0),
    coalesce((select sum(amount) from public.platform_expenses where created_at::date between p_period_start and p_period_end and is_test = false and fiscal_visibility = 'fiscal_reportable'), 0),
    coalesce((select sum(net_amount) from public.provider_earnings where created_at::date between p_period_start and p_period_end and is_test = false and fiscal_visibility = 'fiscal_reportable'), 0),
    0,
    p_actor_user_id,
    now(),
    jsonb_build_object('snapshot_hash', v_hash)
  )
  on conflict (closure_key) do update
  set status = 'closed',
      ledger_snapshot_id = excluded.ledger_snapshot_id,
      metadata = excluded.metadata,
      updated_at = now()
  returning id into v_closure_id;

  return v_closure_id;
end;
$$;

create or replace function public.financial_create_export_record(
  p_export_type text,
  p_format text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_actor_user_id uuid default null,
  p_include_tests boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ledger public.financial_ledgers%rowtype;
  v_export_id uuid;
  v_key text;
begin
  select * into v_ledger
  from public.financial_ledgers
  where code = case when p_include_tests then 'test_financial_ledger' else 'operational_financial_ledger' end;

  v_key := 'export:' || p_export_type || ':' || p_format || ':' || to_char(p_period_start, 'YYYYMMDD') || ':' || to_char(p_period_end, 'YYYYMMDD') || ':' || case when p_include_tests then 'test' else 'prod' end;

  insert into public.financial_exports (
    ledger_id, export_key, export_type, format, period_start, period_end,
    status, include_tests, fiscal_visibility_filter, generated_by, generated_at,
    metadata, environment, is_test
  )
  values (
    v_ledger.id, v_key, p_export_type, p_format, p_period_start, p_period_end,
    'ready', p_include_tests, (case when p_include_tests then 'qa_only' else 'fiscal_reportable' end)::public.financial_fiscal_visibility,
    p_actor_user_id, now(),
    jsonb_build_object(
      'summary', jsonb_build_object(
        'gmv', coalesce((select sum(gross_amount) from public.platform_revenue where created_at >= p_period_start and created_at < p_period_end and (p_include_tests or (is_test = false and fiscal_visibility = 'fiscal_reportable'))), 0),
        'mimi_revenue', coalesce((select sum(coalesce(revenue_amount, net_amount)) from public.platform_revenue where created_at >= p_period_start and created_at < p_period_end and (p_include_tests or (is_test = false and fiscal_visibility = 'fiscal_reportable'))), 0),
        'provider_liability', coalesce((select sum(net_amount) from public.provider_earnings where created_at >= p_period_start and created_at < p_period_end and (p_include_tests or (is_test = false and fiscal_visibility = 'fiscal_reportable'))), 0)
      )
    ),
    v_ledger.environment,
    v_ledger.is_test
  )
  on conflict (ledger_id, export_key) do update
  set status = 'ready',
      generated_by = excluded.generated_by,
      generated_at = now(),
      metadata = excluded.metadata,
      updated_at = now()
  returning id into v_export_id;

  return v_export_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Role-safe financial views
-- ---------------------------------------------------------------------
create or replace view public.provider_financial_history
with (security_invoker = true) as
select
  pe.id,
  pe.provider_id,
  pe.service_request_id,
  pe.payment_id,
  pe.gross_amount,
  pe.commission_amount,
  pe.psp_fee_amount,
  pe.adjustment_amount,
  pe.net_amount,
  pe.currency,
  pe.status,
  ps.id as provider_settlement_id,
  ps.status as settlement_status,
  ps.period_start,
  ps.period_end,
  p.id as payout_id,
  p.status as payout_status,
  p.paid_at,
  pe.created_at
from public.provider_earnings pe
left join public.settlement_items si on si.provider_earning_id = pe.id
left join public.provider_settlements ps on ps.id = si.settlement_id
left join public.payouts p on p.provider_settlement_id = ps.id
where pe.is_test = false
  and pe.fiscal_visibility = 'fiscal_reportable';

create or replace view public.client_financial_history
with (security_invoker = true) as
select
  p.id as payment_id,
  p.customer_id as client_user_id,
  p.context_type,
  p.context_id,
  p.status as payment_status,
  p.total_amount,
  p.currency,
  p.provider_name,
  p.provider_payment_id,
  p.created_at,
  p.approved_at,
  p.cancelled_at,
  p.refunded_at,
  coalesce(sum(r.amount), 0) as refunded_amount,
  max(r.status) as refund_status
from public.payments p
left join public.refunds r on r.payment_id = p.id
group by p.id;

-- ---------------------------------------------------------------------
-- RLS/grants
-- ---------------------------------------------------------------------
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'settlement_items','payout_batches','payout_batch_items','reconciliation_items','financial_dead_letters'
  ]
  loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', tbl);
    execute format('drop policy if exists financial_admin_read on public.%I', tbl);
    execute format('create policy financial_admin_read on public.%I for select to authenticated using (public.is_financial_auditor(auth.uid()))', tbl);
  end loop;
end $$;

drop policy if exists settlement_items_provider_read on public.settlement_items;
create policy settlement_items_provider_read on public.settlement_items
for select to authenticated
using (provider_id = public.mimi_current_service_provider_id() or public.is_financial_auditor(auth.uid()));

drop policy if exists payout_batches_finance_read on public.payout_batches;
create policy payout_batches_finance_read on public.payout_batches
for select to authenticated
using (public.is_financial_auditor(auth.uid()));

grant select on public.provider_financial_history to authenticated;
grant select on public.client_financial_history to authenticated;

revoke all on function public.financial_admin_role(uuid) from public, anon;
revoke all on function public.is_finance_admin(uuid) from public, anon;
revoke all on function public.is_financial_auditor(uuid) from public, anon;
grant execute on function public.financial_admin_role(uuid) to authenticated, service_role;
grant execute on function public.is_finance_admin(uuid) to authenticated, service_role;
grant execute on function public.is_financial_auditor(uuid) to authenticated, service_role;

revoke all on function public.financial_calculate_settlement_batch(timestamptz,timestamptz,text,uuid,boolean,text) from public, anon, authenticated;
revoke all on function public.financial_create_payout_batch(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.financial_approve_settlement_batch(uuid,uuid) from public, anon, authenticated;
revoke all on function public.financial_mark_payout_paid(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.financial_rebuild_provider_wallet(uuid) from public, anon, authenticated;
revoke all on function public.financial_run_reconciliation(timestamptz,timestamptz,text,uuid,boolean,text) from public, anon, authenticated;
revoke all on function public.financial_close_accounting_period(text,date,date,uuid,boolean) from public, anon, authenticated;
revoke all on function public.financial_create_export_record(text,text,timestamptz,timestamptz,uuid,boolean) from public, anon, authenticated;

grant execute on function public.financial_calculate_settlement_batch(timestamptz,timestamptz,text,uuid,boolean,text) to service_role;
grant execute on function public.financial_create_payout_batch(uuid,uuid,text) to service_role;
grant execute on function public.financial_approve_settlement_batch(uuid,uuid) to service_role;
grant execute on function public.financial_mark_payout_paid(uuid,uuid,text) to service_role;
grant execute on function public.financial_rebuild_provider_wallet(uuid) to service_role;
grant execute on function public.financial_run_reconciliation(timestamptz,timestamptz,text,uuid,boolean,text) to service_role;
grant execute on function public.financial_close_accounting_period(text,date,date,uuid,boolean) to service_role;
grant execute on function public.financial_create_export_record(text,text,timestamptz,timestamptz,uuid,boolean) to service_role;
