import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  notifyTransportClientTripStatus,
  notifyTransportDriverTripStatus
} from "../_shared/transport-push.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};
const ESTADOS = {
  DISPONIBLE: "DISPONIBLE",
  OFERTADO: "OFERTADO",
  SIN_CHOFER: "SIN_CHOFER",
  ASIGNADO: "ASIGNADO",
  EN_CURSO: "EN_CURSO",
  COMPLETADO: "COMPLETADO",
  CANCELADO: "CANCELADO"
};
const ACTORES_CANCELACION = {
  CLIENTE: "cliente",
  CHOFER: "chofer",
  ADMIN: "admin",
  SISTEMA: "sistema"
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
function normalizarActor(actor) {
  const v = sanitizeString(actor).toLowerCase();
  if ([
    ACTORES_CANCELACION.CLIENTE,
    ACTORES_CANCELACION.CHOFER,
    ACTORES_CANCELACION.ADMIN,
    ACTORES_CANCELACION.SISTEMA
  ].includes(v)) {
    return v;
  }
  return ACTORES_CANCELACION.CLIENTE;
}
function puedeCancelarse(estado) {
  return [
    ESTADOS.DISPONIBLE,
    ESTADOS.OFERTADO,
    ESTADOS.SIN_CHOFER,
    ESTADOS.ASIGNADO,
    "ACEPTADO",
    "EN_CAMINO",
    "INICIADO",
    ESTADOS.EN_CURSO
  ].includes(estado);
}
function getBearerToken(req) {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  const token = auth.slice(7).trim();
  return token || null;
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
    console.warn("[cancelar-viaje] no se pudo registrar evento:", err);
  }
}
async function limpiarOfertasPendientesDelViaje(supabase, viajeId, nowIso, motivo) {
  try {
    const { error } = await supabase.from("viaje_ofertas").update({
      estado: "CANCELADA",
      respondida_en: nowIso
    }).eq("viaje_id", viajeId).eq("estado", "PENDIENTE");
    if (error) {
      console.warn("[cancelar-viaje] no se pudieron limpiar viaje_ofertas:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[cancelar-viaje] exception limpiando viaje_ofertas:", err, motivo);
    return false;
  }
}
async function restaurarDisponibilidadChofer(supabase, choferId) {
  if (!choferId) return false;
  try {
    const { error } = await supabase.from("choferes").update({
      disponible: true,
      online: true,
      last_seen_at: new Date().toISOString()
    }).eq("id_uuid", choferId);
    if (error) {
      console.warn("[cancelar-viaje] no se pudo restaurar disponibilidad chofer:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[cancelar-viaje] exception restaurando disponibilidad chofer:", err);
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
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return jsonResponse({
        exito: false,
        error: "Faltan secrets de Supabase"
      }, 500);
    }
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false
      }
    });
    const body = await req.json().catch(()=>({}));
    const viajeId = sanitizeString(body?.viaje_id || body?.trip_id);
    const actor = normalizarActor(body?.cancelado_por || body?.actor || body?.by);
    const motivo = sanitizeString(body?.motivo || body?.reason || body?.cancel_reason, "cancelacion_manual");
    const choferId = sanitizeString(body?.chofer_id || body?.chofer_id_uuid || body?.driver_id);
    if (!viajeId) {
      return jsonResponse({
        exito: false,
        error: "viaje_id es obligatorio"
      }, 400);
    }
    const nowIso = new Date().toISOString();
    let authUserId = null;
    let authUserEmail = null;
    // Si cancela el cliente, validamos JWT real del usuario
    if (actor === ACTORES_CANCELACION.CLIENTE) {
      const token = getBearerToken(req);
      if (!token) {
        return jsonResponse({
          exito: false,
          error: "Falta Authorization Bearer token"
        }, 401);
      }
      const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: {
            Authorization: `Bearer ${token}`
          }
        },
        auth: {
          persistSession: false
        }
      });
      const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
      if (userError || !user) {
        return jsonResponse({
          exito: false,
          error: "JWT inválido o sesión vencida"
        }, 401);
      }
      authUserId = user.id;
      authUserEmail = user.email || null;
    }
    // Intentamos leer incluyendo ownership
    let viaje = null;
    let viajeError = null;
    let tieneOwnerColumns = true;
    {
      const result = await supabaseAdmin.from("viajes").select(`
          id,
          estado,
          cliente,
          telefono,
          cliente_auth_id,
          cliente_email,
          chofer_id_uuid,
          assigned_driver_id,
          current_offer_expires_at,
          dispatch_locked,
          no_driver_found,
          asignado_at,
          aceptado_at,
          iniciado_at,
          completado_at,
          cancelado_at,
          cancelado_por,
          cancel_reason,
          updated_at
        `).eq("id", viajeId).maybeSingle();
      viaje = result.data;
      viajeError = result.error;
      if (viajeError && /column .* does not exist/i.test(viajeError.message || "")) {
        tieneOwnerColumns = false;
      }
    }
    // Fallback si todavía no existen cliente_auth_id / cliente_email
    if (!tieneOwnerColumns) {
      const fallbackResult = await supabaseAdmin.from("viajes").select(`
          id,
          estado,
          cliente,
          telefono,
          chofer_id_uuid,
          assigned_driver_id,
          current_offer_expires_at,
          dispatch_locked,
          no_driver_found,
          asignado_at,
          aceptado_at,
          iniciado_at,
          completado_at,
          cancelado_at,
          cancelado_por,
          cancel_reason,
          updated_at
        `).eq("id", viajeId).maybeSingle();
      viaje = fallbackResult.data;
      viajeError = fallbackResult.error;
    }
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
    // Verificación real de propiedad del viaje para cliente
    if (actor === ACTORES_CANCELACION.CLIENTE) {
      if (!tieneOwnerColumns) {
        return jsonResponse({
          exito: false,
          error: "La tabla viajes todavía no tiene cliente_auth_id/cliente_email. No se puede validar propietario de forma segura.",
          paso: "owner_columns_missing"
        }, 409);
      }
      const viajeOwnerId = sanitizeString(viaje.cliente_auth_id);
      const viajeOwnerEmail = sanitizeString(viaje.cliente_email).toLowerCase();
      const authorized = viajeOwnerId && authUserId && viajeOwnerId === authUserId || viajeOwnerEmail && authUserEmail && viajeOwnerEmail === authUserEmail.toLowerCase();
      if (!authorized) {
        return jsonResponse({
          exito: false,
          error: "Este viaje no pertenece al usuario autenticado",
          paso: "cliente_no_autorizado"
        }, 403);
      }
    }
    const estadoActual = normalizarEstado(viaje.estado);
    const assignedDriverId = sanitizeString(viaje.assigned_driver_id);
    const offeredDriverId = sanitizeString(viaje.chofer_id_uuid);
    if (estadoActual === ESTADOS.CANCELADO) {
      return jsonResponse({
        exito: true,
        viaje_id: viajeId,
        estado: estadoActual,
        cancelado_at: viaje.cancelado_at ?? null,
        cancelado_por: viaje.cancelado_por ?? null,
        cancel_reason: viaje.cancel_reason ?? null,
        ya_estaba_cancelado: true
      });
    }
    if (estadoActual === ESTADOS.COMPLETADO) {
      return jsonResponse({
        exito: false,
        error: "El viaje ya fue completado y no puede cancelarse",
        paso: "estado_final",
        viaje_id: viajeId,
        estado: estadoActual
      }, 409);
    }
    if (!puedeCancelarse(estadoActual)) {
      return jsonResponse({
        exito: false,
        error: "El viaje no puede cancelarse en este estado",
        paso: "estado_invalido",
        viaje_id: viajeId,
        estado: estadoActual
      }, 409);
    }
    if (actor === ACTORES_CANCELACION.CHOFER) {
      const choferRelacionado = assignedDriverId || offeredDriverId;
      if (!choferId) {
        return jsonResponse({
          exito: false,
          error: "chofer_id es obligatorio para cancelación por chofer",
          paso: "chofer_id_requerido",
          viaje_id: viajeId
        }, 400);
      }
      if (!choferRelacionado) {
        return jsonResponse({
          exito: false,
          error: "El viaje no tiene chofer relacionado para cancelar",
          paso: "sin_chofer_relacionado",
          viaje_id: viajeId,
          estado: estadoActual
        }, 409);
      }
      if (choferRelacionado !== choferId) {
        return jsonResponse({
          exito: false,
          error: "Este viaje no pertenece a este chofer",
          paso: "chofer_no_autorizado",
          viaje_id: viajeId
        }, 403);
      }
    }
    const choferRelacionadoFinal = choferId || assignedDriverId || offeredDriverId || null;
    const { data: viajeCancelado, error: updateError } = await supabaseAdmin.from("viajes").update({
      estado: ESTADOS.CANCELADO,
      cancelado_at: nowIso,
      cancelado_por: actor,
      cancel_reason: motivo,
      chofer_id_uuid: null,
      assigned_driver_id: null,
      dispatch_locked: false,
      current_offer_expires_at: null,
      no_driver_found: false,
      updated_at: nowIso
    }).eq("id", viajeId).neq("estado", ESTADOS.CANCELADO).neq("estado", ESTADOS.COMPLETADO).select(`
        id,
        estado,
        chofer_id_uuid,
        assigned_driver_id,
        cancelado_at,
        cancelado_por,
        cancel_reason,
        updated_at
      `).maybeSingle();
    if (updateError) {
      return jsonResponse({
        exito: false,
        error: updateError.message,
        paso: "actualizar_viaje_cancelado"
      }, 500);
    }
    if (!viajeCancelado) {
      return jsonResponse({
        exito: false,
        error: "No se pudo cancelar el viaje porque otro proceso se adelantó",
        paso: "conflicto_cancelacion",
        viaje_id: viajeId
      }, 409);
    }
    const ofertasLimpiadas = await limpiarOfertasPendientesDelViaje(supabaseAdmin, viajeId, nowIso, motivo);
    const disponibilidadRestaurada = await restaurarDisponibilidadChofer(supabaseAdmin, choferRelacionadoFinal);
    await registrarEvento(supabaseAdmin, {
      viaje_id: viajeId,
      chofer_id_uuid: choferRelacionadoFinal,
      tipo: "viaje_cancelado",
      data: {
        estado_anterior: estadoActual,
        estado_nuevo: ESTADOS.CANCELADO,
        cancelado_at: nowIso,
        cancelado_por: actor,
        motivo,
        auth_user_id: authUserId,
        auth_user_email: authUserEmail,
        chofer_id: choferRelacionadoFinal,
        ofertas_pendientes_canceladas: ofertasLimpiadas,
        chofer_disponible_restaurado: disponibilidadRestaurada
      }
    });
    const pushResult = actor === ACTORES_CANCELACION.CLIENTE
      ? await notifyTransportDriverTripStatus(supabaseAdmin, supabaseUrl, {
          viajeId,
          choferId: choferRelacionadoFinal,
          title: "Viaje cancelado",
          body: "El cliente cancelo el viaje.",
          type: "trip_cancelled",
          status: ESTADOS.CANCELADO
        }).catch((err)=>({
            ok: false,
            skipped: true,
            reason: "push_exception",
            error: err?.message || String(err)
          }))
      : await notifyTransportClientTripStatus(supabaseAdmin, supabaseUrl, {
          viajeId,
          choferId: choferRelacionadoFinal,
          title: "Viaje cancelado",
          body: "El viaje fue cancelado.",
          type: "trip_cancelled",
          status: ESTADOS.CANCELADO
        }).catch((err)=>({
            ok: false,
            skipped: true,
            reason: "push_exception",
            error: err?.message || String(err)
          }));
    return jsonResponse({
      exito: true,
      viaje_id: viajeId,
      estado: viajeCancelado.estado,
      cancelado_at: viajeCancelado.cancelado_at,
      cancelado_por: viajeCancelado.cancelado_por,
      cancel_reason: viajeCancelado.cancel_reason,
      ofertas_pendientes_canceladas: ofertasLimpiadas,
      chofer_disponible_restaurado: disponibilidadRestaurada,
      push: pushResult
    });
  } catch (error) {
    console.error("[cancelar-viaje] ERROR:", error);
    return jsonResponse({
      exito: false,
      error: error instanceof Error ? error.message : "Error inesperado"
    }, 500);
  }
});
