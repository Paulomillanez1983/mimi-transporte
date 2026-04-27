const MAP_CONTAINER_ID = "driversMap";

const DEFAULT_CENTER = [-64.1888, -31.4201]; // Córdoba
const DEFAULT_ZOOM = 11;

const ARGENTINA_CENTER = [-64.9673, -38.4161];
const ARGENTINA_ZOOM = 4;

const CITY_FOCUS = {
  argentina: { center: ARGENTINA_CENTER, zoom: ARGENTINA_ZOOM },
  cordoba: { center: [-64.1888, -31.4201], zoom: 11 },
  caba: { center: [-58.3816, -34.6037], zoom: 11 },
  buenos_aires: { center: [-60.0, -36.5], zoom: 6 },
  rosario: { center: [-60.6393, -32.9468], zoom: 11 },
  mendoza_capital: { center: [-68.8458, -32.8895], zoom: 11 },
  salta_capital: { center: [-65.4122, -24.7821], zoom: 11 },
  villa_allende: { center: [-64.2956, -31.2946], zoom: 12 },
  carlos_paz: { center: [-64.4998, -31.4241], zoom: 12 },
  ushuaia: { center: [-68.303, -54.8019], zoom: 11 }
};

let adminMap = null;
let userMarker = null;
let driverMarkers = [];
let mounted = false;

function getMapEl() {
  return document.getElementById(MAP_CONTAINER_ID);
}

function getMapMeta() {
  return document.getElementById("mapMeta");
}

function setMapMeta(text) {
  const el = getMapMeta();
  if (el) el.textContent = text;
}

function isMapVisible() {
  const el = getMapEl();
  if (!el) return false;

  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);

  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.display !== "none" &&
    style.visibility !== "hidden"
  );
}

function safeResizeMap(delay = 80) {
  window.setTimeout(() => {
    try {
      adminMap?.resize?.();
    } catch (err) {
      console.warn("[admin-map] resize failed", err);
    }
  }, delay);
}

function createMarkerElement(status = "pending") {
  const el = document.createElement("div");

  el.className = [
    "map-driver-marker",
    status === "approved" ? "marker-approved" : "",
    status === "rejected" ? "marker-rejected" : "",
    status === "blocked" ? "marker-blocked" : "",
    status === "online" ? "marker-live" : ""
  ].filter(Boolean).join(" ");

  return el;
}

function normalizeDriverStatus(driver = {}) {
  if (driver.blocked || driver.is_blocked) return "blocked";
  if (driver.approved || driver.review_status === "approved") return "approved";
  if (driver.review_status === "rejected") return "rejected";
  if (driver.is_online || driver.online) return "online";
  return "pending";
}

