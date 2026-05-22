import supabaseAdminService from "./supabase-admin-client.js?v=2026.05.15.4";

const SERVICE_INTELLIGENCE_FLAGS = [
  "MIMI_SERVICE_CATALOG_V2_ENABLED",
  "MIMI_PROVIDER_GUIDED_SERVICE_ENABLED",
  "MIMI_CLIENT_DYNAMIC_QUESTIONS_ENABLED",
  "MIMI_PRICING_ENGINE_ENABLED",
  "MIMI_QUOTES_V2_ENABLED",
  "MIMI_AI_INTENT_ASSIST_ENABLED",
  "MIMI_SERVICE_DISCOVERY_ENABLED",
  "MIMI_REGULATED_SERVICES_GUARD_ENABLED",
  "MIMI_CLIENT_ONE_SHOT_SEARCH_ENABLED",
];

const elements = {
  module: document.getElementById("adminServiceCatalogModule"),
  refresh: document.getElementById("catalogRefreshBtn"),
  search: document.getElementById("catalogSearchInput"),
  macro: document.getElementById("catalogMacroFilter"),
  family: document.getElementById("catalogFamilyFilter"),
  risk: document.getElementById("catalogRiskFilter"),
  status: document.getElementById("catalogStatusFilter"),
  templateList: document.getElementById("catalogTemplateList"),
  templateDetail: document.getElementById("catalogTemplateDetail"),
  flagsList: document.getElementById("catalogFeatureFlagsList"),
  regulatedList: document.getElementById("catalogRegulatedList"),
  discoveryList: document.getElementById("catalogDiscoveryList"),
  metrics: {
    templates: document.getElementById("catalogMetricTemplates"),
    regulated: document.getElementById("catalogMetricRegulated"),
    flagsOn: document.getElementById("catalogMetricFlagsOn"),
    discovery: document.getElementById("catalogMetricDiscovery"),
  },
};

const state = {
  loaded: false,
  loading: false,
  selectedTemplateId: null,
  templates: [],
  versions: [],
  attributes: [],
  questions: [],
  pricingRules: [],
  requirements: [],
  flags: [],
  discoveryEvents: [],
};

function isLocalVisualPreview() {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  return localHosts.has(window.location.hostname) && new URLSearchParams(window.location.search).has("visual");
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatBool(value) {
  return value ? "Si" : "No";
}

function activeVersionFor(templateId) {
  return state.versions
    .filter((version) => version.service_template_id === templateId)
    .sort((a, b) => {
      if (a.status === "active" && b.status !== "active") return -1;
      if (a.status !== "active" && b.status === "active") return 1;
      return Number(b.version_number || 0) - Number(a.version_number || 0);
    })[0] || null;
}

function rowsForVersion(rows, templateVersionId) {
  return rows
    .filter((row) => row.template_version_id === templateVersionId)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
}

function requirementsFor(templateId, templateVersionId) {
  return state.requirements.filter((requirement) => (
    requirement.service_template_id === templateId ||
    requirement.template_version_id === templateVersionId
  ));
}

function setMetric(key, value) {
  if (elements.metrics[key]) {
    elements.metrics[key].textContent = String(value ?? 0);
  }
}

function uniqueValues(items, key) {
  return [...new Set(items.map((item) => item[key]).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b), "es"));
}

function renderOptionList(select, values) {
  if (!select) return;
  const current = select.value || "all";
  select.innerHTML = `<option value="all">Todas</option>${values
    .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
    .join("")}`;
  select.value = values.includes(current) ? current : "all";
}

function updateFilters() {
  renderOptionList(elements.macro, uniqueValues(state.templates, "macro_vertical"));
  renderOptionList(elements.family, uniqueValues(state.templates, "service_family"));
}

function templateMatchesFilters(template) {
  const query = (elements.search?.value || "").trim().toLowerCase();
  const macro = elements.macro?.value || "all";
  const family = elements.family?.value || "all";
  const risk = elements.risk?.value || "all";
  const status = elements.status?.value || "all";

  if (query) {
    const haystack = [
      template.name,
      template.slug,
      template.description,
      template.macro_vertical,
      template.service_family,
    ].join(" ").toLowerCase();
    if (!haystack.includes(query)) return false;
  }

  if (macro !== "all" && template.macro_vertical !== macro) return false;
  if (family !== "all" && template.service_family !== family) return false;
  if (status === "active" && !template.is_active) return false;
  if (status === "inactive" && template.is_active) return false;
  if (risk === "regulated" && template.regulated_level === "none") return false;
  if (risk === "sensitive" && template.sensitive_level === "none") return false;
  if (risk === "safety" && template.default_question_strategy !== "SAFETY_GATE") return false;

  return true;
}

