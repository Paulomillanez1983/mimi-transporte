// js/onboarding-doc-validator.js

const DEBUG_VALIDATOR = false;

function debugLog(...args) {
  if (DEBUG_VALIDATOR) {
    console.log("[onboarding-doc-validator]", ...args);
  }
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !String(file.type || "").startsWith("image/")) {
      reject(new Error("Archivo no válido para análisis de imagen"));
      return;
    }

    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo cargar la imagen"));
    };

    img.src = url;
  });
}

function getScaledDimensions(width, height, maxSide = 1600) {
  const safeWidth = Number(width) || 0;
  const safeHeight = Number(height) || 0;

  if (safeWidth <= 0 || safeHeight <= 0) {
    return { width: 0, height: 0, scale: 1 };
  }

  const longestSide = Math.max(safeWidth, safeHeight);

  if (longestSide <= maxSide) {
    return {
      width: safeWidth,
      height: safeHeight,
      scale: 1
    };
  }

  const scale = maxSide / longestSide;

  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
    scale
  };
}

function drawImageToCanvas(img, maxSide = 1600) {
  const originalWidth = img.naturalWidth || img.width || 0;
  const originalHeight = img.naturalHeight || img.height || 0;

  const scaled = getScaledDimensions(originalWidth, originalHeight, maxSide);

  if (!scaled.width || !scaled.height) {
    throw new Error("No se pudo calcular el tamaño de la imagen");
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  if (!ctx) {
    throw new Error("No se pudo crear el contexto de análisis");
  }

  canvas.width = scaled.width;
  canvas.height = scaled.height;

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return {
    canvas,
    ctx,
    width: canvas.width,
    height: canvas.height,
    originalWidth,
    originalHeight,
    scale: scaled.scale
  };
}

function getBrightnessStats(ctx, width, height) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const sampleStep = Math.max(1, Math.floor(Math.min(safeWidth, safeHeight) / 120));
  const imageData = ctx.getImageData(0, 0, safeWidth, safeHeight).data;

  let count = 0;
  let sum = 0;
  let sumSq = 0;

  for (let y = 0; y < safeHeight; y += sampleStep) {
    for (let x = 0; x < safeWidth; x += sampleStep) {
      const i = (y * safeWidth + x) * 4;
      const r = imageData[i];
      const g = imageData[i + 1];
      const b = imageData[i + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      sum += lum;
      sumSq += lum * lum;
      count += 1;
    }
  }

  const mean = count ? sum / count : 0;
  const variance = count ? Math.max(0, sumSq / count - mean * mean) : 0;
  const stdDev = Math.sqrt(variance);

  return { mean, stdDev };
}

function getEdgeDensity(ctx, width, height) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);

  const sampleW = Math.min(safeWidth, 320);
  const sampleH = Math.min(safeHeight, 320);

  const temp = document.createElement("canvas");
  temp.width = sampleW;
  temp.height = sampleH;

  const tctx = temp.getContext("2d", { willReadFrequently: true });

  if (!tctx) {
    throw new Error("No se pudo crear el contexto temporal");
  }

  tctx.drawImage(ctx.canvas, 0, 0, safeWidth, safeHeight, 0, 0, sampleW, sampleH);

  const data = tctx.getImageData(0, 0, sampleW, sampleH).data;

  let strongEdges = 0;
  let total = 0;

  for (let y = 1; y < sampleH - 1; y++) {
    for (let x = 1; x < sampleW - 1; x++) {
      const idx = (y * sampleW + x) * 4;
      const idxR = (y * sampleW + (x + 1)) * 4;
      const idxD = ((y + 1) * sampleW + x) * 4;

      const lum = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      const lumR = (data[idxR] + data[idxR + 1] + data[idxR + 2]) / 3;
      const lumD = (data[idxD] + data[idxD + 1] + data[idxD + 2]) / 3;

      const diff = Math.abs(lum - lumR) + Math.abs(lum - lumD);

      if (diff > 55) {
        strongEdges += 1;
      }

      total += 1;
    }
  }

  return total ? strongEdges / total : 0;
}

async function detectFaceWithNativeAPI(file) {
  if (!("FaceDetector" in window)) {
    return {
      supported: false,
      faceCount: null,
      hasSingleFace: null
    };
  }

  try {
    const img = await loadImageFromFile(file);

    const detector = new window.FaceDetector({
      fastMode: true,
      maxDetectedFaces: 5
    });

    const faces = await detector.detect(img);

    return {
      supported: true,
      faceCount: Array.isArray(faces) ? faces.length : 0,
      hasSingleFace: Array.isArray(faces) && faces.length === 1
    };
  } catch (err) {
    debugLog("FaceDetector error:", err);

    return {
      supported: false,
      faceCount: null,
      hasSingleFace: null
    };
  }
}

function isDocumentType(docType) {
  return [
    "dni_front",
    "dni_back",
    "license_front",
    "license_back",
    "vehicle_card_front",
    "vehicle_card_back",
    "background_check"
  ].includes(String(docType || ""));
}

