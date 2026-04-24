/**
 * MIMI Servicios - Panel Prestador 2026
 * Main entry point with Uber Driver-style UX
 */

import { 
  initState, 
  subscribe, 
  actions, 
  selectors,
  getDeviceId,
  STORAGE_KEYS 
} from './state/app-state.js';

// ============================================
// APP CONTROLLER
// ============================================

class MimiProviderApp {
  constructor() {
    this.state = null;
    this.unsubscribe = null;
    this.map = null;
    this.markers = {};
    this.bottomSheet = null;
    this.offerTimer = null;
    this.trackingInterval = null;
    this.notificationsInterval = null;
    
    // DOM Elements cache
    this.elements = {};
    
    // Touch handling for bottom sheet
    this.touchState = {
      startY: 0,
      currentY: 0,
      startHeight: 0,
      isDragging: false
    };
  }

  /**
   * Initialize the app
   */
  async init() {
    console.log('[MIMI] Initializing Provider App 2026...');
    
    // Initialize state
    initState();
    
    // Cache DOM elements
    this.cacheElements();
    
    // Subscribe to state changes
    this.unsubscribe = subscribe((state) => {
      this.state = state;
      this.render();
    });
    
    // Initialize UI
    this.initUI();
    
    // Initialize map
    this.initMap();
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Setup bottom sheet gestures
    this.setupBottomSheetGestures();
    
    // Check install prompt
    this.setupInstallPrompt();
    
    // Check location permission
    this.checkLocationPermission();
    
    // Start background sync
    this.startBackgroundSync();
    
    console.log('[MIMI] App initialized');
  }

  /**
   * Cache DOM elements
   */
  cacheElements() {
    this.elements = {
      // Header
      header: document.getElementById('header'),
      statusBadge: document.getElementById('statusBadge'),
      statusDot: document.getElementById('statusDot'),
      statusText: document.getElementById('statusText'),
      menuButton: document.getElementById('menuButton'),
      
      // Online button
      onlineButtonContainer: document.getElementById('onlineButtonContainer'),
      goOnlineButton: document.getElementById('goOnlineButton'),
      
      // Offer card
      offerCard: document.getElementById('offerCard'),
      offerTimer: document.getElementById('offerTimer'),
      offerService: document.getElementById('offerService'),
      offerLocation: document.getElementById('offerLocation'),
      offerClient: document.getElementById('offerClient'),
      offerPrice: document.getElementById('offerPrice'),
      acceptOffer: document.getElementById('acceptOffer'),
      rejectOffer: document.getElementById('rejectOffer'),
      
      // Active service
      activeServiceCard: document.getElementById('activeServiceCard'),
      serviceStatusBadge: document.getElementById('serviceStatusBadge'),
      activeServiceType: document.getElementById('activeServiceType'),
      activeServiceLocation: document.getElementById('activeServiceLocation'),
      activeServiceClient: document.getElementById('activeServiceClient'),
      serviceActionBtn: document.getElementById('serviceActionBtn'),
      
      // Distance alert
      distanceAlert: document.getElementById('distanceAlert'),
      alertTitle: document.getElementById('alertTitle'),
      alertText: document.getElementById('alertText'),
      alertAction: document.getElementById('alertAction'),
      
      // Bottom sheet
      bottomSheet: document.getElementById('bottomSheet'),
      sheetHandle: document.querySelector('.sheet-handle-container'),
      sheetStatus: document.getElementById('sheetStatus'),
      sheetStatusDot: document.getElementById('sheetStatusDot'),
      sheetStatusText: document.getElementById('sheetStatusText'),
      sheetInfo: document.getElementById('sheetInfo'),
      sheetUpcoming: document.getElementById('sheetUpcoming'),
      
      // Tabs
      tabButtons: document.querySelectorAll('.tab-btn'),
      tabPanels: document.querySelectorAll('.tab-panel'),
      
      // Status toggle
      statusToggleModern: document.getElementById('statusToggleModern'),
      
      // Quick actions
      quickNotifications: document.getElementById('quickNotifications'),
      quickChat: document.getElementById('quickChat'),
      quickSupport: document.getElementById('quickSupport'),
      notificationBadge: document.getElementById('notificationBadge'),
      chatBadge: document.getElementById('chatBadge'),
      
      // Scheduled list
      scheduledList: document.getElementById('scheduledList'),
      
      // Verification
      verificationCard: document.getElementById('verificationCard'),
      verificationStatus: document.getElementById('verificationStatus'),
      verificationBtn: document.getElementById('verificationBtn'),
      
      // Services chips
      servicesChips: document.getElementById('servicesChips'),
      
      // Stats
      statRating: document.getElementById('statRating'),
      statCompleted: document.getElementById('statCompleted'),
      statOffers: document.getElementById('statOffers'),
      
      // Drawer
      drawerOverlay: document.getElementById('drawerOverlay'),
      sideDrawer: document.getElementById('sideDrawer'),
      drawerClose: document.getElementById('drawerClose'),
      drawerAvatar: document.getElementById('drawerAvatar'),
      drawerInitials: document.getElementById('drawerInitials'),
      drawerName: document.getElementById('drawerName'),
      drawerEmail: document.getElementById('drawerEmail'),
      drawerRating: document.getElementById('drawerRating'),
      drawerServices: document.getElementById('drawerServices'),
      drawerEarnings: document.getElementById('drawerEarnings'),
      logoutBtn: document.getElementById('logoutBtn'),
      
      // Notifications drawer
      notificationsDrawer: document.getElementById('notificationsDrawer'),
      notificationsList: document.getElementById('notificationsList'),
      markAllRead: document.getElementById('markAllRead'),
      
      // Chat drawer
      chatDrawer: document.getElementById('chatDrawer'),
      chatClose: document.getElementById('chatClose'),
      chatMessages: document.getElementById('chatMessages'),
      chatInput: document.getElementById('chatInput'),
      chatSend: document.getElementById('chatSend'),
      
      // Modal
      verificationModal: document.getElementById('verificationModal'),
      modalClose: document.getElementById('modalClose'),
      wizardProgress: document.getElementById('wizardProgress'),
      wizardNext: document.getElementById('wizardNext'),
      wizardPrev: document.getElementById('wizardPrev'),
      
      // Toast
      toastContainer: document.getElementById('toastContainer'),
      
      // Install
      installBanner: document.getElementById('installBanner'),
      installBtn: document.getElementById('installBtn'),
      installDismiss: document.getElementById('installDismiss'),
      
      // Map
      mapContainer: document.getElementById('mapContainer'),
      map: document.getElementById('map'),
      mapFallback: document.getElementById('mapFallback')
    };
  }

