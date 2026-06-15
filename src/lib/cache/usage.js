// src/lib/cache/usage.js
// ─────────────────────────────────────────────────────────────────────────────
// PER-REPORT COST + ACCURACY TRACKING  (MongoDB, fail-safe)
//
// • logUsage()      — append one usage record (API call or Claude call) to the
//                     `usage_log` collection, tagged by domain + time.
// • summarizeUsage()— aggregate a domain's usage in a recent window → total cost,
//                     per-API breakdown, cache hits. Used to price ONE report.
// • claudeCostUSD() — REAL Claude cost from the tokens the SDK returns.
// • scoreCompleteness() — data-confidence score computed from the assembled report
//                     (how many key fields are really present vs missing/estimated).
//
// Claude cost is REAL (from usage tokens). External-API cost is an ESTIMATE per
// call type (vendors don't return per-call price) — tune the table to your plan.
// FAIL-SAFE: no Mongo / any error → logging is a silent no-op, report unaffected.
// ─────────────────────────────────────────────────────────────────────────────

import { getCollection } from "./mongo.js";

// Estimated USD cost of ONE live fetch per data type (cache hit = 0). Tune to plan.
export const API_COST_USD = {
  seo:            0.07,   // /api/seo bundle (PSI free + DataForSEO keywords/SERP)
  dataforseo:     0.18,   // fetchDataForSeo (keywords + SERP + Labs)
  crawl:          0.02,   // website-crawl (1 site: SERP + page fetches)
  gmb:            0.03,   // GMB info + Maps + reviews + Q&A
  "keyword-gap":  0.08,   // ranked_keywords (target+competitors) + PAA
  moz:            0.001,  // Moz url_metrics (1 row)
  geo_scan:       0.20,   // Browserless multi-LLM scan (per scan, cached 30d)
  report:         0,      // assembly only (Claude logged separately)
};

// Claude list prices, USD per 1M tokens: [input, output].
const CLAUDE_PRICES = {
  "claude-opus-4-8":   [5, 25],
  "claude-opus-4-7":   [5, 25],
  "claude-opus-4-6":   [5, 25],
  "claude-sonnet-4-6": [3, 15],
  "claude-haiku-4-5":  [1, 5],
};

export function claudeCostUSD(model, inTok = 0, outTok = 0) {
  const [pi, po] = CLAUDE_PRICES[model] || CLAUDE_PRICES["claude-sonnet-4-6"];
  return (Number(inTok) * pi + Number(outTok) * po) / 1e6;
}

const normDomain = (d) =>
  String(d || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase().trim();

// Append one usage record. Never throws.
export async function logUsage({ domain, api, kind = "api", endpoint = "", costUSD = 0, cached = false, inTok = 0, outTok = 0, model = "" } = {}) {
  try {
    const col = await getCollection("usage_log");
    if (!col) return false;
    await col.insertOne({
      domain: normDomain(domain),
      api: api || "unknown",
      kind,                 // "api" | "claude"
      endpoint,
      cost_usd: Number(costUSD) || 0,
      cached: !!cached,
      in_tokens: Number(inTok) || 0,
      out_tokens: Number(outTok) || 0,
      model: model || null,
      at: new Date(),
    });
    return true;
  } catch (e) {
    console.warn("[usage] logUsage failed (no impact):", e?.message);
    return false;
  }
}

// Aggregate a domain's usage in the last `sinceMs` (default 25 min = one report run).
export async function summarizeUsage({ domain, sinceMs = 25 * 60 * 1000 } = {}) {
  const empty = { totalUSD: 0, claudeUSD: 0, apiUSD: 0, calls: 0, cacheHits: 0, byApi: {}, claudeTokens: { in: 0, out: 0 } };
  try {
    const col = await getCollection("usage_log");
    if (!col || !domain) return empty;
    const since = new Date(Date.now() - sinceMs);
    const rows = await col.find({ domain: normDomain(domain), at: { $gte: since } }).toArray();
    const out = { ...empty, byApi: {}, claudeTokens: { in: 0, out: 0 } };
    for (const r of rows) {
      out.calls += 1;
      if (r.cached) out.cacheHits += 1;
      const c = Number(r.cost_usd) || 0;
      out.totalUSD += c;
      if (r.kind === "claude") { out.claudeUSD += c; out.claudeTokens.in += r.in_tokens || 0; out.claudeTokens.out += r.out_tokens || 0; }
      else out.apiUSD += c;
      const key = r.api || "other";
      out.byApi[key] = (out.byApi[key] || 0) + c;
    }
    out.totalUSD = Math.round(out.totalUSD * 1e4) / 1e4;
    return out;
  } catch (e) {
    console.warn("[usage] summarizeUsage failed:", e?.message);
    return empty;
  }
}

// ── Data-confidence / completeness score, computed from the assembled report ──
// Each key metric is "present" (real value), "estimated", or "missing". Score =
// weighted % of key metrics that are really present. Pure function, no DB.
export function scoreCompleteness(reportData = {}) {
  const bm = reportData.baselineMetrics || {};
  const has = (v) => v != null && v !== "" && !(typeof v === "number" && v === 0);
  const hasArr = (a) => Array.isArray(a) && a.length > 0;

  // [label, present?, weight]
  const checks = [
    ["Domain Authority",      has(bm.domainRating),                          3],
    ["Backlinks",             has(bm.backlinks),                             2],
    ["Referring domains",     has(bm.referringDomains),                      2],
    ["Organic traffic",       has(bm.organicTraffic),                        2],
    ["Organic keywords",      has(bm.organicKeywords),                       2],
    ["PageSpeed / CWV",       !!reportData.psiData,                          2],
    ["Keywords",              hasArr(reportData.keywords),                   3],
    ["Competitors",           hasArr(reportData.competitors),                3],
    ["GMB profile",           !!(reportData.gmbCheck && reportData.gmbCheck.gmb), 2],
    ["Website crawl",         !!reportData.websiteCrawl,                     2],
    ["Keyword gap",           !!reportData.keywordGap,                       2],
    ["GEO / AI visibility",   !!(reportData.doctorFizz?.geo_and_ai_visibility || reportData.doctorFizz?.geo_visibility), 1],
  ];
  const totalW = checks.reduce((s, c) => s + c[2], 0);
  const gotW = checks.reduce((s, c) => s + (c[1] ? c[2] : 0), 0);
  const score = totalW ? Math.round((gotW / totalW) * 100) : 0;
  return {
    score,                                                  // 0–100
    present: checks.filter((c) => c[1]).map((c) => c[0]),
    missing: checks.filter((c) => !c[1]).map((c) => c[0]),
    confidence: score >= 85 ? "high" : score >= 65 ? "medium" : "low",
  };
}
