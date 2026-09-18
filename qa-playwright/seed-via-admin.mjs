#!/usr/bin/env node
/**
 * seed-via-admin.mjs — deja TODO listo para probar el flujo, usando la clave service_role.
 *
 * Hace, en orden y de forma repetible:
 *   1. Crea (o actualiza) los dos usuarios QA con email+clave y email ya confirmado.
 *   2. Siembra un prestador APROBADO y EN LÍNEA que cumple las 8 condiciones de
 *      svc_search_providers_ranked, con el servicio en modelo QUOTE (sin pago).
 *   3. Verifica llamando a la RPC de búsqueda: si devuelve 1 fila, quedó bien.
 *   4. Imprime las credenciales para correr flow-qa.mjs.
 *
 * Uso:
 *   MIMI_SERVICE_ROLE_KEY='...' node qa-playwright/seed-via-admin.mjs
 *
 * La service_role salta RLS: es la clave maestra del proyecto. Rotala cuando terminemos.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");

const SR = process.env.MIMI_SERVICE_ROLE_KEY;
if (!SR) {
  console.error("Falta MIMI_SERVICE_ROLE_KEY. Sacala de Supabase → Project Settings → API Keys (service_role / secret key).");
  process.exit(2);
}

const envFile = readFileSync(join(REPO, "mimi-servicios", "env.js"), "utf8");
const SUPABASE_URL = envFile.match(/SUPABASE_URL:\s*"([^"]+)"/)?.[1];
if (!SUPABASE_URL) throw new Error("No pude leer SUPABASE_URL de mimi-servicios/env.js");

const USUARIOS = [
  { rol: "cliente", email: "cliente.qa@qa.mimigo.com.ar", password: "MimiQA-2026!cliente" },
  { rol: "prestador", email: "prestador.qa@qa.mimigo.com.ar", password: "MimiQA-2026!prestador" },
];

const GEO = { lat: -31.4201, lng: -64.1888 }; // Córdoba Capital
const PRECIO_HORA = 12000;

const H = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" };
const url = (p) => `${SUPABASE_URL}${p}`;

async function json(res) {
  const t = await res.text();
  try {
    return JSON.parse(t);
  } catch {
    return { _raw: t.slice(0, 300) };
  }
}

function ok(res, j, contexto) {
  if (!res.ok) throw new Error(`${contexto}: HTTP ${res.status} ${JSON.stringify(j).slice(0, 300)}`);
  return j;
}

// ─────────────────────────────────────────────────────── 1) usuarios QA
/**
 * OJO: en este proyecto `GET /auth/v1/admin/users` con per_page>=100 devuelve
 * 500 "Database error finding users" (hay una fila problemática en auth.users).
 * Por eso: páginas de 50 como máximo, y el alta no depende del listado.
 */
async function buscarUsuarioPorEmail(email) {
  const objetivo = email.toLowerCase();
  for (let page = 1; page <= 10; page++) {
    const r = await fetch(url(`/auth/v1/admin/users?per_page=50&page=${page}`), { headers: H });
    if (!r.ok) {
      console.log(`   (aviso: el listado falló en la página ${page} con HTTP ${r.status}; sigo con lo que tengo)`);
      break;
    }
    const j = await json(r);
    const lista = Array.isArray(j) ? j : j.users || [];
    if (!lista.length) break;
    const hit = lista.find((u) => (u.email || "").toLowerCase() === objetivo);
    if (hit) return hit;
    if (lista.length < 50) break;
  }
  return null;
}

