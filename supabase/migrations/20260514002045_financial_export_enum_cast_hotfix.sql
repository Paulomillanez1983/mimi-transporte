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
    'ready',
    p_include_tests,
    (case when p_include_tests then 'qa_only' else 'fiscal_reportable' end)::public.financial_fiscal_visibility,
    p_actor_user_id,
    now(),
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

revoke all on function public.financial_create_export_record(text,text,timestamptz,timestamptz,uuid,boolean) from public, anon, authenticated;
grant execute on function public.financial_create_export_record(text,text,timestamptz,timestamptz,uuid,boolean) to service_role;
