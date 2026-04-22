import { appConfig } from "../config.js";
import { initMap, updateTrackingMarkers } from "./services/map.js";
import {
  bootstrapSession,
  createRequest,
  loadActiveRequest,
  loadCategories,
  loadConversationForRequest,
  loadMessages,
  loadNotifications,
  loadOffers,
  prepareRequestPricing,
  registerDevice,
  searchProviders,
  sendMessage,
  trackLocation,
  updateProviderStatus,
  updateRequestStatus,
} from "./services/service-api.js";
import { subscribeToServiceRealtime } from "./services/realtime.js";
import { playNotificationSound } from "./services/sound.js";
import {
  getSupabaseClient,
  hasSupabaseEnv,
  signInWithGoogle,
  signOut,
  subscribeToAuthChanges,
} from "./services/supabase.js";
import { patchState, setState, state, subscribe } from "./state/app-state.js";
import { renderApp } from "./ui/render.js";

function currentUserId() {
  return state.session.userId ?? appConfig.demoClientUserId ?? null;
}

function currentConversationId() {
  return state.client.activeConversationId ??
    state.client.activeRequest?.conversation_id ??
    state.provider.activeService?.conversation_id ??
    null;
}

function setInfo(message, error = null) {
  setState((draft) => {
    draft.meta.info = message || null;
    draft.meta.error = error;
  });
}

function normalizeAuthError(error, fallbackMessage) {
  if (error?.code === "AUTH_REQUIRED") {
    return "Necesitas iniciar sesion con Google para continuar.";
  }

  return error?.message || fallbackMessage;
}

function toggleDrawer(id, force) {
  const drawer = document.getElementById(id);
  if (!drawer) return;

  const open = force ?? !drawer.classList.contains("is-open");
  drawer.classList.toggle("is-open", open);
  drawer.setAttribute("aria-hidden", String(!open));
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

  const supabase = getSupabaseClient();
  if (!supabase?.auth?.getSession) return;

  try {
    const { data, error } = await supabase.auth.getSession();
    const session = data?.session ?? null;

    if (error || !session?.access_token) {
      console.warn("[registerCurrentDevice] sin sesion valida, se omite registro de dispositivo", {
        hasUserId: !!state.session.userId,
        hasSession: !!session,
        hasToken: !!session?.access_token,
        error: error?.message ?? null,
      });
      return;
    }

    await registerDevice({
      deviceId: buildDeviceId(),
      pushToken: null,
      platform: "web",
      notificationsEnabled: true,
      marketingOptIn: false,
    });
  } catch (error) {
    console.warn("[registerCurrentDevice] no se pudo registrar dispositivo", error);
  }
}
function syncDraftFromForm() {
  patchState("requestDraft.address", document.getElementById("serviceAddressInput")?.value?.trim() ?? "");
  patchState("requestDraft.lat", Number(document.getElementById("serviceLatInput")?.value || state.requestDraft.lat));
  patchState("requestDraft.lng", Number(document.getElementById("serviceLngInput")?.value || state.requestDraft.lng));
  patchState("requestDraft.requestType", document.getElementById("requestTypeSelect")?.value ?? "IMMEDIATE");
  patchState("requestDraft.scheduledFor", document.getElementById("scheduledForInput")?.value ?? "");
  patchState("requestDraft.requestedHours", Number(document.getElementById("requestedHoursInput")?.value || 2));
}

function seedForm() {
  const latInput = document.getElementById("serviceLatInput");
  const lngInput = document.getElementById("serviceLngInput");
  const requestedHoursInput = document.getElementById("requestedHoursInput");

  if (latInput) latInput.value = String(state.requestDraft.lat);
  if (lngInput) lngInput.value = String(state.requestDraft.lng);
  if (requestedHoursInput) requestedHoursInput.value = String(state.requestDraft.requestedHours);
}

function updateScheduledVisibility() {
  const wrapper = document.getElementById("scheduledForWrapper");
  if (!wrapper) return;
  wrapper.hidden = state.requestDraft.requestType !== "SCHEDULED";
}