async function asegurarUsuario({ rol, email, password }) {
  // 1) Intento crear directo: es la vía que funciona bien en este proyecto.
  const cr = await fetch(url("/auth/v1/admin/users"), {
    method: "POST",
    headers: H,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const cj = await json(cr);
  if (cr.ok) return { rol, email, password, id: cj.id, creado: true };

  const yaExiste =
    cr.status === 422 || /already|registered|exists|duplicate/i.test(JSON.stringify(cj));
  if (!yaExiste) {
    throw new Error(`crear ${email} falló: HTTP ${cr.status} ${JSON.stringify(cj).slice(0, 300)}`);
  }

  // 2) Ya existía: lo busco con páginas chicas y le reseteo la contraseña.
  const u = await buscarUsuarioPorEmail(email);
  if (!u) {
    throw new Error(
      `${email} ya existe pero no pude obtener su id (el listado grande da 500). ` +
        `Borralo desde Authentication → Users y volvé a correr el script.`
    );
  }
  const ur = await fetch(url(`/auth/v1/admin/users/${u.id}`), {
    method: "PUT",
    headers: H,
    body: JSON.stringify({ password, email_confirm: true }),
  });
  const uj = await json(ur);
  ok(ur, uj, `actualizar ${email}`);
  return { rol, email, password, id: u.id, creado: false };
}

// ─────────────────────────────────────────────────────── 2) helpers REST
async function insertar(tabla, fila) {
  const r = await fetch(url(`/rest/v1/${tabla}`), {
    method: "POST",
    headers: { ...H, Prefer: "return=representation" },
    body: JSON.stringify(fila),
  });
  const j = await json(r);
  ok(r, j, `insert en ${tabla}`);
  return Array.isArray(j) ? j[0] : j;
}

async function borrar(tabla, filtro) {
  const r = await fetch(url(`/rest/v1/${tabla}?${filtro}`), { method: "DELETE", headers: H });
  if (!r.ok) throw new Error(`delete en ${tabla} falló: HTTP ${r.status} ${JSON.stringify(await json(r)).slice(0, 200)}`);
}

// ─────────────────────────────────────────── 3) aprobación (workaround documentado)
/**
 * ⚠️ BUG DETECTADO EN LA BASE (18-sep-2026):
 * El trigger `trg_svc_providers_guard_admin_fields` (migración
 * 20260514163818_provider_payout_account_ownership_verification.sql) decide si el
 * llamador es privilegiado así:
 *
 *     v_role := coalesce(current_setting('request.jwt.claim.role', true), '');
 *     v_is_privileged := v_role = 'service_role' or public.is_admin_user(auth.uid());
 *
 * `request.jwt.claim.role` (singular) es un setting que PostgREST >= 11 **ya no emite**
 * (ahora emite `request.jwt.claims` como JSON). Con su PostgREST 14.5 la variable queda
 * vacía, así que la service_role NO se reconoce como privilegiada y cualquier
 * approved=true devuelve 403 provider_approved_admin_only.
 *
 * Consecuencia real: `admin-review-service-provider` usa createClient(URL, SERVICE_ROLE_KEY)
 * + .update({approved:true}) → **la aprobación de prestadores por el panel admin falla**.
 *
 * Arreglo (una línea, en una migración nueva):
 *     v_role := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
 *
 * Mientras eso no se corrija, este script aprueba con la sesión del propio prestador QA,
 * dándole admin temporal (fila en admin_users) y borrándola enseguida.
 */
async function aprobarComoAdmin(userId, providerId) {
  const anon = envFile.match(/SUPABASE_ANON_KEY:\s*"([^"]+)"/)?.[1];

  const r = await fetch(url("/rest/v1/admin_users"), {
    method: "POST",
    headers: { ...H, Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: userId,
      role: "ADMIN",
      active: true,
      email: USUARIOS[1].email,
    }),
  });
  const rj = await json(r);
  ok(r, rj, "insert en admin_users (admin temporal)");
  const adminRowId = Array.isArray(rj) ? rj[0].id : rj.id;

  try {
    const tr = await fetch(url("/auth/v1/token?grant_type=password"), {
      method: "POST",
      headers: { apikey: anon, "Content-Type": "application/json" },
      body: JSON.stringify({ email: USUARIOS[1].email, password: USUARIOS[1].password }),
    });
    const tj = await json(tr);
    ok(tr, tj, "login del prestador QA");
    const tok = tj.access_token;

    const pr = await fetch(url(`/rest/v1/svc_providers?id=eq.${providerId}`), {
      method: "PATCH",
      headers: { apikey: anon, Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        approved: true,
        blocked: false,
        status: "ONLINE_IDLE",
        last_lat: GEO.lat,
        last_lng: GEO.lng,
        last_location: `SRID=4326;POINT(${GEO.lng} ${GEO.lat})`,
        last_seen_at: new Date().toISOString(),
      }),
    });
    if (!pr.ok) {
      throw new Error(`aprobar el prestador falló: HTTP ${pr.status} ${JSON.stringify(await json(pr)).slice(0, 250)}`);
    }
  } finally {
    // el admin temporal se borra siempre, incluso si algo falla
    await borrar("admin_users", `id=eq.${adminRowId}`).catch(() => {});
  }
}

