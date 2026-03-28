/**
 * MIMI Driver - Main Application (Fixed)
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
    this._offerLock = false; // Prevenir múltiples ofertas simultáneas
  }

  async init() {
    console.log('[DriverApp] Starting...');
    
    try {
      uiController.init();
      
      const dbReady = await supabaseService.init();
      if (!dbReady) throw new Error('Supabase connection failed');

      const { data: { user } } = await supabaseService.client.auth.getUser();
      if (!user) {
        window.location.href = CONFIG.REDIRECTS.LOGIN;
        return;
      }

      console.log('[DriverApp] User:', user.id);
      
      // Inicializar servicios
      await Promise.all([
        this._initMapWithFallback(),
        this._initLocationWithFallback()
      ]);

      this._setupUI();
      this.initialized = true;
      
      uiController.updateDriverState('ONLINE', false);
      console.log('[DriverApp] Ready');

    } catch (error) {
      console.error('[DriverApp] Init error:', error);
      uiController.showToast('Error iniciando: ' + error.message, 'error', 5000);
    }
  }

  _setupRealtime() {
    const driverId = supabaseService.getDriverId();
    if (!driverId) return;

    console.log('[Realtime] Subscribing for driver:', driverId);

    const channel = supabaseService.client
      .channel('ofertas')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'viaje_ofertas',
          filter: `chofer_id_uuid=eq.${driverId}`
        },
        payload => {
          // ✅ Debounce: evitar procesar la misma oferta múltiples veces
          if (this._offerLock) return;
          this._onNuevaOferta(payload.new);
        }
      )
      .subscribe();

    this._unsubscribers.push(() => supabaseService.client.removeChannel(channel));
  }

  async _onNuevaOferta(oferta) {
    console.log('[DriverApp] New offer:', oferta.viaje_id);
    
    // ✅ Lock para evitar spam de clicks
    this._offerLock = true;
    setTimeout(() => this._offerLock = false, 2000);

    try {
      const { data: viaje, error } = await supabaseService.client
        .from('viajes')
        .select('*')
        .eq('id', oferta.viaje_id)
        .single();

      if (error || !viaje) {
        console.error('Error loading trip:', error);
        return;
      }

      console.log('[DriverApp] Trip loaded:', viaje.id);
      this._currentTripId = viaje.id;

      // ✅ Usar UIController correctamente con callbacks
      uiController.showIncomingTrip(
        viaje,
        () => this._acceptTrip(viaje.id),
        () => this._rejectTrip(viaje.id)
      );

    } catch (err) {
      console.error('[DriverApp] Error processing offer:', err);
    }
  }

  async _acceptTrip(tripId) {
    console.log('[DriverApp] Accepting trip:', tripId);
    
    try {
      uiController.setLoading(true);
      
      const { error } = await supabaseService.client
        .from('viajes')
        .update({ 
          estado: 'ACEPTADO',
          chofer_id_uuid: supabaseService.getDriverId(),
          updated_at: new Date().toISOString()
        })
        .eq('id', tripId);

      if (error) throw error;
      
      uiController.showToast('Viaje aceptado', 'success');
      // Aquí agregar navegación al mapa
      
    } catch (err) {
      console.error('Accept error:', err);
      uiController.showToast('Error al aceptar', 'error');
    } finally {
      uiController.setLoading(false);
    }
  }

  async _rejectTrip(tripId) {
    console.log('[DriverApp] Rejecting trip:', tripId);
    
    try {
      const { error } = await supabaseService.client
        .from('viaje_ofertas')
        .update({ 
          estado: 'RECHAZADA',
          responded_at: new Date().toISOString()
        })
        .eq('viaje_id', tripId)
        .eq('chofer_id_uuid', supabaseService.getDriverId());

      if (error) throw error;
      
      this._currentTripId = null;
      uiController.showToast('Viaje rechazado', 'warning');
      
    } catch (err) {
      console.error('Reject error:', err);
      uiController.showToast('Error al rechazar', 'error');
    }
  }

  async _toggleOnlineStatus() {
    try {
      this._onlineStatus = !this._onlineStatus;
      
      const { error } = await supabaseService.client
        .from('choferes')
        .update({
          disponible: this._onlineStatus,
          online: this._onlineStatus,
          last_seen_at: new Date().toISOString()
        })
        .eq('id_uuid', supabaseService.getDriverId());

      if (error) throw error;

      uiController.updateDriverState('ONLINE', this._onlineStatus);
      
      if (this._onlineStatus) {
        this._setupRealtime();
        uiController.showToast('🟢 Online', 'success');
      } else {
        this._cleanupRealtime();
        uiController.showToast('🔴 Offline', 'success');
      }
    } catch (e) {
      uiController.showToast('Error cambiando estado', 'error');
      this._onlineStatus = !this._onlineStatus; // Rollback
    }
  }

  _cleanupRealtime() {
    this._unsubscribers.forEach(fn => fn());
    this._unsubscribers = [];
  }

  async _initMapWithFallback() {
    try {
      return await mapService.init('map-container');
    } catch (e) {
      console.warn('[DriverApp] Map init failed:', e);
      return false;
    }
  }

  async _initLocationWithFallback() {
    try {
      return await locationTracker.start(pos => {
        mapService.updateDriverMarker(pos.lng, pos.lat, pos.heading);
      });
    } catch (e) {
      console.warn('[DriverApp] Location init failed:', e);
      return false;
    }
  }

  _setupUI() {
    const btnFab = document.getElementById('fab-online');
    if (btnFab) {
      btnFab.addEventListener('click', () => this._toggleOnlineStatus());
    }
  }
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  new DriverApp().init();
});
