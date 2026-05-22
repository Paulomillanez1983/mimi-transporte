import { chromium } from "playwright";

const targetUrl = process.argv[2] || "http://127.0.0.1:8787/mimi-servicios/prestador.html?qa_mobile_services=20260521";

const viewports = [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
];

function buildState() {
  return {
    appConfig: {
      categories: [
        {
          id: "cat-painting",
          code: "painting",
          name: "Pintura",
          description: "Pintura interior y exterior",
          default_pricing_model: "UNIT",
          allowed_service_modes: ["IN_PERSON"],
        },
      ],
    },
    meta: { backendMode: "supabase", error: null, info: null },
    session: {
      isAuthenticated: true,
      userId: "qa-provider-mobile-user",
      providerId: "qa-provider-mobile",
      userName: "Paulo",
    },
    provider: {
      profile: { full_name: "Paulo", approved: true, blocked: false },
      categories: [{ category_id: "cat-painting" }],
      guidedService: { enabled: false, templates: [], panelOpen: false },
      serviceAddons: {
        enabled: false,
        byOfferingId: {},
        providerId: "qa-provider-mobile",
        flag: {
          enabled: true,
          scope: "provider",
          metadata_json: {
            enabled_provider_ids: ["qa-provider-mobile"],
          },
        },
      },
      business: {
        profile: {
          first_name: "Paulo",
          city: "Cordoba Capital",
          province: "Cordoba",
          address_text: "Villa Cornu",
          bio: "Pintura interior prolija.",
          metadata_json: {
            identity_document_address_text: "Villa Cornu, Cordoba",
            coverage_radius_meters: 10000,
          },
          metadata: { coverage_radius_meters: 10000 },
        },
        pricing: [],
        offerings: [
          {
            id: "qa-offering-active",
            category_id: "cat-painting",
            active: true,
            title: "Pintura interior",
            description: "Pinto interiores por m2 con presupuesto claro y coordinacion dentro de MIMIGO.",
            public_summary: "Pintura interior por m2.",
            pricing_model: "UNIT",
            service_mode: "IN_PERSON",
            location_policy: "CLIENT_ADDRESS",
            unit_price: 15000,
            unit_name: "m2",
            duration_minutes: 120,
            currency: "ARS",
          },
          {
            id: "qa-offering-paused",
            category_id: "cat-painting",
            active: false,
            title: "Pintura exterior",
            description: "Servicio pausado para validar copy y acciones.",
            public_summary: "Pintura exterior pausada.",
            pricing_model: "QUOTE",
            service_mode: "IN_PERSON",
            location_policy: "CLIENT_ADDRESS",
            quote_required: true,
            currency: "ARS",
          },
        ],
        documents: [],
        legalRequirements: [
          { code: "terms_providers", version: "2026.1.0", actor_type: "provider", title: "Terminos" },
          { code: "privacy_policy", version: "2026.1.0", actor_type: "all", title: "Privacidad" },
        ],
        legalAcceptances: [
          { document_code: "terms_providers", document_version: "2026.1.0", actor_type: "provider", accepted_at: "2026-05-21T00:00:00.000Z" },
          { document_code: "privacy_policy", document_version: "2026.1.0", actor_type: "provider", accepted_at: "2026-05-21T00:00:00.000Z" },
        ],
      },
      offers: [],
      stats: {},
      dashboard: {},
    },
    notifications: { items: [], unreadCount: 3 },
    chat: { messages: [], unreadCount: 0 },
    tracking: { providerPosition: null },
  };
}

const browser = await chromium.launch({ headless: true });
const failures = [];

