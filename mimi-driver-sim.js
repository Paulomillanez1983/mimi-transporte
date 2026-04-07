window.DriverSim = (() => {
  let drivers = [];
  let animFrame = null;
  let running = false;
  let ensureRetryTimer = null;

  const SOURCE_ID = 'sim-drivers';

  const LAYER_ID = 'sim-drivers-layer';
  const IMAGE_ID = 'sim-driver-car';

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function randomBetween(min, max) {
    return Math.random() * (max - min) + min;
  }
function getResponsiveIconSize() {
  if (window.innerWidth <= 480) return 0.105;
  if (window.innerWidth <= 768) return 0.095;
  if (window.innerWidth <= 1024) return 0.085;
  return 0.06;
}
  function loadCarImage(map) {
    return new Promise((resolve) => {
      if (!map) return resolve(false);
      if (map.hasImage(IMAGE_ID)) return resolve(true);

      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        try {
          if (!map.hasImage(IMAGE_ID)) {
            map.addImage(IMAGE_ID, img, { pixelRatio: 2 });
          }
          resolve(true);
        } catch (err) {
          console.warn('[DriverSim] addImage error:', err);
          resolve(false);
        }
      };

      img.onerror = () => {
        console.warn('[DriverSim] no se pudo cargar ./driver-car.png');
        resolve(false);
      };

      img.src = './driver-car.png';
    });
  }

  function updateSource(map) {
    const source = map?.getSource?.(SOURCE_ID);
    if (!source) return false;

    source.setData({
      type: 'FeatureCollection',
      features: drivers.map((d) => ({
        type: 'Feature',
        properties: {
          id: d.id,
          bearing: d.bearing,
          iconSize: d.iconSize
        },
        geometry: {
          type: 'Point',
          coordinates: [d.lng, d.lat]
        }
      }))
    });

    return true;
  }

  async function ensureLayerNow(map) {
    if (!map) return false;

    try {
      const imageOk = await loadCarImage(map);
      if (!imageOk) return false;

      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: []
          }
        });
      }

      if (!map.getLayer(LAYER_ID)) {
        map.addLayer({
          id: LAYER_ID,
          type: 'symbol',
          source: SOURCE_ID,
          layout: {
            'icon-image': IMAGE_ID,
            'icon-size': ['get', 'iconSize'],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            'icon-rotate': ['get', 'bearing'],
            'icon-rotation-alignment': 'map'
          }
        });
      }

      updateSource(map);

      return !!map.getSource(SOURCE_ID) && !!map.getLayer(LAYER_ID);
    } catch (err) {
      console.warn('[DriverSim] ensureLayerNow error:', err);
      return false;
    }
  }

  function ensureLayer(map, maxRetries = 12) {
    if (!map) return;

    clearTimeout(ensureRetryTimer);
    let attempt = 0;

    const tryEnsure = async () => {
      attempt += 1;

      const ok = await ensureLayerNow(map);

      if (ok) return;

      if (attempt < maxRetries) {
        ensureRetryTimer = setTimeout(tryEnsure, 250);
      }
    };

    tryEnsure();
  }

  function interpolatePoint(a, b, t) {
    return [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t
    ];
  }

  function computeBearing(a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    return angle + 90;
  }

  function offsetPoint(a, b, point, offsetFactor = 0) {
    if (!offsetFactor) return point;

    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.sqrt(dx * dx + dy * dy) || 1;

    const nx = -dy / len;
    const ny = dx / len;

    return [
      point[0] + nx * offsetFactor,
      point[1] + ny * offsetFactor
    ];
  }

  function getPointOnRoute(routeCoords, progress, laneOffset = 0) {
    const maxIndex = routeCoords.length - 1;
    const safeProgress = clamp(progress, 0, maxIndex - 0.0001);

    const i = Math.floor(safeProgress);
    const t = safeProgress - i;

    const a = routeCoords[i];
    const b = routeCoords[Math.min(i + 1, maxIndex)];

    const point = interpolatePoint(a, b, t);
    const offsetPointValue = offsetPoint(a, b, point, laneOffset);
    const bearing = computeBearing(a, b);

    return {
      lng: offsetPointValue[0],
      lat: offsetPointValue[1],
      bearing
    };
  }

