/**
 * MIMI Driver - UI Controller (GPS-SAFE)
 */

class UIController {
  constructor() {
    this.elements = {};
    this.countdownInterval = null;
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
    
    ids.forEach(id => {
      this.elements[id] = document.getElementById(id);
    });
  }

  // ✅ FIX: Bind directo a botones, NO usar document.addEventListener global
  _bindEvents() {
    const acceptBtn = this.elements["btn-accept"];
    const rejectBtn = this.elements["btn-reject"];

    if (acceptBtn) {
      acceptBtn.onclick = (e) => {
        e.stopPropagation();
        this._handleAccept();
      };
    }

    if (rejectBtn) {
      rejectBtn.onclick = (e) => {
        e.stopPropagation();
        this._handleReject();
      };
    }
  }

  _handleAccept() {
    if (!this.isOpen || this._lock) return;
    this._lock = true;
    
    console.log("[UI] Accepting trip");
    const cb = this.callbacks.onAccept;
    this._closeModal();
    
    setTimeout(() => {
      this._lock = false;
      if (cb) {
        try { 
          const result = cb();
          if (result && result.then) result.catch(console.error);
        } catch(e) { console.error(e); }
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
        try { cb(); } catch(e) { console.error(e); }
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
    }
    
    this.isOpen = false;
    this.callbacks = {};
  }

  showIncomingTrip(trip, onAccept, onReject) {
    console.log("[UI] Showing trip:", trip.id);
    
    if (this.isOpen) this._closeModal();
    
    this.callbacks = { onAccept, onReject };
    const modal = this.elements["incoming-modal"];
    
    if (!modal) return;

    // Actualizar datos
    this._setText("trip-pickup", trip.origen || "Origen");
    this._setText("trip-dropoff", trip.destino || "Destino");
    this._setText("trip-distance", (trip.distancia_km || '--') + " km");
    this._setText("trip-price", "$" + (trip.precio || '--'));
    this._setText("trip-duration", (trip.duracion_min || '--') + " min");
    this._setText("client-name", trip.cliente || "Cliente");
    this._setText("client-phone", trip.telefono || "");

    modal.classList.add("active");
    this.isOpen = true;
    
    this._startCountdown();
  }

  _setText(elementId, text) {
    const el = this.elements[elementId];
    if (el) el.textContent = text;
  }

  _startCountdown() {
    let count = 15;
    const counter = this.elements["countdown-number"];
    if (counter) counter.textContent = count;

    this.countdownInterval = setInterval(() => {
      count--;
      if (counter) counter.textContent = count;
      if (count <= 0) this._handleReject();
    }, 1000);
  }

  showToast(msg, type = "info") {
    const container = this.elements["toast-container"];
    if (!container) return;
    
    const toast = document.createElement("div");
    toast.style.cssText = `
      background: rgba(28,28,30,0.95);
      color: white;
      padding: 12px 16px;
      border-radius: 12px;
      margin-top: 8px;
      font-weight: 700;
      z-index: 100000;
      position: relative;
    `;
    const icons = { info: "ℹ️", success: "✅", error: "❌", warning: "⚠️" };
    toast.textContent = `${icons[type] || "ℹ️"} ${msg}`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
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
      if (fabText) fabText.textContent = isOnline ? "DESCONECTAR" : "CONECTAR";
    }
  }

  setDriverProfile(name) {
    const nameEl = this.elements["driver-name"];
    const initialEl = this.elements["driver-initial"];
    if (nameEl) nameEl.textContent = name || "Conductor";
    if (initialEl) initialEl.textContent = (name || "C").charAt(0).toUpperCase();
  }

  setLoading(show) {
    const loading = this.elements["global-loading"];
    if (loading) loading.classList.toggle("active", show);
  }
}

export default new UIController();
