/**
 * MIMI Driver App - Experiencia Uber Driver
 * Mapa siempre visible, flujo de pantallas limpio
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
    this.initialized = false;
    this.unsubscribers = [];
    this._onlineStatus = false;
    this._currentTripId = null;
    this._routeRefreshInterval = null;
  }

  async init() {
    try {
      if (!supabaseService.isAuthenticated()) {
        window.location.href = CONFIG.REDIRECTS.LOGIN;
        return;
      }

      const dbReady = await supabaseService.init();
      if (!dbReady) throw new Error('No se pudo conectar a la base de datos');

      uiController.init();
      uiController.showToast('Iniciando...', 'info');

      // Inicializar servicios
      await Promise.all([
        mapService.init('mainMap'),
        locationTracker.start(pos => this._onPositionUpdate(pos))
      ]);

      await tripManager.init();
      this._subscribeToEvents();
      this._bindUI();

      this.initialized = true;
      uiController.updateDriverState('ONLINE', false);
      uiController.showWaitingState();

    } catch (error) {
      console.error('Init error:', error);
      uiController.showToast('Error al iniciar: ' + error.message, 'error');
    }
  }

  _subscribeToEvents() {
    // Nueva oferta de viaje
    this.unsubscribers.push(
      tripManager.on('newPendingTrip', (trip) => {
        uiController.showIncomingTrip(
          trip,
          () => this._acceptTrip(trip.id),
          () => this._rejectTrip(trip.id)
        );
      })
    );

    // Viaje aceptado
    this.unsubscribers.push(
      tripManager.on('tripAccepted', async (trip) => {
        this._currentTripId = trip.id;
        uiController.hideIncomingModal();
        uiController.showToast('Viaje aceptado', 'success');
        
        // Mostrar ruta REAL en el mapa
        await this._showRouteOnMap(trip);
        
        // Cambiar a modo navegación
        uiController.showNavigationState(trip);
        
        // Iniciar actualización de ruta periódica
        this._startRouteRefresh(trip);
      })
    );

    // Viaje iniciado
    this.unsubscribers.push(
      tripManager.on('tripStarted', (trip) => {
        uiController.showToast('Viaje iniciado', 'success');
        uiController.showNavigationState(trip);
      })
    );

    // Viaje completado
    this.unsubscribers.push(
      tripManager.on('tripCompleted', (trip) => {
        this._currentTripId = null;
        this._stopRouteRefresh();
        mapService.clearRoute();
        uiController.hideNavigation();
        uiController.showToast(`Viaje completado +$${trip.precio}`, 'success');
        uiController.showWaitingState();
      })
    );

    // Viaje cancelado
    this.unsubscribers.push(
      tripManager.on('tripCancelled', () => {
        this._currentTripId = null;
        this._stopRouteRefresh();
        mapService.clearRoute();
        uiController.hideNavigation();
        uiController.showToast('Viaje cancelado', 'warning');
        uiController.showWaitingState();
      })
    );
  }

  async _showRouteOnMap(trip) {
    // Determinar origen y destino según el estado
    const isEnCurso = trip.estado === 'EN_CURSO';
    
    const origin = {
      lat: trip.origen_lat,
      lng: trip.origen_lng
    };
    
    const destination = {
      lat: trip.destino_lat,
      lng: trip.destino_lng
    };

    // Mostrar ruta REAL usando OSRM
    const route = await mapService.showRealRoute(origin, destination);
    
    if (route && route.instructions) {
      // Actualizar instrucciones de navegación
      this._updateNavigationInstructions(route);
    }
  }

  _startRouteRefresh(trip) {
    // Recalcular ruta periódicamente (cada 10 segundos)
    this._routeRefreshInterval = setInterval(async () => {
      if (trip.estado === 'EN_CURSO') {
        await this._showRouteOnMap(trip);
      }
    }, CONFIG.ROUTE_REFRESH_INTERVAL);
  }

  _stopRouteRefresh() {
    if (this._routeRefreshInterval) {
      clearInterval(this._routeRefreshInterval);
      this._routeRefreshInterval = null;
    }
  }

  _updateNavigationInstructions(route) {
    // Actualizar UI con instrucciones de OSRM
    const currentPos = locationTracker.getLastPosition();
    if (!currentPos) return;

    const instruction = routingService.getCurrentInstruction(
      [currentPos.lng, currentPos.lat]
    );

    if (instruction) {
      uiController.updateNavigationDisplay({
        text: instruction.current?.text,
        distance: instruction.current?.distance,
        type: instruction.current?.type,
        next: instruction.next
      });
    }
  }

  async _acceptTrip(tripId) {
    uiController.setGlobalLoading(true, 'Aceptando viaje...');
    try {
      const result = await tripManager.acceptTrip(tripId);
      if (!result.success) {
        uiController.showToast(result.error || 'No se pudo aceptar', 'error');
      }
    } finally {
      uiController.setGlobalLoading(false);
    }
  }

  async _rejectTrip(tripId) {
    try {
      await tripManager.rejectTrip(tripId);
      uiController.hideIncomingModal();
      uiController.showWaitingState();
    } catch (e) {
      console.error('Error rechazando:', e);
    }
  }

  _onPositionUpdate(position) {
    // Actualizar marcador del conductor
    mapService.updateDriverPosition(position.lng, position.lat, position.heading);

    // Si hay viaje en curso, actualizar navegación
    const currentTrip = tripManager.getCurrentTrip();
    if (currentTrip?.estado === CONFIG.ESTADOS.EN_CURSO) {
      this._checkArrival(position, currentTrip);
      this._updateNavigationInstructions(routingService.currentRoute);
    }
  }

  _checkArrival(position, trip) {
    const distance = this._calculateDistance(
      position.lat, position.lng,
      trip.destino_lat, trip.destino_lng
    );

    // Mostrar panel de llegada si está cerca
    if (distance < 100) {
      uiController.showArrival();
    }
  }

  _calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }

  _bindUI() {
    // Botón de disponibilidad
    document.getElementById('btnToggleDisponibilidad')?.addEventListener('click', async () => {
      const driverId = supabaseService.getCurrentDriverId();
      this._onlineStatus = !this._onlineStatus;
      
      await supabaseService.setDriverAvailability(driverId, this._onlineStatus);
      uiController.updateDriverState('ONLINE', this._onlineStatus);
      uiController.showToast(this._onlineStatus ? 'Online' : 'Offline', 'success');
    });

    // Escuchar acciones de UI
    document.addEventListener('driverAction', (e) => {
      this._handleAction(e.detail.action, e.detail.tripId);
    });
  }

  async _handleAction(action, tripId) {
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
        await tripManager.cancelTrip(tripId, 'Cancelado por conductor');
        break;
      case 'navigate':
        this._openExternalNav(tripId);
        break;
      case 'whatsapp':
        this._openWhatsApp(tripId);
        break;
    }
  }

  _openExternalNav(tripId) {
    const trip = tripManager.getCurrentTrip();
    if (!trip) return;
    
    const url = `https://www.google.com/maps/dir/?api=1&destination=${trip.destino_lat},${trip.destino_lng}`;
    window.open(url, '_blank');
  }

  _openWhatsApp(tripId) {
    const trip = tripManager.getCurrentTrip();
    if (!trip?.telefono) return;
    
    const msg = encodeURIComponent('Hola, soy tu conductor de MIMI. Ya estoy en camino 🚐');
    window.open(`https://wa.me/${trip.telefono}?text=${msg}`, '_blank');
  }
}

export default DriverApp;
