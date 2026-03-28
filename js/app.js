/**
 * Driver App producción (RLS + UUID + robusto)
 */

import CONFIG from './config.js';
import supabaseService from './supabase-client.js';
import mapService from './map-service.js';
import locationTracker from './location-tracker.js';
import tripManager from './trip-manager.js';
import uiController from './ui-controller.js';

class DriverApp {
  constructor() {
    this.initialized = false;
    this._onlineStatus = false;
    this._currentTripId = null;
    this._unsubscribers = [];
  }

  async init() {
    try {
      // 1) Inicializar Supabase
      const dbReady = await supabaseService.init();
      if (!dbReady) throw new Error('No se pudo conectar a Supabase');

      // 2) Verificar usuario logueado (RLS necesita auth)
      const { data: { user } } = await supabaseService.client.auth.getUser();
      if (!user) {
        window.location.href = CONFIG.REDIRECTS.LOGIN;
        return;
      }

      // 3) UI
      uiController.init();

      // 4) Map + Location
      await Promise.allSettled([
        mapService.init('map-container'),
        locationTracker.start(pos => this._onPositionUpdate(pos))
      ]);

      // 5) Trip Manager
      await tripManager.init();

      // 6) Subscripciones
      this._subscribeToEvents();

      // 7) Setup UI actions
      this._setupUI();

      this.initialized = true;

      // Estado inicial
      uiController.updateDriverState('ONLINE', false);

      const currentTrip = tripManager.getCurrentTrip();
      const pendingTrip = tripManager.getPendingTrip();

      if (currentTrip) {
        await this._showRouteOnMap(currentTrip);
        uiController.showNavigationState(currentTrip);
      } else if (pendingTrip) {
        uiController.showIncomingTrip(
          pendingTrip,
          () => this._acceptTrip(pendingTrip.id),
          () => this._rejectTrip(pendingTrip.id)
        );
      } else {
        uiController.showWaitingState();
      }

    } catch (error) {
      console.error('[DriverApp] Error fatal:', error);
      uiController.showToast('Error: ' + error.message, 'error', 5000);
    }
  }

  _subscribeToEvents() {
    const unsubOffer = tripManager.on('newPendingTrip', (trip) => {
      uiController.showIncomingTrip(
        trip,
        () => this._acceptTrip(trip.id),
        () => this._rejectTrip(trip.id)
      );
    });

    const unsubAccepted = tripManager.on('tripAccepted', async (trip) => {
      this._currentTripId = trip.id;
      uiController.hideIncomingModal();
      uiController.showToast('¡Viaje aceptado!', 'success');
      await this._showRouteOnMap(trip);
      uiController.showNavigationState(trip);
    });

    const unsubStarted = tripManager.on('tripStarted', (trip) => {
      uiController.showToast('Viaje iniciado', 'success');
      uiController.showNavigationState(trip);
    });

    const unsubCompleted = tripManager.on('tripCompleted', (trip) => {
      this._currentTripId = null;
      mapService.clearRoute();
      uiController.hideNavigation();
      uiController.showToast(`Viaje completado +$${trip.precio}`, 'success', 5000);
      uiController.showWaitingState();
    });

    const unsubCancelled = tripManager.on('tripCancelled', () => {
      this._currentTripId = null;
      mapService.clearRoute();
      uiController.hideNavigation();
      uiController.showToast('Viaje cancelado', 'warning');
      uiController.showWaitingState();
    });

    const unsubCleared = tripManager.on('pendingTripCleared', () => {
      uiController.hideIncomingModal();
      uiController.showWaitingState();
    });

    const unsubNoPending = tripManager.on('noPendingTrips', () => {
      uiController.showWaitingState();
    });

    this._unsubscribers.push(
      unsubOffer, unsubAccepted, unsubStarted,
      unsubCompleted, unsubCancelled, unsubCleared, unsubNoPending
    );
  }

  async _showRouteOnMap(trip) {
    try {
      const origin = { lat: trip.origen_lat, lng: trip.origen_lng };
      const destination = { lat: trip.destino_lat, lng: trip.destino_lng };
      await mapService.showRealRoute(origin, destination);
    } catch (error) {
      console.error('[DriverApp] Error mostrando ruta:', error);
    }
  }

  async _acceptTrip(tripId) {
    uiController.setGlobalLoading(true, 'Aceptando viaje...');
    try {
      const result = await tripManager.acceptTrip(tripId);
      if (!result.success) {
        uiController.showToast(result.error || 'Error aceptando viaje', 'error');
        uiController.hideIncomingModal();
        uiController.showWaitingState();
      }
    } finally {
      uiController.setGlobalLoading(false);
    }
  }

  async _rejectTrip(tripId) {
    await tripManager.rejectTrip(tripId);
    uiController.showWaitingState();
  }

  _onPositionUpdate(position) {
    mapService.updateDriverPosition(position.lng, position.lat, position.heading);

    const currentTrip = tripManager.getCurrentTrip();
    if (currentTrip?.estado === 'EN_CURSO') {
      const dist = this._calculateDistance(
        position.lat, position.lng,
        currentTrip.destino_lat, currentTrip.destino_lng
      );

      if (dist < 100) uiController.showArrival();
    }
  }

  _calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) ** 2 +
      Math.cos(φ1) * Math.cos(φ2) *
      Math.sin(Δλ / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  _setupUI() {
    const btnFab = document.getElementById('fab-online');

    if (btnFab) {
      btnFab.addEventListener('click', async () => {
        try {
          this._onlineStatus = !this._onlineStatus;

          const { data: { user } } = await supabaseService.client.auth.getUser();
          if (!user) {
            uiController.showToast("No autenticado", "error");
            return;
          }

          const { error } = await supabaseService.client
            .from('choferes')
            .update({
              disponible: this._onlineStatus,
              online: this._onlineStatus,
              last_seen_at: new Date().toISOString()
            })
            .eq('user_id', user.id);

          if (error) {
            console.error('[DriverApp] Error update chofer:', error);
            uiController.showToast("No se pudo actualizar estado", "error");
            return;
          }

          uiController.updateDriverState('ONLINE', this._onlineStatus);
          uiController.showToast(this._onlineStatus ? '🟢 Online' : '🔴 Offline', 'success');

        } catch (e) {
          console.error('[DriverApp] Error botón online:', e);
          uiController.showToast("Error cambiando estado", "error");
        }
      });
    }

    document.addEventListener('driverAction', (e) => {
      const { action, tripId } = e.detail;
      this._handleAction(action, tripId);
    });
  }

  async _handleAction(action, tripId) {
    switch (action) {
      case 'accept': return this._acceptTrip(tripId);
      case 'reject': return this._rejectTrip(tripId);
      case 'start': return tripManager.startTrip(tripId);
      case 'finish': return tripManager.finishTrip(tripId);
      case 'cancel': return tripManager.cancelTrip(tripId);
      case 'navigate': return this._openExternalNav();
      case 'whatsapp': return this._openWhatsApp();
    }
  }

  _openExternalNav() {
    const trip = tripManager.getCurrentTrip();
    if (!trip) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${trip.destino_lat},${trip.destino_lng}`;
    window.open(url, '_blank');
  }

  _openWhatsApp() {
    const trip = tripManager.getCurrentTrip();
    if (!trip?.telefono) return;
    const msg = encodeURIComponent('Hola, soy tu conductor de MIMI 🚐');
    window.open(`https://wa.me/${trip.telefono}?text=${msg}`, '_blank');
  }
}

const app = new DriverApp();
app.init();

export default DriverApp;
