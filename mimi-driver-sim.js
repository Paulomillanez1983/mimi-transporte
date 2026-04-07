window.DriverSim = (() => {
  let drivers = [];
  let animFrame = null;
  let running = false;

  const SOURCE_ID = 'sim-drivers';
  const LAYER_ID = 'sim-drivers-layer';

  function ensureLayer(map) {
    if (!map || !map.isStyleLoaded()) return;

    if (!map.hasImage('driver-car')) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (!map.hasImage('driver-car')) {
          map.addImage('driver-car', img);
          ensureLayer(map);
        }
      };
      img.src = './img/driver-car.png'; // icono auto chico
      return;
    }

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
          'icon-image': 'driver-car',
          'icon-size': 0.22,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-rotate': ['get', 'bearing'],
          'icon-rotation-alignment': 'map'
        }
      });
    }
  }

  function randomBetween(min, max) {
    return Math.random() * (max - min) + min;
  }

  function buildDriversAroundRoute(routeCoords, count = 5) {
    if (!Array.isArray(routeCoords) || routeCoords.length < 2) return [];

    return Array.from({ length: count }).map((_, i) => {
      const idx = Math.floor(randomBetween(0, routeCoords.length - 1));
      const base = routeCoords[idx];
      return {
        id: `drv_${i}_${Date.now()}`,
        lng: base[0] + randomBetween(-0.0025, 0.0025),
        lat: base[1] + randomBetween(-0.0020, 0.0020),
        bearing: randomBetween(0, 360),
        speed: randomBetween(0.00003, 0.00009)
      };
    });
  }

  function updateSource(map) {
    const source = map.getSource(SOURCE_ID);
    if (!source) return;

    source.setData({
      type: 'FeatureCollection',
      features: drivers.map(d => ({
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

  function animate(map) {
    if (!running || !map) return;

    drivers.forEach(d => {
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

  function start(map, routeCoords, count = 5) {
    if (!map || !Array.isArray(routeCoords) || routeCoords.length < 2) return;

    stop(map);
    ensureLayer(map);
    drivers = buildDriversAroundRoute(routeCoords, count);
    running = true;
    updateSource(map);
    animate(map);
  }

  function stop(map) {
    running = false;
    if (animFrame) {
      cancelAnimationFrame(animFrame);
      animFrame = null;
    }
    drivers = [];

    if (map?.getSource?.(SOURCE_ID)) {
      map.getSource(SOURCE_ID).setData({
        type: 'FeatureCollection',
        features: []
      });
    }
  }

  return { start, stop, ensureLayer };
})();
