/**
 * MIMI Driver - UI Controller
 * Versión: Production Ready (Uber-style)
 * Features: GPS-Safe, Non-blocking, Full Animation Support
 */

import CONFIG from './config.js';

class UIController {
  constructor() {
    this.elements = {};
    this.state = {
      countdown: null,
      currentCount: 15,
      isModalOpen: false,
      isProcessing: false,
      callbacks: {}
    };
    
    // Bindings para mantener contexto
    this._handleAccept = this._handleAccept.bind(this);
    this._handleReject = this._handleReject.bind(this);
    this._onBackdropClick = this._onBackdropClick.bind(this);
  }

  /**
   * Inicialización completa del sistema de UI
   */
  init() {
    this._cacheElements();
    this._setupEventListeners();
    this._setupViewport();
    console.log('[UI] Controller initialized - Production Mode');
  }

  /**
   * Cache de elementos DOM
   */
  _cacheElements() {
    const selectors = {
      // Header & Profile
      'driver-name': 'driver-name',
      'driver-initial': 'driver-initial', 
      'status-dot': 'status-dot',
      'status-text': 'status-text',
      
      // Stats
      'stat-earnings': 'stat-earnings',
      'stat-trips': 'stat-trips',
      
      // FAB
      'fab-online': 'fab-online',
      'fab-text': 'fab-text',
      'fab-icon': 'fab-icon',
      
      // Modal de viaje entrante
      'incoming-modal': 'incoming-modal',
      'modal-backdrop': 'modal-backdrop',
      'trip-pickup': 'trip-pickup',
      'trip-dropoff': 'trip-dropoff',
      'trip-distance': 'trip-distance',
      'trip-price': 'trip-price',
      'trip-duration': 'trip-duration',
      'client-name': 'client-name',
      'client-phone': 'client-phone',
      'pickup-time': 'pickup-time',
      'countdown-number': 'countdown-number',
      'countdown-circle': 'countdown-circle',
      'btn-accept': 'btn-accept',
      'btn-reject': 'btn-reject',
      
      // Otros paneles
      'arrival-panel': 'arrival-panel',
      'toast-container': 'toast-container',
      'global-loading': 'global-loading',
      'bottom-sheet': 'bottom-sheet',
      'nav-bar': 'nav-bar'
    };

    Object.entries(selectors).forEach(([key, id]) => {
      this.elements[key] = document.getElementById(id);
    });
  }

  /**
   * Setup de event listeners - GPS Safe
   * Usa delegación específica sin bloquear el document
   */
  _setupEventListeners() {
    // Bind directo a botones (no document.addEventListener global)
    const acceptBtn = this.elements['btn-accept'];
    const rejectBtn = this.elements['btn-reject'];
    const backdrop = this.elements['modal-backdrop'];

    if (acceptBtn) {
      acceptBtn.addEventListener('click', this._handleAccept);
    }

    if (rejectBtn) {
      rejectBtn.addEventListener('click', this._handleReject);
    }

    // Cerrar al clickear backdrop (opcional UX)
    if (backdrop) {
      backdrop.addEventListener('click', this._onBackdropClick);
    }

    // Touch handling para mobile (prevenir scroll cuando modal abierto)
    const modal = this.elements['incoming-modal'];
    if (modal) {
      modal.addEventListener('touchmove', (e) => {
        if (this.state.isModalOpen && e.target === modal) {
          e.preventDefault();
        }
      }, { passive: false });
    }
  }

  /**
   * Handler de aceptación
   */
  async _handleAccept(e) {
    if (e) e.stopPropagation();
    
    if (!this.state.isModalOpen || this.state.isProcessing) return;
    
    console.log('[UI] Trip accepted');
    this.state.isProcessing = true;
    
    const callback = this.state.callbacks.onAccept;
    
    // Cerrar UI inmediatamente
    this._closeIncomingModal();
    
    // Ejecutar callback de forma no-bloqueante
    if (callback) {
      try {
        // Dar tiempo al browser para renderizar el cierre
        await new Promise(resolve => setTimeout(resolve, 50));
        const result = callback();
        if (result && typeof result.then === 'function') {
          result.catch(err => console.error('[UI] Async error in accept:', err));
        }
      } catch (err) {
        console.error('[UI] Error in accept callback:', err);
        this.showToast('Error al procesar aceptación', 'error');
      }
    }
    
    this.state.isProcessing = false;
  }

