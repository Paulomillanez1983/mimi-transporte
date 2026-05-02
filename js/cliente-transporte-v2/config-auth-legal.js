// ==========================================
// CONFIGURACIÓN
// ==========================================
const CONFIG = {
  COTIZAR_URL: 'https://xrphpqmutvadjrucqicn.supabase.co/functions/v1/cotizar',
  WHATSAPP_NUMBER: '5493517014863',
  MAX_WAYPOINTS: 5,
  DEBUG: false,
  TIMEOUTS: {
    GEOCODING: 8000,
    COTIZACION: 20000,
    UI_FEEDBACK: 300
  },
  RETRY: {
    MAX_ATTEMPTS: 2,
    DELAY_MS: 500
  }
};

const SUPABASE_PUBLIC_KEY =
  typeof SUPABASE_ANON_KEY !== 'undefined'
    ? SUPABASE_ANON_KEY
    : (typeof SUPABASE_KEY !== 'undefined' ? SUPABASE_KEY : '');

// ==========================================
// HELPERS
// ==========================================
function log(...args) {
  if (CONFIG.DEBUG) console.log(...args);
}

function normalizarTextoDireccion(txt) {
  return String(txt || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function numeroSeguro(n, fallback = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}
  function debeMostrarSimuladoresChoferes() {
  const dp = state?.cotizacion?.detalle_precio || null;
  const puntosRuta = Array.isArray(state?.cotizacion?.puntos_ruta)
    ? state.cotizacion.puntos_ruta
    : [];

  const paradasIntermedias =
    numeroSeguro(state?.cotizacion?.waypoints_count, -1) >= 0
      ? numeroSeguro(state.cotizacion.waypoints_count, 0)
      : numeroSeguro(dp?.cantidad_paradas_intermedias, -1) >= 0
        ? numeroSeguro(dp?.cantidad_paradas_intermedias, 0)
        : Math.max(0, puntosRuta.length - 2);

  return paradasIntermedias === 0;
}


function coordenadasValidas(lat, lng) {
  return (
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng)) &&
    Math.abs(Number(lat)) <= 90 &&
    Math.abs(Number(lng)) <= 180
  );
}

let cachedSession = null;
let lastSessionCheck = 0;

function decodificarJwtPayload(token) {
  try {
    const part = token?.split?.('.')[1];
    if (!part) return null;

    const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(normalized));
  } catch (_) {
    return null;
  }
}

function limpiarSesionCache() {
  cachedSession = null;
  lastSessionCheck = 0;
}
function setHeaderAuthLoading(isLoading) {
  const headerUser = document.getElementById('headerUser');
  if (!headerUser) return;
  headerUser.classList.toggle('header-auth-loading', !!isLoading);
}

window.setHeaderAuthLoading = setHeaderAuthLoading;

