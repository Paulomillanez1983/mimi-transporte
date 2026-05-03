const SYNC_REFRESH_MS = 20000;
const ACTIVE_REFRESH_MS = 9000;
const LAST_REFRESH_KEY = "mimi_driver_last_hardening_refresh";

function qs(selector) {
  return document.querySelector(selector);
}

function safeNow() {
  return new Date().toISOString();
}

function ensureDriverHardeningStyles() {
  if (document.getElementById("driver-hardening-2026-style")) return;

  const style = document.createElement("style");
  style.id = "driver-hardening-2026-style";
  style.textContent = `
    :root {
      --driver-surface: rgba(255,255,255,.92);
      --driver-surface-strong: rgba(255,255,255,.98);
      --driver-border: rgba(15,23,42,.10);
      --driver-text: #0f172a;
      --driver-muted: #64748b;
      --driver-primary: #2563eb;
      --driver-success: #16a34a;
      --driver-danger: #dc2626;
    }

    body {
      background: #f8fafc;
      color: var(--driver-text);
    }

    #map-container::after {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      background:
        radial-gradient(circle at 50% 18%, rgba(255,255,255,.34), transparent 32%),
        linear-gradient(180deg, rgba(248,250,252,.30), rgba(248,250,252,.04) 42%, rgba(248,250,252,.22));
      z-index: 1;
    }

    #ui-layer { position: relative; z-index: 2; }

    .header .header-content,
    .stat-card,
    .nav-bar,
    .bottom-sheet,
    .incoming-modal .modal-content,
    #side-menu .menu-sheet,
    .support-panel {
      border: 1px solid var(--driver-border) !important;
      background: var(--driver-surface) !important;
      box-shadow: 0 20px 50px rgba(15,23,42,.14) !important;
      backdrop-filter: blur(18px) saturate(1.12) !important;
    }

    .header {
      padding-top: max(12px, env(safe-area-inset-top)) !important;
    }

    .driver-profile .avatar,
    .menu-avatar,
    .client-avatar-large {
      box-shadow: 0 10px 24px rgba(37,99,235,.22) !important;
    }

    #driver-sync-health {
      position: fixed;
      top: max(82px, calc(env(safe-area-inset-top) + 70px));
      right: 14px;
      z-index: 1300;
      display: inline-flex;
      gap: 7px;
      align-items: center;
      padding: 8px 10px;
      border-radius: 999px;
      border: 1px solid rgba(15,23,42,.08);
      background: rgba(255,255,255,.88);
      color: #0f172a;
      font: 700 11px/1 Inter, system-ui, sans-serif;
      box-shadow: 0 12px 26px rgba(15,23,42,.12);
      backdrop-filter: blur(14px);
      pointer-events: none;
    }

    #driver-sync-health .sync-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: #94a3b8;
      box-shadow: 0 0 0 4px rgba(148,163,184,.14);
    }

    body[data-driver-sync="ok"] #driver-sync-health .sync-dot { background: var(--driver-success); box-shadow: 0 0 0 4px rgba(22,163,74,.14); }
    body[data-driver-sync="warn"] #driver-sync-health .sync-dot { background: #f59e0b; box-shadow: 0 0 0 4px rgba(245,158,11,.14); }
    body[data-driver-sync="error"] #driver-sync-health .sync-dot { background: var(--driver-danger); box-shadow: 0 0 0 4px rgba(220,38,38,.14); }

    body[data-driver-flow="RECEIVING_OFFER"] .incoming-modal .modal-content {
      animation: driverOfferPulse 1.2s ease-in-out infinite alternate;
    }

    @keyframes driverOfferPulse {
      from { transform: translateY(0) scale(1); }
      to { transform: translateY(-2px) scale(1.006); }
    }

    .fab-online,
    .fab-nav,
    .offer-btn,
    .btn-accept,
    .btn-reject,
    .service-action-btn {
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
    }

    @media (max-width: 520px) {
      .stats-floating { transform: scale(.96); transform-origin: top center; }
      #driver-sync-health { top: max(76px, calc(env(safe-area-inset-top) + 66px)); right: 10px; }
      .bottom-sheet { border-radius: 26px 26px 0 0 !important; }
    }
  `;
  document.head.appendChild(style);
}

function ensureSyncHealthPill() {
  if (document.getElementById("driver-sync-health")) return;
  const pill = document.createElement("div");
  pill.id = "driver-sync-health";
  pill.innerHTML = '<span class="sync-dot"></span><span id="driver-sync-health-text">sync</span>';
  document.body.appendChild(pill);
}

function setSyncStatus(status, label) {
  document.body.dataset.driverSync = status;
  const text = document.getElementById("driver-sync-health-text");
  if (text) text.textContent = label || status;
}

function setFlowState(state) {
  document.body.dataset.driverFlow = String(state || "UNKNOWN");
}

function getActiveTripId() {
  try {
    return window.tripManager?.getCurrentTrip?.()?.id || window.driverApp?._currentTripId || null;
  } catch {
    return null;
  }
}

