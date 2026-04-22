import { appConfig } from "../config.js";
import { initMap, updateClientMap } from "./services/map.js";
import {
  bootstrapSession,
  createRequest,
  loadActiveRequest,
  loadCategories,
  loadConversationForRequest,
  loadMessages,
  loadNotifications,
  prepareRequestPricing,
  registerDevice,
  searchProviders,
  sendMessage,
  updateRequestStatus,
} from "./services/service-api.js";
import {
  buscarDireccionServicio,
  guardarFeedbackGeocodingServicio,
  obtenerRecentServicePlaces,
} from "./services/service-geocoding.js";
import { subscribeToClientRealtime } from "./services/realtime.js";
import { playNotificationSound } from "./services/sound.js";
import {
  getCurrentSession,
  hasSupabaseEnv,
  redirectAfterLoginByRole,
  signInWithGoogle,
  signOut,
  subscribeToAuthChanges,
} from "./services/supabase.js";
import { patchState, setState, state, subscribe } from "./state/app-state.js";
import { renderClientScreen } from "./ui/render-client.js";

let addressLookupToken = 0;

function currentUserId() {
  return state.session.userId ?? appConfig.demoClientUserId ?? null;
}

function currentConversationId() {
  return state.client.activeConversationId ??
    state.client.activeRequest?.conversation_id ??
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

  if (error?.message === "SERVICE_LOCATION_REQUIRED") {
    return "Necesitamos una dirección válida del servicio para buscar prestadores.";
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

  try {
    await registerDevice({
      deviceId: buildDeviceId(),
      pushToken: null,
      platform: "web",
      notificationsEnabled: true,
      marketingOptIn: false,
    });
  } catch {
    // silent
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
  const addressInput = document.getElementById("serviceAddressInput");
  const latInput = document.getElementById("serviceLatInput");
  const lngInput = document.getElementById("serviceLngInput");
  const requestedHoursInput = document.getElementById("requestedHoursInput");
  const requestTypeSelect = document.getElementById("requestTypeSelect");
  const scheduledForInput = document.getElementById("scheduledForInput");

  if (addressInput) addressInput.value = state.requestDraft.address || "";
  if (latInput) latInput.value = Number.isFinite(Number(state.requestDraft.lat)) ? String(state.requestDraft.lat) : "";
  if (lngInput) lngInput.value = Number.isFinite(Number(state.requestDraft.lng)) ? String(state.requestDraft.lng) : "";
  if (requestedHoursInput) requestedHoursInput.value = String(state.requestDraft.requestedHours);
  if (requestTypeSelect) requestTypeSelect.value = state.requestDraft.requestType;
  if (scheduledForInput) scheduledForInput.value = state.requestDraft.scheduledFor || "";
}

function updateScheduledVisibility() {
  const wrapper = document.getElementById("scheduledForWrapper");
  if (!wrapper) return;
  wrapper.hidden = state.requestDraft.requestType !== "SCHEDULED";
}

function toggleClearAddressButton() {
  const addressInput = document.getElementById("serviceAddressInput");
  const clearButton = document.getElementById("btnClearServiceAddress");
  if (!addressInput || !clearButton) return;

  clearButton.hidden = !(addressInput.value || "").trim();
}

function renderServiceAddressSuggestions(items) {
  const container = document.getElementById("serviceAddressSuggestions");
  const addressInput = document.getElementById("serviceAddressInput");
  if (!container) return;

  if (!items.length) {
    container.innerHTML = "";
    container.hidden = true;
    container._items = [];
    addressInput?.setAttribute("aria-expanded", "false");
    return;
  }

  container.innerHTML = items.map((item, index) => `
    <button
      type="button"
      class="suggestion-item"
      data-service-suggestion-index="${index}"
      role="option"
    >
      <strong>${item.display_name || item.direccion || "Dirección"}</strong>
      <span class="muted">${item.source || item.barrio || "Sugerencia"}</span>
    </button>
  `).join("");

  container.hidden = false;
  container._items = items;
  addressInput?.setAttribute("aria-expanded", "true");
}

async function selectServiceAddressSuggestion(index) {
  const input = document.getElementById("serviceAddressInput");
  const suggestions = document.getElementById("serviceAddressSuggestions");
  const latInput = document.getElementById("serviceLatInput");
  const lngInput = document.getElementById("serviceLngInput");
  const item = suggestions?._items?.[index];
  if (!item || !input || !latInput || !lngInput) return;

  const rawQuery = input.value;
  const address = item.display_name || item.direccion || "";
  const lat = Number(item.lat);
  const lng = Number(item.lon ?? item.lng);

  input.value = address;
  latInput.value = String(lat);
  lngInput.value = String(lng);

  renderServiceAddressSuggestions([]);
  toggleClearAddressButton();

  patchState("requestDraft.address", address);
  patchState("requestDraft.lat", lat);
  patchState("requestDraft.lng", lng);

  updateClientMap({
    servicePosition: { lat, lng },
    providerPosition: state.tracking.providerPosition,
  });

  await guardarFeedbackGeocodingServicio(rawQuery, item);
}

async function handleServiceAddressInput(event) {
  const value = event.target.value?.trim() || "";
  const latInput = document.getElementById("serviceLatInput");
  const lngInput = document.getElementById("serviceLngInput");

  toggleClearAddressButton();
  patchState("requestDraft.address", value);

  if (latInput) latInput.value = "";
  if (lngInput) lngInput.value = "";
  patchState("requestDraft.lat", null);
  patchState("requestDraft.lng", null);

  if (value.length < 2) {
    renderServiceAddressSuggestions(value.length === 0 ? obtenerRecentServicePlaces() : []);
    return;
  }

  const token = ++addressLookupToken;
  const result = await buscarDireccionServicio(value);
  if (token !== addressLookupToken) return;

  renderServiceAddressSuggestions(result.resultados || []);
}

function handleClearServiceAddress() {
  const addressInput = document.getElementById("serviceAddressInput");
  const latInput = document.getElementById("serviceLatInput");
  const lngInput = document.getElementById("serviceLngInput");

  if (addressInput) addressInput.value = "";
  if (latInput) latInput.value = "";
  if (lngInput) lngInput.value = "";

  patchState("requestDraft.address", "");
  patchState("requestDraft.lat", null);
  patchState("requestDraft.lng", null);

  renderServiceAddressSuggestions([]);
  toggleClearAddressButton();
}

async function handleUseCurrentServiceLocation() {
  if (!navigator.geolocation) {
    throw new Error("Tu dispositivo no permite geolocalización.");
  }

  const position = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000,
    });
  });

  const lat = Number(position.coords.latitude);
  const lng = Number(position.coords.longitude);
  const addressInput = document.getElementById("serviceAddressInput");
  const latInput = document.getElementById("serviceLatInput");
  const lngInput = document.getElementById("serviceLngInput");

  if (addressInput) addressInput.value = "Mi ubicación actual";
  if (latInput) latInput.value = String(lat);
  if (lngInput) lngInput.value = String(lng);

  patchState("requestDraft.address", "Mi ubicación actual");
  patchState("requestDraft.lat", lat);
  patchState("requestDraft.lng", lng);

  updateClientMap({
    servicePosition: { lat, lng },
    providerPosition: state.tracking.providerPosition,
  });

  renderServiceAddressSuggestions([]);
  toggleClearAddressButton();
}

