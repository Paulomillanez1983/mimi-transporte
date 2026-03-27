/**
 * Driver App con manejo completo de errores y flujo de UI corregido
 */

import CONFIG from './config.js';
import supabaseService from './supabase-client.js';
import mapService from './map-service.js';
import locationTracker from './location-tracker.js';
import tripManager from './trip-manager.js';
import uiController from './ui-controller.js';
import routingService from './routing-service.js';

class DriverApp {
  constructor() {
    console.log('[DriverApp] Constructor');
    this.initialized = false;
    this._onlineStatus = false;
    this._currentTripId = null;
    this._unsubscribers = [];
  }

  async init() {
    console.log('[DriverApp] Iniciando aplicación...');

    try {
      // 1. Verificar autenticación
      if (!supabaseService.isAuthenticated()) {
        console.log('[DriverApp] No autenticado, redirigiendo a login');
        window.location.href = CONFIG.REDIRECTS.LOGIN;
        return;
      }

      // 2. Inicializar Supabase
      console.log('[DriverApp] Inicializando Supabase...');
      const dbReady = await supabaseService.init();
      if (!dbReady) {
        throw new Error('No se pudo conectar a la base de datos');
      }

      // 3. Inicializar UI
      uiController.init();

      // 4. Inicializar servicios en paralelo
      console.log('[DriverApp] Inicializando servicios...');
      
      const results = await Promise.allSettled([
        mapService.init('mainMap'),
        locationTracker.start(pos => this._onPositionUpdate(pos))
      ]);

      console.log('[DriverApp] Resultados inicialización:', {
        mapa: results[0].status,
        ubicacion: results[1].status
      });

      if (results[0].status === 'rejected') {
        console.error('[DriverApp] Error mapa:', results[0].reason);
      }

      // 5. Inicializar TripManager (CRÍTICO)
      console.log('[DriverApp] Inicializando TripManager...');
      await tripManager.init();

      // 6. Suscribirse a eventos
      this._subscribeToEvents();

      // 7. Configurar UI
      this._setupUI();

      this.initialized = true;
      console.log('[DriverApp] ✅ Aplicación inicializada correctamente');

      // Mostrar estado inicial
      uiController.updateDriverState('ONLINE', false);
      
      // Verificar estado actual para mostrar UI correcta
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

    // Evento: Nueva oferta de viaje
    const unsubOffer = tripManager.on('newPendingTrip', (trip) => {
      console.log('[DriverApp] 📨 Evento: newPendingTrip', trip.id);
      
      // Mostrar modal de solicitud entrante
      uiController.showIncomingTrip(
        trip,
        () => this._acceptTrip(trip.id),
        () => this._rejectTrip(trip.id)
      );
    });

    // Evento: Viaje aceptado
    const unsubAccepted = tripManager.on('tripAccepted', async (trip) => {
      console.log('[DriverApp] ✅ Evento: tripAccepted', trip.id);
      this._currentTripId = trip.id;
      
      uiController.hideIncomingModal();
      uiController.showToast('¡Viaje aceptado!', 'success');
      
      // Mostrar ruta en mapa
      await this._showRouteOnMap(trip);
      
      // Cambiar a modo navegación
      uiController.showNavigationState(trip);
    });

    // Evento: Viaje iniciado
    const unsubStarted = tripManager.on('tripStarted', (trip) => {
      console.log('[DriverApp] 🚀 Evento: tripStarted');
      uiController.showToast('Viaje iniciado', 'success');
      uiController.showNavigationState(trip);
    });

    // Evento: Viaje completado
    const unsubCompleted = tripManager.on('tripCompleted', (trip) => {
      console.log('[DriverApp] 🏁 Evento: tripCompleted');
      this._currentTripId = null;
      
      mapService.clearRoute();
      uiController.hideNavigation();
      uiController.showToast(`Viaje completado +$${trip.precio}`, 'success', 5000);
      uiController.showWaitingState();
    });

    // Evento: Viaje cancelado
    const unsubCancelled = tripManager.on('tripCancelled', () => {
      console.log('[DriverApp] ❌ Evento: tripCancelled');
      this._currentTripId = null;
      
      mapService.clearRoute();
      uiController.hideNavigation();
      uiController.showToast('Viaje cancelado', 'warning');
      uiController.showWaitingState();
    });

    // Evento: Oferta limpiada
    const unsubCleared = tripManager.on('pendingTripCleared', ({ reason }) => {
      console.log('[DriverApp] 🧹 Evento: pendingTripCleared', reason);
      uiController.hideIncomingModal();
    });

    // Evento: Sin ofertas (estado inicial)
    const unsubNoPending = tripManager.on('noPendingTrips', () => {
      console.log('[DriverApp] Evento: noPendingTrips');
      uiController.showWaitingState();
    });

    this._unsubscribers.push(
      unsubOffer, unsubAccepted, unsubStarted, 
      unsubCompleted, unsubCancelled, unsubCleared, unsubNoPending
    );
  }

  async _showRouteOnMap(trip) {
    console.log('[DriverApp] Mostrando ruta en mapa...');
    
    try {
      const origin = { 
        lat: trip.origen_lat, 
        lng: trip.origen_lng 
      };
      const destination = { 
        lat: trip.destino_lat, 
        lng: trip.destino_lng 
      };

      const route = await mapService.showRealRoute(origin, destination);
      
      if (route) {
        console.log('[DriverApp] Ruta mostrada correctamente');
        
        // Actualizar instrucciones de navegación
        if (route.instructions?.length > 0) {
          uiController.updateNavigationDisplay({
            text: route.instructions[0].text,
            distance: route.instructions[0].distance,
            type: route.instructions[0].type
          });
        }
      } else {
        console.warn('[DriverApp] No se pudo obtener ruta');
      }
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
        console.error('[DriverApp] Error aceptando:', result.error);
        uiController.showToast(result.error, 'error');
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

  _onPositionUpdate(position) {
    // Actualizar marcador en mapa
    mapService.updateDriverPosition(position.lng, position.lat, position.heading);
    
    // Verificar llegada si hay viaje en curso
    const currentTrip = tripManager.getCurrentTrip();
    if (currentTrip?.estado === 'EN_CURSO') {
      const dist = this._calculateDistance(
        position.lat, position.lng,
        currentTrip.destino_lat, currentTrip.destino_lng
      );
      
      if (dist < 100) { // 100 metros
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

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }

  _setupUI() {
    // Botón de disponibilidad
    const btnDisp = document.getElementById('btnToggleDisponibilidad');
    if (btnDisp) {
      btnDisp.addEventListener('click', async () => {
        this._onlineStatus = !this._onlineStatus;
        const driverId = supabaseService.getCurrentDriverId();
        
        await supabaseService.client
          .from('choferes')
          .update({ 
            disponible: this._onlineStatus,
            online: this._onlineStatus,
            last_seen_at: new Date().toISOString()
          })
          .eq('id', driverId);
        
        uiController.updateDriverState('ONLINE', this._onlineStatus);
        uiController.showToast(this._onlineStatus ? '🟢 Online' : '🔴 Offline', 'success');
      });
    }

    // Delegación de eventos de acción
    document.addEventListener('driverAction', (e) => {
      const { action, tripId } = e.detail;
      this._handleAction(action, tripId);
    });
  }

  async _handleAction(action, tripId) {
    console.log('[DriverApp] Acción:', action, tripId);
    
    switch (action) {
      case 'accept':
        await this._acceptTrip(tripId);
        break;
      case 'reject':
        await this._rejectTrip(tripId);
        break;
      case 'start':
        await tripManager.startTrip(tripId);
        break;
      case 'finish':
        await tripManager.finishTrip(tripId);
        break;
      case 'cancel':
        await tripManager.cancelTrip(tripId);
        break;
      case 'navigate':
        this._openExternalNav();
        break;
      case 'whatsapp':
        this._openWhatsApp();
        break;
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

export default DriverApp;
