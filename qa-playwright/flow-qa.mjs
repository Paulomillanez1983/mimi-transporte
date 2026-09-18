#!/usr/bin/env node
/**
 * flow-qa.mjs — recorre el flujo REAL entre cliente y prestador contra el backend
 * de producción, usando sesiones de verdad (sin navegador y sin MercadoPago).
 *
 * Uso:
 *   MIMI_E2E_CLIENT_EMAIL=cliente.qa@qa.mimigo.com.ar \
 *   MIMI_E2E_CLIENT_PASSWORD='...' \
 *   MIMI_E2E_PROVIDER_EMAIL=prestador.qa@qa.mimigo.com.ar \
 *   MIMI_E2E_PROVIDER_PASSWORD='...' \
 *   node qa-playwright/flow-qa.mjs
 *
 * Antes hay que correr qa-playwright/seed-qa-prestador.sql (una vez).
 * Imprime cada paso con su HTTP, su cuerpo y el correlation_id para buscar en los logs.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");

const envFile = readFileSync(join(REPO, "mimi-servicios", "env.js"), "utf8");
const SUPABASE_URL = envFile.match(/SUPABASE_URL:\s*"([^"]+)"/)?.[1];
const ANON_KEY = envFile.match(/SUPABASE_ANON_KEY:\s*"([^"]+)"/)?.[1];
if (!SUPABASE_URL || !ANON_KEY) throw new Error("No pude leer SUPABASE_URL / SUPABASE_ANON_KEY de mimi-servicios/env.js");

const CRED = {
  cliente: { email: process.env.MIMI_E2E_CLIENT_EMAIL, password: process.env.MIMI_E2E_CLIENT_PASSWORD },
  prestador: { email: process.env.MIMI_E2E_PROVIDER_EMAIL, password: process.env.MIMI_E2E_PROVIDER_PASSWORD },
};
const ENV_PREFIX = { cliente: "MIMI_E2E_CLIENT", prestador: "MIMI_E2E_PROVIDER" };
for (const [rol, c] of Object.entries(CRED)) {
  if (!c.email || !c.password) {
    const p = ENV_PREFIX[rol];
    console.error(`Falta la credencial del ${rol}. Pasá ${p}_EMAIL y ${p}_PASSWORD.`);
    process.exit(2);
  }
}

// El QA vive en Córdoba Capital.
const GEO = { lat: -31.4201, lng: -64.1888, address_text: "Av. Colón 500, Córdoba (QA)" };

let pasoN = 0;
const resumen = [];
let requestId = null;
let completado = false;

function log(msg = "") {
  console.log(msg);
}

function hallarUuid(obj, claves) {
  const vistos = new Set();
  const buscar = (o) => {
    if (!o || typeof o !== "object" || vistos.has(o)) return null;
    vistos.add(o);
    for (const k of claves) {
      const v = o[k];
      if (typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return v;
    }
    for (const v of Object.values(o)) {
      const r = buscar(v);
      if (r) return r;
    }
    return null;
  };
  return buscar(obj);
}

async function signIn(rol) {
  const c = CRED[rol];
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: c.email, password: c.password }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    throw new Error(`login de ${rol} falló (HTTP ${r.status}): ${JSON.stringify(j).slice(0, 300)}`);
  }
  return { rol, token: j.access_token, userId: j.user?.id, email: c.email };
}

async function call(fn, body, sesion) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${sesion.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await r.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text.slice(0, 400) };
  }
  return { status: r.status, json };
}

async function paso(descripcion, rol, fn, body) {
  pasoN++;
  const sesion = SESIONES[rol];
  process.stdout.write(`${String(pasoN).padStart(2)}. [${rol}] ${descripcion} … `);
  const { status, json } = await call(fn, body, sesion);
  const ok = status >= 200 && status < 300 && json?.ok !== false;
  const corr = json?.correlation_id ? ` corr=${String(json.correlation_id).slice(0, 8)}` : "";
  log(ok ? `OK (HTTP ${status})${corr}` : `❌ HTTP ${status}${corr}`);

  if (!ok) {
    log(`    error: ${json?.error || json?.message || JSON.stringify(json).slice(0, 300)}`);
    if (json?.expected) log(`    estados esperados: ${JSON.stringify(json.expected)}`);
    log(`    respuesta: ${JSON.stringify(json).slice(0, 500)}`);
  } else {
    const interesante = {};
    for (const k of ["request_id", "offer_id", "provider_id", "status", "pin", "service_pin", "total_price_snapshot", "already_processed"]) {
      if (json?.[k] !== undefined) interesante[k] = json[k];
    }
    if (Object.keys(interesante).length) log(`    ${JSON.stringify(interesante)}`);
  }
  resumen.push({ paso: `${rol}/${fn}`, http: status, ok, error: json?.error || null });
  return { ok, status, json };
}

let SESIONES = {};

const arg = (n) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : null;
};

/** Busca la oferta PENDING de una solicitud (para retomar un flujo ya iniciado). */
async function buscarOferta(requestId, token) {
  for (const cab of [
    { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    { apikey: ANON_KEY },
  ]) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/svc_request_offers?select=id,status,provider_id&request_id=eq.${requestId}`,
      { headers: cab }
    );
    const j = await r.json().catch(() => []);
    if (Array.isArray(j) && j.length) return j[0].id;
  }
  return null;
}

async function main() {
  log("═".repeat(72));
  log(`Flujo QA MIMIGO Servicios contra ${SUPABASE_URL}`);
  log("═".repeat(72));

  log("\n── Autenticación");
  const cliente = await signIn("cliente");
  const prestador = await signIn("prestador");
  SESIONES = { cliente, prestador };
  log(`   cliente:   ${cliente.email}  (${cliente.userId})`);
  log(`   prestador: ${prestador.email}  (${prestador.userId})`);

  log("\n── Categoría");
  // Preferimos la categoría que usó el seed (.qa-state.json): con sort_order empatado,
  // elegir "la primera" por separado daba categorías distintas y la búsqueda daba 0.
  const estadoPath = join(__dirname, ".qa-state.json");
  let categoria = null;
  if (existsSync(estadoPath)) {
    const e = JSON.parse(readFileSync(estadoPath, "utf8"));
    categoria = { id: e.categoriaId, name: e.categoriaNombre || "(la del seed)", code: e.categoriaCode || "" };
    log(`   del seed: ${categoria.name} (${categoria.code})  id=${categoria.id}`);
  } else {
    const urlCat = `${SUPABASE_URL}/rest/v1/svc_categories?select=id,code,name&active=eq.true&order=sort_order,name&limit=5`;
    let catRes = await fetch(urlCat, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${cliente.token}` },
    });
    let categorias = await catRes.json().catch(() => []);
    if (!Array.isArray(categorias) || !categorias.length) {
      log(`   (con la sesión del cliente no salió: HTTP ${catRes.status}; reintento con la clave anónima)`);
      catRes = await fetch(urlCat, { headers: { apikey: ANON_KEY } });
      categorias = await catRes.json().catch(() => []);
    }
    if (!Array.isArray(categorias) || !categorias.length) throw new Error(`no pude leer svc_categories (HTTP ${catRes.status})`);
    categoria = categorias[0];
    log(`   elegida por orden: ${categoria.name} (${categoria.code})  id=${categoria.id}`);
  }

  const REQ_ARG = arg("request-id");
  let offerId = null;
  if (REQ_ARG) {
    // Modo retomar: se saltea buscar/crear y sigue con una solicitud ya existente.
    requestId = REQ_ARG;
    offerId = arg("offer-id") || (await buscarOferta(REQ_ARG, cliente.token));
    log(`\n── Retomo la solicitud ${requestId}`);
    log(`    offer_id=${offerId || "(no encontrada)"}`);
    if (!offerId) {
      log("    ⚠️  sin offer_id no puedo aceptar la oferta.");
      return;
    }
  } else {
  log("\n── Búsqueda y solicitud");
  const busqueda = await paso("buscar prestadores", "cliente", "svc-search-providers", {
    category_id: categoria.id,
    service_lat: GEO.lat,
    service_lng: GEO.lng,
    request_type: "IMMEDIATE",
    requested_hours: 2,
    radius_km: 20,
    sort_by: "recommended",
    max_results: 10,
  });
  const prestadores = busqueda.json?.providers || [];
  log(`    prestadores encontrados: ${prestadores.length}`);
  if (!prestadores.length) {
    log("\n❌ La búsqueda no devolvió nadie. Corré la VERIFICACIÓN del archivo seed-qa-prestador.sql");
    log("   en el SQL Editor: si ahí también da 0 filas, la semilla no quedó bien.");
    return;
  }
  const elegido = prestadores[0];
  const providerId = elegido.provider_id || elegido.id;
  log(`    elegido: ${elegido.full_name || "(sin nombre)"}  provider_id=${providerId}  dist=${elegido.distance_km ?? "?"} km`);

  const creacion = await paso("crear solicitud", "cliente", "svc-create-request", {
    category_id: categoria.id,
    selected_provider_id: providerId,
    service_lat: GEO.lat,
    service_lng: GEO.lng,
    address_text: GEO.address_text,
    requested_hours: 2,
    notes: "Solicitud generada por el test automatizado (QA)",
  });
  requestId = creacion.json?.request_id || hallarUuid(creacion.json, ["request_id", "requestId"]);
  offerId = creacion.json?.offer_id || hallarUuid(creacion.json, ["offer_id", "offerId"]);
  if (!requestId) {
    log(`    ⚠️  no encontré request_id en la respuesta. Respuesta completa:\n${JSON.stringify(creacion.json).slice(0, 800)}`);
    return;
  }
  log(`    request_id=${requestId}`);
  log(`    offer_id=${offerId || "(no vino en la respuesta)"}`);
  if (!offerId) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/svc_request_offers?select=id,status,provider_id&request_id=eq.${requestId}`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${cliente.token}` },
    });
    const ofertas = await r.json().catch(() => []);
    if (Array.isArray(ofertas) && ofertas.length) {
      offerId = ofertas[0].id;
      log(`    offer_id (leído de svc_request_offers)=${offerId}`);
    } else {
      log(`    ⚠️  no pude obtener el offer_id (HTTP ${r.status}). Sin él no puedo aceptar.`);
      return;
    }
  }

  }

  log("\n── Ciclo del prestador");
  const aceptar = await paso("aceptar la oferta", "prestador", "svc-provider-respond-offer", { offer_id: offerId, accepted: true });
  if (!aceptar.ok) return fin("no se pudo aceptar la oferta");

  const enCamino = await paso("marcar en camino", "prestador", "svc-provider-en-route", { request_id: requestId });
  if (!enCamino.ok) return fin("se trabó al marcar en camino");

  const llego = await paso("marcar llegada", "prestador", "svc-provider-arrived", { request_id: requestId });
  if (!llego.ok) return fin("se trabó al marcar la llegada");

  log("\n── Handoff del PIN");
  const pinRes = await paso("el cliente obtiene el PIN", "cliente", "svc-get-service-pin", { request_id: requestId });
  const pin = pinRes.json?.pin || pinRes.json?.service_pin || pinRes.json?.code;
  if (!pin) {
    log(`    ⚠️  no encontré el PIN en la respuesta: ${JSON.stringify(pinRes.json).slice(0, 300)}`);
    return fin("el cliente no pudo obtener el PIN");
  }
  log(`    PIN obtenido: ${pin}`);

  const inicio = await paso("iniciar servicio con el PIN", "prestador", "svc-start-service", { request_id: requestId, pin: String(pin) });
  if (!inicio.ok) return fin("no se pudo iniciar el servicio");

  const fin2 = await paso("completar servicio", "prestador", "svc-complete-service", { request_id: requestId });
  completado = fin2.ok;

  fin(completado ? "✅ flujo completo de punta a punta" : "falló al completar");
}

async function fin(motivo) {
  log("\n" + "═".repeat(72));
  log(`Resultado: ${motivo}`);
  log("═".repeat(72));
  for (const r of resumen) log(`  ${r.ok ? "✓" : "✗"} ${r.paso} → HTTP ${r.http}${r.error ? ` (${r.error})` : ""}`);

  if (requestId && !completado) {
    log("\n── Limpieza: cancelo la solicitud de prueba");
    const r = await call("svc-cancel-request", { request_id: requestId, reason: "QA automatizado" }, SESIONES.cliente);
    log(`   svc-cancel-request → HTTP ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
  }

  if (requestId) {
    log("\n── Para verificar en el SQL Editor:");
    log(`select r.id, r.status, r.total_price_snapshot, r.accepted_provider_id,
       (select status from svc_request_offers o where o.request_id = r.id order by created_at desc limit 1) as oferta,
       (select status from payments p where p.context_id = r.id and p.context_type='SERVICE_REQUEST'
          order by created_at desc limit 1) as pago
  from svc_requests r where r.id = '${requestId}';`);
  }
  process.exit(completado ? 0 : 1);
}

main().catch((e) => {
  console.error(`\n❌ ${e.message}`);
  process.exit(1);
});
