// src/lib/seo/geo/promptService.js
// ─────────────────────────────────────────────────────────────────────────────
// GEO §17 — PROMPT SERVICE (Phase 2 orchestration)
//
// The single entry point the API routes call. It:
//   • normalizes whatever real project data the dashboard sends (a runBusinessLogic
//     report OR flat fields) into the planner's grounding shape,
//   • ensures a geo_project exists,
//   • PLANS prompts (promptPlanner — pure, no engine execution, no Browserless),
//   • resolves the cost-controlled run config + engine-run/cost ESTIMATE,
//   • persists prompts + a DRAFT planned run (worker will NOT claim a draft) via geoStore,
//   • returns a preview the dashboard renders (prompts, clusters, intents, source
//     keywords, priority, selected engines, estimated run count + cost level).
//
// Phase 2 does NOT execute prompts and NEVER triggers Browserless/engine cost. The
// only external call is Claude text generation inside the planner (cheap, one-time,
// and skippable with useClaude:false).
// ─────────────────────────────────────────────────────────────────────────────
import { planGeoPrompts } from "./promptPlanner.js";
import { resolveGeoRunConfig, estimateGeoRun } from "./model/geoRunConfig.js";
import { GEO_CLUSTERS, GEO_INTENTS, RUN_MODE_PRESETS, normalizeRunMode, normalizeGeoPlanMode } from "./model/constants.js";
import { assessGeoData, readinessFromRun, geoPlanMessage } from "./dataReadiness.js";
import {
  createGeoProject, getGeoProject, updateGeoProject,
  saveGeoPrompts, getGeoPrompts, countGeoPrompts, clearGeoPrompts, updateGeoPrompt, setPromptsStatus,
  createGeoRun, getLatestRun,
} from "./model/geoStore.js";

const clean = (s) => String(s || "").trim().replace(/\s+/g, " ");
const stripDomain = (s) => clean(s).replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
function competitorNames(list = []) {
  return (Array.isArray(list) ? list : [])
    .map((c) => { const s = typeof c === "string" ? c : c?.name || c?.brand || c?.domain || ""; const m = String(s).match(/^([a-z0-9-]+)\.[a-z0-9.]{2,}$/i); return clean((m ? m[1] : s).replace(/[-_]+/g, " ")); })
    .filter(Boolean);
}

const arr = (v) => (Array.isArray(v) ? v : []);

/**
 * Normalize the FULL DoctorFizz dataset (Steps 1-5 + Step 5B) into the planner's
 * grounding shape. Accepts a runBusinessLogic `report`, a `source` object, a `step5b`
 * object, or flat fields — reads from whichever is present. Step 5B (DataForSEO / Moz /
 * SERP / backlinks / authority / competitor signals) is captured for PROMPT PLANNING
 * + CONTEXT only — it is never turned into a GEO result/score (that's Phase 3).
 */
