/**
 * MIMI Driver - UI Controller v3.0 (Uber Driver PRO)
 * Final production version
 * Compatible con: driver-app.js, trip-manager.js, supabase-client.js
 */

import CONFIG from './config.js';
import soundManager from './sound-manager.js';

class UIController {
  constructor() {
    this.elements = {};

    this.state = {
      countdown: null,
      countdownTimeout: null,
      currentCount: Number(CONFIG.INCOMING_OFFER_TIMEOUT || 15),
      isModalOpen: false,
      isProcessing: false,
      callbacks: {},
      currentTrip: null,
      isOnline: false,
      bottomSheetExpanded: false
    };

    // Estado interno
    this.lastTripModalId = null;
    this._gestureCleanup = false;
    this._lastTripRendered = null;
    this._isInitialized = false;
    this._arrivalTimeout = null;
    this._countdownSoundInterval = null;

    // Touch handling
    this.touchStartY = 0;
    this.touchCurrentY = 0;
    this.sheetHeight = 0;

    // Refs de listeners para cleanup
    this._viewportResizeHandler = null;
    this._viewportOrientationHandler = null;
    this._modalTouchMoveHandler = null;
    this._sheetHandleClickHandler = null;
    this._acceptTouchStartHandler = null;
    this._rejectTouchStartHandler = null;
    this._callBtnHapticHandler = null;
    this._whatsappBtnHapticHandler = null;
    this._menuButtonClickHandler = null;     
    this._menuBackdropClickHandler = null;
    this._menuProfileClickHandler = null;
    this._menuTouchStartX = 0;
    this._menuTouchCurrentX = 0;

    // Bindings base
    this._handleAccept = this._handleAccept.bind(this);
    this._handleReject = this._handleReject.bind(this);
    this._onBackdropClick = this._onBackdropClick.bind(this);
    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchMove = this._onTouchMove.bind(this);
    this._onTouchEnd = this._onTouchEnd.bind(this);

    // Bindings globales
    this._boundTripStateChanged = this._handleTripStateChanged.bind(this);
    this._boundDriverFlowStateChanged = this._handleDriverFlowStateChanged.bind(this);
  }

  init() {
    if (this._isInitialized) {
      console.warn('[UI] Controller already initialized');
      return;
    }

    this._cacheElements();
    this._setupEventListeners();
    this._setupViewport();
    this._setupGestures();

    this._isInitialized = true;
    console.log('[UI] Controller v3.0 initialized - Uber Driver PRO');
  }

  destroy() {
    window.removeEventListener('tripStateChanged', this._boundTripStateChanged);
    window.removeEventListener('driverFlowStateChanged', this._boundDriverFlowStateChanged);

    this._removeGestureListeners();
    this._removeDOMListeners();
    this._removeViewportListeners();

    this._clearCountdownTimers();
    this._clearArrivalTimer();

    this._gestureCleanup = false;
    this._isInitialized = false;
    this._lastTripRendered = null;
    this.lastTripModalId = null;

    this.touchStartY = 0;
    this.touchCurrentY = 0;
    this.sheetHeight = 0;

    console.log('[UI] Controller destroyed');
  }

  _cacheElements() {
    const selectors = {
      'driver-name': 'driver-name',
      'driver-initial': 'driver-initial',
      'status-dot': 'status-dot',
      'status-text': 'status-text',

      'stat-earnings': 'stat-earnings',
      'stat-trips': 'stat-trips',
      'stat-rating': 'stat-rating',

      'fab-online': 'fab-online',
      'fab-text': 'fab-text',
      'fab-icon': 'fab-icon',
      'fab-subtext': 'fab-subtext',
      'fab-pulse': 'fab-pulse',

      'bottom-sheet': 'bottom-sheet',
      'sheet-handle': 'sheet-handle',
      'sheet-content': 'sheet-content',
      'sheet-header': 'sheet-header',

      'incoming-modal': 'incoming-modal',
      'modal-backdrop': 'modal-backdrop',
      'modal-content': 'modal-content',
      'countdown-ring': 'countdown-ring',
      'countdown-number': 'countdown-number',
      'countdown-circle': 'countdown-circle',

      'trip-pickup': 'trip-pickup',
      'trip-dropoff': 'trip-dropoff',
      'trip-distance': 'trip-distance',
      'trip-price': 'trip-price',
      'trip-duration': 'trip-duration',
      'trip-km': 'trip-km',
      'client-name': 'client-name',
      'client-phone': 'client-phone',
      'client-avatar': 'client-avatar',
      'pickup-time': 'pickup-time',
      'pickup-address': 'pickup-address',
      'dropoff-address': 'dropoff-address',

      'btn-accept': 'btn-accept',
      'btn-reject': 'btn-reject',
      'btn-call': 'btn-call',
      'btn-whatsapp': 'btn-whatsapp',
      'btn-navigate': 'btn-navigate',
      'btn-arrived': 'btn-arrived',
      'btn-continue': 'btn-continue',
      'btn-finish': 'btn-finish',
      'nav-bar': 'nav-bar',
      'nav-street': 'nav-street',
      'nav-next': 'nav-next',
      'nav-distance': 'nav-distance',
      'nav-progress-bar': 'nav-progress-bar',
      'maneuver-icon': 'maneuver-icon',

      'arrival-panel': 'arrival-panel',
      'trip-actions': 'trip-actions',
      'toast-container': 'toast-container',
      'global-loading': 'global-loading',
      'offline-banner': 'offline-banner',

      'menu-button': 'menu-button',
      'side-menu': 'side-menu',
      'menu-backdrop': 'menu-backdrop',
            'menu-profile': 'menu-profile',
      'menu-avatar': 'menu-avatar',
      'menu-name': 'menu-name',
      'menu-email': 'menu-email',
      'menu-avatar-initial': 'menu-avatar-initial',
      'menu-profile-expand': 'menu-profile-expand',
      'menu-logout': 'menu-logout'
    };

    Object.entries(selectors).forEach(([key, id]) => {
      this.elements[key] = document.getElementById(id);
    });

    this.avatarEl =
      this.elements['driver-initial']?.closest('.avatar') ||
      document.querySelector('.avatar') ||
      null;
  }


