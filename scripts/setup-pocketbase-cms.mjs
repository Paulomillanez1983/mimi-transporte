#!/usr/bin/env node

const REQUIRED_ENV = [
  "POCKETBASE_URL",
  "POCKETBASE_ADMIN_EMAIL",
  "POCKETBASE_ADMIN_PASSWORD"
];

const CLI_FLAGS = new Set(process.argv.slice(2));
const DRY_RUN = CLI_FLAGS.has("--dry-run") || CLI_FLAGS.has("--check");
const NO_SEED = CLI_FLAGS.has("--no-seed");

if (CLI_FLAGS.has("--help") || CLI_FLAGS.has("-h")) {
  printHelp();
  process.exit(0);
}

const CMS_RULE_ACTIVE = "active=true";
const CMS_RULE_LEGACY = "enabled=true";

const COLLECTIONS = {
  app_config: {
    fields: [
      textField("key", { required: true, max: 120 }),
      jsonField("value"),
      textField("description", { max: 240 }),
      boolField("active"),
      dateField("updated_at")
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_app_config_key ON app_config (key)"
    ]
  },
  home_sections: {
    fields: [
      textField("slug", { required: true, max: 120 }),
      textField("title", { required: true, max: 160 }),
      textField("subtitle", { max: 220 }),
      editorField("body"),
      textField("layout", { max: 80 }),
      jsonField("data"),
      numberField("order"),
      boolField("active"),
      dateField("start_at"),
      dateField("end_at")
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_home_sections_slug ON home_sections (slug)",
      "CREATE INDEX idx_home_sections_active_order ON home_sections (active, \"order\")"
    ]
  },
  service_categories: {
    fields: [
      textField("slug", { required: true, max: 120 }),
      textField("name", { required: true, max: 120 }),
      textField("description", { max: 600 }),
      textField("icon", { max: 80 }),
      textField("image", { max: 500 }),
      textField("parent_slug", { max: 120 }),
      numberField("order"),
      boolField("active"),
      boolField("featured"),
      boolField("online"),
      numberField("radius_km", { min: 0 }),
      jsonField("tags")
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_service_categories_slug ON service_categories (slug)",
      "CREATE INDEX idx_service_categories_active_order ON service_categories (active, \"order\")"
    ]
  },
  banners: {
    fields: [
      textField("slug", { required: true, max: 120 }),
      textField("title", { required: true, max: 160 }),
      textField("subtitle", { max: 240 }),
      editorField("body"),
      textField("image", { max: 500 }),
      textField("cta_label", { max: 80 }),
      textField("cta_url", { max: 180 }),
      textField("placement", { max: 80 }),
      numberField("order"),
      boolField("active"),
      dateField("start_at"),
      dateField("end_at")
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_banners_slug ON banners (slug)",
      "CREATE INDEX idx_banners_active_placement_order ON banners (active, placement, \"order\")"
    ]
  },
  faqs: {
    fields: [
      textField("question", { required: true, max: 240 }),
      editorField("answer"),
      textField("category", { max: 80 }),
      numberField("order"),
      boolField("active")
    ],
    indexes: [
      "CREATE INDEX idx_faqs_active_category_order ON faqs (active, category, \"order\")"
    ]
  },
  feature_flags: {
    fields: [
      textField("key", { required: true, max: 120 }),
      boolField("enabled"),
      textField("description", { max: 240 }),
      jsonField("payload"),
      textField("environment", { max: 40 }),
      boolField("active")
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_feature_flags_key ON feature_flags (key)"
    ]
  }
};

