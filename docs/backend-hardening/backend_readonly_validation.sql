-- MIMI backend hardening - read-only validation queries
-- Ejecutar antes y despues de cada fase.

-- 1) RPC exposure summary, app functions only.
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
)
select
  count(*) as app_functions_total,
  count(*) filter (where prosecdef) as security_definer_total,
  count(*) filter (where prosecdef and has_function_privilege('anon', oid, 'EXECUTE')) as secdef_anon_execute,
  count(*) filter (where prosecdef and has_function_privilege('authenticated', oid, 'EXECUTE')) as secdef_auth_execute,
  count(*) filter (where prosecdef and (proconfig is null or not exists (select 1 from unnest(proconfig) cfg where cfg like 'search_path=%'))) as secdef_missing_search_path
from app_functions;

-- 2) Sensitive policies.
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where (schemaname, tablename) in (
  ('public','push_tokens'),
  ('public','svc_provider_intents'),
  ('public','svc_requests'),
  ('public','svc_request_offers'),
  ('storage','objects')
)
order by schemaname, tablename, policyname;

-- 3) Stale service requests/offers.
select
  count(*) filter (where r.status in ('SEARCHING','PENDING_PROVIDER_RESPONSE') and r.provider_response_deadline_at < now()) as stale_active_requests,
  count(*) filter (where o.status = 'PENDING' and o.expires_at < now()) as stale_pending_offers
from public.svc_requests r
left join public.svc_request_offers o on o.request_id = r.id;

-- 4) Last service lifecycle rows, no PII.
select
  r.id as request_id,
  r.created_at,
  r.status as request_status,
  r.selected_provider_id,
  r.accepted_provider_id,
  r.provider_response_deadline_at,
  o.id as offer_id,
  o.status as offer_status,
  o.expires_at,
  o.responded_at
from public.svc_requests r
left join public.svc_request_offers o on o.request_id = r.id
order by r.created_at desc
limit 20;

-- 5) Request event coverage.
select event_type, count(*)
from public.svc_request_events
group by event_type
order by event_type;

-- 6) Realtime publication.
select pub.pubname, n.nspname as schema, c.relname as table_name
from pg_publication pub
left join pg_publication_rel pr on pr.prpubid = pub.oid
left join pg_class c on c.oid = pr.prrelid
left join pg_namespace n on n.oid = c.relnamespace
order by pub.pubname, schema, table_name;