async function hydrateLiveContext(activeRequestOverride) {
  const activeRequest = activeRequestOverride ?? await loadActiveRequest({
    userId: state.session.userId,
    providerId: state.session.providerId,
  });

  const conversation = activeRequest?.id
    ? await loadConversationForRequest(activeRequest.id)
    : null;

  const messages = conversation?.id
    ? await loadMessages(conversation.id)
    : [];

  setState((draft) => {
    draft.client.activeRequest = activeRequest
      ? {
          ...draft.client.activeRequest,
          ...activeRequest,
          conversation_id:
            conversation?.id ??
            draft.client.activeRequest?.conversation_id ??
            null,
        }
      : null;

    draft.client.activeConversationId = conversation?.id ?? null;

    if (
      draft.session.providerId &&
      activeRequest?.accepted_provider_id === draft.session.providerId
    ) {
      draft.provider.activeService = {
        ...(draft.provider.activeService ?? {}),
        ...activeRequest,
        conversation_id: conversation?.id ?? null,
      };
    } else if (!activeRequest || activeRequest.accepted_provider_id !== draft.session.providerId) {
      draft.provider.activeService = null;
    }

    draft.chat.messages = messages;
    draft.chat.unreadCount = messages.filter(
      (message) => !message.read_at && message.sender_user_id !== draft.session.userId,
    ).length;

    if (activeRequest?.service_lat && activeRequest?.service_lng) {
      draft.tracking.clientPosition = {
        lat: activeRequest.service_lat,
        lng: activeRequest.service_lng,
      };
    }
  });

  updateTrackingMarkers({
    clientPosition: state.tracking.clientPosition,
    providerPosition: state.tracking.providerPosition,
  });

  setupRealtime(activeRequest?.id ?? null, conversation?.id ?? null);
}

