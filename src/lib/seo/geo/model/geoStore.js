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
export async function saveGeoPrompts(projectId, prompts = []) {
  try {
    const c = await col(C.prompts); if (!c || !Array.isArray(prompts) || !prompts.length) return [];
    const docs = prompts.map((p, i) => ({
      prompt_id: p.prompt_id || nid("p"),
      geo_project_id: projectId,
      prompt_text: p.prompt_text || p.prompt || "",
      cluster: p.cluster || "GEO",
      intent: p.intent || "informational",
      priority: Number(p.priority) || i + 1,
      location_context: p.location_context || null,
      source_keywords: Array.isArray(p.source_keywords) ? p.source_keywords : [],
      target_brand: p.target_brand || "",
      target_domain: p.target_domain || "",
      competitors: Array.isArray(p.competitors) ? p.competitors : [],
      expected_answer_type: p.expected_answer_type || "mixed",
      neutral: p.neutral !== false,
      run_status: "pending",
      created_at: now(),
    }));
    await c.insertMany(docs);
    return docs;
  } catch (e) { console.warn("[geoStore] saveGeoPrompts:", e?.message); return []; }
}
export async function getGeoPrompts(projectId) {
  try { const c = await col(C.prompts); if (!c) return []; return await c.find({ geo_project_id: projectId }).sort({ priority: 1 }).toArray(); }
  catch { return []; }
}

// ── RUNS (§ geo_runs) ─────────────────────────────────────────────────────────
export async function createGeoRun(run = {}) {
  try {
    const c = await col(C.runs); if (!c) return null;
    await ensureGeoIndexes();
    const doc = {
      run_id: run.run_id || nid("run"),
      geo_project_id: run.geo_project_id,
      run_name: run.run_name || `Run ${now()}`,
      status: "queued",
      engines: Array.isArray(run.engines) ? run.engines : [],
      location_context: run.location_context || { mode: "country" },
      prompt_count: Number(run.prompt_count) || 0,
      valid_result_count: 0,
      error_count: 0,
      started_at: null, completed_at: null,
      created_at: now(),
    };
    await c.insertOne(doc);
    return doc;
  } catch (e) { console.warn("[geoStore] createGeoRun:", e?.message); return null; }
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

/**
 * One-call assembly the report layer uses: the latest run + its results, metrics,
 * citations, opportunities, competitors — everything needed to render §14-25 with
 * full prompt-level evidence. Returns nulls/[] gracefully when no run exists yet.
 */
export async function getGeoReportBundle(projectId) {
  const run = await getLatestRun(projectId);
  if (!run) return { project: await getGeoProject(projectId), run: null, results: [], metrics: { overall: null, by_engine: [] }, citations: [], opportunities: [], competitors: [], validation: [] };
  const [results, metrics, citations, opportunities, competitors, validation, project] = await Promise.all([
    getRunResults(run.run_id), getRunMetrics(run.run_id), getCitations(run.run_id),
    getOpportunities(projectId), getCompetitors(projectId), getValidation(run.run_id), getGeoProject(projectId),
  ]);
  return { project, run, results, metrics, citations, opportunities, competitors, validation };
}