  /**
   * Handler de rechazo
   */
  async _handleReject(e) {
    if (e) e.stopPropagation();
    
    if (!this.state.isModalOpen || this.state.isProcessing) return;
    
    console.log('[UI] Trip rejected');
    this.state.isProcessing = true;
    
    const callback = this.state.callbacks.onReject;
    
    this._closeIncomingModal();
    
    if (callback) {
      try {
        await new Promise(resolve => setTimeout(resolve, 50));
        callback();
      } catch (err) {
        console.error('[UI] Error in reject callback:', err);
      }
    }
    
    this.state.isProcessing = false;
  }

  /**
   * Click en backdrop = rechazar (UX pattern estándar)
   */
  _onBackdropClick(e) {
    if (e.target === this.elements['modal-backdrop']) {
      this._handleReject();
    }
  }

  /**
   * Cierre limpio del modal
   */
  _closeIncomingModal() {
    if (!this.state.isModalOpen) return;
    
    console.log('[UI] Closing incoming modal');
    
    // Limpiar countdown
    if (this.state.countdown) {
      clearInterval(this.state.countdown);
      this.state.countdown = null;
    }
    
    // Cerrar con animación
    const modal = this.elements['incoming-modal'];
    if (modal) {
      modal.classList.remove('active');
      
      // Resetear después de la animación CSS
      setTimeout(() => {
        if (!this.state.isModalOpen) {
          // Resetear valores para próximo uso
          this._resetCountdownUI();
        }
      }, 300);
    }
    
    this.state.isModalOpen = false;
    this.state.callbacks = {};
  }

  /**
   * Reset de UI del countdown
   */
  _resetCountdownUI() {
    const circle = this.elements['countdown-circle'];
    const number = this.elements['countdown-number'];
    
    if (circle) {
      circle.style.strokeDashoffset = 283;
    }
    if (number) {
      number.textContent = '15';
    }
  }

