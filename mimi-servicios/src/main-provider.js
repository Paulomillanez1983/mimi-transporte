import { appConfig } from "./config.js";
import { initMap, updateProviderMap } from "./services/map.js";
import {
  bootstrapSession,
  loadActiveRequest,
  loadConversationForRequest,
  loadMessages,
  loadNotifications,
  loadOffers,
  loadProviderWorkspace,
  registerDevice,
  saveProviderWorkspace,
  sendMessage,
  trackLocation,
  updateProviderStatus,
  updateRequestStatus,
  uploadProviderDocument
} from "./services/service-api.js";
import { subscribeToProviderRealtime } from "./services/realtime.js";
import { playNotificationSound } from "./services/sound.js";
import {
  hasSupabaseEnv,
  redirectAfterLoginByRole,
  signInWithGoogle,
  signOut,
  subscribeToAuthChanges
} from "./services/supabase.js";
import {
  patchState,
  setActiveMode,
  setState,
  state,
  subscribe
} from "./state/app-state.js";
import { renderProviderScreen } from "./ui/render-provider.js";

let realtimeSubscription = null;
let authSubscription = null;
let providerTrackingIntervalId = null;
let providerTrackingInFlight = false;
let presenceTimer = null;
let presenceInFlight = false;

function currentConversationId() {
  return state.provider.activeService?.conversation_id ?? null;
}

function currentRequestId() {
  return state.provider.activeService?.request_id ?? state.provider.activeService?.id ?? null;
}

function setInfo(message, error = null) {
  setState((draft) => {
    draft.meta.info = message || null;
    draft.meta.error = error;
  });
}

function normalizeAuthError(error, fallbackMessage) {
  if (error?.code === "AUTH_REQUIRED") {
    return "Necesitás iniciar sesión con Google para continuar.";
  }

  return error?.message || fallbackMessage;
}

function toggleDrawer(id, force) {
  const drawer = document.getElementById(id);
  if (!drawer) return;

  const open = force ?? !drawer.classList.contains("is-open");

  if (!open && drawer.contains(document.activeElement)) {
    const fallbackButton =
      id === "notificationsDrawer"
        ? document.getElementById("notificationsButton")
        : id === "chatDrawer"
          ? document.getElementById("chatButton")
          : null;

    fallbackButton?.focus();
  }

  drawer.classList.toggle("is-open", open);
  drawer.setAttribute("aria-hidden", String(!open));

  if (open) {
    drawer.removeAttribute("inert");
  } else {
    drawer.setAttribute("inert", "");
  }
}

function buildDeviceId() {
  let deviceId = localStorage.getItem("mimi_services_device_id");

  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem("mimi_services_device_id", deviceId);
  }

  return deviceId;
}

async function registerCurrentDevice() {
  if (!state.session.userId) return;

  try {
    await registerDevice(null);
  } catch (error) {
    console.warn("[MIMI Servicios] No se pudo registrar el dispositivo:", error);
  }
}
async function getCurrentCoords() {
  if (!navigator.geolocation) {
    throw new Error("Tu dispositivo no soporta geolocalización.");
  }

  const position = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 15000
    });
  });

  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: position.coords.accuracy,
    heading: position.coords.heading,
    speed: position.coords.speed
  };
}

function updateProviderMapFromState() {
  updateProviderMap({
    providerPosition: state.tracking.providerPosition,
    servicePosition: state.tracking.clientPosition
  });
}

function isTrackableServiceStatus(status) {
  return ["PROVIDER_EN_ROUTE", "PROVIDER_ARRIVED", "IN_PROGRESS"].includes(status);
}

