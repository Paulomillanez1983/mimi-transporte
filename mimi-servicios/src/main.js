import { appConfig } from "./config.js";
import { initMap, updateTrackingMarkers } from "./services/map.js";
import {
  bootstrapSession,
  createRequest,
  loadActiveRequest,
  loadConversationForRequest,
  loadMessages,
  loadNotifications,
  loadOffers,
  prepareRequestPricing,
  registerDevice,
  searchProviders,
  sendMessage,
  trackLocation,
  updateRequestStatus,
} from "./services/service-api.js";
import { subscribeToServiceRealtime } from "./services/realtime.js";
import { playNotificationSound } from "./services/sound.js";
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

function getStorageKey(keyName, fallback) {
  return appConfig?.storageKeys?.[keyName] ?? fallback;
}

function getProviderUiValue(keyName, fallback) {
  return appConfig?.providerUi?.[keyName] ?? fallback;
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
    } else {
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

function syncDraftFromForm() {
  patchState("requestDraft.address", document.getElementById("serviceAddressInput").value.trim());
  patchState(
    "requestDraft.lat",
    Number(document.getElementById("serviceLatInput").value || state.requestDraft.lat),
  );
  patchState(
    "requestDraft.lng",
    Number(document.getElementById("serviceLngInput").value || state.requestDraft.lng),
  );
  patchState("requestDraft.requestType", document.getElementById("requestTypeSelect").value);
  patchState("requestDraft.scheduledFor", document.getElementById("scheduledForInput").value);
  patchState(
    "requestDraft.requestedHours",
    Number(document.getElementById("requestedHoursInput").value || 2),
  );
}

function updateScheduledVisibility() {
  const wrapper = document.getElementById("scheduledForWrapper");
  if (!wrapper) return;

  wrapper.hidden = state.requestDraft.requestType !== "SCHEDULED";
}

function toggleDrawer(id, force) {
  const drawer = document.getElementById(id);
  if (!drawer) return;

  const open = force ?? !drawer.classList.contains("is-open");
  drawer.classList.toggle("is-open", open);
  drawer.setAttribute("aria-hidden", String(!open));
}

function buildDeviceId() {
  const storageKey = getStorageKey("deviceId", "mimi_services_device_id");

  let deviceId = localStorage.getItem(storageKey);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(storageKey, deviceId);
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

function startProviderTrackingLoop() {
  if (!navigator.geolocation) return;

  const trackingIntervalMs = getProviderUiValue("trackingIntervalMs", 12000);

  setInterval(() => {
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
  }, trackingIntervalMs);
}

function bindBasicControls() {
  const enterServicesHub = document.getElementById("enterServicesHub");
  if (enterServicesHub) {
    enterServicesHub.addEventListener("click", () => {
      patchState("ui.appEntered", true);
    });
  }

  const notificationsButton = document.getElementById("notificationsButton");
  if (notificationsButton) {
    notificationsButton.addEventListener("click", () => {
      toggleDrawer("notificationsDrawer", true);
    });
  }

  const chatButton = document.getElementById("chatButton");
  if (chatButton) {
    chatButton.addEventListener("click", async () => {
      toggleDrawer("chatDrawer", true);

      if (!state.chat.messages.length) {
        const conversationId = currentConversationId();
        if (!conversationId) return;

        const messages = await loadMessages(conversationId);
        patchState("chat.messages", messages);
        patchState("chat.unreadCount", 0);
      }
    });
  }

  document.querySelectorAll("[data-close-drawer]").forEach((button) => {
    button.addEventListener("click", () => toggleDrawer(button.dataset.closeDrawer, false));
  });

  const requestTypeSelect = document.getElementById("requestTypeSelect");
  if (requestTypeSelect) {
    requestTypeSelect.addEventListener("change", () => {
      syncDraftFromForm();
      updateScheduledVisibility();
    });
  }

  const requestForm = document.getElementById("requestForm");
  if (requestForm) {
    requestForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      syncDraftFromForm();

      const providers = await searchProviders(
        state.ui.selectedCategoryId,
        state.requestDraft,
      );

      setState((draft) => {
        draft.client.providers = providers;
        draft.meta.info = providers.length
          ? "Prestadores actualizados."
          : "No encontramos prestadores para este criterio.";
        draft.meta.lastSearchAt = new Date().toISOString();
      });
    });
  }

  const chatForm = document.getElementById("chatForm");
  if (chatForm) {
    chatForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const input = document.getElementById("chatInput");
      if (!input) return;

      const body = input.value.trim();
      if (!body) return;

      const conversationId = currentConversationId();
      if (!conversationId) return;

      const message = await sendMessage({
        conversationId,
        body,
      });

      setState((draft) => {
        draft.chat.messages.push(message);
        draft.chat.unreadCount = 0;
      });

      input.value = "";
    });
  }

  const appShell = document.querySelector(".app-shell");
  if (!appShell) return;

  appShell.addEventListener("click", async (event) => {
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
      const provider = state.client.providers.find(
        (item) => item.provider_id === selectProvider.dataset.providerSelect,
      );
      if (!provider) return;

      const pricing = await prepareRequestPricing({
        clientUserId: currentUserId(),
        categoryId: state.ui.selectedCategoryId,
        providerId: provider.provider_id,
        draft: state.requestDraft,
      });

      if (!pricing?.eligible) {
        setState((draft) => {
          draft.meta.info = `No se pudo confirmar el prestador: ${pricing?.reason ?? "pricing_error"}`;
        });
        return;
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
        draft.meta.info = "Solicitud creada correctamente.";
      });

      await hydrateLiveContext(request);
      return;
    }

    const requestAction = event.target.closest("[data-request-action]");
    if (requestAction?.dataset.requestAction === "cancel") {
      await updateRequestStatus(appConfig.functions.cancelRequest, {
        request_id: state.client.activeRequest?.id,
        reason: "cancelled_from_client_ui",
      });

      setState((draft) => {
        if (draft.client.activeRequest) {
          draft.client.activeRequest.status = "CANCELLED";
        }
      });

      await hydrateLiveContext();
      return;
    }

    if (event.target.closest("[data-open-chat]")) {
      toggleDrawer("chatDrawer", true);
      return;
    }

    const offerAction = event.target.closest("[data-offer-action]");
    if (offerAction) {
      const offer = state.provider.offers.find(
        (item) => item.id === offerAction.dataset.offerId,
      );
      if (!offer) return;

      const action = offerAction.dataset.offerAction === "accept" ? "ACCEPT" : "REJECT";

      await updateRequestStatus(appConfig.functions.providerRespondOffer, {
        offer_id: offer.id,
        action,
      });

      setState((draft) => {
        draft.provider.offers = draft.provider.offers.filter((item) => item.id !== offer.id);
      });

      await hydrateLiveContext();
      return;
    }

    const providerStatus = event.target.closest("[data-provider-status]");
    if (providerStatus) {
      patchState("provider.status", providerStatus.dataset.providerStatus);
      return;
    }

    const providerFlow = event.target.closest("[data-provider-flow]");
    if (providerFlow) {
      const action = providerFlow.dataset.providerFlow;

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

      if (!functionName) return;

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
      });

      await hydrateLiveContext();
    }
  });
}

