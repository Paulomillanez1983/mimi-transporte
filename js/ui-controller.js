/**
 * MIMI Driver - UI Controller Premium
 * Interfaz tipo Uber Driver con mejoras UX
 */

import CONFIG from './config.js';
import mapService from './map-service.js';
import soundManager from './sound-manager.js';

class UIController {
  constructor() {
    this.elements = {};
    this.countdownInterval = null;
    this.currentModal = null;
    this._toastTimeout = null;
    this._modalCallbacks = null;
    this._documentClickBound = false;
    this._tripListCountdownInterval = null;
    this._panelHandleBound = false;
    this._loadingOverlay = null;
    this._swipeHandlers = new Map();
    this._navigationMode = false;
    this._arrivalShown = false;
  }

  // =========================
  // INITIALIZATION
  // =========================
  init() {
    this._cacheElements();
    this._loadDriverName();
    this._bindDelegatedActions();
    this._bindIncomingButtons();
    this._bindPanelHandle();
    this._setupViewportFix();
    this._bindKeyboardShortcuts();
    this._bindArrivalActions();

    return this;
  }

  _cacheElements() {
    const ids = [
      'toast', 'tripPanel', 'panelContent', 'tripList', 'incomingModal',
      'navPanel', 'statPendientes', 'statHoy', 'driverName', 'estadoChofer',
      'panelHandle', 'panelSubtitle', 'tripCountBadge', 'btnAcceptIncoming',
      'btnRejectIncoming', 'panelTitle', 'mainMap', 'globalLoading',
      'navArrow', 'navStreet', 'navNext', 'navDistance',
      'navInstructionBar', 'navInstructionIcon', 'navInstructionText',
      'arrivalPanel', 'arrivalText', 'btnContinueNav', 'btnFinishTrip'
    ];

    ids.forEach(id => {
      this.elements[id] = document.getElementById(id);
    });
  }

  _bindArrivalActions() {
    // Botón continuar navegación
    this.elements.btnContinueNav?.addEventListener('click', () => {
      this.hideArrivalPanel();
    });

    // Botón finalizar viaje desde panel de llegada
    this.elements.btnFinishTrip?.addEventListener('click', () => {
      this.hideArrivalPanel();
      const event = new CustomEvent('driverAction', {
        detail: { action: 'finish', tripId: this._currentTripId, timestamp: Date.now() }
      });
      document.dispatchEvent(event);
    });
  }

  // =========================
  // GLOBAL LOADING - CORREGIDO
  // =========================
  setGlobalLoading(show, text = 'Procesando...') {
    const loading = this.elements.globalLoading;
    if (!loading) return;
    
    const textEl = loading.querySelector('.loading-text');
    if (textEl) textEl.textContent = text;
    
    if (show) {
      loading.classList.add('active');
      document.body.style.overflow = 'hidden';
    } else {
      loading.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  // =========================
  // EVENT BINDINGS
  // =========================
  _bindDelegatedActions() {
    if (this._documentClickBound) return;

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn || btn.disabled) return;

      e.preventDefault();
      e.stopPropagation();

      // Feedback táctil inmediato
      btn.classList.add('btn-active');
      setTimeout(() => btn.classList.remove('btn-active'), 150);

      const action = btn.dataset.action;
      const tripId = btn.dataset.tripId || null;

      // Debounce visual
      if (btn.dataset.processing === 'true') return;
      btn.dataset.processing = 'true';
      btn.style.opacity = '0.6';

      setTimeout(() => {
        btn.dataset.processing = 'false';
        btn.style.opacity = '1';
      }, CONFIG.BUTTON_DEBOUNCE);

      this._handleAction(action, tripId, btn);
    }, { passive: false });

