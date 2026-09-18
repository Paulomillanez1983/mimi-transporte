#!/usr/bin/env node
/**
 * limpiar-qa.mjs — borra TODO lo que dejaron las pruebas, en orden seguro de FKs.
 *
 * Uso:
 *   MIMI_SERVICE_ROLE_KEY='...' node qa-playwright/limpiar-qa.mjs --apply
 *
 * Sin --apply solo muestra qué encontraría (dry-run).
 * Borra: usuarios QA, su perfil de prestador, solicitudes, ofertas, eventos,
 * ledger financiero, intenciones de pago, conversaciones, billeteras y
 * cualquier fila de admin_users que hubieran dejado.
 *
 * NO toca nada que no sea de las cuentas QA (las identifica por email).
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");

const SR = process.env.MIMI_SERVICE_ROLE_KEY;
if (!SR) {
  console.error("Falta MIMI_SERVICE_ROLE_KEY.");
  process.exit(2);
}
const APPLY = process.argv.includes("--apply");

const envFile = readFileSync(join(REPO, "mimi-servicios", "env.js"), "utf8");
const SUPABASE_URL = envFile.match(/SUPABASE_URL:\s*"([^"]+)"/)?.[1];

const H = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json", Prefer: "return=representation" };
const url = (p) => `${SUPABASE_URL}${p}`;
const EMAILS = ["cliente.qa@qa.mimigo.com.ar", "prestador.qa@qa.mimigo.com.ar"];

async function get(path) {
  const r = await fetch(url(path), { headers: H });
  const t = await r.text();
  try {
    return JSON.parse(t);
  } catch {
    return [];
  }
}

async function borrar(tabla, filtro) {
  if (!APPLY) {
    const filas = await get(`/rest/v1/${tabla}?select=id&${filtro}`);
    return Array.isArray(filas) ? filas.length : 0;
  }
  const r = await fetch(url(`/rest/v1/${tabla}?${filtro}`), { method: "DELETE", headers: H });
  if (!r.ok && r.status !== 404) {
    console.log(`   ⚠️  ${tabla}: HTTP ${r.status}`);
    return 0;
  }
  const t = await r.text();
  try {
    const j = JSON.parse(t);
    return Array.isArray(j) ? j.length : 0;
  } catch {
    return 0;
  }
}

/** Los usuarios QA, buscando por páginas chicas (el listado grande da 500 en este proyecto). */
async function usuariosQa() {
  const encontrados = [];
  for (let page = 1; page <= 10; page++) {
    const r = await fetch(url(`/auth/v1/admin/users?per_page=50&page=${page}`), { headers: H });
    if (!r.ok) break;
    const j = await r.json().catch(() => ({ users: [] }));
    const lista = Array.isArray(j) ? j : j.users || [];
    if (!lista.length) break;
    for (const u of lista) {
      if (EMAILS.includes((u.email || "").toLowerCase())) encontrados.push(u);
    }
    if (lista.length < 50) break;
  }
  return encontrados;
}

async function main() {
  console.log(`Proyecto: ${SUPABASE_URL}`);
  console.log(APPLY ? "Modo: BORRADO REAL\n" : "Modo: DRY-RUN (no borra nada)\n");

  const usuarios = await usuariosQa();
  if (!usuarios.length) {
    console.log("No encontré usuarios QA: no hay nada que limpiar.");
    return;
  }
  const ids = usuarios.map((u) => u.id);
  console.log(`Usuarios QA: ${usuarios.map((u) => u.email).join(", ")}\n`);

  const inList = `(${ids.join(",")})`;
  let total = 0;

  // 1) Datos del prestador QA
  const provs = await get(`/rest/v1/svc_providers?select=id&user_id=in.${inList}`);
  const provIds = (Array.isArray(provs) ? provs : []).map((p) => p.id);
  if (provIds.length) {
    const pIn = `(${provIds.join(",")})`;
    for (const t of [
      "svc_provider_availability",
      "svc_provider_service_offerings",
      "svc_provider_pricing",
      "svc_provider_categories",
      "svc_provider_profiles",
      "svc_provider_documents",
      "svc_provider_identity_checks",
    ]) {
      const n = await borrar(t, `provider_id=in.${pIn}`);
      if (n) console.log(`   ${t}: ${n}`);
      total += n;
    }
  }

  // 2) Solicitudes y todo lo que cuelga de ellas
  const reqs = await get(`/rest/v1/svc_requests?select=id&client_user_id=in.${inList}`);
  const reqIds = (Array.isArray(reqs) ? reqs : []).map((r) => r.id);
  if (reqIds.length) {
    const rIn = `(${reqIds.join(",")})`;
    for (const t of [
      "svc_request_events",
      "svc_request_offers",
      "svc_request_candidates",
      "svc_financial_ledger",
      "svc_escrow_holds",
      "svc_payment_intents",
      "svc_conversations",
      "payments",
    ]) {
      const n = await borrar(t, `request_id=in.${rIn}`);
      if (n) console.log(`   ${t}: ${n}`);
      total += n;
    }
    // payments usa otra columna
    const np = await borrar("payments", `context_id=in.${rIn}&context_type=eq.SERVICE_REQUEST`);
    if (np) console.log(`   payments (context): ${np}`);
    total += np;

    const n = await borrar("svc_requests", `id=in.${rIn}`);
    if (n) console.log(`   svc_requests: ${n}`);
    total += n;
  }

  // 3) Billeteras, admins temporales y perfiles
  for (const [t, f] of [
    ["provider_wallets", `provider_id=in.${provIds.length ? `(${provIds.join(",")})` : "(00000000-0000-0000-0000-000000000000)"}`],
    ["admin_users", `user_id=in.${inList}`],
    ["svc_client_profiles", `user_id=in.${inList}`],
    ["svc_providers", `user_id=in.${inList}`],
  ]) {
    const n = await borrar(t, f);
    if (n) console.log(`   ${t}: ${n}`);
    total += n;
  }

  // 4) Usuarios de auth
  if (APPLY) {
    for (const u of usuarios) {
      const r = await fetch(url(`/auth/v1/admin/users/${u.id}`), { method: "DELETE", headers: H });
      console.log(`   auth.users ${u.email}: HTTP ${r.status}`);
      if (r.ok) total++;
    }
  } else {
    console.log(`   auth.users: ${usuarios.length} (se borrarían con --apply)`);
  }

  console.log(`\n${APPLY ? "✅ Borrado" : "Se borrarían"}: ${total} fila(s).`);
  if (!APPLY) console.log("Volvé a correrlo con --apply para borrar de verdad.");
}

main().catch((e) => {
  console.error(`\n❌ ${e.message}`);
  process.exit(1);
});