function syncWorkspaceIntoState(workspace) {
  const documents = workspace.documents ?? [];
  const reviews = workspace.reviews ?? [];
  const categories = workspace.categories ?? [];
  const profile = workspace.profile ?? null;

  const documentsSummary = documents.reduce(
    (acc, item) => {
      const status = String(item.review_status ?? "PENDING").toUpperCase();

      if (status === "APPROVED") acc.approved += 1;
      else if (status === "REJECTED" || status === "NEEDS_RESUBMISSION") {
        acc.observed += 1;
      } else {
        acc.pending += 1;
      }

      return acc;
    },
    { approved: 0, pending: 0, observed: 0 }
  );

  const reviewAverage = reviews.length
    ? reviews.reduce((sum, item) => sum + Number(item.rating ?? 0), 0) / reviews.length
    : Number(profile?.rating_avg ?? state.provider.stats.rating ?? 5);

  setState((draft) => {
    draft.provider.profile = profile;
    draft.provider.business.profile = workspace.profileDetail ?? null;
    draft.provider.business.pricing = workspace.pricing ?? [];
    draft.provider.business.availability = workspace.availability ?? [];
    draft.provider.business.documents = documents;
    draft.provider.business.reviews = reviews;
    draft.provider.business.categories = categories;
    draft.provider.categories = categories;
    draft.provider.documentsSummary = documentsSummary;
    draft.provider.reviewSummary = {
      average: reviewAverage,
      count: Number(profile?.rating_count ?? reviews.length ?? 0)
    };
    draft.provider.stats.rating = Number(profile?.rating_avg ?? draft.provider.stats.rating);
    draft.provider.stats.completed = workspace.completedCount ?? draft.provider.stats.completed;
    draft.provider.status = profile?.status ?? draft.provider.status;
    draft.provider.availability.isOnline =
      (profile?.status ?? draft.provider.status) === "ONLINE_IDLE";
    draft.provider.availability.lastSeenAt =
      profile?.last_seen_at ?? draft.provider.availability.lastSeenAt;

    if (
      Number.isFinite(Number(profile?.last_lat)) &&
      Number.isFinite(Number(profile?.last_lng))
    ) {
      draft.tracking.providerPosition = {
        lat: Number(profile.last_lat),
        lng: Number(profile.last_lng)
      };
      draft.provider.availability.locationLabel =
        profile.last_location ?? "Ubicación actualizada";
    }
  });
}

async function refreshNotifications() {
  const notifications = await loadNotifications(state.session.userId);

  setState((draft) => {
    draft.notifications.items = notifications ?? [];
    draft.notifications.unreadCount = (notifications ?? []).filter(
      (item) => !item.read_at
    ).length;
  });
}

async function refreshOffers() {
  const offers = await loadOffers(state.session.providerId);

  setState((draft) => {
    draft.provider.offers = offers ?? [];
    draft.provider.stats.offers = offers?.length ?? 0;
    draft.provider.offerDeadlineAt = offers?.[0]?.expires_at ?? null;
  });
}

async function refreshWorkspace() {
  const workspace = state.session.providerId
    ? await loadProviderWorkspace(state.session.providerId)
    : {
        profile: null,
        profileDetail: null,
        pricing: [],
        availability: [],
        documents: [],
        reviews: [],
        categories: [],
        completedCount: 0
      };

  syncWorkspaceIntoState(workspace);
}

async function hydrateLiveContext(activeRequestOverride) {
  const activeRequest =
    activeRequestOverride ??
    (await loadActiveRequest({
      userId: null,
      providerId: state.session.providerId
    }));

  const conversation = activeRequest?.id
    ? await loadConversationForRequest(activeRequest.id)
    : null;

  const messages = conversation?.id
    ? await loadMessages(conversation.id)
    : [];

  setState((draft) => {
    draft.provider.activeService = activeRequest
      ? {
          ...draft.provider.activeService,
          ...activeRequest,
          request_id: activeRequest.request_id ?? activeRequest.id,
          conversation_id:
            conversation?.id ??
            draft.provider.activeService?.conversation_id ??
            null
        }
      : null;

    draft.chat.messages = messages;
    draft.chat.unreadCount = messages.filter(
      (message) =>
        !message.read_at && message.sender_user_id !== draft.session.userId
    ).length;

    if (activeRequest?.service_lat && activeRequest?.service_lng) {
      draft.tracking.clientPosition = {
        lat: activeRequest.service_lat,
        lng: activeRequest.service_lng
      };
    } else if (!activeRequest) {
      draft.tracking.clientPosition = null;
    }
  });

  updateProviderMapFromState();
  setupRealtime(currentRequestId(), conversation?.id ?? null);
}

