import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { notifyTransportClientTripStatus } from "../_shared/transport-push.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};
const ESTADOS = {
  EN_CURSO: "EN_CURSO",
  COMPLETADO: "COMPLETADO",
  CANCELADO: "CANCELADO"
};
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
function normalizarEstado(estado) {
  return sanitizeString(estado).toUpperCase();
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
  } catch (err) {
    console.warn("[completar-viaje] no se pudo registrar evento:", err);
  }
}
async function actualizarDisponibilidadChofer(supabase, choferId, disponible) {
  try {
    const { error } = await supabase.from("choferes").update({
      disponible,
      online: true,
      last_seen_at: new Date().toISOString()
    }).eq("id_uuid", choferId);
    if (error) {
      console.warn("[completar-viaje] no se pudo actualizar disponibilidad chofer:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[completar-viaje] exception actualizando disponibilidad chofer:", err);
    return false;
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({
        exito: false,
        error: "Faltan secrets de Supabase"
      }, 500);
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false
      }
    });
    const body = await req.json().catch(()=>({}));
    const viajeId = sanitizeString(body?.viaje_id || body?.trip_id);
    const choferId = sanitizeString(body?.chofer_id || body?.chofer_id_uuid || body?.driver_id);
    if (!viajeId) {
      return jsonResponse({
        exito: false,
        error: "viaje_id es obligatorio"
      }, 400);
    }
    if (!choferId) {
      return jsonResponse({
        exito: false,
        error: "chofer_id es obligatorio"
      }, 400);
    }
    const nowIso = new Date().toISOString();
    const { data: viaje, error: viajeError } = await supabase.from("viajes").select(`
        id,
        estado,
        chofer_id_uuid,
        assigned_driver_id,
        iniciado_at,
        completado_at,
        cancelado_at,
        updated_at
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
    const estadoActual = normalizarEstado(viaje.estado);
    const assignedDriverId = sanitizeString(viaje.assigned_driver_id);
    if (!assignedDriverId) {
      return jsonResponse({
        exito: false,
        error: "El viaje no tiene chofer asignado",
        paso: "sin_chofer_asignado",
        viaje_id: viajeId
      }, 409);
    }
    if (assignedDriverId !== choferId) {
      return jsonResponse({
        exito: false,
        error: "Este viaje no pertenece a este chofer",
        paso: "chofer_no_autorizado",
        viaje_id: viajeId
      }, 403);
    }
    if (estadoActual === ESTADOS.COMPLETADO) {
      return jsonResponse({
        exito: true,
        viaje_id: viajeId,
        estado: estadoActual,
        completado_at: viaje.completado_at ?? null,
        ya_estaba_completado: true
      });
    }
    if (estadoActual === ESTADOS.CANCELADO) {
      return jsonResponse({
        exito: false,
        error: "El viaje fue cancelado",
        paso: "estado_final",
        viaje_id: viajeId,
        estado: estadoActual
      }, 409);
    }
    if (estadoActual !== ESTADOS.EN_CURSO) {
      return jsonResponse({
        exito: false,
        error: "El viaje debe estar EN_CURSO para completarse",
        paso: "estado_invalido",
        viaje_id: viajeId,
        estado: estadoActual
      }, 409);
    }
    const { data: viajeCompletado, error: updateError } = await supabase.from("viajes").update({
      estado: ESTADOS.COMPLETADO,
      completado_at: nowIso,
      dispatch_locked: false,
      current_offer_expires_at: null,
      updated_at: nowIso
    }).eq("id", viajeId).eq("estado", ESTADOS.EN_CURSO).eq("assigned_driver_id", choferId).select(`
        id,
        estado,
        assigned_driver_id,
        iniciado_at,
        completado_at,
        updated_at
      `).maybeSingle();
    if (updateError) {
      return jsonResponse({
        exito: false,
        error: updateError.message,
        paso: "actualizar_viaje_completado"
      }, 500);
    }
    if (!viajeCompletado) {
      return jsonResponse({
        exito: false,
        error: "No se pudo completar el viaje porque otro proceso se adelantó",
        paso: "conflicto_completar",
        viaje_id: viajeId
      }, 409);
    }
    const disponibilidadActualizada = await actualizarDisponibilidadChofer(supabase, choferId, true);
    await registrarEvento(supabase, {
      viaje_id: viajeId,
      chofer_id_uuid: choferId,
      tipo: "chofer_completo_viaje",
      data: {
        chofer_id: choferId,
        estado_anterior: estadoActual,
        estado_nuevo: ESTADOS.COMPLETADO,
        completado_at: nowIso,
        chofer_disponible_actualizado: disponibilidadActualizada
      }
    });
    const pushResult = await notifyTransportClientTripStatus(supabase, supabaseUrl, {
      viajeId,
      choferId,
      title: "Viaje finalizado",
      body: "El viaje fue marcado como completado.",
      type: "trip_completed",
      status: ESTADOS.COMPLETADO
    }).catch((err)=>({
        ok: false,
        skipped: true,
        reason: "push_exception",
        error: err?.message || String(err)
      }));
    return jsonResponse({
      exito: true,
      viaje_id: viajeId,
      estado: viajeCompletado.estado,
      chofer_id: viajeCompletado.assigned_driver_id,
      iniciado_at: viajeCompletado.iniciado_at,
      completado_at: viajeCompletado.completado_at,
      chofer_disponible_actualizado: disponibilidadActualizada,
      push: pushResult
    });
  } catch (error) {
    console.error("[completar-viaje] ERROR:", error);
    return jsonResponse({
      exito: false,
      error: error instanceof Error ? error.message : "Error inesperado"
    }, 500);
  }
});
