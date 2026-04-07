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
      <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
        <g>
          <ellipse cx="48" cy="54" rx="26" ry="28" fill="rgba(0,0,0,0.28)"/>
          <g transform="translate(48 48) rotate(90) translate(-48 -48)">
            <rect x="28" y="16" width="40" height="56" rx="14" fill="#f7f7f7"/>
            <rect x="33" y="24" width="30" height="18" rx="7" fill="#9fd0ff"/>
            <rect x="33" y="45" width="30" height="15" rx="7" fill="#ffffff"/>
            <circle cx="33" cy="28" r="4" fill="#ffffff"/>
            <circle cx="63" cy="28" r="4" fill="#ffffff"/>
            <circle cx="34" cy="62" r="6" fill="#222222"/>
            <circle cx="62" cy="62" r="6" fill="#222222"/>
            <rect x="29.5" y="17.5" width="37" height="53" rx="13" fill="none" stroke="#2b2b2b" stroke-width="2.5"/>
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
            'icon-size': 0.82,
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

  function buildDriversAroundRoute(routeCoords, count = 10) {
    if (!Array.isArray(routeCoords) || routeCoords.length < 2) return [];

    return Array.from({ length: count }).map((_, i) => {
      const idx = Math.floor(randomBetween(0, routeCoords.length - 1));
      const base = routeCoords[idx];

      return {
        id: `drv_${i}_${Date.now()}`,
        lng: Number(base[0]) + randomBetween(-0.0022, 0.0022),
        lat: Number(base[1]) + randomBetween(-0.0017, 0.0017),
        bearing: randomBetween(0, 360),
        speed: randomBetween(0.000004, 0.000012)
      };
    });
  }

  function animate(map) {
    if (!running || !map) return;

    drivers.forEach((d) => {
      const angle = (d.bearing * Math.PI) / 180;
      d.lng += Math.cos(angle) * d.speed;
      d.lat += Math.sin(angle) * d.speed;

      if (Math.random() < 0.01) {
        d.bearing += randomBetween(-10, 10);
      }
    });

    updateSource(map);
    animFrame = requestAnimationFrame(() => animate(map));
  }

  function start(map, routeCoords, count = 10) {
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
