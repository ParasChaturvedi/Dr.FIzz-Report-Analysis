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
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return String(u || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]; } };

// #3 — real per-keyword competitor benchmark from the SERP: the actual top-ranking
// domains + URL, PLUS the SERP features that decide the click (AI Overview + its cited
// sources, featured snippet owner, local pack, PAA). No fabrication — only what the SERP
// returned. Falls back to the keyword-gap data when rich SERP intel isn't available.
function serpBenchmark(keyword, serpByKeyword = {}, competitorNames = []) {
  const serp = serpByKeyword[lc(keyword)] || null;
  if (!serp) return competitorNames.length ? `Tracked competitors in this space: ${competitorNames.join(", ")}.` : "";
  const top = Array.isArray(serp.top_results) ? serp.top_results : [];
  const foundIn = (serp.foundIn || []).filter(Boolean);
  const top1 = top[0];
  const who = top1?.domain || foundIn[0] || (serp.url ? hostOf(serp.url) : "");
  const pos = top1?.position ? `#${top1.position}` : (serp.position ? `#${serp.position}` : "in the top results");
  const url = top1?.url || serp.url || "";
  const top3 = top.slice(0, 3).map((r) => r.domain).filter(Boolean);
  const lead = who
    ? `${who} ranks ${pos} for "${clean(keyword)}"${url ? ` (${url})` : ""}.${top3.length > 1 ? ` Top 3: ${top3.join(", ")}.` : ""} Match the winning page's intent + depth to take the position.`
    : "";
  // SERP feature intelligence — what content format actually wins the click.
  const f = serp.features || {};
  const feats = [];
  if (serp.ai_overview?.present || f.has_ai_overview) { const s = (serp.ai_overview?.sources || []).slice(0, 3); feats.push(`Google shows an AI Overview here${s.length ? ` (cites ${s.join(", ")})` : ""} — answer-first, well-structured content is needed to be cited.`); }
  if (f.featured_snippet) feats.push(`Featured snippet owned by ${f.featured_snippet} — add a concise definition/list/table to win it.`);
  if (f.has_local_pack) feats.push(`A local pack appears — GBP + local signals matter for this term.`);
  if (f.has_paa) feats.push(`People-Also-Ask present — add an FAQ block that answers them.`);
  const out = (lead + (feats.length ? ` SERP features — ${feats.join(" ")}` : "")).trim();
  return out || (competitorNames.length ? `Tracked competitors in this space: ${competitorNames.join(", ")}.` : "");
}
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
  const serpByKeyword = parts.serpByKeyword || {};
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
      // #3 — REAL per-keyword competitor benchmark: which competitor ranks, at what
      // position + URL (from the keyword-gap SERP data; no fabrication, no extra call).
      competitor_benchmark: serpBenchmark(p.keyword_cluster || label, serpByKeyword, competitorNames),
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

// ── #22 entity-level GEO + #23 AI-readiness score. Deterministic, computed from the REAL
// crawl + GMB signals (no fabrication): structured data, entity identity (sameAs/NAP),
// answer-first FAQ coverage, content depth, About page, author/E-E-A-T. Weights sum to 100.
export function buildAiReadiness(crawlData = {}, gmbData = {}) {
  const pages = Array.isArray(crawlData?.pages) ? crawlData.pages : [];
  const summary = crawlData?.summary || {};
  const schemaTypes = new Set((summary.pagesWithSchemaTypes || []).map((s) => lc(s)));
  for (const p of pages) for (const s of (p.schemas || [])) if (s?.type) schemaTypes.add(lc(s.type));
  const hasType = (...types) => types.some((t) => [...schemaTypes].some((s) => s.includes(t)));

  const gmb = gmbData?.gmb || {};
  const hasOrg = hasType("organization");
  const hasLocalBiz = hasType("localbusiness");
  const hasFaqSchema = hasType("faqpage", "faq");

  let sameAsCount = 0;
  for (const p of pages) for (const s of (p.schemas || [])) {
    const sa = s?.properties?.sameAs;
    if (Array.isArray(sa)) sameAsCount += sa.length; else if (sa) sameAsCount += 1;
  }
  const faqPages = pages.filter((p) => (p.schemas || []).some((s) => /faq/i.test(s?.type || "")) || /faq|frequently asked/i.test(`${p.metaTitle || ""} ${p.url || ""}`)).length;
  const aboutPage = pages.some((p) => /\/about/i.test(p.url || "") || /about us|about-us/i.test(p.metaTitle || ""));
  const napOnGmb = !!(gmb.found && (gmb.phone || gmb.address));
  const napConsistent = napOnGmb && (hasLocalBiz || pages.some((p) => /\/contact/i.test(p.url || "")));
  const avgWords = Number(summary.avgWordCount || 0);
  const hasAuthor = pages.some((p) => p.eeat && (p.eeat.author || p.eeat.byline || p.eeat.hasAuthor));

  const signals = [
    { key: "structured_data", label: "Structured data (schema)", ok: hasOrg || hasLocalBiz, weight: 22,
      detail: (hasOrg || hasLocalBiz) ? `Found: ${[...schemaTypes].slice(0, 6).join(", ") || "—"}` : "No Organization/LocalBusiness schema — AI engines can't reliably identify the business as an entity." },
    { key: "faq_coverage", label: "Answer-first / FAQ coverage", ok: hasFaqSchema || faqPages > 0, weight: 18,
      detail: (hasFaqSchema || faqPages > 0) ? `${faqPages || 1} FAQ page(s)/block(s) — answer-first content AI can lift directly.` : "No FAQ schema/sections — add Q&A blocks AI answer engines can quote." },
    { key: "entity_identity", label: "Entity identity (sameAs)", ok: sameAsCount > 0, weight: 15,
      detail: sameAsCount > 0 ? `${sameAsCount} sameAs link(s) tying the brand to its profiles.` : "No sameAs links — connect the site to your social/GMB profiles in Organization schema." },
    { key: "nap", label: "NAP consistency", ok: napConsistent, weight: 15,
      detail: napConsistent ? "Name/Address/Phone present across GMB + site." : "NAP not consistently present across GMB + site — a core local-entity signal." },
    { key: "about", label: "About / entity page", ok: aboutPage, weight: 10,
      detail: aboutPage ? "About page present — grounds the entity for AI." : "No clear About page — add one describing who the business is." },
    { key: "depth", label: "Content depth (citation-worthy)", ok: avgWords >= 600, weight: 12,
      detail: avgWords >= 600 ? `Avg ${Math.round(avgWords)} words/page — enough depth to be citation-worthy.` : `Avg ${Math.round(avgWords)} words/page — thin content is rarely cited by AI engines.` },
    { key: "author", label: "Author / E-E-A-T", ok: hasAuthor, weight: 8,
      detail: hasAuthor ? "Author/byline signals present." : "No author/byline signals — add named authors for E-E-A-T." },
  ];
  const score = Math.round(signals.reduce((a, s) => a + (s.ok ? s.weight : 0), 0));
  const band = score >= 75 ? "Strong" : score >= 45 ? "Developing" : "Weak";
  return { score, band, signals, schema_types: [...schemaTypes], available: pages.length > 0 };
}

