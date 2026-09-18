-- 20260918140000_cancellation_rules_seed.sql
-- Matriz de cargos por cancelación de servicios (modelo Uber).
-- Números aprobados por Paulo el 18-sep-2026: 25% con el prestador en camino, 40% al llegar.
--
-- ESTA MIGRACIÓN ES SOLO DATOS. No cambia ningún comportamiento:
-- hoy ninguna función lee `cancellation_rules` (la tabla existe con 0 filas),
-- así que aplicarla es un no-op observable. Se puede correr sola sin riesgo.
--
-- La lógica que la consume va en 20260918140100_svc_cancel_request_fee_rules.sql
-- y ESA SÍ cambia comportamiento. Las dos van juntas.
--
-- Convenciones que fija este archivo (la tabla no tiene CHECK para esto; hay que sostenerlas a mano):
--   context_type = 'SERVICE_REQUEST'
--   cancelled_by = 'CLIENT' | 'PROVIDER'   -- mayúsculas, igual que svc_requests.cancelled_by
--   status       = el estado de svc_requests al momento de cancelar, o 'DEFAULT' como fallback
--   base del cálculo = svc_requests.total_price_snapshot  -- lo que pagó el cliente, IVA/comisión incluidos
--   cargo = LEAST(GREATEST(base * fee_percentage/100, fixed_fee), base)
--   el reparto aplica sobre el cargo ya calculado, no sobre la base
--
-- Nota sobre la base: la comisión de plataforma es 30% (hard constraint del negocio).
-- Sobre un servicio de $24.000 del prestador, el cliente paga $31.200 (= 24.000 + 7.200).
-- Con base = total pagado, 25% son $7.800; con base = precio del prestador serían $6.000.
-- Este archivo usa el total pagado. Si preferís la otra base, se cambia en la función, no acá.

begin;

-- Idempotente: si ya hay reglas de este contexto, las reemplaza por completo.
-- (Hoy la tabla está vacía; esto es para poder re-correr el archivo sin duplicar.)
delete from public.cancellation_rules
where context_type = 'SERVICE_REQUEST';

insert into public.cancellation_rules
  (context_type, status, cancelled_by, fee_percentage, fixed_fee,
   platform_share_percentage, provider_share_percentage, active)
values
  -- CLIENTE: gratis mientras nadie se movió de su casa
  ('SERVICE_REQUEST', 'PENDING_PROVIDER_RESPONSE', 'CLIENT',     0,    0,    0, 100, true),
  ('SERVICE_REQUEST', 'ACCEPTED',                  'CLIENT',     0,    0,    0, 100, true),

  -- CLIENTE: el prestador ya salió -> se cobra el viaje perdido
  ('SERVICE_REQUEST', 'PROVIDER_EN_ROUTE',         'CLIENT',    25, 2000,   30,  70, true),

  -- CLIENTE: el prestador ya llegó a la puerta
  ('SERVICE_REQUEST', 'PROVIDER_ARRIVED',          'CLIENT',    40, 3500,   30,  70, true),

  -- PRESTADOR: nunca se le cobra al cliente. Reembolso del 100%.
  ('SERVICE_REQUEST', 'PENDING_PROVIDER_RESPONSE', 'PROVIDER',   0,    0,    0, 100, true),
  ('SERVICE_REQUEST', 'ACCEPTED',                  'PROVIDER',   0,    0,    0, 100, true),
  ('SERVICE_REQUEST', 'PROVIDER_EN_ROUTE',         'PROVIDER',   0,    0,    0, 100, true),
  ('SERVICE_REQUEST', 'PROVIDER_ARRIVED',          'PROVIDER',   0,    0,    0, 100, true),
  ('SERVICE_REQUEST', 'IN_PROGRESS',               'PROVIDER',   0,    0,    0, 100, true),

  -- Fallback para cualquier estado no listado arriba.
  ('SERVICE_REQUEST', 'DEFAULT',                   'CLIENT',     0,    0,    0, 100, true),
  ('SERVICE_REQUEST', 'DEFAULT',                   'PROVIDER',   0,    0,    0, 100, true);

commit;

-- Verificación (debería devolver 11 filas, las dos primeras y las dos últimas en 0):
--   select status, cancelled_by, fee_percentage, fixed_fee,
--          platform_share_percentage, provider_share_percentage
--   from public.cancellation_rules
--   where context_type = 'SERVICE_REQUEST'
--   order by cancelled_by, status;
