/**
 * MIMI Driver - UI Controller (Production Ready)
 * Fixes: GPS blocking, memory leaks, event delegation
 */

import CONFIG from "./config.js";

class UIController {
  constructor() {
    this.elements = {};
    this.countdownInterval = null;
    this.currentCountdown = 0;
    this.callbacks = {};
    this.isOpen = false;
    this._lock = false;
  }

  init() {
    this._cacheElements();
    this._bindEvents();
    console.log("[UI] Controller initialized");
  }

  _cacheElements() {
    const ids = [
      "driver-name", "driver-initial", "status-dot", "status-text",
      "stat-earnings", "stat-trips", "fab-online", "fab-text", "fab-icon",
      "toast-container", "global-loading", "incoming-modal", "trip-pickup",
      "trip-dropoff", "trip-distance", "trip-price", "trip-duration",
      "client-name", "client-phone", "btn-accept", "btn-reject",
      "countdown-number", "countdown-circle", "pickup-time"
    ];
    
    ids.forEach(id => this.elements[id] = document.getElementById(id));
  }

  // ✅ FIX: Bind directo a botones, NO usar document.addEventListener global
  _bindEvents() {
    const acceptBtn = this.elements["btn-accept"];
    const rejectBtn = this.elements["btn-reject"];

    if (acceptBtn) {
      acceptBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Solo stopPropagation, NO preventDefault global
        this._handleAccept();
      });
    }

    if (rejectBtn) {
      rejectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._handleReject();
      });
    }
  }

  _handleAccept() {
    if (!this.isOpen || this._lock) return;
    this._lock = true; // Prevenir doble-click
    
    console.log("[UI] Accepting trip");
    const cb = this.callbacks.onAccept;
    
    // Cerrar PRIMERO, luego ejecutar callback
    this._closeModal();
    
    // ✅ FIX: setTimeout para liberar el thread antes del callback async
    setTimeout(() => {
      this._lock = false;
      if (cb) {
        try {
          const result = cb();
          if (result && typeof result.then === 'function') {
            result.catch(err => console.error("[UI] Async error:", err));
          }
        } catch (err) {
          console.error("[UI] Callback error:", err);
        }
      }
    }, 50);
  }

  _handleReject() {
    if (!this.isOpen || this._lock) return;
    this._lock = true;
    
    console.log("[UI] Rejecting trip");
    const cb = this.callbacks.onReject;
    this._closeModal();
    
    setTimeout(() => {
      this._lock = false;
      if (cb) {
        try { cb(); } catch (err) { console.error(err); }
      }
    }, 50);
  }

  _closeModal() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    
    const modal = this.elements["incoming-modal"];
    if (modal) {
      modal.classList.remove("active");
      // ✅ FIX: No manipular style agresivamente, NO tocar pointer-events
    }
    
    this.isOpen = false;
    this.callbacks = {};
  }

  // ✅ Método público único para mostrar viajes
  showIncomingTrip(tripData, onAccept, onReject) {
    console.log("[UI] Showing trip:", tripData.id);
    
    // Si hay uno abierto, cerrarlo primero
    if (this.isOpen) this._closeModal();
    
    const modal = this.elements["incoming-modal"];
    if (!modal) {
      console.error("[UI] Modal not found");
      return;
    }

    this.callbacks = { onAccept, onReject };
    
    // Actualizar UI
    this._setText("trip-pickup", tripData.origen || "Origen no disponible");
    this._setText("trip-dropoff", tripData.destino || "Destino no disponible");
    this._setText("trip-distance", (tripData.distancia_km || '--') + " km");
    this._setText("trip-price", "$" + (tripData.precio || '--'));
    this._setText("trip-duration", (tripData.duracion_min || '--') + " min");
    this._setText("client-name", tripData.cliente || "Cliente");
    this._setText("client-phone", tripData.telefono || "Sin teléfono");

    modal.classList.add("active");
    this.isOpen = true;
    
    this._startCountdown(onReject);
  }

  _setText(elementId, text) {
    const el = this.elements[elementId];
    if (el) el.textContent = text;
  }

  _startCountdown(onTimeout) {
    this.currentCountdown = 15;
    const counter = this.elements["countdown-number"];
    if (counter) counter.textContent = this.currentCountdown;

    this.countdownInterval = setInterval(() => {
      this.currentCountdown--;
      if (counter) counter.textContent = this.currentCountdown;
      
      if (this.currentCountdown <= 0) {
        this._handleReject(); // Auto-reject on timeout
        if (onTimeout) onTimeout();
      }
    }, 1000);
  }

  // Utilidades básicas
  showToast(message, type = "info", duration = 3000) {
    const container = this.elements["toast-container"];
    if (!container) return alert(message);

    const toast = document.createElement("div");
    toast.style.cssText = `
      background: rgba(28,28,30,0.95);
      border: 1px solid rgba(255,255,255,0.1);
      padding: 12px 16px;
      border-radius: 12px;
      margin-top: 8px;
      color: white;
      font-weight: 600;
      backdrop-filter: blur(10px);
      box-shadow: 0 8px 20px rgba(0,0,0,0.5);
      max-width: 90vw;
      text-align: center;
      font-size: 14px;
      animation: slideDown 0.3s ease;
      z-index: 10000;
      position: relative;
    `;
    
    const icons = { info: "ℹ️", success: "✅", error: "❌", warning: "⚠️" };
    toast.textContent = `${icons[type] || "ℹ️"} ${message}`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  updateDriverState(mode, isOnline) {
    const dot = this.elements["status-dot"];
    const text = this.elements["status-text"];
    const fab = this.elements["fab-online"];

    if (dot) dot.classList.toggle("online", isOnline);
    if (text) text.textContent = isOnline ? "Conectado" : "Desconectado";
    
    if (fab) {
      fab.classList.toggle("online", isOnline);
      const fabText = this.elements["fab-text"];
      const fabIcon = this.elements["fab-icon"];
      if (fabText) fabText.textContent = isOnline ? "DESCONECTAR" : "CONECTAR";
      if (fabIcon) fabIcon.textContent = isOnline ? "🟢" : "🔴";
    }
  }

  setDriverProfile(nameOrEmail) {
    const nameEl = this.elements["driver-name"];
    const initialEl = this.elements["driver-initial"];
    if (nameEl) nameEl.textContent = nameOrEmail || "Conductor";
    if (initialEl) initialEl.textContent = (nameOrEmail || "C").charAt(0).toUpperCase();
  }

  setLoading(show) {
    const loading = this.elements["global-loading"];
    if (loading) loading.classList.toggle("active", show);
  }
}

export default new UIController();
