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
import { initDriverSupport, openDriverSupportPanel } from './driver-support.js';

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
    window.uiController = uiController;
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
      initDriverSupport();

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
    try {
      if (!this._authUserId) return null;

      const { data: chofer, error } = await supabaseService.client
        .from('choferes')
        .select('id_uuid')
        .eq('user_id', this._authUserId)
        .single();

      if (error) {
        console.error('[DriverApp] Error resolviendo chofer:', error);
        return null;
      }

      return chofer?.id_uuid || null;
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
  const earningsBtn = document.getElementById('menu-earnings');
  const historyBtn = document.getElementById('menu-history');
  const settingsBtn = document.getElementById('menu-settings');
  const profileBtn = document.getElementById('menu-view-profile');

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

  if (supportBtn) {
    supportBtn.addEventListener('click', async () => {
      uiController.closeMenu?.();
      await openDriverSupportPanel();
    });
  }

  if (earningsBtn) {
    earningsBtn.addEventListener('click', () => {
      uiController.closeMenu?.();
      uiController.showInfoSheet?.({
        title: 'Ganancias',
        description: 'Resumen rapido de tu jornada para revisar ingresos y rendimiento desde el celular.',
        metrics: [
          { label: 'Hoy', value: document.getElementById('stat-earnings')?.textContent || '$0' },
          { label: 'Viajes', value: document.getElementById('stat-trips')?.textContent || '0' },
          { label: 'Rating', value: document.getElementById('stat-rating')?.textContent || '5.0' }
        ]
      });
    });
  }

  if (historyBtn) {
    historyBtn.addEventListener('click', () => {
      uiController.closeMenu?.();
      uiController.showInfoSheet?.({
        title: 'Historial',
        description: 'Aca vas a poder revisar tus ultimos viajes y el estado general de tu actividad.',
        metrics: [
          { label: 'Viajes', value: document.getElementById('stat-trips')?.textContent || '0' },
          { label: 'Estado', value: this._onlineStatus ? 'Online' : 'Offline' }
        ]
      });
    });
  }

  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      uiController.closeMenu?.();
      uiController.showInfoSheet?.({
        title: 'Configuracion',
        description: 'Desde aca vas a poder revisar preferencias basicas del chofer, conexion y estado de la cuenta.',
        metrics: [
          { label: 'Sesion', value: this._authUserId ? 'Activa' : 'Sin datos' },
          { label: 'Modo', value: this._onlineStatus ? 'Disponible' : 'Desconectado' }
        ]
      });
    });
  }

  if (profileBtn) {
    profileBtn.addEventListener('click', () => {
      uiController.closeMenu?.();
      uiController.showInfoSheet?.({
        title: 'Perfil',
        description: 'Resumen del perfil del chofer cargado actualmente en la aplicacion.',
        metrics: [
          { label: 'Nombre', value: document.getElementById('driver-name')?.textContent || 'Conductor' },
          { label: 'Estado', value: this._onlineStatus ? 'Online' : 'Offline' }
        ]
      });
    });
  }

  window.addEventListener('driverAction', this._driverActionHandler);
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
