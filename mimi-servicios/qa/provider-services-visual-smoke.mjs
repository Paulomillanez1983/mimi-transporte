import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const targetUrl = process.argv[2] || "http://127.0.0.1:8765/mimi-servicios/prestador.html?qa_services=20260519";
const screenshotPath = process.argv[3] || "";
const rendererUrl = new URL("/mimi-servicios/src/ui/render-provider.js?v=2026.05.19.18", targetUrl).pathname
  + "?v=2026.05.19.18";
const renderProviderSource = readFileSync(new URL("../src/ui/render-provider.js", import.meta.url), "utf8");
const mainProviderSource = readFileSync(new URL("../src/main-provider.js", import.meta.url), "utf8");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  deviceScaleFactor: 2
});

const consoleMessages = [];
const failedRequests = [];

page.on("console", (message) => {
  if (["error", "warning"].includes(message.type())) {
    consoleMessages.push(`${message.type()}: ${message.text()}`);
  }
});

page.on("requestfailed", (request) => {
  failedRequests.push({
    url: request.url(),
    failure: request.failure()?.errorText || "unknown"
  });
});

await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForFunction(() => Boolean(window.app), { timeout: 12000 }).catch(() => null);
await page.addStyleTag({
  content: `
    #onlineButtonContainer,
    .provider-auth-shell,
    .provider-login-hero-art,
    .provider-login-panel,
    #offerCard,
    #activeServiceCard {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
  `
});

