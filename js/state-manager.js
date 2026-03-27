
/**
 * MIMI Driver - State Manager
 * Finite State Machine for driver and trip states
 */

class StateManager {
  constructor() {
    this.state = {
      driver: {
        status: CONFIG.DRIVER_STATES.OFFLINE,
        isOnline: false,
        isAvailable: false,
        location: null,
        lastUpdate: null
      },
      trip: {
        current: null,
        pending: null,
        history: []
      },
      ui: {
        bottomSheetOpen: false,
        modalOpen: false,
        navigationActive: false
      },
      system: {
        isLoading: false,
        isOffline: false,
        error: null
      }
    };
    
    this.listeners = new Map();
    this.previousState = null;
  }

  // Get current state (immutable copy)
  getState() {
    return JSON.parse(JSON.stringify(this.state));
  }

  // Get specific path
  get(path) {
    return path.split('.').reduce((obj, key) => obj?.[key], this.state);
  }

  // Set state with path
  set(path, value) {
    this.previousState = JSON.parse(JSON.stringify(this.state));
    
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((obj, key) => {
      if (!obj[key]) obj[key] = {};
      return obj[key];
    }, this.state);
    
    target[lastKey] = value;
    
    this._notify(path, value, this.previousState);
  }

  // Merge state
  merge(updates) {
    this.previousState = JSON.parse(JSON.stringify(this.state));
    this._deepMerge(this.state, updates);
    this._notify('state', this.state, this.previousState);
  }

  // Subscribe to changes
  subscribe(path, callback) {
    if (!this.listeners.has(path)) {
      this.listeners.set(path, new Set());
    }
    this.listeners.get(path).add(callback);
    
    // Return unsubscribe
    return () => {
      this.listeners.get(path)?.delete(callback);
    };
  }

  // Transition driver state
  transitionDriver(newState, data = {}) {
    const validTransitions = {
      [CONFIG.DRIVER_STATES.OFFLINE]: [CONFIG.DRIVER_STATES.ONLINE],
      [CONFIG.DRIVER_STATES.ONLINE]: [
        CONFIG.DRIVER_STATES.OFFLINE,
        CONFIG.DRIVER_STATES.RECEIVING_OFFER
      ],
      [CONFIG.DRIVER_STATES.RECEIVING_OFFER]: [
        CONFIG.DRIVER_STATES.ONLINE,
        CONFIG.DRIVER_STATES.GOING_TO_PICKUP
      ],
      [CONFIG.DRIVER_STATES.GOING_TO_PICKUP]: [
        CONFIG.DRIVER_STATES.ONLINE,
        CONFIG.DRIVER_STATES.PASSENGER_ONBOARD
      ],
      [CONFIG.DRIVER_STATES.PASSENGER_ONBOARD]: [
        CONFIG.DRIVER_STATES.IN_PROGRESS
      ],
      [CONFIG.DRIVER_STATES.IN_PROGRESS]: [
        CONFIG.DRIVER_STATES.ARRIVED,
        CONFIG.DRIVER_STATES.ONLINE
      ],
      [CONFIG.DRIVER_STATES.ARRIVED]: [
        CONFIG.DRIVER_STATES.ONLINE
      ]
    };

    const currentState = this.state.driver.status;
    const allowed = validTransitions[currentState] || [];

    if (!allowed.includes(newState) && currentState !== newState) {
      console.warn(`Invalid transition: ${currentState} -> ${newState}`);
      return false;
    }

    this.set('driver.status', newState);
    this.set('driver', { ...this.state.driver, ...data });
    
    // Trigger side effects
    this._onStateChange(currentState, newState);
    
    return true;
  }

  // Private: Deep merge
  _deepMerge(target, source) {
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key]) target[key] = {};
        this._deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }

  // Private: Notify listeners
  _notify(path, value, previous) {
    // Notify specific path
    this.listeners.get(path)?.forEach(cb => {
      try { cb(value, previous); } catch (e) { console.error(e); }
    });
    
    // Notify wildcards
    const parts = path.split('.');
    let currentPath = '';
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}.${part}` : part;
      const wildcard = `${currentPath}.*`;
      this.listeners.get(wildcard)?.forEach(cb => {
        try { cb(value, previous); } catch (e) { console.error(e); }
      });
    }
    
    // Notify global
    this.listeners.get('*')?.forEach(cb => {
      try { cb(this.state, previous); } catch (e) { console.error(e); }
    });
  }

  // Private: Side effects on state change
  _onStateChange(from, to) {
    // Update online status based on driver state
    const isOnline = to !== CONFIG.DRIVER_STATES.OFFLINE;
    if (isOnline !== this.state.driver.isOnline) {
      this.set('driver.isOnline', isOnline);
    }

    // Emit custom event
    window.dispatchEvent(new CustomEvent('driverStateChange', {
      detail: { from, to, state: this.getState() }
    }));
  }
}

// Singleton
const stateManager = new StateManager();
