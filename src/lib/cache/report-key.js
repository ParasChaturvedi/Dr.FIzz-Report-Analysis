// src/lib/cache/report-key.js
// Shared cache-key for a generated report, so the "is there a cached report?"
// check (Step5 short-circuit + /api/report/cached) and the writer
// (generate-analysis) ALWAYS compute the same key. Keyed by the inputs that change
// the report: report type + business name + competitor set + mode + keyword + country.
export function reportCacheType({ reportType = "website", businessData, competitorData, reportMode, keyword, countryCode } = {}) {
  const sig = JSON.stringify({
    bn: businessData?.businessName || businessData?.name || "",
    comp: (Array.isArray(competitorData) ? competitorData : [])
      .map((c) => (typeof c === "string" ? c : c?.domain || c?.name || "")).slice(0, 8),
    mode: reportMode || "",
    kw: keyword || "",
    cc: countryCode || "in",
  });
  let h = 0;
  for (let i = 0; i < sig.length; i++) h = (Math.imul(h, 31) + sig.charCodeAt(i)) | 0;
  return `report:${reportType}:${(h >>> 0).toString(36)}`;
}
