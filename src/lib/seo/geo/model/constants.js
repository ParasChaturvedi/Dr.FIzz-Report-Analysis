// src/lib/seo/geo/model/constants.js
// ─────────────────────────────────────────────────────────────────────────────
// GEO MODULE — shared constants / enums (§14-25). Single source of truth for the
// VPS collector-worker AND the Vercel report layer, so both write/read the same
// vocabulary. Keep scoring weights HERE (configurable) — never hardcode them in UI
// components or scattered through the codebase (§21).
// ─────────────────────────────────────────────────────────────────────────────

// §15 — supported engines (stable keys used everywhere) + their UI labels.
export const GEO_ENGINES = ["chatgpt", "aioverviews", "gemini", "claude", "copilot", "perplexity"];
export const GEO_ENGINE_LABELS = {
  chatgpt: "ChatGPT",
  aioverviews: "Google AI Overview",
  gemini: "Gemini",
  claude: "Claude",
  copilot: "Copilot",
  perplexity: "Perplexity",
};
// Which engines need a logged-in browser session vs run without login.
export const NO_LOGIN_ENGINES = ["aioverviews", "perplexity", "claude"];
export const LOGIN_ENGINES = ["chatgpt", "gemini", "copilot"];

// §17 — prompt clusters (semantic) + intents.
export const GEO_CLUSTERS = [
  "Technical SEO", "Content SEO", "Local SEO", "GEO",
  "Brand comparison", "Product comparison", "Use-case comparison",
  "Pricing intent", "Best-tool intent", "Competitor intent",
  "Problem aware", "Solution aware", "Service category", "Location specific",
];
export const GEO_INTENTS = [
  "informational", "commercial", "comparison", "transactional",
  "local", "pricing", "competitor", "best-provider", "troubleshooting",
];

// ── §17 PROMPT-PLANNING maps (per-cluster behaviour for the generator) ─────────
// COMPARISON clusters may name competitor brands; all others are NEUTRAL — their
// prompt text MUST NOT contain the client's own brand, so Share-of-Voice stays
// organic (we measure whether the brand surfaces on its own for a generic query).
export const COMPARISON_CLUSTERS = ["Brand comparison", "Product comparison", "Use-case comparison", "Competitor intent"];
export const CLUSTER_IS_NEUTRAL = Object.fromEntries(GEO_CLUSTERS.map((c) => [c, !COMPARISON_CLUSTERS.includes(c)]));

// Clusters whose prompts get location-aware variants (city / region / country).
export const LOCALIZED_CLUSTERS = ["Local SEO", "GEO", "Location specific", "Service category", "Best-tool intent", "Pricing intent"];

// Default intent per cluster (one of GEO_INTENTS) — used when generation omits one.
export const CLUSTER_DEFAULT_INTENT = {
  "Technical SEO": "informational", "Content SEO": "informational", "Local SEO": "local",
  GEO: "informational", "Brand comparison": "comparison", "Product comparison": "comparison",
  "Use-case comparison": "comparison", "Pricing intent": "pricing", "Best-tool intent": "best-provider",
  "Competitor intent": "competitor", "Problem aware": "troubleshooting", "Solution aware": "informational",
  "Service category": "commercial", "Location specific": "local",
};

// Expected answer structure per cluster (one of ANSWER_STRUCTURES) — what a good AI
// answer to this prompt should look like; guides the Phase-3 parser + the UI.
export const CLUSTER_EXPECTED_ANSWER = {
  "Technical SEO": "list", "Content SEO": "list", "Local SEO": "list", GEO: "recommendation",
  "Brand comparison": "comparison", "Product comparison": "comparison", "Use-case comparison": "comparison",
  "Pricing intent": "table", "Best-tool intent": "recommendation", "Competitor intent": "comparison",
  "Problem aware": "paragraph", "Solution aware": "list", "Service category": "list", "Location specific": "list",
};

// Relative weight per cluster for quota distribution (§ "one topic must not dominate").
// Higher = more prompts. Brand/citation-revealing clusters get a little more; every
// cluster still gets a floor + a hard cap (applied in the planner) so the mix stays balanced.
export const CLUSTER_WEIGHT = {
  "Technical SEO": 0.8, "Content SEO": 1.0, "Local SEO": 1.2, GEO: 1.0,
  "Brand comparison": 1.0, "Product comparison": 0.9, "Use-case comparison": 0.9,
  "Pricing intent": 0.8, "Best-tool intent": 1.2, "Competitor intent": 1.1,
  "Problem aware": 0.9, "Solution aware": 0.9, "Service category": 1.0, "Location specific": 1.1,
};

// §16 — location modes.
export const LOCATION_MODES = ["global", "international", "country", "state", "city"];

