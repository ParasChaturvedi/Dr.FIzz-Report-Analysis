// src/lib/seo/geo/executionProvider.js
// ─────────────────────────────────────────────────────────────────────────────
// EXECUTION PROVIDER ABSTRACTION (Phase 3, item #4 + cost protection #7).
//
// Resolves a run's requested execution provider into a concrete, COST-GUARDED plan:
//   • local-playwright              — captured Chrome profiles on the worker host (no $)
//   • browserless                   — hosted Browserless (needs BROWSERLESS_TOKEN)
//   • browserless-residential-proxy — Browserless + residential IP (localized markets only)
//   • disabled                      — not configured → NO browser/Browserless call happens
//
// Guarantees (so paid calls never happen by accident):
//   • Browserless is enabled ONLY when BROWSERLESS_TOKEN is set.
//   • The residential proxy is enabled ONLY when the location mode is localized
//     (country/state/city) AND the run asked for it.
//   • If nothing is configured, `enabled:false` → the worker logs the reason and runs
//     no engine (no fake results, no cost).
// ─────────────────────────────────────────────────────────────────────────────

const LOCALIZED = new Set(["country", "state", "city"]);

/**
 * @param {object} run        the geo_runs doc (execution_provider, location_mode, residential_proxy_enabled, …)
 * @param {object} [opts]     { override } to force a provider (e.g. CLI --local / --browserless)
 * @returns {{provider, transport, residentialProxy, proxyCountry, enabled, reason}}
 */
export function resolveExecutionProvider(run = {}, opts = {}) {
  const requested = String(opts.override || run.execution_provider || "worker-playwright").toLowerCase();
  const hasToken = !!String(process.env.BROWSERLESS_TOKEN || "").trim();
  const locationMode = String(run.location_mode || "country").toLowerCase();
  const localized = LOCALIZED.has(locationMode);
  const proxyCountry = localized ? String(run.location_context?.country || run.country || "in").slice(0, 2).toLowerCase() : "";

  // explicit local Playwright — no Browserless, no cost
  if (requested.includes("local")) {
    return { provider: "local-playwright", transport: "local", residentialProxy: false, proxyCountry: "", enabled: true, reason: "local Playwright (captured profiles)" };
  }

  // residential proxy variant — only meaningful for a localized market
  const wantsResidential = requested.includes("residential") || (!!run.residential_proxy_enabled && localized);
  if (wantsResidential) {
    if (!hasToken) return disabled("BROWSERLESS_TOKEN not set — cannot use Browserless residential proxy");
    if (!localized) return { provider: "browserless", transport: "browserless", residentialProxy: false, proxyCountry: "", enabled: true, reason: "Browserless (residential skipped — location is global/international)" };
    return { provider: "browserless-residential-proxy", transport: "browserless", residentialProxy: true, proxyCountry, enabled: true, reason: `Browserless + residential proxy (${proxyCountry || "country"})` };
  }

  // plain Browserless (the worker-playwright default runs through Browserless when hosted)
  if (requested.includes("browserless") || requested.includes("worker")) {
    if (!hasToken) return disabled("BROWSERLESS_TOKEN not set — set it, or run the worker with --local for captured Chrome profiles");
    return { provider: "browserless", transport: "browserless", residentialProxy: false, proxyCountry: "", enabled: true, reason: "Browserless (hosted)" };
  }

  return disabled(`unknown execution provider "${requested}"`);
}

function disabled(reason) {
  return { provider: "disabled", transport: null, residentialProxy: false, proxyCountry: "", enabled: false, reason };
}

// Apply the resolved plan to the process env the existing collector reads (residential
// proxy + concurrency + retry + screenshot-on-error), honouring the run's cost limits.
// Returns a restore() to undo the env changes after the run.
export function applyExecutionEnv(plan, run = {}) {
  const prev = {};
  const set = (k, v) => { prev[k] = process.env[k]; if (v == null) delete process.env[k]; else process.env[k] = String(v); };
  // residential proxy ONLY when the plan enabled it (cost guard)
  set("BROWSERLESS_USE_RESIDENTIAL", plan.residentialProxy ? "1" : "0");
  if (plan.proxyCountry) set("BROWSERLESS_PROXY_COUNTRY", plan.proxyCountry);
  // concurrency + retry limits from the run config (#7)
  if (run.concurrency_limit) set("GEO_CONCURRENCY", Math.max(1, Math.min(12, Number(run.concurrency_limit) || 4)));
  if (run.max_retries != null) set("GEO_QUERY_ATTEMPTS", Math.max(1, (Number(run.max_retries) || 0) + 1));
  // screenshots only on error/debug (never "always" from a normal run)
  set("GEO_SCREENSHOT", run.screenshot_mode === "always" ? "1" : "0");
  return () => { for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } };
}

export default resolveExecutionProvider;
