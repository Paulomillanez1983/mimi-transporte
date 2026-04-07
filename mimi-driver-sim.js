window.DriverSim = (() => {
  let drivers = [];
  let animFrame = null;
  let running = false;

  const SOURCE_ID = 'sim-drivers';
  const LAYER_ID = 'sim-drivers-layer';

  function randomBetween(min, max) {
    return Math.random() * (max - min) + min;
  }

  function updateSource(map) {
    const source = map?.getSource?.(SOURCE_ID);
    if (!source) return;

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
  }

  function ensureLayer(map) {
    if (!map || !map.isStyleLoaded()) return;

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
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-radius': 6,
          'circle-color': '#111111',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.95
        }
      });
    }

    updateSource(map);
  }

  function buildDriversAroundRoute(routeCoords, count = 6) {
    if (!Array.isArray(routeCoords) || routeCoords.length < 2) return [];

    return Array.from({ length: count }).map((_, i) => {
      const idx = Math.floor(randomBetween(0, routeCoords.length - 1));
      const base = routeCoords[idx];

      return {
        id: `drv_${i}_${Date.now()}`,
        lng: Number(base[0]) + randomBetween(-0.0016, 0.0016),
        lat: Number(base[1]) + randomBetween(-0.0012, 0.0012),
        bearing: randomBetween(0, 360),
        speed: randomBetween(0.000015, 0.000045)
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
    if (!map || !Array.isArray(routeCoords) || routeCoords.length < 2) return;

    stop(map);

    setTimeout(() => {
      ensureLayer(map);

      drivers = buildDriversAroundRoute(routeCoords, count);
      running = true;

      updateSource(map);
      animate(map);

      console.log('[DriverSim] iniciado', {
        hasSource: !!map.getSource(SOURCE_ID),
        hasLayer: !!map.getLayer(LAYER_ID),
        drivers: drivers.length
      });
    }, 250);
  }

  function stop(map) {
    running = false;

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
