const PREMIUM_LIGHT_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const DARK_STYLE_MARKERS = [
  "dark-matter-gl-style",
  "dark-matter",
  "carto-dark"
];

function shouldReplaceStyle(style) {
  if (!style) return true;
  if (typeof style === "string") {
    return DARK_STYLE_MARKERS.some((marker) => style.includes(marker));
  }
  return false;
}

function installMapLibreLightStylePatch() {
  if (!window.maplibregl?.Map || window.__MIMI_DRIVER_LIGHT_MAP_PATCHED__) return;

  const OriginalMap = window.maplibregl.Map;

  window.maplibregl.Map = class MimiDriverLightMap extends OriginalMap {
    constructor(options = {}) {
      const nextOptions = {
        ...options,
        style: shouldReplaceStyle(options.style) ? PREMIUM_LIGHT_STYLE : options.style,
        attributionControl: options.attributionControl ?? false
      };

      super(nextOptions);

      try {
        this.once("load", () => {
          window.dispatchEvent(new CustomEvent("mimiDriverMapStyleReady", {
            detail: {
              style: nextOptions.style,
              forcedLight: nextOptions.style === PREMIUM_LIGHT_STYLE
            }
          }));
        });
      } catch (_) {}
    }
  };

  Object.setPrototypeOf(window.maplibregl.Map, OriginalMap);
  window.maplibregl.Map.prototype = OriginalMap.prototype;
  window.__MIMI_DRIVER_LIGHT_MAP_PATCHED__ = true;
  window.MIMI_DRIVER_MAP_STYLE = PREMIUM_LIGHT_STYLE;
}

installMapLibreLightStylePatch();

export { PREMIUM_LIGHT_STYLE, installMapLibreLightStylePatch };