function initHeaderScrollEffect() {
  const header = document.querySelector('.header');
  if (!header) return;

  const updateHeader = () => {
    const current = window.scrollY || 0;
    header.classList.toggle('header-scrolled', current > 40);
  };

  window.addEventListener('scroll', updateHeader, { passive: true });
  updateHeader();
}
async function esperarSesionInicial(timeoutMs = 2500) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const { data, error } = await window.sbRealtime.auth.getSession();

    if (error) {
      console.warn('[auth] getSession error durante espera inicial:', error);
      return null;
    }

    if (data?.session?.access_token) {
      return data.session;
    }

    await new Promise(resolve => setTimeout(resolve, 150));
  }

  return null;
}
function getUserDisplayData(session) {
  const user = session?.user || null;
  const meta = user?.user_metadata || {};

  const nombre =
    meta.full_name ||
    meta.name ||
    meta.user_name ||
    (user?.email ? user.email.split('@')[0] : 'Usuario');

  const email = user?.email || '';

  const foto =
    meta.avatar_url ||
    meta.picture ||
    meta.photo_url ||
    '';

  return { nombre, email, foto };
}
  function renderSesionUI(session) {
  const btnLogin = document.getElementById('btnLoginHeader');
  const box = document.getElementById('userSessionBox');
  const avatar = document.getElementById('userAvatar');
  const nameEl = document.getElementById('userName');
  const emailEl = document.getElementById('userEmail');
  const skeleton = document.querySelector('.header-auth-skeleton');

  if (!btnLogin || !box || !avatar || !nameEl || !emailEl) return;

  const showSkeleton = () => {
    if (!skeleton) return;
    skeleton.hidden = false;
    skeleton.style.display = '';
    skeleton.style.opacity = '1';
    skeleton.style.pointerEvents = 'auto';
  };

  const hideSkeletonSmooth = () => {
    if (!skeleton) return;

    skeleton.style.transition = 'opacity 220ms ease';
    skeleton.style.opacity = '0';
    skeleton.style.pointerEvents = 'none';

    setTimeout(() => {
      if (!skeleton) return;
      skeleton.hidden = true;
      skeleton.style.display = 'none';
    }, 220);
  };

  if (!session?.user) {
    showSkeleton();

    btnLogin.hidden = false;
    box.hidden = true;
    box.classList.remove('open');
    box.removeAttribute('title');

    avatar.src = '';
    avatar.onerror = null;
    avatar.alt = 'Foto de perfil';

    nameEl.textContent = '';
    emailEl.textContent = '';

    return;
  }

  const { nombre, email, foto } = getUserDisplayData(session);
  const fallbackAvatar =
    `https://ui-avatars.com/api/?name=${encodeURIComponent(nombre || 'Usuario')}&background=1e3c72&color=fff`;

  btnLogin.hidden = true;
  box.hidden = false;

  nameEl.textContent = nombre || 'Usuario';
  emailEl.textContent = email || '';

  avatar.referrerPolicy = 'no-referrer';
  avatar.onerror = () => {
    avatar.onerror = null;
    avatar.src = fallbackAvatar;
  };
  avatar.src = foto || fallbackAvatar;
  avatar.alt = nombre ? `Foto de ${nombre}` : 'Foto de perfil';

  box.classList.remove('open');
  box.title = email || nombre || 'Cuenta';

  hideSkeletonSmooth();
  initUserSessionDropdown();
}

function initUserSessionDropdown() {
  const box = document.getElementById('userSessionBox');
  const logoutBtn = document.getElementById('btnLogoutHeader');

  if (!box || box.dataset.dropdownBound === '1') return;
  box.dataset.dropdownBound = '1';

  box.addEventListener('click', (e) => {
    if (e.target.closest('#btnLogoutHeader')) return;
    box.classList.toggle('open');
  });

  logoutBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  document.addEventListener('click', (e) => {
    if (!box.contains(e.target)) {
      box.classList.remove('open');
    }
  });
}
  
async function cerrarSesionCliente() {
  try {
    if (typeof setHeaderAuthLoading === 'function') {
      setHeaderAuthLoading(true);
    }

    try {
      if (window.sbRealtime?.auth) {
        await window.sbRealtime.auth.signOut({ scope: 'local' });
      }
    } catch (signOutErr) {
      console.warn('[auth] signOut warning:', signOutErr);
    }

    limpiarSesionCache();
    if (typeof window.resetSupportPushFCMState === 'function') {
      window.resetSupportPushFCMState();
    }

    localStorage.removeItem('mimi_pending_trip_request');
    localStorage.removeItem('mimi-cliente-auth');
    sessionStorage.removeItem('mimi-cliente-auth');

    Object.keys(localStorage).forEach((key) => {
      if (key.includes('supabase') || key.includes('sb-') || key.includes('mimi-cliente-auth')) {
        localStorage.removeItem(key);
      }
    });

    Object.keys(sessionStorage).forEach((key) => {
      if (key.includes('supabase') || key.includes('sb-') || key.includes('mimi-cliente-auth')) {
        sessionStorage.removeItem(key);
      }
    });

    renderSesionUI(null);

    notif.show('Sesión cerrada', 'Ahora podés ingresar con otra cuenta', 'info', 1800);

    setTimeout(() => {
      const cleanUrl = `${window.location.origin}${window.location.pathname}`;
      window.location.replace(cleanUrl);
    }, 250);
  } catch (err) {
    console.error('[auth] error cerrando sesión:', err);
    notif.show('Error', 'No se pudo cerrar sesión', 'error');

    if (typeof setHeaderAuthLoading === 'function') {
      setHeaderAuthLoading(false);
    }
  }
}  
  
 let sessionPromise = null; // Evita llamadas simultáneas duplicadas
