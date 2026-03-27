/**
 * MIMI Driver - Main Application
 * Bootstraps all services and coordinates initialization
 */

class DriverApp {
  constructor() {
    this.initialized = false;
  }

  async start() {
    console.log('[App] Starting MIMI Driver...');

    try {
      // 1. Check auth
      if (!this._checkAuth()) {
        return;
      }

      // 2. Initialize Supabase
      const dbReady = await supabaseClient.initialize();
      if (!dbReady) {
        throw new Error('Database connection failed');
      }

      // 3. Initialize Map
      await mapService.init('map-container');

      // 4. Initialize Location
      await locationService.start((pos) => {
        mapService.updateDriverMarker(pos.lng, pos.lat, pos.heading);
        
        // Check arrival proximity
        this._checkProximity(pos);
      });

      // 5. Initialize Trip Manager
      await tripManager.initialize();

      // 6. Initialize UI
      uiController.initialize();

      // 7. Setup global error handling
      this._setupErrorHandling();

      this.initialized = true;
      console.log('[App] Ready');

    } catch (error) {
      console.error('[App] Fatal error:', error);
      this._showFatalError(error.message);
    }
  }

  _checkAuth() {
    const driverId = localStorage.getItem('mimi_driver_id');
    
    if (!driverId) {
      window.location.href = CONFIG.REDIRECTS.LOGIN;
      return false;
    }

    return true;
  }

  _checkProximity(position) {
    const state = stateManager.get('driver.status');
    const trip = stateManager.get('trip.current');
    
    if (!trip) return;

    let target;
    if (state === CONFIG.DRIVER_STATES.GOING_TO_PICKUP) {
      target = { lat: trip.origen_lat, lng: trip.origen_lng };
    } else if (state === CONFIG.DRIVER_STATES.IN_PROGRESS) {
      target = { lat: trip.destino_lat, lng: trip.destino_lng };
    } else {
      return;
    }

    const distance = this._calculateDistance(position, target);
    
    // Update UI distance
    const distanceEl = document.getElementById('nav-distance');
    if (distanceEl) {
      const formatted = distance < 1000 
        ? `${Math.round(distance)} m` 
        : `${(distance/1000).toFixed(1)} km`;
      distanceEl.textContent = formatted;
    }

    // Check arrival
    if (distance < 100 && state === CONFIG.DRIVER_STATES.IN_PROGRESS) {
      if (!stateManager.get('ui.arrivalShown')) {
        stateManager.set('ui.arrivalShown', true);
        stateManager.transitionDriver(CONFIG.DRIVER_STATES.ARRIVED);
      }
    }
  }

  _calculateDistance(pos1, pos2) {
    const R = 6371e3;
    const φ1 = pos1.lat * Math.PI / 180;
    const φ2 = pos2.lat * Math.PI / 180;
    const Δφ = (pos2.lat - pos1.lat) * Math.PI / 180;
    const Δλ = (pos2.lng - pos1.lng) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }

  _setupErrorHandling() {
    // Global error handler
    window.addEventListener('error', (e) => {
      console.error('[Global Error]', e.error);
      uiController._showToast('Error inesperado', 'error');
    });

    // Unhandled promise rejections
    window.addEventListener('unhandledrejection', (e) => {
      console.error('[Unhandled Rejection]', e.reason);
    });

    // Online/offline detection
    window.addEventListener('online', () => {
      document.getElementById('offline-banner')?.classList.remove('visible');
      uiController._showToast('Conexión restaurada', 'success');
    });

    window.addEventListener('offline', () => {
      document.getElementById('offline-banner')?.classList.add('visible');
    });
  }

  _showFatalError(message) {
    document.body.innerHTML = `
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100vh;
        padding: 20px;
        text-align: center;
        background: #000;
        color: #fff;
      ">
        <h1 style="margin-bottom: 16px;">⚠️ Error</h1>
        <p style="color: #888; margin-bottom: 24px;">${message}</p>
        <button onclick="location.reload()" style="
          padding: 16px 32px;
          background: #276EF1;
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 16px;
          cursor: pointer;
        ">
          Reintentar
        </button>
      </div>
    `;
  }
}

// Start app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new DriverApp();
  app.start();
});