for (const viewport of viewports) {
  const page = await browser.newPage({
    viewport,
    isMobile: true,
    deviceScaleFactor: 2,
  });

  const consoleErrors = [];
  const requestFailures = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleErrors.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("requestfailed", (request) => {
    requestFailures.push(`${request.url()} ${request.failure()?.errorText || "unknown"}`);
  });

  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.setContent(`
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" href="/mimi-servicios/styles/provider.css?v=qa-mobile-services">
      </head>
      <body class="provider-authenticated" data-provider-tab="pricing">
        <button class="sheet-notification-bell has-unread" id="sheetNotificationBell" type="button" aria-label="Abrir notificaciones"><span>!</span><b>3</b></button>
        <div id="bottomSheet" class="bottom-sheet expanded">
          <div class="sheet-content">
            <section id="tabPricing" class="tab-panel active">
              <div id="providerBusinessPanel"></div>
            </section>
          </div>
        </div>
      </body>
    </html>
  `, { waitUntil: "load" });

  const result = await page.evaluate(async ({ state, viewport }) => {
    document.body.classList.add("provider-authenticated");
    document.body.dataset.providerTab = "pricing";

    const moduleUrl = new URL("/mimi-servicios/src/ui/render-provider.js?v=qa-mobile-services", location.href).href;
    const module = await import(moduleUrl);

    const hasNoHorizontalOverflow = () => {
      const panel = document.getElementById("providerBusinessPanel");
      const panelRect = panel?.getBoundingClientRect();
      const documentOk = document.documentElement.scrollWidth <= window.innerWidth + 2;
      const panelOk = !panelRect || panelRect.width <= window.innerWidth + 2;
      return documentOk && panelOk;
    };

    module.renderProviderScreen(state);
    const homeAddButtons = [...document.querySelectorAll(".provider-services-home [data-provider-business-action='add-provider-service']")]
      .filter((button) => button.offsetParent !== null);
    const bellStyle = getComputedStyle(document.getElementById("sheetNotificationBell"));
    const homeText = document.body.innerText;
    const home = {
      hasDashboard: Boolean(document.querySelector(".provider-services-home")),
      hasOneAddCta: homeAddButtons.length === 1,
      hasEnterpriseCards: document.querySelectorAll(".provider-service-list-card").length >= 2,
      hasPreviewAction: homeText.includes("Ver como cliente"),
      hasPauseReactivate: homeText.includes("Pausar") && homeText.includes("Reactivar"),
      noEliminar: !homeText.includes("Eliminar"),
      focusBellHidden: bellStyle.visibility === "hidden" && bellStyle.pointerEvents === "none",
      noOverflow: hasNoHorizontalOverflow(),
    };

    module.renderProviderScreen({
      ...state,
      provider: {
        ...state.provider,
        serviceComposerOpen: true,
        serviceComposerMode: "edit",
        editingOfferingId: "qa-offering-active",
      },
    });
    const composerText = document.body.innerText;
    const roadmapText = document.querySelector(".provider-service-builder-roadmap")?.textContent || "";
    const closeRect = document.querySelector(".provider-service-composer-close")?.getBoundingClientRect();
    const saveRect = document.querySelector(".provider-save-button")?.getBoundingClientRect();
    const composer = {
      hasFocusHead: Boolean(document.querySelector(".provider-service-composer-head")),
      hasClose: Boolean(closeRect && closeRect.width >= 34 && closeRect.height >= 34),
      hasFiveStepCopy: document.querySelectorAll(".provider-service-builder-roadmap span").length === 5 &&
        composerText.includes("Que servicio ofreces?") &&
        composerText.includes("Precio y modalidad") &&
        roadmapText.includes("Adicionales") &&
        composerText.includes("Donde trabajas") &&
        roadmapText.includes("Perfil"),
      hasAuditCopy: composerText.includes("flujo auditado de MIMIGO"),
      hasAddonStep: Boolean(document.querySelector(".provider-flow-step-addons")) &&
        composerText.includes("+ Agregar adicional"),
      profileStepsCompact: !document.querySelector(".provider-profile-details")?.open &&
        Array.from(document.querySelectorAll(".provider-location-editor-step")).every((details) => !details.open),
      saveVisible: Boolean(saveRect && saveRect.width >= 240 && saveRect.height >= 44),
      noOverflow: hasNoHorizontalOverflow(),
    };

    const previewHost = document.createElement("div");
    previewHost.innerHTML = module.renderProviderServicePreviewSheet({
      offering: state.provider.business.offerings[0],
      detail: state.provider.business.profile,
      providerName: "Paulo",
      providerAvatarUrl: "",
      providerInitials: "PA",
      addonsEnabled: false,
    });
    document.body.appendChild(previewHost);
    document.body.classList.add("provider-service-preview-open");
    const previewText = previewHost.innerText;
    const sheetRect = previewHost.querySelector(".provider-service-preview-sheet")?.getBoundingClientRect();
    const footerRect = previewHost.querySelector(".provider-service-preview-actions")?.getBoundingClientRect();
    const preview = {
      hasSheet: Boolean(sheetRect && sheetRect.width <= viewport.width && sheetRect.height <= viewport.height * 0.94),
      hasTabs: previewText.includes("Card") && previewText.includes("Calidad"),
      hasFooter: Boolean(footerRect && footerRect.bottom <= viewport.height + 2),
      priceWithoutDesde: previewText.includes("$") && !previewText.includes("Desde"),
      noOverflow: hasNoHorizontalOverflow(),
    };

    return { viewport, home, composer, preview };
  }, { state: buildState(), viewport });

  const checks = [
    ["dashboard visible", result.home.hasDashboard],
    ["single add CTA", result.home.hasOneAddCta],
    ["enterprise cards visible", result.home.hasEnterpriseCards],
    ["preview action visible", result.home.hasPreviewAction],
    ["pause/reactivate visible", result.home.hasPauseReactivate],
    ["Eliminar absent", result.home.noEliminar],
    ["focus bell hidden", result.home.focusBellHidden],
    ["home no horizontal overflow", result.home.noOverflow],
    ["composer focus header visible", result.composer.hasFocusHead],
    ["composer close visible", result.composer.hasClose],
    ["composer five-step copy", result.composer.hasFiveStepCopy],
    ["composer addon step visible for allowlisted provider", result.composer.hasAddonStep],
    ["composer zone/profile compact by default", result.composer.profileStepsCompact],
    ["composer audit copy", result.composer.hasAuditCopy],
    ["save button visible", result.composer.saveVisible],
    ["composer no horizontal overflow", result.composer.noOverflow],
    ["preview sheet fits", result.preview.hasSheet],
    ["preview tabs visible", result.preview.hasTabs],
    ["preview footer visible", result.preview.hasFooter],
    ["preview price without Desde", result.preview.priceWithoutDesde],
    ["preview no horizontal overflow", result.preview.noOverflow],
  ];

  for (const [name, ok] of checks) {
    if (ok) {
      console.log(`PASS ${viewport.width}x${viewport.height} ${name}`);
    } else {
      failures.push(`${viewport.width}x${viewport.height} ${name}`);
      console.error(`FAIL ${viewport.width}x${viewport.height} ${name}`);
    }
  }

  const relevantRequests = requestFailures.filter((item) =>
    !item.includes("favicon") &&
    !item.includes("fonts.googleapis.com") &&
    !item.includes("fonts.gstatic.com")
  );
  const relevantConsole = consoleErrors.filter((item) =>
    !item.includes("beforeinstallprompt")
  );
  if (relevantRequests.length) {
    failures.push(`${viewport.width}x${viewport.height} request failures`);
    console.error(relevantRequests.join("\n"));
  }
  if (relevantConsole.length) {
    failures.push(`${viewport.width}x${viewport.height} console warnings/errors`);
    console.error(relevantConsole.join("\n"));
  }

  await page.close();
}

await browser.close();

if (failures.length) {
  console.error(`\nProvider services mobile UX smoke failed:\n${failures.join("\n")}`);
  process.exit(1);
}

console.log("\nProvider services mobile UX smoke passed.");