let lastUserCheck = 0;
const USER_CHECK_INTERVAL = 300000; // 5 minutos entre checks de getUser
const SESSION_CACHE_MS = 30000; // 30 segundos de cache local

async function obtenerSesionCliente(forceRefresh = false) {
  const canToggleHeaderLoading =
    typeof window.setHeaderAuthLoading === 'function';

  if (!window.sbRealtime?.auth) {
    console.warn('[auth] Cliente de sesión no inicializado');
    if (canToggleHeaderLoading) window.setHeaderAuthLoading(false);
    return null;
  }

  const now = Date.now();

  // EVITAR RACE CONDITIONS: Si hay una petición en curso, esperarla
  if (sessionPromise && !forceRefresh) {
    try {
      const cached = await sessionPromise;
      // Si es reciente (menos de 30 seg), devolver directo
      if (now - lastSessionCheck < SESSION_CACHE_MS) {
        if (canToggleHeaderLoading) window.setHeaderAuthLoading(false);
        return cached;
      }
    } catch (e) {
      // Si la anterior falló, continuar con nueva petición
      sessionPromise = null;
    }
  }

  // Cache rápido (30 segundos) - si no forzamos refresh
  if (
    !forceRefresh &&
    cachedSession?.access_token &&
    now - lastSessionCheck < SESSION_CACHE_MS
  ) {
    // Verificar si expira en menos de 2 minutos
    const payload = decodificarJwtPayload(cachedSession.access_token);
    const expMs = Number(payload?.exp || 0) * 1000;
    
    // Si vence en >2 minutos, usar cache sin más
    if (expMs && (expMs - now > 120000)) {
      if (canToggleHeaderLoading) window.setHeaderAuthLoading(false);
      return cachedSession;
    }
    
    // Si vence pronto, refresh en background (no bloquear UI)
    if (expMs && (expMs - now < 120000)) {
      obtenerSesionCliente(true).catch(console.warn);
      return cachedSession; // Devolver cache mientras refresca
    }
  }

  // Crear nueva promesa de obtención
  sessionPromise = (async () => {
    if (canToggleHeaderLoading) window.setHeaderAuthLoading(true);

    try {
      // 1. Obtener sesión actual
      let { data, error } = await window.sbRealtime.auth.getSession();

      if (error) {
        console.warn('[auth] getSession error:', error);
        limpiarSesionCache();
        return null;
      }

      let session = data?.session || null;

      // 2. Si no hay sesión (ej: después de OAuth redirect), esperar
      if (!session?.access_token) {
        session = await esperarSesionInicial(2500);
      }

      // 3. Si sigue sin haber sesión y forzamos, intentar refresh explícito
      if (!session?.access_token && forceRefresh) {
        try {
          const refreshResult = await window.sbRealtime.auth.refreshSession();
          if (!refreshResult?.error && refreshResult?.data?.session?.access_token) {
            session = refreshResult.data.session;
          }
        } catch (err) {
          console.warn('[auth] refreshSession error:', err);
        }
      }

      if (!session?.access_token) {
        limpiarSesionCache();
        return null;
      }

      // 4. Verificar expiración (refresh automático si <2 minutos)
      const payload = decodificarJwtPayload(session.access_token);
      const expMs = Number(payload?.exp || 0) * 1000;
      const timeUntilExp = expMs - now;

      if (expMs && timeUntilExp < 120000) {
        try {
          const refreshResult = await window.sbRealtime.auth.refreshSession();
          if (!refreshResult?.error && refreshResult?.data?.session?.access_token) {
            session = refreshResult.data.session;
          } else if (timeUntilExp < 0) {
            // Ya expiró y no se pudo refrescar
            limpiarSesionCache();
            return null;
          }
        } catch (err) {
          if (timeUntilExp < 0) {
            limpiarSesionCache();
            return null;
          }
        }
      }

      // 5. Validar con getUser SOLO cada 5 minutos (optimización crítica)
      if (forceRefresh || now - lastUserCheck > USER_CHECK_INTERVAL) {
        try {
          const userCheck = await window.sbRealtime.auth.getUser(session.access_token);
          
          if (userCheck?.error || !userCheck?.data?.user) {
            console.warn('[auth] getUser inválido:', userCheck?.error || 'sin user');
            
            // Reintentar una vez con refresh
            if (!forceRefresh) {
              const refreshResult = await window.sbRealtime.auth.refreshSession();
              if (refreshResult?.data?.session?.access_token) {
                session = refreshResult.data.session;
                // Verificar nuevamente
                const reCheck = await window.sbRealtime.auth.getUser(session.access_token);
                if (reCheck?.error || !reCheck?.data?.user) {
                  limpiarSesionCache();
                  return null;
                }
              } else {
                limpiarSesionCache();
                return null;
              }
            } else {
              limpiarSesionCache();
              return null;
            }
          }
          lastUserCheck = now;
        } catch (err) {
          console.warn('[auth] getUser error:', err);
          if (forceRefresh) {
            limpiarSesionCache();
            return null;
          }
          // Si no es forzado, confiar en el token que tenemos
        }
      }

      // 6. Actualizar cache global
      cachedSession = session;
      lastSessionCheck = Date.now();
      
      return session;
      
    } catch (err) {
      console.error('[auth] Error inesperado:', err);
      if (forceRefresh) limpiarSesionCache();
      return cachedSession || null; // Fallback a anterior
    } finally {
      if (canToggleHeaderLoading) window.setHeaderAuthLoading(false);
      // Limpiar promesa pendiente después de breve delay
      setTimeout(() => { sessionPromise = null; }, 50);
    }
  })();

  return sessionPromise;
} 
  
