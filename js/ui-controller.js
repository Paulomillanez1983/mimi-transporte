/**
 * Controlador de interfaz - Renderizado y manipulación del DOM
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
  }

  init() {
    // Cachear elementos DOM frecuentes
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
  tripCountBadge: document.getElementById('tripCountBadge'),
  btnAcceptIncoming: document.getElementById('btnAcceptIncoming'),
  btnRejectIncoming: document.getElementById('btnRejectIncoming')
};
    // Cargar nombre del chofer
    try {
      const driverData = JSON.parse(localStorage.getItem('choferData') || '{}');
      if (driverData.nombre && this.elements.driverName) {
        this.elements.driverName.textContent = driverData.nombre;
      }
    } catch (e) {
      console.warn('No se pudo cargar choferData:', e);
    }

    // Delegación de eventos para botones dinámicos (solo una vez)
    if (!this._documentClickBound) {
      document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (btn) {
          const action = btn.dataset.action;
          const tripId = btn.dataset.tripId;
          this._handleAction(action, tripId, btn);
        }
      });
      this._documentClickBound = true;
    }

    // Botones fijos del modal entrante
    if (this.elements.btnAcceptIncoming) {
      this.elements.btnAcceptIncoming.onclick = () => {
        if (this._modalCallbacks?.onAccept) {
          this._modalCallbacks.onAccept();
        }
      };
    }

    if (this.elements.btnRejectIncoming) {
      this.elements.btnRejectIncoming.onclick = () => {
        if (this._modalCallbacks?.onReject) {
          this._modalCallbacks.onReject();
        }
      };
    }
    if (this.elements.panelHandle) {
  this.elements.panelHandle.addEventListener('click', () => {
    this.togglePanel();
  });
}

    return this;
  }

  _handleAction(action, tripId, btn) {
    const event = new CustomEvent('driverAction', {
      detail: { action, tripId, button: btn }
    });
    document.dispatchEvent(event);
  }

  // =========================================
  // TOASTS
  // =========================================
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

  // =========================================
  // STATS
  // =========================================
  updateStats(stats = {}) {
    if (this.elements.statsPendientes) {
      this.elements.statsPendientes.textContent = String(stats.pending ?? 0);
    }

    if (this.elements.statsHoy) {
      this.elements.statsHoy.textContent = String(stats.today ?? 0);
    }
  }

  // =========================================
  // VIAJES DISPONIBLES
  // =========================================
renderAvailableTrips(trips) {
  const container = this.elements.tripList;
  const panel = this.elements.tripPanel;

  if (!container) return;

  if (panel) {
    panel.classList.remove('has-trip');
  }

  this.hideNavigation();

  const safeTrips = Array.isArray(trips) ? trips : [];
  if (this.elements.tripCountBadge) {
  this.elements.tripCountBadge.textContent = String(safeTrips.length);
}

if (this.elements.panelSubtitle) {
  this.elements.panelSubtitle.textContent =
    safeTrips.length > 0
      ? `${safeTrips.length} viaje${safeTrips.length === 1 ? '' : 's'} esperando`
      : 'Esperando solicitudes...';
}

  if (safeTrips.length === 0) {
    container.innerHTML = this._getEmptyStateHTML();

    // Si no hay viajes, dejamos el panel semi-colapsado
    if (panel) {
      panel.classList.remove('expanded');
    }

    return;
  }

  // Ordenar por más reciente
  const orderedTrips = [...safeTrips].sort((a, b) => {
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  });

  container.innerHTML = orderedTrips.map(t => this._createTripCardHTML(t)).join('');

  // AUTO-ABRIR si hay viajes
  if (panel) {
    panel.classList.add('expanded');
  }
}
  // =========================================
  // VIAJE ACTIVO
  // =========================================
  renderActiveTrip(trip) {
    const container = this.elements.tripList;
    const panel = this.elements.tripPanel;

    if (!container || !panel || !trip) return;

    panel.classList.add('has-trip');

    const estado = this._normalizeState(trip.estado);
    const isEnCurso = estado === 'EN_CURSO';
    const servicioLabel = trip.servicio || trip.tipo || 'Standard';

    container.innerHTML = `
      <div class="trip-card-uber">
        <div class="trip-status-bar">
          <div class="status-indicator ${estado.toLowerCase()}"></div>
          <span style="font-weight: 700; text-transform: uppercase; font-size: 13px;">
            ${this._escapeHtml(estado.replaceAll('_', ' '))}
          </span>
          <span style="margin-left: auto; color: var(--text-secondary); font-size: 13px;">
            ${this._formatTime(trip.fecha_hora || trip.fecha || trip.created_at)}
          </span>
        </div>

        <div class="client-bar">
          <div class="client-avatar">${this._escapeHtml((trip.cliente || '?')[0])}</div>
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
              <h4>${isEnCurso ? 'Recoger en' : 'Origen'}</h4>
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

        ${trip.notas ? `
          <p class="trip-notes">📝 ${this._escapeHtml(trip.notas)}</p>
        ` : ''}

        <div class="action-buttons">
          ${isEnCurso ? `
            <button class="btn btn-whatsapp" data-action="whatsapp" data-trip-id="${trip.id}">
              WhatsApp
            </button>
            <button class="btn btn-primary" data-action="finish" data-trip-id="${trip.id}">
              Finalizar
            </button>
          ` : `
            <button class="btn btn-secondary" data-action="cancel" data-trip-id="${trip.id}">
              Cancelar
            </button>
            <button class="btn btn-primary" data-action="start" data-trip-id="${trip.id}">
              Iniciar viaje
            </button>
          `}
        </div>
      </div>
    `;

    // Mostrar navegación si está en curso
    if (isEnCurso && this.elements.navPanel) {
      this.elements.navPanel.classList.add('active');
      this._updateNavigation(trip);
    } else {
      this.hideNavigation();
    }
  }

  // =========================================
  // MODAL VIAJE ENTRANTE
  // =========================================
  showIncomingModal(trip, onAccept, onReject) {
    this.currentModal = 'incoming';

    const modal = this.elements.incomingModal;
    const details = document.getElementById('incomingDetails');

    if (!modal || !details || !trip) return;

    // Reiniciar estado previo
    this._stopCountdown();

    // Guardar callbacks
    this._modalCallbacks = { onAccept, onReject };

    const servicioLabel = trip.servicio || trip.tipo || 'Standard';

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

    const timeoutMs = Number(CONFIG.INCOMING_MODAL_TIMEOUT || 30000);
    this._startCountdown(Math.floor(timeoutMs / 1000));
  }

  closeIncomingModal() {
    const modal = this.elements.incomingModal;
    if (modal) {
      modal.classList.remove('active');
    }

    this._stopCountdown();
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

    if (bar) {
      bar.style.transition = 'none';
      bar.style.width = '100%';
    }

    let remaining = Number(seconds || 30);

    if (text) text.textContent = String(remaining);

    this.countdownInterval = setInterval(() => {
      remaining--;

      if (text) text.textContent = String(Math.max(remaining, 0));
      if (bar) {
        bar.style.width = `${Math.max((remaining / seconds) * 100, 0)}%`;
      }

      if (remaining <= 0) {
        this._stopCountdown();

        if (this._modalCallbacks?.onReject) {
          this._modalCallbacks.onReject();
        }
      }
    }, 1000);

    // Activar transición visual luego del primer frame
    setTimeout(() => {
      if (bar) {
        bar.style.transition = `width ${seconds}s linear`;
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

  // =========================================
  // NAVEGACIÓN
  // =========================================
  _updateNavigation(trip) {
    const navStreet = document.getElementById('navStreet');
    const navDistance = document.getElementById('navDistance');
    const navNext = document.getElementById('navNext');
    const navArrow = document.getElementById('navArrow');

    if (navStreet) {
      navStreet.textContent = (trip.origen || 'Destino').split(',')[0];
    }

    if (navDistance) {
      navDistance.textContent = '--';
    }

    if (navNext) {
      navNext.textContent = 'Dirigite al punto de recogida';
    }

    if (navArrow) {
      navArrow.textContent = '⬆️';
    }
  }

  updateNavigationDistance(distanceMeters) {
    const navDistance = document.getElementById('navDistance');
    const navNext = document.getElementById('navNext');
    const navArrow = document.getElementById('navArrow');

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

  togglePanel() {
    const panel = this.elements.tripPanel;
    if (panel) {
      panel.classList.toggle('expanded');
    }
  }

  // =========================================
  // HELPERS HTML
  // =========================================
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
  const exp = new Date(trip.created_at || Date.now()).getTime() + 2 * 60 * 1000;
  const rest = Math.max(0, Math.floor((exp - Date.now()) / 1000));
  const min = Math.floor(rest / 60);
  const seg = rest % 60;

  const servicio = this._escapeHtml(trip.servicio || 'Viaje');
  const cliente = this._escapeHtml(trip.cliente || 'Pasajero');
  const origen = this._escapeHtml(trip.origen || 'Sin origen');
  const destino = this._escapeHtml(trip.destino || 'Sin destino');
  const precio = Number(trip.precio || 0).toLocaleString('es-AR');
  const km = Number(trip.km || 0).toFixed(1);

  return `
    <div class="trip-card-mini trip-card-premium" data-trip-id="${this._escapeHtml(trip.id || '')}">
      <div class="trip-card-header">
        <div>
          <span class="client-name">${cliente}</span>
          <div class="trip-service-chip">${servicio}</div>
        </div>
        <span class="countdown-badge">⏱️ ${min}:${seg.toString().padStart(2, '0')}</span>
      </div>

      <div class="trip-route-block">
        <div class="route-point pickup-point"></div>
        <div class="trip-route-text">
          <div class="trip-route-line"><strong>Origen:</strong> ${origen}</div>
          <div class="trip-route-line"><strong>Destino:</strong> ${destino}</div>
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
        <button class="btn btn-ghost btn-small" data-action="whatsapp" data-trip-id="${this._escapeHtml(trip.id || '')}">
          WhatsApp
        </button>
        <button class="btn btn-primary btn-small btn-accept-strong" data-action="accept" data-trip-id="${this._escapeHtml(trip.id || '')}">
          Aceptar viaje
        </button>
      </div>
    </div>
  `;
}
  _normalizeState(s) {
    return String(s || '').toUpperCase().replace(/[-\s]/g, '_');
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

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.innerHTML;
  }
}

const uiController = new UIController();
export default uiController;