const result = await page.evaluate(async (renderModuleUrl) => {
  document.body.classList.remove("provider-auth-loading", "provider-auth-required");
  document.body.classList.add("provider-authenticated");
  document.body.dataset.providerTab = "pricing";

  document.querySelectorAll("#onlineButtonContainer, .provider-auth-shell, .provider-login-hero-art, .provider-login-panel, #offerCard, #activeServiceCard").forEach((element) => {
    element.hidden = true;
    element.style.setProperty("display", "none", "important");
    element.style.setProperty("visibility", "hidden", "important");
    element.style.setProperty("opacity", "0", "important");
  });

  const boot = document.getElementById("providerBootLoader");
  if (boot) boot.hidden = true;

  const sheet = document.getElementById("bottomSheet");
  if (sheet) {
    sheet.hidden = false;
    sheet.classList.add("expanded");
    sheet.style.display = "block";
    sheet.style.visibility = "visible";
    sheet.style.opacity = "1";
    sheet.style.transform = "none";
    sheet.style.pointerEvents = "auto";
    sheet.style.position = "relative";
    sheet.style.maxHeight = "none";
    sheet.style.height = "auto";
  }

  document.querySelectorAll(".tab-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === "pricing");
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));
  document.getElementById("tabPricing")?.classList.add("active");

  const module = await import(renderModuleUrl);
  const avatarSvg = encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'><rect width='128' height='128' rx='28' fill='#07111f'/><circle cx='64' cy='46' r='24' fill='#4fc3ff'/><path d='M24 116c5-27 25-42 40-42s35 15 40 42' fill='#22c55e'/></svg>");

  const baseState = {
    appConfig: {
      categories: [
        {
          id: "cat-pintura",
          code: "painting",
          name: "Pintura",
          description: "Pintura interior y exterior",
          default_pricing_model: "UNIT",
          allowed_service_modes: ["IN_PERSON"]
        }
      ]
    },
    meta: { backendMode: "supabase", error: null, info: null },
    session: {
      isAuthenticated: true,
      userId: "qa-provider-services-user",
      providerId: "qa-provider-services",
      userName: "Paulo"
    },
    provider: {
      profile: { full_name: "Paulo", approved: true, blocked: false },
      serviceAddons: {
        enabled: false,
        flag: {
          enabled: true,
          scope: "provider",
          metadata_json: {
            enabled_provider_ids: ["qa-provider-services"]
          }
        },
        providerId: "qa-provider-services"
      },
      categories: [{ category_id: "cat-pintura" }],
      business: {
        profile: {
          first_name: "Paulo",
          city: "Cordoba Capital",
          province: "Cordoba",
          address_text: "Villa Cornu",
          bio: "Pintura interior prolija y coordinada por MIMIGO.",
          avatar_public_url: "",
          metadata_json: {
            identity_document_address_text: "Laques 9809, Villa Cornu, Cordoba",
            coverage_radius_meters: 10000
          },
          metadata: { coverage_radius_meters: 10000 }
        },
        pricing: [],
        offerings: [
          {
            id: "qa-offering-painting",
            category_id: "cat-pintura",
            active: true,
            title: "Pintura interior",
            description: "Pinto interiores por m2 con materiales coordinados previamente.",
            public_summary: "Pintura interior por m2 con presupuesto claro.",
            pricing_model: "UNIT",
            service_mode: "IN_PERSON",
            location_policy: "CLIENT_ADDRESS",
            unit_price: 18000,
            unit_name: "m2",
            duration_minutes: 120,
            currency: "ARS"
          }
        ],
        documents: [
          {
            document_type: "selfie",
            file_url: `data:image/svg+xml,${avatarSvg}`,
            review_status: "APPROVED"
          }
        ],
        legalRequirements: [
          { code: "terms_providers", version: "2026.1.0", actor_type: "provider", title: "Terminos" },
          { code: "privacy_policy", version: "2026.1.0", actor_type: "all", title: "Privacidad" }
        ],
        legalAcceptances: [
          { document_code: "terms_providers", document_version: "2026.1.0", actor_type: "provider", accepted_at: "2026-05-19T00:00:00.000Z" },
          { document_code: "privacy_policy", document_version: "2026.1.0", actor_type: "provider", accepted_at: "2026-05-19T00:00:00.000Z" }
        ]
      },
      offers: [],
      stats: {},
      dashboard: {}
    },
    notifications: { items: [] },
    chat: { messages: [], unreadCount: 0 },
    tracking: { providerPosition: null }
  };
  module.renderProviderScreen(baseState);

  const homeText = document.body.innerText;
  const homeHeroText = document.querySelector(".provider-services-home-hero")?.innerText || "";
  const homeAvatar = document.querySelector(".provider-services-home-hero .provider-photo-preview img");
  const homeAddButton = document.querySelector("[data-provider-business-action='add-provider-service']");
  const homeAddButtonRect = homeAddButton?.getBoundingClientRect?.();
  const homeResult = {
    hasServicesHome: Boolean(document.querySelector(".provider-services-home")),
    hasServicesHomeHero: Boolean(document.querySelector(".provider-services-home-hero")),
    hasServicesMiniList: document.querySelectorAll(".provider-service-list-card").length === 1,
    hasAddServiceButton: Boolean(homeAddButtonRect && homeAddButtonRect.width > 220 && homeAddButtonRect.height >= 44),
    hasNoComposerByDefault: !document.querySelector("#providerBusinessForm"),
    hasHomeAvatarInput: Boolean(document.querySelector("#providerAvatarInput")),
    homeCopy: homeText.includes("Tus servicios") &&
      homeText.includes("Agregar servicio") &&
      homeText.includes("Administra que ofreces"),
    homeHeroHasOnlyTitleAndPhoto: homeHeroText.includes("Tus servicios") &&
      !homeHeroText.includes("Tu foto publica") &&
      !homeHeroText.includes("Publicado") &&
      !homeHeroText.includes("$"),
    homeHeroHasNoStatusBlock: !document.querySelector(".provider-services-home-status"),
    homeAvatarUsesDocumentPhoto: Boolean(homeAvatar?.getAttribute("src")?.startsWith("data:image/svg+xml"))
  };

  const profileAvatarSvg = encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'><rect width='128' height='128' rx='28' fill='#123c69'/><circle cx='64' cy='52' r='28' fill='#22c55e'/><path d='M22 118c8-27 25-40 42-40s34 13 42 40' fill='#4fc3ff'/></svg>");
  const profileAvatarUrl = `data:image/svg+xml,${profileAvatarSvg}`;
  module.renderProviderScreen({
    ...baseState,
    provider: {
      ...baseState.provider,
      business: {
        ...baseState.provider.business,
        profile: {
          ...baseState.provider.business.profile,
          avatar_public_url: profileAvatarUrl
        }
      }
    }
  });
  const profileAvatarImg = document.querySelector(".provider-services-home-hero .provider-photo-preview img");
  const profileAvatarResult = {
    homeAvatarUsesProfilePublicUrl: profileAvatarImg?.getAttribute("src") === profileAvatarUrl
  };

  module.renderProviderScreen({
    ...baseState,
    provider: {
      ...baseState.provider,
      serviceComposerOpen: true,
      serviceComposerMode: "new"
    }
  });

  document.querySelector(".sheet-content")?.scrollTo?.({ top: 0, behavior: "instant" });

  const newHero = document.querySelector(".provider-simple-hero");
  const newPreview = document.querySelector(".provider-service-client-preview");
  const newCategorySelect = document.querySelector("[name='offering:0:categoryId']");
  const newCheckedCategories = document.querySelectorAll(".provider-hidden-category-inputs input:checked");
  const newSelectedCards = document.querySelectorAll("[data-provider-suggestion-card].is-selected");
  const newTitleInput = document.querySelector("[name='offering:0:title']");
  const newPrompt = document.querySelector("[name='providerAiPrompt']");
  const newProfileSection = document.querySelector(".provider-profile-collapsible");
  const newBuilderRoadmap = document.querySelector(".provider-service-builder-roadmap");
  const newBuilderRoadmapText = newBuilderRoadmap?.innerText || "";
  const newAddonStep = document.querySelector(".provider-flow-step-addons");
  const readiness = document.querySelector(".provider-service-readiness");
  const readinessText = readiness?.innerText || "";
  const saveButton = document.querySelector(".provider-save-button");
  const saveButtonRect = saveButton?.getBoundingClientRect?.();
  const saveButtonHasIcon = Boolean(document.querySelector(".provider-save-button-icon"));
  const serviceForm = document.querySelector("#providerBusinessForm");
  const advancedDetails = document.querySelector(".provider-advanced-price-details");
  const advancedSummary = advancedDetails?.querySelector("summary");
  const advancedSummaryStyle = advancedSummary ? getComputedStyle(advancedSummary) : null;
  const advancedAfterStyle = advancedSummary ? getComputedStyle(advancedSummary, "::after") : null;
  let saveClickStartsMotion = false;
  let saveLoadingHasSpinner = false;
  let saveLoadingHasMotion = false;
  let saveLoadingText = false;
  let saveClickMotionName = "";
  if (saveButton) {
    window.app?.primeProviderSaveButton?.(saveButton);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    saveClickMotionName = getComputedStyle(saveButton).animationName;
    saveClickStartsMotion = Boolean(
      saveButton.classList.contains("is-save-primed") ||
      saveButton.classList.contains("is-loading") ||
      String(saveClickMotionName || "").includes("providerSaveButtonBreath")
    );
    saveButton.classList.add("is-loading");
    saveButton.disabled = true;
    saveButton.innerHTML = `<span class="button-spinner" aria-hidden="true"></span><span>Guardando cambios...</span>`;
    const spinner = saveButton.querySelector(".button-spinner");
    const spinnerStyle = spinner ? getComputedStyle(spinner) : null;
    const buttonMotion = getComputedStyle(saveButton).animationName;
    const buttonSweep = getComputedStyle(saveButton, "::after").animationName;
    saveLoadingHasSpinner = Boolean(
      spinner &&
      Number.parseFloat(spinnerStyle?.width || "0") >= 20 &&
      String(spinnerStyle?.animationName || "").includes("mimi-spin")
    );
    saveLoadingHasMotion = Boolean(
      String(buttonMotion || "").includes("providerSaveButtonBreath") ||
      String(buttonSweep || "").includes("providerSaveButtonSweep")
    );
    saveLoadingText = Boolean(saveButton.textContent?.includes("Guardando cambios"));
  }

  const hiddenGlobalFieldsExist =
    Boolean(document.querySelector("input[type='hidden'][name='providerFirstName']")) &&
    Boolean(document.querySelector("input[type='hidden'][name='providerAddressText']")) &&
    Boolean(document.querySelector("input[type='hidden'][name='providerProvince']")) &&
    Boolean(document.querySelector("input[type='hidden'][name='providerCity']")) &&
    Boolean(document.querySelector("input[type='hidden'][name='providerLocationLat']")) &&
    Boolean(document.querySelector("input[type='hidden'][name='providerLocationLng']"));
  const globalProfileFieldsAvailable =
    Boolean(document.querySelector("[name='providerFirstName'], [data-provider-public-name]")) &&
    Boolean(document.querySelector("[name='providerAddressText']")) &&
    Boolean(document.querySelector("[name='providerProvince']")) &&
    Boolean(document.querySelector("[name='providerCity'], [name='providerCityOther']")) &&
    Boolean(document.querySelector("[name='providerLocationLat']")) &&
    Boolean(document.querySelector("[name='providerLocationLng']"));

  const newServiceResult = {
    ...homeResult,
    ...profileAvatarResult,
    newComposerSkipsHero: !newHero,
    newComposerSkipsPreviousPreview: !newPreview,
    newComposerStartsWithoutSelectedCards: newSelectedCards.length === 0,
    newComposerStartsWithoutCheckedCategories: newCheckedCategories.length === 0,
    newComposerCategoryIsEmpty: String(newCategorySelect?.value || "") === "",
    newComposerTitleIsEmpty: String(newTitleInput?.value || "") === "",
    newComposerPromptIsEmpty: String(newPrompt?.value || "") === "",
    newComposerUsesCompactProfileSection: Boolean(newProfileSection) &&
      newProfileSection.textContent.includes("Donde trabajas") &&
      newProfileSection.textContent.includes("Perfil publico"),
    newComposerKeepsProfileFieldsAvailable: hiddenGlobalFieldsExist || globalProfileFieldsAvailable,
    newComposerReadinessStartsAtOneOfThree: readinessText.includes("1 de 3 listos"),
    hasHiddenAvatarUrl: Boolean(document.querySelector("[name='providerAvatarPublicUrl']")),
    advancedDetailsExists: Boolean(advancedDetails),
    advancedSummaryHasTwoColumnLayout: Boolean(
      advancedSummaryStyle?.gridTemplateColumns &&
      advancedSummaryStyle.gridTemplateColumns.split(" ").length >= 2 &&
      advancedAfterStyle?.gridRowStart === "1"
    ),
    hasFlowSteps: document.querySelectorAll(".provider-flow-step").length >= 2,
    hasBuilderRoadmap: Boolean(newBuilderRoadmap),
    hasFiveBuilderRoadmapSteps: document.querySelectorAll(".provider-service-builder-roadmap span").length === 5,
    hasBuilderRoadmapLabels:
      newBuilderRoadmapText.includes("Servicio") &&
      newBuilderRoadmapText.includes("Precio") &&
      newBuilderRoadmapText.includes("Adicionales") &&
      newBuilderRoadmapText.includes("Zona") &&
      newBuilderRoadmapText.includes("Perfil"),
    allowlistedProviderShowsAddonStep: Boolean(newAddonStep) &&
      newAddonStep.textContent.includes("Adicionales") &&
      newAddonStep.textContent.includes("Los adicionales se pueden agregar despues de publicar el servicio"),
    addonStepAppearsAfterPrice:
      Boolean(newAddonStep) &&
      Boolean(advancedDetails) &&
      advancedDetails.compareDocumentPosition(newAddonStep) & Node.DOCUMENT_POSITION_FOLLOWING,
    zoneProfileDetailsCollapsed: !document.querySelector(".provider-profile-details")?.open &&
      Array.from(document.querySelectorAll(".provider-location-editor-step")).every((details) => !details.open),
    hasReadiness: Boolean(readiness),
    hasReadinessBar: Boolean(document.querySelector(".provider-service-readiness-bar span")),
    hasReadinessSteps: document.querySelectorAll(".provider-service-readiness-steps span").length === 3,
    saveButtonVisible: Boolean(saveButtonRect && saveButtonRect.width > 220 && saveButtonRect.height >= 48),
    saveButtonHasIcon,
    saveClickStartsMotion,
    saveLoadingHasSpinner,
    saveLoadingHasMotion,
    saveLoadingText,
    formDisablesNativeValidation: Boolean(serviceForm?.hasAttribute("novalidate")),
    hasCityOtherFallback: Boolean(document.querySelector("[name='providerCityOther']")),
    hasLocationHiddenInputs:
      Boolean(document.querySelector("[name='providerLocationLat']")) &&
      Boolean(document.querySelector("[name='providerLocationLng']")) &&
      Boolean(document.querySelector("[name='providerLocationSource']")),
    noLegacyGuide: !document.querySelector(".provider-service-guide"),
    noDuplicateCurrentCard: !document.querySelector(".provider-current-services-card"),
    hasPrimaryPriceGrid: Boolean(document.querySelector(".provider-primary-price-grid")),
    hasServiceForm: Boolean(document.querySelector("#providerBusinessForm")),
    hasRequiredInputs:
      Boolean(document.querySelector("[name='offering:0:title']")) &&
      Boolean(document.querySelector("[name='offering:0:pricingModel']")) &&
      Boolean(document.querySelector("input[type='hidden'][name='providerFirstName']")),
    bodyTextPreview: document.body.innerText.slice(0, 900)
  };

  module.renderProviderScreen({
    ...baseState,
    provider: {
      ...baseState.provider,
      serviceAddons: {
        ...baseState.provider.serviceAddons,
        providerId: "qa-other-provider"
      },
      business: {
        ...baseState.provider.business,
        offerings: baseState.provider.business.offerings.map((offering) => ({
          ...offering,
          provider_id: "qa-other-provider"
        }))
      },
      serviceComposerOpen: true,
      serviceComposerMode: "edit",
      editingOfferingId: "qa-offering-painting"
    },
    session: {
      ...baseState.session,
      providerId: "qa-other-provider"
    }
  });
  const nonAllowlistedResult = {
    nonAllowlistedProviderHidesAddonStep: !document.querySelector(".provider-flow-step-addons")
  };

  module.renderProviderScreen({
    ...baseState,
    provider: {
      ...baseState.provider,
      editingOfferingId: "qa-offering-painting",
      serviceComposerOpen: true,
      serviceComposerMode: "edit"
    }
  });

  const editBodyText = document.body.innerText;
  const editAvatar = document.querySelector(".provider-client-preview-avatar img");
  const editProfileDetails = document.querySelector(".provider-profile-details");
  const editPublicCards = document.querySelectorAll(".provider-client-preview-card");
  const editGpsButton = document.querySelector("[data-provider-business-action='use-provider-current-location']");
  const editGpsButtonRect = editGpsButton?.getBoundingClientRect?.();
  const editResult = {
    hasPreview: Boolean(document.querySelector(".provider-service-client-preview")),
    hasPreviewCard: Boolean(document.querySelector(".provider-client-preview-card")),
    hasSinglePublicPreviewCard: editPublicCards.length === 1,
    hasPhotoSync: editBodyText.includes("Foto sincronizada"),
    avatarUsesPublicUrl: Boolean(editAvatar?.getAttribute("src")?.startsWith("data:image/svg+xml")),
    hasAvatarInput: homeResult.hasHomeAvatarInput,
    profileDetailsCollapsed: Boolean(editProfileDetails && !editProfileDetails.open),
    hasProfileStepper: Boolean(document.querySelector(".provider-profile-stepper")),
    hasIdentityAddress: Boolean(document.querySelector(".provider-identity-address-card")),
    hasGpsAddressButton: Boolean(editGpsButton),
    gpsButtonVisible: Boolean(editGpsButtonRect && editGpsButtonRect.width > 180 && editGpsButtonRect.height >= 40),
    gpsButtonCopy: Boolean(editGpsButton?.textContent?.includes("Usar GPS del telefono")),
    hasGpsStatus: Boolean(document.querySelector("#providerAddressLocationStatus")),
    hasCityOtherFallback: Boolean(document.querySelector("[name='providerCityOther']")),
    editAllowlistedAddonButton: Boolean(document.querySelector(".provider-flow-step-addons")) &&
      editBodyText.includes("+ Agregar adicional") &&
      editBodyText.includes("flujo auditado de MIMIGO"),
    publicNameIsReadonly:
      Boolean(document.querySelector("[data-provider-public-name]")) &&
      !document.querySelector("input[type='text'][name='providerFirstName']")
  };

  module.renderProviderScreen({
    ...baseState,
    provider: {
      ...baseState.provider,
      serviceComposerOpen: true,
      serviceComposerMode: "new"
    }
  });
  document.querySelector(".sheet-content")?.scrollTo?.({ top: 0, behavior: "instant" });

  return {
    ...newServiceResult,
    ...nonAllowlistedResult,
    ...editResult
  };
}, rendererUrl);

