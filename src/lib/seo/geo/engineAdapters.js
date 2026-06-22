// src/lib/seo/geo/engineAdapters.js
// ─────────────────────────────────────────────────────────────────────────────
// ENGINE ADAPTER INTERFACE (Phase 3, item #5).
//
// A formal, uniform contract over the 6 supported engines. The ACTUAL browser/API
// work is the existing collector (collector.js → askEngine/askInContext) — this layer
// adds a PREFLIGHT capability check so the worker + report know, WITHOUT running anything
// or spending a cent, whether each engine is runnable:
//
//   status: "ready"            — runnable now
//           "session_required" — login engine with no captured session
//           "not_configured"   — missing prerequisite (e.g. ANTHROPIC_API_KEY for Claude)
//           "disabled"         — execution provider not configured (no Browserless/local)
//
// The adapter contract (what every engine satisfies):
//   { engine, name, type:"chat"|"search"|"api", needs_session, status, reason, run(prompt,…) }
// where run() simply delegates to the existing collector — built so a future per-engine
// override can replace just one adapter without touching the others.
// ─────────────────────────────────────────────────────────────────────────────
import { ENGINES } from "./collector.js";
import { availableLoginEngines } from "./sessions.js";

const LOGIN_ENGINE = (cfg) => cfg.type !== "api" && !!cfg.needsSession;

/**
 * Preflight every engine against the current config + execution provider.
 * @param {object} [opts] { provider } resolved execution provider (executionProvider.js)
 * @returns {Promise<Record<string, {engine,name,type,needs_session,status,reason}>>}
 */
export async function getEngineAdapters({ provider } = {}) {
  let withSession = [];
  try { withSession = await availableLoginEngines(); } catch { withSession = []; }
  const hasAnthropic = !!String(process.env.ANTHROPIC_API_KEY || "").trim();
  const out = {};

  for (const key of Object.keys(ENGINES)) {
    const cfg = ENGINES[key];
    let status, reason;

    if (cfg.type === "api") {
      // Claude — API engine, no browser/session; needs the Anthropic key.
      status = hasAnthropic ? "ready" : "not_configured";
      reason = hasAnthropic ? "Anthropic API (web_search)" : "ANTHROPIC_API_KEY not set";
    } else if (LOGIN_ENGINE(cfg)) {
      // ChatGPT / Gemini / Copilot — need a captured logged-in session.
      const has = withSession.includes(key);
      status = has ? "ready" : "session_required";
      reason = has ? "session captured" : `login session required — run: node scripts/geo-capture.mjs ${key}`;
    } else {
      // AI Overviews / Perplexity — no login required.
      status = "ready";
      reason = "no login required";
    }

    // Provider gate: a browser engine can't run if the execution provider is disabled.
    if (provider && provider.enabled === false && cfg.type !== "api") {
      status = "disabled";
      reason = provider.reason || "execution provider not configured";
    }

    out[key] = { engine: key, name: cfg.name, type: cfg.type, needs_session: LOGIN_ENGINE(cfg), status, reason };
  }
  return out;
}

/** The subset of `requested` engines that are runnable right now (status "ready"). */
export function runnableEngines(adapters, requested) {
  const keys = Array.isArray(requested) && requested.length ? requested : Object.keys(adapters);
  return keys.filter((k) => adapters[k]?.status === "ready");
}

/** Engines that are requested but NOT runnable, with their reason (for honest reporting). */
export function blockedEngines(adapters, requested) {
  const keys = Array.isArray(requested) && requested.length ? requested : Object.keys(adapters);
  return keys.filter((k) => adapters[k] && adapters[k].status !== "ready").map((k) => adapters[k]);
}

// Map an adapter status → the geo_error.error_type used when logging a skipped engine.
export function statusToErrorType(status) {
  if (status === "session_required") return "session_expired";
  if (status === "not_configured" || status === "disabled") return "blocked";
  return "other";
}

export default getEngineAdapters;
