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
  }

  init() {
    // Cachear elementos DOM frecuentes
    this.elements = {
      toast: document.getElementById('toast'),
      tripPanel: document.getElementById('tripPanel'),
      panelContent: document.getElementById('panelContent'),
      incomingModal: document.getElementById('incomingModal'),
      navPanel: document.getElementById('navPanel'),
      statsPendientes: document.getElementById('statPendientes'),
      statsHoy: document.getElementById('statHoy'),
      driverName: document.getElementById('driverName')
    };

    // Cargar nombre del chofer
    const driverData = JSON.parse(localStorage.getItem('choferData') || '{}');
    if (driverData.nombre && this.elements.driverName) {
      this.elements.driverName.textContent = driverData.nombre;
    }

    // Delegación de eventos para botones dinámicos
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (btn) {
        const action = btn.dataset.action;
        const tripId = btn.dataset.tripId;
        this._handleAction(action, tripId, btn);
      }
    });

    return this;
  }

  _handleAction(action, tripId, btn) {
    // Emitir evento para que driver-app.js maneje la lógica
    const event = new CustomEvent('driverAction', {
      detail: { action, tripId, button: btn }
    });
    document.dispatchEvent(event);
  }

  // Toast notifications
  showToast(message, type = 'info', duration = 3000) {
    const toast = this.elements.toast;
    if (!toast) return;

    toast.textContent = message;
    toast.className = `toast ${type} show`;

    if (this._toastTimeout) {
      clearTimeout(this._toastTimeout);
    }

    this._toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  }

  // Actualizar estadísticas
  updateStats(stats) {
    if (this.elements.statsPendientes) {
      this.elements.statsPendientes.textContent = stats.pending;
    }
    if (this.elements.statsHoy) {
      this.elements.statsHoy.textContent = stats.today;
    }
  }

  // Renderizar lista de viajes disponibles
  renderAvailableTrips(trips) {
    const container = this.elements.panelContent;
    if (!container) return;

    if (trips.length === 0) {
      container.innerHTML = this._getEmptyStateHTML();
      return;
    }

    container.innerHTML = trips.map(t => this._createTripCardHTML(t)).join('');
  }

  // Renderizar viaje activo
  renderActiveTrip(trip) {
    const container = this.elements.panelContent;
    const panel = this.elements.tripPanel;
    if (!container || !panel) return;

    panel.classList.add('has-trip');
    
    const estado = this._normalizeState(trip.estado);
    const isEnCurso = estado === 'EN_CURSO';

    container.innerHTML = `
      <div class="trip-card-uber">
        <div class="trip-status-bar">
          <div class="status-indicator ${estado.toLowerCase()}"></div>
          <span style="font-weight: 700; text-transform: uppercase; font-size: 13px;">
            ${estado.replace('_', ' ')}
          </span>
          <span style="margin-left: auto; color: var(--text-secondary); font-size: 13px;">
            ${new Date(trip.fecha || trip.created_at).toLocaleTimeString('es-AR', {
              hour: '2-digit', minute: '2-digit'
            })}
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
              <p>${this._escapeHtml(trip.origen)}</p>
            </div>
            <div class="route-stop">
              <h4>Destino</h4>
              <p>${this._escapeHtml(trip.destino)}</p>
            </div>
          </div>
        </div>

        <div class="trip-metrics">
          <div class="metric">
            <div class="metric-value">$${Number(trip.precio || 0).toLocaleString('es-AR')}</div>
            <div class="metric-label">Precio</div>
          </div>
          <div class="metric">
            <div class="metric-value">${trip.km || 0} km</div>
            <div class="metric-label">Distancia</div>
          </div>
          <div class="metric">
            <div class="metric-value">${this._escapeHtml(trip.tipo || 'Standard')}</div>
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
    }
  }

  // Mostrar modal de viaje entrante
  showIncomingModal(trip, onAccept, onReject) {
    this.currentModal = 'incoming';
    const modal = this.elements.incomingModal;
    const details = document.getElementById('incomingDetails');
    
    if (!modal || !details) return;

    // Guardar callbacks
    this._modalCallbacks = { onAccept, onReject };

    details.innerHTML = `
      <div class="incoming-client">
        <div class="client-avatar large">${this._escapeHtml((trip.cliente || '?')[0])}</div>
        <div class="client-details">
          <h4>${this._escapeHtml(trip.cliente)}</h4>
          <p>📱 ${this._escapeHtml(trip.telefono)}</p>
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
            <p>${this._escapeHtml(trip.origen)}</p>
          </div>
          <div class="route-stop">
            <h4>Destino</h4>
            <p>${this._escapeHtml(trip.destino)}</p>
          </div>
        </div>
      </div>

      <div class="incoming-metrics">
        <div class="metric">
          <div class="metric-value">$${Number(trip.precio || 0).toLocaleString('es-AR')}</div>
          <div class="metric-label">Precio</div>
        </div>
        <div class="metric">
          <div class="metric-value">${trip.km || 0} km</div>
          <div class="metric-label">Distancia</div>
        </div>
        <div class="metric">
          <div class="metric-value">${this._escapeHtml(trip.tipo || 'Standard')}</div>
          <div class="metric-label">Servicio</div>
        </div>
      </div>
    `;

    modal.classList.add('active');
    soundManager.play('newTrip');
    soundManager.vibrate('newTrip');

    // Iniciar countdown
    this._startCountdown(CONFIG.INCOMING_MODAL_TIMEOUT / 1000);
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
    
    if (bar) bar.style.width = '100%';
    
    let remaining = seconds;
    
    this.countdownInterval = setInterval(() => {
      remaining--;
      
      if (text) text.textContent = remaining;
      if (bar) {
        bar.style.width = `${(remaining / seconds) * 100}%`;
      }

      if (remaining <= 0) {
        this._stopCountdown();
        if (this._modalCallbacks?.onReject) {
          this._modalCallbacks.onReject();
        }
      }
    }, 1000);

    // Animación inicial de la barra
    setTimeout(() => {
      if (bar) bar.style.width = '0%';
    }, 50);
  }

  _stopCountdown() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  _updateNavigation(trip) {
    // Actualizar panel de navegación con distancia/tiempo estimado
    const navDistance = document.getElementById('navDistance');
    const navStreet = document.getElementById('navStreet');
    
    if (navStreet) {
      navStreet.textContent = trip.origen?.split(',')[0] || 'Destino';
    }
  }

  updateNavigationDistance(distanceMeters) {
    const navDistance = document.getElementById('navDistance');
    const navNext = document.getElementById('navNext');
    const navArrow = document.getElementById('navArrow');
    
    if (navDistance) {
      navDistance.textContent = distanceMeters < 1000 
        ? `${Math.round(distanceMeters)}` 
        : `${(distanceMeters / 1000).toFixed(1)}`;
    }

    // Cambiar instrucciones según distancia
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
    if (this.elements.tripPanel) {
      this.elements.tripPanel.classList.remove('has-trip');
    }
  }

  togglePanel() {
    const panel = this.elements.tripPanel;
    if (panel) {
      panel.classList.toggle('expanded');
    }
  }

  // HTML Helpers
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
    const exp = new Date(trip.created_at).getTime() + 2 * 60 * 1000;
    const rest = Math.max(0, Math.floor((exp - Date.now()) / 1000));
    const min = Math.floor(rest / 60);
    const seg = rest % 60;

    return `
      <div class="trip-card-mini" data-trip-id="${trip.id}">
        <div class="trip-card-header">
          <span class="client-name">${this._escapeHtml(trip.cliente || 'Sin nombre')}</span>
          <span class="countdown-badge">⏱️ ${min}:${seg.toString().padStart(2, '0')}</span>
        </div>
        <div class="trip-route-mini">
          ${this._escapeHtml(trip.origen)} → ${this._escapeHtml(trip.destino)}
        </div>
        <div class="trip-card-footer">
          <span class="price">$${Number(trip.precio || 0).toLocaleString('es-AR')}</span>
          <button class="btn btn-primary btn-small" data-action="accept" data-trip-id="${trip.id}">
            Aceptar
          </button>
        </div>
      </div>
    `;
  }

  _normalizeState(s) {
    return String(s || '').toUpperCase().replace(/[-\s]/g, '_');
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

const uiController = new UIController();
export default uiController;
