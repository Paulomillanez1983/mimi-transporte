/**
 * Fotos del problema: comprimir en el teléfono, subir liviano.
 *
 * POR QUÉ EXISTE
 *   El costo de storage no está en la subida, está en lo que queda guardado. Y además el
 *   bucket tiene un tope DURO de 512 KB (`file_size_limit`), así que una foto de 4 MB ni
 *   siquiera entra: la subida falla. Este módulo es lo que hace que el flujo funcione y
 *   que el storage no crezca.
 *
 * LO QUE HACE, EN ESTE ORDEN
 *   1. Corrige la orientación EXIF (la foto del Android que sale acostada).
 *   2. Redimensiona a 1600 px del lado largo.
 *   3. Recomprime: WebP si el navegador lo soporta (pesa ~30% menos que JPEG), si no JPEG.
 *   4. Si igual no entra en 512 KB, BAJA LA CALIDAD Y VUELVE A INTENTAR. Esto no es un
 *      detalle: el bucket rechaza lo que se pasa, así que hay que garantizar que entre.
 *   5. Genera una miniatura de 240 px para el listado (una sola vez, acá, y no en el
 *      servidor: así no se paga redimensionado al vuelo).
 *   6. Calcula el SHA-256 del contenido, que es lo que evita guardar dos veces la misma
 *      foto si el cliente reintenta.
 *
 * Nada de esto se puede hacer en el servidor sin costo. Acá es gratis.
 */

/** Los topes, en un solo lugar. Tienen que coincidir con el bucket y con la tabla. */
export const PHOTO_LIMITS = {
  /** El mismo `file_size_limit` del bucket. Si cambia uno, cambia el otro. */
  maxBytes: 512 * 1024,
  /** Lado largo de la foto que ve el prestador. */
  maxSide: 1600,
  /** Calidad inicial. */
  quality: 0.72,
  /** Escalera de reintentos si no entra: primero baja calidad, después el tamaño. */
  retryLadder: [
    { maxSide: 1600, quality: 0.6 },
    { maxSide: 1280, quality: 0.55 },
    { maxSide: 1024, quality: 0.5 },
    { maxSide: 800, quality: 0.45 }
  ],
  /** Miniatura para el listado. */
  thumbSide: 240,
  thumbQuality: 0.6,
  /** Más de 3 fotos no aporta y multiplica el storage. */
  maxPerRequest: 3,
  /** Miniatura que sobrevive si hubo disputa (para evidencia). */
  evidenceThumbSide: 240
};

export const PHOTO_BUCKET = "service-request-photos";

/** Tipos que el bucket acepta. Cualquier otro se rechaza antes de gastar datos. */
export const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function formatBytes(bytes) {
  const valor = Number(bytes || 0);
  if (valor < 1024) return `${valor} B`;
  if (valor < 1024 * 1024) return `${Math.round(valor / 1024)} KB`;
  return `${(valor / 1024 / 1024).toFixed(1)} MB`;
}

function extensionFor(mimeType) {
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/png") return "png";
  return "jpg";
}

/** El navegador soporta codificar WebP en canvas? Se cachea, porque probarlo cuesta. */
let webpSupport = null;
function supportsWebp() {
  if (webpSupport !== null) return webpSupport;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    webpSupport = canvas.toDataURL("image/webp").startsWith("data:image/webp");
  } catch (error) {
    webpSupport = false;
  }
  return webpSupport;
}

/**
 * Decodifica respetando la orientación EXIF.
 * `createImageBitmap` con `imageOrientation: "from-image"` es la forma correcta y la que
 * evita el clásico "la foto sale acostada". Si no está, se cae al <img>.
 */
async function decodeImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close?.() };
    } catch (error) {
      /* sigue con el camino de <img> */
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("no_se_pudo_leer_la_imagen"));
      img.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      close: () => URL.revokeObjectURL(url)
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function scaleToFit(width, height, maxSide) {
  const lado = Math.max(width, height);
  if (lado <= maxSide) return { width, height };
  const factor = maxSide / lado;
  return { width: Math.max(1, Math.round(width * factor)), height: Math.max(1, Math.round(height * factor)) };
}

