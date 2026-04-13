// js/onboarding-doc-validator.js

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !String(file.type || "").startsWith("image/")) {
      reject(new Error("Archivo no vÃ¡lido para anÃ¡lisis de imagen"));
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

function drawImageToCanvas(img) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return { canvas, ctx, width: canvas.width, height: canvas.height };
}

function getBrightnessStats(ctx, width, height) {
  const sampleStep = Math.max(1, Math.floor(Math.min(width, height) / 120));
  const imageData = ctx.getImageData(0, 0, width, height).data;

  let count = 0;
  let sum = 0;
  let sumSq = 0;

  for (let y = 0; y < height; y += sampleStep) {
    for (let x = 0; x < width; x += sampleStep) {
      const i = (y * width + x) * 4;
      const r = imageData[i];
      const g = imageData[i + 1];
      const b = imageData[i + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      sum += lum;
      sumSq += lum * lum;
      count++;
    }
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
  const { ctx, width, height } = drawImageToCanvas(img);
  const brightness = getBrightnessStats(ctx, width, height);
  const edgeDensity = getEdgeDensity(ctx, width, height);

  const tooSmall = width < 720 || height < 720;
  const tooDark = brightness.mean < 34;
  const tooBright = brightness.mean > 245;
  const tooFlat = brightness.stdDev < 13;
  const suspiciouslyBlurred = edgeDensity < 0.011;

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
        message: "Selfie con baja calidad. Proba con mejor luz o sosteniendo el celu un poco mas quieto"
      };
    }

    return {
      ok: true,
      kind: "selfie",
      message: face.supported
        ? "âœ… Selfie vÃ¡lida. Rostro detectado"
        : "âœ… Selfie lista para subir"
    };
  }

  const aspectRatio = width > height ? width / height : height / width;
  const looksLikeDocumentShape = aspectRatio >= 1.2 && aspectRatio <= 2.2;

  if (tooSmall) {
    return {
      ok: false,
      kind: "document",
      message: "Imagen chica. Proba una foto un poco mas cerca y enfocada"
    };
  }

  if (tooDark) {
    return {
      ok: false,
      kind: "document",
      message: "La foto estÃ¡ muy oscura"
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
      ok: true,
      kind: "document-warning",
      message: "âš  RevisÃ¡ el encuadre: no parece documento completo"
    };
  }

  return {
    ok: true,
    kind: "document",
    message: "âœ… Documento detectado y listo para subir"
  };
}
