/**
 * MIMI Driver - Main Application (PRODUCTION FINAL)
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
      // 1. INICIALIZAR UI PRIMERO (para mostrar loading)
      uiController.init();

      // 2. INICIALIZAR SUPABASE
      console.log('[DriverApp] Initializing Supabase...');
      const dbReady = await supabaseService.init();
      if (!dbReady) {
        throw new Error('Could not connect to Supabase');
      }

      // Verificar autenticación
      const { data: { user } } = await supabaseService.client.auth.getUser();
      if (!user) {
        console.log('[DriverApp] Not authenticated, redirecting to login');
        window.location.href = CONFIG.REDIRECTS.LOGIN;
        return;
      }

      console.log('[DriverApp] User authenticated:', user.id);

      // 3. INICIALIZAR MAPA (con timeout y fallback)
      console.log('[DriverApp] Initializing map...');
      const mapReady = await this._initMapWithFallback();
      if (!mapReady) {
        console.warn('[DriverApp] Map initialization failed, continuing without map');
      }

      // 4. INICIAR TRACKING DE UBICACIÓN (con manejo de permisos)
      console.log('[DriverApp] Starting location tracking...');
      const locationReady = await this._initLocationWithFallback();
      if (!locationReady) {
        console.warn('[DriverApp] Location tracking failed');
        uiController.showToast('⚠️ No se pudo acceder a la ubicación. Verifica los permisos.', 'warning', 5000);
      }

      // 5. CONFIGURAR UI
      this._setupUI();

      this.initialized = true;
      console.log('[DriverApp] ✅ Initialization complete');

      // Estado inicial
      uiController.updateDriverState('ONLINE', false);

    } catch (error) {
      console.error('[DriverApp] ❌ Fatal error:', error);
      uiController.showToast('Error: ' + error.message, 'error', 5000);
    }
  }

  async _initMapWithFallback() {
    try {
      const success = await mapService.init('map-container');
      if (success) {
        console.log('[DriverApp] Map initialized successfully');
        return true;
      }
    } catch (error) {
      console.error('[DriverApp] Map init error:', error);
    }

    // Mostrar mensaje en UI
    const mapContainer = document.getElementById('map-container');
    if (mapContainer) {
      mapContainer.innerHTML = `
        <div style="
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          background: #1a1a2e;
          color: white;
          flex-direction: column;
          gap: 16px;
        ">
          <div style="font-size: 48px;">🗺️</div>
          <div>No se pudo cargar el mapa</div>
          <button onclick="location.reload()" style="
            padding: 12px 24px;
            background: #276EF1;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
          ">Reintentar</button>
        </div>
      `;
    }

    return false;
  }

  async _initLocationWithFallback() {
    try {
      const success = await locationTracker.start((position) => {
        this._onPositionUpdate(position);
      });

      if (success) {
        console.log('[DriverApp] Location tracking started');
        
        // Forzar actualización inicial del marcador si tenemos posición
        const pos = locationTracker.getLastPosition();
        if (pos) {
          mapService.updateDriverMarker(pos.lng, pos.lat, pos.heading);
          mapService.setCenter(pos.lng, pos.lat, 16);
        }
        
        return true;
      }
    } catch (error) {
      console.error('[DriverApp] Location init error:', error);
    }

    return false;
  }

  _onPositionUpdate(position) {
    console.log('[DriverApp] Position update:', position);

    // Actualizar marcador en el mapa
    mapService.updateDriverMarker(position.lng, position.lat, position.heading);

    // Actualizar UI con stats
    uiController.updateStats({
      speed: position.speed,
      accuracy: position.accuracy
    });
  }

  _setupUI() {
    // Botón online/offline
    const btnFab = document.getElementById('fab-online');
    if (btnFab) {
      btnFab.addEventListener('click', async () => {
        await this._toggleOnlineStatus();
      });
    }

    // Escuchar errores de ubicación
    window.addEventListener('locationError', (e) => {
      console.error('[DriverApp] Location error event:', e.detail);
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
        console.error('[DriverApp] Error updating status:', error);
        uiController.showToast('No se pudo actualizar estado', 'error');
        return;
      }

      uiController.updateDriverState('ONLINE', this._onlineStatus);
      uiController.showToast(this._onlineStatus ? '🟢 Online' : '🔴 Offline', 'success');

    } catch (e) {
      console.error('[DriverApp] Error toggling status:', e);
      uiController.showToast('Error cambiando estado', 'error');
    }
  }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  const app = new DriverApp();
  app.init();
});

export default DriverApp;