export function normalizeSource(input = {}) {
  const s = input.source || input || {};
  const report = input.report || s.report || null;
  const meta = report?.report_meta || {};
  const b5 = s.step5b || input.step5b || {};

  // ── Step 1-2 — identity / business context ──
  const brand = clean(s.brand || s.clientName || s.brandName || meta.client_name || "");
  const domain = stripDomain(s.domain || meta.domain || "");
  const industry = clean(s.industry || meta.industry || "");
  const category = clean(s.category || (Array.isArray(s.coreServices) && s.coreServices[0]) || (Array.isArray(report?.coreServices) && report.coreServices[0]) || "");
  const businessType = clean(s.businessType || s.business_type || meta.business_type || "");
  const audience = clean(s.audience || s.buyerType || s.buyer_type || s.targetMarket || s.target_market || "");
  const businessScope = clean(s.businessScope || s.business_scope || meta.business_scope || "");

  const locationMode = s.locationMode || s.location_mode || report?.report_meta?.location_mode || "country";
  const location = clean(s.location || meta.location || report?.location || "");
  const locationContext = s.locationContext || s.location_context || {
    mode: locationMode,
    country: clean(s.country || ""), state: clean(s.state || ""), city: clean(s.city || ""),
    label: location || clean([s.city, s.state, s.country].filter(Boolean).join(", ")),
  };
  const homepageTitle = clean(s.homepageTitle || s.homepage_title || "");
  const homepageContent = clean(s.homepageContent || s.homepage_content || "");
  const searchIntent = clean(s.searchIntent || s.search_intent || "");
  const locations = arr(s.locations);

  // ── Step 3 — keyword / SEO context ──
  const keywords = s.keywords || report?.keywords?.accepted || report?.keywords || s.rawKeywords || [];
  const competitorKeywords = s.competitorKeywords || s.competitor_keywords || [];
  const keywordClusters = s.keywordClusters || s.keyword_clusters || [];
  const keywordGaps = s.keywordGaps || s.keyword_gaps || report?.keywords?.gaps || [];
  const semanticThemes = s.semanticThemes || s.semantic_themes || [];

  // ── Step 4 — competitors ──
  const businessCompetitors = s.businessCompetitors || s.competitors || report?.competitors || [];
  const searchCompetitors = s.searchCompetitors || report?.search_landscape || [];
  const topicGaps = s.topicGaps || s.topic_gaps || report?.geo_and_ai_visibility?.topic_dominance?.topic_gap || [];

  // ── Step 5 — audit / report findings ──
  const audit = s.audit || {
    technical: s.technicalFindings || report?.technical_issues || [],
    content: s.contentFindings || [],
    onpage: s.onpageFindings || s.onPageFindings || [],
    local: s.localFindings || [],
    schema: s.schemaFindings || report?.geo_and_ai_visibility?.schema_additions || [],
    pageIssues: s.pageIssues || [],
    siteStructure: s.siteStructure || null,
    internalLinking: s.internalLinking || null,
    contentQuality: s.contentQuality || null,
    missingPages: s.missingPages || arr(report?.content_architecture?.geography_pages),
    recommendedPages: s.recommendedPages || [...arr(report?.content_architecture?.commercial_pages), ...arr(report?.content_architecture?.blog_and_guides)],
    priorityActions: s.priorityActions || report?.priority_action_plan || [],
    reportSections: s.reportSections || [],
  };

  // ── Step 5B — external enrichment (DataForSEO / Moz / SERP / backlinks / authority) ──
  const dataforseo = s.dataforseo || s.dataForSeo || b5.dataforseo || null;
  const moz = s.moz || b5.moz || null;
  const serp = s.serp || b5.serp || {
    paa: s.peopleAlsoAsk || s.people_also_ask || [],
    relatedSearches: s.relatedSearches || s.related_searches || [],
    topPages: s.topRankingPages || s.top_ranking_pages || [],
    contentGaps: s.serpContentGaps || s.serp_content_gaps || [],
    keywordResults: s.keywordSerpResults || s.keyword_serp_results || [],
  };
  const backlinks = s.backlinks || b5.backlinks || report?.backlinks || null;
  const authority = s.authority || b5.authority || (report?.baseline?.domain_rating ? { domain_rating: report.baseline.domain_rating, referring_domains: report.baseline.referring_domains } : null);
  const domainMetrics = s.domainMetrics || b5.domainMetrics || null;
  const pageMetrics = s.pageMetrics || b5.pageMetrics || null;
  const competitorSerp = s.competitorSerp || b5.competitorSerp || [];
  const competitorBacklinks = s.competitorBacklinks || b5.competitorBacklinks || [];

  return {
    // identity / context
    brand, clientName: brand, domain, industry, category, businessType, audience, businessScope,
    location, locationMode, locationContext, homepageTitle, homepageContent, searchIntent, locations,
    // keywords
    keywords, competitorKeywords, keywordClusters, keywordGaps, semanticThemes,
    // competitors
    competitors: businessCompetitors, businessCompetitors, searchCompetitors, topicGaps,
    // audit
    audit,
    // step 5B
    dataforseo, moz, serp, backlinks, authority, domainMetrics, pageMetrics, competitorSerp, competitorBacklinks,
  };
}

