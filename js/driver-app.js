/**
 * MIMI Driver App - Orquestador Principal Premium
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
    this.currentState = 'INIT';
    this._handlingTripAction = new Set();
    this._driverActionBound = null;
    this._visibilityBound = null;
    this._onlineStatus = false;
    this._arrivalAnnounced = false;
    this._audioInitialized = false;
    this._currentTripId = null;
  }

  async init() {
    try {
      if (!supabaseService.isAuthenticated()) {
        window.location.href = CONFIG.REDIRECTS.LOGIN;
        return;
      }

      const dbReady = await supabaseService.init();
      if (!dbReady) {
        throw new Error('No se pudo conectar a la base de datos');
      }

      const driverData = supabaseService.getCurrentDriverData() || {};
      await supabaseService.ensureDriverExists(driverData);

      uiController.init();
      uiController.showToast('Iniciando sistema...', 'info', 2000);

      // Inicializar servicios (no bloqueantes entre sí)
      await Promise.allSettled([
        this._safeInitMap(),
        this._safeInitLocation(),
        this._safeInitAudio()
      ]);

      await this._safeInitTrips();

      this._subscribeToEvents();
      this._bindDisponibilidadButton();
      this._bindVisibilityHandler();

      // Audio se desbloquea en primera interacción
      this._bindAudioUnlock();

      this.initialized = true;
      this._setState('ONLINE');
      this._updateDriverStatus();

      setTimeout(() => this._safeResizeMap(), 300);
      setTimeout(() => this._safeResizeMap(), 1000);

      this._renderInitialState();

      // Toast de éxito sin sonido (audio aún no desbloqueado)
      const initMessage = this.mapReady && this.locationReady 
        ? 'Sistema listo' 
        : 'Sistema listo (modo limitado)';
      uiController.showToast(initMessage, 'success');

    } catch (error) {
      console.error('App initialization failed:', error);
      uiController.showToast('Error: ' + (error?.message || 'desconocido'), 'error');
    }
  }

  async _safeInitAudio() {
    try {
      await soundManager.init();
    } catch (e) {
      console.warn('Audio no disponible:', e);
    }
  }

  _bindAudioUnlock() {
    const unlockHandler = async () => {
      if (this._audioInitialized) return;
      this._audioInitialized = true;
      
      try {
        await soundManager.enableOnUserInteraction();
        console.log('🔊 Audio y haptics desbloqueados');
      } catch (e) {
        console.warn('No se pudo desbloquear audio:', e);
      }
    };

    ['click', 'touchstart', 'keydown'].forEach(event => {
      document.body.addEventListener(event, unlockHandler, { once: true, passive: true });
    });
  }

  _setState(newState) {
    const validStates = ['INIT', 'ONLINE', 'BUSY', 'OFFLINE', 'ERROR'];
    if (!validStates.includes(newState)) return;

    this.currentState = newState;
    uiController.updateDriverState(newState, this._onlineStatus);
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
        const originalHTML = btn.innerHTML;
        
        btn.innerHTML = '<span class="spinner"></span> Actualizando...';

        const driverId = supabaseService.getCurrentDriverId();
        const newStatus = !this._onlineStatus;
        
        await supabaseService.setDriverAvailability(driverId, newStatus);
        
        this._onlineStatus = newStatus;
        this._updateDriverStatus();
        
        const message = newStatus ? 'Estás ONLINE' : 'Estás OFFLINE';
        uiController.showToast(message, newStatus ? 'success' : 'warning');
        
        // Sonido solo si audio está desbloqueado
        if (this._audioInitialized) {
          soundManager.notify(newStatus ? 'success' : 'notification');
        }

        btn.classList.toggle('btn-online', newStatus);
        btn.classList.toggle('btn-offline', !newStatus);
        btn.innerHTML = newStatus 
          ? '<span>🔴</span> Desconectarse' 
          : '<span>🟢</span> Conectarse';

      } catch (e) {
        console.error('Error:', e);
        uiController.showToast('Error al actualizar estado', 'error');
      } finally {
        btn.disabled = false;
        isProcessing = false;
      }
    });
  }

  _bindVisibilityHandler() {
    this._visibilityBound = () => {
      if (!document.hidden) {
        this._safeResizeMap();
        tripManager.refreshTrips?.();
      }
    };
    document.addEventListener('visibilitychange', this._visibilityBound);
  }

  async _safeInitMap() {
    try {
      await mapService.init('mainMap');
      this.mapReady = true;
      console.log('🗺️ Mapa inicializado');
    } catch (error) {
      this.mapReady = false;
      console.warn('Mapa no disponible:', error);
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
    }
  }

  async _safeInitTrips() {
    try {
      await tripManager.init();
      this.tripsReady = true;
      console.log('🚗 TripManager inicializado');
    } catch (error) {
      this.tripsReady = false;
      throw error;
    }
  }

  _safeResizeMap() {
    try { mapService.resize(); } catch (e) {}
  }

  _subscribeToEvents() {
    this.unsubscribers.push(
      tripManager.on('newPendingTrip', (trip) => {
        this._handleIncomingTrip(trip, { force: true });
      })
    );

    this.unsubscribers.push(
      tripManager.on('pendingTripCleared', ({ reason }) => {
        this.lastIncomingTripId = null;
        uiController.closeIncomingModal();
        if (['TIMEOUT', 'EXPIRED_LOCAL', 'CANCELADA'].includes(reason)) {
          uiController.showToast('La oferta ya no está disponible', 'warning');
          if (this._audioInitialized) soundManager.notify('notification');
        }
      })
    );

    this.unsubscribers.push(
      tripManager.on('tripAccepted', (trip) => {
        this._setState('BUSY');
        this._currentTripId = trip.id;
        this.lastIncomingTripId = null;
        uiController.closeIncomingModal();
        uiController.showToast('Viaje aceptado', 'success');
        
        if (this._audioInitialized) {
          soundManager.speak('Viaje aceptado. Dirígete al punto de recogida.', 'urgent');
          soundManager.notify('success');
        }
        
        this._showTripOnMap(trip);
        uiController.renderActiveTrip(trip);
        uiController.updateStats(tripManager.getStats?.() || {});
      })
    );

    this.unsubscribers.push(
      tripManager.on('tripStarted', (trip) => {
        this._currentTripId = trip.id;
        uiController.showToast('Viaje iniciado', 'success');
        if (this._audioInitialized) {
          soundManager.speak('Viaje iniciado. Buen camino.', 'normal');
          soundManager.notify('success');
        }
        this._showTripOnMap(trip);
        uiController.renderActiveTrip(trip);
        uiController.updateStats(tripManager.getStats?.() || {});
      })
    );

    this.unsubscribers.push(
      tripManager.on('tripCompleted', (trip) => {
        this._setState('ONLINE');
        this._currentTripId = null;
        this.lastIncomingTripId = null;
        uiController.closeIncomingModal();
        
        const earnings = trip?.precio || 0;
        uiController.showToast(`Viaje completado +$${earnings}`, 'success', 5000);
        
        if (this._audioInitialized) {
          soundManager.speak(`Viaje completado. Ganancia ${earnings} pesos.`, 'normal');
          soundManager.notify('success');
        }

        this._clearTripFromMap();
        uiController.hideNavigation();
        uiController.renderAvailableTrips([]);
        uiController.updateStats(tripManager.getStats?.() || {});
      })
    );

    this.unsubscribers.push(
      tripManager.on('tripCancelled', () => {
        this._setState('ONLINE');
        this._currentTripId = null;
        this.lastIncomingTripId = null;
        uiController.closeIncomingModal();
        uiController.showToast('Viaje cancelado', 'warning');
        if (this._audioInitialized) soundManager.notify('error');

        this._clearTripFromMap();
        uiController.hideNavigation();
        uiController.renderAvailableTrips([]);
        uiController.updateStats(tripManager.getStats?.() || {});
      })
    );

    this._driverActionBound = (e) => this._handleDriverAction(e.detail);
    document.addEventListener('driverAction', this._driverActionBound);
  }

  _handleIncomingTrip(trip, options = {}) {
    const { force = false } = options;
    if (!trip?.id) return;
    if (tripManager.getCurrentTrip?.()) return;
    if (!force && tripManager.getPendingTrip?.()) return;

    if (this.lastIncomingTripId === trip.id && uiController.isIncomingModalOpen()) return;

    this.lastIncomingTripId = trip.id;

    if (this._audioInitialized) {
      soundManager.notify('newTrip');
      soundManager.speak(`Nueva solicitud. ${trip.km || 0} kilómetros. $${trip.precio || 0} pesos.`, 'urgent');
    }

    uiController.showIncomingModal(
      trip,
      () => this._handleAcceptTrip(trip.id),
      () => this._handleRejectTrip(trip.id)
    );
  }

  // MÉTODOS FALTANTES - AÑADIDOS
  async _handleAcceptTrip(tripId) {
    return await this._runTripActionLock(tripId, async () => {
      return await tripManager.acceptTrip(tripId);
    });
  }

  async _handleRejectTrip(tripId) {
    return await this._runTripActionLock(tripId, async () => {
      return await tripManager.rejectTrip(tripId);
    });
  }

  async _handleDriverAction(detail = {}) {
    const { action, tripId } = detail || {};
    if (!action) return;

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
      if (this._audioInitialized) soundManager.notify('error');
    }
  }

  async _handleFinishWithConfirmation(tripId) {
    const confirmed = await uiController.showConfirmationModal({
      title: '¿Finalizar viaje?',
      message: 'Verifica que has llegado al destino',
      confirmText: 'Finalizar',
      cancelText: 'Volver',
      type: 'success'
    });

    if (!confirmed) return { success: false, cancelled: true };

    const notes = await uiController.showInputModal({
      title: 'Observaciones',
      placeholder: '¿Alguna nota? (opcional)',
      confirmText: 'Guardar'
    });

    return await tripManager.finishTrip(tripId, notes || '');
  }

  async _handleCancelWithConfirmation(tripId) {
    const confirmed = await uiController.showConfirmationModal({
      title: '¿Cancelar viaje?',
      message: 'Esta acción afectará tu reputación',
      confirmText: 'Sí, cancelar',
      cancelText: 'Continuar',
      type: 'danger'
    });

    if (!confirmed) {
      // CORRECCIÓN: Asegurar que el loading se oculte si se cancela la confirmación
      return { success: false, cancelled: true };
    }

    const reason = await uiController.showInputModal({
      title: 'Motivo de cancelación',
      placeholder: 'Indica el motivo',
      required: true
    });

    if (!reason) {
      // CORRECCIÓN: Asegurar que el loading se oculte si no se proporciona motivo
      return { success: false, error: 'Motivo requerido', cancelled: true };
    }

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
      const result = await fn();
      return result;
    } catch (error) {
      console.error('Error en acción de viaje:', error);
      return { success: false, error: error.message || 'Error desconocido' };
    } finally {
      this._handlingTripAction.delete(key);
      // CORRECCIÓN: Asegurar que el loading siempre se oculte
      uiController.setGlobalLoading(false);
    }
  }

  _onPositionUpdate(position) {
    if (!position) return;

    if (this.mapReady) {
      try {
        mapService.updateDriverPosition(position.lng, position.lat, position.heading);
      } catch (e) {}
    }

    const currentTrip = tripManager.getCurrentTrip?.();
    if (currentTrip?.estado === CONFIG.ESTADOS.EN_CURSO) {
      this._updateNavigationInfo(position, currentTrip);
    }
  }

  _updateNavigationInfo(position, trip) {
    if (!this.mapReady || !trip?.destino_lat || !trip?.destino_lng) return;

    try {
      const distance = mapService.constructor.calculateDistance(
        position.lat, position.lng,
        trip.destino_lat, trip.destino_lng
      );

      uiController.updateNavigationDistance(distance);

      if (this._audioInitialized) {
        soundManager.vibrateArrival(distance);
      }

      if (distance < 50 && !this._arrivalAnnounced) {
        this._arrivalAnnounced = true;
        if (this._audioInitialized) {
          soundManager.speak('Has llegado al destino.', 'urgent');
          soundManager.notify('arrival');
        }
      } else if (distance > 100) {
        this._arrivalAnnounced = false;
      }
    } catch (e) {}
  }

  _showTripOnMap(trip) {
    if (!this.mapReady || !trip) return;
    
    if (typeof trip.origen_lat === 'number' && typeof trip.origen_lng === 'number' &&
        typeof trip.destino_lat === 'number' && typeof trip.destino_lng === 'number') {
      try {
        mapService.showTripRoute(
          { lat: trip.origen_lat, lng: trip.origen_lng },
          { lat: trip.destino_lat, lng: trip.destino_lng }
        );
      } catch (e) {}
    }
  }

  _clearTripFromMap() {
    if (!this.mapReady) return;
    try { mapService.clearTripMarkers(); } catch (e) {}
  }

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

    const { destino_lat, destino_lng, destino } = targetTrip;
    const label = encodeURIComponent(destino || 'Destino MIMI');
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    
    const url = isIOS 
      ? `http://maps.apple.com/?daddr=${destino_lat},${destino_lng}&q=${label}`
      : `https://www.google.com/maps/dir/?api=1&destination=${destino_lat},${destino_lng}`;

    window.open(url, '_blank');
  }

  _findTripById(tripId) {
    const currentTrip = tripManager.getCurrentTrip?.();
    const pendingTrip = tripManager.getPendingTrip?.();
    
    if (currentTrip?.id === tripId) return currentTrip;
    if (pendingTrip?.id === tripId) return pendingTrip;
    return currentTrip || pendingTrip;
  }

  _renderInitialState() {
    const currentTrip = tripManager.getCurrentTrip?.();
    const pendingTrip = tripManager.getPendingTrip?.();

    if (currentTrip) {
      this._setState('BUSY');
      this._currentTripId = currentTrip.id;
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
