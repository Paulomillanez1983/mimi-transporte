/**
 * MIMI Driver - Camera Capture Module
 * Producción 2026
 * Cámara custom para onboarding documental y selfie
 *
 * Responsabilidad:
 * - abrir cámara full-screen con getUserMedia
 * - overlay guía para documento o selfie
 * - captura de frame
 * - recorte seguro
 * - chequeos visuales rápidos
 * - devolver un File listo para pasar a setSelectedFile(...)
 *
 * No reemplaza validaciones antifraude del backend.
 */

const DEFAULTS = {
  jpegQuality: 0.9,
  targetMaxSide: 1600,
  minBrightness: 55,
  maxBrightness: 220,
  maxBlurVarianceThreshold: 55,
  aspectRatioDocument: 1.58,
  aspectRatioSelfie: 0.78
};

function qs(id) {
  return document.getElementById(id);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isSecureContextAvailable() {
  return window.isSecureContext || location.hostname === "localhost" || location.hostname === "127.0.0.1";
}

function ensureCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function fileNameForDocType(docType, mode) {
  const safe = String(docType || mode || "capture")
    .replace(/[^\w.-]+/g, "_")
    .toLowerCase();

  return `${safe}_${Date.now()}.jpg`;
}

function computeContainRect(videoWidth, videoHeight, boxWidth, boxHeight) {
  const scale = Math.min(boxWidth / videoWidth, boxHeight / videoHeight);
  const width = videoWidth * scale;
  const height = videoHeight * scale;
  const left = (boxWidth - width) / 2;
  const top = (boxHeight - height) / 2;

  return { left, top, width, height, scale };
}

function computeCropFromGuide({
  videoWidth,
  videoHeight,
  containerWidth,
  containerHeight,
  guideRect
}) {
  const fitted = computeContainRect(videoWidth, videoHeight, containerWidth, containerHeight);

  const cropX = (guideRect.left - fitted.left) / fitted.scale;
  const cropY = (guideRect.top - fitted.top) / fitted.scale;
  const cropW = guideRect.width / fitted.scale;
  const cropH = guideRect.height / fitted.scale;

  return {
    x: clamp(cropX, 0, videoWidth),
    y: clamp(cropY, 0, videoHeight),
    width: clamp(cropW, 1, videoWidth),
    height: clamp(cropH, 1, videoHeight)
  };
}

function getGuideRect(shell, guide, mode) {
  const shellRect = shell.getBoundingClientRect();
  const guideRect = guide.getBoundingClientRect();

  const raw = {
    left: guideRect.left - shellRect.left,
    top: guideRect.top - shellRect.top,
    width: guideRect.width,
    height: guideRect.height
  };

  if (mode === "selfie") {
    return raw;
  }

  const padding = Math.max(6, Math.round(Math.min(raw.width, raw.height) * 0.02));

  return {
    left: raw.left + padding,
    top: raw.top + padding,
    width: Math.max(1, raw.width - padding * 2),
    height: Math.max(1, raw.height - padding * 2)
  };
}

function resizeCanvasOutput(sourceCanvas, maxSide = DEFAULTS.targetMaxSide) {
  const { width, height } = sourceCanvas;
  const biggest = Math.max(width, height);

  if (biggest <= maxSide) return sourceCanvas;

  const scale = maxSide / biggest;
  const out = ensureCanvas(width * scale, height * scale);
  const ctx = out.getContext("2d", { alpha: false });

  ctx.drawImage(sourceCanvas, 0, 0, out.width, out.height);
  return out;
}

async function canvasToJpegFile(canvas, filename, quality = DEFAULTS.jpegQuality) {
  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("No se pudo generar la imagen final"));
          return;
        }

        resolve(new File([blob], filename, {
          type: "image/jpeg",
          lastModified: Date.now()
        }));
      },
      "image/jpeg",
      quality
    );
  });
}

function analyzeBrightness(imageData) {
  const data = imageData.data;
  let sum = 0;
  let count = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sum += luminance;
    count += 1;
  }

  return count ? sum / count : 0;
}

function analyzeSharpnessVariance(imageData) {
  const { data, width, height } = imageData;

  const gray = new Float32Array(width * height);

  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;

      const lap =
        gray[idx - width] +
        gray[idx - 1] -
        4 * gray[idx] +
        gray[idx + 1] +
        gray[idx + width];

      sum += lap;
      sumSq += lap * lap;
      count += 1;
    }
  }

  if (!count) return 0;

  const mean = sum / count;
  return (sumSq / count) - (mean * mean);
}