async function syncRealtimeAuthToken(forceRefresh = false) {
  try {
    if (!window.sbRealtime?.realtime) return null;

    const session = await obtenerSesionCliente(forceRefresh);
    const token = session?.access_token || null;

    if (token) {
      await window.sbRealtime.realtime.setAuth(token);
      console.log('[support realtime auth] token sincronizado');
    } else {
      console.warn('[support realtime auth] sin token de sesión');
    }

    return token;
  } catch (err) {
    console.warn('[support realtime auth] error sincronizando token:', err);
    return null;
  }
}

async function asegurarPushCliente({ promptIfNeeded = false, forcePrompt = false, source = 'runtime' } = {}) {
  try {
    if (typeof window.initSupportPushFCM !== 'function') {
      return null;
    }

    const permission =
      typeof window.getSupportPushPermissionState === 'function'
        ? window.getSupportPushPermissionState()
        : (window.Notification?.permission || 'default');

    if (permission === 'denied') {
      console.warn('[push-cliente] permiso denegado por el navegador');
      return null;
    }

    const token = await window.initSupportPushFCM({
      promptIfNeeded,
      forcePrompt
    });

    if (token && promptIfNeeded) {
      notif.show(
        'Notificaciones activadas',
        'Te vamos a avisar sobre soporte y novedades del viaje.',
        'success',
        3200
      );
    }

    console.log('[push-cliente] init resultado', {
      source,
      prompted: !!promptIfNeeded,
      token: !!token
    });

    return token;
  } catch (err) {
    console.warn('[push-cliente] no se pudo inicializar push:', err);
    return null;
  }
}

