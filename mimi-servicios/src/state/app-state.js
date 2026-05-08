/**
 * MIMI Servicios - State Management 2026
 * Centralized state with persistence, rehydration and reactive updates
 */

// Storage Keys
const STORAGE_KEYS = {
  UI_STATE: 'mimi_provider_ui_state',
  SESSION: 'mimi_provider_session',
  ACTIVE_SERVICE: 'mimi_provider_active_service',
  SCHEDULED: 'mimi_provider_scheduled',
  OFFER: 'mimi_provider_offer',
  SETTINGS: 'mimi_provider_settings',
  DEVICE_ID: 'mimi_services_device_id',
  LAST_SEEN: 'mimi_provider_last_seen',
  CLIENT_DRAFT: 'mimi_client_request_draft',
  CLIENT_ACTIVE_REQUEST: 'mimi_client_active_request',
  CLIENT_SELECTED_PROVIDER: 'mimi_client_selected_provider',
  CLIENT_UI: 'mimi_client_ui_state',
  CLIENT_TRACKING: 'mimi_client_tracking'
};

// Initial State
const initialState = {
  appConfig: {
    categories: [],          // NUNCA undefined — se llena en init
    categoriesLoaded: false,
    categoriesError: null,
  },

  ui: {
    isInitialized: false,
    activeTab: 'now',
    bottomSheetState: 'collapsed',
    drawerOpen: false,
    notificationDrawerOpen: false,
    chatDrawerOpen: false,
    modalOpen: false,
    currentModal: null,
    toastQueue: [],
    mapReady: false,
    isOnline: false,
    installPrompt: null,
    appEntered: false,
    activeMode: 'client',
    selectedCategoryId: null,
    selectedProviderCandidateId: null,
    categorySearchTerm: '',
    intentResolution: null,
    showAllCategories: false,
    hasCompletedClientSearch: false,
    showClientOnboarding: true
  },

  session: {
    userId: null,
    providerId: null,
    userEmail: null,
    userName: null,
    userAvatar: null,
    isAuthenticated: false,
    token: null,
    expiresAt: null
  },

  provider: {
    status: 'OFFLINE',
    isVerified: false,
    verificationStatus: 'pending',
    verificationProgress: 0,
    profile: null,
    categories: [],
    pricing: {
      basePrice: null,
      hourlyRate: null,
      jobRate: null,
      mode: null
    },
    business: {
      profile: null,
      pricing: [],
      offerings: [],
      availability: [],
      documents: [],
      reviews: []
    },
    stats: {
      rating: null,
      completedServices: 0,
      totalOffers: 0,
      earnings: 0
    },
    documents: {
      approved: 0,
      pending: 0,
      rejected: 0,
      items: []
    }
  },

  activeService: null,
  scheduledServices: [],
  activeOffer: null,

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

  requestDraft: {
    categoryId: null,
    address: '',
    lat: null,
    lng: null,
    requestType: 'IMMEDIATE',
    scheduledFor: '',
    requestedHours: 2
  },

  tracking: {
    clientPosition: null,
    providerPosition: null
  },

  notifications: {
    items: [],
    unreadCount: 0
  },

  chat: {
    messages: [],
    unreadCount: 0,
    conversationId: null
  },

  location: {
    current: null,
    tracking: false,
    permission: 'prompt'
  },

  meta: {
    lastSync: null,
    isLoading: false,
    error: null,
    info: null,
    backendMode: null
  }
};

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

let currentState = deepClone(initialState);
export let state = deepClone(currentState);

function syncExportedState() {
  state = deepClone(currentState);
}

const listeners = new Set();

