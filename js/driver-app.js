/**
 * MIMI Driver App - Orquestador principal
 * Inicializa todos los servicios y coordina la lógica
 */

import CONFIG from './config.js';
import supabaseService from './supabase-client.js';
import mapService from './map-service.js';
import locationTracker from './location-tracker.js';
import tripManager from './trip-manager.js';
import soundManager from './sound-manager.js';
import uiController from './ui-controller.js';

class DriverApp {
  constructor() {
    this.initialized = false;
    this.unsubscribers = [];
  }

  async init() {
    try {
      // 1. Verificar autenticación
      if (!supabaseService.isAuthenticated()) {
        window.location.href = CONFIG.REDIRECTS.LOGIN;
        return;
      }

      // 2. Inicializar Supabase
      const dbReady = await supabaseService.init();
      if (!dbReady) {
        throw new Error('No se pudo conectar a la base de datos');
      }

      // 3. Inicializar UI
      uiController.init();

      // 4. Inicializar mapa
      await mapService.init('mainMap');

      // 5. Inicializar tracking de ubicación
      await locationTracker.start((position) => {
        this._onPositionUpdate(position);
      });

      // 6. Inicializar gestión de viajes
      await tripManager.init();

      // 7. Suscribirse a eventos
      this._subscribeToEvents();

      // 8. Activar audio en primera interacción
      document.body.addEventListener('click', () => {
        soundManager.enableOnUserInteraction();
      }, { once: true });

      this.initialized = true;
      uiController.showToast('Panel listo', 'success');

    } catch (error) {
      console.error('App initialization failed:', error);
      uiController.showToast('Error al iniciar: ' + error.message, 'error');
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
        soundManager.play('success');
        this._showTripOnMap(trip);
        uiController.renderActiveTrip(trip);
      })
    );

    this.unsubscribers.push(
      tripManager.on('tripStarted', (trip) => {
        uiController.showToast('Viaje iniciado', 'success');
        soundManager.play('success');
        uiController.renderActiveTrip(trip);
      })
    );

    this.unsubscribers.push(
      tripManager.on('tripCompleted', () => {
        uiController.showToast('Viaje completado', 'success');
        soundManager.play('success');
        mapService.clearTripMarkers();
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
      mapService.clearTripMarkers();
      uiController.hideNavigation();
    } else {
      uiController.showToast('Error: ' + result.error, 'error');
    }
  }

  _openWhatsApp(tripId) {
    const trip = tripManager.getCurrentTrip();
    if (!trip) return;
    
    const phone = String(trip.telefono).replace(/\D/g, '');
    window.open(`https://wa.me/${phone}`, '_blank');
  }

  _onPositionUpdate(position) {
    // Actualizar marcador en el mapa
    mapService.updateDriverPosition(position.lng, position.lat, position.heading);

    // Si hay viaje en curso, actualizar distancia
    const currentTrip = tripManager.getCurrentTrip();
    if (currentTrip && currentTrip.estado === CONFIG.ESTADOS.EN_CURSO) {
      const distance = mapService.constructor.calculateDistance(
        position.lat,
        position.lng,
        currentTrip.destino_lat,
        currentTrip.destino_lng
      );
      uiController.updateNavigationDistance(distance);
    }
  }

  _showTripOnMap(trip) {
    if (trip.origen_lat && trip.destino_lat) {
      mapService.showTripRoute(
        { lat: trip.origen_lat, lng: trip.origen_lng },
        { lat: trip.destino_lat, lng: trip.destino_lng }
      );
    }
  }

  destroy() {
    // Limpiar suscripciones
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];

    // Detener servicios
    locationTracker.stop();
    tripManager.destroy();
    mapService.destroy();
  }
}

// Inicializar cuando DOM esté listo
document.export default DriverApp;
