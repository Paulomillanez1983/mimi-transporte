/**
 * MIMI Driver - UI Controller
 * Renders UI based on state, handles interactions
 */

class UIController {
  constructor() {
    this.elements = {};
    this.countdownInterval = null;
    this.currentCountdown = 0;
    this.touchStartY = 0;
    this.sheetOpen = false;
  }

  initialize() {
    this._cacheElements();
    this._bindEvents();
    this._subscribeToState();
    this._setupViewport();
    
    // Initial render
    this._renderForState(stateManager.get('driver.status'));
  }

  _cacheElements() {
    const ids = [
      'header', 'driver-name', 'driver-initial', 'status-dot', 'status-text',
      'stats-panel', 'stat-earnings', 'stat-trips', 'stat-rating',
      'nav-bar', 'nav-street', 'nav-next', 'nav-distance', 'nav-progress-bar',
      'fab-online', 'bottom-sheet', 'sheet-content',
      'incoming-modal', 'countdown-number', 'countdown-circle',
      'trip-pickup', 'trip-dropoff', 'pickup-time', 'trip-distance',
      'trip-price', 'trip-duration', 'client-name', 'client-phone',
      'btn-accept', 'btn-reject', 'btn-call', 'btn-whatsapp',
      'arrival-panel', 'btn-finish', 'btn-continue',
      'toast-container', 'global-loading', 'offline-banner'
    ];

    ids.forEach(id => {
      this.elements[id] = document.getElementById(id);
    });
  }

  _bindEvents() {
    // FAB Online/Offline toggle
    this.elements['fab-online']?.addEventListener('click', () => {
      this._toggleOnline();
    });

    // Bottom sheet drag
    const sheet = this.elements['bottom-sheet'];
    const handle = sheet?.querySelector('.sheet-handle');

    handle?.addEventListener('touchstart', (e) => {
      this.touchStartY = e.touches[0].clientY;
      sheet.style.transition = 'none';
    }, { passive: true });

    handle?.addEventListener('touchmove', (e) => {
      const delta = this.touchStartY - e.touches[0].clientY;
      const currentTransform = sheet.style.transform;
      const currentHeight = sheet.offsetHeight;
      const newHeight = Math.max(80, Math.min(window.innerHeight * 0.85, currentHeight + delta));
      sheet.style.transform = `translateY(calc(100% - ${newHeight}px))`;
    }, { passive: true });

    handle?.addEventListener('touchend', () => {
      sheet.style.transition = '';
      const currentHeight = parseInt(sheet.style.height) || 80;
      
      if (currentHeight > window.innerHeight * 0.4) {
        this._expandSheet();
      } else {
        this._collapseSheet();
      }
    });

    // Incoming modal actions
    this.elements['btn-accept']?.addEventListener('click', () => {
      this._acceptCurrentOffer();
    });

    this.elements['btn-reject']?.addEventListener('click', () => {
      this._rejectCurrentOffer();
    });

    // Arrival panel
    this.elements['btn-finish']?.addEventListener('click', () => {
      this._finishTrip();
    });

    this.elements['btn-continue']?.addEventListener('click', () => {
      this.elements['arrival-panel']?.classList.remove('active');
    });

    // Sound unlock on first interaction
    document.addEventListener('click', () => {
      soundService.enable();
    }, { once: true });
  }

  _subscribeToState() {
    // Driver status changes
    stateManager.subscribe('driver.status', (newStatus, oldStatus) => {
      this._renderForState(newStatus);
    });

    // Trip changes
    stateManager.subscribe('trip.current', (trip) => {
      if (trip) {
        this._renderActiveTrip(trip);
      }
    });

    stateManager.subscribe('trip.pending', (pending) => {
      if (pending) {
        this._showIncomingOffer(pending);
      } else {
        this._hideIncomingOffer();
      }
    });

    // Online status
    stateManager.subscribe('driver.isOnline', (isOnline) => {
      this._updateOnlineUI(isOnline);
    });
  }

  _setupViewport() {
    const setVH = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    
    setVH();
    window.addEventListener('resize', setVH);
  }

  // Render based on state
  _renderForState(state) {
    console.log('[UI] Rendering state:', state);

    switch (state) {
      case CONFIG.DRIVER_STATES.OFFLINE:
        this._renderOffline();
        break;
      case CONFIG.DRIVER_STATES.ONLINE:
        this._renderOnline();
        break;
      case CONFIG.DRIVER_STATES.RECEIVING_OFFER:
        // Modal handles this
        break;
      case CONFIG.DRIVER_STATES.GOING_TO_PICKUP:
        this._renderGoingToPickup();
        break;
      case CONFIG.DRIVER_STATES.IN_PROGRESS:
        this._renderInProgress();
        break;
      case CONFIG.DRIVER_STATES.ARRIVED:
        this._renderArrived();
        break;
    }
  }

