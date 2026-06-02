// src/lib/seo/doctor-fizz-qa.js
// ═══════════════════════════════════════════════════════════════════════════════
// DOCTOR FIZZ — QUALITY ASSURANCE GATE (Part 6 of the spec)
// ═══════════════════════════════════════════════════════════════════════════════
// An automated validation pass that runs on the Stage-3 payload (and optionally
// the final rendered narrative) BEFORE the report is released. Every check maps
// to an item in the Part 6 QA checklist. Returns a structured result so the
// product owner and developer can see exactly what passed and what failed.
// ═══════════════════════════════════════════════════════════════════════════════

import { MISSING_LABELS } from "./doctor-fizz-logic.js";

const FILLER_PATTERNS = [
  /it is worth noting that/i,
  /as we can see/i,
  /in conclusion/i,
  /moving forward/i,
  /we believe/i,
  /in our experience/i,
  /we recommend/i,
  /our analysis shows/i,
  /comprehensive digital visibility/i,
  /evidence,? not guesswork/i,
  /content that earns rankings/i,
];

/**
 * Run the full QA gate on the Stage-3 payload.
 * @param {object} payload  output of runBusinessLogic()
 * @param {string} narrative optional Claude-generated narrative for tone checks
 * @returns {{ passed: bool, score: number, checks: Array, failures: Array }}
 */