function renderTemplates() {
  if (!elements.templateList) return;
  const filtered = state.templates.filter(templateMatchesFilters);

  if (!filtered.length) {
    elements.templateList.innerHTML = `<div class="financial-empty">No hay templates para los filtros seleccionados.</div>`;
    renderSelectedTemplate(null);
    return;
  }

  if (!filtered.some((template) => template.id === state.selectedTemplateId)) {
    state.selectedTemplateId = filtered[0].id;
  }

  elements.templateList.innerHTML = filtered.map((template) => {
    const activeVersion = activeVersionFor(template.id);
    const selected = template.id === state.selectedTemplateId;
    return `
      <button
        class="admin-catalog-template ${selected ? "is-active" : ""}"
        type="button"
        data-catalog-template-id="${escapeHtml(template.id)}"
        aria-pressed="${selected ? "true" : "false"}"
      >
        <span class="admin-catalog-template-top">
          <strong>${escapeHtml(template.name)}</strong>
          <span class="admin-catalog-status ${template.is_active ? "is-active" : "is-inactive"}">${template.is_active ? "Activo" : "Inactivo"}</span>
        </span>
        <span>${escapeHtml(template.macro_vertical)} · ${escapeHtml(template.service_family)}</span>
        <span class="admin-catalog-template-meta">
          ${escapeHtml(template.default_pricing_model)}
          · quote ${formatBool(template.default_quote_required)}
          · v${escapeHtml(activeVersion?.version_number || "-")}
        </span>
        <span class="admin-catalog-risk-row">
          <em>${escapeHtml(template.regulated_level)}</em>
          <em>${escapeHtml(template.sensitive_level)}</em>
          <em>${escapeHtml(template.default_question_strategy)}</em>
        </span>
      </button>
    `;
  }).join("");

  renderSelectedTemplate(state.selectedTemplateId);
}

function renderSelectedTemplate(templateId) {
  if (!elements.templateDetail) return;
  const template = state.templates.find((item) => item.id === templateId);

  if (!template) {
    elements.templateDetail.innerHTML = `<div class="financial-empty">Seleccioná un template para ver detalle.</div>`;
    return;
  }

  const activeVersion = activeVersionFor(template.id);
  const attributes = activeVersion ? rowsForVersion(state.attributes, activeVersion.id) : [];
  const questions = activeVersion ? rowsForVersion(state.questions, activeVersion.id) : [];
  const rules = activeVersion ? state.pricingRules.filter((rule) => rule.template_version_id === activeVersion.id) : [];
  const requirements = requirementsFor(template.id, activeVersion?.id);

  elements.templateDetail.innerHTML = `
    <article class="admin-catalog-detail-card">
      <div class="admin-catalog-detail-head">
        <div>
          <span class="eyebrow">${escapeHtml(template.slug)}</span>
          <h3>${escapeHtml(template.name)}</h3>
          <p>${escapeHtml(template.description || "Sin descripción.")}</p>
        </div>
        <span class="admin-catalog-status ${template.is_active ? "is-active" : "is-inactive"}">${template.is_active ? "Activo" : "Inactivo"}</span>
      </div>

      <dl class="admin-catalog-definition-grid">
        <div><dt>Vertical</dt><dd>${escapeHtml(template.macro_vertical)}</dd></div>
        <div><dt>Familia</dt><dd>${escapeHtml(template.service_family)}</dd></div>
        <div><dt>Pricing</dt><dd>${escapeHtml(template.default_pricing_model)}</dd></div>
        <div><dt>Quote required</dt><dd>${formatBool(template.default_quote_required)}</dd></div>
        <div><dt>Regulado</dt><dd>${escapeHtml(template.regulated_level)}</dd></div>
        <div><dt>Sensible</dt><dd>${escapeHtml(template.sensitive_level)}</dd></div>
        <div><dt>Credenciales</dt><dd>${formatBool(template.requires_credentials)}</dd></div>
        <div><dt>Aprobación admin</dt><dd>${formatBool(template.requires_admin_approval)}</dd></div>
      </dl>

      <section class="admin-catalog-detail-section">
        <h4>Versión activa</h4>
        ${activeVersion ? `
          <div class="admin-catalog-version-card">
            <strong>v${escapeHtml(activeVersion.version_number)} · ${escapeHtml(activeVersion.status)}</strong>
            <span>${escapeHtml(activeVersion.pricing_model)} · ${escapeHtml(activeVersion.question_strategy_default)}</span>
          </div>
        ` : `<div class="financial-empty">No hay versión activa.</div>`}
      </section>

      ${renderDetailList("Atributos", attributes.map((attribute) => `
        <li>
          <strong>${escapeHtml(attribute.label)}</strong>
          <span>${escapeHtml(attribute.code)} · ${escapeHtml(attribute.data_type)} · price ${formatBool(attribute.affects_price)}</span>
        </li>
      `))}

      ${renderDetailList("Preguntas", questions.map((question) => `
        <li>
          <strong>${escapeHtml(question.question_text)}</strong>
          <span>${escapeHtml(question.question_strategy)} · ${escapeHtml(question.answer_type)} · required ${formatBool(question.required)}</span>
        </li>
      `))}

      ${renderDetailList("Pricing rules", rules.map((rule) => `
        <li>
          <strong>${escapeHtml(rule.rule_type)}</strong>
          <span>${escapeHtml(rule.pricing_model)} · search sin precio completo ${formatBool(rule.allow_search_without_full_price)}</span>
        </li>
      `))}

      ${renderDetailList("Requisitos regulados", requirements.map((requirement) => `
        <li>
          <strong>${escapeHtml(requirement.requirement_label)}</strong>
          <span>${escapeHtml(requirement.requirement_type)} · auto pricing bloqueado ${formatBool(requirement.blocks_auto_pricing)}</span>
        </li>
      `))}

      <details class="admin-catalog-metadata">
        <summary>Metadata</summary>
        <pre>${escapeHtml(JSON.stringify(template.metadata_json || {}, null, 2))}</pre>
      </details>
    </article>
  `;
}

