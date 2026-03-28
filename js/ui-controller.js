/**
 * MIMI Driver - UI Controller (CORREGIDO)
 */

import CONFIG from "./config.js";

class UIController {
  constructor() {
    this.elements = {};
    this.countdownInterval = null;
    this.currentCountdown = 0;
    this.touchStartY = 0;
    this.sheetOpen = false;
    this.currentTripCallbacks = {}; // Guardar callbacks actuales
  }

  init() {
    this._cacheElements();
    this._bindEvents();
    this._setupViewport();
    console.log("[UI] ✅ UIController iniciado");
  }

  _cacheElements() {
    const ids = [
      "driver-name",
      "driver-initial",
      "status-dot",
      "status-text",
      "stat-earnings",
      "stat-trips",
      "fab-online",
      "fab-text",
      "fab-icon",
      "toast-container",
      "global-loading",
      // Elementos del modal de viaje
      "incoming-modal",
      "trip-pickup",
      "trip-dropoff", 
      "trip-distance",
      "trip-price",
      "trip-duration",
      "client-name",
      "client-phone",
      "btn-accept",
      "btn-reject",
      "countdown-number",
      "countdown-circle"
    ];

    ids.forEach((id) => {
      this.elements[id] = document.getElementById(id);
    });
  }

  _bindEvents() {
    // Binding seguro para botones del modal (delegación de eventos)
    document.addEventListener('click', (e) => {
      const btnAccept = e.target.closest('#btn-accept');
      const btnReject = e.target.closest('#btn-reject');
      
      if (btnAccept) {
        e.preventDefault();
        e.stopPropagation();
        console.log("[UI] Click ACEPTAR detectado");
        this._handleAccept();
      }
      
      if (btnReject) {
        e.preventDefault();
        e.stopPropagation();
        console.log("[UI] Click RECHAZAR detectado");
        this._handleReject();
      }
    });
  }

  _handleAccept() {
    console.log("[UI] Procesando aceptación...");
    this._clearCountdown();
    const modal = this.elements["incoming-modal"];
    if (modal) modal.classList.remove("active");
    
    if (this.currentTripCallbacks.onAccept) {
      this.currentTripCallbacks.onAccept();
    }
  }

  _handleReject() {
    console.log("[UI] Procesando rechazo...");
    this._clearCountdown();
    const modal = this.elements["incoming-modal"];
    if (modal) modal.classList.remove("active");
    
    if (this.currentTripCallbacks.onReject) {
      this.currentTripCallbacks.onReject();
    }
  }

  _setupViewport() {
    const setVH = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty("--vh", `${vh}px`);
    };
    setVH();
    window.addEventListener("resize", setVH);
  }

  showToast(message, type = "info", duration = 3000) {
    const container = this.elements["toast-container"];
    if (!container) {
      console.warn("[UI] Toast container no existe");
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
      transition: opacity 0.3s;
    `;

    let icon = "ℹ️";
    if (type === "success") icon = "✅";
    if (type === "error") icon = "❌";
    if (type === "warning") icon = "⚠️";

    toast.textContent = `${icon} ${message}`;
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

  updateStats(stats = {}) {
    // Implementar si es necesario
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

  // =========================================================
  // 🚗 MOSTRAR VIAJE ENTRANTE - CORREGIDO
  // =========================================================
  showIncomingTrip(trip, onAccept, onReject) {
    console.log("[UI] Mostrando viaje:", trip);

    // Guardar callbacks para uso posterior
    this.currentTripCallbacks = { onAccept, onReject };

    const modal = this.elements["incoming-modal"];
    if (!modal) {
      console.error("[UI] ERROR: Modal 'incoming-modal' no encontrado en DOM");
      return;
    }

    // Asegurar que no haya countdown previo activo
    this._clearCountdown();

    // Extraer datos con múltiples fallback por si vienen con nombres diferentes
    const origen = trip.origen || trip.origin || "Origen no disponible";
    const destino = trip.destino || trip.destination || "Destino no disponible";
    const distancia = trip.distancia_km || trip.distancia || trip.distance || trip.km || "--";
    const duracion = trip.duracion_min || trip.duracion || trip.duration || trip.tiempo || "--";
    const precio = trip.precio || trip.price || trip.costo || trip.valor || "--";
    const cliente = trip.cliente || trip.client_name || trip.nombre_cliente || "Cliente";
    const telefono = trip.telefono || trip.phone || trip.celular || "";

    console.log("[UI] Datos extraídos:", { origen, destino, distancia, duracion, precio, cliente });

    // Actualizar DOM con verificación de existencia
    this._setTextContent("trip-pickup", origen);
    this._setTextContent("trip-dropoff", destino);
    this._setTextContent("trip-distance", distancia + " km");
    this._setTextContent("trip-price", "$" + precio);
    this._setTextContent("trip-duration", duracion + " min");
    this._setTextContent("client-name", cliente);
    this._setTextContent("client-phone", telefono);

    // Mostrar modal
    modal.classList.add("active");
    console.log("[UI] Modal activado");

    // Iniciar countdown
    this._startCountdown(onReject);
  }

  _setTextContent(elementId, text) {
    const el = this.elements[elementId];
    if (el) {
      el.textContent = text;
    } else {
      console.warn(`[UI] Elemento '${elementId}' no encontrado`);
    }
  }

  _startCountdown(onTimeout) {
    this.currentCountdown = 15;
    
    const countdownText = this.elements["countdown-number"];
    const circle = this.elements["countdown-circle"];

    if (countdownText) countdownText.textContent = this.currentCountdown;
    if (circle) circle.style.strokeDashoffset = 0;

    console.log("[UI] Iniciando countdown:", this.currentCountdown);

    this.countdownInterval = setInterval(() => {
      this.currentCountdown--;
      console.log("[UI] Countdown:", this.currentCountdown);

      if (countdownText) countdownText.textContent = this.currentCountdown;
      
      if (circle) {
        const offset = 283 - ((this.currentCountdown / 15) * 283);
        circle.style.strokeDashoffset = offset;
      }

      if (this.currentCountdown <= 0) {
        console.log("[UI] Countdown finalizado");
        this._clearCountdown();
        
        const modal = this.elements["incoming-modal"];
        if (modal) modal.classList.remove("active");
        
        if (onTimeout) onTimeout();
      }
    }, 1000);
  }

  _clearCountdown() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
      console.log("[UI] Countdown limpiado");
    }
  }

  closeTripModal() {
    this._clearCountdown();
    const modal = this.elements["incoming-modal"];
    if (modal) modal.classList.remove("active");
  }
}

const uiController = new UIController();
export default uiController;
