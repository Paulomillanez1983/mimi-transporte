// js/onboarding-doc-validator.js

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

/**
 * Crea un canvas de análisis reducido.
 * Esto NO cambia el archivo que se sube.
 * Solo reduce el costo del análisis local para móvil.
 */
function drawImageToCanvas(img) {
  const maxSide = 1280;

  const originalWidth = img.naturalWidth || img.width;
  const originalHeight = img.naturalHeight || img.height;

  const scale = Math.min(1, maxSide / Math.max(originalWidth, originalHeight));
  const targetWidth = Math.max(1, Math.round(originalWidth * scale));
  const targetHeight = Math.max(1, Math.round(originalHeight * scale));

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  canvas.width = targetWidth;
  canvas.height = targetHeight;
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  return {
    canvas,
    ctx,
    width: targetWidth,
    height: targetHeight,
    originalWidth,
    originalHeight,
    scale
  };
}

/**
 * En vez de leer TODA la imagen completa con getImageData(width,height),
 * leemos una versión reducida para análisis estadístico.
 */
function getBrightnessStats(ctx, width, height) {
  const sampleW = Math.min(width, 320);
  const sampleH = Math.min(height, 320);

  const temp = document.createElement("canvas");
  temp.width = sampleW;
  temp.height = sampleH;

  const tctx = temp.getContext("2d", { willReadFrequently: true });
  tctx.drawImage(ctx.canvas, 0, 0, width, height, 0, 0, sampleW, sampleH);

  const imageData = tctx.getImageData(0, 0, sampleW, sampleH).data;

  let count = 0;
  let sum = 0;
  let sumSq = 0;

  for (let i = 0; i < imageData.length; i += 4) {
    const r = imageData[i];
    const g = imageData[i + 1];
    const b = imageData[i + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    sum += lum;
    sumSq += lum * lum;
    count++;
  }

  const mean = count ? sum / count : 0;
  const variance = count ? Math.max(0, sumSq / count - mean * mean) : 0;
  const stdDev = Math.sqrt(variance);

  return { mean, stdDev };
}

function getEdgeDensity(ctx, width, height) {
  const sampleW = Math.min(width, 320);
  const sampleH = Math.min(height, 320);

  const temp = document.createElement("canvas");
  temp.width = sampleW;
  temp.height = sampleH;

  const tctx = temp.getContext("2d", { willReadFrequently: true });
  tctx.drawImage(ctx.canvas, 0, 0, width, height, 0, 0, sampleW, sampleH);

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

      if (diff > 55) strongEdges++;
      total++;
    }
  }

  return total ? strongEdges / total : 0;
}

function getDocRules(docType) {
  const base = {
    minWidth: 720,
    minHeight: 720,
    minBrightness: 34,
    maxBrightness: 245,
    minStdDev: 13,
    minEdgeDensity: 0.011,
    relaxedWarnings: false
  };

  if (docType === "license_back" || docType === "vehicle_card_back") {
    return {
      ...base,
      minStdDev: 10,
      minEdgeDensity: 0.0075,
      relaxedWarnings: true
    };
  }

  if (docType === "license_front" || docType === "vehicle_card_front" || docType === "dni_back") {
    return {
      ...base,
      minStdDev: 11,
      minEdgeDensity: 0.0085,
      relaxedWarnings: true
    };
  }

  if (docType === "dni_front") {
    return {
      ...base,
      minStdDev: 11,
      minEdgeDensity: 0.009
    };
  }

  return base;
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
    return {
      supported: false,
      faceCount: null,
      hasSingleFace: null
    };
  }
}

export async function validateSelectedDocument(docType, file) {
  if (!file) {
    return {
      ok: false,
      kind: "missing",
      message: "Falta archivo"
    };
  }

  const isImage = String(file.type || "").startsWith("image/");
  const isPdf = String(file.type || "").includes("pdf");

  if (!isImage && !isPdf) {
    return {
      ok: false,
      kind: "format",
      message: "Formato no soportado"
    };
  }

  if (isPdf) {
    return {
      ok: true,
      kind: "pdf",
      message: "PDF listo para subir"
    };
  }

  const img = await loadImageFromFile(file);
  const {
    ctx,
    width,
    height,
    originalWidth,
    originalHeight
  } = drawImageToCanvas(img);

  const brightness = getBrightnessStats(ctx, width, height);
  const edgeDensity = getEdgeDensity(ctx, width, height);
  const rules = getDocRules(docType);

  // Tamaño real original de cámara, no solo el canvas reducido
  const tooSmall = originalWidth < rules.minWidth || originalHeight < rules.minHeight;
  const tooDark = brightness.mean < rules.minBrightness;
  const tooBright = brightness.mean > rules.maxBrightness;
  const tooFlat = brightness.stdDev < rules.minStdDev;
  const suspiciouslyBlurred = edgeDensity < rules.minEdgeDensity;

  if (docType === "selfie") {
    const face = await detectFaceWithNativeAPI(file);

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

    if (tooSmall || tooDark || tooBright || suspiciouslyBlurred) {
      return {
        ok: false,
        kind: "selfie",
        message: "Selfie con baja calidad. Probá con mejor luz o sosteniendo el celu un poco más quieto"
      };
    }

    return {
      ok: true,
      kind: "selfie",
      message: face.supported
        ? "✅ Selfie válida. Rostro detectado"
        : "✅ Selfie lista para subir"
    };
  }

  const aspectRatio =
    originalWidth > originalHeight
      ? originalWidth / originalHeight
      : originalHeight / originalWidth;

  const looksLikeDocumentShape = aspectRatio >= 1.2 && aspectRatio <= 2.2;

  if (tooSmall) {
    return {
      ok: false,
      kind: "document",
      message: "Imagen chica. Probá una foto un poco más cerca y enfocada"
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
    if (rules.relaxedWarnings) {
      return {
        ok: true,
        kind: "document-warning",
        message: "La foto se ve justa de nitidez, pero la vamos a enviar igual para revisión"
      };
    }

    return {
      ok: false,
      kind: "document",
      message: "La imagen se ve borrosa o poco legible"
    };
  }

  if (!looksLikeDocumentShape) {
    return {
      ok: true,
      kind: "document-warning",
      message: "⚠ Revisá el encuadre: no parece documento completo"
    };
  }

  return {
    ok: true,
    kind: "document",
    message: "✅ Documento detectado y listo para subir"
  };
}
