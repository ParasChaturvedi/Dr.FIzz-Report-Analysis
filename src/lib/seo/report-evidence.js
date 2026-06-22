// src/lib/seo/report-evidence.js
// ─────────────────────────────────────────────────────────────────────────────
// EVIDENCE FRAMEWORK (Track 1.2) — turn the report's recommendation builders into a
// single, implementation-ready plan where EVERY recommendation carries the 10-field
// evidence structure:
//   1 Finding · 2 Evidence/Data · 3 Competitor Benchmark · 4 Recommended Action ·
//   5 Expected SEO/GEO Impact · 6 Validation Metric · 7 Confidence · 8 Owner ·
//   9 Estimated Effort · 10 Expected Impact
//
// Built so Track 2 (DataForSEO/Moz/SERP/competitor depth) and Track 3 (real GEO/LLM
// collection) data plug into the SAME framework later. Pure + dependency-light.
//
// Rules honoured here:
//  • Existing-page check BEFORE any "build a page" recommendation (#2) — never recommend
//    a page that already exists; switch to "optimise the existing page" instead.
//  • No faked GEO results (#9) — buildGeoStatus reports planned/methodology-ready/
//    prompts-ready/collection-not-run until Phase-3 browser collection actually runs.
//  • Current vs targets vs forecasts vs assumptions are separated (#14) — separateKpis.
// ─────────────────────────────────────────────────────────────────────────────
import { toEvidenceRec, CONFIDENCE, fmtInt, fmtNum } from "./report-format.js";

const lc = (s) => String(s || "").toLowerCase().trim();
const fmtVal = (v) => (v == null || v === "" ? "—" : typeof v === "boolean" ? (v ? "yes" : "no") : typeof v === "number" ? fmtNum(v) : String(v));
// #4 — opportunity score from real keyword signals (volume + difficulty + intent).
function opportunityScore({ volume = 0, difficulty = 50, intent = "" } = {}) {
  const v = Math.min(100, Math.log10(Math.max(10, Number(volume) || 0)) * 22);
  const d = 100 - Math.min(100, Number(difficulty) || 50);
  const boost = /transactional|commercial|local/.test(lc(intent)) ? 15 : 0;
  return Math.round(Math.max(0, Math.min(100, v * 0.45 + d * 0.4 + boost)));
}
const clean = (s) => String(s == null ? "" : s).trim().replace(/\s+/g, " ");
function tokenSet(s) { return new Set(lc(s).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length >= 3)); }
function tokenOverlap(a, b) {
  const A = tokenSet(a), B = tokenSet(b);
  if (!A.size || !B.size) return 0;
  let hit = 0; for (const t of A) if (B.has(t)) hit++;
  return hit / Math.min(A.size, B.size);
}

// ── #2 — existing-page check. Match a recommended page against the crawled pages so we
// never tell the client to "build" a page that already exists. Returns the live URL +
// whether it's indexed so the action can flip to "optimise existing".
export function checkExistingPage(page = {}, crawlPages = []) {
  const slug = lc(page.url_slug || "").replace(/^\/+|\/+$/g, "");
  const title = clean(page.page_name || page.proposed_title || page.keyword_cluster || "");
  const kw = clean(page.keyword_cluster || page.geo_target || "");
  for (const cp of (Array.isArray(crawlPages) ? crawlPages : [])) {
    const url = lc(cp.url || "");
    const ctitle = clean(cp.metaTitle || cp.title || "");
    if (!url) continue;
    if (slug && slug.length >= 3 && url.includes(slug)) return hit(cp);
    if (title && ctitle && tokenOverlap(title, ctitle) >= 0.6) return hit(cp);
    if (kw && kw.length >= 4 && ctitle && tokenOverlap(kw, ctitle) >= 0.7) return hit(cp);
  }
  return { exists: false };
  function hit(cp) { return { exists: true, url: cp.url, indexed: !cp.isNoindex, title: cp.metaTitle || cp.title || "" }; }
}

