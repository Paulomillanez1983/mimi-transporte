-- MIMI GO / MIMI - recomendaciones SQL de produccion
-- Revisar y aplicar desde Supabase SQL Editor o una migracion controlada.
-- No se aplico automaticamente porque el MCP recibido se indico como read_only=true.

-- 1) Realtime real para transporte y servicios.
-- La auditoria MCP mostro que supabase_realtime solo tenia svc_conversations y svc_messages.
-- La app escucha estas tablas, por lo que deben publicarse para seguimiento vivo.
alter publication supabase_realtime add table public.viajes;
alter publication supabase_realtime add table public.viaje_ofertas;
alter publication supabase_realtime add table public.svc_requests;
alter publication supabase_realtime add table public.svc_request_offers;
alter publication supabase_realtime add table public.svc_tracking;
alter publication supabase_realtime add table public.svc_notifications;

-- 2) Revisar RLS en spatial_ref_sys.
-- Supabase marco public.spatial_ref_sys con RLS deshabilitado. Es una tabla PostGIS de referencia,
-- pero al estar en public queda expuesta por Data API. Evaluar impacto antes de activar.
-- alter table public.spatial_ref_sys enable row level security;

-- 3) Datos minimos para matching de servicios.
-- Hoy hay prestadores, pero sin categorias/precios/ofertas no hay matching real.
-- Antes de produccion, cada prestador aprobado debe tener al menos una categoria activa
-- en svc_provider_categories y una regla de precio/oferta activa.