function buildDrivers(routeCoords, count = 8) {
  if (!Array.isArray(routeCoords) || routeCoords.length < 2) return [];

  const maxIndex = Math.max(1, routeCoords.length - 1);
  const baseIcon = getResponsiveIconSize();
  const isMobile = window.innerWidth <= 768;

  const mainProgress = clamp(maxIndex * 0.38, 0, maxIndex - 1);
  const mainPoint = getPointOnRoute(routeCoords, mainProgress, 0);

  const mainDriver = {
    id: `drv_main_${Date.now()}`,
    mode: 'route',
    progress: mainProgress,
    speed: isMobile ? 0.0032 : 0.0045,
    laneOffset: 0,
    lng: mainPoint.lng,
    lat: mainPoint.lat,
    bearing: mainPoint.bearing,
    iconSize: baseIcon * 1.08,
    pauseUntil: 0
  };

  const othersCount = Math.max(0, count - 1);

  const usableStart = Math.min(14, maxIndex * 0.18);
  const usableEnd = Math.max(usableStart + 10, maxIndex * 0.82);

  const lngRadius = isMobile ? 0.0014 : 0.0022;
  const latRadius = isMobile ? 0.0010 : 0.0016;

  const others = Array.from({ length: othersCount }).map((_, i) => {
    const spread =
      usableStart +
      ((usableEnd - usableStart) / Math.max(othersCount - 1, 1)) * i;

    const progress = clamp(
      spread + randomBetween(-1.0, 1.0),
      usableStart,
      usableEnd
    );

    const base = getPointOnRoute(routeCoords, progress, 0);

    return {
      id: `drv_side_${i}_${Date.now()}`,
      mode: 'street',
      anchorProgress: progress,
      lng: Number(base.lng) + randomBetween(-lngRadius, lngRadius),
      lat: Number(base.lat) + randomBetween(-latRadius, latRadius),
      bearing: randomBetween(0, 360),
      speed: isMobile ? randomBetween(0.0000012, 0.0000028) : randomBetween(0.0000015, 0.000004),
      iconSize: baseIcon * randomBetween(0.88, 0.96),
      pauseUntil: 0,
      driftUntil: 0
    };
  });

  return [mainDriver, ...others];
}
  
function animate(map, routeCoords) {
  if (!running || !map || !Array.isArray(routeCoords) || routeCoords.length < 2) return;

  const now = Date.now();
  const maxIndex = routeCoords.length - 1;
  const isMobile = window.innerWidth <= 768;

  drivers.forEach((d, idx) => {
    if (d.pauseUntil && now < d.pauseUntil) return;

    if (d.mode === 'route') {
      d.progress += d.speed;

      if (d.progress >= maxIndex - 0.2) {
        d.progress = randomBetween(maxIndex * 0.22, maxIndex * 0.34);
      }

      const point = getPointOnRoute(routeCoords, d.progress, d.laneOffset || 0);

      d.lng = point.lng;
      d.lat = point.lat;

      const currentBearing = d.bearing || point.bearing;
      let delta = point.bearing - currentBearing;

      while (delta > 180) delta -= 360;
      while (delta < -180) delta += 360;

      d.bearing = currentBearing + delta * 0.12;

      if (Math.random() < (isMobile ? 0.004 : 0.003)) {
        d.pauseUntil = now + randomBetween(1400, 2600);
      }

      return;
    }

    const angle = (d.bearing * Math.PI) / 180;
    d.lng += Math.cos(angle) * d.speed;
    d.lat += Math.sin(angle) * d.speed;

    if (!d.driftUntil || now > d.driftUntil) {
      d.bearing += randomBetween(isMobile ? -10 : -18, isMobile ? 10 : 18);
      d.driftUntil = now + randomBetween(2600, 5200);
    }

    if (Math.random() < (isMobile ? 0.006 : 0.004)) {
      d.pauseUntil = now + randomBetween(1200, 3200);
    }

    if (idx !== 0 && Math.random() < 0.002) {
      d.speed = isMobile
        ? randomBetween(0.0000012, 0.0000028)
        : randomBetween(0.0000015, 0.000004);
    }
  });

  updateSource(map);
  animFrame = requestAnimationFrame(() => animate(map, routeCoords));
}
  function stop(map) {
    running = false;

    clearTimeout(ensureRetryTimer);
    ensureRetryTimer = null;

    if (animFrame) {

      
      cancelAnimationFrame(animFrame);
      animFrame = null;
    }

    drivers = [];

    const source = map?.getSource?.(SOURCE_ID);
    if (source) {
      source.setData({
        type: 'FeatureCollection',
        features: []
      });
    }
  }

  return { start, stop, ensureLayer };
})();
