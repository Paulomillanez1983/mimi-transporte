#!/usr/bin/env node

const REQUIRED_ENV = [
  "POCKETBASE_URL",
  "POCKETBASE_ADMIN_EMAIL",
  "POCKETBASE_ADMIN_PASSWORD"
];

const CMS_RULE = "enabled=true";

const COLLECTIONS = {
  app_config: {
    fields: [
      textField("key", { required: true, max: 120 }),
      jsonField("value"),
      boolField("enabled"),
      textField("environment", { max: 40 }),
      dateField("updated_at")
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_app_config_key_environment ON app_config (key, environment)"
    ]
  },
  home_sections: {
    fields: [
      textField("title", { required: true, max: 160 }),
      textField("subtitle", { max: 220 }),
      editorField("body"),
      textField("image", { max: 500 }),
      textField("route", { max: 160 }),
      numberField("order"),
      boolField("enabled"),
      textField("audience", { max: 40 })
    ],
    indexes: [
      "CREATE INDEX idx_home_sections_audience_order ON home_sections (audience, enabled, \"order\")"
    ]
  },
  service_categories: {
    fields: [
      textField("name", { required: true, max: 120 }),
      textField("slug", { required: true, max: 120 }),
      textField("icon", { max: 80 }),
      textField("image", { max: 500 }),
      editorField("description"),
      numberField("order"),
      boolField("enabled"),
      textField("parent_category", { max: 120 })
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_service_categories_slug ON service_categories (slug)"
    ]
  },
  banners: {
    fields: [
      textField("title", { required: true, max: 160 }),
      textField("subtitle", { max: 240 }),
      textField("image", { max: 500 }),
      textField("cta_label", { max: 80 }),
      textField("cta_route", { max: 160 }),
      textField("audience", { max: 40 }),
      numberField("order"),
      boolField("enabled"),
      dateField("starts_at"),
      dateField("ends_at")
    ],
    indexes: [
      "CREATE INDEX idx_banners_audience_enabled_dates ON banners (audience, enabled, starts_at, ends_at, \"order\")"
    ]
  },
  faqs: {
    fields: [
      textField("question", { required: true, max: 240 }),
      editorField("answer"),
      textField("audience", { max: 40 }),
      numberField("order"),
      boolField("enabled")
    ],
    indexes: [
      "CREATE INDEX idx_faqs_audience_order ON faqs (audience, enabled, \"order\")"
    ]
  },
  feature_flags: {
    fields: [
      textField("key", { required: true, max: 120 }),
      boolField("enabled"),
      textField("description", { max: 240 }),
      numberField("rollout_percentage", { min: 0, max: 100 })
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_feature_flags_key ON feature_flags (key)"
    ]
  }
};