async function guardedRefresh(reason = "watchdog") {
  const manager = window.tripManager;
  if (!manager?.refresh && !manager?._loadInitialState) return false;

  try {
    setSyncStatus("warn", "sync...");
    if (typeof manager.refresh === "function") {
      await manager.refresh(reason);
    } else if (manager.driverId && typeof manager._loadInitialState === "function") {
      await manager._loadInitialState(manager.driverId);
    }
    localStorage.setItem(LAST_REFRESH_KEY, safeNow());
    setSyncStatus("ok", "sync ok");
    return true;
  } catch (err) {
    console.warn("[DriverHardening] refresh failed", err);
    setSyncStatus("error", "sync err");
    return false;
  }
}

function bindForegroundResync() {
  let last = 0;
  const run = (reason) => {
    const now = Date.now();
    if (now - last < 3500) return;
    last = now;
    guardedRefresh(reason);
  };

  window.addEventListener("online", () => run("browser_online"));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") run("visible_again");
  });
  window.addEventListener("focus", () => run("window_focus"));
}

function bindStateMirroring() {
  window.addEventListener("driverFlowStateChanged", (event) => {
    setFlowState(event?.detail?.state || event?.detail?.to);
    setSyncStatus("ok", "sync ok");
  });

  window.addEventListener("tripStateChanged", (event) => {
    const estado = event?.detail?.estado || "viaje";
    document.body.dataset.tripState = String(estado).toUpperCase();
    setSyncStatus("ok", "sync ok");
  });

  window.addEventListener("locationError", () => {
    setSyncStatus("warn", "gps");
  });
}

function bindActionGuards() {
  const guardedIds = ["btn-accept", "btn-reject", "btn-finish", "serviceActionBtn"];
  guardedIds.forEach((id) => {
    const btn = document.getElementById(id);
    if (!btn || btn.dataset.driverGuarded === "1") return;
    btn.dataset.driverGuarded = "1";
    btn.addEventListener("click", () => {
      btn.dataset.clickedAt = String(Date.now());
      window.setTimeout(() => {
        if (Date.now() - Number(btn.dataset.clickedAt || 0) > 6000) return;
        btn.removeAttribute("aria-busy");
      }, 6500);
    }, { capture: true });
  });
}

function startWatchdog() {
  window.setInterval(() => {
    const activeTripId = getActiveTripId();
    const online = Boolean(window.driverApp?._onlineStatus);
    const period = activeTripId ? ACTIVE_REFRESH_MS : SYNC_REFRESH_MS;
    const lastIso = localStorage.getItem(LAST_REFRESH_KEY);
    const last = lastIso ? new Date(lastIso).getTime() : 0;
    if (!online && !activeTripId) return;
    if (Date.now() - last < period) return;
    guardedRefresh(activeTripId ? "active_trip_watchdog" : "online_idle_watchdog");
  }, 5000);
}

function installSmokeTests() {
  window.MIMI_DRIVER_E2E_TESTS = {
    async smoke() {
      const checks = [
        ["driver app global", () => Boolean(window.driverApp)],
        ["trip manager global", () => Boolean(window.tripManager)],
        ["map container", () => Boolean(document.getElementById("map-container"))],
        ["online button", () => Boolean(document.getElementById("fab-online"))],
        ["incoming modal", () => Boolean(document.getElementById("incoming-modal"))],
        ["bottom sheet", () => Boolean(document.getElementById("bottom-sheet"))],
        ["sync health", () => Boolean(document.getElementById("driver-sync-health"))],
        ["supabase client", () => Boolean(window.driverApp?._session || window.supabase || window.tripManager)]
      ];

      const results = checks.map(([name, fn]) => {
        let ok = false;
        try { ok = Boolean(fn()); } catch { ok = false; }
        return { name, ok };
      });

      const refreshOk = await guardedRefresh("manual_smoke_test");
      results.push({ name: "manual guarded refresh", ok: refreshOk });

      console.table(results);
      return {
        ok: results.every((item) => item.ok),
        results
      };
    },
    refresh: guardedRefresh,
    getState() {
      return {
        flow: document.body.dataset.driverFlow || null,
        tripState: document.body.dataset.tripState || null,
        sync: document.body.dataset.driverSync || null,
        activeTripId: getActiveTripId(),
        online: Boolean(window.driverApp?._onlineStatus),
        lastRefresh: localStorage.getItem(LAST_REFRESH_KEY)
      };
    }
  };
}

function initDriverRuntimeHardening() {
  ensureDriverHardeningStyles();
  ensureSyncHealthPill();
  setSyncStatus("warn", "sync...");
  setFlowState(window.driverFlowState || "BOOT");
  bindForegroundResync();
  bindStateMirroring();
  bindActionGuards();
  startWatchdog();
  installSmokeTests();

  window.setTimeout(() => guardedRefresh("boot_after_driver_init"), 2500);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initDriverRuntimeHardening, { once: true });
} else {
  initDriverRuntimeHardening();
}

export { guardedRefresh, initDriverRuntimeHardening };