// Quick / "basic" plan — keep only Step-1 website + basic crawl/audit; drop the heavy
// keyword / competitor / Step-5B data so the plan is fast and clearly lower-confidence.
function stripToQuick(src) {
  return {
    ...src,
    keywords: [], competitorKeywords: [], keywordClusters: [], keywordGaps: [], semanticThemes: [],
    competitors: [], businessCompetitors: [], searchCompetitors: [], topicGaps: [],
    audit: { ...src.audit, technical: [], content: [], onpage: [], priorityActions: [], recommendedPages: [], reportSections: [] },
    dataforseo: null, moz: null, serp: {}, backlinks: null, authority: null,
    domainMetrics: null, pageMetrics: null, competitorSerp: [], competitorBacklinks: [],
  };
}

// Resolve a cost-controlled run config from the request + source.
function resolveConfig(input, src) {
  return resolveGeoRunConfig({
    run_mode: normalizeRunMode(input.runMode || input.run_mode),
    selected_engines: input.selectedEngines || input.selected_engines,
    prompt_limit: input.promptLimit || input.prompt_limit,
    location_mode: src.locationMode,
    residential_proxy_enabled: input.residentialProxy ?? input.residential_proxy_enabled,
    validation_enabled: input.validationEnabled ?? input.validation_enabled,
    validation_sample_percent: input.validationSamplePercent ?? input.validation_sample_percent,
    budget_limit: input.budgetLimit ?? input.budget_limit,
  });
}
function configFromRun(run) {
  if (!run) return resolveGeoRunConfig({ run_mode: "standard" });
  return resolveGeoRunConfig({
    run_mode: run.run_mode, selected_engines: run.selected_engines || run.engines, prompt_limit: run.prompt_limit,
    location_mode: run.location_mode, residential_proxy_enabled: run.residential_proxy_enabled,
    validation_enabled: run.validation_enabled, validation_sample_percent: run.validation_sample_percent,
  });
}

// §15 — engine-run + cost estimator shape the dashboard renders.
function buildEstimate(config, promptCount) {
  const est = estimateGeoRun(config, promptCount);
  return {
    prompt_count: promptCount,
    selected_engines: config.selected_engines,
    engine_count: est.engine_count,
    estimated_engine_runs: est.estimated_engine_runs,
    run_mode: config.run_mode,
    validation_sample_size: est.validation_subset,
    estimated_cost_level: est.estimated_cost_level, // low | medium | high | full
    estimated_cost_usd: est.estimated_cost_usd,
  };
}

function computeDistribution(prompts) {
  const by_cluster = {}, by_intent = {}, by_status = {};
  for (const c of GEO_CLUSTERS) by_cluster[c] = 0;
  for (const it of GEO_INTENTS) by_intent[it] = 0;
  for (const p of prompts) {
    by_cluster[p.cluster] = (by_cluster[p.cluster] || 0) + 1;
    by_intent[p.intent] = (by_intent[p.intent] || 0) + 1;
    const st = p.status || "pending"; by_status[st] = (by_status[st] || 0) + 1;
  }
  return { by_cluster, by_intent, by_status };
}

function toPreviewPrompt(p) {
  return {
    prompt_id: p.prompt_id,
    prompt_text: p.prompt_text || p.prompt || "",
    cluster: p.cluster,
    intent: p.intent,
    source_keywords: Array.isArray(p.source_keywords) ? p.source_keywords : (p.source_keyword ? [p.source_keyword] : []),
    priority: p.priority,
    quality_score: p.quality_score ?? null,
    expected_answer_type: p.expected_answer_type,
    neutral: p.neutral,
    selected_engines: Array.isArray(p.selected_engines) ? p.selected_engines : [],
    location_context: p.location_context || null,
    status: p.status || "pending",
  };
}

