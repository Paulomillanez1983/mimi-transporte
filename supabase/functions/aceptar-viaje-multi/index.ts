import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { notifyTransportClientTripStatus } from "../_shared/transport-push.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
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
async function actualizarDisponibilidadChofer(supabase, choferId, disponible) {
  try {
    const { error } = await supabase.from("choferes").update({
      disponible,
      online: true,
      last_seen_at: new Date().toISOString()
    }).eq("id_uuid", choferId);
    if (error) {
      console.warn("[aceptar-viaje-multi] no se pudo actualizar disponibilidad chofer:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[aceptar-viaje-multi] exception actualizando disponibilidad chofer:", err);
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return jsonResponse({
        exito: false,
        error: "Faltan variables de entorno"
      }, 500);
    }
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false
      }
    });
    const body = await req.json().catch(()=>({}));
    const viajeId = sanitizeString(body?.viaje_id);
    const choferId = sanitizeString(body?.chofer_id) || sanitizeString(body?.chofer_id_uuid);
    if (!viajeId || !choferId) {
      return jsonResponse({
        exito: false,
        error: "viaje_id y chofer_id requeridos"
      }, 400);
    }
    const { data, error } = await supabase.rpc("aceptar_viaje_multi_oferta", {
      p_viaje_id: viajeId,
      p_chofer_id: choferId
    });
    if (error) {
      return jsonResponse({
        exito: false,
        error: error.message,
        paso: "rpc_aceptar_viaje_multi_oferta"
      }, 500);
    }
    const disponibilidadActualizada = data?.exito ? await actualizarDisponibilidadChofer(supabase, choferId, false) : false;
    const pushResult = data?.exito ? await notifyTransportClientTripStatus(supabase, supabaseUrl, {
      viajeId,
      choferId,
      title: "Tu viaje fue aceptado",
      body: "El chofer ya esta asignado y podes seguir el avance en tiempo real.",
      type: "trip_accepted",
      status: "ASIGNADO"
    }).catch((err)=>({
        ok: false,
        skipped: true,
        reason: "push_exception",
        error: err?.message || String(err)
      })) : null;
    return jsonResponse({
      exito: !!data?.exito,
      motivo: data?.motivo ?? null,
      viaje_id: data?.viaje_id ?? viajeId,
      chofer_id: data?.chofer_id ?? choferId,
      estado: data?.estado ?? null,
      oferta_id: data?.oferta_id ?? null,
      assigned_driver_id: data?.assigned_driver_id ?? null,
      chofer_id_uuid: data?.chofer_id_uuid ?? null,
      chofer_disponible_actualizado: disponibilidadActualizada,
      push: pushResult,
      resultado: data
    }, 200);
  } catch (err) {
    return jsonResponse({
      exito: false,
      error: err instanceof Error ? err.message : String(err)
    }, 500);
  }
});
