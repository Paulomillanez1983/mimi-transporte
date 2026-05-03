const isDriverRuntime =
  window.__APP_ROLE__ === "chofer" ||
  /chofer/i.test(window.location.pathname || "") ||
  document.getElementById("map-container");

if (isDriverRuntime) {
  import("./driver-map-light-2026.js").catch((err) => {
    console.warn("[driver-bootstrap] map patch failed", err);
  });

  import("./driver-runtime-hardening-2026.js").catch((err) => {
    console.warn("[driver-bootstrap] hardening failed", err);
  });

  import("./driver-text-fix-2026.js").catch((err) => {
    console.warn("[driver-bootstrap] text fix failed", err);
  });
}

window.MIMI_DRIVER_E2E = {
  async run() {
    const smoke = await window.MIMI_DRIVER_E2E_TESTS?.smoke?.();
    return {
      ok: Boolean(smoke?.ok),
      smoke,
      state: window.MIMI_DRIVER_E2E_TESTS?.getState?.() || null,
      textFixed: typeof window.MIMI_DRIVER_TEXT_FIX?.run === "function",
      mapStyle: window.MIMI_DRIVER_MAP_STYLE || null
    };
  }
};
