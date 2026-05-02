
const SupabaseSDK = window.supabase;
const SUPABASE_URL = "https://xrphpqmutvadjrucqicn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhycGhwcW11dHZhZGpydWNxaWNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MDY5ODgsImV4cCI6MjA4OTk4Mjk4OH0.0nsO3GBevQzMBCvne17I9L5_Yi4VPYiWedxyntLr4uM";

const NETWORK_TIMEOUT_MS = 20000;
const CACHE_MAX_SIZE = 100;

function normalizarBusqueda(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function getPublicSupabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    Accept: "application/json",
    ...extra
  };
}
function getAuthSupabaseHeaders(accessToken, extra = {}) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
    ...extra
  };
}  
async function safeReadJson(response) {
  if (!response) return null;

  const contentType = response.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      return await response.json();
    }

    const text = await response.text();
    return text ? { raw: text } : null;
  } catch (_) {
    return null;
  }
}

async function safeFetch(url, options = {}, timeoutMs = NETWORK_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("CLIENT_TIMEOUT"), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    return {
      ok: response.ok,
      response,
      elapsedMs: Date.now() - startedAt,
      aborted: false,
      timeout: false,
      error: null
    };
  } catch (err) {
    const isAbort =
      err?.name === "AbortError" ||
      String(err?.message || "").toLowerCase().includes("aborted") ||
      String(err?.message || "").toLowerCase().includes("timeout");

    return {
      ok: false,
      response: null,
      elapsedMs: Date.now() - startedAt,
      aborted: isAbort,
      timeout: isAbort,
      error: err
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildNetworkError(result, fallbackMessage = "Error de red") {
  return {
    message: result?.timeout
      ? "La solicitud tardó demasiado"
      : (result?.error?.message || fallbackMessage),
    code: result?.timeout ? "CLIENT_TIMEOUT" : "NETWORK_ERROR",
    aborted: !!result?.aborted,
    timeout: !!result?.timeout,
    elapsedMs: result?.elapsedMs ?? null
  };
}

function buildHttpError(status, payload = null, fallbackMessage = "Error HTTP") {
  const payloadIsObject = payload && typeof payload === "object" && !Array.isArray(payload);

  return {
    ...(payloadIsObject ? payload : {}),
    message:
      payload?.message ||
      payload?.error ||
      payload?.msg ||
      payload?.raw ||
      fallbackMessage,
    code: "HTTP_ERROR",
    status: status ?? null
  };
}

function appendFilter(url, column, operator, value) {
  if (!column || typeof operator !== "string") return url;
  if (value === undefined) return url;

  return `${url}&${encodeURIComponent(column)}=${operator}.${encodeURIComponent(value)}`;
}

function createQueryBuilder(table) {
  const state = {
    table,
    columns: "*",
    filters: [],
    orderBy: null,
    orderAscending: true,
    single: false,
    limitValue: null
  };

  const builder = {
    select(columns = "*") {
      state.columns = columns || "*";
      return this;
    },
    eq(column, value) {
      state.filters.push({ type: "eq", column, value });
      return this;
    },
    neq(column, value) {
      state.filters.push({ type: "neq", column, value });
      return this;
    },
    gt(column, value) {
      state.filters.push({ type: "gt", column, value });
      return this;
    },
    lt(column, value) {
      state.filters.push({ type: "lt", column, value });
      return this;
    },
    gte(column, value) {
      state.filters.push({ type: "gte", column, value });
      return this;
    },
    lte(column, value) {
      state.filters.push({ type: "lte", column, value });
      return this;
    },
    like(column, pattern) {
      state.filters.push({ type: "like", column, value: pattern });
      return this;
    },
    ilike(column, pattern) {
      state.filters.push({ type: "ilike", column, value: pattern });
      return this;
    },
    in(column, values) {
      state.filters.push({
        type: "in",
        column,
        value: Array.isArray(values) ? values : [values]
      });
      return this;
    },
    is(column, value) {
      state.filters.push({ type: "is", column, value });
      return this;
    },
    or(conditions) {
      state.filters.push({ type: "or", value: conditions });
      return this;
    },
    order(column, { ascending = true } = {}) {
      state.orderBy = column;
      state.orderAscending = ascending;
      return this;
    },
    limit(n) {
      const parsed = Number(n);
      state.limitValue = Number.isFinite(parsed) ? parsed : null;
      return this;
    },
    single() {
      state.single = true;
      return this;
    },
    then(onResolve, onReject) {
      return this.execute().then(onResolve, onReject);
    },

    async execute() {
      try {
        if (!state.table) {
          return {
            data: null,
            error: {
              message: "Tabla inválida",
              code: "INVALID_TABLE"
            }
          };
        }

        let url = `${SUPABASE_URL}/rest/v1/${encodeURIComponent(state.table)}?select=${encodeURIComponent(state.columns)}`;

        state.filters.forEach(filter => {
          switch (filter.type) {
            case "eq":
            case "neq":
            case "gt":
            case "lt":
            case "gte":
            case "lte":
            case "like":
            case "ilike":
              url = appendFilter(url, filter.column, filter.type, filter.value);
              break;

            case "in": {
              const vals = (Array.isArray(filter.value) ? filter.value : [])
                .filter(v => v !== undefined)
                .map(v => `"${String(v).replace(/"/g, '\\"')}"`)
                .join(",");

              url += `&${encodeURIComponent(filter.column)}=in.(${encodeURIComponent(vals)})`;
              break;
            }

            case "is":
              url = appendFilter(url, filter.column, "is", filter.value);
              break;

            case "or":
              if (filter.value) {
                url += `&or=${encodeURIComponent(`(${filter.value})`)}`;
              }
              break;
          }
        });

        if (state.orderBy) {
          const direction = state.orderAscending ? "asc" : "desc";
          url += `&order=${encodeURIComponent(state.orderBy)}.${direction}`;
        }

        if (state.limitValue !== null) {
          url += `&limit=${state.limitValue}`;
        }

        const result = await safeFetch(url, {
          method: "GET",
          headers: getPublicSupabaseHeaders()
        });

        if (!result.response) {
          return {
            data: null,
            error: buildNetworkError(result, "No se pudo consultar Supabase")
          };
        }

        const data = await safeReadJson(result.response);

        if (!result.response.ok) {
          return {
            data: null,
            error: buildHttpError(result.response.status, data, "Error al consultar Supabase")
          };
        }

        if (state.single && Array.isArray(data)) {
          return { data: data[0] || null, error: null };
        }

        return { data, error: null };
      } catch (err) {
        return {
          data: null,
          error: {
            message: err?.message || "Error inesperado en consulta",
            code: "UNEXPECTED_QUERY_ERROR"
          }
        };
      }
    }
  };

  return builder;
}
window.supabaseRest = {
  from(table) {
    return createQueryBuilder(table);
  },

  async rpc(functionName, params = {}) {
    try {
      const result = await safeFetch(
        `${SUPABASE_URL}/rest/v1/rpc/${encodeURIComponent(functionName)}`,
        {
          method: "POST",
          headers: getPublicSupabaseHeaders({
            "Content-Type": "application/json"
          }),
          body: JSON.stringify(params ?? {})
        }
      );

      if (!result.response) {
        return {
          data: null,
          error: buildNetworkError(result, "No se pudo ejecutar la función RPC")
        };
      }

      const data = await safeReadJson(result.response);

      if (!result.response.ok) {
        return {
          data: null,
          error: buildHttpError(result.response.status, data, "Error ejecutando RPC")
        };
      }

      return { data, error: null };
    } catch (err) {
      return {
        data: null,
        error: {
          message: err?.message || "Error inesperado en RPC",
          code: "UNEXPECTED_RPC_ERROR"
        }
      };
    }
  }
};

/* compat layer */
window.supabaseFrom = (table) => window.supabaseRest.from(table);
window.supabaseRpc = (functionName, params = {}) =>
  window.supabaseRest.rpc(functionName, params);
  
if (SupabaseSDK?.createClient) {
  window.sbRealtime = SupabaseSDK.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storageKey: 'mimi-cliente-auth'
    },
    global: {
      headers: {
        apikey: SUPABASE_ANON_KEY
      }
    },
    realtime: {
      params: { eventsPerSecond: 10 }
    }
  });
} else {
  console.error('No se pudo inicializar Supabase Realtime/Auth');
}
window.supabaseUpdate = async function(table, matchColumn, matchValue, data, accessToken = null) {
  try {
    const url = `${SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}?${encodeURIComponent(matchColumn)}=eq.${encodeURIComponent(matchValue)}`;

    const headers = accessToken
      ? getAuthSupabaseHeaders(accessToken, {
          "Content-Type": "application/json",
          Prefer: "return=representation"
        })
      : getPublicSupabaseHeaders({
          "Content-Type": "application/json",
          Prefer: "return=representation"
        });

    const result = await safeFetch(url, {
      method: "PATCH",
      headers,
      body: JSON.stringify(data ?? {})
    });

    if (!result.response) {
      return {
        data: null,
        error: buildNetworkError(result, "No se pudo actualizar el registro")
      };
    }

    const responseData = await safeReadJson(result.response);

    if (!result.response.ok) {
      return {
        data: null,
        error: buildHttpError(result.response.status, responseData, "Error actualizando datos")
      };
    }

    return { data: responseData, error: null };
  } catch (err) {
    return {
      data: null,
      error: {
        message: err?.message || "Error inesperado al actualizar",
        code: "UNEXPECTED_UPDATE_ERROR"
      }
    };
  }
};

window.supabaseInsert = async function(table, data, accessToken = null) {
  try {
    const body = Array.isArray(data) ? data : [data];

    const headers = accessToken
      ? getAuthSupabaseHeaders(accessToken, {
          "Content-Type": "application/json",
          Prefer: "return=representation"
        })
      : getPublicSupabaseHeaders({
          "Content-Type": "application/json",
          Prefer: "return=representation"
        });

    const result = await safeFetch(
      `${SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      }
    );

    if (!result.response) {
      return {
        data: null,
        error: buildNetworkError(result, "No se pudo insertar el registro")
      };
    }

    const responseData = await safeReadJson(result.response);

    if (!result.response.ok) {
      return {
        data: null,
        error: buildHttpError(result.response.status, responseData, "Error insertando datos")
      };
    }

    return {
      data: Array.isArray(responseData) ? responseData[0] : responseData,
      error: null
    };
  } catch (err) {
    return {
      data: null,
      error: {
        message: err?.message || "Error inesperado al insertar",
        code: "UNEXPECTED_INSERT_ERROR"
      }
    };
  }
};