export function subscribe(listener) {
  if (typeof listener !== 'function') {
    console.warn('[State] Listener must be a function');
    return () => {};
  }

  listeners.add(listener);
  listener(deepClone(currentState));

  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners() {
  syncExportedState();
  const stateClone = deepClone(currentState);

  listeners.forEach((listener) => {
    try {
      listener(stateClone);
    } catch (error) {
      console.error('[State] Listener error:', error);
    }
  });
}

export function getState() {
  return deepClone(currentState);
}

export function setState(nextStateOrUpdater) {
  if (typeof nextStateOrUpdater === 'function') {
    const draft = deepClone(currentState);
    const result = nextStateOrUpdater(draft);
    currentState = deepClone(result ?? draft);
  } else {
    currentState = deepClone(nextStateOrUpdater);
  }

  persistState();
  notifyListeners();
}

export function updateState(updates) {
  currentState = mergeDeep(deepClone(currentState), updates);
  persistState();
  notifyListeners();
}

export function patchState(path, value) {
  const keys = path.split('.');
  let current = currentState;

  for (let i = 0; i < keys.length - 1; i++) {
    if (!(keys[i] in current)) {
      current[keys[i]] = {};
    }

    current = current[keys[i]];
  }

  current[keys[keys.length - 1]] = value;

  persistState();
  notifyListeners();
}

function mergeDeep(target, source) {
  const output = { ...target };

  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          output[key] = source[key];
        } else {
          output[key] = mergeDeep(target[key], source[key]);
        }
      } else {
        output[key] = source[key];
      }
    });
  }

  return output;
}

function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

// ============================================
// PERSISTENCE
// ============================================

function persistState() {
  try {
    localStorage.setItem(
      STORAGE_KEYS.UI_STATE,
      JSON.stringify({
        activeTab: currentState.ui.activeTab,
        isOnline: currentState.ui.isOnline
      })
    );

    localStorage.setItem(
      STORAGE_KEYS.SESSION,
      JSON.stringify({
        userId: currentState.session.userId,
        providerId: currentState.session.providerId,
        userEmail: currentState.session.userEmail,
        userName: currentState.session.userName,
        userAvatar: currentState.session.userAvatar,
        isAuthenticated: currentState.session.isAuthenticated
      })
    );

    if (currentState.activeService) {
      localStorage.setItem(
        STORAGE_KEYS.ACTIVE_SERVICE,
        JSON.stringify({
          ...currentState.activeService,
          persistedAt: Date.now()
        })
      );
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_SERVICE);
    }

    if (currentState.scheduledServices.length > 0) {
      localStorage.setItem(
        STORAGE_KEYS.SCHEDULED,
        JSON.stringify({
          services: currentState.scheduledServices,
          persistedAt: Date.now()
        })
      );
    } else {
      localStorage.removeItem(STORAGE_KEYS.SCHEDULED);
    }

    if (currentState.activeOffer) {
      localStorage.setItem(
        STORAGE_KEYS.OFFER,
        JSON.stringify({
          ...currentState.activeOffer,
          persistedAt: Date.now()
        })
      );
    } else {
      localStorage.removeItem(STORAGE_KEYS.OFFER);
    }

    localStorage.setItem(
      STORAGE_KEYS.SETTINGS,
      JSON.stringify({
        pricing: currentState.provider.pricing,
        categories: currentState.provider.categories
      })
    );

    localStorage.setItem(
      STORAGE_KEYS.CLIENT_UI,
      JSON.stringify({
        appEntered: currentState.ui.appEntered,
        selectedCategoryId: currentState.ui.selectedCategoryId,
        selectedProviderCandidateId: currentState.ui.selectedProviderCandidateId,
        categorySearchTerm: currentState.ui.categorySearchTerm,
        intentResolution: currentState.ui.intentResolution,
        showAllCategories: currentState.ui.showAllCategories,
        hasCompletedClientSearch: currentState.ui.hasCompletedClientSearch,
        showClientOnboarding: currentState.ui.showClientOnboarding,
        activeMode: currentState.ui.activeMode
      })
    );

    localStorage.setItem(
      STORAGE_KEYS.CLIENT_DRAFT,
      JSON.stringify(currentState.requestDraft)
    );

    if (currentState.client.activeRequest) {
      localStorage.setItem(
        STORAGE_KEYS.CLIENT_ACTIVE_REQUEST,
        JSON.stringify({
          ...currentState.client.activeRequest,
          persistedAt: Date.now()
        })
      );
    } else {
      localStorage.removeItem(STORAGE_KEYS.CLIENT_ACTIVE_REQUEST);
    }

    if (currentState.client.selectedProvider) {
      localStorage.setItem(
        STORAGE_KEYS.CLIENT_SELECTED_PROVIDER,
        JSON.stringify(currentState.client.selectedProvider)
      );
    } else {
      localStorage.removeItem(STORAGE_KEYS.CLIENT_SELECTED_PROVIDER);
    }

    localStorage.setItem(
      STORAGE_KEYS.CLIENT_TRACKING,
      JSON.stringify(currentState.tracking)
    );

    localStorage.setItem(STORAGE_KEYS.LAST_SEEN, Date.now().toString());
  } catch (error) {
    console.error('[State] Persistence error:', error);
  }
}