  _setupEventListeners() {
    const acceptBtn = this.elements['btn-accept'];
    const rejectBtn = this.elements['btn-reject'];
    const backdrop = this.elements['modal-backdrop'];
    const sheetHandle = this.elements['sheet-handle'];
    const modal = this.elements['incoming-modal'];
    const callBtn = this.elements['btn-call'];
    const whatsappBtn = this.elements['btn-whatsapp'];
    const navigateBtn = this.elements['btn-navigate'];
    const btnContinue = this.elements['btn-continue'];
    const btnFinish = this.elements['btn-finish'];
    const menuButton = this.elements['menu-button'];
    const menuBackdrop = this.elements['menu-backdrop'];
    const menuProfile = this.elements['menu-profile'];
    
    window.addEventListener('tripStateChanged', this._boundTripStateChanged);
    window.addEventListener('driverFlowStateChanged', this._boundDriverFlowStateChanged);

    if (acceptBtn) {
      acceptBtn.addEventListener('click', this._handleAccept);
      this._acceptTouchStartHandler = () => this._haptic('light');
      acceptBtn.addEventListener('touchstart', this._acceptTouchStartHandler, { passive: true });
    }

    if (rejectBtn) {
      rejectBtn.addEventListener('click', this._handleReject);
      this._rejectTouchStartHandler = () => this._haptic('light');
      rejectBtn.addEventListener('touchstart', this._rejectTouchStartHandler, { passive: true });
    }

    if (backdrop) {
      backdrop.addEventListener('click', this._onBackdropClick);
    }

    if (sheetHandle) {
      this._sheetHandleClickHandler = () => this._toggleBottomSheet();
      sheetHandle.addEventListener('click', this._sheetHandleClickHandler);
    }

    if (modal) {
      this._modalTouchMoveHandler = (e) => {
        if (e.target === modal || e.target.classList.contains('modal-backdrop')) {
          e.preventDefault();
        }
      };
      modal.addEventListener('touchmove', this._modalTouchMoveHandler, { passive: false });
    }

    if (callBtn) {
      this._callBtnHapticHandler = () => this._haptic('medium');
      callBtn.addEventListener('click', this._callBtnHapticHandler);
    }

    if (whatsappBtn) {
      this._whatsappBtnHapticHandler = () => this._haptic('medium');
      whatsappBtn.addEventListener('click', this._whatsappBtnHapticHandler);
    }

    if (navigateBtn) {
      this._navigateBtnHapticHandler = () => this._haptic('medium');
      navigateBtn.addEventListener('click', this._navigateBtnHapticHandler);
    }
if (btnContinue) {
  btnContinue.addEventListener('click', () => {
    this.hideArrival();
    this._haptic('light');
  });
}

if (btnFinish) {
  btnFinish.addEventListener('click', () => {
    if (btnFinish.disabled) return;

    const hasTrip =
      typeof window.tripManager !== 'undefined' &&
      typeof window.tripManager.getCurrentTrip === 'function' &&
      !!window.tripManager.getCurrentTrip();

    if (!hasTrip) {
      this.hideArrival?.();
      this.showToast?.('No hay viaje activo para finalizar', 'warning');
      return;
    }

    btnFinish.disabled = true;
    btnFinish.textContent = 'Finalizando...';

    window.dispatchEvent(
      new CustomEvent('driverAction', {
        detail: { action: 'finish' }
      })
    );
  });
}    
  if (menuButton) {
      this._menuButtonClickHandler = () => this.toggleMenu();
      menuButton.addEventListener('click', this._menuButtonClickHandler);
    }

    if (menuBackdrop) {
      this._menuBackdropClickHandler = () => this.closeMenu();
      menuBackdrop.addEventListener('click', this._menuBackdropClickHandler);
    }

    if (menuProfile) {
      this._menuProfileClickHandler = () => this.toggleProfileMenu();
      menuProfile.addEventListener('click', this._menuProfileClickHandler);
    }

    document.addEventListener('touchstart', (e) => {
      this._menuTouchStartX = e.touches?.[0]?.clientX || 0;
      this._menuTouchCurrentX = this._menuTouchStartX;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      this._menuTouchCurrentX = e.touches?.[0]?.clientX || this._menuTouchCurrentX;
    }, { passive: true });

    document.addEventListener('touchend', () => {
      const deltaX = this._menuTouchCurrentX - this._menuTouchStartX;
      const menuOpen = document.body.classList.contains('menu-open');

      if (!menuOpen && this._menuTouchStartX < 18 && deltaX > 70) {
        this.openMenu();
      }

      if (menuOpen && deltaX < -70) {
        this.closeMenu();
      }

      this._menuTouchStartX = 0;
      this._menuTouchCurrentX = 0;
    }, { passive: true });
  }
  _removeDOMListeners() {
    const acceptBtn = this.elements['btn-accept'];
    const rejectBtn = this.elements['btn-reject'];
    const backdrop = this.elements['modal-backdrop'];
    const sheetHandle = this.elements['sheet-handle'];
    const modal = this.elements['incoming-modal'];
    const callBtn = this.elements['btn-call'];
    const whatsappBtn = this.elements['btn-whatsapp'];
    const navigateBtn = this.elements['btn-navigate'];
    const btnContinue = this.elements['btn-continue'];
    const btnFinish = this.elements['btn-finish'];
    const menuButton = this.elements['menu-button'];
    const menuBackdrop = this.elements['menu-backdrop'];
    const menuProfile = this.elements['menu-profile'];
    
    if (acceptBtn) {
      acceptBtn.removeEventListener('click', this._handleAccept);
      if (this._acceptTouchStartHandler) {
        acceptBtn.removeEventListener('touchstart', this._acceptTouchStartHandler);
      }
    }

    if (rejectBtn) {
      rejectBtn.removeEventListener('click', this._handleReject);
      if (this._rejectTouchStartHandler) {
        rejectBtn.removeEventListener('touchstart', this._rejectTouchStartHandler);
      }
    }

    if (backdrop) {
      backdrop.removeEventListener('click', this._onBackdropClick);
    }

    if (sheetHandle && this._sheetHandleClickHandler) {
      sheetHandle.removeEventListener('click', this._sheetHandleClickHandler);
    }

    if (modal && this._modalTouchMoveHandler) {
      modal.removeEventListener('touchmove', this._modalTouchMoveHandler);
    }

    if (callBtn && this._callBtnHapticHandler) {
      callBtn.removeEventListener('click', this._callBtnHapticHandler);
    }

    if (whatsappBtn && this._whatsappBtnHapticHandler) {
      whatsappBtn.removeEventListener('click', this._whatsappBtnHapticHandler);
    }

    if (navigateBtn && this._navigateBtnHapticHandler) {
      navigateBtn.removeEventListener('click', this._navigateBtnHapticHandler);
    }
    if (btnContinue) {
  btnContinue.replaceWith(btnContinue.cloneNode(true));
  this.elements['btn-continue'] = document.getElementById('btn-continue');
}

if (btnFinish) {
  btnFinish.replaceWith(btnFinish.cloneNode(true));
  this.elements['btn-finish'] = document.getElementById('btn-finish');
}

    if (menuButton && this._menuButtonClickHandler) {
      menuButton.removeEventListener('click', this._menuButtonClickHandler);
    }

    if (menuBackdrop && this._menuBackdropClickHandler) {
      menuBackdrop.removeEventListener('click', this._menuBackdropClickHandler);
    }

    if (menuProfile && this._menuProfileClickHandler) {
      menuProfile.removeEventListener('click', this._menuProfileClickHandler);
    }
  }
  _setupViewport() {
    const setVH = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };

    this._viewportResizeHandler = setVH;
    this._viewportOrientationHandler = () => setTimeout(setVH, 100);

    setVH();
    window.addEventListener('resize', this._viewportResizeHandler);
    window.addEventListener('orientationchange', this._viewportOrientationHandler);
  }

  _removeViewportListeners() {
    if (this._viewportResizeHandler) {
      window.removeEventListener('resize', this._viewportResizeHandler);
    }
    if (this._viewportOrientationHandler) {
      window.removeEventListener('orientationchange', this._viewportOrientationHandler);
    }
  }

  _setupGestures() {
    if (this._gestureCleanup) return;

    const sheet = this.elements['bottom-sheet'];
    const handle = this.elements['sheet-handle'];

    if (!sheet || !handle) return;

    handle.addEventListener('touchstart', this._onTouchStart, { passive: true });
    sheet.addEventListener('touchstart', this._onTouchStart, { passive: true });
    document.addEventListener('touchmove', this._onTouchMove, { passive: false });
    document.addEventListener('touchend', this._onTouchEnd, { passive: true });

    this._gestureCleanup = true;
  }

  _removeGestureListeners() {
    const sheet = this.elements['bottom-sheet'];
    const handle = this.elements['sheet-handle'];

    if (handle) {
      handle.removeEventListener('touchstart', this._onTouchStart);
    }
    if (sheet) {
      sheet.removeEventListener('touchstart', this._onTouchStart);
    }

    document.removeEventListener('touchmove', this._onTouchMove);
    document.removeEventListener('touchend', this._onTouchEnd);
  }

  _normalizeTripState(estado) {
    return String(estado || '').trim().toUpperCase();
  }

  _isDestinationState(estado) {
    const s = this._normalizeTripState(estado);
    return s === 'EN_CURSO' || s === 'EN_VIAJE' || s === 'TRIP_STARTED';
  }

  _getNavigateMeta(trip) {
    const irADestino = this._isDestinationState(trip?.estado);

    const lat = irADestino ? trip?.destino_lat : trip?.origen_lat;
    const lng = irADestino ? trip?.destino_lng : trip?.origen_lng;

    const hasCoords = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));

    return {
      irADestino,
      lat,
      lng,
      texto: irADestino ? 'Ir a destino' : 'Ir a recogida',
      icono: 'ðŸ',
      url: hasCoords
        ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving&dir_action=navigate`
        : null
    };
  }

  _handleTripStateChanged(e) {
    if (!e.detail) return;

    const estado = e.detail.estado;
    if (!estado || !this.state.currentTrip) return;

    this.state.currentTrip.estado = estado;
    this._updateNavigateButton(this.state.currentTrip);
    this._updateNavigationInfo(this.state.currentTrip);
    this._showTripActions(this.state.currentTrip);
  }

  _handleDriverFlowStateChanged(e) {
    const state = e.detail?.state;
    if (!state || !this.state.currentTrip) return;

    const trip = this.state.currentTrip;

    if (
      state === 'GOING_TO_PICKUP' ||
      state === 'ARRIVED_PICKUP' ||
      state === 'TRIP_STARTED' ||
      state === 'ARRIVED_DESTINATION'
    ) {
      this._updateNavigationInfo(trip);
      this._updateNavigateButton(trip);
      this._showTripActions(trip);
    }
  }

  renderDriverFlowState(state, trip) {
    console.log('[UI] Flow state:', state);

    switch (state) {
      case 'OFFLINE':
      case 'ONLINE_IDLE':
        this.hideNavigation();
        this.hideArrival();
        this.showWaitingState();
        break;

      case 'RECEIVING_OFFER':
        break;

      case 'GOING_TO_PICKUP':
      case 'TRIP_STARTED':
        this.showNavigationState(trip);
        break;

      case 'ARRIVED_PICKUP':
        this.hideArrival();
        this.showNavigationState(trip);
        break;

      case 'ARRIVED_DESTINATION':
        this.showArrival(trip);
        break;

      case 'TRIP_COMPLETED':
        this.hideNavigation();
        this.hideArrival();
        this.showWaitingState();
        break;
    }
  }

  _onTouchStart(e) {
    const touch = e.touches?.[0];
    if (!touch) return;

    this.touchStartY = touch.clientY;
    this.touchCurrentY = touch.clientY;

    const sheet = this.elements['bottom-sheet'];
    this.sheetHeight = sheet ? sheet.offsetHeight : 0;
  }

  _onTouchMove(e) {
    if (!this.touchStartY) return;

    const touch = e.touches?.[0];
    if (!touch) return;

    this.touchCurrentY = touch.clientY;
    const deltaY = this.touchCurrentY - this.touchStartY;

    if (Math.abs(deltaY) > 8) {
      e.preventDefault();
    }
  }

  _onTouchEnd() {
    if (!this.touchStartY) return;

    const deltaY = this.touchCurrentY - this.touchStartY;
    const threshold = 60;

    if (deltaY < -threshold) {
      this._expandBottomSheet();
    } else if (deltaY > threshold) {
      this._collapseBottomSheet();
    }

    this.touchStartY = 0;
    this.touchCurrentY = 0;
    this.sheetHeight = 0;
  }

  _toggleBottomSheet() {
    if (this.state.bottomSheetExpanded) {
      this._collapseBottomSheet();
    } else {
      this._expandBottomSheet();
    }
  }

    _expandBottomSheet() {
    const sheet = this.elements['bottom-sheet'];
    if (!sheet) return;

    sheet.classList.add('expanded');
    document.body.classList.add('sheet-expanded');
    this.state.bottomSheetExpanded = true;
    this._haptic('light');
  }

    _collapseBottomSheet() {
    const sheet = this.elements['bottom-sheet'];
    if (!sheet) return;

    sheet.classList.remove('expanded');
    document.body.classList.remove('sheet-expanded');
    this.state.bottomSheetExpanded = false;
  }

  showIncomingTrip(tripData, onAccept, onReject) {
    if (!tripData?.id) return;

    console.log('[UI] Showing incoming trip:', tripData.id);

    if (this.state.isModalOpen && this.lastTripModalId === tripData.id) {
      console.log('[UI] Same trip already displayed, skipping reopen');
      return;
    }

    if (this.state.isModalOpen) {
      this._closeIncomingModal();
    }

    const offerTimeout = Number(CONFIG.INCOMING_OFFER_TIMEOUT || 15);

    this.lastTripModalId = tripData.id;
    this.state.callbacks = { onAccept, onReject };
    this.state.currentTrip = tripData;
    this.state.currentCount = offerTimeout;

    const modal = this.elements['incoming-modal'];
    if (!modal) {
      console.error('[UI] Modal element not found');
      return;
    }

    this._populateTripData(tripData);
    modal.classList.add('active');
    this.state.isModalOpen = true;

    soundManager.play('newTrip');
    this._haptic('heavy');
    this._playCountdownSound(offerTimeout);
    this._startCountdown(offerTimeout);

    this.state.countdownTimeout = setTimeout(() => {
      if (this.state.isModalOpen) {
        this._handleReject();
      }
    }, offerTimeout * 1000);
  }

  _populateTripData(trip) {
    const data = {
      'trip-pickup': trip.origen_direccion || trip.origen || 'Origen no disponible',
      'trip-dropoff': trip.destino_direccion || trip.destino || 'Destino no disponible',
      'trip-distance': trip.km ? `${Number(trip.km).toFixed(1)} km` : '-- km',
      'trip-km': trip.km ? `${Number(trip.km).toFixed(1)} km` : '-- km',
      'trip-price': trip.precio ? `$${Math.round(trip.precio).toLocaleString('es-AR')}` : '$--',
      'trip-duration': trip.tiempo_espera ? `${trip.tiempo_espera} min` : '-- min',
      'client-name': trip.pasajero_nombre || trip.cliente || 'Cliente',
      'client-phone': trip.pasajero_telefono || trip.telefono || 'Sin telÃ©fono',
      'pickup-time': trip.tiempo_espera ? `${trip.tiempo_espera} min` : '-- min',
      'pickup-address': trip.origen_direccion || trip.origen || '',
      'dropoff-address': trip.destino_direccion || trip.destino || ''
    };

    Object.entries(data).forEach(([key, value]) => {
      const el = this.elements[key];
      if (el) {
        el.style.opacity = '0';
        setTimeout(() => {
          el.textContent = value;
          el.style.opacity = '1';
        }, 120);
      }
    });

    const avatarEl = this.elements['client-avatar'];
    if (avatarEl && data['client-name']) {
      avatarEl.textContent = data['client-name'].charAt(0).toUpperCase();
    }
  }

  _startCountdown(totalSeconds = Number(CONFIG.INCOMING_OFFER_TIMEOUT || 15)) {
    this._clearCountdownIntervalOnly();

    const circle = this.elements['countdown-circle'];
    const number = this.elements['countdown-number'];
    const ring = this.elements['countdown-ring'];

    if (number) {
      number.textContent = String(totalSeconds);
      number.classList.remove('urgent');
    }

    if (circle) {
      circle.style.strokeDasharray = '283';
      circle.style.strokeDashoffset = '0';
      circle.style.transition = 'stroke-dashoffset 1s linear';
    }

    if (ring) {
      ring.classList.remove('urgent');
    }

    let count = totalSeconds;

    this.state.countdown = setInterval(() => {
      count--;

      if (number) {
        number.textContent = String(Math.max(count, 0));

        if (count <= 5) {
          number.classList.add('urgent');
          if (ring) ring.classList.add('urgent');
          this._haptic('error');
        } else if (count <= 10) {
          this._haptic('light');
        }
      }

      if (circle) {
        const offset = 283 - ((Math.max(count, 0) / totalSeconds) * 283);
        circle.style.strokeDashoffset = String(offset);
      }

      if (count <= 0) {
        this._handleReject();
      }
    }, 1000);
  }

  _playCountdownSound(totalSeconds = Number(CONFIG.INCOMING_OFFER_TIMEOUT || 15)) {
    if (this._countdownSoundInterval) {
      clearInterval(this._countdownSoundInterval);
      this._countdownSoundInterval = null;
    }

    let ticks = 0;
    const tickStart = Math.max(totalSeconds - 5, 0);

    this._countdownSoundInterval = setInterval(() => {
      ticks++;

      if (ticks >= tickStart) {
        soundManager.play('tick');
      }

      if (ticks >= totalSeconds || !this.state.isModalOpen) {
        clearInterval(this._countdownSoundInterval);
        this._countdownSoundInterval = null;
      }
    }, 1000);
  }

  async _handleAccept(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!this.state.isModalOpen || this.state.isProcessing) return;

    this.state.isProcessing = true;
    console.log('[UI] Trip accepted');

    const btn = this.elements['btn-accept'];
    if (btn) {
      btn.classList.add('accepting');
      btn.innerHTML = '<span class="spinner-small"></span><small>Aceptando...</small>';
    }

    soundManager.play('accept');
    this._haptic('success');

    const callback = this.state.callbacks.onAccept;

    if (callback) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 300));
        const res = await callback();

        if (res && res.success === false) {
          this.showToast(res.error || 'No se pudo aceptar el viaje', 'warning');

          this._clearCountdownTimers();

          const offerTimeout = Number(CONFIG.INCOMING_OFFER_TIMEOUT || 15);
          this._resetCountdownUI();
          this.state.currentCount = offerTimeout;
          this._startCountdown(offerTimeout);
          this._playCountdownSound(offerTimeout);

          this.state.countdownTimeout = setTimeout(() => {
            if (this.state.isModalOpen) {
              this._handleReject();
            }
          }, offerTimeout * 1000);

          this.state.isProcessing = false;
          return;
        }

        this.lastTripModalId = null;
        this._closeIncomingModal();
      } catch (err) {
        console.error('[UI] Error in accept callback:', err);
        this.showToast('Error al procesar aceptaciÃ³n', 'error');
        this._resetCountdownUI();
        this.state.isProcessing = false;
        return;
      }
    }

    this.state.isProcessing = false;
  }

  async _handleReject(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!this.state.isModalOpen || this.state.isProcessing) return;

    this.state.isProcessing = true;
    console.log('[UI] Trip rejected');

    soundManager.play('reject');
    this._haptic('light');

    const callback = this.state.callbacks.onReject;

    this.lastTripModalId = null;
    this._closeIncomingModal();

    if (callback) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 100));
        callback();
      } catch (err) {
        console.error('[UI] Error in reject callback:', err);
      }
    }

    this.state.isProcessing = false;
  }

  _onBackdropClick(e) {
    if (e.target === this.elements['modal-backdrop']) {
      this._handleReject();
    }
  }

  _closeIncomingModal() {
    if (!this.state.isModalOpen) return;

    this._clearCountdownTimers();

    const modal = this.elements['incoming-modal'];
    const content = this.elements['modal-content'];

    if (content) {
      content.style.animation = 'slideDownOut 0.3s ease forwards';
    }

    setTimeout(() => {
      if (modal) modal.classList.remove('active');
      if (content) content.style.animation = '';
      this._resetCountdownUI();
    }, 300);

    this.state.isModalOpen = false;
    this.state.callbacks = {};
    this.lastTripModalId = null;
  }

  _clearCountdownIntervalOnly() {
    if (this.state.countdown) {
      clearInterval(this.state.countdown);
      this.state.countdown = null;
    }
  }

  _clearCountdownTimers() {
    if (this.state.countdown) {
      clearInterval(this.state.countdown);
      this.state.countdown = null;
    }

    if (this.state.countdownTimeout) {
      clearTimeout(this.state.countdownTimeout);
      this.state.countdownTimeout = null;
    }

    if (this._countdownSoundInterval) {
      clearInterval(this._countdownSoundInterval);
      this._countdownSoundInterval = null;
    }
  }

  _clearArrivalTimer() {
    if (this._arrivalTimeout) {
      clearTimeout(this._arrivalTimeout);
      this._arrivalTimeout = null;
    }
  }

  _resetCountdownUI() {
    const circle = this.elements['countdown-circle'];
    const number = this.elements['countdown-number'];
    const ring = this.elements['countdown-ring'];
    const btn = this.elements['btn-accept'];

    if (circle) {
      circle.style.strokeDashoffset = '283';
      circle.style.transition = 'none';
    }

    if (number) {
      number.textContent = String(Number(CONFIG.INCOMING_OFFER_TIMEOUT || 15));
      number.classList.remove('urgent');
    }

    if (ring) {
      ring.classList.remove('urgent');
    }

    if (btn) {
      btn.classList.remove('accepting');
      btn.innerHTML = '<span>âœ“</span><small>Aceptar</small>';
    }
  }

  hideIncomingModal() {
    this._closeIncomingModal();
  }

updateDriverState(mode, isOnline) {
  const online = Boolean(isOnline);
  this.state.isOnline = online;

  const dot = this.elements['status-dot'];
  const text = this.elements['status-text'];
  const fab = this.elements['fab-online'];
  const fabText = this.elements['fab-text'];
  const fabIcon = this.elements['fab-icon'];
  const fabSubtext = this.elements['fab-subtext'];
  const fabPulse = this.elements['fab-pulse'];
  const navText = this.elements['nav-next'];
  const sheet = this.elements['bottom-sheet'];

  document.body.classList.toggle('driver-online', online);
  document.body.classList.toggle('driver-offline', !online);

  if (dot) {
    dot.classList.toggle('online', online);
    dot.style.animation = online ? 'pulse-ring 2s infinite' : '';
  }

  if (text) {
    text.textContent = online ? 'En linea · Buscando viajes' : 'Fuera de linea';
    text.classList.toggle('online', online);
  }

  if (fab) {
    fab.classList.toggle('online', online);
    fab.setAttribute('aria-pressed', online ? 'true' : 'false');
    fab.setAttribute('aria-label', online ? 'Estas en linea. Toca para desconectarte' : 'Estas fuera de linea. Toca para conectarte');
  }

  if (fabText) {
    fabText.textContent = online ? 'En linea' : 'Conectar';
  }

  if (fabIcon) {
    fabIcon.textContent = online ? 'ON' : 'OFF';
    fabIcon.style.color = '#fff';
  }

  if (fabSubtext) {
    fabSubtext.textContent = online ? 'Toca para pausar' : 'Fuera de linea';
  }

  if (fabPulse) {
    fabPulse.style.display = online ? 'block' : 'none';
  }

  if (navText && !this.state.currentTrip) {
    navText.textContent = online
      ? 'Buscando viajes cercanos...'
      : 'Conectate para recibir viajes';
  }

  if (sheet && !this.state.currentTrip) {
    sheet.classList.toggle('has-trip', false);
  }

  this._updateBottomSheetState(online);
  this.showWaitingState();
  this._haptic(online ? 'success' : 'light');
}
_updateBottomSheetState(isOnline) {
  const sheetContent = this.elements['sheet-content'];
  const sheet = this.elements['bottom-sheet'];
  if (!sheetContent || !sheet) return;

  const desiredState = isOnline ? 'online' : 'offline';

  if (sheetContent.dataset.waitingState === desiredState && !sheetContent.dataset.flowState) {
    return;
  }

  sheetContent.dataset.waitingState = desiredState;
  delete sheetContent.dataset.flowState;

  if (isOnline) {
    sheet.classList.remove('has-trip');
    sheetContent.innerHTML = `
      <div class="waiting-state uber-style">
        <div class="waiting-text">
          <h3>Listo para recibir viajes</h3>
          <p>Quedate en linea y te vamos mostrando pedidos cercanos apenas entren.</p>
        </div>
        <div class="trip-metrics-horizontal">
          <div class="metric-box">
            <span class="metric-value">En linea</span>
            <span class="metric-label">Estado</span>
          </div>
          <div class="metric-box">
            <span class="metric-value">${this._escapeHtml(document.getElementById('stat-trips')?.textContent || '0')}</span>
            <span class="metric-label">Viajes hoy</span>
          </div>
          <div class="metric-box">
            <span class="metric-value">${this._escapeHtml(document.getElementById('stat-rating')?.textContent || '5.0')}</span>
            <span class="metric-label">Calificacion</span>
          </div>
        </div>
      </div>
    `;
  } else {
    sheet.classList.remove('has-trip');
    sheetContent.innerHTML = `
      <div class="waiting-state offline">
        <div class="waiting-text">
          <h3>Todo listo para salir a trabajar</h3>
          <p>Toca el boton redondo para conectarte. Cuando estes en linea te van a entrar viajes y alertas.</p>
        </div>
        <div class="trip-metrics-horizontal">
          <div class="metric-box">
            <span class="metric-value">Off</span>
            <span class="metric-label">Estado</span>
          </div>
          <div class="metric-box">
            <span class="metric-value">${this._escapeHtml(document.getElementById('stat-earnings')?.textContent || '$0')}</span>
            <span class="metric-label">Ganado hoy</span>
          </div>
          <div class="metric-box">
            <span class="metric-value">${this._escapeHtml(document.getElementById('stat-trips')?.textContent || '0')}</span>
            <span class="metric-label">Viajes hoy</span>
          </div>
        </div>
      </div>
    `;
  }
}
  showWaitingState() {
    this._collapseBottomSheet();
    this._updateBottomSheetState(this.state.isOnline);
  }

showNavigationState(trip) {
  this.state.currentTrip = trip;

  const navBar = this.elements['nav-bar'];
  const sheet = this.elements['bottom-sheet'];

  document.body.classList.add('trip-active');

  if (navBar) {
    navBar.classList.add('active');
    navBar.style.transform = 'translateY(0)';
  }

  if (sheet) {
    sheet.classList.add('has-trip');
    this._expandBottomSheet();
  }

  this._updateNavigationInfo(trip);
  this._showTripActions(trip);
  this._haptic('success');
}
  _updateNavigateButton(trip) {
    const btn = document.getElementById('btn-navigate');
    if (!btn) return;

    const { texto, icono, url } = this._getNavigateMeta(trip);

    btn.innerHTML = `
      <span class="icon">${icono}</span>
      <span>${texto}</span>
    `;

    btn.onclick = () => {
      if (!url) {
        this.showToast('Coordenadas no disponibles para navegar', 'warning');
        return;
      }
      window.open(url, '_blank');
    };
  }

  _updateNavigationInfo(trip) {
    const streetEl = this.elements['nav-street'];
    const nextEl = this.elements['nav-next'];
    const distanceEl = this.elements['nav-distance'];

    const irADestino = this._isDestinationState(trip?.estado);

    if (streetEl) {
      streetEl.textContent = irADestino
        ? 'DirÃ­gete al destino final'
        : 'DirÃ­gete al punto de recogida';
    }

    if (nextEl) {
      nextEl.textContent = irADestino
        ? (trip.destino_direccion || trip.destino || 'Destino')
        : (trip.origen_direccion || trip.origen || 'Recoger pasajero');
    }

    if (distanceEl) {
      let dist = '--';

      if (!irADestino && trip.distancia_al_origen) {
        dist = `${(trip.distancia_al_origen / 1000).toFixed(1)} km`;
      } else if (irADestino && trip.km) {
        dist = `${Number(trip.km).toFixed(1)} km`;
      }

      distanceEl.textContent = dist;
    }
  }

  _showTripActions(trip) {
    const sheetContent = this.elements['sheet-content'];
    if (!sheetContent || !trip?.id) return;

    const flowState = this._normalizeTripState(trip.estado);
    const renderKey = `${trip.id}:${flowState}`;

    if (this._lastTripRendered === renderKey && sheetContent.dataset.flowState === flowState) {
      return;
    }

    this._lastTripRendered = renderKey;

    const { irADestino, texto, icono, url } = this._getNavigateMeta(trip);

    sheetContent.dataset.flowState = flowState;
    delete sheetContent.dataset.waitingState;

    sheetContent.innerHTML = `
      <div class="trip-active-panel">
        <div class="trip-header">
          <div class="client-info-large">
            <div class="client-avatar-large">
              ${(trip.pasajero_nombre || trip.cliente || 'C').charAt(0)}
            </div>

            <div class="client-details">
              <h4>${trip.pasajero_nombre || trip.cliente || 'Cliente'}</h4>
              <span class="trip-destination">${trip.destino_direccion || trip.destino || 'Destino'}</span>
            </div>

            <div class="trip-price-large">
              $${Math.round(trip.precio || 0).toLocaleString('es-AR')}
            </div>
          </div>
        </div>

        <div class="action-buttons-grid">
          <button class="action-btn-large navigate" id="btn-navigate">
            <span class="icon">${icono}</span>
            <span>${texto}</span>
          </button>

          <button class="action-btn-large call" id="btn-call">
            <span class="icon">ðŸ“ž</span>
            <span>Llamar</span>
          </button>

          <button class="action-btn-large cancel" id="btn-cancel">
            <span class="icon">âŒ</span>
            <span>Cancelar</span>
          </button>
        </div>

        <div class="trip-progress-steps">
          <div class="step active" data-step="pickup">
            <div class="step-dot"></div>
            <span>Recoger</span>
          </div>
          <div class="step-line"></div>
          <div class="step" data-step="trip">
            <div class="step-dot"></div>
            <span>En viaje</span>
          </div>
          <div class="step-line"></div>
          <div class="step" data-step="finish">
            <div class="step-dot"></div>
            <span>Finalizar</span>
          </div>
        </div>

        <button class="btn-arrived" id="btn-arrived">
          <span>âœ“</span>
          <span>${irADestino ? 'Finalizar viaje' : 'He llegado Â· Iniciar viaje'}</span>
        </button>
      </div>
    `;

    const btnNavigate = document.getElementById('btn-navigate');
    const btnCall = document.getElementById('btn-call');
    const btnCancel = document.getElementById('btn-cancel');
    const btnArrived = document.getElementById('btn-arrived');

    if (btnNavigate) {
      btnNavigate.onclick = () => {
        if (!url) {
          this.showToast('Coordenadas no disponibles para navegar', 'warning');
          return;
        }
        window.open(url, '_blank');
      };
    }

    if (btnCall) {
      const phone = trip.pasajero_telefono || trip.telefono;
      btnCall.onclick = () => {
        if (phone) {
          window.location.href = `tel:${phone}`;
        } else {
          this.showToast('TelÃ©fono no disponible', 'warning');
        }
      };
    }

    if (btnCancel) {
      btnCancel.onclick = () => {
        if (confirm('Â¿Seguro que querÃ©s cancelar este viaje?')) {
          window.dispatchEvent(new CustomEvent('driverAction', {
            detail: { action: 'cancel', tripId: trip.id }
          }));
        }
      };
    }

    if (btnArrived) {
      btnArrived.onclick = () => {
        window.dispatchEvent(new CustomEvent('driverAction', {
          detail: { action: irADestino ? 'finish' : 'start', tripId: trip.id }
        }));
      };
    }
  }

  updateTripStep(step) {
    const steps = document.querySelectorAll('.trip-progress-steps .step');
    steps.forEach((el, idx) => {
      const stepName = el.dataset.step;
      if (stepName === step) {
        el.classList.add('active');
        for (let i = 0; i < idx; i++) {
          steps[i].classList.add('completed');
        }
      }
    });
  }

hideNavigation() {
  const navBar = this.elements['nav-bar'];
  const sheet = this.elements['bottom-sheet'];

  document.body.classList.remove('trip-active');

  if (navBar) {
    navBar.classList.remove('active');
    navBar.style.transform = 'translateY(-100%)';
  }

  if (sheet) {
    sheet.classList.remove('has-trip');
    this._collapseBottomSheet();
  }

  this.state.currentTrip = null;
  this._lastTripRendered = null;
}
showArrival(trip = this.state.currentTrip) {
  const panel = this.elements['arrival-panel'];
  if (!panel) return;

  const hasTrip = !!trip?.id;
  const isDestinationTrip = this._isDestinationState(trip?.estado);

  if (!hasTrip || !isDestinationTrip) {
    this.hideArrival();
    return;
  }

  this.state.currentTrip = trip;

  panel.classList.add('active');
  panel.setAttribute('aria-hidden', 'false');
  panel.style.opacity = '1';
  panel.style.visibility = 'visible';
  panel.style.pointerEvents = 'auto';
  panel.style.transform = '';

  soundManager.play('arrival');
  this._haptic('success');

  this._clearArrivalTimer();
  this._arrivalTimeout = setTimeout(() => {
    if (panel.classList.contains('active')) {
      this.hideArrival();
    }
  }, 10000);
}
hideArrival() {
  const panel = this.elements['arrival-panel'];
  if (panel) {
    panel.classList.remove('active');
    panel.setAttribute('aria-hidden', 'true');
    panel.style.opacity = '0';
    panel.style.visibility = 'hidden';
    panel.style.pointerEvents = 'none';
    panel.style.transform = '';
  }
  this._clearArrivalTimer();
}
  showToast(message, type = 'info', duration = 3000) {
    const container = this.elements['toast-container'];
    if (!container) {
      console.log('[Toast]', message);
      return;
    }

    const duplicateToast = [...container.querySelectorAll('.toast')]
      .find((item) => {
        const text = item.querySelector('.toast-message')?.textContent || '';
        return text === message && item.classList.contains(`toast-${type}`);
      });

    if (duplicateToast) {
      duplicateToast.remove();
    }

    const toast = document.createElement('div');
    const icons = {
      info: 'â„¹ï¸',
      success: 'âœ…',
      error: 'âŒ',
      warning: 'âš ï¸'
    };

    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.transform = 'translateX(-50%) translateY(0)';
      toast.style.opacity = '1';
    });

    const hapticType = type === 'error' ? 'error' : type === 'success' ? 'success' : 'light';
    this._haptic(hapticType);

    setTimeout(() => {
      toast.style.transform = 'translateX(-50%) translateY(-20px)';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  setGlobalLoading(show, message = 'Cargando...') {
    const loading = this.elements['global-loading'];
    if (!loading) return;

    if (show) {
      loading.classList.add('active');
      const text = loading.querySelector('.loading-text');
      if (text) text.textContent = message;
    } else {
      loading.classList.remove('active');
    }
  }

  setDriverProfile(profileOrName, maybeAvatarUrl = '') {
    const nameEl = this.elements['driver-name'];
    const initialEl = this.elements['driver-initial'];
    const statusDot = this.elements['status-dot'];
    const avatarContainer = this.avatarEl;

    const menuAvatar = this.elements['menu-avatar'];
    const menuName = this.elements['menu-name'];
    const menuEmail = this.elements['menu-email'];

    const isObject = profileOrName && typeof profileOrName === 'object';
    const displayName = isObject
      ? (profileOrName.name || profileOrName.full_name || profileOrName.email || 'Conductor')
      : (profileOrName || 'Conductor');

    const email = isObject ? (profileOrName.email || '') : '';
    const avatarUrl = isObject
      ? (profileOrName.avatarUrl || profileOrName.avatar_url || profileOrName.picture || '')
      : (maybeAvatarUrl || '');

    if (nameEl) {
      nameEl.textContent = displayName;
      if (email) nameEl.title = email;
    }

    if (avatarContainer) {
      const safeInitial = String(displayName || 'C').charAt(0).toUpperCase();

      if (avatarUrl) {
        avatarContainer.innerHTML = `
          <img
            src="${avatarUrl}"
            alt="${displayName}"
            referrerpolicy="no-referrer"
            loading="eager"
            decoding="async"
            style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;"
          />
          <span id="status-dot" class="status-dot${this.state.isOnline ? ' online' : ''}"></span>
        `;
        this.elements['status-dot'] = avatarContainer.querySelector('#status-dot');
        this.elements['driver-initial'] = null;
      } else {
        avatarContainer.innerHTML = `
          <span id="driver-initial">${safeInitial}</span>
          <span id="status-dot" class="status-dot${this.state.isOnline ? ' online' : ''}"></span>
        `;
        this.elements['driver-initial'] = avatarContainer.querySelector('#driver-initial');
        this.elements['status-dot'] = avatarContainer.querySelector('#status-dot');
      }
    }

    if (menuName) {
      menuName.textContent = displayName;
    }

    if (menuEmail) {
      menuEmail.textContent = email || 'Sin sesiÃ³n';
    }

    if (menuAvatar) {
      const safeInitial = String(displayName || 'C').charAt(0).toUpperCase();

      if (avatarUrl) {
        menuAvatar.innerHTML = `
          <img
            src="${avatarUrl}"
            alt="${displayName}"
            referrerpolicy="no-referrer"
            loading="eager"
            decoding="async"
          />
        `;
      } else {
        menuAvatar.innerHTML = `<span id="menu-avatar-initial">${safeInitial}</span>`;
      }
    }

    if (initialEl && !avatarContainer) {
      initialEl.textContent = String(displayName || 'C').charAt(0).toUpperCase();
    }

    if (statusDot) {
      statusDot.classList.toggle('online', this.state.isOnline);
    }
  }

  _escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

    showInfoSheet(options = {}) {
    const sheet = this.elements['bottom-sheet'];
    const sheetContent = this.elements['sheet-content'];

    if (!sheet || !sheetContent) return;
    if (this.state.currentTrip) {
      this.showToast('Esta opcion no esta disponible durante un viaje', 'warning');
      return;
    }

    const {
      title = 'Detalle',
      description = '',
      metrics = [],
      sections = [],
      actions = []
    } = options;

    const safeMetrics = Array.isArray(metrics) ? metrics : [];
    const safeSections = Array.isArray(sections) ? sections : [];
    const safeActions = Array.isArray(actions) ? actions : [];

    sheet.classList.remove('has-trip');
    sheetContent.dataset.flowState = 'info';
    delete sheetContent.dataset.waitingState;

    sheetContent.innerHTML = `
      <div class="waiting-state uber-style info-sheet-view">
        <div class="waiting-text">
          <h3>${this._escapeHtml(title)}</h3>
          <p>${this._escapeHtml(description)}</p>
        </div>
        ${safeMetrics.length ? `
          <div class="trip-metrics-horizontal">
            ${safeMetrics.map((item) => `
              <div class="metric-box">
                <span class="metric-value">${this._escapeHtml(item.value)}</span>
                <span class="metric-label">${this._escapeHtml(item.label)}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
        ${safeSections.map((section) => `
          <section class="info-sheet-section">
            <div class="info-sheet-section-title">${this._escapeHtml(section.title || '')}</div>
            <div class="info-sheet-list">
              ${(Array.isArray(section.items) ? section.items : []).map((item) => `
                <div class="info-sheet-item">
                  <span class="info-sheet-item-label">${this._escapeHtml(item.label || '')}</span>
                  <span class="info-sheet-item-value">${this._escapeHtml(item.value || 'Sin datos')}</span>
                </div>
              `).join('')}
            </div>
          </section>
        `).join('')}
        ${safeActions.length ? `
          <div class="info-sheet-actions">
            ${safeActions.map((action, index) => `
              <button class="action-btn-large ${this._escapeHtml(action.variant || 'navigate')}" data-sheet-action="${index}">
                <span>${this._escapeHtml(action.label || 'Abrir')}</span>
              </button>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;

    sheetContent.querySelectorAll('[data-sheet-action]').forEach((button) => {
      button.addEventListener('click', () => {
        const idx = Number(button.getAttribute('data-sheet-action'));
        const action = safeActions[idx];
        if (typeof action?.onClick === 'function') {
          action.onClick();
        }
      });
    });

    sheetContent.scrollTop = 0;
    this._expandBottomSheet();
    this._haptic('light');
  }

  openMenu() {
    const menu = this.elements['side-menu'];
    const backdrop = this.elements['menu-backdrop'];
    if (!menu) return;

    menu.classList.add('active');
    menu.setAttribute('aria-hidden', 'false');
    backdrop?.classList.add('active');
    document.body.classList.add('menu-open');
    this._haptic('light');
  }

  toggleMenu() {
    const menu = this.elements['side-menu'];
    if (!menu) return;

    const isOpen = menu.classList.contains('active');
    if (isOpen) {
      this.closeMenu();
    } else {
      this.openMenu();
    }
  }

closeMenu() {
  const menu = this.elements['side-menu'];
  const backdrop = this.elements['menu-backdrop'];

  if (menu && menu.contains(document.activeElement)) {
    document.activeElement.blur();
  }

  menu?.classList.remove('active');
  menu?.classList.remove('profile-expanded');
  menu?.setAttribute('aria-hidden', 'true');
  backdrop?.classList.remove('active');
  document.body.classList.remove('menu-open');
}
  toggleProfileMenu() {
    const menu = this.elements['side-menu'];
    const profile = this.elements['menu-profile'];
    if (!menu || !profile) return;

    const expanded = menu.classList.toggle('profile-expanded');
    profile.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    this._haptic('light');
  }
  
  _haptic(type = 'light') {
    if (!navigator.vibrate) return;
    if (!soundManager?._hapticsUnlocked) return;

    const patterns = {
      light: [10],
      medium: [20],
      heavy: [30],
      success: [10, 50, 10],
      error: [30, 30, 30],
      countdown: [5]
    };

    try {
      navigator.vibrate(patterns[type] || patterns.light);
    } catch {
      // silent fail
    }
  }
}

const uiController = new UIController();
export default uiController;
