-- MIMI backend hardening - RPC permissions
-- Draft idempotente. Aplicar por fases, no como "big bang".
-- Objetivo: cerrar RPCs internas expuestas por PostgREST sin romper Edge Functions.

begin;

create or replace function pg_temp.harden_rpc_acl(
  p_function_identity text,
  p_mode text
) returns void
language plpgsql
as $$
begin
  execute format('revoke execute on function %s from public', p_function_identity);
  execute format('revoke execute on function %s from anon', p_function_identity);
  execute format('revoke execute on function %s from authenticated', p_function_identity);

  if p_mode = 'internal' then
    execute format('grant execute on function %s to service_role', p_function_identity);
  elsif p_mode = 'authenticated' then
    execute format('grant execute on function %s to authenticated', p_function_identity);
    execute format('grant execute on function %s to service_role', p_function_identity);
  elsif p_mode = 'public_safe' then
    execute format('grant execute on function %s to anon, authenticated, service_role', p_function_identity);
  else
    raise exception 'unknown hardening mode: %', p_mode;
  end if;
exception
  when undefined_function then
    raise notice 'Function not found, skipped: %', p_function_identity;
end;
$$;

-- Grupo A: internal only. Safe si las llamadas pasan por Edge Functions/service_role.
select pg_temp.harden_rpc_acl('public.admin_review_driver(uuid,text,text,uuid)', 'internal');
select pg_temp.harden_rpc_acl('public.reset_test_driver(uuid)', 'internal');
select pg_temp.harden_rpc_acl('public.seed_test_driver_kyc(uuid,text)', 'internal');
select pg_temp.harden_rpc_acl('public.simulate_driver_admin_decision(uuid,text,text)', 'internal');
select pg_temp.harden_rpc_acl('public.simulate_driver_kyc_scenario(uuid,text)', 'internal');

select pg_temp.harden_rpc_acl('public.dispatch_queue_mark_done(uuid)', 'internal');
select pg_temp.harden_rpc_acl('public.dispatch_queue_mark_retry(uuid,text,integer)', 'internal');
select pg_temp.harden_rpc_acl('public.dispatch_queue_release_stale_locks()', 'internal');
select pg_temp.harden_rpc_acl('public.dispatch_expirar_ofertas_y_liberar_viajes()', 'internal');
select pg_temp.harden_rpc_acl('public.sync_dispatch_attempt_count(uuid)', 'internal');

select pg_temp.harden_rpc_acl('public.trg_sync_driver_profile_from_documents()', 'internal');
select pg_temp.harden_rpc_acl('public.trigger_dispatch_after_viaje_insert()', 'internal');
select pg_temp.harden_rpc_acl('public.trigger_dispatch_viaje()', 'internal');
select pg_temp.harden_rpc_acl('public.trigger_verify_identity()', 'internal');
select pg_temp.harden_rpc_acl('public.increment_category_usage()', 'internal');

-- Servicios: hoy el camino correcto es Edge Function + service role.
select pg_temp.harden_rpc_acl('public.svc_create_request_atomic(uuid,uuid,uuid,text,double precision,double precision,text,timestamp with time zone,integer,text)', 'internal');
select pg_temp.harden_rpc_acl('public.svc_accept_offer_atomic(uuid,uuid)', 'internal');
select pg_temp.harden_rpc_acl('public.svc_cancel_request_atomic(uuid,uuid,text)', 'internal');
select pg_temp.harden_rpc_acl('public.svc_complete_service_atomic(uuid,uuid)', 'internal');
select pg_temp.harden_rpc_acl('public.svc_search_providers_ranked(uuid,double precision,double precision,text,timestamp with time zone,integer,integer)', 'internal');

-- Geocoding/address cache: solo Edge Function.
select pg_temp.harden_rpc_acl('public.upsert_address_index(text,text,text,text,text,text,text,jsonb,double precision,double precision,text,numeric)', 'internal');
select pg_temp.harden_rpc_acl('public.upsert_geocoding_feedback(text,text,text,numeric,numeric,jsonb,text,numeric,numeric)', 'internal');

-- Transporte legacy: mantener authenticated hasta migrar a Edge Functions con ownership verificado.
select pg_temp.harden_rpc_acl('public.aceptar_oferta_viaje(uuid,uuid)', 'authenticated');
select pg_temp.harden_rpc_acl('public.rechazar_oferta_viaje(uuid,uuid,text)', 'authenticated');
select pg_temp.harden_rpc_acl('public.iniciar_viaje(uuid,text)', 'authenticated');
select pg_temp.harden_rpc_acl('public.completar_viaje(uuid,text)', 'authenticated');

-- Driver onboarding actual usa RPC directa desde frontend.
select pg_temp.harden_rpc_acl('public.ensure_driver_profile_exists(uuid)', 'authenticated');
select pg_temp.harden_rpc_acl('public.get_driver_onboarding_status()', 'authenticated');
select pg_temp.harden_rpc_acl('public.get_driver_onboarding_status(uuid)', 'authenticated');

-- Helpers usados por RLS: NO quitar authenticated sin reescribir policies.
select pg_temp.harden_rpc_acl('public.is_admin_user(uuid)', 'authenticated');
select pg_temp.harden_rpc_acl('public.mimi_current_driver_id()', 'authenticated');
select pg_temp.harden_rpc_acl('public.mimi_current_service_provider_id()', 'authenticated');
select pg_temp.harden_rpc_acl('public.svc_get_provider_id_by_user(uuid)', 'authenticated');
select pg_temp.harden_rpc_acl('public.svc_is_request_participant(uuid,uuid)', 'authenticated');
select pg_temp.harden_rpc_acl('public.cliente_puede_ver_chofer(uuid)', 'authenticated');

commit;

-- Rollback rapido por funcion si algo rompe:
-- grant execute on function public.nombre(args) to anon, authenticated;