// §24 — citation classes (18) + the action types they map to.
export const CITATION_CLASSES = [
  "business_directory", "review_site", "reddit", "social_media", "wikipedia",
  "pr_news", "listings", "forums", "communities", "marketplace", "blog",
  "educational", "government", "partner_page", "competitor_page",
  "comparison_page", "resource_page", "unknown",
];
export const ACTION_TYPES = [
  "monitor", "outreach", "claim_listing", "request_correction",
  "build_similar_page", "create_backlink_target", "no_action", "citation_only",
];
export const EDITORIAL_CONTROL = [
  "owned", "claimable", "outreach_possible", "third_party_controlled", "no_control",
];
export const DIFFICULTY = ["low", "medium", "high", "very_high"];

// Citation relationship (§23) + entity types (§ mentions).
export const RELATIONSHIP_STRENGTH = ["direct", "indirect", "weakly_related"];
export const ENTITY_TYPES = ["brand", "competitor", "third_party"];

// §19 — account/session statuses.
export const SESSION_STATUSES = ["active", "expired", "needs_reauth", "blocked", "rate_limited", "disabled"];

// Run / result lifecycle. "draft" = planned in Phase 2 (prompts generated, NOT yet
// queued for the worker); the worker only claims "queued"/"running" (see claimNextGeoJob).
export const RUN_STATUSES = ["draft", "queued", "running", "collecting", "parsing", "scoring", "completed", "partial", "failed"];
// Prompt approval lifecycle (§ approve/edit prompts before execution).
export const PROMPT_STATUSES = ["pending", "approved", "rejected", "edited"];
export const RESULT_STATUSES = ["queued", "running", "success", "error", "retrying", "skipped"];

// §18 — validation confidence bands.
export const CONFIDENCE_LEVELS = ["high", "medium", "low", "very_low"];

// Answer-structure classes (§ prompt-level evidence "answer was list/paragraph/table…").
export const ANSWER_STRUCTURES = ["list", "paragraph", "table", "comparison", "recommendation", "mixed", "unknown"];

// §21 — WEIGHTED GEO MODEL (configurable; sum = 1.0). Read by the scoring engine.
export const GEO_SCORE_WEIGHTS = {
  citation_presence: 0.30,
  brand_presence: 0.20,
  citation_position: 0.15,
  intent_match: 0.15,
  cross_engine_consistency: 0.10,
  freshness: 0.05,
  topic_coverage: 0.05,
};

// §21 — citation-position scoring ladder. 1st=100 … 5th=40, 6th+=25, not-cited=0.
const _POS_LADDER = { 1: 100, 2: 85, 3: 70, 4: 55, 5: 40 };
export function citationPositionScore(order) {
  const o = Number(order);
  if (!Number.isFinite(o) || o <= 0) return 0;
  return _POS_LADDER[o] ?? 25;
}

// §24 — link-opportunity score weighting (configurable; sum = 1.0).
export const OPPORTUNITY_WEIGHTS = {
  relevance: 0.40,
  authority: 0.25,
  editorial_control: 0.20,
  difficulty_inverse: 0.15,
};

// ── COST CONTROL — run modes, execution providers, cost model ────────────────
// The GEO system must be cost-effective: Browserless / residential proxy / validation
// accounts must NOT fire on every prompt × engine × account by default.

// Run modes (DEFAULT is "standard" — Full GEO is an advanced, higher-cost opt-in).
export const RUN_MODES = ["dev_smoke", "standard", "full", "validation"];
export const DEFAULT_RUN_MODE = "standard";

// Execution-provider abstraction — Browserless is NOT hardcoded as the only path.
export const EXECUTION_PROVIDERS = ["local-playwright", "worker-playwright", "browserless", "browserless-residential-proxy"];
export const DEFAULT_EXECUTION_PROVIDER = "worker-playwright";

export const COST_LEVELS = ["low", "medium", "high", "full"];
export const SCREENSHOT_MODES = ["off", "on_error", "always"];

// Cost-safe presets per run mode. Standard = the default; Full is opt-in.
export const RUN_MODE_PRESETS = {
  dev_smoke:  { label: "Dev / Smoke Test", prompt_limit: 25,  default_engines: ["aioverviews", "perplexity"], validation_enabled: false, validation_sample_percent: 0,  residential_proxy_default: false, cost_level: "low",    screenshot_mode: "on_error" },
  standard:   { label: "Standard GEO",     prompt_limit: 80,  default_engines: GEO_ENGINES,                    validation_enabled: false, validation_sample_percent: 0,  residential_proxy_default: false, cost_level: "medium", screenshot_mode: "on_error" },
  full:       { label: "Full GEO",         prompt_limit: 250, default_engines: GEO_ENGINES,                    validation_enabled: true,  validation_sample_percent: 15, residential_proxy_default: false, cost_level: "full",   screenshot_mode: "on_error" },
  validation: { label: "Validation",       prompt_limit: 50,  default_engines: GEO_ENGINES,                    validation_enabled: true,  validation_sample_percent: 25, residential_proxy_default: false, cost_level: "high",   screenshot_mode: "on_error" },
};