function buildPreview({ project, run, prompts, config, runMode, readiness, planMode }) {
  const distribution = computeDistribution(prompts);
  const estimate = buildEstimate(config, prompts.length);
  const r = readiness || (run ? readinessFromRun(run) : null);
  const mode = planMode || run?.geo_plan_mode || "full";
  return {
    project: project ? { project_id: project.project_id, brand_name: project.brand_name, brand_domain: project.brand_domain, industry: project.industry, location_mode: project.location_mode, status: project.status } : null,
    run: run ? { run_id: run.run_id, status: run.status, run_mode: run.run_mode, geo_plan_mode: run.geo_plan_mode, run_name: run.run_name, prompt_count: run.prompt_count } : null,
    run_mode: runMode,
    geo_plan_mode: mode,
    selected_engines: config.selected_engines,
    counts: { total: prompts.length, by_cluster: distribution.by_cluster, by_intent: distribution.by_intent, by_status: distribution.by_status },
    estimate,
    // Phase 2.5 — which data backed this plan + how confident (planning context, NOT a GEO score)
    data_context: r ? {
      target_website: project?.brand_domain || null,
      brand: project?.brand_name || null,
      domain: project?.brand_domain || null,
      run_mode: runMode,
      plan_mode: mode,
      data_readiness_status: r.data_readiness_status,
      data_sources_used: r.data_sources_used,
      geo_prompt_confidence: r.geo_prompt_confidence,
      keywords_used: r.counts.keywords_used,
      competitors_used: r.counts.competitors_used,
      serp_results_used: r.counts.serp_results_used,
      used_dataforseo: r.flags.used_dataforseo,
      used_moz: r.flags.used_moz,
      used_step5b: r.flags.used_step5b,
      message: geoPlanMessage(r.data_readiness_status),
    } : null,
    prompts: prompts.map(toPreviewPrompt),
  };
}

/**
 * Create the geo_project if it doesn't exist yet (idempotent on projectId). Returns
 * the project doc, or null when the GEO store (MongoDB) is unavailable.
 */
export async function ensureGeoProject(input = {}) {
  const src = input._src || normalizeSource(input);
  if (input.projectId) { const ex = await getGeoProject(input.projectId); if (ex) return ex; }
  return await createGeoProject({
    project_id: input.projectId,
    audit_id: input.auditId || input.audit_id || null,
    brand_name: src.brand, brand_domain: src.domain, industry: src.industry,
    location_mode: src.locationMode,
    country: src.locationContext.country, state: src.locationContext.state, city: src.locationContext.city,
    competitors: competitorNames(src.businessCompetitors).slice(0, 10),
  });
}

/**
 * Generate + persist a GEO prompt set for a project. PLANNING ONLY — no engine
 * execution, no Browserless. Creates a DRAFT planned run + stores every prompt.
 *
 * @param {object} input
 * @param {string} [input.projectId]      reuse an existing project (else one is created)
 * @param {object} [input.source|report]  real project data to ground prompts in
 * @param {string} [input.runMode]        "smoke"|"standard"|"full" — prompt VOLUME (default standard)
 * @param {string} [input.geoPlanMode]    "quick"|"full" — data DEPTH (default full = use Steps 1-5+5B)
 * @param {string[]} [input.selectedEngines]
 * @param {boolean}[input.regenerate]     wipe existing prompts first
 * @param {boolean}[input.useClaude]      default true; false = deterministic (no API cost)
 * @returns {Promise<object>} { ok, project_id, run_id, geo_plan_mode, data_readiness_status,
 *   data_sources_used, geo_prompt_confidence, distribution, estimate, preview }
 */
