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
  // UI State
  ui: {
    isInitialized: false,
    activeTab: 'now',
    bottomSheetState: 'collapsed', // collapsed, peek, expanded
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

  // Session
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

  // Provider State
  provider: {
    status: 'OFFLINE', // OFFLINE, ONLINE_IDLE, INVITED, BOOKED_UPCOMING, EN_ROUTE, ARRIVED, IN_SERVICE
    isVerified: false,
    verificationStatus: 'pending', // pending, in_review, approved, rejected
    verificationProgress: 0,
    profile: null,
    categories: [],
    pricing: {
      basePrice: 8000,
      hourlyRate: 4000,
      jobRate: null,
      mode: 'hourly' // hourly, job
    },
    stats: {
      rating: 5.0,
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

  // Active Service
  activeService: null,
  // {
  //   id: null,
  //   requestId: null,
  //   status: null, // ACCEPTED, EN_ROUTE, ARRIVED, IN_PROGRESS, COMPLETED
  //   serviceType: null,
  //   clientName: null,
  //   clientAvatar: null,
  //   location: null,
  //   address: null,
  //   price: null,
  //   scheduledFor: null,
  //   startedAt: null,
  //   conversationId: null
  // }

  // Scheduled Services (Agenda)
  scheduledServices: [],
  // [{
  //   id: null,
  //   serviceType: null,
  //   clientName: null,
  //   location: null,
  //   address: null,
  //   price: null,
  //   scheduledFor: null,
  //   distance: null,
  //   duration: null
  // }]

  // Active Offer
  activeOffer: null,
  // {
  //   id: null,
  //   requestId: null,
  //   serviceType: null,
  //   clientName: null,
  //   location: null,
  //   price: null,
  //   mode: null,
  //   expiresAt: null,
  //   createdAt: null
  // }

  // Notifications
  notifications: {
    items: [],
    unreadCount: 0
  },

  // Chat
  chat: {
    messages: [],
    unreadCount: 0,
    conversationId: null
  },

  // Location
  location: {
    current: null, // { lat, lng, accuracy, timestamp }
    tracking: false,
    permission: 'prompt' // granted, denied, prompt
  },

  // Meta
  meta: {
    lastSync: null,
    isLoading: false,
    error: null,
    info: null
  }
};

// Deep clone helper
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// Current state
let currentState = deepClone(initialState);

// Listeners
const listeners = new Set();

/**
 * Subscribe to state changes
 * @param {Function} listener - Callback function
 * @returns {Function} Unsubscribe function
 */
export function subscribe(listener) {
  if (typeof listener !== 'function') {
    console.warn('[State] Listener must be a function');
    return () => {};
  }
  
  listeners.add(listener);
  
  // Immediately call with current state
  listener(deepClone(currentState));
  
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Notify all listeners of state change
 */
function notifyListeners() {
  const stateClone = deepClone(currentState);
  listeners.forEach(listener => {
    try {
      listener(stateClone);
    } catch (error) {
      console.error('[State] Listener error:', error);
    }
  });
}

/**
 * Get current state (immutable copy)
 * @returns {Object} Deep clone of current state
 */
export function getState() {
  return deepClone(currentState);
}

/**
 * Set state (full replacement)
 * @param {Object} newState - New state object
 */
export function setState(newState) {
  currentState = deepClone(newState);
  persistState();
  notifyListeners();
}

/**
 * Update state (partial merge)
 * @param {Object} updates - Partial state updates
 */
export function updateState(updates) {
  currentState = mergeDeep(deepClone(currentState), updates);
  persistState();
  notifyListeners();
}

/**
 * Patch state at path
 * @param {string} path - Dot-notation path
 * @param {any} value - Value to set
 */
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

/**
 * Merge objects deeply
 */
function mergeDeep(target, source) {
  const output = { ...target };
  
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
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

/**
 * Persist state to localStorage
 */
function persistState() {
  try {
    // Persist specific sections
    localStorage.setItem(STORAGE_KEYS.UI_STATE, JSON.stringify({
      activeTab: currentState.ui.activeTab,
      isOnline: currentState.ui.isOnline
    }));
    
    localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify({
      userId: currentState.session.userId,
      providerId: currentState.session.providerId,
      userEmail: currentState.session.userEmail,
      userName: currentState.session.userName,
      isAuthenticated: currentState.session.isAuthenticated
    }));
    
    if (currentState.activeService) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_SERVICE, JSON.stringify({
        ...currentState.activeService,
        persistedAt: Date.now()
      }));
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_SERVICE);
    }
    
    if (currentState.scheduledServices.length > 0) {
      localStorage.setItem(STORAGE_KEYS.SCHEDULED, JSON.stringify({
        services: currentState.scheduledServices,
        persistedAt: Date.now()
      }));
    } else {
      localStorage.removeItem(STORAGE_KEYS.SCHEDULED);
    }
    
    if (currentState.activeOffer) {
      localStorage.setItem(STORAGE_KEYS.OFFER, JSON.stringify({
        ...currentState.activeOffer,
        persistedAt: Date.now()
      }));
    } else {
      localStorage.removeItem(STORAGE_KEYS.OFFER);
    }
    
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify({
      pricing: currentState.provider.pricing,
      categories: currentState.provider.categories
    }));
    
    localStorage.setItem(STORAGE_KEYS.LAST_SEEN, Date.now().toString());
    
  } catch (error) {
    console.error('[State] Persistence error:', error);
  }
}

