/**
 * Controlador de interfaz - Renderizado y manipulación del DOM
 * Producción Mobile-First / Uber-like
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
    this._panelTouchState = null;
  }

  init() {
    this.elements = {
      toast: document.getElementById('toast'),
      tripPanel: document.getElementById('tripPanel'),
      panelContent: document.getElementById('panelContent'),
      tripList: document.getElementById('tripList'),
      incomingModal: document.getElementById('incomingModal'),
      navPanel: document.getElementById('navPanel'),
      statsPendientes: document.getElementById('statPendientes'),
      statsHoy: document.getElementById('statHoy'),
      driverName: document.getElementById('driverName'),
      driverStatus: document.getElementById('estadoChofer'),
      panelHandle: document.getElementById('panelHandle'),
      panelSubtitle: document.getElementById('panelSubtitle'),
      panelTitle: document.getElementById('panelTitle'),
      tripCountBadge: document.getElementById('tripCountBadge'),
      btnAcceptIncoming: document.getElementById('btnAcceptIncoming'),
      btnRejectIncoming: document.getElementById('btnRejectIncoming'),
      btnToggleDisponibilidad: document.getElementById('btnToggleDisponibilidad')
    };

    try {
      const driverData = JSON.parse(localStorage.getItem('choferData') || '{}');
      if (driverData.nombre && this.elements.driverName) {
        this.elements.driverName.textContent = driverData.nombre;
      }
    } catch (e) {
      console.warn('No se pudo cargar choferData:', e);
    }

    if (!this._documentClickBound) {
      const delegatedHandler = (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn || btn.disabled) return;

        e.preventDefault();
        e.stopPropagation();

        const action = btn.dataset.action;
        const tripId = btn.dataset.tripId;
        this._handleAction(action, tripId, btn);
      };

      document.addEventListener('click', delegatedHandler, { passive: false });
      this._documentClickBound = true;
    }

    if (this.elements.btnAcceptIncoming) {
      this.elements.btnAcceptIncoming.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (this._modalCallbacks?.onAccept) {
          this._setIncomingButtonsLoading(true);
          this._modalCallbacks.onAccept();
        }
      }, { passive: false });
    }

    if (this.elements.btnRejectIncoming) {
      this.elements.btnRejectIncoming.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (this._modalCallbacks?.onReject) {
          this._setIncomingButtonsLoading(true);
          this._modalCallbacks.onReject();
        }
      }, { passive: false });
    }

    if (this.elements.panelHandle) {
      this._bindPanelHandle();
    }

    return this;
  }

  _bindPanelHandle() {
    const handle = this.elements.panelHandle;
    if (!handle) return;

    let touchMoved = false;
    let startY = 0;

    handle.addEventListener('touchstart', (e) => {
      touchMoved = false;
      startY = e.touches?.[0]?.clientY || 0;
    }, { passive: true });

    handle.addEventListener('touchmove', (e) => {
      const currentY = e.touches?.[0]?.clientY || 0;
      if (Math.abs(currentY - startY) > 8) {
        touchMoved = true;
      }
    }, { passive: true });

    handle.addEventListener('touchend', (e) => {
      if (!touchMoved) {
        e.preventDefault();
        this.togglePanel();
      }
    }, { passive: false });

    handle.addEventListener('click', (e) => {
      e.preventDefault();
      this.togglePanel();
    }, { passive: false });
  }

  _handleAction(action, tripId, btn) {
    if (btn?.disabled) return;

    const event = new CustomEvent('driverAction', {
      detail: { action, tripId, button: btn }
    });

    document.dispatchEvent(event);
  }

  isIncomingModalOpen() {
    return this.currentModal === 'incoming' &&
      this.elements.incomingModal?.classList.contains('active');
  }

  _setIncomingButtonsLoading(isLoading) {
    const acceptBtn = this.elements.btnAcceptIncoming;
    const rejectBtn = this.elements.btnRejectIncoming;

    if (acceptBtn) {
      acceptBtn.disabled = !!isLoading;
      acceptBtn.textContent = isLoading ? 'Procesando...' : 'Aceptar';
    }

    if (rejectBtn) {
      rejectBtn.disabled = !!isLoading;
      rejectBtn.textContent = isLoading ? 'Procesando...' : 'Rechazar';
    }
  }

  showToast(message, type = 'info', duration = 3000) {
    const toast = this.elements.toast;
    if (!toast) return;

    toast.textContent = message || '';
    toast.className = `toast ${type} show`;

    if (this._toastTimeout) {
      clearTimeout(this._toastTimeout);
    }

    this._toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  }

  updateStats(stats = {}) {
    if (this.elements.statsPendientes) {
      this.elements.statsPendientes.textContent = String(stats.pending ?? 0);
    }

    if (this.elements.statsHoy) {
      this.elements.statsHoy.textContent = String(stats.today ?? 0);
    }
  }

  renderAvailableTrips(trips) {
    const container = this.elements.tripList;
    const panel = this.elements.tripPanel;

    if (!container) return;

    if (panel) {
      panel.classList.remove('has-trip');
    }

    this.hideNavigation();
    this._stopTripListCountdown();

    const safeTrips = Array.isArray(trips) ? trips : [];

    if (this.elements.tripCountBadge) {
      this.elements.tripCountBadge.textContent = String(safeTrips.length);
    }

    if (this.elements.panelTitle) {
      this.elements.panelTitle.textContent = 'Solicitudes';
    }

    if (this.elements.panelSubtitle) {
      this.elements.panelSubtitle.textContent =
        safeTrips.length > 0
          ? `${safeTrips.length} viaje${safeTrips.length === 1 ? '' : 's'} esperando`
          : 'Esperando solicitudes...';
    }

    if (safeTrips.length === 0) {
      container.innerHTML = this._getEmptyStateHTML();

      if (panel) {
        panel.classList.remove('expanded');
      }

      return;
    }

    const orderedTrips = [...safeTrips].sort((a, b) => {
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });

    container.innerHTML = orderedTrips.map(t => this._createTripCardHTML(t)).join('');

    if (panel) {
      panel.classList.add('expanded');
    }

    this._startTripListCountdown();
  }

  renderActiveTrip(trip) {
    const container = this.elements.tripList;
    const panel = this.elements.tripPanel;

    if (!container || !panel || !trip) return;

    this._stopTripListCountdown();
    panel.classList.add('has-trip');

    const estado = this._normalizeState(trip.estado);
    const isEnCurso = estado === 'EN_CURSO';
    const servicioLabel = this._formatServiceLabel(trip.servicio || trip.tipo || 'Standard');
    const clienteNombre = this._escapeHtml(trip.cliente || 'Pasajero');
    const clienteInicial = this._escapeHtml((trip.cliente || '?')[0]);

    container.innerHTML = `
      <div class="trip-card-uber">
        <div class="trip-status-bar">
          <div class="status-indicator ${estado.toLowerCase()}"></div>
          <span style="font-weight: 900; text-transform: uppercase; font-size: 13px;">
            ${this._escapeHtml(estado.replaceAll('_', ' '))}
          </span>
          <span style="margin-left: auto; color: var(--text-secondary); font-size: 13px;">
            ${this._formatTime(trip.fecha_hora || trip.fecha || trip.created_at)}
          </span>
        </div>

        <div class="client-bar">
          <div class="client-avatar">${clienteInicial}</div>
          <div class="client-details">
            <h4>${clienteNombre}</h4>
            <p>📱 ${this._escapeHtml(trip.telefono || 'Sin teléfono')}</p>
          </div>
        </div>

        <div class="route-visual">
          <div class="route-dots">
            <div class="dot pickup"></div>
            <div class="line"></div>
            <div class="dot dropoff"></div>
          </div>
          <div class="route-info">
            <div class="route-stop">
              <h4>${isEnCurso ? 'Punto de recogida' : 'Origen'}</h4>
              <p>${this._escapeHtml(trip.origen || 'Sin origen')}</p>
            </div>
            <div class="route-stop">
              <h4>Destino</h4>
              <p>${this._escapeHtml(trip.destino || 'Sin destino')}</p>
            </div>
          </div>
        </div>

        <div class="trip-metrics">
          <div class="metric">
            <div class="metric-value">$${Number(trip.precio || 0).toLocaleString('es-AR')}</div>
            <div class="metric-label">Ganancia</div>
          </div>
          <div class="metric">
            <div class="metric-value">${Number(trip.km || 0).toFixed(1)} km</div>
            <div class="metric-label">Distancia</div>
          </div>
          <div class="metric">
            <div class="metric-value">${this._escapeHtml(servicioLabel)}</div>
            <div class="metric-label">Servicio</div>
          </div>
        </div>

        ${trip.notas ? `
          <p class="trip-notes">📝 ${this._escapeHtml(trip.notas)}</p>
        ` : ''}

        <div class="action-buttons">
          ${isEnCurso ? `
            <button class="btn btn-whatsapp" data-action="whatsapp" data-trip-id="${this._escapeHtml(trip.id || '')}">
              WhatsApp
            </button>
            <button class="btn btn-primary" data-action="finish" data-trip-id="${this._escapeHtml(trip.id || '')}">
              Finalizar viaje
            </button>
          ` : `
            <button class="btn btn-secondary" data-action="cancel" data-trip-id="${this._escapeHtml(trip.id || '')}">
              Cancelar
            </button>
            <button class="btn btn-primary" data-action="start" data-trip-id="${this._escapeHtml(trip.id || '')}">
              Iniciar viaje
            </button>
          `}
        </div>
      </div>
    `;

    if (this.elements.panelTitle) {
      this.elements.panelTitle.textContent = 'Viaje activo';
    }

    if (this.elements.panelSubtitle) {
      this.elements.panelSubtitle.textContent = isEnCurso
        ? 'Viaje en curso'
        : 'Viaje aceptado';
    }

    if (this.elements.tripCountBadge) {
      this.elements.tripCountBadge.textContent = '1';
    }

    if (this.elements.navPanel) {
      this.elements.navPanel.classList.add('active');
      this._updateNavigation(trip);
    }
  }

  showIncomingModal(trip, onAccept, onReject) {
    this.currentModal = 'incoming';

    const modal = this.elements.incomingModal;
    const details = document.getElementById('incomingDetails');

    if (!modal || !details || !trip) return;

    this._stopCountdown();
    this._setIncomingButtonsLoading(false);

    this._modalCallbacks = { onAccept, onReject };

    const servicioLabel = this._formatServiceLabel(trip.servicio || trip.tipo || 'Standard');

    details.innerHTML = `
      <div class="incoming-client">
        <div class="client-avatar large">${this._escapeHtml((trip.cliente || '?')[0])}</div>
        <div class="client-details">
          <h4>${this._escapeHtml(trip.cliente || 'Sin nombre')}</h4>
          <p>📱 ${this._escapeHtml(trip.telefono || 'Sin teléfono')}</p>
        </div>
      </div>

      <div class="route-visual">
        <div class="route-dots">
          <div class="dot pickup"></div>
          <div class="line"></div>
          <div class="dot dropoff"></div>
        </div>
        <div class="route-info">
          <div class="route-stop">
            <h4>Origen</h4>
            <p>${this._escapeHtml(trip.origen || 'Sin origen')}</p>
          </div>
          <div class="route-stop">
            <h4>Destino</h4>
            <p>${this._escapeHtml(trip.destino || 'Sin destino')}</p>
          </div>
        </div>
      </div>

      <div class="incoming-metrics">
        <div class="metric">
          <div class="metric-value">$${Number(trip.precio || 0).toLocaleString('es-AR')}</div>
          <div class="metric-label">Precio</div>
        </div>
        <div class="metric">
          <div class="metric-value">${Number(trip.km || 0).toFixed(1)} km</div>
          <div class="metric-label">Distancia</div>
        </div>
        <div class="metric">
          <div class="metric-value">${this._escapeHtml(servicioLabel)}</div>
          <div class="metric-label">Servicio</div>
        </div>
      </div>
    `;

    modal.classList.add('active');

    try {
      soundManager.play('newTrip');
      soundManager.vibrate('newTrip');
    } catch (e) {
      console.warn('No se pudo reproducir sonido/vibración:', e);
    }

    const realSeconds = this._getOfferSecondsLeft(trip);
    this._startCountdown(
      realSeconds > 0
        ? realSeconds
        : Math.floor(Number(CONFIG.INCOMING_MODAL_TIMEOUT || 30000) / 1000)
    );
  }

  closeIncomingModal() {
    const modal = this.elements.incomingModal;
    if (modal) {
      modal.classList.remove('active');
    }

    this._stopCountdown();
    this._setIncomingButtonsLoading(false);
    this.currentModal = null;
    this._modalCallbacks = null;
  }

  _startCountdown(seconds) {
    const bar = document.getElementById('countdownProgress');
    const text = document.getElementById('countdownText');

    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }

    const safeSeconds = Math.max(1, Number(seconds || 30));
    let remaining = safeSeconds;

    if (bar) {
      bar.style.transition = 'none';
      bar.style.width = '100%';
    }

    if (text) {
      text.textContent = String(remaining);
    }

    this.countdownInterval = setInterval(() => {
      remaining--;

      if (text) {
        text.textContent = String(Math.max(remaining, 0));
      }

      if (bar) {
        bar.style.width = `${Math.max((remaining / safeSeconds) * 100, 0)}%`;
      }

      if (remaining <= 0) {
        this._stopCountdown();

        if (this._modalCallbacks?.onReject) {
          this._modalCallbacks.onReject();
        }
      }
    }, 1000);

    setTimeout(() => {
      if (bar) {
        bar.style.transition = `width ${safeSeconds}s linear`;
        bar.style.width = '0%';
      }
    }, 50);
  }

  _stopCountdown() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  _startTripListCountdown() {
    this._stopTripListCountdown();

    this._tripListCountdownInterval = setInterval(() => {
      const cards = document.querySelectorAll('.trip-card-mini[data-trip-id], .trip-card-premium[data-trip-id]');

      cards.forEach(card => {
        const countdown = card.querySelector('.countdown-badge');
        const expiresAt = card.getAttribute('data-expires-at');

        if (!countdown || !expiresAt) return;

        const rest = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
        const min = Math.floor(rest / 60);
        const seg = rest % 60;

        countdown.textContent = `⏱️ ${min}:${seg.toString().padStart(2, '0')}`;

        if (rest <= 15) {
          countdown.classList.add('urgent');
        } else {
          countdown.classList.remove('urgent');
        }

        if (rest <= 0) {
          card.style.opacity = '0.5';
        }
      });
    }, 1000);
  }

  _stopTripListCountdown() {
    if (this._tripListCountdownInterval) {
      clearInterval(this._tripListCountdownInterval);
      this._tripListCountdownInterval = null;
    }
  }

  _updateNavigation(trip) {
    const navStreet = document.getElementById('navStreet');
    const navDistance = document.getElementById('navDistance');
    const navNext = document.getElementById('navNext');
    const navArrow = document.getElementById('navArrow');

    const estado = this._normalizeState(trip.estado);
    const isEnCurso = estado === 'EN_CURSO';

    if (navStreet) {
      navStreet.textContent = isEnCurso
        ? (trip.destino || 'Destino').split(',')[0]
        : (trip.origen || 'Punto de recogida').split(',')[0];
    }

    if (navDistance) {
      navDistance.textContent = '--';
    }

    if (navNext) {
      navNext.textContent = isEnCurso
        ? 'Dirigite al destino final'
        : 'Dirigite al punto de recogida';
    }

    if (navArrow) {
      navArrow.textContent = '⬆️';
    }
  }

  updateNavigationDistance(distanceMeters) {
    const navDistance = document.getElementById('navDistance');
    const navNext = document.getElementById('navNext');
    const navArrow = document.getElementById('navArrow');

    if (typeof distanceMeters !== 'number' || Number.isNaN(distanceMeters)) return;

    if (navDistance) {
      navDistance.textContent = distanceMeters < 1000
        ? `${Math.round(distanceMeters)} m`
        : `${(distanceMeters / 1000).toFixed(1)} km`;
    }

    if (navNext && navArrow) {
      if (distanceMeters < 50) {
        navArrow.textContent = '🏁';
        navNext.textContent = 'Has llegado al destino';
      } else if (distanceMeters < 200) {
        navArrow.textContent = '⬇️';
        navNext.textContent = 'Preparate para detenerte';
      } else {
        navArrow.textContent = '⬆️';
        navNext.textContent = 'Continuá derecho';
      }
    }
  }

  hideNavigation() {
    if (this.elements.navPanel) {
      this.elements.navPanel.classList.remove('active');
    }
  }

  togglePanel(forceExpanded = null) {
    const panel = this.elements.tripPanel;
    if (!panel) return;

    if (typeof forceExpanded === 'boolean') {
      panel.classList.toggle('expanded', forceExpanded);
      return;
    }

    panel.classList.toggle('expanded');
  }

  _getEmptyStateHTML() {
    return `
      <div class="empty-illustration">
        <div class="icon">🚗</div>
        <p>No hay viajes disponibles</p>
        <p style="font-size: 13px; margin-top: 8px;">Esperando solicitudes...</p>
      </div>
    `;
  }

  _createTripCardHTML(trip) {
    const rest = this._getOfferSecondsLeft(trip);
    const min = Math.floor(rest / 60);
    const seg = rest % 60;

    const servicio = this._formatServiceLabel(trip.servicio || 'Viaje');
    const cliente = this._escapeHtml(trip.cliente || 'Pasajero');
    const origen = this._escapeHtml(trip.origen || 'Sin origen');
    const destino = this._escapeHtml(trip.destino || 'Sin destino');
    const precio = Number(trip.precio || 0).toLocaleString('es-AR');
    const km = Number(trip.km || 0).toFixed(1);
    const tripId = this._escapeHtml(trip.id || '');
    const expiresAt = this._escapeHtml(trip.offer_expires_at || trip.current_offer_expires_at || '');

    return `
      <div class="trip-card-mini trip-card-premium" data-trip-id="${tripId}" data-expires-at="${expiresAt}">
        <div class="trip-card-header">
          <div>
            <span class="client-name">${cliente}</span>
            <div class="trip-service-chip">${this._escapeHtml(servicio)}</div>
          </div>
          <span class="countdown-badge ${rest <= 15 ? 'urgent' : ''}">
            ⏱️ ${min}:${seg.toString().padStart(2, '0')}
          </span>
        </div>

        <div class="trip-route-block">
          <div class="route-dots">
            <div class="dot pickup"></div>
            <div class="line"></div>
            <div class="dot dropoff"></div>
          </div>
          <div class="trip-route-text">
            <div class="trip-route-line"><strong>Origen</strong> ${origen}</div>
            <div class="trip-route-line"><strong>Destino</strong> ${destino}</div>
          </div>
        </div>

        <div class="trip-meta-row">
          <div class="trip-meta-box">
            <span class="trip-meta-label">Ganancia</span>
            <span class="trip-meta-value">$${precio}</span>
          </div>
          <div class="trip-meta-box">
            <span class="trip-meta-label">Distancia</span>
            <span class="trip-meta-value">${km} km</span>
          </div>
        </div>

        <div class="trip-card-footer">
          <button class="btn btn-ghost btn-small" data-action="whatsapp" data-trip-id="${tripId}">
            WhatsApp
          </button>
          <button class="btn btn-primary btn-small btn-accept-strong" data-action="accept" data-trip-id="${tripId}">
            Aceptar viaje
          </button>
        </div>
      </div>
    `;
  }

  _normalizeState(s) {
    return String(s || '').toUpperCase().replace(/[-\s]/g, '_');
  }

  _formatServiceLabel(service) {
    return String(service || '')
      .replaceAll('_', ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  _formatTime(dateLike) {
    try {
      if (!dateLike) return '--:--';
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

    const diff = Math.floor((new Date(exp).getTime() - Date.now()) / 1000);
    return Math.max(diff, 0);
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.innerHTML;
  }
}

const uiController = new UIController();
export default uiController;
