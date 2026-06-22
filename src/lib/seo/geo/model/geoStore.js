// src/lib/seo/geo/model/geoStore.js
// ─────────────────────────────────────────────────────────────────────────────
// GEO MODULE — persistence layer (MongoDB). The dedicated VPS collector-worker
// WRITES per-prompt evidence here; the Vercel report layer READS it. Append-/
// version-oriented: raw answers are NEVER overwritten (§ Raw Answer Preservation,
// No Data Loss Rule) — re-running a prompt creates a NEW versioned result, so the
// full history is preserved. Fail-safe: every fn degrades to null/[] when Mongo is
// unavailable, exactly like the cache layer — it can never break the app.
// ─────────────────────────────────────────────────────────────────────────────
import { randomUUID } from "crypto";
import { getCollection } from "@/lib/cache/mongo";
import { GEO_COLLECTIONS as C } from "./constants";

const now = () => new Date().toISOString();
const nid = (p) => `${p}_${randomUUID().slice(0, 12)}`;
const col = (name) => getCollection(name);

// Ensure the lookup indexes once per process (idempotent; safe to call often).
let _indexed = false;
export async function ensureGeoIndexes() {
  if (_indexed) return;
  try {
    const jobs = [
      [C.projects, { project_id: 1 }],
      [C.prompts, { geo_project_id: 1, cluster: 1 }],
      [C.runs, { geo_project_id: 1, created_at: -1 }],
      [C.results, { geo_run_id: 1 }],
      [C.results, { geo_project_id: 1, prompt_id: 1, engine: 1, created_at: -1 }],
      [C.mentions, { geo_run_result_id: 1 }],
      [C.mentions, { geo_run_id: 1, entity_type: 1 }],
      [C.citations, { geo_run_result_id: 1 }],
      [C.citations, { geo_run_id: 1, cited_domain: 1 }],
      [C.opportunities, { geo_project_id: 1, link_opportunity_score: -1 }],
      [C.engineMetrics, { geo_run_id: 1, engine: 1 }],
      [C.overallMetrics, { geo_run_id: 1 }],
      [C.validation, { geo_run_id: 1 }],
      [C.competitors, { geo_project_id: 1 }],
      [C.rawAnswerVersions, { geo_project_id: 1, prompt_id: 1, engine: 1, version: -1 }],
      [C.storytelling, { geo_run_id: 1, order: 1 }],
      [C.errors, { geo_run_id: 1, created_at: -1 }],
    ];
    for (const [name, spec] of jobs) {
      const c = await col(name);
      if (c) await c.createIndex(spec).catch(() => {});
    }
    _indexed = true;
  } catch { /* fail-safe no-op */ }
}

// ── PROJECTS (§ geo_projects) ─────────────────────────────────────────────────
export async function createGeoProject(p = {}) {
  try {
    const c = await col(C.projects); if (!c) return null;
    await ensureGeoIndexes();
    const doc = {
      project_id: p.project_id || nid("geo"),
      audit_id: p.audit_id || null,
      brand_name: p.brand_name || "",
      brand_domain: p.brand_domain || "",
      location_mode: p.location_mode || "country",
      country: p.country || "", state: p.state || "", city: p.city || "",
      competitors: Array.isArray(p.competitors) ? p.competitors : [],
      status: p.status || "created",
      created_at: now(), updated_at: now(),
    };
    await c.insertOne(doc);
    return doc;
  } catch (e) { console.warn("[geoStore] createGeoProject:", e?.message); return null; }
}
export async function getGeoProject(projectId) {
  try { const c = await col(C.projects); if (!c) return null; return await c.findOne({ project_id: projectId }); }
  catch { return null; }
}
export async function updateGeoProject(projectId, patch = {}) {
  try { const c = await col(C.projects); if (!c) return false; await c.updateOne({ project_id: projectId }, { $set: { ...patch, updated_at: now() } }); return true; }
  catch { return false; }
}