export async function generateGeoPromptsForProject(input = {}) {
  const runMode = normalizeRunMode(input.runMode || input.run_mode);
  const planMode = normalizeGeoPlanMode(input.geoPlanMode || input.geo_plan_mode || input.planMode);
  let src = normalizeSource(input);
  if (planMode === "quick") src = stripToQuick(src); // basic plan: website + crawl/audit only

  // assess how much of the Steps 1-5 + 5B dataset actually backs this plan
  const readiness = assessGeoData(src);
  const config = resolveConfig(input, src);

  const project = await ensureGeoProject({ ...input, _src: src });
  if (!project) return { ok: false, error: "GEO store unavailable (MongoDB not reachable). Cannot persist prompts." };
  const projectId = project.project_id;

  if (input.regenerate) await clearGeoPrompts(projectId);

  // PLAN (pure) — grounded in the FULL dataset; "full" mode runs a deep-analysis pass first
  const plan = await planGeoPrompts({ source: src, runMode, planMode, targetCount: config.prompt_limit, useClaude: input.useClaude !== false });

  // DRAFT planned run (status "draft" => worker will NOT claim it in Phase 3)
  const run = await createGeoRun({
    geo_project_id: projectId,
    run_name: `${RUN_MODE_PRESETS[runMode]?.label || runMode} (${planMode}) — ${plan.prompts.length} prompts`,
    status: "draft",
    prompt_count: plan.prompts.length,
    engines: config.selected_engines,
    location_context: src.locationContext,
    config,
    geo_plan_mode: planMode,
    readiness, // createGeoRun persists data_readiness_status / data_sources_used / confidence / counts
  });

  // persist prompts with run-level defaults stamped on each
  const defaults = {
    run_mode: runMode,
    selected_engines: config.selected_engines,
    target_brand: src.brand, target_domain: src.domain,
    competitors: competitorNames(src.businessCompetitors).slice(0, 10),
    location_context: src.locationContext,
    geo_run_id: run?.run_id || null,
    geo_plan_mode: planMode,
    geo_prompt_confidence: readiness.geo_prompt_confidence,
    data_readiness_status: readiness.data_readiness_status,
  };
  const saved = await saveGeoPrompts(projectId, plan.prompts, defaults);
  await updateGeoProject(projectId, { status: "prompts_generated", last_run_id: run?.run_id || null });

  return {
    ok: true,
    project_id: projectId,
    run_id: run?.run_id || null,
    run_mode: runMode,
    geo_plan_mode: planMode,
    generated: saved.length,
    used_claude: plan.usedClaude,
    analysis_used: plan.analysisUsed || false,
    data_readiness_status: readiness.data_readiness_status,
    data_sources_used: readiness.data_sources_used,
    geo_prompt_confidence: readiness.geo_prompt_confidence,
    data_counts: readiness.counts,
    distribution: plan.distribution,
    estimate: buildEstimate(config, saved.length),
    selected_engines: config.selected_engines,
    preview: buildPreview({ project, run, prompts: saved, config, runMode, readiness, planMode }),
  };
}

/** Regenerate = wipe + generate fresh. */
export async function regenerateGeoPrompts(input = {}) {
  return generateGeoPromptsForProject({ ...input, regenerate: true });
}

/**
 * Fetch the prompt preview for a project (prompts + clusters + intents + estimate).
 * Read-only — safe to call from a GET route.
 */
export async function getPromptPreview(projectId, { limit = 0, status } = {}) {
  const [project, run] = await Promise.all([getGeoProject(projectId), getLatestRun(projectId)]);
  if (!project) return { ok: false, error: "project not found" };
  const prompts = await getGeoPrompts(projectId, { limit, status });
  const config = configFromRun(run);
  return { ok: true, ...buildPreview({ project, run, prompts, config, runMode: run?.run_mode || "standard" }) };
}

/** Approve / reject prompts (empty ids = all prompts in the project). */
export async function setPromptApproval({ projectId, promptIds = [], status = "approved" } = {}) {
  if (!projectId) return { ok: false, error: "projectId required" };
  const modified = await setPromptsStatus(projectId, promptIds, status);
  const total = await countGeoPrompts(projectId);
  return { ok: true, status, modified, total };
}

/** Edit one prompt's text/cluster/intent (marks it "edited"). */
export async function editGeoPrompt({ promptId, prompt_text, cluster, intent, expected_answer_type, status = "edited" } = {}) {
  if (!promptId) return { ok: false, error: "promptId required" };
  const patch = { status };
  if (prompt_text != null) patch.prompt_text = clean(prompt_text);
  if (cluster) patch.cluster = cluster;
  if (intent) patch.intent = intent;
  if (expected_answer_type) patch.expected_answer_type = expected_answer_type;
  const ok = await updateGeoPrompt(promptId, patch);
  return { ok, promptId, patch };
}

export default generateGeoPromptsForProject;
