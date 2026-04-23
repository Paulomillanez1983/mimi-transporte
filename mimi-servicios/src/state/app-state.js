import { appConfig } from "../config.js";

const listeners = new Set();

function getInitialCategoryId() {
  const categories = Array.isArray(appConfig.categories) ? appConfig.categories : [];
  return categories[0]?.id ?? null;
}

function getInitialActiveMode() {
  const stored = localStorage.getItem("mimi_active_mode");
  return stored === "provider" ? "provider" : "client";
}

export const state = {
  ui: {
    appEntered: false,
    activeMode: getInitialActiveMode(),
    selectedCategoryId: getInitialCategoryId(),
    installPromptEvent: null
  },
  session: {
    userId: null,
    providerId: null,
    role: "client",
    userEmail: null,
    userName: null
  },
  requestDraft: {
    address: "",
    lat: -31.4201,
    lng: -64.1888,
    requestType: "IMMEDIATE",
    scheduledFor: "",
    requestedHours: 2
  },
  client: {
    providers: [],
    selectedProvider: null,
    activeRequest: null,
    activeConversationId: null,
    insights: {
      paymentIntent: null,
      escrowHold: null,
      candidates: [],
      offers: [],
      providerProfile: null,
      providerPricing: [],
      providerReviews: [],
      providerCategories: []
    }
  },
  provider: {
    status: "OFFLINE",
    offers: [],
    activeService: null,
    profile: null,
    business: {
      profile: null,
      pricing: [],
      availability: [],
      documents: [],
      reviews: []
    },
    stats: {
      rating: 5,
      offers: 0,
      completed: 0
    }
  },
  chat: {
    messages: [],
    unreadCount: 0
  },
  notifications: {
    items: [],
    unreadCount: 0
  },
  tracking: {
    providerPosition: null,
    clientPosition: null
  },
  meta: {
    loading: {},
    lastSearchAt: null,
    error: null,
    info: "Configuración lista para integrar con Supabase.",
    backendMode: "mock"
  }
};

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setState(updater) {
  updater(state);
  listeners.forEach((listener) => listener(state));
}

export function patchState(path, value) {
  const segments = path.split(".");

  setState((draft) => {
    let current = draft;

    for (let index = 0; index < segments.length - 1; index += 1) {
      const key = segments[index];

      if (
        current[key] === null ||
        typeof current[key] !== "object" ||
        Array.isArray(current[key])
      ) {
        current[key] = {};
      }

      current = current[key];
    }

    current[segments[segments.length - 1]] = value;
  });
}

export function setActiveMode(mode) {
  const safeMode = mode === "provider" ? "provider" : "client";
  localStorage.setItem("mimi_active_mode", safeMode);

  setState((draft) => {
    draft.ui.activeMode = safeMode;
  });
}