// ── PROMPTS (§ geo_prompts) ───────────────────────────────────────────────────
// `defaults` carries run-level metadata stamped on every prompt (run_mode,
// selected_engines, target brand/domain, competitors, geo_run_id) so the planner's
// per-prompt records stay lean. Each doc carries the full §8 field set plus the
// approval `status` (pending|approved|rejected|edited) and execution `run_status`.
export async function saveGeoPrompts(projectId, prompts = [], defaults = {}) {
  try {
    const c = await col(C.prompts); if (!c || !Array.isArray(prompts) || !prompts.length) return [];
    const d = defaults || {};
    const docs = prompts.map((p, i) => {
      const srcKw = Array.isArray(p.source_keywords) ? p.source_keywords : (p.source_keyword ? [p.source_keyword] : []);
      return {
        prompt_id: p.prompt_id || nid("p"),
        geo_project_id: projectId,
        geo_run_id: p.geo_run_id || d.geo_run_id || null,
        prompt_text: p.prompt_text || p.prompt || "",
        cluster: p.cluster || "GEO",
        intent: p.intent || "informational",
        neutral: p.neutral !== false,
        source_keywords: srcKw,
        priority: Number(p.priority) || i + 1,
        priority_score: Number(p.priority_score) || 0,
        quality_score: Number(p.quality_score) || 0,
        expected_answer_type: p.expected_answer_type || "mixed",
        dedup_key: p.dedup_key || "",
        location_context: p.location_context || d.location_context || null,
        target_brand: p.target_brand || d.target_brand || "",
        target_domain: p.target_domain || d.target_domain || "",
        competitors: Array.isArray(p.competitors) ? p.competitors : (Array.isArray(d.competitors) ? d.competitors : []),
        run_mode: p.run_mode || d.run_mode || "standard",
        selected_engines: Array.isArray(p.selected_engines) ? p.selected_engines : (Array.isArray(d.selected_engines) ? d.selected_engines : []),
        status: p.status || "pending",        // approval lifecycle (§ approve/edit)
        run_status: p.run_status || "pending", // execution lifecycle (Phase 3 worker)
        created_at: now(),
      };
    });
    await c.insertMany(docs);
    return docs;
  } catch (e) { console.warn("[geoStore] saveGeoPrompts:", e?.message); return []; }
}
export async function getGeoPrompts(projectId, { status, limit = 0 } = {}) {
  try {
    const c = await col(C.prompts); if (!c) return [];
    const q = { geo_project_id: projectId }; if (status) q.status = status;
    let cur = c.find(q).sort({ priority: 1 });
    if (limit > 0) cur = cur.limit(limit);
    return await cur.toArray();
  } catch { return []; }
}
export async function countGeoPrompts(projectId) {
  try { const c = await col(C.prompts); if (!c) return 0; return await c.countDocuments({ geo_project_id: projectId }); } catch { return 0; }
}
// Wipe a project's prompts (used by "regenerate" before re-planning).
export async function clearGeoPrompts(projectId) {
  try { const c = await col(C.prompts); if (!c) return 0; const r = await c.deleteMany({ geo_project_id: projectId }); return r?.deletedCount || 0; } catch { return 0; }
}
// Edit one prompt's text/cluster/intent etc. (marks it "edited" unless caller overrides).
export async function updateGeoPrompt(promptId, patch = {}) {
  try { const c = await col(C.prompts); if (!c) return false; await c.updateOne({ prompt_id: promptId }, { $set: { ...patch, updated_at: now() } }); return true; } catch { return false; }
}
// Approve/reject a set of prompts (empty/[]-ids = all prompts in the project).
export async function setPromptsStatus(projectId, promptIds, status) {
  try {
    const c = await col(C.prompts); if (!c) return 0;
    const q = { geo_project_id: projectId };
    if (Array.isArray(promptIds) && promptIds.length) q.prompt_id = { $in: promptIds };
    const r = await c.updateMany(q, { $set: { status, updated_at: now() } });
    return r?.modifiedCount || 0;
  } catch { return 0; }
}

