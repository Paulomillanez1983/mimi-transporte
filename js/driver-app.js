/**
 * Driver App producción FINAL (RLS + UUID + FLOW + UBER DRIVER)
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

    // Control para no spamear Supabase
    this._lastLocationUpdate = 0;
    this._locationUpdateInterval = 15000;

    // Cache auth
    this._authUserId = null;

    // Flujo chofer
    this._driverFlowState = 'OFFLINE';

    // Protección lifecycle / acciones
    this._destroyed = false;
    this._actionLock = false;
    // =========================================================
// SUPPORT STATE
// =========================================================
this._support = {
  ticketId: null,
  channel: null,
  sending: false,
  loaded: false,
  processedIds: new Set(),
  openBound: false,
  escHandler: null
};

    // Refs para cleanup
    this._fabClickHandler = null;
    this._driverActionHandler = this._handleDriverActionEvent.bind(this);
    this._unlockAudioOnClick = () => {
      soundManager.enableOnUserInteraction?.();
    };
    this._unlockAudioOnTouch = () => {
      soundManager.enableOnUserInteraction?.();
    };
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
    if (this.initialized) {
      console.warn('[DriverApp] Ya estaba inicializada');
      return;
    }

    console.log('[DriverApp] Iniciando aplicación...');

    uiController.init();
    uiController.setGlobalLoading(true, 'Cargando...');

    try {
      // 1) Inicializar Supabase
      console.log('[DriverApp] Inicializando Supabase...');
      const dbReady = await supabaseService.init();
      if (!dbReady) throw new Error('No se pudo conectar a Supabase');

      // 2) Resolver sesión válida antes de pedir user
      const authData = await this._requireValidAuth();

      if (!authData) {
        console.log('[DriverApp] Sin sesión válida, redirigiendo a login');
        window.location.href = CONFIG.REDIRECTS.LOGIN;
        return;
      }

      const { session, user } = authData;

      this._authUserId = user.id;
      this._session = session;

      console.log('[DriverApp] Auth user detectado:', this._authUserId);
      // Perfil visible en UI (nombre + foto Google si existe)
      uiController.setDriverProfile({
        name:
          user?.user_metadata?.full_name ||
          user?.user_metadata?.name ||
          user?.email ||
          'Conductor',
        email: user?.email || '',
        avatarUrl:
          user?.user_metadata?.avatar_url ||
          user?.user_metadata?.picture ||
          ''
      });

      // Desbloqueo audio/haptics en interacción real
      window.addEventListener('click', this._unlockAudioOnClick, { once: true });
      window.addEventListener('touchstart', this._unlockAudioOnTouch, { once: true });

      // 3) Inicializar mapa
      console.log('[DriverApp] Inicializando servicios...');

      const results = await Promise.allSettled([
        mapService.init('map-container')
      ]);

      console.log('[DriverApp] Resultados inicialización:', {
        mapa: results[0]?.status
      });

      if (results[0]?.status === 'rejected') {
        console.error('[DriverApp] Error mapa:', results[0].reason);
      }
      if (results[0]?.status === 'rejected') {
        console.error('[DriverApp] Error mapa:', results[0].reason);
      }

      // 4) Resolver driverId
      console.log('[DriverApp] Resolviendo driverId...');
      const driverId = await this._resolveDriverId();
      console.log('[DriverApp] driverId detectado:', driverId);

      // 5) Inicializar TripManager
      console.log('[DriverApp] Inicializando TripManager...');
      const tripManagerReady = await tripManager.init(driverId);

      if (!tripManagerReady) {
        console.warn('[DriverApp] TripManager no pudo inicializarse');
        uiController.showToast('No se pudo cargar el perfil del chofer', 'warning', 5000);
      }

      // 6) Eventos + UI
      this._subscribeToEvents();
      this._setupUI();

      this.initialized = true;
      console.log('[DriverApp] Aplicación inicializada correctamente');

      if (!tripManagerReady) {
        this._onlineStatus = false;
        uiController.updateDriverState('OFFLINE', false);
        this._setFlowState('OFFLINE');
        uiController.showWaitingState();
        return;
      }

      // 7) Estado inicial real desde BD
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

      if (this._onlineStatus) {
        await this._startLocationTracking();
        await initPushFCM('chofer');
      } else {
        this._setFlowState('OFFLINE');
      }

      // 8) Estado inicial de viajes
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
      console.error('[DriverApp] Error fatal:', error);

      const msg = String(error?.message || '').toLowerCase();

      if (
        msg.includes('auth') ||
        msg.includes('session') ||
        msg.includes('jwt') ||
        msg.includes('forbidden')
      ) {
        window.location.href = CONFIG.REDIRECTS.LOGIN;
        return;
      }

      uiController.showToast(
        'Error: ' + (error?.message || 'Error desconocido'),
        'error',
        5000
      );
    } finally {
      uiController.setGlobalLoading(false);
    }
  }
  async _requireValidAuth() {
    try {
      // 1) Intento normal
      let {
        data: sessionData,
        error: sessionError
      } = await supabaseService.client.auth.getSession();

      if (sessionError) {
        console.warn('[DriverApp] getSession error:', sessionError);
      }

      let session = sessionData?.session || null;

      // 2) Si no hay sesión, esperamos un poco por hydration post-OAuth
      if (!session?.access_token) {
        await new Promise((resolve) => setTimeout(resolve, 900));

        const {
          data: retrySessionData,
          error: retrySessionError
        } = await supabaseService.client.auth.getSession();

        if (retrySessionError) {
          console.warn('[DriverApp] getSession retry error:', retrySessionError);
        }

        session = retrySessionData?.session || null;
      }

      // 3) Si sigue sin haber sesión, intentamos refresh
      if (!session?.access_token) {
        const {
          data: refreshData,
          error: refreshError
        } = await supabaseService.client.auth.refreshSession();

        if (refreshError) {
          console.warn('[DriverApp] refreshSession error:', refreshError);
        }

        session = refreshData?.session || null;
      }

      // 4) Si no logramos sesión válida, salimos
      if (!session?.access_token) {
        return null;
      }

      // 5) Recién acá pedimos el user real
      const {
        data: userData,
        error: userError
      } = await supabaseService.client.auth.getUser();

      if (userError) {
        console.warn('[DriverApp] getUser error:', userError);
        return null;
      }

      const user = userData?.user || null;
      if (!user) return null;

      return { session, user };
    } catch (err) {
      console.error('[DriverApp] _requireValidAuth fatal:', err);
      return null;
    }
  }
  // =========================================================
  // UX PRO · HAPTICS + AUDIO FEEDBACK
  // =========================================================
  _vibrate(pattern = [90, 50, 140]) {
    try {
      if ('vibrate' in navigator) {
        navigator.vibrate(pattern);
      }
    } catch (err) {
      console.warn('[DriverApp] vibrate error:', err);
    }
  }

  _playAcceptTone() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';

      osc1.frequency.setValueAtTime(740, now);
      osc2.frequency.setValueAtTime(988, now + 0.08);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.075, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now + 0.08);

      osc1.stop(now + 0.34);
      osc2.stop(now + 0.42);

      setTimeout(() => {
        try {
          ctx.close?.();
        } catch (_) {}
      }, 700);
    } catch (err) {
      console.warn('[DriverApp] accept tone error:', err);
    }
  }

  _celebrateAcceptFeedback() {
    this._vibrate([90, 50, 140]);

    // usa soundManager si ya tiene algo cargado; si no, cae al tono WebAudio
    try {
      if (typeof soundManager?.play === 'function') {
        soundManager.play('trip-accepted');
      } else if (typeof soundManager?.playSuccess === 'function') {
        soundManager.playSuccess();
      } else {
        this._playAcceptTone();
      }
    } catch (err) {
      console.warn('[DriverApp] soundManager feedback error:', err);
      this._playAcceptTone();
    }
  }
  
  // =========================================================
  // RESOLVER DRIVER ID
  // =========================================================
async _resolveDriverId() {
  return this._authUserId || null;
}
  
// =========================================================
  // EVENTS
  // =========================================================
  _subscribeToEvents() {
    console.log('[DriverApp] Suscribiendo a eventos de TripManager...');

    const unsubOffer = tripManager.on('newPendingTrip', (trip) => {
      console.log('[DriverApp] 📨 newPendingTrip', trip.id);
      this._setFlowState('RECEIVING_OFFER');

      this._vibrate([120, 60, 120]);

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

      console.log('[DriverApp] tripAccepted', trip.id);

      this._celebrateAcceptFeedback();
      uiController.hideIncomingModal?.();
      uiController.showToast('¡Viaje aceptado!', 'success');

      await this._showRouteOnMap(trip);
      uiController.showNavigationState(trip);
    });
    const unsubStarted = tripManager.on('tripStarted', async (trip) => {
      console.log('[DriverApp] tripStarted', trip.id);
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
      console.log('[DriverApp] tripCompleted', trip.id);
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
      console.log('[DriverApp] tripCancelled');

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
      console.log('[DriverApp] pendingTripCleared', reason);

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
  // LOCATION TRACKING
  // =========================================================
  async _startLocationTracking() {
    try {
      await locationTracker.start((pos) => this._onPositionUpdate(pos));
      console.log('[DriverApp] GPS iniciado');
    } catch (err) {
      console.error('[DriverApp] Error iniciando GPS:', err);
    }
  }

  // =========================================================
  // MAP ROUTE
  // =========================================================
  async _showRouteOnMap(trip) {
    console.log('[DriverApp] Mostrando ruta en mapa...');

    try {
      if (
        !Number.isFinite(Number(trip?.origen_lat)) ||
        !Number.isFinite(Number(trip?.origen_lng)) ||
        !Number.isFinite(Number(trip?.destino_lat)) ||
        !Number.isFinite(Number(trip?.destino_lng))
      ) {
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
    if (this._destroyed) return { success: false, error: 'APP_DESTROYED' };

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

      this._celebrateAcceptFeedback();
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
    if (this._destroyed) return { success: false, error: 'APP_DESTROYED' };

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
    if (this._destroyed) return { success: false, error: 'APP_DESTROYED' };

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

      this._celebrateAcceptFeedback();
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
    if (this._destroyed) return { success: false, error: 'APP_DESTROYED' };

    console.log('[DriverApp] Rechazando viaje:', tripId);
    await tripManager.rejectTrip(tripId);

    if (this._onlineStatus) {
      this._setFlowState('ONLINE_IDLE');
    } else {
      this._setFlowState('OFFLINE');
    }

    uiController.showWaitingState();
    return { success: true };
  }

  // =========================================================
  // LOCATION UPDATE
  // =========================================================
  async _onPositionUpdate(position) {
    if (this._destroyed) return;
    if (!this._onlineStatus && !tripManager.getCurrentTrip()) return;
    if (!position || !Number.isFinite(position.lat) || !Number.isFinite(position.lng)) return;

    mapService.updateDriverPosition?.(position.lng, position.lat, position.heading);
    const currentTrip = tripManager.getCurrentTrip();

    if (String(currentTrip?.estado || '').toUpperCase() === 'EN_CURSO') {
      this._locationUpdateInterval = 5000;
    } else if (this._onlineStatus) {
      this._locationUpdateInterval = 15000;
    } else {
      this._locationUpdateInterval = 30000;
    }

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
          console.error('[DriverApp] Error guardando ubicación:', error);
        }
      } catch (err) {
        console.error('[DriverApp] Falló update ubicación:', err);
      }
    }

    if (currentTrip) {
      const estado = String(currentTrip.estado || '').toUpperCase();

      if (
        (estado === 'ACEPTADO' || estado === 'ASIGNADO' || estado === 'PENDIENTE') &&
        this._driverFlowState === 'GOING_TO_PICKUP'
      ) {
        const distPickup = this._calculateDistance(
          position.lat,
          position.lng,
          currentTrip.origen_lat,
          currentTrip.origen_lng
        );

        if (distPickup < 100) {
          this._setFlowState('ARRIVED_PICKUP');
          uiController.showArrival?.();
        }
      }

      if (
        estado === 'EN_CURSO' &&
        this._driverFlowState === 'TRIP_STARTED'
      ) {
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
  const supportBtn = document.getElementById('menu-support');
  const supportCloseBtn = document.getElementById('support-close');
  const supportModal = document.getElementById('support-modal');
  const supportSendBtn = document.getElementById('support-send');
  const supportInput = document.getElementById('support-input');

  this._fabClickHandler = async () => {
    try {
      const hasActiveTrip = !!tripManager.getCurrentTrip();

      if (hasActiveTrip && this._onlineStatus) {
        uiController.showToast('No podés ponerte offline durante un viaje', 'warning');
        return;
      }

      const nextOnline = !this._onlineStatus;

      if (nextOnline) {
        await tripManager.setDriverAvailability({
          online: true,
          disponible: true
        });

        await this._startLocationTracking();
        await initPushFCM('chofer');

        this._onlineStatus = true;
        this._setFlowState('ONLINE_IDLE');
        uiController.showWaitingState();
      } else {
        if (tripManager.getCurrentTrip()) {
          uiController.showToast('No podés desconectarte en viaje', 'warning');
          return;
        }

        await tripManager.setDriverAvailability({
          online: false,
          disponible: false
        });

        this._onlineStatus = false;
        this._setFlowState('OFFLINE');
        mapService.clearRoute?.();
        uiController.hideNavigation?.();
        locationTracker.stop?.();
      }

      uiController.updateDriverState(
        this._onlineStatus ? 'ONLINE' : 'OFFLINE',
        this._onlineStatus
      );

      uiController.showToast(
        this._onlineStatus ? '🟢 Online' : '🔴 Offline',
        'success'
      );
    } catch (err) {
      console.error('[DriverApp] Error cambiando estado:', err);
      uiController.showToast('Error cambiando estado', 'error');
    }
  };

  if (btnFab) {
    btnFab.addEventListener('click', this._fabClickHandler);
  }

  if (supportBtn && !supportBtn.dataset.bound) {
    supportBtn.addEventListener('click', async () => {
      try {
        this._openSupportModal();
        await this._loadDriverSupportConversation();
        await this._subscribeSupportRealtime();
      } catch (err) {
        console.error('[DriverApp] error abriendo soporte:', err);
        uiController.showToast(err?.message || 'No se pudo abrir soporte', 'error');
      }
    });
    supportBtn.dataset.bound = '1';
  }

  if (supportCloseBtn && !supportCloseBtn.dataset.bound) {
    supportCloseBtn.addEventListener('click', () => {
      this._closeSupportModal();
    });
    supportCloseBtn.dataset.bound = '1';
  }

  if (supportModal && !supportModal.dataset.bound) {
    supportModal.addEventListener('click', (event) => {
      if (event.target.closest('[data-close-support="true"]')) {
        this._closeSupportModal();
      }
    });
    supportModal.dataset.bound = '1';
  }

  if (supportSendBtn && !supportSendBtn.dataset.bound) {
    supportSendBtn.addEventListener('click', async () => {
      await this._sendSupportMessage();
    });
    supportSendBtn.dataset.bound = '1';
  }

  if (supportInput && !supportInput.dataset.bound) {
    supportInput.addEventListener('input', () => {
      supportInput.style.height = 'auto';
      supportInput.style.height = `${Math.min(supportInput.scrollHeight, 132)}px`;
    });

    supportInput.addEventListener('keydown', async (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        await this._sendSupportMessage();
      }
    });

    supportInput.dataset.bound = '1';
  }

  if (!this._support.escHandler) {
    this._support.escHandler = (event) => {
      if (event.key === 'Escape') {
        const modal = document.getElementById('support-modal');
        if (modal && !modal.classList.contains('hidden')) {
          this._closeSupportModal();
        }
      }
    };

    document.addEventListener('keydown', this._support.escHandler);
  }

  window.addEventListener('driverAction', this._driverActionHandler);
}
  
_openSupportModal() {
  const modal = document.getElementById('support-modal');
  const sheet = document.querySelector('#support-modal .support-sheet');
  const input = document.getElementById('support-input');

  if (!modal || !sheet) return;

  modal.classList.remove('hidden', 'is-closing');
  modal.setAttribute('aria-hidden', 'false');

  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
  document.body.style.touchAction = 'none';

  requestAnimationFrame(() => {
    sheet.focus?.({ preventScroll: true });
    setTimeout(() => input?.focus(), 180);
  });
}

_closeSupportModal() {
  const modal = document.getElementById('support-modal');
  if (!modal) return;

  modal.classList.add('is-closing');
  modal.setAttribute('aria-hidden', 'true');

  setTimeout(() => {
    modal.classList.add('hidden');
    modal.classList.remove('is-closing');

    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    document.body.style.touchAction = '';
  }, 280);
}
async _getSupportSession() {
  const { data, error } = await supabaseService.client.auth.getSession();
  if (error) throw error;

  const session = data?.session || null;
  if (!session?.access_token || !session?.user) {
    throw new Error('No hay sesión activa');
  }

  return session;
}

_getSupportElements() {
  return {
    modal: document.getElementById('support-modal'),
    messages: document.getElementById('support-messages'),
    empty: document.getElementById('support-empty'),
    input: document.getElementById('support-input'),
    send: document.getElementById('support-send'),
    attachment: document.getElementById('support-attachment'),
    subtitle: document.getElementById('support-subtitle')
  };
}

_escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

_formatSupportTime(value) {
  try {
    if (!value) return '';
    return new Date(value).toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (_) {
    return '';
  }
}

_renderSupportMessages(messages = []) {
  const els = this._getSupportElements();
  if (!els.messages) return;

  if (!Array.isArray(messages) || !messages.length) {
    els.messages.innerHTML = `
      <div class="support-empty" id="support-empty">
        Todavía no hay mensajes. Escribí tu consulta y te respondemos desde administración.
      </div>
    `;
    return;
  }

  els.messages.innerHTML = messages.map((msg) => {
    const senderRole = String(msg?.sender_role || '').toLowerCase();
    const bubbleClass = senderRole === 'admin' ? 'admin' : 'client';
    const text = this._escapeHtml(msg?.mensaje || '');
    const time = this._formatSupportTime(msg?.created_at);

    return `
      <div class="support-message ${bubbleClass}" data-message-id="${this._escapeHtml(msg?.id || '')}">
        <div>${text.replace(/\n/g, '<br>')}</div>
        <div class="support-meta">${time}</div>
      </div>
    `;
  }).join('');

  els.messages.scrollTop = els.messages.scrollHeight;
}

_appendSupportMessage(msg) {
  const els = this._getSupportElements();
  if (!els.messages || !msg?.id) return;

  if (this._support.processedIds.has(msg.id)) return;
  this._support.processedIds.add(msg.id);

  const senderRole = String(msg?.sender_role || '').toLowerCase();
  const bubbleClass = senderRole === 'admin' ? 'admin' : 'client';
  const text = this._escapeHtml(msg?.mensaje || '');
  const time = this._formatSupportTime(msg?.created_at);

  const empty = els.messages.querySelector('.support-empty');
  if (empty) empty.remove();

  const wrapper = document.createElement('div');
  wrapper.className = `support-message ${bubbleClass}`;
  wrapper.dataset.messageId = msg.id;
  wrapper.innerHTML = `
    <div>${text.replace(/\n/g, '<br>')}</div>
    <div class="support-meta">${time}</div>
  `;

  els.messages.appendChild(wrapper);
  els.messages.scrollTop = els.messages.scrollHeight;
}

async _loadDriverSupportConversation() {
  const els = this._getSupportElements();
  const session = await this._getSupportSession();
  const userId = session.user.id;

  if (els.subtitle) {
    els.subtitle.textContent = 'Chat con administración';
  }

  const { data: tickets, error: ticketError } = await supabaseService.client
    .from('soporte_tickets')
    .select('id, estado, asunto, created_at, last_message_at, user_id, created_by')
    .or(`user_id.eq.${userId},created_by.eq.${userId}`)
    .eq('rol_origen', 'driver')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1);

  if (ticketError) {
    console.error('[DriverApp] soporte ticket error:', ticketError);
    throw new Error(ticketError.message || 'No se pudo cargar soporte');
  }

  const ticket = Array.isArray(tickets) ? tickets[0] : null;
  this._support.ticketId = ticket?.id || null;

  if (!this._support.ticketId) {
    this._renderSupportMessages([]);
    this._support.loaded = true;
    return;
  }

  const { data: messages, error: messagesError } = await supabaseService.client
    .from('soporte_mensajes')
    .select('id, ticket_id, sender_role, mensaje, created_at')
    .eq('ticket_id', this._support.ticketId)
    .order('created_at', { ascending: true });

  if (messagesError) {
    console.error('[DriverApp] soporte mensajes error:', messagesError);
    throw new Error(messagesError.message || 'No se pudieron cargar los mensajes');
  }

  this._support.processedIds.clear();
  (messages || []).forEach((m) => {
    if (m?.id) this._support.processedIds.add(m.id);
  });

  this._renderSupportMessages(messages || []);
  this._support.loaded = true;
}

async _ensureDriverSupportTicket(messageText) {
  if (this._support.ticketId) return this._support.ticketId;

  const session = await this._getSupportSession();
  const userId = session.user.id;
  const email = session.user.email || null;
  const currentTrip = tripManager.getCurrentTrip?.() || null;

  const asunto = currentTrip?.id
    ? `Consulta del chofer sobre viaje ${currentTrip.id}`
    : 'Consulta general desde app chofer';

  const metadata = {
    email,
    trip_id: currentTrip?.id || null,
    estado_viaje: currentTrip?.estado || null,
    origen: currentTrip?.origen_direccion || null,
    destino: currentTrip?.destino_direccion || null,
    ts: new Date().toISOString(),
    source: 'driver_app'
  };

const payload = {
  created_by: userId,
  user_id: userId,
  rol_origen: 'driver',
  asunto,
  estado: 'abierto',
  ultimo_mensaje: messageText,
  last_message_at: new Date().toISOString(),
  metadata
};
  const { data, error } = await supabaseService.client
    .from('soporte_tickets')
    .insert(payload)
    .select('id')
    .single();

  if (error || !data?.id) {
    console.error('[DriverApp] crear ticket soporte error:', error);
    throw new Error(error?.message || 'No se pudo crear el ticket de soporte');
  }

  this._support.ticketId = data.id;
  return data.id;
}

async _sendSupportMessage() {
  if (this._support.sending) return;

  const els = this._getSupportElements();
  const text = String(els.input?.value || '').trim();

  if (!text) {
    uiController.showToast('Escribí tu mensaje antes de enviar', 'warning');
    return;
  }

  this._support.sending = true;
  if (els.send) els.send.disabled = true;

  try {
    const session = await this._getSupportSession();
    const userId = session.user.id;
    const ticketId = await this._ensureDriverSupportTicket(text);

    const currentTrip = tripManager.getCurrentTrip?.() || null;
    const metadata = {
      trip_id: currentTrip?.id || null,
      estado_viaje: currentTrip?.estado || null,
      ts: new Date().toISOString(),
      source: 'driver_app'
    };

    const { error: updateTicketError } = await supabaseService.client
      .from('soporte_tickets')
      .update({
        ultimo_mensaje: text,
        last_message_at: new Date().toISOString(),
        estado: 'abierto'
      })
      .eq('id', ticketId);

    if (updateTicketError) {
      console.warn('[DriverApp] update ticket soporte warning:', updateTicketError);
    }

const { data: inserted, error: insertError } = await supabaseService.client
  .from('soporte_mensajes')
  .insert({
    ticket_id: ticketId,
    sender_user_id: userId,
    sender_role: 'driver',
    mensaje: text,
    metadata
  })
  .select('id, ticket_id, sender_role, mensaje, created_at')
  .single();
    
    if (insertError || !inserted?.id) {
      console.error('[DriverApp] enviar soporte error:', insertError);
      throw new Error(insertError?.message || 'No se pudo enviar el mensaje');
    }

    this._appendSupportMessage(inserted);

    if (els.input) {
      els.input.value = '';
      els.input.style.height = 'auto';
      els.input.focus();
    }

    await this._subscribeSupportRealtime();
  } catch (err) {
    console.error('[DriverApp] _sendSupportMessage:', err);
    uiController.showToast(err?.message || 'No se pudo enviar el mensaje', 'error');
  } finally {
    this._support.sending = false;
    if (els.send) els.send.disabled = false;
  }
}

async _subscribeSupportRealtime() {
  if (!this._support.ticketId) return null;

  try {
    if (this._support.channel) {
      supabaseService.client.removeChannel(this._support.channel);
      this._support.channel = null;
    }

    this._support.channel = supabaseService.client
      .channel(`driver-support-${this._support.ticketId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'soporte_mensajes',
          filter: `ticket_id=eq.${this._support.ticketId}`
        },
        (payload) => {
          this._handleSupportRealtimeInsert(payload);
        }
      )
      .subscribe((status) => {
        console.log('[DriverApp] support realtime status:', status);
      });

    return this._support.channel;
  } catch (err) {
    console.warn('[DriverApp] subscribe soporte realtime error:', err);
    return null;
  }
}

_handleSupportRealtimeInsert(payload) {
  const msg = payload?.new;
  if (!msg?.id || !msg?.ticket_id) return;
  if (String(msg.ticket_id) !== String(this._support.ticketId)) return;
  if (String(msg.sender_role || '').toLowerCase() === 'driver') return;

  this._appendSupportMessage(msg);

  const modal = document.getElementById('support-modal');
  const isHidden = !modal || modal.classList.contains('hidden');

  if (isHidden) {
    uiController.showToast('Soporte respondió tu consulta', 'success');
  }
}
  async _handleDriverActionEvent(e) {
    const { action, tripId } = e.detail || {};
    await this._handleAction(action, tripId);
  }

  async _handleAction(action, tripId) {
    if (!action) return null;

    if (this._actionLock && action !== 'navigate' && action !== 'whatsapp') {
      console.warn('[DriverApp] Acción bloqueada por lock:', action);
      return null;
    }

    console.log('[DriverApp] Acción:', action, tripId);

    const pending = tripManager.getPendingTrip();
    const current = tripManager.getCurrentTrip();

    const lockableActions = new Set(['accept', 'reject', 'start', 'finish', 'cancel']);
    if (lockableActions.has(action)) {
      this._actionLock = true;
    }

    try {
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
    } finally {
      if (lockableActions.has(action)) {
        setTimeout(() => {
          this._actionLock = false;
        }, 500);
      }
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

    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return;

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
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) *
      Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  // =========================================================
  // DESTROY
  // =========================================================
  destroy() {
    try {
      this._destroyed = true;

      this._unsubscribers.forEach((fn) => {
        if (typeof fn === 'function') fn();
      });
      this._unsubscribers = [];

      const btnFab = document.getElementById('fab-online');
      if (btnFab && this._fabClickHandler) {
        btnFab.removeEventListener('click', this._fabClickHandler);
      }

      window.removeEventListener('driverAction', this._driverActionHandler);
      window.removeEventListener('click', this._unlockAudioOnClick);
      window.removeEventListener('touchstart', this._unlockAudioOnTouch);

      locationTracker.stop?.();

      if (this._support?.channel) {
  try {
    supabaseService.client.removeChannel(this._support.channel);
  } catch (_) {}
  this._support.channel = null;
}

if (this._support?.escHandler) {
  document.removeEventListener('keydown', this._support.escHandler);
  this._support.escHandler = null;
}
      uiController.destroy?.();

      this._actionLock = false;
      this.initialized = false;
    } catch (err) {
      console.warn('[DriverApp] Error en destroy:', err);
    }
  }
}

const app = new DriverApp();
app.init();

export default DriverApp;
