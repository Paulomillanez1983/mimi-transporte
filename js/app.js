/**
 * MIMI Driver - Main Application (PRODUCTION FINAL + REALTIME)
 */

import CONFIG from './config.js';
import supabaseService from './supabase-client.js';
import mapService from './map-service.js';
import locationTracker from './location-tracker.js';
import uiController from './ui-controller.js';

class DriverApp {
  constructor() {
    this.initialized = false;
    this._onlineStatus = false;
    this._currentTripId = null;
    this._unsubscribers = [];
  }

  async init() {
    console.log('[DriverApp] Starting initialization...');

    try {
      uiController.init();

      const dbReady = await supabaseService.init();
      if (!dbReady) throw new Error('Could not connect to Supabase');

      const { data: { user } } = await supabaseService.client.auth.getUser();
      if (!user) {
        window.location.href = CONFIG.REDIRECTS.LOGIN;
        return;
      }

      console.log('[DriverApp] User authenticated:', user.id);

      await this._initMapWithFallback();
      await this._initLocationWithFallback();

      this._setupUI();

      this.initialized = true;
      console.log('[DriverApp] ✅ Initialization complete');

      uiController.updateDriverState('ONLINE', false);

    } catch (error) {
      console.error('[DriverApp] ❌ Fatal error:', error);
      uiController.showToast('Error: ' + error.message, 'error', 5000);
    }
  }

  // =========================
  // REALTIME 🔥
  // =========================

  _setupRealtime() {
    const supabase = supabaseService.client;
    const driverId = supabaseService.getDriverId();

    if (!driverId) {
      console.warn('[Realtime] No driverId');
      return;
    }

    console.log('📡 Realtime activo para:', driverId);

    const channel = supabase
      .channel('ofertas')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'viaje_ofertas',
          // ⚠️ AJUSTAR SI TU COLUMNA ES DISTINTA
          filter: `chofer_id_uuid=eq.${driverId}`
        },
        payload => {
          console.log('🚗 Nueva oferta:', payload);
          this._onNuevaOferta(payload.new);
        }
      )
      .subscribe();

    this._unsubscribers.push(() => {
      supabase.removeChannel(channel);
    });
  }

  _cleanupRealtime() {
    this._unsubscribers.forEach(unsub => unsub());
    this._unsubscribers = [];
    console.log('🔌 Realtime detenido');
  }

  _onNuevaOferta(oferta) {
    console.log('[DriverApp] Oferta recibida:', oferta);

    const modal = document.getElementById('incoming-modal');
    if (modal) {
      modal.classList.add('active');
    }

    const pickup = document.getElementById('trip-pickup');
    if (pickup) pickup.textContent = 'Nuevo viaje disponible';

    uiController.showToast('🚗 Nueva oferta de viaje', 'success');
  }

  // =========================

  async _initMapWithFallback() {
    try {
      return await mapService.init('map-container');
    } catch {
      return false;
    }
  }

  async _initLocationWithFallback() {
    try {
      return await locationTracker.start((position) => {
        this._onPositionUpdate(position);
      });
    } catch {
      return false;
    }
  }

  _onPositionUpdate(position) {
    mapService.updateDriverMarker(position.lng, position.lat, position.heading);

    uiController.updateStats({
      speed: position.speed,
      accuracy: position.accuracy
    });
  }

  _setupUI() {
    const btnFab = document.getElementById('fab-online');

    if (btnFab) {
      btnFab.addEventListener('click', async () => {
        await this._toggleOnlineStatus();
      });
    }

    window.addEventListener('locationError', (e) => {
      uiController.showToast('Error de ubicación: ' + e.detail.message, 'error');
    });
  }

  async _toggleOnlineStatus() {
    try {
      this._onlineStatus = !this._onlineStatus;

      const { data: { user } } = await supabaseService.client.auth.getUser();
      if (!user) {
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
        .eq('id_uuid', supabaseService.getDriverId());

      if (error) {
        uiController.showToast('No se pudo actualizar estado', 'error');
        return;
      }

      uiController.updateDriverState('ONLINE', this._onlineStatus);

      // 🔥 ACTIVAR / DESACTIVAR REALTIME
      if (this._onlineStatus) {
        this._setupRealtime();
      } else {
        this._cleanupRealtime();
      }

      uiController.showToast(
        this._onlineStatus ? '🟢 Online' : '🔴 Offline',
        'success'
      );

    } catch (e) {
      uiController.showToast('Error cambiando estado', 'error');
    }
  }
}

// INIT
document.addEventListener('DOMContentLoaded', () => {
  const app = new DriverApp();
  app.init();
});

export default DriverApp;
