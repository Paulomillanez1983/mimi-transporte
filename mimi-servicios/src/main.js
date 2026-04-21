import { appConfig } from "./config.js";
import { initMap, updateTrackingMarkers } from "./services/map.js";
import { bootstrapSession, createRequest, loadMessages, loadNotifications, loadOffers, searchProviders, sendMessage, updateRequestStatus } from "./services/service-api.js";
import { subscribeToServiceRealtime } from "./services/realtime.js";
import { playNotificationSound } from "./services/sound.js";
import { patchState, setState, state, subscribe } from "./state/app-state.js";
import { renderApp } from "./ui/render.js";

function syncDraftFromForm() {
  patchState("requestDraft.address", document.getElementById("serviceAddressInput").value.trim());
  patchState("requestDraft.lat", Number(document.getElementById("serviceLatInput").value || state.requestDraft.lat));
  patchState("requestDraft.lng", Number(document.getElementById("serviceLngInput").value || state.requestDraft.lng));
  patchState("requestDraft.requestType", document.getElementById("requestTypeSelect").value);
  patchState("requestDraft.scheduledFor", document.getElementById("scheduledForInput").value);
  patchState("requestDraft.requestedHours", Number(document.getElementById("requestedHoursInput").value || 2));
}

function updateScheduledVisibility() {
  document.getElementById("scheduledForWrapper").hidden = state.requestDraft.requestType !== "SCHEDULED";
}

function toggleDrawer(id, force) {
  const drawer = document.getElementById(id);
  const open = force ?? !drawer.classList.contains("is-open");
  drawer.classList.toggle("is-open", open);
  drawer.setAttribute("aria-hidden", String(!open));
}

function bindBasicControls() {
  document.getElementById("enterServicesHub").addEventListener("click", () => patchState("ui.appEntered", true));
  document.getElementById("notificationsButton").addEventListener("click", () => toggleDrawer("notificationsDrawer", true));
  document.getElementById("chatButton").addEventListener("click", async () => {
    toggleDrawer("chatDrawer", true);
    if (!state.chat.messages.length) {
      const messages = await loadMessages(state.client.activeRequest?.conversation_id);
      patchState("chat.messages", messages);
      patchState("chat.unreadCount", 0);
    }
  });

  document.querySelectorAll("[data-close-drawer]").forEach((button) => {
    button.addEventListener("click", () => toggleDrawer(button.dataset.closeDrawer, false));
  });

  document.getElementById("requestTypeSelect").addEventListener("change", () => {
    syncDraftFromForm();
    updateScheduledVisibility();
  });

  document.getElementById("requestForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    syncDraftFromForm();
    const providers = await searchProviders(state.ui.selectedCategoryId, state.requestDraft);
    setState((draft) => {
      draft.client.providers = providers;
      draft.meta.info = providers.length ? "Prestadores actualizados." : "No encontramos prestadores para este criterio.";
      draft.meta.lastSearchAt = new Date().toISOString();
    });
  });

  document.getElementById("chatForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.getElementById("chatInput");
    const body = input.value.trim();
    if (!body) return;
    const message = await sendMessage({ conversationId: state.client.activeRequest?.conversation_id, body });
    setState((draft) => {
      draft.chat.messages.push(message);
      draft.chat.unreadCount = 0;
    });
    input.value = "";
  });

  document.querySelector(".app-shell").addEventListener("click", async (event) => {
    const categoryButton = event.target.closest("[data-category-id]");
    if (categoryButton) return patchState("ui.selectedCategoryId", categoryButton.dataset.categoryId);

    const modeButton = event.target.closest("[data-mode]");
    if (modeButton) return patchState("ui.activeMode", modeButton.dataset.mode);

    const selectProvider = event.target.closest("[data-provider-select]");
    if (selectProvider) {
      const provider = state.client.providers.find((item) => item.provider_id === selectProvider.dataset.providerSelect);
      if (!provider) return;
      const request = await createRequest({
        categoryId: state.ui.selectedCategoryId,
        selectedProviderId: provider.provider_id,
        providerName: provider.full_name,
        address: state.requestDraft.address,
        serviceLat: state.requestDraft.lat,
        serviceLng: state.requestDraft.lng,
        requestType: state.requestDraft.requestType,
        scheduledFor: state.requestDraft.scheduledFor || null,
        requestedHours: state.requestDraft.requestedHours,
        providerPrice: provider.provider_price,
        platformFee: provider.fee,
        totalPrice: provider.total_price
      });

      setState((draft) => {
        draft.client.selectedProvider = provider;
        draft.client.activeRequest = {
          ...request,
          providerName: provider.full_name,
          requestType: draft.requestDraft.requestType,
          requestedHours: draft.requestDraft.requestedHours,
          total_price: provider.total_price,
          conversation_id: request?.conversation_id ?? "demo-conversation"
        };
        draft.tracking.clientPosition = { lat: draft.requestDraft.lat, lng: draft.requestDraft.lng };
        draft.meta.info = "Solicitud creada correctamente.";
      });
      updateTrackingMarkers({ clientPosition: state.tracking.clientPosition, providerPosition: state.tracking.providerPosition });
      return;
    }

    const requestAction = event.target.closest("[data-request-action]");
    if (requestAction?.dataset.requestAction === "cancel") {
      await updateRequestStatus(appConfig.functions.cancelRequest, { requestId: state.client.activeRequest?.id });
      return setState((draft) => {
        if (draft.client.activeRequest) draft.client.activeRequest.status = "CANCELLED";
      });
    }

    if (event.target.closest("[data-open-chat]")) return toggleDrawer("chatDrawer", true);

    const offerAction = event.target.closest("[data-offer-action]");
    if (offerAction) {
      const offer = state.provider.offers.find((item) => item.id === offerAction.dataset.offerId);
      if (!offer) return;
      const accept = offerAction.dataset.offerAction === "accept";
      await updateRequestStatus(appConfig.functions.providerRespondOffer, { offerId: offer.id, accept });
      return setState((draft) => {
        draft.provider.offers = draft.provider.offers.filter((item) => item.id !== offer.id);
        if (accept) {
          draft.provider.activeService = { ...offer, status: "ACCEPTED" };
          draft.provider.stats.offers += 1;
          draft.client.activeRequest = { ...(draft.client.activeRequest ?? {}), status: "ACCEPTED", providerName: offer.client_name };
        }
      });
    }

    const providerStatus = event.target.closest("[data-provider-status]");
    if (providerStatus) return patchState("provider.status", providerStatus.dataset.providerStatus);

    const providerFlow = event.target.closest("[data-provider-flow]");
    if (providerFlow) {
      const action = providerFlow.dataset.providerFlow;
      if (action === "chat") return toggleDrawer("chatDrawer", true);
      const nextStatuses = { "en-route": "PROVIDER_EN_ROUTE", arrived: "PROVIDER_ARRIVED", start: "IN_PROGRESS", complete: "COMPLETED" };
      const functionName = {
        "en-route": appConfig.functions.providerEnRoute,
        arrived: appConfig.functions.providerArrived,
        start: appConfig.functions.startService,
        complete: appConfig.functions.completeService
      }[action];
      await updateRequestStatus(functionName, { requestId: state.provider.activeService?.request_id });
      return setState((draft) => {
        if (draft.provider.activeService) draft.provider.activeService.status = nextStatuses[action];
        if (draft.client.activeRequest) draft.client.activeRequest.status = nextStatuses[action];
        if (action === "complete") draft.provider.stats.completed += 1;
      });
    }
  });
}

