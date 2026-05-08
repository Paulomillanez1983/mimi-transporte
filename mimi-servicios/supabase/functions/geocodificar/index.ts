import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type NominatimResult = {
  lat: string;
  lon: string;
  display_name: string;
  address?: Record<string, unknown>;
  importance?: number;
  type?: string;
  class?: string;
  place_id?: number;
  osm_type?: string;
  osm_id?: number;
  namedetails?: Record<string, unknown>;
};

type SemanticGroup = {
  id: string;
  keywords: string[];
  expansions: string[];
};

type ClientBias = {
  lat: number;
  lng: number;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const CACHE_MAX = 150;
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const FETCH_TIMEOUT_MS = 4500;
const MAX_QUERY_VARIANTS = 10;
const NOMINATIM_RETRIES = 1;

const ARGENTINA_VIEWBOX = {
  left: -73.6,
  top: -21.7,
  right: -53.5,
  bottom: -55.3,
};

const memoryCache = new Map<
  string,
  { data: NominatimResult[]; expiresAt: number }
>();

const SEMANTIC_GROUPS: SemanticGroup[] = [
  { id: "educacion", keywords: ["colegio","escuela","instituto","school","jardin","jardín","primario","secundario","kindergarten"], expansions: ["colegio","escuela","instituto","jardin","escuela primaria","escuela secundaria"] },
  { id: "salud", keywords: ["hospital","clinica","clínica","sanatorio","health center"], expansions: ["hospital","clinica","sanatorio","centro de salud"] },
  { id: "farmacia", keywords: ["farmacia","pharmacy","drugstore"], expansions: ["farmacia","pharmacy","drugstore"] },
  { id: "deporte", keywords: ["club","cancha","deportivo","sports","sports centre"], expansions: ["club","cancha","centro deportivo","sports centre"] },
  { id: "golf", keywords: ["golf","club de golf","golf club","cancha de golf"], expansions: ["golf","club de golf","golf club","cancha de golf"] },
  { id: "espacio_verde", keywords: ["plaza","parque","park"], expansions: ["plaza","parque"] },
  { id: "compras", keywords: ["super","supermercado","market","almacen","almacén"], expansions: ["supermercado","super","market","almacen"] },
  { id: "combustible", keywords: ["estacion de servicio","estación de servicio","ypf","shell","axion","nafta","gasolinera"], expansions: ["estacion de servicio","ypf","shell","axion","gasolinera"] },
  { id: "gastronomia", keywords: ["restaurant","restaurante","bar","cafe","café","comedor"], expansions: ["restaurante","restaurant","bar","cafe"] },
  { id: "religion", keywords: ["iglesia","parroquia","capilla","templo"], expansions: ["iglesia","parroquia","capilla","templo"] },
];

function normalizeText(value: string): string {
  return String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[·|;]+/g, " ").replace(/[^\p{L}\p{N}\s,./-]/gu, " ").replace(/\s+/g, " ").trim();
}

function normalizeStreetTokens(value: string): string {
  return normalizeText(value)
    .replace(/\bav\b/g, "avenida").replace(/\bavda\b/g, "avenida").replace(/\bdiag\b/g, "diagonal")
    .replace(/\bbv\b/g, "boulevard").replace(/\bblvd\b/g, "boulevard").replace(/\bpto\b/g, "pasaje")
    .replace(/\bpje\b/g, "pasaje").replace(/\bpso\b/g, "paseo").replace(/\bgral\b/g, "general")
    .replace(/\bmtro\b/g, "maestro").replace(/\bsta\b/g, "santa").replace(/\bste\b/g, "santo")
    .replace(/\bint\b/g, "intendente").replace(/\bpdte\b/g, "presidente").replace(/\bdr\b/g, "doctor")
    .replace(/\bdra\b/g, "doctora").replace(/\bing\b/g, "ingeniero").replace(/\bprof\b/g, "profesor")
    .replace(/\bgob\b/g, "gobernador").replace(/\bkm\b/g, "kilometro")
    .replace(/\bruta nac\b/g, "ruta nacional").replace(/\bruta prov\b/g, "ruta provincial")
    .replace(/\bcirc\b/g, "circunvalacion").replace(/\b2do\b/g, "segundo").replace(/\b3ro\b/g, "tercero")
    .replace(/\bn[º°o]\b/g, " ").replace(/\bs\/n\b/g, "sin numero").replace(/\s+/g, " ").trim();
}