function renderDetailList(title, items) {
  return `
    <section class="admin-catalog-detail-section">
      <h4>${escapeHtml(title)}</h4>
      ${items.length ? `<ul class="admin-catalog-detail-list">${items.join("")}</ul>` : `<div class="financial-empty">Sin registros.</div>`}
    </section>
  `;
}

function renderFlags() {
  if (!elements.flagsList) return;
  const flags = state.flags.filter((flag) => SERVICE_INTELLIGENCE_FLAGS.includes(flag.key));

  elements.flagsList.innerHTML = flags.length ? flags.map((flag) => `
    <div class="admin-catalog-compact-item">
      <strong>${escapeHtml(flag.key)}</strong>
      <span class="admin-catalog-status ${flag.enabled ? "is-active" : "is-inactive"}">${flag.enabled ? "true" : "false"}</span>
      <small>${escapeHtml(flag.description || "")}</small>
    </div>
  `).join("") : `<div class="financial-empty">No hay flags de Service Intelligence.</div>`;
}

function renderRegulated() {
  if (!elements.regulatedList) return;
  const regulated = state.templates.filter((template) => (
    template.regulated_level !== "none" ||
    template.sensitive_level !== "none" ||
    template.requires_credentials ||
    template.requires_admin_approval
  ));

  elements.regulatedList.innerHTML = regulated.length ? regulated.map((template) => {
    const activeVersion = activeVersionFor(template.id);
    const requirements = requirementsFor(template.id, activeVersion?.id);
    const hasEmergency = requirements.some((requirement) => requirement.emergency_disclaimer_required);
    const blocksPricing = requirements.some((requirement) => requirement.blocks_auto_pricing);
    const blocksResults = requirements.some((requirement) => requirement.blocks_results_without_disclaimer);

    return `
      <div class="admin-catalog-compact-item">
        <strong>${escapeHtml(template.name)}</strong>
        <span>${escapeHtml(template.regulated_level)} · ${escapeHtml(template.sensitive_level)}</span>
        <small>
          credenciales ${formatBool(template.requires_credentials)}
          · aprobación ${formatBool(template.requires_admin_approval)}
          · emergencia ${formatBool(hasEmergency)}
          · auto pricing bloqueado ${formatBool(blocksPricing)}
          · results gate ${formatBool(blocksResults)}
        </small>
      </div>
    `;
  }).join("") : `<div class="financial-empty">No hay servicios regulados o sensibles.</div>`;
}

