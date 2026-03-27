/**
 * MIMI Driver App - Orquestador principal
 * Inicializa todos los servicios y coordina la lógica
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

    this._handlingTripAction = new Set();
    this._driverActionBound = null;
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

      await this._safeInitMap();
      await this._safeInitLocation();
      await this._safeInitTrips();

      this._subscribeToEvents();
      this._bindAudioUnlock();
      this._bindDisponibilidadButton();

      this.initialized = true;
      this._updateDriverStatus();

      setTimeout(() => this._safeResizeMap(), 300);
      setTimeout(() => this._safeResizeMap(), 1200);

      this._renderInitialState();

      if (this.tripsReady) {
        if (this.mapReady && this.locationReady) {
          uiController.showToast('Panel listo', 'success');
        } else {
          uiController.showToast('Panel listo (modo reducido)', 'warning');
        }
      } else {
        uiController.showToast('Panel iniciado con limitaciones', 'warning');
      }
    } catch (error) {
      console.error('App initialization failed:', error);
      uiController.showToast(
        'Error al iniciar: ' + (error?.message || 'desconocido'),
        'error'
      );
    }
  }

  _bindAudioUnlock() {
    document.body.addEventListener(
      'click',
      () => {
        try {
          soundManager.enableOnUserInteraction();
        } catch (e) {
          console.warn('No se pudo habilitar audio:', e);
        }
      },
      { once: true }
    );
  }

  _bindDisponibilidadButton() {
    const btn = document.getElementById('btnToggleDisponibilidad');
    if (!btn) return;

    btn.addEventListener('click', async () => {
      try {
        btn.disabled = true;
        btn.textContent = 'Actualizando...';

        if (typeof tripManager.toggleAvailability === 'function') {
          const result = await tripManager.toggleAvailability();

          if (result?.success) {
            uiController.showToast('Disponibilidad actualizada', 'success');
          } else {
            uiController.showToast(result?.error || 'No se pudo actualizar', 'warning');
          }
        } else {
          uiController.showToast('Función de disponibilidad no implementada aún', 'warning');
        }
      } catch (e) {
        console.error('Error cambiando disponibilidad:', e);
        uiController.showToast('Error al cambiar disponibilidad', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Cambiar disponibilidad';
      }
    });
  }

  _renderInitialState() {
    const currentTrip = tripManager.getCurrentTrip?.();
    const pendingTrip = tripManager.getPendingTrip?.();

    if (currentTrip) {
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
    const estadoChofer = document.getElementById('estadoChofer');
    if (!estadoChofer) return;

    estadoChofer.textContent = this.locationReady ? 'Online' : 'Sin ubicación';
  }

  _safeResizeMap() {
    try {
      mapService.resize();
    } catch (e) {
      console.warn('No se pudo redimensionar el mapa:', e);
    }
  }

  async _safeInitMap() {
    try {
      await mapService.init('mainMap');
      this.mapReady = true;
      console.log('Mapa inicializado correctamente');
    } catch (error) {
      this.mapReady = false;
      console.error('Mapa no disponible, continuando sin mapa:', error);
      uiController.showToast('Mapa no disponible temporalmente', 'warning');
    }
  }

  async _safeInitLocation() {
    try {
      await locationTracker.start((position) => {
        this._onPositionUpdate(position);
      });
      this.locationReady = true;
      this._updateDriverStatus();
      console.log('Tracking de ubicación iniciado');
    } catch (error) {
      this.locationReady = false;
      this._updateDriverStatus();
      console.error('No se pudo iniciar ubicación:', error);
      uiController.showToast('Ubicación no disponible', 'warning');
    }
  }

  async _safeInitTrips() {
    try {
      await tripManager.init();
      this.tripsReady = true;
      console.log('Gestión de viajes iniciada');
    } catch (error) {
      this.tripsReady = false;
      console.error('No se pudo iniciar gestión de viajes:', error);
      throw new Error('No se pudo iniciar la gestión de viajes');
    }
  }

  _subscribeToEvents() {
    this.unsubscribers.push(
      tripManager.on('newAvailableTrip', (trip) => {
        this._handleIncomingTrip(trip);
      })
    );

    this.unsubscribers.push(
      tripManager.on('newPendingTrip', (trip) => {
        this._handleIncomingTrip(trip, { force: true });
      })
    );

    this.unsubscribers.push(
      tripManager.on('pendingTripCleared', ({ reason }) => {
        this.lastIncomingTripId = null;
        uiController.closeIncomingModal();

        if (reason === 'TIMEOUT' || reason === 'EXPIRED_LOCAL' || reason === 'CANCELADA') {
          uiController.showToast('La oferta ya no está disponible', 'warning');
        }
      })
    );

    this.unsubscribers.push(
      tripManager.on('tripAccepted', (trip) => {
        this.lastIncomingTripId = null;
        uiController.closeIncomingModal();
        uiController.showToast('Viaje aceptado', 'success');
        this._safePlaySound('success');
        this._showTripOnMap(trip);
        uiController.renderActiveTrip(trip);
        uiController.updateStats(tripManager.getStats?.() || {});
      })
    );

    this.unsubscribers.push(
      tripManager.on('tripStarted', (trip) => {
        uiController.showToast('Viaje iniciado', 'success');
        this._safePlaySound('success');
        this._showTripOnMap(trip);
        uiController.renderActiveTrip(trip);
        uiController.updateStats(tripManager.getStats?.() || {});
      })
    );

    this.unsubscribers.push(
      tripManager.on('tripCompleted', () => {
        this.lastIncomingTripId = null;
        uiController.closeIncomingModal();
        uiController.showToast('Viaje completado', 'success');
        this._safePlaySound('success');

        if (this.mapReady) {
          try {
            mapService.clearTripMarkers();
          } catch (e) {
            console.warn('No se pudieron limpiar marcadores:', e);
          }
        }

        uiController.hideNavigation();
        uiController.renderAvailableTrips([]);
        uiController.updateStats(tripManager.getStats?.() || {});
      })
    );

    this.unsubscribers.push(
      tripManager.on('tripCancelled', () => {
        this.lastIncomingTripId = null;
        uiController.closeIncomingModal();

        if (this.mapReady) {
          try {
            mapService.clearTripMarkers();
          } catch (e) {
            console.warn('No se pudieron limpiar marcadores:', e);
          }
        }

        uiController.hideNavigation();
        uiController.renderAvailableTrips([]);
        uiController.updateStats(tripManager.getStats?.() || {});
      })
    );

    this.unsubscribers.push(
      tripManager.on('tripsRefreshed', () => {
        const currentTrip = tripManager.getCurrentTrip?.();
        const pendingTrip = tripManager.getPendingTrip?.();

        if (currentTrip) {
          uiController.renderActiveTrip(currentTrip);
        } else if (pendingTrip) {
          uiController.renderAvailableTrips([pendingTrip]);
        } else {
          uiController.renderAvailableTrips([]);
        }

        uiController.updateStats(tripManager.getStats?.() || {});
      })
    );

    this._driverActionBound = (e) => {
      this._handleDriverAction(e.detail);
    };

    document.addEventListener('driverAction', this._driverActionBound);
  }

  _handleIncomingTrip(trip, options = {}) {
    const { force = false } = options;

    if (!trip?.id) return;
    if (tripManager.getCurrentTrip()) return;
    if (!force && tripManager.getPendingTrip()) return;

    if (this.lastIncomingTripId === trip.id && uiController.isIncomingModalOpen()) {
      return;
    }

    this.lastIncomingTripId = trip.id;

    uiController.showIncomingModal(
      trip,
      () => this._handleAcceptTrip(trip.id),
      () => this._handleRejectTrip(trip.id)
    );
  }

  _safePlaySound(name) {
    try {
      soundManager.play(name);
    } catch (e) {
      console.warn('No se pudo reproducir sonido:', e);
    }
  }

  async _handleDriverAction(detail = {}) {
    const { action, tripId } = detail || {};
    if (!action) return;

    switch (action) {
      case 'accept':
        await this._handleAcceptTrip(tripId);
        break;
      case 'reject':
        await this._handleRejectTrip(tripId);
        break;
      case 'start':
        await this._handleStartTrip(tripId);
        break;
      case 'finish':
        await this._handleFinishTrip(tripId);
        break;
      case 'cancel':
        await this._handleCancelTrip(tripId);
        break;
      case 'whatsapp':
        this._openWhatsApp(tripId);
        break;
    }
  }

  async _runTripActionLock(tripId, fn) {
    const key = String(tripId || 'global');

    if (this._handlingTripAction.has(key)) {
      return { success: false, error: 'Acción en progreso' };
    }

    this._handlingTripAction.add(key);

    try {
      return await fn();
    } finally {
      this._handlingTripAction.delete(key);
    }
  }

  async _handleAcceptTrip(tripId) {
    const result = await this._runTripActionLock(tripId, async () => {
      return await tripManager.acceptTrip(tripId);
    });

    if (!result?.success) {
      uiController.showToast('Error al aceptar: ' + (result?.error || 'desconocido'), 'error');
    }
  }

  async _handleRejectTrip(tripId) {
    const result = await this._runTripActionLock(tripId, async () => {
      return await tripManager.rejectTrip(tripId);
    });

    if (result?.success) {
      if (this.lastIncomingTripId === tripId) {
        this.lastIncomingTripId = null;
      }

      uiController.closeIncomingModal();
      uiController.showToast('Viaje rechazado', 'warning');
    } else if (result?.error && result.error !== 'Acción en progreso') {
      uiController.showToast('Error al rechazar: ' + result.error, 'error');
    }
  }

  async _handleStartTrip(tripId) {
    const result = await this._runTripActionLock(tripId, async () => {
      return await tripManager.startTrip(tripId);
    });

    if (!result?.success) {
      uiController.showToast('Error al iniciar: ' + (result?.error || 'desconocido'), 'error');
    }
  }

  async _handleFinishTrip(tripId) {
    const notes = prompt('¿Alguna observación del viaje?') || '';

    const result = await this._runTripActionLock(tripId, async () => {
      return await tripManager.finishTrip(tripId, notes);
    });

    if (!result?.success) {
      uiController.showToast('Error al finalizar: ' + (result?.error || 'desconocido'), 'error');
    }
  }

  async _handleCancelTrip(tripId) {
    if (!confirm('¿Cancelar este viaje?')) return;

    const reason = prompt('Motivo de cancelación:') || '';

    const result = await this._runTripActionLock(tripId, async () => {
      return await tripManager.cancelTrip(tripId, reason);
    });

    if (result?.success) {
      this.lastIncomingTripId = null;
      uiController.showToast('Viaje cancelado', 'warning');

      if (this.mapReady) {
        try {
          mapService.clearTripMarkers();
        } catch (e) {
          console.warn('No se pudieron limpiar marcadores:', e);
        }
      }

      uiController.hideNavigation();
      uiController.renderAvailableTrips([]);
      uiController.updateStats(tripManager.getStats?.() || {});
    } else {
      uiController.showToast('Error: ' + (result?.error || 'desconocido'), 'error');
    }
  }

  _openWhatsApp(tripId = null) {
    const currentTrip = tripManager.getCurrentTrip?.();
    const pendingTrip = tripManager.getPendingTrip?.();
    const availableTrips = Array.isArray(tripManager.availableTrips) ? tripManager.availableTrips : [];

    const targetTrip =
      currentTrip?.id === tripId ? currentTrip :
      pendingTrip?.id === tripId ? pendingTrip :
      availableTrips.find(t => String(t.id) === String(tripId)) ||
      currentTrip ||
      pendingTrip;

    if (!targetTrip) {
      uiController.showToast('No se encontró el viaje', 'warning');
      return;
    }

    const phone = String(targetTrip.telefono || '').replace(/\D/g, '');
    if (!phone) {
      uiController.showToast('No hay teléfono disponible', 'warning');
      return;
    }

    window.open(`https://wa.me/${phone}`, '_blank', 'noopener,noreferrer');
  }

  _onPositionUpdate(position) {
    if (!position) return;

    if (this.mapReady) {
      try {
        mapService.updateDriverPosition(position.lng, position.lat, position.heading);
      } catch (e) {
        console.warn('No se pudo actualizar posición en mapa:', e);
      }
    }

    const currentTrip = tripManager.getCurrentTrip?.();

    if (
      currentTrip &&
      currentTrip.estado === CONFIG.ESTADOS.EN_CURSO &&
      this.mapReady &&
      typeof mapService.constructor.calculateDistance === 'function' &&
      typeof currentTrip.destino_lat === 'number' &&
      typeof currentTrip.destino_lng === 'number'
    ) {
      try {
        const distance = mapService.constructor.calculateDistance(
          position.lat,
          position.lng,
          currentTrip.destino_lat,
          currentTrip.destino_lng
        );
        uiController.updateNavigationDistance(distance);
      } catch (e) {
        console.warn('No se pudo calcular distancia:', e);
      }
    }
  }

  _showTripOnMap(trip) {
    if (!this.mapReady || !trip) return;

    const hasOrigin =
      typeof trip.origen_lat === 'number' &&
      typeof trip.origen_lng === 'number';

    const hasDestination =
      typeof trip.destino_lat === 'number' &&
      typeof trip.destino_lng === 'number';

    if (hasOrigin && hasDestination) {
      try {
        mapService.showTripRoute(
          { lat: trip.origen_lat, lng: trip.origen_lng },
          { lat: trip.destino_lat, lng: trip.destino_lng }
        );
      } catch (e) {
        console.warn('No se pudo mostrar ruta en mapa:', e);
      }
    }
  }

  destroy() {
    this.unsubscribers.forEach((unsub) => {
      try {
        unsub?.();
      } catch (e) {
        console.warn('Error liberando suscripción:', e);
      }
    });

    this.unsubscribers = [];

    if (this._driverActionBound) {
      document.removeEventListener('driverAction', this._driverActionBound);
      this._driverActionBound = null;
    }

    try { locationTracker.stop(); } catch (e) {}
    try { tripManager.destroy(); } catch (e) {}
    try { mapService.destroy(); } catch (e) {}
  }
}

export default DriverApp;
