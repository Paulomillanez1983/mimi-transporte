/**
 * Que el panel del prestador se entere de que hay una versión nueva.
 *
 * EL PROBLEMA QUE RESUELVE
 *   El panel se sirve desde la cache del service worker. Cuando se publica una versión nueva,
 *   el prestador sigue viendo el código viejo hasta que el navegador renueve el service
 *   worker por su cuenta — y eso puede tardar días. Peor: el aviso de "hay algo nuevo" que
 *   tiene el cliente NO existía del lado del prestador, así que no había manera de que se
 *   enterara. Efecto: se deploya y el prestador no ve nada.
 *
 * CÓMO LO RESUELVE
 *   Pide /app-version.json con `cache: "no-store"` (o sea, siempre al servidor, nunca de la
 *   cache), compara contra la versión que está corriendo, y si la publicada es distinta:
 *   borra las caches del panel, fuerza la actualización del service worker y recarga.
 *
 *   Así, a partir de la próxima actualización, el panel se pone al día solo. La primera vez
 *   puede hacer falta cerrar y abrir la app una vez, porque el código viejo todavía no tiene
 *   este chequeo.
 */

const PREFIJOS_CACHE = ["mimi-go-partner-", "mimi-servicios-provider-"];

let yaChequeando = false;
let listenersListos = false;

async function limpiarCachesDelPanel() {
  try {
    if (!("caches" in window)) return 0;
    const nombres = await caches.keys();
    const nuestros = nombres.filter((n) => PREFIJOS_CACHE.some((p) => n.startsWith(p)));
    await Promise.all(nuestros.map((n) => caches.delete(n)));
    return nuestros.length;
  } catch (error) {
    return 0;
  }
}

/**
 * Compara la versión publicada con la que está corriendo.
 * Devuelve true si encontró una versión nueva y recargó.
 */
export async function checkProviderUpdate(buildActual, { force = false } = {}) {
  if (yaChequeando) return false;
  yaChequeando = true;
  try {
    const res = await fetch(`/app-version.json?mimi=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return false;
    const payload = await res.json();
    const publicada = String(payload?.provider?.version || "").trim();
    const corriendo = String(buildActual || "").trim();
    if (!publicada || !corriendo) return false;
    if (publicada === corriendo && !force) return false;

    console.log("[MIMI Update] version nueva:", publicada, "corriendo:", corriendo);
    await limpiarCachesDelPanel();

    try {
      const registro = await navigator.serviceWorker?.getRegistration?.();
      await registro?.update?.();
      // Se le pide al service worker nuevo que tome el control ya, en vez de esperar.
      registro?.waiting?.postMessage?.({ type: "SKIP_WAITING" });
    } catch (error) {
      /* si no hay service worker, igual se recarga */
    }

    // Una sola recarga: marcamos para no entrar en un ciclo si algo no cierra.
    try {
      const clave = "mimi_provider_update_try";
      const anterior = sessionStorage.getItem(clave);
      if (anterior === publicada) {
        console.warn("[MIMI Update] ya se intentó con esta versión; se sigue con la cache limpia");
        return false;
      }
      sessionStorage.setItem(clave, publicada);
    } catch (error) {
      /* sin sessionStorage igual se recarga */
    }

    window.location.reload();
    return true;
  } catch (error) {
    return false;
  } finally {
    yaChequeando = false;
  }
}

/**
 * Arranca el chequeo: al abrir, al volver a la app, y cada 10 minutos por si la app queda
 * abierta todo el día (que es lo normal en un prestador que la usa para trabajar).
 */
export function watchProviderUpdates(buildActual) {
  checkProviderUpdate(buildActual).catch(() => {});

  if (listenersListos) return;
  listenersListos = true;

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      checkProviderUpdate(buildActual).catch(() => {});
    }
  });
  window.addEventListener("focus", () => {
    checkProviderUpdate(buildActual).catch(() => {});
  });
  setInterval(() => {
    checkProviderUpdate(buildActual).catch(() => {});
  }, 10 * 60 * 1000);
}
