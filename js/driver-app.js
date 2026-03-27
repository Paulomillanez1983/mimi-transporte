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
  }

  async init() {
    try {
      // 1. Verificar autenticación
      if (!supabaseService.isAuthenticated()) {
        window.location.href = CONFIG.REDIRECTS.LOGIN;
        return;
      }

      // 2. Inicializar Supabase (CRÍTICO)
      const dbReady = await supabaseService.init();
      const driverData = supabaseService.getCurrentDriverData() || {};
await supabaseService.ensureDriverExists(driverData);
      if (!dbReady) {
        throw new Error('No se pudo conectar a la base de datos');
      }

      // 3. Inicializar UI (CRÍTICO)
      uiController.init();

      // 4. Inicializar mapa (NO CRÍTICO)
      await this._safeInitMap();

      // 5. Inicializar tracking de ubicación (SEMI-CRÍTICO)
      await this._safeInitLocation();

      // 6. Inicializar gestión de viajes (CRÍTICO OPERATIVO)
      await this._safeInitTrips();

      // 7. Suscribirse a eventos
      this._subscribeToEvents();

      // 8. Activar audio en primera interacción
      document.body.addEventListener('click', () => {
        try {
          soundManager.enableOnUserInteraction();
        } catch (e) {
          console.warn('No se pudo habilitar audio:', e);
        }
      }, { once: true });

      this.initialized = true;

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
      uiController.showToast('Error al iniciar: ' + (error?.message || 'desconocido'), 'error');
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
      console.log('Tracking de ubicación iniciado');
    } catch (error) {
      this.locationReady = false;
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
    // Eventos del TripManager
    this.unsubscribers.push(
      tripManager.on('newPendingTrip', (trip) => {
        uiController.showIncomingModal(
          trip,
          () => this._handleAcceptTrip(trip.id),
          () => this._handleRejectTrip(trip.id)
        );
      })
    );

    this.unsubscribers.push(
      tripManager.on('tripAccepted', (trip) => {
        uiController.closeIncomingModal();
        uiController.showToast('Viaje aceptado', 'success');
        this._safePlaySound('success');
        this._showTripOnMap(trip);
        uiController.renderActiveTrip(trip);
      })
    );

    this.unsubscribers.push(
      tripManager.on('tripStarted', (trip) => {
        uiController.showToast('Viaje iniciado', 'success');
        this._safePlaySound('success');
        uiController.renderActiveTrip(trip);
      })
    );

    this.unsubscribers.push(
      tripManager.on('tripCompleted', () => {
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
        uiController.renderAvailableTrips(tripManager.availableTrips);
      })
    );

    this.unsubscribers.push(
      tripManager.on('tripsRefreshed', ({ available }) => {
        if (!tripManager.getCurrentTrip()) {
          uiController.renderAvailableTrips(available);
        }
        uiController.updateStats(tripManager.getStats());
      })
    );

    // Eventos de acciones de UI
    document.addEventListener('driverAction', (e) => {
      this._handleDriverAction(e.detail);
    });
  }

  _safePlaySound(name) {
    try {
      soundManager.play(name);
    } catch (e) {
      console.warn('No se pudo reproducir sonido:', e);
    }
  }

  async _handleDriverAction({ action, tripId }) {
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

  async _handleAcceptTrip(tripId) {
    const result = await tripManager.acceptTrip(tripId);
    if (!result.success) {
      uiController.showToast('Error al aceptar: ' + result.error, 'error');
    }
  }

  async _handleRejectTrip(tripId) {
    const result = await tripManager.rejectTrip(tripId);
    if (result.success) {
      uiController.closeIncomingModal();
      uiController.showToast('Viaje rechazado', 'warning');
    }
  }

  async _handleStartTrip(tripId) {
    const result = await tripManager.startTrip(tripId);
    if (!result.success) {
      uiController.showToast('Error al iniciar: ' + result.error, 'error');
    }
  }

  async _handleFinishTrip(tripId) {
    const notes = prompt('¿Alguna observación del viaje?') || '';
    const result = await tripManager.finishTrip(tripId, notes);
    if (!result.success) {
      uiController.showToast('Error al finalizar: ' + result.error, 'error');
    }
  }

  async _handleCancelTrip(tripId) {
    if (!confirm('¿Cancelar este viaje?')) return;

    const reason = prompt('Motivo de cancelación:') || '';
    const result = await tripManager.cancelTrip(tripId, reason);

    if (result.success) {
      uiController.showToast('Viaje cancelado', 'warning');

      if (this.mapReady) {
        try {
          mapService.clearTripMarkers();
        } catch (e) {
          console.warn('No se pudieron limpiar marcadores:', e);
        }
      }

      uiController.hideNavigation();
    } else {
      uiController.showToast('Error: ' + result.error, 'error');
    }
  }

  _openWhatsApp(tripId) {
    const trip = tripManager.getCurrentTrip();
    if (!trip) return;

    const phone = String(trip.telefono || '').replace(/\D/g, '');
    if (!phone) {
      uiController.showToast('No hay teléfono disponible', 'warning');
      return;
    }

    window.open(`https://wa.me/${phone}`, '_blank');
  }

  _onPositionUpdate(position) {
    // Actualizar marcador en el mapa solo si el mapa está disponible
    if (this.mapReady) {
      try {
        mapService.updateDriverPosition(position.lng, position.lat, position.heading);
      } catch (e) {
        console.warn('No se pudo actualizar posición en mapa:', e);
      }
    }

    // Si hay viaje en curso, actualizar distancia
    const currentTrip = tripManager.getCurrentTrip();
    if (
      currentTrip &&
      currentTrip.estado === CONFIG.ESTADOS.EN_CURSO &&
      this.mapReady &&
      typeof mapService.constructor.calculateDistance === 'function'
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
    if (!this.mapReady) return;

    if (trip.origen_lat && trip.destino_lat) {
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
    // Limpiar suscripciones
    this.unsubscribers.forEach(unsub => {
      try {
        unsub?.();
      } catch (e) {
        console.warn('Error liberando suscripción:', e);
      }
    });
    this.unsubscribers = [];

    // Detener servicios
    try { locationTracker.stop(); } catch (e) {}
    try { tripManager.destroy(); } catch (e) {}
    try { mapService.destroy(); } catch (e) {}
  }
}

// Inicializar cuando DOM esté listo
export default DriverApp;