// ── RUNS (§ geo_runs) ─────────────────────────────────────────────────────────
export async function createGeoRun(run = {}) {
  try {
    const c = await col(C.runs); if (!c) return null;
    await ensureGeoIndexes();
    const cfg = run.config || {};
    const doc = {
      run_id: run.run_id || nid("run"),
      geo_project_id: run.geo_project_id,
      run_name: run.run_name || `Run ${now()}`,
      // "draft" = Phase-2 planned run (worker will NOT claim it); "queued" = ready for
      // the worker. claimNextGeoJob only ever picks up "queued"/"running".
      status: run.status || "queued",
      lease_until: new Date(0),
      engines: cfg.selected_engines || (Array.isArray(run.engines) ? run.engines : []),
      location_context: run.location_context || { mode: cfg.location_mode || "country" },
      prompt_count: Number(run.prompt_count) || 0,
      // progress (worker updates; Vercel polls)
      completed_count: 0, valid_result_count: 0, failed_count: 0, error_count: 0,
      per_engine_progress: {},
      // §cost-control config (resolved by geoRunConfig.resolveGeoRunConfig)
      run_mode: cfg.run_mode || "standard",
      selected_engines: cfg.selected_engines || [],
      prompt_limit: cfg.prompt_limit ?? null,
      validation_enabled: !!cfg.validation_enabled,
      validation_sample_percent: cfg.validation_sample_percent || 0,
      location_mode: cfg.location_mode || "country",
      proxy_enabled: !!cfg.proxy_enabled,
      residential_proxy_enabled: !!cfg.residential_proxy_enabled,
      execution_provider: cfg.execution_provider || "worker-playwright",
      estimated_engine_runs: cfg.estimated_engine_runs || 0,
      estimated_cost_level: cfg.estimated_cost_level || "medium",
      estimated_cost_usd: cfg.estimated_cost_usd || 0,
      actual_cost_usd: 0,
      max_retries: cfg.max_retries ?? 2,
      concurrency_limit: cfg.concurrency_limit || 4,
      cache_reuse_enabled: cfg.cache_reuse_enabled ?? true,
      force_refresh: !!cfg.force_refresh,
      screenshot_mode: cfg.screenshot_mode || "on_error",
      budget_limit: cfg.budget_limit ?? null,
      stopped_by_user: false,
      started_at: null, completed_at: null,
      created_at: now(),
    };
    await c.insertOne(doc);
    return doc;
  } catch (e) { console.warn("[geoStore] createGeoRun:", e?.message); return null; }
}

// ── JOB QUEUE — Vercel creates a "queued" run; the WORKER atomically claims it ──
export async function claimNextGeoJob() {
  try {
    const c = await col(C.runs); if (!c) return null;
    const t = Date.now();
    const res = await c.findOneAndUpdate(
      { status: { $in: ["queued", "running"] }, stopped_by_user: { $ne: true }, lease_until: { $lt: new Date(t) } },
      { $set: { status: "running", started_at: now(), lease_until: new Date(t + 10 * 60 * 1000) } },
      { sort: { created_at: 1 }, returnDocument: "after" }
    );
    return (res && res.value) ? res.value : (res && res._id ? res : null);
  } catch (e) { console.warn("[geoStore] claimNextGeoJob:", e?.message); return null; }
}
export async function stopGeoRun(runId) {
  try { const c = await col(C.runs); if (!c) return false; await c.updateOne({ run_id: runId }, { $set: { stopped_by_user: true, status: "partial", completed_at: now() } }); return true; }
  catch { return false; }
}
// Progress snapshot for the Vercel polling UI (none / in_progress / complete / failed).
export async function getRunStatus(projectId) {
  try {
    const run = await getLatestRun(projectId);
    if (!run) return { state: "none" };
    const inProgress = ["queued", "running", "collecting", "parsing", "scoring"].includes(run.status);
    const state = run.status === "completed" ? "complete" : run.status === "failed" ? "failed" : inProgress ? "in_progress" : run.status === "partial" ? "partial" : "in_progress";
    return {
      state, run_id: run.run_id, status: run.status,
      prompt_count: run.prompt_count || 0, completed_count: run.completed_count || 0, failed_count: run.failed_count || 0,
      per_engine_progress: run.per_engine_progress || {}, run_mode: run.run_mode, engines: run.engines,
      estimated_cost_usd: run.estimated_cost_usd, actual_cost_usd: run.actual_cost_usd,
      started_at: run.started_at, completed_at: run.completed_at,
    };
  } catch { return { state: "none" }; }
}
export async function updateGeoRun(runId, patch = {}) {
  try { const c = await col(C.runs); if (!c) return false; await c.updateOne({ run_id: runId }, { $set: patch }); return true; }
  catch { return false; }
}
export async function getGeoRun(runId) {
  try { const c = await col(C.runs); if (!c) return null; return await c.findOne({ run_id: runId }); }
  catch { return null; }
}
export async function getLatestRun(projectId) {
  try { const c = await col(C.runs); if (!c) return null; return await c.find({ geo_project_id: projectId }).sort({ created_at: -1 }).limit(1).next(); }
  catch { return null; }
}
export async function listRuns(projectId, limit = 20) {
  try { const c = await col(C.runs); if (!c) return []; return await c.find({ geo_project_id: projectId }).sort({ created_at: -1 }).limit(limit).toArray(); }
  catch { return []; }
}