async function solicitarPermisosClientePostLogin(session, { forcePrompt = false } = {}) {
  try {
    if (!session?.user?.id) return null;

    const permission =
      typeof window.getSupportPushPermissionState === 'function'
        ? window.getSupportPushPermissionState()
        : (window.Notification?.permission || 'default');

    if (permission === 'granted') {
      return await asegurarPushCliente({
        promptIfNeeded: false,
        forcePrompt,
        source: 'post-login-granted'
      });
    }

    if (permission === 'default') {
      notif.show(
        'Activá notificaciones',
        'Permiten recibir respuestas de soporte y avisos del viaje aunque no tengas la app abierta.',
        'info',
        4200
      );

      return await asegurarPushCliente({
        promptIfNeeded: true,
        forcePrompt,
        source: 'post-login-prompt'
      });
    }

    return null;
  } catch (err) {
    console.warn('[push-cliente] error solicitando permisos post login:', err);
    return null;
  }
}

async function manejarPermisoNotificacionesEnSoporte(session) {
  try {
    if (!session?.user?.id) return null;

    const permission =
      typeof window.getSupportPushPermissionState === 'function'
        ? window.getSupportPushPermissionState()
        : (window.Notification?.permission || 'default');

    if (permission === 'granted') {
      return await asegurarPushCliente({
        promptIfNeeded: false,
        source: 'support-granted'
      });
    }

    if (permission === 'default') {
      notif.show(
        'Activá notificaciones para soporte',
        'Así te avisamos cuando soporte responda aunque estés fuera de la app.',
        'info',
        4200
      );

      return await asegurarPushCliente({
        promptIfNeeded: true,
        forcePrompt: true,
        source: 'support-context-prompt'
      });
    }

    notif.show(
      'Notificaciones desactivadas',
      'Si querés recibir respuestas de soporte, habilitalas manualmente desde la configuración del navegador.',
      'warning',
      5200
    );

    return null;
  } catch (err) {
    console.warn('[push-cliente] error en recordatorio contextual de soporte:', err);
    return null;
  }
}
  
