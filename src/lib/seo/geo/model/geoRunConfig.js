// src/lib/seo/geo/model/geoRunConfig.js
// ─────────────────────────────────────────────────────────────────────────────
// GEO COST CONTROL — resolve a user's run request (mode + overrides) into a full,
// cost-controlled config, and ESTIMATE the run size/cost BEFORE collection starts.
// Defaults are cost-safe: Standard mode (60-80 prompts), no residential proxy unless
// a local market is selected, validation off, screenshots on-error only, cache reuse on.
// Browserless / residential proxy / validation accounts never multiply cost by default.
// ─────────────────────────────────────────────────────────────────────────────
import {
  RUN_MODE_PRESETS, DEFAULT_RUN_MODE, DEFAULT_EXECUTION_PROVIDER, GEO_ENGINES,
  ENGINE_QUERY_COST_USD, RESIDENTIAL_PROXY_MULTIPLIER, VALIDATION_SAMPLE_BOUNDS, LOCATION_MODES,
} from "./constants";

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(+n) ? +n : lo));
const isLocalized = (mode) => mode === "country" || mode === "state" || mode === "city";

/** Resolve a user's run request into a complete, cost-controlled GeoRunConfig. */
export function resolveGeoRunConfig(input = {}) {
  const run_mode = RUN_MODE_PRESETS[input.run_mode] ? input.run_mode : DEFAULT_RUN_MODE;
  const preset = RUN_MODE_PRESETS[run_mode];

  // Engines: honour a user-selected subset (don't run all 6 if they picked specific ones).
  const requested = Array.isArray(input.selected_engines) && input.selected_engines.length
    ? input.selected_engines.filter((e) => GEO_ENGINES.includes(e))
    : preset.default_engines;
  const selected_engines = requested.length ? [...new Set(requested)] : [...preset.default_engines];

  const prompt_limit = clamp(input.prompt_limit ?? preset.prompt_limit, 1, 250);
  const location_mode = LOCATION_MODES.includes(input.location_mode) ? input.location_mode : "country";

  // Residential proxy ONLY when a local market (country/state/city) is selected — never
  // for Global/International (avoids the proxy cost when it adds nothing).
  const residential_proxy_enabled = isLocalized(location_mode)
    ? (input.residential_proxy_enabled ?? preset.residential_proxy_default ?? true)
    : false;

  // Validation: a SUBSET only, clamped to 10-25%; off unless the mode/user enables it.
  const validation_enabled = input.validation_enabled ?? preset.validation_enabled ?? false;
  const validation_sample_percent = validation_enabled
    ? clamp(input.validation_sample_percent ?? preset.validation_sample_percent ?? VALIDATION_SAMPLE_BOUNDS.min_percent,
            VALIDATION_SAMPLE_BOUNDS.min_percent, VALIDATION_SAMPLE_BOUNDS.max_percent)
    : 0;

  const execution_provider = input.execution_provider
    || (residential_proxy_enabled ? "browserless-residential-proxy" : DEFAULT_EXECUTION_PROVIDER);

  const base = {
    run_mode,
    selected_engines,
    prompt_limit,
    validation_enabled,
    validation_sample_percent,
    location_mode,
    proxy_enabled: residential_proxy_enabled,
    residential_proxy_enabled,
    execution_provider,
    max_retries: clamp(input.max_retries ?? 2, 0, 5),
    concurrency_limit: clamp(input.concurrency_limit ?? 4, 1, 12),
    cache_reuse_enabled: input.cache_reuse_enabled ?? true,
    force_refresh: !!input.force_refresh,
    screenshot_mode: input.screenshot_mode || preset.screenshot_mode || "on_error",
    budget_limit: input.budget_limit != null ? Number(input.budget_limit) : null,
    stopped_by_user: false,
  };
  const est = estimateGeoRun(base, prompt_limit);
  return {
    ...base,
    estimated_engine_runs: est.estimated_engine_runs,
    estimated_cost_level: est.estimated_cost_level,
    estimated_cost_usd: est.estimated_cost_usd,
  };
}

/** Estimate run size + cost BEFORE collection (shown in the pre-run estimator UI). */
export function estimateGeoRun(config = {}, promptCount) {
  const prompts = clamp(promptCount ?? config.prompt_limit ?? 0, 0, 250);
  const engines = (config.selected_engines && config.selected_engines.length) ? config.selected_engines : GEO_ENGINES;
  const proxyMult = config.residential_proxy_enabled ? RESIDENTIAL_PROXY_MULTIPLIER : 1;

  const subset = (config.validation_enabled && config.validation_sample_percent > 0)
    ? Math.ceil(prompts * (config.validation_sample_percent / 100)) : 0;
  const validationAccounts = 2; // extra clean accounts for the validation subset
  const estimated_engine_runs = prompts * engines.length + subset * engines.length * validationAccounts;

  let cost = 0;
  for (const e of engines) {
    const per = ENGINE_QUERY_COST_USD[e] ?? 0.02;
    const mult = e === "claude" ? 1 : proxyMult; // Claude is API; browser engines pay the proxy multiplier
    cost += per * mult * prompts;
    if (subset) cost += per * mult * subset * validationAccounts;
  }
  const estimated_cost_usd = Math.round(cost * 100) / 100;

  let estimated_cost_level = "low";
  if (estimated_engine_runs > 900) estimated_cost_level = "full";
  else if (estimated_engine_runs > 360) estimated_cost_level = "high";
  else if (estimated_engine_runs > 120) estimated_cost_level = "medium";

  return {
    prompt_count: prompts,
    engine_count: engines.length,
    estimated_engine_runs,
    estimated_cost_usd,
    estimated_cost_level,
    browserless_used: engines.some((e) => e !== "claude") && String(config.execution_provider || "").startsWith("browserless"),
    residential_proxy_used: !!config.residential_proxy_enabled,
    validation_used: !!config.validation_enabled,
    validation_subset: subset,
  };
}
