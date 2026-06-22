// src/lib/seo/geo/worker.js
// ─────────────────────────────────────────────────────────────────────────────
// GEO WORKER (Phase 3) — the job runner that executes a queued GEO run end-to-end,
// REUSING the existing browser automation (collector.js) rather than duplicating it:
//
//   claim/queued run → load APPROVED prompts (MongoDB) → runGeoScan() collects REAL
//   answers from each LLM UI via Playwright/Browserless → parseAnswer() extracts
//   mentions/citations → saveRunResult() persists raw + parsed (versioned) →
//   computeGeoMetrics() scores from the REAL results → save engine/overall metrics →
//   mark run completed/partial.
//
// Runs on a dedicated worker (NOT Vercel — long browser jobs). Vercel only QUEUES runs.
// Transports (from collector.js): "browserless" (hosted, needs BROWSERLESS_TOKEN) or
// "local" (captured Chrome profiles, for dev). mode:"mock" exercises the whole pipeline
// with synthetic answers (no browser) for testing. NOTHING here fabricates GEO data —
// metrics are computed only from what the engines actually returned; login engines with
// no session produce an honest "session required" error, not a fake answer.
// ─────────────────────────────────────────────────────────────────────────────
import { runGeoScan, ENGINES } from "./collector.js";
import { parseAnswer } from "./geoParser.js";
import { computeGeoMetrics } from "./geoScoring.js";
import { loadGeoSessions } from "./sessions.js";
import {
  getGeoProject, getGeoPrompts, updateGeoRun,
  saveRunResult, saveEngineMetrics, saveOverallMetrics, claimNextGeoJob, logGeoError,
} from "./model/geoStore.js";

const ENGINE_KEY_BY_NAME = Object.fromEntries(Object.entries(ENGINES).map(([k, v]) => [String(v.name || "").toLowerCase(), k]));
const nowIso = () => new Date().toISOString();
const APPROX_COST = { aioverviews: 0.02, perplexity: 0.02, chatgpt: 0.025, gemini: 0.025, copilot: 0.025, claude: 0.006 };

function chooseTransport(run, override) {
  if (override) return override;
  const ep = String(run?.execution_provider || "");
  if (ep.includes("local")) return "local";
  return "browserless";
}

/**
 * Execute ONE GEO run end-to-end. Returns { ok, runId, saved, failed, status, metrics }.
 * @param {object} run    the geo_runs doc (from claimNextGeoJob or fetched)
 * @param {object} opts   { transport?, mode? ("live"|"mock"), engineKeys?, onProgress? }
 */
