/**
 * Driver App producción (RLS + UUID)
 */

import CONFIG from './config.js';
import supabaseService from './supabase-client.js';
import mapService from './map-service.js';
import locationTracker from './location-tracker.js';
import tripManager from './trip-manager.js';
import uiController from './ui-controller.js';
import soundManager from './sound-manager.js';


class DriverApp {
  constructor() {
    this.initialized = false;
    this._onlineStatus = false;
    this._currentTripId = null;
    this._unsubscribers = [];

    // ✅ CONTROL PARA NO SPAMEAR SUPABASE
    this._lastLocationUpdate = 0;
    this._locationUpdateInterval = 8000; // cada 8 segundos
  }

  async init() {
    console.log('[DriverApp] Iniciando aplicación...');

    try {
      // 1) Inicializar Supabase
      console.log('[DriverApp] Inicializando Supabase...');
      const dbReady = await supabaseService.init();
      if (!dbReady) throw new Error('No se pudo conectar a Supabase');

      // 2) Verificar usuario logueado (RLS)
      const { data: { user } } = await supabaseService.client.auth.getUser();
      if (!user) {
        console.log('[DriverApp] No autenticado, redirigiendo a login');
        window.location.href = CONFIG.REDIRECTS.LOGIN;
        return;
      }

      // 3) Inicializar UI
      uiController.init();
      // 🔓 desbloqueo audio/haptics en primer toque real
window.addEventListener('click', () => {
  soundManager.enableOnUserInteraction();
}, { once: true });

window.addEventListener('touchstart', () => {
  soundManager.enableOnUserInteraction();
}, { once: true });


      // 4) Inicializar mapa + GPS
      console.log('[DriverApp] Inicializando servicios...');
      const results = await Promise.allSettled([
        mapService.init('map-container'),
        locationTracker.start(pos => this._onPositionUpdate(pos))
      ]);

      console.log('[DriverApp] Resultados inicialización:', {
        mapa: results[0].status,
        ubicacion: results[1].status
      });

      if (results[0].status === 'rejected') {
        console.error('[DriverApp] Error mapa:', results[0].reason);
      }

      if (results[1].status === 'rejected') {
        console.error('[DriverApp] Error GPS:', results[1].reason);
      }

      // 5) Inicializar TripManager
      console.log('[DriverApp] Inicializando TripManager...');
      await tripManager.init();

      // 6) Suscribirse a eventos
      this._subscribeToEvents();

      // 7) Configurar UI
      this._setupUI();

      this.initialized = true;
      console.log('[DriverApp] ✅ Aplicación inicializada correctamente');

      // Estado inicial
      uiController.updateDriverState('ONLINE', false);

      // Estado inicial de viajes
      const currentTrip = tripManager.getCurrentTrip();
      const pendingTrip = tripManager.getPendingTrip();

      if (currentTrip) {
        console.log('[DriverApp] Estado inicial: viaje activo');
        await this._showRouteOnMap(currentTrip);
        uiController.showNavigationState(currentTrip);
      } else if (pendingTrip) {
        console.log('[DriverApp] Estado inicial: oferta pendiente');
        uiController.showIncomingTrip(
          pendingTrip,
          () => this._acceptTrip(pendingTrip.id),
          () => this._rejectTrip(pendingTrip.id)
        );
      } else {
        console.log('[DriverApp] Estado inicial: esperando');
        uiController.showWaitingState();
      }

    } catch (error) {
      console.error('[DriverApp] ❌ Error fatal:', error);
      uiController.showToast('Error: ' + error.message, 'error', 5000);
    }
  }

