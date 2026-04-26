import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  RekognitionClient,
  DetectFacesCommand,
  DetectTextCommand,
  CompareFacesCommand,
} from "npm:@aws-sdk/client-rekognition";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "service-provider-documents";

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

    const { data: userData, error: userError } =
      await supabaseAdmin.auth.getUser(token);

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
      .select("id,provider_id,document_type,storage_bucket,storage_path,review_status,metadata_json,created_at")
      .eq("provider_id", providerId)
      .in("document_type", ["dni_front", "selfie"])
      .order("created_at", { ascending: false });

    if (docsError) {
      return fail("No se pudieron leer documentos.", 500, docsError);
    }

    const dniFront = docs?.find((doc) => doc.document_type === "dni_front");
    const selfie = docs?.find((doc) => doc.document_type === "selfie");
    const imageExtRegex = /\.(jpg|jpeg|png|webp)$/i;

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

    async function downloadBytes(path: string) {
      const { data, error } = await supabaseAdmin.storage
        .from(BUCKET)
        .download(path);

      if (error || !data) {
        throw error ?? new Error("No se pudo descargar archivo.");
      }

      return new Uint8Array(await data.arrayBuffer());
    }

    const dniBytes = await downloadBytes(dniFront.storage_path);
    const selfieBytes = await downloadBytes(selfie.storage_path);

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
      const compare = await rekognition.send(
        new CompareFacesCommand({
          SourceImage: { Bytes: selfieBytes },
          TargetImage: { Bytes: dniBytes },
          SimilarityThreshold: 60,
        }),
      );

      faceMatchScore = Number(compare.FaceMatches?.[0]?.Similarity ?? 0);
    }

let riskFlags: string[] = [];

if (!faceDetected) {
  riskFlags.push("NO_FACE");
}
if (faceMatchScore > 0 && faceMatchScore < 45) {
  riskFlags.push("VERY_LOW_FACE_MATCH");
}
if (faceMatchScore < 60) {
  riskFlags.push("LOW_FACE_MATCH");
}

if (!ocrText || ocrText.length < 10) {
  riskFlags.push("NO_OCR_DATA");
}

if (ocrText && !/\d{7,9}/.test(ocrText)) {
  riskFlags.push("DNI_NOT_DETECTED");
}

if (docs.length > 10) {
  riskFlags.push("TOO_MANY_ATTEMPTS");
}

const aiScore = Math.max(
  0,
  100
  - (riskFlags.length * 25)
  + (faceMatchScore * 0.5)
);

const aiScoreLabel = scoreLabel(aiScore);

// 🔥 NUEVA LÓGICA INTELIGENTE
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

if (
  riskFlags.includes("VERY_LOW_FACE_MATCH") ||
  riskFlags.length >= 3
) {
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
    engine: "aws_rekognition",

    face_detected: faceDetected,
    face_match_score: faceMatchScore,
    liveness_score: null,

    ocr_text: ocrText,
    dni_number_detected: null,
    full_name_detected: null,

    ai_score: aiScore,
    ai_score_label: aiScoreLabel,

    risk_flags: riskFlags,
    raw_result: verificationPayload,
  });

if (checkInsertError) {
  return fail(
    "No se pudo guardar auditoría de verificación.",
    500,
    checkInsertError,
  );
}

for (const doc of [dniFront, selfie]) {
  const { error: updateDocError } = await supabaseAdmin
    .from("svc_provider_documents")
    .update({
      review_status: nextReviewStatus,
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
    return fail(
      "No se pudo actualizar estado de documentos.",
      500,
      updateDocError,
    );
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
  
    return json({
      ok: true,
      status: nextReviewStatus,
      result: verificationPayload,
    });
  } catch (error) {
    console.error("[svc-verify-provider-identity]", error);
    return fail("Error verificando identidad.", 500, {
      message: error?.message ?? String(error),
    });
  }
});