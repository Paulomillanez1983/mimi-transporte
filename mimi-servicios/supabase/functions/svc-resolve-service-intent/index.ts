import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CategoryRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  aliases?: string[] | null;
  search_keywords?: string[] | null;
  default_pricing_model?: string | null;
  requires_provider_quote?: boolean | null;
  parent_category_id?: string | null;
  source?: string | null;
  discovery_status?: string | null;
  auto_created?: boolean | null;
  match_signature?: string | null;
  usage_count?: number | null;
};

type IntentRuleRow = {
  category_id: string;
  phrase: string;
  keywords: string[];
  weight: number;
};

type ScoredMatch = {
  category_id: string;
  code: string;
  name: string;
  description: string | null;
  default_pricing_model: string;
  requires_provider_quote: boolean;
  score: number;
  confidence: number;
  matched_terms: string[];
  generic_only: boolean;
  auto_created?: boolean | null;
  discovery_status?: string | null;
  source?: string | null;
};

type DynamicCandidate = {
  code: string;
  name: string;
  description: string;
  keywords: string[];
  aliases: string[];
  phrase: string;
  signature: string;
  confidence: number;
  parent_category_id: string | null;
};

const STOPWORDS = new Set([
  "soy",
  "hago",
  "hacer",
  "ofrezco",
  "servicio",
  "servicios",
  "trabajo",
  "trabajos",
  "de",
  "del",
  "la",
  "las",
  "el",
  "los",
  "un",
  "una",
  "y",
  "en",
  "a",
  "al",
  "por",
  "para",
  "con",
  "mi",
  "mis",
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalize(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/g, "n")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string) {
  return normalize(value)
    .split(" ")
    .map((item) => item.trim())
    .filter((item) => item.length >= 3);
}

function significantTokens(value: string) {
  return tokenize(value)
    .filter((token) => !STOPWORDS.has(token))
    .filter((token) => token.length >= 4);
}

function titleCaseFromTokens(tokens: string[]) {
  return tokens
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function categoryCodeFromName(name: string) {
  const base = normalize(name)
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_]/gi, "")
    .toUpperCase()
    .slice(0, 48);

  return base || `AUTO_${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function signatureFromTokens(tokens: string[]) {
  return [...new Set(tokens.map(normalize).filter(Boolean))]
    .sort()
    .slice(0, 8)
    .join("|");
}

function findCategoryByCode(categories: CategoryRow[], code: string) {
  return categories.find((category) => normalize(category.code) === normalize(code)) ?? null;
}

function queryHasAny(query: string, words: string[]) {
  const normalized = normalize(query);
  return words.some((word) => normalized.includes(normalize(word)));
}

function dynamicCandidateForQuery(query: string, matches: ScoredMatch[], categories: CategoryRow[]): DynamicCandidate | null {
  const normalized = normalize(query);
  const tokens = significantTokens(normalized);
  const top = matches[0] ?? null;
  const strongMatches = matches.filter((match) => Number(match.score) >= 35);
  const matchedCodes = new Set(matches.map((match) => normalize(match.code)));

  if (!tokens.length) return null;

  const hairTerms = ["trenza", "trenzas", "pelo", "cabello", "corto pelo", "cortar pelo", "peinado"];
  if (queryHasAny(query, hairTerms) && matchedCodes.has("peluqueria")) {
    return null;
  }

  const cookingTerms = ["cocino", "cocina", "cocinero", "cocinera", "chef", "vianda", "viandas", "comida", "cocinar"];
  const domicileTerms = ["domicilio", "domicilios", "casa", "casas", "particular"];
  if (queryHasAny(query, cookingTerms) && (queryHasAny(query, domicileTerms) || !findCategoryByCode(categories, "COCINEROS_DOMICILIO"))) {
    const existing = findCategoryByCode(categories, "COCINEROS_DOMICILIO");
    if (!existing) {
      return {
        code: "COCINEROS_DOMICILIO",
        name: "Cocineros a domicilio",
        description: "Servicios de cocina, preparacion de comidas o viandas a coordinar con cada cliente.",
        keywords: ["cocina", "cocino", "cocinero", "cocinera", "chef", "comida", "viandas", "domicilio"],
        aliases: ["cocino a domicilio", "cocinero a domicilio", "cocinera a domicilio", "chef a domicilio"],
        phrase: query,
        signature: "chef|cocina|cocinero|comida|domicilio",
        confidence: 0.72,
        parent_category_id: findCategoryByCode(categories, "SERVICIO_DOMESTICO")?.id ?? null,
      };
    }
  }

  const matchedTerms = new Set(
    strongMatches.flatMap((match) => (match.matched_terms ?? []).flatMap((term) => tokenize(term)))
  );
  const uncovered = tokens.filter((token) => !matchedTerms.has(token));

  if (top && Number(top.score) >= 55 && uncovered.length < 2) {
    return null;
  }

  const candidateTokens = (uncovered.length ? uncovered : tokens).slice(0, 4);
  const signature = signatureFromTokens(candidateTokens);
  if (!signature) return null;

  const existingBySignature = categories.find((category) => normalize(category.match_signature ?? "") === normalize(signature));
  if (existingBySignature) return null;

  const name = titleCaseFromTokens(candidateTokens);
  const code = categoryCodeFromName(name);

  if (findCategoryByCode(categories, code)) return null;

  return {
    code,
    name,
    description: `Categoria creada automaticamente a partir de solicitudes reales: ${query.slice(0, 160)}.`,
    keywords: candidateTokens,
    aliases: [query.slice(0, 160)],
    phrase: query,
    signature,
    confidence: top ? 0.45 : 0.58,
    parent_category_id: top && Number(top.score) >= 25 ? top.category_id : null,
  };
}

function inferredKnownMatches(query: string, categories: CategoryRow[], currentMatches: ScoredMatch[]) {
  const inferred: ScoredMatch[] = [];
  const inferredIds = new Set<string>();

  const add = (code: string, terms: string[], confidence = 0.68) => {
    if (!queryHasAny(query, terms)) return;
    const category = findCategoryByCode(categories, code);
    if (!category?.id || inferredIds.has(category.id)) return;

    inferred.push({
      category_id: category.id,
      code: category.code,
      name: category.name,
      description: category.description,
      default_pricing_model: category.default_pricing_model ?? "HOURLY",
      requires_provider_quote: Boolean(category.requires_provider_quote),
      score: Math.round(confidence * 85),
      confidence,
      matched_terms: terms.filter((term) => queryHasAny(query, [term])).slice(0, 6),
      generic_only: false,
      auto_created: Boolean(category.auto_created),
      discovery_status: category.discovery_status ?? "approved",
      source: category.source ?? "system",
    });
    inferredIds.add(category.id);
  };

  add("PELUQUERIA", ["trenza", "trenzas", "pelo", "cabello", "corto pelo", "cortar pelo", "peinado", "corte de pelo"], 0.88);
  add("NUTRICION", ["nutricionista", "nutricion", "plan alimentario", "alimentacion"], 0.74);
  add("COCINA", ["cocino", "cocina", "cocinero", "cocinera", "chef", "vianda", "viandas", "comida"], 0.62);

  return inferred;
}

function dedupeMatchesByCategory(matches: ScoredMatch[]) {
  const byId = new Map<string, ScoredMatch>();

  for (const match of matches) {
    const previous = byId.get(match.category_id);
    if (!previous || Number(match.score) > Number(previous.score)) {
      byId.set(match.category_id, {
        ...previous,
        ...match,
        matched_terms: [...new Set([...(previous?.matched_terms ?? []), ...(match.matched_terms ?? [])])],
      });
    }
  }

  return [...byId.values()];
}

function isContextualFalsePositive(query: string, match: ScoredMatch) {
  const code = normalize(match.code);

  if (code === "electricidad") {
    const electricalTerms = ["electricidad", "electricista", "enchufe", "cable", "cableado", "termica", "disyuntor", "cortocircuito", "luz"];
    const hairTerms = ["pelo", "cabello", "corto pelo", "corte de pelo", "cortar pelo", "trenza", "trenzas"];
    const matchedOnlyShort = (match.matched_terms ?? []).every((term) => ["corto", "corte"].includes(normalize(term)));
    return matchedOnlyShort && queryHasAny(query, hairTerms) && !queryHasAny(query, electricalTerms);
  }

  return false;
}


async function createOrReuseDynamicCategory(
  supabase: ReturnType<typeof createClient>,
  query: string,
  candidate: DynamicCandidate,
  matches: ScoredMatch[],
) {
  const { data: existingBySignature } = await supabase
    .from("svc_categories")
    .select("id,code,name,description,default_pricing_model,requires_provider_quote,auto_created,discovery_status,source,usage_count")
    .eq("match_signature", candidate.signature)
    .maybeSingle();

  if (existingBySignature?.id) {
    await supabase
      .from("svc_categories")
      .update({
        usage_count: (existingBySignature.usage_count ?? 0) + 1,
        last_matched_at: new Date().toISOString(),
      })
      .eq("id", existingBySignature.id);

    await recordDiscoveryEvent(supabase, query, candidate, matches, existingBySignature.id, "reused_auto_category");
    return existingBySignature;
  }

  const { data: inserted, error } = await supabase
    .from("svc_categories")
    .insert({
      code: candidate.code,
      name: candidate.name,
      description: candidate.description,
      aliases: candidate.aliases,
      search_keywords: candidate.keywords,
      default_pricing_model: "QUOTE",
      requires_provider_quote: true,
      allowed_service_modes: ["IN_PERSON"],
      requires_professional_license: false,
      requires_background_check: false,
      parent_category_id: candidate.parent_category_id,
      source: "provider_discovery",
      discovery_status: "auto",
      auto_created: true,
      created_from_query: query,
      match_signature: candidate.signature,
      usage_count: 1,
      last_matched_at: new Date().toISOString(),
      active: true,
    })
    .select("id,code,name,description,default_pricing_model,requires_provider_quote,auto_created,discovery_status,source")
    .single();

  if (error) throw error;

  await supabase
    .from("svc_service_intent_rules")
    .insert({
      category_id: inserted.id,
      locale: "es-AR",
      phrase: candidate.phrase,
      keywords: candidate.keywords,
      weight: 1.2,
      active: true,
    });

  await recordDiscoveryEvent(supabase, query, candidate, matches, inserted.id, "created_auto_category");
  return inserted;
}

async function recordDiscoveryEvent(
  supabase: ReturnType<typeof createClient>,
  query: string,
  candidate: DynamicCandidate | null,
  matches: ScoredMatch[],
  categoryId: string | null,
  action: string,
) {
  await supabase.from("svc_category_discovery_events").insert({
    category_id: categoryId,
    parent_category_id: candidate?.parent_category_id ?? null,
    actor_type: "provider",
    source_context: "provider_service_setup",
    query,
    normalized_query: normalize(query),
    extracted_label: candidate?.name ?? null,
    match_signature: candidate?.signature ?? null,
    action,
    confidence: candidate?.confidence ?? matches[0]?.confidence ?? 0,
    matched_category_ids: matches.map((match) => match.category_id).filter(Boolean),
    metadata: {
      matched_codes: matches.map((match) => match.code).slice(0, 8),
      resolver: "svc-resolve-service-intent",
    },
  });
}

function scoreCategory(query: string, category: CategoryRow, rules: IntentRuleRow[]) {
  const normalizedQuery = normalize(query);
  const tokens = tokenize(normalizedQuery);
  const genericTerms = new Set([
    "casa",
    "casas",
    "hogar",
    "servicio",
    "servicios",
    "trabajo",
    "trabajos",
    "arreglo",
    "arreglos",
    "instalacion",
    "instalaciones",
    "cuidado",
    "limpieza",
    "domicilio",
    "domicilios",
  ]);
  const haystack = normalize([
    category.code,
    category.name,
    category.description,
    ...(Array.isArray(category.aliases) ? category.aliases : []),
    ...(Array.isArray(category.search_keywords) ? category.search_keywords : []),
  ].join(" "));

  let score = 0;
  const matched = new Set<string>();

  if (haystack.includes(normalizedQuery) && normalizedQuery.length >= 4) {
    score += 18;
    matched.add(normalizedQuery);
  }

  for (const token of tokens) {
    if (haystack.includes(token)) {
      score += 4;
      matched.add(token);
    }

    for (const word of haystack.split(" ")) {
      if (token.length >= 3 && word.startsWith(token)) {
        score += 3;
        matched.add(token);
        break;
      }
    }
  }

  for (const rule of rules) {
    const phrase = normalize(rule.phrase);
    const keywords = Array.isArray(rule.keywords) ? rule.keywords.map(normalize) : [];
    const weight = Number(rule.weight || 1);

    if (phrase && (normalizedQuery.includes(phrase) || phrase.includes(normalizedQuery))) {
      score += 16 * weight;
      matched.add(rule.phrase);
    }

    for (const keyword of keywords) {
      if (!keyword) continue;

      if (normalizedQuery.includes(keyword) || keyword.includes(normalizedQuery)) {
        score += (genericTerms.has(keyword) ? 1.2 : 7) * weight;
        matched.add(keyword);
        continue;
      }

      for (const token of tokens) {
        if (token.length >= 3 && keyword.split(" ").some((word) => word.startsWith(token))) {
          score += 3 * weight;
          matched.add(token);
          break;
        }
      }
    }
  }

  const confidence = Math.max(0, Math.min(0.98, score / 85));
  const matchedTerms = Array.from(matched).slice(0, 8);
  const genericOnly =
    matchedTerms.length > 0 &&
    matchedTerms.every((term) => genericTerms.has(normalize(term)));

  return {
    score,
    confidence,
    matched_terms: matchedTerms,
    generic_only: genericOnly,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ ok: false, error: "missing_supabase_env" }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const query = String(body?.query ?? body?.text ?? "").trim().slice(0, 500);
    const limit = Math.max(1, Math.min(Number(body?.limit ?? 5), 10));

    if (query.length < 3) {
      return json({
        ok: true,
        query,
        matches: [],
        top_match: null,
        message: "query_too_short",
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: categories, error: categoriesError } = await supabase
      .from("svc_categories")
      .select("id,code,name,description,aliases,search_keywords,default_pricing_model,requires_provider_quote,parent_category_id,source,discovery_status,auto_created,match_signature,usage_count")
      .eq("active", true);

    if (categoriesError) throw categoriesError;

    let rules: IntentRuleRow[] = [];
    const { data: ruleRows, error: rulesError } = await supabase
      .from("svc_service_intent_rules")
      .select("category_id,phrase,keywords,weight")
      .eq("active", true);

    if (!rulesError && Array.isArray(ruleRows)) {
      rules = ruleRows as IntentRuleRow[];
    }

    const categoryRows = (categories ?? []) as CategoryRow[];
    let matches = categoryRows
      .map((category) => {
        const categoryRules = rules.filter((rule) => rule.category_id === category.id);
        const scored = scoreCategory(query, category, categoryRules);

        return {
          category_id: category.id,
          code: category.code,
          name: category.name,
          description: category.description,
          default_pricing_model: category.default_pricing_model ?? "HOURLY",
          requires_provider_quote: Boolean(category.requires_provider_quote),
          score: scored.score,
          confidence: scored.confidence,
          matched_terms: scored.matched_terms,
          generic_only: scored.generic_only,
          auto_created: Boolean(category.auto_created),
          discovery_status: category.discovery_status ?? "approved",
          source: category.source ?? "system",
        };
      })
      .filter((item) => item.score > 0 && !("generic_only" in item && item.generic_only))
      .filter((item) => !isContextualFalsePositive(query, item))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    matches = dedupeMatchesByCategory([...matches, ...inferredKnownMatches(query, categoryRows, matches)])
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const dynamicCandidate = dynamicCandidateForQuery(query, matches, categoryRows);
    let dynamicCategory: CategoryRow | null = null;
    let finalMatches = matches;

    if (dynamicCandidate) {
      dynamicCategory = await createOrReuseDynamicCategory(supabase, query, dynamicCandidate, matches);

      if (dynamicCategory?.id && !matches.some((match) => match.category_id === dynamicCategory?.id)) {
        finalMatches = dedupeMatchesByCategory([
          ...matches,
          {
            category_id: dynamicCategory.id,
            code: dynamicCategory.code,
            name: dynamicCategory.name,
            description: dynamicCategory.description ?? dynamicCandidate.description,
            default_pricing_model: dynamicCategory.default_pricing_model ?? "QUOTE",
            requires_provider_quote: Boolean(dynamicCategory.requires_provider_quote ?? true),
            score: Math.max(30, Math.round(dynamicCandidate.confidence * 85)),
            confidence: dynamicCandidate.confidence,
            matched_terms: dynamicCandidate.keywords,
            generic_only: false,
            auto_created: Boolean(dynamicCategory.auto_created),
            discovery_status: dynamicCategory.discovery_status ?? "auto",
            source: dynamicCategory.source ?? "provider_discovery",
          },
        ])
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);
      }
    } else {
      await recordDiscoveryEvent(
        supabase,
        query,
        null,
        matches,
        matches[0]?.category_id ?? null,
        matches.length ? "matched_existing_category" : "no_category_created",
      );
    }

    return json({
      ok: true,
      query,
      top_match: finalMatches[0] ?? null,
      matches: finalMatches,
      dynamic_category: dynamicCategory
        ? {
            id: dynamicCategory.id,
            code: dynamicCategory.code,
            name: dynamicCategory.name,
            description: dynamicCategory.description,
            discovery_status: dynamicCategory.discovery_status ?? "auto",
            auto_created: Boolean(dynamicCategory.auto_created),
          }
        : null,
      resolver: rules.length ? "database_rules" : "category_keywords",
    });
  } catch (error) {
    console.error("[svc-resolve-service-intent]", error);
    return json({
      ok: false,
      error: error instanceof Error ? error.message : "unexpected_error",
    }, 400);
  }
});