  _subscribeToEvents() {
    console.log('[DriverApp] Suscribiendo a eventos de TripManager...');

    const unsubOffer = tripManager.on('newPendingTrip', (trip) => {
      console.log('[DriverApp] 📨 newPendingTrip', trip.id);

      uiController.showIncomingTrip(
        trip,
        () => this._acceptTrip(trip.id),
        () => this._rejectTrip(trip.id)
      );
    });

    const unsubAccepted = tripManager.on('tripAccepted', async (trip) => {
      console.log('[DriverApp] ✅ tripAccepted', trip.id);

      this._currentTripId = trip.id;
      uiController.hideIncomingModal();
      uiController.showToast('¡Viaje aceptado!', 'success');

      await this._showRouteOnMap(trip);
      uiController.showNavigationState(trip);
    });

    const unsubStarted = tripManager.on('tripStarted', (trip) => {
      console.log('[DriverApp] 🚀 tripStarted', trip.id);
      uiController.showToast('Viaje iniciado', 'success');
      uiController.showNavigationState(trip);
    });

    const unsubCompleted = tripManager.on('tripCompleted', (trip) => {
      console.log('[DriverApp] 🏁 tripCompleted', trip.id);

      this._currentTripId = null;
      mapService.clearRoute();
      uiController.hideNavigation();

      uiController.showToast(`Viaje completado +$${trip.precio}`, 'success', 5000);
      uiController.showWaitingState();
    });

    const unsubCancelled = tripManager.on('tripCancelled', () => {
      console.log('[DriverApp] ❌ tripCancelled');

      this._currentTripId = null;
      mapService.clearRoute();
      uiController.hideNavigation();

      uiController.showToast('Viaje cancelado', 'warning');
      uiController.showWaitingState();
    });

    const unsubCleared = tripManager.on('pendingTripCleared', ({ reason }) => {
      console.log('[DriverApp] 🧹 pendingTripCleared', reason);
      uiController.hideIncomingModal();
      uiController.showWaitingState();
    });

    const unsubNoPending = tripManager.on('noPendingTrips', () => {
      console.log('[DriverApp] noPendingTrips');
      uiController.showWaitingState();
    });

    this._unsubscribers.push(
      unsubOffer,
      unsubAccepted,
      unsubStarted,
      unsubCompleted,
      unsubCancelled,
      unsubCleared,
      unsubNoPending
    );
  }
  async _showRouteOnMap(trip) {
    console.log('[DriverApp] Mostrando ruta en mapa...');

    try {
      if (!trip.origen_lat || !trip.origen_lng || !trip.destino_lat || !trip.destino_lng) {
        console.warn('[DriverApp] Viaje sin coordenadas, no se puede trazar ruta');
        return;
      }

      const origin = { lat: trip.origen_lat, lng: trip.origen_lng };
      const destination = { lat: trip.destino_lat, lng: trip.destino_lng };

      await mapService.showRealRoute(origin, destination);

    } catch (error) {
      console.error('[DriverApp] Error mostrando ruta:', error);
    }
  }

  async _acceptTrip(tripId) {
    console.log('[DriverApp] Aceptando viaje:', tripId);
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
    console.log('[DriverApp] Rechazando viaje:', tripId);
    await tripManager.rejectTrip(tripId);
    uiController.showWaitingState();
  }

  // ✅ GUARDAR UBICACIÓN + ACTUALIZAR MAPA + DETECTAR LLEGADA
  async _onPositionUpdate(position) {
    mapService.updateDriverPosition(position.lng, position.lat, position.heading);

    // ------------------------------------------------------
    // ✅ Guardar ubicación en Supabase (cada X segundos)
    // ------------------------------------------------------
    const now = Date.now();
    if (now - this._lastLocationUpdate >= this._locationUpdateInterval) {
      this._lastLocationUpdate = now;

      try {
        const { data: { user } } = await supabaseService.client.auth.getUser();
        if (!user) return;

        const { error } = await supabaseService.client
          .from('choferes')
          .update({
            lat: position.lat,
            lng: position.lng,
            heading: position.heading || 0,
            speed: position.speed || 0,
            accuracy: position.accuracy || null,
            last_seen_at: new Date().toISOString()
          })
          .eq('user_id', user.id);

        if (error) {
          console.error('[DriverApp] ❌ Error guardando ubicación:', error);
        } else {
          console.log('[DriverApp] ✅ Ubicación guardada en Supabase');
        }

      } catch (err) {
        console.error('[DriverApp] ❌ Falló update ubicación:', err);
      }
    }

    // ------------------------------------------------------
    // Detectar llegada si hay viaje en curso
    // ------------------------------------------------------
    const currentTrip = tripManager.getCurrentTrip();
    if (currentTrip?.estado === 'EN_CURSO') {
      const dist = this._calculateDistance(
        position.lat, position.lng,
        currentTrip.destino_lat, currentTrip.destino_lng
      );

      if (dist < 100) {
        uiController.showArrival();
      }
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
    // BOTÓN REAL (tu HTML usa fab-online)
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

        } catch (err) {
          console.error('[DriverApp] Error cambiando estado:', err);
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
    console.log('[DriverApp] Acción:', action, tripId);

    switch (action) {
      case 'accept': return this._acceptTrip(tripId);
      case 'reject': return this._rejectTrip(tripId);
      case 'start': return tripManager.startTrip(tripId);
      case 'finish': return tripManager.finishTrip(tripId);
      case 'cancel': return tripManager.cancelTrip(tripId);
      case 'navigate': return this._openExternalNav();
      case 'whatsapp': return this._openWhatsApp();
      default:
        console.warn('[DriverApp] Acción desconocida:', action);
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
