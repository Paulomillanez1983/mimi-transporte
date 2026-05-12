import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  RekognitionClient,
  DetectFacesCommand,
  DetectTextCommand,
  CompareFacesCommand,
} from "npm:@aws-sdk/client-rekognition";

/**
 * Extrae nombre completo y DNI desde el texto OCR de un DNI argentino.
 * Patrón típico:
 *   ...
 *   Apellido / Surname
 *   MILLANEZ
 *   Nombre / Name
 *   PAULO ALBERTO
 *   ...
 *   30.658.227
 */
function parseDniOcr(ocrText: string): { fullName: string | null; dniNumber: string | null } {
  if (!ocrText || typeof ocrText !== "string") return { fullName: null, dniNumber: null };

  const lines = ocrText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  // Encontrar líneas que sean MAYÚSCULAS puras (típico del DNI)
  const isUpperNamePart = (s: string) =>
    /^[A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ\s]{1,40}$/.test(s) && s.length >= 2 && s.length <= 50;

  let surname: string | null = null;
  let names: string | null = null;

  for (let i = 0; i < lines.length - 1; i++) {
    const cur = lines[i].toLowerCase();
    const next = lines[i + 1];

    // Apellido / Surname
    if (
      !surname &&
      (cur.includes("apellido") || cur.includes("surname")) &&
      isUpperNamePart(next)
    ) {
      surname = next;
    }

    // Nombre / Name (también acepta typos OCR como "Nombra", "Numbra")
    if (
      !names &&
      (cur.includes("nombre") ||
        cur.includes("name") ||
        cur.includes("nombra") ||
        cur.includes("numbra")) &&
      isUpperNamePart(next)
    ) {
      names = next;
    }
  }

  // DNI: número con formato X.XXX.XXX o XX.XXX.XXX (separador opcional . o espacio)
  let dniNumber: string | null = null;
  const dniMatch = ocrText.match(/\b(\d{1,2})[.\s](\d{3})[.\s](\d{3})\b/);
  if (dniMatch) {
    dniNumber = `${dniMatch[1]}${dniMatch[2]}${dniMatch[3]}`;
  } else {
    // fallback: cualquier secuencia de 7-8 dígitos juntos
    const alt = ocrText.match(/\b(\d{7,8})\b/);
    if (alt) dniNumber = alt[1];
  }

  let fullName: string | null = null;
  if (names && surname) {
    fullName = `${names} ${surname}`.replace(/\s+/g, " ").trim();
  } else if (names) {
    fullName = names.trim();
  } else if (surname) {
    fullName = surname.trim();
  }

  return { fullName, dniNumber };
}

/** Devuelve solo el primer nombre, capitalizado (ej "PAULO ALBERTO MILLANEZ" → "Paulo") */
function firstNameFromFullName(fullName: string | null): string | null {
  if (!fullName) return null;
  const first = fullName.trim().split(/\s+/).find(Boolean);
  if (!first || first.length < 2) return null;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "service-provider-documents";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const KYC_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const KYC_RATE_LIMIT_MAX_ATTEMPTS = 3;
const KYC_DUPLICATE_WINDOW_MS = 2 * 60 * 1000;
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fail(message: string, status = 400, details: unknown = null) {
  return json({ ok: false, error: message, details }, status);
}

function scoreLabel(score: number) {
  if (score >= 85) return "PASS";
  if (score >= 65) return "REVIEW";
  return "FAIL";
}

function normalizeDocumentReviewStatus(status: string) {
  return status === "REJECTED" ? "REJECTED" : "PENDING";
}

function storagePathBelongsToUser(path: string | null | undefined, userId: string) {
  const value = String(path || "").replace(/^\/+/, "");
  return value.startsWith(`${userId}/`);
}

function sniffImageMime(bytes: Uint8Array) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

function assertImageDocumentBytes(bytes: Uint8Array, label: string) {
  if (!bytes.length) {
    throw new Error(`${label}_empty`);
  }
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new Error(`${label}_too_large`);
  }
  const mime = sniffImageMime(bytes);
  if (!mime || !ALLOWED_IMAGE_MIME_TYPES.has(mime)) {
    throw new Error(`${label}_invalid_image`);
  }
  return mime;
}