  /**
   * Initialize UI state
   */
  initUI() {
    // Set initial bottom sheet state
    this.setBottomSheetState('peek');
    
    // Load scheduled services
    this.renderScheduledServices();
    
    // Load verification status
    this.renderVerificationStatus();
    
    // Load stats
    this.renderStats();
  }

  /**
   * Initialize map
   */
  initMap() {
    try {
      // Check if maplibre is available
      if (!window.maplibregl) {
        console.warn('[MIMI] MapLibre not available');
        this.showMapFallback();
        return;
      }

      const defaultCenter = [-64.1888, -31.4201]; // Córdoba, Argentina
      
      this.map = new window.maplibregl.Map({
        container: 'map',
        style: {
          version: 8,
          sources: {
            osm: {
              type: 'raster',
              tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256,
              attribution: '&copy; OpenStreetMap contributors'
            }
          },
          layers: [{
            id: 'osm',
            type: 'raster',
            source: 'osm'
          }]
        },
        center: defaultCenter,
        zoom: 14,
        attributionControl: false
      });

      this.map.on('load', () => {
        console.log('[MIMI] Map loaded');
        actions.setMapReady(true);
        
        // Try to get current position
        this.updateMapToCurrentPosition();
      });

      this.map.on('error', (e) => {
        console.error('[MIMI] Map error:', e);
        this.showMapFallback();
      });

    } catch (error) {
      console.error('[MIMI] Map init error:', error);
      this.showMapFallback();
    }
  }

  /**
   * Show map fallback
   */
  showMapFallback() {
    this.elements.map.hidden = true;
    this.elements.mapFallback.hidden = false;
  }

