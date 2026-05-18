type SupabaseClientLike = {
  from: (table: string) => any;
};

export type OperationLock = {
  id: string;
  operation_type: string;
  operation_key: string;
  status: string;
  idempotency_key: string;
  trace_id: string;
  correlation_id: string;
  response_json?: Record<string, unknown> | null;
  error_code?: string | null;
  error_message?: string | null;
};

export async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(",")}}`;
}

export function asOperationLock(row: Record<string, unknown> | null): OperationLock | null {
  if (!row?.id) return null;
  return {
    id: String(row.id),
    operation_type: String(row.operation_type ?? ""),
    operation_key: String(row.operation_key ?? ""),
    status: String(row.status ?? ""),
    idempotency_key: String(row.idempotency_key ?? ""),
    trace_id: String(row.trace_id ?? ""),
    correlation_id: String(row.correlation_id ?? ""),
    response_json: row.response_json as Record<string, unknown> | null,
    error_code: row.error_code as string | null,
    error_message: row.error_message as string | null
  };
}

export async function reserveOperationLock(
  supabase: SupabaseClientLike,
  params: {
    operationType: string;
    operationKey: string;
    idempotencyKey: string;
    providerName: string;
    paymentId?: string | null;
    providerPaymentId?: string | null;
    providerEventId?: string | null;
    requestBody?: unknown;
    rawEvent?: Record<string, unknown> | null;
    actorUserId?: string | null;
    traceId?: string | null;
    correlationId?: string | null;
    environment?: string;
    isTest?: boolean;
    fiscalVisibility?: string;
    metadata?: Record<string, unknown>;
  }
) {
  const traceId = params.traceId ?? crypto.randomUUID();
  const correlationId = params.correlationId ?? params.idempotencyKey;
  const requestHash = params.requestBody === undefined ? null : await sha256Hex(stableStringify(params.requestBody));

  const { data: inserted, error: insertError } = await supabase
    .from("financial_operation_locks")
    .insert({
      operation_type: params.operationType,
      operation_key: params.operationKey,
      status: "processing",
      provider_name: params.providerName,
      provider_payment_id: params.providerPaymentId ?? null,
      provider_event_id: params.providerEventId ?? null,
      payment_id: params.paymentId ?? null,
      idempotency_key: params.idempotencyKey,
      request_hash: requestHash,
      raw_event: params.rawEvent ?? null,
      trace_id: traceId,
      correlation_id: correlationId,
      locked_by: params.actorUserId ?? null,
      locked_until: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      environment: params.environment ?? "production",
      is_test: Boolean(params.isTest),
      fiscal_visibility: params.fiscalVisibility ?? (params.isTest ? "sandbox_only" : "fiscal_reportable"),
      metadata: params.metadata ?? {}
    })
    .select("*")
    .single();

  if (!insertError && inserted) {
    return { lock: asOperationLock(inserted), replay: false, conflict: false };
  }

  const { data: existing } = await supabase
    .from("financial_operation_locks")
    .select("*")
    .eq("operation_type", params.operationType)
    .eq("operation_key", params.operationKey)
    .maybeSingle();

  const lock = asOperationLock(existing);
  return {
    lock,
    replay: lock?.status === "succeeded",
    conflict: lock?.status === "processing" || lock?.status === "reserved",
    insertError
  };
}

export async function markOperationSucceeded(
  supabase: SupabaseClientLike,
  lockId: string | null | undefined,
  response: Record<string, unknown>
) {
  if (!lockId) return;
  await supabase
    .from("financial_operation_locks")
    .update({
      status: "succeeded",
      response_json: response,
      error_code: null,
      error_message: null,
      processed_at: new Date().toISOString(),
      locked_until: null
    })
    .eq("id", lockId);
}

export async function markOperationFailed(
  supabase: SupabaseClientLike,
  lockId: string | null | undefined,
  errorCode: string,
  errorMessage: string,
  retryable = false
) {
  if (!lockId) return;
  await supabase
    .from("financial_operation_locks")
    .update({
      status: retryable ? "retryable_failed" : "failed",
      error_code: errorCode,
      error_message: errorMessage.slice(0, 1000),
      processed_at: new Date().toISOString(),
      locked_until: null
    })
    .eq("id", lockId);
}
