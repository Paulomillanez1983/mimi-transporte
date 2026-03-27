/**
 * MIMI Driver - State Manager (PRODUCTION FINAL)
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
        navigationActive: false,
        arrivalShown: false
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

  // =========================================================
  // GETTERS
  // =========================================================

  getState() {
    return JSON.parse(JSON.stringify(this.state));
  }

  get(path) {
    return path.split('.').reduce((obj, key) => obj?.[key], this.state);
  }

  // =========================================================
  // SETTERS
  // =========================================================

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

  merge(updates) {
    this.previousState = JSON.parse(JSON.stringify(this.state));
    this._deepMerge(this.state, updates);
    this._notify('state', this.state, this.previousState);
  }

  // =========================================================
  // SUBSCRIPTIONS
  // =========================================================

  subscribe(path, callback) {
    if (!this.listeners.has(path)) {
      this.listeners.set(path, new Set());
    }

    this.listeners.get(path).add(callback);

    return () => {
      this.listeners.get(path)?.delete(callback);
    };
  }

  // =========================================================
  // FSM TRANSITION (PRODUCTION SAFE)
  // =========================================================

  transitionDriver(newState, data = {}) {
    const validTransitions = {
      [CONFIG.DRIVER_STATES.OFFLINE]: [
        CONFIG.DRIVER_STATES.ONLINE,
        CONFIG.DRIVER_STATES.RECEIVING_OFFER
      ],

      [CONFIG.DRIVER_STATES.ONLINE]: [
        CONFIG.DRIVER_STATES.OFFLINE,
        CONFIG.DRIVER_STATES.RECEIVING_OFFER,
        CONFIG.DRIVER_STATES.GOING_TO_PICKUP
      ],

      [CONFIG.DRIVER_STATES.RECEIVING_OFFER]: [
        CONFIG.DRIVER_STATES.ONLINE,
        CONFIG.DRIVER_STATES.GOING_TO_PICKUP,
        CONFIG.DRIVER_STATES.OFFLINE
      ],

      [CONFIG.DRIVER_STATES.GOING_TO_PICKUP]: [
        CONFIG.DRIVER_STATES.ONLINE,
        CONFIG.DRIVER_STATES.PASSENGER_ONBOARD,
        CONFIG.DRIVER_STATES.IN_PROGRESS,
        CONFIG.DRIVER_STATES.OFFLINE
      ],

      [CONFIG.DRIVER_STATES.PASSENGER_ONBOARD]: [
        CONFIG.DRIVER_STATES.IN_PROGRESS,
        CONFIG.DRIVER_STATES.GOING_TO_PICKUP,
        CONFIG.DRIVER_STATES.OFFLINE
      ],

      [CONFIG.DRIVER_STATES.IN_PROGRESS]: [
        CONFIG.DRIVER_STATES.ARRIVED,
        CONFIG.DRIVER_STATES.ONLINE,
        CONFIG.DRIVER_STATES.OFFLINE
      ],

      [CONFIG.DRIVER_STATES.ARRIVED]: [
        CONFIG.DRIVER_STATES.ONLINE,
        CONFIG.DRIVER_STATES.IN_PROGRESS,
        CONFIG.DRIVER_STATES.OFFLINE
      ]
    };

    const currentState = this.state.driver.status;
    const allowed = validTransitions[currentState] || [];

    if (currentState !== newState && !allowed.includes(newState)) {
      console.warn(`[StateManager] Invalid transition blocked: ${currentState} -> ${newState}`);
      return false;
    }

    const isOnline = newState !== CONFIG.DRIVER_STATES.OFFLINE;

    this.merge({
      driver: {
        ...this.state.driver,
        ...data,
        status: newState,
        isOnline: isOnline,
        isAvailable: isOnline
      }
    });

    this._onStateChange(currentState, newState);
    return true;
  }

  // =========================================================
  // PRIVATE
  // =========================================================

  _deepMerge(target, source) {
    for (const key in source) {
      if (
        source[key] &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key])
      ) {
        if (!target[key]) target[key] = {};
        this._deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }

  _notify(path, value, previous) {
    this.listeners.get(path)?.forEach((cb) => {
      try {
        cb(value, previous);
      } catch (e) {
        console.error(e);
      }
    });

    const parts = path.split('.');
    let currentPath = '';

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}.${part}` : part;
      const wildcard = `${currentPath}.*`;

      this.listeners.get(wildcard)?.forEach((cb) => {
        try {
          cb(value, previous);
        } catch (e) {
          console.error(e);
        }
      });
    }

    this.listeners.get('*')?.forEach((cb) => {
      try {
        cb(this.state, previous);
      } catch (e) {
        console.error(e);
      }
    });
  }

  _onStateChange(from, to) {
    window.dispatchEvent(
      new CustomEvent('driverStateChange', {
        detail: { from, to, state: this.getState() }
      })
    );
  }
}

// Singleton
const stateManager = new StateManager();
