const DEFAULT_CLIENT_URL = "/";
const DEFAULT_DRIVER_URL = "/chofer-panel.html";

function safeText(value: unknown, fallback = "") {
  if (value == null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function uniq(values: string[]) {
  return [...new Set(values.map((value) => safeText(value)).filter(Boolean))];
}

async function sendTransportPushTokens(
  supabaseUrl: string,
  tokens: string[],
  payload: {
    title: string;
    body: string;
    viaje_id?: string | null;
    chofer_id?: string | null;
    data?: Record<string, unknown>;
  }
) {
  const internalKey = safeText(
    Deno.env.get("PUSH_INTERNAL_KEY") || Deno.env.get("INTERNAL_WORKER_SECRET")
  );
  const functionBearer = safeText(
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")
  );
  const tokenList = uniq(tokens);

  if (!supabaseUrl || !internalKey || !functionBearer || tokenList.length === 0) {
    return {
      ok: false,
      skipped: true,
      reason: !internalKey
        ? "missing_push_internal_key"
        : !functionBearer
          ? "missing_function_bearer"
          : "no_tokens"
    };
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/send_push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${functionBearer}`,
      "x-internal-key": internalKey
    },
    body: JSON.stringify({
      tokens: tokenList,
      title: payload.title,
      body: payload.body,
      viaje_id: payload.viaje_id,
      chofer_id: payload.chofer_id,
      data: payload.data ?? {}
    })
  });

  const json = await response.json().catch(() => ({}));
  return {
    ok: response.ok && json?.ok !== false,
    status: response.status,
    result: json
  };
}

export async function sendTransportPushToUser(
  supabase: any,
  supabaseUrl: string,
  input: {
    userId?: string | null;
    role: "cliente" | "chofer";
    title: string;
    body: string;
    viajeId?: string | null;
    choferId?: string | null;
    data?: Record<string, unknown>;
  }
) {
  const userId = safeText(input.userId);
  if (!userId) return { ok: false, skipped: true, reason: "missing_user_id" };

  const { data, error } = await supabase
    .from("push_tokens")
    .select("token")
    .eq("user_id", userId)
    .eq("rol", input.role)
    .limit(20);

  if (error) {
    console.warn("[transport-push] token query error:", error);
    return { ok: false, skipped: true, reason: "token_query_error", error: error.message };
  }

  return sendTransportPushTokens(
    supabaseUrl,
    (data ?? []).map((row: { token?: string }) => row.token ?? ""),
    {
      title: input.title,
      body: input.body,
      viaje_id: input.viajeId,
      chofer_id: input.choferId,
      data: input.data
    }
  );
}

export async function notifyTransportDriverOffer(
  supabase: any,
  supabaseUrl: string,
  input: {
    viajeId: string;
    ofertaId: string;
    choferId: string;
    expiresAt?: string | null;
    etaMin?: number | null;
  }
) {
  const { data: chofer, error } = await supabase
    .from("choferes")
    .select("id_uuid, user_id")
    .eq("id_uuid", input.choferId)
    .maybeSingle();

  if (error || !chofer?.user_id) {
    return { ok: false, skipped: true, reason: "driver_user_not_found", error: error?.message };
  }

  return sendTransportPushToUser(supabase, supabaseUrl, {
    userId: chofer.user_id,
    role: "chofer",
    title: "Nuevo viaje disponible",
    body: "Tenes una solicitud cerca. Toca para verla y responder.",
    viajeId: input.viajeId,
    choferId: input.choferId,
    data: {
      type: "trip_offer",
      viaje_id: input.viajeId,
      oferta_id: input.ofertaId,
      chofer_id_uuid: input.choferId,
      expires_at: input.expiresAt ?? "",
      eta_min: String(input.etaMin ?? ""),
      url: DEFAULT_DRIVER_URL,
      tag: input.viajeId
    }
  });
}

export async function notifyTransportClientTripStatus(
  supabase: any,
  supabaseUrl: string,
  input: {
    viajeId: string;
    choferId?: string | null;
    title: string;
    body: string;
    type: string;
    status: string;
  }
) {
  const { data: viaje, error } = await supabase
    .from("viajes")
    .select("id, cliente_auth_id")
    .eq("id", input.viajeId)
    .maybeSingle();

  if (error || !viaje?.cliente_auth_id) {
    return { ok: false, skipped: true, reason: "client_user_not_found", error: error?.message };
  }

  return sendTransportPushToUser(supabase, supabaseUrl, {
    userId: viaje.cliente_auth_id,
    role: "cliente",
    title: input.title,
    body: input.body,
    viajeId: input.viajeId,
    choferId: input.choferId,
    data: {
      type: input.type,
      status: input.status,
      viaje_id: input.viajeId,
      chofer_id_uuid: input.choferId ?? "",
      url: DEFAULT_CLIENT_URL,
      tag: input.viajeId
    }
  });
}

export async function notifyTransportDriverTripStatus(
  supabase: any,
  supabaseUrl: string,
  input: {
    viajeId: string;
    choferId?: string | null;
    title: string;
    body: string;
    type: string;
    status: string;
  }
) {
  const choferId = safeText(input.choferId);
  if (!choferId) return { ok: false, skipped: true, reason: "missing_driver_id" };

  const { data: chofer, error } = await supabase
    .from("choferes")
    .select("id_uuid, user_id")
    .eq("id_uuid", choferId)
    .maybeSingle();

  if (error || !chofer?.user_id) {
    return { ok: false, skipped: true, reason: "driver_user_not_found", error: error?.message };
  }

  return sendTransportPushToUser(supabase, supabaseUrl, {
    userId: chofer.user_id,
    role: "chofer",
    title: input.title,
    body: input.body,
    viajeId: input.viajeId,
    choferId,
    data: {
      type: input.type,
      status: input.status,
      viaje_id: input.viajeId,
      chofer_id_uuid: choferId,
      url: DEFAULT_DRIVER_URL,
      tag: input.viajeId
    }
  });
}
