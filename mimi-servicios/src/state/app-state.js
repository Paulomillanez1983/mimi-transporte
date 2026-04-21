import { appConfig } from "../../config.js";
import {
  loadActiveService,
  loadNotifications,
  loadProviderMode,
  loadProviderStatus,
  saveActiveService,
  saveNotifications,
  saveProviderMode,
  saveProviderStatus,
} from "../services/provider-storage.js";

const listeners = new Set();

export const state = {
  ui: {
    appEntered: false,
    activeMode: loadProviderMode(),
    selectedCategoryId: appConfig.categories[0].id,
    installPromptEvent: null,
  },
  session: {
    userId: null,
    providerId: null,
    role: "client",
  },
  requestDraft: {
    address: "",
    lat: -31.4201,
    lng: -64.1888,
    requestType: "IMMEDIATE",
    scheduledFor: "",
    requestedHours: 2,
  },
  client: {
    providers: [],
    selectedProvider: null,
    activeRequest: null,
    activeConversationId: null,
  },
  provider: {
    profile: null,
    status: loadProviderStatus(),
    availability: {
      isOnline: loadProviderStatus() === "ONLINE_IDLE",
      lastSeenAt: null,
    },
    offers: [],
    activeService: loadActiveService(),
    offerDeadlineAt: null,
    lastOfferSoundAt: null,
    stats: {
      rating: 5,
      completed: 0,
    },
  },
  chat: {
    conversationId: null,
    messages: [],
    unreadCount: 0,
  },
  notifications: {
    items: loadNotifications(),
    unreadCount: 0,
  },
  tracking: {
    active: false,
    providerPosition: null,
    clientPosition: null,
  },
  meta: {
    loading: {},
    lastSearchAt: null,
    error: null,
    info: "Configuración lista para integrar con Supabase.",
    backendMode: "mock",
  },
};

function persistState() {
  saveProviderMode(state.ui.activeMode);
  saveProviderStatus(state.provider.status);
  saveActiveService(state.provider.activeService);
  saveNotifications(state.notifications.items);
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setState(updater) {
  updater(state);
  persistState();
  listeners.forEach((listener) => listener(state));
}

export function patchState(path, value) {
  const segments = path.split(".");
  setState((draft) => {
    let current = draft;
    for (let i = 0; i < segments.length - 1; i += 1) {
      current = current[segments[i]];
    }
    current[segments.at(-1)] = value;
  });
}
