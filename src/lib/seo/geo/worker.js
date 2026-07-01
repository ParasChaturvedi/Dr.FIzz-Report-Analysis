// src/lib/seo/geo/worker.js
// ─────────────────────────────────────────────────────────────────────────────
// GEO WORKER (Phase 3) — executes a queued GEO run end-to-end, REUSING the existing
// browser automation (collector.js) and the Phase-3 abstractions:
//
//   claim/queued run → resolve execution provider (cost-guarded) → preflight engine
//   adapters → load APPROVED prompts → for each READY engine: runGeoScan() (REUSED) →
//   parseAnswer → saveRunResult (raw+parsed, versioned) → save errors/retries →
//   computeGeoMetrics() over REAL results → persist engine/overall metrics → mark
//   completed / partial / failed / session_required.
//
// Cost protection (#7): NO Browserless call unless the provider is configured AND the
// engine is "ready"; residential proxy only for localized markets; screenshots on-error
// only; concurrency + retry limits from the run; stop-run honoured between engines.
// NOTHING fabricates GEO data — blocked engines log session_required / not_configured.
// ─────────────────────────────────────────────────────────────────────────────
import { runGeoScan, ENGINES } from "./collector.js";
import { parseAnswer } from "./geoParser.js";
import { computeGeoMetrics } from "./geoScoring.js";
import { loadGeoSessions } from "./sessions.js";
import { resolveExecutionProvider, applyExecutionEnv } from "./executionProvider.js";
import { getEngineAdapters, runnableEngines, blockedEngines, statusToErrorType } from "./engineAdapters.js";
import { generateGeoStorytelling } from "./geoStorytelling.js";
import {
  getGeoProject, getGeoPrompts, getGeoRun, updateGeoRun,
  saveRunResult, saveEngineMetrics, saveOverallMetrics, saveStorytelling, claimNextGeoJob, logGeoError,
} from "./model/geoStore.js";

// citation breakdown from the parsed results (feeds the storytelling + report detail).
function citationAnalysisFromParsed(parsed = []) {
  const agg = {}; let brand = 0, comp = 0, third = 0;
  for (const r of parsed) for (const c of (r.citations || [])) {
    if (c.is_brand_domain) brand++; else if (c.is_competitor_domain) comp++; else third++;
    const d = c.cited_domain; if (!d) continue;
    agg[d] = agg[d] || { domain: d, count: 0, type: c.is_brand_domain ? "brand" : c.is_competitor_domain ? "competitor" : "third_party" };
    agg[d].count++;
  }
  return { total: brand + comp + third, brand, competitor: comp, third_party: third, top_source_domains: Object.values(agg).sort((a, b) => b.count - a.count).slice(0, 10) };
}

const ENGINE_KEY_BY_NAME = Object.fromEntries(Object.entries(ENGINES).map(([k, v]) => [String(v.name || "").toLowerCase(), k]));
const nowIso = () => new Date().toISOString();
const APPROX_COST = { aioverviews: 0.02, perplexity: 0.02, chatgpt: 0.025, gemini: 0.025, copilot: 0.025, claude: 0.006 };

/**
 * Execute ONE GEO run end-to-end. Returns { ok, runId, saved, failed, status, provider, metrics }.
 * @param {object} run    the geo_runs doc (from claimNextGeoJob or fetched)
 * @param {object} opts   { transport? ("local"|"browserless"), mode? ("live"|"mock"), engineKeys?, onProgress? }
 */