async function syncProviderPresence(reason = "presence") {
  const status = state.provider.profile?.status ?? state.provider.status;
  const active = state.provider.activeService;
  const shouldTrackPresence = status === "ONLINE_IDLE" || Boolean(active);

  if (!shouldTrackPresence || presenceInFlight) return;

  presenceInFlight = true;

  try {
    const coords = await getCurrentCoords();

    setState((draft) => {
      draft.tracking.providerPosition = {
        lat: coords.lat,
        lng: coords.lng
      };
      draft.provider.availability.lastSeenAt = new Date().toISOString();
      draft.provider.availability.locationLabel =
        reason === "online"
          ? "Ubicación actual al entrar online"
          : "Ubicación actualizada";
    });

    updateProviderMapFromState();

    if (currentRequestId()) {
      await trackLocation({
        requestId: currentRequestId(),
        ...coords
      });
    }
  } catch (error) {
    if (reason === "online" || reason === "manual") {
      setInfo(null, normalizeAuthError(error, "No pudimos obtener tu ubicación actual."));
    }
  } finally {
    presenceInFlight = false;
  }
}

function stopProviderPresenceLoop() {
  if (presenceTimer) {
    window.clearInterval(presenceTimer);
    presenceTimer = null;
  }
}

function startProviderPresenceLoop() {
  stopProviderPresenceLoop();

  if (!navigator.geolocation) return;

  presenceTimer = window.setInterval(() => {
    void syncProviderPresence();
  }, appConfig.providerPresenceIntervalMs ?? 15000);
}

function stopProviderTrackingLoop() {
  if (providerTrackingIntervalId) {
    window.clearInterval(providerTrackingIntervalId);
    providerTrackingIntervalId = null;
  }
}

function startProviderTrackingLoop() {
  stopProviderTrackingLoop();

  if (!navigator.geolocation) return;

  providerTrackingIntervalId = window.setInterval(async () => {
    const active = state.provider.activeService;
    if (!active || !isTrackableServiceStatus(active.status)) return;
    if (providerTrackingInFlight) return;

    providerTrackingInFlight = true;

    try {
      const coords = await getCurrentCoords();

      const payload = {
        requestId: active.request_id ?? active.id,
        ...coords
      };

      setState((draft) => {
        draft.tracking.providerPosition = {
          lat: payload.lat,
          lng: payload.lng
        };
        draft.provider.availability.lastSeenAt = new Date().toISOString();
        draft.provider.availability.locationLabel = "Ubicación actualizada en servicio";
      });

      updateProviderMapFromState();

      try {
        await trackLocation(payload);
      } catch {
        // no-op
      }
    } catch {
      // no-op
    } finally {
      providerTrackingInFlight = false;
    }
  }, 12000);
}

async function bootstrapAsyncData() {
  const session = await bootstrapSession();

  if (session.isAuthenticated && session.role !== "provider") {
    // el usuario puede existir como cliente puro; no redirigimos automáticamente
  }

  setState((draft) => {
    draft.session.userId = session.userId;
    draft.session.providerId = session.providerId;
    draft.session.role = session.role ?? "provider";
    draft.session.userEmail = session.userEmail ?? null;
    draft.session.userName = session.userName ?? null;
    draft.meta.backendMode = session.userId
      ? "supabase"
      : hasSupabaseEnv()
        ? "supabase"
        : "mock";
    draft.provider.status = draft.provider.status || "OFFLINE";
  });

  await Promise.all([
    refreshNotifications(),
    refreshOffers(),
    refreshWorkspace()
  ]);

  await hydrateLiveContext();
  await registerCurrentDevice();
  await syncProviderPresence("bootstrap");

  if (!hasSupabaseEnv()) {
    setInfo(
      "La app está funcionando en modo demo local. Cuando cargues las credenciales, se conecta al backend real."
    );
  } else if (!session.userId) {
    setInfo("Ingresá con Google para operar como prestador.");
  } else {
    setInfo("Sesión iniciada correctamente.");
  }
}

function registerInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    patchState("ui.installPromptEvent", event);
  });

  document.getElementById("installButton")?.addEventListener("click", async () => {
    const promptEvent = state.ui.installPromptEvent;
    if (!promptEvent) return;

    await promptEvent.prompt();
  });
}

async function handleAuthPrimary() {
  if (!hasSupabaseEnv()) {
    setInfo(
      "Entraste en modo demo. Cuando cargues tus claves de Supabase se habilita el flujo real."
    );
    return;
  }

  await signInWithGoogle();
}

async function handleOfferAction(action, offerId) {
  await updateRequestStatus(appConfig.functions.providerRespondOffer, {
    offer_id: offerId,
    action: action === "accept" ? "ACCEPT" : "REJECT"
  });

  setInfo(
    action === "accept"
      ? "Oferta aceptada correctamente."
      : "Oferta rechazada."
  );

  await Promise.all([
    refreshOffers(),
    hydrateLiveContext()
  ]);
}

async function handleProviderStatusChange(status) {
  if (status === "ONLINE_IDLE" && !state.provider.profile?.approved) {
    patchState("provider.status", "OFFLINE");
    document.getElementById("providerTrustPanel")?.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
    setInfo(
      "Para ponerte online primero tenés que completar la verificación y esperar aprobación."
    );
    return;
  }

  patchState("provider.status", status);

  const profile = await updateProviderStatus(state.session.providerId, status);
  if (!profile) return;

  setState((draft) => {
    draft.provider.profile = {
      ...draft.provider.profile,
      ...profile
    };
    draft.provider.status = profile.status ?? status;
    draft.provider.stats.rating =
      profile.rating_avg ?? draft.provider.stats.rating;
    draft.provider.availability.isOnline =
      (profile.status ?? status) === "ONLINE_IDLE";
    draft.provider.availability.lastSeenAt =
      profile.last_seen_at ?? new Date().toISOString();

    if (
      Number.isFinite(Number(profile.last_lat)) &&
      Number.isFinite(Number(profile.last_lng))
    ) {
      draft.tracking.providerPosition = {
        lat: Number(profile.last_lat),
        lng: Number(profile.last_lng)
      };
      draft.provider.availability.locationLabel =
        profile.last_location ?? "Ubicación actualizada";
    }
  });

  updateProviderMapFromState();

  if (status === "ONLINE_IDLE") {
    await syncProviderPresence("online");
    setInfo("Estás online y tu ubicación quedó marcada en el mapa.");
  } else {
    setInfo("Estado operativo actualizado.");
  }
}

async function handleProviderFlow(action) {
  if (action === "chat") {
    toggleDrawer("chatDrawer", true);
    return;
  }

  const nextStatuses = {
    "en-route": "PROVIDER_EN_ROUTE",
    arrived: "PROVIDER_ARRIVED",
    start: "IN_PROGRESS",
    complete: "COMPLETED"
  };

  const functionName = {
    "en-route": appConfig.functions.providerEnRoute,
    arrived: appConfig.functions.providerArrived,
    start: appConfig.functions.startService,
    complete: appConfig.functions.completeService
  }[action];

  if (!functionName) return;

  await updateRequestStatus(functionName, {
    request_id: currentRequestId()
  });

  setState((draft) => {
    if (draft.provider.activeService) {
      draft.provider.activeService.status = nextStatuses[action];
    }
    draft.meta.info = "Estado del servicio actualizado.";
  });

  await hydrateLiveContext();
  await syncProviderPresence(action);
  setInfo("Estado del servicio actualizado.");
}

