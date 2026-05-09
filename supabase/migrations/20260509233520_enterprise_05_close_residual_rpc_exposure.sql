-- MIMI enterprise hardening phase 05
-- Scope: close residual SECURITY DEFINER execute grants still visible to anon
-- after phases 01-04. This migration is idempotent and does not modify data.

begin;

create or replace function pg_temp.mimi_harden_rpc_acl(
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
    raise exception 'Unknown RPC hardening mode: %', p_mode;
  end if;
exception
  when undefined_function then
    raise notice 'Function not found, skipped: %', p_function_identity;
end;
$$;

-- Transport dispatch functions: these trust ids passed as arguments and must
-- be called only by trusted backend/edge paths, not directly by anon clients.
select pg_temp.mimi_harden_rpc_acl('public.dispatch_aceptar_oferta_legacy(uuid,uuid)', 'internal');
select pg_temp.mimi_harden_rpc_acl('public.dispatch_aceptar_oferta_pro(uuid,uuid)', 'internal');
select pg_temp.mimi_harden_rpc_acl('public.dispatch_crear_mejor_oferta_legacy(uuid,double precision,integer)', 'internal');
select pg_temp.mimi_harden_rpc_acl('public.dispatch_crear_mejores_ofertas(uuid,numeric,integer)', 'internal');
select pg_temp.mimi_harden_rpc_acl('public.dispatch_crear_siguiente_oferta_secuencial(uuid,numeric,integer)', 'internal');
select pg_temp.mimi_harden_rpc_acl('public.dispatch_crear_siguiente_oferta_secuencial_pro(uuid,numeric,integer,integer)', 'internal');
select pg_temp.mimi_harden_rpc_acl('public.dispatch_rechazar_oferta_legacy(uuid,uuid,text)', 'internal');
select pg_temp.mimi_harden_rpc_acl('public.dispatch_rechazar_oferta_pro(uuid,uuid,boolean)', 'internal');
select pg_temp.mimi_harden_rpc_acl('public.dispatch_viaje(uuid)', 'internal');
select pg_temp.mimi_harden_rpc_acl('public.expirar_ofertas_vencidas()', 'internal');
select pg_temp.mimi_harden_rpc_acl('public.expirar_ofertas_vencidas(uuid)', 'internal');

-- Driver/location/helper functions expose operational state and are not public
-- API. Keep them behind edge/backend paths while the app migrates to stricter
-- transport functions.
select pg_temp.mimi_harden_rpc_acl('public.buscar_choferes_cercanos(numeric,numeric,integer,integer)', 'internal');
select pg_temp.mimi_harden_rpc_acl('public.chofer_mas_cercano(numeric,numeric)', 'internal');
select pg_temp.mimi_harden_rpc_acl('public.choferes_en_radio(numeric,numeric,numeric)', 'internal');
select pg_temp.mimi_harden_rpc_acl('public.mark_trip_chat_read(uuid)', 'internal');
select pg_temp.mimi_harden_rpc_acl('public.recalculate_driver_ai_score(uuid)', 'internal');
select pg_temp.mimi_harden_rpc_acl('public.sync_driver_profile_from_documents(uuid)', 'internal');
select pg_temp.mimi_harden_rpc_acl('public.update_trip_eta(uuid,integer,integer,integer)', 'internal');
select pg_temp.mimi_harden_rpc_acl('public.handle_new_user_driver()', 'internal');

-- Support/category helpers should not be callable by anon. Frontend should use
-- authenticated sessions or edge functions with payload validation.
select pg_temp.mimi_harden_rpc_acl('public.crear_ticket_soporte(text,text,text,text,text,jsonb)', 'authenticated');
select pg_temp.mimi_harden_rpc_acl('public.responder_ticket_soporte(uuid,text,text)', 'authenticated');
select pg_temp.mimi_harden_rpc_acl('public.search_categories_hybrid(text,vector,double precision,integer)', 'authenticated');

-- Pure pricing helper is allowed for logged-in clients/drivers, but not anon.
select pg_temp.mimi_harden_rpc_acl('public.calcular_precio_viaje(numeric,integer,text)', 'authenticated');

-- PostGIS estimated extent helpers are extension-owned but should not be exposed
-- through the public API roles.
select pg_temp.mimi_harden_rpc_acl('public.st_estimatedextent(text,text)', 'internal');
select pg_temp.mimi_harden_rpc_acl('public.st_estimatedextent(text,text,text)', 'internal');
select pg_temp.mimi_harden_rpc_acl('public.st_estimatedextent(text,text,text,boolean)', 'internal');

commit;
