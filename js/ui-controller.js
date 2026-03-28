/**
 * MIMI Driver - UI Controller (CORREGIDO FINAL)
 */

import CONFIG from "./config.js";

class UIController {
  constructor() {
    this.elements = {};
    this.countdownInterval = null;
    this.currentCountdown = 0;
    this.touchStartY = 0;
    this.sheetOpen = false;
    this.currentTripCallbacks = {};
    this.isModalActive = false;
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
      "countdown-circle",
      "pickup-time",
      "arrival-panel"
    ];

    ids.forEach((id) => {
      this.elements[id] = document.getElementById(id);
    });

    // Cachear backdrop específicamente
    const modal = this.elements["incoming-modal"];
    if (modal) {
      this.elements["modal-backdrop"] = modal.querySelector(".modal-backdrop");
    }
  }

  _bindEvents() {
    // Delegación de eventos para los botones del modal
    document.addEventListener('click', (e) => {
      if (e.target.closest('#btn-accept')) {
        e.preventDefault();
        e.stopPropagation();
        this._handleAccept();
      }
      
      if (e.target.closest('#btn-reject')) {
        e.preventDefault();
        e.stopPropagation();
        this._handleReject();
      }
    });

    // Cerrar al clickear backdrop (opcional)
    if (this.elements["modal-backdrop"]) {
      this.elements["modal-backdrop"].addEventListener('click', (e) => {
        if (e.target === this.elements["modal-backdrop"]) {
          this._handleReject();
        }
      });
    }
  }

  _handleAccept() {
    if (!this.isModalActive) return;
    
    console.log("[UI] ✅ Botón ACEPTAR clickeado");
    
    // Cerrar PRIMERO el modal, luego ejecutar callback
    this._clearCountdown();
    this._closeModal();
    
    // Ejecutar callback con protección de errores
    if (this.currentTripCallbacks.onAccept) {
      try {
        console.log("[UI] Ejecutando callback onAccept...");
        this.currentTripCallbacks.onAccept();
        console.log("[UI] Callback onAccept ejecutado OK");
      } catch (error) {
        console.error("[UI] ❌ Error en callback onAccept:", error);
        this.showToast("Error al aceptar viaje", "error");
      }
    }
  }

  _handleReject() {
    if (!this.isModalActive) return;
    
    console.log("[UI] ❌ Botón RECHAZAR clickeado");
    
    // Cerrar PRIMERO el modal, luego ejecutar callback
    this._clearCountdown();
    this._closeModal();
    
    // Ejecutar callback con protección de errores
    if (this.currentTripCallbacks.onReject) {
      try {
        console.log("[UI] Ejecutando callback onReject...");
        this.currentTripCallbacks.onReject();
        console.log("[UI] Callback onReject ejecutado OK");
      } catch (error) {
        console.error("[UI] ❌ Error en callback onReject:", error);
      }
    }
  }

  _closeModal() {
    console.log("[UI] Cerrando modal...");
    const modal = this.elements["incoming-modal"];
    
    if (modal) {
      // Forzar cierre inmediato sin animaciones que puedan trabar
      modal.classList.remove("active");
      
      // Forzar display none para evitar que quede "tildado" visualmente
      modal.style.display = "none";
      setTimeout(() => {
        if (!modal.classList.contains("active")) {
          modal.style.display = "";
        }
      }, 100);
      
      this.isModalActive = false;
      console.log("[UI] ✅ Modal cerrado correctamente");
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
      z-index: 10000;
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
    console.log("[UI] 📦 Mostrando viaje:", trip);

    // Guardar callbacks
    this.currentTripCallbacks = { onAccept, onReject };

    // Limpiar estado previo
    this._clearCountdown();
    
    const modal = this.elements["incoming-modal"];
    if (!modal) {
      console.error("[UI] ERROR: Modal no encontrado");
      return;
    }

    // Extraer datos con múltiples fallbacks
    const origen = trip.origen || trip.origin || trip.pickup || "Dirección no disponible";
    const destino = trip.destino || trip.destination || trip.dropoff || "Destino no disponible";
    const distancia = trip.distancia_km || trip.distancia || trip.distance || "--";
    const duracion = trip.duracion_min || trip.duracion || trip.duration || trip.time || "--";
    const precio = trip.precio || trip.price || trip.fare || trip.cost || "--";
    const cliente = trip.cliente || trip.client_name || trip.passenger || "Cliente";
    const telefono = trip.telefono || trip.phone || trip.celular || "";

    console.log("[UI] Datos procesados:", { origen, destino, distancia, duracion, precio, cliente });

    // Actualizar DOM
    this._setText("trip-pickup", origen);
    this._setText("trip-dropoff", destino);
    this._setText("trip-distance", distancia !== "--" ? `${distancia} km` : "-- km");
    this._setText("trip-price", precio !== "--" ? `$${precio}` : "$--");
    this._setText("trip-duration", duracion !== "--" ? `${duracion} min` : "-- min");
    this._setText("client-name", cliente);
    this._setText("client-phone", telefono || "Sin teléfono");
    this._setText("pickup-time", duracion !== "--" ? `${duracion} min` : "-- min");

    // Resetear display por si estaba oculto por un cierre anterior
    modal.style.display = "";
    modal.classList.add("active");
    this.isModalActive = true;
    console.log("[UI] Modal activado");

    // Iniciar countdown
    this._startCountdown(onReject);
  }

  _setText(elementId, text) {
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
    
    if (circle) {
      circle.style.strokeDasharray = "283";
      circle.style.strokeDashoffset = "0";
    }

    console.log("[UI] ⏱️ Countdown iniciado:", this.currentCountdown);

    this.countdownInterval = setInterval(() => {
      this.currentCountdown--;
      
      if (countdownText) countdownText.textContent = this.currentCountdown;
      
      if (circle) {
        const offset = 283 - ((this.currentCountdown / 15) * 283);
        circle.style.strokeDashoffset = offset;
      }

      if (this.currentCountdown <= 0) {
        console.log("[UI] ⏱️ Countdown finalizado");
        this._clearCountdown();
        this._closeModal();
        
        if (onTimeout) {
          try {
            onTimeout();
          } catch (error) {
            console.error("[UI] Error en callback timeout:", error);
          }
        }
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
    this._closeModal();
  }
}

const uiController = new UIController();
export default uiController;