// ─────────────────────────────────────────────────────── 4) semilla
async function sembrarPrestador(userId) {
  // categoría real y activa (la exige el join de la búsqueda)
  const catRes = await fetch(
    url("/rest/v1/svc_categories?select=id,code,name&active=eq.true&order=sort_order,name&limit=1"),
    { headers: H }
  );
  const cats = await json(catRes);
  ok(catRes, cats, "leer svc_categories");
  const cat = Array.isArray(cats) ? cats[0] : null;
  if (!cat) throw new Error("No hay filas activas en svc_categories.");
  log(`   categoría: ${cat.name} (${cat.code})`);

  // limpieza idempotente
  const prev = await json(
    await fetch(url(`/rest/v1/svc_providers?select=id&user_id=eq.${userId}`), { headers: H })
  );
  for (const p of Array.isArray(prev) ? prev : []) {
    for (const t of [
      "svc_provider_availability",
      "svc_provider_service_offerings",
      "svc_provider_pricing",
      "svc_provider_categories",
      "svc_provider_profiles",
    ]) {
      await borrar(t, `provider_id=eq.${p.id}`);
    }
    await borrar("svc_providers", `id=eq.${p.id}`);
  }

  // OJO: PostGIS recibe POINT(longitud latitud) — al revés que "lat,lng".
  // Se inserta con approved=false porque el guard de la base rechaza approved=true
  // cuando el llamador no pasa el control de admin (ver aprobarComoAdmin).
  const prov = await insertar("svc_providers", {
    user_id: userId,
    full_name: "Prestador QA",
    email: "prestador.qa@qa.mimigo.com.ar",
    status: "OFFLINE",
    approved: false,
    blocked: false,
    rating_avg: 5.0,
    rating_count: 0,
    last_lat: GEO.lat,
    last_lng: GEO.lng,
    last_location: `SRID=4326;POINT(${GEO.lng} ${GEO.lat})`,
    last_seen_at: new Date().toISOString(),
  });

  await aprobarComoAdmin(userId, prov.id);

  await insertar("svc_provider_profiles", {
    provider_id: prov.id,
    bio: "Prestador de prueba (QA)",
    city: "Córdoba",
    province: "Córdoba",
    country_code: "AR",
    pricing_mode: "HOURLY",
    accepts_immediate: true,
    accepts_scheduled: true,
    max_hours_per_service: 8,
    onboarding_completed: true,
    kyc_status: "approved",
    review_status: "approved",
    review_required: false,
  });

  await insertar("svc_provider_categories", { provider_id: prov.id, category_id: cat.id, active: true });

  await insertar("svc_provider_pricing", {
    provider_id: prov.id,
    category_id: cat.id,
    currency: "ARS",
    price_per_hour: PRECIO_HORA,
    minimum_hours: 1,
    maximum_hours: 8,
    active: true,
  });

  // pricing_model QUOTE ⇒ las transiciones del prestador NO exigen pago aprobado.
  await insertar("svc_provider_service_offerings", {
    provider_id: prov.id,
    category_id: cat.id,
    title: "Servicio de prueba (a presupuestar)",
    description: "Fila QA para el test automatizado",
    pricing_model: "QUOTE",
    currency: "ARS",
    quote_required: true,
    minimum_hours: 1,
    maximum_hours: 8,
    active: true,
  });

  for (let d = 0; d <= 6; d++) {
    await insertar("svc_provider_availability", {
      provider_id: prov.id,
      day_of_week: d,
      start_time: "00:00:00",
      end_time: "23:59:59",
      active: true,
    });
  }

  return { providerId: prov.id, categoriaId: cat.id, categoriaNombre: cat.name, categoriaCode: cat.code };
}

