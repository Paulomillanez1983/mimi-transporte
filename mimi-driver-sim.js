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

  function randomInt(min, max) {
    return Math.floor(randomBetween(min, max + 1));
  }

  function chance(probability) {
    return Math.random() < probability;
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

  function distanceSq(a, b) {
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    return dx * dx + dy * dy;
  }

  function pointToSegmentDistanceSq(p, a, b) {
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const apx = p[0] - a[0];
    const apy = p[1] - a[1];

    const abLenSq = abx * abx + aby * aby || 1;
    let t = (apx * abx + apy * aby) / abLenSq;
    t = clamp(t, 0, 1);

    const cx = a[0] + abx * t;
    const cy = a[1] + aby * t;

    const dx = p[0] - cx;
    const dy = p[1] - cy;
    return dx * dx + dy * dy;
  }

  function pointToRouteDistanceSq(point, routeCoords) {
    let min = Infinity;

    for (let i = 0; i < routeCoords.length - 1; i++) {
      const a = routeCoords[i];
      const b = routeCoords[i + 1];
      const d = pointToSegmentDistanceSq(point, a, b);
      if (d < min) min = d;
    }

    return min;
  }

  function getRouteBounds(routeCoords) {
    let minLng = Infinity;
    let maxLng = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;

    routeCoords.forEach(([lng, lat]) => {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    });

    return { minLng, maxLng, minLat, maxLat };
  }

  function randomPointAroundRouteArea(routeCoords, isMobile) {
    const bounds = getRouteBounds(routeCoords);

    const padLng = isMobile ? 0.0014 : 0.0022;
    const padLat = isMobile ? 0.0010 : 0.0018;

    const minLng = bounds.minLng - padLng;
    const maxLng = bounds.maxLng + padLng;
    const minLat = bounds.minLat - padLat;
    const maxLat = bounds.maxLat + padLat;

    const routeThreshold = isMobile ? 0.00000018 : 0.00000028;
    const markerThreshold = isMobile ? 0.00000055 : 0.00000085;

    const start = routeCoords[0];
    const end = routeCoords[routeCoords.length - 1];

    for (let attempt = 0; attempt < 80; attempt++) {
      const lng = randomBetween(minLng, maxLng);
      const lat = randomBetween(minLat, maxLat);
      const p = [lng, lat];

      const distToRouteSq = pointToRouteDistanceSq(p, routeCoords);
      const distToStartSq = distanceSq(p, start);
      const distToEndSq = distanceSq(p, end);

      if (
        distToRouteSq > routeThreshold &&
        distToStartSq > markerThreshold &&
        distToEndSq > markerThreshold
      ) {
        return p;
      }
    }

    return [
      randomBetween(minLng, maxLng),
      randomBetween(minLat, maxLat)
    ];
  }

  function createBehaviorProfile(isMobile, idx, isMain = false) {
    if (isMain) {
      return {
        cruiseSpeed: isMobile ? randomBetween(0.0029, 0.0038) : randomBetween(0.0040, 0.0052),
        turnLerp: 0.11,
        pauseChance: isMobile ? 0.0045 : 0.0035,
        shortStopMin: 1200,
        shortStopMax: 2600,
        longStopChance: 0.0012,
        longStopMin: 2600,
        longStopMax: 4600
      };
    }

    const typePool = [
      'steady',
      'normal',
      'cautious',
      'stopngo',
      'searching',
      'pickup-heavy'
    ];

    const type = typePool[idx % typePool.length];

    switch (type) {
      case 'steady':
        return {
          type,
          cruiseSpeed: isMobile ? randomBetween(0.0000020, 0.0000031) : randomBetween(0.0000026, 0.0000044),
          pauseChance: isMobile ? 0.0035 : 0.0028,
          longStopChance: 0.0008,
          shortStopMin: 900,
          shortStopMax: 1800,
          longStopMin: 2200,
          longStopMax: 3800,
          driftMin: 2800,
          driftMax: 5200,
          turnJitter: isMobile ? 8 : 14
        };

      case 'cautious':
        return {
          type,
          cruiseSpeed: isMobile ? randomBetween(0.0000015, 0.0000023) : randomBetween(0.0000020, 0.0000031),
          pauseChance: isMobile ? 0.007 : 0.0055,
          longStopChance: 0.0018,
          shortStopMin: 1200,
          shortStopMax: 2600,
          longStopMin: 3200,
          longStopMax: 5200,
          driftMin: 2600,
          driftMax: 4800,
          turnJitter: isMobile ? 10 : 18
        };

      case 'stopngo':
        return {
          type,
          cruiseSpeed: isMobile ? randomBetween(0.0000018, 0.0000028) : randomBetween(0.0000022, 0.0000038),
          pauseChance: isMobile ? 0.010 : 0.008,
          longStopChance: 0.0024,
          shortStopMin: 1000,
          shortStopMax: 2200,
          longStopMin: 2600,
          longStopMax: 4200,
          driftMin: 2200,
          driftMax: 4200,
          turnJitter: isMobile ? 12 : 22
        };

      case 'searching':
        return {
          type,
          cruiseSpeed: isMobile ? randomBetween(0.0000014, 0.0000022) : randomBetween(0.0000018, 0.0000030),
          pauseChance: isMobile ? 0.0085 : 0.0065,
          longStopChance: 0.0022,
          shortStopMin: 1300,
          shortStopMax: 2800,
          longStopMin: 3400,
          longStopMax: 6000,
          driftMin: 1800,
          driftMax: 3400,
          turnJitter: isMobile ? 18 : 30
        };

      case 'pickup-heavy':
        return {
          type,
          cruiseSpeed: isMobile ? randomBetween(0.0000013, 0.0000020) : randomBetween(0.0000018, 0.0000028),
          pauseChance: isMobile ? 0.011 : 0.009,
          longStopChance: 0.0032,
          shortStopMin: 1400,
          shortStopMax: 3200,
          longStopMin: 4200,
          longStopMax: 7600,
          driftMin: 2400,
          driftMax: 4300,
          turnJitter: isMobile ? 14 : 24
        };

      case 'normal':
      default:
        return {
          type: 'normal',
          cruiseSpeed: isMobile ? randomBetween(0.0000017, 0.0000026) : randomBetween(0.0000022, 0.0000035),
          pauseChance: isMobile ? 0.0058 : 0.0046,
          longStopChance: 0.0014,
          shortStopMin: 1000,
          shortStopMax: 2200,
          longStopMin: 2600,
          longStopMax: 4600,
          driftMin: 2400,
          driftMax: 4600,
          turnJitter: isMobile ? 10 : 18
        };
    }
  }

  function buildDrivers(routeCoords, count = 8) {
    if (!Array.isArray(routeCoords) || routeCoords.length < 2) return [];

    const maxIndex = Math.max(1, routeCoords.length - 1);
    const baseIcon = getResponsiveIconSize();
    const isMobile = window.innerWidth <= 768;

    const mainProgress = clamp(maxIndex * 0.38, 0, maxIndex - 1);
    const mainPoint = getPointOnRoute(routeCoords, mainProgress, 0);
    const mainBehavior = createBehaviorProfile(isMobile, 0, true);

    const mainDriver = {
      id: `drv_main_${Date.now()}`,
      mode: 'route',
      progress: mainProgress,
      speed: mainBehavior.cruiseSpeed,
      baseSpeed: mainBehavior.cruiseSpeed,
      laneOffset: 0,
      lng: mainPoint.lng,
      lat: mainPoint.lat,
      bearing: mainPoint.bearing,
      iconSize: baseIcon * 1.08,
      pauseUntil: 0,
      profile: mainBehavior,
      speedChangeAt: 0
    };

    const othersCount = Math.max(0, count - 1);

    const others = Array.from({ length: othersCount }).map((_, i) => {
      const pos = randomPointAroundRouteArea(routeCoords, isMobile);
      const profile = createBehaviorProfile(isMobile, i + 1, false);
      const initialSpeed = profile.cruiseSpeed * randomBetween(0.85, 1.15);

      return {
        id: `drv_side_${i}_${Date.now()}_${randomInt(1000, 9999)}`,
        mode: 'street',
        anchorProgress: null,
        lng: pos[0],
        lat: pos[1],
        bearing: randomBetween(0, 360),
        speed: initialSpeed,
        baseSpeed: profile.cruiseSpeed,
        iconSize: baseIcon * randomBetween(0.88, 0.98),
        pauseUntil: 0,
        driftUntil: 0,
        profile,
        speedChangeAt: 0,
        localZoneRadiusLng: isMobile ? randomBetween(0.0010, 0.0018) : randomBetween(0.0014, 0.0028),
        localZoneRadiusLat: isMobile ? randomBetween(0.0008, 0.0015) : randomBetween(0.0012, 0.0022),
        homeLng: pos[0],
        homeLat: pos[1]
      };
    });

    return [mainDriver, ...others];
  }

  function keepDriverInsideArea(driver, routeBounds) {
    const minLng = routeBounds.minLng - driver.localZoneRadiusLng;
    const maxLng = routeBounds.maxLng + driver.localZoneRadiusLng;
    const minLat = routeBounds.minLat - driver.localZoneRadiusLat;
    const maxLat = routeBounds.maxLat + driver.localZoneRadiusLat;

    let bounced = false;

    if (driver.lng < minLng) {
      driver.lng = minLng;
      driver.bearing = 180 - driver.bearing;
      bounced = true;
    } else if (driver.lng > maxLng) {
      driver.lng = maxLng;
      driver.bearing = 180 - driver.bearing;
      bounced = true;
    }

    if (driver.lat < minLat) {
      driver.lat = minLat;
      driver.bearing = -driver.bearing;
      bounced = true;
    } else if (driver.lat > maxLat) {
      driver.lat = maxLat;
      driver.bearing = -driver.bearing;
      bounced = true;
    }

    if (bounced) {
      while (driver.bearing < 0) driver.bearing += 360;
      while (driver.bearing >= 360) driver.bearing -= 360;
    }
  }

  function maybePauseDriver(driver, now) {
    const profile = driver.profile;
    if (!profile) return;

    if (chance(profile.longStopChance)) {
      driver.pauseUntil = now + randomBetween(profile.longStopMin, profile.longStopMax);
      return;
    }

    if (chance(profile.pauseChance)) {
      driver.pauseUntil = now + randomBetween(profile.shortStopMin, profile.shortStopMax);
    }
  }

  function maybeAdjustCruiseSpeed(driver, now, isMobile) {
    if (driver.pauseUntil && now < driver.pauseUntil) return;

    if (!driver.speedChangeAt || now >= driver.speedChangeAt) {
      const factor = isMobile
        ? randomBetween(0.82, 1.18)
        : randomBetween(0.78, 1.22);

      driver.speed = driver.baseSpeed * factor;
      driver.speedChangeAt = now + randomBetween(1800, 5200);
    }
  }

  function animate(map, routeCoords) {
    if (!running || !map || !Array.isArray(routeCoords) || routeCoords.length < 2) return;

    const now = Date.now();
    const maxIndex = routeCoords.length - 1;
    const isMobile = window.innerWidth <= 768;
    const routeBounds = getRouteBounds(routeCoords);

    drivers.forEach((d, idx) => {
      if (d.pauseUntil && now < d.pauseUntil) return;

      maybeAdjustCruiseSpeed(d, now, isMobile);

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

        d.bearing = currentBearing + delta * (d.profile?.turnLerp || 0.12);

        maybePauseDriver(d, now);
        return;
      }

      const angle = (d.bearing * Math.PI) / 180;
      d.lng += Math.cos(angle) * d.speed;
      d.lat += Math.sin(angle) * d.speed;

      if (!d.driftUntil || now > d.driftUntil) {
        d.bearing += randomBetween(
          -(d.profile?.turnJitter || (isMobile ? 10 : 18)),
          d.profile?.turnJitter || (isMobile ? 10 : 18)
        );
        d.driftUntil = now + randomBetween(
          d.profile?.driftMin || 2400,
          d.profile?.driftMax || 4800
        );
      }

      const toHomeLng = d.homeLng - d.lng;
      const toHomeLat = d.homeLat - d.lat;
      const distHomeSq = toHomeLng * toHomeLng + toHomeLat * toHomeLat;

      if (distHomeSq > (isMobile ? 0.000010 : 0.000018)) {
        const targetAngle = Math.atan2(toHomeLat, toHomeLng) * (180 / Math.PI);
        let delta = targetAngle - d.bearing;
        while (delta > 180) delta -= 360;
        while (delta < -180) delta += 360;
        d.bearing += delta * 0.06;
      }

      keepDriverInsideArea(d, routeBounds);
      maybePauseDriver(d, now);

      if (idx !== 0 && chance(isMobile ? 0.0025 : 0.002)) {
        d.bearing += randomBetween(-35, 35);
      }
    });

    updateSource(map);
    animFrame = requestAnimationFrame(() => animate(map, routeCoords));
  }

  function start(map, routeCoords, count = window.innerWidth <= 768 ? 6 : 9) {
    if (!map || !Array.isArray(routeCoords) || routeCoords.length < 2) {
      console.warn('[DriverSim] start cancelado: map o routeCoords inválidos');
      return;
    }

    stop(map);

    const coords = routeCoords
      .map((c) => [Number(c?.[0]), Number(c?.[1])])
      .filter((c) =>
        Number.isFinite(c[0]) &&
        Number.isFinite(c[1]) &&
        Math.abs(c[0]) <= 180 &&
        Math.abs(c[1]) <= 90
      );

    if (coords.length < 2) return;

    if (coords.length <= 3) {
      console.warn('[DriverSim] ruta con muy pocos puntos, espero geometría real');
      return;
    }

    drivers = buildDrivers(coords, count);

    ensureLayer(map);

    setTimeout(() => {
      ensureLayer(map);
      running = true;
      updateSource(map);
      animate(map, coords);
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