function renderDiscovery() {
  if (!elements.discoveryList) return;
  elements.discoveryList.innerHTML = state.discoveryEvents.length ? state.discoveryEvents.map((event) => `
    <div class="admin-catalog-compact-item">
      <strong>${escapeHtml(event.suggested_service_name || event.raw_text || "Discovery event")}</strong>
      <span>${escapeHtml(event.status)} · ${escapeHtml(event.source)}</span>
      <small>${escapeHtml(event.suggested_macro_vertical || "Sin vertical")} · ${escapeHtml(event.suggested_category_name || "Sin categoría")}</small>
    </div>
  `).join("") : `<div class="financial-empty">Todavía no hay discovery events.</div>`;
}

function renderMetrics() {
  const regulated = state.templates.filter((template) => (
    template.regulated_level !== "none" ||
    template.sensitive_level !== "none" ||
    template.requires_credentials ||
    template.requires_admin_approval
  ));
  const enabledFlags = state.flags.filter((flag) => SERVICE_INTELLIGENCE_FLAGS.includes(flag.key) && flag.enabled);

  setMetric("templates", state.templates.length);
  setMetric("regulated", regulated.length);
  setMetric("flagsOn", enabledFlags.length);
  setMetric("discovery", state.discoveryEvents.length);
}

function renderAll() {
  updateFilters();
  renderMetrics();
  renderFlags();
  renderRegulated();
  renderDiscovery();
  renderTemplates();
}

function setLoading(isLoading) {
  state.loading = isLoading;
  if (elements.refresh) {
    elements.refresh.disabled = isLoading;
    elements.refresh.textContent = isLoading ? "Cargando..." : "Recargar catálogo";
  }
}

function applyPreviewData() {
  const template = {
    id: "preview-template",
    slug: "pintura-interior",
    name: "Pintura interior",
    description: "Template preview de catálogo inteligente.",
    macro_vertical: "Hogar y mantenimiento",
    service_family: "Pintura",
    default_pricing_model: "SQUARE_METER",
    default_quote_required: false,
    regulated_level: "none",
    sensitive_level: "none",
    requires_admin_approval: false,
    requires_credentials: false,
    default_question_strategy: "OPTIONAL_REFINEMENT",
    is_active: true,
    metadata_json: { preview: true },
  };

  const version = {
    id: "preview-version",
    service_template_id: template.id,
    version_number: 1,
    status: "active",
    pricing_model: "SQUARE_METER",
    question_strategy_default: "OPTIONAL_REFINEMENT",
  };

  state.templates = [template];
  state.versions = [version];
  state.attributes = [
    { id: "a1", template_version_id: version.id, code: "quantity", label: "Cantidad o medida", data_type: "number", affects_price: true, sort_order: 10 },
    { id: "a2", template_version_id: version.id, code: "details", label: "Detalle", data_type: "text", affects_price: false, sort_order: 20 },
  ];
  state.questions = [
    { id: "q1", template_version_id: version.id, attribute_id: "a1", question_text: "Tenés una medida aproximada?", question_strategy: "price_only", answer_type: "number", required: false, sort_order: 10 },
  ];
  state.pricingRules = [
    { id: "r1", template_version_id: version.id, rule_type: "base", pricing_model: "SQUARE_METER", allow_search_without_full_price: true },
  ];
  state.requirements = [];
  state.flags = SERVICE_INTELLIGENCE_FLAGS.map((key) => ({ key, enabled: false, description: "Preview apagado" }));
  state.discoveryEvents = [];
}