async function logKycAudit(
  supabaseAdmin: ReturnType<typeof createClient>,
  input: {
    userId: string;
    providerId: string;
    eventType: string;
    metadata?: Record<string, unknown>;
    req: Request;
  },
) {
  const userAgent = input.req.headers.get("user-agent")?.slice(0, 300) || null;
  await supabaseAdmin
    .from("audit_logs")
    .insert({
      user_id: input.userId,
      actor_type: "provider",
      event_type: input.eventType,
      entity_type: "svc_provider_identity_check",
      entity_id: input.providerId,
      metadata: input.metadata || {},
      user_agent: userAgent,
    })
    .throwOnError()
    .catch((error) => {
      console.warn("[svc-verify-provider-identity] audit log skipped:", error?.message || error);
    });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return fail("Method not allowed", 405);
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const AWS_REGION = Deno.env.get("AWS_REGION") ?? "us-east-1";
    const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID");
    const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return fail("Faltan secretos de Supabase.", 500);
    }

    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      return fail("Faltan secretos AWS para Rekognition.", 500);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();

    if (!token) {
      return fail("AUTH_REQUIRED", 401);
    }

    const body = await req.json().catch(() => ({}));
    const providerId = String(body.provider_id ?? "").trim();

    if (!providerId) {
      return fail("provider_id requerido.", 400);
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !userData?.user?.id) {
      return fail("Sesión inválida.", 401, userError);
    }

    const userId = userData.user.id;

    const { data: provider, error: providerError } = await supabaseAdmin
      .from("svc_providers")
      .select("id,user_id,approved,blocked")
      .eq("id", providerId)
      .single();

    if (providerError || !provider) {
      return fail("Prestador no encontrado.", 404, providerError);
    }

    if (provider.user_id !== userId) {
      return fail("No podés verificar documentos de otro prestador.", 403);
    }

    const { data: docs, error: docsError } = await supabaseAdmin
      .from("svc_provider_documents")
      .select("id,provider_id,document_type,storage_bucket,storage_path,mime_type,file_size_bytes,review_status,metadata_json,created_at")
      .eq("provider_id", providerId)
      .in("document_type", ["dni_front", "selfie"])
      .order("created_at", { ascending: false });

    if (docsError) {
      return fail("No se pudieron leer documentos.", 500, docsError);
    }

    const dniFront = docs?.find((doc) => doc.document_type === "dni_front");
    const selfie = docs?.find((doc) => doc.document_type === "selfie");
    const imageExtRegex = /\.(jpg|jpeg|png|webp)$/i;

    for (const doc of [dniFront, selfie].filter(Boolean)) {
      if (doc.storage_bucket !== BUCKET) {
        return fail("Documento inválido para verificación.", 400);
      }
      if (!storagePathBelongsToUser(doc.storage_path, userId)) {
        await logKycAudit(supabaseAdmin, {
          userId,
          providerId,
          eventType: "kyc_document_path_forbidden",
          req,
          metadata: { document_type: doc.document_type },
        });
        return fail("Documento inválido para este prestador.", 403);
      }
      if (doc.file_size_bytes && Number(doc.file_size_bytes) > MAX_IMAGE_BYTES) {
        return fail("La imagen supera el tamaño máximo permitido.", 400);
      }
      if (doc.mime_type && !ALLOWED_IMAGE_MIME_TYPES.has(String(doc.mime_type))) {
        return fail("Formato de imagen inválido para verificación.", 400);
      }
    }

    if (dniFront && !imageExtRegex.test(dniFront.storage_path ?? "")) {
      return fail("DNI inválido. Solo se permiten imágenes tomadas con cámara.", 400);
    }

    if (selfie && !imageExtRegex.test(selfie.storage_path ?? "")) {
      return fail("Selfie inválida. Solo se permiten imágenes tomadas con cámara.", 400);
    }

    if (!dniFront || !selfie) {
      return json({
        ok: true,
        status: "PENDING_DOCUMENTS",
        message: "Faltan DNI frente o selfie para verificar identidad.",
      });
    }

    const recentSince = new Date(Date.now() - KYC_RATE_LIMIT_WINDOW_MS).toISOString();
    const duplicateSince = new Date(Date.now() - KYC_DUPLICATE_WINDOW_MS).toISOString();
    const { data: recentChecks, error: recentChecksError } = await supabaseAdmin
      .from("svc_provider_identity_checks")
      .select("id,status,created_at,dni_front_document_id,selfie_document_id")
      .eq("provider_id", providerId)
      .gte("created_at", recentSince)
      .order("created_at", { ascending: false })
      .limit(KYC_RATE_LIMIT_MAX_ATTEMPTS + 1);

    if (recentChecksError) {
      return fail("No se pudo validar frecuencia de verificación.", 500, recentChecksError);
    }

    const duplicateCheck = (recentChecks || []).find((check) =>
      check.dni_front_document_id === dniFront.id &&
      check.selfie_document_id === selfie.id &&
      String(check.created_at || "") >= duplicateSince
    );

    if (duplicateCheck) {
      await logKycAudit(supabaseAdmin, {
        userId,
        providerId,
        eventType: "kyc_duplicate_check_reused",
        req,
        metadata: { identity_check_id: duplicateCheck.id, status: duplicateCheck.status },
      });
      return json({
        ok: true,
        status: duplicateCheck.status,
        reused: true,
        message: "Verificación reciente reutilizada para evitar procesos duplicados.",
      });
    }

    if ((recentChecks || []).length >= KYC_RATE_LIMIT_MAX_ATTEMPTS) {
      await logKycAudit(supabaseAdmin, {
        userId,
        providerId,
        eventType: "kyc_rate_limited",
        req,
        metadata: { window_minutes: KYC_RATE_LIMIT_WINDOW_MS / 60000 },
      });
      return fail("Demasiados intentos de verificación. Probá nuevamente en unos minutos.", 429);
    }

    async function downloadBytes(path: string) {
      const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(path);

      if (error || !data) {
        throw error ?? new Error("No se pudo descargar archivo.");
      }

      return new Uint8Array(await data.arrayBuffer());
    }

    const dniBytes = await downloadBytes(dniFront.storage_path);
    const selfieBytes = await downloadBytes(selfie.storage_path);
    const dniMime = assertImageDocumentBytes(dniBytes, "dni_front");
    const selfieMime = assertImageDocumentBytes(selfieBytes, "selfie");

    await logKycAudit(supabaseAdmin, {
      userId,
      providerId,
      eventType: "kyc_verification_started",
      req,
      metadata: {
        dni_front_document_id: dniFront.id,
        selfie_document_id: selfie.id,
        dni_mime: dniMime,
        selfie_mime: selfieMime,
      },
    });

    const rekognition = new RekognitionClient({
      region: AWS_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
      },
    });

    const selfieFaces = await rekognition.send(
      new DetectFacesCommand({
        Image: { Bytes: selfieBytes },
        Attributes: ["DEFAULT"],
      }),
    );

    const faceDetected = Boolean(selfieFaces.FaceDetails?.length);

    const dniText = await rekognition.send(
      new DetectTextCommand({
        Image: { Bytes: dniBytes },
      }),
    );

    const ocrText = (dniText.TextDetections ?? [])
      .filter((item) => item.Type === "LINE" && item.DetectedText)
      .map((item) => item.DetectedText)
      .join("\n");

    let faceMatchScore = 0;

    if (faceDetected) {
      try {
        const compare = await rekognition.send(
          new CompareFacesCommand({
            SourceImage: { Bytes: selfieBytes },
            TargetImage: { Bytes: dniBytes },
            SimilarityThreshold: 60,
          }),
        );

        faceMatchScore = Number(compare.FaceMatches?.[0]?.Similarity ?? 0);
      } catch (err) {
        console.warn("[svc-verify-provider-identity] CompareFaces skipped:", err);
        faceMatchScore = 0;
      }
    }

    const riskFlags: string[] = [];

    if (!faceDetected) riskFlags.push("NO_FACE");
    if (faceMatchScore > 0 && faceMatchScore < 45) riskFlags.push("VERY_LOW_FACE_MATCH");
    if (faceMatchScore < 60) riskFlags.push("LOW_FACE_MATCH");
    if (!ocrText || ocrText.length < 10) riskFlags.push("NO_OCR_DATA");
    if (ocrText && !/\d{7,9}/.test(ocrText)) riskFlags.push("DNI_NOT_DETECTED");
    if ((docs?.length ?? 0) > 10) riskFlags.push("TOO_MANY_ATTEMPTS");

    const aiScore = Math.max(0, 100 - (riskFlags.length * 25) + (faceMatchScore * 0.5));
    const aiScoreLabel = scoreLabel(aiScore);

    let nextReviewStatus = "REVIEW";

    if (aiScoreLabel === "PASS" && riskFlags.length === 0) {
      nextReviewStatus = "PENDING";
    }

    if (
      riskFlags.includes("NO_FACE") ||
      riskFlags.includes("NO_OCR_DATA") ||
      riskFlags.includes("DNI_NOT_DETECTED")
    ) {
      nextReviewStatus = "NEEDS_RESUBMISSION";
    }

    if (riskFlags.includes("VERY_LOW_FACE_MATCH") || riskFlags.length >= 3) {
      nextReviewStatus = "REJECTED";
    }

    const verificationPayload = {
      provider_id: providerId,
      verified_at: new Date().toISOString(),
      face_detected: faceDetected,
      face_match_score: faceMatchScore,
      liveness_score: null,
      ocr_text: ocrText,
      ai_score: aiScore,
      ai_score_label: aiScoreLabel,
      risk_flags: riskFlags,
      engine: "aws_rekognition",
      note:
        aiScoreLabel === "PASS"
          ? "Identidad validada por IA. Pendiente de revisión final."
          : aiScoreLabel === "REVIEW"
            ? "La IA recomienda revisión manual."
            : "La IA recomienda reenviar documentos.",
    };

    const { error: checkInsertError } = await supabaseAdmin
      .from("svc_provider_identity_checks")
      .insert({
        provider_id: providerId,
        dni_front_document_id: dniFront.id,
        selfie_document_id: selfie.id,
        status: nextReviewStatus,
        face_detected: faceDetected,
        face_match_score: faceMatchScore,
        liveness_score: null,
        ocr_text: ocrText,
        // Parser: extrae nombre y DNI del texto OCR del DNI argentino.
        // Antes hardcodeado a null → ningún prestador tenía nombre real,
        // por eso aparecía "Voltex" (nombre comercial del email) en los cards.
        dni_number_detected: parseDniOcr(ocrText).dniNumber,
        full_name_detected: parseDniOcr(ocrText).fullName,
        ai_score: aiScore,
        ai_score_label: aiScoreLabel,
        risk_flags: riskFlags,
        raw_result: verificationPayload,
      });

    // Si la OCR detectó un nombre y el profile no tiene first_name cargado, lo populamos
    // con el primer nombre del DNI. Esto evita que aparezca el nombre del email/Google
    // (ej "Voltex") al cliente cuando busca prestadores.
    const parsed = parseDniOcr(ocrText);
    const firstNameFromDni = firstNameFromFullName(parsed.fullName);
    if (firstNameFromDni) {
      const { data: existingProfile } = await supabaseAdmin
        .from("svc_provider_profiles")
        .select("first_name")
        .eq("provider_id", providerId)
        .maybeSingle();

      if (!existingProfile?.first_name) {
        await supabaseAdmin
          .from("svc_provider_profiles")
          .upsert(
            {
              provider_id: providerId,
              first_name: firstNameFromDni,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "provider_id" }
          );
      }
    }

    if (checkInsertError) {
      return fail("No se pudo guardar auditoría de verificación.", 500, checkInsertError);
    }

    const docReviewStatus = normalizeDocumentReviewStatus(nextReviewStatus);

    for (const doc of [dniFront, selfie]) {
      const { error: updateDocError } = await supabaseAdmin
        .from("svc_provider_documents")
        .update({
          review_status: docReviewStatus,
          review_notes: verificationPayload.note,
          metadata_json: {
            ...(doc.metadata_json ?? {}),
            last_identity_check: {
              ai_score: aiScore,
              ai_score_label: aiScoreLabel,
              face_match_score: faceMatchScore,
              checked_at: verificationPayload.verified_at,
            },
          },
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", doc.id);

      if (updateDocError) {
        return fail("No se pudo actualizar estado de documentos.", 500, updateDocError);
      }
    }

    await supabaseAdmin
      .from("svc_providers")
      .update({
        approved: false,
        blocked: nextReviewStatus === "REJECTED",
        status: nextReviewStatus === "REJECTED" ? "BLOCKED" : "OFFLINE",
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", providerId);

const { error: profileUpdateError } = await supabaseAdmin
  .from("svc_provider_profiles")
  .upsert(
    {
      provider_id: providerId,
      ai_score: aiScore,
      ai_score_label: aiScoreLabel,
      kyc_status: nextReviewStatus.toLowerCase(),
      review_status: nextReviewStatus.toLowerCase(),
      review_required: nextReviewStatus !== "PENDING",
      risk_flags: riskFlags,
      reviewed_at: verificationPayload.verified_at,
    },
    { onConflict: "provider_id" }
  );

if (profileUpdateError) {
  return fail("No se pudo actualizar score del perfil.", 500, profileUpdateError);
}
    await logKycAudit(supabaseAdmin, {
      userId,
      providerId,
      eventType: "kyc_verification_completed",
      req,
      metadata: {
        status: nextReviewStatus,
        ai_score: aiScore,
        ai_score_label: aiScoreLabel,
        risk_flags: riskFlags,
      },
    });

    return json({
      ok: true,
      status: nextReviewStatus,
      result: verificationPayload,
    });
  } catch (error) {
    console.error("[svc-verify-provider-identity]", error);
    const errorMessage = error?.message ?? String(error);
    if (/^(dni_front|selfie)_(empty|too_large|invalid_image)$/.test(errorMessage)) {
      return fail("Documento inválido. Subí una imagen JPG, PNG o WEBP clara y liviana.", 400);
    }
    return fail("Error verificando identidad.", 500, {
      message: errorMessage,
    });
  }
});
