import { appConfig } from "../config.js";

const stateLabels = {
  SEARCHING: "Buscando prestador",
  PENDING_PROVIDER_RESPONSE: "Esperando respuesta",
  ACCEPTED: "Prestador confirmado",
  SCHEDULED: "Servicio agendado",
  PROVIDER_EN_ROUTE: "Prestador en camino",
  PROVIDER_ARRIVED: "Prestador en puerta",
  IN_PROGRESS: "Servicio en curso",
  COMPLETED: "Servicio completado",
  CANCELLED: "Servicio cancelado"
};

const providerStatusLabels = {
  OFFLINE: "Desconectado",
  ONLINE_IDLE: "Online",
  INVITED: "Invitado",
  BOOKED_UPCOMING: "Reservado",
  EN_ROUTE: "En camino",
  ARRIVED: "Llegó",
  IN_SERVICE: "En servicio",
  PAUSED: "En pausa",
  BLOCKED: "Bloqueado"
};

const reviewStatusLabels = {
  APPROVED: "Aprobado",
  PENDING: "Pendiente",
  REJECTED: "Observado",
  NEEDS_RESUBMISSION: "Reenviar"
};

const dayLabels = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const pricingModelLabels = {
  QUOTE: "Cotizar antes de confirmar",
  FIXED: "Precio cerrado por trabajo",
  HOURLY: "Por hora",
  BASE_VISIT: "Por visita",
  UNIT: "Por sesion / unidad",
  SQUARE_METER: "Por m2 / unidad",
  LINEAR_METER: "Por metro lineal"
};

const quotePricingHelp = "El presupuesto, la aceptación y el pago se realizan dentro de MIMIGO.";

const serviceModeLabels = {
  IN_PERSON: "Presencial",
  ONLINE: "Online",
  HYBRID: "Online y presencial"
};

const locationPolicyLabels = {
  CLIENT_ADDRESS: "Domicilio del cliente",
  PROVIDER_ADDRESS: "Consultorio / base del prestador",
  ONLINE_ONLY: "Videollamada",
  FLEXIBLE: "Ubicacion flexible"
};

const categoryGroupLabels = {
  professional: "Profesionales",
  home: "Hogar y mantenimiento",
  care: "Cuidado y bienestar",
  beauty: "Belleza y personales",
  technical: "Tecnicos y movilidad",
  other: "Otros oficios"
};

const argentinaZones = {
  "Buenos Aires": ["La Plata", "Mar del Plata", "Bahia Blanca", "Tandil", "San Isidro", "Quilmes", "Moron", "Lomas de Zamora", "Avellaneda", "Lanus", "San Justo", "Merlo", "Moreno", "Pilar", "Tigre", "San Fernando", "Vicente Lopez", "Tres de Febrero", "San Martin", "Pergamino", "Junin", "Olavarria", "Necochea", "Azul", "Chivilcoy", "Campana", "Zarate", "Escobar", "Ezeiza", "Berazategui", "Florencio Varela", "Almirante Brown", "Esteban Echeverria"],
  "Catamarca": ["San Fernando del Valle de Catamarca", "Valle Viejo", "Fray Mamerto Esquiu", "Andalgala", "Belen", "Tinogasta", "Santa Maria"],
  "Chaco": ["Resistencia", "Barranqueras", "Fontana", "Presidencia Roque Saenz Pena", "Villa Angela", "Charata", "General San Martin"],
  "Chubut": ["Rawson", "Trelew", "Puerto Madryn", "Comodoro Rivadavia", "Esquel", "Sarmiento", "Gaiman"],
  "CABA": ["Ciudad Autonoma de Buenos Aires"],
  "Cordoba": ["Cordoba Capital", "Villa Carlos Paz", "Rio Cuarto", "Villa Maria", "Alta Gracia", "Carlos Paz", "San Francisco", "Rio Tercero", "Jesus Maria", "La Calera", "Bell Ville", "Marcos Juarez"],
  "Corrientes": ["Corrientes Capital", "Goya", "Paso de los Libres", "Curuzu Cuatia", "Mercedes", "Santo Tome", "Bella Vista"],
  "Entre Rios": ["Parana", "Concordia", "Gualeguaychu", "Concepcion del Uruguay", "Villaguay", "Victoria", "La Paz", "Colon"],
  "Formosa": ["Formosa Capital", "Clorinda", "Pirané", "El Colorado", "Las Lomitas", "Ingeniero Juarez"],
  "Jujuy": ["San Salvador de Jujuy", "Palpala", "Perico", "San Pedro de Jujuy", "Libertador General San Martin", "Tilcara", "Humahuaca"],
  "La Pampa": ["Santa Rosa", "General Pico", "Toay", "General Acha", "Realico", "Eduardo Castex"],
  "La Rioja": ["La Rioja Capital", "Chilecito", "Aimogasta", "Chamical", "Chepes", "Villa Union"],
  "Mendoza": ["Mendoza Capital", "Godoy Cruz", "Guaymallen", "San Rafael", "Maipu", "Las Heras", "Lujan de Cuyo", "Tunuyan", "San Martin", "Rivadavia", "Malargue"],
  "Misiones": ["Posadas", "Obera", "Eldorado", "Puerto Iguazu", "Apostoles", "Leandro N. Alem", "San Vicente"],
  "Neuquen": ["Neuquen Capital", "Plottier", "San Martin de los Andes", "Cutral Co", "Zapala", "Centenario", "Villa La Angostura", "Chos Malal"],
  "Rio Negro": ["Bariloche", "General Roca", "Viedma", "Cipolletti", "Villa Regina", "Allen", "Cinco Saltos"],
  "Salta": ["Salta Capital", "Oran", "Tartagal", "General Guemes", "Metan", "Cafayate", "Rosario de la Frontera"],
  "San Juan": ["San Juan Capital", "Rawson", "Rivadavia", "Chimbas", "Santa Lucia", "Pocito", "Caucete"],
  "San Luis": ["San Luis Capital", "Villa Mercedes", "Merlo", "La Punta", "Juana Koslay", "Justo Daract"],
  "Santa Cruz": ["Rio Gallegos", "Caleta Olivia", "Pico Truncado", "Puerto Deseado", "El Calafate", "Las Heras"],
  "Santa Fe": ["Rosario", "Santa Fe Capital", "Rafaela", "Venado Tuerto", "Santo Tome", "Reconquista", "Villa Gobernador Galvez", "Esperanza", "Casilda", "Cañada de Gomez"],
  "Santiago del Estero": ["Santiago del Estero Capital", "La Banda", "Termas de Rio Hondo", "Fernandez", "Añatuya", "Frías"],
  "Tierra del Fuego": ["Ushuaia", "Rio Grande", "Tolhuin"],
  "Tucuman": ["San Miguel de Tucuman", "Yerba Buena", "Tafi Viejo", "Banda del Rio Sali", "Concepcion", "Aguilares", "Famailla"]
};

function currency(value, currencyCode = "ARS") {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currencyCode || "ARS",
    maximumFractionDigits: 0
  }).format(Number(value ?? 0));
}