function extractStreetNumber(value: string): string | null {
  const match = normalizeStreetTokens(value).match(/\b(\d{1,6})\b/);
  return match?.[1] || null;
}

function stripStreetNumber(value: string): string {
  return normalizeStreetTokens(value).replace(/\b\d{1,6}\b/g, " ").replace(/\s+/g, " ").trim();
}

function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function isAbortLikeError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err || "");
  const lower = message.toLowerCase();
  return lower.includes("abort") || lower.includes("timeout") || lower.includes("signal is aborted");
}

function buildBiasViewbox(bias?: ClientBias | null) {
  if (!bias || !Number.isFinite(bias.lat) || !Number.isFinite(bias.lng)) {
    return `${ARGENTINA_VIEWBOX.left},${ARGENTINA_VIEWBOX.top},${ARGENTINA_VIEWBOX.right},${ARGENTINA_VIEWBOX.bottom}`;
  }
  const deltaLng = 0.35;
  const deltaLat = 0.28;
  return [bias.lng - deltaLng, bias.lat + deltaLat, bias.lng + deltaLng, bias.lat - deltaLat].join(",");
}

function setCache(key: string, data: NominatimResult[]) {
  if (memoryCache.has(key)) memoryCache.delete(key);
  memoryCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  while (memoryCache.size > CACHE_MAX) {
    const firstKey = memoryCache.keys().next().value;
    if (!firstKey) break;
    memoryCache.delete(firstKey);
  }
}

function getCache(key: string): NominatimResult[] | null {
  const item = memoryCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) { memoryCache.delete(key); return null; }
  return item.data;
}

function replaceWholeWord(text: string, from: string, to: string): string {
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`\\b${escaped}\\b`, "g"), to);
}

function detectSemanticGroups(normalized: string): SemanticGroup[] {
  return SEMANTIC_GROUPS.filter((group) =>
    group.keywords.some((keyword) => normalized.includes(normalizeText(keyword)))
  );
}

function detectIntentIds(normalized: string): string[] {
  return detectSemanticGroups(normalized).map((g) => g.id);
}

function buildSemanticVariants(normalized: string): string[] {
  const variants = new Set<string>();
  const matchedGroups = detectSemanticGroups(normalized);
  for (const group of matchedGroups) {
    for (const keyword of group.keywords) {
      const normalizedKeyword = normalizeText(keyword);
      if (!normalized.includes(normalizedKeyword)) continue;
      for (const expansion of group.expansions) {
        variants.add(replaceWholeWord(normalized, normalizedKeyword, normalizeText(expansion)));
      }
    }
    let stripped = normalized;
    for (const keyword of group.keywords) {
      stripped = replaceWholeWord(stripped, normalizeText(keyword), " ");
    }
    stripped = stripped.replace(/\s+/g, " ").trim();
    if (stripped.length >= 3) variants.add(stripped);
  }
  return [...variants].filter(Boolean);
}

function pushVariant(variants: string[], seen: Set<string>, value: string | null | undefined) {
  const normalized = normalizeStreetTokens(String(value || ""));
  if (!normalized || normalized.length < 3) return;
  if (seen.has(normalized)) return;
  seen.add(normalized);
  variants.push(normalized);
}

