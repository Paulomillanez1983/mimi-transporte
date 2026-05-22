const DOCUMENT_TARGETS = {
  selfie: { width: 1440, height: 1920, ratio: 3 / 4, minAreaRatio: 0.32 },
  dni_front: { width: 2560, height: 1620, ratio: 1.58, minAreaRatio: 0.35 },
  dni_back: { width: 2560, height: 1620, ratio: 1.58, minAreaRatio: 0.35 },
  driver_license: { width: 2560, height: 1620, ratio: 1.58, minAreaRatio: 0.32 },
  professional_license: { width: 2560, height: 1620, ratio: 1.58, minAreaRatio: 0.32 },
  default: { width: 1800, height: 1350, ratio: 4 / 3, minAreaRatio: 0.25 }
};

function targetFor(documentType = "default") {
  return DOCUMENT_TARGETS[documentType] || DOCUMENT_TARGETS.default;
}

function canvasFor(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

async function loadImage(file) {
  if (window.createImageBitmap) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Fallback below handles older browsers and some Android WebViews.
    }
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image_load_failed"));
    };
    img.src = url;
  });
}

function colorDistance(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function detectDocumentBounds(sourceCanvas) {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const ctx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const sample = ctx.getImageData(0, 0, width, height);
  const data = sample.data;
  const cornerSize = Math.max(8, Math.round(Math.min(width, height) * 0.08));
  const cornerPoints = [
    [cornerSize, cornerSize],
    [width - cornerSize, cornerSize],
    [cornerSize, height - cornerSize],
    [width - cornerSize, height - cornerSize]
  ];
  const bg = cornerPoints.reduce((acc, [x, y]) => {
    const idx = ((Math.max(0, Math.min(height - 1, y)) * width) + Math.max(0, Math.min(width - 1, x))) * 4;
    acc[0] += data[idx];
    acc[1] += data[idx + 1];
    acc[2] += data[idx + 2];
    return acc;
  }, [0, 0, 0]).map((value) => value / cornerPoints.length);

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let hits = 0;
  const step = Math.max(2, Math.round(Math.min(width, height) / 220));

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4;
      const rgb = [data[idx], data[idx + 1], data[idx + 2]];
      const brightness = (rgb[0] + rgb[1] + rgb[2]) / 3;
      const delta = colorDistance(rgb, bg);
      if (delta > 34 && brightness > 32 && brightness < 248) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        hits += 1;
      }
    }
  }

  const detectedWidth = Math.max(0, maxX - minX);
  const detectedHeight = Math.max(0, maxY - minY);
  const areaRatio = (detectedWidth * detectedHeight) / (width * height);

  if (hits < 80 || areaRatio < 0.12 || areaRatio > 0.98) {
    return null;
  }

  const pad = Math.round(Math.min(width, height) * 0.045);
  return {
    x: Math.max(0, minX - pad),
    y: Math.max(0, minY - pad),
    width: Math.min(width - Math.max(0, minX - pad), detectedWidth + pad * 2),
    height: Math.min(height - Math.max(0, minY - pad), detectedHeight + pad * 2),
    areaRatio
  };
}

function centeredCrop(width, height, ratio) {
  const sourceRatio = width / height;
  if (sourceRatio > ratio) {
    const cropWidth = Math.round(height * ratio);
    return { x: Math.round((width - cropWidth) / 2), y: 0, width: cropWidth, height };
  }
  const cropHeight = Math.round(width / ratio);
  return { x: 0, y: Math.round((height - cropHeight) / 2), width, height: cropHeight };
}

function brightnessAndBlur(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const width = Math.min(180, canvas.width);
  const height = Math.min(180, canvas.height);
  const tmp = canvasFor(width, height);
  tmp.getContext("2d", { alpha: false }).drawImage(canvas, 0, 0, width, height);
  const image = tmp.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, width, height);
  const gray = new Float32Array(width * height);
  let brightness = 0;

  for (let i = 0, p = 0; i < image.data.length; i += 4, p += 1) {
    const value = (image.data[i] * 0.299) + (image.data[i + 1] * 0.587) + (image.data[i + 2] * 0.114);
    gray[p] = value;
    brightness += value;
  }

  let laplacian = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      const edge = Math.abs((gray[idx] * 4) - gray[idx - 1] - gray[idx + 1] - gray[idx - width] - gray[idx + width]);
      laplacian += edge;
      count += 1;
    }
  }

  return {
    brightness: brightness / gray.length,
    sharpness: count ? laplacian / count : 0
  };
}