// derive a sensible validation metric per recommendation type (#6).
function validationFor(kind, item = {}) {
  if (kind === "technical") {
    const i = lc(item.issue);
    if (/index|robots|noindex|crawl/.test(i)) return "Affected pages indexable in Google Search Console (count → 0 blocked)";
    if (/lcp|speed|cwv|performance|cls/.test(i)) return "Core Web Vitals pass in PageSpeed Insights (LCP < 2.5s, CLS < 0.1)";
    if (/canonical|duplicate/.test(i)) return "Each URL resolves to one canonical (0 duplicate-title pages on re-crawl)";
    if (/h1|alt|title|meta/.test(i)) return "0 pages missing the element on the next site crawl";
    if (/redirect|404|broken/.test(i)) return "0 broken links / redirect chains on re-crawl";
    return "Issue count → 0 on the next Doctor Fizz crawl";
  }
  if (kind === "content") return `Page indexed + ranking top 20 for "${clean(item.keyword_cluster || item.page_name || "the target term")}"`;
  if (kind === "gbp") return "Field shows complete in the Google Business Profile audit";
  if (kind === "backlink") return "Live, indexed link from the target domain (verified in the backlink tool)";
  return "Tracked KPI moves toward its 6-month target";
}

// names of the tracked business competitors (for content benchmark context).
function competitorNameList(competitors = []) {
  return (Array.isArray(competitors) ? competitors : [])
    .map((c) => clean(typeof c === "string" ? c : c?.name || c?.brand || c?.domain || ""))
    .filter(Boolean).slice(0, 5);
}

// #6 — Google Business Profile competitor benchmarking → evidence recs. Uses the REAL
// client-vs-best-competitor numbers from gbp_comparison.field_analysis (no fabrication).
function gbpRecs(gbp = {}) {
  const out = [];
  for (const f of (gbp?.field_analysis || [])) {
    if (f.client_status !== "behind" && f.client_status !== "missing") continue;
    const lead = f.best_name ? `${f.best_name} leads with ${fmtVal(f.best_value)}` : "";
    out.push({ category: "Local SEO — GBP", ...toEvidenceRec({
      finding: `Google Business Profile "${f.label || f.field}" is ${f.client_status} vs competitors`,
      evidence: `Your value: ${fmtVal(f.client_value)}.${lead ? ` ${lead}.` : ""}`,
      competitor_benchmark: f.gap_note || (f.best_name ? `${f.best_name}: ${fmtVal(f.best_value)} vs your ${fmtVal(f.client_value)}` : ""),
      action: f.improvement || `Update "${f.label || f.field}" on the Google Business Profile`,
      expected_impact: "Higher GBP completeness → stronger Local Pack ranking + more profile actions",
      validation_metric: validationFor("gbp", f),
      priority: f.client_status === "missing" ? "HIGH" : "MEDIUM",
      confidence: CONFIDENCE.HIGH, owner: "Client", channel: "Client",
      sources: ["GBP API"],
    }) });
  }
  return out;
}