if (screenshotPath) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: screenshotPath, fullPage: false });
}

await browser.close();

const checks = [
  ["published services home exists by default", result.hasServicesHome],
  ["published services home hero exists", result.hasServicesHomeHero],
  ["published services home hero removes duplicate price/copy", result.homeHeroHasOnlyTitleAndPhoto],
  ["published services home has no duplicate status block", result.homeHeroHasNoStatusBlock],
  ["published services home avatar falls back to uploaded document photo", result.homeAvatarUsesDocumentPhoto],
  ["published services home avatar prefers profile public URL", result.homeAvatarUsesProfilePublicUrl],
  ["published services mini list exists", result.hasServicesMiniList],
  ["add service button is prominent", result.hasAddServiceButton],
  ["composer is closed by default when services exist", result.hasNoComposerByDefault],
  ["published services home keeps avatar input", result.hasHomeAvatarInput],
  ["published services home copy is clear", result.homeCopy],
  ["new service composer skips repeated hero", result.newComposerSkipsHero],
  ["new service composer skips previous service preview", result.newComposerSkipsPreviousPreview],
  ["new service composer starts without selected suggestion cards", result.newComposerStartsWithoutSelectedCards],
  ["new service composer starts without checked categories", result.newComposerStartsWithoutCheckedCategories],
  ["new service composer category starts empty", result.newComposerCategoryIsEmpty],
  ["new service composer title starts empty", result.newComposerTitleIsEmpty],
  ["new service composer prompt starts empty", result.newComposerPromptIsEmpty],
  ["new service composer uses compact zone/profile section", result.newComposerUsesCompactProfileSection],
  ["new service composer keeps profile fields available", result.newComposerKeepsProfileFieldsAvailable],
  ["new service readiness starts at one of three", result.newComposerReadinessStartsAtOneOfThree],
  ["edit service client preview exists", result.hasPreview],
  ["edit service client preview card exists", result.hasPreviewCard],
  ["edit service only has one public preview card", result.hasSinglePublicPreviewCard],
  ["edit service photo sync copy exists", result.hasPhotoSync],
  ["edit service preview avatar uses public profile URL", result.avatarUsesPublicUrl],
  ["avatar upload input exists", result.hasAvatarInput],
  ["hidden avatar URL field exists", result.hasHiddenAvatarUrl],
  ["profile details collapsed when complete", result.profileDetailsCollapsed],
  ["advanced price details exist", result.advancedDetailsExists],
  ["advanced options summary has safe two-column layout", result.advancedSummaryHasTwoColumnLayout],
  ["service builder has compact flow steps", result.hasFlowSteps],
  ["service builder has five-step roadmap", result.hasFiveBuilderRoadmapSteps],
  ["service builder roadmap labels are clear", result.hasBuilderRoadmapLabels],
  ["allowlisted provider sees addon step", result.allowlistedProviderShowsAddonStep],
  ["allowlisted edit service shows add addon button", result.editAllowlistedAddonButton],
  ["addon step appears after price", result.addonStepAppearsAfterPrice],
  ["non allowlisted provider hides addon step", result.nonAllowlistedProviderHidesAddonStep],
  ["zone and profile details are collapsed by default", result.zoneProfileDetailsCollapsed],
  ["profile editor uses stepper", result.hasProfileStepper],
  ["identity address card exists", result.hasIdentityAddress],
  ["GPS address button exists", result.hasGpsAddressButton],
  ["GPS address button is visually prominent", result.gpsButtonVisible],
  ["GPS address button uses clear copy", result.gpsButtonCopy],
  ["GPS address status exists", result.hasGpsStatus],
  ["service readiness block exists", result.hasReadiness],
  ["service readiness progress bar exists", result.hasReadinessBar],
  ["service readiness steps exist", result.hasReadinessSteps],
  ["save button is visually prominent", result.saveButtonVisible],
  ["save button icon exists", result.saveButtonHasIcon],
  ["save button production method starts immediate motion", result.saveClickStartsMotion],
  ["save button loading spinner is visible", result.saveLoadingHasSpinner],
  ["save button loading has motion", result.saveLoadingHasMotion],
  ["save button loading copy is clear", result.saveLoadingText],
  ["service form disables native browser validation", result.formDisablesNativeValidation],
  ["manual locality fallback exists", result.hasCityOtherFallback],
  ["location hidden inputs exist", result.hasLocationHiddenInputs],
  ["legacy provider service guide is not rendered", result.noLegacyGuide],
  ["duplicate current services card is not rendered", result.noDuplicateCurrentCard],
  ["primary price grid exists", result.hasPrimaryPriceGrid],
  ["service form exists", result.hasServiceForm],
  ["required service inputs still exist", result.hasRequiredInputs],
  ["public first name is read-only in services", result.publicNameIsReadonly],
  ["save handler primes button on click", mainProviderSource.includes("primeProviderSaveButton")],
  ["save handler starts loading before collecting payload",
    mainProviderSource.indexOf('this.setButtonBusy(submitButton, true, "Guardando cambios...");') > -1 &&
    mainProviderSource.indexOf('this.setButtonBusy(submitButton, true, "Guardando cambios...");') <
      mainProviderSource.indexOf("const payload = this.collectProviderBusinessPayload(form);")],
  ["new service opener keeps composer top visible",
    mainProviderSource.includes('if (mode === "new")') &&
    mainProviderSource.includes('scrollParent?.scrollTo?.({ top: 0, behavior: "smooth" });')],
  ["renderer keeps services form novalidate", renderProviderSource.includes('id="providerBusinessForm" novalidate')]
];

let failures = 0;
for (const [name, ok] of checks) {
  if (ok) {
    console.log(`PASS ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL ${name}`);
  }
}

const relevantFailures = failedRequests.filter((request) =>
  !request.url.includes("chrome-extension://") &&
  !request.url.includes("fonts.gstatic.com") &&
  !request.url.includes("fonts.googleapis.com") &&
  !request.url.includes("favicon")
);

if (relevantFailures.length) {
  console.error("Request failures:", JSON.stringify(relevantFailures, null, 2));
  failures += 1;
}

const relevantConsole = consoleMessages.filter((message) =>
  !message.includes("beforeinstallprompt")
);

if (relevantConsole.length) {
  console.error("Console warnings/errors:", JSON.stringify(relevantConsole, null, 2));
  failures += 1;
}

if (failures) {
  console.error("\nProvider services visual smoke failed.");
  console.error(result.bodyTextPreview);
  process.exit(1);
}

console.log("\nProvider services visual smoke passed.");
