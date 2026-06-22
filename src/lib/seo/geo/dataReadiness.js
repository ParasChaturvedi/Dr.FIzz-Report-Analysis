// src/lib/seo/geo/dataReadiness.js
// ─────────────────────────────────────────────────────────────────────────────
// Phase 2.5 — GEO DATA READINESS
//
// Assesses how much of the DoctorFizz dataset (Steps 1-5 + Step 5B) backs a GEO
// prompt plan, which sources were actually used, and the resulting prompt confidence.
// Used by promptService to stamp data_readiness_status / data_sources_used /
// geo_prompt_confidence on the run + preview.
//
// IMPORTANT: this reads PLANNING/CONTEXT inputs (website, keywords, competitors,
// audit, DataForSEO/Moz/SERP). It never produces a GEO score — the GEO score is
// computed in Phase 3 from real LLM/browser answers. Keep the two separate.
// ─────────────────────────────────────────────────────────────────────────────

const len = (v) => (Array.isArray(v) ? v.length : 0);
const present = (v) => {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return String(v).trim() !== "";
};

function serpCount(serp = {}) {
  if (!serp || typeof serp !== "object") return 0;
  return len(serp.paa) + len(serp.relatedSearches) + len(serp.topPages) + len(serp.contentGaps) + len(serp.keywordResults);
}
function auditPresent(audit = {}, topicGaps = []) {
  if (present(topicGaps)) return true;
  if (!audit || typeof audit !== "object") return false;
  return present(audit.missingPages) || present(audit.recommendedPages) || present(audit.priorityActions) ||
    present(audit.technical) || present(audit.content) || present(audit.onpage) || present(audit.local) ||
    present(audit.schema) || present(audit.pageIssues);
}

/**
 * @param {object} src  the normalized GEO source (promptService.normalizeSource)
 * @returns {{data_readiness_status:string, data_sources_used:string[], geo_prompt_confidence:string,
 *            counts:{keywords_used:number,competitors_used:number,serp_results_used:number},
 *            flags:{used_dataforseo:boolean,used_moz:boolean,used_serp:boolean,used_step5b:boolean}}}
 */
export function assessGeoData(src = {}) {
  const competitors = [...(src.competitors || src.businessCompetitors || []), ...(src.searchCompetitors || [])];
  const sCount = serpCount(src.serp);

  const used = [];
  if (present(src.domain) || present(src.brand)) used.push("step1_website");
  if (present(src.industry) || present(src.category) || present(src.businessType) || present(src.audience) || present(src.location) || present(src.businessScope)) used.push("step2_business_context");
  if (len(src.keywords)) used.push("step3_keywords");
  if (competitors.length) used.push("step4_competitors");
  if (auditPresent(src.audit, src.topicGaps)) used.push("step5_audit");
  if (present(src.dataforseo)) used.push("step5b_dataforseo");
  if (present(src.moz)) used.push("step5b_moz");
  if (sCount > 0) used.push("step5b_serp");
  if (present(src.backlinks)) used.push("step5b_backlinks");
  if (present(src.authority)) used.push("step5b_authority");
  if (len(src.competitorSerp) || len(src.competitorBacklinks)) used.push("step5b_competitor_data");

  const has = (k) => used.includes(k);
  const has5b = used.some((u) => u.startsWith("step5b"));
  const hasKw = has("step3_keywords");
  const hasAudit = has("step5_audit");
  const hasComp = has("step4_competitors");

  // readiness status (most complete first)
  let status;
  if (has5b && hasKw && hasComp && hasAudit) status = "full_ready";
  else if (has5b) status = "step5b_ready";
  else if (hasKw && (hasAudit || hasComp)) status = "seo_data_ready";
  else if (hasAudit) status = "audit_partial";
  else status = "website_only";

  // confidence — Low: website only · Medium: website+audit+keywords · High: incl. Step-5B
  let confidence;
  if (status === "full_ready" || status === "step5b_ready") confidence = "high";
  else if (status === "seo_data_ready" || (hasKw && hasAudit)) confidence = "medium";
  else confidence = "low";

  return {
    data_readiness_status: status,
    data_sources_used: used,
    geo_prompt_confidence: confidence,
    counts: { keywords_used: len(src.keywords), competitors_used: competitors.length, serp_results_used: sCount },
    flags: { used_dataforseo: has("step5b_dataforseo"), used_moz: has("step5b_moz"), used_serp: has("step5b_serp"), used_step5b: has5b },
  };
}

// Reconstruct the readiness shape from a persisted geo_run doc (for the read path).
export function readinessFromRun(run = {}) {
  return {
    data_readiness_status: run.data_readiness_status || "website_only",
    data_sources_used: Array.isArray(run.data_sources_used) ? run.data_sources_used : [],
    geo_prompt_confidence: run.geo_prompt_confidence || "low",
    counts: { keywords_used: run.keywords_used || 0, competitors_used: run.competitors_used || 0, serp_results_used: run.serp_results_used || 0 },
    flags: { used_dataforseo: !!run.used_dataforseo, used_moz: !!run.used_moz, used_serp: !!run.used_serp, used_step5b: !!run.used_step5b },
  };
}

// Empty/planned-state message for the report UI based on readiness.
export function geoPlanMessage(status) {
  if (status === "full_ready" || status === "step5b_ready") {
    return "Full GEO prompt plan generated using website, SEO, keyword, competitor, DataForSEO, Moz, and SERP data.";
  }
  if (status === "website_only" || status === "audit_partial") {
    return "Basic GEO plan available. Complete SEO and competitor data collection for a stronger GEO prompt set.";
  }
  return "GEO prompt plan generated from website, keyword, and audit data. Add competitor + Step 5B data (DataForSEO, Moz, SERP) for the strongest set.";
}
