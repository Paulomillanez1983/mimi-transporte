/**
 * Location Tracker Producción (OPTIMIZADO)
 * - update en choferes
 * - insert en viaje_tracking
 * - evita inserts innecesarios si casi no hubo movimiento
 */

import CONFIG from './config.js';
import supabaseService from './supabase-client.js';

class LocationTracker {
  constructor() {
    this.watchId = null;
    this.lastPosition = null;
    this.callbacks = [];
    this.isTracking = false;

    this.updateInterval = null;
    this._updateTimeout = null;

    this._lastDbUpdate = 0;
    this._dbInterval = 8000; // cada 8 seg

    // anti-ruido para viaje_tracking
    this._lastTrackingInsert = null;
    this._minTrackingDistanceMeters = 20; // insertar solo si movió 20m+
    this._maxTrackingSilenceMs = 30000;   // o cada 30s aunque no se mueva
  }

  async start(callback) {
    if (!navigator.geolocation) {
      console.error('[LocationTracker] Geolocation no soportado');
      return false;
    }

    if (this.isTracking) this.stop();

    if (callback) this.callbacks.push(callback);

    this.isTracking = true;

    const options = {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 5000
    };

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this._handlePosition(position, true);
          resolve(true);
        },
        (error) => {
          console.warn('[LocationTracker] Error posición inicial:', error);
          resolve(true);
        },
        options
      );

      this.watchId = navigator.geolocation.watchPosition(
        (position) => this._handlePosition(position),
        (error) => this._handleError(error),
        options
      );

      this.updateInterval = setInterval(() => {
        this._refreshPosition();
      }, CONFIG.LOCATION_UPDATE_INTERVAL || 15000);

      document.addEventListener('visibilitychange', () => {
        this._handleVisibilityChange();
      });
    });
  }

  _handlePosition(position, isInitial = false) {
    const coords = position.coords;

    if (!isInitial && coords.accuracy && coords.accuracy > 300) return;

    const newPosition = {
      lat: coords.latitude,
      lng: coords.longitude,
      accuracy: coords.accuracy || null,
      heading: coords.heading || 0,
      speed: coords.speed ? Math.round(coords.speed * 3.6) : 0,
      timestamp: position.timestamp
    };

    if (
      this.lastPosition &&
      this.lastPosition.lat === newPosition.lat &&
      this.lastPosition.lng === newPosition.lng
    ) {
      return;
    }

    this.lastPosition = newPosition;

    this.callbacks.forEach((cb) => {
      try {
        cb(newPosition);
      } catch (_) {}
    });

    this._throttledUpdate(newPosition);
  }

  _throttledUpdate(position) {
    if (this._updateTimeout) clearTimeout(this._updateTimeout);

    this._updateTimeout = setTimeout(async () => {
      const now = Date.now();
      if (now - this._lastDbUpdate < this._dbInterval) return;
      this._lastDbUpdate = now;

      try {
        if (!supabaseService?.client) {
          console.warn('[LocationTracker] Supabase client no disponible');
          return;
        }

let choferId = supabaseService.getDriverId?.() || null;

if (!choferId) {
  const {
    data: { user }
  } = await supabaseService.client.auth.getUser();

  if (!user) {
    console.warn('[LocationTracker] No hay usuario autenticado');
    return;
  }

  const { data: chofer, error: choferError } = await supabaseService.client
    .from('choferes')
    .select('id_uuid')
    .eq('user_id', user.id)
    .maybeSingle();

  if (choferError) {
    console.error('[LocationTracker] Error obteniendo chofer.id_uuid:', choferError);
    return;
  }

  choferId = chofer?.id_uuid || null;
}

if (!choferId) {
  console.warn('[LocationTracker] No se encontró choferId');
  return;
}
        const nowIso = new Date().toISOString();

        // =====================================================
        // 1) update rápido en choferes
        // =====================================================
        const { error: choferUpdateError } = await supabaseService.client
          .from('choferes')
          .update({
            lat: position.lat,
            lng: position.lng,
            accuracy: position.accuracy,
            heading: position.heading,
            speed: position.speed,
            last_location_at: nowIso,
            last_seen_at: nowIso
          })
          .eq('user_id', user.id);

        if (choferUpdateError) {
          console.error('[LocationTracker] ❌ Error update choferes:', choferUpdateError);
        } else {
          console.log('[LocationTracker] ✅ Ubicación guardada en choferes');
        }

        // =====================================================
        // 2) obtener chofer.id_uuid
        // =====================================================
        const { data: chofer, error: choferError } = await supabaseService.client
          .from('choferes')
          .select('id_uuid')
          .eq('user_id', user.id)
          .maybeSingle();

        if (choferError) {
          console.error('[LocationTracker] ❌ Error obteniendo chofer.id_uuid:', choferError);
          return;
        }

        const choferId = chofer?.id_uuid || null;

        if (!choferId) {
          console.warn('[LocationTracker] No se encontró chofer.id_uuid para user_id:', user.id);
          return;
        }

        // =====================================================
        // 3) buscar viaje activo opcional
        // =====================================================
        let viajeId = null;

        const { data: viajeActivo, error: viajeError } = await supabaseService.client
          .from('viajes')
          .select('id')
          .eq('chofer_id_uuid', choferId)
          .in('estado', ['ASIGNADO', 'ACEPTADO', 'EN_CURSO'])
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (viajeError) {
          console.warn('[LocationTracker] Error buscando viaje activo:', viajeError);
        } else {
          viajeId = viajeActivo?.id || null;
        }

        // =====================================================
        // 4) decidir si insertar en viaje_tracking
        // =====================================================
        const shouldInsertTracking = this._shouldInsertTracking(position, now);

        if (!shouldInsertTracking) {
          console.log('[LocationTracker] ⏭️ Tracking omitido (sin movimiento relevante)');
          return;
        }

        const trackingPayload = {
          viaje_id: viajeId,
          chofer_id_uuid: choferId,
          lat: position.lat,
          lng: position.lng,
          heading: position.heading,
          speed: position.speed,
          accuracy: position.accuracy,
          timestamp: nowIso
        };

        const { error: trackingError } = await supabaseService.client
          .from('viaje_tracking')
          .insert(trackingPayload);

        if (trackingError) {
          console.error('[LocationTracker] ❌ Error insert viaje_tracking:', trackingError);
        } else {
          this._lastTrackingInsert = {
            lat: position.lat,
            lng: position.lng,
            timestampMs: now
          };
          console.log('[LocationTracker] ✅ Tracking insertado en viaje_tracking');
        }

      } catch (err) {
        console.error('[LocationTracker] ❌ Error update ubicación/tracking:', err);
      }
    }, 1500);
  }

  _shouldInsertTracking(position, nowMs) {
    if (!this._lastTrackingInsert) return true;

    const elapsed = nowMs - this._lastTrackingInsert.timestampMs;
    const distance = this._haversineMeters(
      this._lastTrackingInsert.lat,
      this._lastTrackingInsert.lng,
      position.lat,
      position.lng
    );

    if (distance >= this._minTrackingDistanceMeters) return true;
    if (elapsed >= this._maxTrackingSilenceMs) return true;

    return false;
  }

  _haversineMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = (deg) => (deg * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  _refreshPosition() {
    if (!this.isTracking) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => this._handlePosition(pos),
      (err) => console.warn('[LocationTracker] Refresh error:', err),
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 15000
      }
    );
  }

  _handleError(error) {
    if (error.code === 3) {
      console.warn('[LocationTracker] ⚠️ Timeout GPS (normal en PC/WiFi)');
      return;
    }

    console.error('[LocationTracker] Error GPS:', error.message);
  }

  _handleVisibilityChange() {
    const isHidden = document.hidden;

    if (this.updateInterval) clearInterval(this.updateInterval);

    this.updateInterval = setInterval(() => {
      this._refreshPosition();
    }, isHidden ? 60000 : (CONFIG.LOCATION_UPDATE_INTERVAL || 15000));

    if (!isHidden) this._refreshPosition();
  }

  stop() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    if (this._updateTimeout) clearTimeout(this._updateTimeout);

    this.isTracking = false;
    this.callbacks = [];
    this.lastPosition = null;
    this._lastTrackingInsert = null;
  }

  getLastPosition() {
    return this.lastPosition;
  }
}

export default new LocationTracker();
