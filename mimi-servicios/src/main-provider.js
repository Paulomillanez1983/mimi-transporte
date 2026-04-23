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
  sendMessage,
  trackLocation,
  updateProviderStatus,
  updateRequestStatus,
} from "./services/service-api.js";
import { subscribeToProviderRealtime } from "./services/realtime.js";
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
import { renderProviderScreen } from "./ui/render-provider.js";

function currentConversationId() {
  return state.provider.activeService?.conversation_id ?? null;
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

async function hydrateLiveContext(activeRequestOverride) {
  const activeRequest = activeRequestOverride ?? await loadActiveRequest({
    userId: null,
    providerId: state.session.providerId,
  });

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
            null,
        }
      : null;

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

  updateProviderMap({
    providerPosition: state.tracking.providerPosition,
    servicePosition: state.tracking.clientPosition,
  });

  setupRealtime(activeRequest?.id ?? activeRequest?.request_id ?? null, conversation?.id ?? null);
}

async function bootstrapAsyncData() {
  const session = await bootstrapSession();

  if (session.isAuthenticated && session.role !== "provider") {
    await redirectAfterLoginByRole(await getCurrentSession());
    return;
  }

  setState((draft) => {
    draft.session.userId = session.userId;
    draft.session.providerId = session.providerId;
    draft.session.role = session.role;
    draft.session.userEmail = session.userEmail ?? null;
    draft.session.userName = session.userName ?? null;
    draft.meta.backendMode = session.userId ? "supabase" : (hasSupabaseEnv() ? "supabase" : "mock");
    draft.provider.status = draft.provider.status || "OFFLINE";
  });

  const [notifications, offers] = await Promise.all([
    loadNotifications(session.userId),
    loadOffers(session.providerId),
  ]);

  const workspace = session.providerId
    ? await loadProviderWorkspace(session.providerId)
    : {
        profile: null,
        profileDetail: null,
        pricing: [],
        availability: [],
        documents: [],
        reviews: [],
        completedCount: 0,
      };

  setState((draft) => {
    draft.notifications.items = notifications;
    draft.provider.offers = offers ?? [];
    draft.provider.stats.offers = offers?.length ?? 0;
    draft.provider.profile = workspace.profile;
    draft.provider.business.profile = workspace.profileDetail;
    draft.provider.business.pricing = workspace.pricing;
    draft.provider.business.availability = workspace.availability;
    draft.provider.business.documents = workspace.documents;
    draft.provider.business.reviews = workspace.reviews;
    draft.provider.stats.rating = workspace.profile?.rating_avg ?? draft.provider.stats.rating;
    draft.provider.stats.completed = workspace.completedCount ?? draft.provider.stats.completed;
    draft.provider.status = workspace.profile?.status ?? draft.provider.status;
  });

  await hydrateLiveContext();
  await registerCurrentDevice();

  if (!hasSupabaseEnv()) {
    setInfo("La app está funcionando en modo demo local. Cuando cargues las credenciales, se conecta al backend real.");
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

      updateProviderMap({
        providerPosition: state.tracking.providerPosition,
        servicePosition: state.tracking.clientPosition,
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
  if (!hasSupabaseEnv()) {
    setInfo("Entraste en modo demo. Cuando cargues tus claves de Supabase se habilita el flujo real.");
    return;
  }

  await signInWithGoogle();
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

  const profile = await updateProviderStatus(state.session.providerId, status);
  if (!profile) return;

  setState((draft) => {
    draft.provider.status = profile.status ?? status;
    draft.provider.stats.rating = profile.rating_avg ?? draft.provider.stats.rating;
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
    draft.meta.info = "Estado del servicio actualizado.";
  });

  await hydrateLiveContext();
}

function bindBasicControls() {
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
        return;
      }
    } catch (error) {
      setInfo(null, normalizeAuthError(error, "No se pudo completar la accion."));
    }
  });
}

function setupRealtime(
  requestId = state.provider.activeService?.request_id ?? state.provider.activeService?.id ?? null,
  conversationId = currentConversationId(),
) {
  subscribeToProviderRealtime({
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

      updateProviderMap({
        providerPosition: state.tracking.providerPosition,
        servicePosition: state.tracking.clientPosition,
      });
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
  subscribe(renderProviderScreen);
  renderProviderScreen(state);

  bindBasicControls();
  registerInstallPrompt();
  initMap("trackingMap", appConfig.mapInitialCenter, appConfig.mapInitialZoom);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => null);
  }

  await bootstrapAsyncData();
  startProviderTrackingLoop();
  setupRealtime();
  renderProviderScreen(state);
}

const authSubscription = subscribeToAuthChanges?.(async (event, session) => {
  if (event === "SIGNED_IN" && session) {
    await redirectAfterLoginByRole(session);
  }
});

init().catch((error) => {
  setState((draft) => {
    draft.meta.error = normalizeAuthError(error, "La app cargó con fallback local. Revisá la configuración de Supabase.");
    draft.meta.info = null;
  });
});

window.addEventListener("beforeunload", () => {
  authSubscription?.unsubscribe?.();
});