export function rehydrateState() {
  try {
    const uiState = safeParse(localStorage.getItem(STORAGE_KEYS.UI_STATE));

    if (uiState) {
      currentState.ui = {
        ...currentState.ui,
        ...uiState
      };
    }

    const session = safeParse(localStorage.getItem(STORAGE_KEYS.SESSION));

    if (session) {
      currentState.session = {
        ...currentState.session,
        ...session
      };
    }

    const activeService = safeParse(
      localStorage.getItem(STORAGE_KEYS.ACTIVE_SERVICE)
    );

    if (activeService && isServiceValid(activeService)) {
      currentState.activeService = activeService;
    }

    const scheduled = safeParse(localStorage.getItem(STORAGE_KEYS.SCHEDULED));

    if (scheduled && Array.isArray(scheduled.services)) {
      currentState.scheduledServices =
        scheduled.services.filter(isScheduledValid);
    }

    const offer = safeParse(localStorage.getItem(STORAGE_KEYS.OFFER));

    if (offer && isOfferValid(offer)) {
      currentState.activeOffer = offer;
    }

    const settings = safeParse(localStorage.getItem(STORAGE_KEYS.SETTINGS));

    if (settings) {
      if (settings.pricing) {
        currentState.provider.pricing = {
          ...currentState.provider.pricing,
          ...settings.pricing
        };
      }

      if (Array.isArray(settings.categories)) {
        currentState.provider.categories = settings.categories;
      }
    }

    const clientUi = safeParse(localStorage.getItem(STORAGE_KEYS.CLIENT_UI));
    if (clientUi) {
      currentState.ui = {
        ...currentState.ui,
        ...clientUi,
        showClientOnboarding:
          localStorage.getItem("mimi_services_client_onboarding_seen") === "1"
            ? false
            : clientUi.showClientOnboarding ?? currentState.ui.showClientOnboarding
      };
    }

    const clientDraft = safeParse(localStorage.getItem(STORAGE_KEYS.CLIENT_DRAFT));
    if (clientDraft) {
      currentState.requestDraft = {
        ...currentState.requestDraft,
        ...clientDraft
      };
    }

    const clientActiveRequest = safeParse(
      localStorage.getItem(STORAGE_KEYS.CLIENT_ACTIVE_REQUEST)
    );
    if (clientActiveRequest && isClientRequestValid(clientActiveRequest)) {
      currentState.client.activeRequest = clientActiveRequest;
    }

    const selectedProvider = safeParse(
      localStorage.getItem(STORAGE_KEYS.CLIENT_SELECTED_PROVIDER)
    );
    if (selectedProvider) {
      currentState.client.selectedProvider = selectedProvider;
    }

    const clientTracking = safeParse(localStorage.getItem(STORAGE_KEYS.CLIENT_TRACKING));
    if (clientTracking) {
      currentState.tracking = {
        ...currentState.tracking,
        ...clientTracking
      };
    }

    currentState.ui.isInitialized = true;
    notifyListeners();

    return true;
  } catch (error) {
    console.error('[State] Rehydration error:', error);
    return false;
  }
}

