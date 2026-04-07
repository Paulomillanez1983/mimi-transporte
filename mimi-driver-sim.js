window.DriverSim = (() => {
  let drivers = [];
  let animFrame = null;
  let running = false;
  let ensureRetryTimer = null;

  const SOURCE_ID = 'sim-drivers';
  const LAYER_ID = 'sim-drivers-layer';
  const IMAGE_ID = 'sim-driver-car';

  function randomBetween(min, max) {
    return Math.random() * (max - min) + min;
  }

  function buildCarSvg() {
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
        <g>
          <ellipse cx="32" cy="34" rx="20" ry="22" fill="rgba(0,0,0,0.18)"/>
          <g transform="translate(32 32) rotate(90) translate(-32 -32)">
            <rect x="18" y="12" width="28" height="40" rx="10" fill="#111111"/>
            <rect x="22" y="18" width="20" height="14" rx="6" fill="#8ec5ff"/>
            <rect x="22" y="34" width="20" height="10" rx="5" fill="#f4f7fb"/>
            <circle cx="22" cy="20" r="3" fill="#ffffff"/>
            <circle cx="42" cy="20" r="3" fill="#ffffff"/>
            <circle cx="22" cy="44" r="4" fill="#1f2937"/>
            <circle cx="42" cy="44" r="4" fill="#1f2937"/>
            <rect x="19" y="12" width="26" height="40" rx="10" fill="none" stroke="#ffffff" stroke-width="2"/>
          </g>
        </g>
      </svg>
    `.trim();
  }

  function loadCarImage(map) {
    return new Promise((resolve) => {
      if (!map) return resolve(false);
      if (map.hasImage(IMAGE_ID)) return resolve(true);

      const img = new Image();
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
        console.warn('[DriverSim] no se pudo cargar SVG inline');
        resolve(false);
      };

      const svg = buildCarSvg();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
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
          bearing: d.bearing
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
            'icon-size': 0.52,
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

      console.log('[DriverSim] ensureLayer intento', {
        attempt,
        ok,
        hasSource: !!map.getSource?.(SOURCE_ID),
        hasLayer: !!map.getLayer?.(LAYER_ID),
        hasImage: !!map.hasImage?.(IMAGE_ID),
        styleLoaded: !!map.isStyleLoaded?.()
      });

      if (ok) return;

      if (attempt < maxRetries) {
        ensureRetryTimer = setTimeout(tryEnsure, 250);
      }
    };

    tryEnsure();
  }

  function buildDriversAroundRoute(routeCoords, count = 6) {
    if (!Array.isArray(routeCoords) || routeCoords.length < 2) return [];

    return Array.from({ length: count }).map((_, i) => {
      const idx = Math.floor(randomBetween(0, routeCoords.length - 1));
      const base = routeCoords[idx];

      return {
        id: `drv_${i}_${Date.now()}`,
        lng: Number(base[0]) + randomBetween(-0.0012, 0.0012),
        lat: Number(base[1]) + randomBetween(-0.0009, 0.0009),
        bearing: randomBetween(0, 360),
        speed: randomBetween(0.00001, 0.00003)
      };
    });
  }

  function animate(map) {
    if (!running || !map) return;

    drivers.forEach((d) => {
      const angle = (d.bearing * Math.PI) / 180;
      d.lng += Math.cos(angle) * d.speed;
      d.lat += Math.sin(angle) * d.speed;

      if (Math.random() < 0.02) {
        d.bearing += randomBetween(-35, 35);
      }
    });

    updateSource(map);
    animFrame = requestAnimationFrame(() => animate(map));
  }

  function start(map, routeCoords, count = 6) {
    if (!map || !Array.isArray(routeCoords) || routeCoords.length < 2) {
      console.warn('[DriverSim] start cancelado: map o routeCoords inválidos');
      return;
    }

    stop(map);

    drivers = buildDriversAroundRoute(routeCoords, count);

    ensureLayer(map);

    setTimeout(() => {
      ensureLayer(map);

      running = true;
      updateSource(map);
      animate(map);

      console.log('[DriverSim] iniciado', {
        hasSource: !!map.getSource?.(SOURCE_ID),
        hasLayer: !!map.getLayer?.(LAYER_ID),
        drivers: drivers.length
      });
    }, 500);
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
