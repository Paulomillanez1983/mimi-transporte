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
  LAST_SEEN: 'mimi_provider_last_seen'
};

// Initial State
const initialState = {
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
    installPrompt: null
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
    info: null
  }
};

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

let currentState = deepClone(initialState);

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

export function setState(newState) {
  currentState = deepClone(newState);
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