  /**
   * Update map to current position
   */
  updateMapToCurrentPosition() {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        
        if (this.map) {
          this.map.setCenter([longitude, latitude]);
          
          // Add or update provider marker
          this.updateProviderMarker(latitude, longitude);
        }
        
        actions.setLocation({
          lat: latitude,
          lng: longitude,
          accuracy: position.coords.accuracy,
          timestamp: Date.now()
        });
      },
      (error) => {
        console.warn('[MIMI] Geolocation error:', error);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  /**
   * Update provider marker on map
   */
  updateProviderMarker(lat, lng) {
    if (!this.map) return;

    // Remove existing marker
    if (this.markers.provider) {
      this.markers.provider.remove();
    }

    // Create marker element
    const el = document.createElement('div');
    el.className = 'provider-marker';
    el.style.cssText = `
      width: 24px;
      height: 24px;
      background: #30d158;
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;

    this.markers.provider = new window.maplibregl.Marker({ element: el })
      .setLngLat([lng, lat])
      .addTo(this.map);
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Online button
    this.elements.goOnlineButton?.addEventListener('click', () => {
      this.handleGoOnline();
    });

    // Menu button
    this.elements.menuButton?.addEventListener('click', () => {
      actions.toggleDrawer();
    });

    // Drawer close
    this.elements.drawerClose?.addEventListener('click', () => {
      actions.closeDrawer();
    });

    this.elements.drawerOverlay?.addEventListener('click', () => {
      actions.closeDrawer();
    });

    // Tab buttons
    this.elements.tabButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.target.dataset.tab;
        this.switchTab(tab);
      });
    });

    // Status toggle
    this.elements.statusToggleModern?.addEventListener('click', (e) => {
      const option = e.target.closest('.toggle-option');
      if (option) {
        const status = option.dataset.status;
        this.handleStatusToggle(status);
      }
    });

    // Quick actions
    this.elements.quickNotifications?.addEventListener('click', () => {
      actions.toggleNotifications();
    });

    this.elements.quickChat?.addEventListener('click', () => {
      actions.toggleChat();
    });

    this.elements.quickSupport?.addEventListener('click', () => {
      this.showToast('Soporte disponible próximamente', 'info');
    });

    // Notification drawer
    this.elements.markAllRead?.addEventListener('click', () => {
      actions.markNotificationsRead();
      this.showToast('Notificaciones marcadas como leídas', 'success');
    });

    // Chat
    this.elements.chatClose?.addEventListener('click', () => {
      actions.closeChat();
    });

    this.elements.chatSend?.addEventListener('click', () => {
      this.sendChatMessage();
    });

    this.elements.chatInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.sendChatMessage();
    });

    // Offer actions
    this.elements.acceptOffer?.addEventListener('click', () => {
      this.handleAcceptOffer();
    });

    this.elements.rejectOffer?.addEventListener('click', () => {
      this.handleRejectOffer();
    });

    // Service action
    this.elements.serviceActionBtn?.addEventListener('click', () => {
      this.handleServiceAction();
    });

    // Verification
    this.elements.verificationBtn?.addEventListener('click', () => {
      actions.openModal('verification');
    });

    // Modal
    this.elements.modalClose?.addEventListener('click', () => {
      actions.closeModal();
    });

    this.elements.wizardNext?.addEventListener('click', () => {
      this.handleWizardNext();
    });

    this.elements.wizardPrev?.addEventListener('click', () => {
      this.handleWizardPrev();
    });

    // Logout
    this.elements.logoutBtn?.addEventListener('click', () => {
      this.handleLogout();
    });

    // Install banner
    this.elements.installBtn?.addEventListener('click', () => {
      this.handleInstall();
    });

    this.elements.installDismiss?.addEventListener('click', () => {
      this.elements.installBanner.hidden = true;
    });

    // Drawer links
    document.getElementById('linkProfile')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.showToast('Perfil - próximamente', 'info');
    });

    document.getElementById('linkDocuments')?.addEventListener('click', (e) => {
      e.preventDefault();
      actions.openModal('verification');
      actions.closeDrawer();
    });

    document.getElementById('linkServices')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.switchTab('account');
      actions.closeDrawer();
    });

    document.getElementById('linkEarnings')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.showToast('Ganancias - próximamente', 'info');
    });

    document.getElementById('linkSettings')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.showToast('Configuración - próximamente', 'info');
    });

    document.getElementById('linkSupport')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.showToast('Soporte - próximamente', 'info');
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.state?.ui.drawerOpen) actions.closeDrawer();
        if (this.state?.ui.notificationDrawerOpen) actions.closeNotifications();
        if (this.state?.ui.chatDrawerOpen) actions.closeChat();
        if (this.state?.ui.modalOpen) actions.closeModal();
      }
    });

    // Visibility change (background/foreground)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.onAppForeground();
      } else {
        this.onAppBackground();
      }
    });

    // Online/offline
    window.addEventListener('online', () => {
      this.showToast('Conexión restaurada', 'success');
    });

    window.addEventListener('offline', () => {
      this.showToast('Sin conexión - modo offline', 'warning');
    });
  }

  /**
   * Setup bottom sheet gestures
   */
  setupBottomSheetGestures() {
    const handle = this.elements.sheetHandle;
    const sheet = this.elements.bottomSheet;
    
    if (!handle || !sheet) return;

    const onTouchStart = (e) => {
      this.touchState.isDragging = true;
      this.touchState.startY = e.touches?.[0]?.clientY || e.clientY;
      this.touchState.startHeight = sheet.offsetHeight;
      sheet.style.transition = 'none';
    };

    const onTouchMove = (e) => {
      if (!this.touchState.isDragging) return;
      
      const clientY = e.touches?.[0]?.clientY || e.clientY;
      const delta = this.touchState.startY - clientY;
      
      // Determine direction and update sheet position
      if (delta > 50) {
        // Dragging up
        sheet.classList.add('expanded');
        sheet.classList.remove('collapsed');
      } else if (delta < -50) {
        // Dragging down
        if (sheet.classList.contains('expanded')) {
          sheet.classList.remove('expanded');
        } else {
          sheet.classList.add('collapsed');
        }
      }
    };

    const onTouchEnd = () => {
      this.touchState.isDragging = false;
      sheet.style.transition = '';
    };

    handle.addEventListener('touchstart', onTouchStart, { passive: true });
    handle.addEventListener('mousedown', onTouchStart);
    
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('mousemove', onTouchMove);
    
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('mouseup', onTouchEnd);
  }

  /**
   * Set bottom sheet state
   */
  setBottomSheetState(state) {
    const sheet = this.elements.bottomSheet;
    if (!sheet) return;

    sheet.classList.remove('collapsed', 'expanded');
    
    switch (state) {
      case 'collapsed':
        sheet.classList.add('collapsed');
        break;
      case 'peek':
        // Default state
        break;
      case 'expanded':
        sheet.classList.add('expanded');
        break;
    }
    
    actions.setBottomSheetState(state);
  }

  /**
   * Switch tab
   */
  switchTab(tab) {
    // Update buttons
    this.elements.tabButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    
    // Update panels
    this.elements.tabPanels.forEach(panel => {
      panel.classList.toggle('active', panel.id === `tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
    });
    