/**
 * Rehydrate state from localStorage
 */
export function rehydrateState() {
  try {
    // Rehydrate UI state
    const uiState = safeParse(localStorage.getItem(STORAGE_KEYS.UI_STATE));
    if (uiState) {
      currentState.ui = { ...currentState.ui, ...uiState };
    }
    
    // Rehydrate session
    const session = safeParse(localStorage.getItem(STORAGE_KEYS.SESSION));
    if (session) {
      currentState.session = { ...currentState.session, ...session };
    }
    
    // Rehydrate active service
    const activeService = safeParse(localStorage.getItem(STORAGE_KEYS.ACTIVE_SERVICE));
    if (activeService && isServiceValid(activeService)) {
      currentState.activeService = activeService;
    }
    
    // Rehydrate scheduled services
    const scheduled = safeParse(localStorage.getItem(STORAGE_KEYS.SCHEDULED));
    if (scheduled && scheduled.services) {
      currentState.scheduledServices = scheduled.services.filter(isScheduledValid);
    }
    
    // Rehydrate active offer
    const offer = safeParse(localStorage.getItem(STORAGE_KEYS.OFFER));
    if (offer && isOfferValid(offer)) {
      currentState.activeOffer = offer;
    }
    
    // Rehydrate settings
    const settings = safeParse(localStorage.getItem(STORAGE_KEYS.SETTINGS));
    if (settings) {
      if (settings.pricing) {
        currentState.provider.pricing = { ...currentState.provider.pricing, ...settings.pricing };
      }
      if (settings.categories) {
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

/**
 * Safe JSON parse
 */
function safeParse(json) {
  try {
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

/**
 * Check if service is still valid
 */
function isServiceValid(service) {
  if (!service) return false;
  
  // Service is valid if not completed/cancelled and not too old
  const validStatuses = ['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'];
  if (!validStatuses.includes(service.status)) return false;
  
  // Check if not too old (24 hours)
  if (service.persistedAt) {
    const age = Date.now() - service.persistedAt;
    if (age > 24 * 60 * 60 * 1000) return false;
  }
  
  return true;
}

/**
 * Check if scheduled service is still valid
 */
function isScheduledValid(service) {
  if (!service || !service.scheduledFor) return false;
  
  // Check if not in the past
  const scheduledTime = new Date(service.scheduledFor).getTime();
  if (scheduledTime < Date.now() - 60 * 60 * 1000) return false; // 1 hour grace
  
  return true;
}

/**
 * Check if offer is still valid
 */
function isOfferValid(offer) {
  if (!offer) return false;
  
  // Check if not expired
  if (offer.expiresAt) {
    if (new Date(offer.expiresAt).getTime() < Date.now()) return false;
  }
  
  // Check if not too old (5 minutes)
  if (offer.persistedAt) {
    const age = Date.now() - offer.persistedAt;
    if (age > 5 * 60 * 1000) return false;
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
    const cutoff = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48 hours
    return currentState.scheduledServices.filter(s => {
      const scheduled = new Date(s.scheduledFor);
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

  // UI Actions
  setTab: (tab) => patchState('ui.activeTab', tab),
  setBottomSheetState: (state) => patchState('ui.bottomSheetState', state),
  toggleDrawer: () => patchState('ui.drawerOpen', !currentState.ui.drawerOpen),
  closeDrawer: () => patchState('ui.drawerOpen', false),
  toggleNotifications: () => patchState('ui.notificationDrawerOpen', !currentState.ui.notificationDrawerOpen),
  closeNotifications: () => patchState('ui.notificationDrawerOpen', false),
  toggleChat: () => patchState('ui.chatDrawerOpen', !currentState.ui.chatDrawerOpen),
  closeChat: () => patchState('ui.chatDrawerOpen', false),
  openModal: (modal) => updateState({ ui: { modalOpen: true, currentModal: modal } }),
  closeModal: () => updateState({ ui: { modalOpen: false, currentModal: null } }),
  
  // Provider Actions
  setProviderStatus: (status) => patchState('provider.status', status),
  setVerified: (isVerified) => patchState('provider.isVerified', isVerified),
  setVerificationStatus: (status) => patchState('provider.verificationStatus', status),
  setVerificationProgress: (progress) => patchState('provider.verificationProgress', progress),
  setProfile: (profile) => patchState('provider.profile', profile),
  
  // Service Actions
  setActiveService: (service) => patchState('activeService', service),
  clearActiveService: () => patchState('activeService', null),
  updateServiceStatus: (status) => {
    if (currentState.activeService) {
      patchState('activeService.status', status);
    }
  },
  
  // Scheduled Actions
  setScheduledServices: (services) => patchState('scheduledServices', services),
  addScheduledService: (service) => {
    const services = [...currentState.scheduledServices, service];
    patchState('scheduledServices', services);
  },
  removeScheduledService: (id) => {
    const services = currentState.scheduledServices.filter(s => s.id !== id);
    patchState('scheduledServices', services);
  },
  
  // Offer Actions
  setActiveOffer: (offer) => patchState('activeOffer', offer),
  clearActiveOffer: () => patchState('activeOffer', null),
  
  // Session Actions
  setSession: (session) => patchState('session', { ...currentState.session, ...session }),
  clearSession: () => patchState('session', deepClone(initialState.session)),
  
  // Notification Actions
  addNotification: (notification) => {
    const items = [notification, ...currentState.notifications.items];
    const unreadCount = currentState.notifications.unreadCount + (notification.unread ? 1 : 0);
    patchState('notifications', { items, unreadCount });
  },
  markNotificationsRead: () => {
    const items = currentState.notifications.items.map(n => ({ ...n, unread: false }));
    patchState('notifications', { items, unreadCount: 0 });
  },
  
  // Chat Actions
  addMessage: (message) => {
    const messages = [...currentState.chat.messages, message];
    patchState('chat', { ...currentState.chat, messages });
  },
  setChatConversation: (conversationId) => patchState('chat.conversationId', conversationId),
  
  // Location Actions
  setLocation: (location) => patchState('location.current', location),
  setTracking: (tracking) => patchState('location.tracking', tracking),
  setLocationPermission: (permission) => patchState('location.permission', permission),
  
  // Meta Actions
  setLoading: (loading) => patchState('meta.isLoading', loading),
  setError: (error) => patchState('meta.error', error),
  setInfo: (info) => patchState('meta.info', info),
  clearError: () => patchState('meta.error', null)
};

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize state
 */
export function initState() {
  rehydrateState();
  
  // Setup beforeunload handler for persistence
  window.addEventListener('beforeunload', persistState);
  
  // Periodic persistence (every 5 seconds)
  setInterval(persistState, 5000);
  
  return getState();
}

/**
 * Get or create device ID
 */
export function getDeviceId() {
  let deviceId = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
  if (!deviceId) {
    deviceId = crypto.randomUUID?.() || `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId);
  }
  return deviceId;
}

/**
 * Clear all persisted state
 */
export function clearPersistedState() {
  Object.values(STORAGE_KEYS).forEach(key => {
    localStorage.removeItem(key);
  });
  currentState = deepClone(initialState);
  notifyListeners();
}

// Export storage keys for external use
export { STORAGE_KEYS };