function safeParse(json) {
  try {
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

function isServiceValid(service) {
  if (!service) return false;

  const validStatuses = [
    'ACCEPTED',
    'PROVIDER_EN_ROUTE',
    'PROVIDER_ARRIVED',
    'EN_ROUTE',
    'ARRIVED',
    'IN_PROGRESS'
  ];

  if (!validStatuses.includes(service.status)) return false;

  if (service.persistedAt) {
    const age = Date.now() - service.persistedAt;
    if (age > 24 * 60 * 60 * 1000) return false;
  }

  return true;
}

function isScheduledValid(service) {
  if (!service || !service.scheduledFor) return false;

  const scheduledTime = new Date(service.scheduledFor).getTime();

  if (Number.isNaN(scheduledTime)) return false;

  return scheduledTime >= Date.now() - 60 * 60 * 1000;
}

function isOfferValid(offer) {
  if (!offer) return false;

  if (offer.expiresAt) {
    const expiresAt = new Date(offer.expiresAt).getTime();

    if (!Number.isNaN(expiresAt) && expiresAt < Date.now()) {
      return false;
    }
  }

  if (offer.persistedAt) {
    const age = Date.now() - offer.persistedAt;

    if (age > 5 * 60 * 1000) {
      return false;
    }
  }

  return true;
}

function isClientRequestValid(request) {
  if (!request) return false;

  const closedStatuses = ['COMPLETED', 'CANCELLED', 'EXPIRED'];
  if (closedStatuses.includes(request.status)) return false;

  if (request.persistedAt) {
    const age = Date.now() - request.persistedAt;
    if (age > 24 * 60 * 60 * 1000) return false;
  }

  return true;
}

// ============================================
// SELECTORS
// ============================================

export const selectors = {
  getProviderStatus: () => currentState.provider.status,
  getIsOnline: () => currentState.provider.status !== 'OFFLINE',
  getIsVerified: () => currentState.provider.isVerified,
  getActiveService: () => currentState.activeService,
  getHasActiveService: () => !!currentState.activeService,
  getActiveOffer: () => currentState.activeOffer,
  getHasActiveOffer: () => !!currentState.activeOffer,
  getScheduledServices: () => currentState.scheduledServices,

  getUpcomingScheduled: () => {
    const now = new Date();
    const cutoff = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    return currentState.scheduledServices.filter((service) => {
      const scheduled = new Date(service.scheduledFor);
      return scheduled >= now && scheduled <= cutoff;
    });
  },

  getUnreadNotifications: () => currentState.notifications.unreadCount,
  getUnreadChat: () => currentState.chat.unreadCount,
  getIsAuthenticated: () => currentState.session.isAuthenticated,
  getSession: () => currentState.session
};

// ============================================
// ACTIONS
// ============================================

export const actions = {
  updateState: (updates) => updateState(updates),
  setMapReady: (ready) => patchState('ui.mapReady', ready),

  setTab: (tab) => patchState('ui.activeTab', tab),
  setBottomSheetState: (state) => patchState('ui.bottomSheetState', state),

  toggleDrawer: () => patchState('ui.drawerOpen', !currentState.ui.drawerOpen),
  closeDrawer: () => patchState('ui.drawerOpen', false),

  toggleNotifications: () =>
    patchState(
      'ui.notificationDrawerOpen',
      !currentState.ui.notificationDrawerOpen
    ),

  closeNotifications: () => patchState('ui.notificationDrawerOpen', false),

  toggleChat: () =>
    patchState('ui.chatDrawerOpen', !currentState.ui.chatDrawerOpen),

  closeChat: () => patchState('ui.chatDrawerOpen', false),

  openModal: (modal) =>
    updateState({
      ui: {
        modalOpen: true,
        currentModal: modal
      }
    }),

  closeModal: () =>
    updateState({
      ui: {
        modalOpen: false,
        currentModal: null
      }
    }),

  setProviderStatus: (status) => patchState('provider.status', status),
  setVerified: (isVerified) => patchState('provider.isVerified', isVerified),
  setVerificationStatus: (status) =>
    patchState('provider.verificationStatus', status),
  setVerificationProgress: (progress) =>
    patchState('provider.verificationProgress', progress),
  setProfile: (profile) => patchState('provider.profile', profile),

  setActiveService: (service) => patchState('activeService', service),
  clearActiveService: () => patchState('activeService', null),

  updateServiceStatus: (status) => {
    if (currentState.activeService) {
      patchState('activeService.status', status);
    }
  },

  setScheduledServices: (services) => {
    patchState('scheduledServices', Array.isArray(services) ? services : []);
  },

  addScheduledService: (service) => {
    const services = [...currentState.scheduledServices, service];
    patchState('scheduledServices', services);
  },

  removeScheduledService: (id) => {
    const services = currentState.scheduledServices.filter(
      (service) => service.id !== id
    );

    patchState('scheduledServices', services);
  },

  setActiveOffer: (offer) => patchState('activeOffer', offer),
  clearActiveOffer: () => patchState('activeOffer', null),

  setSession: (session) =>
    patchState('session', {
      ...currentState.session,
      ...session
    }),

  clearSession: () => patchState('session', deepClone(initialState.session)),

  addNotification: (notification) => {
    const normalizedNotification = {
      ...notification,
      unread: notification?.unread ?? true
    };

    const items = [
      normalizedNotification,
      ...currentState.notifications.items
    ];

    const unreadCount =
      currentState.notifications.unreadCount +
      (normalizedNotification.unread ? 1 : 0);

    patchState('notifications', {
      items,
      unreadCount
    });
  },

  markNotificationsRead: () => {
    const items = currentState.notifications.items.map((notification) => ({
      ...notification,
      unread: false
    }));

    patchState('notifications', {
      items,
      unreadCount: 0
    });
  },

  addMessage: (message) => {
    const messages = [...currentState.chat.messages, message];

    patchState('chat', {
      ...currentState.chat,
      messages
    });
  },

  setChatConversation: (conversationId) =>
    patchState('chat.conversationId', conversationId),

  setLocation: (location) => patchState('location.current', location),
  setTracking: (tracking) => patchState('location.tracking', tracking),
  setLocationPermission: (permission) =>
    patchState('location.permission', permission),

  setLoading: (loading) => patchState('meta.isLoading', loading),
  setError: (error) => patchState('meta.error', error),
  setInfo: (info) => patchState('meta.info', info),
  clearError: () => patchState('meta.error', null)
};

// ============================================
// INITIALIZATION
// ============================================

export function initState() {
  rehydrateState();

  currentState.ui.activeMode = getActiveMode();
  currentState.ui.showClientOnboarding =
    localStorage.getItem("mimi_services_client_onboarding_seen") !== "1";
  syncExportedState();

  window.addEventListener('beforeunload', persistState);

  setInterval(persistState, 5000);

  return getState();
}

export function getDeviceId() {
  let deviceId = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);

  if (!deviceId) {
    deviceId =
      crypto.randomUUID?.() ||
      `device_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    localStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId);
  }

  return deviceId;
}

export function clearPersistedState() {
  Object.values(STORAGE_KEYS).forEach((key) => {
    localStorage.removeItem(key);
  });

  currentState = deepClone(initialState);
  notifyListeners();
}

export { STORAGE_KEYS };
export function setActiveMode(mode) {
  const normalized = mode === "provider" ? "provider" : "client";

  try {
    localStorage.setItem("mimi_services_active_mode", normalized);
    sessionStorage.setItem("mimi_services_active_mode", normalized);
  } catch (err) {
    console.warn("[MIMI] No se pudo guardar active mode:", err);
  }

  patchState("ui.activeMode", normalized);
  return normalized;
}

export function getActiveMode() {
  try {
    return (
      sessionStorage.getItem("mimi_services_active_mode") ||
      localStorage.getItem("mimi_services_active_mode") ||
      "client"
    );
  } catch (_) {
    return "client";
  }
}