    actions.setTab(tab);
  }

  /**
   * Handle go online button
   */
  handleGoOnline() {
    // Check if verified
    if (!this.state?.provider.isVerified) {
      this.showToast('Necesitás completar tu verificación primero', 'warning');
      actions.openModal('verification');
      return;
    }

    // Set online status
    actions.setProviderStatus('ONLINE_IDLE');
    actions.setBottomSheetState('peek');
    this.showToast('Estás online - recibiendo servicios', 'success');
    
    // Request location
    this.startLocationTracking();
  }

  /**
   * Handle status toggle
   */
  handleStatusToggle(status) {
    if (status === 'ONLINE_IDLE' && !this.state?.provider.isVerified) {
      this.showToast('Necesitás completar tu verificación', 'warning');
      actions.openModal('verification');
      return;
    }

    actions.setProviderStatus(status);
    
    if (status === 'ONLINE_IDLE') {
      this.showToast('Estás online', 'success');
      this.startLocationTracking();
    } else {
      this.showToast('Estás offline', 'info');
      this.stopLocationTracking();
    }
  }

  /**
   * Start location tracking
   */
  startLocationTracking() {
    if (!navigator.geolocation) return;
    
    actions.setTracking(true);
    
    this.trackingInterval = setInterval(() => {
      this.updateMapToCurrentPosition();
    }, 30000); // Every 30 seconds
  }

  /**
   * Stop location tracking
   */
  stopLocationTracking() {
    actions.setTracking(false);
    
    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
      this.trackingInterval = null;
    }
  }

  /**
   * Check location permission
   */
  async checkLocationPermission() {
    if (!navigator.permissions) return;
    
    try {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      actions.setLocationPermission(result.state);
      
      result.addEventListener('change', () => {
        actions.setLocationPermission(result.state);
      });
    } catch (error) {
      console.warn('[MIMI] Permission check error:', error);
    }
  }

  /**
   * Handle accept offer
   */
  handleAcceptOffer() {
    if (!this.state?.activeOffer) return;

    // Create active service from offer
    const service = {
      id: this.state.activeOffer.id,
      requestId: this.state.activeOffer.requestId,
      status: 'ACCEPTED',
      serviceType: this.state.activeOffer.serviceType,
      clientName: this.state.activeOffer.clientName,
      location: this.state.activeOffer.location,
      price: this.state.activeOffer.price,
      startedAt: Date.now()
    };

    actions.setActiveService(service);
    actions.clearActiveOffer();
    actions.setProviderStatus('BOOKED_UPCOMING');
    
    this.showToast('¡Servicio aceptado!', 'success');
    
    // Clear timer
    if (this.offerTimer) {
      clearInterval(this.offerTimer);
      this.offerTimer = null;
    }
  }

  /**
   * Handle reject offer
   */
  handleRejectOffer() {
    actions.clearActiveOffer();
    this.showToast('Oferta rechazada', 'info');
    
    // Clear timer
    if (this.offerTimer) {
      clearInterval(this.offerTimer);
      this.offerTimer = null;
    }
  }

  /**
   * Handle service action button
   */
  handleServiceAction() {
    const service = this.state?.activeService;
    if (!service) return;

    const statusFlow = {
      'ACCEPTED': { next: 'EN_ROUTE', text: 'En camino', btn: 'Llegué al domicilio' },
      'EN_ROUTE': { next: 'ARRIVED', text: 'Llegaste', btn: 'Iniciar servicio' },
      'ARRIVED': { next: 'IN_PROGRESS', text: 'Servicio iniciado', btn: 'Finalizar servicio' },
      'IN_PROGRESS': { next: 'COMPLETED', text: 'Servicio completado', btn: null }
    };

    const current = statusFlow[service.status];
    if (!current) return;

    if (current.next === 'COMPLETED') {
      // Complete service
      actions.clearActiveService();
      actions.setProviderStatus('ONLINE_IDLE');
      this.showToast('Servicio completado', 'success');
      
      // Update stats
      const completed = (this.state?.provider.stats.completedServices || 0) + 1;
      actions.updateState({
        provider: {
          ...this.state.provider,
          stats: { ...this.state.provider.stats, completedServices: completed }
        }
      });
    } else {
      // Advance status
      actions.updateServiceStatus(current.next);
      this.showToast(current.text, 'success');
    }
  }

  /**
   * Send chat message
   */
  sendChatMessage() {
    const input = this.elements.chatInput;
    const text = input?.value.trim();
    
    if (!text) return;

    const message = {
      id: Date.now(),
      text,
      type: 'outgoing',
      timestamp: Date.now()
    };

    actions.addMessage(message);
    input.value = '';
    
    this.renderChatMessages();

    // Simulate reply (for demo)
    setTimeout(() => {
      const reply = {
        id: Date.now() + 1,
        text: 'Mensaje recibido. Gracias.',
        type: 'incoming',
        timestamp: Date.now()
      };
      actions.addMessage(reply);
      this.renderChatMessages();
    }, 2000);
  }

  /**
   * Render chat messages
   */
  renderChatMessages() {
    const container = this.elements.chatMessages;
    if (!container) return;

    const messages = this.state?.chat.messages || [];
    
    container.innerHTML = messages.map(msg => `
      <div class="chat-message ${msg.type}">
        ${msg.text}
        <div class="chat-message-time">
          ${new Date(msg.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    `).join('');
    
    container.scrollTop = container.scrollHeight;
  }

  /**
   * Render scheduled services
   */
  renderScheduledServices() {
    const container = this.elements.scheduledList;
    if (!container) return;

    const services = this.state?.scheduledServices || [];
    
    if (services.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>No tenés servicios programados</p>
        </div>
      `;
      return;
    }

    container.innerHTML = services.map(service => `
      <div class="scheduled-item" data-id="${service.id}">
        <div class="scheduled-time">
          ${new Date(service.scheduledFor).toLocaleString('es-AR', { 
            weekday: 'short', 
            day: 'numeric', 
            hour: '2-digit', 
            minute: '2-digit' 
          })}
        </div>
        <div class="scheduled-service">${service.serviceType}</div>
        <div class="scheduled-location">${service.location}</div>
        <div class="scheduled-meta">
          <span class="scheduled-price">$${service.price?.toLocaleString('es-AR') || 'A convenir'}</span>
          <span class="scheduled-distance">${service.distance || ''}</span>
        </div>
        <div class="scheduled-actions">
          <button class="scheduled-btn" onclick="app.showServiceDetail('${service.id}')">Ver detalle</button>
          <button class="scheduled-btn primary" onclick="app.prepareService('${service.id}')">Preparar</button>
        </div>
      </div>
    `).join('');
  }

  /**
   * Render verification status
   */
  renderVerificationStatus() {
    const status = this.state?.provider.verificationStatus;
    const card = this.elements.verificationCard;
    const statusEl = this.elements.verificationStatus;
    const btn = this.elements.verificationBtn;
    
    if (!card || !statusEl || !btn) return;

    if (status === 'approved') {
      card.classList.add('verified');
      statusEl.innerHTML = '<span class="status-icon">✅</span><span class="status-text">Verificado</span>';
      btn.textContent = 'Ver documentos';
    } else if (status === 'in_review') {
      statusEl.innerHTML = '<span class="status-icon">⏳</span><span class="status-text">En revisión</span>';
      btn.textContent = 'Ver progreso';
    } else {
      statusEl.innerHTML = '<span class="status-icon">⚠️</span><span class="status-text">Pendiente</span>';
      btn.textContent = 'Completar ahora';
    }
  }

  /**
   * Render stats
   */
  renderStats() {
    const stats = this.state?.provider.stats;
    if (!stats) return;

    if (this.elements.statRating) {
      this.elements.statRating.textContent = stats.rating.toFixed(1);
    }
    if (this.elements.statCompleted) {
      this.elements.statCompleted.textContent = stats.completedServices;
    }
    if (this.elements.statOffers) {
      this.elements.statOffers.textContent = stats.totalOffers;
    }
    
    // Drawer stats
    if (this.elements.drawerRating) {
      this.elements.drawerRating.textContent = stats.rating.toFixed(1);
    }
    if (this.elements.drawerServices) {
      this.elements.drawerServices.textContent = stats.completedServices;
    }
    if (this.elements.drawerEarnings) {
      this.elements.drawerEarnings.textContent = `$${(stats.earnings || 0).toLocaleString('es-AR')}`;
    }
  }

  /**
   * Main render function
   */
  render() {
    if (!this.state) return;

    this.renderHeader();
    this.renderOnlineButton();
    this.renderOfferCard();
    this.renderActiveService();
    this.renderBottomSheet();
    this.renderDrawer();
    this.renderNotifications();
    this.renderChat();
    this.renderModal();
  }

  /**
   * Render header
   */
  renderHeader() {
    const status = this.state.provider.status;
    const isOnline = status !== 'OFFLINE';

    // Status badge
    if (this.elements.statusBadge) {
      this.elements.statusBadge.textContent = isOnline ? 'ONLINE' : 'OFFLINE';
      this.elements.statusBadge.classList.toggle('online', isOnline);
    }

    // Status dot
    if (this.elements.statusDot) {
      this.elements.statusDot.classList.toggle('online', isOnline);
    }

    // Status text
    if (this.elements.statusText) {
      const statusLabels = {
        'OFFLINE': 'Desconectado',
        'ONLINE_IDLE': 'Online - Esperando',
        'INVITED': 'Nueva oferta',
        'BOOKED_UPCOMING': 'Servicio reservado',
        'EN_ROUTE': 'En camino',
        'ARRIVED': 'En destino',
        'IN_SERVICE': 'En servicio'
      };
      this.elements.statusText.textContent = statusLabels[status] || 'Desconectado';
    }
  }

  /**
   * Render online button
   */
  renderOnlineButton() {
    const isOffline = this.state.provider.status === 'OFFLINE';
    const hasActiveService = !!this.state.activeService;
    
    if (this.elements.onlineButtonContainer) {
      this.elements.onlineButtonContainer.classList.toggle('hidden', !isOffline || hasActiveService);
    }
  }

  /**
   * Render offer card
   */
  renderOfferCard() {
    const offer = this.state.activeOffer;
    
    if (!offer) {
      if (this.elements.offerCard) this.elements.offerCard.hidden = true;
      return;
    }

    if (this.elements.offerCard) {
      this.elements.offerCard.hidden = false;
      
      if (this.elements.offerService) {
        this.elements.offerService.textContent = offer.serviceType;
      }
      if (this.elements.offerLocation) {
        this.elements.offerLocation.textContent = offer.location;
      }
      if (this.elements.offerClient) {
        this.elements.offerClient.textContent = `Cliente: ${offer.clientName}`;
      }
      if (this.elements.offerPrice) {
        this.elements.offerPrice.textContent = offer.price 
          ? `$${offer.price.toLocaleString('es-AR')} estimado`
          : 'Precio a convenir';
      }
    }

    // Start countdown timer
    this.startOfferTimer(offer);
  }

  /**
   * Start offer timer
   */
  startOfferTimer(offer) {
    if (this.offerTimer) {
      clearInterval(this.offerTimer);
    }

    const updateTimer = () => {
      if (!this.state?.activeOffer) {
        clearInterval(this.offerTimer);
        return;
      }

      const expiresAt = new Date(offer.expiresAt).getTime();
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));

      if (this.elements.offerTimer) {
        this.elements.offerTimer.textContent = `${remaining}s`;
      }

      if (remaining <= 0) {
        actions.clearActiveOffer();
        clearInterval(this.offerTimer);
        this.showToast('La oferta expiró', 'warning');
      }
    };

    updateTimer();
    this.offerTimer = setInterval(updateTimer, 1000);
  }

  /**
   * Render active service
   */
  renderActiveService() {
    const service = this.state.activeService;
    
    if (!service) {
      if (this.elements.activeServiceCard) this.elements.activeServiceCard.hidden = true;
      return;
    }

    if (this.elements.activeServiceCard) {
      this.elements.activeServiceCard.hidden = false;
      
      // Status badge
      const statusLabels = {
        'ACCEPTED': 'Aceptado',
        'EN_ROUTE': 'En camino',
        'ARRIVED': 'Llegaste',
        'IN_PROGRESS': 'En curso'
      };
      
      if (this.elements.serviceStatusBadge) {
        this.elements.serviceStatusBadge.textContent = statusLabels[service.status] || service.status;
      }
      
      if (this.elements.activeServiceType) {
        this.elements.activeServiceType.textContent = service.serviceType;
      }
      if (this.elements.activeServiceLocation) {
        this.elements.activeServiceLocation.textContent = service.location;
      }
      if (this.elements.activeServiceClient) {
        this.elements.activeServiceClient.textContent = service.clientName;
      }
      
      // Button text
      const buttonLabels = {
        'ACCEPTED': 'Llegué al domicilio',
        'EN_ROUTE': 'Llegué al domicilio',
        'ARRIVED': 'Iniciar servicio',
        'IN_PROGRESS': 'Finalizar servicio'
      };
      
      if (this.elements.serviceActionBtn) {
        this.elements.serviceActionBtn.textContent = buttonLabels[service.status] || 'Acción';
      }
    }
  }

  /**
   * Render bottom sheet
   */
  renderBottomSheet() {
    const isOnline = this.state.provider.status !== 'OFFLINE';
    
    // Sheet status
    if (this.elements.sheetStatusDot) {
      this.elements.sheetStatusDot.classList.toggle('online', isOnline);
      this.elements.sheetStatusDot.classList.toggle('offline', !isOnline);
    }
    
    if (this.elements.sheetStatusText) {
      this.elements.sheetStatusText.textContent = isOnline ? 'Online' : 'Offline';
    }

    // Status toggle
    this.elements.statusToggleModern?.querySelectorAll('.toggle-option').forEach(btn => {
      btn.classList.toggle('active', 
        (btn.dataset.status === 'ONLINE_IDLE' && isOnline) ||
        (btn.dataset.status === 'OFFLINE' && !isOnline)
      );
    });

    // Badges
    if (this.elements.notificationBadge) {
      this.elements.notificationBadge.textContent = this.state.notifications.unreadCount;
      this.elements.notificationBadge.hidden = this.state.notifications.unreadCount === 0;
    }
    
    if (this.elements.chatBadge) {
      this.elements.chatBadge.textContent = this.state.chat.unreadCount;
      this.elements.chatBadge.hidden = this.state.chat.unreadCount === 0;
    }
  }

  /**
   * Render drawer
   */
  renderDrawer() {
    const isOpen = this.state.ui.drawerOpen;
    
    if (this.elements.sideDrawer) {
      this.elements.sideDrawer.classList.toggle('open', isOpen);
      this.elements.sideDrawer.setAttribute('aria-hidden', !isOpen);
    }
    
    if (this.elements.drawerOverlay) {
      this.elements.drawerOverlay.hidden = !isOpen;
    }

    // User info
    if (this.state.session.userName && this.elements.drawerName) {
      this.elements.drawerName.textContent = this.state.session.userName;
    }
    if (this.state.session.userEmail && this.elements.drawerEmail) {
      this.elements.drawerEmail.textContent = this.state.session.userEmail;
    }
    if (this.state.session.userName && this.elements.drawerInitials) {
      const initials = this.state.session.userName
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
      this.elements.drawerInitials.textContent = initials;
    }
  }

  /**
   * Render notifications
   */
  renderNotifications() {
    const isOpen = this.state.ui.notificationDrawerOpen;
    
    if (this.elements.notificationsDrawer) {
      this.elements.notificationsDrawer.classList.toggle('open', isOpen);
      this.elements.notificationsDrawer.setAttribute('aria-hidden', !isOpen);
    }

    // Render list
    const items = this.state.notifications.items || [];
    if (this.elements.notificationsList) {
      if (items.length === 0) {
        this.elements.notificationsList.innerHTML = `
          <div class="empty-state">
            <p>No tenés notificaciones</p>
          </div>
        `;
      } else {
        this.elements.notificationsList.innerHTML = items.map(item => `
          <div class="notification-item ${item.unread ? 'unread' : ''}">
            <div class="notification-icon">${item.icon || '🔔'}</div>
            <div class="notification-content">
              <div class="notification-title">${item.title}</div>
              <div class="notification-text">${item.text}</div>
              <div class="notification-time">${new Date(item.timestamp).toLocaleString('es-AR')}</div>
            </div>
          </div>
        `).join('');
      }
    }
  }

  /**
   * Render chat
   */
  renderChat() {
    const isOpen = this.state.ui.chatDrawerOpen;
    
    if (this.elements.chatDrawer) {
      this.elements.chatDrawer.classList.toggle('open', isOpen);
      this.elements.chatDrawer.setAttribute('aria-hidden', !isOpen);
    }

    if (isOpen) {
      this.renderChatMessages();
    }
  }

  /**
   * Render modal
   */
  renderModal() {
    const isOpen = this.state.ui.modalOpen;
    const modal = this.state.ui.currentModal;
    
    if (this.elements.verificationModal) {
      this.elements.verificationModal.hidden = !isOpen || modal !== 'verification';
    }
  }

  /**
   * Show toast notification
   */
  showToast(message, type = 'info') {
    const container = this.elements.toastContainer;
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    // Remove after 3 seconds
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-20px)';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  /**
   * Setup install prompt
   */
  setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      actions.updateState({ ui: { installPrompt: e } });
      
      // Show banner after 2 seconds
      setTimeout(() => {
        if (this.elements.installBanner) {
          this.elements.installBanner.hidden = false;
        }
      }, 2000);
    });

    window.addEventListener('appinstalled', () => {
      actions.updateState({ ui: { installPrompt: null } });
      if (this.elements.installBanner) {
        this.elements.installBanner.hidden = true;
      }
      this.showToast('App instalada correctamente', 'success');
    });
  }

  /**
   * Handle install
   */
  async handleInstall() {
    const prompt = this.state?.ui.installPrompt;
    if (!prompt) return;

    prompt.prompt();
    const result = await prompt.userChoice;
    
    if (result.outcome === 'accepted') {
      this.showToast('Instalando app...', 'success');
    }
    
    actions.updateState({ ui: { installPrompt: null } });
  }

  /**
   * Start background sync
   */
  startBackgroundSync() {
    // Simulate receiving offers (for demo)
    setInterval(() => {
      if (this.state?.provider.status === 'ONLINE_IDLE' && !this.state?.activeOffer && !this.state?.activeService) {
        // 10% chance every 30 seconds to receive an offer
        if (Math.random() < 0.1) {
          this.simulateOffer();
        }
      }
    }, 30000);

    // Check distance alerts for scheduled services
    setInterval(() => {
      this.checkDistanceAlerts();
    }, 60000);
  }

  /**
   * Simulate receiving an offer (demo)
   */
  simulateOffer() {
    const services = ['Plomería', 'Electricidad', 'Limpieza', 'Gasista', 'Jardinería'];
    const locations = ['Nueva Córdoba', 'Alberdi', 'General Paz', 'Centro', 'Cerro de las Rosas'];
    
    const offer = {
      id: `offer_${Date.now()}`,
      requestId: `req_${Date.now()}`,
      serviceType: services[Math.floor(Math.random() * services.length)],
      clientName: ['María', 'Juan', 'Laura', 'Carlos', 'Ana'][Math.floor(Math.random() * 5)],
      location: locations[Math.floor(Math.random() * locations.length)],
      price: [12000, 15000, 8000, 20000, 10000][Math.floor(Math.random() * 5)],
      expiresAt: new Date(Date.now() + 15000).toISOString(),
      createdAt: new Date().toISOString()
    };

    actions.setActiveOffer(offer);
    actions.setProviderStatus('INVITED');
    
    // Show notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Nueva solicitud de servicio', {
        body: `${offer.serviceType} · ${offer.location}`,
        icon: '/assets/icon-192.png',
        badge: '/assets/icon-96.png',
        tag: offer.id,
        requireInteraction: true
      });
    }

    // Play sound (if available)
    this.playNotificationSound();
  }

  /**
   * Play notification sound
   */
  playNotificationSound() {
    try {
      const audio = new Audio('/assets/notification.mp3');
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch (e) {
      // Ignore audio errors
    }
  }

  /**
   * Check distance alerts
   */
  checkDistanceAlerts() {
    const scheduled = this.state?.scheduledServices || [];
    const now = Date.now();
    
    scheduled.forEach(service => {
      const serviceTime = new Date(service.scheduledFor).getTime();
      const timeUntil = serviceTime - now;
      
      // If service is within 1 hour
      if (timeUntil > 0 && timeUntil < 60 * 60 * 1000) {
        this.showDistanceAlert(service);
      }
    });
  }

  /**
   * Show distance alert
   */
  showDistanceAlert(service) {
    if (this.elements.distanceAlert) {
      this.elements.distanceAlert.hidden = false;
      
      if (this.elements.alertTitle) {
        this.elements.alertTitle.textContent = 'Servicio próximo';
      }
      if (this.elements.alertText) {
        this.elements.alertText.textContent = `${service.serviceType} · ${new Date(service.scheduledFor).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
      }
    }

    // Auto hide after 10 seconds
    setTimeout(() => {
      if (this.elements.distanceAlert) {
        this.elements.distanceAlert.hidden = true;
      }
    }, 10000);
  }

  /**
   * On app foreground
   */
  onAppForeground() {
    console.log('[MIMI] App in foreground');
    
    // Refresh location
    this.updateMapToCurrentPosition();
    
    // Check if offer expired
    if (this.state?.activeOffer && !isOfferValid(this.state.activeOffer)) {
      actions.clearActiveOffer();
    }
  }

  /**
   * On app background
   */
  onAppBackground() {
    console.log('[MIMI] App in background');
    // State is persisted automatically
  }

  /**
   * Handle logout
   */
  handleLogout() {
    if (confirm('¿Seguro que querés cerrar sesión?')) {
      localStorage.removeItem(STORAGE_KEYS.SESSION);
      actions.clearSession();
      window.location.href = '/index.html';
    }
  }

  /**
   * Handle wizard next
   */
  handleWizardNext() {
    const progress = this.state?.provider.verificationProgress || 0;
    const newProgress = Math.min(100, progress + 25);
    
    actions.setVerificationProgress(newProgress);
    
    // Update UI
    if (this.elements.wizardProgress) {
      this.elements.wizardProgress.style.width = `${newProgress}%`;
    }
    
    // Show next step
    const currentStep = Math.floor(progress / 25) + 1;
    document.querySelectorAll('.wizard-step').forEach((step, index) => {
      step.classList.toggle('active', index === currentStep);
    });
    
    // If complete
    if (newProgress >= 100) {
      actions.setVerificationStatus('in_review');
      setTimeout(() => {
        actions.closeModal();
        this.showToast('Verificación enviada', 'success');
      }, 1500);
    }
  }

  /**
   * Handle wizard prev
   */
  handleWizardPrev() {
    // Not implemented for simplicity
  }

  /**
   * Show service detail
   */
  showServiceDetail(id) {
    this.showToast(`Detalle del servicio ${id}`, 'info');
  }

  /**
   * Prepare service
   */
  prepareService(id) {
    this.showToast('Preparando servicio...', 'success');
    actions.setProviderStatus('EN_ROUTE');
    
    // Find service and set as active
    const service = this.state?.scheduledServices.find(s => s.id === id);
    if (service) {
      actions.setActiveService({
        ...service,
        status: 'EN_ROUTE',
        startedAt: Date.now()
      });
    }
  }
}

// ============================================
// INITIALIZATION
// ============================================

// Create global app instance
const app = new MimiProviderApp();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}

// Export for global access
window.app = app;

// ============================================
// SERVICE WORKER REGISTRATION
// ============================================

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw-2026.js')
      .then(registration => {
        console.log('[MIMI] SW registered:', registration);
      })
      .catch(error => {
        console.log('[MIMI] SW registration failed:', error);
      });
  });
}

// ============================================
// NOTIFICATION PERMISSION
// ============================================

if ('Notification' in window && Notification.permission === 'default') {
  // Request permission after user interaction
  const requestNotificationPermission = () => {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        console.log('[MIMI] Notification permission granted');
      }
    });
  };
  
  document.addEventListener('click', requestNotificationPermission, { once: true });
}

// Helper function for offer validation
function isOfferValid(offer) {
  if (!offer) return false;
  if (offer.expiresAt && new Date(offer.expiresAt).getTime() < Date.now()) return false;
  return true;
}
