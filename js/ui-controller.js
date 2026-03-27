/**
 * MIMI Driver - UI Controller
 * Experiencia Uber Driver: Mapa siempre visible, UI flotante minimalista
 */

import CONFIG from './config.js';
import routingService from './routing-service.js';

class UIController {
  constructor() {
    this.elements = {};
    this.countdownInterval = null;
    this.currentModal = null;
    this._navigationMode = false;
    this._currentInstruction = null;
    this._currentTrip = null;
  }

  init() {
    this._cacheElements();
    this._loadDriverName();
    this._bindEvents();
    this._setupViewport();
    return this;
  }

  _cacheElements() {
    const ids = [
      'toast', 'tripPanel', 'panelContent', 'tripList', 
      'navPanel', 'navStreet', 'navNext', 'navDistance',
      'navInstructionBar', 'navInstructionIcon', 'navInstructionText',
      'arrivalPanel', 'arrivalText', 'btnFinishTrip',
      'statPendientes', 'statHoy', 'driverName', 'estadoChofer',
      'panelHandle', 'panelSubtitle', 'tripCountBadge',
      'btnToggleDisponibilidad', 'incomingModal', 'incomingDetails',
      'countdownText', 'countdownProgress', 'btnAcceptIncoming',
      'btnRejectIncoming', 'globalLoading'
    ];

    ids.forEach(id => {
      this.elements[id] = document.getElementById(id);
    });
  }

  _bindEvents() {
    // Panel handle - swipe up/down
    const handle = this.elements.panelHandle;
    const panel = this.elements.tripPanel;
    
    if (handle && panel) {
      let startY = 0;
      let isDragging = false;

      handle.addEventListener('touchstart', (e) => {
        isDragging = true;
        startY = e.touches[0].clientY;
        panel.style.transition = 'none';
      }, { passive: true });

      handle.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        const delta = startY - e.touches[0].clientY;
        const newHeight = Math.max(80, Math.min(window.innerHeight * 0.85, panel.offsetHeight + delta));
        panel.style.height = `${newHeight}px`;
      }, { passive: true });

      handle.addEventListener('touchend', () => {
        isDragging = false;
        panel.style.transition = 'height 0.3s ease';
        const currentHeight = parseInt(panel.style.height);
        
        if (currentHeight > window.innerHeight * 0.5) {
          this.expandPanel();
        } else {
          this.collapsePanel();
        }
      });

