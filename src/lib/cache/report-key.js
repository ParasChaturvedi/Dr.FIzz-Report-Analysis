// src/lib/cache/report-key.js
// Shared cache-key for a generated report, so the "is there a cached report?"
// check (Step5 short-circuit + /api/report/cached) and the writer
// (generate-analysis) ALWAYS compute the same key. Keyed by the inputs that change
// the report: report type + business name + competitor set + mode + keyword + country.
// negativeExclusions is part of the key: adding an exclusion must bust the cache, else a
// post-exclusion regenerate is a false HIT that returns the stale, unfiltered report.
export function reportCacheType({ reportType = "website", businessData, competitorData, reportMode, keyword, countryCode, negativeExclusions } = {}) {
  const sig = JSON.stringify({
    bn: businessData?.businessName || businessData?.name || "",
    // competitorData is normally the object { businessCompetitors, searchCompetitors }
    // (NOT an array) — flatten BOTH into the key, else the competitor set is dropped and
    // different-competitor reports collide / a post-fix regeneration is a false cache HIT.
    comp: (Array.isArray(competitorData)
            ? competitorData
            : [...(competitorData?.businessCompetitors || []), ...(competitorData?.searchCompetitors || [])])
      .map((c) => (typeof c === "string" ? c : c?.domain || c?.name || "")).filter(Boolean).slice(0, 8),
    mode: reportMode || "",
    kw: keyword || "",
    cc: countryCode || "in",
    neg: [...(negativeExclusions || [])].map(String).sort(),
  });
  let h = 0;
  for (let i = 0; i < sig.length; i++) h = (Math.imul(h, 31) + sig.charCodeAt(i)) | 0;
  return `report:${reportType}:${(h >>> 0).toString(36)}`;
}
