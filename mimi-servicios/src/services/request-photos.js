/**
 * Fotos del problema en el pedido del cliente.
 *
 * ENGANCHA SOLO, SIN TOCAR EL CICLO DE RENDER
 *   El formulario del pedido se dibuja y se vuelve a dibujar muchas veces, así que
 *   engancharse a ese ciclo es frágil. En vez de eso, este módulo se monta sola: espera a
 *   que el formulario aparezca y se inserta una vez. Si el render lo borra, se vuelve a
 *   montar. Así no hay que tocar el render y no se puede romper por un redibujado.
 *
 * QUÉ APORTA
 *   El cliente adjunta hasta 3 fotos del problema (comprimidas en el teléfono: una foto de
 *   4 MB no entraría en el bucket y además es la diferencia entre 60 MB y 1,2 GB por mes).
 *   Las fotos se suben DESPUÉS de crear el pedido, cuando ya hay id, y quedan registradas
 *   con vencimiento para que no se acumulen.
 */

import { createPhotoPicker, uploadRequestPhotos, PHOTO_LIMITS } from "./photo-compression.js?v=2026.09.19.1";
import { getSupabaseClient } from "./supabase.js?v=2026.05.17.2";

const CONTAINER_ID = "requestPhotosStep";

let picker = null;
let observer = null;

function construirContenedor(form) {
  const existente = document.getElementById(CONTAINER_ID);
  if (existente) return existente;

  const container = document.createElement("div");
  container.id = CONTAINER_ID;
  container.style.cssText = "margin:14px 0;";

  const titulo = document.createElement("h4");
  titulo.textContent = "Fotos del problema";
  titulo.style.cssText = "margin:0 0 4px;font-size:15px;font-weight:600;";

  const ayuda = document.createElement("p");
  ayuda.style.cssText = "margin:0 0 2px;font-size:12px;opacity:.7;";
  ayuda.textContent = "Opcional, pero con una foto el prestador te presupuesta más exacto.";

  container.append(titulo, ayuda);
  form.appendChild(container);
  return container;
}

/** Monta el selector dentro del formulario del pedido. Idempotente. */
export function mountRequestPhotoPicker() {
  const form = document.getElementById("requestForm") || document.getElementById("requestSummaryPanel");
  if (!form) return null;
  if (picker && document.getElementById(CONTAINER_ID)) return picker;

  const container = construirContenedor(form);
  // Si el formulario se redibujó, el contenedor viejo desapareció: se rehace el selector.
  if (!picker || !container.contains(picker.elemento?.parentElement ?? null)) {
    picker = createPhotoPicker({ container, maxPhotos: PHOTO_LIMITS.maxPerRequest });
  }
  return picker;
}

export function getPendingRequestPhotos() {
  return picker ? picker.getPhotos() : [];
}

export function hasPendingRequestPhotos() {
  return getPendingRequestPhotos().length > 0;
}

export function clearRequestPhotos() {
  picker?.clear();
}

/**
 * Sube las fotos del pedido recién creado.
 * Nunca tira error hacia arriba: si las fotos fallan, el pedido ya está hecho y el cliente
 * tiene que poder seguir. Devuelve el resultado para poder avisarle.
 */
export async function uploadPendingRequestPhotos(requestId) {
  const vacio = { uploaded: [], failed: [], skipped: true };
  try {
    const fotos = getPendingRequestPhotos();
    if (!requestId || fotos.length === 0) return vacio;

    const supabase = getSupabaseClient?.();
    if (!supabase) return vacio;

    const { data } = await supabase.auth.getUser();
    const userId = data?.user?.id;
    if (!userId) return vacio;

    const resultado = await uploadRequestPhotos({ supabase, userId, requestId, photos: fotos });
    if (resultado.uploaded.length > 0) clearRequestPhotos();
    return resultado;
  } catch (error) {
    console.warn("[MIMI Fotos] no se pudieron subir las fotos del pedido", error);
    return vacio;
  }
}

/**
 * Se monta sola cuando el formulario aparece, y se vuelve a montar si el render lo borra.
 * Arranca cuando el documento ya está listo.
 */
export function autoMountRequestPhotoPicker() {
  if (mountRequestPhotoPicker()) return;

  const intentar = () => {
    if (mountRequestPhotoPicker() && observer) {
      observer.disconnect();
      observer = null;
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", intentar, { once: true });
  } else {
    intentar();
  }

  if (!picker) {
    try {
      observer = new MutationObserver(intentar);
      observer.observe(document.body, { childList: true, subtree: true });
      // No se observa para siempre: si el formulario nunca aparece, se libera solo.
      setTimeout(() => {
        observer?.disconnect();
        observer = null;
      }, 120000);
    } catch (error) {
      console.warn("[MIMI Fotos] no se pudo observar el formulario del pedido", error);
    }
  }
}