function getImageChecks(canvas, mode) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const sampleSize = 220;

  const probe = ensureCanvas(
    canvas.width > canvas.height ? sampleSize : Math.round(sampleSize * (canvas.width / canvas.height)),
    canvas.height >= canvas.width ? sampleSize : Math.round(sampleSize * (canvas.height / canvas.width))
  );

  const pctx = probe.getContext("2d", { willReadFrequently: true });
  pctx.drawImage(canvas, 0, 0, probe.width, probe.height);

  const imageData = pctx.getImageData(0, 0, probe.width, probe.height);

  const brightness = analyzeBrightness(imageData);
  const sharpness = analyzeSharpnessVariance(imageData);

  const warnings = [];

  if (brightness < DEFAULTS.minBrightness) {
    warnings.push("La captura está oscura. Buscá más luz antes de subirla.");
  }

  if (brightness > DEFAULTS.maxBrightness) {
    warnings.push("La captura tiene demasiada luz o reflejo.");
  }

  if (sharpness < DEFAULTS.maxBlurVarianceThreshold) {
    warnings.push(mode === "selfie"
      ? "La selfie parece algo borrosa."
      : "El documento parece algo borroso.");
  }

  return {
    brightness,
    sharpness,
    warnings,
    ok: warnings.length === 0
  };
}

function buildDocumentCanvas(video, crop) {
  const canvas = ensureCanvas(crop.width, crop.height);
  const ctx = canvas.getContext("2d", { alpha: false });

  ctx.drawImage(
    video,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    canvas.width,
    canvas.height
  );

  return canvas;
}

function buildSelfieCanvas(video, crop) {
  const canvas = ensureCanvas(crop.width, crop.height);
  const ctx = canvas.getContext("2d", { alpha: false });

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(
    canvas.width / 2,
    canvas.height / 2,
    canvas.width * 0.47,
    canvas.height * 0.47,
    0,
    0,
    Math.PI * 2
  );
  ctx.closePath();
  ctx.clip();

  ctx.drawImage(
    video,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    canvas.width,
    canvas.height
  );

  ctx.restore();

  return canvas;
}

class CameraCaptureModal {
  constructor(config = {}) {
    this.config = {
      mode: "document",
      docType: "document",
      title: "Capturá una foto",
      subtitle: "",
      captureFacingMode: "environment",
      ...config
    };

    this.root = qs("cameraCaptureModal");
    this.shell = qs("cameraCaptureShell");
    this.video = qs("cameraCaptureVideo");
    this.canvas = qs("cameraCaptureCanvas");
    this.closeBtn = qs("cameraCaptureCloseBtn");
    this.captureBtn = qs("cameraCaptureShootBtn");
    this.retakeBtn = qs("cameraCaptureRetakeBtn");
    this.useBtn = qs("cameraCaptureUseBtn");
    this.switchBtn = qs("cameraCaptureSwitchBtn");
    this.titleNode = qs("cameraCaptureTitle");
    this.subtitleNode = qs("cameraCaptureSubtitle");
    this.hintNode = qs("cameraCaptureHint");
    this.guide = qs("cameraCaptureGuide");
    this.previewWrap = qs("cameraCapturePreviewWrap");
    this.previewImg = qs("cameraCapturePreview");
    this.statusNode = qs("cameraCaptureStatus");

    this.stream = null;
    this.currentFacingMode = this.config.captureFacingMode || "environment";
    this.capturedFile = null;
    this.previewUrl = null;
    this.qualityChecks = null;
    this.isOpen = false;
    this.captureLock = false;

    this.boundClose = this.handleClose.bind(this);
    this.boundCapture = this.handleCapture.bind(this);
    this.boundRetake = this.handleRetake.bind(this);
    this.boundUse = this.handleUse.bind(this);
    this.boundSwitch = this.handleSwitchCamera.bind(this);
    this.boundKeydown = this.handleKeydown.bind(this);
  }

  setStatus(message = "", type = "neutral") {
    if (!this.statusNode) return;

    this.statusNode.textContent = message;
    this.statusNode.dataset.state = type;
  }

  setHint(message = "") {
    if (!this.hintNode) return;
    this.hintNode.textContent = message;
  }