const SEED = {
  banners: [
    {
      slug: "client-service-search",
      title: "Servicios confiables cerca tuyo",
      subtitle: "Elegi prestadores verificados y envia una solicitud real desde MIMI.",
      body: "Contenido visual editable desde PocketBase. Las solicitudes reales siguen en Supabase.",
      image: "",
      cta_label: "Buscar servicio",
      cta_url: "/servicios",
      placement: "client",
      order: 10,
      active: true,
      start_at: "",
      end_at: ""
    },
    {
      slug: "provider-workspace",
      title: "Tu panel de trabajo, mas liviano",
      subtitle: "Recibi solicitudes, valida el PIN e inicia servicios sin tracking innecesario.",
      body: "Optimizacion visual y CMS desacoplado para prestadores.",
      image: "",
      cta_label: "Ir al panel",
      cta_url: "/prestador",
      placement: "provider",
      order: 20,
      active: true,
      start_at: "",
      end_at: ""
    }
  ],
  home_sections: [
    {
      slug: "client-home-intro",
      title: "Pedi ayuda a domicilio",
      subtitle: "MIMI conecta clientes con prestadores independientes.",
      body: "Busca por rubro, compara opciones y envia una solicitud al prestador elegido.",
      layout: "compact",
      data: { route: "/servicios", placement: "client" },
      order: 10,
      active: true,
      start_at: "",
      end_at: ""
    },
    {
      slug: "provider-home-intro",
      title: "Trabaja con solicitudes reales",
      subtitle: "Recibi pedidos cuando estas online.",
      body: "El prestador decide aceptar o rechazar. El servicio empieza al validar el PIN del cliente.",
      layout: "compact",
      data: { route: "/prestador", placement: "provider" },
      order: 20,
      active: true,
      start_at: "",
      end_at: ""
    },
    {
      slug: "admin-cms-intro",
      title: "CMS visual sin tocar produccion",
      subtitle: "Banners, textos y rubros visuales editables desde PocketBase.",
      body: "Supabase conserva auth, pedidos, pagos, KYC y realtime critico.",
      layout: "admin_note",
      data: { placement: "admin" },
      order: 30,
      active: true,
      start_at: "",
      end_at: ""
    }
  ],
  service_categories: [
    category("Limpieza", "limpieza", "Servicio de limpieza para hogares, oficinas y mantenimiento general.", 10),
    category("Plomeria", "plomeria", "Reparaciones, perdidas, griferia y urgencias simples.", 20),
    category("Electricidad", "electricidad", "Instalaciones, enchufes, luminarias y revisiones electricas.", 30),
    category("Pintura", "pintura", "Pintura interior, exterior y retoques.", 40),
    category("Jardineria", "jardineria", "Corte, poda, limpieza y mantenimiento de espacios verdes.", 50),
    category("Cuidado de adultos", "cuidado-adultos", "Acompanamiento y cuidado cotidiano de personas mayores.", 60)
  ],
  faqs: [
    faq("MIMI presta directamente los servicios?", "No. MIMI conecta usuarios con prestadores independientes.", "client", 10),
    faq("Cuando empieza un servicio?", "El servicio empieza cuando el prestador valida el PIN de 4 digitos del cliente.", "client", 20),
    faq("PocketBase maneja pagos o pedidos?", "No. PocketBase solo administra contenido visual. Supabase conserva el backend critico.", "admin", 30),
    faq("El prestador comparte GPS todo el tiempo?", "No. En MIMI Servicios el tracking se reduce y solo se usa cuando el flujo activo lo necesita.", "provider", 40)
  ],
  feature_flags: [
    flag("pocketbase_cms_enabled", true, "Habilita lectura de contenido visual desde PocketBase."),
    flag("enable_home_banners", true, "Habilita banners visuales no criticos."),
    flag("enable_dynamic_categories", true, "Habilita rubros visuales desde CMS con fallback local."),
    flag("enable_faqs", true, "Habilita FAQs visuales desde CMS."),
    flag("enable_provider_highlights", true, "Habilita destacados visuales para prestadores."),
    flag("realtime_optimized_enabled", true, "Usa canales scoped y pausa realtime no critico."),
    flag("provider_tracking_optimized", true, "Reduce frecuencia de tracking de prestadores en servicios activos."),
    flag("nearby_snapshot_cache_enabled", true, "Cachea snapshots de prestadores cercanos por ventana corta.")
  ],
  app_config: [
    {
      key: "cms_version",
      value: { version: "2026.05.11.1", owner: "mimi-services" },
      description: "Version logica del contenido CMS visual.",
      active: true,
      updated_at: new Date().toISOString()
    }
  ]
};

main().catch((error) => {
  console.error(`[PB_CMS_SETUP_FAILED] ${safeErrorMessage(error)}`);
  process.exitCode = 1;
});

