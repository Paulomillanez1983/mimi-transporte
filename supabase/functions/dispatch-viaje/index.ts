import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { notifyTransportDriverOffer } from "../_shared/transport-push.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};
const ESTADOS = {
  PENDIENTE: "PENDIENTE",
  BUSCANDO_CHOFER: "BUSCANDO_CHOFER",
  OFERTANDO: "OFERTANDO",
  DISPONIBLE: "DISPONIBLE",
  OFERTADO: "OFERTADO",
  SIN_CHOFER: "SIN_CHOFER",
  CANCELADO: "CANCELADO",
  ASIGNADO: "ASIGNADO",
  EN_CURSO: "EN_CURSO",
  COMPLETADO: "COMPLETADO"
};
const OFFER_WINDOWS = [
  20,
  22,
  25,
  28,
  30
];
const GLOBAL_SEARCH_TIMEOUT_DEFAULT = 90;
const GLOBAL_SEARCH_TIMEOUT_MAX = 180;
const LOCK_TTL_SECONDS = 20;
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders
  });
}
function sanitizeString(value, fallback = "") {
  if (value == null) return fallback;
  return String(value).trim();
}
function sanitizeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function sanitizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if ([
      "true",
      "1",
      "yes",
      "si",
      "sí"
    ].includes(v)) return true;
    if ([
      "false",
      "0",
      "no"
    ].includes(v)) return false;
  }
  if (typeof value === "number") return value === 1;
  return fallback;
}
function normalizarEstado(estado) {
  return sanitizeString(estado).trim().toUpperCase();
}
function addSeconds(date, seconds) {
  return new Date(date.getTime() + Math.max(1, seconds) * 1000).toISOString();
}
function addSecondsToNow(seconds) {
  return addSeconds(new Date(), seconds);
}
function isFutureDate(value) {
  if (!value) return false;
  const ms = new Date(String(value)).getTime();
  return Number.isFinite(ms) && ms > Date.now();
}
function isExpiredDate(value) {
  if (!value) return true;
  const ms = new Date(String(value)).getTime();
  return !Number.isFinite(ms) || ms <= Date.now();
}
function getOfferWindowSeconds(attemptIndex) {
  return OFFER_WINDOWS[Math.min(Math.max(0, attemptIndex), OFFER_WINDOWS.length - 1)];
}
function calcularRadio(dispatchAttempts, distanciaViajeKm = 0) {
  const intento = Math.max(1, Number(dispatchAttempts || 0) + 1);
  const distancia = Math.max(0, Number(distanciaViajeKm || 0));
  if (distancia >= 45) {
    if (intento === 1) return 12;
    if (intento === 2) return 20;
    if (intento === 3) return 35;
    if (intento === 4) return 50;
    return 65;
  }
  if (distancia >= 25) {
    if (intento === 1) return 8;
    if (intento === 2) return 15;
    if (intento === 3) return 25;
    if (intento === 4) return 40;
    return 55;
  }
  if (distancia >= 12) {
    if (intento === 1) return 5;
    if (intento === 2) return 10;
    if (intento === 3) return 18;
    if (intento === 4) return 28;
    return 40;
  }
  if (intento === 1) return 3;
  if (intento === 2) return 6;
  if (intento === 3) return 10;
  if (intento === 4) return 16;
  return 25;
}
function puedeDespacharse(estado) {
  const e = normalizarEstado(estado);
  return [
    ESTADOS.PENDIENTE,
    ESTADOS.BUSCANDO_CHOFER,
    ESTADOS.OFERTANDO,
    ESTADOS.OFERTADO,
    ESTADOS.SIN_CHOFER,
    ESTADOS.DISPONIBLE
  ].includes(e);
}
function esEstadoFinalOAsignado(estado) {
  const e = normalizarEstado(estado);
  return [
    ESTADOS.ASIGNADO,
    ESTADOS.EN_CURSO,
    ESTADOS.COMPLETADO,
    ESTADOS.CANCELADO
  ].includes(e);
}
function getAttemptCount(viaje) {
  return Math.max(sanitizeNumber(viaje?.dispatch_attempt_count, 0), sanitizeNumber(viaje?.dispatch_attempts, 0));
}
async function registrarEvento(supabase, payload) {
  try {
    await supabase.from("viaje_eventos").insert({
      id: crypto.randomUUID(),
      viaje_id: payload.viaje_id,
      chofer_id_uuid: payload.chofer_id_uuid ?? null,
      tipo: payload.tipo,
      payload: payload.data ?? {},
      created_at: new Date().toISOString()
    });
  } catch (eventError) {
    console.warn("[dispatch-viaje] No se pudo registrar viaje_eventos:", eventError);
  }
}
async function liberarLock(supabase, viajeId, extra = {}) {
  await supabase.from("viajes").update({
    dispatch_locked: false,
    dispatch_lock_expires_at: null,
    updated_at: new Date().toISOString(),
    ...extra
  }).eq("id", viajeId);
}
async function expirarOfertasPendientesDelViaje(supabase, viajeId) {
  const nowIso = new Date().toISOString();
  const { error } = await supabase.from("viaje_ofertas").update({
    estado: "EXPIRADA",
    respondida_en: nowIso
  }).eq("viaje_id", viajeId).eq("estado", "PENDIENTE").lt("expires_at", nowIso);
  if (error) {
    console.warn("[dispatch-viaje] No se pudieron expirar ofertas viejas:", error);
  }
}
serve(async (req)=>{
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }
  if (req.method !== "POST") {
    return jsonResponse({
      exito: false,
      error: "Método no permitido"
    }, 405);
  }
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({
        exito: false,
        error: "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY"
      }, 500);
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false
      }
    });
    const body = await req.json().catch(()=>({}));
    const viajeId = sanitizeString(body?.viaje_id || body?.trip_id || null);
    const forceRedispatch = sanitizeBoolean(body?.force_redispatch, false);
    const globalSearchTimeoutSeconds = Math.min(GLOBAL_SEARCH_TIMEOUT_MAX, Math.max(GLOBAL_SEARCH_TIMEOUT_DEFAULT, sanitizeNumber(body?.global_timeout_seconds ?? GLOBAL_SEARCH_TIMEOUT_DEFAULT, GLOBAL_SEARCH_TIMEOUT_DEFAULT)));
    if (!viajeId) {
      return jsonResponse({
        exito: false,
        error: "viaje_id es obligatorio"
      }, 400);
    }
    const now = new Date();
    const nowIso = now.toISOString();
    const lockExpiresAt = addSeconds(now, LOCK_TTL_SECONDS);
    const { data: viaje, error: viajeError } = await supabase.from("viajes").select(`
        id,
        estado,
        dispatch_locked,
        dispatch_lock_expires_at,
        dispatch_attempts,
        dispatch_attempt_count,
        current_offer_expires_at,
        search_deadline_at,
        no_driver_found,
        chofer_id_uuid,
        assigned_driver_id,
        cotizacion_id,
        updated_at,
        created_at
      `).eq("id", viajeId).maybeSingle();
    if (viajeError) {
      return jsonResponse({
        exito: false,
        error: viajeError.message,
        paso: "leer_viaje"
      }, 500);
    }
    if (!viaje) {
      return jsonResponse({
        exito: false,
        error: "Viaje no encontrado",
        paso: "leer_viaje"
      }, 404);
    }
    let estadoActual = normalizarEstado(viaje.estado);
    if (estadoActual === ESTADOS.OFERTADO && !sanitizeString(viaje.chofer_id_uuid) && sanitizeString(viaje.assigned_driver_id)) {
      estadoActual = ESTADOS.ASIGNADO;
    }
    if (viaje.assigned_driver_id || estadoActual === ESTADOS.ASIGNADO) {
      return jsonResponse({
        exito: true,
        skipped: true,
        motivo: "viaje_ya_asignado",
        viaje_id: viajeId,
        estado: ESTADOS.ASIGNADO
      });
    }
    if (esEstadoFinalOAsignado(estadoActual)) {
      return jsonResponse({
        exito: true,
        skipped: true,
        motivo: "estado_final",
        viaje_id: viajeId,
        estado: estadoActual
      });
    }
    if (!puedeDespacharse(estadoActual)) {
      return jsonResponse({
        exito: true,
        skipped: true,
        motivo: "estado_no_despachable",
        viaje_id: viajeId,
        estado: estadoActual
      });
    }
    const currentOfferExpiresAtMs = viaje.current_offer_expires_at ? new Date(String(viaje.current_offer_expires_at)).getTime() : 0;
    if (!forceRedispatch && currentOfferExpiresAtMs > Date.now()) {
      return jsonResponse({
        exito: true,
        skipped: true,
        motivo: "oferta_aun_vigente",
        viaje_id: viajeId,
        estado: estadoActual,
        current_offer_expires_at: viaje.current_offer_expires_at
      });
    }
    const lockStillValid = viaje.dispatch_locked === true && isFutureDate(viaje.dispatch_lock_expires_at);
    if (!forceRedispatch && lockStillValid) {
      return jsonResponse({
        exito: true,
        skipped: true,
        motivo: "dispatch_bloqueado",
        viaje_id: viajeId,
        estado: estadoActual,
        dispatch_lock_expires_at: viaje.dispatch_lock_expires_at
      });
    }
    let distanciaViajeKm = 0;
    if (viaje?.cotizacion_id) {
      const { data: cotizacion, error: cotizacionError } = await supabase.from("cotizaciones").select("id, distancia_km, distancia_km_total").eq("id", viaje.cotizacion_id).maybeSingle();
      if (cotizacionError) {
        console.warn("[dispatch-viaje] Error leyendo cotizaciones distancia:", cotizacionError);
      } else {
        distanciaViajeKm = Math.max(sanitizeNumber(cotizacion?.distancia_km_total, 0), sanitizeNumber(cotizacion?.distancia_km, 0));
      }
    }
    const dispatchAttemptsActual = getAttemptCount(viaje);
    const siguienteIntento = dispatchAttemptsActual + 1;
    const radioKm = calcularRadio(dispatchAttemptsActual, distanciaViajeKm);
    const offerWindowSeconds = getOfferWindowSeconds(dispatchAttemptsActual);
    const searchDeadlineAt = isFutureDate(viaje.search_deadline_at) ? String(viaje.search_deadline_at) : addSeconds(now, globalSearchTimeoutSeconds);
    const globalDeadlineReached = new Date(searchDeadlineAt).getTime() <= Date.now();
    if (globalDeadlineReached) {
      await liberarLock(supabase, viajeId, {
        no_driver_found: true,
        estado: ESTADOS.SIN_CHOFER,
        current_offer_expires_at: null,
        chofer_id_uuid: null,
        assigned_driver_id: null
      });
      await registrarEvento(supabase, {
        viaje_id: viajeId,
        tipo: "dispatch_sin_chofer_deadline_vencida",
        data: {
          dispatch_attempts: dispatchAttemptsActual,
          radio_km: radioKm,
          distancia_viaje_km: distanciaViajeKm,
          search_deadline_at: searchDeadlineAt
        }
      });
      return jsonResponse({
        exito: false,
        viaje_id: viajeId,
        estado: ESTADOS.SIN_CHOFER,
        motivo: "deadline_vencida",
        dispatch_attempts: dispatchAttemptsActual,
        radio_km: radioKm,
        search_deadline_at: searchDeadlineAt
      });
    }
    console.log("[dispatch-viaje] inicio secuencial_pro", {
      viaje_id: viajeId,
      estado_actual: estadoActual,
      distancia_viaje_km: distanciaViajeKm,
      dispatch_attempts_actual: dispatchAttemptsActual,
      siguiente_intento: siguienteIntento,
      radio_km: radioKm,
      offer_window_seconds: offerWindowSeconds,
      search_deadline_at: searchDeadlineAt,
      force_redispatch: forceRedispatch
    });
    const lockOrCondition = "dispatch_locked.is.false,dispatch_locked.is.null,dispatch_lock_expires_at.lte.now()";
    const { data: viajeBloqueado, error: lockError } = await supabase.from("viajes").update({
      dispatch_locked: true,
      dispatch_lock_expires_at: lockExpiresAt,
      no_driver_found: false,
      dispatch_attempts: siguienteIntento,
      dispatch_attempt_count: siguienteIntento,
      search_deadline_at: searchDeadlineAt,
      updated_at: nowIso
    }).eq("id", viajeId).or(lockOrCondition).select(`
        id,
        estado,
        dispatch_locked,
        dispatch_lock_expires_at,
        dispatch_attempts,
        dispatch_attempt_count,
        current_offer_expires_at,
        search_deadline_at,
        no_driver_found,
        chofer_id_uuid,
        assigned_driver_id,
        cotizacion_id,
        updated_at
      `).maybeSingle();
    if (lockError) {
      return jsonResponse({
        exito: false,
        error: lockError.message,
        paso: "lock_viaje"
      }, 500);
    }
    if (!viajeBloqueado) {
      return jsonResponse({
        exito: true,
        skipped: true,
        motivo: "dispatch_tomado_por_otro_proceso",
        viaje_id: viajeId
      });
    }
    const { data: viajeFresh, error: viajeFreshError } = await supabase.from("viajes").select(`
        id,
        estado,
        dispatch_locked,
        dispatch_lock_expires_at,
        assigned_driver_id,
        chofer_id_uuid,
        current_offer_expires_at,
        search_deadline_at
      `).eq("id", viajeId).single();
    if (viajeFreshError) {
      await liberarLock(supabase, viajeId);
      return jsonResponse({
        exito: false,
        error: viajeFreshError.message,
        paso: "releer_viaje_pre_rpc",
        viaje_id: viajeId
      }, 500);
    }
    const estadoFresh = normalizarEstado(viajeFresh?.estado);
    const assignedFresh = sanitizeString(viajeFresh?.assigned_driver_id);
    if (estadoFresh === ESTADOS.ASIGNADO || !!assignedFresh) {
      await liberarLock(supabase, viajeId);
      return jsonResponse({
        exito: true,
        skipped: true,
        motivo: "viaje_ya_asignado_fresh",
        viaje_id: viajeId,
        estado: ESTADOS.ASIGNADO,
        assigned_driver_id: assignedFresh || null
      });
    }
    if (!forceRedispatch && viajeFresh?.current_offer_expires_at && new Date(String(viajeFresh.current_offer_expires_at)).getTime() > Date.now()) {
      await liberarLock(supabase, viajeId);
      return jsonResponse({
        exito: true,
        skipped: true,
        motivo: "oferta_vigente_fresh",
        viaje_id: viajeId,
        estado: estadoFresh || ESTADOS.OFERTADO,
        current_offer_expires_at: viajeFresh.current_offer_expires_at
      });
    }
    const searchDeadlineFresh = isFutureDate(viajeFresh?.search_deadline_at) ? String(viajeFresh.search_deadline_at) : searchDeadlineAt;
    if (new Date(searchDeadlineFresh).getTime() <= Date.now()) {
      await liberarLock(supabase, viajeId, {
        no_driver_found: true,
        estado: ESTADOS.SIN_CHOFER,
        current_offer_expires_at: null,
        chofer_id_uuid: null,
        assigned_driver_id: null
      });
      return jsonResponse({
        exito: false,
        viaje_id: viajeId,
        estado: ESTADOS.SIN_CHOFER,
        motivo: "deadline_vencida_fresh",
        search_deadline_at: searchDeadlineFresh
      });
    }
    await expirarOfertasPendientesDelViaje(supabase, viajeId);
    const { data: rpcData, error: rpcError } = await supabase.rpc("dispatch_crear_siguiente_oferta_secuencial_pro", {
      p_viaje_id: viajeId,
      p_radio_km: radioKm,
      p_timeout_seconds: offerWindowSeconds,
      p_intento: siguienteIntento
    });
    if (rpcError) {
      await liberarLock(supabase, viajeId, {
        estado: ESTADOS.DISPONIBLE,
        chofer_id_uuid: null,
        assigned_driver_id: null,
        current_offer_expires_at: null
      });
      await registrarEvento(supabase, {
        viaje_id: viajeId,
        tipo: "dispatch_rpc_error",
        data: {
          radio_km: radioKm,
          distancia_viaje_km: distanciaViajeKm,
          offer_window_seconds: offerWindowSeconds,
          dispatch_attempts: siguienteIntento,
          force_redispatch: forceRedispatch,
          error: rpcError.message
        }
      });
      return jsonResponse({
        exito: false,
        error: rpcError.message,
        paso: "rpc_dispatch_crear_siguiente_oferta_secuencial_pro",
        viaje_id: viajeId,
        dispatch_attempts: siguienteIntento,
        radio_km: radioKm,
        distancia_viaje_km: distanciaViajeKm
      }, 500);
    }
    const resultado = rpcData ?? {};
    const exito = !!resultado?.exito;
    const ofertaId = sanitizeString(resultado?.oferta_id || null);
    const choferId = sanitizeString(resultado?.chofer_id || null);
    const score = sanitizeNumber(resultado?.score, 0);
    const distOrigenKm = sanitizeNumber(resultado?.dist_origen_km, 0);
    const distDestinoKm = sanitizeNumber(resultado?.dist_destino_km, 0);
    const etaMin = sanitizeNumber(resultado?.eta_min, 0);
    const motivo = sanitizeString(resultado?.motivo || "sin_candidatos");
    const expiresAt = addSecondsToNow(offerWindowSeconds);
    if (!exito || !ofertaId || !choferId) {
      const deadlineReachedNow = new Date(searchDeadlineFresh).getTime() <= Date.now();
      await liberarLock(supabase, viajeId, {
        no_driver_found: deadlineReachedNow,
        estado: deadlineReachedNow ? ESTADOS.SIN_CHOFER : ESTADOS.DISPONIBLE,
        current_offer_expires_at: null,
        chofer_id_uuid: null,
        assigned_driver_id: null
      });
      await registrarEvento(supabase, {
        viaje_id: viajeId,
        tipo: deadlineReachedNow ? "dispatch_sin_chofer_final" : "dispatch_sin_candidato_en_intento",
        data: {
          radio_km: radioKm,
          distancia_viaje_km: distanciaViajeKm,
          offer_window_seconds: offerWindowSeconds,
          dispatch_attempts: siguienteIntento,
          search_deadline_at: searchDeadlineFresh,
          motivo,
          rpc_resultado: resultado
        }
      });
      return jsonResponse({
        exito: false,
        viaje_id: viajeId,
        estado: deadlineReachedNow ? ESTADOS.SIN_CHOFER : ESTADOS.DISPONIBLE,
        motivo,
        radio_km: radioKm,
        distancia_viaje_km: distanciaViajeKm,
        dispatch_attempts: siguienteIntento,
        offer_window_seconds: offerWindowSeconds,
        search_deadline_at: searchDeadlineFresh,
        paso: "dispatch_sin_candidato"
      });
    }
    const { data: viajeOfertado, error: updateOfertaError } = await supabase.from("viajes").update({
      estado: ESTADOS.OFERTADO,
      dispatch_locked: false,
      dispatch_lock_expires_at: null,
      no_driver_found: false,
      current_offer_expires_at: expiresAt,
      chofer_id_uuid: null,
      assigned_driver_id: null,
      updated_at: new Date().toISOString()
    }).eq("id", viajeId).is("assigned_driver_id", null).select(`
        id,
        estado,
        chofer_id_uuid,
        assigned_driver_id,
        current_offer_expires_at,
        search_deadline_at,
        updated_at
      `).single();
    if (updateOfertaError) {
      await liberarLock(supabase, viajeId, {
        no_driver_found: false,
        estado: ESTADOS.DISPONIBLE,
        current_offer_expires_at: null,
        chofer_id_uuid: null,
        assigned_driver_id: null
      });
      await registrarEvento(supabase, {
        viaje_id: viajeId,
        tipo: "dispatch_update_viaje_error",
        chofer_id_uuid: choferId,
        data: {
          error: updateOfertaError?.message || "No se pudo actualizar viajes a OFERTADO",
          expires_at: expiresAt,
          radio_km: radioKm,
          distancia_viaje_km: distanciaViajeKm,
          oferta_id: ofertaId,
          chofer_id: choferId
        }
      });
      return jsonResponse({
        exito: false,
        error: updateOfertaError?.message || "No se pudo actualizar viajes a OFERTADO",
        paso: "actualizar_viaje_ofertado",
        viaje_id: viajeId
      }, 500);
    }
    await registrarEvento(supabase, {
      viaje_id: viajeId,
      tipo: "dispatch_oferta_secuencial_creada",
      chofer_id_uuid: choferId,
      data: {
        oferta_id: ofertaId,
        chofer_id: choferId,
        score,
        eta_min: etaMin,
        dist_origen_km: distOrigenKm,
        dist_destino_km: distDestinoKm,
        radio_km: radioKm,
        distancia_viaje_km: distanciaViajeKm,
        offer_window_seconds: offerWindowSeconds,
        dispatch_attempts: siguienteIntento,
        current_offer_expires_at: expiresAt,
        search_deadline_at: searchDeadlineFresh,
        freshness_bonus: resultado?.freshness_bonus ?? null,
        load_penalty: resultado?.load_penalty ?? null,
        rejection_penalty: resultado?.rejection_penalty ?? null,
        ofertas_ult_10m: resultado?.ofertas_ult_10m ?? null,
        rechazos_ult_30m: resultado?.rechazos_ult_30m ?? null,
        viaje_ofertado: viajeOfertado
      }
    });
    const pushResult = await notifyTransportDriverOffer(supabase, supabaseUrl, {
      viajeId,
      ofertaId,
      choferId,
      expiresAt,
      etaMin
    }).catch((err)=>({
        ok: false,
        skipped: true,
        reason: "push_exception",
        error: err?.message || String(err)
      }));
    return jsonResponse({
      exito: true,
      viaje_id: viajeId,
      estado: ESTADOS.OFERTADO,
      radio_km: radioKm,
      distancia_viaje_km: distanciaViajeKm,
      dispatch_attempts: siguienteIntento,
      offer_window_seconds: offerWindowSeconds,
      current_offer_expires_at: expiresAt,
      search_deadline_at: searchDeadlineFresh,
      oferta_id: ofertaId,
      chofer_id: choferId,
      score,
      eta_min: etaMin,
      dist_origen_km: distOrigenKm,
      dist_destino_km: distDestinoKm,
      viaje_actualizado: viajeOfertado,
      push: pushResult,
      modo: "uber_secuencial_adaptativo_pro"
    });
  } catch (error) {
    console.error("[dispatch-viaje] ERROR:", error);
    return jsonResponse({
      exito: false,
      error: error instanceof Error ? error.message : "Error inesperado"
    }, 500);
  }
});