// ── RESULTS + child MENTIONS/CITATIONS (§ geo_run_results / geo_mentions / geo_citations) ──
// Persists ONE NormalizedResult as a versioned result doc + its mention/citation
// children. NEVER overwrites — each call is a new version (history preserved).
export async function saveRunResult({ runId, projectId, result }) {
  try {
    const rc = await col(C.results); if (!rc || !result) return null;
    // version = how many prior results exist for this (project, prompt, engine) + 1
    let version = 1;
    try { version = 1 + await rc.countDocuments({ geo_project_id: projectId, prompt_id: result.promptId, engine: result.engine }); } catch {}
    const resultId = nid("res");
    const doc = {
      result_id: resultId,
      geo_run_id: runId,
      geo_project_id: projectId,
      prompt_id: result.promptId,
      engine: result.engine,
      account_id: result.accountId || null,
      version,
      raw_prompt: result.rawPrompt || "",
      raw_html: String(result.rawHtml || "").slice(0, 200000),   // audit; capped
      rendered_text: result.renderedText || "",
      visible_answer_text: result.visibleAnswerText || result.renderedText || "",
      region_context: result.locationContext || null,
      location_mode: result.locationContext?.mode || "country",
      answer_length: Number(result.answerLength) || String(result.renderedText || "").length,
      answer_structure: result.answerStructure || "unknown",
      citation_count: Array.isArray(result.citations) ? result.citations.length : 0,
      source_domains: Array.isArray(result.sourceDomains) ? result.sourceDomains : [],
      parse_confidence: Number(result.parseConfidence) || 0,
      validation_confidence: result.validationConfidence ?? null,
      parser_output: result.parserOutput || null,
      screenshot_url: result.screenshotUrl || null,
      error: Array.isArray(result.errors) && result.errors.length ? result.errors.join("; ") : (result.error || null),
      retry_count: Number(result.retries) || 0,
      run_status: result.runStatus || "success",
      created_at: now(),
    };
    await rc.insertOne(doc);

    // immutable raw-answer version (§ No Data Loss Rule — never overwritten)
    try {
      const rv = await col(C.rawAnswerVersions);
      if (rv) await rv.insertOne({
        geo_project_id: projectId, geo_run_id: runId, geo_run_result_id: resultId,
        prompt_id: result.promptId, engine: result.engine, version,
        raw_prompt: doc.raw_prompt, raw_html: doc.raw_html, rendered_text: doc.rendered_text,
        parser_output: doc.parser_output, captured_at: now(),
      });
    } catch {}

    // children — mentions
    const mentions = [...(result.brandMentions || []), ...(result.competitorMentions || [])];
    if (mentions.length) {
      const mc = await col(C.mentions);
      if (mc) await mc.insertMany(mentions.map((m) => ({
        geo_run_result_id: resultId, geo_run_id: runId, geo_project_id: projectId,
        prompt_id: result.promptId, engine: result.engine,
        entity_name: m.entity_name, entity_type: m.entity_type, domain: m.domain || "",
        mention_count: Number(m.mention_count) || 1,
        mention_position: m.mention_position ?? null,
        context_snippet: m.context_snippet || "",
        confidence: Number(m.confidence) || 0.5,
        created_at: now(),
      })));
    }
    // children — citations
    if (Array.isArray(result.citations) && result.citations.length) {
      const cc = await col(C.citations);
      if (cc) await cc.insertMany(result.citations.map((ct) => ({
        geo_run_result_id: resultId, geo_run_id: runId, geo_project_id: projectId,
        prompt_id: result.promptId, engine: result.engine,
        cited_brand: ct.cited_brand || "", cited_domain: ct.cited_domain || "", cited_url: ct.cited_url || "",
        citation_order: ct.citation_order ?? null,
        citation_type: ct.citation_type || "", source_type: ct.source_type || "",
        is_brand_domain: !!ct.is_brand_domain, is_competitor_domain: !!ct.is_competitor_domain,
        relationship_strength: ct.relationship_strength || "indirect",
        page_title: ct.page_title || "", snippet: ct.snippet || "",
        first_seen_at: now(), last_seen_at: now(),
        confidence: Number(ct.confidence) || 0.5,
        created_at: now(),
      })));
    }
    return doc;
  } catch (e) { console.warn("[geoStore] saveRunResult:", e?.message); return null; }
}
export async function getRunResults(runId) {
  try { const c = await col(C.results); if (!c) return []; return await c.find({ geo_run_id: runId }).toArray(); }
  catch { return []; }
}
/** Full history of one prompt across runs/engines (newest first) — for the result-history view. */
export async function getResultHistory(projectId, promptId) {
  try { const c = await col(C.results); if (!c) return []; return await c.find({ geo_project_id: projectId, prompt_id: promptId }).sort({ created_at: -1 }).toArray(); }
  catch { return []; }
}
export async function getMentions(runId) {
  try { const c = await col(C.mentions); if (!c) return []; return await c.find({ geo_run_id: runId }).toArray(); } catch { return []; }
}
export async function getCitations(runId) {
  try { const c = await col(C.citations); if (!c) return []; return await c.find({ geo_run_id: runId }).toArray(); } catch { return []; }
}

