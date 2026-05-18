-- MIMIGO Servicios payment + wallet contract hardening.
-- Additive/idempotent only. Keeps real payouts disabled; it only makes the
-- provider-visible wallet snapshot reflect earnings minus payout holds/paid
-- payouts, and recomputes that snapshot whenever payout rows change.

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
  v_available_gross numeric(18,2);
  v_available_net numeric(18,2);
  v_pending numeric(18,2);
  v_platform_fees numeric(18,2);
  v_cash_collected numeric(18,2);
  v_paid_out numeric(18,2);
  v_payout_hold numeric(18,2);
  v_negative numeric(18,2);
  v_limit numeric(18,2);
begin
  if p_provider_id is null then
    raise exception 'PROVIDER_REQUIRED';
  end if;

  v_wallet_id := public.financial_ensure_provider_wallet(
    p_provider_id,
    p_environment,
    p_is_test,
    null,
    case
      when p_is_test then 'excluded_from_accounting'::public.financial_fiscal_visibility
      else 'fiscal_reportable'::public.financial_fiscal_visibility
    end
  );

  select * into v_wallet from public.provider_wallets where id = v_wallet_id for update;
  v_limit := public.financial_get_provider_debt_limit(p_provider_id);

  select coalesce(sum(net_amount), 0)
  into v_available_gross
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

  select coalesce(sum(amount), 0)
  into v_paid_out
  from public.payouts
  where provider_id = p_provider_id
    and status = 'paid'
    and is_test = p_is_test
    and (p_is_test or fiscal_visibility = 'fiscal_reportable');

  select coalesce(sum(amount), 0)
  into v_payout_hold
  from public.payouts
  where provider_id = p_provider_id
    and status in ('pending','processing','sent','on_hold')
    and is_test = p_is_test
    and (p_is_test or fiscal_visibility = 'fiscal_reportable');

  v_available_net := greatest(
    v_available_gross
      - v_paid_out
      - v_payout_hold
      - coalesce(v_wallet.risk_hold_balance, 0)
      - coalesce(v_wallet.cash_debt_balance, 0),
    0
  );
  v_negative := greatest(coalesce(v_wallet.cash_debt_balance, 0) - greatest(v_available_gross - v_paid_out, 0), 0);

  update public.provider_wallets
  set available_balance = v_available_net,
      pending_balance = v_pending,
      negative_balance = v_negative,
      payout_hold_balance = greatest(v_payout_hold, 0),
      cash_debt_limit = v_limit,
      lifetime_earnings = greatest(v_available_gross + v_pending, 0),
      lifetime_platform_fees = greatest(v_platform_fees, 0),
      lifetime_cash_collected = greatest(v_cash_collected, 0),
      wallet_status = case
        when cash_debt_balance > v_limit then 'cash_disabled'
        when risk_level in ('high','critical') then 'review_required'
        else wallet_status
      end,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'paid_out_balance', greatest(v_paid_out, 0),
        'payout_hold_balance', greatest(v_payout_hold, 0),
        'available_gross_before_payouts', greatest(v_available_gross, 0),
        'wallet_contract_version', 'services_payment_wallet_contract_20260518213030'
      ),
      last_activity_at = now(),
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
    'wallet:recompute:payment-wallet-contract:' || v_wallet.id::text || ':' || gen_random_uuid()::text,
    'wallet_recomputed', 'financial_recompute_provider_wallet_foundation',
    0, v_wallet.available_balance, v_wallet.pending_balance, v_wallet.negative_balance,
    v_wallet.cash_debt_balance, v_wallet.risk_hold_balance, v_wallet.payout_hold_balance,
    v_wallet.environment, v_wallet.is_test, v_wallet.fiscal_visibility,
    jsonb_build_object(
      'cash_debt_limit', v_wallet.cash_debt_limit,
      'paid_out_balance', greatest(v_paid_out, 0),
      'payout_hold_balance', greatest(v_payout_hold, 0),
      'contract', 'services_payment_wallet_contract'
    )
  );

  return v_wallet_id;
end;
$$;

create or replace function public.financial_recompute_provider_wallet_after_payout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider_id uuid;
  v_environment public.financial_environment;
  v_is_test boolean;
begin
  if tg_op = 'INSERT' then
    v_provider_id := new.provider_id;
    v_environment := coalesce(new.environment, 'production'::public.financial_environment);
    v_is_test := coalesce(new.is_test, false);
  else
    v_provider_id := coalesce(new.provider_id, old.provider_id);
    v_environment := coalesce(new.environment, old.environment, 'production'::public.financial_environment);
    v_is_test := coalesce(new.is_test, old.is_test, false);
  end if;

  if v_provider_id is not null then
    perform public.financial_recompute_provider_wallet_foundation(v_provider_id, v_environment, v_is_test);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_financial_recompute_provider_wallet_after_payout
  on public.payouts;

create trigger trg_financial_recompute_provider_wallet_after_payout
after insert or update of provider_id, amount, status, environment, is_test, fiscal_visibility
on public.payouts
for each row
execute function public.financial_recompute_provider_wallet_after_payout();

revoke all on function public.financial_recompute_provider_wallet_foundation(uuid, public.financial_environment, boolean)
  from public, anon, authenticated;
revoke all on function public.financial_recompute_provider_wallet_after_payout()
  from public, anon, authenticated;
grant execute on function public.financial_recompute_provider_wallet_foundation(uuid, public.financial_environment, boolean)
  to service_role;
grant execute on function public.financial_recompute_provider_wallet_after_payout()
  to service_role;

insert into public.audit_financial_events (
  event_key, event_type, actor_type, source, after_snapshot,
  trace_id, correlation_id, environment, is_test, fiscal_visibility, metadata
)
values (
  'migration:services_payment_wallet_contract:20260518213030',
  'financial.wallet.payment_wallet_contract_applied',
  'system',
  'migration',
  jsonb_build_object(
    'provider_wallet_subtracts_paid_payouts', true,
    'provider_wallet_subtracts_pending_payout_holds', true,
    'real_payout_execution_enabled', false
  ),
  gen_random_uuid()::text,
  'migration:20260518213030',
  'production',
  false,
  'excluded_from_accounting',
  jsonb_build_object('migration', '20260518213030_services_payment_wallet_contract')
)
on conflict (event_key) do nothing;