// #3 (backlinks) — citation + competitor-link gaps → evidence recs with the REAL platform,
// domain rating, and which competitors are already listed.
function backlinkRecs(bl = {}) {
  const out = [];
  for (const c of (bl?.citation || bl?.citation_links || [])) {
    if (c.client_listed) continue;
    const comp = (c.competitor_names || []).slice(0, 3);
    out.push({ category: "Authority & Links", ...toEvidenceRec({
      finding: `Not listed on ${c.platform}${c.domain_rating ? ` (DR ${fmtNum(c.domain_rating)})` : ""}`,
      evidence: `${fmtInt(c.competitors_listed || 0)} of your competitors are already listed here${comp.length ? `: ${comp.join(", ")}` : ""}. ${c.signal || ""}`.trim(),
      competitor_benchmark: comp.length ? `Listed: ${comp.join(", ")}` : `${fmtInt(c.competitors_listed || 0)} competitors listed`,
      action: `Claim / build the ${c.platform} listing${c.listing_url ? ` (${c.listing_url})` : ""}`,
      expected_impact: "New citation + local-authority signal; closes a gap competitors already use",
      validation_metric: validationFor("backlink", c),
      priority: (c.competitors_listed || 0) >= 2 ? "HIGH" : "MEDIUM",
      confidence: CONFIDENCE.HIGH, channel: "SEO", effort: c.effort_hours || c.effort,
      sources: ["DataForSEO"],
    }) });
  }
  for (const g of (bl?.competitor_gap || [])) {
    out.push({ category: "Authority & Links", ...toEvidenceRec({
      finding: `Competitor backlink gap: ${g.referring_domain}${g.domain_rating ? ` (DR ${fmtNum(g.domain_rating)})` : ""}`,
      evidence: `${g.referring_domain} links to ${g.links_to || "a competitor"} but not to ${"you"}.`,
      competitor_benchmark: `${g.referring_domain} → ${g.links_to || "competitor"}`,
      action: g.approach || `Earn a link from ${g.referring_domain}`,
      expected_impact: "Referring-domain growth from a source proven relevant to your niche",
      validation_metric: validationFor("backlink", g),
      priority: "MEDIUM", confidence: CONFIDENCE.MEDIUM, channel: "SEO",
      sources: ["DataForSEO"],
    }) });
  }
  return out;
}