export function runQaGate(payload = {}, narrative = "") {
  const checks = [];
  const add = (category, name, passed, detail = "") =>
    checks.push({ category, name, passed: !!passed, detail });

  // ── Data completeness checks ──
  const baseline = payload.baseline || {};
  const hasRawDash = Object.entries(baseline).some(([k, v]) =>
    k !== "missing_fields" && (v === "—" || v === "-" || v === "" || v === null)
  );
  add("data", "No raw null/empty/dash in baseline", !hasRawDash,
    hasRawDash ? "Found a raw dash/empty value — must be a missing-data label." : "");

  const missingLabeled = (baseline.missing_fields || []).every(f =>
    baseline[f] && baseline[f].label && Object.values(MISSING_LABELS).includes(baseline[f].label)
  );
  add("data", "Every missing field has an unavailability label", missingLabeled);

  const kpiMetrics = payload.kpis?.metrics || [];
  const kpiDirectionalValid = kpiMetrics.every(m =>
    ["valid", "auto_corrected", "projected_from_zero", "baseline_unavailable"].includes(m.validation_status)
  );
  add("data", "Every KPI target is directionally valid", kpiDirectionalValid);

  const noZeroZero = kpiMetrics.every(m =>
    !(m.baseline === 0 && (m.target_6_months === 0 || m.target_6_months === "0"))
  );
  add("data", "No zero target when baseline is zero", noZeroZero);

  const drLabeled = baseline.domain_rating?.value != null || baseline.domain_rating?.label != null;
  const rdLabeled = baseline.referring_domains?.value != null || baseline.referring_domains?.label != null;
  add("data", "Domain authority & referring domains populated or labeled", drLabeled && rdLabeled);

  // ── Keyword quality checks ──
  const kw = payload.keywords || {};
  const brandSet = new Set((payload._meta?.competitorBrands || []).map(b => b.toLowerCase()));
  const contentKw = [
    ...(payload.content_architecture?.commercial_pages || []),
    ...(payload.content_architecture?.blog_and_guides || []),
    ...(payload.content_architecture?.city_pages || []),
  ];

  const noCompetitorInContent = !contentKw.some(c => {
    const text = (c.keyword_cluster || c.proposed_title || c.page_name || "").toLowerCase();
    return [...brandSet].some(b => b && text.includes(b));
  });
  add("keyword", "No competitor brand in any content recommendation", noCompetitorInContent);

  const excludedSet = new Set((kw.excluded || []).map(e => e.keyword.toLowerCase()));
  const noExcludedAnywhere = !contentKw.some(c =>
    excludedSet.has((c.keyword_cluster || "").toLowerCase())
  );
  add("keyword", "No excluded keyword appears in any section", noExcludedAnywhere);

  const allHaveIntent = (kw.accepted || []).every(k => k.intent_class);
  add("keyword", "Every accepted keyword has an intent class", allHaveIntent);

  const allHaveAsset = (kw.accepted || []).every(k => k.recommended_asset_type);
  add("keyword", "Every accepted keyword has an asset type", allHaveAsset);

  const noInfoToService = !(kw.accepted || []).some(k =>
    k.intent_class === "informational" && /service page|landing page/i.test(k.recommended_asset_type || "")
  );
  add("keyword", "No informational keyword mapped to a service page", noInfoToService);

  const noTransToBlog = !(kw.accepted || []).some(k =>
    k.intent_class === "transactional" && /blog/i.test(k.recommended_asset_type || "")
  );
  add("keyword", "No transactional keyword mapped to a blog post", noTransToBlog);

  // ── Content architecture checks ──
  const ca = payload.content_architecture || {};
  const sectionsSeparate = Array.isArray(ca.commercial_pages) && Array.isArray(ca.blog_and_guides) && Array.isArray(ca.city_pages);
  add("content", "Commercial / blog / city pages in separate arrays", sectionsSeparate);

  const everyHasFunnel = contentKw.every(c => c.funnel_role);
  add("content", "Every content recommendation states a funnel role", everyHasFunnel);

  // ── Backlink section checks ──
  const bl = payload.backlinks || {};
  const fourCategories = ["citation_links", "editorial_links", "competitor_gap", "local_authority_links"]
    .every(key => Array.isArray(bl[key]));
  add("backlink", "All four link categories present and separate", fourCategories);

  const citationsHaveEffort = (bl.citation_links || []).every(l => l.effort_hours);
  const editorialHaveEffort = (bl.editorial_links || []).every(l => l.effort);
  add("backlink", "Every link opportunity includes effort + value", citationsHaveEffort && editorialHaveEffort);

  const gapHasDomains = (bl.competitor_gap || []).every(l => l.referring_domain && l.links_to);
  add("backlink", "Competitor gap links name domain + competitor", gapHasDomains || (bl.competitor_gap || []).length === 0);

  // ── Technical foundation checks ──
  const tech = payload.technical_issues || [];
  if (tech.length) {
    const techRanked = tech.every((t, i) => {
      const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return i === 0 || rank[tech[i - 1].priority] <= rank[t.priority];
    });
    add("technical", "Technical issues ranked by priority", techRanked);
    const techActionable = tech.every(t => t.recommended_action && t.estimated_effort);
    add("technical", "Every technical issue has action + effort", techActionable);
  }

  // ── GEO layer checks ──
  const geo = payload.geo_and_ai_visibility || {};
  if (geo.recommended_actions) {
    const hasSchema = (geo.schema_additions || []).some(s => /faqpage/i.test(s.type)) &&
                      (geo.schema_additions || []).some(s => /organization|localbusiness/i.test(s.type));
    add("geo", "GEO layer includes FAQPage + Organization JSON-LD", hasSchema);
    const schemaComplete = (geo.schema_additions || []).every(s => s.jsonld && s.jsonld.includes("@context"));
    add("geo", "Schema additions are complete JSON-LD blocks", schemaComplete);
  }

  // ── GBP section checks (when in scope) ──
  const gbp = payload.gbp_comparison || {};
  if (gbp.has_competitor_data) {
    add("gbp", "Competitor comparison table has competitor data", (gbp.competitors || []).length > 0);
    add("gbp", "Biggest gap / fastest win / trust gap present",
      !!gbp.biggest_gap && !!gbp.fastest_win && !!gbp.trust_gap);
  }

  // ── Tone & style checks (on narrative, if supplied) ──
  if (narrative) {
    const fillerHits = FILLER_PATTERNS.filter(re => re.test(narrative)).map(re => re.source);
    add("tone", "No filler transitions or marketing slogans", fillerHits.length === 0,
      fillerHits.length ? `Found: ${fillerHits.slice(0, 3).join(", ")}` : "");

    const firstPerson = /\b(we|our|us)\b/i.test(narrative.replace(/\bwe['']ll\b/gi, ""));
    add("tone", "No first-person brand voice", !firstPerson,
      firstPerson ? "Found first-person pronoun — use 'the data shows' / 'the prescribed fix'." : "");
  }

  const failures = checks.filter(c => !c.passed);
  const score = checks.length ? Math.round((checks.filter(c => c.passed).length / checks.length) * 100) : 0;

  return {
    passed: failures.length === 0,
    score,
    total: checks.length,
    passedCount: checks.length - failures.length,
    checks,
    failures,
  };
}