const SEED = {
  banners: [
    {
      title: "Servicios confiables cerca tuyo",
      subtitle: "Elegi prestadores verificados y envia una solicitud real desde MIMI.",
      image: "",
      cta_label: "Buscar servicio",
      cta_route: "/mimi-servicios/cliente.html",
      audience: "client",
      order: 10,
      enabled: true,
      starts_at: "",
      ends_at: ""
    },
    {
      title: "Tu panel de trabajo, mas liviano",
      subtitle: "Recibi solicitudes, valida el PIN e inicia servicios sin tracking innecesario.",
      image: "",
      cta_label: "Ir al panel",
      cta_route: "/mimi-servicios/prestador.html",
      audience: "provider",
      order: 20,
      enabled: true,
      starts_at: "",
      ends_at: ""
    }
  ],
  home_sections: [
    {
      title: "Pedi ayuda a domicilio",
      subtitle: "MIMI conecta clientes con prestadores independientes.",
      body: "Busca por rubro, compara opciones y envia una solicitud al prestador elegido.",
      image: "",
      route: "/mimi-servicios/cliente.html",
      order: 10,
      enabled: true,
      audience: "client"
    },
    {
      title: "Trabaja con solicitudes reales",
      subtitle: "Recibi pedidos cuando estas online.",
      body: "El prestador decide aceptar o rechazar. El servicio empieza al validar el PIN del cliente.",
      image: "",
      route: "/mimi-servicios/prestador.html",
      order: 20,
      enabled: true,
      audience: "provider"
    },
    {
      title: "CMS visual sin tocar produccion",
      subtitle: "Banners, textos y rubros visuales editables desde PocketBase.",
      body: "Supabase conserva auth, pedidos, pagos, KYC y realtime critico.",
      image: "",
      route: "",
      order: 30,
      enabled: true,
      audience: "admin"
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
    flag("pocketbase_cms_enabled", true, "Habilita lectura de contenido visual desde PocketBase.", 100),
    flag("realtime_optimized_enabled", true, "Usa canales scoped y pausa realtime no critico.", 100),
    flag("provider_tracking_optimized", true, "Reduce frecuencia de tracking de prestadores en servicios activos.", 100),
    flag("nearby_snapshot_cache_enabled", true, "Cachea snapshots de prestadores cercanos por ventana corta.", 100)
  ],
  app_config: [
    {
      key: "cms_version",
      value: { version: "2026.05.11.1", owner: "mimi-services" },
      enabled: true,
      environment: "local",
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

  for (const [name, definition] of Object.entries(COLLECTIONS)) {
    const existing = collections.find((collection) => collection.name === name);
    if (existing) {
      present.push(name);
      if (needsCmsRulesUpdate(existing)) {
        await updateCollectionRules(env, auth.token, existing.id || name);
        rulesUpdated.push(name);
      }
      continue;
    }

    await createCollection(env, auth.token, name, definition);
    created.push(name);
  }

  const seeded = [];

  for (const [collection, records] of Object.entries(SEED)) {
    for (const record of records) {
      const exists = await recordExists(env, auth.token, collection, uniqueFilter(collection, record));
      if (exists) continue;
      await createRecord(env, auth.token, collection, record);
      seeded.push(`${collection}:${record.key || record.slug || record.title || record.question}`);
    }
  }

  console.log(`PB_COLLECTIONS_PRESENT=${present.join(",") || "(none)"}`);
  console.log(`PB_COLLECTIONS_CREATED=${created.join(",") || "(none)"}`);
  console.log(`PB_COLLECTION_RULES_UPDATED=${rulesUpdated.join(",") || "(none)"}`);
  console.log(`PB_RECORDS_SEEDED=${seeded.length}`);
  seeded.forEach((item) => console.log(`PB_SEEDED=${item}`));
  console.log("PB_CMS_SETUP_OK");
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
  const body = { identity: env.email, password: env.password };
  const endpoints = [
    "/api/collections/_superusers/auth-with-password",
    "/api/admins/auth-with-password"
  ];

  for (const endpoint of endpoints) {
    const response = await request(env, endpoint, {
      method: "POST",
      body,
      allowFailure: true
    });
    if (response?.token) return response;
  }

  throw new Error("PB_AUTH_FAILED");
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
      ...cmsRulesPayload(),
      fields: definition.fields,
      indexes: definition.indexes || []
    }
  });
}

async function updateCollectionRules(env, token, collectionIdOrName) {
  return request(env, `/api/collections/${encodeURIComponent(collectionIdOrName)}`, {
    method: "PATCH",
    token,
    body: cmsRulesPayload()
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
  const response = await fetch(`${env.url}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    if (allowFailure) return null;
    const message = data?.message || data?.error || response.statusText || "request_failed";
    throw new Error(`PB_${response.status}:${message}`);
  }

  return data;
}

function needsCmsRulesUpdate(collection) {
  return (
    collection?.listRule !== CMS_RULE ||
    collection?.viewRule !== CMS_RULE ||
    collection?.createRule !== null ||
    collection?.updateRule !== null ||
    collection?.deleteRule !== null
  );
}

function cmsRulesPayload() {
  return {
    listRule: CMS_RULE,
    viewRule: CMS_RULE,
    createRule: null,
    updateRule: null,
    deleteRule: null
  };
}

function uniqueFilter(collection, record) {
  if (collection === "app_config" || collection === "feature_flags") {
    return `key="${escapeFilter(record.key)}"`;
  }
  if (collection === "service_categories") {
    return `slug="${escapeFilter(record.slug)}"`;
  }
  if (collection === "faqs") {
    return `question="${escapeFilter(record.question)}"`;
  }
  return `title="${escapeFilter(record.title)}" && audience="${escapeFilter(record.audience || "")}"`;
}

function escapeFilter(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function safeErrorMessage(error) {
  const message = String(error?.message || error || "unknown_error");
  if (message.includes("PB_AUTH_FAILED")) return "PB_AUTH_FAILED";
  return message
    .replace(String(process.env.POCKETBASE_ADMIN_EMAIL || ""), "[redacted]")
    .replace(String(process.env.POCKETBASE_ADMIN_PASSWORD || ""), "[redacted]");
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
  return { name, slug, icon: "", image: "", description, order, enabled: true, parent_category: "" };
}

function faq(question, answer, audience, order) {
  return { question, answer, audience, order, enabled: true };
}

function flag(key, enabled, description, rolloutPercentage) {
  return { key, enabled, description, rollout_percentage: rolloutPercentage };
}