  /**
   * Mostrar modal de viaje entrante (Uber-style)
   */
  showIncomingTrip(tripData, onAccept, onReject) {
    console.log('[UI] Showing incoming trip:', tripData?.id);
    
    // Si hay uno abierto, cerrarlo primero
    if (this.state.isModalOpen) {
      this._closeIncomingModal();
    }
    
    // Guardar callbacks
    this.state.callbacks = { onAccept, onReject };
    
    const modal = this.elements['incoming-modal'];
    if (!modal) {
      console.error('[UI] Modal element not found');
      return;
    }
    
    // Popular datos
    this._populateTripData(tripData);
    
    // Mostrar
    modal.classList.add('active');
    this.state.isModalOpen = true;
    this.state.currentCount = 15;
    
    // Iniciar countdown visual
    this._startCountdown();
    
    // Haptic feedback si está disponible (mobile)
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
    }
  }

  /**
   * Popular datos del viaje en la UI
   */
  _populateTripData(trip) {
    const data = {
      'trip-pickup': trip.origen || 'Origen no disponible',
      'trip-dropoff': trip.destino || 'Destino no disponible',
      'trip-distance': trip.distancia_km ? `${trip.distancia_km} km` : '-- km',
      'trip-price': trip.precio ? `$${trip.precio}` : '$--',
      'trip-duration': trip.duracion_min ? `${trip.duracion_min} min` : '-- min',
      'client-name': trip.cliente || 'Cliente',
      'client-phone': trip.telefono || 'Sin teléfono',
      'pickup-time': trip.duracion_min ? `${trip.duracion_min} min` : '-- min'
    };
    
    Object.entries(data).forEach(([key, value]) => {
      const el = this.elements[key];
      if (el) el.textContent = value;
    });
  }

  /**
   * Countdown visual con animación SVG
   */
  _startCountdown() {
    const circle = this.elements['countdown-circle'];
    const number = this.elements['countdown-number'];
    
    if (number) number.textContent = '15';
    if (circle) {
      circle.style.strokeDasharray = '283';
      circle.style.strokeDashoffset = '0';
    }
    
    this.state.countdown = setInterval(() => {
      this.state.currentCount--;
      
      if (number) {
        number.textContent = this.state.currentCount;
      }
      
      if (circle) {
        const offset = 283 - ((this.state.currentCount / 15) * 283);
        circle.style.strokeDashoffset = offset;
      }
      
      if (this.state.currentCount <= 0) {
        this._handleReject();
      }
    }, 1000);
  }

  /**
   * Force close (para cleanup)
   */
  closeIncomingModal() {
    this._closeIncomingModal();
  }

  /**
   * Toast notifications
   */
  showToast(message, type = 'info', duration = 3000) {
    const container = this.elements['toast-container'];
    if (!container) {
      console.log('[Toast]', message);
      return;
    }
    
    const toast = document.createElement('div');
    const icons = {
      info: 'ℹ️',
      success: '✅',
      error: '❌',
      warning: '⚠️'
    };
    
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
      background: rgba(28,28,30,0.95);
      border: 1px solid rgba(255,255,255,0.1);
      padding: 12px 16px;
      border-radius: 12px;
      margin-top: 8px;
      color: white;
      font-weight: 600;
      font-size: 14px;
      backdrop-filter: blur(10px);
      box-shadow: 0 8px 20px rgba(0,0,0,0.5);
      animation: slideDown 0.3s ease;
      display: flex;
      align-items: center;
      gap: 8px;
      z-index: 100000;
      position: relative;
    `;
    
    toast.textContent = `${icons[type] || icons.info} ${message}`;
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  /**
   * Actualizar estado del conductor
   */
  updateDriverState(mode, isOnline) {
    const dot = this.elements['status-dot'];
    const text = this.elements['status-text'];
    const fab = this.elements['fab-online'];
    const fabText = this.elements['fab-text'];
    const fabIcon = this.elements['fab-icon'];
    
    if (dot) {
      dot.classList.toggle('online', isOnline);
    }
    
    if (text) {
      text.textContent = isOnline ? 'Conectado' : 'Desconectado';
    }
    
    if (fab) {
      fab.classList.toggle('online', isOnline);
    }
    
    if (fabText) {
      fabText.textContent = isOnline ? 'DESCONECTAR' : 'CONECTAR';
    }
    
    if (fabIcon) {
      fabIcon.textContent = isOnline ? '🟢' : '🔴';
    }
    
    // Actualizar bottom sheet si existe
    this._updateBottomSheetState(isOnline);
  }

  /**
   * Actualizar contenido del bottom sheet según estado
   */
  _updateBottomSheetState(isOnline) {
    const sheetContent = document.getElementById('sheet-content');
    if (!sheetContent) return;
    
    if (isOnline) {
      sheetContent.innerHTML = `
        <div class="waiting-state">
          <div class="pulse-ring"></div>
          <h3>Conectado</h3>
          <p>Esperando viajes...</p>
        </div>
      `;
    } else {
      sheetContent.innerHTML = `
        <div class="waiting-state">
          <div class="pulse-ring" style="background: var(--color-text-tertiary)"></div>
          <h3>Estás desconectado</h3>
          <p>Toca "CONECTAR" para recibir viajes</p>
        </div>
      `;
    }
  }

  /**
   * Set profile del conductor
   */
  setDriverProfile(nameOrEmail) {
    const nameEl = this.elements['driver-name'];
    const initialEl = this.elements['driver-initial'];
    
    if (nameEl) {
      nameEl.textContent = nameOrEmail || 'Conductor';
    }
    
    if (initialEl) {
      const initial = (nameOrEmail || 'C').charAt(0).toUpperCase();
      initialEl.textContent = initial;
    }
  }

  /**
   * Loading global
   */
  setLoading(show, message = 'Cargando...') {
    const loading = this.elements['global-loading'];
    if (!loading) return;
    
    loading.classList.toggle('active', show);
    const text = loading.querySelector('.loading-text');
    if (text && message) text.textContent = message;
  }

  /**
   * Mostrar panel de llegada
   */
  showArrivalPanel() {
    const panel = this.elements['arrival-panel'];
    if (panel) panel.classList.add('active');
  }

  /**
   * Hide arrival panel
   */
  hideArrivalPanel() {
    const panel = this.elements['arrival-panel'];
    if (panel) panel.classList.remove('active');
  }

  /**
   * Setup viewport para mobile
   */
  _setupViewport() {
    const setVH = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    
    setVH();
    window.addEventListener('resize', setVH);
    
    // Detectar cambio de orientación
    window.addEventListener('orientationchange', () => {
      setTimeout(setVH, 100);
    });
  }
}

// Singleton export
const uiController = new UIController();
export default uiController;