async function handleBusinessAction(action) {
  if (action === "refresh-location") {
    await syncProviderPresence("manual");
    setInfo("Ubicación refrescada.");
    return;
  }

  if (action === "refresh-workspace") {
    await Promise.all([
      refreshWorkspace(),
      refreshOffers(),
      hydrateLiveContext()
    ]);
    setInfo("Panel operativo refrescado.");
    return;
  }

  if (action === "focus-map") {
    document.getElementById("trackingMap")?.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }
}

async function handleProviderDocumentSubmit(event) {
  event.preventDefault();

  if (!state.session.providerId) {
    setInfo(null, "Necesitás iniciar sesión como prestador para subir documentos.");
    return;
  }

  const form = event.currentTarget;
  const formData = new FormData(form);
  const documentType = formData.get("providerDocumentType");
  const file = formData.get("providerDocumentFile");

  if (!(file instanceof File) || !file.size) {
    setInfo(null, "Seleccioná una foto o PDF para subir.");
    return;
  }

  const submitButton = form.querySelector("button[type='submit']");
  submitButton?.setAttribute("disabled", "");

  try {
    await uploadProviderDocument({
      providerId: state.session.providerId,
      documentType,
      file
    });

    form.reset();
    await refreshWorkspace();
    setInfo("Documento cargado correctamente. Quedó pendiente de revisión.");
  } finally {
    submitButton?.removeAttribute("disabled");
  }
}

async function handleBusinessFormSubmit(event) {
  event.preventDefault();

  if (!state.session.providerId) return;

  const form = event.currentTarget;
  const formData = new FormData(form);
  const categories = Array.isArray(appConfig.categories) ? appConfig.categories : [];

  const pricing = categories
    .map((category) => ({
      categoryId: category.id,
      active: formData.get(`categoryActive:${category.id}`) === "on",
      pricePerHour: Number(formData.get(`price:${category.id}`) || 0),
      minimumHours: Number(formData.get(`min:${category.id}`) || 1),
      maximumHours: Number(
        formData.get(`max:${category.id}`) ||
          formData.get("maxHoursPerService") ||
          8
      ),
      currency: "ARS"
    }))
    .filter((item) => item.active && item.pricePerHour > 0);

  const selectedCategories = pricing.map((item) => ({
    categoryId: item.categoryId
  }));

  const availability = Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    active: formData.get(`dayActive:${dayOfWeek}`) === "on",
    startTime: formData.get(`dayStart:${dayOfWeek}`) || null,
    endTime: formData.get(`dayEnd:${dayOfWeek}`) || null
  })).filter((item) => item.active && item.startTime && item.endTime);

  await saveProviderWorkspace(state.session.providerId, {
    bio: formData.get("providerBio") || "",
    city: formData.get("providerCity") || "",
    province: formData.get("providerProvince") || "",
    addressText: formData.get("providerAddressText") || "",
    pricingMode: formData.get("pricingMode") || "POR_HORA",
    maxHoursPerService: Number(formData.get("maxHoursPerService") || 8),
    acceptsImmediate: formData.get("acceptsImmediate") === "on",
    acceptsScheduled: formData.get("acceptsScheduled") === "on",
    categories: selectedCategories,
    pricing,
    availability
  });

  await refreshWorkspace();
  setInfo("Tarifas, disponibilidad y perfil comercial actualizados.");
}