function qualityFor(canvas, bounds, target, documentType) {
  const { brightness, sharpness } = brightnessAndBlur(canvas);
  const areaRatio = bounds?.areaRatio ?? 1;
  const warnings = [];
  const errors = [];

  if (canvas.width < 1000 || canvas.height < 720) errors.push("resolution_low");
  if (brightness < 42) errors.push("too_dark");
  if (brightness > 236) errors.push("too_bright");
  if (documentType !== "selfie" && sharpness < 4.8) errors.push("too_blurry");
  else if (sharpness < 7.2) warnings.push("possible_blur");
  if (documentType !== "selfie" && areaRatio < target.minAreaRatio) warnings.push("document_far");
  if (documentType !== "selfie" && areaRatio > 0.94) warnings.push("document_too_close");

  return {
    ok: errors.length === 0,
    score: Math.max(0, Math.min(100, 100 - errors.length * 28 - warnings.length * 12)),
    status: errors.length ? "rejected" : warnings.length ? "review" : "good",
    brightness: Number(brightness.toFixed(2)),
    sharpness: Number(sharpness.toFixed(2)),
    areaRatio: Number(areaRatio.toFixed(4)),
    warnings,
    errors
  };
}

function blobFromCanvas(canvas, type = "image/jpeg", quality = 0.92) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function resizeCanvas(sourceCanvas, scale) {
  const canvas = canvasFor(
    Math.max(1, Math.round(sourceCanvas.width * scale)),
    Math.max(1, Math.round(sourceCanvas.height * scale))
  );
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function documentByteBudget(documentType) {
  if (documentType === "selfie") return 1400 * 1024;
  if (documentType === "default") return 2200 * 1024;
  return 2600 * 1024;
}

async function encodeJpegWithinBudget(canvas, {
  initialQuality = 0.94,
  minQuality = 0.86,
  maxBytes = 2400 * 1024
} = {}) {
  let workingCanvas = canvas;
  let quality = Math.max(minQuality, Math.min(0.98, initialQuality));
  let blob = await blobFromCanvas(workingCanvas, "image/jpeg", quality);

  while (blob && blob.size > maxBytes && quality > minQuality) {
    quality = Math.max(minQuality, Number((quality - 0.03).toFixed(2)));
    blob = await blobFromCanvas(workingCanvas, "image/jpeg", quality);
  }

  while (blob && blob.size > maxBytes && workingCanvas.width > 1400 && workingCanvas.height > 900) {
    workingCanvas = resizeCanvas(workingCanvas, 0.92);
    quality = Math.max(minQuality, quality);
    blob = await blobFromCanvas(workingCanvas, "image/jpeg", quality);
  }

  return {
    blob,
    canvas: workingCanvas,
    quality: Number(quality.toFixed(2))
  };
}

export async function optimizeDocumentImageFile(file, options = {}) {
  if (!file || !String(file.type || "").startsWith("image/")) {
    return { file, optimized: false, quality: { ok: true, status: "not_image" }, metadata: {} };
  }

  const documentType = options.documentType || "default";
  const target = targetFor(documentType);
  const image = await loadImage(file);
  const sourceWidth = image.width || image.videoWidth || 0;
  const sourceHeight = image.height || image.videoHeight || 0;
  const scanWidth = Math.min(900, sourceWidth);
  const scanHeight = Math.max(1, Math.round(scanWidth * (sourceHeight / Math.max(1, sourceWidth))));
  const scanCanvas = canvasFor(scanWidth, scanHeight);
  scanCanvas.getContext("2d", { alpha: false }).drawImage(image, 0, 0, scanWidth, scanHeight);

  const detected = documentType === "selfie" ? null : detectDocumentBounds(scanCanvas);
  const crop = detected
    ? {
        x: Math.round(detected.x * (sourceWidth / scanWidth)),
        y: Math.round(detected.y * (sourceHeight / scanHeight)),
        width: Math.round(detected.width * (sourceWidth / scanWidth)),
        height: Math.round(detected.height * (sourceHeight / scanHeight)),
        areaRatio: detected.areaRatio
      }
    : { ...centeredCrop(sourceWidth, sourceHeight, target.ratio), areaRatio: 1 };

  const outputRatio = crop.width / Math.max(1, crop.height);
  let outputWidth = target.width;
  let outputHeight = Math.round(outputWidth / outputRatio);
  if (outputHeight > target.height) {
    outputHeight = target.height;
    outputWidth = Math.round(outputHeight * outputRatio);
  }

  const canvas = canvasFor(outputWidth, outputHeight);
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, outputWidth, outputHeight);

  const quality = qualityFor(canvas, crop, target, documentType);
  const encoded = await encodeJpegWithinBudget(canvas, {
    initialQuality: options.quality || (documentType === "selfie" ? 0.94 : 0.96),
    minQuality: documentType === "selfie" ? 0.86 : 0.88,
    maxBytes: options.maxBytes || documentByteBudget(documentType)
  });
  const blob = encoded.blob;
  if (!blob) throw new Error("document_optimization_failed");

  const originalName = String(file.name || `${documentType}.jpg`).replace(/\.[^.]+$/, "");
  const optimizedFile = new File([blob], `${originalName}-optimized.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now()
  });

  return {
    file: optimizedFile,
    optimized: true,
    previewUrl: URL.createObjectURL(blob),
    quality,
    metadata: {
      original_name: file.name || null,
      original_size_bytes: file.size || null,
      original_mime_type: file.type || null,
      original_width: sourceWidth,
      original_height: sourceHeight,
      optimized_width: encoded.canvas.width,
      optimized_height: encoded.canvas.height,
      optimized_size_bytes: blob.size,
      optimized_mime_type: "image/jpeg",
      compression_quality: encoded.quality,
      storage_budget_bytes: options.maxBytes || documentByteBudget(documentType),
      crop_applied: Boolean(detected),
      crop_x: crop.x,
      crop_y: crop.y,
      crop_width: crop.width,
      crop_height: crop.height,
      quality_status: quality.status,
      quality_score: quality.score,
      quality_warnings: quality.warnings,
      quality_errors: quality.errors
    }
  };
}

export async function optimizeAvatarImageFile(file, options = {}) {
  if (!file || !String(file.type || "").startsWith("image/")) {
    return { file, optimized: false, metadata: {} };
  }

  const image = await loadImage(file);
  const sourceWidth = image.width || image.videoWidth || 0;
  const sourceHeight = image.height || image.videoHeight || 0;
  const crop = centeredCrop(sourceWidth, sourceHeight, 1);
  const size = Math.max(256, Math.min(768, Number(options.size || 640)));
  const canvas = canvasFor(size, size);
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, size, size);

  const encoded = await encodeJpegWithinBudget(canvas, {
    initialQuality: options.quality || 0.86,
    minQuality: 0.74,
    maxBytes: options.maxBytes || 240 * 1024
  });
  if (!encoded.blob) throw new Error("avatar_optimization_failed");

  const originalName = String(file.name || "avatar.jpg").replace(/\.[^.]+$/, "");
  const optimizedFile = new File([encoded.blob], `${originalName}-avatar.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now()
  });

  return {
    file: optimizedFile,
    optimized: true,
    previewUrl: URL.createObjectURL(encoded.blob),
    metadata: {
      original_name: file.name || null,
      original_size_bytes: file.size || null,
      original_mime_type: file.type || null,
      original_width: sourceWidth,
      original_height: sourceHeight,
      optimized_width: encoded.canvas.width,
      optimized_height: encoded.canvas.height,
      optimized_size_bytes: encoded.blob.size,
      optimized_mime_type: "image/jpeg",
      compression_quality: encoded.quality
    }
  };
}

export function qualityMessage(quality = {}) {
  if (quality.status === "good") return "Foto optimizada. Los datos deberian leerse con claridad.";
  if (quality.errors?.includes?.("too_blurry") || quality.warnings?.includes?.("possible_blur")) {
    return "La foto parece borrosa. Apoya el DNI, limpia la camara, espera que enfoque y repetila.";
  }
  if (quality.errors?.includes?.("too_bright")) {
    return "La foto tiene reflejos o exceso de luz. Inclina apenas el DNI y repetila.";
  }
  if (quality.errors?.includes?.("too_dark")) {
    return "La foto esta oscura. Busca luz frontal pareja y repetila.";
  }
  if (quality.status === "review") return "Foto usable, pero revisa luz, enfoque y distancia antes de enviarla.";
  if (quality.status === "rejected") return "La foto no cumple calidad minima. Repetila con mejor luz y el documento dentro del marco.";
  return "Foto lista para subir.";
}