// ── OPPORTUNITIES (§24 geo_opportunities) ─────────────────────────────────────
export async function saveOpportunities(projectId, opportunities = []) {
  try {
    const c = await col(C.opportunities); if (!c || !opportunities.length) return [];
    const docs = opportunities.map((o) => ({ geo_project_id: projectId, status: o.status || "open", created_at: now(), ...o }));
    await c.insertMany(docs);
    return docs;
  } catch (e) { console.warn("[geoStore] saveOpportunities:", e?.message); return []; }
}
export async function getOpportunities(projectId, { limit = 200 } = {}) {
  try { const c = await col(C.opportunities); if (!c) return []; return await c.find({ geo_project_id: projectId }).sort({ link_opportunity_score: -1 }).limit(limit).toArray(); }
  catch { return []; }
}

// ── METRICS (§20 geo_engine_metrics / geo_overall_metrics) ────────────────────
export async function saveEngineMetrics(runId, perEngine = []) {
  try { const c = await col(C.engineMetrics); if (!c || !perEngine.length) return false; await c.insertMany(perEngine.map((m) => ({ geo_run_id: runId, created_at: now(), ...m }))); return true; }
  catch { return false; }
}
export async function saveOverallMetrics(runId, overall = {}) {
  try { const c = await col(C.overallMetrics); if (!c) return false; await c.insertOne({ geo_run_id: runId, created_at: now(), ...overall }); return true; }
  catch { return false; }
}
export async function getRunMetrics(runId) {
  try {
    const ec = await col(C.engineMetrics); const oc = await col(C.overallMetrics);
    const by_engine = ec ? await ec.find({ geo_run_id: runId }).toArray() : [];
    const overall = oc ? await oc.findOne({ geo_run_id: runId }) : null;
    return { overall, by_engine };
  } catch { return { overall: null, by_engine: [] }; }
}