function bindBasicControls() {
document.addEventListener("change", async (e) => {

  // 🔹 NUEVO: wizard onboarding
if (e.target.dataset.input) {
  if (uploading) return;
  uploading = true;

  const file = e.target.files[0];
  if (!file) {
    uploading = false;
    return;
  }

  const docType = e.target.dataset.input;

  const preview = document.getElementById(`preview-${docType}`);
  const status = document.getElementById(`status-${docType}`);

  const reader = new FileReader();
  reader.onload = () => {
    if (preview) {
      preview.innerHTML = `<img src="${reader.result}" />`;
      preview.classList.add("visible");
    }
  };
  reader.readAsDataURL(file);

  if (status) {
    status.textContent = "Subiendo...";
    status.className = "doc-status pending";
  }

  try {
    await uploadProviderDocument({
      providerId: state.session.providerId,
      documentType: docType,
      file
    });

    if (status) {
      status.textContent = "✅ Subido";
      status.className = "doc-status ok";
    }

    updateProgress();

  } catch {
    if (status) {
      status.textContent = "❌ Error";
      status.className = "doc-status error";
    }
  } finally {
    uploading = false;
  }

  return;
}
  // 🔹 LEGACY
  if (e.target?.name !== "providerDocumentFile") return;

  const file = e.target.files?.[0] ?? null;
  const preview = document.getElementById("providerDocumentPreview");
  if (!preview) return;

  preview.textContent = file
    ? `${file.name} · ${Math.max(1, Math.round(file.size / 1024))} KB`
    : "Todavía no seleccionaste archivo.";
});
  document.getElementById("authPrimaryButton")?.addEventListener("click", async () => {
    try {
      await handleAuthPrimary();
    } catch (error) {
      setInfo(null, normalizeAuthError(error, "No se pudo iniciar sesión."));
    }
  });

  document.getElementById("authSecondaryButton")?.addEventListener("click", async () => {
    try {
      await signOut();
      window.location.reload();
    } catch (error) {
      setInfo(null, normalizeAuthError(error, "No se pudo cerrar la sesión."));
    }
  });
document.addEventListener("click", (e) => {
  const cam = e.target.closest("[data-camera]");
  if (cam) {
    openCamera(cam.dataset.camera);
    return;
  }

  const upload = e.target.closest("[data-upload]");
  if (upload) {
    document
      .querySelector(`[data-input="${upload.dataset.upload}"]`)
      ?.click();
  }
});
  document.getElementById("switchToClient")?.addEventListener("click", () => {
    setActiveMode("client");
    window.location.href = "./cliente.html";
  });

  document.getElementById("notificationsButton")?.addEventListener("click", () => {
    toggleDrawer("notificationsDrawer", true);
  });

  document.getElementById("chatButton")?.addEventListener("click", async () => {
    try {
      toggleDrawer("chatDrawer", true);

      if (!state.chat.messages.length && currentConversationId()) {
        const messages = await loadMessages(currentConversationId());
        patchState("chat.messages", messages);
        patchState("chat.unreadCount", 0);
      }
    } catch (error) {
      setInfo(null, normalizeAuthError(error, "No se pudo abrir el chat."));
    }
  });

  document.querySelectorAll("[data-close-drawer]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleDrawer(button.dataset.closeDrawer, false);
    });
  });

  document.getElementById("chatForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const input = document.getElementById("chatInput");
    const body = input?.value?.trim();
    if (!body) return;

    try {
      const message = await sendMessage({
        conversationId: currentConversationId(),
        body
      });

      setState((draft) => {
        draft.chat.messages.push(message);
        draft.chat.unreadCount = 0;
      });

      input.value = "";
    } catch (error) {
      setInfo(null, normalizeAuthError(error, "No se pudo enviar el mensaje."));
    }
  });

  document.addEventListener("submit", async (event) => {
    if (!(event.target instanceof HTMLFormElement)) return;
    if (event.target.id === "providerVerificationForm") {
      try {
        await handleProviderDocumentSubmit(event);
      } catch (error) {
        setInfo(null, normalizeAuthError(error, "No se pudo subir el documento."));
      }
      return;
    }

    if (event.target.id !== "providerBusinessForm") return;

    try {
      await handleBusinessFormSubmit(event);
    } catch (error) {
      setInfo(null, normalizeAuthError(error, "No se pudo guardar el setup comercial."));
    }
  });

  document.querySelector(".app-shell")?.addEventListener("click", async (event) => {
    try {
      const offerAction = event.target.closest("[data-offer-action]");
      if (offerAction) {
        await handleOfferAction(
          offerAction.dataset.offerAction,
          offerAction.dataset.offerId
        );
        return;
      }

      const providerStatus = event.target.closest("[data-provider-status]");
      if (providerStatus) {
        await handleProviderStatusChange(providerStatus.dataset.providerStatus);
        return;
      }

      const providerFlow = event.target.closest("[data-provider-flow]");
      if (providerFlow) {
        await handleProviderFlow(providerFlow.dataset.providerFlow);
        return;
      }

      const businessAction = event.target.closest("[data-provider-business-action]");
      if (businessAction) {
        await handleBusinessAction(businessAction.dataset.providerBusinessAction);
      }
    } catch (error) {
      setInfo(null, normalizeAuthError(error, "No se pudo completar la acción."));
    }
  });
}