  _renderOffline() {
    this._updateStatus('Desconectado', false);
    this._collapseSheet();
    this._setSheetContent(`
      <div class="waiting-state">
        <div class="pulse-ring"></div>
        <h3>Estás desconectado</h3>
        <p>Toca "CONECTAR" para recibir viajes</p>
      </div>
    `);
    
    this.elements['nav-bar']?.classList.remove('active');
    this.elements['fab-online']?.classList.remove('online');
  }

  _renderOnline() {
    this._updateStatus('Conectado • Buscando viajes', true);
    this._collapseSheet();
    this._setSheetContent(`
      <div class="waiting-state">
        <div class="pulse-ring animate-pulse"></div>
        <h3>Buscando viajes cercanos...</h3>
        <p>Mantente en zonas con alta demanda</p>
      </div>
    `);
    
    this.elements['nav-bar']?.classList.remove('active');
  }

  _renderGoingToPickup() {
    const trip = stateManager.get('trip.current');
    if (!trip) return;

    this._updateStatus('Yendo a buscar pasajero', true);
    this._showNavigation(trip, 'pickup');
    
    // Show route on map
    const driverPos = locationService.getPosition();
    if (driverPos) {
      mapService.showRoute(
        { lat: driverPos.lat, lng: driverPos.lng },
        { lat: trip.origen_lat, lng: trip.origen_lng }
      );
      mapService.addPickupMarker(trip.origen_lng, trip.origen_lat);
    }

    this._setSheetContent(`
      <div class="trip-active">
        <div class="trip-header">
          <div class="trip-avatar">👤</div>
          <div class="trip-info">
            <h4>${this._escape(trip.cliente || 'Pasajero')}</h4>
            <p>${trip.telefono || ''}</p>
          </div>
        </div>
        <div class="trip-actions">
          <button class="btn btn-success btn-lg" data-action="start">
            ▶ Pasajero a bordo
          </button>
          <button class="btn btn-secondary" data-action="navigate">
            🧭 Abrir navegación
          </button>
        </div>
      </div>
    `);

    this._attachTripActions(trip);
  }

  _renderInProgress() {
    const trip = stateManager.get('trip.current');
    if (!trip) return;

    this._updateStatus('Viaje en curso', true);
    this._showNavigation(trip, 'dropoff');
    
    // Update route to destination
    const driverPos = locationService.getPosition();
    if (driverPos) {
      mapService.showRoute(
        { lat: driverPos.lat, lng: driverPos.lng },
        { lat: trip.destino_lat, lng: trip.destino_lng }
      );
      mapService.addDropoffMarker(trip.destino_lng, trip.destino_lat);
    }

    this._setSheetContent(`
      <div class="trip-active">
        <div class="trip-header">
          <div class="trip-avatar">👤</div>
          <div class="trip-info">
            <h4>En camino al destino</h4>
            <p>${this._escape(trip.destino)}</p>
          </div>
        </div>
        <div class="trip-actions">
          <button class="btn btn-success btn-lg" data-action="arrived">
            ✓ He llegado
          </button>
          <button class="btn btn-secondary" data-action="navigate">
            🧭 Abrir navegación
          </button>
        </div>
      </div>
    `);

    this._attachTripActions(trip);
  }

  _renderArrived() {
    this.elements['arrival-panel']?.classList.add('active');
    soundService.vibrate('arrival');
  }

  // CORREGIDO: Agregar método _renderActiveTrip que faltaba
  _renderActiveTrip(trip) {
    console.log('[UI] Rendering active trip:', trip.id);
    // Este método se llama cuando hay un viaje activo
    // La lógica específica ya está en _renderGoingToPickup y _renderInProgress
    const state = stateManager.get('driver.status');
    if (state === CONFIG.DRIVER_STATES.GOING_TO_PICKUP) {
      this._renderGoingToPickup();
    } else if (state === CONFIG.DRIVER_STATES.IN_PROGRESS) {
      this._renderInProgress();
    }
  }

  // Incoming offer modal
  _showIncomingOffer(offer) {
    soundService.feedback('newTrip');
    
    // Fill data
    this.elements['trip-pickup'].textContent = this._escape(offer.origen);
    this.elements['trip-dropoff'].textContent = this._escape(offer.destino);
    this.elements['trip-price'].textContent = `$${Number(offer.precio).toLocaleString()}`;
    this.elements['trip-duration'].textContent = `${Math.ceil(offer.km * 2)} min`;
    this.elements['trip-distance'].textContent = `${Number(offer.km).toFixed(1)} km`;
    this.elements['client-name'].textContent = this._escape(offer.cliente || 'Pasajero');
    this.elements['client-phone'].textContent = offer.telefono || '';

    // Show modal
    this.elements['incoming-modal']?.classList.add('active');
    
    // Start countdown
    this._startCountdown(CONFIG.INCOMING_OFFER_TIMEOUT);
  }

  _hideIncomingOffer() {
    this.elements['incoming-modal']?.classList.remove('active');
    this._stopCountdown();
  }

