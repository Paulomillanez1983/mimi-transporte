-- MIMI backend hardening - function search_path
-- Bajo riesgo: fija resolucion de objetos y reduce search_path hijacking.

begin;

create or replace function pg_temp.set_function_search_path(p_function_identity text)
returns void
language plpgsql
as $$
begin
  execute format('alter function %s set search_path = public, pg_temp', p_function_identity);
exception
  when undefined_function then
    raise notice 'Function not found, skipped: %', p_function_identity;
end;
$$;

select pg_temp.set_function_search_path('public.aceptar_oferta_secuencial(uuid,uuid,uuid)');
select pg_temp.set_function_search_path('public.admin_review_driver(uuid,text,text,uuid)');
select pg_temp.set_function_search_path('public.buscar_choferes_cercanos(numeric,numeric,integer,integer)');
select pg_temp.set_function_search_path('public.calcular_precio_viaje(numeric,integer,text)');
select pg_temp.set_function_search_path('public.chofer_mas_cercano(numeric,numeric)');
select pg_temp.set_function_search_path('public.choferes_en_radio(numeric,numeric,numeric)');
select pg_temp.set_function_search_path('public.dispatch_aceptar_oferta_legacy(uuid,uuid)');
select pg_temp.set_function_search_path('public.dispatch_crear_mejor_oferta_legacy(uuid,double precision,integer)');
select pg_temp.set_function_search_path('public.dispatch_crear_mejores_ofertas(uuid,numeric,integer)');
select pg_temp.set_function_search_path('public.dispatch_crear_siguiente_oferta_secuencial(uuid,numeric,integer)');
select pg_temp.set_function_search_path('public.expirar_ofertas_vencidas(uuid)');
select pg_temp.set_function_search_path('public.increment_category_usage()');
select pg_temp.set_function_search_path('public.rechazar_oferta_viaje(uuid,uuid,text)');
select pg_temp.set_function_search_path('public.search_categories_hybrid(text,vector,double precision,integer)');
select pg_temp.set_function_search_path('public.sync_dispatch_attempt_count(uuid)');
select pg_temp.set_function_search_path('public.trigger_dispatch_after_viaje_insert()');
select pg_temp.set_function_search_path('public.update_trip_eta(uuid,integer,integer,integer)');
select pg_temp.set_function_search_path('public.upsert_geocoding_feedback(text,text,text,numeric,numeric,jsonb,text,numeric,numeric)');

-- Invoker/trigger helpers flagged by advisors.
select pg_temp.set_function_search_path('public.svc_accept_offer_atomic(uuid,uuid)');
select pg_temp.set_function_search_path('public.svc_cancel_request_atomic(uuid,uuid,text)');
select pg_temp.set_function_search_path('public.svc_complete_service_atomic(uuid,uuid)');
select pg_temp.set_function_search_path('public.svc_prepare_request_pricing(uuid,uuid,uuid,double precision,double precision,text,timestamp with time zone,integer)');
select pg_temp.set_function_search_path('public.svc_search_providers_ranked(uuid,double precision,double precision,text,timestamp with time zone,integer,integer)');
select pg_temp.set_function_search_path('public.svc_normalize_text(text)');
select pg_temp.set_function_search_path('public.svc_offer_timeout_seconds(text)');
select pg_temp.set_function_search_path('public.svc_requests_apply_offering_defaults()');
select pg_temp.set_function_search_path('public.svc_set_provider_location()');
select pg_temp.set_function_search_path('public.svc_set_request_location()');
select pg_temp.set_function_search_path('public.svc_set_tracking_location()');
select pg_temp.set_function_search_path('public.svc_touch_conversation_last_message()');
select pg_temp.set_function_search_path('public.svc_touch_updated_at()');
select pg_temp.set_function_search_path('public.set_updated_at()');
select pg_temp.set_function_search_path('public.update_updated_at()');
select pg_temp.set_function_search_path('public.update_updated_at_column()');

commit;

