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
};

type IntentRuleRow = {
  category_id: string;
  phrase: string;
  keywords: string[];
  weight: number;
};

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

function scoreCategory(query: string, category: CategoryRow, rules: IntentRuleRow[]) {
  const normalizedQuery = normalize(query);
  const tokens = tokenize(normalizedQuery);
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
  }

  for (const rule of rules) {
    const phrase = normalize(rule.phrase);
    const keywords = Array.isArray(rule.keywords) ? rule.keywords.map(normalize) : [];
    const weight = Number(rule.weight || 1);

    if (phrase && normalizedQuery.includes(phrase)) {
      score += 16 * weight;
      matched.add(rule.phrase);
    }

    for (const keyword of keywords) {
      if (!keyword) continue;

      if (normalizedQuery.includes(keyword)) {
        score += 7 * weight;
        matched.add(keyword);
      }
    }
  }

  const confidence = Math.max(0, Math.min(0.98, score / 100));

  return {
    score,
    confidence,
    matched_terms: Array.from(matched).slice(0, 8),
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
      .select("id,code,name,description,aliases,search_keywords,default_pricing_model,requires_provider_quote")
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
    const matches = categoryRows
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
        };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return json({
      ok: true,
      query,
      top_match: matches[0] ?? null,
      matches,
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