function buildQueryVariants(rawQuery: string): string[] {
  const normalized = normalizeStreetTokens(rawQuery);
  if (!normalized) return [];
  const variants: string[] = [];
  const seen = new Set<string>();
  const semanticVariants = buildSemanticVariants(normalized);
  const number = extractStreetNumber(normalized);
  const withoutNumber = stripStreetNumber(normalized);
  const splitByReference = normalized.split(/(?:\s+[·|]\s+)|(?:\s+-\s+)|(?:,\s*)/).map((x) => x.trim()).filter((x) => x.length >= 3);

  pushVariant(variants, seen, normalized);
  for (const v of semanticVariants) pushVariant(variants, seen, normalizeStreetTokens(v));
  pushVariant(variants, seen, normalized.replace(/[.,-]/g, " ").replace(/\s+/g, " ").trim());
  if (withoutNumber && withoutNumber !== normalized) {
    pushVariant(variants, seen, withoutNumber);
    pushVariant(variants, seen, `${withoutNumber}, argentina`);
  }
  if (number && withoutNumber) {
    pushVariant(variants, seen, `${withoutNumber} ${number}, argentina`);
    pushVariant(variants, seen, `${withoutNumber}, ${number}, argentina`);
  }
  if (!/\bargentina\b/.test(normalized)) pushVariant(variants, seen, `${normalized}, argentina`);
  for (const part of splitByReference) pushVariant(variants, seen, part);
  if (splitByReference.length >= 2) {
    pushVariant(variants, seen, splitByReference[0]);
    pushVariant(variants, seen, splitByReference[splitByReference.length - 1]);
  }
  if (normalized.includes(" ")) {
    const parts = normalized.split(/[,-]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) pushVariant(variants, seen, parts[0]);
  }
  return variants.slice(0, MAX_QUERY_VARIANTS);
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function extractStreetNameTokens(value: string): string[] {
  return stripStreetNumber(value).split(" ").map((x) => x.trim()).filter((x) => x.length >= 2);
}

function extractAddressHouseNumber(item: NominatimResult): string | null {
  const addr = item.address || {};
  const direct = addr["house_number"] || addr["housenumber"] || addr["street_number"] || null;
  if (direct != null) {
    const n = normalizeText(String(direct));
    if (/\b\d{1,6}\b/.test(n)) return n.match(/\b(\d{1,6})\b/)?.[1] || null;
  }
  const display = normalizeStreetTokens(item.display_name || "");
  return display.match(/\b(\d{1,6})\b/)?.[1] || null;
}

function streetTokensMatch(query: string, item: NominatimResult): number {
  const qTokens = extractStreetNameTokens(query);
  if (!qTokens.length) return 0;
  const display = normalizeStreetTokens(item.display_name || "");
  const address = normalizeStreetTokens(JSON.stringify(item.address || {}));
  let matches = 0;
  for (const token of qTokens) {
    if (display.includes(token) || address.includes(token)) matches++;
  }
  return matches;
}

function hasStrongExactAddressMatch(query: string, item: NominatimResult): boolean {
  const qNumber = extractStreetNumber(query);
  const itemNumber = extractAddressHouseNumber(item);
  const tokenMatches = streetTokensMatch(query, item);
  const qTokens = extractStreetNameTokens(query);
  return !!(qNumber && itemNumber && qNumber === itemNumber && qTokens.length > 0 && tokenMatches >= Math.max(1, qTokens.length - 1));
}

function extractLocalityFromAddress(address?: Record<string, unknown> | null): string {
  if (!address || typeof address !== "object") return "";
  const raw = address["city"] || address["town"] || address["village"] || address["municipality"] || address["suburb"] || address["county"] || "";
  return normalizeStreetTokens(String(raw || ""));
}

function extractProvinceFromAddress(address?: Record<string, unknown> | null): string {
  if (!address || typeof address !== "object") return "cordoba";
  const raw = address["state"] || address["province"] || "cordoba";
  return normalizeStreetTokens(String(raw || "cordoba"));
}

function extractStreetFromAddress(address?: Record<string, unknown> | null): string {
  if (!address || typeof address !== "object") return "";
  const raw = address["road"] || address["pedestrian"] || address["residential"] || address["street"] || address["route"] || "";
  return stripStreetNumber(String(raw || ""));
}

function tryExtractLocalityFromQuery(query: string): string {
  const normalized = normalizeStreetTokens(query);
  const parts = normalized.split(",").map((x) => x.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 1];
  return "";
}

function localityScoreBoost(query: string, item: NominatimResult): number {
  const localityFromQuery = tryExtractLocalityFromQuery(query);
  if (!localityFromQuery) return 0;
  const address = item.address || {};
  const localityFromItem = normalizeStreetTokens(String(address["city"] || address["town"] || address["village"] || address["municipality"] || address["suburb"] || ""));
  if (!localityFromItem) return 0;
  if (localityFromItem === localityFromQuery) return 140;
  if (localityFromItem.includes(localityFromQuery) || localityFromQuery.includes(localityFromItem)) return 80;
  return -60;
}

function similarityScore(query: string, item: NominatimResult, bias?: ClientBias | null): number {
  const q = normalizeStreetTokens(query);
  const display = normalizeStreetTokens(item.display_name || "");
  const address = normalizeStreetTokens(JSON.stringify(item.address || {}));
  const namedetails = normalizeStreetTokens(JSON.stringify(item.namedetails || {}));
  const type = normalizeStreetTokens(String(item.type || ""));
  const cls = normalizeStreetTokens(String(item.class || ""));
  const airportTerms = ["aeropuerto","airport","taravella"];
  const terminalTerms = ["terminal","omnibus","omnibus de cordoba"];
  const mallTerms = ["shopping","mall","center"];
  const hotelTerms = ["hotel","hosteria","resort"];
  let score = 0;
  if (display === q) score += 260;
  if (display.startsWith(q)) score += 130;
  if (display.includes(q)) score += 85;
  if (address.includes(q)) score += 70;
  if (namedetails.includes(q)) score += 50;
  const qWords = q.split(" ").filter(Boolean);
  for (const word of qWords) {
    if (display.includes(word)) score += 16;
    if (address.includes(word)) score += 12;
    if (namedetails.includes(word)) score += 10;
    if (word.length >= 3) {
      const pref = new RegExp(`\\b${word}`);
      if (pref.test(display)) score += 10;
      if (pref.test(address)) score += 8;
    }
  }
  const qNumber = extractStreetNumber(q);
  const itemNumber = extractAddressHouseNumber(item);
  if (qNumber) {
    if (display.includes(qNumber)) score += 60;
    if (address.includes(qNumber)) score += 95;
  }
  if (qNumber && itemNumber) {
    if (qNumber === itemNumber) score += 220;
    else {
      const qNum = Number(qNumber);
      const iNum = Number(itemNumber);
      if (Number.isFinite(qNum) && Number.isFinite(iNum)) {
        const diff = Math.abs(qNum - iNum);
        if (diff === 0) score += 220;
        else if (diff <= 10) score += 70;
        else if (diff <= 50) score += 35;
        else if (diff <= 150) score += 10;
        else score -= 40;
      }
    }
  } else if (qNumber && !itemNumber) score -= 35;
  const qStreet = stripStreetNumber(q);
  if (qStreet) {
    if (display.includes(qStreet)) score += 55;
    if (address.includes(qStreet)) score += 60;
  }
  const tokenMatches = streetTokensMatch(q, item);
  score += tokenMatches * 22;
  if (hasStrongExactAddressMatch(q, item)) score += 320;
  score += Number(item.importance || 0) * 20;
  const intents = detectIntentIds(q);
  if (intents.includes("educacion")) {
    if (type.includes("school")) score += 90;
    if (display.includes("escuela")) score += 70;
    if (display.includes("colegio")) score += 70;
    if (display.includes("instituto")) score += 55;
    if (display.includes("jardin")) score += 50;
    if (address.includes("escuela")) score += 40;
    if (address.includes("colegio")) score += 40;
    if (cls.includes("amenity")) score += 15;
  }
  if (intents.includes("salud")) {
    if (type.includes("hospital")) score += 90;
    if (display.includes("hospital")) score += 60;
    if (display.includes("clinica")) score += 60;
    if (display.includes("sanatorio")) score += 60;
    if (display.includes("centro de salud")) score += 35;
    if (cls.includes("amenity")) score += 15;
  }
  if (intents.includes("farmacia")) {
    if (display.includes("farmacia")) score += 70;
    if (display.includes("pharmacy")) score += 40;
    if (cls.includes("amenity")) score += 10;
  }
  if (intents.includes("deporte")) {
    if (display.includes("club")) score += 50;
    if (display.includes("cancha")) score += 50;
    if (display.includes("deportivo")) score += 40;
    if (cls.includes("leisure")) score += 20;
  }
  if (intents.includes("golf")) {
    if (display.includes("golf")) score += 90;
    if (type.includes("golf")) score += 90;
    if (cls.includes("leisure")) score += 20;
  }
  if (intents.includes("espacio_verde")) {
    if (display.includes("plaza")) score += 55;
    if (display.includes("parque")) score += 55;
    if (cls.includes("leisure")) score += 15;
  }
  if (intents.includes("compras")) {
    if (display.includes("super")) score += 45;
    if (display.includes("supermercado")) score += 60;
    if (display.includes("market")) score += 35;
    if (cls.includes("shop")) score += 20;
  }
  if (intents.includes("combustible")) {
    if (display.includes("ypf")) score += 60;
    if (display.includes("shell")) score += 60;
    if (display.includes("axion")) score += 60;
    if (display.includes("estacion de servicio")) score += 70;
    if (display.includes("gasolinera")) score += 40;
    if (cls.includes("amenity")) score += 12;
  }
  if (intents.includes("gastronomia")) {
    if (display.includes("restaurante")) score += 55;
    if (display.includes("restaurant")) score += 55;
    if (display.includes("bar")) score += 35;
    if (display.includes("cafe")) score += 35;
    if (cls.includes("amenity")) score += 10;
  }
  if (intents.includes("religion")) {
    if (display.includes("iglesia")) score += 55;
    if (display.includes("parroquia")) score += 50;
    if (display.includes("capilla")) score += 45;
    if (display.includes("templo")) score += 45;
    if (cls.includes("amenity")) score += 10;
  }
  if (airportTerms.some((t) => q.includes(t))) {
    if (airportTerms.some((t) => display.includes(t))) score += 140;
    if (type.includes("aerodrome") || cls.includes("aeroway")) score += 100;
  }
  if (terminalTerms.some((t) => q.includes(t))) {
    if (terminalTerms.some((t) => display.includes(t))) score += 90;
  }
  if (mallTerms.some((t) => q.includes(t))) {
    if (mallTerms.some((t) => display.includes(t))) score += 65;
  }
  if (hotelTerms.some((t) => q.includes(t))) {
    if (hotelTerms.some((t) => display.includes(t))) score += 65;
  }
  if (type.includes("house") || type.includes("residential") || type.includes("road")) score += 8;
  if (bias) {
    const lat = Number(item.lat);
    const lon = Number(item.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      const dist = haversineKm(bias.lat, bias.lng, lat, lon);
      score += Math.max(0, 120 - dist * 10);
    }
  }
  score += localityScoreBoost(query, item);
  return score;
}

function dedupeResults(items: NominatimResult[]): NominatimResult[] {
  const seen = new Set<string>();
  const out: NominatimResult[] = [];
  for (const item of items) {
    const lat = Number(item.lat);
    const lon = Number(item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const key = `${lat.toFixed(6)},${lon.toFixed(6)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

async function fetchJsonWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("timeout"), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function searchNominatimOnce(query: string, limit: number, bias?: ClientBias | null): Promise<NominatimResult[]> {
  const params = new URLSearchParams({
    format: "jsonv2",
    q: query,
    limit: String(Math.max(limit, 10)),
    addressdetails: "1",
    namedetails: "1",
    "accept-language": "es",
    countrycodes: "ar",
    viewbox: buildBiasViewbox(bias),
  });
  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
  const res = await fetchJsonWithTimeout(url, {
    headers: { "User-Agent": "MIMITransporte/1.0 (contacto: soporte@mimi.local)", Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Nominatim error: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function searchNominatim(query: string, limit: number, bias?: ClientBias | null): Promise<NominatimResult[]> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= NOMINATIM_RETRIES; attempt++) {
    try {
      return await searchNominatimOnce(query, limit, bias);
    } catch (err) {
      lastError = err;
      const canRetry = attempt < NOMINATIM_RETRIES &&
        (isAbortLikeError(err) || (err instanceof Error && err.message.includes("Nominatim error: 5")));
      if (!canRetry) break;
      await sleep(350 * (attempt + 1));
    }
  }
  throw lastError;
}

// Reverse geocoding: lat/lng → address (NEW — fix para svc-services frontend que usa mode: "reverse")
async function reverseGeocodeNominatim(lat: number, lng: number): Promise<NominatimResult | null> {
  const params = new URLSearchParams({
    format: "jsonv2",
    lat: String(lat),
    lon: String(lng),
    addressdetails: "1",
    namedetails: "1",
    "accept-language": "es",
    zoom: "18",
  });
  const url = `https://nominatim.openstreetmap.org/reverse?${params.toString()}`;
  const res = await fetchJsonWithTimeout(url, {
    headers: { "User-Agent": "MIMITransporte/1.0 (contacto: soporte@mimi.local)", Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Nominatim reverse error: ${res.status}`);
  const data = await res.json();
  if (!data || typeof data !== "object" || !data.lat || !data.lon) return null;
  return data as NominatimResult;
}

function sortResultsByAddressPrecision(query: string, items: NominatimResult[], bias?: ClientBias | null): NominatimResult[] {
  return [...items].sort((a, b) => {
    const aExact = hasStrongExactAddressMatch(query, a) ? 1 : 0;
    const bExact = hasStrongExactAddressMatch(query, b) ? 1 : 0;
    if (bExact !== aExact) return bExact - aExact;
    const aStreetMatches = streetTokensMatch(query, a);
    const bStreetMatches = streetTokensMatch(query, b);
    if (bStreetMatches !== aStreetMatches) return bStreetMatches - aStreetMatches;
    const scoreA = similarityScore(query, a, bias);
    const scoreB = similarityScore(query, b, bias);
    return scoreB - scoreA;
  });
}

async function searchSmart(query: string, limit: number, bias?: ClientBias | null): Promise<NominatimResult[]> {
  const variants = buildQueryVariants(query);
  const combined: NominatimResult[] = [];
  let hadAbort = false;
  for (const variant of variants) {
    try {
      const results = await searchNominatim(variant, Math.max(limit, 12), bias);
      if (results.length) combined.push(...results);
      const uniqueNow = dedupeResults(combined);
      if (uniqueNow.length >= Math.max(limit + 6, 16)) break;
    } catch (err) {
      if (isAbortLikeError(err)) hadAbort = true;
      console.warn("⚠️ Error en variante de búsqueda:", { variant, error: err instanceof Error ? err.message : String(err) });
    }
  }
  if (!combined.length) {
    const normalized = normalizeStreetTokens(query);
    const parts = normalized.split(",").map((x) => x.trim()).filter(Boolean);
    if (parts.length > 1) {
      for (const part of parts) {
        try {
          const partial = await searchNominatim(part, Math.max(limit, 10), bias);
          if (partial.length) combined.push(...partial);
        } catch { /* noop */ }
      }
    }
  }
  const unique = dedupeResults(combined);
  const sorted = sortResultsByAddressPrecision(query, unique, bias);
  const finalResults = sorted.slice(0, limit);
  if (!finalResults.length) {
    const normalized = normalizeStreetTokens(query);
    const streetOnly = stripStreetNumber(normalized);
    if (streetOnly && streetOnly !== normalized) {
      try {
        const fallbackStreetResults = await searchNominatim(streetOnly, Math.max(limit, 8), bias);
        const fallbackUnique = dedupeResults(fallbackStreetResults);
        const fallbackSorted = sortResultsByAddressPrecision(query, fallbackUnique, bias);
        return fallbackSorted.slice(0, limit);
      } catch { /* noop */ }
    }
  }
  if (!finalResults.length && hadAbort) throw new Error("Timeout consultando geocodificación");
  return finalResults;
}

async function loadDbCache(queryKey: string): Promise<NominatimResult[] | null> {
  const { data, error } = await supabase.from("geocoding_cache").select("*").eq("query", queryKey).maybeSingle();
  if (error) { console.warn("⚠️ Error leyendo cache DB:", error.message); return null; }
  if (!data) return null;
  const cached: NominatimResult[] = Array.isArray(data.resultados) ? data.resultados
    : [{ lat: String(data.lat), lon: String(data.lng), display_name: String(data.direccion || ""), address: data.address || {} }];
  return cached;
}

async function saveDbCache(queryKey: string, results: NominatimResult[]) {
  if (!results.length) return;
  const first = results[0];
  const payload = {
    query: queryKey, lat: Number(first.lat), lng: Number(first.lon),
    direccion: first.display_name, address: first.address || {}, resultados: results,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("geocoding_cache").upsert(payload, { onConflict: "query" });
  if (error) console.warn("⚠️ No se pudo guardar cache DB:", error.message);
}

async function loadFeedbackMatches(normalizedQuery: string, limit: number, bias?: ClientBias | null): Promise<NominatimResult[]> {
  const query = supabase.from("geocoding_feedback").select("*")
    .ilike("normalized_query", `%${normalizedQuery}%`)
    .order("hit_count", { ascending: false }).order("last_used_at", { ascending: false })
    .limit(Math.max(limit, 8));
  const { data, error } = await query;
  if (error) { console.warn("⚠️ Error leyendo geocoding_feedback:", error.message); return []; }
  if (!Array.isArray(data) || !data.length) return [];
  const mapped: NominatimResult[] = data.map((row: any) => ({
    lat: String(row.lat), lon: String(row.lng), display_name: String(row.display_name || ""),
    address: row.address || {}, importance: Math.min(1, 0.35 + Number(row.hit_count || 1) * 0.05),
    type: "feedback", class: "user_selection",
    namedetails: { source: row.source || "user_selection", hit_count: row.hit_count || 1, last_used_at: row.last_used_at || null },
  }));
  return sortResultsByAddressPrecision(normalizedQuery, mapped, bias).slice(0, limit);
}

async function loadAddressIndexMatches(rawQuery: string, limit: number, bias?: ClientBias | null): Promise<NominatimResult[]> {
  const normalizedQuery = normalizeStreetTokens(rawQuery);
  const street = stripStreetNumber(normalizedQuery);
  const number = extractStreetNumber(normalizedQuery);
  const localityFromQuery = tryExtractLocalityFromQuery(rawQuery);
  let query = supabase.from("address_index").select("*")
    .order("usage_count", { ascending: false }).order("last_used_at", { ascending: false })
    .limit(Math.max(limit, 8));
  if (street) query = query.ilike("normalized_street", `%${street}%`);
  if (number) query = query.eq("house_number", number);
  if (localityFromQuery) query = query.ilike("locality", `%${localityFromQuery}%`);
  const { data, error } = await query;
  if (error) { console.warn("⚠️ Error leyendo address_index:", error.message); return []; }
  if (!Array.isArray(data) || !data.length) return [];
  const mapped: NominatimResult[] = data.map((row: any) => ({
    lat: String(row.lat), lon: String(row.lng), display_name: String(row.display_name || ""),
    address: row.address || {}, importance: Math.min(1, Number(row.confidence || 0.85)),
    type: "address_index", class: "validated_address",
    namedetails: { source: row.source || "address_index", usage_count: row.usage_count || 1, last_used_at: row.last_used_at || null, locality: row.locality || null },
  }));
  return sortResultsByAddressPrecision(rawQuery, mapped, bias).slice(0, limit);
}

async function saveUserSelectionFeedback(input: {
  rawQuery: string; displayName: string; lat: number; lng: number;
  address?: Record<string, unknown>; source?: string; clientLat?: number | null; clientLng?: number | null;
}) {
  const normalizedQuery = normalizeStreetTokens(input.rawQuery);
  if (!normalizedQuery || !Number.isFinite(input.lat) || !Number.isFinite(input.lng)) return;
  const { error } = await supabase.rpc("upsert_geocoding_feedback", {
    p_normalized_query: normalizedQuery, p_raw_query: input.rawQuery, p_display_name: input.displayName,
    p_lat: input.lat, p_lng: input.lng, p_address: input.address || {},
    p_source: input.source || "user_selection",
    p_client_lat: input.clientLat ?? null, p_client_lng: input.clientLng ?? null,
  });
  if (error) console.warn("⚠️ No se pudo guardar feedback de geocoding:", error.message);
  try {
    const normalizedStreet = extractStreetFromAddress(input.address) || stripStreetNumber(input.rawQuery);
    const houseNumber = extractAddressHouseNumber({
      lat: String(input.lat), lon: String(input.lng), display_name: input.displayName, address: input.address || {},
    }) || extractStreetNumber(input.rawQuery);
    const locality = extractLocalityFromAddress(input.address) || tryExtractLocalityFromQuery(input.rawQuery);
    const province = extractProvinceFromAddress(input.address);
    const { error: addressIndexError } = await supabase.rpc("upsert_address_index", {
      p_normalized_full_query: normalizeStreetTokens(input.rawQuery),
      p_normalized_street: normalizedStreet || null, p_house_number: houseNumber || null,
      p_locality: locality || null, p_province: province || "cordoba", p_country: "argentina",
      p_display_name: input.displayName, p_address: input.address || {},
      p_lat: input.lat, p_lng: input.lng,
      p_source: input.source || "user_selection", p_confidence: 0.9,
    });
    if (addressIndexError) console.warn("⚠️ No se pudo guardar address_index:", addressIndexError.message);
  } catch (err) {
    console.warn("⚠️ Error guardando address_index:", err);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ exito: false, error: "Método no permitido", data: [] }),
      { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));

    // Modo feedback (existente)
    if (body?.mode === "feedback") {
      const rawQuery = String(body?.raw_query || "").trim();
      const displayName = String(body?.display_name || "").trim();
      const lat = Number(body?.lat);
      const lng = Number(body?.lng);
      if (!rawQuery || !displayName || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        return new Response(JSON.stringify({ exito: false, error: "Payload feedback inválido" }),
          { status: 400, headers: corsHeaders });
      }
      await saveUserSelectionFeedback({
        rawQuery, displayName, lat, lng, address: body?.address || {},
        source: body?.source || "user_selection",
        clientLat: Number.isFinite(Number(body?.client_lat)) ? Number(body.client_lat) : null,
        clientLng: Number.isFinite(Number(body?.client_lng)) ? Number(body.client_lng) : null,
      });
      return new Response(JSON.stringify({ exito: true, saved: true }), { headers: corsHeaders });
    }

    // Modo reverse: lat/lng → dirección (NUEVO — fix para frontend mimi-servicios)
    if (body?.mode === "reverse") {
      const lat = Number(body?.lat);
      const lng = Number(body?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return new Response(JSON.stringify({
          exito: false, error: "Coordenadas inválidas para reverse geocoding", data: [],
        }), { status: 400, headers: corsHeaders });
      }
      try {
        const result = await reverseGeocodeNominatim(lat, lng);
        if (!result) {
          return new Response(JSON.stringify({
            exito: false, error: "Sin resultados de geocodificación inversa", data: [],
          }), { headers: corsHeaders });
        }
        return new Response(JSON.stringify({
          exito: true, data: [result], source: "nominatim-reverse",
        }), { headers: corsHeaders });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error en reverse geocoding";
        console.error("❌ Error reverse geocoding:", err);
        return new Response(JSON.stringify({
          exito: false,
          error: isAbortLikeError(err) ? "Timeout consultando reverse geocoding" : message,
          data: [],
        }), { status: 500, headers: corsHeaders });
      }
    }

    // Modo búsqueda forward (existente)
    const rawQuery = body?.query;
    const rawLimit = Number(body?.limit);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 10)) : 5;
    const bias = Number.isFinite(Number(body?.client_lat)) && Number.isFinite(Number(body?.client_lng))
      ? { lat: Number(body.client_lat), lng: Number(body.client_lng) } : null;

    if (typeof rawQuery !== "string" || normalizeText(rawQuery).length < 2) {
      return new Response(JSON.stringify({
        exito: false, error: "Query inválido", message: "Se requieren al menos 2 caracteres", data: [],
      }), { status: 400, headers: corsHeaders });
    }

    const query = rawQuery.trim();
    const normalizedQuery = normalizeStreetTokens(query);

    const feedbackHits = await loadFeedbackMatches(normalizedQuery, limit, bias);
    if (feedbackHits.length) {
      const exactMatch = feedbackHits.some((item) => hasStrongExactAddressMatch(query, item));
      return new Response(JSON.stringify({
        exito: true, data: feedbackHits, cached: false, source: "feedback",
        exact_match: exactMatch, approximate_match: !exactMatch && feedbackHits.length > 0,
      }), { headers: corsHeaders });
    }

    const addressIndexHits = await loadAddressIndexMatches(query, limit, bias);
    if (addressIndexHits.length) {
      const exactMatch = addressIndexHits.some((item) => hasStrongExactAddressMatch(query, item));
      return new Response(JSON.stringify({
        exito: true, data: addressIndexHits, cached: false, source: "address_index",
        exact_match: exactMatch, approximate_match: !exactMatch && addressIndexHits.length > 0,
      }), { headers: corsHeaders });
    }

    const semanticIds = detectIntentIds(normalizedQuery).sort().join(",");
    const queryNumber = extractStreetNumber(normalizedQuery) || "sin_numero";
    const cacheKey = [
      normalizedQuery, queryNumber, semanticIds || "sin_intencion",
      bias ? `${bias.lat.toFixed(3)},${bias.lng.toFixed(3)}` : "sin_bias",
    ].join("|");

    const memoryHit = getCache(cacheKey);
    if (memoryHit) {
      const data = memoryHit.slice(0, limit);
      const exactMatch = data.some((item) => hasStrongExactAddressMatch(query, item));
      return new Response(JSON.stringify({
        exito: true, data, cached: true, source: "memory",
        exact_match: exactMatch, approximate_match: !exactMatch && data.length > 0,
      }), { headers: corsHeaders });
    }

    const dbHit = await loadDbCache(cacheKey);
    if (dbHit && dbHit.length) {
      setCache(cacheKey, dbHit);
      const data = dbHit.slice(0, limit);
      const exactMatch = data.some((item) => hasStrongExactAddressMatch(query, item));
      return new Response(JSON.stringify({
        exito: true, data, cached: true, source: "database",
        exact_match: exactMatch, approximate_match: !exactMatch && data.length > 0,
      }), { headers: corsHeaders });
    }

    const results = await searchSmart(query, limit, bias);
    const exactMatch = results.some((item) => hasStrongExactAddressMatch(query, item));
    setCache(cacheKey, results);
    await saveDbCache(cacheKey, results);

    return new Response(JSON.stringify({
      exito: true, data: results, cached: false, source: "nominatim",
      exact_match: exactMatch, approximate_match: !exactMatch && results.length > 0,
    }), { headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    const isAbort = isAbortLikeError(err);
    console.error("❌ Error geocodificar:", err);
    return new Response(JSON.stringify({
      exito: false,
      error: isAbort ? "Timeout consultando geocodificación" : message,
      data: [],
    }), { status: 500, headers: corsHeaders });
  }
});
