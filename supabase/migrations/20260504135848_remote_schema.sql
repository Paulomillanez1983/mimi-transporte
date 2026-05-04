create extension if not exists "pg_cron" with schema "pg_catalog";

drop extension if exists "pg_net";

create extension if not exists "http" with schema "public";

create extension if not exists "pg_net" with schema "public";

create extension if not exists "pg_trgm" with schema "public";

create extension if not exists "postgis" with schema "public";


  create table "public"."admin_users" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "role" text not null default 'ADMIN'::text,
    "active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "email" text
      );


alter table "public"."admin_users" enable row level security;


  create table "public"."audit_logs" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid,
    "actor_type" text,
    "event_type" text not null,
    "entity_type" text not null,
    "entity_id" text,
    "metadata" jsonb not null default '{}'::jsonb,
    "ip_address" inet,
    "user_agent" text,
    "device_id" text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."audit_logs" enable row level security;


  create table "public"."cancellation_rules" (
    "id" uuid not null default gen_random_uuid(),
    "context_type" text not null,
    "status" text not null default 'DEFAULT'::text,
    "cancelled_by" text not null default 'client'::text,
    "fee_percentage" numeric(7,4) not null default 0,
    "fixed_fee" numeric(12,2) not null default 0,
    "platform_share_percentage" numeric(7,4) not null default 0,
    "provider_share_percentage" numeric(7,4) not null default 100,
    "active" boolean not null default true,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."cancellation_rules" enable row level security;


  create table "public"."choferes" (
    "id_uuid" uuid not null default gen_random_uuid(),
    "user_id" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "nombre" text,
    "telefono" text,
    "lat" double precision,
    "lng" double precision,
    "online" boolean not null default false,
    "disponible" boolean not null default true,
    "bloqueado" boolean not null default false,
    "en_viaje" boolean not null default false,
    "rating_promedio" numeric not null default 5,
    "aceptacion_rate" numeric not null default 100,
    "rechazos_recientes" integer not null default 0,
    "total_viajes" integer not null default 0,
    "last_location_at" timestamp with time zone,
    "last_seen_at" timestamp with time zone,
    "ultimo_viaje_id" uuid,
    "ultimo_offer_at" timestamp with time zone,
    "rating" numeric default 5,
    "viajes_completados" integer default 0,
    "cancelaciones" integer default 0,
    "score" numeric default 0,
    "ultimo_ping" timestamp with time zone,
    "cancelaciones_recientes" integer default 0,
    "pausado_hasta" timestamp with time zone,
    "email" text,
    "foto_url" text,
    "activo" boolean default true
      );


alter table "public"."choferes" enable row level security;


  create table "public"."commission_rules" (
    "id" uuid not null default gen_random_uuid(),
    "service_type" text not null default 'DEFAULT'::text,
    "percentage" numeric(7,4) not null default 10,
    "minimum_fee" numeric(12,2) not null default 0,
    "fixed_fee" numeric(12,2) not null default 0,
    "rounding" text not null default 'ceil'::text,
    "active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."commission_rules" enable row level security;


  create table "public"."consent_ledger" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "actor_type" text not null,
    "consent_type" text not null,
    "status" text not null,
    "source" text not null,
    "reason" text,
    "occurred_at" timestamp with time zone not null default now(),
    "ip_address" inet,
    "user_agent" text,
    "device_id" text,
    "evidence_payload" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."consent_ledger" enable row level security;


  create table "public"."cotizaciones" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "cliente_auth_id" uuid,
    "cliente_email" text,
    "servicio" text,
    "tipo_vehiculo" text default 'standard'::text,
    "origen" text,
    "origen_corto" text,
    "origen_lat" double precision,
    "origen_lng" double precision,
    "destino" text,
    "destino_corto" text,
    "destino_lat" double precision,
    "destino_lng" double precision,
    "distancia_km" numeric,
    "duracion_min" integer,
    "distancia_km_total" numeric,
    "duracion_min_total" integer,
    "paradas" jsonb not null default '[]'::jsonb,
    "waypoints" jsonb not null default '[]'::jsonb,
    "stops" jsonb not null default '[]'::jsonb,
    "puntos_ruta" jsonb not null default '[]'::jsonb,
    "resumen_ruta_front" text,
    "segmentos_totales_front" integer default 0,
    "retorno_al_origen_front" boolean not null default false,
    "cantidad_paradas_front" integer not null default 0,
    "ruta_calculada_completa" boolean not null default false,
    "cotizacion_multitramo" boolean not null default false,
    "espera_min" integer not null default 0,
    "factor_zona" numeric not null default 1,
    "precio_total" numeric,
    "moneda" text not null default 'ARS'::text,
    "payload" jsonb not null default '{}'::jsonb,
    "cantidad_paradas" integer default 0,
    "retorno_al_origen" boolean default false,
    "segmentos_totales" integer default 0,
    "ruta_calculada" boolean default false,
    "factor_horario" numeric default 1,
    "precio_base" numeric,
    "precio_km" numeric,
    "precio_min" numeric,
    "recargo" numeric,
    "precio_final" numeric,
    "fecha_hora" timestamp with time zone,
    "geometria" jsonb,
    "distancia_metros" integer,
    "duracion_segundos" integer,
    "proveedor_ruta" text,
    "precision_ruta" numeric,
    "observaciones" text,
    "legs" jsonb,
    "steps" jsonb,
    "polyline" text,
    "route_summary" text,
    "route_metadata" jsonb,
    "minimo_operativo" numeric,
    "tarifa_base" numeric,
    "tarifa_km" numeric,
    "tarifa_min" numeric,
    "recargo_horario" numeric,
    "recargo_zona" numeric,
    "total_calculado" numeric,
    "precio" numeric,
    "subtotal" numeric,
    "total" numeric,
    "moneda_codigo" text default 'ARS'::text,
    "puntos_ruta_originales" jsonb,
    "puntos_ruta_procesados" jsonb,
    "origen_obj" jsonb,
    "destino_obj" jsonb,
    "metadata" jsonb,
    "recargo_espera" numeric,
    "precio_espera" numeric,
    "espera_minutos" integer,
    "recargo_paradas" numeric,
    "recargo_retorno" numeric,
    "recargo_ida_vuelta_escolar" numeric,
    "recargo_escolar" numeric,
    "recargo_trafico" numeric,
    "recargo_nocturno" numeric,
    "recargo_dinamico" numeric,
    "redondeo" numeric,
    "precio_redondeado" numeric,
    "diferencia_redondeo" numeric,
    "resumen_ruta" text,
    "resumen_corto" text,
    "descripcion_ruta" text,
    "etiqueta_ruta" text,
    "route_geometry" jsonb,
    "snap_summary" jsonb,
    "snapped_points" jsonb,
    "snap_metadata" jsonb,
    "route_debug" jsonb,
    "source" text,
    "provider" text,
    "engine" text,
    "backend_version" text,
    "route_geometry_full" jsonb
      );


alter table "public"."cotizaciones" enable row level security;


  create table "public"."document_hashes" (
    "id" uuid not null default gen_random_uuid(),
    "document_code" text not null,
    "version" text not null,
    "hash_sha256" text not null,
    "hash_algorithm" text not null default 'sha256'::text,
    "generated_at" timestamp with time zone not null default now()
      );


alter table "public"."document_hashes" enable row level security;


  create table "public"."driver_documents" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "doc_type" text not null,
    "storage_path" text not null,
    "mime_type" text,
    "file_size" bigint,
    "status" text not null default 'PENDIENTE'::text,
    "rejection_reason" text,
    "review_required" boolean not null default true,
    "validation_status" text not null default 'PENDING'::text,
    "face_detected" boolean,
    "document_detected" boolean,
    "confidence_score" numeric(5,2),
    "ocr_text" text,
    "ocr_fields" jsonb,
    "validation_notes" text,
    "provider" text,
    "provider_raw" jsonb,
    "auto_checked_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."driver_documents" enable row level security;


  create table "public"."driver_profiles" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "email" text,
    "full_name" text,
    "phone" text,
    "address" text,
    "city" text,
    "province" text,
    "dni" text,
    "license_number" text,
    "vehicle_brand" text,
    "vehicle_model" text,
    "vehicle_year" integer,
    "vehicle_plate" text,
    "photo_url" text,
    "documents_approved" boolean not null default true,
    "onboarding_status" text not null default 'approved'::text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "first_name" text,
    "last_name" text,
    "birth_date" date,
    "postal_code" text,
    "dni_front_url" text,
    "dni_back_url" text,
    "selfie_url" text,
    "driver_license_number" text,
    "driver_license_category" text,
    "driver_license_expiry" date,
    "license_front_url" text,
    "license_back_url" text,
    "vehicle_color" text,
    "vehicle_type" text,
    "vehicle_photo_url" text,
    "insurance_url" text,
    "insurance_expiry" date,
    "registration_url" text,
    "profile_completed" boolean not null default false,
    "documents_uploaded" boolean not null default false,
    "is_active" boolean not null default false,
    "is_available" boolean not null default false,
    "reviewed_by" uuid,
    "reviewed_at" timestamp with time zone,
    "rejection_reason" text,
    "admin_notes" text,
    "country_code" text default 'AR'::text,
    "preferred_city" text,
    "preferred_zone" text,
    "emergency_contact_name" text,
    "emergency_contact_phone" text,
    "avatar_url" text,
    "metadata" jsonb not null default '{}'::jsonb,
    "dni_number" text,
    "driver_photo_url" text,
    "review_status" text not null default 'pending'::text,
    "activation_status" text not null default 'INACTIVO'::text,
    "is_blocked" boolean not null default false,
    "kyc_status" text not null default 'pending'::text,
    "review_required" boolean not null default true,
    "ai_score" numeric,
    "ai_score_label" text,
    "face_detected" boolean,
    "face_match_score" numeric,
    "dni_match" boolean,
    "name_match" boolean,
    "birth_match" boolean,
    "last_lat" double precision,
    "last_lng" double precision,
    "last_location_at" timestamp with time zone,
    "review_notes" text
      );


alter table "public"."driver_profiles" enable row level security;


  create table "public"."legal_acceptances" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "actor_type" text not null,
    "document_code" text not null,
    "document_version" text not null,
    "accepted" boolean not null default true,
    "accepted_at" timestamp with time zone not null default now(),
    "acceptance_method" text not null,
    "ip_address" inet,
    "user_agent" text,
    "device_id" text,
    "document_hash_sha256" text not null,
    "evidence_payload" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."legal_acceptances" enable row level security;


  create table "public"."legal_documents" (
    "id" uuid not null default gen_random_uuid(),
    "code" text not null,
    "actor_type" text not null,
    "title" text not null,
    "status" text not null default 'active'::text,
    "requires_explicit_acceptance" boolean not null default true,
    "requires_reacceptance_on_change" boolean not null default true,
    "is_mandatory" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."legal_documents" enable row level security;


  create table "public"."legal_versions" (
    "id" uuid not null default gen_random_uuid(),
    "document_code" text not null,
    "version" text not null,
    "version_label" text not null,
    "content_markdown" text not null,
    "summary" text,
    "change_summary" text,
    "is_published" boolean not null default false,
    "published_at" timestamp with time zone,
    "effective_at" timestamp with time zone not null default now(),
    "requires_reacceptance" boolean not null default true,
    "created_by" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."legal_versions" enable row level security;


  create table "public"."pagos" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "viaje_id" uuid not null,
    "chofer_id_uuid" uuid,
    "monto_total" numeric not null default 0,
    "monto_chofer" numeric not null default 0
      );


alter table "public"."pagos" enable row level security;


  create table "public"."payment_events" (
    "id" uuid not null default gen_random_uuid(),
    "payment_id" uuid not null,
    "provider_event_id" text,
    "event_type" text not null,
    "payload" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."payment_events" enable row level security;


  create table "public"."payments" (
    "id" uuid not null default gen_random_uuid(),
    "context_type" text not null,
    "context_id" uuid not null,
    "service_request_id" uuid,
    "trip_id" uuid,
    "customer_id" uuid not null,
    "provider_id" uuid,
    "total_amount" numeric(12,2) not null,
    "platform_fee" numeric(12,2) not null,
    "provider_amount" numeric(12,2) not null,
    "currency" text not null default 'ARS'::text,
    "status" text not null default 'PENDING'::text,
    "provider_name" text not null default 'mock'::text,
    "provider_payment_id" text,
    "checkout_url" text,
    "raw_response" jsonb not null default '{}'::jsonb,
    "metadata_json" jsonb not null default '{}'::jsonb,
    "approved_at" timestamp with time zone,
    "captured_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "refunded_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."payments" enable row level security;


  create table "public"."push_tokens" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "user_id" uuid,
    "email" text,
    "token" text not null,
    "platform" text,
    "active" boolean not null default true,
    "last_seen_at" timestamp with time zone not null default now(),
    "rol" text
      );


alter table "public"."push_tokens" enable row level security;


  create table "public"."refunds" (
    "id" uuid not null default gen_random_uuid(),
    "payment_id" uuid not null,
    "amount" numeric(12,2) not null,
    "reason" text,
    "status" text not null default 'PENDING'::text,
    "provider_refund_id" text,
    "raw_response" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."refunds" enable row level security;


  create table "public"."settlements" (
    "id" uuid not null default gen_random_uuid(),
    "payment_id" uuid not null,
    "provider_id" uuid,
    "gross_amount" numeric(12,2) not null,
    "platform_fee" numeric(12,2) not null,
    "net_amount" numeric(12,2) not null,
    "currency" text not null default 'ARS'::text,
    "status" text not null default 'PENDING'::text,
    "settled_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."settlements" enable row level security;


  create table "public"."svc_assignments" (
    "id" uuid not null default gen_random_uuid(),
    "request_id" uuid not null,
    "provider_id" uuid not null,
    "status" text not null,
    "assigned_at" timestamp with time zone not null default now(),
    "completed_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."svc_assignments" enable row level security;


  create table "public"."svc_categories" (
    "id" uuid not null default gen_random_uuid(),
    "code" text not null,
    "name" text not null,
    "description" text,
    "active" boolean not null default true,
    "sort_order" integer not null default 0,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "aliases" jsonb not null default '[]'::jsonb,
    "search_keywords" text[] not null default '{}'::text[],
    "default_pricing_model" text not null default 'HOURLY'::text,
    "requires_provider_quote" boolean not null default false
      );


alter table "public"."svc_categories" enable row level security;


  create table "public"."svc_conversations" (
    "id" uuid not null default gen_random_uuid(),
    "request_id" uuid,
    "client_user_id" uuid not null,
    "provider_user_id" uuid,
    "status" text not null default 'OPEN'::text,
    "last_message_at" timestamp with time zone,
    "last_message_preview" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "app_context" text not null default 'services'::text,
    "subject" text,
    "participant_role" text not null default 'client'::text,
    "admin_status" text not null default 'abierto'::text,
    "assigned_admin_user_id" uuid,
    "unread_admin_count" integer not null default 0,
    "metadata_json" jsonb not null default '{}'::jsonb
      );


alter table "public"."svc_conversations" enable row level security;


  create table "public"."svc_escrow_holds" (
    "id" uuid not null default gen_random_uuid(),
    "request_id" uuid not null,
    "payment_intent_id" uuid not null,
    "amount" numeric(12,2) not null default 0,
    "currency" text not null default 'ARS'::text,
    "status" text not null,
    "held_at" timestamp with time zone not null default now(),
    "released_at" timestamp with time zone,
    "voided_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."svc_escrow_holds" enable row level security;


  create table "public"."svc_financial_ledger" (
    "id" uuid not null default gen_random_uuid(),
    "request_id" uuid,
    "provider_id" uuid,
    "entry_type" text not null,
    "amount" numeric(12,2) not null,
    "currency" text not null default 'ARS'::text,
    "metadata_json" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now(),
    "entry_key" text
      );


alter table "public"."svc_financial_ledger" enable row level security;


  create table "public"."svc_idempotency_keys" (
    "id" uuid not null default gen_random_uuid(),
    "key" text not null,
    "function_name" text not null,
    "user_id" uuid,
    "request_hash" text,
    "response_json" jsonb,
    "status_code" integer,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."svc_idempotency_keys" enable row level security;


  create table "public"."svc_messages" (
    "id" uuid not null default gen_random_uuid(),
    "conversation_id" uuid not null,
    "sender_user_id" uuid not null,
    "message_type" text not null default 'TEXT'::text,
    "body" text not null,
    "metadata_json" jsonb not null default '{}'::jsonb,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "sender_role" text not null default 'client'::text,
    "delivery_status" text not null default 'SENT'::text,
    "attachments_json" jsonb not null default '[]'::jsonb
      );


alter table "public"."svc_messages" enable row level security;


  create table "public"."svc_notification_deliveries" (
    "id" uuid not null default gen_random_uuid(),
    "notification_id" uuid not null,
    "user_device_id" uuid,
    "channel" text not null,
    "status" text not null,
    "provider_message_id" text,
    "error_message" text,
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "provider_status" text,
    "retry_count" integer not null default 0,
    "next_retry_at" timestamp with time zone
      );


alter table "public"."svc_notification_deliveries" enable row level security;


  create table "public"."svc_notifications" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "type" text not null,
    "title" text not null,
    "body" text not null,
    "data_json" jsonb not null default '{}'::jsonb,
    "delivery_status" text not null default 'PENDING'::text,
    "delivered_at" timestamp with time zone,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."svc_notifications" enable row level security;


  create table "public"."svc_payment_intents" (
    "id" uuid not null default gen_random_uuid(),
    "request_id" uuid not null,
    "client_user_id" uuid not null,
    "provider_id" uuid,
    "amount_total" numeric(12,2) not null default 0,
    "amount_provider" numeric(12,2) not null default 0,
    "amount_platform_fee" numeric(12,2) not null default 0,
    "currency" text not null default 'ARS'::text,
    "status" text not null,
    "external_payment_id" text,
    "authorized_at" timestamp with time zone,
    "captured_at" timestamp with time zone,
    "voided_at" timestamp with time zone,
    "refunded_at" timestamp with time zone,
    "metadata_json" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."svc_payment_intents" enable row level security;


  create table "public"."svc_platform_config" (
    "id" uuid not null default gen_random_uuid(),
    "config_key" text not null,
    "config_value_json" jsonb not null default '{}'::jsonb,
    "active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."svc_platform_config" enable row level security;


  create table "public"."svc_provider_availability" (
    "id" uuid not null default gen_random_uuid(),
    "provider_id" uuid not null,
    "day_of_week" integer not null,
    "start_time" time without time zone not null,
    "end_time" time without time zone not null,
    "active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."svc_provider_availability" enable row level security;


  create table "public"."svc_provider_categories" (
    "id" uuid not null default gen_random_uuid(),
    "provider_id" uuid not null,
    "category_id" uuid not null,
    "active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."svc_provider_categories" enable row level security;


  create table "public"."svc_provider_documents" (
    "id" uuid not null default gen_random_uuid(),
    "provider_id" uuid not null,
    "document_type" text not null,
    "storage_bucket" text not null default 'service-provider-documents'::text,
    "storage_path" text not null,
    "mime_type" text,
    "file_size_bytes" bigint,
    "review_status" text not null default 'PENDING'::text,
    "review_notes" text,
    "reviewed_by" uuid,
    "reviewed_at" timestamp with time zone,
    "metadata_json" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."svc_provider_documents" enable row level security;


  create table "public"."svc_provider_identity_checks" (
    "id" uuid not null default gen_random_uuid(),
    "provider_id" uuid not null,
    "dni_front_document_id" uuid,
    "selfie_document_id" uuid,
    "status" text not null default 'PENDING_REVIEW'::text,
    "face_detected" boolean default false,
    "face_match_score" numeric default 0,
    "liveness_score" numeric,
    "ocr_text" text,
    "dni_number_detected" text,
    "full_name_detected" text,
    "ai_score" numeric default 0,
    "ai_score_label" text default 'REVIEW'::text,
    "risk_flags" jsonb default '[]'::jsonb,
    "raw_result" jsonb default '{}'::jsonb,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."svc_provider_identity_checks" enable row level security;


  create table "public"."svc_provider_pricing" (
    "id" uuid not null default gen_random_uuid(),
    "provider_id" uuid not null,
    "category_id" uuid not null,
    "currency" text not null default 'ARS'::text,
    "price_per_hour" numeric(12,2) not null,
    "minimum_hours" integer not null default 2,
    "maximum_hours" integer not null default 8,
    "active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."svc_provider_pricing" enable row level security;


  create table "public"."svc_provider_profiles" (
    "id" uuid not null default gen_random_uuid(),
    "provider_id" uuid not null,
    "bio" text,
    "address_text" text,
    "city" text,
    "province" text,
    "country_code" text default 'AR'::text,
    "pricing_mode" text not null default 'HOURLY'::text,
    "accepts_immediate" boolean not null default true,
    "accepts_scheduled" boolean not null default true,
    "max_hours_per_service" integer not null default 8,
    "onboarding_completed" boolean not null default false,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "years_experience" integer default 0,
    "kyc_status" text default 'pending'::text,
    "review_status" text default 'pending'::text,
    "ai_score" numeric default 0,
    "ai_score_label" text default 'pending'::text,
    "review_required" boolean default true,
    "risk_flags" jsonb default '[]'::jsonb,
    "reviewed_at" timestamp with time zone
      );


alter table "public"."svc_provider_profiles" enable row level security;


  create table "public"."svc_provider_service_offerings" (
    "id" uuid not null default gen_random_uuid(),
    "provider_id" uuid not null,
    "category_id" uuid not null,
    "title" text not null,
    "description" text,
    "pricing_model" text not null default 'HOURLY'::text,
    "currency" text not null default 'ARS'::text,
    "price_per_hour" numeric,
    "base_visit_fee" numeric,
    "fixed_price" numeric,
    "unit_name" text,
    "unit_price" numeric,
    "minimum_charge" numeric not null default 0,
    "minimum_hours" integer,
    "maximum_hours" integer,
    "quote_required" boolean not null default false,
    "active" boolean not null default true,
    "metadata" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."svc_provider_service_offerings" enable row level security;


  create table "public"."svc_providers" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "full_name" text,
    "email" text,
    "phone" text,
    "avatar_url" text,
    "status" text not null default 'OFFLINE'::text,
    "approved" boolean not null default false,
    "blocked" boolean not null default false,
    "rating_avg" numeric(4,2) not null default 5.00,
    "rating_count" integer not null default 0,
    "last_lat" double precision,
    "last_lng" double precision,
    "last_location" public.geography(Point,4326),
    "last_seen_at" timestamp with time zone,
    "notes_internal" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."svc_providers" enable row level security;


  create table "public"."svc_request_candidates" (
    "id" uuid not null default gen_random_uuid(),
    "request_id" uuid not null,
    "provider_id" uuid not null,
    "rank_position" integer not null,
    "score" numeric(12,4),
    "distance_km" numeric(12,2),
    "rating_snapshot" numeric(4,2),
    "provider_price_snapshot" numeric(12,2),
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."svc_request_candidates" enable row level security;


  create table "public"."svc_request_events" (
    "id" uuid not null default gen_random_uuid(),
    "request_id" uuid not null,
    "actor_user_id" uuid,
    "provider_id" uuid,
    "event_type" text not null,
    "metadata" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."svc_request_events" enable row level security;


  create table "public"."svc_request_offers" (
    "id" uuid not null default gen_random_uuid(),
    "request_id" uuid not null,
    "provider_id" uuid not null,
    "status" text not null,
    "sent_at" timestamp with time zone not null default now(),
    "expires_at" timestamp with time zone not null,
    "responded_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."svc_request_offers" enable row level security;


  create table "public"."svc_requests" (
    "id" uuid not null default gen_random_uuid(),
    "client_user_id" uuid not null,
    "category_id" uuid not null,
    "selected_provider_id" uuid,
    "accepted_provider_id" uuid,
    "request_type" text not null,
    "status" text not null,
    "address_text" text,
    "service_lat" double precision not null,
    "service_lng" double precision not null,
    "service_location" public.geography(Point,4326),
    "scheduled_for" timestamp with time zone,
    "requested_hours" integer not null,
    "notes" text,
    "provider_price_snapshot" numeric(12,2) not null default 0,
    "platform_fee_snapshot" numeric(12,2) not null default 0,
    "total_price_snapshot" numeric(12,2) not null default 0,
    "currency" text not null default 'ARS'::text,
    "provider_response_deadline_at" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "en_route_at" timestamp with time zone,
    "arrived_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "cancelled_by" text,
    "cancellation_reason" text,
    "cancellation_fee" numeric(12,2) not null default 0,
    "created_via" text not null default 'CLIENT_APP'::text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."svc_requests" enable row level security;


  create table "public"."svc_reviews" (
    "id" uuid not null default gen_random_uuid(),
    "request_id" uuid not null,
    "client_user_id" uuid not null,
    "provider_id" uuid not null,
    "rating" integer not null,
    "comment" text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."svc_reviews" enable row level security;


  create table "public"."svc_scheduled_events" (
    "id" uuid not null default gen_random_uuid(),
    "event_type" text not null,
    "entity_id" uuid,
    "payload_json" jsonb not null default '{}'::jsonb,
    "run_at" timestamp with time zone not null,
    "status" text not null default 'PENDING'::text,
    "processed_at" timestamp with time zone,
    "last_error" text,
    "created_at" timestamp with time zone not null default now(),
    "picked_at" timestamp with time zone,
    "worker_id" text,
    "attempts" integer not null default 0
      );


alter table "public"."svc_scheduled_events" enable row level security;


  create table "public"."svc_service_intent_rules" (
    "id" uuid not null default gen_random_uuid(),
    "category_id" uuid not null,
    "locale" text not null default 'es-AR'::text,
    "phrase" text not null,
    "keywords" text[] not null default '{}'::text[],
    "weight" numeric not null default 1,
    "active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."svc_service_intent_rules" enable row level security;


  create table "public"."svc_tracking" (
    "id" uuid not null default gen_random_uuid(),
    "request_id" uuid not null,
    "provider_id" uuid not null,
    "lat" double precision not null,
    "lng" double precision not null,
    "location" public.geography(Point,4326),
    "accuracy" double precision,
    "heading" double precision,
    "speed" double precision,
    "tracked_at" timestamp with time zone not null default now(),
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."svc_tracking" enable row level security;


  create table "public"."svc_user_devices" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "device_id" text not null,
    "push_token" text,
    "platform" text not null,
    "notifications_enabled" boolean not null default true,
    "marketing_opt_in" boolean not null default false,
    "active" boolean not null default true,
    "last_seen_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."svc_user_devices" enable row level security;


  create table "public"."tarifas_config" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "vehiculo_tipo" text not null,
    "activo" boolean not null default true,
    "base_fare" numeric not null default 150,
    "km_rate" numeric not null default 80,
    "minute_rate" numeric not null default 15,
    "minimum_fare" numeric not null default 300
      );


alter table "public"."tarifas_config" enable row level security;


  create table "public"."viaje_eventos" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "viaje_id" uuid not null,
    "chofer_id_uuid" uuid,
    "tipo" text not null,
    "payload" jsonb not null default '{}'::jsonb
      );


alter table "public"."viaje_eventos" enable row level security;


  create table "public"."viaje_ofertas" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "viaje_id" uuid not null,
    "cotizacion_id" uuid,
    "chofer_id" uuid,
    "chofer_id_uuid" uuid,
    "estado" text not null default 'PENDIENTE'::text,
    "prioridad" integer,
    "score" numeric,
    "dist_origen_km" numeric,
    "dist_destino_km" numeric,
    "enviada_en" timestamp with time zone default now(),
    "respondida_en" timestamp with time zone,
    "responded_at" timestamp with time zone,
    "expires_at" timestamp with time zone
      );


alter table "public"."viaje_ofertas" enable row level security;


  create table "public"."viaje_tracking" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "viaje_id" uuid,
    "chofer_id_uuid" uuid,
    "lat" numeric not null,
    "lng" numeric not null,
    "accuracy" numeric,
    "heading" numeric,
    "speed" numeric,
    "timestamp" timestamp with time zone not null default now()
      );


alter table "public"."viaje_tracking" enable row level security;


  create table "public"."viajes" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "cotizacion_id" uuid,
    "cliente_auth_id" uuid,
    "cliente_email" text,
    "estado" text not null default 'DISPONIBLE'::text,
    "origen_lat" double precision,
    "origen_lng" double precision,
    "origen_direccion" text,
    "destino_lat" double precision,
    "destino_lng" double precision,
    "destino_direccion" text,
    "assigned_driver_id" uuid,
    "chofer_id_uuid" uuid,
    "chofer_user_id" uuid,
    "dispatch_locked" boolean not null default false,
    "dispatch_lock_expires_at" timestamp with time zone,
    "current_offer_expires_at" timestamp with time zone,
    "no_driver_found" boolean not null default false,
    "dispatch_attempts" integer not null default 0,
    "dispatch_attempt_count" integer not null default 0,
    "asignado_at" timestamp with time zone,
    "aceptado_at" timestamp with time zone,
    "completado_at" timestamp with time zone,
    "precio_total" numeric,
    "servicio" text,
    "origen" text,
    "destino" text,
    "distancia_km" numeric,
    "duracion_min" integer,
    "paradas" jsonb default '[]'::jsonb,
    "waypoints" jsonb default '[]'::jsonb,
    "stops" jsonb default '[]'::jsonb,
    "puntos_ruta" jsonb default '[]'::jsonb,
    "resumen_ruta" text,
    "segmentos_totales" integer default 0,
    "retorno_al_origen" boolean default false,
    "cantidad_paradas" integer default 0,
    "ruta_calculada_completa" boolean default false,
    "cotizacion_multitramo" boolean default false,
    "espera_min" integer default 0,
    "factor_zona" numeric default 1,
    "geometria" jsonb,
    "route_geometry" jsonb,
    "cliente" text,
    "telefono" text,
    "origen_corto" text,
    "destino_corto" text,
    "fecha_hora" timestamp with time zone,
    "fecha_hora_vuelta" timestamp with time zone,
    "fecha_viaje" text,
    "precio" numeric,
    "km" numeric,
    "distancia_km_total" numeric,
    "duracion_min_total" integer,
    "tiempo_espera" integer default 0,
    "notas" text,
    "chofer_nombre" text,
    "km_pickup" numeric default 0,
    "km_cobrables" numeric default 0,
    "waypoints_count" integer default 0,
    "ida_y_vuelta_real" boolean default false,
    "ruta_circular_compleja" boolean default false,
    "tipo_comercial" text,
    "detalle_precio" jsonb,
    "moneda" text default 'ARS'::text,
    "calculo_backend_real" boolean default true,
    "modo_algoritmo" text,
    "zona" text,
    "driver_eta_min" integer,
    "pickup_eta_min" integer,
    "dropoff_eta_min" integer,
    "eta_updated_at" timestamp with time zone,
    "iniciado_at" timestamp with time zone,
    "cancelado_at" timestamp with time zone,
    "cancelado_por" text,
    "cancel_reason" text,
    "search_deadline_at" timestamp with time zone,
    "search_started_at" timestamp with time zone,
    "dispatch_status" text,
    "last_dispatch_attempt_at" timestamp with time zone,
    "next_dispatch_at" timestamp with time zone
      );


alter table "public"."viajes" enable row level security;

CREATE UNIQUE INDEX admin_users_pkey ON public.admin_users USING btree (id);

CREATE UNIQUE INDEX admin_users_user_id_key ON public.admin_users USING btree (user_id);

CREATE UNIQUE INDEX audit_logs_pkey ON public.audit_logs USING btree (id);

CREATE UNIQUE INDEX cancellation_rules_pkey ON public.cancellation_rules USING btree (id);

CREATE UNIQUE INDEX choferes_pkey ON public.choferes USING btree (id_uuid);

CREATE UNIQUE INDEX choferes_user_id_key ON public.choferes USING btree (user_id);

CREATE UNIQUE INDEX choferes_user_id_uidx ON public.choferes USING btree (user_id);

CREATE UNIQUE INDEX commission_rules_one_default_active ON public.commission_rules USING btree (service_type) WHERE active;

CREATE UNIQUE INDEX commission_rules_pkey ON public.commission_rules USING btree (id);

CREATE UNIQUE INDEX consent_ledger_pkey ON public.consent_ledger USING btree (id);

CREATE UNIQUE INDEX cotizaciones_pkey ON public.cotizaciones USING btree (id);

CREATE UNIQUE INDEX document_hashes_pkey ON public.document_hashes USING btree (id);

CREATE UNIQUE INDEX document_hashes_unique_doc_version ON public.document_hashes USING btree (document_code, version);

CREATE UNIQUE INDEX driver_documents_pkey ON public.driver_documents USING btree (id);

CREATE UNIQUE INDEX driver_documents_user_doc_unique ON public.driver_documents USING btree (user_id, doc_type);

CREATE UNIQUE INDEX driver_profiles_pkey ON public.driver_profiles USING btree (id);

CREATE UNIQUE INDEX driver_profiles_user_id_key ON public.driver_profiles USING btree (user_id);

CREATE UNIQUE INDEX driver_profiles_user_id_unique ON public.driver_profiles USING btree (user_id);

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs USING btree (created_at DESC);

CREATE INDEX idx_audit_logs_entity ON public.audit_logs USING btree (entity_type, entity_id);

CREATE INDEX idx_audit_logs_event_type ON public.audit_logs USING btree (event_type);

CREATE INDEX idx_audit_logs_user_id ON public.audit_logs USING btree (user_id);

CREATE INDEX idx_choferes_online_disponible ON public.choferes USING btree (online, disponible, bloqueado);

CREATE INDEX idx_choferes_user_id ON public.choferes USING btree (user_id);

CREATE INDEX idx_consent_ledger_occurred_at ON public.consent_ledger USING btree (occurred_at DESC);

CREATE INDEX idx_consent_ledger_status ON public.consent_ledger USING btree (status);

CREATE INDEX idx_consent_ledger_type ON public.consent_ledger USING btree (consent_type);

CREATE INDEX idx_consent_ledger_user_id ON public.consent_ledger USING btree (user_id);

CREATE INDEX idx_driver_documents_doc_type ON public.driver_documents USING btree (doc_type);

CREATE INDEX idx_driver_documents_review_required ON public.driver_documents USING btree (review_required);

CREATE INDEX idx_driver_documents_status ON public.driver_documents USING btree (status);

CREATE INDEX idx_driver_documents_user_id ON public.driver_documents USING btree (user_id);

CREATE INDEX idx_driver_documents_validation_status ON public.driver_documents USING btree (validation_status);

CREATE INDEX idx_driver_profiles_dni ON public.driver_profiles USING btree (dni);

CREATE INDEX idx_driver_profiles_documents_approved ON public.driver_profiles USING btree (documents_approved);

CREATE INDEX idx_driver_profiles_is_active ON public.driver_profiles USING btree (is_active);

CREATE INDEX idx_driver_profiles_onboarding_status ON public.driver_profiles USING btree (onboarding_status);

CREATE INDEX idx_driver_profiles_vehicle_plate ON public.driver_profiles USING btree (vehicle_plate);

CREATE INDEX idx_legal_acceptances_accepted_at ON public.legal_acceptances USING btree (accepted_at DESC);

CREATE INDEX idx_legal_acceptances_actor ON public.legal_acceptances USING btree (actor_type);

CREATE INDEX idx_legal_acceptances_document ON public.legal_acceptances USING btree (document_code, document_version);

CREATE INDEX idx_legal_acceptances_user_id ON public.legal_acceptances USING btree (user_id);

CREATE INDEX idx_legal_versions_document_code ON public.legal_versions USING btree (document_code);

CREATE INDEX idx_legal_versions_published ON public.legal_versions USING btree (document_code, is_published, effective_at DESC);

CREATE INDEX idx_legal_versions_version ON public.legal_versions USING btree (version);

CREATE INDEX idx_push_tokens_active ON public.push_tokens USING btree (active);

CREATE INDEX idx_push_tokens_user_id ON public.push_tokens USING btree (user_id);

CREATE INDEX idx_svc_assignments_provider ON public.svc_assignments USING btree (provider_id);

CREATE INDEX idx_svc_assignments_status ON public.svc_assignments USING btree (status);

CREATE INDEX idx_svc_conversations_admin_status ON public.svc_conversations USING btree (admin_status);

CREATE INDEX idx_svc_conversations_app_context ON public.svc_conversations USING btree (app_context);

CREATE INDEX idx_svc_conversations_client ON public.svc_conversations USING btree (client_user_id);

CREATE INDEX idx_svc_conversations_provider ON public.svc_conversations USING btree (provider_user_id);

CREATE INDEX idx_svc_financial_ledger_provider ON public.svc_financial_ledger USING btree (provider_id);

CREATE INDEX idx_svc_financial_ledger_request ON public.svc_financial_ledger USING btree (request_id);

CREATE INDEX idx_svc_idempotency_user ON public.svc_idempotency_keys USING btree (user_id);

CREATE INDEX idx_svc_messages_conversation ON public.svc_messages USING btree (conversation_id, created_at DESC);

CREATE INDEX idx_svc_messages_conversation_created ON public.svc_messages USING btree (conversation_id, created_at);

CREATE INDEX idx_svc_messages_delivery_status ON public.svc_messages USING btree (delivery_status);

CREATE INDEX idx_svc_messages_message_type ON public.svc_messages USING btree (message_type);

CREATE INDEX idx_svc_messages_sender ON public.svc_messages USING btree (sender_user_id);

CREATE INDEX idx_svc_messages_sender_role ON public.svc_messages USING btree (sender_role);

CREATE INDEX idx_svc_notification_deliveries_notification ON public.svc_notification_deliveries USING btree (notification_id);

CREATE INDEX idx_svc_notifications_type ON public.svc_notifications USING btree (type);

CREATE INDEX idx_svc_notifications_user ON public.svc_notifications USING btree (user_id, created_at DESC);

CREATE INDEX idx_svc_notifications_user_unread ON public.svc_notifications USING btree (user_id, created_at DESC) WHERE (read_at IS NULL);

CREATE INDEX idx_svc_payment_intents_client ON public.svc_payment_intents USING btree (client_user_id);

CREATE INDEX idx_svc_payment_intents_provider ON public.svc_payment_intents USING btree (provider_id);

CREATE INDEX idx_svc_payment_intents_status ON public.svc_payment_intents USING btree (status);

CREATE INDEX idx_svc_provider_availability_provider ON public.svc_provider_availability USING btree (provider_id);

CREATE INDEX idx_svc_provider_categories_category ON public.svc_provider_categories USING btree (category_id);

CREATE INDEX idx_svc_provider_categories_provider ON public.svc_provider_categories USING btree (provider_id);

CREATE INDEX idx_svc_provider_documents_provider ON public.svc_provider_documents USING btree (provider_id);

CREATE INDEX idx_svc_provider_documents_status ON public.svc_provider_documents USING btree (review_status);

CREATE INDEX idx_svc_provider_pricing_category ON public.svc_provider_pricing USING btree (category_id);

CREATE INDEX idx_svc_provider_pricing_provider ON public.svc_provider_pricing USING btree (provider_id);

CREATE INDEX idx_svc_providers_approved_blocked_status ON public.svc_providers USING btree (approved, blocked, status);

CREATE INDEX idx_svc_providers_last_location ON public.svc_providers USING gist (last_location);

CREATE INDEX idx_svc_providers_user_id ON public.svc_providers USING btree (user_id);

CREATE INDEX idx_svc_request_candidates_provider ON public.svc_request_candidates USING btree (provider_id);

CREATE INDEX idx_svc_request_candidates_request ON public.svc_request_candidates USING btree (request_id);

CREATE INDEX idx_svc_request_candidates_request_rank ON public.svc_request_candidates USING btree (request_id, rank_position);

CREATE INDEX idx_svc_request_events_created_at ON public.svc_request_events USING btree (created_at DESC);

CREATE INDEX idx_svc_request_events_request_id ON public.svc_request_events USING btree (request_id);

CREATE INDEX idx_svc_request_offers_pending_expiry ON public.svc_request_offers USING btree (expires_at) WHERE (status = 'PENDING'::text);

CREATE INDEX idx_svc_request_offers_provider ON public.svc_request_offers USING btree (provider_id);

CREATE INDEX idx_svc_request_offers_request ON public.svc_request_offers USING btree (request_id);

CREATE INDEX idx_svc_request_offers_status ON public.svc_request_offers USING btree (status);

CREATE INDEX idx_svc_requests_accepted_provider ON public.svc_requests USING btree (accepted_provider_id);

CREATE INDEX idx_svc_requests_category ON public.svc_requests USING btree (category_id);

CREATE INDEX idx_svc_requests_client ON public.svc_requests USING btree (client_user_id);

CREATE INDEX idx_svc_requests_scheduled_for ON public.svc_requests USING btree (scheduled_for);

CREATE INDEX idx_svc_requests_selected_provider ON public.svc_requests USING btree (selected_provider_id);

CREATE INDEX idx_svc_requests_service_location ON public.svc_requests USING gist (service_location);

CREATE INDEX idx_svc_requests_status ON public.svc_requests USING btree (status);

CREATE INDEX idx_svc_reviews_provider ON public.svc_reviews USING btree (provider_id);

CREATE INDEX idx_svc_scheduled_events_status_run_at ON public.svc_scheduled_events USING btree (status, run_at);

CREATE INDEX idx_svc_tracking_location ON public.svc_tracking USING gist (location);

CREATE INDEX idx_svc_tracking_provider ON public.svc_tracking USING btree (provider_id, tracked_at DESC);

CREATE INDEX idx_svc_tracking_request ON public.svc_tracking USING btree (request_id, tracked_at DESC);

CREATE INDEX idx_svc_user_devices_push_token ON public.svc_user_devices USING btree (push_token);

CREATE INDEX idx_svc_user_devices_user ON public.svc_user_devices USING btree (user_id);

CREATE INDEX idx_viaje_eventos_viaje_id ON public.viaje_eventos USING btree (viaje_id);

CREATE INDEX idx_viaje_ofertas_chofer_id ON public.viaje_ofertas USING btree (chofer_id);

CREATE INDEX idx_viaje_ofertas_estado ON public.viaje_ofertas USING btree (estado);

CREATE INDEX idx_viaje_ofertas_expires_at ON public.viaje_ofertas USING btree (expires_at);

CREATE INDEX idx_viaje_ofertas_viaje_id ON public.viaje_ofertas USING btree (viaje_id);

CREATE INDEX idx_viaje_tracking_chofer_id_uuid ON public.viaje_tracking USING btree (chofer_id_uuid);

CREATE INDEX idx_viaje_tracking_timestamp ON public.viaje_tracking USING btree ("timestamp" DESC);

CREATE INDEX idx_viaje_tracking_viaje_id ON public.viaje_tracking USING btree (viaje_id);

CREATE INDEX idx_viajes_assigned_driver_id ON public.viajes USING btree (assigned_driver_id);

CREATE INDEX idx_viajes_chofer_id_uuid ON public.viajes USING btree (chofer_id_uuid);

CREATE INDEX idx_viajes_cliente_auth_id ON public.viajes USING btree (cliente_auth_id);

CREATE INDEX idx_viajes_cliente_email ON public.viajes USING btree (cliente_email);

CREATE INDEX idx_viajes_estado ON public.viajes USING btree (estado);

CREATE INDEX idx_viajes_updated_at ON public.viajes USING btree (updated_at DESC);

CREATE INDEX ix_svc_notification_deliveries_notification_channel ON public.svc_notification_deliveries USING btree (notification_id, channel, sent_at DESC);

CREATE INDEX ix_svc_scheduled_events_status_run_at ON public.svc_scheduled_events USING btree (status, run_at);

CREATE UNIQUE INDEX legal_acceptances_pkey ON public.legal_acceptances USING btree (id);

CREATE UNIQUE INDEX legal_documents_code_key ON public.legal_documents USING btree (code);

CREATE UNIQUE INDEX legal_documents_pkey ON public.legal_documents USING btree (id);

CREATE UNIQUE INDEX legal_versions_pkey ON public.legal_versions USING btree (id);

CREATE UNIQUE INDEX legal_versions_unique_doc_version ON public.legal_versions USING btree (document_code, version);

CREATE UNIQUE INDEX pagos_pkey ON public.pagos USING btree (id);

CREATE INDEX payment_events_payment_id_idx ON public.payment_events USING btree (payment_id);

CREATE UNIQUE INDEX payment_events_pkey ON public.payment_events USING btree (id);

CREATE UNIQUE INDEX payment_events_provider_event_id_idx ON public.payment_events USING btree (provider_event_id) WHERE (provider_event_id IS NOT NULL);

CREATE INDEX payments_customer_id_idx ON public.payments USING btree (customer_id);

CREATE UNIQUE INDEX payments_one_active_per_context ON public.payments USING btree (context_type, context_id) WHERE (status = ANY (ARRAY['PENDING'::text, 'CHECKOUT_CREATED'::text, 'APPROVED'::text, 'CAPTURED'::text]));

CREATE UNIQUE INDEX payments_pkey ON public.payments USING btree (id);

CREATE INDEX payments_provider_id_idx ON public.payments USING btree (provider_id);

CREATE INDEX payments_provider_payment_id_idx ON public.payments USING btree (provider_name, provider_payment_id);

CREATE INDEX payments_service_request_id_idx ON public.payments USING btree (service_request_id);

CREATE INDEX payments_trip_id_idx ON public.payments USING btree (trip_id);

CREATE UNIQUE INDEX push_tokens_pkey ON public.push_tokens USING btree (id);

CREATE UNIQUE INDEX push_tokens_token_key ON public.push_tokens USING btree (token);

CREATE INDEX refunds_payment_id_idx ON public.refunds USING btree (payment_id);

CREATE UNIQUE INDEX refunds_pkey ON public.refunds USING btree (id);

CREATE UNIQUE INDEX settlements_payment_id_key ON public.settlements USING btree (payment_id);

CREATE UNIQUE INDEX settlements_pkey ON public.settlements USING btree (id);

CREATE INDEX settlements_provider_id_idx ON public.settlements USING btree (provider_id);

CREATE UNIQUE INDEX svc_assignments_pkey ON public.svc_assignments USING btree (id);

CREATE UNIQUE INDEX svc_assignments_request_id_key ON public.svc_assignments USING btree (request_id);

CREATE UNIQUE INDEX svc_categories_code_key ON public.svc_categories USING btree (code);

CREATE INDEX svc_categories_name_trgm_idx ON public.svc_categories USING gin (name public.gin_trgm_ops);

CREATE UNIQUE INDEX svc_categories_pkey ON public.svc_categories USING btree (id);

CREATE INDEX svc_categories_search_keywords_idx ON public.svc_categories USING gin (search_keywords);

CREATE UNIQUE INDEX svc_conversations_pkey ON public.svc_conversations USING btree (id);

CREATE UNIQUE INDEX svc_conversations_request_id_key ON public.svc_conversations USING btree (request_id);

CREATE UNIQUE INDEX svc_escrow_holds_pkey ON public.svc_escrow_holds USING btree (id);

CREATE UNIQUE INDEX svc_escrow_holds_request_id_key ON public.svc_escrow_holds USING btree (request_id);

CREATE UNIQUE INDEX svc_financial_ledger_pkey ON public.svc_financial_ledger USING btree (id);

CREATE UNIQUE INDEX svc_idempotency_keys_key_function_name_key ON public.svc_idempotency_keys USING btree (key, function_name);

CREATE UNIQUE INDEX svc_idempotency_keys_pkey ON public.svc_idempotency_keys USING btree (id);

CREATE UNIQUE INDEX svc_messages_pkey ON public.svc_messages USING btree (id);

CREATE UNIQUE INDEX svc_notification_deliveries_pkey ON public.svc_notification_deliveries USING btree (id);

CREATE UNIQUE INDEX svc_notifications_pkey ON public.svc_notifications USING btree (id);

CREATE UNIQUE INDEX svc_payment_intents_pkey ON public.svc_payment_intents USING btree (id);

CREATE UNIQUE INDEX svc_payment_intents_request_id_key ON public.svc_payment_intents USING btree (request_id);

CREATE UNIQUE INDEX svc_platform_config_config_key_key ON public.svc_platform_config USING btree (config_key);

CREATE UNIQUE INDEX svc_platform_config_pkey ON public.svc_platform_config USING btree (id);

CREATE UNIQUE INDEX svc_provider_availability_pkey ON public.svc_provider_availability USING btree (id);

CREATE UNIQUE INDEX svc_provider_categories_pkey ON public.svc_provider_categories USING btree (id);

CREATE UNIQUE INDEX svc_provider_categories_provider_id_category_id_key ON public.svc_provider_categories USING btree (provider_id, category_id);

CREATE UNIQUE INDEX svc_provider_documents_pkey ON public.svc_provider_documents USING btree (id);

CREATE UNIQUE INDEX svc_provider_identity_checks_pkey ON public.svc_provider_identity_checks USING btree (id);

CREATE UNIQUE INDEX svc_provider_pricing_pkey ON public.svc_provider_pricing USING btree (id);

CREATE UNIQUE INDEX svc_provider_pricing_provider_id_category_id_key ON public.svc_provider_pricing USING btree (provider_id, category_id);

CREATE UNIQUE INDEX svc_provider_profiles_pkey ON public.svc_provider_profiles USING btree (id);

CREATE UNIQUE INDEX svc_provider_profiles_provider_id_key ON public.svc_provider_profiles USING btree (provider_id);

CREATE INDEX svc_provider_service_offerings_category_idx ON public.svc_provider_service_offerings USING btree (category_id) WHERE (active = true);

CREATE UNIQUE INDEX svc_provider_service_offerings_pkey ON public.svc_provider_service_offerings USING btree (id);

CREATE INDEX svc_provider_service_offerings_provider_idx ON public.svc_provider_service_offerings USING btree (provider_id) WHERE (active = true);

CREATE UNIQUE INDEX svc_providers_pkey ON public.svc_providers USING btree (id);

CREATE UNIQUE INDEX svc_providers_user_id_key ON public.svc_providers USING btree (user_id);

CREATE UNIQUE INDEX svc_request_candidates_pkey ON public.svc_request_candidates USING btree (id);

CREATE UNIQUE INDEX svc_request_candidates_request_id_provider_id_key ON public.svc_request_candidates USING btree (request_id, provider_id);

CREATE UNIQUE INDEX svc_request_events_pkey ON public.svc_request_events USING btree (id);

CREATE UNIQUE INDEX svc_request_offers_pkey ON public.svc_request_offers USING btree (id);

CREATE UNIQUE INDEX svc_requests_pkey ON public.svc_requests USING btree (id);

CREATE UNIQUE INDEX svc_reviews_pkey ON public.svc_reviews USING btree (id);

CREATE UNIQUE INDEX svc_reviews_request_id_key ON public.svc_reviews USING btree (request_id);

CREATE UNIQUE INDEX svc_scheduled_events_pkey ON public.svc_scheduled_events USING btree (id);

CREATE INDEX svc_service_intent_rules_category_idx ON public.svc_service_intent_rules USING btree (category_id) WHERE (active = true);

CREATE INDEX svc_service_intent_rules_keywords_idx ON public.svc_service_intent_rules USING gin (keywords);

CREATE UNIQUE INDEX svc_service_intent_rules_pkey ON public.svc_service_intent_rules USING btree (id);

CREATE UNIQUE INDEX svc_tracking_pkey ON public.svc_tracking USING btree (id);

CREATE UNIQUE INDEX svc_user_devices_pkey ON public.svc_user_devices USING btree (id);

CREATE UNIQUE INDEX svc_user_devices_user_device_uidx ON public.svc_user_devices USING btree (user_id, device_id);

CREATE UNIQUE INDEX svc_user_devices_user_id_device_id_key ON public.svc_user_devices USING btree (user_id, device_id);

CREATE UNIQUE INDEX tarifas_config_pkey ON public.tarifas_config USING btree (id);

CREATE UNIQUE INDEX uq_driver_profiles_user_id ON public.driver_profiles USING btree (user_id);

CREATE UNIQUE INDEX uq_legal_acceptances_one_acceptance ON public.legal_acceptances USING btree (user_id, actor_type, document_code, document_version) WHERE (accepted = true);

CREATE UNIQUE INDEX ux_assignments_active ON public.svc_assignments USING btree (request_id) WHERE (status = 'ACTIVE'::text);

CREATE UNIQUE INDEX ux_conversations_request ON public.svc_conversations USING btree (request_id);

CREATE UNIQUE INDEX ux_ledger_key ON public.svc_financial_ledger USING btree (entry_key);

CREATE UNIQUE INDEX ux_offer_unique ON public.svc_request_offers USING btree (request_id, provider_id) WHERE (status = 'PENDING'::text);

CREATE UNIQUE INDEX ux_svc_active_request_per_client ON public.svc_requests USING btree (client_user_id) WHERE (status = ANY (ARRAY['SEARCHING'::text, 'PENDING_PROVIDER_RESPONSE'::text, 'ACCEPTED'::text, 'SCHEDULED'::text, 'PROVIDER_EN_ROUTE'::text, 'PROVIDER_ARRIVED'::text, 'IN_PROGRESS'::text]));

CREATE UNIQUE INDEX ux_svc_assignments_one_active_per_request ON public.svc_assignments USING btree (request_id) WHERE (status = 'ACTIVE'::text);

CREATE UNIQUE INDEX ux_svc_conversations_request_id ON public.svc_conversations USING btree (request_id);

CREATE UNIQUE INDEX ux_svc_provider_profiles_provider_id ON public.svc_provider_profiles USING btree (provider_id);

CREATE UNIQUE INDEX ux_svc_providers_user_id ON public.svc_providers USING btree (user_id);

CREATE UNIQUE INDEX ux_svc_request_offers_pending_per_provider ON public.svc_request_offers USING btree (request_id, provider_id) WHERE (status = 'PENDING'::text);

CREATE UNIQUE INDEX viaje_eventos_pkey ON public.viaje_eventos USING btree (id);

CREATE UNIQUE INDEX viaje_ofertas_pkey ON public.viaje_ofertas USING btree (id);

CREATE UNIQUE INDEX viaje_tracking_pkey ON public.viaje_tracking USING btree (id);

CREATE UNIQUE INDEX viajes_pkey ON public.viajes USING btree (id);

alter table "public"."admin_users" add constraint "admin_users_pkey" PRIMARY KEY using index "admin_users_pkey";

alter table "public"."audit_logs" add constraint "audit_logs_pkey" PRIMARY KEY using index "audit_logs_pkey";

alter table "public"."cancellation_rules" add constraint "cancellation_rules_pkey" PRIMARY KEY using index "cancellation_rules_pkey";

alter table "public"."choferes" add constraint "choferes_pkey" PRIMARY KEY using index "choferes_pkey";

alter table "public"."commission_rules" add constraint "commission_rules_pkey" PRIMARY KEY using index "commission_rules_pkey";

alter table "public"."consent_ledger" add constraint "consent_ledger_pkey" PRIMARY KEY using index "consent_ledger_pkey";

alter table "public"."cotizaciones" add constraint "cotizaciones_pkey" PRIMARY KEY using index "cotizaciones_pkey";

alter table "public"."document_hashes" add constraint "document_hashes_pkey" PRIMARY KEY using index "document_hashes_pkey";

alter table "public"."driver_documents" add constraint "driver_documents_pkey" PRIMARY KEY using index "driver_documents_pkey";

alter table "public"."driver_profiles" add constraint "driver_profiles_pkey" PRIMARY KEY using index "driver_profiles_pkey";

alter table "public"."legal_acceptances" add constraint "legal_acceptances_pkey" PRIMARY KEY using index "legal_acceptances_pkey";

alter table "public"."legal_documents" add constraint "legal_documents_pkey" PRIMARY KEY using index "legal_documents_pkey";

alter table "public"."legal_versions" add constraint "legal_versions_pkey" PRIMARY KEY using index "legal_versions_pkey";

alter table "public"."pagos" add constraint "pagos_pkey" PRIMARY KEY using index "pagos_pkey";

alter table "public"."payment_events" add constraint "payment_events_pkey" PRIMARY KEY using index "payment_events_pkey";

alter table "public"."payments" add constraint "payments_pkey" PRIMARY KEY using index "payments_pkey";

alter table "public"."push_tokens" add constraint "push_tokens_pkey" PRIMARY KEY using index "push_tokens_pkey";

alter table "public"."refunds" add constraint "refunds_pkey" PRIMARY KEY using index "refunds_pkey";

alter table "public"."settlements" add constraint "settlements_pkey" PRIMARY KEY using index "settlements_pkey";

alter table "public"."svc_assignments" add constraint "svc_assignments_pkey" PRIMARY KEY using index "svc_assignments_pkey";

alter table "public"."svc_categories" add constraint "svc_categories_pkey" PRIMARY KEY using index "svc_categories_pkey";

alter table "public"."svc_conversations" add constraint "svc_conversations_pkey" PRIMARY KEY using index "svc_conversations_pkey";

alter table "public"."svc_escrow_holds" add constraint "svc_escrow_holds_pkey" PRIMARY KEY using index "svc_escrow_holds_pkey";

alter table "public"."svc_financial_ledger" add constraint "svc_financial_ledger_pkey" PRIMARY KEY using index "svc_financial_ledger_pkey";

alter table "public"."svc_idempotency_keys" add constraint "svc_idempotency_keys_pkey" PRIMARY KEY using index "svc_idempotency_keys_pkey";

alter table "public"."svc_messages" add constraint "svc_messages_pkey" PRIMARY KEY using index "svc_messages_pkey";

alter table "public"."svc_notification_deliveries" add constraint "svc_notification_deliveries_pkey" PRIMARY KEY using index "svc_notification_deliveries_pkey";

alter table "public"."svc_notifications" add constraint "svc_notifications_pkey" PRIMARY KEY using index "svc_notifications_pkey";

alter table "public"."svc_payment_intents" add constraint "svc_payment_intents_pkey" PRIMARY KEY using index "svc_payment_intents_pkey";

alter table "public"."svc_platform_config" add constraint "svc_platform_config_pkey" PRIMARY KEY using index "svc_platform_config_pkey";

alter table "public"."svc_provider_availability" add constraint "svc_provider_availability_pkey" PRIMARY KEY using index "svc_provider_availability_pkey";

alter table "public"."svc_provider_categories" add constraint "svc_provider_categories_pkey" PRIMARY KEY using index "svc_provider_categories_pkey";

alter table "public"."svc_provider_documents" add constraint "svc_provider_documents_pkey" PRIMARY KEY using index "svc_provider_documents_pkey";

alter table "public"."svc_provider_identity_checks" add constraint "svc_provider_identity_checks_pkey" PRIMARY KEY using index "svc_provider_identity_checks_pkey";

alter table "public"."svc_provider_pricing" add constraint "svc_provider_pricing_pkey" PRIMARY KEY using index "svc_provider_pricing_pkey";

alter table "public"."svc_provider_profiles" add constraint "svc_provider_profiles_pkey" PRIMARY KEY using index "svc_provider_profiles_pkey";

alter table "public"."svc_provider_service_offerings" add constraint "svc_provider_service_offerings_pkey" PRIMARY KEY using index "svc_provider_service_offerings_pkey";

alter table "public"."svc_providers" add constraint "svc_providers_pkey" PRIMARY KEY using index "svc_providers_pkey";

alter table "public"."svc_request_candidates" add constraint "svc_request_candidates_pkey" PRIMARY KEY using index "svc_request_candidates_pkey";

alter table "public"."svc_request_events" add constraint "svc_request_events_pkey" PRIMARY KEY using index "svc_request_events_pkey";

alter table "public"."svc_request_offers" add constraint "svc_request_offers_pkey" PRIMARY KEY using index "svc_request_offers_pkey";

alter table "public"."svc_requests" add constraint "svc_requests_pkey" PRIMARY KEY using index "svc_requests_pkey";

alter table "public"."svc_reviews" add constraint "svc_reviews_pkey" PRIMARY KEY using index "svc_reviews_pkey";

alter table "public"."svc_scheduled_events" add constraint "svc_scheduled_events_pkey" PRIMARY KEY using index "svc_scheduled_events_pkey";

alter table "public"."svc_service_intent_rules" add constraint "svc_service_intent_rules_pkey" PRIMARY KEY using index "svc_service_intent_rules_pkey";

alter table "public"."svc_tracking" add constraint "svc_tracking_pkey" PRIMARY KEY using index "svc_tracking_pkey";

alter table "public"."svc_user_devices" add constraint "svc_user_devices_pkey" PRIMARY KEY using index "svc_user_devices_pkey";

alter table "public"."tarifas_config" add constraint "tarifas_config_pkey" PRIMARY KEY using index "tarifas_config_pkey";

alter table "public"."viaje_eventos" add constraint "viaje_eventos_pkey" PRIMARY KEY using index "viaje_eventos_pkey";

alter table "public"."viaje_ofertas" add constraint "viaje_ofertas_pkey" PRIMARY KEY using index "viaje_ofertas_pkey";

alter table "public"."viaje_tracking" add constraint "viaje_tracking_pkey" PRIMARY KEY using index "viaje_tracking_pkey";

alter table "public"."viajes" add constraint "viajes_pkey" PRIMARY KEY using index "viajes_pkey";

alter table "public"."admin_users" add constraint "admin_users_role_check" CHECK ((role = ANY (ARRAY['ADMIN'::text, 'SUPERADMIN'::text, 'OPS'::text, 'SUPPORT'::text]))) not valid;

alter table "public"."admin_users" validate constraint "admin_users_role_check";

alter table "public"."admin_users" add constraint "admin_users_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."admin_users" validate constraint "admin_users_user_id_fkey";

alter table "public"."admin_users" add constraint "admin_users_user_id_key" UNIQUE using index "admin_users_user_id_key";

alter table "public"."audit_logs" add constraint "audit_logs_actor_type_check" CHECK ((actor_type = ANY (ARRAY['user'::text, 'driver'::text, 'provider'::text, 'admin'::text, 'system'::text]))) not valid;

alter table "public"."audit_logs" validate constraint "audit_logs_actor_type_check";

alter table "public"."audit_logs" add constraint "audit_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."audit_logs" validate constraint "audit_logs_user_id_fkey";

alter table "public"."cancellation_rules" add constraint "cancellation_rules_context_type_check" CHECK ((context_type = ANY (ARRAY['SERVICE_REQUEST'::text, 'TRANSPORT_TRIP'::text, 'TRANSPORT_QUOTE'::text, 'DEFAULT'::text]))) not valid;

alter table "public"."cancellation_rules" validate constraint "cancellation_rules_context_type_check";

alter table "public"."choferes" add constraint "choferes_user_id_key" UNIQUE using index "choferes_user_id_key";

alter table "public"."commission_rules" add constraint "commission_rules_fixed_fee_check" CHECK ((fixed_fee >= (0)::numeric)) not valid;

alter table "public"."commission_rules" validate constraint "commission_rules_fixed_fee_check";

alter table "public"."commission_rules" add constraint "commission_rules_minimum_fee_check" CHECK ((minimum_fee >= (0)::numeric)) not valid;

alter table "public"."commission_rules" validate constraint "commission_rules_minimum_fee_check";

alter table "public"."commission_rules" add constraint "commission_rules_percentage_check" CHECK (((percentage >= (0)::numeric) AND (percentage <= (100)::numeric))) not valid;

alter table "public"."commission_rules" validate constraint "commission_rules_percentage_check";

alter table "public"."commission_rules" add constraint "commission_rules_rounding_check" CHECK ((rounding = ANY (ARRAY['ceil'::text, 'floor'::text, 'round'::text]))) not valid;

alter table "public"."commission_rules" validate constraint "commission_rules_rounding_check";

alter table "public"."consent_ledger" add constraint "consent_ledger_actor_type_check" CHECK ((actor_type = ANY (ARRAY['user'::text, 'driver'::text, 'provider'::text, 'admin'::text]))) not valid;

alter table "public"."consent_ledger" validate constraint "consent_ledger_actor_type_check";

alter table "public"."consent_ledger" add constraint "consent_ledger_consent_type_check" CHECK ((consent_type = ANY (ARRAY['privacy'::text, 'geolocation'::text, 'marketing'::text, 'notifications'::text, 'profiling'::text, 'data_sharing'::text]))) not valid;

alter table "public"."consent_ledger" validate constraint "consent_ledger_consent_type_check";

alter table "public"."consent_ledger" add constraint "consent_ledger_source_check" CHECK ((source = ANY (ARRAY['onboarding'::text, 'settings'::text, 'forced_reaccept'::text, 'system'::text, 'api'::text]))) not valid;

alter table "public"."consent_ledger" validate constraint "consent_ledger_source_check";

alter table "public"."consent_ledger" add constraint "consent_ledger_status_check" CHECK ((status = ANY (ARRAY['granted'::text, 'revoked'::text, 'denied'::text]))) not valid;

alter table "public"."consent_ledger" validate constraint "consent_ledger_status_check";

alter table "public"."consent_ledger" add constraint "consent_ledger_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."consent_ledger" validate constraint "consent_ledger_user_id_fkey";

alter table "public"."document_hashes" add constraint "document_hashes_algorithm_check" CHECK ((hash_algorithm = 'sha256'::text)) not valid;

alter table "public"."document_hashes" validate constraint "document_hashes_algorithm_check";

alter table "public"."document_hashes" add constraint "document_hashes_document_code_fkey" FOREIGN KEY (document_code) REFERENCES public.legal_documents(code) ON DELETE RESTRICT not valid;

alter table "public"."document_hashes" validate constraint "document_hashes_document_code_fkey";

alter table "public"."document_hashes" add constraint "document_hashes_unique_doc_version" UNIQUE using index "document_hashes_unique_doc_version";

alter table "public"."driver_documents" add constraint "driver_documents_doc_type_check" CHECK ((doc_type = ANY (ARRAY['dni_front'::text, 'dni_back'::text, 'selfie'::text, 'license_front'::text, 'license_back'::text, 'vehicle_card_front'::text, 'vehicle_card_back'::text, 'vehicle_photo'::text, 'background_check'::text]))) not valid;

alter table "public"."driver_documents" validate constraint "driver_documents_doc_type_check";

alter table "public"."driver_documents" add constraint "driver_documents_status_check" CHECK ((status = ANY (ARRAY['PENDIENTE'::text, 'APROBADO'::text, 'RECHAZADO'::text]))) not valid;

alter table "public"."driver_documents" validate constraint "driver_documents_status_check";

alter table "public"."driver_documents" add constraint "driver_documents_user_doc_unique" UNIQUE using index "driver_documents_user_doc_unique";

alter table "public"."driver_documents" add constraint "driver_documents_validation_status_check" CHECK ((validation_status = ANY (ARRAY['PENDING'::text, 'VALID'::text, 'INVALID'::text, 'REJECTED'::text, 'UNKNOWN'::text]))) not valid;

alter table "public"."driver_documents" validate constraint "driver_documents_validation_status_check";

alter table "public"."driver_profiles" add constraint "driver_profiles_user_id_key" UNIQUE using index "driver_profiles_user_id_key";

alter table "public"."driver_profiles" add constraint "driver_profiles_user_id_unique" UNIQUE using index "driver_profiles_user_id_unique";

alter table "public"."legal_acceptances" add constraint "legal_acceptances_acceptance_method_check" CHECK ((acceptance_method = ANY (ARRAY['checkbox_cta'::text, 'reaccept_modal'::text, 'forced_reaccept'::text, 'api'::text]))) not valid;

alter table "public"."legal_acceptances" validate constraint "legal_acceptances_acceptance_method_check";

alter table "public"."legal_acceptances" add constraint "legal_acceptances_actor_type_check" CHECK ((actor_type = ANY (ARRAY['user'::text, 'driver'::text, 'provider'::text, 'admin'::text]))) not valid;

alter table "public"."legal_acceptances" validate constraint "legal_acceptances_actor_type_check";

alter table "public"."legal_acceptances" add constraint "legal_acceptances_document_code_fkey" FOREIGN KEY (document_code) REFERENCES public.legal_documents(code) ON DELETE RESTRICT not valid;

alter table "public"."legal_acceptances" validate constraint "legal_acceptances_document_code_fkey";

alter table "public"."legal_acceptances" add constraint "legal_acceptances_document_version_fk" FOREIGN KEY (document_code, document_version) REFERENCES public.legal_versions(document_code, version) ON DELETE RESTRICT not valid;

alter table "public"."legal_acceptances" validate constraint "legal_acceptances_document_version_fk";

alter table "public"."legal_acceptances" add constraint "legal_acceptances_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."legal_acceptances" validate constraint "legal_acceptances_user_id_fkey";

alter table "public"."legal_documents" add constraint "legal_documents_actor_type_check" CHECK ((actor_type = ANY (ARRAY['user'::text, 'driver'::text, 'provider'::text, 'admin'::text, 'all'::text]))) not valid;

alter table "public"."legal_documents" validate constraint "legal_documents_actor_type_check";

alter table "public"."legal_documents" add constraint "legal_documents_code_key" UNIQUE using index "legal_documents_code_key";

alter table "public"."legal_documents" add constraint "legal_documents_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text]))) not valid;

alter table "public"."legal_documents" validate constraint "legal_documents_status_check";

alter table "public"."legal_versions" add constraint "legal_versions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."legal_versions" validate constraint "legal_versions_created_by_fkey";

alter table "public"."legal_versions" add constraint "legal_versions_document_code_fkey" FOREIGN KEY (document_code) REFERENCES public.legal_documents(code) ON DELETE RESTRICT not valid;

alter table "public"."legal_versions" validate constraint "legal_versions_document_code_fkey";

alter table "public"."legal_versions" add constraint "legal_versions_published_requires_date" CHECK (((is_published = false) OR (published_at IS NOT NULL))) not valid;

alter table "public"."legal_versions" validate constraint "legal_versions_published_requires_date";

alter table "public"."legal_versions" add constraint "legal_versions_unique_doc_version" UNIQUE using index "legal_versions_unique_doc_version";

alter table "public"."pagos" add constraint "pagos_viaje_id_fkey" FOREIGN KEY (viaje_id) REFERENCES public.viajes(id) ON DELETE CASCADE not valid;

alter table "public"."pagos" validate constraint "pagos_viaje_id_fkey";

alter table "public"."payment_events" add constraint "payment_events_payment_id_fkey" FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE CASCADE not valid;

alter table "public"."payment_events" validate constraint "payment_events_payment_id_fkey";

alter table "public"."payments" add constraint "payments_amounts_match" CHECK ((round((platform_fee + provider_amount), 2) <= round((total_amount)::numeric, 2))) not valid;

alter table "public"."payments" validate constraint "payments_amounts_match";

alter table "public"."payments" add constraint "payments_context_type_check" CHECK ((context_type = ANY (ARRAY['SERVICE_REQUEST'::text, 'TRANSPORT_TRIP'::text, 'TRANSPORT_QUOTE'::text]))) not valid;

alter table "public"."payments" validate constraint "payments_context_type_check";

alter table "public"."payments" add constraint "payments_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES auth.users(id) ON DELETE RESTRICT not valid;

alter table "public"."payments" validate constraint "payments_customer_id_fkey";

alter table "public"."payments" add constraint "payments_platform_fee_check" CHECK ((platform_fee >= (0)::numeric)) not valid;

alter table "public"."payments" validate constraint "payments_platform_fee_check";

alter table "public"."payments" add constraint "payments_provider_amount_check" CHECK ((provider_amount >= (0)::numeric)) not valid;

alter table "public"."payments" validate constraint "payments_provider_amount_check";

alter table "public"."payments" add constraint "payments_service_request_id_fkey" FOREIGN KEY (service_request_id) REFERENCES public.svc_requests(id) ON DELETE SET NULL not valid;

alter table "public"."payments" validate constraint "payments_service_request_id_fkey";

alter table "public"."payments" add constraint "payments_status_check" CHECK ((status = ANY (ARRAY['PENDING'::text, 'CHECKOUT_CREATED'::text, 'APPROVED'::text, 'CAPTURED'::text, 'REJECTED'::text, 'CANCELLED'::text, 'REFUNDED'::text, 'PARTIALLY_REFUNDED'::text, 'SETTLED'::text]))) not valid;

alter table "public"."payments" validate constraint "payments_status_check";

alter table "public"."payments" add constraint "payments_total_amount_check" CHECK ((total_amount >= (0)::numeric)) not valid;

alter table "public"."payments" validate constraint "payments_total_amount_check";

alter table "public"."payments" add constraint "payments_trip_id_fkey" FOREIGN KEY (trip_id) REFERENCES public.viajes(id) ON DELETE SET NULL not valid;

alter table "public"."payments" validate constraint "payments_trip_id_fkey";

alter table "public"."push_tokens" add constraint "push_tokens_token_key" UNIQUE using index "push_tokens_token_key";

alter table "public"."refunds" add constraint "refunds_amount_check" CHECK ((amount > (0)::numeric)) not valid;

alter table "public"."refunds" validate constraint "refunds_amount_check";

alter table "public"."refunds" add constraint "refunds_payment_id_fkey" FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE CASCADE not valid;

alter table "public"."refunds" validate constraint "refunds_payment_id_fkey";

alter table "public"."refunds" add constraint "refunds_status_check" CHECK ((status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'REJECTED'::text, 'REFUNDED'::text, 'FAILED'::text, 'REFUND_PENDING'::text]))) not valid;

alter table "public"."refunds" validate constraint "refunds_status_check";

alter table "public"."settlements" add constraint "settlements_gross_amount_check" CHECK ((gross_amount >= (0)::numeric)) not valid;

alter table "public"."settlements" validate constraint "settlements_gross_amount_check";

alter table "public"."settlements" add constraint "settlements_net_amount_check" CHECK ((net_amount >= (0)::numeric)) not valid;

alter table "public"."settlements" validate constraint "settlements_net_amount_check";

alter table "public"."settlements" add constraint "settlements_payment_id_fkey" FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE CASCADE not valid;

alter table "public"."settlements" validate constraint "settlements_payment_id_fkey";

alter table "public"."settlements" add constraint "settlements_payment_id_key" UNIQUE using index "settlements_payment_id_key";

alter table "public"."settlements" add constraint "settlements_platform_fee_check" CHECK ((platform_fee >= (0)::numeric)) not valid;

alter table "public"."settlements" validate constraint "settlements_platform_fee_check";

alter table "public"."settlements" add constraint "settlements_status_check" CHECK ((status = ANY (ARRAY['PENDING'::text, 'READY'::text, 'SETTLED'::text, 'FAILED'::text, 'CANCELLED'::text]))) not valid;

alter table "public"."settlements" validate constraint "settlements_status_check";

alter table "public"."svc_assignments" add constraint "svc_assignments_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES public.svc_providers(id) ON DELETE CASCADE not valid;

alter table "public"."svc_assignments" validate constraint "svc_assignments_provider_id_fkey";

alter table "public"."svc_assignments" add constraint "svc_assignments_request_id_fkey" FOREIGN KEY (request_id) REFERENCES public.svc_requests(id) ON DELETE CASCADE not valid;

alter table "public"."svc_assignments" validate constraint "svc_assignments_request_id_fkey";

alter table "public"."svc_assignments" add constraint "svc_assignments_request_id_key" UNIQUE using index "svc_assignments_request_id_key";

alter table "public"."svc_assignments" add constraint "svc_assignments_status_check" CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'COMPLETED'::text, 'CANCELLED'::text]))) not valid;

alter table "public"."svc_assignments" validate constraint "svc_assignments_status_check";

alter table "public"."svc_categories" add constraint "svc_categories_code_key" UNIQUE using index "svc_categories_code_key";

alter table "public"."svc_categories" add constraint "svc_categories_default_pricing_model_check" CHECK ((default_pricing_model = ANY (ARRAY['HOURLY'::text, 'BASE_VISIT'::text, 'QUOTE'::text, 'FIXED'::text, 'UNIT'::text, 'SQUARE_METER'::text, 'LINEAR_METER'::text]))) not valid;

alter table "public"."svc_categories" validate constraint "svc_categories_default_pricing_model_check";

alter table "public"."svc_conversations" add constraint "svc_conversations_client_user_id_fkey" FOREIGN KEY (client_user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."svc_conversations" validate constraint "svc_conversations_client_user_id_fkey";

alter table "public"."svc_conversations" add constraint "svc_conversations_provider_user_id_fkey" FOREIGN KEY (provider_user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."svc_conversations" validate constraint "svc_conversations_provider_user_id_fkey";

alter table "public"."svc_conversations" add constraint "svc_conversations_request_id_fkey" FOREIGN KEY (request_id) REFERENCES public.svc_requests(id) ON DELETE CASCADE not valid;

alter table "public"."svc_conversations" validate constraint "svc_conversations_request_id_fkey";

alter table "public"."svc_conversations" add constraint "svc_conversations_request_id_key" UNIQUE using index "svc_conversations_request_id_key";

alter table "public"."svc_conversations" add constraint "svc_conversations_status_check" CHECK ((status = ANY (ARRAY['OPEN'::text, 'CLOSED'::text]))) not valid;

alter table "public"."svc_conversations" validate constraint "svc_conversations_status_check";

alter table "public"."svc_escrow_holds" add constraint "svc_escrow_holds_payment_intent_id_fkey" FOREIGN KEY (payment_intent_id) REFERENCES public.svc_payment_intents(id) ON DELETE CASCADE not valid;

alter table "public"."svc_escrow_holds" validate constraint "svc_escrow_holds_payment_intent_id_fkey";

alter table "public"."svc_escrow_holds" add constraint "svc_escrow_holds_request_id_fkey" FOREIGN KEY (request_id) REFERENCES public.svc_requests(id) ON DELETE CASCADE not valid;

alter table "public"."svc_escrow_holds" validate constraint "svc_escrow_holds_request_id_fkey";

alter table "public"."svc_escrow_holds" add constraint "svc_escrow_holds_request_id_key" UNIQUE using index "svc_escrow_holds_request_id_key";

alter table "public"."svc_escrow_holds" add constraint "svc_escrow_holds_status_check" CHECK ((status = ANY (ARRAY['HELD'::text, 'RELEASED'::text, 'VOIDED'::text]))) not valid;

alter table "public"."svc_escrow_holds" validate constraint "svc_escrow_holds_status_check";

alter table "public"."svc_financial_ledger" add constraint "svc_financial_ledger_entry_type_check" CHECK ((entry_type = ANY (ARRAY['ESCROW_RELEASE'::text, 'PLATFORM_FEE_ACCRUAL'::text, 'PROVIDER_EARNING_ACCRUAL'::text, 'REFUND'::text, 'CANCELLATION_FEE'::text]))) not valid;

alter table "public"."svc_financial_ledger" validate constraint "svc_financial_ledger_entry_type_check";

alter table "public"."svc_financial_ledger" add constraint "svc_financial_ledger_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES public.svc_providers(id) ON DELETE SET NULL not valid;

alter table "public"."svc_financial_ledger" validate constraint "svc_financial_ledger_provider_id_fkey";

alter table "public"."svc_financial_ledger" add constraint "svc_financial_ledger_request_id_fkey" FOREIGN KEY (request_id) REFERENCES public.svc_requests(id) ON DELETE SET NULL not valid;

alter table "public"."svc_financial_ledger" validate constraint "svc_financial_ledger_request_id_fkey";

alter table "public"."svc_idempotency_keys" add constraint "svc_idempotency_keys_key_function_name_key" UNIQUE using index "svc_idempotency_keys_key_function_name_key";

alter table "public"."svc_idempotency_keys" add constraint "svc_idempotency_keys_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."svc_idempotency_keys" validate constraint "svc_idempotency_keys_user_id_fkey";

alter table "public"."svc_messages" add constraint "svc_messages_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.svc_conversations(id) ON DELETE CASCADE not valid;

alter table "public"."svc_messages" validate constraint "svc_messages_conversation_id_fkey";

alter table "public"."svc_messages" add constraint "svc_messages_delivery_status_check" CHECK ((delivery_status = ANY (ARRAY['PENDING'::text, 'SENT'::text, 'DELIVERED'::text, 'READ'::text, 'FAILED'::text, 'pending'::text, 'sent'::text, 'delivered'::text, 'read'::text, 'failed'::text]))) not valid;

alter table "public"."svc_messages" validate constraint "svc_messages_delivery_status_check";

alter table "public"."svc_messages" add constraint "svc_messages_message_type_check" CHECK ((message_type = ANY (ARRAY['TEXT'::text, 'IMAGE'::text, 'FILE'::text, 'MIXED'::text, 'SYSTEM'::text, 'text'::text, 'image'::text, 'file'::text, 'mixed'::text, 'system'::text]))) not valid;

alter table "public"."svc_messages" validate constraint "svc_messages_message_type_check";

alter table "public"."svc_messages" add constraint "svc_messages_sender_role_check" CHECK ((sender_role = ANY (ARRAY['client'::text, 'provider'::text, 'driver'::text, 'admin'::text, 'system'::text, 'chofer'::text, 'prestador'::text]))) not valid;

alter table "public"."svc_messages" validate constraint "svc_messages_sender_role_check";

alter table "public"."svc_messages" add constraint "svc_messages_sender_user_id_fkey" FOREIGN KEY (sender_user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."svc_messages" validate constraint "svc_messages_sender_user_id_fkey";

alter table "public"."svc_notification_deliveries" add constraint "svc_notification_deliveries_channel_check" CHECK ((channel = ANY (ARRAY['IN_APP'::text, 'PUSH'::text, 'EMAIL'::text]))) not valid;

alter table "public"."svc_notification_deliveries" validate constraint "svc_notification_deliveries_channel_check";

alter table "public"."svc_notification_deliveries" add constraint "svc_notification_deliveries_notification_id_fkey" FOREIGN KEY (notification_id) REFERENCES public.svc_notifications(id) ON DELETE CASCADE not valid;

alter table "public"."svc_notification_deliveries" validate constraint "svc_notification_deliveries_notification_id_fkey";

alter table "public"."svc_notification_deliveries" add constraint "svc_notification_deliveries_status_check" CHECK ((status = ANY (ARRAY['QUEUED'::text, 'SENT'::text, 'FAILED'::text, 'SKIPPED'::text]))) not valid;

alter table "public"."svc_notification_deliveries" validate constraint "svc_notification_deliveries_status_check";

alter table "public"."svc_notification_deliveries" add constraint "svc_notification_deliveries_user_device_id_fkey" FOREIGN KEY (user_device_id) REFERENCES public.svc_user_devices(id) ON DELETE SET NULL not valid;

alter table "public"."svc_notification_deliveries" validate constraint "svc_notification_deliveries_user_device_id_fkey";

alter table "public"."svc_notifications" add constraint "svc_notifications_delivery_status_check" CHECK ((delivery_status = ANY (ARRAY['PENDING'::text, 'SENT'::text, 'PARTIAL'::text, 'FAILED'::text]))) not valid;

alter table "public"."svc_notifications" validate constraint "svc_notifications_delivery_status_check";

alter table "public"."svc_notifications" add constraint "svc_notifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."svc_notifications" validate constraint "svc_notifications_user_id_fkey";

alter table "public"."svc_payment_intents" add constraint "svc_payment_intents_client_user_id_fkey" FOREIGN KEY (client_user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."svc_payment_intents" validate constraint "svc_payment_intents_client_user_id_fkey";

alter table "public"."svc_payment_intents" add constraint "svc_payment_intents_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES public.svc_providers(id) ON DELETE SET NULL not valid;

alter table "public"."svc_payment_intents" validate constraint "svc_payment_intents_provider_id_fkey";

alter table "public"."svc_payment_intents" add constraint "svc_payment_intents_request_id_fkey" FOREIGN KEY (request_id) REFERENCES public.svc_requests(id) ON DELETE CASCADE not valid;

alter table "public"."svc_payment_intents" validate constraint "svc_payment_intents_request_id_fkey";

alter table "public"."svc_payment_intents" add constraint "svc_payment_intents_request_id_key" UNIQUE using index "svc_payment_intents_request_id_key";

alter table "public"."svc_payment_intents" add constraint "svc_payment_intents_status_check" CHECK ((status = ANY (ARRAY['CREATED'::text, 'AUTHORIZED'::text, 'CAPTURED'::text, 'VOIDED'::text, 'REFUNDED'::text]))) not valid;

alter table "public"."svc_payment_intents" validate constraint "svc_payment_intents_status_check";

alter table "public"."svc_platform_config" add constraint "svc_platform_config_config_key_key" UNIQUE using index "svc_platform_config_config_key_key";

alter table "public"."svc_provider_availability" add constraint "svc_provider_availability_check" CHECK ((end_time > start_time)) not valid;

alter table "public"."svc_provider_availability" validate constraint "svc_provider_availability_check";

alter table "public"."svc_provider_availability" add constraint "svc_provider_availability_day_of_week_check" CHECK (((day_of_week >= 0) AND (day_of_week <= 6))) not valid;

alter table "public"."svc_provider_availability" validate constraint "svc_provider_availability_day_of_week_check";

alter table "public"."svc_provider_availability" add constraint "svc_provider_availability_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES public.svc_providers(id) ON DELETE CASCADE not valid;

alter table "public"."svc_provider_availability" validate constraint "svc_provider_availability_provider_id_fkey";

alter table "public"."svc_provider_categories" add constraint "svc_provider_categories_category_id_fkey" FOREIGN KEY (category_id) REFERENCES public.svc_categories(id) ON DELETE CASCADE not valid;

alter table "public"."svc_provider_categories" validate constraint "svc_provider_categories_category_id_fkey";

alter table "public"."svc_provider_categories" add constraint "svc_provider_categories_provider_id_category_id_key" UNIQUE using index "svc_provider_categories_provider_id_category_id_key";

alter table "public"."svc_provider_categories" add constraint "svc_provider_categories_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES public.svc_providers(id) ON DELETE CASCADE not valid;

alter table "public"."svc_provider_categories" validate constraint "svc_provider_categories_provider_id_fkey";

alter table "public"."svc_provider_documents" add constraint "svc_provider_documents_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES public.svc_providers(id) ON DELETE CASCADE not valid;

alter table "public"."svc_provider_documents" validate constraint "svc_provider_documents_provider_id_fkey";

alter table "public"."svc_provider_documents" add constraint "svc_provider_documents_review_status_check" CHECK ((review_status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'REJECTED'::text]))) not valid;

alter table "public"."svc_provider_documents" validate constraint "svc_provider_documents_review_status_check";

alter table "public"."svc_provider_documents" add constraint "svc_provider_documents_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) not valid;

alter table "public"."svc_provider_documents" validate constraint "svc_provider_documents_reviewed_by_fkey";

alter table "public"."svc_provider_identity_checks" add constraint "svc_provider_identity_checks_dni_front_document_id_fkey" FOREIGN KEY (dni_front_document_id) REFERENCES public.svc_provider_documents(id) not valid;

alter table "public"."svc_provider_identity_checks" validate constraint "svc_provider_identity_checks_dni_front_document_id_fkey";

alter table "public"."svc_provider_identity_checks" add constraint "svc_provider_identity_checks_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES public.svc_providers(id) ON DELETE CASCADE not valid;

alter table "public"."svc_provider_identity_checks" validate constraint "svc_provider_identity_checks_provider_id_fkey";

alter table "public"."svc_provider_identity_checks" add constraint "svc_provider_identity_checks_selfie_document_id_fkey" FOREIGN KEY (selfie_document_id) REFERENCES public.svc_provider_documents(id) not valid;

alter table "public"."svc_provider_identity_checks" validate constraint "svc_provider_identity_checks_selfie_document_id_fkey";

alter table "public"."svc_provider_pricing" add constraint "svc_provider_pricing_category_id_fkey" FOREIGN KEY (category_id) REFERENCES public.svc_categories(id) ON DELETE CASCADE not valid;

alter table "public"."svc_provider_pricing" validate constraint "svc_provider_pricing_category_id_fkey";

alter table "public"."svc_provider_pricing" add constraint "svc_provider_pricing_check" CHECK ((maximum_hours >= minimum_hours)) not valid;

alter table "public"."svc_provider_pricing" validate constraint "svc_provider_pricing_check";

alter table "public"."svc_provider_pricing" add constraint "svc_provider_pricing_minimum_hours_check" CHECK ((minimum_hours >= 1)) not valid;

alter table "public"."svc_provider_pricing" validate constraint "svc_provider_pricing_minimum_hours_check";

alter table "public"."svc_provider_pricing" add constraint "svc_provider_pricing_price_per_hour_check" CHECK ((price_per_hour >= (0)::numeric)) not valid;

alter table "public"."svc_provider_pricing" validate constraint "svc_provider_pricing_price_per_hour_check";

alter table "public"."svc_provider_pricing" add constraint "svc_provider_pricing_provider_id_category_id_key" UNIQUE using index "svc_provider_pricing_provider_id_category_id_key";

alter table "public"."svc_provider_pricing" add constraint "svc_provider_pricing_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES public.svc_providers(id) ON DELETE CASCADE not valid;

alter table "public"."svc_provider_pricing" validate constraint "svc_provider_pricing_provider_id_fkey";

alter table "public"."svc_provider_profiles" add constraint "svc_provider_profiles_max_hours_per_service_check" CHECK (((max_hours_per_service >= 1) AND (max_hours_per_service <= 24))) not valid;

alter table "public"."svc_provider_profiles" validate constraint "svc_provider_profiles_max_hours_per_service_check";

alter table "public"."svc_provider_profiles" add constraint "svc_provider_profiles_pricing_mode_check" CHECK ((pricing_mode = ANY (ARRAY['HOURLY'::text, 'FIXED'::text]))) not valid;

alter table "public"."svc_provider_profiles" validate constraint "svc_provider_profiles_pricing_mode_check";

alter table "public"."svc_provider_profiles" add constraint "svc_provider_profiles_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES public.svc_providers(id) ON DELETE CASCADE not valid;

alter table "public"."svc_provider_profiles" validate constraint "svc_provider_profiles_provider_id_fkey";

alter table "public"."svc_provider_profiles" add constraint "svc_provider_profiles_provider_id_key" UNIQUE using index "svc_provider_profiles_provider_id_key";

alter table "public"."svc_provider_service_offerings" add constraint "svc_provider_service_offerings_amounts_check" CHECK (((COALESCE(price_per_hour, (0)::numeric) >= (0)::numeric) AND (COALESCE(base_visit_fee, (0)::numeric) >= (0)::numeric) AND (COALESCE(fixed_price, (0)::numeric) >= (0)::numeric) AND (COALESCE(unit_price, (0)::numeric) >= (0)::numeric) AND (COALESCE(minimum_charge, (0)::numeric) >= (0)::numeric))) not valid;

alter table "public"."svc_provider_service_offerings" validate constraint "svc_provider_service_offerings_amounts_check";

alter table "public"."svc_provider_service_offerings" add constraint "svc_provider_service_offerings_category_id_fkey" FOREIGN KEY (category_id) REFERENCES public.svc_categories(id) ON DELETE RESTRICT not valid;

alter table "public"."svc_provider_service_offerings" validate constraint "svc_provider_service_offerings_category_id_fkey";

alter table "public"."svc_provider_service_offerings" add constraint "svc_provider_service_offerings_pricing_model_check" CHECK ((pricing_model = ANY (ARRAY['HOURLY'::text, 'BASE_VISIT'::text, 'QUOTE'::text, 'FIXED'::text, 'UNIT'::text, 'SQUARE_METER'::text, 'LINEAR_METER'::text]))) not valid;

alter table "public"."svc_provider_service_offerings" validate constraint "svc_provider_service_offerings_pricing_model_check";

alter table "public"."svc_provider_service_offerings" add constraint "svc_provider_service_offerings_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES public.svc_providers(id) ON DELETE CASCADE not valid;

alter table "public"."svc_provider_service_offerings" validate constraint "svc_provider_service_offerings_provider_id_fkey";

alter table "public"."svc_providers" add constraint "svc_providers_status_check" CHECK ((status = ANY (ARRAY['OFFLINE'::text, 'ONLINE_IDLE'::text, 'INVITED'::text, 'BOOKED_UPCOMING'::text, 'EN_ROUTE'::text, 'ARRIVED'::text, 'IN_SERVICE'::text, 'PAUSED'::text, 'BLOCKED'::text]))) not valid;

alter table "public"."svc_providers" validate constraint "svc_providers_status_check";

alter table "public"."svc_providers" add constraint "svc_providers_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."svc_providers" validate constraint "svc_providers_user_id_fkey";

alter table "public"."svc_providers" add constraint "svc_providers_user_id_key" UNIQUE using index "svc_providers_user_id_key";

alter table "public"."svc_request_candidates" add constraint "svc_request_candidates_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES public.svc_providers(id) ON DELETE CASCADE not valid;

alter table "public"."svc_request_candidates" validate constraint "svc_request_candidates_provider_id_fkey";

alter table "public"."svc_request_candidates" add constraint "svc_request_candidates_request_id_fkey" FOREIGN KEY (request_id) REFERENCES public.svc_requests(id) ON DELETE CASCADE not valid;

alter table "public"."svc_request_candidates" validate constraint "svc_request_candidates_request_id_fkey";

alter table "public"."svc_request_candidates" add constraint "svc_request_candidates_request_id_provider_id_key" UNIQUE using index "svc_request_candidates_request_id_provider_id_key";

alter table "public"."svc_request_events" add constraint "svc_request_events_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."svc_request_events" validate constraint "svc_request_events_actor_user_id_fkey";

alter table "public"."svc_request_events" add constraint "svc_request_events_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES public.svc_providers(id) ON DELETE SET NULL not valid;

alter table "public"."svc_request_events" validate constraint "svc_request_events_provider_id_fkey";

alter table "public"."svc_request_events" add constraint "svc_request_events_request_id_fkey" FOREIGN KEY (request_id) REFERENCES public.svc_requests(id) ON DELETE CASCADE not valid;

alter table "public"."svc_request_events" validate constraint "svc_request_events_request_id_fkey";

alter table "public"."svc_request_offers" add constraint "svc_request_offers_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES public.svc_providers(id) ON DELETE CASCADE not valid;

alter table "public"."svc_request_offers" validate constraint "svc_request_offers_provider_id_fkey";

alter table "public"."svc_request_offers" add constraint "svc_request_offers_request_id_fkey" FOREIGN KEY (request_id) REFERENCES public.svc_requests(id) ON DELETE CASCADE not valid;

alter table "public"."svc_request_offers" validate constraint "svc_request_offers_request_id_fkey";

alter table "public"."svc_request_offers" add constraint "svc_request_offers_status_check" CHECK ((status = ANY (ARRAY['PENDING'::text, 'ACCEPTED'::text, 'REJECTED'::text, 'EXPIRED'::text, 'CANCELLED'::text]))) not valid;

alter table "public"."svc_request_offers" validate constraint "svc_request_offers_status_check";

alter table "public"."svc_requests" add constraint "svc_requests_accepted_provider_id_fkey" FOREIGN KEY (accepted_provider_id) REFERENCES public.svc_providers(id) not valid;

alter table "public"."svc_requests" validate constraint "svc_requests_accepted_provider_id_fkey";

alter table "public"."svc_requests" add constraint "svc_requests_cancelled_by_check" CHECK ((cancelled_by = ANY (ARRAY['CLIENT'::text, 'PROVIDER'::text, 'ADMIN'::text]))) not valid;

alter table "public"."svc_requests" validate constraint "svc_requests_cancelled_by_check";

alter table "public"."svc_requests" add constraint "svc_requests_category_id_fkey" FOREIGN KEY (category_id) REFERENCES public.svc_categories(id) not valid;

alter table "public"."svc_requests" validate constraint "svc_requests_category_id_fkey";

alter table "public"."svc_requests" add constraint "svc_requests_client_user_id_fkey" FOREIGN KEY (client_user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."svc_requests" validate constraint "svc_requests_client_user_id_fkey";

alter table "public"."svc_requests" add constraint "svc_requests_request_type_check" CHECK ((request_type = ANY (ARRAY['IMMEDIATE'::text, 'SCHEDULED'::text]))) not valid;

alter table "public"."svc_requests" validate constraint "svc_requests_request_type_check";

alter table "public"."svc_requests" add constraint "svc_requests_requested_hours_check" CHECK (((requested_hours >= 1) AND (requested_hours <= 24))) not valid;

alter table "public"."svc_requests" validate constraint "svc_requests_requested_hours_check";

alter table "public"."svc_requests" add constraint "svc_requests_selected_provider_id_fkey" FOREIGN KEY (selected_provider_id) REFERENCES public.svc_providers(id) not valid;

alter table "public"."svc_requests" validate constraint "svc_requests_selected_provider_id_fkey";

alter table "public"."svc_requests" add constraint "svc_requests_status_check" CHECK ((status = ANY (ARRAY['SEARCHING'::text, 'PENDING_PROVIDER_RESPONSE'::text, 'ACCEPTED'::text, 'SCHEDULED'::text, 'PROVIDER_EN_ROUTE'::text, 'PROVIDER_ARRIVED'::text, 'IN_PROGRESS'::text, 'COMPLETED'::text, 'CANCELLED'::text]))) not valid;

alter table "public"."svc_requests" validate constraint "svc_requests_status_check";

alter table "public"."svc_reviews" add constraint "svc_reviews_client_user_id_fkey" FOREIGN KEY (client_user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."svc_reviews" validate constraint "svc_reviews_client_user_id_fkey";

alter table "public"."svc_reviews" add constraint "svc_reviews_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES public.svc_providers(id) ON DELETE CASCADE not valid;

alter table "public"."svc_reviews" validate constraint "svc_reviews_provider_id_fkey";

alter table "public"."svc_reviews" add constraint "svc_reviews_rating_check" CHECK (((rating >= 1) AND (rating <= 5))) not valid;

alter table "public"."svc_reviews" validate constraint "svc_reviews_rating_check";

alter table "public"."svc_reviews" add constraint "svc_reviews_request_id_fkey" FOREIGN KEY (request_id) REFERENCES public.svc_requests(id) ON DELETE CASCADE not valid;

alter table "public"."svc_reviews" validate constraint "svc_reviews_request_id_fkey";

alter table "public"."svc_reviews" add constraint "svc_reviews_request_id_key" UNIQUE using index "svc_reviews_request_id_key";

alter table "public"."svc_scheduled_events" add constraint "svc_scheduled_events_event_type_check" CHECK ((event_type = ANY (ARRAY['OFFER_EXPIRE'::text, 'REMINDER_24H'::text, 'REMINDER_4H'::text, 'REMINDER_1H'::text, 'EMAIL_FALLBACK'::text, 'PAYOUT_RELEASE'::text, 'DEVICE_CLEANUP'::text]))) not valid;

alter table "public"."svc_scheduled_events" validate constraint "svc_scheduled_events_event_type_check";

alter table "public"."svc_scheduled_events" add constraint "svc_scheduled_events_status_check" CHECK ((status = ANY (ARRAY['PENDING'::text, 'DONE'::text, 'FAILED'::text]))) not valid;

alter table "public"."svc_scheduled_events" validate constraint "svc_scheduled_events_status_check";

alter table "public"."svc_service_intent_rules" add constraint "svc_service_intent_rules_category_id_fkey" FOREIGN KEY (category_id) REFERENCES public.svc_categories(id) ON DELETE CASCADE not valid;

alter table "public"."svc_service_intent_rules" validate constraint "svc_service_intent_rules_category_id_fkey";

alter table "public"."svc_tracking" add constraint "svc_tracking_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES public.svc_providers(id) ON DELETE CASCADE not valid;

alter table "public"."svc_tracking" validate constraint "svc_tracking_provider_id_fkey";

alter table "public"."svc_tracking" add constraint "svc_tracking_request_id_fkey" FOREIGN KEY (request_id) REFERENCES public.svc_requests(id) ON DELETE CASCADE not valid;

alter table "public"."svc_tracking" validate constraint "svc_tracking_request_id_fkey";

alter table "public"."svc_user_devices" add constraint "svc_user_devices_user_id_device_id_key" UNIQUE using index "svc_user_devices_user_id_device_id_key";

alter table "public"."svc_user_devices" add constraint "svc_user_devices_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."svc_user_devices" validate constraint "svc_user_devices_user_id_fkey";

alter table "public"."viaje_eventos" add constraint "viaje_eventos_viaje_id_fkey" FOREIGN KEY (viaje_id) REFERENCES public.viajes(id) ON DELETE CASCADE not valid;

alter table "public"."viaje_eventos" validate constraint "viaje_eventos_viaje_id_fkey";

alter table "public"."viaje_ofertas" add constraint "viaje_ofertas_cotizacion_id_fkey" FOREIGN KEY (cotizacion_id) REFERENCES public.cotizaciones(id) ON DELETE SET NULL not valid;

alter table "public"."viaje_ofertas" validate constraint "viaje_ofertas_cotizacion_id_fkey";

alter table "public"."viaje_ofertas" add constraint "viaje_ofertas_viaje_id_fkey" FOREIGN KEY (viaje_id) REFERENCES public.viajes(id) ON DELETE CASCADE not valid;

alter table "public"."viaje_ofertas" validate constraint "viaje_ofertas_viaje_id_fkey";

alter table "public"."viaje_tracking" add constraint "viaje_tracking_viaje_id_fkey" FOREIGN KEY (viaje_id) REFERENCES public.viajes(id) ON DELETE CASCADE not valid;

alter table "public"."viaje_tracking" validate constraint "viaje_tracking_viaje_id_fkey";

alter table "public"."viajes" add constraint "viajes_cotizacion_id_fkey" FOREIGN KEY (cotizacion_id) REFERENCES public.cotizaciones(id) ON DELETE SET NULL not valid;

alter table "public"."viajes" validate constraint "viajes_cotizacion_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.aceptar_oferta_secuencial(p_offer_id uuid, p_viaje_id uuid, p_chofer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_oferta_actualizada integer := 0;
  v_viaje_actualizado integer := 0;
begin
  -- 1) aceptar solo si la oferta sigue vigente
  update viaje_ofertas
  set
    estado = 'ACEPTADA',
    respondida_en = now()
  where id = p_offer_id
    and viaje_id = p_viaje_id
    and chofer_id = p_chofer_id
    and estado = 'PENDIENTE'
    and expires_at > now();

  get diagnostics v_oferta_actualizada = row_count;

  if v_oferta_actualizada = 0 then
    return jsonb_build_object(
      'exito', false,
      'paso', 'aceptar_oferta',
      'error', 'oferta_invalida_o_expirada'
    );
  end if;

  -- 2) asignar viaje solo si nadie lo tomó antes
  update viajes
  set
    estado = 'ASIGNADO',
    assigned_driver_id = p_chofer_id,
    chofer_id_uuid = p_chofer_id,
    dispatch_locked = false,
    current_offer_expires_at = null,
    updated_at = now()
  where id = p_viaje_id
    and assigned_driver_id is null
    and estado in ('OFERTADO', 'DISPONIBLE');

  get diagnostics v_viaje_actualizado = row_count;

  if v_viaje_actualizado = 0 then
    -- rollback lógico de la oferta si el viaje ya lo ganó otro
    update viaje_ofertas
    set
      estado = 'EXPIRADA',
      respondida_en = now()
    where id = p_offer_id
      and estado = 'ACEPTADA';

    return jsonb_build_object(
      'exito', false,
      'paso', 'asignar_viaje',
      'error', 'viaje_ya_asignado'
    );
  end if;

  -- 3) cerrar todas las demás ofertas pendientes
  update viaje_ofertas
  set
    estado = 'EXPIRADA',
    respondida_en = now()
  where viaje_id = p_viaje_id
    and chofer_id <> p_chofer_id
    and estado = 'PENDIENTE';

  return jsonb_build_object(
    'exito', true,
    'viaje_id', p_viaje_id,
    'chofer_id', p_chofer_id,
    'offer_id', p_offer_id,
    'estado', 'ASIGNADO'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.aceptar_oferta_viaje(p_viaje_id uuid, p_chofer_id uuid)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
declare
  v_now timestamptz := now();
  v_affected integer;
begin
  begin
    perform 1
    from viajes
    where id = p_viaje_id
    for update nowait;
  exception
    when lock_not_available then
      return json_build_object(
        'ok', false,
        'reason', 'VIAJE_BLOQUEADO'
      );
  end;

  update viaje_ofertas
  set
    estado = 'aceptada',
    respondida_en = v_now
  where viaje_id = p_viaje_id
    and chofer_id = p_chofer_id
    and estado = 'pendiente'
    and expires_at > v_now;

  get diagnostics v_affected = row_count;

  if v_affected = 0 then
    return json_build_object(
      'ok', false,
      'reason', 'OFERTA_NO_DISPONIBLE'
    );
  end if;

  update viajes
  set
    estado = 'ACEPTADO',
    chofer_user_id = p_chofer_id,
    aceptado_at = v_now,
    asignado_at = coalesce(asignado_at, v_now),
    current_offer_expires_at = null
  where id = p_viaje_id
    and estado in ('OFERTADO','ASIGNADO','DISPONIBLE')
    and chofer_user_id is null;

  get diagnostics v_affected = row_count;

  if v_affected = 0 then
    update viaje_ofertas
    set estado = 'cancelada'
    where viaje_id = p_viaje_id
      and chofer_id = p_chofer_id
      and estado = 'aceptada';

    return json_build_object(
      'ok', false,
      'reason', 'VIAJE_YA_TOMADO'
    );
  end if;

  update viaje_ofertas
  set
    estado = 'cancelada',
    respondida_en = v_now
  where viaje_id = p_viaje_id
    and chofer_id <> p_chofer_id
    and estado = 'pendiente';

  update choferes
  set
    disponible = false,
    ultimo_viaje_id = p_viaje_id
  where user_id = p_chofer_id;

  insert into viaje_eventos (viaje_id, chofer_id_uuid, tipo, payload)
  values (
    p_viaje_id,
    null,
    'VIAJE_ACEPTADO',
    jsonb_build_object('chofer_user_id', p_chofer_id)
  );

  return json_build_object(
    'ok', true,
    'viaje_id', p_viaje_id,
    'chofer_id', p_chofer_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.aceptar_viaje_legacy(p_viaje_id uuid, p_chofer_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_affected INT;
BEGIN
  PERFORM 1 FROM viajes WHERE id = p_viaje_id FOR UPDATE;

  UPDATE viaje_ofertas
  SET estado = 'ACEPTADA', responded_at = v_now
  WHERE viaje_id = p_viaje_id
    AND chofer_id_uuid = p_chofer_id
    AND estado = 'PENDIENTE'
    AND expires_at > v_now;

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected = 0 THEN
    RETURN FALSE;
  END IF;

  UPDATE viajes
  SET estado = 'ACEPTADO',
      chofer_id_uuid = p_chofer_id,
      aceptado_at = v_now,
      current_offer_expires_at = NULL
  WHERE id = p_viaje_id
    AND estado IN ('OFERTADO', 'ASIGNADO')
    AND chofer_id_uuid IS NULL;

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected = 0 THEN
    UPDATE viaje_ofertas
    SET estado = 'CANCELADA'
    WHERE viaje_id = p_viaje_id
      AND chofer_id_uuid = p_chofer_id
      AND estado = 'ACEPTADA';
    RETURN FALSE;
  END IF;

  UPDATE viaje_ofertas
  SET estado = 'CANCELADA', responded_at = v_now
  WHERE viaje_id = p_viaje_id
    AND chofer_id_uuid <> p_chofer_id
    AND estado = 'PENDIENTE';

  UPDATE choferes
  SET disponible = false,
      ultimo_viaje_id = p_viaje_id
  WHERE id_uuid = p_chofer_id;

  INSERT INTO viaje_eventos(viaje_id, chofer_id_uuid, tipo, payload)
  VALUES (p_viaje_id, p_chofer_id, 'VIAJE_ACEPTADO', '{}'::jsonb);

  RETURN TRUE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.aceptar_viaje_multi_oferta(p_viaje_id uuid, p_chofer_id uuid)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
declare
  v_viaje viajes%rowtype;
  v_oferta viaje_ofertas%rowtype;
begin
  perform set_config('lock_timeout', '3s', true);

  begin
    select *
    into v_viaje
    from viajes
    where id = p_viaje_id
    for update nowait;
  exception
    when lock_not_available then
      return json_build_object(
        'exito', false,
        'motivo', 'viaje_bloqueado'
      );
  end;

  if not found then
    return json_build_object(
      'exito', false,
      'motivo', 'viaje_no_encontrado'
    );
  end if;

  update viaje_ofertas
  set
    estado = 'EXPIRADA',
    respondida_en = now()
  where viaje_id = p_viaje_id
    and estado = 'PENDIENTE'
    and expires_at is not null
    and expires_at <= now();

  if
    v_viaje.assigned_driver_id is not null
    or upper(coalesce(v_viaje.estado, '')) in ('ASIGNADO', 'EN_CURSO', 'COMPLETADO', 'CANCELADO')
  then
    return json_build_object(
      'exito', false,
      'motivo', 'viaje_ya_tomado',
      'estado', v_viaje.estado,
      'assigned_driver_id', v_viaje.assigned_driver_id,
      'chofer_id_uuid', v_viaje.chofer_id_uuid
    );
  end if;

  begin
    select *
    into v_oferta
    from viaje_ofertas
    where viaje_id = p_viaje_id
      and chofer_id = p_chofer_id
      and estado = 'PENDIENTE'
      and (expires_at is null or expires_at > now())
    order by enviada_en asc nulls last
    limit 1
    for update nowait;
  exception
    when lock_not_available then
      return json_build_object(
        'exito', false,
        'motivo', 'oferta_bloqueada'
      );
  end;

  if not found then
    return json_build_object(
      'exito', false,
      'motivo', 'oferta_no_valida'
    );
  end if;

  update viajes
  set
    estado = 'ASIGNADO',
    chofer_id_uuid = p_chofer_id,
    assigned_driver_id = p_chofer_id,
    asignado_at = coalesce(asignado_at, now()),
    aceptado_at = now(),
    dispatch_locked = false,
    no_driver_found = false,
    current_offer_expires_at = null,
    updated_at = now()
  where id = p_viaje_id;

  update viaje_ofertas
  set
    estado = 'ACEPTADA',
    respondida_en = now()
  where id = v_oferta.id;

  update viaje_ofertas
  set
    estado = case
      when expires_at is not null and expires_at <= now() then 'EXPIRADA'
      else 'RECHAZADA'
    end,
    respondida_en = now()
  where viaje_id = p_viaje_id
    and id <> v_oferta.id
    and estado = 'PENDIENTE';

  insert into viaje_eventos (
    id,
    viaje_id,
    chofer_id_uuid,
    tipo,
    payload,
    created_at
  )
  values (
    gen_random_uuid(),
    p_viaje_id,
    p_chofer_id,
    'viaje_aceptado_multi_oferta',
    jsonb_build_object(
      'ganador', p_chofer_id,
      'oferta_id', v_oferta.id,
      'modo', 'winner_takes_all'
    ),
    now()
  );

  return json_build_object(
    'exito', true,
    'motivo', 'viaje_asignado',
    'viaje_id', p_viaje_id,
    'chofer_id', p_chofer_id,
    'estado', 'ASIGNADO',
    'oferta_id', v_oferta.id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.actualizar_metricas_chofer()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.estado = 'COMPLETADO' AND OLD.estado != 'COMPLETADO' THEN
        UPDATE choferes
        SET total_viajes = total_viajes + 1,
            en_viaje = false,
            disponible = true
        WHERE id_uuid = NEW.chofer_id_uuid;
        
        -- Crear registro de pago
        INSERT INTO pagos (viaje_id, chofer_id_uuid, monto_total, monto_chofer)
        VALUES (NEW.id, NEW.chofer_id_uuid, NEW.precio_total, NEW.precio_total * 0.8);
    END IF;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_review_driver(p_driver_user_id uuid, p_action text, p_review_notes text DEFAULT NULL::text, p_reviewed_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_status text;
begin
  if p_action not in ('approve', 'reject', 'block', 'unblock') then
    return jsonb_build_object(
      'ok', false,
      'error', 'Acción inválida'
    );
  end if;

  if p_action = 'approve' then
    v_status := 'approved';

    update public.driver_profiles
    set
      review_status = v_status,
      is_blocked = false,
      blocked_reason = null,
      blocked_at = null,
      review_notes = p_review_notes,
      reviewed_by = p_reviewed_by,
      reviewed_at = now()
    where user_id = p_driver_user_id;

  elsif p_action = 'reject' then
    v_status := 'rejected';

    update public.driver_profiles
    set
      review_status = v_status,
      review_notes = p_review_notes,
      reviewed_by = p_reviewed_by,
      reviewed_at = now()
    where user_id = p_driver_user_id;

  elsif p_action = 'block' then
    v_status := 'blocked';

    update public.driver_profiles
    set
      review_status = v_status,
      is_blocked = true,
      blocked_reason = p_review_notes,
      blocked_at = now(),
      review_notes = p_review_notes,
      reviewed_by = p_reviewed_by,
      reviewed_at = now()
    where user_id = p_driver_user_id;

  elsif p_action = 'unblock' then
    update public.driver_profiles
    set
      review_status = 'pending',
      is_blocked = false,
      blocked_reason = null,
      blocked_at = null,
      review_notes = p_review_notes,
      reviewed_by = p_reviewed_by,
      reviewed_at = now()
    where user_id = p_driver_user_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'driver_user_id', p_driver_user_id,
    'action', p_action
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_dispatch_viaje()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Si el cliente no manda estado, lo forzamos
  IF NEW.estado IS NULL OR trim(NEW.estado) = '' THEN
    NEW.estado := 'DISPONIBLE';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_dispatch_viaje_post_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.estado = 'DISPONIBLE' THEN
    PERFORM public.dispatch_viaje_pro(NEW.id);
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.buscar_choferes_cercanos(p_lat numeric, p_lng numeric, p_radio_metros integer DEFAULT 5000, p_limite integer DEFAULT 10)
 RETURNS TABLE(chofer_id uuid, distancia_metros numeric, tiempo_llegada_seg integer, score numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        c.id_uuid as chofer_id,
        ST_Distance(
            ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
            ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography
        ) as distancia_metros,
        -- Estimado: velocidad promedio 30km/h = 8.33m/s
        (ST_Distance(
            ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
            ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography
        ) / 8.33)::integer as tiempo_llegada_seg,
        -- Score: rating * 0.4 + aceptacion_rate * 0.3 + (1/distancia) * 0.3
        (c.rating_promedio * 0.4 + 
         (c.aceptacion_rate / 100) * 0.3 + 
         (1000 / NULLIF(ST_Distance(
            ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
            ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography
        ), 0)) * 0.3) as score
    FROM choferes c
    WHERE c.online = true 
      AND c.disponible = true 
      AND c.bloqueado = false
      AND c.en_viaje = false
      AND c.last_location_at > now() - interval '2 minutes'
      AND ST_DWithin(
          ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography,
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
          p_radio_metros
      )
    ORDER BY score DESC
    LIMIT p_limite;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.calcular_distancia_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
 RETURNS double precision
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
BEGIN
  RETURN 6371 * acos(
    cos(radians(lat1)) *
    cos(radians(lat2)) *
    cos(radians(lng2) - radians(lng1)) +
    sin(radians(lat1)) *
    sin(radians(lat2))
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.calcular_precio_viaje(p_distancia_km numeric, p_tiempo_min integer, p_tipo_vehiculo text DEFAULT 'standard'::text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_config tarifas_config%ROWTYPE;
    v_base numeric;
    v_surge numeric DEFAULT 1.0;
    v_total numeric;
BEGIN
    SELECT * INTO v_config 
    FROM tarifas_config 
    WHERE vehiculo_tipo = p_tipo_vehiculo AND activo = true 
    LIMIT 1;
    
    IF NOT FOUND THEN
        v_config.base_fare := 150;
        v_config.km_rate := 80;
        v_config.minute_rate := 15;
        v_config.minimum_fare := 300;
    END IF;
    
    -- Calcular surge (si hay mucha demanda)
    SELECT COALESCE(MAX(surge_multiplier), 1.0) INTO v_surge
    FROM (
        SELECT CASE 
            WHEN COUNT(*) > 5 THEN LEAST(1 + (COUNT(*) * 0.1), 2.5)
            ELSE 1.0
        END as surge_multiplier
        FROM viajes
        WHERE estado = 'BUSCANDO'
    ) surge;
    
    v_total := (v_config.base_fare + 
                (p_distancia_km * v_config.km_rate) + 
                (p_tiempo_min * v_config.minute_rate)) * v_surge;
                
    RETURN GREATEST(v_total, v_config.minimum_fare);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.calcular_score_chofer(distancia double precision, rating numeric, viajes integer, rechazos integer)
 RETURNS double precision
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
BEGIN
  RETURN
    (100 - distancia * 10) +
    (rating * 20) +
    (viajes * 0.5) -
    (rechazos * 5);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.chofer_mas_cercano(p_lat numeric, p_lng numeric)
 RETURNS TABLE(id uuid, nombre text, telefono text, base_lat numeric, base_lng numeric, distancia_km numeric, last_location_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    c.id_uuid as id,
    c.nombre,
    c.telefono,
    c.lat::NUMERIC as base_lat,
    c.lng::NUMERIC as base_lng,
    (6371 * acos(
      LEAST(1, GREATEST(-1,
        cos(radians(p_lat)) * cos(radians(c.lat)) * 
        cos(radians(c.lng) - radians(p_lng)) + 
        sin(radians(p_lat)) * sin(radians(c.lat))
      ))
    ))::NUMERIC(10,3) as distancia_km,
    c.last_location_at
  FROM choferes c
  WHERE c.disponible = true 
    AND c.online = true
    AND c.last_location_at > NOW() - INTERVAL '30 minutes'
  ORDER BY distancia_km
  LIMIT 1;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.choferes_candidatos_cotizacion(p_origen_lat double precision, p_origen_lng double precision, p_destino_lat double precision, p_destino_lng double precision, p_radio_origen_km double precision, p_radio_destino_km double precision, p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, nombre text, telefono text, lat double precision, lng double precision, dist_origen_km double precision, dist_destino_km double precision)
 LANGUAGE sql
AS $function$
  select
    c.id_uuid as id,
    c.nombre,
    c.telefono,
    c.lat,
    c.lng,

    (
      6371 * acos(
        cos(radians(p_origen_lat)) *
        cos(radians(c.lat)) *
        cos(radians(c.lng) - radians(p_origen_lng)) +
        sin(radians(p_origen_lat)) *
        sin(radians(c.lat))
      )
    ) as dist_origen_km,

    (
      6371 * acos(
        cos(radians(p_destino_lat)) *
        cos(radians(c.lat)) *
        cos(radians(c.lng) - radians(p_destino_lng)) +
        sin(radians(p_destino_lat)) *
        sin(radians(c.lat))
      )
    ) as dist_destino_km

  from choferes c
  where c.online = true
    and c.disponible = true
    and c.bloqueado = false
    and c.lat is not null
    and c.lng is not null
    and c.last_location_at is not null
    and c.last_location_at > now() - interval '2 minutes'
    and (
      (
        6371 * acos(
          cos(radians(p_origen_lat)) *
          cos(radians(c.lat)) *
          cos(radians(c.lng) - radians(p_origen_lng)) +
          sin(radians(p_origen_lat)) *
          sin(radians(c.lat))
        )
      ) <= p_radio_origen_km
      or
      (
        6371 * acos(
          cos(radians(p_destino_lat)) *
          cos(radians(c.lat)) *
          cos(radians(c.lng) - radians(p_destino_lng)) +
          sin(radians(p_destino_lat)) *
          sin(radians(c.lat))
        )
      ) <= p_radio_destino_km
    )
  order by dist_origen_km asc
  limit p_limit;
$function$
;

CREATE OR REPLACE FUNCTION public.choferes_candidatos_score(p_origen_lat double precision, p_origen_lng double precision, p_destino_lat double precision, p_destino_lng double precision, p_radio_origen_km double precision DEFAULT 4, p_radio_destino_km double precision DEFAULT 4, p_limit integer DEFAULT 30)
 RETURNS TABLE(id uuid, nombre text, telefono text, lat double precision, lng double precision, dist_origen_km double precision, dist_destino_km double precision, score double precision)
 LANGUAGE sql
 STABLE
AS $function$
  with candidatos as (
    select
      c.id_uuid as id,
      c.nombre,
      c.telefono,
      c.lat,
      c.lng,

      (
        6371 * acos(
          least(1.0, greatest(-1.0,
            cos(radians(p_origen_lat)) *
            cos(radians(c.lat)) *
            cos(radians(c.lng) - radians(p_origen_lng)) +
            sin(radians(p_origen_lat)) *
            sin(radians(c.lat))
          ))
        )
      ) as dist_origen_km,

      (
        6371 * acos(
          least(1.0, greatest(-1.0,
            cos(radians(p_destino_lat)) *
            cos(radians(c.lat)) *
            cos(radians(c.lng) - radians(p_destino_lng)) +
            sin(radians(p_destino_lat)) *
            sin(radians(c.lat))
          ))
        )
      ) as dist_destino_km

    from choferes c
    where c.online = true
      and c.disponible = true
      and c.bloqueado = false
      and c.lat is not null
      and c.lng is not null
      and c.last_location_at is not null
      and c.last_location_at > now() - interval '5 minutes'
  )

  select
    id,
    nombre,
    telefono,
    lat,
    lng,
    dist_origen_km,
    dist_destino_km,

    (
      (dist_origen_km * 1.0) +
      (dist_destino_km * 0.55) +
      case when dist_origen_km > 5 then 3 else 0 end -
      case when dist_destino_km < 2 then 1.2 else 0 end
    ) as score

  from candidatos
  where dist_origen_km <= p_radio_origen_km
     or dist_destino_km <= p_radio_destino_km

  order by score asc
  limit p_limit;
$function$
;

CREATE OR REPLACE FUNCTION public.choferes_cercanos(p_lat double precision, p_lng double precision, p_radio_km double precision DEFAULT 5)
 RETURNS TABLE(chofer_id uuid, lat numeric, lng numeric, distancia_km numeric)
 LANGUAGE sql
AS $function$
with ultimas_posiciones as (
  select distinct on (vt.chofer_id_uuid)
    vt.chofer_id_uuid,
    vt.lat,
    vt.lng,
    vt.timestamp
  from public.viaje_tracking vt
  where vt.timestamp > now() - interval '5 minutes'
  order by vt.chofer_id_uuid, vt.timestamp desc
),
distancias as (
  select
    up.chofer_id_uuid as chofer_id,
    up.lat,
    up.lng,
    (
      6371 * acos(
        cos(radians(p_lat)) *
        cos(radians(up.lat)) *
        cos(radians(up.lng) - radians(p_lng)) +
        sin(radians(p_lat)) *
        sin(radians(up.lat))
      )
    ) as distancia_km
  from ultimas_posiciones up
)
select *
from distancias
where distancia_km < p_radio_km
order by distancia_km
limit 20;
$function$
;

CREATE OR REPLACE FUNCTION public.choferes_en_radio(p_lat numeric, p_lng numeric, p_radio_km numeric)
 RETURNS TABLE(id uuid, nombre text, telefono text, lat numeric, lng numeric, distancia_km numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    c.id_uuid as id,
    c.nombre,
    c.telefono,
    c.lat::NUMERIC,
    c.lng::NUMERIC,
    (6371 * acos(
      LEAST(1, GREATEST(-1,
        cos(radians(p_lat)) * cos(radians(c.lat)) * 
        cos(radians(c.lng) - radians(p_lng)) + 
        sin(radians(p_lat)) * sin(radians(c.lat))
      ))
    ))::NUMERIC(10,3) as distancia_km
  FROM choferes c
  WHERE c.disponible = true 
    AND c.online = true
    AND c.last_location_at > NOW() - INTERVAL '30 minutes'
    AND (6371 * acos(
      LEAST(1, GREATEST(-1,
        cos(radians(p_lat)) * cos(radians(c.lat)) * 
        cos(radians(c.lng) - radians(p_lng)) + 
        sin(radians(p_lat)) * sin(radians(c.lat))
      ))
    )) <= p_radio_km
  ORDER BY distancia_km;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cliente_puede_ver_chofer(_chofer_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.viajes v
    where v.cliente_auth_id = auth.uid()
      and (
        v.chofer_id_uuid = _chofer_id
        or v.assigned_driver_id = _chofer_id
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.completar_viaje(p_viaje_id uuid, p_chofer_id text)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE viajes
  SET
    estado = 'COMPLETADO',
    completado_at = NOW(),
    updated_at = NOW()
  WHERE id = p_viaje_id
    AND chofer_id_uuid = p_chofer_id::uuid
    AND estado = 'EN_CURSO';

  -- Corregido: usar id_uuid en lugar de id
  UPDATE choferes
  SET disponible = true
  WHERE id_uuid = p_chofer_id::uuid;

  INSERT INTO viaje_eventos (viaje_id, chofer_id_uuid, tipo, payload)
  VALUES (p_viaje_id, p_chofer_id::uuid, 'VIAJE_COMPLETADO', '{}'::jsonb);

  RETURN json_build_object('ok', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.crear_oferta_viaje(p_viaje_id uuid, p_chofer_id uuid, p_segundos integer, p_prioridad integer)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_now timestamptz := NOW();
  v_expires timestamptz := NOW() + make_interval(secs => p_segundos);
BEGIN

  INSERT INTO viaje_ofertas (
    viaje_id,
    chofer_id,
    estado,
    enviada_en,
    expires_at
  )
  VALUES (
    p_viaje_id,
    p_chofer_id,
    'pendiente',
    v_now,
    v_expires
  )
  ON CONFLICT (id) DO NOTHING;

END;
$function$
;

CREATE OR REPLACE FUNCTION public.crear_ticket_soporte(p_rol_origen text, p_categoria text, p_asunto text, p_mensaje text, p_prioridad text DEFAULT 'normal'::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ticket_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  insert into public.soporte_tickets (
    created_by,
    rol_origen,
    user_id,
    categoria,
    prioridad,
    asunto,
    ultimo_mensaje,
    last_message_at,
    metadata
  )
  values (
    auth.uid(),
    p_rol_origen,
    auth.uid(),
    p_categoria,
    coalesce(p_prioridad, 'normal'),
    p_asunto,
    p_mensaje,
    now(),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_ticket_id;

  insert into public.soporte_mensajes (
    ticket_id,
    sender_user_id,
    sender_role,
    mensaje
  )
  values (
    v_ticket_id,
    auth.uid(),
    p_rol_origen,
    p_mensaje
  );

  return jsonb_build_object(
    'ok', true,
    'ticket_id', v_ticket_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.dispatch_aceptar_oferta_legacy(p_viaje_id uuid, p_chofer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  update public.viaje_ofertas
  set
    estado = 'aceptada',
    respondida_en = now()
  where viaje_id = p_viaje_id
    and chofer_id = p_chofer_id
    and estado = 'enviada';

  update public.viajes
  set
    estado = 'asignado',
    chofer_id_uuid = p_chofer_id,
    assigned_driver_id = p_chofer_id,
    asignado_at = now(),
    aceptado_at = now(),
    no_driver_found = false,
    dispatch_locked = false,
    updated_at = now()
  where id = p_viaje_id;

  update public.viaje_ofertas
  set
    estado = 'cancelada',
    respondida_en = now()
  where viaje_id = p_viaje_id
    and chofer_id <> p_chofer_id
    and estado = 'enviada';

  insert into public.viaje_eventos (
    id, viaje_id, chofer_id_uuid, tipo, payload, created_at
  )
  values (
    gen_random_uuid(),
    p_viaje_id,
    p_chofer_id,
    'oferta_aceptada',
    jsonb_build_object('chofer_id', p_chofer_id),
    now()
  );

  return jsonb_build_object(
    'exito', true,
    'viaje_id', p_viaje_id,
    'chofer_id', p_chofer_id,
    'estado', 'asignado'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.dispatch_aceptar_oferta_pro(p_oferta_id uuid, p_chofer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_oferta record;
  v_viaje record;
begin
  select
    vo.id,
    vo.viaje_id,
    vo.chofer_id,
    vo.estado,
    vo.expires_at,
    vo.respondida_en
  into v_oferta
  from public.viaje_ofertas vo
  where vo.id = p_oferta_id
  limit 1;

  if not found then
    return jsonb_build_object(
      'exito', false,
      'motivo', 'oferta_no_encontrada'
    );
  end if;

  if v_oferta.chofer_id <> p_chofer_id then
    return jsonb_build_object(
      'exito', false,
      'motivo', 'oferta_no_pertenece_chofer'
    );
  end if;

  if upper(coalesce(v_oferta.estado, '')) <> 'PENDIENTE' then
    return jsonb_build_object(
      'exito', false,
      'motivo', 'oferta_no_pendiente',
      'estado_actual', v_oferta.estado
    );
  end if;

  if v_oferta.expires_at is null or v_oferta.expires_at <= now() then
    update public.viaje_ofertas
    set
      estado = 'EXPIRADA',
      respondida_en = now()
    where id = v_oferta.id
      and estado = 'PENDIENTE';

    return jsonb_build_object(
      'exito', false,
      'motivo', 'oferta_expirada'
    );
  end if;

  select
    v.id,
    v.estado,
    v.assigned_driver_id
  into v_viaje
  from public.viajes v
  where v.id = v_oferta.viaje_id
  limit 1
  for update;

  if not found then
    return jsonb_build_object(
      'exito', false,
      'motivo', 'viaje_no_encontrado'
    );
  end if;

  if v_viaje.assigned_driver_id is not null then
    return jsonb_build_object(
      'exito', false,
      'motivo', 'viaje_ya_asignado',
      'assigned_driver_id', v_viaje.assigned_driver_id
    );
  end if;

  if upper(coalesce(v_viaje.estado, '')) in ('CANCELADO', 'COMPLETADO', 'EN_CURSO') then
    return jsonb_build_object(
      'exito', false,
      'motivo', 'viaje_no_aceptable',
      'estado_viaje', v_viaje.estado
    );
  end if;

  update public.viaje_ofertas
  set
    estado = 'ACEPTADA',
    respondida_en = now()
  where id = v_oferta.id
    and estado = 'PENDIENTE';

  update public.viaje_ofertas
  set
    estado = 'CANCELADA',
    respondida_en = now()
  where viaje_id = v_oferta.viaje_id
    and id <> v_oferta.id
    and estado = 'PENDIENTE';

  update public.viajes
  set
    estado = 'ASIGNADO',
    assigned_driver_id = p_chofer_id,
    chofer_id_uuid = p_chofer_id,
    dispatch_locked = false,
    dispatch_lock_expires_at = null,
    current_offer_expires_at = null,
    no_driver_found = false,
    updated_at = now()
  where id = v_oferta.viaje_id
    and assigned_driver_id is null;

  insert into public.viaje_eventos (
    id,
    viaje_id,
    chofer_id_uuid,
    tipo,
    payload,
    created_at
  )
  values (
    gen_random_uuid(),
    v_oferta.viaje_id,
    p_chofer_id,
    'oferta_aceptada_y_viaje_asignado',
    jsonb_build_object(
      'oferta_id', v_oferta.id,
      'chofer_id', p_chofer_id
    ),
    now()
  );

  update public.choferes
  set
    rechazos_recientes = greatest(coalesce(rechazos_recientes, 0) - 1, 0),
    ultimo_offer_at = now(),
    updated_at = now()
  where id_uuid = p_chofer_id;

  return jsonb_build_object(
    'exito', true,
    'motivo', 'viaje_asignado',
    'viaje_id', v_oferta.viaje_id,
    'oferta_id', v_oferta.id,
    'chofer_id', p_chofer_id,
    'estado', 'ASIGNADO'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.dispatch_candidatos(p_viaje_id uuid, p_radio_km double precision DEFAULT 8, p_limit integer DEFAULT 20)
 RETURNS TABLE(chofer_id uuid, lat numeric, lng numeric, dist_origen_km numeric, dist_destino_km numeric, score numeric)
 LANGUAGE sql
AS $function$
with viaje_actual as (
  select
    v.id,
    v.origen_lat,
    v.origen_lng,
    v.destino_lat,
    v.destino_lng
  from public.viajes v
  where v.id = p_viaje_id
),
ultimas_posiciones_tracking as (
  select distinct on (vt.chofer_id_uuid)
    vt.chofer_id_uuid,
    vt.lat,
    vt.lng,
    vt.timestamp
  from public.viaje_tracking vt
  where vt.timestamp > now() - interval '15 minutes'
    and vt.chofer_id_uuid is not null
  order by vt.chofer_id_uuid, vt.timestamp desc
),
choferes_base as (
  select
    c.id_uuid as chofer_id,
    coalesce(ut.lat, c.lat) as lat,
    coalesce(ut.lng, c.lng) as lng
  from public.choferes c
  left join ultimas_posiciones_tracking ut
    on ut.chofer_id_uuid = c.id_uuid
  where c.online = true
    and c.disponible = true
    and c.bloqueado = false
    and coalesce(ut.lat, c.lat) is not null
    and coalesce(ut.lng, c.lng) is not null
),
ya_ofertados as (
  select vo.chofer_id
  from public.viaje_ofertas vo
  where vo.viaje_id = p_viaje_id
    and vo.estado in ('pendiente', 'aceptada')
),
distancias as (
  select
    cb.chofer_id,
    cb.lat,
    cb.lng,
    (
      6371 * acos(
        least(
          1,
          greatest(
            -1,
            cos(radians(va.origen_lat)) *
            cos(radians(cb.lat::double precision)) *
            cos(radians(cb.lng::double precision) - radians(va.origen_lng)) +
            sin(radians(va.origen_lat)) *
            sin(radians(cb.lat::double precision))
          )
        )
      )
    ) as dist_origen_km,
    (
      6371 * acos(
        least(
          1,
          greatest(
            -1,
            cos(radians(va.destino_lat)) *
            cos(radians(cb.lat::double precision)) *
            cos(radians(cb.lng::double precision) - radians(va.destino_lng)) +
            sin(radians(va.destino_lat)) *
            sin(radians(cb.lat::double precision))
          )
        )
      )
    ) as dist_destino_km
  from choferes_base cb
  cross join viaje_actual va
  where not exists (
    select 1
    from ya_ofertados yo
    where yo.chofer_id = cb.chofer_id
  )
)
select
  d.chofer_id,
  d.lat,
  d.lng,
  round(d.dist_origen_km::numeric, 2) as dist_origen_km,
  round(d.dist_destino_km::numeric, 2) as dist_destino_km,
  round((1000 - d.dist_origen_km * 100 - d.dist_destino_km * 20)::numeric, 2) as score
from distancias d
where d.dist_origen_km <= p_radio_km
order by score desc, dist_origen_km asc
limit p_limit;
$function$
;

CREATE OR REPLACE FUNCTION public.dispatch_crear_mejor_oferta_legacy(p_viaje_id uuid, p_radio_km double precision DEFAULT 8, p_timeout_seconds integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_viaje record;
  v_candidato record;
  v_attempt integer;
  v_expires_at timestamptz;
begin
  select *
  into v_viaje
  from public.viajes
  where id = p_viaje_id
  for update;

  if not found then
    return jsonb_build_object(
      'exito', false,
      'motivo', 'VIAJE_NO_EXISTE'
    );
  end if;

  if v_viaje.estado in ('CANCELADO', 'COMPLETADO', 'ASIGNADO', 'EN_CURSO') then
    return jsonb_build_object(
      'exito', false,
      'motivo', 'VIAJE_NO_DESPACHABLE',
      'estado', v_viaje.estado
    );
  end if;

  if v_viaje.estado = 'OFERTADO'
     and v_viaje.current_offer_expires_at is not null
     and v_viaje.current_offer_expires_at > now() then
    return jsonb_build_object(
      'exito', false,
      'motivo', 'OFERTA_VIGENTE',
      'estado', v_viaje.estado,
      'chofer_id', v_viaje.chofer_id_uuid,
      'expires_at', v_viaje.current_offer_expires_at,
      'current_offer_expires_at', v_viaje.current_offer_expires_at
    );
  end if;

  if v_viaje.estado = 'OFERTADO'
     and (
       v_viaje.current_offer_expires_at is null
       or v_viaje.current_offer_expires_at <= now()
     ) then

    update public.viajes
    set
      estado = 'DISPONIBLE',
      chofer_id_uuid = null,
      assigned_driver_id = null,
      current_offer_expires_at = null,
      dispatch_locked = false,
      updated_at = now()
    where id = p_viaje_id;

    update public.viaje_ofertas
    set
      estado = 'expirada',
      respondida_en = coalesce(respondida_en, now())
    where viaje_id = p_viaje_id
      and estado = 'pendiente'
      and expires_at <= now();

    select *
    into v_viaje
    from public.viajes
    where id = p_viaje_id
    for update;
  end if;

  if v_viaje.chofer_id_uuid is not null
     and v_viaje.estado in ('ASIGNADO', 'EN_CURSO', 'COMPLETADO') then
    return jsonb_build_object(
      'exito', false,
      'motivo', 'VIAJE_YA_TOMADO',
      'chofer_id', v_viaje.chofer_id_uuid
    );
  end if;

  v_attempt := coalesce(v_viaje.dispatch_attempts, 0) + 1;
  v_expires_at := now() + make_interval(secs => greatest(coalesce(p_timeout_seconds, 20), 5));

  select *
  into v_candidato
  from public.dispatch_candidatos(p_viaje_id, p_radio_km, 1)
  limit 1;

  if not found then
    update public.viajes
    set
      estado = 'SIN_CHOFER',
      no_driver_found = true,
      dispatch_locked = false,
      dispatch_attempts = v_attempt,
      dispatch_attempt_count = v_attempt,
      current_offer_expires_at = null,
      chofer_id_uuid = null,
      assigned_driver_id = null,
      updated_at = now()
    where id = p_viaje_id;

    insert into public.viaje_eventos (
      id,
      viaje_id,
      chofer_id_uuid,
      tipo,
      payload,
      created_at
    )
    values (
      gen_random_uuid(),
      p_viaje_id,
      null,
      'sin_chofer',
      jsonb_build_object(
        'attempt', v_attempt,
        'radio_km', p_radio_km
      ),
      now()
    );

    return jsonb_build_object(
      'exito', false,
      'motivo', 'SIN_CANDIDATOS',
      'attempt', v_attempt
    );
  end if;

  insert into public.viaje_ofertas (
    id,
    cotizacion_id,
    chofer_id,
    estado,
    score,
    dist_origen_km,
    dist_destino_km,
    enviada_en,
    respondida_en,
    viaje_id,
    expires_at
  )
  values (
    gen_random_uuid(),
    v_viaje.cotizacion_id,
    v_candidato.chofer_id,
    'pendiente',
    v_candidato.score,
    v_candidato.dist_origen_km,
    v_candidato.dist_destino_km,
    now(),
    null,
    p_viaje_id,
    v_expires_at
  );

  update public.viajes
  set
    estado = 'OFERTADO',
    chofer_id_uuid = v_candidato.chofer_id,
    assigned_driver_id = null,
    dispatch_attempts = v_attempt,
    dispatch_attempt_count = v_attempt,
    current_offer_expires_at = v_expires_at,
    no_driver_found = false,
    updated_at = now()
  where id = p_viaje_id;

  insert into public.viaje_eventos (
    id,
    viaje_id,
    chofer_id_uuid,
    tipo,
    payload,
    created_at
  )
  values (
    gen_random_uuid(),
    p_viaje_id,
    v_candidato.chofer_id,
    'oferta_enviada',
    jsonb_build_object(
      'attempt', v_attempt,
      'score', v_candidato.score,
      'dist_origen_km', v_candidato.dist_origen_km,
      'dist_destino_km', v_candidato.dist_destino_km,
      'expires_at', v_expires_at,
      'current_offer_expires_at', v_expires_at
    ),
    now()
  );

  return jsonb_build_object(
    'exito', true,
    'viaje_id', p_viaje_id,
    'chofer_id', v_candidato.chofer_id,
    'attempt', v_attempt,
    'expires_at', v_expires_at,
    'current_offer_expires_at', v_expires_at
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.dispatch_crear_mejores_ofertas(p_viaje_id uuid, p_radio_km numeric, p_timeout_seconds integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_expires_at timestamptz;
  v_ofertas jsonb := '[]'::jsonb;
  v_ofertas_count int := 0;
  v_chofer_ids uuid[] := '{}';
begin
  -- validar que el viaje exista y tenga coordenadas
  if not exists (
    select 1
    from viajes v
    where v.id = p_viaje_id
      and v.origen_lat is not null
      and v.origen_lng is not null
  ) then
    return json_build_object(
      'exito', false,
      'motivo', 'viaje_no_encontrado_o_sin_coordenadas'
    );
  end if;

  v_expires_at := now() + make_interval(secs => greatest(5, coalesce(p_timeout_seconds, 20)));

  with viaje_base as (
    select
      v.id,
      ST_SetSRID(ST_MakePoint(v.origen_lng, v.origen_lat), 4326)::geography as origen_geo
    from viajes v
    where v.id = p_viaje_id
      and v.origen_lat is not null
      and v.origen_lng is not null
  ),
  candidatos as (
    select
      c.id_uuid as chofer_id,

      ST_Distance(
        vb.origen_geo,
        ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography
      ) / 1000.0 as distancia_km,

      (
        ST_Distance(
          vb.origen_geo,
          ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography
        ) / 1000.0
      ) / 28.0 * 60.0 as eta_min,

      (
        (1 / greatest(
          1,
          ST_Distance(
            vb.origen_geo,
            ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography
          ) / 1000.0
        )) * 45
        + 40
        + case
            when c.last_seen_at > now() - interval '2 minutes' then 20
            when c.last_seen_at > now() - interval '5 minutes' then 10
            else 0
          end
      ) as score
    from viaje_base vb
    join choferes c on true
    where c.online = true
      and c.disponible = true
      and c.bloqueado = false
      and c.lat is not null
      and c.lng is not null
      and ST_DWithin(
        vb.origen_geo,
        ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography,
        greatest(0.1, coalesce(p_radio_km, 0)) * 1000
      )
      and not exists (
        select 1
        from viaje_ofertas vo
        where vo.viaje_id = p_viaje_id
          and vo.chofer_id = c.id_uuid
          and vo.estado = 'PENDIENTE'
          and vo.expires_at > now()
      )
  ),
  inserted as (
    insert into viaje_ofertas (
      id,
      viaje_id,
      chofer_id,
      estado,
      score,
      dist_origen_km,
      enviada_en,
      expires_at
    )
    select
      gen_random_uuid(),
      p_viaje_id,
      c.chofer_id,
      'PENDIENTE',
      c.score,
      c.distancia_km,
      now(),
      v_expires_at
    from candidatos c
    returning
      id,
      viaje_id,
      chofer_id,
      estado,
      score,
      dist_origen_km,
      enviada_en,
      expires_at
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'chofer_id', i.chofer_id,
          'distancia_km', round(i.dist_origen_km::numeric, 2),
          'score', round(i.score::numeric, 2),
          'expires_at', i.expires_at
        )
        order by i.score desc nulls last, i.dist_origen_km asc nulls last
      ),
      '[]'::jsonb
    ),
    count(*),
    coalesce(array_agg(i.chofer_id), '{}'::uuid[])
  into
    v_ofertas,
    v_ofertas_count,
    v_chofer_ids
  from inserted i;

  if v_ofertas_count = 0 then
    return json_build_object(
      'exito', false,
      'motivo', 'sin_candidatos',
      'radio_km', p_radio_km,
      'ofertas_count', 0,
      'ofertas', '[]'::jsonb
    );
  end if;

  insert into viaje_eventos (
    id,
    viaje_id,
    chofer_id_uuid,
    tipo,
    payload,
    created_at
  )
  values (
    gen_random_uuid(),
    p_viaje_id,
    null,
    'dispatch_multi_oferta',
    jsonb_build_object(
      'radio_km', p_radio_km,
      'timeout_seconds', p_timeout_seconds,
      'ofertas_count', v_ofertas_count,
      'chofer_ids', v_chofer_ids,
      'expires_at', v_expires_at
    ),
    now()
  );

  return json_build_object(
    'exito', true,
    'viaje_id', p_viaje_id,
    'ofertas_count', v_ofertas_count,
    'chofer_ids', v_chofer_ids,
    'current_offer_expires_at', v_expires_at,
    'ofertas', v_ofertas
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.dispatch_crear_ofertas_legacy(p_viaje_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_origen_lat double precision;
  v_origen_lng double precision;
BEGIN

  SELECT origen_lat, origen_lng
  INTO v_origen_lat, v_origen_lng
  FROM viajes
  WHERE id = p_viaje_id;

  INSERT INTO viaje_ofertas (viaje_id, chofer_id_uuid, expires_at, prioridad)
  SELECT 
    p_viaje_id,
    c.id_uuid,
    now() + interval '30 seconds',
    ROW_NUMBER() OVER ()
  FROM choferes c
  WHERE c.disponible = true
    AND c.bloqueado = false
    AND c.lat IS NOT NULL
    AND c.lng IS NOT NULL
  ORDER BY
    (ABS(c.lat - v_origen_lat) + ABS(c.lng - v_origen_lng))
  LIMIT 5;

  UPDATE viajes
  SET estado = 'OFERTADO',
      dispatch_attempts = dispatch_attempts + 1
  WHERE id = p_viaje_id;

END;
$function$
;

CREATE OR REPLACE FUNCTION public.dispatch_crear_siguiente_oferta_secuencial(p_viaje_id uuid, p_radio_km numeric, p_timeout_seconds integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_viaje record;
  v_chofer record;
  v_oferta_id uuid;
  v_now timestamptz := now();
  v_expires_at timestamptz := now() + make_interval(secs => greatest(1, p_timeout_seconds));
begin
  select
    v.id,
    v.estado,
    v.origen_lat,
    v.origen_lng
  into v_viaje
  from viajes v
  where v.id = p_viaje_id
  for update;

  if not found then
    return jsonb_build_object(
      'exito', false,
      'motivo', 'viaje_no_encontrado'
    );
  end if;

  if v_viaje.origen_lat is null or v_viaje.origen_lng is null then
    return jsonb_build_object(
      'exito', false,
      'motivo', 'viaje_sin_origen'
    );
  end if;

  with choferes_ya_tocados as (
    select distinct vo.chofer_id
    from viaje_ofertas vo
    where vo.viaje_id = p_viaje_id
      and vo.chofer_id is not null
      and vo.estado in ('PENDIENTE', 'RECHAZADA', 'ACEPTADA', 'EXPIRADA')
  ),
  choferes_con_viaje_activo as (
    select distinct coalesce(v.assigned_driver_id, v.chofer_id_uuid) as chofer_id
    from viajes v
    where v.estado in ('ASIGNADO', 'ACEPTADO', 'EN_CURSO')
      and coalesce(v.assigned_driver_id, v.chofer_id_uuid) is not null
  ),
  metricas_recientes as (
    select
      vo.chofer_id,
      count(*) filter (
        where vo.enviada_en >= now() - interval '10 minutes'
      ) as ofertas_ult_10m,
      count(*) filter (
        where vo.enviada_en >= now() - interval '30 minutes'
          and vo.estado = 'RECHAZADA'
      ) as rechazos_ult_30m
    from viaje_ofertas vo
    where vo.chofer_id is not null
    group by vo.chofer_id
  ),
  candidatos as (
    select
      c.id_uuid as chofer_id,

      round(
        (
          6371 * acos(
            least(
              1,
              greatest(
                -1,
                cos(radians(v_viaje.origen_lat)) *
                cos(radians(c.lat)) *
                cos(radians(c.lng) - radians(v_viaje.origen_lng)) +
                sin(radians(v_viaje.origen_lat)) *
                sin(radians(c.lat))
              )
            )
          )
        )::numeric,
        5
      ) as dist_origen_km,

      coalesce(m.ofertas_ult_10m, 0) as ofertas_ult_10m,
      coalesce(m.rechazos_ult_30m, 0) as rechazos_ult_30m,

      case
        when c.last_seen_at >= now() - interval '20 seconds' then 18
        when c.last_seen_at >= now() - interval '40 seconds' then 12
        when c.last_seen_at >= now() - interval '90 seconds' then 6
        when c.last_seen_at >= now() - interval '180 seconds' then 2
        else -12
      end as freshness_bonus,

      case
        when coalesce(m.ofertas_ult_10m, 0) = 0 then 10
        when coalesce(m.ofertas_ult_10m, 0) = 1 then 4
        when coalesce(m.ofertas_ult_10m, 0) = 2 then -4
        else -12
      end as load_penalty,

      case
        when coalesce(m.rechazos_ult_30m, 0) = 0 then 0
        when coalesce(m.rechazos_ult_30m, 0) = 1 then -6
        when coalesce(m.rechazos_ult_30m, 0) = 2 then -12
        else -20
      end as rejection_penalty

    from choferes c
    left join metricas_recientes m
      on m.chofer_id = c.id_uuid
    where c.online = true
      and c.disponible = true
      and coalesce(c.bloqueado, false) = false
      and c.lat is not null
      and c.lng is not null
      and not exists (
        select 1
        from choferes_ya_tocados t
        where t.chofer_id = c.id_uuid
      )
      and not exists (
        select 1
        from choferes_con_viaje_activo a
        where a.chofer_id = c.id_uuid
      )
  ),
  candidatos_scored as (
    select
      c.*,
      round(
        (
          140
          - (c.dist_origen_km * 18)
          + c.freshness_bonus
          + c.load_penalty
          + c.rejection_penalty
        )::numeric,
        2
      ) as score_final
    from candidatos c
    where c.dist_origen_km <= greatest(0.10, p_radio_km)
  )
  select *
  into v_chofer
  from candidatos_scored
  order by
    score_final desc,
    dist_origen_km asc,
    chofer_id asc
  limit 1;

  if not found then
    return jsonb_build_object(
      'exito', false,
      'motivo', 'sin_candidatos'
    );
  end if;

  insert into viaje_ofertas (
    id,
    viaje_id,
    cotizacion_id,
    chofer_id,
    estado,
    score,
    dist_origen_km,
    dist_destino_km,
    enviada_en,
    expires_at
  )
  values (
    gen_random_uuid(),
    p_viaje_id,
    null,
    v_chofer.chofer_id,
    'PENDIENTE',
    v_chofer.score_final,
    v_chofer.dist_origen_km,
    null,
    v_now,
    v_expires_at
  )
  returning id into v_oferta_id;

  return jsonb_build_object(
    'exito', true,
    'motivo', 'oferta_creada',
    'oferta_id', v_oferta_id,
    'chofer_id', v_chofer.chofer_id,
    'score', v_chofer.score_final,
    'dist_origen_km', v_chofer.dist_origen_km,
    'dist_destino_km', null,
    'ofertas_ult_10m', v_chofer.ofertas_ult_10m,
    'rechazos_ult_30m', v_chofer.rechazos_ult_30m,
    'freshness_bonus', v_chofer.freshness_bonus,
    'load_penalty', v_chofer.load_penalty,
    'rejection_penalty', v_chofer.rejection_penalty,
    'expires_at', v_expires_at
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.dispatch_crear_siguiente_oferta_secuencial_pro(p_viaje_id uuid, p_radio_km numeric, p_timeout_seconds integer, p_intento integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_viaje record;
  v_candidato record;
  v_oferta_id uuid;
  v_now timestamptz := now();
  v_expires_at timestamptz := now() + make_interval(secs => greatest(5, p_timeout_seconds));
  v_origen_lat numeric;
  v_origen_lng numeric;
begin
  select
    v.id,
    v.estado,
    v.cotizacion_id,
    v.origen_lat,
    v.origen_lng,
    v.created_at
  into v_viaje
  from public.viajes v
  where v.id = p_viaje_id
  limit 1;

  if not found then
    return jsonb_build_object(
      'exito', false,
      'motivo', 'viaje_no_encontrado'
    );
  end if;

  if upper(coalesce(v_viaje.estado, '')) in ('ASIGNADO', 'EN_CURSO', 'COMPLETADO', 'CANCELADO') then
    return jsonb_build_object(
      'exito', false,
      'motivo', 'viaje_no_despachable'
    );
  end if;

  if (v_origen_lat is null or v_origen_lng is null) and v_viaje.cotizacion_id is not null then
    select
      c.origen_lat,
      c.origen_lng
    into v_origen_lat, v_origen_lng
    from public.cotizaciones c
    where c.id = v_viaje.cotizacion_id
    limit 1;
  else
    v_origen_lat := v_viaje.origen_lat;
    v_origen_lng := v_viaje.origen_lng;
  end if;

  if v_origen_lat is null or v_origen_lng is null then
    return jsonb_build_object(
      'exito', false,
      'motivo', 'origen_invalido'
    );
  end if;

  with choferes_base as (
    select
      c.id_uuid as chofer_id,
      c.lat,
      c.lng,
      coalesce(c.rating, 5.0) as rating,
      coalesce(c.viajes_completados, 0) as viajes_completados,
      coalesce(c.rechazos_recientes, 0) as rechazos_recientes,
      coalesce(c.cancelaciones_recientes, 0) as cancelaciones_recientes,
      c.last_seen_at,
      c.ultimo_offer_at,
      c.online,
      c.disponible,
      c.bloqueado,
      c.pausado_hasta,
      (
        6371 * acos(
          least(1, greatest(-1,
            cos(radians(v_origen_lat)) *
            cos(radians(c.lat)) *
            cos(radians(c.lng) - radians(v_origen_lng)) +
            sin(radians(v_origen_lat)) *
            sin(radians(c.lat))
          ))
        )
      ) as dist_origen_km
    from public.choferes c
    where c.lat is not null
      and c.lng is not null
      and coalesce(c.online, false) = true
      and coalesce(c.disponible, false) = true
      and coalesce(c.bloqueado, false) = false
      and (c.pausado_hasta is null or c.pausado_hasta <= v_now)
      and c.last_seen_at >= (v_now - interval '90 seconds')
      and not exists (
        select 1
        from public.viaje_ofertas vo
        where vo.viaje_id = p_viaje_id
          and vo.chofer_id = c.id_uuid
          and vo.estado in ('PENDIENTE', 'ACEPTADA', 'RECHAZADA', 'EXPIRADA')
      )
  ),
  choferes_filtrados as (
    select *
    from choferes_base
    where dist_origen_km <= greatest(0.2, p_radio_km)
  ),
  choferes_scoring as (
    select
      cb.*,
      greatest(1, round((cb.dist_origen_km / 0.35)::numeric, 2)) as eta_min,
      (
        1000
        - (cb.dist_origen_km * 65)
        - (greatest(1, round((cb.dist_origen_km / 0.35)::numeric, 2)) * 40)
        + ((cb.rating - 4.5) * 140)
        + (least(cb.viajes_completados, 500) * 0.30)
        - (cb.rechazos_recientes * 60)
        - (cb.cancelaciones_recientes * 90)
        + case
            when cb.last_seen_at >= (v_now - interval '20 seconds') then 40
            when cb.last_seen_at >= (v_now - interval '45 seconds') then 15
            else -20
          end
        + case
            when cb.ultimo_offer_at >= (v_now - interval '20 seconds') then -40
            when cb.ultimo_offer_at >= (v_now - interval '40 seconds') then -20
            else 0
          end
        + (p_intento * 12)
      )::numeric(12,2) as score
    from choferes_filtrados cb
  )
  select *
  into v_candidato
  from choferes_scoring
  order by score desc, dist_origen_km asc, rating desc, last_seen_at desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'exito', false,
      'motivo', 'sin_candidatos'
    );
  end if;

  v_oferta_id := gen_random_uuid();

  insert into public.viaje_ofertas (
    id,
    viaje_id,
    chofer_id,
    estado,
    score,
    dist_origen_km,
    dist_destino_km,
    enviada_en,
    expires_at
  )
  values (
    v_oferta_id,
    p_viaje_id,
    v_candidato.chofer_id,
    'PENDIENTE',
    v_candidato.score,
    v_candidato.dist_origen_km,
    null,
    v_now,
    v_expires_at
  );

  update public.choferes
  set ultimo_offer_at = v_now
  where id_uuid = v_candidato.chofer_id;

  return jsonb_build_object(
    'exito', true,
    'motivo', 'ok',
    'oferta_id', v_oferta_id,
    'chofer_id', v_candidato.chofer_id,
    'score', v_candidato.score,
    'eta_min', v_candidato.eta_min,
    'dist_origen_km', round(coalesce(v_candidato.dist_origen_km, 0)::numeric, 2),
    'dist_destino_km', null
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.dispatch_expirar_ofertas_y_liberar_viajes()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count_ofertas integer := 0;
  v_count_viajes integer := 0;
begin
  update public.viaje_ofertas
  set
    estado = 'EXPIRADA',
    respondida_en = now()
  where estado = 'PENDIENTE'
    and expires_at < now();

  get diagnostics v_count_ofertas = row_count;

  update public.viajes v
  set
    estado = case
      when v.search_deadline_at is not null and v.search_deadline_at <= now()
        then 'SIN_CHOFER'
      else 'DISPONIBLE'
    end,
    dispatch_locked = false,
    dispatch_lock_expires_at = null,
    current_offer_expires_at = null,
    no_driver_found = case
      when v.search_deadline_at is not null and v.search_deadline_at <= now()
        then true
      else false
    end,
    updated_at = now()
  where v.estado = 'OFERTADO'
    and v.assigned_driver_id is null
    and not exists (
      select 1
      from public.viaje_ofertas vo
      where vo.viaje_id = v.id
        and vo.estado = 'PENDIENTE'
        and vo.expires_at > now()
    );

  get diagnostics v_count_viajes = row_count;

  return jsonb_build_object(
    'exito', true,
    'ofertas_expiradas', v_count_ofertas,
    'viajes_liberados', v_count_viajes
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.dispatch_loop()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_viaje RECORD;
BEGIN
  -- liberar viajes vencidos
  PERFORM expirar_ofertas_vencidas();

  FOR v_viaje IN
    SELECT id
    FROM viajes
    WHERE estado = 'DISPONIBLE'
  LOOP
    PERFORM dispatch_viaje_pro(v_viaje.id);
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.dispatch_procesar_timeouts()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_viaje uuid;
  BEGIN

    -- marcar TIMEOUT
      UPDATE viaje_ofertas
        SET estado = 'TIMEOUT'
          WHERE estado = 'PENDIENTE'
            AND expires_at < now();

              -- buscar viajes sin oferta activa
                FOR v_viaje IN
                    SELECT DISTINCT viaje_id
                        FROM viaje_ofertas
                            WHERE estado = 'TIMEOUT'
                              LOOP
                                  PERFORM dispatch_siguiente_oferta(v_viaje);
                                    END LOOP;

                                    END;
                                    $function$
;

CREATE OR REPLACE FUNCTION public.dispatch_queue_mark_done(p_job_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.dispatch_queue
  set
    estado = 'DONE',
    locked_at = null,
    locked_by = null,
    last_error = null,
    updated_at = now()
  where id = p_job_id;

  return jsonb_build_object(
    'exito', true,
    'job_id', p_job_id,
    'estado', 'DONE'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.dispatch_queue_mark_retry(p_job_id uuid, p_error text DEFAULT NULL::text, p_delay_seconds integer DEFAULT 5)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_job record;
  v_next_intentos integer;
begin
  select *
  into v_job
  from public.dispatch_queue
  where id = p_job_id
  limit 1;

  if not found then
    return jsonb_build_object(
      'exito', false,
      'motivo', 'job_no_encontrado'
    );
  end if;

  v_next_intentos := coalesce(v_job.intentos, 0) + 1;

  update public.dispatch_queue
  set
    estado = case
      when v_next_intentos >= coalesce(v_job.max_intentos, 20) then 'FAILED'
      else 'REINTENTAR'
    end,
    intentos = v_next_intentos,
    available_at = now() + make_interval(secs => greatest(1, p_delay_seconds)),
    locked_at = null,
    locked_by = null,
    last_error = p_error,
    updated_at = now()
  where id = p_job_id;

  return jsonb_build_object(
    'exito', true,
    'job_id', p_job_id,
    'estado', case
      when v_next_intentos >= coalesce(v_job.max_intentos, 20) then 'FAILED'
      else 'REINTENTAR'
    end,
    'intentos', v_next_intentos
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.dispatch_queue_release_stale_locks()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count integer := 0;
begin
  update public.dispatch_queue
  set
    estado = 'REINTENTAR',
    locked_at = null,
    locked_by = null,
    updated_at = now()
  where estado = 'TOMADO'
    and locked_at <= now() - interval '30 seconds';

  get diagnostics v_count = row_count;

  return jsonb_build_object(
    'exito', true,
    'locks_liberados', v_count
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.dispatch_rechazar_oferta_legacy(p_viaje_id uuid, p_chofer_id uuid, p_reason text DEFAULT 'rechazada'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_attempt integer;
begin
  update public.viaje_ofertas
  set
    estado = 'rechazada',
    respondida_en = now()
  where viaje_id = p_viaje_id
    and chofer_id = p_chofer_id
    and estado = 'enviada';

  select coalesce(dispatch_attempts, 0)
  into v_attempt
  from public.viajes
  where id = p_viaje_id;

  update public.viajes
  set
    estado = 'buscando_chofer',
    dispatch_locked = false,
    updated_at = now()
  where id = p_viaje_id;

  insert into public.viaje_eventos (
    id, viaje_id, chofer_id_uuid, tipo, payload, created_at
  )
  values (
    gen_random_uuid(),
    p_viaje_id,
    p_chofer_id,
    'oferta_rechazada',
    jsonb_build_object('reason', p_reason, 'attempt', v_attempt),
    now()
  );

  return jsonb_build_object(
    'exito', true,
    'viaje_id', p_viaje_id,
    'chofer_id', p_chofer_id,
    'estado', 'buscando_chofer'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.dispatch_rechazar_oferta_pro(p_oferta_id uuid, p_chofer_id uuid, p_redispatch boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_oferta record;
begin
  select
    vo.id,
    vo.viaje_id,
    vo.chofer_id,
    vo.estado,
    vo.expires_at
  into v_oferta
  from public.viaje_ofertas vo
  where vo.id = p_oferta_id
  limit 1;

  if not found then
    return jsonb_build_object(
      'exito', false,
      'motivo', 'oferta_no_encontrada'
    );
  end if;

  if v_oferta.chofer_id <> p_chofer_id then
    return jsonb_build_object(
      'exito', false,
      'motivo', 'oferta_no_pertenece_chofer'
    );
  end if;

  if upper(coalesce(v_oferta.estado, '')) <> 'PENDIENTE' then
    return jsonb_build_object(
      'exito', false,
      'motivo', 'oferta_no_pendiente',
      'estado_actual', v_oferta.estado
    );
  end if;

  update public.viaje_ofertas
  set
    estado = 'RECHAZADA',
    respondida_en = now()
  where id = v_oferta.id
    and estado = 'PENDIENTE';

  update public.choferes
  set
    rechazos_recientes = coalesce(rechazos_recientes, 0) + 1,
    pausado_hasta = now() + interval '20 seconds',
    updated_at = now()
  where id_uuid = p_chofer_id;

  update public.viajes
  set
    estado = 'DISPONIBLE',
    dispatch_locked = false,
    dispatch_lock_expires_at = null,
    current_offer_expires_at = null,
    updated_at = now()
  where id = v_oferta.viaje_id
    and assigned_driver_id is null;

  insert into public.viaje_eventos (
    id,
    viaje_id,
    chofer_id_uuid,
    tipo,
    payload,
    created_at
  )
  values (
    gen_random_uuid(),
    v_oferta.viaje_id,
    p_chofer_id,
    'oferta_rechazada',
    jsonb_build_object(
      'oferta_id', v_oferta.id,
      'chofer_id', p_chofer_id,
      'redispatch', p_redispatch
    ),
    now()
  );

  return jsonb_build_object(
    'exito', true,
    'motivo', 'oferta_rechazada',
    'viaje_id', v_oferta.viaje_id,
    'oferta_id', v_oferta.id,
    'redispatch_sugerido', p_redispatch
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.dispatch_siguiente_oferta(p_viaje_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_oferta RECORD;
  BEGIN

    SELECT *
      INTO v_oferta
        FROM viaje_ofertas
          WHERE viaje_id = p_viaje_id
              AND estado = 'PENDIENTE'
                ORDER BY prioridad ASC
                  LIMIT 1;

                    IF v_oferta IS NULL THEN
                        UPDATE viajes
                            SET estado = 'SIN_CHOFER'
                                WHERE id = p_viaje_id;
                                    RETURN;
                                      END IF;

                                        UPDATE viaje_ofertas
                                          SET push_sent = true,
                                                push_sent_at = now()
                                                  WHERE id = v_oferta.id;

                                                    -- IMPORTANTE: guardar expiración activa
                                                      UPDATE viajes
                                                        SET current_offer_expires_at = v_oferta.expires_at
                                                          WHERE id = p_viaje_id;

                                                          END;
                                                          $function$
;

CREATE OR REPLACE FUNCTION public.dispatch_viaje(p_viaje_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN dispatch_viaje_pro(p_viaje_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.dispatch_viaje_inteligente(p_viaje_id uuid)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_origen_lat DOUBLE PRECISION;
  v_origen_lng DOUBLE PRECISION;
  v_chofer RECORD;
  v_count INTEGER := 0;
BEGIN
  -- Obtener ubicación del viaje
  SELECT origen_lat, origen_lng
  INTO v_origen_lat, v_origen_lng
  FROM viajes
  WHERE id = p_viaje_id;

  -- CORREGIDO: Usar c.id_uuid en lugar de c.id
  FOR v_chofer IN
    SELECT
      c.id_uuid,  -- ✅ CORREGIDO
      calcular_distancia_km(
        v_origen_lat,
        v_origen_lng,
        c.lat,
        c.lng
      ) AS distancia
    FROM choferes c
    WHERE c.online = true
      AND c.disponible = true
      AND c.bloqueado = false  -- Agregado: no enviar a bloqueados
      AND c.lat IS NOT NULL
      AND c.lng IS NOT NULL
    ORDER BY distancia ASC
    LIMIT 5
  LOOP

    -- Crear oferta para cada chofer
    PERFORM crear_oferta_viaje(
      p_viaje_id,
      v_chofer.id_uuid::text,  -- ✅ CORREGIDO: convertir UUID a TEXT
      20, -- segundos
      v_count
    );

    v_count := v_count + 1;

  END LOOP;

  RETURN json_build_object(
    'ok', true,
    'ofertas_enviadas', v_count
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.dispatch_viaje_pro(p_viaje_id uuid)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
declare
  v_origen_lat double precision;
  v_origen_lng double precision;
  v_chofer record;
  v_count integer := 0;
  v_expira_seg integer := 60;
  v_primer_chofer uuid := null;
begin
  update public.viajes
  set dispatch_locked = true
  where id = p_viaje_id
    and dispatch_locked = false
    and estado = 'DISPONIBLE';

  if not found then
    return json_build_object(
      'ok', false,
      'reason', 'YA_EN_DISPATCH_O_NO_DISPONIBLE'
    );
  end if;

  perform 1
  from public.viajes
  where id = p_viaje_id
  for update;

  select origen_lat, origen_lng
  into v_origen_lat, v_origen_lng
  from public.viajes
  where id = p_viaje_id;

  for v_chofer in
    select
      c.id_uuid,
      case
        when v_origen_lat is not null
         and v_origen_lng is not null
         and c.lat is not null
         and c.lng is not null
        then public.calcular_distancia_km(v_origen_lat, v_origen_lng, c.lat, c.lng)
        else 999999
      end as distancia_km
    from public.choferes c
    where c.online = true
      and c.disponible = true
      and c.bloqueado = false
    order by distancia_km asc, c.updated_at desc
    limit 5
  loop
    perform public.crear_oferta_viaje(
      p_viaje_id,
      v_chofer.id_uuid,
      v_expira_seg,
      v_count
    );

    if v_count = 0 then
      v_primer_chofer := v_chofer.id_uuid;
    end if;

    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    update public.viajes
    set
      estado = 'SIN_CHOFER',
      dispatch_locked = false,
      current_offer_expires_at = null,
      chofer_id_uuid = null,
      assigned_driver_id = null
    where id = p_viaje_id;

    return json_build_object(
      'ok', false,
      'reason', 'SIN_CHOFERES_DISPONIBLES'
    );
  end if;

  update public.viajes
  set
    estado = 'OFERTADO',
    chofer_id_uuid = v_primer_chofer,
    assigned_driver_id = null,
    current_offer_expires_at = now() + make_interval(secs => v_expira_seg),
    dispatch_locked = false
  where id = p_viaje_id;

  return json_build_object(
    'ok', true,
    'ofertas_enviadas', v_count,
    'chofer_id', v_primer_chofer,
    'expira_en', v_expira_seg,
    'current_offer_expires_at', now() + make_interval(secs => v_expira_seg)
  );

exception
  when others then
    update public.viajes
    set dispatch_locked = false
    where id = p_viaje_id;

    return json_build_object(
      'ok', false,
      'reason', 'ERROR_DISPATCH',
      'detail', SQLERRM
    );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_driver_profile_exists(p_user_id uuid)
 RETURNS TABLE(id_uuid uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_email text;
  v_nombre text;
begin
  select
    au.email,
    coalesce(au.raw_user_meta_data ->> 'full_name', au.raw_user_meta_data ->> 'name', split_part(au.email, '@', 1))
  into v_email, v_nombre
  from auth.users au
  where au.id = p_user_id;

  insert into public.choferes (
    id_uuid,
    user_id,
    email,
    nombre,
    online,
    disponible,
    activo,
    rating,
    viajes_completados,
    cancelaciones,
    cancelaciones_recientes,
    created_at,
    updated_at
  )
  values (
    gen_random_uuid(),
    p_user_id,
    v_email,
    v_nombre,
    false,
    true,
    true,
    5,
    0,
    0,
    0,
    now(),
    now()
  )
  on conflict (user_id) do update
    set email = coalesce(excluded.email, choferes.email),
        nombre = coalesce(excluded.nombre, choferes.nombre),
        updated_at = now()
  returning choferes.id_uuid into v_id;

  return query select v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.expirar_ofertas_vencidas()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
BEGIN

  WITH expired AS (
    UPDATE viaje_ofertas
    SET
      estado = 'timeout',
      respondida_en = NOW()
    WHERE estado = 'pendiente'
      AND expires_at IS NOT NULL
      AND expires_at <= NOW()
    RETURNING viaje_id, chofer_id
  )
  INSERT INTO viaje_eventos (viaje_id, chofer_id_uuid, tipo, payload)
  SELECT
    viaje_id,
    chofer_id,
    'OFERTA_TIMEOUT',
    '{}'::jsonb
  FROM expired;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE viajes
  SET
    estado = 'DISPONIBLE',
    current_offer_expires_at = NULL
  WHERE estado = 'OFERTADO'
    AND current_offer_expires_at <= NOW()
    AND chofer_id_uuid IS NULL
    AND chofer_user_id IS NULL;

  RETURN json_build_object(
    'ok', true,
    'timeouts_actualizados', v_count
  );

END;
$function$
;

CREATE OR REPLACE FUNCTION public.expirar_ofertas_vencidas(p_viaje_id uuid)
 RETURNS json
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
with updated as (
  update public.viaje_ofertas
  set
    estado = 'EXPIRADA',
    respondida_en = coalesce(respondida_en, now())
  where viaje_id = p_viaje_id
    and estado = 'PENDIENTE'
    and expires_at is not null
    and expires_at <= now()
  returning id
)
select json_build_object(
  'exito', true,
  'expiradas', count(*)
)
from updated;
$function$
;

create type "public"."geometry_dump" as ("path" integer[], "geom" public.geometry);

CREATE OR REPLACE FUNCTION public.get_driver_onboarding_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_chofer record;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'authenticated', false,
      'has_profile', false,
      'onboarding_complete', false
    );
  end if;

  select *
  into v_chofer
  from public.choferes
  where user_id = v_user_id
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'authenticated', true,
      'has_profile', false,
      'onboarding_complete', false,
      'driver_id', null,
      'needs_onboarding', true
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'authenticated', true,
    'has_profile', true,
    'onboarding_complete', true,
    'needs_onboarding', false,
    'driver_id', v_chofer.id_uuid,
    'online', coalesce(v_chofer.online, false),
    'available', coalesce(v_chofer.disponible, true),
    'blocked', coalesce(v_chofer.bloqueado, false),
    'email', v_chofer.email,
    'name', v_chofer.nombre
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_driver_onboarding_status(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := coalesce(p_user_id, auth.uid());
  v_chofer record;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'authenticated', false,
      'has_profile', false,
      'onboarding_complete', false
    );
  end if;

  select *
  into v_chofer
  from public.choferes
  where user_id = v_user_id
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'authenticated', true,
      'has_profile', false,
      'onboarding_complete', false,
      'driver_id', null,
      'needs_onboarding', true
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'authenticated', true,
    'has_profile', true,
    'onboarding_complete', true,
    'needs_onboarding', false,
    'driver_id', v_chofer.id_uuid,
    'online', coalesce(v_chofer.online, false),
    'available', coalesce(v_chofer.disponible, true),
    'blocked', coalesce(v_chofer.bloqueado, false),
    'email', v_chofer.email,
    'name', v_chofer.nombre
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user_driver()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_provider_id uuid;
  v_full_name text;
begin
  v_full_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(new.email, '@', 1),
    new.email
  );

  -- Compatibilidad con el flujo viejo de transporte.
  -- Si choferes existe y coincide, intenta insertar sin romper el alta.
  begin
    insert into public.choferes (
      id_uuid,
      user_id,
      email,
      nombre,
      online,
      disponible,
      bloqueado,
      created_at,
      updated_at
    )
    values (
      new.id,
      new.id,
      new.email,
      v_full_name,
      false,
      true,
      false,
      now(),
      now()
    )
    on conflict (id_uuid) do nothing;
  exception
    when others then
      raise log 'handle_new_user_driver: no se pudo insertar en choferes para user %: %', new.id, sqlerrm;
  end;

  -- Alta real para MIMI Servicios
  insert into public.svc_providers (
    user_id,
    full_name,
    email,
    avatar_url,
    status,
    approved,
    blocked,
    created_at,
    updated_at
  )
  values (
    new.id,
    v_full_name,
    new.email,
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'),
    'OFFLINE',
    false,
    false,
    now(),
    now()
  )
  on conflict (user_id) do update
    set
      full_name = coalesce(excluded.full_name, public.svc_providers.full_name),
      email = coalesce(excluded.email, public.svc_providers.email),
      avatar_url = coalesce(excluded.avatar_url, public.svc_providers.avatar_url),
      updated_at = now()
  returning id into v_provider_id;

  if v_provider_id is null then
    select p.id
    into v_provider_id
    from public.svc_providers p
    where p.user_id = new.id
    limit 1;
  end if;

  insert into public.svc_provider_profiles (
    provider_id,
    bio,
    address_text,
    city,
    province,
    country_code,
    pricing_mode,
    accepts_immediate,
    accepts_scheduled,
    max_hours_per_service,
    onboarding_completed,
    created_at,
    updated_at
  )
  values (
    v_provider_id,
    null,
    null,
    null,
    null,
    'AR',
    'HOURLY',
    true,
    true,
    8,
    false,
    now(),
    now()
  )
  on conflict (provider_id) do update
    set updated_at = now();

  return new;

exception
  when others then
    raise log 'handle_new_user_driver falló para user %: %', new.id, sqlerrm;
    return new;
end;
$function$
;

create type "public"."http_header" as ("field" character varying, "value" character varying);

create type "public"."http_request" as ("method" public.http_method, "uri" character varying, "headers" public.http_header[], "content_type" character varying, "content" character varying);

create type "public"."http_response" as ("status" integer, "content_type" character varying, "headers" public.http_header[], "content" character varying);

CREATE OR REPLACE FUNCTION public.iniciar_viaje(p_viaje_id uuid, p_chofer_id text)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE viajes
  SET
    estado = 'EN_CURSO',
    iniciado_at = NOW(),
    updated_at = NOW()
  WHERE id = p_viaje_id
    AND chofer_id_uuid = p_chofer_id::uuid
    AND estado IN ('ACEPTADO', 'ASIGNADO', 'asignado', 'aceptado');

  INSERT INTO viaje_eventos (viaje_id, chofer_id_uuid, tipo, payload)
  VALUES (p_viaje_id, p_chofer_id::uuid, 'VIAJE_INICIADO', '{}'::jsonb);

  RETURN json_build_object('ok', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin_user(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.admin_users au
    where au.user_id = p_user_id
      and au.active = true
  );
$function$
;

CREATE OR REPLACE FUNCTION public.mark_trip_chat_read(p_viaje_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with thread_data as (
    select *
    from public.trip_chat_threads
    where viaje_id = p_viaje_id
  ),
  reset_counts as (
    update public.trip_chat_threads t
    set
      client_unread_count = case
        when auth.uid() = t.cliente_user_id then 0
        else t.client_unread_count
      end,
      driver_unread_count = case
        when auth.uid() = t.chofer_user_id then 0
        else t.driver_unread_count
      end,
      updated_at = now()
    where t.viaje_id = p_viaje_id
      and auth.uid() is not null
      and (
        auth.uid() = t.cliente_user_id
        or auth.uid() = t.chofer_user_id
      )
    returning t.id, t.cliente_user_id, t.chofer_user_id
  ),
  mark_messages as (
    update public.trip_chat_messages m
    set
      leido = true,
      read_at = now()
    where m.thread_id in (select id from reset_counts)
      and m.leido = false
      and (
        (auth.uid() = (select cliente_user_id from reset_counts limit 1) and m.sender_role = 'driver')
        or
        (auth.uid() = (select chofer_user_id from reset_counts limit 1) and m.sender_role = 'client')
      )
    returning m.id
  )
  select jsonb_build_object(
    'ok', true,
    'thread_exists', exists(select 1 from thread_data)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.mimi_current_driver_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select c.id_uuid
  from public.choferes c
  where c.user_id = auth.uid()
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.mimi_current_service_provider_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select sp.id
  from public.svc_providers sp
  where sp.user_id = auth.uid()
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_audit_logs_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  raise exception 'audit_logs is append-only';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_consent_ledger_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  raise exception 'consent_ledger is append-only';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_legal_acceptances_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  raise exception 'legal_acceptances is append-only';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.recalculate_driver_ai_score(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_profile public.driver_profiles%rowtype;

  v_selfie public.driver_documents%rowtype;
  v_dni_front public.driver_documents%rowtype;
  v_dni_back public.driver_documents%rowtype;
  v_license_front public.driver_documents%rowtype;
  v_license_back public.driver_documents%rowtype;
  v_vehicle_card_front public.driver_documents%rowtype;
  v_vehicle_card_back public.driver_documents%rowtype;

  v_score numeric := 0;
  v_label text := 'REVISAR';
  v_review_required boolean := true;
  v_kyc_status text := 'PENDING';

  v_dni_match boolean := null;
  v_name_match boolean := null;
  v_birth_match boolean := null;
  v_face_detected boolean := null;

  v_required_docs_present integer := 0;
  v_required_docs_valid integer := 0;
begin
  select *
  into v_profile
  from public.driver_profiles
  where user_id = p_user_id;

  if not found then
    return;
  end if;

  -- Respetar aprobaciones manuales/finales
  if coalesce(v_profile.documents_approved, false) = true
     or coalesce(v_profile.review_status, '') = 'approved'
     or coalesce(v_profile.kyc_status, '') = 'MANUAL_APPROVED'
  then
    update public.driver_profiles
    set
      review_required = false,
      ai_score_label = coalesce(ai_score_label, 'MANUAL'),
      kyc_status = case
        when kyc_status is null or kyc_status in ('PENDING', 'HIGH_RISK', 'MANUAL_REVIEW', 'READY_FOR_APPROVAL')
          then 'MANUAL_APPROVED'
        else kyc_status
      end,
      validation_updated_at = now()
    where user_id = p_user_id;

    return;
  end if;

  select *
  into v_selfie
  from public.driver_documents
  where user_id = p_user_id and doc_type = 'selfie'
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1;

  select *
  into v_dni_front
  from public.driver_documents
  where user_id = p_user_id and doc_type = 'dni_front'
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1;

  select *
  into v_dni_back
  from public.driver_documents
  where user_id = p_user_id and doc_type = 'dni_back'
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1;

  select *
  into v_license_front
  from public.driver_documents
  where user_id = p_user_id and doc_type = 'license_front'
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1;

  select *
  into v_license_back
  from public.driver_documents
  where user_id = p_user_id and doc_type = 'license_back'
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1;

  select *
  into v_vehicle_card_front
  from public.driver_documents
  where user_id = p_user_id and doc_type = 'vehicle_card_front'
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1;

  select *
  into v_vehicle_card_back
  from public.driver_documents
  where user_id = p_user_id and doc_type = 'vehicle_card_back'
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1;

  -- Conteo de documentos requeridos presentes
  select count(*)
  into v_required_docs_present
  from public.driver_documents
  where user_id = p_user_id
    and doc_type in (
      'dni_front',
      'dni_back',
      'selfie',
      'license_front',
      'license_back',
      'vehicle_card_front',
      'vehicle_card_back'
    );

  -- Conteo de documentos requeridos válidos
  select count(*)
  into v_required_docs_valid
  from public.driver_documents
  where user_id = p_user_id
    and doc_type in (
      'dni_front',
      'dni_back',
      'selfie',
      'license_front',
      'license_back',
      'vehicle_card_front',
      'vehicle_card_back'
    )
    and coalesce(validation_status, '') = 'VALID'
    and coalesce(review_required, true) = false;

  -- Base score por completitud
  v_score := v_score + least(v_required_docs_present * 8, 56);

  -- Selfie
  if v_selfie.id is not null then
    v_face_detected := v_selfie.face_detected;

    if coalesce(v_selfie.face_detected, false) = true then
      v_score := v_score + 12;
    else
      v_score := v_score - 40;
    end if;

    if coalesce(v_selfie.validation_status, '') = 'VALID' then
      v_score := v_score + 6;
    elsif coalesce(v_selfie.validation_status, '') = 'REVIEW' then
      v_score := v_score - 10;
    else
      v_score := v_score - 18;
    end if;

    if coalesce(v_selfie.review_required, true) = true then
      v_score := v_score - 15;
    end if;

    if coalesce(v_selfie.confidence_score, 0) >= 95 then
      v_score := v_score + 6;
    elsif coalesce(v_selfie.confidence_score, 0) >= 85 then
      v_score := v_score + 3;
    elsif coalesce(v_selfie.confidence_score, 0) < 50 then
      v_score := v_score - 10;
    end if;
  else
    v_score := v_score - 25;
  end if;

  -- DNI frente
  if v_dni_front.id is not null then
    if coalesce(v_dni_front.document_detected, false) = true then
      v_score := v_score + 8;
    else
      v_score := v_score - 20;
    end if;

    if coalesce(v_dni_front.validation_status, '') = 'VALID' then
      v_score := v_score + 8;
    elsif coalesce(v_dni_front.validation_status, '') = 'REVIEW' then
      v_score := v_score - 12;
    else
      v_score := v_score - 20;
    end if;

    if v_dni_front.ocr_fields is not null and v_dni_front.ocr_fields ? 'dni_match' then
      v_dni_match := nullif(v_dni_front.ocr_fields ->> 'dni_match', '')::boolean;
    end if;

    if v_dni_front.ocr_fields is not null and v_dni_front.ocr_fields ? 'full_name_match' then
      v_name_match := nullif(v_dni_front.ocr_fields ->> 'full_name_match', '')::boolean;
    end if;

    if v_dni_front.ocr_fields is not null and v_dni_front.ocr_fields ? 'birth_date_match' then
      v_birth_match := nullif(v_dni_front.ocr_fields ->> 'birth_date_match', '')::boolean;
    end if;

    if v_dni_match = true then
      v_score := v_score + 6;
    elsif v_dni_match = false then
      v_score := v_score - 25;
    end if;

    if v_name_match = true then
      v_score := v_score + 4;
    elsif v_name_match = false then
      v_score := v_score - 35;
    end if;

    if v_birth_match = true then
      v_score := v_score + 4;
    elsif v_birth_match = false then
      v_score := v_score - 20;
    end if;

    if coalesce(v_dni_front.review_required, true) = true then
      v_score := v_score - 10;
    end if;
  else
    v_score := v_score - 25;
  end if;

  -- DNI dorso
  if v_dni_back.id is not null then
    if coalesce(v_dni_back.document_detected, false) = true then
      v_score := v_score + 4;
    else
      v_score := v_score - 10;
    end if;

    if coalesce(v_dni_back.validation_status, '') = 'VALID' then
      v_score := v_score + 4;
    elsif coalesce(v_dni_back.validation_status, '') = 'REVIEW' then
      v_score := v_score - 6;
    else
      v_score := v_score - 10;
    end if;

    if coalesce(v_dni_back.review_required, true) = true then
      v_score := v_score - 6;
    end if;
  else
    v_score := v_score - 10;
  end if;

  -- Licencia frente
  if v_license_front.id is not null then
    if coalesce(v_license_front.document_detected, false) = true then
      v_score := v_score + 4;
    else
      v_score := v_score - 10;
    end if;

    if coalesce(v_license_front.validation_status, '') = 'VALID' then
      v_score := v_score + 4;
    elsif coalesce(v_license_front.validation_status, '') = 'REVIEW' then
      v_score := v_score - 6;
    else
      v_score := v_score - 10;
    end if;

    if coalesce(v_license_front.review_required, true) = true then
      v_score := v_score - 5;
    end if;
  else
    v_score := v_score - 10;
  end if;

  -- Licencia dorso
  if v_license_back.id is not null then
    if coalesce(v_license_back.document_detected, false) = true then
      v_score := v_score + 3;
    else
      v_score := v_score - 8;
    end if;

    if coalesce(v_license_back.validation_status, '') = 'VALID' then
      v_score := v_score + 3;
    elsif coalesce(v_license_back.validation_status, '') = 'REVIEW' then
      v_score := v_score - 5;
    else
      v_score := v_score - 8;
    end if;

    if coalesce(v_license_back.review_required, true) = true then
      v_score := v_score - 4;
    end if;
  else
    v_score := v_score - 8;
  end if;

  -- Tarjeta verde frente
  if v_vehicle_card_front.id is not null then
    if coalesce(v_vehicle_card_front.document_detected, false) = true then
      v_score := v_score + 3;
    else
      v_score := v_score - 8;
    end if;

    if coalesce(v_vehicle_card_front.validation_status, '') = 'VALID' then
      v_score := v_score + 3;
    elsif coalesce(v_vehicle_card_front.validation_status, '') = 'REVIEW' then
      v_score := v_score - 4;
    else
      v_score := v_score - 8;
    end if;

    if coalesce(v_vehicle_card_front.review_required, true) = true then
      v_score := v_score - 4;
    end if;
  else
    v_score := v_score - 8;
  end if;

  -- Tarjeta verde dorso
  if v_vehicle_card_back.id is not null then
    if coalesce(v_vehicle_card_back.document_detected, false) = true then
      v_score := v_score + 2;
    else
      v_score := v_score - 6;
    end if;

    if coalesce(v_vehicle_card_back.validation_status, '') = 'VALID' then
      v_score := v_score + 2;
    elsif coalesce(v_vehicle_card_back.validation_status, '') = 'REVIEW' then
      v_score := v_score - 3;
    else
      v_score := v_score - 6;
    end if;

    if coalesce(v_vehicle_card_back.review_required, true) = true then
      v_score := v_score - 3;
    end if;
  else
    v_score := v_score - 6;
  end if;

  if v_score < 0 then v_score := 0; end if;
  if v_score > 100 then v_score := 100; end if;

  if v_score >= 90 then
    v_label := 'ALTO';
  elsif v_score >= 75 then
    v_label := 'MEDIO';
  else
    v_label := 'REVISAR';
  end if;

  v_review_required :=
    coalesce(v_selfie.review_required, true)
    or coalesce(v_dni_front.review_required, true)
    or coalesce(v_dni_back.review_required, true)
    or coalesce(v_license_front.review_required, true)
    or coalesce(v_license_back.review_required, true)
    or coalesce(v_vehicle_card_front.review_required, true)
    or coalesce(v_vehicle_card_back.review_required, true);

  if v_required_docs_present < 7 then
    v_kyc_status := 'PENDING';
  elsif coalesce(v_selfie.face_detected, false) = false then
    v_kyc_status := 'HIGH_RISK';
  elsif v_dni_match = false or v_name_match = false or v_birth_match = false then
    v_kyc_status := 'MANUAL_REVIEW';
  elsif v_score >= 90 and v_review_required = false and v_required_docs_valid = 7 then
    v_kyc_status := 'READY_FOR_APPROVAL';
  elsif v_score >= 75 then
    v_kyc_status := 'MANUAL_REVIEW';
  else
    v_kyc_status := 'HIGH_RISK';
  end if;

  update public.driver_profiles
  set
    ai_score = v_score,
    ai_score_label = v_label,
    review_required = v_review_required,
    kyc_status = v_kyc_status,
    dni_match = v_dni_match,
    name_match = v_name_match,
    birth_match = v_birth_match,
    face_detected = v_face_detected,
    validation_updated_at = now()
  where user_id = p_user_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rechazar_oferta_viaje(p_viaje_id uuid, p_chofer_id_uuid uuid, p_motivo text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  update public.viaje_ofertas
  set
    estado = 'cancelada',
    respondida_en = now()
  where viaje_id = p_viaje_id
    and chofer_id = p_chofer_id_uuid
    and estado in ('pendiente', 'enviada');

  insert into public.viaje_eventos (viaje_id, chofer_id_uuid, tipo, payload)
  values (
    p_viaje_id,
    p_chofer_id_uuid,
    'OFERTA_RECHAZADA',
    jsonb_build_object('motivo', coalesce(p_motivo, 'RECHAZADO_POR_CHOFER'))
  );

  if exists (
    select 1
    from public.viaje_ofertas
    where viaje_id = p_viaje_id
      and estado in ('pendiente', 'enviada')
      and (expires_at is null or expires_at > now())
  ) then
    return json_build_object(
      'ok', true,
      'accion', 'QUEDAN_OFERTAS_PENDIENTES'
    );
  end if;

  update public.viajes
  set
    estado = 'DISPONIBLE',
    current_offer_expires_at = null,
    dispatch_locked = false,
    updated_at = now()
  where id = p_viaje_id;

  return json_build_object(
    'ok', true,
    'accion', 'REDISPATCH',
    'dispatch', public.dispatch_viaje_pro(p_viaje_id)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rechazar_viaje_multi_oferta(p_viaje_id uuid, p_chofer_id uuid)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
declare
  v_viaje viajes%rowtype;
  v_oferta viaje_ofertas%rowtype;
  v_pendientes_restantes integer := 0;
begin
  perform set_config('lock_timeout', '3s', true);

  begin
    select *
    into v_viaje
    from viajes
    where id = p_viaje_id
    for update nowait;
  exception
    when lock_not_available then
      return json_build_object(
        'exito', false,
        'motivo', 'viaje_bloqueado'
      );
  end;

  if not found then
    return json_build_object(
      'exito', false,
      'motivo', 'viaje_no_encontrado'
    );
  end if;

  update viaje_ofertas
  set
    estado = 'EXPIRADA',
    respondida_en = now()
  where viaje_id = p_viaje_id
    and estado = 'PENDIENTE'
    and expires_at is not null
    and expires_at <= now();

  if upper(coalesce(v_viaje.estado, '')) in ('ASIGNADO', 'EN_CURSO', 'COMPLETADO', 'CANCELADO') then
    return json_build_object(
      'exito', false,
      'motivo', 'viaje_no_rechazable',
      'estado', v_viaje.estado,
      'assigned_driver_id', v_viaje.assigned_driver_id,
      'chofer_id_uuid', v_viaje.chofer_id_uuid
    );
  end if;

  begin
    select *
    into v_oferta
    from viaje_ofertas
    where viaje_id = p_viaje_id
      and chofer_id = p_chofer_id
      and estado = 'PENDIENTE'
      and (expires_at is null or expires_at > now())
    order by enviada_en asc nulls last
    limit 1
    for update nowait;
  exception
    when lock_not_available then
      return json_build_object(
        'exito', false,
        'motivo', 'oferta_bloqueada'
      );
  end;

  if not found then
    return json_build_object(
      'exito', false,
      'motivo', 'oferta_no_valida'
    );
  end if;

  update viaje_ofertas
  set
    estado = 'RECHAZADA',
    respondida_en = now()
  where id = v_oferta.id;

  select count(*)
  into v_pendientes_restantes
  from viaje_ofertas
  where viaje_id = p_viaje_id
    and estado = 'PENDIENTE'
    and (expires_at is null or expires_at > now());

  update viajes
  set
    estado = case
      when upper(coalesce(estado, '')) in ('CANCELADO', 'COMPLETADO', 'ASIGNADO', 'EN_CURSO') then estado
      else 'DISPONIBLE'
    end,
    chofer_id_uuid = null,
    assigned_driver_id = null,
    dispatch_locked = false,
    no_driver_found = false,
    current_offer_expires_at = null,
    updated_at = now()
  where id = p_viaje_id
    and upper(coalesce(estado, '')) not in ('CANCELADO', 'COMPLETADO', 'ASIGNADO', 'EN_CURSO');

  insert into viaje_eventos (
    id,
    viaje_id,
    chofer_id_uuid,
    tipo,
    payload,
    created_at
  )
  values (
    gen_random_uuid(),
    p_viaje_id,
    p_chofer_id,
    'viaje_rechazado_multi_oferta',
    jsonb_build_object(
      'chofer_id', p_chofer_id,
      'oferta_id', v_oferta.id,
      'pendientes_restantes', v_pendientes_restantes,
      'modo', 'redispatch_ready'
    ),
    now()
  );

  return json_build_object(
    'exito', true,
    'motivo', 'oferta_rechazada',
    'viaje_id', p_viaje_id,
    'chofer_id', p_chofer_id,
    'oferta_id', v_oferta.id,
    'estado_viaje', (
      select estado
      from viajes
      where id = p_viaje_id
    ),
    'pendientes_restantes', v_pendientes_restantes,
    'redispatch_sugerido', true
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reintentar_dispatch()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_viaje RECORD;
BEGIN

  PERFORM expirar_ofertas_vencidas();

  FOR v_viaje IN
    SELECT id
    FROM viajes
    WHERE estado = 'DISPONIBLE'
  LOOP
    PERFORM dispatch_viaje_pro(v_viaje.id);
  END LOOP;

END;
$function$
;

CREATE OR REPLACE FUNCTION public.reset_test_driver(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_is_test boolean;
begin
  select is_test
  into v_is_test
  from public.driver_profiles
  where user_id = p_user_id;

  if coalesce(v_is_test, false) = false then
    return jsonb_build_object(
      'ok', false,
      'error', 'El usuario no está marcado como test'
    );
  end if;

  delete from public.driver_documents
  where user_id = p_user_id;

  update public.driver_profiles
  set
    onboarding_status = 'PENDIENTE_DOCUMENTOS',
    profile_completed = false,
    documents_completed = false,
    documents_approved = false,
    review_status = 'pending',
    activation_status = 'INACTIVO',
    ai_score = null,
    ai_score_label = null,
    review_required = true,
    kyc_status = 'PENDING',
    dni_match = null,
    name_match = null,
    birth_match = null,
    face_detected = null,
    validation_status = 'pending',
    validation_source = null,
    validation_updated_at = null,
    dni_front_url = null,
    dni_back_url = null,
    license_front_url = null,
    license_back_url = null,
    vehicle_registration_url = null,
    vehicle_insurance_url = null,
    selfie_url = null,
    review_notes = null,
    reviewed_at = null,
    reviewed_by = null,
    background_check_pending = false
  where user_id = p_user_id;

  update public.choferes
  set
    online = false,
    disponible = false,
    bloqueado = false
  where user_id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'user_id', p_user_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.responder_ticket_soporte(p_ticket_id uuid, p_sender_role text, p_mensaje text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ticket public.soporte_tickets;
  v_is_admin boolean;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select *
  into v_ticket
  from public.soporte_tickets
  where id = p_ticket_id;

  if not found then
    raise exception 'Ticket no encontrado';
  end if;

  select exists (
    select 1
    from public.admin_users a
    where a.user_id = auth.uid()
      and a.active = true
  ) into v_is_admin;

  if v_ticket.user_id <> auth.uid() and not v_is_admin then
    raise exception 'No autorizado';
  end if;

  insert into public.soporte_mensajes (
    ticket_id,
    sender_user_id,
    sender_role,
    mensaje
  )
  values (
    p_ticket_id,
    auth.uid(),
    p_sender_role,
    p_mensaje
  );

  update public.soporte_tickets
  set
    ultimo_mensaje = p_mensaje,
    last_message_at = now(),
    estado = case
      when v_is_admin then 'esperando_usuario'
      else 'en_proceso'
    end
  where id = p_ticket_id;

  return jsonb_build_object(
    'ok', true,
    'ticket_id', p_ticket_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.seed_test_driver_kyc(p_user_id uuid, p_scenario text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_is_test boolean;
begin
  select is_test
  into v_is_test
  from public.driver_profiles
  where user_id = p_user_id;

  if coalesce(v_is_test, false) = false then
    return jsonb_build_object(
      'ok', false,
      'error', 'El usuario no está marcado como test'
    );
  end if;

  perform public.reset_test_driver(p_user_id);

  if p_scenario = 'valid_basic' then
    insert into public.driver_documents
      (user_id, doc_type, storage_path, status, validation_status, review_required, document_detected, confidence_score, provider, auto_checked_at)
    values
      (p_user_id, 'dni_front', 'test/dni_front.jpg', 'PENDIENTE', 'VALID', false, true, 96, 'sandbox', now()),
      (p_user_id, 'dni_back', 'test/dni_back.jpg', 'PENDIENTE', 'VALID', false, true, 93, 'sandbox', now()),
      (p_user_id, 'selfie', 'test/selfie.jpg', 'PENDIENTE', 'VALID', false, null, 98, 'sandbox', now()),
      (p_user_id, 'license_front', 'test/license_front.jpg', 'PENDIENTE', 'VALID', false, true, 91, 'sandbox', now()),
      (p_user_id, 'license_back', 'test/license_back.jpg', 'PENDIENTE', 'VALID', false, true, 90, 'sandbox', now()),
      (p_user_id, 'vehicle_card_front', 'test/vehicle_card_front.jpg', 'PENDIENTE', 'VALID', false, true, 89, 'sandbox', now()),
      (p_user_id, 'vehicle_card_back', 'test/vehicle_card_back.jpg', 'PENDIENTE', 'VALID', false, true, 88, 'sandbox', now());

    update public.driver_documents
    set face_detected = true
    where user_id = p_user_id
      and doc_type = 'selfie';

    update public.driver_documents
    set ocr_fields = jsonb_build_object(
      'dni_match', true,
      'full_name_match', true,
      'birth_date_match', true
    )
    where user_id = p_user_id
      and doc_type = 'dni_front';

  elsif p_scenario = 'name_mismatch' then
    insert into public.driver_documents
      (user_id, doc_type, storage_path, status, validation_status, review_required, document_detected, confidence_score, provider, auto_checked_at)
    values
      (p_user_id, 'dni_front', 'test/dni_front_bad.jpg', 'PENDIENTE', 'REVIEW', true, true, 52, 'sandbox', now()),
      (p_user_id, 'dni_back', 'test/dni_back.jpg', 'PENDIENTE', 'VALID', false, true, 85, 'sandbox', now()),
      (p_user_id, 'selfie', 'test/selfie.jpg', 'PENDIENTE', 'VALID', false, null, 97, 'sandbox', now());

    update public.driver_documents
    set face_detected = true
    where user_id = p_user_id
      and doc_type = 'selfie';

    update public.driver_documents
    set ocr_fields = jsonb_build_object(
      'dni_match', true,
      'full_name_match', false,
      'birth_date_match', true
    )
    where user_id = p_user_id
      and doc_type = 'dni_front';

  elsif p_scenario = 'selfie_fail' then
    insert into public.driver_documents
      (user_id, doc_type, storage_path, status, validation_status, review_required, document_detected, confidence_score, provider, auto_checked_at)
    values
      (p_user_id, 'dni_front', 'test/dni_front.jpg', 'PENDIENTE', 'VALID', false, true, 90, 'sandbox', now()),
      (p_user_id, 'dni_back', 'test/dni_back.jpg', 'PENDIENTE', 'VALID', false, true, 88, 'sandbox', now()),
      (p_user_id, 'selfie', 'test/selfie_bad.jpg', 'PENDIENTE', 'REVIEW', true, null, 20, 'sandbox', now());

    update public.driver_documents
    set face_detected = false
    where user_id = p_user_id
      and doc_type = 'selfie';

  elsif p_scenario = 'manual_approved' then
    insert into public.driver_documents
      (user_id, doc_type, storage_path, status)
    values
      (p_user_id, 'dni_front', 'test/manual_dni_front.jpg', 'PENDIENTE'),
      (p_user_id, 'dni_back', 'test/manual_dni_back.jpg', 'PENDIENTE'),
      (p_user_id, 'selfie', 'test/manual_selfie.jpg', 'PENDIENTE');

    update public.driver_profiles
    set
      onboarding_status = 'APROBADO',
      documents_completed = true,
      documents_approved = true,
      review_status = 'approved',
      activation_status = 'ACTIVO',
      review_required = false,
      kyc_status = 'MANUAL_APPROVED',
      ai_score_label = 'MANUAL'
    where user_id = p_user_id;

    return jsonb_build_object('ok', true, 'scenario', p_scenario);
  else
    return jsonb_build_object(
      'ok', false,
      'error', 'Escenario inválido'
    );
  end if;

  perform public.sync_driver_profile_from_documents(p_user_id);
  perform public.recalculate_driver_ai_score(p_user_id);

  return jsonb_build_object(
    'ok', true,
    'scenario', p_scenario
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at_cotizaciones()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at_driver_documents()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at_driver_profiles()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at_soporte_tickets()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.simulate_driver_admin_decision(p_user_id uuid, p_action text, p_review_notes text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_result jsonb;
begin
  if p_action not in ('approve', 'reject', 'block', 'unblock') then
    return json_build_object(
      'ok', false,
      'error', 'Acción inválida',
      'allowed', json_build_array('approve', 'reject', 'block', 'unblock')
    );
  end if;

  select public.admin_review_driver(
    p_user_id,
    p_action,
    p_review_notes,
    null
  )
  into v_result;

  if p_action = 'approve' then
    update public.driver_profiles
    set
      onboarding_status = 'APROBADO',
      documents_approved = true,
      review_status = 'approved',
      activation_status = 'ACTIVO',
      review_required = false,
      kyc_status = 'MANUAL_APPROVED',
      ai_score_label = coalesce(ai_score_label, 'MANUAL'),
      reviewed_at = now(),
      review_notes = coalesce(p_review_notes, 'Aprobado desde simulación admin'),
      background_check_pending = false
    where user_id = p_user_id;

    update public.choferes
    set
      bloqueado = false,
      disponible = true,
      online = false
    where user_id = p_user_id;

  elsif p_action = 'reject' then
    update public.driver_profiles
    set
      onboarding_status = 'OBSERVADO',
      documents_approved = false,
      review_status = 'rejected',
      activation_status = 'INACTIVO',
      review_required = true,
      kyc_status = 'MANUAL_REVIEW',
      reviewed_at = now(),
      review_notes = coalesce(p_review_notes, 'Rechazado desde simulación admin')
    where user_id = p_user_id;

    update public.choferes
    set
      disponible = false,
      online = false
    where user_id = p_user_id;

  elsif p_action = 'block' then
    update public.driver_profiles
    set
      onboarding_status = 'BLOQUEADO',
      documents_approved = false,
      review_status = 'blocked',
      activation_status = 'INACTIVO',
      review_required = true,
      kyc_status = 'HIGH_RISK',
      is_blocked = true,
      blocked_reason = coalesce(p_review_notes, 'Bloqueado desde simulación admin'),
      blocked_at = now(),
      reviewed_at = now(),
      review_notes = coalesce(p_review_notes, 'Bloqueado desde simulación admin')
    where user_id = p_user_id;

    update public.choferes
    set
      bloqueado = true,
      disponible = false,
      online = false
    where user_id = p_user_id;

  elsif p_action = 'unblock' then
    update public.driver_profiles
    set
      onboarding_status = 'PENDIENTE_REVISION',
      documents_approved = false,
      review_status = 'pending',
      activation_status = 'INACTIVO',
      review_required = true,
      kyc_status = 'MANUAL_REVIEW',
      is_blocked = false,
      blocked_reason = null,
      blocked_at = null,
      reviewed_at = now(),
      review_notes = coalesce(p_review_notes, 'Desbloqueado desde simulación admin')
    where user_id = p_user_id;

    update public.choferes
    set
      bloqueado = false,
      disponible = false,
      online = false
    where user_id = p_user_id;
  end if;

  return json_build_object(
    'ok', true,
    'action', p_action,
    'user_id', p_user_id,
    'admin_review_driver_result', v_result
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.simulate_driver_kyc_scenario(p_user_id uuid, p_scenario text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  delete from public.driver_documents
  where user_id = p_user_id;

  update public.driver_profiles
  set
    onboarding_status = 'PENDIENTE_DOCUMENTOS',
    documents_completed = false,
    documents_approved = false,
    review_status = 'pending',
    activation_status = 'INACTIVO',
    ai_score = null,
    ai_score_label = null,
    review_required = true,
    kyc_status = 'PENDING',
    dni_match = null,
    name_match = null,
    birth_match = null,
    face_detected = null,
    validation_status = 'pending',
    validation_source = null,
    validation_updated_at = null,
    dni_front_url = null,
    dni_back_url = null,
    license_front_url = null,
    license_back_url = null,
    vehicle_registration_url = null,
    vehicle_insurance_url = null,
    selfie_url = null,
    review_notes = null,
    reviewed_at = null,
    reviewed_by = null,
    is_blocked = false
  where user_id = p_user_id;

  update public.choferes
  set
    online = false,
    disponible = false,
    bloqueado = false
  where user_id = p_user_id;

  if p_scenario = 'todo_ok' then

    insert into public.driver_documents (
      user_id, doc_type, storage_path, status, validation_status, review_required,
      face_detected, document_detected, confidence_score, ocr_fields,
      validation_notes, provider, provider_raw, auto_checked_at, mime_type, file_size
    )
    values
      (
        p_user_id, 'dni_front', p_user_id::text || '/dni_front.jpg',
        'PENDIENTE', 'VALID', false,
        null, true, 96,
        jsonb_build_object('dni_match', true, 'full_name_match', true, 'birth_date_match', true),
        'Documento correcto', 'simulator', jsonb_build_object('scenario', 'todo_ok', 'doc_type', 'dni_front'),
        now(), 'image/jpeg', 245000
      ),
      (
        p_user_id, 'dni_back', p_user_id::text || '/dni_back.jpg',
        'PENDIENTE', 'VALID', false,
        null, true, 92,
        null,
        'Documento correcto', 'simulator', jsonb_build_object('scenario', 'todo_ok', 'doc_type', 'dni_back'),
        now(), 'image/jpeg', 238000
      ),
      (
        p_user_id, 'selfie', p_user_id::text || '/selfie.jpg',
        'PENDIENTE', 'VALID', false,
        true, null, 98,
        null,
        'Selfie correcta', 'simulator', jsonb_build_object('scenario', 'todo_ok', 'doc_type', 'selfie'),
        now(), 'image/jpeg', 210000
      ),
      (
        p_user_id, 'license_front', p_user_id::text || '/license_front.jpg',
        'PENDIENTE', 'VALID', false,
        null, true, 91,
        null,
        'Documento correcto', 'simulator', jsonb_build_object('scenario', 'todo_ok', 'doc_type', 'license_front'),
        now(), 'image/jpeg', 252000
      ),
      (
        p_user_id, 'license_back', p_user_id::text || '/license_back.jpg',
        'PENDIENTE', 'VALID', false,
        null, true, 89,
        null,
        'Documento correcto', 'simulator', jsonb_build_object('scenario', 'todo_ok', 'doc_type', 'license_back'),
        now(), 'image/jpeg', 243000
      ),
      (
        p_user_id, 'vehicle_card_front', p_user_id::text || '/vehicle_card_front.jpg',
        'PENDIENTE', 'VALID', false,
        null, true, 90,
        null,
        'Documento correcto', 'simulator', jsonb_build_object('scenario', 'todo_ok', 'doc_type', 'vehicle_card_front'),
        now(), 'image/jpeg', 248000
      ),
      (
        p_user_id, 'vehicle_card_back', p_user_id::text || '/vehicle_card_back.jpg',
        'PENDIENTE', 'VALID', false,
        null, true, 88,
        null,
        'Documento correcto', 'simulator', jsonb_build_object('scenario', 'todo_ok', 'doc_type', 'vehicle_card_back'),
        now(), 'image/jpeg', 241000
      )
    on conflict (user_id, doc_type)
    do update set
      storage_path = excluded.storage_path,
      status = excluded.status,
      validation_status = excluded.validation_status,
      review_required = excluded.review_required,
      face_detected = excluded.face_detected,
      document_detected = excluded.document_detected,
      confidence_score = excluded.confidence_score,
      ocr_fields = excluded.ocr_fields,
      validation_notes = excluded.validation_notes,
      provider = excluded.provider,
      provider_raw = excluded.provider_raw,
      auto_checked_at = excluded.auto_checked_at,
      mime_type = excluded.mime_type,
      file_size = excluded.file_size,
      updated_at = now();

  elsif p_scenario = 'selfie_fail' then

    insert into public.driver_documents (
      user_id, doc_type, storage_path, status, validation_status, review_required,
      face_detected, document_detected, confidence_score, ocr_fields,
      validation_notes, provider, provider_raw, auto_checked_at, mime_type, file_size
    )
    values
      (
        p_user_id, 'dni_front', p_user_id::text || '/dni_front.jpg',
        'PENDIENTE', 'VALID', false,
        null, true, 96,
        jsonb_build_object('dni_match', true, 'full_name_match', true, 'birth_date_match', true),
        'Documento correcto', 'simulator', jsonb_build_object('scenario', 'selfie_fail', 'doc_type', 'dni_front'),
        now(), 'image/jpeg', 245000
      ),
      (
        p_user_id, 'dni_back', p_user_id::text || '/dni_back.jpg',
        'PENDIENTE', 'VALID', false,
        null, true, 92,
        null,
        'Documento correcto', 'simulator', jsonb_build_object('scenario', 'selfie_fail', 'doc_type', 'dni_back'),
        now(), 'image/jpeg', 238000
      ),
      (
        p_user_id, 'selfie', p_user_id::text || '/selfie_fail.jpg',
        'PENDIENTE', 'REVIEW', true,
        false, null, 20,
        null,
        'No se detectó rostro correctamente', 'simulator', jsonb_build_object('scenario', 'selfie_fail', 'doc_type', 'selfie'),
        now(), 'image/jpeg', 210000
      ),
      (
        p_user_id, 'license_front', p_user_id::text || '/license_front.jpg',
        'PENDIENTE', 'VALID', false,
        null, true, 91,
        null,
        'Documento correcto', 'simulator', jsonb_build_object('scenario', 'selfie_fail', 'doc_type', 'license_front'),
        now(), 'image/jpeg', 252000
      ),
      (
        p_user_id, 'license_back', p_user_id::text || '/license_back.jpg',
        'PENDIENTE', 'VALID', false,
        null, true, 89,
        null,
        'Documento correcto', 'simulator', jsonb_build_object('scenario', 'selfie_fail', 'doc_type', 'license_back'),
        now(), 'image/jpeg', 243000
      ),
      (
        p_user_id, 'vehicle_card_front', p_user_id::text || '/vehicle_card_front.jpg',
        'PENDIENTE', 'VALID', false,
        null, true, 90,
        null,
        'Documento correcto', 'simulator', jsonb_build_object('scenario', 'selfie_fail', 'doc_type', 'vehicle_card_front'),
        now(), 'image/jpeg', 248000
      ),
      (
        p_user_id, 'vehicle_card_back', p_user_id::text || '/vehicle_card_back.jpg',
        'PENDIENTE', 'VALID', false,
        null, true, 88,
        null,
        'Documento correcto', 'simulator', jsonb_build_object('scenario', 'selfie_fail', 'doc_type', 'vehicle_card_back'),
        now(), 'image/jpeg', 241000
      )
    on conflict (user_id, doc_type)
    do update set
      storage_path = excluded.storage_path,
      status = excluded.status,
      validation_status = excluded.validation_status,
      review_required = excluded.review_required,
      face_detected = excluded.face_detected,
      document_detected = excluded.document_detected,
      confidence_score = excluded.confidence_score,
      ocr_fields = excluded.ocr_fields,
      validation_notes = excluded.validation_notes,
      provider = excluded.provider,
      provider_raw = excluded.provider_raw,
      auto_checked_at = excluded.auto_checked_at,
      mime_type = excluded.mime_type,
      file_size = excluded.file_size,
      updated_at = now();

  elsif p_scenario = 'name_mismatch' then

    insert into public.driver_documents (
      user_id, doc_type, storage_path, status, validation_status, review_required,
      face_detected, document_detected, confidence_score, ocr_fields,
      validation_notes, provider, provider_raw, auto_checked_at, mime_type, file_size
    )
    values
      (
        p_user_id, 'dni_front', p_user_id::text || '/dni_front_bad_name.jpg',
        'PENDIENTE', 'REVIEW', true,
        null, true, 55,
        jsonb_build_object('dni_match', true, 'full_name_match', false, 'birth_date_match', true),
        'Nombre no coincide con el perfil', 'simulator', jsonb_build_object('scenario', 'name_mismatch', 'doc_type', 'dni_front'),
        now(), 'image/jpeg', 245000
      ),
      (
        p_user_id, 'dni_back', p_user_id::text || '/dni_back.jpg',
        'PENDIENTE', 'VALID', false,
        null, true, 90,
        null,
        'Documento correcto', 'simulator', jsonb_build_object('scenario', 'name_mismatch', 'doc_type', 'dni_back'),
        now(), 'image/jpeg', 238000
      ),
      (
        p_user_id, 'selfie', p_user_id::text || '/selfie_ok.jpg',
        'PENDIENTE', 'VALID', false,
        true, null, 97,
        null,
        'Selfie correcta', 'simulator', jsonb_build_object('scenario', 'name_mismatch', 'doc_type', 'selfie'),
        now(), 'image/jpeg', 210000
      ),
      (
        p_user_id, 'license_front', p_user_id::text || '/license_front.jpg',
        'PENDIENTE', 'VALID', false,
        null, true, 91,
        null,
        'Documento correcto', 'simulator', jsonb_build_object('scenario', 'name_mismatch', 'doc_type', 'license_front'),
        now(), 'image/jpeg', 252000
      ),
      (
        p_user_id, 'license_back', p_user_id::text || '/license_back.jpg',
        'PENDIENTE', 'VALID', false,
        null, true, 89,
        null,
        'Documento correcto', 'simulator', jsonb_build_object('scenario', 'name_mismatch', 'doc_type', 'license_back'),
        now(), 'image/jpeg', 243000
      ),
      (
        p_user_id, 'vehicle_card_front', p_user_id::text || '/vehicle_card_front.jpg',
        'PENDIENTE', 'VALID', false,
        null, true, 90,
        null,
        'Documento correcto', 'simulator', jsonb_build_object('scenario', 'name_mismatch', 'doc_type', 'vehicle_card_front'),
        now(), 'image/jpeg', 248000
      ),
      (
        p_user_id, 'vehicle_card_back', p_user_id::text || '/vehicle_card_back.jpg',
        'PENDIENTE', 'VALID', false,
        null, true, 88,
        null,
        'Documento correcto', 'simulator', jsonb_build_object('scenario', 'name_mismatch', 'doc_type', 'vehicle_card_back'),
        now(), 'image/jpeg', 241000
      )
    on conflict (user_id, doc_type)
    do update set
      storage_path = excluded.storage_path,
      status = excluded.status,
      validation_status = excluded.validation_status,
      review_required = excluded.review_required,
      face_detected = excluded.face_detected,
      document_detected = excluded.document_detected,
      confidence_score = excluded.confidence_score,
      ocr_fields = excluded.ocr_fields,
      validation_notes = excluded.validation_notes,
      provider = excluded.provider,
      provider_raw = excluded.provider_raw,
      auto_checked_at = excluded.auto_checked_at,
      mime_type = excluded.mime_type,
      file_size = excluded.file_size,
      updated_at = now();

  else
    return json_build_object(
      'ok', false,
      'error', 'Escenario inválido',
      'allowed', json_build_array('todo_ok', 'selfie_fail', 'name_mismatch')
    );
  end if;

  perform public.sync_driver_profile_from_documents(p_user_id);
  perform public.recalculate_driver_ai_score(p_user_id);

  update public.driver_profiles
  set
    validation_status = 'validated',
    validation_source = 'scenario_' || p_scenario,
    validation_updated_at = now()
  where user_id = p_user_id;

  return json_build_object(
    'ok', true,
    'scenario', p_scenario,
    'user_id', p_user_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.svc_accept_offer_atomic(p_offer_id uuid, p_provider_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_offer record;
  v_request record;
  v_provider record;
  v_now timestamptz := now();
  v_assignment_id uuid;
  v_conversation_id uuid;
  v_new_request_status text;
begin
  -- 1) validar provider
  select *
  into v_provider
  from public.svc_providers
  where user_id = p_provider_user_id
  limit 1;

  if v_provider is null then
    raise exception 'provider_not_found';
  end if;

  if coalesce(v_provider.approved, false) is not true or coalesce(v_provider.blocked, false) is true then
    raise exception 'provider_not_allowed';
  end if;

  -- 2) lock sobre la oferta
  select *
  into v_offer
  from public.svc_request_offers
  where id = p_offer_id
  for update;

  if v_offer is null then
    raise exception 'offer_not_found';
  end if;

  if v_offer.provider_id <> v_provider.id then
    raise exception 'offer_forbidden';
  end if;

  if v_offer.status <> 'PENDING' then
    return jsonb_build_object(
      'ok', true,
      'already_processed', true,
      'reason', 'offer_not_pending'
    );
  end if;

  if v_offer.expires_at is not null and v_offer.expires_at < v_now then
    update public.svc_request_offers
    set status = 'EXPIRED',
        responded_at = v_now
    where id = v_offer.id
      and status = 'PENDING';

    return jsonb_build_object(
      'ok', false,
      'error', 'offer_expired'
    );
  end if;

  -- 3) lock sobre la request
  select *
  into v_request
  from public.svc_requests
  where id = v_offer.request_id
  for update;

  if v_request is null then
    raise exception 'request_not_found';
  end if;

  if v_request.status not in ('SEARCHING', 'PENDING_PROVIDER_RESPONSE', 'SCHEDULED') then
    return jsonb_build_object(
      'ok', true,
      'already_processed', true,
      'reason', 'request_not_assignable'
    );
  end if;

  -- 4) blindaje extra: si ya existe assignment activa, no seguimos
  if exists (
    select 1
    from public.svc_assignments a
    where a.request_id = v_request.id
      and a.status = 'ACTIVE'
  ) then
    return jsonb_build_object(
      'ok', true,
      'already_processed', true,
      'reason', 'assignment_already_exists'
    );
  end if;

  v_new_request_status :=
    case
      when v_request.request_type = 'SCHEDULED' then 'SCHEDULED'
      else 'ACCEPTED'
    end;

  -- 5) aceptar esta oferta
  update public.svc_request_offers
  set status = 'ACCEPTED',
      responded_at = v_now
  where id = v_offer.id
    and status = 'PENDING';

  -- 6) cancelar el resto
  update public.svc_request_offers
  set status = 'CANCELLED',
      responded_at = v_now
  where request_id = v_request.id
    and id <> v_offer.id
    and status = 'PENDING';

  -- 7) crear assignment única
  insert into public.svc_assignments (
    request_id,
    provider_id,
    status,
    assigned_at
  )
  values (
    v_request.id,
    v_provider.id,
    'ACTIVE',
    v_now
  )
  on conflict do nothing
  returning id into v_assignment_id;

  if v_assignment_id is null then
    return jsonb_build_object(
      'ok', true,
      'already_processed', true,
      'reason', 'assignment_conflict'
    );
  end if;

  -- 8) actualizar request
  update public.svc_requests
  set status = v_new_request_status,
      accepted_provider_id = v_provider.id,
      accepted_at = v_now,
      provider_response_deadline_at = null
  where id = v_request.id;

  -- 9) conversación única por request
  insert into public.svc_conversations (
    request_id,
    client_user_id,
    provider_user_id,
    status
  )
  values (
    v_request.id,
    v_request.client_user_id,
    p_provider_user_id,
    'OPEN'
  )
  on conflict (request_id)
  do update set
    provider_user_id = excluded.provider_user_id
  returning id into v_conversation_id;

  return jsonb_build_object(
    'ok', true,
    'accepted', true,
    'request_id', v_request.id,
    'provider_id', v_provider.id,
    'assignment_id', v_assignment_id,
    'conversation_id', v_conversation_id,
    'request_status', v_new_request_status
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.svc_cancel_request_atomic(p_request_id uuid, p_actor_user_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_request record;
  v_now timestamptz := now();
  v_actor text;
  v_fee numeric := 0;
begin
  select *
  into v_request
  from svc_requests
  where id = p_request_id
  for update;

  if v_request is null then
    raise exception 'request_not_found';
  end if;

  if v_request.status in ('CANCELLED','COMPLETED') then
    return jsonb_build_object('already_processed', true);
  end if;

  if v_request.client_user_id = p_actor_user_id then
    v_actor := 'CLIENT';
  elsif v_request.accepted_provider_id = (
    select id from svc_providers where user_id = p_actor_user_id
  ) then
    v_actor := 'PROVIDER';
  else
    raise exception 'forbidden';
  end if;

  -- fee
  if v_actor = 'CLIENT' and v_request.status in ('ACCEPTED','PROVIDER_EN_ROUTE') then
    v_fee := coalesce(v_request.platform_fee_snapshot, 0);
  end if;

  update svc_requests
  set status = 'CANCELLED',
      cancelled_at = v_now,
      cancelled_by = v_actor,
      cancellation_reason = p_reason,
      cancellation_fee = v_fee
  where id = p_request_id;

  update svc_request_offers
  set status = 'CANCELLED',
      responded_at = v_now
  where request_id = p_request_id
    and status = 'PENDING';

  update svc_assignments
  set status = 'CANCELLED',
      cancelled_at = v_now
  where request_id = p_request_id
    and status = 'ACTIVE';

  return jsonb_build_object(
    'ok', true,
    'request_id', p_request_id,
    'fee', v_fee
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.svc_claim_events(p_limit integer)
 RETURNS SETOF public.svc_scheduled_events
 LANGUAGE sql
AS $function$
  update public.svc_scheduled_events
  set status = 'PROCESSING',
      picked_at = now(),
      attempts = coalesce(attempts, 0) + 1
  where id in (
    select id
    from public.svc_scheduled_events
    where status = 'PENDING'
      and run_at <= now()
    order by run_at asc
    for update skip locked
    limit p_limit
  )
  returning *;
$function$
;

CREATE OR REPLACE FUNCTION public.svc_complete_service_atomic(p_request_id uuid, p_provider_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_request record;
  v_provider_id uuid;
  v_now timestamptz := now();
begin
  select id into v_provider_id
  from svc_providers
  where user_id = p_provider_user_id;

  select *
  into v_request
  from svc_requests
  where id = p_request_id
  for update;

  if v_request.status <> 'IN_PROGRESS' then
    return jsonb_build_object('already_processed', true);
  end if;

  update svc_requests
  set status = 'COMPLETED',
      completed_at = v_now
  where id = p_request_id;

  -- LEDGER CON KEY ÚNICA
  insert into svc_financial_ledger (entry_key, request_id, entry_type, amount)
  values
    ('req:'||p_request_id||':escrow', p_request_id, 'ESCROW_RELEASE', v_request.total_price_snapshot),
    ('req:'||p_request_id||':fee', p_request_id, 'PLATFORM_FEE', v_request.platform_fee_snapshot),
    ('req:'||p_request_id||':provider', p_request_id, 'PROVIDER_EARNING', v_request.provider_price_snapshot)
  on conflict do nothing;

  return jsonb_build_object('ok', true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.svc_create_escrow_hold_after_payment_intent()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  insert into public.svc_escrow_holds (
    request_id,
    payment_intent_id,
    amount,
    currency,
    status,
    held_at
  )
  values (
    new.request_id,
    new.id,
    new.amount_total,
    new.currency,
    case when new.status in ('CREATED','AUTHORIZED') then 'HELD' else 'VOIDED' end,
    now()
  )
  on conflict (request_id) do nothing;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.svc_create_request_atomic(p_client_user_id uuid, p_category_id uuid, p_provider_id uuid, p_address_text text, p_service_lat double precision, p_service_lng double precision, p_request_type text, p_scheduled_for timestamp with time zone, p_requested_hours integer, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pricing jsonb;
  v_candidates jsonb;
  v_provider_user_id uuid;
  v_timeout_seconds integer;
  v_deadline timestamptz;
  v_request svc_requests%rowtype;
  v_offer svc_request_offers%rowtype;
begin
  if p_client_user_id is null then
    raise exception 'client_user_id_required';
  end if;

  if p_category_id is null then
    raise exception 'category_id_required';
  end if;

  if p_provider_id is null then
    raise exception 'selected_provider_id_required';
  end if;

  if p_service_lat is null or p_service_lng is null then
    raise exception 'service_coordinates_required';
  end if;

  if p_requested_hours is null or p_requested_hours < 1 or p_requested_hours > 8 then
    raise exception 'requested_hours_invalid';
  end if;

  if p_request_type not in ('IMMEDIATE', 'SCHEDULED') then
    raise exception 'request_type_invalid';
  end if;

  select public.svc_prepare_request_pricing(
    p_client_user_id,
    p_category_id,
    p_provider_id,
    p_service_lat,
    p_service_lng,
    p_request_type,
    p_scheduled_for,
    p_requested_hours
  )
  into v_pricing;

  if v_pricing is null or coalesce((v_pricing ->> 'eligible')::boolean, false) = false then
    raise exception '%', coalesce(v_pricing ->> 'reason', 'provider_not_eligible');
  end if;

  select user_id
  into v_provider_user_id
  from public.svc_providers
  where id = p_provider_id
    and approved = true
    and blocked = false;

  if v_provider_user_id is null then
    raise exception 'provider_notification_target_not_found';
  end if;

  v_timeout_seconds := public.svc_offer_timeout_seconds(p_request_type);
  v_deadline := now() + make_interval(secs => v_timeout_seconds);

  insert into public.svc_requests (
    client_user_id,
    category_id,
    selected_provider_id,
    address_text,
    service_lat,
    service_lng,
    request_type,
    scheduled_for,
    requested_hours,
    notes,
    provider_price_snapshot,
    platform_fee_snapshot,
    total_price_snapshot,
    currency,
    status,
    provider_response_deadline_at,
    created_via
  )
  values (
    p_client_user_id,
    p_category_id,
    p_provider_id,
    p_address_text,
    p_service_lat,
    p_service_lng,
    p_request_type,
    p_scheduled_for,
    p_requested_hours,
    p_notes,
    (v_pricing ->> 'provider_price')::numeric,
    (v_pricing ->> 'platform_fee')::numeric,
    (v_pricing ->> 'total_price')::numeric,
    coalesce(v_pricing ->> 'currency', 'ARS'),
    'PENDING_PROVIDER_RESPONSE',
    v_deadline,
    'CLIENT_APP'
  )
  returning * into v_request;

  v_candidates := coalesce(v_pricing -> 'visible_candidates', '[]'::jsonb);

  if jsonb_typeof(v_candidates) = 'array' then
    insert into public.svc_request_candidates (
      request_id,
      provider_id,
      rank_position,
      score,
      distance_km,
      rating_snapshot,
      provider_price_snapshot
    )
    select
      v_request.id,
      (elem ->> 'provider_id')::uuid,
      ord::integer,
      nullif(elem ->> 'score', '')::numeric,
      nullif(elem ->> 'distance_km', '')::numeric,
      nullif(elem ->> 'rating', '')::numeric,
      nullif(elem ->> 'provider_price', '')::numeric
    from jsonb_array_elements(v_candidates) with ordinality as t(elem, ord)
    where elem ? 'provider_id';
  end if;

  insert into public.svc_payment_intents (
    request_id,
    client_user_id,
    provider_id,
    amount_total,
    amount_provider,
    amount_platform_fee,
    currency,
    status
  )
  values (
    v_request.id,
    p_client_user_id,
    p_provider_id,
    (v_pricing ->> 'total_price')::numeric,
    (v_pricing ->> 'provider_price')::numeric,
    (v_pricing ->> 'platform_fee')::numeric,
    coalesce(v_pricing ->> 'currency', 'ARS'),
    'CREATED'
  );

  insert into public.svc_request_offers (
    request_id,
    provider_id,
    status,
    sent_at,
    expires_at
  )
  values (
    v_request.id,
    p_provider_id,
    'PENDING',
    now(),
    v_deadline
  )
  returning * into v_offer;

  return jsonb_build_object(
    'ok', true,
    'request', to_jsonb(v_request),
    'offer', to_jsonb(v_offer),
    'provider_user_id', v_provider_user_id,
    'provider_response_deadline_at', v_deadline,
    'pricing', jsonb_build_object(
      'provider_price', (v_pricing ->> 'provider_price')::numeric,
      'platform_fee', (v_pricing ->> 'platform_fee')::numeric,
      'total_price', (v_pricing ->> 'total_price')::numeric,
      'currency', coalesce(v_pricing ->> 'currency', 'ARS')
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.svc_get_provider_id_by_user(p_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id
  from public.svc_providers p
  where p.user_id = p_user_id
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.svc_is_request_participant(p_request_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.svc_requests r
    left join public.svc_providers sp on sp.id = r.accepted_provider_id
    where r.id = p_request_id
      and (
        r.client_user_id = p_user_id
        or sp.user_id = p_user_id
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.svc_normalize_text(p_value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select nullif(trim(regexp_replace(coalesce(p_value, ''), '\s+', ' ', 'g')), '');
$function$
;

CREATE OR REPLACE FUNCTION public.svc_offer_timeout_seconds(p_request_type text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_request_type = 'IMMEDIATE' then 90
    when p_request_type = 'SCHEDULED' then 900
    else 90
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.svc_prepare_request_pricing(p_client_user_id uuid, p_category_id uuid, p_provider_id uuid, p_service_lat double precision, p_service_lng double precision, p_request_type text, p_scheduled_for timestamp with time zone, p_requested_hours integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_provider record;
  v_pricing record;
  v_general jsonb;
  v_platform_fee_percent numeric := 0.15;
  v_platform_fee_min numeric := 500;
  v_scheduled_max_hours_ahead integer := 48;
  v_provider_price numeric := 0;
  v_platform_fee numeric := 0;
  v_total_price numeric := 0;
  v_visible_candidates jsonb := '[]'::jsonb;
begin
  if p_requested_hours is null or p_requested_hours < 1 or p_requested_hours > 8 then
    return jsonb_build_object(
      'eligible', false,
      'reason', 'requested_hours_invalid'
    );
  end if;

  if p_request_type not in ('IMMEDIATE','SCHEDULED') then
    return jsonb_build_object(
      'eligible', false,
      'reason', 'request_type_invalid'
    );
  end if;

  select config_value_json
  into v_general
  from public.svc_platform_config
  where config_key = 'general'
  limit 1;

  v_platform_fee_percent := coalesce((v_general->>'platform_fee_percent')::numeric, 0.15);
  v_platform_fee_min := coalesce((v_general->>'platform_fee_min')::numeric, 500);
  v_scheduled_max_hours_ahead := coalesce((v_general->>'scheduled_max_hours_ahead')::integer, 48);

  if p_request_type = 'SCHEDULED' then
    if p_scheduled_for is null then
      return jsonb_build_object(
        'eligible', false,
        'reason', 'scheduled_for_required'
      );
    end if;

    if p_scheduled_for <= now() then
      return jsonb_build_object(
        'eligible', false,
        'reason', 'scheduled_for_in_past'
      );
    end if;

    if p_scheduled_for > now() + make_interval(hours => v_scheduled_max_hours_ahead) then
      return jsonb_build_object(
        'eligible', false,
        'reason', 'scheduled_for_too_far'
      );
    end if;
  end if;

  select
    sp.id,
    sp.user_id,
    sp.full_name,
    sp.approved,
    sp.blocked,
    sp.status
  into v_provider
  from public.svc_providers sp
  where sp.id = p_provider_id;

  if not found then
    return jsonb_build_object(
      'eligible', false,
      'reason', 'provider_not_found'
    );
  end if;

  if v_provider.approved is distinct from true or v_provider.blocked is true then
    return jsonb_build_object(
      'eligible', false,
      'reason', 'provider_not_allowed'
    );
  end if;

  select
    spp.*
  into v_pricing
  from public.svc_provider_pricing spp
  join public.svc_provider_categories spc
    on spc.provider_id = spp.provider_id
   and spc.category_id = spp.category_id
   and spc.active = true
  where spp.provider_id = p_provider_id
    and spp.category_id = p_category_id
    and spp.active = true;

  if not found then
    return jsonb_build_object(
      'eligible', false,
      'reason', 'provider_pricing_not_found'
    );
  end if;

  if p_requested_hours < v_pricing.minimum_hours or p_requested_hours > v_pricing.maximum_hours then
    return jsonb_build_object(
      'eligible', false,
      'reason', 'requested_hours_out_of_range'
    );
  end if;

  v_provider_price := round((v_pricing.price_per_hour * p_requested_hours)::numeric, 2);
  v_platform_fee := greatest(
    round((v_provider_price * v_platform_fee_percent)::numeric, 2),
    v_platform_fee_min
  );
  v_total_price := round((v_provider_price + v_platform_fee)::numeric, 2);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'provider_id', s.provider_id,
        'user_id', s.user_id,
        'full_name', s.full_name,
        'rating', s.rating,
        'rating_count', s.rating_count,
        'distance_km', s.distance_km,
        'provider_price', s.provider_price,
        'currency', s.currency,
        'score', s.score
      )
      order by s.score desc
    ),
    '[]'::jsonb
  )
  into v_visible_candidates
  from public.svc_search_providers_ranked(
    p_category_id,
    p_service_lat,
    p_service_lng,
    p_request_type,
    p_scheduled_for,
    p_requested_hours,
    10
  ) s;

  if not exists (
    select 1
    from jsonb_array_elements(v_visible_candidates) elem
    where (elem->>'provider_id')::uuid = p_provider_id
  ) then
    return jsonb_build_object(
      'eligible', false,
      'reason', 'provider_not_eligible_for_request'
    );
  end if;

  return jsonb_build_object(
    'eligible', true,
    'provider_id', p_provider_id,
    'client_user_id', p_client_user_id,
    'provider_price', v_provider_price,
    'platform_fee', v_platform_fee,
    'total_price', v_total_price,
    'currency', coalesce(v_pricing.currency, 'ARS'),
    'visible_candidates', v_visible_candidates
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.svc_search_providers_ranked(p_category_id uuid, p_service_lat double precision, p_service_lng double precision, p_request_type text, p_scheduled_for timestamp with time zone, p_requested_hours integer, p_limit integer DEFAULT 20)
 RETURNS TABLE(provider_id uuid, user_id uuid, full_name text, rating numeric, rating_count integer, distance_km numeric, provider_price numeric, currency text, score numeric)
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_search_radius_km numeric := 20;
  v_target_ts timestamptz;
  v_day_of_week integer;
  v_target_time time;
begin
  select coalesce((config_value_json->>'search_radius_km')::numeric, 20)
  into v_search_radius_km
  from public.svc_platform_config
  where config_key = 'general'
  limit 1;

  v_target_ts := coalesce(p_scheduled_for, now());
  v_day_of_week := extract(dow from v_target_ts);
  v_target_time := v_target_ts::time;

  return query
  with base as (
    select
      sp.id as provider_id,
      sp.user_id,
      sp.full_name,
      sp.rating_avg,
      sp.rating_count,
      spp.price_per_hour,
      spp.currency,
      round(
        (st_distance(
          sp.last_location,
          st_setsrid(st_makepoint(p_service_lng, p_service_lat), 4326)::geography
        ) / 1000.0)::numeric
      , 2) as distance_km
    from public.svc_providers sp
    join public.svc_provider_categories spc
      on spc.provider_id = sp.id
     and spc.category_id = p_category_id
     and spc.active = true
    join public.svc_provider_pricing spp
      on spp.provider_id = sp.id
     and spp.category_id = p_category_id
     and spp.active = true
    join public.svc_provider_profiles prof
      on prof.provider_id = sp.id
    where sp.approved = true
      and sp.blocked = false
      and sp.last_location is not null
      and (
        (p_request_type = 'IMMEDIATE' and prof.accepts_immediate = true and sp.status in ('ONLINE_IDLE'))
        or
        (p_request_type = 'SCHEDULED' and prof.accepts_scheduled = true and sp.status in ('ONLINE_IDLE','BOOKED_UPCOMING'))
      )
      and p_requested_hours between spp.minimum_hours and spp.maximum_hours
      and st_dwithin(
        sp.last_location,
        st_setsrid(st_makepoint(p_service_lng, p_service_lat), 4326)::geography,
        (v_search_radius_km * 1000)
      )
      and exists (
        select 1
        from public.svc_provider_availability a
        where a.provider_id = sp.id
          and a.active = true
          and a.day_of_week = v_day_of_week
          and v_target_time >= a.start_time
          and v_target_time < a.end_time
      )
  )
  select
    b.provider_id,
    b.user_id,
    b.full_name,
    b.rating_avg::numeric as rating,
    b.rating_count,
    b.distance_km,
    round((b.price_per_hour * p_requested_hours)::numeric, 2) as provider_price,
    b.currency,
    round((
      (100 - least(coalesce(b.distance_km, 100), 100)) * 0.45
      + least(coalesce(b.rating_avg, 0), 5) * 20 * 0.35
      + greatest(0, 100 - least((b.price_per_hour * p_requested_hours) / 100, 100)) * 0.20
    )::numeric, 4) as score
  from base b
  order by score desc, distance_km asc, rating_avg desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.svc_set_created_at_if_null()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.created_at is null then
    new.created_at = now();
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.svc_set_provider_location()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.last_lat is not null and new.last_lng is not null then
    new.last_location := st_setsrid(st_makepoint(new.last_lng, new.last_lat), 4326)::geography;
  else
    new.last_location := null;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.svc_set_request_location()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.service_lat is not null and new.service_lng is not null then
    new.service_location := st_setsrid(st_makepoint(new.service_lng, new.service_lat), 4326)::geography;
  else
    new.service_location := null;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.svc_set_tracking_location()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.location := st_setsrid(st_makepoint(new.lng, new.lat), 4326)::geography;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.svc_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.svc_touch_conversation_last_message()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  update public.svc_conversations
     set last_message_at = new.created_at,
         updated_at = now()
   where id = new.conversation_id;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.svc_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_dispatch_attempt_count(p_trip_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_attempts integer;
  v_failed boolean;
begin
  select
    current_attempt,
    (queue_status = 'failed')
  into
    v_attempts,
    v_failed
  from public.trip_dispatch_queue
  where trip_id = p_trip_id;

  if not found then
    raise exception 'No existe queue para trip_id=%', p_trip_id;
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'trips'
  ) then
    update public.trips
    set
      dispatch_attempt_count = coalesce(v_attempts, 0),
      no_driver_found = coalesce(v_failed, false)
    where id = p_trip_id;
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'viajes'
  ) then
    update public.viajes
    set
      dispatch_attempt_count = coalesce(v_attempts, 0),
      no_driver_found = coalesce(v_failed, false)
    where id = p_trip_id;
  end if;

  return jsonb_build_object(
    'exito', true,
    'trip_id', p_trip_id,
    'dispatch_attempt_count', v_attempts,
    'no_driver_found', v_failed
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_driver_profile_from_documents(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_required_docs text[] := array[
    'dni_front',
    'dni_back',
    'selfie',
    'license_front',
    'license_back',
    'vehicle_card_front',
    'vehicle_card_back'
  ];
  v_total_required integer := array_length(v_required_docs, 1);
  v_present_required integer := 0;
  v_valid_required integer := 0;
  v_review_required_count integer := 0;
  v_rejected_count integer := 0;
  v_has_background_check boolean := false;
  v_next_onboarding_status text := 'PENDIENTE_DOCUMENTOS';
  v_documents_completed boolean := false;
  v_review_required boolean := true;
  v_kyc_status text := 'PENDING';

  v_dni_front_ref text;
  v_dni_back_ref text;
  v_license_front_ref text;
  v_license_back_ref text;
  v_vehicle_card_front_ref text;
  v_vehicle_card_back_ref text;
  v_selfie_ref text;
begin
  perform public.ensure_driver_profile_exists(p_user_id);

  select count(*)
  into v_present_required
  from public.driver_documents
  where user_id = p_user_id
    and doc_type = any(v_required_docs);

  select count(*)
  into v_valid_required
  from public.driver_documents
  where user_id = p_user_id
    and doc_type = any(v_required_docs)
    and coalesce(validation_status, '') = 'VALID'
    and coalesce(review_required, true) = false;

  select count(*)
  into v_review_required_count
  from public.driver_documents
  where user_id = p_user_id
    and doc_type = any(v_required_docs)
    and (
      coalesce(review_required, true) = true
      or coalesce(validation_status, '') in ('REVIEW', 'REJECTED')
    );

  select count(*)
  into v_rejected_count
  from public.driver_documents
  where user_id = p_user_id
    and status = 'RECHAZADO';

  select exists(
    select 1
    from public.driver_documents
    where user_id = p_user_id
      and doc_type = 'background_check'
  )
  into v_has_background_check;

  select coalesce(storage_path, file_url) into v_dni_front_ref
  from public.driver_documents
  where user_id = p_user_id and doc_type = 'dni_front';

  select coalesce(storage_path, file_url) into v_dni_back_ref
  from public.driver_documents
  where user_id = p_user_id and doc_type = 'dni_back';

  select coalesce(storage_path, file_url) into v_license_front_ref
  from public.driver_documents
  where user_id = p_user_id and doc_type = 'license_front';

  select coalesce(storage_path, file_url) into v_license_back_ref
  from public.driver_documents
  where user_id = p_user_id and doc_type = 'license_back';

  select coalesce(storage_path, file_url) into v_vehicle_card_front_ref
  from public.driver_documents
  where user_id = p_user_id and doc_type = 'vehicle_card_front';

  select coalesce(storage_path, file_url) into v_vehicle_card_back_ref
  from public.driver_documents
  where user_id = p_user_id and doc_type = 'vehicle_card_back';

  select coalesce(storage_path, file_url) into v_selfie_ref
  from public.driver_documents
  where user_id = p_user_id and doc_type = 'selfie';

  v_documents_completed := (v_present_required = v_total_required);

  if v_rejected_count > 0 then
    v_next_onboarding_status := 'OBSERVADO';
    v_review_required := true;
    v_kyc_status := 'MANUAL_REVIEW';
  elsif v_present_required < v_total_required then
    v_next_onboarding_status := 'PENDIENTE_DOCUMENTOS';
    v_review_required := true;
    v_kyc_status := 'PENDING';
  elsif v_review_required_count > 0 then
    v_next_onboarding_status := 'PENDIENTE_REVISION';
    v_review_required := true;
    v_kyc_status := 'HIGH_RISK';
  elsif v_valid_required = v_total_required then
    v_next_onboarding_status := 'PENDIENTE_REVISION';
    v_review_required := false;
    v_kyc_status := 'AUTO_VALIDATED';
  else
    v_next_onboarding_status := 'PENDIENTE_REVISION';
    v_review_required := true;
    v_kyc_status := 'MANUAL_REVIEW';
  end if;

  update public.driver_profiles
  set
    documents_completed = v_documents_completed,
    onboarding_status = case
      when documents_approved = true then onboarding_status
      else v_next_onboarding_status
    end,
    review_required = case
      when documents_approved = true then false
      else v_review_required
    end,
    kyc_status = case
      when documents_approved = true then kyc_status
      else v_kyc_status
    end,
    dni_front_url = coalesce(v_dni_front_ref, dni_front_url),
    dni_back_url = coalesce(v_dni_back_ref, dni_back_url),
    license_front_url = coalesce(v_license_front_ref, license_front_url),
    license_back_url = coalesce(v_license_back_ref, license_back_url),
    vehicle_registration_url = coalesce(v_vehicle_card_front_ref, vehicle_registration_url),
    vehicle_insurance_url = coalesce(v_vehicle_card_back_ref, vehicle_insurance_url),
    selfie_url = coalesce(v_selfie_ref, selfie_url),
    background_check_pending = case
      when documents_approved = true then false
      else not v_has_background_check
    end,
    validation_updated_at = now()
  where user_id = p_user_id;

  return jsonb_build_object(
    'user_id', p_user_id,
    'present_required', v_present_required,
    'total_required', v_total_required,
    'valid_required', v_valid_required,
    'review_required_count', v_review_required_count,
    'rejected_count', v_rejected_count,
    'documents_completed', v_documents_completed,
    'onboarding_status', v_next_onboarding_status,
    'kyc_status', v_kyc_status
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_set_updated_at_address_index()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_sync_driver_profile_from_documents()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid;
begin
  v_user_id := coalesce(new.user_id, old.user_id);

  perform public.sync_driver_profile_from_documents(v_user_id);
  perform public.recalculate_driver_ai_score(v_user_id);

  return coalesce(new, old);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_dispatch_after_viaje_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  PERFORM dispatch_viaje_pro(NEW.id);
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_dispatch_viaje()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.estado = 'DISPONIBLE' THEN
    PERFORM public.expirar_ofertas_vencidas();
    PERFORM public.dispatch_viaje_pro(NEW.id);
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_encolar_dispatch_viaje()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if upper(coalesce(new.estado, '')) in ('PENDIENTE', 'BUSCANDO_CHOFER', 'DISPONIBLE') then
    insert into public.dispatch_queue (
      viaje_id,
      estado,
      prioridad,
      intentos,
      max_intentos,
      available_at,
      motivo
    )
    values (
      new.id,
      'PENDIENTE',
      100,
      0,
      20,
      now(),
      'viaje_nuevo'
    )
    on conflict do nothing;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_flag_dispatch_viaje()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  update viajes
  set
    estado = 'BUSCANDO_CHOFER',
    dispatch_locked = false,
    dispatch_lock_expires_at = null
  where id = new.id;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_reencolar_viaje_disponible()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if upper(coalesce(new.estado, '')) = 'DISPONIBLE'
     and upper(coalesce(old.estado, '')) <> 'DISPONIBLE'
     and new.assigned_driver_id is null then

    insert into public.dispatch_queue (
      viaje_id,
      estado,
      prioridad,
      intentos,
      max_intentos,
      available_at,
      motivo
    )
    values (
      new.id,
      'PENDIENTE',
      90,
      0,
      20,
      now(),
      'viaje_reencolado_por_estado'
    )
    on conflict do nothing;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_verify_identity()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  perform
    net.http_post(
      url := 'https://xrphpqmutvadjrucqicn.supabase.co/functions/v1/svc-verify-provider-identity',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('request.jwt.claim.sub', true)
      ),
      body := jsonb_build_object(
        'provider_id', NEW.provider_id
      )
    );

  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trip_chat_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_trip_eta(p_trip_id uuid, p_driver_eta_min integer DEFAULT NULL::integer, p_pickup_eta_min integer DEFAULT NULL::integer, p_dropoff_eta_min integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_updated boolean := false;
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'trips'
  ) then
    update public.trips
    set
      driver_eta_min = p_driver_eta_min,
      pickup_eta_min = p_pickup_eta_min,
      dropoff_eta_min = p_dropoff_eta_min,
      eta_updated_at = now()
    where id = p_trip_id;

    if found then
      v_updated := true;
    end if;
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'viajes'
  ) then
    update public.viajes
    set
      driver_eta_min = p_driver_eta_min,
      pickup_eta_min = p_pickup_eta_min,
      dropoff_eta_min = p_dropoff_eta_min,
      eta_updated_at = now()
    where id = p_trip_id;

    if found then
      v_updated := true;
    end if;
  end if;

  if not v_updated then
    raise exception 'No se encontró trip/viaje con id=%', p_trip_id;
  end if;

  return jsonb_build_object(
    'exito', true,
    'trip_id', p_trip_id,
    'driver_eta_min', p_driver_eta_min,
    'pickup_eta_min', p_pickup_eta_min,
    'dropoff_eta_min', p_dropoff_eta_min
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
    RETURN NEW;
    END;
    $function$
;

CREATE OR REPLACE FUNCTION public.upsert_address_index(p_normalized_full_query text, p_normalized_street text, p_house_number text, p_locality text, p_province text, p_country text, p_display_name text, p_address jsonb, p_lat double precision, p_lng double precision, p_source text DEFAULT 'user_selection'::text, p_confidence numeric DEFAULT 0.85)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.address_index (
    normalized_full_query,
    normalized_street,
    house_number,
    locality,
    province,
    country,
    display_name,
    address,
    lat,
    lng,
    source,
    confidence,
    usage_count,
    first_used_at,
    last_used_at
  )
  values (
    p_normalized_full_query,
    nullif(p_normalized_street, ''),
    nullif(p_house_number, ''),
    nullif(p_locality, ''),
    coalesce(nullif(p_province, ''), 'cordoba'),
    coalesce(nullif(p_country, ''), 'argentina'),
    p_display_name,
    coalesce(p_address, '{}'::jsonb),
    p_lat,
    p_lng,
    coalesce(nullif(p_source, ''), 'user_selection'),
    coalesce(p_confidence, 0.85),
    1,
    now(),
    now()
  )
  on conflict (
    coalesce(normalized_street, ''),
    coalesce(house_number, ''),
    coalesce(locality, ''),
    round(lat::numeric, 6),
    round(lng::numeric, 6)
  )
  do update set
    normalized_full_query = excluded.normalized_full_query,
    display_name = excluded.display_name,
    address = excluded.address,
    source = excluded.source,
    confidence = greatest(public.address_index.confidence, excluded.confidence),
    usage_count = public.address_index.usage_count + 1,
    last_used_at = now(),
    updated_at = now();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_geocoding_feedback(p_normalized_query text, p_raw_query text, p_display_name text, p_lat numeric, p_lng numeric, p_address jsonb DEFAULT '{}'::jsonb, p_source text DEFAULT 'user_selection'::text, p_client_lat numeric DEFAULT NULL::numeric, p_client_lng numeric DEFAULT NULL::numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  update public.geocoding_feedback
  set
    hit_count = hit_count + 1,
    raw_query = coalesce(p_raw_query, raw_query),
    display_name = p_display_name,
    lat = p_lat,
    lng = p_lng,
    address = coalesce(p_address, address),
    source = coalesce(p_source, source),
    client_lat = coalesce(p_client_lat, client_lat),
    client_lng = coalesce(p_client_lng, client_lng),
    last_used_at = now(),
    updated_at = now()
  where normalized_query = p_normalized_query
    and abs(lat - p_lat) < 0.00001
    and abs(lng - p_lng) < 0.00001;

  if not found then
    insert into public.geocoding_feedback (
      normalized_query,
      raw_query,
      display_name,
      lat,
      lng,
      address,
      source,
      client_lat,
      client_lng,
      last_used_at,
      updated_at
    )
    values (
      p_normalized_query,
      p_raw_query,
      p_display_name,
      p_lat,
      p_lng,
      coalesce(p_address, '{}'::jsonb),
      coalesce(p_source, 'user_selection'),
      p_client_lat,
      p_client_lng,
      now(),
      now()
    );
  end if;
end;
$function$
;

create type "public"."valid_detail" as ("valid" boolean, "reason" character varying, "location" public.geometry);

grant delete on table "public"."admin_users" to "anon";

grant insert on table "public"."admin_users" to "anon";

grant references on table "public"."admin_users" to "anon";

grant select on table "public"."admin_users" to "anon";

grant trigger on table "public"."admin_users" to "anon";

grant truncate on table "public"."admin_users" to "anon";

grant update on table "public"."admin_users" to "anon";

grant delete on table "public"."admin_users" to "authenticated";

grant insert on table "public"."admin_users" to "authenticated";

grant references on table "public"."admin_users" to "authenticated";

grant select on table "public"."admin_users" to "authenticated";

grant trigger on table "public"."admin_users" to "authenticated";

grant truncate on table "public"."admin_users" to "authenticated";

grant update on table "public"."admin_users" to "authenticated";

grant delete on table "public"."admin_users" to "service_role";

grant insert on table "public"."admin_users" to "service_role";

grant references on table "public"."admin_users" to "service_role";

grant select on table "public"."admin_users" to "service_role";

grant trigger on table "public"."admin_users" to "service_role";

grant truncate on table "public"."admin_users" to "service_role";

grant update on table "public"."admin_users" to "service_role";

grant delete on table "public"."audit_logs" to "anon";

grant insert on table "public"."audit_logs" to "anon";

grant references on table "public"."audit_logs" to "anon";

grant select on table "public"."audit_logs" to "anon";

grant trigger on table "public"."audit_logs" to "anon";

grant truncate on table "public"."audit_logs" to "anon";

grant update on table "public"."audit_logs" to "anon";

grant delete on table "public"."audit_logs" to "authenticated";

grant insert on table "public"."audit_logs" to "authenticated";

grant references on table "public"."audit_logs" to "authenticated";

grant select on table "public"."audit_logs" to "authenticated";

grant trigger on table "public"."audit_logs" to "authenticated";

grant truncate on table "public"."audit_logs" to "authenticated";

grant update on table "public"."audit_logs" to "authenticated";

grant delete on table "public"."audit_logs" to "service_role";

grant insert on table "public"."audit_logs" to "service_role";

grant references on table "public"."audit_logs" to "service_role";

grant select on table "public"."audit_logs" to "service_role";

grant trigger on table "public"."audit_logs" to "service_role";

grant truncate on table "public"."audit_logs" to "service_role";

grant update on table "public"."audit_logs" to "service_role";

grant delete on table "public"."cancellation_rules" to "anon";

grant insert on table "public"."cancellation_rules" to "anon";

grant references on table "public"."cancellation_rules" to "anon";

grant select on table "public"."cancellation_rules" to "anon";

grant trigger on table "public"."cancellation_rules" to "anon";

grant truncate on table "public"."cancellation_rules" to "anon";

grant update on table "public"."cancellation_rules" to "anon";

grant delete on table "public"."cancellation_rules" to "authenticated";

grant insert on table "public"."cancellation_rules" to "authenticated";

grant references on table "public"."cancellation_rules" to "authenticated";

grant select on table "public"."cancellation_rules" to "authenticated";

grant trigger on table "public"."cancellation_rules" to "authenticated";

grant truncate on table "public"."cancellation_rules" to "authenticated";

grant update on table "public"."cancellation_rules" to "authenticated";

grant delete on table "public"."cancellation_rules" to "service_role";

grant insert on table "public"."cancellation_rules" to "service_role";

grant references on table "public"."cancellation_rules" to "service_role";

grant select on table "public"."cancellation_rules" to "service_role";

grant trigger on table "public"."cancellation_rules" to "service_role";

grant truncate on table "public"."cancellation_rules" to "service_role";

grant update on table "public"."cancellation_rules" to "service_role";

grant delete on table "public"."choferes" to "anon";

grant insert on table "public"."choferes" to "anon";

grant references on table "public"."choferes" to "anon";

grant select on table "public"."choferes" to "anon";

grant trigger on table "public"."choferes" to "anon";

grant truncate on table "public"."choferes" to "anon";

grant update on table "public"."choferes" to "anon";

grant delete on table "public"."choferes" to "authenticated";

grant insert on table "public"."choferes" to "authenticated";

grant references on table "public"."choferes" to "authenticated";

grant select on table "public"."choferes" to "authenticated";

grant trigger on table "public"."choferes" to "authenticated";

grant truncate on table "public"."choferes" to "authenticated";

grant update on table "public"."choferes" to "authenticated";

grant delete on table "public"."choferes" to "service_role";

grant insert on table "public"."choferes" to "service_role";

grant references on table "public"."choferes" to "service_role";

grant select on table "public"."choferes" to "service_role";

grant trigger on table "public"."choferes" to "service_role";

grant truncate on table "public"."choferes" to "service_role";

grant update on table "public"."choferes" to "service_role";

grant delete on table "public"."commission_rules" to "anon";

grant insert on table "public"."commission_rules" to "anon";

grant references on table "public"."commission_rules" to "anon";

grant select on table "public"."commission_rules" to "anon";

grant trigger on table "public"."commission_rules" to "anon";

grant truncate on table "public"."commission_rules" to "anon";

grant update on table "public"."commission_rules" to "anon";

grant delete on table "public"."commission_rules" to "authenticated";

grant insert on table "public"."commission_rules" to "authenticated";

grant references on table "public"."commission_rules" to "authenticated";

grant select on table "public"."commission_rules" to "authenticated";

grant trigger on table "public"."commission_rules" to "authenticated";

grant truncate on table "public"."commission_rules" to "authenticated";

grant update on table "public"."commission_rules" to "authenticated";

grant delete on table "public"."commission_rules" to "service_role";

grant insert on table "public"."commission_rules" to "service_role";

grant references on table "public"."commission_rules" to "service_role";

grant select on table "public"."commission_rules" to "service_role";

grant trigger on table "public"."commission_rules" to "service_role";

grant truncate on table "public"."commission_rules" to "service_role";

grant update on table "public"."commission_rules" to "service_role";

grant delete on table "public"."consent_ledger" to "anon";

grant insert on table "public"."consent_ledger" to "anon";

grant references on table "public"."consent_ledger" to "anon";

grant select on table "public"."consent_ledger" to "anon";

grant trigger on table "public"."consent_ledger" to "anon";

grant truncate on table "public"."consent_ledger" to "anon";

grant update on table "public"."consent_ledger" to "anon";

grant delete on table "public"."consent_ledger" to "authenticated";

grant insert on table "public"."consent_ledger" to "authenticated";

grant references on table "public"."consent_ledger" to "authenticated";

grant select on table "public"."consent_ledger" to "authenticated";

grant trigger on table "public"."consent_ledger" to "authenticated";

grant truncate on table "public"."consent_ledger" to "authenticated";

grant update on table "public"."consent_ledger" to "authenticated";

grant delete on table "public"."consent_ledger" to "service_role";

grant insert on table "public"."consent_ledger" to "service_role";

grant references on table "public"."consent_ledger" to "service_role";

grant select on table "public"."consent_ledger" to "service_role";

grant trigger on table "public"."consent_ledger" to "service_role";

grant truncate on table "public"."consent_ledger" to "service_role";

grant update on table "public"."consent_ledger" to "service_role";

grant delete on table "public"."cotizaciones" to "anon";

grant insert on table "public"."cotizaciones" to "anon";

grant references on table "public"."cotizaciones" to "anon";

grant select on table "public"."cotizaciones" to "anon";

grant trigger on table "public"."cotizaciones" to "anon";

grant truncate on table "public"."cotizaciones" to "anon";

grant update on table "public"."cotizaciones" to "anon";

grant delete on table "public"."cotizaciones" to "authenticated";

grant insert on table "public"."cotizaciones" to "authenticated";

grant references on table "public"."cotizaciones" to "authenticated";

grant select on table "public"."cotizaciones" to "authenticated";

grant trigger on table "public"."cotizaciones" to "authenticated";

grant truncate on table "public"."cotizaciones" to "authenticated";

grant update on table "public"."cotizaciones" to "authenticated";

grant delete on table "public"."cotizaciones" to "service_role";

grant insert on table "public"."cotizaciones" to "service_role";

grant references on table "public"."cotizaciones" to "service_role";

grant select on table "public"."cotizaciones" to "service_role";

grant trigger on table "public"."cotizaciones" to "service_role";

grant truncate on table "public"."cotizaciones" to "service_role";

grant update on table "public"."cotizaciones" to "service_role";

grant delete on table "public"."document_hashes" to "anon";

grant insert on table "public"."document_hashes" to "anon";

grant references on table "public"."document_hashes" to "anon";

grant select on table "public"."document_hashes" to "anon";

grant trigger on table "public"."document_hashes" to "anon";

grant truncate on table "public"."document_hashes" to "anon";

grant update on table "public"."document_hashes" to "anon";

grant delete on table "public"."document_hashes" to "authenticated";

grant insert on table "public"."document_hashes" to "authenticated";

grant references on table "public"."document_hashes" to "authenticated";

grant select on table "public"."document_hashes" to "authenticated";

grant trigger on table "public"."document_hashes" to "authenticated";

grant truncate on table "public"."document_hashes" to "authenticated";

grant update on table "public"."document_hashes" to "authenticated";

grant delete on table "public"."document_hashes" to "service_role";

grant insert on table "public"."document_hashes" to "service_role";

grant references on table "public"."document_hashes" to "service_role";

grant select on table "public"."document_hashes" to "service_role";

grant trigger on table "public"."document_hashes" to "service_role";

grant truncate on table "public"."document_hashes" to "service_role";

grant update on table "public"."document_hashes" to "service_role";

grant delete on table "public"."driver_documents" to "anon";

grant insert on table "public"."driver_documents" to "anon";

grant references on table "public"."driver_documents" to "anon";

grant select on table "public"."driver_documents" to "anon";

grant trigger on table "public"."driver_documents" to "anon";

grant truncate on table "public"."driver_documents" to "anon";

grant update on table "public"."driver_documents" to "anon";

grant delete on table "public"."driver_documents" to "authenticated";

grant insert on table "public"."driver_documents" to "authenticated";

grant references on table "public"."driver_documents" to "authenticated";

grant select on table "public"."driver_documents" to "authenticated";

grant trigger on table "public"."driver_documents" to "authenticated";

grant truncate on table "public"."driver_documents" to "authenticated";

grant update on table "public"."driver_documents" to "authenticated";

grant delete on table "public"."driver_documents" to "service_role";

grant insert on table "public"."driver_documents" to "service_role";

grant references on table "public"."driver_documents" to "service_role";

grant select on table "public"."driver_documents" to "service_role";

grant trigger on table "public"."driver_documents" to "service_role";

grant truncate on table "public"."driver_documents" to "service_role";

grant update on table "public"."driver_documents" to "service_role";

grant delete on table "public"."driver_profiles" to "anon";

grant insert on table "public"."driver_profiles" to "anon";

grant references on table "public"."driver_profiles" to "anon";

grant select on table "public"."driver_profiles" to "anon";

grant trigger on table "public"."driver_profiles" to "anon";

grant truncate on table "public"."driver_profiles" to "anon";

grant update on table "public"."driver_profiles" to "anon";

grant delete on table "public"."driver_profiles" to "authenticated";

grant insert on table "public"."driver_profiles" to "authenticated";

grant references on table "public"."driver_profiles" to "authenticated";

grant select on table "public"."driver_profiles" to "authenticated";

grant trigger on table "public"."driver_profiles" to "authenticated";

grant truncate on table "public"."driver_profiles" to "authenticated";

grant update on table "public"."driver_profiles" to "authenticated";

grant delete on table "public"."driver_profiles" to "service_role";

grant insert on table "public"."driver_profiles" to "service_role";

grant references on table "public"."driver_profiles" to "service_role";

grant select on table "public"."driver_profiles" to "service_role";

grant trigger on table "public"."driver_profiles" to "service_role";

grant truncate on table "public"."driver_profiles" to "service_role";

grant update on table "public"."driver_profiles" to "service_role";

grant delete on table "public"."legal_acceptances" to "anon";

grant insert on table "public"."legal_acceptances" to "anon";

grant references on table "public"."legal_acceptances" to "anon";

grant select on table "public"."legal_acceptances" to "anon";

grant trigger on table "public"."legal_acceptances" to "anon";

grant truncate on table "public"."legal_acceptances" to "anon";

grant update on table "public"."legal_acceptances" to "anon";

grant delete on table "public"."legal_acceptances" to "authenticated";

grant insert on table "public"."legal_acceptances" to "authenticated";

grant references on table "public"."legal_acceptances" to "authenticated";

grant select on table "public"."legal_acceptances" to "authenticated";

grant trigger on table "public"."legal_acceptances" to "authenticated";

grant truncate on table "public"."legal_acceptances" to "authenticated";

grant update on table "public"."legal_acceptances" to "authenticated";

grant delete on table "public"."legal_acceptances" to "service_role";

grant insert on table "public"."legal_acceptances" to "service_role";

grant references on table "public"."legal_acceptances" to "service_role";

grant select on table "public"."legal_acceptances" to "service_role";

grant trigger on table "public"."legal_acceptances" to "service_role";

grant truncate on table "public"."legal_acceptances" to "service_role";

grant update on table "public"."legal_acceptances" to "service_role";

grant delete on table "public"."legal_documents" to "anon";

grant insert on table "public"."legal_documents" to "anon";

grant references on table "public"."legal_documents" to "anon";

grant select on table "public"."legal_documents" to "anon";

grant trigger on table "public"."legal_documents" to "anon";

grant truncate on table "public"."legal_documents" to "anon";

grant update on table "public"."legal_documents" to "anon";

grant delete on table "public"."legal_documents" to "authenticated";

grant insert on table "public"."legal_documents" to "authenticated";

grant references on table "public"."legal_documents" to "authenticated";

grant select on table "public"."legal_documents" to "authenticated";

grant trigger on table "public"."legal_documents" to "authenticated";

grant truncate on table "public"."legal_documents" to "authenticated";

grant update on table "public"."legal_documents" to "authenticated";

grant delete on table "public"."legal_documents" to "service_role";

grant insert on table "public"."legal_documents" to "service_role";

grant references on table "public"."legal_documents" to "service_role";

grant select on table "public"."legal_documents" to "service_role";

grant trigger on table "public"."legal_documents" to "service_role";

grant truncate on table "public"."legal_documents" to "service_role";

grant update on table "public"."legal_documents" to "service_role";

grant delete on table "public"."legal_versions" to "anon";

grant insert on table "public"."legal_versions" to "anon";

grant references on table "public"."legal_versions" to "anon";

grant select on table "public"."legal_versions" to "anon";

grant trigger on table "public"."legal_versions" to "anon";

grant truncate on table "public"."legal_versions" to "anon";

grant update on table "public"."legal_versions" to "anon";

grant delete on table "public"."legal_versions" to "authenticated";

grant insert on table "public"."legal_versions" to "authenticated";

grant references on table "public"."legal_versions" to "authenticated";

grant select on table "public"."legal_versions" to "authenticated";

grant trigger on table "public"."legal_versions" to "authenticated";

grant truncate on table "public"."legal_versions" to "authenticated";

grant update on table "public"."legal_versions" to "authenticated";

grant delete on table "public"."legal_versions" to "service_role";

grant insert on table "public"."legal_versions" to "service_role";

grant references on table "public"."legal_versions" to "service_role";

grant select on table "public"."legal_versions" to "service_role";

grant trigger on table "public"."legal_versions" to "service_role";

grant truncate on table "public"."legal_versions" to "service_role";

grant update on table "public"."legal_versions" to "service_role";

grant delete on table "public"."pagos" to "anon";

grant insert on table "public"."pagos" to "anon";

grant references on table "public"."pagos" to "anon";

grant select on table "public"."pagos" to "anon";

grant trigger on table "public"."pagos" to "anon";

grant truncate on table "public"."pagos" to "anon";

grant update on table "public"."pagos" to "anon";

grant delete on table "public"."pagos" to "authenticated";

grant insert on table "public"."pagos" to "authenticated";

grant references on table "public"."pagos" to "authenticated";

grant select on table "public"."pagos" to "authenticated";

grant trigger on table "public"."pagos" to "authenticated";

grant truncate on table "public"."pagos" to "authenticated";

grant update on table "public"."pagos" to "authenticated";

grant delete on table "public"."pagos" to "service_role";

grant insert on table "public"."pagos" to "service_role";

grant references on table "public"."pagos" to "service_role";

grant select on table "public"."pagos" to "service_role";

grant trigger on table "public"."pagos" to "service_role";

grant truncate on table "public"."pagos" to "service_role";

grant update on table "public"."pagos" to "service_role";

grant delete on table "public"."payment_events" to "anon";

grant insert on table "public"."payment_events" to "anon";

grant references on table "public"."payment_events" to "anon";

grant select on table "public"."payment_events" to "anon";

grant trigger on table "public"."payment_events" to "anon";

grant truncate on table "public"."payment_events" to "anon";

grant update on table "public"."payment_events" to "anon";

grant delete on table "public"."payment_events" to "authenticated";

grant insert on table "public"."payment_events" to "authenticated";

grant references on table "public"."payment_events" to "authenticated";

grant select on table "public"."payment_events" to "authenticated";

grant trigger on table "public"."payment_events" to "authenticated";

grant truncate on table "public"."payment_events" to "authenticated";

grant update on table "public"."payment_events" to "authenticated";

grant delete on table "public"."payment_events" to "service_role";

grant insert on table "public"."payment_events" to "service_role";

grant references on table "public"."payment_events" to "service_role";

grant select on table "public"."payment_events" to "service_role";

grant trigger on table "public"."payment_events" to "service_role";

grant truncate on table "public"."payment_events" to "service_role";

grant update on table "public"."payment_events" to "service_role";

grant delete on table "public"."payments" to "anon";

grant insert on table "public"."payments" to "anon";

grant references on table "public"."payments" to "anon";

grant select on table "public"."payments" to "anon";

grant trigger on table "public"."payments" to "anon";

grant truncate on table "public"."payments" to "anon";

grant update on table "public"."payments" to "anon";

grant delete on table "public"."payments" to "authenticated";

grant insert on table "public"."payments" to "authenticated";

grant references on table "public"."payments" to "authenticated";

grant select on table "public"."payments" to "authenticated";

grant trigger on table "public"."payments" to "authenticated";

grant truncate on table "public"."payments" to "authenticated";

grant update on table "public"."payments" to "authenticated";

grant delete on table "public"."payments" to "service_role";

grant insert on table "public"."payments" to "service_role";

grant references on table "public"."payments" to "service_role";

grant select on table "public"."payments" to "service_role";

grant trigger on table "public"."payments" to "service_role";

grant truncate on table "public"."payments" to "service_role";

grant update on table "public"."payments" to "service_role";

grant delete on table "public"."push_tokens" to "anon";

grant insert on table "public"."push_tokens" to "anon";

grant references on table "public"."push_tokens" to "anon";

grant select on table "public"."push_tokens" to "anon";

grant trigger on table "public"."push_tokens" to "anon";

grant truncate on table "public"."push_tokens" to "anon";

grant update on table "public"."push_tokens" to "anon";

grant delete on table "public"."push_tokens" to "authenticated";

grant insert on table "public"."push_tokens" to "authenticated";

grant references on table "public"."push_tokens" to "authenticated";

grant select on table "public"."push_tokens" to "authenticated";

grant trigger on table "public"."push_tokens" to "authenticated";

grant truncate on table "public"."push_tokens" to "authenticated";

grant update on table "public"."push_tokens" to "authenticated";

grant delete on table "public"."push_tokens" to "service_role";

grant insert on table "public"."push_tokens" to "service_role";

grant references on table "public"."push_tokens" to "service_role";

grant select on table "public"."push_tokens" to "service_role";

grant trigger on table "public"."push_tokens" to "service_role";

grant truncate on table "public"."push_tokens" to "service_role";

grant update on table "public"."push_tokens" to "service_role";

grant delete on table "public"."refunds" to "anon";

grant insert on table "public"."refunds" to "anon";

grant references on table "public"."refunds" to "anon";

grant select on table "public"."refunds" to "anon";

grant trigger on table "public"."refunds" to "anon";

grant truncate on table "public"."refunds" to "anon";

grant update on table "public"."refunds" to "anon";

grant delete on table "public"."refunds" to "authenticated";

grant insert on table "public"."refunds" to "authenticated";

grant references on table "public"."refunds" to "authenticated";

grant select on table "public"."refunds" to "authenticated";

grant trigger on table "public"."refunds" to "authenticated";

grant truncate on table "public"."refunds" to "authenticated";

grant update on table "public"."refunds" to "authenticated";

grant delete on table "public"."refunds" to "service_role";

grant insert on table "public"."refunds" to "service_role";

grant references on table "public"."refunds" to "service_role";

grant select on table "public"."refunds" to "service_role";

grant trigger on table "public"."refunds" to "service_role";

grant truncate on table "public"."refunds" to "service_role";

grant update on table "public"."refunds" to "service_role";

grant delete on table "public"."settlements" to "anon";

grant insert on table "public"."settlements" to "anon";

grant references on table "public"."settlements" to "anon";

grant select on table "public"."settlements" to "anon";

grant trigger on table "public"."settlements" to "anon";

grant truncate on table "public"."settlements" to "anon";

grant update on table "public"."settlements" to "anon";

grant delete on table "public"."settlements" to "authenticated";

grant insert on table "public"."settlements" to "authenticated";

grant references on table "public"."settlements" to "authenticated";

grant select on table "public"."settlements" to "authenticated";

grant trigger on table "public"."settlements" to "authenticated";

grant truncate on table "public"."settlements" to "authenticated";

grant update on table "public"."settlements" to "authenticated";

grant delete on table "public"."settlements" to "service_role";

grant insert on table "public"."settlements" to "service_role";

grant references on table "public"."settlements" to "service_role";

grant select on table "public"."settlements" to "service_role";

grant trigger on table "public"."settlements" to "service_role";

grant truncate on table "public"."settlements" to "service_role";

grant update on table "public"."settlements" to "service_role";

grant delete on table "public"."spatial_ref_sys" to "anon";

grant insert on table "public"."spatial_ref_sys" to "anon";

grant references on table "public"."spatial_ref_sys" to "anon";

grant select on table "public"."spatial_ref_sys" to "anon";

grant trigger on table "public"."spatial_ref_sys" to "anon";

grant truncate on table "public"."spatial_ref_sys" to "anon";

grant update on table "public"."spatial_ref_sys" to "anon";

grant delete on table "public"."spatial_ref_sys" to "authenticated";

grant insert on table "public"."spatial_ref_sys" to "authenticated";

grant references on table "public"."spatial_ref_sys" to "authenticated";

grant select on table "public"."spatial_ref_sys" to "authenticated";

grant trigger on table "public"."spatial_ref_sys" to "authenticated";

grant truncate on table "public"."spatial_ref_sys" to "authenticated";

grant update on table "public"."spatial_ref_sys" to "authenticated";

grant delete on table "public"."spatial_ref_sys" to "postgres";

grant insert on table "public"."spatial_ref_sys" to "postgres";

grant references on table "public"."spatial_ref_sys" to "postgres";

grant select on table "public"."spatial_ref_sys" to "postgres";

grant trigger on table "public"."spatial_ref_sys" to "postgres";

grant truncate on table "public"."spatial_ref_sys" to "postgres";

grant update on table "public"."spatial_ref_sys" to "postgres";

grant delete on table "public"."spatial_ref_sys" to "service_role";

grant insert on table "public"."spatial_ref_sys" to "service_role";

grant references on table "public"."spatial_ref_sys" to "service_role";

grant select on table "public"."spatial_ref_sys" to "service_role";

grant trigger on table "public"."spatial_ref_sys" to "service_role";

grant truncate on table "public"."spatial_ref_sys" to "service_role";

grant update on table "public"."spatial_ref_sys" to "service_role";

grant delete on table "public"."svc_assignments" to "anon";

grant insert on table "public"."svc_assignments" to "anon";

grant references on table "public"."svc_assignments" to "anon";

grant select on table "public"."svc_assignments" to "anon";

grant trigger on table "public"."svc_assignments" to "anon";

grant truncate on table "public"."svc_assignments" to "anon";

grant update on table "public"."svc_assignments" to "anon";

grant delete on table "public"."svc_assignments" to "authenticated";

grant insert on table "public"."svc_assignments" to "authenticated";

grant references on table "public"."svc_assignments" to "authenticated";

grant select on table "public"."svc_assignments" to "authenticated";

grant trigger on table "public"."svc_assignments" to "authenticated";

grant truncate on table "public"."svc_assignments" to "authenticated";

grant update on table "public"."svc_assignments" to "authenticated";

grant delete on table "public"."svc_assignments" to "service_role";

grant insert on table "public"."svc_assignments" to "service_role";

grant references on table "public"."svc_assignments" to "service_role";

grant select on table "public"."svc_assignments" to "service_role";

grant trigger on table "public"."svc_assignments" to "service_role";

grant truncate on table "public"."svc_assignments" to "service_role";

grant update on table "public"."svc_assignments" to "service_role";

grant delete on table "public"."svc_categories" to "anon";

grant insert on table "public"."svc_categories" to "anon";

grant references on table "public"."svc_categories" to "anon";

grant select on table "public"."svc_categories" to "anon";

grant trigger on table "public"."svc_categories" to "anon";

grant truncate on table "public"."svc_categories" to "anon";

grant update on table "public"."svc_categories" to "anon";

grant delete on table "public"."svc_categories" to "authenticated";

grant insert on table "public"."svc_categories" to "authenticated";

grant references on table "public"."svc_categories" to "authenticated";

grant select on table "public"."svc_categories" to "authenticated";

grant trigger on table "public"."svc_categories" to "authenticated";

grant truncate on table "public"."svc_categories" to "authenticated";

grant update on table "public"."svc_categories" to "authenticated";

grant delete on table "public"."svc_categories" to "service_role";

grant insert on table "public"."svc_categories" to "service_role";

grant references on table "public"."svc_categories" to "service_role";

grant select on table "public"."svc_categories" to "service_role";

grant trigger on table "public"."svc_categories" to "service_role";

grant truncate on table "public"."svc_categories" to "service_role";

grant update on table "public"."svc_categories" to "service_role";

grant delete on table "public"."svc_conversations" to "anon";

grant insert on table "public"."svc_conversations" to "anon";

grant references on table "public"."svc_conversations" to "anon";

grant select on table "public"."svc_conversations" to "anon";

grant trigger on table "public"."svc_conversations" to "anon";

grant truncate on table "public"."svc_conversations" to "anon";

grant update on table "public"."svc_conversations" to "anon";

grant delete on table "public"."svc_conversations" to "authenticated";

grant insert on table "public"."svc_conversations" to "authenticated";

grant references on table "public"."svc_conversations" to "authenticated";

grant select on table "public"."svc_conversations" to "authenticated";

grant trigger on table "public"."svc_conversations" to "authenticated";

grant truncate on table "public"."svc_conversations" to "authenticated";

grant update on table "public"."svc_conversations" to "authenticated";

grant delete on table "public"."svc_conversations" to "service_role";

grant insert on table "public"."svc_conversations" to "service_role";

grant references on table "public"."svc_conversations" to "service_role";

grant select on table "public"."svc_conversations" to "service_role";

grant trigger on table "public"."svc_conversations" to "service_role";

grant truncate on table "public"."svc_conversations" to "service_role";

grant update on table "public"."svc_conversations" to "service_role";

grant delete on table "public"."svc_escrow_holds" to "anon";

grant insert on table "public"."svc_escrow_holds" to "anon";

grant references on table "public"."svc_escrow_holds" to "anon";

grant select on table "public"."svc_escrow_holds" to "anon";

grant trigger on table "public"."svc_escrow_holds" to "anon";

grant truncate on table "public"."svc_escrow_holds" to "anon";

grant update on table "public"."svc_escrow_holds" to "anon";

grant delete on table "public"."svc_escrow_holds" to "authenticated";

grant insert on table "public"."svc_escrow_holds" to "authenticated";

grant references on table "public"."svc_escrow_holds" to "authenticated";

grant select on table "public"."svc_escrow_holds" to "authenticated";

grant trigger on table "public"."svc_escrow_holds" to "authenticated";

grant truncate on table "public"."svc_escrow_holds" to "authenticated";

grant update on table "public"."svc_escrow_holds" to "authenticated";

grant delete on table "public"."svc_escrow_holds" to "service_role";

grant insert on table "public"."svc_escrow_holds" to "service_role";

grant references on table "public"."svc_escrow_holds" to "service_role";

grant select on table "public"."svc_escrow_holds" to "service_role";

grant trigger on table "public"."svc_escrow_holds" to "service_role";

grant truncate on table "public"."svc_escrow_holds" to "service_role";

grant update on table "public"."svc_escrow_holds" to "service_role";

grant delete on table "public"."svc_financial_ledger" to "anon";

grant insert on table "public"."svc_financial_ledger" to "anon";

grant references on table "public"."svc_financial_ledger" to "anon";

grant select on table "public"."svc_financial_ledger" to "anon";

grant trigger on table "public"."svc_financial_ledger" to "anon";

grant truncate on table "public"."svc_financial_ledger" to "anon";

grant update on table "public"."svc_financial_ledger" to "anon";

grant delete on table "public"."svc_financial_ledger" to "authenticated";

grant insert on table "public"."svc_financial_ledger" to "authenticated";

grant references on table "public"."svc_financial_ledger" to "authenticated";

grant select on table "public"."svc_financial_ledger" to "authenticated";

grant trigger on table "public"."svc_financial_ledger" to "authenticated";

grant truncate on table "public"."svc_financial_ledger" to "authenticated";

grant update on table "public"."svc_financial_ledger" to "authenticated";

grant delete on table "public"."svc_financial_ledger" to "service_role";

grant insert on table "public"."svc_financial_ledger" to "service_role";

grant references on table "public"."svc_financial_ledger" to "service_role";

grant select on table "public"."svc_financial_ledger" to "service_role";

grant trigger on table "public"."svc_financial_ledger" to "service_role";

grant truncate on table "public"."svc_financial_ledger" to "service_role";

grant update on table "public"."svc_financial_ledger" to "service_role";

grant delete on table "public"."svc_idempotency_keys" to "anon";

grant insert on table "public"."svc_idempotency_keys" to "anon";

grant references on table "public"."svc_idempotency_keys" to "anon";

grant select on table "public"."svc_idempotency_keys" to "anon";

grant trigger on table "public"."svc_idempotency_keys" to "anon";

grant truncate on table "public"."svc_idempotency_keys" to "anon";

grant update on table "public"."svc_idempotency_keys" to "anon";

grant delete on table "public"."svc_idempotency_keys" to "authenticated";

grant insert on table "public"."svc_idempotency_keys" to "authenticated";

grant references on table "public"."svc_idempotency_keys" to "authenticated";

grant select on table "public"."svc_idempotency_keys" to "authenticated";

grant trigger on table "public"."svc_idempotency_keys" to "authenticated";

grant truncate on table "public"."svc_idempotency_keys" to "authenticated";

grant update on table "public"."svc_idempotency_keys" to "authenticated";

grant delete on table "public"."svc_idempotency_keys" to "service_role";

grant insert on table "public"."svc_idempotency_keys" to "service_role";

grant references on table "public"."svc_idempotency_keys" to "service_role";

grant select on table "public"."svc_idempotency_keys" to "service_role";

grant trigger on table "public"."svc_idempotency_keys" to "service_role";

grant truncate on table "public"."svc_idempotency_keys" to "service_role";

grant update on table "public"."svc_idempotency_keys" to "service_role";

grant delete on table "public"."svc_messages" to "anon";

grant insert on table "public"."svc_messages" to "anon";

grant references on table "public"."svc_messages" to "anon";

grant select on table "public"."svc_messages" to "anon";

grant trigger on table "public"."svc_messages" to "anon";

grant truncate on table "public"."svc_messages" to "anon";

grant update on table "public"."svc_messages" to "anon";

grant delete on table "public"."svc_messages" to "authenticated";

grant insert on table "public"."svc_messages" to "authenticated";

grant references on table "public"."svc_messages" to "authenticated";

grant select on table "public"."svc_messages" to "authenticated";

grant trigger on table "public"."svc_messages" to "authenticated";

grant truncate on table "public"."svc_messages" to "authenticated";

grant update on table "public"."svc_messages" to "authenticated";

grant delete on table "public"."svc_messages" to "service_role";

grant insert on table "public"."svc_messages" to "service_role";

grant references on table "public"."svc_messages" to "service_role";

grant select on table "public"."svc_messages" to "service_role";

grant trigger on table "public"."svc_messages" to "service_role";

grant truncate on table "public"."svc_messages" to "service_role";

grant update on table "public"."svc_messages" to "service_role";

grant delete on table "public"."svc_notification_deliveries" to "anon";

grant insert on table "public"."svc_notification_deliveries" to "anon";

grant references on table "public"."svc_notification_deliveries" to "anon";

grant select on table "public"."svc_notification_deliveries" to "anon";

grant trigger on table "public"."svc_notification_deliveries" to "anon";

grant truncate on table "public"."svc_notification_deliveries" to "anon";

grant update on table "public"."svc_notification_deliveries" to "anon";

grant delete on table "public"."svc_notification_deliveries" to "authenticated";

grant insert on table "public"."svc_notification_deliveries" to "authenticated";

grant references on table "public"."svc_notification_deliveries" to "authenticated";

grant select on table "public"."svc_notification_deliveries" to "authenticated";

grant trigger on table "public"."svc_notification_deliveries" to "authenticated";

grant truncate on table "public"."svc_notification_deliveries" to "authenticated";

grant update on table "public"."svc_notification_deliveries" to "authenticated";

grant delete on table "public"."svc_notification_deliveries" to "service_role";

grant insert on table "public"."svc_notification_deliveries" to "service_role";

grant references on table "public"."svc_notification_deliveries" to "service_role";

grant select on table "public"."svc_notification_deliveries" to "service_role";

grant trigger on table "public"."svc_notification_deliveries" to "service_role";

grant truncate on table "public"."svc_notification_deliveries" to "service_role";

grant update on table "public"."svc_notification_deliveries" to "service_role";

grant delete on table "public"."svc_notifications" to "anon";

grant insert on table "public"."svc_notifications" to "anon";

grant references on table "public"."svc_notifications" to "anon";

grant select on table "public"."svc_notifications" to "anon";

grant trigger on table "public"."svc_notifications" to "anon";

grant truncate on table "public"."svc_notifications" to "anon";

grant update on table "public"."svc_notifications" to "anon";

grant delete on table "public"."svc_notifications" to "authenticated";

grant insert on table "public"."svc_notifications" to "authenticated";

grant references on table "public"."svc_notifications" to "authenticated";

grant select on table "public"."svc_notifications" to "authenticated";

grant trigger on table "public"."svc_notifications" to "authenticated";

grant truncate on table "public"."svc_notifications" to "authenticated";

grant update on table "public"."svc_notifications" to "authenticated";

grant delete on table "public"."svc_notifications" to "service_role";

grant insert on table "public"."svc_notifications" to "service_role";

grant references on table "public"."svc_notifications" to "service_role";

grant select on table "public"."svc_notifications" to "service_role";

grant trigger on table "public"."svc_notifications" to "service_role";

grant truncate on table "public"."svc_notifications" to "service_role";

grant update on table "public"."svc_notifications" to "service_role";

grant delete on table "public"."svc_payment_intents" to "anon";

grant insert on table "public"."svc_payment_intents" to "anon";

grant references on table "public"."svc_payment_intents" to "anon";

grant select on table "public"."svc_payment_intents" to "anon";

grant trigger on table "public"."svc_payment_intents" to "anon";

grant truncate on table "public"."svc_payment_intents" to "anon";

grant update on table "public"."svc_payment_intents" to "anon";

grant delete on table "public"."svc_payment_intents" to "authenticated";

grant insert on table "public"."svc_payment_intents" to "authenticated";

grant references on table "public"."svc_payment_intents" to "authenticated";

grant select on table "public"."svc_payment_intents" to "authenticated";

grant trigger on table "public"."svc_payment_intents" to "authenticated";

grant truncate on table "public"."svc_payment_intents" to "authenticated";

grant update on table "public"."svc_payment_intents" to "authenticated";

grant delete on table "public"."svc_payment_intents" to "service_role";

grant insert on table "public"."svc_payment_intents" to "service_role";

grant references on table "public"."svc_payment_intents" to "service_role";

grant select on table "public"."svc_payment_intents" to "service_role";

grant trigger on table "public"."svc_payment_intents" to "service_role";

grant truncate on table "public"."svc_payment_intents" to "service_role";

grant update on table "public"."svc_payment_intents" to "service_role";

grant delete on table "public"."svc_platform_config" to "anon";

grant insert on table "public"."svc_platform_config" to "anon";

grant references on table "public"."svc_platform_config" to "anon";

grant select on table "public"."svc_platform_config" to "anon";

grant trigger on table "public"."svc_platform_config" to "anon";

grant truncate on table "public"."svc_platform_config" to "anon";

grant update on table "public"."svc_platform_config" to "anon";

grant delete on table "public"."svc_platform_config" to "authenticated";

grant insert on table "public"."svc_platform_config" to "authenticated";

grant references on table "public"."svc_platform_config" to "authenticated";

grant select on table "public"."svc_platform_config" to "authenticated";

grant trigger on table "public"."svc_platform_config" to "authenticated";

grant truncate on table "public"."svc_platform_config" to "authenticated";

grant update on table "public"."svc_platform_config" to "authenticated";

grant delete on table "public"."svc_platform_config" to "service_role";

grant insert on table "public"."svc_platform_config" to "service_role";

grant references on table "public"."svc_platform_config" to "service_role";

grant select on table "public"."svc_platform_config" to "service_role";

grant trigger on table "public"."svc_platform_config" to "service_role";

grant truncate on table "public"."svc_platform_config" to "service_role";

grant update on table "public"."svc_platform_config" to "service_role";

grant delete on table "public"."svc_provider_availability" to "anon";

grant insert on table "public"."svc_provider_availability" to "anon";

grant references on table "public"."svc_provider_availability" to "anon";

grant select on table "public"."svc_provider_availability" to "anon";

grant trigger on table "public"."svc_provider_availability" to "anon";

grant truncate on table "public"."svc_provider_availability" to "anon";

grant update on table "public"."svc_provider_availability" to "anon";

grant delete on table "public"."svc_provider_availability" to "authenticated";

grant insert on table "public"."svc_provider_availability" to "authenticated";

grant references on table "public"."svc_provider_availability" to "authenticated";

grant select on table "public"."svc_provider_availability" to "authenticated";

grant trigger on table "public"."svc_provider_availability" to "authenticated";

grant truncate on table "public"."svc_provider_availability" to "authenticated";

grant update on table "public"."svc_provider_availability" to "authenticated";

grant delete on table "public"."svc_provider_availability" to "service_role";

grant insert on table "public"."svc_provider_availability" to "service_role";

grant references on table "public"."svc_provider_availability" to "service_role";

grant select on table "public"."svc_provider_availability" to "service_role";

grant trigger on table "public"."svc_provider_availability" to "service_role";

grant truncate on table "public"."svc_provider_availability" to "service_role";

grant update on table "public"."svc_provider_availability" to "service_role";

grant delete on table "public"."svc_provider_categories" to "anon";

grant insert on table "public"."svc_provider_categories" to "anon";

grant references on table "public"."svc_provider_categories" to "anon";

grant select on table "public"."svc_provider_categories" to "anon";

grant trigger on table "public"."svc_provider_categories" to "anon";

grant truncate on table "public"."svc_provider_categories" to "anon";

grant update on table "public"."svc_provider_categories" to "anon";

grant delete on table "public"."svc_provider_categories" to "authenticated";

grant insert on table "public"."svc_provider_categories" to "authenticated";

grant references on table "public"."svc_provider_categories" to "authenticated";

grant select on table "public"."svc_provider_categories" to "authenticated";

grant trigger on table "public"."svc_provider_categories" to "authenticated";

grant truncate on table "public"."svc_provider_categories" to "authenticated";

grant update on table "public"."svc_provider_categories" to "authenticated";

grant delete on table "public"."svc_provider_categories" to "service_role";

grant insert on table "public"."svc_provider_categories" to "service_role";

grant references on table "public"."svc_provider_categories" to "service_role";

grant select on table "public"."svc_provider_categories" to "service_role";

grant trigger on table "public"."svc_provider_categories" to "service_role";

grant truncate on table "public"."svc_provider_categories" to "service_role";

grant update on table "public"."svc_provider_categories" to "service_role";

grant delete on table "public"."svc_provider_documents" to "anon";

grant insert on table "public"."svc_provider_documents" to "anon";

grant references on table "public"."svc_provider_documents" to "anon";

grant select on table "public"."svc_provider_documents" to "anon";

grant trigger on table "public"."svc_provider_documents" to "anon";

grant truncate on table "public"."svc_provider_documents" to "anon";

grant update on table "public"."svc_provider_documents" to "anon";

grant delete on table "public"."svc_provider_documents" to "authenticated";

grant insert on table "public"."svc_provider_documents" to "authenticated";

grant references on table "public"."svc_provider_documents" to "authenticated";

grant select on table "public"."svc_provider_documents" to "authenticated";

grant trigger on table "public"."svc_provider_documents" to "authenticated";

grant truncate on table "public"."svc_provider_documents" to "authenticated";

grant update on table "public"."svc_provider_documents" to "authenticated";

grant delete on table "public"."svc_provider_documents" to "service_role";

grant insert on table "public"."svc_provider_documents" to "service_role";

grant references on table "public"."svc_provider_documents" to "service_role";

grant select on table "public"."svc_provider_documents" to "service_role";

grant trigger on table "public"."svc_provider_documents" to "service_role";

grant truncate on table "public"."svc_provider_documents" to "service_role";

grant update on table "public"."svc_provider_documents" to "service_role";

grant delete on table "public"."svc_provider_identity_checks" to "anon";

grant insert on table "public"."svc_provider_identity_checks" to "anon";

grant references on table "public"."svc_provider_identity_checks" to "anon";

grant select on table "public"."svc_provider_identity_checks" to "anon";

grant trigger on table "public"."svc_provider_identity_checks" to "anon";

grant truncate on table "public"."svc_provider_identity_checks" to "anon";

grant update on table "public"."svc_provider_identity_checks" to "anon";

grant delete on table "public"."svc_provider_identity_checks" to "authenticated";

grant insert on table "public"."svc_provider_identity_checks" to "authenticated";

grant references on table "public"."svc_provider_identity_checks" to "authenticated";

grant select on table "public"."svc_provider_identity_checks" to "authenticated";

grant trigger on table "public"."svc_provider_identity_checks" to "authenticated";

grant truncate on table "public"."svc_provider_identity_checks" to "authenticated";

grant update on table "public"."svc_provider_identity_checks" to "authenticated";

grant delete on table "public"."svc_provider_identity_checks" to "service_role";

grant insert on table "public"."svc_provider_identity_checks" to "service_role";

grant references on table "public"."svc_provider_identity_checks" to "service_role";

grant select on table "public"."svc_provider_identity_checks" to "service_role";

grant trigger on table "public"."svc_provider_identity_checks" to "service_role";

grant truncate on table "public"."svc_provider_identity_checks" to "service_role";

grant update on table "public"."svc_provider_identity_checks" to "service_role";

grant delete on table "public"."svc_provider_pricing" to "anon";

grant insert on table "public"."svc_provider_pricing" to "anon";

grant references on table "public"."svc_provider_pricing" to "anon";

grant select on table "public"."svc_provider_pricing" to "anon";

grant trigger on table "public"."svc_provider_pricing" to "anon";

grant truncate on table "public"."svc_provider_pricing" to "anon";

grant update on table "public"."svc_provider_pricing" to "anon";

grant delete on table "public"."svc_provider_pricing" to "authenticated";

grant insert on table "public"."svc_provider_pricing" to "authenticated";

grant references on table "public"."svc_provider_pricing" to "authenticated";

grant select on table "public"."svc_provider_pricing" to "authenticated";

grant trigger on table "public"."svc_provider_pricing" to "authenticated";

grant truncate on table "public"."svc_provider_pricing" to "authenticated";

grant update on table "public"."svc_provider_pricing" to "authenticated";

grant delete on table "public"."svc_provider_pricing" to "service_role";

grant insert on table "public"."svc_provider_pricing" to "service_role";

grant references on table "public"."svc_provider_pricing" to "service_role";

grant select on table "public"."svc_provider_pricing" to "service_role";

grant trigger on table "public"."svc_provider_pricing" to "service_role";

grant truncate on table "public"."svc_provider_pricing" to "service_role";

grant update on table "public"."svc_provider_pricing" to "service_role";

grant delete on table "public"."svc_provider_profiles" to "anon";

grant insert on table "public"."svc_provider_profiles" to "anon";

grant references on table "public"."svc_provider_profiles" to "anon";

grant select on table "public"."svc_provider_profiles" to "anon";

grant trigger on table "public"."svc_provider_profiles" to "anon";

grant truncate on table "public"."svc_provider_profiles" to "anon";

grant update on table "public"."svc_provider_profiles" to "anon";

grant delete on table "public"."svc_provider_profiles" to "authenticated";

grant insert on table "public"."svc_provider_profiles" to "authenticated";

grant references on table "public"."svc_provider_profiles" to "authenticated";

grant select on table "public"."svc_provider_profiles" to "authenticated";

grant trigger on table "public"."svc_provider_profiles" to "authenticated";

grant truncate on table "public"."svc_provider_profiles" to "authenticated";

grant update on table "public"."svc_provider_profiles" to "authenticated";

grant delete on table "public"."svc_provider_profiles" to "service_role";

grant insert on table "public"."svc_provider_profiles" to "service_role";

grant references on table "public"."svc_provider_profiles" to "service_role";

grant select on table "public"."svc_provider_profiles" to "service_role";

grant trigger on table "public"."svc_provider_profiles" to "service_role";

grant truncate on table "public"."svc_provider_profiles" to "service_role";

grant update on table "public"."svc_provider_profiles" to "service_role";

grant delete on table "public"."svc_provider_service_offerings" to "anon";

grant insert on table "public"."svc_provider_service_offerings" to "anon";

grant references on table "public"."svc_provider_service_offerings" to "anon";

grant select on table "public"."svc_provider_service_offerings" to "anon";

grant trigger on table "public"."svc_provider_service_offerings" to "anon";

grant truncate on table "public"."svc_provider_service_offerings" to "anon";

grant update on table "public"."svc_provider_service_offerings" to "anon";

grant delete on table "public"."svc_provider_service_offerings" to "authenticated";

grant insert on table "public"."svc_provider_service_offerings" to "authenticated";

grant references on table "public"."svc_provider_service_offerings" to "authenticated";

grant select on table "public"."svc_provider_service_offerings" to "authenticated";

grant trigger on table "public"."svc_provider_service_offerings" to "authenticated";

grant truncate on table "public"."svc_provider_service_offerings" to "authenticated";

grant update on table "public"."svc_provider_service_offerings" to "authenticated";

grant delete on table "public"."svc_provider_service_offerings" to "service_role";

grant insert on table "public"."svc_provider_service_offerings" to "service_role";

grant references on table "public"."svc_provider_service_offerings" to "service_role";

grant select on table "public"."svc_provider_service_offerings" to "service_role";

grant trigger on table "public"."svc_provider_service_offerings" to "service_role";

grant truncate on table "public"."svc_provider_service_offerings" to "service_role";

grant update on table "public"."svc_provider_service_offerings" to "service_role";

grant delete on table "public"."svc_providers" to "anon";

grant insert on table "public"."svc_providers" to "anon";

grant references on table "public"."svc_providers" to "anon";

grant select on table "public"."svc_providers" to "anon";

grant trigger on table "public"."svc_providers" to "anon";

grant truncate on table "public"."svc_providers" to "anon";

grant update on table "public"."svc_providers" to "anon";

grant delete on table "public"."svc_providers" to "authenticated";

grant insert on table "public"."svc_providers" to "authenticated";

grant references on table "public"."svc_providers" to "authenticated";

grant select on table "public"."svc_providers" to "authenticated";

grant trigger on table "public"."svc_providers" to "authenticated";

grant truncate on table "public"."svc_providers" to "authenticated";

grant update on table "public"."svc_providers" to "authenticated";

grant delete on table "public"."svc_providers" to "service_role";

grant insert on table "public"."svc_providers" to "service_role";

grant references on table "public"."svc_providers" to "service_role";

grant select on table "public"."svc_providers" to "service_role";

grant trigger on table "public"."svc_providers" to "service_role";

grant truncate on table "public"."svc_providers" to "service_role";

grant update on table "public"."svc_providers" to "service_role";

grant delete on table "public"."svc_request_candidates" to "anon";

grant insert on table "public"."svc_request_candidates" to "anon";

grant references on table "public"."svc_request_candidates" to "anon";

grant select on table "public"."svc_request_candidates" to "anon";

grant trigger on table "public"."svc_request_candidates" to "anon";

grant truncate on table "public"."svc_request_candidates" to "anon";

grant update on table "public"."svc_request_candidates" to "anon";

grant delete on table "public"."svc_request_candidates" to "authenticated";

grant insert on table "public"."svc_request_candidates" to "authenticated";

grant references on table "public"."svc_request_candidates" to "authenticated";

grant select on table "public"."svc_request_candidates" to "authenticated";

grant trigger on table "public"."svc_request_candidates" to "authenticated";

grant truncate on table "public"."svc_request_candidates" to "authenticated";

grant update on table "public"."svc_request_candidates" to "authenticated";

grant delete on table "public"."svc_request_candidates" to "service_role";

grant insert on table "public"."svc_request_candidates" to "service_role";

grant references on table "public"."svc_request_candidates" to "service_role";

grant select on table "public"."svc_request_candidates" to "service_role";

grant trigger on table "public"."svc_request_candidates" to "service_role";

grant truncate on table "public"."svc_request_candidates" to "service_role";

grant update on table "public"."svc_request_candidates" to "service_role";

grant delete on table "public"."svc_request_events" to "anon";

grant insert on table "public"."svc_request_events" to "anon";

grant references on table "public"."svc_request_events" to "anon";

grant select on table "public"."svc_request_events" to "anon";

grant trigger on table "public"."svc_request_events" to "anon";

grant truncate on table "public"."svc_request_events" to "anon";

grant update on table "public"."svc_request_events" to "anon";

grant delete on table "public"."svc_request_events" to "authenticated";

grant insert on table "public"."svc_request_events" to "authenticated";

grant references on table "public"."svc_request_events" to "authenticated";

grant select on table "public"."svc_request_events" to "authenticated";

grant trigger on table "public"."svc_request_events" to "authenticated";

grant truncate on table "public"."svc_request_events" to "authenticated";

grant update on table "public"."svc_request_events" to "authenticated";

grant delete on table "public"."svc_request_events" to "service_role";

grant insert on table "public"."svc_request_events" to "service_role";

grant references on table "public"."svc_request_events" to "service_role";

grant select on table "public"."svc_request_events" to "service_role";

grant trigger on table "public"."svc_request_events" to "service_role";

grant truncate on table "public"."svc_request_events" to "service_role";

grant update on table "public"."svc_request_events" to "service_role";

grant delete on table "public"."svc_request_offers" to "anon";

grant insert on table "public"."svc_request_offers" to "anon";

grant references on table "public"."svc_request_offers" to "anon";

grant select on table "public"."svc_request_offers" to "anon";

grant trigger on table "public"."svc_request_offers" to "anon";

grant truncate on table "public"."svc_request_offers" to "anon";

grant update on table "public"."svc_request_offers" to "anon";

grant delete on table "public"."svc_request_offers" to "authenticated";

grant insert on table "public"."svc_request_offers" to "authenticated";

grant references on table "public"."svc_request_offers" to "authenticated";

grant select on table "public"."svc_request_offers" to "authenticated";

grant trigger on table "public"."svc_request_offers" to "authenticated";

grant truncate on table "public"."svc_request_offers" to "authenticated";

grant update on table "public"."svc_request_offers" to "authenticated";

grant delete on table "public"."svc_request_offers" to "service_role";

grant insert on table "public"."svc_request_offers" to "service_role";

grant references on table "public"."svc_request_offers" to "service_role";

grant select on table "public"."svc_request_offers" to "service_role";

grant trigger on table "public"."svc_request_offers" to "service_role";

grant truncate on table "public"."svc_request_offers" to "service_role";

grant update on table "public"."svc_request_offers" to "service_role";

grant delete on table "public"."svc_requests" to "anon";

grant insert on table "public"."svc_requests" to "anon";

grant references on table "public"."svc_requests" to "anon";

grant select on table "public"."svc_requests" to "anon";

grant trigger on table "public"."svc_requests" to "anon";

grant truncate on table "public"."svc_requests" to "anon";

grant update on table "public"."svc_requests" to "anon";

grant delete on table "public"."svc_requests" to "authenticated";

grant insert on table "public"."svc_requests" to "authenticated";

grant references on table "public"."svc_requests" to "authenticated";

grant select on table "public"."svc_requests" to "authenticated";

grant trigger on table "public"."svc_requests" to "authenticated";

grant truncate on table "public"."svc_requests" to "authenticated";

grant update on table "public"."svc_requests" to "authenticated";

grant delete on table "public"."svc_requests" to "service_role";

grant insert on table "public"."svc_requests" to "service_role";

grant references on table "public"."svc_requests" to "service_role";

grant select on table "public"."svc_requests" to "service_role";

grant trigger on table "public"."svc_requests" to "service_role";

grant truncate on table "public"."svc_requests" to "service_role";

grant update on table "public"."svc_requests" to "service_role";

grant delete on table "public"."svc_reviews" to "anon";

grant insert on table "public"."svc_reviews" to "anon";

grant references on table "public"."svc_reviews" to "anon";

grant select on table "public"."svc_reviews" to "anon";

grant trigger on table "public"."svc_reviews" to "anon";

grant truncate on table "public"."svc_reviews" to "anon";

grant update on table "public"."svc_reviews" to "anon";

grant delete on table "public"."svc_reviews" to "authenticated";

grant insert on table "public"."svc_reviews" to "authenticated";

grant references on table "public"."svc_reviews" to "authenticated";

grant select on table "public"."svc_reviews" to "authenticated";

grant trigger on table "public"."svc_reviews" to "authenticated";

grant truncate on table "public"."svc_reviews" to "authenticated";

grant update on table "public"."svc_reviews" to "authenticated";

grant delete on table "public"."svc_reviews" to "service_role";

grant insert on table "public"."svc_reviews" to "service_role";

grant references on table "public"."svc_reviews" to "service_role";

grant select on table "public"."svc_reviews" to "service_role";

grant trigger on table "public"."svc_reviews" to "service_role";

grant truncate on table "public"."svc_reviews" to "service_role";

grant update on table "public"."svc_reviews" to "service_role";

grant delete on table "public"."svc_scheduled_events" to "anon";

grant insert on table "public"."svc_scheduled_events" to "anon";

grant references on table "public"."svc_scheduled_events" to "anon";

grant select on table "public"."svc_scheduled_events" to "anon";

grant trigger on table "public"."svc_scheduled_events" to "anon";

grant truncate on table "public"."svc_scheduled_events" to "anon";

grant update on table "public"."svc_scheduled_events" to "anon";

grant delete on table "public"."svc_scheduled_events" to "authenticated";

grant insert on table "public"."svc_scheduled_events" to "authenticated";

grant references on table "public"."svc_scheduled_events" to "authenticated";

grant select on table "public"."svc_scheduled_events" to "authenticated";

grant trigger on table "public"."svc_scheduled_events" to "authenticated";

grant truncate on table "public"."svc_scheduled_events" to "authenticated";

grant update on table "public"."svc_scheduled_events" to "authenticated";

grant delete on table "public"."svc_scheduled_events" to "service_role";

grant insert on table "public"."svc_scheduled_events" to "service_role";

grant references on table "public"."svc_scheduled_events" to "service_role";

grant select on table "public"."svc_scheduled_events" to "service_role";

grant trigger on table "public"."svc_scheduled_events" to "service_role";

grant truncate on table "public"."svc_scheduled_events" to "service_role";

grant update on table "public"."svc_scheduled_events" to "service_role";

grant delete on table "public"."svc_service_intent_rules" to "anon";

grant insert on table "public"."svc_service_intent_rules" to "anon";

grant references on table "public"."svc_service_intent_rules" to "anon";

grant select on table "public"."svc_service_intent_rules" to "anon";

grant trigger on table "public"."svc_service_intent_rules" to "anon";

grant truncate on table "public"."svc_service_intent_rules" to "anon";

grant update on table "public"."svc_service_intent_rules" to "anon";

grant delete on table "public"."svc_service_intent_rules" to "authenticated";

grant insert on table "public"."svc_service_intent_rules" to "authenticated";

grant references on table "public"."svc_service_intent_rules" to "authenticated";

grant select on table "public"."svc_service_intent_rules" to "authenticated";

grant trigger on table "public"."svc_service_intent_rules" to "authenticated";

grant truncate on table "public"."svc_service_intent_rules" to "authenticated";

grant update on table "public"."svc_service_intent_rules" to "authenticated";

grant delete on table "public"."svc_service_intent_rules" to "service_role";

grant insert on table "public"."svc_service_intent_rules" to "service_role";

grant references on table "public"."svc_service_intent_rules" to "service_role";

grant select on table "public"."svc_service_intent_rules" to "service_role";

grant trigger on table "public"."svc_service_intent_rules" to "service_role";

grant truncate on table "public"."svc_service_intent_rules" to "service_role";

grant update on table "public"."svc_service_intent_rules" to "service_role";

grant delete on table "public"."svc_tracking" to "anon";

grant insert on table "public"."svc_tracking" to "anon";

grant references on table "public"."svc_tracking" to "anon";

grant select on table "public"."svc_tracking" to "anon";

grant trigger on table "public"."svc_tracking" to "anon";

grant truncate on table "public"."svc_tracking" to "anon";

grant update on table "public"."svc_tracking" to "anon";

grant delete on table "public"."svc_tracking" to "authenticated";

grant insert on table "public"."svc_tracking" to "authenticated";

grant references on table "public"."svc_tracking" to "authenticated";

grant select on table "public"."svc_tracking" to "authenticated";

grant trigger on table "public"."svc_tracking" to "authenticated";

grant truncate on table "public"."svc_tracking" to "authenticated";

grant update on table "public"."svc_tracking" to "authenticated";

grant delete on table "public"."svc_tracking" to "service_role";

grant insert on table "public"."svc_tracking" to "service_role";

grant references on table "public"."svc_tracking" to "service_role";

grant select on table "public"."svc_tracking" to "service_role";

grant trigger on table "public"."svc_tracking" to "service_role";

grant truncate on table "public"."svc_tracking" to "service_role";

grant update on table "public"."svc_tracking" to "service_role";

grant delete on table "public"."svc_user_devices" to "anon";

grant insert on table "public"."svc_user_devices" to "anon";

grant references on table "public"."svc_user_devices" to "anon";

grant select on table "public"."svc_user_devices" to "anon";

grant trigger on table "public"."svc_user_devices" to "anon";

grant truncate on table "public"."svc_user_devices" to "anon";

grant update on table "public"."svc_user_devices" to "anon";

grant delete on table "public"."svc_user_devices" to "authenticated";

grant insert on table "public"."svc_user_devices" to "authenticated";

grant references on table "public"."svc_user_devices" to "authenticated";

grant select on table "public"."svc_user_devices" to "authenticated";

grant trigger on table "public"."svc_user_devices" to "authenticated";

grant truncate on table "public"."svc_user_devices" to "authenticated";

grant update on table "public"."svc_user_devices" to "authenticated";

grant delete on table "public"."svc_user_devices" to "service_role";

grant insert on table "public"."svc_user_devices" to "service_role";

grant references on table "public"."svc_user_devices" to "service_role";

grant select on table "public"."svc_user_devices" to "service_role";

grant trigger on table "public"."svc_user_devices" to "service_role";

grant truncate on table "public"."svc_user_devices" to "service_role";

grant update on table "public"."svc_user_devices" to "service_role";

grant delete on table "public"."tarifas_config" to "anon";

grant insert on table "public"."tarifas_config" to "anon";

grant references on table "public"."tarifas_config" to "anon";

grant select on table "public"."tarifas_config" to "anon";

grant trigger on table "public"."tarifas_config" to "anon";

grant truncate on table "public"."tarifas_config" to "anon";

grant update on table "public"."tarifas_config" to "anon";

grant delete on table "public"."tarifas_config" to "authenticated";

grant insert on table "public"."tarifas_config" to "authenticated";

grant references on table "public"."tarifas_config" to "authenticated";

grant select on table "public"."tarifas_config" to "authenticated";

grant trigger on table "public"."tarifas_config" to "authenticated";

grant truncate on table "public"."tarifas_config" to "authenticated";

grant update on table "public"."tarifas_config" to "authenticated";

grant delete on table "public"."tarifas_config" to "service_role";

grant insert on table "public"."tarifas_config" to "service_role";

grant references on table "public"."tarifas_config" to "service_role";

grant select on table "public"."tarifas_config" to "service_role";

grant trigger on table "public"."tarifas_config" to "service_role";

grant truncate on table "public"."tarifas_config" to "service_role";

grant update on table "public"."tarifas_config" to "service_role";

grant delete on table "public"."viaje_eventos" to "anon";

grant insert on table "public"."viaje_eventos" to "anon";

grant references on table "public"."viaje_eventos" to "anon";

grant select on table "public"."viaje_eventos" to "anon";

grant trigger on table "public"."viaje_eventos" to "anon";

grant truncate on table "public"."viaje_eventos" to "anon";

grant update on table "public"."viaje_eventos" to "anon";

grant delete on table "public"."viaje_eventos" to "authenticated";

grant insert on table "public"."viaje_eventos" to "authenticated";

grant references on table "public"."viaje_eventos" to "authenticated";

grant select on table "public"."viaje_eventos" to "authenticated";

grant trigger on table "public"."viaje_eventos" to "authenticated";

grant truncate on table "public"."viaje_eventos" to "authenticated";

grant update on table "public"."viaje_eventos" to "authenticated";

grant delete on table "public"."viaje_eventos" to "service_role";

grant insert on table "public"."viaje_eventos" to "service_role";

grant references on table "public"."viaje_eventos" to "service_role";

grant select on table "public"."viaje_eventos" to "service_role";

grant trigger on table "public"."viaje_eventos" to "service_role";

grant truncate on table "public"."viaje_eventos" to "service_role";

grant update on table "public"."viaje_eventos" to "service_role";

grant delete on table "public"."viaje_ofertas" to "anon";

grant insert on table "public"."viaje_ofertas" to "anon";

grant references on table "public"."viaje_ofertas" to "anon";

grant select on table "public"."viaje_ofertas" to "anon";

grant trigger on table "public"."viaje_ofertas" to "anon";

grant truncate on table "public"."viaje_ofertas" to "anon";

grant update on table "public"."viaje_ofertas" to "anon";

grant delete on table "public"."viaje_ofertas" to "authenticated";

grant insert on table "public"."viaje_ofertas" to "authenticated";

grant references on table "public"."viaje_ofertas" to "authenticated";

grant select on table "public"."viaje_ofertas" to "authenticated";

grant trigger on table "public"."viaje_ofertas" to "authenticated";

grant truncate on table "public"."viaje_ofertas" to "authenticated";

grant update on table "public"."viaje_ofertas" to "authenticated";

grant delete on table "public"."viaje_ofertas" to "service_role";

grant insert on table "public"."viaje_ofertas" to "service_role";

grant references on table "public"."viaje_ofertas" to "service_role";

grant select on table "public"."viaje_ofertas" to "service_role";

grant trigger on table "public"."viaje_ofertas" to "service_role";

grant truncate on table "public"."viaje_ofertas" to "service_role";

grant update on table "public"."viaje_ofertas" to "service_role";

grant delete on table "public"."viaje_tracking" to "anon";

grant insert on table "public"."viaje_tracking" to "anon";

grant references on table "public"."viaje_tracking" to "anon";

grant select on table "public"."viaje_tracking" to "anon";

grant trigger on table "public"."viaje_tracking" to "anon";

grant truncate on table "public"."viaje_tracking" to "anon";

grant update on table "public"."viaje_tracking" to "anon";

grant delete on table "public"."viaje_tracking" to "authenticated";

grant insert on table "public"."viaje_tracking" to "authenticated";

grant references on table "public"."viaje_tracking" to "authenticated";

grant select on table "public"."viaje_tracking" to "authenticated";

grant trigger on table "public"."viaje_tracking" to "authenticated";

grant truncate on table "public"."viaje_tracking" to "authenticated";

grant update on table "public"."viaje_tracking" to "authenticated";

grant delete on table "public"."viaje_tracking" to "service_role";

grant insert on table "public"."viaje_tracking" to "service_role";

grant references on table "public"."viaje_tracking" to "service_role";

grant select on table "public"."viaje_tracking" to "service_role";

grant trigger on table "public"."viaje_tracking" to "service_role";

grant truncate on table "public"."viaje_tracking" to "service_role";

grant update on table "public"."viaje_tracking" to "service_role";

grant delete on table "public"."viajes" to "anon";

grant insert on table "public"."viajes" to "anon";

grant references on table "public"."viajes" to "anon";

grant select on table "public"."viajes" to "anon";

grant trigger on table "public"."viajes" to "anon";

grant truncate on table "public"."viajes" to "anon";

grant update on table "public"."viajes" to "anon";

grant delete on table "public"."viajes" to "authenticated";

grant insert on table "public"."viajes" to "authenticated";

grant references on table "public"."viajes" to "authenticated";

grant select on table "public"."viajes" to "authenticated";

grant trigger on table "public"."viajes" to "authenticated";

grant truncate on table "public"."viajes" to "authenticated";

grant update on table "public"."viajes" to "authenticated";

grant delete on table "public"."viajes" to "service_role";

grant insert on table "public"."viajes" to "service_role";

grant references on table "public"."viajes" to "service_role";

grant select on table "public"."viajes" to "service_role";

grant trigger on table "public"."viajes" to "service_role";

grant truncate on table "public"."viajes" to "service_role";

grant update on table "public"."viajes" to "service_role";


  create policy "admin_users_self_read"
  on "public"."admin_users"
  as permissive
  for select
  to authenticated
using (((user_id = auth.uid()) OR public.is_admin_user(auth.uid())));



  create policy "system_can_insert_audit_logs"
  on "public"."audit_logs"
  as permissive
  for insert
  to authenticated
with check (((auth.uid() = user_id) OR (actor_type = 'system'::text)));



  create policy "users_can_read_own_audit_logs"
  on "public"."audit_logs"
  as permissive
  for select
  to authenticated
using ((auth.uid() = user_id));



  create policy "cancellation_rules_read"
  on "public"."cancellation_rules"
  as permissive
  for select
  to authenticated
using (((active = true) OR public.is_admin_user(auth.uid())));



  create policy "choferes insert own"
  on "public"."choferes"
  as permissive
  for insert
  to authenticated
with check ((user_id = auth.uid()));



  create policy "choferes select own"
  on "public"."choferes"
  as permissive
  for select
  to authenticated
using ((user_id = auth.uid()));



  create policy "choferes update own"
  on "public"."choferes"
  as permissive
  for update
  to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));



  create policy "commission_rules_read"
  on "public"."commission_rules"
  as permissive
  for select
  to authenticated
using (((active = true) OR public.is_admin_user(auth.uid())));



  create policy "users_can_insert_own_consent_ledger"
  on "public"."consent_ledger"
  as permissive
  for insert
  to authenticated
with check ((auth.uid() = user_id));



  create policy "users_can_read_own_consent_ledger"
  on "public"."consent_ledger"
  as permissive
  for select
  to authenticated
using ((auth.uid() = user_id));



  create policy "driver_documents_insert_own"
  on "public"."driver_documents"
  as permissive
  for insert
  to authenticated
with check ((auth.uid() = user_id));



  create policy "driver_documents_select_own"
  on "public"."driver_documents"
  as permissive
  for select
  to authenticated
using ((auth.uid() = user_id));



  create policy "driver_documents_update_own"
  on "public"."driver_documents"
  as permissive
  for update
  to authenticated
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



  create policy "driver_profiles insert own"
  on "public"."driver_profiles"
  as permissive
  for insert
  to authenticated
with check ((user_id = auth.uid()));



  create policy "driver_profiles select own"
  on "public"."driver_profiles"
  as permissive
  for select
  to authenticated
using ((user_id = auth.uid()));



  create policy "driver_profiles update own"
  on "public"."driver_profiles"
  as permissive
  for update
  to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));



  create policy "driver_profiles_insert_own"
  on "public"."driver_profiles"
  as permissive
  for insert
  to authenticated
with check ((auth.uid() = user_id));



  create policy "driver_profiles_select_own"
  on "public"."driver_profiles"
  as permissive
  for select
  to authenticated
using ((auth.uid() = user_id));



  create policy "driver_profiles_update_own"
  on "public"."driver_profiles"
  as permissive
  for update
  to authenticated
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



  create policy "users_can_insert_own_legal_acceptances"
  on "public"."legal_acceptances"
  as permissive
  for insert
  to authenticated
with check ((auth.uid() = user_id));



  create policy "users_can_read_own_legal_acceptances"
  on "public"."legal_acceptances"
  as permissive
  for select
  to authenticated
using ((auth.uid() = user_id));



  create policy "payment_events_participant_read"
  on "public"."payment_events"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.payments p
  WHERE ((p.id = payment_events.payment_id) AND ((p.customer_id = auth.uid()) OR (p.provider_id = public.mimi_current_service_provider_id()) OR (p.provider_id = public.mimi_current_driver_id()) OR public.is_admin_user(auth.uid()))))));



  create policy "payments_customer_provider_admin_read"
  on "public"."payments"
  as permissive
  for select
  to authenticated
using (((customer_id = auth.uid()) OR (provider_id = public.mimi_current_service_provider_id()) OR (provider_id = public.mimi_current_driver_id()) OR public.is_admin_user(auth.uid())));



  create policy "allow insert push tokens"
  on "public"."push_tokens"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow select push tokens"
  on "public"."push_tokens"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow update push tokens"
  on "public"."push_tokens"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "refunds_participant_read"
  on "public"."refunds"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.payments p
  WHERE ((p.id = refunds.payment_id) AND ((p.customer_id = auth.uid()) OR (p.provider_id = public.mimi_current_service_provider_id()) OR (p.provider_id = public.mimi_current_driver_id()) OR public.is_admin_user(auth.uid()))))));



  create policy "settlements_provider_admin_read"
  on "public"."settlements"
  as permissive
  for select
  to authenticated
using (((provider_id = public.mimi_current_service_provider_id()) OR (provider_id = public.mimi_current_driver_id()) OR public.is_admin_user(auth.uid())));



  create policy "svc_assignments_participant_read"
  on "public"."svc_assignments"
  as permissive
  for select
  to authenticated
using (((provider_id = public.svc_get_provider_id_by_user(auth.uid())) OR (EXISTS ( SELECT 1
   FROM public.svc_requests r
  WHERE ((r.id = svc_assignments.request_id) AND ((r.client_user_id = auth.uid()) OR public.is_admin_user(auth.uid())))))));



  create policy "svc_categories_read_all"
  on "public"."svc_categories"
  as permissive
  for select
  to authenticated
using ((active = true));



  create policy "svc_conversations_participant_rw"
  on "public"."svc_conversations"
  as permissive
  for all
  to authenticated
using (((client_user_id = auth.uid()) OR (provider_user_id = auth.uid()) OR public.is_admin_user(auth.uid())))
with check (((client_user_id = auth.uid()) OR (provider_user_id = auth.uid()) OR public.is_admin_user(auth.uid())));



  create policy "svc_escrow_holds_participant_read"
  on "public"."svc_escrow_holds"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.svc_requests r
  WHERE ((r.id = svc_escrow_holds.request_id) AND ((r.client_user_id = auth.uid()) OR (r.accepted_provider_id = public.svc_get_provider_id_by_user(auth.uid())) OR public.is_admin_user(auth.uid()))))));



  create policy "svc_financial_ledger_participant_read"
  on "public"."svc_financial_ledger"
  as permissive
  for select
  to authenticated
using (((provider_id = public.svc_get_provider_id_by_user(auth.uid())) OR (EXISTS ( SELECT 1
   FROM public.svc_requests r
  WHERE ((r.id = svc_financial_ledger.request_id) AND ((r.client_user_id = auth.uid()) OR public.is_admin_user(auth.uid())))))));



  create policy "svc_idempotency_self_read"
  on "public"."svc_idempotency_keys"
  as permissive
  for select
  to authenticated
using (((user_id = auth.uid()) OR public.is_admin_user(auth.uid())));



  create policy "svc_messages_participant_rw"
  on "public"."svc_messages"
  as permissive
  for all
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.svc_conversations c
  WHERE ((c.id = svc_messages.conversation_id) AND ((c.client_user_id = auth.uid()) OR (c.provider_user_id = auth.uid()) OR public.is_admin_user(auth.uid()))))))
with check (((sender_user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.svc_conversations c
  WHERE ((c.id = svc_messages.conversation_id) AND ((c.client_user_id = auth.uid()) OR (c.provider_user_id = auth.uid()) OR public.is_admin_user(auth.uid())))))));



  create policy "svc_notification_deliveries_related_read"
  on "public"."svc_notification_deliveries"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.svc_notifications n
  WHERE ((n.id = svc_notification_deliveries.notification_id) AND ((n.user_id = auth.uid()) OR public.is_admin_user(auth.uid()))))));



  create policy "svc_notifications_self_read"
  on "public"."svc_notifications"
  as permissive
  for select
  to authenticated
using (((user_id = auth.uid()) OR public.is_admin_user(auth.uid())));



  create policy "svc_notifications_self_update_read_state"
  on "public"."svc_notifications"
  as permissive
  for update
  to authenticated
using (((user_id = auth.uid()) OR public.is_admin_user(auth.uid())))
with check (((user_id = auth.uid()) OR public.is_admin_user(auth.uid())));



  create policy "svc_payment_intents_participant_read"
  on "public"."svc_payment_intents"
  as permissive
  for select
  to authenticated
using (((client_user_id = auth.uid()) OR (provider_id = public.svc_get_provider_id_by_user(auth.uid())) OR public.is_admin_user(auth.uid())));



  create policy "svc_platform_config_admin_read"
  on "public"."svc_platform_config"
  as permissive
  for select
  to authenticated
using (public.is_admin_user(auth.uid()));



  create policy "svc_provider_availability_self_rw"
  on "public"."svc_provider_availability"
  as permissive
  for all
  to authenticated
using (((provider_id = public.svc_get_provider_id_by_user(auth.uid())) OR public.is_admin_user(auth.uid())))
with check (((provider_id = public.svc_get_provider_id_by_user(auth.uid())) OR public.is_admin_user(auth.uid())));



  create policy "svc_provider_categories_self_rw"
  on "public"."svc_provider_categories"
  as permissive
  for all
  to authenticated
using (((provider_id = public.svc_get_provider_id_by_user(auth.uid())) OR public.is_admin_user(auth.uid())))
with check (((provider_id = public.svc_get_provider_id_by_user(auth.uid())) OR public.is_admin_user(auth.uid())));



  create policy "svc_provider_documents_self_rw"
  on "public"."svc_provider_documents"
  as permissive
  for all
  to authenticated
using (((provider_id = public.svc_get_provider_id_by_user(auth.uid())) OR public.is_admin_user(auth.uid())))
with check (((provider_id = public.svc_get_provider_id_by_user(auth.uid())) OR public.is_admin_user(auth.uid())));



  create policy "svc_provider_pricing_self_rw"
  on "public"."svc_provider_pricing"
  as permissive
  for all
  to authenticated
using (((provider_id = public.svc_get_provider_id_by_user(auth.uid())) OR public.is_admin_user(auth.uid())))
with check (((provider_id = public.svc_get_provider_id_by_user(auth.uid())) OR public.is_admin_user(auth.uid())));



  create policy "svc_provider_profiles_self_rw"
  on "public"."svc_provider_profiles"
  as permissive
  for all
  to authenticated
using (((provider_id = public.svc_get_provider_id_by_user(auth.uid())) OR public.is_admin_user(auth.uid())))
with check (((provider_id = public.svc_get_provider_id_by_user(auth.uid())) OR public.is_admin_user(auth.uid())));



  create policy "svc_provider_service_offerings_provider_delete"
  on "public"."svc_provider_service_offerings"
  as permissive
  for delete
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.svc_providers p
  WHERE ((p.id = svc_provider_service_offerings.provider_id) AND (p.user_id = auth.uid()) AND (p.blocked = false)))));



  create policy "svc_provider_service_offerings_provider_insert"
  on "public"."svc_provider_service_offerings"
  as permissive
  for insert
  to authenticated
with check ((EXISTS ( SELECT 1
   FROM public.svc_providers p
  WHERE ((p.id = svc_provider_service_offerings.provider_id) AND (p.user_id = auth.uid()) AND (p.blocked = false)))));



  create policy "svc_provider_service_offerings_provider_update"
  on "public"."svc_provider_service_offerings"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.svc_providers p
  WHERE ((p.id = svc_provider_service_offerings.provider_id) AND (p.user_id = auth.uid()) AND (p.blocked = false)))))
with check ((EXISTS ( SELECT 1
   FROM public.svc_providers p
  WHERE ((p.id = svc_provider_service_offerings.provider_id) AND (p.user_id = auth.uid()) AND (p.blocked = false)))));



  create policy "svc_provider_service_offerings_read_active"
  on "public"."svc_provider_service_offerings"
  as permissive
  for select
  to anon, authenticated
using (((active = true) AND (EXISTS ( SELECT 1
   FROM public.svc_providers p
  WHERE ((p.id = svc_provider_service_offerings.provider_id) AND (p.approved = true) AND (p.blocked = false))))));



  create policy "provider_can_read_own_profile"
  on "public"."svc_providers"
  as permissive
  for select
  to authenticated
using ((user_id = auth.uid()));



  create policy "svc_providers_self_insert"
  on "public"."svc_providers"
  as permissive
  for insert
  to authenticated
with check ((user_id = auth.uid()));



  create policy "svc_providers_self_read"
  on "public"."svc_providers"
  as permissive
  for select
  to authenticated
using (((user_id = auth.uid()) OR public.is_admin_user(auth.uid())));



  create policy "svc_providers_self_update"
  on "public"."svc_providers"
  as permissive
  for update
  to authenticated
using (((user_id = auth.uid()) OR public.is_admin_user(auth.uid())))
with check (((user_id = auth.uid()) OR public.is_admin_user(auth.uid())));



  create policy "svc_request_candidates_participant_read"
  on "public"."svc_request_candidates"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.svc_requests r
  WHERE ((r.id = svc_request_candidates.request_id) AND ((r.client_user_id = auth.uid()) OR (r.accepted_provider_id = public.svc_get_provider_id_by_user(auth.uid())) OR public.is_admin_user(auth.uid()))))));



  create policy "svc_request_offers_participant_read"
  on "public"."svc_request_offers"
  as permissive
  for select
  to authenticated
using (((provider_id = public.svc_get_provider_id_by_user(auth.uid())) OR (EXISTS ( SELECT 1
   FROM public.svc_requests r
  WHERE ((r.id = svc_request_offers.request_id) AND ((r.client_user_id = auth.uid()) OR public.is_admin_user(auth.uid())))))));



  create policy "svc_requests_client_insert"
  on "public"."svc_requests"
  as permissive
  for insert
  to authenticated
with check ((client_user_id = auth.uid()));



  create policy "svc_requests_client_read"
  on "public"."svc_requests"
  as permissive
  for select
  to authenticated
using (((client_user_id = auth.uid()) OR (accepted_provider_id = public.svc_get_provider_id_by_user(auth.uid())) OR public.is_admin_user(auth.uid())));



  create policy "svc_requests_client_update_limited"
  on "public"."svc_requests"
  as permissive
  for update
  to authenticated
using (((client_user_id = auth.uid()) OR public.is_admin_user(auth.uid())))
with check (((client_user_id = auth.uid()) OR public.is_admin_user(auth.uid())));



  create policy "svc_reviews_participant_rw"
  on "public"."svc_reviews"
  as permissive
  for all
  to authenticated
using (((client_user_id = auth.uid()) OR (provider_id = public.svc_get_provider_id_by_user(auth.uid())) OR public.is_admin_user(auth.uid())))
with check (((client_user_id = auth.uid()) OR public.is_admin_user(auth.uid())));



  create policy "svc_scheduled_events_admin_read"
  on "public"."svc_scheduled_events"
  as permissive
  for select
  to authenticated
using (public.is_admin_user(auth.uid()));



  create policy "svc_service_intent_rules_read_active"
  on "public"."svc_service_intent_rules"
  as permissive
  for select
  to anon, authenticated
using ((active = true));



  create policy "svc_tracking_participant_read"
  on "public"."svc_tracking"
  as permissive
  for select
  to authenticated
using (((provider_id = public.svc_get_provider_id_by_user(auth.uid())) OR (EXISTS ( SELECT 1
   FROM public.svc_requests r
  WHERE ((r.id = svc_tracking.request_id) AND ((r.client_user_id = auth.uid()) OR public.is_admin_user(auth.uid())))))));



  create policy "svc_user_devices_self_rw"
  on "public"."svc_user_devices"
  as permissive
  for all
  to authenticated
using (((user_id = auth.uid()) OR public.is_admin_user(auth.uid())))
with check (((user_id = auth.uid()) OR public.is_admin_user(auth.uid())));


CREATE TRIGGER trg_set_updated_at_admin_users BEFORE UPDATE ON public.admin_users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_prevent_audit_logs_delete BEFORE DELETE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_logs_mutation();

CREATE TRIGGER trg_prevent_audit_logs_update BEFORE UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_logs_mutation();

CREATE TRIGGER trg_prevent_consent_ledger_delete BEFORE DELETE ON public.consent_ledger FOR EACH ROW EXECUTE FUNCTION public.prevent_consent_ledger_mutation();

CREATE TRIGGER trg_prevent_consent_ledger_update BEFORE UPDATE ON public.consent_ledger FOR EACH ROW EXECUTE FUNCTION public.prevent_consent_ledger_mutation();

CREATE TRIGGER trg_set_updated_at_driver_documents BEFORE UPDATE ON public.driver_documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_driver_documents();

CREATE TRIGGER trg_set_updated_at_driver_profiles BEFORE UPDATE ON public.driver_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_driver_profiles();

CREATE TRIGGER trg_prevent_legal_acceptances_delete BEFORE DELETE ON public.legal_acceptances FOR EACH ROW EXECUTE FUNCTION public.prevent_legal_acceptances_mutation();

CREATE TRIGGER trg_prevent_legal_acceptances_update BEFORE UPDATE ON public.legal_acceptances FOR EACH ROW EXECUTE FUNCTION public.prevent_legal_acceptances_mutation();

CREATE TRIGGER trg_legal_versions_updated_at BEFORE UPDATE ON public.legal_versions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_set_updated_at_svc_assignments BEFORE UPDATE ON public.svc_assignments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_set_updated_at_svc_categories BEFORE UPDATE ON public.svc_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_set_updated_at_svc_conversations BEFORE UPDATE ON public.svc_conversations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_set_updated_at_svc_escrow_holds BEFORE UPDATE ON public.svc_escrow_holds FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_set_updated_at_svc_payment_intents BEFORE UPDATE ON public.svc_payment_intents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_svc_create_escrow_hold_after_payment_intent AFTER INSERT ON public.svc_payment_intents FOR EACH ROW EXECUTE FUNCTION public.svc_create_escrow_hold_after_payment_intent();

CREATE TRIGGER trg_set_updated_at_svc_platform_config BEFORE UPDATE ON public.svc_platform_config FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_set_updated_at_svc_provider_availability BEFORE UPDATE ON public.svc_provider_availability FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_set_updated_at_svc_provider_categories BEFORE UPDATE ON public.svc_provider_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_set_updated_at_svc_provider_documents BEFORE UPDATE ON public.svc_provider_documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_verify_identity AFTER INSERT ON public.svc_provider_documents FOR EACH ROW WHEN ((new.document_type = ANY (ARRAY['dni_front'::text, 'selfie'::text]))) EXECUTE FUNCTION public.trigger_verify_identity();

CREATE TRIGGER trg_set_updated_at_svc_provider_pricing BEFORE UPDATE ON public.svc_provider_pricing FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_set_updated_at_svc_provider_profiles BEFORE UPDATE ON public.svc_provider_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_svc_provider_service_offerings_updated_at BEFORE UPDATE ON public.svc_provider_service_offerings FOR EACH ROW EXECUTE FUNCTION public.svc_touch_updated_at();

CREATE TRIGGER trg_set_updated_at_svc_providers BEFORE UPDATE ON public.svc_providers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_svc_set_provider_location BEFORE INSERT OR UPDATE OF last_lat, last_lng ON public.svc_providers FOR EACH ROW EXECUTE FUNCTION public.svc_set_provider_location();

CREATE TRIGGER trg_set_updated_at_svc_request_offers BEFORE UPDATE ON public.svc_request_offers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_set_updated_at_svc_requests BEFORE UPDATE ON public.svc_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_svc_set_request_location BEFORE INSERT OR UPDATE OF service_lat, service_lng ON public.svc_requests FOR EACH ROW EXECUTE FUNCTION public.svc_set_request_location();

CREATE TRIGGER trg_svc_service_intent_rules_updated_at BEFORE UPDATE ON public.svc_service_intent_rules FOR EACH ROW EXECUTE FUNCTION public.svc_touch_updated_at();

CREATE TRIGGER trg_svc_set_tracking_location BEFORE INSERT OR UPDATE OF lat, lng ON public.svc_tracking FOR EACH ROW EXECUTE FUNCTION public.svc_set_tracking_location();

CREATE TRIGGER trg_set_updated_at_svc_user_devices BEFORE UPDATE ON public.svc_user_devices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER on_auth_user_created_driver AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_driver();


  create policy "Allow read own documents"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using ((bucket_id = 'driver-documents'::text));



  create policy "Allow update own documents"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using ((bucket_id = 'driver-documents'::text));



  create policy "Allow upload own documents"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'driver-documents'::text));



  create policy "Users can delete only their own folder"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'driver-documents'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Users can update only their own folder"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'driver-documents'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)))
with check (((bucket_id = 'driver-documents'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Users can upload only to their own folder"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'driver-documents'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Users can view only their own folder"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'driver-documents'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "driver_documents_storage_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'driver-documents'::text));



  create policy "driver_documents_storage_select"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using ((bucket_id = 'driver-documents'::text));



  create policy "driver_documents_storage_update"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using ((bucket_id = 'driver-documents'::text));



  create policy "service_provider_documents_delete_own"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'service-provider-documents'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "service_provider_documents_insert_own"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'service-provider-documents'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "service_provider_documents_select_own"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'service-provider-documents'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "service_provider_documents_update_own"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'service-provider-documents'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)))
with check (((bucket_id = 'service-provider-documents'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



