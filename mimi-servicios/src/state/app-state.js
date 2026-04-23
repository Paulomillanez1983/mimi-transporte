import { appConfig } from "../../config.js";

const listeners = new Set();

export const state = {
  ui: {
    appEntered: false,
    activeMode: "client",
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
    insights: {
      paymentIntent: null,
      escrowHold: null,
      candidates: [],
      offers: [],
      providerProfile: null,
      providerPricing: [],
      providerReviews: [],
      providerCategories: [],
    },
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
      reviews: [],
    },
    stats: {
      rating: 5,
      offers: 0,
      completed: 0,
    },
  },
  chat: {
    messages: [],
    unreadCount: 0,
  },
  notifications: {
    items: [],
    unreadCount: 0,
  },
  tracking: {
    providerPosition: null,
    clientPosition: null,
  },
  meta: {
    loading: {},
    lastSearchAt: null,
    error: null,
    info: "Configuracion lista para integrar con Supabase.",
    backendMode: "mock",
  },
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
    for (let i = 0; i < segments.length - 1; i += 1) {
      current = current[segments[i]];
    }
    current[segments.at(-1)] = value;
  });
}