export async function runGeoJob(run, opts = {}) {
  const runId = run.run_id;
  const projectId = run.geo_project_id;
  const project = await getGeoProject(projectId);
  if (!project) { await updateGeoRun(runId, { status: "failed", error: "project not found", completed_at: nowIso() }); return { ok: false, error: "project not found" }; }

  // approved prompts (fall back to all generated if none explicitly approved)
  let prompts = await getGeoPrompts(projectId, { status: "approved" });
  if (!prompts.length) prompts = await getGeoPrompts(projectId);
  if (run.prompt_limit) prompts = prompts.slice(0, run.prompt_limit);
  if (!prompts.length) { await updateGeoRun(runId, { status: "failed", error: "no prompts to run", completed_at: nowIso() }); return { ok: false, error: "no prompts" }; }

  const brand = project.brand_name || run.target_brand || "";
  const brandDomain = project.brand_domain || "";
  const competitors = (project.competitors || []).map((c) => (typeof c === "string" ? { name: c, domain: "" } : { name: c.name || c.brand || "", domain: c.domain || "" })).filter((c) => c.name || c.domain);
  const competitorDomains = competitors.map((c) => c.domain).filter(Boolean);
  const engineKeys = opts.engineKeys || run.selected_engines || run.engines || ["aioverviews", "perplexity", "claude"];
  const transport = chooseTransport(run, opts.transport);
  const mode = opts.mode || "live";

  // sessions for the login engines (best-effort; missing → those engines error honestly)
  const sessions = await loadGeoSessions().catch(() => ({}));

  await updateGeoRun(runId, { status: "running", started_at: run.started_at || nowIso() });

  const scanPrompts = prompts.map((p) => ({ id: p.prompt_id, prompt: p.prompt_text || p.prompt, brand }));
  const ctx = { brand, brandDomain, competitors };

  // ── REUSE the existing collector to do the real browser collection ──
  const scan = await runGeoScan({
    mode, transport,
    brand, clientDomain: brandDomain,
    competitors: competitors.map((c) => c.name), competitorDomains,
    location: project.country || "",
    proxyCountry: String(project.country || "in").slice(0, 2).toLowerCase() || "in",
    engineKeys, sessions, prompts: scanPrompts,
  });

  // ── parse + persist each REAL response (raw + parsed, versioned) ──
  const parsed = [];
  const perEngine = {};
  let saved = 0, failed = 0, cost = 0;
  for (const resp of (scan.responses || [])) {
    const result = parseAnswer(resp, ctx);
    await saveRunResult({ runId, projectId, result });
    parsed.push(result);
    saved++; perEngine[result.engine] = (perEngine[result.engine] || 0) + 1;
    cost += APPROX_COST[result.engine] ?? 0.02;
    opts.onProgress?.({ saved, failed, engine: result.engine });
  }
  for (const err of (scan.errors || [])) {
    const ek = ENGINE_KEY_BY_NAME[String(err.engine || "").toLowerCase()] || String(err.engine || "").toLowerCase();
    const msg = String(err.error || "");
    await logGeoError({ geo_project_id: projectId, geo_run_id: runId, prompt_id: err.promptId || null, engine: ek, error_type: /session|login|storageState/i.test(msg) ? "session_expired" : (/timeout/i.test(msg) ? "timeout" : "other"), message: msg.slice(0, 400) });
    failed++;
  }

  // ── score from the REAL parsed results (empty → zeros, never invented) ──
  const metrics = computeGeoMetrics(parsed, ctx);
  await saveEngineMetrics(runId, metrics.engines.map((e) => ({ engine: e, ...metrics.by_engine[e] })));
  await saveOverallMetrics(runId, { ...metrics.overall, share_of_voice: metrics.share_of_voice, engines: metrics.engines });

  const status = saved > 0 ? (failed > 0 ? "partial" : "completed") : "failed";
  await updateGeoRun(runId, {
    status, completed_at: nowIso(),
    completed_count: saved, failed_count: failed, valid_result_count: saved, error_count: failed,
    per_engine_progress: perEngine, actual_cost_usd: Math.round(cost * 100) / 100,
    geo_score: metrics.overall.geo_score, overall_sov: metrics.overall.sov,
  });
  return { ok: true, runId, saved, failed, status, metrics };
}

/**
 * Standalone worker loop for the dedicated VPS host: atomically claim the next queued
 * run and execute it, forever (or once). Vercel only creates "queued" runs.
 */
export async function runWorkerLoop({ transport, mode, pollMs = 5000, once = false } = {}) {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let run = null;
    try { run = await claimNextGeoJob(); } catch (e) { console.error("[geo-worker] claim error:", e?.message); }
    if (run) {
      console.log(`[geo-worker] claimed run ${run.run_id} (${(run.selected_engines || run.engines || []).join(",")})`);
      try {
        const r = await runGeoJob(run, { transport, mode });
        console.log(`[geo-worker] run ${run.run_id} → ${r.status} (${r.saved} saved, ${r.failed} failed)`);
      } catch (e) {
        console.error(`[geo-worker] run ${run.run_id} failed:`, e?.message);
        try { await updateGeoRun(run.run_id, { status: "failed", error: String(e?.message || e).slice(0, 400), completed_at: nowIso() }); } catch {}
      }
    }
    if (once) return;
    await new Promise((r) => setTimeout(r, run ? 250 : pollMs));
  }
}

export default runGeoJob;