function setupRealtime(
  requestId = currentRequestId(),
  conversationId = currentConversationId()
) {
  realtimeSubscription?.unsubscribe?.();
  realtimeSubscription = null;

  if (!state.session.userId) {
    return;
  }

  realtimeSubscription = subscribeToProviderRealtime({
    userId: state.session.userId,
    providerId: state.session.providerId,
    requestId,
    conversationId,
    onNotification: async ({ new: payload }) => {
      if (!payload) return;

      setState((draft) => {
        draft.notifications.items.unshift(payload);
        draft.notifications.unreadCount =
          (draft.notifications.unreadCount ?? 0) + 1;
      });

      playNotificationSound();
    },
    onMessage: ({ new: payload }) => {
      if (!payload) return;

      setState((draft) => {
        const exists = draft.chat.messages.some((msg) => msg.id === payload.id);
        if (!exists) {
          draft.chat.messages.push(payload);
        }

        if (payload.sender_user_id !== draft.session.userId) {
          draft.chat.unreadCount += 1;
        }
      });

      playNotificationSound();
    },
    onTracking: ({ new: payload }) => {
      if (!payload) return;

      setState((draft) => {
        draft.tracking.providerPosition = {
          lat: payload.lat,
          lng: payload.lng
        };
        draft.provider.availability.locationLabel =
          "Ubicación actualizada en servicio";
      });

      updateProviderMapFromState();
    },
    onRequest: ({ new: payload }) => {
      if (!payload) return;

      setState((draft) => {
        if (
          draft.provider.activeService?.id === payload.id ||
          draft.provider.activeService?.request_id === payload.id
        ) {
          draft.provider.activeService = {
            ...draft.provider.activeService,
            ...payload
          };
        }
      });
    },
    onOffer: ({ new: payload }) => {
      if (!payload) return;

      setState((draft) => {
        const exists = draft.provider.offers.some((offer) => offer.id === payload.id);
        if (!exists) {
          draft.provider.offers.unshift(payload);
          draft.provider.stats.offers = draft.provider.offers.length;
          draft.provider.offerDeadlineAt =
            payload.expires_at ?? draft.provider.offerDeadlineAt;
        }
      });

      playNotificationSound();
    }
  });
}
function updateProgress() {
  const total = 4;
  const completed = document.querySelectorAll(".doc-status.ok").length;
  const percent = (completed / total) * 100;

  const bar = document.getElementById("docProgressBar");
  if (bar) {
    bar.style.width = percent + "%";
  }
}
async function init() {
  setActiveMode("provider");

  subscribe(renderProviderScreen);
  renderProviderScreen(state);
  bindBasicControls();
  registerInstallPrompt();
  initMap("trackingMap", appConfig.mapInitialCenter, appConfig.mapInitialZoom);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => null);
  }

  await bootstrapAsyncData();

  if (window.location.hash && window.location.hash.includes("access_token")) {
    history.replaceState(
      {},
      document.title,
      window.location.pathname + window.location.search
    );
  }

  startProviderTrackingLoop();
  startProviderPresenceLoop();
  setupRealtime();
  renderProviderScreen(state);

  authSubscription =
    subscribeToAuthChanges?.(async (event, session) => {
      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session) {
        await redirectAfterLoginByRole(session);
        return;
      }

      if (event === "SIGNED_OUT") {
        setActiveMode("provider");
        window.location.href = "./prestador.html";
      }
    }) ?? null;
}

