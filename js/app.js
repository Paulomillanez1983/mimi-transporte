/**
 * MIMI Driver - Main Application (STABLE)
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
    console.log('[DriverApp] Starting...');

    try {
      // Inicializar UI
      uiController.init();

      // Conectar DB
      const dbReady = await supabaseService.init();
      if (!dbReady) throw new Error('No DB connection');

      // Verificar auth
      const { data: { user } } = await supabaseService.client.auth.getUser();
      if (!user) {
        window.location.href = CONFIG.REDIRECTS.LOGIN;
        return;
      }

      console.log('[DriverApp] User:', user.id);

      // Inicializar servicios
      await this._initMapWithFallback();
      await this._initLocationWithFallback();

      this._setupUI();

      this.initialized = true;
      uiController.updateDriverState('ONLINE', false);
      console.log('[DriverApp] Ready');

    } catch (error) {
      console.error('[DriverApp] Error:', error);
      uiController.showToast('Error: ' + error.message, 'error');
    }
  }

  _setupRealtime() {
    const driverId = supabaseService.getDriverId();
    if (!driverId) return;

    console.log('[Realtime] Subscribing:', driverId);

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
          this._onNuevaOferta(payload.new);
        }
      )
      .subscribe();

    this._unsubscribers.push(() => {
      supabaseService.client.removeChannel(channel);
    });
  }

  _cleanupRealtime() {
    this._unsubscribers.forEach(fn => fn());
    this._unsubscribers = [];
  }

  async _onNuevaOferta(oferta) {
    console.log('[DriverApp] Offer:', oferta);

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

      console.log('[DriverApp] Trip:', viaje);
      this._currentTripId = viaje.id;

      // MOSTRAR MODAL VIA UICONTROLLER
      uiController.showIncomingTrip(
        viaje,
        () => this._acceptTrip(viaje.id),
        () => this._rejectTrip(viaje.id)
      );

    } catch (err) {
      console.error('Error:', err);
    }
  }

  async _acceptTrip(tripId) {
    console.log('Accepting:', tripId);
    uiController.setLoading(true, 'Aceptando...');
    
    try {
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
      
    } catch (err) {
      uiController.showToast('Error al aceptar', 'error');
    } finally {
      uiController.setLoading(false);
    }
  }

  async _rejectTrip(tripId) {
    console.log('Rejecting:', tripId);
    
    try {
      await supabaseService.client
        .from('viaje_ofertas')
        .update({ estado: 'RECHAZADA' })
        .eq('viaje_id', tripId);
      
      this._currentTripId = null;
      uiController.showToast('Viaje rechazado', 'warning');
      
    } catch (err) {
      console.error('Error:', err);
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
      console.error('Error:', e);
      uiController.showToast('Error', 'error');
    }
  }

  async _initMapWithFallback() {
    try {
      return await mapService.init('map-container');
    } catch (e) {
      console.warn('Map error:', e);
      return false;
    }
  }

  async _initLocationWithFallback() {
    try {
      return await locationTracker.start(pos => {
        mapService.updateDriverMarker(pos.lng, pos.lat, pos.heading);
      });
    } catch (e) {
      console.warn('GPS error:', e);
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

// INIT
document.addEventListener('DOMContentLoaded', () => {
  new DriverApp().init();
});