async function bootstrapAsyncData() {
  const session = await bootstrapSession();
  setState((draft) => { draft.session.userId = session.userId; });
  const [notifications, offers] = await Promise.all([loadNotifications(), loadOffers()]);
  setState((draft) => {
    draft.notifications.items = notifications;
    draft.provider.offers = offers;
  });
}

function registerInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    patchState("ui.installPromptEvent", event);
  });

  document.getElementById("installButton").addEventListener("click", async () => {
    const promptEvent = state.ui.installPromptEvent;
    if (!promptEvent) return;
    await promptEvent.prompt();
  });
}

function setupRealtime() {
  subscribeToServiceRealtime({
    onNotification: ({ new: payload }) => {
      if (!payload) return;
      setState((draft) => { draft.notifications.items.unshift(payload); });
      playNotificationSound();
    },
    onMessage: ({ new: payload }) => {
      if (!payload) return;
      setState((draft) => {
        draft.chat.messages.push(payload);
        draft.chat.unreadCount += 1;
      });
      playNotificationSound();
    },
    onTracking: ({ new: payload }) => {
      if (!payload) return;
      setState((draft) => { draft.tracking.providerPosition = { lat: payload.lat, lng: payload.lng }; });
      updateTrackingMarkers({ clientPosition: state.tracking.clientPosition, providerPosition: { lat: payload.lat, lng: payload.lng } });
    },
    onRequest: ({ new: payload }) => {
      if (!payload || !state.client.activeRequest || payload.id !== state.client.activeRequest.id) return;
      setState((draft) => { draft.client.activeRequest = { ...draft.client.activeRequest, ...payload }; });
    },
    onOffer: ({ new: payload }) => {
      if (!payload) return;
      setState((draft) => { draft.provider.offers.unshift(payload); });
      playNotificationSound();
    }
  });
}

function seedForm() {
  document.getElementById("serviceLatInput").value = String(state.requestDraft.lat);
  document.getElementById("serviceLngInput").value = String(state.requestDraft.lng);
  document.getElementById("requestedHoursInput").value = String(state.requestDraft.requestedHours);
}

async function init() {
  subscribe(renderApp);
  renderApp(state);
  seedForm();
  updateScheduledVisibility();
  bindBasicControls();
  registerInstallPrompt();
  initMap("trackingMap", appConfig.mapInitialCenter, appConfig.mapInitialZoom);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => null);
  await bootstrapAsyncData();
  setupRealtime();
  renderApp(state);
}

init().catch((error) => {
  setState((draft) => {
    draft.meta.error = error.message;
    draft.meta.info = "La app cargó con fallback local. Revisá la configuración de Supabase.";
  });
});
