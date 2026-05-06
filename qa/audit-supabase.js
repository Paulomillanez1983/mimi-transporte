#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const schemaPath = path.join(ROOT, "supabase", "migrations", "20260504135848_remote_schema.sql");
const schema = fs.existsSync(schemaPath) ? fs.readFileSync(schemaPath, "utf8") : "";
const filesToScan = [
  "js/supabase-client.js",
  "js/trip-manager.js",
  "mimi-servicios/src/services/service-api.js",
  "mimi-servicios/src/services/realtime.js",
  "mimi-servicios/src/config.js",
  "admin/admin-services-providers.js",
  "admin/admin-transport.js"
];

const requiredTables = [
  "choferes", "viajes", "viaje_ofertas", "svc_categories", "svc_providers",
  "svc_provider_profiles", "svc_provider_documents", "svc_provider_categories",
  "svc_provider_pricing", "svc_provider_service_offerings", "svc_requests",
  "svc_request_offers", "svc_tracking", "svc_notifications", "admin_users"
];
const requiredFunctions = [
  "svc-search-providers", "svc-create-request", "svc-provider-respond-offer",
  "svc-provider-en-route", "svc-provider-arrived", "svc-start-service",
  "svc-complete-service", "svc-track-location", "svc-resolve-service-intent",
  "admin-list-service-providers", "admin-review-service-provider"
];
const realtimeTables = [
  "viajes", "viaje_ofertas", "svc_requests", "svc_request_offers",
  "svc_tracking", "svc_notifications", "svc_messages"
];

const presentTables = requiredTables.filter((table) =>
  new RegExp(`create table "public"\\."${table}"`, "i").test(schema)
);
const missingTables = requiredTables.filter((table) => !presentTables.includes(table));
const scannedText = filesToScan
  .map((file) => fs.existsSync(path.join(ROOT, file)) ? fs.readFileSync(path.join(ROOT, file), "utf8") : "")
  .join("\n");

const result = {
  ok: missingTables.length === 0 && !/service[_-]?role|SUPABASE_SERVICE_ROLE|service_role/i.test(scannedText),
  schemaPath: path.relative(ROOT, schemaPath),
  presentTables,
  missingTables,
  functionRefs: requiredFunctions.map((fn) => ({ function: fn, referenced: scannedText.includes(fn) })),
  hardcodedServiceRole: /service[_-]?role|SUPABASE_SERVICE_ROLE|service_role/i.test(scannedText),
  realtimeTablesRequiredForProduction: realtimeTables,
  note: "Verificar en Supabase que estas tablas esten en la publicacion supabase_realtime; el MCP mostro que solo svc_conversations y svc_messages estaban publicados."
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
