/**
 * Driver App producción (RLS + UUID + FLOW)
 */

import CONFIG from './config.js';
import supabaseService from './supabase-client.js';
import mapService from './map-service.js';
import locationTracker from './location-tracker.js';
import tripManager from './trip-manager.js';
import uiController from './ui-controller.js';
import soundManager from './sound-manager.js';
import { initPushFCM } from './push-fcm.js';

class DriverApp {
  constructor() {
    this.initialized = false;
    this._onlineStatus = false;
    this._currentTripId = null;
    this._unsubscribers = [];

    // ✅ CONTROL PARA NO SPAMEAR SUPABASE
    this._lastLocationUpdate = 0;
    this._locationUpdateInterval = 15000; // cada 15 segundos

    // ✅ cache auth para no llamar getUser() todo el tiempo
    this._authUserId = null;

    // ✅ flujo del chofer tipo Uber
    this._driverFlowState = 'OFFLINE';
  }

  // =========================================================
  // FLOW STATE
  // =========================================================
  _setFlowState(nextState) {
    if (this._driverFlowState === nextState) return;

    const prevState = this._driverFlowState;
    this._driverFlowState = nextState; 
    window.driverFlowState = nextState;

    console.log('[DriverApp] FLOW:', prevState, '->', nextState);

    window.dispatchEvent(
      new CustomEvent('driverFlowStateChanged', {
        detail: {
          from: prevState,
          to: nextState,
          state: nextState
        }
      })
    );
  }

