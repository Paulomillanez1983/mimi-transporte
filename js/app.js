/**
 * MIMI Driver - UI Controller (FINAL)
 */

import CONFIG from "./config.js";

class UIController {
  constructor() {
    this.elements = {};
    this.countdownInterval = null;
    this.currentCountdown = 0;
    this.currentCallbacks = {};
    this.isModalOpen = false;
  }

  init() {
    this._cacheElements();
    this._bindEvents();
    console.log("[UI] ✅ UIController iniciado");
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

    ids.forEach((id) => {
      this.elements[id] = document.getElementById(id);
    });
  }

  _bindEvents() {
    // Delegación simple y efectiva
    document.addEventListener('click', (e) => {
      if (!this.isModalOpen) return;
      
      if (e.target.closest('#btn-accept')) {
        e.preventDefault();
        e.stopPropagation();
        this._accept();
      }
      
      if (e.target.closest('#btn-reject')) {
        e.preventDefault();
        e.stopPropagation();
        this._reject();
      }
    });
  }

  _accept() {
    console.log("[UI] Aceptar clickeado");
    this._closeModal();
    
    // Ejecutar callback asíncrono para no bloquear
    if (this.currentCallbacks.onAccept) {
      setTimeout(() => {
        try {
          this.currentCallbacks.onAccept();
        } catch (err) {
          console.error("[UI] Error callback accept:", err);
        }
      }, 50);
    }
  }

  _reject() {
    console.log("[UI] Rechazar clickeado");
    this._closeModal();
    
    if (this.currentCallbacks.onReject) {
      setTimeout(() => {
        try {
          this.currentCallbacks.onReject();
        } catch (err) {
          console.error("[UI] Error callback reject:", err);
        }
      }, 50);
    }
  }

  _closeModal() {
    console.log("[UI] Cerrando modal");
    
    clearInterval(this.countdownInterval);
    this.countdownInterval = null;
    
    const modal = this.elements["incoming-modal"];
    if (modal) {
      modal.classList.remove("active");
    }
    
    this.isModalOpen = false;
    this.currentCallbacks = {};
  }

  showToast(message, type = "info", duration = 3000) {
    const container = this.elements["toast-container"];
    if (!container) {
      alert(message);
      return;
    }

    const toast = document.createElement("div");
    toast.style.cssText = `
      background: rgba(28,28,30,0.95);
      border: 1px solid rgba(255,255,255,0.15);
      padding: 12px 16px;
      border-radius: 12px;
      margin-top: 8px;
      color: white;
      font-weight: 700;
      backdrop-filter: blur(10px);
      box-shadow: 0 8px 20px rgba(0,0,0,0.5);
      max-width: 90vw;
      text-align: center;
      font-size: 14px;
      z-index: 100000;
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
    if (initialEl) {
      initialEl.textContent = (nameOrEmail || "M").substring(0, 1).toUpperCase();
    }
  }

  setLoading(show) {
    const loading = this.elements["global-loading"];
    if (loading) loading.classList.toggle("active", show);
  }

  showIncomingTrip(trip, onAccept, onReject) {
    console.log("[UI] Mostrando viaje:", trip.id || trip);

    // Cerrar si hay uno abierto
    if (this.isModalOpen) {
      this._closeModal();
    }

    this.currentCallbacks = { onAccept, onReject };
    const modal = this.elements["incoming-modal"];
    
    if (!modal) {
      console.error("[UI] Modal no encontrado");
      return;
    }

    // Actualizar datos
    this._setText("trip-pickup", trip.origen || "Origen no disponible");
    this._setText("trip-dropoff", trip.destino || "Destino no disponible");
    this._setText("trip-distance", (trip.distancia_km || '--') + " km");
    this._setText("trip-price", "$" + (trip.precio || '--'));
    this._setText("trip-duration", (trip.duracion_min || '--') + " min");
    this._setText("client-name", trip.cliente || "Cliente");
    this._setText("client-phone", trip.telefono || "Sin teléfono");

    // Mostrar
    modal.classList.add("active");
    this.isModalOpen = true;
    
    // Countdown
    this._startCountdown(onReject);
  }

  _setText(elementId, text) {
    const el = this.elements[elementId];
    if (el) el.textContent = text;
  }

  _startCountdown(onTimeout) {
    this.currentCountdown = 15;
    const text = this.elements["countdown-number"];
    if (text) text.textContent = this.currentCountdown;

    this.countdownInterval = setInterval(() => {
      this.currentCountdown--;
      if (text) text.textContent = this.currentCountdown;
      
      if (this.currentCountdown <= 0) {
        this._closeModal();
        if (onTimeout) {
          setTimeout(() => onTimeout(), 50);
        }
      }
    }, 1000);
  }
}

const uiController = new UIController();
export default uiController;