function startPageTransition() {
  document.body.classList.add('page-transitioning');
  setTimeout(() => {
    document.body.classList.remove('page-transitioning');
  }, 350);
}
async function asegurarSesionCliente() {
  let session = await obtenerSesionCliente(false);

  if (session?.access_token && session?.user) {
    renderSesionUI(session);
    return session;
  }

  notif.show(
    'Iniciando sesión',
    'Para confirmar el viaje te pedimos ingresar con Google.',
    'info',
    3500
  );

  await loginConGoogleParaViaje();
  return null;
}
async function enforceLegalGate(actorType) {
  const sessionData = await window.sbRealtime.auth.getSession();
  const token = sessionData?.data?.session?.access_token;

  if (!token) return false;

  const verify = await fetch(`${SUPABASE_URL}/functions/v1/verify-legal-acceptance`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({ actor_type: actorType })
  }).then(r => r.json());

  if (verify?.accepted) return true;

  await openLegalGate(actorType, verify?.missing_documents || []);
  return false;
}
async function openLegalGate(actorType, missingDocuments = []) {
  const gate = document.getElementById('legalGate');
  const body = document.getElementById('legalGateBody');
  const acceptBtn = document.getElementById('legalGateAcceptBtn');

  if (!gate || !body || !acceptBtn) {
    console.error('[legal-gate] elementos no encontrados');
    return false;
  }

  const sessionData = await window.sbRealtime.auth.getSession();
  const token = sessionData?.data?.session?.access_token;

  if (!token) return false;

gate.hidden = false;
gate.removeAttribute('hidden');
gate.setAttribute('aria-hidden', 'false');
gate.classList.add('is-open');

document.documentElement.classList.add('legal-gate-open');
document.body.classList.add('legal-gate-open');
  
  body.innerHTML = `<div class="legal-gate-loading">Cargando documentos…</div>`;
  acceptBtn.disabled = true;

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/get-legal-center`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ actor_type: actorType })
    });

    const result = await response.json();

    if (!result?.ok || !Array.isArray(result.documents)) {
      body.innerHTML = `<div class="legal-gate-loading">No pudimos cargar los documentos legales.</div>`;
      return false;
    }

    const pendingDocs = result.documents.filter(doc =>
      missingDocuments.includes(doc.code) || !doc.accepted
    );

    if (!pendingDocs.length) {
      closeLegalGate();
      return true;
    }

    let currentIndex = 0;

    const renderDoc = () => {
      const doc = pendingDocs[currentIndex];
      if (!doc) return;

      body.innerHTML = `
        <article class="legal-gate-doc">
          <div class="legal-gate-doc-head">
            <div class="legal-gate-doc-meta">
              <h3>${escapeHtml(doc.title || doc.code)}</h3>
              <span>${escapeHtml(doc.version_label || doc.version || 'Versión vigente')}</span>
            </div>
            <div class="legal-gate-doc-status">Obligatorio</div>
          </div>

<div class="legal-gate-doc-content">
  ${escapeHtml(doc.content_markdown || 'Contenido no disponible')}
  <div style="margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,.08);font-size:13px;opacity:.85;">
    Contacto legal: mimi.legal.ar@gmail.com
  </div>
</div>
<div class="legal-gate-doc-actions">
  <label class="legal-gate-check">
    <input type="checkbox" id="legalGateCheck">
    <span>
      Declaro que leí, comprendí y acepto este documento legal en su versión vigente.
    </span>
  </label>
</div>      
</article>

      `;

      acceptBtn.disabled = true;

      const checkbox = document.getElementById('legalGateCheck');
      checkbox?.addEventListener('change', () => {
        acceptBtn.disabled = !checkbox.checked;
      });
    };

    renderDoc();

    acceptBtn.onclick = async () => {
      const doc = pendingDocs[currentIndex];
      if (!doc) return;

      acceptBtn.disabled = true;
      acceptBtn.textContent = 'Registrando...';

      try {
        const acceptRes = await fetch(`${SUPABASE_URL}/functions/v1/accept-legal-document`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            actor_type: actorType,
            document_code: doc.code,
            version: doc.version,
            acceptance_method: 'checkbox_cta'
          })
        });

        const acceptJson = await acceptRes.json();

        if (!acceptJson?.ok) {
          throw new Error(acceptJson?.error || 'No se pudo registrar la aceptación');
        }

        currentIndex += 1;

        if (currentIndex >= pendingDocs.length) {
          closeLegalGate();
          return true;
        }

        acceptBtn.textContent = 'Aceptar y continuar';
        renderDoc();
      } catch (err) {
        console.error('[legal-gate] error aceptando documento:', err);
        acceptBtn.textContent = 'Aceptar y continuar';
        acceptBtn.disabled = false;
        notif.show('Error', 'No pudimos registrar tu aceptación legal.', 'error');
      }
    };

    return true;
  } catch (err) {
    console.error('[legal-gate] error:', err);
    body.innerHTML = `<div class="legal-gate-loading">Ocurrió un error cargando el centro legal.</div>`;
    return false;
  }
}

function closeLegalGate() {
  const gate = document.getElementById('legalGate');
  const acceptBtn = document.getElementById('legalGateAcceptBtn');

  if (acceptBtn) {
    acceptBtn.textContent = 'Aceptar y continuar';
    acceptBtn.disabled = true;
    acceptBtn.onclick = null;
  }

if (gate) {
  gate.classList.remove('is-open');
  gate.hidden = true;
  gate.setAttribute('hidden', '');
  gate.setAttribute('aria-hidden', 'true');
}

document.documentElement.classList.remove('legal-gate-open');
document.body.classList.remove('legal-gate-open');
}
  function showSuggestions(el) {
  if (!el) return;
  el.classList.add('visible');
  el.style.display = 'block';
}

function hideSuggestions(el) {
  if (!el) return;
  el.classList.remove('visible');
  el.style.display = 'none';
}

function setSectionVisible(elementId, visible) {
  const el = document.getElementById(elementId);
  if (!el) return;

  if (visible) {
    el.style.display = 'block';
    void el.offsetHeight;
    el.classList.add('visible');
    el.setAttribute('aria-hidden', 'false');
  } else {
    el.classList.remove('visible');
    el.setAttribute('aria-hidden', 'true');
  }
}

async function loginConGoogleParaViaje() {
  if (!window.sbRealtime?.auth) {
    throw new Error('Cliente Auth no inicializado');
  }

  limpiarSesionCache();
  localStorage.removeItem('mimi-cliente-auth');
  sessionStorage.removeItem('mimi-cliente-auth');
  localStorage.setItem('mimi_pending_trip_request', '1');

  const redirectTo = new URL("./index.html", window.location.href).toString();

  const { data, error } = await window.sbRealtime.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      queryParams: {
        prompt: 'select_account'
      }
    }
  });

  if (error) {
    localStorage.removeItem('mimi_pending_trip_request');
    throw error;
  }

  return data;
}  
async function reanudarViajePendientePostLogin() {
  try {
    const pending = localStorage.getItem('mimi_pending_trip_request');
    if (pending !== '1') return;

    if (!window.sbRealtime?.auth) {
      console.warn('[reanudarViajePendientePostLogin] Auth no inicializado');
      return;
    }

    const session = await obtenerSesionCliente(true);

    if (!session?.access_token || !session?.user) {
      console.warn('[reanudarViajePendientePostLogin] todavía no hay sesión válida');
      return;
    }

    renderSesionUI(session);
localStorage.removeItem('mimi_pending_trip_request');

const legalOk = await enforceLegalGate("client");
if (!legalOk) return;

if (typeof window.subscribeSupportRealtimeForUser === 'function') {
  await window.subscribeSupportRealtimeForUser();
}else {
      console.warn('[reanudarViajePendientePostLogin] subscribeSupportRealtimeForUser no disponible todavía');
    }

    if (typeof window.runClientPostLoginOnboarding === 'function') {
      await window.runClientPostLoginOnboarding(session);
    } else {
      await solicitarPermisosClientePostLogin(session, { forcePrompt: false });
    }

    notif.show(
      'Sesión iniciada',
      `Ingresaste como ${session.user.email || 'usuario'}`,
      'success',
      3000
    );

    setTimeout(() => {
      confirmarViaje();
    }, 700);
  } catch (err) {
    console.error('[reanudarViajePendientePostLogin] ERROR:', err);
  }
}  
function construirTooltip(resuelto) {
  return `${resuelto.direccionCorta}${resuelto.direccionSecundaria ? ' - ' + resuelto.direccionSecundaria : ''}`;
}
function soportaWebGLMapa() {
  try {
    const canvas = document.createElement('canvas');
    if (!window.WebGLRenderingContext) return false;

    const gl =
      canvas.getContext('webgl', { antialias: true, alpha: true }) ||
      canvas.getContext('experimental-webgl', { antialias: true, alpha: true });

    return !!gl;
  } catch (_) {
    return false;
  }
}

function mostrarFallbackMapaSinWebGL() {
  const mapEl = document.getElementById('map');
  if (!mapEl) return;

  mapEl.innerHTML = `
    <div style="
      display:flex;
      align-items:center;
      justify-content:center;
      width:100%;
      height:100%;
      min-height:220px;
      padding:16px;
      text-align:center;
      background:linear-gradient(180deg,#0f172a 0%, #1e293b 100%);
      color:#ffffff;
      border-radius:18px;
      font-size:14px;
      line-height:1.45;
      box-sizing:border-box;
    ">
      <div>
        <div style="font-size:28px; margin-bottom:8px;">🗺️</div>
        <div style="font-weight:700; margin-bottom:6px;">Mapa no disponible en este entorno</div>
        <div style="opacity:.88;">
          El viaje puede seguir funcionando, pero este navegador o dispositivo no pudo iniciar WebGL.
        </div>
      </div>
    </div>
  `;
}
// ==========================================