  // =========================================================
  // INIT
  // =========================================================
  async init() {
    console.log('[DriverApp] Iniciando aplicación...');

    try {
      // 1) Inicializar Supabase
      console.log('[DriverApp] Inicializando Supabase...');
      const dbReady = await supabaseService.init();
      if (!dbReady) throw new Error('No se pudo conectar a Supabase');

      // 2) Verificar usuario logueado (RLS)
      const {
        data: { user }
      } = await supabaseService.client.auth.getUser();

      if (!user) {
        console.log('[DriverApp] No autenticado, redirigiendo a login');
        window.location.href = CONFIG.REDIRECTS.LOGIN;
        return;
      }

      this._authUserId = user.id;
      await initPushFCM('chofer');
      console.log('[DriverApp] Auth user detectado:', this._authUserId);

      // 3) Inicializar UI
      uiController.init();

      // 🔓 desbloqueo audio/haptics en primer toque real
      window.addEventListener(
        'click',
        () => {
          soundManager.enableOnUserInteraction?.();
        },
        { once: true }
      );

      window.addEventListener(
        'touchstart',
        () => {
          soundManager.enableOnUserInteraction?.();
        },
        { once: true }
      );

      // 4) Inicializar mapa + GPS
      console.log('[DriverApp] Inicializando servicios...');
      const results = await Promise.allSettled([
        mapService.init('map-container'),
        locationTracker.start((pos) => this._onPositionUpdate(pos))
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

      // 5) Resolver driverId real antes de TripManager
      console.log('[DriverApp] Resolviendo driverId...');
      const driverId = await this._resolveDriverId();

      console.log('[DriverApp] driverId detectado:', driverId);

      // 6) Inicializar TripManager
      console.log('[DriverApp] Inicializando TripManager...');
      const tripManagerReady = await tripManager.init(driverId);

      if (!tripManagerReady) {
        console.warn('[DriverApp] ⚠️ TripManager no pudo inicializarse (sin driverId)');
        uiController.showToast('No se pudo cargar el perfil del chofer', 'warning', 5000);
      }

      // 7) Suscribirse a eventos
      this._subscribeToEvents();

      // 8) Configurar UI
      this._setupUI();

      this.initialized = true;
      console.log('[DriverApp] ✅ Aplicación inicializada correctamente');

      if (!tripManagerReady) {
        console.warn('[DriverApp] App iniciada sin TripManager operativo');
        this._onlineStatus = false;
        uiController.updateDriverState('OFFLINE', false);
        this._setFlowState('OFFLINE');
        uiController.showWaitingState();
        return;
      }

      // Estado inicial real del chofer desde BD
      try {
        const { data: choferRow, error: choferError } = await supabaseService.client
          .from('choferes')
          .select('online, disponible')
          .eq('user_id', this._authUserId)
          .maybeSingle();

        if (choferError) {
          console.warn('[DriverApp] No se pudo leer estado inicial del chofer:', choferError);
        }

        this._onlineStatus = !!choferRow?.online;
      } catch (e) {
        console.warn('[DriverApp] Error leyendo estado inicial online:', e);
        this._onlineStatus = false;
      }

      uiController.updateDriverState(
        this._onlineStatus ? 'ONLINE' : 'OFFLINE',
        this._onlineStatus
      );

      if (!this._onlineStatus) {
        this._setFlowState('OFFLINE');
      }

      // Estado inicial de viajes
      const currentTrip = tripManager.getCurrentTrip();
      const pendingTrip = tripManager.getPendingTrip();
      if (currentTrip) {
        console.log('[DriverApp] Estado inicial: viaje activo');
        this._currentTripId = currentTrip.id;

        if (String(currentTrip.estado || '').toUpperCase() === 'EN_CURSO') {
          this._setFlowState('TRIP_STARTED');
        } else {
          this._setFlowState('GOING_TO_PICKUP');
        }

        await this._showRouteOnMap(currentTrip);
        uiController.showNavigationState(currentTrip);
      } else if (pendingTrip) {
        console.log('[DriverApp] Estado inicial: oferta pendiente');
        this._setFlowState('RECEIVING_OFFER');

        uiController.showIncomingTrip(
          pendingTrip,
          () => this._acceptOffer(pendingTrip.offerId),
          () => this._rejectOffer(pendingTrip.offerId)
        );
      } else {
  console.log('[DriverApp] Estado inicial: esperando');

  if (this._onlineStatus) {
    this._setFlowState('ONLINE_IDLE');
  } else {
    this._setFlowState('OFFLINE');
  }

  uiController.showWaitingState();
}
    } catch (error) {
      console.error('[DriverApp] ❌ Error fatal:', error);
      uiController.showToast('Error: ' + error.message, 'error', 5000);
    }
  }

  // =========================================================
  // RESOLVER DRIVER ID (ROBUSTO)
  // =========================================================
  async _resolveDriverId() {
    try {
      const cachedDriverId =
        localStorage.getItem('driverId') || sessionStorage.getItem('driverId') || null;

      if (cachedDriverId) {
        console.log('[DriverApp] driverId desde cache:', cachedDriverId);
        return cachedDriverId;
      }

      const userId = this._authUserId;

      if (!userId) {
        console.warn('[DriverApp] No user.id disponible para resolver chofer');
        return null;
      }

      const { data: chofer, error } = await supabaseService.client
        .from('choferes')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('[DriverApp] Error resolviendo chofer:', error);
        return null;
      }

      if (!chofer) {
        console.warn('[DriverApp] No existe fila en choferes para user_id:', userId);
        return null;
      }

      console.log('[DriverApp] Registro chofer encontrado:', chofer);

      const possibleDriverId =
        chofer.id_uuid ||
        chofer.chofer_id_uuid ||
        chofer.id ||
        chofer.uuid ||
        chofer.driver_id ||
        chofer.chofer_uuid ||
        null;

      if (!possibleDriverId) {
        console.warn('[DriverApp] No se encontró un campo UUID usable en choferes:', chofer);
        return null;
      }

      localStorage.setItem('driverId', possibleDriverId);
      sessionStorage.setItem('driverId', possibleDriverId);

      return possibleDriverId;
    } catch (err) {
      console.error('[DriverApp] Error buscando driverId:', err);
      return null;
    }
  }

  // =========================================================
  // EVENTS
  // =========================================================
  _subscribeToEvents() {
    console.log('[DriverApp] Suscribiendo a eventos de TripManager...');

    const unsubOffer = tripManager.on('newPendingTrip', (trip) => {
      console.log('[DriverApp] 📨 newPendingTrip', trip.id);
      this._setFlowState('RECEIVING_OFFER');

      uiController.showIncomingTrip(
        trip,
        () => this._acceptOffer(trip.offerId),
        () => this._rejectOffer(trip.offerId)
      );
    });

    const unsubAccepted = tripManager.on('tripAccepted', async (trip) => {
      if (this._currentTripId === trip.id) return;
      this._currentTripId = trip.id;
      this._setFlowState('GOING_TO_PICKUP');

      window.dispatchEvent(
        new CustomEvent('tripStateChanged', {
          detail: { estado: trip.estado }
        })
      );

      console.log('[DriverApp] ✅ tripAccepted', trip.id);

      uiController.hideIncomingModal?.();
      uiController.showToast('¡Viaje aceptado!', 'success');

      await this._showRouteOnMap(trip);
      uiController.showNavigationState(trip);
    });

    const unsubStarted = tripManager.on('tripStarted', async (trip) => {
      console.log('[DriverApp] 🚀 tripStarted', trip.id);
      this._setFlowState('TRIP_STARTED');

      uiController.showToast('Viaje iniciado', 'success');

      await this._showRouteOnMap(trip);
      uiController.showNavigationState(trip);

      window.dispatchEvent(
        new CustomEvent('tripStateChanged', {
          detail: { estado: trip.estado }
        })
      );
    });

    const unsubCompleted = tripManager.on('tripCompleted', async (trip) => {
      console.log('[DriverApp] 🏁 tripCompleted', trip.id);
      this._setFlowState('TRIP_COMPLETED');

      this._currentTripId = null;
      mapService.clearRoute?.();
      uiController.hideNavigation?.();

      uiController.showToast(`Viaje completado +$${trip.precio ?? 0}`, 'success', 5000);

      if (this._onlineStatus) {
        this._setFlowState('ONLINE_IDLE');
        uiController.showWaitingState();
      } else {
        this._setFlowState('OFFLINE');
      }
    });

    const unsubCancelled = tripManager.on('tripCancelled', () => {
      console.log('[DriverApp] ❌ tripCancelled');

      this._currentTripId = null;
      mapService.clearRoute?.();
      uiController.hideNavigation?.();

      uiController.showToast('Viaje cancelado', 'warning');

      if (this._onlineStatus) {
        this._setFlowState('ONLINE_IDLE');
      } else {
        this._setFlowState('OFFLINE');
      }

      uiController.showWaitingState();
    });

    const unsubCleared = tripManager.on('pendingTripCleared', ({ reason }) => {
      console.log('[DriverApp] 🧹 pendingTripCleared', reason);

      if (this._onlineStatus) {
        this._setFlowState('ONLINE_IDLE');
      } else {
        this._setFlowState('OFFLINE');
      }

      uiController.hideIncomingModal?.();
      uiController.showWaitingState();
    });

    const unsubNoPending = tripManager.on('noPendingTrips', () => {
      console.log('[DriverApp] noPendingTrips');

      if (this._onlineStatus) {
        this._setFlowState('ONLINE_IDLE');
      }

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

  // =========================================================
  // MAP ROUTE
  // =========================================================
  async _showRouteOnMap(trip) {
    console.log('[DriverApp] Mostrando ruta en mapa...');

    try {
      if (!trip?.origen_lat || !trip?.origen_lng || !trip?.destino_lat || !trip?.destino_lng) {
        console.warn('[DriverApp] Viaje sin coordenadas, no se puede trazar ruta');
        return;
      }

      const estado = String(trip.estado || '').toUpperCase();
      const goingToDestination = estado === 'EN_CURSO';

      const driverPosition = locationTracker.getCurrentPosition?.() || null;

      const origin = goingToDestination
        ? { lat: trip.origen_lat, lng: trip.origen_lng }
        : driverPosition
          ? { lat: driverPosition.lat, lng: driverPosition.lng }
          : { lat: trip.origen_lat, lng: trip.origen_lng };

      const destination = goingToDestination
        ? { lat: trip.destino_lat, lng: trip.destino_lng }
        : { lat: trip.origen_lat, lng: trip.origen_lng };
      
      if (typeof mapService.showRoute === 'function') {
        await mapService.showRoute(origin, destination);
        return;
      }

      if (typeof mapService.drawRoute === 'function') {
        await mapService.drawRoute(origin, destination);
        return;
      }

      if (typeof mapService.showTripRoute === 'function') {
        await mapService.showTripRoute(origin, destination);
        return;
      }

      console.warn('[DriverApp] No existe método para mostrar ruta en mapService');
    } catch (error) {
      console.error('[DriverApp] Error mostrando ruta:', error);
    }
  }

  // =========================================================
  // OFFER ACTIONS
  // =========================================================
  async _acceptOffer(offerId) {
    console.log('[DriverApp] Aceptando oferta:', offerId);
    uiController.setGlobalLoading?.(true, 'Aceptando viaje...');

    try {
      const result = await tripManager.acceptOffer(offerId);

      if (!result.success) {
        uiController.showToast(result.error || 'Error aceptando viaje', 'warning');
        uiController.hideIncomingModal?.();

        if (this._onlineStatus) {
          this._setFlowState('ONLINE_IDLE');
        } else {
          this._setFlowState('OFFLINE');
        }

        uiController.showWaitingState();
        return result;
      }

      await tripManager.refresh();
      return result;
    } catch (err) {
      console.error('[DriverApp] Error aceptando oferta:', err);
      uiController.showToast('Error aceptando viaje', 'error');
      return { success: false, error: err.message };
    } finally {
      uiController.setGlobalLoading?.(false);
    }
  }

  async _rejectOffer(offerId) {
    console.log('[DriverApp] Rechazando oferta:', offerId);

    try {
      await tripManager.rejectOffer(offerId);

      if (this._onlineStatus) {
        this._setFlowState('ONLINE_IDLE');
      } else {
        this._setFlowState('OFFLINE');
      }

      uiController.showWaitingState();
      return { success: true };
    } catch (err) {
      console.error('[DriverApp] Error rechazando oferta:', err);
      return { success: false, error: err.message };
    }
  }

  // =========================================================
  // TRIP ACTIONS
  // =========================================================
  async _acceptTrip(tripId) {
    console.log('[DriverApp] Aceptando viaje:', tripId);
    uiController.setGlobalLoading?.(true, 'Aceptando viaje...');

    try {
      const result = await tripManager.acceptTrip(tripId);
      console.log('[DriverApp] acceptTrip result:', result);

      if (!result.success) {
        uiController.showToast(
          result.error === 'VIAJE_YA_TOMADO'
            ? '❌ Otro chofer tomó el viaje'
            : result.error || 'Error aceptando viaje',
          'warning'
        );

        uiController.hideIncomingModal?.();

        if (this._onlineStatus) {
          this._setFlowState('ONLINE_IDLE');
        } else {
          this._setFlowState('OFFLINE');
        }

        uiController.showWaitingState();
        return result;
      }

      await tripManager.refresh();
      return result;
    } catch (err) {
      console.error('[DriverApp] Error aceptando viaje:', err);
      uiController.showToast('Error aceptando viaje', 'error');
      uiController.showWaitingState();

      return { success: false, error: err.message };
    } finally {
      uiController.setGlobalLoading?.(false);
    }
  }

  async _rejectTrip(tripId) {
    console.log('[DriverApp] Rechazando viaje:', tripId);
    await tripManager.rejectTrip(tripId);

    if (this._onlineStatus) {
      this._setFlowState('ONLINE_IDLE');
    } else {
      this._setFlowState('OFFLINE');
    }

    uiController.showWaitingState();
  }

  // =========================================================
  // LOCATION UPDATE
  // =========================================================
  async _onPositionUpdate(position) {
    if (!this._onlineStatus && !tripManager.getCurrentTrip()) return;

    mapService.updateDriverPosition?.(position.lng, position.lat, position.heading);

    // Estado actual del viaje
    const currentTrip = tripManager.getCurrentTrip();

    // Ajustar intervalo dinámico según estado
    if (String(currentTrip?.estado || '').toUpperCase() === 'EN_CURSO') {
      this._locationUpdateInterval = 5000;
    } else if (this._onlineStatus) {
      this._locationUpdateInterval = 15000;
    } else {
      this._locationUpdateInterval = 30000;
    }

    // ------------------------------------------------------
    // Guardar ubicación en Supabase (cada X segundos)
    // ------------------------------------------------------
    const now = Date.now();
    if (now - this._lastLocationUpdate >= this._locationUpdateInterval) {
      this._lastLocationUpdate = now;

      try {
        if (!this._authUserId) return;

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
          .eq('user_id', this._authUserId);

        if (error) {
          console.error('[DriverApp] ❌ Error guardando ubicación:', error);
        }
      } catch (err) {
        console.error('[DriverApp] ❌ Falló update ubicación:', err);
      }
    }

    // ------------------------------------------------------
    // Detectar llegada origen / destino
    // ------------------------------------------------------
    if (currentTrip) {
      const estado = String(currentTrip.estado || '').toUpperCase();

      // yendo al origen
      if ((estado === 'ACEPTADO' || estado === 'ASIGNADO' || estado === 'PENDIENTE') &&
          this._driverFlowState === 'GOING_TO_PICKUP') {
        const distPickup = this._calculateDistance(
          position.lat,
          position.lng,
          currentTrip.origen_lat,
          currentTrip.origen_lng
        );

if (distDestination < 100) {
  this._setFlowState('ARRIVED_DESTINATION');
  uiController.showArrival?.();
}      

      // yendo al destino
      if (estado === 'EN_CURSO' && this._driverFlowState === 'TRIP_STARTED') {
        const distDestination = this._calculateDistance(
          position.lat,
          position.lng,
          currentTrip.destino_lat,
          currentTrip.destino_lng
        );

        if (distDestination < 100) {
          this._setFlowState('ARRIVED_DESTINATION');
          uiController.showArrival?.();
        }
      }
    }
  }

  // =========================================================
  // UI SETUP
  // =========================================================
  _setupUI() {
    const btnFab = document.getElementById('fab-online');

    if (btnFab) {
      btnFab.addEventListener('click', async () => {
        try {
          const hasActiveTrip = !!tripManager.getCurrentTrip();            
          if (hasActiveTrip && this._onlineStatus) {             
            uiController.showToast('No podés ponerte offline durante un viaje', 'warning');             
            return;           }            
          this._onlineStatus = !this._onlineStatus;

          if (!this._authUserId) {
            uiController.showToast('No autenticado', 'error');
            return;
          }

          const { error } = await supabaseService.client
            .from('choferes')
            .update({
              disponible: this._onlineStatus,
              online: this._onlineStatus,
              last_seen_at: new Date().toISOString()
            })
            .eq('user_id', this._authUserId);

          if (error) {
            console.error('[DriverApp] Error update chofer:', error);
            uiController.showToast('No se pudo actualizar estado', 'error');
            return;
          }

          uiController.updateDriverState(            
          this._onlineStatus ? 'ONLINE' : 'OFFLINE',            
          this._onlineStatus           
          );
          uiController.showToast(
            this._onlineStatus ? '🟢 Online' : '🔴 Offline',
            'success'
          );

          if (this._onlineStatus) {
            if (!tripManager.getCurrentTrip()) {
              this._setFlowState('ONLINE_IDLE');
              uiController.showWaitingState();
            }
          } else {
            this._setFlowState('OFFLINE');
            mapService.clearRoute?.();
            uiController.hideNavigation?.();
          }
        } catch (err) {
          console.error('[DriverApp] Error cambiando estado:', err);
          uiController.showToast('Error cambiando estado', 'error');
        }
      });
    }

    window.addEventListener('driverAction', async (e) => {
      const { action, tripId } = e.detail || {};
      await this._handleAction(action, tripId);
    });
  }

  async _handleAction(action, tripId) {
    console.log('[DriverApp] Acción:', action, tripId);

    const pending = tripManager.getPendingTrip();
    const current = tripManager.getCurrentTrip();

    switch (action) {
      case 'accept':
        return this._acceptOffer(pending?.offerId || tripId);

      case 'reject':
        return this._rejectOffer(pending?.offerId || tripId);

      case 'start': {
        const result = await tripManager.startTrip(current?.id || tripId);
        if (result?.success) {
          this._setFlowState('TRIP_STARTED');
          uiController.showToast('Viaje iniciado', 'success');
          await tripManager.refresh();
        }
        return result;
      }

case 'finish': {
  const result = await tripManager.finishTrip(current?.id || tripId);
  if (result?.success) {
    this._setFlowState('TRIP_COMPLETED');

    this._currentTripId = null;
    mapService.clearRoute?.();
    uiController.hideNavigation?.();

    uiController.showToast('Viaje finalizado', 'success');

    if (this._onlineStatus) {
      this._setFlowState('ONLINE_IDLE');
      uiController.showWaitingState();
    } else {
      this._setFlowState('OFFLINE');
    }

    await tripManager.refresh();
  }
  return result;
}
      case 'cancel':
        return tripManager.cancelTrip(current?.id || tripId);

      case 'navigate':
        return this._openExternalNav();

      case 'whatsapp':
        return this._openWhatsApp();

      default:
        console.warn('[DriverApp] Acción desconocida:', action);
        return null;
    }
  }
  // =========================================================
  // EXTERNAL ACTIONS
  // =========================================================
  _openExternalNav() {
    const trip = tripManager.getCurrentTrip();
    if (!trip) return;

    const estado = String(trip.estado || '').toUpperCase();
    const goingToDestination = estado === 'EN_CURSO';

    const lat = goingToDestination ? trip.destino_lat : trip.origen_lat;
    const lng = goingToDestination ? trip.destino_lng : trip.origen_lng;

    if (!lat || !lng) return;

    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    window.open(url, '_blank');
  }

  _openWhatsApp() {
    const trip = tripManager.getCurrentTrip();
    if (!trip?.telefono) return;

    const msg = encodeURIComponent('Hola, soy tu conductor de MIMI 🚐');
    window.open(`https://wa.me/${trip.telefono}?text=${msg}`, '_blank');
  }

  // =========================================================
  // DISTANCE UTILS
  // =========================================================
  _calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  // =========================================================
  // DESTROY (opcional pero pro)
  // =========================================================
  destroy() {
    try {
      this._unsubscribers.forEach((fn) => {
        if (typeof fn === 'function') fn();
      });
      this._unsubscribers = [];
    } catch (err) {
      console.warn('[DriverApp] Error en destroy:', err);
    }
  }
}

const app = new DriverApp();
app.init();

export default DriverApp;
