-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: la service_role no era reconocida como privilegiada por el guard de
--      aprobación de prestadores → el panel de admin no podía aprobar a nadie.
-- ═══════════════════════════════════════════════════════════════════════════
-- SÍNTOMA (verificado en producción el 2026-09-18):
--   PATCH /rest/v1/svc_providers {approved:true} con la service_role
--     → 403 {"code":"42501","message":"provider_approved_admin_only"}
--   Y `admin-review-service-provider` usa createClient(URL, SERVICE_ROLE_KEY)
--   seguido de .update({approved:true}) → **la aprobación fallaba siempre**.
--   Sin prestador aprobado no hay búsqueda, y sin búsqueda el cliente no puede
--   crear una solicitud: el flujo entero quedaba bloqueado en el paso 1.
--
-- CAUSA:
--   Esta función leía `current_setting('request.jwt.claim.role')` (singular),
--   un setting que PostgREST >= 11 **ya no emite**: ahora publica los claims
--   como JSON en `request.jwt.claims`. Con PostgREST 14.5 la variable quedaba
--   vacía → v_role = '' → no privilegiado → 403.
--
--   Nota histórica: la versión anterior (migración
--   20260509234909_enterprise_06) usaba `current_user in ('postgres',
--   'service_role','supabase_admin')`. Como esta función es SECURITY DEFINER,
--   `current_user` es el DUEÑO de la función (postgres) para cualquier
--   llamador, así que esa comprobación era un no-op. Al reemplazarla por el
--   chequeo del claim se introdujo este bug.
--
-- FIX: leer el claim desde el JSON (compatible con PostgREST 11+).
-- APLICADO EN PRODUCCIÓN: 2026-09-18, verificado con PATCH approved=true/false
--   → 204 en ambos casos (antes: 403).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.svc_guard_provider_admin_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role text := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
  v_uid uuid := auth.uid();
  v_is_privileged boolean := false;
begin
  v_is_privileged :=
    v_role = 'service_role'
    or public.is_admin_user(v_uid);

  if v_is_privileged then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.approved, false) is distinct from false then
      raise exception 'provider_approved_admin_only' using errcode = '42501';
    end if;
    if coalesce(new.blocked, false) is distinct from false then
      raise exception 'provider_blocked_admin_only' using errcode = '42501';
    end if;
    if new.notes_internal is not null then
      raise exception 'provider_notes_internal_admin_only' using errcode = '42501';
    end if;
    if new.kyc_tax_id_hash is not null
       or new.kyc_tax_id_last4 is not null
       or new.kyc_tax_id_masked is not null
       or coalesce(new.kyc_tax_id_status, 'missing') <> 'missing'
       or new.kyc_tax_id_verified_at is not null
       or new.kyc_tax_id_source is not null
       or coalesce(new.kyc_tax_id_metadata, '{}'::jsonb) <> '{}'::jsonb then
      raise exception 'provider_kyc_tax_id_admin_only' using errcode = '42501';
    end if;

    return new;
  end if;

  if new.approved is distinct from old.approved then
    raise exception 'provider_approved_admin_only' using errcode = '42501';
  end if;

  if new.blocked is distinct from old.blocked then
    raise exception 'provider_blocked_admin_only' using errcode = '42501';
  end if;

  if new.notes_internal is distinct from old.notes_internal then
    raise exception 'provider_notes_internal_admin_only' using errcode = '42501';
  end if;

  if new.kyc_tax_id_hash is distinct from old.kyc_tax_id_hash
     or new.kyc_tax_id_last4 is distinct from old.kyc_tax_id_last4
     or new.kyc_tax_id_masked is distinct from old.kyc_tax_id_masked
     or new.kyc_tax_id_status is distinct from old.kyc_tax_id_status
     or new.kyc_tax_id_verified_at is distinct from old.kyc_tax_id_verified_at
     or new.kyc_tax_id_source is distinct from old.kyc_tax_id_source
     or new.kyc_tax_id_metadata is distinct from old.kyc_tax_id_metadata then
    raise exception 'provider_kyc_tax_id_admin_only' using errcode = '42501';
  end if;

  return new;
end;
$function$;