  setModeUI() {
    const isSelfie = this.config.mode === "selfie";

    this.root?.setAttribute("data-mode", this.config.mode);
    this.titleNode.textContent = this.config.title || (isSelfie ? "Tomate una selfie" : "Fotografiá el documento");
    this.subtitleNode.textContent = this.config.subtitle || (
      isSelfie
        ? "Alineá tu rostro dentro de la guía y evitá sombras."
        : "Centrá el documento dentro del marco y evitá reflejos."
    );

    this.guide.classList.toggle("is-selfie", isSelfie);
    this.guide.classList.toggle("is-document", !isSelfie);

    this.captureBtn.textContent = isSelfie ? "Capturar selfie" : "Capturar foto";
    this.useBtn.textContent = isSelfie ? "Usar selfie" : "Usar foto";
    this.retakeBtn.textContent = "Reintentar";

    this.setHint(
      isSelfie
        ? "Poné el rostro dentro de la silueta, con buena luz."
        : "Ajustá el documento dentro del marco. Que se vea completo."
    );
  }

  attachEvents() {
    this.closeBtn?.addEventListener("click", this.boundClose);
    this.captureBtn?.addEventListener("click", this.boundCapture);
    this.retakeBtn?.addEventListener("click", this.boundRetake);
    this.useBtn?.addEventListener("click", this.boundUse);
    this.switchBtn?.addEventListener("click", this.boundSwitch);
    document.addEventListener("keydown", this.boundKeydown);
  }

  detachEvents() {
    this.closeBtn?.removeEventListener("click", this.boundClose);
    this.captureBtn?.removeEventListener("click", this.boundCapture);
    this.retakeBtn?.removeEventListener("click", this.boundRetake);
    this.useBtn?.removeEventListener("click", this.boundUse);
    this.switchBtn?.removeEventListener("click", this.boundSwitch);
    document.removeEventListener("keydown", this.boundKeydown);
  }

  handleKeydown(event) {
    if (!this.isOpen) return;
    if (event.key === "Escape") {
      this.rejectAndClose(new Error("Captura cancelada por el usuario"));
    }
  }

  async open() {
    if (!this.root || !this.video || !this.shell || !this.guide) {
      throw new Error("Falta el markup del modal de cámara");
    }

    if (!navigator.mediaDevices?.getUserMedia || !isSecureContextAvailable()) {
      throw new Error("La cámara custom no está disponible en este navegador o contexto");
    }

    this.setModeUI();
    this.attachEvents();
    this.resetPreviewState();

    this.root.hidden = false;
    this.root.classList.add("is-open");
    document.documentElement.classList.add("camera-capture-open");
    document.body.classList.add("camera-capture-open");
    this.isOpen = true;

    await this.startStream();
    await this.waitForVideoReady();

    return await new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
  }

  async startStream() {
    this.stopStream();

    this.setStatus("Abriendo cámara...", "pending");

    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: this.currentFacingMode },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.video.srcObject = this.stream;
      this.video.setAttribute("playsinline", "true");
      this.video.muted = true;
      await this.video.play();