export async function validateSelectedDocument(docType, file) {
  debugLog("start", docType, file?.name, file?.type, file?.size);

  if (!file) {
    return {
      ok: false,
      kind: "missing",
      message: "Falta archivo"
    };
  }

  const mimeType = String(file.type || "").toLowerCase();
  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType.includes("pdf");

  if (!isImage && !isPdf) {
    return {
      ok: false,
      kind: "format",
      message: "Formato no soportado"
    };
  }

  if (file.size > 8_000_000) {
    return {
      ok: false,
      kind: "size",
      message: "El archivo supera el tamaño permitido"
    };
  }

  if (isPdf) {
    if (docType === "selfie") {
      return {
        ok: false,
        kind: "selfie",
        message: "La selfie debe subirse como imagen, no PDF"
      };
    }

    return {
      ok: true,
      kind: "pdf",
      message: "PDF válido para subir"
    };
  }

  let img;
  try {
    img = await loadImageFromFile(file);
  } catch (err) {
    debugLog("loadImageFromFile error", err);

    return {
      ok: false,
      kind: "image-load",
      message: "No pudimos abrir la imagen"
    };
  }

  debugLog("image loaded", img.naturalWidth, img.naturalHeight);

  let analysis;
  try {
    analysis = drawImageToCanvas(img, 1600);
  } catch (err) {
    debugLog("drawImageToCanvas error", err);

    return {
      ok: false,
      kind: "canvas",
      message: "No pudimos procesar la imagen"
    };
  }

  const {
    ctx,
    width,
    height,
    originalWidth,
    originalHeight,
    scale
  } = analysis;

  debugLog("canvas ready", {
    originalWidth,
    originalHeight,
    width,
    height,
    scale
  });

  let brightness;
  let edgeDensity;

  try {
    brightness = getBrightnessStats(ctx, width, height);
    debugLog("brightness ready", brightness);

    edgeDensity = getEdgeDensity(ctx, width, height);
    debugLog("edgeDensity ready", edgeDensity);
  } catch (err) {
    debugLog("pixel analysis error", err);

    return {
      ok: false,
      kind: "analysis",
      message: "No pudimos analizar la calidad de la imagen"
    };
  }

  const tooSmall = originalWidth < 720 || originalHeight < 720;
  const tooDark = brightness.mean < 34;
  const tooBright = brightness.mean > 245;
  const tooFlat = brightness.stdDev < 13;
  const suspiciouslyBlurred = edgeDensity < 0.011;

  debugLog("flags", {
    tooSmall,
    tooDark,
    tooBright,
    tooFlat,
    suspiciouslyBlurred
  });

  if (docType === "selfie") {
    const face = await detectFaceWithNativeAPI(file);
    debugLog("face detection", face);

    if (face.supported && face.faceCount === 0) {
      return {
        ok: false,
        kind: "selfie",
        message: "No detectamos un rostro claro"
      };
    }

    if (face.supported && face.faceCount > 1) {
      return {
        ok: false,
        kind: "selfie",
        message: "Debe haber una sola cara visible"
      };
    }

    if (tooSmall) {
      return {
        ok: false,
        kind: "selfie",
        message: "La selfie tiene resolución muy baja"
      };
    }

    if (tooDark) {
      return {
        ok: false,
        kind: "selfie",
        message: "La selfie está muy oscura"
      };
    }

    if (tooBright) {
      return {
        ok: false,
        kind: "selfie",
        message: "La selfie tiene demasiado brillo"
      };
    }

    if (suspiciouslyBlurred) {
      return {
        ok: false,
        kind: "selfie",
        message: "La selfie se ve borrosa"
      };
    }

    return {
      ok: true,
      kind: "selfie",
      message: face.supported
        ? "✅ Selfie válida. Rostro detectado"
        : "✅ Selfie válida y lista para subir"
    };
  }

  if (isDocumentType(docType)) {
    const aspectRatio = width > height ? width / height : height / width;
    const looksLikeDocumentShape = aspectRatio >= 1.2 && aspectRatio <= 2.2;

    if (tooSmall) {
      return {
        ok: false,
        kind: "document",
        message: "Imagen chica. Sacá la foto más cerca y bien enfocada"
      };
    }

    if (tooDark) {
      return {
        ok: false,
        kind: "document",
        message: "La foto está muy oscura"
      };
    }

    if (tooBright) {
      return {
        ok: false,
        kind: "document",
        message: "La foto tiene demasiado brillo"
      };
    }

    if (tooFlat || suspiciouslyBlurred) {
      return {
        ok: false,
        kind: "document",
        message: "La imagen se ve borrosa o poco legible"
      };
    }

    if (!looksLikeDocumentShape) {
      return {
        ok: false,
        kind: "document",
        message: "El encuadre no parece mostrar el documento completo"
      };
    }

    return {
      ok: true,
      kind: "document",
      message: "✅ Documento detectado y listo para subir"
    };
  }

  if (tooSmall) {
    return {
      ok: false,
      kind: "image",
      message: "La imagen tiene resolución muy baja"
    };
  }

  if (tooDark) {
    return {
      ok: false,
      kind: "image",
      message: "La imagen está muy oscura"
    };
  }

  if (tooBright) {
    return {
      ok: false,
      kind: "image",
      message: "La imagen tiene demasiado brillo"
    };
  }

  if (suspiciouslyBlurred) {
    return {
      ok: false,
      kind: "image",
      message: "La imagen se ve borrosa"
    };
  }

  return {
    ok: true,
    kind: "image",
    message: "✅ Imagen válida y lista para subir"
  };
}
