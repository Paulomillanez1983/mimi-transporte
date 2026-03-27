/**
 * MIMI Driver App - Orquestador Principal Premium
 * Arquitectura modular con manejo de errores avanzado
 */

import CONFIG from '/mimi-transporte/js/config.js';
import supabaseService from '/mimi-transporte/js/supabase-client.js';
import mapService from '/mimi-transporte/js/map-service.js';
import locationTracker from '/mimi-transporte/js/location-tracker.js';
import tripManager from '/mimi-transporte/js/trip-manager.js';
import soundManager from '/mimi-transporte/js/sound-manager.js';
import uiController from '/mimi-transporte/js/ui-controller.js';

class DriverApp {
  constructor() {
    this.initialized = false;
    this.unsubscribers = [];
    this.mapReady = false;
    this.locationReady = false;
    this.tripsReady = false;
    this.lastIncomingTripId = null;
    this.currentState = 'INIT'; // INIT, ONLINE, BUSY, OFFLINE

    this._handlingTripAction = new Set();
    this._driverActionBound = null;
    this._visibilityBound = null;
    this._onlineStatus = false;
  }

  async init() {
    try {
      // Verificar autenticación
      if (!supabaseService.isAuthenticated()) {
        window.location.href = CONFIG.REDIRECTS.LOGIN;
        return;
      }

      // Inicializar servicios críticos
      const dbReady = await supabaseService.init();
      if (!dbReady) {
        throw new Error('No se pudo conectar a la base de datos');
      }

      // Asegurar que el conductor existe en DB
      const driverData = supabaseService.getCurrentDriverData() || {};
      await supabaseService.ensureDriverExists(driverData);

      // Inicializar UI primero para feedback visual
      uiController.init();
      uiController.showToast('Iniciando sistema...', 'info', 2000);

      // Inicializar servicios en paralelo donde sea posible
      await Promise.all([
        this._safeInitMap(),
        this._safeInitLocation()
      ]);

      // Inicializar gestión de viajes (depende de location)
      await this._safeInitTrips();

      // Suscribirse a eventos
      this._subscribeToEvents();
      this._bindAudioUnlock();
      this._bindDisponibilidadButton();
      this._bindVisibilityHandler();

      this.initialized = true;
      this._setState('ONLINE');
      this._updateDriverStatus();

      // Resize del mapa post-inicialización
      setTimeout(() => this._safeResizeMap(), 300);
      setTimeout(() => this._safeResizeMap(), 1000);

      this._renderInitialState();

      // Notificación de éxito con sonido
      const initMessage = this.mapReady && this.locationReady 
        ? 'Sistema listo - Buscando viajes' 
        : 'Sistema listo (modo limitado)';
      
      uiController.showToast(initMessage, 'success');
      soundManager.notify('success');

    } catch (error) {
      console.error('App initialization failed:', error);
      uiController.showToast('Error crítico: ' + (error?.message || 'desconocido'), 'error');
      soundManager.notify('error');
    }
  }

  // =========================
  // STATE MANAGEMENT
  // =========================
  _setState(newState) {
    const validStates = ['INIT', 'ONLINE', 'BUSY', 'OFFLINE', 'ERROR'];
    if (!validStates.includes(newState)) return;

    const oldState = this.currentState;
    this.currentState = newState;

    console.log(`🔄 State transition: ${oldState} → ${newState}`);
    
    // Actualizar UI según estado
    uiController.updateDriverState(newState, this._onlineStatus);
  }

  // =========================
  // BINDINGS
  // =========================
  _bindAudioUnlock() {
    const unlockHandler = async () => {
      try {
        await soundManager.enableOnUserInteraction();
        console.log('🔊 Audio desbloqueado');
      } catch (e) {
        console.warn('No se pudo habilitar audio:', e);
      }
    };

    document.body.addEventListener('click', unlockHandler, { once: true });
    document.body.addEventListener('touchstart', unlockHandler, { once: true });
  }