  _startCountdown(seconds) {
    this.currentCountdown = seconds;
    const circle = this.elements['countdown-circle'];
    const number = this.elements['countdown-number'];
    
    // Reset animation
    circle.style.animation = 'none';
    circle.offsetHeight; // Trigger reflow
    circle.style.animation = `countdown ${seconds}s linear forwards`;
    
    if (number) number.textContent = seconds;
    
    this.countdownInterval = setInterval(() => {
      this.currentCountdown--;
      if (number) number.textContent = this.currentCountdown;
      
      if (this.currentCountdown <= 0) {
        this._rejectCurrentOffer();
      }
    }, 1000);
  }

  _stopCountdown() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  // Actions
  async _toggleOnline() {
    const isOnline = !stateManager.get('driver.isOnline');
    const driverId = supabaseClient.getDriverId();
    
    this._setLoading(true);
    
    const { error } = await supabaseClient.setDriverOnline(driverId, isOnline);
    
    if (error) {
      this._showToast('Error al cambiar estado', 'error');
    } else {
      stateManager.set('driver.isOnline', isOnline);
      if (isOnline) {
        stateManager.transitionDriver(CONFIG.DRIVER_STATES.ONLINE);
      } else {
        stateManager.transitionDriver(CONFIG.DRIVER_STATES.OFFLINE);
      }
    }
    
    this._setLoading(false);
  }

  async _acceptCurrentOffer() {
    const offer = stateManager.get('trip.pending');
    if (!offer) return;

    this._setLoading(true);
    const result = await tripManager.acceptOffer(offer.id);
    this._setLoading(false);

    if (result.success) {
      this._hideIncomingOffer();
    } else {
      this._showToast(result.error || 'No se pudo aceptar', 'error');
      this._hideIncomingOffer();
    }
  }

  async _rejectCurrentOffer() {
    const offer = stateManager.get('trip.pending');
    if (!offer) return;

    await tripManager.rejectOffer(offer.id);
    this._hideIncomingOffer();
  }

  async _finishTrip() {
    const trip = stateManager.get('trip.current');
    if (!trip) return;

    this._setLoading(true);
    const result = await tripManager.completeTrip(trip.id);
    this._setLoading(false);

    if (result.success) {
      this.elements['arrival-panel']?.classList.remove('active');
      this._showToast(`Viaje completado +$${trip.precio}`, 'success');
    } else {
      this._showToast(result.error || 'Error al finalizar', 'error');
    }
  }

  // Helpers
  _updateStatus(text, isOnline) {
    if (this.elements['status-text']) {
      this.elements['status-text'].textContent = text;
    }
    if (this.elements['status-dot']) {
      this.elements['status-dot'].classList.toggle('online', isOnline);
    }
  }

  _updateOnlineUI(isOnline) {
    const fab = this.elements['fab-online'];
    if (fab) {
      fab.classList.toggle('online', isOnline);
      const text = fab.querySelector('.fab-text');
      if (text) {
        text.textContent = isOnline ? 'CONECTADO' : 'CONECTAR';
      }
    }
  }

  _showNavigation(trip, phase) {
    const navBar = this.elements['nav-bar'];
    const street = this.elements['nav-street'];
    const next = this.elements['nav-next'];
    
    if (phase === 'pickup') {
      street.textContent = 'Yendo a buscar pasajero';
      next.textContent = this._escape(trip.origen);
    } else {
      street.textContent = 'Yendo al destino';
      next.textContent = this._escape(trip.destino);
    }
    
    navBar?.classList.add('active');
  }

  _setSheetContent(html) {
    const content = this.elements['sheet-content'];
    if (content) {
      content.innerHTML = html;
    }
  }

  _expandSheet() {
    this.elements['bottom-sheet']?.classList.add('expanded');
    this.sheetOpen = true;
  }

  _collapseSheet() {
    this.elements['bottom-sheet']?.classList.remove('expanded');
    this.sheetOpen = false;
  }

  _attachTripActions(trip) {
    const container = this.elements['sheet-content'];
    if (!container) return;

    container.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.currentTarget.dataset.action;
        
        switch (action) {
          case 'start':
            tripManager.startTrip(trip.id);
            break;
          case 'arrived':
            stateManager.transitionDriver(CONFIG.DRIVER_STATES.ARRIVED);
            break;
          case 'navigate':
            const url = `https://www.google.com/maps/dir/?api=1&destination=${trip.destino_lat},${trip.destino_lng}`;
            window.open(url, '_blank');
            break;
        }
      });
    });
  }

  _setLoading(show) {
    this.elements['global-loading']?.classList.toggle('active', show);
  }

  _showToast(message, type = 'info') {
    const container = this.elements['toast-container'];
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type} animate-slide-down`;
    toast.innerHTML = `
      <span class="toast-icon">${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
      <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-20px)';
      setTimeout(() => toast.remove(), 300);
    }, CONFIG.TOAST_DURATION);
  }

  _escape(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }
}

const uiController = new UIController();