async function main() {
  const env = readEnv();
  const auth = await authenticate(env);
  const collections = await listCollections(env, auth.token);
  const existingNames = collections.map((collection) => collection.name);

  console.log("PB_ENV_OK");
  console.log("PB_AUTH_OK");
  console.log(`PB_COLLECTIONS_BEFORE=${existingNames.join(",") || "(none)"}`);

  const created = [];
  const present = [];
  const rulesUpdated = [];
  const dryRunMissing = [];
  const dryRunRuleUpdates = [];

  for (const [name, definition] of Object.entries(COLLECTIONS)) {
    const existing = collections.find((collection) => collection.name === name);
    if (existing) {
      present.push(name);
      const rule = cmsRuleForCollection(existing);
      if (needsCmsRulesUpdate(existing, rule)) {
        if (DRY_RUN) {
          dryRunRuleUpdates.push(name);
          continue;
        }
        await updateCollectionRules(env, auth.token, existing.id || name, rule);
        rulesUpdated.push(name);
      }
      continue;
    }

    if (DRY_RUN) {
      dryRunMissing.push(name);
      continue;
    }

    await createCollection(env, auth.token, name, definition);
    created.push(name);
  }

  if (DRY_RUN) {
    console.log(`PB_COLLECTIONS_PRESENT=${present.join(",") || "(none)"}`);
    console.log(`PB_DRY_RUN_MISSING_COLLECTIONS=${dryRunMissing.join(",") || "(none)"}`);
    console.log(`PB_DRY_RUN_RULE_UPDATES=${dryRunRuleUpdates.join(",") || "(none)"}`);
    console.log("PB_DRY_RUN_OK");
    return;
  }

  const finalCollections = await listCollections(env, auth.token);
  const seeded = [];

  if (!NO_SEED) {
    for (const [collection, records] of Object.entries(SEED)) {
      const schema = finalCollections.find((item) => item.name === collection);
      for (const record of records) {
        const adaptedRecord = adaptRecordToSchema(record, schema);
        const exists = await recordExists(env, auth.token, collection, uniqueFilter(collection, adaptedRecord, schema));
        if (exists) continue;
        await createRecord(env, auth.token, collection, adaptedRecord);
        seeded.push(`${collection}:${adaptedRecord.key || adaptedRecord.slug || adaptedRecord.title || adaptedRecord.question}`);
      }
    }
  }

  console.log(`PB_COLLECTIONS_PRESENT=${present.join(",") || "(none)"}`);
  console.log(`PB_COLLECTIONS_CREATED=${created.join(",") || "(none)"}`);
  console.log(`PB_COLLECTION_RULES_UPDATED=${rulesUpdated.join(",") || "(none)"}`);
  console.log(`PB_RECORDS_SEEDED=${seeded.length}`);
  if (NO_SEED) console.log("PB_SEED_SKIPPED=1");
  seeded.forEach((item) => console.log(`PB_SEEDED=${item}`));
  console.log("PB_CMS_SETUP_OK");
}

function printHelp() {
  console.log(`Usage: node scripts/setup-pocketbase-cms.mjs [options]

Creates or updates public-read CMS collections in PocketBase and seeds safe visual content.

Required environment variables:
  POCKETBASE_URL
  POCKETBASE_ADMIN_EMAIL
  POCKETBASE_ADMIN_PASSWORD

Options:
  --help, -h    Show this message without connecting to PocketBase.
  --dry-run     Authenticate and report missing collections/rules without writing.
  --check       Alias of --dry-run.
  --no-seed     Create/update collections and rules, but do not seed records.

Security:
  Do not include angle brackets around env values.
  Do not commit .env.local or any admin credentials.
`);
}

function readEnv() {
  const missing = REQUIRED_ENV.filter((key) => !String(process.env[key] || "").trim());
  if (missing.length) {
    throw new Error(`PB_ENV_MISSING:${missing.join(",")}`);
  }

  return {
    url: String(process.env.POCKETBASE_URL).replace(/\/+$/, ""),
    email: String(process.env.POCKETBASE_ADMIN_EMAIL),
    password: String(process.env.POCKETBASE_ADMIN_PASSWORD)
  };
}