async function hydrateLiveContext(activeRequestOverride) {
  const activeRequest = activeRequestOverride ?? await loadActiveRequest({
    userId: state.session.userId,
    providerId: null,
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

  updateClientMap({
    servicePosition: state.tracking.clientPosition,
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

  if (session.isAuthenticated && session.role === "provider") {
    redirectAfterLoginByRole(await getCurrentSession());
    return;
  }

  setState((draft) => {
    draft.session.userId = session.userId;
    draft.session.providerId = session.providerId;
    draft.session.role = "client";
    draft.session.userEmail = session.userEmail ?? null;
    draft.session.userName = session.userName ?? null;
    draft.meta.backendMode = session.userId ? "supabase" : (hasSupabaseEnv() ? "supabase" : "mock");
    draft.ui.appEntered = draft.meta.backendMode === "mock" ? true : Boolean(session.userId);

    if (appConfig.categories.length && !appConfig.categories.some((item) => item.id === draft.ui.selectedCategoryId)) {
      draft.ui.selectedCategoryId = appConfig.categories[0].id;
    }
  });

  const notifications = await loadNotifications(session.userId);
  setState((draft) => {
    draft.notifications.items = notifications;
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

async function handleAuthPrimary() {
  if (!hasSupabaseEnv()) {
    patchState("ui.appEntered", true);
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

  document.getElementById("serviceAddressInput")?.addEventListener("input", async (event) => {
    try {
      await handleServiceAddressInput(event);
    } catch (error) {
      setInfo(null, normalizeAuthError(error, "No se pudieron cargar sugerencias."));
    }
  });

  document.getElementById("serviceAddressInput")?.addEventListener("focus", () => {
    if (!(document.getElementById("serviceAddressInput")?.value || "").trim()) {
      renderServiceAddressSuggestions(obtenerRecentServicePlaces());
    }
  });

  document.getElementById("btnClearServiceAddress")?.addEventListener("click", handleClearServiceAddress);

  document.getElementById("btnUseCurrentServiceLocation")?.addEventListener("click", async () => {
    try {
      await handleUseCurrentServiceLocation();
    } catch (error) {
      setInfo(null, normalizeAuthError(error, "No pudimos obtener tu ubicación actual."));
    }
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

      const suggestionButton = event.target.closest("[data-service-suggestion-index]");
      if (suggestionButton) {
        await selectServiceAddressSuggestion(Number(suggestionButton.dataset.serviceSuggestionIndex));
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
      }
    } catch (error) {
      setInfo(null, normalizeAuthError(error, "No se pudo completar la accion."));
    }
  });
}

function setupRealtime(requestId = state.client.activeRequest?.id ?? null, conversationId = currentConversationId()) {
  subscribeToClientRealtime({
    userId: state.session.userId,
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

      updateClientMap({
        servicePosition: state.tracking.clientPosition,
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
      });
    },
  });
}

async function init() {
  subscribe(renderClientScreen);
  renderClientScreen(state);

  seedForm();
  toggleClearAddressButton();
  updateScheduledVisibility();
  bindBasicControls();
  registerInstallPrompt();
  initMap("trackingMap", appConfig.mapInitialCenter, appConfig.mapInitialZoom);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => null);
  }

  await bootstrapAsyncData();
  setupRealtime();
  renderClientScreen(state);
}

const authSubscription = subscribeToAuthChanges?.((event, session) => {
  if (event === "SIGNED_IN" && session) {
    redirectAfterLoginByRole(session);
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