// ── VALIDATION (§18 geo_validation_results) ───────────────────────────────────
export async function saveValidation(runId, results = []) {
  try { const c = await col(C.validation); if (!c || !results.length) return false; await c.insertMany(results.map((r) => ({ geo_run_id: runId, created_at: now(), ...r }))); return true; }
  catch { return false; }
}
export async function getValidation(runId) {
  try { const c = await col(C.validation); if (!c) return []; return await c.find({ geo_run_id: runId }).toArray(); } catch { return []; }
}

// ── COMPETITORS (§25 geo_competitors) ─────────────────────────────────────────
export async function saveCompetitors(projectId, competitors = []) {
  try { const c = await col(C.competitors); if (!c) return false; await c.deleteMany({ geo_project_id: projectId }); if (competitors.length) await c.insertMany(competitors.map((x) => ({ geo_project_id: projectId, created_at: now(), ...x }))); return true; }
  catch { return false; }
}
export async function getCompetitors(projectId) {
  try { const c = await col(C.competitors); if (!c) return []; return await c.find({ geo_project_id: projectId }).toArray(); } catch { return []; }
}

// ── RAW ANSWER VERSIONS (§ immutable history — full version trail per prompt/engine) ──
export async function getRawAnswerVersions(projectId, promptId, engine) {
  try { const c = await col(C.rawAnswerVersions); if (!c) return []; const q = { geo_project_id: projectId, prompt_id: promptId }; if (engine) q.engine = engine; return await c.find(q).sort({ version: -1 }).toArray(); }
  catch { return []; }
}

// ── STORYTELLING (§ Claude narrative — stored in Mongo, fetched in the report) ─
export async function saveStorytelling(runId, projectId, sections = []) {
  try { const c = await col(C.storytelling); if (!c) return false; await c.deleteMany({ geo_run_id: runId }); if (sections.length) await c.insertMany(sections.map((s, i) => ({ geo_project_id: projectId, geo_run_id: runId, order: s.order ?? i, created_at: now(), ...s }))); return true; }
  catch (e) { console.warn("[geoStore] saveStorytelling:", e?.message); return false; }
}
export async function getStorytelling(runId) {
  try { const c = await col(C.storytelling); if (!c) return []; return await c.find({ geo_run_id: runId }).sort({ order: 1 }).toArray(); } catch { return []; }
}

// ── ERRORS (§ collection-health) ──────────────────────────────────────────────
export async function logGeoError(err = {}) {
  try { const c = await col(C.errors); if (!c) return false; await c.insertOne({ error_type: "other", retry_count: 0, ...err, created_at: now() }); return true; } catch { return false; }
}
export async function getGeoErrors(runId) {
  try { const c = await col(C.errors); if (!c) return []; return await c.find({ geo_run_id: runId }).sort({ created_at: -1 }).toArray(); } catch { return []; }
}

/**
 * One-call assembly the report layer uses: the latest run + its results, metrics,
 * citations, opportunities, competitors, storytelling, errors — everything to render
 * §14-25 with full prompt-level evidence. Graceful nulls/[] when no run exists yet.
 */
export async function getGeoReportBundle(projectId) {
  const run = await getLatestRun(projectId);
  if (!run) return { project: await getGeoProject(projectId), run: null, results: [], metrics: { overall: null, by_engine: [] }, citations: [], opportunities: [], competitors: [], validation: [], storytelling: [], errors: [] };
  const [results, metrics, citations, opportunities, competitors, validation, storytelling, errors, project] = await Promise.all([
    getRunResults(run.run_id), getRunMetrics(run.run_id), getCitations(run.run_id),
    getOpportunities(projectId), getCompetitors(projectId), getValidation(run.run_id),
    getStorytelling(run.run_id), getGeoErrors(run.run_id), getGeoProject(projectId),
  ]);
  return { project, run, results, metrics, citations, opportunities, competitors, validation, storytelling, errors };
}