async function bootstrapAsyncData() {
  const session = await bootstrapSession();
  const categories = await loadCategories();

  if (Array.isArray(categories) && categories.length) {
    appConfig.categories = categories.map((category) => ({
      id: category.id,
      code: category.code,
      name: category.name,
      description: category.description,
    }));
  }

  setState((draft) => {
const envReady = hasSupabaseEnv();
const isAuthenticated = Boolean(session.userId);

draft.session.userId = session.userId ?? null;
draft.session.providerId = session.providerId ?? null;
draft.session.role = session.role ?? "guest";
draft.session.userEmail = session.userEmail ?? null;
draft.session.userName = session.userName ?? null;
draft.session.isAuthenticated = isAuthenticated;
draft.session.isGuest = envReady && !isAuthenticated;

draft.meta.backendMode = envReady ? "supabase" : "mock";
draft.ui.appEntered = envReady ? isAuthenticated : true;

if (appConfig.categories.length && !appConfig.categories.some((item) => item.id === draft.ui.selectedCategoryId)) {
  draft.ui.selectedCategoryId = appConfig.categories[0].id;
}

if (session.role === "provider") {
  draft.ui.activeMode = "provider";
} else if (!isAuthenticated) {
  draft.ui.activeMode = "client";
}
  });

  const [notifications, offers] = await Promise.all([
    loadNotifications(session.userId),
    loadOffers(session.providerId),
  ]);

  setState((draft) => {
    draft.notifications.items = notifications;
    draft.provider.offers = offers ?? [];
    draft.provider.stats.offers = offers?.length ?? 0;
  });

  await hydrateLiveContext();
  await registerCurrentDevice();

  if (!hasSupabaseEnv()) {
    setInfo("La app esta funcionando en modo demo local. Cuando cargues las credenciales, se conecta al backend real.");
  } else if (!session.userId) {
    setInfo("Ingresa con Google para ver categorias activas, buscar prestadores y usar el flujo real.");
  } else {
    setInfo("Sesion iniciada correctamente.");
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

function startProviderTrackingLoop() {
  if (!navigator.geolocation) return;

  window.setInterval(() => {
    const active = state.provider.activeService;
    if (!active) return;

    const allowed = ["PROVIDER_EN_ROUTE", "PROVIDER_ARRIVED", "IN_PROGRESS"];
    if (!allowed.includes(active.status)) return;

    navigator.geolocation.getCurrentPosition(async (position) => {
      const payload = {
        requestId: active.request_id ?? active.id,
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        heading: position.coords.heading,
        speed: position.coords.speed,
      };

      setState((draft) => {
        draft.tracking.providerPosition = {
          lat: payload.lat,
          lng: payload.lng,
        };
      });

      updateTrackingMarkers({
        clientPosition: state.tracking.clientPosition,
        providerPosition: state.tracking.providerPosition,
      });

      try {
        await trackLocation(payload);
      } catch {
        // silent
      }
    });
  }, 12000);
}

async function handleAuthPrimary() {
  const envReady = hasSupabaseEnv();

  if (!envReady) {
    patchState("ui.appEntered", true);
    patchState("session.isAuthenticated", false);
    patchState("session.isGuest", false);
    setInfo("Entraste en modo demo. Cuando cargues tus claves de Supabase se habilita el flujo real.");
    return;
  }

  await signInWithGoogle();
}
async function handleSearchSubmit(event) {
  event.preventDefault();
  syncDraftFromForm();

  const providers = await searchProviders(
    state.ui.selectedCategoryId,
    state.requestDraft,
  );

  setState((draft) => {
    draft.client.providers = providers;
    draft.meta.error = null;
    draft.meta.info = providers.length
      ? "Prestadores actualizados."
      : "No encontramos prestadores para este criterio.";
    draft.meta.lastSearchAt = new Date().toISOString();
  });
}

async function handleProviderSelection(providerId) {
  const provider = state.client.providers.find(
    (item) => item.provider_id === providerId,
  );
  if (!provider) return;

  const pricing = await prepareRequestPricing({
    clientUserId: currentUserId(),
    categoryId: state.ui.selectedCategoryId,
    providerId: provider.provider_id,
    draft: state.requestDraft,
  });

  if (!pricing?.eligible) {
    throw new Error(`No se pudo confirmar el prestador: ${pricing?.reason ?? "pricing_error"}`);
  }

  const request = await createRequest({
    categoryId: state.ui.selectedCategoryId,
    selectedProviderId: provider.provider_id,
    address: state.requestDraft.address,
    serviceLat: state.requestDraft.lat,
    serviceLng: state.requestDraft.lng,
    requestType: state.requestDraft.requestType,
    scheduledFor: state.requestDraft.scheduledFor || null,
    requestedHours: state.requestDraft.requestedHours,
    providerPrice: pricing.provider_price,
    platformFee: pricing.platform_fee,
    totalPrice: pricing.total_price,
    currency: pricing.currency,
  });

  setState((draft) => {
    draft.client.selectedProvider = provider;
    draft.client.activeRequest = {
      ...request,
      providerName: provider.full_name,
      requestType: draft.requestDraft.requestType,
      requestedHours: draft.requestDraft.requestedHours,
      total_price: pricing.total_price,
      conversation_id: request?.conversation_id ?? null,
    };
    draft.tracking.clientPosition = {
      lat: draft.requestDraft.lat,
      lng: draft.requestDraft.lng,
    };
    draft.meta.error = null;
    draft.meta.info = "Solicitud creada correctamente.";
  });

  await hydrateLiveContext(request);
}

async function handleRequestAction(action) {
  if (action !== "cancel") return;

  await updateRequestStatus(appConfig.functions.cancelRequest, {
    request_id: state.client.activeRequest?.id,
    reason: "cancelled_from_client_ui",
  });

  setState((draft) => {
    if (draft.client.activeRequest) draft.client.activeRequest.status = "CANCELLED";
    draft.meta.info = "Solicitud cancelada correctamente.";
  });

  await hydrateLiveContext();
}

async function handleOfferAction(action, offerId) {
  await updateRequestStatus(appConfig.functions.providerRespondOffer, {
    offer_id: offerId,
    action: action === "accept" ? "ACCEPT" : "REJECT",
  });

  setState((draft) => {
    draft.provider.offers = draft.provider.offers.filter((item) => item.id !== offerId);
    draft.provider.stats.offers = draft.provider.offers.length;
    draft.meta.info = action === "accept"
      ? "Oferta aceptada correctamente."
      : "Oferta rechazada.";
  });

  await hydrateLiveContext();
}

async function handleProviderStatusChange(status) {
  patchState("provider.status", status);

  if (!state.session.providerId || !getSupabaseClient()) return;

  const profile = await updateProviderStatus(state.session.providerId, status);
  if (!profile) return;

  setState((draft) => {
    draft.provider.status = profile.status ?? status;
  });
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
    complete: "COMPLETED",
  };

  const functionName = {
    "en-route": appConfig.functions.providerEnRoute,
    arrived: appConfig.functions.providerArrived,
    start: appConfig.functions.startService,
    complete: appConfig.functions.completeService,
  }[action];

  await updateRequestStatus(functionName, {
    request_id: state.provider.activeService?.request_id ?? state.provider.activeService?.id,
  });

  setState((draft) => {
    if (draft.provider.activeService) {
      draft.provider.activeService.status = nextStatuses[action];
    }
    if (draft.client.activeRequest) {
      draft.client.activeRequest.status = nextStatuses[action];
    }
    draft.meta.info = "Estado del servicio actualizado.";
  });

  await hydrateLiveContext();
}

function bindBasicControls() {
  document.getElementById("authPrimaryButton")?.addEventListener("click", async () => {
    try {
      await handleAuthPrimary();
    } catch (error) {
      setInfo(null, normalizeAuthError(error, "No se pudo iniciar sesion."));
    }
  });

  document.getElementById("authSecondaryButton")?.addEventListener("click", async () => {
    try {
      await signOut();
      window.location.reload();
    } catch (error) {
      setInfo(null, normalizeAuthError(error, "No se pudo cerrar la sesion."));
    }
  });

  document.getElementById("enterServicesHub")?.addEventListener("click", () => {
    patchState("ui.appEntered", true);
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
    button.addEventListener("click", () => toggleDrawer(button.dataset.closeDrawer, false));
  });

  document.getElementById("requestTypeSelect")?.addEventListener("change", () => {
    syncDraftFromForm();
    updateScheduledVisibility();
  });

  document.getElementById("requestForm")?.addEventListener("submit", async (event) => {
    try {
      await handleSearchSubmit(event);
    } catch (error) {
      setInfo(null, normalizeAuthError(error, "No se pudo buscar prestadores."));
    }
  });

  document.getElementById("chatForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const input = document.getElementById("chatInput");
    const body = input?.value?.trim();
    if (!body) return;

    try {
      const message = await sendMessage({
        conversationId: currentConversationId(),
        body,
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

  document.querySelector(".app-shell")?.addEventListener("click", async (event) => {
    try {
      const categoryButton = event.target.closest("[data-category-id]");
      if (categoryButton) {
        patchState("ui.selectedCategoryId", categoryButton.dataset.categoryId);
        return;
      }

      const modeButton = event.target.closest("[data-mode]");
      if (modeButton) {
        patchState("ui.activeMode", modeButton.dataset.mode);
        return;
      }

      const selectProvider = event.target.closest("[data-provider-select]");
      if (selectProvider) {
        await handleProviderSelection(selectProvider.dataset.providerSelect);
        return;
      }

      const requestAction = event.target.closest("[data-request-action]");
      if (requestAction) {
        await handleRequestAction(requestAction.dataset.requestAction);
        return;
      }

      if (event.target.closest("[data-open-chat]")) {
        toggleDrawer("chatDrawer", true);
        return;
      }

      const offerAction = event.target.closest("[data-offer-action]");
      if (offerAction) {
        await handleOfferAction(offerAction.dataset.offerAction, offerAction.dataset.offerId);
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
      }
    } catch (error) {
      setInfo(null, normalizeAuthError(error, "No se pudo completar la accion."));
    }
  });
}

function setupRealtime(
  requestId = state.client.activeRequest?.id ??
    state.provider.activeService?.request_id ??
    state.provider.activeService?.id ??
    null,
  conversationId = currentConversationId(),
) {
  subscribeToServiceRealtime({
    userId: state.session.userId,
    providerId: state.session.providerId,
    requestId,
    conversationId,
    onNotification: ({ new: payload }) => {
      if (!payload) return;

      setState((draft) => {
        draft.notifications.items.unshift(payload);
      });

      playNotificationSound();
    },
    onMessage: ({ new: payload }) => {
      if (!payload) return;

      setState((draft) => {
        const exists = draft.chat.messages.some((msg) => msg.id === payload.id);
        if (!exists) draft.chat.messages.push(payload);
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
          lng: payload.lng,
        };
      });

      updateTrackingMarkers({
        clientPosition: state.tracking.clientPosition,
        providerPosition: {
          lat: payload.lat,
          lng: payload.lng,
        },
      });
    },
    onRequest: ({ new: payload }) => {
      if (!payload) return;

      setState((draft) => {
        if (draft.client.activeRequest?.id === payload.id) {
          draft.client.activeRequest = {
            ...draft.client.activeRequest,
            ...payload,
          };
        }

        if (
          draft.provider.activeService?.id === payload.id ||
          draft.provider.activeService?.request_id === payload.id
        ) {
          draft.provider.activeService = {
            ...draft.provider.activeService,
            ...payload,
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
        }
      });

      playNotificationSound();
    },
  });
}

async function init() {
  subscribe(renderApp);
  renderApp(state);

  seedForm();
  updateScheduledVisibility();
  bindBasicControls();
  registerInstallPrompt();
  initMap("trackingMap", appConfig.mapInitialCenter, appConfig.mapInitialZoom);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => null);
  }

  await bootstrapAsyncData();
  startProviderTrackingLoop();
  setupRealtime();
  renderApp(state);
}

let authRefreshInFlight = false;

const authSubscription = subscribeToAuthChanges?.(async (event) => {
  console.log("[auth change]", event);

  if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
    return;
  }

  if (authRefreshInFlight) {
    return;
  }

  if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
    try {
      authRefreshInFlight = true;
      await bootstrapAsyncData();
      renderApp(state);
    } catch (error) {
      console.error("[auth] error refrescando estado:", error);
    } finally {
      authRefreshInFlight = false;
    }
  }
});

init().catch((error) => {
  setState((draft) => {
    draft.meta.error = normalizeAuthError(error, "La app cargo con fallback local. Revisa la configuracion de Supabase.");
    draft.meta.info = null;
  });
});

window.addEventListener("beforeunload", () => {
  authSubscription?.unsubscribe?.();
});


