import { appConfig } from "../config.js";

const listeners = new Set();

const ACTIVE_MODE_KEY = "mimi_active_mode";

function getInitialCategoryId() {
  const categories = Array.isArray(appConfig.categories) ? appConfig.categories : [];
  return categories[0]?.id ?? null;
}

function safeLocalStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // noop
  }
}

function getInitialActiveMode() {
  const stored = safeLocalStorageGet(ACTIVE_MODE_KEY);
  return stored === "provider" ? "provider" : "client";
}

export const state = {
  ui: {
    appEntered: false,
    activeMode: getInitialActiveMode(),
    selectedCategoryId: getInitialCategoryId(),
    installPromptEvent: null,
    showClientOnboarding: true
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
    offerDeadlineAt: null,
    activeService: null,
    profile: null,
    categories: [],
    documentsSummary: {
      approved: 0,
      pending: 0,
      observed: 0
    },
    reviewSummary: {
      average: 5,
      count: 0
    },
    availability: {
      isOnline: false,
      lastSeenAt: null,
      locationLabel: "Sin ubicación reciente"
    },
    business: {
      profile: null,
      pricing: [],
      availability: [],
      documents: [],
      reviews: [],
      categories: []
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
  if (typeof listener !== "function") {
    return () => {};
  }

  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function notifyStateChanged() {
  listeners.forEach((listener) => {
    try {
      listener(state);
    } catch {
      // noop
    }
  });
}

export function setState(updater) {
  if (typeof updater !== "function") return;

  updater(state);
  notifyStateChanged();
}

export function patchState(path, value) {
  if (!path || typeof path !== "string") return;

  const segments = path.split(".").filter(Boolean);
  if (!segments.length) return;

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

  safeLocalStorageSet(ACTIVE_MODE_KEY, safeMode);

  setState((draft) => {
    draft.ui.activeMode = safeMode;
  });
}