// ── Build the unified, evidence-structured plan from the report's recommendation parts.
// Each entry is grouped by category and carries all 10 evidence fields. Track 2 plugs in
// real competitor / GBP / backlink / keyword-intent data via the same framework.
export function buildEvidencePlan(parts = {}, crawlData = null) {
  const crawlPages = Array.isArray(crawlData?.pages) ? crawlData.pages : (Array.isArray(parts.crawlPages) ? parts.crawlPages : []);
  const competitorNames = competitorNameList(parts.competitors);
  const recs = [];

  // Technical SEO (#12 — implementation-ready: affected counts, validation)
  for (const t of (parts.technical_issues || [])) {
    recs.push({ category: "Technical SEO", ...toEvidenceRec({
      finding: t.issue,
      evidence: t.why_it_matters,
      action: t.recommended_action,
      expected_impact: t.expected_unlock,
      priority: t.priority,
      effort: t.estimated_effort,
      validation_metric: validationFor("technical", t),
      competitor_benchmark: t.affected_count != null ? `${fmtInt(t.affected_count)} page(s) on this site affected` : "",
      confidence: CONFIDENCE.HIGH, // technical issues are observed facts from the crawl
      channel: "Development",
      sources: ["Doctor Fizz crawler"],
    }), affected_count: t.affected_count ?? null });
  }

  // Content SEO + Local (#2 existing-page check; #5 build justification)
  const pages = [
    ...(parts.content_architecture?.commercial_pages || []).map((p) => ({ ...p, _kind: "commercial" })),
    ...(parts.content_architecture?.blog_and_guides || []).map((p) => ({ ...p, _kind: "blog" })),
    ...(parts.content_architecture?.geography_pages || []).map((p) => ({ ...p, _kind: "geo" })),
  ];
  for (const p of pages) {
    const label = clean(p.page_name || p.proposed_title || p.keyword_cluster || "this topic");
    const ex = checkExistingPage(p, crawlPages);
    const category = p._kind === "geo" ? "Local SEO" : "Content SEO";
    const finding = ex.exists
      ? `A page targeting "${clean(p.keyword_cluster || label)}" already exists but is under-optimised / under-ranking`
      : `No page targets "${clean(p.keyword_cluster || label)}" — the search demand is uncovered`;
    const action = ex.exists
      ? `Optimise the EXISTING page (${ex.url}${ex.indexed === false ? " — currently noindex" : ""}) for this intent: tighten the title/H1, expand depth, add internal links. Do NOT build a duplicate.`
      : `Build a new ${p.asset_type || (p._kind === "geo" ? p.page_type : "page")}: "${label}" (${p.url_slug || "/" + lc(label).replace(/\s+/g, "-")})`;
    // #4 — keyword intent mapping: intent + funnel stage + opportunity + page type.
    const opp = opportunityScore({ volume: p.primary_volume, difficulty: p.keyword_difficulty, intent: p.intent_class });
    const intentBits = [
      p.intent_class && `Intent: ${p.intent_class}`,
      p.funnel_role && `Funnel: ${p.funnel_role}`,
      p.primary_volume != null && `Demand ≈ ${fmtInt(p.primary_volume)}/mo`,
      `Opportunity ${opp}/100`,
    ].filter(Boolean).join(" · ");
    recs.push({ category, ...toEvidenceRec({
      finding,
      evidence: [clean(p.commercial_reason || p.why_separate_page || p.search_intent || ""), intentBits].filter(Boolean).join(" — "),
      action,
      expected_impact: `Capture the "${clean(p.keyword_cluster || label)}" demand → new ranking + organic traffic` + (p._kind === "commercial" ? " on a conversion page" : ""),
      validation_metric: validationFor("content", p),
      // honest competitor context — names the tracked rivals; exact per-keyword ranking URL
      // needs competitor SERP data (collected in the Track-2 data pipeline), not invented.
      competitor_benchmark: competitorNames.length ? `Tracked competitors in this space: ${competitorNames.join(", ")} (per-keyword ranking URL added once competitor SERP data is collected)` : "",
      priority: p.priority,
      confidence: ex.exists ? CONFIDENCE.HIGH : CONFIDENCE.MEDIUM,
      channel: "Content",
      sources: ["DataForSEO"],
    }), page_exists: ex.exists, existing_url: ex.url || null, search_volume: p.primary_volume ?? null, intent: p.intent_class || null, funnel_stage: p.funnel_role || null, opportunity_score: opp, suggested_page_type: p.asset_type || p.page_type || null });
  }

  // Strategy / GEO actions from the priority plan
  for (const tier of (parts.priority_action_plan || [])) {
    for (const a of (tier.actions || [])) {
      const isGeo = lc(a.channel).includes("geo");
      recs.push({ category: isGeo ? "GEO" : "Authority & Strategy", ...toEvidenceRec({
        finding: a.description,
        evidence: a.why,
        action: a.description,
        expected_impact: isGeo ? "Improves how often AI answer engines can find + cite the brand (measured in Phase 3)" : "Compounds organic authority + ranking once live",
        priority: a.priority,
        effort: a.effort,
        validation_metric: validationFor("action", a),
        channel: a.channel,
        confidence: isGeo ? CONFIDENCE.EXPERIMENTAL : CONFIDENCE.MEDIUM,
        sources: [],
      }), tier: tier.tier });
    }
  }

  // Track 2 — GBP competitor benchmarking (#6) + backlink/citation gaps (#3), real data.
  recs.push(...gbpRecs(parts.gbp_comparison));
  recs.push(...backlinkRecs(parts.backlinks));

  // group + order by impact then confidence
  const order = { High: 0, Medium: 1, Low: 2 };
  const grouped = {};
  for (const r of recs) { (grouped[r.category] ||= []).push(r); }
  for (const k of Object.keys(grouped)) grouped[k].sort((a, b) => (order[a.impact] ?? 1) - (order[b.impact] ?? 1));
  const total = recs.length;
  return {
    by_category: grouped,
    flat: recs,
    counts: {
      total,
      by_owner: tally(recs, "owner"),
      by_impact: tally(recs, "impact"),
      by_confidence: tally(recs, "confidence"),
      pages_existing_flagged: recs.filter((r) => r.page_exists).length, // #2 — caught as already-existing
    },
  };
}

function tally(arr, key) { const o = {}; for (const r of arr) { const k = r[key] || "—"; o[k] = (o[k] || 0) + 1; } return o; }

