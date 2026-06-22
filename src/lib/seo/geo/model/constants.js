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
  "commercial", "informational", "comparison", "local", "navigational",
  "transactional", "best-tool", "problem-aware", "solution-aware",
];

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

// Run / result lifecycle.
export const RUN_STATUSES = ["queued", "running", "collecting", "parsing", "scoring", "completed", "partial", "failed"];
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