async function loadCatalog() {
  if (!elements.module || state.loading) return;
  setLoading(true);

  try {
    if (isLocalVisualPreview()) {
      applyPreviewData();
      renderAll();
      state.loaded = true;
      return;
    }

    const adminResult = await supabaseAdminService.waitForActiveAdmin(3200);
    if (!adminResult?.ok || !supabaseAdminService.client) {
      throw new Error("admin_required");
    }

    const client = supabaseAdminService.client;
    const [
      templatesResult,
      versionsResult,
      attributesResult,
      questionsResult,
      pricingResult,
      requirementsResult,
      flagsResult,
      discoveryResult,
    ] = await Promise.all([
      client
        .from("svc_service_templates")
        .select("id,slug,name,description,macro_vertical,service_family,default_pricing_model,default_quote_required,regulated_level,sensitive_level,requires_admin_approval,requires_credentials,default_question_strategy,is_active,metadata_json,created_at,updated_at")
        .order("macro_vertical", { ascending: true })
        .order("service_family", { ascending: true })
        .order("name", { ascending: true }),
      client
        .from("svc_service_template_versions")
        .select("id,service_template_id,version_number,status,title,description,pricing_model,quote_required_default,question_strategy_default,metadata_json,published_at,created_at,updated_at")
        .order("version_number", { ascending: false }),
      client
        .from("svc_service_attributes")
        .select("id,template_version_id,code,label,description,data_type,unit,required,affects_price,affects_matching,can_be_extracted_from_text,ask_only_if_missing,enum_options,validation_json,sort_order,created_at")
        .order("sort_order", { ascending: true }),
      client
        .from("svc_service_questions")
        .select("id,template_version_id,attribute_id,question_text,helper_text,answer_type,required,question_strategy,show_if_json,risk_check_json,sort_order,created_at")
        .order("sort_order", { ascending: true }),
      client
        .from("svc_pricing_rules")
        .select("id,template_version_id,pricing_model,rule_type,condition_json,formula_json,min_price,max_price,currency,quote_if_missing_attributes,quote_if_low_confidence,allow_search_without_full_price,is_active,created_at,updated_at")
        .order("created_at", { ascending: true }),
      client
        .from("svc_regulated_service_requirements")
        .select("id,service_template_id,template_version_id,requirement_type,requirement_label,required_document_type,jurisdiction_required,admin_approval_required,emergency_disclaimer_required,blocks_auto_pricing,blocks_results_without_disclaimer,metadata_json,created_at"),
      client
        .from("svc_feature_flags")
        .select("key,enabled,scope,description,metadata_json,updated_at")
        .in("key", SERVICE_INTELLIGENCE_FLAGS)
        .order("key", { ascending: true }),
      client
        .from("svc_service_discovery_events")
        .select("id,source,raw_text,suggested_macro_vertical,suggested_category_name,suggested_service_name,matched_existing_template_id,status,reviewed_by,reviewed_at,created_at")
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    const failed = [
      templatesResult,
      versionsResult,
      attributesResult,
      questionsResult,
      pricingResult,
      requirementsResult,
      flagsResult,
      discoveryResult,
    ].find((result) => result.error);

    if (failed?.error) {
      throw failed.error;
    }

    state.templates = templatesResult.data || [];
    state.versions = versionsResult.data || [];
    state.attributes = attributesResult.data || [];
    state.questions = questionsResult.data || [];
    state.pricingRules = pricingResult.data || [];
    state.requirements = requirementsResult.data || [];
    state.flags = flagsResult.data || [];
    state.discoveryEvents = discoveryResult.data || [];
    state.loaded = true;
    renderAll();
  } catch (error) {
    console.error("[admin-service-catalog] load failed", error);
    if (elements.templateList) {
      elements.templateList.innerHTML = `<div class="financial-empty">No se pudo cargar Catálogo Inteligente. Verificar sesión admin y policies.</div>`;
    }
    if (elements.templateDetail) {
      elements.templateDetail.innerHTML = `<div class="financial-empty">La vista es read-only y requiere usuario admin activo.</div>`;
    }
  } finally {
    setLoading(false);
  }
}

function setupCatalogEvents() {
  elements.refresh?.addEventListener("click", loadCatalog);

  [elements.search, elements.macro, elements.family, elements.risk, elements.status]
    .forEach((control) => {
      control?.addEventListener("input", renderTemplates);
      control?.addEventListener("change", renderTemplates);
    });

  elements.templateList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-catalog-template-id]");
    if (!button) return;
    state.selectedTemplateId = button.dataset.catalogTemplateId;
    renderTemplates();
  });

  window.addEventListener("mimi-admin:mobile-view-change", (event) => {
    if (event.detail?.view === "catalog" && !state.loaded) {
      loadCatalog();
    }
  });
}

if (elements.module) {
  setupCatalogEvents();

  if (document.body.dataset.adminMobileView === "catalog" || isLocalVisualPreview()) {
    loadCatalog();
  }
}
