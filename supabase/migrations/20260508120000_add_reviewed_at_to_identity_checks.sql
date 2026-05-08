-- Agrega la columna reviewed_at a svc_provider_identity_checks.
-- Varias edge functions (admin-list-service-providers, admin-review-service-provider,
-- svc-verify-provider-identity, svc-search-providers) leen y escriben esta columna,
-- pero la tabla original (migración 20260504135848) no la incluye, lo que provocaba
-- errores 42703 ("column does not exist") en runtime.

ALTER TABLE "public"."svc_provider_identity_checks"
  ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp with time zone;

-- Índice para los ORDER BY reviewed_at DESC NULLS LAST que hacen las edge functions.
CREATE INDEX IF NOT EXISTS "idx_identity_checks_reviewed_at"
  ON "public"."svc_provider_identity_checks" ("reviewed_at" DESC NULLS LAST);

-- Backfill: para los registros ya revisados (status != PENDING_REVIEW) que no tengan
-- reviewed_at seteado, usamos updated_at como aproximación razonable.
UPDATE "public"."svc_provider_identity_checks"
SET "reviewed_at" = "updated_at"
WHERE "reviewed_at" IS NULL
  AND "status" IS DISTINCT FROM 'PENDING_REVIEW';