// GEO — SERP-measured Google AI Overview visibility. Aggregates the AI Overview data
// ALREADY collected in serpIntel (Phase 1): how many priority keywords trigger a Google
// AI Overview, which domains the AI cites most (the real GEO winners), and whether the
// brand is ever cited. REAL measured data from the SERP — complements the Playwright
// chat-engine scan (ChatGPT/Gemini/Perplexity), never fabricates. Zero extra API cost.
export function buildAioVisibility(serpIntel = {}, brandDomain = "", competitorDomains = []) {
  const entries = Object.entries(serpIntel || {});
  if (!entries.length) return { available: false };
  const stem = (d) => String(d || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].split(".")[0];
  const brandStem = stem(brandDomain);
  const compStems = (competitorDomains || []).map(stem).filter(Boolean);
  let aioCount = 0, snippetCount = 0, brandCited = 0;
  const citeFreq = {};
  const aioKeywords = [];
  const perKeyword = [];
  for (const [kw, intel] of entries) {
    const f = intel?.features || {};
    if (f.featured_snippet) snippetCount++;
    const aio = intel?.ai_overview;
    if (f.has_ai_overview || aio?.present) {
      aioCount++;
      aioKeywords.push(kw);
      perKeyword.push({ keyword: kw, sources: (aio?.sources || []).slice(0, 5) });
      for (const src of (aio?.sources || [])) {
        const d = String(src).toLowerCase().replace(/^www\./, "");
        if (!d) continue;
        citeFreq[d] = (citeFreq[d] || 0) + 1;
        if (brandStem && stem(d) === brandStem) brandCited++;
      }
    }
  }
  const checked = entries.length;
  const top_cited_domains = Object.entries(citeFreq).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([domain, count]) => ({
    domain, count, is_brand: !!brandStem && stem(domain) === brandStem, is_competitor: compStems.some((c) => stem(domain) === c),
  }));

  // Share of Voice in Google AI Overviews — your brand vs each competitor vs other sources,
  // by share of ALL AI-Overview citations across the checked keywords. Real measured GEO SoV.
  const totalCites = Object.values(citeFreq).reduce((a, b) => a + b, 0);
  const sov = {};
  for (const [domain, count] of Object.entries(citeFreq)) {
    const s = stem(domain);
    let key, label, kind;
    if (brandStem && s === brandStem) { key = "__brand"; label = "Your brand"; kind = "brand"; }
    else if (compStems.includes(s)) { key = s; label = domain; kind = "competitor"; }
    else { key = "__other"; label = "Other sources"; kind = "other"; }
    (sov[key] ||= { label, kind, citations: 0 }).citations += count;
  }
  // Always surface the brand (even at 0%) so the chart honestly shows "not cited yet".
  if (brandStem && !sov.__brand) sov.__brand = { label: "Your brand", kind: "brand", citations: 0 };
  const share_of_voice = Object.values(sov)
    .map((e) => ({ ...e, share_pct: totalCites ? Math.round((e.citations / totalCites) * 100) : 0 }))
    .sort((a, b) => (a.kind === "brand" ? -1 : b.kind === "brand" ? 1 : b.citations - a.citations));

  return {
    available: true,
    keywords_checked: checked,
    aio_present: aioCount,
    aio_coverage_pct: checked ? Math.round((aioCount / checked) * 100) : 0,
    featured_snippet_count: snippetCount,
    brand_cited_count: brandCited,
    brand_cited: brandCited > 0,
    total_citations: totalCites,
    share_of_voice,
    top_cited_domains,
    aio_keywords: aioKeywords.slice(0, 15),
    per_keyword: perKeyword.slice(0, 12),
  };
}

export default { buildEvidencePlan, checkExistingPage, buildGeoStatus, separateKpis, buildAiReadiness, buildAioVisibility };