      this.captureBtn.disabled = false;
      this.switchBtn.disabled = false;
      this.setStatus("", "neutral");
    } catch (err) {
      this.captureBtn.disabled = true;
      this.switchBtn.disabled = true;
      this.setStatus("No pudimos acceder a la cámara.", "error");
      throw err;
    }
  }

  stopStream() {
    if (!this.stream) return;

    this.stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {}
    });

    this.stream = null;
  }

  async waitForVideoReady() {
    if (this.video.readyState >= 2 && this.video.videoWidth && this.video.videoHeight) {
      return;
    }

    await new Promise((resolve, reject) => {
      let settled = false;

      const onReady = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };

      const onError = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error("No se pudo inicializar el video de cámara"));
      };

      const cleanup = () => {
        this.video.removeEventListener("loadedmetadata", onReady);
        this.video.removeEventListener("canplay", onReady);
        this.video.removeEventListener("error", onError);
      };

      this.video.addEventListener("loadedmetadata", onReady, { once: true });
      this.video.addEventListener("canplay", onReady, { once: true });
      this.video.addEventListener("error", onError, { once: true });
    });

    await wait(80);
  }

  async handleSwitchCamera() {
    if (this.captureLock) return;

    this.currentFacingMode = this.currentFacingMode === "user" ? "environment" : "user";

    try {
      await this.startStream();
      await this.waitForVideoReady();
    } catch (err) {
      this.setStatus("No pudimos cambiar la cámara.", "warning");
    }
  }

  async handleCapture() {
    if (this.captureLock) return;
    if (!this.video.videoWidth || !this.video.videoHeight) {
      this.setStatus("La cámara todavía no está lista.", "warning");
      return;
    }

    this.captureLock = true;
    this.captureBtn.disabled = true;
    this.setStatus("Procesando captura...", "pending");

    try {
      const containerRect = this.shell.getBoundingClientRect();
      const guideRect = getGuideRect(this.shell, this.guide, this.config.mode);
      const crop = computeCropFromGuide({
        videoWidth: this.video.videoWidth,
        videoHeight: this.video.videoHeight,
        containerWidth: containerRect.width,
        containerHeight: containerRect.height,
        guideRect
      });

      let rawCanvas;

      if (this.config.mode === "selfie") {
        rawCanvas = buildSelfieCanvas(this.video, crop);
      } else {
        rawCanvas = buildDocumentCanvas(this.video, crop);
      }

      const resized = resizeCanvasOutput(rawCanvas, DEFAULTS.targetMaxSide);
      const checks = getImageChecks(resized, this.config.mode);
      const file = await canvasToJpegFile(
        resized,
        fileNameForDocType(this.config.docType, this.config.mode),
        DEFAULTS.jpegQuality
      );

      this.qualityChecks = checks;
      this.capturedFile = file;

      this.showPreviewFromCanvas(resized);

      if (checks.ok) {
        this.setStatus("Captura lista. Se ve bien para continuar.", "success");
      } else {
        this.setStatus(checks.warnings[0] || "La captura requiere revisión visual.", "warning");
      }

      this.captureBtn.disabled = true;
      this.useBtn.disabled = false;
      this.retakeBtn.disabled = false;
      this.switchBtn.disabled = false;
      this.setHint(
        checks.ok
          ? "Revisá la imagen. Si está bien, usala."
          : "Podés usarla igual o reintentar para mejorarla."
      );
    } catch (err) {
      console.error("[camera-capture] handleCapture", err);
      this.setStatus("No pudimos procesar la captura.", "error");
      this.captureBtn.disabled = false;
    } finally {
      this.captureLock = false;
    }
  }

  showPreviewFromCanvas(canvas) {
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = null;
    }

    this.previewUrl = canvas.toDataURL("image/jpeg", 0.9);
    this.previewImg.src = this.previewUrl;
    this.previewWrap.hidden = false;
    this.root.classList.add("has-preview");
  }

  async handleRetake() {
    this.resetPreviewState();
    this.setStatus("", "neutral");
    this.setHint(
      this.config.mode === "selfie"
        ? "Poné el rostro dentro de la silueta, con buena luz."
        : "Ajustá el documento dentro del marco. Que se vea completo."
    );
    this.captureBtn.disabled = false;
  }

  async handleUse() {
    if (!this.capturedFile) {
      this.setStatus("Todavía no hay una captura lista.", "warning");
      return;
    }

    this.resolveAndClose({
      file: this.capturedFile,
      qualityChecks: this.qualityChecks || null
    });
  }

  handleClose() {
    this.rejectAndClose(new Error("Captura cancelada por el usuario"));
  }

  resetPreviewState() {
    this.capturedFile = null;
    this.qualityChecks = null;
    this.previewWrap.hidden = true;
    this.root.classList.remove("has-preview");
    this.previewImg.removeAttribute("src");
    this.useBtn.disabled = true;
    this.retakeBtn.disabled = true;
    this.captureBtn.disabled = false;

    if (this.previewUrl?.startsWith?.("blob:")) {
      URL.revokeObjectURL(this.previewUrl);
    }
    this.previewUrl = null;
  }

  cleanup() {
    this.stopStream();
    this.detachEvents();
    this.resetPreviewState();

    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
    }

    if (this.root) {
      this.root.classList.remove("is-open");
      this.root.hidden = true;
    }

    document.documentElement.classList.remove("camera-capture-open");
    document.body.classList.remove("camera-capture-open");
    this.isOpen = false;
  }

  resolveAndClose(payload) {
    const resolve = this._resolve;
    this._resolve = null;
    this._reject = null;
    this.cleanup();
    if (resolve) resolve(payload);
  }

  rejectAndClose(error) {
    const reject = this._reject;
    this._resolve = null;
    this._reject = null;
    this.cleanup();
    if (reject) reject(error);
  }
}

export async function openCameraCaptureModal(config = {}) {
  const modal = new CameraCaptureModal(config);
  return await modal.open();
}
