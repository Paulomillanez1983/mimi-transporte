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
             'icon-size': (() => {   if (window.innerWidth <= 480) return 0.03;   // celular chico   
              if (window.innerWidth <= 768) return 0.035;  // celular normal   
              if (window.innerWidth <= 1024) return 0.045; // tablet   return 0.055; // desktop })(),
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
        lng: Number(base[0]) + randomBetween(-0.0012, 0.0012),
        lat: Number(base[1]) + randomBetween(-0.0009, 0.0009),
        bearing: randomBetween(0, 360),
        speed: randomBetween(0.000002, 0.000006)
      };
    });
  }

  function animate(map) {
    if (!running || !map) return;

    drivers.forEach((d) => {
      const angle = (d.bearing * Math.PI) / 180;
      d.lng += Math.cos(angle) * d.speed;
      d.lat += Math.sin(angle) * d.speed;

      if (Math.random() < 0.005) {
        d.bearing += randomBetween(-4, 4);
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
