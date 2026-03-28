/**
 * MIMI Driver - UI Controller (FINAL COMPATIBLE)
 */

import CONFIG from "./config.js";

class UIController {
  constructor() {
    this.elements = {};
    this.countdownInterval = null;
    this.currentCountdown = 0;
    this.touchStartY = 0;
    this.sheetOpen = false;
  }

  // ✅ ESTE ES EL METODO QUE APP.JS ESPERA
  init() {
    this._cacheElements();
    this._bindEvents();
    this._setupViewport();
    console.log("[UI] ✅ UIController iniciado");
  }

  // =========================================================
  // CACHE ELEMENTS
  // =========================================================
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
      "global-loading"
    ];

    ids.forEach((id) => {
      this.elements[id] = document.getElementById(id);
    });
  }

  // =========================================================
  // EVENTS
  // =========================================================
  _bindEvents() {
    // nada crítico por ahora
  }

  _setupViewport() {
    const setVH = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty("--vh", `${vh}px`);
    };

    setVH();
    window.addEventListener("resize", setVH);
  }

  // =========================================================
  // ✅ FUNCIONES QUE APP.JS USA
  // =========================================================

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
    // mode viene "ONLINE"
    const dot = this.elements["status-dot"];
    const text = this.elements["status-text"];
    const fab = document.getElementById("fab-online");

    if (dot) dot.classList.toggle("online", isOnline);

    if (text) {
      text.textContent = isOnline ? "Conectado" : "Desconectado";
    }

    if (fab) {
      fab.classList.toggle("online", isOnline);

      const fabText = document.getElementById("fab-text");
      const fabIcon = document.getElementById("fab-icon");

      if (fabText) fabText.textContent = isOnline ? "DESCONECTAR" : "CONECTAR";
      if (fabIcon) fabIcon.textContent = isOnline ? "🟢" : "🔴";
    }
  }

  updateStats(stats = {}) {
    // stats.speed / stats.accuracy (vienen del tracker)
    // acá solo mostramos lo básico si querés
    // no rompe si faltan
  }

  setDriverProfile(nameOrEmail) {
    const nameEl = this.elements["driver-name"];
    const initialEl = this.elements["driver-initial"];

    if (nameEl) nameEl.textContent = nameOrEmail || "Conductor";

    if (initialEl) {
      initialEl.textContent = (nameOrEmail || "M")
        .substring(0, 1)
        .toUpperCase();
    }
  }

  setLoading(show) {
    const loading = this.elements["global-loading"];
    if (!loading) return;
    loading.classList.toggle("active", show);
  }
}

const uiController = new UIController();
export default uiController;