      handle.addEventListener('click', () => this.togglePanel());
    }

    // Botones de acción delegados
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;
      const tripId = btn.dataset.tripId;

      // Feedback táctil
      btn.style.transform = 'scale(0.95)';
      setTimeout(() => btn.style.transform = '', 100);

      this._emitAction(action, tripId);
    });

    // Botones del modal entrante
    this.elements.btnAcceptIncoming?.addEventListener('click', () => {
      this._modalCallbacks?.onAccept?.();
    });

    this.elements.btnRejectIncoming?.addEventListener('click', () => {
      this._modalCallbacks?.onReject?.();
    });

    // Botones de llegada
    this.elements.btnFinishTrip?.addEventListener('click', () => {
      this._emitAction('finish', this._currentTrip?.id);
      this.hideArrivalPanel();
    });
  }

  _emitAction(action, tripId) {
    document.dispatchEvent(new CustomEvent('driverAction', {
      detail: { action, tripId, timestamp: Date.now() }
    }));
  }

  _setupViewport() {
    const setHeight = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    setHeight();
    window.addEventListener('resize', setHeight);
  }

  // =========================
  // ESTADOS DEL PANEL (Uber-style)
  // =========================

  /**
   * Estado 1: Esperando solicitudes - Panel colapsado, solo header
   */
  showWaitingState() {
    this._navigationMode = false;
    this.hideNavigation();
    this.collapsePanel();
    
    if (this.elements.panelSubtitle) {
      this.elements.panelSubtitle.textContent = 'Esperando solicitudes...';
    }
    if (this.elements.tripCountBadge) {
      this.elements.tripCountBadge.textContent = '0';
      this.elements.tripCountBadge.classList.remove('has-items');
    }
    
    this.elements.tripList.innerHTML = `
      <div class="empty-state">
        <div class="pulse-indicator"></div>
        <p>Buscando viajes cercanos...</p>
      </div>
    `;
  }

  /**
   * Estado 2: Solicitud entrante - Modal sobre el mapa (no bloquea)
   */
  showIncomingTrip(trip, onAccept, onReject) {
    this._modalCallbacks = { onAccept, onReject };
    this._currentTrip = trip;

    const modal = this.elements.incomingModal;
    const details = this.elements.incomingDetails;
    
    if (!modal || !details) return;

    // Llenar detalles
    details.innerHTML = `
      <div class="trip-preview">
        <div class="route-quick">
          <span class="from">📍 ${this._escape(trip.origen)}</span>
          <span class="arrow">↓</span>
          <span class="to">🏁 ${this._escape(trip.destino)}</span>
        </div>
        <div class="trip-metrics-row">
          <div class="metric">
            <span class="value">$${Number(trip.precio).toLocaleString()}</span>
            <span class="label">Ganancia</span>
          </div>
          <div class="metric">
            <span class="value">${Number(trip.km).toFixed(1)} km</span>
            <span class="label">Distancia</span>
          </div>
        </div>
      </div>
    `;

    modal.classList.add('active');
    this._startCountdown(30);
  }

  hideIncomingModal() {
    this.elements.incomingModal?.classList.remove('active');
    this._stopCountdown();
  }

  /**
   * Estado 3: Viaje aceptado - Navegación activa, panel minimalista
   */
  showNavigationState(trip) {
    this._currentTrip = trip;
    this._navigationMode = true;
    this.hideIncomingModal();
    
    // Mostrar barra de navegación superior (estilo Google Maps)
    this.showNavigationBar(trip);
    
    // Panel inferior colapsado con info esencial
    this.showTripInfoPanel(trip);
  }

  showNavigationBar(trip) {
    const nav = this.elements.navPanel;
    if (!nav) return;

    nav.classList.add('active');
    
    // Actualizar con primera instrucción cuando esté disponible
    this.updateNavigationDisplay({
      text: 'Calculando ruta...',
      distance: trip.km * 1000,
      type: 'straight'
    });
  }

  updateNavigationDisplay(instruction) {
    if (!instruction) return;

    const { text, distance, type, next } = instruction;

    // Calle actual
    if (this.elements.navStreet) {
      this.elements.navStreet.textContent = text || 'Continúa';
    }

    // Siguiente maniobra
    if (this.elements.navNext && next) {
      this.elements.navNext.textContent = `Luego: ${next.text}`;
    }

    // Distancia
    if (this.elements.navDistance) {
      const formatted = distance < 1000 
        ? `${Math.round(distance)} m` 
        : `${(distance/1000).toFixed(1)} km`;
      this.elements.navDistance.textContent = formatted;
    }

    // Icono de dirección
    const iconEl = this.elements.navPanel?.querySelector('.nav-arrow');
    if (iconEl) {
      const icons = {
        straight: '↑',
        left: '←',
        right: '→',
        slight_left: '↖',
        slight_right: '↗',
        uturn: '↩',
        roundabout: '↻'
      };
      iconEl.textContent = icons[type] || '↑';
    }
  }

  showTripInfoPanel(trip) {
    const container = this.elements.tripList;
    if (!container) return;

    container.innerHTML = `
      <div class="active-trip-compact">
        <div class="client-bar">
          <span class="client-name">${this._escape(trip.cliente)}</span>
          <a href="tel:${trip.telefono}" class="call-btn">📞</a>
          <button class="whatsapp-btn" data-action="whatsapp" data-trip-id="${trip.id}">💬</button>
        </div>
        
        <div class="action-bar">
          ${trip.estado === 'ACEPTADO' ? `
            <button class="btn btn-success" data-action="start" data-trip-id="${trip.id}">
              ▶ Iniciar viaje
            </button>
            <button class="btn btn-danger" data-action="cancel" data-trip-id="${trip.id}">
              ✕ Cancelar
            </button>
          ` : `
            <button class="btn btn-navigate" data-action="navigate" data-trip-id="${trip.id}">
              🧭 Navegar
            </button>
            <button class="btn btn-success" data-action="finish" data-trip-id="${trip.id}">
              ✓ Llegué al destino
            </button>
          `}
        </div>
      </div>
    `;

    this.collapsePanel();
  }

  /**
   * Estado 4: Llegada al destino
   */
  showArrival() {
    this.elements.arrivalPanel?.classList.add('active');
    if (navigator.vibrate) {
      navigator.vibrate([100, 100, 300]);
    }
  }

  hideArrivalPanel() {
    this.elements.arrivalPanel?.classList.remove('active');
  }

  hideNavigation() {
    this._navigationMode = false;
    this.elements.navPanel?.classList.remove('active');
    this.elements.navInstructionBar?.classList.remove('active');
  }

  // =========================
  // UTILIDADES
  // =========================

  expandPanel() {
    const panel = this.elements.tripPanel;
    if (panel) {
      panel.style.height = '85vh';
      panel.classList.add('expanded');
    }
  }

  collapsePanel() {
    const panel = this.elements.tripPanel;
    if (panel) {
      panel.style.height = '80px';
      panel.classList.remove('expanded');
    }
  }

  togglePanel() {
    const panel = this.elements.tripPanel;
    if (panel?.classList.contains('expanded')) {
      this.collapsePanel();
    } else {
      this.expandPanel();
    }
  }

  _startCountdown(seconds) {
    const bar = this.elements.countdownProgress;
    const text = this.elements.countdownText;
    
    this._stopCountdown();
    
    let remaining = seconds;
    if (text) text.textContent = remaining;
    
    if (bar) {
      bar.style.transition = 'none';
      bar.style.width = '100%';
      setTimeout(() => {
        bar.style.transition = `width ${seconds}s linear`;
        bar.style.width = '0%';
      }, 50);
    }

    this.countdownInterval = setInterval(() => {
      remaining--;
      if (text) text.textContent = remaining;
      if (remaining <= 0) {
        this._stopCountdown();
        this._modalCallbacks?.onReject?.();
      }
    }, 1000);
  }

  _stopCountdown() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  showToast(message, type = 'info', duration = 3000) {
    const toast = this.elements.toast;
    if (!toast) return;

    toast.textContent = message;
    toast.className = `toast toast-${type} show`;
    
    setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  }

  setGlobalLoading(show, text = 'Procesando...') {
    const loading = this.elements.globalLoading;
    if (!loading) return;
    
    const textEl = loading.querySelector('.loading-text');
    if (textEl) textEl.textContent = text;
    
    loading.classList.toggle('active', show);
    document.body.style.overflow = show ? 'hidden' : '';
  }

  updateStats(stats) {
    if (this.elements.statPendientes) {
      this.elements.statPendientes.textContent = stats.pending || 0;
    }
    if (this.elements.statHoy) {
      this.elements.statHoy.textContent = stats.today || 0;
    }
  }

  updateDriverState(state, isOnline) {
    const el = this.elements.estadoChofer;
    if (!el) return;

    const states = {
      INIT: { text: 'Iniciando...', color: '#666' },
      ONLINE: { text: isOnline ? '🟢 ONLINE' : '🔴 OFFLINE', color: isOnline ? '#05944F' : '#E11900' },
      BUSY: { text: '🚗 EN VIAJE', color: '#276EF1' },
      OFFLINE: { text: '⚪ DESCONECTADO', color: '#666' }
    };

    const config = states[state] || states.INIT;
    el.textContent = config.text;
    el.style.color = config.color;
  }

  _loadDriverName() {
    try {
      const data = JSON.parse(localStorage.getItem('choferData') || '{}');
      if (this.elements.driverName && data.nombre) {
        this.elements.driverName.textContent = data.nombre;
      }
    } catch (e) {}
  }

  _escape(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }
}

const uiController = new UIController();
export default uiController;