// ─────────────────────────────────────────────────────── 4) verificación
async function verificar(categoriaId) {
  const r = await fetch(url("/rest/v1/rpc/svc_search_providers_ranked"), {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      p_category_id: categoriaId,
      p_service_lat: GEO.lat,
      p_service_lng: GEO.lng,
      p_request_type: "IMMEDIATE",
      p_scheduled_for: null,
      p_requested_hours: 2,
      p_limit: 10,
    }),
  });
  const j = await json(r);
  ok(r, j, "RPC svc_search_providers_ranked");
  return Array.isArray(j) ? j : [];
}

const log = (m) => console.log(m);

async function main() {
  log("═".repeat(72));
  log("SETUP QA de MIMIGO Servicios (via service_role)");
  log(`proyecto: ${SUPABASE_URL}`);
  log("═".repeat(72));

  log("\n── 1) Usuarios QA");
  const usuarios = {};
  for (const u of USUARIOS) {
    const r = await asegurarUsuario(u);
    usuarios[r.rol] = r;
    log(`   ${r.creado ? "creado" : "ya existía, contraseña reseteada"}: ${r.email}  (${r.id})`);
  }

  log("\n── 2) Semilla del prestador");
  const semilla = await sembrarPrestador(usuarios.prestador.id);
  const { providerId, categoriaId } = semilla;

  // El runner debe usar EXACTAMENTE la misma categoría: con sort_order empatado,
  // pedir "la primera" a cada script daba categorías distintas y la búsqueda
  // devolvía 0. Se guarda el estado y el runner lo lee.
  writeFileSync(
    join(__dirname, ".qa-state.json"),
    JSON.stringify(
      {
        providerId,
        categoriaId,
        categoriaNombre: semilla.categoriaNombre,
        categoriaCode: semilla.categoriaCode,
        generado: new Date().toISOString(),
      },
      null,
      2
    )
  );
  log(`   provider_id=${providerId}`);
  log("   aprobado · ONLINE_IDLE · con coordenadas · categoría, precio, servicio QUOTE y disponibilidad 7/7");

  log("\n── 3) Verificación (¿la búsqueda lo ve?)");
  const encontrados = await verificar(categoriaId);
  if (encontrados.length) {
    log(`   ✅ la RPC devolvió ${encontrados.length} prestador(es).`);
    for (const p of encontrados.slice(0, 3)) {
      log(`      · ${p.full_name || p.provider_id}  dist=${p.distance_km ?? "?"} km  precio/h=${p.price_per_hour ?? p.provider_price ?? "?"}`);
    }
  } else {
    log("   ❌ la RPC devolvió 0 filas: la búsqueda NO lo ve. Revisá los filtros de la semilla.");
  }

  log("\n" + "═".repeat(72));
  log("LISTO. Ahora corré el flujo con estas credenciales:\n");
  log(`MIMI_E2E_CLIENT_EMAIL='${usuarios.cliente.email}' \\`);
  log(`MIMI_E2E_CLIENT_PASSWORD='${usuarios.cliente.password}' \\`);
  log(`MIMI_E2E_PROVIDER_EMAIL='${usuarios.prestador.email}' \\`);
  log(`MIMI_E2E_PROVIDER_PASSWORD='${usuarios.prestador.password}' \\`);
  log(`node qa-playwright/flow-qa.mjs`);
  log("═".repeat(72));
}

main().catch((e) => {
  console.error(`\n❌ ${e.message}`);
  process.exit(1);
});