init().catch((error) => {
  setState((draft) => {
    draft.meta.error = normalizeAuthError(
      error,
      "La app cargó con fallback local. Revisá la configuración de Supabase."
    );
    draft.meta.info = null;
  });
});

window.addEventListener("beforeunload", () => {
  stopProviderTrackingLoop();
  stopProviderPresenceLoop();
  realtimeSubscription?.unsubscribe?.();
  authSubscription?.unsubscribe?.();
});
let uploading = false;

async function openCamera(docType) {
  let stream;
  let modal;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" }
    });

    modal = document.createElement("div");
    modal.className = "camera-modal";
    modal.innerHTML = `
      <div class="camera-box">
        <video autoplay playsinline></video>
        <button id="captureBtn" type="button">Capturar</button>
        <button id="cancelCamera" type="button">Cancelar</button>
      </div>
    `;

    document.body.appendChild(modal);

    const video = modal.querySelector("video");
    video.srcObject = stream;
    await video.play();

    modal.querySelector("#cancelCamera").onclick = () => {
      stream.getTracks().forEach((track) => track.stop());
      modal.remove();
    };

    modal.querySelector("#captureBtn").onclick = async () => {
      if (uploading) return;

      if (docType === "selfie") {
        try {
          const createResult = await invokeFunction("svc-create-liveness-session");
          const sessionId = createResult?.sessionId ?? createResult?.session_id;

          if (!sessionId) {
            setInfo(null, "No se pudo iniciar la validación de vida.");
            return;
          }

          const livenessResult = await invokeFunction("svc-get-liveness-result", {
            sessionId
          });

          const confidence = Number(
            livenessResult?.confidence ??
            livenessResult?.Confidence ??
            0
          );

          if (confidence < 70) {
            setInfo(null, "No pudimos validar que seas una persona real. Intentá nuevamente.");
            return;
          }
        } catch (error) {
          console.error("[MIMI Servicios] Liveness error:", error);
          setInfo(null, "Error validando vida. Intentá nuevamente.");
          return;
        }
      }

      uploading = true;

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 720;
      canvas.height = video.videoHeight || 720;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(async (blob) => {
        if (!blob) {
          uploading = false;
          setInfo(null, "No se pudo capturar la imagen.");
          return;
        }

        const file = new File([blob], `${docType}.jpg`, {
          type: "image/jpeg"
        });

        const preview = document.getElementById(`preview-${docType}`);
        const status = document.getElementById(`status-${docType}`);

        const reader = new FileReader();
        reader.onload = () => {
          if (preview) {
            preview.innerHTML = `<img src="${reader.result}" alt="Vista previa ${docType}" />`;
            preview.classList.add("visible");
          }
        };
        reader.readAsDataURL(file);

        if (status) {
          status.textContent = "Subiendo...";
          status.className = "doc-status pending";
        }

        try {
          await uploadProviderDocument({
            providerId: state.session.providerId,
            documentType: docType,
            file
          });

          if (status) {
            status.textContent = "✅ Subido";
            status.className = "doc-status ok";
          }

          updateProgress();

          stream.getTracks().forEach((track) => track.stop());
          modal.remove();
        } catch (err) {
          console.error("[MIMI Servicios] Upload doc error:", err);

          if (status) {
            status.textContent = "❌ Error";
            status.className = "doc-status error";
          }
        } finally {
          uploading = false;
        }
      }, "image/jpeg", 0.9);
    };
  } catch (err) {
    console.error(err);
    stream?.getTracks()?.forEach((track) => track.stop());
    modal?.remove();
    setInfo(null, "No pudimos abrir la cámara. Revisá permisos del navegador.");
  }
}