export async function runGeoJob(run, opts = {}) {
  const runId = run.run_id;
  const projectId = run.geo_project_id;
  const project = await getGeoProject(projectId);
  if (!project) { await updateGeoRun(runId, { status: "failed", error: "project not found", completed_at: nowIso() }); return { ok: false, error: "project not found" }; }

  // APPROVED prompts only (#2 / item 2). The queue endpoint enforces approval; the worker
  // is strict too — but in mock mode it falls back to all so the pipeline stays testable.
  let prompts = await getGeoPrompts(projectId, { status: "approved" });
  if (!prompts.length && opts.mode === "mock") prompts = await getGeoPrompts(projectId);
  if (run.prompt_limit) prompts = prompts.slice(0, run.prompt_limit);
  if (!prompts.length) { await updateGeoRun(runId, { status: "failed", error: "no approved prompts to run", completed_at: nowIso() }); return { ok: false, error: "no approved prompts" }; }

  const brand = project.brand_name || run.target_brand || "";
  const brandDomain = project.brand_domain || "";
  const competitors = (project.competitors || []).map((c) => (typeof c === "string" ? { name: c, domain: "" } : { name: c.name || c.brand || "", domain: c.domain || "" })).filter((c) => c.name || c.domain);
  const competitorDomains = competitors.map((c) => c.domain).filter(Boolean);
  const selectedEngines = opts.engineKeys || run.selected_engines || run.engines || ["aioverviews", "perplexity", "claude"];
  const mode = opts.mode || "live";

  // ── execution provider (cost-guarded) + engine adapter preflight ──
  const override = opts.transport === "local" ? "local-playwright" : (opts.transport === "browserless" ? "browserless" : undefined);
  const provider = mode === "mock"
    ? { provider: "mock", transport: "browserless", residentialProxy: false, proxyCountry: "", enabled: true, reason: "mock pipeline (no browser)" }
    : resolveExecutionProvider(run, { override });
  const adapters = await getEngineAdapters({ provider });
  const ready = mode === "mock" ? selectedEngines : runnableEngines(adapters, selectedEngines);
  const blocked = mode === "mock" ? [] : blockedEngines(adapters, selectedEngines);

  await updateGeoRun(runId, { status: "running", started_at: run.started_at || nowIso(), execution_provider: provider.provider });

  // log blocked engines honestly — NO browser call, NO fake result (#5/#9)
  for (const b of blocked) {
    await logGeoError({ geo_project_id: projectId, geo_run_id: runId, engine: b.engine, error_type: statusToErrorType(b.status), message: `${b.name}: ${b.status} — ${b.reason}` });
  }

  // nothing runnable → honest session_required / failed, ZERO cost
  if (!ready.length) {
    const anySession = blocked.some((b) => b.status === "session_required");
    const status = anySession ? "session_required" : "failed";
    await updateGeoRun(runId, { status, completed_at: nowIso(), error: blocked.map((b) => `${b.name}:${b.status}`).join("; ") || provider.reason, blocked_engines: blocked.map((b) => ({ engine: b.engine, status: b.status, reason: b.reason })) });
    return { ok: false, status, provider: provider.provider, ready: 0, blocked: blocked.length };
  }

  // ── apply cost-guarded env (proxy/concurrency/retry/screenshot) then collect ──
  const restore = mode === "mock" ? () => {} : applyExecutionEnv(provider, run);
  const sessions = mode === "mock" ? {} : await loadGeoSessions().catch(() => ({}));
  const scanPrompts = prompts.map((p) => ({ id: p.prompt_id, prompt: p.prompt_text || p.prompt, brand }));
  const ctx = { brand, brandDomain, competitors };

  const parsed = [];
  const perEngine = {};
  let saved = 0, failed = 0, cost = 0, stopped = false;
  try {
    for (const engine of ready) {
      // stop-run support (#7) — check between engines
      try { const cur = await getGeoRun(runId); if (cur?.stopped_by_user) { stopped = true; break; } } catch {}
      let scan;
      try {
        scan = await runGeoScan({
          mode, transport: provider.transport,
          brand, clientDomain: brandDomain,
          competitors: competitors.map((c) => c.name), competitorDomains,
          location: project.country || "", proxyCountry: provider.proxyCountry || (String(project.country || "in").slice(0, 2).toLowerCase()),
          engineKeys: [engine], sessions, prompts: scanPrompts,
        });
      } catch (e) {
        await logGeoError({ geo_project_id: projectId, geo_run_id: runId, engine, error_type: /timeout/i.test(String(e?.message)) ? "timeout" : "other", message: String(e?.message || e).slice(0, 400) });
        failed += scanPrompts.length;
        continue;
      }
      for (const resp of (scan.responses || [])) {
        const result = parseAnswer(resp, ctx);
        await saveRunResult({ runId, projectId, result });
        parsed.push(result);
        saved++; perEngine[engine] = (perEngine[engine] || 0) + 1;
        cost += APPROX_COST[engine] ?? 0.02;
        opts.onProgress?.({ saved, failed, engine });
      }
      for (const err of (scan.errors || [])) {
        const ek = ENGINE_KEY_BY_NAME[String(err.engine || "").toLowerCase()] || engine;
        const msg = String(err.error || "");
        await logGeoError({ geo_project_id: projectId, geo_run_id: runId, prompt_id: err.promptId || null, engine: ek, error_type: /session|login|storageState/i.test(msg) ? "session_expired" : (/timeout/i.test(msg) ? "timeout" : "other"), message: msg.slice(0, 400) });
        failed++;
      }
      await updateGeoRun(runId, { completed_count: saved, failed_count: failed, per_engine_progress: perEngine });
    }
  } finally { try { restore(); } catch {} }

  // ── score from the REAL parsed results (empty → zeros; never invented) ──
  const metrics = computeGeoMetrics(parsed, ctx);
  await saveEngineMetrics(runId, metrics.engines.map((e) => ({ engine: e, ...metrics.by_engine[e] })));
  await saveOverallMetrics(runId, { ...metrics.overall, share_of_voice: metrics.share_of_voice, engines: metrics.engines });

  // ── Claude storytelling FROM the real collected data (only when there are results) ──
  if (saved > 0) {
    try {
      const sections = await generateGeoStorytelling({ brand, competitors, metrics, parsed, citationAnalysis: citationAnalysisFromParsed(parsed), domain: brandDomain });
      if (sections.length) await saveStorytelling(runId, projectId, sections);
    } catch (e) { try { console.warn("[geo-worker] storytelling:", e?.message); } catch {} }
  }

  const status = stopped ? "partial" : (saved > 0 ? ((failed > 0 || blocked.length) ? "partial" : "completed") : "failed");
  await updateGeoRun(runId, {
    status, completed_at: nowIso(),
    completed_count: saved, failed_count: failed, valid_result_count: saved, error_count: failed,
    per_engine_progress: perEngine, actual_cost_usd: Math.round(cost * 100) / 100,
    geo_score: metrics.overall.geo_score, overall_sov: metrics.overall.sov,
    blocked_engines: blocked.map((b) => ({ engine: b.engine, status: b.status, reason: b.reason })),
    stopped_by_user: stopped || run.stopped_by_user || false,
  });
  return { ok: saved > 0, runId, saved, failed, status, provider: provider.provider, ready: ready.length, blocked: blocked.length, metrics };
}

/**
 * Standalone worker loop for the dedicated host: atomically claim the next queued run
 * and execute it, forever (or once). Vercel only creates "queued" runs.
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
        console.log(`[geo-worker] run ${run.run_id} → ${r.status} (${r.saved || 0} saved, ${r.failed || 0} failed, provider=${r.provider}, blocked=${r.blocked || 0})`);
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