function toBlob(canvas, mimeType, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

/** Dibuja en un canvas del tamaño pedido. Se reusa para la foto y para la miniatura. */
function drawToCanvas(decoded, maxSide) {
  const { width, height } = scaleToFit(decoded.width, decoded.height, maxSide);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(decoded.source, 0, 0, width, height);
  return { canvas, width, height };
}

async function sha256Hex(blob) {
  try {
    const buffer = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch (error) {
    // Sin hash no se pierde nada: solo se pierde la deduplicación.
    return null;
  }
}

/** Valida antes de gastar tiempo y datos. Devuelve null si está bien, o el motivo. */
export function validatePhotoFile(file) {
  if (!file) return "archivo_vacio";
  const tipo = String(file.type || "").toLowerCase();
  if (!ALLOWED_MIME_TYPES.includes(tipo)) return "formato_no_soportado";
  // 25 MB: un tope de cordura para no intentar decodificar algo absurdo.
  if (file.size > 25 * 1024 * 1024) return "archivo_demasiado_grande";
  return null;
}

/**
 * Comprime una foto. SIEMPRE devuelve algo que entra en el bucket, o tira error.
 * Devuelve la foto, la miniatura y el hash.
 */
export async function compressPhoto(file) {
  const problema = validatePhotoFile(file);
  if (problema) throw new Error(problema);

  const decoded = await decodeImage(file);
  try {
    const mimeType = supportsWebp() ? "image/webp" : "image/jpeg";

    // Primer intento con los valores por defecto.
    let mejor = await (async () => {
      const { canvas, width, height } = drawToCanvas(decoded, PHOTO_LIMITS.maxSide);
      const blob = await toBlob(canvas, mimeType, PHOTO_LIMITS.quality);
      return { blob, width, height };
    })();

    // Si se pasó del tope del bucket, se baja calidad y tamaño hasta que entre.
    for (const intento of PHOTO_LIMITS.retryLadder) {
      if (mejor.blob && mejor.blob.size <= PHOTO_LIMITS.maxBytes) break;
      const { canvas, width, height } = drawToCanvas(decoded, intento.maxSide);
      const blob = await toBlob(canvas, mimeType, intento.quality);
      mejor = { blob, width, height };
    }

    if (!mejor.blob) throw new Error("no_se_pudo_comprimir");
    if (mejor.blob.size > PHOTO_LIMITS.maxBytes) throw new Error("no_entra_en_el_tope");

    // Miniatura: se genera acá, una sola vez, para no pagar redimensionado en el servidor.
    const mini = drawToCanvas(decoded, PHOTO_LIMITS.thumbSide);
    const thumbBlob = await toBlob(mini.canvas, mimeType, PHOTO_LIMITS.thumbQuality);

    const hash = await sha256Hex(mejor.blob);

    return {
      blob: mejor.blob,
      thumbBlob,
      mimeType,
      extension: extensionFor(mimeType),
      width: mejor.width,
      height: mejor.height,
      bytes: mejor.blob.size,
      thumbBytes: thumbBlob?.size ?? 0,
      originalBytes: file.size,
      // Cuánto se ahorró: sirve para mostrarlo y para verificar que la compresión sirve.
      savedRatio: file.size > 0 ? 1 - mejor.blob.size / file.size : 0,
      hash
    };
  } finally {
    decoded.close?.();
  }
}

/** Aplana una lista de fotos y devuelve también el total de bytes a subir. */
export async function compressPhotos(files = []) {
  const comprimidas = [];
  const rechazadas = [];
  for (const file of files) {
    try {
      comprimidas.push({ file, ...(await compressPhoto(file)) });
    } catch (error) {
      rechazadas.push({
        name: file?.name ?? "foto",
        reason: error instanceof Error ? error.message : "error_desconocido"
      });
    }
  }
  return {
    photos: comprimidas,
    rejected: rechazadas,
    totalBytes: comprimidas.reduce((suma, p) => suma + p.bytes + p.thumbBytes, 0)
  };
}

/**
 * Sube las fotos y las registra.
 * El path respeta la convención que exigen las políticas del bucket:
 *   {userId}/{requestId}/{indice}-{hash}.{ext}
 * El primer segmento tiene que ser el id del usuario o la subida se rechaza; el segundo es
 * el pedido, que es lo que permite autorizar a los prestadores destinatarios.
 */
export async function uploadRequestPhotos({
  supabase,
  userId,
  requestId,
  photos,
  ttlHours = 72,
  onProgress
} = {}) {
  if (!supabase || !userId || !requestId) throw new Error("faltan_datos");

  const subidas = [];
  const fallidas = [];

  for (let indice = 0; indice < photos.length; indice += 1) {
    const foto = photos[indice];
    const base = `${userId}/${requestId}/${indice + 1}-${(foto.hash || "x").slice(0, 16)}`;
    const path = `${base}.${foto.extension}`;
    const thumbPath = `${base}-mini.${foto.extension}`;

    try {
      const { error } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(path, foto.blob, { contentType: foto.mimeType, upsert: false });
      if (error) throw error;

      if (foto.thumbBlob) {
        // La miniatura no puede tirar abajo la foto principal.
        await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(thumbPath, foto.thumbBlob, { contentType: foto.mimeType, upsert: false })
          .catch(() => null);
      }

      const expira = new Date(Date.now() + Math.max(1, ttlHours) * 3600 * 1000).toISOString();

      const { data: fila, error: errorFila } = await supabase
        .from("svc_request_photos")
        .insert({
          request_id: requestId,
          storage_path: path,
          thumb_path: foto.thumbBlob ? thumbPath : null,
          byte_size: foto.bytes,
          width: foto.width,
          height: foto.height,
          content_hash: foto.hash,
          created_by: userId,
          expires_at: expira
        })
        .select("id, storage_path, expires_at")
        .single();
      if (errorFila) throw errorFila;

      subidas.push({ ...fila, bytes: foto.bytes, thumbBytes: foto.thumbBytes, width: foto.width, height: foto.height });
      onProgress?.({ done: indice + 1, total: photos.length });
    } catch (error) {
      fallidas.push({
        indice,
        reason: error instanceof Error ? error.message : "error_desconocido"
      });
    }
  }

  return { uploaded: subidas, failed: fallidas };
}

/**
 * Selector de fotos con vista previa.
 *
 * Compacto a propósito: la foto sirve para mostrar DÓNDE está el problema, no para
 * imprimirla. El cliente ve cuánto pesa cada una y cuánto se ahorró, así entiende por qué
 * la app comprime, y el prestador recibe algo que abre rápido aunque tenga mala señal.
 */
export function createPhotoPicker({
  container,
  maxPhotos = PHOTO_LIMITS.maxPerRequest,
  onChange
} = {}) {
  if (!container) return null;

  const estado = { photos: [], rejected: [], busy: false };

  const input = document.createElement("input");
  input.type = "file";
  input.accept = ALLOWED_MIME_TYPES.join(",");
  input.multiple = true;
  input.hidden = true;

  const grid = document.createElement("div");
  grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px;margin-top:10px;";

  const status = document.createElement("p");
  status.style.cssText = "margin:8px 0 0;font-size:12px;opacity:.75;";

  const boton = document.createElement("button");
  boton.type = "button";
  boton.style.cssText =
    "width:100%;padding:12px;border-radius:12px;border:1px dashed rgba(0,0,0,.25);background:#fff;" +
    "font-size:15px;font-weight:600;cursor:pointer;";
  boton.textContent = `Agregar fotos del problema (hasta ${maxPhotos})`;

  function pintar() {
    grid.innerHTML = "";
    estado.photos.forEach((foto, indice) => {
      const celda = document.createElement("div");
      celda.style.cssText = "position:relative;border-radius:10px;overflow:hidden;border:1px solid rgba(0,0,0,.1);";
      const url = URL.createObjectURL(foto.thumbBlob || foto.blob);
      celda.innerHTML =
        `<img src="${url}" alt="" style="width:100%;height:76px;object-fit:cover;display:block;">` +
        `<span style="display:block;font-size:10px;padding:3px 4px;opacity:.7;">${formatBytes(foto.bytes)}</span>`;
      const quitar = document.createElement("button");
      quitar.type = "button";
      quitar.setAttribute("aria-label", "Quitar foto");
      quitar.textContent = "×";
      quitar.style.cssText =
        "position:absolute;top:2px;right:2px;width:20px;height:20px;border-radius:50%;border:0;" +
        "background:rgba(0,0,0,.6);color:#fff;font-size:14px;line-height:1;cursor:pointer;";
      quitar.addEventListener("click", () => {
        estado.photos.splice(indice, 1);
        pintar();
      });
      celda.appendChild(quitar);
      grid.appendChild(celda);
    });

    if (estado.photos.length === 0) {
      status.textContent = "Sin fotos. Una foto del problema ayuda a que el presupuesto sea exacto.";
    } else {
      const total = estado.photos.reduce((s, f) => s + f.bytes + f.thumbBytes, 0);
      const ahorro = estado.photos.reduce((s, f) => s + (f.savedRatio || 0), 0) / estado.photos.length;
      status.textContent =
        `${estado.photos.length} de ${maxPhotos} · ${formatBytes(total)} en total` +
        (ahorro > 0.1 ? ` · comprimidas ${Math.round(ahorro * 100)}% en tu teléfono` : "");
    }

    if (estado.rejected.length > 0) {
      status.textContent += ` · ${estado.rejected.length} no se pudo usar`;
    }

    boton.disabled = estado.busy || estado.photos.length >= maxPhotos;
    boton.textContent = estado.busy
      ? "Comprimiendo…"
      : estado.photos.length >= maxPhotos
        ? `Ya cargaste ${maxPhotos} fotos`
        : `Agregar fotos del problema (hasta ${maxPhotos})`;

    onChange?.({ photos: estado.photos, rejected: estado.rejected });
  }

  input.addEventListener("change", async () => {
    const archivos = Array.from(input.files || []);
    input.value = "";
    if (archivos.length === 0) return;

    const espacio = maxPhotos - estado.photos.length;
    estado.busy = true;
    pintar();
    const resultado = await compressPhotos(archivos.slice(0, Math.max(0, espacio)));
    estado.photos.push(...resultado.photos);
    estado.rejected.push(...resultado.rejected);
    estado.busy = false;
    pintar();
  });

  boton.addEventListener("click", () => input.click());

  container.append(boton, input, grid, status);
  pintar();

  return {
    getPhotos: () => estado.photos,
    getRejected: () => estado.rejected,
    getTotalBytes: () => estado.photos.reduce((s, f) => s + f.bytes + f.thumbBytes, 0),
    clear: () => {
      estado.photos = [];
      estado.rejected = [];
      pintar();
    }
  };
}