async function authenticate(env) {
  const attempts = [];
  const adminAttempts = [
    {
      label: "superusers:identity",
      path: "/api/collections/_superusers/auth-with-password",
      body: { identity: env.email, password: env.password }
    },
    {
      label: "superusers:email",
      path: "/api/collections/_superusers/auth-with-password",
      body: { email: env.email, password: env.password }
    },
    {
      label: "admins:identity",
      path: "/api/admins/auth-with-password",
      body: { identity: env.email, password: env.password }
    },
    {
      label: "admins:email",
      path: "/api/admins/auth-with-password",
      body: { email: env.email, password: env.password }
    }
  ];

  for (const attempt of adminAttempts) {
    const response = await request(env, attempt.path, {
      method: "POST",
      body: attempt.body,
      allowFailure: true
    });
    if (response?.token) return response;
    attempts.push(authAttemptSummary(attempt.label, response));
  }

  const userProbe = await request(env, "/api/collections/users/auth-with-password", {
    method: "POST",
    body: { identity: env.email, password: env.password },
    allowFailure: true
  });

  if (userProbe?.token) {
    throw new Error(`PB_AUTH_FAILED:credentials_are_for_users_collection_not_superuser:${attempts.join(";")}`);
  }

  attempts.push(authAttemptSummary("users:identity_probe", userProbe));
  throw new Error(`PB_AUTH_FAILED:${authFailureHint(attempts)}:${attempts.join(";")}`);
}

async function listCollections(env, token) {
  const data = await request(env, "/api/collections?perPage=200", { token });
  return Array.isArray(data?.items) ? data.items : [];
}

async function createCollection(env, token, name, definition) {
  return request(env, "/api/collections", {
    method: "POST",
    token,
    body: {
      name,
      type: "base",
      ...cmsRulesPayload(CMS_RULE_ACTIVE),
      fields: definition.fields,
      indexes: definition.indexes || []
    }
  });
}

async function updateCollectionRules(env, token, collectionIdOrName, rule) {
  return request(env, `/api/collections/${encodeURIComponent(collectionIdOrName)}`, {
    method: "PATCH",
    token,
    body: cmsRulesPayload(rule)
  });
}

async function recordExists(env, token, collection, filter) {
  const query = new URLSearchParams({ perPage: "1", filter });
  const data = await request(env, `/api/collections/${collection}/records?${query}`, { token });
  return Array.isArray(data?.items) && data.items.length > 0;
}

async function createRecord(env, token, collection, record) {
  return request(env, `/api/collections/${collection}/records`, {
    method: "POST",
    token,
    body: record
  });
}

