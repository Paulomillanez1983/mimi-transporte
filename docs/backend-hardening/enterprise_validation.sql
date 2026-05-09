-- MIMI enterprise backend validation
-- Run before and after each hardening phase. Returns one consolidated resultset.

with app_functions as (
  select p.oid, p.prosecdef, p.proconfig
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and not exists (
      select 1
      from pg_depend d
      join pg_extension e on e.oid = d.refobjid
      where d.objid = p.oid and d.deptype = 'e'
    )
),
rpc_summary as (
  select
    count(*) as app_functions_total,
    count(*) filter (where prosecdef) as security_definer_total,
    count(*) filter (where prosecdef and has_function_privilege('anon', oid, 'EXECUTE')) as secdef_anon_execute,
    count(*) filter (where prosecdef and has_function_privilege('authenticated', oid, 'EXECUTE')) as secdef_auth_execute,
    count(*) filter (
      where prosecdef
        and (
          proconfig is null
          or not exists (
            select 1
            from unnest(proconfig) cfg
            where cfg like 'search_path=%'
          )
        )
    ) as secdef_missing_search_path
  from app_functions
),
targets(function_identity, mode) as (
  values
    ('public.admin_review_driver(uuid,text,text,uuid)', 'internal'),
    ('public.reset_test_driver(uuid)', 'internal'),
    ('public.seed_test_driver_kyc(uuid,text)', 'internal'),
    ('public.simulate_driver_admin_decision(uuid,text,text)', 'internal'),
    ('public.simulate_driver_kyc_scenario(uuid,text)', 'internal'),
    ('public.dispatch_queue_mark_done(uuid)', 'internal'),
    ('public.dispatch_queue_mark_retry(uuid,text,integer)', 'internal'),
    ('public.dispatch_queue_release_stale_locks()', 'internal'),
    ('public.dispatch_expirar_ofertas_y_liberar_viajes()', 'internal'),
    ('public.svc_create_request_atomic(uuid,uuid,uuid,text,double precision,double precision,text,timestamp with time zone,integer,text)', 'internal'),
    ('public.svc_accept_offer_atomic(uuid,uuid)', 'internal'),
    ('public.svc_cancel_request_atomic(uuid,uuid,text)', 'internal'),
    ('public.svc_complete_service_atomic(uuid,uuid)', 'internal'),
    ('public.svc_search_providers_ranked(uuid,double precision,double precision,text,timestamp with time zone,integer,integer)', 'internal'),
    ('public.svc_expire_stale_service_requests(integer)', 'internal')
),
internal_rpc_execute_matrix as (
  select
    t.function_identity,
    to_regprocedure(t.function_identity) is not null as function_exists,
    case when to_regprocedure(t.function_identity) is null then false else has_function_privilege('anon', to_regprocedure(t.function_identity), 'EXECUTE') end as anon_execute,
    case when to_regprocedure(t.function_identity) is null then false else has_function_privilege('authenticated', to_regprocedure(t.function_identity), 'EXECUTE') end as authenticated_execute,
    case when to_regprocedure(t.function_identity) is null then false else has_function_privilege('service_role', to_regprocedure(t.function_identity), 'EXECUTE') end as service_role_execute
  from targets t
),
policy_risks as (
  select
    count(*) filter (
      where schemaname = 'public'
        and tablename = 'push_tokens'
        and (qual = 'true' or with_check = 'true')
    ) as push_tokens_true_policies,
    count(*) filter (
      where schemaname = 'public'
        and tablename = 'svc_provider_intents'
        and 'public' = any(roles)
    ) as provider_intents_public_policies,
    count(*) filter (
      where schemaname = 'public'
        and tablename = 'svc_request_events'
        and policyname = 'svc_request_events_read_participants_or_admin'
    ) as request_events_participant_policy
  from pg_policies
),
stale_rows as (
  select
    count(*) filter (
      where r.status in ('SEARCHING', 'PENDING_PROVIDER_RESPONSE')
        and r.provider_response_deadline_at < now()
    ) as stale_active_requests,
    count(*) filter (
      where o.status = 'PENDING'
        and o.expires_at < now()
    ) as stale_pending_offers
  from public.svc_requests r
  left join public.svc_request_offers o on o.request_id = r.id
),
event_health as (
  select
    count(*) as total_events,
    count(*) filter (where event_type = 'request_created') as request_created_events,
    count(*) filter (where event_type = 'offer_created') as offer_created_events,
    count(*) filter (where event_type = 'offer_accepted') as offer_accepted_events,
    count(*) filter (where event_type = 'offer_rejected') as offer_rejected_events,
    count(*) filter (where event_type = 'request_cancelled') as request_cancelled_events,
    count(*) filter (where event_type = 'request_started') as request_started_events,
    count(*) filter (where event_type = 'request_completed') as request_completed_events,
    count(*) filter (where event_type = 'request_expired') as request_expired_events,
    count(*) filter (where event_type = 'offer_expired') as offer_expired_events
  from public.svc_request_events
),
realtime_health as (
  select
    count(*) filter (
      where pub.pubname = 'supabase_realtime'
        and n.nspname = 'public'
        and c.relname in (
          'svc_requests',
          'svc_request_offers',
          'svc_tracking',
          'svc_conversations',
          'svc_messages',
          'svc_notifications',
          'viajes',
          'viaje_ofertas'
        )
    ) as required_realtime_tables
  from pg_publication pub
  left join pg_publication_rel pr on pr.prpubid = pub.oid
  left join pg_class c on c.oid = pr.prrelid
  left join pg_namespace n on n.oid = c.relnamespace
)
select *
from (
  select
    'rpc_exposure_summary' as check_name,
    case when secdef_anon_execute = 0 then 'pass' else 'fail_pre_hardening_expected' end as status,
    'secdef_anon_execute' as metric,
    secdef_anon_execute::text as actual,
    '0 after phase 02' as expected
  from rpc_summary
  union all
  select
    'rpc_exposure_summary',
    case when secdef_missing_search_path = 0 then 'pass' else 'fail_pre_hardening_expected' end,
    'secdef_missing_search_path',
    secdef_missing_search_path::text,
    '0 after phase 01'
  from rpc_summary
  union all
  select
    'internal_rpc_execute_matrix',
    case when count(*) filter (where anon_execute or authenticated_execute) = 0 then 'pass' else 'fail_pre_hardening_expected' end,
    'internal_rpc_exposed_count',
    count(*) filter (where anon_execute or authenticated_execute)::text,
    '0 after phase 02'
  from internal_rpc_execute_matrix
  union all
  select
    'internal_rpc_execute_matrix',
    case when count(*) filter (where function_exists and service_role_execute) >= 1 then 'pass' else 'review' end,
    'internal_rpc_service_role_count',
    count(*) filter (where function_exists and service_role_execute)::text,
    'service_role must keep execute'
  from internal_rpc_execute_matrix
  union all
  select
    'rls_push_tokens',
    case when push_tokens_true_policies = 0 then 'pass' else 'fail_pre_hardening_expected' end,
    'push_tokens_true_policies',
    push_tokens_true_policies::text,
    '0 after phase 03'
  from policy_risks
  union all
  select
    'rls_provider_intents',
    case when provider_intents_public_policies = 0 then 'pass' else 'fail_pre_hardening_expected' end,
    'provider_intents_public_policies',
    provider_intents_public_policies::text,
    '0 after phase 03'
  from policy_risks
  union all
  select
    'rls_request_events',
    case when request_events_participant_policy > 0 then 'pass' else 'fail_pre_hardening_expected' end,
    'request_events_participant_policy',
    request_events_participant_policy::text,
    '1 after phase 03'
  from policy_risks
  union all
  select
    'service_expiration',
    case when stale_active_requests = 0 and stale_pending_offers = 0 then 'pass' else 'fail_pre_worker_expected' end,
    'stale_active_requests/stale_pending_offers',
    stale_active_requests::text || '/' || stale_pending_offers::text,
    '0/0 after phase 04 worker run'
  from stale_rows
  union all
  select
    'service_events',
    case when total_events > 0 then 'pass' else 'fail_pre_hardening_expected' end,
    'total_events',
    total_events::text,
    '>0 after phase 04 and flow QA'
  from event_health
  union all
  select
    'realtime',
    case when required_realtime_tables = 8 then 'pass' else 'fail' end,
    'required_realtime_tables',
    required_realtime_tables::text,
    '8'
  from realtime_health
) checks
order by check_name, metric;