// Prompt-volume band per run mode (§ run modes). The planner targets the UPPER bound
// and lands anywhere in the band based on how much real project data is available.
export const RUN_MODE_PROMPT_RANGE = {
  dev_smoke: [20, 25], standard: [60, 80], full: [150, 250], validation: [40, 50],
};
// Friendly aliases → canonical run-mode keys (so "smoke" resolves to "dev_smoke").
export const RUN_MODE_ALIASES = { smoke: "dev_smoke", dev: "dev_smoke", "dev-smoke": "dev_smoke", default: "standard", production: "full" };
export function normalizeRunMode(mode) {
  const m = String(mode || "").trim().toLowerCase();
  if (RUN_MODE_PRESETS[m]) return m;
  if (RUN_MODE_ALIASES[m]) return RUN_MODE_ALIASES[m];
  return DEFAULT_RUN_MODE;
}

// ── Phase 2.5 — DATA READINESS / PLAN DEPTH ───────────────────────────────────
// GEO prompts are PLANNED from the FULL DoctorFizz dataset (Steps 1-5 + Step 5B), not
// just the Step-1 website. These enums describe how much real data backed a plan and
// which sources were used. CRITICAL SEPARATION: DataForSEO / Moz / SERP / audit data
// feed PROMPT PLANNING + CONTEXT ONLY — they NEVER become a GEO result or score. The
// GEO score is computed in Phase 3 from real LLM/browser answers. Never mix the two.
export const DATA_READINESS_STATUSES = ["website_only", "audit_partial", "seo_data_ready", "step5b_ready", "full_ready"];
export const DATA_SOURCES = [
  "step1_website", "step2_business_context", "step3_keywords", "step4_competitors", "step5_audit",
  "step5b_dataforseo", "step5b_moz", "step5b_serp", "step5b_backlinks", "step5b_authority", "step5b_competitor_data",
];
export const GEO_PROMPT_CONFIDENCE = ["low", "medium", "high"];

// Plan DEPTH (how much data) — distinct from run mode (prompt VOLUME). Production = "full".
//   quick → Step-1 website + basic crawl/audit only (low confidence, clearly "basic")
//   full  → Steps 1-5 + 5B (DataForSEO/Moz/SERP/competitor) — the production default
export const GEO_PLAN_MODES = ["quick", "full"];
export const DEFAULT_GEO_PLAN_MODE = "full";
export const GEO_PLAN_MODE_ALIASES = { basic: "quick", quick: "quick", website_only: "quick", fast: "quick", full: "full", production: "full", complete: "full", standard: "full" };
export function normalizeGeoPlanMode(mode) {
  const m = String(mode || "").trim().toLowerCase();
  return GEO_PLAN_MODE_ALIASES[m] || DEFAULT_GEO_PLAN_MODE;
}

// Per-engine, per-query cost estimate (USD) — configurable. Browser engines cost a
// Browserless query; Claude runs via API (cheaper). Residential proxy adds a multiplier.
export const ENGINE_QUERY_COST_USD = { aioverviews: 0.02, perplexity: 0.02, chatgpt: 0.025, gemini: 0.025, copilot: 0.025, claude: 0.006 };
export const RESIDENTIAL_PROXY_MULTIPLIER = 1.6;
// Validation re-runs a SUBSET of prompts across extra accounts — clamp the sample.
export const VALIDATION_SAMPLE_BOUNDS = { min_percent: 10, max_percent: 25 };

// Mongo collection names for the GEO subsystem (§ Required Database Models).
export const GEO_COLLECTIONS = {
  projects: "geo_projects",
  prompts: "geo_prompts",
  clusters: "geo_prompt_clusters",
  runs: "geo_runs",                       // also the JOB QUEUE (status: queued → worker claims)
  results: "geo_run_results",
  mentions: "geo_mentions",
  citations: "geo_citations",
  citationClasses: "geo_citation_classes",
  opportunities: "geo_opportunities",
  competitors: "geo_competitors",
  engineMetrics: "geo_engine_metrics",
  overallMetrics: "geo_overall_metrics",
  validation: "geo_validation_results",
  storytelling: "geo_storytelling_sections",   // Claude narrative, stored + fetched in report
  rawAnswerVersions: "geo_raw_answer_versions", // immutable raw-answer history (never overwritten)
  errors: "geo_errors",                         // every failed run/retry, for collection-health UI
  accounts: "geo_accounts",
  sessionArtifacts: "geo_session_artifacts",
};
