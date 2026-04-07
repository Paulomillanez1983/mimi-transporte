/**
 * MIMI Driver - State Manager (PRODUCTION FINAL FIXED)
 * FSM alineada 100% con CONFIG
 */

import CONFIG from './config.js';

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
    return structuredClone(this.state);
  }

  get(path) {
    return path.split('.').reduce((obj, key) => obj?.[key], this.state);
  }

  // =========================================================
  // SETTERS
  // =========================================================
  set(path, value) {
    this.previousState = structuredClone(this.state);

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
    this.previousState = structuredClone(this.state);
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
  // FSM CORREGIDA
  // =========================================================
  transitionDriver(newState, data = {}) {
    const S = CONFIG.DRIVER_STATES;

    const validTransitions = {
      [S.OFFLINE]: [
        S.ONLINE_IDLE
      ],

      [S.ONLINE_IDLE]: [
        S.OFFLINE,
        S.RECEIVING_OFFER
      ],

      [S.RECEIVING_OFFER]: [
        S.ONLINE_IDLE,
        S.GOING_TO_PICKUP,
        S.OFFLINE
      ],

      [S.GOING_TO_PICKUP]: [
        S.ARRIVED_PICKUP,
        S.OFFLINE
      ],

      [S.ARRIVED_PICKUP]: [
        S.TRIP_STARTED,
        S.GOING_TO_PICKUP,
        S.OFFLINE
      ],

      [S.TRIP_STARTED]: [
        S.ARRIVED_DESTINATION,
        S.OFFLINE
      ],

      [S.ARRIVED_DESTINATION]: [
        S.TRIP_COMPLETED,
        S.TRIP_STARTED,
        S.OFFLINE
      ],

      [S.TRIP_COMPLETED]: [
        S.ONLINE_IDLE,
        S.OFFLINE
      ]
    };

    const currentState = this.state.driver.status;

    if (currentState === newState) return true;

    const allowed = validTransitions[currentState] || [];

    if (!allowed.includes(newState)) {
      console.warn(
        `[StateManager] 🚫 Transición inválida: ${currentState} -> ${newState}`
      );
      return false;
    }

    const isOnline = newState !== S.OFFLINE;

    this.merge({
      driver: {
        ...this.state.driver,
        ...data,
        status: newState,
        isOnline,
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
    this.listeners.get(path)?.forEach(cb => {
      try { cb(value, previous); } catch (e) { console.error(e); }
    });

    this.listeners.get('*')?.forEach(cb => {
      try { cb(this.state, previous); } catch (e) { console.error(e); }
    });
  }

  _onStateChange(from, to) {
    console.log(`[StateManager] ${from} -> ${to}`);

    window.dispatchEvent(
      new CustomEvent('driverStateChange', {
        detail: { from, to, state: this.getState() }
      })
    );
  }
}

// Singleton
const stateManager = new StateManager();
export default stateManager;