function formatDate(value) {
  if (!value) return "Ahora";

  try {
    return new Intl.DateTimeFormat("es-AR", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(new Date(value));
  } catch {
    return "Ahora";
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const PROVIDER_LEGAL_FALLBACKS = [
  {
    code: "terms_providers",
    document_code: "terms_providers",
    actor_type: "provider",
    title: "Términos para prestadores",
    version: "2026.1.0",
    version_label: "Versión 2026.1.0"
  },
  {
    code: "privacy_policy",
    document_code: "privacy_policy",
    actor_type: "all",
    title: "Política de privacidad",
    version: "2026.1.0",
    version_label: "Versión 2026.1.0"
  }
];

function providerLegalRequirements(state = {}) {
  const requirements = state.provider?.business?.legalRequirements;
  const source = Array.isArray(requirements) && requirements.length
    ? requirements
    : PROVIDER_LEGAL_FALLBACKS;

  return source
    .map((item) => {
      const code = item.code || item.document_code;
      return code && item.version
        ? {
            ...item,
            code,
            document_code: code,
            version: String(item.version),
            title: item.title || code,
            actor_type: item.actor_type || "provider"
          }
        : null;
    })
    .filter(Boolean);
}

function isProviderLegalAccepted(requirement = {}, acceptances = []) {
  if (requirement.accepted === true) {
    return true;
  }

  const expectedActor = requirement.accept_actor_type || (requirement.actor_type === "all" ? "provider" : requirement.actor_type || "provider");

  return acceptances.some((acceptance) =>
    acceptance?.document_code === requirement.document_code &&
    acceptance?.document_version === requirement.version &&
    (!acceptance?.actor_type || acceptance.actor_type === expectedActor) &&
    acceptance?.accepted_at
  );
}

function providerLegalStatus(state = {}) {
  const requirements = providerLegalRequirements(state);
  const acceptances = state.provider?.business?.legalAcceptances ?? [];
  const missing = requirements.filter((requirement) =>
    !isProviderLegalAccepted(requirement, acceptances)
  );
  const acceptedAt = acceptances
    .filter((acceptance) =>
      requirements.some((requirement) =>
        requirement.document_code === acceptance?.document_code &&
        requirement.version === acceptance?.document_version &&
        (!acceptance?.actor_type || acceptance.actor_type === (requirement.accept_actor_type || (requirement.actor_type === "all" ? "provider" : requirement.actor_type || "provider")))
      )
    )
    .map((acceptance) => acceptance.accepted_at)
    .concat(requirements.map((requirement) => requirement.accepted_at).filter(Boolean))
    .filter(Boolean)
    .sort()
    .pop();

  return {
    requirements,
    missing,
    accepted: requirements.length > 0 && missing.length === 0,
    acceptedAt
  };
}

function renderProviderLegalAcceptance(state = {}) {
  const legal = providerLegalStatus(state);
  const latestLabel = legal.requirements
    .map((requirement) => requirement.version_label || requirement.version)
    .filter(Boolean)
    .join(" · ");
  const hadPreviousAcceptance = Boolean(
    state.provider?.business?.legalAcceptances?.some((acceptance) =>
      ["terms_providers", "privacy_policy"].includes(acceptance?.document_code)
    )
  );

  if (legal.accepted) {
    const acceptedDate = legal.acceptedAt
      ? new Date(legal.acceptedAt).toLocaleDateString("es-AR")
      : "vigente";

    return `
      <div class="provider-terms-accepted">
        <span>Términos vigentes aceptados · ${escapeHtml(acceptedDate)}</span>
        <small>${escapeHtml(latestLabel)}</small>
        <input name="providerTermsAccepted" type="checkbox" checked hidden>
      </div>
    `;
  }

  return `
    <label class="provider-check-item provider-terms-box">
      <input name="providerTermsAccepted" type="checkbox" required>
      <span>
        <strong>${hadPreviousAcceptance ? "Actualizamos las condiciones legales." : "Antes de publicar, aceptá las condiciones vigentes."}</strong>
        Acepto los <a href="/terminos" target="_blank" rel="noopener">Términos para prestadores</a> y la <a href="/privacidad" target="_blank" rel="noopener">Política de privacidad</a>. Entiendo que MIMI GO es una plataforma tecnológica intermediaria: no contrata prestadores, no garantiza ingresos ni resultados, y no responde por la ejecución material del servicio entre partes independientes.
        <small>Se registrará tu aceptación con la versión vigente${latestLabel ? `: ${escapeHtml(latestLabel)}` : ""}.</small>
      </span>
    </label>
  `;
}

function renderProviderLegalGate(state = {}) {
  const legal = providerLegalStatus(state);
  const versionLabels = [
    ...new Set(
      legal.requirements
        .map((requirement) => requirement.version_label || requirement.version)
        .filter(Boolean)
    )
  ];
  const versionText = versionLabels.length ? versionLabels.join(" / ") : "vigente";

  return `
    <section class="provider-legal-gate" data-provider-legal-gate>
      <div class="provider-legal-gate-header">
        <span class="eyebrow">Condiciones legales</span>
        <h3>Antes de publicar tus servicios</h3>
        <p>Para usar MIMI GO como prestador, necesitás aceptar las condiciones legales vigentes.</p>
      </div>

      <label class="provider-check-item provider-legal-gate-check">
        <input name="providerLegalGateAccepted" type="checkbox" aria-describedby="providerLegalGateDisclaimer">
        <span>Acepto los <a href="/terminos.html" target="_blank" rel="noopener">Términos para prestadores</a> y la <a href="/privacidad.html" target="_blank" rel="noopener">Política de privacidad</a>.</span>
      </label>

      <p class="provider-legal-disclaimer" id="providerLegalGateDisclaimer">
        Entiendo que MIMI GO es una plataforma tecnológica intermediaria: no contrata prestadores, no garantiza ingresos ni resultados, y no responde por la ejecución material del servicio entre partes independientes.
      </p>

      <p class="provider-legal-version">Se registrará tu aceptación con la versión vigente: ${escapeHtml(versionText)}.</p>

      <div class="provider-legal-links" aria-label="Documentos legales">
        <a href="/terminos.html" target="_blank" rel="noopener">Ver términos</a>
        <a href="/privacidad.html" target="_blank" rel="noopener">Ver política de privacidad</a>
      </div>

      <button class="btn-primary provider-legal-accept-button" type="button" data-provider-business-action="accept-provider-legal-gate" disabled>Aceptar y continuar</button>
    </section>
  `;
}

function offerServiceDetails(offer = {}) {
  const request = offer.svc_requests ?? offer.request ?? {};
  const metadata = request.metadata_json ?? offer.metadata_json ?? {};
  const details = metadata.service_details ?? {};
  return details && typeof details === "object" ? details : {};
}

function offerDetailRows(offer = {}) {
  const request = offer.svc_requests ?? offer.request ?? {};
  const details = offerServiceDetails(offer);
  const rows = [];
  const quantity = Number(details.unit_quantity || 0);
  const unitName = details.unit_name || "";
  const unitPrice = Number(details.unit_price || 0);
  const providerAmount = Number(details.provider_price ?? request.provider_price_snapshot ?? offer.provider_price_snapshot ?? 0);
  const currencyCode = details.currency || request.currency || "ARS";

  if (quantity > 0 && unitName) rows.push(["Cantidad", `${quantity.toLocaleString("es-AR")} ${unitName}`]);
  if (unitPrice > 0 && unitName) rows.push(["Precio publicado", `${currency(unitPrice, currencyCode)} / ${unitName}`]);
  rows.push(["Tu precio", providerAmount > 0 ? currency(providerAmount, currencyCode) : "Cotizar antes de confirmar"]);

  const notes = String(details.client_notes || request.notes || "").trim();
  if (notes) rows.push(["Detalle", notes.split("\n")[0]]);

  return rows.slice(0, 5);
}

function providerPaymentStatusLabel(status) {
  const value = String(status || "").trim().toUpperCase();
  if (value === "APPROVED" || value === "CAPTURED") return "Pago confirmado";
  if (value === "REJECTED" || value === "CANCELLED") return "Pago no completado";
  return "Pago pendiente";
}

function categoryGroup(category = {}) {
  const code = String(category.code ?? "").toUpperCase();
  if (["PSICOLOGIA", "NUTRICION", "KINESIOLOGIA", "ABOGACIA", "CONTABILIDAD", "ENFERMERIA", "CLASES_PARTICULARES"].includes(code)) {
    return "professional";
  }
  if (["LIMPIEZA", "LIMPIEZA_OFICINAS", "SERVICIO_DOMESTICO", "PLOMERIA", "ELECTRICIDAD", "GASISTA", "PINTURA", "CARPINTERIA", "ALBANILERIA", "REPARACIONES_HOGAR", "COLOCACION_CERAMICOS", "JARDINERIA", "CERRAJERIA", "HERRERIA"].includes(code)) {
    return "home";
  }
  if (["CUIDADO_ADULTOS", "CUIDADO_NINOS", "ACOMPANAMIENTO_DOMICILIARIO", "MASAJISTA", "MASCOTAS"].includes(code)) {
    return "care";
  }
  if (["BELLEZA", "MANICURIA", "PELUQUERIA", "PESTANAS", "MAQUILLAJE"].includes(code)) {
    return "beauty";
  }
  if (["INSTALACION_AIRE", "REFRIGERACION", "TECNICO_PC", "TECNOLOGIA", "GOMERIA_MOVIL", "MECANICA_MOVIL", "MUDANZAS"].includes(code)) {
    return "technical";
  }
  return "other";
}

function sortedCategories(categories = []) {
  const order = ["professional", "home", "care", "beauty", "technical", "other"];
  return [...categories].sort((a, b) => {
    const groupDelta = order.indexOf(categoryGroup(a)) - order.indexOf(categoryGroup(b));
    if (groupDelta !== 0) return groupDelta;
    return String(a.name ?? "").localeCompare(String(b.name ?? ""), "es");
  });
}

function categoryById(categories = [], id = "") {
  return categories.find((category) => String(category.id) === String(id)) ?? null;
}

function recommendedDefaultsForCategory(category = {}) {
  const safeCategory = category ?? {};
  const model = String(safeCategory.default_pricing_model || "HOURLY").toUpperCase();
  const modes = Array.isArray(safeCategory.allowed_service_modes) && safeCategory.allowed_service_modes.length
    ? safeCategory.allowed_service_modes
    : ["IN_PERSON"];
  const serviceMode = modes.includes("ONLINE") ? "ONLINE" : modes[0] || "IN_PERSON";

  return {
    pricingModel: model,
    serviceMode,
    locationPolicy: serviceMode === "ONLINE" ? "ONLINE_ONLY" : "CLIENT_ADDRESS",
    unitName: model === "UNIT" ? "sesion" : "",
    durationMinutes: model === "UNIT" ? 45 : ""
  };
}

function providerProfileQuality({ offerings = [], detail = null, categories = [] } = {}) {
  let score = 0;
  const tips = [];

  if (offerings.length) score += 35;
  else tips.push("Publica al menos un servicio concreto.");

  if (categories.length) score += 15;
  else tips.push("Elegi el rubro donde queres aparecer.");

  if (detail?.public_headline || detail?.bio) score += 15;
  else tips.push("Agrega un titulo o bio corta.");

  if (detail?.city || detail?.province || detail?.address_text) score += 15;
  else tips.push("Indica zona de trabajo o ciudad base.");

  if (offerings.some((item) => item.public_summary || item.description)) score += 10;
  else tips.push("Conta brevemente que incluye tu servicio.");

  if (offerings.some((item) => item.price_per_hour || item.unit_price || item.fixed_price || item.base_visit_fee || item.quote_required)) score += 10;
  else tips.push("Agrega precio de referencia o marca que requiere presupuesto.");

  const label = score >= 80 ? "Perfil bien cargado" : score >= 45 ? "Perfil basico" : "Perfil incompleto";

  return { score, label, tips: tips.slice(0, 3) };
}

function categoryRequirementText(category = {}) {
  const items = [];
  if (category.requires_professional_license) items.push("requiere matricula o titulo");
  if (category.requires_background_check) items.push("requiere buena conducta");
  const modes = Array.isArray(category.allowed_service_modes) ? category.allowed_service_modes : [];
  if (modes.includes("ONLINE")) items.push("admite online");
  return items.join(" · ");
}

function setBadgeCount(id, count) {
  const el = document.getElementById(id);
  if (!el) return;

  const safeCount = Math.max(0, Number(count ?? 0));
  el.textContent = String(safeCount);
  el.hidden = safeCount <= 0;
}

function initialsFromName(name) {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) return "PR";

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function firstNameFromText(value) {
  const clean = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!clean) return "";
  return clean.split(" ")[0] || "";
}

function renderStatusBanner(state) {
  const banner = document.getElementById("statusBanner");
  if (!banner) return;

  if (!state.meta.error && !state.meta.info) {
    banner.hidden = true;
    banner.textContent = "";
    banner.className = "status-banner is-info";
    return;
  }

  banner.hidden = false;
  banner.textContent = state.meta.error || state.meta.info;
  banner.className = `status-banner ${state.meta.error ? "is-error" : "is-info"}`;

  if (state.provider.activeService && !state.meta.error) {
    banner.className = "status-banner is-success";
  }
}

function renderAuth(state) {
  const sessionChip = document.getElementById("sessionChip");
  const authPrimaryButton = document.getElementById("authPrimaryButton");
  const authSecondaryButton = document.getElementById("authSecondaryButton");
  const authHint = document.getElementById("authHint");

  const isAuthenticated = Boolean(state.session.userId);
  const hasBackend = state.meta.backendMode === "supabase";
  const displayName =
    state.session.userName || state.session.userEmail || "Prestador";

  if (sessionChip) {
    sessionChip.textContent = isAuthenticated
      ? `Prestador · ${displayName}`
      : hasBackend
        ? "Prestador invitado"
        : "Modo demo";
  }

  if (authPrimaryButton) {
    authPrimaryButton.hidden = isAuthenticated;
  }

  if (authSecondaryButton) {
    authSecondaryButton.hidden = !isAuthenticated;
  }

  if (authHint) {
    authHint.textContent = isAuthenticated
      ? "Ya podés gestionar ofertas, ajustar tu setup y operar el servicio activo con tracking real."
      : hasBackend
        ? "Ingresá con Google para ver tus ofertas, pricing y estados en tiempo real."
        : "Sin credenciales de Supabase cargadas. Podés revisar la UI en modo demo.";
  }
}

export function renderProviderStats(state) {
  const providerStateChip = document.getElementById("providerStateChip");
  const providerRating = document.getElementById("providerRating");
  const providerOffersCount = document.getElementById("providerOffersCount");
  const providerCompletedCount = document.getElementById("providerCompletedCount");

  const status = state.provider.profile?.status ?? state.provider.status;
  const reviewSummary = state.provider.reviewSummary ?? {};

  if (providerStateChip) {
    providerStateChip.textContent = providerStatusLabels[status] ?? status;
  }

  if (providerRating) {
    providerRating.textContent = Number(
      reviewSummary.average ?? state.provider.stats.rating ?? 5
    ).toFixed(1);
  }

  if (providerOffersCount) {
    providerOffersCount.textContent = String(state.provider.offers?.length ?? 0);
  }

  if (providerCompletedCount) {
    providerCompletedCount.textContent = String(state.provider.stats.completed ?? 0);
  }

  document.querySelectorAll("[data-provider-status]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.providerStatus === status);
  });
}

export function renderOffersList(state) {
  const offersList = document.getElementById("offersList");
  if (!offersList) return;

  const offers = Array.isArray(state.provider.offers) ? state.provider.offers : [];

  offersList.innerHTML = offers.length
    ? offers
        .map((offer) => {
          const request = offer.svc_requests ?? {};
          const details = offerServiceDetails(offer);
          const detailRows = offerDetailRows(offer);
          const serviceName = details.category_name ?? offer.title ?? request.svc_categories?.name ?? "Nueva solicitud";
          const providerAmount = Number(details.provider_price ?? offer.provider_price_snapshot ?? request.provider_price_snapshot ?? 0);
          const displayAmount = providerAmount;
          const addressText = details.address_text ?? offer.address_text ?? request.address_text ?? "Ubicación a confirmar";
          const clientName = details.client_name ?? offer.client_name ?? request.client_name ?? "Cliente";

          return `
            <article class="offer-card">
              <header>
                <div>
                  <strong>${escapeHtml(serviceName)}</strong>
                  <span class="muted">${escapeHtml(addressText)}</span>
                </div>
                <strong>${displayAmount > 0 ? `Tu precio ${currency(displayAmount, details.currency ?? request.currency)}` : "Cotizar antes de confirmar"}</strong>
              </header>

              ${detailRows.length ? `
                <div class="offer-detail-grid offer-detail-grid-inline">
                  ${detailRows.map(([label, value]) => `
                    <div class="offer-detail-pill">
                      <span>${escapeHtml(label)}</span>
                      <strong>${escapeHtml(value)}</strong>
                    </div>
                  `).join("")}
                </div>
              ` : ""}

              <div class="result-meta">
                <div class="metric">
                  <span>Cliente</span>
                  <strong>${escapeHtml(clientName)}</strong>
                </div>
                <div class="metric">
                  <span>Duración</span>
                  <strong>${escapeHtml(String(offer.requested_hours ?? request.requested_hours ?? 2))} hs</strong>
                </div>
                <div class="metric">
                  <span>Estado</span>
                  <strong>${escapeHtml(offer.status ?? "PENDING")}</strong>
                </div>
                <div class="metric">
                  <span>Vence</span>
                  <strong>${escapeHtml(formatDate(offer.expires_at))}</strong>
                </div>
              </div>

              <div class="action-row">
                <button
                  class="btn-secondary"
                  data-offer-action="reject"
                  data-offer-id="${escapeHtml(offer.id)}"
                  type="button"
                >
                  Rechazar
                </button>
                <button
                  class="btn-primary"
                  data-offer-action="accept"
                  data-offer-id="${escapeHtml(offer.id)}"
                  type="button"
                >
                  Aceptar
                </button>
              </div>
            </article>
          `;
        })
        .join("")
    : `
      <div class="summary-card">
        <strong>Sin ofertas activas</strong>
        <span class="muted">Cuando entre una solicitud te la mostramos acá en tiempo real.</span>
      </div>
    `;
}

function providerPayoutStatusMeta(account, providerReadyForPayoutReview) {
  if (!account) {
    return {
      label: providerReadyForPayoutReview ? "Incompleto" : "Pendiente KYC",
      className: "is-incomplete",
      message: providerReadyForPayoutReview
        ? "Carga CBU, CVU o alias para dejar tus datos pendientes de revision."
        : "Completa tu identidad/KYC para habilitar la revision de tus datos de cobro."
    };
  }

  const status = String(account.status || "").toLowerCase();
  const ownership = String(account.ownership_verification_status || "").toLowerCase();

  if (status === "verified" || ownership === "ownership_verified") {
    return {
      label: "Verificado",
      className: "is-verified",
      message: "Cuenta verificada."
    };
  }

  if (status === "rejected" || ["ownership_mismatch", "account_inactive", "verification_failed"].includes(ownership)) {
    return {
      label: "Requiere revision",
      className: "is-rejected",
      message: "No pudimos validar la cuenta. Revisa los datos o contacta soporte."
    };
  }

  if (status === "draft") {
    return {
      label: "Incompleto",
      className: "is-incomplete",
      message: "Completa y envia tus datos para revision."
    };
  }

  return {
    label: "Pendiente",
    className: "is-pending",
    message: "Datos enviados a revision."
  };
}

function selectedOption(value, current) {
  return value === current ? " selected" : "";
}

function payoutMethodClass(account, method) {
  return account?.account_type === method ? " is-active" : "";
}

function payoutMethodLabel(method) {
  const labels = {
    cbu: "CBU",
    cvu: "CVU",
    alias: "Alias",
    bank_account: "Cuenta bancaria"
  };
  return labels[method] || "CBU";
}

function payoutMethodHelp(method) {
  const labels = {
    cbu: "Cuenta bancaria tradicional de 22 digitos.",
    cvu: "Billetera virtual con CVU de 22 digitos.",
    alias: "Alias de CBU/CVU, facil de recordar.",
    bank_account: "Cuenta bancaria con CBU y datos del titular."
  };
  return labels[method] || labels.cbu;
}

function payoutVisibleFor(field) {
  const map = {
    cbu: ["cbu", "bank_account"],
    cvu: ["cvu"],
    alias: ["alias"],
    bank_name: ["bank_account"],
    holder_name: ["bank_account"],
    holder_tax_id: ["bank_account"],
    change_reason: ["cbu", "cvu", "alias", "bank_account"]
  };
  return map[field] || [];
}

function payoutFieldWrapAttrs(field, accountType, className = "") {
  const visibleFor = payoutVisibleFor(field);
  const visible = visibleFor.includes(accountType);
  return `class="provider-payout-field ${className}" data-payout-field="${field}" data-visible-for="${visibleFor.join(" ")}"${visible ? "" : " hidden aria-hidden=\"true\""}`;
}

function payoutInputStateAttrs(field, accountType, walletLoading, requiredFor = []) {
  const visible = payoutVisibleFor(field).includes(accountType);
  const disabled = walletLoading || !visible;
  const required = visible && requiredFor.includes(accountType);
  const requiredForAttr = requiredFor.length ? ` data-required-for="${requiredFor.join(" ")}"` : "";
  return `${requiredForAttr}${disabled ? " disabled" : ""}${required ? " required" : ""}`;
}

function payoutAccountTypeChecked(value, current, walletLoading) {
  return `${value === current ? " checked" : ""}${walletLoading ? " disabled" : ""}`;
}

function compactWalletAddress(value) {
  const text = String(value || "Servicio").replace(/\s+/g, " ").trim();
  if (!text) return "Servicio";
  const parts = text.split(",").map((part) => part.trim()).filter(Boolean);
  const compact = parts.length > 1 ? parts.slice(0, 2).join(", ") : text;
  return compact.length > 66 ? `${compact.slice(0, 63).trim()}...` : compact;
}

function walletHistoryTitle(item = {}, details = {}) {
  return details.category_name ||
    item.category_name ||
    item.svc_categories?.name ||
    item.title ||
    "Servicio completado";
}

function walletHistoryStatus(item = {}) {
  const status = item.status || item.request_status || item.payment_status;
  return stateLabels[status] || providerPaymentStatusLabel(item.payment_status) || "Completado";
}

function syncRenderedPayoutAccountFields(form, { clearHidden = false } = {}) {
  if (!form) return;

  const selected =
    form.querySelector("[name='account_type']:checked")?.value ||
    form.querySelector("[name='account_type']")?.value ||
    "cbu";
  const accountType = ["cbu", "cvu", "alias", "bank_account"].includes(selected) ? selected : "cbu";
  const walletBusy = form.dataset.walletBusy === "true" || form.getAttribute("aria-busy") === "true";
  form.dataset.accountType = accountType;

  form.querySelectorAll("[data-payout-field]").forEach((field) => {
    const visibleFor = String(field.dataset.visibleFor || "")
      .split(/\s+/)
      .filter(Boolean);
    const visible = visibleFor.includes(accountType);
    field.hidden = !visible;
    field.setAttribute("aria-hidden", String(!visible));

    field.querySelectorAll("input, select, textarea").forEach((control) => {
      control.disabled = walletBusy || !visible;
      const requiredFor = String(control.dataset.requiredFor || "")
        .split(/\s+/)
        .filter(Boolean);
      control.required = visible && requiredFor.includes(accountType);
      if (!visible && clearHidden && ["cbu", "cvu", "alias"].includes(control.name)) {
        control.value = "";
      }
    });
  });

  const title = form.querySelector("[data-payout-mode-title]");
  const copy = form.querySelector("[data-payout-mode-copy]");
  if (title) title.textContent = payoutMethodLabel(accountType);
  if (copy) copy.textContent = payoutMethodHelp(accountType);
}

export function renderProviderDashboard(state) {
  const container = document.getElementById("providerDashboardPanel");
  if (!container) return;

  const dashboard = state.provider.dashboard ?? {};
  const availableBalance = dashboard.available_balance ?? dashboard.earnings ?? 0;
  const pendingBalance = dashboard.pending_balance ?? dashboard.pending_earnings ?? 0;
  const futureDebtBalance = dashboard.cash_debt_balance ?? dashboard.negative_balance ?? 0;
  const payoutAccount = state.provider.payoutAccount ?? null;
  const walletLoading = Boolean(state.provider.walletLoading);
  const payoutAccountError = state.provider.payoutAccountError || null;
  const providerReadyForPayoutReview = Boolean(
    state.provider.profile?.approved ||
    state.provider.profile?.kyc_approved ||
    state.provider.profile?.kyc_tax_id_status === "verified" ||
    state.provider.business?.kyc_tax_id_status === "verified"
  );
  const payoutStatusMeta = providerPayoutStatusMeta(payoutAccount, providerReadyForPayoutReview);
  const accountType = payoutAccount?.account_type || "cbu";
  const payoutIdentifier =
    payoutAccount?.cbu_masked ||
    payoutAccount?.cvu_masked ||
    payoutAccount?.alias_masked ||
    "Sin datos cargados";
  const payoutStatus = payoutStatusMeta.label;
  const ownershipStatus = payoutAccount?.ownership_verification_status || (providerReadyForPayoutReview ? "no_account" : "pending_missing_tax_id");
  const ownershipMessages = {
    no_account: "Carga CBU/CVU o alias para dejar tus datos pendientes de revision.",
    not_verified: "Datos enviados a revision.",
    pending_review: "Datos enviados a revision.",
    pending_external_verification: "Cuenta bancaria en verificacion.",
    pending_missing_tax_id: "Tus datos fueron enviados. La cuenta se verificara cuando tu identidad/KYC este completo.",
    verification_failed: "No pudimos verificar titularidad. Queda para revision.",
    ownership_verified: "Cuenta verificada.",
    ownership_mismatch: "Cuenta rechazada: no coincide titularidad.",
    account_inactive: "Cuenta rechazada: cuenta bancaria inactiva.",
    manual_review: "Cuenta en revision manual.",
    needs_more_info: "Necesitamos mas informacion para revisar tus datos."
  };
  const ownershipCopy = ownershipMessages[ownershipStatus] || "Datos enviados a revision.";
  const encryptionWarning = payoutAccount?.encrypted_payload_required
    ? `<p class="provider-wallet-warning">Tus datos quedaron enmascarados y pendientes de recarga cifrada antes de habilitar payouts reales.</p>`
    : "";
  const walletLoadingCopy = walletLoading
    ? `<p class="provider-wallet-loading" role="status" aria-live="polite">Sincronizando Wallet...</p>`
    : "";
  const walletErrorCopy = payoutAccountError
    ? `<p class="provider-wallet-error" role="alert" aria-live="assertive">${escapeHtml(payoutAccountError)}</p>`
    : "";
  const disabledAttr = walletLoading ? " disabled" : "";
  const payoutMethodTitle = payoutMethodLabel(accountType);
  const payoutMethodCopy = payoutMethodHelp(accountType);
  const hasPayoutAccount = Boolean(payoutAccount);
  const payoutStatusValue = String(payoutAccount?.status || "").toLowerCase();
  const payoutSetupRequired = !hasPayoutAccount;
  const shouldOpenPayoutDetails =
    payoutSetupRequired ||
    payoutStatusValue === "draft" ||
    payoutStatusMeta.className === "is-rejected" ||
    Boolean(payoutAccountError);
  const withdrawDisabledAttr = !hasPayoutAccount || walletLoading ? " disabled aria-disabled=\"true\"" : "";
  const walletAmountLabel = hasPayoutAccount ? currency(availableBalance) : "Configura cobro";
  const walletAmountHelp = hasPayoutAccount
    ? "Saldo informativo para pruebas. Payout real todavia desactivado."
    : "Primero carga CBU, CVU o alias para preparar retiros.";
  const payoutSummaryTitle = hasPayoutAccount ? payoutIdentifier : "Sin metodo cargado";
  const payoutDetailsAction = hasPayoutAccount ? "Editar datos" : "Cargar ahora";
  const historyItems = Array.isArray(dashboard.history) ? dashboard.history.slice(0, 5) : [];
  const historyHtml = historyItems.length
    ? historyItems.map((item) => {
        const details = offerServiceDetails(item);
        const providerAmount = Number(details.provider_price ?? item.provider_price_snapshot ?? item.provider_amount ?? 0);
        const address = compactWalletAddress(item.address_text ?? details.address_text ?? item.location_text ?? "Servicio");
        const title = walletHistoryTitle(item, details);
        const status = walletHistoryStatus(item);
        const date = formatDate(item.completed_at ?? item.updated_at ?? item.created_at);
        return `
          <article class="provider-history-card">
            <div class="provider-history-card-main">
              <span>${escapeHtml(title)}</span>
              <strong>${escapeHtml(address)}</strong>
              <small>${escapeHtml(date)} - ${escapeHtml(status)}</small>
            </div>
            <b>${currency(providerAmount)}</b>
          </article>
        `;
      }).join("")
    : `<div class="provider-history-empty">Sin historial aun.</div>`;

  container.innerHTML = `
    <section id="providerWalletOverview" class="provider-wallet-shell ${payoutSetupRequired ? "is-setup-required" : "is-ready"}" aria-label="Wallet del prestador">
      ${payoutSetupRequired ? `
        <article class="provider-wallet-gate">
          <span>Antes de retirar</span>
          <strong>Carga un CBU, CVU o alias</strong>
          <p>El saldo de retiro queda preparado cuando hay un metodo de cobro pendiente o verificado.</p>
        </article>
      ` : ""}

      <article class="provider-wallet-hero-card">
        <div class="provider-wallet-card-top">
          <span>Wallet MIMIGO</span>
          <b class="provider-wallet-live-pill">Test</b>
        </div>
        <strong>${escapeHtml(walletAmountLabel)}</strong>
        <small>${escapeHtml(walletAmountHelp)}</small>
        <div class="provider-wallet-actions">
          <button type="button" data-provider-wallet-refresh${disabledAttr}>${walletLoading ? "Actualizando..." : "Actualizar"}</button>
          <button type="button" data-provider-wallet-withdraw${withdrawDisabledAttr}>Retirar</button>
        </div>
      </article>

      <div class="provider-wallet-metrics">
        <article>
          <span>A liberar</span>
          <strong>${currency(pendingBalance)}</strong>
          <small>Liquidaciones pendientes.</small>
        </article>
        <article>
          <span>A compensar</span>
          <strong>${currency(futureDebtBalance)}</strong>
          <small>No se descuenta dinero real.</small>
        </article>
      </div>

      <article class="provider-wallet-payout-summary">
        <div>
          <span>Metodo de cobro</span>
          <strong>${escapeHtml(payoutSummaryTitle)}</strong>
          <small><b class="provider-wallet-status ${payoutStatusMeta.className}">${escapeHtml(payoutStatus)}</b> - ${escapeHtml(ownershipCopy)}</small>
        </div>
        <span class="provider-wallet-method-chip">${escapeHtml(hasPayoutAccount ? payoutMethodLabel(accountType) : "Requerido")}</span>
      </article>

      ${encryptionWarning}
      ${walletLoadingCopy}
      ${walletErrorCopy}
    </section>

    <details id="providerPayoutAccountPanel" class="provider-payout-account-panel provider-payout-account-details" aria-label="Datos para recibir pagos"${shouldOpenPayoutDetails ? " open" : ""}>
      <summary>
        <span>
          <b>Datos para recibir pagos</b>
          <small>${hasPayoutAccount ? "Tus datos quedan protegidos y colapsados. Abrilo solo para editar." : "Obligatorio para preparar retiros."}</small>
        </span>
        <strong>${escapeHtml(payoutDetailsAction)}</strong>
      </summary>

      <div class="provider-payout-account-copy">
        <span class="provider-wallet-eyebrow">Metodo de cobro</span>
        <h3>${hasPayoutAccount ? "Editar datos de cobro" : "Cargar datos de cobro"}</h3>
        <p>Elegis un metodo y solo aparecen los campos necesarios. Queda pendiente de revision; Payout real todavia desactivado.</p>
        <p class="provider-wallet-note">Nunca mostramos CBU/CVU ni CUIT/CUIL completos; el alias tambien queda enmascarado.</p>
        <div class="provider-wallet-methods" aria-label="Metodos de cobro admitidos">
          <span class="provider-wallet-method${payoutMethodClass(payoutAccount, "cbu")}">CBU</span>
          <span class="provider-wallet-method${payoutMethodClass(payoutAccount, "cvu")}">CVU</span>
          <span class="provider-wallet-method${payoutMethodClass(payoutAccount, "alias")}">Alias</span>
          <span class="provider-wallet-method${payoutMethodClass(payoutAccount, "bank_account")}">Cuenta</span>
        </div>
        <p class="provider-wallet-current">Estado actual: <strong>${escapeHtml(payoutStatusMeta.label)}</strong>. ${escapeHtml(payoutStatusMeta.message)}</p>
      </div>
      <form id="providerPayoutAccountForm" class="provider-payout-account-form provider-payout-account-form-v2" aria-busy="${walletLoading ? "true" : "false"}" data-wallet-busy="${walletLoading ? "true" : "false"}" data-account-type="${escapeHtml(accountType)}">
        <fieldset class="provider-payout-method-picker">
          <legend>Elegi como queres cargar la cuenta</legend>
          <label class="provider-payout-method-option">
            <input type="radio" name="account_type" value="cbu"${payoutAccountTypeChecked("cbu", accountType, walletLoading)}>
            <span><b>CBU</b><small>Banco</small></span>
          </label>
          <label class="provider-payout-method-option">
            <input type="radio" name="account_type" value="cvu"${payoutAccountTypeChecked("cvu", accountType, walletLoading)}>
            <span><b>CVU</b><small>Billetera</small></span>
          </label>
          <label class="provider-payout-method-option">
            <input type="radio" name="account_type" value="alias"${payoutAccountTypeChecked("alias", accountType, walletLoading)}>
            <span><b>Alias</b><small>CBU/CVU</small></span>
          </label>
          <label class="provider-payout-method-option">
            <input type="radio" name="account_type" value="bank_account"${payoutAccountTypeChecked("bank_account", accountType, walletLoading)}>
            <span><b>Cuenta</b><small>CBU + titular</small></span>
          </label>
        </fieldset>

        <div class="provider-payout-selected-summary" data-payout-selected-summary>
          <span data-payout-mode-title>${escapeHtml(payoutMethodTitle)}</span>
          <small data-payout-mode-copy>${escapeHtml(payoutMethodCopy)}</small>
        </div>

        <label ${payoutFieldWrapAttrs("cbu", accountType)}>
          <span>CBU</span>
          <input name="cbu" inputmode="numeric" maxlength="22" pattern="[0-9]{22}" autocomplete="off" placeholder="${escapeHtml(payoutAccount?.cbu_masked || "22 digitos")}"${payoutInputStateAttrs("cbu", accountType, walletLoading, ["cbu", "bank_account"])} />
          <small>Usamos solo datos enmascarados para revision.</small>
        </label>
        <label ${payoutFieldWrapAttrs("cvu", accountType)}>
          <span>CVU</span>
          <input name="cvu" inputmode="numeric" maxlength="22" pattern="[0-9]{22}" autocomplete="off" placeholder="${escapeHtml(payoutAccount?.cvu_masked || "22 digitos")}"${payoutInputStateAttrs("cvu", accountType, walletLoading, ["cvu"])} />
          <small>Para billeteras virtuales con CVU.</small>
        </label>
        <label ${payoutFieldWrapAttrs("alias", accountType)}>
          <span>Alias</span>
          <input name="alias" minlength="6" maxlength="80" autocomplete="off" placeholder="${escapeHtml(payoutAccount?.alias_masked || "tu.alias")}"${payoutInputStateAttrs("alias", accountType, walletLoading, ["alias"])} />
          <small>Al elegir Alias solo cargamos este dato y el motivo.</small>
        </label>
        <label ${payoutFieldWrapAttrs("bank_name", accountType)}>
          <span>Banco/billetera</span>
          <input name="bank_name" maxlength="100" autocomplete="organization" placeholder="Banco o billetera" value="${escapeHtml(payoutAccount?.bank_name || "")}"${payoutInputStateAttrs("bank_name", accountType, walletLoading)} />
        </label>
        <label ${payoutFieldWrapAttrs("holder_name", accountType)}>
          <span>Titular</span>
          <input name="holder_name" maxlength="120" autocomplete="name" placeholder="Nombre del titular" value="${escapeHtml(payoutAccount?.holder_name || "")}"${payoutInputStateAttrs("holder_name", accountType, walletLoading)} />
        </label>
        <label ${payoutFieldWrapAttrs("holder_tax_id", accountType)}>
          <span>CUIT/CUIL titular</span>
          <input name="holder_tax_id" inputmode="numeric" maxlength="20" autocomplete="off" placeholder="${escapeHtml(payoutAccount?.holder_tax_id_masked || "Opcional")}"${payoutInputStateAttrs("holder_tax_id", accountType, walletLoading)} />
        </label>
        <label ${payoutFieldWrapAttrs("change_reason", accountType, "provider-payout-account-reason")}>
          <span>Motivo del alta/cambio</span>
          <input name="change_reason" maxlength="220" autocomplete="off" placeholder="Ej: cargo mi cuenta para futuras liquidaciones"${payoutInputStateAttrs("change_reason", accountType, walletLoading, ["cbu", "cvu", "alias", "bank_account"])} />
        </label>
        <button type="submit"${disabledAttr}>${walletLoading ? "Enviando..." : "Enviar a revision"}</button>
      </form>
    </details>

    <section class="provider-kpi-grid">

      <article class="provider-kpi-card">
        <span>Ganancias historicas</span>
        <strong>${currency(dashboard.earnings ?? 0)}</strong>
        <small>Total histórico</small>
      </article>

      <article class="provider-kpi-card">
        <span>Servicios completados</span>
        <strong>${dashboard.completed ?? 0}</strong>
        <small>Servicios</small>
      </article>

      <article class="provider-kpi-card">
        <span>Estado actual</span>
        <strong>${
          dashboard.active
            ? stateLabels[dashboard.active.status] ?? dashboard.active.status
            : "Sin servicio"
        }</strong>
        <small>Tiempo real</small>
      </article>

    </section>

    <section class="provider-history provider-history-v2">
      <div class="provider-history-heading">
        <span>Actividad</span>
        <h3>Ultimos servicios</h3>
      </div>
      <div class="provider-history-list">
        ${historyHtml}
      </div>
    </section>
  `;

  const payoutForm = container.querySelector("#providerPayoutAccountForm");
  syncRenderedPayoutAccountFields(payoutForm);
  payoutForm?.addEventListener("change", (event) => {
    if (!event.target?.closest?.("[name='account_type']")) return;
    syncRenderedPayoutAccountFields(payoutForm, { clearHidden: true });
  });
}
export function renderProviderActiveService(state) {
  const providerActiveService = document.getElementById("providerActiveService");
  const providerActions = document.getElementById("providerActions");

  if (!providerActiveService || !providerActions) return;

  const activeService = state.provider.activeService;
  const activeDetails = activeService?.details ?? offerServiceDetails(activeService ?? {});
  const activeQuantity = Number(activeDetails.unit_quantity || 0);
  const activeUnitName = activeDetails.unit_name || "";
  const activeProviderAmount = Number(
      activeDetails.provider_price ??
      activeService?.provider_price_snapshot ??
      activeService?.provider_amount ??
      activeService?.price ??
      0
  );
  const activePaymentLabel = providerPaymentStatusLabel(activeService?.payment_status ?? activeService?.payment?.status);

  providerActiveService.innerHTML = activeService
    ? `
      <div class="summary-card">
        <strong>${escapeHtml(activeService.title ?? "Servicio activo")}</strong>
        <div class="summary-metrics">
          <div class="metric">
            <span>Estado</span>
            <strong>${escapeHtml(stateLabels[activeService.status] ?? activeService.status)}</strong>
          </div>
          <div class="metric">
            <span>Dirección</span>
            <strong>${escapeHtml(activeService.address_text ?? "Pendiente")}</strong>
          </div>
          <div class="metric">
            <span>Inicio</span>
            <strong>${escapeHtml(formatDate(activeService.scheduled_for ?? activeService.created_at))}</strong>
          </div>
          <div class="metric">
            <span>Duración</span>
            <strong>${escapeHtml(String(activeService.requested_hours ?? 2))} hs</strong>
          </div>
          ${activeQuantity > 0 && activeUnitName ? `
            <div class="metric">
              <span>Cantidad</span>
              <strong>${escapeHtml(`${activeQuantity.toLocaleString("es-AR")} ${activeUnitName}`)}</strong>
            </div>
          ` : ""}
          <div class="metric">
            <span>Tu precio</span>
            <strong>${currency(activeProviderAmount)}</strong>
          </div>
          <div class="metric">
            <span>Pago</span>
            <strong>${escapeHtml(activePaymentLabel)}</strong>
          </div>
          <div class="metric">
            <span>Tracking</span>
            <strong>${state.tracking.providerPosition ? "Activo" : "Pendiente"}</strong>
          </div>
        </div>
      </div>
    `
    : `
      <div class="summary-card">
        <strong>Sin servicio activo</strong>
        <span class="muted">Aceptá una oferta para habilitar las acciones operativas y el tracking del servicio.</span>
      </div>
    `;

  providerActions.innerHTML = activeService
    ? [
        ["ACCEPTED", "SCHEDULED"].includes(activeService.status)
          ? `<button class="btn-primary" data-provider-flow="en-route" type="button">En camino</button>`
          : "",
        activeService.status === "PROVIDER_EN_ROUTE"
          ? `<button class="btn-primary" data-provider-flow="arrived" type="button">Llegué</button>`
          : "",
        activeService.status === "PROVIDER_ARRIVED"
          ? `<button class="btn-primary" data-provider-flow="start" type="button">Iniciar</button>`
          : "",
        activeService.status === "IN_PROGRESS"
          ? `<button class="btn-primary" data-provider-flow="complete" type="button">Completar</button>`
          : "",
        !["COMPLETED", "CANCELLED"].includes(activeService.status)
          ? `<button class="btn-secondary" data-provider-flow="chat" type="button">Chat</button>`
          : ""
      ].join("")
    : "";
}

function renderProviderProfile(state) {
  const container = document.getElementById("providerProfilePanel");
  if (!container) return;

  const profile = state.provider.profile;
  const detail = state.provider.business?.profile ?? null;
  const documents = state.provider.business?.documents ?? [];
  const categories = state.provider.categories ?? [];
  const reviewSummary = state.provider.reviewSummary ?? {};

  if (!profile && !detail) {
    container.innerHTML = `
      <article class="account-empty">
        <strong>Perfil pendiente</strong>
        <p>Cuando carguemos tu información del backend, vas a ver tu bio, cobertura y modalidad de trabajo.</p>
      </article>
    `;
    return;
  }

  // Nombre real: profile.first_name (cargado por el prestador o extraído del DNI) tiene prioridad.
  const profileMetadata = detail?.metadata_json || detail?.metadata || {};
  const providerDocuments = [
    ...(Array.isArray(documents) ? documents : []),
    ...(Array.isArray(state.provider.documents?.items) ? state.provider.documents.items : [])
  ];
  const identityFullName = String(
    profileMetadata.identity_document_full_name ||
    profileMetadata.full_name_detected ||
    profileMetadata.kyc_full_name ||
    ""
  ).trim();
  const firstName = firstNameFromText(detail?.first_name || identityFullName);
  const displayName =
    firstName ||
    profile?.full_name ||
    state.session.userName ||
    state.session.userEmail?.split("@")[0] ||
    "Prestador";

  const avatarUrl = firstImageUrlFrom(
    detail?.avatar_public_url,
    detail?.metadata_json?.avatar_public_url,
    detail?.metadata_json?.profile_photo_url,
    detail?.metadata_json?.public_url,
    detail?.metadata_json?.file_url,
    detail?.metadata_json?.signed_url,
    detail?.metadata_json?.preview_url,
    detail?.metadata_json?.image_url,
    profile?.avatar_public_url,
    profile?.avatar_url,
    profile?.photo_url,
    state.session.userAvatar,
    providerDocumentAvatarUrl(providerDocuments)
  ) || null;
  const location = [detail?.city, detail?.province].filter(Boolean).join(", ");

  // Verificado = aprobado por admin Y dni_front + selfie aprobados.
  // Esto refleja el estado real, no solo el flag de admin.
  const docByType = new Map();
  for (const d of documents) {
    const t = String(d.document_type ?? "").toLowerCase();
    if (!t) continue;
    const existing = docByType.get(t);
    if (!existing || new Date(d.created_at ?? 0) > new Date(existing.created_at ?? 0)) {
      docByType.set(t, d);
    }
  }
  const dniFrontApproved = String(docByType.get("dni_front")?.review_status ?? "").toUpperCase() === "APPROVED";
  const selfieApproved = String(docByType.get("selfie")?.review_status ?? "").toUpperCase() === "APPROVED";
  const adminApproved = Boolean(profile?.approved);
  const isBlocked = Boolean(profile?.blocked);
  const isVerified = adminApproved && dniFrontApproved && selfieApproved && !isBlocked;
  const inReview = !isVerified && !isBlocked && (docByType.size > 0);

  // Cálculo de % completitud del perfil
  const checklist = {
    "Nombre de pila": Boolean(firstName),
    "Foto de perfil": Boolean(avatarUrl),
    "Bio corta": Boolean(detail?.bio),
    "Ciudad y provincia": Boolean(detail?.city && detail?.province),
    "Al menos un servicio": (state.provider.business?.offerings ?? []).filter((o) => o?.active !== false).length > 0,
    "DNI verificado": isVerified,
  };
  const completedKeys = Object.keys(checklist).filter((k) => checklist[k]);
  const totalKeys = Object.keys(checklist).length;
  const completePct = Math.round((completedKeys.length / totalKeys) * 100);

  const offerings = (state.provider.business?.offerings ?? []).filter((o) => o?.active !== false);
  const completedSvcs = Number(state.provider.stats?.completedServices ?? state.provider.stats?.completed ?? 0);
  const ratingValue = Number(reviewSummary.average ?? state.provider.stats?.rating ?? 5);
  const reviewsCount = Number(reviewSummary.count ?? 0);

  container.innerHTML = `
    <!-- HERO con avatar, badge verificado y completitud -->
    <section class="account-hero">
      <div class="account-hero-top">
        <div class="account-avatar ${isVerified ? "is-verified" : ""}">
          ${avatarUrl
            ? `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(displayName)}" loading="lazy">`
            : `<span>${escapeHtml(initialsFromName(displayName))}</span>`}
          ${isVerified ? `<svg class="verified-badge" viewBox="0 0 24 24" aria-label="Verificado">
            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" fill="#10b981"/>
            <path d="M9 12l2 2 4-4" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>` : ""}
        </div>
        <div class="account-hero-info">
          <h2>${escapeHtml(displayName)}</h2>
          ${isBlocked
            ? `<span class="account-status-pill is-blocked">Cuenta bloqueada</span>`
            : isVerified
              ? `<span class="account-status-pill is-verified">✓ Verificado</span>`
              : `<span class="account-status-pill is-pending">Verificación en revisión</span>`}
          ${location ? `<p class="account-location">📍 ${escapeHtml(location)}</p>` : ""}
        </div>
      </div>

      <div class="account-progress">
        <div class="account-progress-header">
          <span>Perfil completo</span>
          <strong>${completePct}%</strong>
        </div>
        <div class="account-progress-bar">
          <div class="account-progress-fill" style="width: ${completePct}%"></div>
        </div>
        ${completePct < 100 ? `
          <div class="account-progress-checklist">
            ${Object.entries(checklist).map(([label, done]) => `
              <span class="account-checklist-item ${done ? "is-done" : ""}">
                ${done ? "✓" : "○"} ${escapeHtml(label)}
              </span>
            `).join("")}
          </div>
        ` : ""}
      </div>
    </section>

    <!-- KPIs en cards limpias -->
    <section class="account-kpis">
      <article class="account-kpi-card">
        <span class="account-kpi-icon">⭐</span>
        <div>
          <strong>${ratingValue.toFixed(1)}</strong>
          <small>${reviewsCount} reseña${reviewsCount === 1 ? "" : "s"}</small>
        </div>
      </article>
      <article class="account-kpi-card">
        <span class="account-kpi-icon">✓</span>
        <div>
          <strong>${completedSvcs}</strong>
          <small>servicio${completedSvcs === 1 ? "" : "s"} completado${completedSvcs === 1 ? "" : "s"}</small>
        </div>
      </article>
      <article class="account-kpi-card">
        <span class="account-kpi-icon">💼</span>
        <div>
          <strong>${offerings.length}</strong>
          <small>servicio${offerings.length === 1 ? "" : "s"} activo${offerings.length === 1 ? "" : "s"}</small>
        </div>
      </article>
    </section>

    <!-- BIO si existe -->
    ${detail?.bio ? `
      <section class="account-section">
        <h3>Sobre vos</h3>
        <p class="account-bio">${escapeHtml(detail.bio)}</p>
      </section>
    ` : ""}
  `;
}

function renderAvailability(items) {
  if (!Array.isArray(items) || !items.length) {
    return `
      <div class="summary-card">
        <strong>Disponibilidad pendiente</strong>
        <span class="muted">El backend ya soporta franjas en svc_provider_availability, pero todavía no hay horarios activos para mostrar.</span>
      </div>
    `;
  }

  return `
    <div class="provider-slot-grid">
      ${items
        .map(
          (slot) => `
            <article class="provider-slot-card">
              <strong>${escapeHtml(dayLabels[Number(slot.day_of_week)] ?? "Día")}</strong>
              <span>${escapeHtml(String(slot.start_time ?? "").slice(0, 5))} - ${escapeHtml(String(slot.end_time ?? "").slice(0, 5))}</span>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderPricing(pricing, detail) {
  if (!Array.isArray(pricing) || !pricing.length) {
    return `
      <div class="summary-card">
        <strong>Tarifas pendientes</strong>
        <span class="muted">Todavía no hay registros activos en svc_provider_pricing para este prestador.</span>
      </div>
    `;
  }

  return `
    <div class="provider-pricing-grid">
      ${pricing
        .map(
          (item) => `
            <article class="provider-pricing-card">
              <strong>${escapeHtml(item.svc_categories?.name ?? item.category_id ?? "Categoría")}</strong>
              <div class="summary-metrics">
                <div class="metric">
                  <span>Hora</span>
                  <strong>${currency(item.price_per_hour, item.currency)}</strong>
                </div>
                <div class="metric">
                  <span>Rango</span>
                  <strong>${escapeHtml(String(item.minimum_hours ?? 1))} - ${escapeHtml(String(item.maximum_hours ?? detail?.max_hours_per_service ?? 8))} hs</strong>
                </div>
              </div>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderPricingModelOptions(selected = "HOURLY") {
  const current = String(selected || "HOURLY").toUpperCase();

  return Object.entries(pricingModelLabels)
    .map(([value, label]) => `
      <option value="${value}" ${current === value ? "selected" : ""}>${escapeHtml(label)}</option>
    `)
    .join("");
}

function renderServiceModeOptions(selected = "IN_PERSON") {
  const current = String(selected || "IN_PERSON").toUpperCase();

  return Object.entries(serviceModeLabels)
    .map(([value, label]) => `
      <option value="${value}" ${current === value ? "selected" : ""}>${escapeHtml(label)}</option>
    `)
    .join("");
}

function renderServiceModeOptionsForCategory(category = null, selected = "IN_PERSON") {
  const allowed = Array.isArray(category?.allowed_service_modes) && category.allowed_service_modes.length
    ? category.allowed_service_modes.map((item) => String(item).toUpperCase())
    : ["IN_PERSON"];
  const current = allowed.includes(String(selected || "").toUpperCase())
    ? String(selected || "").toUpperCase()
    : allowed[0] || "IN_PERSON";

  return allowed
    .filter((value) => serviceModeLabels[value])
    .map((value) => `<option value="${value}" ${current === value ? "selected" : ""}>${escapeHtml(serviceModeLabels[value])}</option>`)
    .join("");
}

function renderLocationPolicyOptionsForMode(serviceMode = "IN_PERSON", selected = "CLIENT_ADDRESS") {
  const mode = String(serviceMode || "IN_PERSON").toUpperCase();
  const allowed = mode === "ONLINE"
    ? ["ONLINE_ONLY"]
    : mode === "HYBRID"
      ? ["FLEXIBLE", "CLIENT_ADDRESS", "PROVIDER_ADDRESS", "ONLINE_ONLY"]
      : ["CLIENT_ADDRESS", "PROVIDER_ADDRESS", "FLEXIBLE"];
  const current = allowed.includes(String(selected || "").toUpperCase())
    ? String(selected || "").toUpperCase()
    : allowed[0];

  return allowed
    .map((value) => `<option value="${value}" ${current === value ? "selected" : ""}>${escapeHtml(locationPolicyLabels[value])}</option>`)
    .join("");
}

function renderLocationPolicyOptions(selected = "CLIENT_ADDRESS") {
  const current = String(selected || "CLIENT_ADDRESS").toUpperCase();

  return Object.entries(locationPolicyLabels)
    .map(([value, label]) => `
      <option value="${value}" ${current === value ? "selected" : ""}>${escapeHtml(label)}</option>
    `)
    .join("");
}

function renderOfferingEditor(offering = null, index = 0, categories = []) {
  const currentCategoryId = offering?.category_id ?? "";
  const pricingModel = offering?.pricing_model ?? "HOURLY";
  const serviceMode = offering?.service_mode ?? "IN_PERSON";
  const locationPolicy =
    offering?.location_policy ?? (serviceMode === "ONLINE" ? "ONLINE_ONLY" : "CLIENT_ADDRESS");
  const checked = offering ? "checked" : "";

  return `
    <article class="provider-editor-card provider-offering-card">
      <input type="hidden" name="offering:${index}:present" value="1">
      <input type="hidden" name="offering:${index}:id" value="${escapeHtml(offering?.id ?? "")}">
      <label class="provider-check-item">
        <input type="checkbox" name="offering:${index}:active" ${checked}>
        <span>${offering ? "Trabajo publicado" : "Agregar este trabajo"}</span>
      </label>
      <label class="input-group">
        <span>Servicio o trabajo</span>
        <input name="offering:${index}:title" type="text" maxlength="90" value="${escapeHtml(offering?.title ?? "")}" placeholder="Ej: Pintura de living, corte de pasto, reja a medida">
      </label>
      <label class="input-group">
        <span>Categoría</span>
        <select name="offering:${index}:categoryId">
          <option value="">Elegí una categoría</option>
          ${categories.map((category) => `
            <option value="${escapeHtml(category.id)}" ${currentCategoryId === category.id ? "selected" : ""}>${escapeHtml(category.name)}</option>
          `).join("")}
        </select>
      </label>
      <label class="input-group">
        <span>Cómo lo cobrás</span>
        <select name="offering:${index}:pricingModel">
          ${renderPricingModelOptions(pricingModel)}
        </select>
      </label>
      <div class="provider-inline-fields">
        <label class="input-group">
          <span>Modalidad</span>
          <select name="offering:${index}:serviceMode">
            ${renderServiceModeOptions(serviceMode)}
          </select>
        </label>
        <label class="input-group">
          <span>Atención</span>
          <select name="offering:${index}:locationPolicy">
            ${renderLocationPolicyOptions(locationPolicy)}
          </select>
        </label>
      </div>
      <label class="input-group">
        <span>Descripción breve</span>
        <textarea name="offering:${index}:description" maxlength="220" rows="2" placeholder="Contá qué incluye, cómo presupuestás o qué necesita saber el cliente">${escapeHtml(offering?.description ?? "")}</textarea>
      </label>
      <label class="input-group">
        <span>Resumen para la card</span>
        <input name="offering:${index}:publicSummary" type="text" maxlength="140" value="${escapeHtml(offering?.public_summary ?? "")}" placeholder="Ej: Sesiones online para ansiedad, estrés y orientación adulta">
      </label>
      <div class="provider-inline-fields">
        <label class="input-group">
          <span>$/hora</span>
          <input name="offering:${index}:pricePerHour" type="number" min="0" step="100" value="${escapeHtml(String(offering?.price_per_hour ?? ""))}" placeholder="0">
        </label>
        <label class="input-group">
          <span>Visita base</span>
          <input name="offering:${index}:baseVisitFee" type="number" min="0" step="100" value="${escapeHtml(String(offering?.base_visit_fee ?? ""))}" placeholder="0">
        </label>
      </div>
      <div class="provider-inline-fields">
        <label class="input-group">
          <span>Precio cerrado</span>
          <input name="offering:${index}:fixedPrice" type="number" min="0" step="100" value="${escapeHtml(String(offering?.fixed_price ?? ""))}" placeholder="0">
        </label>
        <label class="input-group">
          <span>Mínimo</span>
          <input name="offering:${index}:minimumCharge" type="number" min="0" step="100" value="${escapeHtml(String(offering?.minimum_charge ?? 0))}" placeholder="0">
        </label>
      </div>
      <div class="provider-inline-fields">
        <label class="input-group">
          <span>Unidad</span>
          <input name="offering:${index}:unitName" type="text" maxlength="40" value="${escapeHtml(offering?.unit_name ?? "")}" placeholder="sesión, clase, consulta">
        </label>
        <label class="input-group">
          <span>$/sesión o unidad</span>
          <input name="offering:${index}:unitPrice" type="number" min="0" step="100" value="${escapeHtml(String(offering?.unit_price ?? ""))}" placeholder="0">
        </label>
      </div>
      <div class="provider-inline-fields">
        <label class="input-group">
          <span>Min hs</span>
          <input name="offering:${index}:minimumHours" type="number" min="1" max="24" value="${escapeHtml(String(offering?.minimum_hours ?? ""))}" placeholder="1">
        </label>
        <label class="input-group">
          <span>Max hs</span>
          <input name="offering:${index}:maximumHours" type="number" min="1" max="24" value="${escapeHtml(String(offering?.maximum_hours ?? ""))}" placeholder="8">
        </label>
        <label class="input-group">
          <span>Duración sesión</span>
          <input name="offering:${index}:durationMinutes" type="number" min="15" max="240" step="5" value="${escapeHtml(String(offering?.duration_minutes ?? ""))}" placeholder="45">
        </label>
      </div>
      <label class="provider-check-item">
        <input name="offering:${index}:quoteRequired" type="checkbox" ${offering?.quote_required ? "checked" : ""}>
        <span>Cotizar antes de confirmar<small>${quotePricingHelp}</small></span>
      </label>
      <label class="input-group">
        <span>Indicaciones para el cliente</span>
        <textarea name="offering:${index}:clientInstructions" maxlength="220" rows="2" placeholder="Ej: La videollamada se coordina por chat luego de aceptar la solicitud">${escapeHtml(offering?.client_instructions ?? "")}</textarea>
      </label>
    </article>
  `;
}

function providerOfferingPriceLabel(offering = {}, pricingFallback = {}) {
  const pricingModel = String(offering.pricing_model ?? pricingFallback.pricing_model ?? "HOURLY").toUpperCase();
  const unitName = offering.unit_name || (pricingModel === "UNIT" ? "sesion" : "unidad");
  const currencyCode = offering.currency || pricingFallback.currency || "ARS";
  const amount =
    pricingModel === "FIXED"
      ? offering.fixed_price
      : pricingModel === "BASE_VISIT"
        ? offering.base_visit_fee
        : ["UNIT", "SQUARE_METER", "LINEAR_METER"].includes(pricingModel)
          ? offering.unit_price
          : offering.price_per_hour ?? pricingFallback.price_per_hour;

  if (pricingModel === "QUOTE" || offering.quote_required) return "Cotizar antes de confirmar";
  if (pricingModel === "SQUARE_METER") return `${currency(amount, currencyCode)} / m2`;
  if (pricingModel === "LINEAR_METER") return `${currency(amount, currencyCode)} / m`;
  if (pricingModel === "UNIT") return `${currency(amount, currencyCode)} / ${unitName}`;
  if (pricingModel === "BASE_VISIT") return `${currency(amount, currencyCode)} visita`;
  if (pricingModel === "FIXED") return `${currency(amount, currencyCode)} cerrado`;
  return `${currency(amount, currencyCode)} / hora`;
}

function providerOfferingPriceShortLabel(offering = {}, pricingFallback = {}) {
  const pricingModel = String(offering.pricing_model ?? pricingFallback.pricing_model ?? "HOURLY").toUpperCase();
  if (pricingModel === "QUOTE" || offering.quote_required) return "Cotizar";
  if (!providerOfferingHasPrice(offering)) return "Precio pendiente";
  return providerOfferingPriceLabel(offering, pricingFallback);
}

function providerOfferingCategoryLabel(offering = {}) {
  const category = offering.svc_categories || offering.category || {};
  return (
    offering.category_name ||
    category.name ||
    offering.service_family ||
    offering.macro_vertical ||
    "Rubro pendiente"
  );
}

function providerOfferingDescriptionLabel(offering = {}) {
  const value = String(
    offering.public_summary ||
    offering.description ||
    offering.client_instructions ||
    ""
  ).trim();
  return value || "Agrega una descripcion breve para que el cliente entienda que incluye.";
}

function providerOfferingHasPrice(offering = {}) {
  if (offering.quote_required || String(offering.pricing_model ?? "").toUpperCase() === "QUOTE") return true;
  return Boolean(
    Number(offering.fixed_price || 0) > 0 ||
    Number(offering.base_visit_fee || 0) > 0 ||
    Number(offering.unit_price || 0) > 0 ||
    Number(offering.price_per_hour || 0) > 0
  );
}

function providerOfferingIsIncomplete(offering = {}) {
  return !String(offering.title || "").trim() ||
    !offering.category_id ||
    !providerOfferingHasPrice(offering);
}

function providerOfferingRequiresValidation(offering = {}) {
  const category = offering.svc_categories || offering.category || {};
  const metadata = offering.metadata || offering.metadata_json || {};
  return Boolean(
    category.requires_professional_license ||
    category.requires_background_check ||
    metadata.requires_credentials ||
    metadata.requires_admin_approval ||
    metadata.regulated_level ||
    metadata.sensitive_level
  );
}

function providerOfferingStatusMeta(offering = {}) {
  const inactive = offering.active === false;
  const incomplete = providerOfferingIsIncomplete(offering);
  const requiresValidation = providerOfferingRequiresValidation(offering);

  if (inactive) {
    return {
      key: "paused",
      label: "Pausado",
      detail: "No aparece en busquedas",
      tone: "paused"
    };
  }

  if (requiresValidation) {
    return {
      key: "review",
      label: "Requiere validacion",
      detail: "Puede pedir documentacion",
      tone: "review"
    };
  }

  if (incomplete) {
    return {
      key: "incomplete",
      label: "Incompleto",
      detail: "Faltan datos para destacar",
      tone: "warning"
    };
  }

  return {
    key: "active",
    label: "Visible para clientes",
    detail: "Aparece en busquedas",
    tone: "active"
  };
}

function providerOfferingPricingBadge(offering = {}) {
  const model = String(offering.pricing_model ?? "HOURLY").toUpperCase();
  if (offering.quote_required || model === "QUOTE") return "Cotizar";
  return pricingModelLabels[model] || model;
}

function providerOfferingActiveAddons(offering = {}) {
  return (Array.isArray(offering.addons) ? offering.addons : [])
    .filter((addon) => addon && addon.is_active !== false && String(addon.name || "").trim());
}

function providerOfferingAddonPriceLabel(addon = {}) {
  const model = String(addon.pricing_model || "FIXED").toUpperCase();
  const amount = Number(addon.price || 0);
  const unit = String(addon.unit || "").trim();

  if (model === "QUOTE" || amount <= 0) return "Cotizar";
  if (model === "UNIT") return `${currency(amount, "ARS")} / ${unit || "unidad"}`;
  if (model === "HOURLY") return `${currency(amount, "ARS")} / hora`;
  if (model === "SQUARE_METER") return `${currency(amount, "ARS")} / m2`;
  return currency(amount, "ARS");
}

function renderProviderAddonPricingModelOptions(current = "FIXED") {
  const selected = String(current || "FIXED").toUpperCase();
  const options = [
    ["FIXED", "Precio fijo"],
    ["UNIT", "Por unidad"],
    ["HOURLY", "Por hora"],
    ["SQUARE_METER", "Por m2"],
    ["QUOTE", "Cotizar"]
  ];

  return options
    .map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${escapeHtml(label)}</option>`)
    .join("");
}

function renderProviderOfferingAddonsEditor(offering = null, index = 0) {
  if (!offering?.id) {
    return `
      <section class="provider-service-addons-editor is-locked" aria-label="Adicionales">
        <div class="provider-service-addons-editor-head">
          <div>
            <strong>Adicionales</strong>
            <small>Publica el servicio y despues vas a poder sumar opciones como urgencia, materiales o traslado.</small>
          </div>
          <span>Beta</span>
        </div>
      </section>
    `;
  }

  const existingAddons = Array.isArray(offering.addons) ? offering.addons : [];
  const rows = [
    ...existingAddons,
    { id: "", name: "", description: "", price: "", pricing_model: "FIXED", unit: "", is_active: true }
  ];

  return `
    <section class="provider-service-addons-editor" aria-label="Adicionales">
      <div class="provider-service-addons-editor-head">
        <div>
          <strong>Adicionales</strong>
          <small>Suma opciones para que el cliente entienda mejor tu servicio. No se cobran automaticamente todavia.</small>
        </div>
        <div class="provider-service-addons-editor-actions">
          <span>Beta</span>
          <button type="button" data-provider-business-action="focus-new-service-addon">Agregar adicional</button>
        </div>
      </div>
      <div class="provider-service-addons-editor-list">
        ${rows.map((addon, addonIndex) => `
          <article class="provider-service-addon-row">
            <input type="hidden" name="addon:${index}:${addonIndex}:present" value="1">
            <input type="hidden" name="addon:${index}:${addonIndex}:id" value="${escapeHtml(addon.id ?? "")}">
            <label class="input-group">
              <span>Nombre</span>
              <input name="addon:${index}:${addonIndex}:name" type="text" maxlength="80" value="${escapeHtml(addon.name ?? "")}" placeholder="Urgencia, materiales, trabajo en altura">
            </label>
            <label class="input-group">
              <span>Precio</span>
              <input name="addon:${index}:${addonIndex}:price" type="number" min="0" step="100" value="${escapeHtml(String(addon.price ?? ""))}" placeholder="0">
            </label>
            <label class="input-group">
              <span>Modelo</span>
              <select name="addon:${index}:${addonIndex}:pricingModel">
                ${renderProviderAddonPricingModelOptions(addon.pricing_model ?? addon.pricingModel)}
              </select>
            </label>
            <label class="input-group">
              <span>Unidad</span>
              <input name="addon:${index}:${addonIndex}:unit" type="text" maxlength="40" value="${escapeHtml(addon.unit ?? "")}" placeholder="unidad, m2, hora">
            </label>
            <label class="input-group provider-field-wide">
              <span>Descripcion opcional</span>
              <input name="addon:${index}:${addonIndex}:description" type="text" maxlength="220" value="${escapeHtml(addon.description ?? "")}" placeholder="Aclaracion corta para el cliente">
            </label>
            <label class="provider-check-item">
              <input name="addon:${index}:${addonIndex}:active" type="checkbox" ${addon.is_active === false ? "" : "checked"}>
              <span>Mostrar este adicional<small>Podras usarlo luego en cotizaciones o paquetes.</small></span>
            </label>
          </article>
        `).join("")}
      </div>
      <p class="provider-service-addons-note">El guardado de adicionales usa svc-save-provider-service. No hay escrituras directas desde el navegador.</p>
    </section>
  `;
}

function providerOfferingUpdatedLabel(offering = {}) {
  const value = offering.updated_at || offering.created_at;
  if (!value) return "Sin actualizacion";
  return `Actualizado ${formatDate(value)}`;
}

function providerServicesSummary(offerings = []) {
  const active = offerings.filter((item) => item?.active !== false);
  const paused = offerings.filter((item) => item?.active === false);
  const incomplete = offerings.filter((item) => providerOfferingIsIncomplete(item));
  const requiresAction = offerings.filter((item) =>
    providerOfferingIsIncomplete(item) || providerOfferingRequiresValidation(item)
  );

  return {
    total: offerings.length,
    active: active.length,
    paused: paused.length,
    incomplete: incomplete.length,
    requiresAction: requiresAction.length
  };
}

function providerOfferingQualityChecklist(offering = {}) {
  const title = String(offering.title || "").trim();
  const description = String(
    offering.public_summary ||
    offering.description ||
    offering.scope ||
    ""
  ).trim();
  const metadata = offering.metadata_json && typeof offering.metadata_json === "object"
    ? offering.metadata_json
    : (offering.metadata && typeof offering.metadata === "object" ? offering.metadata : {});
  const pricingModel = String(offering.pricing_model ?? "").toUpperCase();
  const hasCategory = Boolean(offering.category_id || offering.svc_categories?.id || offering.category?.id);
  const hasPricing = providerOfferingHasPrice(offering);
  const hasPricingUnit = Boolean(
    offering.quote_required ||
    pricingModel === "QUOTE" ||
    pricingModel ||
    offering.unit_name ||
    offering.unit
  );
  const hasScope = Boolean(
    description.length >= 18 ||
    offering.duration_minutes ||
    metadata.scope ||
    metadata.conditions ||
    metadata.conditions_json ||
    metadata.coverage_notes
  );
  const requiresValidation = providerOfferingRequiresValidation(offering);

  const items = [
    {
      key: "title",
      label: "Titulo claro",
      pass: title.length >= 3,
      tip: "Usa un nombre simple: Pintor, Instalacion de aire, Corte de pelo."
    },
    {
      key: "category",
      label: "Rubro/categoria",
      pass: hasCategory,
      tip: "Elegir rubro ayuda a que aparezca en la busqueda correcta."
    },
    {
      key: "price",
      label: "Precio o cotizacion",
      pass: hasPricing,
      tip: "Precio visible: ayuda a recibir solicitudes mas claras."
    },
    {
      key: "pricing-unit",
      label: "Unidad de cobro",
      pass: hasPricingUnit,
      tip: "Mostra si cobras por hora, por m2, por visita o por cotizacion."
    },
    {
      key: "visibility",
      label: "Visible en busquedas",
      pass: offering.active !== false,
      tip: "Pausado: no aparece para clientes."
    },
    {
      key: "description",
      label: "Descripcion/alcance",
      pass: description.length >= 18,
      tip: "Agrega una descripcion para que el cliente entienda mejor el alcance."
    },
    {
      key: "conditions",
      label: "Condiciones basicas",
      pass: hasScope,
      tip: "Aclara zona, modalidad, duracion o que incluye el servicio."
    },
    {
      key: "regulated",
      label: "Validacion regulada",
      pass: !requiresValidation,
      warning: requiresValidation,
      tip: "Este servicio requiere validacion antes de mostrarse como regulado."
    }
  ];
  const completed = items.filter((item) => item.pass).length;
  const score = Math.round((completed / items.length) * 100);
  const incomplete = providerOfferingIsIncomplete(offering);

  let status = {
    key: "good",
    label: "Bueno",
    detail: "La publicacion tiene lo necesario para entenderse."
  };

  if (offering.active === false) {
    status = {
      key: "paused",
      label: "Pausado",
      detail: "Pausado: no aparece para clientes."
    };
  } else if (requiresValidation) {
    status = {
      key: "review",
      label: "Requiere revision",
      detail: "Este servicio requiere validacion antes de mostrarse como regulado."
    };
  } else if (incomplete || score < 62) {
    status = {
      key: "incomplete",
      label: "Incompleto",
      detail: "Faltan datos para que el cliente entienda bien la oferta."
    };
  } else if (score >= 88) {
    status = {
      key: "excellent",
      label: "Excelente",
      detail: "La publicacion esta clara y lista para recibir mejores solicitudes."
    };
  }

  return { items, completed, total: items.length, score, status };
}

export function renderProviderServicePreviewSheet({
  offering = {},
  detail = null,
  providerName = "Prestador MIMIGO",
  providerAvatarUrl = "",
  providerInitials = "PR",
  addonsEnabled = false
} = {}) {
  const serviceTitle = String(offering.title || "Servicio publicado").trim();
  const categoryLabel = providerOfferingCategoryLabel(offering);
  const rawPriceLabel = providerOfferingPriceShortLabel(offering);
  const pricingBadge = providerOfferingPricingBadge(offering);
  const serviceMode = String(offering.service_mode ?? "IN_PERSON").toUpperCase();
  const locationPolicy = String(offering.location_policy ?? "CLIENT_ADDRESS").toUpperCase();
  const description = String(
    offering.public_summary ||
    offering.description ||
    "Agrega una descripcion para que el cliente entienda mejor el alcance."
  ).trim();
  const status = providerOfferingStatusMeta(offering);
  const quality = providerOfferingQualityChecklist(offering);
  const activeAddons = addonsEnabled ? providerOfferingActiveAddons(offering) : [];
  const canPreviewProviderAvatar = /^https?:\/\//i.test(providerAvatarUrl) || /^data:image\//i.test(providerAvatarUrl);
  const zoneLabel = [detail?.city, detail?.province].filter(Boolean).join(", ") || "Zona a confirmar";
  const isPaused = offering.active === false;
  const isQuote = offering.quote_required || String(offering.pricing_model ?? "").toUpperCase() === "QUOTE";
  const isRegulated = providerOfferingRequiresValidation(offering);
  const isIncomplete = providerOfferingIsIncomplete(offering);
  const priceLabel = isQuote
    ? "Cotizar"
    : providerOfferingHasPrice(offering)
      ? rawPriceLabel
      : "Precio a confirmar";
  const verified =
    String(detail?.review_status || detail?.kyc_status || detail?.verification_status || "").toUpperCase() === "APPROVED" ||
    detail?.verified === true ||
    detail?.metadata_json?.verified === true;
  const ratingLabel = Number(detail?.rating || detail?.average_rating || offering.rating || 0) > 0
    ? Number(detail?.rating || detail?.average_rating || offering.rating).toFixed(1)
    : "Nuevo";
  const jobsLabel = Number(detail?.completed_services_count || detail?.jobs_count || offering.completed_jobs || 0) > 0
    ? String(Number(detail?.completed_services_count || detail?.jobs_count || offering.completed_jobs))
    : "0";
  const responseLabel = Number(detail?.response_rate_percent || offering.response_rate_percent || 0) > 0
    ? `${Math.round(Number(detail?.response_rate_percent || offering.response_rate_percent))}%`
    : "86%";
  const distanceLabel = Number(offering.distance_km || detail?.distance_km || 0) > 0
    ? `${Number(offering.distance_km || detail?.distance_km).toFixed(1)} km`
    : "Cerca";
  const statusText = isPaused
    ? "No aparece para clientes."
    : isIncomplete
      ? "Completa estos datos para publicarlo."
      : "Aparece en busquedas.";
  const badgeLabel = isPaused
    ? "Pausado"
    : isRegulated
      ? "Requiere validacion"
      : isIncomplete
        ? "Incompleto"
        : "Visible para clientes";
  const footerPrimaryAction = isPaused ? "reactivate-offering" : "delete-offering";
  const footerPrimaryLabel = isPaused ? "Reactivar" : "Pausar";
  const footerPrimaryClass = isPaused ? "provider-service-reactivate-button" : "provider-service-delete-button";
  const profileSummary = String(
    detail?.professional_summary ||
    detail?.public_headline ||
    detail?.bio ||
    "Perfil publico del prestador. En esta vista no se navega al cliente real ni se crea una solicitud."
  ).trim();
  const qualityPanelHtml = `
    <section class="provider-service-quality-panel provider-service-preview-quality-card" aria-label="Calidad de publicacion">
      <div class="provider-service-quality-head">
        <div>
          <span class="eyebrow">Calidad de publicacion</span>
          <strong>Calidad de publicacion</strong>
          <small>Podes mejorar tu visibilidad completando estos puntos.</small>
        </div>
        <b class="provider-service-quality-score is-${escapeHtml(quality.status.key)}" style="--score:${quality.score}">${quality.score}%</b>
      </div>
      <div class="provider-service-quality-checklist">
        ${quality.items.map((item) => {
          const stateLabel = item.pass
            ? "Listo"
            : item.key === "visibility" && isPaused
              ? "Pausado: no aparece para clientes"
              : item.warning
                ? "Esta categoria requiere validacion antes de mostrarse"
                : "Pendiente";
          return `
            <article class="provider-service-quality-item ${item.pass ? "is-pass" : item.warning ? "is-warning" : "is-missing"}">
              <span aria-hidden="true">${item.pass ? "&#10003;" : item.warning ? "!" : "-"}</span>
              <div>
                <strong>${escapeHtml(item.label)}</strong>
                <small>${escapeHtml(stateLabel)}</small>
              </div>
            </article>
          `;
        }).join("")}
      </div>
      <p class="provider-service-quality-note">${escapeHtml(quality.status.detail)}</p>
    </section>
  `;

  return `
    <div class="provider-service-preview-overlay" data-provider-service-preview-overlay>
      <section class="provider-service-preview-sheet" role="dialog" aria-modal="true" aria-labelledby="providerServicePreviewTitle">
        <div class="provider-service-preview-handle" aria-hidden="true"></div>
        <header class="provider-service-preview-header">
          <div>
            <h3 id="providerServicePreviewTitle">Vista como cliente</h3>
            <p>Asi aparece tu publicacion en MIMI GO.</p>
            <div class="provider-service-preview-state-row">
              <em class="provider-service-preview-status is-${escapeHtml(status.tone)}">${escapeHtml(badgeLabel)}</em>
              <span>${escapeHtml(statusText)}</span>
            </div>
          </div>
          <button class="provider-service-preview-close" type="button" data-provider-business-action="close-service-preview" aria-label="Cerrar vista previa">x</button>
        </header>

        <div class="provider-service-preview-tabs">
          <input class="provider-service-preview-tab-input" id="providerServicePreviewTabCard" name="providerServicePreviewTab" type="radio" checked>
          <input class="provider-service-preview-tab-input" id="providerServicePreviewTabProfile" name="providerServicePreviewTab" type="radio">
          <input class="provider-service-preview-tab-input" id="providerServicePreviewTabQuality" name="providerServicePreviewTab" type="radio">
          <div class="provider-service-preview-tab-list" role="tablist" aria-label="Secciones de vista previa">
            <label for="providerServicePreviewTabCard" role="tab">Card en busqueda</label>
            <label for="providerServicePreviewTabProfile" role="tab">Perfil completo</label>
            <label for="providerServicePreviewTabQuality" role="tab">Calidad</label>
          </div>
          <div class="provider-service-preview-tab-panels">
            <section class="provider-service-preview-tab-panel provider-service-preview-tab-panel-card">
              <article class="provider-service-preview-client-card provider-service-market-card ${isPaused ? "is-paused" : ""}" aria-label="Card premium del servicio">
                <div class="provider-service-market-card-head">
                  <span class="provider-service-preview-avatar">
                    ${canPreviewProviderAvatar
                      ? `<img src="${escapeHtml(providerAvatarUrl)}" alt="Foto de perfil visible para clientes" loading="lazy">`
                      : `<span>${escapeHtml(providerInitials)}</span>`}
                  </span>
                  <div>
                    <strong>${escapeHtml(providerName)}</strong>
                    <em>${verified ? "Verificado" : "Perfil MIMIGO"}</em>
                  </div>
                  <b>${escapeHtml(categoryLabel)}</b>
                </div>
                <div class="provider-service-market-card-body">
                  <h4>${escapeHtml(serviceTitle)}</h4>
                  <p>${escapeHtml(description)}</p>
                  <div class="provider-service-preview-client-meta">
                    <span>${escapeHtml(serviceModeLabels[serviceMode] ?? "Presencial")}</span>
                    <span>${escapeHtml(locationPolicyLabels[locationPolicy] ?? "Domicilio del cliente")}</span>
                    <span>${escapeHtml(zoneLabel)}</span>
                  </div>
                </div>
                <div class="provider-service-pro-stats" aria-label="Indicadores visuales del servicio">
                  <span><b>${escapeHtml(ratingLabel)}</b><small>Calificacion</small></span>
                  <span><b>${escapeHtml(jobsLabel)}</b><small>trabajos</small></span>
                  <span><b>${escapeHtml(responseLabel)}</b><small>respuesta</small></span>
                  <span><b>${escapeHtml(distanceLabel)}</b><small>a la redonda</small></span>
                </div>
                <div class="provider-service-preview-price-row">
                  <div>
                    <span>Precio</span>
                    <strong>${escapeHtml(priceLabel)}</strong>
                  </div>
                  <div class="provider-service-preview-platform-note">
                    <b aria-hidden="true">+</b>
                    <span>El presupuesto, la aceptacion y el pago se realizan dentro de MIMIGO.</span>
                  </div>
                </div>
                ${activeAddons.length ? `
                  <div class="provider-service-preview-addons" aria-label="Adicionales disponibles">
                    <div>
                      <strong>Adicionales disponibles</strong>
                      <small>Se muestran como opciones de alcance. No se cobran automaticamente todavia.</small>
                    </div>
                    <div>
                      ${activeAddons.slice(0, 5).map((addon) => `
                        <span>
                          <b>${escapeHtml(addon.name)}</b>
                          <em>${escapeHtml(providerOfferingAddonPriceLabel(addon))}</em>
                        </span>
                      `).join("")}
                    </div>
                  </div>
                ` : ""}
                <div class="provider-service-preview-badges">
                  <em>${escapeHtml(pricingBadge)}</em>
                  ${isQuote ? "<em>Cotizar</em>" : ""}
                  ${isPaused ? "<em>Pausado</em>" : ""}
                  ${isRegulated ? "<em>Requiere validacion</em>" : ""}
                  ${activeAddons.length ? "<em>Adicionales disponibles</em>" : ""}
                </div>
                <div class="provider-service-preview-client-actions" aria-label="Acciones visuales sin flujo real">
                  <button type="button" data-provider-preview-only aria-disabled="true">Ver perfil</button>
                  <button type="button" data-provider-preview-only aria-disabled="true">Solicitar presupuesto</button>
                </div>
              </article>
              ${qualityPanelHtml}
            </section>
            <section class="provider-service-preview-tab-panel provider-service-preview-profile-panel">
              <article>
                <span class="eyebrow">Perfil completo</span>
                <h4>${escapeHtml(providerName)}</h4>
                <p>${escapeHtml(profileSummary)}</p>
                <div class="provider-service-preview-client-meta">
                  <span>${verified ? "Verificado" : "Perfil pendiente de validacion"}</span>
                  <span>${escapeHtml(zoneLabel)}</span>
                  <span>${escapeHtml(serviceModeLabels[serviceMode] ?? "Presencial")}</span>
                  ${activeAddons.length ? `<span>${activeAddons.length} adicionales</span>` : ""}
                </div>
                ${isRegulated ? `<small>Este servicio puede requerir documentacion o aprobacion antes de mostrarse como regulado. No se muestran promesas medicas ni diagnosticos.</small>` : ""}
              </article>
            </section>
            <section class="provider-service-preview-tab-panel provider-service-preview-quality-panel">
              ${qualityPanelHtml}
            </section>
          </div>
        </div>

        <footer class="provider-service-preview-actions">
          <button class="provider-service-secondary-button" type="button" data-provider-business-action="edit-offering" data-offering-id="${escapeHtml(offering.id ?? "")}">Editar servicio</button>
          <button class="${escapeHtml(footerPrimaryClass)}" type="button" data-provider-business-action="${escapeHtml(footerPrimaryAction)}" data-offering-id="${escapeHtml(offering.id ?? "")}">${escapeHtml(footerPrimaryLabel)}</button>
          <button class="provider-service-preview-close-secondary" type="button" data-provider-business-action="close-service-preview">Cerrar</button>
        </footer>
      </section>
    </div>
  `;
}

function firstImageUrlFrom(...values) {
  const pending = [...values];
  while (pending.length) {
    const value = pending.shift();
    if (Array.isArray(value)) {
      pending.push(...value);
      continue;
    }
    const raw = String(value ?? "").trim();
    if (/^https?:\/\//i.test(raw) || /^data:image\//i.test(raw)) return raw;
  }
  return "";
}

function providerDocumentAvatarUrl(documents = []) {
  const candidates = Array.isArray(documents) ? documents : [];
  const preferred = candidates.find((doc) => {
    const type = String(doc?.document_type ?? doc?.type ?? "").toLowerCase();
    const metadata = doc?.metadata_json && typeof doc.metadata_json === "object"
      ? doc.metadata_json
      : {};
    return ["profile_photo", "avatar", "selfie"].includes(type) && firstImageUrlFrom(
      doc?.file_url,
      doc?.signed_url,
      doc?.public_url,
      doc?.preview_url,
      metadata.avatar_public_url,
      metadata.profile_photo_url,
      metadata.public_url,
      metadata.file_url,
      metadata.signed_url,
      metadata.preview_url,
      metadata.image_url
    );
  });

  return firstImageUrlFrom(
    preferred?.file_url,
    preferred?.signed_url,
    preferred?.public_url,
    preferred?.preview_url,
    preferred?.metadata_json?.avatar_public_url,
    preferred?.metadata_json?.profile_photo_url,
    preferred?.metadata_json?.public_url,
    preferred?.metadata_json?.file_url,
    preferred?.metadata_json?.signed_url,
    preferred?.metadata_json?.preview_url,
    preferred?.metadata_json?.image_url,
    candidates.map((doc) => doc?.file_url),
    candidates.map((doc) => doc?.signed_url),
    candidates.map((doc) => doc?.public_url)
  );
}

function renderProviderServiceClientPreview({
  offering = null,
  categories = [],
  detail = null,
  providerAvatarUrl = "",
  providerInitials = "PR",
  providerName = "Prestador MIMI",
  priceLabel = "Falta configurar"
} = {}) {
  const canPreviewProviderAvatar = /^https?:\/\//i.test(providerAvatarUrl) || /^data:image\//i.test(providerAvatarUrl);
  const serviceTitle = offering?.title || categories[0]?.name || "Tu servicio";
  const summary =
    offering?.public_summary ||
    offering?.description ||
    detail?.bio ||
    "Agrega una descripcion corta para que el cliente entienda que incluye.";
  const categoryLabel = categories.length
    ? categories.map((category) => category.name).join(" / ")
    : "Rubro pendiente";
  const zoneLabel = [detail?.city, detail?.province].filter(Boolean).join(", ") || "Zona pendiente";

  return `
    <section class="provider-service-client-preview provider-service-photo-sync" aria-label="Vista previa del servicio para clientes">
      <div class="provider-client-preview-heading">
        <div>
          <span class="eyebrow">Visible para clientes</span>
          <strong>Card publica actual</strong>
        </div>
        <div class="provider-client-preview-actions">
          <span class="provider-client-preview-badge">${offering ? "Publicada" : "Borrador"}</span>
          ${offering?.id ? `
            <button class="provider-client-preview-edit" type="button" data-provider-business-action="focus-service-details" data-offering-id="${escapeHtml(offering.id)}">
              Editar nombre y precio
            </button>
          ` : ""}
        </div>
      </div>
      <article class="provider-client-preview-card">
        <div class="provider-client-preview-topline">
          <span class="provider-client-preview-avatar">
            ${canPreviewProviderAvatar
              ? `<img src="${escapeHtml(providerAvatarUrl)}" alt="Foto de perfil visible para clientes" loading="lazy">`
              : `<span>${escapeHtml(providerInitials)}</span>`}
          </span>
          <div>
            <strong>${escapeHtml(providerName)}</strong>
            <small>${escapeHtml(zoneLabel)}</small>
          </div>
        </div>
        <div class="provider-client-preview-body">
          <h4>${escapeHtml(serviceTitle)}</h4>
          <p>${escapeHtml(summary)}</p>
        </div>
        <div class="provider-client-preview-footer">
          <span>${escapeHtml(categoryLabel)}</span>
          <strong>${escapeHtml(priceLabel)}</strong>
        </div>
      </article>
      <div class="provider-photo-sync-note ${canPreviewProviderAvatar ? "is-ready" : ""}">
        <span>${canPreviewProviderAvatar ? "Foto sincronizada" : "Falta foto"}</span>
        <small>La misma imagen se usa en tu perfil, en Servicios y en la busqueda del cliente.</small>
      </div>
    </section>
  `;
}

function renderOfferingsSummary(offerings = [], options = {}) {
  if (!offerings.length) {
    return `
      <section class="summary-card provider-offerings-summary-enterprise">
        <strong>Tus servicios publicados</strong>
        <p class="muted">Todavia no tenes servicios activos. Publica al menos una propuesta concreta para que los clientes vean modalidad, duracion y precio.</p>
      </section>
    `;
  }

  return `
    <section class="summary-card provider-offerings-summary-enterprise">
      <div class="block-header compact">
        <div>
          <span class="eyebrow">Gestion rapida</span>
          <h3>Ofertas activas</h3>
          <p class="muted">Administra visibilidad, precio y vista como cliente sin salir de esta pantalla.</p>
        </div>
      </div>
      <div class="provider-offerings-enterprise-list">
        ${offerings
          .map((offering) => {
            const inactive = offering.active === false;
            const serviceMode = String(offering.service_mode ?? "IN_PERSON").toUpperCase();
            const locationPolicy = String(offering.location_policy ?? "CLIENT_ADDRESS").toUpperCase();
            const status = providerOfferingStatusMeta(offering);
            const categoryLabel = providerOfferingCategoryLabel(offering);
            const description = providerOfferingDescriptionLabel(offering);
            const priceLabel = providerOfferingPriceShortLabel(offering);
            const initials = initialsFromName(offering.title || "Servicio").slice(0, 2);
            const requiresValidation = providerOfferingRequiresValidation(offering);
            const addons = options.addonsEnabled ? providerOfferingActiveAddons(offering) : [];

            return `
              <article class="provider-service-list-card provider-offering-summary-card ${inactive ? "is-inactive" : "is-active"} is-${escapeHtml(status.tone)}" data-offering-id="${escapeHtml(offering.id ?? "")}">
                <button class="provider-service-list-main" type="button" data-provider-business-action="edit-offering" data-offering-id="${escapeHtml(offering.id ?? "")}">
                  <span class="provider-service-list-mark" aria-hidden="true">${escapeHtml(initials)}</span>
                  <span class="provider-service-list-copy">
                    <span class="provider-service-card-topline">
                      <strong>${escapeHtml(offering.title || "Servicio publicado")}</strong>
                      <i class="provider-service-status-pill is-${escapeHtml(status.tone)}">${escapeHtml(status.label)}</i>
                    </span>
                    <small>${escapeHtml(categoryLabel)} - ${escapeHtml(serviceModeLabels[serviceMode] ?? "Presencial")}</small>
                    <span class="provider-service-description">${escapeHtml(description)}</span>
                  </span>
                  <span class="provider-service-price-block">
                    <em>${escapeHtml(priceLabel)}</em>
                    <small>${escapeHtml(providerOfferingPricingBadge(offering))}</small>
                  </span>
                </button>
                <div class="provider-service-card-meta">
                  <span>${escapeHtml(locationPolicyLabels[locationPolicy] ?? "Cliente")}</span>
                  <span>${escapeHtml(providerOfferingUpdatedLabel(offering))}</span>
                  ${requiresValidation ? "<span>Regulado</span>" : ""}
                  ${addons.length ? `<span>${addons.length} ${addons.length === 1 ? "adicional" : "adicionales"}</span>` : ""}
                </div>
                ${addons.length ? `
                  <div class="provider-service-addon-strip" aria-label="Adicionales disponibles">
                    <strong>Adicionales disponibles</strong>
                    <span>${addons.slice(0, 3).map((addon) => escapeHtml(addon.name)).join(" + ")}</span>
                  </div>
                ` : ""}
                <div class="provider-service-card-actions">
                  <button class="provider-service-secondary-button" type="button" data-provider-business-action="edit-offering" data-offering-id="${escapeHtml(offering.id ?? "")}">Editar</button>
                  <button class="provider-service-secondary-button" type="button" data-provider-business-action="preview-offering" data-offering-id="${escapeHtml(offering.id ?? "")}">Ver como cliente</button>
                  ${inactive ? `
                    <button class="provider-service-reactivate-button" type="button" data-provider-business-action="reactivate-offering" data-offering-id="${escapeHtml(offering.id ?? "")}">Reactivar</button>
                  ` : `
                    <button class="provider-service-delete-button" type="button" data-provider-business-action="delete-offering" data-offering-id="${escapeHtml(offering.id ?? "")}">Pausar</button>
                  `}
                </div>
                <p class="provider-service-status-note">${escapeHtml(status.detail)}</p>
              </article>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderOfferingsSummaryLegacy(offerings = [], options = {}) {
  if (!offerings.length) {
    return `
      <section class="summary-card">
        <strong>Trabajos publicados</strong>
        <p class="muted">Todavía no tenés trabajos activos. Publicá al menos una propuesta concreta para que los clientes vean modalidad, duración y precio.</p>
      </section>
    `;
  }

  return `
    <section class="summary-card">
      <div class="block-header compact">
        <div>
          <span class="eyebrow">Visible para clientes</span>
          <h3>Ofertas activas</h3>
        </div>
      </div>
      <div class="provider-pricing-grid">
        ${offerings
          .map((offering) => {
            const pricingModel = String(offering.pricing_model ?? "HOURLY").toUpperCase();
            const serviceMode = String(offering.service_mode ?? "IN_PERSON").toUpperCase();
            const locationPolicy = String(offering.location_policy ?? "CLIENT_ADDRESS").toUpperCase();
            const unitName = offering.unit_name || (pricingModel === "UNIT" ? "sesión" : "unidad");
            // Precio según modelo. Para SQUARE_METER / LINEAR_METER también se usa unit_price.
            const amount =
              pricingModel === "FIXED"
                ? offering.fixed_price
                : pricingModel === "BASE_VISIT"
                  ? offering.base_visit_fee
                  : ["UNIT", "SQUARE_METER", "LINEAR_METER"].includes(pricingModel)
                    ? offering.unit_price
                    : offering.price_per_hour;

            const priceLabel =
              pricingModel === "QUOTE" || offering.quote_required
                ? "Cotizar antes de confirmar"
                : pricingModel === "SQUARE_METER"
                  ? `${currency(amount, offering.currency)} / m²`
                  : pricingModel === "LINEAR_METER"
                    ? `${currency(amount, offering.currency)} / m`
                    : pricingModel === "UNIT"
                      ? `${currency(amount, offering.currency)} / ${unitName}`
                      : pricingModel === "BASE_VISIT"
                        ? `${currency(amount, offering.currency)} visita`
                        : pricingModel === "FIXED"
                          ? `${currency(amount, offering.currency)} cerrado`
                          : `${currency(amount, offering.currency)} / hora`;

            const avatarUrl = String(options.avatarUrl || "").trim();
            const canShowAvatar = /^https?:\/\//i.test(avatarUrl) || /^data:image\//i.test(avatarUrl);
            const initials = options.initials || "PR";

            return `
              <article class="provider-pricing-card" data-offering-id="${escapeHtml(offering.id ?? "")}">
                <div class="provider-offering-summary-head">
                  <span class="provider-offering-summary-avatar">
                    ${canShowAvatar
                      ? `<img src="${escapeHtml(avatarUrl)}" alt="Foto de perfil" loading="lazy">`
                      : `<span>${escapeHtml(initials)}</span>`}
                  </span>
                  <div>
                    <strong>${escapeHtml(offering.title ?? "Trabajo publicado")}</strong>
                    <small>${escapeHtml(options.providerName || "Visible para clientes")}</small>
                  </div>
                </div>
                <p class="muted">${escapeHtml(offering.public_summary ?? offering.description ?? "Sin resumen público")}</p>
                <div class="summary-metrics">
                  <div class="metric">
                    <span>Precio</span>
                    <strong>${escapeHtml(priceLabel)}</strong>
                  </div>
                  <div class="metric">
                    <span>Modalidad</span>
                    <strong>${escapeHtml(serviceModeLabels[serviceMode] ?? serviceMode)}</strong>
                  </div>
                  <div class="metric">
                    <span>Atención</span>
                    <strong>${escapeHtml(locationPolicyLabels[locationPolicy] ?? locationPolicy)}</strong>
                  </div>
                  <div class="metric">
                    <span>Duración</span>
                    <strong>${offering.duration_minutes ? `${escapeHtml(String(offering.duration_minutes))} min` : "Por definir"}</strong>
                  </div>
                </div>
                <div class="provider-offering-actions">
                  <button type="button" class="btn-secondary" data-provider-business-action="edit-offering" data-offering-id="${escapeHtml(offering.id ?? "")}">
                    Editar
                  </button>
                  <button type="button" class="btn-link-danger" data-provider-business-action="delete-offering" data-offering-id="${escapeHtml(offering.id ?? "")}">
                    Pausar
                  </button>
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function isProviderGuidedServiceEnabled(guidedService = {}) {
  return Boolean(guidedService?.enabled);
}

function providerGuidedQuestionStrategyLabel(value) {
  const strategy = String(value ?? "").toUpperCase();
  const labels = {
    NO_QUESTION: "Sin preguntas",
    OPTIONAL_REFINEMENT: "Refinamiento opcional",
    REQUIRED_BEFORE_PRICE: "Cotiza con datos",
    REQUIRED_BEFORE_RESULTS: "Requiere contexto",
    SAFETY_GATE: "Servicio sensible"
  };
  return labels[strategy] ?? "Guia beta";
}

function providerGuidedTemplateVersion(template = {}) {
  return template.active_version ?? {};
}

function providerGuidedTemplatePricingModel(template = {}) {
  const version = providerGuidedTemplateVersion(template);
  return String(version.pricing_model || template.default_pricing_model || "HOURLY").toUpperCase();
}

function providerGuidedTemplateRequirements(template = {}) {
  return Array.isArray(template.regulated_requirements) ? template.regulated_requirements : [];
}

function providerGuidedTemplateIsRegulated(template = {}) {
  const requirements = providerGuidedTemplateRequirements(template);
  return (
    requirements.length > 0 ||
    Boolean(template.requires_credentials) ||
    Boolean(template.requires_admin_approval) ||
    Boolean(template.requires_professional_license) ||
    Boolean(template.requires_background_check) ||
    !["none", "", "low"].includes(String(template.regulated_level ?? "").toLowerCase()) ||
    !["none", "", "low"].includes(String(template.sensitive_level ?? "").toLowerCase())
  );
}

function providerGuidedTemplateQuoteRequired(template = {}) {
  const version = providerGuidedTemplateVersion(template);
  const requirements = providerGuidedTemplateRequirements(template);
  return (
    Boolean(version.quote_required_default ?? template.default_quote_required) ||
    providerGuidedTemplatePricingModel(template) === "QUOTE" ||
    requirements.some((item) => item?.blocks_auto_pricing === true)
  );
}

function providerGuidedTemplateCategoryLabel(template = {}) {
  return (
    template.category?.name ||
    template.service_family ||
    template.macro_vertical ||
    "Rubro del catalogo"
  );
}

function providerGuidedTemplateTitle(template = {}) {
  const version = providerGuidedTemplateVersion(template);
  return version.title || template.name || "Servicio del catalogo";
}

function providerGuidedTemplateDescription(template = {}) {
  const version = providerGuidedTemplateVersion(template);
  return version.description || template.description || "MIMIGO precarga lo minimo y vos revisas antes de publicar.";
}

function providerGuidedTemplateKeyAttributes(template = {}, limit = 4) {
  return (Array.isArray(template.attributes) ? template.attributes : [])
    .filter((attribute) => attribute?.label || attribute?.code)
    .slice(0, limit);
}

function providerGuidedTemplateKeyQuestions(template = {}, limit = 4) {
  return (Array.isArray(template.questions) ? template.questions : [])
    .filter((question) => question?.question_text || question?.label)
    .slice(0, limit);
}

function providerGuidedTemplateRequirementLabels(template = {}, limit = 3) {
  const labels = providerGuidedTemplateRequirements(template)
    .map((item) => item?.requirement_label || item?.requirement_type || item?.required_document_type)
    .filter(Boolean);

  return labels.length ? labels.slice(0, limit) : [];
}

function providerGuidedTemplateSearchText(template = {}) {
  const version = template.active_version ?? {};
  return [
    template.name,
    template.slug,
    template.macro_vertical,
    template.service_family,
    template.category?.name,
    template.category?.code,
    template.category?.description,
    template.description,
    version.title,
    version.description
  ].filter(Boolean).join(" ").toLowerCase();
}

export function renderProviderGuidedTemplateSelection(template = {}) {
  const version = providerGuidedTemplateVersion(template);
  const pricingModel = providerGuidedTemplatePricingModel(template);
  const quoteRequired = providerGuidedTemplateQuoteRequired(template);
  const isRegulated = providerGuidedTemplateIsRegulated(template);
  const attributes = providerGuidedTemplateKeyAttributes(template, 5);
  const questions = providerGuidedTemplateKeyQuestions(template, 5);
  const requirements = providerGuidedTemplateRequirementLabels(template, 4);
  const blocksAutoPricing = providerGuidedTemplateRequirements(template).some((item) => item?.blocks_auto_pricing === true);
  const strategy = version.question_strategy_default || template.default_question_strategy;

  return `
    <article class="provider-guided-selection-card" data-provider-guided-selected-template>
      <div class="provider-guided-selection-head">
        <div>
          <span class="eyebrow">Servicio elegido</span>
          <strong>${escapeHtml(providerGuidedTemplateTitle(template))}</strong>
          <small>${escapeHtml(template.macro_vertical || "Catalogo MIMIGO")} - ${escapeHtml(providerGuidedTemplateCategoryLabel(template))}</small>
        </div>
        <span class="provider-guided-selection-status">${escapeHtml(providerGuidedQuestionStrategyLabel(strategy))}</span>
      </div>
      <p>${escapeHtml(providerGuidedTemplateDescription(template))}</p>
      <div class="provider-guided-selection-badges">
        <span>${escapeHtml(pricingModelLabels[pricingModel] ?? pricingModel)}</span>
        ${quoteRequired ? "<span>Cotizacion sugerida</span>" : ""}
        ${isRegulated ? "<span class=\"is-warning\">Requiere validacion</span>" : ""}
        ${blocksAutoPricing ? "<span class=\"is-warning\">Sin autopricing</span>" : ""}
      </div>
      ${attributes.length ? `
        <div class="provider-guided-chip-group">
          <strong>Atributos clave</strong>
          <div>
            ${attributes.map((attribute) => `<span>${escapeHtml(attribute.label || attribute.code || "Dato")}${attribute.required ? " *" : ""}</span>`).join("")}
          </div>
        </div>
      ` : ""}
      ${questions.length ? `
        <div class="provider-guided-chip-group">
          <strong>Preguntas sugeridas</strong>
          <div>
            ${questions.map((question) => `<span>${escapeHtml(question.question_text || question.label || "Pregunta sugerida")}</span>`).join("")}
          </div>
          <small>Son ayuda para completar mejor el servicio; no bloquean el alta beta.</small>
        </div>
      ` : ""}
      ${isRegulated ? `
        <div class="provider-guided-regulated-box">
          <strong>Servicio sensible o regulado</strong>
          <p>Puede requerir documentacion, matricula o aprobacion admin antes de mostrarse con ese alcance. No prometas resultados medicos ni diagnosticos.</p>
          ${requirements.length ? `<div>${requirements.map((label) => `<span>${escapeHtml(label)}</span>`).join("")}</div>` : ""}
          ${blocksAutoPricing ? "<small>Este servicio requiere cotizacion o revision. No se calcula precio automatico.</small>" : ""}
        </div>
      ` : ""}
    </article>
  `;
}

function renderProviderGuidedEmptySelection() {
  return `
    <div class="provider-guided-selection-empty">
      <strong>Elegir una sugerencia</strong>
      <span>Busca el servicio, toca una card del catalogo y MIMIGO completa titulo, rubro y modelo de precio para que revises lo minimo.</span>
    </div>
  `;
}

function renderProviderGuidedDraftPreviewShell() {
  return `
    <aside class="provider-guided-draft-preview" data-provider-guided-draft-preview aria-live="polite">
      <div class="provider-guided-draft-preview-head">
        <span class="eyebrow">Vista previa</span>
        <strong>Asi se vera para clientes</strong>
      </div>
      <div class="provider-guided-draft-card" data-provider-guided-draft-card>
        <span>Elegiste un servicio guiado. Completa titulo y precio para ver la preview antes de guardar.</span>
      </div>
    </aside>
  `;
}

function renderProviderGuidedServicePanel({ guidedService = {} } = {}) {
  if (!isProviderGuidedServiceEnabled(guidedService)) return "";

  const templates = Array.isArray(guidedService.templates) ? guidedService.templates : [];
  const selectedTemplateId = String(guidedService.selectedTemplateId ?? "");
  const selectedTemplate = templates.find((template) => String(template?.id ?? "") === selectedTemplateId);
  const catalogError = guidedService.error || guidedService.source === "catalog_unavailable";

  return `
    <section class="provider-guided-service-panel" data-provider-guided-catalog data-provider-guided-composer aria-label="Agregar servicio guiado beta">
      <div class="provider-guided-service-head">
        <div>
          <span class="eyebrow">Beta controlada</span>
          <strong>Agregar servicio guiado (Beta)</strong>
          <small>Elegi un servicio del catalogo y MIMIGO te ayuda a completarlo sin volver al formulario largo.</small>
        </div>
      </div>
      ${catalogError ? `
        <div class="provider-guided-catalog-error" role="status">
          No pudimos cargar sugerencias. Podes usar el alta manual sin bloquear la publicacion.
        </div>
      ` : ""}
      <label class="provider-guided-service-search">
        <span>Buscar servicio o rubro</span>
        <input type="search" data-provider-guided-search placeholder="Busca lo que ofreces: pintura, masajes, peluqueria, gasista...">
      </label>
      <div class="provider-guided-minimum-fields">
        <strong>Solo te pedimos lo minimo</strong>
        <span>Titulo publico, precio o cotizacion, descripcion breve y zona si todavia falta.</span>
      </div>
      <div class="provider-guided-template-list">
        ${templates.length ? templates.map((template) => {
          const version = providerGuidedTemplateVersion(template);
          const pricingModel = providerGuidedTemplatePricingModel(template);
          const isRegulated = providerGuidedTemplateIsRegulated(template);
          const quoteRequired = providerGuidedTemplateQuoteRequired(template);
          const questions = providerGuidedTemplateKeyQuestions(template, 3);
          const attributes = providerGuidedTemplateKeyAttributes(template, 3);
          const strategy = version.question_strategy_default || template.default_question_strategy;
          const selected = selectedTemplateId && selectedTemplateId === String(template.id);

          return `
            <button
              type="button"
              class="provider-guided-template-card ${selected ? "is-selected" : ""}"
              data-provider-guided-template-id="${escapeHtml(template.id ?? "")}"
              data-template-id="${escapeHtml(template.id ?? "")}"
              data-template-search-value="${escapeHtml(providerGuidedTemplateSearchText(template))}"
              data-provider-guided-template-regulated="${isRegulated ? "true" : "false"}"
              data-provider-business-action="select-guided-service-template"
              aria-pressed="${selected ? "true" : "false"}"
            >
              <span class="provider-guided-template-copy">
                <strong>${escapeHtml(providerGuidedTemplateTitle(template))}</strong>
                <small>${escapeHtml(providerGuidedTemplateCategoryLabel(template))} - ${escapeHtml(template.macro_vertical || "Servicio")}</small>
              </span>
              <span class="provider-guided-template-badges">
                <em>${escapeHtml(pricingModelLabels[pricingModel] ?? pricingModel)}</em>
                ${quoteRequired ? "<em>Cotizar</em>" : ""}
                ${isRegulated ? "<em class=\"is-warning\">Requiere validacion</em>" : ""}
                ${strategy ? `<em>${escapeHtml(providerGuidedQuestionStrategyLabel(strategy))}</em>` : ""}
              </span>
              ${attributes.length ? `
                <span class="provider-guided-template-attributes">
                  ${attributes.map((attribute) => `<i>${escapeHtml(attribute.label || attribute.code || "Dato clave")}</i>`).join("")}
                </span>
              ` : ""}
              ${questions.length ? `
                <span class="provider-guided-template-questions">
                  ${questions.map((question) => `<i>${escapeHtml(question.question_text || question.label || "Pregunta sugerida")}</i>`).join("")}
                </span>
              ` : ""}
            </button>
          `;
        }).join("") : ""}
        <div class="provider-guided-template-empty" data-provider-guided-empty ${templates.length ? "hidden" : ""}>
          No hay sugerencias para esa busqueda. Podes seguir con el alta manual.
        </div>
      </div>
      <div class="provider-guided-selection-summary" data-provider-guided-selection-summary>
        ${selectedTemplate ? renderProviderGuidedTemplateSelection(selectedTemplate) : renderProviderGuidedEmptySelection()}
      </div>
      <p class="provider-guided-service-note">La guia no publica sola ni escribe catalogo. El guardado sigue pasando por svc-save-provider-service.</p>
    </section>
  `;
}

function renderProviderServicesHome({
  offerings = [],
  detail = null,
  providerAvatarUrl = "",
  providerInitials = "PR",
  providerName = "Prestador MIMI",
  guidedService = {},
  addonsEnabled = false
} = {}) {
  const activeOfferings = offerings.filter((item) => item?.active !== false);
  const inactiveOfferings = offerings.filter((item) => item?.active === false);
  const guidedEnabled = isProviderGuidedServiceEnabled(guidedService);
  const guidedPanelOpen = Boolean(guidedEnabled && guidedService?.panelOpen);
  const canPreviewProviderAvatar = /^https?:\/\//i.test(providerAvatarUrl) || /^data:image\//i.test(providerAvatarUrl);
  const zoneLabel = [detail?.city, detail?.province].filter(Boolean).join(", ") || "Zona pendiente";
  const summary = providerServicesSummary(offerings);
  const summaryItems = [
    { key: "active", label: "Activos", value: summary.active, text: "visibles" },
    { key: "paused", label: "Pausados", value: summary.paused, text: "ocultos" },
    { key: "incomplete", label: "Incompletos", value: summary.incomplete, text: "a completar" },
    { key: "review", label: "Requieren accion", value: summary.requiresAction, text: "a revisar" }
  ];
  const filterItems = [
    { key: "all", label: "Todos", count: summary.total },
    { key: "active", label: "Activos", count: summary.active },
    { key: "paused", label: "Pausados", count: summary.paused },
    { key: "incomplete", label: "Incompletos", count: summary.incomplete },
    { key: "review", label: "Requieren revision", count: summary.requiresAction }
  ];
  const renderServiceCard = (offering, { inactive = false } = {}) => {
    const price = providerOfferingPriceShortLabel(offering);
    const serviceMode = String(offering.service_mode ?? "IN_PERSON").toUpperCase();
    const locationPolicy = String(offering.location_policy ?? "CLIENT_ADDRESS").toUpperCase();
    const pricingModel = String(offering.pricing_model ?? "HOURLY").toUpperCase();
    const initials = initialsFromName(offering.title || "Servicio").slice(0, 2);
    const status = providerOfferingStatusMeta(offering);
    const categoryLabel = providerOfferingCategoryLabel(offering);
    const description = providerOfferingDescriptionLabel(offering);
    const isIncomplete = providerOfferingIsIncomplete(offering);
    const requiresValidation = providerOfferingRequiresValidation(offering);
    const addons = addonsEnabled ? providerOfferingActiveAddons(offering) : [];
    const filterTags = [
      inactive ? "paused" : "active",
      isIncomplete ? "incomplete" : "",
      requiresValidation || isIncomplete ? "review" : ""
    ].filter(Boolean).join(" ");

    return `
      <article
        class="provider-service-list-card ${inactive ? "is-inactive" : "is-active"} is-${escapeHtml(status.tone)}"
        data-offering-id="${escapeHtml(offering.id ?? "")}"
        data-provider-service-filter-tags="${escapeHtml(filterTags)}"
      >
        <button class="provider-service-list-main" type="button" data-provider-business-action="edit-offering" data-offering-id="${escapeHtml(offering.id ?? "")}">
          <span class="provider-service-list-mark" aria-hidden="true">${escapeHtml(initials)}</span>
          <span class="provider-service-list-copy">
            <span class="provider-service-card-topline">
              <strong>${escapeHtml(offering.title || "Servicio publicado")}</strong>
              <i class="provider-service-status-pill is-${escapeHtml(status.tone)}">${escapeHtml(status.label)}</i>
            </span>
            <small>${escapeHtml(categoryLabel)} - ${escapeHtml(serviceModeLabels[serviceMode] ?? "Presencial")}</small>
            <span class="provider-service-description">${escapeHtml(description)}</span>
          </span>
          <span class="provider-service-price-block">
            <em>${escapeHtml(price)}</em>
            <small>${escapeHtml(providerOfferingPricingBadge(offering))}</small>
          </span>
        </button>
        <div class="provider-service-card-meta">
          <span>${escapeHtml(locationPolicyLabels[locationPolicy] ?? "Cliente")}</span>
          <span>${escapeHtml(providerOfferingUpdatedLabel(offering))}</span>
          ${addons.length ? `<span>${addons.length} ${addons.length === 1 ? "adicional" : "adicionales"}</span>` : ""}
          ${requiresValidation ? "<span>Regulado</span>" : ""}
        </div>
        ${addons.length ? `
          <div class="provider-service-addon-strip" aria-label="Adicionales disponibles">
            <strong>Adicionales disponibles</strong>
            <span>${addons.slice(0, 3).map((addon) => escapeHtml(addon.name)).join(" + ")}</span>
          </div>
        ` : ""}
        <div class="provider-service-card-actions">
          ${inactive ? "" : `<button class="provider-service-secondary-button" type="button" data-provider-business-action="edit-offering" data-offering-id="${escapeHtml(offering.id ?? "")}">Editar</button>`}
          <button class="provider-service-secondary-button" type="button" data-provider-business-action="preview-offering" data-offering-id="${escapeHtml(offering.id ?? "")}">Ver como cliente</button>
          ${inactive ? `
            <button class="provider-service-reactivate-button" type="button" data-provider-business-action="reactivate-offering" data-offering-id="${escapeHtml(offering.id ?? "")}">
              Reactivar
            </button>
          ` : `
            <button class="provider-service-delete-button" type="button" data-provider-business-action="delete-offering" data-offering-id="${escapeHtml(offering.id ?? "")}">
              Pausar
            </button>
          `}
        </div>
        <p class="provider-service-status-note">${escapeHtml(status.detail)}</p>
      </article>
    `;
  };

  return `
    <section class="provider-services-home" aria-label="Tus servicios publicados">
      <section class="provider-services-home-hero">
        <div class="provider-services-home-copy">
          <span class="eyebrow">Servicios</span>
          <h3>Tus servicios</h3>
          <p>Administra que ofreces, como se ve para clientes y cuando aparece en busquedas.</p>
          <div class="provider-services-home-actions">
            <button class="provider-services-hero-cta" type="button" data-provider-business-action="add-provider-service">
              <span aria-hidden="true">+</span>
              Agregar servicio
            </button>
            ${guidedEnabled ? `
              <button class="provider-services-hero-cta is-secondary" type="button" data-provider-business-action="add-provider-guided-service">
                Agregar servicio guiado (Beta)
              </button>
            ` : ""}
          </div>
        </div>
        <div class="provider-profile-avatar-dock provider-profile-avatar-dock--home">
          <label class="provider-profile-avatar-action" title="Cambiar foto de perfil" aria-label="Cambiar foto de perfil">
            <input name="providerAvatarFile" id="providerAvatarInput" type="file" accept="image/jpeg,image/png,image/webp">
            <span class="provider-photo-preview" id="providerAvatarPreview">
              ${canPreviewProviderAvatar
                ? `<img src="${escapeHtml(providerAvatarUrl)}" alt="Foto de perfil" loading="lazy">`
                : `<span>${escapeHtml(providerInitials)}</span>`}
            </span>
            <span class="provider-avatar-edit-dot" aria-hidden="true">+</span>
          </label>
          ${canPreviewProviderAvatar ? `<button type="button" class="provider-avatar-remove-link provider-avatar-remove-icon" data-provider-business-action="remove-avatar" aria-label="Quitar foto">x</button>` : ""}
          <small id="providerAvatarStatus" class="provider-avatar-status"></small>
        </div>
      </section>

      <section class="provider-services-summary-grid" aria-label="Resumen de servicios">
        ${summaryItems.map((item) => `
          <article class="provider-services-summary-card is-${escapeHtml(item.key)}">
            <span>${escapeHtml(item.label)}</span>
            <strong>${item.value}</strong>
            <small>${escapeHtml(item.text)}</small>
          </article>
        `).join("")}
      </section>

      <section class="provider-services-home-list">
        <div class="provider-services-home-list-head">
          <div>
            <span class="eyebrow">Visible para clientes</span>
            <strong>${summary.total ? `${summary.total} ${summary.total === 1 ? "servicio configurado" : "servicios configurados"}` : "Todavia no publicaste servicios"}</strong>
            <small>${escapeHtml(providerName)} - ${escapeHtml(zoneLabel)}</small>
          </div>
        </div>
        <div class="provider-services-filter-bar" role="group" aria-label="Filtrar servicios">
          ${filterItems.map((item, index) => `
            <button
              class="${index === 0 ? "is-active" : ""}"
              type="button"
              data-provider-business-action="filter-provider-services"
              data-provider-services-filter="${escapeHtml(item.key)}"
              aria-pressed="${index === 0 ? "true" : "false"}"
            >
              ${escapeHtml(item.label)}
              <span>${item.count}</span>
            </button>
          `).join("")}
        </div>
        <div class="provider-services-mini-list">
          ${activeOfferings.map((offering) => renderServiceCard(offering)).join("")}
          ${inactiveOfferings.map((offering) => renderServiceCard(offering, { inactive: true })).join("")}
          ${!offerings.length ? `
            <article class="provider-services-empty-state" data-provider-services-empty="all">
              <strong>Agrega tu primer servicio para aparecer en busquedas.</strong>
              <small>Usa el boton principal de arriba para cargar que ofreces, como lo cobras y donde trabajas.</small>
            </article>
          ` : ""}
          <article class="provider-services-empty-state" data-provider-services-filter-empty hidden>
            <strong>No hay servicios en este filtro.</strong>
            <small>Proba con otro estado o agrega un servicio nuevo.</small>
          </article>
        </div>
        <div class="provider-services-feedback-states" aria-hidden="true">
          <span class="provider-services-loading-state">Cargando tus servicios...</span>
          <span class="provider-services-error-state">No pudimos cargar tus servicios. Volve a intentar.</span>
        </div>
        <p class="provider-services-home-helper">Toca una card para editarla. Los cambios se guardan por el flujo auditado de MIMIGO.</p>
      </section>
    </section>
  `;
}

function renderOfferingEditorV2(offering = null, index = 0, categories = [], options = {}) {
  const currentCategoryId = offering?.category_id ?? "";
  const currentCategory = categoryById(categories, currentCategoryId);
  const defaults = recommendedDefaultsForCategory(currentCategory);
  const pricingModel = offering?.pricing_model ?? defaults.pricingModel;
  const serviceMode = offering?.service_mode ?? defaults.serviceMode;
  const locationPolicy = offering?.location_policy ?? defaults.locationPolicy;
  const checked = offering ? "checked" : "checked";
  const groupedCategories = sortedCategories(categories).reduce((acc, category) => {
    const group = categoryGroup(category);
    if (!acc[group]) acc[group] = [];
    acc[group].push(category);
    return acc;
  }, {});
  const requirement = currentCategory ? categoryRequirementText(currentCategory) : "";
  const addonsEnabled = Boolean(options.addonsEnabled);

  return `
    <article class="provider-editor-card provider-offering-card provider-offering-card-v2">
      <input type="hidden" name="offering:${index}:present" value="1">
      <input type="hidden" name="offering:${index}:id" value="${escapeHtml(offering?.id ?? "")}">

      <div class="provider-offering-step">
        <span>${index + 1}</span>
        <div>
          <strong>${offering ? "Editar publicacion" : "Nueva publicacion"}</strong>
          <small>Esto es lo que despues ve el cliente en la card.</small>
        </div>
      </div>

      <label class="provider-check-item">
        <input type="checkbox" name="offering:${index}:active" ${checked}>
        <span>Publicar este servicio</span>
      </label>

      <label class="input-group provider-field-wide">
        <span>Nombre del servicio</span>
        <input name="offering:${index}:title" type="text" maxlength="90" value="${escapeHtml(offering?.title ?? "")}" placeholder="Ej: pintura interior, cuidado de adultos, manicuria">
      </label>

      <label class="input-group provider-field-wide">
        <span>Rubro seleccionado</span>
        <select name="offering:${index}:categoryId">
          <option value="">Elegilo desde las sugerencias</option>
          ${Object.entries(groupedCategories).map(([group, items]) => `
            <optgroup label="${escapeHtml(categoryGroupLabels[group] ?? group)}">
              ${items.map((category) => `
                <option value="${escapeHtml(category.id)}" ${String(currentCategoryId) === String(category.id) ? "selected" : ""}>${escapeHtml(category.name)}</option>
              `).join("")}
            </optgroup>
          `).join("")}
        </select>
        <small>${escapeHtml(requirement || "El rubro viene de las opciones que elegiste. Si falta uno, volve al primer paso y agregalo.")}</small>
      </label>

      <div class="provider-inline-fields">
        <label class="input-group">
          <span>Como lo cobras</span>
          <select name="offering:${index}:pricingModel">
            ${renderPricingModelOptions(pricingModel)}
          </select>
        </label>
        <label class="input-group">
          <span>Modalidad</span>
          <select name="offering:${index}:serviceMode">
            ${renderServiceModeOptions(serviceMode)}
          </select>
        </label>
        <label class="input-group">
          <span>Atencion</span>
          <select name="offering:${index}:locationPolicy">
            ${renderLocationPolicyOptions(locationPolicy)}
          </select>
        </label>
      </div>

      <label class="input-group provider-field-wide">
          <span>Descripcion del servicio</span>
          <textarea name="offering:${index}:description" maxlength="220" rows="2" placeholder="Conta el alcance, que incluye, que no incluye y que necesita saber el cliente">${escapeHtml(offering?.description ?? "")}</textarea>
      </label>

      <label class="input-group provider-field-wide">
        <span>Resumen para mostrar al cliente</span>
        <input name="offering:${index}:publicSummary" type="text" maxlength="140" value="${escapeHtml(offering?.public_summary ?? "")}" placeholder="Ej: sesiones online para ansiedad, estres y orientacion adulta">
      </label>

      <div class="provider-price-helper">
        <strong>Tu precio</strong>
        <span>Cargá el importe que querés cobrar por este servicio. MIMI GO gestiona la plataforma según sus términos y condiciones.</span>
      </div>

      <div class="provider-inline-fields">
        <label class="input-group">
          <span>$/hora</span>
          <input name="offering:${index}:pricePerHour" type="number" min="0" step="100" value="${escapeHtml(String(offering?.price_per_hour ?? ""))}" placeholder="0">
        </label>
        <label class="input-group">
          <span>Visita base</span>
          <input name="offering:${index}:baseVisitFee" type="number" min="0" step="100" value="${escapeHtml(String(offering?.base_visit_fee ?? ""))}" placeholder="0">
        </label>
      </div>

      <div class="provider-inline-fields">
        <label class="input-group">
          <span>Precio cerrado</span>
          <input name="offering:${index}:fixedPrice" type="number" min="0" step="100" value="${escapeHtml(String(offering?.fixed_price ?? ""))}" placeholder="0">
        </label>
        <label class="input-group">
          <span>Minimo</span>
          <input name="offering:${index}:minimumCharge" type="number" min="0" step="100" value="${escapeHtml(String(offering?.minimum_charge ?? 0))}" placeholder="0">
        </label>
      </div>

      <div class="provider-inline-fields">
        <label class="input-group">
          <span>Unidad</span>
          <input name="offering:${index}:unitName" type="text" maxlength="40" value="${escapeHtml(offering?.unit_name ?? defaults.unitName)}" placeholder="sesion, clase, consulta">
        </label>
        <label class="input-group">
          <span>$/sesion o unidad</span>
          <input name="offering:${index}:unitPrice" type="number" min="0" step="100" value="${escapeHtml(String(offering?.unit_price ?? ""))}" placeholder="0">
        </label>
        <label class="input-group">
          <span>Duracion</span>
          <input name="offering:${index}:durationMinutes" type="number" min="15" max="240" step="5" value="${escapeHtml(String(offering?.duration_minutes ?? defaults.durationMinutes))}" placeholder="45">
        </label>
      </div>

      <div class="provider-inline-fields">
        <label class="input-group">
          <span>Min hs</span>
          <input name="offering:${index}:minimumHours" type="number" min="1" max="24" value="${escapeHtml(String(offering?.minimum_hours ?? ""))}" placeholder="1">
        </label>
        <label class="input-group">
          <span>Max hs</span>
          <input name="offering:${index}:maximumHours" type="number" min="1" max="24" value="${escapeHtml(String(offering?.maximum_hours ?? ""))}" placeholder="8">
        </label>
      </div>

      <label class="provider-check-item">
        <input name="offering:${index}:quoteRequired" type="checkbox" ${offering?.quote_required ? "checked" : ""}>
        <span>Cotizar antes de confirmar<small>${quotePricingHelp}</small></span>
      </label>

      ${addonsEnabled ? renderProviderOfferingAddonsEditor(offering, index) : ""}

      <label class="input-group provider-field-wide">
        <span>Indicaciones para el cliente</span>
        <textarea name="offering:${index}:clientInstructions" maxlength="220" rows="2" placeholder="Ej: la videollamada se coordina por chat luego de aceptar la solicitud">${escapeHtml(offering?.client_instructions ?? "")}</textarea>
      </label>
    </article>
  `;
}

function renderProviderBusiness(state) {
  const container = document.getElementById("providerBusinessPanel");
  if (!container) return;

  const business = state.provider.business ?? {};
  const guidedService = state.provider?.guidedService ?? {};
  const guidedEnabled = isProviderGuidedServiceEnabled(guidedService);
  const guidedPanelOpen = Boolean(guidedEnabled && guidedService?.panelOpen);
  const addonsEnabled = Boolean(state.provider?.serviceAddons?.enabled);
  const detail = business.profile ?? null;
  const pricing = business.pricing ?? [];
  const offerings = business.offerings ?? [];
  const availability = business.availability ?? [];
  const locationLabel = state.provider.availability?.locationLabel ?? "Sin posición tomada";
  const activeCategoryIds = new Set(
    (state.provider.categories ?? []).map((item) => item.category_id ?? item.id)
  );
  const quality = providerProfileQuality({
    offerings,
    detail,
    categories: state.provider.categories ?? []
  });
  const categories = sortedCategories(
    Array.isArray(state.appConfig?.categories) && state.appConfig.categories.length
      ? state.appConfig.categories
      : appConfig.categories
  );
  const pricingByCategory = new Map(pricing.map((item) => [item.category_id, item]));
  const publishedCategoryIds = new Set([
    ...activeCategoryIds,
    ...offerings.map((item) => item?.category_id).filter(Boolean)
  ]);
  const provinceOptions = Object.keys(argentinaZones);
  const selectedProvince = String(detail?.province ?? "");
  const selectedCity = String(detail?.city ?? "");
  const cityOptions = selectedProvince && argentinaZones[selectedProvince]
    ? argentinaZones[selectedProvince]
    : [];
  const citySelectOptions = [...cityOptions];
  const selectedCityInKnownList = selectedCity ? cityOptions.includes(selectedCity) : true;
  const shouldShowOtherCity = Boolean(selectedCity) && (!selectedCityInKnownList || selectedCity === "Otra localidad");
  const citySelectValue = shouldShowOtherCity ? "Otra localidad" : selectedCity;
  const providerCityOtherValue = selectedCity && selectedCity !== "Otra localidad" && !selectedCityInKnownList
    ? selectedCity
    : "";
  const primaryOffering = offerings.find((item) => item?.active !== false) ?? offerings[0] ?? null;
  const primaryPrice =
    primaryOffering?.quote_required || primaryOffering?.pricing_model === "QUOTE"
      ? "Cotizar antes de confirmar"
      : primaryOffering?.pricing_model === "UNIT"
        ? `${currency(primaryOffering?.unit_price, primaryOffering?.currency)} / ${primaryOffering?.unit_name || "sesion"}`
        : currency(
            primaryOffering?.fixed_price ||
              primaryOffering?.base_visit_fee ||
              primaryOffering?.price_per_hour ||
              pricing[0]?.price_per_hour,
            primaryOffering?.currency || pricing[0]?.currency
          );

  // Si el usuario tocó "Editar" en una card, usar ese offering específico en el form
  const editingId = state.provider?.editingOfferingId ?? null;
  const editingOffering = editingId ? offerings.find((o) => o?.id === editingId) : null;
  const serviceComposerMode = String(state.provider?.serviceComposerMode ?? "").toLowerCase();
  const serviceComposerOpen = Boolean(state.provider?.serviceComposerOpen);
  const isAddingOffering = serviceComposerOpen && serviceComposerMode === "new";
  const isEditingOffering = serviceComposerOpen && serviceComposerMode === "edit" && Boolean(editingOffering);
  const shouldRenderComposer = isAddingOffering || isEditingOffering;
  const firstOffering = isAddingOffering ? null : (editingOffering ?? primaryOffering ?? null);
  const selectedCategoryIds = new Set(
    isAddingOffering
      ? []
      : editingOffering?.category_id
        ? [editingOffering.category_id]
        : firstOffering?.category_id
          ? [firstOffering.category_id]
          : [...publishedCategoryIds]
  );
  const selectedCategories = categories.filter((category) => selectedCategoryIds.has(category.id));
  const offeringCategories = selectedCategories.length ? selectedCategories : categories;
  const selectedCategoryLabel = selectedCategories.length
    ? selectedCategories.map((category) => category.name).join(", ")
    : "Primero elegi rubros sugeridos";
  const hasSelectedRubros = selectedCategoryIds.size > 0;
  const defaultCategory = selectedCategories[0] ?? (firstOffering?.category_id
    ? categories.find((category) => category.id === firstOffering.category_id)
    : null);
  const defaults = recommendedDefaultsForCategory(defaultCategory);
  const pricingModel = firstOffering?.pricing_model ?? defaults.pricingModel;
  const serviceMode = firstOffering?.service_mode ?? defaults.serviceMode;
  const locationPolicy = firstOffering?.location_policy ?? defaults.locationPolicy;
  const profileMetadata = detail?.metadata_json || detail?.metadata || {};
  const providerDocuments = [
    ...(Array.isArray(business.documents) ? business.documents : []),
    ...(Array.isArray(state.provider.documents?.items) ? state.provider.documents.items : [])
  ];
  const identityFullName = String(
    profileMetadata.identity_document_full_name ||
    profileMetadata.full_name_detected ||
    profileMetadata.kyc_full_name ||
    ""
  ).trim();
  const providerFirstNameValue = firstNameFromText(
    detail?.first_name ||
    identityFullName ||
    state.provider.profile?.full_name ||
    state.session.userName ||
    ""
  );
  const providerAvatarUrl = firstImageUrlFrom(
    detail?.avatar_public_url,
    detail?.metadata_json?.avatar_public_url,
    detail?.metadata_json?.profile_photo_url,
    detail?.metadata_json?.avatar_url,
    detail?.metadata_json?.public_url,
    detail?.metadata_json?.file_url,
    detail?.metadata_json?.signed_url,
    detail?.metadata_json?.preview_url,
    detail?.metadata_json?.image_url,
    state.provider.business?.profile?.avatar_public_url,
    state.provider.business?.profile?.metadata_json?.avatar_public_url,
    state.provider.business?.profile?.metadata_json?.profile_photo_url,
    state.provider.business?.profile?.metadata_json?.public_url,
    state.provider.business?.profile?.metadata_json?.file_url,
    state.provider.business?.profile?.metadata_json?.signed_url,
    state.provider.business?.profile?.metadata_json?.preview_url,
    state.provider.business?.profile?.metadata_json?.image_url,
    state.provider.profile?.avatar_public_url,
    state.provider.profile?.avatar_url,
    state.provider.profile?.photo_url,
    state.session.userAvatar,
    providerDocumentAvatarUrl(providerDocuments)
  );
  const canPreviewProviderAvatar = /^https?:\/\//i.test(providerAvatarUrl) || /^data:image\//i.test(providerAvatarUrl);
  const providerDisplayName = String(
    providerFirstNameValue ||
    state.provider.profile?.full_name ||
    state.session.userName ||
    "Prestador MIMI"
  ).trim();
  const providerInitials = initialsFromName(providerDisplayName || "MIMI");
  const visibleServiceLabels = selectedCategories.length
    ? selectedCategories.map((category) => category.name)
    : firstOffering?.title
      ? [firstOffering.title]
      : [];
  const identityAddressText = String(
    profileMetadata.identity_document_address_text ||
    profileMetadata.document_address_text ||
    profileMetadata.kyc_document_address_text ||
    ""
  ).trim();
  const profileAddressText = String(detail?.address_text || "").trim();
  const displayAddressText = profileAddressText || identityAddressText || "Zona pendiente";
  const securityAddressText = identityAddressText || "DNI pendiente";
  const securityAddressStatusLabel = identityAddressText ? "DNI verificado" : "DNI pendiente";
  const addressSourceLabel = profileAddressText
      ? "Zona operativa cargada"
      : identityAddressText
        ? "DNI verificado"
        : "Completar zona";
  const addressSourceHelp = identityAddressText
    ? "Por seguridad usamos el domicilio detectado en tu documento como referencia. Si vivis o trabajas en otro lugar, cargalo como zona operativa."
    : profileAddressText
      ? "Este domicilio queda visible como zona/base de trabajo. Cuando KYC detecte domicilio del DNI, se muestra como referencia segura."
      : "Aunque el DNI siga pendiente, podes cargar una zona operativa para que el servicio quede publicado correctamente.";
  const currentAddressInputValue = profileAddressText || identityAddressText;
  const providerLocation = profileMetadata.provider_base_location || {};
  const providerLocationLat = profileMetadata.provider_base_location_lat ?? providerLocation.lat ?? "";
  const providerLocationLng = profileMetadata.provider_base_location_lng ?? providerLocation.lng ?? "";
  const providerLocationAccuracy = profileMetadata.provider_base_location_accuracy_m ?? providerLocation.accuracy_m ?? "";
  const providerLocationSource = profileMetadata.provider_base_location_source ?? providerLocation.source ?? "";
  const shouldOpenProfileDetails = !providerFirstNameValue || !selectedProvince || !selectedCity || !currentAddressInputValue;
  const hasAdvancedPriceData = Boolean(
    firstOffering?.unit_name ||
    firstOffering?.price_per_hour ||
    firstOffering?.fixed_price ||
    firstOffering?.duration_minutes ||
    firstOffering?.quote_required
  );
  const hasAnyPriceValue = Boolean(
    firstOffering?.unit_price ||
    firstOffering?.price_per_hour ||
    firstOffering?.fixed_price ||
    firstOffering?.base_visit_fee ||
    firstOffering?.quote_required
  );
  const shouldOpenDiscoveryStep = !isEditingOffering && !hasSelectedRubros;
  const shouldOpenServiceDetails = isEditingOffering || (hasSelectedRubros && (!firstOffering?.title || !hasAnyPriceValue));
  const shouldOpenAddressStep = !currentAddressInputValue;
  const shouldOpenZoneStep = !selectedProvince || !selectedCity;
  const shouldOpenPublicProfileStep = !providerFirstNameValue || !detail?.bio;
  const showServicePreview = !isAddingOffering || !offerings.length;
  const showProfileSection = true;
  const legal = providerLegalStatus(state);
  const readinessItems = [
    { label: "Servicio", done: hasSelectedRubros },
    { label: "Precio", done: Boolean(firstOffering?.title && hasAnyPriceValue) },
    { label: "Zona", done: Boolean(selectedProvince && selectedCity && currentAddressInputValue && providerFirstNameValue) }
  ];
  const readinessDone = readinessItems.filter((item) => item.done).length;
  const nextReadinessIndex = readinessItems.findIndex((item) => !item.done);
  const readinessProgress = Math.round((readinessDone / readinessItems.length) * 100);

  if (!legal.accepted) {
    container.innerHTML = `
      <section class="provider-stack provider-publisher-app provider-publisher-app-v3 provider-legal-required">
        ${renderProviderLegalGate(state)}
      </section>
    `;
    return;
  }

  if (!shouldRenderComposer) {
    container.innerHTML = `
      <section class="provider-stack provider-publisher-app provider-publisher-app-v3">
        ${renderProviderServicesHome({
          offerings,
          detail,
          providerAvatarUrl,
          providerInitials,
          providerName: providerDisplayName,
          guidedService,
          addonsEnabled
        })}
      </section>
    `;
    return;
  }

  container.innerHTML = `
    <section class="provider-stack provider-publisher-app provider-publisher-app-v3">
      <form class="provider-settings-form provider-publisher-shell provider-simple-builder" id="providerBusinessForm" novalidate>
        <input type="hidden" name="providerAvatarPublicUrl" value="${escapeHtml(providerAvatarUrl ?? "")}">

        <section class="provider-service-composer-head" aria-label="${isEditingOffering ? "Editar servicio" : "Agregar servicio"}">
          <div>
            <span class="eyebrow">Modo foco Servicios</span>
            <h3>${isEditingOffering ? "Editar servicio" : "Agregar servicio"}</h3>
            <p>Completa solo lo esencial. Perfil, documentos y datos largos pueden mejorarse despues.</p>
          </div>
          <button class="provider-service-composer-close" type="button" data-provider-business-action="close-provider-service-composer" aria-label="Cerrar y volver a Tus servicios">x</button>
        </section>

        <section class="provider-service-readiness" aria-label="Estado de publicacion" style="--provider-readiness:${readinessProgress}%">
          <div class="provider-service-readiness-head">
            <div>
              <span>Publicacion</span>
              <strong>${readinessDone} de ${readinessItems.length} listos</strong>
            </div>
            <em>${readinessProgress}%</em>
          </div>
          <div class="provider-service-readiness-bar" aria-hidden="true"><span></span></div>
          <div class="provider-service-readiness-steps">
            ${readinessItems.map((item, index) => `
              <span class="${item.done ? "is-done" : index === nextReadinessIndex ? "is-current" : ""}">
                <i aria-hidden="true">${item.done ? "✓" : index + 1}</i>
                ${escapeHtml(item.label)}
              </span>
            `).join("")}
          </div>
        </section>

        ${showServicePreview ? renderProviderServiceClientPreview({
          offering: firstOffering,
          categories: selectedCategories,
          detail,
          providerAvatarUrl,
          providerInitials,
          providerName: providerDisplayName,
          priceLabel: firstOffering ? primaryPrice : "Completa precio y modalidad"
        }) : ""}

        ${isEditingOffering ? `
        <section class="provider-flow-step provider-flow-step-rubro-locked">
          <div class="provider-flow-summary provider-flow-summary-static">
            <span>1</span>
            <div>
              <strong>Que servicio ofreces?</strong>
              <small>${selectedCategoryLabel ? escapeHtml(selectedCategoryLabel) : "Rubro publicado"}. El nombre publico se edita en Precio y modalidad.</small>
            </div>
            <em>Listo</em>
          </div>
        </section>
        ` : `
        <details class="provider-flow-step provider-flow-step-ai" ${shouldOpenDiscoveryStep ? "open" : ""}>
          <summary class="provider-flow-summary">
            <span>1</span>
            <div>
              <strong>Que servicio ofreces?</strong>
              <small>${visibleServiceLabels.length ? escapeHtml(visibleServiceLabels.join(", ")) : "Buscalo o escribilo simple. MIMI ordena el rubro."}</small>
            </div>
            <em>${hasSelectedRubros ? "Listo" : "Pendiente"}</em>
          </summary>

        <section class="provider-simple-card provider-ai-card" data-provider-setup-step="1">
          <div class="provider-simple-card-heading">
            <span>1</span>
            <div>
              <strong>Que servicio ofreces?</strong>
              <small>Escribilo como se lo dirias a un cliente. No hace falta completar todo ahora.</small>
            </div>
          </div>
          <div class="provider-ai-input-shell provider-search-box">
            <textarea name="providerAiPrompt" rows="2" maxlength="500" placeholder="Ej: Pinto interiores, hago manicura, arreglo perdidas de agua">${escapeHtml(firstOffering?.description ?? "")}</textarea>
            <button class="provider-icon-action provider-mic-inside" data-provider-business-action="start-provider-dictation" type="button" aria-label="Dictar por voz" title="Dictar por voz">🎙</button>
            <button class="btn-primary provider-suggest-button" data-provider-business-action="suggest-provider-service" type="button">Sugerir rubros</button>
          </div>
          <div class="provider-voice-status" id="providerVoiceStatus" hidden></div>
          <p class="provider-search-helper">Nada se publica automaticamente. Primero elegis rubro, despues revisas precio y modalidad.</p>
        </section>

        ${isAddingOffering && guidedPanelOpen ? renderProviderGuidedServicePanel({ guidedService }) : ""}

        <section class="provider-ai-results-panel ${hasSelectedRubros ? "is-visible" : ""}" id="providerAiSuggestionsPanel" ${hasSelectedRubros ? "" : "hidden"} aria-live="polite">
          <div class="provider-results-title">
            <div>
              <strong>Coincidencias de MIMI</strong>
              <span>Toca una o varias opciones para agregarlas a tus prestaciones.</span>
            </div>
          </div>
          <div class="provider-ai-empty" id="providerAiEmpty" ${hasSelectedRubros ? "hidden" : ""}>Escribi un servicio y toca Sugerir rubros para ver opciones.</div>
          <div class="provider-ai-results-scroll">
          <div class="provider-ai-suggestions" id="providerAiSuggestions" ${hasSelectedRubros ? "" : "hidden"}>
            ${selectedCategories.length ? `
              <div class="provider-suggestions-heading">
                <strong>Rubros elegidos</strong>
                <span>Podés cambiar la selección antes de guardar.</span>
              </div>
            ` : ""}
            ${selectedCategories.map((category) => `
              <button class="provider-suggestion-card is-selected" type="button" data-provider-suggestion-card data-provider-business-action="toggle-provider-suggestion" data-category-id="${escapeHtml(category.id)}" data-category-code="${escapeHtml(category.code)}" aria-pressed="true">
                <strong>${escapeHtml(category.name)}</strong>
                <span>${escapeHtml(category.description ?? "Rubro seleccionado")}</span>
              </button>
            `).join("")}
          </div>
          </div>
        </section>
        </details>
        `}

        <details class="provider-flow-step provider-flow-step-details" ${shouldOpenServiceDetails ? "open" : ""}>
          <summary class="provider-flow-summary">
            <span>2</span>
            <div>
              <strong>Precio y modalidad</strong>
              <small>${firstOffering?.title ? `${escapeHtml(firstOffering.title)} - ${escapeHtml(primaryPrice)}` : "Nombre publico, precio, unidad y descripcion corta."}</small>
            </div>
            <em>${firstOffering?.title && hasAnyPriceValue ? "Listo" : "Pendiente"}</em>
          </summary>

        <section class="provider-simple-card provider-service-details" id="providerServiceDetails">
          <div class="provider-simple-card-heading">
            <span>2</span>
            <div>
              <strong>Precio y modalidad</strong>
              <small>Define el precio visible o marca cotizacion si depende del caso.</small>
            </div>
          </div>

          <input type="hidden" name="offering:0:present" value="1">
          <input type="hidden" name="offering:0:id" value="${escapeHtml(firstOffering?.id ?? "")}">
          <input type="hidden" name="offering:0:serviceTemplateId" value="${escapeHtml(firstOffering?.service_template_id ?? firstOffering?.metadata?.service_template_id ?? "")}">
          <input type="hidden" name="offering:0:serviceTemplateVersionId" value="${escapeHtml(firstOffering?.service_template_version_id ?? firstOffering?.metadata?.service_template_version_id ?? "")}">
          <input type="checkbox" name="offering:0:active" checked hidden>

          <div class="provider-hidden-category-inputs" aria-hidden="true">
            ${categories.map((category) => `
              <input type="checkbox" name="categoryActive:${escapeHtml(category.id)}" ${selectedCategoryIds.has(category.id) ? "checked" : ""} tabindex="-1">
            `).join("")}
          </div>

          <div class="provider-selected-summary" id="providerSelectedRubrosSummary">
            ${selectedCategories.length
              ? `Rubros seleccionados: ${escapeHtml(selectedCategories.map((category) => category.name).join(", "))}`
              : "Primero elegi un rubro sugerido para completar el servicio."}
          </div>

          <select name="offering:0:categoryId" hidden aria-hidden="true" tabindex="-1">
              <option value="">Primero elegi una card sugerida</option>
              ${categories.map((category) => `
                <option value="${escapeHtml(category.id)}" data-pricing-model="${escapeHtml(category.default_pricing_model ?? "HOURLY")}" data-service-modes="${escapeHtml((category.allowed_service_modes ?? ["IN_PERSON"]).join(","))}" ${(firstOffering?.category_id ?? selectedCategories[0]?.id ?? "") === category.id ? "selected" : ""}>${escapeHtml(category.name)}</option>
              `).join("")}
          </select>

          <label class="input-group provider-field-wide">
            <span>Nombre publico del servicio</span>
            <input name="offering:0:title" data-provider-public-title-input="0" type="text" maxlength="90" value="${escapeHtml(firstOffering?.title ?? "")}" placeholder="Ej: asesoramiento penal, manicura, pintura interior">
            <small>Que el cliente entienda en una linea que puede pedirte.</small>
          </label>

          <label class="input-group provider-field-wide">
            <span>Descripcion corta</span>
            <textarea name="offering:0:description" maxlength="220" rows="3" placeholder="Conta que incluye, como coordinas y que necesita saber el cliente">${escapeHtml(firstOffering?.description ?? "")}</textarea>
          </label>

          <label class="input-group provider-field-wide">
            <span>Resumen corto para la card</span>
            <input name="offering:0:publicSummary" type="text" maxlength="140" value="${escapeHtml(firstOffering?.public_summary ?? "")}" placeholder="Ej: consultas online y presenciales con presupuesto en MIMIGO">
          </label>

          <div class="provider-form-subtitle">
            <strong>Precio y modalidad</strong>
            <span>Usa un precio claro. Si cada caso cambia mucho, marca Cotizar antes de confirmar. ${quotePricingHelp}</span>
          </div>

          <div class="provider-form-grid provider-compact-grid provider-primary-price-grid">
            <label class="input-group">
              <span>Como cobras</span>
              <select name="offering:0:pricingModel">${renderPricingModelOptions(pricingModel)}</select>
            </label>
            <label class="input-group">
              <span>Modalidad</span>
              <select name="offering:0:serviceMode">${renderServiceModeOptionsForCategory(defaultCategory, serviceMode)}</select>
            </label>
            <label class="input-group">
              <span>Atencion</span>
              <select name="offering:0:locationPolicy">${renderLocationPolicyOptionsForMode(serviceMode, locationPolicy)}</select>
            </label>
            <label class="input-group">
              <span>Precio aproximado</span>
              <input name="offering:0:unitPrice" type="number" min="0" step="100" value="${escapeHtml(String(firstOffering?.unit_price ?? ""))}" placeholder="Ej: 15000">
            </label>
          </div>

          <details class="provider-advanced-price-details" ${hasAdvancedPriceData ? "open" : ""}>
            <summary>
              <span>Opciones avanzadas</span>
              <small>Duracion, precio por hora, precio cerrado o cotizacion previa.</small>
            </summary>
            <div class="provider-form-grid provider-compact-grid">
            <label class="input-group">
              <span>Unidad de referencia</span>
              <input name="offering:0:unitName" type="text" maxlength="40" value="${escapeHtml(firstOffering?.unit_name ?? defaults.unitName)}" placeholder="sesion, consulta, trabajo">
            </label>
            <label class="input-group">
              <span>$/hora si aplica</span>
              <input name="offering:0:pricePerHour" type="number" min="0" step="100" value="${escapeHtml(String(firstOffering?.price_per_hour ?? ""))}" placeholder="Opcional">
            </label>
            <label class="input-group">
              <span>Precio cerrado</span>
              <input name="offering:0:fixedPrice" type="number" min="0" step="100" value="${escapeHtml(String(firstOffering?.fixed_price ?? ""))}" placeholder="Opcional">
            </label>
            <label class="input-group">
              <span>Duracion estimada</span>
              <input name="offering:0:durationMinutes" type="number" min="15" max="240" step="5" value="${escapeHtml(String(firstOffering?.duration_minutes ?? defaults.durationMinutes))}" placeholder="45">
            </label>
            </div>

          <input name="offering:0:baseVisitFee" type="hidden" value="${escapeHtml(String(firstOffering?.base_visit_fee ?? ""))}">
          <input name="offering:0:minimumCharge" type="hidden" value="${escapeHtml(String(firstOffering?.minimum_charge ?? 0))}">
          <input name="offering:0:minimumHours" type="hidden" value="${escapeHtml(String(firstOffering?.minimum_hours ?? ""))}">
          <input name="offering:0:maximumHours" type="hidden" value="${escapeHtml(String(firstOffering?.maximum_hours ?? detail?.max_hours_per_service ?? 8))}">
          <label class="provider-check-item">
            <input name="offering:0:quoteRequired" type="checkbox" ${firstOffering?.quote_required ? "checked" : ""}>
            <span>Cotizar antes de confirmar<small>${quotePricingHelp}</small></span>
          </label>
          </details>
          ${isAddingOffering && guidedPanelOpen ? renderProviderGuidedDraftPreviewShell() : ""}
          <input name="offering:0:clientInstructions" type="hidden" value="${escapeHtml(firstOffering?.client_instructions ?? "")}">
        </section>
        </details>

        ${showProfileSection ? `
        <section class="provider-simple-card provider-profile-collapsible">
          <details class="provider-profile-details" ${shouldOpenProfileDetails ? "open" : ""}>
            <summary class="provider-profile-summary">
              <span class="provider-profile-summary-step">3</span>
              <div>
                <strong>Donde trabajas</strong>
                <small>${shouldOpenProfileDetails ? "Completa lo minimo para ubicar tu servicio." : "Listo. Abrilo solo si queres editar zona o perfil."}</small>
              </div>
              <em>${shouldOpenProfileDetails ? "Pendiente" : "Listo"}</em>
            </summary>
            <div class="provider-profile-details-body">
          <div class="provider-profile-section-intro">
            <strong>Mejora tu perfil para aparecer mejor</strong>
            <small>No bloquea el alta salvo datos criticos. Podes completar perfil, zona y presentacion despues.</small>
          </div>

          <div class="provider-profile-stepper">
            <details class="provider-location-editor-step" ${shouldOpenAddressStep ? "open" : ""}>
              <summary class="provider-location-step-summary">
                <span>3.1</span>
                <div>
                  <strong>Tu zona de trabajo</strong>
                  <small>${escapeHtml(displayAddressText)}</small>
                </div>
                <em>${escapeHtml(addressSourceLabel)}</em>
              </summary>
              <article class="provider-identity-address-card ${identityAddressText ? "is-verified" : ""}">
                <div>
                  <span class="eyebrow">Domicilio de seguridad</span>
                  <strong>${escapeHtml(securityAddressText)}</strong>
                  <small>${escapeHtml(addressSourceHelp)}</small>
                </div>
                <em>${escapeHtml(securityAddressStatusLabel)}</em>
              </article>
              <div class="provider-address-actions">
                <button class="provider-location-detect-btn" type="button" data-provider-business-action="use-provider-current-location">
                  <span class="provider-location-detect-icon" aria-hidden="true">GPS</span>
                  <span>Usar GPS del telefono</span>
                </button>
                <small id="providerAddressLocationStatus" class="provider-address-location-status" aria-live="polite">${providerLocationLat && providerLocationLng ? "GPS guardado para esta base operativa." : "Tambien podes completar la direccion manualmente."}</small>
              </div>
              <label class="input-group provider-field-wide">
                <span>Editar tu zona o domicilio cercano</span>
                <input name="providerAddressText" type="text" maxlength="140" value="${escapeHtml(currentAddressInputValue)}" placeholder="Ej: Villa Cornu, Laques 9800 o Nueva Cordoba">
                <small>El domicilio del DNI queda como referencia de seguridad. Este campo define tu zona operativa visible.</small>
              </label>
              <input name="providerLocationLat" type="hidden" value="${escapeHtml(providerLocationLat)}">
              <input name="providerLocationLng" type="hidden" value="${escapeHtml(providerLocationLng)}">
              <input name="providerLocationAccuracy" type="hidden" value="${escapeHtml(providerLocationAccuracy)}">
              <input name="providerLocationSource" type="hidden" value="${escapeHtml(providerLocationSource)}">
            </details>

            <details class="provider-location-editor-step" ${shouldOpenZoneStep ? "open" : ""}>
              <summary class="provider-location-step-summary">
                <span>3.2</span>
                <div>
                  <strong>Provincia y ciudad</strong>
                  <small>${selectedProvince && selectedCity ? `${escapeHtml(selectedCity)}, ${escapeHtml(selectedProvince)}` : "Elegir zona de trabajo"}</small>
                </div>
                <em>${selectedProvince && selectedCity ? "Listo" : "Pendiente"}</em>
              </summary>
              <div class="provider-form-grid provider-compact-grid">
                <label class="input-group">
                  <span>Provincia</span>
                  <select name="providerProvince">
                    <option value="">Elegi provincia</option>
                    ${provinceOptions.map((province) => `<option value="${escapeHtml(province)}" data-cities="${escapeHtml((argentinaZones[province] ?? []).join("|"))}" ${selectedProvince === province ? "selected" : ""}>${escapeHtml(province)}</option>`).join("")}
                  </select>
                </label>
                <label class="input-group">
                  <span>Ciudad</span>
                  <select name="providerCity" data-provider-city-select>
                    <option value="">Primero elegi provincia</option>
                    ${citySelectOptions.map((city) => `<option value="${escapeHtml(city)}" ${citySelectValue === city ? "selected" : ""}>${escapeHtml(city)}</option>`).join("")}
                    <option value="Otra localidad" ${citySelectValue === "Otra localidad" ? "selected" : ""}>Otra localidad / barrio</option>
                  </select>
                </label>
                <label class="input-group provider-field-wide provider-city-other-field ${shouldShowOtherCity ? "is-visible" : ""}" data-provider-city-other-field ${shouldShowOtherCity ? "" : "hidden"}>
                  <span>Localidad o barrio</span>
                  <input name="providerCityOther" type="text" maxlength="80" value="${escapeHtml(providerCityOtherValue)}" placeholder="Ej: Villa Cornu, Alta Gracia, Yerba Buena">
                  <small>Usalo si tu localidad no aparece en la lista. El GPS tambien puede completarlo.</small>
                </label>
                <label class="input-group provider-field-wide" id="providerCoverageRadiusField">
                  <span>Radio de cobertura</span>
                  <select name="providerCoverageRadius">
                    ${[
                      ["100", "100 m"],
                      ["500", "500 m"],
                      ["1000", "1 km"],
                      ["3000", "3 km"],
                      ["5000", "5 km"],
                      ["10000", "10 km"],
                      ["15000", "15 km"],
                      ["20000", "20 km"],
                      ["25000", "25 km"]
                    ].map(([value, label]) => `<option value="${value}" ${String(profileMetadata.coverage_radius_meters ?? detail?.metadata?.coverage_radius_meters ?? "10000") === value ? "selected" : ""}>${label}</option>`).join("")}
                  </select>
                  <small>Para servicios online, podes atender en todo el pais.</small>
                </label>
              </div>
            </details>

            <details class="provider-location-editor-step" ${shouldOpenPublicProfileStep ? "open" : ""}>
              <summary class="provider-location-step-summary">
                <span>3.3</span>
                <div>
                  <strong>Perfil publico</strong>
                  <small>${providerFirstNameValue ? `${escapeHtml(providerFirstNameValue)} - ${escapeHtml(detail?.bio || "Bio pendiente")}` : "Nombre, bio y especialidad"}</small>
                </div>
                <em>${shouldOpenPublicProfileStep ? "Pendiente" : "Listo"}</em>
              </summary>
              <div class="provider-form-grid provider-compact-grid">
                <label class="input-group provider-field-wide">
                  <span>Nombre de pila <small style="color:#dc2626;font-weight:600">*</small></span>
                  <div class="provider-readonly-profile-value" data-provider-public-name>${escapeHtml(providerFirstNameValue || "Nombre pendiente")}</div>
                  <input name="providerFirstName" type="hidden" value="${escapeHtml(providerFirstNameValue)}">
                  <small>Viene del documento verificado. Si todavia no hay documento, usamos el nombre de tu cuenta.</small>
                </label>
                <label class="input-group provider-field-wide">
                  <span>Bio corta</span>
                  <input name="providerBio" type="text" maxlength="180" value="${escapeHtml(detail?.bio ?? "")}" placeholder="Ej: abogado penalista, consultas online y presenciales">
                </label>
                <label class="input-group provider-field-wide">
                  <span>Titulo, matricula o aclaracion profesional</span>
                  <input name="providerPublicHeadline" type="text" maxlength="120" value="${escapeHtml(detail?.public_headline ?? "")}" placeholder="Opcional. Usalo solo si aplica.">
                </label>
                <label class="input-group provider-field-wide">
                  <span>Video, sitio o sala online</span>
                  <input name="providerVideoIntroUrl" type="url" maxlength="240" value="${escapeHtml(detail?.video_intro_url ?? "")}" placeholder="Opcional">
                </label>
              </div>
              <label class="input-group provider-field-wide">
                <span>Presentacion profesional</span>
                <textarea name="providerProfessionalSummary" maxlength="600" rows="3" placeholder="Explica tu alcance, experiencia y forma de coordinar sin prometer resultados">${escapeHtml(detail?.professional_summary ?? "")}</textarea>
              </label>
              <div class="provider-ai-description-tools">
                <button class="btn-secondary" data-provider-business-action="improve-provider-description" type="button">Mejorar descripcion con MIMI</button>
                <div class="provider-description-suggestion" id="providerDescriptionSuggestion" hidden></div>
              </div>
            </details>
          </div>
          <input name="maxHoursPerService" type="hidden" value="${escapeHtml(String(detail?.max_hours_per_service ?? 8))}">
            </div>
          </details>
        </section>
        ` : `
        <input name="providerFirstName" type="hidden" value="${escapeHtml(providerFirstNameValue)}">
        <input name="providerBio" type="hidden" value="${escapeHtml(detail?.bio ?? "")}">
        <input name="providerPublicHeadline" type="hidden" value="${escapeHtml(detail?.public_headline ?? "")}">
        <input name="providerProfessionalSummary" type="hidden" value="${escapeHtml(detail?.professional_summary ?? "")}">
        <input name="providerVideoIntroUrl" type="hidden" value="${escapeHtml(detail?.video_intro_url ?? "")}">
        <input name="providerAddressText" type="hidden" value="${escapeHtml(currentAddressInputValue)}">
        <input name="providerProvince" type="hidden" value="${escapeHtml(selectedProvince)}">
        <input name="providerCity" type="hidden" value="${escapeHtml(selectedCity)}">
        <input name="providerCoverageRadius" type="hidden" value="${escapeHtml(String(profileMetadata.coverage_radius_meters ?? detail?.metadata?.coverage_radius_meters ?? "10000"))}">
        <input name="providerLocationLat" type="hidden" value="${escapeHtml(providerLocationLat)}">
        <input name="providerLocationLng" type="hidden" value="${escapeHtml(providerLocationLng)}">
        <input name="providerLocationAccuracy" type="hidden" value="${escapeHtml(providerLocationAccuracy)}">
        <input name="providerLocationSource" type="hidden" value="${escapeHtml(providerLocationSource)}">
        <input name="maxHoursPerService" type="hidden" value="${escapeHtml(String(detail?.max_hours_per_service ?? 8))}">
        `}

        <section class="provider-simple-footer">
          <div class="provider-profile-quality provider-insight-card">
            <div>
              <span class="eyebrow">Estado privado</span>
              <h3>${escapeHtml(quality.label)}</h3>
              <p class="muted">Esto solo lo ves vos. No es ranking ni garantia publica.</p>
            </div>
            <strong>${quality.score}%</strong>
          </div>
          <button class="btn-primary provider-save-button" type="submit">
            <span class="provider-save-button-icon" aria-hidden="true">✓</span>
            <span>Guardar y publicar servicio</span>
          </button>
          <p class="provider-save-helper">Podes volver a editar esta informacion desde Servicios cuando quieras.</p>
          <p class="provider-save-helper">Los cambios se guardan por el flujo auditado de MIMIGO.</p>
        </section>
      </form>

      ${offerings.length > 1 ? renderOfferingsSummary(offerings, {
        avatarUrl: providerAvatarUrl,
        initials: providerInitials,
        providerName: providerDisplayName,
        addonsEnabled
      }) : ""}
    </section>
  `;
  return;

  container.innerHTML = `
    <section class="provider-stack provider-publisher-app">
      <form class="provider-settings-form provider-publisher-shell" id="providerBusinessForm">
        <section class="provider-business-hero">
          <div>
            <span class="eyebrow">Configurador guiado</span>
            <h3>Arma tu perfil de prestador</h3>
            <p class="muted">Escribi que sabes hacer. MIMI te ayuda a ordenarlo en rubros, descripcion, precio y zona sin prometer certificaciones ni garantias.</p>
          </div>
          <div class="provider-publish-summary">
            <span>${offerings.length ? "Publicado" : "Sin publicar"}</span>
            <strong>${escapeHtml(primaryOffering?.title ?? "Crea tu primer servicio")}</strong>
            <small>${escapeHtml(primaryOffering ? primaryPrice : "El cliente necesita saber que ofreces antes de verte online.")}</small>
          </div>
        </section>

        <div class="provider-setup-progress" aria-label="Progreso de configuracion">
          ${["Servicio", "Rubro", "Descripcion", "Zona", "Fotos", "Revision", "Terminos"].map((label, index) => `
            <button class="${index === 0 ? "is-active" : ""} ${index < 2 || offerings.length ? "is-done" : ""}" type="button" data-provider-business-action="provider-setup-go" data-provider-setup-target="${index + 1}">${index + 1}. ${escapeHtml(label)}</button>
          `).join("")}
        </div>

        <section class="provider-ai-card provider-step-card is-featured is-active" data-provider-setup-step="1">
          <div class="provider-step-heading">
            <span>1</span>
            <div>
              <small>Asistente MIMI</small>
              <h3>Contanos que ofrecés</h3>
            </div>
          </div>
          <p class="muted">Escribí o dictá qué trabajos hacés. MIMI lo ordena en rubros para que revises y confirmes.</p>
          <div class="provider-ai-input-shell">
            <textarea name="providerAiPrompt" rows="3" maxlength="500" placeholder="Ej: arreglo paredes, pinto, hago revoques, coloco ceramicos">${escapeHtml(offerings[0]?.description ?? "")}</textarea>
            <div class="provider-ai-controls">
              <button class="provider-icon-action" data-provider-business-action="start-provider-dictation" type="button" aria-label="Dictar por voz" title="Dictar por voz">🎙</button>
              <button class="btn-primary provider-suggest-button" data-provider-business-action="suggest-provider-service" type="button">Sugerir</button>
            </div>
          </div>
          <div class="provider-voice-status" id="providerVoiceStatus" hidden></div>
          <div class="provider-ai-empty" id="providerAiEmpty" ${hasSelectedRubros ? "hidden" : ""}>Primero escribí qué hacés. Después elegí una o varias opciones sugeridas.</div>
          <div class="provider-ai-suggestions" id="providerAiSuggestions" ${hasSelectedRubros ? "" : "hidden"}>
            ${selectedCategories.map((category) => `
              <button class="provider-suggestion-card is-selected" type="button" data-provider-suggestion-card data-provider-business-action="toggle-provider-suggestion" data-category-id="${escapeHtml(category.id)}" data-category-code="${escapeHtml(category.code)}" aria-pressed="true">
                <strong>${escapeHtml(category.name)}</strong>
                <span>${escapeHtml(category.description ?? "Rubro seleccionado")}</span>
              </button>
            `).join("")}
          </div>
          <div class="provider-wizard-nav">
            <span id="providerSelectionHint">${escapeHtml(hasSelectedRubros ? selectedCategoryLabel : "Elegí al menos una sugerencia para seguir.")}</span>
            <button class="btn-primary" data-provider-business-action="provider-setup-next" type="button" ${hasSelectedRubros ? "" : "disabled"}>Siguiente</button>
          </div>
        </section>

        <div class="provider-help-note">
          <strong>No cargues horarios aca</strong>
          <span>Tu disponibilidad depende de estar conectado. Esta pantalla solo define que ofreces y como se entiende tu perfil.</span>
        </div>

        <section class="provider-step-card provider-profile-basics" data-provider-setup-step="2">
          <div class="provider-step-heading">
            <span>2</span>
            <div>
              <small>Perfil publico</small>
              <h3>Ahora armamos una presentación clara</h3>
            </div>
          </div>
          <div class="provider-form-grid">
          <label class="input-group">
            <span>Bio corta</span>
            <input name="providerBio" type="text" maxlength="180" value="${escapeHtml(detail?.bio ?? "")}" placeholder="Ej: trabajos de pintura, arreglos y mantenimiento del hogar">
          </label>
          <label class="input-group">
            <span>Presentación o título profesional</span>
            <input name="providerPublicHeadline" type="text" maxlength="120" value="${escapeHtml(detail?.public_headline ?? "")}" placeholder="Opcional. Usalo si aplica a tu oficio o profesión.">
            <small>Si tenés matrícula, título o habilitación relacionada, podés aclararlo sin prometer validación pública.</small>
          </label>
          <label class="input-group">
            <span>Video o sala online</span>
            <input name="providerVideoIntroUrl" type="url" maxlength="240" value="${escapeHtml(detail?.video_intro_url ?? "")}" placeholder="Link profesional, sitio o sala online">
          </label>
          <label class="input-group">
            <span>Ciudad o localidad principal</span>
            <input name="providerCity" type="text" maxlength="80" value="${escapeHtml(detail?.city ?? "")}" placeholder="Ej: Córdoba Capital" list="providerCityOptions">
          </label>
          <label class="input-group">
            <span>Provincia</span>
            <select name="providerProvince">
              <option value="">Elegí provincia</option>
              ${provinceOptions.map((province) => `<option value="${escapeHtml(province)}" ${String(detail?.province ?? "") === province ? "selected" : ""}>${escapeHtml(province)}</option>`).join("")}
            </select>
          </label>
          <label class="input-group">
            <span>Área donde podés trabajar</span>
            <input name="providerAddressText" type="text" maxlength="140" value="${escapeHtml(detail?.address_text ?? "")}" placeholder="Ej: Nueva Córdoba, Centro y zonas cercanas">
            <small>Esto ayuda a mostrar tu servicio donde corresponde. Después podés ajustar cobertura.</small>
          </label>
          <datalist id="providerCityOptions">
            ${cityOptions.map((item) => `<option value="${escapeHtml(item.city)}" label="${escapeHtml(item.province)}"></option>`).join("")}
          </datalist>
        </div>
        <label class="input-group provider-field-wide">
          <span>Resumen profesional</span>
          <textarea name="providerProfessionalSummary" maxlength="600" rows="3" placeholder="Conta tu especialidad, alcance, experiencia y como coordinas el servicio sin prometer resultados">${escapeHtml(detail?.professional_summary ?? "")}</textarea>
        </label>
        <div class="provider-ai-description-tools">
          <button class="btn-secondary" data-provider-business-action="improve-provider-description" type="button">Mejorar con MIMI</button>
          <div class="provider-description-suggestion" id="providerDescriptionSuggestion" hidden></div>
        </div>
        <input name="maxHoursPerService" type="hidden" value="${escapeHtml(String(detail?.max_hours_per_service ?? 8))}">
          <div class="provider-wizard-nav">
            <button class="btn-secondary" data-provider-business-action="provider-setup-prev" type="button">Atras</button>
            <button class="btn-primary" data-provider-business-action="provider-setup-next" type="button">Siguiente</button>
          </div>
        </section>

        <section class="provider-step-card" data-provider-setup-step="3">
          <div class="block-header compact">
            <div>
              <span class="eyebrow">Etapa 3</span>
              <h3>Oficio o profesion sugerida</h3>
              <p class="muted">Podes elegir mas de una categoria si ofreces varios servicios.</p>
            </div>
          </div>
          <div class="provider-editor-grid provider-category-editor-grid">
            ${categories
              .map((category) => {
                const current = pricingByCategory.get(category.id);
                const filtered = selectedCategoryIds.size && !selectedCategoryIds.has(category.id);

                return `
                  <article class="provider-editor-card ${filtered ? "is-filtered-out" : ""}" data-category-editor-card data-category-id="${escapeHtml(category.id)}">
                    <label class="provider-check-item">
                      <input type="checkbox" name="categoryActive:${escapeHtml(category.id)}" ${selectedCategoryIds.has(category.id) || current ? "checked" : ""}>
                      <span>${escapeHtml(category.name)}</span>
                    </label>
                    <label class="input-group">
                      <span>Precio por hora</span>
                      <input name="price:${escapeHtml(category.id)}" type="number" min="0" step="100" value="${escapeHtml(String(current?.price_per_hour ?? ""))}" placeholder="0">
                    </label>
                    <div class="provider-inline-fields">
                      <label class="input-group">
                        <span>Min</span>
                        <input name="min:${escapeHtml(category.id)}" type="number" min="1" max="12" value="${escapeHtml(String(current?.minimum_hours ?? 1))}">
                      </label>
                      <label class="input-group">
                        <span>Max</span>
                        <input name="max:${escapeHtml(category.id)}" type="number" min="1" max="12" value="${escapeHtml(String(current?.maximum_hours ?? detail?.max_hours_per_service ?? 8))}">
                      </label>
                    </div>
                  </article>
                `;
              })
              .join("")}
          </div>
          <div class="provider-wizard-nav">
            <button class="btn-secondary" data-provider-business-action="provider-setup-prev" type="button">Atras</button>
            <button class="btn-primary" data-provider-business-action="provider-setup-next" type="button">Siguiente</button>
          </div>
        </section>

        <section class="provider-step-card" data-provider-setup-step="4">
          <div class="block-header compact">
            <div>
              <span class="eyebrow">Etapa 4</span>
              <h3>Que vendes y como lo cobras</h3>
              <p class="muted">MIMI solo facilita la conexion. Vos definis si cobras por hora, visita, trabajo, sesion, unidad o metro, y si atendes online, presencial o mixto.</p>
            </div>
          </div>
          <div class="provider-editor-grid">
            ${[...offerings, null]
              .map((offering, index) => renderOfferingEditorV2(offering, index, offeringCategories, { addonsEnabled }))
              .join("")}
          </div>
          <div class="provider-wizard-nav">
            <button class="btn-secondary" data-provider-business-action="provider-setup-prev" type="button">Atras</button>
            <button class="btn-primary" data-provider-business-action="provider-setup-next" type="button">Siguiente</button>
          </div>
        </section>

        <section class="provider-step-card provider-optional-media" data-provider-setup-step="5">
          <span class="eyebrow">Etapa 5: fotos o ejemplos opcionales</span>
          <h3>Mostra tu trabajo si queres</h3>
          <p class="muted">Este paso es opcional. Podes cargar ejemplos mas adelante; no bloquea la configuracion del oficio.</p>
          <input type="file" name="providerExamples" accept="image/*" multiple>
          <div class="provider-wizard-nav">
            <button class="btn-secondary" data-provider-business-action="provider-setup-prev" type="button">Atras</button>
            <button class="btn-primary" data-provider-business-action="provider-setup-next" type="button">Siguiente</button>
          </div>
        </section>

        <section class="provider-step-card provider-review-card" data-provider-setup-step="6">
          <span class="eyebrow">Etapa 6: revision final</span>
          <h3>Revisa antes de publicar</h3>
          <p class="muted">Confirma que el rubro, la descripcion, la zona y el precio representan lo que realmente ofreces. MIMI facilita la conexion entre partes; no contrata, no certifica y no garantiza servicios.</p>
          <div class="provider-profile-quality provider-insight-card">
            <div>
              <span class="eyebrow">Estado de tu perfil</span>
              <h3>${escapeHtml(quality.label)}</h3>
              <p class="muted">Esto solo lo ves vos. Sirve para saber si falta informacion para que tu perfil se entienda mejor.</p>
            </div>
            <strong>${quality.score}%</strong>
            ${quality.tips.length ? `<ul>${quality.tips.map((tip) => `<li>${escapeHtml(tip)}</li>`).join("")}</ul>` : ""}
          </div>
          <div class="provider-wizard-nav">
            <button class="btn-secondary" data-provider-business-action="provider-setup-prev" type="button">Atras</button>
            <button class="btn-primary" data-provider-business-action="provider-setup-next" type="button">Siguiente</button>
          </div>
        </section>

        <section class="provider-step-card provider-final-step" data-provider-setup-step="7">
          <span class="eyebrow">Etapa 7: terminos</span>
          <h3>Ultimo paso</h3>
          <label class="provider-check-item provider-terms-box">
            <input name="providerTermsAccepted" type="checkbox" required>
            <span>Acepto los <a href="../terminos.html" target="_blank" rel="noopener">Terminos y Condiciones para prestadores</a> y la Politica de Privacidad. Entiendo que MIMI es una plataforma tecnologica intermediaria.</span>
          </label>
          <div class="provider-wizard-nav">
            <button class="btn-secondary" data-provider-business-action="provider-setup-prev" type="button">Atras</button>
            <button class="btn-primary provider-save-button" type="submit">Guardar y publicar mi servicio</button>
          </div>
        </section>
      </form>

      ${renderOfferingsSummary(offerings)}
    </section>
  `;
}

function renderProviderTrust(state) {
  const container = document.getElementById("providerTrustPanel");
  if (!container) return;

  const business = state.provider.business ?? {};
  const documents = business.documents ?? [];
  const reviews = business.reviews ?? [];
  const profile = state.provider.profile ?? null;

  const isApproved = Boolean(profile?.approved);
  const isBlocked = Boolean(profile?.blocked);
  const documentsByType = new Map();
  for (const doc of documents) {
    const type = String(doc.document_type ?? "").toLowerCase();
    if (!type) continue;
    const existing = documentsByType.get(type);
    if (!existing || new Date(doc.created_at ?? 0) > new Date(existing.created_at ?? 0)) {
      documentsByType.set(type, doc);
    }
  }

  const requiredDocs = [
    ["dni_front", "DNI frente", "Necesario para confirmar tu identidad."],
    ["dni_back", "DNI dorso", "Tiene que verse claro y completo."],
    ["selfie", "Selfie", "Nos ayuda a validar que sos la persona del DNI."]
  ];
  const conditionalDocs = [
    ["criminal_record_certificate", "Certificado de antecedentes", "Puede pedirse según rubro o etapa de habilitación."],
    ["professional_license", "Matrícula profesional", "Solo si tu oficio requiere matrícula o habilitación."],
    ["degree_certificate", "Título o constancia", "Opcional si querés respaldar tu especialidad."],
    ["address_proof", "Comprobante de domicilio", "Puede ayudar a validar tu zona de cobertura."]
  ];
  const normalizeDocStatus = (doc) => String(doc?.review_status ?? "PENDING").toUpperCase();
  const statusMeta = (id) => {
    const doc = documentsByType.get(String(id).toLowerCase());
    if (!doc) {
      return isApproved && id !== "criminal_record_certificate"
        ? { text: "Validado", cls: "approved", helper: "Ya fue validado por el equipo MIMI." }
        : { text: "Pendiente", cls: "pending", helper: "Todavía no recibimos este documento." };
    }

    const status = normalizeDocStatus(doc);
    if (status === "APPROVED") return { text: "Aprobado", cls: "approved", helper: "Documento aprobado. No tenés que hacer nada más." };
    if (status === "REJECTED") return { text: "Observado", cls: "rejected", helper: "Revisalo y volvé a cargar una versión clara." };
    if (status === "NEEDS_RESUBMISSION") return { text: "Reenviar", cls: "rejected", helper: "Necesitamos que lo cargues nuevamente." };
    return { text: "En revisión", cls: "review", helper: "Lo recibimos y está pendiente del equipo MIMI." };
  };

  const requiredApproved = requiredDocs.filter(([id]) => statusMeta(id).cls === "approved").length;
  const requiredReceived = requiredDocs.filter(([id]) => documentsByType.has(id) || statusMeta(id).cls === "approved").length;
  const allDocDefinitions = [...requiredDocs, ...conditionalDocs];
  const observedCount = allDocDefinitions.filter(([id]) => statusMeta(id).cls === "rejected").length;
  const reviewCount = allDocDefinitions.filter(([id]) => statusMeta(id).cls === "review").length;
  const progressPct = Math.round((requiredApproved / requiredDocs.length) * 100);

  const verificationTitle = isBlocked
    ? "Cuenta bloqueada"
    : isApproved
      ? "Verificación aprobada"
      : observedCount > 0
        ? "Necesitamos corregir documentos"
        : requiredReceived > 0 || reviewCount > 0
          ? "Verificación en revisión"
          : "Completá tu verificación";

  const verificationText = isBlocked
    ? "Tu cuenta necesita revisión del equipo MIMI antes de operar."
    : isApproved
      ? "Tu cuenta está aprobada para operar cuando estés online."
      : observedCount > 0
        ? "Hay documentos observados. Reenvialos desde esta pantalla para continuar."
        : requiredReceived > 0 || reviewCount > 0
          ? "Recibimos tu información. Te avisamos si falta algo o si algún archivo necesita corrección."
          : "Empezá por identidad. Los documentos profesionales se piden solo si corresponden a tu servicio.";

  const renderDocCard = ([id, title, note]) => {
    const current = documentsByType.get(id);
    const meta = statusMeta(id);
    const status = normalizeDocStatus(current);
    const hasDocument = Boolean(current);
    const canUpload = meta.cls !== "approved" && (!hasDocument || ["REJECTED", "NEEDS_RESUBMISSION"].includes(status));
    const isLocked = !canUpload;
    const cardClass =
      meta.cls === "approved" ? "is-approved"
      : meta.cls === "rejected" ? "is-rejected"
      : meta.cls === "review" ? "is-review"
      : "";
    const approvedCompact = meta.cls === "approved" ? " is-approved-compact" : "";
    const lockedClass = isLocked ? " is-document-locked" : "";
    const lockedCopy = isLocked && meta.cls !== "approved"
      ? `<small class="doc-lock-copy">Ya recibimos este documento. Si el admin pide reenviarlo, se habilitan los botones.</small>`
      : "";
    const approvedCopy = meta.cls === "approved"
      ? `<small class="doc-approved-copy">Aprobado y bloqueado. No necesitás subir otro archivo.</small>`
      : "";
    const actions = canUpload
      ? `
        <div class="doc-actions-inline--wizard">
          <button type="button" class="doc-camera-btn" data-camera="${id}">Sacar foto</button>
          <button type="button" class="doc-upload-btn" data-upload="${id}">Subir archivo</button>
          <input type="file" class="hidden-input" data-input="${id}" accept="image/*,application/pdf" />
        </div>
      `
      : "";

    return `
      <div class="doc-wizard-card ${cardClass}${approvedCompact}${lockedClass}" data-doc="${id}" data-document-locked="${isLocked ? "true" : "false"}">
        <div class="doc-wizard-card__content">
          <div class="doc-card-heading">
            <h3>${escapeHtml(title)}</h3>
            <span class="doc-status-pill" data-status="${escapeHtml(meta.cls)}">${escapeHtml(meta.text)}</span>
          </div>
          ${meta.cls === "approved" ? "" : `<p>${escapeHtml(note)}</p>`}
          <small>${escapeHtml(meta.helper)}</small>
          ${approvedCopy}
          ${lockedCopy}
        </div>

        ${meta.cls === "approved" ? "" : `<div class="doc-preview" id="preview-${id}"></div>`}
        ${actions}

        <div class="doc-status" id="status-${id}"></div>
      </div>
    `;
  };

  const uploadFormHtml = state.session.providerId
    ? `
    <div class="doc-wizard-shell">

      <div class="doc-wizard-progress">
        <div>
          <strong>Documentos principales</strong>
          <span>${requiredApproved} de ${requiredDocs.length} aprobados</span>
        </div>
        <div class="docs-progress-bar">
          <div class="docs-progress-bar__fill" id="docProgressBar" style="width: ${progressPct}%"></div>
        </div>
      </div>

      <section class="doc-group">
        <div class="doc-group-header">
          <span>Paso 1</span>
          <h4>Identidad</h4>
        </div>
        ${requiredDocs.map(renderDocCard).join("")}
      </section>

      <section class="doc-group">
        <div class="doc-group-header">
          <span>Paso 2</span>
          <h4>Habilitación si corresponde</h4>
        </div>
        ${conditionalDocs.map(renderDocCard).join("")}
      </section>

    </div>
    `
    : `
    <div class="summary-card">
      <strong>Ingresá con Google</strong>
      <span class="muted">Necesitás una sesión de prestador.</span>
    </div>
    `;

  const recentReviewScores = reviews
    .map((review) => Number(review.stars ?? review.rating ?? 0))
    .filter((rating) => Number.isFinite(rating) && rating > 0);
  const recentReviewCount = recentReviewScores.length;
  const totalReviewCount = Number(profile?.rating_count ?? state.provider.reviewSummary?.count ?? recentReviewCount);
  const completedServices = Number(state.provider.stats?.completedServices ?? 0);
  const fallbackAverage = Number(profile?.rating_avg ?? state.provider.stats?.rating ?? 0);
  const recentReviewAverage = recentReviewCount
    ? Number((recentReviewScores.reduce((sum, rating) => sum + rating, 0) / recentReviewCount).toFixed(1))
    : Number(fallbackAverage.toFixed?.(1) ?? fallbackAverage);
  const recentReviewPercent = recentReviewAverage > 0
    ? Math.max(0, Math.min(100, Math.round((recentReviewAverage / 5) * 100)))
    : 0;
  const reviewsHtml = recentReviewCount || totalReviewCount
    ? `
      <section class="account-section">
        <h3>Reputacion</h3>
        <article class="account-review-summary-card">
          <div class="account-review-summary-main">
            <span class="account-review-stars" aria-hidden="true">&#9733;&#9733;&#9733;&#9733;&#9733;</span>
            <strong>${escapeHtml(recentReviewAverage ? recentReviewAverage.toFixed(1) : "0.0")} / 5</strong>
            <small>${recentReviewCount ? `Promedio de las ultimas ${recentReviewCount} resenas` : "Promedio general de tu perfil"}</small>
          </div>
          <div class="account-review-percent">
            <strong>${recentReviewPercent}%</strong>
            <span>promedio</span>
          </div>
          <div class="account-review-summary-metrics">
            <span><b>${totalReviewCount || recentReviewCount}</b><small>calificaciones</small></span>
            <span><b>${completedServices || totalReviewCount || recentReviewCount}</b><small>servicios</small></span>
          </div>
        </article>
      </section>
    `
    : "";

  container.innerHTML = `
    <section class="provider-stack provider-onboarding-shell">
      <article class="provider-verification-card">
        <span class="verification-kicker">Estado de verificación</span>
        <h3>${escapeHtml(verificationTitle)}</h3>
        <p>${escapeHtml(verificationText)}</p>
        <div class="verification-state-grid">
          <span><strong>${requiredReceived}</strong> recibidos</span>
          <span><strong>${reviewCount}</strong> en revisión</span>
          <span><strong>${observedCount}</strong> observados</span>
        </div>
        ${uploadFormHtml}
      </article>
      ${reviewsHtml}
    </section>
  `;
}
export function renderNotifications(state) {
  const items = Array.isArray(state.notifications.items)
    ? state.notifications.items
    : [];
  const unread = items.filter((item) => !item.read_at).length;

  setBadgeCount("notificationsCount", unread);

  const html = items.length
    ? items
        .map(
          (item) => `
            <article class="notification-card">
              <strong>${escapeHtml(item.title ?? "Notificación")}</strong>
              <p class="muted">${escapeHtml(item.body ?? "")}</p>
              <span class="muted">${escapeHtml(formatDate(item.created_at))}</span>
            </article>
          `
        )
        .join("")
    : `
      <div class="summary-card">
        <strong>Sin notificaciones</strong>
        <span class="muted">Las novedades operativas van a aparecer acá.</span>
      </div>
    `;

  const notificationsList = document.getElementById("notificationsList");
  const notificationsDrawerBody = document.getElementById("notificationsDrawerBody");

  if (notificationsList) notificationsList.innerHTML = html;
  if (notificationsDrawerBody) notificationsDrawerBody.innerHTML = html;
}

export function renderChat(state) {
  const messages = Array.isArray(state.chat.messages)
    ? state.chat.messages
    : [];

  setBadgeCount("chatUnreadCount", state.chat.unreadCount ?? 0);

  const chatMessages = document.getElementById("chatMessages");
  if (!chatMessages) return;

  chatMessages.innerHTML = messages.length
    ? messages
        .map(
          (message) => `
            <article class="message-bubble ${
              message.sender_user_id === state.session.userId ||
              message.sender_user_id === "self"
                ? "is-own"
                : ""
            }">
              <strong>${
                message.sender_user_id === state.session.userId ||
                message.sender_user_id === "self"
                  ? "Vos"
                  : "Cliente"
              }</strong>
              <p>${escapeHtml(message.body ?? "")}</p>
              <span class="muted">${escapeHtml(formatDate(message.created_at))}</span>
            </article>
          `
        )
        .join("")
    : `
      <div class="summary-card">
        <strong>Chat listo</strong>
        <span class="muted">Los mensajes del servicio van a aparecer acá en tiempo real.</span>
      </div>
    `;
}

function renderMapStatus(state) {
  const mapStatus = document.getElementById("mapStatus");
  if (!mapStatus) return;

  const activeService = state.provider.activeService;
  const providerStatus = state.provider.profile?.status ?? state.provider.status;
  const hasProviderPosition =
    Number.isFinite(Number(state.tracking.providerPosition?.lat)) &&
    Number.isFinite(Number(state.tracking.providerPosition?.lng));

  if (activeService) {
    mapStatus.textContent = stateLabels[activeService.status] ?? activeService.status;
    return;
  }

  if (providerStatus === "ONLINE_IDLE" && hasProviderPosition) {
    mapStatus.textContent = "Online con ubicación visible";
    return;
  }

  mapStatus.textContent = hasProviderPosition
    ? "Ubicación registrada"
    : "Esperando actividad";
}

export function renderProviderScreen(state) {
  renderStatusBanner(state);
  renderAuth(state);
  renderProviderStats(state);
  renderProviderDashboard(state);
  renderOffersList(state);
  renderProviderActiveService(state);
  renderProviderProfile(state);
  renderProviderBusiness(state);
  renderProviderTrust(state);
  renderNotifications(state);
  renderChat(state);
  renderMapStatus(state);
}