// ── #9 / #6 — honest GEO status across the FULL run lifecycle. The report shows exactly
// one of: planned · queued · running · partially_complete · complete · failed ·
// session_required. SoV / citations / mentions are "measured" ONLY for complete /
// partially_complete (real geo_run_results). Everything else shows NO numbers.
const GEO_STATE_MESSAGE = {
  planned_ready: "GEO plan ready: methodology defined and neutral prompts generated. Queue real AI-engine collection (Playwright/Browserless) to measure visibility — Share-of-Voice, citations and mentions populate then. No GEO results are shown until they are actually measured.",
  planned: "GEO plan in progress: methodology defined. Generate + approve the neutral prompt set, then queue real AI-engine collection. No GEO results are shown until they are actually measured.",
  queued: "GEO run queued. The worker will collect real AI-engine answers shortly. No results are shown until they are measured.",
  running: "GEO collection in progress — submitting prompts to the AI engines and capturing the rendered answers. Results populate as they complete.",
  partially_complete: "GEO collection partially complete — some engines/prompts succeeded; others were blocked or pending. Showing ONLY what was actually measured.",
  complete: "GEO visibility measured from real AI-engine answers collected via the Doctor Fizz GEO crawler (Playwright/Browserless).",
  failed: "GEO collection did not complete and no results are shown. See the collection-health log for the cause.",
  session_required: "GEO collection needs logged-in sessions for the selected login engines (ChatGPT / Gemini / Copilot). Capture them, then re-queue. No GEO results are shown until they are measured.",
};
export function buildGeoStatus({ geo = {}, promptsReady = null, collectionRun = false, runStatus = null, blockedEngines = [] } = {}) {
  const promptCount = Number(geo?.prompts_used?.length || geo?.prompt_count || 0) || 0;
  const ready = promptsReady != null ? !!promptsReady : promptCount > 0;
  const rs = String(runStatus || "").toLowerCase();

  let state;
  if (rs === "completed" || (collectionRun && !rs)) state = "complete";
  else if (rs === "partial") state = "partially_complete";
  else if (rs === "session_required") state = "session_required";
  else if (rs === "failed") state = "failed";
  else if (["running", "collecting", "parsing", "scoring"].includes(rs)) state = "running";
  else if (rs === "queued") state = "queued";
  else state = "planned";

  const measured = state === "complete" || state === "partially_complete";
  const message = state === "planned" ? (ready ? GEO_STATE_MESSAGE.planned_ready : GEO_STATE_MESSAGE.planned) : GEO_STATE_MESSAGE[state];
  return {
    state,
    measured,
    methodology_ready: true,
    prompts_ready: ready,
    prompt_count: promptCount,
    collection_run: measured,                  // GeoVisibility renders real numbers ONLY when true
    blocked_engines: Array.isArray(blockedEngines) ? blockedEngines : [],
    message,
    note: measured ? undefined : "No Share-of-Voice, citations, mentions or LLM answers are invented before real collection.",
  };
}

// ── #14 — separate current metrics from targets / forecasts / assumptions.
export function separateKpis(kpis = {}) {
  const metrics = Array.isArray(kpis?.metrics) ? kpis.metrics : (Array.isArray(kpis) ? kpis : []);
  const current = [], targets = [], forecasts = [], assumptions = [];
  for (const m of metrics) {
    const name = m.metric || m.key || "";
    if (m.baseline != null) current.push({ metric: name, value: m.baseline, source: m.source || "", note: "Measured now" });
    const t6 = m.target_6_months ?? m.s6, t12 = m.target_12_months ?? m.s12, t3 = m.target_3_months ?? m.s3;
    if (t3 != null || t6 != null || t12 != null) targets.push({ metric: name, target_3m: t3 ?? null, target_6m: t6 ?? null, target_12m: t12 ?? null });
    if (m.validation_status === "projected_from_zero" || m.validation_status === "auto_corrected" || m.estimation_note) {
      forecasts.push({ metric: name, basis: m.estimation_note || m.validation_status });
    }
  }
  assumptions.push("Targets assume the recommended actions are implemented on schedule.");
  assumptions.push("Forecasts are directional estimates from current trajectory + category benchmarks — not guarantees.");
  return { current, targets, forecasts, assumptions };
}

export default { buildEvidencePlan, checkExistingPage, buildGeoStatus, separateKpis };