    this._documentClickBound = true;
  }

  _bindIncomingButtons() {
    const acceptBtn = this.elements.btnAcceptIncoming;
    const rejectBtn = this.elements.btnRejectIncoming;

    if (acceptBtn) {
      acceptBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (this._modalCallbacks?.onAccept) {
          this._setIncomingButtonsLoading(true);
          this._modalCallbacks.onAccept();
        }
      });
    }

    if (rejectBtn) {
      rejectBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (this._modalCallbacks?.onReject) {
          this._setIncomingButtonsLoading(true);
          this._modalCallbacks.onReject();
        }
      });
    }
  }

  _bindPanelHandle() {
    if (this._panelHandleBound) return;

    const handle = this.elements.panelHandle;
    const panel = this.elements.tripPanel;
    if (!handle || !panel) return;

    let startY = 0;
    let currentY = 0;
    let isDragging = false;
    let startHeight = 0;

    // Touch events para swipe
    handle.addEventListener('touchstart', (e) => {
      isDragging = true;
      startY = e.touches[0].clientY;
      startHeight = panel.offsetHeight;
      panel.style.transition = 'none';
    }, { passive: true });

    handle.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      currentY = e.touches[0].clientY;
      const delta = startY - currentY;
      const newHeight = Math.max(80, Math.min(startHeight + delta, window.innerHeight * 0.85));
      panel.style.height = `${newHeight}px`;
    }, { passive: true });

    handle.addEventListener('touchend', () => {
      isDragging = false;
      panel.style.transition = 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
      
      // Snap a posiciones
      const currentHeight = parseInt(panel.style.height);
      const maxHeight = window.innerHeight * 0.85;
      
      if (currentHeight > maxHeight * 0.6) {
        this.expandPanel();
      } else if (currentHeight > maxHeight * 0.3) {
        this._setPanelMid();
      } else {
        this.collapsePanel();
      }
    });

    // Click simple
    handle.addEventListener('click', (e) => {
      if (!isDragging) this.togglePanel();
    });

    this._panelHandleBound = true;
  }

  _bindKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (this.currentModal === 'incoming') {
        if (e.key === 'ArrowLeft' || e.key === 'r') {
          e.preventDefault();
          this.elements.btnRejectIncoming?.click();
        } else if (e.key === 'ArrowRight' || e.key === 'a' || e.key === 'Enter') {
          e.preventDefault();
          this.elements.btnAcceptIncoming?.click();
        }
      }
    });
  }

  _handleAction(action, tripId, btn) {
    const event = new CustomEvent('driverAction', {
      detail: { action, tripId, button: btn, timestamp: Date.now() }
    });
    document.dispatchEvent(event);
  }

  // =========================
  // VIEWPORT & RESPONSIVE
  // =========================
  _setupViewportFix() {
    const setAppHeight = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--app-vh', `${vh}px`);
      document.documentElement.style.setProperty('--real-height', `${window.innerHeight}px`);
    };

    setAppHeight();
    window.addEventListener('resize', setAppHeight);
    window.addEventListener('orientationchange', () => {
      setTimeout(setAppHeight, 100);
    });

    // Prevenir bounce en iOS
    document.body.addEventListener('touchmove', (e) => {
      if (e.target.closest('.panel-content')) return;
      e.preventDefault();
    }, { passive: false });
  }

  _loadDriverName() {
    try {
      const driverData = JSON.parse(localStorage.getItem('choferData') || '{}');
      if (driverData?.nombre && this.elements.driverName) {
        this.elements.driverName.textContent = driverData.nombre;
      }
    } catch (e) {
      console.warn('Error cargando datos del conductor:', e);
    }
  }

  // =========================
  // TOAST NOTIFICATIONS
  // =========================
  showToast(message, type = 'info', duration = CONFIG.TOAST_DURATION) {
    const toast = this.elements.toast;
    if (!toast) return;

    // Cancelar toast anterior
    if (this._toastTimeout) {
      clearTimeout(this._toastTimeout);
      toast.classList.remove('show', 'slide-in');
    }

    // Configurar nuevo toast
    toast.textContent = message;
    toast.className = `toast toast-${type}`;
    
    // Forzar reflow
    void toast.offsetWidth;
    
    toast.classList.add('show', 'slide-in');

    // Auto-hide
    this._toastTimeout = setTimeout(() => {
      toast.classList.add('slide-out');
      setTimeout(() => {
        toast.classList.remove('show', 'slide-in', 'slide-out');
      }, 300);
    }, duration);
  }

  // =========================
  // STATS & STATUS
  // =========================
  updateStats(stats = {}) {
    if (this.elements.statPendientes) {
      this.elements.statPendientes.textContent = stats.pending || 0;
      this._animateValue(this.elements.statPendientes);
    }

    if (this.elements.statHoy) {
      const today = stats.today || 0;
      this.elements.statHoy.textContent = today;
      if (today > 0) this._animateValue(this.elements.statHoy);
    }
  }

  updateDriverState(state, isOnline) {
    const statusEl = this.elements.estadoChofer;
    if (!statusEl) return;

    const stateConfig = {
      INIT: { text: 'Iniciando...', class: 'status-init', color: '#666' },
      ONLINE: { text: isOnline ? '🟢 ONLINE' : '🔴 OFFLINE', class: 'status-online', color: isOnline ? '#05944F' : '#E11900' },
      BUSY: { text: '🚗 EN VIAJE', class: 'status-busy', color: '#276EF1' },
      OFFLINE: { text: '⚪ DESCONECTADO', class: 'status-offline', color: '#666' },
      ERROR: { text: '⚠️ ERROR', class: 'status-error', color: '#E11900' }
    };

    const config = stateConfig[state] || stateConfig.INIT;
    statusEl.textContent = config.text;
    statusEl.className = config.class;
    statusEl.style.color = config.color;
  }

  _animateValue(element) {
    element.classList.add('value-change');
    setTimeout(() => element.classList.remove('value-change'), 300);
  }

  // =========================
  // PANEL CONTROL
  // =========================
  togglePanel() {
    const panel = this.elements.tripPanel;
    if (!panel) return;

    if (panel.classList.contains('expanded')) {
      this.collapsePanel();
    } else {
      this.expandPanel();
    }
  }

  expandPanel() {
    const panel = this.elements.tripPanel;
    if (!panel) return;
    
    panel.classList.add('expanded');
    panel.style.height = '85vh';
    this.elements.panelContent?.classList.add('scrollable');
  }

  collapsePanel() {
    const panel = this.elements.tripPanel;
    if (!panel) return;
    
    panel.classList.remove('expanded');
    panel.style.height = '80px';
    this.elements.panelContent?.classList.remove('scrollable');
  }

  _setPanelMid() {
    const panel = this.elements.tripPanel;
    if (!panel) return;
    panel.style.height = '45vh';
  }

  // =========================
  // AVAILABLE TRIPS LIST
  // =========================
  renderAvailableTrips(trips) {
    const container = this.elements.tripList;
    const panel = this.elements.tripPanel;

    if (!container) return;

    this.hideNavigation();
    this._stopTripListCountdown();
    panel?.classList.remove('has-trip');

    const safeTrips = Array.isArray(trips) ? trips : [];

    // Actualizar badge
    if (this.elements.tripCountBadge) {
      const count = safeTrips.length;
      this.elements.tripCountBadge.textContent = count;
      this.elements.tripCountBadge.classList.toggle('has-items', count > 0);
    }

    // Actualizar subtítulo
    if (this.elements.panelSubtitle) {
      this.elements.panelSubtitle.textContent = safeTrips.length > 0
        ? `${safeTrips.length} viaje${safeTrips.length === 1 ? '' : 's'} disponible${safeTrips.length === 1 ? '' : 's'}`
        : 'Esperando solicitudes...';
    }

    if (safeTrips.length === 0) {
      container.innerHTML = this._getEmptyStateHTML();
      this.collapsePanel();
      return;
    }

    // Ordenar por distancia/precio
    const orderedTrips = [...safeTrips].sort((a, b) => {
      const scoreA = (a.precio || 0) / (a.km || 1);
      const scoreB = (b.precio || 0) / (b.km || 1);
      return scoreB - scoreA; // Mejor pago por km primero
    });

    container.innerHTML = orderedTrips.map((trip, index) => 
      this._createTripCardHTML(trip, index)
    ).join('');

    // Animación staggered
    setTimeout(() => {
      container.querySelectorAll('.trip-card').forEach((card, i) => {
        setTimeout(() => card.classList.add('visible'), i * 100);
      });
    }, 50);

    this.expandPanel();
    this._startTripListCountdown();
  }

  _getEmptyStateHTML() {
    return `
      <div class="empty-state">
        <div class="empty-icon">🚗</div>
        <h3>Sin solicitudes</h3>
        <p>Estamos buscando viajes para vos...</p>
        <div class="empty-pulse"></div>
      </div>
    `;
  }

  _createTripCardHTML(trip, index) {
    const rest = this._getOfferSecondsLeft(trip);
    const min = Math.floor(rest / 60);
    const seg = rest % 60;
    const isUrgent = rest <= 15;

    const servicio = this._escapeHtml(this._formatServiceLabel(trip.servicio || trip.tipo || 'Standard'));
    const cliente = this._escapeHtml(trip.cliente || 'Pasajero');
    const origen = this._escapeHtml(trip.origen || 'Sin origen');
    const destino = this._escapeHtml(trip.destino || 'Sin destino');
    const precio = Number(trip.precio || 0).toLocaleString('es-AR');
    const km = Number(trip.km || 0).toFixed(1);
    const tripId = this._escapeHtml(trip.id || '');
    const expiresAt = this._escapeHtml(trip.offer_expires_at || '');

    // Calcular score de valor ($/km)
    const valueScore = ((trip.precio || 0) / (trip.km || 1)).toFixed(0);
    const isGoodDeal = valueScore > 500; // $500/km es buen negocio

    return `
      <div class="trip-card ${isGoodDeal ? 'trip-card-premium' : ''}" 
           data-trip-id="${tripId}" 
           data-expires-at="${expiresAt}"
           style="animation-delay: ${index * 0.1}s">
        
        ${isGoodDeal ? '<div class="premium-badge">💰 Buen negocio</div>' : ''}
        
        <div class="trip-card-header">
          <div class="client-info">
            <div class="client-avatar">${cliente[0]}</div>
            <div>
              <span class="client-name">${cliente}</span>
              <span class="service-type">${servicio}</span>
            </div>
          </div>
          <div class="countdown-badge ${isUrgent ? 'urgent' : ''}">
            <span class="countdown-icon">⏱</span>
            <span class="countdown-time">${min}:${seg.toString().padStart(2, '0')}</span>
          </div>
        </div>

        <div class="trip-route">
          <div class="route-visual">
            <div class="route-dot pickup"></div>
            <div class="route-line"></div>
            <div class="route-dot dropoff"></div>
          </div>
          <div class="route-text">
            <div class="route-stop">
              <span class="label">Origen</span>
              <span class="value">${origen}</span>
            </div>
            <div class="route-stop">
              <span class="label">Destino</span>
              <span class="value">${destino}</span>
            </div>
          </div>
        </div>

        <div class="trip-metrics">
          <div class="metric metric-primary">
            <span class="metric-value">$${precio}</span>
            <span class="metric-label">Ganancia</span>
          </div>
          <div class="metric">
            <span class="metric-value">${km} km</span>
            <span class="metric-label">Distancia</span>
          </div>
          <div class="metric">
            <span class="metric-value">$${valueScore}</span>
            <span class="metric-label">$/km</span>
          </div>
        </div>

        <div class="trip-actions">
          <button class="btn btn-whatsapp" data-action="whatsapp" data-trip-id="${tripId}">
            <span>💬</span> WhatsApp
          </button>
          <button class="btn btn-primary btn-accept" data-action="accept" data-trip-id="${tripId}">
            <span>✓</span> Aceptar
          </button>
        </div>
      </div>
    `;
  }

  // =========================
  // ACTIVE TRIP VIEW
  // =========================
  renderActiveTrip(trip) {
    const container = this.elements.tripList;
    const panel = this.elements.tripPanel;

    if (!container || !panel || !trip) return;

    this._stopTripListCountdown();
    panel.classList.add('has-trip');

    const estado = this._normalizeState(trip.estado);
    const isEnCurso = estado === 'EN_CURSO';
    const isAceptado = estado === 'ACEPTADO';

    const servicio = this._formatServiceLabel(trip.servicio || trip.tipo || 'Standard');
    const cliente = this._escapeHtml(trip.cliente || 'Pasajero');
    const telefono = this._escapeHtml(trip.telefono || '');

    container.innerHTML = `
      <div class="active-trip-card">
        <div class="trip-status-bar status-${estado.toLowerCase()}">
          <div class="status-indicator"></div>
          <span class="status-text">${isEnCurso ? 'EN CURSO' : 'ACEPTADO'}</span>
          <span class="status-time">${this._formatTime(trip.updated_at)}</span>
        </div>

        <div class="client-section">
          <div class="client-avatar large">${cliente[0]}</div>
          <div class="client-details">
            <h3>${cliente}</h3>
            <a href="tel:${telefono}" class="phone-link">📞 ${telefono}</a>
          </div>
          <button class="btn-icon" data-action="whatsapp" data-trip-id="${trip.id}">
            💬
          </button>
        </div>

        <div class="route-section">
          <div class="route-visual large">
            <div class="route-dot pickup"></div>
            <div class="route-line"></div>
            <div class="route-dot dropoff"></div>
          </div>
          <div class="route-details">
            <div class="route-item">
              <span class="label">${isEnCurso ? 'Recogida completada' : 'Punto de recogida'}</span>
              <span class="value">${this._escapeHtml(trip.origen || '')}</span>
            </div>
            <div class="route-item">
              <span class="label">Destino final</span>
              <span class="value">${this._escapeHtml(trip.destino || '')}</span>
            </div>
          </div>
        </div>

        <div class="earnings-section">
          <div class="earnings-box">
            <span class="earnings-value">$${Number(trip.precio || 0).toLocaleString('es-AR')}</span>
            <span class="earnings-label">Ganancia estimada</span>
          </div>
          <div class="distance-box">
            <span class="distance-value">${Number(trip.km || 0).toFixed(1)} km</span>
            <span class="distance-label">Distancia total</span>
          </div>
        </div>

        ${trip.notas ? `
          <div class="notes-section">
            <span class="notes-icon">📝</span>
            <span class="notes-text">${this._escapeHtml(trip.notas)}</span>
          </div>
        ` : ''}

        <div class="action-section">
          ${isEnCurso ? `
            <button class="btn btn-navigate" data-action="navigate" data-trip-id="${trip.id}">
              <span>🧭</span> Navegar
            </button>
            <button class="btn btn-success btn-finish" data-action="finish" data-trip-id="${trip.id}">
              <span>✓</span> Finalizar viaje
            </button>
          ` : `
            <button class="btn btn-danger" data-action="cancel" data-trip-id="${trip.id}">
              <span>✕</span> Cancelar
            </button>
            <button class="btn btn-success btn-start" data-action="start" data-trip-id="${trip.id}">
              <span>▶</span> Iniciar viaje
            </button>
          `}
        </div>
      </div>
    `;

    if (this.elements.panelSubtitle) {
      this.elements.panelSubtitle.textContent = isEnCurso ? 'Viaje en progreso' : 'Dirígete al punto de recogida';
    }

    this.elements.tripCountBadge && (this.elements.tripCountBadge.textContent = '1');
    
    // Mostrar navegación si está en curso
    if (isEnCurso) {
      this.showNavigation(trip);
    }

    this.expandPanel();
  }

  // =========================
  // INCOMING MODAL (Uber-style)
  // =========================
  showIncomingModal(trip, onAccept, onReject) {
    this.currentModal = 'incoming';

    const modal = this.elements.incomingModal;
    const details = document.getElementById('incomingDetails');

    if (!modal || !details || !trip) return;

    this._stopCountdown();
    this._setIncomingButtonsLoading(false);
    this._modalCallbacks = { onAccept, onReject };

    const servicio = this._formatServiceLabel(trip.servicio || trip.tipo || 'Standard');
    const cliente = this._escapeHtml(trip.cliente || 'Pasajero');
    const origen = this._escapeHtml(trip.origen || '');
    const destino = this._escapeHtml(trip.destino || '');
    const precio = Number(trip.precio || 0).toLocaleString('es-AR');
    const km = Number(trip.km || 0).toFixed(1);

    // Calcular score
    const valueScore = ((trip.precio || 0) / (trip.km || 1)).toFixed(0);

    details.innerHTML = `
      <div class="incoming-client">
        <div class="client-avatar pulse">${cliente[0]}</div>
        <div class="client-info">
          <h3>${cliente}</h3>
          <span class="service-tag">${servicio}</span>
        </div>
      </div>

      <div class="incoming-route">
        <div class="route-mini">
          <div class="mini-dot pickup"></div>
          <div class="mini-line"></div>
          <div class="mini-dot dropoff"></div>
        </div>
        <div class="route-places">
          <span>${origen}</span>
          <span>${destino}</span>
        </div>
      </div>

      <div class="incoming-metrics">
        <div class="metric-box highlight">
          <span class="metric-value">$${precio}</span>
          <span class="metric-label">Ganancia</span>
        </div>
        <div class="metric-box">
          <span class="metric-value">${km} km</span>
          <span class="metric-label">Distancia</span>
        </div>
        <div class="metric-box ${valueScore > 500 ? 'good-deal' : ''}">
          <span class="metric-value">$${valueScore}</span>
          <span class="metric-label">$/km</span>
        </div>
      </div>
    `;

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Iniciar countdown
    const seconds = this._getOfferSecondsLeft(trip) || 30;
    this._startCountdown(seconds);
  }

  closeIncomingModal() {
    const modal = this.elements.incomingModal;
    if (modal) {
      modal.classList.remove('active');
      document.body.style.overflow = '';
    }

    this._stopCountdown();
    this._setIncomingButtonsLoading(false);
    this.currentModal = null;
    this._modalCallbacks = null;
  }

  isIncomingModalOpen() {
    return this.currentModal === 'incoming' && 
           this.elements.incomingModal?.classList.contains('active');
  }

  _setIncomingButtonsLoading(isLoading) {
    [this.elements.btnAcceptIncoming, this.elements.btnRejectIncoming].forEach(btn => {
      if (btn) {
        btn.disabled = isLoading;
        btn.classList.toggle('loading', isLoading);
      }
    });
  }

  _startCountdown(seconds) {
    const bar = document.getElementById('countdownProgress');
    const text = document.getElementById('countdownText');

    this._stopCountdown();

    const safeSeconds = Math.max(1, Number(seconds));
    let remaining = safeSeconds;

    if (bar) {
      bar.style.transition = 'none';
      bar.style.width = '100%';
      bar.classList.remove('urgent');
    }

    if (text) text.textContent = remaining;

    // Animación CSS para la barra
    requestAnimationFrame(() => {
      if (bar) {
        bar.style.transition = `width ${safeSeconds}s linear`;
        bar.style.width = '0%';
      }
    });

    this.countdownInterval = setInterval(() => {
      remaining--;

      if (text) text.textContent = remaining;

      if (remaining <= 10 && bar) {
        bar.classList.add('urgent');
      }

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

  // =========================
  // NAVIGATION PANEL - ESTILO GOOGLE MAPS
  // =========================
  showNavigation(trip) {
    this._navigationMode = true;
    this._arrivalShown = false;
    this._currentTripId = trip.id;
    
    // Mostrar panel principal de navegación
    this.elements.navPanel?.classList.add('active');
    
    // Actualizar información inicial
    this._updateNavigation(trip);
    
    // Ocultar panel de viaje para dar más espacio al mapa
    this.collapsePanel();
  }

  hideNavigation() {
    this._navigationMode = false;
    this._arrivalShown = false;
    
    this.elements.navPanel?.classList.remove('active');
    this.elements.navInstructionBar?.classList.remove('active');
    this.hideArrivalPanel();
  }

  _updateNavigation(trip) {
    const navStreet = this.elements.navStreet;
    const navNext = this.elements.navNext;
    const navArrow = this.elements.navArrow;

    const isEnCurso = trip.estado === 'EN_CURSO';

    if (navStreet) {
      navStreet.textContent = isEnCurso 
        ? (trip.destino || 'Destino').split(',')[0]
        : (trip.origen || 'Recogida').split(',')[0];
    }

    if (navNext) {
      navNext.textContent = isEnCurso 
        ? 'Dirígete al destino final'
        : 'Dirígete al punto de recogida';
    }

    if (navArrow) {
      // Cambiar icono según el contexto
      navArrow.innerHTML = isEnCurso 
        ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>';
    }
  }

  updateNavigationDistance(distanceMeters) {
    const navDistance = this.elements.navDistance;
    const navNext = this.elements.navNext;
    const navArrow = this.elements.navArrow;
    const navStreet = this.elements.navStreet;

    if (typeof distanceMeters !== 'number') return;

    // Formatear distancia
    let formatted;
    if (distanceMeters < 100) {
      formatted = `${Math.round(distanceMeters)}<small>m</small>`;
    } else if (distanceMeters < 1000) {
      formatted = `${Math.round(distanceMeters)}<small>m</small>`;
    } else {
      formatted = `${(distanceMeters / 1000).toFixed(1)}<small>km</small>`;
    }

    if (navDistance) {
      navDistance.innerHTML = formatted;
      navDistance.classList.toggle('arriving', distanceMeters < 100);
    }

    if (navNext && navArrow) {
      if (distanceMeters < 50 && !this._arrivalShown) {
        // Mostrar panel de llegada
        this._showArrivalPanel();
      } else if (distanceMeters < 200) {
        // Preparación para llegada
        navArrow.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>';
        navNext.textContent = 'Preparate para detenerte';
        navNext.classList.remove('arriving');
        if (navStreet) navStreet.textContent = 'Llegando...';
      } else {
        // Navegación normal
        navArrow.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>';
        navNext.textContent = 'Continúa derecho';
        navNext.classList.remove('arriving');
      }
    }
  }

  _showArrivalPanel() {
    this._arrivalShown = true;
    
    // Actualizar texto según el tipo de llegada
    const arrivalText = this.elements.arrivalText;
    if (arrivalText) {
      arrivalText.textContent = 'Has llegado al destino. ¿Deseas finalizar el viaje?';
    }
    
    this.elements.arrivalPanel?.classList.add('active');
    
    // Vibración y sonido de llegada
    if (navigator.vibrate) {
      navigator.vibrate([100, 100, 100, 100, 500]);
    }
  }

  hideArrivalPanel() {
    this._arrivalShown = false;
    this.elements.arrivalPanel?.classList.remove('active');
  }

  // =========================
  // MODAL SYSTEM
  // =========================
  showConfirmationModal(options = {}) {
    return new Promise((resolve) => {
      const {
        title = '¿Confirmar?',
        message = '',
        confirmText = 'Sí',
        cancelText = 'No',
        type = 'primary'
      } = options;

      const modal = document.createElement('div');
      modal.className = 'modal-overlay confirmation-modal';
      modal.innerHTML = `
        <div class="modal-card">
          <h3>${title}</h3>
          ${message ? `<p>${message}</p>` : ''}
          <div class="modal-actions">
            <button class="btn btn-secondary modal-cancel">${cancelText}</button>
            <button class="btn btn-${type} modal-confirm">${confirmText}</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      requestAnimationFrame(() => modal.classList.add('active'));

      const cleanup = () => {
        modal.classList.remove('active');
        setTimeout(() => modal.remove(), 300);
      };

      modal.querySelector('.modal-cancel').onclick = () => {
        cleanup();
        resolve(false);
      };

      modal.querySelector('.modal-confirm').onclick = () => {
        cleanup();
        resolve(true);
      };

      modal.onclick = (e) => {
        if (e.target === modal) {
          cleanup();
          resolve(false);
        }
      };
    });
  }

  showInputModal(options = {}) {
    return new Promise((resolve) => {
      const {
        title = 'Ingresar dato',
        placeholder = '',
        confirmText = 'Guardar',
        required = false
      } = options;

      const modal = document.createElement('div');
      modal.className = 'modal-overlay input-modal';
      modal.innerHTML = `
        <div class="modal-card">
          <h3>${title}</h3>
          <input type="text" class="modal-input" placeholder="${placeholder}" ${required ? 'required' : ''}>
          <div class="modal-actions">
            <button class="btn btn-secondary modal-skip">Omitir</button>
            <button class="btn btn-primary modal-confirm">${confirmText}</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      const input = modal.querySelector('.modal-input');
      setTimeout(() => input?.focus(), 100);

      requestAnimationFrame(() => modal.classList.add('active'));

      const cleanup = () => {
        modal.classList.remove('active');
        setTimeout(() => modal.remove(), 300);
      };

      modal.querySelector('.modal-skip').onclick = () => {
        cleanup();
        resolve('');
      };

      modal.querySelector('.modal-confirm').onclick = () => {
        const value = input.value.trim();
        if (required && !value) {
          input.classList.add('error');
          return;
        }
        cleanup();
        resolve(value);
      };

      input.onkeypress = (e) => {
        if (e.key === 'Enter') {
          modal.querySelector('.modal-confirm').click();
        }
      };
    });
  }

  // =========================
  // COUNTDOWNS
  // =========================
  _startTripListCountdown() {
    this._stopTripListCountdown();

    this._tripListCountdownInterval = setInterval(() => {
      document.querySelectorAll('.trip-card[data-expires-at]').forEach(card => {
        const badge = card.querySelector('.countdown-time');
        const expiresAt = card.dataset.expiresAt;
        
        if (!badge || !expiresAt) return;

        const rest = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
        const min = Math.floor(rest / 60);
        const seg = rest % 60;

        badge.textContent = `${min}:${seg.toString().padStart(2, '0')}`;

        const badgeContainer = card.querySelector('.countdown-badge');
        badgeContainer?.classList.toggle('urgent', rest <= 15);
        card.style.opacity = rest <= 0 ? '0.5' : '1';
      });
    }, 1000);
  }

  _stopTripListCountdown() {
    if (this._tripListCountdownInterval) {
      clearInterval(this._tripListCountdownInterval);
      this._tripListCountdownInterval = null;
    }
  }

  // =========================
  // UTILITIES
  // =========================
  _normalizeState(s) {
    return String(s || '').toUpperCase().replace(/[-\s]/g, '_');
  }

  _formatServiceLabel(service) {
    const labels = {
      'standard': 'Standard',
      'premium': 'Premium',
      'vip': 'VIP',
      'escolar': 'Escolar',
      'traslado': 'Traslado'
    };
    return labels[String(service).toLowerCase()] || 'Standard';
  }

  _formatTime(dateLike) {
    if (!dateLike) return '--:--';
    try {
      return new Date(dateLike).toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '--:--';
    }
  }

  _getOfferSecondsLeft(trip) {
    const exp = trip?.offer_expires_at || trip?.current_offer_expires_at;
    if (!exp) return 0;
    return Math.max(0, Math.floor((new Date(exp).getTime() - Date.now()) / 1000));
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.innerHTML;
  }
}

const uiController = new UIController();
export default uiController;