  _bindDisponibilidadButton() {
    const btn = document.getElementById('btnToggleDisponibilidad');
    if (!btn) return;

    let isProcessing = false;

    btn.addEventListener('click', async () => {
      if (isProcessing) return;
      isProcessing = true;

      try {
        btn.disabled = true;
        const originalText = btn.textContent;
        
        // Animación de loading
        btn.innerHTML = '<span class="spinner"></span> Actualizando...';
        btn.classList.add('loading');

        const driverId = supabaseService.getCurrentDriverId();
        const newStatus = !this._onlineStatus;
        
        await supabaseService.setDriverAvailability(driverId, newStatus);
        
        this._onlineStatus = newStatus;
        this._updateDriverStatus();
        
        // Feedback
        const message = newStatus ? 'Estás ONLINE - Recibiendo solicitudes' : 'Estás OFFLINE - No recibirás solicitudes';
        uiController.showToast(message, newStatus ? 'success' : 'warning');
        soundManager.notify(newStatus ? 'success' : 'notification');

        // Actualizar apariencia del botón
        btn.classList.toggle('btn-online', newStatus);
        btn.classList.toggle('btn-offline', !newStatus);

      } catch (e) {
        console.error('Error cambiando disponibilidad:', e);
        uiController.showToast('Error al actualizar estado', 'error');
        soundManager.notify('error');
      } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
        isProcessing = false;
      }
    });
  }

  _bindVisibilityHandler() {
    this._visibilityBound = () => {
      if (document.hidden) {
        // App en background - reducir actualizaciones
        console.log('📱 App en background');
      } else {
        // App en foreground - refrescar estado
        console.log('📱 App en foreground');
        this._safeResizeMap();
        tripManager.refreshTrips();
      }
    };

    document.addEventListener('visibilitychange', this._visibilityBound);
  }

  // =========================
  // SAFE INITIALIZERS
  // =========================
  async _safeInitMap() {
    try {
      await mapService.init('mainMap');
      this.mapReady = true;
      console.log('🗺️ Mapa inicializado');
    } catch (error) {
      this.mapReady = false;
      console.warn('Mapa no disponible:', error);
      uiController.showToast('Mapa no disponible - Usando modo texto', 'warning');
    }
  }

  async _safeInitLocation() {
    try {
      await locationTracker.start((position) => {
        this._onPositionUpdate(position);
      });
      this.locationReady = true;
      console.log('📍 Location tracking activo');
    } catch (error) {
      this.locationReady = false;
      console.warn('Ubicación no disponible:', error);
      uiController.showToast('GPS no disponible - Verifica permisos', 'warning');
    }
  }

  async _safeInitTrips() {
    try {
      await tripManager.init();
      this.tripsReady = true;
      console.log('🚗 TripManager inicializado');
    } catch (error) {
      this.tripsReady = false;
      throw new Error('No se pudo iniciar la gestión de viajes');
    }
  }

  _safeResizeMap() {
    try {
      mapService.resize();
    } catch (e) {
      // Silencioso
    }
  }

  // =========================
  // EVENT SUBSCRIPTIONS
  // =========================
  _subscribeToEvents() {
    // Nueva oferta disponible
    this.unsubscribers.push(
      tripManager.on('newAvailableTrip', (trip) => {
        this._handleIncomingTrip(trip);
      })
    );

    // Oferta pendiente forzada
    this.unsubscribers.push(
      tripManager.on('newPendingTrip', (trip) => {
        this._handleIncomingTrip(trip, { force: true, priority: 'high' });
      })
    );

    // Oferta expirada/cancelada
    this.unsubscribers.push(
      tripManager.on('pendingTripCleared', ({ reason }) => {
        this.lastIncomingTripId = null;
        uiController.closeIncomingModal();

        if (['TIMEOUT', 'EXPIRED_LOCAL', 'CANCELADA'].includes(reason)) {
          uiController.showToast('La oferta ya no está disponible', 'warning');
          soundManager.notify('notification');
        }
      })
    );

    // Viaje aceptado
    this.unsubscribers.push(
      tripManager.on('tripAccepted', (trip) => {
        this._setState('BUSY');
        this.lastIncomingTripId = null;
        uiController.closeIncomingModal();
        
        uiController.showToast('✅ Viaje aceptado - Dirígete al origen', 'success');
        soundManager.speak('Viaje aceptado. Dirígete al punto de recogida.', 'urgent');
        soundManager.notify('success');
        
        this._showTripOnMap(trip);
        uiController.renderActiveTrip(trip);
        uiController.updateStats(tripManager.getStats?.() || {});
      })
    );

    // Viaje iniciado
    this.unsubscribers.push(
      tripManager.on('tripStarted', (trip) => {
        uiController.showToast('🚗 Viaje iniciado - Buen camino', 'success');
        soundManager.speak('Viaje iniciado. Buen camino.', 'normal');
        soundManager.notify('success');
        
        this._showTripOnMap(trip);
        uiController.renderActiveTrip(trip);
        uiController.updateStats(tripManager.getStats?.() || {});
      })
    );

    // Viaje completado
    this.unsubscribers.push(
      tripManager.on('tripCompleted', (trip) => {
        this._setState('ONLINE');
        this.lastIncomingTripId = null;
        uiController.closeIncomingModal();
        
        const earnings = trip?.precio || 0;
        uiController.showToast(`🏁 Viaje completado +$${earnings}`, 'success', 5000);
        soundManager.speak(`Viaje completado. Ganancia ${earnings} pesos.`, 'normal');
        soundManager.notify('success');

        this._clearTripFromMap();
        uiController.hideNavigation();
        uiController.renderAvailableTrips([]);
        uiController.updateStats(tripManager.getStats?.() || {});
      })
    );

    // Viaje cancelado
    this.unsubscribers.push(
      tripManager.on('tripCancelled', () => {
        this._setState('ONLINE');
        this.lastIncomingTripId = null;
        uiController.closeIncomingModal();
        
        uiController.showToast('Viaje cancelado', 'warning');
        soundManager.notify('error');

        this._clearTripFromMap();
        uiController.hideNavigation();
        uiController.renderAvailableTrips([]);
        uiController.updateStats(tripManager.getStats?.() || {});
      })
    );

    // Refresh general
    this.unsubscribers.push(
      tripManager.on('tripsRefreshed', () => {
        this._renderInitialState();
      })
    );

    // Binding de acciones del driver
    this._driverActionBound = (e) => this._handleDriverAction(e.detail);
    document.addEventListener('driverAction', this._driverActionBound);
  }

  // =========================
  // TRIP HANDLERS
  // =========================
  _handleIncomingTrip(trip, options = {}) {
    const { force = false, priority = 'normal' } = options;

    if (!trip?.id) return;
    if (tripManager.getCurrentTrip()) return;
    if (!force && tripManager.getPendingTrip()) return;

    if (this.lastIncomingTripId === trip.id && uiController.isIncomingModalOpen()) {
      return;
    }

    this.lastIncomingTripId = trip.id;

    // Notificación premium con sonido y voz
    soundManager.notify('newTrip');
    
    if (priority === 'high' || CONFIG.FEATURES.enableSmartNotifications) {
      soundManager.speak(`Nueva solicitud de viaje. ${trip.km || 0} kilómetros. $${trip.precio || 0} pesos.`, 'urgent');
    }

    uiController.showIncomingModal(
      trip,
      () => this._handleAcceptTrip(trip.id),
      () => this._handleRejectTrip(trip.id)
    );
  }

  async _handleDriverAction(detail = {}) {
    const { action, tripId } = detail || {};
    if (!action) return;

    // Debounce de acciones
    const result = await this._runTripActionLock(tripId, async () => {
      switch (action) {
        case 'accept':
          return await tripManager.acceptTrip(tripId);
        case 'reject':
          return await tripManager.rejectTrip(tripId);
        case 'start':
          return await tripManager.startTrip(tripId);
        case 'finish':
          return await this._handleFinishWithConfirmation(tripId);
        case 'cancel':
          return await this._handleCancelWithConfirmation(tripId);
        case 'whatsapp':
          this._openWhatsApp(tripId);
          return { success: true };
        case 'navigate':
          this._openExternalNavigation(tripId);
          return { success: true };
        default:
          return { success: false, error: 'Acción desconocida' };
      }
    });

    if (!result?.success && result?.error) {
      uiController.showToast(result.error, 'error');
      soundManager.notify('error');
    }
  }

  async _handleFinishWithConfirmation(tripId) {
    // Modal de confirmación mejorado
    const confirmed = await uiController.showConfirmationModal({
      title: '¿Finalizar viaje?',
      message: 'Verifica que has llegado al destino correcto',
      confirmText: 'Finalizar',
      cancelText: 'Volver',
      type: 'success'
    });

    if (!confirmed) return { success: false, cancelled: true };

    const notes = await uiController.showInputModal({
      title: 'Observaciones',
      placeholder: '¿Alguna nota sobre el viaje? (opcional)',
      confirmText: 'Guardar'
    });

    return await tripManager.finishTrip(tripId, notes || '');
  }

  async _handleCancelWithConfirmation(tripId) {
    const confirmed = await uiController.showConfirmationModal({
      title: '¿Cancelar viaje?',
      message: 'Esta acción afectará tu reputación como conductor',
      confirmText: 'Sí, cancelar',
      cancelText: 'Continuar viaje',
      type: 'danger'
    });

    if (!confirmed) return { success: false, cancelled: true };

    const reason = await uiController.showInputModal({
      title: 'Motivo de cancelación',
      placeholder: 'Indica el motivo (requerido)',
      required: true
    });

    if (!reason) return { success: false, error: 'Motivo requerido' };

    return await tripManager.cancelTrip(tripId, reason);
  }

  async _runTripActionLock(tripId, fn) {
    const key = String(tripId || 'global');

    if (this._handlingTripAction.has(key)) {
      return { success: false, error: 'Acción en progreso...' };
    }

    this._handlingTripAction.add(key);
    uiController.setGlobalLoading(true);

    try {
      return await fn();
    } finally {
      this._handlingTripAction.delete(key);
      uiController.setGlobalLoading(false);
    }
  }

  // =========================
  // POSITION & MAP
  // =========================
  _onPositionUpdate(position) {
    if (!position) return;

    // Actualizar en mapa
    if (this.mapReady) {
      try {
        mapService.updateDriverPosition(position.lng, position.lat, position.heading);
      } catch (e) {
        console.warn('Error actualizando posición en mapa:', e);
      }
    }

    // Calcular distancia a destino si hay viaje activo
    const currentTrip = tripManager.getCurrentTrip?.();
    if (currentTrip && currentTrip.estado === CONFIG.ESTADOS.EN_CURSO) {
      this._updateNavigationInfo(position, currentTrip);
    }
  }

  _updateNavigationInfo(position, trip) {
    if (!this.mapReady || !trip.destino_lat || !trip.destino_lng) return;

    try {
      const distance = mapService.constructor.calculateDistance(
        position.lat,
        position.lng,
        trip.destino_lat,
        trip.destino_lng
      );

      uiController.updateNavigationDistance(distance);

      // Haptic feedback según distancia
      soundManager.vibrateArrival(distance);

      // Anuncio de llegada
      if (distance < 50 && !this._arrivalAnnounced) {
        this._arrivalAnnounced = true;
        soundManager.speak('Has llegado al destino.', 'urgent');
        soundManager.notify('arrival');
      } else if (distance > 100) {
        this._arrivalAnnounced = false;
      }
    } catch (e) {
      console.warn('Error calculando navegación:', e);
    }
  }

  _showTripOnMap(trip) {
    if (!this.mapReady || !trip) return;

    const hasOrigin = typeof trip.origen_lat === 'number' && typeof trip.origen_lng === 'number';
    const hasDestination = typeof trip.destino_lat === 'number' && typeof trip.destino_lng === 'number';

    if (hasOrigin && hasDestination) {
      try {
        mapService.showTripRoute(
          { lat: trip.origen_lat, lng: trip.origen_lng },
          { lat: trip.destino_lat, lng: trip.destino_lng }
        );
      } catch (e) {
        console.warn('Error mostrando ruta:', e);
      }
    }
  }

  _clearTripFromMap() {
    if (!this.mapReady) return;
    try {
      mapService.clearTripMarkers();
    } catch (e) {
      console.warn('Error limpiando mapa:', e);
    }
  }

  // =========================
  // EXTERNAL ACTIONS
  // =========================
  _openWhatsApp(tripId = null) {
    const targetTrip = this._findTripById(tripId);
    if (!targetTrip?.telefono) {
      uiController.showToast('No hay teléfono disponible', 'warning');
      return;
    }

    const phone = String(targetTrip.telefono).replace(/\D/g, '');
    const message = encodeURIComponent('Hola, soy tu conductor de MIMI. Ya estoy en camino. 🚐');
    window.open(`https://wa.me/${phone}?text=${message}`, '_blank', 'noopener,noreferrer');
  }

  _openExternalNavigation(tripId = null) {
    const targetTrip = this._findTripById(tripId);
    if (!targetTrip?.destino_lat || !targetTrip?.destino_lng) {
      uiController.showToast('Coordenadas no disponibles', 'warning');
      return;
    }

    // Preferir Google Maps, fallback a Waze
    const lat = targetTrip.destino_lat;
    const lng = targetTrip.destino_lng;
    const label = encodeURIComponent(targetTrip.destino || 'Destino MIMI');

    // Detectar iOS para usar Apple Maps
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    
    let url;
    if (isIOS) {
      url = `http://maps.apple.com/?daddr=${lat},${lng}&q=${label}`;
    } else {
      url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    }

    window.open(url, '_blank');
  }

  _findTripById(tripId) {
    const currentTrip = tripManager.getCurrentTrip?.();
    const pendingTrip = tripManager.getPendingTrip?.();
    
    if (currentTrip?.id === tripId) return currentTrip;
    if (pendingTrip?.id === tripId) return pendingTrip;
    return currentTrip || pendingTrip;
  }

  // =========================
  // UI UPDATES
  // =========================
  _renderInitialState() {
    const currentTrip = tripManager.getCurrentTrip?.();
    const pendingTrip = tripManager.getPendingTrip?.();

    if (currentTrip) {
      this._setState('BUSY');
      uiController.renderActiveTrip(currentTrip);
      this._showTripOnMap(currentTrip);
    } else if (pendingTrip) {
      uiController.renderAvailableTrips([pendingTrip]);
    } else {
      uiController.renderAvailableTrips([]);
    }

    uiController.updateStats(tripManager.getStats?.() || {});
  }

  _updateDriverStatus() {
    const statusEl = document.getElementById('estadoChofer');
    if (!statusEl) return;

    const statusText = !this.locationReady 
      ? '⚠️ Sin GPS' 
      : this._onlineStatus 
        ? '🟢 ONLINE' 
        : '🔴 OFFLINE';
    
    statusEl.textContent = statusText;
    statusEl.className = this._onlineStatus ? 'status-online' : 'status-offline';
  }

  // =========================
  // CLEANUP
  // =========================
  destroy() {
    this.unsubscribers.forEach(unsub => {
      try { unsub?.(); } catch (e) {}
    });
    this.unsubscribers = [];

    if (this._driverActionBound) {
      document.removeEventListener('driverAction', this._driverActionBound);
    }
    if (this._visibilityBound) {
      document.removeEventListener('visibilitychange', this._visibilityBound);
    }

    try { locationTracker.stop(); } catch (e) {}
    try { tripManager.destroy(); } catch (e) {}
    try { mapService.destroy(); } catch (e) {}
  }
}

export default DriverApp;
