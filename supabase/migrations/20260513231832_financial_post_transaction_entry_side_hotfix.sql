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

    if v_side is null then
      raise exception 'FINANCIAL_ENTRY_SIDE_REQUIRED %', v_entry;
    end if;

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

revoke all on function public.financial_post_transaction(text,text,text,text,text,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.financial_post_transaction(text,text,text,text,text,text,jsonb,jsonb) to service_role;
