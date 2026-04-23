import { appConfig } from "../../config.js";
import {
  bootstrapSession,
  loadActiveRequest,
  loadCategories,
  loadConversationForRequest,
  loadMessages,
  loadNotifications,
  registerDevice
} from "../services/service-api.js";
import {
  disconnectRealtime,
  subscribeToConversationMessages,
  subscribeToProviderOffers,
  subscribeToRequestState,
  subscribeToRequestTracking,
  subscribeToUserNotifications
} from "../services/realtime.js";
import { setState, state } from "../state/app-state.js";
import {
  bootstrapProviderContext,
  handleIncomingOffer,
  restoreProviderActiveService
} from "./provider-controller.js";
import { handleIncomingMessage } from "./chat-controller.js";
import { updateTrackingMarkers } from "../services/map.js";

let reconnectTimer = null;

function buildDeviceId() {
  const storageKey = "mimi_services_device_id";
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
      marketingOptIn: false
    });
  } catch {
    // noop
  }
}

async function refreshNotifications() {
  if (!state.session.userId) return;

  const notifications = await loadNotifications(state.session.userId);

  setState((draft) => {
    draft.notifications.items = notifications;
    draft.notifications.unreadCount = notifications.filter(
      (item) => !item.read_at
    ).length;
  });
}

async function hydrateActiveClientContext() {
  if (!state.session.userId && !state.session.providerId) {
    setState((draft) => {
      draft.client.activeRequest = null;
      draft.client.activeConversationId = null;
      draft.chat.conversationId = null;
      draft.chat.messages = [];
      draft.chat.unreadCount = 0;
    });

    return {
      activeRequest: null,
      conversation: null
    };
  }

  const activeRequest = await loadActiveRequest({
    userId: state.session.userId,
    providerId: state.session.providerId
  });

  const conversation = activeRequest?.id
    ? await loadConversationForRequest(activeRequest.id)
    : null;

  const messages = conversation?.id
    ? await loadMessages(conversation.id)
    : [];

  setState((draft) => {
    draft.client.activeRequest = activeRequest;
    draft.client.activeConversationId = conversation?.id ?? null;
    draft.chat.conversationId = conversation?.id ?? null;
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
    }
  });

  updateTrackingMarkers({
    clientPosition: state.tracking.clientPosition,
    providerPosition: state.tracking.providerPosition
  });

  return {
    activeRequest,
    conversation
  };
}

function stopRealtimeFallback() {
  if (reconnectTimer) {
    window.clearInterval(reconnectTimer);
    reconnectTimer = null;
  }
}

function startRealtimeFallback() {
  stopRealtimeFallback();

  reconnectTimer = window.setInterval(async () => {
    try {
      if (state.session.providerId) {
        await bootstrapProviderContext();
      }

      await refreshNotifications();
      await restoreProviderActiveService();
    } catch {
      // noop
    }
  }, appConfig.providerUi?.reconnectPollingMs ?? 15000);
}

export function setupRealtime({ requestId, conversationId, providerId, userId }) {
  disconnectRealtime();
  stopRealtimeFallback();

  if (userId) {
    subscribeToUserNotifications(userId, async () => {
      await refreshNotifications();
    });
  }

  if (conversationId) {
    subscribeToConversationMessages(conversationId, handleIncomingMessage);
  }

  if (requestId) {
    subscribeToRequestTracking(requestId, (payload) => {
      const tracking = payload?.new ?? payload?.record ?? payload;
      if (!tracking) return;

      setState((draft) => {
        draft.tracking.providerPosition = {
          lat: tracking.lat,
          lng: tracking.lng
        };
        draft.tracking.active = true;
      });

      updateTrackingMarkers({
        clientPosition: state.tracking.clientPosition,
        providerPosition: state.tracking.providerPosition
      });
    });

    subscribeToRequestState(
      requestId,
      async () => {
        await hydrateActiveClientContext();
        await restoreProviderActiveService();
      },
      async () => {
        if (state.session.providerId) {
          await bootstrapProviderContext();
        }
      }
    );
  }

  if (providerId) {
    subscribeToProviderOffers(providerId, (payload) => {
      handleIncomingOffer(payload);
    });
  }

  startRealtimeFallback();
}

export async function bootstrapApp() {
  const sessionData = await bootstrapSession();

  setState((draft) => {
    draft.session.isAuthenticated = sessionData.isAuthenticated;
    draft.session.userId = sessionData.userId;
    draft.session.userEmail = sessionData.userEmail;
    draft.session.userName = sessionData.userName;
    draft.session.providerId = sessionData.providerId;
    draft.session.role = sessionData.role;
    draft.provider.profile = sessionData.providerProfile ?? null;
    draft.provider.status =
      sessionData.providerProfile?.status ?? draft.provider.status;
    draft.ui.activeMode =
      sessionData.providerId && draft.ui.activeMode === "provider"
        ? "provider"
        : "client";
    draft.meta.backendMode = sessionData.userId ? "supabase" : "mock";
  });

  const categories = await loadCategories();

  if (Array.isArray(categories) && categories.length) {
    appConfig.categories = categories;
  }

  setState((draft) => {
    draft.meta.categories = categories;

    if (!categories.some((category) => category.id === draft.ui.selectedCategoryId)) {
      draft.ui.selectedCategoryId = categories[0]?.id ?? draft.ui.selectedCategoryId;
    }
  });

  if (sessionData.isAuthenticated) {
    await registerCurrentDevice();
    await refreshNotifications();
  }

  const { activeRequest, conversation } = await hydrateActiveClientContext();

  if (state.session.providerId) {
    await bootstrapProviderContext();
  }

  setupRealtime({
    requestId: activeRequest?.id ?? state.provider.activeService?.id ?? null,
    conversationId: conversation?.id ?? state.chat.conversationId ?? null,
    providerId: state.session.providerId,
    userId: state.session.userId
  });
}

export function cleanupBootstrapRealtime() {
  disconnectRealtime();
  stopRealtimeFallback();
}