async function bootstrapAsyncData() {
  const session = await bootstrapSession();

  setState((draft) => {
    draft.session.userId = session.userId;
    draft.session.providerId = session.providerId;
    draft.session.role = session.role;
    draft.meta.backendMode = session.userId ? "supabase" : "mock";

    if (session.role === "provider") {
      draft.ui.activeMode = "provider";
    }
  });

  const [notifications, offers] = await Promise.all([
    loadNotifications(session.userId),
    loadOffers(session.providerId),
  ]);

  setState((draft) => {
    draft.notifications.items = notifications;
    draft.provider.offers = offers ?? [];
  });

  await hydrateLiveContext();
  await registerCurrentDevice();
}

function registerInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    patchState("ui.installPromptEvent", event);
  });

  const installButton = document.getElementById("installButton");
  if (!installButton) return;

  installButton.addEventListener("click", async () => {
    const promptEvent = state.ui.installPromptEvent;
    if (!promptEvent) return;
    await promptEvent.prompt();
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

        const maxItems = getProviderUiValue("notificationsMaxItems", 50);
        if (draft.notifications.items.length > maxItems) {
          draft.notifications.items = draft.notifications.items.slice(0, maxItems);
        }
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
        }
      });

      playNotificationSound();
    },
  });
}

function seedForm() {
  const serviceLatInput = document.getElementById("serviceLatInput");
  const serviceLngInput = document.getElementById("serviceLngInput");
  const requestedHoursInput = document.getElementById("requestedHoursInput");

  if (serviceLatInput) {
    serviceLatInput.value = String(state.requestDraft.lat);
  }

  if (serviceLngInput) {
    serviceLngInput.value = String(state.requestDraft.lng);
  }

  if (requestedHoursInput) {
    requestedHoursInput.value = String(state.requestDraft.requestedHours);
  }
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

init().catch((error) => {
  setState((draft) => {
    draft.meta.error = error.message;
    draft.meta.info = "La app cargó con fallback local. Revisá la configuración de Supabase.";
  });
});