async function request(env, path, { method = "GET", token, body, allowFailure = false } = {}) {
  const timeoutMs = Number(process.env.POCKETBASE_SETUP_TIMEOUT_MS || 8000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;

  try {
    response = await fetch(`${env.url}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (error) {
    if (allowFailure) {
      return {
        __failed: true,
        status: error?.name === "AbortError" ? "TIMEOUT" : "NETWORK",
        message: error?.name === "AbortError" ? `timeout_${timeoutMs}ms` : safeSnippet(error?.message)
      };
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: safeSnippet(text || "non_json_response") };
  }

  if (!response.ok) {
    const message = data?.message || data?.error || response.statusText || "request_failed";
    if (allowFailure) {
      return {
        __failed: true,
        status: response.status,
        code: data?.code || null,
        message: safeSnippet(message)
      };
    }
    throw new Error(`PB_${response.status}:${message}`);
  }

  return data;
}

function authAttemptSummary(label, response) {
  if (!response) return `${label}=no_response`;
  if (response?.token) return `${label}=ok`;
  const status = response?.status || "failed";
  const code = response?.code ? `:${response.code}` : "";
  const message = response?.message ? `:${response.message}` : "";
  return `${label}=${status}${code}${message}`;
}

function authFailureHint(attempts) {
  const text = attempts.join(";");
  if (text.includes("TIMEOUT") || text.includes("NETWORK")) {
    return "cms_unreachable_or_cloudflare_blocking_post";
  }
  if (text.includes("404")) {
    return "admin_auth_endpoint_not_available_or_wrong_pocketbase_url";
  }
  if (text.includes("400") || text.includes("401") || text.includes("403")) {
    return "invalid_superuser_credentials_or_password_not_passed_correctly";
  }
  return "unknown_auth_failure";
}

function needsCmsRulesUpdate(collection, rule) {
  return (
    collection?.listRule !== rule ||
    collection?.viewRule !== rule ||
    collection?.createRule !== null ||
    collection?.updateRule !== null ||
    collection?.deleteRule !== null
  );
}

function cmsRuleForCollection(collection) {
  const fields = Array.isArray(collection?.fields) ? collection.fields : [];
  const hasActive = fields.some((field) => field?.name === "active");
  const hasEnabled = fields.some((field) => field?.name === "enabled");
  if (hasActive) return CMS_RULE_ACTIVE;
  if (hasEnabled) return CMS_RULE_LEGACY;
  return CMS_RULE_ACTIVE;
}

function cmsRulesPayload(rule) {
  return {
    listRule: rule,
    viewRule: rule,
    createRule: null,
    updateRule: null,
    deleteRule: null
  };
}

function uniqueFilter(collection, record, schema) {
  if (collection === "app_config" || collection === "feature_flags") {
    return `key="${escapeFilter(record.key)}"`;
  }
  if (collection === "service_categories") {
    return `slug="${escapeFilter(record.slug)}"`;
  }
  if (collection === "faqs") {
    return `question="${escapeFilter(record.question)}"`;
  }
  if (schemaHasField(schema, "slug") && record.slug) {
    return `slug="${escapeFilter(record.slug)}"`;
  }
  if (schemaHasField(schema, "title") && schemaHasField(schema, "audience")) {
    return `title="${escapeFilter(record.title)}" && audience="${escapeFilter(record.audience || "")}"`;
  }
  if (schemaHasField(schema, "title") && schemaHasField(schema, "placement")) {
    return `title="${escapeFilter(record.title)}" && placement="${escapeFilter(record.placement || "")}"`;
  }
  if (schemaHasField(schema, "title")) {
    return `title="${escapeFilter(record.title)}"`;
  }
  return `id="${escapeFilter(record.id || "")}"`;
}

function adaptRecordToSchema(record, schema) {
  const fields = new Set((Array.isArray(schema?.fields) ? schema.fields : []).map((field) => field.name));
  if (!fields.size) return record;

  const adapted = {};
  for (const [key, value] of Object.entries(record)) {
    if (fields.has(key)) adapted[key] = value;
  }

  if (fields.has("enabled") && !fields.has("active") && "active" in record) {
    adapted.enabled = record.active;
  }
  if (fields.has("active") && !("active" in adapted) && "enabled" in record) {
    adapted.active = record.enabled;
  }
  if (fields.has("audience") && !("audience" in adapted) && "placement" in record) {
    adapted.audience = record.placement;
  }
  if (fields.has("placement") && !("placement" in adapted) && "audience" in record) {
    adapted.placement = record.audience;
  }
  if (fields.has("cta_route") && !("cta_route" in adapted) && "cta_url" in record) {
    adapted.cta_route = record.cta_url;
  }
  if (fields.has("cta_url") && !("cta_url" in adapted) && "cta_route" in record) {
    adapted.cta_url = record.cta_route;
  }
  if (fields.has("starts_at") && !("starts_at" in adapted) && "start_at" in record) {
    adapted.starts_at = record.start_at;
  }
  if (fields.has("ends_at") && !("ends_at" in adapted) && "end_at" in record) {
    adapted.ends_at = record.end_at;
  }
  if (fields.has("parent_category") && !("parent_category" in adapted) && "parent_slug" in record) {
    adapted.parent_category = record.parent_slug;
  }
  if (fields.has("category") && !("category" in adapted) && "audience" in record) {
    adapted.category = record.audience;
  }

  return adapted;
}

function schemaHasField(schema, name) {
  return Array.isArray(schema?.fields) && schema.fields.some((field) => field.name === name);
}

function escapeFilter(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function safeErrorMessage(error) {
  const message = String(error?.message || error || "unknown_error");
  return message
    .replace(String(process.env.POCKETBASE_ADMIN_EMAIL || ""), "[redacted]")
    .replace(String(process.env.POCKETBASE_ADMIN_PASSWORD || ""), "[redacted]");
}

function safeSnippet(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .slice(0, 180);
}

function textField(name, options = {}) {
  return { name, type: "text", required: Boolean(options.required), max: options.max || 0 };
}

function editorField(name) {
  return { name, type: "editor" };
}

function jsonField(name) {
  return { name, type: "json" };
}

function boolField(name) {
  return { name, type: "bool" };
}

function dateField(name) {
  return { name, type: "date" };
}

function numberField(name, options = {}) {
  return { name, type: "number", min: options.min ?? null, max: options.max ?? null };
}

function category(name, slug, description, order) {
  return {
    slug,
    name,
    description,
    icon: "",
    image: "",
    parent_slug: "",
    order,
    active: true,
    featured: order <= 30,
    online: true,
    radius_km: 15,
    tags: []
  };
}

function faq(question, answer, audience, order) {
  return { question, answer, category: audience, order, active: true };
}

function flag(key, enabled, description) {
  return {
    key,
    enabled,
    description,
    payload: {},
    environment: "production",
    active: true
  };
}