function getDriverCoordinates(driver = {}) {
  const lat = Number(driver.last_lat ?? driver.lat ?? driver.latitude);
  const lng = Number(driver.last_lng ?? driver.lng ?? driver.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  return [lng, lat];
}

function clearDriverMarkers() {
  driverMarkers.forEach((marker) => {
    try {
      marker.remove();
    } catch {}
  });

  driverMarkers = [];
}

function fitDriverMarkers() {
  if (!adminMap || !driverMarkers.length) {
    focusCordoba();
    return;
  }

  const bounds = new maplibregl.LngLatBounds();

  driverMarkers.forEach((marker) => {
    const lngLat = marker.getLngLat();
    bounds.extend([lngLat.lng, lngLat.lat]);
  });

  try {
    adminMap.fitBounds(bounds, {
      padding: 80,
      maxZoom: 14,
      duration: 700
    });
  } catch {
    focusCordoba();
  }
}

function renderDriverMarkers(drivers = []) {
  if (!adminMap) return;

  clearDriverMarkers();

  const validDrivers = drivers
    .map((driver) => ({
      driver,
      coords: getDriverCoordinates(driver)
    }))
    .filter((item) => item.coords);

  validDrivers.forEach(({ driver, coords }) => {
    const status = normalizeDriverStatus(driver);
    const markerEl = createMarkerElement(status);

    const name =
      driver.full_name ||
      driver.name ||
      driver.email ||
      "Chofer";

    const popup = new maplibregl.Popup({
      offset: 18,
      closeButton: false,
      className: "mimi-admin-map-popup"
    }).setHTML(`
      <strong>${escapeHtml(name)}</strong>
      <br>
      <span>${escapeHtml(driver.email || "Sin email")}</span>
      <br>
      <small>${escapeHtml(status)}</small>
    `);

    const marker = new maplibregl.Marker({
      element: markerEl,
      anchor: "center"
    })
      .setLngLat(coords)
      .setPopup(popup)
      .addTo(adminMap);

    driverMarkers.push(marker);
  });

  setMapMeta(
    validDrivers.length
      ? `${validDrivers.length} ubicaciones cargadas`
      : "Sin ubicaciones válidas"
  );

  if (validDrivers.length) {
    fitDriverMarkers();
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function focusArgentina() {
  if (!adminMap) return;
  adminMap.easeTo({
    center: ARGENTINA_CENTER,
    zoom: ARGENTINA_ZOOM,
    duration: 650
  });
}

function focusCordoba() {
  if (!adminMap) return;
  adminMap.easeTo({
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    duration: 650
  });
}

function focusCity(value) {
  if (!adminMap) return;

  if (value === "drivers") {
    fitDriverMarkers();
    return;
  }

  const target = CITY_FOCUS[value] || CITY_FOCUS.cordoba;

  adminMap.easeTo({
    center: target.center,
    zoom: target.zoom,
    duration: 650
  });
}

function locateAdmin() {
  if (!navigator.geolocation || !adminMap) {
    setMapMeta("Geolocalización no disponible");
    return;
  }

  setMapMeta("Detectando ubicación...");

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lngLat = [
        position.coords.longitude,
        position.coords.latitude
      ];

      if (userMarker) {
        userMarker.setLngLat(lngLat);
      } else {
        const el = document.createElement("div");
        el.className = "map-user-location";

        userMarker = new maplibregl.Marker({
          element: el,
          anchor: "center"
        })
          .setLngLat(lngLat)
          .addTo(adminMap);
      }

      adminMap.easeTo({
        center: lngLat,
        zoom: 14,
        duration: 700
      });

      setMapMeta("Tu ubicación detectada");
    },
    () => {
      setMapMeta("No se pudo obtener ubicación");
    },
    {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 30000
    }
  );
}

async function fetchDriverLocations() {
  try {
    const svc = window.supabaseAdminService;

    if (!svc?.client) return [];

    const ready = await svc.init?.();
    if (!ready) return [];

    const { data, error } = await svc.client
      .from("choferes")
      .select("user_id,email,lat,lng,updated_at")
      .not("lat", "is", null)
      .not("lng", "is", null)
      .limit(500);

    if (error) throw error;

    return Array.isArray(data)
      ? data.map((row) => ({
          user_id: row.user_id,
          email: row.email || "Chofer",
          full_name: row.email || "Chofer",
          lat: Number(row.lat),
          lng: Number(row.lng),
          updated_at: row.updated_at,
          is_online: true,
          review_status: "active",
          is_blocked: false
        }))
      : [];
  } catch (err) {
    console.warn("[admin-map] No se pudieron cargar ubicaciones", err);
    setMapMeta("Mapa listo · sin ubicaciones activas");
    return [];
  }
}
async function refreshDriverMarkers() {
  const drivers = await fetchDriverLocations();
  renderDriverMarkers(drivers);
}

function bindMapControls() {
  document.getElementById("fitDriversBtn")?.addEventListener("click", () => {
    fitDriverMarkers();
  });

  document.getElementById("locateMeBtn")?.addEventListener("click", () => {
    locateAdmin();
  });

  document.getElementById("focusArgentinaBtn")?.addEventListener("click", () => {
    focusArgentina();
  });

  document.getElementById("focusCordobaBtn")?.addEventListener("click", () => {
    focusCordoba();
  });

  document.getElementById("citySelector")?.addEventListener("change", (event) => {
    focusCity(event.target.value);
  });
}

async function mountAdminMap() {
  if (mounted && adminMap) {
    safeResizeMap(40);
    return adminMap;
  }

  const container = getMapEl();

  if (!container) {
    console.warn("[admin-map] Falta #driversMap");
    return null;
  }

  if (!window.maplibregl) {
    console.warn("[admin-map] MapLibre no está cargado");
    setMapMeta("MapLibre no está cargado");
    return null;
  }

  if (!isMapVisible()) {
    safeResizeMap(180);
  }

  container.innerHTML = "";

  adminMap = new maplibregl.Map({
    container,
    style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    pitch: 0,
    bearing: 0,
    attributionControl: true
  });

  window.mimiAdminMap = adminMap;
  window.adminMap = adminMap;

  adminMap.addControl(
    new maplibregl.NavigationControl({
      visualizePitch: true
    }),
    "top-right"
  );

  adminMap.addControl(
    new maplibregl.ScaleControl({
      maxWidth: 120,
      unit: "metric"
    }),
    "bottom-left"
  );

  adminMap.on("load", async () => {
    mounted = true;
    setMapMeta("Mapa listo");
    safeResizeMap(80);
    await refreshDriverMarkers();
  });

  adminMap.on("error", (event) => {
    console.warn("[admin-map] map error", event?.error || event);
    setMapMeta("Error cargando mapa");
  });

  bindMapControls();

  return adminMap;
}

async function ensureAdminMapMounted() {
  await mountAdminMap();
  safeResizeMap(80);
  safeResizeMap(260);
  safeResizeMap(700);
}

window.addEventListener("mimi-admin:mobile-view-change", (event) => {
  if (event.detail?.view !== "map") return;
  ensureAdminMapMounted();
});

window.addEventListener("resize", () => {
  safeResizeMap(120);
}, { passive: true });

window.addEventListener("orientationchange", () => {
  safeResizeMap(300);
  safeResizeMap(900);
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    safeResizeMap(180);
  }
});

window.adminMapController = {
  mount: ensureAdminMapMounted,
  refresh: refreshDriverMarkers,
  fitDrivers: fitDriverMarkers,
  focusArgentina,
  focusCordoba,
  locateAdmin
};

document.addEventListener("DOMContentLoaded", () => {
  const activeView = document.body.getAttribute("data-admin-mobile-view");

  if (activeView === "map" || window.innerWidth > 980) {
    ensureAdminMapMounted();
  }
});
