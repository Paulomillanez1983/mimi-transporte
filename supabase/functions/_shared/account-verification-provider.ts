export type AccountVerificationHolder = {
  name?: string | null;
  taxId?: string | null;
  taxIdHash?: string | null;
  taxIdLast4?: string | null;
};

export type AccountVerificationRequest = {
  accountType: string;
  cbu?: string | null;
  cvu?: string | null;
  alias?: string | null;
  declaredHolderName?: string | null;
  declaredHolderTaxId?: string | null;
  isTest: boolean;
  environment: string;
  metadata?: Record<string, unknown>;
};

export type AccountVerificationResult = {
  provider: string;
  configured: boolean;
  status:
    | "pending_external_verification"
    | "verification_failed"
    | "verified_response";
  accountActive: boolean | null;
  accountType?: string | null;
  bankName?: string | null;
  holders: AccountVerificationHolder[];
  rawResponse: Record<string, unknown>;
  errorCode?: string | null;
  errorMessage?: string | null;
};

function envFlag(name: string, fallback = false) {
  const value = String(Deno.env.get(name) ?? "").trim().toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value);
}

function normalizeProvider(value: string | null) {
  const provider = String(value ?? "manual").trim().toLowerCase();
  if (["mock", "test", "manual", "bind", "redlink", "external_api"].includes(provider)) {
    return provider === "test" ? "mock" : provider;
  }
  return "manual";
}

function normalizeExternalHolder(value: unknown): AccountVerificationHolder {
  const row = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    name: typeof row.name === "string" ? row.name : typeof row.holder_name === "string" ? row.holder_name : null,
    taxId: typeof row.tax_id === "string" ? row.tax_id : typeof row.cuit === "string" ? row.cuit : typeof row.cuil === "string" ? row.cuil : null,
    taxIdHash: typeof row.tax_id_hash === "string" ? row.tax_id_hash : null,
    taxIdLast4: typeof row.tax_id_last4 === "string" ? row.tax_id_last4 : null
  };
}

export function configuredAccountVerificationProvider() {
  return normalizeProvider(Deno.env.get("ACCOUNT_VERIFICATION_PROVIDER"));
}

export async function verifyAccountWithProvider(
  request: AccountVerificationRequest
): Promise<AccountVerificationResult> {
  const provider = configuredAccountVerificationProvider();
  const enabled = envFlag("ACCOUNT_VERIFICATION_ENABLED", false);
  const baseUrl = String(Deno.env.get("ACCOUNT_VERIFICATION_BASE_URL") ?? "").trim();
  const apiKey = String(Deno.env.get("ACCOUNT_VERIFICATION_API_KEY") ?? "").trim();

  if (provider === "mock") {
    const allowed = request.isTest || ["qa", "sandbox", "internal_testing", "development"].includes(request.environment);
    if (!allowed) {
      return {
        provider,
        configured: true,
        status: "pending_external_verification",
        accountActive: null,
        holders: [],
        errorCode: "MOCK_PROVIDER_NOT_ALLOWED_FOR_PRODUCTION_ACCOUNT",
        errorMessage: "Mock account verification is restricted to test/sandbox/internal accounts.",
        rawResponse: { provider, allowed: false, account_type: request.accountType }
      };
    }

    return {
      provider,
      configured: true,
      status: "verified_response",
      accountActive: true,
      accountType: request.accountType,
      bankName: request.metadata?.bank_name as string || "Mock bank",
      holders: [{
        name: request.declaredHolderName ?? "Mock holder",
        taxId: request.declaredHolderTaxId ?? null
      }],
      rawResponse: {
        provider,
        mode: "mock",
        account_active: true,
        account_type: request.accountType,
        holder_count: request.declaredHolderTaxId ? 1 : 0
      }
    };
  }

  if (!enabled || provider === "manual" || !baseUrl || !apiKey) {
    return {
      provider,
      configured: false,
      status: "pending_external_verification",
      accountActive: null,
      holders: [],
      errorCode: "ACCOUNT_VERIFICATION_PROVIDER_NOT_CONFIGURED",
      errorMessage: "Configure ACCOUNT_VERIFICATION_PROVIDER/API secrets before approving ownership automatically.",
      rawResponse: {
        provider,
        enabled,
        has_base_url: Boolean(baseUrl),
        has_api_key: Boolean(apiKey),
        configured: false
      }
    };
  }

  if (!["bind", "redlink", "external_api"].includes(provider)) {
    return {
      provider,
      configured: false,
      status: "pending_external_verification",
      accountActive: null,
      holders: [],
      errorCode: "ACCOUNT_VERIFICATION_PROVIDER_UNSUPPORTED",
      rawResponse: { provider }
    };
  }

  try {
    const response = await fetch(baseUrl.replace(/\/$/, "") + "/verify-account", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        account_type: request.accountType,
        cbu: request.cbu || undefined,
        cvu: request.cvu || undefined,
        alias: request.alias || undefined
      })
    });

    const raw = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        provider,
        configured: true,
        status: "verification_failed",
        accountActive: null,
        holders: [],
        errorCode: `ACCOUNT_VERIFICATION_HTTP_${response.status}`,
        errorMessage: typeof raw?.message === "string" ? raw.message : "Verification provider request failed.",
        rawResponse: { provider, status: response.status, body: raw }
      };
    }

    const holders = Array.isArray(raw?.holders)
      ? raw.holders.map(normalizeExternalHolder)
      : Array.isArray(raw?.owners)
        ? raw.owners.map(normalizeExternalHolder)
        : [];

    return {
      provider,
      configured: true,
      status: "verified_response",
      accountActive: typeof raw?.account_active === "boolean" ? raw.account_active : Boolean(raw?.active ?? true),
      accountType: typeof raw?.account_type === "string" ? raw.account_type : request.accountType,
      bankName: typeof raw?.bank_name === "string" ? raw.bank_name : typeof raw?.bank === "string" ? raw.bank : null,
      holders,
      rawResponse: {
        provider,
        account_active: raw?.account_active ?? raw?.active ?? null,
        account_type: raw?.account_type ?? request.accountType,
        bank_name: raw?.bank_name ?? raw?.bank ?? null,
        holders: raw?.holders ?? raw?.owners ?? []
      }
    };
  } catch (error) {
    return {
      provider,
      configured: true,
      status: "verification_failed",
      accountActive: null,
      holders: [],
      errorCode: "ACCOUNT_VERIFICATION_PROVIDER_ERROR",
      errorMessage: error instanceof Error ? error.message : String(error),
      rawResponse: { provider, error: error instanceof Error ? error.message : String(error) }
    };
  }
}
